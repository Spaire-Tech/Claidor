"""The brain's side of the API (5 November 2026,
`docs/agents-on-the-server/README.md`, step 1c): its start-up details, its
own credential beside the computer's, and the computer's state."""

from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop.service import BRAIN_CREDENTIAL_AGENT, desktop
from simeon.models import DesktopSession, SandBox, User
from simeon.postgres import AsyncSession
from simeon.sand import box_store
from simeon.sand.brain import brain_source_id

from ..desktop.test_endpoints import _signed_in

BRAIN_TOKEN = "brain-test-token"


def _brain_on(mocker: MockerFixture, user: User) -> None:
    mocker.patch.object(
        settings, "BRAIN_USERS", f" other@example.com , {user.email.upper()} "
    )
    mocker.patch.object(settings, "BRAIN_URL", "http://simeon-brain:10000")
    mocker.patch.object(settings, "BRAIN_TOKEN", BRAIN_TOKEN)


async def _computer(
    client: httpx.AsyncClient,
    session: AsyncSession,
    user: User,
    *,
    state: str = "hibernated",
) -> tuple[SandBox, str]:
    """The person signed in on a device, with a computer holding the box
    credential that device asked for: the state the founder's account is in."""
    await _signed_in(client, session, user)
    parent = (
        (
            await session.execute(
                select(DesktopSession).where(
                    DesktopSession.user_id == user.id,
                    DesktopSession.box_of_session_id.is_(None),
                    DesktopSession.job_id.is_(None),
                )
            )
        )
        .unique()
        .scalar_one()
    )
    row, credential = await desktop.issue_box_credential(session, parent)
    box = SandBox(
        user_id=user.id,
        provider="e2b",
        provider_box_id="sbx-brain-test",
        host_address="",
        ports={},
        gateway_token="gw-brain-test",
        network_token="nt-brain-test",
        state=state,
        credential_session_id=row.id,
    )
    session.add(box)
    await session.commit()
    return box, credential


async def _renews(client: httpx.AsyncClient, credential: str) -> int:
    response = await client.post(
        "/sand-box/inference-credential", json={"credential": credential}
    )
    return response.status_code


async def _bootstrap(
    client: httpx.AsyncClient, email: str, token: str = BRAIN_TOKEN
) -> httpx.Response:
    return await client.post(
        "/sand-box/brain/bootstrap",
        json={"email": email},
        headers={"x-simeon-brain-token": token},
    )


@pytest.mark.asyncio
class TestBootstrap:
    async def test_refused_without_the_brain_or_its_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _computer(client, session, user)
        # The brain not configured: nobody's agents run there, whatever is sent.
        assert (await _bootstrap(client, user.email)).status_code == 401
        _brain_on(mocker, user)
        assert (await _bootstrap(client, user.email, token="wrong")).status_code == 401
        assert (await _bootstrap(client, "other-person@example.com")).status_code == 403

    async def test_a_person_without_a_computer_is_told_to_open_simeon_first(
        self, client: httpx.AsyncClient, user: User, mocker: MockerFixture
    ) -> None:
        _brain_on(mocker, user)
        response = await _bootstrap(client, user.email)
        assert response.status_code == 409
        assert response.json()["error"] == "no_computer"

    async def test_the_brain_gets_what_it_starts_with(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        box, box_credential = await _computer(client, session, user)
        _brain_on(mocker, user)
        response = await _bootstrap(client, user.email)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        body: dict[str, Any] = response.json()
        assert body["userId"] == str(user.id)
        assert body["gatewayToken"] == box.gateway_token
        assert body["backendUrl"] == settings.BASE_URL
        assert body["computerStoreSource"] == box_store.box_source_id(user.id)
        assert body["brainStoreSource"] == brain_source_id(user.id)
        assert body["brainStoreSource"] != body["computerStoreSource"], (
            "two stores, never shared"
        )
        # The brain's credential renews, and the computer's still does.
        assert await _renews(client, body["credential"]) == 200
        assert await _renews(client, box_credential) == 200
        row = (
            (
                await session.execute(
                    select(DesktopSession).where(
                        DesktopSession.user_agent.startswith(BRAIN_CREDENTIAL_AGENT)
                    )
                )
            )
            .unique()
            .scalar_one()
        )
        assert row.box_of_session_id is not None, (
            "a child of the device, revoked with it"
        )

    async def test_a_new_brain_credential_replaces_the_last_one_and_never_the_computers(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _, box_credential = await _computer(client, session, user)
        _brain_on(mocker, user)
        first = (await _bootstrap(client, user.email)).json()["credential"]
        second = (await _bootstrap(client, user.email)).json()["credential"]
        assert await _renews(client, first) == 401
        assert await _renews(client, second) == 200
        assert await _renews(client, box_credential) == 200

    async def test_a_new_computer_credential_never_revokes_the_brains(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _computer(client, session, user)
        _brain_on(mocker, user)
        brain_credential = (await _bootstrap(client, user.email)).json()["credential"]
        parent = (
            (
                await session.execute(
                    select(DesktopSession).where(
                        DesktopSession.user_id == user.id,
                        DesktopSession.box_of_session_id.is_(None),
                        DesktopSession.job_id.is_(None),
                    )
                )
            )
            .unique()
            .scalar_one()
        )
        _, fresh_box_credential = await desktop.issue_box_credential(session, parent)
        await session.commit()
        assert await _renews(client, fresh_box_credential) == 200
        assert await _renews(client, brain_credential) == 200


@pytest.mark.asyncio
class TestComputerState:
    async def test_the_state_comes_from_the_record_in_the_apps_words(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _computer(client, session, user, state="hibernated")
        _brain_on(mocker, user)
        headers = {
            "x-simeon-brain-token": BRAIN_TOKEN,
            "x-simeon-brain-user": str(user.id),
        }
        response = await client.get("/sand-box/brain/hands/state", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json() == {"state": "hibernated"}

    async def test_refusals(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _computer(client, session, user)
        _brain_on(mocker, user)
        state = "/sand-box/brain/hands/state"
        assert (
            await client.get(state, headers={"x-simeon-brain-user": str(user.id)})
        ).status_code == 401
        assert (
            await client.get(state, headers={"x-simeon-brain-token": BRAIN_TOKEN})
        ).status_code == 400
        mocker.patch.object(settings, "BRAIN_USERS", "someone-else@example.com")
        assert (
            await client.get(
                state,
                headers={
                    "x-simeon-brain-token": BRAIN_TOKEN,
                    "x-simeon-brain-user": str(user.id),
                },
            )
        ).status_code == 403
