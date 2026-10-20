"""Signing in and the account in the person's language (20 October 2026,
docs/localization.md): the apps' refusals, the sign-in pages the browser
shows and the sign-in code's email follow the request's `Accept-Language`;
without one, or in English, they read as before."""

from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.desktop import passwords
from simeon.desktop.words import say
from simeon.login_code import service as login_code_module

FRENCH = {"Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"}


@pytest.mark.asyncio
class TestTheAppsRefusals:
    async def test_a_bad_email_is_refused_in_the_requests_language(
        self, client: httpx.AsyncClient
    ) -> None:
        english = await client.post("/auth/email/code", json={"email": "not an email"})
        assert english.status_code == 400
        assert english.json() == {
            "error": "bad_email",
            "message": "Enter a valid email address.",
        }
        french = await client.post(
            "/auth/email/code", json={"email": "not an email"}, headers=FRENCH
        )
        assert french.status_code == 400
        assert french.json() == {
            "error": "bad_email",
            "message": "Saisis une adresse e-mail valide.",
        }

    async def test_a_language_simeon_is_not_in_reads_english(
        self, client: httpx.AsyncClient
    ) -> None:
        answer = await client.post(
            "/auth/email/code",
            json={"email": "not an email"},
            headers={"Accept-Language": "ja"},
        )
        assert answer.json()["message"] == "Enter a valid email address."


def test_a_password_problem_is_the_requests_language() -> None:
    assert passwords.password_problem("short", "a@b.co") == "Use at least 8 characters."
    assert say("password.too_short", language="fr", count=8) == (
        "Utilise au moins 8 caractères."
    )


@pytest.mark.asyncio
class TestTheSignInPages:
    async def test_an_incomplete_link_says_so_in_the_browsers_language(
        self, client: httpx.AsyncClient
    ) -> None:
        english = await client.get("/loginDeepControl")
        assert '<html lang="en">' in english.text
        assert "That link is incomplete" in english.text
        assert "Open Simeon and sign in from there." in english.text
        french = await client.get("/loginDeepControl", headers=FRENCH)
        assert '<html lang="fr">' in french.text
        assert "Ce lien est incomplet" in french.text
        assert "Ouvre Simeon et connecte-toi depuis l’app." in french.text
        assert "That link" not in french.text

    async def test_the_connectors_last_page_in_the_browsers_language(
        self, client: httpx.AsyncClient
    ) -> None:
        english = await client.get("/desktop/apps/connected")
        assert "Connected" in english.text
        assert "You can close this tab and go back to Simeon." in english.text
        french = await client.get("/desktop/apps/connected", headers=FRENCH)
        assert '<html lang="fr">' in french.text
        assert "Tu peux fermer cet onglet et revenir sur Simeon." in french.text


@pytest.mark.asyncio
class TestTheSignInCodesEmail:
    async def test_the_email_is_in_the_language_the_code_was_asked_in(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        sent: list[dict[str, Any]] = []
        rendered: list[Any] = []
        mocker.patch.object(
            login_code_module,
            "render_email_template",
            side_effect=lambda email: rendered.append(email) or "<html></html>",
        )
        mocker.patch.object(
            login_code_module,
            "enqueue_email",
            side_effect=lambda **kwargs: sent.append(kwargs),
        )
        french = await client.post(
            "/auth/email/code", json={"email": "ada@example.com"}, headers=FRENCH
        )
        assert french.status_code == 202, french.text
        assert sent[-1]["subject"] == "Connecte-toi à Simeon"
        assert rendered[-1].props.language == "fr"

        english = await client.post(
            "/auth/email/code", json={"email": "bob@example.com"}
        )
        assert english.status_code == 202, english.text
        assert sent[-1]["subject"] == "Sign in to Simeon"
        assert rendered[-1].props.language is None
