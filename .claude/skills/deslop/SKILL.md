---
name: deslop
description: Remove AI-generated code slop from the current branch's diff against main and clean up style so it matches the surrounding code. Use when the user says deslop, 清 AI 味, or wants the branch cleaned up before review or a PR. For prose (docs, PR descriptions, commit messages) use `pstack:unslop` instead.
---

# Deslop

Check the diff against `main` and remove AI-generated slop that this branch introduced. Judge every change against the file and the codebase around it, not against a generic style guide.

## Scope

1. Find the branch's changes with `git diff $(git merge-base main HEAD)` plus uncommitted work (`git diff HEAD`). In a worktree, pass `-C <worktree path>` to every git command.
2. Touch only lines this branch added or changed. Leave pre-existing code alone, even if it has the same problems.
3. Skip generated files: `supabase/migrations/*` produced by `drizzle-kit generate`, lockfiles, and the AGENTS.md block that `next dev` writes.

## Focus areas

- **Comments that add nothing.** Comments that restate the code, narrate the change ("now we also handle..."), or exceed the comment density of the file. Keep comments that explain why. Comments stay in English. When a comment is worth keeping but reads like AI prose, apply the `pstack:unslop` rules to it.
- **Defensive code on trusted paths.** Null checks, `try/catch`, and re-validation inside the system after a boundary has already parsed the data. In this repo the boundaries are server actions, route handlers, form input, and Supabase/Drizzle calls. See `pstack:principle-boundary-discipline`.
- **Type escapes.** `as any`, `as unknown as X`, non-null `!`, and `@ts-expect-error` added only to silence the compiler. Fix the type instead. See `pstack:principle-type-system-discipline`.
- **Deep nesting.** Nested `if` blocks that read better as early returns or guard clauses.
- **Invented patterns.** New result shapes, helpers, or wrappers where the codebase already has one. New actions reuse the existing `ok` / `reason` / `fieldErrors` / `conflicts` shapes.
- **Over-abstraction.** A helper, constant, or type alias used once and adding no meaning. Inline it.
- **Leftovers.** `console.log`, commented-out code, unused imports or variables, TODOs the branch itself resolved.
- **Anything else inconsistent** with the file's naming, idioms, and structure.

## Guardrails

- Keep behavior unchanged unless fixing a clear bug. If you find one, call it out separately in the summary instead of folding it into cleanup.
- Prefer minimal, focused edits over broad rewrites.
- The `pstack:principle-*` skills are manual-only and the Skill tool refuses them; when one is needed, read its `SKILL.md` from the pstack plugin directory (`~/.claude/plugins/cache/cursor-plugins/pstack/<version>/skills/`).
- When unsure whether a check is defensive slop or a real boundary guard, keep it and mention it.
- After editing, run `pnpm lint` and `npx tsc --noEmit`. Run tests only for the touched area; `vitest` migrates the shared local DB, so do not run the full suite on a branch with a pending migration.
- Keep the final summary concise (1-3 sentences), plus a list of any bugs or uncertain spots.
