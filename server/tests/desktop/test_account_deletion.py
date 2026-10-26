"""Deleting an account from the app (`simeon/desktop/account_deletion.py`,
11 October 2026): the cloud computer and its volumes, the app sign-ins,
the call transcripts, the rows and every session go; the user is
anonymised; a step that must succeed and cannot leaves the rest undone."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import func, select, text

from simeon.config import settings
from simeon.desktop import account_deletion
from simeon.desktop import voice as voice_module
from simeon.kit.db.postgres import create_async_engine
from simeon.kit.utils import utc_now
from simeon.models import (
    DesktopChannelBot,
    DesktopChatAgent,
    DesktopChatInbox,
    DesktopChatLine,
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
from tests.fixtures.database import get_database_url
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
        session.add(
            DesktopChatAgent(user_id=user.id, agent_id="theo", row={"id": "theo"})
        )
        session.add(
            DesktopChatLine(
                user_id=user.id,
                agent_id="theo",
                entry_id="u1",
                at_ms=1_000,
                entry={"id": "u1", "kind": "message", "content": "Book it"},
            )
        )
        session.add(
            DesktopChatInbox(
                user_id=user.id,
                agent_id="theo",
                nonce="ios-1",
                kind="prompt",
                message={"prompt": "Call me"},
            )
        )
        session.add(
            DesktopChannelBot(
                user_id=user.id,
                agent_id="theo",
                platform="discord",
                fingerprint="f1",
                secrets="sealed",
            )
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
        for model in (
            DesktopMemoryFile,
            DesktopVoiceCall,
            DesktopChatAgent,
            DesktopChatLine,
            DesktopChatInbox,
            DesktopChannelBot,
            SandBox,
            DesktopSession,
        ):
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

    @pytest.mark.parametrize("fails", [False, True])
    async def test_the_computers_backups_go_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,  # noqa: F811
        mocker: MockerFixture,
        fails: bool,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, access)).status_code == 200
        mocker.patch.object(settings, "BOX_STORE_BUCKET", "simeon-backups")
        delete_user = mocker.patch.object(
            account_deletion.box_store,
            "delete_user",
            side_effect=RuntimeError("S3 refused") if fails else None,
            return_value=7,
        )

        response = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )

        assert response.status_code == 200, response.text
        delete_user.assert_called_once_with(user.id)
        # A backup S3 would not delete does not stop the rest: it is said,
        # and logged to finish by hand.
        incomplete = response.json()["incomplete"]
        assert incomplete == (["computer backups (S3 refused)"] if fails else [])

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

    async def test_a_computer_being_started_holds_the_delete_back(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        worker_id: str,
        mocker: MockerFixture,
    ) -> None:
        """14 October 2026: removing the container drops the app's
        connection, and the app's reconnect rebuilt the computer while the
        delete ran, stalling it past the app's patience. The delete now
        holds the lock the reconnect takes: here another connection holds
        it (a computer being started), and the delete waits, then says to
        try again, having done nothing."""
        access, _ = await _signed_in(client, session, user)
        session.add(
            DesktopMemoryFile(user_id=user.id, name="MEMORY.md", content="Likes tea.")
        )
        await session.commit()
        mocker.patch.object(account_deletion, "ENSURE_LOCK_WAIT", timedelta(0))
        mocker.patch.object(account_deletion, "ENSURE_LOCK_POLL", 0.01)
        engine = create_async_engine(
            dsn=get_database_url(worker_id),
            application_name="test_other",
            pool_size=1,
            pool_recycle=settings.DATABASE_POOL_RECYCLE_SECONDS,
        )
        try:
            async with engine.connect() as other, other.begin():
                await other.execute(
                    text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                    {"key": f"sand-box-ensure:{user.id}"},
                )
                held = await client.delete(
                    DELETE, headers={"Authorization": f"Bearer {access}"}
                )
        finally:
            await engine.dispose()

        assert held.status_code == 503, held.text
        assert "is starting" in held.json()["error"]["message"]
        session.expire_all()
        assert await _count(session, DesktopMemoryFile, user) == 1

        # The computer started (the other side let go): the delete goes through.
        mocker.patch.object(voice_module, "client", FakeVoice)
        response = await client.delete(
            DELETE, headers={"Authorization": f"Bearer {access}"}
        )
        assert response.status_code == 200, response.text
        session.expire_all()
        assert await _count(session, DesktopMemoryFile, user) == 0

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.delete(DELETE)
        assert response.status_code == 401
