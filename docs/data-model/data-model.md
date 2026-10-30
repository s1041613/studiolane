---
type: Data Model
resource: https://github.com/s1041613/studiolane/blob/d1006d2e51a0f33076428620477f412f0eeea742/supabase/migrations/0001_init.sql
title: Data Model Overview
description: The six Studiolane tables, grouped into rental rules, pricing plans, purposes, roster and rentals.
tags: [database, schema, supabase]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T17:30:40Z }
sources:
  - id: init-migration
    resource: https://github.com/s1041613/studiolane/blob/d1006d2e51a0f33076428620477f412f0eeea742/supabase/migrations/0001_init.sql
    title: Initial migration 0001_init.sql
  - id: seed
    resource: https://github.com/s1041613/studiolane/blob/d1006d2e51a0f33076428620477f412f0eeea742/supabase/seed.sql
    title: Local demo seed seed.sql
  - id: drizzle-schema
    resource: https://github.com/s1041613/studiolane/tree/d1006d2e51a0f33076428620477f412f0eeea742/src/server/drizzle/schema
    title: Drizzle schema folder
  - id: repositories
    resource: https://github.com/s1041613/studiolane/tree/d1006d2e51a0f33076428620477f412f0eeea742/src/server/repositories
    title: Repositories folder
  - id: logic
    resource: https://github.com/s1041613/studiolane/tree/d1006d2e51a0f33076428620477f412f0eeea742/src/server/logic
    title: Domain logic folder
---

# Overview

One migration defines every table.[^init-migration]
`src/server/drizzle/schema` describes the same shape in TypeScript.[^drizzle-schema]
`schema-drift.db.test.ts` fails when the two disagree.

Every table has row level security (RLS) on and no policies.
Only `service_role`, the server, gets table grants. `anon` and `authenticated` get nothing.
A trigger on every table sets `updated_at` on each update.

Rules, plans and people are archived with `archived_at`. They are never deleted.
Purposes are fixed rows. The server can only update them.

# Enums

| Enum | Values |
| --- | --- |
| `room` | `A`, `B` |
| `rule_room` | `A`, `B`, `BOTH` |
| `rule_effect` | `block`, `open` |
| `rule_kind` | `class_hours`, `rental` |
| `role` | `teacher`, `staff`, `customer`, `guest_teacher` |
| `purpose` | `dance`, `private_lesson`, `performance`, `aerobics`, `front_desk`, `workshop`, `photography`, `yoga` |
| `purpose_pricing_mode` | `price`, `discount` |
| `rental_status` | `pending`, `awaiting_payment`, `registered`, `completed`, `postponed`, `cancelled` |
| `renter_type` | `roster`, `customer` |
| `payment_state` | `unpaid`, `paid`, `not_required` |
| `payment_method` | `on_site`, `transfer` |

# Rental rules

The `rental_rules` table holds weekly time slots. A rule blocks a room.
For one date, a rule can also open a slot.

- `weekday` uses ISO numbers. 1 is Monday and 7 is Sunday.
- A rule with `effect = 'open'` needs an `on_date`.
- The weekday of `on_date` must equal `weekday`.
- `end_time` must be later than `start_time`.
- `reason` has 1 to 30 characters after trimming.
- `kind = 'class_hours'` marks the studio's own classes. These rules only block. Their `reason` is always `上課時段` (class hours).

The owner is `RulesRepository` in `rules-repository.ts`.[^repositories]
The logic lives in `booking-rules.ts`, `rental-rules.ts`, `rental-rule-form.ts` and `rule-impact.ts`.[^logic]

# Pricing plans

The `pricing_plans` table holds an hourly rate per room. The columns are `room_a_rate` and `room_b_rate`.
Rates are whole numbers from 0 to 99999.

- Active plan names (`applies_to`) are unique. The check ignores case and outer spaces.
- Exactly one `customer` plan exists. It cannot be archived.

The owner is `PricingRepository`. The logic lives in `pricing.ts`, `pricing-form.ts` and `pricing-list.ts`.

# Purposes and purpose pricing

The `purpose_settings` table has one row per purpose. The key is `purpose`.
`allowed_roles` lists the roles that may book that purpose.
It has at least one value. Only `teacher`, `staff` and `customer` are allowed.
Guest teachers (`guest_teacher`) never rent.

The `purpose_role_pricing` table holds special pricing for one role and one purpose.
The pair `(purpose, role)` is unique. A foreign key points to `purpose_settings`.

- With `mode = 'price'`, `rate_a` and `rate_b` are required, from 0 to 99999. `pay_percent` is null.
- With `mode = 'discount'`, `pay_percent` is required, from 10 to 99. Both rates are null.
- With no row, the renter's own plan applies.

The checks wrap each range test in `coalesce`. The reason is that `null between 0 and 99999` gives null. A check lets null through.

The owner is `PurposeSettingsRepository`.
The logic lives in `purposes.ts`, `purpose-rules.ts`, `purpose-pricing.ts` and `purpose-form.ts`.

# Roster

The `roster` table holds people who rent or teach. People are archived, never deleted.
Old rentals still point at archived people.

- `pricing_plan_id` is required. Its foreign key uses `on delete restrict`.
- `phone` holds digits only. It is 10 digits and starts with `09`.
- `instagram` has 1 to 30 letters, digits, dots or underscores.

The owner is `RosterRepository`. The logic lives in `roster.ts`, `roster-form.ts` and `roster-list.ts`.

# Rentals

One `rentals` row is one time slot in one room. Money is whole dollars.
Slots sent together share a `batch_id`.

- With `renter_type = 'roster'`, `renter_id` is required.
- With `renter_type = 'customer'`, `renter_id` is null. Only the name is kept.
- `ends_at` must be later than `starts_at`.
- `amount` is null or not negative.
- `payment_method` is null exactly when `payment_state` is `not_required`.
- An index on `(room, starts_at)` speeds up slot lookups.

Confirming a booking can cancel overlapping bookings in the same step.
See [Confirm Booking RPC](confirm-booking-rpc.md).

The owner is `RentalRepository`.
The logic lives in `booking.ts`, `bookings.ts`, `booking-validation.ts`, `booking-summary.ts`, `affected-rentals.ts` and `scheduling-range.ts`.

# Seed data

`supabase/seed.sql` holds local demo data.[^seed]
Every name, handle and price in it is invented.
Rental dates are relative to the day of `supabase db reset`.

# Out of scope

This version has no tables and no code for these areas:

- timetable
- substitutions
- song previews
- audit tables
- calendar sync
- roster login

[^init-migration]: Initial migration 0001_init.sql
[^drizzle-schema]: Drizzle schema folder
[^repositories]: Repositories folder
[^logic]: Domain logic folder
[^seed]: Local demo seed seed.sql
