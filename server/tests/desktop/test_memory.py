"""The shared memory: the version dance, the caps and the sync over HTTP
(`polar/desktop/service.py`, `polar/desktop/endpoints.py`)."""

import httpx
import pytest
from pytest_mock import MockerFixture

from polar.desktop.service import (
    MEMORY_FILE_MAX_BYTES,
    DesktopMemoryRefused,
    IncomingMemoryFile,
    desktop,
)
from polar.models import DesktopMemoryFile, User
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture


async def _bearer(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    """The header a signed-in desktop sends, through the auth code."""
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post("/desktop/api/auth/exchange", json={"authCode": code})
    body = response.json()
    assert body["code"] == 0, body
    return {"Authorization": f"Bearer {body['data']['accessToken']}"}


def _sent(name: str, content: str, base_version: int = 0) -> IncomingMemoryFile:
    return IncomingMemoryFile(name=name, content=content, base_version=base_version)


@pytest.mark.asyncio
class TestSyncMemoryFiles:
    async def test_a_file_claidor_does_not_have_is_stored_as_sent_at_version_1(
        self, session: AsyncSession, user: User
    ) -> None:
        synced = await desktop.sync_memory_files(
            session, user, [_sent("MEMORY.md", "- Ships on Fridays\n")]
        )
        assert [(one.name, one.version, one.changed) for one in synced.files] == [
            ("MEMORY.md", 1, False)
        ]
        assert synced.files[0].content == "- Ships on Fridays\n"
        assert synced.deleted == []

    async def test_a_base_that_matches_stores_the_client_s_text(
        self, session: AsyncSession, user: User
    ) -> None:
        await desktop.sync_memory_files(session, user, [_sent("USER.md", "Amina\n")])
        synced = await desktop.sync_memory_files(
            session, user, [_sent("USER.md", "Amina, in Dakar\n", 1)]
        )
        assert synced.files[0].content == "Amina, in Dakar\n"
        assert synced.files[0].version == 2
        assert synced.files[0].changed is False

    async def test_a_stale_base_merges_and_neither_side_loses_a_fact(
        self, session: AsyncSession, user: User
    ) -> None:
        await desktop.sync_memory_files(
            session, user, [_sent("MEMORY.md", "- Ships on Fridays\n")]
        )
        # Another machine wrote in between, so the row is at version 2…
        await desktop.sync_memory_files(
            session,
            user,
            [_sent("MEMORY.md", "- Ships on Fridays\n- Dog named Ada\n", 1)],
        )
        # …and this one still believes in version 1.
        synced = await desktop.sync_memory_files(
            session,
            user,
            [_sent("MEMORY.md", "- Ships on Fridays\n- Stand-up at 9\n", 1)],
        )
        file = synced.files[0]
        assert file.version == 3
        assert file.changed is True
        assert file.content.splitlines() == [
            "- Ships on Fridays",
            "- Dog named Ada",
            "- Stand-up at 9",
        ]

    async def test_a_fact_written_on_both_sides_is_stored_once(
        self, session: AsyncSession, user: User
    ) -> None:
        await desktop.sync_memory_files(
            session, user, [_sent("MEMORY.md", "- Ships on Fridays\n")]
        )
        await desktop.sync_memory_files(
            session, user, [_sent("MEMORY.md", "- Ships on Fridays\n- Ada\n", 1)]
        )
        synced = await desktop.sync_memory_files(
            session,
            user,
            [_sent("MEMORY.md", "- ships on Fridays!\n- Stand-up at 9\n", 1)],
        )
        assert synced.files[0].content.count("Fridays") == 1

    async def test_a_daily_note_appended_on_both_sides_keeps_both_lines(
        self, session: AsyncSession, user: User
    ) -> None:
        name = "memory/2026-09-11.md"
        await desktop.sync_memory_files(session, user, [_sent(name, "- 09:00 plan\n")])
        await desktop.sync_memory_files(
            session, user, [_sent(name, "- 09:00 plan\n- 10:00 Marie\n", 1)]
        )
        synced = await desktop.sync_memory_files(
            session, user, [_sent(name, "- 09:00 plan\n- 11:30 flight\n", 1)]
        )
        assert synced.files[0].content.splitlines() == [
            "- 09:00 plan",
            "- 10:00 Marie",
            "- 11:30 flight",
        ]

    async def test_a_sync_that_changes_nothing_leaves_the_version_alone(
        self, session: AsyncSession, user: User
    ) -> None:
        await desktop.sync_memory_files(session, user, [_sent("USER.md", "Amina\n")])
        for _ in range(3):
            synced = await desktop.sync_memory_files(
                session, user, [_sent("USER.md", "Amina\n", 1)]
            )
        assert synced.files[0].version == 1
        assert synced.files[0].changed is False

    async def test_an_empty_sync_hands_back_the_whole_memory_as_changed(
        self, session: AsyncSession, user: User
    ) -> None:
        """A fresh computer receives everything by sending nothing."""
        await desktop.sync_memory_files(
            session,
            user,
            [_sent("MEMORY.md", "- Ships on Fridays\n"), _sent("USER.md", "Amina\n")],
        )
        synced = await desktop.sync_memory_files(session, user, [])
        assert [(one.name, one.changed) for one in synced.files] == [
            ("MEMORY.md", True),
            ("USER.md", True),
        ]

    async def test_a_name_claidor_does_not_keep_refuses_the_whole_sync(
        self, session: AsyncSession, user: User
    ) -> None:
        with pytest.raises(DesktopMemoryRefused):
            await desktop.sync_memory_files(
                session,
                user,
                [
                    _sent("MEMORY.md", "- Ships on Fridays\n"),
                    _sent("../../etc/passwd", "root\n"),
                ],
            )
        assert await desktop.list_memory_files(session, user) == []

    async def test_a_file_over_a_megabyte_is_refused(
        self, session: AsyncSession, user: User
    ) -> None:
        with pytest.raises(DesktopMemoryRefused, match="larger than"):
            await desktop.sync_memory_files(
                session,
                user,
                [_sent("MEMORY.md", "x" * (MEMORY_FILE_MAX_BYTES + 1))],
            )
        assert await desktop.list_memory_files(session, user) == []

    async def test_a_request_over_eight_megabytes_is_refused(
        self, session: AsyncSession, user: User
    ) -> None:
        with pytest.raises(DesktopMemoryRefused, match="MB of memory"):
            await desktop.sync_memory_files(
                session,
                user,
                [
                    _sent(f"memory/2026-09-{day:02d}.md", "x" * MEMORY_FILE_MAX_BYTES)
                    for day in range(1, 10)
                ],
            )
        assert await desktop.list_memory_files(session, user) == []

    async def test_the_oldest_daily_notes_go_when_there_are_too_many(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        mocker.patch("polar.desktop.service.MEMORY_FILE_LIMIT", 3)
        synced = await desktop.sync_memory_files(
            session,
            user,
            [
                _sent("MEMORY.md", "- Ships on Fridays\n"),
                _sent("USER.md", "Amina\n"),
                *(
                    _sent(f"memory/2026-09-{day:02d}.md", f"- day {day}\n")
                    for day in range(1, 4)
                ),
            ],
        )
        assert synced.deleted == ["memory/2026-09-01.md", "memory/2026-09-02.md"]
        assert [one.name for one in synced.files] == [
            "MEMORY.md",
            "USER.md",
            "memory/2026-09-03.md",
        ]

    async def test_one_person_s_memory_is_their_own(
        self, session: AsyncSession, user: User, user_second: User
    ) -> None:
        await desktop.sync_memory_files(session, user, [_sent("USER.md", "Amina\n")])
        await desktop.sync_memory_files(
            session, user_second, [_sent("USER.md", "Marie\n")]
        )
        mine = await desktop.sync_memory_files(session, user, [])
        assert [one.content for one in mine.files] == ["Amina\n"]

    # The app's own layout (25 September 2026).

    async def test_the_app_s_fact_files_are_kept_under_their_own_names(
        self, session: AsyncSession, user: User
    ) -> None:
        synced = await desktop.sync_memory_files(
            session,
            user,
            [
                _sent(
                    "agents/a1/memory/profile.md",
                    "# About the user\n\n- (2026-09-20) The founder is called Bass.\n",
                ),
                _sent("agents/a1/memory/log/2026-09.md", "- (2026-09-24) Dakar.\n"),
                _sent("user-memory/agents/a1/profile.md", "- (2026-09-24) Bass.\n"),
                _sent("projects/launch/project.md", "---\nname: Launch\n---\n"),
            ],
        )
        assert [(one.name, one.version) for one in synced.files] == [
            ("agents/a1/memory/log/2026-09.md", 1),
            ("agents/a1/memory/profile.md", 1),
            ("projects/launch/project.md", 1),
            ("user-memory/agents/a1/profile.md", 1),
        ]

    async def test_two_machines_never_hold_a_fact_twice(
        self, session: AsyncSession, user: User
    ) -> None:
        """The union is by the app's fact id, so the date does not count."""
        name = "agents/a1/memory/profile.md"
        await desktop.sync_memory_files(
            session, user, [_sent(name, "- (2026-09-20) The founder is called Bass.\n")]
        )
        await desktop.sync_memory_files(
            session,
            user,
            [
                _sent(
                    name,
                    "- (2026-09-20) The founder is called Bass.\n"
                    "- (2026-09-21) Ships on Fridays.\n",
                    1,
                )
            ],
        )
        synced = await desktop.sync_memory_files(
            session,
            user,
            [
                _sent(
                    name,
                    "- (2026-09-24) the founder is called Bass.\n"
                    "- (2026-09-24) Dog named Ada.\n",
                    1,
                )
            ],
        )
        assert synced.files[0].version == 3
        assert synced.files[0].content.splitlines() == [
            "- (2026-09-20) The founder is called Bass.",
            "- (2026-09-21) Ships on Fridays.",
            "- (2026-09-24) Dog named Ada.",
        ]

    async def test_a_deleted_name_is_told_to_the_other_machine(
        self, session: AsyncSession, user: User
    ) -> None:
        name = "agents/a1/memory/log/2026-08.md"
        await desktop.sync_memory_files(
            session, user, [_sent(name, "- (2026-08-01) x\n")]
        )
        gone = await desktop.sync_memory_files(session, user, [], deleted=[name])
        assert gone.files == []
        assert gone.deleted == [name]
        # The other machine, which still has it and has not written it,
        # hears the name under `deleted` and sees no file.
        other = await desktop.sync_memory_files(session, user, [])
        assert other.deleted == [name]
        assert other.files == []
        # A machine that is behind and sends the file again keeps nothing:
        # the deletion stands.
        behind = await desktop.sync_memory_files(
            session, user, [_sent(name, "- (2026-08-01) x\n", 1)]
        )
        assert behind.files == []
        assert behind.deleted == [name]
        # A machine that saw the deletion (base_version 2) may write the
        # name again, as a new file.
        again = await desktop.sync_memory_files(
            session, user, [_sent(name, "- (2026-08-02) y\n", 2)]
        )
        assert [(one.name, one.version) for one in again.files] == [(name, 3)]
        assert again.deleted == []

    async def test_deleting_what_is_not_there_is_nothing(
        self, session: AsyncSession, user: User
    ) -> None:
        synced = await desktop.sync_memory_files(
            session, user, [], deleted=["agents/a1/memory/profile.md"]
        )
        assert synced.deleted == []
        assert await desktop.list_memory_files(session, user) == []

    async def test_a_deleted_name_claidor_does_not_keep_refuses_the_sync(
        self, session: AsyncSession, user: User
    ) -> None:
        with pytest.raises(DesktopMemoryRefused):
            await desktop.sync_memory_files(
                session, user, [], deleted=["agents/a1/memory/.dreaming/x"]
            )

    async def test_an_old_tombstone_is_forgotten(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        name = "agents/a1/memory/log/2026-08.md"
        await desktop.sync_memory_files(
            session, user, [_sent(name, "- (2026-08-01) x\n")]
        )
        await desktop.sync_memory_files(session, user, [], deleted=[name])
        mocker.patch("polar.desktop.service.MEMORY_TOMBSTONE_DAYS", -1)
        assert (await desktop.sync_memory_files(session, user, [])).deleted == []
        # Once forgotten, the name is a new file from anyone.
        again = await desktop.sync_memory_files(session, user, [_sent(name, "- x\n")])
        assert [(one.name, one.version) for one in again.files] == [(name, 1)]


@pytest.mark.asyncio
class TestMemoryEndpoints:
    async def test_the_sync_merges_and_answers_with_everything(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _bearer(client, session, user)

        first = await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={
                "files": [
                    {
                        "name": "MEMORY.md",
                        "content": "- Ships on Fridays\n",
                        "base_version": 0,
                    },
                    {
                        "name": "memory/2026-09-11.md",
                        "content": "- 09:00 plan\n",
                        "base_version": 0,
                    },
                ]
            },
        )
        assert first.status_code == 200
        body = first.json()
        assert body["deleted"] == []
        assert [
            (one["name"], one["version"], one["changed"]) for one in body["files"]
        ] == [
            ("MEMORY.md", 1, False),
            ("memory/2026-09-11.md", 1, False),
        ]

        # A second computer, which has never seen any of this, sends one
        # fact of its own at base_version 0.
        second = await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={"files": [{"name": "MEMORY.md", "content": "- Dog named Ada\n"}]},
        )
        files = {one["name"]: one for one in second.json()["files"]}
        assert files["MEMORY.md"]["version"] == 2
        assert files["MEMORY.md"]["changed"] is True
        assert files["MEMORY.md"]["content"].splitlines() == [
            "- Ships on Fridays",
            "- Dog named Ada",
        ]
        assert files["memory/2026-09-11.md"]["changed"] is True
        assert files["memory/2026-09-11.md"]["content"] == "- 09:00 plan\n"

    async def test_the_listing_gives_names_versions_and_sizes_only(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _bearer(client, session, user)
        await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={"files": [{"name": "USER.md", "content": "Amina\n"}]},
        )
        listed = await client.get("/desktop/api/memory", headers=headers)
        assert listed.status_code == 200
        assert listed.json() == {
            "files": [{"name": "USER.md", "version": 1, "size": 6}]
        }

    async def test_a_name_claidor_does_not_keep_is_refused_on_the_wire(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _bearer(client, session, user)
        response = await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={"files": [{"name": "../../etc/passwd", "content": "root\n"}]},
        )
        assert response.status_code == 400
        assert response.json()["code"] == 40001

    async def test_the_app_s_names_and_deletions_travel_the_wire(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _bearer(client, session, user)
        first = await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={
                "files": [
                    {
                        "name": "agents/a1/memory/profile.md",
                        "content": "- (2026-09-20) Bass.\n",
                    },
                    {
                        "name": "agents/a1/memory/log/2026-09.md",
                        "content": "- (2026-09-24) Dakar.\n",
                    },
                ]
            },
        )
        assert first.status_code == 200, first.text
        second = await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={"files": [], "deleted": ["agents/a1/memory/log/2026-09.md"]},
        )
        assert second.status_code == 200, second.text
        assert second.json() == {
            "files": [
                {
                    "name": "agents/a1/memory/profile.md",
                    "content": "- (2026-09-20) Bass.\n",
                    "version": 1,
                    "changed": True,
                }
            ],
            "deleted": ["agents/a1/memory/log/2026-09.md"],
        }
        listed = await client.get("/desktop/api/memory", headers=headers)
        assert [one["name"] for one in listed.json()["files"]] == [
            "agents/a1/memory/profile.md"
        ]

    async def test_the_box_s_credential_reaches_the_memory(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        """The host that keeps the memory files runs in the box
        (`host/extensions/memory-sync/`), with the box's own credential."""
        from .test_box_credential import _box_credential

        mac = await _bearer(client, session, user)
        issued = await _box_credential(client, mac["Authorization"].split(" ", 1)[1])
        traded = await client.post(
            "/sand-box/inference-credential", json={"credential": issued["credential"]}
        )
        box = {"Authorization": f"Bearer {traded.json()['accessToken']}"}
        synced = await client.post(
            "/desktop/api/memory/sync",
            headers=box,
            json={
                "files": [
                    {
                        "name": "agents/a1/memory/profile.md",
                        "content": "- (2026-09-20) Bass.\n",
                    }
                ]
            },
        )
        assert synced.status_code == 200, synced.text
        assert (await client.get("/desktop/api/memory", headers=box)).status_code == 200
        # The Mac sees what the box wrote: one memory per person.
        assert [
            one["name"]
            for one in (await client.get("/desktop/api/memory", headers=mac)).json()[
                "files"
            ]
        ] == ["agents/a1/memory/profile.md"]

    async def test_no_bearer_reaches_the_memory(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        assert (
            await client.post("/desktop/api/memory/sync", json={"files": []})
        ).status_code == 401
        assert (await client.get("/desktop/api/memory")).status_code == 401
        assert (
            await client.get(
                "/desktop/api/memory", headers={"Authorization": "Bearer nope"}
            )
        ).status_code == 401


@pytest.mark.asyncio
class TestMemoryRows:
    async def test_one_row_per_person_per_name(
        self, save_fixture: SaveFixture, session: AsyncSession, user: User
    ) -> None:
        await save_fixture(
            DesktopMemoryFile(
                user_id=user.id, name="MEMORY.md", content="- one\n", version=1
            )
        )
        synced = await desktop.sync_memory_files(
            session, user, [_sent("MEMORY.md", "- two\n", 1)]
        )
        assert len(await desktop.list_memory_files(session, user)) == 1
        assert synced.files[0].content == "- two\n"
        assert synced.files[0].version == 2
