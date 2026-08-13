"""A Microsoft Graph that runs on this machine, holding the Cascade files.

Nobody developing this product has a SharePoint tenant, an application
registration and a deal room to hand, and the connector cannot be looked at
without all three. So this speaks the URLs the connector uses — token,
`/me`, drives and children, content, mail folders and messages — over the
shapes Graph publishes, and serves `scripts/cascade/` as a document
library with a small mailbox beside it.

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

#: A second room, holding the model *and a working copy* — the shape that
#: makes the New-deal flow ask which workbook is the model. The bytes are
#: the same Cascade files under the names a second deal would use; what
#: is being served is the shape, and the shape is real.
ROOMS: dict[str, dict[str, Any]] = {
    ROOM: {
        "name": "Project Cascade",
        "files": [(name, name) for name in ROOM_FILES],
    },
    "folder-kestrel": {
        "name": "Project Kestrel",
        "files": [
            ("kestrel_model_v9.xlsx", "cascade_model.xlsx"),
            ("kestrel_working_v3.xlsx", "cascade_model.xlsx"),
            ("kestrel_deck.pptx", "cascade_deck.pptx"),
            ("kestrel_accounts.pdf", "cascade_accounts.pdf"),
        ],
    },
}

#: Each file's content tag. Editing this while the server is running is the
#: whole point — bump one, press Sync now, and the deal reads that file
#: again and re-checks itself.
TAGS: dict[str, str] = {}

app = FastAPI(title="Graph stub")


def _room_files(room: str) -> list[tuple[str, Path]]:
    """(served name, disk path) for one room, existing files only."""
    return [
        (served, HERE / disk)
        for served, disk in ROOMS[room]["files"]
        if (HERE / disk).is_file()
    ]


def _tag(served: str, path: Path) -> str:
    """Content, not name. A stat is close enough to a content hash here and
    it means saving over a file in `scripts/cascade/` moves the tag."""
    stamp = path.stat()
    return TAGS.get(served) or f"{{stub}},{stamp.st_mtime_ns}-{stamp.st_size}"


def _item(served: str, path: Path, room: str) -> dict[str, Any]:
    from datetime import UTC, datetime

    stamp = path.stat()
    return {
        "id": f"item-{served}",
        "name": served,
        "size": stamp.st_size,
        "cTag": _tag(served, path),
        "eTag": _tag(served, path),
        # From the same stat as the tag, so touching a file moves both.
        # A room where the content changed and the date did not is a state
        # Graph never produces and the screen should never be shown.
        "lastModifiedDateTime": datetime.fromtimestamp(stamp.st_mtime, UTC).isoformat(),
        "lastModifiedBy": {"user": {"displayName": "R. Duval"}},
        "parentReference": {
            "driveId": DRIVE,
            "path": f"/drive/root:/{ROOMS[room]['name']}",
        },
        "file": {"mimeType": "application/octet-stream"},
    }


def _folder(room: str, drive_id: str) -> dict[str, Any]:
    files = _room_files(room)
    return {
        "id": room,
        "name": ROOMS[room]["name"],
        "folder": {"childCount": len(files)},
        "lastModifiedDateTime": max(
            (
                _item(served, path, room)["lastModifiedDateTime"]
                for served, path in files
            ),
            default="2026-08-04T09:12:00Z",
        ),
        "lastModifiedBy": {"user": {"displayName": "R. Duval"}},
        "parentReference": {"driveId": drive_id, "path": "/drive/root:"},
    }


#: A mailbox, written against the Cascade model on purpose.
#:
#: The draft is the whole point of the mail screen: 235.3 where the model
#: says 228.9, in the sentence shape a memo actually uses, so pressing
#: « Check this message » produces a real drift against a real cell. The
#: inbox message is the other half of the case — somebody asking about a
#: figure, which is what makes the draft get written.
MAILBOX: dict[str, list[dict[str, Any]]] = {
    "drafts": [
        {
            "id": "msg-draft-1",
            "changeKey": "k1",
            "subject": "Project Cascade — FY2025A summary",
            "from": ("R. Duval", "r.duval@rothmoor.example"),
            "to": ("helena.vos@kestrelcapital.example",),
            "at": "2026-08-11T08:22:00Z",
            "draft": True,
            "read": True,
            "body": (
                "<p>Helena,</p>"
                "<p>Ahead of Thursday: the business generated $235.3mm of "
                "revenue in FY2025A, and the capital structure carries total "
                "debt of $96.4m.</p>"
                "<p>The full model is in the deal room.</p>"
                "<p>Kind regards</p>"
                "<p>Rasmus Duval | Rothmoor | 20 Finsbury Circus</p>"
            ),
        }
    ],
    "inbox": [
        {
            "id": "msg-in-1",
            "changeKey": "k1",
            "subject": "Re: Project Cascade — revenue",
            "from": ("Helena Vos", "helena.vos@kestrelcapital.example"),
            "to": ("r.duval@rothmoor.example",),
            "at": "2026-08-11T07:51:00Z",
            "draft": False,
            "read": False,
            "body": (
                "<p>Rasmus,</p>"
                "<p>Can you confirm the FY2025A revenue figure before "
                "Thursday? Our note has it at $228.9mm.</p>"
            ),
        }
    ],
}


# --- sign-in -------------------------------------------------------------


@app.get("/{tenant}/v2.0/.well-known/openid-configuration")
async def openid(tenant: str) -> dict[str, Any]:
    """Enough of the OpenID document for the preflight's tenant check."""
    return {
        "issuer": f"http://127.0.0.1:8900/{tenant}/v2.0",
        "token_endpoint": f"http://127.0.0.1:8900/{tenant}/oauth2/v2.0/token",
    }


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


@app.get("/v1.0/me/mailFolders/{folder}/messages")
async def mail(folder: str) -> dict[str, Any]:
    return {"value": [_mail(one) for one in MAILBOX.get(folder, [])]}


@app.get("/v1.0/me/messages/{message_id}")
async def one_message(message_id: str) -> Response:
    for held in MAILBOX.values():
        for one in held:
            if one["id"] == message_id:
                return _json(_mail(one, body=True))
    return _json({"error": {"message": "The message was not found."}}, 404)


def _mail(one: dict[str, Any], body: bool = False) -> dict[str, Any]:
    name, address = one["from"]
    payload: dict[str, Any] = {
        "id": one["id"],
        "changeKey": one["changeKey"],
        "subject": one["subject"],
        "from": {"emailAddress": {"name": name, "address": address}},
        "toRecipients": [{"emailAddress": {"address": to}} for to in one.get("to", ())],
        "receivedDateTime": one["at"],
        "bodyPreview": _preview(one["body"]),
        "isDraft": one["draft"],
        "isRead": one["read"],
        "hasAttachments": False,
    }
    if body:
        payload["body"] = {"contentType": "html", "content": one["body"]}
    return payload


def _preview(body: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", body).replace("  ", " ").strip()[:100]


@app.get("/v1.0/me/followedSites")
async def followed() -> dict[str, Any]:
    return {"value": [{"id": "site-rothmoor", "displayName": "Rothmoor Deals"}]}


@app.get("/v1.0/sites/{site_id}/drives")
async def drives(site_id: str) -> dict[str, Any]:
    return {"value": [{"id": DRIVE, "name": "Documents"}]}


@app.get("/v1.0/drives/{drive_id}/root/children")
async def root_children(drive_id: str) -> dict[str, Any]:
    return {"value": [_folder(room, drive_id) for room in ROOMS]}


@app.get("/v1.0/drives/{drive_id}/items/{item_id}")
async def item(drive_id: str, item_id: str) -> Response:
    if item_id in ROOMS:
        return _json(_folder(item_id, drive_id))
    for room in ROOMS:
        for served, path in _room_files(room):
            if f"item-{served}" == item_id:
                return _json(_item(served, path, room))
    return _json({"error": {"message": "itemNotFound"}}, 404)


@app.get("/v1.0/drives/{drive_id}/items/{item_id}/children")
async def children(drive_id: str, item_id: str) -> dict[str, Any]:
    if item_id not in ROOMS:
        return {"value": []}
    return {
        "value": [_item(served, path, item_id) for served, path in _room_files(item_id)]
    }


@app.get("/v1.0/drives/{drive_id}/items/{item_id}/content")
async def content(drive_id: str, item_id: str) -> Response:
    for room in ROOMS:
        for served, path in _room_files(room):
            if f"item-{served}" == item_id:
                return Response(
                    path.read_bytes(), media_type="application/octet-stream"
                )
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
