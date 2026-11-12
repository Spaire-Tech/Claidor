import base64
import binascii
import functools
import json
import re

import dramatiq
import structlog
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from simeon.logging import Logger, generate_correlation_id
from simeon.worker import JobQueueManager


class LogCorrelationIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        structlog.contextvars.bind_contextvars(
            correlation_id=generate_correlation_id(),
            method=scope["method"],
            path=scope["path"],
        )

        await self.app(scope, receive, send)

        structlog.contextvars.unbind_contextvars("correlation_id", "method", "path")


class FlushEnqueuedWorkerJobsMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        async with JobQueueManager.open(dramatiq.get_broker(), scope["state"]["redis"]):
            await self.app(scope, receive, send)


class PathRewriteMiddleware:
    def __init__(
        self, app: ASGIApp, pattern: str | re.Pattern[str], replacement: str
    ) -> None:
        self.app = app
        self.pattern = pattern
        self.replacement = replacement
        self.logger: Logger = structlog.get_logger()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        scope["path"], replacements = re.subn(
            self.pattern, self.replacement, scope["path"]
        )

        if replacements > 0:
            self.logger.warning(
                "PathRewriteMiddleware",
                pattern=self.pattern,
                replacement=self.replacement,
                path=scope["path"],
            )

        send = functools.partial(self.send, send=send, replacements=replacements)
        await self.app(scope, receive, send)

    async def send(self, message: Message, send: Send, replacements: int) -> None:
        if message["type"] != "http.response.start":
            await send(message)
            return

        message.setdefault("headers", [])
        headers = MutableHeaders(scope=message)
        if replacements > 0:
            headers["X-Polar-Deprecation-Notice"] = (
                "The API root has moved from /api/v1 to /v1. "
                "Please update your integration."
            )

        await send(message)


class SandboxResponseHeaderMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                headers = MutableHeaders(scope=message)
                headers["X-Polar-Sandbox"] = "1"
            await send(message)

        await self.app(scope, receive, send_wrapper)


#: The header an app sets on a request whose body it sent encoded, and its
#: one value (`EncodedBodyMiddleware`).
ENCODED_BODY_HEADER = b"x-simeon-body"
ENCODED_BODY_BASE64 = b"base64"
#: The body's own content type, which the encoded request carries as
#: `text/plain` so the edge reads it as text.
ENCODED_CONTENT_TYPE_HEADER = b"x-simeon-content-type"
#: The most an encoded body may be before it is decoded; the apps encode up
#: to 1 MB of body, which is a little over 1.3 MB encoded.
ENCODED_BODY_LIMIT = 16 << 20


class EncodedBodyMiddleware:
    """A request body sent in base64, decoded before any route reads it (12
    November 2026). Render's edge firewall reads the start of every body and
    answers its own 403 page "Blocked" when it sees what looks like an attack,
    before the request reaches this server. A person's message with shell
    commands in it was refused that way on every try, while a short one went
    (measured from the founder's Mac: the message itself 403, "hello" 405, the
    message in base64 405). The engine's model calls get round it gzipped
    (`provider-session.ts`, `desktop/endpoints.py` `gunzipped_body`); the apps
    send theirs in base64 with `x-simeon-body: base64` and the body's own
    type in `x-simeon-content-type`, and every route, the computer's proxy
    included, sees the body as written. A body that is not base64 is refused
    with 400; a request without the header passes as it is."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers: list[tuple[bytes, bytes]] = list(scope.get("headers") or [])
        marker = next(
            (value for name, value in headers if name.lower() == ENCODED_BODY_HEADER),
            None,
        )
        if marker is None:
            return await self.app(scope, receive, send)
        if marker.strip().lower() != ENCODED_BODY_BASE64:
            return await _refuse(send, 400, "x-simeon-body must be base64.")
        encoded = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            encoded.extend(message.get("body", b""))
            if len(encoded) > ENCODED_BODY_LIMIT:
                return await _refuse(send, 413, "The encoded body is too large.")
            if not message.get("more_body", False):
                break
        try:
            body = base64.b64decode(bytes(encoded), validate=False)
        except (binascii.Error, ValueError):
            return await _refuse(send, 400, "The body is not base64.")
        content_type = next(
            (
                value
                for name, value in headers
                if name.lower() == ENCODED_CONTENT_TYPE_HEADER
            ),
            b"application/json",
        )
        dropped = {
            ENCODED_BODY_HEADER,
            ENCODED_CONTENT_TYPE_HEADER,
            b"content-type",
            b"content-length",
            b"transfer-encoding",
        }
        scope = {
            **scope,
            "headers": [(n, v) for n, v in headers if n.lower() not in dropped]
            + [
                (b"content-type", content_type),
                (b"content-length", str(len(body)).encode()),
            ],
        }
        delivered = False

        async def decoded() -> Message:
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, decoded, send)


async def _refuse(send: Send, status: int, message: str) -> None:
    payload = json.dumps({"error": {"message": message}}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})
