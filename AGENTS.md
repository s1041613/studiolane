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
the app shell (icon rail / mobile bar, nav items), a placeholder home page,
shared UI primitives (page-failure, error-code), and the shared `lib/`
(calendar dates, click guard, date range, result, settle, utils), the server
error boundary (`src/server/boundary`) and failure screens. Auth is a stub that always returns a demo admin, and
audited writes are a no-op seam. The data layer (migration, seed, Drizzle
schema, repositories, domain logic) exists; see `docs/data-model/`. The only
feature UI is the rental rules settings page (`/settings/rules`; see
`docs/rental-time-rules/`). There is no real auth yet. Other features land
in later PRs.

## Working here

- Public repo: never introduce real names, emails, phone numbers, prices,
  Instagram handles, Google Calendar IDs, or connection strings.
- Local Supabase project id is `studiolane`; ports are shifted to the
  544xx range (see `supabase/config.toml`) so this stack can run next to
  another local Supabase stack without colliding.
- Schema lives in `supabase/migrations/`; `supabase/seed.sql` holds
  fictional seed data only.
