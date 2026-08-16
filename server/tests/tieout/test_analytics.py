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


class TestCashContinuity:
    def _pair(self, opening: list[float], closing: list[float]) -> list:
        count = len(opening)
        cells = [
            _cell('S', f'H{i}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i in range(count)
        ]
        cells += [
            _cell('S', f'C{i}10', 10, i + 3, value=Decimal(str(v)),
                  row_label='DSRA opening balance')
            for i, v in enumerate(opening)
        ]
        cells += [
            _cell('S', f'C{i}14', 14, i + 3, value=Decimal(str(v)),
                  row_label='DSRA closing balance')
            for i, v in enumerate(closing)
        ]
        return cells

    def test_a_clean_carry_says_nothing(self) -> None:
        result = _run(self._pair([0, 10, 20, 30, 40, 50],
                                 [10, 20, 30, 40, 50, 60]))
        assert [f for f in result.findings if f.rule == 'cash-continuity'] == []

    def test_a_break_in_a_living_account_is_a_finding(self) -> None:
        #: Closing 20 in FY2021 never reaches FY2022's opening — and
        #: the account keeps living, so this is the invisible error.
        result = _run(self._pair([0, 10, 999, 30, 40, 50],
                                 [10, 20, 30, 40, 50, 60]))
        fired = [f for f in result.findings if f.rule == 'cash-continuity']
        assert len(fired) == 1
        assert fired[0].period == 'FY2022'

    def test_a_wind_down_is_not_a_break(self) -> None:
        #: Anderson's construction cash: carries, then sweeps out over
        #: two settlement periods and goes dormant. Hand-read;
        #: deliberate — and the zero-against-zero tail is not life.
        result = _run(self._pair([0, 10, 20, 30, 0, 0],
                                 [10, 20, 30, -5, 40, 0]))
        assert [f for f in result.findings if f.rule == 'cash-continuity'] == []

    def test_wholesale_disagreement_claims_nothing(self) -> None:
        #: Rows that never agree were never a carry — the pairing is
        #: ours to doubt, and a carry that never resumes is never a
        #: break. Silence, not a finding.
        result = _run(self._pair([0, 1, 2, 3, 4, 5],
                                 [66, 77, 88, 99, 111, 122]))
        assert [f for f in result.findings if f.rule == 'cash-continuity'] == []


class TestDebtTerminal:
    def _tranche(self, closing: list[float], label: str = 'Senior loan closing balance') -> list:
        count = len(closing)
        cells = [
            _cell('Debt', f'H{i}1', 1, i + 3, column_label=f'FY{2020 + i}')
            for i in range(count)
        ]
        #: The sheet must locate as debt machinery: tranche vocabulary
        #: plus the pair itself.
        cells += [
            _cell('Debt', 'A2', 2, 3, row_label='Drawdown'),
            _cell('Debt', 'A3', 3, 3, row_label='Repayment'),
            _cell('Debt', 'A4', 4, 3, row_label='Interest'),
        ]
        cells += [
            _cell('Debt', f'C{i}10', 10, i + 3, value=Decimal(str(v)),
                  row_label='Senior loan opening balance')
            for i, v in enumerate(closing)
        ]
        cells += [
            _cell('Debt', f'C{i}14', 14, i + 3, value=Decimal(str(v)),
                  row_label=label)
            for i, v in enumerate(closing)
        ]
        return cells

    def test_a_tranche_that_repays_to_zero_passes(self) -> None:
        result = _run(self._tranche([100, 80, 60, 40, 20, 0]))
        assert [f for f in result.findings if f.rule == 'debt-terminal'] == []

    def test_an_amortising_tranche_ending_nonzero_is_the_finding(self) -> None:
        result = _run(self._tranche([100, 80, 60, 40, 20, 4.2]))
        fired = [f for f in result.findings if f.rule == 'debt-terminal']
        assert len(fired) == 1
        assert fired[0].value == 4.2
        assert 'not zero' in fired[0].detail

    def test_a_revolver_abstains_silently(self) -> None:
        result = _run(self._tranche([100, 40, 90, 30, 80, 20]))
        assert [f for f in result.findings if f.rule == 'debt-terminal'] == []


class TestInterestConsistency:
    def _tranche(
        self,
        opening: list[float],
        interest: list[float],
        *,
        second_interest: list[float] | None = None,
        count: int | None = None,
    ) -> list:
        count = count or len(opening)
        cells = [
            _cell('Debt', f'H{i}1', 1, i + 3, column_label=f'FY{2018 + i}')
            for i in range(count)
        ]
        #: The sheet must locate as debt machinery.
        cells += [
            _cell('Debt', 'A2', 2, 3, row_label='Drawdown'),
            _cell('Debt', 'A3', 3, 3, row_label='Repayment'),
            _cell('Debt', 'A4', 4, 3, row_label='Tranche'),
        ]
        cells += [
            _cell('Debt', f'C{i}10', 10, i + 3, value=Decimal(str(v)),
                  row_label='Senior loan opening balance')
            for i, v in enumerate(opening)
        ]
        cells += [
            _cell('Debt', f'C{i}12', 12, i + 3, value=Decimal(str(v)),
                  row_label='Senior loan interest')
            for i, v in enumerate(interest)
        ]
        if second_interest is not None:
            cells += [
                _cell('Debt', f'C{i}13', 13, i + 3, value=Decimal(str(v)),
                      row_label='Interest rolled up')
                for i, v in enumerate(second_interest)
            ]
        cells += [
            _cell('Debt', f'C{i}14', 14, i + 3, value=Decimal(str(v)),
                  row_label='Senior loan closing balance')
            for i, v in enumerate(opening)
        ]
        return cells

    def _fired(self, cells: list) -> list:
        return [
            f for f in _run(cells).findings if f.rule == 'interest-consistency'
        ]

    def test_a_steady_rate_says_nothing(self) -> None:
        opening = [100, 90, 80, 70, 60, 50, 40]
        result = _run(self._tranche(opening, [v * 0.05 for v in opening]))
        assert [
            f for f in result.findings if f.rule == 'interest-consistency'
        ] == []
        assert result.tallies['interest-consistency'] == {
            'total': 1,
            'clean': 1,
        }

    def test_floating_drift_stays_inside_the_band(self) -> None:
        #: A rate walking 4% → 5.6% is a market, not a defect.
        opening = [100, 90, 80, 70, 60, 50, 40]
        rates = [0.040, 0.043, 0.046, 0.049, 0.052, 0.055, 0.056]
        interest = [o * r for o, r in zip(opening, rates)]
        assert self._fired(self._tranche(opening, interest)) == []

    def test_a_departure_is_the_finding(self) -> None:
        #: One period charges 25% against the schedule's own 5% — the
        #: wrong-cell error a healthy-looking formula hides.
        opening = [100, 90, 80, 70, 60, 50, 40]
        interest = [5, 4.5, 4, 22.5, 3, 2.5, 2]
        fired = self._fired(self._tranche(opening, interest))
        assert len(fired) == 1
        assert fired[0].period == 'FY2021'
        assert 'convention' in fired[0].detail

    def test_interest_after_repayment_is_the_finding(self) -> None:
        opening = [100, 80, 60, 40, 20, 10, 0, 0]
        interest = [5, 4, 3, 2, 1, 0.5, 0, 1.7]
        fired = self._fired(self._tranche(opening, interest))
        assert len(fired) == 1
        assert 'after the tranche was repaid' in fired[0].detail

    def test_two_interest_rows_abstain_by_name(self) -> None:
        opening = [100, 90, 80, 70, 60, 50, 40]
        interest = [v * 0.05 for v in opening]
        result = _run(
            self._tranche(opening, interest, second_interest=interest)
        )
        assert [
            f for f in result.findings if f.rule == 'interest-consistency'
        ] == []
        assert any(
            'no single row associates' in a.why
            for a in result.abstentions
            if a.rule == 'interest-consistency'
        )

    def test_a_short_series_has_no_convention(self) -> None:
        #: Five rated periods is below the registered six — the named
        #: abstention, never a claim.
        opening = [100, 80, 60, 40, 20]
        result = _run(self._tranche(opening, [v * 0.05 for v in opening]))
        assert [
            f for f in result.findings if f.rule == 'interest-consistency'
        ] == []
        assert any(
            'too short to have a convention' in a.why
            for a in result.abstentions
            if a.rule == 'interest-consistency'
        )

    def test_no_convention_is_an_abstention_not_a_verdict(self) -> None:
        #: Rates all over the place: the association is doubted, not
        #: the model.
        opening = [100, 100, 100, 100, 100, 100, 100, 100]
        interest = [1, 9, 2, 14, 3, 20, 4, 30]
        result = _run(self._tranche(opening, interest))
        assert [
            f for f in result.findings if f.rule == 'interest-consistency'
        ] == []
        assert any(
            'no stable interest convention' in a.why
            for a in result.abstentions
            if a.rule == 'interest-consistency'
        )

    def test_a_dead_second_row_does_not_block_association(self) -> None:
        #: Dumfries's corkscrew: a second interest row that is all
        #: zeros is presentation, not a candidate (registration
        #: amendment, 16 August).
        opening = [100, 90, 80, 70, 60, 50, 40]
        interest = [5, 4.5, 4, 22.5, 3, 2.5, 2]
        fired = self._fired(
            self._tranche(
                opening, interest, second_interest=[0] * len(opening)
            )
        )
        assert len(fired) == 1
        assert fired[0].period == 'FY2021'


class TestGrading:
    #: A real axis row is text — its cells carry no number, so it must
    #: not weigh on the model's scale.
    def _axis(self) -> list[Cell]:
        return [
            _cell('S', f'H{i}1', 1, i + 3, value=None,
                  column_label=f'FY{2020 + i}')
            for i in range(6)
        ]

    def test_a_vanishing_check_residue_grades_smell(self) -> None:
        #: Elgin's shape: ±0.5 on a sheet of millions — true, reported,
        #: and marked below the model's own materiality.
        cells = self._axis() + [
            _cell('S', f'C{i}5', 5, i + 3, value=Decimal(str(v)),
                  row_label='DSRA Check')
            for i, v in enumerate([0, 0, 0, 0, 0, 0.5])
        ] + [
            _cell('S', f'C{i}8', 8, i + 3, value=Decimal(str(v)),
                  row_label='Balance b/f')
            for i, v in enumerate([1e6, 2e6, 3e6, 4e6, 5e6, 6e6])
        ]
        result = _run(cells)
        fired = [f for f in result.findings if f.rule == 'model-own-check']
        assert len(fired) == 1
        assert fired[0].severity == 'smell'

    def test_money_grades_error(self) -> None:
        #: Ayrshire's shape: a real magnitude against the model's own
        #: scale stays an error.
        cells = self._axis() + [
            _cell('S', f'C{i}5', 5, i + 3, value=Decimal(str(v)),
                  row_label='DSRA Check')
            for i, v in enumerate([0, 0, 0, 0, 0, 700_016])
        ] + [
            _cell('S', f'C{i}8', 8, i + 3, value=Decimal(str(v)),
                  row_label='Balance b/f')
            for i, v in enumerate([1e6, 2e6, 3e6, 4e6, 5e6, 6e6])
        ]
        result = _run(cells)
        fired = [f for f in result.findings if f.rule == 'model-own-check']
        assert len(fired) == 1
        assert fired[0].severity == 'error'


class TestDeduplication:
    def test_the_models_own_words_beat_the_identity_echo(self) -> None:
        #: A fired balance check row and the independent identity state
        #: the same fact; only the model's own sentence survives.
        cells = _axis_row('BS') + [
            _cell('BS', f'C{i}5', 5, i + 3, value=Decimal(str(v)),
                  row_label='Net assets')
            for i, v in enumerate([100, 110, 120, 130, 140, 150])
        ] + [
            _cell('BS', f'C{i}6', 6, i + 3, value=Decimal(str(v)),
                  row_label='Total equity')
            for i, v in enumerate([100, 110, 120, 130, 140, 100])
        ] + [
            #: The sheet's own balance check, firing where they differ.
            _cell('BS', f'C{i}9', 9, i + 3, value=Decimal(str(v)),
                  row_label='Check BS balances')
            for i, v in enumerate([0, 0, 0, 0, 0, 50])
        ] + [
            #: Statement vocabulary so the block locates.
            _cell('BS', 'A2', 2, 3, row_label='Total assets'),
            _cell('BS', 'A3', 3, 3, row_label='Total liabilities'),
        ]
        result = _run(cells)
        rules = [f.rule for f in result.findings]
        assert 'model-own-check' in rules
        assert 'balance-sheet' not in rules
