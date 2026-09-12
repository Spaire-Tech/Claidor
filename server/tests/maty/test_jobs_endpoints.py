"""The person's four routes, end to end over HTTP
(`polar/maty/desktop_endpoints.py`).

What is checked here and nowhere else:

- somebody else's job id is a 404, indistinguishable from an id that
  never existed, so an id cannot be probed;
- a Claidor with no runner says `available: false` and refuses to queue
  anything, rather than accepting work nobody will ever do;
- `deliver` and `allow` are refused rather than quietly emptied;
- the live-job cap, so a loop in the app cannot fill the queue;
- cancel works on a job that has not started and is refused on one a
  runner is holding.

Requires the full suite's fixtures (a database, the app), so it does not
run under `--noconftest`.
"""

import uuid

import httpx
import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.desktop.service import desktop
from polar.maty.service import (
    CANCELLED_REASON,
    LIVE_JOB_LIMIT,
    PROMPT_MAX_LENGTH,
    maty,
)
from polar.models import MatyJobKind, MatyJobStatus, User
from polar.postgres import AsyncSession

JOBS = "/desktop/api/maty/jobs"

RUNNER_TOKEN = "a-service-secret-that-belongs-to-no-person"
RUNNER = {"Authorization": f"Bearer {RUNNER_TOKEN}"}


@pytest.fixture
def configured_runner(mocker: MockerFixture) -> None:
    """A Claidor a cloud runner can reach, which is what makes the cloud
    engine `available`."""
    mocker.patch.object(settings, "MATY_RUNNER_TOKEN", RUNNER_TOKEN)


@pytest.fixture
def no_runner(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "MATY_RUNNER_TOKEN", "")


async def signed_in(session: AsyncSession, user: User) -> dict[str, str]:
    """The headers the desktop app would be sending."""
    _, access, _ = await desktop._issue_session(session, user)
    await session.commit()
    return {"Authorization": f"Bearer {access}"}


@pytest.mark.asyncio
class TestWhoMayAsk:
    async def test_no_token_opens_nothing(self, client: httpx.AsyncClient) -> None:
        job_id = uuid.uuid4()
        assert (await client.get(JOBS)).status_code == 401
        assert (
            await client.post(JOBS, json={"prompt": "Brief me."})
        ).status_code == 401
        assert (await client.get(f"{JOBS}/{job_id}")).status_code == 401
        assert (await client.post(f"{JOBS}/{job_id}/cancel")).status_code == 401

    async def test_the_runner_s_service_token_is_not_a_person(
        self, client: httpx.AsyncClient, configured_runner: None
    ) -> None:
        """The two sets of routes share a table and nothing else."""
        assert (await client.get(JOBS, headers=RUNNER)).status_code == 401
        assert (
            await client.post(JOBS, headers=RUNNER, json={"prompt": "Brief me."})
        ).status_code == 401


@pytest.mark.asyncio
class TestWhetherThereIsACloudEngine:
    async def test_available_is_false_without_a_runner_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        no_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.get(JOBS, headers=headers)

        assert response.status_code == 200
        assert response.json() == {"available": False, "jobs": []}

    async def test_available_is_true_with_one(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.get(JOBS, headers=headers)

        assert response.json()["available"] is True

    async def test_creating_without_a_runner_is_refused_and_writes_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        no_runner: None,
    ) -> None:
        """A missing runner must read as « not available here », never as
        a queued job that silently never runs."""
        headers = await signed_in(session, user)

        response = await client.post(
            JOBS, headers=headers, json={"prompt": "Write the morning briefing."}
        )

        assert response.status_code == 503
        assert response.json()["detail"]
        listed = await client.get(JOBS, headers=headers)
        assert listed.json()["jobs"] == []


@pytest.mark.asyncio
class TestAskingForWork:
    async def test_a_job_comes_back_as_the_app_reads_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.post(
            JOBS, headers=headers, json={"prompt": "  Write the morning briefing.  "}
        )

        assert response.status_code == 201
        job = response.json()["job"]
        assert set(job) == {
            "id",
            "kind",
            "prompt",
            "status",
            "result",
            "error",
            "createdAt",
            "startedAt",
            "finishedAt",
        }
        # The default kind, and a prompt with its whitespace taken off.
        assert job["kind"] == MatyJobKind.task.value
        assert job["prompt"] == "Write the morning briefing."
        assert job["status"] == MatyJobStatus.queued.value
        assert job["result"] is None
        assert job["error"] is None
        assert job["startedAt"] is None
        assert job["finishedAt"] is None

    async def test_a_kind_may_be_asked_for(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.post(
            JOBS, headers=headers, json={"kind": "routine", "prompt": "Brief me."}
        )

        assert response.json()["job"]["kind"] == MatyJobKind.routine.value

    async def test_an_empty_prompt_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        for prompt in ("", "   ", "\n\t "):
            response = await client.post(JOBS, headers=headers, json={"prompt": prompt})
            assert response.status_code == 400, prompt

        assert (await client.get(JOBS, headers=headers)).json()["jobs"] == []

    async def test_an_over_long_prompt_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.post(
            JOBS, headers=headers, json={"prompt": "a" * (PROMPT_MAX_LENGTH + 1)}
        )

        assert response.status_code == 400
        assert (await client.get(JOBS, headers=headers)).json()["jobs"] == []

    async def test_a_prompt_exactly_at_the_cap_is_taken(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.post(
            JOBS, headers=headers, json={"prompt": "a" * PROMPT_MAX_LENGTH}
        )

        assert response.status_code == 201

    async def test_deliver_and_allow_are_refused_and_not_dropped(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        """Where an answer goes and what a job may do are the server's to
        decide. A silently emptied `deliver` would tell the person their
        briefing was emailed when it was not."""
        headers = await signed_in(session, user)

        for body in (
            {"prompt": "Brief me.", "deliver": {"channel": "email", "to": "x@y.z"}},
            {"prompt": "Brief me.", "allow": {"send": True}},
        ):
            response = await client.post(JOBS, headers=headers, json=body)
            assert response.status_code == 400, body

        assert (await client.get(JOBS, headers=headers)).json()["jobs"] == []

    async def test_empty_deliver_and_allow_are_the_ordinary_case(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)

        response = await client.post(
            JOBS,
            headers=headers,
            json={"prompt": "Brief me.", "deliver": {}, "allow": {}},
        )

        assert response.status_code == 201

    async def test_the_live_job_cap_stops_a_loop(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        for index in range(LIVE_JOB_LIMIT):
            created = await client.post(
                JOBS, headers=headers, json={"prompt": f"Job {index}."}
            )
            assert created.status_code == 201, index

        response = await client.post(
            JOBS, headers=headers, json={"prompt": "One more."}
        )

        assert response.status_code == 429
        listed = await client.get(JOBS, headers=headers)
        assert len(listed.json()["jobs"]) == LIVE_JOB_LIMIT

    async def test_a_finished_job_does_not_count_against_the_cap(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        """The cap is on what is in flight, not on how much anybody has
        ever used the cloud."""
        headers = await signed_in(session, user)
        ids = []
        for index in range(LIVE_JOB_LIMIT):
            created = await client.post(
                JOBS, headers=headers, json={"prompt": f"Job {index}."}
            )
            ids.append(created.json()["job"]["id"])
        assert (
            await client.post(JOBS, headers=headers, json={"prompt": "One more."})
        ).status_code == 429

        cancelled = await client.post(f"{JOBS}/{ids[0]}/cancel", headers=headers)
        assert cancelled.status_code == 200

        assert (
            await client.post(JOBS, headers=headers, json={"prompt": "One more."})
        ).status_code == 201

    async def test_one_person_s_jobs_do_not_fill_another_s_queue(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        configured_runner: None,
    ) -> None:
        mine = await signed_in(session, user)
        theirs = await signed_in(session, user_second)
        for index in range(LIVE_JOB_LIMIT):
            await client.post(JOBS, headers=mine, json={"prompt": f"Job {index}."})

        assert (
            await client.post(JOBS, headers=theirs, json={"prompt": "Mine."})
        ).status_code == 201


@pytest.mark.asyncio
class TestOwnership:
    async def test_another_person_s_job_is_not_found(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        configured_runner: None,
    ) -> None:
        """404 and never 403: a job id is the name of somebody's private
        work, and « that exists but is not yours » lets a list of ids be
        sifted for the real ones."""
        theirs = await signed_in(session, user_second)
        created = await client.post(JOBS, headers=theirs, json={"prompt": "Theirs."})
        their_job_id = created.json()["job"]["id"]
        mine = await signed_in(session, user)

        found = await client.get(f"{JOBS}/{their_job_id}", headers=mine)
        cancelled = await client.post(f"{JOBS}/{their_job_id}/cancel", headers=mine)

        assert found.status_code == 404
        assert cancelled.status_code == 404

    async def test_a_job_that_never_existed_answers_exactly_the_same(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        configured_runner: None,
    ) -> None:
        """The two refusals must be one sentence, or the difference
        between them is the probe."""
        theirs = await signed_in(session, user_second)
        created = await client.post(JOBS, headers=theirs, json={"prompt": "Theirs."})
        their_job_id = created.json()["job"]["id"]
        never = uuid.uuid4()
        mine = await signed_in(session, user)

        real = await client.get(f"{JOBS}/{their_job_id}", headers=mine)
        imagined = await client.get(f"{JOBS}/{never}", headers=mine)

        assert real.status_code == imagined.status_code == 404
        assert real.json()["error"] == imagined.json()["error"]

    async def test_a_listing_holds_only_this_person_s_work(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        configured_runner: None,
    ) -> None:
        theirs = await signed_in(session, user_second)
        await client.post(JOBS, headers=theirs, json={"prompt": "Theirs."})
        mine = await signed_in(session, user)
        await client.post(JOBS, headers=mine, json={"prompt": "Mine."})

        listed = await client.get(JOBS, headers=mine)

        jobs = listed.json()["jobs"]
        assert [job["prompt"] for job in jobs] == ["Mine."]

    async def test_a_job_of_mine_is_found(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        created = await client.post(JOBS, headers=headers, json={"prompt": "Mine."})
        job_id = created.json()["job"]["id"]

        found = await client.get(f"{JOBS}/{job_id}", headers=headers)

        assert found.status_code == 200
        assert found.json()["job"]["id"] == job_id


@pytest.mark.asyncio
class TestCancelling:
    async def test_a_queued_job_can_be_called_off(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        created = await client.post(JOBS, headers=headers, json={"prompt": "Brief me."})
        job_id = created.json()["job"]["id"]

        response = await client.post(f"{JOBS}/{job_id}/cancel", headers=headers)

        assert response.status_code == 200
        job = response.json()["job"]
        assert job["status"] == MatyJobStatus.failed.value
        assert job["error"] == CANCELLED_REASON
        assert job["finishedAt"] is not None

    async def test_a_cancelled_job_is_never_handed_to_a_runner(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        created = await client.post(JOBS, headers=headers, json={"prompt": "Brief me."})
        job_id = created.json()["job"]["id"]
        await client.post(f"{JOBS}/{job_id}/cancel", headers=headers)

        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )

        assert claimed.json() == {"job": None}

    async def test_a_running_job_is_refused_rather_than_raced(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        """A runner is holding it under a lease in a container that is
        already working; declaring it finished here would leave two
        writers on one row."""
        headers = await signed_in(session, user)
        created = await client.post(JOBS, headers=headers, json={"prompt": "Brief me."})
        job_id = created.json()["job"]["id"]
        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        assert claimed.json()["job"]["id"] == job_id

        response = await client.post(f"{JOBS}/{job_id}/cancel", headers=headers)

        assert response.status_code == 409
        still = await client.get(f"{JOBS}/{job_id}", headers=headers)
        assert still.json()["job"]["status"] == MatyJobStatus.running.value
        assert still.json()["job"]["startedAt"] is not None

    async def test_a_finished_job_cannot_be_cancelled(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        created = await client.post(JOBS, headers=headers, json={"prompt": "Brief me."})
        job_id = created.json()["job"]["id"]
        await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        await client.post(
            f"/maty/runner/jobs/{job_id}/complete",
            headers=RUNNER,
            json={"runner": "cloud-1", "result": "Three things…"},
        )

        response = await client.post(f"{JOBS}/{job_id}/cancel", headers=headers)

        assert response.status_code == 409
        found = await client.get(f"{JOBS}/{job_id}", headers=headers)
        job = found.json()["job"]
        assert job["status"] == MatyJobStatus.done.value
        assert job["result"] == "Three things…"
        assert job["finishedAt"] is not None

    async def test_cancelling_twice_is_refused_the_second_time(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        created = await client.post(JOBS, headers=headers, json={"prompt": "Brief me."})
        job_id = created.json()["job"]["id"]

        assert (
            await client.post(f"{JOBS}/{job_id}/cancel", headers=headers)
        ).status_code == 200
        assert (
            await client.post(f"{JOBS}/{job_id}/cancel", headers=headers)
        ).status_code == 409


@pytest.mark.asyncio
class TestTheWholeRound:
    async def test_a_job_asked_for_in_the_app_is_answered_in_the_app(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        """The cautious default, end to end: the person asks, the runner
        works, the answer comes back to the app, and nothing was sent
        anywhere because nothing was allowed to be."""
        headers = await signed_in(session, user)
        created = await client.post(
            JOBS, headers=headers, json={"prompt": "Write the morning briefing."}
        )
        job_id = created.json()["job"]["id"]

        claimed = await client.post(
            "/maty/runner/claim", headers=RUNNER, json={"runner": "cloud-1"}
        )
        handed = claimed.json()["job"]
        assert handed["deliver"] == {}
        assert handed["allow"] == {}

        await client.post(
            f"/maty/runner/jobs/{job_id}/complete",
            headers=RUNNER,
            json={"runner": "cloud-1", "result": "Three things happened overnight."},
        )

        listed = await client.get(JOBS, headers=headers)
        assert listed.json()["available"] is True
        job = listed.json()["jobs"][0]
        assert job["status"] == MatyJobStatus.done.value
        assert job["result"] == "Three things happened overnight."
        assert job["startedAt"] is not None
        assert job["finishedAt"] is not None

    async def test_the_listing_is_newest_first(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        headers = await signed_in(session, user)
        for prompt in ("First.", "Second.", "Third."):
            await client.post(JOBS, headers=headers, json={"prompt": prompt})

        listed = await client.get(JOBS, headers=headers)

        assert [job["prompt"] for job in listed.json()["jobs"]] == [
            "Third.",
            "Second.",
            "First.",
        ]

    async def test_claidor_s_own_enqueue_is_not_bound_by_the_app_s_rules(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        configured_runner: None,
    ) -> None:
        """A routine coming due carries a `deliver` and an `allow` that the
        server decided. The refusals are on the app's way in, not on the
        table."""
        job = await maty.enqueue(
            session,
            user,
            kind=MatyJobKind.routine,
            prompt="Brief me.",
            deliver={"channel": "email", "to": user.email},
            allow={"send": True},
        )
        await session.commit()

        headers = await signed_in(session, user)
        found = await client.get(f"{JOBS}/{job.id}", headers=headers)

        assert found.status_code == 200
        assert found.json()["job"]["kind"] == MatyJobKind.routine.value
