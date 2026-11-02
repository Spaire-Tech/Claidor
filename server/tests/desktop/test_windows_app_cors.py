"""The Windows app's page may call the API (windows/, step 7 of
docs/web-app/README.md): from its own `app://simeon` origin it sends the
window's headers and reads the ones the window reads, but never with a
cookie, and no other origin gains anything by it."""

import pytest
from httpx import AsyncClient

WINDOW_HEADERS = (
    "authorization,x-simeon-client-type,x-simeon-client-version,"
    "x-sand-box-namespace,accept-language,connect-protocol-version"
)


@pytest.mark.asyncio
class TestWindowsAppCORS:
    async def test_preflight_takes_the_windows_headers(
        self, client: AsyncClient
    ) -> None:
        response = await client.options(
            "/desktop/api/user/quota",
            headers={
                "Origin": "app://simeon",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": WINDOW_HEADERS,
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "app://simeon"
        allowed = response.headers["access-control-allow-headers"].lower()
        for header in WINDOW_HEADERS.split(","):
            assert header in allowed
        # A bearer, never a cookie.
        assert "access-control-allow-credentials" not in response.headers

    async def test_answers_expose_what_the_window_reads(
        self, client: AsyncClient
    ) -> None:
        response = await client.get(
            "/desktop/api/user/quota", headers={"Origin": "app://simeon"}
        )

        assert response.headers["access-control-allow-origin"] == "app://simeon"
        exposed = response.headers["access-control-expose-headers"].lower()
        assert "retry-after" in exposed
        assert "x-automation-failure-hint" in exposed
        assert "access-control-allow-credentials" not in response.headers

    async def test_another_app_scheme_stays_on_the_wildcard(
        self, client: AsyncClient
    ) -> None:
        response = await client.options(
            "/desktop/api/user/quota",
            headers={
                "Origin": "app://elsewhere",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": WINDOW_HEADERS,
            },
        )

        assert response.status_code == 400
        assert response.headers["access-control-allow-origin"] == "*"
        assert "access-control-allow-credentials" not in response.headers
