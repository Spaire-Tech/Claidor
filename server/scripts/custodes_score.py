"""The CUSTODES benchmark scorer — the registered instrument, committed.

Implements the two registrations in `docs/pierce/custodes-benchmark.md`
**exactly as written**: the coverage/agreement score of the frozen
engine sweep, and the six-tool two-axis head-to-head. The scoring logic
is the 23 August scorer verbatim — only paths and the unpack/convert
stages were added — because a registered benchmark whose instrument
lives in a container scratchpad is one recycle from unreproducible,
which is the same near-miss the archive README records for the data.

    uv run python -m scripts.custodes_score

Everything derives from the archived tarballs in
`docs/pierce/custodes/` (sha256-checked against the README before
use) and the frozen sweep `sweep-cold-run.json`. Stages, cached in
`scripts/custodes_work/` (git-ignored):

  1. unpack subjects + ground truth + the authors' results file;
  2. convert `.xls` → `.xlsx` through LibreOffice headless — batch
     first, then one-at-a-time for stragglers, the fallback the cold
     run taught;
  3. extract the truth: the comment-bearing cells of the annotated
     sheets, mapped to (workbook, sheet, cell) by longest-prefix
     match against the 70 subject basenames;
  4. score the frozen sweep — coverage and agreement, per the first
     registration;
  5. the head-to-head — six tools, two axes, the results file's own
     Ground truth column, per the second registration.

The printed report is the deliverable; compare it against the numbers
recorded in custodes-benchmark.md. ExceLint is deliberately absent:
its run is separately registered and still owed.
"""

import glob
import hashlib
import json
import re
import subprocess
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")

from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string, get_column_letter

HERE = Path(__file__).parent
ARCHIVE = HERE.parent.parent / "docs" / "pierce" / "custodes"
WORK = HERE / "custodes_work"

#: The archive README's own hashes — the data is checked before it is
#: trusted, every run.
SHA256 = {
    "subjects.tar.gz": "cde410d6fcdb112d7b71978cd40ad5aded723e6b8eb8c2902647d88cf5988a14",
    "ground_truth.tar.gz": "a5eaae92face0951a4f32f472fcf1a0c8043df6ad75321e2ac0481f56ee62644",
    "smell_detection_result/smell_detection_result.xls": (
        "4831d1cdf943cfcbc66b35bdb654a9f95c00f65e85a448b1278e23a9dd02b057"
    ),
}

OUT_OF_SCOPE = {"hidden-sheet", "broken-name", "external-link"}


# --- stages 1-2: unpack and convert --------------------------------------


def _checked(relative: str) -> Path:
    path = ARCHIVE / relative
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SHA256[relative]:
        raise SystemExit(
            f"{relative} does not match the archive README's sha256 — "
            f"refusing to score against altered data"
        )
    return path


def _unpack() -> None:
    for name, into in (("subjects.tar.gz", WORK), ("ground_truth.tar.gz", WORK)):
        marker = WORK / name.split(".", 1)[0]
        if marker.exists():
            continue
        subprocess.run(
            ["tar", "-xzf", str(_checked(name)), "-C", str(WORK)], check=True
        )
    #: Their tarball's truth directory is named for its contents; find
    #: it rather than assume, and normalize to `groundtruth`.
    if not (WORK / "groundtruth").exists():
        candidates = [
            d
            for d in WORK.iterdir()
            if d.is_dir() and d.name not in {"subjects", "xlsx", "gt_xlsx"}
        ]
        if len(candidates) == 1:
            candidates[0].rename(WORK / "groundtruth")


def _convert(source: Path, out: Path) -> None:
    """LibreOffice headless, batch then one-at-a-time for stragglers."""
    out.mkdir(exist_ok=True)
    pending = [
        p
        for p in sorted(source.iterdir())
        if p.suffix == ".xls" and not (out / f"{p.stem}.xlsx").exists()
    ]
    for chunk in (pending[i : i + 40] for i in range(0, len(pending), 40)):
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "xlsx", "--outdir", str(out)]
            + [str(p) for p in chunk],
            capture_output=True,
        )
    for p in pending:
        if not (out / f"{p.stem}.xlsx").exists():
            subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--convert-to",
                    "xlsx",
                    "--outdir",
                    str(out),
                    str(p),
                ],
                capture_output=True,
            )
    missing = [p.name for p in pending if not (out / f"{p.stem}.xlsx").exists()]
    if missing:
        print(f"NOT CONVERTED ({source.name}): {missing}")


# --- stage 3: the truth, per the first registration -----------------------


def _truth_from_comments(subjects: list[str]) -> set[tuple[str, str, str]]:
    def map_gt(name: str) -> tuple[str, str] | None:
        base = name.rsplit(".", 1)[0]
        best = None
        for s in subjects:
            if base == s or base.startswith(s + "_"):
                if best is None or len(s) > len(best):
                    best = s
        if best is None:
            return None
        sheet = base[len(best) + 1 :] if len(base) > len(best) else ""
        return best, sheet

    truth: set[tuple[str, str, str]] = set()
    unmapped = []
    for path in sorted(glob.glob(f"{WORK}/gt_xlsx/*.xlsx")):
        name = path.rsplit("/", 1)[-1]
        hit = map_gt(name)
        wb = load_workbook(path)
        cells = [
            c.coordinate
            for ws in wb.worksheets
            for row in ws.iter_rows()
            for c in row
            if c.comment is not None
        ]
        if hit is None:
            if cells:
                unmapped.append((name, len(cells)))
            continue
        book, sheet = hit
        for cell in cells:
            truth.add((book, sheet, cell))
    print(f"truth cells mapped: {len(truth)} (registration figure 1973)")
    print(f"unmapped gt files with comments: {unmapped}")
    return truth


# --- stage 4: the frozen sweep scored, per the first registration ---------

RECT = re.compile(r"filled across \d+ cells \(([^)]+?) to ([^)]+?)\)")
A1 = re.compile(r"^(?:(.*)!)?\$?([A-Z]{1,3})\$?(\d+)$")


def _expand(a: str, b: str, default_sheet: str):
    ma, mb = A1.match(a.strip()), A1.match(b.strip())
    if not ma or not mb:
        return
    sheet = ma.group(1) or default_sheet
    c1 = column_index_from_string(ma.group(2))
    c2 = column_index_from_string(mb.group(2))
    r1, r2 = int(ma.group(3)), int(mb.group(3))
    if (c2 - c1 + 1) * (abs(r2 - r1) + 1) > 5000:
        return
    for col in range(min(c1, c2), max(c1, c2) + 1):
        for row in range(min(r1, r2), max(r1, r2) + 1):
            yield sheet, f"{get_column_letter(col)}{row}"


def _findings() -> list[tuple[str, str, set[tuple[str, str]]]]:
    sweep = json.loads((ARCHIVE / "sweep-cold-run.json").read_text())
    out = []
    for entry in sweep:
        book = entry["file"].rsplit(".", 1)[0]
        for f in entry["findings"]:
            sheet = f.get("sheet", "")
            cells: set[tuple[str, str]] = set()
            ref = f.get("ref", "")
            m = A1.match(ref if "!" in ref else f"{sheet}!{ref}")
            if m:
                cells.add((m.group(1) or sheet, f"{m.group(2)}{m.group(3)}"))
            for token in (f.get("cells") or "").split(", "):
                token = token.strip()
                if not token:
                    continue
                m = A1.match(token if "!" in token else f"{sheet}!{token}")
                if m:
                    cells.add((m.group(1) or sheet, f"{m.group(2)}{m.group(3)}"))
            for m in RECT.finditer(f.get("detail", "")):
                cells.update(_expand(m.group(1), m.group(2), sheet))
            out.append((book, f["rule"], cells))
    return out


def _score_sweep(
    findings: list[tuple[str, str, set[tuple[str, str]]]],
    truth: set[tuple[str, str, str]],
) -> None:
    covered_by = defaultdict(set)
    for book, rule, cells in findings:
        for sheet, cell in cells:
            key = (book, sheet, cell)
            if key in truth:
                covered_by[key].add(rule)

    n_truth, n_cov = len(truth), len(covered_by)
    rule_cov = Counter(r for rules in covered_by.values() for r in rules)
    agree: Counter[str] = Counter()
    per_rule: Counter[tuple[str, str]] = Counter()
    for book, rule, cells in findings:
        if rule in OUT_OF_SCOPE:
            per_rule[(rule, "oos")] += 1
            continue
        per_rule[(rule, "all")] += 1
        if any((book, s, c) in truth for s, c in cells):
            agree[rule] += 1

    print(f"COVERAGE: {n_cov}/{n_truth} = {n_cov / max(n_truth, 1):.1%}")
    for r, n in rule_cov.most_common():
        print(f"  covered-by {r}: {n}")
    in_scope = sum(n for (r, k), n in per_rule.items() if k == "all")
    agreed = sum(agree.values())
    print(f"AGREEMENT: {agreed}/{in_scope} = {agreed / max(in_scope, 1):.1%}")
    for (r, k), n in sorted(per_rule.items()):
        if k == "all":
            print(f"  {r}: {agree[r]}/{n} = {agree[r] / n:.1%}")
    oos = {r: n for (r, k), n in per_rule.items() if k == "oos"}
    print("out of scope (reported, unscored):", oos)


# --- stage 5: the head-to-head, per the second registration ---------------

CELL = re.compile(r"^[A-Z]{1,3}\d+$")


def _cells_of(text) -> set[str]:
    out = set()
    for token in re.split(r"[,;\s]+", str(text or "")):
        token = token.strip().upper()
        if CELL.match(token):
            out.add(token)
    return out


def _head_to_head(
    findings: list[tuple[str, str, set[tuple[str, str]]]],
    comment_truth: set[tuple[str, str, str]],
) -> None:
    ws = load_workbook(WORK / "smell_detection_result.xlsx")["Sheet1"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    tools = ["Custodes", "AmCheck", "UCheck", "Dimension", "Excel"]
    truth: set[tuple[str, str, str]] = set()
    flags: dict[str, set[tuple[str, str, str]]] = {t: set() for t in tools}
    for row in rows:
        if row[1] is None:
            continue
        book = str(row[1]).rsplit(".", 1)[0]
        sheet = str(row[2] or "").strip()
        for cell in _cells_of(row[3]):
            truth.add((book, sheet, cell))
        for tool, col in zip(tools, row[4:9]):
            for cell in _cells_of(col):
                flags[tool].add((book, sheet, cell))

    ct = {(b, s.strip(), c) for b, s, c in comment_truth}
    tt = {(b, s.strip(), c) for b, s, c in truth}
    print(
        f"truth: results-file {len(tt)} vs comments {len(ct)}; "
        f"only-file {len(tt - ct)}, only-comments {len(ct - tt)}"
    )

    ours: set[tuple[str, str, str]] = set()
    for book, rule, cells in findings:
        if rule in OUT_OF_SCOPE:
            continue
        for sheet, cell in cells:
            ours.add((book, sheet.strip(), cell))

    def axes(flagged: set[tuple[str, str, str]]):
        hit = len(flagged & tt)
        return (
            hit,
            len(flagged),
            (hit / len(tt) if tt else 0),
            (hit / len(flagged) if flagged else 0),
        )

    print(f"\n{'tool':12} {'flagged':>8} {'hits':>6} {'coverage':>9} {'rightness':>10}")
    for tool in tools:
        stripped = {(b, s.strip(), c) for b, s, c in flags[tool]}
        hit, n, cov, rig = axes(stripped)
        print(f"{tool:12} {n:8} {hit:6} {cov:9.1%} {rig:10.1%}")
    hit, n, cov, rig = axes(ours)
    print(f"{'Swens':12} {n:8} {hit:6} {cov:9.1%} {rig:10.1%}")


def main() -> None:
    WORK.mkdir(exist_ok=True)
    _unpack()
    _convert(WORK / "subjects", WORK / "xlsx")
    _convert(WORK / "groundtruth", WORK / "gt_xlsx")
    if not (WORK / "smell_detection_result.xlsx").exists():
        subprocess.run(
            [
                "soffice",
                "--headless",
                "--convert-to",
                "xlsx",
                "--outdir",
                str(WORK),
                str(_checked("smell_detection_result/smell_detection_result.xls")),
            ],
            capture_output=True,
        )

    subjects = sorted(p.stem for p in (WORK / "subjects").iterdir())
    print(f"subjects: {len(subjects)}")
    truth = _truth_from_comments(subjects)
    findings = _findings()
    _score_sweep(findings, truth)
    print()
    _head_to_head(findings, truth)


if __name__ == "__main__":
    sys.exit(main())
