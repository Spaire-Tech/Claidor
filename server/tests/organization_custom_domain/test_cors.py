import pytest
from httpx import AsyncClient
from pytest_mock import MockerFixture

from polar.organization_custom_domain import cors


def _patch_active(mocker: MockerFixture, domains: set[str]) -> None:
    mocker.patch.object(cors, "_active_domains", frozenset(domains))


class TestIsActiveCustomDomainOrigin:
    def test_active_domain(self, mocker: MockerFixture) -> None:
        _patch_active(mocker, {"learn.creator.com"})
        assert cors.is_active_custom_domain_origin("https://learn.creator.com")

    def test_case_insensitive(self, mocker: MockerFixture) -> None:
        _patch_active(mocker, {"learn.creator.com"})
        assert cors.is_active_custom_domain_origin("https://Learn.Creator.COM")

    def test_unknown_domain(self, mocker: MockerFixture) -> None:
        _patch_active(mocker, {"learn.creator.com"})
        assert not cors.is_active_custom_domain_origin("https://evil.example.com")

    def test_http_rejected(self, mocker: MockerFixture) -> None:
        _patch_active(mocker, {"learn.creator.com"})
        assert not cors.is_active_custom_domain_origin("http://learn.creator.com")

    def test_empty_set(self, mocker: MockerFixture) -> None:
        _patch_active(mocker, set())
        assert not cors.is_active_custom_domain_origin("https://learn.creator.com")


@pytest.mark.asyncio
class TestCORSMiddleware:
    """Drive real preflight requests through the app's CORSMatcherMiddleware.

    The web client sends credentials: 'include' on every request; browsers
    only accept that when ACAO echoes the exact origin AND
    access-control-allow-credentials is true — the wildcard `*` config is
    rejected. These tests pin that active custom domains get the
    credentialed config and unknown origins keep the wildcard one.
    """

    async def test_active_domain_gets_credentialed_cors(
        self, client: AsyncClient, mocker: MockerFixture
    ) -> None:
        _patch_active(mocker, {"learn.creator.com"})

        response = await client.options(
            "/v1/customer-portal/organizations/some-slug",
            headers={
                "Origin": "https://learn.creator.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )

        assert response.status_code == 200
        assert (
            response.headers["access-control-allow-origin"]
            == "https://learn.creator.com"
        )
        assert response.headers["access-control-allow-credentials"] == "true"

    async def test_unknown_origin_falls_through_to_wildcard(
        self, client: AsyncClient, mocker: MockerFixture
    ) -> None:
        _patch_active(mocker, {"learn.creator.com"})

        response = await client.options(
            "/v1/customer-portal/organizations/some-slug",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "*"
        # The wildcard config must NOT allow credentials.
        assert "access-control-allow-credentials" not in response.headers
