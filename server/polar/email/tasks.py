import structlog

from polar.worker import TaskPriority, actor

from .sender import Attachment, email_sender

log = structlog.get_logger()


@actor(actor_name="email.send", priority=TaskPriority.HIGH)
async def email_send(
    to_email_addr: str,
    subject: str,
    html_content: str,
    from_name: str,
    from_email_addr: str,
    email_headers: dict[str, str] | None,
    reply_to_name: str | None,
    reply_to_email_addr: str | None,
    attachments: list[Attachment] | None = None,
) -> None:
    # Loud entry log so "did the email actor even run?" is answerable
    # from the worker output. The sender class name tells you whether
    # this is going through Resend (production) or just being logged
    # (dev) — the latter is the most common "I never got my email"
    # cause for self-hosted / unconfigured installs.
    log.info(
        "email.send.actor_start",
        to=to_email_addr,
        subject=subject,
        sender_class=type(email_sender).__name__,
        has_attachments=bool(attachments),
    )
    await email_sender.send(
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
