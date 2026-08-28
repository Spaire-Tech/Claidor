"""Which percent convention does a corpus actually contain?

    cd server && uv run python -m scripts.recalc_units_convention [FILE ...]

The founder's fourth research round (`corpus-sources.md`, 28 Aug
fourth addendum) found that `%` means two different things in real
workbooks — a decimal fraction in three models and a whole number of
percent in three others — and that **the number format**, not the
value and not the label, separates them six times out of six.

The lead verified our own corpus carries only one of them. This
re-derives that independently and widens it to every file given,
because « our corpus contains only one convention » is the kind of
claim a lane should not take on trust when checking it costs a
minute: it decides whether E2's percent accuracy means anything at
all outside our files.
"""

import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook


#: A percent-style number format: the literal `%` outside a quoted
#: section, which is how Excel writes « show this decimal as a
#: percentage ».
def is_percent_format(fmt: str) -> bool:
    out, quoted = [], False
    for ch in fmt or "":
        if ch == '"':
            quoted = not quoted
        elif not quoted:
            out.append(ch)
    return "%" in "".join(out)


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]] or sorted(
        Path("scripts/corpus_au_uk").rglob("*.xls[xm]")
    )
    grand = Counter()
    for path in paths:
        try:
            book = load_workbook(path, read_only=True, data_only=True)
        except Exception as error:
            print(f"{path.name}: could not open — {error}")
            continue
        counts = Counter()
        biggest = 0.0
        try:
            for sheet in book.worksheets:
                for row in sheet.iter_rows():
                    for cell in row:
                        value = cell.value
                        if not isinstance(value, (int, float)) or isinstance(
                            value, bool
                        ):
                            continue
                        if not is_percent_format(cell.number_format or ""):
                            continue
                        counts["percent_formatted"] += 1
                        magnitude = abs(float(value))
                        biggest = max(biggest, magnitude)
                        if magnitude > 1.5:
                            counts["above_1.5"] += 1
        finally:
            book.close()
        grand += counts
        if counts["percent_formatted"]:
            print(
                f"{path.name}: {counts['percent_formatted']:,} percent-formatted, "
                f"{counts['above_1.5']:,} above 1.5, largest {biggest:,.4g}"
            )
    print(
        f"\ntotal: {grand['percent_formatted']:,} percent-formatted cells, "
        f"{grand['above_1.5']:,} above 1.5"
    )
    if grand["percent_formatted"] and not grand["above_1.5"]:
        print(
            "every percent-formatted cell here is a decimal fraction — this "
            "corpus contains ONE of the two real conventions, so no accuracy "
            "number measured on it says anything about the other"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
