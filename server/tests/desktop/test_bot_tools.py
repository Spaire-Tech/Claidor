"""What a bot does for its person beyond the network (`simeon/desktop/bot_tools.py`,
10 November 2026): it reads the person's agents, chats, files, memory and plan
from the server's copy, and has the person's computer answer a card, make an
agent or run a routine, as an app's button does. The computer is a stand-in
here: it records each command and answers what the real one answers."""

from __future__ import annotations

import base64
import time
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.desktop import bot_tools, network
from simeon.desktop.chat_repository import DesktopChatInboxRepository
from simeon.models import DesktopMemoryFile, SandBox, User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

from .test_chats import _copy, _line, _signed_in_with_box
from .test_mcp import _bot, _hello, _rpc, _said, _tool

NOW = int(time.time() * 1000)

AGENTS = [
    {
        "id": "iris",
        "name": "Iris",
        "title": "Travel",
        "isRunning": True,
        "currentActivity": {"kind": "tool", "label": "Searching flights"},
        "lastMessagePreview": "Looking now.",
    },
    {
        "id": "theo",
        "name": "Theo",
        "title": "Ops",
        "awaitingUserResponse": {"reason": "Which card to pay with"},
    },
]

QUESTION = {
    "kind": "send-message",
    "id": "q1",
    "timestampMs": NOW + 1_000,
    "message": {
        "type": "widget",
        "widget": {
            "prompt": "Which flight?",
            "options": [
                {"label": "9am", "value": "flight-9"},
                {"label": "1pm", "value": "flight-13"},
            ],
        },
    },
}

SEVERAL = {
    "kind": "send-message",
    "id": "q2",
    "timestampMs": NOW + 2_000,
    "message": {
        "type": "widget",
        "widget": {
            "prompt": "Seat?",
            "options": [{"label": "Window"}, {"label": "Aisle"}],
            "questions": [
                {
                    "prompt": "Seat?",
                    "options": [{"label": "Window"}, {"label": "Aisle"}],
                },
                {
                    "prompt": "Bags",
                    "options": [{"label": "None"}, {"label": "One"}],
                    "allowCustom": True,
                },
            ],
        },
    },
}

APPROVAL = {
    "kind": "send-message",
    "id": "ap1",
    "timestampMs": NOW + 3_000,
    "message": {
        "type": "auto-review-approval",
        "approval": {
            "requestId": "req-7",
            "summary": "Run the deploy script",
            "command": "./deploy.sh",
            "status": "pending",
        },
    },
}

SECRET = {
    "kind": "send-message",
    "id": "s1",
    "timestampMs": NOW + 4_000,
    "message": {"type": "secret-request", "secretRequest": {"label": "Stripe key"}},
}

REPORT = {
    "kind": "send-message",
    "id": "f1",
    "timestampMs": NOW + 5_000,
    "message": {
        "type": "attachment",
        "url": "file:///home/box/agents/iris/attachments/ab12.md",
        "file_name": "Trip plan.md",
    },
}

PHOTO = {
    "kind": "send-message",
    "id": "f2",
    "timestampMs": NOW + 6_000,
    "message": {
        "type": "attachment",
        "url": "file:///home/box/agents/iris/attachments/cd34.png",
        "file_name": "Seat map.png",
    },
}

ROUTINES = [
    {
        "id": "r1",
        "agentId": "iris",
        "name": "Morning brief",
        "prompt": "Send me today's flights.",
        "trigger": {"type": "cron", "schedule": "0 8 * * *"},
        "triggerDescription": "Every day at 8:00 AM",
        "isEnabled": True,
        "nextRunAt": NOW + 3_600_000,
        "runs": [{"id": "run1", "status": "ok", "at": NOW - 60_000}],
    }
]


class Computer:
    """The person's computer as a stand-in: what it was asked, and its answers."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.routines = [dict(r) for r in ROUTINES]

    async def __call__(self, box: SandBox, method: str, args: dict[str, Any]) -> Any:
        self.calls.append((method, args))
        if method == "listAgents":
            # The computer's own list, with what each agent is doing now.
            return AGENTS
        if method == "createAgent":
            return {"agent": {"id": "nora", "name": args["name"]}, "transcript": []}
        if method == "listAllAutomations":
            return self.routines
        if method == "getAgentAutomations":
            return [r for r in self.routines if r["agentId"] == args["id"]]
        if method == "createAgentAutomation":
            self.routines.append(
                {"id": "r2", "agentId": args["id"], **args["spec"], "runs": []}
            )
            return [r for r in self.routines if r["agentId"] == args["id"]]
        if method == "setAgentAutomationEnabled":
            return self.routines
        if method == "readAttachmentText":
            return {
                "kind": "text",
                "text": "# Trip\nLisbon, 3 days.",
                "truncated": False,
            }
        if method == "readAttachmentImage":
            data = base64.b64encode(b"\x89PNG fake").decode()
            return {"dataUrl": f"data:image/png;base64,{data}", "width": 1, "height": 1}
        return None

    def methods(self) -> list[str]:
        return [method for method, _ in self.calls]


@pytest.fixture
def published(mocker: MockerFixture) -> Any:
    return mocker.patch.object(network, "publish", new=mocker.AsyncMock())


@pytest.fixture
def stand_in() -> Any:
    computer = Computer()
    bot_tools.set_send_for_tests(computer)
    yield computer
    bot_tools.set_send_for_tests(None)


async def _box(
    save_fixture: SaveFixture, user: User, state: str = "running"
) -> SandBox:
    box = SandBox(
        user_id=user.id,
        provider="e2b-1",
        provider_box_id="sbx-test",
        host_address="e2b.app",
        ports={},
        gateway_token="g",
        network_token="n",
        host_meta={"kind": "e2b", "traffic_token": "t"},
        state=state,
    )
    await save_fixture(box)
    return box


async def _setup(
    client: httpx.AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    user: User,
    *lines: dict[str, Any],
) -> tuple[dict[str, str], dict[str, str]]:
    """The person's agents and Iris's chat in the server's copy, and a bot
    signed in as them: (the computer's headers, the bot's)."""
    _, box = await _signed_in_with_box(client, session, user)
    await _copy(client, box, agents=AGENTS)
    if lines:
        await _copy(
            client, box, lines=[{"agentId": "iris", "entry": line} for line in lines]
        )
    bot = await _hello(client, await _bot(save_fixture, user, ["agents"]), "openai-mcp")
    return box, bot


@pytest.mark.asyncio
class TestOffered:
    async def test_the_persons_tools_follow_the_networks(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        bot = await _hello(
            client, await _bot(save_fixture, user, ["agents"]), "openai-mcp"
        )
        tools = (await _rpc(client, bot, "tools/list"))["result"]["tools"]
        assert [t["name"] for t in tools][4:] == list(bot_tools.NAMES)
        assert len({t["name"] for t in tools}) == len(tools)
        for tool in tools:
            assert tool["inputSchema"]["type"] == "object"
            assert tool["description"]


def test_only_the_named_commands_reach_the_computer() -> None:
    assert "answerPurchase" not in bot_tools.COMMANDS
    assert "answerCredentialRequest" not in bot_tools.COMMANDS
    assert "submitSecret" not in bot_tools.COMMANDS


@pytest.mark.asyncio
class TestAgents:
    async def test_what_each_agent_is_doing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
    ) -> None:
        _, bot = await _setup(client, session, save_fixture, user)
        asleep = await _said(client, bot, "agent_status")
        assert asleep["computer"] == "asleep"
        # A computer asleep runs nothing, and is not woken to be asked.
        assert [a["status"] for a in asleep["agents"]] == ["idle", "waiting on you"]
        assert stand_in.calls == []

        await _box(save_fixture, user)
        found = await _said(client, bot, "agent_status")
        iris, theo = found["agents"]
        assert (iris["name"], iris["status"], iris["doing"]) == (
            "Iris",
            "working",
            "Searching flights",
        )
        assert iris["lastMessage"] == "Looking now."
        assert (theo["status"], theo["waitingFor"]) == (
            "waiting on you",
            "Which card to pay with",
        )
        one = await _said(client, bot, "agent_status", agent="ana/theo")
        assert one["agent"]["name"] == "Theo"
        refused = await _tool(client, bot, "agent_status", agent="Zed")
        assert refused["isError"] is True
        assert "Iris, Theo" in refused["content"][0]["text"]

    async def test_reading_a_chat(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, bot = await _setup(
            client,
            session,
            save_fixture,
            user,
            _line("u1", "Find me a flight to Lisbon", NOW),
            QUESTION,
            {**REPORT, "timestampMs": NOW + 1_500},
            {"kind": "tool-call", "id": "t1", "timestampMs": NOW + 1_600},
        )
        chat = await _said(client, bot, "read_chat", agent="Iris")
        assert chat["agent"] == "Iris"
        lines = chat["lines"]
        assert [
            (line["from"], line.get("text") or line.get("file")) for line in lines
        ] == [
            ("you", "Find me a flight to Lisbon"),
            ("Iris", "Which flight?"),
            ("Iris", "Trip plan.md"),
        ]
        assert lines[1]["card"] == "question"
        assert lines[1]["waiting"] is True
        assert [
            line["id"]
            for line in (await _said(client, bot, "read_chat", agent="iris", limit=1))[
                "lines"
            ]
        ] == ["f1"]

    async def test_making_an_agent(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
    ) -> None:
        _, bot = await _setup(client, session, save_fixture, user)
        await _box(save_fixture, user)
        made = await _said(
            client,
            bot,
            "create_agent",
            name="Nora",
            role="Researcher",
            instructions="Watch our competitors' pricing.",
        )
        assert made["agent"] == {"id": "nora", "name": "Nora", "role": "Researcher"}
        ((method, args),) = stand_in.calls
        assert method == "createAgent"
        assert args["name"] == "Nora"
        assert args["title"] == "Researcher"
        assert args["description"] == "Watch our competitors' pricing."
        assert args["isKickstartRequested"] is True
        assert args["clientNonce"].startswith("mcp-")


@pytest.mark.asyncio
class TestComputerAsleep:
    async def test_a_sleeping_computer_is_woken_and_the_bot_told_to_call_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
        mocker: MockerFixture,
    ) -> None:
        enqueued = mocker.patch.object(bot_tools, "enqueue_job")
        _, bot = await _setup(client, session, save_fixture, user)
        refused = await _tool(client, bot, "create_agent", name="Nora")
        assert refused["isError"] is True
        assert "isn't set up yet" in refused["content"][0]["text"]
        enqueued.assert_not_called()

        await _box(save_fixture, user, state="hibernated")
        refused = await _tool(client, bot, "create_agent", name="Nora")
        assert refused["content"][0]["text"] == bot_tools.ASLEEP
        enqueued.assert_called_once_with("sand.box.wake", user_id=str(user.id))
        # Asked again at once: the start is not asked twice.
        await _tool(client, bot, "list_routines")
        assert enqueued.call_count == 1
        assert stand_in.calls == []

    async def test_a_computer_that_does_not_answer_is_woken_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        enqueued = mocker.patch.object(bot_tools, "enqueue_job")

        async def frozen(box: SandBox, method: str, args: dict[str, Any]) -> Any:
            raise httpx.ConnectError("The sandbox was not found")

        bot_tools.set_send_for_tests(frozen)
        try:
            _, bot = await _setup(client, session, save_fixture, user)
            await _box(save_fixture, user)
            refused = await _tool(client, bot, "list_routines")
        finally:
            bot_tools.set_send_for_tests(None)
        assert refused["content"][0]["text"] == bot_tools.UNREACHABLE
        enqueued.assert_called_once()

    async def test_no_other_command(self, session: AsyncSession, user: User) -> None:
        with pytest.raises(ValueError, match="not a bot command"):
            await bot_tools.computer(session, None, user.id, "answerPurchase", {})


@pytest.mark.asyncio
class TestWaitingCards:
    async def test_questions_and_approvals_are_listed_and_answered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
    ) -> None:
        _, bot = await _setup(
            client,
            session,
            save_fixture,
            user,
            QUESTION,
            SEVERAL,
            APPROVAL,
            SECRET,
            {**QUESTION, "id": "q0", "respondedValue": "flight-9"},
        )
        await _box(save_fixture, user)
        waiting = (await _said(client, bot, "list_waiting"))["waiting"]
        assert [(w["agent"], w.get("card"), w["kind"]) for w in waiting] == [
            ("Iris", "s1", "a password or a key"),
            ("Iris", "ap1", "approval"),
            ("Iris", "q2", "question"),
            ("Iris", "q1", "question"),
            # Theo waits on the person without a card the bot can answer.
            ("Theo", None, "waiting on your user"),
        ]
        assert waiting[0]["answerIn"] == "the Simeon app"
        assert waiting[1]["command"] == "./deploy.sh"
        assert [q["prompt"] for q in waiting[2]["questions"]] == ["Seat?", "Bags"]
        assert waiting[3]["questions"][0]["options"][0] == {
            "label": "9am",
            "value": "flight-9",
        }

        await _said(
            client, bot, "answer_question", agent="Iris", card="q1", answer="9AM"
        )
        await _said(
            client,
            bot,
            "answer_question",
            agent="Iris",
            card="q2",
            answers=["Aisle", "Two small ones"],
        )
        refused = await _tool(
            client, bot, "answer_question", agent="Iris", card="q1", answer="noon"
        )
        assert "9am, 1pm" in refused["content"][0]["text"]
        app_only = await _tool(
            client, bot, "answer_question", agent="Iris", card="s1", answer="x"
        )
        assert "Simeon app" in app_only["content"][0]["text"]
        decided = await _said(
            client, bot, "answer_approval", agent="Iris", card="ap1", decision="approve"
        )
        assert decided["decision"] == "approved"
        assert stand_in.calls == [
            (
                "respondToWidget",
                {"agentId": "iris", "entryId": "q1", "value": "flight-9"},
            ),
            (
                "respondToWidget",
                {
                    "agentId": "iris",
                    "entryId": "q2",
                    "value": "Seat? Aisle\nBags: Two small ones",
                },
            ),
            (
                "resolveAutoReviewApproval",
                {
                    "requestId": "req-7",
                    "resolution": "approved",
                    "entryId": "ap1",
                    "agentId": "iris",
                },
            ),
        ]

    async def test_a_card_answered_meanwhile_is_not_answered_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
    ) -> None:
        box, bot = await _setup(client, session, save_fixture, user, QUESTION)
        await _box(save_fixture, user)
        await _copy(
            client,
            box,
            lines=[
                {
                    "agentId": "iris",
                    "entry": {**QUESTION, "respondedValue": "flight-13"},
                }
            ],
        )
        refused = await _tool(
            client, bot, "answer_question", agent="Iris", card="q1", answer="9am"
        )
        assert "isn't waiting" in refused["content"][0]["text"]
        assert stand_in.calls == []


@pytest.mark.asyncio
class TestMessages:
    async def test_where_a_message_is(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        published: Any,
        stand_in: Computer,
    ) -> None:
        box, bot = await _setup(client, session, save_fixture, user)
        (sent,) = (
            await _said(client, bot, "send_message", to="iris", message="Lisbon?")
        )["sent"]
        status = await _said(client, bot, "message_status", id=sent["id"])
        assert status["status"] == "waiting for the computer"
        (waiting,) = await DesktopChatInboxRepository.from_session(session).waiting(
            user.id, 10
        )
        await _copy(
            client,
            box,
            lines=[
                {
                    "agentId": "iris",
                    "entry": _line(
                        "u1", "Dots: Lisbon?", NOW, clientNonce=waiting.nonce
                    ),
                }
            ],
        )
        assert (await _said(client, bot, "message_status", id=sent["id"]))[
            "status"
        ] == "taken"
        await _box(save_fixture, user)
        working = await _said(client, bot, "message_status", id=sent["id"])
        assert (working["status"], working["doing"]) == (
            "being worked on",
            "Searching flights",
        )
        refused = await _tool(client, bot, "message_status", id="nope")
        assert refused["isError"] is True


@pytest.mark.asyncio
class TestRoutines:
    async def test_listing_making_running_and_pausing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
    ) -> None:
        _, bot = await _setup(client, session, save_fixture, user)
        await _box(save_fixture, user)
        (routine,) = (await _said(client, bot, "list_routines"))["routines"]
        assert routine["name"] == "Morning brief"
        assert routine["agent"] == "Iris"
        assert routine["when"] == "Every day at 8:00 AM"
        assert routine["paused"] is False
        assert routine["lastRun"]["status"] == "ok"

        refused = await _tool(
            client,
            bot,
            "create_routine",
            agent="Iris",
            name="Weekly",
            prompt="Sum up.",
            schedule="weekly",
        )
        assert "cron" in refused["content"][0]["text"]
        made = await _said(
            client,
            bot,
            "create_routine",
            agent="Iris",
            name="Weekly",
            prompt="Sum up the week.",
            schedule="0  9 * * 1",
        )
        assert made["routine"]["id"] == "r2"
        await _said(client, bot, "run_routine", agent="Iris", routine="morning brief")
        paused = await _said(client, bot, "pause_routine", agent="Iris", routine="r2")
        assert paused["paused"] is True
        assert [c for c in stand_in.calls if c[0] != "getAgentAutomations"] == [
            ("listAllAutomations", {}),
            (
                "createAgentAutomation",
                {
                    "id": "iris",
                    "spec": {
                        "name": "Weekly",
                        "prompt": "Sum up the week.",
                        "trigger": {"type": "cron", "schedule": "0 9 * * 1"},
                        "isEnabled": True,
                    },
                },
            ),
            ("runAgentAutomationNow", {"id": "iris", "automationId": "r1"}),
            (
                "setAgentAutomationEnabled",
                {"id": "iris", "automationId": "r2", "isEnabled": False},
            ),
        ]


@pytest.mark.asyncio
class TestFiles:
    async def test_files_are_listed_and_read(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        stand_in: Computer,
    ) -> None:
        _, bot = await _setup(
            client,
            session,
            save_fixture,
            user,
            REPORT,
            PHOTO,
            {
                "kind": "user-attachment",
                "id": "ua1",
                "file_path": "/home/box/agents/iris/attachments/ef56.pdf",
                "file_name": "Passport.pdf",
                "timestampMs": NOW + 7_000,
            },
        )
        files = (await _said(client, bot, "list_files"))["files"]
        assert [(f["name"], f["from"]) for f in files] == [
            ("Passport.pdf", "you"),
            ("Seat map.png", "Iris"),
            ("Trip plan.md", "Iris"),
        ]
        assert files[2]["path"] == "/home/box/agents/iris/attachments/ab12.md"

        await _box(save_fixture, user)
        text = await _said(client, bot, "read_file", agent="Iris", file="trip plan.md")
        assert (text["kind"], text["text"]) == ("text", "# Trip\nLisbon, 3 days.")
        picture = await _tool(
            client, bot, "read_file", agent="Iris", file="Seat map.png"
        )
        assert picture["structuredContent"]["kind"] == "picture"
        image = picture["content"][1]
        assert (image["type"], image["mimeType"]) == ("image", "image/png")
        assert base64.b64decode(image["data"]) == b"\x89PNG fake"
        assert stand_in.calls == [
            (
                "readAttachmentText",
                {
                    "path": "/home/box/agents/iris/attachments/ab12.md",
                    "agentId": "iris",
                },
            ),
            (
                "readAttachmentImage",
                {"path": "/home/box/agents/iris/attachments/cd34.png"},
            ),
        ]


@pytest.mark.asyncio
class TestMemoryAndUsage:
    async def test_memory_is_searched_and_read(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        for name, content in (
            ("MEMORY.md", "Prefers aisle seats. Flies TAP to Lisbon."),
            ("USER.md", "Ana, product designer in Montreal."),
            ("memory/2026-11-10.md", "Booked the Lisbon trip for March."),
        ):
            await save_fixture(
                DesktopMemoryFile(user_id=user.id, name=name, content=content)
            )
        _, bot = await _setup(client, session, save_fixture, user)
        found = (await _said(client, bot, "search_memory", text="lisbon"))["found"]
        assert [f["name"] for f in found] == ["memory/2026-11-10.md", "MEMORY.md"]
        assert "Lisbon" in found[1]["snippet"]
        listed = await _said(client, bot, "read_memory")
        assert {f["name"] for f in listed["files"]} == {
            "MEMORY.md",
            "USER.md",
            "memory/2026-11-10.md",
        }
        assert (await _said(client, bot, "read_memory", name="user.md"))[
            "text"
        ].startswith("Ana")

    async def test_what_is_left_of_the_plan(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, bot = await _setup(client, session, save_fixture, user)
        usage = await _said(client, bot, "usage")
        assert usage["planName"]
        assert usage["creditsRemaining"] == usage["creditsLimit"] - usage["creditsUsed"]
        assert "periodEnd" in usage
