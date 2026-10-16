"""Plans bought in the iPhone app (`simeon/plans/app_store.py`, 12 October
2026), through the routes the app and Apple call.

Apple's own library checks every signature here, as in production. The
transactions and notifications are signed with a certificate chain made
for the test (a root, an intermediate and a leaf carrying Apple's marker
extensions), and the test's root stands in for Apple's: what passes here
passes the same checks Apple's signatures go through."""

from __future__ import annotations

import base64
import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import httpx
import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop.allowance import resolve_allowance
from simeon.kit.utils import utc_now
from simeon.models import DesktopAppStoreSubscription, DesktopTrialRedemption, User
from simeon.plans import app_store
from simeon.plans.service import BilledByApple
from simeon.plans.service import plans as plans_service
from simeon.postgres import AsyncSession
from tests.desktop.test_endpoints import _signed_in

APP_ID = 6_700_000_001
PRO_MONTHLY = "com.simeonlabs.simeon.pro.monthly"
MAX_MONTHLY = "com.simeonlabs.simeon.max.monthly"

#: Apple's markers on the leaf and the intermediate (`_ChainVerifier`).
LEAF_OID = x509.ObjectIdentifier("1.2.840.113635.100.6.11.1")
INTERMEDIATE_OID = x509.ObjectIdentifier("1.2.840.113635.100.6.2.1")


def _certificate(
    name: str,
    key: ec.EllipticCurvePrivateKey,
    issuer_name: str,
    issuer_key: ec.EllipticCurvePrivateKey,
    *,
    ca: bool,
    marker: x509.ObjectIdentifier | None,
) -> x509.Certificate:
    now = dt.datetime.now(dt.UTC)
    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer_name)]))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=not ca,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=ca,
                crl_sign=ca,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
    )
    if marker is not None:
        builder = builder.add_extension(
            x509.UnrecognizedExtension(marker, b"\x05\x00"), critical=False
        )
    return builder.sign(issuer_key, hashes.SHA256())


class Signer:
    """A root, an intermediate and a leaf, and JWS signed the App Store's way."""

    def __init__(self) -> None:
        self.root_key = ec.generate_private_key(ec.SECP256R1())
        intermediate_key = ec.generate_private_key(ec.SECP256R1())
        self.leaf_key = ec.generate_private_key(ec.SECP256R1())
        self.root = _certificate(
            "Test Root", self.root_key, "Test Root", self.root_key, ca=True, marker=None
        )
        intermediate = _certificate(
            "Test Intermediate",
            intermediate_key,
            "Test Root",
            self.root_key,
            ca=True,
            marker=INTERMEDIATE_OID,
        )
        leaf = _certificate(
            "Test Leaf",
            self.leaf_key,
            "Test Intermediate",
            intermediate_key,
            ca=False,
            marker=LEAF_OID,
        )
        self.chain = [
            base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()
            for cert in (leaf, intermediate, self.root)
        ]

    @property
    def root_der(self) -> bytes:
        return self.root.public_bytes(serialization.Encoding.DER)

    def sign(self, payload: dict[str, Any]) -> str:
        return jwt.encode(
            payload, self.leaf_key, algorithm="ES256", headers={"x5c": self.chain}
        )


def _ms(moment: dt.datetime) -> int:
    return int(moment.timestamp() * 1000)


@pytest.fixture
def signer(mocker: MockerFixture) -> Signer:
    """Apple's checks against the test's root, offline, billing on."""
    made = Signer()
    mocker.patch.object(app_store, "_root_certificates", return_value=[made.root_der])
    mocker.patch.object(settings, "APPLE_ONLINE_CHECKS", False)
    mocker.patch.object(settings, "APPLE_APP_ID", APP_ID)
    mocker.patch.object(settings, "DESKTOP_BILLING_REQUIRED", True)
    return made


Transaction = Callable[..., str]


@pytest.fixture
def transaction(signer: Signer) -> Transaction:
    def make(
        user: User | None,
        *,
        product: str = PRO_MONTHLY,
        original: str = "2000000000000001",
        transaction_id: str | None = None,
        days_left: float = 7,
        trial: bool = True,
        environment: str = "Sandbox",
        signed: dt.datetime | None = None,
        revoked: bool = False,
        token: str | None = None,
    ) -> str:
        now = utc_now()
        payload: dict[str, Any] = {
            "originalTransactionId": original,
            "transactionId": transaction_id or original,
            "bundleId": settings.APPLE_BUNDLE_ID,
            "productId": product,
            "purchaseDate": _ms(now - dt.timedelta(days=7 - days_left)),
            "originalPurchaseDate": _ms(now - dt.timedelta(days=7 - days_left)),
            "expiresDate": _ms(now + dt.timedelta(days=days_left)),
            "type": "Auto-Renewable Subscription",
            "inAppOwnershipType": "PURCHASED",
            "signedDate": _ms(signed or now),
            "environment": environment,
            "storefront": "USA",
        }
        if token is not None or user is not None:
            payload["appAccountToken"] = token or str(user.id)  # type: ignore[union-attr]
        if trial:
            payload["offerType"] = 1
            payload["offerDiscountType"] = "FREE_TRIAL"
        if revoked:
            payload["revocationDate"] = _ms(now)
            payload["revocationReason"] = 0
        return signer.sign(payload)

    return make


def _renewal(
    signer: Signer,
    original: str,
    *,
    auto_renew: bool,
    grace_until: dt.datetime | None = None,
) -> str:
    """Apple's renewal info; with `grace_until`, Apple is retrying a
    failed charge in its billing grace period until then."""
    payload: dict[str, Any] = {
        "originalTransactionId": original,
        "autoRenewProductId": PRO_MONTHLY,
        "productId": PRO_MONTHLY,
        "autoRenewStatus": 1 if auto_renew else 0,
        "signedDate": _ms(utc_now()),
        "environment": "Sandbox",
        "isInBillingRetryPeriod": grace_until is not None,
    }
    if grace_until is not None:
        payload["gracePeriodExpiresDate"] = _ms(grace_until)
    return signer.sign(payload)


def _notification(
    signer: Signer,
    kind: str,
    signed_transaction: str,
    *,
    signed_renewal: str | None = None,
    signed: dt.datetime | None = None,
) -> str:
    data: dict[str, Any] = {
        "bundleId": settings.APPLE_BUNDLE_ID,
        "appAppleId": APP_ID,
        "environment": "Sandbox",
        "signedTransactionInfo": signed_transaction,
    }
    if signed_renewal:
        data["signedRenewalInfo"] = signed_renewal
    return signer.sign(
        {
            "notificationType": kind,
            "notificationUUID": str(uuid.uuid4()),
            "data": data,
            "version": "2.0",
            "signedDate": _ms(signed or utc_now()),
        }
    )


async def _rows(session: AsyncSession, user: User) -> list[DesktopAppStoreSubscription]:
    session.expire_all()
    result = await session.execute(
        select(DesktopAppStoreSubscription).where(
            DesktopAppStoreSubscription.user_id == user.id
        )
    )
    return list(result.scalars().all())


def test_product_ids_name_each_plan_and_interval() -> None:
    assert (
        app_store.product_id(app_store.TierKey.pro, "year")
        == "com.simeonlabs.simeon.pro.yearly"
    )
    assert app_store.parse_product_id("com.simeonlabs.simeon.max.monthly") == (
        app_store.TierKey.max,
        "month",
    )
    for other in (
        "com.simeonlabs.simeon.free.monthly",
        "com.simeonlabs.simeon.pro.weekly",
        "com.example.pro.monthly",
        None,
    ):
        assert app_store.parse_product_id(other) is None
    ids = [product["productId"] for product in app_store.products()]
    assert len(ids) == 6
    assert len(set(ids)) == 6


@pytest.mark.asyncio
class TestFromTheApp:
    async def test_the_free_week_starts_the_plan(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
        signer: Signer,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {access}"},
            json={
                "signedTransactions": [transaction(user)],
                "signedRenewalInfo": [
                    _renewal(signer, "2000000000000001", auto_renew=True)
                ],
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["plan"]["tier"] == "pro"
        assert body["plan"]["status"] == "trialing"
        assert body["quota"]["billedBy"] == "apple"
        assert body["quota"]["subscriptionStatus"] == "trialing"
        allowance = await resolve_allowance(session, user)
        assert allowance.trialing
        assert allowance.provider == "app_store"
        # Apple's free week is the person's one trial: the web starts paid.
        session.expire_all()
        redemption = (
            await session.execute(
                select(DesktopTrialRedemption).where(
                    DesktopTrialRedemption.user_id == user.id
                )
            )
        ).scalar_one()
        assert redemption.stripe_subscription_id == "apple:2000000000000001"

    async def test_a_purchase_made_by_another_account_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {access}"},
            json={"signedTransactions": [transaction(None, token=str(uuid.uuid4()))]},
        )
        assert response.status_code == 409
        assert "another Simeon account" in response.json()["error"]["message"]
        assert await _rows(session, user) == []

    async def test_a_signature_from_elsewhere_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        signer: Signer,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        forged = Signer().sign(
            {
                "originalTransactionId": "1",
                "transactionId": "1",
                "bundleId": settings.APPLE_BUNDLE_ID,
                "productId": PRO_MONTHLY,
                "environment": "Sandbox",
                "signedDate": _ms(utc_now()),
                "appAccountToken": str(user.id),
            }
        )
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {access}"},
            json={"signedTransactions": [forged]},
        )
        assert response.status_code == 400
        assert await _rows(session, user) == []

    async def test_production_needs_the_apps_apple_id(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "APPLE_APP_ID", None)
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {access}"},
            json={"signedTransactions": [transaction(user, environment="Production")]},
        )
        assert response.status_code == 503
        assert "aren't set up" in response.json()["error"]["message"]

    async def test_stripe_will_not_sell_or_manage_an_apple_plan(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "STRIPE_SECRET_KEY", "sk_test")
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        await client.post(
            "/desktop/api/billing/apple/transactions",
            headers=headers,
            json={"signedTransactions": [transaction(user, trial=False)]},
        )
        response = await client.post(
            "/desktop/api/billing/portal", headers=headers, json={}
        )
        assert response.status_code == 409
        assert "billed through Apple" in response.json()["message"]


@pytest.mark.asyncio
class TestFromApple:
    async def test_renewal_cancellation_and_expiry(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
        signer: Signer,
    ) -> None:
        start = utc_now()
        first = _notification(
            signer, "SUBSCRIBED", transaction(user, signed=start), signed=start
        )
        response = await client.post(
            "/desktop/apple/notifications", json={"signedPayload": first}
        )
        assert response.status_code == 200, response.text
        assert response.json()["outcome"] == "applied"
        (row,) = await _rows(session, user)
        assert row.status == "trialing"

        # The first paid month, on the bigger plan.
        later = start + dt.timedelta(minutes=5)
        renewed = transaction(
            user,
            product=MAX_MONTHLY,
            transaction_id="2000000000000002",
            days_left=30,
            trial=False,
            signed=later,
        )
        await client.post(
            "/desktop/apple/notifications",
            json={
                "signedPayload": _notification(
                    signer, "DID_RENEW", renewed, signed=later
                )
            },
        )
        (row,) = await _rows(session, user)
        assert (row.status, row.tier, row.transaction_id) == (
            "active",
            "max",
            "2000000000000002",
        )

        # A late copy of the first notification does not undo the renewal.
        await client.post("/desktop/apple/notifications", json={"signedPayload": first})
        (row,) = await _rows(session, user)
        assert row.tier == "max"

        # Auto-renew turned off: the plan runs to the end of the month.
        off = later + dt.timedelta(minutes=5)
        await client.post(
            "/desktop/apple/notifications",
            json={
                "signedPayload": _notification(
                    signer,
                    "DID_CHANGE_RENEWAL_STATUS",
                    renewed,
                    signed_renewal=_renewal(
                        signer, "2000000000000001", auto_renew=False
                    ),
                    signed=off,
                )
            },
        )
        (row,) = await _rows(session, user)
        assert row.cancel_at_period_end
        assert row.status == "active"

        # Refunded: the plan ends now and the allowance with it.
        refunded = transaction(
            user,
            product=MAX_MONTHLY,
            transaction_id="2000000000000002",
            days_left=30,
            trial=False,
            revoked=True,
            signed=off + dt.timedelta(minutes=5),
        )
        await client.post(
            "/desktop/apple/notifications",
            json={
                "signedPayload": _notification(
                    signer, "REFUND", refunded, signed=off + dt.timedelta(minutes=5)
                )
            },
        )
        (row,) = await _rows(session, user)
        assert row.status == "canceled"
        allowance = await resolve_allowance(session, user)
        assert allowance.none

    async def test_a_plan_past_its_end_stops_counting_without_a_notification(
        self, session: AsyncSession, user: User, transaction: Transaction
    ) -> None:
        decoded = await app_store.decode_transaction(
            transaction(user, trial=False, days_left=1)
        )
        row = await app_store.apply(
            session,
            decoded,
            None,
            signed_at=utc_now(),
            raw={},
            user=user,
        )
        assert row is not None
        assert row.billable_at(utc_now())
        assert not row.billable_at(utc_now() + dt.timedelta(days=2))

    async def test_a_failed_charge_after_the_free_week_is_no_plan(
        self,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
        signer: Signer,
    ) -> None:
        """Apple's grace period, if it is on in App Store Connect, would
        keep the plan while Apple retries the first charge (14 October
        2026). Nothing was paid yet, so here it does not."""
        decoded = await app_store.decode_transaction(transaction(user, days_left=-1))
        renewal = await app_store.decode_renewal(
            _renewal(
                signer,
                "2000000000000001",
                auto_renew=True,
                grace_until=utc_now() + dt.timedelta(days=15),
            )
        )
        row = await app_store.apply(
            session, decoded, renewal, signed_at=utc_now(), raw={}, user=user
        )
        assert row is not None
        assert row.status == "past_due"
        assert row.unpaid_after_trial
        assert not row.billable_at(utc_now())
        allowance = await resolve_allowance(session, user)
        assert allowance.none
        assert allowance.payment_failed
        assert allowance.provider == "app_store"

    async def test_a_failed_renewal_after_a_paid_month_keeps_the_plan(
        self,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
        signer: Signer,
    ) -> None:
        decoded = await app_store.decode_transaction(
            transaction(user, trial=False, days_left=-1)
        )
        renewal = await app_store.decode_renewal(
            _renewal(
                signer,
                "2000000000000001",
                auto_renew=True,
                grace_until=utc_now() + dt.timedelta(days=15),
            )
        )
        row = await app_store.apply(
            session, decoded, renewal, signed_at=utc_now(), raw={}, user=user
        )
        assert row is not None
        assert row.status == "past_due"
        assert not row.unpaid_after_trial
        allowance = await resolve_allowance(session, user)
        assert allowance.status == "past_due"
        assert not allowance.payment_failed

    async def test_a_notification_for_nobody_is_answered_and_ignored(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        transaction: Transaction,
        signer: Signer,
    ) -> None:
        stranger = transaction(None, token=str(uuid.uuid4()))
        response = await client.post(
            "/desktop/apple/notifications",
            json={"signedPayload": _notification(signer, "SUBSCRIBED", stranger)},
        )
        assert response.status_code == 200
        assert response.json()["outcome"] == "ignored"


@pytest.mark.asyncio
class TestWhatOnlyAppleCanDo:
    async def test_the_trial_is_cancelled_with_apple(
        self, session: AsyncSession, user: User, transaction: Transaction
    ) -> None:
        decoded = await app_store.decode_transaction(transaction(user))
        await app_store.apply(
            session, decoded, None, signed_at=utc_now(), raw={}, user=user
        )
        with pytest.raises(BilledByApple):
            await plans_service.cancel_trial(session, user)

    async def test_deleting_the_account_says_the_apple_plan_runs_on(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        transaction: Transaction,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        await client.post(
            "/desktop/api/billing/apple/transactions",
            headers=headers,
            json={"signedTransactions": [transaction(user, trial=False)]},
        )
        response = await client.delete("/desktop/api/account", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["appleSubscription"] is True
        # Kept as a billing record, like Stripe's.
        assert len(await _rows(session, user)) == 1

    async def test_a_deleted_accounts_subscription_moves_to_the_new_account(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        transaction: Transaction,
    ) -> None:
        # 12 October 2026: the founder deleted their account, signed in again with the same Apple ID, and buying
        # answered "This purchase belongs to another Simeon account" with no way past the plans.
        access, _ = await _signed_in(client, session, user)
        bought = transaction(user, trial=False)
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {access}"},
            json={"signedTransactions": [bought]},
        )
        assert response.status_code == 200, response.text
        deleted = await client.delete(
            "/desktop/api/account", headers={"Authorization": f"Bearer {access}"}
        )
        assert deleted.status_code == 200, deleted.text

        again, _ = await _signed_in(client, session, user_second)
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {again}"},
            json={"signedTransactions": [bought]},
        )

        assert response.status_code == 200, response.text
        assert response.json()["plan"]["tier"] == "pro"
        assert len(await _rows(session, user_second)) == 1
        assert await _rows(session, user) == []
        allowance = await resolve_allowance(session, user_second)
        assert allowance.provider == "app_store"

    async def test_a_live_accounts_subscription_stays_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        transaction: Transaction,
    ) -> None:
        # One Apple subscription never unlocks two living accounts.
        access, _ = await _signed_in(client, session, user)
        bought = transaction(user, trial=False)
        await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {access}"},
            json={"signedTransactions": [bought]},
        )
        other, _ = await _signed_in(client, session, user_second)
        response = await client.post(
            "/desktop/api/billing/apple/transactions",
            headers={"Authorization": f"Bearer {other}"},
            json={"signedTransactions": [bought]},
        )
        assert response.status_code == 409
        assert len(await _rows(session, user)) == 1
        assert await _rows(session, user_second) == []
