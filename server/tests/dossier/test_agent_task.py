"""Running an agent task in a matter, and what is written down.

The loop's own tests cover every path with a fake model and no database.
What is only testable here is what happens either side of it: that the
workspace really is built from the matter and nothing wider, and that a
run — including one that failed — survives into a row somebody can read
three weeks later.
"""

from typing import Any
from uuid import uuid4

import pytest

from polar.agent import Stopped
from polar.dossier.agent import service as agent_service
from polar.dossier.repository import DossierRepository
from polar.kit.db.postgres import AsyncSession
from polar.models import DocumentCategory, ExtractionStatus, User
from polar.models.file import File, FileServiceTypes
from tests.dossier.test_agent_loop import FakeClient, calls, says
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user


async def _matter(
    session: AsyncSession,
    save_fixture: SaveFixture,
    user: User,
    *,
    readable: int = 1,
    scans: int = 0,
):
    organization = await create_organization(save_fixture)
    repository = DossierRepository.from_session(session)
    dossier = await repository.create_dossier(
        organization_id=organization.id,
        name="Project Atlas",
        created_by_id=user.id,
    )

    for index in range(readable + scans):
        unreadable = index >= readable
        file = File(
            organization_id=organization.id,
            name=f"f{index}.txt",
            path=f"dossier/f{index}.txt",
            mime_type="text/plain",
            size=10,
            service=FileServiceTypes.dossier_document,
            is_uploaded=True,
            is_enabled=True,
        )
        await save_fixture(file)
        document = await repository.add_document(
            dossier_id=dossier.id,
            file_id=file.id,
            title=f"Scan {index}" if unreadable else f"Contract {index}",
            category=DocumentCategory.contract,
            uploaded_by_id=user.id,
        )
        await repository.set_extraction(
            document,
            status=(
                ExtractionStatus.unextractable
                if unreadable
                else ExtractionStatus.extracted
            ),
            text=None if unreadable else "The cap is 12 months' fees.",
        )

    await session.flush()
    return dossier


@pytest.mark.asyncio
class TestTheWorkspace:
    async def test_it_holds_every_document_including_the_scans(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        # list_readable_documents is the tempting call and the wrong one:
        # an agent that cannot see the scans answers as though the matter
        # were only what it could read.
        dossier = await _matter(session, save_fixture, user, readable=2, scans=3)

        workspace = await agent_service.load_workspace(session, dossier.id)

        assert len(workspace.documents) == 5

    async def test_it_holds_nothing_from_another_matter(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        mine = await _matter(session, save_fixture, user, readable=1)
        await _matter(session, save_fixture, user, readable=4)

        workspace = await agent_service.load_workspace(session, mine.id)

        assert len(workspace.documents) == 1


@pytest.mark.asyncio
class TestWhatIsWrittenDown:
    async def test_a_finished_run_keeps_its_answer_and_its_trace(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        dossier = await _matter(session, save_fixture, user, readable=1)
        client = FakeClient(
            calls("list_documents"),
            calls("search_documents", {"query": "cap"}),
            says("The cap is 12 months' fees, in Contract 0."),
        )

        task, outcome = await agent_service.run_task(
            session,
            dossier_id=dossier.id,
            user_id=user.id,
            prompt="What is the cap?",
            client=client,
        )

        assert task.stopped == Stopped.answered
        assert "12 months" in task.answer
        repository = DossierRepository.from_session(session)
        steps = await repository.list_task_steps(task.id)
        assert [step.tool for step in steps] == [
            "list_documents",
            "search_documents",
        ]
        assert [step.ordinal for step in steps] == [1, 2]
        assert outcome.complete

    async def test_a_refused_step_is_kept_not_tidied_away(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        dossier = await _matter(session, save_fixture, user, readable=1)
        client = FakeClient(
            calls("read_document", {"document_id": str(uuid4())}),
            says("That document is not in this matter."),
        )

        task, _ = await agent_service.run_task(
            session,
            dossier_id=dossier.id,
            user_id=user.id,
            prompt="Read the other side's file",
            client=client,
        )

        repository = DossierRepository.from_session(session)
        steps = await repository.list_task_steps(task.id)
        assert len(steps) == 1
        assert steps[0].ok is False

    async def test_a_failed_run_is_still_written_down(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        # A matter where three of yesterday's twenty tasks silently never
        # happened is worse than one showing three failures.
        dossier = await _matter(session, save_fixture, user, readable=1)
        client = FakeClient(RuntimeError("the provider is down"))

        task, _ = await agent_service.run_task(
            session,
            dossier_id=dossier.id,
            user_id=user.id,
            prompt="Anything",
            client=client,
        )

        assert task.stopped == Stopped.failed
        assert task.answer == ""
        assert task.error is not None
        assert "provider is down" in task.error

    async def test_a_truncated_run_records_that_it_was_truncated(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        dossier = await _matter(session, save_fixture, user, readable=1)
        client = FakeClient(*[calls("list_documents") for _ in range(6)])

        task, _ = await agent_service.run_task(
            session,
            dossier_id=dossier.id,
            user_id=user.id,
            prompt="Check everything",
            client=client,
            max_steps=2,
        )

        assert task.stopped == Stopped.step_limit

    async def test_the_arguments_of_each_call_are_kept(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        # "Where did this number come from" is answerable only if the trace
        # says which document was read and from what offset.
        dossier = await _matter(session, save_fixture, user, readable=1)
        client = FakeClient(
            calls("search_documents", {"query": "indemnity"}), says("None.")
        )

        task, _ = await agent_service.run_task(
            session,
            dossier_id=dossier.id,
            user_id=user.id,
            prompt="Indemnity?",
            client=client,
        )

        repository = DossierRepository.from_session(session)
        steps = await repository.list_task_steps(task.id)
        assert steps[0].arguments == {"query": "indemnity"}


@pytest.mark.asyncio
class TestListingTasks:
    async def test_steps_come_back_grouped_by_task(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        dossier = await _matter(session, save_fixture, user, readable=1)
        for _ in range(2):
            await agent_service.run_task(
                session,
                dossier_id=dossier.id,
                user_id=user.id,
                prompt="Go",
                client=FakeClient(calls("list_documents"), says("Done.")),
            )

        repository = DossierRepository.from_session(session)
        tasks = await repository.list_tasks(dossier.id)
        grouped = await repository.list_steps_for(task.id for task in tasks)

        assert len(tasks) == 2
        assert all(len(grouped[task.id]) == 1 for task in tasks)

    async def test_asking_for_no_tasks_steps_costs_no_query(
        self, session: AsyncSession
    ) -> None:
        repository = DossierRepository.from_session(session)

        assert await repository.list_steps_for([]) == {}


@pytest.mark.asyncio
class TestTheRoute:
    async def test_someone_not_on_the_matter_cannot_run_a_task(
        self, client: Any, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        stranger = await create_user(save_fixture)
        dossier = await _matter(session, save_fixture, stranger, readable=1)

        response = await client.post(
            f"/v1/dossiers/{dossier.id}/tasks", json={"prompt": "Read everything"}
        )

        assert response.status_code in (401, 404)

    @pytest.mark.auth
    async def test_listing_returns_the_trace_with_each_task(
        self,
        client: Any,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        dossier = await _matter(session, save_fixture, user, readable=1)
        await agent_service.run_task(
            session,
            dossier_id=dossier.id,
            user_id=user.id,
            prompt="Go",
            client=FakeClient(calls("list_documents"), says("Done.")),
        )

        response = await client.get(f"/v1/dossiers/{dossier.id}/tasks")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["complete"] is True
        assert len(body[0]["steps"]) == 1
        assert body[0]["steps"][0]["tool"] == "list_documents"
