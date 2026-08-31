import json
import sys
import warnings
from pathlib import Path

# The filter has to be installed before the readers are imported, or
# openpyxl's warnings arrive during import and drown the output this
# script exists to print. Deliberate, hence the waivers.
warnings.filterwarnings("ignore")
from polar.tieout.units import classify_sheet
from polar.tieout.units.inference import rows_from_cells
from polar.tieout.workbook import read_workbook

planted, truth_file = Path(sys.argv[1]), Path(sys.argv[2])
site = json.loads(truth_file.read_text())["planted"][0]
sheet, row, ref = site["sheet"], site["flip_row"], site["sum_ref"]
for label, path in (
    ("host", "scripts/corpus_sft/inverness_college_model.xlsm"),
    ("planted", str(planted)),
):
    b = read_workbook(path)
    rows = rows_from_cells(b.cells, sheet)
    labels = classify_sheet(rows)
    lab = labels.get((sheet, row))
    fmts = sorted(
        {c.number_format for c in b.cells.values() if c.sheet == sheet and c.row == row}
    )
    print(
        f"{label:<8} row {row}: currency={lab.currency if lab else 'NO ROW'} fmts={fmts[:2]}"
    )
    cell = b.cells.get(ref)
    if cell:
        terms = [
            (
                p,
                labels.get((sheet, b.cells[p].row)).currency
                if p in b.cells and (sheet, b.cells[p].row) in labels
                else "?",
            )
            for p in (cell.precedents or ())
        ]
        print(
            f"         {ref} = {cell.formula[:50]}  precedent currencies: {terms[:6]}"
        )
