"""Masterclass Architect — public YouTube Data API v3 client.

PUBLIC reads only, authenticated by a plain API key: channel metadata, the
uploads playlist, per-video statistics, and comment threads. No OAuth, no
transcripts, no scraping — by design and by decision (see
docs/plans/masterclass-architect-plan.md: transcripts are off the launch
path).

Quota discipline: everything here is list-walking (1 unit per call/page).
The expensive `search` endpoint (100 units) is deliberately never used.
A 300-video channel costs well under 100 units of the 10,000/day default.
"""

from __future__ import annotations

import dataclasses
import re
from datetime import datetime
from urllib.parse import urlparse

import httpx

from .signals import VideoSignal

API_BASE = "https://www.googleapis.com/youtube/v3"
_CHANNEL_ID_RE = re.compile(r"UC[\w-]{22}")
_ISO_DURATION_RE = re.compile(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")

COMMENT_PAGES_PER_VIDEO = 2  # x100 comments, order=relevance


class YouTubeNotConfigured(Exception):
    """YOUTUBE_API_KEY is not set — the Architect is disabled."""


class ChannelNotFound(Exception):
    """The pasted reference doesn't resolve to a channel."""

    def __init__(self, ref: str) -> None:
        self.ref = ref
        super().__init__(f"No YouTube channel found for {ref!r}")


class YouTubeAPIError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"YouTube API error {status_code}: {detail[:300]}")


@dataclasses.dataclass
class ChannelInfo:
    """What the instant-confirmation moment needs, plus the uploads handle."""

    channel_id: str
    title: str
    handle: str
    about: str
    avatar_url: str
    created_at: str
    subscriber_count: int
    video_count: int
    uploads_playlist_id: str


@dataclasses.dataclass
class CommentThreadResult:
    video_id: str
    comments_disabled: bool
    # (text, likes) pairs, relevance-ordered as returned by the API.
    comments: list[tuple[str, int]]
    # The creator's own public replies — their voice in text.
    owner_replies: list[str]


def _iso_duration_seconds(duration: str) -> int:
    m = _ISO_DURATION_RE.fullmatch(duration or "")
    if not m:
        return 0
    days, h, mi, s = (int(g or 0) for g in m.groups())
    return days * 86400 + h * 3600 + mi * 60 + s


def parse_channel_ref(ref: str) -> tuple[str, str]:
    """Normalize a pasted link/handle/id into a lookup ("id" | "handle" |
    "username", value). Raises ChannelNotFound for unparseable input."""
    ref = ref.strip()
    if not ref:
        raise ChannelNotFound(ref)
    if ref.startswith(("http://", "https://")):
        parsed = urlparse(ref)
        if "youtu" not in (parsed.hostname or ""):
            raise ChannelNotFound(ref)
        path = parsed.path.strip("/")
        if path.startswith("channel/"):
            candidate = path.split("/")[1]
            if _CHANNEL_ID_RE.fullmatch(candidate):
                return "id", candidate
            raise ChannelNotFound(ref)
        if path.startswith("@"):
            return "handle", path.split("/")[0]
        if path.startswith("user/"):
            return "username", path.split("/")[1]
        raise ChannelNotFound(ref)
    if _CHANNEL_ID_RE.fullmatch(ref):
        return "id", ref
    handle = ref if ref.startswith("@") else f"@{ref}"
    return "handle", handle


class YouTubeReader:
    """Thin async wrapper over the public API. One instance per operation;
    callers own the httpx.AsyncClient lifecycle via `async with`."""

    def __init__(self, api_key: str | None = None) -> None:
        if api_key is None:
            # Imported lazily so this module stays import-light (same
            # precedent as course_assistant/ai.py): the client can be
            # exercised in tests without booting the app's settings stack.
            from polar.config import settings

            api_key = settings.YOUTUBE_API_KEY
        key = api_key
        if not key:
            raise YouTubeNotConfigured()
        self._key = key
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> YouTubeReader:
        self._client = httpx.AsyncClient(base_url=API_BASE, timeout=30.0)
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _get(self, endpoint: str, **params: str) -> dict:
        assert self._client is not None, "use `async with YouTubeReader()`"
        response = await self._client.get(
            f"/{endpoint}", params={**params, "key": self._key}
        )
        if response.status_code != 200:
            raise YouTubeAPIError(response.status_code, response.text)
        return response.json()

    async def resolve_channel(self, ref: str) -> ChannelInfo:
        kind, value = parse_channel_ref(ref)
        lookup = {"id": "id", "handle": "forHandle", "username": "forUsername"}[kind]
        data = await self._get(
            "channels",
            part="snippet,statistics,contentDetails",
            **{lookup: value},
        )
        items = data.get("items") or []
        if not items:
            raise ChannelNotFound(ref)
        item = items[0]
        snippet, stats = item["snippet"], item.get("statistics", {})
        return ChannelInfo(
            channel_id=item["id"],
            title=snippet["title"],
            handle=snippet.get("customUrl", ""),
            about=snippet.get("description", ""),
            avatar_url=(snippet.get("thumbnails", {}).get("high") or {}).get("url", ""),
            created_at=snippet.get("publishedAt", ""),
            subscriber_count=int(stats.get("subscriberCount", 0)),
            video_count=int(stats.get("videoCount", 0)),
            uploads_playlist_id=item["contentDetails"]["relatedPlaylists"]["uploads"],
        )

    async def list_upload_ids(
        self, uploads_playlist_id: str, *, max_videos: int = 2000
    ) -> list[str]:
        ids: list[str] = []
        page_token = ""
        while len(ids) < max_videos:
            params = {
                "part": "contentDetails",
                "playlistId": uploads_playlist_id,
                "maxResults": "50",
            }
            if page_token:
                params["pageToken"] = page_token
            page = await self._get("playlistItems", **params)
            ids += [it["contentDetails"]["videoId"] for it in page.get("items", [])]
            page_token = page.get("nextPageToken", "")
            if not page_token:
                break
        return ids[:max_videos]

    async def fetch_videos(self, video_ids: list[str]) -> list[VideoSignal]:
        out: list[VideoSignal] = []
        for i in range(0, len(video_ids), 50):
            batch = await self._get(
                "videos",
                part="snippet,statistics,contentDetails",
                id=",".join(video_ids[i : i + 50]),
            )
            for item in batch.get("items", []):
                snippet = item["snippet"]
                stats = item.get("statistics", {})
                out.append(
                    VideoSignal(
                        video_id=item["id"],
                        title=snippet["title"],
                        published_at=datetime.fromisoformat(
                            snippet["publishedAt"].replace("Z", "+00:00")
                        ),
                        duration_seconds=_iso_duration_seconds(
                            item.get("contentDetails", {}).get("duration", "")
                        ),
                        views=int(stats.get("viewCount", 0)),
                        comment_count=int(stats.get("commentCount", 0)),
                        description=snippet.get("description", "")[:2000],
                        definition=item.get("contentDetails", {}).get("definition", ""),
                        thumbnail_url=(
                            snippet.get("thumbnails", {}).get("high") or {}
                        ).get("url", ""),
                    )
                )
        return out

    async def fetch_comment_threads(
        self, video_id: str, channel_id: str
    ) -> CommentThreadResult:
        comments: list[tuple[str, int]] = []
        owner_replies: list[str] = []
        page_token = ""
        for _ in range(COMMENT_PAGES_PER_VIDEO):
            params = {
                "part": "snippet,replies",
                "videoId": video_id,
                "order": "relevance",
                "maxResults": "100",
                "textFormat": "plainText",
            }
            if page_token:
                params["pageToken"] = page_token
            try:
                page = await self._get("commentThreads", **params)
            except YouTubeAPIError as e:
                # Comments disabled is a per-video condition, not a failure.
                if e.status_code == 403 and "commentsDisabled" in e.detail:
                    return CommentThreadResult(
                        video_id=video_id,
                        comments_disabled=True,
                        comments=[],
                        owner_replies=[],
                    )
                raise
            for thread in page.get("items", []):
                top = thread["snippet"]["topLevelComment"]["snippet"]
                comments.append(
                    (
                        top.get("textDisplay", "")[:600],
                        int(top.get("likeCount", 0)),
                    )
                )
                replies = (thread.get("replies", {}) or {}).get("comments", [])
                for reply in replies:
                    rs = reply["snippet"]
                    author = (rs.get("authorChannelId") or {}).get("value")
                    if author == channel_id:
                        owner_replies.append(rs.get("textDisplay", "")[:600])
            page_token = page.get("nextPageToken", "")
            if not page_token:
                break
        return CommentThreadResult(
            video_id=video_id,
            comments_disabled=False,
            comments=comments,
            owner_replies=owner_replies,
        )
