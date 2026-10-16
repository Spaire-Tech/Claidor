"""Simeon's cloud computer on E2B (16 October 2026).

Each box is an E2B sandbox: a small virtual machine (Firecracker) made
from a template built from `box/` (`.github/workflows/e2b_template.yml`),
frozen whole when it sleeps (memory, open tabs and running programs go to
disk) and back in about a second when it wakes. It is the design the
upstream app's own cloud used (a microVM per computer, hibernated to a
snapshot), on E2B's service.

The `BoxHost` calls map onto E2B's as follows:

- `create`: a sandbox from the template, which boots with nothing of ours
  running. Through E2B's agent in the VM (envd) the server writes the
  person's settings (`BoxSpec.environment()`), fresh randomness, the
  machine id and the host bundle, then starts `start-simeon-vm`
  (`box/bin/`), which does what Docker did for the container and runs the
  same `start-simeon-box`. Nothing private is in the template: every VM
  made from one starts from the same memory.
- `stop`: pause, a snapshot of the whole VM. `start`: connect, which
  resumes it; the guest's clock is set before `start` returns, because the
  host trusts `Date.now()` for its one-hour access token.
- `run_state`: running, or paused ("stopped"), or gone (None).
- `remove`: kill, which drops the VM and its disk. There are no volumes:
  the person's files live on the VM's disk and, as on Docker, in the
  backup the host keeps (`box_store.py`), which a new box copies back.

E2B never ends a box on its own: each is made to pause, not die, when its
timeout passes, and the sleeper pushes the timeout out every minute while
the box is awake (`keep_alive`). The broker decides when a box sleeps.

The app never sees E2B: the API's proxy dials `https://<port>-<id>.<domain>`
with the box's traffic token (`e2b-traffic-access-token`); public traffic
to the box is refused without it.
"""

from __future__ import annotations

import asyncio
import random
import secrets
import time
from collections.abc import Mapping
from datetime import timedelta
from typing import Any

import structlog
from e2b import AsyncSandbox, SandboxQuery, SandboxState
from e2b.exceptions import (
    AuthenticationException,
    NotFoundException,
    RateLimitException,
    ServiceBusyException,
)

from simeon.config import settings

from . import box_store
from .box_hosts import (
    BOX_PORTS,
    HOST_COMPANIONS,
    BoxBlocked,
    BoxHostError,
    BoxHostUnavailable,
    BoxRunState,
    BoxSpec,
    HostBundle,
    ProvisionedBox,
)

log = structlog.get_logger()

KIND = "e2b"
#: The header E2B's proxy reads when public traffic to a sandbox is off.
TRAFFIC_HEADER = "e2b-traffic-access-token"
DEFAULT_DOMAIN = "e2b.app"

#: The box's name (`simeon-box-<hex>`), so a box can be found by it.
NAME_KEY = "simeon_box"

START_SCRIPT = "/usr/local/bin/start-simeon-vm"
ENV_FILE = "/run/simeon/box.env"
SEED_FILE = "/run/simeon/seed"
HOST_DIR = "/home/box/sand-host"
HOST_MAIN = f"{HOST_DIR}/host-main.cjs"
EXEC_DAEMON_MAIN = "/home/box/box-exec-daemon/main.cjs"

#: The folder on the VM's disk that becomes /tmp (`TMP_ON_DISK`).
DISK_TMP = "/var/lib/simeon/tmp"
#: /tmp on the VM's disk, as in a Docker container and on E2B's own images
#: (their envd unit: "/tmp is a plain rootfs dir, not a tmpfs"). In VMs made
#: from box2's image, /tmp was a tmpfs of half the memory (measured 16
#: October 2026: 2.0G on a 4 GB VM), so the engine's disk check
#: (`disk-pressure-guard.ts`: 2 GiB free or less is "hard") showed "Computer
#: is critically low on disk space" on every computer with 9.6G free on its
#: disk, and what the computer wrote there took memory and made each freeze
#: longer. A folder on the disk is bound over it before anything of ours
#: starts, with what the template left there copied in. Prints `tmp=moved`,
#: `tmp=disk` (already on the disk) or `tmp=kept` (the bind failed; the
#: computer works, with the tmpfs).
TMP_ON_DISK = (
    'if [ "$(stat -f -c %T /tmp)" != tmpfs ]; then echo tmp=disk; '
    f"elif mkdir -p {DISK_TMP} && chmod 1777 {DISK_TMP} && "
    f"{{ cp -a /tmp/. {DISK_TMP}/ 2>/dev/null; true; }} && "
    f"mount --bind {DISK_TMP} /tmp; then echo tmp=moved; "
    "else echo tmp=kept; fi"
)

#: How long a box stays awake if the sleeper stops pushing its timeout out
#: (the worker is down): then it pauses. An hour is also the most E2B's
#: free plan allows.
TIMEOUT_S = 3600

#: How long `start` retries E2B's "busy" (more than a few resumes at once
#: on one of its machines) before it answers with the blocked hold.
BUSY_RETRY_S = 10.0


def env_file(environment: list[str]) -> str:
    """`BoxSpec.environment()` as lines a shell can source."""
    lines = []
    for entry in environment:
        key, _, value = entry.partition("=")
        quoted = "'" + value.replace("'", "'\"'\"'") + "'"
        lines.append(f"export {key}={quoted}")
    return "\n".join(lines) + "\n"


def machine_id_of(name: str) -> str:
    """The box's id (`simeon-box-<hex>`) as its machine id, so one box
    keeps one id across new VMs; random for any other name."""
    tail = name.removeprefix("simeon-box-").lower()
    if len(tail) == 32 and all(c in "0123456789abcdef" for c in tail):
        return tail
    return secrets.token_hex(16)


def _capacity_hold() -> BoxBlocked:
    from .box_service import (
        CAPACITY_BLOCK_DETAIL,
        CAPACITY_BLOCK_REASON,
        CAPACITY_BLOCK_TITLE,
    )

    return BoxBlocked(
        CAPACITY_BLOCK_REASON,
        title=CAPACITY_BLOCK_TITLE,
        detail=CAPACITY_BLOCK_DETAIL,
        retry_after_s=15,
    )


def _host_error(action: str, error: BaseException) -> BoxHostError:
    if isinstance(error, AuthenticationException):
        return BoxHostUnavailable(
            "E2B refused the API key; check E2B_API_KEY on Render."
        )
    if isinstance(error, ServiceBusyException | RateLimitException):
        return _capacity_hold()
    reason = str(error).strip() or type(error).__name__
    return BoxHostError(f"Simeon's cloud computer on E2B could not {action}: {reason}")


class E2BBoxHost:
    """Boxes as E2B sandboxes. `sdk` is E2B's `AsyncSandbox`, or a stand-in
    with the same class methods in tests."""

    #: The box's files live on the VM's own disk: replacing a box needs its
    #: backup brought up to date first, even when it sleeps
    #: (`BoxBrokerService.ensure`).
    keeps_files = False

    def __init__(
        self,
        *,
        name: str = "e2b",
        template: str = "",
        bundle: HostBundle | None,
        max_running: int | None = None,
        accepting: bool = True,
        users: tuple[str, ...] = (),
        idle_after: timedelta | None = None,
        sdk: Any = AsyncSandbox,
        api_key: str | None = None,
        domain: str | None = None,
    ) -> None:
        self.name = name
        self.template = template or settings.E2B_TEMPLATE
        self.bundle = bundle
        self.max_running = (
            settings.BOX_MAX_RUNNING if max_running is None else max_running
        )
        self.accepting = accepting
        self.users = users
        self.idle_after = idle_after
        self.sdk = sdk
        self.api_key = api_key if api_key is not None else settings.E2B_API_KEY
        self.domain = domain if domain is not None else settings.E2B_DOMAIN

    # --- what the broker compares ------------------------------------------------

    @property
    def image_reference(self) -> str:
        """What a box here runs, compared with what `inspect` reads back, so
        a new template replaces boxes as a new image does on Docker."""
        return f"{KIND}:{self.template}"

    @property
    def expected_host_sha256(self) -> str | None:
        # The whole folder written into the VM, not host-main.cjs alone: a
        # new worker replaces the box as a new host program does.
        return self.bundle.folder_sha256 if self.bundle is not None else None

    def _api(self) -> dict[str, Any]:
        api: dict[str, Any] = {}
        if self.api_key:
            api["api_key"] = self.api_key
        if self.domain:
            api["domain"] = self.domain
        return api

    def _provisioned(
        self,
        sandbox_id: str,
        domain: str | None,
        metadata: Mapping[str, str],
        traffic_token: str | None = None,
    ) -> ProvisionedBox:
        meta = {"kind": KIND}
        if traffic_token:
            meta["traffic_token"] = traffic_token
        return ProvisionedBox(
            sandbox_id,
            domain or self.domain or DEFAULT_DOMAIN,
            {port: port for port in BOX_PORTS},
            metadata.get("image") or self.image_reference,
            None,
            metadata.get("host_sha256") or None,
            box_store=metadata.get("box_store") or None,
            host_meta=meta,
        )

    # --- BoxHost ---------------------------------------------------------------------

    async def create(self, spec: BoxSpec) -> ProvisionedBox:
        if self.bundle is None:
            raise BoxHostUnavailable(
                "Simeon's cloud computer on E2B needs the host bundle; set "
                "SIMEON_BOX_HOST_BUNDLE_URL."
            )
        metadata = {
            NAME_KEY: spec.name,
            "image": self.image_reference,
            "host_sha256": self.bundle.folder_sha256,
        }
        store = spec.labels.get(box_store.LABEL)
        if store:
            metadata["box_store"] = store
        try:
            sandbox = await self.sdk.create(
                template=self.template,
                timeout=TIMEOUT_S,
                metadata=metadata,
                allow_internet_access=True,
                network={"allow_public_traffic": False},
                lifecycle={"on_timeout": "pause", "auto_resume": False},
                **self._api(),
            )
        except Exception as error:
            raise _host_error("start a new computer", error) from error
        try:
            facts = await self._boot(sandbox, spec)
        except BoxHostError:
            await self._kill_quietly(sandbox.sandbox_id)
            raise
        except Exception as error:
            # Nothing half-made is left behind, as on Docker.
            await self._kill_quietly(sandbox.sandbox_id)
            raise _host_error("prepare the new computer", error) from error
        log.info(
            "sand.box.e2b.created",
            sandbox=sandbox.sandbox_id,
            name=spec.name,
            template=self.template,
            **facts,
        )
        return self._provisioned(
            sandbox.sandbox_id,
            getattr(sandbox, "sandbox_domain", None),
            metadata,
            sandbox.traffic_access_token,
        )

    async def _boot(self, sandbox: Any, spec: BoxSpec) -> dict[str, str]:
        """Writes the person's settings and the host, then starts the stack.
        Answers, for the log, where the host's workers come from ("image" or
        "bundle") and where /tmp is (`TMP_ON_DISK`)."""
        assert self.bundle is not None
        # box2's image (the template since 16 October 2026) holds the host's
        # folder already, as on Docker, where only host-main.cjs is mounted
        # over it; Simeon's own image holds nothing there, and the workers
        # come from the bundle (HOST_COMPANIONS).
        found = await sandbox.commands.run(
            f"mkdir -p {HOST_DIR} /home/box/box-exec-daemon /run/simeon && "
            f"if [ -f {HOST_DIR}/{HOST_COMPANIONS[0]} ]; then echo image; "
            "else echo bundle; fi",
            user="root",
            timeout=30,
        )
        workers = "image" if "image" in str(getattr(found, "stdout", "")) else "bundle"
        companions = self.bundle.companions if workers == "bundle" else {}
        if workers == "bundle":
            missing = self.bundle.missing_companions
            if missing:
                # Without its workers the host starts, then fails every
                # agent turn (16 October 2026). The computer is removed: a
                # move to E2B fails and the person keeps the one they have.
                log.warning("sand.box.e2b.bundle_incomplete", missing=missing)
                raise BoxHostUnavailable(
                    "This E2B template has no host workers and the published "
                    f"engine lacks {', '.join(missing)}. Build the template "
                    "from box2's image (box/e2b/build-and-check.sh), or publish "
                    "the engine again (desktop: npm run package, then npm run "
                    "publish:host-bundle)."
                )
            folders = sorted(
                {f"{HOST_DIR}/{name.rsplit('/', 1)[0]}" for name in companions}
            )
            await sandbox.commands.run(
                f"mkdir -p {' '.join(folders)}", user="root", timeout=30
            )
        await sandbox.files.write(ENV_FILE, env_file(spec.environment()), user="root")
        await sandbox.files.write(SEED_FILE, secrets.token_bytes(64), user="root")
        await sandbox.files.write(
            "/etc/machine-id", machine_id_of(spec.name) + "\n", user="root"
        )
        # What Docker mounts: host-main.cjs over the image's own, and the
        # exec daemon's folder.
        await sandbox.files.write(HOST_MAIN, self.bundle.host_main, user="root")
        for companion, data in sorted(companions.items()):
            await sandbox.files.write(f"{HOST_DIR}/{companion}", data, user="root")
        await sandbox.files.write(
            EXEC_DAEMON_MAIN, self.bundle.box_exec_daemon, user="root"
        )
        moved = await sandbox.commands.run(TMP_ON_DISK, user="root", timeout=30)
        tmp = str(getattr(moved, "stdout", "")).strip().removeprefix("tmp=")
        if tmp == "kept":
            log.warning("sand.box.e2b.tmp_in_memory", sandbox=sandbox.sandbox_id)
        # The clock first, then the stack, detached from this command so it
        # outlives it.
        await sandbox.commands.run(
            f"date -u -s @{int(time.time())} >/dev/null 2>&1; "
            f"setsid -f {START_SCRIPT} </dev/null >/dev/null 2>&1",
            user="root",
            timeout=30,
        )
        return {"workers": workers, "tmp": tmp or "unknown"}

    async def inspect(self, provider_box_id: str) -> ProvisionedBox | None:
        try:
            info = await self.sdk.get_info(provider_box_id, **self._api())
        except NotFoundException:
            return None
        except Exception as error:
            raise _host_error("read the computer", error) from error
        return self._provisioned(
            info.sandbox_id, info.sandbox_domain, dict(info.metadata or {})
        )

    async def run_state(self, provider_box_id: str) -> BoxRunState | None:
        try:
            info = await self.sdk.get_info(provider_box_id, **self._api())
        except NotFoundException:
            return None
        except Exception as error:
            raise _host_error("read the computer", error) from error
        return "running" if info.state == SandboxState.RUNNING else "stopped"

    async def start(self, provider_box_id: str) -> None:
        deadline = time.monotonic() + BUSY_RETRY_S
        while True:
            try:
                sandbox = await self.sdk.connect(
                    provider_box_id, timeout=TIMEOUT_S, **self._api()
                )
                break
            except ServiceBusyException as error:
                # Several resumes at once on one of E2B's machines: nothing
                # changed, so the same call is tried again shortly.
                if time.monotonic() >= deadline:
                    raise _host_error("wake the computer", error) from error
                await asyncio.sleep(0.5 + random.random())
            except Exception as error:
                raise _host_error("wake the computer", error) from error
        try:
            await sandbox.commands.run(
                f"date -u -s @{int(time.time())} >/dev/null 2>&1",
                user="root",
                timeout=10,
            )
        except Exception as error:
            # E2B sets the clock on resume as well; this is the belt.
            log.warning(
                "sand.box.e2b.clock_not_set", sandbox=provider_box_id, error=str(error)
            )

    async def stop(self, provider_box_id: str) -> None:
        try:
            await self.sdk.pause(provider_box_id, **self._api())
        except NotFoundException:
            return
        except Exception as error:
            raise _host_error("put the computer to sleep", error) from error

    async def remove(self, provider_box_id: str, *, volumes: list[str]) -> None:
        """Kill the sandbox. A box name (`simeon-box-<hex>`, the cleanup of
        a box that did not come up) is looked up by its metadata. There are
        no volumes to remove."""
        ids = [provider_box_id]
        if provider_box_id.startswith("simeon-box-"):
            ids = await self._ids_named(provider_box_id)
        for sandbox_id in ids:
            await self._kill(sandbox_id)

    # --- the sleeper --------------------------------------------------------------

    async def keep_alive(self, provider_box_id: str) -> None:
        """The box stays awake another `TIMEOUT_S`; called every minute by
        the sleeper while the box is awake."""
        try:
            await self.sdk.set_timeout(provider_box_id, TIMEOUT_S, **self._api())
        except NotFoundException:
            return
        except Exception as error:
            raise _host_error("keep the computer awake", error) from error

    # --- helpers --------------------------------------------------------------------

    async def _ids_named(self, name: str) -> list[str]:
        try:
            paginator = self.sdk.list(
                query=SandboxQuery(
                    metadata={NAME_KEY: name},
                    state=[SandboxState.RUNNING, SandboxState.PAUSED],
                ),
                **self._api(),
            )
            ids: list[str] = []
            while paginator.has_next:
                ids.extend(info.sandbox_id for info in await paginator.next_items())
            return ids
        except Exception as error:
            raise _host_error("find the computer", error) from error

    async def _kill(self, sandbox_id: str) -> None:
        try:
            await self.sdk.kill(sandbox_id, **self._api())
        except NotFoundException:
            return
        except Exception as error:
            raise _host_error("remove the computer", error) from error

    async def _kill_quietly(self, sandbox_id: str) -> None:
        try:
            await self._kill(sandbox_id)
        except BoxHostError as error:
            log.warning(
                "sand.box.e2b.cleanup_failed", sandbox=sandbox_id, error=str(error)
            )


__all__ = ["KIND", "TRAFFIC_HEADER", "E2BBoxHost", "env_file", "machine_id_of"]
