"""Run the model audit across a corpus of real spreadsheets.

Everything measured before this ran against models built by one careful
author. That answers whether the audit is quiet on *good* work, and it
says nothing about the false-positive rate on spreadsheets in the wild —
which is the number that decides whether a banker opens the tool twice.

**EUSES** is the corpus the whole spreadsheet-error literature is built
on: 4,499 real workbooks harvested from the web, on Zenodo under
CC-BY-4.0. Nobody has marked which of their cells are wrong, so precision
is not measurable here either. What *is* measurable, and matters more at
this stage, is the rate — how loud the audit is on a thousand
spreadsheets that were never written to be checked.

Two categories are used by default, `financial` and `modeling`, because
they are the closest thing in the corpus to the work this product is for.
The others are grade books, inventories and homework.

    uv run python scripts/corpus_eval.py [directory]

The corpus is downloaded, not vendored — 50MB of somebody else's files,
and the licence permits redistribution but the repository is not the
place for it.
"""

import glob
import signal
import sys
import time
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook

ZENODO = "https://zenodo.org/records/581673/files/{}.zip?download=1"
CATEGORIES = ("financial", "modeling")
CACHE = Path(__file__).resolve().parents[1] / ".corpus-cache"

#: How long one spreadsheet may take before it is abandoned. A corpus
#: harvested from the open web contains files that are enormous, corrupt,
#: or both, and one of them must not stop the other fifteen hundred. The
#: count of skipped files is reported, because a run that quietly dropped
#: the hard cases is not a measurement.
BUDGET_SECONDS = 20


class TooSlow(Exception):
    pass


#: A model with more findings than this per hundred cells is either
#: badly broken or being misread, and the difference is only visible by
#: hand. Printed so that the tail gets looked at rather than averaged away.
LOUD = 5.0


def fetch() -> Path:
    CACHE.mkdir(exist_ok=True)
    for name in CATEGORIES:
        folder = CACHE / name
        if folder.exists():
            continue
        archive = CACHE / f"{name}.zip"
        if not archive.exists():
            print(f"  fetching {name}.zip from Zenodo")
            request = urllib.request.Request(
                ZENODO.format(name), headers={"User-Agent": "Claidor audit research"}
            )
            with urllib.request.urlopen(request, timeout=600) as response:
                archive.write_bytes(response.read())
        folder.mkdir()
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(folder)
    return CACHE


def run(root: Path) -> None:
    files = sorted(
        glob.glob(str(root / "**" / "*.xls"), recursive=True)
        + glob.glob(str(root / "**" / "*.XLS"), recursive=True)
        + glob.glob(str(root / "**" / "*.xlsx"), recursive=True)
    )
    print(f"{len(files)} spreadsheets under {root}")

    start = time.time()
    read = failed = 0
    cells = formulas = 0
    rules: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    clean = 0
    loud: list[tuple[float, int, int, str]] = []

    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TooSlow()))

    for index, path in enumerate(files, start=1):
        if index % 200 == 0:
            print(f"    ...{index}/{len(files)}", flush=True)
        try:
            signal.setitimer(signal.ITIMER_REAL, BUDGET_SECONDS)
            book = read_workbook(path)
            result = audit(book)
        except Exception as error:
            failed += 1
            reasons[type(error).__name__] += 1
            continue
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)

        read += 1
        cells += len(book.cells)
        here = sum(1 for cell in book.cells.values() if cell.formula)
        formulas += here
        rules.update(finding.rule for finding in result.errors)
        if not result.errors:
            clean += 1
        elif here:
            # Per *cell*, not per formula: `error-value` fires on cells
            # that hold a broken reference whether or not they calculate,
            # so dividing by the formula count reported one file at 400%.
            loud.append(
                (
                    100 * len(result.errors) / max(len(book.cells), 1),
                    len(result.errors),
                    len(book.cells),
                    Path(path).name,
                )
            )

    took = time.time() - start
    total = sum(rules.values())
    print(f"  read {read}, unreadable {failed}  ({dict(reasons)})")
    print(f"  {cells:,} cells, {formulas:,} formulas, {took:.0f}s")
    print(f"  errors {total} = {total / max(formulas, 1):.3%} of formulas")
    print(f"  spreadsheets with no errors at all: {clean}/{read} ({clean / read:.0%})")
    for rule, count in rules.most_common():
        print(f"    {rule:<24} {count:>5}")

    noisy = [row for row in loud if row[0] >= LOUD]
    print(f"\n  louder than {LOUD:.0f} findings per 100 cells: {len(noisy)}")
    for rate, count, here, name in sorted(noisy, reverse=True)[:10]:
        print(f"    {name[:44]:<44} {count:>4} / {here:>6} cells  ({rate:.0f}%)")


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv) > 1 else fetch())
