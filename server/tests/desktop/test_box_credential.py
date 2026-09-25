"""The box's own credential (25 September 2026).

The person's box keeps running after Simeon quits so routines fire while
the Mac is awake. With the app gone nothing rewrote the box's one-hour
access token, so the Mac now asks for a box credential once
(`POST /desktop/api/box/renewal-credential`) and writes it into the box's
token file, and the box trades it for a fresh access token at
`POST /sand-box/inference-credential`, the path Grok Bot's host already
renews on (`credential-renewer.ts`, `RENEWAL_PATH`).
"""

import httpx
import pytest

from polar.desktop.service import ACCESS_TOKEN_PREFIX, unwrap_access_token
from polar.desktop.tokens import BOX_CREDENTIAL_PREFIX
from polar.models import User
from polar.postgres import AsyncSession

from .test_endpoints import _signed_in


async def _box_credential(client: httpx.AsyncClient, access: str) -> dict[str, object]:
    response = await client.post(
        "/desktop/api/box/renewal-credential",
        headers={"Authorization": f"Bearer {access}"},
    )
    body = response.json()
    assert body["code"] == 0, body
    return body["data"]


@pytest.mark.asyncio
class TestBoxCredential:
    async def test_the_box_renews_its_access_token_without_the_mac(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        issued = await _box_credential(client, access)
        credential = issued["credential"]
        assert isinstance(credential, str)
        assert credential.startswith(BOX_CREDENTIAL_PREFIX)
        assert isinstance(issued["expiresAtMs"], int)

        first = await client.post(
            "/sand-box/inference-credential", json={"credential": credential}
        )
        assert first.status_code == 200, first.text
        body = first.json()
        # `credentialFromPayload` in credential-renewer.ts reads these names.
        assert body["accessToken"].startswith(ACCESS_TOKEN_PREFIX)
        assert isinstance(body["expiresAtMs"], int)
        assert unwrap_access_token(body["accessToken"]) is not None

        # The access token it got is a proxy caller like any other.
        me = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {body['accessToken']}"},
        )
        assert me.status_code == 200, me.text

        # Renewing again is not a rotation: the same credential keeps working.
        second = await client.post(
            "/sand-box/inference-credential", json={"credential": credential}
        )
        assert second.status_code == 200
        assert second.json()["accessToken"] != body["accessToken"]

    async def test_the_credential_can_never_become_a_session(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        credential = (await _box_credential(client, access))["credential"]
        refused = await client.post(
            "/oauth/token",
            json={"grant_type": "refresh_token", "refresh_token": credential},
        )
        assert refused.status_code == 200
        assert refused.json().get("shouldLogout") is True

    async def test_it_dies_with_the_desktop_on_sign_out(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        credential = (await _box_credential(client, access))["credential"]
        assert (
            await client.post(
                "/sand-box/inference-credential", json={"credential": credential}
            )
        ).status_code == 200
        out = await client.post(
            "/desktop/api/auth/logout", headers={"Authorization": f"Bearer {access}"}
        )
        assert out.json()["code"] == 0
        refused = await client.post(
            "/sand-box/inference-credential", json={"credential": credential}
        )
        assert refused.status_code == 401
        assert refused.json()["error"] == "invalid_grant"

    async def test_it_follows_the_desktop_through_a_refresh(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, refresh = await _signed_in(client, session, user)
        credential = (await _box_credential(client, access))["credential"]
        refreshed = await client.post(
            "/oauth/token",
            json={"grant_type": "refresh_token", "refresh_token": refresh},
        )
        assert refreshed.status_code == 200
        assert "shouldLogout" not in refreshed.json()
        # The old session died with the exchange; the box credential did not.
        still = await client.post(
            "/sand-box/inference-credential", json={"credential": credential}
        )
        assert still.status_code == 200, still.text

    async def test_asking_again_revokes_the_last_one(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        first = (await _box_credential(client, access))["credential"]
        second = (await _box_credential(client, access))["credential"]
        assert first != second
        assert (
            await client.post(
                "/sand-box/inference-credential", json={"credential": first}
            )
        ).status_code == 401
        assert (
            await client.post(
                "/sand-box/inference-credential", json={"credential": second}
            )
        ).status_code == 200

    async def test_a_box_cannot_ask_for_a_box_credential(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        credential = (await _box_credential(client, access))["credential"]
        box_access = (
            await client.post(
                "/sand-box/inference-credential", json={"credential": credential}
            )
        ).json()["accessToken"]
        refused = await client.post(
            "/desktop/api/box/renewal-credential",
            headers={"Authorization": f"Bearer {box_access}"},
        )
        assert refused.status_code == 401

    async def test_garbage_is_refused_without_a_lookup(
        self, client: httpx.AsyncClient
    ) -> None:
        assert (
            await client.post("/sand-box/inference-credential", json={})
        ).status_code == 400
        assert (
            await client.post(
                "/sand-box/inference-credential",
                json={"credential": "claidor_dr_notabox"},
            )
        ).status_code == 401
        assert (
            await client.post("/sand-box/inference-credential", content=b"not json")
        ).status_code == 400
