---
type: Feature
title: Bookings List
description: "The read-only /bookings page: every booking, newest date first, with its status and a mark on overlapping bookings that still wait for review."
tags: [bookings, list, conflicts]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-31T10:15:20Z }
sources:
  - id: page
    resource: https://github.com/s1041613/studiolane/blob/main/src/app/bookings/page.tsx
    title: Bookings list page
  - id: view
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/bookings-view.tsx
    title: Bookings view component
  - id: table
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/booking-table.tsx
    title: Booking table component
  - id: sort
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/bookings.ts
    title: Booking list logic
  - id: conflict
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/home-selectors.ts
    title: Conflict ranking
---

# Overview

The bookings list at `/bookings` shows every booking in the database.[^page]
It is read-only. It has no filters and no edit, cancel, or confirm
buttons.[^table] Staff use it to check that a booking made on
[the new booking page](booking.md) was saved as expected.

The page reads the rentals fresh on every request.[^page] If the read fails,
the column heads stay and a short failure message with an error code takes
the place of the rows.[^view] If there are no bookings yet, the page says
目前沒有預約 instead of showing an empty table.[^view]

# What each row shows

Each row shows the renter, the date, the time slot, the room and purpose,
the status, the payment method, the payment state, and the amount.[^table]
A customer who is not on the roster is marked 外部客戶. A slot that ends
after midnight is marked 跨日.[^table]

Rows are sorted by date, newest first. Ties are broken by start time and
then by when the booking was made, both newest first.[^sort] The list shows
20 rows per page.[^table]

# Statuses and conflicts

The status column shows the label for each status, so 待確認, 待付款, and
已登記 never look the same.[^table]

Only 已登記 counts as a confirmed rental. Another renter's 已登記 booking
blocks the slot outright, so it can never overlap a new one.[^conflict]
A 待確認 or 待付款 booking can overlap another one in the same room when
staff pressed 仍要送出 in the conflict dialog. Each such row gets a line
撞單 · 第 N 位 under the renter's name. N is the row's place among the
overlapping bookings, ordered by when they were made.[^conflict]

# Out of scope

Filters, editing, cancelling, admin confirmation, and the batch detail page
are not part of this page yet.

[^page]: Bookings list page
[^view]: Bookings view component
[^table]: Booking table component
[^sort]: Booking list logic
[^conflict]: Conflict ranking
