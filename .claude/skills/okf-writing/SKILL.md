---
name: okf-writing
description: Write project documentation as an OKF (Open Knowledge Format v0.2) bundle — markdown concept files with YAML frontmatter in a docs/ topic folder, plus index.md and log.md. Use this skill whenever you create, write, generate, add, or extend documentation in this project, for example docs for a feature, page, component, API route, server action, database table or data model, business rule, how-to guide, or design decision, or when a user asks to "document", "寫文件", "補文件", or "產生文件" for part of the codebase, even if OKF is never mentioned. Do not use it for PR descriptions, commit messages, code comments, chat replies or HTML reply pages, CLAUDE.md/AGENTS.md, or memory files.
---

# OKF Writing

Write docs that both people and agents can trust. OKF is plain markdown with YAML
frontmatter. The frontmatter says what each file is, where its facts came from,
and who wrote it. This skill turns codebase reading into an OKF bundle.

- Spec: OKF **v0.2**, canonical repo `GoogleCloudPlatform/open-knowledge-format`,
  pinned at commit `ad30107c31c06aec8a7d5636e0d1058118604e6f` (2026-08-21).
  Spec changes are not tracked automatically. Check that repo by hand before
  you change these rules.
- `references/spec-essentials.md`: the spec rules this skill relies on, with
  SPEC.md line numbers. Read it if a case is not covered here.
- `references/example-bundle/`: a small bundle that follows every rule. It describes a
  made-up `acme/shop` repo. Copy its shape, not its facts.
- `scripts/validate.py` and `scripts/build_index.py`: stock `python3`, no installs.

## Red lines

These protect trust. The trust signals in OKF only work if the agent never fakes them.

1. **Only write `generated`.** Use `generated: { by: claude-code/<model-id>, at: <time> }`.
   `<model-id>` is the exact model ID from your system prompt, for example `claude-opus-5-5`.
2. **Real time only.** Get `<time>` from `date -u +%Y-%m-%dT%H:%M:%SZ`. Never type a
   time by hand, and never write `T00:00:00Z` as a placeholder.
3. **Never write `verified` with a `human:` actor on your own.** A human check means a
   person read and confirmed the content. Add `verified: { by: human:<id>, at: <time> }`
   only when the user says they confirmed it, and then run the validator with
   `--allow-human-verified`.
4. **Agent content is `status: draft`.** It stays draft until someone verifies it.
5. **No invented sources.** List only files you read and URLs you opened.

## Workflow

1. **Pick the bundle.** Use `docs/<topic>/`, where `<topic>` is lowercase kebab-case
   (`docs/login/`, `docs/booking-rules/`). If the bundle already exists, read its
   `index.md` and `log.md` first. Then list the types and tags it already uses:
   `grep -rh '^type:\|^tags:' docs/<topic>`.
2. **Read the code** for the area you document. Get the source facts you need:
   - `git rev-parse HEAD` gives the commit.
   - `git remote get-url origin` gives the repo URL.
   - `git status --porcelain <path>` shows whether a file has uncommitted changes.
3. **Plan the concepts** (see "Concepts"). Write the list down before you write files.
4. **Get the timestamp once.** Run `date -u +%Y-%m-%dT%H:%M:%SZ`. Use the same value in
   every file you write or change in this session.
5. **Write each concept file.** Use the template below.
6. **Rebuild indexes.** Run `python3 <skill>/scripts/build_index.py docs/<topic>`. This
   makes every `index.md` from the frontmatter, so do not edit entries by hand. You
   may improve a subdirectory's one-line description in its parent index. The script
   keeps your change.
7. **Update `log.md`.** See "log.md".
8. **Validate.** Run `python3 <skill>/scripts/validate.py docs/<topic>`. Fix every `ERROR`.
   Fix `WARN` lines when it is easy. Repeat until the exit code is 0.

## Concept file template

```markdown
---
type: Page
resource: https://github.com/<owner>/<repo>/blob/<full-sha>/src/app/login/page.tsx
title: Login Page
description: The staff sign-in page at /login that sends signed-in staff to the home page.
tags: [auth, login]
status: draft
generated: { by: claude-code/<model-id>, at: 2026-10-22T03:19:07Z }
sources:
  - id: login-page-code
    resource: https://github.com/<owner>/<repo>/blob/<full-sha>/src/app/login/page.tsx
    title: Login page source
---

# Overview

Staff sign in on this page.[^login-page-code] Signed-in staff go straight to `/`.

See [Sign-in Session](sign-in-session.md) for how the session is stored.

[^login-page-code]: Login page source
```

Use this key order: `type, resource, title, description, tags, status, generated, verified, stale_after, sources`.

## Decision rules

**Types.** First reuse a type that the bundle already uses. If none fits, pick from
this list: `Feature`, `Page`, `Component`, `API Endpoint`, `Server Action`,
`Data Model`, `Business Rule`, `How-to`, `Decision`. Use `Reference` only for a copy of
outside material under `references/`. Add a new type only if nothing fits. A new type
must be Title Case and singular. After that, keep using it in this bundle.

**Concepts (split or merge).** A concept is one thing that a reader would look up by
name, such as a page, a table, an endpoint, a rule, or a task.
- Split a part out when other concepts link to it by name, when it changes on its own
  schedule, or when the file goes past about 150 lines.
- Keep a part as a `##` section when only one concept uses it and it is short.

**Files and folders.** Use lowercase kebab-case ASCII names with no dates
(`booking-table.md`). Keep files flat in the bundle root while there are 8 concepts
or fewer. Above 8, group them in plural folders named after the type (`pages/`,
`data-models/`). Each folder gets its own `index.md`.

**Language.** Write content in English at CEFR B1 level:
- short sentences (20 words or fewer)
- common words, active voice, one idea per sentence
- explain a term the first time you use it
- code names in backticks
- non-English UI text in backticks with its English meaning after it, for example
  `帳號或密碼錯誤` (wrong account or password)

Frontmatter keys, `type`, and `tags` are English too.

**Title and description.**
- `title`: 60 characters or fewer.
- `description`: exactly one sentence, 160 characters or fewer, ending with a period.
  It says what the thing is. `index.md` copies it word for word.

**Tags.** 1 to 6 tags, lowercase kebab-case. Reuse the bundle's tags.

**`resource`.** Fill it only when the concept describes one real asset with a stable
address. Most often that is the main source file, written as a git permalink:
`https://github.com/<owner>/<repo>/blob/<full-sha>/<path>`. Build it from the origin URL
and HEAD. Leave `resource` out for abstract concepts: Feature, Business Rule, How-to,
Decision. Two concepts must never share a `resource`. A related issue or ticket goes in
`sources`, not in `resource`.

**`sources` and footnotes.**
- Every entry has `id`, `resource`, and `title`.
- Use permalinks for code. Never use a local path like `src/x.ts` or `node_modules/...`,
  because it breaks outside this checkout.
- If a file has uncommitted changes, write a scope descriptor with spaces instead, for
  example `"src/lib/date-range.ts in the working tree at c53978a (uncommitted)"`.
- To back up one claim, add a footnote whose label is a `sources[].id`. Its text equals
  the source title.
- Every footnote you define must be cited in the text.
- Sources without footnotes are fine.

**`stale_after`.** Set it for facts that go out of date fast, such as library versions,
external API behaviour, or security advisories. Use generated time + 90 days, in the
same UTC format. Leave it out for stable facts.

**Links.**
- Link concepts with paths relative to the current file (`booking-table.md`,
  `../pages/login-page.md`). Never start a link with `/`. The bundle lives in a repo
  subfolder, so `/` would point at the repo root on GitHub.
- Do not link out of the bundle into code. Use a permalink instead.
- Every link must resolve.

**Other files.** Put non-markdown files (SQL, JSON, images) only under `references/`,
and point to them from a concept's `sources`. Do not put generated output in the bundle.

## index.md

`scripts/build_index.py` owns these files. The root `index.md` has only
`okf_version: "0.2"` as frontmatter. Other `index.md` files have no frontmatter.
Entries are grouped under `# <Type>` headings, written as
`* [<title>](<file>.md) - <description>`, and copied word for word. Subfolders come last
under `# Subdirectories`. `log.md` is not listed.

## log.md

There is no frontmatter. The first line is `# Update Log`. Then come
`## YYYY-MM-DD` sections (UTC date), newest first, with one section per day. Add new
bullets at the top of today's section:

```markdown
* **Creation**: Added the [Login Page](login-page.md) concept from `src/app/login/page.tsx`.
* **Update**: Added the session timeout rule to [Sign-in Session](sign-in-session.md).
```

The leading word is one of `Creation`, `Update`, `Deprecation`, `Removal`, or
`Initialization`. Link each concept you created or changed. When a bundle is first
created, add `* **Initialization**: Created the <topic> bundle.`

## Updating an existing concept

- Keep the existing `#` headings and `sources` entries. Add to them; do not rewrite them.
- Set `generated` to your actor and the new time.
- If you change a concept that has a `verified` entry, keep the entry. The person
  verified the old text, and `verified` keeps its own date (spec §5.2). Set `status`
  back to `draft` and say in `log.md` that the change is not verified yet. A person
  wrote those `verified` entries, so run the validator with `--allow-human-verified`.
- To retire a concept, set `status: deprecated` and keep the file so its links still
  work. Add a `**Deprecation**` log line.

## Before you finish

Report the bundle path and the concepts you wrote. Report the validator result
(exit code and any remaining WARN lines). Mention any facts you could not confirm from
the code.
