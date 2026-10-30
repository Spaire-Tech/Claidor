"""The title on every page this host draws in a browser, set as the web
app's "Log in or sign up" (clients/apps/web/src/components/Auth/AuthShell.tsx):
Geist at 24, regular (the founder, 30 October 2026: "match the size and font
of log in or sign up … i want to maintain a consistency"). The sign-in pages
(`app_sign_in._page`), the page after an app is connected (`apps.py`) and
the Slack and GitHub install pages (`sand/listeners_connections.py`) put
`HEADING_CSS` in their style and `HEADING_STYLE` in their `h1` rule.

Geist is served from this host (`fonts/`), so those pages still load
nothing from anywhere else; until it arrives the system face stands in."""

from pathlib import Path

from fastapi.responses import Response

from simeon.routing import APIRouter

#: Where the pages ask for the font (`router`, under the desktop prefix).
FONT_PATH = "/desktop/fonts/geist-400.woff2"

_FONT = (Path(__file__).parent / "fonts" / "geist-400.woff2").read_bytes()

HEADING_CSS = (
    '@font-face{font-family:"Geist";font-style:normal;font-weight:400;'
    f'font-display:swap;src:url({FONT_PATH}) format("woff2")}}'
)

#: The `h1` rule's face and size, without its margins.
HEADING_STYLE = (
    'font-family:"Geist",-apple-system,BlinkMacSystemFont,"Helvetica Neue",'
    "Arial,sans-serif;font-size:24px;font-weight:400;line-height:1.25;"
    "letter-spacing:-.01em;text-wrap:balance"
)

router = APIRouter(include_in_schema=False)


@router.get("/fonts/geist-400.woff2", name="desktop:heading_font")
async def heading_font() -> Response:
    """The file never changes under this name: a new one gets a new name."""
    return Response(
        _FONT,
        media_type="font/woff2",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
