"""C4's ladder, where the right verdict is by construction.

The five gates run on real corpus pairs under the registered
harness (`scripts/watch_tiers.py`); these tests pin the assignment
itself — that the rungs are taken in order, that every cell gets
exactly one verdict, that silence from the oracle is never support,
and that a refusal always carries a name.
"""

from decimal import Decimal

from polar.tieout.watch.tiers import (
    CHANGED,
    PROVED,
    REFUSAL_ENVIRONMENT,
    REFUSAL_NO_INPUT,
    REFUSAL_NOT_OFFERED,
    REFUSED,
    SOURCE_ADDED,
    SOURCE_RAW_CONTENT,
    SOURCE_RAW_VALUE,
    SOURCE_TIER2_DIVERGENCE,
    SUPPORTED,
    Tier2Answer,
    Verdict,
    build_ladder,
    gate_violations,
)
from polar.tieout.watch.trace import proved_unchanged
from polar.tieout.workbook import Cell, Workbook


def cell(
    ref: str,
    row: int,
    column: int,
    *,
    value: str | None = None,
    formula: str | None = None,
    label: str = "",
    precedents: tuple[str, ...] = (),
) -> Cell:
    return Cell(
        sheet="M",
        ref=f"M!{ref}",
        row=row,
        column=column,
        value=None if value is None else Decimal(value),
        formula=formula,
        row_label=label,
        column_label="FY2025",
        precedents=precedents,
    )


def book(cells: list[Cell]) -> Workbook:
    built = Workbook(sheets=["M"])
    for one in cells:
        built.cells[one.ref] = one
    return built


def raw(book_cells: list[Cell]) -> dict[str, tuple[str, str]]:
    """The C1 reader's view of a constructed book: content, then the
    type-tagged stored value."""
    return {
        one.ref: (
            f"f:{one.formula}" if one.formula else f"v:{one.value}",
            f"n:{one.value}" if one.value is not None else "s:",
        )
        for one in book_cells
    }


BASE = [
    cell("B2", 2, 2, value="100", label="Revenue"),
    cell("B3", 3, 2, value="40", formula="=B2*0.4", label="Cost", precedents=("M!B2",)),
    cell(
        "B4",
        4,
        2,
        value="60",
        formula="=B2-B3",
        label="EBITDA",
        precedents=("M!B2", "M!B3"),
    ),
]


def ladder_over(old: list[Cell], new: list[Cell], **kwargs: object):
    old_book, new_book = book(old), book(new)
    proof = proved_unchanged(old_book, new_book)
    built = build_ladder(
        old_book,
        new_book,
        raw(old),
        raw(new),
        proof=proof,
        **kwargs,  # type: ignore[arg-type]
    )
    assert not gate_violations(built, new_book, raw(old), raw(new), proof)
    return built


class TestTheAssignment:
    def test_an_untouched_pair_is_proved_at_the_top_rung(self) -> None:
        built = ladder_over(BASE, BASE)
        assert built.counts[PROVED] == 3
        assert built.counts[CHANGED] == 0
        assert all(item.rung == "tier0" for item in built.verdicts.values())

    def test_every_cell_carries_exactly_one_verdict(self) -> None:
        changed = [
            BASE[0],
            cell(
                "B3",
                3,
                2,
                value="45",
                formula="=B2*0.45",
                label="Cost",
                precedents=("M!B2",),
            ),
            BASE[2],
        ]
        built = ladder_over(BASE, changed)
        assert set(built.verdicts) == {"M!B2", "M!B3", "M!B4"}
        assert sum(built.counts.values()) == 3

    def test_a_rewritten_formula_is_changed_by_raw_content(self) -> None:
        changed = [
            BASE[0],
            cell(
                "B3",
                3,
                2,
                value="40",
                formula="=(B2*0.4)*2/2",
                label="Cost",
                precedents=("M!B2",),
            ),
            BASE[2],
        ]
        built = ladder_over(BASE, changed)
        assert built.verdicts["M!B3"].verdict == CHANGED
        assert built.verdicts["M!B3"].reason == SOURCE_RAW_CONTENT

    def test_a_recomputed_value_under_the_same_formula_is_changed_by_value(
        self,
    ) -> None:
        changed = [
            BASE[0],
            cell(
                "B3",
                3,
                2,
                value="41",
                formula="=B2*0.4",
                label="Cost",
                precedents=("M!B2",),
            ),
            BASE[2],
        ]
        built = ladder_over(BASE, changed)
        assert built.verdicts["M!B3"].verdict == CHANGED
        assert built.verdicts["M!B3"].reason == SOURCE_RAW_VALUE

    def test_a_coefficient_the_shape_cannot_see_is_caught_by_the_raw_rung(
        self,
    ) -> None:
        """The second amendment's case: `_shape` erases numeric
        literals, so `=B2*0.4` and `=B2*0.5` hash alike when the file
        was never recalculated. The fingerprints prove it; the raw
        rung overrules them, and the count is reported."""
        stale = [
            BASE[0],
            cell(
                "B3",
                3,
                2,
                value="40",
                formula="=B2*0.5",
                label="Cost",
                precedents=("M!B2",),
            ),
            BASE[2],
        ]
        old_book, new_book = book(BASE), book(stale)
        proof = proved_unchanged(old_book, new_book)
        assert "M!B3" in proof.proved  # the hash really is blind here
        built = ladder_over(BASE, stale)
        assert built.verdicts["M!B3"].verdict == CHANGED
        assert built.verdicts["M!B3"].reason == SOURCE_RAW_CONTENT
        assert built.tier0_overruled_by_raw == 1

    def test_a_cell_with_no_counterpart_is_added_not_refused(self) -> None:
        grown = [*BASE, cell("B9", 9, 2, value="7", label="New line")]
        built = ladder_over(BASE, grown)
        assert built.verdicts["M!B9"].verdict == CHANGED
        assert built.verdicts["M!B9"].reason == SOURCE_ADDED
        assert built.verdicts["M!B9"].tier0_blockage == "no_aligned_counterpart"


class TestTheLowerRungs:
    def moved_input(self) -> list[Cell]:
        """B2 moves; B3 and B4 keep their own content *and* their own
        stored value (a file saved without recalculating), so raw
        evidence has nothing to say about them and they descend."""
        return [cell("B2", 2, 2, value="120", label="Revenue"), BASE[1], BASE[2]]

    def test_without_an_oracle_nothing_is_supported(self) -> None:
        built = ladder_over(BASE, self.moved_input())
        assert built.counts[SUPPORTED] == 0
        descended = [
            item
            for item in built.verdicts.values()
            if item.reason == REFUSAL_NOT_OFFERED
        ]
        assert {item.ref for item in descended} == {"M!B3", "M!B4"}
        assert built.tier1_would_have_been_asked == 2

    def test_the_oracle_can_support_and_can_diverge(self) -> None:
        def oracle(refs: tuple[str, ...]) -> dict[str, Tier2Answer]:
            return {
                "M!B3": Tier2Answer("supported", "5 trials, no divergence"),
                "M!B4": Tier2Answer("diverged", "trial 2: 60 -> 61"),
            }

        built = ladder_over(BASE, self.moved_input(), oracle=oracle)
        assert built.verdicts["M!B3"].verdict == SUPPORTED
        assert built.verdicts["M!B4"].verdict == CHANGED
        assert built.verdicts["M!B4"].reason == SOURCE_TIER2_DIVERGENCE

    def test_support_without_perturbation_is_a_refusal(self) -> None:
        def oracle(refs: tuple[str, ...]) -> dict[str, Tier2Answer]:
            return {ref: Tier2Answer("supported", perturbed=False) for ref in refs}

        built = ladder_over(BASE, self.moved_input(), oracle=oracle)
        assert built.counts[SUPPORTED] == 0
        assert built.verdicts["M!B3"].reason == REFUSAL_NO_INPUT

    def test_an_ineligible_cell_never_reaches_the_oracle(self) -> None:
        seen: list[tuple[str, ...]] = []

        def oracle(refs: tuple[str, ...]) -> dict[str, Tier2Answer]:
            seen.append(refs)
            return {ref: Tier2Answer("supported") for ref in refs}

        built = ladder_over(
            BASE,
            self.moved_input(),
            oracle=oracle,
            ineligible={"M!B4": REFUSAL_ENVIRONMENT},
        )
        assert "M!B4" not in seen[0]
        assert built.verdicts["M!B4"].verdict == REFUSED
        assert built.verdicts["M!B4"].reason == REFUSAL_ENVIRONMENT


class TestTheGates:
    def test_g2a_catches_a_ladder_that_proves_more_than_the_hashes(self) -> None:
        old_book, new_book = book(BASE), book(BASE)
        proof = proved_unchanged(old_book, new_book)
        built = build_ladder(old_book, new_book, raw(BASE), raw(BASE), proof=proof)
        proof.proved.pop("M!B3")
        violations = gate_violations(built, new_book, raw(BASE), raw(BASE), proof)
        assert any(line.startswith("G2a:") and "M!B3" in line for line in violations)

    def test_g2b_catches_a_proof_overruled_by_anything_but_raw_evidence(self) -> None:
        """Only the raw grid may overrule a fingerprint proof. A
        refusal that swallows one is drift, and G2b says so."""
        old_book, new_book = book(BASE), book(BASE)
        proof = proved_unchanged(old_book, new_book)
        built = build_ladder(old_book, new_book, raw(BASE), raw(BASE), proof=proof)
        built.verdicts["M!B3"] = Verdict(
            ref="M!B3",
            verdict=REFUSED,
            rung="tier2",
            reason=REFUSAL_NOT_OFFERED,
            old_ref="M!B3",
        )
        violations = gate_violations(built, new_book, raw(BASE), raw(BASE), proof)
        assert any(line.startswith("G2b:") and "M!B3" in line for line in violations)

    def test_g1_catches_a_proved_cell_whose_stored_value_moved(self) -> None:
        old_book, new_book = book(BASE), book(BASE)
        proof = proved_unchanged(old_book, new_book)
        built = build_ladder(old_book, new_book, raw(BASE), raw(BASE), proof=proof)
        lying_raw = dict(raw(BASE))
        lying_raw["M!B4"] = (lying_raw["M!B4"][0], "n:61")
        violations = gate_violations(built, new_book, raw(BASE), lying_raw, proof)
        assert any(line.startswith("G1:") and "M!B4" in line for line in violations)

    def test_g4_catches_a_refusal_with_no_name(self) -> None:
        def oracle(refs: tuple[str, ...]) -> dict[str, Tier2Answer]:
            return {ref: Tier2Answer("refused", "because I said so") for ref in refs}

        old_book = book(BASE)
        new_book = book(
            [cell("B2", 2, 2, value="120", label="Revenue"), BASE[1], BASE[2]]
        )
        proof = proved_unchanged(old_book, new_book)
        built = build_ladder(
            old_book,
            new_book,
            raw(BASE),
            raw(list(new_book.cells.values())),
            proof=proof,
            oracle=oracle,
        )
        #: An unnamed reason is mapped onto the vocabulary, never
        #: passed through — so G4 stays clean and the detail survives.
        assert built.verdicts["M!B3"].reason == "tier2_unavailable"
        assert "because I said so" in built.verdicts["M!B3"].detail


class TestThePairOracleRules:
    """The oracle's per-cell verdict, without a calculation host.

    The harness that drives LibreOffice is measured under its own
    registration; what is pinned here is the rule it applies to the
    readings once it has them.
    """

    def answers(
        self,
        old: list[list[object]],
        new: list[list[object]],
        refs: tuple[str, ...] = ("M!B4",),
    ) -> dict[str, object]:
        from scripts.watch_tiers import _answer

        old_readings = [{"M!B4": row[0]} if row else {} for row in old]
        new_readings = [{"M!B4": row[0]} if row else {} for row in new]
        return dict(_answer(refs, lambda ref: ref, old_readings, new_readings))

    def test_agreement_on_every_trial_is_support(self) -> None:
        answer = self.answers([[1.0], [2.0], [3.0]], [[1.0], [2.0], [3.0]])["M!B4"]
        assert answer.outcome == "supported"  # type: ignore[attr-defined]
        assert answer.perturbed  # type: ignore[attr-defined]

    def test_one_disagreeing_trial_is_divergence(self) -> None:
        answer = self.answers([[1.0], [2.0], [3.0]], [[1.0], [2.5], [3.0]])["M!B4"]
        assert answer.outcome == "diverged"  # type: ignore[attr-defined]
        assert "trial 1" in answer.detail  # type: ignore[attr-defined]

    def test_a_cell_the_trials_never_moved_is_not_supported(self) -> None:
        """G5 in its operational form: five identical readings of a
        frozen cell support nothing, however well they agree."""
        answer = self.answers([[7.0], [7.0], [7.0]], [[7.0], [7.0], [7.0]])["M!B4"]
        assert answer.outcome == "supported"  # type: ignore[attr-defined]
        assert not answer.perturbed  # type: ignore[attr-defined]

    def test_a_cell_the_driver_never_returned_is_refused_by_name(self) -> None:
        answer = self.answers([[1.0], [], [3.0]], [[1.0], [2.0], [3.0]])["M!B4"]
        assert answer.outcome == "refused"  # type: ignore[attr-defined]
        assert answer.detail == "not_read_by_driver"  # type: ignore[attr-defined]

    def test_text_results_are_compared_as_text(self) -> None:
        """The class tier 0 is blind to — a formula whose result is a
        string — is exactly the class the driver reads and compares."""
        agreeing = self.answers([["12.2%"], ["9.9%"]], [["12.2%"], ["9.9%"]])["M!B4"]
        assert agreeing.outcome == "supported"  # type: ignore[attr-defined]
        differing = self.answers([["12.2%"], ["9.9%"]], [["12.2%"], ["9.8%"]])["M!B4"]
        assert differing.outcome == "diverged"  # type: ignore[attr-defined]
