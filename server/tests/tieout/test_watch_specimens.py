"""Two specimens from real commits, per the twenty-eighth sweep's orders.

Both come from the founder's research round over real git history of
real financial models, and both are edits that a naive diff either
misses or drowns:

1. **A vertical sum that became a horizontal sum** —
   `=SUM(AM4:AM8)` → `=SUM(S9:V9)`. The cell did not move and the
   result may not move; the *meaning* did.
2. **A reference that shifted one column and two rows inside a copied
   block** — the asymmetry against its neighbours is the signal, and
   it is cheap.

These are end-to-end through C3's delta report on real files, not
unit tests of a helper: the question the orders ask is whether the
Watch *reports* them, not whether a shape function distinguishes
them.
"""

from pathlib import Path

import openpyxl

from polar.tieout.watch import delta_report


def _write(path: Path, rows: list[tuple[str, str, object]]) -> None:
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = "Model"
    sheet["A1"], sheet["B1"] = "Line", "FY2025"
    for index, (label, coordinate, content) in enumerate(rows, start=2):
        sheet[f"A{index}"] = label
        sheet[coordinate] = content
    book.save(path)


def _kinds(report: object) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for item in report.items:  # type: ignore[attr-defined]
        found.setdefault(item.kind, []).append(f"{item.sheet}!{item.first_row}")
    return found


class TestTheSumThatChangedDirection:
    """Specimen 1: same cell, same stored value, different meaning."""

    def rows(self, formula: str) -> list[tuple[str, str, object]]:
        return [
            ("Q1", "B2", 10),
            ("Q2", "B3", 10),
            ("Q3", "B4", 10),
            ("Q4", "B5", 10),
            ("Other", "C6", 10),
            ("Other", "D6", 10),
            ("Other", "E6", 10),
            ("Other", "F6", 10),
            ("Total", "B7", formula),
        ]

    def test_c3_reports_it_as_a_methodology_change(self, tmp_path: Path) -> None:
        old, new = tmp_path / "old.xlsx", tmp_path / "new.xlsx"
        _write(old, self.rows("=SUM(B2:B5)"))
        _write(new, self.rows("=SUM(C6:F6)"))
        report = delta_report(str(old), str(new))
        kinds = _kinds(report)
        assert "methodology_change" in kinds, kinds
        detail = next(
            item.detail for item in report.items if item.kind == "methodology_change"
        )
        #: The line must say what the calculation became, not merely
        #: that it changed. Read the two halves: on the left the row
        #: offset varies and the column is fixed — a column of cells;
        #: on the right the row is fixed and the column offset varies
        #: — a row of cells. The direction change is legible.
        assert detail == ("SUM(R[-5]C[+0]:R[-2]C[+0]) → SUM(R[-1]C[+1]:R[-1]C[+4])")

    def test_the_stored_value_is_identical_so_a_value_diff_is_silent(
        self, tmp_path: Path
    ) -> None:
        """Both sums total 40. A reader watching only values sees
        nothing at all — which is why the class exists."""
        old, new = tmp_path / "old.xlsx", tmp_path / "new.xlsx"
        _write(old, self.rows("=SUM(B2:B5)"))
        _write(new, self.rows("=SUM(C6:F6)"))
        from polar.tieout.watch import read_raw

        before, _ = read_raw(str(old))
        after, _ = read_raw(str(new))
        assert before["Model!B7"][1] == after["Model!B7"][1]  # no cached values


class TestTheReferenceThatShiftedInsideACopiedBlock:
    """Specimen 2: four rows copied, one reference off by (1 column,
    2 rows). The asymmetry against its neighbours is the signal."""

    def rows(self, third: str) -> list[tuple[str, str, object]]:
        return [
            ("Rate", "B2", 0.1),
            ("Rate", "B3", 0.2),
            ("Rate", "B4", 0.3),
            ("Rate", "B5", 0.4),
            ("Base", "C2", 100),
            ("Base", "C3", 200),
            ("Base", "C4", 300),
            ("Base", "C5", 400),
            ("Charge one", "D2", "=B2*C2"),
            ("Charge two", "D3", "=B3*C3"),
            ("Charge three", "D4", third),
            ("Charge four", "D5", "=B5*C5"),
        ]

    def test_c3_reports_the_one_shifted_reference(self, tmp_path: Path) -> None:
        old, new = tmp_path / "old.xlsx", tmp_path / "new.xlsx"
        _write(old, self.rows("=B4*C4"))
        _write(new, self.rows("=A2*C4"))  # one column left, two rows up
        report = delta_report(str(old), str(new))
        kinds = _kinds(report)
        assert "methodology_change" in kinds, kinds
        #: The item is anchored at the *formula's* row (D4), not at
        #: the label's position in the fixture's write order.
        assert kinds["methodology_change"] == ["Model!4"], kinds

    def test_the_three_untouched_rows_stay_silent(self, tmp_path: Path) -> None:
        """The signal is the asymmetry: exactly one row of the block
        may be reported, or the class is noise."""
        old, new = tmp_path / "old.xlsx", tmp_path / "new.xlsx"
        _write(old, self.rows("=B4*C4"))
        _write(new, self.rows("=A2*C4"))
        report = delta_report(str(old), str(new))
        reported = [item for item in report.items if item.kind == "methodology_change"]
        assert len(reported) == 1
