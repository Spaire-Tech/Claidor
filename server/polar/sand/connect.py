"""Connect RPC, served from FastAPI (25 September 2026).

The app in `desktop/` talks to Cursor's server in two shapes. The routes
under `/sand/*` are plain JSON. Everything else is Connect RPC, built by
`createSandBackendTransport` in
`desktop/source/shared/node/cursor-backend/cursor-inference.ts` with
`createConnectTransport({ httpVersion: "1.1" })` and the default JSON
codec. On the wire that is:

- unary: `POST /{package}.{Service}/{Method}`, `content-type:
  application/json`, the request message as protobuf JSON (lowerCamelCase
  names; int64 as strings; bytes as base64; enums as names), and a 200
  with the response message as protobuf JSON;
- an error: a non-200 status with `{"code": "<connect code>", "message":
  "…", "details": [...]}`;
- server streaming: `content-type: application/connect+json`, each
  message an envelope of one flags byte, a 4-byte big-endian length and
  the JSON; the last envelope has flags `0x02` and carries `{}` or
  `{"error": {...}}`.

This module is the one place that knows those rules. A feature module
declares a service with `ConnectService("aiserver.v1.GrokBotService")`
and decorates handlers with `@service.unary("EnsureSandBox")` or
`@service.stream("WatchSandBoxMigration")`; the handler takes the
decoded JSON body and the caller's session and returns a JSON object
(or, for a stream, an async iterator of them). Nothing here parses the
generated protos: the app decodes protobuf JSON leniently (`fromJson`
accepts both the proto and the JSON names and ignores nothing it does
not know), so handlers write the field names as the generated
`*_pb.ts` files spell them in JSON.

Anything the app asks for that no module serves gets a proper
`unimplemented` from the catch-all at the bottom, which is what a
Connect client expects, instead of the API's 404 page.
"""

from __future__ import annotations

import json
import struct
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, Literal

from fastapi import Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from polar.desktop.auth import get_desktop_or_box_session, get_desktop_session
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

ConnectCode = Literal[
    "canceled",
    "unknown",
    "invalid_argument",
    "deadline_exceeded",
    "not_found",
    "already_exists",
    "permission_denied",
    "resource_exhausted",
    "failed_precondition",
    "aborted",
    "out_of_range",
    "unimplemented",
    "internal",
    "unavailable",
    "data_loss",
    "unauthenticated",
]

#: The Connect protocol's mapping of error codes to HTTP statuses.
HTTP_STATUS_OF_CODE: dict[str, int] = {
    "canceled": 408,
    "unknown": 500,
    "invalid_argument": 400,
    "deadline_exceeded": 408,
    "not_found": 404,
    "already_exists": 409,
    "permission_denied": 403,
    "resource_exhausted": 429,
    "failed_precondition": 412,
    "aborted": 409,
    "out_of_range": 400,
    "unimplemented": 404,
    "internal": 500,
    "unavailable": 503,
    "data_loss": 500,
    "unauthenticated": 401,
}


class ConnectError(Exception):
    """An error answered in Connect's shape. `details` are Connect
    `ErrorDetail`s (`{"type": "...", "value": "<base64>"}`) when a caller
    reads them; `headers` are extra response headers (the app reads
    `x-automation-failure-hint` and `retry-after` on `EnsureSandBox`)."""

    def __init__(
        self,
        code: ConnectCode,
        message: str,
        *,
        details: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or []
        self.headers = headers or {}

    def body(self) -> dict[str, Any]:
        body: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            body["details"] = self.details
        return body

    def response(self) -> JSONResponse:
        return JSONResponse(
            status_code=HTTP_STATUS_OF_CODE[self.code],
            content=self.body(),
            headers=self.headers,
        )


Auth = Literal["desktop", "desktop-or-box", "none"]

UnaryHandler = Callable[
    ["ConnectCall"], Awaitable[dict[str, Any]]
]
StreamHandler = Callable[["ConnectCall"], AsyncIterator[dict[str, Any]]]


class ConnectCall:
    """What a handler gets: the decoded request, the caller (None for an
    unauthenticated method), the database session and the raw request."""

    def __init__(
        self,
        *,
        message: dict[str, Any],
        session: DesktopSession | None,
        db: AsyncSession,
        request: Request,
    ) -> None:
        self.message = message
        self.session = session
        self.db = db
        self.request = request

    @property
    def caller(self) -> DesktopSession:
        if self.session is None:
            raise ConnectError("unauthenticated", "Sign in to the app first.")
        return self.session


def _frame(flags: int, payload: dict[str, Any]) -> bytes:
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return struct.pack(">BI", flags, len(data)) + data


def encode_stream_frames(
    messages: list[dict[str, Any]], error: ConnectError | None = None
) -> bytes:
    """The whole body of a server stream, for tests and for callers that
    buffer: every message frame, then the end-of-stream frame."""
    body = b"".join(_frame(0x00, message) for message in messages)
    end: dict[str, Any] = {} if error is None else {"error": error.body()}
    return body + _frame(0x02, end)


def decode_stream_frames(body: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """The inverse, for tests: the messages and the end-of-stream payload."""
    messages: list[dict[str, Any]] = []
    end: dict[str, Any] = {}
    offset = 0
    while offset + 5 <= len(body):
        flags, length = struct.unpack(">BI", body[offset : offset + 5])
        payload = json.loads(body[offset + 5 : offset + 5 + length] or b"{}")
        offset += 5 + length
        if flags & 0x02:
            end = payload
        else:
            messages.append(payload)
    return messages, end


async def _read_message(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if not raw:
        return {}
    try:
        decoded = json.loads(raw)
    except ValueError as error:
        raise ConnectError("invalid_argument", f"The request body is not JSON: {error}")
    if decoded is None:
        return {}
    if not isinstance(decoded, dict):
        raise ConnectError("invalid_argument", "The request body must be a JSON object.")
    return decoded


async def _caller(
    auth: Auth, request: Request, db: AsyncSession
) -> DesktopSession | None:
    try:
        if auth == "desktop":
            return await get_desktop_session(request, db)
        if auth == "desktop-or-box":
            return await get_desktop_or_box_session(request, db)
    except Exception as error:  # DesktopUnauthenticated, in Connect's shape
        message = getattr(error, "message", None) or str(error) or "Sign in to the app first."
        raise ConnectError("unauthenticated", message)
    return None


class ConnectService:
    """One Connect service, mounted at `/{name}/{Method}` on the root of
    the API host, the way the app builds every URL."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)
        self.methods: dict[str, str] = {}

    def unary(self, method: str, *, auth: Auth = "desktop") -> Callable[[UnaryHandler], UnaryHandler]:
        def register(handler: UnaryHandler) -> UnaryHandler:
            path = f"/{self.name}/{method}"
            self.methods[method] = "unary"

            async def endpoint(
                request: Request, db: AsyncSession = Depends(get_db_session)
            ) -> JSONResponse:
                try:
                    session = await _caller(auth, request, db)
                    message = await _read_message(request)
                    result = await handler(
                        ConnectCall(message=message, session=session, db=db, request=request)
                    )
                except ConnectError as error:
                    return error.response()
                return JSONResponse(status_code=200, content=result)

            endpoint.__name__ = f"{self.name}_{method}"
            self.router.add_api_route(path, endpoint, methods=["POST"], response_model=None)
            return handler

        return register

    def stream(self, method: str, *, auth: Auth = "desktop") -> Callable[[StreamHandler], StreamHandler]:
        def register(handler: StreamHandler) -> StreamHandler:
            path = f"/{self.name}/{method}"
            self.methods[method] = "server-stream"

            async def endpoint(
                request: Request, db: AsyncSession = Depends(get_db_session)
            ) -> StreamingResponse | JSONResponse:
                try:
                    session = await _caller(auth, request, db)
                    message = await _read_message(request)
                except ConnectError as error:
                    # Before the first frame a stream error is still a JSON error.
                    return error.response()
                call = ConnectCall(message=message, session=session, db=db, request=request)

                async def frames() -> AsyncIterator[bytes]:
                    try:
                        async for item in handler(call):
                            yield _frame(0x00, item)
                    except ConnectError as error:
                        yield _frame(0x02, {"error": error.body()})
                        return
                    yield _frame(0x02, {})

                return StreamingResponse(frames(), media_type="application/connect+json")

            endpoint.__name__ = f"{self.name}_{method}"
            self.router.add_api_route(path, endpoint, methods=["POST"], response_model=None)
            return handler

        return register


def unimplemented_router(*packages: str) -> APIRouter:
    """A catch-all for every method of the named packages that nothing
    serves: `unimplemented`, in Connect's shape, so the app's clients read
    the code they already fall back on instead of the API's 404 page.
    Mount it after every served service."""
    router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)
    for package in packages:

        async def endpoint(service: str, method: str, package: str = package) -> JSONResponse:
            return ConnectError(
                "unimplemented",
                f"{package}.{service}/{method} is not served by Simeon Labs' server.",
            ).response()

        endpoint.__name__ = f"unimplemented_{package.replace('.', '_')}"
        router.add_api_route(
            "/" + package + ".{service}/{method}",
            endpoint,
            methods=["POST"],
            response_model=None,
        )
    return router
