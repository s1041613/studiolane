-- Writes every slot of one BookingDraft as rentals rows, all or nothing,
-- after re-checking for other renters' held rivals inside the room's own
-- advisory lock.
--
-- "Held" = status pending/awaiting_payment/registered, the same set
-- booking-validation.ts calls STILL_HELD. A different renter's REGISTERED
-- overlap is a hard block ('taken' below) — the same rule
-- booking-validation.ts's checkBooking already applies from the data it
-- read before this lock, repeated here in case a rival registered in the
-- meantime. Their still-pending/awaiting-payment overlaps are conflicts
-- ('needs_confirm') the caller may resend past, once shown and
-- acknowledged. Acknowledging an id never clears a 'taken' block: it only
-- answers a 'needs_confirm' conflict, so a conflict that gets registered
-- between being shown and being acknowledged still blocks as 'taken'.
-- The same renter's own overlap is normally caught earlier as a field
-- error by validateBookingDraft, but that check reads existingRentals
-- before this lock is taken, so a second submit from the same renter can
-- race past it; this function rechecks it as 'own_overlap' below.
--
-- The advisory lock is keyed on the room and held for the rest of the
-- transaction (pg_advisory_xact_lock): two concurrent submits for the same
-- room can't both see "nothing held yet" and both insert. The second call
-- blocks here until the first commits or rolls back, then recomputes
-- conflicts against what the first actually left behind.
--
-- p_rows: a jsonb array, one object per slot, sharing room/renter (one
-- BookingDraft always has exactly one of each):
--   {id, batch_id, room, handler, renter_name, renter_id, renter_type,
--    purpose, payment_state, note, payment_method, amount, created_at,
--    starts_at, ends_at}
-- p_acknowledged: rental ids the caller has already shown the person and
-- been told to submit anyway. If any conflict id is missing from this
-- list, nothing is written and the full, freshly-computed conflict list
-- comes back instead.
create function create_booking_batch(p_rows jsonb, p_acknowledged uuid[])
returns jsonb
language plpgsql
as $$
declare
  v_room room;
  v_renter_type renter_type;
  v_renter_id uuid;
  v_renter_name text;
  v_own_overlap_ids jsonb;
  v_taken jsonb;
  v_conflicts jsonb;
  v_has_unacknowledged boolean;
begin
  if jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('status', 'created', 'conflicts', '[]'::jsonb);
  end if;

  -- Rows in the same batch overlapping each other should never reach this
  -- function — booking-validation rejects that in the form and again on
  -- submit — so this is only a backstop against a caller bypassing it.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) with ordinality as a(value, ord)
    join jsonb_array_elements(p_rows) with ordinality as b(value, ord)
      on a.ord < b.ord
    where tstzrange((a.value ->> 'starts_at')::timestamptz, (a.value ->> 'ends_at')::timestamptz, '[)')
        && tstzrange((b.value ->> 'starts_at')::timestamptz, (b.value ->> 'ends_at')::timestamptz, '[)')
  ) then
    raise exception 'create_booking_batch: rows within the same batch overlap';
  end if;

  select (p_rows -> 0 ->> 'room')::room,
         (p_rows -> 0 ->> 'renter_type')::renter_type,
         (p_rows -> 0 ->> 'renter_id')::uuid,
         p_rows -> 0 ->> 'renter_name'
    into v_room, v_renter_type, v_renter_id, v_renter_name;

  -- Keyed on the room: bookings in different rooms never contend.
  perform pg_advisory_xact_lock(hashtext('booking_room_' || v_room::text));

  -- The same renter already holds (or awaits) one of these slots: the form
  -- read existingRentals before this lock was taken, so a concurrent submit
  -- from the same renter can slip past that check. Reported by the new
  -- row's own id, so the caller can put the field error on the right slot;
  -- nothing is written either way.
  select coalesce(jsonb_agg(distinct (slot ->> 'id')::uuid), '[]'::jsonb)
    into v_own_overlap_ids
  from rentals r, jsonb_array_elements(p_rows) as slot
  where r.room = v_room
    and r.status in ('pending', 'awaiting_payment', 'registered')
    and r.renter_type = v_renter_type
    and (
      (v_renter_type = 'roster' and r.renter_id = v_renter_id)
      or (v_renter_type = 'customer' and r.renter_name = v_renter_name)
    )
    and tstzrange(r.starts_at, r.ends_at, '[)')
        && tstzrange((slot ->> 'starts_at')::timestamptz, (slot ->> 'ends_at')::timestamptz, '[)');

  if jsonb_array_length(v_own_overlap_ids) > 0 then
    return jsonb_build_object('status', 'own_overlap', 'own_overlap_ids', v_own_overlap_ids);
  end if;

  -- A different renter's REGISTERED rental overlapping one of this batch's
  -- rows is a hard block, never a confirmable conflict: nothing in
  -- p_acknowledged can clear it. For each blocked new row, report the
  -- earliest-starting registered rival so the caller can word the field
  -- error the same way checkBooking's unavailableReason does.
  select coalesce(
    jsonb_agg(jsonb_build_object('id', t.slot_id, 'starts_at', t.starts_at, 'ends_at', t.ends_at)),
    '[]'::jsonb
  )
    into v_taken
  from (
    select distinct on ((slot ->> 'id'))
      (slot ->> 'id')::uuid as slot_id, r.starts_at, r.ends_at
    from rentals r, jsonb_array_elements(p_rows) as slot
    where r.room = v_room
      and r.status = 'registered'
      and not (
        r.renter_type = v_renter_type
        and (
          (v_renter_type = 'roster' and r.renter_id = v_renter_id)
          or (v_renter_type = 'customer' and r.renter_name = v_renter_name)
        )
      )
      and tstzrange(r.starts_at, r.ends_at, '[)')
          && tstzrange((slot ->> 'starts_at')::timestamptz, (slot ->> 'ends_at')::timestamptz, '[)')
    order by (slot ->> 'id'), r.starts_at
  ) t;

  if jsonb_array_length(v_taken) > 0 then
    return jsonb_build_object('status', 'taken', 'taken', v_taken);
  end if;

  -- Only still-pending/awaiting-payment rivals reach here — a registered
  -- one was already handled above as 'taken'.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'renter_name', c.renter_name, 'status', c.status
    )), '[]'::jsonb),
    coalesce(bool_or(c.id <> all(coalesce(p_acknowledged, array[]::uuid[]))), false)
  into v_conflicts, v_has_unacknowledged
  from (
    select distinct r.id, r.starts_at, r.ends_at, r.renter_name, r.status
    from rentals r, jsonb_array_elements(p_rows) as slot
    where r.room = v_room
      and r.status in ('pending', 'awaiting_payment')
      and not (
        r.renter_type = v_renter_type
        and (
          (v_renter_type = 'roster' and r.renter_id = v_renter_id)
          or (v_renter_type = 'customer' and r.renter_name = v_renter_name)
        )
      )
      and tstzrange(r.starts_at, r.ends_at, '[)')
          && tstzrange((slot ->> 'starts_at')::timestamptz, (slot ->> 'ends_at')::timestamptz, '[)')
  ) c;

  if v_has_unacknowledged then
    return jsonb_build_object('status', 'needs_confirm', 'conflicts', v_conflicts);
  end if;

  insert into rentals (
    id, batch_id, room, handler, renter_name, renter_id, renter_type, purpose,
    payment_state, note, status, payment_method, amount, created_at, updated_at, starts_at, ends_at
  )
  select
    (slot ->> 'id')::uuid,
    (slot ->> 'batch_id')::uuid,
    (slot ->> 'room')::room,
    slot ->> 'handler',
    slot ->> 'renter_name',
    (slot ->> 'renter_id')::uuid,
    (slot ->> 'renter_type')::renter_type,
    (slot ->> 'purpose')::purpose,
    (slot ->> 'payment_state')::payment_state,
    coalesce(slot ->> 'note', ''),
    'pending'::rental_status,
    (slot ->> 'payment_method')::payment_method,
    (slot ->> 'amount')::integer,
    (slot ->> 'created_at')::timestamp,
    (slot ->> 'created_at')::timestamp,
    (slot ->> 'starts_at')::timestamptz,
    (slot ->> 'ends_at')::timestamptz
  from jsonb_array_elements(p_rows) as slot;

  return jsonb_build_object('status', 'created', 'conflicts', '[]'::jsonb);
end;
$$;

revoke execute on function create_booking_batch(jsonb, uuid[]) from public, anon, authenticated;
grant execute on function create_booking_batch(jsonb, uuid[]) to service_role;
