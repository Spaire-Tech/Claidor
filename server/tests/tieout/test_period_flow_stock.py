"""Flow, opening, closing — and the three category errors that came first.

The flagship check reads a row's kind out of its own behaviour and then
judges it against that. Every case below is a shape that actually
appeared on Kelso in E3c round 1 and was hand-read at the cells; the
round is `docs/pierce/e3c-flow-stock.md`.
"""

from polar.tieout.units.periods import (
    CLOSING,
    FLOW,
    OPENING,
    PeriodFinding,
    classify_row,
    fold,
    varies,
)


class TestVaries:
    def test_a_row_of_zeros_does_not_vary(self) -> None:
        #: The whole reason the previous design died: 0 = 0 + 0 + … held
        #: for forty periods, so any sparse row paired with any other.
        assert not varies([0.0] * 12)

    def test_a_constant_row_does_not_vary(self) -> None:
        assert not varies([7.5] * 12)

    def test_a_moving_row_varies(self) -> None:
        assert varies([1.0, 2.0, 3.0])

    def test_an_empty_row_does_not_vary(self) -> None:
        assert not varies([])


class TestKind:
    def _fine(self) -> list[float]:
        #: Twelve periods of two halves each, all distinct so every
        #: window discriminates.
        return [float(n) for n in range(1, 25)]

    def test_a_flow_sums_its_window(self) -> None:
        fine = self._fine()
        coarse = [fine[i * 2] + fine[i * 2 + 1] for i in range(12)]

        pattern = classify_row(fine, coarse, 2)

        assert pattern is not None
        assert pattern.kind == FLOW
        assert len(pattern.kept) == 12
        assert pattern.single_period == ()

    def test_a_closing_balance_carries_the_last_value(self) -> None:
        fine = self._fine()
        coarse = [fine[i * 2 + 1] for i in range(12)]

        pattern = classify_row(fine, coarse, 2)

        assert pattern is not None
        assert pattern.kind == CLOSING

    def test_an_opening_balance_carries_the_first_value(self) -> None:
        #: `bal b f` on Kelso was judged as a closing balance and duly
        #: looked broken. A brought-forward balance takes the *first*
        #: value of its window.
        fine = self._fine()
        coarse = [fine[i * 2] for i in range(12)]

        pattern = classify_row(fine, coarse, 2)

        assert pattern is not None
        assert pattern.kind == OPENING

    def test_a_frozen_row_declares_no_kind(self) -> None:
        assert classify_row([0.0] * 24, [0.0] * 12, 2) is None

    def test_a_row_with_too_few_periods_declares_no_kind(self) -> None:
        fine = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        coarse = [3.0, 7.0, 11.0]

        assert classify_row(fine, coarse, 2) is None


class TestZeroPeriodsDoNotVote:
    def test_a_window_that_cannot_discriminate_is_not_counted(self) -> None:
        #: « cash bank carried forward » — a balance by its own name —
        #: was classified as a flow on Kelso, on a margin made of
        #: periods that were all zero. A window of zeros satisfies sum,
        #: first and last at once and so decides nothing.
        fine = [0.0] * 20 + [3.0, 5.0, 7.0, 11.0]
        coarse = [0.0] * 10 + [8.0, 18.0]

        pattern = classify_row(fine, coarse, 2, min_periods=2)

        assert pattern is not None
        #: Only the two real periods voted, not the ten empty ones.
        assert len(pattern.kept) == 2

    def test_an_undecidable_period_is_never_a_finding(self) -> None:
        #: It agrees with every reading, so it cannot break any of them.
        fine = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 0.0, 0.0]
        coarse = [3.0, 7.0, 11.0, 15.0, 19.0, 0.0]

        pattern = classify_row(fine, coarse, 2, min_periods=5)

        assert pattern is not None
        assert pattern.kind == FLOW
        assert pattern.single_period == ()
        assert pattern.unexplained == ()


class TestTheDefect:
    def test_a_flow_that_takes_one_period_is_the_finding(self) -> None:
        #: The flagship: sums its window in every period but one, where
        #: it takes a single cell instead.
        fine = [float(n) for n in range(1, 25)]
        coarse = [fine[i * 2] + fine[i * 2 + 1] for i in range(12)]
        coarse[7] = fine[15]

        pattern = classify_row(fine, coarse, 2)

        assert pattern is not None
        assert pattern.kind == FLOW
        assert pattern.single_period == (7,)
        assert pattern.broken

    def test_zero_against_zero_is_not_a_finding(self) -> None:
        #: `spv admin costs` and `equity bridge facility` were both
        #: reported for taking « one month » where the month was 0.0 and
        #: so was the year. The claim is that a real figure was carried
        #: where an aggregate belonged, so both ends must be real.
        fine = [float(n) for n in range(1, 23)] + [0.0, 0.0]
        coarse = [fine[i * 2] + fine[i * 2 + 1] for i in range(11)] + [0.0]

        pattern = classify_row(fine, coarse, 2)

        assert pattern is not None
        assert pattern.single_period == ()

    def test_a_break_matching_nothing_is_unexplained_not_a_finding(self) -> None:
        #: « We looked and could not explain this one » is honest; a
        #: false alarm is not.
        fine = [float(n) for n in range(1, 25)]
        coarse = [fine[i * 2] + fine[i * 2 + 1] for i in range(12)]
        coarse[4] = 999.0

        pattern = classify_row(fine, coarse, 2)

        assert pattern is not None
        assert pattern.single_period == ()
        assert pattern.unexplained == (4,)


class TestOneDecisionOneFinding:
    def _finding(self, label: str, fine: str, coarse: str) -> PeriodFinding:
        return PeriodFinding(
            label=label,
            fine=fine,
            coarse=coarse,
            ratio=2,
            kind=FLOW,
            kept=25,
            single_period=(3,),
        )

    def test_the_same_number_published_twice_is_one_finding(self) -> None:
        #: Kelso prints its cash balance on two lines of one sheet —
        #: `cash bank` at row 83 and `cash bank carried forward` at row
        #: 200, identical values. Different cells, one authoring
        #: decision, and round 1 reported it twice.
        series = [0.0, 0.0, 33.6438, 6.8184, 0.0, 0.0]
        folded = fold(
            [
                (self._finding("cash bank", "SA!83", "Annual!82"), series),
                (
                    self._finding("cash bank carried forward", "SA!200", "Annual!200"),
                    series,
                ),
            ]
        )

        assert len(folded) == 1
        assert folded[0].label == "cash bank"
        assert folded[0].also == ("SA!200 -> Annual!200",)

    def test_different_numbers_stay_different_findings(self) -> None:
        folded = fold(
            [
                (self._finding("cash", "SA!83", "Annual!82"), [1.0, 2.0, 3.0]),
                (self._finding("debt", "SA!90", "Annual!90"), [9.0, 8.0, 7.0]),
            ]
        )

        assert len(folded) == 2

    def test_the_evidence_survives_the_fold(self) -> None:
        #: The other places are kept on the finding, so collapsing does
        #: not lose where else the number appears.
        series = [1.0, 2.0, 3.0]
        folded = fold(
            [
                (self._finding("a", "S!1", "A!1"), series),
                (self._finding("b", "S!2", "A!2"), series),
                (self._finding("c", "S!3", "A!3"), series),
            ]
        )

        assert len(folded) == 1
        assert len(folded[0].also) == 2
