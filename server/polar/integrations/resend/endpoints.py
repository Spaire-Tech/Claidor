import base64
import hashlib
import hmac
import time

import structlog
from fastapi import HTTPException, Request

from polar.config import settings
from polar.routing import APIRouter
from polar.worker import enqueue_job

log = structlog.get_logger()

router = APIRouter(
    prefix="/integrations/resend",
    tags=["integrations_resend"],
    include_in_schema=False,
)


HANDLED_EVENT_TYPES = {
    "email.delivered",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
}

# Svix tolerates a 5-minute clock skew on signed payloads.
_SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60


def _verify_svix_signature(
    *,
    payload: bytes,
    msg_id: str,
    msg_timestamp: str,
    msg_signature: str,
    secret: str,
) -> bool:
    """Verify a Svix-signed webhook (the format Resend uses).

    Svix signs ``{id}.{timestamp}.{payload}`` with HMAC-SHA256 using a
    base64-decoded secret prefixed with ``whsec_``. The signature header
    is a space-separated list of ``v1,<base64-sig>`` entries — we accept
    if any one of them matches, because Svix rotates secrets by sending
    both old and new signatures during the rotation window.
    """
    if not secret:
        return False

    if secret.startswith("whsec_"):
        try:
            key = base64.b64decode(secret[len("whsec_") :])
        except (ValueError, base64.binascii.Error):
            return False
    else:
        # Plain shared secret — treated as raw bytes for HMAC.
        key = secret.encode()

    # Replay-window check. ``msg_timestamp`` is unix-seconds as ASCII.
    try:
        ts = int(msg_timestamp)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts) > _SVIX_TIMESTAMP_TOLERANCE_SECONDS:
        return False

    signed = f"{msg_id}.{msg_timestamp}.".encode() + payload
    expected = base64.b64encode(
        hmac.new(key, signed, hashlib.sha256).digest()
    ).decode()

    for part in msg_signature.split():
        version, _, candidate = part.partition(",")
        if version != "v1":
            continue
        if hmac.compare_digest(expected, candidate):
            return True
    return False


@router.post("/webhook")
async def resend_webhook(request: Request) -> dict[str, str]:
    """Receive webhook events from Resend for email tracking.

    Verifies the Svix signature (mandatory in production) and enqueues
    the event for processing. Idempotency is enforced in the worker via
    the ``svix-id`` header.
    """
    payload = await request.body()
    msg_id = request.headers.get("svix-id", "")
    msg_timestamp = request.headers.get("svix-timestamp", "")
    msg_signature = request.headers.get("svix-signature", "")

    secret = settings.RESEND_WEBHOOK_SECRET
    if secret:
        if not (msg_id and msg_timestamp and msg_signature):
            raise HTTPException(status_code=401, detail="Missing signature headers")
        if not _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp=msg_timestamp,
            msg_signature=msg_signature,
            secret=secret,
        ):
            log.warning(
                "resend.webhook.signature_invalid",
                msg_id=msg_id,
                msg_timestamp=msg_timestamp,
            )
            raise HTTPException(status_code=401, detail="Invalid signature")
    else:
        # Allowed for local dev (no secret configured); never reach this
        # branch in production.
        log.warning(
            "resend.webhook.signature_skipped",
            reason="RESEND_WEBHOOK_SECRET not configured",
        )

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = data.get("type", "")
    if event_type not in HANDLED_EVENT_TYPES:
        return {"status": "ignored"}

    event_data = data.get("data", {})
    email_id = event_data.get("email_id")

    if not email_id or not isinstance(email_id, str):
        return {"status": "ignored"}

    log.info(
        "resend.webhook",
        event_type=event_type,
        email_id=email_id,
        msg_id=msg_id,
    )

    # Pass through the signed ``svix-id`` so the worker can dedupe retries
    # via the resend_webhook_events table. Falling back to a synthetic id
    # for unsigned dev environments keeps the worker contract uniform.
    enqueue_job(
        "resend.webhook.process_event",
        event_type=event_type,
        email_id=email_id,
        event_data=event_data,
        webhook_event_id=msg_id or f"unsigned:{email_id}:{event_type}:{time.time()}",
    )

    return {"status": "accepted"}
