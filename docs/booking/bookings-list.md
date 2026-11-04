---
type: Feature
title: Bookings List
description: "The /bookings page: every booking, filtered and sorted, with its status, a conflict mark, and row actions to confirm, pay, complete, postpone, or cancel it."
tags: [bookings, list, filters, conflicts, actions]
status: draft
generated: { by: claude-code/claude-sonnet-5, at: 2026-11-03T09:30:45Z }
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
  - id: filters
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/booking-filters.tsx
    title: Booking filters component
  - id: row-actions
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/booking-actions.tsx
    title: Booking row actions component
  - id: actions
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/actions/bookings.ts
    title: Booking status-change server actions
  - id: repo
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/repositories/rental-repository.ts
    title: Rental repository
---

# Overview

The bookings list at `/bookings` shows bookings from the database, narrowed
by the filter bar described below.[^page] Staff use it to check that a
booking made on [the new booking page](booking.md) was saved as expected,
and to move a booking through its statuses with the row actions described
below.[^row-actions]

The page reads the rentals fresh on every request.[^page] If the read fails,
the column heads stay and a short failure message with an error code takes
the place of the rows.[^view] If no booking matches the current filters —
including when there are no bookings at all — the page says
沒有符合條件的預約 (no booking matches the filters) instead of showing an
empty table.[^view]

# What each row shows

Each row shows the renter, the date, the time slot, the room and purpose,
the status, the payment method, the payment state, the amount, and its row
actions.[^table] A customer who is not on the roster is marked 外部客戶.
A slot that ends after midnight is marked 跨日.[^table]

Rows are sorted by status first — `待確認`, `待付款`, `已登記`, `已完成`,
`延期`, then `已取消` — then by date, then by start time, oldest first
within a status.[^sort] The list shows 20 rows per page.[^table]

# Statuses and conflicts

The status column shows the label for each status, so 待確認, 待付款, and
已登記 never look the same.[^table]

Only 已登記 counts as a confirmed rental. Another renter's 已登記 booking
blocks the slot outright, so it can never overlap a new one.[^conflict]
A 待確認 or 待付款 booking can overlap another one in the same room when
staff pressed 仍要送出 in the conflict dialog. Each such row gets a line
撞單 · 第 N 位 under the renter's name. N is the row's place among the
overlapping bookings, ordered by when they were made.[^conflict]

# Filters

A filter bar above the table offers a search box (renter name or rental ID,
case-insensitive, trimmed), a payment method, a multi-select for status, and
a date range.[^filters][^sort] Every edit is a draft; nothing applies until
staff press 查詢 (search).[^filters] Ticking every status, or none, both
read as 全部狀態 (every status) in the status field.[^filters]

The list defaults to `待確認` (pending confirmation) only, any date.[^sort]
A `day` passed in the URL, as `/bookings?day=<date>`, instead opens every
status for that one day.[^sort] Either way, the
filters live only in the page's own state: the URL drops back to plain
`/bookings` once the page loads, and a reload starts from the default
again.[^view]

Applying a new set of filters resets the list back to page 1. Refreshing
the same filters after an action — confirming a booking, for example —
keeps whatever page staff were on.[^view] Filtering never changes the
conflict count: 撞單 · 第 N 位 is still ranked against every booking, not
just the ones the current filters match.[^view]

# Row actions

The last column, `操作` (actions), offers one of five buttons, decided by
one shared rule (`allowedActions`) that the server checks again on every
click.[^sort][^actions] The five are `確認` (confirm), `標記已付款` (mark
as paid), `標記完成` (mark as done), `延期` (postpone), and `取消`
(cancel). A row with no button left — `已完成` (completed), `已延期`
(postponed), or `已取消` (cancelled) — shows an empty cell.[^row-actions]

| Status | Buttons shown |
|---|---|
| `待確認` (pending confirmation) | `確認`, plus `延期`/`取消` in a ⋯ menu |
| `待付款` (awaiting payment) | `標記已付款`, plus `延期`/`取消` |
| `已登記` (registered), unpaid | `標記已付款`, plus `延期`/`取消` |
| `已登記` (registered), paid | `標記完成`, plus `延期`/`取消` |
| `已完成`, `已延期`, `已取消` | none |

`確認` moves a `待確認` booking on: a transfer-pay booking goes to
`待付款`, an on-site or free booking goes straight to `已登記`.[^actions]
If another booking in the same room still holds or is about to hold that
time slot, `確認` is refused instead. A notice lists the slot's rivals so
staff can cancel or postpone them first, from their own rows, then confirm
this one again.[^actions] `標記已付款` and `標記完成` write just that one
change.[^actions]

`延期` and `取消` both ask for confirmation first and release the slot
right away.[^row-actions] If the booking was already paid, the
confirmation warns that it needs a refund and marks the booking's note
with `【需要退款】` (needs a refund) so staff can follow up by hand; the
payment state itself stays `已付款` (paid).[^actions]

Every action re-reads the booking from the database before writing, so a
stale page or two staff acting on the same row at once can't leave it in
an inconsistent state: whichever write loses that race is refused and told
to refresh.[^repo] Any other refusal — the status no longer allows the
action, or a rule now blocks the slot — shows as a short notice with no
way to retry from inside it.[^actions]

# Out of scope

The home page has no 今日租借 ↗ link yet to send staff to `/bookings?day=`
for a given day; the list already supports the parameter, but nothing in
the UI links to it so far. Confirming a booking that has overlapping
rivals never offers to cancel them for you; that is a separate, later
feature.[^actions]

[^page]: Bookings list page
[^view]: Bookings view component
[^table]: Booking table component
[^sort]: Booking list logic
[^conflict]: Conflict ranking
[^filters]: Booking filters component
[^row-actions]: Booking row actions component
[^actions]: Booking status-change server actions
[^repo]: Rental repository
