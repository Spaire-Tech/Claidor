"""Extra credits (27 October 2026, `simeon/plans/credits.py`): a pack per
paid checkout, used only after the week's credits on a paid plan, the
first to expire first, and taken back when refunded."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.desktop.pricing import MODELS
from simeon.desktop.service import Usage, desktop
from simeon.kit.utils import utc_now
from simeon.models import DesktopCreditPack, DesktopUsage, User
from simeon.plans import catalog, credits
from simeon.plans.service import plans
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.plans.test_service import billing, stripe_subscription  # noqa: F401


def checkout(user: User, *, paid: bool = True, packs: int = 2) -> Any:
    return stripe_lib.checkout.Session.construct_from(
        {
            "id": "cs_credits_1",
            "object": "checkout.session",
            "mode": "payment",
            "payment_status": "paid" if paid else "unpaid",
            "client_reference_id": str(user.id),
            "amount_total": 1000 * packs,
            "currency": "usd",
            "payment_intent": "pi_1",
            "metadata": {
                "simeon_kind": "credits",
                "simeon_pack_credits": str(catalog.CREDITS_PACK),
            },
            "line_items": {"data": [{"quantity": packs}]},
        },
        None,
    )


async def _pack(
    save_fixture: SaveFixture, user: User, *, remaining: int, days: int = 300, id: str
) -> DesktopCreditPack:
    pack = DesktopCreditPack(
        user_id=user.id,
        credits=catalog.CREDITS_PACK,
        remaining=remaining,
        expires_at=utc_now() + timedelta(days=days),
        amount_cents=1000,
        currency="usd",
        stripe_checkout_session_id=id,
        stripe_payment_intent_id=f"pi_{id}",
    )
    await save_fixture(pack)
    return pack


@pytest.mark.asyncio
@pytest.mark.usefixtures("billing")
class TestGrant:
    async def test_a_paid_checkout_grants_its_packs_once(
        self, session: AsyncSession, user: User
    ) -> None:
        pack = await credits.grant(session, checkout(user))
        assert pack is not None
        assert pack.credits == pack.remaining == 2 * catalog.CREDITS_PACK
        assert pack.amount_cents == 2000
        assert pack.expires_at - utc_now() > timedelta(days=364)
        again = await credits.grant(session, checkout(user))
        assert again is not None
        assert again.id == pack.id
        assert await credits.balance(session, user.id) == 2 * catalog.CREDITS_PACK

    async def test_an_unpaid_checkout_grants_nothing(
        self, session: AsyncSession, user: User
    ) -> None:
        assert await credits.grant(session, checkout(user, paid=False)) is None

    async def test_a_full_refund_takes_back_what_is_left(
        self, session: AsyncSession, user: User
    ) -> None:
        pack = await credits.grant(session, checkout(user, packs=1))
        assert pack is not None
        taken = await credits.refund(
            session,
            stripe_lib.Charge.construct_from(
                {"payment_intent": "pi_1", "amount": 1000, "amount_refunded": 1000},
                None,
            ),
        )
        assert taken == catalog.CREDITS_PACK
        assert pack.remaining == 0
        assert pack.refunded_at is not None
        assert await credits.balance(session, user.id) == 0

    async def test_only_a_paid_plan_can_buy(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="trialing")
        )
        with pytest.raises(credits.CreditsNeedAPlan):
            await credits.create_checkout(
                session, user, success_url="https://x/s", cancel_url="https://x/c"
            )

    async def test_the_checkout_sells_packs_once(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        mocker.patch(
            "simeon.plans.credits.stripe_billing.price_by_lookup_key",
            new=AsyncMock(
                return_value=stripe_lib.Price.construct_from({"id": "price_c"}, None)
            ),
        )
        create = mocker.patch(
            "simeon.plans.credits.stripe_billing.create_checkout_session",
            new=AsyncMock(
                return_value=stripe_lib.checkout.Session.construct_from(
                    {"id": "cs_1", "url": "https://checkout.stripe.com/c/1"}, None
                )
            ),
        )
        url = await credits.create_checkout(
            session, user, packs=3, success_url="https://x/s", cancel_url="https://x/c"
        )
        assert url == "https://checkout.stripe.com/c/1"
        params = create.await_args.kwargs
        assert params["mode"] == "payment"
        assert params["line_items"][0]["price"] == "price_c"
        assert params["line_items"][0]["quantity"] == 3
        assert params["line_items"][0]["adjustable_quantity"]["maximum"] == 10
        assert params["metadata"]["simeon_kind"] == "credits"


@pytest.mark.asyncio
@pytest.mark.usefixtures("billing")
class TestAfterTheWeek:
    async def test_extra_credits_pay_only_past_the_week(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active", tier="standard")
        )
        # The week holds 10,000,000; 9,900,000 are spent.
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-6-sol",
                credits=9_900_000,
                upstream_status=200,
            )
        )
        later = await _pack(save_fixture, user, remaining=3_000_000, days=300, id="b")
        sooner = await _pack(save_fixture, user, remaining=50_000, days=30, id="a")

        drawn = await desktop._draw_extra_credits(session, user.id, 200_000)
        # 100,000 fit in the week; the other 100,000 come from the packs, the
        # one that expires first first.
        assert drawn == 100_000
        assert sooner.remaining == 0
        assert later.remaining == 3_000_000 - 50_000
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-6-sol",
                credits=200_000,
                extra_credits=drawn,
                upstream_status=200,
            )
        )

        quota = await desktop.quota(session, user)
        assert quota["creditsUsed"] == 10_000_000
        assert quota["creditsRemaining"] == 0
        assert quota["extraCredits"] == 2_950_000
        assert not await desktop.exhausted(session, user)

        later.remaining = 0
        await save_fixture(later)
        assert await desktop.exhausted(session, user)

    async def test_each_call_records_its_share(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active", tier="standard")
        )
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-6-sol",
                credits=10_000_000,
                upstream_status=200,
            )
        )
        await _pack(save_fixture, user, remaining=3_000_000, id="r")
        mocker.patch("simeon.desktop.service.credits_for", return_value=40_000)
        row = await desktop.record_usage(
            session,
            user_id=user.id,
            session_id=None,
            model=MODELS[0],
            usage=Usage(input_tokens=1),
            stream=False,
            upstream_status=200,
        )
        assert (row.credits, row.extra_credits) == (40_000, 40_000)
        assert await credits.balance(session, user.id) == 2_960_000

    async def test_a_trial_does_not_use_extra_credits(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="trialing")
        )
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-6-sol",
                credits=10_000_000,
                upstream_status=200,
            )
        )
        await _pack(save_fixture, user, remaining=3_000_000, id="t")
        assert await desktop._draw_extra_credits(session, user.id, 100_000) == 0
        assert await desktop.exhausted(session, user)


@pytest.mark.asyncio
@pytest.mark.usefixtures("billing")
class TestFromTheWeb:
    @pytest.mark.auth
    async def test_the_balance_and_the_pack(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        await _pack(save_fixture, user, remaining=1_000_000, id="w")
        response = await client.get("/v1/plans/credits")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["balance"] == 1_000_000
        assert body["pack_credits"] == 3_000_000
        assert body["pack_price_cents"] == 1000
        assert body["can_buy"] is True
        assert len(body["packs"]) == 1
