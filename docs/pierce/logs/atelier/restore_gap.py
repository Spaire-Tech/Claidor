"""What each restored fact buys back, measured one fact at a time.

The rebuilt workbook the product audits carries cells and sheets, plus
`hidden_sheets` put back by hand. This asks what the other facts are
worth before deciding which to keep on the artifact.
"""
import collections, sys
from pathlib import Path
sys.path.insert(0, "/home/user/Claidor/server")
from polar.tieout.audit import audit
from polar.tieout.structure import read_structure
from polar.tieout.workbook import Workbook, read_workbook

CHEAP = ("broken_names", "foreign_names", "errors", "unparseable",
         "iterative", "populated")

def rebuilt(book: Workbook, restore: tuple[str, ...]) -> Workbook:
    thin = Workbook()
    thin.cells = dict(book.cells)
    thin.sheets = list(book.sheets)
    thin.hidden_sheets = book.hidden_sheets
    thin.very_hidden_sheets = book.very_hidden_sheets
    for name in restore:
        setattr(thin, name, getattr(book, name))
    return thin

def rules(book: Workbook) -> collections.Counter:
    result = audit(book, axes=read_structure(book).axes)
    return collections.Counter(f"{f.rule}/{f.severity}" for f in result.findings)

totals = {name: [collections.Counter(), collections.Counter()] for name in
          ("none", "cheap", "cheap+row_words")}
for path in sorted(Path("scripts/corpus_sft").glob("*.xls*")):
    if path.suffix.lower() == ".xlsb":
        continue
    try:
        book = read_workbook(str(path))
    except Exception:
        continue
    whole = rules(book)
    for label, restore in (
        ("none", ()),
        ("cheap", CHEAP),
        ("cheap+row_words", CHEAP + ("row_words",)),
    ):
        got = rules(rebuilt(book, restore))
        totals[label][0].update(whole - got)   # still missing
        totals[label][1].update(got - whole)   # invented
    print(f"{path.name}: file {sum(whole.values())}")

print("\nagainst the file's own audit, across the nine readable models")
for label in ("none", "cheap", "cheap+row_words"):
    missing, invented = totals[label]
    print(f"\n  restoring {label}:")
    print("    still missing: " + (", ".join(f"{k} ×{v}" for k, v in sorted(missing.items())) or "nothing"))
    print("    invented:      " + (", ".join(f"{k} ×{v}" for k, v in sorted(invented.items())) or "nothing"))
