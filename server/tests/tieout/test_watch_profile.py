"""The update profile: a denominator, never a threshold.

The design is registered in `docs/pierce/logs/prism.md` and comes
from the founder's research round: « formulas replaced by hardcodes »
runs at a median of 83 in a quarterly reforecast and 0 in a routine
commit, so the count alone carries almost no information and a fixed
threshold is wrong in both directions.
"""

from polar.tieout.watch.profile import (
    MINIMUM_PRIORS,
    Transition,
    describe,
    profile_of,
    unusual,
)


def transition(size: int, **counts: int) -> Transition:
    return Transition(old="a", new="b", changed_cells=size, counts=counts)


QUARTERLY = [
    transition(1169, class_change=83, methodology_change=228),
    transition(1204, class_change=79, methodology_change=241),
    transition(1090, class_change=88, methodology_change=205),
]
ROUTINE = [
    transition(93, class_change=0, methodology_change=0),
    transition(102, class_change=0, methodology_change=1),
    transition(64, class_change=1, methodology_change=0),
]


class TestItRefusesRatherThanGuessing:
    def test_below_three_priors_there_is_no_profile(self) -> None:
        profile = profile_of(QUARTERLY[:2], 1100)
        assert not profile.usable
        line = describe("class_change", 83, profile)
        assert "no profile for this model" in line
        assert "2 prior transitions" in line
        assert str(MINIMUM_PRIORS) in line

    def test_an_unusable_profile_never_calls_anything_unusual(self) -> None:
        assert not unusual("class_change", 999, profile_of(QUARTERLY[:1], 1100))


class TestTheDenominator:
    def test_the_count_comes_first_and_the_median_is_context(self) -> None:
        line = describe("class_change", 83, profile_of(QUARTERLY + ROUTINE, 1169))
        assert line.startswith("83 class_change")
        assert "median" in line

    def test_a_reforecast_sized_update_is_compared_to_reforecasts(self) -> None:
        """The whole point: 83 hardcodes is *normal* here, and the
        profile must say so rather than raise an alarm."""
        profile = profile_of(QUARTERLY + ROUTINE, 1169)
        #: The three reforecasts are the only comparable priors, and
        #: the median of 79, 83, 88 is 83 — the routine commits are
        #: an order of magnitude away and do not enter.
        assert profile.priors == 3
        assert profile.medians["class_change"] == 83
        assert not unusual("class_change", 83, profile)

    def test_the_same_count_on_a_routine_sized_update_is_not_normal(self) -> None:
        """And the same 83, on a Tuesday, is."""
        profile = profile_of(QUARTERLY + ROUTINE, 95)
        assert profile.medians["class_change"] == 0
        assert unusual("class_change", 83, profile)

    def test_priors_are_chosen_by_size_not_by_recency(self) -> None:
        profile = profile_of(ROUTINE + QUARTERLY, 1169)
        assert profile.band[0] >= 1090

    def test_history_of_the_wrong_size_is_its_own_refusal(self) -> None:
        """Six priors, none within a factor of two of a 400-cell
        update: the model has history and none of it comparable, and
        the line says which refusal this is."""
        profile = profile_of(QUARTERLY + ROUTINE, 400)
        assert not profile.usable
        line = describe("class_change", 5, profile)
        assert "no profile for a transition this size" in line
        assert "6 priors" in line

    def test_a_class_the_comparable_updates_never_showed_says_so(self) -> None:
        profile = profile_of(ROUTINE, 95)
        line = describe("filled_cell", 12, profile)
        assert line.startswith("12 filled_cell")
        assert "show none" in line
