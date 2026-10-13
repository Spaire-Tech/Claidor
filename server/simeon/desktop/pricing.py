"""The models the desktop app may call, and what they cost.

Split out of `simeon.desktop.service` on purpose: this module holds the
catalogue and the whole of the metering, and it imports nothing but the
standard library. No settings, no database, no pydantic — so the price
table can be read and tested on its own, which is what you want from
the one piece of code that decides what a person is charged.

Three providers serve the catalogue today — Anthropic, OpenAI and, since
25 September 2026, Google's Gemini for the video role — and a token of
one is not priced like a token of the other. Three things
therefore travel together and must stay together:

- every `DesktopModel` says **who serves it** (`provider`);
- every provider has **its own weights** (`PROVIDER_TOKEN_WEIGHTS`),
  because output, cache writes and cache reads sit at different
  multiples of the input price on each price list;
- every usage row records the provider it was metered under, so a
  credit figure can always be traced back to the list that produced it.

The unit is unchanged: one credit is one input token on the middle
model. See `CREDIT_USD_PER_MILLION_INPUT`.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from enum import StrEnum
from math import ceil
from typing import Any

#: One credit is $3.00 per million, the input price the catalogue listed
#: for Claude Sonnet 5 when the unit was set. Every model's
#: `cost_multiplier` is its own published input price measured in that
#: unit, so a credit means the same amount of money whoever served it.
#: The unit stays $3.00 although no model is priced at it any more
#: (Sonnet 5 is $2.00 since the Claude 5.5 list, 13 October 2026): every
#: allowance and every usage row since is written in it.
CREDIT_USD_PER_MILLION_INPUT = 3.00


class ModelRole(StrEnum):
    """What a model is *for*. The app does not choose a model per message
    — it cannot know how hard a task is before doing it, the extra round
    trip costs a beat in an app whose whole feel is timing, and a price
    that moves for reasons a person cannot see makes the usage meter
    untrustworthy. Instead there is one model they talk to and cheap ones
    for machinery they never see, and the roles are declared here rather
    than in the app so the policy can change with a deploy instead of a
    release. Who holds `primary`, `cheap` and `fallback` is one of the
    `ModelPolicy` tables below, chosen by a setting; `video` and `retired`
    are the model's own and hold under every policy.

    `primary`  — every reply the person reads.
    `cheap`    — sub-agents, compaction, the memory flush, heartbeats,
                 chat titles, sidebar previews. Never read as "the agent".
    `fallback` — answers when the primary's provider is down. Never the
                 default, never shown, never in a menu.
    """

    primary = "primary"
    cheap = "cheap"
    fallback = "fallback"
    #: Watches a video on the agent's behalf: the watchVideo / videoReview
    #: subagents run on it and nothing else does. Never in the menu — the
    #: person never talks to it — but offered, so the app can register the
    #: subagent when the provider has a key (25 September 2026).
    video = "video"
    #: Replaced, still served: the proxy answers a request that names it,
    #: so an app built before the replacement keeps working until it is
    #: rebuilt, but it is never offered and never chosen. GPT-5.6 Terra and
    #: GPT-5.6 Luna since GPT-6 Sol and Luna (28 September 2026).
    retired = "retired"


class ModelPolicy(StrEnum):
    """Which family answers: who holds `primary`, `cheap` and `fallback`
    (`POLICY_ROLES`). One setting chooses it for everyone,
    `SIMEON_DESKTOP_MODELS`, and `SIMEON_DESKTOP_MODELS_BY_EMAIL` chooses
    it for a few people first (13 October 2026, the founder moving from
    OpenAI to Claude "without losing productivity"). The engine reads the
    roles from `/api/models/available` and follows them, so a change takes
    effect within minutes, without a release."""

    #: GPT-6 Sol answers, GPT-6 Luna does the machinery, Claude Sonnet 5.5
    #: stands by. The policy since 13 September 2026.
    openai = "openai"
    #: Claude Sonnet 5.5 answers, Claude Haiku 5.5 does the machinery,
    #: GPT-6 Sol stands by.
    claude = "claude"
    #: As `claude`, with Claude Opus 5.5 answering: for the cost test, and
    #: for the day the extra intelligence is worth twice the price.
    claude_opus = "claude-opus"


class DesktopProvider(StrEnum):
    """Who serves a model, and therefore which key, which address and
    which price list the proxy uses. The value is also the wire format:
    an Anthropic provider speaks `/v1/messages`, an OpenAI one speaks
    `/v1/chat/completions`, a Gemini one `:generateContent`, and none is
    translated into another."""

    anthropic = "anthropic"
    openai = "openai"
    gemini = "gemini"
    #: ElevenLabs Agents: the voice calls (`simeon.desktop.voice`). Serves
    #: no model on the proxy and speaks none of the wires below; it is
    #: here because a voice call's usage row names who billed it.
    elevenlabs = "elevenlabs"


class SpokenApi(StrEnum):
    """The language one request is written in.

    Not the same question as who serves the model. Anthropic has one wire
    and OpenAI has two: the older `/v1/chat/completions`, and
    `/v1/responses`, which is the only one that will take reasoning and
    function tools in the same request. Gemini has its own,
    `/v1beta/models/{model}:generateContent` (`:streamGenerateContent`
    with `alt=sse` for a stream), the only one of the four that takes a
    video as input. Each is a different request shape, a different
    stream, and — the part that matters here — a different place to find
    the usage.

    The path the engine calls says which of these is being spoken; the
    model says who serves it. They must agree, and `simeon.desktop.
    endpoints` refuses the request when they do not.
    """

    anthropic_messages = "anthropic-messages"
    openai_completions = "openai-completions"
    openai_responses = "openai-responses"
    gemini_generate_content = "gemini-generate-content"

    @property
    def provider(self) -> DesktopProvider:
        if self is SpokenApi.anthropic_messages:
            return DesktopProvider.anthropic
        if self is SpokenApi.gemini_generate_content:
            return DesktopProvider.gemini
        return DesktopProvider.openai


@dataclass(frozen=True)
class TokenWeights:
    """What a token of each kind costs on one price list, relative to one
    input token of the same model. Input is 1 by definition."""

    output: float
    cache_creation: float
    cache_read: float


#: The two price lists, as their owners publish them.
#:
#: Anthropic (https://www.anthropic.com/pricing): output is 5× input,
#: a five-minute cache write 1.25×, a cache read 0.1×. The Claude 5.5 list
#: (platform.claude.com/docs pricing, read 13 October 2026) keeps output
#: and the write and halves the read on Sonnet and Opus: $0.10 cached
#: against $2.00 on Sonnet 5.5, $0.20 against $4.00 on Opus 5.5. Those
#: two declare it (`DesktopModel.cache_read_weight`); Haiku 5.5's read is
#: still a tenth ($0.01 against $0.10). The engine only writes
#: five-minute entries; an hour's entry would cost 2× and is not priced.
#:
#: OpenAI (https://developers.openai.com/api/docs/pricing, read
#: 11 September 2026): a cached input token is 0.1× an uncached one and
#: writing to the cache is not charged at all, so `cache_creation` is 0.
#: Output is 6× input on the two cheaper models and 5× on the two dearer
#: ones, which is why `DesktopModel.output_weight` exists.
#:
#: Google (Gemini): ⚠️ **to confirm against ai.google.dev/pricing** —
#: written 25 September 2026 from memory, not read off the page. Gemini
#: 2.5 Flash is remembered as $0.30 in / $2.50 out per million tokens
#: (output 8.33× input), a cached read at roughly a tenth of an input
#: token, and cache storage billed by the hour rather than per write, so
#: `cache_creation` is 0 the way OpenAI's is. Nobody should be charged
#: against these three numbers until somebody has looked; each is a
#: single constant with a test behind it.
PROVIDER_TOKEN_WEIGHTS: dict[DesktopProvider, TokenWeights] = {
    DesktopProvider.anthropic: TokenWeights(
        output=5.0, cache_creation=1.25, cache_read=0.1
    ),
    DesktopProvider.openai: TokenWeights(
        output=6.0, cache_creation=0.0, cache_read=0.1
    ),
    DesktopProvider.gemini: TokenWeights(
        output=2.50 / 0.30, cache_creation=0.0, cache_read=0.1
    ),
    # A voice call is billed by the second and nothing else: its row
    # counts seconds as input and has no output or cache to weigh.
    DesktopProvider.elevenlabs: TokenWeights(
        output=0.0, cache_creation=0.0, cache_read=0.0
    ),
}


@dataclass(frozen=True)
class DesktopModel:
    model_id: str
    model_name: str
    description: str
    #: Cost weight relative to the middle model, used for credits and
    #: shown by the app. A weight, not a price list.
    cost_multiplier: float
    provider: DesktopProvider = DesktopProvider.anthropic
    context_window: int = 200_000
    max_tokens: int = 16_384
    #: Set only where this model's output price is not the ratio its
    #: provider's list uses for everything else. Leave it None and the
    #: provider's weights apply unchanged.
    output_weight: float | None = None
    #: Likewise for a cached read: set only where the model's list prices
    #: it at another ratio than its provider's (Claude Sonnet 5.5 and Opus
    #: 5.5, 0.05×).
    cache_read_weight: float | None = None
    #: A dearer price for a long prompt: past `long_prompt_tokens` (input,
    #: cache writes and cache reads together, as the provider counts a
    #: prompt) every token of the call costs `long_prompt_multiplier` times
    #: the list. Claude Haiku 5.5 is $0.10 in up to 100,000 tokens and
    #: $0.50 beyond, and every other number on its list moves by the same
    #: five.
    long_prompt_tokens: int | None = None
    long_prompt_multiplier: float = 1.0
    #: What this model is for. `None` means the model is priced but not
    #: part of the current policy, and `offered_models()` leaves it off
    #: the menu. It stays in `MODELS` so a saved config that still names
    #: it is priced correctly rather than failing.
    role: ModelRole | None = None
    #: Whether the provider will take `reasoning_effort` and function
    #: tools in the same request.
    #:
    #: Read on one wire only: OpenAI's Chat Completions. It is the wire
    #: that refuses the combination, and since 13 September nothing of
    #: ours is pointed at it — every OpenAI model is reached on
    #: `/v1/responses`, where reasoning and tools travel together. The
    #: flag and the `none` it forces are kept for that older wire, which
    #: is still served.
    #:
    #: None means not established, and the proxy then assumes it will
    #: not. That is the safe way round and it is not a guess: OpenAI
    #: refuses the combination on `/v1/chat/completions` for every model
    #: of ours tried so far, and the two outcomes are not comparable —
    #: assuming wrongly that a model refuses costs it its reasoning,
    #: assuming wrongly that it accepts costs every answer.
    #:
    #: Set True only for a model seen to accept both together.
    tool_reasoning: bool | None = None
    #: Whether the model takes a video as input. Only the Gemini entries
    #: do; the app's watchVideo / videoReview subagents are registered on
    #: the first offered model that says so (`videoModels` in the pricing
    #: catalogue, `supportsVideo` on the model row).
    supports_video: bool = False

    @property
    def api_format(self) -> str:
        """The provider's dialect family, kept as it has always been
        spelled so an app that has not been updated still picks the right
        one. `transport_api` is the precise answer."""
        return self.provider.value

    @property
    def spoken(self) -> SpokenApi:
        """The language the engine must write to reach this model.

        Every OpenAI model of ours is reached on `/v1/responses`, because
        Chat Completions refuses reasoning alongside function tools and an
        agent always carries tools. Anthropic has one wire and this is it;
        so does Gemini.
        """
        if self.provider is DesktopProvider.anthropic:
            return SpokenApi.anthropic_messages
        if self.provider is DesktopProvider.gemini:
            return SpokenApi.gemini_generate_content
        return SpokenApi.openai_responses

    def reachable_on(self, spoken: SpokenApi) -> bool:
        """Whether this model can be asked for in that language.

        The one rule, in one place. Nothing in the proxy translates
        between an Anthropic request and an OpenAI one, so a model is
        reachable on a wire only when its provider is the one that speaks
        it. `simeon.desktop.endpoints._proxy` refuses the request when this
        is false, and the model list served on a wire shows only the
        models for which it is true — a menu offering a model the next
        request would refuse is worse than a short menu.
        """
        return self.provider is spoken.provider

    @property
    def weights(self) -> TokenWeights:
        """This model's price list: its provider's, with the exceptions
        the entry declares."""
        weights = PROVIDER_TOKEN_WEIGHTS[self.provider]
        if self.output_weight is not None:
            weights = replace(weights, output=self.output_weight)
        if self.cache_read_weight is not None:
            weights = replace(weights, cache_read=self.cache_read_weight)
        return weights

    def available(self) -> dict[str, Any]:
        """The row of `/api/models/available`, as `AvailableServerModel`
        in the app reads it."""
        return {
            "modelId": self.model_id,
            "modelName": self.model_name,
            "provider": self.provider.value,
            "apiFormat": self.api_format,
            "description": self.description,
            "costMultiplier": self.cost_multiplier,
            "accessible": True,
            "supportsImage": True,
            "supportsVideo": self.supports_video,
            "supportsThinking": False,
            "supportsToolCalling": True,
            "agenticReady": True,
            "role": self.role.value if self.role else None,
            # `apiFormat` stays the dialect family; this is the exact wire,
            # spelled as the engine's own transport names spell it. A new
            # field rather than a changed one, so an app that predates it
            # keeps working off the family.
            "transportApi": self.spoken.value,
            "contextWindow": self.context_window,
            "maxTokens": self.max_tokens,
            "explicitContextCache": False,
        }

    def pricing(self) -> dict[str, Any]:
        return {
            "modelId": self.model_id,
            "modelName": self.model_name,
            "provider": self.provider.value,
            "costMultiplier": self.cost_multiplier,
            "description": self.description,
        }


#: The catalogue. Everything priced lives here; what is *offered* is the
#: subset carrying a role under the policy in force, whose provider has a
#: key (`models_under`, `simeon.desktop.service.offered_models`). The
#: multipliers are each model's published input price over $3.00 per
#: million, so the credit figures of the providers mean the same money.
#:
#: The roles here are only the ones that hold under every policy: `video`
#: and `retired`. `primary`, `cheap` and `fallback` are `POLICY_ROLES`.
#:
#: The OpenAI policy was decided 13 September 2026, on cost: Claude was
#: then listed here at Sonnet's $3.00 / $15.00 against Terra's $2.00 /
#: $12.00. The Claude 5.5 list (13 October 2026) puts Sonnet 5.5 at GPT-6
#: Sol's own $2.00 / $10.00 with a cached read at half Sol's, and Haiku
#: 5.5 at GPT-6 Luna's $0.10 / $0.50; what is left between them is the
#: cache write, which Anthropic charges at 1.25× and OpenAI does not.
#: Whichever family answers, the other stands by, because a sole provider
#: means one outage is a total outage.
MODELS: tuple[DesktopModel, ...] = (
    # Claude 5.5, 13 October 2026, from platform.claude.com/docs pricing.
    # Per million tokens: input, five-minute cache write, cache read,
    # output. Every one has a 1M context and writes up to 128K.
    #
    # Sonnet 5.5: $2.00, $2.50, $0.10, $10.00.
    DesktopModel(
        "claude-sonnet-5-5",
        "Claude Sonnet 5.5",
        "Anthropic's everyday model: fast, capable, the default.",
        2.00 / CREDIT_USD_PER_MILLION_INPUT,
        context_window=1_000_000,
        max_tokens=128_000,
        cache_read_weight=0.10 / 2.00,
    ),
    # Opus 5.5: $4.00, $5.00, $0.20, $20.00.
    DesktopModel(
        "claude-opus-5-5",
        "Claude Opus 5.5",
        "Anthropic's most capable model, for the hardest work.",
        4.00 / CREDIT_USD_PER_MILLION_INPUT,
        context_window=1_000_000,
        max_tokens=128_000,
        cache_read_weight=0.20 / 4.00,
    ),
    # Haiku 5.5: $0.10, $0.125, $0.01, $0.50 up to a 100,000-token prompt;
    # $0.50, $0.625, $0.05, $2.50 beyond it.
    DesktopModel(
        "claude-haiku-5-5",
        "Claude Haiku 5.5",
        "Anthropic's quickest and cheapest model, for simple steps.",
        0.10 / CREDIT_USD_PER_MILLION_INPUT,
        context_window=1_000_000,
        max_tokens=128_000,
        long_prompt_tokens=100_000,
        long_prompt_multiplier=5.0,
    ),
    # The fallback until 13 October 2026, never called by anything we
    # built; retired rather than dropped so a request naming it is still
    # served. $2.00 in, $10.00 out (listed here at $3.00 / $15.00 until
    # the 5.5 list was read).
    DesktopModel(
        "claude-sonnet-5",
        "Claude Sonnet 5",
        "Anthropic's previous everyday model.",
        2.00 / CREDIT_USD_PER_MILLION_INPUT,
        role=ModelRole.retired,
    ),
    # No role: priced, so an old usage row naming it still means something,
    # but neither offered nor served. $5.00 / $25.00 (listed at $15.00 /
    # $75.00 until 13 October 2026).
    DesktopModel(
        "claude-opus-5",
        "Claude Opus 5",
        "Anthropic's previous most capable model.",
        5.00 / CREDIT_USD_PER_MILLION_INPUT,
    ),
    # $1.00 / $5.00 (listed at $0.60 / $3.00 until 13 October 2026).
    DesktopModel(
        "claude-haiku-4-5-20251001",
        "Claude Haiku 4.5",
        "Anthropic's previous quick model.",
        1.00 / CREDIT_USD_PER_MILLION_INPUT,
    ),
    # None of the OpenAI entries below sets `tool_reasoning`, so all three
    # are treated as refusing reasoning alongside function tools. OpenAI,
    # 13 September, on Astra and then word for word again on Terra:
    #
    #   Function tools with reasoning_effort are not supported for
    #   <model> in /v1/chat/completions. To use function tools, use
    #   /v1/responses or set reasoning_effort to 'none'.
    #
    # Two of two, in the same sentence with the name swapped, which reads
    # as the endpoint's rule rather than a quirk of one model. Luna is
    # assumed to share it: untested, same family, and being wrong about
    # it costs reasoning rather than every answer.
    #
    # $2.00 per million input tokens, output 6×.
    # GPT-6 Sol and GPT-6 Luna, released 22 September 2026 at half the
    # GPT-5.6 prices, take the primary and cheap roles (the founder, 28
    # September: "lets keep chat gpt … GPT-6 Sol and Luna … at half the
    # price"). Per million tokens: Sol $2.00 in, $0.20 cached, $10.00 out;
    # Luna $0.10 in, $0.01 cached, $0.50 out (Requesty and VentureBeat,
    # 22 September; openai.com/api/pricing refused this container). Output
    # is 5x input, not the 6x of the GPT-5.6 list; cached reads a tenth.
    # Their roles are the policy's (`POLICY_ROLES`).
    DesktopModel(
        "gpt-6-sol",
        "GPT-6 Sol",
        "OpenAI's everyday model: intelligence against cost.",
        2.00 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        output_weight=5.0,
    ),
    DesktopModel(
        "gpt-6-luna",
        "GPT-6 Luna",
        "OpenAI's quickest and cheapest model, for simple steps.",
        0.10 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        output_weight=5.0,
    ),
    # $2.00 per million input tokens, output 6x. Retired: served to an app
    # built before GPT-6, never offered.
    DesktopModel(
        "gpt-5.6-terra",
        "GPT-5.6 Terra",
        "OpenAI's previous everyday model.",
        2.00 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        role=ModelRole.retired,
    ),
    # $10.00 per million input tokens, output 5x.
    #
    # Withheld: no role, so it is not offered.
    #
    # The reason it was withheld is gone — the proxy speaks
    # `/v1/responses` now, and on that wire reasoning and tools travel
    # together, so Astra would actually reason. What is missing is a
    # reason to offer it. A role is a job, and every job is filled: a
    # second `primary` would mean nothing decides which model answers.
    # Astra belongs to escalation — the person asks, a step has failed
    # twice, or the agent asks — and that is not built. It comes back the
    # day it is, as a decision rather than a leftover.
    DesktopModel(
        "gpt-6-astra",
        "GPT-6 Astra",
        "OpenAI's most capable model, for the hardest work.",
        10.00 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        output_weight=5.0,
    ),
    # $0.20 per million input tokens, output 6x. Retired like Terra; web
    # search still runs on it (`WEB_SEARCH_MODEL_ID`), since whether GPT-6
    # Luna takes the web_search tool is not established.
    DesktopModel(
        "gpt-5.6-luna",
        "GPT-5.6 Luna",
        "OpenAI's previous quick model.",
        0.20 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        role=ModelRole.retired,
    ),
    # The video role, 25 September 2026: the only provider that takes a
    # video as input, reached on its own wire
    # (`/desktop/api/proxy/v1beta/models/{model}:streamGenerateContent`).
    # The watchVideo / videoReview subagents run here and nothing else
    # does; the person never picks it. ⚠️ Input prices to confirm against
    # ai.google.dev/pricing (see PROVIDER_TOKEN_WEIGHTS): Flash remembered
    # as $0.30 per million input tokens, Pro as $1.25 with output 8× input.
    DesktopModel(
        "gemini-2.5-flash",
        "Gemini 2.5 Flash",
        "Google's quick model; watches a video for the agent.",
        0.30 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.gemini,
        context_window=1_048_576,
        max_tokens=65_536,
        role=ModelRole.video,
        supports_video=True,
    ),
    # Priced, not offered: the better eye when a review needs it, kept off
    # the video role until someone measures Flash falling short.
    DesktopModel(
        "gemini-2.5-pro",
        "Gemini 2.5 Pro",
        "Google's most capable model; watches a video for the agent.",
        1.25 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.gemini,
        context_window=1_048_576,
        max_tokens=65_536,
        output_weight=10.00 / 1.25,
        supports_video=True,
    ),
)


#: Who answers under each policy. A model named here takes this role in
#: place of its own; every other model keeps its own (`video`, `retired`
#: or none).
#:
#: A policy also names, as `retired`, the other family's models an engine
#: built before the switch still calls: such an engine names GPT-6 Sol and
#: Luna whatever the server says, and must keep being answered until its
#: box takes the new bundle. Sol is the Claude policies' fallback anyway.
POLICY_ROLES: dict[ModelPolicy, dict[str, ModelRole]] = {
    ModelPolicy.openai: {
        "gpt-6-sol": ModelRole.primary,
        "gpt-6-luna": ModelRole.cheap,
        "claude-sonnet-5-5": ModelRole.fallback,
    },
    ModelPolicy.claude: {
        "claude-sonnet-5-5": ModelRole.primary,
        "claude-haiku-5-5": ModelRole.cheap,
        "gpt-6-sol": ModelRole.fallback,
        "gpt-6-luna": ModelRole.retired,
    },
    ModelPolicy.claude_opus: {
        "claude-opus-5-5": ModelRole.primary,
        "claude-haiku-5-5": ModelRole.cheap,
        "gpt-6-sol": ModelRole.fallback,
        "gpt-6-luna": ModelRole.retired,
        # A conversation the founder moves between the two Claude policies
        # may still be mid-turn on Sonnet when the setting changes.
        "claude-sonnet-5-5": ModelRole.retired,
    },
}


def models_under(policy: ModelPolicy) -> tuple[DesktopModel, ...]:
    """The catalogue with each model's role under one policy, in
    catalogue order."""
    roles = POLICY_ROLES[policy]
    return tuple(
        replace(one, role=roles[one.model_id]) if one.model_id in roles else one
        for one in MODELS
    )


def model_by_id(
    model_id: str, policy: ModelPolicy = ModelPolicy.openai
) -> DesktopModel | None:
    """The catalogue entry, with its role under `policy`. The price is the
    same under every policy; only the role moves."""
    wanted = model_id.strip()
    return next((one for one in models_under(policy) if one.model_id == wanted), None)


def served_model(model_id: str, policy: ModelPolicy) -> DesktopModel | None:
    """The model a request names, when the proxy answers it under this
    policy: any role at all, `retired` included. A priced row with no role
    is not served (F-122, 25 September 2026): it is in the catalogue so an
    old usage row still means something, not so a bearer can name it."""
    model = model_by_id(model_id, policy)
    return model if model is not None and model.role is not None else None


def video_models(models: Sequence[DesktopModel]) -> tuple[DesktopModel, ...]:
    """The models among `models` that take a video as input: the
    `videoModels` list of the pricing catalogue, in the order the app
    should prefer them."""
    return tuple(one for one in models if one.supports_video)


#: Who the models belong to, in OpenAI's `owned_by` field. Their own
#: servers put the vendor there; ours puts us, because from a client's
#: side of the proxy these are Simeon's models at Simeon's prices,
#: whoever runs the hardware.
MODELS_OWNER = "simeonlabs"


def openai_models_list(
    models: Sequence[DesktopModel], spoken: SpokenApi
) -> dict[str, Any]:
    """`GET /v1/models`, in OpenAI's shape, for one wire.

    An OpenAI-compatible client asks this before it asks anything else,
    to find out what it may name: it GETs `<base URL>/models` and reads
    `data[].id`, falling back to a hand-typed model id when the call fails.

    Filtered by `reachable_on`, so what the list offers is what the next
    request will accept. On the Chat Completions wire that means the
    OpenAI models and not the Anthropic ones — not because Claude is
    withheld, but because nothing here translates a Chat Completions
    request into an Anthropic one, so naming Claude on that wire would
    earn a 400. `created` is omitted rather than invented: these models
    have no publication date we hold, and a made-up timestamp is worse
    than an absent field.
    """
    return {
        "object": "list",
        "data": [
            {"id": one.model_id, "object": "model", "owned_by": MODELS_OWNER}
            for one in models
            if one.reachable_on(spoken)
        ],
    }


# --- credits --------------------------------------------------------------------


@dataclass
class Usage:
    """What a provider reported for one call, in Anthropic's shape: the
    input count never includes the cached reads, which are their own
    number. OpenAI reports a prompt total that does include them, so
    `from_openai_payload` subtracts before storing."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0

    @classmethod
    def from_payload(cls, usage: Any) -> Usage:
        """Anthropic's `usage` object."""
        if not isinstance(usage, dict):
            return cls()

        return cls(
            input_tokens=_number(usage, "input_tokens"),
            output_tokens=_number(usage, "output_tokens"),
            cache_creation_tokens=_number(usage, "cache_creation_input_tokens"),
            cache_read_tokens=_number(usage, "cache_read_input_tokens"),
        )

    @classmethod
    def from_openai_payload(cls, usage: Any) -> Usage:
        """OpenAI's `usage` object.

        `prompt_tokens` is the whole prompt, cached part included, and
        `prompt_tokens_details.cached_tokens` says how much of it was
        cached. Anthropic counts the two separately and the weights here
        expect that, so the cached part is taken out of the input count
        rather than charged twice.
        """
        if not isinstance(usage, dict):
            return cls()

        details = usage.get("prompt_tokens_details")
        cached = _number(details, "cached_tokens") if isinstance(details, dict) else 0
        prompt = _number(usage, "prompt_tokens")
        return cls(
            input_tokens=max(0, prompt - cached),
            output_tokens=_number(usage, "completion_tokens"),
            cache_read_tokens=cached,
        )

    @classmethod
    def from_openai_responses_payload(cls, usage: Any) -> Usage:
        """OpenAI's `usage` object on `/v1/responses`.

        Same accounting as Chat Completions under different names:
        `input_tokens` is the whole prompt with the cached part inside it,
        and `input_tokens_details.cached_tokens` says how much. The engine
        does the identical subtraction on its side
        (`openai-transport-stream.ts`, `response.completed`), which is
        where these field names were read from rather than remembered.

        `output_tokens` already includes `output_tokens_details.
        reasoning_tokens`; reasoning is billed as output and must not be
        added again.
        """
        if not isinstance(usage, dict):
            return cls()

        details = usage.get("input_tokens_details")
        cached = _number(details, "cached_tokens") if isinstance(details, dict) else 0
        prompt = _number(usage, "input_tokens")
        return cls(
            input_tokens=max(0, prompt - cached),
            output_tokens=_number(usage, "output_tokens"),
            cache_read_tokens=cached,
        )

    @classmethod
    def from_gemini_payload(cls, usage: Any) -> Usage:
        """Gemini's `usageMetadata` object, on a `generateContent` answer
        and on every chunk of a `streamGenerateContent` stream.

        `promptTokenCount` is the whole prompt, the video's tokens
        included, with the cached part inside it;
        `cachedContentTokenCount` says how much was cached, and is taken
        out the way OpenAI's is. `candidatesTokenCount` is the answer and
        `thoughtsTokenCount` the model's thinking, which Google bills as
        output, so the two are added. Field names as the REST API spells
        them (lowerCamelCase); a client speaking snake_case would get the
        same JSON back, so both are not needed here.
        """
        if not isinstance(usage, dict):
            return cls()

        cached = _number(usage, "cachedContentTokenCount")
        prompt = _number(usage, "promptTokenCount")
        return cls(
            input_tokens=max(0, prompt - cached),
            output_tokens=_number(usage, "candidatesTokenCount")
            + _number(usage, "thoughtsTokenCount"),
            cache_read_tokens=cached,
        )


def _number(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    return int(value) if isinstance(value, int | float) else 0


# --- speech -----------------------------------------------------------------

#: What OpenAI charges to turn text into speech, per million characters
#: of input.
#:
#: ⚠️ **This is the one number in this file that has not been checked
#: against a price page.** Every model multiplier above was read off the
#: provider's list; this was not, and nobody should be charged against it
#: until somebody has looked. It is a single constant precisely so that
#: looking, and correcting it, is a one-line change with a test behind
#: it.
#:
#: Characters and not tokens because characters are what we can count.
#: `/v1/audio/speech` answers with audio bytes and no usage object, so
#: unlike the model proxy there is nothing to read back — the only honest
#: measure is the text we sent.
SPEECH_USD_PER_MILLION_CHARACTERS = 15.00

#: The model the speech route asks for, and the single OpenAI voice
#: underneath all seven of ours. The seven name a manner, not a speaker
#: (`direction.md` §4), so they are prompt settings on one voice rather
#: than seven voices.
SPEECH_MODEL_ID = "gpt-4o-mini-tts"
SPEECH_VOICE = "alloy"

#: Long enough for a paragraph an agent would actually say aloud, short
#: enough that a runaway reply cannot quietly spend a month of credits in
#: one call.
SPEECH_MAX_CHARACTERS = 4_000


#: Speech as a catalogue entry, so a spoken reply is metered by the same
#: code and lands in the same table as everything else.
#:
#: Its input unit is **characters, not tokens** — `/v1/audio/speech`
#: returns audio and no usage object, so the text we sent is the only
#: thing there is to count. That is unambiguous given the model on the
#: row: a usage row naming this model counts characters. `credits_for`
#: then arrives at the same figure as `credits_for_speech`, and a test
#: holds the two together so neither can drift.
#:
#: No role: it is never in the model menu. It is priced so its usage
#: rows mean something, which is the same reason the withheld models
#: are here.
SPEECH_MODEL = DesktopModel(
    SPEECH_MODEL_ID,
    "OpenAI speech",
    "Turns a reply into a voice.",
    SPEECH_USD_PER_MILLION_CHARACTERS / CREDIT_USD_PER_MILLION_INPUT,
    provider=DesktopProvider.openai,
)


def credits_for_speech(characters: int) -> int:
    """Credits for one piece of speech, in the same unit as everything
    else: a credit is one input token on the middle model, which is
    $3.00 per million. So this is the money the characters cost, divided
    by the money a credit costs.

    Rounded up, never to zero for text that was actually spoken — a
    hundred short sentences are not free, and a meter that reads zero
    while money leaves is the one kind of wrong that matters here.
    """
    if characters <= 0:
        return 0
    usd = characters * SPEECH_USD_PER_MILLION_CHARACTERS / 1_000_000
    credits = usd / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000)
    return max(1, ceil(credits))


def credits_for(model: DesktopModel, usage: Usage) -> int:
    """One credit is one input token on the middle model. Everything else
    is weighed against that by the model's own price list — which is its
    provider's, so a GPT token and a Claude token cost what they actually
    cost and the monthly figure keeps meaning one thing."""
    weights = model.weights
    weighted = (
        usage.input_tokens
        + usage.output_tokens * weights.output
        + usage.cache_creation_tokens * weights.cache_creation
        + usage.cache_read_tokens * weights.cache_read
    )
    multiplier = model.cost_multiplier
    prompt = usage.input_tokens + usage.cache_creation_tokens + usage.cache_read_tokens
    if model.long_prompt_tokens is not None and prompt > model.long_prompt_tokens:
        multiplier *= model.long_prompt_multiplier
    return int(round(weighted * multiplier))


@dataclass
class SSEUsageTally:
    """Reads a provider's server-sent events as they stream past and
    keeps the usage they report. Subclasses read one provider's events."""

    usage: Usage = field(default_factory=Usage)
    _buffer: bytes = b""

    def feed(self, chunk: bytes) -> None:
        self._buffer += chunk
        while b"\n" in self._buffer:
            line, _, self._buffer = self._buffer.partition(b"\n")
            self._line(line.strip())

    def finish(self) -> Usage:
        if self._buffer.strip():
            self._line(self._buffer.strip())
            self._buffer = b""
        return self.usage

    def _line(self, line: bytes) -> None:
        if not line.startswith(b"data:"):
            return
        raw = line[5:].strip()
        if not raw or raw == b"[DONE]":
            return
        try:
            event = json.loads(raw)
        except ValueError:
            return
        if isinstance(event, dict):
            self._event(event)

    def _event(self, event: dict[str, Any]) -> None:
        raise NotImplementedError


@dataclass
class UsageTally(SSEUsageTally):
    """Anthropic: `message_start` carries the input side, `message_delta`
    the cumulative output side."""

    def _event(self, event: dict[str, Any]) -> None:
        kind = event.get("type")
        if kind == "message_start":
            message = event.get("message")
            if isinstance(message, dict):
                started = Usage.from_payload(message.get("usage"))
                self.usage.input_tokens = started.input_tokens
                self.usage.cache_creation_tokens = started.cache_creation_tokens
                self.usage.cache_read_tokens = started.cache_read_tokens
                self.usage.output_tokens = max(
                    self.usage.output_tokens, started.output_tokens
                )
        elif kind == "message_delta":
            delta = Usage.from_payload(event.get("usage"))
            self.usage.output_tokens = max(
                self.usage.output_tokens, delta.output_tokens
            )
            if delta.input_tokens:
                self.usage.input_tokens = delta.input_tokens
            if delta.cache_creation_tokens:
                self.usage.cache_creation_tokens = delta.cache_creation_tokens
            if delta.cache_read_tokens:
                self.usage.cache_read_tokens = delta.cache_read_tokens


@dataclass
class OpenAIUsageTally(SSEUsageTally):
    """OpenAI: one `usage` object, whole and final, on the last chunk —
    and only when the request asked for it, which the proxy makes sure
    of (`simeon.desktop.endpoints`). Chunks before it carry `usage: null`.
    """

    def _event(self, event: dict[str, Any]) -> None:
        reported = Usage.from_openai_payload(event.get("usage"))
        if reported != Usage():
            self.usage = reported


@dataclass
class OpenAIResponsesUsageTally(SSEUsageTally):
    """OpenAI's Responses stream: the usage rides on the terminal event,
    inside the whole response object rather than beside it.

    Three events can end a run — `response.completed`, and the two ways it
    can stop early — and all three carry the response. Taking whichever
    arrives means a run that stops on a token limit or fails halfway is
    still metered for what it burned, which is the honest outcome: the
    tokens were spent either way.

    No `stream_options` is needed here. This wire reports usage without
    being asked, unlike Chat Completions.
    """

    #: The events that carry a finished `response` object.
    TERMINAL = frozenset(
        {"response.completed", "response.incomplete", "response.failed"}
    )

    def _event(self, event: dict[str, Any]) -> None:
        if event.get("type") not in self.TERMINAL:
            return
        response = event.get("response")
        if not isinstance(response, dict):
            return
        reported = Usage.from_openai_responses_payload(response.get("usage"))
        if reported != Usage():
            self.usage = reported


@dataclass
class GeminiUsageTally(SSEUsageTally):
    """Gemini's `streamGenerateContent?alt=sse`: every chunk is a whole
    `GenerateContentResponse` and carries a cumulative `usageMetadata`,
    so the last one that says anything is the call's usage. The prompt
    count (the video's tokens with it) is on the first chunk already;
    the output count grows chunk by chunk."""

    def _event(self, event: dict[str, Any]) -> None:
        reported = Usage.from_gemini_payload(event.get("usageMetadata"))
        if reported != Usage():
            self.usage = reported


def tally_for(spoken: SpokenApi) -> SSEUsageTally:
    """A reader for the stream this language produces."""
    if spoken is SpokenApi.openai_responses:
        return OpenAIResponsesUsageTally()
    if spoken is SpokenApi.openai_completions:
        return OpenAIUsageTally()
    if spoken is SpokenApi.gemini_generate_content:
        return GeminiUsageTally()
    return UsageTally()


def usage_from_answer(spoken: SpokenApi, answer: Any) -> Usage:
    """The usage of one non-streaming answer, read in the shape the
    language it was written in reports."""
    if not isinstance(answer, dict):
        return Usage()
    if spoken is SpokenApi.openai_responses:
        return Usage.from_openai_responses_payload(answer.get("usage"))
    if spoken is SpokenApi.openai_completions:
        return Usage.from_openai_payload(answer.get("usage"))
    if spoken is SpokenApi.gemini_generate_content:
        return Usage.from_gemini_payload(answer.get("usageMetadata"))
    return Usage.from_payload(answer.get("usage"))


# --- the agent's other three calls: search, pictures, dictation ------------
#
# The agent advertises four tools that are not a model turn: web search,
# web fetch, image generation and audio transcription. Fetch runs on the
# person's machine and costs nothing here. The other three are served by
# the routes in `simeon.desktop.capabilities`, each on OpenAI with
# Simeon's key, and each priced below in the same unit as everything
# else so the usage table keeps meaning one thing.
#
# ⚠️ **None of the four dollar figures below has been checked against a
# price page.** Like `SPEECH_USD_PER_MILLION_CHARACTERS` they are single
# constants so that looking, and correcting, is a one-line change with a
# test behind it. They meter today (F-129, F-292, 25 September 2026): a
# door that did not meter would be the larger risk to the person's
# allowance, so the figures stand until the founder reads the price pages
# and corrects them; a wrong figure moves the meter, never the bill OpenAI
# sends Simeon Labs.

#: What OpenAI charges per call of its hosted `web_search` tool, on top
#: of the tokens the model that reads the results spends.
WEB_SEARCH_USD_PER_CALL = 0.01

#: The model that reads the search results and writes the short answer:
#: the cheap one, because the person never sees this turn and the
#: searching is done by the tool, not the model.
WEB_SEARCH_MODEL_ID = "gpt-5.6-luna"

WEB_SEARCH_MAX_QUERY_CHARACTERS = 1_000

#: One web search as a catalogue entry. Its input unit is **calls, not
#: tokens**: a usage row naming this model counts the searches made,
#: and the tokens the reading model spent go on that model's own row.
WEB_SEARCH_CALL_MODEL = DesktopModel(
    "openai-web-search",
    "OpenAI web search",
    "One search of the web, made for the agent.",
    WEB_SEARCH_USD_PER_CALL / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000),
    provider=DesktopProvider.openai,
)

#: What OpenAI charges for `gpt-image-1`, per million tokens: text going
#: in, reference images going in, and the picture coming out.
IMAGE_USD_PER_MILLION_TEXT_INPUT = 5.00
IMAGE_USD_PER_MILLION_IMAGE_INPUT = 10.00
IMAGE_USD_PER_MILLION_IMAGE_OUTPUT = 40.00

IMAGE_MODEL_ID = "gpt-image-1"
IMAGE_MAX_PROMPT_CHARACTERS = 32_000
IMAGE_MAX_REFERENCE_IMAGES = 4
#: OpenAI's own ceiling on one reference image.
IMAGE_MAX_REFERENCE_BYTES = 50 * 1024 * 1024

#: Pictures as a catalogue entry. Tokens, as OpenAI reports them, with
#: the picture's own tokens as output at their own price. A reference
#: image's tokens cost twice a text token's and `image_usage` folds them
#: into the input count at that ratio, so one row still adds up.
IMAGE_MODEL = DesktopModel(
    IMAGE_MODEL_ID,
    "OpenAI image",
    "Draws a picture from a description.",
    IMAGE_USD_PER_MILLION_TEXT_INPUT / CREDIT_USD_PER_MILLION_INPUT,
    provider=DesktopProvider.openai,
    output_weight=IMAGE_USD_PER_MILLION_IMAGE_OUTPUT / IMAGE_USD_PER_MILLION_TEXT_INPUT,
)


def image_usage(payload: Any) -> Usage:
    """The usage of one `gpt-image-1` answer: `input_tokens` split by
    `input_tokens_details` into text and image, `output_tokens` for the
    picture. Image input is weighed at its own price by counting each of
    its tokens as the number of text tokens it costs."""
    if not isinstance(payload, dict):
        return Usage()
    details = payload.get("input_tokens_details")
    image = _number(details, "image_tokens") if isinstance(details, dict) else 0
    text = _number(details, "text_tokens") if isinstance(details, dict) else 0
    if text == 0 and image == 0:
        text = _number(payload, "input_tokens")
    ratio = IMAGE_USD_PER_MILLION_IMAGE_INPUT / IMAGE_USD_PER_MILLION_TEXT_INPUT
    return Usage(
        input_tokens=text + ceil(image * ratio),
        output_tokens=_number(payload, "output_tokens"),
    )


#: What OpenAI charges to turn speech into text, per minute of audio.
TRANSCRIPTION_USD_PER_MINUTE = 0.003

TRANSCRIPTION_MODEL_ID = "gpt-4o-mini-transcribe"
#: OpenAI's own ceiling on one upload.
TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024

#: Dictation as a catalogue entry. Its input unit is **seconds of
#: audio, not tokens**: a usage row naming this model counts the seconds
#: OpenAI reported, rounded up, never zero for audio that was sent.
TRANSCRIPTION_MODEL = DesktopModel(
    TRANSCRIPTION_MODEL_ID,
    "OpenAI transcription",
    "Turns what was said into text.",
    (TRANSCRIPTION_USD_PER_MINUTE / 60) / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000),
    provider=DesktopProvider.openai,
)


def transcription_seconds(payload: Any) -> int:
    """The seconds of audio one transcription answer says it heard
    (`usage: {type: "duration", seconds}`), rounded up. One when the
    answer does not say: audio was sent, so something was heard, and a
    meter that reads zero while money leaves is the wrong kind of wrong."""
    seconds = 0.0
    if isinstance(payload, dict):
        usage = payload.get("usage")
        if isinstance(usage, dict):
            value = usage.get("seconds")
            if isinstance(value, int | float):
                seconds = float(value)
    return max(1, ceil(seconds))


#: What ElevenLabs Agents charges for a minute of a voice call, the
#: voice both ways (speech to text, text to speech, turn-taking).
#: ⚠️ Taken from the brief of 30 September 2026, not read off
#: elevenlabs.io/pricing; like the figures above, a single constant so
#: that checking and correcting it is a one-line change.
VOICE_CALL_USD_PER_MINUTE = 0.08

#: What Simeon adds on top. The call's language model (`VOICE_LLM` in
#: `simeon.desktop.voice`) is billed by ElevenLabs on top of the minute,
#: and the agent the call hands work to is metered on its own model rows;
#: the margin covers the first and the rounding, not the second.
VOICE_CALL_MARGIN = 1.25

#: The longest call ElevenLabs is told to allow, and the most the app's
#: own count can be billed for when ElevenLabs does not report one.
VOICE_CALL_MAX_SECONDS = 1_800

#: A voice call as a catalogue entry. Its input unit is **seconds of the
#: call, not tokens**: a usage row naming this model counts the seconds
#: billed, as ElevenLabs reported them when it did. No role: never on the
#: menu, priced so its rows mean something.
VOICE_CALL_MODEL = DesktopModel(
    "elevenlabs-voice-call",
    "ElevenLabs voice call",
    "A spoken conversation with an agent.",
    (VOICE_CALL_USD_PER_MINUTE * VOICE_CALL_MARGIN / 60)
    / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000),
    provider=DesktopProvider.elevenlabs,
)


__all__ = [
    "CREDIT_USD_PER_MILLION_INPUT",
    "MODELS",
    "PROVIDER_TOKEN_WEIGHTS",
    "DesktopModel",
    "DesktopProvider",
    "GeminiUsageTally",
    "ModelRole",
    "OpenAIResponsesUsageTally",
    "OpenAIUsageTally",
    "SSEUsageTally",
    "SpokenApi",
    "TokenWeights",
    "Usage",
    "UsageTally",
    "credits_for",
    "model_by_id",
    "tally_for",
    "usage_from_answer",
    "video_models",
]
