---
type: Feature
title: Creating a Booking
description: "How staff create a booking: the form, server validation, conflict checks against other renters, and the all-or-nothing batch write."
tags: [bookings, validation, conflicts, concurrency]
status: draft
generated: { by: claude-code/claude-sonnet-5, at: 2026-10-31T07:01:39Z }
sources:
  - id: types
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/booking.ts
    title: Booking draft types
  - id: validation
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/booking-validation.ts
    title: Booking validation logic
  - id: sheet
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/booking/booking-sheet.tsx
    title: Booking sheet component
  - id: dialog
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/booking/conflict-confirm-dialog.tsx
    title: Conflict confirm dialog component
  - id: submit-action
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/actions/submit-booking.ts
    title: Submit booking server action
  - id: repo
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/repositories/rental-repository.ts
    title: Rental repository
  - id: migration
    resource: https://github.com/s1041613/studiolane/blob/main/supabase/migrations/0002_create_booking_batch.sql
    title: create_booking_batch migration
  - id: sources-service
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/services/booking-sources.ts
    title: Booking source data loader
---

# Overview

Staff create a booking on the new booking page, at `/bookings/new`.[^sheet]
A booking can cover more than one date. Each date gets its own time slot.[^types]

A booking has a renter, a room, one or more slots, a purpose, and a payment
method.[^types] The renter is either a person already on the roster, or a
customer typed in by name with no roster row at all.[^types]

# Filling in the form

The form asks for the renter, the room, the dates, a time slot for each date,
the purpose, the payment method, and an optional note.[^sheet] The purpose
list depends on the renter's role. The payment field is skipped once the
price comes to zero.[^sheet]

The form checks the draft as the staff member types. A problem shows next to
the field it belongs to, and a banner at the top counts how many problems are
still open.[^sheet]

# Server validation

The server runs the same checks again when the form is submitted, against
rules, roster, prices, and bookings read fresh from the database at that
moment.[^sources-service] A browser cannot be trusted to send a valid draft,
so the server never skips this step.[^submit-action]

The checks cover:[^validation]

- A renter is chosen. A roster renter's name and role come from the roster
  row looked up by id, not from whatever the form sent.
- At least one date is chosen.
- A purpose is chosen, and it is one the renter's role may use.
- A payment method is chosen, unless the price for this booking is zero.
- Each slot has a valid start and end time, and the start is not already in
  the past.
- Each slot fits the room's rental rules.
- Each slot does not overlap a booking the same renter already holds in the
  same room. Fictional example: a renter named Dana already holds Room A on
  a Saturday from 14:00 to 16:00. A new booking for Dana that overlaps that
  time is rejected as a likely duplicate, before any check against other
  renters runs.
- Each slot does not overlap a booking someone else already has `已登記`
  (registered) in the same room. That's the only status that confirms a
  rental, so it is a hard block: the field error names the taken time and
  nothing about the booking is written. A different renter's still-pending
  or awaiting-payment hold on the same time is not checked here — it is a
  conflict, handled by the confirm dialog described below.
- Slots in the same submit do not overlap each other. The later slot gets
  the error.

Every problem found is collected and shown at once, instead of stopping at
the first one.[^validation]

A booking counts as `held` when its status is `待確認` (pending), `待付款`
(awaiting payment), or `已登記` (registered).[^validation] A booking that is
cancelled, completed, or postponed is not held, and never blocks anything.

# Conflict detection

A `待確認` (pending) or `待付款` (awaiting payment) booking in the same room,
from a different renter, that overlaps a submitted slot, is a conflict.
[^migration] A different renter's `已登記` (registered) overlap is not a
conflict — it is the field error described above, a hard block that nothing
can write past. The same renter's own overlap is never a conflict either. It
is caught earlier, as its own plain field error.[^migration]

Conflicts are checked for every slot in the batch, because the batch is
written all or nothing. The same held booking is only listed once, even when
it overlaps more than one submitted slot.[^migration]

# The confirm dialog

When a submit finds a conflict, nothing is written yet. The form shows a
dialog that lists each conflict's date, time, renter name, and status.[^dialog]

The dialog gives the staff member two choices.[^dialog]

- `取消` (cancel) closes the dialog. Nothing was written, and the form stays
  as it was.
- `仍要送出` (submit anyway) resends the booking, this time saying which
  conflicts the staff member has already seen and accepted.

If a new conflict shows up after `仍要送出`, for example because someone else
just booked the same slot, the server reports it the same way.[^submit-action]
The dialog reopens with the new list, and the staff member must accept that
list too before anything is written.

If instead a listed conflict gets registered before `仍要送出` is pressed, the
resend does not reopen the dialog. The database function rechecks that
rival's status inside its lock, finds it now `已登記`, and reports it as the
same hard-block field error described above — accepting the id earlier never
covered this case. The dialog closes, nothing is written, and the time slot
shows the error instead.[^migration][^submit-action]

# Writing the batch

A booking is written through one database function,
`create_booking_batch`.[^migration] It takes every slot's row data and the
list of conflict ids the staff member has already accepted. The repository
calls this function through one `sql` query.[^repo]

The function locks on the room being booked, for the rest of its own
transaction.[^migration] Inside that lock it rechecks for a different
renter's registered rental first; any slot blocked that way is reported as
a field error and nothing is written, regardless of what the caller
accepted. Only once that's clear does it check for still-pending or
awaiting-payment rivals: if any conflict there is unaccepted, the function
writes nothing and returns the full, fresh conflict list.[^migration]
Otherwise it writes every slot in the batch in one transaction. Either all
the slots are written, or none are.[^migration]

# Concurrency guarantee

Because the lock is held for the whole transaction, two submits for the same
room can never both check for conflicts at the same time and both believe
the room is free.[^migration] The second submit waits for the first to
finish, then checks again against whatever the first one actually wrote. A
room's conflict check always sees the true, latest state of that room's
bookings.

The same holds for one renter. If the same renter submits the same slot
twice at once, the second submit finds the first one inside the lock and
gets the same duplicate error as above. Nothing is written for it.[^migration]

Bookings in different rooms never wait on each other. The lock is keyed to
one room at a time.[^migration]

# Success

Once the batch is written, the form shows a notice with the number of
bookings just created, then clears itself for the next one.[^sheet]

# Confirming a booking later

A booking starts out `待確認` (pending). Confirming it is a separate step,
done later by an admin, not covered by this form. Confirming one booking can
cancel other, rival bookings that still overlap it, in the same database
transaction. See
[Confirm Booking RPC](https://github.com/s1041613/studiolane/blob/main/docs/data-model/confirm-booking-rpc.md)
for how that works. This booking form has no way to confirm a booking yet.

# Out of scope

This page only creates bookings. A page that lists past and upcoming
bookings is separate work, not covered here.

[^types]: Booking draft types
[^validation]: Booking validation logic
[^sheet]: Booking sheet component
[^dialog]: Conflict confirm dialog component
[^submit-action]: Submit booking server action
[^repo]: Rental repository
[^migration]: create_booking_batch migration
[^sources-service]: Booking source data loader
