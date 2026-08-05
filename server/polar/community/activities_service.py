"""Community activities service.

Creates and lists activities, accepts submissions, optionally pins the
activity onto the course's Home feed as a synthetic community_post."""

from __future__ import annotations

from uuid import UUID

from polar.kit.utils import utc_now
from polar.models.community_activity import CommunityActivity
from polar.models.community_activity_submission import CommunityActivitySubmission
from polar.models.community_activity_submission_comment import (
    CommunityActivitySubmissionComment,
)
from polar.models.community_post import CommunityPost
from polar.models.community_tag import CommunityTag
from polar.postgres import AsyncSession
from polar.worker import enqueue_job

from .activities_repository import (
    CommunityActivityRepository,
    CommunityActivitySubmissionCommentRepository,
    CommunityActivitySubmissionRepository,
)
from .activities_schemas import (
    CommunityActivityCreate,
    CommunityActivitySubmissionCommentCreate,
    CommunityActivitySubmissionCreate,
    CommunityActivityUpdate,
)
from .repository import CommunityTagRepository


class ActivityNotFound(Exception):
    pass


class ActivityHostMismatch(Exception):
    pass


class ActivityClosed(Exception):
    pass


class ActivityChannelInvalid(Exception):
    pass


class ActivitySubmissionInvalid(Exception):
    """Raised when the submission payload doesn't match the activity's
    submission_type (e.g. video submission with no mux_upload_id)."""


class ActivitySubmissionNotFound(Exception):
    pass


class CommunityActivityService:
    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def list_for_course(
        self, session: AsyncSession, *, course_id: UUID
    ) -> list[CommunityActivity]:
        repo = CommunityActivityRepository.from_session(session)
        return list(await repo.list_for_course(course_id))

    async def get(
        self, session: AsyncSession, *, activity_id: UUID, course_id: UUID
    ) -> CommunityActivity:
        repo = CommunityActivityRepository.from_session(session)
        activity = await repo.get_by_id_for_course(activity_id, course_id)
        if activity is None:
            raise ActivityNotFound()
        return activity

    # ------------------------------------------------------------------
    # Writes — host
    # ------------------------------------------------------------------

    async def create(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        host_user_id: UUID,
        payload: CommunityActivityCreate,
    ) -> CommunityActivity:
        # Channel must point at exactly one of module_id / lesson_id,
        # matching channel_kind.
        if payload.channel_kind == "module":
            if not payload.module_id or payload.lesson_id:
                raise ActivityChannelInvalid()
        else:
            if not payload.lesson_id or payload.module_id:
                raise ActivityChannelInvalid()

        activity = CommunityActivity(
            course_id=course_id,
            host_user_id=host_user_id,
            channel_kind=payload.channel_kind,
            module_id=payload.module_id,
            lesson_id=payload.lesson_id,
            title=payload.title.strip(),
            description=(payload.description or None),
            cover_url=(payload.cover_url or None),
            cover_object_position=(payload.cover_object_position or None),
            submission_type=payload.submission_type,
            status="open",
            pin_to_feed=payload.pin_to_feed,
            notify_on_publish=payload.notify_on_publish,
            submission_count=0,
        )
        repo = CommunityActivityRepository.from_session(session)
        await repo.create(activity, flush=True)

        if payload.pin_to_feed:
            await self._pin_activity(
                session, activity=activity, host_user_id=host_user_id
            )

        if payload.notify_on_publish:
            enqueue_job("community.activity.published", activity_id=activity.id)

        return activity

    async def update(
        self,
        session: AsyncSession,
        *,
        activity_id: UUID,
        course_id: UUID,
        host_user_id: UUID,
        payload: CommunityActivityUpdate,
    ) -> CommunityActivity:
        activity = await self.get(
            session, activity_id=activity_id, course_id=course_id
        )
        if activity.host_user_id != host_user_id:
            raise ActivityHostMismatch()

        data = payload.model_dump(exclude_unset=True)

        # Handle pin toggle + status change side effects before generic
        # column write.
        if "pin_to_feed" in data:
            want_pin = bool(data["pin_to_feed"])
            if want_pin and activity.pinned_post_id is None:
                await self._pin_activity(
                    session, activity=activity, host_user_id=host_user_id
                )
            elif not want_pin and activity.pinned_post_id is not None:
                await self._unpin_activity(session, activity=activity)

        if data.get("status") == "closed" and activity.pinned_post_id is not None:
            # Closing auto-unpins — keeping a closed activity at the top
            # of the feed is just visual noise.
            await self._unpin_activity(session, activity=activity)
            data["pin_to_feed"] = False

        # Capture the prior cover so we can clean up S3 if it changed.
        prev_cover = activity.cover_url
        for k, v in data.items():
            setattr(activity, k, v)

        await session.flush()

        if (
            "cover_url" in data
            and prev_cover
            and prev_cover != activity.cover_url
        ):
            enqueue_job("community.cover.cleanup", cover_url=prev_cover)

        return activity

    async def delete(
        self,
        session: AsyncSession,
        *,
        activity_id: UUID,
        course_id: UUID,
        host_user_id: UUID,
    ) -> None:
        activity = await self.get(
            session, activity_id=activity_id, course_id=course_id
        )
        if activity.host_user_id != host_user_id:
            raise ActivityHostMismatch()
        if activity.pinned_post_id is not None:
            await self._unpin_activity(session, activity=activity)
        repo = CommunityActivityRepository.from_session(session)
        await repo.soft_delete(activity)
        if activity.cover_url:
            enqueue_job("community.cover.cleanup", cover_url=activity.cover_url)

    # ------------------------------------------------------------------
    # Submissions (customer)
    # ------------------------------------------------------------------

    async def submit(
        self,
        session: AsyncSession,
        *,
        activity_id: UUID,
        course_id: UUID,
        customer_id: UUID,
        payload: CommunityActivitySubmissionCreate,
    ) -> CommunityActivitySubmission:
        activity = await self.get(
            session, activity_id=activity_id, course_id=course_id
        )
        if activity.status == "closed":
            raise ActivityClosed()

        # Type-specific payload validation. We accept the host's chosen
        # submission_type as the authoritative one; the request's
        # submission_type must agree.
        st = payload.submission_type or activity.submission_type
        if st != activity.submission_type:
            raise ActivitySubmissionInvalid()
        if st == "photo" and not payload.file_id:
            raise ActivitySubmissionInvalid()
        if st == "video" and not (payload.mux_upload_id or payload.file_id):
            raise ActivitySubmissionInvalid()
        if st == "link" and not payload.link_url:
            raise ActivitySubmissionInvalid()
        if st == "text" and not (payload.body and payload.body.strip()):
            raise ActivitySubmissionInvalid()

        # Video submissions start in 'waiting' so the UI can show an
        # "encoding…" state until the Mux webhook flips it to 'ready'
        # (or 'errored'). Non-video types leave mux_status NULL.
        initial_mux_status: str | None = None
        if st == "video" and payload.mux_upload_id:
            initial_mux_status = "waiting"

        submission = CommunityActivitySubmission(
            activity_id=activity_id,
            customer_id=customer_id,
            submission_type=st,
            body=(payload.body.strip() if payload.body else None),
            file_id=payload.file_id,
            mux_upload_id=payload.mux_upload_id,
            mux_status=initial_mux_status,
            link_url=payload.link_url,
            image_object_position=payload.image_object_position,
            visibility=payload.visibility,
        )
        sub_repo = CommunityActivitySubmissionRepository.from_session(session)
        await sub_repo.create(submission, flush=True)

        # Update denorm count.
        new_count = await sub_repo.count_for_activity(activity_id)
        activity.submission_count = new_count
        session.add(activity)
        await session.flush()

        # Notify the host that a new submission landed.
        enqueue_job(
            "community.activity.submission_received",
            activity_id=activity.id,
            submission_id=submission.id,
        )

        return submission

    # ------------------------------------------------------------------
    # Pin helpers — synthetic community_posts row
    # ------------------------------------------------------------------

    async def _pin_activity(
        self,
        session: AsyncSession,
        *,
        activity: CommunityActivity,
        host_user_id: UUID,
    ) -> None:
        """Create a community_posts row with pin_type='activity', tagged
        with the course's auto-managed 'Activity' tag, and (when the
        activity is scoped to a lesson) the lesson_id chip set. The
        body is the activity's description verbatim — the tag pill +
        the inline activity-CTA in the feed convey the rest."""
        tag = await self._get_or_create_activity_tag(
            session, course_id=activity.course_id
        )
        body = (activity.description or activity.title).strip()
        post = CommunityPost(
            course_id=activity.course_id,
            author_user_id=host_user_id,
            type="text",
            title=activity.title,
            body=body,
            body_format="markdown",
            published_at=utc_now(),
            pinned_at=utc_now(),
            pin_type="activity",
            tag_id=tag.id,
            lesson_id=(
                activity.lesson_id
                if activity.channel_kind == "lesson"
                else None
            ),
        )
        session.add(post)
        await session.flush()
        activity.pinned_post_id = post.id
        session.add(activity)
        await session.flush()

    async def _get_or_create_activity_tag(
        self, session: AsyncSession, *, course_id: UUID
    ) -> CommunityTag:
        """Each course gets a single auto-managed 'Activity' tag the
        host can't edit (slug='activity'). We attach it to every pinned
        activity post so the tag-pill renders with the design's inverted
        Activity styling. If the host has deleted it (soft delete), we
        re-create it; tags are cheap."""
        repo = CommunityTagRepository.from_session(session)
        existing = await repo.get_by_slug(course_id, "activity")
        if existing is not None and existing.deleted_at is None:
            return existing
        # Slot it at position 0 so it sorts to the top of the tag list,
        # next to Question / Win / Discussion.
        tag = CommunityTag(
            course_id=course_id, slug="activity", label="Activity", position=0
        )
        await repo.create(tag, flush=True)
        return tag

    async def _unpin_activity(
        self, session: AsyncSession, *, activity: CommunityActivity
    ) -> None:
        if activity.pinned_post_id is None:
            return
        post = await session.get(CommunityPost, activity.pinned_post_id)
        if post is not None:
            post.pinned_at = None
            post.pin_type = None
            session.add(post)
        activity.pinned_post_id = None
        session.add(activity)
        await session.flush()


    # ------------------------------------------------------------------
    # Submission comments
    # ------------------------------------------------------------------

    async def list_submission_comments(
        self,
        session: AsyncSession,
        *,
        submission_id: UUID,
    ) -> list[CommunityActivitySubmissionComment]:
        repo = CommunityActivitySubmissionCommentRepository.from_session(session)
        return list(await repo.list_for_submission(submission_id))

    async def create_submission_comment(
        self,
        session: AsyncSession,
        *,
        submission_id: UUID,
        payload: CommunityActivitySubmissionCommentCreate,
        author_user_id: UUID | None = None,
        author_enrollment_id: UUID | None = None,
    ) -> CommunityActivitySubmissionComment:
        # Caller resolves which author kind applies. Endpoint layer
        # enforces that exactly one is set per the auth subject.
        comment = CommunityActivitySubmissionComment(
            submission_id=submission_id,
            body=payload.body.strip(),
            author_user_id=author_user_id,
            author_enrollment_id=author_enrollment_id,
        )
        repo = CommunityActivitySubmissionCommentRepository.from_session(session)
        await repo.create(comment, flush=True)
        return comment


activities_service = CommunityActivityService()
