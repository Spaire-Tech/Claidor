"""What the product's audit cannot see, because the file is gone.

The product never audits a file. It audits a `Workbook` rebuilt from
stored cells (`service._workbook_of`), which carries `cells` and
`sheets` and nothing else; `_audit_cells` puts `hidden_sheets` back by
hand, from a fact ingest kept on the artifact. Every other field the
reader filled at open time is empty by the time a rule reads it.

This runs both audits over the same file and prints the difference.
The rebuilt side is *generous* — it keeps every cell the reader found,
where ingest stores only the ones it could name and number — so the
gap it measures is a floor, not a ceiling.
"""
import sys, collections
from pathlib import Path
sys.path.insert(0, "/home/user/Claidor/server")
from polar.tieout.audit import audit
from polar.tieout.structure import read_structure
from polar.tieout.workbook import Workbook, read_workbook

LOST = ("errors", "unparseable", "broken_names", "foreign_names",
        "iterative", "populated", "row_words")

def rebuilt(book: Workbook) -> Workbook:
    """The same workbook as `_workbook_of` would hand back."""
    thin = Workbook()
    thin.cells = dict(book.cells)
    thin.sheets = list(book.sheets)
    #: `_audit_cells` restores these two from `artifact.counts`.
    thin.hidden_sheets = book.hidden_sheets
    thin.very_hidden_sheets = book.very_hidden_sheets
    return thin

def rules(result) -> collections.Counter:
    return collections.Counter(f"{f.rule}/{f.severity}" for f in result.findings)

lost_total: collections.Counter = collections.Counter()
gained_total: collections.Counter = collections.Counter()
for path in sorted(Path("scripts/corpus_sft").glob("*.xls*")):
    if path.suffix.lower() == ".xlsb":
        continue
    try:
        book = read_workbook(str(path))
    except Exception as exc:  # noqa: BLE001
        print(f"{path.name}: refused — {type(exc).__name__}")
        continue
    whole = rules(audit(book, axes=read_structure(book).axes))
    thin = rebuilt(book)
    part = rules(audit(thin, axes=read_structure(thin).axes))
    lost = whole - part
    gained = part - whole
    lost_total.update(lost)
    gained_total.update(gained)
    print(f"{path.name}: file {sum(whole.values())} findings, "
          f"rebuilt {sum(part.values())} — lost {sum(lost.values())}, "
          f"gained {sum(gained.values())}")
    if lost:
        print("    lost:   " + ", ".join(f"{k} ×{v}" for k, v in sorted(lost.items())))
    if gained:
        print("    gained: " + ", ".join(f"{k} ×{v}" for k, v in sorted(gained.items())))

print("\nacross the corpus")
print("  lost:   " + (", ".join(f"{k} ×{v}" for k, v in sorted(lost_total.items())) or "nothing"))
print("  gained: " + (", ".join(f"{k} ×{v}" for k, v in sorted(gained_total.items())) or "nothing"))
