---
type: Feature
title: Rental Time Rules
description: Weekly and one-day rules that block or open room time for rentals, enforced on the settings page and on every booking.
tags: [rules, scheduling, settings, bookings, validation]
status: draft
generated: { by: claude-code/claude-sonnet-5, at: 2026-10-30T19:43:03Z }
sources:
  - id: rules-page
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/app/settings/rules/page.tsx
    title: Rules page source
  - id: board
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/components/rental-rules/rental-rules-board.tsx
    title: Rental rules board component
  - id: dialog
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/components/shared/rules/rental-rule-dialog.tsx
    title: Rental rule dialog component
  - id: toggle
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/components/shared/rules/rule-toggle.tsx
    title: Rule toggle component
  - id: actions
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/actions/rental-rules.ts
    title: Rental rules server actions
  - id: writes
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/services/rule-writes.ts
    title: Rule write service
  - id: schema
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/logic/rule-draft-schema.ts
    title: Rule draft schema
  - id: form
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/logic/rental-rule-form.ts
    title: Rental rule form logic
  - id: view-logic
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/logic/rental-rules.ts
    title: Rental rules view logic
  - id: impact
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/logic/rule-impact.ts
    title: Rule impact logic
  - id: booking-rules
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/logic/booking-rules.ts
    title: Booking rules logic
  - id: repo
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/src/server/repositories/rules-repository.ts
    title: Rules repository
  - id: migration
    resource: https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/supabase/migrations/0001_init.sql
    title: Initial migration 0001_init.sql
---

# Overview

The rental rules page lets staff block or open room time for rentals.[^rules-page]
It lives at `/settings/rules`. Everyone signed in can read the rules. Only staff
with edit access to this page can change them.[^rules-page]

The data behind this page is the `rental_rules` table. See
[Data Model Overview](https://github.com/s1041613/studiolane/blob/56bd162d683ece705641818de4c7ed8244b5b3b7/docs/data-model/data-model.md)
for the full table shape.

A rule row has a `kind`: `rental` or `class_hours`.[^booking-rules] This page only
shows `rental` rows. `class_hours` rows mark the studio's own classes. They have
their own settings page, not built yet.[^board]

# Weekly rules and one-day rules

A rule applies either every week or on one date.[^form]

- A weekly rule picks one or more weekdays. ISO weekday numbers are used: 1 is
  Monday and 7 is Sunday.[^view-logic]
- A one-day rule picks one date. The date's weekday must match the rule's
  `weekday` column. The database checks this.[^migration]

Staff can add a weekly rule for several weekdays at once. Each weekday becomes
its own database row, saved together in one request.[^form][^repo] Editing a
weekly rule always edits one weekday at a time.[^dialog]

# Block and open effects

A rule either `block`s or `open`s a room.[^booking-rules]

- `block` marks time that cannot be rented.
- `open` only exists for one date. It lifts a weekly block for that date
  only.[^booking-rules]

A weekly rule can only use `block`. Only a one-day rule can use `open`.[^form]
The week view splits a weekly block into the part still blocked and the part
an `open` rule lifts that day. The lifted part is shown faded and struck
through.[^board]

`getAvailableWindows` computes the time still open on a room and date: the
weekly blocks, minus that date's opens, plus that date's own one-day blocks,
plus any already-registered booking on that room and date.[^booking-rules] The
booking form and this page's impact checks both call this function, so they
agree on what counts as free time.

# Managing rules on the page

The page shows a week view and a list view.[^board] The week view is a
timeline with a legend: `不能租` (cannot rent), `可租` (can rent), and `只有某一天`
(one day only).[^board] The list view is a table, one row per weekday or date,
with `編輯` (edit) and `停用`/`啟用` (deactivate/reactivate) actions on each
row.[^board]

A dialog creates or edits one rule.[^dialog] Its fields are:

- `教室` (room): room A, room B, or both.
- `時間` (mode): `每週` (weekly) or `指定日期` (one date).
- `星期` (weekdays, weekly mode) or `日期` (date, one-day mode).
- `租借` (effect, one-day mode only): `不可租` (block) or `可租` (open). A
  weekly rule is always block.
- `開始`/`結束` (start and end time).
- `原因` (reason): shown in the booking form's error message when a renter's
  chosen time hits this rule.[^dialog]

Switching between weekly and one-day mode clears the fields the other mode
does not use.[^form]

# Validation

Three checks run on a draft, in order:[^dialog][^schema][^form]

1. The server action's `parseRuleDraft` checks the draft's shape with a zod
   schema. This runs first and never throws, so a malformed request, for
   example from a stale client after a deploy, always comes back as field
   errors the dialog already knows how to show.[^schema]
2. `validateRuleDraft` checks the business rules: a room is chosen, a weekday
   or date is chosen, the time range is valid, and, for a `rental` rule, the
   reason is 1 to 30 characters after trimming. A weekly rule may not use the
   `open` effect, and neither may a `class_hours` rule.[^form]
3. The write itself checks for duplicates: an active rule with the same room,
   weekday or date, time, and effect must not already exist. Rows saved
   together in one request must also differ from each other.[^writes][^form]

The dialog runs the same checks as the draft is typed, so field errors show
before the staff member clicks `儲存` (save).[^dialog] The server runs the same
checks again. A client cannot be trusted to send a valid draft.[^schema]

# Impact on existing bookings

A rule change must never leave an already-made booking (`待確認`, `待付款`, or
`已登記`, not yet started) in time that can no longer be rented. This applies to
creating, editing, archiving, and reactivating a rule.[^impact][^writes]

`rentalsBrokenBy` compares the rule list before and after a change. A booking
counts as broken when the change makes it fail the same check the booking form
uses, and the booking was not already broken by something else, such as
another booking.[^impact]

- Saving a create or edit checks this before the write happens. If a booking
  would break, the write is refused and the dialog lists the bookings that
  would break, asking staff to move or cancel them first.[^writes][^dialog]
- The dialog previews this impact as the staff member types, so the list can
  show up before `儲存` is even pressed. A failed preview does not block
  saving; saving checks again for real.[^dialog]
- Archiving or reactivating a rule runs the same kind of check first. If
  bookings would break, a notice lists them with only a `確定` (confirm)
  button, instead of the usual confirmation dialog.[^toggle]

# Read-only mode

When a staff member cannot edit this page, the page hides every add, edit,
archive, and reactivate control and shows a read-only notice instead.[^rules-page][^board]
The server refuses a write from that staff member anyway, so the hidden
controls are a convenience, not the only guard.[^actions]

[^rules-page]: Rules page source
[^board]: Rental rules board component
[^dialog]: Rental rule dialog component
[^toggle]: Rule toggle component
[^actions]: Rental rules server actions
[^writes]: Rule write service
[^schema]: Rule draft schema
[^form]: Rental rule form logic
[^view-logic]: Rental rules view logic
[^impact]: Rule impact logic
[^booking-rules]: Booking rules logic
[^repo]: Rules repository
[^migration]: Initial migration 0001_init.sql
