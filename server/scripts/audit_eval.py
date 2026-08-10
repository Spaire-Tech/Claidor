"""Run the model audit against real models, and say what it found.

Recall is measured in `tests/tieout/test_audit.py`, against a fixture
whose defects are planted at known addresses. **Precision cannot be
measured here**, and this script does not pretend otherwise: the models it
downloads have no labelled ground truth, so what it reports is a *rate*,
and whether a finding is right is a question for a reader.

The rate is still the number that decides the product. The published
benchmark on the only hand-labelled corpus — seventy sheets from EUSES,
marked by the CUSTODES authors — is a mean per-workbook precision of 20.3%
for CUSTODES and a median of 1.0 for ExceLint, on the same data. Running
against it is the honest next measurement and it is not possible from
here: `sccpu2.cse.ust.hk` is outside this environment's egress allowlist,
and the corpus is legacy binary `.xls`, which needs a reader this project
does not have.

Models are downloaded rather than vendored. They are Aswath Damodaran's
teaching models, free and explicitly not copy-protected, but permission to
use is not permission to redistribute inside somebody else's repository.

    uv run python scripts/audit_eval.py
"""

import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook

#: Real valuation models, in `.xlsx` rather than the legacy `.xls` most of
#: the collection is in. All four carry deliberate circular references and
#: switch on iterative calculation to say so, which is what makes them the
#: right false-positive test for the circularity rule.
MODELS = (
    "capstru.xlsx",
    "fcffginzu.xlsx",
    "fcffsimpleginzu.xlsx",
    "fcffsimpleginzuCorona.xlsx",
)
SOURCE = "https://pages.stern.nyu.edu/~adamodar/pc/"
CACHE = Path(__file__).resolve().parents[1] / ".model-cache"

CASCADE = Path(__file__).resolve().parent / "cascade"


def fetch() -> list[Path]:
    CACHE.mkdir(exist_ok=True)
    paths = []
    for name in MODELS:
        target = CACHE / name
        if not target.exists():
            print(f"  fetching {name}")
            request = urllib.request.Request(
                SOURCE + name, headers={"User-Agent": "Claidor model-audit research"}
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                target.write_bytes(response.read())
        paths.append(target)
    return paths


def report(path: Path) -> None:
    book = read_workbook(str(path))
    result = audit(book)
    formulas = sum(1 for cell in book.cells.values() if cell.formula)

    print("=" * 78)
    print(f"{path.name}")
    print("=" * 78)
    print(
        f"  {len(book.sheets)} sheets, {result.examined} cells, {formulas} formulas, "
        f"iterative calculation {'on' if book.iterative else 'off'}"
    )
    print(f"  {len(result.errors)} errors, {len(result.smells)} smells")
    for rule, count in sorted(result.by_rule().items(), key=lambda item: -item[1]):
        print(f"    {rule:<24} {count:>4}")

    if result.errors:
        print("\n  ERRORS — read these, they are the ones that claim to be wrong")
        for finding in result.errors[:12]:
            print(f"    {finding.ref:<28} {finding.rule}  [{finding.source}]")
            print(f"      {finding.detail[:150]}")
    print()


if __name__ == "__main__":
    print("Downloading real models (cached after the first run)")
    paths = [CASCADE / "cascade_model.xlsx", CASCADE / "audit_fixture.xlsx"]
    paths += fetch()
    print()
    for path in paths:
        report(path)
    print("Precision is not measured above. See this module's docstring.")
