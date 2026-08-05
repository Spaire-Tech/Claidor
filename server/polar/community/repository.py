"""Database queries for the Community module.

Per server/CLAUDE.md, all SQL lives in this file. The service composes
these repository methods; endpoints never touch SQL directly.

Six repositories, one per table from migration b8f3c9a2e571:
  CommunitySettingsRepository
  CommunityTagRepository
  CommunityPostRepository
  CommunityPostMediaRepository
  CommunityCommentRepository
  CommunityReactionRepository
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import (
    Select,
    and_,
    case,
    delete,
    func,
    literal,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from polar.kit.utils import utc_now
from polar.models.community_activity import CommunityActivity
from polar.models.community_comment import CommunityComment
from polar.models.community_event import CommunityEvent
from polar.models.community_post import CommunityPost
from polar.models.community_post_media import CommunityPostMedia
from polar.models.community_reaction import CommunityReaction
from polar.models.community_settings import CommunitySettings
from polar.models.community_tag import CommunityTag
from polar.models.course_enrollment import CourseEnrollment
from polar.models.customer import Customer
from polar.models.user import User as UserModel

# ----------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------


class CommunitySettingsRepository(
    RepositorySoftDeletionIDMixin[CommunitySettings, UUID],
    RepositorySoftDeletionMixin[CommunitySettings],
    RepositoryBase[CommunitySettings],
):
    model = CommunitySettings

    async def get_by_course_id(self, course_id: UUID) -> CommunitySettings | None:
        statement = self.get_base_statement().where(
            CommunitySettings.course_id == course_id
        )
        return await self.get_one_or_none(statement)

    async def delete_community_for_course(self, course_id: UUID) -> None:
        """Hard-delete every row that makes up a course's community: posts
        (+ media and comments via FK cascade), events (+ rsvps and
        announcements), activities (+ submissions), tags, and the settings
        row itself.

        Reactions are polymorphic (`target_type`/`target_id`, no foreign
        key) so they're removed explicitly first — before their posts and
        comments disappear — otherwise they'd be orphaned. Everything else
        is removed by the parent rows' `ondelete="cascade"`. This is a hard
        delete: it also clears any already soft-deleted rows.
        """
        session = self.session
        post_ids = select(CommunityPost.id).where(CommunityPost.course_id == course_id)
        comment_ids = select(CommunityComment.id).where(
            CommunityComment.post_id.in_(post_ids)
        )
        await session.execute(
            delete(CommunityReaction).where(
                CommunityReaction.target_type == "comment",
                CommunityReaction.target_id.in_(comment_ids),
            )
        )
        await session.execute(
            delete(CommunityReaction).where(
                CommunityReaction.target_type == "post",
                CommunityReaction.target_id.in_(post_ids),
            )
        )
        await session.execute(
            delete(CommunityPost).where(CommunityPost.course_id == course_id)
        )
        await session.execute(
            delete(CommunityEvent).where(CommunityEvent.course_id == course_id)
        )
        await session.execute(
            delete(CommunityActivity).where(CommunityActivity.course_id == course_id)
        )
        await session.execute(
            delete(CommunityTag).where(CommunityTag.course_id == course_id)
        )
        await session.execute(
            delete(CommunitySettings).where(CommunitySettings.course_id == course_id)
        )
        await session.flush()

    async def list_for_auto_blurb(self) -> Sequence[CommunitySettings]:
        """Communities where the cron should consider writing an
        auto-generated presence blurb: enabled, soft-delete-clear, and
        the creator hasn't set a manual override (presence_blurb is
        NULL). Manual overrides always win — we never overwrite a
        non-null blurb."""
        statement = self.get_base_statement().where(
            CommunitySettings.enabled.is_(True),
            CommunitySettings.presence_blurb.is_(None),
        )
        return await self.get_all(statement)

    async def list_customer_communities(
        self, customer_id: UUID
    ) -> Sequence[tuple[UUID, str | None, str | None, str | None, bool]]:
        """Powers the customer-portal picker. Returns one row per
        non-deleted enrollment as
        `(course_id, course_title, thumbnail_url, thumbnail_object_position,
        community_enabled)` — LEFT JOIN on community_settings so courses
        that never had a settings row come back with
        `community_enabled=False` rather than being filtered out."""
        from polar.models.course import Course
        from polar.models.course_enrollment import CourseEnrollment

        statement = (
            select(
                Course.id,
                Course.title,
                Course.thumbnail_url,
                Course.thumbnail_object_position,
                func.coalesce(CommunitySettings.enabled, False).label("enabled"),
            )
            .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
            .join(
                CommunitySettings,
                and_(
                    CommunitySettings.course_id == Course.id,
                    CommunitySettings.deleted_at.is_(None),
                ),
                isouter=True,
            )
            .where(
                CourseEnrollment.customer_id == customer_id,
                CourseEnrollment.deleted_at.is_(None),
                Course.deleted_at.is_(None),
            )
            .order_by(CourseEnrollment.enrolled_at.desc())
        )
        result = await self.session.execute(statement)
        return [
            (
                row.id,
                row.title,
                row.thumbnail_url,
                row.thumbnail_object_position,
                bool(row.enabled),
            )
            for row in result
        ]


# ----------------------------------------------------------------------
# Tags
# ----------------------------------------------------------------------


class CommunityTagRepository(
    RepositorySoftDeletionIDMixin[CommunityTag, UUID],
    RepositorySoftDeletionMixin[CommunityTag],
    RepositoryBase[CommunityTag],
):
    model = CommunityTag

    def get_by_course_statement(self, course_id: UUID) -> Select[tuple[CommunityTag]]:
        return (
            self.get_base_statement()
            .where(CommunityTag.course_id == course_id)
            .order_by(CommunityTag.position.asc(), CommunityTag.created_at.asc())
        )

    async def get_by_course(self, course_id: UUID) -> Sequence[CommunityTag]:
        return await self.get_all(self.get_by_course_statement(course_id))

    async def get_max_position(self, course_id: UUID) -> int:
        """Largest current position among this course's tags. Used so a
        newly-created tag drops in at the end of the list rather than
        colliding with an existing position."""
        statement = select(func.coalesce(func.max(CommunityTag.position), -1)).where(
            CommunityTag.course_id == course_id,
            CommunityTag.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def reorder(self, course_id: UUID, ordered_ids: list[UUID]) -> None:
        """Set each tag's `position` to its index in `ordered_ids`. Tags
        not in the list keep their existing position. Server-side
        transactional so the partial-unique index never sees a
        duplicate-position state."""
        if not ordered_ids:
            return
        for index, tag_id in enumerate(ordered_ids):
            statement = (
                CommunityTag.__table__.update()
                .where(
                    CommunityTag.id == tag_id,
                    CommunityTag.course_id == course_id,
                    CommunityTag.deleted_at.is_(None),
                )
                .values(position=index)
            )
            await self.session.execute(statement)

    async def clear_tag_from_posts(self, tag_id: UUID) -> None:
        """Null out community_posts.tag_id where it points at this tag.

        Soft-deleting a tag doesn't trigger the migration's ondelete
        SET NULL (that fires on hard delete only). Without this, posts
        keep a tag_id pointing at a deleted row and the feed renders a
        ghost-pill that doesn't match any filter chip."""
        statement = (
            CommunityPost.__table__.update()
            .where(CommunityPost.tag_id == tag_id)
            .values(tag_id=None)
        )
        await self.session.execute(statement)

    async def get_by_slug(self, course_id: UUID, slug: str) -> CommunityTag | None:
        statement = self.get_base_statement().where(
            CommunityTag.course_id == course_id,
            CommunityTag.slug == slug,
        )
        return await self.get_one_or_none(statement)


# ----------------------------------------------------------------------
# Posts
# ----------------------------------------------------------------------


# Cursor encoding helpers — opaque to callers; the repository owns both
# sides so they can change shape without leaking through the API.
_CURSOR_SEP = "__"


def encode_cursor(sort_key: datetime, post_id: UUID) -> str:
    """Encode (sort_key, post_id) for the `?cursor=` query param. The
    sort_key is whichever timestamp the chosen sort uses — for `recent`
    that's coalesce(pinned_at, published_at)."""
    return f"{sort_key.astimezone(UTC).isoformat()}{_CURSOR_SEP}{post_id}"


def decode_cursor(value: str) -> tuple[datetime, UUID] | None:
    if not value:
        return None
    try:
        ts_str, id_str = value.split(_CURSOR_SEP, 1)
        return datetime.fromisoformat(ts_str), UUID(id_str)
    except (ValueError, AttributeError):
        return None


class CommunityPostRepository(
    RepositorySoftDeletionIDMixin[CommunityPost, UUID],
    RepositorySoftDeletionMixin[CommunityPost],
    RepositoryBase[CommunityPost],
):
    model = CommunityPost

    # ---- Core statements ----

    def get_visible_in_course_statement(
        self, course_id: UUID
    ) -> Select[tuple[CommunityPost]]:
        """Posts a viewer is allowed to see: published (published_at <= now)
        AND not deleted. Used by the customer-side feed and by the
        creator's moderation list (creator-side can extend with
        include_deleted to see hidden rows)."""
        now = utc_now()
        return self.get_base_statement().where(
            CommunityPost.course_id == course_id,
            or_(
                CommunityPost.published_at.is_(None).is_(False),
                # Drafts (published_at IS NULL) are excluded; pinned
                # rows always have published_at set.
            ),
            CommunityPost.published_at <= now,
        )

    def get_creator_listing_statement(
        self, course_id: UUID
    ) -> Select[tuple[CommunityPost]]:
        """Creator-side listing — includes drafts (published_at IS NULL)
        so the editor moderation surface can show scheduled and
        unpublished posts."""
        return self.get_base_statement().where(CommunityPost.course_id == course_id)

    async def milestone_exists_for_enrollment_lesson(
        self,
        *,
        enrollment_id: UUID,
        lesson_id: UUID,
        tag_id: UUID,
    ) -> bool:
        """Idempotency check for the module-completion listener. Dramatiq
        retries can re-fire the same event, and a student can also
        complete + re-complete a lesson (mark-complete is idempotent at
        the progress table but the event still emits). Returns True if a
        milestone post already exists for this (enrollment, lesson, tag)
        triple — caller skips the insert when so."""
        statement = (
            select(CommunityPost.id)
            .where(
                CommunityPost.author_enrollment_id == enrollment_id,
                CommunityPost.lesson_id == lesson_id,
                CommunityPost.tag_id == tag_id,
                CommunityPost.deleted_at.is_(None),
            )
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none() is not None

    async def list_for_moderation(
        self,
        course_id: UUID,
        *,
        cursor: tuple[datetime, UUID] | None = None,
        limit: int = 30,
    ) -> tuple[Sequence[CommunityPost], bool]:
        """Creator-side feed for the editor's moderation list. Sorted by
        created_at desc — newest first, draft or published, but not
        soft-deleted (those are gone from the editor too)."""
        statement = self.get_creator_listing_statement(course_id).order_by(
            CommunityPost.created_at.desc(),
            CommunityPost.id.desc(),
        )
        if cursor is not None:
            cursor_ts, cursor_id = cursor
            statement = statement.where(
                or_(
                    CommunityPost.created_at < cursor_ts,
                    and_(
                        CommunityPost.created_at == cursor_ts,
                        CommunityPost.id < cursor_id,
                    ),
                )
            )
        statement = statement.limit(limit + 1)
        rows = list(await self.get_all(statement))
        has_next = len(rows) > limit
        return rows[:limit], has_next

    # ---- Feed query (cursor pagination) ----

    async def list_feed(
        self,
        course_id: UUID,
        *,
        sort: Literal["recent", "top_week", "unanswered"] = "recent",
        module_lesson_ids: set[UUID] | None = None,
        lesson_id: UUID | None = None,
        tag_id: UUID | None = None,
        cursor: tuple[datetime, UUID] | None = None,
        limit: int = 20,
    ) -> tuple[Sequence[CommunityPost], bool]:
        """Return (rows, has_next_page).

        `module_lesson_ids` filters to posts whose lesson_id belongs to
        the requested module — the service resolves the module → lesson
        set once and passes it in, so the repository stays free of
        cross-table joins.
        """
        statement = self.get_visible_in_course_statement(course_id)

        if lesson_id is not None:
            statement = statement.where(CommunityPost.lesson_id == lesson_id)
        elif module_lesson_ids is not None:
            if not module_lesson_ids:
                # Empty filter == empty result, not "no filter applied".
                return [], False
            statement = statement.where(CommunityPost.lesson_id.in_(module_lesson_ids))
        else:
            # No lesson/module filter — hide lesson-scoped activity-pin
            # posts from the global "All" feed. They surface in the
            # lesson sub-feed instead, so showing them globally would
            # double-pin every published activity at the top of Home.
            #
            # Module-scoped activity pins (lesson_id IS NULL) have no
            # sub-feed to live in, so they stay visible in Home.
            statement = statement.where(
                or_(
                    CommunityPost.pin_type.is_(None),
                    CommunityPost.pin_type != "activity",
                    CommunityPost.lesson_id.is_(None),
                )
            )

        if tag_id is not None:
            statement = statement.where(CommunityPost.tag_id == tag_id)

        if sort == "recent":
            # coalesce(pinned_at, published_at) DESC, id DESC. Pinned
            # posts always float above their natural slot.
            sort_key = func.coalesce(
                CommunityPost.pinned_at, CommunityPost.published_at
            )
            statement = statement.order_by(sort_key.desc(), CommunityPost.id.desc())
            if cursor is not None:
                cursor_ts, cursor_id = cursor
                statement = statement.where(
                    or_(
                        sort_key < cursor_ts,
                        and_(
                            sort_key == cursor_ts,
                            CommunityPost.id < cursor_id,
                        ),
                    )
                )

        elif sort == "top_week":
            # Reactions in the last 7 days, ordered by count desc.
            since = utc_now().replace(microsecond=0)
            week_ago = since.fromtimestamp(since.timestamp() - 7 * 24 * 60 * 60)
            statement = statement.where(
                CommunityPost.published_at >= week_ago
            ).order_by(
                CommunityPost.reaction_count.desc(),
                CommunityPost.id.desc(),
            )
            # Cursor for top_week encodes (reaction_count, id) — to keep
            # the encode/decode interface simple we re-use the
            # (datetime, uuid) shape and treat reaction_count as seconds
            # since epoch in encode_cursor. Phase 1 ships without a
            # cursor for top_week (one page is enough); revisit when the
            # client wires Load More on this sort.

        elif sort == "unanswered":
            # Questions with zero replies. tag.slug resolution happens
            # in the service (we accept tag_id from the caller); the
            # repository just enforces the zero-comment rule here.
            statement = statement.where(CommunityPost.comment_count == 0)
            statement = statement.order_by(
                CommunityPost.published_at.desc(),
                CommunityPost.id.desc(),
            )

        # Fetch limit+1 so we can detect whether another page exists.
        statement = statement.limit(limit + 1)
        rows = list(await self.get_all(statement))
        has_next_page = len(rows) > limit
        return rows[:limit], has_next_page

    # ---- Counters (materialized) ----

    async def increment_comment_count(self, post_id: UUID, by: int = 1) -> None:
        """Bump comment_count atomically. The service calls this in the
        same UoW as the comment insert/soft-delete so the counter never
        drifts under concurrent writes."""
        statement = (
            CommunityPost.__table__.update()
            .where(CommunityPost.id == post_id)
            .values(comment_count=CommunityPost.comment_count + by)
        )
        await self.session.execute(statement)

    async def set_reaction_count(self, post_id: UUID, count: int) -> None:
        """Set the absolute count — the toggle path computes the new
        value as part of the same query that runs the toggle."""
        statement = (
            CommunityPost.__table__.update()
            .where(CommunityPost.id == post_id)
            .values(reaction_count=count)
        )
        await self.session.execute(statement)

    # ---- Pinning ----

    async def clear_existing_prompt_pin(self, course_id: UUID) -> None:
        """A course has at most one prompt_of_week at a time — clearing
        any existing one is the first half of the pin workflow."""
        statement = (
            CommunityPost.__table__.update()
            .where(
                CommunityPost.course_id == course_id,
                CommunityPost.pin_type == "prompt_of_week",
            )
            .values(pinned_at=None, pin_type=None, pin_expires_at=None)
        )
        await self.session.execute(statement)

    # ---- Author resolution (cross-table reads) ----
    #
    # The joins live on the post repository rather than the service
    # because server/CLAUDE.md requires all SQL to be repository-layer.
    # Returning raw tuples keeps the repository Pydantic-free; the
    # service composes the response schemas.

    async def list_student_author_rows(
        self, enrollment_ids: set[UUID]
    ) -> Sequence[tuple[UUID, str | None, str, str | None, str | None, UUID]]:
        """Return (enrollment_id, customer_name, customer_email,
        customer_avatar_url, org_avatar_url, org_id) for each requested
        enrollment. Customer has no native avatar column; we join the
        course's organization so the service can fall back to the
        org's logo (the same `img.logo.dev` URL surfaced everywhere
        else in the dashboard) when the customer is a preview
        customer for the admin."""
        if not enrollment_ids:
            return []
        from polar.models.course import Course
        from polar.models.organization import Organization

        statement = (
            select(
                CourseEnrollment.id,
                Customer.name,
                Customer.email,
                Customer.avatar_url.label("customer_avatar"),
                # Organization.avatar_url is a @property, not a column —
                # we resolve it in Python by hydrating the row instead
                # of selecting the underlying _avatar_url string and
                # losing the logo.dev fallback. Selecting the org id
                # lets us look it up after.
                Organization.id.label("org_id"),
            )
            .join(Customer, Customer.id == CourseEnrollment.customer_id)
            .join(Course, Course.id == CourseEnrollment.course_id)
            .join(Organization, Organization.id == Course.organization_id)
            .where(CourseEnrollment.id.in_(enrollment_ids))
        )
        result = await self.session.execute(statement)
        rows = list(result)
        # Bulk-hydrate orgs so we can call the avatar_url property
        # (which mints the logo.dev URL when _avatar_url is unset).
        org_ids = {row.org_id for row in rows}
        orgs = (
            await self.session.execute(
                select(Organization).where(Organization.id.in_(org_ids))
            )
        ).scalars()
        org_avatars: dict[UUID, str | None] = {org.id: org.avatar_url for org in orgs}
        return [
            (
                row.id,
                row.name,
                row.email,
                row.customer_avatar,
                org_avatars.get(row.org_id),
                row.org_id,
            )
            for row in rows
        ]

    async def list_instructor_author_rows(
        self, user_ids: set[UUID]
    ) -> Sequence[tuple[UUID, str, str | None]]:
        """Return (user_id, user_email, user_avatar_url) for each
        requested user. Users have no explicit display name column —
        the service falls back to the email local-part."""
        if not user_ids:
            return []
        statement = select(UserModel.id, UserModel.email, UserModel.avatar_url).where(
            UserModel.id.in_(user_ids)
        )
        result = await self.session.execute(statement)
        return [(row.id, row.email, row.avatar_url) for row in result]

    async def list_org_member_users(
        self, organization_id: UUID
    ) -> Sequence[tuple[UUID, str, str | None]]:
        """(user_id, email, avatar_url) for the org's members. Used to
        render an org member's portal-side posts (written from their own
        customer account) under their instructor identity — the Host —
        instead of as a student."""
        from polar.models import UserOrganization

        statement = (
            select(UserModel.id, UserModel.email, UserModel.avatar_url)
            .join(UserOrganization, UserOrganization.user_id == UserModel.id)
            .where(
                UserOrganization.organization_id == organization_id,
                UserOrganization.deleted_at.is_(None),
                UserModel.email.is_not(None),
            )
        )
        result = await self.session.execute(statement)
        return [(row.id, row.email, row.avatar_url) for row in result]

    async def list_course_members(
        self, course_id: UUID
    ) -> Sequence[tuple[UUID, str | None, str, str | None, datetime]]:
        """Powers the Members tab. Returns (enrollment_id, customer_name,
        customer_email, customer_avatar_url, enrolled_at) for every active
        (non-soft-deleted) enrollment in the course, newest enrollment
        first."""
        statement = (
            select(
                CourseEnrollment.id,
                Customer.name,
                Customer.email,
                Customer.avatar_url,
                CourseEnrollment.enrolled_at,
            )
            .join(Customer, Customer.id == CourseEnrollment.customer_id)
            .where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.deleted_at.is_(None),
                # Legacy preview-sandbox accounts must never show up as a
                # second member next to the admin's real account.
                Customer.email.notilike("%@course-preview.invalid"),
            )
            .order_by(CourseEnrollment.enrolled_at.desc())
        )
        result = await self.session.execute(statement)
        return [
            (row.id, row.name, row.email, row.avatar_url, row.enrolled_at)
            for row in result
        ]


# ----------------------------------------------------------------------
# Post media
# ----------------------------------------------------------------------


class CommunityPostMediaRepository(
    RepositorySoftDeletionIDMixin[CommunityPostMedia, UUID],
    RepositorySoftDeletionMixin[CommunityPostMedia],
    RepositoryBase[CommunityPostMedia],
):
    model = CommunityPostMedia

    async def list_for_posts(self, post_ids: set[UUID]) -> Sequence[CommunityPostMedia]:
        """Bulk-load media for a feed page so we don't N+1 per post."""
        if not post_ids:
            return []
        statement = (
            self.get_base_statement()
            .where(CommunityPostMedia.post_id.in_(post_ids))
            .order_by(
                CommunityPostMedia.post_id,
                CommunityPostMedia.position.asc(),
            )
        )
        return await self.get_all(statement)

    async def get_by_mux_upload_id(
        self, mux_upload_id: str
    ) -> CommunityPostMedia | None:
        statement = self.get_base_statement().where(
            CommunityPostMedia.mux_upload_id == mux_upload_id
        )
        return await self.get_one_or_none(statement)


# ----------------------------------------------------------------------
# Comments
# ----------------------------------------------------------------------


class CommunityCommentRepository(
    RepositorySoftDeletionIDMixin[CommunityComment, UUID],
    RepositorySoftDeletionMixin[CommunityComment],
    RepositoryBase[CommunityComment],
):
    model = CommunityComment

    def get_by_post_statement(self, post_id: UUID) -> Select[tuple[CommunityComment]]:
        return (
            self.get_base_statement()
            .where(CommunityComment.post_id == post_id)
            .order_by(CommunityComment.created_at.asc())
        )

    async def get_by_post(self, post_id: UUID) -> Sequence[CommunityComment]:
        return await self.get_all(self.get_by_post_statement(post_id))

    async def get_tombstone_parents(
        self, post_id: UUID, parent_ids: set[UUID]
    ) -> Sequence[CommunityComment]:
        """Mirrors LessonCommentRepository.get_tombstone_parents — fetches
        soft-deleted parents so polar.kit.comments.merge_with_tombstones
        can keep the reply chain renderable."""
        if not parent_ids:
            return []
        statement = self.get_base_statement(include_deleted=True).where(
            CommunityComment.id.in_(parent_ids),
            CommunityComment.post_id == post_id,
        )
        return await self.get_all(statement)

    async def count_creator_replies_in_course(
        self,
        *,
        course_id: UUID,
        organization_id: UUID,
        since: datetime,
    ) -> int:
        """Count non-deleted comments on this course's posts that were
        authored by a user belonging to the course's organization,
        created on/after `since`. Powers the auto presence-blurb cron
        ("Mira replied 4 times this week"). Student-authored comments
        have `author_user_id IS NULL` so naturally excluded."""
        from polar.models import UserOrganization

        statement = (
            select(func.count(CommunityComment.id))
            .join(
                CommunityPost,
                CommunityPost.id == CommunityComment.post_id,
            )
            .where(
                CommunityPost.course_id == course_id,
                CommunityComment.deleted_at.is_(None),
                CommunityComment.created_at >= since,
                CommunityComment.author_user_id.in_(
                    select(UserOrganization.user_id).where(
                        UserOrganization.organization_id == organization_id,
                        UserOrganization.deleted_at.is_(None),
                    )
                ),
            )
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())


# ----------------------------------------------------------------------
# Reactions
# ----------------------------------------------------------------------


class CommunityReactionRepository(
    RepositoryBase[CommunityReaction],
):
    """Reactions aren't soft-deleted — toggling off is a hard DELETE so
    the unique index stays accurate and counters stay correct.

    One row per (target, actor) regardless of emoji: the picker is a
    LinkedIn-style switch, not a per-emoji checkbox. Switching from
    heart to clap updates the existing row's emoji in place rather
    than stacking a second row on top."""

    model = CommunityReaction

    async def toggle(
        self,
        *,
        target_type: Literal["post", "comment"],
        target_id: UUID,
        actor_enrollment_id: UUID | None,
        actor_user_id: UUID | None,
        emoji: str,
    ) -> bool:
        """Apply the user's intent on this target and return whether
        they end up reacting after the call.

          - no existing row, clicked X → INSERT X, return True
          - existing row is X, clicked X → DELETE, return False (toggle off)
          - existing row is X, clicked Y → UPDATE to Y, return True (switch)

        Per the partial unique index ix_community_reactions_unique_*
        (one row per target+actor) the existence check below resolves
        to at most one row."""
        actor_clause = (
            CommunityReaction.actor_enrollment_id == actor_enrollment_id
            if actor_enrollment_id is not None
            else CommunityReaction.actor_user_id == actor_user_id
        )

        existing_stmt = select(CommunityReaction.id, CommunityReaction.emoji).where(
            CommunityReaction.target_type == target_type,
            CommunityReaction.target_id == target_id,
            actor_clause,
        )
        existing = (await self.session.execute(existing_stmt)).one_or_none()

        if existing is not None:
            existing_id, existing_emoji = existing
            if existing_emoji == emoji:
                # Same emoji clicked again — toggle off.
                await self.session.execute(
                    delete(CommunityReaction).where(CommunityReaction.id == existing_id)
                )
                return False
            # Switch: update the emoji on the existing row in place so
            # we don't transiently violate the per-(target, actor)
            # unique index.
            await self.session.execute(
                CommunityReaction.__table__.update()
                .where(CommunityReaction.id == existing_id)
                .values(emoji=emoji)
            )
            return True

        # No existing row — insert. ON CONFLICT DO NOTHING swallows
        # the race where a concurrent request inserted first; in that
        # rare case we just trust the other write and return active.
        ins = (
            pg_insert(CommunityReaction)
            .values(
                target_type=target_type,
                target_id=target_id,
                actor_enrollment_id=actor_enrollment_id,
                actor_user_id=actor_user_id,
                emoji=emoji,
            )
            .on_conflict_do_nothing()
        )
        await self.session.execute(ins)
        return True

    async def count_by_target(
        self, *, target_type: Literal["post", "comment"], target_id: UUID
    ) -> int:
        statement = select(func.count(CommunityReaction.id)).where(
            CommunityReaction.target_type == target_type,
            CommunityReaction.target_id == target_id,
        )
        return (await self.session.execute(statement)).scalar_one()

    async def summary_for_targets(
        self,
        *,
        target_type: Literal["post", "comment"],
        target_ids: set[UUID],
        viewer_enrollment_id: UUID | None,
        viewer_user_id: UUID | None,
    ) -> dict[UUID, dict[str, dict[str, int | bool]]]:
        """Return per-target, per-emoji `{count, mine}`.

        Shape: { target_id: { emoji: { count: int, mine: bool } } }

        One query: SELECT target_id, emoji, COUNT(*),
                          BOOL_OR(actor matches viewer) AS mine
                   GROUP BY (target_id, emoji)
        """
        if not target_ids:
            return {}

        viewer_clauses = []
        if viewer_enrollment_id is not None:
            viewer_clauses.append(
                CommunityReaction.actor_enrollment_id == viewer_enrollment_id
            )
        if viewer_user_id is not None:
            viewer_clauses.append(CommunityReaction.actor_user_id == viewer_user_id)
        if viewer_clauses:
            mine_expr = case((or_(*viewer_clauses), True), else_=False)
        else:
            # Anonymous viewers (shouldn't reach this code path in
            # practice, but stay defensive — `mine` is just always
            # False for them).
            mine_expr = literal(False)
        statement = (
            select(
                CommunityReaction.target_id,
                CommunityReaction.emoji,
                func.count(CommunityReaction.id).label("count"),
                func.bool_or(mine_expr).label("mine"),
            )
            .where(
                CommunityReaction.target_type == target_type,
                CommunityReaction.target_id.in_(target_ids),
            )
            .group_by(CommunityReaction.target_id, CommunityReaction.emoji)
        )
        result = await self.session.execute(statement)
        out: dict[UUID, dict[str, dict[str, int | bool]]] = {}
        for row in result:
            out.setdefault(row.target_id, {})[row.emoji] = {
                "count": int(row.count),
                "mine": bool(row.mine),
            }
        return out
