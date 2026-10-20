"""Signing in to the apps with an email (`simeon.desktop.email_sign_in`,
19 October 2026): a code sent to the email, or the account's password, each
answered with the app's pair; a password set only while signed in; limits
per email. The code e-mail is not sent here: its code is caught."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.desktop import email_sign_in, passwords
from simeon.desktop.words import say
from simeon.models import User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_user


class Mailbox:
    """The codes the server would have e-mailed, newest last."""

    def __init__(self) -> None:
        self.codes: list[tuple[str, str]] = []

    async def send(self, login_code: Any, code: str) -> None:
        self.codes.append((login_code.email, code))

    @property
    def last(self) -> str:
        return self.codes[-1][1]


@pytest.fixture
def mailbox(mocker: MockerFixture) -> Mailbox:
    box = Mailbox()
    mocker.patch.object(email_sign_in.login_code_service, "send", box.send)
    return box


async def _code_sign_in(
    client: httpx.AsyncClient, mailbox: Mailbox, email: str
) -> dict[str, Any]:
    sent = await client.post("/auth/email/code", json={"email": email})
    assert sent.status_code == 202, sent.text
    answer = await client.post(
        "/auth/email/verify", json={"email": email, "code": mailbox.last.lower()}
    )
    assert answer.status_code == 200, answer.text
    return answer.json()


def _bearer(pair: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {pair['accessToken']}"}


class TestPasswords:
    def test_a_password_checks_against_its_own_hash_only(self) -> None:
        stored = passwords.hash_password("correct horse battery")
        assert stored.startswith("scrypt$16384$8$5$")
        assert "correct horse battery" not in stored
        assert passwords.verify_password("correct horse battery", stored)
        assert not passwords.verify_password("correct horse batterY", stored)
        assert passwords.hash_password("correct horse battery") != stored

    def test_nothing_to_check_against_is_a_no(self) -> None:
        assert not passwords.verify_password("anything", None)
        assert not passwords.verify_password("anything", "")
        assert not passwords.verify_password("anything", "scrypt$not$a$hash")

    def test_the_sentences_for_a_password_it_cant_take(self) -> None:
        assert passwords.password_problem("short", "a@b.co") is not None
        assert passwords.password_problem("x" * 129, "a@b.co") is not None
        assert passwords.password_problem("ada@example.com", "Ada@example.com")
        assert passwords.password_problem("a long enough one", "a@b.co") is None


@pytest.mark.asyncio
class TestEmailCode:
    async def test_a_new_email_signs_up_with_the_code(
        self, client: httpx.AsyncClient, session: AsyncSession, mailbox: Mailbox
    ) -> None:
        pair = await _code_sign_in(client, mailbox, "new.person@example.com")
        assert pair["accessToken"]
        assert pair["refreshToken"]
        profile = await client.get("/desktop/api/user/profile", headers=_bearer(pair))
        assert profile.status_code == 200
        assert profile.json()["data"]["email"] == "new.person@example.com"
        result = await session.execute(
            select(User).where(User.email == "new.person@example.com")
        )
        (user,) = result.unique().scalars().all()
        assert user.email_verified
        assert user.password_hash is None

    async def test_an_existing_account_is_the_one_signed_in(
        self, client: httpx.AsyncClient, mailbox: Mailbox, user: User
    ) -> None:
        pair = await _code_sign_in(client, mailbox, user.email)
        profile = await client.get("/desktop/api/user/profile", headers=_bearer(pair))
        assert profile.json()["data"]["email"] == user.email

    async def test_a_code_is_used_once(
        self, client: httpx.AsyncClient, mailbox: Mailbox
    ) -> None:
        await _code_sign_in(client, mailbox, "once@example.com")
        again = await client.post(
            "/auth/email/verify",
            json={"email": "once@example.com", "code": mailbox.last},
        )
        assert again.status_code == 400
        assert again.json()["error"] == "wrong_code"

    async def test_a_wrong_code_is_refused_with_a_sentence(
        self, client: httpx.AsyncClient, mailbox: Mailbox
    ) -> None:
        await client.post("/auth/email/code", json={"email": "wrong@example.com"})
        answer = await client.post(
            "/auth/email/verify", json={"email": "wrong@example.com", "code": "ZZZZZZ"}
        )
        assert answer.status_code == 400
        assert answer.json()["message"] == say(email_sign_in.WRONG_CODE)

    async def test_not_an_email_is_refused(self, client: httpx.AsyncClient) -> None:
        answer = await client.post("/auth/email/code", json={"email": "not an email"})
        assert answer.status_code == 400
        assert answer.json()["error"] == "bad_email"

    async def test_too_many_codes_for_one_email_wait(
        self, client: httpx.AsyncClient, mailbox: Mailbox
    ) -> None:
        for _ in range(email_sign_in.CODES_PER_WINDOW):
            sent = await client.post(
                "/auth/email/code", json={"email": "a@example.com"}
            )
            assert sent.status_code == 202
        over = await client.post("/auth/email/code", json={"email": "a@example.com"})
        assert over.status_code == 429
        assert len(mailbox.codes) == email_sign_in.CODES_PER_WINDOW
        # Another email is not held up.
        other = await client.post("/auth/email/code", json={"email": "b@example.com"})
        assert other.status_code == 202

    async def test_too_many_wrong_codes_lock_the_email_even_for_the_right_one(
        self, client: httpx.AsyncClient, mailbox: Mailbox
    ) -> None:
        await client.post("/auth/email/code", json={"email": "guess@example.com"})
        for _ in range(email_sign_in.FAILURES_PER_WINDOW):
            await client.post(
                "/auth/email/verify",
                json={"email": "guess@example.com", "code": "AAAAAA"},
            )
        right = await client.post(
            "/auth/email/verify",
            json={"email": "guess@example.com", "code": mailbox.last},
        )
        assert right.status_code == 429
        assert right.json()["message"] == say(email_sign_in.TOO_MANY_TRIES)

    async def test_app_review_signs_in_with_its_fixed_code(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch(
            "simeon.login_code.service.settings.APP_REVIEW_EMAIL",
            "review@simeonlabs.com",
        )
        mocker.patch("simeon.login_code.service.settings.APP_REVIEW_OTP_CODE", "246810")
        answer = await client.post(
            "/auth/email/verify",
            json={"email": "review@simeonlabs.com", "code": "246810"},
        )
        assert answer.status_code == 200, answer.text
        assert answer.json()["accessToken"]


@pytest.mark.asyncio
class TestPassword:
    async def test_set_while_signed_in_then_sign_in_with_it(
        self, client: httpx.AsyncClient, mailbox: Mailbox
    ) -> None:
        pair = await _code_sign_in(client, mailbox, "pw@example.com")
        before = await client.get(
            "/desktop/api/account/password", headers=_bearer(pair)
        )
        assert before.json() == {"set": False}

        weak = await client.put(
            "/desktop/api/account/password",
            json={"password": "short"},
            headers=_bearer(pair),
        )
        assert weak.status_code == 400
        assert weak.json()["error"] == "weak_password"

        made = await client.put(
            "/desktop/api/account/password",
            json={"password": "a good passphrase"},
            headers=_bearer(pair),
        )
        assert made.status_code == 200, made.text
        after = await client.get("/desktop/api/account/password", headers=_bearer(pair))
        assert after.json() == {"set": True}

        signed_in = await client.post(
            "/auth/email/password",
            json={"email": "PW@example.com", "password": "a good passphrase"},
        )
        assert signed_in.status_code == 200, signed_in.text
        assert signed_in.json()["refreshToken"]

    async def test_every_refusal_says_the_same(
        self,
        client: httpx.AsyncClient,
        save_fixture: SaveFixture,
    ) -> None:
        with_password = await create_user(save_fixture)
        with_password.password_hash = passwords.hash_password("the right one")
        await save_fixture(with_password)
        without = await create_user(save_fixture)
        for email, password in (
            (with_password.email, "the wrong one"),
            (without.email, "anything at all"),
            ("nobody@example.com", "anything at all"),
        ):
            answer = await client.post(
                "/auth/email/password", json={"email": email, "password": password}
            )
            assert answer.status_code == 401
            assert answer.json() == {
                "error": "wrong_password",
                "message": say(email_sign_in.WRONG_PASSWORD),
            }

    async def test_too_many_wrong_passwords_lock_the_email(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture
    ) -> None:
        person = await create_user(save_fixture)
        person.password_hash = passwords.hash_password("the right one")
        await save_fixture(person)
        for _ in range(email_sign_in.FAILURES_PER_WINDOW):
            await client.post(
                "/auth/email/password",
                json={"email": person.email, "password": "a wrong one"},
            )
        right = await client.post(
            "/auth/email/password",
            json={"email": person.email, "password": "the right one"},
        )
        assert right.status_code == 429

    async def test_a_password_needs_a_session(self, client: httpx.AsyncClient) -> None:
        answer = await client.put(
            "/desktop/api/account/password", json={"password": "a good passphrase"}
        )
        assert answer.status_code == 401


@pytest.mark.asyncio
class TestWebPassword:
    """app.simeonlabs.com's "Continue with password" (`/v1/login-password`)."""

    async def test_the_right_password_gives_the_browser_its_session(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture
    ) -> None:
        person = await create_user(save_fixture)
        person.password_hash = passwords.hash_password("the right one")
        await save_fixture(person)
        answer = await client.post(
            "/v1/login-password/authenticate",
            params={"return_to": "/app"},
            data={"email": person.email, "password": "the right one"},
        )
        assert answer.status_code == 303, answer.text
        assert answer.headers["location"].endswith("/app")
        assert answer.headers.get("set-cookie")

    async def test_a_wrong_one_goes_back_to_the_form_with_the_sentence(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture
    ) -> None:
        person = await create_user(save_fixture)
        person.password_hash = passwords.hash_password("the right one")
        await save_fixture(person)
        answer = await client.post(
            "/v1/login-password/authenticate",
            params={"return_to": "/app"},
            data={"email": person.email, "password": "a wrong one"},
        )
        assert answer.status_code == 303
        location = answer.headers["location"]
        assert "/login/password?" in location
        assert "error=Wrong+email+or+password" in location
        assert not answer.headers.get("set-cookie")
