"""Cloud agents over the maty queue (`polar/sand/cloud_agents.py`,
25 September 2026).

The app's client (`desktop/source/host/extensions/cloud-agents/`) is not
changed; this measures the server it now has. Every call below is the
request the manager composes, in the JSON the generated protos spell,
and every assertion reads the field the client reads. The runner's side
is driven through `/maty/runner/*` the way `claidor-maty-runner` speaks it.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import httpx
import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.maty.service import CANCELLED_REASON
from polar.models import User
from polar.postgres import AsyncSession

from tests.desktop.test_endpoints import _signed_in

BC = "/aiserver.v1.BackgroundComposerService"
RUNNER_TOKEN = "a-service-secret-that-belongs-to-no-person"
RUNNER = {"Authorization": f"Bearer {RUNNER_TOKEN}"}


@pytest.fixture(autouse=True)
def configured_runner(mocker: MockerFixture) -> None:
    """A Simeon a cloud runner can reach: the queue is `available`."""
    mocker.patch.object(settings, "MATY_RUNNER_TOKEN", RUNNER_TOKEN)


async def _headers(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    access, _ = await _signed_in(client, session, user)
    return {"Authorization": f"Bearer {access}"}


def _user_message(text: str) -> dict[str, Any]:
    """`buildCloudAgentConversationAction(buildCloudAgentUserMessage(...))`
    as protobuf JSON: the oneof `action` with its `userMessageAction` case."""
    return {
        "userMessageAction": {
            "userMessage": {"text": text, "messageId": str(uuid4()), "mode": 2},
            "sendToInteractionListener": True,
        }
    }


def _launch(bc_id: str, prompt: str, **extra: Any) -> dict[str, Any]:
    """The request `SandCloudAgentManager.launch` sends."""
    return {
        "bcId": bc_id,
        "snapshotNameOrId": "github.com/simeonlabs/demo",
        "devcontainerStartingPoint": {
            "url": "https://github.com/simeonlabs/demo",
            "ref": "main",
        },
        "snapshotWorkspaceRootPath": "/workspace",
        "returnImmediately": True,
        "repoUrl": "https://github.com/simeonlabs/demo",
        "source": "grok-bot",
        "autoBranch": True,
        "baseBranch": "main",
        "autoCreatePr": True,
        "conversationAction": _user_message(prompt),
        "startingMessageType": "user-message",
        "addInitialMessageToResponses": True,
        "repositoryInfo": {"pathEncryptionKey": "", "shouldSyncIndex": False},
        "requestedModels": [
            {"modelId": "gpt-5.6-terra", "maxMode": True, "parameters": []}
        ],
        "skills": [],
        **extra,
    }


async def _claim(client: httpx.AsyncClient) -> dict[str, Any]:
    response = await client.post(
        "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("job") is not None, body
    return body


@pytest.mark.asyncio
class TestStartInfoList:
    async def test_start_then_info_then_list(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        started = await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "Summarise the README.", name="Readme summary"),
            headers=headers,
        )
        assert started.status_code == 200, started.text
        composer = started.json()["composer"]
        assert composer["bcId"] == bc_id
        assert composer["status"] == 4, "queued reads as CREATING"
        assert composer["name"] == "Readme summary"
        assert started.json()["initialRunId"]

        info = await client.post(
            f"{BC}/GetBackgroundComposerInfo",
            json={
                "bcId": bc_id,
                "includeDiff": False,
                "doNotThrowIfSetupNotFinished": True,
            },
            headers=headers,
        )
        assert info.status_code == 200, info.text
        detailed = info.json()["composer"]
        assert detailed["composer"]["bcId"] == bc_id
        assert detailed["composer"]["status"] == 4
        assert (
            detailed["composer"]["branchName"] == ""
            and detailed["composer"]["prUrl"] == ""
        )
        assert detailed["composer"]["filesChanged"] == 0
        assert detailed["prompt"]["text"] == "Summarise the README."
        assert detailed["prs"] == []
        assert detailed["baseBranch"] == "main"
        assert "summary" not in detailed and "permanentError" not in detailed

        listed = await client.post(
            f"{BC}/ListBackgroundComposers", json={"n": 20}, headers=headers
        )
        assert listed.status_code == 200, listed.text
        rows = listed.json()["composers"]
        assert [row["bcId"] for row in rows] == [bc_id]
        assert rows[0]["isArchived"] is False
        assert isinstance(rows[0]["createdAtMs"], int) and rows[0]["createdAtMs"] > 0

    async def test_somebody_else_s_agent_is_not_found(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        mine = await _headers(client, session, user)
        theirs = await _headers(client, session, user_second)
        bc_id = f"bc-{uuid4()}"
        assert (
            await client.post(
                f"{BC}/StartBackgroundComposerFromSnapshot",
                json=_launch(bc_id, "x"),
                headers=mine,
            )
        ).status_code == 200
        response = await client.post(
            f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=theirs
        )
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"
        listed = await client.post(
            f"{BC}/ListBackgroundComposers", json={"n": 20}, headers=theirs
        )
        assert listed.json()["composers"] == []

    async def test_an_empty_prompt_and_a_missing_bc_id_are_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        response = await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(f"bc-{uuid4()}", "   "),
            headers=headers,
        )
        assert (
            response.status_code == 400
            and response.json()["code"] == "invalid_argument"
        )
        response = await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json={**_launch("", "x"), "bcId": ""},
            headers=headers,
        )
        assert response.status_code == 400

    async def test_no_runner_means_unavailable_with_the_queue_s_sentence(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "MATY_RUNNER_TOKEN", "")
        headers = await _headers(client, session, user)
        response = await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(f"bc-{uuid4()}", "x"),
            headers=headers,
        )
        assert response.status_code == 503, response.text
        assert response.json()["code"] == "unavailable"
        assert "not available" in response.json()["message"]


@pytest.mark.asyncio
class TestTheRun:
    async def test_the_runner_takes_the_conversation_and_its_reply_finishes_the_agent(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "Say hello."),
            headers=headers,
        )

        claimed = await _claim(client)
        job = claimed["job"]
        assert job["kind"] == "task" and job["prompt"] == "Say hello."
        assert job["executor"] == "maty-runner"
        assert [m["role"] for m in job["conversation"]] == ["user"]
        assert job["conversation"][0]["text"] == "Say hello."

        info = await client.post(
            f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
        )
        assert info.json()["composer"]["composer"]["status"] == 1, (
            "claimed reads as RUNNING"
        )

        beat = await client.post(
            f"/maty/runner/jobs/{job['id']}/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-1"},
        )
        assert beat.status_code == 200 and beat.json()["cancel_requested"] is False

        done = await client.post(
            f"/maty/runner/jobs/{job['id']}/complete",
            headers=RUNNER,
            json={
                "runner": "cloud-1",
                "result": "Hello.",
                "usage": {"total_tokens": 3},
                "messages": [{"role": "assistant", "text": "Hello."}],
                "artifacts": [
                    {"path": "/workspace/notes.md", "sizeBytes": 12, "updatedAtMs": 1}
                ],
            },
        )
        assert done.status_code == 200, done.text

        info = await client.post(
            f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
        )
        detailed = info.json()["composer"]
        assert detailed["composer"]["status"] == 2, "done reads as FINISHED"
        assert detailed["summary"] == "Hello."

        conversation = await client.post(
            f"{BC}/GetBackgroundComposerConversation",
            json={"bcId": bc_id},
            headers=headers,
        )
        rows = conversation.json()["conversation"]
        assert [(row["type"], row["text"]) for row in rows] == [
            (1, "Say hello."),
            (2, "Hello."),
        ]
        assert all(row["bubbleId"] for row in rows)

        artifacts = await client.post(
            f"{BC}/ListBackgroundComposerArtifacts",
            json={"bcId": bc_id},
            headers=headers,
        )
        assert artifacts.json()["artifacts"] == [
            {
                "absolutePath": "/workspace/notes.md",
                "sizeBytes": "12",
                "updatedAtUnixMs": "1",
            }
        ]

    async def test_a_failed_run_reads_as_error_with_its_reason(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "x"),
            headers=headers,
        )
        job = (await _claim(client))["job"]
        await client.post(
            f"/maty/runner/jobs/{job['id']}/fail",
            headers=RUNNER,
            json={
                "runner": "cloud-1",
                "reason": "No model available.",
                "retryable": False,
            },
        )
        detailed = (
            await client.post(
                f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
            )
        ).json()["composer"]
        assert detailed["composer"]["status"] == 3
        assert detailed["permanentError"]["details"]["detail"] == "No model available."


@pytest.mark.asyncio
class TestFollowups:
    async def test_a_follow_up_on_a_finished_run_is_a_continuation_carrying_the_conversation(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "One."),
            headers=headers,
        )
        first = (await _claim(client))["job"]
        await client.post(
            f"/maty/runner/jobs/{first['id']}/complete",
            headers=RUNNER,
            json={"runner": "cloud-1", "result": "1", "messages": [{"text": "1"}]},
        )

        reply = await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Two."),
                "synchronous": False,
                "followupSource": "grok-bot",
            },
            headers=headers,
        )
        assert reply.status_code == 200, reply.text
        run_id = reply.json()["runId"]
        assert run_id and run_id != first["id"], "a finished turn gets a new job"

        detailed = (
            await client.post(
                f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
            )
        ).json()["composer"]
        assert detailed["composer"]["status"] == 4, "the continuation is queued"

        second = (await _claim(client))["job"]
        assert second["id"] == run_id
        assert [(m["role"], m["text"]) for m in second["conversation"]] == [
            ("user", "One."),
            ("assistant", "1"),
            ("user", "Two."),
        ]

    async def test_a_follow_up_on_a_queued_run_rides_along(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        started = await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "One."),
            headers=headers,
        )
        job_id = started.json()["initialRunId"]
        reply = await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Two."),
                "synchronous": False,
            },
            headers=headers,
        )
        assert reply.json()["runId"] == job_id
        claimed = (await _claim(client))["job"]
        assert [m["text"] for m in claimed["conversation"]] == ["One.", "Two."]

    async def test_a_follow_up_on_a_running_run_waits_and_continues_when_it_settles(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "One."),
            headers=headers,
        )
        first = (await _claim(client))["job"]
        reply = await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Two."),
                "synchronous": False,
            },
            headers=headers,
        )
        assert reply.json()["runId"] == first["id"], "the running turn answers first"
        beat = await client.post(
            f"/maty/runner/jobs/{first['id']}/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-1"},
        )
        assert beat.json()["cancel_requested"] is False, (
            "an ordinary follow-up does not interrupt"
        )
        await client.post(
            f"/maty/runner/jobs/{first['id']}/complete",
            headers=RUNNER,
            json={"runner": "cloud-1", "result": "1", "messages": [{"text": "1"}]},
        )
        # The settled job left an unanswered follow-up: a continuation is queued.
        second = (await _claim(client))["job"]
        assert second["id"] != first["id"]
        assert [m["text"] for m in second["conversation"]] == ["One.", "1", "Two."]
        detailed = (
            await client.post(
                f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
            )
        ).json()["composer"]
        assert detailed["composer"]["status"] == 1, (
            "the agent's latest turn is the continuation"
        )

    async def test_an_interrupting_follow_up_asks_the_running_job_to_stop(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "One."),
            headers=headers,
        )
        first = (await _claim(client))["job"]
        await client.post(
            f"{BC}/AddAsyncFollowupBackgroundComposer",
            json={
                "bcId": bc_id,
                "followupConversationAction": _user_message("Stop, do this instead."),
                "synchronous": True,
            },
            headers=headers,
        )
        beat = await client.post(
            f"/maty/runner/jobs/{first['id']}/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-1"},
        )
        assert beat.json()["cancel_requested"] is True
        await client.post(
            f"/maty/runner/jobs/{first['id']}/fail",
            headers=RUNNER,
            json={
                "runner": "cloud-1",
                "reason": "Cancelled by the person.",
                "retryable": False,
            },
        )
        second = (await _claim(client))["job"]
        assert [m["text"] for m in second["conversation"]] == [
            "One.",
            "Stop, do this instead.",
        ]


@pytest.mark.asyncio
class TestPauseRenameArchiveDelete:
    async def test_pause_before_claim_cancels(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "x"),
            headers=headers,
        )
        paused = await client.post(
            f"{BC}/PauseBackgroundComposer",
            json={"bcId": bc_id, "source": "grok-bot"},
            headers=headers,
        )
        assert paused.status_code == 200 and paused.json() == {}
        detailed = (
            await client.post(
                f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
            )
        ).json()["composer"]
        assert detailed["composer"]["status"] == 3
        assert detailed["composer"]["isKilled"] is True
        assert detailed["permanentError"]["details"]["detail"] == CANCELLED_REASON
        nothing = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        assert nothing.json() == {"job": None}

    async def test_pause_during_a_run_sets_the_flag_the_heartbeat_returns(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "x"),
            headers=headers,
        )
        job = (await _claim(client))["job"]
        await client.post(
            f"{BC}/PauseBackgroundComposer",
            json={"bcId": bc_id, "source": "grok-bot"},
            headers=headers,
        )
        detailed = (
            await client.post(
                f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
            )
        ).json()["composer"]
        assert detailed["composer"]["status"] == 1, (
            "still running until the runner stops"
        )
        beat = await client.post(
            f"/maty/runner/jobs/{job['id']}/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-1"},
        )
        assert beat.status_code == 200 and beat.json()["cancel_requested"] is True

    async def test_rename_archive_unarchive_delete(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "x"),
            headers=headers,
        )

        assert (
            await client.post(
                f"{BC}/RenameBackgroundComposer",
                json={"bcId": bc_id, "newName": "Renamed"},
                headers=headers,
            )
        ).status_code == 200
        detailed = (
            await client.post(
                f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
            )
        ).json()["composer"]
        assert detailed["composer"]["name"] == "Renamed"

        assert (
            await client.post(
                f"{BC}/ArchiveBackgroundComposer",
                json={"bcId": bc_id, "unarchive": False, "source": "grok-bot"},
                headers=headers,
            )
        ).status_code == 200
        listed = await client.post(
            f"{BC}/ListBackgroundComposers", json={"n": 20}, headers=headers
        )
        assert listed.json()["composers"] == [], (
            "archived rows are off the default list"
        )
        listed = await client.post(
            f"{BC}/ListBackgroundComposers",
            json={"n": 20, "includeArchived": True},
            headers=headers,
        )
        assert [row["isArchived"] for row in listed.json()["composers"]] == [True]

        assert (
            await client.post(
                f"{BC}/ArchiveBackgroundComposer",
                json={"bcId": bc_id, "unarchive": True, "source": "grok-bot"},
                headers=headers,
            )
        ).status_code == 200
        listed = await client.post(
            f"{BC}/ListBackgroundComposers", json={"n": 20}, headers=headers
        )
        assert [row["isArchived"] for row in listed.json()["composers"]] == [False]

        assert (
            await client.post(
                f"{BC}/DeleteBackgroundComposer", json={"bcId": bc_id}, headers=headers
            )
        ).status_code == 200
        gone = await client.post(
            f"{BC}/GetBackgroundComposerInfo", json={"bcId": bc_id}, headers=headers
        )
        assert gone.status_code == 404 and gone.json()["code"] == "not_found"
        listed = await client.post(
            f"{BC}/ListBackgroundComposers",
            json={"n": 20, "includeArchived": True},
            headers=headers,
        )
        assert listed.json()["composers"] == []


@pytest.mark.asyncio
class TestTheRest:
    async def test_no_pr_no_diff_one_environment(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        bc_id = f"bc-{uuid4()}"
        await client.post(
            f"{BC}/StartBackgroundComposerFromSnapshot",
            json=_launch(bc_id, "x"),
            headers=headers,
        )

        merge = await client.post(
            f"{BC}/GetPullRequestMergeStatus",
            json={"prUrl": "https://github.com/x/y/pull/1"},
            headers=headers,
        )
        assert merge.status_code == 200
        assert merge.json()["isMerged"] is False and merge.json()["state"] == ""

        diff = await client.post(
            f"{BC}/GetOptimizedDiffDetails",
            json={"bcId": bc_id, "excludeBeforeAfterDiffs": True},
            headers=headers,
        )
        assert diff.status_code == 200 and diff.json()["diff"]["diffs"] == []

        environments = await client.post(
            f"{BC}/ListEnvironments",
            json={"includeRepositoryScopeEnvironments": True, "limit": 500},
            headers=headers,
        )
        rows = environments.json()["environments"]
        assert [(row["publicId"], row["name"]) for row in rows] == [
            ("simeon-computer", "Simeon's computer")
        ]
        one = await client.post(
            f"{BC}/GetEnvironment",
            json={"publicId": "simeon-computer"},
            headers=headers,
        )
        assert one.json()["environment"]["name"] == "Simeon's computer"
        none = await client.post(
            f"{BC}/GetEnvironment", json={"publicId": "nope"}, headers=headers
        )
        assert none.status_code == 200 and none.json() == {}

    async def test_available_models_is_the_menu_in_the_app_s_shape(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        menu = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        response = await client.post(
            "/aiserver.v1.AiService/AvailableModels",
            json={"useModelParameters": True, "doNotUseMarkdown": True, "scope": 1},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        offered = [row["modelId"] for row in menu if row.get("role") != "fallback"]
        assert [model["name"] for model in body["models"]] == offered
        assert body["modelNames"] == offered
        for model in body["models"]:
            assert model["serverModelName"] == model["name"]
            assert (
                model["parameterDefinitions"] == []
                and model["variants"] == []
                and model["idAliases"] == []
            )
            assert model["supportsAgent"] is True
        assert sum(1 for model in body["models"] if model["defaultOn"]) == (
            1 if body["models"] else 0
        )
        primary = [row["modelId"] for row in menu if row.get("role") == "primary"]
        if primary:
            assert (
                next(model["name"] for model in body["models"] if model["defaultOn"])
                == primary[0]
            )
