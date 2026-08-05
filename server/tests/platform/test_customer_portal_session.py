"""The platform customer-portal-session ("Manage billing") must not 500.

customer_portal_url reads customer.organization.slug, and Customer.organization
is lazy="raise". The platform portal-session flow fetches the customer via
get_for_creator_org, which must eager-load the organization (load_organization=
True) or building the response raises and the endpoint 500s.
"""

import pytest
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.ext.asyncio import AsyncSession

from polar.customer_session.service import (
    customer_session as customer_session_service,
)
from polar.platform.repository import platform_customer_repository
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_customer, create_organization


@pytest.mark.asyncio
class TestPlatformCustomerPortalSession:
    async def test_portal_url_builds_when_organization_eager_loaded(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        await create_customer(
            save_fixture,
            organization=platform_org,
            user_metadata={"creator_org_id": str(creator.id)},
        )

        repo = platform_customer_repository(session)
        customer = await repo.get_for_creator_org(
            platform_org.id, creator.id, load_organization=True
        )
        assert customer is not None

        token, cs = await customer_session_service.create_customer_session(
            session, customer, return_url=None
        )
        cs.raw_token = token

        # Used to raise (lazy="raise" on an unloaded customer.organization) -> 500.
        url = cs.customer_portal_url
        assert platform_org.slug in url
        assert "customer_session_token" in url

    async def test_default_does_not_load_organization(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # Guards the hot-path default: other callers (entitlements, payout-hold)
        # don't want the extra load, so it stays opt-in.
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        await create_customer(
            save_fixture,
            organization=platform_org,
            user_metadata={"creator_org_id": str(creator.id)},
        )

        repo = platform_customer_repository(session)
        customer = await repo.get_for_creator_org(platform_org.id, creator.id)
        assert customer is not None
        with pytest.raises(InvalidRequestError):
            _ = customer.organization
