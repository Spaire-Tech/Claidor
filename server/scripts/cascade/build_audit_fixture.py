"""Build a small model with known defects, and known non-defects.

The audit has no labelled corpus to measure against. The academic one —
CUSTODES, seventy hand-marked sheets from EUSES — is the published
benchmark, and it is unreachable from this environment's network
allowlist and would need a legacy `.xls` reader besides.

So the same approach that worked for the deck: build the ground truth.
Nine defects at known addresses, and — more valuable — eight structures
that *look* like defects and are not, because on real models it was
never recall that was in question. Reading the audit's output against
four Damodaran valuation models by hand, every rule that fired wrongly
fired on something legitimate: an input pulled straight from another
sheet, a series anchored at its first cell, a terminal year that is
supposed to compute differently, a typed history.

    uv run python scripts/cascade/build_audit_fixture.py
"""

from pathlib import Path

from openpyxl import Workbook

HERE = Path(__file__).resolve().parent
OUT = HERE / "audit_fixture.xlsx"

#: Where each defect sits, and which rule should catch it. Asserted in
#: `tests/tieout/test_audit.py`, so the fixture and its ground truth
#: cannot drift apart without a test failing.
DEFECTS = {
    "Model!E7": "inconsistent-row",
    "Model!F11": "typed-over-formula",
    "Model!D16": "skipped-cell",
    "Model!E20": "hardcode-in-formula",
    "Model!E23": "volatile",
    "Model!E26": "inconsistent-anchoring",
    "Model!C30": "error-value",
    "Model!E33": "external-link",
    "Model!E36": "circular",
}

#: Structures that must produce nothing. Every one of these was a false
#: positive on a real model before the rule that exempts it existed.
INNOCENT = (
    "B6:D6 — typed history left of the forecast boundary",
    "E9 — the first cell of a series, reaching back to the last actual",
    "I9 — the last cell of a series, no longer compounding",
    "E12 — an input pulled straight from another sheet, mid-series",
    "row 14 — an inputs row where every cell legitimately differs",
    "E17 — a SUM that reaches every row above it",
    "E39 — a formula using only innocent constants",
    "Assumptions — a sheet of typed constants, which is what inputs are",
)


def build() -> None:
    book = Workbook()

    inputs = book.active
    inputs.title = "Assumptions"
    inputs["A1"] = "Assumptions"
    inputs["A3"], inputs["B3"] = "Revenue growth", 0.08
    inputs["A4"], inputs["B4"] = "Gross margin", 0.38
    inputs["A5"], inputs["B5"] = "Tax rate", 0.25
    inputs["A6"], inputs["B6"] = "Sales to capital", 2.4
    inputs["A7"], inputs["B7"] = "Operating cost ratio", 0.62

    sheet = book.create_sheet("Model")
    sheet["A1"] = "Operating model"
    for column, year in zip("BCDEFGHI", range(2023, 2031), strict=True):
        sheet[f"{column}4"] = f"FY{year}{'A' if year <= 2025 else 'E'}"

    # Revenue: three typed actuals then a forecast. The actuals must not
    # be read as hardcodes — this is the boundary the audit finds.
    sheet["A6"] = "Revenue"
    for column, value in zip("BCD", (182.4, 204.7, 228.9), strict=True):
        sheet[f"{column}6"] = value
    for column, prior in zip("EFGHI", "DEFGH", strict=True):
        sheet[f"{column}6"] = f"={prior}6*(1+Assumptions!$B$3)"

    # INNOCENT: two more rows with the same typed history, so the sheet's
    # boundary between actuals and forecast is found by agreement. One row
    # never established it, which is realistic of nothing — a model has a
    # dozen.
    sheet["A5"] = "Units sold"
    for column, value in zip("BCD", (4.10, 4.48, 4.92), strict=True):
        sheet[f"{column}5"] = value
    for column, prior in zip("EFGHI", "DEFGH", strict=True):
        sheet[f"{column}5"] = f"={prior}5*(1+Assumptions!$B$3)"
    sheet["A8"] = "Cost of goods sold"
    for column, value in zip("BCD", (-115.9, -128.4, -141.5), strict=True):
        sheet[f"{column}8"] = value
    for column in "EFGHI":
        sheet[f"{column}8"] = f"=-{column}6*(1-Assumptions!$B$4)"

    # DEFECT: one cell in the middle of a series does something else.
    sheet["A7"] = "Revenue growth"
    for column, prior in zip("CDEFGHI", "BCDEFGH", strict=True):
        sheet[f"{column}7"] = f"={column}6/{prior}6-1"
    sheet["E7"] = "=E6/C6-1"

    # INNOCENT: the ends of a series may differ from its middle.
    sheet["A9"] = "Gross profit"
    for column in "EFGHI":
        sheet[f"{column}9"] = f"={column}6*Assumptions!$B$4"
    sheet["E9"] = "=E6*Assumptions!$B$4+0"
    sheet["I9"] = "=I6*Assumptions!$B$4"

    # DEFECT: a constant typed over a formula, mid-series.
    sheet["A11"] = "Operating costs"
    for column in "EFGHI":
        sheet[f"{column}11"] = f"=-{column}6*Assumptions!$B$7"
    sheet["F11"] = -140.0

    # INNOCENT: an input pulled straight from another sheet, mid-series.
    sheet["A12"] = "Sales to capital"
    for column in "EFGHI":
        sheet[f"{column}12"] = f"={column}11/{column}6"
    sheet["E12"] = "=Assumptions!B6"

    # INNOCENT: an inputs row where every cell legitimately differs.
    sheet["A14"] = "Sundry inputs"
    sheet["E14"] = "=Assumptions!B3"
    sheet["F14"] = "=Assumptions!B4*2"
    sheet["G14"] = "=SUM(E6:F6)"
    sheet["H14"] = "=Assumptions!B5"

    # DEFECT: a total that leaves out the row immediately above it.
    sheet["A15"], sheet["D15"] = "Other cost", -3.2
    sheet["A13"], sheet["D13"] = "Direct cost", -110.0
    sheet["A16"] = "Total costs"
    sheet["D16"] = "=SUM(D13:D14)"

    # INNOCENT: the same shape of total, reaching every row above it.
    sheet["A17"] = "Total costs, correct"
    sheet["E13"], sheet["E15"] = -112.0, -3.4
    sheet["E17"] = "=SUM(E13:E16)"

    # DEFECT: an assumption buried inside a formula.
    sheet["A20"] = "Depreciation"
    for column in "EFGHI":
        sheet[f"{column}20"] = f"=-{column}6*Assumptions!$B$5"
    sheet["E20"] = "=-E6*0.0413"

    # DEFECT: a volatile function.
    sheet["A23"] = "Capital expenditure"
    for column in "EFGHI":
        sheet[f"{column}23"] = f"=-{column}6*Assumptions!$B$6"
    sheet["E23"] = "=-OFFSET(E6,0,0)*Assumptions!$B$6"

    # DEFECT: the same calculation, anchored so it breaks when copied.
    sheet["A26"] = "Working capital"
    for column in "EFGHI":
        sheet[f"{column}26"] = f"={column}6*Assumptions!$B$3"
    sheet["E26"] = "=E6*Assumptions!B3"

    # DEFECT: an error value left in the sheet.
    sheet["A30"], sheet["C30"] = "Legacy line", "#REF!"

    # DEFECT: a reference into a workbook that is not here.
    sheet["A33"] = "Prior year comparison"
    sheet["E33"] = "=[1]Model!$D$6*1.5"

    # DEFECT: a cell that depends on itself, in a workbook that has not
    # switched on iterative calculation.
    sheet["A36"] = "Interest"
    sheet["E36"] = "=F36*0.05"
    sheet["F36"] = "=E36+1"

    # INNOCENT: constants that carry no assumption.
    sheet["A39"] = "Per-share"
    sheet["E39"] = "=E6/100*12"

    book.calculation.iterate = False
    book.save(OUT)
    print(f"wrote {OUT} — {len(DEFECTS)} defects, {len(INNOCENT)} innocent structures")


if __name__ == "__main__":
    build()
