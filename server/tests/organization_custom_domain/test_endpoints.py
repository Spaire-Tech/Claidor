import uuid

import pytest
from httpx import AsyncClient
from pytest_mock import MockerFixture

from polar.models import Organization, UserOrganization
from tests.fixtures.auth import AuthSubjectFixture


@pytest.mark.asyncio
class TestGetCustomDomain:
    async def test_anonymous(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.get(
            f"/v1/organizations/{organization.id}/custom-domain"
        )
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_not_member(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.get(
            f"/v1/organizations/{organization.id}/custom-domain"
        )
        assert response.status_code == 404

    @pytest.mark.auth
    async def test_not_existing(self, client: AsyncClient) -> None:
        response = await client.get(f"/v1/organizations/{uuid.uuid4()}/custom-domain")
        assert response.status_code == 404

    @pytest.mark.auth(
        AuthSubjectFixture(subject="user"),
        AuthSubjectFixture(subject="organization"),
    )
    async def test_unconfigured(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.get(
            f"/v1/organizations/{organization.id}/custom-domain"
        )

        assert response.status_code == 200
        json = response.json()
        assert json["domain"] is None
        assert json["status"] is None
        assert json["dns_records"] == []


@pytest.mark.asyncio
class TestSetCustomDomain:
    async def test_anonymous(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.put(
            f"/v1/organizations/{organization.id}/custom-domain",
            json={"domain": "learn.creator.com"},
        )
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_valid(
        self,
        mocker: MockerFixture,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        enqueue_job_mock = mocker.patch(
            "polar.organization_custom_domain.service.enqueue_job"
        )

        response = await client.put(
            f"/v1/organizations/{organization.id}/custom-domain",
            json={"domain": "Learn.Creator.com"},
        )

        assert response.status_code == 200
        json = response.json()
        assert json["domain"] == "learn.creator.com"
        assert json["status"] == "pending"
        record_types = {record["type"] for record in json["dns_records"]}
        assert record_types == {"CNAME", "TXT"}
        enqueue_job_mock.assert_called_once()

    @pytest.mark.auth
    async def test_invalid_apex(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.put(
            f"/v1/organizations/{organization.id}/custom-domain",
            json={"domain": "creator.com"},
        )
        assert response.status_code == 422


@pytest.mark.asyncio
class TestVerifyCustomDomain:
    @pytest.mark.auth
    async def test_unconfigured(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.post(
            f"/v1/organizations/{organization.id}/custom-domain/verify"
        )
        assert response.status_code == 200
        assert response.json()["domain"] is None

    @pytest.mark.auth
    async def test_verify_pending(
        self,
        mocker: MockerFixture,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        mocker.patch("polar.organization_custom_domain.service.enqueue_job")

        async def resolve(name: str, record_type: str) -> list[str]:
            return []

        mocker.patch(
            "polar.organization_custom_domain.service.dns.resolve",
            side_effect=resolve,
        )

        set_response = await client.put(
            f"/v1/organizations/{organization.id}/custom-domain",
            json={"domain": "learn.creator.com"},
        )
        assert set_response.status_code == 200

        response = await client.post(
            f"/v1/organizations/{organization.id}/custom-domain/verify"
        )

        assert response.status_code == 200
        json = response.json()
        assert json["status"] == "pending"
        assert json["checks"] == {"cname_ok": False, "txt_ok": False}
        assert json["last_checked_at"] is not None


@pytest.mark.asyncio
class TestDeleteCustomDomain:
    @pytest.mark.auth
    async def test_unconfigured(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.delete(
            f"/v1/organizations/{organization.id}/custom-domain"
        )
        assert response.status_code == 404

    @pytest.mark.auth
    async def test_valid(
        self,
        mocker: MockerFixture,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        mocker.patch("polar.organization_custom_domain.service.enqueue_job")
        set_response = await client.put(
            f"/v1/organizations/{organization.id}/custom-domain",
            json={"domain": "learn.creator.com"},
        )
        assert set_response.status_code == 200

        response = await client.delete(
            f"/v1/organizations/{organization.id}/custom-domain"
        )
        assert response.status_code == 204

        get_response = await client.get(
            f"/v1/organizations/{organization.id}/custom-domain"
        )
        assert get_response.json()["domain"] is None
