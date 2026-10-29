# OKF v0.2 essentials

This file covers the spec rules that the okf-writing skill relies on. Line numbers
point to `SPEC.md` in `GoogleCloudPlatform/open-knowledge-format` at commit
`ad30107c31c06aec8a7d5636e0d1058118604e6f`. The frozen copy in
`GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md` is byte-identical.

Spec changes are not tracked automatically. Before you change the skill rules,
read the canonical SPEC.md again and diff it against this pin.

## Contents

1. Hard rules (conformance)
2. Frontmatter fields
3. Provenance, trust, lifecycle
4. Links and paths
5. index.md and log.md
6. Where the samples differ from the spec
7. Skill rules mapped to spec gaps

## 1. Hard rules (conformance, §11 L736-762)

A bundle conforms if all three of these hold:

1. Every non-reserved `.md` file has a parseable YAML frontmatter block (L740-741).
2. Every frontmatter block has a non-empty `type` (L742).
3. `index.md` and `log.md` follow §8 and §9 (L743-744).

Rules about reserved files:

- `index.md` and `log.md` are reserved at every level. They must not be used as
  concepts (L136-144).
- Every other `.md` file is a concept (L144).

Consumers must accept missing optional fields, unknown types, unknown keys, broken
links, and missing `index.md` files (L756-762). That is why the skill adds its own
stricter checks.

## 2. Frontmatter fields (§4.1 L161-207)

| Key | Status | Spec text |
|---|---|---|
| `type` | REQUIRED | "A short string identifying the kind of concept" (L177). No central registry. Producers SHOULD pick descriptive values (L182-185) |
| `title` | recommended | Display name. If it is missing, consumers may use the filename (L192-193) |
| `description` | recommended | "A single sentence summarizing the concept. Used by `index.md` generators" (L194-195) |
| `resource` | recommended | "A URI that uniquely identifies the underlying asset … Absent for concepts that describe abstract ideas" (L196-198) |
| `tags` | recommended | "A YAML list of short strings" (L199) |
| other keys | allowed | Consumers must not reject them (L205-207) |

Conventional body headings are `# Schema`, `# Examples`, and `# Computation`
(L218-222). Use structural markdown, not long prose (L211-213).

## 3. Provenance, trust, lifecycle (§5 L277-433)

Timestamps:

- Every timestamp is "an ISO 8601 datetime with an explicit UTC offset", for example
  `2026-06-30T14:00:00Z` (L284-285).

`sources` (§5.1):

- Each entry has `resource` (REQUIRED inside the entry, L305). It can be a URL, a
  bundle path, a `references/` path, or a scope descriptor such as
  `all queries in BigQuery project X` (L305-308).
- `id` SHOULD be present when the body cites the source (L309-310).
- `title` is optional (L311).
- Credibility signals are optional: `author` (an actor), `usage_count`, and
  `last_modified`. `usage_window` is a sibling key of `sources` (L312-334).

Footnotes:

- To attribute one claim, use a markdown footnote whose label is a `sources[].id`
  (L350-357).
- Consumers join on the label, not on the footnote text (L359-360).

`generated` (§5.2):

- Written as `{ by, at }`. `by` is REQUIRED and is an actor (L377).
- `at` marks "the content's last meaningful change" (L378-380).

`verified`:

- A list of `{ by, at }` entries, one per verification event (L388-391).
- A single bare mapping is allowed (L394-398).
- It is independent of `generated.at` (L392-393).

Trust tiers (§5.3 L401-410):

- No `verified` → unverified.
- Only non-`human:` actors → machine-confirmed.
- Any `human:` actor → human-reviewed.

Tiers are advisory only. They are not access control.

Actors (§7 L489-501):

- `<producer>/<version>` for agents and tools.
- `human:<id>` for people.
- `process:<id>` for automated processes.
- Producers MUST use `human:` for content written or confirmed by a person (L500-501).

`status` (§5.4 L412-422):

- One of `draft | stable | deprecated`.
- If it is missing, the concept counts as `stable` (L422).

`stale_after` (§5.5 L424-433):

- An absolute instant. A concept is stale when `now >= stale_after`.

Attested Computation (§10):

- Needs `runtime` (L590).
- An agent MUST NOT write or edit the computation (L662-663).

The skill does not write Attested Computations. If you need one, read §10 first.

## 4. Links and paths (§6 L437-485)

- Two link forms are allowed. A bundle-relative link starts with `/` and is
  "recommended" (L444-446). A relative link is also supported (L452-456).
- A link asserts an untyped relationship. The text around it says what kind
  (L458-462).
- Broken links are tolerated (L464-466).
- Path-valued fields are `resource`, `sources[].resource`, `computation`,
  `executor.resource`, and `attester.resource`. Each takes a URL, a `/`-path, or a
  relative path (L468-477).
- `references/` is a naming convention for mirrored outside material, run
  instructions, or code (L479-485).

## 5. index.md and log.md

`index.md` (§8 L505-529):

- No frontmatter, with one exception: the root `index.md` may carry `okf_version`
  (L512-513, L776-777).
- The body is one or more `#` sections of `* [Title](url) - description` entries.
- Entries SHOULD include the description from the linked concept's frontmatter
  (L527-528).

`log.md` (§9 L533-552):

- Date-grouped entries, newest first (L536-537).
- Date headings MUST be `YYYY-MM-DD` (L550).
- The leading bold word is a convention, not a requirement (L551-552).

## 6. Where the samples differ from the spec

The repo ships two reference implementations: `reference_agent` (Python) and the kcmd
connector (TypeScript). It also ships four sample bundles. They differ from the spec
text in these ways. The skill follows the samples where noted.

| Topic | Spec text | Samples and reference implementations | Skill choice |
|---|---|---|---|
| Link form | `/` recommended | 277 relative vs 16 `/` links. The agent prompt says "Never start a link with `/` (that breaks GitHub rendering)". The viewer builds graph edges only from relative links | relative |
| Body example heading | `# Examples` | `# Common query patterns` | use `# Examples` when it fits |
| Index regeneration | root may keep `okf_version` | The reference regenerator drops `okf_version` and lists `log.md` | `build_index.py` keeps `okf_version` and skips `log.md` |
| log.md frontmatter | none shown | acme_retail adds `type: Log` | none |
| Path fields | `/`-path or relative | acme uses `policies/x.md` with no slash, which does not resolve as a relative path | relative paths that resolve |
| Description | one sentence | 6 acme descriptions are longer than one sentence | one sentence, 160 characters or fewer |
| Actor prefixes | three are defined | Appendix and acme use `team:` | use only the three |
| Timestamps | any offset | `+00:00` (reference agent) or `Z` (acme), both to the second | UTC `Z`, to the second |

## 7. Skill rules mapped to spec gaps

These are the places where the spec does not decide and the skill sets a rule. The
full wording of each rule is in SKILL.md.

| Gap | Skill rule |
|---|---|
| type vocabulary and case | Reuse the bundle's types first. Otherwise use the built-in list of 9. New types are Title Case and singular |
| concept size | One concept per thing a reader looks up by name. Split when other concepts link to a part, when a part changes on its own, or past about 150 lines |
| file and folder names | kebab-case ASCII, no dates. Flat up to 8 concepts, then plural type folders |
| content language | English, CEFR B1. Keys, types, and tags in English |
| title and description length | Title 60 characters or fewer. Description is one sentence, 160 characters or fewer |
| `resource` when there is no real asset | Leave it out. For code, use a git permalink. Never share a resource between concepts |
| sources vs footnotes | Every source has `id`, `resource`, and `title`. Use footnotes for single claims. No unused footnote definitions |
| timestamp precision and zone | UTC `Z`, to the second, from `date -u`. Never a placeholder |
| Claude actor | `claude-code/<model-id>` |
| who writes `verified` | Never the agent with `human:`. Only when the user confirms |
| status and `stale_after` defaults | Agent content is `draft`. Add `stale_after` (+90 days) only for facts that go stale fast |
| index.md upkeep | Regenerate with `build_index.py`. Titles and descriptions are copied word for word |
| log.md wording | No frontmatter, `# Update Log`, one section per day, `* **Creation**: …` with links |
| link style | Relative, never `/`, must resolve, never leave the bundle |
| non-md files and `references/` | Only under `references/`. No generated output in the bundle |
| local paths in path fields | Not allowed. Use a URL or a scope descriptor with spaces |
