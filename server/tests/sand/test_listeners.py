"""The listener relay, served (25 September 2026).

Every request here is what the box's host sends
(`desktop/source/host/extensions/automations/*.ts`), every assertion the
field that code reads. The fixtures' shapes are shared by hand with
`desktop/tests/listeners-served.test.mjs`, which runs the real relay
client against an in-process server answering these same bodies.
"""

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.models import SandListenerConnection, User
from polar.postgres import AsyncSession
from polar.sand.listeners_service import listeners
from polar.sand.listeners_slack import verify_signature
from tests.desktop.test_endpoints import _signed_in
from tests.fixtures.database import SaveFixture

SLACK_SECRET = "slack-signing-secret"
GITHUB_SECRET = "github-webhook-secret"


async def _headers(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    access, _ = await _signed_in(client, session, user)
    return {"Authorization": f"Bearer {access}", "content-type": "application/json"}


async def _slack_workspace(
    save_fixture: SaveFixture, user: User
) -> SandListenerConnection:
    row = SandListenerConnection(
        user_id=user.id,
        platform="slack",
        external_id="T123",
        external_name="Simeon Labs",
        external_user_id="U_OWNER",
        access_token="xoxb-test",
        extra={
            "bot_user_id": "U_BOT",
            "channels": [
                {"id": "C_ENG", "name": "eng", "isMember": True},
                {"id": "C_OPS", "name": "ops", "isMember": False},
            ],
            "channels_refreshed_at": time.time(),
        },
    )
    await save_fixture(row)
    return row


async def _github_installation(
    save_fixture: SaveFixture, user: User
) -> SandListenerConnection:
    row = SandListenerConnection(
        user_id=user.id,
        platform="github",
        external_id="4242",
        external_name="simeon-labs",
        extra={"repos": ["simeon-labs/app"]},
    )
    await save_fixture(row)
    return row


def _slack_signed(body: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    raw = json.dumps(body).encode()
    timestamp = str(int(time.time()))
    signature = (
        "v0="
        + hmac.new(
            SLACK_SECRET.encode(),
            b"v0:" + timestamp.encode() + b":" + raw,
            hashlib.sha256,
        ).hexdigest()
    )
    return raw, {
        "content-type": "application/json",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature,
    }


def _github_signed(event: str, body: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    raw = json.dumps(body).encode()
    signature = (
        "sha256=" + hmac.new(GITHUB_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    )
    return raw, {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
        "x-github-event": event,
    }


def _slack_workflow(channel: str = "#eng") -> dict[str, Any]:
    return {
        "triggers": [{"slackMention": {"channels": [channel]}}],
        "prompts": [{"prompt": "Answer the mention."}],
    }


def _github_workflow(repo: str = "simeon-labs/app") -> dict[str, Any]:
    return {
        "triggers": [
            {
                "git": {
                    "pullRequest": {
                        "repos": [f"https://github.com/{repo}"],
                        "prAction": "GIT_PULL_REQUEST_ACTION_OPENED",
                    },
                    "userAllowlist": [],
                }
            }
        ],
        "prompts": [{"prompt": "Review the PR."}],
    }


@pytest.fixture
def notify_publish(mocker: MockerFixture) -> AsyncMock:
    return mocker.patch("polar.sand.listeners_service.publish", new=AsyncMock())


@pytest.mark.asyncio
class TestSubscriptions:
    async def test_subscriptions_round_trip_names_every_channel_and_repo(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
    ) -> None:
        await _slack_workspace(save_fixture, user)
        await _github_installation(save_fixture, user)
        headers = await _headers(client, session, user)
        response = await client.post(
            "/sand/listener-subscriptions",
            json={
                "slackChannels": ["#eng", "#ops", "#nowhere", "*"],
                "githubRepos": ["simeon-labs/app", "simeon-labs/other"],
                "githubKinds": ["pr-opened"],
            },
            headers=headers,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["slack"]["status"] == "ok"
        team = body["slack"]["teams"][0]
        assert team["channels"] == [
            {"input": "#eng", "channelId": "C_ENG", "isBotMember": True},
            {"input": "#ops", "channelId": "C_OPS", "isBotMember": False},
        ]
        assert team["unresolvedChannels"] == ["#nowhere"]
        assert body["github"]["status"] == "ok"
        assert body["github"]["repos"][0] == {
            "repo": "simeon-labs/app",
            "isSubscribed": True,
        }
        assert body["github"]["repos"][1]["isSubscribed"] is False
        assert "Simeon's GitHub App" in body["github"]["repos"][1]["detail"]

    async def test_without_connections_the_statuses_say_so(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        response = await client.post(
            "/sand/listener-subscriptions",
            json={"slackChannels": ["#eng"], "githubRepos": ["o/r"], "githubKinds": []},
            headers=headers,
        )
        body = response.json()
        assert body["slack"]["status"] == "not-linked"
        assert body["github"]["status"] == "not-connected"

    async def test_the_box_credential_is_accepted(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post("/sand/listener-subscriptions", json={})
        assert response.status_code == 401


@pytest.mark.asyncio
class TestSlackIngress:
    async def test_a_mention_reaches_the_subscribed_poll_and_is_acked_away(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
        notify_publish: AsyncMock,
    ) -> None:
        mocker.patch.object(settings, "SLACK_SIGNING_SECRET", SLACK_SECRET)
        await _slack_workspace(save_fixture, user)
        headers = await _headers(client, session, user)
        await client.post(
            "/sand/listener-subscriptions",
            json={"slackChannels": ["#eng"], "githubRepos": [], "githubKinds": []},
            headers=headers,
        )
        create = await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={
                "name": "Mentions",
                "description": "sand-shadow:abc123",
                "workflow": _slack_workflow(),
                "enabled": True,
                "sandAgentId": "agent-1",
                "sandAutomationId": "auto-1",
            },
            headers=headers,
        )
        assert create.status_code == 200, create.text

        raw, sig = _slack_signed({"type": "url_verification", "challenge": "hello"})
        challenge = await client.post(
            "/sand/ingress/slack/events", content=raw, headers=sig
        )
        assert challenge.json() == {"challenge": "hello"}

        raw, sig = _slack_signed(
            {
                "type": "event_callback",
                "team_id": "T123",
                "event": {
                    "type": "app_mention",
                    "channel": "C_ENG",
                    "user": "U_ALICE",
                    "text": "<@U_BOT> ship it",
                    "ts": "1.0",
                    "thread_ts": "0.9",
                },
            }
        )
        delivered = await client.post(
            "/sand/ingress/slack/events", content=raw, headers=sig
        )
        assert delivered.status_code == 200, delivered.text
        topics = sorted(call.args[2] for call in notify_publish.await_args_list)
        assert topics == ["automation-fires", "listener-events"]

        poll = await client.post(
            "/sand/listener-events/poll", json={"ackIds": []}, headers=headers
        )
        events = poll.json()["events"]
        assert len(events) == 1
        wire = events[0]
        assert wire["source"] == "slack"
        assert wire["kind"] == "message"
        assert wire["channelName"] == "#eng"
        assert wire["channelId"] == "C_ENG"
        assert wire["senderSlackUserId"] == "U_ALICE"
        assert wire["isMention"] is True
        assert wire["text"] == "<@U_BOT> ship it"
        assert wire["ts"] == "1.0"
        assert wire["threadTs"] == "0.9"
        acked = await client.post(
            "/sand/listener-events/poll", json={"ackIds": [wire["id"]]}, headers=headers
        )
        assert acked.json()["events"] == []

        fires = (
            await client.post(
                "/sand/automation-events/poll",
                json={"ackRunUuids": []},
                headers=headers,
            )
        ).json()
        assert fires["nextPollAfterMs"] == 15000
        assert len(fires["events"]) == 1
        fire = fires["events"][0]
        assert fire["sandAgentId"] == "agent-1"
        assert fire["automationId"] == "auto-1"
        assert fire["definitionRevision"] == "abc123"
        assert fire["event"]["source"] == "slack"
        assert fire["event"]["channel"] == "#eng"
        assert fire["event"]["sender"] == "@U_ALICE"
        assert fire["event"]["isMention"] is True

    async def test_an_unsigned_delivery_is_refused_and_a_missing_secret_says_so(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        raw, sig = _slack_signed({"type": "url_verification", "challenge": "x"})
        missing = await client.post(
            "/sand/ingress/slack/events", content=raw, headers=sig
        )
        assert missing.status_code == 503
        assert "not registered" in missing.json()["error"]
        mocker.patch.object(settings, "SLACK_SIGNING_SECRET", SLACK_SECRET)
        sig["x-slack-signature"] = "v0=deadbeef"
        refused = await client.post(
            "/sand/ingress/slack/events", content=raw, headers=sig
        )
        assert refused.status_code == 401
        assert verify_signature(SLACK_SECRET, "1", "v0=x", b"", now=10_000) is False

    async def test_a_reaction_by_the_owner_is_self(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
        notify_publish: AsyncMock,
    ) -> None:
        mocker.patch.object(settings, "SLACK_SIGNING_SECRET", SLACK_SECRET)
        await _slack_workspace(save_fixture, user)
        headers = await _headers(client, session, user)
        await client.post(
            "/sand/listener-subscriptions",
            json={"slackChannels": ["*"], "githubRepos": [], "githubKinds": []},
            headers=headers,
        )
        raw, sig = _slack_signed(
            {
                "type": "event_callback",
                "team_id": "T123",
                "event": {
                    "type": "reaction_added",
                    "user": "U_OWNER",
                    "reaction": "tada",
                    "item": {"channel": "C_OPS", "ts": "2.0"},
                },
            }
        )
        await client.post("/sand/ingress/slack/events", content=raw, headers=sig)
        events = (
            await client.post(
                "/sand/listener-events/poll", json={"ackIds": []}, headers=headers
            )
        ).json()["events"]
        assert events[0]["kind"] == "reaction"
        assert events[0]["reactionEmoji"] == "tada"
        assert events[0]["isSelf"] is True
        assert events[0]["channelName"] == "#ops"


@pytest.mark.asyncio
class TestGithubIngress:
    async def test_a_pull_request_reaches_the_poll_and_fires_the_routine(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
        notify_publish: AsyncMock,
    ) -> None:
        mocker.patch.object(settings, "SAND_GITHUB_WEBHOOK_SECRET", GITHUB_SECRET)
        await _github_installation(save_fixture, user)
        headers = await _headers(client, session, user)
        await client.post(
            "/sand/listener-subscriptions",
            json={
                "slackChannels": [],
                "githubRepos": ["simeon-labs/app"],
                "githubKinds": ["pr-opened", "pr-merged"],
            },
            headers=headers,
        )
        await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={
                "name": "PRs",
                "description": "sand-shadow:rev1",
                "workflow": _github_workflow(),
                "enabled": True,
                "sandAgentId": "agent-1",
                "sandAutomationId": "auto-gh",
            },
            headers=headers,
        )
        raw, sig = _github_signed(
            "pull_request",
            {
                "action": "opened",
                "repository": {
                    "full_name": "simeon-labs/app",
                    "html_url": "https://github.com/simeon-labs/app",
                },
                "installation": {"id": 4242},
                "sender": {"login": "alice"},
                "pull_request": {
                    "number": 7,
                    "title": "Add listeners",
                    "html_url": "https://github.com/simeon-labs/app/pull/7",
                    "user": {"login": "alice"},
                    "head": {"ref": "feature"},
                },
            },
        )
        delivered = await client.post(
            "/sand/ingress/github/events", content=raw, headers=sig
        )
        assert delivered.status_code == 200, delivered.text

        events = (
            await client.post(
                "/sand/listener-events/poll", json={"ackIds": []}, headers=headers
            )
        ).json()["events"]
        assert len(events) == 1
        assert events[0]["source"] == "github"
        assert events[0]["repo"] == "simeon-labs/app"
        assert events[0]["kind"] == "pr-opened"
        assert events[0]["title"] == "Add listeners"
        assert events[0]["actor"] == "alice"
        assert events[0]["prOwner"] == "alice"
        assert events[0]["branch"] == "feature"

        fires = (
            await client.post(
                "/sand/automation-events/poll",
                json={"ackRunUuids": []},
                headers=headers,
            )
        ).json()["events"]
        assert len(fires) == 1
        assert fires[0]["automationId"] == "auto-gh"
        assert fires[0]["event"]["kind"] == "pr-opened"
        run_uuid = fires[0]["id"]

        complete = await client.post(
            "/sand/automation-runs/complete",
            json={"runUuid": run_uuid, "status": "succeeded"},
            headers=headers,
        )
        assert complete.status_code == 200
        assert complete.json() == {}
        # The consumer keeps a completed run in its state until the next
        # poll no longer returns it; the ack retires it.
        still = (
            await client.post(
                "/sand/automation-events/poll",
                json={"ackRunUuids": []},
                headers=headers,
            )
        ).json()["events"]
        assert [fire["id"] for fire in still] == [run_uuid]
        gone = (
            await client.post(
                "/sand/automation-events/poll",
                json={"ackRunUuids": [run_uuid]},
                headers=headers,
            )
        ).json()["events"]
        assert gone == []
        unknown = await client.post(
            "/sand/automation-runs/complete",
            json={
                "runUuid": "00000000-0000-0000-0000-000000000000",
                "status": "failed",
            },
            headers=headers,
        )
        assert unknown.status_code == 404

    async def test_an_installation_webhook_records_its_repositories(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "SAND_GITHUB_WEBHOOK_SECRET", GITHUB_SECRET)
        raw, sig = _github_signed(
            "installation",
            {
                "action": "created",
                "installation": {"id": 99, "account": {"login": "acme"}},
                "repositories": [{"full_name": "Acme/Web"}],
            },
        )
        assert (
            await client.post("/sand/ingress/github/events", content=raw, headers=sig)
        ).status_code == 200
        raw, sig = _github_signed(
            "installation_repositories",
            {
                "action": "added",
                "installation": {"id": 99},
                "repositories_added": [{"full_name": "acme/api"}],
                "repositories_removed": [],
            },
        )
        assert (
            await client.post("/sand/ingress/github/events", content=raw, headers=sig)
        ).status_code == 200
        from polar.sand.listeners_repository import SandListenerConnectionRepository

        row = await SandListenerConnectionRepository.from_session(
            session
        ).get_by_external("github", "99")
        assert row is not None
        assert row.user_id is None
        assert row.extra["repos"] == ["acme/api", "acme/web"]
        sig["x-hub-signature-256"] = "sha256=bad"
        assert (
            await client.post("/sand/ingress/github/events", content=raw, headers=sig)
        ).status_code == 401


@pytest.mark.asyncio
class TestAutomationsService:
    async def test_create_list_update_delete_keep_the_shape_the_sync_reads(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        workflow = {
            "triggers": [{"cron": {"cron": "CRON_TZ=Africa/Dakar 0 9 * * 1-5"}}],
            "prompts": [{"prompt": "Morning brief"}],
        }
        create = await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={
                "name": "Brief",
                "description": "sand-shadow:h1",
                "workflow": workflow,
                "enabled": True,
                "sandAgentId": "agent-1",
                "sandAutomationId": "auto-cron",
            },
            headers=headers,
        )
        assert create.status_code == 200, create.text
        assert create.json()["workflow"]["automationId"] == "auto-cron"
        listed = await client.post(
            "/aiserver.v1.AutomationsService/ListSandAutomations",
            json={"sandAgentId": "agent-1"},
            headers=headers,
        )
        entries = listed.json()["workflows"]
        assert len(entries) == 1
        entry = entries[0]["workflow"]
        assert entry["automationId"] == "auto-cron"
        assert entry["description"] == "sand-shadow:h1"
        assert entry["enabled"] is True
        assert entry["workflow"] == workflow
        assert entry["name"] == "Brief"
        assert isinstance(entry["createdAt"], str)
        other = await client.post(
            "/aiserver.v1.AutomationsService/ListSandAutomations",
            json={"sandAgentId": "agent-2"},
            headers=headers,
        )
        assert other.json()["workflows"] == []

        again = await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={
                "name": "Brief",
                "description": "sand-shadow:h1",
                "workflow": workflow,
                "enabled": True,
                "sandAgentId": "agent-1",
                "sandAutomationId": "auto-cron",
            },
            headers=headers,
        )
        assert again.status_code == 200
        assert (
            len(
                (
                    await client.post(
                        "/aiserver.v1.AutomationsService/ListSandAutomations",
                        json={"sandAgentId": "agent-1"},
                        headers=headers,
                    )
                ).json()["workflows"]
            )
            == 1
        )

        updated = await client.post(
            "/aiserver.v1.AutomationsService/UpdateSandAutomation",
            json={
                "automationId": "auto-cron",
                "description": "sand-shadow:h2",
                "enabled": False,
            },
            headers=headers,
        )
        assert updated.status_code == 200
        entry = (
            await client.post(
                "/aiserver.v1.AutomationsService/ListSandAutomations",
                json={"sandAgentId": "agent-1"},
                headers=headers,
            )
        ).json()["workflows"][0]["workflow"]
        assert entry["description"] == "sand-shadow:h2"
        assert entry["enabled"] is False

        deleted = await client.post(
            "/aiserver.v1.AutomationsService/DeleteSandAutomation",
            json={"automationId": "auto-cron"},
            headers=headers,
        )
        assert deleted.status_code == 200
        assert deleted.json() == {}
        assert (
            await client.post(
                "/aiserver.v1.AutomationsService/ListSandAutomations",
                json={"sandAgentId": "agent-1"},
                headers=headers,
            )
        ).json()["workflows"] == []
        twice = await client.post(
            "/aiserver.v1.AutomationsService/DeleteSandAutomation",
            json={"automationId": "auto-cron"},
            headers=headers,
        )
        assert twice.status_code == 200

    async def test_a_create_without_ids_is_invalid_argument(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        response = await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={"name": "x"},
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["code"] == "invalid_argument"


@pytest.mark.asyncio
class TestCron:
    async def test_the_worker_fires_a_due_cron_once_with_its_slot_and_revision(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        notify_publish: AsyncMock,
    ) -> None:
        headers = await _headers(client, session, user)
        workflow = {
            "triggers": [{"cron": {"cron": "*/5 * * * *"}}],
            "prompts": [{"prompt": "tick"}],
        }
        await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={
                "name": "Tick",
                "description": "sand-shadow:rev-cron",
                "workflow": workflow,
                "enabled": True,
                "sandAgentId": "agent-1",
                "sandAutomationId": "auto-tick",
            },
            headers=headers,
        )
        from polar.sand.listeners_repository import SandAutomationRepository

        row = await SandAutomationRepository.from_session(session).get_by_automation_id(
            user.id, "auto-tick"
        )
        assert row is not None
        assert row.next_fire_at is not None
        slot = row.next_fire_at
        assert slot.minute % 5 == 0
        assert slot > datetime.now(UTC)

        assert (
            await listeners.fire_due_crons(
                session, notify_publish, now=slot - timedelta(seconds=1)
            )
            == 0
        )
        assert (
            await listeners.fire_due_crons(
                session, notify_publish, now=slot + timedelta(seconds=1)
            )
            == 1
        )
        assert notify_publish.await_args_list[-1].args[2] == "automation-fires"
        await session.refresh(row)
        assert row.next_fire_at is not None
        assert row.next_fire_at > slot
        # The next slot is due too, but the first fire is still pending: no second one.
        assert (
            await listeners.fire_due_crons(
                session, notify_publish, now=row.next_fire_at + timedelta(seconds=1)
            )
            == 0
        )

        fires = (
            await client.post(
                "/sand/automation-events/poll",
                json={"ackRunUuids": []},
                headers=headers,
            )
        ).json()["events"]
        assert len(fires) == 1
        assert fires[0]["scheduledForMs"] == int(slot.timestamp() * 1000)
        assert fires[0]["definitionRevision"] == "rev-cron"
        assert "event" not in fires[0]


@pytest.mark.asyncio
class TestWebhooks:
    async def test_a_minted_linear_webhook_fires_a_linear_routine(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        notify_publish: AsyncMock,
    ) -> None:
        headers = await _headers(client, session, user)
        minted = await client.post("/sand/listener-webhooks/linear", headers=headers)
        assert minted.status_code == 200, minted.text
        url, secret = minted.json()["url"], minted.json()["signingSecret"]
        assert url.startswith(settings.BASE_URL + "/sand/ingress/linear/")
        assert (
            await client.post("/sand/listener-webhooks/linear", headers=headers)
        ).json()["url"] == url
        await client.post(
            "/aiserver.v1.AutomationsService/CreateSandAutomation",
            json={
                "name": "Linear",
                "description": "sand-shadow:lin",
                "workflow": {
                    "triggers": [
                        {
                            "linear": {
                                "issueCreated": {},
                                "projectIds": [],
                                "teamIds": ["TEAM1"],
                            }
                        }
                    ],
                    "prompts": [{"prompt": "triage"}],
                },
                "enabled": True,
                "sandAgentId": "agent-1",
                "sandAutomationId": "auto-linear",
            },
            headers=headers,
        )
        raw = json.dumps(
            {
                "type": "Issue",
                "action": "create",
                "data": {
                    "identifier": "SIM-12",
                    "title": "Listeners",
                    "url": "https://linear.app/x",
                    "state": {"id": "S1", "name": "Todo"},
                    "team": {"id": "TEAM1"},
                },
            }
        ).encode()
        signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        path = url[len(settings.BASE_URL) :]
        delivered = await client.post(
            path,
            content=raw,
            headers={"content-type": "application/json", "linear-signature": signature},
        )
        assert delivered.status_code == 200, delivered.text
        fires = (
            await client.post(
                "/sand/automation-events/poll",
                json={"ackRunUuids": []},
                headers=headers,
            )
        ).json()["events"]
        assert len(fires) == 1
        assert fires[0]["event"] == {
            "source": "linear",
            "event": "issueCreated",
            "issueIdentifier": "SIM-12",
            "title": "Listeners",
            "url": "https://linear.app/x",
            "status": "Todo",
            "statusId": "S1",
            "teamId": "TEAM1",
            "timestampMs": fires[0]["event"]["timestampMs"],
        }
        refused = await client.post(
            path,
            content=raw,
            headers={"content-type": "application/json", "linear-signature": "nope"},
        )
        assert refused.status_code == 401
        assert (
            await client.post("/sand/ingress/linear/unknown-token", content=raw)
        ).status_code == 404


@pytest.mark.asyncio
class TestDashboardConnections:
    async def test_the_three_reads_and_the_install_url_on_our_host(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
    ) -> None:
        headers = await _headers(client, session, user)
        slack = (
            await client.post(
                "/aiserver.v1.DashboardService/GetSlackUserSettings",
                json={},
                headers=headers,
            )
        ).json()
        assert slack["hasSlackAuth"] is False
        scm = (
            await client.post(
                "/aiserver.v1.DashboardService/GetScmConnectionStatus",
                json={},
                headers=headers,
            )
        ).json()
        assert scm["connected"] is False
        install = (
            await client.post(
                "/aiserver.v1.DashboardService/GetSlackInstallUrl",
                json={},
                headers=headers,
            )
        ).json()
        assert install["url"] == settings.BASE_URL + "/sand/slack/install"
        await _slack_workspace(save_fixture, user)
        await _github_installation(save_fixture, user)
        assert (
            await client.post(
                "/aiserver.v1.DashboardService/GetSlackUserSettings",
                json={},
                headers=headers,
            )
        ).json()["hasSlackAuth"] is True
        assert (
            await client.post(
                "/aiserver.v1.DashboardService/GetScmConnectionStatus",
                json={},
                headers=headers,
            )
        ).json()["connected"] is True

    async def test_the_install_pages_name_the_missing_registration(
        self, client: httpx.AsyncClient
    ) -> None:
        anonymous = await client.get("/sand/slack/install", follow_redirects=False)
        assert anonymous.status_code == 303
        assert "/login?return_to=" in anonymous.headers["location"]
