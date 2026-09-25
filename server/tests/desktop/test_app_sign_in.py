"""The sign-in the app in `desktop/` actually speaks
(`polar/desktop/app_sign_in.py`), end to end over HTTP.

Every shape asserted here was read off the app's own source, and the
comments say where, because the app is the half of this contract we do
not get to change.
"""

import base64
import hashlib
import json
import secrets
import uuid as uuid_module
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from polar.config import settings
from polar.desktop.repository import DesktopAuthCodeRepository
from polar.desktop.service import (
    ACCESS_TOKEN_PREFIX,
    DEEP_CONTROL_NAMESPACE,
    challenge_for,
    desktop,
    envelope_access_token,
    unwrap_access_token,
)
from polar.kit import jwt
from polar.kit.crypto import get_token_hash
from polar.kit.utils import utc_now
from polar.models import User
from polar.models.maty import MatyJob, MatyJobKind, MatyJobStatus
from polar.postgres import AsyncSession


def _login_metadata() -> tuple[str, str, str]:
    """`createLoginMetadata` in
    `desktop/source/electron-main/account/cursor-auth.ts`: a verifier of
    32 random bytes, base64url; the challenge its SHA-256, base64url; a
    v4 uuid."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    return verifier, challenge, str(uuid_module.uuid4())


async def _confirm(
    client: httpx.AsyncClient, *, uuid: str, challenge: str, redirect_target: str = ""
) -> httpx.Response:
    return await client.post(
        "/loginDeepControl",
        data={
            "uuid": uuid,
            "challenge": challenge,
            "mode": "login",
            "redirectTarget": redirect_target,
        },
    )


class TestTheChallenge:
    def test_the_derivation_is_the_app_s_own(self) -> None:
        verifier, challenge, _ = _login_metadata()
        assert challenge_for(verifier) == challenge
        # base64url, and unpadded — the app compares strings.
        assert "=" not in challenge
        assert "+" not in challenge
        assert "/" not in challenge


@pytest.mark.asyncio
class TestLoginDeepControl:
    async def test_anonymous_is_sent_to_the_web_login_and_asked_back(
        self, client: httpx.AsyncClient
    ) -> None:
        _, challenge, uuid = _login_metadata()
        response = await client.get(
            "/loginDeepControl",
            params={
                "challenge": challenge,
                "uuid": uuid,
                "mode": "login",
                "redirectTarget": "sand",
            },
            follow_redirects=False,
        )
        assert response.status_code == 303
        location = urlparse(response.headers["location"])
        assert location.path == "/login"
        return_to = parse_qs(location.query)["return_to"][0]
        assert return_to.startswith(
            settings.generate_external_url("/loginDeepControl?")
        )
        assert f"challenge={challenge}" in return_to
        assert f"uuid={uuid}" in return_to

    @pytest.mark.auth
    async def test_a_signed_in_person_is_asked_before_anything_is_written(
        self, client: httpx.AsyncClient, user: User
    ) -> None:
        """The link carries somebody's verifier. A GET that signed you
        in would mean anyone who can get you to open one of their links
        holds your session, so the GET only asks."""
        _, challenge, uuid = _login_metadata()
        response = await client.get(
            "/loginDeepControl", params={"challenge": challenge, "uuid": uuid}
        )
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert user.email in response.text
        assert 'method="post"' in response.text

    @pytest.mark.auth
    async def test_a_link_without_the_pair_is_refused_outright(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/loginDeepControl", params={"challenge": "x"})
        assert response.status_code == 200
        assert "incomplete" in response.text

    @pytest.mark.auth
    async def test_the_confirmation_sends_the_person_back_to_the_app(
        self, client: httpx.AsyncClient
    ) -> None:
        _, challenge, uuid = _login_metadata()
        response = await _confirm(
            client, uuid=uuid, challenge=challenge, redirect_target="sand"
        )
        assert response.status_code == 200
        # `parseSandDeepLink` in desktop/source/shared/deep-link.ts is the
        # only parser the app has, and `sand://app/v1/open` is the route
        # it accepts.
        assert "sand://app/v1/open" in response.text

    @pytest.mark.auth
    async def test_the_app_names_its_own_scheme_and_the_link_follows_it(
        self, client: httpx.AsyncClient
    ) -> None:
        # Since 23 September 2026 the app sends `simeon` (its own scheme,
        # `SAND_DEEP_LINK_SCHEME` in desktop/source/shared/desktop.ts) and
        # claims only `simeon://` in its bundle; `sand://` is Grok Bot's.
        # The server builds the link from what the app sends, so no
        # server change is needed for the app's scheme to change.
        _, challenge, uuid = _login_metadata()
        response = await _confirm(
            client, uuid=uuid, challenge=challenge, redirect_target="simeon"
        )
        assert response.status_code == 200
        assert "simeon://app/v1/open" in response.text
        assert "sand://" not in response.text

    @pytest.mark.auth
    async def test_a_redirect_target_that_is_not_a_scheme_builds_no_link(
        self, client: httpx.AsyncClient
    ) -> None:
        _, challenge, uuid = _login_metadata()
        response = await _confirm(
            client,
            uuid=uuid,
            challenge=challenge,
            redirect_target="javascript:alert(1)//",
        )
        assert response.status_code == 200
        assert "javascript" not in response.text
        assert "<script>" not in response.text

    @pytest.mark.auth
    async def test_a_form_posted_from_somewhere_else_writes_nothing(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        response = await client.post(
            "/loginDeepControl",
            data={"uuid": uuid, "challenge": challenge},
            headers={"Origin": "https://evil.example"},
        )
        assert response.status_code == 200
        assert "could not be completed" in response.text
        polled = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert polled.status_code == 404

    async def test_anonymous_cannot_confirm(self, client: httpx.AsyncClient) -> None:
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        polled = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert polled.status_code == 404

    @pytest.mark.auth
    async def test_confirming_twice_is_not_an_error(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        assert (
            await _confirm(client, uuid=uuid, challenge=challenge)
        ).status_code == 200
        assert (
            await _confirm(client, uuid=uuid, challenge=challenge)
        ).status_code == 200
        polled = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert polled.status_code == 200


@pytest.mark.asyncio
class TestAuthPoll:
    async def test_it_is_404_until_the_person_confirms(
        self, client: httpx.AsyncClient
    ) -> None:
        """404 is « not yet » to the app: `waitForResult` resets its
        consecutive-error count on it and keeps waiting, where any other
        failure counts towards giving up after three."""
        verifier, _, uuid = _login_metadata()
        response = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert response.status_code == 404

    @pytest.mark.auth
    async def test_the_pair_comes_back_once_and_only_once(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)

        first = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert first.status_code == 200
        body = first.json()
        # `validTokens` in
        # desktop/source/packages/cursor-config/auth/login.ts accepts
        # exactly these two names, both strings.
        assert isinstance(body["accessToken"], str)
        assert isinstance(body["refreshToken"], str)
        assert body["refreshToken"].startswith("claidor_dr_")

        second = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert second.status_code == 404

    @pytest.mark.auth
    async def test_the_wrong_verifier_gets_nothing(
        self, client: httpx.AsyncClient
    ) -> None:
        """The whole proof is that the poller holds the verifier the
        challenge was made from."""
        _, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        other_verifier, _, _ = _login_metadata()
        response = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": other_verifier}
        )
        assert response.status_code == 404

    @pytest.mark.auth
    async def test_the_right_verifier_under_another_uuid_gets_nothing(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        _, _, other_uuid = _login_metadata()
        response = await client.get(
            "/auth/poll", params={"uuid": other_uuid, "verifier": verifier}
        )
        assert response.status_code == 404

    async def test_nonsense_parameters_are_404_and_not_a_crash(
        self, client: httpx.AsyncClient
    ) -> None:
        for params in (
            {},
            {"uuid": "", "verifier": ""},
            {"uuid": "x" * 2000, "verifier": "y" * 2000},
            {"uuid": "é", "verifier": "é"},
        ):
            response = await client.get("/auth/poll", params=params)
            assert response.status_code == 404, params

    @pytest.mark.auth
    async def test_a_confirmation_older_than_the_code_ttl_is_gone(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        await desktop.begin_deep_control(session, user, uuid=uuid, challenge=challenge)
        await session.commit()
        # Reach past the route and age the row, rather than sleeping out
        # the five minutes.
        repository = DesktopAuthCodeRepository.from_session(session)
        pending = await repository.get_by_code_hash(
            get_token_hash(
                f"{DEEP_CONTROL_NAMESPACE}:{uuid}:{challenge}", secret=settings.SECRET
            )
        )
        assert pending is not None
        pending.expires_at = utc_now() - timedelta(seconds=1)
        session.add(pending)
        await session.commit()

        response = await client.get(
            "/auth/poll", params={"uuid": uuid, "verifier": verifier}
        )
        assert response.status_code == 404


@pytest.mark.asyncio
class TestTheAccessToken:
    @pytest.mark.auth
    async def test_the_app_can_read_who_it_is_and_when_it_expires(
        self, client: httpx.AsyncClient, user: User
    ) -> None:
        """`parseJwtPayload` in
        desktop/source/shared/node/cursor-token.ts reads `sub`, `email`
        and `exp` off the access token. `isTokenExpiringSoon` treats a
        token it cannot read an `exp` from as always expiring, which
        would mean a refresh before every single call."""
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        body = (
            await client.get("/auth/poll", params={"uuid": uuid, "verifier": verifier})
        ).json()

        access = body["accessToken"]
        # The prefix stays on the outside: polar.auth.middlewares refuses
        # every bearer it does not recognise, and recognises this one by
        # prefix alone.
        assert access.startswith(ACCESS_TOKEN_PREFIX)
        # ...and `parseJwtPayload` reads the second dot-separated
        # segment, so a prefix on the first changes nothing for it.
        payload = jwt.decode_unsafe(
            token=access[len(ACCESS_TOKEN_PREFIX) :], secret=settings.SECRET
        )
        assert payload["sub"] == str(user.id)
        assert payload["email"] == user.email
        assert payload["exp"] > utc_now().timestamp()

        # And the same three read the app's way: `parseJwtPayload` takes
        # `token.split(".")[1]`, so the prefix sitting on the first
        # segment is invisible to it.
        app_side = json.loads(
            base64.urlsafe_b64decode(
                access.split(".")[1] + "=" * (-len(access.split(".")[1]) % 4)
            )
        )
        assert app_side["sub"] == str(user.id)
        assert app_side["email"] == user.email
        assert app_side["exp"] == payload["exp"]

    @pytest.mark.auth
    async def test_the_envelope_opens_every_route_the_opaque_token_opens(
        self, client: httpx.AsyncClient, user: User
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        access = (
            await client.get("/auth/poll", params={"uuid": uuid, "verifier": verifier})
        ).json()["accessToken"]

        profile = await client.get(
            "/desktop/api/user/profile", headers={"Authorization": f"Bearer {access}"}
        )
        assert profile.status_code == 200
        assert profile.json()["data"]["email"] == user.email

        quota = await client.get(
            "/desktop/api/user/quota", headers={"Authorization": f"Bearer {access}"}
        )
        assert quota.json()["data"]["creditsLimit"] == settings.DESKTOP_MONTHLY_CREDITS

    @pytest.mark.auth
    async def test_logging_out_kills_the_envelope_too(
        self, client: httpx.AsyncClient
    ) -> None:
        """The credential inside the envelope is the same row as ever,
        so revocation needs no second implementation."""
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        access = (
            await client.get("/auth/poll", params={"uuid": uuid, "verifier": verifier})
        ).json()["accessToken"]
        header = {"Authorization": f"Bearer {access}"}

        assert (
            await client.post("/desktop/api/auth/logout", headers=header)
        ).status_code == 200
        assert (
            await client.get("/desktop/api/user/profile", headers=header)
        ).status_code == 401

    async def test_a_forged_envelope_opens_nothing(
        self, client: httpx.AsyncClient
    ) -> None:
        forged = ACCESS_TOKEN_PREFIX + jwt.encode(
            data={"sub": "somebody", "cat": "claidor_da_whatever"},
            secret="not-the-server-s-secret",
            type="desktop_access",  # type: ignore[arg-type]
        )
        assert unwrap_access_token(forged) is None
        response = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {forged}"},
        )
        assert response.status_code == 401

    async def test_an_envelope_of_the_wrong_type_opens_nothing(self) -> None:
        wrong = ACCESS_TOKEN_PREFIX + jwt.encode(
            data={"sub": "somebody", "cat": "claidor_da_whatever"},
            secret=settings.SECRET,
            type="auth",
        )
        assert unwrap_access_token(wrong) is None

    async def test_an_opaque_token_is_left_exactly_as_it_is(self) -> None:
        """`/desktop` still hands out opaque tokens and they must keep
        working untouched."""
        assert unwrap_access_token("claidor_da_abcdefgh") is None
        assert unwrap_access_token("claidor_pat_abcdefgh") is None
        assert unwrap_access_token("") is None

    async def test_the_envelope_expires_with_the_session_it_names(
        self, session: AsyncSession, user: User
    ) -> None:
        desktop_session, access, _ = await desktop._issue_session(session, user)
        await session.flush()
        enveloped = envelope_access_token(desktop_session, access)
        payload = jwt.decode_unsafe(
            token=enveloped[len(ACCESS_TOKEN_PREFIX) :], secret=settings.SECRET
        )
        assert payload["exp"] == int(desktop_session.access_expires_at.timestamp())
        assert payload["jti"] == str(desktop_session.id)
        assert unwrap_access_token(enveloped) == access


@pytest.mark.asyncio
class TestOAuthToken:
    @pytest.mark.auth
    async def test_a_refresh_returns_a_new_pair_in_oauth_names(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        tokens = (
            await client.get("/auth/poll", params={"uuid": uuid, "verifier": verifier})
        ).json()

        response = await client.post(
            "/oauth/token",
            json={
                "client_id": "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB",
                "grant_type": "refresh_token",
                "refresh_token": tokens["refreshToken"],
            },
        )
        assert response.status_code == 200
        body = response.json()
        # `parseOAuthTokenBody` in cursor-auth.ts reads these names.
        assert body["access_token"].startswith(ACCESS_TOKEN_PREFIX)
        assert body["refresh_token"] != tokens["refreshToken"]
        assert "shouldLogout" not in body

    @pytest.mark.auth
    async def test_the_old_refresh_token_dies_with_the_exchange(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        await _confirm(client, uuid=uuid, challenge=challenge)
        refresh = (
            await client.get("/auth/poll", params={"uuid": uuid, "verifier": verifier})
        ).json()["refreshToken"]
        body = {"grant_type": "refresh_token", "refresh_token": refresh}

        assert (await client.post("/oauth/token", json=body)).status_code == 200
        second = await client.post("/oauth/token", json=body)
        # 200 and not 4xx on purpose: a non-2xx makes the app show
        # « we couldn't confirm your sign-in » and throw the credentials
        # away as a failure; `shouldLogout` is the plain « your session
        # ended ». Both sign out, only one of them lies about why.
        assert second.status_code == 200
        assert second.json()["shouldLogout"] is True

    async def test_a_refresh_token_nobody_issued_ends_the_session(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post(
            "/oauth/token",
            json={"grant_type": "refresh_token", "refresh_token": "claidor_dr_nope"},
        )
        assert response.status_code == 200
        assert response.json()["shouldLogout"] is True

    async def test_a_request_that_is_not_a_refresh_is_refused_as_one(
        self, client: httpx.AsyncClient
    ) -> None:
        for body in (
            {"grant_type": "authorization_code", "code": "x"},
            {"grant_type": "refresh_token"},
            {"grant_type": "refresh_token", "refresh_token": 7},
            [],
        ):
            response = await client.post("/oauth/token", json=body)
            assert response.status_code == 400, body

    async def test_a_body_that_is_not_json_is_refused_and_not_a_crash(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post("/oauth/token", content=b"not json")
        assert response.status_code == 400


@pytest.mark.asyncio
class TestTheRefreshGoesThroughTheOneService:
    async def test_a_session_minted_for_a_cloud_job_is_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        """`DesktopService.refresh` refuses a row that names a job,
        whatever its state, so a job's credential can never be traded up
        into a lasting one. This route issues nothing itself — it calls
        that service — and this pins that it inherits the refusal."""
        desktop_session, _, refresh = await desktop._issue_session(session, user)
        job = MatyJob(
            user_id=user.id,
            kind=MatyJobKind.task,
            prompt="anything",
            status=MatyJobStatus.running,
        )
        session.add(job)
        await session.flush()
        desktop_session.job_id = job.id
        session.add(desktop_session)
        await session.commit()

        response = await client.post(
            "/oauth/token",
            json={"grant_type": "refresh_token", "refresh_token": refresh},
        )
        assert response.status_code == 200
        assert response.json()["shouldLogout"] is True


@pytest.mark.asyncio
class TestPollByPost:
    """The verifier in a body, not a query string, so it never lands in an
    access log (F-258, 25 September 2026); the GET stays for older builds."""

    @pytest.mark.auth
    async def test_the_posted_pair_answers_once_and_the_get_still_works(
        self, client: httpx.AsyncClient
    ) -> None:
        verifier, challenge, uuid = _login_metadata()
        pending = await client.post("/auth/poll", json={"uuid": uuid, "verifier": verifier})
        assert pending.status_code == 404
        assert pending.json() == {"error": "not_found"}
        await _confirm(client, uuid=uuid, challenge=challenge)
        issued = await client.post("/auth/poll", json={"uuid": uuid, "verifier": verifier})
        assert issued.status_code == 200, issued.text
        body = issued.json()
        assert body["accessToken"] and body["refreshToken"]
        again = await client.post("/auth/poll", json={"uuid": uuid, "verifier": verifier})
        assert again.status_code == 404

    async def test_a_body_that_is_not_json_is_a_wait(self, client: httpx.AsyncClient) -> None:
        response = await client.post("/auth/poll", content=b"not json", headers={"content-type": "application/json"})
        assert response.status_code == 404
        response = await client.post("/auth/poll", json=["a", "list"])
        assert response.status_code == 404
