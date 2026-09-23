"""The agent's other three calls: web search, pictures, dictation.

The desktop agent advertises four tools that are not a model turn. Until
19 September 2026 all four were Connect RPC calls on
`aiserver.v1.AiService` — `RunWebSearch`, `RunWebFetch`,
`RunGenerateImage`, `TranscribeAudio` — which Claidor never served, so
every one of them failed the moment the app was pointed here
(`docs/product/capabilities-measured.md`). Web fetch now runs on the
person's machine and needs nothing from us. The other three need a
provider, and these are their doors: each on OpenAI with Claidor's key,
each metered in the same unit as a model turn (`pricing.py`).

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

from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .auth import ProxyCaller, get_proxy_caller
from .pricing import (
    IMAGE_MAX_PROMPT_CHARACTERS,
    IMAGE_MAX_REFERENCE_BYTES,
    IMAGE_MAX_REFERENCE_IMAGES,
    IMAGE_MODEL,
    TRANSCRIPTION_MAX_BYTES,
    TRANSCRIPTION_MODEL,
    WEB_SEARCH_CALL_MODEL,
    WEB_SEARCH_MAX_QUERY_CHARACTERS,
    WEB_SEARCH_MODEL_ID,
    image_usage,
    transcription_seconds,
)
from .proxy_common import (
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
    provider_configured,
    usage_from_answer,
)

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

_WEB_SEARCH_MODEL = model_by_id(WEB_SEARCH_MODEL_ID)
if _WEB_SEARCH_MODEL is None:  # pragma: no cover - a catalogue mistake, caught at boot
    raise RuntimeError(f"{WEB_SEARCH_MODEL_ID} is not in the catalogue")
WEB_SEARCH_MODEL: DesktopModel = _WEB_SEARCH_MODEL

WEB_SEARCH_INSTRUCTIONS = (
    "Search the web for the query. Answer in a few plain sentences, and "
    "cite the pages the answer rests on. Say when nothing useful was found."
)

IMAGE_SIZES = frozenset({"auto", "1024x1024", "1536x1024", "1024x1536"})
IMAGE_QUALITIES = frozenset({"auto", "low", "medium", "high"})
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
    session: AsyncSession, caller: ProxyCaller, what: str
) -> JSONResponse | None:
    """The two refusals every door makes before calling anyone."""
    if not provider_configured(DesktopProvider.openai):
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
    """The provider's refusal, handed back as it came and written down."""
    log_upstream_refusal(model, upstream.status_code, upstream.content)
    try:
        return JSONResponse(
            json.loads(upstream.content), status_code=upstream.status_code
        )
    except ValueError:
        return error_response(
            "api_error",
            upstream.content.decode(errors="replace")[:500],
            upstream.status_code,
        )


def _openai_headers() -> dict[str, str]:
    return {"authorization": f"Bearer {provider_api_key(DesktopProvider.openai)}"}


def _openai_url(path: str) -> str:
    return f"{provider_base_url(DesktopProvider.openai)}/v1{path}"


# --- web search -------------------------------------------------------------


def web_search_answer(payload: Any) -> dict[str, Any]:
    """What the agent's `web_search` tool wants — an answer and the pages
    it rests on — read out of one `/v1/responses` answer that carried the
    hosted `web_search` tool.

    The answer is the message text. The pages are its `url_citation`
    annotations, each with the sentence it supports as its text, and
    after them any page the search visited without citing
    (`web_search_call.action.sources`), title-less and text-less, so the
    agent can still fetch it. `searches` is how many times the tool ran,
    which is what OpenAI charges for over the tokens.
    """
    answer = ""
    documents: list[dict[str, str]] = []
    seen: set[str] = set()
    searches = 0
    uncited: list[str] = []
    output = payload.get("output") if isinstance(payload, dict) else None
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
                    uncited.append(url)
            continue
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if not isinstance(part, dict) or part.get("type") != "output_text":
                continue
            text = part.get("text")
            if not isinstance(text, str):
                continue
            answer += text
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
    for url in uncited:
        if url not in seen:
            seen.add(url)
            documents.append({"url": url, "title": "", "text": ""})
    return {"answer": answer.strip(), "documents": documents, "searches": searches}


@router.post("/api/proxy/v1/web/search", name="desktop:web_search", response_model=None)
async def web_search(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """One search of the web, as the agent's tool asks for it:
    `{query}` in, `{answer, documents[{url, title, text}]}` out.

    OpenAI's hosted `web_search` tool does the searching, on the cheap
    model, in one non-streaming `/v1/responses` call. Two usage rows come
    out of it: the tokens on the reading model's own row, and the
    searches made on `WEB_SEARCH_CALL_MODEL`'s, because OpenAI bills the
    two separately and a single row could count only one of them.
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
    refused = await _gate(session, caller, "search")
    if refused is not None:
        return refused

    body = {
        "model": WEB_SEARCH_MODEL.model_id,
        "instructions": WEB_SEARCH_INSTRUCTIONS,
        "input": query.strip(),
        "tools": [{"type": "web_search"}],
        "tool_choice": "auto",
        "include": ["web_search_call.action.sources"],
        "store": False,
    }
    async with httpx.AsyncClient(timeout=upstream_timeout()) as client:
        try:
            upstream = await client.post(
                _openai_url("/responses"), headers=_openai_headers(), json=body
            )
        except httpx.HTTPError as error:
            log.warning("desktop.search.upstream_unreachable", error=str(error))
            return error_response(
                "api_error", "The search service could not be reached.", 502
            )

    if upstream.status_code != 200:
        await _record(
            request,
            session,
            caller,
            WEB_SEARCH_MODEL,
            Usage(),
            upstream.status_code,
            "search",
        )
        return _refusal(WEB_SEARCH_MODEL, upstream)

    try:
        answer = upstream.json()
    except ValueError:
        answer = None
    result = web_search_answer(answer)
    await _record(
        request,
        session,
        caller,
        WEB_SEARCH_MODEL,
        usage_from_answer(SpokenApi.openai_responses, answer),
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
    """One picture from a description, the way `docs/product/images-state.md`
    recommended: synchronous, OpenAI's own shape, one route.

    `{prompt, size?, quality?, reference_images?}` in; `{data: [{b64_json,
    mime_type}], usage}` out. With no reference the call is
    `/v1/images/generations`; with one or more it is `/v1/images/edits`,
    which is the same model reading pictures as well as words. Metered
    from the usage OpenAI reports, at the picture's own output price.
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

    fields = {
        "model": IMAGE_MODEL.model_id,
        "prompt": prompt.strip(),
        "n": 1,
        "size": size,
        "quality": quality,
    }
    async with httpx.AsyncClient(timeout=upstream_timeout()) as client:
        try:
            if references:
                upstream = await client.post(
                    _openai_url("/images/edits"),
                    headers=_openai_headers(),
                    data={key: str(value) for key, value in fields.items()},
                    files=[
                        (
                            "image[]",
                            (f"reference-{index}.{mime.split('/')[1]}", raw, mime),
                        )
                        for index, (raw, mime) in enumerate(references)
                    ],
                )
            else:
                upstream = await client.post(
                    _openai_url("/images/generations"),
                    headers=_openai_headers(),
                    json=fields,
                )
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
            IMAGE_MODEL,
            Usage(),
            upstream.status_code,
            "images",
        )
        return _refusal(IMAGE_MODEL, upstream)

    try:
        answer = upstream.json()
    except ValueError:
        answer = {}
    usage = image_usage(answer.get("usage") if isinstance(answer, dict) else None)
    if usage == Usage():
        log.warning("desktop.images.usage_missing", model=IMAGE_MODEL.model_id)
    await _record(request, session, caller, IMAGE_MODEL, usage, 200, "images")

    data = answer.get("data") if isinstance(answer, dict) else None
    pictures = [
        {"b64_json": one["b64_json"], "mime_type": "image/png"}
        for one in (data if isinstance(data, list) else [])
        if isinstance(one, dict) and isinstance(one.get("b64_json"), str)
    ]
    if not pictures:
        log_upstream_refusal(IMAGE_MODEL, 200, upstream.content[:REFUSAL_PREVIEW])
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
    and `language` as the app sends it (`en-US`; OpenAI takes the two
    letters) — and `{text, seconds}` out.

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
