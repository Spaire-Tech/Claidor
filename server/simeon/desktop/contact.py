"""The website's contact form (24 October 2026): simeonlabs.com/contact posts a
person's name, e-mail, company website, country and message here, and the
server e-mails it to the founder (`CONTACT_EMAIL`, bass@simeonlabs.com) with
the person as the reply-to, so answering the e-mail answers them.

- `POST /desktop/api/contact`, no sign-in: `{"code": 0, "data": {"sent":
  true}}`, or a 422 when a field is missing or the e-mail is not one. The page
  sends no cookie, and the API's CORS lets any page post without one.

Nothing is stored. The e-mail is queued (`email.send`) and the worker sends it
with Resend, as it sends the sign-in codes (`docs/services-core.md`). A form
whose hidden `address` field is filled, as a bot fills every field, is
answered as sent and dropped. `rate_limit.py` limits the route by address.
"""

from __future__ import annotations

from html import escape
from typing import Annotated

import structlog
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from simeon.config import settings
from simeon.email.sender import enqueue_email
from simeon.routing import APIRouter

log = structlog.get_logger()

# Mounted under the desktop router (`/desktop`), like the other features.
router = APIRouter(include_in_schema=False)

Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class ContactBody(BaseModel):
    """What the page's form posts (`sites/simeonlabs.com/source/contact.py`)."""

    model_config = ConfigDict(extra="ignore")
    firstName: Name
    lastName: Name
    email: EmailStr
    website: str = Field(default="", max_length=300)
    country: str = Field(default="", max_length=100)
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
    ]
    #: Hidden on the page; a person never sees it, so never fills it.
    address: str = Field(default="", max_length=300)


def contact_email(body: ContactBody) -> tuple[str, str]:
    """The founder's e-mail about one message: its subject and its HTML, every
    word the person typed escaped."""
    name = f"{body.firstName} {body.lastName}"
    website = body.website.strip()
    rows = [
        ("Name", escape(name)),
        (
            "E-mail",
            f'<a href="mailto:{escape(str(body.email))}">{escape(str(body.email))}</a>',
        ),
        ("Company website", escape(website) or "None given"),
        ("Country", escape(body.country.strip()) or "None given"),
    ]
    table = "".join(
        f'<tr><td style="padding:4px 16px 4px 0;color:#6e6e73">{label}</td><td style="padding:4px 0">{value}</td></tr>'
        for label, value in rows
    )
    message = escape(body.message).replace("\n", "<br>")
    html = (
        '<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f">'
        f"<p>A message from the contact form on simeonlabs.com. Reply to this e-mail to answer {escape(body.firstName)}.</p>"
        f'<table style="border-collapse:collapse;margin:16px 0">{table}</table>'
        f'<p style="white-space:normal">{message}</p></div>'
    )
    subject = f"{name} wrote from simeonlabs.com" + (f" ({website})" if website else "")
    return subject, html


@router.post("/api/contact", name="desktop:contact")
async def contact(body: ContactBody) -> JSONResponse:
    if body.address.strip():
        log.info("desktop.contact.dropped", reason="hidden_field")
        return JSONResponse({"code": 0, "data": {"sent": True}})
    subject, html = contact_email(body)
    enqueue_email(
        to_email_addr=settings.CONTACT_EMAIL,
        subject=subject,
        html_content=html,
        reply_to_name=f"{body.firstName} {body.lastName}",
        reply_to_email_addr=str(body.email),
    )
    log.info(
        "desktop.contact.received",
        to=settings.CONTACT_EMAIL,
        country=body.country.strip() or None,
        website=bool(body.website.strip()),
    )
    return JSONResponse({"code": 0, "data": {"sent": True}})
