"""The person's computer, brokered (`polar/desktop/boxes.py`).

**Every test here replaces E2B.** This environment holds no E2B key, so
nothing below has contacted a real sandbox and none of it should be read
as proof that the E2B calls are right. What it does prove is the part
that is ours and that the Box agent's plugin depends on: the routes
exist at the paths its client calls, they answer in the shapes its
client parses, a box of one account is invisible to another, `ensure`
ensures rather than creates, awake time is charged, and the NDJSON
stream obeys its four rules.

The fake stands in for `e2b.AsyncSandbox`. It is deliberately small:
anything it does that the real SDK does not is a test that passes for
the wrong reason, so it implements only the handful of calls
`BoxService` makes.
"""

import asyncio
import base64
import json
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.desktop import boxes as boxes_module
from polar.desktop.boxes import BoxService, box_service
from polar.desktop.pricing import BOX_MODEL_ID, credits_for_box
from polar.models import DesktopBox, DesktopUsage, User
from polar.postgres import AsyncSession

from .test_endpoints import _signed_in


class FakeCommandResult:
    def __init__(self, stdout: str = "", stderr: str = "", exit_code: int = 0) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code
        self.error = None


class FakeHandle:
    """A background command. Feeds its chunks through the SDK's callbacks
    the way the real handle does, then finishes."""

    def __init__(
        self,
        chunks: list[tuple[str, str]],
        exit_code: int,
        on_stdout: Any,
        on_stderr: Any,
    ) -> None:
        self._chunks = chunks
        self._exit_code = exit_code
        self._on_stdout = on_stdout
        self._on_stderr = on_stderr
        self.killed = False

    async def wait(self) -> FakeCommandResult:
        for stream, text in self._chunks:
            if stream == "stdout" and self._on_stdout:
                self._on_stdout(text)
            elif stream == "stderr" and self._on_stderr:
                self._on_stderr(text)
            await asyncio.sleep(0)
        return FakeCommandResult(exit_code=self._exit_code)

    async def kill(self) -> bool:
        self.killed = True
        return True


class FakeCommands:
    def __init__(self, sandbox: "FakeSandbox") -> None:
        self._sandbox = sandbox

    async def run(
        self,
        cmd: str,
        background: bool | None = None,
        envs: dict[str, str] | None = None,
        cwd: str | None = None,
        on_stdout: Any = None,
        on_stderr: Any = None,
        timeout: float | None = None,
        **_: Any,
    ) -> Any:
        self._sandbox.commands_run.append(
            {"cmd": cmd, "cwd": cwd, "envs": envs, "background": background}
        )
        if self._sandbox.run_raises is not None:
            raise self._sandbox.run_raises
        if background:
            handle = FakeHandle(
                self._sandbox.stream_chunks,
                self._sandbox.exit_code,
                on_stdout,
                on_stderr,
            )
            self._sandbox.last_handle = handle
            return handle
        return FakeCommandResult(
            stdout=self._sandbox.stdout,
            stderr=self._sandbox.stderr,
            exit_code=self._sandbox.exit_code,
        )


class FakeFiles:
    def __init__(self, sandbox: "FakeSandbox") -> None:
        self._sandbox = sandbox

    async def write(self, path: str, content: bytes) -> None:
        self._sandbox.written[path] = content

    async def read(self, path: str, format: str = "bytes") -> bytes:
        return self._sandbox.files_on_disk.get(path, b"")


class FakeSandbox:
    """Stands in for `e2b.AsyncSandbox`. Only what `BoxService` calls."""

    #: The whole fleet of fakes, keyed by sandbox id, so a test can look
    #: at the one a route created.
    registry: dict[str, "FakeSandbox"] = {}
    created: list[dict[str, Any]] = []
    killed: list[str] = []
    next_id: int = 0
    connect_raises: Exception | None = None
    create_raises: Exception | None = None

    def __init__(self, sandbox_id: str) -> None:
        self.sandbox_id = sandbox_id
        self.commands = FakeCommands(self)
        self.files = FakeFiles(self)
        self.timeouts: list[int] = []
        self.commands_run: list[dict[str, Any]] = []
        self.written: dict[str, bytes] = {}
        self.files_on_disk: dict[str, bytes] = {}
        self.stdout = ""
        self.stderr = ""
        self.exit_code = 0
        self.stream_chunks: list[tuple[str, str]] = []
        self.run_raises: Exception | None = None
        self.last_handle: FakeHandle | None = None
        self.snapshots = 0

    @classmethod
    def reset(cls) -> None:
        cls.registry = {}
        cls.created = []
        cls.killed = []
        cls.next_id = 0
        cls.connect_raises = None
        cls.create_raises = None

    @classmethod
    async def create(cls, template: str | None = None, **kwargs: Any) -> "FakeSandbox":
        if cls.create_raises is not None:
            raise cls.create_raises
        cls.next_id += 1
        sandbox_id = f"sbx-{cls.next_id}"
        cls.created.append({"template": template, "id": sandbox_id, **kwargs})
        made = cls(sandbox_id)
        cls.registry[sandbox_id] = made
        return made

    @classmethod
    async def connect(cls, sandbox_id: str, **kwargs: Any) -> "FakeSandbox":
        if cls.connect_raises is not None:
            raise cls.connect_raises
        found = cls.registry.get(sandbox_id)
        if found is None:
            from e2b.exceptions import NotFoundException

            raise NotFoundException(f"sandbox {sandbox_id} not found")
        return found

    @classmethod
    async def kill(cls, sandbox_id: str, **kwargs: Any) -> bool:
        cls.killed.append(sandbox_id)
        cls.registry.pop(sandbox_id, None)
        return True

    async def set_timeout(self, timeout: int, **kwargs: Any) -> None:
        self.timeouts.append(timeout)

    async def create_snapshot(self, **kwargs: Any) -> Any:
        self.snapshots += 1

        class Snapshot:
            snapshot_id = f"snap-{self.sandbox_id}"

        return Snapshot()


@pytest.fixture(autouse=True)
def fake_e2b(mocker: MockerFixture) -> type[FakeSandbox]:
    """Point every `from e2b import AsyncSandbox` at the fake.

    `BoxService` imports the SDK inside its methods so a provider SDK
    cannot stop the server booting, which means the patch has to be on
    the module the import resolves to.
    """
    FakeSandbox.reset()
    mocker.patch.object(settings, "E2B_API_KEY", "e2b-test-key")
    mocker.patch("e2b.AsyncSandbox", FakeSandbox)
    return FakeSandbox


async def _ensure(client: httpx.AsyncClient, access: str, **body: Any) -> Any:
    return await client.post(
        "/desktop/api/proxy/box/sandboxes",
        headers={"Authorization": f"Bearer {access}"},
        json={"scopeKey": "shared", **body},
    )


@pytest.mark.asyncio
class TestTheRoutesAreWhereThePluginLooks:
    """The paths matter as much as the behaviour.

    The app reaches this server through its local token proxy, which
    prefixes `/api/proxy` — so these live at `/api/proxy/box/…`, and the
    `/api/proxy/{path:path}` catch-all further down this router would
    swallow every one of them if they were declared after it. FastAPI
    takes the first route that matches. That mistake answers 404 to a
    plugin that is asking correctly, so it gets its own test.
    """

    async def test_ensure_is_not_eaten_by_the_proxy_catch_all(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await _ensure(client, access)
        assert response.status_code == 200, response.text
        # The catch-all answers this exact shape; if we ever see it here,
        # the box routes have been moved below it.
        assert "is not proxied" not in response.text

    async def test_every_box_path_is_served(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        box_id = (await _ensure(client, access)).json()["boxId"]

        checks = [
            ("GET", f"/desktop/api/proxy/box/sandboxes/{box_id}", None),
            ("GET", "/desktop/api/proxy/box/machines", None),
            (
                "POST",
                f"/desktop/api/proxy/box/sandboxes/{box_id}/shell",
                {"script": "echo hi", "args": []},
            ),
            (
                "PUT",
                f"/desktop/api/proxy/box/sandboxes/{box_id}/file",
                {"path": "/tmp/a", "contentBase64": "aGk="},
            ),
            ("POST", f"/desktop/api/proxy/box/sandboxes/{box_id}/update", None),
        ]
        for method, path, body in checks:
            response = await client.request(method, path, headers=headers, json=body)
            assert response.status_code < 400, f"{method} {path} -> {response.text}"

    async def test_they_all_need_a_session(self, client: httpx.AsyncClient) -> None:
        assert (
            await client.post(
                "/desktop/api/proxy/box/sandboxes", json={"scopeKey": "shared"}
            )
        ).status_code == 401
        assert (await client.get("/desktop/api/proxy/box/machines")).status_code == 401


@pytest.mark.asyncio
class TestEnsureIsEnsureAndNotCreate:
    async def test_the_same_scope_gets_the_same_box(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # Each accidental extra box is a second bill, and E2B charges by
        # the second whether or not anybody is using it.
        access, _ = await _signed_in(client, session, user)
        first = (await _ensure(client, access)).json()
        second = (await _ensure(client, access)).json()
        assert first["boxId"] == second["boxId"]
        assert len(fake_e2b.created) == 1

    async def test_a_different_scope_gets_a_different_box(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        shared = (await _ensure(client, access, scopeKey="shared")).json()
        lonely = (await _ensure(client, access, scopeKey="agent:7")).json()
        assert shared["boxId"] != lonely["boxId"]
        assert len(fake_e2b.created) == 2

    async def test_it_answers_the_shape_the_client_parses(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        # `brokerClient.ts` reads exactly these off the body.
        access, _ = await _signed_in(client, session, user)
        body = (await _ensure(client, access)).json()
        assert isinstance(body["boxId"], str)
        assert body["boxId"]
        assert body["running"] is True
        assert body["template"]
        assert isinstance(body["createdAtMs"], int)

    async def test_the_workspace_it_names_is_absolute(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        # The plugin ignores a non-absolute answer rather than guessing,
        # so a relative one would be the same as silence while looking
        # like an answer.
        access, _ = await _signed_in(client, session, user)
        body = (await _ensure(client, access)).json()
        assert body["workspaceDir"].startswith("/")
        assert body["agentWorkspaceDir"].startswith("/")

    async def test_a_relative_workspace_is_left_out_rather_than_sent(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "E2B_WORKSPACE_DIR", "workspace")
        access, _ = await _signed_in(client, session, user)
        body = (await _ensure(client, access)).json()
        assert "workspaceDir" not in body

    async def test_no_key_reads_as_not_switched_on(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "E2B_API_KEY", "")
        access, _ = await _signed_in(client, session, user)
        response = await _ensure(client, access)
        assert response.status_code == 503
        assert "not switched on" in response.json()["error"]

    async def test_an_exhausted_allowance_will_not_start_a_box(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: Any,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-5.6-terra",
                credits=settings.DESKTOP_MONTHLY_CREDITS,
                upstream_status=200,
            )
        )
        response = await _ensure(client, access)
        assert response.status_code == 402
        assert fake_e2b.created == []


@pytest.mark.asyncio
class TestOneAccountsBoxIsInvisibleToAnother:
    async def test_another_account_cannot_name_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        # The whole security property of this surface, and the reason the
        # repository has no method that fetches a box without an owner.
        mine, _ = await _signed_in(client, session, user)
        theirs, _ = await _signed_in(client, session, user_second)
        box_id = (await _ensure(client, mine)).json()["boxId"]

        for method, path in [
            ("GET", f"/desktop/api/proxy/box/sandboxes/{box_id}"),
            ("POST", f"/desktop/api/proxy/box/sandboxes/{box_id}/update"),
            ("POST", f"/desktop/api/proxy/box/sandboxes/{box_id}/reset"),
            ("DELETE", f"/desktop/api/proxy/box/sandboxes/{box_id}"),
        ]:
            response = await client.request(
                method, path, headers={"Authorization": f"Bearer {theirs}"}
            )
            assert response.status_code == 404, f"{method} {path}"

    async def test_another_account_cannot_run_a_command_in_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        mine, _ = await _signed_in(client, session, user)
        theirs, _ = await _signed_in(client, session, user_second)
        box_id = (await _ensure(client, mine)).json()["boxId"]

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/shell",
            headers={"Authorization": f"Bearer {theirs}"},
            json={"script": "cat /etc/passwd", "args": []},
        )
        assert response.status_code == 404
        # And nothing ran anywhere.
        assert all(not s.commands_run for s in fake_e2b.registry.values())

    async def test_a_nonsense_box_id_is_a_plain_not_found(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.get(
            "/desktop/api/proxy/box/sandboxes/not-a-uuid",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 404


@pytest.mark.asyncio
class TestTheBoxIsKeptAliveAndReallyKilled:
    async def test_every_touch_pushes_the_ttl_out(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # The plugin cannot do this; it does not know the TTL. Without it
        # a person loses their session because the agent was thinking.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        await client.get(
            f"/desktop/api/proxy/box/sandboxes/{box_id}",
            headers={"Authorization": f"Bearer {access}"},
        )
        sandbox = fake_e2b.registry["sbx-1"]
        assert sandbox.timeouts
        assert all(t == settings.E2B_SANDBOX_TTL_SECONDS for t in sandbox.timeouts)

    async def test_delete_really_kills_the_machine(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # E2B bills by the second, so a delete that only forgets the row
        # leaves a machine running that nobody can now reach to stop.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        response = await client.delete(
            f"/desktop/api/proxy/box/sandboxes/{box_id}",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 204
        assert fake_e2b.killed == ["sbx-1"]

    async def test_deleting_twice_is_not_an_error_for_the_client(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        # `removeBox` passes `allowNotFound`, so a 404 is "already gone".
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        headers = {"Authorization": f"Bearer {access}"}
        first = await client.delete(
            f"/desktop/api/proxy/box/sandboxes/{box_id}", headers=headers
        )
        second = await client.delete(
            f"/desktop/api/proxy/box/sandboxes/{box_id}", headers=headers
        )
        assert first.status_code == 204
        assert second.status_code == 404

    async def test_a_box_e2b_has_lost_is_replaced_rather_than_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # E2B reaps sandboxes. The person should get a computer, not an
        # error they can do nothing about.
        access, _ = await _signed_in(client, session, user)
        first = (await _ensure(client, access)).json()
        fake_e2b.registry.pop("sbx-1")

        second = (await _ensure(client, access)).json()
        assert second["running"] is True
        assert len(fake_e2b.created) == 2
        # Same row, so it is still one box for the scope.
        assert second["boxId"] == first["boxId"]


@pytest.mark.asyncio
class TestAwakeSecondsAreCharged:
    async def test_time_awake_is_settled_against_the_same_account(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        # The box is the first thing this product sells that costs money
        # while nobody is using it, so the meter has to run without
        # anybody asking for anything.
        from datetime import timedelta

        from polar.kit.utils import utc_now

        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]

        box = (
            await session.execute(
                DesktopBox.__table__.select().where(
                    DesktopBox.__table__.c.id == __import__("uuid").UUID(box_id)
                )
            )
        ).one()
        assert box.running_since is not None

        # Wind the meter back an hour and touch it.
        await session.execute(
            DesktopBox.__table__.update()
            .where(DesktopBox.__table__.c.id == __import__("uuid").UUID(box_id))
            .values(billed_through=utc_now() - timedelta(hours=1))
        )
        await session.flush()

        await client.get(
            f"/desktop/api/proxy/box/sandboxes/{box_id}",
            headers={"Authorization": f"Bearer {access}"},
        )

        rows = (
            await session.execute(
                DesktopUsage.__table__.select().where(
                    DesktopUsage.__table__.c.model == BOX_MODEL_ID
                )
            )
        ).all()
        assert len(rows) == 1
        assert rows[0].user_id == user.id
        assert rows[0].credits > 0
        # An hour of box, priced by the shape it was built with.
        expected = credits_for_box(
            rows[0].input_tokens,
            vcpu=settings.E2B_SANDBOX_VCPU,
            memory_gib=settings.E2B_SANDBOX_MEMORY_GIB,
        )
        assert rows[0].credits == expected
        assert 3500 <= rows[0].input_tokens <= 3700

    async def test_a_box_that_was_never_awake_costs_nothing(
        self,
        session: AsyncSession,
        user: User,
    ) -> None:
        service = BoxService()
        box = DesktopBox(user_id=user.id, scope_key="shared", template_id="base")
        session.add(box)
        await session.flush()
        assert await service._settle(session, box) == 0


@pytest.mark.asyncio
class TestShell:
    async def test_a_script_runs_and_comes_back_base64(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        sandbox = fake_e2b.registry["sbx-1"]
        sandbox.stdout = "hello\n"
        sandbox.stderr = ""

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/shell",
            headers={"Authorization": f"Bearer {access}"},
            json={"script": "echo", "args": ["hello"]},
        )
        body = response.json()
        assert base64.b64decode(body["stdoutBase64"]) == b"hello\n"
        assert body["exitCode"] == 0

    async def test_arguments_are_quoted_before_they_reach_a_shell(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # The arguments come from the agent and go into a shell on
        # somebody's computer. An unquoted one is a command.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/shell",
            headers={"Authorization": f"Bearer {access}"},
            json={"script": "cat", "args": ["; rm -rf /"]},
        )
        ran = fake_e2b.registry["sbx-1"].commands_run[0]["cmd"]
        assert "; rm -rf /" not in ran.replace("'; rm -rf /'", "")
        assert ran.startswith("cat ")

    async def test_a_non_zero_exit_is_an_answer_and_not_an_http_error(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # The filesystem bridge builds every file operation out of this
        # and decides for itself whether a failure matters.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        fake_e2b.registry["sbx-1"].exit_code = 3

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/shell",
            headers={"Authorization": f"Bearer {access}"},
            json={"script": "false", "args": []},
        )
        assert response.status_code == 200
        assert response.json()["exitCode"] == 3

    async def test_stdin_that_is_not_base64_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/shell",
            headers={"Authorization": f"Bearer {access}"},
            json={"script": "cat", "args": [], "stdinBase64": "not base64!!"},
        )
        assert response.status_code == 400


@pytest.mark.asyncio
class TestFiles:
    async def test_a_file_goes_in_and_comes_back(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        headers = {"Authorization": f"Bearer {access}"}

        put = await client.put(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/file",
            headers=headers,
            json={
                "path": "/home/user/a.txt",
                "contentBase64": base64.b64encode(b"hello box").decode(),
            },
        )
        assert put.status_code == 200
        assert fake_e2b.registry["sbx-1"].written["/home/user/a.txt"] == b"hello box"

        fake_e2b.registry["sbx-1"].files_on_disk["/home/user/a.txt"] = b"hello back"
        got = await client.get(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/file",
            headers=headers,
            params={"path": "/home/user/a.txt"},
        )
        assert base64.b64decode(got.json()["contentBase64"]) == b"hello back"

    async def test_content_that_is_not_base64_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        response = await client.put(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/file",
            headers={"Authorization": f"Bearer {access}"},
            json={"path": "/tmp/a", "contentBase64": "%%%"},
        )
        assert response.status_code == 400


def _frames(text: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in text.splitlines() if line.strip()]


@pytest.mark.asyncio
class TestExecObeysItsFourRules:
    """The one with sharp edges. Each rule is one test."""

    async def test_it_streams_stdout_and_stderr_and_then_exits(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        sandbox = fake_e2b.registry["sbx-1"]
        sandbox.stream_chunks = [
            ("stdout", "one"),
            ("stderr", "two"),
            ("stdout", "three"),
        ]
        sandbox.exit_code = 0

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/exec",
            headers={"Authorization": f"Bearer {access}"},
            json={"command": "make", "env": {}, "pty": False},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/x-ndjson")

        frames = _frames(response.text)
        assert [f["t"] for f in frames] == ["stdout", "stderr", "stdout", "exit"]
        assert base64.b64decode(frames[0]["d"]) == b"one"
        assert base64.b64decode(frames[1]["d"]) == b"two"
        assert frames[-1]["code"] == 0

    async def test_an_exit_frame_always_arrives_even_on_a_failure(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # Rule 2. A stream that ends without one is treated as a failure
        # on purpose, so saying nothing is worse than saying it failed.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        fake_e2b.registry["sbx-1"].run_raises = RuntimeError("no such command")

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/exec",
            headers={"Authorization": f"Bearer {access}"},
            json={"command": "nope", "env": {}, "pty": False},
        )
        frames = _frames(response.text)
        assert frames[0]["t"] == "error"
        assert "no such command" in frames[0]["message"]
        assert frames[-1]["t"] == "exit"
        assert frames[-1]["code"] == 1

    async def test_a_failing_command_reports_its_real_exit_code(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        fake_e2b.registry["sbx-1"].exit_code = 42

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/exec",
            headers={"Authorization": f"Bearer {access}"},
            json={"command": "false", "env": {}, "pty": False},
        )
        frames = _frames(response.text)
        assert frames[-1] == {"t": "exit", "code": 42}

    async def test_a_pty_is_refused_and_not_pretended_at(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # Rule 4. The account proxy cannot carry a two-way connection, so
        # an interactive terminal is impossible on this road. Saying so
        # beats hanging on stdin that never closes.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/exec",
            headers={"Authorization": f"Bearer {access}"},
            json={"command": "bash", "env": {}, "pty": True},
        )
        frames = _frames(response.text)
        assert frames[0]["t"] == "error"
        assert "terminal" in frames[0]["message"].lower()
        assert not fake_e2b.registry["sbx-1"].commands_run

    async def test_the_workdir_and_env_reach_the_command(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/exec",
            headers={"Authorization": f"Bearer {access}"},
            json={
                "command": "pwd",
                "workdir": "/srv/thing",
                "env": {"TERM": "dumb"},
                "pty": False,
            },
        )
        ran = fake_e2b.registry["sbx-1"].commands_run[0]
        assert ran["cwd"] == "/srv/thing"
        assert ran["envs"] == {"TERM": "dumb"}
        assert ran["background"] is True

    async def test_a_box_that_is_not_yours_fails_as_a_frame_not_a_status(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        # By the time a command is streaming the status line is gone, so
        # a failure has to arrive in the body — and still end in `exit`.
        mine, _ = await _signed_in(client, session, user)
        theirs, _ = await _signed_in(client, session, user_second)
        box_id = (await _ensure(client, mine)).json()["boxId"]

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/exec",
            headers={"Authorization": f"Bearer {theirs}"},
            json={"command": "whoami", "env": {}, "pty": False},
        )
        frames = _frames(response.text)
        assert frames[0]["t"] == "error"
        assert frames[-1]["t"] == "exit"


@pytest.mark.asyncio
class TestMachines:
    async def test_it_lists_this_account_s_boxes_and_no_one_else_s(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        mine, _ = await _signed_in(client, session, user)
        theirs, _ = await _signed_in(client, session, user_second)
        await _ensure(client, mine)
        await _ensure(client, theirs)

        body = (
            await client.get(
                "/desktop/api/proxy/box/machines",
                headers={"Authorization": f"Bearer {mine}"},
            )
        ).json()
        assert len(body["machines"]) == 1
        machine = body["machines"][0]
        assert machine["kind"] == "box"
        assert machine["state"] == "running"
        assert machine["label"]

    async def test_no_box_is_an_empty_list_and_not_a_failure(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        body = (
            await client.get(
                "/desktop/api/proxy/box/machines",
                headers={"Authorization": f"Bearer {access}"},
            )
        ).json()
        assert body == {"machines": []}


@pytest.mark.asyncio
class TestUpdateAndReset:
    async def test_update_snapshots_then_builds_from_the_snapshot(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/update",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200
        assert response.json()["boxId"] == box_id
        assert fake_e2b.killed == ["sbx-1"]
        # The new machine came from the snapshot, which is what keeps the
        # person's files and logins.
        assert fake_e2b.created[-1]["template"] == "snap-sbx-1"

    async def test_reset_with_no_snapshot_builds_a_clean_machine(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # This loses the person's files. The server cannot ask, so the
        # app must have asked — but it must at least be the behaviour the
        # name promises.
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]

        response = await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/reset",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200
        assert fake_e2b.created[-1]["template"] == settings.E2B_TEMPLATE_ID

    async def test_reset_after_an_update_goes_back_to_that_snapshot(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        box_id = (await _ensure(client, access)).json()["boxId"]
        await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/update", headers=headers
        )
        await client.post(
            f"/desktop/api/proxy/box/sandboxes/{box_id}/reset", headers=headers
        )
        assert fake_e2b.created[-1]["template"] == "snap-sbx-1"


@pytest.mark.asyncio
class TestNothingLeaksOutward:
    async def test_no_answer_carries_the_key_or_a_sandbox_id(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        # The two things that must never leave this server: the key would
        # bill every box we run, and a sandbox id names a machine to
        # whoever holds it.
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        created = await _ensure(client, access)
        box_id = created.json()["boxId"]
        described = await client.get(
            f"/desktop/api/proxy/box/sandboxes/{box_id}", headers=headers
        )
        machines = await client.get("/desktop/api/proxy/box/machines", headers=headers)

        for response in (created, described, machines):
            assert "e2b-test-key" not in response.text
            assert "sbx-" not in response.text

    async def test_the_handle_is_not_the_sandbox_id(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box_id = (await _ensure(client, access)).json()["boxId"]
        assert box_id != "sbx-1"
        assert box_id not in fake_e2b.registry


@pytest.mark.asyncio
class TestServiceInternals:
    async def test_the_settlement_is_capped_against_a_broken_clock(
        self,
        session: AsyncSession,
        user: User,
    ) -> None:
        # The only price in this server multiplied by wall-clock time
        # rather than by something a provider reported. A restored
        # backup or a clock jump must not bill a decade of computer.
        from datetime import timedelta

        from polar.desktop.pricing import BOX_MAX_SECONDS_PER_SETTLEMENT
        from polar.kit.utils import utc_now
        from polar.models import DesktopBoxState

        service = BoxService()
        box = DesktopBox(
            user_id=user.id,
            scope_key="shared",
            template_id="base",
            state=DesktopBoxState.running.value,
            running_since=utc_now() - timedelta(days=3650),
            billed_through=utc_now() - timedelta(days=3650),
        )
        session.add(box)
        await session.flush()

        charged = await service._settle(session, box)
        assert charged == BOX_MAX_SECONDS_PER_SETTLEMENT

    async def test_configured_follows_the_key(self, mocker: MockerFixture) -> None:
        mocker.patch.object(settings, "E2B_API_KEY", "")
        assert boxes_module.configured() is False
        mocker.patch.object(settings, "E2B_API_KEY", "k")
        assert boxes_module.configured() is True

    async def test_the_service_is_a_singleton_like_the_others(self) -> None:
        assert isinstance(box_service, BoxService)


@pytest.mark.asyncio
class TestDeleteThenStartAgain:
    async def test_a_person_can_get_a_new_computer_after_deleting_one(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake_e2b: type[FakeSandbox],
    ) -> None:
        # The obvious thing somebody does after a Reset that went wrong,
        # and the case where soft deletion and a uniqueness constraint
        # meet: the deleted row still holds (user_id, scope_key), so a
        # plain unique index would refuse the second box.
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        first = (await _ensure(client, access)).json()["boxId"]
        assert (
            await client.delete(
                f"/desktop/api/proxy/box/sandboxes/{first}", headers=headers
            )
        ).status_code == 204

        response = await _ensure(client, access)
        assert response.status_code == 200, response.text
        second = response.json()["boxId"]
        assert second != first
        assert len(fake_e2b.created) == 2
