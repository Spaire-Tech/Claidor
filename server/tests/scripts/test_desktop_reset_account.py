"""The account reset leaves the account ready to onboard again: the cloud
computer removed on its server first, then every desktop and routine row;
and nothing deleted at all when the computer cannot be removed."""

import pytest
from sqlalchemy import func, select

from scripts.desktop_reset_account import reset
from simeon.kit.db.postgres import AsyncSession
from simeon.models import DesktopUsage, SandAutomation, SandBox, User
from simeon.sand.box_hosts import BoxHostError
from tests.fixtures.database import SaveFixture


async def _seed(save_fixture: SaveFixture, user: User) -> SandBox:
    box = SandBox(
        user_id=user.id,
        provider="docker",
        provider_box_id="container-1",
        host_address="box1.simeonlabs.com",
        gateway_token="",
        network_token="",
    )
    await save_fixture(box)
    await save_fixture(
        SandAutomation(
            user_id=user.id,
            sand_agent_id="agent-1",
            automation_id="auto-1",
            workflow={},
        )
    )
    await save_fixture(
        DesktopUsage(user_id=user.id, model="gpt-6-sol", credits=3_000_000)
    )
    return box


async def _count(session: AsyncSession, model: type, user: User) -> int:
    statement = select(func.count()).select_from(model).where(model.user_id == user.id)  # type: ignore[attr-defined]
    return int((await session.execute(statement)).scalar_one())


@pytest.mark.asyncio
class TestReset:
    async def test_a_dry_run_deletes_nothing(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        await _seed(save_fixture, user)
        removed: list[SandBox] = []

        async def remove(box: SandBox) -> None:
            removed.append(box)

        assert await reset(session, user, confirmed=False, remove_box=remove) is None
        assert removed == []
        assert await _count(session, SandBox, user) == 1

    async def test_the_computer_goes_first_then_every_row(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        box = await _seed(save_fixture, user)
        removed: list[str] = []

        async def remove(found: SandBox) -> None:
            removed.append(found.provider_box_id)

        deleted = await reset(session, user, confirmed=True, remove_box=remove)
        assert removed == [box.provider_box_id]
        assert deleted is not None
        assert deleted["sand_boxes"] == 1
        assert deleted["sand_automations"] == 1
        assert deleted["desktop_usage"] == 1
        for model in (SandBox, SandAutomation, DesktopUsage):
            assert await _count(session, model, user) == 0
        # What the account spent is printed before it goes.
        assert "$9.00" in capsys.readouterr().out

    async def test_nothing_is_deleted_when_the_computer_cannot_be_removed(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        await _seed(save_fixture, user)

        async def remove(_: SandBox) -> None:
            raise BoxHostError("Docker could not remove the box: 500")

        assert await reset(session, user, confirmed=True, remove_box=remove) is None
        for model in (SandBox, SandAutomation, DesktopUsage):
            assert await _count(session, model, user) == 1
