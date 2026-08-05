"""Outbound action webhooks for sequence flow nodes.

Two action types ship with the flow editor:
  - `webhook` — POSTs a JSON envelope to a URL, with an HMAC-SHA256
    signature header so the receiver can verify authenticity.
  - `notify` — POSTs a Slack-shaped payload to the org's configured
    Slack incoming webhook URL (org.slack_webhook_url).

Both are best-effort: failures log + return; they don't block flow
execution. The flow worker stays moving even when a downstream is down.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any
from uuid import UUID

import httpx
import structlog

from polar.config import settings
from polar.kit.utils import utc_now
from polar.models.email_sequence_enrollment import EmailSequenceEnrollment
from polar.models.email_subscriber import EmailSubscriber
from polar.models.organization import Organization
from polar.postgres import AsyncSession

log = structlog.get_logger()


# Signing secret for action webhooks. Receivers can verify by computing
# `hmac_sha256(secret, raw_body)` and comparing to the `X-Spaire-Signature`
# header. Pulled from settings if available, else the SECRET key.
def _signing_secret() -> str:
    return (
        getattr(settings, "EMAIL_SEQUENCE_WEBHOOK_SECRET", None)
        or getattr(settings, "SECRET", None)
        or "spaire-dev-webhook-secret"
    )


def _sign(body: bytes) -> str:
    secret = _signing_secret().encode("utf-8")
    return hmac.new(secret, body, hashlib.sha256).hexdigest()


async def dispatch_action_webhook(
    session: AsyncSession,
    *,
    enrollment: EmailSequenceEnrollment,
    organization_id: UUID | None,
    url: str,
) -> None:
    url = (url or "").strip()
    if not url:
        log.info(
            "email_sequence.flow.webhook.no_url",
            enrollment_id=str(enrollment.id),
        )
        return
    if not (url.startswith("https://") or url.startswith("http://")):
        log.warning(
            "email_sequence.flow.webhook.invalid_url",
            enrollment_id=str(enrollment.id),
        )
        return

    subscriber = await session.get(EmailSubscriber, enrollment.subscriber_id)
    payload: dict[str, Any] = {
        "type": "email_sequence.action",
        "delivered_at": utc_now().isoformat(),
        "enrollment": {
            "id": str(enrollment.id),
            "sequence_id": str(enrollment.sequence_id),
            "status": enrollment.status,
            "flow_index": enrollment.flow_index,
        },
        "subscriber": (
            {
                "id": str(subscriber.id),
                "email": subscriber.email,
                "name": subscriber.name,
            }
            if subscriber is not None
            else None
        ),
        "organization_id": str(organization_id) if organization_id else None,
    }
    body = json.dumps(payload).encode("utf-8")
    signature = _sign(body)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Spaire-Webhooks/1.0",
        "X-Spaire-Signature": f"sha256={signature}",
        "X-Spaire-Event": "email_sequence.action",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, content=body, headers=headers)
        log.info(
            "email_sequence.flow.webhook.delivered",
            enrollment_id=str(enrollment.id),
            url_host=_host(url),
            status=response.status_code,
        )
    except Exception:
        log.exception(
            "email_sequence.flow.webhook.failed",
            enrollment_id=str(enrollment.id),
            url_host=_host(url),
        )


async def dispatch_slack_notify(
    session: AsyncSession,
    *,
    enrollment: EmailSequenceEnrollment,
    organization_id: UUID | None,
    text: str | None,
    channel: str | None,
) -> None:
    """Post to Slack via the org's incoming webhook URL.

    Org-side Slack URL lookup is best-effort: if the column doesn't exist
    yet (orgs without Slack settings) we skip with a debug log so flows
    keep walking forward.
    """
    org = (
        await session.get(Organization, organization_id)
        if organization_id is not None
        else None
    )
    slack_url = getattr(org, "slack_webhook_url", None) if org is not None else None
    if not slack_url:
        log.debug(
            "email_sequence.flow.slack.no_webhook",
            enrollment_id=str(enrollment.id),
        )
        return

    subscriber = await session.get(EmailSubscriber, enrollment.subscriber_id)
    summary = text or (
        f"Sequence step fired for *{subscriber.email if subscriber else 'subscriber'}*"
    )
    payload: dict[str, Any] = {
        "text": summary,
        "blocks": [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": summary},
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": (
                            f"sequence `{enrollment.sequence_id}` · "
                            f"step `{enrollment.flow_index}`"
                        ),
                    }
                ],
            },
        ],
    }
    if channel:
        payload["channel"] = channel
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(slack_url, json=payload, timeout=10)
        log.info(
            "email_sequence.flow.slack.delivered",
            enrollment_id=str(enrollment.id),
            status=response.status_code,
        )
    except Exception:
        log.exception(
            "email_sequence.flow.slack.failed",
            enrollment_id=str(enrollment.id),
        )


def _host(url: str) -> str:
    try:
        from urllib.parse import urlparse

        return urlparse(url).hostname or "?"
    except Exception:
        return "?"
