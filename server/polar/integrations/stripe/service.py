from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Unpack, cast, overload

import stripe as stripe_lib
import structlog

from polar.config import settings
from polar.exceptions import PolarError
from polar.logfire import instrument_httpx
from polar.logging import Logger

if TYPE_CHECKING:
    from stripe.params._balance_transaction_list_params import (
        BalanceTransactionListParams,
    )
    from stripe.params._customer_create_params import (
        CustomerCreateParams,
        CustomerCreateParamsTaxIdDatum,
    )
    from stripe.params._customer_modify_params import CustomerModifyParams
    from stripe.params._payment_intent_create_params import PaymentIntentCreateParams
    from stripe.params._setup_intent_create_params import SetupIntentCreateParams
    from stripe.params._setup_intent_retrieve_params import SetupIntentRetrieveParams
    from stripe.params._transfer_create_params import TransferCreateParams
    from stripe.params._transfer_modify_params import TransferModifyParams
    from stripe.params.tax._calculation_create_params import CalculationCreateParams
    from stripe.params.tax._transaction_create_reversal_params import (
        TransactionCreateReversalParams,
    )
    from stripe.params.v2.core._account_create_params import (
        AccountCreateParams as V2AccountCreateParams,
    )

    from polar.account.schemas import AccountCreateForOrganization
    from polar.models import User

stripe_lib.api_key = settings.STRIPE_SECRET_KEY
stripe_lib.api_version = "2026-01-28.clover"

stripe_http_client = stripe_lib.HTTPXClient(allow_sync_methods=True)
instrument_httpx(stripe_http_client._client_async)
stripe_lib.default_http_client = stripe_http_client

# StripeClient instance for v2 API calls
stripe_client = stripe_lib.StripeClient(
    api_key=settings.STRIPE_SECRET_KEY,
    stripe_version="2026-01-28.clover",
    http_client=stripe_http_client,
)

log: Logger = structlog.get_logger()


StripeCancellationReasons = Literal[
    "customer_service",
    "low_quality",
    "missing_features",
    "other",
    "switched_service",
    "too_complex",
    "too_expensive",
    "unused",
]


class StripeError(PolarError): ...


@dataclass
class V2AccountInfo:
    """Normalized account info extracted from a Stripe v2 Account response."""

    id: str
    email: str | None
    country: str | None
    currency: str | None
    is_details_submitted: bool
    is_transfers_enabled: bool
    is_payouts_enabled: bool
    business_type: str | None
    data: dict[str, object]


def extract_v2_account_info(
    v2_account: "stripe_lib.v2.core.Account",
) -> V2AccountInfo:
    """Extract normalized account info from a v2 Account object."""
    is_transfers_enabled = False
    is_payouts_enabled = False

    config = getattr(v2_account, "configuration", None)
    if config is not None:
        recipient = getattr(config, "recipient", None)
        if recipient is not None:
            caps = getattr(recipient, "capabilities", None)
            if caps is not None:
                stripe_balance = getattr(caps, "stripe_balance", None)
                if stripe_balance is not None:
                    transfers = getattr(stripe_balance, "stripe_transfers", None)
                    if transfers is not None:
                        is_transfers_enabled = transfers.status == "active"
                    payouts = getattr(stripe_balance, "payouts", None)
                    if payouts is not None:
                        is_payouts_enabled = payouts.status == "active"
                    else:
                        # payouts capability is auto-requested with stripe_transfers
                        # (since Stripe API 2025-04-30). If not present in response,
                        # fall back to transfers status.
                        is_payouts_enabled = is_transfers_enabled

    identity = getattr(v2_account, "identity", None)
    country = getattr(identity, "country", None) if identity else None
    entity_type = getattr(identity, "entity_type", None) if identity else None

    defaults = getattr(v2_account, "defaults", None)
    currency = getattr(defaults, "currency", None) if defaults else None

    requirements = getattr(v2_account, "requirements", None)
    has_past_due = False
    if requirements is not None:
        entries = getattr(requirements, "entries", None)
        if entries:
            for entry in entries:
                past_due_deadline = getattr(entry, "past_due_deadline", None)
                if past_due_deadline is not None:
                    has_past_due = True
                    break

    applied_configs = getattr(v2_account, "applied_configurations", None) or []
    is_details_submitted = "recipient" in applied_configs and not has_past_due

    return V2AccountInfo(
        id=v2_account.id,
        email=getattr(v2_account, "contact_email", None),
        country=country,
        currency=currency,
        is_details_submitted=is_details_submitted,
        is_transfers_enabled=is_transfers_enabled,
        is_payouts_enabled=is_payouts_enabled,
        business_type=entity_type,
        data={},
    )


class StripeService:
    async def retrieve_intent(self, id: str) -> stripe_lib.PaymentIntent:
        return await stripe_lib.PaymentIntent.retrieve_async(id)

    async def create_account(
        self, account: "AccountCreateForOrganization", name: str | None, email: str | None = None
    ) -> V2AccountInfo:
        log.info(
            "stripe.v2.account.create",
            country=account.country,
            name=name,
        )
        create_params: V2AccountCreateParams = {
            "dashboard": "express",
            "identity": {
                "country": account.country,
            },
            "defaults": {
                "responsibilities": {
                    "fees_collector": "application",
                    "losses_collector": "application",
                },
            },
            "configuration": {
                "merchant": {
                    "capabilities": {
                        "card_payments": {"requested": True},
                    },
                },
                "recipient": {
                    "capabilities": {
                        "stripe_balance": {
                            "stripe_transfers": {"requested": True},
                        },
                    },
                },
            },
            "include": ["configuration.recipient"],
        }

        if email:
            create_params["contact_email"] = email

        if name:
            create_params["display_name"] = name

        v2_account = await stripe_client.v2.core.accounts.create_async(
            params=create_params
        )
        return extract_v2_account_info(v2_account)

    async def retrieve_v2_account(self, id: str) -> V2AccountInfo:
        """Retrieve a Stripe account using the v2 API with recipient configuration."""
        v2_account = await stripe_client.v2.core.accounts.retrieve_async(
            id,
            params={"include": ["configuration.recipient"]},
        )
        return extract_v2_account_info(v2_account)

    async def update_account(self, id: str, name: str | None) -> None:
        log.info(
            "stripe.v2.account.update",
            account_id=id,
            name=name,
        )
        if name:
            await stripe_client.v2.core.accounts.update_async(
                id,
                params={"display_name": name},
            )

    async def account_exists(self, id: str) -> bool:
        try:
            v2_account = await stripe_client.v2.core.accounts.retrieve_async(id)
            return not getattr(v2_account, "closed", False)
        except stripe_lib.PermissionError:
            return False

    async def delete_account(self, id: str) -> None:
        log.info(
            "stripe.v2.account.close",
            account_id=id,
        )
        await stripe_client.v2.core.accounts.close_async(id)

    async def retrieve_balance(self, id: str) -> tuple[str, int]:
        # Return available balance in the account's default currency.
        # Balance API is still v1 (operates on connected accounts).
        balance = await stripe_lib.Balance.retrieve_async(stripe_account=id)
        # Retrieve default currency from v2 account
        v2_info = await self.retrieve_v2_account(id)
        default_currency = v2_info.currency or "usd"
        for b in balance.available:
            if b.currency == default_currency:
                return (b.currency, b.amount)
        return (default_currency, 0)

    async def create_account_link(
        self, stripe_id: str, return_path: str
    ) -> stripe_lib.AccountLink:
        refresh_url = settings.generate_external_url(
            f"/v1/integrations/stripe/refresh?return_path={return_path}"
        )
        return_url = settings.generate_external_url(
            f"/v1/integrations/stripe/return"
            f"?return_path={return_path}"
            f"&stripe_account_id={stripe_id}"
        )
        return await stripe_lib.AccountLink.create_async(
            account=stripe_id,
            refresh_url=refresh_url,
            return_url=return_url,
            type="account_onboarding",
        )

    async def create_login_link(self, stripe_id: str) -> stripe_lib.LoginLink:
        return await stripe_lib.Account.create_login_link_async(stripe_id)

    async def transfer(
        self,
        destination_stripe_id: str,
        amount: int,
        *,
        source_transaction: str | None = None,
        transfer_group: str | None = None,
        metadata: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> stripe_lib.Transfer:
        log.info(
            "stripe.transfer.create",
            destination_account=destination_stripe_id,
            amount=amount,
            currency="usd",
            source_transaction=source_transaction,
            transfer_group=transfer_group,
            idempotency_key=idempotency_key,
        )
        create_params: TransferCreateParams = {
            "amount": amount,
            "currency": "usd",
            "destination": destination_stripe_id,
            "metadata": metadata or {},
            "idempotency_key": idempotency_key,
        }
        if source_transaction is not None:
            create_params["source_transaction"] = source_transaction
        if transfer_group is not None:
            create_params["transfer_group"] = transfer_group

        return await stripe_lib.Transfer.create_async(**create_params)

    async def get_transfer(self, id: str) -> stripe_lib.Transfer:
        return await stripe_lib.Transfer.retrieve_async(id)

    async def update_transfer(
        self, id: str, metadata: dict[str, str]
    ) -> stripe_lib.Transfer:
        update_params: TransferModifyParams = {
            "metadata": metadata,
        }
        return await stripe_lib.Transfer.modify_async(id, **update_params)

    async def get_customer(self, customer_id: str) -> stripe_lib.Customer:
        return await stripe_lib.Customer.retrieve_async(customer_id)

    async def get_balance_transaction(self, id: str) -> stripe_lib.BalanceTransaction:
        return await stripe_lib.BalanceTransaction.retrieve_async(id)

    async def get_invoice(self, id: str) -> stripe_lib.Invoice:
        return await stripe_lib.Invoice.retrieve_async(
            id, expand=["total_tax_amounts.tax_rate"]
        )

    async def list_balance_transactions(
        self,
        *,
        account_id: str | None = None,
        payout: str | None = None,
        type: str | None = None,
        expand: list[str] | None = None,
    ) -> AsyncIterator[stripe_lib.BalanceTransaction]:
        params: BalanceTransactionListParams = {
            "limit": 100,
            "stripe_account": account_id,
        }
        if payout is not None:
            params["payout"] = payout
        if type is not None:
            params["type"] = type
        if expand is not None:
            params["expand"] = expand

        result = await stripe_lib.BalanceTransaction.list_async(**params)
        return result.auto_paging_iter()

    async def create_refund(
        self,
        *,
        charge_id: str,
        amount: int,
        reason: Literal["duplicate", "requested_by_customer"],
        metadata: dict[str, str] | None = None,
    ) -> stripe_lib.Refund:
        log.info(
            "stripe.refund.create",
            charge_id=charge_id,
            amount=amount,
            reason=reason,
        )
        stripe_metadata: Literal[""] | dict[str, str] = ""
        if metadata is not None:
            stripe_metadata = metadata

        return await stripe_lib.Refund.create_async(
            charge=charge_id,
            amount=amount,
            reason=reason,
            metadata=stripe_metadata,
        )

    async def get_charge(
        self,
        id: str,
        *,
        stripe_account: str | None = None,
        expand: list[str] | None = None,
    ) -> stripe_lib.Charge:
        return await stripe_lib.Charge.retrieve_async(
            id, stripe_account=stripe_account, expand=expand or []
        )

    async def get_refund(
        self,
        id: str,
        *,
        stripe_account: str | None = None,
        expand: list[str] | None = None,
    ) -> stripe_lib.Refund:
        return await stripe_lib.Refund.retrieve_async(
            id, stripe_account=stripe_account, expand=expand or []
        )

    async def get_dispute(
        self,
        id: str,
        *,
        stripe_account: str | None = None,
        expand: list[str] | None = None,
    ) -> stripe_lib.Dispute:
        return await stripe_lib.Dispute.retrieve_async(
            id, stripe_account=stripe_account, expand=expand or []
        )

    async def create_payout(
        self,
        *,
        stripe_account: str,
        amount: int,
        currency: str,
        metadata: dict[str, str] | None = None,
    ) -> stripe_lib.Payout:
        log.info(
            "stripe.payout.create",
            account_id=stripe_account,
            amount=amount,
            currency=currency,
        )
        return await stripe_lib.Payout.create_async(
            stripe_account=stripe_account,
            amount=amount,
            currency=currency,
            metadata=metadata or {},
        )

    async def create_payment_intent(
        self, **params: Unpack[PaymentIntentCreateParams]
    ) -> stripe_lib.PaymentIntent:
        log.info(
            "stripe.payment_intent.create",
            amount=params.get("amount"),
            currency=params.get("currency"),
            customer=params.get("customer"),
        )
        return await stripe_lib.PaymentIntent.create_async(**params)

    async def get_payment_intent(self, id: str) -> stripe_lib.PaymentIntent:
        return await stripe_lib.PaymentIntent.retrieve_async(id)

    async def create_setup_intent(
        self, **params: Unpack[SetupIntentCreateParams]
    ) -> stripe_lib.SetupIntent:
        log.info(
            "stripe.setup_intent.create",
            customer=params.get("customer"),
            usage=params.get("usage"),
        )
        return await stripe_lib.SetupIntent.create_async(**params)

    async def get_setup_intent(
        self, id: str, **params: Unpack[SetupIntentRetrieveParams]
    ) -> stripe_lib.SetupIntent:
        return await stripe_lib.SetupIntent.retrieve_async(id, **params)

    async def create_customer(
        self, **params: Unpack[CustomerCreateParams]
    ) -> stripe_lib.Customer:
        log.info(
            "stripe.customer.create",
            email=params.get("email"),
            name=params.get("name"),
        )
        return await stripe_lib.Customer.create_async(**params)

    async def update_customer(
        self,
        id: str,
        tax_id: CustomerCreateParamsTaxIdDatum | None = None,
        **params: Unpack[CustomerModifyParams],
    ) -> stripe_lib.Customer:
        log.info(
            "stripe.customer.update",
            customer_id=id,
            email=params.get("email"),
            name=params.get("name"),
            tax_id_type=tax_id.get("type") if tax_id else None,
        )
        params = {**params, "expand": ["tax_ids"]}
        customer = await stripe_lib.Customer.modify_async(id, **params)
        if tax_id is None:
            return customer

        if any(
            existing_tax_id.value == tax_id["value"]
            and existing_tax_id.type == tax_id["type"]
            for existing_tax_id in customer.tax_ids or []
        ):
            return customer

        try:
            await stripe_lib.Customer.create_tax_id_async(id, **tax_id)
        except stripe_lib.InvalidRequestError as e:
            # Potential race condition with Stripe not returning the new Tax ID
            # during our customer modification, but exists upon attempted
            # creation. Since the matching resource exists we can return vs. raise.
            if e.code != "resource_already_exists":
                raise e

        return customer

    async def create_customer_session(
        self, customer_id: str
    ) -> stripe_lib.CustomerSession:
        return await stripe_lib.CustomerSession.create_async(
            components={
                "payment_element": {
                    "enabled": True,
                    "features": {
                        "payment_method_allow_redisplay_filters": [
                            "always",
                            "limited",
                            "unspecified",
                        ],
                        "payment_method_redisplay": "enabled",
                    },
                }
            },
            customer=customer_id,
        )

    async def create_tax_calculation(
        self,
        **params: Unpack[CalculationCreateParams],
    ) -> stripe_lib.tax.Calculation:
        return await stripe_lib.tax.Calculation.create_async(**params)

    async def get_tax_calculation(self, id: str) -> stripe_lib.tax.Calculation:
        return await stripe_lib.tax.Calculation.retrieve_async(id)

    async def create_tax_transaction(
        self, calculation_id: str, reference: str
    ) -> stripe_lib.tax.Transaction:
        log.info(
            "stripe.tax.transaction.create",
            calculation_id=calculation_id,
            reference=reference,
        )
        return await stripe_lib.tax.Transaction.create_from_calculation_async(
            calculation=calculation_id,
            reference=reference,
            idempotency_key=f"polar:tax_transaction:{reference}",
        )

    @overload
    async def revert_tax_transaction(
        self, original_transaction_id: str, mode: Literal["full"], reference: str
    ) -> stripe_lib.tax.Transaction: ...

    @overload
    async def revert_tax_transaction(
        self,
        original_transaction_id: str,
        mode: Literal["partial"],
        reference: str,
        amount: int,
    ) -> stripe_lib.tax.Transaction: ...

    async def revert_tax_transaction(
        self,
        original_transaction_id: str,
        mode: Literal["full", "partial"],
        reference: str,
        amount: int | None = None,
    ) -> stripe_lib.tax.Transaction:
        params: TransactionCreateReversalParams = {
            "mode": mode,
            "original_transaction": original_transaction_id,
            "reference": reference,
            "idempotency_key": f"polar:tax_transaction_revert:{reference}",
        }
        if mode == "partial" and amount is not None:
            params["flat_amount"] = amount
        return await stripe_lib.tax.Transaction.create_reversal_async(**params)

    async def list_payment_methods(
        self, customer: str
    ) -> AsyncGenerator[stripe_lib.PaymentMethod]:
        payment_methods = await stripe_lib.Customer.list_payment_methods_async(customer)
        async for payment_method in payment_methods.auto_paging_iter():
            yield payment_method

    async def get_payment_method(
        self, payment_method_id: str
    ) -> stripe_lib.PaymentMethod:
        return await stripe_lib.PaymentMethod.retrieve_async(payment_method_id)

    async def delete_payment_method(
        self, payment_method_id: str
    ) -> stripe_lib.PaymentMethod:
        log.info(
            "stripe.payment_method.delete",
            payment_method_id=payment_method_id,
        )
        return await stripe_lib.PaymentMethod.detach_async(payment_method_id)

    async def create_payment_method_domain(
        self, domain_name: str
    ) -> stripe_lib.PaymentMethodDomain:
        log.info("stripe.payment_method_domain.create", domain_name=domain_name)
        return await stripe_lib.PaymentMethodDomain.create_async(
            domain_name=domain_name, enabled=True
        )

    async def get_verification_session(
        self, id: str
    ) -> stripe_lib.identity.VerificationSession:
        return await stripe_lib.identity.VerificationSession.retrieve_async(id)

    async def create_verification_session(
        self, user: "User"
    ) -> stripe_lib.identity.VerificationSession:
        return await stripe_lib.identity.VerificationSession.create_async(
            type="document",
            options={
                "document": {
                    "allowed_types": ["driving_license", "id_card", "passport"],
                    "require_live_capture": True,
                    "require_matching_selfie": True,
                }
            },
            provided_details={
                "email": user.email,
            },
            client_reference_id=str(user.id),
            metadata={"user_id": str(user.id)},
        )

    async def redact_verification_session(
        self, id: str
    ) -> stripe_lib.identity.VerificationSession:
        log.info("stripe.identity.verification_session.redact", id=id)
        return await stripe_lib.identity.VerificationSession.redact_async(id)

    async def get_tax_rate(self, id: str) -> stripe_lib.TaxRate:
        return await stripe_lib.TaxRate.retrieve_async(id)

    # ---- Client Invoice methods ----

    async def create_invoice(
        self,
        *,
        customer: str,
        currency: str,
        collection_method: str = "send_invoice",
        days_until_due: int | None = None,
        description: str | None = None,
        footer: str | None = None,
        custom_fields: list[dict[str, str]] | None = None,
        metadata: dict[str, str] | None = None,
    ) -> stripe_lib.Invoice:
        log.info("stripe.invoice.create", customer=customer, currency=currency)
        params: dict[str, object] = {
            "customer": customer,
            "currency": currency,
            "collection_method": collection_method,
            "auto_advance": False,
        }
        if days_until_due is not None:
            params["days_until_due"] = days_until_due
        if description is not None:
            params["description"] = description
        if footer is not None:
            params["footer"] = footer
        if custom_fields is not None:
            params["custom_fields"] = custom_fields
        if metadata is not None:
            params["metadata"] = metadata
        return await stripe_lib.Invoice.create_async(**params)  # type: ignore[arg-type]

    async def create_invoice_item(
        self,
        *,
        customer: str,
        invoice: str,
        amount: int,
        currency: str,
        description: str,
    ) -> stripe_lib.InvoiceItem:
        params: dict[str, object] = {
            "customer": customer,
            "invoice": invoice,
            "amount": amount,
            "currency": currency,
            "description": description,
        }
        return await stripe_lib.InvoiceItem.create_async(**params)  # type: ignore[arg-type]

    async def finalize_invoice(self, invoice_id: str) -> stripe_lib.Invoice:
        log.info("stripe.invoice.finalize", invoice_id=invoice_id)
        return await stripe_lib.Invoice.finalize_invoice_async(invoice_id)

    async def send_invoice(self, invoice_id: str) -> stripe_lib.Invoice:
        log.info("stripe.invoice.send", invoice_id=invoice_id)
        return await stripe_lib.Invoice.send_invoice_async(invoice_id)

    async def void_invoice(self, invoice_id: str) -> stripe_lib.Invoice:
        log.info("stripe.invoice.void", invoice_id=invoice_id)
        return await stripe_lib.Invoice.void_invoice_async(invoice_id)


stripe = StripeService()
