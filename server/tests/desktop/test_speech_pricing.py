"""What speech costs.

Runs with ``pytest --noconftest tests/desktop/test_speech_pricing.py``:
``polar.desktop.pricing`` is pure stdlib, so it can be tested on an
interpreter that pydantic refuses (``server/CLAUDE.md``). That matters
more here than anywhere — this is the file that decides what leaves a
person's account.
"""

from __future__ import annotations

from math import isclose

from polar.desktop.pricing import (
    CREDIT_USD_PER_MILLION_INPUT,
    SPEECH_MAX_CHARACTERS,
    SPEECH_MODEL,
    SPEECH_USD_PER_MILLION_CHARACTERS,
    Usage,
    credits_for,
    credits_for_speech,
)


class TestCreditsForSpeech:
    def test_nothing_said_costs_nothing(self) -> None:
        assert credits_for_speech(0) == 0
        assert credits_for_speech(-1) == 0

    def test_something_said_is_never_free(self) -> None:
        # A meter that reads zero while money leaves is the one kind of
        # wrong that matters here. A hundred short sentences are not free.
        assert credits_for_speech(1) >= 1

    def test_a_credit_still_means_the_same_money(self) -> None:
        # The whole point of the anchor: a credit is one input token on
        # the middle model, whoever served the work. So the credits for
        # some characters must equal the dollars those characters cost,
        # divided by what a credit costs.
        characters = 100_000
        usd = characters * SPEECH_USD_PER_MILLION_CHARACTERS / 1_000_000
        expected = usd / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000)
        assert isclose(credits_for_speech(characters), expected, rel_tol=1e-9)

    def test_it_scales_with_what_was_said(self) -> None:
        assert credits_for_speech(2_000) == 2 * credits_for_speech(1_000)

    def test_the_cap_is_priced_and_is_not_absurd(self) -> None:
        # A sanity floor and ceiling on the one number in pricing.py that
        # has not been read off a price page: the longest single thing an
        # agent can say must cost cents, not dollars. If this fails, the
        # rate was changed to something that wants looking at.
        usd_for_one_longest_reply = (
            SPEECH_MAX_CHARACTERS * SPEECH_USD_PER_MILLION_CHARACTERS / 1_000_000
        )
        assert 0.0001 < usd_for_one_longest_reply < 1.00


class TestTheCatalogueEntryAgrees:
    """The route meters through `credits_for`, like every other call, and
    the rate is declared once as `credits_for_speech`. If those two ever
    disagree, the meter and the price list are telling different stories
    about the same call."""

    def test_both_paths_reach_the_same_figure(self) -> None:
        for characters in (1, 137, 1_000, SPEECH_MAX_CHARACTERS):
            through_the_catalogue = credits_for(
                SPEECH_MODEL, Usage(input_tokens=characters)
            )
            assert through_the_catalogue == credits_for_speech(characters), characters

    def test_it_is_not_on_the_menu(self) -> None:
        # Priced so its usage rows mean something; never offered as a
        # model somebody could pick to talk to.
        assert SPEECH_MODEL.role is None
