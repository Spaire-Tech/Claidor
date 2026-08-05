"""Payout-hold: while a creator owes Spaire, their merchant balance is held.

Spaire is the merchant of record, so the balance we'd pay out is leverage.
If a creator org's own Spaire subscription is `past_due` (a charge failed and
dunning is running), both the payout *estimate* and *creation* are refused
until they settle. A healthy plan — or no platform billing at all — lets
payouts through unchanged.
"""

from functools import partial
from unittest.mock import MagicMock

import pytest
from pytest_mock import MockerFixture

from polar.enums import SubscriptionRecurringInterval
from polar.integrations.stripe.service import StripeService
from polar.locker import Locker
from polar.models import Organization, Transaction, User
from polar.models.subscription import SubscriptionStatus
from polar.payout.service import AccountDelinquent
from polar.payout.service import payout as payout_service
from polar.postgres import AsyncSession
from polar.transaction.service.payout import PayoutTransactionService
from tests.fixtures import random_objects as ro
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_account,
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


@pytest.fixture(autouse=True)
def payout_transaction_service_mock(mocker: MockerFixture) -> MagicMock:
    mock = MagicMock(spec=PayoutTransactionService)
    mocker.patch("polar.payout.service.payout_transaction_service", new=mock)
    return mock


@pytest.fixture(autouse=True)
def stripe_service_mock(mocker: MockerFixture) -> MagicMock:
    mock = MagicMock(spec=StripeService)
    mocker.patch("polar.payout.service.stripe_service", new=mock)
    return mock


create_payment_transaction = partial(ro.create_payment_transaction, amount=10000)
create_balance_transaction = partial(ro.create_balance_transaction, amount=10000)


async def _platform_plan(
    save_fixture: SaveFixture,
    mocker: MockerFixture,
    *,
    creator: Organization,
    status: SubscriptionStatus,
) -> None:
    """Configure a platform org and give `creator` a Spaire subscription in
    the given status (the creator is a Customer of the platform org)."""
    platform_org = await create_organization(save_fixture)
    mocker.patch(
        "polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
    )
    prices: list[PriceFixtureType] = [(4900, "usd")]
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=prices,
    )
    product.user_metadata = {"tier": "starter"}
    await save_fixture(product)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email=f"creator-{creator.id}@billing.spaire",
        user_metadata={"creator_org_id": str(creator.id)},
    )
    await create_subscription(
        save_fixture, product=product, customer=customer, status=status
    )


@pytest.mark.asyncio
class TestDelinquencyHold:
    async def test_create_blocked_when_plan_past_due(
        self,
        mocker: MockerFixture,
        save_fixture: SaveFixture,
        session: AsyncSession,
        locker: Locker,
        organization: Organization,
        user: User,
    ) -> None:
        await _platform_plan(
            save_fixture,
            mocker,
            creator=organization,
            status=SubscriptionStatus.past_due,
        )
        account = await create_account(save_fixture, organization, user)
        # Plenty of withdrawable balance — the hold blocks anyway.
        await create_balance_transaction(
            save_fixture, account=account, amount=100000
        )

        with pytest.raises(AccountDelinquent):
            await payout_service.create(session, locker, account=account)

    async def test_estimate_blocked_when_plan_past_due(
        self,
        mocker: MockerFixture,
        save_fixture: SaveFixture,
        session: AsyncSession,
        organization: Organization,
        user: User,
    ) -> None:
        await _platform_plan(
            save_fixture,
            mocker,
            creator=organization,
            status=SubscriptionStatus.past_due,
        )
        account = await create_account(save_fixture, organization, user)
        await create_balance_transaction(
            save_fixture, account=account, amount=100000
        )

        with pytest.raises(AccountDelinquent):
            await payout_service.estimate(session, account=account)

    async def test_payout_allowed_when_plan_active(
        self,
        mocker: MockerFixture,
        save_fixture: SaveFixture,
        session: AsyncSession,
        locker: Locker,
        organization: Organization,
        user: User,
        payout_transaction_service_mock: MagicMock,
    ) -> None:
        # A healthy (active) Spaire plan does not hold payouts.
        await _platform_plan(
            save_fixture,
            mocker,
            creator=organization,
            status=SubscriptionStatus.active,
        )
        account = await create_account(save_fixture, organization, user)
        payment_transaction = await create_payment_transaction(save_fixture)
        await create_balance_transaction(
            save_fixture, account=account, payment_transaction=payment_transaction
        )
        payout_transaction_service_mock.create.return_value = Transaction()

        payout = await payout_service.create(session, locker, account=account)
        assert payout.account == account
