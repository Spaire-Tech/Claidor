"""The person's language (20 October 2026): the apps tell it after every
sign-in and whenever it changes (`POST user/profile`), the account keeps it,
and the profile answers it. English is the source language: none reads as
English and changes nothing."""

from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop import voice
from simeon.desktop.language import normalize_language
from simeon.desktop.service import desktop
from simeon.desktop.voice import (
    VOICE_AGENT_NAME,
    VOICE_AGENT_VERSION_TAG,
    VOICE_LANGUAGES,
    ElevenLabsError,
    agent_config,
    ensure_agent,
    recap_for,
)
from simeon.models import User
from simeon.postgres import AsyncSession
from tests.desktop.test_voice import FakeElevenLabs

PROFILE = "/desktop/api/user/profile"


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


def test_a_language_tag_is_kept_as_bcp_47_writes_it() -> None:
    assert normalize_language("fr") == "fr"
    assert normalize_language(" FR ") == "fr"
    assert normalize_language("pt_br") == "pt-BR"
    assert normalize_language("zh-hant") == "zh-Hant"
    assert normalize_language("en-US") == "en-US"
    for junk in [None, "", "   ", "f", "français", "fr;q=0.9", "x" * 40, "12"]:
        assert normalize_language(junk) is None, junk


@pytest.mark.asyncio
class TestThePersonsLanguage:
    async def test_none_until_the_app_tells_it(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert "language" not in data

    async def test_the_profile_keeps_the_language(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        answer = await client.post(PROFILE, headers=headers, json={"language": "fr"})
        assert answer.status_code == 200
        assert answer.json()["data"]["language"] == "fr"
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert data["language"] == "fr"
        stored = await session.execute(select(User.language).where(User.id == user.id))
        assert stored.scalar_one() == "fr", "kept on the account"

        # Changed, then forgotten ("" is English again).
        await client.post(PROFILE, headers=headers, json={"language": "pt_BR"})
        assert (await client.get(PROFILE, headers=headers)).json()["data"][
            "language"
        ] == "pt-BR"
        await client.post(PROFILE, headers=headers, json={"language": ""})
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert "language" not in data

    async def test_anything_but_a_language_is_refused_and_nothing_changes(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        await client.post(PROFILE, headers=headers, json={"language": "fr"})
        answer = await client.post(
            PROFILE, headers=headers, json={"language": "<script>"}
        )
        assert answer.status_code == 400
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert data["language"] == "fr"

    async def test_a_body_without_the_language_changes_nothing(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        await client.post(PROFILE, headers=headers, json={"language": "fr"})
        answer = await client.post(PROFILE, headers=headers, json={})
        assert answer.status_code == 200
        assert answer.json()["data"]["language"] == "fr"

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        answer = await client.post(PROFILE, json={"language": "fr"})
        assert answer.status_code == 401


def test_the_voice_agent_speaks_french_too() -> None:
    config = agent_config(["tool"])
    presets = config["conversation_config"]["language_presets"]
    assert "fr" in presets
    first = presets["fr"]["overrides"]["agent"]["first_message"]
    assert first == VOICE_LANGUAGES["fr"]
    assert "!" not in first
    # English keeps its own voice model; the app may set the language per call.
    assert config["conversation_config"]["agent"]["language"] == "en"
    overrides = config["platform_settings"]["overrides"]
    assert overrides["conversation_config_override"]["agent"]["language"] is True


def test_a_french_recap_gets_the_name_in_front() -> None:
    assert recap_for("You asked me to book it.", "Bass") == (
        "Bass, you asked me to book it."
    )
    assert recap_for("Tu m’as demandé de réserver.", "Bass") == (
        "Bass, tu m’as demandé de réserver."
    )
    assert recap_for("Vous m’avez demandé de réserver.", "Bass") == (
        "Bass, vous m’avez demandé de réserver."
    )
    assert recap_for("Tuesday's meeting is moved.", "Bass") == (
        "Tuesday's meeting is moved."
    )
    assert recap_for("Tu m’as appelé.", None) == "Tu m’as appelé."


def test_a_spanish_recap_gets_the_name_in_front() -> None:
    assert recap_for("Tú me pediste reservarlo.", "Bass") == (
        "Bass, tú me pediste reservarlo."
    )
    assert recap_for("Usted me pidió reservarlo.", "Bass") == (
        "Bass, usted me pidió reservarlo."
    )
    assert recap_for("Tuvimos una llamada.", "Bass") == "Tuvimos una llamada."
    assert VOICE_LANGUAGES["es"] == "Hola, soy yo. ¿Qué tal?"


class RefusingLanguages(FakeElevenLabs):
    """ElevenLabs refusing an agent that has other languages."""

    async def update_agent(self, agent_id: str, config: dict[str, Any]) -> None:
        if config["conversation_config"].get("language_presets"):
            self.calls.append("update_agent_refused")
            raise ElevenLabsError(422, '{"detail":"language_presets"}', "/agents")
        await super().update_agent(agent_id, config)


@pytest.mark.asyncio
async def test_refused_languages_leave_english_calls_working(
    mocker: MockerFixture,
) -> None:
    mocker.patch.object(settings, "ELEVENLABS_AGENT_ID", "")
    voice.forget_agent()
    fake = RefusingLanguages()
    fake.agents["agent_old"] = {"name": VOICE_AGENT_NAME, "tags": ["v0"]}
    try:
        assert await ensure_agent(fake) == "agent_old"
    finally:
        voice.forget_agent()
    assert fake.calls.count("update_agent_refused") == 1
    written = fake.agents["agent_old"]
    assert "language_presets" not in written["conversation_config"]
    assert written["conversation_config"]["agent"]["language"] == "en"
    assert VOICE_AGENT_VERSION_TAG not in written["tags"], "tried again next start"
