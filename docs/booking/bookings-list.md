---
type: Feature
title: Bookings List
description: "The /bookings page: a bookings shelf with sidebar folders, a row's status menu, and a draggable info panel."
tags: [bookings, list, conflicts, actions]
status: draft
generated: { by: claude-code/claude-sonnet-5, at: 2026-11-04T09:30:55Z }
sources:
  - id: page
    resource: https://github.com/s1041613/studiolane/blob/main/src/app/bookings/page.tsx
    title: Bookings list page
  - id: view
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/bookings-view.tsx
    title: Bookings view component
  - id: shelf
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/bookings-shelf.tsx
    title: Bookings shelf component
  - id: shelf-logic
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/shelf.ts
    title: Bookings shelf logic
  - id: sort
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/bookings.ts
    title: Booking list logic
  - id: conflict
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/logic/home-selectors.ts
    title: Conflict ranking
  - id: codecs
    resource: https://github.com/s1041613/studiolane/blob/main/src/server/supabase/codecs.ts
    title: Status, room, and payment label codecs
  - id: search
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/bookings/booking-search.tsx
    title: Booking search component
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

The bookings list at `/bookings` opens as a `預約冊` (bookings shelf) window
inside the desktop shell: a sidebar of folders next to a grid of
rows.[^page][^shelf] It's built from the shared `Window`, `Menu`, `Tooltip`,
`SidebarList`, and `InfoPanel` primitives, documented in the design-system
bundle's "Shared UI Primitives and App Shell" concept.

Staff use it to check that a booking made on [the new booking page](booking.md)
was saved as expected, and to move a booking through its statuses with the
row's `狀態` (status) menu described below.[^row-actions]

The page reads the rentals fresh on every request.[^page] If the read fails,
a short failure message with an error code takes the place of the shelf.[^view]
If there are no bookings yet, the grid says `目前沒有預約` (no bookings yet)
instead of showing an empty grid.[^shelf]

# Sidebar folders

The sidebar has three sections, each a facet of the filter: `預約` (period),
`教室` (room), and `狀態` (status).[^shelf-logic] A row shows only when it
matches all three facets at once.[^shelf-logic]

| Section | Folders | How many can be selected |
|---|---|---|
| `預約` | `今天` (today), `本週` (this week, Monday through Sunday), `全部` (all) | exactly one; `全部` by default |
| `教室` | `大教室` (room A), `小教室` (room B) | at most one, or every room |
| `狀態` | the six statuses, with `撞單` (clash) right after `待確認` | at most one, or every status |

`預約` always has one folder selected, so clicking another one just replaces
it. `教室` and `狀態` start with no folder selected (every room, every
status); clicking a folder selects it, and clicking the already-selected one
clears it back to "every value."[^shelf-logic]

Each folder shows a count, and that count is itself faceted: it's how many
rows would show if that folder were selected, with the other two facets left
exactly as they are now. So a `狀態` folder's count follows whichever `教室`
and `預約` are currently picked, and changing either one updates every
`狀態` count.[^shelf-logic]

`今天` and `本週` only count a booking while it still holds its slot: a
`已延期` (postponed) or `已取消` (cancelled) booking is excluded even if its
date falls in that range. `全部` has no such exclusion.[^shelf-logic] A
booking that crosses midnight counts on both calendar days it
touches.[^shelf-logic]

The `撞單` folder shows every booking that currently overlaps another one in
the same room — the same rule described in [Statuses and conflicts](#statuses-and-conflicts)
below.[^shelf-logic] Its count is the only one shown in red, and only once
it's above zero; the rest are quiet.[^shelf]

# What each row shows

Each row shows the date, the time slot, the renter, the room, the purpose,
the status, the payment state, and the amount.[^shelf] The date shows only
month/day (for example `11/6`), with no weekday.[^shelf] A customer who is
not on the roster is marked `外部客戶` under their name. A slot that ends
after midnight is marked `跨日`.[^shelf] The room shows as `大教室` or
`小教室`, never the bare letter; the payment state shows `已付款` for a
paid booking or the matching label otherwise (`未付款`,
`無需付款`).[^codecs]

Rows are sorted by date, newest first, within the current filter. Ties are
broken by start time and then by when the booking was made, both newest
first.[^sort][^shelf-logic] A search box above the grid filters further by
renter name or rental ID, on top of the current filter.[^search][^shelf-logic]

# Statuses and conflicts

Only `已登記` (registered) counts as a confirmed rental. Another renter's
`已登記` booking blocks the slot outright, so it can never overlap a new
one.[^conflict] A `待確認` or `待付款` booking can overlap another one in
the same room when staff pressed `仍要送出` in the conflict dialog.[^conflict]

Each clashing row shows a red `撞單` mark right after its date.[^shelf]
Hovering it (or focusing it, on a device with no hover) shows a tooltip
after about 450ms naming the earliest-made overlapping rival, for example
`撞 11/6 15:00 某某`.[^shelf-logic] A clash is never shown with a dot or an
icon in front of the row.[^shelf]

# The `狀態` (status) menu

The status column is plain text at rest, matching every other column.[^row-actions]
Hovering the row, selecting it, or opening its menu turns the text blue
with a small `⌄`.[^row-actions] Clicking it, or right-clicking anywhere on
the row, opens a menu listing only the actions `allowedActions` currently
permits for that booking — the same rule the server re-checks on every
click.[^row-actions][^sort] A row with no actions left (`已完成`,
`已延期`, or `已取消`) shows its label as plain text with no menu and no
`⌄`.[^row-actions]

| Status | Menu items |
|---|---|
| `待確認` (pending confirmation) | `確認`, `延期…`, `取消…` |
| `待付款` (awaiting payment) | `標記已付款`, `延期…`, `取消…` |
| `已登記` (registered), unpaid | `標記已付款`, `延期…`, `取消…` |
| `已登記` (registered), paid | `標記完成`, `延期…`, `取消…` |
| `已完成`, `已延期`, `已取消` | no menu |

`確認` moves a `待確認` booking on: a transfer-pay booking goes to
`待付款`, an on-site or free booking goes straight to `已登記`.[^actions]
`標記已付款` and `標記完成` write just that one change.[^actions]

On a clashing row, `確認` still runs first. If the server finds rivals
still holding the slot (`待確認`, `待付款`, or `已登記` in the same room,
overlapping), it refuses the write and reports them instead, and a dialog
opens listing this booking with its rivals, oldest submission
first — the one being kept marked, the rest marked to be cancelled, each
line like `11/6 15:00–16:00 某某`.[^actions][^row-actions] A rival that was
already paid shows the same refund warning that `延期…`/`取消…` use. The
dialog
has two buttons, `返回` and `確認並取消其他`.[^row-actions] Confirming sends
back the exact rival list shown; the server re-checks it against a fresh
read and, if it still matches, confirms this booking and cancels every
rival in one write, each rival's note gaining `【需要退款】` when it was
paid.[^actions][^repo] If someone else changed the room in between, the
dialog stays open with the same "please refresh" refusal a lost write
elsewhere in this menu uses.[^actions]

`延期…` and `取消…` both ask for confirmation first and release the slot
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

# Info panel

Double-clicking a row, or pressing Enter while it's selected, opens a
floating info panel for that booking, draggable by its title strip and
closable with its own `✕`.[^shelf] It shows `狀態` (with the rival text
when the row clashes), `租借人` (`名冊` for a roster renter, `外部客戶`
otherwise), `用途`, `付款`, `金額`, and `備註` (`—` when empty).[^shelf]

# Search

A search box above the shelf filters the current filter's rows by renter
name or rental ID. It matches part of the text, ignores case, and trims
spaces.[^search][^sort] The query lives in the URL as `?q=`, submitted
through a GET form so it's shareable and works without JavaScript.[^page][^search]
Submitting an empty box clears the filter; a `清除` link next to the box,
shown only once a query is applied, clears it by going back to
`/bookings`.[^search]

Filtering never changes a folder's own count or the `撞單` ranking: both
are computed against every booking, not just the ones the current query
matches.[^shelf][^shelf-logic] A query with no matches shows
`找不到符合的預約` instead of the grid; `目前沒有預約` still wins when there
are no bookings at all, regardless of the query.[^shelf]

# Keyboard

The grid takes a single tab stop. Arrow up/down moves the row selection;
Enter on a selected row opens its info panel; Escape closes an open status
menu first, then the info panel.[^shelf]

# Out of scope

The sidebar's `教室` and `狀態` facets cover room and status filtering,
and `預約` covers today/this-week/all, but there is still no custom date
range and no payment-method or payment-state filter.[^shelf-logic]

[^page]: Bookings list page
[^view]: Bookings view component
[^shelf]: Bookings shelf component
[^shelf-logic]: Bookings shelf logic
[^sort]: Booking list logic
[^conflict]: Conflict ranking
[^codecs]: Status, room, and payment label codecs
[^search]: Booking search component
[^row-actions]: Booking row actions component
[^actions]: Booking status-change server actions
[^repo]: Rental repository
