from uuid import uuid4

import pytest
from pytest_mock import MockerFixture

from polar.platform.service import (
    PlatformOrganizationNotConfigured,
    PlatformOrganizationNotFound,
    platform,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization


class TestIsConfigured:
    def test_unset(self, mocker: MockerFixture) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", None)
        assert platform.is_configured() is False

    def test_set(self, mocker: MockerFixture) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", uuid4())
        assert platform.is_configured() is True


class TestIsPlatformOrganization:
    def test_unset_returns_false(self, mocker: MockerFixture) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", None)
        assert platform.is_platform_organization(uuid4()) is False

    def test_matching_id(self, mocker: MockerFixture) -> None:
        platform_id = uuid4()
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_id)
        assert platform.is_platform_organization(platform_id) is True

    def test_non_matching_id(self, mocker: MockerFixture) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", uuid4())
        assert platform.is_platform_organization(uuid4()) is False


class TestGetId:
    def test_unset_raises(self, mocker: MockerFixture) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", None)
        with pytest.raises(PlatformOrganizationNotConfigured):
            platform.get_id()

    def test_set_returns(self, mocker: MockerFixture) -> None:
        platform_id = uuid4()
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_id)
        assert platform.get_id() == platform_id


@pytest.mark.asyncio
class TestGet:
    async def test_unset_raises(
        self, mocker: MockerFixture, session: AsyncSession
    ) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", None)
        with pytest.raises(PlatformOrganizationNotConfigured):
            await platform.get(session)

    async def test_missing_org_raises(
        self, mocker: MockerFixture, session: AsyncSession
    ) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", uuid4())
        with pytest.raises(PlatformOrganizationNotFound):
            await platform.get(session)

    async def test_existing_org_returns(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        organization = await create_organization(save_fixture)
        mocker.patch(
            "polar.platform.service.settings.PLATFORM_ORG_ID", organization.id
        )

        loaded = await platform.get(session)

        assert loaded.id == organization.id
