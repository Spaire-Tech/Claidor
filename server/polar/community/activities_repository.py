"""Database queries for community activities + submissions."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select

from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from polar.models.community_activity import CommunityActivity
from polar.models.community_activity_submission import CommunityActivitySubmission
from polar.models.community_activity_submission_comment import (
    CommunityActivitySubmissionComment,
)
from polar.models.course_lesson import CourseLesson
from polar.models.course_module import CourseModule
from polar.models.customer import Customer
from polar.models.user import User


class CommunityActivityRepository(
    RepositorySoftDeletionIDMixin[CommunityActivity, UUID],
    RepositorySoftDeletionMixin[CommunityActivity],
    RepositoryBase[CommunityActivity],
):
    model = CommunityActivity

    async def list_for_course(self, course_id: UUID) -> Sequence[CommunityActivity]:
        statement = (
            self.get_base_statement()
            .where(CommunityActivity.course_id == course_id)
            .order_by(CommunityActivity.created_at.desc())
        )
        return await self.get_all(statement)

    async def get_by_id_for_course(
        self, activity_id: UUID, course_id: UUID
    ) -> CommunityActivity | None:
        statement = self.get_base_statement().where(
            CommunityActivity.id == activity_id,
            CommunityActivity.course_id == course_id,
        )
        return await self.get_one_or_none(statement)


    async def map_by_pinned_post_ids(
        self, post_ids: set[UUID]
    ) -> dict[UUID, UUID]:
        """Return {pinned_post_id: activity_id} for the given posts.
        Used by the feed serializer to surface an 'Open activity' CTA
        on synthetic activity-pin posts."""
        if not post_ids:
            return {}
        statement = select(
            CommunityActivity.pinned_post_id, CommunityActivity.id
        ).where(
            CommunityActivity.pinned_post_id.in_(post_ids),
            CommunityActivity.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return {row[0]: row[1] for row in result.all() if row[0] is not None}

    async def summary_by_pinned_post_ids(
        self, post_ids: set[UUID]
    ) -> dict[
        UUID,
        tuple[UUID, str, int],
    ]:
        """Return {pinned_post_id: (activity_id, submission_type,
        submission_count)} for activity-pin posts. The feed renders an
        activity-CTA panel inline on these posts and needs the
        submission_type to pick the right label ("Upload photo" /
        "Upload video" / "Submit your work")."""
        if not post_ids:
            return {}
        statement = select(
            CommunityActivity.pinned_post_id,
            CommunityActivity.id,
            CommunityActivity.submission_type,
            CommunityActivity.submission_count,
        ).where(
            CommunityActivity.pinned_post_id.in_(post_ids),
            CommunityActivity.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return {
            row[0]: (row[1], row[2], int(row[3]))
            for row in result.all()
            if row[0] is not None
        }

    async def bulk_load_hosts(self, user_ids: set[UUID]) -> dict[UUID, User]:
        if not user_ids:
            return {}
        statement = select(User).where(User.id.in_(user_ids))
        result = await self.session.execute(statement)
        # User has eagerly-joined collections — `.unique()` is mandatory
        # or SQLAlchemy throws InvalidRequestError on `.all()`.
        return {u.id: u for u in result.scalars().unique().all()}

    async def bulk_load_channel_labels(
        self, activities: Sequence[CommunityActivity]
    ) -> dict[UUID, str | None]:
        """Resolve {activity_id: channel_label} for every row on the
        list page in two IN-queries instead of one session.get per row.

        channel_label is the title of the activity's lesson (lesson-
        scoped) or module (module-scoped). Returns None for activities
        whose channel target was hard-deleted out from under them."""
        module_ids = {
            a.module_id
            for a in activities
            if a.channel_kind == "module" and a.module_id is not None
        }
        lesson_ids = {
            a.lesson_id
            for a in activities
            if a.channel_kind == "lesson" and a.lesson_id is not None
        }

        module_titles: dict[UUID, str] = {}
        if module_ids:
            stmt = select(CourseModule.id, CourseModule.title).where(
                CourseModule.id.in_(module_ids)
            )
            rows = (await self.session.execute(stmt)).all()
            module_titles = {row[0]: row[1] for row in rows}

        lesson_titles: dict[UUID, str] = {}
        if lesson_ids:
            stmt2 = select(CourseLesson.id, CourseLesson.title).where(
                CourseLesson.id.in_(lesson_ids)
            )
            rows2 = (await self.session.execute(stmt2)).all()
            lesson_titles = {row[0]: row[1] for row in rows2}

        out: dict[UUID, str | None] = {}
        for a in activities:
            if a.channel_kind == "module" and a.module_id is not None:
                out[a.id] = module_titles.get(a.module_id)
            elif a.channel_kind == "lesson" and a.lesson_id is not None:
                out[a.id] = lesson_titles.get(a.lesson_id)
            else:
                out[a.id] = None
        return out

    async def module_info_by_pinned_post_ids(
        self, post_ids: set[UUID]
    ) -> dict[UUID, tuple[UUID, str | None]]:
        """Return {pinned_post_id: (module_id, module_title)} for module-
        scoped activity pins. Lesson-scoped pins are omitted — the
        existing lesson chip already covers them.

        Composed here (rather than in two queries on the service) so the
        feed render context can pull module chips in O(1) per page."""
        if not post_ids:
            return {}
        from polar.models.course_module import CourseModule

        statement = (
            select(
                CommunityActivity.pinned_post_id,
                CommunityActivity.module_id,
                CourseModule.title,
            )
            .join(CourseModule, CourseModule.id == CommunityActivity.module_id)
            .where(
                CommunityActivity.pinned_post_id.in_(post_ids),
                CommunityActivity.deleted_at.is_(None),
                CommunityActivity.channel_kind == "module",
                CommunityActivity.module_id.is_not(None),
            )
        )
        result = await self.session.execute(statement)
        return {
            row[0]: (row[1], row[2])
            for row in result.all()
            if row[0] is not None
        }


class CommunityActivitySubmissionRepository(
    RepositorySoftDeletionIDMixin[CommunityActivitySubmission, UUID],
    RepositorySoftDeletionMixin[CommunityActivitySubmission],
    RepositoryBase[CommunityActivitySubmission],
):
    model = CommunityActivitySubmission

    async def list_for_activity(
        self, activity_id: UUID
    ) -> Sequence[CommunityActivitySubmission]:
        statement = (
            self.get_base_statement()
            .where(CommunityActivitySubmission.activity_id == activity_id)
            .order_by(CommunityActivitySubmission.created_at.desc())
        )
        return await self.get_all(statement)

    async def list_for_activity_for_customer(
        self, activity_id: UUID, viewer_customer_id: UUID
    ) -> Sequence[CommunityActivitySubmission]:
        """Customer-side listing — applies visibility filtering.

        Submissions marked 'instr' (instructor-only) are hidden from
        peer customers but stay visible to their author so the
        submitter doesn't lose track of their own work."""
        from sqlalchemy import or_

        statement = (
            self.get_base_statement()
            .where(
                CommunityActivitySubmission.activity_id == activity_id,
                or_(
                    CommunityActivitySubmission.visibility != "instr",
                    CommunityActivitySubmission.customer_id == viewer_customer_id,
                ),
            )
            .order_by(CommunityActivitySubmission.created_at.desc())
        )
        return await self.get_all(statement)

    async def list_own_for_activity(
        self, activity_id: UUID, customer_id: UUID
    ) -> Sequence[CommunityActivitySubmission]:
        statement = (
            self.get_base_statement()
            .where(
                CommunityActivitySubmission.activity_id == activity_id,
                CommunityActivitySubmission.customer_id == customer_id,
            )
            .order_by(CommunityActivitySubmission.created_at.desc())
        )
        return await self.get_all(statement)

    async def count_for_activity(self, activity_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(CommunityActivitySubmission)
            .where(
                CommunityActivitySubmission.activity_id == activity_id,
                CommunityActivitySubmission.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def distinct_submitter_count(self, activity_id: UUID) -> int:
        statement = (
            select(func.count(func.distinct(CommunityActivitySubmission.customer_id)))
            .select_from(CommunityActivitySubmission)
            .where(
                CommunityActivitySubmission.activity_id == activity_id,
                CommunityActivitySubmission.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def distinct_submitter_counts(
        self, activity_ids: Sequence[UUID]
    ) -> dict[UUID, int]:
        if not activity_ids:
            return {}
        statement = (
            select(
                CommunityActivitySubmission.activity_id,
                func.count(func.distinct(CommunityActivitySubmission.customer_id)),
            )
            .where(
                CommunityActivitySubmission.activity_id.in_(activity_ids),
                CommunityActivitySubmission.deleted_at.is_(None),
            )
            .group_by(CommunityActivitySubmission.activity_id)
        )
        result = await self.session.execute(statement)
        return {row[0]: int(row[1]) for row in result.all()}

    async def bulk_load_authors(
        self, customer_ids: set[UUID]
    ) -> dict[UUID, Customer]:
        """Bulk-load Customer rows so the submission list serializer
        doesn't issue one session.get per row."""
        if not customer_ids:
            return {}
        statement = select(Customer).where(Customer.id.in_(customer_ids))
        result = await self.session.execute(statement)
        # Customer carries eagerly-joined collections (subscriptions,
        # benefit grants); `.unique()` is required on `.all()`.
        return {c.id: c for c in result.scalars().unique().all()}

    async def activity_ids_with_own_submission(
        self, activity_ids: Sequence[UUID], customer_id: UUID
    ) -> set[UUID]:
        if not activity_ids:
            return set()
        statement = select(CommunityActivitySubmission.activity_id).where(
            CommunityActivitySubmission.activity_id.in_(activity_ids),
            CommunityActivitySubmission.customer_id == customer_id,
            CommunityActivitySubmission.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return {row[0] for row in result.all()}


class CommunityActivitySubmissionCommentRepository(
    RepositorySoftDeletionIDMixin[CommunityActivitySubmissionComment, UUID],
    RepositorySoftDeletionMixin[CommunityActivitySubmissionComment],
    RepositoryBase[CommunityActivitySubmissionComment],
):
    model = CommunityActivitySubmissionComment

    async def list_for_submission(
        self, submission_id: UUID
    ) -> Sequence[CommunityActivitySubmissionComment]:
        statement = (
            self.get_base_statement()
            .where(
                CommunityActivitySubmissionComment.submission_id
                == submission_id
            )
            .order_by(CommunityActivitySubmissionComment.created_at.asc())
        )
        return await self.get_all(statement)
