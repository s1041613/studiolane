<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# studiolane

Studiolane is a public, from-scratch rebuild of a private studio-booking
app's foundation. Nothing here is real: no real names, Instagram handles,
emails, phone numbers, prices, or Google Calendar IDs. Any example or
fixture data in this repository is fictional.

## Current scope

This repository is at the skeleton stage: project configuration
(package manager, Next.js, TypeScript, ESLint, Tailwind/PostCSS, shadcn,
Drizzle, Vitest, Playwright, local Supabase config) plus a minimal `src/`:
shared UI primitives (page-failure, error-code), and the shared `lib/`
(calendar dates, click guard, date range, result, settle, utils), the
server error boundary (`src/server/boundary`) and failure screens. Auth is
a stub that always returns a demo admin, and audited writes are a no-op
seam. The data layer (migration, seed, Drizzle schema, repositories,
domain logic) exists; see `docs/data-model/`. The only feature UIs are the
rental rules settings page (`/settings/rules`; see
`docs/rental-time-rules/`), the new-booking page (`/bookings/new`), the
read-only batch detail page (`/bookings/batch/<batchId>`), and the
read-only bookings list (`/bookings`); see `docs/booking/`. The home page
(`/`) is now the desktop itself — menu bar, wallpaper, widgets (today /
待付款 / 下一個空檔), Dock, and the Kobeyee cat, with every window closed;
`/bookings` shares that same desktop and additionally opens the 預約冊
window: sidebar folders (period/room/status/clash), a row's `狀態` menu, a
clash tooltip, and a 備註 column. The old icon-rail app shell is gone; the
three routes above (`/settings/rules`, `/bookings/new`,
`/bookings/batch/<batchId>`) render with no chrome for now, pending a
desktop loading window to replace it. A corner cat on the desktop shell
opens the Kobeyee window; sending a message widens it leftward into a
預約教室 form filled from a fixture reader (no AI wiring yet, no submit),
and the Dock's 預約教室 icon opens that form empty. There is no real auth
yet. Other features land in later PRs.

## Working here

- Public repo: never introduce real names, emails, phone numbers, prices,
  Instagram handles, Google Calendar IDs, or connection strings.
- Local Supabase project id is `studiolane`; ports are shifted to the
  544xx range (see `supabase/config.toml`) so this stack can run next to
  another local Supabase stack without colliding.
- Schema lives in `supabase/migrations/`; `supabase/seed.sql` holds
  fictional seed data only.

## Rule enforcement

Every rule here names what enforces it. A rule enforced only by this file
is a candidate for a check.

| Rule | Enforced by | Layer |
|---|---|---|
| Build UI from `src/components/ui/` primitives; no raw `button`/`input`/`select`/`textarea`/`table`, no `bg-[#…]` colors outside `ui/` | ESLint `no-restricted-syntax` (`eslint.config.mjs`) | Check |
| Feature folders import only `ui/` and `shared/` | ESLint `no-restricted-imports` | Check |
| Use ConfirmDialog/NoticeDialog, not `ui/alert-dialog` | ESLint `no-restricted-imports` | Check |
| No real names, emails, phones, prices, calendar IDs | gitleaks (`pnpm pii`, CI) | Check |
| Before designing UI, read `docs/design-system/ui-primitives.md` and reuse an existing primitive; add a new one to `ui/` only when none fits | This file | Docs |
| Researching a tool: read the version pinned in `package.json`, cite that version's docs (`node_modules/<pkg>/dist/docs` or Context7); every comparison claim carries a source and version, unsourced claims are labeled "inference" | This file | Docs (candidate for a source-column check) |
| Doc links point at `main`, not a feature branch | This file | Docs (candidate for a link check) |
| Update "Current scope" above when a page lands | no-mistakes document step | Pipeline |
