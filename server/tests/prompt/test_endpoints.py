"""The cabinet's saved prompts are shared, and scoped to the workspace."""

import pytest
from httpx import AsyncClient

from polar.models import Organization, UserOrganization
from tests.fixtures.random_objects import create_organization


@pytest.mark.asyncio
class TestSavedPrompts:
    async def test_anonymous_is_refused(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.get(f"/v1/prompts?organization_id={organization.id}")
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_saved_then_listed(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        created = await client.post(
            f"/v1/prompts?organization_id={organization.id}",
            json={
                "title": "Contestation de saisie",
                "text": "Dans quel délai contester une saisie-attribution ?",
            },
        )
        assert created.status_code == 201

        rows = (
            await client.get(f"/v1/prompts?organization_id={organization.id}")
        ).json()
        assert [r["title"] for r in rows] == ["Contestation de saisie"]

    @pytest.mark.auth
    async def test_a_removed_prompt_disappears(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        prompt = (
            await client.post(
                f"/v1/prompts?organization_id={organization.id}",
                json={"title": "À retirer", "text": "question devenue inutile"},
            )
        ).json()

        deleted = await client.delete(
            f"/v1/prompts/{prompt['id']}?organization_id={organization.id}"
        )
        assert deleted.status_code == 204

        rows = (
            await client.get(f"/v1/prompts?organization_id={organization.id}")
        ).json()
        assert rows == []

    @pytest.mark.auth
    async def test_another_workspaces_prompts_are_not_listed(
        self,
        client: AsyncClient,
        save_fixture: object,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        other = await create_organization(save_fixture)  # type: ignore[arg-type]
        await client.post(
            f"/v1/prompts?organization_id={organization.id}",
            json={"title": "Le nôtre", "text": "notre question"},
        )

        rows = (await client.get(f"/v1/prompts?organization_id={other.id}")).json()
        assert rows == []

    @pytest.mark.auth
    async def test_an_empty_title_is_refused(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.post(
            f"/v1/prompts?organization_id={organization.id}",
            json={"title": "", "text": "question"},
        )
        assert response.status_code == 422
