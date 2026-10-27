"""The free month (`simeon/plans/free_month.py`, 12 October 2026): the
iPhone app's free trial, no card, one per person by account and e-mail, and
never by device (19 October 2026): every account on one iPhone has its own."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop.allowance import (
    FREE_TRIAL_PLAN_NAME,
    STATUS_NONE,
    STATUS_TRIALING,
    TRIAL_HOURLY_CREDITS,
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
from tests.fixtures.random_objects import create_user

TOKEN = "ZGV2aWNlLXRva2Vu"


@pytest.mark.asyncio
class TestStart:
    async def test_a_new_person_gets_seven_days(
        self, mocker: MockerFixture, session: AsyncSession, user: User
    ) -> None:
        billing_on(mocker)
        outcome = await free_month.start(session, user)
        assert outcome.reason == free_month.STARTED
        assert outcome.trial is not None
        assert outcome.trial.credits == TRIAL_CREDITS
        assert not outcome.trial.device_checked
        assert outcome.trial.ends_at - outcome.trial.starts_at == timedelta(
            days=catalog.TRIAL_DAYS
        )
        # A week since 27 October 2026 (a month before).
        assert catalog.TRIAL_DAYS == 7

        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_TRIALING
        assert allowance.plan_name == FREE_TRIAL_PLAN_NAME
        assert allowance.tier is None
        assert allowance.provider is None
        assert allowance.credits_limit == TRIAL_CREDITS
        assert allowance.hourly_credits == TRIAL_HOURLY_CREDITS
        assert allowance.trial_end == outcome.trial.ends_at
        assert not allowance.trial_cancelable
        access = await sand_access_of(session, user)
        assert access["state"] == SAND_ACCESS_STATE_GRANTED

    async def test_asking_again_keeps_the_same_month(
        self, mocker: MockerFixture, session: AsyncSession, user: User
    ) -> None:
        billing_on(mocker)
        first = await free_month.start(session, user)
        again = await free_month.start(session, user)
        assert again.reason == free_month.RUNNING
        assert again.trial is not None
        assert first.trial is not None
        assert again.trial.id == first.trial.id

    async def test_a_person_who_had_a_card_trial_gets_none(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        billing_on(mocker)
        await save_fixture(
            DesktopTrialRedemption(
                user_id=user.id, email=user.email, stripe_subscription_id="sub_old"
            )
        )
        outcome = await free_month.start(session, user)
        assert outcome.reason == free_month.HAD_TRIAL

    async def test_the_same_email_after_a_deleted_account_gets_none(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
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
        outcome = await free_month.start(session, user)
        assert outcome.reason == free_month.HAD_TRIAL

    async def test_a_live_plan_needs_no_free_month(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        await _person_with_plan(save_fixture, mocker, user, tier="pro", status="active")
        outcome = await free_month.start(session, user)
        assert outcome.reason == free_month.NOT_NEEDED

    async def test_without_billing_nobody_needs_one(
        self, session: AsyncSession, user: User
    ) -> None:
        outcome = await free_month.start(session, user)
        assert outcome.reason == free_month.NOT_NEEDED

    async def test_a_test_email_starts_again(
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
        outcome = await free_month.start(session, user)
        assert outcome.reason == free_month.STARTED
        assert outcome.trial is not None


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
    ) -> None:
        billing_on(mocker)
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/free-month",
            headers={"Authorization": f"Bearer {access}"},
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

    async def test_two_accounts_on_one_iphone_each_have_a_month(
        self,
        mocker: MockerFixture,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """An older app still sends the phone's DeviceCheck token; it is not
        read (the founder, 19 October 2026: "a device could have two to three
        accounts, thats fine")."""
        billing_on(mocker)
        second = await create_user(save_fixture)
        outcomes = []
        for person in (user, second):
            access, _ = await _signed_in(client, session, person)
            response = await client.post(
                "/desktop/api/billing/free-month",
                headers={"Authorization": f"Bearer {access}"},
                json={"deviceToken": TOKEN, "development": True},
            )
            assert response.status_code == 200, response.text
            outcomes.append(response.json()["outcome"])
        assert outcomes == ["started", "started"]

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            "/desktop/api/billing/free-month", json={"deviceToken": TOKEN}
        )
        assert response.status_code == 401
