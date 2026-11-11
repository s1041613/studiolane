<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# studiolane

Studiolane is a public repo. Every name, Instagram handle, email, phone
number, price, Google Calendar ID, and connection string in it is
fictional, including examples and fixtures.

## Working here

- Local Supabase runs on the 544xx ports so it can run next to another
  local Supabase stack. Keep new ports in that range.
- `supabase/seed.sql` holds fictional data only.

## Rule enforcement

Each rule names what enforces it. A rule enforced only by this file is a
candidate for a check.

| Rule | Enforced by | Layer |
|---|---|---|
| Build UI from `src/components/ui/` primitives. No raw `button`, `input`, `select`, `textarea`, or `table`, and no `bg-[#…]` colors outside `ui/` | ESLint `no-restricted-syntax` | Check |
| Feature folders import only `ui/` and `shared/` | ESLint `no-restricted-imports` | Check |
| Use ConfirmDialog or NoticeDialog, not `ui/alert-dialog` | ESLint `no-restricted-imports` | Check |
| No real names, emails, phones, prices, or calendar IDs | gitleaks (`pnpm pii`, CI) | Check |
| Before designing UI, read `docs/design-system/ui-primitives.md` and reuse a primitive. Add one to `ui/` only when none fits | This file | Docs |
| When researching a tool, read the version pinned in `package.json` and cite that version's docs. Every comparison claim names its source and version. Label unsourced claims "inference" | This file | Docs |
| Doc links point at `main`, not a feature branch | This file | Docs |
| A parked page lives in `src/app/_parked/` (knip treats it as an app entry), and its header says how to restore it | knip, plus the file header | Check + Docs |
| Instruction files such as this one hold rules and lessons from mistakes. Leave out anything an agent can learn by reading the code, because those facts drift out of sync | This file | Docs |
