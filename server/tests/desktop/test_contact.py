"""The website's contact form (`simeon.desktop.contact`): what reaches the
founder's inbox, what is refused, and the hidden field. No database."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import contact

FORM = {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "email": "ada@example.com",
    "website": "example.com",
    "country": "United Kingdom",
    "message": "We run three cafés.\nCan we see a demo?",
}


@pytest.fixture
def client() -> AsyncClient:
    app = FastAPI()
    app.include_router(contact.router, prefix="/desktop")
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_a_message_is_emailed_to_the_founder_with_the_person_as_reply_to(
    client: AsyncClient, mocker: MockerFixture
) -> None:
    sent = mocker.patch("simeon.desktop.contact.enqueue_email")
    response = await client.post("/desktop/api/contact", json=FORM)
    assert response.status_code == 200
    assert response.json() == {"code": 0, "data": {"sent": True}}
    sent.assert_called_once()
    kwargs = sent.call_args.kwargs
    assert kwargs["to_email_addr"] == settings.CONTACT_EMAIL == "bass@simeonlabs.com"
    assert kwargs["reply_to_email_addr"] == "ada@example.com"
    assert kwargs["reply_to_name"] == "Ada Lovelace"
    assert kwargs["subject"] == "Ada Lovelace wrote from simeonlabs.com (example.com)"
    assert "We run three cafés.<br>Can we see a demo?" in kwargs["html_content"]
    assert "United Kingdom" in kwargs["html_content"]


@pytest.mark.asyncio
async def test_what_the_person_typed_is_escaped(
    client: AsyncClient, mocker: MockerFixture
) -> None:
    sent = mocker.patch("simeon.desktop.contact.enqueue_email")
    form = {**FORM, "firstName": "<b>Ada</b>", "message": '<script>alert("x")</script>'}
    assert (await client.post("/desktop/api/contact", json=form)).status_code == 200
    html = sent.call_args.kwargs["html_content"]
    assert "<script>" not in html
    assert "<b>Ada</b>" not in html
    assert "&lt;script&gt;" in html


@pytest.mark.asyncio
async def test_the_hidden_field_filled_is_answered_as_sent_and_dropped(
    client: AsyncClient, mocker: MockerFixture
) -> None:
    sent = mocker.patch("simeon.desktop.contact.enqueue_email")
    response = await client.post(
        "/desktop/api/contact", json={**FORM, "address": "1 Main St"}
    )
    assert response.json() == {"code": 0, "data": {"sent": True}}
    sent.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        {"email": "not-an-email"},
        {"firstName": "   "},
        {"message": ""},
        {"message": "x" * 5001},
    ],
)
async def test_a_missing_or_wrong_field_is_refused(
    client: AsyncClient, mocker: MockerFixture, change: dict[str, str]
) -> None:
    sent = mocker.patch("simeon.desktop.contact.enqueue_email")
    response = await client.post("/desktop/api/contact", json={**FORM, **change})
    assert response.status_code == 422
    sent.assert_not_called()


@pytest.mark.asyncio
async def test_website_and_country_may_be_left_out(
    client: AsyncClient, mocker: MockerFixture
) -> None:
    sent = mocker.patch("simeon.desktop.contact.enqueue_email")
    form = {k: v for k, v in FORM.items() if k not in ("website", "country")}
    assert (await client.post("/desktop/api/contact", json=form)).status_code == 200
    assert sent.call_args.kwargs["subject"] == "Ada Lovelace wrote from simeonlabs.com"
    assert "None given" in sent.call_args.kwargs["html_content"]
