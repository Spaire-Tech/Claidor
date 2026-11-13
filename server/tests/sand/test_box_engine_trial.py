"""A new engine tried on a few accounts before everyone (13 November 2026).

`npm run publish:host-bundle -- --trial` writes a second pointer in the
bundle folder, `sand-host-bundle-trial.version`. The accounts in
`SIMEON_BOX_ENGINE_TRIAL_USERS` run the engine it names; everyone else keeps
the one `sand-host-bundle-latest.version` names. With no trial published, or
one that cannot be read, those accounts run everyone's.
"""

from __future__ import annotations

import io
import tarfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.sand import box_hosts
from simeon.sand.box_e2b import E2BBoxHost
from simeon.sand.box_hosts import HostBundle, load_trial_bundle, with_bundle
from tests.desktop.test_endpoints import _signed_in
from tests.sand.test_box_broker import FakeBoxHost, _ensure, backups
from tests.sand.test_box_e2b import BUNDLE, WORKERS, FakeE2B, _host, dials, e2b
from tests.sand.test_box_sleep import _box_of, health

__all__ = ["backups", "dials", "e2b", "health"]

BASE = "https://bundles.example/host"
#: The engine being tried, as the folder serves it and as the server reads it.
TRIAL_HOST = b"// host on trial"
TRIAL = HostBundle(TRIAL_HOST, b"// exec daemon", WORKERS)
NEXT_HOST = "/home/box/sand-host/host-main.cjs.next"


def _tar(program: bytes) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        members = {
            "host/host-main.cjs": program,
            "box-exec-daemon/main.cjs": b"// exec daemon",
            **{f"host/{name}": data for name, data in WORKERS.items()},
        }
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class Folder:
    """The bundle folder: everyone's pointer, the trial pointer (none until
    one is published), and one file per version."""

    def __init__(self) -> None:
        self.trial: str | int = 404
        self.files = {"aaaaaaa1": _tar(b"// host"), "ccccccc3": _tar(TRIAL_HOST)}
        self.reads: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[-1]
        self.reads.append(name)
        if name == "sand-host-bundle-latest.version":
            return httpx.Response(200, text="aaaaaaa1\n")
        if name == "sand-host-bundle-trial.version":
            if isinstance(self.trial, int):
                return httpx.Response(self.trial)
            return httpx.Response(200, text=self.trial)
        for version, data in self.files.items():
            if name == f"sand-host-bundle-{version}.tgz":
                return httpx.Response(200, content=data)
        return httpx.Response(404)


@pytest.fixture
def folder(mocker: MockerFixture) -> Iterator[Folder]:
    served = Folder()
    box_hosts.set_bundle_http_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(served.handle))
    )
    mocker.patch.object(settings, "BOX_HOST_BUNDLE_URL", BASE)
    yield served
    box_hosts.set_bundle_http_for_tests(None)


def _later(mocker: MockerFixture, minutes: int) -> None:
    moment = datetime.now(UTC) + timedelta(minutes=minutes)

    class Later(datetime):
        @classmethod
        def now(cls, tz: object = None) -> datetime:  # type: ignore[override]
            return moment

    mocker.patch.object(box_hosts, "datetime", Later)


@pytest.fixture
def cloud(e2b: FakeE2B) -> Iterator[E2BBoxHost]:
    """One E2B server for everyone, on everyone's engine."""
    host = _host(e2b)
    box_hosts.set_box_host_for_tests([host])
    yield host
    box_hosts.set_box_host_for_tests(None)


@pytest.mark.asyncio
class TestTrialPointer:
    async def test_no_trial_published_is_none_and_not_asked_again_for_a_while(
        self, folder: Folder, mocker: MockerFixture
    ) -> None:
        assert await load_trial_bundle(BASE) is None
        assert await load_trial_bundle(BASE) is None
        assert folder.reads.count("sand-host-bundle-trial.version") == 1
        # Published since: read once the ten minutes have passed.
        folder.trial = "ccccccc3\n"
        assert await load_trial_bundle(BASE) is None
        _later(mocker, 11)
        trial = await load_trial_bundle(BASE)
        assert trial is not None
        assert trial.host_main == TRIAL_HOST
        assert trial.folder_sha256 == TRIAL.folder_sha256

    async def test_the_trial_pointer_is_kept_apart_from_everyones(
        self, folder: Folder
    ) -> None:
        folder.trial = "ccccccc3"
        everyone = await box_hosts.load_host_bundle(BASE)
        trial = await load_trial_bundle(BASE)
        assert everyone is not None
        assert trial is not None
        assert everyone.host_main == b"// host"
        assert trial.host_main == TRIAL_HOST
        # Each pointer is trusted for its own ten minutes.
        await box_hosts.load_host_bundle(BASE)
        await load_trial_bundle(BASE)
        assert folder.reads.count("sand-host-bundle-latest.version") == 1
        assert folder.reads.count("sand-host-bundle-trial.version") == 1

    async def test_a_trial_that_names_no_file_or_no_commit_is_none(
        self, folder: Folder, mocker: MockerFixture
    ) -> None:
        folder.trial = "ddddddd4"
        assert await load_trial_bundle(BASE) is None
        _later(mocker, 11)
        folder.trial = "../../etc/passwd"
        assert await load_trial_bundle(BASE) is None
        # A file cut short in the upload is no engine either.
        _later(mocker, 22)
        folder.files["eeeeeee5"] = _tar(TRIAL_HOST)[:40]
        folder.trial = "eeeeeee5"
        assert await load_trial_bundle(BASE) is None

    async def test_one_fixed_file_has_no_trial(self, folder: Folder) -> None:
        assert await load_trial_bundle(f"{BASE}/sand-host-bundle-aaaaaaa1.tgz") is None
        assert await load_trial_bundle("") is None
        assert folder.reads == []


class TestView:
    def test_the_same_server_with_the_other_engine(self) -> None:
        host = _host(FakeE2B())
        view = with_bundle(host, TRIAL)
        assert view is not host
        assert view.name == host.name
        assert view.expected_host_sha256 == TRIAL.folder_sha256  # type: ignore[attr-defined]
        # Everyone's server is untouched, and the view is kept.
        assert host.expected_host_sha256 == BUNDLE.folder_sha256
        assert with_bundle(host, TRIAL) is view
        box_hosts.set_bundle_http_for_tests(None)

    def test_the_same_engine_or_no_engine_of_ours_is_the_server_itself(self) -> None:
        host = _host(FakeE2B())
        assert with_bundle(host, BUNDLE) is host
        stand_in = FakeBoxHost()
        assert with_bundle(stand_in, TRIAL) is stand_in

    def test_a_server_configured_again_gets_a_view_of_its_own(self) -> None:
        first = _host(FakeE2B())
        view = with_bundle(first, TRIAL)
        second = _host(FakeE2B())
        again = with_bundle(second, TRIAL)
        assert again is not view
        assert again.sdk is second.sdk  # type: ignore[attr-defined]
        box_hosts.set_bundle_http_for_tests(None)


@pytest.mark.asyncio
class TestOnTheList:
    async def test_the_listed_person_gets_the_trial_engine_and_nobody_else(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        cloud: E2BBoxHost,
        e2b: FakeE2B,
        folder: Folder,
        dials: Any,
        backups: Any,
        mocker: MockerFixture,
    ) -> None:
        mine, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, mine)).status_code == 200
        theirs, _ = await _signed_in(client, session, user_second)
        assert (await _ensure(client, theirs)).status_code == 200
        assert list(e2b.boxes) == ["sbx1", "sbx2"]

        # A trial is published, and the first person is put on the list.
        folder.trial = "ccccccc3"
        mocker.patch.object(settings, "BOX_ENGINE_TRIAL_USERS", user.email.upper())
        assert (await _ensure(client, mine)).status_code == 200
        assert (await _ensure(client, theirs)).status_code == 200
        # Theirs moved to it in place, its disk kept; the other was left alone.
        assert list(e2b.boxes) == ["sbx1", "sbx2"]
        assert e2b.boxes["sbx1"]["files"][NEXT_HOST][0] == TRIAL_HOST
        assert NEXT_HOST not in e2b.boxes["sbx2"]["files"]
        session.expunge_all()
        assert (await _box_of(session, user)).host_meta["host_sha256"] == (
            TRIAL.folder_sha256
        )
        assert "host_sha256" not in (await _box_of(session, user_second)).host_meta

        # Up to date on the trial: opening the app again changes nothing.
        commands = list(e2b.boxes["sbx1"]["commands"])
        assert (await _ensure(client, mine)).status_code == 200
        assert e2b.boxes["sbx1"]["commands"] == commands

    async def test_given_to_everyone_the_others_move_and_the_listed_person_stays(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        cloud: E2BBoxHost,
        e2b: FakeE2B,
        folder: Folder,
        dials: Any,
        backups: Any,
        mocker: MockerFixture,
    ) -> None:
        folder.trial = "ccccccc3"
        mocker.patch.object(settings, "BOX_ENGINE_TRIAL_USERS", str(user.id))
        mine, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, mine)).status_code == 200
        theirs, _ = await _signed_in(client, session, user_second)
        assert (await _ensure(client, theirs)).status_code == 200
        # A new computer for the listed person is made with the trial engine.
        assert e2b.created[0]["metadata"]["host_sha256"] == TRIAL.folder_sha256
        assert e2b.created[1]["metadata"]["host_sha256"] == BUNDLE.folder_sha256

        # The trial is given to everyone: everyone's pointer now names it.
        cloud.bundle = TRIAL
        commands = list(e2b.boxes["sbx1"]["commands"])
        assert (await _ensure(client, mine)).status_code == 200
        assert (await _ensure(client, theirs)).status_code == 200
        assert e2b.boxes["sbx1"]["commands"] == commands
        assert e2b.boxes["sbx2"]["files"][NEXT_HOST][0] == TRIAL_HOST
        assert list(e2b.boxes) == ["sbx1", "sbx2"]

    async def test_off_the_list_the_person_goes_back_to_everyones(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        cloud: E2BBoxHost,
        e2b: FakeE2B,
        folder: Folder,
        dials: Any,
        backups: Any,
        mocker: MockerFixture,
    ) -> None:
        folder.trial = "ccccccc3"
        mocker.patch.object(settings, "BOX_ENGINE_TRIAL_USERS", user.email)
        mine, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, mine)).status_code == 200
        assert e2b.created[0]["metadata"]["host_sha256"] == TRIAL.folder_sha256

        mocker.patch.object(settings, "BOX_ENGINE_TRIAL_USERS", "")
        assert (await _ensure(client, mine)).status_code == 200
        assert list(e2b.boxes) == ["sbx1"]
        assert e2b.boxes["sbx1"]["files"][NEXT_HOST][0] == b"// host"
        session.expunge_all()
        assert (await _box_of(session, user)).host_meta["host_sha256"] == (
            BUNDLE.folder_sha256
        )

    async def test_with_no_trial_published_the_listed_person_runs_everyones(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        cloud: E2BBoxHost,
        e2b: FakeE2B,
        folder: Folder,
        dials: Any,
        backups: Any,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "BOX_ENGINE_TRIAL_USERS", user.email)
        mine, _ = await _signed_in(client, session, user)
        assert (await _ensure(client, mine)).status_code == 200
        assert (await _ensure(client, mine)).status_code == 200
        assert e2b.created[0]["metadata"]["host_sha256"] == BUNDLE.folder_sha256
        assert NEXT_HOST not in e2b.boxes["sbx1"]["files"]
        assert folder.reads.count("sand-host-bundle-trial.version") == 1
