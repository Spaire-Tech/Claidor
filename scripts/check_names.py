#!/usr/bin/env python3
"""Fail when an earlier name of the product or of the code it came from
appears in the repository, outside the names kept on purpose.

The names searched for are in NAMES below. What is kept, where, and why is
in scripts/kept_names.json and explained in docs/kept-names.md. Every kept
rule must still match something, so the list cannot quietly go stale.

    python3 scripts/check_names.py            # check; exit 1 on a finding
    python3 scripts/check_names.py --summary  # also count each kept rule

Files tracked by git and new files git does not ignore are read. Binary
files are skipped.
"""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES_FILE = ROOT / "scripts" / "kept_names.json"

# Each earlier name and how it is recognised, case-insensitively. "grok"
# is not preceded by a letter so that "ngrok" is not a finding.
NAMES: dict[str, str] = {
    "grok": r"(?<![a-z])grok",
    "caisra": r"caisra",
    "anysphere": r"anysphere",
    "claidor": r"claidor",
    "ohada": r"ohada",
    "swens": r"swens",
    "spaire": r"spaire",
    "spacex": r"spacex",
    "xai": r"\bxai\b|\bx\.ai\b",
    "lobsterai": r"lobsterai",
    "openclaw": r"openclaw",
    "youdao": r"youdao",
    "rakazo": r"rakazo",
    "pierce": r"\bpierce\b",
    "vesence": r"vesence",
    "polar": r"(?<![a-z])polar(?![a-z])",
    # The upstream maker's addresses (4 October 2026, the detachment plan,
    # Track A). The plain word "cursor" is English (the pointer, a CSS
    # property, a pagination cursor) and is not searched for.
    "cursor.com": r"cursor\.(com|sh)",
}
# Names recognised only in this spelling: "Cursor" as a word is the maker's
# name; cursorRule or CursorPosition are the window's own identifiers.
CASE_SENSITIVE_NAMES: dict[str, str] = {
    "Cursor": r"(?<![A-Za-z])Cursor(?![A-Za-z])",
}
PATTERNS = {name: re.compile(regex, re.IGNORECASE) for name, regex in NAMES.items()}
PATTERNS.update({name: re.compile(regex) for name, regex in CASE_SENSITIVE_NAMES.items()})


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        check=True,
    ).stdout
    return sorted({path for path in out.decode().split("\0") if path})


def load_rules() -> list[dict]:
    rules = json.loads(RULES_FILE.read_text())["rules"]
    for rule in rules:
        rule["_match"] = re.compile(rule["match"], re.IGNORECASE) if rule.get("match") else None
        unknown = set(rule["names"]) - set(NAMES) - set(CASE_SENSITIVE_NAMES)
        if unknown:
            raise SystemExit(f"{RULES_FILE.name}: unknown names {sorted(unknown)} in {rule['reason'][:60]!r}")
    return rules


def kept_by(rules: list[dict], path: str, name: str, line: str) -> dict | None:
    for rule in rules:
        if name not in rule["names"]:
            continue
        if not any(fnmatch.fnmatchcase(path, glob) for glob in rule["paths"]):
            continue
        if rule["_match"] is not None and not rule["_match"].search(line):
            continue
        return rule
    return None


def main() -> int:
    summary = "--summary" in sys.argv
    rules = load_rules()
    used: Counter[int] = Counter()
    findings: list[str] = []
    for path in tracked_files():
        if path == "scripts/kept_names.json" or path == "scripts/check_names.py":
            continue
        full = ROOT / path
        try:
            data = full.read_bytes()
        except (FileNotFoundError, IsADirectoryError):
            continue
        if b"\0" in data[:8192]:
            continue
        text = data.decode("utf-8", errors="replace")
        path_hits = {name for name, pattern in PATTERNS.items() if pattern.search(path)}
        for name in path_hits:
            rule = kept_by(rules, path, name, path)
            if rule is None:
                findings.append(f"{path}: file name contains '{name}'")
            else:
                used[id(rule)] += 1
        for number, line in enumerate(text.splitlines(), 1):
            for name, pattern in PATTERNS.items():
                if not pattern.search(line):
                    continue
                rule = kept_by(rules, path, name, line)
                if rule is None:
                    findings.append(f"{path}:{number}: '{name}': {line.strip()[:140]}")
                else:
                    used[id(rule)] += 1
    stale = [rule for rule in rules if used[id(rule)] == 0]
    for rule in stale:
        findings.append(f"{RULES_FILE.name}: kept rule matches nothing any more, remove it: {rule['reason'][:100]}")
    if summary:
        for rule in rules:
            print(f"{used[id(rule)]:6d}  [{rule['kind']}] {rule['reason'][:110]}")
    for finding in findings:
        print(finding)
    if findings:
        print(f"\n{len(findings)} finding(s). An earlier name is only allowed where "
              f"{RULES_FILE.relative_to(ROOT)} keeps it (see docs/kept-names.md).")
        return 1
    print("No earlier names outside the kept list.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
