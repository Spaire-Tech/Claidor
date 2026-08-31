"""The Tasi re-score — the registered instrument, committed.

Implements `docs/pierce/tasi-benchmark.md` exactly as written: our
engine scored against a second, independent expert labelling of the
same 70 files the CUSTODES benchmark uses, the seven published
tools tabulated on that same truth with this same scorer, and the
disagreement between the two label sets measured as its own result.

    uv run python -m scripts.custodes_tasi

Stages, reusing the CUSTODES scorer's machinery so that one
conversion serves both label sets and no artefact can favour
either:

  1. unpack + convert the 70 subjects (`scripts.custodes_score`);
  2. shallow-clone Tasi into the work dir — **never committed and
     never redistributed**: the repository carries no licence, so
     this round benchmarks internally and cites the paper;
  3. read Tasi's truth and tool columns from
     `Groundtruth and tool results.xls`;
  4. sweep the converted subjects with today's engine, and read the
     frozen 23 August cold run beside it;
  5. score both sweeps against both label sets, tabulate the seven
     tools, and measure the label disagreement.

Cite: Zhang, Lv, Dong, Dou, Han, Zhang, Wei, Ye, *Semantic Table
Structure Identification in Spreadsheets*, ISSTA '21.
"""

import subprocess
import warnings
from collections import Counter, defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")

import xlrd
from openpyxl.utils import get_column_letter

from scripts.custodes_score import (
    A1,
    OUT_OF_SCOPE,
    RECT,
    WORK,
    _expand,
    _findings,
    _unpack,
)

TASI_URL = "https://github.com/tcse-iscas/Tasi.git"
TASI = WORK / "tasi"
TRUTH_XLS = "Spreadsheet Error Dataset/Subject/Groundtruth and tool results.xls"

#: The tool columns, in the order the authors print them.
TOOLS = {
    "TasiError": 8,
    "Custodes": 9,
    "Cacheck": 10,
    "ExceLint": 11,
    "Excel": 12,
    "AmCheck": 13,
    "Ucheck&Dimension": 14,
}
GROUNDTRUTH, SERIOUS, FORMULA_ERROR, MISSING_FORMULA = 4, 5, 6, 7


def _clone() -> Path:
    """Tasi, shallow, into the work dir. Present already: left alone."""
    if not (TASI / TRUTH_XLS).exists():
        TASI.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", "--depth", "1", TASI_URL, str(TASI)],
            capture_output=True,
        )
    path = TASI / TRUTH_XLS
    if not path.exists():
        raise SystemExit(f"Tasi ground truth not reachable at {path}")
    return path


def _cells(text: str) -> set[str]:
    out = set()
    for token in str(text).split(","):
        token = token.strip().upper()
        if token:
            out.add(token)
    return out


def _subjects() -> list[Path]:
    """The 70 originals, any suffix case (`summ0602.XLS` is one)."""
    return sorted(
        p for p in (WORK / "subjects").iterdir() if p.suffix.lower() == ".xls"
    )


def _sheet_index() -> dict[str, list[str]]:
    """Workbook stem (lowercased) -> its sheet names, read straight from
    the legacy `.xls` per the 27 August amendment: LibreOffice cannot
    load these files in this container, and no conversion means no
    conversion artefacts."""
    index: dict[str, list[str]] = {}
    for path in _subjects():
        try:
            book = xlrd.open_workbook(str(path), on_demand=True)
            index[path.stem.lower()] = list(book.sheet_names())
            book.release_resources()
        except Exception as problem:
            print(f"  unreadable {path.name}: {str(problem)[:60]}")
    return index


def _custodes_truth(subjects: list[str]) -> set[tuple[str, str, str]]:
    """The CUSTODES truth, extracted by the registered rule — the
    comment-bearing cells of the 291 annotated sheets, mapped by
    longest-prefix match — but read directly through xlrd's note map
    rather than through a conversion this container cannot perform."""

    def mapped(name: str) -> tuple[str, str] | None:
        base = name.rsplit(".", 1)[0]
        best = None
        for subject in subjects:
            if base == subject or base.startswith(subject + "_"):
                if best is None or len(subject) > len(best):
                    best = subject
        if best is None:
            return None
        return best, base[len(best) + 1 :] if len(base) > len(best) else ""

    truth: set[tuple[str, str, str]] = set()
    unmapped: list[str] = []
    for path in sorted((WORK / "groundtruth").iterdir()):
        if path.suffix.lower() not in (".xls", ".xlt"):
            continue
        hit = mapped(path.name)
        try:
            book = xlrd.open_workbook(str(path))
        except Exception as problem:
            print(f"  gt unreadable {path.name}: {str(problem)[:50]}")
            continue
        cells = [
            f"{get_column_letter(col + 1)}{row + 1}"
            for sheet in book.sheets()
            for (row, col) in (getattr(sheet, "cell_note_map", {}) or {})
        ]
        if hit is None:
            if cells:
                unmapped.append(path.name)
            continue
        for cell in cells:
            truth.add((hit[0].lower(), hit[1], cell))
    print(f"CUSTODES truth cells: {len(truth)} (paper 1974; converted route gave 1973)")
    if unmapped:
        print(f"  unmapped ground-truth files: {unmapped[:6]}")
    return truth


def _resolve(sheets: list[str], wanted: str) -> str | None:
    """Exact, then case-insensitive, then stripped — the registered
    ladder. None when the sheet cannot be found at all."""
    if wanted in sheets:
        return wanted
    lower = {s.lower(): s for s in sheets}
    if wanted.lower() in lower:
        return lower[wanted.lower()]
    stripped = {s.strip().lower(): s for s in sheets}
    return stripped.get(wanted.strip().lower())


def _tasi_labels(
    path: Path, sheets: dict[str, list[str]]
) -> tuple[
    dict[str, set[tuple[str, str, str]]],
    dict[str, set[tuple[str, str, str]]],
    list[str],
]:
    """(truth sets by class, tool detections by name, unmapped rows)."""
    sheet = xlrd.open_workbook(str(path)).sheet_by_index(0)
    truth: dict[str, set[tuple[str, str, str]]] = {
        "groundtruth": set(),
        "serious": set(),
        "formula-error": set(),
        "missing-formula": set(),
    }
    tools: dict[str, set[tuple[str, str, str]]] = {name: set() for name in TOOLS}
    unmapped: list[str] = []
    for row in range(1, sheet.nrows):
        book = Path(str(sheet.cell_value(row, 2))).stem.lower()
        wanted = str(sheet.cell_value(row, 3)).strip()
        names = sheets.get(book)
        if names is None:
            unmapped.append(f"{book} (workbook not converted)")
            continue
        resolved = _resolve(names, wanted)
        if resolved is None:
            unmapped.append(f"{book}!{wanted} (sheet not found)")
            continue
        for label, column in (
            ("groundtruth", GROUNDTRUTH),
            ("serious", SERIOUS),
            ("formula-error", FORMULA_ERROR),
            ("missing-formula", MISSING_FORMULA),
        ):
            for cell in _cells(sheet.cell_value(row, column)):
                truth[label].add((book, resolved, cell))
        for name, column in TOOLS.items():
            for cell in _cells(sheet.cell_value(row, column)):
                tools[name].add((book, resolved, cell))
    return truth, tools, unmapped


def _fresh_sweep() -> list[tuple[str, str, set[tuple[str, str]]]]:
    """Today's engine over the converted subjects, in the same cell-set
    shape the frozen sweep is read into."""
    from polar.tieout.audit import audit
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import read_workbook

    out: list[tuple[str, str, set[tuple[str, str]]]] = []
    paths = _subjects()
    for at, path in enumerate(paths, start=1):
        book = path.stem.lower()
        try:
            loaded = read_workbook(str(path))
            result = audit(loaded, read_structure(loaded).axes)
        except Exception as problem:
            print(f"  FAILED {path.name}: {str(problem)[:70]}")
            continue
        for finding in result.findings:
            cells: set[tuple[str, str]] = set()
            sheet = finding.sheet
            ref = finding.ref
            m = A1.match(ref if "!" in ref else f"{sheet}!{ref}")
            if m:
                cells.add((m.group(1) or sheet, f"{m.group(2)}{m.group(3)}"))
            for token in (finding.cells or "").split(", "):
                token = token.strip()
                if not token:
                    continue
                m = A1.match(token if "!" in token else f"{sheet}!{token}")
                if m:
                    cells.add((m.group(1) or sheet, f"{m.group(2)}{m.group(3)}"))
            for m in RECT.finditer(finding.detail):
                cells.update(_expand(m.group(1), m.group(2), sheet))
            out.append((book, finding.rule, cells))
        if at % 20 == 0:
            print(f"  swept {at}/{len(paths)}", flush=True)
    return out


def _score(
    label: str,
    findings: list[tuple[str, str, set[tuple[str, str]]]],
    truth: set[tuple[str, str, str]],
    lower_books: bool = True,
) -> None:
    """Coverage and agreement, exactly as the CUSTODES registration
    defines them and this one repeats."""
    covered_by = defaultdict(set)
    for book, rule, cells in findings:
        key_book = book.lower() if lower_books else book
        for sheet, cell in cells:
            key = (key_book, sheet, cell)
            if key in truth:
                covered_by[key].add(rule)
    n_truth, n_cov = len(truth), len(covered_by)
    print(f"\n{label}")
    print(f"  COVERAGE: {n_cov}/{n_truth} = {n_cov / max(n_truth, 1):.1%}")
    for rule, n in Counter(
        r for rules in covered_by.values() for r in rules
    ).most_common():
        print(f"    covered-by {rule}: {n}")
    in_scope = agreed = 0
    per_rule: Counter[str] = Counter()
    agree: Counter[str] = Counter()
    for book, rule, cells in findings:
        if rule in OUT_OF_SCOPE:
            continue
        key_book = book.lower() if lower_books else book
        per_rule[rule] += 1
        in_scope += 1
        if any((key_book, s, c) in truth for s, c in cells):
            agree[rule] += 1
            agreed += 1
    print(f"  AGREEMENT: {agreed}/{in_scope} = {agreed / max(in_scope, 1):.1%}")
    for rule, n in sorted(per_rule.items()):
        print(f"    {rule}: {agree[rule]}/{n} = {agree[rule] / n:.1%}")


def _tool_table(
    tools: dict[str, set[tuple[str, str, str]]], truth: set[tuple[str, str, str]]
) -> None:
    """The seven tools on this truth with this scorer. Their outputs are
    cell sets, so for them the honest words are recall and precision —
    never the same words as our coverage and agreement."""
    print(f"\nTHE SEVEN TOOLS (truth = {len(truth)} cells)")
    print(f"  {'tool':<20} {'detected':>9} {'hits':>7} {'recall':>8} {'precision':>10}")
    for name in TOOLS:
        detected = tools[name]
        hits = len(detected & truth)
        recall = hits / max(len(truth), 1)
        precision = hits / max(len(detected), 1)
        print(
            f"  {name:<20} {len(detected):>9} {hits:>7} "
            f"{recall:>7.1%} {precision:>9.1%}"
        )


def _disagreement(
    custodes: set[tuple[str, str, str]], tasi: set[tuple[str, str, str]]
) -> None:
    """Two expert labellings of identical files, on the sheets both
    cover. Not an error bar — two overlapping questions."""
    shared = {(b, s) for b, s, _ in custodes} & {(b, s) for b, s, _ in tasi}
    a = {k for k in custodes if (k[0], k[1]) in shared}
    b = {k for k in tasi if (k[0], k[1]) in shared}
    both, union = a & b, a | b
    print("\nTHE LABEL DISAGREEMENT (shared sheets only)")
    print(f"  shared (workbook, sheet) pairs: {len(shared)}")
    print(f"  CUSTODES cells: {len(a)} | Tasi cells: {len(b)}")
    print(
        f"  in both: {len(both)} | CUSTODES only: {len(a - b)} | Tasi only: {len(b - a)}"
    )
    print(f"  Jaccard: {len(both) / max(len(union), 1):.1%} of their union")


def main() -> None:
    WORK.mkdir(exist_ok=True)
    _unpack()
    path = _clone()

    sheets = _sheet_index()
    print(f"subjects read directly as .xls: {len(sheets)}")
    truth, tools, unmapped = _tasi_labels(path, sheets)
    print(f"Tasi truth cells: {len(truth['groundtruth'])} (registration figure 3702)")
    for label in ("serious", "formula-error", "missing-formula"):
        print(f"  {label}: {len(truth[label])}")
    print(f"unmapped rows ({len(unmapped)}): {unmapped[:8]}")

    print("\nsweeping the 70 subjects with today's engine...")
    fresh = _fresh_sweep()
    print(f"today's engine: {len(fresh)} findings")
    frozen = _findings()
    print(f"frozen cold run: {len(frozen)} findings")

    for name, findings in (("TODAY'S ENGINE", fresh), ("FROZEN COLD RUN", frozen)):
        for label in ("groundtruth", "serious", "formula-error", "missing-formula"):
            _score(f"{name} vs Tasi {label}", findings, truth[label])

    custodes = _custodes_truth(sorted(p.stem for p in _subjects()))
    for name, findings in (("TODAY'S ENGINE", fresh), ("FROZEN COLD RUN", frozen)):
        _score(f"{name} vs CUSTODES truth", findings, custodes)

    _tool_table(tools, truth["groundtruth"])
    _disagreement(custodes, truth["groundtruth"])


if __name__ == "__main__":
    main()
