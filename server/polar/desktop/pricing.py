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
from dataclasses import dataclass, field, replace
from enum import StrEnum
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
    #: tools in the same request. Read only on the OpenAI wire, so the
    #: Anthropic entries leave it None because the question never comes
    #: up for them, not because they are thought to refuse.
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
        """The wire format the engine must speak to reach this model. It
        happens to be spelled like the provider, and is asked for
        separately because it is a different question."""
        return self.provider.value

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
    # Withheld, deliberately: no role, so it is not offered. Every OpenAI
    # model runs with `reasoning_effort: "none"` whenever tools are
    # present — see `tool_reasoning` above — and for an agent tools are
    # always present. Astra costs five times Terra for a capability we
    # are switching off. It comes back when the proxy speaks
    # `/v1/responses`, and not before.
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


def _number(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    return int(value) if isinstance(value, int | float) else 0


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


def tally_for(provider: DesktopProvider) -> SSEUsageTally:
    if provider is DesktopProvider.openai:
        return OpenAIUsageTally()
    return UsageTally()


def usage_from_answer(provider: DesktopProvider, answer: Any) -> Usage:
    """The usage of one non-streaming answer, read in the provider's own
    shape."""
    if not isinstance(answer, dict):
        return Usage()
    if provider is DesktopProvider.openai:
        return Usage.from_openai_payload(answer.get("usage"))
    return Usage.from_payload(answer.get("usage"))


__all__ = [
    "CREDIT_USD_PER_MILLION_INPUT",
    "MODELS",
    "PROVIDER_TOKEN_WEIGHTS",
    "DesktopModel",
    "DesktopProvider",
    "OpenAIUsageTally",
    "SSEUsageTally",
    "TokenWeights",
    "Usage",
    "UsageTally",
    "credits_for",
    "model_by_id",
    "tally_for",
    "usage_from_answer",
]
