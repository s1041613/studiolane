"""Shared helpers for the okf-writing scripts.

Zero-install: stock python3 (3.9+), no PyYAML. Contains a small YAML parser
that covers the subset OKF frontmatter uses (block mappings and sequences,
flow mappings and sequences, quoted and plain scalars, multi-line plain
scalars, literal/folded block scalars, comments). Anything outside that
subset (anchors, aliases, tags, multi-document) is reported as an error.
Timestamps stay strings, like the reference implementation's loader.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

RESERVED = ("index.md", "log.md")


class YamlError(ValueError):
    pass


# ---------------------------------------------------------------- scalars

_INT_RE = re.compile(r"^[-+]?\d+$")
_FLOAT_RE = re.compile(r"^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$")


def _plain_scalar(text: str) -> Any:
    s = text.strip()
    if s == "" or s in ("~", "null", "Null", "NULL"):
        return None
    if s in ("true", "True", "TRUE"):
        return True
    if s in ("false", "False", "FALSE"):
        return False
    if s[0] in "`@":
        raise YamlError(f"plain scalar cannot start with {s[0]!r}: {s!r}")
    if s[0] in "&*!|>%":
        raise YamlError(f"unsupported YAML feature at {s!r}")
    if re.search(r":(\s|$)", s):
        raise YamlError(f"mapping values are not allowed here: {s!r}")
    if " #" in s:
        s = s.split(" #", 1)[0].rstrip()
    if _INT_RE.match(s):
        return int(s)
    if _FLOAT_RE.match(s) and any(c in s for c in ".eE"):
        try:
            return float(s)
        except ValueError:
            pass
    return s


def _read_double(s: str, i: int) -> tuple[str, int]:
    assert s[i] == '"'
    out = []
    i += 1
    escapes = {"n": "\n", "t": "\t", '"': '"', "\\": "\\", "/": "/", "0": "\0", " ": " "}
    while i < len(s):
        c = s[i]
        if c == "\\":
            if i + 1 >= len(s):
                break
            nxt = s[i + 1]
            if nxt in escapes:
                out.append(escapes[nxt])
                i += 2
                continue
            if nxt == "u" and i + 5 < len(s) + 1:
                out.append(chr(int(s[i + 2:i + 6], 16)))
                i += 6
                continue
            raise YamlError(f"unknown escape \\{nxt}")
        if c == '"':
            return "".join(out), i + 1
        out.append(c)
        i += 1
    raise YamlError("unterminated double-quoted string")


def _read_single(s: str, i: int) -> tuple[str, int]:
    assert s[i] == "'"
    out = []
    i += 1
    while i < len(s):
        c = s[i]
        if c == "'":
            if i + 1 < len(s) and s[i + 1] == "'":
                out.append("'")
                i += 2
                continue
            return "".join(out), i + 1
        out.append(c)
        i += 1
    raise YamlError("unterminated single-quoted string")


# ---------------------------------------------------------------- flow style

def _parse_flow(s: str) -> Any:
    value, i = _flow_value(s, 0)
    rest = s[i:].strip()
    if rest and not rest.startswith("#"):
        raise YamlError(f"unexpected text after flow value: {rest!r}")
    return value


def _skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t":
        i += 1
    return i


def _flow_value(s: str, i: int) -> tuple[Any, int]:
    i = _skip_ws(s, i)
    if i >= len(s):
        raise YamlError("unexpected end of flow value")
    c = s[i]
    if c == "{":
        return _flow_mapping(s, i)
    if c == "[":
        return _flow_sequence(s, i)
    if c == '"':
        return _read_double(s, i)
    if c == "'":
        return _read_single(s, i)
    j = i
    while j < len(s) and s[j] not in ",]}":
        if s[j] == ":" and (j + 1 >= len(s) or s[j + 1] in " ,]}"):
            break
        j += 1
    return _plain_scalar(s[i:j]), j


def _flow_mapping(s: str, i: int) -> tuple[dict, int]:
    i += 1
    out: dict = {}
    while True:
        i = _skip_ws(s, i)
        if i >= len(s):
            raise YamlError("unterminated flow mapping")
        if s[i] == "}":
            return out, i + 1
        key, i = _flow_value(s, i)
        i = _skip_ws(s, i)
        if i < len(s) and s[i] == ":":
            value, i = _flow_value(s, i + 1)
        else:
            value = None
        if key in out:
            raise YamlError(f"duplicate key {key!r}")
        out[key] = value
        i = _skip_ws(s, i)
        if i < len(s) and s[i] == ",":
            i += 1
        elif i < len(s) and s[i] == "}":
            continue
        else:
            raise YamlError("expected ',' or '}' in flow mapping")


def _flow_sequence(s: str, i: int) -> tuple[list, int]:
    i += 1
    out: list = []
    while True:
        i = _skip_ws(s, i)
        if i >= len(s):
            raise YamlError("unterminated flow sequence")
        if s[i] == "]":
            return out, i + 1
        value, i = _flow_value(s, i)
        out.append(value)
        i = _skip_ws(s, i)
        if i < len(s) and s[i] == ",":
            i += 1
        elif i < len(s) and s[i] == "]":
            continue
        else:
            raise YamlError("expected ',' or ']' in flow sequence")


# ---------------------------------------------------------------- block style

def _strip_comment(line: str) -> str:
    """Remove a trailing ' #' comment that sits outside quotes."""
    quote = None
    for idx, c in enumerate(line):
        if quote:
            if c == quote:
                quote = None
            continue
        if c in "\"'" and (idx == 0 or line[idx - 1] in " :[{,-"):
            quote = c
        elif c == "#" and (idx == 0 or line[idx - 1] in " \t"):
            return line[:idx].rstrip()
    return line.rstrip()


class _Block:
    def __init__(self, text: str):
        self.lines: list[tuple[int, str]] = []  # (indent, content)
        self.raw: list[str] = []
        for n, raw in enumerate(text.split("\n"), 1):
            if raw.strip() == "" or raw.lstrip().startswith("#"):
                continue
            lead = raw[: len(raw) - len(raw.lstrip(" \t"))]
            if "\t" in lead:
                raise YamlError(f"line {n}: tab used for indentation")
            content = _strip_comment(raw.strip())
            if content in ("---", "...") or content.startswith("%"):
                raise YamlError(f"line {n}: multi-document or directive not supported")
            self.lines.append((len(lead), content))
            self.raw.append(raw)
        self.i = 0

    def parse(self) -> Any:
        if not self.lines:
            return None
        indent = self.lines[0][0]
        if indent != 0:
            raise YamlError("frontmatter must start at column 0")
        value = self._node(indent)
        if self.i < len(self.lines):
            raise YamlError(f"unexpected indentation at: {self.lines[self.i][1]!r}")
        return value

    def _node(self, indent: int) -> Any:
        _, content = self.lines[self.i]
        if content == "-" or content.startswith("- "):
            return self._sequence(indent)
        return self._mapping(indent)

    def _split_key(self, content: str) -> tuple[str, str]:
        if content[0] in "\"'":
            key, j = (_read_double if content[0] == '"' else _read_single)(content, 0)
            rest = content[j:].lstrip()
            if not rest.startswith(":"):
                raise YamlError(f"expected ':' after key in {content!r}")
            return key, rest[1:]
        m = re.match(r"^([^:#{}\[\],]+?)\s*:(\s+|$)(.*)$", content)
        if not m:
            raise YamlError(f"expected 'key: value', got {content!r}")
        return m.group(1).strip(), m.group(3)

    def _continuation(self, indent: int) -> list[str]:
        parts = []
        while self.i < len(self.lines) and self.lines[self.i][0] > indent:
            parts.append(self.lines[self.i][1])
            self.i += 1
        return parts

    def _block_scalar(self, header: str, indent: int) -> str:
        start = self.i
        while self.i < len(self.lines) and self.lines[self.i][0] > indent:
            self.i += 1
        raws = self.raw[start:self.i]
        if not raws:
            return ""
        cut = min(len(r) - len(r.lstrip(" ")) for r in raws)
        body = [r[cut:] for r in raws]
        if header.startswith(">"):
            text = " ".join(b.strip() for b in body)
        else:
            text = "\n".join(body)
        return text if header.endswith("-") else text + "\n"

    def _inline(self, rest: str, indent: int) -> Any:
        rest = rest.strip()
        if rest[:1] in ("|", ">"):
            return self._block_scalar(rest, indent)
        more = self._continuation(indent)
        text = " ".join([rest] + more)
        if text[:1] in "{[":
            return _parse_flow(text)
        if text[:1] in "\"'":
            value, j = (_read_double if text[0] == '"' else _read_single)(text, 0)
            tail = text[j:].strip()
            if tail and not tail.startswith("#"):
                raise YamlError(f"unexpected text after quoted string: {tail!r}")
            return value
        return _plain_scalar(text)

    def _mapping(self, indent: int) -> dict:
        out: dict = {}
        while self.i < len(self.lines):
            ind, content = self.lines[self.i]
            if ind < indent:
                break
            if ind > indent:
                raise YamlError(f"bad indentation at {content!r}")
            if content == "-" or content.startswith("- "):
                break
            key, rest = self._split_key(content)
            if key in out:
                raise YamlError(f"duplicate key {key!r}")
            self.i += 1
            if rest.strip() == "":
                if self.i < len(self.lines):
                    nind, ncontent = self.lines[self.i]
                    if nind > indent:
                        out[key] = self._node(nind)
                        continue
                    if nind == indent and (ncontent == "-" or ncontent.startswith("- ")):
                        out[key] = self._sequence(indent)
                        continue
                out[key] = None
            else:
                out[key] = self._inline(rest, indent)
        return out

    def _sequence(self, indent: int) -> list:
        out: list = []
        while self.i < len(self.lines):
            ind, content = self.lines[self.i]
            if ind != indent or not (content == "-" or content.startswith("- ")):
                if ind > indent:
                    raise YamlError(f"bad indentation at {content!r}")
                break
            item = content[1:].lstrip()
            offset = indent + (len(content) - len(item))
            if item == "":
                self.i += 1
                if self.i < len(self.lines) and self.lines[self.i][0] > indent:
                    out.append(self._node(self.lines[self.i][0]))
                else:
                    out.append(None)
                continue
            starts_mapping = item[0] not in "{[\"'" and re.match(r"^[^:#{}\[\],]+?\s*:(\s|$)", item)
            if starts_mapping or item.startswith("- "):
                self.lines[self.i] = (offset, item)
                out.append(self._node(offset))
            else:
                self.i += 1
                out.append(self._inline(item, indent))
        return out


def parse_yaml(text: str) -> Any:
    return _Block(text).parse()


# ---------------------------------------------------------------- documents

class Doc:
    def __init__(self, path: Path, has_frontmatter: bool, frontmatter: Any, body: str,
                 body_start_line: int, error: str | None):
        self.path = path
        self.has_frontmatter = has_frontmatter
        self.frontmatter = frontmatter if isinstance(frontmatter, dict) else {}
        self.raw_frontmatter = frontmatter
        self.body = body
        self.body_start_line = body_start_line
        self.error = error


def read_doc(path: Path) -> Doc:
    text = path.read_text(encoding="utf-8")
    if text.startswith("﻿"):
        text = text[1:]
    lines = text.split("\n")
    if not lines or lines[0].rstrip("\r") != "---":
        return Doc(path, False, None, text, 1, None)
    end = None
    for idx in range(1, len(lines)):
        if lines[idx].rstrip("\r") == "---":
            end = idx
            break
    if end is None:
        return Doc(path, True, None, "", 1, "frontmatter has no closing '---' line")
    fm_text = "\n".join(l.rstrip("\r") for l in lines[1:end])
    body = "\n".join(lines[end + 1:])
    try:
        fm = parse_yaml(fm_text)
    except YamlError as exc:
        return Doc(path, True, None, body, end + 2, f"frontmatter is not valid YAML: {exc}")
    if fm is not None and not isinstance(fm, dict):
        return Doc(path, True, fm, body, end + 2, "frontmatter is not a YAML mapping")
    return Doc(path, True, fm or {}, body, end + 2, None)


def concept_files(bundle: Path) -> list[Path]:
    return sorted(p for p in bundle.rglob("*.md") if p.name not in RESERVED)


def sentence_count(text: str) -> int:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9`\"'(\[])", text.strip())
    return len([p for p in parts if p.strip()])
