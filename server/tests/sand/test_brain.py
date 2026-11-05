"""The brain's side of the API (5 November 2026,
`docs/agents-on-the-server/README.md`, step 1c): its start-up details, its
own credential beside the computer's, and the computer's state."""

from collections.abc import AsyncIterator, Iterator
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop.service import BRAIN_CREDENTIAL_AGENT, desktop
from simeon.models import DesktopSession, SandBox, User
from simeon.postgres import AsyncSession
from simeon.sand import box_proxy, box_store, brain_users
from simeon.sand.box_service import broker
from simeon.sand.box_tasks import sand_box_wake
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


# --- the door to the computer's hands ----------------------------------------------

GONE = (
    b'{"sandboxId":"sbx-brain-test","message":"The sandbox was not found","code":502}'
)
TRAFFIC = "traffic-brain-test"


async def _e2b_computer(
    client: httpx.AsyncClient,
    session: AsyncSession,
    user: User,
    *,
    state: str = "running",
) -> SandBox:
    box, _ = await _computer(client, session, user, state=state)
    box.host_address = "e2b.app"
    box.host_meta = {"kind": "e2b", "traffic_token": TRAFFIC}
    session.add(box)
    await session.commit()
    return box


def _brain_headers(user: User, **extra: str) -> dict[str, str]:
    return {
        "x-simeon-brain-token": BRAIN_TOKEN,
        "x-simeon-brain-user": str(user.id),
        **extra,
    }


class _Chunks(httpx.AsyncByteStream):
    def __init__(self, *chunks: bytes) -> None:
        self.chunks = chunks

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            yield chunk


@pytest.fixture
def computer_side() -> Iterator[SimpleNamespace]:
    """A stand-in for E2B: each call it saw (`seen`), and what it answers
    (`answers`, one per call, then 200)."""
    side = SimpleNamespace(seen=[], answers=[])

    def answer(request: httpx.Request) -> httpx.Response:
        side.seen.append(request)
        if side.answers:
            status, body = side.answers.pop(0)
            return httpx.Response(status, content=body)
        return httpx.Response(
            200,
            headers={"content-type": "application/connect+json"},
            stream=_Chunks(b'{"stdout":"hello', b' from the hands"}'),
        )

    box_proxy.set_client_factory_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(answer))
    )
    yield side
    box_proxy.set_client_factory_for_tests(None)


HANDS_CALL = "/sand-box/brain/hands/sand.box.exec.v1.ExecService/Exec"


@pytest.mark.asyncio
class TestHandsDoor:
    async def test_a_call_goes_to_the_computers_router_with_its_tokens(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        box = await _e2b_computer(client, session, user)
        _brain_on(mocker, user)
        wake = mocker.patch.object(broker, "wake_locked", autospec=True)
        response = await client.post(
            f"{HANDS_CALL}?probe=1",
            content=b'{"command":"echo hi"}',
            headers=_brain_headers(
                user,
                authorization="Bearer local",
                **{
                    "x-sand-display": "3",
                    "x-simeon-box-token": "forged",
                    "e2b-traffic-access-token": "forged",
                    "content-type": "application/json",
                },
            ),
        )
        assert response.status_code == 200, response.text
        assert response.content == b'{"stdout":"hello from the hands"}'
        assert response.headers["content-type"] == "application/connect+json"
        wake.assert_not_called()
        [sent] = computer_side.seen
        assert str(sent.url) == (
            "https://1339-sbx-brain-test.e2b.app"
            "/sand.box.exec.v1.ExecService/Exec?probe=1"
        )
        assert sent.method == "POST"
        assert sent.content == b'{"command":"echo hi"}'
        # The engine's own headers go on; the API sets the computer's tokens.
        assert sent.headers["authorization"] == "Bearer local"
        assert sent.headers["x-sand-display"] == "3"
        assert sent.headers["x-simeon-box-token"] == box.gateway_token
        assert sent.headers["e2b-traffic-access-token"] == TRAFFIC
        # The brain's own headers stop at the door.
        assert "x-simeon-brain-token" not in sent.headers
        assert "x-simeon-brain-user" not in sent.headers

    async def test_a_sleeping_computer_is_woken_first(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        await _e2b_computer(client, session, user, state="hibernated")
        _brain_on(mocker, user)
        wake = mocker.patch.object(
            broker, "wake_locked", autospec=True, return_value="woken"
        )
        response = await client.post(
            HANDS_CALL, content=b"{}", headers=_brain_headers(user)
        )
        assert response.status_code == 200, response.text
        wake.assert_called_once()
        assert wake.call_args.args[-1] == user.id
        assert len(computer_side.seen) == 1

    async def test_a_computer_lost_under_the_call_is_woken_and_the_call_sent_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        await _e2b_computer(client, session, user, state="running")
        _brain_on(mocker, user)
        wake = mocker.patch.object(
            broker, "wake_locked", autospec=True, return_value="woken"
        )
        computer_side.answers = [(502, GONE)]
        response = await client.post(
            HANDS_CALL, content=b'{"command":"ls"}', headers=_brain_headers(user)
        )
        assert response.status_code == 200, response.text
        wake.assert_called_once()
        assert [sent.content for sent in computer_side.seen] == [
            b'{"command":"ls"}',
            b'{"command":"ls"}',
        ]

    async def test_the_hands_own_refusal_reaches_the_brain(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        await _e2b_computer(client, session, user)
        _brain_on(mocker, user)
        computer_side.answers = [(401, b"sand-window-router: box token refused")]
        response = await client.post(
            HANDS_CALL, content=b"{}", headers=_brain_headers(user)
        )
        assert response.status_code == 401
        assert response.content == b"sand-window-router: box token refused"
        assert len(computer_side.seen) == 1

    async def test_a_full_account_or_an_update_says_so(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        await _e2b_computer(client, session, user, state="hibernated")
        _brain_on(mocker, user)
        wake = mocker.patch.object(
            broker, "wake_locked", autospec=True, return_value="deferred"
        )
        response = await client.post(
            HANDS_CALL, content=b"{}", headers=_brain_headers(user)
        )
        assert response.status_code == 503
        assert response.json()["error"] == "computer_full"
        assert response.headers["retry-after"] == "60"
        assert computer_side.seen == []
        mocker.patch("simeon.sand.brain.WAKE_WAIT_SECONDS", 0.0)
        wake.return_value = "ensuring"
        response = await client.post(
            HANDS_CALL, content=b"{}", headers=_brain_headers(user)
        )
        assert response.status_code == 503
        assert response.json()["error"] == "computer_updating"
        assert computer_side.seen == []

    async def test_refusals(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        box = await _e2b_computer(client, session, user)
        # Nothing configured: refused, whatever is sent.
        response = await client.post(
            HANDS_CALL, content=b"{}", headers=_brain_headers(user)
        )
        assert response.status_code == 401
        _brain_on(mocker, user)
        response = await client.post(
            HANDS_CALL,
            content=b"{}",
            headers={**_brain_headers(user), "x-simeon-brain-token": "wrong"},
        )
        assert response.status_code == 401
        # The engine's bearer for the hands never reaches the sign-in layer.
        response = await client.post(
            HANDS_CALL,
            content=b"{}",
            headers={
                "x-simeon-brain-user": str(user.id),
                "authorization": "Bearer local",
            },
        )
        assert response.status_code == 401
        assert response.json()["error"] == "brain_token"
        # A Docker computer has no door.
        box.host_meta = {"kind": "docker"}
        session.add(box)
        await session.commit()
        response = await client.post(
            HANDS_CALL, content=b"{}", headers=_brain_headers(user)
        )
        assert response.status_code == 409
        assert response.json()["error"] == "no_door"
        assert computer_side.seen == []


# --- the apps, for a person on the brain -------------------------------------------

ENSURE = "/simeon.v1.ComputerService/EnsureSandBox"
RUN_STATE = "/simeon.v1.ComputerService/GetSandBoxRunState"


@pytest.fixture(autouse=True)
def _forget_who_is_on_the_brain() -> Iterator[None]:
    brain_users.forget_for_tests()
    yield
    brain_users.forget_for_tests()


async def _app_computer(
    client: httpx.AsyncClient,
    session: AsyncSession,
    user: User,
    *,
    state: str = "hibernated",
) -> tuple[SandBox, str]:
    """The person's computer as the apps know it (its address on the API's
    proxy), and an access token of their device."""
    box = await _e2b_computer(client, session, user, state=state)
    box.gateway_url = f"https://api.simeonlabs.com/sand-box/{box.id}/p/1340"
    box.vnc_url = f"https://api.simeonlabs.com/sand-box/{box.id}/p/6080/vnc.html"
    session.add(box)
    await session.commit()
    access, _ = await _signed_in(client, session, user)
    return box, access


def _app_headers(box: SandBox) -> dict[str, str]:
    return {
        "authorization": f"Bearer {box.gateway_token}",
        "x-anyrun-network-token": box.network_token,
    }


@pytest.mark.asyncio
class TestTheAppsReachTheBrain:
    async def test_the_engines_port_goes_to_the_brain_and_the_screen_to_the_computer(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        box, _ = await _app_computer(client, session, user)
        _brain_on(mocker, user)
        wake = mocker.patch.object(broker, "wake_locked", autospec=True)
        response = await client.post(
            f"/sand-box/{box.id}/p/1340/api/listAgents?x=1",
            content=b"{}",
            headers=_app_headers(box),
        )
        assert response.status_code == 200, response.text
        screen = await client.get(
            f"/sand-box/{box.id}/p/6080/vnc.html", headers=_app_headers(box)
        )
        assert screen.status_code == 200, screen.text
        wake.assert_not_called()
        to_brain, to_computer = computer_side.seen
        assert str(to_brain.url) == "http://simeon-brain:10000/api/listAgents?x=1"
        # The person's own bearer, which the brain's engine checks; none of
        # the computer's tokens.
        assert to_brain.headers["authorization"] == f"Bearer {box.gateway_token}"
        assert "x-anyrun-network-token" not in to_brain.headers
        assert "e2b-traffic-access-token" not in to_brain.headers
        assert str(to_computer.url) == "https://6080-sbx-brain-test.e2b.app/vnc.html"
        assert to_computer.headers["e2b-traffic-access-token"] == TRAFFIC

    async def test_someone_not_on_the_brain_reaches_their_computer(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        computer_side: SimpleNamespace,
    ) -> None:
        box, _ = await _app_computer(client, session, user, state="running")
        _brain_on(mocker, user)
        mocker.patch.object(settings, "BRAIN_USERS", "someone-else@example.com")
        response = await client.post(
            f"/sand-box/{box.id}/p/1340/api/listAgents",
            content=b"{}",
            headers=_app_headers(box),
        )
        assert response.status_code == 200, response.text
        [sent] = computer_side.seen
        assert str(sent.url) == "https://1340-sbx-brain-test.e2b.app/api/listAgents"

    async def test_the_brain_not_answering_is_said(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        box, _ = await _app_computer(client, session, user)
        _brain_on(mocker, user)

        def down(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        box_proxy.set_client_factory_for_tests(
            lambda: httpx.AsyncClient(transport=httpx.MockTransport(down))
        )
        try:
            response = await client.get(
                f"/sand-box/{box.id}/p/1340/health", headers=_app_headers(box)
            )
        finally:
            box_proxy.set_client_factory_for_tests(None)
        assert response.status_code == 502

    async def test_ensure_never_wakes_the_computer_and_the_apps_never_wait_for_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        box, access = await _app_computer(client, session, user)
        _brain_on(mocker, user)
        mocker.patch.object(settings, "BOX_SLEEPS_WITH_APP_OPEN", True)
        ensure = mocker.patch.object(broker, "ensure", autospec=True)
        auth = {"Authorization": f"Bearer {access}"}
        response = await client.post(ENSURE, json={}, headers=auth)
        assert response.status_code == 200, response.text
        body = response.json()
        ensure.assert_not_called()
        assert body["gatewayUrl"] == box.gateway_url
        assert body["gatewayToken"] == box.gateway_token
        assert body["networkToken"] == box.network_token
        assert body["vncUrl"] == box.vnc_url
        assert body["podId"] == str(box.id)
        assert body["letsSleep"] is False
        record = await client.post(RUN_STATE, json={"fromRecord": True}, headers=auth)
        assert record.status_code == 200, record.text
        assert record.json()["letsSleep"] is False
        # Someone else, on the same server, still lets theirs sleep.
        mocker.patch.object(settings, "BRAIN_USERS", "someone-else@example.com")
        record = await client.post(RUN_STATE, json={"fromRecord": True}, headers=auth)
        assert record.json()["letsSleep"] is True

    async def test_a_computer_the_record_says_is_gone_is_made_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        box, access = await _app_computer(client, session, user, state="absent")
        _brain_on(mocker, user)
        ensure = mocker.patch.object(broker, "ensure", autospec=True, return_value=box)
        response = await client.post(
            ENSURE, json={}, headers={"Authorization": f"Bearer {access}"}
        )
        assert response.status_code == 200, response.text
        ensure.assert_called_once()

    async def test_incoming_work_never_wakes_the_computer(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _app_computer(client, session, user)
        _brain_on(mocker, user)
        wake = mocker.patch.object(broker, "wake", autospec=True)
        await sand_box_wake(str(user.id))
        wake.assert_not_called()
        mocker.patch.object(settings, "BRAIN_USERS", "someone-else@example.com")
        wake.return_value = "woken"
        await sand_box_wake(str(user.id))
        wake.assert_called_once()
