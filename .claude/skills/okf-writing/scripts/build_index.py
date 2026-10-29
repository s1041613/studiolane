#!/usr/bin/env python3
"""Regenerate every index.md in an OKF bundle from concept frontmatter.

Usage: python3 build_index.py <bundle-dir> [--check]

- One index.md per directory that holds concepts (directly or below).
- Sections are `# <type>` (sorted), entries `* [<title>](<file>.md) - <description>`
  sorted by title, copied verbatim from frontmatter. Subdirectories go last
  under `# Subdirectories` as `* [<dir>](<dir>/index.md) - <description>`.
- A subdirectory's description is kept from the current parent index when it
  is there; otherwise a plain fallback is written for you to improve.
- The bundle-root index.md carries `okf_version: "0.2"`; other indexes carry no
  frontmatter. log.md is never listed.
- --check writes nothing and exits 1 if any index.md would change.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from okf_lib import RESERVED, read_doc  # noqa: E402

OKF_VERSION = "0.2"
_SUBDIR_ENTRY_RE = re.compile(r"^\* \[([^\]]+)\]\(([^)]+)/index\.md\) - (.+)$")


def _has_concepts(directory: Path) -> bool:
    return any(p.name not in RESERVED for p in directory.rglob("*.md"))


def _existing_subdir_descriptions(index_path: Path) -> dict[str, str]:
    if not index_path.exists():
        return {}
    found = {}
    for line in read_doc(index_path).body.splitlines():
        m = _SUBDIR_ENTRY_RE.match(line.strip())
        if m:
            found[m.group(2)] = m.group(3).strip()
    return found


def render_index(bundle: Path, directory: Path) -> str:
    groups: dict[str, list[tuple[str, str, str]]] = {}
    subdirs: list[tuple[str, str]] = []
    kept = _existing_subdir_descriptions(directory / "index.md")
    for child in sorted(directory.iterdir()):
        if child.is_file() and child.suffix == ".md" and child.name not in RESERVED:
            doc = read_doc(child)
            fm = doc.frontmatter
            title = str(fm.get("title") or child.stem)
            desc = str(fm.get("description") or "").strip()
            typ = str(fm.get("type") or "Other")
            groups.setdefault(typ, []).append((title, child.name, desc))
        elif child.is_dir() and _has_concepts(child):
            desc = kept.get(child.name)
            if not desc:
                titles = sorted(
                    str(read_doc(p).frontmatter.get("title") or p.stem)
                    for p in child.glob("*.md") if p.name not in RESERVED
                )
                desc = f"Contains {len(titles)} concepts: {', '.join(titles)}." if titles else "Contains more concepts."
            subdirs.append((child.name, desc))

    sections = []
    for typ in sorted(groups):
        lines = [f"# {typ}", ""]
        for title, name, desc in sorted(groups[typ], key=lambda e: e[0].lower()):
            lines.append(f"* [{title}]({name})" + (f" - {desc}" if desc else ""))
        sections.append("\n".join(lines))
    if subdirs:
        lines = ["# Subdirectories", ""]
        lines += [f"* [{name}]({name}/index.md) - {desc}" for name, desc in subdirs]
        sections.append("\n".join(lines))

    body = "\n\n".join(sections) + "\n"
    if directory.resolve() == bundle.resolve():
        return f'---\nokf_version: "{OKF_VERSION}"\n---\n\n{body}'
    return body


def index_dirs(bundle: Path) -> list[Path]:
    dirs = [bundle] + sorted(d for d in bundle.rglob("*") if d.is_dir())
    return [d for d in dirs if d == bundle or _has_concepts(d)]


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    check = "--check" in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    bundle = Path(args[0])
    if not bundle.is_dir():
        print(f"{bundle}: not a directory")
        return 2
    changed = 0
    for directory in index_dirs(bundle):
        path = directory / "index.md"
        new = render_index(bundle, directory)
        old = path.read_text(encoding="utf-8") if path.exists() else None
        if old == new:
            continue
        changed += 1
        if check:
            print(f"{path}: out of date (run build_index.py {bundle})")
        else:
            path.write_text(new, encoding="utf-8")
            print(f"wrote {path}")
    return 1 if (check and changed) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
