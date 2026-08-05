import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from polar.config import settings
from polar.kit import jwt
from polar.models import Customer
from tests.fixtures.auth import CUSTOMER_AUTH_SUBJECT


@pytest.mark.asyncio
class TestAuthorize:
    async def test_anonymous_is_rejected(self, client: AsyncClient) -> None:
        """Regression: an anonymous caller must NOT be able to start the OAuth
        flow for an arbitrary customer id.

        Previously the anonymous branch trusted the ``customer_id`` query
        parameter and signed it into the state, which the callback then used to
        mint a real session token for that customer (account takeover).
        """
        response = await client.get(
            "/v1/customer-portal/oauth-accounts/authorize",
            params={
                "platform": "github",
                "customer_id": str(uuid.uuid4()),
            },
        )
        assert response.status_code == 401

    @pytest.mark.auth(CUSTOMER_AUTH_SUBJECT)
    async def test_authenticated_ignores_customer_id_query_param(
        self, client: AsyncClient, customer: Customer
    ) -> None:
        """The state is always bound to the authenticated subject's own customer
        id; a supplied ``customer_id`` query param is ignored, so a logged-in
        customer cannot mint a state (and session) for a different customer."""
        other_customer_id = uuid.uuid4()
        response = await client.get(
            "/v1/customer-portal/oauth-accounts/authorize",
            params={
                "platform": "github",
                "customer_id": str(other_customer_id),
            },
        )
        assert response.status_code == 200

        url = response.json()["url"]
        state = parse_qs(urlparse(url).query)["state"][0]
        decoded = jwt.decode(token=state, secret=settings.SECRET, type="customer_oauth")

        assert decoded["customer_id"] == str(customer.id)
        assert decoded["customer_id"] != str(other_customer_id)

    @pytest.mark.auth(CUSTOMER_AUTH_SUBJECT)
    async def test_authenticated_without_customer_id_still_works(
        self, client: AsyncClient, customer: Customer
    ) -> None:
        """The ``customer_id`` query param is now optional (derived from auth)."""
        response = await client.get(
            "/v1/customer-portal/oauth-accounts/authorize",
            params={"platform": "github"},
        )
        assert response.status_code == 200
        url = response.json()["url"]
        state = parse_qs(urlparse(url).query)["state"][0]
        decoded = jwt.decode(token=state, secret=settings.SECRET, type="customer_oauth")
        assert decoded["customer_id"] == str(customer.id)


@pytest.mark.asyncio
class TestCallback:
    async def test_invalid_state_is_rejected(self, client: AsyncClient) -> None:
        """A fabricated/unsigned state must be rejected (it could otherwise be
        used to mint a session). Returns 403, not a redirect carrying a token."""
        response = await client.get(
            "/v1/customer-portal/oauth-accounts/callback",
            params={"state": "not-a-valid-jwt"},
            follow_redirects=False,
        )
        assert response.status_code == 403
        # No session token must be handed out on the rejection path.
        assert "customer_session_token" not in response.headers.get("location", "")

    async def test_callback_requires_state(self, client: AsyncClient) -> None:
        """The state parameter is required."""
        response = await client.get(
            "/v1/customer-portal/oauth-accounts/callback",
            follow_redirects=False,
        )
        assert response.status_code == 422
