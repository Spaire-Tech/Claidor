"""Measure a computer made from the E2B template (16 October 2026).

Run by `.github/workflows/e2b_template.yml` after a build, or by hand:

    E2B_API_KEY=… python box/e2b/check_template.py [name]

It makes one test computer the way the server does (`box_e2b.py`), but
with no person's settings and no host bundle (the desktop starts; on box2's
image, the image's own copy of the engine starts too, without a sign-in),
and prints, as JSON:

- how long the computer took to be made and the desktop to come up;
- disk, memory and the machine id inside it;
- that the packages the engine loads from outside its bundle are there
  (`engine_libraries: found`; anything else is an `error`), and whether the
  host's workers are in the image (`host_workers`);
- that its screen port refuses a request without the traffic token and
  answers one with it;
- how long freezing and waking take, several times, and how far the
  computer's clock is from ours after each wake;
- `box-doctor` on Simeon's image (the engine's checks fail without the
  bundle; the desktop's should pass); box2's image has none.

The test computer is removed at the end, whatever happened.
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import sys
import time
from typing import Any

import httpx
from e2b import AsyncSandbox

ROUNDS = 3
PAUSED_FOR_S = 20
# piscina, which the engine loads at start-up from outside its bundle, found
# the way the engine finds it: from its own folder (box2's image keeps it in
# /home/box/sand-host/node_modules) or through NODE_PATH (/home/box/deps in
# Simeon's image), with the image's node (box2's runs the engine with
# /exec-daemon/node). Without it the engine stops at once (16 October 2026).
ENGINE_LIBRARIES = (
    "cd /home/box/sand-host 2>/dev/null || cd /; "
    "N=$(command -v node || echo /exec-daemon/node); "
    "NODE_PATH=/home/box/deps \"$N\" -e '"
    'try { require("piscina"); console.log("found"); } '
    'catch (e) { console.log(String(e.message).split("\\n")[0]); }'
    "'"
)
#: Where the host's workers come from: box2's image holds them; on Simeon's
#: own image the server writes them from the engine bundle.
HOST_WORKERS = (
    "if [ -f /home/box/sand-host/agent-isolation/agent-store-worker.cjs ]; "
    "then echo 'in the image'; else echo 'written by the server'; fi"
)


async def run(sandbox: Any, cmd: str, timeout: float = 60) -> str:
    result = await sandbox.commands.run(cmd, user="root", timeout=timeout)
    return str(result.stdout).strip()


async def check(name: str) -> dict[str, Any]:
    report: dict[str, Any] = {"template": name}
    started = time.monotonic()
    sandbox = await AsyncSandbox.create(
        template=name,
        timeout=900,
        metadata={"simeon_box": "template-check"},
        network={"allow_public_traffic": False},
        # A test computer: removed on timeout, never kept.
        lifecycle={"on_timeout": "kill"},
    )
    report["create_s"] = round(time.monotonic() - started, 2)
    report["sandbox"] = sandbox.sandbox_id
    try:
        await run(sandbox, "mkdir -p /run/simeon")
        await sandbox.files.write(
            "/run/simeon/box.env", "export SAND_SUPERVISOR_ENABLED='1'\n", user="root"
        )
        await sandbox.files.write("/run/simeon/seed", secrets.token_bytes(64), user="root")
        await sandbox.files.write("/etc/machine-id", secrets.token_hex(16) + "\n", user="root")
        started = time.monotonic()
        await run(
            sandbox,
            f"date -u -s @{int(time.time())} >/dev/null 2>&1; "
            "setsid -f /usr/local/bin/start-simeon-vm </dev/null >/dev/null 2>&1",
        )
        for _ in range(120):
            if ":6080" in await run(sandbox, "ss -ltn"):
                break
            await asyncio.sleep(1)
        report["desktop_up_s"] = round(time.monotonic() - started, 2)
        report["disk"] = await run(sandbox, "df -h / | tail -1")
        report["memory"] = await run(sandbox, "free -m | sed -n 2p")
        report["machine_id_set"] = len(await run(sandbox, "cat /etc/machine-id")) == 32
        report["engine_libraries"] = await run(sandbox, ENGINE_LIBRARIES)
        report["host_workers"] = await run(sandbox, HOST_WORKERS)

        screen = f"https://{sandbox.get_host(6080)}/vnc.html"
        async with httpx.AsyncClient(timeout=15) as client:
            without = await client.get(screen)
            with_token = await client.get(
                screen,
                headers={"e2b-traffic-access-token": sandbox.traffic_access_token or ""},
            )
        report["screen_without_token"] = without.status_code
        report["screen_with_token"] = with_token.status_code

        rounds = []
        for _ in range(ROUNDS):
            started = time.monotonic()
            await AsyncSandbox.pause(sandbox.sandbox_id)
            paused_s = time.monotonic() - started
            await asyncio.sleep(PAUSED_FOR_S)
            started = time.monotonic()
            woken = await AsyncSandbox.connect(sandbox.sandbox_id, timeout=900)
            resume_s = time.monotonic() - started
            inside = float(await run(woken, "date +%s.%N"))
            rounds.append(
                {
                    "pause_s": round(paused_s, 2),
                    "resume_s": round(resume_s, 2),
                    "clock_off_s": round(inside - time.time(), 2),
                    "desktop_still_up": ":6080" in await run(woken, "ss -ltn"),
                }
            )
            sandbox = woken
        report["freeze_and_wake"] = rounds
        # Simeon's image has a doctor; box2's image has none.
        report["box_doctor"] = (
            await run(
                sandbox,
                "if [ -x /usr/local/bin/box-doctor ]; then "
                "/usr/local/bin/box-doctor 2>&1 | tail -25; "
                "else echo 'no box-doctor in this image'; fi",
            )
        ).splitlines()
        if report["engine_libraries"] != "found":
            report["error"] = (
                "the engine's libraries are not in the template "
                f"({report['engine_libraries']}): build the template again"
            )
    except Exception as error:
        report["error"] = f"{type(error).__name__}: {error}"
    finally:
        try:
            await AsyncSandbox.kill(sandbox.sandbox_id)
            report["removed"] = True
        except Exception as error:
            report["removed"] = f"{type(error).__name__}: {error}"
    return report


def main() -> int:
    if not os.environ.get("E2B_API_KEY"):
        print("E2B_API_KEY is not set", file=sys.stderr)
        return 2
    name = sys.argv[1] if len(sys.argv) > 1 else "simeon-box"
    report = asyncio.run(check(name))
    print(json.dumps(report, indent=2))
    return 1 if "error" in report else 0


if __name__ == "__main__":
    sys.exit(main())
