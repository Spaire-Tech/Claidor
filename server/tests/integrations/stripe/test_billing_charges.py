"""Stripe Billing's own charges (Simeon's plans, `simeon.plans`) pass
through the shop's webhook handlers: they come off an invoice, carry none
of the shop's metadata, and the shop has nothing to record for them.
Before 6 October 2026 `charge.succeeded` on one raised
`UnlinkedPaymentError` (a `Payment` with no organisation)."""

import uuid

import pytest
from pytest_mock import MockerFixture

from simeon.integrations.stripe import payment
from simeon.integrations.stripe.tasks import (
    charge_failed,
    charge_pending,
    charge_succeeded,
)
from simeon.postgres import AsyncSession
from tests.fixtures.stripe import build_stripe_charge


def _billing_charge(status: str = "succeeded") -> object:
    return build_stripe_charge(
        id="ch_billing",
        status=status,
        customer="cus_test",
        invoice="in_test",
        payment_intent="pi_test",
        metadata={},
        billing_details={"email": "person@example.com"},
        payment_method_details={"type": "card", "card": {"last4": "4242"}},
    )


def _event(mocker: MockerFixture, charge: object) -> None:
    event_mock = mocker.MagicMock()
    event_mock.stripe_data.data.object = charge
    context_mock = mocker.patch(
        "simeon.integrations.stripe.tasks.external_event_service.handle_stripe"
    )
    context_mock.return_value.__aenter__ = mocker.AsyncMock(return_value=event_mock)
    context_mock.return_value.__aexit__ = mocker.AsyncMock(return_value=None)


class TestBelongsToTheShop:
    def test_an_invoice_charge_is_not_the_shop_s(self) -> None:
        assert not payment.belongs_to_the_shop(_billing_charge())  # type: ignore[arg-type]

    def test_the_shop_s_metadata_is_recognised(self) -> None:
        for key in ("checkout_id", "order_id", "wallet_id", "wallet_transaction_id"):
            charge = build_stripe_charge(metadata={key: str(uuid.uuid4())})
            assert payment.belongs_to_the_shop(charge)


@pytest.mark.asyncio
class TestBillingChargesPassThrough:
    async def test_succeeded(
        self, session: AsyncSession, mocker: MockerFixture
    ) -> None:
        _event(mocker, _billing_charge())
        upsert = mocker.patch(
            "simeon.integrations.stripe.payment.payment_service.upsert_from_stripe_charge"
        )
        await charge_succeeded(uuid.uuid4())
        upsert.assert_not_called()

    async def test_pending(self, session: AsyncSession, mocker: MockerFixture) -> None:
        _event(mocker, _billing_charge("pending"))
        upsert = mocker.patch(
            "simeon.integrations.stripe.tasks.payment_service.upsert_from_stripe_charge"
        )
        await charge_pending(uuid.uuid4())
        upsert.assert_not_called()

    async def test_failed(self, session: AsyncSession, mocker: MockerFixture) -> None:
        _event(mocker, _billing_charge("failed"))
        upsert = mocker.patch(
            "simeon.integrations.stripe.payment.payment_service.upsert_from_stripe_charge"
        )
        await charge_failed(uuid.uuid4())
        upsert.assert_not_called()
