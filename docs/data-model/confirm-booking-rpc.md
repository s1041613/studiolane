---
type: Business Rule
title: Confirm Booking RPC
description: A database function that confirms one pending rental and cancels its overlapping rivals in one transaction.
tags: [database, rentals, supabase]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T17:30:40Z }
sources:
  - id: init-migration
    resource: https://github.com/s1041613/studiolane/blob/d1006d2e51a0f33076428620477f412f0eeea742/supabase/migrations/0001_init.sql
    title: Initial migration 0001_init.sql
  - id: rental-repository
    resource: https://github.com/s1041613/studiolane/blob/d1006d2e51a0f33076428620477f412f0eeea742/src/server/repositories/rental-repository.ts
    title: RentalRepository source
---

# Overview

`confirm_booking_with_cancellations` is a PL/pgSQL function.[^init-migration]
It takes three arguments.

- `p_rental_id` is the rental to confirm.
- `p_next_status` is its status after confirmation.
- `p_cancellations` is a JSON array. Each item has an `id` and a `note`.

# Behavior

First the function handles each rental to cancel.
That rental must still be `pending`, `awaiting_payment` or `registered`.
If so, its status becomes `cancelled` and its `note` is written.

Then the target rental moves from `pending` to `p_next_status`.

Each update must change exactly one row. Otherwise the function raises an exception.
The whole transaction then rolls back, and no row changes.
So the call fails when someone else changed a row in the meantime.

# Access and caller

Only `service_role` can execute the function.

`RentalRepository.confirmWithCancellations` calls it through the Drizzle `sql` tag.[^rental-repository]
The function's own exceptions use code `P0001`. Their messages are written for people.
The repository turns them into an `ABORTED` refusal. The error boundary classifies any other error.

Back to [Data Model Overview](data-model.md).

[^init-migration]: Initial migration 0001_init.sql
[^rental-repository]: RentalRepository source
