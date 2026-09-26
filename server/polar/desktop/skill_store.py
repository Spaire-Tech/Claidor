"""The skill store: Anthropic's Apache-licensed skills, served to the app.

The skills live next to this module under `skills/<name>/`, copied from
https://github.com/anthropics/skills at the commit named in
`skills/NOTICE`, and `skills/catalog.json` says which ones are offered,
with what description and tags, and at what version.

*26 September 2026 (ledger F-186, F-194): the app described below is the
LobsterAI-era one, which left the tree on 18 September; nothing in the
current app calls this store, whose skills are Anthropic's developer
skills rather than a consumer assistant's. It stays served; which skills
Simeon's agents carry, and by what path into the box, is a product
decision. The agent's skills today are its workflow library
(`desktop/source/host/runner/workflow-agent-skills.ts`).*

The desktop app read the catalogue as `marketplace` items
(`desktop/src/renderer/types/skill.ts`, `MarketplaceSkill`) and installed
one by fetching its `url`, which must end in `.zip`
(`desktop/src/main/skills/skillManager.ts`, `isRemoteZipUrl`). The
archive is extracted, and when it holds exactly one top-level directory
that directory is the skill, installed under its own name
(`downloadZipUrl`, `collectSkillDirsFromSource`). So every archive here
is `<name>/SKILL.md` and the rest of the skill beside it.

The version: the app reads `version` from the installed SKILL.md's
frontmatter and compares it with the catalogue's to offer an update
(`getSkillVersion`; `getSkillInstallStatus` in `SkillsManager.tsx`). The
upstream files carry no version, so an installed copy would read as
`0.0.0` and the store would offer an update forever. The archive
therefore adds one line to the frontmatter, and the files at rest stay
byte-identical to upstream.
"""

from __future__ import annotations

import functools
import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SKILLS_ROOT = Path(__file__).with_name("skills")
CATALOG_PATH = SKILLS_ROOT / "catalog.json"
SKILL_FILE = "SKILL.md"

#: The names the upstream repository holds under a licence that is not
#: Apache-2.0, or none. Kept here so a test can hold the catalogue against
#: them; the reasons are in `skills/NOTICE`.
NOT_OFFERED = frozenset({"docx", "pdf", "pptx", "xlsx", "doc-coauthoring"})

FRONTMATTER_OPEN = "---\n"


@dataclass(frozen=True)
class CatalogSkill:
    name: str
    description: str
    tags: tuple[str, ...]
    #: True when the desktop app ships its own copy of this skill. The
    #: app's copy is the one it repairs from at every start
    #: (`syncBundledSkillsToUserData`), so no version is advertised for
    #: these and no update is ever offered against the bundle: the store
    #: shows them as installed, and offers them only to a person who has
    #: deleted the bundled copy.
    bundled_in_app: bool

    @property
    def directory(self) -> Path:
        return SKILLS_ROOT / self.name


@dataclass(frozen=True)
class Catalog:
    version: str
    tags: tuple[dict[str, str], ...]
    skills: tuple[CatalogSkill, ...]

    def get(self, name: str) -> CatalogSkill | None:
        for skill in self.skills:
            if skill.name == name:
                return skill
        return None


@functools.cache
def catalog() -> Catalog:
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return Catalog(
        version=str(raw["version"]),
        tags=tuple(
            {"id": str(t["id"]), "en": str(t["en"]), "zh": str(t["zh"])}
            for t in raw["tags"]
        ),
        skills=tuple(
            CatalogSkill(
                name=str(s["name"]),
                description=str(s["description"]),
                tags=tuple(str(t) for t in s.get("tags", ())),
                bundled_in_app=bool(s.get("bundled_in_app", False)),
            )
            for s in raw["skills"]
        ),
    )


def archive_path(name: str) -> str:
    """The path, under the desktop router, at which `name` is downloaded."""
    return f"/desktop/api/skill-store/{name}.zip"


def marketplace_item(skill: CatalogSkill, archive_url: str) -> dict[str, Any]:
    """One `MarketplaceSkill` as the app reads it. `id` is the directory
    the app installs into, so it is the skill's name; `source` is where a
    person is sent to read it, and is required by the app's detail view."""
    return {
        "id": skill.name,
        "name": skill.name,
        "description": skill.description,
        "tags": list(skill.tags),
        "url": archive_url,
        "version": "" if skill.bundled_in_app else catalog().version,
        "source": {
            "from": "GitHub",
            "url": f"https://github.com/anthropics/skills/tree/main/skills/{skill.name}",
            "author": "Anthropic",
        },
    }


def skill_md_with_version(raw: str, version: str) -> str:
    """The SKILL.md text with `version` in its frontmatter.

    Every vendored SKILL.md opens with a YAML frontmatter block and none
    carries a `version` or `metadata` key (a test holds this), so the line
    goes in right after the opening fence, where the app's YAML parser
    reads it as a top-level key. A file without a frontmatter is returned
    untouched rather than given one: that would be inventing a skill.
    """
    text = raw.removeprefix("﻿")
    if not text.startswith(FRONTMATTER_OPEN):
        return raw
    return (
        FRONTMATTER_OPEN
        + f"version: {json.dumps(version)}\n"
        + text[len(FRONTMATTER_OPEN) :]
    )


@functools.cache
def archive(name: str) -> bytes | None:
    """The zip the app downloads for `name`, or None when the catalogue
    does not offer it. Built once per process: the files never change
    while it runs."""
    skill = catalog().get(name)
    if skill is None:
        return None
    root = skill.directory
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(p for p in root.rglob("*") if p.is_file()):
            arcname = f"{name}/{file.relative_to(root).as_posix()}"
            if file.name == SKILL_FILE and file.parent == root:
                zf.writestr(
                    arcname,
                    skill_md_with_version(
                        file.read_text(encoding="utf-8"), catalog().version
                    ),
                )
            else:
                zf.write(file, arcname)
    return buffer.getvalue()
