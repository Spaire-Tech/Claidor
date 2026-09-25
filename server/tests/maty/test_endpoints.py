"""The runner's four verbs over HTTP, and the wall between the runner's
token and a person's (`polar/maty/endpoints.py`, `polar/maty/auth.py`).

Two refusals matter more than the rest and are tested from both sides: a
person's desktop token opens nothing at `/maty/runner`, and the runner's
service token opens nothing at `/desktop`. They are different kinds of
credential and neither is ever the other.
"""

from datetime import datetime
from typing import Any

import httpx
import pytest
import respx
from fastapi import Request
from pytest_mock import MockerFixture

from polar.auth.middlewares import get_auth_subject
from polar.auth.models import is_anonymous
from polar.config import settings
from polar.desktop.service import Usage, credits_for, desktop, model_by_id
from polar.kit.utils import utc_now
from polar.maty.service import maty
from polar.maty.tokens import is_runner_path
from polar.models import MatyJobKind, MatyJobStatus, User
from polar.oauth2.exceptions import InvalidTokenError
from polar.postgres import AsyncSession

RUNNER_TOKEN = "a-service-secret-that-belongs-to-no-person"
RUNNER = {"Authorization": f"Bearer {RUNNER_TOKEN}"}


@pytest.fixture
def configured_runner(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "MATY_RUNNER_TOKEN", RUNNER_TOKEN)


async def _person_token(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> str:
    """A desktop access token, through the auth code, as the app gets it."""
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post("/desktop/api/auth/exchange", json={"authCode": code})
    body = response.json()
    assert body["code"] == 0, body
    return str(body["data"]["accessToken"])


async def _a_job(session: AsyncSession, user: User, prompt: str = "Brief me.") -> str:
    job = await maty.enqueue(
        session,
        user,
        kind=MatyJobKind.routine,
        prompt=prompt,
        deliver={"channel": "email", "to": user.email},
        allow={"send": True},
    )
    await session.flush()
    return str(job.id)


@pytest.mark.asyncio
class TestWhoMaySpeak:
    async def test_no_bearer_reaches_the_queue(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        response = await client.post("/maty/runner/claim", json={"runner": "cloud-1"})
        assert response.status_code == 401

    async def test_a_wrong_service_token_reaches_the_queue(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        response = await client.post(
            "/maty/runner/claim",
            headers={"Authorization": "Bearer not-the-secret"},
            json={"runner": "cloud-1"},
        )
        assert response.status_code == 401

    async def test_an_unconfigured_claidor_accepts_nobody(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        """A missing secret must never read as « no secret needed »."""
        mocker.patch.object(settings, "MATY_RUNNER_TOKEN", "")
        for headers in ({}, {"Authorization": "Bearer "}, RUNNER):
            response = await client.post(
                "/maty/runner/claim", headers=headers, json={"runner": "cloud-1"}
            )
            assert response.status_code == 401, headers

    async def test_a_person_s_token_is_not_a_runner_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        access = await _person_token(client, session, user)
        job_id = await _a_job(session, user)

        for path in (
            "/maty/runner/claim",
            f"/maty/runner/jobs/{job_id}/heartbeat",
            f"/maty/runner/jobs/{job_id}/complete",
            f"/maty/runner/jobs/{job_id}/fail",
        ):
            response = await client.post(
                path,
                headers={"Authorization": f"Bearer {access}"},
                json={"runner": "cloud-1", "reason": "x", "result": "x"},
            )
            assert response.status_code == 401, path

    async def test_the_runner_token_is_not_a_person_s_token(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        for path in ("/desktop/api/user/profile", "/desktop/api/memory"):
            assert (await client.get(path, headers=RUNNER)).status_code == 401
        assert (
            await client.post(
                "/desktop/api/memory/sync", headers=RUNNER, json={"files": []}
            )
        ).status_code == 401


def _scope(path: str, token: str) -> dict[str, Any]:
    return {
        "type": "http",
        "method": "POST",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
        "server": ("test", 80),
        "client": ("test", 4242),
    }


@pytest.mark.asyncio
class TestTheAuthMiddleware:
    """The runner's token matches none of the shapes `polar.auth` knows.

    In production every request passes `get_auth_subject` before it
    reaches a route, and an unrecognised bearer there is an OAuth2 error —
    which would refuse the runner before its own check could run, and
    would refuse a *wrong* runner token with the wrong reason. The
    middleware is switched off in the test app, so this is checked
    directly.
    """

    async def test_the_runner_s_routes_are_nobody_to_the_middleware(
        self, session: AsyncSession
    ) -> None:
        for path in ("/maty/runner/claim", "/maty/runner/jobs/x/heartbeat"):
            subject = await get_auth_subject(
                Request(_scope(path, RUNNER_TOKEN)), session
            )
            assert is_anonymous(subject), path

    async def test_a_wrong_runner_token_still_reaches_the_runner_s_own_check(
        self, session: AsyncSession
    ) -> None:
        subject = await get_auth_subject(
            Request(_scope("/maty/runner/claim", "not-the-secret")), session
        )
        assert is_anonymous(subject)

    async def test_an_unknown_token_anywhere_else_is_still_an_error(
        self, session: AsyncSession
    ) -> None:
        """The short-circuit is the runner's path and nothing wider."""
        with pytest.raises(InvalidTokenError):
            await get_auth_subject(
                Request(_scope("/v1/organizations", RUNNER_TOKEN)), session
            )

    def test_the_prefix_is_a_path_and_not_a_string_prefix(self) -> None:
        assert is_runner_path("/maty/runner")
        assert is_runner_path("/maty/runner/claim")
        assert not is_runner_path("/maty/runners-elsewhere")
        assert not is_runner_path("/desktop/api/memory")


@pytest.mark.asyncio
class TestTheQueueOverTheWire:
    async def test_an_empty_queue_answers_job_null(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        response = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        assert response.status_code == 200
        assert response.json() == {"job": None}

    async def test_a_claim_hands_over_the_job_and_a_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        job_id = await _a_job(session, user, prompt="Write the morning briefing.")

        response = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["job"] == {
            "id": job_id,
            "kind": "routine",
            "prompt": "Write the morning briefing.",
            "deliver": {"channel": "email", "to": user.email},
            "allow": {"send": True},
            # Since 25 September 2026: which executor runs it (only one
            # exists). A cloud agent's turn would carry `conversation` too.
            "executor": "maty-runner",
        }
        assert body["access_token"].startswith("claidor_da_")
        assert datetime.fromisoformat(body["expires_at"]) > utc_now()

    async def test_the_job_s_token_reaches_the_shared_memory(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        """The runner lays out the person's workspace with it, and writes
        it back when the work is done."""
        await _a_job(session, user)
        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        headers = {"Authorization": f"Bearer {claimed.json()['access_token']}"}

        synced = await client.post(
            "/desktop/api/memory/sync",
            headers=headers,
            json={"files": [{"name": "MEMORY.md", "content": "- Ships on Fridays\n"}]},
        )

        assert synced.status_code == 200
        assert synced.json()["files"][0]["name"] == "MEMORY.md"

    async def test_the_job_s_token_spends_the_person_s_credits(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
        mocker: MockerFixture,
    ) -> None:
        """A cloud run costs the person's credits exactly as a run on
        their own machine does — the same proxy, the same metering."""
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-test")
        await _a_job(session, user)
        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        headers = {"Authorization": f"Bearer {claimed.json()['access_token']}"}

        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "msg_1",
                        "content": [{"type": "text", "text": "Hello"}],
                        "usage": {"input_tokens": 100, "output_tokens": 20},
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers=headers,
                json={"model": "claude-sonnet-5", "max_tokens": 64, "messages": []},
            )

        assert response.status_code == 200
        model = model_by_id("claude-sonnet-5")
        assert model is not None
        spent = credits_for(model, Usage(input_tokens=100, output_tokens=20))
        assert await desktop.credits_used(session, user.id) == spent

    async def test_the_job_s_token_is_refused_once_the_job_is_done(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        job_id = await _a_job(session, user)
        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        headers = {"Authorization": f"Bearer {claimed.json()['access_token']}"}
        assert (
            await client.get("/desktop/api/memory", headers=headers)
        ).status_code == 200

        completed = await client.post(
            f"/maty/runner/jobs/{job_id}/complete",
            headers=RUNNER,
            json={"runner": "cloud-1", "result": "Three things…", "usage": {}},
        )
        assert completed.status_code == 200
        assert completed.json()["status"] == MatyJobStatus.done.value

        assert (
            await client.get("/desktop/api/memory", headers=headers)
        ).status_code == 401

    async def test_a_heartbeat_says_where_the_lease_now_ends(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        job_id = await _a_job(session, user)
        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        first_lease = claimed.json()["expires_at"]

        beaten = await client.post(
            f"/maty/runner/jobs/{job_id}/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-1"},
        )

        assert beaten.status_code == 200
        body = beaten.json()
        assert body["status"] == MatyJobStatus.running.value
        assert datetime.fromisoformat(
            body["lease_expires_at"]
        ) >= datetime.fromisoformat(first_lease)

    async def test_a_job_the_caller_does_not_hold_is_a_conflict(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        job_id = await _a_job(session, user)
        await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )

        response = await client.post(
            f"/maty/runner/jobs/{job_id}/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-2"},
        )

        assert response.status_code == 409

    async def test_a_job_that_does_not_exist_is_not_found(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        response = await client.post(
            "/maty/runner/jobs/00000000-0000-0000-0000-000000000000/heartbeat",
            headers=RUNNER,
            json={"runner": "cloud-1"},
        )
        assert response.status_code == 404

    async def test_a_retryable_failure_puts_the_job_back_with_a_backoff(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        job_id = await _a_job(session, user)
        await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )

        failed = await client.post(
            f"/maty/runner/jobs/{job_id}/fail",
            headers=RUNNER,
            json={
                "runner": "cloud-1",
                "reason": "Anthropic answered 529.",
                "retryable": True,
            },
        )

        assert failed.status_code == 200
        body = failed.json()
        assert body["status"] == MatyJobStatus.queued.value
        assert body["attempts"] == 1
        assert datetime.fromisoformat(body["scheduled_at"]) > utc_now()

    async def test_a_failure_that_cannot_be_retried_stops_the_job(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        job_id = await _a_job(session, user)
        await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )

        failed = await client.post(
            f"/maty/runner/jobs/{job_id}/fail",
            headers=RUNNER,
            json={
                "runner": "cloud-1",
                "reason": "The mailbox is gone.",
                "retryable": False,
            },
        )

        assert failed.status_code == 200
        assert failed.json()["status"] == MatyJobStatus.failed.value
        assert (
            await client.post(
                "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
            )
        ).json() == {"job": None}

    async def test_a_claim_without_a_runner_name_is_refused(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        response = await client.post("/maty/runner/claim", headers=RUNNER, json={})
        assert response.status_code == 422
