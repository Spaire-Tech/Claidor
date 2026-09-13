"""The catalogue and the price table, on their own
(`polar/desktop/pricing.py`). No settings, no database, no pydantic:
this is the module that decides what a person is charged, and it can be
read and run by itself — `pytest --noconftest tests/desktop/test_pricing.py`.
"""

from polar.desktop.pricing import (
    CREDIT_USD_PER_MILLION_INPUT,
    MODELS,
    PROVIDER_TOKEN_WEIGHTS,
    DesktopProvider,
    ModelRole,
    OpenAIUsageTally,
    Usage,
    UsageTally,
    credits_for,
    model_by_id,
    tally_for,
    usage_from_answer,
)

ANTHROPIC_STREAM = b"".join(
    [
        b'event: message_start\ndata: {"type":"message_start","message":'
        b'{"id":"msg_1","usage":{"input_tokens":120,"output_tokens":1,'
        b'"cache_creation_input_tokens":40,"cache_read_input_tokens":1000}}}\n\n',
        b'event: message_delta\ndata: {"type":"message_delta",'
        b'"usage":{"output_tokens":57}}\n\n',
    ]
)

OPENAI_STREAM = b"".join(
    [
        b'data: {"id":"c1","choices":[{"delta":{"content":"Hi"}}],"usage":null}\n\n',
        b'data: {"id":"c1","choices":[],"usage":{"prompt_tokens":1120,'
        b'"completion_tokens":57,"total_tokens":1177,'
        b'"prompt_tokens_details":{"cached_tokens":1000}}}\n\n',
        b"data: [DONE]\n\n",
    ]
)


class TestCatalogue:
    def test_every_entry_says_who_serves_it_and_in_which_language(self) -> None:
        for model in MODELS:
            row = model.available()
            assert row["provider"] == model.provider.value
            assert row["apiFormat"] == model.api_format
            assert model.pricing()["provider"] == model.provider.value

    def test_both_providers_are_on_the_menu(self) -> None:
        providers = {model.provider for model in MODELS}
        assert providers == {DesktopProvider.anthropic, DesktopProvider.openai}

    def test_exactly_one_model_holds_each_role(self) -> None:
        # The policy of 13 September 2026: OpenAI serves everything the
        # person sees, on cost, and one Claude model stands behind it so a
        # single provider outage is not a total outage. Two models sharing
        # a role would mean nothing decides which one answers.
        by_role: dict[ModelRole, list[str]] = {}
        for model in MODELS:
            if model.role is not None:
                by_role.setdefault(model.role, []).append(model.model_id)

        assert by_role[ModelRole.primary] == ["gpt-5.6-terra"]
        assert by_role[ModelRole.cheap] == ["gpt-5.6-luna"]
        assert by_role[ModelRole.fallback] == ["claude-sonnet-5"]

    def test_the_fallback_is_the_only_anthropic_model_with_a_role(self) -> None:
        anthropic_roles = {
            model.model_id: model.role
            for model in MODELS
            if model.provider is DesktopProvider.anthropic
        }
        assert anthropic_roles == {
            "claude-sonnet-5": ModelRole.fallback,
            "claude-opus-5": None,
            "claude-haiku-4-5-20251001": None,
        }

    def test_astra_is_priced_but_withheld(self) -> None:
        # Withheld because every OpenAI model runs with
        # reasoning_effort "none" whenever tools are present, and for an
        # agent tools are always present — so Astra costs five times Terra
        # for a capability that is switched off. It stays in the catalogue
        # so a saved config still naming it meters correctly.
        astra = next(model for model in MODELS if model.model_id == "gpt-6-astra")
        assert astra.role is None
        assert astra.available()["role"] is None
        assert astra.cost_multiplier > 0

    def test_available_carries_the_role(self) -> None:
        terra = next(model for model in MODELS if model.model_id == "gpt-5.6-terra")
        assert terra.available()["role"] == "primary"

    def test_the_gpt_multipliers_are_the_published_prices_in_credit_units(
        self,
    ) -> None:
        # https://developers.openai.com/api/docs/pricing, read 11 Sept 2026,
        # in dollars per million input tokens.
        published = {
            "gpt-6-astra": 10.00,
            "gpt-5.6-terra": 2.00,
            "gpt-5.6-luna": 0.20,
        }
        for model_id, usd in published.items():
            model = model_by_id(model_id)
            assert model is not None
            assert model.cost_multiplier == usd / CREDIT_USD_PER_MILLION_INPUT


class TestPriceTable:
    def test_each_provider_has_its_own_weights(self) -> None:
        anthropic = PROVIDER_TOKEN_WEIGHTS[DesktopProvider.anthropic]
        openai = PROVIDER_TOKEN_WEIGHTS[DesktopProvider.openai]
        assert anthropic != openai
        # Anthropic charges for writing to the cache; OpenAI does not.
        assert anthropic.cache_creation > 0
        assert openai.cache_creation == 0

    def test_a_model_may_declare_the_one_exception_its_list_makes(self) -> None:
        astra = model_by_id("gpt-6-astra")
        terra = model_by_id("gpt-5.6-terra")
        assert astra is not None
        assert terra is not None
        # $10 in, $50 out on Astra; $2 in, $12 out on Terra.
        assert astra.weights.output == 5.0
        assert terra.weights.output == 6.0
        # The exception touches nothing else on the list.
        assert astra.weights.cache_read == terra.weights.cache_read

    def test_the_claude_weights_are_unchanged(self) -> None:
        sonnet = model_by_id("claude-sonnet-5")
        haiku = model_by_id("claude-haiku-4-5-20251001")
        assert sonnet is not None
        assert haiku is not None
        usage = Usage(input_tokens=1000, output_tokens=100, cache_read_tokens=10_000)
        assert credits_for(sonnet, usage) == 2500
        assert credits_for(haiku, usage) == 500

    def test_a_gpt_token_is_not_priced_like_a_claude_token(self) -> None:
        usage = Usage(input_tokens=1_000_000)
        sonnet = model_by_id("claude-sonnet-5")
        astra = model_by_id("gpt-6-astra")
        luna = model_by_id("gpt-5.6-luna")
        assert sonnet is not None
        assert astra is not None
        assert luna is not None
        # A million input tokens: $3 on Sonnet, $10 on Astra, $0.20 on Luna.
        assert credits_for(sonnet, usage) == 1_000_000
        assert credits_for(astra, usage) == round(1_000_000 * 10.00 / 3.00)
        assert credits_for(luna, usage) == round(1_000_000 * 0.20 / 3.00)

    def test_a_cache_write_costs_nothing_on_openai(self) -> None:
        terra = model_by_id("gpt-5.6-terra")
        assert terra is not None
        assert credits_for(terra, Usage(cache_creation_tokens=1_000_000)) == 0


class TestUsageShapes:
    def test_openai_s_prompt_total_is_split_into_fresh_and_cached(self) -> None:
        usage = Usage.from_openai_payload(
            {
                "prompt_tokens": 1120,
                "completion_tokens": 57,
                "prompt_tokens_details": {"cached_tokens": 1000},
            }
        )
        assert usage == Usage(
            input_tokens=120, output_tokens=57, cache_read_tokens=1000
        )

    def test_a_prompt_with_no_cache_detail_is_all_fresh(self) -> None:
        usage = Usage.from_openai_payload({"prompt_tokens": 40, "completion_tokens": 2})
        assert usage == Usage(input_tokens=40, output_tokens=2)

    def test_nonsense_is_nothing_rather_than_an_exception(self) -> None:
        assert Usage.from_openai_payload(None) == Usage()
        assert Usage.from_payload("not a dict") == Usage()

    def test_an_answer_is_read_in_its_own_provider_s_shape(self) -> None:
        anthropic_answer = {"usage": {"input_tokens": 10, "output_tokens": 2}}
        openai_answer = {"usage": {"prompt_tokens": 10, "completion_tokens": 2}}
        assert usage_from_answer(DesktopProvider.anthropic, anthropic_answer) == Usage(
            input_tokens=10, output_tokens=2
        )
        assert usage_from_answer(DesktopProvider.openai, openai_answer) == Usage(
            input_tokens=10, output_tokens=2
        )
        # Each one reads nothing from the other's shape, which is the
        # point of not building a converter.
        assert usage_from_answer(DesktopProvider.anthropic, openai_answer) == Usage()


class TestTallies:
    def test_the_right_tally_is_chosen_for_each_provider(self) -> None:
        assert isinstance(tally_for(DesktopProvider.anthropic), UsageTally)
        assert isinstance(tally_for(DesktopProvider.openai), OpenAIUsageTally)

    def test_anthropic_events_are_read_across_chunk_boundaries(self) -> None:
        tally = tally_for(DesktopProvider.anthropic)
        for index in range(0, len(ANTHROPIC_STREAM), 7):
            tally.feed(ANTHROPIC_STREAM[index : index + 7])
        assert tally.finish() == Usage(
            input_tokens=120,
            output_tokens=57,
            cache_creation_tokens=40,
            cache_read_tokens=1000,
        )

    def test_openai_events_are_read_across_chunk_boundaries(self) -> None:
        tally = tally_for(DesktopProvider.openai)
        for index in range(0, len(OPENAI_STREAM), 7):
            tally.feed(OPENAI_STREAM[index : index + 7])
        assert tally.finish() == Usage(
            input_tokens=120, output_tokens=57, cache_read_tokens=1000
        )

    def test_a_stream_that_reports_nothing_tallies_nothing(self) -> None:
        tally = tally_for(DesktopProvider.openai)
        tally.feed(b'data: {"choices":[{"delta":{"content":"x"}}],"usage":null}\n\n')
        tally.feed(b"data: [DONE]\n\n")
        assert tally.finish() == Usage()
