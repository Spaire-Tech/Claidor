import uuid

import stripe as stripe_lib

from simeon.checkout.repository import CheckoutRepository
from simeon.checkout.service import checkout as checkout_service
from simeon.exceptions import PolarError
from simeon.models import (
    Checkout,
    Order,
    Payment,
    PaymentMethod,
    Wallet,
    WalletTransaction,
)
from simeon.models.checkout import CheckoutStatus
from simeon.order.repository import OrderRepository
from simeon.order.service import order as order_service
from simeon.payment.service import payment as payment_service
from simeon.payment_method.service import payment_method as payment_method_service
from simeon.postgres import AsyncSession
from simeon.wallet.repository import WalletRepository, WalletTransactionRepository


class OrderDoesNotExist(PolarError):
    def __init__(self, order_id: str) -> None:
        self.order_id = order_id
        message = f"Order with id {order_id} does not exist."
        super().__init__(message)


class OutdatedCheckoutIntent(PolarError):
    """
    Raised when a received succeeded setup intent is different from the current one
    associated with the checkout.

    Usually happens after a TrialAlreadyRedeemed error, where we convert the checkout
    to a paid one and create a new intent.
    """

    def __init__(self, checkout_id: uuid.UUID, intent_id: str) -> None:
        self.checkout_id = checkout_id
        self.intent_id = intent_id
        message = f"Intent with id {intent_id} for checkout {checkout_id} is outdated."
        super().__init__(message)


#: The metadata the shop writes on every intent and charge it makes. A
#: charge without any of it is Stripe Billing's own (Simeon's plans,
#: `simeon.plans`, whose charges come off an invoice): the shop has
#: nothing to record for it, and `Payment` needs an organisation it
#: cannot name.
SHOP_METADATA_KEYS = ("checkout_id", "order_id", "wallet_id", "wallet_transaction_id")


def belongs_to_the_shop(
    object: stripe_lib.Charge | stripe_lib.PaymentIntent | stripe_lib.SetupIntent,
) -> bool:
    metadata = object.metadata
    if not metadata:
        return False
    return any(metadata.get(key) for key in SHOP_METADATA_KEYS)


async def resolve_checkout(
    session: AsyncSession,
    object: stripe_lib.Charge | stripe_lib.PaymentIntent | stripe_lib.SetupIntent,
) -> Checkout | None:
    if object.metadata is None:
        return None

    if (checkout_id := object.metadata.get("checkout_id")) is None:
        return None

    repository = CheckoutRepository.from_session(session)
    return await repository.get_by_id(
        uuid.UUID(checkout_id), options=repository.get_eager_options()
    )


async def resolve_wallet(
    session: AsyncSession,
    object: stripe_lib.Charge | stripe_lib.PaymentIntent | stripe_lib.SetupIntent,
) -> tuple[Wallet | None, WalletTransaction | None]:
    if object.metadata is None:
        return None, None

    wallet_id = object.metadata.get("wallet_id")
    wallet_transaction_id = object.metadata.get("wallet_transaction_id")

    if wallet_transaction_id is not None:
        wallet_transaction_repository = WalletTransactionRepository.from_session(
            session
        )
        wallet_transaction = await wallet_transaction_repository.get_by_id(
            uuid.UUID(wallet_transaction_id),
            options=wallet_transaction_repository.get_eager_options(),
        )
        if wallet_transaction is not None:
            return wallet_transaction.wallet, wallet_transaction

    if wallet_id is not None:
        wallet_repository = WalletRepository.from_session(session)
        wallet = await wallet_repository.get_by_id(
            uuid.UUID(wallet_id), options=wallet_repository.get_eager_options()
        )
        return wallet, None

    return None, None


async def resolve_order(
    session: AsyncSession,
    object: stripe_lib.Charge | stripe_lib.PaymentIntent | stripe_lib.SetupIntent,
    checkout: Checkout | None,
) -> Order | None:
    order_repository = OrderRepository.from_session(session)
    if (
        object.metadata is not None
        and (order_id := object.metadata.get("order_id")) is not None
    ):
        order = await order_repository.get_by_id(
            uuid.UUID(order_id), options=order_repository.get_eager_options()
        )
        if order is None:
            raise OrderDoesNotExist(order_id)
        return order

    if checkout is not None:
        return await order_repository.get_earliest_by_checkout_id(
            checkout.id, options=order_repository.get_eager_options()
        )

    return None


async def handle_success(
    session: AsyncSession, object: stripe_lib.Charge | stripe_lib.SetupIntent
) -> None:
    if not belongs_to_the_shop(object):
        return
    checkout = await resolve_checkout(session, object)
    wallet, wallet_transaction = await resolve_wallet(session, object)
    order = await resolve_order(session, object, checkout)

    payment: Payment | None = None
    if object.OBJECT_NAME == "charge":
        payment = await payment_service.upsert_from_stripe_charge(
            session, object, checkout, wallet, order
        )

    if checkout is not None:
        if object.OBJECT_NAME == "setup_intent":
            checkout_intent_client_secret = checkout.payment_processor_metadata.get(
                "intent_client_secret"
            )
            if checkout.status == CheckoutStatus.expired or (
                checkout_intent_client_secret is not None
                and object.client_secret != checkout_intent_client_secret
            ):
                raise OutdatedCheckoutIntent(checkout.id, object.id)

        payment_method: PaymentMethod | None = None
        if checkout.should_save_payment_method:
            payment_method = await payment_method_service.upsert_from_stripe_intent(
                session, object, checkout
            )

        await checkout_service.handle_success(
            session,
            checkout,
            payment=payment,
            payment_method=payment_method,
        )

    if wallet_transaction is not None:
        await order_service.create_wallet_order(session, wallet_transaction, payment)

    if order is not None:
        await order_service.handle_payment(session, order, payment)


async def handle_failure(
    session: AsyncSession,
    object: stripe_lib.Charge | stripe_lib.PaymentIntent | stripe_lib.SetupIntent,
) -> None:
    if not belongs_to_the_shop(object):
        return
    checkout = await resolve_checkout(session, object)
    wallet, _ = await resolve_wallet(session, object)
    order = await resolve_order(session, object, checkout)

    payment: Payment | None = None
    if object.OBJECT_NAME == "charge":
        payment = await payment_service.upsert_from_stripe_charge(
            session, object, checkout, wallet, order
        )
    elif object.OBJECT_NAME == "payment_intent":
        payment = await payment_service.upsert_from_stripe_payment_intent(
            session, object, checkout, order
        )

    if checkout is not None:
        await checkout_service.handle_failure(session, checkout, payment=payment)

    if order is not None:
        # Check if this is a manual retry - skip dunning progression if so
        skip_dunning = (
            hasattr(object, "metadata")
            and object.metadata is not None
            and object.metadata.get("manual_retry") == "true"
        )
        await order_service.handle_payment_failure(
            session, order, skip_dunning=skip_dunning
        )


__all__ = [
    "belongs_to_the_shop",
    "handle_failure",
    "handle_success",
    "resolve_checkout",
    "resolve_order",
]
