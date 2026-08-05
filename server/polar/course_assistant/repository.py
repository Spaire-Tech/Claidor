from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, case, func, or_, select

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from polar.models import UserOrganization
from polar.models.course_assistant import CourseAssistant
from polar.models.course_assistant_question import CourseAssistantQuestion
from polar.models.course_lesson import CourseLesson
from polar.models.course_module import CourseModule


class CourseAssistantRepository(
    RepositorySoftDeletionIDMixin[CourseAssistant, UUID],
    RepositorySoftDeletionMixin[CourseAssistant],
    RepositoryBase[CourseAssistant],
):
    model = CourseAssistant

    async def get_by_course(self, course_id: UUID) -> CourseAssistant | None:
        statement = self.get_base_statement().where(
            CourseAssistant.course_id == course_id
        )
        return await self.get_one_or_none(statement)

    async def list_course_ids_needing_build(self, limit: int = 100) -> list[UUID]:
        """Course ids that have at least one lesson but no assistant yet (or one
        still stuck in ``building``). The reconcile cron uses this to pick up
        courses whose build was never triggered — notably text-only courses,
        which produce no Mux webhook to kick the build. Drafts count: the
        assistant trains on all uploaded lessons (exposure is gated by the
        approve/live flow, not by lesson publish state)."""
        statement = (
            select(CourseModule.course_id)
            .join(CourseLesson, CourseLesson.module_id == CourseModule.id)
            .join(
                CourseAssistant,
                (CourseAssistant.course_id == CourseModule.course_id)
                & (CourseAssistant.deleted_at.is_(None)),
                isouter=True,
            )
            .where(
                CourseLesson.deleted_at.is_(None),
                CourseModule.deleted_at.is_(None),
                or_(
                    CourseAssistant.id.is_(None),
                    CourseAssistant.status == "building",
                ),
            )
            .distinct()
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return [row[0] for row in result.all()]

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[CourseAssistant]]:
        statement = self.get_base_statement()
        if is_user(auth_subject):
            statement = statement.where(
                CourseAssistant.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == auth_subject.subject.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                CourseAssistant.organization_id == auth_subject.subject.id
            )
        return statement


@dataclass(frozen=True)
class QuestionGroup:
    """One aggregated question (a normalized-text cluster) for the creator's
    "What students are asking" surface."""

    question: str
    count: int
    asker_count: int
    refused_count: int
    last_asked_at: datetime


@dataclass(frozen=True)
class QuestionTotals:
    total: int
    asker_count: int
    refused_count: int


class CourseAssistantQuestionRepository(
    RepositorySoftDeletionIDMixin[CourseAssistantQuestion, UUID],
    RepositorySoftDeletionMixin[CourseAssistantQuestion],
    RepositoryBase[CourseAssistantQuestion],
):
    model = CourseAssistantQuestion

    async def top_questions(
        self, course_id: UUID, *, limit: int = 50
    ) -> list[QuestionGroup]:
        """Top question clusters for a course, most-asked first. Groups by the
        normalized text; the displayed phrasing is the most recently asked one
        in each cluster."""
        Q = CourseAssistantQuestion
        refused = func.sum(case((Q.outcome == "refused", 1), else_=0))
        agg = (
            select(
                Q.question_normalized.label("norm"),
                # NB: avoid the label "count" — Row.count collides with the
                # built-in tuple.count method and would shadow the value.
                func.count().label("n"),
                func.count(func.distinct(Q.customer_id)).label("asker_count"),
                refused.label("refused_count"),
                func.max(Q.created_at).label("last_asked_at"),
            )
            .where(Q.course_id == course_id, Q.deleted_at.is_(None))
            .group_by(Q.question_normalized)
            .order_by(func.count().desc(), func.max(Q.created_at).desc())
            .limit(limit)
        )
        agg_rows = (await self.session.execute(agg)).all()
        if not agg_rows:
            return []

        norms = [row.norm for row in agg_rows]
        # Latest actual phrasing per cluster (DISTINCT ON is Postgres-native).
        rep_stmt = (
            select(Q.question_normalized, Q.question)
            .where(
                Q.course_id == course_id,
                Q.deleted_at.is_(None),
                Q.question_normalized.in_(norms),
            )
            .order_by(Q.question_normalized, Q.created_at.desc())
            .distinct(Q.question_normalized)
        )
        reps = {
            norm: question
            for norm, question in (await self.session.execute(rep_stmt)).all()
        }
        return [
            QuestionGroup(
                question=reps.get(row.norm, row.norm),
                count=int(row.n),
                asker_count=int(row.asker_count or 0),
                refused_count=int(row.refused_count or 0),
                last_asked_at=row.last_asked_at,
            )
            for row in agg_rows
        ]

    async def totals(self, course_id: UUID) -> QuestionTotals:
        Q = CourseAssistantQuestion
        refused = func.sum(case((Q.outcome == "refused", 1), else_=0))
        stmt = select(
            func.count().label("total"),
            func.count(func.distinct(Q.customer_id)).label("asker_count"),
            refused.label("refused_count"),
        ).where(Q.course_id == course_id, Q.deleted_at.is_(None))
        row = (await self.session.execute(stmt)).one()
        return QuestionTotals(
            total=int(row.total or 0),
            asker_count=int(row.asker_count or 0),
            refused_count=int(row.refused_count or 0),
        )
