"""What time bases our corpora actually contain.

    cd server && uv run python -m scripts.recalc_units_periods

The orders make `period` the highest-value dimension: « a monthly
figure in an annual line » is the flagship finding, and `period` is
what stands between us and it. The founder's fourth research round
reports that **not one of 27 real models is monthly**, one is
semi-annual, and twenty-four have no date axis at all.

Before building an answer key for `period`, measure whether the
thing the key is meant to test **exists in anything we hold**. A
check for a monthly figure in an annual line needs monthly figures
to have ever been seen; if no corpus contains one, no key drawn from
our corpora can test that case, and that is the same trap as a key
that holds one value for `kind` — caught this time before the key is
built rather than after it is published.

Column headers are classified by shape alone: month names and
`Jan-24`-style headers are monthly, `Q1`/`H1` quarterly or
half-yearly, `FY2024` and `2021/22` annual, bare years annual,
« Year 1 » a relative axis with no calendar at all.
"""

import re
import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook

MONTHLY = re.compile(
    r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*"
    r"([\s\-/']*\d{2,4})?$|^\d{1,2}[-/]\d{4}$",
    re.I,
)
QUARTERLY = re.compile(r"^(q[1-4]|[1-4]q)([\s\-/']*\d{2,4})?$", re.I)
HALF = re.compile(r"^(h[12]|[12]h)([\s\-/']*\d{2,4})?$", re.I)
ANNUAL = re.compile(r"^(fy)?\s*(19|20)\d{2}([\s\-/]\d{2,4})?$", re.I)
RELATIVE = re.compile(r"^(year|yr|period|per)\s*\.?\s*\d+$", re.I)


def classify(text: str) -> str | None:
    stripped = text.strip()
    if not stripped or len(stripped) > 16:
        return None
    for name, pattern in (
        ("monthly", MONTHLY),
        ("quarterly", QUARTERLY),
        ("half-yearly", HALF),
        ("annual", ANNUAL),
        ("relative", RELATIVE),
    ):
        if pattern.match(stripped):
            return name
    return None


def main() -> int:
    roots = [Path(p) for p in sys.argv[1:]] or [
        Path("scripts/corpus_au_uk"),
        Path("scripts/corpus_sft"),
    ]
    paths = sorted(p for root in roots for p in root.rglob("*.xls[xm]"))
    grand: Counter = Counter()
    per_file = {}
    for path in paths:
        try:
            book = load_workbook(path, read_only=True, data_only=True)
        except Exception as error:
            print(f"{path.name}: could not open — {error}")
            continue
        counts: Counter = Counter()
        try:
            for sheet in book.worksheets:
                for row in sheet.iter_rows(max_row=40):
                    for cell in row:
                        if isinstance(cell.value, str):
                            axis = classify(cell.value)
                            if axis:
                                counts[axis] += 1
        finally:
            book.close()
        per_file[path.name] = counts
        grand += counts
        if counts:
            print(f"{path.name}: {dict(counts.most_common())}", flush=True)
    print(f"\nacross {len(paths)} files: {dict(grand.most_common())}")
    monthly = grand["monthly"]
    print(
        f"\nmonthly headers anywhere: {monthly}. "
        + (
            "A « monthly figure in an annual line » check has no positive "
            "example in anything we hold, so no key drawn from these corpora "
            "can test it."
            if monthly == 0
            else "There is monthly material to draw on."
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
