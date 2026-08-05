"""Unit tests for the Mux signed-playback + webhook hardening fixes."""

import hashlib
import hmac
import time
from unittest.mock import patch

import pytest

from polar.config import Environment
from polar.course import mux as mux_client

# ──────────────────────────────────────────────────────────────────────────
# Webhook signature verification — env-gated bypass
# ──────────────────────────────────────────────────────────────────────────


class TestWebhookSignature:
    def _signed_header(self, secret: str, body: bytes, ts: int | None = None) -> str:
        ts = ts or int(time.time())
        mac = hmac.new(
            secret.encode(),
            f"{ts}.".encode() + body,
            hashlib.sha256,
        )
        return f"t={ts},v1={mac.hexdigest()}"

    def test_valid_signature_passes(self) -> None:
        body = b'{"type":"video.asset.ready"}'
        with patch.object(
            mux_client.settings, "MUX_WEBHOOK_SECRET", "shh"
        ):
            header = self._signed_header("shh", body)
            assert mux_client.verify_webhook_signature(body, header) is True

    def test_wrong_secret_fails(self) -> None:
        body = b'{"type":"video.asset.ready"}'
        with patch.object(
            mux_client.settings, "MUX_WEBHOOK_SECRET", "right"
        ):
            header = self._signed_header("wrong", body)
            assert mux_client.verify_webhook_signature(body, header) is False

    def test_stale_timestamp_fails(self) -> None:
        body = b'{"type":"video.asset.ready"}'
        with patch.object(
            mux_client.settings, "MUX_WEBHOOK_SECRET", "shh"
        ):
            stale = int(time.time()) - 600  # 10 minutes ago
            header = self._signed_header("shh", body, ts=stale)
            assert mux_client.verify_webhook_signature(body, header) is False

    def test_missing_secret_in_dev_passes(self) -> None:
        with patch.object(mux_client.settings, "MUX_WEBHOOK_SECRET", ""):
            with patch.object(
                mux_client.settings, "ENV", Environment.development
            ):
                assert mux_client.verify_webhook_signature(b"any", "") is True

    def test_missing_secret_in_test_passes(self) -> None:
        with patch.object(mux_client.settings, "MUX_WEBHOOK_SECRET", ""):
            with patch.object(
                mux_client.settings, "ENV", Environment.testing
            ):
                assert mux_client.verify_webhook_signature(b"any", "") is True

    def test_missing_secret_in_production_fails(self) -> None:
        with patch.object(mux_client.settings, "MUX_WEBHOOK_SECRET", ""):
            with patch.object(
                mux_client.settings, "ENV", Environment.production
            ):
                assert mux_client.verify_webhook_signature(b"any", "") is False

    def test_malformed_header_fails(self) -> None:
        with patch.object(
            mux_client.settings, "MUX_WEBHOOK_SECRET", "shh"
        ):
            assert mux_client.verify_webhook_signature(b"x", "garbage") is False
            assert mux_client.verify_webhook_signature(b"x", "") is False


# ──────────────────────────────────────────────────────────────────────────
# Signed playback URL minting
# ──────────────────────────────────────────────────────────────────────────


class TestPlaybackUrl:
    def test_returns_none_for_null_id(self) -> None:
        assert mux_client.playback_url(None) is None

    def test_unsigned_when_keys_not_configured(self) -> None:
        with patch.object(mux_client.settings, "MUX_SIGNING_KEY_ID", ""):
            with patch.object(
                mux_client.settings, "MUX_SIGNING_KEY_PRIVATE", ""
            ):
                url = mux_client.playback_url("abc123")
        assert url == "https://stream.mux.com/abc123.m3u8"

    def test_thumbnail_unsigned_when_keys_not_configured(self) -> None:
        with patch.object(mux_client.settings, "MUX_SIGNING_KEY_ID", ""):
            with patch.object(
                mux_client.settings, "MUX_SIGNING_KEY_PRIVATE", ""
            ):
                url = mux_client.thumbnail_url("abc123")
        # Default time_offset=1.0 (audit fix to avoid the time=0 black frame)
        assert url == "https://image.mux.com/abc123/thumbnail.jpg?time=1.0"

    def test_thumbnail_returns_none_for_null_id(self) -> None:
        assert mux_client.thumbnail_url(None) is None

    def test_storyboard_unsigned_when_keys_not_configured(self) -> None:
        with patch.object(mux_client.settings, "MUX_SIGNING_KEY_ID", ""):
            with patch.object(
                mux_client.settings, "MUX_SIGNING_KEY_PRIVATE", ""
            ):
                url = mux_client.storyboard_url("abc123")
        assert url == "https://image.mux.com/abc123/storyboard.vtt"

    def test_storyboard_returns_none_for_null_id(self) -> None:
        assert mux_client.storyboard_url(None) is None


# ──────────────────────────────────────────────────────────────────────────
# Auto-generated captions — request_auto_captions
# ──────────────────────────────────────────────────────────────────────────


class _FakeResp:
    def __init__(self, status_code: int, payload: dict | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            import httpx

            raise httpx.HTTPStatusError(
                "err", request=None, response=None  # type: ignore[arg-type]
            )


class _FakeClient:
    """Minimal async-context Mux client double; records POSTs."""

    def __init__(self, *, tracks: list[dict], post_status: int = 201) -> None:
        self._tracks = tracks
        self._post_status = post_status
        self.posts: list[tuple[str, dict]] = []

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def get(self, url: str) -> _FakeResp:
        return _FakeResp(200, {"data": {"tracks": self._tracks}})

    async def post(self, url: str, json: dict) -> _FakeResp:
        self.posts.append((url, json))
        return _FakeResp(self._post_status)


class TestAutoCaptions:
    async def _run(self, client: _FakeClient) -> bool:
        with patch.object(mux_client.settings, "MUX_TOKEN_ID", "id"), patch.object(
            mux_client.settings, "MUX_TOKEN_SECRET", "secret"
        ), patch.object(mux_client, "_client", lambda: client):
            return await mux_client.request_auto_captions("asset_1")

    @pytest.mark.asyncio
    async def test_requests_subtitles_for_audio_track(self) -> None:
        client = _FakeClient(
            tracks=[
                {"id": "vid", "type": "video"},
                {"id": "aud", "type": "audio"},
            ]
        )
        ok = await self._run(client)
        assert ok is True
        assert len(client.posts) == 1
        url, body = client.posts[0]
        assert url == "/video/v1/assets/asset_1/tracks/aud/generate-subtitles"
        assert body["generated_subtitles"][0]["language_code"] == "en"

    @pytest.mark.asyncio
    async def test_idempotent_when_caption_track_exists(self) -> None:
        client = _FakeClient(
            tracks=[
                {"id": "aud", "type": "audio"},
                {"id": "txt", "type": "text", "language_code": "en"},
            ]
        )
        ok = await self._run(client)
        assert ok is True
        assert client.posts == []  # no duplicate request

    @pytest.mark.asyncio
    async def test_no_audio_track_returns_false(self) -> None:
        client = _FakeClient(tracks=[{"id": "vid", "type": "video"}])
        ok = await self._run(client)
        assert ok is False
        assert client.posts == []

    @pytest.mark.asyncio
    async def test_missing_credentials_returns_false(self) -> None:
        client = _FakeClient(tracks=[{"id": "aud", "type": "audio"}])
        with patch.object(mux_client.settings, "MUX_TOKEN_ID", ""):
            ok = await mux_client.request_auto_captions("asset_1")
        assert ok is False
