from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from polar.kit.repository import RepositoryBase
from polar.models import LibrarianQuestion, QuestionStatus


class LibrarianQuestionRepository(RepositoryBase[LibrarianQuestion]):
    """The record of questions asked outside any matter.

    Scoped to the person who asked. A workspace's members share dossiers
    deliberately; a question typed into the Assistant is not part of that
    bargain, so Historique shows you your own.
    """

    model = LibrarianQuestion

    async def create_question(
        self, *, user_id: UUID, organization_id: UUID, question: str
    ) -> LibrarianQuestion:
        """Written before the answer exists, so nothing is lost on failure."""
        row = LibrarianQuestion(
            user_id=user_id,
            organization_id=organization_id,
            question=question,
            status=QuestionStatus.answered,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def record_answer(
        self,
        row: LibrarianQuestion,
        *,
        answer: str | None,
        status: QuestionStatus,
        versions_used: list[str] | None = None,
        authority_label: str | None = None,
        authority_count: int | None = None,
    ) -> LibrarianQuestion:
        row.answer = answer
        row.status = status
        row.versions_used = versions_used
        row.authority_label = authority_label
        row.authority_count = authority_count
        row.answered_at = datetime.now(UTC)
        self.session.add(row)
        await self.session.flush()
        return row

    async def list_for_user(
        self, user_id: UUID, *, organization_id: UUID, limit: int = 100
    ) -> Sequence[LibrarianQuestion]:
        statement = (
            select(LibrarianQuestion)
            .where(
                LibrarianQuestion.user_id == user_id,
                LibrarianQuestion.organization_id == organization_id,
                LibrarianQuestion.deleted_at.is_(None),
            )
            .order_by(LibrarianQuestion.created_at.desc())
            .limit(limit)
        )
        return (await self.session.execute(statement)).scalars().all()
