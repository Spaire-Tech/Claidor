"""The agents' model calls on the person's own AI account (8 November 2026).

The founder: "allow people to bring their own subscriptions and charge only
for the computer" (docs/your-own-models.md). A person who connected their
ChatGPT account (`model_accounts.py`) and chose one of its models has their
agents' calls sent to ChatGPT on that account, where Codex sends its own
(`settings.CHATGPT_CODEX_BASE_URL`, `/responses`), instead of to OpenAI on
Simeon's key. Those calls cost no credits.

**The model's name.** The person's models are offered as
`own:chatgpt:<model>` (`own:chatgpt:gpt-6.1-sol`). The prefix keeps them
apart from Simeon's own models of the same name (ChatGPT offers GPT-6 Sol
and Luna too). It starts with an "o" on purpose. The engine's AI SDK
(@ai-sdk/openai 1.3, `getResponsesModelConfig`) treats a model whose name
starts with "o" or "gpt-5" as a reasoning model, and only then sends the
agent's reasoning effort and its brief as a `developer` message. So no
engine release is needed.

**Which calls.** The agents' model calls, their web search and their
pictures (below, "web search and pictures on the account"). Voice calls,
dictation and video stay on Simeon's. `/desktop/api/models/available` names
the chosen model for
the agents' `primary` and `computer` roles, and the account's cheap model
(GPT-6 Luna) for `cheap` (`rows`). The engine follows the roles within five
minutes. Nothing changes until the person chooses
(`PUT /desktop/api/models/own`), and a person with no usable account is
answered by Simeon's models as before.

**The body.** The engine writes OpenAI's Responses request. ChatGPT takes
it with the changes Codex makes and OpenAI's Sign in with ChatGPT documents
(`codex_body`):

- `store: false` and `stream: true`;
- no `max_output_tokens`, `temperature`, `top_p`, `metadata`, `user`,
  `truncation` or `service_tier`;
- the brief as a `developer` message in `input`, where Codex puts its own.

A request the engine sent without a stream is answered with the stream's
last response, as one JSON answer.

**Who may.** A person with no plan is refused, as on Simeon's models: the
computer the agents run on is Simeon's, whoever pays for the model
(`box_broker.require_a_plan`). A person back on Simeon's models (no choice)
has an `own:` call answered by Simeon's model, never on their account, while
the engine catches up. Only the models the account's plan includes are
offered and used (`OwnModel.not_on_plans`).

**When the account can't answer.** The person's other accounts for the same
provider are tried in the order they were connected. ChatGPT's plan limit
(429 `usage_limit_reached`) marks the account limited until the time ChatGPT
names (`limited_until`), and its calls skip it until then. When no account
can answer for the moment (a limit, a 5xx, ChatGPT unreachable, the sign-in
gone), the call goes to Simeon's own OpenAI model under the person's
allowance and costs credits, as Reason does. When ChatGPT refuses the
request itself (another 4xx), its refusal goes back to the engine as it
came: Simeon's model doesn't take it on in silence. Each refusal is logged
with ChatGPT's own words (`desktop.models.relay_refused`).

**Claude** (9 November 2026; docs/your-own-models.md, section 6). A person
who signed in to Claude Code on their computer may choose Claude Opus 5.5,
Sonnet 5.5, Haiku 5.5, Fable 5.1 or Fable 5 (`own:claude:claude-opus-5-5`…,
Claude Code's own names; the first `own:claude:opus` and `…:sonnet` are
still read as Opus and Sonnet 5.5). Anthropic doesn't let Simeon make calls on a person's Claude plan,
so this server never does: `rows` names the choice as the agents' primary
model on a wire of its own, `claude-code`, which an engine that knows it
runs the agent's turn in Claude Code with, and one that doesn't skips (the
next primary row, Simeon's, answers, as before). A call that still names a
Claude model is answered by Simeon's; web search and pictures stay on
Simeon's for a person on Claude.

**Grok** (10 November 2026, the founder: "lets do grok"). A person who
connected their SuperGrok or X Premium plan (`grok.py`) may choose Grok 4.6
or Grok 4.5 (`own:grok:grok-4.6`), Grok Build's own two. The agents' calls
go where Grok Build sends its own (`settings.GROK_PROXY_BASE_URL`,
`/responses`), with its headers (`grok.headers`), and the body Grok Build
writes (`grok_body`): the brief as a `system` message, `store: false`, no
`metadata`, `user`, `truncation` or `service_tier`, and no `status` on the
reasoning sent back. Out of credits (402, or 403 or 429 saying so) marks
the account limited until its period ends, as xAI's billing says. Its web
search is the proxy's own `web_search` tool on Grok 4.6, its pictures Grok
Imagine on xAI's API (`grok-imagine-image-quality`), as Grok Build's; the
plans xAI keeps pictures from (Free, X Basic) get Simeon's. How much of the
plan is used is asked of xAI's billing after an answer, at most every few
minutes (`GROK_USAGE_EVERY`).

**API keys** (10 November 2026, the founder: "Below subscription something
called api keys"). A person's own key for one of `key_providers.PROVIDERS`
offers the models it reaches (`own:deepseek:deepseek-v4-pro`), as its
provider listed them when the key was connected. Its calls go to the
provider on the wire it speaks (below, "the person's own API keys"), cost
no credits, and follow the plans' rules. Web search and pictures stay on
Simeon's.

**Not verified against chatgpt.com or grok.com.** For models it marks
`use_responses_lite`, Codex sends the tools inside `input`
(`additional_tools`), not in `tools`. This relay sends the standard
`tools`, as OpenAI's public Responses API takes them. If ChatGPT refuses
that, the log line says so and the agent gets ChatGPT's refusal: a request
refused is not taken on by Simeon's model. Grok's wire is read from Grok
Build's code alone; the same log line says what xAI refused.
"""

from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from simeon.config import settings
from simeon.kit.db.postgres import AsyncSessionMaker
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, DesktopSession, User
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from . import chat_wire, grok, key_providers, messages_wire, model_accounts
from .auth import ProxyCaller, get_desktop_session
from .model_account_repository import ModelAccountRepository
from .model_sign_in import RefreshUnavailable
from .pricing import (
    DesktopModel,
    DesktopProvider,
    ModelRole,
    OpenAIResponsesUsageTally,
    SpokenApi,
    Usage,
)
from .proxy_common import error_response as _error
from .proxy_common import quota_exhausted_response
from .proxy_common import upstream_timeout as _timeout
from .service import desktop, offered_models

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

_Answer = JSONResponse | StreamingResponse

OWN_PREFIX = "own:"
#: The person's choice, kept with their other settings (`users.meta`).
CHOICE_KEY = "own_model"
#: How hard the chosen model thinks, chosen beside it on the composer (9
#: November 2026, the founder: "we should have a thinking effort"; Light,
#: Medium, High, Extra High, Max as Reason's).
EFFORT_KEY = "own_model_effort"
#: The efforts each provider's models take: Claude Code's `--effort` (2.1.311);
#: ChatGPT's reasoning effort, only the three every Codex model takes.
EFFORTS: dict[str, tuple[str, ...]] = {
    "claude": ("low", "medium", "high", "xhigh", "max"),
    "chatgpt": ("low", "medium", "high"),
    # Grok 4.6's, as Grok Build lists them (Grok 4.5 stops at high: its own
    # `OwnModel.efforts`).
    "grok": ("low", "medium", "high", "xhigh"),
}
# The providers of the person's own API keys, each with its own
# (`key_providers.PROVIDERS`).
EFFORTS.update(
    {one.slug: one.efforts for one in key_providers.PROVIDERS if one.efforts}
)
#: Each provider's effort until the person chooses one (Claude Code's own,
#: Codex's and Grok Build's; the key providers' own).
DEFAULT_EFFORT = {
    "claude": "high",
    "chatgpt": "medium",
    "grok": "high",
    **{
        one.slug: one.default_effort
        for one in key_providers.PROVIDERS
        if one.default_effort is not None
    },
}
#: How often a Grok plan's usage is asked of xAI's billing, at most.
GROK_USAGE_EVERY = timedelta(minutes=5)
#: A limit ChatGPT reports without saying until when.
LIMIT_WITHOUT_END = timedelta(hours=1)
#: ChatGPT's words for a plan's limit reached (Codex's
#: `UsageLimitReached`; OpenAI's Sign in with ChatGPT names the second).
LIMIT_CODES = frozenset(
    {"usage_limit_reached", "subscription_sharing_usage_limit_exceeded"}
)


@dataclass(frozen=True, eq=False)
class OwnModel:
    """One model of a provider the person connects. Two are the same model
    when their ids are: a key's model is named from its provider's list,
    which may say it otherwise than here."""

    provider: str
    slug: str
    name: str
    context_window: int
    #: The provider's plans that don't include it (from Codex's list).
    not_on_plans: frozenset[str] = frozenset()
    #: The efforts it takes, where fewer than its provider's.
    efforts: tuple[str, ...] = ()

    def __eq__(self, other: object) -> bool:
        return isinstance(other, OwnModel) and other.model_id == self.model_id

    def __hash__(self) -> int:
        return hash(self.model_id)

    @property
    def efforts_taken(self) -> tuple[str, ...]:
        return self.efforts or EFFORTS.get(self.provider, ())

    @property
    def on_key(self) -> bool:
        """A model of the person's own API key (`key_providers.py`)."""
        return self.provider in key_providers.SLUGS

    def on_plan(self, plan: str | None) -> bool:
        """Whether an account on `plan` may use it; an account whose plan
        the provider didn't name may try."""
        return plan is None or plan not in self.not_on_plans

    @property
    def model_id(self) -> str:
        return f"{OWN_PREFIX}{self.provider}:{self.slug}"

    def desktop_model(self, role: ModelRole | None = None) -> DesktopModel:
        """The model as the catalogue's rows are: priced at nothing (the
        person's plan pays), on the Responses wire."""
        return DesktopModel(
            model_id=self.model_id,
            model_name=self.name,
            description=f"{self.name} on your "
            f"{model_accounts.provider_name(self.provider)} "
            f"{'key' if self.on_key else 'plan'}",
            cost_multiplier=0.0,
            provider=DesktopProvider.openai,
            context_window=self.context_window,
            max_tokens=128_000,
            role=role,
        )

    def json(self) -> dict[str, Any]:
        return {
            "modelId": self.model_id,
            "modelName": self.name,
            "provider": self.provider,
            "contextWindow": self.context_window,
        }


#: ChatGPT's models for Codex, as Codex's own list names them (openai/codex,
#: `codex-rs/models-manager/models.json`, the ones it shows, 8 November
#: 2026), best first. To be read from the account itself later.
_CHATGPT = model_accounts.PROVIDER_CHATGPT
CHATGPT_MODELS: tuple[OwnModel, ...] = (
    OwnModel(
        _CHATGPT, "gpt-6.1-sol", "GPT-6.1 Sol", 272_000, frozenset({"hc_consumption"})
    ),
    OwnModel(
        _CHATGPT,
        "gpt-6-astra",
        "GPT-6 Astra",
        272_000,
        frozenset({"hc_consumption", "law"}),
    ),
    OwnModel(_CHATGPT, "gpt-6.1-terra", "GPT-6.1 Terra", 500_000),
    OwnModel(
        _CHATGPT,
        "gpt-6-sol",
        "GPT-6 Sol",
        272_000,
        frozenset({"hc_consumption", "law", "promax"}),
    ),
    OwnModel(
        _CHATGPT,
        "gpt-6-luna",
        "GPT-6 Luna",
        272_000,
        frozenset({"hc_consumption", "law", "promax"}),
    ),
)
#: Claude through Claude Code on the person's computer, each model by its
#: version (9 November 2026, the founder, from Reason's menu: "Claude Opus
#: 5.5"…), its slug the name Claude Code takes (`--model claude-opus-5-5`;
#: all five are in Claude Code 2.1.311, the version the computers install).
#: Opus first: the one chosen when the person connects. The plan decides
#: which it may use, and Claude Code says so itself (the turn then falls
#: back to Simeon's, with the chat's line).
_CLAUDE = model_accounts.PROVIDER_CLAUDE
CLAUDE_MODELS: tuple[OwnModel, ...] = (
    OwnModel(_CLAUDE, "claude-opus-5-5", "Claude Opus 5.5", 200_000),
    OwnModel(_CLAUDE, "claude-sonnet-5-5", "Claude Sonnet 5.5", 200_000),
    OwnModel(_CLAUDE, "claude-haiku-5-5", "Claude Haiku 5.5", 200_000),
    OwnModel(_CLAUDE, "claude-fable-5-1", "Claude Fable 5.1", 200_000),
    OwnModel(_CLAUDE, "claude-fable-5", "Claude Fable 5", 200_000),
)
#: Grok's models on the person's plan, as Grok Build ships them
#: (`xai-grok-models/default_models.json`), best first: Grok 4.6, the one
#: chosen when the person connects, and Grok 4.5. Grok Build asks the proxy
#: for the plan's own list (`GET /models`); to be read from the account
#: later, as ChatGPT's.
_GROK = model_accounts.PROVIDER_GROK
GROK_MODELS: tuple[OwnModel, ...] = (
    OwnModel(_GROK, "grok-4.6", "Grok 4.6", 500_000),
    OwnModel(_GROK, "grok-4.5", "Grok 4.5", 500_000, efforts=("low", "medium", "high")),
)
#: The Grok model with the proxy's own web search (`supports_backend_search`).
GROK_SEARCH = "grok-4.6"

#: The first Claude choices (9 November 2026), Claude Code's aliases, still
#: read as the versions they meant: a person who chose one keeps it, and an
#: app that still sends one is understood.
_FORMER_IDS = {
    f"{OWN_PREFIX}claude:opus": f"{OWN_PREFIX}claude:claude-opus-5-5",
    f"{OWN_PREFIX}claude:sonnet": f"{OWN_PREFIX}claude:claude-sonnet-5-5",
}
#: The wire the engine runs a Claude Code turn on (`transportApi`).
CLAUDE_CODE_TRANSPORT = "claude-code"

#: Every model a person may choose, in the order the apps list them.
ALL_MODELS: tuple[OwnModel, ...] = (*CHATGPT_MODELS, *CLAUDE_MODELS, *GROK_MODELS)
_MODELS: dict[str, OwnModel] = {one.model_id: one for one in ALL_MODELS}


def is_own(model_id: str) -> bool:
    return model_id.strip().startswith(OWN_PREFIX)


def own_model(model_id: str) -> OwnModel | None:
    wanted = model_id.strip()
    found = _MODELS.get(_FORMER_IDS.get(wanted, wanted))
    return found if found is not None else _key_model(wanted)


def _key_model(model_id: str) -> OwnModel | None:
    """A model of a key provider (`own:deepseek:deepseek-v4-pro`), named as
    here or from its id; which models a key reaches is its account's."""
    _, _, rest = model_id.partition(OWN_PREFIX)
    slug, _, model = rest.partition(":")
    one = key_providers.provider(slug)
    if not model_id.startswith(OWN_PREFIX) or one is None or not one.available:
        return None
    if not model or len(model) > 200:
        return None
    known = next((m for m in one.known if m.slug == model), None)
    if known is not None:
        return OwnModel(slug, model, known.name, known.context_window)
    return OwnModel(
        slug, model, key_providers.pretty_name(model), key_providers.DEFAULT_CONTEXT
    )


def _stored_models(account: DesktopModelAccount) -> list[OwnModel]:
    """The models an API key reaches, as its provider listed them."""
    out = []
    for entry in account.models or []:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            continue
        context = entry.get("contextWindow")
        out.append(
            OwnModel(
                account.provider,
                entry["id"],
                str(entry.get("name") or key_providers.pretty_name(entry["id"])),
                context
                if isinstance(context, int) and context > 0
                else key_providers.DEFAULT_CONTEXT,
            )
        )
    return out


def chosen_model(user: User) -> OwnModel | None:
    """The model the person chose for their agents, or None for Simeon's."""
    value = (user.meta or {}).get(CHOICE_KEY)
    return own_model(value) if isinstance(value, str) else None


def chosen_effort(user: User) -> str | None:
    """How hard the chosen model thinks: the person's choice when that
    model's provider takes it, else the provider's own; None for Simeon's."""
    chosen = chosen_model(user)
    if chosen is None:
        return None
    value = (user.meta or {}).get(EFFORT_KEY)
    if isinstance(value, str) and value in chosen.efforts_taken:
        return value
    default = DEFAULT_EFFORT.get(chosen.provider)
    if default is not None and default not in chosen.efforts_taken:
        return chosen.efforts_taken[-1] if chosen.efforts_taken else None
    return default


async def _usable(
    session: AsyncSession, user_id: Any, provider: str
) -> list[DesktopModelAccount]:
    """The person's accounts for one provider that are still signed in,
    in the order they were connected."""
    accounts = await ModelAccountRepository.from_session(session).for_user(user_id)
    return [
        one
        for one in accounts
        if one.provider == provider and one.status != model_accounts.STATUS_SIGNED_OUT
    ]


async def rows(session: AsyncSession, user: User) -> list[dict[str, Any]]:
    """The rows of `/api/models/available` for the person's own model, put
    before Simeon's: the engine takes the first row of each role. None
    while nothing is chosen or no account of that provider is signed in."""
    chosen = chosen_model(user)
    if chosen is None:
        return []
    if chosen.provider == model_accounts.PROVIDER_CLAUDE:
        if not await _usable(session, user.id, chosen.provider):
            return []
        return [claude_code_row(chosen, chosen_effort(user))]
    usable = await _usable(session, user.id, chosen.provider)
    plans = [one.plan for one in usable]
    if not any(chosen.on_plan(plan) for plan in plans):
        return []
    if chosen.on_key:
        # Named and sized as the key's provider listed it.
        chosen = next(
            (m for one in usable for m in _stored_models(one) if m == chosen), chosen
        )
    # Every role on the chosen model (11 November 2026, the founder: "small
    # jobs is their own plan and chosen model. and make sure everything else
    # is like that, the api keys included"): the agent, its machinery
    # (titles, summaries, memory, the safety review) and its helper on the
    # screen. Until then the machinery ran on a cheaper model of the plan
    # or the key (GPT-6 Luna, a key provider's `cheap`).
    return [
        chosen.desktop_model(role).available()
        for role in (ModelRole.primary, ModelRole.cheap, ModelRole.computer)
    ]


def claude_code_row(model: OwnModel, effort: str | None = None) -> dict[str, Any]:
    """The agents' primary model when the person chose Claude: a row on the
    `claude-code` wire, which only an engine that runs turns in Claude Code
    follows, with the effort Claude Code is given (`--effort`). No cheap or
    computer row: since 11 November 2026 the engine runs those in Claude Code
    too, on this model and effort (its helpers, the safety review, memory,
    summaries; `claude-code-text.ts`), and keeps Simeon's own cheap and
    computer models only for when Claude Code can't answer."""
    return {
        "modelId": model.model_id,
        "modelName": model.name,
        "provider": "anthropic",
        "apiFormat": CLAUDE_CODE_TRANSPORT,
        "description": f"{model.name} in Claude Code, on your Claude plan",
        "costMultiplier": 0.0,
        "accessible": True,
        "supportsImage": True,
        "supportsVideo": False,
        "supportsThinking": True,
        "supportsToolCalling": True,
        "agenticReady": True,
        "role": ModelRole.primary.value,
        "transportApi": CLAUDE_CODE_TRANSPORT,
        "claudeCodeModel": model.slug,
        **({} if effort is None else {"claudeCodeEffort": effort}),
    }


# --- the request ChatGPT is sent ------------------------------------------------

#: What the Responses request keeps on the way to ChatGPT (Codex's own
#: `ResponsesApiRequest`). Everything else is left out.
_CODEX_FIELDS = (
    "input",
    "tools",
    "tool_choice",
    "parallel_tool_calls",
    "reasoning",
    "text",
    "include",
    "prompt_cache_key",
)


_NO_EFFORT = frozenset({"none", "minimal"})


def codex_body(
    payload: dict[str, Any], slug: str, effort: str | None = None
) -> dict[str, Any]:
    """The engine's Responses request as ChatGPT takes it; `effort`, the one
    the person chose, in place of the engine's own on every call, the
    machinery's too (11 November 2026, the founder: "their own plan and
    chosen model", "and the effort set")."""
    body: dict[str, Any] = {"model": slug, "stream": True}
    for key in _CODEX_FIELDS:
        if payload.get(key) is not None:
            body[key] = payload[key]
    raw_input = payload.get("input")
    if isinstance(raw_input, str):
        items: list[Any] = [{"role": "user", "content": raw_input}]
    elif isinstance(raw_input, list):
        items = [
            {**item, "role": "developer"}
            if isinstance(item, dict) and item.get("role") == "system"
            else item
            for item in raw_input
        ]
    else:
        items = []
    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        items.insert(
            0,
            {
                "role": "developer",
                "content": [{"type": "input_text", "text": instructions}],
            },
        )
    body["input"] = items
    reasoning = body.get("reasoning")
    if isinstance(reasoning, dict) and reasoning.get("effort") in _NO_EFFORT:
        # ChatGPT's models start at low (Codex's list); the engine can ask
        # for none.
        body["reasoning"] = {**reasoning, "effort": "low"}
    reasoning = body.get("reasoning")
    if effort is not None and isinstance(reasoning, dict):
        body["reasoning"] = {**reasoning, "effort": effort}
    body["store"] = False
    return body


#: What the Responses request keeps on the way to Grok (Grok Build's own
#: request, `conversation/responses.rs`). Everything else is left out.
_GROK_FIELDS = (
    "input",
    "tools",
    "tool_choice",
    "parallel_tool_calls",
    "reasoning",
    "text",
    "include",
    "prompt_cache_key",
    "max_output_tokens",
    "temperature",
    "top_p",
)


def _grok_item(item: Any) -> Any:
    """An input item as Grok Build sends it: the brief as `system`, and no
    `status` on reasoning sent back (`responses.rs`)."""
    if not isinstance(item, dict):
        return item
    if item.get("role") == "developer":
        return {**item, "role": "system"}
    if item.get("type") == "reasoning" and "status" in item:
        return {key: value for key, value in item.items() if key != "status"}
    return item


def grok_body(
    payload: dict[str, Any], own: OwnModel, effort: str | None = None
) -> dict[str, Any]:
    """The engine's Responses request as Grok takes it; `effort`, the one
    the person chose, in place of the engine's own on every call."""
    body: dict[str, Any] = {"model": own.slug, "stream": True}
    for key in _GROK_FIELDS:
        if payload.get(key) is not None:
            body[key] = payload[key]
    raw_input = payload.get("input")
    if isinstance(raw_input, str):
        items: list[Any] = [{"role": "user", "content": raw_input}]
    elif isinstance(raw_input, list):
        items = [_grok_item(item) for item in raw_input]
    else:
        items = []
    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        items.insert(0, {"role": "system", "content": instructions})
    body["input"] = items
    taken = own.efforts_taken
    reasoning = body.get("reasoning")
    if isinstance(reasoning, dict):
        asked = reasoning.get("effort")
        if asked in _NO_EFFORT:
            # The machinery's "none": Grok's lowest.
            asked = "low"
        elif asked is not None and taken and asked not in taken:
            # An effort the model lacks ("max"): the highest it has.
            asked = taken[-1]
        if effort is not None and effort in taken:
            asked = effort
        body["reasoning"] = {**reasoning, "effort": asked} if asked else reasoning
    body["store"] = False
    return body


def _codex_headers(
    grant: model_accounts.AccessGrant, accept: str = "text/event-stream"
) -> dict[str, str]:
    return {
        "authorization": f"Bearer {grant.access_token}",
        "chatgpt-account-id": grant.account_key,
        "originator": settings.CHATGPT_ORIGINATOR,
        "content-type": "application/json",
        "accept": accept,
    }


def _codex_base() -> str:
    return settings.CHATGPT_CODEX_BASE_URL.rstrip("/")


def _codex_url() -> str:
    return f"{settings.CHATGPT_CODEX_BASE_URL.rstrip('/')}/responses"


def _responses_url(provider: str) -> str:
    if provider == model_accounts.PROVIDER_GROK:
        return f"{grok.proxy_base()}/responses"
    return _codex_url()


def _headers(
    provider: str,
    grant: model_accounts.AccessGrant,
    *,
    model: str | None = None,
    accept: str = "text/event-stream",
    conversation: str | None = None,
) -> dict[str, str]:
    """The headers of a call on the account, as its provider's own client
    sends them."""
    if provider == model_accounts.PROVIDER_GROK:
        return grok.headers(
            grant.access_token, model=model, accept=accept, conversation=conversation
        )
    return _codex_headers(grant, accept)


def limit_end(body: Any, now: datetime) -> datetime | None:
    """Until when the account's plan limit holds, when `body` (ChatGPT's
    error, or a failed response's) says it was reached; None otherwise."""
    if not isinstance(body, dict):
        return None
    error = body.get("error")
    if not isinstance(error, dict):
        return None
    if error.get("type") not in LIMIT_CODES and error.get("code") not in LIMIT_CODES:
        return None
    resets_at = error.get("resets_at")
    if isinstance(resets_at, int | float) and resets_at > now.timestamp():
        return datetime.fromtimestamp(resets_at, tz=UTC)
    seconds = error.get("resets_in_seconds")
    if isinstance(seconds, int | float) and seconds > 0:
        return now + timedelta(seconds=seconds)
    return now + LIMIT_WITHOUT_END


@dataclass
class _ResponseTally(OpenAIResponsesUsageTally):
    """The Responses stream's usage, and its last response: the answer to a
    request sent without a stream, and a limit reached mid-stream."""

    response: dict[str, Any] | None = field(default=None)
    items: list[Any] = field(default_factory=list)

    def _event(self, event: dict[str, Any]) -> None:
        super()._event(event)
        if event.get("type") == "response.output_item.done":
            self.items.append(event.get("item"))
        elif event.get("type") in self.TERMINAL and isinstance(
            event.get("response"), dict
        ):
            self.response = event["response"]

    def answer(self) -> dict[str, Any] | None:
        """The last response, its output filled from the items streamed
        before it when it carries none: Codex reads the items as they come
        and never the output of the last event."""
        if self.response is None:
            return None
        if self.response.get("output") or not self.items:
            return self.response
        return {**self.response, "output": [one for one in self.items if one]}


# --- the relay ------------------------------------------------------------------


class _Refused(Exception):
    """One account did not answer: its status and ChatGPT's own words."""

    def __init__(
        self, status: int | None, body: bytes, *, limited: bool = False
    ) -> None:
        super().__init__(f"{status}")
        self.status = status
        self.body = body
        #: The plan's limit reached (Grok's 402 or 403 out of credits): a
        #: refusal of the moment, whatever its status.
        self.limited = limited

    @property
    def refuses_the_request(self) -> bool:
        """A refusal of the request itself (its shape, a model the plan
        lacks, an account not allowed to), not of the moment: a 4xx but
        the sign-in (401), a timeout (408), a conflict (409) and a limit
        (429, or the credits used up)."""
        return (
            not self.limited
            and self.status is not None
            and 400 <= self.status < 500
            and self.status not in (401, 408, 409, 429)
        )

    def answer(self) -> JSONResponse:
        try:
            return JSONResponse(json.loads(self.body), status_code=self.status or 502)
        except ValueError:
            return _error("api_error", _preview(self.body), self.status or 502)


async def _in_own_session[T](
    request: Request,
    session: AsyncSession,
    work: Callable[[AsyncSession], Awaitable[T]],
) -> T:
    """`work` in a short session of its own, committed at once, where the
    app provides one: an account's row lock must not be held while
    ChatGPT thinks, or every call of the person's agents would wait on the
    one before. The test client provides none."""
    maker: AsyncSessionMaker | None = getattr(request.state, "async_sessionmaker", None)
    if maker is None:
        return await work(session)
    async with maker() as fresh:
        result = await work(fresh)
        await fresh.commit()
        return result


def _preview(body: bytes) -> str:
    return body[:500].decode(errors="replace")


async def relay(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    payload: dict[str, Any],
    *,
    reason: str | None,
    simeon: Callable[[dict[str, Any]], Awaitable[_Answer]],
) -> _Answer:
    """One of the agents' calls on an `own:` model: on the person's
    accounts in turn, then on Simeon's own model (`simeon`, the ordinary
    metered relay, given the request with Simeon's model named)."""
    user = caller.user
    own = own_model(str(payload.get("model", "")))
    if own is None:
        return _error(
            "invalid_request_error",
            "This model is not offered by the desktop app.",
            400,
        )
    allowance = await desktop.allowance(session, user)
    if allowance.none:
        # No plan, no agents: the computer they run on is Simeon's, whoever
        # pays for the model (`box_broker.require_a_plan`).
        return quota_exhausted_response(allowance)
    if chosen_model(user) is None or own.provider == model_accounts.PROVIDER_CLAUDE:
        # Back on Simeon's models: an engine that hasn't caught up yet is
        # answered by Simeon's, never on the person's account. Claude is
        # never called from here: Claude Code on the computer calls it.
        return await _on_simeon(own, payload, user, simeon)
    wants_stream = payload.get("stream") is True
    chosen = chosen_model(user)
    effort = chosen_effort(user) if chosen is not None and chosen == own else None
    if own.on_key:
        return await _on_keys(
            request, caller, session, own, payload, wants_stream, reason, effort, simeon
        )
    shaped = (
        grok_body(payload, own, effort)
        if own.provider == model_accounts.PROVIDER_GROK
        else codex_body(payload, own.slug, effort)
    )
    body = json.dumps(shaped).encode()
    conversation = payload.get("prompt_cache_key")
    now = utc_now()
    accounts = [
        one
        for one in await _usable(session, user.id, own.provider)
        if (one.limited_until is None or one.limited_until <= now)
        and own.on_plan(one.plan)
    ]
    refused_request: _Refused | None = None
    for account in accounts:
        account_id = account.id
        try:
            return await _on_account(
                request,
                caller,
                session,
                own,
                account_id,
                body,
                wants_stream,
                reason,
                conversation=conversation if isinstance(conversation, str) else None,
            )
        except _Refused as refused:
            log.warning(
                "desktop.models.relay_refused",
                user_id=str(user.id),
                provider=own.provider,
                model=own.slug,
                status=refused.status,
                preview=_preview(refused.body),
            )
            if refused.refuses_the_request:
                refused_request = refused
    if refused_request is not None:
        # The provider refused the request itself, not for the moment: said
        # as it said it. Simeon's model doesn't take it on in silence, on the
        # person's credits.
        return refused_request.answer()
    return await _on_simeon(own, payload, user, simeon)


async def _on_simeon(
    own: OwnModel,
    payload: dict[str, Any],
    user: User,
    simeon: Callable[[dict[str, Any]], Awaitable[_Answer]],
) -> _Answer:
    """No account of the person's answered: Simeon's own OpenAI model takes
    the call, under the person's allowance."""
    stand_in = _simeon_stand_in(own, offered_models(user))
    why = "not_chosen" if chosen_model(user) is None else "no_account_answered"
    if stand_in is None:
        return _error(
            "api_error",
            f"Your {model_accounts.provider_name(own.provider)} account can't "
            "answer right now.",
            503,
        )
    log.info(
        "desktop.models.on_simeon",
        user_id=str(user.id),
        why=why,
        provider=own.provider,
        model=own.slug,
        to=stand_in.model_id,
    )
    return await simeon({**payload, "model": stand_in.model_id})


def _simeon_stand_in(
    own: OwnModel, offered: Sequence[DesktopModel]
) -> DesktopModel | None:
    """Simeon's model that answers for `own`: one of its offered models on
    the same wire, in the role the person's model was playing."""
    on_wire = [one for one in offered if one.spoken is SpokenApi.openai_responses]
    order = (ModelRole.primary, ModelRole.fallback, ModelRole.cheap)
    for role in order:
        for one in on_wire:
            if one.role is role:
                return one
    return None


async def _grant(
    request: Request,
    session: AsyncSession,
    user_id: Any,
    account_id: Any,
    *,
    force_refresh: bool = False,
) -> model_accounts.AccessGrant:
    try:
        grant = await _in_own_session(
            request,
            session,
            lambda one: model_accounts.access_for(
                one, user_id, account_id, force_refresh=force_refresh
            ),
        )
    except RefreshUnavailable as error:
        raise _Refused(None, b"the sign-in could not be refreshed") from error
    if grant is None:
        raise _Refused(None, b"signed out")
    return grant


async def _on_account(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    own: OwnModel,
    account_id: Any,
    body: bytes,
    wants_stream: bool,
    reason: str | None,
    *,
    conversation: str | None = None,
) -> _Answer:
    """The call on one account. Raises `_Refused` when it did not answer,
    so the next one can."""
    user_id = caller.user.id
    is_grok = own.provider == model_accounts.PROVIDER_GROK
    grant = await _grant(request, session, user_id, account_id)
    client = httpx.AsyncClient(timeout=_timeout())
    refreshed = False
    while True:
        try:
            upstream = await client.send(
                client.build_request(
                    "POST",
                    _responses_url(own.provider),
                    headers=_headers(
                        own.provider,
                        grant,
                        model=own.slug,
                        conversation=conversation,
                    ),
                    content=body,
                ),
                stream=True,
            )
        except httpx.HTTPError as error:
            await client.aclose()
            raise _Refused(None, type(error).__name__.encode()) from error
        if upstream.status_code == 200:
            break
        refusal = await upstream.aread()
        await upstream.aclose()
        if upstream.status_code == 401 and not refreshed:
            # An access token ChatGPT no longer takes, before its time: once
            # more with a new one.
            refreshed = True
            try:
                grant = await _grant(
                    request, session, user_id, account_id, force_refresh=True
                )
            except _Refused:
                await client.aclose()
                raise
            continue
        await client.aclose()
        until = await _limit_until(
            request,
            session,
            own,
            user_id,
            account_id,
            grant,
            upstream.status_code,
            refusal,
        )
        if until is not None:
            await _mark_limited(request, session, user_id, account_id, until)
        raise _Refused(upstream.status_code, refusal, limited=until is not None)

    # How much of the plan is used, as ChatGPT says with each answer: kept
    # on the account for the apps (9 November 2026), never in the way of
    # the answer. Grok's is asked of xAI's billing once the answer is done.
    plan_usage = (
        None if is_grok else model_accounts.chatgpt_usage(upstream.headers, utc_now())
    )
    if plan_usage is not None:
        try:
            await _in_own_session(
                request,
                session,
                lambda one: model_accounts.keep_usage(
                    one, user_id, account_id, plan_usage
                ),
            )
        except Exception:
            log.exception("desktop.models.usage_not_kept")

    model = own.desktop_model()

    async def record(usage: Usage) -> None:
        await _in_own_session(
            request,
            session,
            lambda one: desktop.record_usage(
                one,
                user_id=user_id,
                session_id=caller.session_id,
                model=model,
                usage=usage,
                stream=wants_stream,
                upstream_status=200,
                reason=reason,
                billed_by=own.provider,
            ),
        )

    async def after(tally: _ResponseTally) -> None:
        """A limit reached mid-stream ends that answer; the account is
        skipped from the next call on. Grok's usage is asked for then."""
        if is_grok:
            ran_out = grok.failed_out_of_credits(tally.response)
            found = await _grok_credits(
                request, session, user_id, account_id, grant, force=ran_out
            )
            until = _credits_end(found, utc_now()) if ran_out else None
        else:
            until = limit_end(tally.response, utc_now())
        if until is not None:
            await _mark_limited(request, session, user_id, account_id, until)

    if not wants_stream:
        tally = _ResponseTally()
        try:
            async for chunk in upstream.aiter_bytes():
                tally.feed(chunk)
        finally:
            await upstream.aclose()
            await client.aclose()
        usage = tally.finish()
        await record(usage)
        await after(tally)
        answer = tally.answer()
        if answer is None:
            return _error(
                "api_error",
                "The model service answered with no response.",
                502,
            )
        return JSONResponse(answer)

    async def stream() -> AsyncIterator[bytes]:
        tally = _ResponseTally()
        try:
            async for chunk in upstream.aiter_bytes():
                tally.feed(chunk)
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()
            try:
                await record(tally.finish())
                await after(tally)
            except Exception:  # a lost usage row must not kill the stream's close
                log.exception("desktop.proxy.usage_not_recorded")

    return StreamingResponse(
        stream(),
        status_code=200,
        media_type=upstream.headers.get("content-type", "text/event-stream"),
        headers={"cache-control": "no-store"},
    )


# --- the person's own API keys (10 November 2026) ---------------------------------
#
# The founder: "these are all the keys i want our users to be able to use".
# A call on a key goes to its provider on the wire it speaks
# (`key_providers.KeyProvider.wire`): the engine's Responses request as it
# is (OpenAI, SpaceXAI, Azure), written for Chat Completions
# (`chat_wire.py`), or for Claude's Messages (`messages_wire.py`), and its
# answer written back as Responses events. Same rules as a plan's: the
# person's other keys for the provider in turn, then Simeon's model on
# credits when none can answer for now (a limit, a 5xx, the provider
# unreachable, the key refused); the provider's refusal of the request
# itself handed back as it came. A key the provider no longer takes (401)
# shows as signed out in the apps.

#: How long what a provider wants back with its tool calls is kept
#: (`chat_wire.ResponsesWriter.kept`): a tool loop is minutes long.
KEPT_FOR_S = 6 * 3600
#: How long a model that took only the plain request is sent only that.
PLAIN_FOR_S = 24 * 3600
#: A rate limit that says nothing of when it ends.
RATE_LIMIT_WAIT = timedelta(minutes=1)
_KEPT_PREFIX = "desktop:own-kept:"
_PLAIN_PREFIX = "desktop:own-plain:"
#: The most calls whose kept things are looked up for one request.
_MOST_KEPT = 64


def _store(request: Request) -> Any:
    """The app's Redis, where the request has one (the test client's has
    none: nothing is kept)."""
    return getattr(request.state, "redis", None)


async def _recall_kept(
    redis: Any, user_id: Any, call_ids: Sequence[str]
) -> dict[str, dict[str, Any]]:
    if redis is None or not call_ids:
        return {}
    wanted = list(call_ids)[-_MOST_KEPT:]
    try:
        found = await redis.mget([f"{_KEPT_PREFIX}{user_id}:{one}" for one in wanted])
    except Exception:
        log.exception("desktop.models.kept_not_read")
        return {}
    out: dict[str, dict[str, Any]] = {}
    for call_id, raw in zip(wanted, found, strict=True):
        try:
            value = json.loads(raw) if raw else None
        except ValueError:
            value = None
        if isinstance(value, dict):
            out[call_id] = value
    return out


async def _keep_kept(redis: Any, user_id: Any, kept: dict[str, dict[str, Any]]) -> None:
    if redis is None or not kept:
        return
    try:
        for call_id, value in kept.items():
            await redis.set(
                f"{_KEPT_PREFIX}{user_id}:{call_id}", json.dumps(value), ex=KEPT_FOR_S
            )
    except Exception:
        log.exception("desktop.models.kept_not_written")


def _plain_key(user_id: Any, own: OwnModel) -> str:
    return f"{_PLAIN_PREFIX}{user_id}:{own.provider}:{own.slug}"


async def _plain_known(redis: Any, user_id: Any, own: OwnModel) -> bool:
    if redis is None:
        return False
    try:
        return bool(await redis.get(_plain_key(user_id, own)))
    except Exception:
        return False


async def _remember_plain(redis: Any, user_id: Any, own: OwnModel) -> None:
    if redis is None:
        return
    try:
        await redis.set(_plain_key(user_id, own), "1", ex=PLAIN_FOR_S)
    except Exception:
        log.exception("desktop.models.plain_not_kept")


#: What the Responses request keeps on the way to OpenAI, SpaceXAI or Azure;
#: the plain request only the first ones.
_RESPONSES_PLAIN = (
    "input",
    "instructions",
    "tools",
    "tool_choice",
    "max_output_tokens",
)
_RESPONSES_FIELDS = (
    *_RESPONSES_PLAIN,
    "parallel_tool_calls",
    "reasoning",
    "text",
    "include",
    "prompt_cache_key",
    "temperature",
    "top_p",
)


def responses_body(
    payload: dict[str, Any], own: OwnModel, effort: str | None, *, plain: bool = False
) -> dict[str, Any]:
    """The engine's Responses request for a provider that speaks it: the
    model the key's, nothing stored there, the person's effort on every
    call."""
    body: dict[str, Any] = {"model": own.slug, "stream": True, "store": False}
    for key in _RESPONSES_PLAIN if plain else _RESPONSES_FIELDS:
        if payload.get(key) is not None:
            body[key] = payload[key]
    reasoning = body.get("reasoning")
    if isinstance(reasoning, dict):
        asked = chat_wire.effort_of(payload, effort)
        if asked in _NO_EFFORT:
            asked = "low"
        taken = own.efforts_taken
        if asked is not None and taken and asked not in taken:
            asked = taken[-1]
        body["reasoning"] = {**reasoning, "effort": asked} if asked else reasoning
    return body


def _key_body(
    one: key_providers.KeyProvider,
    own: OwnModel,
    payload: dict[str, Any],
    effort: str | None,
    kept: dict[str, dict[str, Any]],
    plain: bool,
) -> dict[str, Any]:
    if one.wire == "responses":
        return responses_body(payload, own, effort, plain=plain)
    if one.wire == "messages":
        return messages_wire.messages_request(
            payload, own.slug, effort, kept=kept, plain=plain, thinking=one.thinking
        )
    return chat_wire.chat_request(
        payload, own.slug, one.dialect, effort, kept=kept, plain=plain
    )


def _reader(
    one: key_providers.KeyProvider, own: OwnModel
) -> chat_wire.ResponsesWriter | None:
    """What writes the provider's answer as Responses events; None when it
    answers on them already."""
    if one.wire == "messages":
        return messages_wire.MessagesToResponses(model=own.slug)
    if one.wire == "chat":
        return chat_wire.ChatToResponses(model=own.slug)
    return None


def key_limit_until(
    status: int, headers: Any, refusal: bytes, now: datetime
) -> datetime | None:
    """Until when a key waits: its credits run out (402, or a 429 saying
    so) an hour; a rate limit what the provider says (`retry-after`), else
    a minute. None for any other refusal."""
    words = refusal[:2000].decode(errors="replace").lower()
    if status == 402 or (
        status == 429
        and any(one in words for one in ("insufficient_quota", "billing", "credit"))
    ):
        return now + LIMIT_WITHOUT_END
    if status != 429:
        return None
    try:
        wait = float(str(headers.get("retry-after") or ""))
    except ValueError:
        wait = 0.0
    if 0 < wait <= LIMIT_WITHOUT_END.total_seconds():
        return now + timedelta(seconds=max(wait, 5.0))
    return now + RATE_LIMIT_WAIT


async def _on_keys(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    own: OwnModel,
    payload: dict[str, Any],
    wants_stream: bool,
    reason: str | None,
    effort: str | None,
    simeon: Callable[[dict[str, Any]], Awaitable[_Answer]],
) -> _Answer:
    """One of the agents' calls on the person's keys for its provider, in
    turn; then Simeon's model."""
    user = caller.user
    one = key_providers.provider(own.provider)
    if one is None or not one.available:
        return await _on_simeon(own, payload, user, simeon)
    now = utc_now()
    accounts = [
        account
        for account in await _usable(session, user.id, own.provider)
        if account.limited_until is None or account.limited_until <= now
    ]
    refused_request: _Refused | None = None
    for account in accounts:
        try:
            return await _on_key_account(
                request,
                caller,
                session,
                one,
                own,
                account.id,
                payload,
                wants_stream,
                reason,
                effort,
            )
        except _Refused as refused:
            log.warning(
                "desktop.models.relay_refused",
                user_id=str(user.id),
                provider=own.provider,
                model=own.slug,
                status=refused.status,
                preview=_preview(refused.body),
            )
            if refused.refuses_the_request:
                refused_request = refused
    if refused_request is not None:
        return refused_request.answer()
    return await _on_simeon(own, payload, user, simeon)


async def _on_key_account(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    one: key_providers.KeyProvider,
    own: OwnModel,
    account_id: Any,
    payload: dict[str, Any],
    wants_stream: bool,
    reason: str | None,
    effort: str | None,
) -> _Answer:
    """The call on one key. Raises `_Refused` when it did not answer, so the
    next one can. A request the model refuses (400, 422) is sent once more
    plain (`chat_wire.chat_request`'s `plain`), and that model is sent only
    the plain one for a day when it took it."""
    user_id = caller.user.id
    grant = await _grant(request, session, user_id, account_id)
    fields = dict(grant.fields)
    redis = _store(request)
    kept = await _recall_kept(redis, user_id, chat_wire.call_ids(payload))
    plain = await _plain_known(redis, user_id, own)
    went_plain = False
    conversation = payload.get("prompt_cache_key")
    headers = {
        **one.auth_headers(grant.access_token),
        "content-type": "application/json",
        "accept": "text/event-stream",
    }
    if one.slug == "opencode" and isinstance(conversation, str) and conversation:
        # OpenCode Go asks each client for a steady session id.
        headers["x-opencode-session"] = conversation[:200]
    client = httpx.AsyncClient(timeout=_timeout())
    while True:
        body = _key_body(one, own, payload, effort, kept, plain)
        try:
            upstream = await client.send(
                client.build_request(
                    "POST",
                    one.call_url(fields),
                    headers=headers,
                    content=json.dumps(body).encode(),
                ),
                stream=True,
            )
        except httpx.HTTPError as error:
            await client.aclose()
            raise _Refused(None, type(error).__name__.encode()) from error
        if upstream.status_code == 200:
            break
        refusal = await upstream.aread()
        await upstream.aclose()
        if upstream.status_code in (400, 422) and not plain:
            log.info(
                "desktop.models.key_plain",
                user_id=str(user_id),
                provider=own.provider,
                model=own.slug,
                preview=_preview(refusal),
            )
            plain = went_plain = True
            continue
        await client.aclose()
        if upstream.status_code == 401:
            await _in_own_session(
                request,
                session,
                lambda fresh: model_accounts.key_refused(fresh, user_id, account_id),
            )
            raise _Refused(401, refusal)
        until = key_limit_until(
            upstream.status_code, upstream.headers, refusal, utc_now()
        )
        if until is not None:
            await _mark_limited(request, session, user_id, account_id, until)
        raise _Refused(upstream.status_code, refusal, limited=until is not None)
    if went_plain:
        await _remember_plain(redis, user_id, own)

    reader = _reader(one, own)
    model = own.desktop_model()

    async def pieces() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream.aiter_bytes():
                if reader is None:
                    yield chunk
                    continue
                for piece in reader.feed(chunk):
                    yield piece
            if reader is not None:
                for piece in reader.finish():
                    yield piece
        finally:
            await upstream.aclose()
            await client.aclose()

    async def done(tally: _ResponseTally) -> None:
        await _in_own_session(
            request,
            session,
            lambda fresh: desktop.record_usage(
                fresh,
                user_id=user_id,
                session_id=caller.session_id,
                model=model,
                usage=tally.finish(),
                stream=wants_stream,
                upstream_status=200,
                reason=reason,
                billed_by=own.provider,
            ),
        )
        if reader is not None:
            await _keep_kept(redis, user_id, reader.kept())

    if not wants_stream:
        tally = _ResponseTally()
        async for piece in pieces():
            tally.feed(piece)
        await done(tally)
        answer = tally.answer()
        if answer is None:
            said: dict[str, Any] = (reader.error if reader is not None else None) or {}
            return _error(
                "api_error",
                str(said.get("message") or "The model answered with no response."),
                502,
            )
        return JSONResponse(answer)

    async def stream() -> AsyncIterator[bytes]:
        tally = _ResponseTally()
        try:
            async for piece in pieces():
                tally.feed(piece)
                yield piece
        finally:
            try:
                await done(tally)
            except Exception:  # a lost usage row must not kill the stream's close
                log.exception("desktop.proxy.usage_not_recorded")

    return StreamingResponse(
        stream(),
        status_code=200,
        media_type="text/event-stream",
        headers={"cache-control": "no-store"},
    )


def _credits_end(found: grok.Credits | None, now: datetime) -> datetime:
    """Until when a Grok plan out of credits waits: the end of its period,
    as xAI's billing says, else an hour."""
    end = found.period_end if found is not None else None
    return end if end is not None and end > now else now + LIMIT_WITHOUT_END


async def _limit_until(
    request: Request,
    session: AsyncSession,
    own: OwnModel,
    user_id: Any,
    account_id: Any,
    grant: model_accounts.AccessGrant,
    status: int,
    refusal: bytes,
) -> datetime | None:
    """Until when the account's plan limit holds, when the refusal says it
    was reached; None for any other refusal."""
    now = utc_now()
    if own.provider == model_accounts.PROVIDER_GROK:
        if not grok.out_of_credits(status, refusal):
            return None
        found = await _grok_credits(
            request, session, user_id, account_id, grant, force=True
        )
        return _credits_end(found, now)
    try:
        answer = json.loads(refusal)
    except ValueError:
        answer = None
    return limit_end(answer, now)


async def _usage_at(
    session: AsyncSession, user_id: Any, account_id: Any
) -> datetime | None:
    account = await ModelAccountRepository.from_session(session).one_for_user(
        user_id, account_id
    )
    at = (account.usage or {}).get("at") if account is not None else None
    return (
        datetime.fromtimestamp(at / 1000, tz=UTC)
        if isinstance(at, int | float)
        else None
    )


async def _grok_credits(
    request: Request,
    session: AsyncSession,
    user_id: Any,
    account_id: Any,
    grant: model_accounts.AccessGrant,
    *,
    force: bool,
) -> grok.Credits | None:
    """A Grok plan's credits from xAI's billing, kept on the account for the
    apps: at most every `GROK_USAGE_EVERY`, or now when they ran out. None
    when not asked, or xAI didn't say. Never in the way of an answer."""
    try:
        if not force:
            last = await _in_own_session(
                request, session, lambda one: _usage_at(one, user_id, account_id)
            )
            if last is not None and utc_now() - last < GROK_USAGE_EVERY:
                return None
        found = await grok.credits(grant.access_token, grant.account_key)
        if found is not None and found.window is not None:
            usage = {
                "windows": [found.window],
                "at": int(utc_now().timestamp() * 1000),
            }
            await _in_own_session(
                request,
                session,
                lambda one: model_accounts.keep_usage(one, user_id, account_id, usage),
            )
        return found
    except Exception:
        log.exception("desktop.models.usage_not_kept")
        return None


async def _mark_limited(
    request: Request,
    session: AsyncSession,
    user_id: Any,
    account_id: Any,
    until: datetime,
) -> None:
    await _in_own_session(
        request,
        session,
        lambda one: model_accounts.mark_limited(one, user_id, account_id, until),
    )
    log.info(
        "desktop.models.limited",
        user_id=str(user_id),
        until=until.isoformat(),
    )


# --- web search and pictures on the account ------------------------------------
#
# The founder, 8 November 2026: "it's ok to keep video, dictation and voice
# calls. the rest goes to chat". With ChatGPT chosen, the agent's web search
# and pictures run on the person's account too, the way Codex runs them:
# search as the Responses API's own `web_search` tool on the account's cheap
# model, pictures on `/images/generations` and `/images/edits` with
# `gpt-image-2` (openai/codex, `core/src/tools/hosted_spec.rs`,
# `ext/image-generation`). Same rules as the chat: no plan, refused; nothing
# chosen, Simeon's; the next account when one can't answer for now; Simeon's
# search or picture, on credits, when none can; ChatGPT's refusal of the
# request itself handed back as it came. Voice calls, dictation and video
# stay on Simeon's.

#: The picture model, as Codex's image tool names it.
CHATGPT_IMAGE = OwnModel(_CHATGPT, "gpt-image-2", "GPT Image 2", 0)
#: Grok's, as Grok Build's `image_gen` and `image_edit` name it; xAI keeps
#: pictures from Free and X Basic (Grok Build's `is_restricted_tier_name`).
GROK_IMAGE = OwnModel(
    _GROK,
    "grok-imagine-image-quality",
    "Grok Imagine",
    0,
    frozenset({"free", "x_basic"}),
)
#: The shapes Grok Imagine draws (Grok Build's `aspect_ratio`), "auto" aside.
_GROK_RATIOS = ("1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2")


def _helper(chosen: OwnModel) -> OwnModel:
    """The model that searches: the chosen one (11 November 2026, the
    founder: "make sure everything else is like that"); on Grok, Grok 4.6,
    the one model with the proxy's own search."""
    if chosen.provider == model_accounts.PROVIDER_GROK:
        return own_model(f"{OWN_PREFIX}{_GROK}:{GROK_SEARCH}") or chosen
    return chosen


async def _own_gate(
    session: AsyncSession, user: User
) -> tuple[OwnModel | None, JSONResponse | None]:
    """The chosen model, or a refusal: None and None when the person's
    agents are on Simeon's models (the caller goes on as before)."""
    chosen = chosen_model(user)
    if chosen is None or chosen.provider not in model_accounts.SIGNED_IN_BY_CODE:
        # Claude Code searches the web itself; Simeon's answers the rest.
        return None, None
    allowance = await desktop.allowance(session, user)
    if allowance.none:
        return None, quota_exhausted_response(allowance)
    return chosen, None


def _image_headers(
    grant: model_accounts.AccessGrant, accept: str = "application/json"
) -> dict[str, str]:
    """xAI's API takes the same sign-in as a bearer and nothing more (Grok
    Build's `side_call_bearer.rs`)."""
    return {
        "authorization": f"Bearer {grant.access_token}",
        "content-type": "application/json",
        "accept": accept,
    }


def _headers_for(
    model: OwnModel, url: str
) -> Callable[[model_accounts.AccessGrant, str], dict[str, str]]:
    if model.provider != model_accounts.PROVIDER_GROK:
        return _codex_headers
    if url.startswith(grok.api_base()):
        return _image_headers
    return lambda grant, accept: grok.headers(
        grant.access_token, model=model.slug, accept=accept
    )


async def _call(
    request: Request,
    session: AsyncSession,
    user_id: Any,
    account_id: Any,
    url: str,
    body: dict[str, Any],
    *,
    stream: bool,
    model: OwnModel,
) -> dict[str, Any]:
    """One search or picture on one account: the answer, or `_Refused`.
    A stream (the Responses API, which ChatGPT serves only as one) is read
    to its last response."""
    grant = await _grant(request, session, user_id, account_id)
    headers_of = _headers_for(model, url)
    refreshed = False
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        while True:
            headers = headers_of(
                grant, "text/event-stream" if stream else "application/json"
            )
            try:
                if stream:
                    async with client.stream(
                        "POST", url, headers=headers, json=body
                    ) as upstream:
                        status = upstream.status_code
                        if status == 200:
                            tally = _ResponseTally()
                            async for chunk in upstream.aiter_bytes():
                                tally.feed(chunk)
                            tally.finish()
                            answer = tally.answer()
                            if answer is None:
                                raise _Refused(502, b"no response")
                            return answer
                        refusal = await upstream.aread()
                else:
                    upstream = await client.post(url, headers=headers, json=body)
                    status = upstream.status_code
                    if status == 200:
                        try:
                            parsed = upstream.json()
                        except ValueError as error:
                            raise _Refused(502, b"not JSON") from error
                        if not isinstance(parsed, dict):
                            raise _Refused(502, b"not an object")
                        return parsed
                    refusal = upstream.content
            except httpx.HTTPError as error:
                raise _Refused(None, type(error).__name__.encode()) from error
            if status == 401 and not refreshed:
                refreshed = True
                grant = await _grant(
                    request, session, user_id, account_id, force_refresh=True
                )
                continue
            until = await _limit_until(
                request, session, model, user_id, account_id, grant, status, refusal
            )
            if until is not None:
                await _mark_limited(request, session, user_id, account_id, until)
            raise _Refused(status, refusal, limited=until is not None)


async def _on_accounts(
    request: Request,
    session: AsyncSession,
    user: User,
    model: OwnModel,
    what: str,
    url: str,
    body: dict[str, Any],
    *,
    stream: bool,
) -> tuple[dict[str, Any] | None, JSONResponse | None]:
    """The answer of the first account that gives one; else the provider's
    refusal of the request itself; else neither (Simeon's takes it on)."""
    now = utc_now()
    accounts = [
        one
        for one in await _usable(session, user.id, model.provider)
        if (one.limited_until is None or one.limited_until <= now)
        and model.on_plan(one.plan)
    ]
    refused_request: _Refused | None = None
    for account in accounts:
        try:
            answer = await _call(
                request,
                session,
                user.id,
                account.id,
                url,
                body,
                stream=stream,
                model=model,
            )
        except _Refused as refused:
            log.warning(
                "desktop.models.relay_refused",
                user_id=str(user.id),
                provider=model.provider,
                model=model.slug,
                what=what,
                status=refused.status,
                preview=_preview(refused.body),
            )
            if refused.refuses_the_request:
                refused_request = refused
            continue
        return answer, None
    if refused_request is not None:
        return None, refused_request.answer()
    log.info(
        "desktop.models.on_simeon",
        user_id=str(user.id),
        provider=model.provider,
        what=what,
        why="no_account_answered",
    )
    return None, None


async def _record_own(
    request: Request,
    session: AsyncSession,
    caller: ProxyCaller,
    model: OwnModel,
    usage: Usage,
    reason: str,
) -> None:
    try:
        await _in_own_session(
            request,
            session,
            lambda one: desktop.record_usage(
                one,
                user_id=caller.user.id,
                session_id=caller.session_id,
                model=model.desktop_model(),
                usage=usage,
                stream=False,
                upstream_status=200,
                reason=reason,
                billed_by=model.provider,
            ),
        )
    except Exception:  # a lost usage row must not swallow the answer
        log.exception(f"desktop.{reason}.usage_not_recorded")


def search_result(response: dict[str, Any]) -> dict[str, Any]:
    """What the agent's `web_search` tool wants (`capabilities.web_search`'s
    shape), read out of a Responses answer that ran the `web_search` tool:
    the text, the pages it cites (`url_citation`, each with the words it
    cites), then the other pages the searches returned, and how many
    searches ran."""
    parts: list[str] = []
    documents: list[dict[str, str]] = []
    seen: set[str] = set()
    returned: list[tuple[str, str]] = []
    searches = 0
    output = response.get("output")
    for item in output if isinstance(output, list) else []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "web_search_call":
            searches += 1
            action = item.get("action")
            sources = action.get("sources") if isinstance(action, dict) else None
            for source in sources if isinstance(sources, list) else []:
                url = source.get("url") if isinstance(source, dict) else None
                if isinstance(url, str) and url:
                    title = source.get("title")
                    returned.append((url, title if isinstance(title, str) else ""))
        elif item.get("type") == "message":
            content = item.get("content")
            for part in content if isinstance(content, list) else []:
                if not isinstance(part, dict) or part.get("type") != "output_text":
                    continue
                text = part.get("text")
                if not isinstance(text, str):
                    continue
                parts.append(text)
                for note in part.get("annotations") or []:
                    if not isinstance(note, dict) or note.get("type") != "url_citation":
                        continue
                    url = note.get("url")
                    if not isinstance(url, str) or not url or url in seen:
                        continue
                    seen.add(url)
                    start, end = note.get("start_index"), note.get("end_index")
                    cited = (
                        text[start:end]
                        if isinstance(start, int) and isinstance(end, int)
                        else ""
                    )
                    title = note.get("title")
                    documents.append(
                        {
                            "url": url,
                            "title": title if isinstance(title, str) else "",
                            "text": cited.strip(),
                        }
                    )
    for url, title in returned:
        if url not in seen:
            seen.add(url)
            documents.append({"url": url, "title": title, "text": ""})
    return {
        "answer": "".join(parts).strip(),
        "documents": documents,
        "searches": searches,
    }


async def web_search(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    query: str,
    instructions: str,
) -> JSONResponse | None:
    """The agent's web search on the person's account, or None for
    Simeon's (`capabilities.web_search` goes on as before)."""
    user = caller.user
    chosen, refused = await _own_gate(session, user)
    if refused is not None or chosen is None:
        return refused
    model = _helper(chosen)
    is_grok = model.provider == model_accounts.PROVIDER_GROK
    if is_grok:
        # Grok Build's own search (`web_search/client.rs`): one call to the
        # proxy's Responses, its `web_search` tool, answered whole.
        body: dict[str, Any] = {
            "model": model.slug,
            "input": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": query},
            ],
            "tools": [{"type": "web_search"}],
            "store": False,
            "temperature": 0.1,
            "top_p": 0.95,
            "max_output_tokens": 8192,
        }
    else:
        body = {
            "model": model.slug,
            "stream": True,
            "input": [
                {"role": "developer", "content": instructions},
                {"role": "user", "content": query},
            ],
            "tools": [{"type": "web_search", "external_web_access": True}],
            "tool_choice": "auto",
            "parallel_tool_calls": False,
            # The effort the person chose, as on every other call.
            "reasoning": {"effort": chosen_effort(user) or "low"},
            "store": False,
        }
    answer, refusal = await _on_accounts(
        request,
        session,
        user,
        model,
        "search",
        _responses_url(model.provider),
        body,
        stream=not is_grok,
    )
    if refusal is not None:
        return refusal
    if answer is None:
        return None
    await _record_own(
        request,
        session,
        caller,
        model,
        Usage.from_openai_responses_payload(answer.get("usage")),
        "search",
    )
    return JSONResponse(search_result(answer), headers={"cache-control": "no-store"})


def _aspect(size: str) -> str:
    """The Grok Imagine shape nearest the size asked ("1536x1024" is 3:2);
    "auto", Grok Build's own default, lets Grok choose."""
    if size == "auto":
        return "auto"
    try:
        width, height = (int(part) for part in size.lower().split("x", 1))
    except ValueError:
        return "1:1"
    if width <= 0 or height <= 0:
        return "1:1"
    wanted = width / height

    def ratio(one: str) -> float:
        w, h = one.split(":")
        return int(w) / int(h)

    return min(_GROK_RATIOS, key=lambda one: abs(ratio(one) - wanted))


def _grok_picture(
    prompt: str, size: str, references: Sequence[tuple[bytes, str]]
) -> tuple[dict[str, Any], str]:
    """Grok Build's picture request: drawn new, or from the pictures given
    (one as `image`, several as `images`, the shape then named)."""
    body: dict[str, Any] = {
        "model": GROK_IMAGE.slug,
        "prompt": prompt,
        "n": 1,
        "resolution": "1k",
        "response_format": "b64_json",
    }
    if not references:
        body["aspect_ratio"] = _aspect(size)
        return body, "/images/generations"
    given = [
        {"url": f"data:{mime};base64,{base64.b64encode(raw).decode()}"}
        for raw, mime in references
    ]
    if len(given) == 1:
        body["image"] = given[0]
    else:
        body["images"] = given
        body["aspect_ratio"] = _aspect(size)
    return body, "/images/edits"


def _picture_type(b64: str) -> str:
    """A picture's type from its first bytes: ChatGPT draws PNGs, Grok
    Imagine JPEGs."""
    if b64.startswith("/9j/"):
        return "image/jpeg"
    if b64.startswith("UklGR"):
        return "image/webp"
    return "image/png"


async def draw(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    *,
    prompt: str,
    size: str,
    quality: str,
    references: Sequence[tuple[bytes, str]],
) -> JSONResponse | None:
    """One picture on the person's account, or None for Simeon's
    (`capabilities.images_generations` goes on as before). The answer is
    that route's shape: `{data: [{b64_json, mime_type}], usage}`."""
    user = caller.user
    chosen, refused = await _own_gate(session, user)
    if refused is not None or chosen is None:
        return refused
    if chosen.provider == model_accounts.PROVIDER_GROK:
        picture_model = GROK_IMAGE
        body, path = _grok_picture(prompt, size, references)
        url = f"{grok.api_base()}{path}"
    else:
        picture_model = CHATGPT_IMAGE
        body = {
            "prompt": prompt,
            "model": CHATGPT_IMAGE.slug,
            "quality": quality,
            "size": size,
        }
        path = "/images/generations"
        if references:
            path = "/images/edits"
            body["images"] = [
                {"image_url": f"data:{mime};base64,{base64.b64encode(raw).decode()}"}
                for raw, mime in references
            ]
        url = f"{_codex_base()}{path}"
    answer, refusal = await _on_accounts(
        request,
        session,
        user,
        picture_model,
        "images",
        url,
        body,
        stream=False,
    )
    if refusal is not None:
        return refusal
    if answer is None:
        return None
    data = answer.get("data")
    pictures = [
        {"b64_json": one["b64_json"], "mime_type": _picture_type(one["b64_json"])}
        for one in (data if isinstance(data, list) else [])
        if isinstance(one, dict) and isinstance(one.get("b64_json"), str)
    ]
    if not pictures:
        log.warning("desktop.models.no_picture", user_id=str(user.id))
        return _error("api_error", "The image service returned no picture.", 502)
    await _record_own(request, session, caller, picture_model, Usage(), "images")
    return JSONResponse(
        {"data": pictures, "usage": None}, headers={"cache-control": "no-store"}
    )


# --- the person's choice --------------------------------------------------------


class _ChoiceBody(BaseModel):
    model: str | None = None
    #: How hard it thinks; left as it was when the request doesn't name it.
    effort: str | None = None


async def _choices(session: AsyncSession, user: User) -> list[OwnModel]:
    """The models the person may choose: those of each provider they have an
    account for, signed in."""
    accounts = await ModelAccountRepository.from_session(session).for_user(user.id)
    signed_in = [
        one for one in accounts if one.status != model_accounts.STATUS_SIGNED_OUT
    ]
    offered = [
        model
        for model in ALL_MODELS
        if any(
            one.provider == model.provider and model.on_plan(one.plan)
            for one in signed_in
        )
    ]
    # Then each API key's models, as its provider listed them, in the order
    # the keys were connected.
    seen = set(offered)
    for account in signed_in:
        if account.kind != model_accounts.KIND_API_KEY:
            continue
        for model in _stored_models(account):
            if model not in seen and key_providers.provider(model.provider) is not None:
                seen.add(model)
                offered.append(model)
    return offered


async def _choice_json(session: AsyncSession, user: User) -> dict[str, Any]:
    chosen = chosen_model(user)
    choices = await _choices(session, user)
    offered = chosen is not None and chosen in choices
    return {
        "model": chosen.model_id if chosen is not None and offered else None,
        "models": [one.json() for one in choices],
        # How hard it thinks, and the efforts its provider takes (none for Simeon's).
        "effort": chosen_effort(user) if offered else None,
        "efforts": list(chosen.efforts_taken) if chosen is not None and offered else [],
    }


@router.get("/api/models/own", name="desktop:own_models")
async def own_models_choice(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The models of the person's own accounts and the one their agents use
    (`model`, None for Simeon's)."""
    return JSONResponse(await _choice_json(session, desktop_session.user))


@router.put("/api/models/own", name="desktop:own_models_choose")
async def own_models_choose(
    body: _ChoiceBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The person's choice: one of their accounts' models, or None to go
    back to Simeon's, and how hard it thinks (`effort`, when named). The
    agents follow at their next turn."""
    user = desktop_session.user
    meta = dict(user.meta or {})
    if "model" in body.model_fields_set:
        if body.model is None:
            meta.pop(CHOICE_KEY, None)
        else:
            wanted = own_model(body.model)
            if wanted is None or wanted not in await _choices(session, user):
                return model_accounts.refusal("not_offered", 400)
            meta[CHOICE_KEY] = wanted.model_id
    if "effort" in body.model_fields_set:
        value = meta.get(CHOICE_KEY)
        model = own_model(value) if isinstance(value, str) else None
        if model is None or body.effort not in model.efforts_taken:
            return model_accounts.refusal("not_offered", 400)
        meta[EFFORT_KEY] = body.effort
    user.meta = meta
    session.add(user)
    log.info(
        "desktop.models.chosen",
        user_id=str(user.id),
        model=meta.get(CHOICE_KEY),
        effort=meta.get(EFFORT_KEY),
    )
    return JSONResponse(await _choice_json(session, user))
