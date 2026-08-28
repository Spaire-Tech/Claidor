"""Information the file already carries that nobody read.

An .xlsx/.xlsm is a zip. Every sheet is its own entry with its own
CRC-32. Two versions whose sheet entries share a CRC are **byte
identical** — not « probably unchanged », identical — and no
comparison of them can produce an item. That is exact, needs no
labeller, and costs a directory read.

The question this answers: on a real revision, how much of the
workbook is provably untouched?
"""
import sys, zipfile
from pathlib import Path

C = Path("/home/user/Claidor/server/scripts/cascade")
S = Path("/home/user/Claidor/server/scripts/corpus_sft")

def sheets(path: Path) -> dict[str, tuple[int, int]]:
    with zipfile.ZipFile(path) as z:
        return {
            i.filename: (i.CRC, i.file_size)
            for i in z.infolist()
            if i.filename.startswith("xl/worksheets/") and i.filename.endswith(".xml")
        }

for label, old, new in (
    ("cascade v1 → doctored", C / "cascade_model.xlsx", C / "audit_fixture.xlsx"),
    ("levenmouth → itself",   S / "levenmouth_model.xlsm", S / "levenmouth_model.xlsm"),
    ("kelso → levenmouth",    S / "kelso_model.xlsm", S / "levenmouth_model.xlsm"),
):
    a, b = sheets(old), sheets(new)
    shared = a.keys() & b.keys()
    same = [n for n in shared if a[n] == b[n]]
    bytes_same = sum(a[n][1] for n in same)
    bytes_all = sum(a[n][1] for n in a)
    print(f"{label}")
    print(f"   sheets: {len(a)} old, {len(b)} new, {len(shared)} shared, "
          f"{len(same)} byte-identical")
    print(f"   bytes provably untouched: {bytes_same:,} of {bytes_all:,} "
          f"({100*bytes_same/max(bytes_all,1):.1f}%)")
