# studiolane
Public rebuild of a private studio booking app, with fictional data

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
