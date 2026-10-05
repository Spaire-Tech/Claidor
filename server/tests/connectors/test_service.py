"""The gate and the cache, on their own (`simeon/connectors/service.py`)."""

from datetime import UTC, datetime

import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.connectors.provider import Connection
from simeon.connectors.service import ENTITLED_PLANS, connectors
from simeon.desktop.allowance import Allowance
from simeon.desktop.service import desktop
from simeon.models import User
from simeon.postgres import AsyncSession


@pytest.mark.asyncio
class TestEntitled:
    async def test_the_allowlist_is_the_only_yes_without_billing(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        """With no platform organisation configured everybody is « Free »,
        which no plan name matches, so the allowlist is the only yes."""
        assert ENTITLED_PLANS == frozenset({"Standard", "Pro", "Max"})
        assert await connectors.entitled(session, user) is False

        mocker.patch.object(settings, "CONNECTORS_ENTITLED_EMAILS", {user.email})
        assert await connectors.entitled(session, user) is True

    async def test_somebody_else_s_allowlist_is_not_this_person_s(
        self,
        session: AsyncSession,
        user: User,
        user_second: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "CONNECTORS_ENTITLED_EMAILS", {user_second.email})
        assert await connectors.entitled(session, user) is False

    async def test_the_address_is_matched_however_it_was_typed(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        """Whoever fills this in is typing into a dashboard, so a capital
        letter or a stray space must not be the difference between working
        connections and a 402 nobody can explain."""
        mocker.patch.object(
            settings, "CONNECTORS_ENTITLED_EMAILS", {f"  {user.email.upper()}  "}
        )
        assert await connectors.entitled(session, user) is True

    async def test_a_free_plan_does_not_buy_connections(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        """« Free » is a no: connections cost money every month."""
        mocker.patch.object(settings, "CONNECTORS_ENTITLED_EMAILS", set())
        assert (await desktop.quota(session, user))["planName"] == "Free"
        assert await connectors.entitled(session, user) is False

    async def test_a_plan_buys_connections(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "CONNECTORS_ENTITLED_EMAILS", set())
        mocker.patch.object(
            desktop,
            "allowance",
            return_value=Allowance(
                plan_name="Standard",
                status="active",
                tier="standard",
                credits_limit=750_000,
                period_start=datetime(2026, 10, 5, tzinfo=UTC),
                period_end=datetime(2026, 10, 12, tzinfo=UTC),
            ),
        )
        assert await connectors.entitled(session, user) is True


class TestTheCachedShape:
    def test_a_connection_survives_the_round_trip(self) -> None:
        original = [
            Connection("gmail", "apn_one", datetime(2026, 9, 1, 10, tzinfo=UTC)),
            Connection("slack", "apn_two", None),
        ]
        restored = connectors._decode(connectors._encode(original))
        assert restored == original

    def test_something_unreadable_means_ask_them_again(self) -> None:
        """Never « this person has nothing »: an empty shelf shown to
        somebody who has connected eight services is worse than a call."""
        assert connectors._decode("not json at all") is None
        assert connectors._decode('{"not": "a list"}') is None
        assert connectors._decode('[{"slug": 1}]') is None
