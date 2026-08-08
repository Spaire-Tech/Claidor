"""Historique keeps what was asked, including what failed.

Questions asked inside a dossier were already the matter's record.
Everything typed into the Assistant vanished with the tab, so Historique
could only ever show the current session — and the answer a lawyer read
last week was gone.

The record is written before the answer is produced. That ordering is the
point: a question whose answer failed is still a question that was asked,
and a Historique that remembers only successes is a diary, not a record.
"""

import pytest
from httpx import AsyncClient

from polar.librarian.repository import LibrarianQuestionRepository
from polar.models import Organization, QuestionStatus, UserOrganization
from polar.models.user import User
from polar.postgres import AsyncSession


@pytest.mark.asyncio
class TestListQuestions:
    async def test_anonymous_is_refused(
        self, client: AsyncClient, organization: Organization
    ) -> None:
        response = await client.get(
            f"/v1/librarian/questions?organization_id={organization.id}"
        )

        assert response.status_code == 401

    @pytest.mark.auth
    async def test_empty_history_is_an_empty_list(
        self,
        client: AsyncClient,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        response = await client.get(
            f"/v1/librarian/questions?organization_id={organization.id}"
        )

        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.auth
    async def test_questions_come_back_newest_first(
        self,
        client: AsyncClient,
        session: AsyncSession,
        organization: Organization,
        user: User,
        user_organization: UserOrganization,
    ) -> None:
        repository = LibrarianQuestionRepository.from_session(session)
        for text in ("première question", "deuxième question"):
            await repository.create_question(
                user_id=user.id, organization_id=organization.id, question=text
            )

        response = await client.get(
            f"/v1/librarian/questions?organization_id={organization.id}"
        )

        assert response.status_code == 200
        rows = response.json()
        assert [r["question"] for r in rows] == [
            "deuxième question",
            "première question",
        ]

    @pytest.mark.auth
    async def test_a_failed_question_is_still_in_the_record(
        self,
        client: AsyncClient,
        session: AsyncSession,
        organization: Organization,
        user: User,
        user_organization: UserOrganization,
    ) -> None:
        repository = LibrarianQuestionRepository.from_session(session)
        row = await repository.create_question(
            user_id=user.id,
            organization_id=organization.id,
            question="question dont la réponse a échoué",
        )
        await repository.record_answer(row, answer=None, status=QuestionStatus.failed)

        response = await client.get(
            f"/v1/librarian/questions?organization_id={organization.id}"
        )

        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["status"] == "failed"
        assert rows[0]["answer"] is None

    @pytest.mark.auth
    async def test_a_clarification_is_stored_as_a_clarification(
        self,
        client: AsyncClient,
        session: AsyncSession,
        organization: Organization,
        user: User,
        user_organization: UserOrganization,
    ) -> None:
        # The version gate asking for a date is not an answer, and must
        # not be filed as one.
        repository = LibrarianQuestionRepository.from_session(session)
        row = await repository.create_question(
            user_id=user.id,
            organization_id=organization.id,
            question="Quel est le délai pour contester ?",
        )
        await repository.record_answer(
            row,
            answer="À quelle date la saisie a-t-elle été dénoncée ?",
            status=QuestionStatus.clarification_requested,
        )

        rows = (
            await client.get(
                f"/v1/librarian/questions?organization_id={organization.id}"
            )
        ).json()

        assert rows[0]["status"] == "clarification_requested"

    @pytest.mark.auth
    async def test_another_persons_questions_are_not_shown(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: object,
        organization: Organization,
        user_organization: UserOrganization,
    ) -> None:
        # Dossiers are shared on purpose; a question typed into the
        # Assistant is not part of that bargain.
        from tests.fixtures.random_objects import create_user

        colleague = await create_user(save_fixture)  # type: ignore[arg-type]
        repository = LibrarianQuestionRepository.from_session(session)
        await repository.create_question(
            user_id=colleague.id,
            organization_id=organization.id,
            question="la question du confrère",
        )

        rows = (
            await client.get(
                f"/v1/librarian/questions?organization_id={organization.id}"
            )
        ).json()

        assert rows == []


@pytest.mark.asyncio
class TestStoredSources:
    """A recorded answer keeps what it stood on.

    Historique stored the answer and not its citations, so a question
    reopened a week later showed a legal conclusion with nothing under it —
    the one thing Claidor never shows while the answer is streaming. The
    record has to be as checkable as the live answer, or it is a claim.
    """

    @pytest.mark.auth
    async def test_the_citations_come_back_with_the_answer(
        self,
        client: AsyncClient,
        session: AsyncSession,
        organization: Organization,
        user: User,
        user_organization: UserOrganization,
    ) -> None:
        repository = LibrarianQuestionRepository.from_session(session)
        row = await repository.create_question(
            user_id=user.id,
            organization_id=organization.id,
            question="Dans quel délai contester une saisie-attribution ?",
        )
        await repository.record_answer(
            row,
            answer="Un mois à compter de la dénonciation.",
            status=QuestionStatus.answered,
            sources=[
                {
                    "kind": "article",
                    "id": "art-170",
                    "title": "AUPSRVE (1998) — Article 170",
                    "quote": "À peine d'irrecevabilité…",
                    "nature": "law",
                }
            ],
        )

        rows = (
            await client.get(
                f"/v1/librarian/questions?organization_id={organization.id}"
            )
        ).json()

        assert len(rows[0]["sources"]) == 1
        assert rows[0]["sources"][0]["title"] == "AUPSRVE (1998) — Article 170"
        assert rows[0]["sources"][0]["quote"] == "À peine d'irrecevabilité…"

    @pytest.mark.auth
    async def test_a_question_answered_before_this_has_none_rather_than_a_guess(
        self,
        client: AsyncClient,
        session: AsyncSession,
        organization: Organization,
        user: User,
        user_organization: UserOrganization,
    ) -> None:
        # Older rows cannot have their sources reconstructed, and inventing
        # them would be worse than showing none.
        repository = LibrarianQuestionRepository.from_session(session)
        row = await repository.create_question(
            user_id=user.id,
            organization_id=organization.id,
            question="une question d'avant",
        )
        await repository.record_answer(
            row, answer="Une réponse.", status=QuestionStatus.answered
        )

        rows = (
            await client.get(
                f"/v1/librarian/questions?organization_id={organization.id}"
            )
        ).json()

        assert rows[0]["sources"] is None
