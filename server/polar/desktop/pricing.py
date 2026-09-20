"""The models the desktop app may call, and what they cost.

Split out of `polar.desktop.service` on purpose: this module holds the
catalogue and the whole of the metering, and it imports nothing but the
standard library. No settings, no database, no pydantic — so the price
table can be read and tested on its own, which is what you want from
the one piece of code that decides what a person is charged.

Two providers serve the catalogue today, Anthropic and OpenAI, and a
token of one is not priced like a token of the other. Three things
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

#: One credit is one input token on the middle model, Claude Sonnet 5,
#: which Anthropic prices at $3.00 per million input tokens. Every model's
#: `cost_multiplier` is its own published input price measured in that
#: unit, so a credit means the same amount of money whoever served it.
CREDIT_USD_PER_MILLION_INPUT = 3.00


class ModelRole(StrEnum):
    """What a model is *for*. The app does not choose a model per message
    — it cannot know how hard a task is before doing it, the extra round
    trip costs a beat in an app whose whole feel is timing, and a price
    that moves for reasons a person cannot see makes the usage meter
    untrustworthy. Instead there is one model they talk to and cheap ones
    for machinery they never see, and the roles are declared here rather
    than in the app so the policy can change with a deploy instead of a
    release.

    `primary`  — every reply the person reads.
    `cheap`    — sub-agents, compaction, the memory flush, heartbeats,
                 chat titles, sidebar previews. Never read as "the agent".
    `fallback` — answers when the primary's provider is down. Never the
                 default, never shown, never in a menu.
    """

    primary = "primary"
    cheap = "cheap"
    fallback = "fallback"


class DesktopProvider(StrEnum):
    """Who serves a model, and therefore which key, which address and
    which price list the proxy uses. The value is also the wire format:
    an Anthropic provider speaks `/v1/messages`, an OpenAI one speaks
    `/v1/chat/completions`, and neither is translated into the other."""

    anthropic = "anthropic"
    openai = "openai"


class SpokenApi(StrEnum):
    """The language one request is written in.

    Not the same question as who serves the model. Anthropic has one wire
    and OpenAI has two: the older `/v1/chat/completions`, and
    `/v1/responses`, which is the only one that will take reasoning and
    function tools in the same request. Each is a different request shape,
    a different stream, and — the part that matters here — a different
    place to find the usage.

    The path the engine calls says which of these is being spoken; the
    model says who serves it. They must agree, and `polar.desktop.
    endpoints` refuses the request when they do not.
    """

    anthropic_messages = "anthropic-messages"
    openai_completions = "openai-completions"
    openai_responses = "openai-responses"

    @property
    def provider(self) -> DesktopProvider:
        return (
            DesktopProvider.anthropic
            if self is SpokenApi.anthropic_messages
            else DesktopProvider.openai
        )


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
#: a five-minute cache write 1.25×, a cache read 0.1×.
#:
#: OpenAI (https://developers.openai.com/api/docs/pricing, read
#: 11 September 2026): a cached input token is 0.1× an uncached one and
#: writing to the cache is not charged at all, so `cache_creation` is 0.
#: Output is 6× input on the two cheaper models and 5× on the two dearer
#: ones, which is why `DesktopModel.output_weight` exists.
PROVIDER_TOKEN_WEIGHTS: dict[DesktopProvider, TokenWeights] = {
    DesktopProvider.anthropic: TokenWeights(
        output=5.0, cache_creation=1.25, cache_read=0.1
    ),
    DesktopProvider.openai: TokenWeights(
        output=6.0, cache_creation=0.0, cache_read=0.1
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
        agent always carries tools. Anthropic has one wire and this is it.
        """
        return (
            SpokenApi.anthropic_messages
            if self.provider is DesktopProvider.anthropic
            else SpokenApi.openai_responses
        )

    def reachable_on(self, spoken: SpokenApi) -> bool:
        """Whether this model can be asked for in that language.

        The one rule, in one place. Nothing in the proxy translates
        between an Anthropic request and an OpenAI one, so a model is
        reachable on a wire only when its provider is the one that speaks
        it. `polar.desktop.endpoints._proxy` refuses the request when this
        is false, and the model list served on a wire shows only the
        models for which it is true — a menu offering a model the next
        request would refuse is worse than a short menu.
        """
        return self.provider is spoken.provider

    @property
    def weights(self) -> TokenWeights:
        """This model's price list: its provider's, with the one
        exception the entry declares."""
        weights = PROVIDER_TOKEN_WEIGHTS[self.provider]
        if self.output_weight is None:
            return weights
        return replace(weights, output=self.output_weight)

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
            "supportsVideo": False,
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
#: subset carrying a `role` whose provider has a key
#: (`polar.desktop.service.offered_models`). The multipliers are each
#: model's published input price over $3.00 per million, so the credit
#: figures of the two providers mean the same money.
#:
#: The policy, decided 13 September 2026: OpenAI serves everything the
#: person sees, on cost. Per million tokens, Terra is $2.00 in / $12.00
#: out against Sonnet's $3.00 / $15.00, and Luna is $0.20 / $1.20 against
#: Haiku's $0.60 / $3.00. OpenAI also charges nothing to write its cache
#: where Anthropic charges 1.25x, which for an agent replaying a system
#: prompt and its tool definitions every turn is money on every message.
#: One Claude model stays as the fallback because a sole provider means
#: one outage is a total outage; it costs nothing until the day it is the
#: only thing that answers.
MODELS: tuple[DesktopModel, ...] = (
    # The fallback, and nothing else. Never the default, never shown.
    DesktopModel(
        "claude-sonnet-5",
        "Claude Sonnet 5",
        "The everyday model: fast, capable, the default.",
        1.0,
        role=ModelRole.fallback,
    ),
    # No role: priced, so an old saved config naming it still meters
    # correctly, but off the menu.
    DesktopModel(
        "claude-opus-5",
        "Claude Opus 5",
        "The most capable model, for the hardest work.",
        5.0,
    ),
    DesktopModel(
        "claude-haiku-4-5-20251001",
        "Claude Haiku 4.5",
        "The quickest and cheapest model, for simple steps.",
        0.2,
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
    DesktopModel(
        "gpt-5.6-terra",
        "GPT-5.6 Terra",
        "OpenAI's everyday model: intelligence against cost.",
        2.00 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        role=ModelRole.primary,
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
    # $0.20 per million input tokens, output 6×.
    DesktopModel(
        "gpt-5.6-luna",
        "GPT-5.6 Luna",
        "OpenAI's quickest and cheapest model, for simple steps.",
        0.20 / CREDIT_USD_PER_MILLION_INPUT,
        provider=DesktopProvider.openai,
        context_window=1_050_000,
        role=ModelRole.cheap,
    ),
)


def model_by_id(model_id: str) -> DesktopModel | None:
    wanted = model_id.strip()
    return next((one for one in MODELS if one.model_id == wanted), None)


#: Who the models belong to, in OpenAI's `owned_by` field. Their own
#: servers put the vendor there; ours puts us, because from a client's
#: side of the proxy these are Claidor's models at Claidor's prices,
#: whoever runs the hardware.
MODELS_OWNER = "claidor"


def openai_models_list(
    models: Sequence[DesktopModel], spoken: SpokenApi
) -> dict[str, Any]:
    """`GET /v1/models`, in OpenAI's shape, for one wire.

    An OpenAI-compatible client asks this before it asks anything else,
    to find out what it may name. Rakazo is one such client: it GETs
    `<base URL>/models` and reads `data[].id`, falling back to a hand-typed
    model id when the call fails
    (the Rakazo attempt, removed 18 September; see `docs/product/going-back-brief.md`,
    `probeOpenAiCompatibleModels`).

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
    return int(round(weighted * model.cost_multiplier))


# --- images -----------------------------------------------------------------

#: The model the image route asks for, and the only one it offers.
#:
#: One model, chosen here rather than by the person, for the same reason
#: the speech route owns its voice: the founder, 16 September — *"my users
#: should never put a key. everything happens under the hood. not a
#: setting."* Choosing an image model before asking for a picture is a
#: setting. The agent decides that a picture belongs; Claidor decides what
#: draws it.
#:
#: ⚠️ **Not verified against OpenAI's live catalogue.** This container
#: holds no OpenAI key — `GET https://api.openai.com/v1/models` answers
#: 401 — so the id below was not read off a model list, and neither were
#: the prices under it. It is one constant so that checking it, and
#: correcting it, is a one-line change with tests behind it.
#:
#: Note for whoever checks: the desktop app already carries a constant
#: `GPT_IMAGE_2_MODEL_ID = 'gpt-image-2'` (`desktop/src/shared/
#: mediaModelAliases.ts`), aliased from NetEase's `canvas-20`. That is the
#: *upstream's* name for the model their server served, not a reading of
#: OpenAI's catalogue, so it is not evidence for what to put here — but it
#: is the id the app will pretty-print specially, and the two should be
#: reconciled once somebody has looked at a real model list.
IMAGE_MODEL_ID = "gpt-image-1"

#: The sizes offered, and what one image at each costs.
#:
#: ⚠️ **These three numbers have not been read off a price page**, for the
#: reason above. They are the same kind of unchecked constant as
#: `SPEECH_USD_PER_MILLION_CHARACTERS` and carry the same warning: nobody
#: should be charged against them until somebody has looked.
#:
#: Three sizes and not a free-form one because OpenAI's image API takes a
#: fixed set, and because a price table with an unbounded key is a price
#: table with a hole in it. `IMAGE_SIZE_DEFAULT` is what an agent that
#: names no shape gets.
IMAGE_USD_PER_IMAGE: dict[str, float] = {
    "1024x1024": 0.042,
    "1024x1536": 0.063,
    "1536x1024": 0.063,
}

IMAGE_SIZE_DEFAULT = "1024x1024"

#: The one quality asked for, priced by the table above. Fixed for the
#: same reason the model is.
IMAGE_QUALITY = "medium"

#: How many pictures one call may draw. A cap rather than a budget, and
#: the same idea as `SPEECH_MAX_CHARACTERS`: an agent in a loop must not
#: be able to spend a month of credits in one tool call.
IMAGE_MAX_IMAGES = 4

#: The unit an image usage row is counted in: a tenth of a US cent.
#:
#: An image is priced *per image*, not per token, so something has to
#: carry the price into `credits_for`, which multiplies a count by a
#: model's multiplier. Characters do that job for speech. Here the count
#: is money — how many tenths of a cent this call cost — because three
#: sizes at three prices cannot be expressed as one multiplier over a
#: count of pictures.
#:
#: So a usage row naming `IMAGE_MODEL` stores tenths of a cent in
#: `input_tokens`, exactly as a row naming `SPEECH_MODEL` stores
#: characters. That is unambiguous given the model on the row, and
#: `credits_for` then arrives at the right figure with no special case.
IMAGE_BILLING_UNIT_USD = 0.001


#: Images as a catalogue entry, so a drawn picture is metered by the same
#: code and lands in the same table as everything else.
#:
#: No role: it is never in the model menu, and `offered_models()` cannot
#: reach it. It is priced so its usage rows mean something, which is the
#: same reason the withheld models are in `MODELS`.
IMAGE_MODEL = DesktopModel(
    IMAGE_MODEL_ID,
    "OpenAI images",
    "Draws a picture.",
    IMAGE_BILLING_UNIT_USD / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000),
    provider=DesktopProvider.openai,
)


def image_size_offered(size: str | None) -> str | None:
    """The size this request will actually be drawn at, or None if the
    caller named a size that is not served.

    None rather than a silent fall back to the default: an agent that
    asked for a shape and got a different one produces a picture that is
    wrong in a way nobody can see from the result, and the price would be
    read off a size that was never drawn. A caller that names nothing gets
    the default, which is a different thing from naming something wrong.
    """
    if size is None or not str(size).strip():
        return IMAGE_SIZE_DEFAULT
    wanted = str(size).strip().lower()
    if wanted == "auto":
        return IMAGE_SIZE_DEFAULT
    return wanted if wanted in IMAGE_USD_PER_IMAGE else None


def image_billing_units(size: str, count: int) -> int:
    """What this call costs, in tenths of a cent.

    Never zero for a picture that was actually drawn, for the reason
    `credits_for_speech` is never zero: a meter that reads zero while
    money leaves is the one kind of wrong that matters here.
    """
    if count <= 0:
        return 0
    usd = IMAGE_USD_PER_IMAGE[size] * count
    return max(1, round(usd / IMAGE_BILLING_UNIT_USD))


def credits_for_image(size: str, count: int) -> int:
    """Credits for one image call, in the same unit as everything else.

    Defined *through* `credits_for` rather than beside it. The speech pair
    is two pieces of arithmetic held together by a test; this is one piece
    of arithmetic, so the meter and the price list cannot tell different
    stories about the same call even if somebody edits one of them.
    """
    units = image_billing_units(size, count)
    if units == 0:
        return 0
    return max(1, credits_for(IMAGE_MODEL, Usage(input_tokens=units)))


# --- the box ----------------------------------------------------------------
#
# The person's computer, on E2B. This is the **first thing this product
# sells that costs money while nobody is using it** — a model call is
# free until somebody sends a message, and a box bills for every second
# it is awake. That difference is why the box's price is here, in the
# same file and the same unit as everything else, rather than in a
# billing system of its own: a person has one allowance, and the computer
# spends it alongside the models.

#: E2B's published compute rates, per hour. Quoted in
#: `docs/product/agent-computer-plan.md` for April–June 2026.
#:
#: ⚠️ **Not read off a price page by me.** They came from that document,
#: which cites them as E2B's, and I hold no E2B account to check them
#: against. The same warning as `SPEECH_USD_PER_MILLION_CHARACTERS` and
#: `IMAGE_USD_PER_IMAGE` applies: nobody should be charged against these
#: until somebody has looked. They are two constants so that looking is
#: a two-line change with tests behind it.
#:
#: Two numbers rather than one blended hourly rate on purpose: the box's
#: shape is a setting (`E2B_SANDBOX_VCPU`, `E2B_SANDBOX_MEMORY_GIB`), so
#: a bigger box has to re-price itself without anybody remembering to.
E2B_USD_PER_VCPU_HOUR = 0.0504
E2B_USD_PER_GIB_HOUR = 0.0162

#: The unit an awake-box usage row is counted in: one second.
#:
#: Seconds and not hours because E2B bills per second and because a
#: person who wakes their computer for ten seconds must not be charged
#: for an hour. It is also what makes the row honest to read: a row
#: naming `BOX_MODEL` holds the seconds that box was awake, exactly as a
#: speech row holds characters and an image row holds tenths of a cent.
BOX_BILLING_UNIT_SECONDS = 1

#: What a box usage row is called. Never a model anybody can talk to, and
#: `model_by_id` does not find it — like speech and images, it is priced
#: so its rows mean something and offered to nobody.
BOX_MODEL_ID = "caisra-box"

BOX_PROVIDER_NOTE = (
    "A box row's provider column reads `openai` and the box is E2B's. "
    "The column picks a token weight table; a box has no tokens, so no "
    "weight is ever applied and the column is inert. See `box_model`."
)


def box_usd_per_hour(vcpu: int, memory_gib: int) -> float:
    """What a box of this shape costs for an hour of being awake."""
    return vcpu * E2B_USD_PER_VCPU_HOUR + memory_gib * E2B_USD_PER_GIB_HOUR


def box_model(vcpu: int, memory_gib: int) -> DesktopModel:
    """The catalogue entry for a box of this shape.

    Built from the shape rather than declared as a constant, because the
    shape is configuration and a price that does not follow it is a
    silent undercharge the day somebody doubles the memory.

    Its provider is neither Anthropic nor OpenAI — `DesktopProvider` has
    two members and E2B is not one of them. That is deliberate and it is
    the one thing to understand about this entry: `provider` decides
    which *token weight table* applies, and a box has no tokens. Every
    weight is multiplied by a count that is always zero here, so the
    table never runs; naming `openai` keeps the row's provider column
    meaningful for the metering code without inventing a third price
    list that would only ever hold zeroes. `BOX_PROVIDER_NOTE` says the
    same thing to whoever reads a usage row.
    """
    usd_per_second = box_usd_per_hour(vcpu, memory_gib) / 3600
    return DesktopModel(
        BOX_MODEL_ID,
        "The computer",
        "A Linux machine that keeps its files and its logins.",
        usd_per_second
        * BOX_BILLING_UNIT_SECONDS
        / (CREDIT_USD_PER_MILLION_INPUT / 1_000_000),
        provider=DesktopProvider.openai,
    )


#: A ceiling on what one settlement may bill, in seconds.
#:
#: Not a budget — a guard against a clock. Every other price in this file
#: is multiplied by something a provider reported; this one is multiplied
#: by elapsed wall-clock time, which is the only input here that can be
#: wrong by a year. A row written after a clock jump, a restored backup
#: or a `billed_through` that never got set would otherwise charge a
#: person for a decade of computer nobody ran. Twenty-five hours: longer
#: than any honest gap between two settlements of a box that is actually
#: awake, shorter than anything that could quietly empty an allowance.
BOX_MAX_SECONDS_PER_SETTLEMENT = 25 * 3600


def credits_for_box(seconds: int, *, vcpu: int, memory_gib: int) -> int:
    """Credits for one stretch of a box being awake.

    Defined through `credits_for`, for the reason `credits_for_image` is:
    one piece of arithmetic cannot disagree with itself.

    Never zero for a box that was actually awake — the speech rule, and
    it matters more here. A box is settled in slices, so a rule that
    rounded a short slice to nothing would let a box that is polled often
    enough run permanently free.
    """
    if seconds <= 0:
        return 0
    counted = min(seconds, BOX_MAX_SECONDS_PER_SETTLEMENT)
    return max(1, credits_for(box_model(vcpu, memory_gib), Usage(input_tokens=counted)))


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
    of (`polar.desktop.endpoints`). Chunks before it carry `usage: null`.
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


def tally_for(spoken: SpokenApi) -> SSEUsageTally:
    """A reader for the stream this language produces."""
    if spoken is SpokenApi.openai_responses:
        return OpenAIResponsesUsageTally()
    if spoken is SpokenApi.openai_completions:
        return OpenAIUsageTally()
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
    return Usage.from_payload(answer.get("usage"))


# --- the agent's other three calls: search, pictures, dictation ------------
#
# The agent advertises four tools that are not a model turn: web search,
# web fetch, image generation and audio transcription. Fetch runs on the
# person's machine and costs nothing here. The other three are served by
# the routes in `polar.desktop.capabilities`, each on OpenAI with
# Claidor's key, and each priced below in the same unit as everything
# else so the usage table keeps meaning one thing.
#
# ⚠️ **None of the four dollar figures below has been checked against a
# price page.** Like `SPEECH_USD_PER_MILLION_CHARACTERS` they are single
# constants so that looking, and correcting, is a one-line change with a
# test behind it. Nobody should be charged against them until somebody
# has looked.

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


__all__ = [
    "BOX_BILLING_UNIT_SECONDS",
    "BOX_MAX_SECONDS_PER_SETTLEMENT",
    "BOX_MODEL_ID",
    "BOX_PROVIDER_NOTE",
    "CREDIT_USD_PER_MILLION_INPUT",
    "E2B_USD_PER_GIB_HOUR",
    "E2B_USD_PER_VCPU_HOUR",
    "IMAGE_BILLING_UNIT_USD",
    "IMAGE_MAX_IMAGES",
    "IMAGE_MODEL",
    "IMAGE_MODEL_ID",
    "IMAGE_QUALITY",
    "IMAGE_SIZE_DEFAULT",
    "IMAGE_USD_PER_IMAGE",
    "MODELS",
    "PROVIDER_TOKEN_WEIGHTS",
    "DesktopModel",
    "DesktopProvider",
    "ModelRole",
    "OpenAIResponsesUsageTally",
    "OpenAIUsageTally",
    "SSEUsageTally",
    "SpokenApi",
    "TokenWeights",
    "Usage",
    "UsageTally",
    "box_model",
    "box_usd_per_hour",
    "credits_for",
    "credits_for_box",
    "credits_for_image",
    "image_billing_units",
    "image_size_offered",
    "model_by_id",
    "tally_for",
    "usage_from_answer",
]
