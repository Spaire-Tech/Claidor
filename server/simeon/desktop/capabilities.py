"""The agent's other three calls: web search, pictures, dictation.

The desktop agent advertises four tools that are not a model turn. Until
19 September 2026 all four were Connect RPC calls on
`simeon.v1.AiService` — `RunWebSearch`, `RunWebFetch`,
`RunGenerateImage`, `TranscribeAudio` — which Simeon never served, so
every one of them failed the moment the app was pointed here
(`docs/services-core.md`). Web fetch now runs on the
person's machine and needs nothing from us. The other three need a
provider, and these are their doors: search on Claude (since 18 October
2026), pictures and dictation on OpenAI, each with Simeon's key and each
metered in the same unit as a model turn (`pricing.py`).

Same manners as the speech route in `endpoints.py`: the body is read by
hand so every refusal comes back in the one error shape the app already
reads, the person's allowance is checked before the provider is called,
a provider's refusal is logged with its own sentence, and a usage row is
written whether or not the call succeeded — a refusal after OpenAI has
done the work still costs money, and a row with a failing status says
so.
"""

from __future__ import annotations

import base64
import json
from typing import Annotated, Any

import httpx
import structlog
from fastapi import Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .auth import ProxyCaller, get_proxy_caller
from .pricing import (
    IMAGE_EDIT_MODEL,
    IMAGE_MAX_PROMPT_CHARACTERS,
    IMAGE_MAX_REFERENCE_BYTES,
    IMAGE_MAX_REFERENCE_IMAGES,
    IMAGE_MODEL,
    LEGACY_IMAGE_MODEL,
    TRANSCRIPTION_MAX_BYTES,
    TRANSCRIPTION_MODEL,
    WEB_SEARCH_CALL_MODEL,
    WEB_SEARCH_MAX_QUERY_CHARACTERS,
    WEB_SEARCH_MAX_USES,
    WEB_SEARCH_MODEL_ID,
    WEB_SEARCH_SECOND_MODEL_ID,
    WEB_SEARCH_SECOND_TOOL,
    WEB_SEARCH_TOOL,
    image_usage,
    transcription_seconds,
)
from .proxy_common import (
    ANTHROPIC_VERSION,
    budget_refusal,
    error_response,
    log_upstream_refusal,
    record_usage_row,
    upstream_timeout,
)
from .service import (
    DesktopModel,
    DesktopProvider,
    SpokenApi,
    Usage,
    model_by_id,
    provider_api_key,
    provider_base_url,
    usage_from_answer,
)

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)


def _catalogued(model_id: str) -> DesktopModel:
    model = model_by_id(model_id)
    if model is None:  # pragma: no cover - a catalogue mistake, caught at boot
        raise RuntimeError(f"{model_id} is not in the catalogue")
    return model


WEB_SEARCH_MODEL = _catalogued(WEB_SEARCH_MODEL_ID)
WEB_SEARCH_SECOND_MODEL = _catalogued(WEB_SEARCH_SECOND_MODEL_ID)

WEB_SEARCH_INSTRUCTIONS = (
    "Search the web for the query. Answer in a few plain sentences, and "
    "cite the pages the answer rests on. Say when nothing useful was found."
)

IMAGE_SIZES = frozenset({"auto", "1024x1024", "1536x1024", "1024x1536"})
IMAGE_QUALITIES = frozenset({"auto", "low", "medium", "high"})
#: What "auto" is sent as. GPT Image 2.5 adds `xhigh` and `max`, and left
#: to choose it may pick one of them; a picture nobody asked to be dear
#: is drawn at medium.
IMAGE_DEFAULT_QUALITY = "medium"
IMAGE_REFERENCE_MIME_TYPES = frozenset({"image/png", "image/jpeg", "image/webp"})
REFUSAL_PREVIEW = 1000


# --- shared -----------------------------------------------------------------


def _json_object(raw: bytes) -> dict[str, Any] | JSONResponse:
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return error_response("invalid_request_error", "The body is not JSON.", 400)
    if not isinstance(payload, dict):
        return error_response(
            "invalid_request_error", "The body must be an object.", 400
        )
    return payload


async def _gate(
    session: AsyncSession,
    caller: ProxyCaller,
    what: str,
    provider: DesktopProvider = DesktopProvider.openai,
) -> JSONResponse | None:
    """The two refusals every door makes before calling anyone. The
    provider's own key, not Bedrock: Bedrock serves no web search."""
    if not provider_api_key(provider):
        return error_response(
            "api_error", f"The {what} service is not configured.", 503
        )
    return await budget_refusal(session, caller.user)


async def _record(
    request: Request,
    session: AsyncSession,
    caller: ProxyCaller,
    model: DesktopModel,
    usage: Usage,
    status: int,
    what: str,
) -> None:
    try:
        await record_usage_row(request, session, caller, model, usage, status)
    except Exception:  # a lost usage row must not swallow the answer
        log.exception(f"desktop.{what}.usage_not_recorded")


def _refusal(model: DesktopModel, upstream: httpx.Response) -> Response:
    """The provider's refusal, handed back as it came and written down. A
    provider's 401 refuses our key, not the caller: it goes back as 502,
    because a 401 from this server means the caller's sign-in is over and
    the apps sign out on it (28 October 2026)."""
    log_upstream_refusal(model, upstream.status_code, upstream.content)
    status = 502 if upstream.status_code == 401 else upstream.status_code
    try:
        return JSONResponse(json.loads(upstream.content), status_code=status)
    except ValueError:
        return error_response(
            "api_error", upstream.content.decode(errors="replace")[:500], status
        )


def _openai_headers() -> dict[str, str]:
    return {"authorization": f"Bearer {provider_api_key(DesktopProvider.openai)}"}


def _openai_url(path: str) -> str:
    return f"{provider_base_url(DesktopProvider.openai)}/v1{path}"


# --- web search -------------------------------------------------------------


def web_search_answer(payload: Any) -> dict[str, Any]:
    """What the agent's `web_search` tool wants — an answer and the pages
    it rests on — read out of one Messages answer that carried Claude's
    `web_search` tool.

    The answer is the text. The pages are its `web_search_result_location`
    citations, each with the sentence it quotes, and after them every
    other page the searches returned (`web_search_tool_result`), with its
    title and no text, so the agent can still fetch it. `searches` is how
    many searches ran (`usage.server_tool_use.web_search_requests`, else
    the `server_tool_use` blocks), which is what Anthropic charges for over
    the tokens. A search that failed answers with an error object in place
    of its results; its code comes back as `error`.
    """
    parts: list[str] = []
    documents: list[dict[str, str]] = []
    seen: set[str] = set()
    returned: list[tuple[str, str]] = []
    asked = 0
    error: str | None = None
    content = payload.get("content") if isinstance(payload, dict) else None
    for block in content if isinstance(content, list) else []:
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "server_tool_use" and block.get("name") == "web_search":
            asked += 1
        elif kind == "web_search_tool_result":
            results = block.get("content")
            if isinstance(results, dict):
                code = results.get("error_code")
                error = code if isinstance(code, str) and code else "unavailable"
                continue
            for result in results if isinstance(results, list) else []:
                url = result.get("url") if isinstance(result, dict) else None
                if isinstance(url, str) and url:
                    title = result.get("title")
                    returned.append((url, title if isinstance(title, str) else ""))
        elif kind == "text":
            text = block.get("text")
            if not isinstance(text, str):
                continue
            parts.append(text)
            for citation in block.get("citations") or []:
                if (
                    not isinstance(citation, dict)
                    or citation.get("type") != "web_search_result_location"
                ):
                    continue
                url = citation.get("url")
                if not isinstance(url, str) or not url or url in seen:
                    continue
                seen.add(url)
                title, cited = citation.get("title"), citation.get("cited_text")
                documents.append(
                    {
                        "url": url,
                        "title": title if isinstance(title, str) else "",
                        "text": cited.strip() if isinstance(cited, str) else "",
                    }
                )
    for url, title in returned:
        if url not in seen:
            seen.add(url)
            documents.append({"url": url, "title": title, "text": ""})
    usage = payload.get("usage") if isinstance(payload, dict) else None
    server = usage.get("server_tool_use") if isinstance(usage, dict) else None
    counted = server.get("web_search_requests") if isinstance(server, dict) else None
    searches = counted if isinstance(counted, int) and counted >= 0 else asked
    answer: dict[str, Any] = {
        "answer": "".join(parts).strip(),
        "documents": documents,
        "searches": searches,
    }
    if error is not None:
        answer["error"] = error
    return answer


def _search_body(model: DesktopModel, tool: str, query: str) -> dict[str, Any]:
    return {
        "model": model.model_id,
        "max_tokens": 4096,
        "system": WEB_SEARCH_INSTRUCTIONS,
        "messages": [{"role": "user", "content": query}],
        "tools": [
            {"type": tool, "name": "web_search", "max_uses": WEB_SEARCH_MAX_USES}
        ],
        "output_config": {"effort": "low"},
    }


@router.post("/api/proxy/v1/web/search", name="desktop:web_search", response_model=None)
async def web_search(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """One search of the web, as the agent's tool asks for it:
    `{query}` in, `{answer, documents[{url, title, text}]}` out.

    Claude's server-side `web_search` tool does the searching, on the
    cheap model, in one non-streaming `/v1/messages` call; a 400 from the
    cheap model is asked once more on Claude Sonnet 5.5. Always on the
    Anthropic key, even when Claude otherwise goes through Bedrock, which
    serves no web search. Two usage rows come out of it: the tokens on the
    reading model's own row, and the searches made on
    `WEB_SEARCH_CALL_MODEL`'s, because Anthropic bills the two separately
    and a single row could count only one of them. Until 18 October 2026
    this was OpenAI's hosted search, and it stopped when the OpenAI
    account ran out of money.
    """
    payload = _json_object(await request.body())
    if isinstance(payload, JSONResponse):
        return payload
    query = payload.get("query")
    if not isinstance(query, str) or not query.strip():
        return error_response(
            "invalid_request_error", "There is nothing to search for.", 400
        )
    if len(query) > WEB_SEARCH_MAX_QUERY_CHARACTERS:
        return error_response(
            "invalid_request_error",
            f"That is longer than {WEB_SEARCH_MAX_QUERY_CHARACTERS} characters.",
            400,
        )
    refused = await _gate(session, caller, "search", DesktopProvider.anthropic)
    if refused is not None:
        return refused

    url = f"{provider_base_url(DesktopProvider.anthropic)}/v1/messages"
    headers = {
        "x-api-key": provider_api_key(DesktopProvider.anthropic),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    tries = (
        (WEB_SEARCH_MODEL, WEB_SEARCH_TOOL),
        (WEB_SEARCH_SECOND_MODEL, WEB_SEARCH_SECOND_TOOL),
    )
    async with httpx.AsyncClient(timeout=upstream_timeout()) as client:
        for index, (model, tool) in enumerate(tries):
            try:
                upstream = await client.post(
                    url, headers=headers, json=_search_body(model, tool, query.strip())
                )
            except httpx.HTTPError as error:
                log.warning("desktop.search.upstream_unreachable", error=str(error))
                return error_response(
                    "api_error", "The search service could not be reached.", 502
                )
            if upstream.status_code == 200:
                break
            await _record(
                request, session, caller, model, Usage(), upstream.status_code, "search"
            )
            if upstream.status_code == 400 and index + 1 < len(tries):
                # Refused as asked (the cheap model and its tool): written down,
                # then asked of the next.
                log_upstream_refusal(model, upstream.status_code, upstream.content)
                continue
            return _refusal(model, upstream)

    try:
        answer = upstream.json()
    except ValueError:
        answer = None
    result = web_search_answer(answer)
    await _record(
        request,
        session,
        caller,
        model,
        usage_from_answer(SpokenApi.anthropic_messages, answer),
        200,
        "search",
    )
    if result["searches"] > 0:
        await _record(
            request,
            session,
            caller,
            WEB_SEARCH_CALL_MODEL,
            Usage(input_tokens=result["searches"]),
            200,
            "search",
        )
    failed = result.pop("error", None)
    if failed is not None:
        log.warning("desktop.search.failed", model=model.model_id, error=failed)
        if not result["answer"] and not result["documents"]:
            return error_response(
                "api_error",
                f"The web search failed ({failed}); try again in a moment.",
                502,
            )
    return JSONResponse(result, headers={"cache-control": "no-store"})


# --- pictures ---------------------------------------------------------------


def _reference_images(value: Any) -> list[tuple[bytes, str]] | JSONResponse:
    if value is None:
        return []
    if not isinstance(value, list):
        return error_response(
            "invalid_request_error", "reference_images must be a list.", 400
        )
    if len(value) > IMAGE_MAX_REFERENCE_IMAGES:
        return error_response(
            "invalid_request_error",
            f"At most {IMAGE_MAX_REFERENCE_IMAGES} reference images.",
            400,
        )
    images: list[tuple[bytes, str]] = []
    for one in value:
        data = one.get("data") if isinstance(one, dict) else None
        mime = one.get("mime_type") if isinstance(one, dict) else None
        if not isinstance(data, str) or mime not in IMAGE_REFERENCE_MIME_TYPES:
            return error_response(
                "invalid_request_error",
                "Each reference image is {data: base64, mime_type: image/png|jpeg|webp}.",
                400,
            )
        try:
            raw = base64.b64decode(data, validate=True)
        except ValueError:
            return error_response(
                "invalid_request_error", "A reference image is not base64.", 400
            )
        if not raw or len(raw) > IMAGE_MAX_REFERENCE_BYTES:
            return error_response(
                "invalid_request_error", "A reference image is empty or too large.", 400
            )
        images.append((raw, mime))
    return images


async def _draw(
    client: httpx.AsyncClient,
    model: DesktopModel,
    fields: dict[str, Any],
    references: list[tuple[bytes, str]],
) -> httpx.Response:
    """One call to OpenAI's image API on `model`: `/images/edits` as
    multipart when there are reference images, `/images/generations`
    otherwise."""
    body = {"model": model.model_id, **fields}
    if references:
        return await client.post(
            _openai_url("/images/edits"),
            headers=_openai_headers(),
            data={key: str(value) for key, value in body.items()},
            files=[
                (
                    "image[]",
                    (f"reference-{index}.{mime.split('/')[1]}", raw, mime),
                )
                for index, (raw, mime) in enumerate(references)
            ],
        )
    return await client.post(
        _openai_url("/images/generations"), headers=_openai_headers(), json=body
    )


def _model_unavailable(upstream: httpx.Response) -> bool:
    """Whether OpenAI refused the model itself for this account (not
    found, or not allowed), as opposed to the picture asked for. A
    refused description keeps its refusal; only this falls back."""
    if upstream.status_code in (403, 404):
        return True
    if upstream.status_code != 400:
        return False
    try:
        error = json.loads(upstream.content).get("error")
    except (ValueError, AttributeError):
        return False
    return isinstance(error, dict) and (
        error.get("code") == "model_not_found" or error.get("param") == "model"
    )


@router.post(
    "/api/proxy/v1/images/generations",
    name="desktop:images",
    response_model=None,
)
async def images_generations(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """One picture from a description: synchronous, OpenAI's own shape, one route.

    `{prompt, size?, quality?, reference_images?}` in; `{data: [{b64_json,
    mime_type}], usage}` out. With no reference the call is
    `/v1/images/generations` on `IMAGE_MODEL`; with one or more it is
    `/v1/images/edits` on `IMAGE_EDIT_MODEL`, reading pictures as well as
    words. "auto" quality is sent as `IMAGE_DEFAULT_QUALITY`. When OpenAI
    will not serve the model to this account, the call is made once more
    on `LEGACY_IMAGE_MODEL`. Metered from the usage OpenAI reports, at
    the picture's own output price, under the model that drew it.
    """
    payload = _json_object(await request.body())
    if isinstance(payload, JSONResponse):
        return payload
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return error_response("invalid_request_error", "There is nothing to draw.", 400)
    if len(prompt) > IMAGE_MAX_PROMPT_CHARACTERS:
        return error_response(
            "invalid_request_error",
            f"That is longer than {IMAGE_MAX_PROMPT_CHARACTERS} characters.",
            400,
        )
    size = payload.get("size") or "auto"
    quality = payload.get("quality") or "auto"
    if size not in IMAGE_SIZES or quality not in IMAGE_QUALITIES:
        return error_response(
            "invalid_request_error",
            f"size is one of {sorted(IMAGE_SIZES)}; quality one of {sorted(IMAGE_QUALITIES)}.",
            400,
        )
    references = _reference_images(payload.get("reference_images"))
    if isinstance(references, JSONResponse):
        return references
    refused = await _gate(session, caller, "image")
    if refused is not None:
        return refused

    model = IMAGE_EDIT_MODEL if references else IMAGE_MODEL
    fields = {
        "prompt": prompt.strip(),
        "n": 1,
        "size": size,
        "quality": IMAGE_DEFAULT_QUALITY if quality == "auto" else quality,
    }
    async with httpx.AsyncClient(timeout=upstream_timeout()) as client:
        try:
            upstream = await _draw(client, model, fields, references)
            if _model_unavailable(upstream):
                # This account is not served the new model (yet): the
                # picture is drawn on the one before rather than not at all.
                log.warning(
                    "desktop.images.model_unavailable",
                    model=model.model_id,
                    status=upstream.status_code,
                    fallback=LEGACY_IMAGE_MODEL.model_id,
                )
                model = LEGACY_IMAGE_MODEL
                upstream = await _draw(client, model, fields, references)
        except httpx.HTTPError as error:
            log.warning("desktop.images.upstream_unreachable", error=str(error))
            return error_response(
                "api_error", "The image service could not be reached.", 502
            )

    if upstream.status_code != 200:
        await _record(
            request,
            session,
            caller,
            model,
            Usage(),
            upstream.status_code,
            "images",
        )
        return _refusal(model, upstream)

    try:
        answer = upstream.json()
    except ValueError:
        answer = {}
    usage = image_usage(
        answer.get("usage") if isinstance(answer, dict) else None, model
    )
    if usage == Usage():
        log.warning("desktop.images.usage_missing", model=model.model_id)
    await _record(request, session, caller, model, usage, 200, "images")

    data = answer.get("data") if isinstance(answer, dict) else None
    pictures = [
        {"b64_json": one["b64_json"], "mime_type": "image/png"}
        for one in (data if isinstance(data, list) else [])
        if isinstance(one, dict) and isinstance(one.get("b64_json"), str)
    ]
    if not pictures:
        log_upstream_refusal(model, 200, upstream.content[:REFUSAL_PREVIEW])
        return error_response(
            "api_error", "The image service returned no picture.", 502
        )
    return JSONResponse(
        {
            "data": pictures,
            "usage": answer.get("usage") if isinstance(answer, dict) else None,
        },
        headers={"cache-control": "no-store"},
    )


# --- dictation --------------------------------------------------------------


@router.post(
    "/api/proxy/v1/audio/transcriptions",
    name="desktop:transcriptions",
    response_model=None,
)
async def audio_transcriptions(
    request: Request,
    file: Annotated[UploadFile, File()],
    language: Annotated[str | None, Form()] = None,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """What was said, as text. OpenAI's own multipart shape in — `file`,
    and `language` when the app sends one (it sends none since 24 September
    2026, `simeon-transcribe.ts`, so OpenAI detects the language; a
    `en-US` still becomes the two letters OpenAI takes) — and
    `{text, seconds}` out.

    Metered by the seconds OpenAI reports having heard, which is what it
    charges for; one second when it reports nothing, because audio was
    sent and a zero here would be a lie.
    """
    audio = await file.read()
    if not audio:
        return error_response(
            "invalid_request_error", "Cannot transcribe empty audio.", 400
        )
    if len(audio) > TRANSCRIPTION_MAX_BYTES:
        return error_response(
            "invalid_request_error",
            f"That is larger than {TRANSCRIPTION_MAX_BYTES // (1024 * 1024)} MB.",
            413,
        )
    refused = await _gate(session, caller, "transcription")
    if refused is not None:
        return refused

    fields = {"model": TRANSCRIPTION_MODEL.model_id, "response_format": "json"}
    tag = (language or "").strip().split("-")[0].lower()
    if len(tag) == 2 and tag.isalpha():
        fields["language"] = tag
    mime = (file.content_type or "audio/webm").split(";")[0].strip()
    filename = file.filename or f"audio.{mime.split('/')[-1]}"
    async with httpx.AsyncClient(timeout=upstream_timeout()) as client:
        try:
            upstream = await client.post(
                _openai_url("/audio/transcriptions"),
                headers=_openai_headers(),
                data=fields,
                files={"file": (filename, audio, mime)},
            )
        except httpx.HTTPError as error:
            log.warning("desktop.transcription.upstream_unreachable", error=str(error))
            return error_response(
                "api_error", "The transcription service could not be reached.", 502
            )

    if upstream.status_code != 200:
        await _record(
            request,
            session,
            caller,
            TRANSCRIPTION_MODEL,
            Usage(),
            upstream.status_code,
            "transcription",
        )
        return _refusal(TRANSCRIPTION_MODEL, upstream)

    try:
        answer = upstream.json()
    except ValueError:
        answer = {}
    seconds = transcription_seconds(answer)
    await _record(
        request,
        session,
        caller,
        TRANSCRIPTION_MODEL,
        Usage(input_tokens=seconds),
        200,
        "transcription",
    )
    text = answer.get("text") if isinstance(answer, dict) else None
    return JSONResponse(
        {"text": text if isinstance(text, str) else "", "seconds": seconds},
        headers={"cache-control": "no-store"},
    )
