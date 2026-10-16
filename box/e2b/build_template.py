"""Build Simeon's cloud computer as an E2B template (16 October 2026).

Run by `.github/workflows/e2b_template.yml` with `E2B_API_KEY` from the
repository's secrets; or on a machine with the repository and the key:

    E2B_API_KEY=… python box/e2b/build_template.py [name] [--dry-run]

The template is `box/Dockerfile` as it is, built by E2B into a small
virtual machine, with two differences that matter to a VM made from a
snapshot (`server/simeon/sand/box_e2b.py`):

- nothing of ours starts in it: the image's ENTRYPOINT is left out, and
  each new computer is started by the server with `start-simeon-vm` once
  its own settings, machine id and fresh randomness are written in;
- `/etc/machine-id` is emptied, so no two computers share one.

`--dry-run` prints the steps E2B would run, without the key.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from e2b import AsyncTemplate

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_NAME = "simeon-box"
#: What each computer gets; E2B bills per second while it runs. The same
#: as a Docker computer today (`SIMEON_BOX_MEMORY_LIMIT_MB`, `_CPU_LIMIT`).
CPU_COUNT = int(os.environ.get("SIMEON_E2B_CPUS", "2"))
MEMORY_MB = int(os.environ.get("SIMEON_E2B_MEMORY_MB", "4096"))
#: Free disk asked for after the build: room for the person's files,
#: Chrome's profile and what the agents install.
MIN_FREE_DISK_MB = int(os.environ.get("SIMEON_E2B_FREE_DISK_MB", "10240"))


def dockerfile_without_entrypoint() -> str:
    lines = (ROOT / "box" / "Dockerfile").read_text().splitlines()
    kept = [
        line
        for line in lines
        if not line.lstrip().upper().startswith(("ENTRYPOINT", "CMD "))
    ]
    if len(kept) == len(lines):
        raise SystemExit("box/Dockerfile has no ENTRYPOINT: has its start changed?")
    return "\n".join(kept) + "\n"


def template() -> AsyncTemplate:
    built = (
        AsyncTemplate(file_context_path=str(ROOT))
        .from_dockerfile(dockerfile_without_entrypoint())
        .run_cmd(": > /etc/machine-id && rm -f /var/lib/dbus/machine-id", user="root")
    )
    return built  # type: ignore[return-value]


async def main(argv: list[str]) -> int:
    name = next((a for a in argv if not a.startswith("--")), DEFAULT_NAME)
    if "--dry-run" in argv:
        print(AsyncTemplate.to_dockerfile(template()))
        return 0
    if not os.environ.get("E2B_API_KEY"):
        print("E2B_API_KEY is not set", file=sys.stderr)
        return 2
    info = await AsyncTemplate.build(
        template(),
        name,
        cpu_count=CPU_COUNT,
        memory_mb=MEMORY_MB,
        min_free_disk_mb=MIN_FREE_DISK_MB,
        on_build_logs=lambda entry: print(entry, flush=True),
    )
    print(f"built template {name}: {info}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
