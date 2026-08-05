from __future__ import annotations

from uuid import UUID

from polar.config import settings
from polar.kit import jwt

# Long-lived: an unsubscribe link in someone's inbox needs to keep working
# years later. CAN-SPAM and GDPR both treat broken unsubscribe links as
# non-compliant, so we deliberately set a 10-year expiry rather than no
# expiry (JWTs require `exp`).
_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365 * 10


def create_unsubscribe_token(subscriber_id: UUID) -> str:
    return jwt.encode(
        data={"sid": str(subscriber_id)},
        secret=settings.SECRET,
        expires_in=_EXPIRES_IN_SECONDS,
        type="email_unsubscribe",
    )


def verify_unsubscribe_token(token: str) -> UUID | None:
    try:
        payload = jwt.decode(
            token=token, secret=settings.SECRET, type="email_unsubscribe"
        )
    except (jwt.DecodeError, jwt.ExpiredSignatureError, Exception):
        return None
    sid = payload.get("sid")
    if not isinstance(sid, str):
        return None
    try:
        return UUID(sid)
    except (ValueError, TypeError):
        return None


def build_unsubscribe_url(subscriber_id: UUID) -> str:
    token = create_unsubscribe_token(subscriber_id)
    return f"{settings.FRONTEND_BASE_URL}/email/unsubscribe?token={token}"


def build_test_unsubscribe_url() -> str:
    """Sentinel URL used in test/preview sends that have no real subscriber."""
    return f"{settings.FRONTEND_BASE_URL}/email/unsubscribe?test=1"
