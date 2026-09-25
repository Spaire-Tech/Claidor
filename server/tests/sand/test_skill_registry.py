"""The skill registry behind `aiserver.v1.DashboardService` (25 September
2026, `docs/product/skill-publish-served.md`).

The app packs a skill folder as a plugin tar.gz (`plugin.json` +
`skills/<name>/SKILL.md`), posts it to `PublishPlugin`, and confirms the
publish by finding, in `GetEffectiveUserPlugins`, a plugin whose id is the
answered `pluginId` and whose installed version — for an inline plugin,
`sha256("{id}:{updatedAt}")[:40]` — equals the answered `commitSha`. These
tests build that tarball and read the listing the way the loader does.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import tarfile
from typing import Any

import httpx
import pytest

from polar.config import settings
from polar.integrations.aws.s3 import S3Service
from polar.models import Organization, User, UserOrganization
from polar.postgres import AsyncSession
from polar.sand.dashboard import user_id_of
from polar.sand.skill_registry_repository import SandPluginRepository
from polar.sand.skill_registry_service import (
    PERSONAL_MARKETPLACE_SLUG,
    PERSONAL_TEAM_NAME,
    stable_int32,
)
from tests.desktop.test_endpoints import _signed_in
from tests.fixtures.database import SaveFixture

SERVICE = "/aiserver.v1.DashboardService"


def plugin_tar_gz(name: str = "meeting-notes", body: str = "Take notes.") -> bytes:
    """What `synthesizeSkillPluginDir` + `packPluginArtifact` produce."""
    files = {
        "plugin.json": json.dumps(
            {"name": name, "displayName": name.title(), "skills": [f"skills/{name}"]}
        ),
        f"skills/{name}/SKILL.md": f"---\nname: {name}\ndescription: Notes\n---\n\n{body}\n",
        f"skills/{name}/helper.py": "print('hi')\n",
    }
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for path, content in files.items():
            data = content.encode("utf-8")
            info = tarfile.TarInfo(name=path)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def loader_version(plugin: dict[str, Any]) -> str:
    """`backend-marketplace-client.ts`: an inline plugin's version."""
    return hashlib.sha256(f"{plugin['id']}:{plugin['updatedAt']}".encode()).hexdigest()[
        :40
    ]


async def call(
    client: httpx.AsyncClient, access: str, method: str, body: dict[str, Any]
) -> httpx.Response:
    return await client.post(
        f"{SERVICE}/{method}",
        json=body,
        headers={
            "Authorization": f"Bearer {access}",
            "content-type": "application/json",
        },
    )


async def publish(
    client: httpx.AsyncClient, access: str, *, team_id: int | None = None, **kwargs: Any
) -> dict[str, Any]:
    name = kwargs.pop("name", "meeting-notes")
    body: dict[str, Any] = {
        "name": name,
        "displayName": kwargs.pop("display_name", "Meeting Notes"),
        "description": kwargs.pop("description", "Takes meeting notes."),
        "pluginTarGz": base64.b64encode(
            kwargs.pop("tar_gz", plugin_tar_gz(name))
        ).decode(),
    }
    if team_id is not None:
        body["teamId"] = team_id
    response = await call(client, access, "PublishPlugin", body)
    assert response.status_code == 200, response.text
    return response.json()


async def listing(client: httpx.AsyncClient, access: str) -> dict[str, Any]:
    response = await call(
        client, access, "GetEffectiveUserPlugins", {"useReplica": False}
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
class TestPublishToMyOwnAccount:
    async def test_a_publish_lands_in_the_listing_with_the_confirmable_sha(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        published = await publish(client, access)
        assert published["pluginId"].isdigit()
        assert len(published["commitSha"]) == 40
        assert published["marketplaceId"] == str(stable_int32(user.id))

        body = await listing(client, access)
        assert len(body["plugins"]) == 1
        effective = body["plugins"][0]
        plugin = effective["plugin"]
        # What plugin-skills.ts reads on every sync.
        assert plugin["id"] == published["pluginId"]
        assert plugin["name"] == "meeting-notes"
        assert plugin["displayName"] == "Meeting Notes"
        assert plugin["description"] == "Takes meeting notes."
        assert plugin["gitUrl"] == "", "an inline plugin: nothing is ever cloned"
        assert plugin["gitRef"] == published["commitSha"]
        assert plugin["publisher"]["ownerUserId"] == stable_int32(user.id)
        assert plugin["marketplace"]["teamId"] == stable_int32(user.id)
        assert plugin["marketplace"]["name"] == PERSONAL_MARKETPLACE_SLUG
        assert plugin["marketplace"]["allowUserPublish"] is True
        assert effective["isEnabled"] is True
        assert effective["isTeamRequired"] is False
        assert effective["installMode"] == 1
        assert effective["pinnedGitRef"] == published["commitSha"]
        # The loader's version of an inline plugin is the answered sha.
        assert loader_version(plugin) == published["commitSha"]
        # The tarball's files ride back as inline content.
        inline = json.loads(effective["inlineContentJson"])
        paths = {file["path"] for file in inline["files"]}
        assert paths == {
            "plugin.json",
            "skills/meeting-notes/SKILL.md",
            "skills/meeting-notes/helper.py",
        }
        skill = next(f for f in inline["files"] if f["path"].endswith("SKILL.md"))
        assert "Take notes." in skill["content"]
        assert plugin["skills"] == [
            {"name": "meeting-notes", "sourcePath": "skills/meeting-notes/SKILL.md"}
        ]
        assert [m["name"] for m in body["marketplaces"]] == [PERSONAL_MARKETPLACE_SLUG]
        # GetMe's userId is the same number the publisher carries.
        me = await call(client, access, "GetMe", {})
        assert me.json()["userId"] == plugin["publisher"]["ownerUserId"]
        # The upload itself went to S3 (the moto mock in tests) and the
        # object is the tarball as it arrived.
        row = await SandPluginRepository.from_session(session).get_by_numeric_id(
            int(published["pluginId"])
        )
        assert row is not None
        assert row.tar_gz_key is not None
        stored = S3Service(bucket=settings.S3_FILES_BUCKET_NAME).get_object_or_raise(
            row.tar_gz_key
        )
        assert stored["Body"].read() == plugin_tar_gz()

    async def test_team_id_zero_and_the_personal_team_id_are_the_same_target(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        first = await publish(client, access, team_id=0)
        second = await publish(
            client,
            access,
            team_id=stable_int32(user.id),
            tar_gz=plugin_tar_gz(body="Take better notes."),
        )
        assert second["pluginId"] == first["pluginId"], (
            "a re-publish updates the same plugin"
        )
        assert second["commitSha"] != first["commitSha"], "and moves the version"
        body = await listing(client, access)
        assert len(body["plugins"]) == 1
        assert body["plugins"][0]["plugin"]["gitRef"] == second["commitSha"]
        assert loader_version(body["plugins"][0]["plugin"]) == second["commitSha"]

    async def test_unpublish_removes_it_from_the_listing(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        published = await publish(client, access)
        response = await call(
            client,
            access,
            "UnpublishPlugin",
            {"pluginId": published["pluginId"], "teamId": stable_int32(user.id)},
        )
        assert response.status_code == 200, response.text
        assert len(response.json()["commitSha"]) == 40
        assert (await listing(client, access))["plugins"] == []
        again = await call(
            client, access, "UnpublishPlugin", {"pluginId": published["pluginId"]}
        )
        assert again.status_code == 404
        assert again.json() == {
            "code": "not_found",
            "message": "That plugin is no longer published.",
        }

    async def test_a_bad_archive_is_refused_with_a_sentence(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await call(
            client,
            access,
            "PublishPlugin",
            {
                "name": "x",
                "displayName": "x",
                "description": "d",
                "pluginTarGz": base64.b64encode(b"not a tarball").decode(),
            },
        )
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_argument"
        assert "not a tar.gz" in response.json()["message"]

        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            data = b"x"
            info = tarfile.TarInfo(name="../escape.md")
            info.size = 1
            archive.addfile(info, io.BytesIO(data))
        response = await call(
            client,
            access,
            "PublishPlugin",
            {
                "name": "x",
                "displayName": "x",
                "description": "d",
                "pluginTarGz": base64.b64encode(buffer.getvalue()).decode(),
            },
        )
        assert response.status_code == 400
        assert "unsafe path" in response.json()["message"]

    async def test_a_stranger_sees_nothing_and_cannot_unpublish(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        published = await publish(client, access)
        stranger, _ = await _signed_in(client, session, user_second)
        assert (await listing(client, stranger))["plugins"] == []
        response = await call(
            client, stranger, "UnpublishPlugin", {"pluginId": published["pluginId"]}
        )
        assert response.status_code == 403
        assert response.json()["code"] == "permission_denied"


@pytest.mark.asyncio
class TestTeams:
    async def test_get_teams_is_just_me_with_no_organization(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await call(client, access, "GetTeams", {"activeOnly": True})
        assert response.status_code == 200, response.text
        teams = response.json()["teams"]
        assert len(teams) == 1
        # publishableTeams(): kept when id > 0 && isDirectMember.
        assert teams[0]["id"] == stable_int32(user.id) > 0
        assert teams[0]["isDirectMember"] is True
        assert teams[0]["name"] == PERSONAL_TEAM_NAME

    async def test_an_organization_is_a_team_its_members_share(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        await save_fixture(
            UserOrganization(user_id=user_second.id, organization_id=organization.id)
        )
        await session.commit()
        access, _ = await _signed_in(client, session, user)
        teams = (await call(client, access, "GetTeams", {})).json()["teams"]
        assert [team["name"] for team in teams] == [
            PERSONAL_TEAM_NAME,
            organization.name,
        ]
        team_id = teams[1]["id"]
        assert team_id == stable_int32(organization.id)

        published = await publish(client, access, team_id=team_id)
        assert published["marketplaceId"] == str(team_id)

        # The publisher sees it, under the team's marketplace.
        mine = await listing(client, access)
        assert [p["plugin"]["id"] for p in mine["plugins"]] == [published["pluginId"]]
        assert mine["plugins"][0]["plugin"]["marketplace"]["teamId"] == team_id
        assert (
            mine["plugins"][0]["plugin"]["marketplace"]["name"]
            == f"team-{organization.slug}"
        )
        assert mine["plugins"][0]["plugin"]["publishedByUser"] is True

        # A teammate sees it too, as someone else's.
        mate, _ = await _signed_in(client, session, user_second)
        theirs = await listing(client, mate)
        assert [p["plugin"]["id"] for p in theirs["plugins"]] == [published["pluginId"]]
        assert theirs["plugins"][0]["plugin"]["publishedByUser"] is False
        assert theirs["plugins"][0]["plugin"]["publisher"][
            "ownerUserId"
        ] == stable_int32(user.id)
        # And cannot unpublish or overwrite it.
        refused = await call(
            client,
            mate,
            "UnpublishPlugin",
            {"pluginId": published["pluginId"], "teamId": team_id},
        )
        assert refused.status_code == 403
        overwrite = await call(
            client,
            mate,
            "PublishPlugin",
            {
                "teamId": team_id,
                "name": "meeting-notes",
                "displayName": "x",
                "description": "d",
                "pluginTarGz": base64.b64encode(plugin_tar_gz()).decode(),
            },
        )
        assert overwrite.status_code == 403
        assert "by someone else" in overwrite.json()["message"]

    async def test_a_team_the_person_is_not_in_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        organization: Organization,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await call(
            client,
            access,
            "PublishPlugin",
            {
                "teamId": stable_int32(organization.id),
                "name": "n",
                "displayName": "n",
                "description": "d",
                "pluginTarGz": base64.b64encode(plugin_tar_gz()).decode(),
            },
        )
        assert response.status_code == 403
        assert (
            response.json()["message"]
            == "You are not a member of that team, so the skill cannot be published there."
        )


def test_the_user_id_the_publisher_carries_is_get_mes(user: User) -> None:
    class Caller:
        user_id = user.id

    class Call:
        caller = Caller()

    assert user_id_of(Call()) == stable_int32(user.id)  # type: ignore[arg-type]


@pytest.mark.asyncio
class TestManagedSetupAnswersEmpty:
    """The three DashboardService methods the managed-setup extension asks at
    host start (F-302): nothing managed, nothing to apply, nothing listed."""

    async def test_managed_skills_team_rules_and_marketplace_are_empty(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        for method, body in (
            ("GetManagedSkills", {}),
            ("GetTeamRules", {"teamId": 1}),
            ("ListMarketplacePlugins", {"limit": 20}),
        ):
            response = await client.post(f"/aiserver.v1.DashboardService/{method}", json=body, headers=headers)
            assert response.status_code == 200, (method, response.text)
            assert response.json() == {}
