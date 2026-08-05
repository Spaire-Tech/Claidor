"""API tests for the Masterclass Architect endpoints.

NOTE: these require the full app fixtures (DB, client) and cannot run in
environments where the app can't boot; the import-light coverage for this
module lives in test_signals / test_youtube / test_architect_ai /
test_orchestration.
"""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestAnonymousAccess:
    async def test_create_requires_auth(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/masterclass-architect/analyses",
            json={
                "organization_id": str(uuid.uuid4()),
                "ref": "@somechannel",
            },
        )
        assert response.status_code == 401

    async def test_get_requires_auth(self, client: AsyncClient) -> None:
        response = await client.get(
            f"/v1/masterclass-architect/analyses/{uuid.uuid4()}"
        )
        assert response.status_code == 401

    async def test_faq_requires_auth(self, client: AsyncClient) -> None:
        response = await client.patch(
            f"/v1/masterclass-architect/analyses/{uuid.uuid4()}/faq",
            json={"faq_answer": "how do I stop three-putting"},
        )
        assert response.status_code == 401
