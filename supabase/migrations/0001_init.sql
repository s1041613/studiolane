-- Initial schema: rental rules, pricing plans, purposes, roster and rentals.
-- src/server/drizzle/schema describes the same shape to TypeScript, and
-- schema-drift.db.test.ts fails when the two disagree.
--
-- Access model: every table has row level security on and no policies, and
-- only service_role (the server) gets table grants. anon and authenticated
-- get nothing.

-- ---------------------------------------------------------------- enums

create type payment_method as enum ('on_site', 'transfer');
create type payment_state as enum ('unpaid', 'paid', 'not_required');
create type purpose as enum (
  'dance', 'private_lesson', 'performance', 'aerobics',
  'front_desk', 'workshop', 'photography', 'yoga'
);
create type rental_status as enum (
  'pending', 'awaiting_payment', 'registered', 'completed', 'postponed', 'cancelled'
);
create type renter_type as enum ('roster', 'customer');
create type role as enum ('teacher', 'staff', 'customer', 'guest_teacher');
create type room as enum ('A', 'B');
create type rule_effect as enum ('block', 'open');
create type rule_kind as enum ('class_hours', 'rental');
create type rule_room as enum ('A', 'B', 'BOTH');
create type purpose_pricing_mode as enum ('price', 'discount');

-- ---------------------------------------------------------------- updated_at

-- Every table stamps updated_at on update, so no writer can leave it stale.
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- rental rules

-- Weekly time slots that block (or, for one date, open) a room. kind
-- class_hours marks the studio's own class slots; they only ever block.
create table rental_rules (
  id uuid primary key default gen_random_uuid(),
  room rule_room not null,
  weekday integer not null,
  start_time time not null,
  end_time time not null,
  reason text not null,
  on_date date,
  effect rule_effect not null default 'block',
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text,
  kind rule_kind not null default 'rental',
  -- ISO weekday: 1 = Monday, 7 = Sunday.
  constraint rental_rules_weekday_range check (weekday between 1 and 7),
  -- Opening a slot only makes sense for a specific date.
  constraint rental_rules_open_needs_date check (effect = 'block' or on_date is not null),
  constraint rental_rules_ends_after_starts check (end_time > start_time),
  constraint rental_rules_on_date_weekday check (on_date is null or extract(isodow from on_date) = weekday),
  constraint rental_rules_reason_length check (length(btrim(reason)) between 1 and 30),
  constraint rental_rules_class_hours_block check (kind = 'rental' or effect = 'block'),
  constraint rental_rules_class_hours_reason check (kind = 'rental' or reason = '上課時段')
);

create index rental_rules_active_idx on rental_rules (kind, room, weekday) where archived_at is null;

create trigger rental_rules_set_updated_at
  before update on rental_rules
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- pricing

-- Hourly rates per room. Plans are archived, never deleted; exactly one
-- customer plan exists and it stays active.
create table pricing_plans (
  id uuid primary key default gen_random_uuid(),
  role role not null,
  applies_to text not null,
  room_a_rate integer not null default 0,
  room_b_rate integer not null default 0,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint pricing_plans_rates_non_negative check (room_a_rate >= 0 and room_b_rate >= 0),
  constraint pricing_plans_rates_upper check (room_a_rate <= 99999 and room_b_rate <= 99999),
  constraint pricing_plans_customer_active check (role <> 'customer' or archived_at is null)
);

create unique index pricing_plans_active_name on pricing_plans (lower(btrim(applies_to))) where archived_at is null;
create unique index pricing_plans_one_customer on pricing_plans (role) where role = 'customer';

create trigger pricing_plans_set_updated_at
  before update on pricing_plans
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- purposes

-- One fixed row per purpose: which roles may book it. Rows are archived,
-- never deleted. Guest teachers never rent.
create table purpose_settings (
  purpose purpose primary key,
  allowed_roles role[] not null,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint purpose_settings_allowed_roles check (
    cardinality(allowed_roles) > 0
    and allowed_roles <@ array['teacher', 'staff', 'customer']::role[]
  )
);

create trigger purpose_settings_set_updated_at
  before update on purpose_settings
  for each row execute function set_updated_at();

-- A role's special pricing for a purpose: a fixed rate pair (price) or a
-- share of the renter's own plan (discount). No row means the renter's plan
-- applies. (purpose, role) is the identity; id is a single-column key for
-- audited updates. The coalesce matters: `null between 0 and 99999` is null,
-- which a check would let through.
create table purpose_role_pricing (
  id uuid primary key default gen_random_uuid(),
  purpose purpose not null,
  role role not null,
  mode purpose_pricing_mode not null,
  rate_a integer,
  rate_b integer,
  pay_percent integer,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint purpose_role_pricing_purpose_role unique (purpose, role),
  constraint purpose_role_pricing_purpose_purpose_settings_purpose_fk
    foreign key (purpose) references purpose_settings (purpose),
  constraint purpose_role_pricing_role check (role = any (array['teacher', 'staff', 'customer']::role[])),
  constraint purpose_role_pricing_price check (
    mode <> 'price'
    or (coalesce(rate_a between 0 and 99999 and rate_b between 0 and 99999, false) and pay_percent is null)
  ),
  constraint purpose_role_pricing_discount check (
    mode <> 'discount'
    or (coalesce(pay_percent between 10 and 99, false) and rate_a is null and rate_b is null)
  )
);

create trigger purpose_role_pricing_set_updated_at
  before update on purpose_role_pricing
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- roster

-- People who rent or teach. Archived, never deleted: rentals keep pointing
-- at archived people. Phones are stored as digits only.
create table roster (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  role role not null,
  pricing_plan_id uuid not null,
  instagram text,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint roster_pricing_plan_id_fkey
    foreign key (pricing_plan_id) references pricing_plans (id) on delete restrict,
  constraint roster_instagram_handle check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  constraint roster_phone_mobile check (phone is null or phone ~ '^09[0-9]{8}$')
);

create trigger roster_set_updated_at
  before update on roster
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- rentals

-- One booked time slot in one room. A roster renter links to the roster; a
-- walk-in customer only has a name. Money is whole dollars.
create table rentals (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  room room not null,
  handler text,
  renter_name text not null,
  renter_id uuid,
  purpose purpose not null,
  payment_state payment_state not null default 'unpaid',
  note text default '',
  status rental_status not null default 'pending',
  payment_method payment_method,
  amount integer,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  updated_by text,
  renter_type renter_type not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  constraint rentals_renter_id_fkey foreign key (renter_id) references roster (id),
  constraint rentals_renter_type_matches_renter_id check (
    (renter_type = 'roster' and renter_id is not null)
    or (renter_type = 'customer' and renter_id is null)
  ),
  constraint rentals_amount_non_negative check (amount is null or amount >= 0),
  constraint rentals_ends_after_starts check (ends_at > starts_at),
  -- No payment method exactly when no payment is needed.
  constraint rentals_payment_method_matches_state check ((payment_method is null) = (payment_state = 'not_required'))
);

create index rentals_room_starts_at_idx on rentals (room, starts_at);

create trigger rentals_set_updated_at
  before update on rentals
  for each row execute function set_updated_at();

-- Confirms one pending booking and cancels its overlapping rivals in a single
-- transaction: any raised exception rolls back every update. Each update
-- re-checks the row is still in the state the caller saw, so a rental changed
-- by someone else in the meantime aborts the whole call.
create function confirm_booking_with_cancellations(
  p_rental_id uuid,
  p_next_status rental_status,
  p_cancellations jsonb -- [{ "id": uuid, "note": text }, ...]
) returns void
language plpgsql
as $$
declare
  cancellation jsonb;
  updated integer;
begin
  for cancellation in select * from jsonb_array_elements(p_cancellations)
  loop
    update rentals
      set status = 'cancelled', note = cancellation ->> 'note'
      where id = (cancellation ->> 'id')::uuid
        and status in ('pending', 'awaiting_payment', 'registered');
    get diagnostics updated = row_count;
    if updated <> 1 then
      raise exception '撞單名單裡有預約的狀態已經變了，請重新整理後再確認';
    end if;
  end loop;

  update rentals
    set status = p_next_status
    where id = p_rental_id and status = 'pending';
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception '這筆預約的狀態已經變了，請重新整理後再確認';
  end if;
end;
$$;

-- ---------------------------------------------------------------- access

alter table rental_rules enable row level security;
alter table pricing_plans enable row level security;
alter table purpose_settings enable row level security;
alter table purpose_role_pricing enable row level security;
alter table roster enable row level security;
alter table rentals enable row level security;

-- Supabase grants new tables to anon, authenticated and service_role by
-- default, so start from nothing and grant back only what the app needs.
-- Rules, plans and people are archived, never deleted; purposes are fixed rows.
revoke all on rental_rules, pricing_plans, purpose_settings, purpose_role_pricing, roster, rentals
  from anon, authenticated, service_role;
grant select, insert, update on rental_rules, pricing_plans, roster to service_role;
grant select, update on purpose_settings to service_role;
grant select, insert, update, delete on purpose_role_pricing, rentals to service_role;

revoke execute on function confirm_booking_with_cancellations(uuid, rental_status, jsonb)
  from public, anon, authenticated;
grant execute on function confirm_booking_with_cancellations(uuid, rental_status, jsonb) to service_role;
