#!/usr/bin/env python3
"""Validate an OKF v0.2 bundle against the spec and the okf-writing rules.

Usage:
  python3 validate.py <bundle-dir> [--spec-only] [--allow-human-verified]

Output: one `path:line: LEVEL [rule] message` line per problem.
Exit code: 1 if any ERROR, else 0.

  (default)               spec rules and skill rules are both ERRORs.
  --spec-only             only spec rules are ERRORs; skill rules become WARNs.
                          Use it for bundles this skill did not write.
  --allow-human-verified  the user explicitly confirmed the content, so a
                          `verified: {by: human:<id>}` entry is expected.

Rule ids: S* = OKF v0.2 spec (SPEC.md line refs), K* = okf-writing skill rules,
W* = advice that never fails the run.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_index import index_dirs, render_index  # noqa: E402
from okf_lib import RESERVED, read_doc, sentence_count  # noqa: E402

BUILTIN_TYPES = {
    "Feature", "Page", "Component", "API Endpoint", "Server Action",
    "Data Model", "Business Rule", "How-to", "Decision", "Reference",
}
STATUS = {"draft", "stable", "deprecated"}
ISO_OFFSET_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$")
SKILL_TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
ACTOR_RE = re.compile(r"^(human:[^\s]+|process:[^\s]+|[A-Za-z0-9_.\-]+/[^\s]+)$")
AGENT_ACTOR_RE = re.compile(r"^claude-code/[a-z0-9][a-z0-9.\-]*$")
KEBAB_FILE_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.md$")
KEBAB_DIR_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
TAG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
LINK_RE = re.compile(r"(?<!!)\[[^\]\n]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
FN_REF_RE = re.compile(r"\[\^([^\]\s]+)\](?!:)")
FN_DEF_RE = re.compile(r"^\[\^([^\]\s]+)\]:\s*(.*)$", re.M)
FENCE_RE = re.compile(r"^(```|~~~).*?^\1\s*$", re.M | re.S)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
CJK_RE = re.compile(r"[぀-ヿ㐀-鿿가-힯]")
LOG_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LOG_ENTRY_RE = re.compile(r"^\* \*\*(Creation|Update|Deprecation|Removal|Initialization)\*\*: .+")


class Report:
    def __init__(self, bundle: Path, spec_only: bool):
        self.bundle = bundle
        self.spec_only = spec_only
        self.items: list[tuple[str, int, str, str, str]] = []

    def _rel(self, path: Path) -> str:
        try:
            return path.relative_to(self.bundle).as_posix()
        except ValueError:
            return str(path)

    def spec(self, path: Path, line: int, rule: str, msg: str) -> None:
        self.items.append((self._rel(path), line, "ERROR", rule, msg))

    def skill(self, path: Path, line: int, rule: str, msg: str) -> None:
        self.items.append((self._rel(path), line, "WARN" if self.spec_only else "ERROR", rule, msg))

    def warn(self, path: Path, line: int, rule: str, msg: str) -> None:
        self.items.append((self._rel(path), line, "WARN", rule, msg))

    def errors(self) -> int:
        return sum(1 for i in self.items if i[2] == "ERROR")

    def print(self) -> None:
        for rel, line, level, rule, msg in sorted(self.items, key=lambda i: (i[0], i[1])):
            print(f"{rel}:{line}: {level} [{rule}] {msg}")


def strip_code(body: str) -> str:
    """Blank out fenced and inline code, keeping line numbers."""
    body = FENCE_RE.sub(lambda m: "\n" * m.group(0).count("\n"), body)
    return INLINE_CODE_RE.sub("``", body)


def line_of(body: str, pos: int, start: int) -> int:
    return start + body.count("\n", 0, pos)


def is_url(value: str) -> bool:
    return bool(re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://", value)) or value.startswith("mailto:")


def inside(bundle: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(bundle.resolve())
        return True
    except ValueError:
        return False


# ------------------------------------------------------------------ checks

def check_timestamp(r: Report, path: Path, key: str, value, agent_written: bool) -> None:
    if value is None:
        return
    text = str(value)
    if not ISO_OFFSET_RE.match(text):
        r.spec(path, 1, "S-timestamp", f"{key}={text!r} is not an ISO 8601 datetime with an explicit offset (SPEC L284-285)")
        return
    if not SKILL_TS_RE.match(text):
        r.skill(path, 1, "K-timestamp", f"{key}={text!r}: write UTC to the second, e.g. 2026-10-22T03:19:07Z (`date -u +%Y-%m-%dT%H:%M:%SZ`)")
    if agent_written and key in ("generated.at", "verified.at"):
        if text.endswith("T00:00:00Z") or text.endswith("T00:00:00+00:00"):
            r.skill(path, 1, "K-placeholder-time", f"{key}={text!r} looks like a placeholder; use the real time from `date -u`")
        try:
            when = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if when > datetime.now(timezone.utc):
                r.skill(path, 1, "K-future-time", f"{key}={text!r} is in the future")
        except ValueError:
            pass


def check_path_field(r: Report, bundle: Path, path: Path, key: str, value, allow_scope: bool) -> None:
    if value is None:
        return
    text = str(value).strip()
    if not text:
        r.spec(path, 1, "S-resource-empty", f"{key} is empty")
        return
    if is_url(text):
        if text.startswith("file://"):
            r.skill(path, 1, "K-portable", f"{key}={text!r} is a local file URL; use a public URL instead")
        return
    if allow_scope and " " in text:
        return  # a scope descriptor (SPEC L305-308)
    if text.startswith("/"):
        r.skill(path, 1, "K-relative", f"{key}={text!r} starts with '/'; use a path relative to this file")
        target = bundle / text.lstrip("/")
    else:
        target = path.parent / text
    if not inside(bundle, target):
        r.skill(path, 1, "K-portable", f"{key}={text!r} points outside the bundle; use a URL (e.g. a git permalink) or a scope descriptor with spaces")
    elif not target.exists():
        r.skill(path, 1, "K-portable", f"{key}={text!r} does not exist in the bundle")


def check_concept(r: Report, bundle: Path, path: Path, resources: dict, types_used: dict,
                  allow_human: bool) -> None:
    doc = read_doc(path)
    if not doc.has_frontmatter:
        r.spec(path, 1, "S-frontmatter", "concept has no YAML frontmatter block (SPEC L740-741)")
        return
    if doc.error:
        r.spec(path, 1, "S-frontmatter", f"{doc.error} (SPEC L740-741)")
        return
    fm = doc.frontmatter
    typ = fm.get("type")
    if not isinstance(typ, str) or not typ.strip():
        r.spec(path, 1, "S-type", "frontmatter has no non-empty `type` (SPEC L742)")
    else:
        types_used.setdefault(typ, []).append(path)
        words = re.split(r"[\s]+", typ)
        if not all(w[:1].isupper() or w[:1].isdigit() for w in words):
            r.skill(path, 1, "K-type-case", f"type {typ!r} should be Title Case, e.g. 'Data Model'")

    if not KEBAB_FILE_RE.match(path.name):
        r.skill(path, 1, "K-filename", f"file name {path.name!r} should be lowercase kebab-case ASCII")

    gen = fm.get("generated")
    agent_written = False
    if gen is None:
        r.skill(path, 1, "K-generated", "missing `generated: { by, at }`")
    elif not isinstance(gen, dict) or not gen.get("by"):
        r.spec(path, 1, "S-generated-by", "`generated` needs `by` (SPEC L377)")
    else:
        by = str(gen["by"])
        if not ACTOR_RE.match(by):
            r.spec(path, 1, "S-actor", f"generated.by={by!r} does not follow `<producer>/<version>`, `human:<id>` or `process:<id>` (SPEC L491-501)")
        agent_written = by.startswith("claude-code/")
        if agent_written and not AGENT_ACTOR_RE.match(by):
            r.skill(path, 1, "K-actor", f"generated.by={by!r}: use `claude-code/<model-id>`, e.g. claude-code/claude-opus-5-5")
        if gen.get("at") is None:
            r.skill(path, 1, "K-generated", "`generated.at` is missing")
        check_timestamp(r, path, "generated.at", gen.get("at"), agent_written)

    verified = fm.get("verified")
    events = verified if isinstance(verified, list) else ([verified] if verified is not None else [])
    for ev in events:
        if not isinstance(ev, dict) or not ev.get("by") or not ev.get("at"):
            r.spec(path, 1, "S-verified", "each `verified` entry needs `by` and `at` (SPEC L388-391)")
            continue
        by = str(ev["by"])
        if not ACTOR_RE.match(by):
            r.spec(path, 1, "S-actor", f"verified.by={by!r} does not follow the actor convention (SPEC L491-501)")
        if by.startswith("human:") and not allow_human:
            r.skill(path, 1, "K-human-verified", f"verified by {by!r}: the agent must not write human verification; remove it, or rerun with --allow-human-verified if the user confirmed this content")
        check_timestamp(r, path, "verified.at", ev.get("at"), agent_written)

    status = fm.get("status")
    if status is not None and status not in STATUS:
        r.spec(path, 1, "S-status", f"status={status!r} is not draft|stable|deprecated (SPEC L415)")
    if agent_written and not events and status != "draft":
        r.skill(path, 1, "K-draft", "agent-written content with no `verified` entry must be `status: draft`")
    check_timestamp(r, path, "stale_after", fm.get("stale_after"), False)

    title = fm.get("title")
    if not isinstance(title, str) or not title.strip():
        r.skill(path, 1, "K-title", "missing `title`")
    elif len(title) > 60:
        r.skill(path, 1, "K-title", f"title is {len(title)} characters; keep it at 60 or fewer")
    desc = fm.get("description")
    if not isinstance(desc, str) or not desc.strip():
        r.skill(path, 1, "K-description", "missing `description`")
    else:
        if sentence_count(desc) != 1 or not desc.strip().endswith("."):
            r.skill(path, 1, "K-description", "description must be exactly one sentence ending with '.' (SPEC L194)")
        if len(desc) > 160:
            r.skill(path, 1, "K-description", f"description is {len(desc)} characters; keep it at 160 or fewer")
    tags = fm.get("tags")
    if tags is not None and not isinstance(tags, list):
        r.skill(path, 1, "K-tags", "`tags` must be a YAML list (SPEC L199)")
    elif not tags:
        r.skill(path, 1, "K-tags", "add 1-6 `tags`")
    else:
        bad = [t for t in tags if not TAG_RE.match(str(t))]
        if bad:
            r.skill(path, 1, "K-tags", f"tags should be lowercase kebab-case: {bad}")
        if len(tags) > 6:
            r.skill(path, 1, "K-tags", f"{len(tags)} tags; keep 1-6")

    resource = fm.get("resource")
    if resource is not None:
        check_path_field(r, bundle, path, "resource", resource, allow_scope=False)
        resources.setdefault(str(resource), []).append(path)

    if typ == "Attested Computation" and not fm.get("runtime"):
        r.spec(path, 1, "S-runtime", "Attested Computation needs `runtime` (SPEC L590)")
    for key in ("computation",):
        check_path_field(r, bundle, path, key, fm.get(key), allow_scope=False)
    for key in ("executor", "attester"):
        if isinstance(fm.get(key), dict):
            check_path_field(r, bundle, path, f"{key}.resource", fm[key].get("resource"), allow_scope=False)

    sources = fm.get("sources")
    if isinstance(sources, dict):
        sources = [sources]
    source_ids: dict[str, str] = {}
    for idx, src in enumerate(sources or []):
        if not isinstance(src, dict) or not src.get("resource"):
            r.spec(path, 1, "S-source-resource", f"sources[{idx}] needs `resource` (SPEC L305)")
            continue
        check_path_field(r, bundle, path, f"sources[{idx}].resource", src.get("resource"), allow_scope=True)
        if not src.get("id"):
            r.skill(path, 1, "K-source-id", f"sources[{idx}] needs an `id`")
        else:
            source_ids[str(src["id"])] = str(src.get("title") or "")
        if not src.get("title"):
            r.skill(path, 1, "K-source-title", f"sources[{idx}] needs a `title`")
        if src.get("author") is not None and not ACTOR_RE.match(str(src["author"])):
            r.warn(path, 1, "W-actor", f"sources[{idx}].author={src['author']!r} is outside the actor convention (SPEC L322)")
        check_timestamp(r, path, f"sources[{idx}].last_modified", src.get("last_modified"), False)

    # ---- body
    body = doc.body
    start = doc.body_start_line
    if body and not body.startswith("\n"):
        r.warn(path, start, "W-blank-line", "leave one blank line after the closing '---'")
    clean = strip_code(body)
    refs = {}
    for m in FN_REF_RE.finditer(clean):
        refs.setdefault(m.group(1), line_of(clean, m.start(), start))
    defs = {}
    for m in FN_DEF_RE.finditer(clean):
        defs[m.group(1)] = (line_of(clean, m.start(), start), m.group(2).strip())
    for label, line in refs.items():
        if label not in source_ids:
            r.skill(path, line, "K-footnote", f"footnote [^{label}] has no matching sources[].id (SPEC L350-360)")
        if label not in defs:
            r.skill(path, line, "K-footnote", f"footnote [^{label}] is used but never defined")
    for label, (line, text) in defs.items():
        if label not in refs:
            r.skill(path, line, "K-footnote", f"footnote [^{label}] is defined but never cited")
        elif label in source_ids and source_ids[label] and text != source_ids[label]:
            r.warn(path, line, "W-footnote-text", f"footnote [^{label}] text should equal the source title {source_ids[label]!r}")

    for m in LINK_RE.finditer(clean):
        target = m.group(1)
        line = line_of(clean, m.start(), start)
        check_body_link(r, bundle, path, line, target)

    prose = FN_DEF_RE.sub("", clean)
    for field_name, text in (("title", title), ("description", desc), ("body", prose)):
        if isinstance(text, str) and CJK_RE.search(text):
            r.skill(path, 1, "K-english", f"{field_name} contains non-English (CJK) text; write content in English")
            break
    for m in re.finditer(r"[^.!?\n]+[.!?]", re.sub(r"^\s*([*\-]|\d+\.|#+|\|).*$", "", prose, flags=re.M)):
        words = m.group(0).split()
        if len(words) > 30:
            r.warn(path, line_of(prose, m.start(), start), "W-long-sentence", f"sentence has {len(words)} words; B1 English prefers 20 or fewer")


def check_body_link(r: Report, bundle: Path, path: Path, line: int, target: str) -> None:
    if is_url(target) or target.startswith("#"):
        return
    plain = target.split("#", 1)[0]
    if not plain:
        return
    if plain.startswith("/"):
        r.skill(path, line, "K-relative-link", f"link {target!r} starts with '/'; use a path relative to this file (the bundle lives in a repo subdirectory)")
        resolved = bundle / plain.lstrip("/")
    else:
        resolved = path.parent / plain
    if not inside(bundle, resolved):
        r.skill(path, line, "K-link-outside", f"link {target!r} leaves the bundle; link code with a URL (git permalink) instead")
    elif not resolved.exists():
        r.skill(path, line, "K-broken-link", f"link {target!r} does not resolve (SPEC L464 tolerates this, the skill does not)")


def check_index(r: Report, bundle: Path, path: Path) -> None:
    doc = read_doc(path)
    is_root = path.parent.resolve() == bundle.resolve()
    if doc.error:
        r.spec(path, 1, "S-index", f"{doc.error}")
        return
    if doc.has_frontmatter:
        extra = set(doc.frontmatter) - {"okf_version"}
        if not is_root:
            r.spec(path, 1, "S-index", "index.md below the bundle root must not have frontmatter (SPEC L512-513)")
        elif extra:
            r.spec(path, 1, "S-index", f"root index.md frontmatter may only hold okf_version, found {sorted(extra)} (SPEC L512-513)")
    if is_root:
        version = doc.frontmatter.get("okf_version") if doc.has_frontmatter else None
        if version != "0.2":
            r.skill(path, 1, "K-okf-version", 'root index.md must start with frontmatter `okf_version: "0.2"`')
    for m in LINK_RE.finditer(strip_code(doc.body)):
        check_body_link(r, bundle, path, line_of(doc.body, m.start(), doc.body_start_line), m.group(1))
    expected = render_index(bundle, path.parent)
    actual = path.read_text(encoding="utf-8")
    if expected.rstrip() != actual.rstrip():
        r.skill(path, 1, "K-index-sync", "index.md does not match concept titles/descriptions; run scripts/build_index.py")


def check_log(r: Report, bundle: Path, path: Path, concepts: list[Path]) -> None:
    doc = read_doc(path)
    if doc.has_frontmatter:
        r.skill(path, 1, "K-log-frontmatter", "log.md must not have frontmatter")
    lines = doc.body.splitlines()
    dates = []
    for n, line in enumerate(lines, doc.body_start_line):
        if line.startswith("## "):
            heading = line[3:].strip()
            if not LOG_DATE_RE.match(heading):
                r.spec(path, n, "S-log-date", f"log heading {heading!r} must be YYYY-MM-DD (SPEC L550)")
            else:
                dates.append((heading, n))
        elif line.startswith(("* ", "- ")) and not LOG_ENTRY_RE.match(line):
            r.skill(path, n, "K-log-entry", "write entries as `* **Creation|Update|Deprecation|Removal|Initialization**: <sentence>`")
    names = [d for d, _ in dates]
    if names != sorted(names, reverse=True):
        r.spec(path, 1, "S-log-order", "log dates must be newest first (SPEC L537)")
    if len(set(names)) != len(names):
        r.skill(path, 1, "K-log-dates", "use one `## YYYY-MM-DD` section per day")
    for m in LINK_RE.finditer(strip_code(doc.body)):
        check_body_link(r, bundle, path, line_of(doc.body, m.start(), doc.body_start_line), m.group(1))
    linked = {(path.parent / t.split("#")[0]).resolve() for t in LINK_RE.findall(doc.body) if not is_url(t)}
    for c in concepts:
        if c.resolve() not in linked:
            r.warn(path, 1, "W-log-coverage", f"no log entry links {c.relative_to(bundle).as_posix()}")


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    unknown = flags - {"--spec-only", "--allow-human-verified"}
    if len(args) != 1 or unknown:
        print(__doc__)
        return 2
    bundle = Path(args[0])
    if not bundle.is_dir():
        print(f"{bundle}: not a directory")
        return 2
    r = Report(bundle, "--spec-only" in flags)
    allow_human = "--allow-human-verified" in flags

    concepts = sorted(p for p in bundle.rglob("*.md") if p.name not in RESERVED)
    resources: dict[str, list[Path]] = {}
    types_used: dict[str, list[Path]] = {}
    for p in concepts:
        check_concept(r, bundle, p, resources, types_used, allow_human)
    for p in sorted(bundle.rglob("index.md")):
        check_index(r, bundle, p)
    for p in sorted(bundle.rglob("log.md")):
        check_log(r, bundle, p, concepts if p.parent.resolve() == bundle.resolve() else [])

    if not (bundle / "index.md").exists():
        r.skill(bundle / "index.md", 0, "K-index-missing", "bundle root needs index.md")
    if not (bundle / "log.md").exists():
        r.skill(bundle / "log.md", 0, "K-log-missing", "bundle root needs log.md")
    for d in index_dirs(bundle):
        if d != bundle and not (d / "index.md").exists():
            r.skill(d / "index.md", 0, "K-index-missing", "directory with concepts needs index.md")
        if d != bundle and not KEBAB_DIR_RE.match(d.name):
            r.skill(d, 0, "K-dirname", f"directory name {d.name!r} should be lowercase kebab-case ASCII")
    for value, paths in resources.items():
        if len(paths) > 1:
            names = ", ".join(p.relative_to(bundle).as_posix() for p in paths)
            for p in paths:
                r.skill(p, 1, "K-resource-unique", f"resource {value!r} is shared by {names}; it must identify one asset (SPEC L196-198)")
    for p in sorted(bundle.rglob("*")):
        if p.is_file() and p.suffix != ".md" and not p.name.startswith("."):
            rel = p.relative_to(bundle).parts
            if rel[0] != "references":
                r.skill(p, 0, "K-non-md", "non-markdown files belong under references/")
    for typ, paths in types_used.items():
        if typ not in BUILTIN_TYPES and len(paths) == 1 and len(types_used) > 1:
            r.warn(paths[0], 1, "W-type-reuse", f"type {typ!r} is new and used once; reuse a type from the bundle or the built-in list if one fits")

    r.print()
    errors = r.errors()
    warns = sum(1 for i in r.items if i[2] == "WARN")
    print(f"-- {len(concepts)} concepts, {errors} errors, {warns} warnings"
          + (" (spec-only mode)" if r.spec_only else ""))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
