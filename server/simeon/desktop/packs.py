"""Starter packs (22 October 2026): teams of five agents for a trade, each
already named, with a face, a title, the instructions it starts from and the
three apps it asks to connect first.

The packs live next to this module (`packs.json`); the website's Teams pages
are built from the same file (`sites/simeonlabs.com/source/teams.py`). Its
"Add to Simeon" opens the app at `simeon://app/v1/pack/add?id=<id>` (the
iPhone's `simeon-ios://…`), and the app asks here for the pack:

- `GET /desktop/api/packs` lists them (`data.packs`).
- `GET /desktop/api/packs/{id}` is one (`data`), or a 404 with a sentence.

Nothing is stored: the app makes the five agents itself (`createAgent`, with
the agent's `description` as its instructions) and puts them in a sidebar
folder named after the pack (`folder`). Free for everyone, no sign-in needed
to read them.
"""

from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any

from fastapi.responses import JSONResponse

from simeon.routing import APIRouter

from .words import say

# Mounted under the desktop router (`/desktop`), like the other features.
router = APIRouter(include_in_schema=False)

_PACKS_PATH = Path(__file__).with_name("packs.json")


@functools.cache
def packs() -> list[dict[str, Any]]:
    """Every pack, in the file's order, with its apps' names (`appNames`,
    the catalogue's: the apps show a new connector by name before their
    engine lists it)."""
    loaded = json.loads(_PACKS_PATH.read_text(encoding="utf-8"))
    names: dict[str, str] = loaded["appNames"]
    return [
        {
            **found,
            "appNames": {
                app: names[app] for agent in found["agents"] for app in agent["apps"]
            },
        }
        for found in loaded["packs"]
    ]


def pack(pack_id: str) -> dict[str, Any] | None:
    return next((p for p in packs() if p["id"] == pack_id), None)


@router.get("/api/packs", name="desktop:packs")
async def list_packs() -> JSONResponse:
    return JSONResponse({"code": 0, "data": {"packs": packs()}})


@router.get("/api/packs/{pack_id}", name="desktop:pack")
async def get_pack(pack_id: str) -> JSONResponse:
    found = pack(pack_id)
    if found is None:
        return JSONResponse(
            {"code": 404, "message": say("packs.not_found")}, status_code=404
        )
    return JSONResponse({"code": 0, "data": found})
