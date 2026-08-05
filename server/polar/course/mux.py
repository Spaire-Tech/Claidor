"""Mux video integration — direct upload + webhook handling."""

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from polar.config import settings

log = logging.getLogger(__name__)

MUX_API_BASE = "https://api.mux.com"
MUX_STREAM_BASE = "https://stream.mux.com"
MUX_IMAGE_BASE = "https://image.mux.com"


def signing_keys_configured() -> bool:
    return bool(settings.MUX_SIGNING_KEY_ID and settings.MUX_SIGNING_KEY_PRIVATE)


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=MUX_API_BASE,
        auth=(settings.MUX_TOKEN_ID, settings.MUX_TOKEN_SECRET),
        headers={"Content-Type": "application/json"},
        timeout=30,
    )


async def create_direct_upload(cors_origin: str = "*") -> dict:
    """Create a Mux direct upload URL. Returns {upload_id, upload_url}.

    Uses signed playback when signing keys are configured so only the API
    can mint streaming URLs. Falls back to public for backwards-compat.
    """
    playback_policy = "signed" if signing_keys_configured() else "public"
    async with _client() as client:
        resp = await client.post(
            "/video/v1/uploads",
            json={
                "cors_origin": cors_origin,
                "new_asset_settings": {
                    "playback_policy": [playback_policy],
                    "mp4_support": "none",
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        return {"upload_id": data["id"], "upload_url": data["url"]}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_playback_token(playback_id: str, *, audience: str) -> str | None:
    """Mint a short-lived JWT for a Mux signed playback id.

    audience: 'v' for HLS streams, 't' for thumbnails, 's' for storyboards,
    'g' for gifs (per Mux docs).
    Returns None when signing keys are not configured (callers should treat
    this as "use a public URL").
    """
    if not signing_keys_configured():
        return None
    try:
        from authlib.jose import jwt  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - fallback for older deps
        return _sign_token_fallback(playback_id, audience)

    header = {"alg": "RS256", "kid": settings.MUX_SIGNING_KEY_ID, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": playback_id,
        "aud": audience,
        "exp": now + settings.MUX_SIGNED_URL_TTL_SECONDS,
        "kid": settings.MUX_SIGNING_KEY_ID,
    }
    try:
        token = jwt.encode(header, payload, settings.MUX_SIGNING_KEY_PRIVATE)
    except Exception:  # pragma: no cover - misconfigured key
        log.exception("Failed to sign Mux playback token")
        return None
    return token.decode("ascii") if isinstance(token, bytes) else token


def _sign_token_fallback(playback_id: str, audience: str) -> str | None:
    """Manual RS256 signing fallback used when authlib is unavailable.

    Requires `cryptography`, which is already a transitive dep of httpx[http2]
    and authlib elsewhere in the codebase.
    """
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:  # pragma: no cover
        return None
    header = {"alg": "RS256", "kid": settings.MUX_SIGNING_KEY_ID, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": playback_id,
        "aud": audience,
        "exp": now + settings.MUX_SIGNED_URL_TTL_SECONDS,
        "kid": settings.MUX_SIGNING_KEY_ID,
    }
    header_b = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b}.{payload_b}".encode()
    try:
        key = serialization.load_pem_private_key(
            settings.MUX_SIGNING_KEY_PRIVATE.encode(), password=None
        )
        signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    except Exception:  # pragma: no cover
        log.exception("Failed to sign Mux playback token (fallback)")
        return None
    return f"{header_b}.{payload_b}.{_b64url(signature)}"


def playback_url(playback_id: str | None) -> str | None:
    """Return an HLS URL for a Mux playback id, signed when possible."""
    if not playback_id:
        return None
    token = sign_playback_token(playback_id, audience="v")
    base = f"{MUX_STREAM_BASE}/{playback_id}.m3u8"
    return f"{base}?token={token}" if token else base


def thumbnail_url(playback_id: str | None, *, time_offset: float = 1.0) -> str | None:
    """Return a thumbnail URL for a Mux playback id, signed when possible."""
    if not playback_id:
        return None
    token = sign_playback_token(playback_id, audience="t")
    base = f"{MUX_IMAGE_BASE}/{playback_id}/thumbnail.jpg?time={time_offset}"
    return f"{base}&token={token}" if token else base


def storyboard_url(playback_id: str | None) -> str | None:
    """Return a storyboard WebVTT URL for a Mux playback id, signed when
    possible.

    Mux auto-generates a storyboard for every asset: a sprite sheet of
    frames plus a ``storyboard.vtt`` mapping time ranges to crop regions
    of that sheet. The player uses it for hover-scrub thumbnails. One
    's'-audience token authorizes both the VTT and the sprite image it
    references, so the client can reuse this URL's token for the image.
    """
    if not playback_id:
        return None
    token = sign_playback_token(playback_id, audience="s")
    base = f"{MUX_IMAGE_BASE}/{playback_id}/storyboard.vtt"
    return f"{base}?token={token}" if token else base


async def get_asset_by_upload(upload_id: str) -> dict | None:
    """Poll Mux for an asset created from a direct upload."""
    async with _client() as client:
        resp = await client.get(f"/video/v1/uploads/{upload_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()["data"]
        asset_id = data.get("asset_id")
        if not asset_id:
            return None
        asset_resp = await client.get(f"/video/v1/assets/{asset_id}")
        asset_resp.raise_for_status()
        return asset_resp.json()["data"]


def verify_webhook_signature(body: bytes, signature_header: str) -> bool:
    """Verify Mux webhook HMAC-SHA256 signature.

    signature_header format: "t=<timestamp>,v1=<hex_digest>"

    Outside of development/testing the webhook secret is required: missing
    secret is treated as a hard failure rather than a bypass.
    """
    if not settings.MUX_WEBHOOK_SECRET:
        if settings.is_development() or settings.is_testing():
            return True
        return False
    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(","))
        timestamp = parts["t"]
        expected_sig = parts["v1"]
        # Reject stale webhooks (> 5 minutes)
        if abs(time.time() - int(timestamp)) > 300:
            return False
        mac = hmac.new(
            settings.MUX_WEBHOOK_SECRET.encode(),
            f"{timestamp}.".encode() + body,
            hashlib.sha256,
        )
        return hmac.compare_digest(mac.hexdigest(), expected_sig)
    except Exception:
        return False


async def delete_asset(asset_id: str) -> bool:
    """Delete a Mux video asset. Returns True on success or 404 (already
    gone), False on transient failures so the caller can retry."""
    if not asset_id or not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        return False
    async with _client() as client:
        try:
            resp = await client.delete(f"/video/v1/assets/{asset_id}")
        except httpx.HTTPError:
            log.exception("Failed to call Mux delete asset", extra={"asset_id": asset_id})
            return False
    if resp.status_code in (200, 204, 404):
        return True
    log.warning(
        "Mux delete returned non-success status",
        extra={"asset_id": asset_id, "status": resp.status_code},
    )
    return False


async def cancel_upload(upload_id: str) -> bool:
    """Cancel a Mux direct upload that hasn't produced an asset yet.

    Returns True on success or when the upload is already gone (404).
    Returns False when the upload can't be cancelled — typically because
    the file already finished uploading and an asset is being created —
    so the caller should re-resolve the upload to an asset and delete
    that instead.
    """
    if not upload_id or not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        return False
    async with _client() as client:
        try:
            resp = await client.put(f"/video/v1/uploads/{upload_id}/cancel")
        except httpx.HTTPError:
            log.exception(
                "Failed to call Mux cancel upload", extra={"upload_id": upload_id}
            )
            return False
    if resp.status_code in (200, 204, 404):
        return True
    log.info(
        "Mux cancel upload returned non-success status",
        extra={"upload_id": upload_id, "status": resp.status_code},
    )
    return False


async def get_caption_vtt(
    asset_id: str,
    playback_id: str,
    *,
    language_code: str = "en",
) -> str | None:
    """Fetch the raw WebVTT of a ready auto-generated caption track.

    Looks the ready text track up on the asset, then downloads its sidecar
    ``.vtt`` from the Mux stream domain (signed when signing keys are
    configured, since the asset uses signed playback). Returns the raw VTT
    text, or None when there is no ready text track yet or the download
    fails (the caller treats None as "not ready, retry later").
    """
    if not asset_id or not playback_id:
        return None
    if not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        return None
    async with _client() as client:
        try:
            asset_resp = await client.get(f"/video/v1/assets/{asset_id}")
            if asset_resp.status_code == 404:
                return None
            asset_resp.raise_for_status()
            tracks = asset_resp.json()["data"].get("tracks", [])
        except (httpx.HTTPError, KeyError, ValueError):
            log.exception(
                "Failed to read Mux asset tracks for transcript",
                extra={"asset_id": asset_id},
            )
            return None

    # Pick the best ready text track. Prefer the exact requested language,
    # then any "en*" variant (Mux can return e.g. "en-US"), then the first
    # ready text track — auto-generated captions are sometimes labelled
    # differently than what we requested, and a too-strict match was leaving
    # lessons stuck "pending" until the 2h reconcile timeout.
    text_tracks = [
        t
        for t in tracks
        if t.get("type") == "text" and t.get("status") == "ready"
    ]
    if not text_tracks:
        log.info(
            "No ready Mux text track yet for transcript",
            extra={
                "asset_id": asset_id,
                "tracks": [
                    {
                        "type": t.get("type"),
                        "status": t.get("status"),
                        "language_code": t.get("language_code"),
                        "text_source": t.get("text_source"),
                    }
                    for t in tracks
                ],
            },
        )
        return None
    track = (
        next(
            (t for t in text_tracks if t.get("language_code") == language_code),
            None,
        )
        or next(
            (
                t
                for t in text_tracks
                if (t.get("language_code") or "").startswith(language_code)
            ),
            None,
        )
        or text_tracks[0]
    )
    track_id = track.get("id")
    if not track_id:
        return None

    base_url = f"{MUX_STREAM_BASE}/{playback_id}/text/{track_id}.vtt"
    # The token must match the asset's *playback policy*, which a global
    # signing-key config doesn't tell us: a signed token on a public playback
    # id (or no token on a signed one) is 403'd by Mux. Try both the signed and
    # unsigned URL so we work regardless of the individual asset's policy.
    token = sign_playback_token(playback_id, audience="v")
    candidate_urls = [base_url]
    if token:
        candidate_urls.insert(0, f"{base_url}?token={token}")

    last_status: int | None = None
    for url in candidate_urls:
        try:
            # follow_redirects=True is essential: stream.mux.com answers the
            # text-track sidecar with a redirect to its CDN. Browsers follow it
            # (so captions play in the player); httpx does NOT by default, so
            # without this every fetch returns a 3xx and the transcript silently
            # never lands — the exact "captions work but transcript doesn't" bug.
            async with httpx.AsyncClient(
                timeout=30, follow_redirects=True
            ) as http_client:
                resp = await http_client.get(url)
        except httpx.HTTPError:
            log.exception(
                "Failed to download Mux caption VTT",
                extra={"asset_id": asset_id, "track_id": track_id},
            )
            continue
        if resp.status_code == 200 and resp.text.strip():
            return resp.text
        last_status = resp.status_code
    log.warning(
        "Mux caption VTT download returned non-success",
        extra={
            "asset_id": asset_id,
            "track_id": track_id,
            "status": last_status,
            "signed_attempted": token is not None,
        },
    )
    return None


async def diagnose_caption_fetch(
    asset_id: str | None,
    playback_id: str | None,
    *,
    language_code: str = "en",
) -> dict[str, Any]:
    """Run the caption-fetch steps and report exactly what happens, for
    creator-facing debugging. Never raises — returns a structured dict so we
    can see, from inside the deployment, whether Mux produced a text track and
    whether the .vtt download is authorized."""
    out: dict[str, Any] = {"asset_id": asset_id, "playback_id": playback_id}
    if not asset_id or not playback_id:
        out["error"] = "missing_mux_ids"
        return out
    if not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        out["error"] = "mux_api_token_not_configured"
        return out
    async with _client() as client:
        try:
            r = await client.get(f"/video/v1/assets/{asset_id}")
            out["asset_http"] = r.status_code
            if r.status_code != 200:
                out["error"] = "asset_fetch_failed"
                return out
            tracks = r.json()["data"].get("tracks", [])
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            out["error"] = f"asset_fetch_error: {exc}"
            return out

    out["tracks"] = [
        {
            "type": t.get("type"),
            "status": t.get("status"),
            "language_code": t.get("language_code"),
            "text_source": t.get("text_source"),
        }
        for t in tracks
    ]
    text_tracks = [
        t for t in tracks if t.get("type") == "text" and t.get("status") == "ready"
    ]
    if not text_tracks:
        out["error"] = "no_ready_text_track"
        return out
    track = (
        next((t for t in text_tracks if t.get("language_code") == language_code), None)
        or next(
            (
                t
                for t in text_tracks
                if (t.get("language_code") or "").startswith(language_code)
            ),
            None,
        )
        or text_tracks[0]
    )
    track_id = track.get("id")
    out["chosen_track_id"] = track_id
    out["signing_keys_configured"] = signing_keys_configured()
    if not track_id:
        out["error"] = "track_missing_id"
        return out

    base = f"{MUX_STREAM_BASE}/{playback_id}/text/{track_id}.vtt"
    token = sign_playback_token(playback_id, audience="v")
    attempts: list[tuple[str, str]] = []
    if token:
        attempts.append(("signed", f"{base}?token={token}"))
    attempts.append(("unsigned", base))
    for label, url in attempts:
        try:
            async with httpx.AsyncClient(
                timeout=30, follow_redirects=True
            ) as http_client:
                resp = await http_client.get(url)
            out[f"vtt_{label}_status"] = resp.status_code
            out[f"vtt_{label}_len"] = len(resp.text or "")
            out[f"vtt_{label}_redirected"] = len(resp.history) > 0
        except httpx.HTTPError as exc:
            out[f"vtt_{label}_error"] = str(exc)
    return out


async def request_auto_captions(
    asset_id: str, *, language_code: str = "en", name: str = "English (auto)"
) -> bool:
    """Ask Mux to auto-generate subtitles for an asset's audio track.

    Mux generates captions from the audio of the asset's primary audio
    track. We look the audio track up on the ready asset, then POST a
    generated-subtitles request for it. The finished caption track is
    delivered on the HLS manifest, so players pick it up natively (the
    WatchPlayer only shows its CC control once a text track exists).

    Returns True when the request was accepted (or captions already exist),
    False on a transient failure so the caller can retry. Idempotent:
    re-requesting an existing language is treated as success.
    """
    if not asset_id or not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        return False
    async with _client() as client:
        try:
            asset_resp = await client.get(f"/video/v1/assets/{asset_id}")
            asset_resp.raise_for_status()
            tracks = asset_resp.json()["data"].get("tracks", [])
        except (httpx.HTTPError, KeyError, ValueError):
            log.exception(
                "Failed to read Mux asset tracks for captions",
                extra={"asset_id": asset_id},
            )
            return False

        audio_track = next(
            (t for t in tracks if t.get("type") == "audio"), None
        )
        if audio_track is None:
            log.warning(
                "Mux asset has no audio track; skipping captions",
                extra={"asset_id": asset_id},
            )
            return False

        # Already has a generated/text subtitle in this language → done.
        for t in tracks:
            if t.get("type") == "text" and t.get("language_code") == language_code:
                return True

        track_id = audio_track["id"]
        try:
            resp = await client.post(
                f"/video/v1/assets/{asset_id}/tracks/{track_id}/generate-subtitles",
                json={
                    "generated_subtitles": [
                        {"language_code": language_code, "name": name}
                    ]
                },
            )
        except httpx.HTTPError:
            log.exception(
                "Failed to call Mux generate-subtitles",
                extra={"asset_id": asset_id},
            )
            return False
    if resp.status_code in (200, 201):
        return True
    log.warning(
        "Mux generate-subtitles returned non-success status",
        extra={"asset_id": asset_id, "status": resp.status_code},
    )
    return False
