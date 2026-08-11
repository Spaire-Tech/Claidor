"""A Microsoft Graph that runs on this machine, holding the Cascade files.

Nobody developing this product has a SharePoint tenant, an application
registration and a deal room to hand, and the connector cannot be looked at
without all three. So this speaks the four URLs the connector uses — token,
`/me`, drives and children, content — over the shapes Graph publishes, and
serves `scripts/cascade/` as a document library.

    uv run python -m scripts.graph_stub          # http://127.0.0.1:8900

Then point the server at it:

    MICROSOFT_CLIENT_ID=stub
    MICROSOFT_CLIENT_SECRET=stub
    MICROSOFT_GRAPH_BASE=http://127.0.0.1:8900/v1.0
    MICROSOFT_LOGIN_BASE=http://127.0.0.1:8900

**This proves the wiring, not the integration.** The shapes are copied from
the published API and the file bytes are the same Cascade documents the
rest of the product is checked against, so every layer above Graph — the
token store, the sync, the status column, the re-check — is exercised for
real. What it cannot prove is that Microsoft behaves as documented. The
first connection against a real tenant will find something; the point of
this is that everything *else* has already been found by then.
"""

import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Response
from fastapi.responses import RedirectResponse

HERE = Path(__file__).parent / "cascade"

#: What the library holds. The deal room is a folder inside it, which is
#: the arrangement a banker actually has: a site with several folders and
#: one of them is this deal.
ROOM = "folder-cascade"
DRIVE = "b!stub-drive-rothmoor"

#: What is in the room, and in what order a person would see it. Named
#: rather than « everything in the directory »: `scripts/cascade/` also
#: holds the deliberately broken variants and the audit fixture, and a deal
#: room containing two decks called `cascade_deck.pptx` and
#: `cascade_deck_broken.pptx` is not a room anybody has.
ROOM_FILES = (
    "cascade_model.xlsx",
    "cascade_deck.pptx",
    "cascade_memo.docx",
    "cascade_accounts.pdf",
)

#: Each file's content tag. Editing this while the server is running is the
#: whole point — bump one, press Sync now, and the deal reads that file
#: again and re-checks itself.
TAGS: dict[str, str] = {}

app = FastAPI(title="Graph stub")


def _files() -> list[Path]:
    return [one for one in (HERE / name for name in ROOM_FILES) if one.is_file()]


def _tag(path: Path) -> str:
    """Content, not name. A stat is close enough to a content hash here and
    it means saving over a file in `scripts/cascade/` moves the tag."""
    stamp = path.stat()
    return TAGS.get(path.name) or f"{{stub}},{stamp.st_mtime_ns}-{stamp.st_size}"


def _item(path: Path) -> dict[str, Any]:
    from datetime import UTC, datetime

    stamp = path.stat()
    return {
        "id": f"item-{path.name}",
        "name": path.name,
        "size": stamp.st_size,
        "cTag": _tag(path),
        "eTag": _tag(path),
        # From the same stat as the tag, so touching a file moves both.
        # A room where the content changed and the date did not is a state
        # Graph never produces and the screen should never be shown.
        "lastModifiedDateTime": datetime.fromtimestamp(stamp.st_mtime, UTC).isoformat(),
        "lastModifiedBy": {"user": {"displayName": "R. Duval"}},
        "parentReference": {"driveId": DRIVE, "path": "/drive/root:/Cascade"},
        "file": {"mimeType": "application/octet-stream"},
    }


# --- sign-in -------------------------------------------------------------


@app.get("/{tenant}/oauth2/v2.0/authorize")
async def authorize(tenant: str, redirect_uri: str, state: str) -> Response:
    """No sign-in screen. There is nobody to sign in as."""
    return RedirectResponse(f"{redirect_uri}?code=stub-code&state={state}")


@app.post("/{tenant}/oauth2/v2.0/token")
async def token(tenant: str) -> dict[str, Any]:
    return {
        "access_token": "stub-access",
        "refresh_token": "stub-refresh",
        "expires_in": 3600,
        "scope": "offline_access User.Read Files.Read.All Sites.Read.All",
    }


# --- graph ---------------------------------------------------------------


@app.get("/v1.0/me")
async def me() -> dict[str, Any]:
    return {
        "id": "stub-user",
        "displayName": "R. Duval",
        "mail": "r.duval@rothmoor.example",
    }


@app.get("/v1.0/me/drive")
async def my_drive() -> Response:
    # This account has no OneDrive. The connector is written to carry on
    # past that, and a stub that never exercises it is not testing it.
    return Response(
        status_code=404,
        content='{"error":{"message":"itemNotFound"}}',
        media_type="application/json",
    )


@app.get("/v1.0/me/followedSites")
async def followed() -> dict[str, Any]:
    return {"value": [{"id": "site-rothmoor", "displayName": "Rothmoor Deals"}]}


@app.get("/v1.0/sites/{site_id}/drives")
async def drives(site_id: str) -> dict[str, Any]:
    return {"value": [{"id": DRIVE, "name": "Documents"}]}


@app.get("/v1.0/drives/{drive_id}/root/children")
async def root_children(drive_id: str) -> dict[str, Any]:
    return {
        "value": [
            {
                "id": ROOM,
                "name": "Project Cascade",
                "folder": {"childCount": len(_files())},
                "lastModifiedDateTime": max(
                    (one["lastModifiedDateTime"] for one in map(_item, _files())),
                    default="2026-08-04T09:12:00Z",
                ),
                "lastModifiedBy": {"user": {"displayName": "R. Duval"}},
                "parentReference": {"driveId": drive_id, "path": "/drive/root:"},
            }
        ]
    }


@app.get("/v1.0/drives/{drive_id}/items/{item_id}")
async def item(drive_id: str, item_id: str) -> Response:
    if item_id == ROOM:
        return _json(
            {
                "id": ROOM,
                "name": "Project Cascade",
                "folder": {"childCount": len(_files())},
                "parentReference": {"driveId": drive_id, "path": "/drive/root:"},
            }
        )
    for path in _files():
        if f"item-{path.name}" == item_id:
            return _json(_item(path))
    return _json({"error": {"message": "itemNotFound"}}, 404)


@app.get("/v1.0/drives/{drive_id}/items/{item_id}/children")
async def children(drive_id: str, item_id: str) -> dict[str, Any]:
    if item_id != ROOM:
        return {"value": []}
    return {"value": [_item(one) for one in _files()]}


@app.get("/v1.0/drives/{drive_id}/items/{item_id}/content")
async def content(drive_id: str, item_id: str) -> Response:
    for path in _files():
        if f"item-{path.name}" == item_id:
            return Response(path.read_bytes(), media_type="application/octet-stream")
    return _json({"error": {"message": "itemNotFound"}}, 404)


def _json(body: dict[str, Any], status: int = 200) -> Response:
    import json

    return Response(json.dumps(body), status, media_type="application/json")


if __name__ == "__main__":
    import uvicorn

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8900
    print(f"Graph stub on http://127.0.0.1:{port}, serving {HERE}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


__all__ = ["app"]
