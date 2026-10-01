"""What the person's agents call them (1 October 2026): the name they give
in the app's sheet after onboarding, offered Google's first name, never the
e-mail's local part."""

import httpx
import pytest

from simeon.desktop.service import desktop
from simeon.models import User
from simeon.postgres import AsyncSession

PROFILE = "/desktop/api/user/profile"
NAME = "/desktop/api/user/name"


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


@pytest.mark.asyncio
class TestThePersonsName:
    async def test_no_name_is_offered_from_the_email(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert "preferredName" not in data
        assert "suggestedName" not in data

    async def test_google_first_name_is_suggested_and_the_chosen_name_kept(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        user.meta = {"name": "Bass Fall", "given_name": "Bass"}
        session.add(user)
        await session.commit()
        headers = await _signed_in(client, session, user)
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert data["suggestedName"] == "Bass"
        assert "preferredName" not in data

        answer = await client.post(NAME, headers=headers, json={"name": " Bassy  B "})
        assert answer.status_code == 200
        assert answer.json()["data"]["preferredName"] == "Bassy B"
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert data["preferredName"] == "Bassy B"
        assert data["name"] == "Bass Fall", "Google's name is kept beside it"

    async def test_an_empty_or_long_name_is_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        for name in ["   ", "x" * 61]:
            answer = await client.post(NAME, headers=headers, json={"name": name})
            assert answer.status_code == 400
        data = (await client.get(PROFILE, headers=headers)).json()["data"]
        assert "preferredName" not in data
