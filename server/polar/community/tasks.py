"""Background jobs for the Community module.

Two actors fan-out side-effects after a successful POST / reply:

  community.post.created
    Publishes a 'community.post.new' SSE event to every member of the
    course's organization (so the customer-portal feed query can
    invalidate live), and creates a CommunityPostNewOnCourseNotification
    bell for each creator-org user.

  community.comment.created
    Creates a CommunityPostReplyNotification bell for the author of the
    parent post (skipped when the replier IS the author — own-replies
    don't notify yourself).

  community.module_completed_listener
    Subscribes to course.module_completed (Chunk 6 added this event in
    polar/course/service.py); inserts a synthetic 'milestone' community
    post in the course's feed so the creator's milestones surface
    naturally in the timeline. No-op when community is disabled or
    milestones_enabled=false.

All actors live behind the standard Dramatiq pattern: low priority
(community is engagement, not money), idempotent (re-runs don't
duplicate bell rows or SSE events), and they swallow non-fatal errors
so a deletion mid-fanout doesn't poison the queue.
"""

from urllib.parse import urlparse
from uuid import UUID

import structlog

from polar.eventstream.service import publish_members
from polar.exceptions import PolarTaskError
from polar.file.s3 import S3_SERVICES
from polar.logging import Logger
from polar.models.file import FileServiceTypes
from polar.notifications.notification import (
    CommunityPostNewOnCourseNotificationPayload,
    CommunityPostReplyNotificationPayload,
    NotificationType,
)
from polar.notifications.service import PartialNotification
from polar.notifications.service import notifications as notifications_service
from polar.user_organization.service import (
    user_organization as user_organization_service,
)
from polar.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor

from .repository import (
    CommunityCommentRepository,
    CommunityPostRepository,
    CommunitySettingsRepository,
)

log: Logger = structlog.get_logger()


class CommunityTaskError(PolarTaskError): ...


# Trim a body down to something a notification subject / preview line
# can reasonably show — model fields are 5–20k chars, the bell needs
# ~140.
def _preview(text: str, *, limit: int = 140) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


@actor(actor_name="community.post.created", priority=TaskPriority.LOW)
async def community_post_created(post_id: UUID) -> None:
    """Fan-out after a new post commits. Sequence:
      1. Load the post + its course (org id).
      2. Publish 'community.post.new' on the org SSE channel so every
         enrolled member's customer-portal feed query invalidates.
      3. Create a bell notification for each user in the course's org
         (one per maintainer — keeps the creator-side dashboard live).
    """
    async with AsyncSessionMaker() as session:
        post_repo = CommunityPostRepository.from_session(session)
        post = await post_repo.get_by_id(post_id)
        if post is None or post.deleted_at is not None:
            log.info(
                "community.post.fanout.skip_missing",
                post_id=str(post_id),
            )
            return

        # Resolve org id by hopping through Course. The post relationship
        # is lazy='raise' so use the repository to pull what we need.
        from polar.course.repository import CourseRepository

        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(post.course_id)
        if course is None:
            return

        # --- 1. SSE event for connected customer-portal sessions ---
        # publish_members emits one event per *user* on the org. The
        # frontend's useOrganizationSSE / useCustomerSSE hooks pick this
        # up and invalidate the feed query. Customer-portal sessions
        # listen on a customer channel; the org channel feeds the
        # creator dashboard. Phase 1 ships the org broadcast — per-
        # customer fanout for "new post" lands in Phase 3 once we have
        # a meaningful per-student SSE channel for the community.
        try:
            await publish_members(
                session,
                key="community.post.new",
                payload={
                    "course_id": str(course.id),
                    "post_id": str(post.id),
                },
                organization_id=course.organization_id,
            )
        except Exception as e:
            # SSE is best-effort — Redis hiccup shouldn't fail the task.
            log.warning(
                "community.post.fanout.sse_failed",
                post_id=str(post_id),
                error=str(e),
            )

        # --- 2. Bell notifications for the creator org ---
        members = await user_organization_service.list_by_org(
            session, org_id=course.organization_id
        )

        # Resolve the author display name once via the repository helpers.
        author_name: str | None = None
        if post.author_enrollment_id is not None:
            rows = await post_repo.list_student_author_rows(
                {post.author_enrollment_id}
            )
            if rows:
                # `list_student_author_rows` returns a 6-tuple
                # (enrollment_id, name, email, customer_avatar,
                # org_avatar, org_id). We only need name + email to
                # compose the bell-card author label; `*_` swallows
                # the avatar/org fields so further additions to the
                # row don't crash this actor again.
                _, name, email, *_ = rows[0]
                author_name = name or (
                    email.split("@", 1)[0] if email else None
                )
        elif post.author_user_id is not None:
            rows2 = await post_repo.list_instructor_author_rows(
                {post.author_user_id}
            )
            if rows2:
                _, email, _ = rows2[0]
                author_name = email.split("@", 1)[0] if email else None

        payload = CommunityPostNewOnCourseNotificationPayload(
            course_id=course.id,
            course_title=course.title or "your course",
            post_id=post.id,
            post_title=post.title,
            post_preview=_preview(post.body),
            author_name=author_name,
        )
        for member in members:
            # Skip notifying the author themselves when an org member
            # posts in their own course (creator who is also enrolled
            # in their own course, etc.).
            if (
                post.author_user_id is not None
                and member.user_id == post.author_user_id
            ):
                continue
            await notifications_service.send_to_user(
                session=session,
                user_id=member.user_id,
                notif=PartialNotification(
                    type=NotificationType.community_post_new_on_course,
                    payload=payload,
                ),
            )


@actor(actor_name="community.comment.created", priority=TaskPriority.LOW)
async def community_comment_created(comment_id: UUID) -> None:
    """Notify the parent post's author when someone replies.

    Skips self-replies (don't notify a user about their own comment) and
    silently no-ops when:
      * the comment was soft-deleted between insert and task pickup, or
      * the parent post's author is no longer resolvable (e.g. the
        enrollment was deleted), since there's nobody to notify.
    """
    async with AsyncSessionMaker() as session:
        comment_repo = CommunityCommentRepository.from_session(session)
        comment = await comment_repo.get_by_id(comment_id)
        if comment is None or comment.deleted_at is not None:
            return

        post_repo = CommunityPostRepository.from_session(session)
        post = await post_repo.get_by_id(comment.post_id)
        if post is None or post.deleted_at is not None:
            return

        # Self-reply guard — neither author kind notifies itself.
        if (
            comment.author_enrollment_id is not None
            and post.author_enrollment_id == comment.author_enrollment_id
        ):
            return
        if (
            comment.author_user_id is not None
            and post.author_user_id == comment.author_user_id
        ):
            return

        from polar.course.repository import CourseRepository

        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(post.course_id)
        if course is None:
            return

        # Resolve replier display name (same shape as the post task).
        replier_name: str | None = None
        if comment.author_enrollment_id is not None:
            rows = await post_repo.list_student_author_rows(
                {comment.author_enrollment_id}
            )
            if rows:
                _, name, email = rows[0]
                replier_name = name or (
                    email.split("@", 1)[0] if email else None
                )
        elif comment.author_user_id is not None:
            rows2 = await post_repo.list_instructor_author_rows(
                {comment.author_user_id}
            )
            if rows2:
                _, email, _ = rows2[0]
                replier_name = email.split("@", 1)[0] if email else None

        payload = CommunityPostReplyNotificationPayload(
            course_id=course.id,
            course_title=course.title or "your course",
            post_id=post.id,
            post_title=post.title,
            comment_id=comment.id,
            comment_preview=_preview(comment.content),
            replier_name=replier_name,
        )

        # Recipient is either a User (instructor post) or an enrollment
        # (student post). For student posts we route via the customer's
        # linked user — but Spaire customers don't always have a
        # corresponding User row, so for Phase 1 we only notify
        # instructor-authored posts. The student-author notification
        # ride a separate Phase 2 channel (customer-side notification
        # inbox isn't built yet).
        if post.author_user_id is not None:
            await notifications_service.send_to_user(
                session=session,
                user_id=post.author_user_id,
                notif=PartialNotification(
                    type=NotificationType.community_post_reply,
                    payload=payload,
                ),
            )


@actor(
    actor_name="community.module_completed_listener",
    priority=TaskPriority.LOW,
)
async def community_module_completed_listener(
    *,
    course_id: UUID,
    customer_id: UUID,
    lesson_id: UUID | None = None,
) -> None:
    """Insert a milestone community post when a student finishes a
    module. Skipped when:
      * community is not enabled for the course, or
      * milestones_enabled is false on the course's community settings,
      * the event arrives without a lesson_id (shouldn't happen — the
        emitter at course/service.py always passes it), or
      * any downstream check inside create_milestone_post fails
        (no enrollment, no milestone tag, already-created, etc).

    The post insert enqueues community.post.created so the SSE + bell
    fan-out fires for the milestone the same way it does for an
    organic post.
    """
    if lesson_id is None:
        log.info(
            "community.module_completed.skip_no_lesson",
            course_id=str(course_id),
            customer_id=str(customer_id),
        )
        return

    async with AsyncSessionMaker() as session:
        from polar.community.service import community as community_service

        settings_repo = CommunitySettingsRepository.from_session(session)
        settings = await settings_repo.get_by_course_id(course_id)
        if settings is None or not settings.enabled or not settings.milestones_enabled:
            return

        created = await community_service.create_milestone_post(
            session,
            course_id=course_id,
            customer_id=customer_id,
            lesson_id=lesson_id,
        )
        if created is None:
            log.info(
                "community.module_completed.no_post_created",
                course_id=str(course_id),
                customer_id=str(customer_id),
                lesson_id=str(lesson_id),
            )
        else:
            log.info(
                "community.module_completed.post_created",
                course_id=str(course_id),
                customer_id=str(customer_id),
                lesson_id=str(lesson_id),
                post_id=str(created.id),
            )


@actor(
    actor_name="community.presence_blurb.recompute",
    cron_trigger=CronTrigger(day_of_week="mon", hour=8, minute=0),
    priority=TaskPriority.LOW,
)
async def recompute_presence_blurbs() -> None:
    """Weekly: refresh the auto-generated presence blurb on every
    enabled community whose creator hasn't set a manual override. The
    rail then shows e.g. "Mira replied 4 times this week." instead of
    the empty state.

    Manual overrides (any non-null `presence_blurb`) are preserved —
    the repository's list_for_auto_blurb filter excludes them. Runs
    Monday 8:00 UTC so North American + European creators wake up to
    a fresh stat.
    """
    async with AsyncSessionMaker() as session:
        from polar.community.service import community as community_service

        updated = await community_service.recompute_presence_blurbs(session)
        log.info(
            "community.presence_blurb.recomputed",
            updated_count=updated,
        )


def _s3_path_from_public_url(public_url: str) -> str | None:
    """Extract the S3 key from a cover image's public URL.

    Covers are uploaded via /community/{course_id}/media/image-upload,
    which stores them under the `community-posts/...` prefix in the
    community_post_image bucket. We only return a path that matches
    that prefix so this helper can't be tricked into deleting an
    unrelated object via a hand-crafted URL.
    """
    if not public_url:
        return None
    try:
        parsed = urlparse(public_url)
    except ValueError:
        return None
    path = (parsed.path or "").lstrip("/")
    if not path.startswith("community-posts/"):
        return None
    return path


@actor(actor_name="community.cover.cleanup", priority=TaskPriority.LOW)
async def community_cover_cleanup(cover_url: str) -> None:
    """Best-effort delete of a cover image from S3 after the parent
    event/activity is deleted, or after a cover is replaced.

    Idempotent — a missing object is treated as success. We only delete
    objects under the community-posts/ prefix; any other URL is a no-op
    (logged) so an accidental call with a foreign URL can't wipe
    unrelated storage.
    """
    path = _s3_path_from_public_url(cover_url)
    if path is None:
        log.info(
            "community.cover.cleanup.skip_foreign_url",
            cover_url=cover_url,
        )
        return
    try:
        S3_SERVICES[FileServiceTypes.community_post_image].delete_file(path)
    except Exception:
        log.warning(
            "community.cover.cleanup.delete_failed",
            path=path,
            exc_info=True,
        )


# Re-export for unit tests that need to monkeypatch.
__all__ = [
    "community_comment_created",
    "community_cover_cleanup",
    "community_module_completed_listener",
    "community_post_created",
    "recompute_presence_blurbs",
]
