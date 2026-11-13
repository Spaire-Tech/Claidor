"""A cloud agent's coding work done by the person's own computer
(`simeon/sand/cloud_agents_computer.py`, 11 November 2026).

The app's side speaks `CloudAgentService` as before; a launch from an engine
that runs the work on the computer carries `usePrivateWorker` and the
`executor: computer` label. Every call below is what that engine sends
(`host/extensions/cloud-agents/cloud-agents-service.ts` for the launch,
`host/cloud-agents/coding-runner.ts` for the computer's side), and every
assertion reads the field the client reads.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.sand.cloud_agents_computer import (
    UPDATES_KEPT,
    UPDATES_PER_TURN,
    ComputerUpdate,
    ComputerWork,
    merged_updates,
    merged_work,
)
from tests.sand.test_cloud_agents import (
    BC,
    RUNNER,
    RUNNER_TOKEN,
    _headers,
    _launch,
    _user_message,
)

COMPUTER = "/desktop/api/cloud-agents/computer"
ON_COMPUTER = {
    "usePrivateWorker": True,
    "labels": [{"key": "executor", "value": "computer"}],
}


@pytest.fixture(autouse=True)
def configured_runner(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "MATY_RUNNER_TOKEN", RUNNER_TOKEN)


async def _start(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    prompt: str = "Fix the login bug.",
) -> str:
    bc_id = f"bc-{uuid4()}"
    started = await client.post(
        f"{BC}/StartBackgroundComposerFromSnapshot",
        json=_launch(bc_id, prompt, name="Login fix", **ON_COMPUTER),
        headers=headers,
    )
    assert started.status_code == 200, started.text
    return bc_id


async def _computer_claim(
    client: httpx.AsyncClient, headers: dict[str, str], runner: str = "computer-1"
) -> dict[str, Any] | None:
    response = await client.post(
        f"{COMPUTER}/claim", headers=headers, json={"runner": runner}
    )
    assert response.status_code == 200, response.text
    job: dict[str, Any] | None = response.json()["job"]
    return job


async def _info(
    client: httpx.AsyncClient, headers: dict[str, str], bc_id: str
) -> dict[str, Any]:
    response = await client.post(
        f"{BC}/GetBackgroundComposerInfo",
        json={
            "bcId": bc_id,
            "includeDiff": False,
            "doNotThrowIfSetupNotFinished": True,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    composer: dict[str, Any] = response.json()["composer"]
    return composer


WORK = {
    "branchName": "simeon/login-fix-3f2a",
    "baseBranch": "main",
    "prUrl": "https://github.com/simeonlabs/demo/pull/412",
    "prNumber": 412,
    "prState": "open",
    "linesAdded": 42,
    "linesRemoved": 7,
    "filesChanged": 2,
    "commitCount": 3,
    "files": [
        {"path": "src/login.ts", "added": 40, "removed": 5},
        {"path": "src/login.test.ts", "added": 2, "removed": 2},
    ],
    "sessionId": "5f0e7c3a-9a1b-4c2d-8e3f-0a1b2c3d4e5f",
}


@pytest.mark.asyncio
class TestWhichMachine:
    async def test_the_computer_takes_it_and_the_cloud_runner_never_does(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)

        runner = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        assert runner.status_code == 200
        assert runner.json().get("job") is None, "the cloud runner leaves it"

        job = await _computer_claim(client, headers)
        assert job is not None
        assert job["bcId"] == bc_id
        assert job["repoUrl"] == "https://github.com/simeonlabs/demo"
        assert job["baseBranch"] == "main"
        assert job["conversation"][0]["text"] == "Fix the login bug."
        assert (await _info(client, headers, bc_id))["composer"]["status"] == 1

    async def test_an_older_engine_s_launch_still_goes_to_the_cloud_runner(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        started = await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(f"bc-{uuid4()}", "Summarise the README."),
            headers=headers,
        )
        assert started.status_code == 200
        assert await _computer_claim(client, headers) is None
        runner = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        assert runner.json()["job"]["executor"] == "maty-runner"

    async def test_a_computer_takes_only_its_own_person_s_work(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        mine = await _headers(client, session, user)
        theirs = await _headers(client, session, user_second)
        await _start(client, mine)
        assert await _computer_claim(client, theirs) is None
        assert await _computer_claim(client, mine) is not None

    async def test_a_launch_on_the_computer_needs_no_cloud_runner(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "MATY_RUNNER_TOKEN", "")
        headers = await _headers(client, session, user)
        await _start(client, headers)
        assert await _computer_claim(client, headers) is not None

    async def test_somebody_else_s_job_is_not_found(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        mine = await _headers(client, session, user)
        theirs = await _headers(client, session, user_second)
        await _start(client, mine)
        job = await _computer_claim(client, mine)
        assert job is not None
        response = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=theirs,
            json={"runner": "computer-1"},
        )
        assert response.status_code == 404


@pytest.mark.asyncio
class TestTheWorkReadBack:
    async def test_branch_pull_request_and_changes_reach_the_card(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None

        beat = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={"runner": "computer-1", "work": {"branchName": WORK["branchName"]}},
        )
        assert beat.status_code == 200, beat.text
        assert beat.json()["cancelRequested"] is False
        assert (await _info(client, headers, bc_id))["composer"]["branchName"] == WORK[
            "branchName"
        ]

        done = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/complete",
            headers=headers,
            json={
                "runner": "computer-1",
                "result": "Fixed the login redirect; the tests pass.",
                "messages": [
                    {
                        "role": "assistant",
                        "text": "Fixed the login redirect; the tests pass.",
                    }
                ],
                "work": WORK,
            },
        )
        assert done.status_code == 200, done.text

        detailed = await _info(client, headers, bc_id)
        composer = detailed["composer"]
        assert composer["status"] == 2
        assert composer["prUrl"] == WORK["prUrl"]
        assert composer["branchName"] == WORK["branchName"]
        assert (composer["linesAdded"], composer["linesRemoved"]) == (42, 7)
        assert (composer["filesChanged"], composer["commitCount"]) == (2, 3)
        assert detailed["prs"] == [
            {
                "prUrl": WORK["prUrl"],
                "branchName": WORK["branchName"],
                "pullNumber": 412,
                "prStatus": 1,
            }
        ]
        assert detailed["autoCreatePr"] is True
        assert detailed["summary"] == "Fixed the login redirect; the tests pass."

        diff = await client.post(
            f"{BC}/GetOptimizedDiffDetails",
            json={"bcId": bc_id, "excludeBeforeAfterDiffs": True},
            headers=headers,
        )
        assert diff.json()["diff"]["diffs"] == [
            {"from": "src/login.ts", "to": "src/login.ts", "added": 40, "removed": 5},
            {
                "from": "src/login.test.ts",
                "to": "src/login.test.ts",
                "added": 2,
                "removed": 2,
            },
        ]

        status = await client.post(
            f"{BC}/GetPullRequestMergeStatus",
            json={"prUrl": WORK["prUrl"]},
            headers=headers,
        )
        assert status.json()["state"] == "open"
        assert status.json()["isMerged"] is False
        unknown = await client.post(
            f"{BC}/GetPullRequestMergeStatus",
            json={"prUrl": "https://github.com/someone/else/pull/1"},
            headers=headers,
        )
        assert unknown.json()["state"] == ""

    async def test_a_follow_up_is_done_on_the_computer_with_the_session_kept(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None
        await client.post(
            f"{COMPUTER}/jobs/{job['id']}/complete",
            headers=headers,
            json={"runner": "computer-1", "result": "Done.", "work": WORK},
        )

        followup = await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Add a test for it too."),
                "synchronous": False,
                "followupSource": "grok-bot",
            },
            headers=headers,
        )
        assert followup.status_code == 200, followup.text

        runner = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        assert runner.json().get("job") is None
        again = await _computer_claim(client, headers)
        assert again is not None
        assert again["id"] != job["id"]
        assert again["work"]["sessionId"] == WORK["sessionId"]
        assert again["work"]["branchName"] == WORK["branchName"]
        assert [m["text"] for m in again["conversation"]] == [
            "Fix the login bug.",
            "Add a test for it too.",
        ]


@pytest.mark.asyncio
class TestStops:
    async def test_the_plan_s_limit_reads_as_paused_with_when(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None
        reason = "Claude's plan limit was reached. It resets at 15:40 UTC."
        failed = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/fail",
            headers=headers,
            json={
                "runner": "computer-1",
                "reason": reason,
                "retryable": False,
                "work": {"limitedUntilMs": 1_794_150_000_000},
            },
        )
        assert failed.status_code == 200, failed.text
        detailed = await _info(client, headers, bc_id)
        assert detailed["composer"]["status"] == 3
        details = detailed["permanentError"]["details"]
        assert details["title"] == "Paused: the Claude plan's limit is reached"
        assert details["additionalInfo"]["rateLimitReason"] == "sand_included_limit"
        assert details["detail"] == reason
        assert "summary" not in detailed

        # The person's follow-up starts the next turn, and the limit is past.
        await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Continue."),
                "synchronous": False,
                "followupSource": "grok-bot",
            },
            headers=headers,
        )
        again = await _computer_claim(client, headers)
        assert again is not None
        assert "limitedUntilMs" not in again["work"]

    async def test_a_run_in_codex_names_its_model_and_chatgpt_s_limit(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        """The computer says which model codes (13 November 2026): the app
        reads it back as the cloud agent's model, the next turn is handed
        it, and a limit names the plan it ran on."""
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None
        beat = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={
                "runner": "computer-1",
                "work": {"modelId": "own:chatgpt:gpt-6.1-sol", "sessionId": "t-1"},
            },
        )
        assert beat.status_code == 200, beat.text
        detailed = await _info(client, headers, bc_id)
        assert detailed["composer"]["requestedModel"] == {
            "modelId": "own:chatgpt:gpt-6.1-sol"
        }
        failed = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/fail",
            headers=headers,
            json={
                "runner": "computer-1",
                "reason": "ChatGPT's plan limit was reached.",
                "retryable": False,
                "work": {"limitedUntilMs": 1_794_150_000_000},
            },
        )
        assert failed.status_code == 200, failed.text
        detailed = await _info(client, headers, bc_id)
        details = detailed["permanentError"]["details"]
        assert details["title"] == "Paused: the ChatGPT plan's limit is reached"
        assert details["additionalInfo"]["rateLimitReason"] == "sand_included_limit"

        await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Continue."),
                "synchronous": False,
                "followupSource": "grok-bot",
            },
            headers=headers,
        )
        again = await _computer_claim(client, headers)
        assert again is not None
        assert again["work"]["modelId"] == "own:chatgpt:gpt-6.1-sol"
        assert again["work"]["sessionId"] == "t-1"

    async def test_another_stop_tells_the_agent_why(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None
        reason = "GitHub isn't connected on the computer."
        await client.post(
            f"{COMPUTER}/jobs/{job['id']}/fail",
            headers=headers,
            json={"runner": "computer-1", "reason": reason, "retryable": False},
        )
        detailed = await _info(client, headers, bc_id)
        assert detailed["permanentError"]["details"]["additionalInfo"] == {}
        assert detailed["summary"] == reason

    async def test_stop_reaches_the_computer_on_its_heartbeat(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None
        paused = await client.post(
            f"{BC}/PauseBackgroundComposer",
            json={"bcId": bc_id, "source": "grok-bot"},
            headers=headers,
        )
        assert paused.status_code == 200
        beat = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={"runner": "computer-1"},
        )
        assert beat.json()["cancelRequested"] is True
        await client.post(
            f"{COMPUTER}/jobs/{job['id']}/fail",
            headers=headers,
            json={
                "runner": "computer-1",
                "reason": "Cancelled by the person while it ran.",
                "retryable": False,
            },
        )
        detailed = await _info(client, headers, bc_id)
        assert detailed["composer"]["isKilled"] is True
        assert detailed["permanentError"]["isExpected"] is True
        assert "summary" not in detailed

    async def test_a_cloud_job_s_credential_cannot_take_coding_work(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        # A routine for the cloud runner, whose claim mints a job token.
        await client.post(
            "/desktop/api/maty/jobs", headers=headers, json={"prompt": "Brief me."}
        )
        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        token = claimed.json()["access_token"]
        await _start(client, headers)
        response = await client.post(
            f"{COMPUTER}/claim",
            headers={"Authorization": f"Bearer {token}"},
            json={"runner": "computer-1"},
        )
        assert response.status_code == 401


async def _conversation(
    client: httpx.AsyncClient, headers: dict[str, str], bc_id: str
) -> list[tuple[int, str]]:
    response = await client.post(
        f"{BC}/GetBackgroundComposerConversation",
        json={"bcId": bc_id},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return [(row["type"], row["text"]) for row in response.json()["conversation"]]


@pytest.mark.asyncio
class TestAlongTheWay:
    """What the cloud agent says while it works (13 November 2026): the
    computer's heartbeat carries it, and the conversation the apps read has it
    between the prompt and the answer."""

    async def test_updates_are_in_the_conversation_before_the_turn_s_answer(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        job = await _computer_claim(client, headers)
        assert job is not None
        assert "updates" not in job["work"]

        beat = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={
                "runner": "computer-1",
                "updates": [{"text": "Reading the login code.", "atMs": 1_000}],
            },
        )
        assert beat.status_code == 200, beat.text
        assert await _conversation(client, headers, bc_id) == [
            (1, "Fix the login bug."),
            (2, "Reading the login code."),
        ]

        # The whole list each time: one more line, and the first is not doubled.
        said = [
            {"text": "Reading the login code.", "atMs": 1_000},
            {"text": "The redirect drops the query. Fixing it.", "atMs": 2_000},
        ]
        again = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={"runner": "computer-1", "updates": said},
        )
        assert again.status_code == 200, again.text
        # A heartbeat with none keeps what was said, and the card's work with it.
        kept = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/heartbeat",
            headers=headers,
            json={"runner": "computer-1", "work": {"branchName": "simeon/login"}},
        )
        assert kept.status_code == 200, kept.text
        info = await _info(client, headers, bc_id)
        assert info["composer"]["branchName"] == "simeon/login"

        done = await client.post(
            f"{COMPUTER}/jobs/{job['id']}/complete",
            headers=headers,
            json={
                "runner": "computer-1",
                "result": "Fixed the login redirect.",
                "messages": [
                    {"role": "assistant", "text": "Fixed the login redirect."}
                ],
                "updates": said,
            },
        )
        assert done.status_code == 200, done.text
        assert await _conversation(client, headers, bc_id) == [
            (1, "Fix the login bug."),
            (2, "Reading the login code."),
            (2, "The redirect drops the query. Fixing it."),
            (2, "Fixed the login redirect."),
        ]

    async def test_a_follow_up_s_updates_come_after_the_first_turn_s_answer(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = await _start(client, headers)
        first = await _computer_claim(client, headers)
        assert first is not None
        await client.post(
            f"{COMPUTER}/jobs/{first['id']}/complete",
            headers=headers,
            json={
                "runner": "computer-1",
                "result": "Done.",
                "messages": [{"role": "assistant", "text": "Done."}],
                "updates": [{"text": "Looking.", "atMs": 1_000}],
            },
        )
        followed = await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Add a test too."),
            },
            headers=headers,
        )
        assert followed.status_code == 200, followed.text
        second = await _computer_claim(client, headers)
        assert second is not None
        assert second["id"] != first["id"]
        assert "updates" not in second["work"], "its own words are not sent back"
        await client.post(
            f"{COMPUTER}/jobs/{second['id']}/heartbeat",
            headers=headers,
            json={
                "runner": "computer-1",
                "updates": [{"text": "Writing the test.", "atMs": 5_000}],
            },
        )
        assert await _conversation(client, headers, bc_id) == [
            (1, "Fix the login bug."),
            (2, "Looking."),
            (2, "Done."),
            (1, "Add a test too."),
            (2, "Writing the test."),
        ]


class TestMergedUpdates:
    def test_a_turn_s_list_replaces_what_the_turn_said_and_keeps_the_others(
        self,
    ) -> None:
        kept = [
            {"text": "a", "createdAtMs": 1, "jobId": "one"},
            {"text": "b", "createdAtMs": 2, "jobId": "two"},
        ]
        merged = merged_updates(
            kept, "two", [ComputerUpdate(text="b"), ComputerUpdate(text="c", atMs=3)]
        )
        assert merged == [
            {"text": "a", "createdAtMs": 1, "jobId": "one"},
            {"text": "b", "createdAtMs": 0, "jobId": "two"},
            {"text": "c", "createdAtMs": 3, "jobId": "two"},
        ]
        assert merged_updates(kept, "two", None) == kept, "none sent: all kept"

    def test_only_the_last_of_a_turn_and_of_the_agent_are_kept(self) -> None:
        many = [ComputerUpdate(text=str(n)) for n in range(UPDATES_PER_TURN + 5)]
        turn = merged_updates([], "one", many)
        assert len(turn) == UPDATES_PER_TURN
        assert turn[-1]["text"] == str(UPDATES_PER_TURN + 4)
        full = [
            {"text": str(n), "createdAtMs": n, "jobId": f"job-{n}"}
            for n in range(UPDATES_KEPT)
        ]
        merged = merged_updates(full, "new", [ComputerUpdate(text="last")])
        assert len(merged) == UPDATES_KEPT
        assert merged[0]["text"] == "1"
        assert merged[-1]["text"] == "last"


class TestMergedWork:
    def test_a_field_left_out_keeps_what_was_there(self) -> None:
        kept = {"branchName": "simeon/a", "prUrl": "https://x/pull/1", "files": []}
        merged = merged_work(kept, ComputerWork(prState="merged", linesAdded=3))
        assert merged == {
            "branchName": "simeon/a",
            "prUrl": "https://x/pull/1",
            "files": [],
            "prState": "merged",
            "linesAdded": 3,
        }

    def test_an_unknown_state_is_dropped_and_zero_clears_the_limit(self) -> None:
        merged = merged_work(
            {"limitedUntilMs": 5}, ComputerWork(prState="weird", limitedUntilMs=0)
        )
        assert merged == {}

    def test_at_most_three_hundred_files(self) -> None:
        many = [{"path": f"f{i}", "added": 1, "removed": 0} for i in range(400)]
        merged = merged_work({}, ComputerWork.model_validate({"files": many}))
        assert len(merged["files"]) == 300
