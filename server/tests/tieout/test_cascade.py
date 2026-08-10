"""The two numbers the tie-out is judged on.

Zero on the clean deck and everything on the broken one. Both run against
the real files, and both are regressions in the strict sense: a change
that makes the checker noisier fails here before it reaches anybody.
"""

from pathlib import Path

import pytest

from polar.tieout.check import tie_out, tie_out_against
from polar.tieout.deck import read_deck
from polar.tieout.model import read_outputs

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
CLEAN = str(CASCADE / "cascade_deck.pptx")
BROKEN = str(CASCADE / "cascade_deck_broken.pptx")
MODEL = str(CASCADE / "cascade_model.xlsx")


@pytest.fixture(scope="module")
def clean():
    return tie_out(CLEAN, MODEL)


@pytest.fixture(scope="module")
def published():
    """The Outputs-tab pass on its own — the narrow, high-confidence one."""
    return tie_out_against(read_deck(CLEAN).figures, read_outputs(MODEL))


#: The six figures the « clean » deck prints that do not agree with the
#: model, none of them injected and every one verified by hand: no cell in
#: the 313-cell workbook holds 28.8, 35.4, 41.6, 133.5 or 355.9, and the
#: peer mean EBITDA margin is 18.655%, which prints as 18.7%.
#:
#: They survive as a fixed list rather than a count because their value is
#: as a regression: each was found by reading the whole workbook and none
#: is reachable through the Outputs tab, which publishes 23 figures and
#: none of these.
PRE_EXISTING = {
    # Slide 3's chart series against the table on the same slide: the
    # chart says adjusted EBITDA was 37.8 and 43.0, the table says 30.8
    # and 39.6, the model says 30.8 and 39.6, and no cell in the model
    # holds 37.8 or 43.0. Found only once charts were read, which they
    # were not for most of a day on the assumption that a chart restates
    # the table beside it.
    (3, "37.8"),
    (3, "43.0"),
    (5, "28.8"),
    (5, "35.4"),
    (5, "41.6"),
    (6, "18.6%"),
    (7, "133.5"),
    (7, "355.9"),
}


def test_the_model_publishes_twenty_three_figures() -> None:
    outputs = read_outputs(MODEL)
    assert len(outputs) == 23
    assert outputs[4].ref == "O5"
    assert outputs[4].basis == "Adjusted - see bridge"


def test_the_published_figures_of_the_clean_deck_produce_nothing(published) -> None:
    """The original gate, and it still holds. Every figure the model
    publishes on its Outputs tab agrees with what the deck prints, so a
    drift here would be a banker told their correct deck is wrong."""
    assert published.drifts == []


def test_the_clean_deck_is_not_clean(clean) -> None:
    """Reading the whole workbook rather than its published interface
    finds six figures the deck prints that the model does not hold — in
    the deck supplied as the zero-findings reference.

    Not false positives. Nothing in the model holds 28.8, 133.5 or 355.9;
    slide 7 splits a correct enterprise value into two components that are
    individually wrong and nearly cancel, which is the same shape as the
    error the test pair injected deliberately elsewhere.
    """
    assert {(drift.slide, drift.printed) for drift in clean.drifts} == PRE_EXISTING


def test_a_rounding_difference_is_marked_as_one(clean) -> None:
    """18.6% against a mean of 18.655% is a convention, not a wrong
    number. It is still reported, and it is reported differently."""
    by_printed = {drift.printed: drift for drift in clean.drifts}
    assert by_printed["18.6%"].one_tick is True
    assert by_printed["133.5"].one_tick is False


def test_the_clean_deck_was_actually_checked(clean) -> None:
    """Silence from a checker that reconciled nothing looks exactly like
    silence from one that reconciled everything. This is the difference,
    and it is why the count is asserted rather than the absence."""
    assert clean.checked >= 34


def test_every_output_the_deck_prints_is_reached(published) -> None:
    """All twenty-three. An output the linker never reaches is an output
    that can drift with nobody hearing about it."""
    assert len({item.output.ref for item in published.agreed}) == 23


def test_the_adjustments_trap_does_not_fire(published) -> None:
    """$41.2mm reported and $48.9mm adjusted both appear, on four slides
    between them, and neither is ever compared against the other's cell."""
    by_ref = {(item.figure.slide, item.output.ref) for item in published.agreed}
    assert {(3, "O4"), (4, "O4")} <= by_ref
    assert {(2, "O5"), (3, "O5"), (6, "O5")} <= by_ref


def test_the_broken_deck_gives_up_every_wrong_figure() -> None:
    """Ground truth from the files, not from the README beside them: the
    README says four breaks and « slide 8 still prints 9.9x », and the
    deck that shipped changed five figures including slide 8's."""
    clean_figures = {
        (f.slide, f.location, f.label): f for f in read_deck(CLEAN).figures
    }
    wrong = {
        (f.slide, f.printed)
        for f in read_deck(BROKEN).figures
        if (was := clean_figures.get((f.slide, f.location, f.label))) is not None
        and was.printed != f.printed
    }
    assert wrong == {
        (2, "$49.6mm"),
        (2, "10.4%"),
        (6, "10.4x"),
        (6, "$502mm"),
        (8, "10.4x"),
    }

    found = {(d.slide, d.printed) for d in tie_out(BROKEN, MODEL).drifts}
    assert found == wrong | PRE_EXISTING, (
        "every injected figure, every pre-existing one, and nothing else"
    )


def test_the_break_that_is_internally_consistent_is_still_caught() -> None:
    """Slide 6's implied EV of $502mm follows correctly from its own wrong
    10.4x. A checker that only tests a deck against itself passes it; only
    reconciliation against the model catches it."""
    drifts = {d.printed: d for d in tie_out(BROKEN, MODEL).drifts}
    assert drifts["$502mm"].ref == "O21"
    assert drifts["$502mm"].expected == "$484mm"
    assert drifts["$502mm"].source == "Comps!B20"


def test_a_drift_carries_the_chain_back_to_the_cell() -> None:
    drift = next(d for d in tie_out(BROKEN, MODEL).drifts if d.printed == "$49.6mm")
    # Model!D26, not the Model!D25 the Outputs tab states: the reference is
    # stale by a row and is repaired against the workbook before the
    # finding is written, so it sends a reader to the figure rather than
    # to an empty cell.
    assert (drift.ref, drift.source, drift.expected) == ("O5", "Model!D26", "$48.9mm")
    assert drift.basis == "Adjusted - see bridge"
    assert drift.slide == 2
