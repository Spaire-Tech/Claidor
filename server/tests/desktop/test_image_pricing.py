"""What a picture costs.

Runs with ``pytest --noconftest tests/desktop/test_image_pricing.py``:
``polar.desktop.pricing`` is pure stdlib, so it can be tested on an
interpreter that pydantic refuses (``server/CLAUDE.md``). Same reason as
``test_speech_pricing.py``, and the same stake — this is the file that
decides what leaves a person's account.
"""

from __future__ import annotations

from math import isclose

from polar.desktop.pricing import (
    CREDIT_USD_PER_MILLION_INPUT,
    IMAGE_MAX_IMAGES,
    IMAGE_MODEL,
    IMAGE_SIZE_DEFAULT,
    IMAGE_USD_PER_IMAGE,
    Usage,
    credits_for,
    credits_for_image,
    image_billing_units,
    image_size_offered,
)


class TestWhichSizesAreDrawn:
    def test_naming_nothing_gets_the_default(self) -> None:
        assert image_size_offered(None) == IMAGE_SIZE_DEFAULT
        assert image_size_offered("") == IMAGE_SIZE_DEFAULT
        assert image_size_offered("   ") == IMAGE_SIZE_DEFAULT

    def test_auto_is_the_default_rather_than_a_refusal(self) -> None:
        # OpenAI's own API takes "auto"; an agent that has read about the
        # API will send it, and it means "you choose".
        assert image_size_offered("auto") == IMAGE_SIZE_DEFAULT

    def test_a_size_we_draw_is_returned_as_it_is_priced(self) -> None:
        for size in IMAGE_USD_PER_IMAGE:
            assert image_size_offered(size) == size

    def test_a_size_we_do_not_draw_is_refused_and_not_guessed_at(self) -> None:
        # None, not a silent fall back to the default. An agent that asked
        # for a landscape and was handed a square produced a picture that
        # is wrong in a way nobody can see from the result, and the price
        # would be read off a size that was never drawn.
        assert image_size_offered("512x512") is None
        assert image_size_offered("4096x4096") is None
        assert image_size_offered("nonsense") is None

    def test_every_size_offered_has_a_price(self) -> None:
        # The one invariant that keeps a price table from having a hole:
        # `image_size_offered` may only ever return a key of the table
        # `image_billing_units` reads.
        for size in IMAGE_USD_PER_IMAGE:
            assert image_billing_units(size, 1) >= 1


class TestCreditsForImage:
    def test_drawing_nothing_costs_nothing(self) -> None:
        assert credits_for_image(IMAGE_SIZE_DEFAULT, 0) == 0
        assert credits_for_image(IMAGE_SIZE_DEFAULT, -1) == 0

    def test_a_picture_that_was_drawn_is_never_free(self) -> None:
        # The speech rule, for the same reason: a meter that reads zero
        # while money leaves is the one kind of wrong that matters here.
        for size in IMAGE_USD_PER_IMAGE:
            assert credits_for_image(size, 1) >= 1

    def test_a_credit_still_means_the_same_money(self) -> None:
        # The whole point of the anchor: a credit is one input token on
        # the middle model, whoever served the work. So the credits for a
        # picture must equal the dollars that picture costs, divided by
        # what a credit costs.
        for size, usd_each in IMAGE_USD_PER_IMAGE.items():
            for count in (1, 2, IMAGE_MAX_IMAGES):
                expected = (usd_each * count) / (
                    CREDIT_USD_PER_MILLION_INPUT / 1_000_000
                )
                assert isclose(
                    credits_for_image(size, count), expected, rel_tol=1e-9
                ), (size, count)

    def test_it_scales_with_how_many_were_drawn(self) -> None:
        for size in IMAGE_USD_PER_IMAGE:
            assert credits_for_image(size, 2) == 2 * credits_for_image(size, 1)

    def test_a_taller_picture_is_not_cheaper_than_a_square_one(self) -> None:
        square = credits_for_image("1024x1024", 1)
        for size in IMAGE_USD_PER_IMAGE:
            assert credits_for_image(size, 1) >= square

    def test_the_cap_is_priced_and_is_not_absurd(self) -> None:
        # A sanity floor and ceiling on numbers that have not been read
        # off a price page. The most one call can spend must be cents,
        # not dollars. If this fails, a rate was changed to something
        # that wants looking at.
        dearest = max(IMAGE_USD_PER_IMAGE.values())
        usd_for_one_fullest_call = dearest * IMAGE_MAX_IMAGES
        assert 0.001 < usd_for_one_fullest_call < 2.00


class TestTheCatalogueEntryAgrees:
    """The route meters through `record_usage`, which calls `credits_for`
    like every other call. `credits_for_image` is defined through the
    same function so the two cannot tell different stories — this holds
    that wiring in place, because the day somebody reimplements the
    arithmetic beside it is the day they can drift."""

    def test_both_paths_reach_the_same_figure(self) -> None:
        for size in IMAGE_USD_PER_IMAGE:
            for count in (1, 2, IMAGE_MAX_IMAGES):
                units = image_billing_units(size, count)
                through_the_catalogue = credits_for(
                    IMAGE_MODEL, Usage(input_tokens=units)
                )
                assert through_the_catalogue == credits_for_image(size, count), (
                    size,
                    count,
                )

    def test_it_is_not_on_the_menu(self) -> None:
        # Priced so its usage rows mean something; never offered as a
        # model somebody could pick to talk to.
        assert IMAGE_MODEL.role is None

    def test_a_usage_row_counts_money_and_not_tokens(self) -> None:
        # The unit on an image row is a tenth of a cent, as the unit on a
        # speech row is a character. Written down as a test because the
        # column is called `input_tokens` and will mislead whoever reads
        # the table next.
        units = image_billing_units("1024x1024", 1)
        assert units == round(IMAGE_USD_PER_IMAGE["1024x1024"] / 0.001)
