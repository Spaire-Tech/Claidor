"""The catalogue and the price table, on their own
(`simeon/desktop/pricing.py`). No settings, no database, no pydantic:
this is the module that decides what a person is charged, and it can be
read and run by itself — `pytest --noconftest tests/desktop/test_pricing.py`.
"""

from simeon.desktop.pricing import (
    CREDIT_USD_PER_MILLION_INPUT,
    MODELS,
    MODELS_OWNER,
    POLICY_ROLES,
    POLICY_SECOND_ROLES,
    PROVIDER_TOKEN_WEIGHTS,
    DesktopProvider,
    ModelPolicy,
    ModelRole,
    OpenAIResponsesUsageTally,
    OpenAIUsageTally,
    SpokenApi,
    Usage,
    UsageTally,
    credits_for,
    model_by_id,
    models_under,
    openai_models_list,
    second_role_rows,
    served_model,
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
        # Three since 25 September 2026: Gemini serves the video role and
        # nothing else (tests/desktop/test_video_proxy.py).
        providers = {model.provider for model in MODELS}
        assert providers == {
            DesktopProvider.anthropic,
            DesktopProvider.openai,
            DesktopProvider.gemini,
        }

    def test_exactly_one_model_holds_each_role_under_every_policy(
        self,
    ) -> None:
        # Two models sharing a role would mean nothing decides which one
        # answers. Whichever family answers, the other stands by, so one
        # provider's outage is not a total outage.
        def roles(policy: ModelPolicy) -> dict[ModelRole, list[str]]:
            by_role: dict[ModelRole, list[str]] = {}
            for model in models_under(policy):
                if model.role is not None:
                    by_role.setdefault(model.role, []).append(model.model_id)
            return by_role

        openai = roles(ModelPolicy.openai)
        assert openai[ModelRole.primary] == ["gpt-6-sol"]
        assert openai[ModelRole.cheap] == ["gpt-6-luna"]
        assert openai[ModelRole.fallback] == ["claude-sonnet-5-5"]
        # 28 September 2026: GPT-6 Sol and Luna replace GPT-5.6 Terra and
        # Luna, which stay served to older apps under `retired`.
        assert openai[ModelRole.retired] == [
            "claude-sonnet-5",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
        ]
        assert openai[ModelRole.video] == ["gemini-2.5-flash"]

        claude = roles(ModelPolicy.claude)
        assert claude[ModelRole.primary] == ["claude-sonnet-5-5"]
        assert claude[ModelRole.cheap] == ["claude-haiku-5-5"]
        assert claude[ModelRole.fallback] == ["gpt-6-sol"]
        assert claude[ModelRole.video] == ["gemini-2.5-flash"]

        opus = roles(ModelPolicy.claude_opus)
        assert opus[ModelRole.primary] == ["claude-opus-5-5"]
        assert opus[ModelRole.cheap] == ["claude-haiku-5-5"]
        assert opus[ModelRole.fallback] == ["gpt-6-sol"]

        # Haiku holds `cheap` too, as a second role (`POLICY_SECOND_ROLES`).
        haiku = roles(ModelPolicy.claude_haiku)
        assert haiku[ModelRole.primary] == ["claude-haiku-5-5"]
        assert ModelRole.cheap not in haiku
        assert haiku[ModelRole.fallback] == ["gpt-6-sol"]
        assert haiku[ModelRole.video] == ["gemini-2.5-flash"]

    def test_haiku_does_the_machinery_too_under_its_own_policy(self) -> None:
        # The engine takes the first row of each role from
        # `/api/models/available`, and a row carries one role: Haiku is
        # listed a second time, as `cheap`, and only under `claude-haiku`.
        offered = models_under(ModelPolicy.claude_haiku)
        second = second_role_rows(offered, ModelPolicy.claude_haiku)
        assert [(one.model_id, one.role) for one in second] == [
            ("claude-haiku-5-5", ModelRole.cheap)
        ]
        assert second[0].available()["role"] == "cheap"
        for policy in (ModelPolicy.openai, ModelPolicy.claude, ModelPolicy.claude_opus):
            assert second_role_rows(models_under(policy), policy) == ()
        # Not offered, not listed again: a policy with no Anthropic key
        # offers Sol alone, and nothing names Haiku for the machinery.
        sol_only = tuple(one for one in offered if one.model_id == "gpt-6-sol")
        assert second_role_rows(sol_only, ModelPolicy.claude_haiku) == ()

    def test_a_second_role_is_a_role_nobody_else_holds(self) -> None:
        for policy, table in POLICY_SECOND_ROLES.items():
            for model_id, role in table.items():
                # The model already answers under the policy...
                assert POLICY_ROLES[policy].get(model_id) not in (None, role)
                # ...and no other model holds the second role there, or the
                # engine would take whichever row came first.
                assert role not in POLICY_ROLES[policy].values()

    def test_an_engine_built_before_a_switch_is_still_answered(self) -> None:
        # Every engine on a box until it takes a new bundle names GPT-6 Sol
        # for the loop and GPT-6 Luna for the machinery, whatever the server
        # says. Flipping the setting must not leave those agents silent.
        for policy in ModelPolicy:
            assert served_model("gpt-6-sol", policy) is not None, policy
            assert served_model("gpt-6-luna", policy) is not None, policy

    def test_a_policy_s_own_models_are_served_and_nothing_unpriced(self) -> None:
        for policy, table in POLICY_ROLES.items():
            for model_id in table:
                assert model_by_id(model_id) is not None, model_id
                assert served_model(model_id, policy) is not None
        # Opus 5.5 is served only where a policy names it.
        assert served_model("claude-opus-5-5", ModelPolicy.openai) is None
        assert served_model("claude-opus-5-5", ModelPolicy.claude) is None
        assert served_model("claude-opus-5-5", ModelPolicy.claude_opus) is not None
        # Haiku 5.5 is served under a Claude policy only.
        assert served_model("claude-haiku-5-5", ModelPolicy.openai) is None
        assert served_model("claude-haiku-5-5", ModelPolicy.claude_haiku) is not None
        # A conversation mid-turn on Sonnet or Opus when the setting moves
        # to Haiku is still answered.
        assert served_model("claude-sonnet-5-5", ModelPolicy.claude_haiku) is not None
        assert served_model("claude-opus-5-5", ModelPolicy.claude_haiku) is not None
        # Priced rows with no role are never served.
        for policy in ModelPolicy:
            assert served_model("claude-opus-5", policy) is None
            assert served_model("gpt-6-astra", policy) is None
            assert served_model("gemini-2.5-pro", policy) is None
            assert served_model("no-such-model", policy) is None

    def test_a_policy_is_spelled_as_the_setting_spells_it(self) -> None:
        assert ModelPolicy("openai") is ModelPolicy.openai
        assert ModelPolicy("claude") is ModelPolicy.claude
        assert ModelPolicy("claude-opus") is ModelPolicy.claude_opus
        assert ModelPolicy("claude-haiku") is ModelPolicy.claude_haiku

    def test_the_static_roles_hold_under_every_policy(self) -> None:
        # `video` and `retired` belong to the model; the policy tables hold
        # the rest, so nothing in MODELS itself is primary, cheap or
        # fallback.
        for model in MODELS:
            assert model.role in (None, ModelRole.video, ModelRole.retired)

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
        sol = model_by_id("gpt-6-sol", ModelPolicy.openai)
        assert sol is not None
        assert sol.available()["role"] == "primary"
        sonnet = model_by_id("claude-sonnet-5-5", ModelPolicy.claude)
        assert sonnet is not None
        assert sonnet.available()["role"] == "primary"
        assert sonnet.available()["transportApi"] == "anthropic-messages"
        sol = model_by_id("gpt-6-sol", ModelPolicy.claude)
        assert sol is not None
        assert sol.available()["role"] == "fallback"

    def test_the_gpt_multipliers_are_the_published_prices_in_credit_units(
        self,
    ) -> None:
        # https://developers.openai.com/api/docs/pricing, read 11 Sept 2026,
        # in dollars per million input tokens.
        published = {
            "gpt-6-astra": 10.00,
            "gpt-6-sol": 2.00,
            "gpt-6-luna": 0.10,
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

    def test_the_claude_5_5_list_in_credit_units(self) -> None:
        # platform.claude.com/docs pricing, read 13 October 2026, dollars per
        # million tokens: input, five-minute cache write, cache read, output.
        published = {
            "claude-sonnet-5-5": (2.00, 2.50, 0.10, 10.00),
            "claude-opus-5-5": (4.00, 5.00, 0.20, 20.00),
            "claude-haiku-5-5": (0.10, 0.125, 0.01, 0.50),
        }
        credit = CREDIT_USD_PER_MILLION_INPUT
        for model_id, (fresh, write, read, out) in published.items():
            model = model_by_id(model_id)
            assert model is not None
            # 50,000 tokens: inside Haiku's short-prompt price.
            assert credits_for(model, Usage(input_tokens=50_000)) == round(
                50_000 * fresh / credit
            )
            assert credits_for(model, Usage(output_tokens=50_000)) == round(
                50_000 * out / credit
            )
            assert credits_for(model, Usage(cache_creation_tokens=50_000)) == round(
                50_000 * write / credit
            )
            assert credits_for(model, Usage(cache_read_tokens=50_000)) == round(
                50_000 * read / credit
            )

    def test_an_hours_cache_write_costs_twice_an_input_token(self) -> None:
        # 16 October 2026: an agent's own conversation is kept for an hour
        # (the engine's `claude-messages.ts`), at $4.00 a million on Sonnet
        # 5.5 against $2.50 for five minutes.
        sonnet = model_by_id("claude-sonnet-5-5")
        assert sonnet is not None
        credit = CREDIT_USD_PER_MILLION_INPUT
        mixed = Usage(cache_creation_tokens=50_000, cache_creation_1h_tokens=30_000)
        assert credits_for(sonnet, mixed) == round(
            (20_000 * 2.50 + 30_000 * 4.00) / credit
        )
        # A split larger than the total is read as the total.
        over = Usage(cache_creation_tokens=10_000, cache_creation_1h_tokens=99_000)
        assert credits_for(sonnet, over) == round(10_000 * 4.00 / credit)
        # Providers without an hour's write price none.
        gpt = model_by_id("gpt-6-sol")
        assert gpt is not None
        assert (
            credits_for(
                gpt, Usage(cache_creation_tokens=1_000, cache_creation_1h_tokens=1_000)
            )
            == 0
        )

    def test_the_hours_writes_are_read_off_anthropics_usage(self) -> None:
        usage = Usage.from_payload(
            {
                "input_tokens": 12,
                "output_tokens": 3,
                "cache_creation_input_tokens": 900,
                "cache_read_input_tokens": 96_000,
                "cache_creation": {
                    "ephemeral_5m_input_tokens": 300,
                    "ephemeral_1h_input_tokens": 600,
                },
            }
        )
        assert usage == Usage(
            input_tokens=12,
            output_tokens=3,
            cache_creation_tokens=900,
            cache_read_tokens=96_000,
            cache_creation_1h_tokens=600,
        )
        tally = tally_for(SpokenApi.anthropic_messages)
        tally.feed(
            b'data: {"type":"message_start","message":{"usage":{"input_tokens":12,'
            b'"output_tokens":1,"cache_creation_input_tokens":900,'
            b'"cache_read_input_tokens":96000,"cache_creation":'
            b'{"ephemeral_5m_input_tokens":300,"ephemeral_1h_input_tokens":600}}}}\n\n'
        )
        assert tally.finish().cache_creation_1h_tokens == 600

    def test_haiku_5_5_costs_five_times_past_a_100k_prompt(self) -> None:
        haiku = model_by_id("claude-haiku-5-5")
        assert haiku is not None
        short = Usage(input_tokens=1_000, cache_read_tokens=99_000, output_tokens=500)
        long = Usage(input_tokens=1_001, cache_read_tokens=99_000, output_tokens=500)
        # $0.10 in, $0.01 cached, $0.50 out up to 100,000 tokens of prompt.
        assert credits_for(haiku, short) == round(
            (1_000 * 0.10 + 99_000 * 0.01 + 500 * 0.50) / 3.00
        )
        # $0.50, $0.05, $2.50 beyond: the whole call, not the excess.
        assert credits_for(haiku, long) == round(
            (1_001 * 0.50 + 99_000 * 0.05 + 500 * 2.50) / 3.00
        )
        # Sonnet and Opus have one price at every length.
        sonnet = model_by_id("claude-sonnet-5-5")
        assert sonnet is not None
        assert credits_for(sonnet, Usage(input_tokens=900_000)) == 600_000

    def test_the_earlier_claude_rows_are_their_real_prices(self) -> None:
        # Listed at $3 / $15, $15 / $75 and $0.60 / $3 until 13 October 2026.
        for model_id, usd in (
            ("claude-sonnet-5", 2.00),
            ("claude-opus-5", 5.00),
            ("claude-haiku-4-5-20251001", 1.00),
        ):
            model = model_by_id(model_id)
            assert model is not None
            assert model.cost_multiplier == usd / CREDIT_USD_PER_MILLION_INPUT
            assert model.weights == PROVIDER_TOKEN_WEIGHTS[DesktopProvider.anthropic]

    def test_a_gpt_token_is_not_priced_like_a_claude_token(self) -> None:
        usage = Usage(input_tokens=1_000_000)
        opus = model_by_id("claude-opus-5-5")
        astra = model_by_id("gpt-6-astra")
        luna = model_by_id("gpt-5.6-luna")
        assert opus is not None
        assert astra is not None
        assert luna is not None
        # A million input tokens: $4 on Opus 5.5, $10 on Astra, $0.20 on Luna.
        assert credits_for(opus, usage) == round(1_000_000 * 4.00 / 3.00)
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
    Simeon finds out what it may name.

    Such a client speaks plain OpenAI and asks this one question before
    any other.
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
        assert all(
            (model := model_by_id(one)) is not None
            and model.provider is DesktopProvider.openai
            for one in ids
        )

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
        # `offered_models()` drops every model of a provider Simeon holds
        # no key for. With no OpenAI key the honest answer is a menu with
        # nothing on it, which a client reads as "nothing to connect".
        assert openai_models_list([], SpokenApi.openai_completions) == {
            "object": "list",
            "data": [],
        }


def test_gpt_6_output_is_five_times_input() -> None:
    # $2 in / $10 out for Sol, $0.10 / $0.50 for Luna (22 September 2026).
    for model_id in ("gpt-6-sol", "gpt-6-luna"):
        model = next(one for one in MODELS if one.model_id == model_id)
        assert model.output_weight == 5.0
