from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from polar.models import EmailSubscriber, FormSubmission, Organization, UserOrganization
from polar.models.custom_field import CustomFieldType
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_custom_field


async def _create_form(
    client: AsyncClient,
    organization: Organization,
    **overrides: Any,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Get the guide",
        "subtitle": "Join the list",
        "button_label": "Download",
        "status": "published",
        "organization_id": str(organization.id),
        "attached_custom_fields": [],
    }
    body.update(overrides)
    response = await client.post("/v1/forms/", json=body)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
class TestCreateForm:
    async def test_anonymous(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.post(
            "/v1/forms/",
            json={"title": "X", "organization_id": str(organization.id)},
        )
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_valid(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        form = await _create_form(client, organization, title="Free checklist")

        assert form["title"] == "Free checklist"
        assert form["button_label"] == "Download"
        assert form["status"] == "published"
        assert form["slug"]
        assert form["attached_custom_fields"] == []

    @pytest.mark.auth
    async def test_defaults_to_draft(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.post(
            "/v1/forms/",
            json={
                "title": "Draft form",
                "organization_id": str(organization.id),
            },
        )
        assert response.status_code == 201, response.text
        json = response.json()
        assert json["status"] == "draft"
        assert json["button_label"] == "Submit"

    @pytest.mark.auth
    async def test_title_too_long(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.post(
            "/v1/forms/",
            json={
                "title": "x" * 51,
                "organization_id": str(organization.id),
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
class TestListForms:
    async def test_anonymous(self, client: AsyncClient) -> None:
        response = await client.get("/v1/forms/")
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_valid(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        await _create_form(client, organization)

        response = await client.get(
            "/v1/forms/", params={"organization_id": str(organization.id)}
        )
        assert response.status_code == 200
        json = response.json()
        assert json["pagination"]["total_count"] == 1


@pytest.mark.asyncio
class TestUpdateForm:
    @pytest.mark.auth
    async def test_valid(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        form = await _create_form(client, organization)

        response = await client.patch(
            f"/v1/forms/{form['id']}",
            json={"title": "Updated title", "status": "draft"},
        )
        assert response.status_code == 200, response.text
        json = response.json()
        assert json["title"] == "Updated title"
        assert json["status"] == "draft"
        # Untouched fields are preserved.
        assert json["button_label"] == "Download"


@pytest.mark.asyncio
class TestDeleteForm:
    @pytest.mark.auth
    async def test_valid(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        form = await _create_form(client, organization)

        response = await client.delete(f"/v1/forms/{form['id']}")
        assert response.status_code == 204

        response = await client.get(f"/v1/forms/{form['id']}")
        assert response.status_code == 404


@pytest.mark.asyncio
class TestGetPublicForm:
    @pytest.mark.auth
    async def test_published_is_public(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        form = await _create_form(client, organization, title="Public form")

        response = await client.get(f"/v1/forms/{form['id']}/public")
        assert response.status_code == 200, response.text
        json = response.json()
        assert json["title"] == "Public form"
        assert json["has_lead_magnet"] is False


@pytest.mark.asyncio
class TestSubmitForm:
    @pytest.mark.auth
    async def test_draft_not_submittable(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        form = await _create_form(client, organization, status="draft")

        response = await client.post(
            f"/v1/forms/{form['id']}/submit",
            json={"email": "lead@example.com"},
        )
        assert response.status_code == 404

    @pytest.mark.auth
    async def test_valid_creates_subscriber_and_submission(
        self,
        client: AsyncClient,
        session: AsyncSession,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        form = await _create_form(client, organization)

        response = await client.post(
            f"/v1/forms/{form['id']}/submit",
            json={"email": "Lead@Example.com", "name": "Lead"},
        )
        assert response.status_code == 201, response.text
        json = response.json()
        assert json["success"] is True
        # No lead magnet attached → no download payload.
        assert json["download"] is None

        submissions = (
            await session.execute(
                select(func.count())
                .select_from(FormSubmission)
                .where(FormSubmission.form_id == form["id"])
            )
        ).scalar()
        assert submissions == 1

        subscriber = (
            await session.execute(
                select(EmailSubscriber).where(
                    EmailSubscriber.organization_id == organization.id,
                    EmailSubscriber.email == "lead@example.com",
                )
            )
        ).scalar_one_or_none()
        assert subscriber is not None
        assert subscriber.source == "lead_magnet"

    @pytest.mark.auth
    async def test_required_custom_field_missing(
        self,
        client: AsyncClient,
        save_fixture: SaveFixture,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        custom_field = await create_custom_field(
            save_fixture,
            type=CustomFieldType.text,
            slug="company",
            organization=organization,
            name="Company",
        )
        form = await _create_form(
            client,
            organization,
            attached_custom_fields=[
                {"custom_field_id": str(custom_field.id), "required": True}
            ],
        )

        # Missing the required custom field value.
        response = await client.post(
            f"/v1/forms/{form['id']}/submit",
            json={"email": "lead@example.com", "custom_field_data": {}},
        )
        assert response.status_code == 422

        # Now provide it.
        response = await client.post(
            f"/v1/forms/{form['id']}/submit",
            json={
                "email": "lead@example.com",
                "custom_field_data": {"company": "Acme"},
            },
        )
        assert response.status_code == 201, response.text
