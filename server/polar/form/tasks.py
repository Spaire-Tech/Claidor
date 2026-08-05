import html
from uuid import UUID

import structlog

from polar.email.sender import enqueue_email
from polar.file.service import file as file_service
from polar.worker import AsyncSessionMaker, TaskPriority, actor

from .repository import FormRepository

log = structlog.get_logger()


def _render_email(
    *, title: str, file_name: str, download_url: str, recipient_name: str | None
) -> str:
    greeting = f"Hi {html.escape(recipient_name)}," if recipient_name else "Hi,"
    safe_title = html.escape(title)
    safe_file = html.escape(file_name)
    # quote=True so the URL is safe inside the href attribute.
    safe_url = html.escape(download_url, quote=True)
    return f"""\
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; \
max-width: 480px; margin: 0 auto; color: #111;">
  <p style="font-size: 16px;">{greeting}</p>
  <p style="font-size: 16px;">Thanks for signing up. Here's your download for \
<strong>{safe_title}</strong>:</p>
  <p style="margin: 28px 0;">
    <a href="{safe_url}"
       style="background: #111; color: #fff; text-decoration: none; \
padding: 12px 22px; border-radius: 10px; font-size: 15px; display: inline-block;">
      Download {safe_file}
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">If the button doesn't work, copy and paste \
this link into your browser:<br />{safe_url}</p>
</div>"""


@actor(actor_name="form.deliver_lead_magnet", priority=TaskPriority.HIGH)
async def form_deliver_lead_magnet(
    form_id: UUID, email: str, name: str | None = None
) -> None:
    async with AsyncSessionMaker() as session:
        repository = FormRepository.from_session(session)
        form = await repository.get_with_file_by_id(form_id)
        if form is None or form.file_id is None or form.file is None:
            log.info("form.deliver_lead_magnet.no_file", form_id=str(form_id))
            return

        # Generated fresh at send time so the link is valid when the email
        # lands, regardless of how long the queue took.
        url, _expires_at = file_service.generate_download_url(form.file)

        enqueue_email(
            to_email_addr=email,
            subject=f"Your download: {form.file.name}",
            html_content=_render_email(
                title=form.title,
                file_name=form.file.name,
                download_url=url,
                recipient_name=name,
            ),
        )
