from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from polar.models import UserOrganization
from polar.models.course import Course
from polar.models.course_enrollment import CourseEnrollment
from polar.models.course_lesson import CourseLesson
from polar.models.course_lesson_progress import CourseLessonProgress
from polar.models.course_lesson_watch_progress import CourseLessonWatchProgress
from polar.models.course_module import CourseModule
from polar.models.course_note import CourseNote
from polar.models.customer import Customer
from polar.models.lesson_comment import LessonComment
from polar.models.lesson_comment_like import LessonCommentLike


class CourseRepository(
    RepositorySoftDeletionIDMixin[Course, UUID],
    RepositorySoftDeletionMixin[Course],
    RepositoryBase[Course],
):
    model = Course

    def get_by_product_statement(self, product_id: UUID):
        return self.get_base_statement().where(Course.product_id == product_id)

    def get_by_organization_statement(self, organization_id: UUID):
        return self.get_base_statement().where(
            Course.organization_id == organization_id
        )

    async def count_published_by_organization(self, organization_id: UUID) -> int:
        """Number of *published* courses owned by the organization — courses
        with at least one published (non-soft-deleted) lesson.

        The tier limit is named ``published_courses`` and enforcement matches
        the word: a draft course (no published lesson yet) does NOT occupy a
        slot, so a creator can stage unlimited drafts and is only metered on
        what's actually live. Counting *created* courses instead — drafts and
        all — was the documented Kajabi surprise we deliberately avoid.
        """
        published_course_ids = (
            select(CourseModule.course_id)
            .join(CourseLesson, CourseLesson.module_id == CourseModule.id)
            .where(
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
                CourseModule.deleted_at.is_(None),
            )
        )
        statement = select(func.count(func.distinct(Course.id))).where(
            Course.organization_id == organization_id,
            Course.deleted_at.is_(None),
            Course.id.in_(published_course_ids),
        )
        return (await self.session.execute(statement)).scalar_one()

    async def get_published_ids_by_organization(
        self, organization_id: UUID
    ) -> Sequence[UUID]:
        """IDs of the organization's *published* courses (>= 1 published,
        non-soft-deleted lesson). Mirrors count_published_by_organization;
        used by the demo portal to auto-enroll the demo student in whatever
        the creator has actually shipped.
        """
        published_course_ids = (
            select(CourseModule.course_id)
            .join(CourseLesson, CourseLesson.module_id == CourseModule.id)
            .where(
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
                CourseModule.deleted_at.is_(None),
            )
        )
        statement = select(Course.id).where(
            Course.organization_id == organization_id,
            Course.deleted_at.is_(None),
            Course.id.in_(published_course_ids),
        )
        return (await self.session.execute(statement)).scalars().all()

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[Course]]:
        statement = self.get_base_statement()
        if is_user(auth_subject):
            statement = statement.where(
                Course.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == auth_subject.subject.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                Course.organization_id == auth_subject.subject.id
            )
        return statement

    async def get_readable_by_id(
        self,
        course_id: UUID,
        auth_subject: AuthSubject[User | Organization],
    ) -> Course | None:
        statement = self.get_readable_statement(auth_subject).where(
            Course.id == course_id
        )
        return await self.get_one_or_none(statement)


class CourseModuleRepository(
    RepositorySoftDeletionIDMixin[CourseModule, UUID],
    RepositorySoftDeletionMixin[CourseModule],
    RepositoryBase[CourseModule],
):
    model = CourseModule

    def get_by_course_statement(self, course_id: UUID):
        return self.get_base_statement().where(CourseModule.course_id == course_id)

    async def get_readable_by_id(
        self,
        module_id: UUID,
        auth_subject: AuthSubject[User | Organization],
    ) -> CourseModule | None:
        course_repo = CourseRepository.from_session(self.session)
        readable_course_ids = course_repo.get_readable_statement(auth_subject).with_only_columns(Course.id)
        statement = self.get_base_statement().where(
            CourseModule.id == module_id,
            CourseModule.course_id.in_(readable_course_ids),
        )
        return await self.get_one_or_none(statement)


class CourseLessonRepository(
    RepositorySoftDeletionIDMixin[CourseLesson, UUID],
    RepositorySoftDeletionMixin[CourseLesson],
    RepositoryBase[CourseLesson],
):
    model = CourseLesson

    def get_by_module_statement(self, module_id: UUID):
        return self.get_base_statement().where(CourseLesson.module_id == module_id)

    def get_by_course_statement(self, course_id: UUID):
        """Get all lessons for a course (across all modules), ordered by position."""
        return (
            self.get_base_statement()
            .join(CourseModule)
            .where(CourseModule.course_id == course_id)
            .order_by(CourseLesson.position)
        )

    async def count_by_course(self, course_id: UUID) -> int:
        statement = select(func.count(CourseLesson.id)).where(
            CourseLesson.module_id.in_(
                select(CourseModule.id).where(CourseModule.course_id == course_id)
            ),
            CourseLesson.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one()

    async def count_published_by_course(self, course_id: UUID) -> int:
        """Published (non-soft-deleted) lesson count for a course. A course
        with zero published lessons is a draft and doesn't occupy a
        published_courses slot — see CourseRepository.
        count_published_by_organization."""
        statement = select(func.count(CourseLesson.id)).where(
            CourseLesson.module_id.in_(
                select(CourseModule.id).where(CourseModule.course_id == course_id)
            ),
            CourseLesson.published.is_(True),
            CourseLesson.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one()

    async def count_by_module(self, module_id: UUID) -> int:
        """Non-soft-deleted lesson count for a single module. Used by the
        module-completion detector — combined with the per-enrollment
        completed count we know when a student has finished a module."""
        statement = select(func.count(CourseLesson.id)).where(
            CourseLesson.module_id == module_id,
            CourseLesson.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one()

    async def get_readable_by_id(
        self,
        lesson_id: UUID,
        auth_subject: AuthSubject[User | Organization],
    ) -> CourseLesson | None:
        course_repo = CourseRepository.from_session(self.session)
        readable_course_ids = course_repo.get_readable_statement(auth_subject).with_only_columns(Course.id)
        readable_module_ids = (
            select(CourseModule.id)
            .where(
                CourseModule.course_id.in_(readable_course_ids),
                CourseModule.deleted_at.is_(None),
            )
        )
        statement = self.get_base_statement().where(
            CourseLesson.id == lesson_id,
            CourseLesson.module_id.in_(readable_module_ids),
        )
        return await self.get_one_or_none(statement)

    async def get_organization_id_for_lesson(
        self, lesson_id: UUID
    ) -> UUID | None:
        """Resolve the owning organization of a lesson via its module/course
        chain. Used by quota enforcement and the Mux webhook handler.
        """
        statement = (
            select(Course.organization_id)
            .join(CourseModule, CourseModule.course_id == Course.id)
            .join(CourseLesson, CourseLesson.module_id == CourseModule.id)
            .where(CourseLesson.id == lesson_id)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_course_and_org_for_lesson(
        self, lesson_id: UUID
    ) -> tuple[UUID, UUID] | None:
        """Resolve (course_id, organization_id) for a lesson via its
        module/course chain. Used by the published_courses cap gate when a
        lesson is published."""
        statement = (
            select(Course.id, Course.organization_id)
            .join(CourseModule, CourseModule.course_id == Course.id)
            .join(CourseLesson, CourseLesson.module_id == CourseModule.id)
            .where(CourseLesson.id == lesson_id)
        )
        result = await self.session.execute(statement)
        row = result.first()
        return (row[0], row[1]) if row is not None else None

    async def get_course_id_for_lesson(self, lesson_id: UUID) -> UUID | None:
        """Resolve the owning course of a lesson via its module. Used by the
        Course Assistant ingestion pipeline (a transcript landing on a lesson
        triggers a re-check of that lesson's course)."""
        statement = (
            select(CourseModule.course_id)
            .join(CourseLesson, CourseLesson.module_id == CourseModule.id)
            .where(CourseLesson.id == lesson_id)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def is_published_in_course(
        self, lesson_id: UUID, course_id: UUID
    ) -> bool:
        """Whether a published, non-deleted lesson belongs to the course.
        A single indexed lookup for the watch-progress heartbeat — the
        full accessibility walk (drip/paywall) is deliberately skipped:
        recording a position is a write the student can only usefully
        trigger for lessons they can already play."""
        statement = (
            select(CourseLesson.id)
            .join(CourseModule, CourseModule.id == CourseLesson.module_id)
            .where(
                CourseLesson.id == lesson_id,
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
                CourseModule.course_id == course_id,
                CourseModule.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none() is not None

    async def get_by_mux_asset_id(self, asset_id: str) -> CourseLesson | None:
        """Find a (non-soft-deleted) lesson by its Mux asset id. Used by the
        caption-track webhook, which identifies the asset, not the upload."""
        statement = self.get_base_statement().where(
            CourseLesson.mux_asset_id == asset_id
        )
        return await self.get_one_or_none(statement)

    async def list_stalled_mux_uploads(
        self, cutoff: datetime, limit: int = 200
    ) -> Sequence[CourseLesson]:
        """Lessons whose video is stuck in `waiting`/`processing` since
        before `cutoff`. The Mux webhook is the normal way out of those
        states; when it never arrives (abandoned upload tab, dropped
        webhook, failed transcode) the reconcile cron resolves them so the
        editor doesn't show "Processing…" — and poll — forever."""
        statement = (
            self.get_base_statement()
            .where(
                CourseLesson.mux_status.in_(["waiting", "processing"]),
                # modified_at is NULL until a row's first UPDATE — and a
                # wizard-created lesson whose upload was abandoned may never
                # be updated at all, so fall back to created_at or those
                # rows would evade the reconcile forever.
                func.coalesce(
                    CourseLesson.modified_at, CourseLesson.created_at
                )
                < cutoff,
            )
            .limit(limit)
        )
        return await self.get_all(statement)

    async def list_pending_transcripts(
        self, limit: int = 200
    ) -> Sequence[CourseLesson]:
        """Lessons whose caption transcript is still pending. The Course
        Assistant reconcile cron retries / times these out so a silently
        stuck caption can't block a course's assistant build forever."""
        statement = (
            self.get_base_statement()
            .where(CourseLesson.transcript_status == "pending")
            .limit(limit)
        )
        return await self.get_all(statement)

    async def list_pending_autofills(
        self, limit: int = 200
    ) -> Sequence[CourseLesson]:
        """Lessons whose transcript is ready but whose AI lesson draft is
        still 'pending' — i.e. the autofill enqueue was dropped. The reconcile
        cron re-kicks these so the editor's "AI is drafting…" banner always
        resolves."""
        statement = (
            self.get_base_statement()
            .where(
                CourseLesson.ai_autofill_status == "pending",
                CourseLesson.transcript_status == "ready",
            )
            .limit(limit)
        )
        return await self.get_all(statement)


class CourseEnrollmentRepository(
    RepositorySoftDeletionIDMixin[CourseEnrollment, UUID],
    RepositorySoftDeletionMixin[CourseEnrollment],
    RepositoryBase[CourseEnrollment],
):
    model = CourseEnrollment

    def get_by_customer_statement(self, customer_id: UUID):
        return self.get_base_statement().where(
            CourseEnrollment.customer_id == customer_id
        )

    def get_by_customer_and_course_statement(
        self, customer_id: UUID, course_id: UUID
    ):
        return self.get_base_statement().where(
            CourseEnrollment.customer_id == customer_id,
            CourseEnrollment.course_id == course_id,
        )

    async def get_active_for_customer_course(
        self, customer_id: UUID, course_id: UUID
    ) -> CourseEnrollment | None:
        """Active (non-soft-deleted) enrollment for the (customer,
        course) pair. Used as the author_enrollment_id source for
        student-authored writes (community posts, submission
        comments)."""
        statement = self.get_by_customer_and_course_statement(
            customer_id, course_id
        ).where(CourseEnrollment.deleted_at.is_(None))
        return await self.get_one_or_none(statement)

    async def get_active_id_for_customer_course(
        self, customer_id: UUID, course_id: UUID
    ) -> UUID | None:
        """Id of the active enrollment for the (customer, course) pair,
        without hydrating the enrollment's eager-loaded course tree.
        Used by the high-frequency watch-progress heartbeat, where
        loading course → modules → lessons per tick would be pure waste.
        """
        statement = select(CourseEnrollment.id).where(
            CourseEnrollment.customer_id == customer_id,
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_latest_revoked_for_customer_course(
        self, customer_id: UUID, course_id: UUID
    ) -> CourseEnrollment | None:
        """Most recent soft-deleted enrollment for the (customer, course)
        pair. Re-enrolling resurrects this row so progress, comments and
        notes (all keyed by enrollment_id) survive a revoke/re-buy cycle."""
        statement = (
            select(CourseEnrollment)
            .where(
                CourseEnrollment.customer_id == customer_id,
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.deleted_at.is_not(None),
            )
            .order_by(CourseEnrollment.deleted_at.desc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalars().first()

    def get_students_for_course_statement(
        self, course_id: UUID, organization_id: UUID
    ):
        """Enrollments for a course excluding the org's own members.

        Instructors preview their course through their own real customer
        account (their dashboard email — see get_preview_access), and the
        legacy preview sandbox used @course-preview.invalid addresses.
        Neither is a student, so both are excluded from the student-facing
        list (Customers tab, its count, and the CSV export). Eager-loads
        .customer in the same round trip.
        """
        from sqlalchemy.orm import selectinload

        instructor_emails = (
            select(func.lower(User.email))
            .join(UserOrganization, UserOrganization.user_id == User.id)
            .where(
                UserOrganization.organization_id == organization_id,
                UserOrganization.deleted_at.is_(None),
                User.email.is_not(None),
            )
            .scalar_subquery()
        )
        return (
            self.get_base_statement()
            .join(Customer, Customer.id == CourseEnrollment.customer_id)
            .where(
                CourseEnrollment.course_id == course_id,
                Customer.email.notilike("%@course-preview.invalid"),
                func.lower(Customer.email).not_in(instructor_emails),
            )
            .order_by(CourseEnrollment.enrolled_at.desc())
            .options(selectinload(CourseEnrollment.customer))
        )

    def apply_customer_search(self, statement: Select, query: str) -> Select:
        """Filter a students statement by customer email/name.

        Expects a statement that already joins Customer (i.e. built by
        get_students_for_course_statement) — it only adds the WHERE
        clause. Escapes LIKE metacharacters so a literal '_' or '%' in
        the query (common in emails) matches literally instead of as a
        wildcard.
        """
        escaped = (
            query.strip()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        return statement.where(
            Customer.email.ilike(pattern) | Customer.name.ilike(pattern)
        )

    async def list_customer_ids_for_course(
        self, course_id: UUID
    ) -> list[UUID]:
        """Customer ids with an active (non-deleted) enrollment in a
        course. Powers the community fan-out tasks; the raw select
        used to live in events_tasks/activities_tasks duplicated three
        times — per server/CLAUDE.md, queries belong in repositories."""
        from sqlalchemy import select

        statement = select(CourseEnrollment.customer_id).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return [r[0] for r in result.all()]


class CourseLessonProgressRepository(
    RepositorySoftDeletionIDMixin[CourseLessonProgress, UUID],
    RepositorySoftDeletionMixin[CourseLessonProgress],
    RepositoryBase[CourseLessonProgress],
):
    model = CourseLessonProgress

    def get_by_enrollment_statement(self, enrollment_id: UUID):
        return self.get_base_statement().where(
            CourseLessonProgress.enrollment_id == enrollment_id
        )

    async def count_by_enrollment(self, enrollment_id: UUID) -> int:
        statement = select(func.count(CourseLessonProgress.id)).where(
            CourseLessonProgress.enrollment_id == enrollment_id,
            CourseLessonProgress.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one()

    async def count_by_enrollment_in_module(
        self, enrollment_id: UUID, module_id: UUID
    ) -> int:
        """Completed lessons by an enrollment inside a single module.
        Together with CourseLessonRepository.count_by_module this is how
        the service detects a course.module_completed event."""
        statement = (
            select(func.count(CourseLessonProgress.id))
            .join(
                CourseLesson,
                CourseLesson.id == CourseLessonProgress.lesson_id,
            )
            .where(
                CourseLessonProgress.enrollment_id == enrollment_id,
                CourseLessonProgress.deleted_at.is_(None),
                CourseLesson.module_id == module_id,
                CourseLesson.deleted_at.is_(None),
            )
        )
        return (await self.session.execute(statement)).scalar_one()

    def get_by_enrollment_and_lesson_statement(
        self, enrollment_id: UUID, lesson_id: UUID
    ):
        return self.get_base_statement().where(
            CourseLessonProgress.enrollment_id == enrollment_id,
            CourseLessonProgress.lesson_id == lesson_id,
        )

    async def get_by_enrollment_and_lesson_including_deleted(
        self, enrollment_id: UUID, lesson_id: UUID
    ) -> CourseLessonProgress | None:
        """Fetch the (enrollment, lesson) completion row even when it is
        soft-deleted. mark_lesson_complete needs this: the unique
        constraint counts soft-deleted rows, so a dead row must be
        resurrected — a blind INSERT would violate the constraint."""
        statement = select(CourseLessonProgress).where(
            CourseLessonProgress.enrollment_id == enrollment_id,
            CourseLessonProgress.lesson_id == lesson_id,
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def hard_delete_by_enrollment(self, enrollment_id: UUID) -> None:
        """Physically remove ALL completion rows for an enrollment.

        Used by the portal's reset-progress action. Must be a HARD delete:
        the (enrollment_id, lesson_id) unique constraint counts soft-deleted
        rows too, so a soft-deleted completion would make the next
        mark-complete INSERT violate the constraint.
        """
        await self.session.execute(
            delete(CourseLessonProgress).where(
                CourseLessonProgress.enrollment_id == enrollment_id
            )
        )

    async def completion_summary_by_enrollments(
        self, enrollment_ids: Sequence[UUID]
    ) -> dict[UUID, tuple[int, datetime | None]]:
        """(completed_count, last_completed_at) per enrollment, one query.

        Powers the instructor's Customers tab — per-page aggregation, so
        the payload stays bounded by the page size, not the course size.
        Only counts currently published, non-deleted lessons so the
        numerator matches the published-lesson denominator (otherwise
        unpublishing a lesson after completions makes rates exceed 100%).
        """
        if not enrollment_ids:
            return {}
        statement = (
            select(
                CourseLessonProgress.enrollment_id,
                func.count(CourseLessonProgress.id),
                func.max(CourseLessonProgress.completed_at),
            )
            .join(
                CourseLesson,
                CourseLesson.id == CourseLessonProgress.lesson_id,
            )
            .where(
                CourseLessonProgress.enrollment_id.in_(enrollment_ids),
                CourseLessonProgress.deleted_at.is_(None),
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
            )
            .group_by(CourseLessonProgress.enrollment_id)
        )
        result = await self.session.execute(statement)
        return {row[0]: (row[1], row[2]) for row in result.all()}


class CourseLessonWatchProgressRepository(
    RepositorySoftDeletionIDMixin[CourseLessonWatchProgress, UUID],
    RepositorySoftDeletionMixin[CourseLessonWatchProgress],
    RepositoryBase[CourseLessonWatchProgress],
):
    model = CourseLessonWatchProgress

    def get_by_enrollment_statement(self, enrollment_id: UUID):
        return self.get_base_statement().where(
            CourseLessonWatchProgress.enrollment_id == enrollment_id
        )

    async def hard_delete_by_enrollment(self, enrollment_id: UUID) -> None:
        """Physically remove ALL watch-position rows for an enrollment
        (reset-progress). Hard delete for the same reason as completions:
        the (enrollment_id, lesson_id) unique constraint counts
        soft-deleted rows."""
        await self.session.execute(
            delete(CourseLessonWatchProgress).where(
                CourseLessonWatchProgress.enrollment_id == enrollment_id
            )
        )

    def get_by_enrollment_and_lesson_statement(
        self, enrollment_id: UUID, lesson_id: UUID
    ):
        return self.get_base_statement().where(
            CourseLessonWatchProgress.enrollment_id == enrollment_id,
            CourseLessonWatchProgress.lesson_id == lesson_id,
        )

    async def watch_summary_by_enrollments(
        self, enrollment_ids: Sequence[UUID]
    ) -> dict[UUID, tuple[int, datetime | None]]:
        """(started_count, last_watched_at) per enrollment, one query.

        A lesson counts as "started" only while it isn't completed —
        rewatching a finished lesson recreates a watch row, which must not
        double-count against the completed tally. Only published,
        non-deleted lessons count, mirroring completion_summary."""
        if not enrollment_ids:
            return {}
        completed_exists = (
            select(CourseLessonProgress.id)
            .where(
                CourseLessonProgress.enrollment_id
                == CourseLessonWatchProgress.enrollment_id,
                CourseLessonProgress.lesson_id
                == CourseLessonWatchProgress.lesson_id,
                CourseLessonProgress.deleted_at.is_(None),
            )
            .exists()
        )
        statement = (
            select(
                CourseLessonWatchProgress.enrollment_id,
                func.count(CourseLessonWatchProgress.id),
                func.max(CourseLessonWatchProgress.last_watched_at),
            )
            .join(
                CourseLesson,
                CourseLesson.id == CourseLessonWatchProgress.lesson_id,
            )
            .where(
                CourseLessonWatchProgress.enrollment_id.in_(enrollment_ids),
                CourseLessonWatchProgress.deleted_at.is_(None),
                CourseLessonWatchProgress.fraction > 0,
                CourseLesson.published.is_(True),
                CourseLesson.deleted_at.is_(None),
                ~completed_exists,
            )
            .group_by(CourseLessonWatchProgress.enrollment_id)
        )
        result = await self.session.execute(statement)
        return {row[0]: (row[1], row[2]) for row in result.all()}

    async def upsert_position(
        self,
        *,
        enrollment_id: UUID,
        lesson_id: UUID,
        fraction: float,
        now: datetime,
    ) -> None:
        """Atomically record the latest watch position for a lesson.

        A single INSERT … ON CONFLICT DO UPDATE keyed on the
        (enrollment_id, lesson_id) unique constraint: race-free under
        concurrent heartbeats, one round-trip on the hottest write path,
        and it resurrects (deleted_at = NULL) the row that
        mark_lesson_complete soft-deletes — without this, rewatching a
        completed lesson would violate the unique constraint.
        """
        statement = (
            pg_insert(CourseLessonWatchProgress)
            .values(
                enrollment_id=enrollment_id,
                lesson_id=lesson_id,
                fraction=fraction,
                last_watched_at=now,
            )
            .on_conflict_do_update(
                index_elements=[
                    CourseLessonWatchProgress.enrollment_id,
                    CourseLessonWatchProgress.lesson_id,
                ],
                set_={
                    "fraction": fraction,
                    "last_watched_at": now,
                    "modified_at": now,
                    "deleted_at": None,
                },
            )
        )
        await self.session.execute(statement)


class LessonCommentRepository(
    RepositorySoftDeletionIDMixin[LessonComment, UUID],
    RepositorySoftDeletionMixin[LessonComment],
    RepositoryBase[LessonComment],
):
    model = LessonComment

    def get_by_lesson_statement(self, lesson_id: UUID):
        return self.get_base_statement().where(
            LessonComment.lesson_id == lesson_id
        )

    def get_by_enrollment_and_lesson_statement(
        self, enrollment_id: UUID, lesson_id: UUID
    ):
        return self.get_base_statement().where(
            LessonComment.enrollment_id == enrollment_id,
            LessonComment.lesson_id == lesson_id,
        )

    async def clear_pins_for_lesson(self, lesson_id: UUID) -> None:
        """Unpin every comment on a lesson — called before pinning a new
        one so the lesson holds at most a single pin (YouTube semantics)."""
        statement = (
            update(LessonComment)
            .where(
                LessonComment.lesson_id == lesson_id,
                LessonComment.pinned_at.isnot(None),
            )
            .values(pinned_at=None)
        )
        await self.session.execute(statement)

    async def get_tombstone_parents(
        self, lesson_id: UUID, parent_ids: set[UUID]
    ) -> Sequence[LessonComment]:
        """Fetch soft-deleted parent comments scoped to a lesson — the
        caller wraps this in the kit's `merge_with_tombstones` so the
        reply chain stays renderable.
        """
        if not parent_ids:
            return []
        statement = self.get_base_statement(include_deleted=True).where(
            LessonComment.id.in_(parent_ids),
            LessonComment.lesson_id == lesson_id,
        )
        return await self.get_all(statement)


class LessonCommentLikeRepository(
    RepositoryBase[LessonCommentLike],
):
    model = LessonCommentLike

    async def get_like(
        self, comment_id: UUID, enrollment_id: UUID
    ) -> LessonCommentLike | None:
        statement = self.get_base_statement().where(
            LessonCommentLike.lesson_comment_id == comment_id,
            LessonCommentLike.enrollment_id == enrollment_id,
        )
        return await self.get_one_or_none(statement)

    async def count_for_comment(self, comment_id: UUID) -> int:
        statement = select(func.count(LessonCommentLike.id)).where(
            LessonCommentLike.lesson_comment_id == comment_id
        )
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def counts_for_comments(
        self, comment_ids: Sequence[UUID]
    ) -> dict[UUID, int]:
        """Like counts keyed by comment id (only comments with ≥1 like
        appear). Single grouped query for the whole listing."""
        if not comment_ids:
            return {}
        statement = (
            select(
                LessonCommentLike.lesson_comment_id,
                func.count(LessonCommentLike.id),
            )
            .where(LessonCommentLike.lesson_comment_id.in_(comment_ids))
            .group_by(LessonCommentLike.lesson_comment_id)
        )
        result = await self.session.execute(statement)
        return {row[0]: row[1] for row in result}

    async def liked_comment_ids(
        self, comment_ids: Sequence[UUID], enrollment_id: UUID
    ) -> set[UUID]:
        """Subset of `comment_ids` the given enrollment has liked."""
        if not comment_ids:
            return set()
        statement = select(LessonCommentLike.lesson_comment_id).where(
            LessonCommentLike.lesson_comment_id.in_(comment_ids),
            LessonCommentLike.enrollment_id == enrollment_id,
        )
        result = await self.session.execute(statement)
        return {row[0] for row in result}


class CourseNoteRepository(
    RepositorySoftDeletionIDMixin[CourseNote, UUID],
    RepositorySoftDeletionMixin[CourseNote],
    RepositoryBase[CourseNote],
):
    model = CourseNote

    def get_by_enrollment_and_lesson_statement(
        self, enrollment_id: UUID, lesson_id: UUID
    ):
        return self.get_base_statement().where(
            CourseNote.enrollment_id == enrollment_id,
            CourseNote.lesson_id == lesson_id,
        )

    def get_by_enrollment_statement(self, enrollment_id: UUID):
        return self.get_base_statement().where(
            CourseNote.enrollment_id == enrollment_id,
        )
