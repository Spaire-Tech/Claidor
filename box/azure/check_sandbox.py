"""Measure a computer made from Simeon's Azure disk image (12 November 2026).

Run by box/azure/build.sh after a build, or alone:

    bash box/azure/build.sh --check-only <disk image name>

It makes one test computer the way the server does
(server/simeon/sand/box_azure.py), with no person's settings and no engine
of ours (on box2's image the image's own copy of the engine starts, without
a sign-in), signed in as whoever runs it (`az login`). It prints, as JSON,
what docs/ops/box-host/azure-plan.md lists as unknown until measured:

- how long the computer takes to be made, and whether the image's first
  process (`simeon-vm-init`) is waiting in it;
- commands as root, a file written with mode 600 reading back 600, disk,
  memory, the empty machine id, the engine's libraries and the host's workers;
- whether a 200-second command still answers (the longest is unknown);
- how long the desktop takes to come up once the ready mark is written;
- the port lock: no token 401; the runner's token, the screen; a port locked
  to another identity 403;
- a WebSocket through the screen's port: the desktop's first words, and the
  connection still open after a minute;
- freezing and waking, three times: how long each takes, the clock after a
  wake, and the desktop and a process started before still there;
- what a port answers while the computer sleeps and once it is removed (the
  server's "gone" check);
- with auto-suspend off, whether the computer is still awake after ten
  minutes with nothing to do (`--idle-minutes`, 0 to skip).

The test computer is removed at the end, whatever happened. No token is
printed.
"""

from __future__ import annotations

import json
import secrets
import ssl
import sys
import time
import uuid
from typing import Any

import certifi
import httpx
from data_plane import PORT_SCOPE, AzError, Group, az, said, token
from websockets.sync.client import connect

PORTS = (1340, 6080, 6081, 8790)
#: Locked to another identity than the runner's: the runner gets 403.
OTHERS_PORT = 6081
RESOURCES = {"cpu": "2000m", "memory": "4096Mi", "disk": "40Gi"}
VM_INIT = "/usr/local/bin/simeon-vm-init"
STATE_DIR = "/var/lib/simeon"
ROUNDS = 3
ASLEEP_FOR_S = 20
LONG_COMMAND_S = 200
WEBSOCKET_HOLD_S = 60
MODE_PRIVATE = 0o600
MODE_FILE = 0o644
ASLEEP = {"stopped", "idle", "suspended"}
GONE = {"deleting", "failed"}

#: The engine's libraries and the host's workers, as box/e2b/check_template.py
#: looks for them.
ENGINE_LIBRARIES = (
    "cd /home/box/sand-host 2>/dev/null || cd /; "
    "N=$(command -v node || echo /exec-daemon/node); "
    'NODE_PATH=/home/box/deps "$N" -e \''
    'try { require("piscina"); console.log("found"); } '
    'catch (e) { console.log(String(e.message).split("\\n")[0]); }'
    "'"
)
HOST_WORKERS = (
    "if [ -f /home/box/sand-host/agent-isolation/agent-store-worker.cjs ]; "
    "then echo 'in the image'; else echo 'written by the server'; fi"
)


def note(words: str) -> None:
    print(f"... {words}", file=sys.stderr, flush=True)


class Box:
    def __init__(self, group: Group, sandbox_id: str) -> None:
        self.group = group
        self.id = sandbox_id

    def state(self) -> str | None:
        response = self.group.call("GET", f"/sandboxes/{self.id}")
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise RuntimeError(f"read the computer: {said(response)}")
        return str(response.json().get("state") or "").lower()

    def settle(self, until: set[str], deadline_s: float) -> tuple[str | None, float]:
        started = time.monotonic()
        while True:
            state = self.state()
            if state is None or state in until or state in GONE:
                return state, round(time.monotonic() - started, 2)
            if time.monotonic() - started > deadline_s:
                return state, round(time.monotonic() - started, 2)
            time.sleep(1)

    def run(self, command: str, timeout: float = 60) -> str:
        response = self.group.call(
            "POST",
            f"/sandboxes/{self.id}/executeShellCommand",
            json={"command": command, "shell": "/bin/bash", "user": "root"},
            timeout=timeout + 30,
        )
        if response.status_code != 200:
            raise RuntimeError(f"run a command: {said(response)}")
        return str(response.json().get("stdout") or "").strip()

    def write(self, path: str, data: bytes, mode: int) -> None:
        response = self.group.call(
            "POST",
            f"/sandboxes/{self.id}/files",
            params={"path": path, "createDirs": "true", "mode": str(mode)},
            content=data,
            timeout=120,
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"write {path}: {said(response)}")

    def post(self, verb: str) -> httpx.Response:
        return self.group.call("POST", f"/sandboxes/{self.id}/{verb}", timeout=120)


def disk_image_id(group: Group, name: str) -> str:
    response = group.call("GET", f"/diskimages/{name}")
    if response.status_code == 200:
        return str(response.json().get("id") or name)
    params: dict[str, str] = {}
    while True:
        listed = group.call("GET", "/diskimages", params=params)
        if listed.status_code != 200:
            raise RuntimeError(f"list the disk images: {said(listed)}")
        body = listed.json()
        for image in body.get("value") or []:
            if image.get("name") == name and image.get("id"):
                return str(image["id"])
        next_link = body.get("nextLink")
        skip = httpx.URL(next_link).params.get("skipToken") if next_link else None
        if not skip:
            raise RuntimeError(f"no disk image named {name!r}: run box/azure/build.sh")
        params = {"skipToken": skip}


def ports(tenant: str, me: str) -> list[dict[str, Any]]:
    """The server's ports, locked to the runner (one to an identity nobody has)."""
    return [
        {
            "name": f"p{port}",
            "port": port,
            "protocol": "Http",
            "activationMode": "Manual",
            "auth": {
                "anonymous": False,
                "entraId": {
                    "enabled": True,
                    "tenantIds": [tenant],
                    "objectIds": [str(uuid.uuid4()) if port == OTHERS_PORT else me],
                },
            },
        }
        for port in PORTS
    ]


def through_port(url: str, port_token: str | None) -> dict[str, Any]:
    headers = {"authorization": f"Bearer {port_token}"} if port_token else {}
    try:
        response = httpx.get(url, headers=headers, timeout=20)
    except httpx.HTTPError as error:
        return {"error": type(error).__name__}
    return {"status": response.status_code, "said": response.text[:200]}


def websocket(url: str, port_token: str) -> dict[str, Any]:
    context = ssl.create_default_context(cafile=certifi.where())
    started = time.monotonic()
    try:
        with connect(
            url,
            ssl=context,
            additional_headers={"authorization": f"Bearer {port_token}"},
            subprotocols=["binary"],
            open_timeout=20,
        ) as ws:
            first = ws.recv(timeout=20)
            words = first[:12] if isinstance(first, bytes) else first[:12].encode()
            held = time.monotonic()
            while time.monotonic() - held < WEBSOCKET_HOLD_S:
                time.sleep(15)
                if not ws.ping().wait(15):
                    return {
                        "opened": True,
                        "first_words": words.decode("latin-1"),
                        "dropped_after_s": round(time.monotonic() - held, 1),
                    }
            return {
                "opened": True,
                "open_s": round(held - started, 2),
                "first_words": words.decode("latin-1").strip(),
                "still_open_after_s": WEBSOCKET_HOLD_S,
            }
    except Exception as error:  # noqa: BLE001 — what failed is the finding
        return {"opened": False, "error": f"{type(error).__name__}: {error}"[:300]}


def check(name: str, idle_minutes: float) -> dict[str, Any]:
    group = Group()
    report: dict[str, Any] = {"disk_image": name, "region": group.region}
    try:
        me = az("ad", "signed-in-user", "show", "--query", "id")
    except AzError as error:
        report["error"] = f"could not read your own identity: {error}"
        return report
    try:
        port_token: str | None = token(PORT_SCOPE)
        report["port_sign_in"] = "ok"
    except AzError as error:
        # The port checks then measure only the refusal without a token.
        port_token = None
        report["port_sign_in"] = str(error)

    body = {
        "sourcesRef": {"diskImage": {"id": disk_image_id(group, name), "isPublic": False}},
        "resources": RESOURCES,
        "labels": {"simeon_box": "check"},
        "entrypoint": [VM_INIT],
        "lifecycle": {
            "autoSuspendPolicy": {"enabled": False, "mode": "Memory"},
            "autoDeletePolicy": {"enabled": False},
        },
        "ports": ports(group.tenant, me),
    }
    note("making a test computer")
    started = time.monotonic()
    response = group.call("POST", "/sandboxes", json=body, timeout=180)
    report["data_audience"] = group._scope
    if response.status_code not in (200, 201):
        report["error"] = f"Azure refused the computer: {said(response)}"
        return report
    box = Box(group, str(response.json()["id"]))
    report["sandbox"] = box.id
    try:
        state, _ = box.settle({"running"}, 300)
        report["make_s"] = round(time.monotonic() - started, 2)
        if state != "running":
            raise RuntimeError(f"the computer did not start (state {state})")

        note("looking inside")
        report["user"] = box.run("id -u")
        # "[s]" so the pattern does not find the command that holds it.
        report["first_process"] = box.run(
            "pgrep -f '[s]imeon-vm-init' >/dev/null && echo waiting || echo 'not running'"
        )
        report["first_process_log"] = box.run(
            f"tail -3 {STATE_DIR}/init.log 2>/dev/null; true"
        ).splitlines()
        report["machine_id_in_image"] = box.run("wc -c < /etc/machine-id")
        report["disk"] = box.run("df -h / | tail -1")
        report["memory"] = box.run("free -m | sed -n 2p")
        report["engine_libraries"] = box.run(ENGINE_LIBRARIES)
        report["host_workers"] = box.run(HOST_WORKERS)
        box.write(f"{STATE_DIR}/mode-check", b"x", MODE_PRIVATE)
        report["file_mode_600_reads"] = box.run(f"stat -c '%a %U' {STATE_DIR}/mode-check")

        note(f"a {LONG_COMMAND_S}-second command")
        began = time.monotonic()
        try:
            said_back = box.run(f"sleep {LONG_COMMAND_S}; echo done", LONG_COMMAND_S)
            report["long_command"] = f"{said_back} after {round(time.monotonic() - began)} s"
        except Exception as error:  # noqa: BLE001
            report["long_command"] = (
                f"{type(error).__name__} after {round(time.monotonic() - began)} s: {error}"[:300]
            )

        note("starting the desktop")
        box.write(f"{STATE_DIR}/box.env", b"export SAND_SUPERVISOR_ENABLED='1'\n", MODE_PRIVATE)
        box.write(f"{STATE_DIR}/seed", secrets.token_bytes(64), MODE_PRIVATE)
        box.write("/etc/machine-id", (secrets.token_hex(16) + "\n").encode(), MODE_FILE)
        box.run(f"date -u -s @{int(time.time())} >/dev/null 2>&1; true")
        if report["first_process"] != "waiting":
            # The image's first process did not run: started here, and said so.
            report["first_process_started_by_check"] = True
            box.run(f"setsid -f {VM_INIT} </dev/null >/dev/null 2>&1")
        began = time.monotonic()
        box.write(f"{STATE_DIR}/ready", f"{int(time.time())}\n".encode(), MODE_FILE)
        for _ in range(180):
            if ":6080" in box.run("ss -ltn"):
                break
            time.sleep(1)
        report["desktop_up_s"] = round(time.monotonic() - began, 2)
        report["settings_moved"] = box.run(
            "stat -c '%a' /run/simeon/box.env 2>&1; "
            f"test -f {STATE_DIR}/seed && echo 'seed still there' || echo 'seed moved'"
        ).splitlines()

        note("the port lock")
        screen = group.port_url(box.id, 6080)
        report["screen_without_token"] = through_port(f"{screen}/vnc.html", None)
        if port_token:
            report["screen_with_token"] = through_port(f"{screen}/vnc.html", port_token)
            report["other_identitys_port"] = through_port(
                f"{group.port_url(box.id, OTHERS_PORT)}/vnc.html", port_token
            )
            report["gateway_with_token"] = through_port(
                f"{group.port_url(box.id, 1340)}/health", port_token
            )
            note("a WebSocket through the screen's port")
            report["websocket"] = websocket(
                screen.replace("https://", "wss://") + "/websockify", port_token
            )

        box.run(
            f"setsid -f sh -c 'echo $$ > {STATE_DIR}/check.pid; exec sleep 100000' "
            "</dev/null >/dev/null 2>&1; sleep 1"
        )
        rounds: list[dict[str, Any]] = []
        for index in range(ROUNDS):
            note(f"freeze and wake {index + 1} of {ROUNDS}")
            one: dict[str, Any] = {}
            stopped = box.post("stop")
            if stopped.status_code not in (200, 409):
                one["freeze"] = said(stopped)
                rounds.append(one)
                break
            state, one["freeze_s"] = box.settle(ASLEEP, 300)
            one["asleep_as"] = state
            if index == 0:
                report["port_while_asleep"] = through_port(f"{screen}/vnc.html", port_token)
            time.sleep(ASLEEP_FOR_S)
            began = time.monotonic()
            woke = box.post("resume")
            one["resume_answer"] = woke.status_code
            state, _ = box.settle({"running"}, 180)
            one["wake_s"] = round(time.monotonic() - began, 2)
            if state != "running":
                one["wake"] = f"not awake after 180 s (state {state})"
                rounds.append(one)
                break
            inside = float(box.run("date +%s.%N"))
            one["clock_off_s"] = round(inside - time.time(), 2)
            box.run(f"date -u -s @{int(time.time())} >/dev/null 2>&1; true")
            one["desktop_still_up"] = ":6080" in box.run("ss -ltn")
            one["process_still_there"] = (
                box.run(f"kill -0 $(cat {STATE_DIR}/check.pid) 2>/dev/null && echo yes") == "yes"
            )
            rounds.append(one)
        report["freeze_and_wake"] = rounds

        if idle_minutes > 0:
            note(f"{idle_minutes:g} minutes with nothing to do (auto-suspend off)")
            seen = []
            deadline = time.monotonic() + idle_minutes * 60
            while time.monotonic() < deadline:
                time.sleep(60)
                seen.append(box.state())
            report["idle_states"] = seen
            report["auto_suspend_off_honoured"] = all(s == "running" for s in seen)
    except Exception as error:  # noqa: BLE001 — reported, then the box removed
        report["error"] = f"{type(error).__name__}: {error}"[:400]
    finally:
        note("removing the test computer")
        removed = group.call("DELETE", f"/sandboxes/{box.id}")
        report["removed"] = removed.status_code in (200, 202, 204, 404) or said(removed)
        if report["removed"] is True:
            for _ in range(60):
                if box.state() is None:
                    break
                time.sleep(2)
            report["port_after_removed"] = through_port(
                f"{group.port_url(box.id, 6080)}/vnc.html", port_token
            )
    return report


def main(argv: list[str]) -> int:
    idle = 10.0
    if "--idle-minutes" in argv:
        at = argv.index("--idle-minutes")
        idle = float(argv[at + 1])
        del argv[at : at + 2]
    name = argv[0] if argv else "simeon-box"
    try:
        report = check(name, idle)
    except AzError as error:
        print(error, file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2))
    return 1 if "error" in report else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
