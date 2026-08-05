"""Spaire self-billing emails use the Spaire-branded transactional templates
— not the creator-commerce ones — and a $0 trial neither invoices the creator
nor enrolls them in Spaire's marketing automation.

A creator's Spaire plan order is sold BY the platform org (Spaire) TO the
creator-as-customer. The generic order-confirmation path would render the
platform org's own header ("Spaire / Spaire"), the "Merchant of Record … by
Spaire, Inc" footer, and a $0 invoice for a free trial. These tests pin the
new behavior:
  * trial start ($0)         -> platform_welcome, no invoice, no marketing
  * a real charge (> $0)     -> platform_receipt, with invoice
  * non-platform order       -> unchanged creator-commerce template
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pytest_mock import MockerFixture
from sqlalchemy.ext.asyncio import AsyncSession

from polar.enums import SubscriptionRecurringInterval
from polar.kit.address import Address, CountryAlpha2
from polar.models import (
    Customer,
    Order,
    OrderItem,
    Organization,
    Product,
    Subscription,
)
from polar.models.order import OrderBillingReasonInternal, OrderStatus
from polar.models.subscription import SubscriptionStatus
from polar.order.service import order as order_service
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


async def _platform_setup(
    save_fixture: SaveFixture, mocker: MockerFixture
) -> tuple[Organization, Product, Customer]:
    """A platform (Spaire) org with a Studio plan + a creator-customer."""
    platform_org = await create_organization(save_fixture)
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id)
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=[(12900, "usd")],
    )
    product.name = "Studio"
    await save_fixture(product)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email="creator+meldacos@gmail.com",
    )
    return platform_org, product, customer


def _order(
    *,
    customer: Customer,
    product: Product,
    subscription: Subscription,
    net_amount: int,
    billing_reason: OrderBillingReasonInternal,
    with_billing: bool = False,
) -> Order:
    return Order(
        status=OrderStatus.paid,
        subtotal_amount=net_amount,
        discount_amount=0,
        net_amount=net_amount,
        tax_amount=0,
        applied_balance_amount=0,
        currency="usd",
        billing_reason=billing_reason,
        invoice_number=f"SPAIRE-{uuid.uuid4().hex[:6].upper()}-0001",
        customer=customer,
        product=product,
        subscription=subscription,
        billing_name="Jane Creator" if with_billing else None,
        billing_address=Address(country=CountryAlpha2("US")) if with_billing else None,
        items=[
            OrderItem(
                label="Studio plan",
                amount=net_amount,
                net_amount=net_amount,
                tax_amount=0,
                proration=False,
            )
        ],
        custom_field_data={},
        user_metadata={},
    )


@pytest.mark.asyncio
class TestPlatformConfirmationEmail:
    async def test_trial_start_sends_welcome_without_invoice(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, product, customer = await _platform_setup(save_fixture, mocker)
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_start=datetime.now(UTC),
            trial_end=datetime.now(UTC) + timedelta(days=14),
        )
        order = _order(
            customer=customer,
            product=product,
            subscription=subscription,
            net_amount=0,
            billing_reason=OrderBillingReasonInternal.subscription_create,
        )
        await save_fixture(order)

        render = mocker.patch(
            "polar.order.service.render_email_template", return_value="<html></html>"
        )
        enqueue_email = mocker.patch("polar.order.service.enqueue_email")
        generate_invoice = mocker.patch.object(order_service, "generate_invoice")

        await order_service.send_confirmation_email(session, order)

        # The founder welcome (user_welcome); no invoice for a $0 trial.
        assert render.call_args.args[0].template == "user_welcome"
        generate_invoice.assert_not_called()
        enqueue_email.assert_called_once()
        assert enqueue_email.call_args.kwargs["attachments"] == []

    async def test_charge_sends_receipt_with_invoice(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, product, customer = await _platform_setup(save_fixture, mocker)
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )
        order = _order(
            customer=customer,
            product=product,
            subscription=subscription,
            net_amount=12900,
            billing_reason=OrderBillingReasonInternal.subscription_cycle,
            with_billing=True,
        )
        await save_fixture(order)

        render = mocker.patch(
            "polar.order.service.render_email_template", return_value="<html></html>"
        )
        enqueue_email = mocker.patch("polar.order.service.enqueue_email")

        # Avoid real S3/PDF generation: pretend the invoice was produced.
        async def _gen(_session: AsyncSession, o: Order) -> Order:
            o.invoice_path = "invoices/x.pdf"
            return o

        generate_invoice = mocker.patch.object(
            order_service, "generate_invoice", side_effect=_gen
        )
        invoice_obj = mocker.MagicMock()
        invoice_obj.url = "https://files.example/x.pdf"
        mocker.patch.object(
            order_service, "get_order_invoice", return_value=invoice_obj
        )

        await order_service.send_confirmation_email(session, order)

        # Spaire-branded receipt WITH the invoice attached.
        assert render.call_args.args[0].template == "platform_receipt"
        generate_invoice.assert_called_once()
        attachments = enqueue_email.call_args.kwargs["attachments"]
        assert len(attachments) == 1

    async def test_non_platform_order_uses_creator_commerce_template(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # No platform org configured -> ordinary creator-commerce order, which
        # must keep using the existing subscription_confirmation template.
        org = await create_organization(save_fixture)
        product = await create_product(
            save_fixture,
            organization=org,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(4900, "usd")],
        )
        customer = await create_customer(save_fixture, organization=org)
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )
        order = _order(
            customer=customer,
            product=product,
            subscription=subscription,
            net_amount=0,
            billing_reason=OrderBillingReasonInternal.subscription_create,
        )
        await save_fixture(order)

        render = mocker.patch(
            "polar.order.service.render_email_template", return_value="<html></html>"
        )
        mocker.patch("polar.order.service.enqueue_email")
        mocker.patch.object(order_service, "generate_invoice")

        await order_service.send_confirmation_email(session, order)

        assert render.call_args.args[0].template == "subscription_confirmation"


@pytest.mark.asyncio
class TestPlatformMarketingSuppression:
    async def test_platform_trial_start_does_not_enroll_marketing(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, product, customer = await _platform_setup(save_fixture, mocker)
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_start=datetime.now(UTC),
            trial_end=datetime.now(UTC) + timedelta(days=14),
        )

        enqueue = mocker.patch("polar.order.service.enqueue_job")

        # The real trial-start path: create_trial_order -> _on_order_paid.
        await order_service.create_trial_order(
            session, subscription, OrderBillingReasonInternal.subscription_create
        )

        # The creator must NOT be enrolled into Spaire's marketing automation.
        subscribe_calls = [
            c
            for c in enqueue.call_args_list
            if c.args and c.args[0] == "email_subscriber.subscribe_from_order"
        ]
        assert subscribe_calls == []
