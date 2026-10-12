"""Deleting an account from the app (`simeon/desktop/account_deletion.py`,
11 October 2026): the cloud computer and its volumes, the app sign-ins,
the call transcripts, the rows and every session go; the user is
anonymised; a step that must succeed and cannot leaves the rest undone."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import func, select

from simeon.desktop import account_deletion
from simeon.desktop import voice as voice_module
from simeon.kit.utils import utc_now
from simeon.models import (
    DesktopMemoryFile,
    DesktopSession,
    DesktopSubscription,
    DesktopVoiceCall,
    OAuthAccount,
    SandBox,
    User,
)
from simeon.models.user import OAuthPlatform
from simeon.postgres import AsyncSession
from simeon.sand.box_hosts import BoxHostError
from simeon.sand.box_service import BoxBrokerService
from tests.desktop.test_endpoints import _signed_in
from tests.sand.test_box_broker import FakeBoxHost, _ensure, host  # noqa: F401

DELETE = "/desktop/api/account"


class FakeVoice:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    async def delete_conversation(self, conversation_id: str) -> None:
        self.deleted.append(conversation_id)


async def _count(session: AsyncSession, model: Any, user: User) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.user_id == user.id)
    )
    return int(result.scalar_one())


@pytest.mark.asyncio
class TestDeleteAccount:
    async def test_everything_goes_and_the_user_is_anonymised(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,  # noqa: F811
        mocker: MockerFixture,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        made = await _ensure(client, access)
        assert made.status_code == 200, made.text
        box_id = made.json()["podId"]
        session.add(
            DesktopMemoryFile(user_id=user.id, name="MEMORY.md", content="Likes tea.")
        )
        session.add(
            DesktopVoiceCall(user_id=user.id, conversation_id="conv_1", seconds=30)
        )
        await session.commit()
        voice = FakeVoice()
        mocker.patch.object(voice_module, "client", return_value=voice)
        email = user.email

        response = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["deleted"] is True
        assert body["computers"] == 1
        assert body["transcriptsDeleted"] == 1
        assert body["incomplete"] == []
        # The container and both of its volumes, by the names the broker gives them.
        (removed,) = host.removed
        assert sorted(removed[1]) == sorted(BoxBrokerService.volumes(UUID(box_id)))
        assert voice.deleted == ["conv_1"]
        session.expire_all()
        for model in (DesktopMemoryFile, DesktopVoiceCall, SandBox, DesktopSession):
            assert await _count(session, model, user) == 0, model.__name__
        refreshed = await session.get(User, user.id)
        assert refreshed is not None
        assert refreshed.deleted_at is not None
        assert refreshed.email != email
        # Signed out everywhere: the token no longer opens anything.
        again = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )
        assert again.status_code == 401

    async def test_an_account_signed_in_with_google_or_apple_is_deleted(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        # 12 October 2026: every iPhone account has a sign-in row, and deleting one answered 500 (the user, saved after
        # its sign-in rows were removed, took the removed rows back with it); the database kept everything.
        session.add(
            OAuthAccount(
                platform=OAuthPlatform.google,
                account_id="google-sub-1",
                account_email=user.email,
                access_token="token",
                user_id=user.id,
            )
        )
        await session.commit()
        access, _ = await _signed_in(client, session, user)
        # As in production: the request loads the user and its sign-in rows afresh.
        session.expunge_all()
        mocker.patch.object(voice_module, "client", return_value=FakeVoice())

        response = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )

        assert response.status_code == 200, response.text
        session.expire_all()
        assert await _count(session, OAuthAccount, user) == 0
        refreshed = await session.get(User, user.id)
        assert refreshed is not None
        assert refreshed.deleted_at is not None

    async def test_a_live_subscription_ends_first(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        session.add(
            DesktopSubscription(
                user_id=user.id,
                stripe_customer_id="cus_1",
                stripe_subscription_id="sub_1",
                status="active",
                synced_at=utc_now(),
                raw={},
            )
        )
        await session.commit()
        mocker.patch.object(account_deletion.settings, "STRIPE_SECRET_KEY", "sk_test")
        cancel = mocker.patch.object(
            account_deletion.stripe_billing, "cancel_subscription", return_value={}
        )

        response = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )

        assert response.status_code == 200, response.text
        assert response.json()["subscription"] == "ended"
        cancel.assert_awaited_once_with("sub_1")
        session.expire_all()
        row = (
            await session.execute(
                select(DesktopSubscription).where(
                    DesktopSubscription.user_id == user.id
                )
            )
        ).scalar_one()
        # Kept as a billing record, ended.
        assert row.status == "canceled"

    async def test_a_computer_that_cannot_be_removed_stops_the_deletion(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,  # noqa: F811
        mocker: MockerFixture,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        made = await _ensure(client, access)
        assert made.status_code == 200, made.text
        session.add(
            DesktopMemoryFile(user_id=user.id, name="MEMORY.md", content="Likes tea.")
        )
        await session.commit()

        async def unreachable(provider_box_id: str, *, volumes: list[str]) -> None:
            raise BoxHostError("the server did not answer")

        mocker.patch.object(host, "remove", side_effect=unreachable)

        response = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )

        assert response.status_code == 503, response.text
        assert "couldn't be deleted right now" in response.json()["error"]["message"]
        session.expire_all()
        # Nothing else was done: the memory and the account are still there.
        assert await _count(session, DesktopMemoryFile, user) == 1
        refreshed = await session.get(User, user.id)
        assert refreshed is not None
        assert refreshed.deleted_at is None

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.delete(DELETE)
        assert response.status_code == 401
