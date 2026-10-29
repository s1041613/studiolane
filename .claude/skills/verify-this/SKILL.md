---
name: verify-this
description: "Verify a claim with fresh local evidence: restate it falsifiably, run it in a baseline and a treatment, compare raw artifacts, and return exactly one verdict — VERIFIED, NOT VERIFIED, BLOCKED, or INCONCLUSIVE — plus how strong the evidence is. Use whenever the user asks to verify, prove, confirm, or show evidence that something works or got fixed (\"verify this\", \"prove it works\", \"did this fix it\", \"show me the evidence\", \"確認一下真的修好了\", \"有證據嗎\", \"真的有變快嗎\"), when a bug fix needs a before/after repro, or when a UI, CLI, API, performance, or memory claim needs measurement rather than a recap — even if tests already pass."
---

# Verify This

Verification is not a recap. It proves or disproves one specific claim with repeatable evidence. A summary of what changed, or "the tests pass", is not evidence that the user-visible claim holds — the point is to observe the behavior yourself, in the old state and the new state, under the same conditions. Reading the diff is not verification: run the code.

## When To Use

- The user asks "verify this", "prove it works", "did this fix it", or "show me the evidence".
- A bug fix needs a before/after repro.
- A UI, CLI, API, performance, or memory claim needs measurement.
- A test passes but the user-visible behavior still needs confirmation.

If the claim is vague ("the code is cleaner", "it feels better"), ask for a measurable version before doing any work. A claim that can't fail can't be verified.

## Execution Mandate

- Every verdict needs at least one command you actually ran against both the baseline and the treatment. Reading code, a diff, or another agent's report does not count.
- If you are about to write a verdict without having run anything, the verdict is `BLOCKED` — say why.
- When the environment stops you (local Supabase not running, port already taken, missing env var, broken harness), report `BLOCKED`. Don't fall back to a thinner check and present it as if it answered the claim.
- Don't modify the code under test. Repro scripts, new focused tests, and artifacts are fine; fixing what you find is a separate task — report it and stop.
- UI or interactive claims need live evidence when the environment permits: a screenshot or GIF of baseline and treatment, with the file paths in the output.

## Workflow

1. **Restate the claim in falsifiable form**: condition, metric, and threshold. Write down what result would make it false. Example: "Submitting the booking form with an overlapping slot shows the conflict message instead of a 500 (metric: HTTP status + rendered text; threshold: 200 with message visible, 0 of 3 runs return 500)." If the claim bundles several acceptance criteria, list each one separately; each gets its own result.
2. **Pick the smallest local surface that can disprove it.** Smaller surfaces mean fewer confounds and faster reruns. A focused test or a single HTTP request beats a full browser flow when it can observe the same thing.
3. **Capture a baseline from the old state**: merge base, parent commit, failing branch, or the current broken repro. Without a baseline you only know the treatment's result, not that the change caused it.
4. **Capture the treatment from the changed state** with the same command, data, warmup, and environment. Change only the code under test.
5. **Compare raw artifacts**: numbers, screenshots, terminal transcripts, HTTP responses, profiles, heap snapshots, or test output. Compare the artifacts themselves, not your memory of them.
6. **Return exactly one verdict and an evidence strength**: `VERIFIED`, `NOT VERIFIED`, `BLOCKED`, or `INCONCLUSIVE`, with `live`, `test`, `static`, or `none`.

### Getting a baseline without disturbing the user's work

- Don't `git checkout` or `git stash` over the user's uncommitted changes to get the old state. Use a separate worktree (in this repo, go through the `/worktree` skill), or a merge-base/parent commit in that worktree.
- When working in a worktree, pass `git -C <absolute path>` and use absolute file paths — the shell CWD drifts back to the main repo silently.
- If the bug is still reproducible right now (treatment not written yet), the current state *is* the baseline: capture it before changing anything.

### Repo-specific confounds

- Vitest runs apply migrations to the shared local Supabase DB, even for unit tests. Running the baseline on a commit with a different schema mutates the DB for everyone; restore main's schema afterwards and note it in the timeline.
- The Next 16 dev server blocks `127.0.0.1`; use `http://localhost:<port>` or the page never hydrates and every UI check fails identically in baseline and treatment.
- Baseline and treatment dev servers must run on different ports or sequentially — never compare against a server that's still serving the other build.
- Local Supabase not running is `BLOCKED`, not a failing test. Start it (`npx supabase start`) or report the block; don't read connection errors as a result.

## Local Surfaces

- Code behavior: focused unit/integration tests (`npx vitest run <file>`) or a minimal repro script.
- UI behavior: the `control-ui` skill — the repo's Playwright setup, Claude in Chrome, screenshots, accessibility snapshots, traces.
- API behavior: local HTTP/RPC request and response diff (`curl -sS -i`, saved to files, then `diff`).
- Performance: same-machine baseline/treatment timings (multiple runs, report median and spread) or CPU profiles.
- Memory: heap snapshots before and after the suspected operation, with forced GC.

## Artifact Layout

When safe to write artifacts:

```text
/tmp/verify-this/<claim-slug>/
├── claim.md        # falsifiable claim + what would falsify it
├── timeline.md     # commands run, in order, with commit SHAs and ports
├── baseline/
├── treatment/
├── diff/
└── verdict.md
```

If artifacts may contain sensitive code, prompts, screenshots, HTTP bodies, or heap data, keep only the minimal inline evidence unless the user agrees to disk storage.

## Verdict Rules

- `VERIFIED`: baseline and treatment differ in the predicted direction, by the claimed threshold, with no obvious confound, and every criterion is met.
- `NOT VERIFIED`: you ran the check and the behavior is unchanged, moves the wrong way, or misses the threshold. Any criterion not met makes the whole claim `NOT VERIFIED`.
- `BLOCKED`: the environment kept you from running the check. The change may be correct, but you couldn't prove it. Say what has to be fixed to unblock.
- `INCONCLUSIVE`: the check ran but can't decide — no valid baseline, noisy signal, or an environment difference between baseline and treatment invalidates the comparison. Say what would be needed to make it conclusive.

A treatment that passes while the baseline *also* passes is `INCONCLUSIVE`, not `VERIFIED` — the check doesn't discriminate. Either the repro is wrong or the bug was never there; say which you think it is.

## Evidence Strength

Report the strongest level that your Execution list supports:

- `live`: reproduced against the running thing — real browser, real CLI, real HTTP to the dev server — in both baseline and treatment.
- `test`: a focused test that exercises the changed code path fails on the baseline and passes on the treatment. No live check.
- `static`: only typecheck, build, or lint. Valid for `VERIFIED` only when the claim itself is about types or the build; for any behavior claim, a static-only result is `INCONCLUSIVE`.
- `none`: nothing ran (`BLOCKED`).

A UI or interactive claim reported at `test` strength must say why live wasn't possible.

## Output

Use this shape:

```text
VERIFIED | NOT VERIFIED | BLOCKED | INCONCLUSIVE
Strength: live | test | static | none
Claim: <falsifiable claim>

Execution:
- <command> (baseline @ <sha>) → <outcome>
- <command> (treatment @ <sha>) → <outcome>

Evidence:
<metric/artifact>: baseline=<...>, treatment=<...>, delta=<...>, threshold=<...>

Criteria:
- [x] <criterion>: <evidence> (met | not met | n/a)

Reasoning:
<one tight paragraph naming the evidence and any confounds>

Notes:
- <flaky tests, adjacent issues noticed, what would unblock or make it conclusive>
```

Keep the verdict alone on the first line so a calling skill or subagent can read it without parsing the rest. List every meaningful command in Execution — that list is what separates a real verification from pattern-matching.

Do not soften a negative result. A clear `NOT VERIFIED` is useful; a hedged `VERIFIED` is harmful because someone will ship on it. An honest `BLOCKED` beats a `VERIFIED` that was really only a typecheck.
