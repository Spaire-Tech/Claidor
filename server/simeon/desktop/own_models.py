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

**Which calls.** `/desktop/api/models/available` names the chosen model for
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

**When the account can't answer.** The person's other accounts for the same
provider are tried in the order they were connected. ChatGPT's plan limit
(429 `usage_limit_reached`) marks the account limited until the time ChatGPT
names (`limited_until`), and its calls skip it until then. When no account
answers, the call goes to Simeon's own OpenAI model under the person's
allowance, as Reason does. Each refusal is logged with ChatGPT's own words
(`desktop.models.relay_refused`).

**Not verified against chatgpt.com.** For models it marks
`use_responses_lite`, Codex sends the tools inside `input`
(`additional_tools`), not in `tools`. This relay sends the standard
`tools`, as OpenAI's public Responses API takes them. If ChatGPT refuses
that, the log line says so and the calls go to Simeon's model meanwhile.
"""

from __future__ import annotations

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

from . import model_accounts
from .auth import ProxyCaller, get_desktop_session
from .model_account_repository import ModelAccountRepository
from .pricing import (
    DesktopModel,
    DesktopProvider,
    ModelRole,
    OpenAIResponsesUsageTally,
    SpokenApi,
    Usage,
)
from .proxy_common import error_response as _error
from .proxy_common import upstream_timeout as _timeout
from .service import desktop, offered_models

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

_Answer = JSONResponse | StreamingResponse

OWN_PREFIX = "own:"
#: The person's choice, kept with their other settings (`users.meta`).
CHOICE_KEY = "own_model"
#: A limit ChatGPT reports without saying until when.
LIMIT_WITHOUT_END = timedelta(hours=1)
#: ChatGPT's words for a plan's limit reached (Codex's
#: `UsageLimitReached`; OpenAI's Sign in with ChatGPT names the second).
LIMIT_CODES = frozenset(
    {"usage_limit_reached", "subscription_sharing_usage_limit_exceeded"}
)


@dataclass(frozen=True)
class OwnModel:
    """One model of a provider the person connects."""

    provider: str
    slug: str
    name: str
    context_window: int

    @property
    def model_id(self) -> str:
        return f"{OWN_PREFIX}{self.provider}:{self.slug}"

    def desktop_model(self, role: ModelRole | None = None) -> DesktopModel:
        """The model as the catalogue's rows are: priced at nothing (the
        person's plan pays), on the Responses wire."""
        return DesktopModel(
            model_id=self.model_id,
            model_name=self.name,
            description=f"{self.name} on your {_PROVIDER_NAMES[self.provider]} plan",
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


_PROVIDER_NAMES = {model_accounts.PROVIDER_CHATGPT: "ChatGPT"}

#: ChatGPT's models for Codex, as Codex's own list names them (openai/codex,
#: `codex-rs/models-manager/models.json`, the ones it shows, 8 November
#: 2026), best first. To be read from the account itself later.
CHATGPT_MODELS: tuple[OwnModel, ...] = (
    OwnModel(model_accounts.PROVIDER_CHATGPT, "gpt-6.1-sol", "GPT-6.1 Sol", 272_000),
    OwnModel(model_accounts.PROVIDER_CHATGPT, "gpt-6-astra", "GPT-6 Astra", 272_000),
    OwnModel(
        model_accounts.PROVIDER_CHATGPT, "gpt-6.1-terra", "GPT-6.1 Terra", 500_000
    ),
    OwnModel(model_accounts.PROVIDER_CHATGPT, "gpt-6-sol", "GPT-6 Sol", 272_000),
    OwnModel(model_accounts.PROVIDER_CHATGPT, "gpt-6-luna", "GPT-6 Luna", 272_000),
)
#: The model for the agents' machinery (titles, summaries, memory).
CHATGPT_CHEAP = "gpt-6-luna"

_MODELS: dict[str, OwnModel] = {one.model_id: one for one in CHATGPT_MODELS}
_CHEAP: dict[str, str] = {
    model_accounts.PROVIDER_CHATGPT: f"{OWN_PREFIX}chatgpt:{CHATGPT_CHEAP}"
}


def is_own(model_id: str) -> bool:
    return model_id.strip().startswith(OWN_PREFIX)


def own_model(model_id: str) -> OwnModel | None:
    return _MODELS.get(model_id.strip())


def chosen_model(user: User) -> OwnModel | None:
    """The model the person chose for their agents, or None for Simeon's."""
    value = (user.meta or {}).get(CHOICE_KEY)
    return own_model(value) if isinstance(value, str) else None


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
    if chosen is None or not await _usable(session, user.id, chosen.provider):
        return []
    cheap = own_model(_CHEAP.get(chosen.provider, "")) or chosen
    return [
        chosen.desktop_model(ModelRole.primary).available(),
        cheap.desktop_model(ModelRole.cheap).available(),
        chosen.desktop_model(ModelRole.computer).available(),
    ]


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


def codex_body(payload: dict[str, Any], slug: str) -> dict[str, Any]:
    """The engine's Responses request as ChatGPT takes it."""
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
    body["store"] = False
    return body


def _codex_headers(grant: model_accounts.AccessGrant) -> dict[str, str]:
    return {
        "authorization": f"Bearer {grant.access_token}",
        "chatgpt-account-id": grant.account_key,
        "originator": settings.CHATGPT_ORIGINATOR,
        "content-type": "application/json",
        "accept": "text/event-stream",
    }


def _codex_url() -> str:
    return f"{settings.CHATGPT_CODEX_BASE_URL.rstrip('/')}/responses"


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

    def _event(self, event: dict[str, Any]) -> None:
        super()._event(event)
        if event.get("type") in self.TERMINAL and isinstance(
            event.get("response"), dict
        ):
            self.response = event["response"]


# --- the relay ------------------------------------------------------------------


class _Refused(Exception):
    """One account did not answer: its status and ChatGPT's own words."""

    def __init__(self, status: int | None, body: bytes) -> None:
        super().__init__(f"{status}")
        self.status = status
        self.body = body


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
    wants_stream = payload.get("stream") is True
    body = json.dumps(codex_body(payload, own.slug)).encode()
    now = utc_now()
    accounts = [
        one
        for one in await _usable(session, user.id, own.provider)
        if one.limited_until is None or one.limited_until <= now
    ]
    for account in accounts:
        account_id = account.id
        try:
            return await _on_account(
                request, caller, session, own, account_id, body, wants_stream, reason
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
            continue
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
    if stand_in is None:
        return _error(
            "api_error",
            f"Your {_PROVIDER_NAMES[own.provider]} account can't answer right now.",
            503,
        )
    log.info(
        "desktop.models.on_simeon",
        user_id=str(user.id),
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
    order = (
        (ModelRole.cheap, ModelRole.primary, ModelRole.fallback)
        if own.model_id in _CHEAP.values()
        else (ModelRole.primary, ModelRole.fallback, ModelRole.cheap)
    )
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
    except model_accounts.ChatGptUnavailable as error:
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
) -> _Answer:
    """The call on one account. Raises `_Refused` when it did not answer,
    so the next one can."""
    user_id = caller.user.id
    grant = await _grant(request, session, user_id, account_id)
    client = httpx.AsyncClient(timeout=_timeout())
    refreshed = False
    while True:
        try:
            upstream = await client.send(
                client.build_request(
                    "POST", _codex_url(), headers=_codex_headers(grant), content=body
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
        try:
            answer = json.loads(refusal)
        except ValueError:
            answer = None
        until = limit_end(answer, utc_now())
        if until is not None:
            await _mark_limited(request, session, user_id, account_id, until)
        raise _Refused(upstream.status_code, refusal)

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
            ),
        )

    async def after(tally: _ResponseTally) -> None:
        """A limit reached mid-stream ends that answer; the account is
        skipped from the next call on."""
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
        if tally.response is None:
            return _error(
                "api_error",
                "The model service answered with no response.",
                502,
            )
        return JSONResponse(tally.response)

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


# --- the person's choice --------------------------------------------------------


class _ChoiceBody(BaseModel):
    model: str | None = None


async def _choices(session: AsyncSession, user: User) -> list[OwnModel]:
    """The models the person may choose: those of each provider they have an
    account for, signed in."""
    accounts = await ModelAccountRepository.from_session(session).for_user(user.id)
    providers = {
        one.provider
        for one in accounts
        if one.status != model_accounts.STATUS_SIGNED_OUT
    }
    return [one for one in CHATGPT_MODELS if one.provider in providers]


async def _choice_json(session: AsyncSession, user: User) -> dict[str, Any]:
    chosen = chosen_model(user)
    choices = await _choices(session, user)
    return {
        "model": chosen.model_id if chosen is not None and chosen in choices else None,
        "models": [one.json() for one in choices],
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
    back to Simeon's. The agents follow within five minutes."""
    user = desktop_session.user
    meta = dict(user.meta or {})
    if body.model is None:
        meta.pop(CHOICE_KEY, None)
    else:
        wanted = own_model(body.model)
        if wanted is None or wanted not in await _choices(session, user):
            return JSONResponse({"error": "not_offered"}, status_code=400)
        meta[CHOICE_KEY] = wanted.model_id
    user.meta = meta
    session.add(user)
    log.info(
        "desktop.models.chosen",
        user_id=str(user.id),
        model=meta.get(CHOICE_KEY),
    )
    return JSONResponse(await _choice_json(session, user))
