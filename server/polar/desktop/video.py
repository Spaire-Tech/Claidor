"""Watching a video: what the Gemini door parses before `_proxy` runs.

The desktop app's watchVideo / videoReview subagents speak Gemini's own
wire, `POST /v1beta/models/{model}:streamGenerateContent?alt=sse` (and
`:generateContent` for one answer), with the video inline as
`inlineData {mimeType, data}` and its frame rate as `videoMetadata {fps}`
(`desktop/source/host/extensions/inference/gemini-direct-generate.ts`).
Simeon Labs' server serves that path under `/desktop/api/proxy/v1beta/`
(`polar.desktop.endpoints.proxy_gemini_generate`), injects the key and
meters the answer like every other model call. This module holds the two
pure pieces of that route, so they can be tested without a request: the
`{model}:{method}` path segment, and a count of the video parts in a body
for the log line.

Imports nothing from `endpoints`, which includes the route, so there is
no cycle.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

#: Gemini's two ways of answering. The stream is what the app speaks; the
#: single answer is kept because it costs nothing and a test of the
#: metering is simplest on it.
GEMINI_GENERATE_METHODS = frozenset({"generateContent", "streamGenerateContent"})
GEMINI_STREAM_METHOD = "streamGenerateContent"

#: The one line to read when a video turn goes wrong: which model, how
#: many video parts, at what frame rate, and whether it streamed.
VIDEO_CALL_LOG = "desktop.video.generate"


@dataclass(frozen=True)
class GeminiCall:
    """One `{model}:{method}` path segment, taken apart."""

    model_id: str
    method: str

    @property
    def stream(self) -> bool:
        return self.method == GEMINI_STREAM_METHOD

    @property
    def upstream_path(self) -> str:
        return f"/v1beta/models/{self.model_id}:{self.method}"


def parse_gemini_call(segment: str) -> GeminiCall | None:
    """`gemini-2.5-flash:streamGenerateContent` → the model and the
    method, or None when the segment is not one of Gemini's two calls.
    A missing colon, an empty model or an unknown method all read as
    "not a Gemini call" rather than as a guess."""
    model_id, colon, method = segment.partition(":")
    model_id = model_id.strip()
    if not colon or not model_id or method not in GEMINI_GENERATE_METHODS:
        return None
    return GeminiCall(model_id=model_id, method=method)


@dataclass(frozen=True)
class VideoParts:
    """What a Gemini body carries for the log: how many inline videos,
    how many by file URI, and the frame rates asked for."""

    inline: int = 0
    file_uri: int = 0
    fps: tuple[float, ...] = ()
    inline_bytes: int = 0


def _mime(part: dict[str, Any], key: str) -> str:
    data = part.get(key)
    if not isinstance(data, dict):
        return ""
    mime = data.get("mimeType") or data.get("mime_type")
    return mime if isinstance(mime, str) else ""


def count_video_parts(payload: Any) -> VideoParts:
    """Read a `generateContent` body for its video parts, in either
    spelling of the field names. Base64 is three quarters data, so the
    inline byte count is the decoded size, near enough for a log line."""
    if not isinstance(payload, dict):
        return VideoParts()
    contents = payload.get("contents")
    if not isinstance(contents, list):
        return VideoParts()
    inline = file_uri = inline_bytes = 0
    fps: list[float] = []
    for content in contents:
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            is_video = False
            for key in ("inlineData", "inline_data"):
                if _mime(part, key).startswith("video/"):
                    is_video = True
                    inline += 1
                    data = part[key].get("data")
                    if isinstance(data, str):
                        inline_bytes += len(data) * 3 // 4
            for key in ("fileData", "file_data"):
                if _mime(part, key).startswith("video/"):
                    is_video = True
                    file_uri += 1
            if not is_video:
                continue
            metadata = part.get("videoMetadata") or part.get("video_metadata")
            if isinstance(metadata, dict):
                rate = metadata.get("fps")
                if isinstance(rate, int | float):
                    fps.append(float(rate))
    return VideoParts(
        inline=inline, file_uri=file_uri, fps=tuple(fps), inline_bytes=inline_bytes
    )


__all__ = [
    "GEMINI_GENERATE_METHODS",
    "GEMINI_STREAM_METHOD",
    "VIDEO_CALL_LOG",
    "GeminiCall",
    "VideoParts",
    "count_video_parts",
    "parse_gemini_call",
]
