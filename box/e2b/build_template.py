"""Build Simeon's cloud computer as an E2B template (16 October 2026).

Run by `.github/workflows/e2b_template.yml` with `E2B_API_KEY` from the
repository's secrets; or on a machine with the repository and the key:

    E2B_API_KEY=… python box/e2b/build_template.py [name] [--from-box] [--dry-run]

The template is box2's own image (BOX2_IMAGE, the one `SIMEON_BOX_IMAGE`
and `SIMEON_BOX_IMAGE_DIGEST` pin for Docker), built by E2B into a small
virtual machine. It is the image the agents work on today: its folder for
the host already holds the host's workers and libraries, and its exec daemon
writes files and runs the computer's own connectors, which Simeon's own image
(`box/`) does not yet do (16 October 2026, docs/ops/box-host/render-env.md).
`--from-box` builds `box/Dockerfile` instead.

Either way, two things differ from Docker, for a VM made from a snapshot
(`server/simeon/sand/box_e2b.py`):

- nothing starts in it on its own: each new computer is started by the
  server with `start-simeon-vm` (box/bin/, put into box2's image here) once
  its own settings, machine id and fresh randomness are written in, and that
  runs the image's own start as Docker runs its ENTRYPOINT;
- `/etc/machine-id` is emptied, so no two computers share one.

`--dry-run` prints the steps E2B would run, without the key.
"""

from __future__ import annotations

import asyncio
import base64
import os
import sys
from pathlib import Path

from e2b import AsyncTemplate

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_NAME = "simeon-box"
#: box2's image, exactly as Docker runs it (server/simeon/config.py,
#: BOX_IMAGE and BOX_IMAGE_DIGEST; server/tests/sand/test_box_e2b.py checks
#: the two agree).
BOX2_IMAGE = (
    "public.ecr.aws/k0i0n2g5/cursorenvironments/universal@sha256:"
    "322c3a9031d61e210a05400dd74c82bbb1fdb42db315a8cf5ab39368c2f0c1c8"
)
#: Nobody's identity in the template; each computer gets its own.
EMPTY_MACHINE_ID = ": > /etc/machine-id && rm -f /var/lib/dbus/machine-id"
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


def box_ignore_patterns() -> list[str]:
    """The box's own ignore rules (`box/Dockerfile.dockerignore`). The
    repository root's `.dockerignore` belongs to the runner's image and
    excludes everything but `runner/`; Docker reads the box's file in its
    place, and E2B applies these after the root one, so they win (16
    October 2026: without them E2B found no file to copy)."""
    lines = (ROOT / "box" / "Dockerfile.dockerignore").read_text().splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def install_start_script() -> str:
    """`box/bin/start-simeon-vm`, written into the image by one command (no
    file upload, so no ignore rules to get wrong)."""
    script = (ROOT / "box" / "bin" / "start-simeon-vm").read_bytes()
    encoded = base64.b64encode(script).decode()
    return (
        f"echo {encoded} | base64 -d > /usr/local/bin/start-simeon-vm"
        " && chmod 755 /usr/local/bin/start-simeon-vm"
    )


def template(from_box: bool = False) -> AsyncTemplate:
    if from_box:
        built = (
            AsyncTemplate(
                file_context_path=str(ROOT), file_ignore_patterns=box_ignore_patterns()
            )
            .from_dockerfile(dockerfile_without_entrypoint())
            .run_cmd(EMPTY_MACHINE_ID, user="root")
        )
    else:
        built = (
            AsyncTemplate()
            .from_image(BOX2_IMAGE)
            .run_cmd(f"{install_start_script()} && {EMPTY_MACHINE_ID}", user="root")
        )
    return built  # type: ignore[return-value]


async def main(argv: list[str]) -> int:
    name = next((a for a in argv if not a.startswith("--")), DEFAULT_NAME)
    from_box = "--from-box" in argv
    if "--dry-run" in argv:
        print(AsyncTemplate.to_dockerfile(template(from_box)))
        return 0
    if not os.environ.get("E2B_API_KEY"):
        print("E2B_API_KEY is not set", file=sys.stderr)
        return 2
    print(
        f"building {name} from {'box/Dockerfile' if from_box else BOX2_IMAGE}",
        flush=True,
    )
    info = await AsyncTemplate.build(
        template(from_box),
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
