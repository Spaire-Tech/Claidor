"""The box proxy's paths carry the box gateway's bearer, which belongs to
no person, so the API's sign-in layer leaves them to the proxy. The first
live cloud box (28 September 2026) had every proxied call refused 401 by
this layer before the proxy ran; /health passed only because it carried
no bearer."""

import pytest
from starlette.requests import Request

from polar.auth.middlewares import get_auth_subject, is_box_proxy_path
from polar.auth.models import Anonymous
from polar.oauth2.exceptions import InvalidTokenError
from polar.postgres import AsyncSession

BOX = "1da35e98-a0cb-4cbc-9612-69333079cc45"
GATEWAY_BEARER = "ab" * 32


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": b"",
            "headers": [(b"authorization", f"Bearer {GATEWAY_BEARER}".encode())],
        }
    )


def test_the_box_proxy_paths() -> None:
    assert is_box_proxy_path(f"/sand-box/{BOX}/p/1340")
    assert is_box_proxy_path(f"/sand-box/{BOX}/p/1340/events")
    assert is_box_proxy_path(f"/sand-box/{BOX}/p/6080/vnc.html")
    assert not is_box_proxy_path("/sand-box/inference-credential")
    assert not is_box_proxy_path("/sand-box/local-exec-connection")
    assert not is_box_proxy_path(f"/sand-box/{BOX}/p/1340x")
    assert not is_box_proxy_path("/v1/products/")


@pytest.mark.asyncio
async def test_a_gateway_bearer_on_a_proxy_path_is_nobody_not_an_error(
    session: AsyncSession,
) -> None:
    subject = await get_auth_subject(
        _request(f"/sand-box/{BOX}/p/1340/events"), session
    )
    assert isinstance(subject.subject, Anonymous)


@pytest.mark.asyncio
async def test_the_same_bearer_anywhere_else_is_still_refused(
    session: AsyncSession,
) -> None:
    with pytest.raises(InvalidTokenError):
        await get_auth_subject(_request("/v1/products/"), session)
