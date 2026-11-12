"""The three Slack Web API calls the listener relay makes (25 September
2026): the OAuth v2 exchange when a person installs Simeon's Slack app,
the channel list a subscription is resolved against, and the request
signature check on every Events API delivery.

`SlackWebClient` takes an `httpx.AsyncClient` so a test can hand it a
`MockTransport`; nothing here caches a token, the connection row does.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import httpx

SLACK_API = "https://slack.com/api"
#: What the bot needs: to be mentioned, to read the channels it is in
#: (public and private), to see reactions, to name channels and members,
#: and to answer (the draft composer's Slack card). Since 12 November 2026
#: also what an agent needs to talk in Slack through this app
#: (`simeon.desktop.slack_app`): its direct messages (`im:history`), its
#: own name on what it sends (`chat:write.customize`) and files
#: (`files:write`). The app's settings on api.slack.com must list the same
#: scopes, or Slack refuses the sign-in (`invalid_scope`).
BOT_SCOPES = (
    "app_mentions:read",
    "channels:history",
    "channels:read",
    "groups:history",
    "groups:read",
    "im:history",
    "reactions:read",
    "users:read",
    "chat:write",
    "chat:write.customize",
    "files:write",
)
SIGNATURE_MAX_AGE_SECONDS = 5 * 60


class SlackApiError(Exception):
    def __init__(self, method: str, error: str) -> None:
        super().__init__(f"Slack {method} answered {error}")
        self.method = method
        self.error = error


def authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    query = httpx.QueryParams(
        {
            "client_id": client_id,
            "scope": ",".join(BOT_SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"https://slack.com/oauth/v2/authorize?{query}"


def verify_signature(
    signing_secret: str,
    timestamp: str | None,
    signature: str | None,
    body: bytes,
    *,
    now: float | None = None,
) -> bool:
    """`X-Slack-Signature` is `v0=` + HMAC-SHA256 over `v0:<timestamp>:<body>`;
    a request older than five minutes is a replay."""
    if not signing_secret or not timestamp or not signature:
        return False
    try:
        sent_at = int(timestamp)
    except ValueError:
        return False
    if (
        abs((now if now is not None else time.time()) - sent_at)
        > SIGNATURE_MAX_AGE_SECONDS
    ):
        return False
    base = b"v0:" + timestamp.encode() + b":" + body
    expected = (
        "v0=" + hmac.new(signing_secret.encode(), base, hashlib.sha256).hexdigest()
    )
    return hmac.compare_digest(expected, signature)


class SlackWebClient:
    def __init__(self, http: httpx.AsyncClient | None = None) -> None:
        self._http = http

    async def _call(
        self, method: str, *, token: str | None, data: dict[str, Any]
    ) -> dict[str, Any]:
        headers = {"authorization": f"Bearer {token}"} if token else {}
        async with self._client() as http:
            response = await http.post(
                f"{SLACK_API}/{method}", data=data, headers=headers, timeout=15.0
            )
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("ok") is not True:
            error = (
                payload.get("error", "unknown_error")
                if isinstance(payload, dict)
                else "not_json"
            )
            raise SlackApiError(method, str(error))
        return payload

    def _client(self) -> httpx.AsyncClient:
        if self._http is not None:
            return _Borrowed(self._http)  # type: ignore[return-value]
        return httpx.AsyncClient()

    async def oauth_v2_access(
        self, *, client_id: str, client_secret: str, code: str, redirect_uri: str
    ) -> dict[str, Any]:
        return await self._call(
            "oauth.v2.access",
            token=None,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )

    async def conversations_list(self, token: str) -> list[dict[str, Any]]:
        """Every channel the workspace shows the app, public and private,
        with whether the bot is a member: `[{id, name, isMember}]`."""
        channels: list[dict[str, Any]] = []
        cursor = ""
        for _ in range(20):
            payload = await self._call(
                "conversations.list",
                token=token,
                data={
                    "types": "public_channel,private_channel",
                    "exclude_archived": "true",
                    "limit": "1000",
                    **({"cursor": cursor} if cursor else {}),
                },
            )
            for channel in payload.get("channels", []):
                if isinstance(channel, dict) and isinstance(channel.get("id"), str):
                    channels.append(
                        {
                            "id": channel["id"],
                            "name": str(channel.get("name", "")),
                            "isMember": channel.get("is_member") is True,
                        }
                    )
            cursor = str(
                (payload.get("response_metadata") or {}).get("next_cursor") or ""
            )
            if not cursor:
                break
        return channels

    async def post_message(
        self,
        token: str,
        *,
        channel: str,
        text: str,
        thread_ts: str | None = None,
        username: str | None = None,
    ) -> dict[str, Any]:
        """One message, in the thread when one is named, under `username`
        when given (`chat:write.customize`)."""
        return await self._call(
            "chat.postMessage",
            token=token,
            data={
                "channel": channel,
                "text": text,
                **({"thread_ts": thread_ts} if thread_ts else {}),
                **({"username": username} if username else {}),
            },
        )

    async def user_name(self, token: str, user: str) -> str | None:
        """A member's name as Slack shows it (`users:read`): the display
        name, else the real name, else the handle."""
        payload = await self._call("users.info", token=token, data={"user": user})
        found = payload.get("user")
        if not isinstance(found, dict):
            return None
        raw_profile = found.get("profile")
        profile: dict[str, Any] = raw_profile if isinstance(raw_profile, dict) else {}
        for candidate in (
            profile.get("display_name"),
            found.get("real_name"),
            profile.get("real_name"),
            found.get("name"),
        ):
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None

    async def upload_file(
        self,
        token: str,
        *,
        channel: str,
        name: str,
        data: bytes,
        comment: str | None = None,
        thread_ts: str | None = None,
    ) -> None:
        """A file in a channel (`files:write`): an upload address, the bytes,
        then the file shared where it goes."""
        ticket = await self._call(
            "files.getUploadURLExternal",
            token=token,
            data={"filename": name, "length": str(len(data))},
        )
        upload_url = ticket.get("upload_url")
        file_id = ticket.get("file_id")
        if not isinstance(upload_url, str) or not isinstance(file_id, str):
            raise SlackApiError("files.getUploadURLExternal", "no_upload_url")
        async with self._client() as http:
            response = await http.post(
                upload_url,
                content=data,
                headers={"content-type": "application/octet-stream"},
                timeout=60.0,
            )
        if response.status_code < 200 or response.status_code >= 300:
            raise SlackApiError("upload", f"http_{response.status_code}")
        await self._call(
            "files.completeUploadExternal",
            token=token,
            data={
                "files": json.dumps([{"id": file_id, "title": name}]),
                "channel_id": channel,
                **({"initial_comment": comment} if comment else {}),
                **({"thread_ts": thread_ts} if thread_ts else {}),
            },
        )


class _Borrowed:
    """An `httpx.AsyncClient` a test lent us: used, never closed."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def __aenter__(self) -> httpx.AsyncClient:
        return self._http

    async def __aexit__(self, *args: object) -> None:
        return None
