"""The structure layer's decisions, pinned without a corpus.

The survey (`scripts/structure_survey.py`) measures the layer against
real models; these tests pin the decisions that make those measurements
mean something — what counts as a period label, how labels canonicalise
across sheets, what the model's own sums declare, and that block
location abstains rather than guesses when its anchors are missing.
"""

from decimal import Decimal

from polar.tieout.structure import (
    PERIOD_LABEL,
    BalancePair,
    _account_word,
    _canon,
    balance_pairs,
    period_axes,
    read_structure,
    sections,
)
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


class TestPeriodLabels:
    def test_the_shapes_models_actually_print(self) -> None:
        for label in (
            'FY2025',
            'FY2025A',
            '2025/26',
            'Q3 2024',
            'Year 12',
            'Mar 2025',
            '31-Mar-25',
            'H1',
        ):
            assert PERIOD_LABEL.match(label), label

    def test_the_shapes_that_are_not_periods(self) -> None:
        #: « Total » and « Units » sit beside the axis on real timing
        #: sheets (measured on Dumfries) and must never join it.
        for label in ('Total', 'Units', 'Constant', 'Error chks', '£m', ''):
            assert not PERIOD_LABEL.match(label), label

    def test_canonical_alignment(self) -> None:
        #: The same year, printed three ways, is one period.
        assert _canon('FY2025A') == _canon('FY 2025') == _canon('2025')
        assert _canon('FY2025') != _canon('FY2026')


class TestAxes:
    def test_two_period_columns_are_not_an_axis(self) -> None:
        cells = [
            _cell('S', 'C2', 2, 3, column_label='FY2024'),
            _cell('S', 'D2', 2, 4, column_label='FY2025'),
        ]
        assert period_axes(_book(cells)) == {}

    def test_a_semi_annual_axis_keeps_both_columns(self) -> None:
        #: Dumfries prints the year on two columns each. Both stay, in
        #: order, and the axis says so instead of flagging it.
        cells = [
            _cell('S', f'{c}2', 2, i + 3, column_label=label)
            for i, (c, label) in enumerate(
                [('C', 'FY2015'), ('D', 'FY2015'), ('E', 'FY2016'), ('F', 'FY2016')]
            )
        ]
        axes = period_axes(_book(cells))
        assert axes['S'].labels == ('FY2015', 'FY2015', 'FY2016', 'FY2016')
        assert not axes['S'].unique_labels
        assert axes['S'].per_year == 2


class TestSections:
    def test_a_single_column_sum_declares_a_section(self) -> None:
        cells = [
            _cell('Costs', 'J61', 61, 10, formula='=SUM(J58:J60)', row_label='Total'),
            #: The same sum across the axis is still one section.
            _cell('Costs', 'K61', 61, 11, formula='=SUM(K58:K60)', row_label='Total'),
        ]
        found = sections(_book(cells))
        #: The same sum across thirty period columns is one statement,
        #: not thirty — one section per (sheet, total row, span).
        assert [(s.sheet, s.total_row, s.first_row, s.last_row) for s in found] == [
            ('Costs', 61, 58, 60),
        ]

    def test_cross_sheet_and_row_sums_do_not(self) -> None:
        cells = [
            _cell('A', 'B2', 2, 2, formula="=SUM('B'!C1:C9)"),
            _cell('A', 'B3', 3, 2, formula='=SUM(C3:H3)'),
        ]
        assert sections(_book(cells)) == []


class TestBalancePairs:
    def _sheet(self) -> list[Cell]:
        header = [
            _cell('Debt', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDEF')
        ]
        rows = [
            _cell('Debt', 'C10', 10, 3, row_label='DSRA opening balance'),
            _cell('Debt', 'C14', 14, 3, row_label='DSRA closing balance'),
            _cell('Debt', 'C30', 30, 3, row_label='Interest'),
        ]
        return header + rows

    def test_vocabulary_pairs_match_by_account(self) -> None:
        pairs = balance_pairs(
            _book(self._sheet()), period_axes(_book(self._sheet()))
        )
        assert [
            (p.sheet, p.opening_row, p.closing_row, p.label) for p in pairs
        ] == [('Debt', 10, 14, 'dsra')]

    def test_different_accounts_do_not_pair(self) -> None:
        cells = [
            _cell('S', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDE')
        ] + [
            _cell('S', 'C10', 10, 3, row_label='DSRA opening balance'),
            _cell('S', 'C12', 12, 3, row_label='MRA closing balance'),
        ]
        assert balance_pairs(_book(cells), period_axes(_book(cells))) == []

    def test_account_word_strips_the_vocabulary(self) -> None:
        assert _account_word('DSRA opening balance') == 'dsra'
        assert _account_word('Closing cash') == 'cash'

    def test_a_block_scoped_pair_survives_twelve_movement_rows(self) -> None:
        #: Anderson's « Opening Cash » closes twelve rows later, with
        #: the movements between — the block, not a distance cap, is
        #: what scopes the closing.
        cells = [
            _cell('S', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDE')
        ] + [
            _cell('S', 'C217', 217, 3, row_label='Opening Cash'),
            _cell('S', 'C229', 229, 3, row_label='Closing Cash'),
            _cell('S', 'C240', 240, 3, row_label='Opening Balance'),
            _cell('S', 'C250', 250, 3, row_label='Closing Balance'),
        ]
        pairs = balance_pairs(_book(cells), period_axes(_book(cells)))
        assert [(p.opening_row, p.closing_row) for p in pairs] == [
            (217, 229),
            (240, 250),
        ]

    def test_a_closing_never_crosses_into_the_next_block(self) -> None:
        cells = [
            _cell('S', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDE')
        ] + [
            _cell('S', 'C10', 10, 3, row_label='Opening Balance'),
            _cell('S', 'C12', 12, 3, row_label='Opening Balance'),
            _cell('S', 'C14', 14, 3, row_label='Closing Balance'),
        ]
        pairs = balance_pairs(_book(cells), period_axes(_book(cells)))
        #: The closing at 14 belongs to the block that starts at 12.
        assert [(p.opening_row, p.closing_row) for p in pairs] == [(12, 14)]

    def test_formula_shape_pairs_need_three_recurrences(self) -> None:
        #: The FAST idiom: no vocabulary, the carry lives in a bare
        #: reference to the previous period's closing row.
        header = [
            _cell('S', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDEF')
        ]
        carries = [
            _cell('S', 'D10', 10, 4, formula='=C14'),
            _cell('S', 'E10', 10, 5, formula='=D14'),
            _cell('S', 'F10', 10, 6, formula='=E14'),
        ]
        pairs = balance_pairs(_book(header + carries), period_axes(_book(header)))
        assert [(p.opening_row, p.closing_row, p.how) for p in pairs] == [
            (10, 14, 'formula')
        ]
        #: Two recurrences are a coincidence, not a carry.
        fewer = _book(header + carries[:2])
        assert balance_pairs(fewer, period_axes(fewer)) == []


class TestLocation:
    def test_one_anchor_is_not_enough(self) -> None:
        #: A sheet *named* like a balance sheet whose rows say nothing —
        #: abstention, not location.
        cells = [
            _cell('BS', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDE')
        ] + [_cell('BS', 'C9', 9, 3, row_label='Miscellaneous')]
        structure = read_structure(_book(cells))
        assert [b for b in structure.located if b.kind == 'balance-sheet'] == []
        assert any(kind == 'balance-sheet' for kind, _ in structure.unlocated)

    def test_two_anchors_locate_and_name_themselves(self) -> None:
        cells = [
            _cell('BS', f'{c}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i, c in enumerate('CDE')
        ] + [
            _cell('BS', 'C20', 20, 3, row_label='Net assets'),
            _cell('BS', 'C22', 22, 3, row_label='Total equity'),
        ]
        structure = read_structure(_book(cells))
        found = [b for b in structure.located if b.kind == 'balance-sheet']
        assert len(found) == 1
        assert found[0].sheet == 'BS'
        assert len(found[0].anchors) == 2

    def test_values_pasted_is_a_fact_not_a_failure(self) -> None:
        cells = [
            _cell('S', f'C{row}', row, 3, value=Decimal(row))
            for row in range(1, 1500)
        ]
        assert read_structure(_book(cells)).values_pasted
