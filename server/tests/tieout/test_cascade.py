"""The two numbers the tie-out is judged on.

Zero on the clean deck and everything on the broken one. Both run against
the real files, and both are regressions in the strict sense: a change
that makes the checker noisier fails here before it reaches anybody.
"""

from pathlib import Path

import pytest

from polar.tieout.check import tie_out
from polar.tieout.deck import read_deck
from polar.tieout.model import read_outputs

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
CLEAN = str(CASCADE / "cascade_deck.pptx")
BROKEN = str(CASCADE / "cascade_deck_broken.pptx")
MODEL = str(CASCADE / "cascade_model.xlsx")


@pytest.fixture(scope="module")
def clean():
    return tie_out(CLEAN, MODEL)


def test_the_model_publishes_twenty_three_figures() -> None:
    outputs = read_outputs(MODEL)
    assert len(outputs) == 23
    assert outputs[4].ref == "O5"
    assert outputs[4].basis == "Adjusted - see bridge"


def test_the_clean_deck_produces_nothing(clean) -> None:
    """The gate. Every figure in this deck agrees with the model, so any
    drift reported is a banker being told their correct deck is wrong."""
    assert clean.drifts == []


def test_the_clean_deck_was_actually_checked(clean) -> None:
    """Silence from a checker that reconciled nothing looks exactly like
    silence from one that reconciled everything. This is the difference,
    and it is why the count is asserted rather than the absence."""
    assert clean.checked >= 34


def test_every_output_the_deck_prints_is_reached(clean) -> None:
    """All twenty-three. An output the linker never reaches is an output
    that can drift with nobody hearing about it."""
    assert len({item.output.ref for item in clean.agreed}) == 23


def test_the_adjustments_trap_does_not_fire(clean) -> None:
    """$41.2mm reported and $48.9mm adjusted both appear, on four slides
    between them, and neither is ever compared against the other's cell."""
    by_ref = {(item.figure.slide, item.output.ref) for item in clean.agreed}
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
    assert found == wrong, "every wrong figure, and only wrong figures"


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
    assert (drift.ref, drift.source, drift.expected) == ("O5", "Model!D25", "$48.9mm")
    assert drift.basis == "Adjusted - see bridge"
    assert drift.slide == 2
