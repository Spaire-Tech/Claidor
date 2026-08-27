"""The check that stopped A6 reaching the wrong conclusion.

The converted `.xlsb` shows 10,715 formulas; the original's records
show 10,715 cells of pyxlsb type 4, which pyxlsb's own constant
table names BOOL. Two readings fit the counts — either type 4 is a
formula record pyxlsb mislabels, or the conversion invented a
formula for every boolean cell — and they lead to opposite verdicts
on the conversion.

This resolves it at a named cell rather than by argument: it takes
cells our reader calls formulas in the converted file and prints the
record type and value sitting under them in the original. The answer
is that they are boolean cells holding True, and the conversion
rewrote each one as `=TRUE()`.
"""
import io
import warnings
import zipfile

warnings.filterwarnings("ignore")
from openpyxl import load_workbook
from pyxlsb import biff12
from pyxlsb.reader import BIFF12Reader
from pyxlsb.workbook import Workbook as XlsbWorkbook

S = "/tmp/claude-0/-home-user-Claidor/a5cd5072-e5ae-51cb-9a22-88af22f786db/scratchpad"
name = {v: k for k, v in vars(biff12).items() if isinstance(v, int) and k.isupper()}

# a sheet with formulas in the converted file
wb = load_workbook(f"{S}/a6conv/out/barrhead_model.xlsx", data_only=False, read_only=True)
target_sheet = None
picks = []
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("="):
                picks.append((c.row, c.column, c.coordinate, c.value[:60]))
                if len(picks) >= 5:
                    target_sheet = ws.title
                    break
        if target_sheet:
            break
    if target_sheet:
        break
print("converted sheet:", target_sheet)
for r, col, ref, v in picks:
    print(f"  {ref}: {v}")
wb.close()

# same sheet in the original .xlsb, at the record level
z = zipfile.ZipFile("scripts/corpus_sft/barrhead_model.xlsb")
names = [n for n in z.namelist() if n.endswith("workbook.bin")]
order = []
for typ, obj in BIFF12Reader(fp=io.BytesIO(z.read(names[0]))):
    if typ == biff12.SHEET:
        order.append(obj.name)
print("original sheet order index of target:", order.index(target_sheet) if target_sheet in order else "NOT FOUND")
idx = order.index(target_sheet)
part = f"xl/worksheets/sheet{idx + 1}.bin"
want = {(r - 1, col - 1) for r, col, _, _ in picks}
row_num = -1
for typ, obj in BIFF12Reader(fp=io.BytesIO(z.read(part))):
    if typ == biff12.ROW:
        row_num = obj.r
    elif hasattr(obj, "c") and (row_num, obj.c) in want:
        print(f"  original ({row_num},{obj.c}): record type {typ} = {name.get(typ)} value={getattr(obj, 'v', None)!r}")
