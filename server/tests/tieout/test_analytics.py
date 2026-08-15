"""The analytical checks' decisions, pinned without a corpus.

The survey measures against real models; these pin the gates that make
the measurements mean something — the zero convention, the all-ones
flag exclusion, the floor, the agreement rule with the model's own
check row, and the difference between a layout segment and a genuine
dip in the time axis.
"""

from decimal import Decimal

from polar.tieout.analytics import run_analytics
from polar.tieout.structure import read_structure
from polar.tieout.workbook import Cell, Workbook


def _cell(
    sheet: str,
    ref: str,
    row: int,
    column: int,
    *,
    value: Decimal | None = Decimal(1),
    formula: str | None = None,
    row_label: str = '',
    column_label: str = '',
) -> Cell:
    return Cell(
        sheet=sheet,
        ref=f'{sheet}!{ref}',
        row=row,
        column=column,
        value=value,
        formula=formula,
        row_label=row_label,
        column_label=column_label,
    )


def _book(cells: list[Cell]) -> Workbook:
    return Workbook(
        cells={cell.ref: cell for cell in cells},
        sheets=sorted({cell.sheet for cell in cells}),
    )


def _axis_row(sheet: str, count: int = 6) -> list[Cell]:
    return [
        _cell(sheet, f'H{i}1', 1, i + 3, column_label=f'FY{2020 + i}')
        for i in range(count)
    ]


def _run(cells: list[Cell]):
    book = _book(cells)
    return run_analytics(book, read_structure(book))


class TestOwnChecks:
    def _check_row(self, values: list[float], label: str = 'BS Check') -> list[Cell]:
        return _axis_row('S') + [
            _cell('S', f'C{i}5', 5, i + 3, value=Decimal(str(v)), row_label=label)
            for i, v in enumerate(values)
        ]

    def test_a_fired_zero_convention_row_is_a_finding(self) -> None:
        result = _run(self._check_row([0, 0, 0, 0, 0, 50.92]))
        assert [f.rule for f in result.findings] == ['model-own-check']
        assert result.findings[0].value == 50.92
        assert 'BS Check' in result.findings[0].detail
        assert result.findings[0].period == 'FY2025'

    def test_a_mostly_nonzero_row_has_no_convention(self) -> None:
        #: A counter or running row is not a check that fails.
        result = _run(self._check_row([1, 2, 3, 4, 5, 0]))
        assert result.findings == []

    def test_a_lone_one_is_a_flag_not_a_failure(self) -> None:
        #: Bertha's « MRA first period check »: zeros and a single 1.0.
        result = _run(self._check_row([0, 0, 0, 0, 0, 1.0]))
        assert result.findings == []

    def test_the_floor_holds(self) -> None:
        #: Accumulated rounding walk (~3e-4 in working units, measured
        #: on Dumfries) stays silent; money does not.
        quiet = _run(self._check_row([0, 0, 0, 0, 0, 0.0003]))
        assert quiet.findings == []
        loud = _run(self._check_row([0, 0, 0, 0, 0, 0.5]))
        assert len(loud.findings) == 1


class TestBalance:
    def _sheet(
        self, net: list[float], equity: list[float], check: list[float] | None = None
    ) -> list[Cell]:
        cells = _axis_row('BS', len(net))
        cells += [
            _cell('BS', f'C{i}20', 20, i + 3, value=Decimal(str(v)),
                  row_label='Net assets')
            for i, v in enumerate(net)
        ]
        cells += [
            _cell('BS', f'C{i}22', 22, i + 3, value=Decimal(str(v)),
                  row_label='Total equity')
            for i, v in enumerate(equity)
        ]
        if check is not None:
            cells += [
                _cell('BS', f'C{i}30', 30, i + 3, value=Decimal(str(v)),
                      row_label='Balance check')
                for i, v in enumerate(check)
            ]
        return cells

    def test_an_imbalance_is_a_finding_with_its_period(self) -> None:
        result = _run(self._sheet([100, 100, 100, 100, 100, 1100],
                                  [100, 100, 100, 100, 100, 100]))
        balance = [f for f in result.findings if f.rule == 'balance-sheet']
        assert len(balance) == 1
        assert balance[0].period == 'FY2025'
        assert balance[0].value == 1000

    def test_the_models_own_passing_check_wins(self) -> None:
        #: AFW: 0.86 apart on rows whose own check reads zero — the
        #: protocol's agreement rule turns that into a named abstention.
        result = _run(self._sheet([100, 100, 100, 100, 100, 1100],
                                  [100, 100, 100, 100, 100, 100],
                                  check=[0, 0, 0, 0, 0, 0]))
        assert [f for f in result.findings if f.rule == 'balance-sheet'] == []
        assert any(
            'disagree' in a.why for a in result.abstentions
            if a.rule == 'balance-sheet'
        )

    def test_two_net_assets_rows_abstain(self) -> None:
        cells = self._sheet([100] * 6, [100] * 6)
        cells.append(
            _cell('BS', 'C40', 40, 3, value=Decimal(1),
                  row_label='Net assets before deferred tax')
        )
        result = _run(cells)
        assert [f for f in result.findings if f.rule == 'balance-sheet'] == []
        assert any('not unique' in a.why for a in result.abstentions)

    def test_rounding_residue_stays_silent(self) -> None:
        result = _run(self._sheet([100, 100, 100, 100, 100, 100.0003],
                                  [100, 100, 100, 100, 100, 100]))
        assert [f for f in result.findings if f.rule == 'balance-sheet'] == []


class TestTimeAxis:
    def test_a_dip_inside_a_run_is_a_finding(self) -> None:
        labels = ['FY2024', 'FY2025', 'FY2023', 'FY2026', 'FY2027']
        cells = [
            _cell('S', f'H{i}1', 1, i + 3, column_label=label)
            for i, label in enumerate(labels)
        ]
        result = _run(cells)
        axis = [f for f in result.findings if f.rule == 'time-axis']
        assert len(axis) == 1
        assert 'FY2023' in axis[0].detail

    def test_a_second_block_is_layout_not_a_finding(self) -> None:
        #: Dumfries' Initial Budget: FY2019… FY2020, then FY2019 again
        #: for a second side-by-side block. Hand-read; not a defect.
        labels = ['FY2019', 'FY2020', 'FY2019', 'FY2019', 'FY2020']
        cells = [
            _cell('S', f'H{i}1', 1, i + 3, column_label=label)
            for i, label in enumerate(labels)
        ]
        result = _run(cells)
        assert [f for f in result.findings if f.rule == 'time-axis'] == []
