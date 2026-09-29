"""Host bundle updates in the upstream app's layout (29 September 2026): the server
follows `sand-host-bundle-latest.version` in the bundle folder, re-reads it
every ten minutes with no restart, keeps the last version when the pointer
cannot be read, and each cloud computer moves to a new version only when it
is idle, as the upstream app's supervisor does.
"""

from __future__ import annotations

import io
import tarfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.sand import box_hosts
from simeon.sand.box_hosts import BoxHostError, load_host_bundle
from simeon.sand.box_service import BoxHealth
from tests.sand.test_box_broker import FakeBoxHost, _ensure, host  # noqa: F401
from tests.sand.test_box_sleep import _awake_box, health  # noqa: F401

BASE = "https://bundles.example/host"


def _tar(program: bytes) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name, data in (
            ("host/host-main.cjs", program),
            ("box-exec-daemon/main.cjs", b"daemon"),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class Channel:
    """A bundle folder: a pointer and one tarball per version."""

    def __init__(self) -> None:
        self.pointer: str | int = "aaaaaaa1\n"
        self.files = {"aaaaaaa1": _tar(b"host v1"), "bbbbbbb2": _tar(b"host v2")}
        self.reads: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.reads.append(path.rsplit("/", 1)[-1])
        if path.endswith("/sand-host-bundle-latest.version"):
            if isinstance(self.pointer, int):
                return httpx.Response(self.pointer)
            return httpx.Response(200, text=self.pointer)
        for version, data in self.files.items():
            if path.endswith(f"/sand-host-bundle-{version}.tgz"):
                return httpx.Response(200, content=data)
        return httpx.Response(404)


@pytest.fixture
def channel() -> Iterator[Channel]:
    served = Channel()
    box_hosts.set_bundle_http_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(served.handle))
    )
    yield served
    box_hosts.set_bundle_http_for_tests(None)


def _later(mocker: MockerFixture, minutes: int) -> None:
    moment = datetime.now(UTC) + timedelta(minutes=minutes)

    class Later(datetime):
        @classmethod
        def now(cls, tz: object = None) -> datetime:  # type: ignore[override]
            return moment

    mocker.patch.object(box_hosts, "datetime", Later)


@pytest.mark.asyncio
class TestChannel:
    async def test_the_pointer_names_the_bundle_and_is_trusted_for_ten_minutes(
        self, channel: Channel, mocker: MockerFixture
    ) -> None:
        first = await load_host_bundle(BASE)
        assert first is not None
        assert first.host_main == b"host v1"
        channel.pointer = "bbbbbbb2"
        # Within the upstream app's ten minutes the pointer is not read again.
        again = await load_host_bundle(BASE)
        assert again is not None
        assert again.host_main == b"host v1"
        assert channel.reads.count("sand-host-bundle-latest.version") == 1
        _later(mocker, 11)
        moved = await load_host_bundle(BASE)
        assert moved is not None
        assert moved.host_main == b"host v2"
        assert moved.host_sha256 != first.host_sha256

    async def test_a_pointer_that_cannot_be_read_keeps_the_last_version(
        self, channel: Channel, mocker: MockerFixture
    ) -> None:
        await load_host_bundle(BASE)
        channel.pointer = 503
        _later(mocker, 11)
        kept = await load_host_bundle(BASE)
        assert kept is not None
        assert kept.host_main == b"host v1"

    async def test_with_nothing_read_yet_a_bad_pointer_is_one_sentence(
        self, channel: Channel
    ) -> None:
        channel.pointer = "../../etc/passwd"
        with pytest.raises(BoxHostError, match="not a commit id"):
            await load_host_bundle(BASE)

    async def test_a_fixed_tar_file_is_read_once_as_before(
        self, channel: Channel
    ) -> None:
        bundle = await load_host_bundle(f"{BASE}/sand-host-bundle-aaaaaaa1.tgz")
        assert bundle is not None
        assert bundle.host_main == b"host v1"
        assert "sand-host-bundle-latest.version" not in channel.reads


@pytest.mark.asyncio
class TestSwapWhenIdle:
    async def test_a_busy_box_keeps_its_program_and_an_idle_one_moves(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        host: FakeBoxHost,  # noqa: F811
        health: dict[str, BoxHealth],  # noqa: F811
    ) -> None:
        access, box = await _awake_box(client, session, user)
        host.expected_host_sha256 = "new-version"
        health["now"] = BoxHealth(reachable=True, is_busy=True)
        assert (await _ensure(client, access)).status_code == 200
        assert len(host.created) == 1

        # Waiting on an approval card is still mid-turn.
        health["now"] = BoxHealth(
            reachable=True, is_busy=True, busy_only_awaiting_approval=True
        )
        assert (await _ensure(client, access)).status_code == 200
        assert len(host.created) == 1

        health["now"] = BoxHealth(reachable=True)
        assert (await _ensure(client, access)).status_code == 200
        assert len(host.created) == 2
        assert host.created[1].workspace_volume == host.created[0].workspace_volume
