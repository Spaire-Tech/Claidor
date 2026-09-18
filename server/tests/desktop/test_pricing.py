"""The catalogue and the price table, on their own
(`polar/desktop/pricing.py`). No settings, no database, no pydantic:
this is the module that decides what a person is charged, and it can be
read and run by itself — `pytest --noconftest tests/desktop/test_pricing.py`.
"""

from polar.desktop.pricing import (
    CREDIT_USD_PER_MILLION_INPUT,
    MODELS,
    MODELS_OWNER,
    PROVIDER_TOKEN_WEIGHTS,
    DesktopProvider,
    ModelRole,
    OpenAIResponsesUsageTally,
    OpenAIUsageTally,
    SpokenApi,
    Usage,
    UsageTally,
    credits_for,
    model_by_id,
    openai_models_list,
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

# The Responses wire: usage rides on the terminal event, inside the whole
# response object rather than beside it, and arrives without having been
# asked for. Field names read off the engine's own handler
# (`openai-transport-stream.ts`, `response.completed`), not remembered.
RESPONSES_STREAM = b"".join(
    [
        b'event: response.created\ndata: {"type":"response.created",'
        b'"response":{"id":"resp_1","status":"in_progress"}}\n\n',
        b"event: response.output_text.delta\n"
        b'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n',
        b'event: response.completed\ndata: {"type":"response.completed",'
        b'"response":{"id":"resp_1","status":"completed","usage":'
        b'{"input_tokens":1120,"output_tokens":57,"total_tokens":1177,'
        b'"input_tokens_details":{"cached_tokens":1000},'
        b'"output_tokens_details":{"reasoning_tokens":31}}}}\n\n',
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

    def test_the_responses_input_total_is_split_into_fresh_and_cached(self) -> None:
        # Same accounting as Chat Completions under different names. The
        # reasoning count is inside output_tokens already and must not be
        # added again.
        usage = Usage.from_openai_responses_payload(
            {
                "input_tokens": 1120,
                "output_tokens": 57,
                "input_tokens_details": {"cached_tokens": 1000},
                "output_tokens_details": {"reasoning_tokens": 31},
            }
        )
        assert usage == Usage(
            input_tokens=120, output_tokens=57, cache_read_tokens=1000
        )

    def test_an_answer_is_read_in_the_shape_it_was_written_in(self) -> None:
        anthropic_answer = {"usage": {"input_tokens": 10, "output_tokens": 2}}
        completions_answer = {"usage": {"prompt_tokens": 10, "completion_tokens": 2}}
        responses_answer = {"usage": {"input_tokens": 10, "output_tokens": 2}}

        assert usage_from_answer(
            SpokenApi.anthropic_messages, anthropic_answer
        ) == Usage(input_tokens=10, output_tokens=2)
        assert usage_from_answer(
            SpokenApi.openai_completions, completions_answer
        ) == Usage(input_tokens=10, output_tokens=2)
        assert usage_from_answer(SpokenApi.openai_responses, responses_answer) == Usage(
            input_tokens=10, output_tokens=2
        )

        # Each reads nothing from a shape it does not speak, which is the
        # point of not building a converter.
        assert usage_from_answer(SpokenApi.anthropic_messages, completions_answer) == (
            Usage()
        )
        assert usage_from_answer(SpokenApi.openai_completions, responses_answer) == (
            Usage()
        )


class TestTallies:
    def test_the_right_tally_is_chosen_for_each_language(self) -> None:
        assert isinstance(tally_for(SpokenApi.anthropic_messages), UsageTally)
        assert isinstance(tally_for(SpokenApi.openai_completions), OpenAIUsageTally)
        assert isinstance(
            tally_for(SpokenApi.openai_responses), OpenAIResponsesUsageTally
        )

    def test_anthropic_events_are_read_across_chunk_boundaries(self) -> None:
        tally = tally_for(SpokenApi.anthropic_messages)
        for index in range(0, len(ANTHROPIC_STREAM), 7):
            tally.feed(ANTHROPIC_STREAM[index : index + 7])
        assert tally.finish() == Usage(
            input_tokens=120,
            output_tokens=57,
            cache_creation_tokens=40,
            cache_read_tokens=1000,
        )

    def test_openai_events_are_read_across_chunk_boundaries(self) -> None:
        tally = tally_for(SpokenApi.openai_completions)
        for index in range(0, len(OPENAI_STREAM), 7):
            tally.feed(OPENAI_STREAM[index : index + 7])
        assert tally.finish() == Usage(
            input_tokens=120, output_tokens=57, cache_read_tokens=1000
        )

    def test_responses_events_are_read_across_chunk_boundaries(self) -> None:
        tally = tally_for(SpokenApi.openai_responses)
        for index in range(0, len(RESPONSES_STREAM), 7):
            tally.feed(RESPONSES_STREAM[index : index + 7])
        assert tally.finish() == Usage(
            input_tokens=120, output_tokens=57, cache_read_tokens=1000
        )

    def test_a_run_that_stops_early_is_still_metered_for_what_it_burned(self) -> None:
        # Tokens were spent whether or not the answer finished, so the two
        # ways a run can stop early carry usage too and are read the same.
        for kind in ("response.incomplete", "response.failed"):
            tally = tally_for(SpokenApi.openai_responses)
            tally.feed(
                b'data: {"type":"'
                + kind.encode()
                + b'","response":{"usage":{"input_tokens":90,"output_tokens":4}}}\n\n'
            )
            assert tally.finish() == Usage(input_tokens=90, output_tokens=4), kind

    def test_a_responses_stream_with_no_terminal_event_tallies_nothing(self) -> None:
        tally = tally_for(SpokenApi.openai_responses)
        tally.feed(b'data: {"type":"response.output_text.delta","delta":"x"}\n\n')
        tally.feed(b'data: {"type":"response.created","response":{"id":"r"}}\n\n')
        assert tally.finish() == Usage()

    def test_a_stream_that_reports_nothing_tallies_nothing(self) -> None:
        tally = tally_for(SpokenApi.openai_completions)
        tally.feed(b'data: {"choices":[{"delta":{"content":"x"}}],"usage":null}\n\n')
        tally.feed(b"data: [DONE]\n\n")
        assert tally.finish() == Usage()


class TestTheMenuAnOpenAiCompatibleClientReads:
    """`GET /v1/models`, which is how a client that knows nothing about
    Claidor finds out what it may name.

    Written when Claidor was connected to Rakazo, a server we did not
    write. Its model connection speaks plain OpenAI and asks this one
    question before any other
    (the Rakazo attempt, removed 18 September; see `docs/product/going-back-brief.md`,
    `probeOpenAiCompatibleModels`).
    """

    def test_the_completions_wire_offers_openai_models_and_not_claude(self) -> None:
        # Not a policy about Claude. Nothing in the proxy translates a Chat
        # Completions request into an Anthropic one, so naming Claude here
        # would earn a 400 on the very next request. A menu that lists a
        # dish the kitchen refuses is worse than a short menu.
        listed = openai_models_list(MODELS, SpokenApi.openai_completions)
        ids = [row["id"] for row in listed["data"]]
        assert "gpt-5.6-terra" in ids
        assert "gpt-5.6-luna" in ids
        assert "claude-sonnet-5" not in ids
        assert all(model_by_id(one).provider is DesktopProvider.openai for one in ids)

    def test_the_anthropic_wire_offers_claude_and_not_the_gpts(self) -> None:
        listed = openai_models_list(MODELS, SpokenApi.anthropic_messages)
        ids = [row["id"] for row in listed["data"]]
        assert "claude-sonnet-5" in ids
        assert not [one for one in ids if one.startswith("gpt-")]

    def test_it_is_openais_shape_and_not_the_desktop_apps_envelope(self) -> None:
        # The whole point of this route: every other route here answers
        # `{"code": 0, "data": …}`, which the vendored client unwraps. An
        # OpenAI-compatible client reads `data` as the list of models. Hand
        # it the envelope and it parses a 200 and finds no models at all.
        listed = openai_models_list(MODELS, SpokenApi.openai_completions)
        assert listed["object"] == "list"
        assert isinstance(listed["data"], list)
        assert "code" not in listed
        for row in listed["data"]:
            assert row["object"] == "model"
            assert row["owned_by"] == MODELS_OWNER
            # No invented `created`: we hold no publication date for these,
            # and a made-up timestamp is worse than an absent field.
            assert set(row) == {"id", "object", "owned_by"}

    def test_the_list_and_the_route_cannot_drift_apart(self) -> None:
        # Both ask `reachable_on`, so a model that appears on a wire's menu
        # is by construction a model that wire accepts. This test exists so
        # that stays true if either side is rewritten.
        for spoken in SpokenApi:
            for row in openai_models_list(MODELS, spoken)["data"]:
                model = model_by_id(row["id"])
                assert model is not None
                assert model.reachable_on(spoken), (row["id"], spoken)

    def test_an_empty_catalogue_is_an_empty_list_not_a_failure(self) -> None:
        # `offered_models()` drops every model of a provider Claidor holds
        # no key for. With no OpenAI key the honest answer is a menu with
        # nothing on it, which a client reads as "nothing to connect".
        assert openai_models_list([], SpokenApi.openai_completions) == {
            "object": "list",
            "data": [],
        }
