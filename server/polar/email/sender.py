from abc import ABC, abstractmethod
from collections.abc import Iterable
from typing import Any, NotRequired, TypedDict

import httpx
import structlog
from email_validator import validate_email

from polar.config import EmailSender as EmailSenderType
from polar.config import settings
from polar.exceptions import PolarError
from polar.logging import Logger
from polar.worker import enqueue_job

log: Logger = structlog.get_logger()

DEFAULT_FROM_NAME = settings.EMAIL_FROM_NAME
DEFAULT_FROM_EMAIL_ADDRESS = f"{settings.EMAIL_FROM_LOCAL}@{settings.EMAIL_FROM_DOMAIN}"
DEFAULT_REPLY_TO_NAME = settings.EMAIL_DEFAULT_REPLY_TO_NAME
DEFAULT_REPLY_TO_EMAIL_ADDRESS = settings.EMAIL_DEFAULT_REPLY_TO_EMAIL_ADDRESS


def to_ascii_email(email: str) -> str:
    """
    Convert an email address to ASCII format, possibly using punycode for internationalized domains.
    """
    validated_email = validate_email(email, check_deliverability=False)
    return validated_email.ascii_email or email


class EmailSenderError(PolarError): ...


class SendEmailError(EmailSenderError):
    def __init__(self, message: str) -> None:
        super().__init__(message)


class Attachment(TypedDict):
    filename: str
    remote_url: NotRequired[str]
    content: NotRequired[str]  # base64-encoded string for inline attachments


class EmailSender(ABC):
    @abstractmethod
    async def send(
        self,
        *,
        to_email_addr: str,
        subject: str,
        html_content: str,
        from_name: str = DEFAULT_FROM_NAME,
        from_email_addr: str = DEFAULT_FROM_EMAIL_ADDRESS,
        email_headers: dict[str, str] | None = None,
        reply_to_name: str | None = DEFAULT_REPLY_TO_NAME,
        reply_to_email_addr: str | None = DEFAULT_REPLY_TO_EMAIL_ADDRESS,
        attachments: Iterable[Attachment] | None = None,
        track_opens: bool = False,
        track_clicks: bool = False,
        tags: list[dict[str, str]] | None = None,
        idempotency_key: str | None = None,
    ) -> str | None:
        """Send an email. Returns the provider email ID if available.

        track_opens / track_clicks: marketing sends should pass True to force
        Resend's open-pixel injection and link rewriting on per-send (otherwise
        we'd depend on dashboard-level domain config, which silently defaults
        OFF for new accounts — see audit issue: zero open/click rates).

        tags: forwarded to Resend as ``{"name": "...", "value": "..."}``
        entries for dashboard filtering (org_id, broadcast_id, sequence_id).

        idempotency_key: forwarded as ``Idempotency-Key`` header to dedupe
        retried sends on Resend's side.
        """
        pass


class LoggingEmailSender(EmailSender):
    async def send(
        self,
        *,
        to_email_addr: str,
        subject: str,
        html_content: str,
        from_name: str = DEFAULT_FROM_NAME,
        from_email_addr: str = DEFAULT_FROM_EMAIL_ADDRESS,
        email_headers: dict[str, str] | None = None,
        reply_to_name: str | None = DEFAULT_REPLY_TO_NAME,
        reply_to_email_addr: str | None = DEFAULT_REPLY_TO_EMAIL_ADDRESS,
        attachments: Iterable[Attachment] | None = None,
        track_opens: bool = False,
        track_clicks: bool = False,
        tags: list[dict[str, str]] | None = None,
        idempotency_key: str | None = None,
    ) -> str | None:
        log.info(
            "Sending an email",
            to_email_addr=to_ascii_email(to_email_addr),
            subject=subject,
            from_name=from_name,
            from_email_addr=to_ascii_email(from_email_addr),
            track_opens=track_opens,
            track_clicks=track_clicks,
        )
        return None


class ResendEmailSender(EmailSender):
    def __init__(self) -> None:
        self.client = httpx.AsyncClient(
            base_url=settings.RESEND_API_BASE_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        )

    async def send(
        self,
        *,
        to_email_addr: str,
        subject: str,
        html_content: str,
        from_name: str = DEFAULT_FROM_NAME,
        from_email_addr: str = DEFAULT_FROM_EMAIL_ADDRESS,
        email_headers: dict[str, str] | None = None,
        reply_to_name: str | None = DEFAULT_REPLY_TO_NAME,
        reply_to_email_addr: str | None = DEFAULT_REPLY_TO_EMAIL_ADDRESS,
        attachments: Iterable[Attachment] | None = None,
        track_opens: bool = False,
        track_clicks: bool = False,
        tags: list[dict[str, str]] | None = None,
        idempotency_key: str | None = None,
    ) -> str | None:
        to_email_addr_ascii = to_ascii_email(to_email_addr)
        payload: dict[str, Any] = {
            "from": f"{from_name} <{to_ascii_email(from_email_addr)}>",
            "to": [to_email_addr_ascii],
            "subject": subject,
            "html": html_content,
            "headers": email_headers or {},
            "attachments": [
                {
                    "filename": attachment["filename"],
                    **(
                        {"content": attachment["content"]}
                        if "content" in attachment
                        else {"path": attachment["remote_url"]}
                    ),
                }
                for attachment in attachments
            ]
            if attachments
            else [],
        }
        if reply_to_name and reply_to_email_addr:
            payload["reply_to"] = (
                f"{reply_to_name} <{to_ascii_email(reply_to_email_addr)}>"
            )
        # Resend defaults open/click tracking OFF unless the domain dashboard
        # has it enabled. We force per-send so marketing tracking works even
        # on new accounts that haven't toggled the dashboard switch.
        if track_opens:
            payload["track_opens"] = True
        if track_clicks:
            payload["track_clicks"] = True
        if tags:
            payload["tags"] = tags

        request_headers: dict[str, str] = {}
        if idempotency_key:
            request_headers["Idempotency-Key"] = idempotency_key

        try:
            response = await self.client.post(
                "/emails",
                json=payload,
                headers=request_headers or None,
            )
            response.raise_for_status()
            email = response.json()
        except httpx.HTTPError as e:
            log.warning(
                "resend.send_error",
                to_email_addr=to_email_addr_ascii,
                subject=subject,
                error=e,
            )
            raise SendEmailError(str(e)) from e

        email_id = email.get("id")
        log.info(
            "resend.send",
            to_email_addr=to_email_addr_ascii,
            subject=subject,
            email_id=email_id,
            track_opens=track_opens,
            track_clicks=track_clicks,
        )
        return email_id


class EmailFromReply(TypedDict):
    from_name: str
    from_email_addr: str
    reply_to_name: str
    reply_to_email_addr: str


def resolve_creator_from_address(
    *,
    organization: Any,
    requested_email: str | None,
    requested_name: str | None,
) -> tuple[str, str]:
    """Pick the From address for a creator-initiated email (broadcasts,
    sequence steps).

    Three cases, in order:

    1. The creator has a *verified custom sender domain* AND the
       requested From email is on that domain — honour both name and
       email. ``Robin Kaye <hi@email.mybrand.com>``. This is the Pro
       tier feature.

    2. The creator just wants a custom *display name* (no custom
       domain, or didn't type an email at all) — honour the name and
       ship from the platform default email. ``Robin Kaye
       <mail@notifications.spairehq.com>``. This always works on
       every tier; before the Pro domain feature landed it was the
       only mode and it's what every existing creator depends on.

    3. No name, no domain — fall all the way back to the platform
       default name+email. ``Spaire <mail@notifications.spairehq.com>``.

    The previous version of this function collapsed cases 2 and 3 into
    the fallback, which silently regressed every creator who'd typed a
    sender_name. ``requested_email`` on a domain the org hasn't
    verified is still dropped (Resend would reject it anyway).
    """
    # Case 1: verified custom domain + matching From address.
    if (
        organization is not None
        and organization.has_verified_sender_domain
        and requested_email is not None
        and requested_email.lower().endswith(
            "@" + organization.email_sender_domain.lower()
        )
    ):
        return (
            requested_name or DEFAULT_FROM_NAME,
            requested_email,
        )

    # Case 2: custom display name on the platform's default email.
    # We log when a creator typed a custom email that we can't honour
    # so support can see they're hitting the silently-dropped path.
    if requested_email is not None:
        log.info(
            "email.sender_email_dropped_unverified_domain",
            organization_id=str(organization.id) if organization else None,
            requested_email=requested_email,
            org_domain=(
                organization.email_sender_domain if organization else None
            ),
            org_verified=bool(
                organization and organization.has_verified_sender_domain
            ),
        )
    if requested_name:
        return (requested_name, DEFAULT_FROM_EMAIL_ADDRESS)

    # Case 3: full fallback.
    return (DEFAULT_FROM_NAME, DEFAULT_FROM_EMAIL_ADDRESS)


def enqueue_email(
    to_email_addr: str,
    subject: str,
    html_content: str,
    from_name: str = DEFAULT_FROM_NAME,
    from_email_addr: str = DEFAULT_FROM_EMAIL_ADDRESS,
    email_headers: dict[str, str] | None = None,
    reply_to_name: str | None = DEFAULT_REPLY_TO_NAME,
    reply_to_email_addr: str | None = DEFAULT_REPLY_TO_EMAIL_ADDRESS,
    attachments: Iterable[Attachment] | None = None,
) -> None:
    enqueue_job(
        "email.send",
        to_email_addr=to_email_addr,
        subject=subject,
        html_content=html_content,
        from_name=from_name,
        from_email_addr=from_email_addr,
        email_headers=email_headers,
        reply_to_name=reply_to_name,
        reply_to_email_addr=reply_to_email_addr,
        attachments=attachments,
    )


email_sender: EmailSender
if settings.EMAIL_SENDER == EmailSenderType.resend:
    email_sender = ResendEmailSender()
else:
    # Logging in development
    email_sender = LoggingEmailSender()
