"""Publishing a skill, and reading it back (25 September 2026).

What the app does (`desktop/source/host/extensions/mcp/skill-publish.ts`):
it packs the skill folder as a plugin (`plugin.json` + `skills/<name>/…`,
`synthesizeSkillPluginDir`), posts the tar.gz to `PublishPlugin`, then
runs the plugin sync (`plugin-skills.ts`) up to five times until
`GetEffectiveUserPlugins` lists a plugin whose `id` is the answered
`pluginId` and whose installed version equals the answered `commitSha`.
The sync installs a plugin that has no `gitUrl` from its
`inlineContentJson` (`backend-marketplace-client.ts`, `enableInlinePlugins`)
and calls its version `sha256("{plugin.id}:{plugin.updatedAt}")[:40]`.
So the contract here is: no git anywhere, the tarball's files ride back
as inline content, and the commit sha is that very hash, computed from
the same two numbers we send.

Teams are Polar's organizations (`user_organizations`). The app keeps
only teams with `id > 0 && isDirectMember`, and every publish, resync
and unpublish carries a team id, so "just me" is a team too: its id is
the person's own 31-bit user id (`dashboard.user_id_of`), and a request
with `team_id` 0 or absent means the same thing.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import posixpath
import tarfile
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog

from polar.config import settings
from polar.integrations.aws.s3 import S3Service
from polar.kit.utils import utc_now
from polar.models import Organization, SandPlugin, User
from polar.postgres import AsyncSession

from .connect import ConnectError
from .skill_registry_repository import (
    SandPluginRepository,
    SandPluginUserSettingRepository,
    organizations_of,
)

log = structlog.get_logger()

#: Limits on an upload: the app packs one skill folder.
MAX_TAR_GZ_BYTES = 10 * 1024 * 1024
MAX_UNPACKED_BYTES = 50 * 1024 * 1024
MAX_FILES = 2_000

PERSONAL_TEAM_NAME = "Just me"
PERSONAL_MARKETPLACE_SLUG = "just-me"

#: `TeamRole` in dashboard_pb.ts: OWNER 1, MEMBER 2.
TEAM_ROLE_OWNER = 1
TEAM_ROLE_MEMBER = 2
#: `PluginStatus.APPROVED`, `EffectivePluginInstallMode.USER`.
PLUGIN_STATUS_APPROVED = 3
INSTALL_MODE_USER = 1


def stable_int32(value: UUID) -> int:
    """A stable 31-bit id for a UUID, the same function `dashboard.user_id_of`
    applies to the person's id: `GetMe.userId`, `Team.id`, `Marketplace.teamId`
    and `Publisher.ownerUserId` are all int32 in the app's protos."""
    return int(value.int % 2_147_483_647) or 1


def team_id_of_organization(organization: Organization) -> int:
    return stable_int32(organization.id)


def commit_sha_of(numeric_id: int, updated_at_ms: int) -> str:
    """What the app's loader calls an inline plugin's version."""
    return hashlib.sha256(f"{numeric_id}:{updated_at_ms}".encode()).hexdigest()[:40]


@dataclass(frozen=True)
class UnpackedFile:
    path: str
    data: bytes


def unpack_plugin_tar_gz(blob: bytes) -> list[UnpackedFile]:
    """The tarball's regular files, paths normalised to `a/b/c`. Refuses
    what a hostile archive could carry: absolute paths, `..`, links,
    devices, too many files, too many bytes."""
    if not blob:
        raise ConnectError("invalid_argument", "The plugin archive is empty.")
    if len(blob) > MAX_TAR_GZ_BYTES:
        raise ConnectError(
            "invalid_argument",
            f"The plugin archive is over {MAX_TAR_GZ_BYTES // (1024 * 1024)} MB.",
        )
    files: list[UnpackedFile] = []
    total = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as archive:
            for member in archive:
                name = member.name.replace("\\", "/")
                if name.startswith("./"):
                    name = name[2:]
                normalized = posixpath.normpath(name)
                if member.isdir() or normalized in ("", "."):
                    continue
                if not member.isfile():
                    raise ConnectError(
                        "invalid_argument",
                        f"The plugin archive carries a non-file entry: {member.name}.",
                    )
                if (
                    normalized.startswith("/")
                    or normalized.startswith("../")
                    or normalized == ".."
                    or any(part in ("", ".", "..") for part in normalized.split("/"))
                ):
                    raise ConnectError(
                        "invalid_argument",
                        f"The plugin archive carries an unsafe path: {member.name}.",
                    )
                total += member.size
                if total > MAX_UNPACKED_BYTES:
                    raise ConnectError(
                        "invalid_argument",
                        f"The plugin unpacks to over {MAX_UNPACKED_BYTES // (1024 * 1024)} MB.",
                    )
                if len(files) >= MAX_FILES:
                    raise ConnectError(
                        "invalid_argument",
                        f"The plugin archive carries more than {MAX_FILES} files.",
                    )
                stream = archive.extractfile(member)
                data = stream.read() if stream is not None else b""
                files.append(UnpackedFile(path=normalized, data=data))
    except tarfile.TarError as error:
        raise ConnectError(
            "invalid_argument", f"The plugin archive is not a tar.gz: {error}"
        )
    if not files:
        raise ConnectError("invalid_argument", "The plugin archive has no files.")
    files.sort(key=lambda file: file.path)
    return files


def content_hash_of(files: Sequence[UnpackedFile]) -> str:
    digest = hashlib.sha256()
    for file in files:
        digest.update(file.path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(file.data).digest())
    return digest.hexdigest()


def inline_content_of(files: Sequence[UnpackedFile]) -> str:
    """The `inlineContentJson` the app's `synthesizeInlinePluginDir`
    writes to disk: `files`, each with a `path` and either `content`
    (text) or `contentBase64` (anything else)."""
    entries: list[dict[str, str]] = []
    for file in files:
        try:
            entries.append({"path": file.path, "content": file.data.decode("utf-8")})
        except UnicodeDecodeError:
            entries.append(
                {
                    "path": file.path,
                    "contentBase64": base64.b64encode(file.data).decode("ascii"),
                }
            )
    return json.dumps({"files": entries}, separators=(",", ":"))


def skill_paths_of(files: Sequence[UnpackedFile]) -> list[str]:
    """The `SKILL.md` entries under `skills/`, as the plugin's skill list."""
    return [
        file.path
        for file in files
        if file.path.startswith("skills/") and file.path.endswith("/SKILL.md")
    ]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _tarball_store() -> S3Service:
    return S3Service(bucket=settings.S3_FILES_BUCKET_NAME)


@dataclass(frozen=True)
class Team:
    id: int
    name: str
    slug: str
    organization: Organization | None

    @property
    def is_personal(self) -> bool:
        return self.organization is None


class SkillRegistryService:
    async def teams_of(self, session: AsyncSession, user: User) -> list[Team]:
        """The person's publish targets: themself first, then every
        organization they are in."""
        teams = [
            Team(
                id=stable_int32(user.id),
                name=PERSONAL_TEAM_NAME,
                slug=PERSONAL_MARKETPLACE_SLUG,
                organization=None,
            )
        ]
        for organization in await organizations_of(session, user.id):
            teams.append(
                Team(
                    id=team_id_of_organization(organization),
                    name=organization.name,
                    slug=f"team-{organization.slug}",
                    organization=organization,
                )
            )
        return teams

    async def resolve_team(
        self, session: AsyncSession, user: User, team_id: int | None
    ) -> Team:
        """0 or absent is the person's own account."""
        teams = await self.teams_of(session, user)
        if team_id is None or team_id <= 0:
            return teams[0]
        for team in teams:
            if team.id == team_id:
                return team
        raise ConnectError(
            "permission_denied",
            "You are not a member of that team, so the skill cannot be published there.",
        )

    def team_of_plugin(self, teams: Sequence[Team], plugin: SandPlugin) -> Team | None:
        for team in teams:
            if plugin.organization_id is None and team.is_personal:
                return team
            if (
                team.organization is not None
                and plugin.organization_id == team.organization.id
            ):
                return team
        return None

    async def publish(
        self,
        session: AsyncSession,
        user: User,
        *,
        team_id: int | None,
        name: str,
        display_name: str,
        description: str,
        plugin_tar_gz: bytes,
        commit_message: str = "",
    ) -> tuple[SandPlugin, Team]:
        name = name.strip()
        if not name:
            raise ConnectError("invalid_argument", "The plugin needs a name.")
        team = await self.resolve_team(session, user, team_id)
        files = unpack_plugin_tar_gz(plugin_tar_gz)
        if not skill_paths_of(files):
            raise ConnectError(
                "invalid_argument",
                "The plugin archive carries no skills/<name>/SKILL.md.",
            )
        repository = SandPluginRepository.from_session(session)
        existing = (
            await repository.get_personal_by_name(user.id, name)
            if team.is_personal
            else await repository.get_team_by_name(team.organization.id, name)  # type: ignore[union-attr]
        )
        if existing is not None and existing.owner_user_id != user.id:
            raise ConnectError(
                "permission_denied",
                f'"{name}" was published to {team.name} by someone else; only they can update it.',
            )
        now_ms = _now_ms()
        if existing is not None and now_ms <= existing.updated_at_ms:
            now_ms = existing.updated_at_ms + 1
        plugin = existing or SandPlugin(
            name=name,
            owner_user_id=user.id,
            organization_id=None if team.organization is None else team.organization.id,
            # Computed from `numeric_id`, which the insert assigns.
            commit_sha="",
        )
        plugin.display_name = (display_name or name).strip()[:200]
        plugin.description = description
        plugin.content_hash = content_hash_of(files)
        plugin.updated_at_ms = now_ms
        plugin.inline_content_json = inline_content_of(files)
        plugin.commit_message = commit_message or ""
        plugin.unpublished_at = None
        if existing is None:
            await repository.create(plugin, flush=True)
        else:
            await session.flush()
        plugin.commit_sha = commit_sha_of(plugin.numeric_id, plugin.updated_at_ms)
        plugin.tar_gz_key = self._store_tarball(plugin, plugin_tar_gz)
        await session.flush()
        log.info(
            "sand.skill_registry.published",
            plugin_id=plugin.numeric_id,
            name=name,
            team_id=team.id,
            personal=team.is_personal,
            commit_sha=plugin.commit_sha,
            files=len(files),
            stored=plugin.tar_gz_key is not None,
        )
        return plugin, team

    def _store_tarball(self, plugin: SandPlugin, blob: bytes) -> str | None:
        """The upload, kept as it arrived. The inline JSON is the content
        of record, so an S3 that does not answer costs the copy and not
        the publish; the log line says which."""
        key = f"sand-plugins/{plugin.owner_user_id}/{plugin.numeric_id}/{plugin.content_hash}.tgz"
        try:
            _tarball_store().upload(blob, key, "application/gzip")
            return key
        except Exception as error:
            log.warning(
                "sand.skill_registry.tarball_not_stored",
                plugin_id=plugin.numeric_id,
                key=key,
                error=str(error),
            )
            return None

    async def unpublish(
        self, session: AsyncSession, user: User, *, plugin_id: int, team_id: int | None
    ) -> str:
        repository = SandPluginRepository.from_session(session)
        plugin = await repository.get_by_numeric_id(plugin_id)
        if plugin is None:
            raise ConnectError("not_found", "That plugin is no longer published.")
        if plugin.owner_user_id != user.id:
            raise ConnectError(
                "permission_denied",
                f'"{plugin.display_name}" was published by someone else; only they can unpublish it.',
            )
        now = utc_now()
        plugin.unpublished_at = now
        plugin.set_deleted_at()
        plugin.updated_at_ms = max(_now_ms(), plugin.updated_at_ms + 1)
        plugin.commit_sha = commit_sha_of(plugin.numeric_id, plugin.updated_at_ms)
        await session.flush()
        log.info(
            "sand.skill_registry.unpublished",
            plugin_id=plugin.numeric_id,
            name=plugin.name,
            commit_sha=plugin.commit_sha,
        )
        return plugin.commit_sha

    async def effective_plugins(
        self, session: AsyncSession, user: User, *, team_id: int | None
    ) -> dict[str, Any]:
        """`GetEffectiveUserPluginsResponse`, field names as the generated
        proto spells them in JSON, int64 as strings."""
        teams = await self.teams_of(session, user)
        if team_id is not None and team_id > 0:
            teams = [team for team in teams if team.id == team_id]
        organization_ids = [
            team.organization.id for team in teams if team.organization is not None
        ]
        include_personal = any(team.is_personal for team in teams)
        repository = SandPluginRepository.from_session(session)
        plugins = await repository.list_visible_to(user.id, organization_ids)
        settings_repository = SandPluginUserSettingRepository.from_session(session)
        disabled = {
            setting.plugin_id
            for setting in await settings_repository.list_for_user(user.id)
            if not setting.is_enabled
        }
        listed: list[dict[str, Any]] = []
        marketplaces: dict[int, dict[str, Any]] = {}
        for plugin in plugins:
            if plugin.is_personal and not include_personal:
                continue
            team = self.team_of_plugin(teams, plugin)
            if team is None:
                continue
            marketplace = self.marketplace_json(team)
            marketplaces.setdefault(team.id, marketplace)
            listed.append(
                {
                    "plugin": self.plugin_json(plugin, team, user, marketplace),
                    "isTeamRequired": False,
                    "isEnabled": plugin.id not in disabled,
                    "pinnedGitRef": plugin.commit_sha,
                    "configuredVariables": {},
                    "hasTeamConfiguredVariables": False,
                    "inlineContentJson": plugin.inline_content_json,
                    "installMode": INSTALL_MODE_USER,
                }
            )
        return {"plugins": listed, "marketplaces": list(marketplaces.values())}

    def marketplace_json(self, team: Team) -> dict[str, Any]:
        """One marketplace per team. `name` is the cache folder on the Mac
        and in the box (`getPluginInstallCachePath`), so it is a slug."""
        return {
            "id": str(team.id),
            "name": team.slug,
            "displayName": team.name,
            "description": (
                "Skills you published to your own account"
                if team.is_personal
                else f"Skills published to {team.name}"
            ),
            "gitUrl": "",
            "userId": team.id if team.is_personal else None,
            "teamId": team.id,
            "createdAt": "0",
            "updatedAt": "0",
            "autoReindex": False,
            "isDefault": True,
            "allowUserPublish": True,
        }

    def plugin_json(
        self, plugin: SandPlugin, team: Team, viewer: User, marketplace: dict[str, Any]
    ) -> dict[str, Any]:
        owner_id = stable_int32(plugin.owner_user_id)
        skill_files = json.loads(plugin.inline_content_json).get("files", [])
        skills = [
            {
                "name": posixpath.basename(posixpath.dirname(file["path"])),
                "sourcePath": file["path"],
            }
            for file in skill_files
            if file["path"].startswith("skills/") and file["path"].endswith("/SKILL.md")
        ]
        return {
            "id": str(plugin.numeric_id),
            "name": plugin.name,
            "displayName": plugin.display_name,
            "description": plugin.description,
            "status": PLUGIN_STATUS_APPROVED,
            "isPublished": True,
            "createdAt": str(int(plugin.created_at.timestamp() * 1000)),
            "updatedAt": str(plugin.updated_at_ms),
            "publisherId": str(owner_id),
            "publisher": {
                "id": str(owner_id),
                "name": PERSONAL_MARKETPLACE_SLUG if team.is_personal else team.slug,
                "displayName": team.name,
                "ownerUserId": owner_id,
                "ownerTeamId": None if team.is_personal else team.id,
                "isUserOwned": team.is_personal,
            },
            "marketplaceId": marketplace["id"],
            "marketplace": marketplace,
            "gitUrl": "",
            "gitRef": plugin.commit_sha,
            "gitPath": "",
            "fullRef": plugin.commit_sha,
            "skills": skills,
            "publishedByUser": plugin.owner_user_id == viewer.id,
        }


skill_registry = SkillRegistryService()
