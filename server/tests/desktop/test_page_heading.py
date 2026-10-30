"""The title on this host's own pages (`simeon.desktop.page_heading`): the
web app's "Log in or sign up", Geist at 24 and regular, with the font served
from here. No database."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from simeon.desktop import app_sign_in, apps, page_heading
from simeon.desktop.page_heading import FONT_PATH, HEADING_CSS, HEADING_STYLE
from simeon.sand import listeners_connections


@pytest.fixture
def client() -> AsyncClient:
    app = FastAPI()
    app.include_router(page_heading.router, prefix="/desktop")
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_the_font_is_served_from_this_host_and_kept(
    client: AsyncClient,
) -> None:
    response = await client.get(FONT_PATH)
    assert response.status_code == 200
    assert response.headers["content-type"] == "font/woff2"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.content[:4] == b"wOF2"


def test_the_title_is_the_web_sign_in_s() -> None:
    assert f"url({FONT_PATH})" in HEADING_CSS
    for part in (
        'font-family:"Geist"',
        "font-size:24px",
        "font-weight:400",
        "line-height:1.25",
        "letter-spacing:-.01em",
    ):
        assert part in HEADING_STYLE


def test_every_page_of_this_host_wears_it() -> None:
    sign_in = app_sign_in._page("Signed in", "<p>Back to the app.</p>").body.decode()
    connected = apps._CONNECTED_PAGE.format(
        lang="en",
        heading_css=HEADING_CSS,
        heading_style=HEADING_STYLE,
        title="Connected",
        body="Close this tab.",
    )
    install = listeners_connections._page("Slack connected", "Done.").body.decode()
    for page in (sign_in, connected, install):
        assert HEADING_CSS in page
        assert HEADING_STYLE in page
        assert "<h1>" in page
