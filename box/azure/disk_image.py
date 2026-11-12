"""Make the sandbox group's disk image from the image in the registry
(12 November 2026). Run by box/azure/build.sh after `az acr build`:

    python box/azure/disk_image.py <registry>.azurecr.io/simeon-box@sha256:… <name> <registry>

Azure pulls the image once and keeps it as a disk image, from which each
computer is made (`sourcesRef.diskImage`, server/simeon/sand/box_azure.py).
The pull uses a registry token of the signed-in person's (`az acr login
--expose-token`, good for three hours), sent to Azure's own API and never
printed: a disk image never pulls again, so nothing of it is kept.

It prints the disk image's id and name and the line for Render.
"""

from __future__ import annotations

import sys
import time

from data_plane import AzError, Group, az, said

#: The registry token's user name, the same for every registry token.
TOKEN_USER = "00000000-0000-0000-0000-000000000000"
READY = {"ready", "succeeded"}
WAIT_S = 30 * 60


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    image_url, name, registry = argv
    try:
        group = Group()
        pull = az("acr", "login", "--name", registry, "--expose-token", "--query", "accessToken")
    except AzError as error:
        print(error, file=sys.stderr)
        return 2
    body = {
        "name": name,
        "labels": {"simeon": "box"},
        "source": {
            "kind": "registry",
            "imageUrl": image_url,
            "authentication": {"registryCredentials": {"username": TOKEN_USER, "token": pull}},
        },
    }
    response = group.call("POST", "/diskimages", json=body, timeout=300)
    if response.status_code not in (200, 201):
        print(f"Azure refused the disk image: {said(response)}", file=sys.stderr)
        if response.status_code == 403:
            print(
                'Your own account needs the role "Container Apps SandboxGroup '
                'Data Owner" on the sandbox group (docs/ops/box-host/'
                "azure-plan.md, Step 0).",
                file=sys.stderr,
            )
        return 1
    image = response.json()
    image_id = str(image.get("id") or "")
    print(f"disk image {name} ({image_id}): making", flush=True)
    started = time.monotonic()
    state = ""
    while time.monotonic() - started < WAIT_S:
        read = group.call("GET", f"/diskimages/{image_id}")
        if read.status_code != 200:
            print(f"could not read the disk image: {said(read)}", file=sys.stderr)
            return 1
        image = read.json()
        status = image.get("status") or {}
        now = str(status.get("state") or "").lower()
        if now != state:
            state = now
            print(f"  {round(time.monotonic() - started)} s: {state}", flush=True)
        if state in READY:
            break
        if state == "failed":
            print(
                "Azure could not make the disk image: "
                f"{status.get('errorMessage') or status.get('message') or 'no reason given'}",
                file=sys.stderr,
            )
            return 1
        time.sleep(10)
    else:
        print(f"the disk image was not ready after {WAIT_S // 60} minutes", file=sys.stderr)
        return 1
    print()
    print(f"Disk image ready in {round(time.monotonic() - started)} s.")
    print(f"  id:   {image_id}")
    print(f"  name: {name}")
    if image.get("sizeInMB"):
        print(f"  size: {image['sizeInMB']} MB")
    print()
    print(f"On Render: SIMEON_AZURE_DISK_IMAGE={name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
