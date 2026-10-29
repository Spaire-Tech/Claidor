"""The person's Secure Credentials Store (`simeon/desktop/credentials.py`, 28
October 2026): logins and contact info, sealed for their person, listed
without a password, read one at a time with it, added by the apps and the
computer, changed and deleted by the apps only."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from simeon.desktop.account_repository import AccountDeletionRepository
from simeon.desktop.credential_repository import DesktopCredentialRepository
from simeon.desktop.credentials import site_of
from simeon.models import User
from simeon.postgres import AsyncSession

from .test_chats import _signed_in_with_box

STORE = "/desktop/api/credentials"
PASSWORD = "correct horse battery staple "


def _data(response: httpx.Response) -> Any:
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["code"] == 0, answer
    return answer["data"]


def _refused(response: httpx.Response) -> tuple[int, str]:
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["code"] != 0, answer
    return answer["code"], answer["message"]


async def _add(
    client: httpx.AsyncClient, headers: dict[str, str], **entry: Any
) -> dict[str, Any]:
    return _data(await client.post(STORE, json=entry, headers=headers))["entry"]


@pytest.mark.asyncio
class TestCredentials:
    async def test_a_login_is_kept_sealed_listed_without_its_password_and_read_with_it(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        added = await _add(
            client,
            app,
            kind="login",
            name="Acme",
            website="https://www.acme.com/login",
            username="theo@example.com",
            password=PASSWORD,
            hints="Use for work",
        )
        assert added["site"] == "acme.com"
        assert added["hasPassword"] is True
        assert "password" not in added

        (row,) = await DesktopCredentialRepository.from_session(session).list_by_user(
            user.id
        )
        assert PASSWORD.strip() not in row.sealed, "kept sealed, never as itself"
        assert "theo@example.com" not in row.sealed

        for headers in (app, box):
            (listed,) = _data(await client.get(STORE, headers=headers))["entries"]
            assert listed["id"] == added["id"]
            assert listed["username"] == "theo@example.com"
            assert listed["hints"] == "Use for work"
            assert "password" not in listed

            entry = _data(await client.get(f"{STORE}/{added['id']}", headers=headers))[
                "entry"
            ]
            # The password exactly as written, its trailing space with it.
            assert entry["password"] == PASSWORD

    async def test_the_computer_saves_a_login_with_the_agents_name_and_the_app_cannot_claim_one(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        made = await _add(
            client,
            box,
            kind="login",
            website="shop.example.org",
            username="theo",
            password="Abcdef-ghijk7-lmnopq",
            savedBy="Nora",
        )
        assert made["savedBy"] == "Nora"
        assert made["name"] == ""
        claimed = await _add(
            client,
            app,
            kind="login",
            website="news.example.org",
            password="x",
            savedBy="Nora",
        )
        assert "savedBy" not in claimed

    async def test_the_computer_changes_only_what_an_agent_saved_and_deletes_nothing(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        added = await _add(
            client,
            app,
            kind="login",
            website="acme.com",
            username="theo",
            password="old",
        )

        code, _ = _refused(
            await client.patch(
                f"{STORE}/{added['id']}", json={"password": "new"}, headers=box
            )
        )
        assert code == 404, "the person's own entry is never the computer's to change"
        refused = await client.delete(f"{STORE}/{added['id']}", headers=box)
        assert refused.status_code == 401

        made = await _add(
            client,
            box,
            kind="login",
            website="shop.example.org",
            password="first",
            savedBy="Nora",
        )
        remade = _data(
            await client.patch(
                f"{STORE}/{made['id']}", json={"password": "second"}, headers=box
            )
        )["entry"]
        assert remade["savedBy"] == "Nora"
        entry = _data(await client.get(f"{STORE}/{made['id']}", headers=box))["entry"]
        assert entry["password"] == "second"
        refused = await client.delete(f"{STORE}/{made['id']}", headers=box)
        assert refused.status_code == 401
        assert _data(await client.delete(f"{STORE}/{made['id']}", headers=app))

        changed = _data(
            await client.patch(
                f"{STORE}/{added['id']}",
                json={"password": "new", "hints": "Personal"},
                headers=app,
            )
        )["entry"]
        assert changed["hints"] == "Personal"
        assert changed["username"] == "theo", "a field not sent stays"
        entry = _data(await client.get(f"{STORE}/{added['id']}", headers=app))["entry"]
        assert entry["password"] == "new"

        assert _data(await client.delete(f"{STORE}/{added['id']}", headers=app)) == {
            "deleted": True
        }
        assert _data(await client.get(STORE, headers=app))["entries"] == []
        code, _ = _refused(await client.get(f"{STORE}/{added['id']}", headers=app))
        assert code == 404

    async def test_contact_info_is_kept_and_listed_after_the_logins(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        await _add(
            client,
            app,
            kind="contact",
            name="Home",
            fullName="Theo Martin",
            email="theo@example.com",
            phone="+1 206 555 0100",
            city="Seattle",
            country="US",
        )
        await _add(
            client, app, kind="login", name="Zeta", website="zeta.io", password="p"
        )
        entries = _data(await client.get(STORE, headers=box))["entries"]
        assert [entry["kind"] for entry in entries] == ["login", "contact"]
        contact = entries[1]
        assert contact["fullName"] == "Theo Martin"
        assert contact["phone"] == "+1 206 555 0100"
        assert contact["addressLine1"] == ""
        assert "hasPassword" not in contact
        assert "site" not in contact

    async def test_an_entry_that_cannot_be_kept_is_refused_with_a_sentence(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, _ = await _signed_in_with_box(client, session, user)
        for entry in (
            {"name": "Acme"},
            {"kind": "login", "website": "not a site", "password": "p"},
            {"kind": "login", "username": "theo", "password": "p"},
            {"kind": "login", "website": "acme.com"},
            {"kind": "contact", "name": "Home", "hints": "Only a name"},
            {"kind": "login", "website": "acme.com", "password": "p" * 1025},
        ):
            code, message = _refused(await client.post(STORE, json=entry, headers=app))
            assert code == 422
            assert message
        assert _data(await client.get(STORE, headers=app))["entries"] == []

    async def test_one_persons_entry_is_never_anothers(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        app, _ = await _signed_in_with_box(client, session, user)
        other, _ = await _signed_in_with_box(client, session, user_second)
        added = await _add(client, app, kind="login", website="acme.com", password="p")
        code, _ = _refused(await client.get(f"{STORE}/{added['id']}", headers=other))
        assert code == 404
        code, _ = _refused(await client.delete(f"{STORE}/{added['id']}", headers=other))
        assert code == 404
        assert _data(await client.get(STORE, headers=other))["entries"] == []
        assert len(_data(await client.get(STORE, headers=app))["entries"]) == 1

    async def test_delete_account_takes_the_store(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, _ = await _signed_in_with_box(client, session, user)
        await _add(client, app, kind="login", website="acme.com", password="p")
        counts = await AccountDeletionRepository(session).delete_content(user.id)
        assert counts["credentials"] == 1
        assert (
            await DesktopCredentialRepository.from_session(session).list_by_user(
                user.id
            )
            == []
        )


def test_a_site_is_a_host_without_www() -> None:
    assert site_of("https://www.Acme.com/login?next=/") == "acme.com"
    assert site_of("login.acme.com") == "login.acme.com"
    assert site_of("192.168.1.1") == "192.168.1.1"
    assert site_of("acme") == ""
    assert site_of("not a site") == ""
    assert site_of("") == ""
