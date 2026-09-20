"""What the person's computer costs.

Runs with ``pytest --noconftest tests/desktop/test_box_pricing.py``:
``polar.desktop.pricing`` is pure stdlib, so it can be tested on an
interpreter that pydantic refuses (``server/CLAUDE.md``). Same reason as
``test_speech_pricing.py``, and the same stake — this is the file that
decides what leaves a person's account.

This file used to test image pricing too. That went when #133 landed a
better image route on `main`: it meters from OpenAI's own usage object
rather than from per-image numbers nobody had checked. The box half is
what survives, and it is the half that has no other owner.
"""

from __future__ import annotations

from math import isclose

from polar.desktop.pricing import CREDIT_USD_PER_MILLION_INPUT


class TestWhatABoxCosts:
    """The box is the first thing this product sells that costs money
    while nobody is using it, so its price gets the same scrutiny as the
    ones people actively spend."""

    def test_an_hour_of_box_is_the_published_rate(self) -> None:
        from polar.desktop.pricing import box_usd_per_hour

        # 2 vCPU + 4 GiB at E2B's quoted rates. The doc's ~$0.17/hour.
        assert isclose(box_usd_per_hour(2, 4), 2 * 0.0504 + 4 * 0.0162, rel_tol=1e-9)

    def test_a_credit_still_means_the_same_money(self) -> None:
        from polar.desktop.pricing import box_usd_per_hour, credits_for_box

        seconds = 3600
        expected = box_usd_per_hour(2, 4) / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000)
        assert isclose(
            credits_for_box(seconds, vcpu=2, memory_gib=4), expected, rel_tol=1e-6
        )

    def test_a_bigger_box_costs_more(self) -> None:
        from polar.desktop.pricing import credits_for_box

        small = credits_for_box(3600, vcpu=2, memory_gib=4)
        large = credits_for_box(3600, vcpu=4, memory_gib=8)
        assert large > small
        # The shape is configuration, so the price has to follow it
        # without anybody remembering to change a second number.
        assert isclose(large, 2 * small, rel_tol=1e-6)

    def test_no_time_awake_costs_nothing(self) -> None:
        from polar.desktop.pricing import credits_for_box

        assert credits_for_box(0, vcpu=2, memory_gib=4) == 0
        assert credits_for_box(-5, vcpu=2, memory_gib=4) == 0

    def test_a_second_awake_is_never_free(self) -> None:
        from polar.desktop.pricing import credits_for_box

        # A box settled in slices must not be free per slice, or a box
        # polled often enough runs permanently free.
        assert credits_for_box(1, vcpu=2, memory_gib=4) >= 1

    def test_a_broken_clock_cannot_empty_an_allowance(self) -> None:
        from polar.desktop.pricing import (
            BOX_MAX_SECONDS_PER_SETTLEMENT,
            credits_for_box,
        )

        # The only price in this file multiplied by wall-clock time
        # rather than by something a provider reported. A restored
        # backup, a clock jump or a `billed_through` that never got set
        # would otherwise bill a decade of computer nobody ran.
        a_decade = 10 * 365 * 24 * 3600
        capped = credits_for_box(BOX_MAX_SECONDS_PER_SETTLEMENT, vcpu=2, memory_gib=4)
        assert credits_for_box(a_decade, vcpu=2, memory_gib=4) == capped

    def test_the_box_is_not_on_the_menu(self) -> None:
        from polar.desktop.pricing import box_model, model_by_id

        assert box_model(2, 4).role is None
        # Priced so its rows mean something; never a model anybody could
        # pick to talk to, and not findable as one.
        assert model_by_id(box_model(2, 4).model_id) is None
