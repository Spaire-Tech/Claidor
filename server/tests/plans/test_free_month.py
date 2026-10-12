"""The free month (`simeon/plans/free_month.py`, 12 October 2026): the
iPhone app's free trial, no card, one per person and one per iPhone.

Apple's DeviceCheck is answered by `respx`, with the developer token
signed by a key made for the test, as Apple would receive it."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop.allowance import (
    FREE_TRIAL_PLAN_NAME,
    STATUS_NONE,
    STATUS_TRIALING,
    resolve_allowance,
)
from simeon.entitlements.tiers import TRIAL_CREDITS
from simeon.kit.utils import utc_now
from simeon.models import DesktopFreeTrial, DesktopTrialRedemption, User
from simeon.plans import catalog, free_month
from simeon.postgres import AsyncSession
from simeon.sand.dashboard import (
    SAND_ACCESS_STATE_GRANTED,
    SAND_ACCESS_STATE_PAYMENT_REQUIRED,
    SAND_BLOCK_REASON_NONE,
    sand_access_of,
)
from tests.desktop.test_allowance import _person_with_plan, billing_on
from tests.desktop.test_endpoints import _signed_in
from tests.fixtures.database import SaveFixture

PRODUCTION = "https://api.devicecheck.apple.com/v1"
DEVELOPMENT = "https://api.development.devicecheck.apple.com/v1"
TOKEN = "ZGV2aWNlLXRva2Vu"


@pytest.fixture
def device_check_key(mocker: MockerFixture) -> ec.EllipticCurvePrivateKey:
    """A DeviceCheck key, as the developer account would hand one out."""
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    mocker.patch.object(settings, "APPLE_DEVICECHECK_KEY_ID", "DCKEY12345")
    mocker.patch.object(settings, "APPLE_DEVICECHECK_KEY_VALUE", pem)
    mocker.patch.object(settings, "APPLE_TEAM_ID", "496QXRMJXG")
    return key


def _apple(
    mock: respx.MockRouter,
    key: ec.EllipticCurvePrivateKey,
    *,
    used: bool | None,
    base: str = PRODUCTION,
) -> tuple[respx.Route, respx.Route]:
    """Apple's two routes: the bits (`used` None for a device never
    marked) and the update, each checking the developer token."""

    def authorised(request: httpx.Request) -> None:
        bearer = request.headers["Authorization"].removeprefix("Bearer ")
        claims = jwt.decode(bearer, key.public_key(), algorithms=["ES256"])
        assert claims["iss"] == "496QXRMJXG"
        assert jwt.get_unverified_header(bearer)["kid"] == "DCKEY12345"
        assert json.loads(request.content)["device_token"] == TOKEN

    def query(request: httpx.Request) -> httpx.Response:
        authorised(request)
        if used is None:
            return httpx.Response(200, text="Failed to find bit state")
        return httpx.Response(
            200, json={"bit0": used, "bit1": False, "last_update_time": "2026-10"}
        )

    def update(request: httpx.Request) -> httpx.Response:
        authorised(request)
        assert json.loads(request.content)["bit0"] is True
        return httpx.Response(200)

    return (
        mock.post(f"{base}/query_two_bits").mock(side_effect=query),
        mock.post(f"{base}/update_two_bits").mock(side_effect=update),
    )


@pytest.mark.asyncio
class TestStart:
    async def test_a_new_person_on_a_new_iphone_gets_thirty_days(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        with respx.mock(assert_all_called=True) as mock:
            _apple(mock, device_check_key, used=None)
            outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.STARTED
        assert outcome.trial is not None
        assert outcome.trial.credits == TRIAL_CREDITS
        assert outcome.trial.ends_at - outcome.trial.starts_at == timedelta(
            days=catalog.TRIAL_DAYS
        )
        assert catalog.TRIAL_DAYS == 30

        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_TRIALING
        assert allowance.plan_name == FREE_TRIAL_PLAN_NAME
        assert allowance.tier is None
        assert allowance.provider is None
        assert allowance.credits_limit == TRIAL_CREDITS
        assert allowance.trial_end == outcome.trial.ends_at
        assert not allowance.trial_cancelable
        access = await sand_access_of(session, user)
        assert access["state"] == SAND_ACCESS_STATE_GRANTED

    async def test_asking_again_keeps_the_same_month(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        with respx.mock(assert_all_called=True) as mock:
            _apple(mock, device_check_key, used=None)
            first = await free_month.start(session, user, device_token=TOKEN)
        with respx.mock(assert_all_called=False) as mock:
            query, _ = _apple(mock, device_check_key, used=True)
            again = await free_month.start(session, user, device_token=TOKEN)
            assert not query.called
        assert again.reason == free_month.RUNNING
        assert again.trial is not None
        assert first.trial is not None
        assert again.trial.id == first.trial.id

    async def test_an_iphone_that_had_one_gets_none(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        with respx.mock(assert_all_called=False) as mock:
            _, update = _apple(mock, device_check_key, used=True)
            outcome = await free_month.start(session, user, device_token=TOKEN)
            assert not update.called
        assert outcome.reason == free_month.DEVICE_USED
        assert await free_month.free_trial_of(session, user) is None
        assert (await resolve_allowance(session, user)).status == STATUS_NONE

    async def test_a_development_token_is_asked_of_apples_development_service(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        with respx.mock(assert_all_called=True) as mock:
            # Production does not know the token; development does.
            mock.post(f"{PRODUCTION}/query_two_bits").mock(
                return_value=httpx.Response(400, text="Missing or badly formatted")
            )
            mock.post(f"{PRODUCTION}/update_two_bits").mock(
                return_value=httpx.Response(400, text="Missing or badly formatted")
            )
            _apple(mock, device_check_key, used=None, base=DEVELOPMENT)
            outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.STARTED

    async def test_a_person_who_had_a_card_trial_gets_none(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        await save_fixture(
            DesktopTrialRedemption(
                user_id=user.id, email=user.email, stripe_subscription_id="sub_old"
            )
        )
        with respx.mock(assert_all_called=False) as mock:
            query, _ = _apple(mock, device_check_key, used=None)
            outcome = await free_month.start(session, user, device_token=TOKEN)
            assert not query.called
        assert outcome.reason == free_month.HAD_TRIAL

    async def test_the_same_email_after_a_deleted_account_gets_none(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        now = utc_now()
        # The earlier account's month, kept with only the e-mail's hash.
        await save_fixture(
            DesktopFreeTrial(
                user_id=None,
                email_hash=free_month.email_hash(user.email.upper()),
                starts_at=now - timedelta(days=40),
                ends_at=now - timedelta(days=10),
                credits=TRIAL_CREDITS,
                device_checked=True,
            )
        )
        with respx.mock(assert_all_called=False) as mock:
            _apple(mock, device_check_key, used=None)
            outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.HAD_TRIAL

    async def test_a_live_plan_needs_no_free_month(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        await _person_with_plan(save_fixture, mocker, user, tier="pro", status="active")
        outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.NOT_NEEDED

    async def test_without_billing_nobody_needs_one(
        self, session: AsyncSession, user: User
    ) -> None:
        outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.NOT_NEEDED

    async def test_without_devicecheck_set_up_none_starts(
        self, mocker: MockerFixture, session: AsyncSession, user: User
    ) -> None:
        billing_on(mocker)
        mocker.patch.object(settings, "APPLE_DEVICECHECK_KEY_ID", "")
        outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.UNAVAILABLE

    async def test_when_apple_cannot_be_asked_none_starts(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        with respx.mock(assert_all_called=False) as mock:
            mock.post(f"{PRODUCTION}/query_two_bits").mock(
                return_value=httpx.Response(
                    401, text="Unable to verify authorization token"
                )
            )
            outcome = await free_month.start(session, user, device_token=TOKEN)
        assert outcome.reason == free_month.UNAVAILABLE
        assert await free_month.free_trial_of(session, user) is None

    async def test_a_test_email_starts_again_on_any_iphone(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        billing_on(mocker)
        mocker.patch.object(
            settings, "DESKTOP_FREE_TRIAL_TEST_EMAILS", {user.email.upper()}
        )
        now = utc_now()
        await save_fixture(
            DesktopFreeTrial(
                user_id=None,
                email_hash=free_month.email_hash(user.email),
                starts_at=now - timedelta(days=40),
                ends_at=now - timedelta(days=10),
                credits=TRIAL_CREDITS,
                device_checked=True,
            )
        )
        with respx.mock(assert_all_called=False) as mock:
            # Apple is never asked for a test e-mail.
            route = mock.route(host="api.devicecheck.apple.com")
            outcome = await free_month.start(session, user, device_token=TOKEN)
            assert not route.called
        assert outcome.reason == free_month.STARTED
        assert outcome.trial is not None
        assert not outcome.trial.device_checked


@pytest.mark.asyncio
class TestAfterTheMonth:
    async def test_the_month_over_is_no_plan_with_its_end(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        billing_on(mocker)
        now = utc_now()
        ended = now - timedelta(days=1)
        await save_fixture(
            DesktopFreeTrial(
                user_id=user.id,
                email_hash=free_month.email_hash(user.email),
                starts_at=ended - timedelta(days=30),
                ends_at=ended,
                credits=TRIAL_CREDITS,
                device_checked=True,
            )
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_NONE
        assert allowance.trial_end == ended
        quota = await free_month_quota(session, user)
        assert quota["subscriptionStatus"] == STATUS_NONE
        assert quota["trialEndsAt"] == ended.isoformat()
        # No second trial anywhere: the Mac's cover offers no trial either.
        access = await sand_access_of(session, user)
        assert access["state"] == SAND_ACCESS_STATE_PAYMENT_REQUIRED
        assert access["blockReason"] == SAND_BLOCK_REASON_NONE
        assert await free_month.had_trial(session, user)

    async def test_a_plan_bought_then_lapsed_is_what_ended_last(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        now = utc_now()
        await _person_with_plan(
            save_fixture, mocker, user, tier="standard", status="canceled"
        )
        await save_fixture(
            DesktopFreeTrial(
                user_id=user.id,
                email_hash=free_month.email_hash(user.email),
                starts_at=now - timedelta(days=60),
                ends_at=now - timedelta(days=30),
                credits=TRIAL_CREDITS,
                device_checked=True,
            )
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_NONE
        assert allowance.trial_end is None


async def free_month_quota(session: AsyncSession, user: User) -> dict[str, Any]:
    from simeon.desktop.service import desktop

    return await desktop.quota(session, user)


@pytest.mark.asyncio
class TestFromTheApp:
    async def test_the_app_starts_it_and_reads_the_quota(
        self,
        mocker: MockerFixture,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        device_check_key: ec.EllipticCurvePrivateKey,
    ) -> None:
        billing_on(mocker)
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            _apple(mock, device_check_key, used=None, base=DEVELOPMENT)
            response = await client.post(
                "/desktop/api/billing/free-month",
                headers={"Authorization": f"Bearer {access}"},
                json={"deviceToken": TOKEN, "development": True},
            )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["outcome"] == "started"
        assert body["endsAt"]
        assert body["quota"]["subscriptionStatus"] == "trialing"
        assert body["quota"]["planName"] == FREE_TRIAL_PLAN_NAME
        assert body["quota"]["creditsLimit"] == TRIAL_CREDITS
        assert body["quota"]["billedBy"] is None
        session.expire_all()
        rows = (
            (
                await session.execute(
                    select(DesktopFreeTrial).where(DesktopFreeTrial.user_id == user.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            "/desktop/api/billing/free-month", json={"deviceToken": TOKEN}
        )
        assert response.status_code == 401
