from typing import Any
from urllib.parse import urlencode

from fastapi import Depends, Request
from fastapi.responses import RedirectResponse

from simeon.config import settings
from simeon.routing import APIRouter

from ..authorization_server import AuthorizationServer
from ..dependencies import get_authorization_server
from ..metadata import get_server_metadata

router = APIRouter(prefix="/.well-known", tags=["well_known"], include_in_schema=False)


@router.get("/jwks.json", name="well_known.jwks")
async def well_known_jwks() -> dict[str, Any]:
    return settings.JWKS.as_dict(is_private=False)


@router.get("/oauth-authorization-server", name="well_known.oauth_authorization_server")
@router.get("/openid-configuration", name="well_known.openid_configuration")
async def well_known_openid_configuration(
    request: Request,
    authorization_server: AuthorizationServer = Depends(get_authorization_server),
) -> dict[str, Any]:
    def _url_for(name: str) -> str:
        return str(request.url_for(name))

    metadata = get_server_metadata(authorization_server, _url_for)
    return metadata.model_dump(exclude_unset=True)


# The sign-in page's door on the server's own address (10 November 2026): the
# page is on app.simeonlabs.com, but an MCP client (Codex) refuses an
# authorization endpoint whose origin isn't the authorization server's. The
# metadata names this door; it sends the browser on to the page, query intact.
authorize_page_router = APIRouter(include_in_schema=False)


@authorize_page_router.get("/oauth2/authorize", name="oauth2:authorize_page")
async def authorize_page(request: Request) -> RedirectResponse:
    query = urlencode(list(request.query_params.multi_items()))
    target = f"{settings.FRONTEND_BASE_URL}/oauth2/authorize"
    return RedirectResponse(f"{target}?{query}" if query else target, status_code=302)
