"""The gate and the cache, on their own (`polar/connectors/service.py`)."""

from datetime import UTC, datetime

import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.connectors.provider import Connection
from polar.connectors.service import ENTITLED_PLANS, connectors
from polar.desktop.service import desktop
from polar.models import User
from polar.postgres import AsyncSession


@pytest.mark.asyncio
class TestEntitled:
    async def test_the_allowlist_is_the_only_yes_today(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        """Section 5 of the note: the plan does the real work once step 9
        lands, and until then `quota()` says « Free » for everybody."""
        assert ENTITLED_PLANS == frozenset()
        assert await connectors.entitled(session, user) is False

        mocker.patch.object(settings, "CONNECTORS_ENTITLED_USER_IDS", {user.id})
        assert await connectors.entitled(session, user) is True

    async def test_somebody_else_s_allowlist_is_not_this_person_s(
        self,
        session: AsyncSession,
        user: User,
        user_second: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "CONNECTORS_ENTITLED_USER_IDS", {user_second.id})
        assert await connectors.entitled(session, user) is False

    async def test_a_free_plan_does_not_buy_connections(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        """The quota is deliberately not even consulted while no plan
        includes connections; what matters is that « Free » is a no."""
        mocker.patch.object(settings, "CONNECTORS_ENTITLED_USER_IDS", set())
        assert (await desktop.quota(session, user))["planName"] == "Free"
        assert await connectors.entitled(session, user) is False


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
