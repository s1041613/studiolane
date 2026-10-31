# studiolane

Public, from-scratch rebuild of a private studio booking app's foundation.
Every name, slot, and booking in this repo and in the hosted demo is
fictional.

This repo is at the skeleton stage. It has a rental rules settings page
(`/settings/rules`), a new booking page (`/bookings/new`), the data layer
behind both (migrations, seed data, Drizzle schema, repositories), and
shared error screens. Auth is a stub: it always signs you in as a demo
admin with full edit access, so there is no real login yet. See
[docs/data-model/](docs/data-model/index.md),
[docs/rental-time-rules/](docs/rental-time-rules/index.md),
[docs/booking/](docs/booking/index.md), and
[docs/design-system/](docs/design-system/index.md) for how each part works.

## 10-minute demo

Production URL: https://studiolane.vercel.app

The hosted database is on Supabase's free tier and pauses after a period of
inactivity. The first load after a pause can fail or come back slowly.
Reload the page or wait a minute, then try again.

The hosted database only has the schema applied to it. `supabase/seed.sql`
is not run against it; that file only loads in local development. Demo data
in production is entered by hand by the maintainer. If a page looks empty,
that data was cleared. Run `supabase start` locally to load
`supabase/seed.sql` and get a full fictional data set.

Steps below are about 10 minutes total, once the site is awake.

1. **`/settings/rules`, about 2 minutes.** Click `新增` (add) and create a
   weekly rule: pick a room, pick `每週` (weekly), pick one or more
   weekdays, set a start and end time, and write a reason, then `儲存`
   (save). There is no hard delete, only deactivate and reactivate: click
   `停用` (deactivate) on the row, confirm in the dialog that opens, then
   click `啟用` (reactivate) and confirm again to bring it back. Click `編輯` (edit), change
   the reason or time, and `儲存` again. Leave the rule active (enabled)
   when you move on, since step 5 depends on it.
2. **`/bookings/new`, about 3 minutes.** Pick an existing renter from the
   roster, a room, a date, and a time slot, then a purpose and a payment
   method, and submit. The page stays on the form and shows a `預約已送出`
   (booking submitted) notice with the count of bookings just written.
   Click `確定` (OK) to clear the notice; the form resets for a new
   booking. Note the exact room, date, and time you used, since the next
   two steps reuse them.
3. **Same slot, different renter, about 2 minutes.** Still on
   `/bookings/new`, pick a different renter and submit the same room,
   date, and time as step 2. A `這個時段已有其他預約` (this slot already
   has another booking) dialog lists the conflict. Click `取消` (cancel):
   nothing is written and the form stays as it was. Submit again and this
   time click `仍要送出` (submit anyway): the booking is written.
4. **Same slot, same renter, about 1 minute.** Pick the same renter as step
   2 again and submit the same room, date, and time. This time it is
   blocked outright with a field error (`你已經預約過這個時段`, you
   already booked this slot) instead of a dialog, since it is the same
   renter's own booking.
5. **Inside a blocked rule, about 2 minutes.** Pick a date that falls on the
   weekday you blocked in step 1, and a time inside that rule's blocked
   range. The slot is rejected with a field error that quotes the rule's
   reason text. This is a different check from steps 3 and 4: it comes
   from the rental rule, not from another booking.

A slot that overlaps someone else's booking that is already `已登記`
(registered, the confirmed status) is also a hard block, with no dialog.
There is no way yet in the UI to confirm a booking into that status, so a
reviewer cannot reach this case from a clean demo. It is covered by tests
instead.

**Coming next:** a read-only bookings list (E-46) and a batch booking
detail page (E-47).

## Local development

Prerequisites: Node 22, pnpm (via corepack), Docker (for the local Supabase
stack), the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
and [gitleaks](https://github.com/gitleaks/gitleaks) (needed by `pnpm pii`).

1. `pnpm install`
2. `supabase start`. Local ports are shifted into the `544xx` range so this
   stack can run alongside another local Supabase project; see
   `supabase/config.toml` for the exact API, DB, and Studio ports (Studio is
   disabled by default here).
3. `cp .env.example .env.local`, then fill it in from `supabase status`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, and `DATABASE_URL` (the DB connection string that
   `drizzle.config.ts` reads).
4. `pnpm dev`

Before pushing, run: `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test`,
`pnpm knip`, `pnpm pii`.

## Deployment

Vercel builds a preview deployment for every pull request and a production
deployment from `main`. The repo is imported as a Vercel project, with
environment variables set separately for the Preview and Production
environments in the project settings.

Migrations run via `.github/workflows/db-push.yml`, which executes
`supabase db push` against the hosted project when a push to `main` touches
`supabase/migrations/` (it skips linking and pushing while that directory is
empty). It needs the GitHub Actions secrets `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_REF`.

Notes:
- PR previews all share the one hosted database, so a migration only
  reaches it once the PR is merged to `main`.
- Free-tier Supabase projects pause after 7 days of inactivity. Restore
  the project from the dashboard before a demo.
