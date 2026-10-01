"""Voice calls (`simeon/desktop/voice.py`): the platform agent found,
created and kept in sync, the call token, the bill when the app hangs up,
and the voice picker — with ElevenLabs replaced by a fake, so nothing
leaves the machine."""

from collections.abc import Iterator, Sequence
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import Row

from simeon.config import settings
from simeon.desktop import voice
from simeon.desktop.pricing import (
    VOICE_CALL_MAX_SECONDS,
    VOICE_CALL_MODEL,
    DesktopProvider,
    Usage,
    credits_for,
)
from simeon.desktop.service import desktop
from simeon.desktop.voice import (
    VOICE_AGENT_NAME,
    VOICE_AGENT_VERSION_TAG,
    VOICE_LLM,
    VOICE_TTS_MODEL,
    ElevenLabsClient,
    ElevenLabsError,
    ensure_agent,
)
from simeon.models import DesktopUsage, DesktopVoiceCall, User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

CALLS = "/desktop/api/proxy/v1/voice/calls"
VOICES = "/desktop/api/proxy/v1/voice/voices"


class FakeElevenLabs(ElevenLabsClient):
    """ElevenLabs as a few dictionaries. Every call is written down in
    `calls` so a test can say what was and was not asked."""

    def __init__(self) -> None:
        super().__init__("xi-test", "https://elevenlabs.test")
        self.calls: list[str] = []
        self.agents: dict[str, dict[str, Any]] = {}
        self.tools: dict[str, dict[str, Any]] = {}
        self.conversations: dict[str, dict[str, Any]] = {}
        self.voices: list[dict[str, Any]] = []
        self.account_voices: list[dict[str, Any]] = []
        self.token_error: ElevenLabsError | None = None
        self.conversation_error: ElevenLabsError | None = None
        self._next = 0

    def _id(self, prefix: str) -> str:
        self._next += 1
        return f"{prefix}_{self._next}"

    async def find_agents(self, search: str) -> list[dict[str, Any]]:
        self.calls.append("find_agents")
        return [
            {"agent_id": agent_id, "name": agent["name"], "created_at_unix_secs": i}
            for i, (agent_id, agent) in enumerate(self.agents.items())
            if search.lower() in agent["name"].lower()
        ]

    async def get_agent(self, agent_id: str) -> dict[str, Any]:
        self.calls.append("get_agent")
        return self.agents[agent_id]

    async def create_agent(self, config: dict[str, Any]) -> str:
        self.calls.append("create_agent")
        agent_id = self._id("agent")
        self.agents[agent_id] = config
        return agent_id

    async def update_agent(self, agent_id: str, config: dict[str, Any]) -> None:
        self.calls.append("update_agent")
        self.agents[agent_id] = config

    async def list_tools(self) -> list[dict[str, Any]]:
        self.calls.append("list_tools")
        return [
            {"id": tool_id, "tool_config": config}
            for tool_id, config in self.tools.items()
        ]

    async def create_tool(self, tool_config: dict[str, Any]) -> str:
        self.calls.append("create_tool")
        tool_id = self._id("tool")
        self.tools[tool_id] = tool_config
        return tool_id

    async def update_tool(self, tool_id: str, tool_config: dict[str, Any]) -> None:
        self.calls.append("update_tool")
        self.tools[tool_id] = tool_config

    async def conversation_token(self, agent_id: str) -> dict[str, Any]:
        self.calls.append("conversation_token")
        if self.token_error is not None:
            error, self.token_error = self.token_error, None
            raise error
        if agent_id not in self.agents and agent_id != settings.ELEVENLABS_AGENT_ID:
            raise ElevenLabsError(404, "agent not found", "token")
        return {"token": f"token-for-{agent_id}"}

    async def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        self.calls.append("get_conversation")
        if self.conversation_error is not None:
            raise self.conversation_error
        if conversation_id not in self.conversations:
            raise ElevenLabsError(404, "conversation not found", "conversations")
        return self.conversations[conversation_id]

    async def list_voices_by_id(self, voice_ids: list[str]) -> list[dict[str, Any]]:
        self.calls.append("list_voices_by_id")
        return [one for one in self.account_voices if one["voice_id"] in voice_ids]

    async def list_default_voices(self) -> list[dict[str, Any]]:
        self.calls.append("list_default_voices")
        return self.voices


@pytest.fixture(autouse=True)
def _voice_state(mocker: MockerFixture) -> Iterator[None]:
    voice.forget_agent()
    voice.forget_voices()
    mocker.patch.object(settings, "ELEVENLABS_API_KEY", "xi-test")
    mocker.patch.object(settings, "ELEVENLABS_AGENT_ID", "")
    yield
    voice.forget_agent()
    voice.forget_voices()


@pytest.fixture
def fake(mocker: MockerFixture) -> FakeElevenLabs:
    fake = FakeElevenLabs()
    mocker.patch.object(voice, "client", return_value=fake)
    return fake


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


async def _usage(session: AsyncSession) -> Sequence[Row[Any]]:
    return (await session.execute(DesktopUsage.__table__.select())).all()


async def _voice_calls(session: AsyncSession) -> Sequence[Row[Any]]:
    return (await session.execute(DesktopVoiceCall.__table__.select())).all()


def _conversation(agent_id: str, seconds: Any, summary: str | None = None) -> Any:
    answer: dict[str, Any] = {
        "agent_id": agent_id,
        "status": "done",
        "metadata": {"call_duration_secs": seconds},
    }
    if summary is not None:
        # ElevenLabs' own summary speaks of "the user" and is never shown;
        # our `recap` field is.
        answer["analysis"] = {
            "transcript_summary": "The user called the agent.",
            "data_collection_results": {
                "recap": {
                    "data_collection_id": "recap",
                    "value": summary,
                    "rationale": "",
                }
            },
        }
    return answer


class TestTheCatalogueEntry:
    def test_a_minute_costs_eight_cents_and_the_margin_in_credits(self) -> None:
        # $0.08 a minute, times the 1.25 margin, at $3.00 a million credits.
        assert credits_for(VOICE_CALL_MODEL, Usage(input_tokens=60)) == 33_333
        assert VOICE_CALL_MODEL.provider is DesktopProvider.elevenlabs
        assert VOICE_CALL_MODEL.role is None


@pytest.mark.asyncio
class TestThePlatformAgent:
    async def test_first_use_creates_the_tools_and_the_agent(
        self, fake: FakeElevenLabs
    ) -> None:
        agent_id = await ensure_agent(fake)

        config = fake.agents[agent_id]
        assert config["name"] == VOICE_AGENT_NAME
        assert VOICE_AGENT_VERSION_TAG in config["tags"]
        conversation = config["conversation_config"]
        prompt = conversation["agent"]["prompt"]
        assert prompt["llm"] == VOICE_LLM
        # No thinking before a reply: it was the wait on every turn.
        assert prompt["thinking_budget"] == 0
        assert set(prompt["built_in_tools"]) == {"end_call", "skip_turn"}
        assert sorted(prompt["tool_ids"]) == sorted(fake.tools)
        assert conversation["tts"]["model_id"] == VOICE_TTS_MODEL
        assert conversation["turn"] == {
            "turn_timeout": 7,
            "silence_end_call_timeout": 25,
            "turn_eagerness": "eager",
            "speculative_turn": True,
        }
        assert conversation["conversation"]["max_duration_seconds"] == 1800
        platform = config["platform_settings"]
        assert platform["auth"]["enable_auth"] is True
        assert platform["privacy"]["record_voice"] is False
        overrides = platform["overrides"]["conversation_config_override"]
        assert overrides["agent"] == {
            "prompt": {"prompt": True},
            "first_message": True,
            "language": True,
        }
        assert overrides["tts"] == {"voice_id": True}

        tools = {one["name"]: one for one in fake.tools.values()}
        assert set(tools) == {"send_task", "recall_text_messages"}
        hand = tools["send_task"]
        assert hand["type"] == "client"
        assert hand["parameters"]["required"] == ["task"]
        assert hand["expects_response"] is True
        assert hand["response_timeout_secs"] == 20
        assert hand["pre_tool_speech"] == "force"
        assert hand["parameters"]["properties"]["quote"]["type"] == "string"
        assert tools["recall_text_messages"]["expects_response"] is True

        # Known for the rest of the process: no second lookup.
        fake.calls.clear()
        assert await ensure_agent(fake) == agent_id
        assert fake.calls == []

    async def test_an_agent_at_this_version_is_used_as_it_is(
        self, fake: FakeElevenLabs
    ) -> None:
        fake.agents["agent_old"] = {
            "name": VOICE_AGENT_NAME,
            "tags": [VOICE_AGENT_VERSION_TAG],
        }
        assert await ensure_agent(fake) == "agent_old"
        assert "update_agent" not in fake.calls
        assert "create_agent" not in fake.calls
        assert "create_tool" not in fake.calls

    async def test_an_agent_at_an_older_version_is_rewritten_and_its_tools_kept(
        self, fake: FakeElevenLabs
    ) -> None:
        fake.agents["agent_old"] = {
            "name": VOICE_AGENT_NAME,
            "tags": ["simeon-voice-config-v0"],
        }
        fake.tools["tool_hand"] = {"type": "client", "name": "send_task"}
        fake.tools["tool_other"] = {"type": "webhook", "name": "recall_text_messages"}

        assert await ensure_agent(fake) == "agent_old"

        assert fake.calls.count("update_agent") == 1
        assert "create_agent" not in fake.calls
        # The client tool of that name is rewritten; a webhook tool of the
        # other name is not ours, so a client one is created beside it.
        assert fake.calls.count("update_tool") == 1
        assert fake.calls.count("create_tool") == 1
        assert fake.tools["tool_hand"]["response_timeout_secs"] == 20
        assert VOICE_AGENT_VERSION_TAG in fake.agents["agent_old"]["tags"]
        assert (
            "tool_hand"
            in (
                fake.agents["agent_old"]["conversation_config"]["agent"]["prompt"][
                    "tool_ids"
                ]
            )
        )

    async def test_the_agent_speaks_in_a_voice_the_workspace_has(
        self, fake: FakeElevenLabs
    ) -> None:
        # The first real call's agent was refused with `voice_not_found`: a
        # voice the workspace does not have fails the whole agent.
        michael = "ljX1ZrXuDIIRVcmiVSyR"
        fake.account_voices = [{"voice_id": michael, "name": "Michael (library)"}]
        fake.voices = [{"voice_id": "default-1", "name": "Someone"}]
        agent_id = await ensure_agent(fake)
        tts = fake.agents[agent_id]["conversation_config"]["tts"]
        assert tts["voice_id"] == michael, (
            "the first of the founder's voices the account has"
        )

        voice.forget_agent()
        fake.agents.clear()
        fake.account_voices = [
            {"voice_id": michael, "name": "Michael"},
            {"voice_id": voice.VOICE_DEFAULT_VOICE_ID, "name": "Jessica"},
        ]
        agent_id = await ensure_agent(fake)
        tts = fake.agents[agent_id]["conversation_config"]["tts"]
        assert tts["voice_id"] == voice.VOICE_DEFAULT_VOICE_ID

        voice.forget_agent()
        fake.agents.clear()
        fake.account_voices = []
        agent_id = await ensure_agent(fake)
        tts = fake.agents[agent_id]["conversation_config"]["tts"]
        assert tts["voice_id"] == "default-1", "none of them added: a default voice"

        voice.forget_agent()
        fake.agents.clear()
        fake.voices = []
        agent_id = await ensure_agent(fake)
        tts = fake.agents[agent_id]["conversation_config"]["tts"]
        assert tts["voice_id"] == voice.VOICE_FALLBACK_VOICE_ID

    async def test_an_agent_named_in_the_settings_is_never_touched(
        self, fake: FakeElevenLabs, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "ELEVENLABS_AGENT_ID", "agent_by_hand")
        assert await ensure_agent(fake) == "agent_by_hand"
        assert fake.calls == []


@pytest.mark.asyncio
class TestStartingACall:
    async def test_a_token_is_minted_for_the_platform_agent(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        response = await client.post(CALLS, headers=headers)
        assert response.status_code == 200, response.text
        body = response.json()
        (agent_id,) = fake.agents
        assert body == {
            "token": f"token-for-{agent_id}",
            "conversation_id": None,
            "agent_id": agent_id,
        }
        assert response.headers["cache-control"] == "no-store"
        # The key is Simeon's and stays here.
        assert "xi-test" not in response.text

    async def test_an_agent_deleted_behind_our_back_is_made_again(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        first = (await client.post(CALLS, headers=headers)).json()["agent_id"]
        fake.agents.clear()
        response = await client.post(CALLS, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["agent_id"] != first
        assert list(fake.agents) == [response.json()["agent_id"]]

    async def test_a_refusal_is_a_sentence_and_is_written_down(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
        mocker: MockerFixture,
    ) -> None:
        headers = await _signed_in(client, session, user)
        warn = mocker.patch.object(voice.log, "warning")
        fake.token_error = ElevenLabsError(401, '{"detail":"invalid key"}', "token")
        response = await client.post(CALLS, headers=headers)
        assert response.status_code == 502
        assert response.json()["error"]["message"] == (
            "The voice service refused the call."
        )
        logged = [
            c
            for c in warn.call_args_list
            if c.args[0] == "desktop.voice.upstream_refused"
        ]
        assert len(logged) == 1
        assert "invalid key" in logged[0].kwargs["body"]

    async def test_without_a_key_or_with_no_credits_left_nothing_is_asked(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        headers = await _signed_in(client, session, user)
        mocker.patch.object(settings, "ELEVENLABS_API_KEY", "")
        response = await client.post(CALLS, headers=headers)
        assert response.status_code == 503
        assert response.json()["error"]["message"] == (
            "Voice calls are not switched on on this server."
        )

        mocker.patch.object(settings, "ELEVENLABS_API_KEY", "xi-test")
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-5.6-terra",
                credits=settings.DESKTOP_MONTHLY_CREDITS,
                upstream_status=200,
            )
        )
        response = await client.post(CALLS, headers=headers)
        assert response.status_code == 402
        assert fake.calls == []

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        assert (await client.post(CALLS)).status_code == 401
        assert (await client.post(f"{CALLS}/conv_1/end", json={})).status_code == 401
        assert (await client.get(VOICES)).status_code == 401


@pytest.mark.asyncio
class TestEndingACall:
    async def test_the_seconds_elevenlabs_reports_are_billed_once(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        agent_id = (await client.post(CALLS, headers=headers)).json()["agent_id"]
        fake.conversations["conv_1"] = _conversation(agent_id, 94.2)

        response = await client.post(
            f"{CALLS}/conv_1/end", headers=headers, json={"seconds": 400}
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"seconds": 95, "summary": None, "transcript": []}

        rows = await _usage(session)
        assert [(row.model, row.provider, row.input_tokens) for row in rows] == [
            (VOICE_CALL_MODEL.model_id, "elevenlabs", 95)
        ]
        assert rows[0].credits == credits_for(VOICE_CALL_MODEL, Usage(input_tokens=95))
        (call,) = await _voice_calls(session)
        assert (call.seconds, call.duration_source) == (95, "provider")

        # Asked again once the summary is written: the summary, no new bill.
        fake.conversations["conv_1"] = _conversation(
            agent_id, 94.2, "You asked me to book a table. Done."
        )
        again = await client.post(
            f"{CALLS}/conv_1/end", headers=headers, json={"seconds": 400}
        )
        assert again.status_code == 200
        assert again.json() == {
            "seconds": 95,
            "summary": "You asked me to book a table. Done.",
            "transcript": [],
        }
        assert len(await _usage(session)) == 1

        # With a name, the recap is addressed to the person by it.
        renamed = await client.post(
            "/desktop/api/user/name", headers=headers, json={"name": "  Bass "}
        )
        assert renamed.json()["data"]["preferredName"] == "Bass"
        named = await client.post(
            f"{CALLS}/conv_1/end", headers=headers, json={"seconds": 400}
        )
        assert named.json()["summary"] == "Bass, you asked me to book a table. Done."

    async def test_without_a_duration_the_app_count_is_billed_capped(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        fake.conversation_error = ElevenLabsError(0, "connection reset", "conv")
        response = await client.post(
            f"{CALLS}/conv_2/end", headers=headers, json={"seconds": 99_999}
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "seconds": VOICE_CALL_MAX_SECONDS,
            "summary": None,
            "transcript": [],
        }
        (call,) = await _voice_calls(session)
        assert call.duration_source == "app"

    async def test_a_call_billed_to_one_person_is_not_anothers(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        agent_id = (await client.post(CALLS, headers=headers)).json()["agent_id"]
        fake.conversations["conv_3"] = _conversation(agent_id, 10, "Private.")
        assert (
            await client.post(f"{CALLS}/conv_3/end", headers=headers, json={})
        ).status_code == 200

        other = await _signed_in(client, session, user_second)
        response = await client.post(f"{CALLS}/conv_3/end", headers=other, json={})
        assert response.status_code == 404
        assert "Private" not in response.text
        assert len(await _usage(session)) == 1

    async def test_a_conversation_of_another_agent_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        await client.post(CALLS, headers=headers)
        fake.conversations["conv_4"] = _conversation("agent_someone_else", 60)
        response = await client.post(f"{CALLS}/conv_4/end", headers=headers, json={})
        assert response.status_code == 404
        assert await _usage(session) == []

    async def test_bad_input_is_refused_before_elevenlabs(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        headers = await _signed_in(client, session, user)
        bad_seconds = await client.post(
            f"{CALLS}/conv_5/end", headers=headers, json={"seconds": "a while"}
        )
        assert bad_seconds.status_code == 400
        bad_id = await client.post(
            f"{CALLS}/conv.5/end", headers=headers, json={"seconds": 3}
        )
        assert bad_id.status_code == 400
        assert fake.calls == []


@pytest.mark.asyncio
class TestTheVoicePicker:
    async def test_the_founders_voices_by_name_only_in_order_and_cached(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        fake.account_voices = [
            {
                "voice_id": "ljX1ZrXuDIIRVcmiVSyR",
                "name": "Michael - Deep, Resonant and Confident",
                "description": "A deep voice for narration",
                "labels": {"accent": "american"},
                "preview_url": "https://cdn.test/michael.mp3",
            },
            {
                "voice_id": "r1KmysJdVYZjJCm4mL3b",
                "name": "Jessica - Playful, Bright, Warm",
                "description": None,
                "labels": None,
                "preview_url": "https://cdn.test/jessica.mp3",
            },
        ]
        headers = await _signed_in(client, session, user)
        response = await client.get(VOICES, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json() == [
            {
                "id": "r1KmysJdVYZjJCm4mL3b",
                "name": "Jessica",
                "description": None,
                "labels": {},
                "preview_url": "https://cdn.test/jessica.mp3",
            },
            {
                "id": "ljX1ZrXuDIIRVcmiVSyR",
                "name": "Michael",
                "description": None,
                "labels": {},
                "preview_url": "https://cdn.test/michael.mp3",
            },
        ]
        assert (await client.get(VOICES, headers=headers)).status_code == 200
        assert fake.calls == ["list_voices_by_id"]

    async def test_without_any_of_them_the_defaults_are_offered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
    ) -> None:
        fake.voices = [
            {"voice_id": "cjVigY5qzO86Huf0OWal", "name": "Eric", "description": "x"}
        ]
        headers = await _signed_in(client, session, user)
        rows = (await client.get(VOICES, headers=headers)).json()
        assert [(row["id"], row["name"], row["description"]) for row in rows] == [
            ("cjVigY5qzO86Huf0OWal", "Eric", None)
        ]
        assert fake.calls == ["list_voices_by_id", "list_default_voices"]

    def test_fourteen_voices_each_once(self) -> None:
        ids = [voice_id for voice_id, _ in voice.CURATED_VOICES]
        assert len(ids) == 14
        assert len(set(ids)) == 14
        assert voice.CURATED_VOICES[0] == (voice.VOICE_DEFAULT_VOICE_ID, "Jessica")

    async def test_no_key_is_503(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        fake: FakeElevenLabs,
        mocker: MockerFixture,
    ) -> None:
        headers = await _signed_in(client, session, user)
        mocker.patch.object(settings, "ELEVENLABS_API_KEY", "")
        assert (await client.get(VOICES, headers=headers)).status_code == 503
        assert fake.calls == []


@pytest.mark.asyncio
class TestTheClient:
    async def test_every_request_carries_the_key_and_a_refusal_is_an_error(
        self, mocker: MockerFixture
    ) -> None:
        seen: list[httpx.Request] = []

        def answer(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path == "/v1/convai/conversation/token":
                return httpx.Response(200, json={"token": "t"})
            return httpx.Response(422, json={"detail": "bad"})

        transport = httpx.MockTransport(answer)
        real = httpx.AsyncClient
        mocker.patch.object(
            httpx,
            "AsyncClient",
            lambda **kwargs: real(transport=transport, **kwargs),
        )
        api = ElevenLabsClient("xi-key", "https://elevenlabs.test/")
        assert await api.conversation_token("agent_1") == {"token": "t"}
        assert seen[0].headers["xi-api-key"] == "xi-key"
        assert seen[0].url.params["agent_id"] == "agent_1"
        with pytest.raises(ElevenLabsError) as raised:
            await api.update_agent("agent_1", {})
        assert raised.value.status == 422
        assert seen[1].method == "PATCH"
        assert seen[1].url.path == "/v1/convai/agents/agent_1"


def test_an_english_agent_uses_a_model_elevenlabs_accepts_for_english() -> None:
    # ElevenLabs refuses an English agent on any other model ("English Agents
    # must use turbo or flash v2"), the first real call's failure.
    from simeon.desktop.voice import VOICE_DEFAULT_LANGUAGE, agent_config

    config = agent_config([])["conversation_config"]
    assert config["agent"]["language"] == VOICE_DEFAULT_LANGUAGE == "en"
    assert config["tts"]["model_id"] in {"eleven_flash_v2", "eleven_turbo_v2"}


def test_the_recap_is_our_own_field_and_never_the_user() -> None:
    from simeon.desktop.voice import VOICE_RECAP_FIELD, agent_config, recap_for

    field = agent_config([])["platform_settings"]["data_collection"][VOICE_RECAP_FIELD]
    assert field["type"] == "string"
    assert "Never write 'the user'" in field["description"]
    assert recap_for("You called to test the voice.", "Bass") == (
        "Bass, you called to test the voice."
    )
    assert recap_for("You'll get the numbers by noon.", "Bass") == (
        "Bass, you'll get the numbers by noon."
    )
    assert recap_for("Your invoice went out.", "Bass") == "Your invoice went out."
    assert recap_for("You called.", None) == "You called."
    assert recap_for(None, "Bass") is None


def test_the_recap_is_read_from_the_list_form_too() -> None:
    from simeon.desktop.voice import _summary

    listed = {
        "analysis": {
            "data_collection_results_list": [
                {"data_collection_id": "other", "value": "x", "rationale": ""},
                {
                    "data_collection_id": "recap",
                    "value": " You called. ",
                    "rationale": "",
                },
            ]
        }
    }
    assert _summary(listed) == "You called."
    assert _summary({"analysis": {"transcript_summary": "The user called."}}) is None


def test_the_transcript_is_handed_back_for_the_record() -> None:
    from simeon.desktop.voice import _transcript

    conversation = {
        "transcript": [
            {"role": "agent", "message": " Hey Bass, it's Ada. "},
            {"role": "user", "message": "Move Friday's review to Monday."},
            {"role": "agent", "message": None, "tool_calls": [{}]},
            "not a line",
        ]
    }
    assert _transcript(conversation) == [
        {"speaker": "agent", "text": "Hey Bass, it's Ada."},
        {"speaker": "user", "text": "Move Friday's review to Monday."},
    ]
    assert _transcript(None) == []


def test_the_call_latency_line_reads_elevenlabs_own_turn_metrics() -> None:
    from simeon.desktop.voice import turn_latency

    def turn(llm: float, tts: float) -> dict[str, Any]:
        return {
            "role": "agent",
            "message": "Sure.",
            "producing_llm": "gemini-2.5-flash",
            "conversation_turn_metrics": {
                "metrics": {
                    "convai_llm_service_ttfb": {"elapsed_time": llm},
                    "convai_tts_service_ttfb": {"elapsed_time": tts},
                }
            },
        }

    conversation = {
        "transcript": [
            {"role": "user", "message": "Hi"},
            turn(0.4, 0.1),
            turn(2.5, 0.2),
            turn(0.6, 0.1),
            {"role": "agent", "message": "No metrics."},
        ]
    }
    assert turn_latency(conversation) == {
        "convai_llm_service_ttfb_median": 0.6,
        "convai_llm_service_ttfb_max": 2.5,
        "convai_tts_service_ttfb_median": 0.1,
        "convai_tts_service_ttfb_max": 0.2,
        "llm": "gemini-2.5-flash",
    }
    assert turn_latency(None) == {}
