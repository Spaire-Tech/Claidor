"""Starter packs (`simeon.desktop.packs`): the file every app and the website
read, and the two routes. No database."""

import json
import re
from pathlib import Path

import pytest

from simeon.desktop.packs import get_pack, list_packs, packs

ROOT = Path(__file__).resolve().parents[3]
FACES = ROOT / "ios/SimeonCore/Sources/SimeonCore/Resources/Faces"
CATALOG = ROOT / "desktop/source/shared/node/vendor-mcp/catalog.ts"


def test_every_pack_is_five_agents_with_a_face_and_three_apps_of_their_own() -> None:
    faces = {path.stem for path in FACES.glob("clay-*.webp")}
    # Each connector's id and name in the catalogue, the apps' names too.
    connectors = dict(
        re.findall(r'\bid: "([a-z0-9-]+)", name: "([^"]+)"', CATALOG.read_text())
    )
    ids = [p["id"] for p in packs()]
    assert ids
    assert len(ids) == len(set(ids))
    for found in packs():
        assert re.fullmatch(r"[a-z0-9-]+", found["id"])
        assert found["folder"].strip()
        assert found["title"].strip()
        agents = found["agents"]
        assert len(agents) == 5, found["id"]
        assert len({a["name"] for a in agents}) == 5, found["id"]
        assert len({a["face"] for a in agents}) == 5, found["id"]
        apps = [app for a in agents for app in a["apps"]]
        # Every app once in a pack: fifteen different apps.
        assert len(apps) == 15, found["id"]
        assert len(set(apps)) == 15, found["id"]
        for agent in agents:
            assert agent["face"] in faces, (found["id"], agent["face"])
            assert agent["title"].strip()
            assert agent["summary"].strip()
            for app in agent["apps"]:
                assert app in connectors, (found["id"], app)
                assert found["appNames"][app] == connectors[app], app
            # The instructions name the apps it asks for first.
            names = agent["description"]
            assert "Starts by asking to connect" in names, agent["name"]


@pytest.mark.asyncio
async def test_the_list_and_one_pack_are_served_and_an_unknown_one_is_a_404() -> None:
    listed = json.loads((await list_packs()).body)
    assert listed["code"] == 0
    assert [p["id"] for p in listed["data"]["packs"]] == [p["id"] for p in packs()]

    one = json.loads((await get_pack("coffee-shop")).body)
    assert one["code"] == 0
    assert one["data"]["folder"] == "Coffee Shop Team"
    assert one["data"]["appNames"]["google-sheets"] == "Google Sheets"
    assert len(one["data"]["appNames"]) == 15
    assert [a["name"] for a in one["data"]["agents"]] == [
        "Bruno",
        "Clara",
        "Mae",
        "Ines",
        "Hugo",
    ]

    missing = await get_pack("nope")
    assert missing.status_code == 404
    assert json.loads(missing.body)["message"] == "This team isn't available anymore."
