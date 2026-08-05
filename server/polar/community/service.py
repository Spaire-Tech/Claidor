"""Community feed business logic.

The service is the only place endpoints reach into for community
operations. It composes the six repositories from
polar.community.repository plus:
  * course_service.get_enrollment_for_customer — for the enrollment
    guard on customer-portal routes
  * CourseRepository / CourseLessonRepository — for cross-reference
    validation (lesson_id belongs to course, tag_id belongs to course)
  * Customer / User repositories — for author-name resolution
  * polar.kit.comments — for the threaded-with-tombstones logic shared
    with lesson_comments

Per server/CLAUDE.md, this file never opens a session or runs raw SQL.
All commits happen at request / task boundaries (we only flush when we
need an id back).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import timedelta
from typing import Literal
from uuid import UUID, uuid4

from polar.auth.models import AuthSubject, Organization, User
from polar.course import mux as mux_client
from polar.course.repository import (
    CourseLessonRepository,
    CourseModuleRepository,
    CourseRepository,
)
from polar.course.service import course_service
from polar.file.repository import FileRepository
from polar.file.s3 import S3_SERVICES
from polar.kit.comments import find_orphan_parent_ids, merge_with_tombstones
from polar.kit.utils import utc_now
from polar.models.community_comment import CommunityComment
from polar.models.community_event import CommunityEvent
from polar.models.community_post import CommunityPost
from polar.models.community_post_media import CommunityPostMedia
from polar.models.community_settings import CommunitySettings
from polar.models.community_tag import CommunityTag
from polar.models.course_enrollment import CourseEnrollment
from polar.models.file import CommunityPostImageFile, FileServiceTypes
from polar.postgres import AsyncSession
from polar.worker import enqueue_job

from .exceptions import (
    CommentsHidden,
    CommentsLocked,
    CommunityDisabled,
    CommunityNotEnrolled,
    InvalidLessonReference,
    InvalidMediaReference,
    InvalidParentComment,
    InvalidPollOption,
    InvalidTagReference,
    PollNotFound,
    TagSlugConflict,
    TagSlugInvalid,
    UnsupportedPostType,
)
from .repository import (
    CommunityCommentRepository,
    CommunityPostRepository,
    CommunityReactionRepository,
    CommunitySettingsRepository,
    CommunityTagRepository,
    decode_cursor,
    encode_cursor,
)
from .schemas import (
    CommunityAuthor,
    CommunityAuthorInstructor,
    CommunityAuthorStudent,
    CommunityCommentCreate,
    CommunityCourseSummary,
    CommunityLessonChip,
    CommunityMemberRead,
    CommunityPinPayload,
    CommunityPollOptionRead,
    CommunityPollRead,
    CommunityPostCreate,
    CommunityPostImageUploadResult,
    CommunityPostMediaCreate,
    CommunityPostUpdate,
    CommunityPostVideoUploadResult,
    CommunityReactionEmoji,
    CommunityReactionSummaryEntry,
    CommunitySettingsUpdate,
)
from .sorting import CommunityPostSortProperty

# Default pin lifetime when the creator doesn't specify expires_at.
DEFAULT_PIN_DURATION = timedelta(days=7)

# Tags that get seeded on first enable. Matches the v4 design's filter
# row (Activity / Question / Win / Discussion). The legacy `milestone`
# slug was dropped here on 2026-05-25 — existing courses with a
# milestone tag aren't auto-removed but the tag-editor UI lets the
# creator delete it, and create_milestone_post tolerates a missing
# tag gracefully (no-ops).
_SEED_TAGS: list[tuple[str, str, int]] = [
    ("activity", "Activity", 0),
    ("question", "Question", 1),
    ("win", "Win", 2),
    ("discussion", "Discussion", 3),
]


_SLUG_NONALNUM = re.compile(r"[^a-z0-9]+")


def _slugify(label: str) -> str:
    """Derive a URL-safe slug from a tag label. Lowercase, collapse
    non-alphanumerics to a single hyphen, strip leading/trailing
    hyphens, cap at 50 chars (matches the slug column length in the
    migration). Empty result = invalid label, caller raises."""
    stripped = _SLUG_NONALNUM.sub("-", label.lower()).strip("-")
    return stripped[:50]


def _resolve_display_name(name: str | None, email: str | None) -> str | None:
    """Same fallback rules as customer_portal/endpoints/courses.py:
    use the explicit name if present, else the local part of the email."""
    if name:
        stripped = name.strip()
        if stripped:
            return stripped
    if email:
        local_part = email.split("@", 1)[0].strip()
        if local_part:
            return local_part
    return None


class CommunityService:
    # ------------------------------------------------------------------
    # Settings — read, create-on-demand, update
    # ------------------------------------------------------------------

    async def get_or_create_settings(
        self,
        session: AsyncSession,
        course_id: UUID,
    ) -> CommunitySettings:
        """Lazy creation. The course-builder Community tab calls this on
        first visit; everywhere else expects the row to already exist."""
        repo = CommunitySettingsRepository.from_session(session)
        existing = await repo.get_by_course_id(course_id)
        if existing is not None:
            return existing

        settings = CommunitySettings(course_id=course_id)
        created = await repo.create(settings, flush=True)

        # Seed the default tag set so the filter chips have something to
        # show even before the creator touches tag config. Service-layer
        # seeding rather than a data migration so courses created before
        # community shipped get the same treatment when they enable it.
        tag_repo = CommunityTagRepository.from_session(session)
        for slug, label, position in _SEED_TAGS:
            existing_tag = await tag_repo.get_by_slug(course_id, slug)
            if existing_tag is None:
                await tag_repo.create(
                    CommunityTag(
                        course_id=course_id,
                        slug=slug,
                        label=label,
                        position=position,
                    )
                )

        return created

    async def get_settings(
        self,
        session: AsyncSession,
        course_id: UUID,
    ) -> CommunitySettings | None:
        repo = CommunitySettingsRepository.from_session(session)
        return await repo.get_by_course_id(course_id)

    async def update_settings(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        payload: CommunitySettingsUpdate,
    ) -> CommunitySettings:
        settings = await self.get_or_create_settings(session, course_id)
        repo = CommunitySettingsRepository.from_session(session)
        update_dict = payload.model_dump(exclude_unset=True, exclude_none=False)
        if not update_dict:
            return settings
        return await repo.update(settings, update_dict=update_dict)

    async def recompute_presence_blurbs(
        self,
        session: AsyncSession,
        *,
        window_days: int = 7,
    ) -> int:
        """Weekly cron path: for every enabled community whose creator
        hasn't set a manual presence_blurb, compute one from creator-
        side reply activity in the last `window_days`. Manual overrides
        (non-null blurb) are always preserved — `list_for_auto_blurb`
        filters them out before this method ever sees them.

        Returns the number of settings rows actually updated, so the
        cron actor can log a useful summary.
        """
        settings_repo = CommunitySettingsRepository.from_session(session)
        comment_repo = CommunityCommentRepository.from_session(session)
        course_repo = CourseRepository.from_session(session)

        since = utc_now() - timedelta(days=window_days)
        updated_count = 0

        for settings in await settings_repo.list_for_auto_blurb():
            course = await course_repo.get_by_id(settings.course_id)
            if course is None:
                continue

            reply_count = await comment_repo.count_creator_replies_in_course(
                course_id=course.id,
                organization_id=course.organization_id,
                since=since,
            )
            if reply_count <= 0:
                continue

            # Display name: course's instructor_name override beats the
            # bare "Instructor" fallback. (The org name would be more
            # canonical but it's not joined here — the instructor_name
            # column is already the editor's intended display name.)
            speaker = (course.instructor_name or "").strip() or "The instructor"
            verb = "time" if reply_count == 1 else "times"
            blurb = f"{speaker} replied {reply_count} {verb} this week."

            await settings_repo.update(settings, update_dict={"presence_blurb": blurb})
            updated_count += 1

        return updated_count

    # ------------------------------------------------------------------
    # Enrollment guard — used by every customer-portal route
    # ------------------------------------------------------------------

    async def list_customer_communities(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
    ) -> Sequence[CommunityCourseSummary]:
        """Customer-portal picker source-of-truth. Lists the customer's
        enrolled courses with the community_enabled flag joined in. The
        picker UI filters this list to `community_enabled=True` rows so
        clicking a card never lands a student on a disabled banner."""
        repo = CommunitySettingsRepository.from_session(session)
        rows = await repo.list_customer_communities(customer_id)
        return [
            CommunityCourseSummary(
                course_id=row[0],
                course_title=row[1],
                course_thumbnail_url=row[2],
                course_thumbnail_object_position=row[3],
                community_enabled=row[4],
            )
            for row in rows
        ]

    async def list_members(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
    ) -> Sequence[CommunityMemberRead]:
        """Powers the Members tab. Returns the course instructor as a
        synthetic first row (so the UI doesn't need a second call), then
        every active enrollment in newest-first order. The instructor row
        uses the course as its identity since no user_id mapping is
        joined here — the UI keys members by `id` and surfaces the role
        via `kind`."""
        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(course_id)
        post_repo = CommunityPostRepository.from_session(session)
        enrollment_rows = await post_repo.list_course_members(course_id)

        # Instructor avatar falls back to the course org's logo (same
        # logo.dev URL the dashboard uses) so the Members tab never
        # renders the instructor as a blank initial.
        instructor_avatar: str | None = None
        if course is not None:
            from polar.models.organization import Organization

            org = await session.get(Organization, course.organization_id)
            if org is not None:
                instructor_avatar = org.avatar_url

        members: list[CommunityMemberRead] = []
        if course is not None:
            instructor_name = (course.instructor_name or "").strip() or "Instructor"
            members.append(
                CommunityMemberRead(
                    id=course.id,
                    kind="instructor",
                    name=instructor_name,
                    avatar_url=instructor_avatar,
                    joined_at=course.created_at,
                )
            )
        for enrollment_id, name, email, avatar_url, joined_at in enrollment_rows:
            members.append(
                CommunityMemberRead(
                    id=enrollment_id,
                    kind="student",
                    name=_resolve_display_name(name, email),
                    avatar_url=avatar_url,
                    joined_at=joined_at,
                )
            )
        return members

    async def assert_enrolled(
        self,
        session: AsyncSession,
        *,
        customer_id: UUID,
        course_id: UUID,
    ) -> CourseEnrollment:
        """Returns the enrollment or raises CommunityNotEnrolled. Used by
        every customer-portal-side write so we never trust the
        path-param alone."""
        enrollment = await course_service.get_enrollment_for_customer(
            session, customer_id, course_id
        )
        if enrollment is None:
            raise CommunityNotEnrolled()
        return enrollment

    async def assert_community_enabled(
        self,
        session: AsyncSession,
        course_id: UUID,
    ) -> CommunitySettings:
        """Settings exist, `enabled` is true, and the community is not
        archived. Customer-portal routes call this so disabled or archived
        courses 403 instead of returning empty (the creator manages the
        community through ownership-checked routes, not this gate)."""
        settings = await self.get_settings(session, course_id)
        if settings is None or not settings.enabled or settings.archived:
            raise CommunityDisabled()
        return settings

    async def delete_community(
        self,
        session: AsyncSession,
        course_id: UUID,
    ) -> None:
        """Permanently remove a course's community — the settings row and
        all of its content (posts, comments, reactions, events, RSVPs,
        activities, submissions, tags). Safe to call when no community was
        ever set up (deletes nothing). The course itself is untouched."""
        repo = CommunitySettingsRepository.from_session(session)
        await repo.delete_community_for_course(course_id)

    # ------------------------------------------------------------------
    # Posts
    # ------------------------------------------------------------------

    async def create_post(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        author_enrollment_id: UUID | None = None,
        author_user_id: UUID | None = None,
        payload: CommunityPostCreate,
    ) -> CommunityPost:
        """Phase 1: text posts. Phase 3A added video — when type='video',
        media must contain exactly one entry with media_type='video'
        and a mux_upload_id from /media/mux-upload."""
        if payload.type not in ("text", "video"):
            raise UnsupportedPostType()
        if (author_enrollment_id is None) == (author_user_id is None):
            # CHECK constraint will reject this at the DB layer too, but
            # raise early to keep the error surface clean.
            raise ValueError(
                "Exactly one of author_enrollment_id / author_user_id required."
            )

        await self._validate_lesson_belongs_to_course(
            session, course_id=course_id, lesson_id=payload.lesson_id
        )
        await self._validate_tag_belongs_to_course(
            session, course_id=course_id, tag_id=payload.tag_id
        )

        # Validate every image attachment up-front — same org as the
        # course, FileServiceTypes.community_post_image, is_uploaded.
        # Any file_id / mux_upload_id that fails validation → reject
        # the post before we write a row.
        validated_media = await self._validate_media(
            session,
            course_id=course_id,
            post_type=payload.type,
            media=payload.media,
        )

        # An embedded event must belong to this course.
        if payload.event_id is not None:
            await self._validate_event_belongs_to_course(
                session, course_id=course_id, event_id=payload.event_id
            )

        # Poll → JSONB. Option ids are positional ("o0".."o3") so votes /
        # voters stay compact and stable for the life of the post.
        poll_json: dict | None = None
        if payload.poll is not None:
            poll_json = {
                "options": [
                    {"id": f"o{i}", "text": text}
                    for i, text in enumerate(payload.poll.options)
                ],
                "votes": {},
                "voters": {},
            }

        publish_at = payload.publish_at or utc_now()

        post = CommunityPost(
            course_id=course_id,
            author_enrollment_id=author_enrollment_id,
            author_user_id=author_user_id,
            type=payload.type,
            title=payload.title,
            body=payload.body,
            body_format=payload.body_format,
            lesson_id=payload.lesson_id,
            tag_id=payload.tag_id,
            published_at=publish_at,
            poll=poll_json,
            event_id=payload.event_id,
        )
        repo = CommunityPostRepository.from_session(session)
        created = await repo.create(post, flush=True)

        # Attach media rows in the same transaction. The cascade on the
        # post's `media` relationship will clean these up if the post is
        # later soft-deleted. Video rows start with mux_status='waiting'
        # — the Mux webhook flips it to 'ready' (+ asset_id, playback_id,
        # duration) when the upload finishes processing.
        if validated_media:
            for entry in validated_media:
                if entry.media_type == "video":
                    media = CommunityPostMedia(
                        post_id=created.id,
                        media_type="video",
                        mux_upload_id=entry.mux_upload_id,
                        mux_status="waiting",
                        position=entry.position,
                    )
                elif entry.media_type == "gif":
                    media = CommunityPostMedia(
                        post_id=created.id,
                        media_type="gif",
                        external_url=entry.external_url,
                        position=entry.position,
                    )
                else:
                    media = CommunityPostMedia(
                        post_id=created.id,
                        media_type="image",
                        file_id=entry.file_id,
                        position=entry.position,
                    )
                session.add(media)
            await session.flush()

        # Fan-out (SSE + bell). The actor pulls the row fresh so it's
        # safe to enqueue before the request-level commit lands.
        enqueue_job("community.post.created", post_id=created.id)
        # Re-fetch so every selectin relationship is materialized in the
        # current async context. Without this, _post_to_read's
        # `post.tag` / `post.media` access on the freshly-flushed object
        # triggers an implicit lazy-load → MissingGreenlet under asyncpg.
        # Re-fetching (vs `session.refresh(attribute_names=…)`) is
        # future-proof: future selectin relationships hydrate
        # automatically without anyone remembering to update an
        # attribute list.
        return await self._get_post_for_render(session, created.id)

    async def upload_post_image(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        filename: str,
        data: bytes,
        mime_type: str,
    ) -> CommunityPostImageUploadResult:
        """Server-proxied image upload for community-post composers.

        Students don't carry an org-write scope and so can't use the
        standard /v1/files/ presigned-upload flow. This pushes the
        bytes through the server, lands them in the community-post
        S3 bucket, and creates a File row owned by the course's
        organization so the rest of the file lifecycle (the post's
        media row, public URL render, cascade delete) works the same
        as if the creator had uploaded it.
        """
        # Resolve the course's owning organization — file rows are
        # always scoped to an org.
        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(course_id)
        if course is None:
            raise CommunityNotEnrolled()

        # S3 key — keep org + course namespaces so deletion / migration
        # scripts can scope by prefix later.
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if not ext or "/" in ext or len(ext) > 6:
            # Conservative extension fallback by mime type.
            ext = {
                "image/jpeg": "jpg",
                "image/png": "png",
                "image/gif": "gif",
                "image/webp": "webp",
                "image/svg+xml": "svg",
                "image/heic": "heic",
                "image/heif": "heif",
                "image/avif": "avif",
            }.get(mime_type, "bin")

        path = (
            f"community-posts/{course.organization_id}/{course_id}/{uuid4().hex}.{ext}"
        )
        s3 = S3_SERVICES[FileServiceTypes.community_post_image]
        s3.upload(data, path, mime_type)

        # Create the polymorphic File row. is_uploaded=True so the
        # standard validators (FileRepository.get_uploaded_by_ids_in_org)
        # accept it on the post-create request.
        file_row = CommunityPostImageFile(
            organization_id=course.organization_id,
            name=filename,
            path=path,
            mime_type=mime_type,
            size=len(data),
            is_uploaded=True,
            is_enabled=True,
        )
        file_repo = FileRepository.from_session(session)
        created = await file_repo.create(file_row, flush=True)

        return CommunityPostImageUploadResult(
            file_id=created.id,
            public_url=s3.get_public_url(path),
            size=len(data),
            mime_type=mime_type,
        )

    async def create_video_upload(
        self,
        *,
        cors_origin: str = "*",
    ) -> CommunityPostVideoUploadResult:
        """Mint a Mux direct-upload URL for a community-post video. The
        browser PUTs the bytes straight to `upload_url`; the returned
        `upload_id` is what gets passed back in the post-create payload's
        media[] entry. The Mux webhook flips the resulting media row from
        `waiting` → `ready` (+ playback_id, asset_id, duration) when the
        asset finishes processing."""
        result = await mux_client.create_direct_upload(cors_origin=cors_origin)
        return CommunityPostVideoUploadResult(
            upload_id=result["upload_id"],
            upload_url=result["upload_url"],
        )

    async def _validate_media(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        post_type: str,
        media: list[CommunityPostMediaCreate],
    ) -> list[CommunityPostMediaCreate]:
        """Validate every media entry:
          - image: file_id is uploaded, belongs to course's org, is the
            community_post_image service type
          - video: mux_upload_id is non-empty (Mux hosts the asset
            async — the webhook flips mux_status to 'ready' later)
        Enforces the post-type contract:
          - type='text': all entries must be image; max 4
          - type='video': exactly one entry, must be video

        Returns the validated list (deduped by file_id for images, by
        mux_upload_id for videos) or raises InvalidMediaReference."""
        if not media:
            if post_type == "video":
                # Video posts need a video media row — the type wasn't
                # arbitrary, it implies an attachment.
                raise InvalidMediaReference()
            return []

        # Resolve the course's organization for image file scoping.
        course_repo = CourseRepository.from_session(session)
        course = await course_repo.get_by_id(course_id)
        if course is None:
            raise CommunityNotEnrolled()  # "course gone" surfaces as 404

        image_entries = [m for m in media if m.media_type == "image"]
        video_entries = [m for m in media if m.media_type == "video"]
        gif_entries = [m for m in media if m.media_type == "gif"]

        # Type contract: text → images and/or gifs; video → exactly one
        # video, nothing else.
        if post_type == "text" and video_entries:
            raise InvalidMediaReference()
        if post_type == "video":
            if len(video_entries) != 1 or image_entries or gif_entries:
                raise InvalidMediaReference()

        # GIF validation — external_url must be non-empty.
        for m in gif_entries:
            if not m.external_url or not m.external_url.strip():
                raise InvalidMediaReference()

        # Image validation — must have file_id, must be uploaded under
        # the course's org as community_post_image.
        if image_entries:
            for m in image_entries:
                if m.file_id is None:
                    raise InvalidMediaReference()
            file_ids = {m.file_id for m in image_entries if m.file_id}
            file_repo = FileRepository.from_session(session)
            files = await file_repo.get_uploaded_by_ids_in_org(
                course.organization_id,
                file_ids,
                service=FileServiceTypes.community_post_image,
            )
            valid_ids = {f.id for f in files}
            missing = file_ids - valid_ids
            if missing:
                raise InvalidMediaReference()

        # Video validation — mux_upload_id must be non-empty. Phase 3A
        # trusts the client-supplied id (it came from our own endpoint
        # 5 seconds ago); a hardening pass would track issued upload
        # ids server-side.
        for m in video_entries:
            if not m.mux_upload_id or not m.mux_upload_id.strip():
                raise InvalidMediaReference()

        # Dedupe — by file_id for images, by mux_upload_id for videos.
        # Preserves the client's order.
        seen: set[str] = set()
        deduped: list[CommunityPostMediaCreate] = []
        for entry in media:
            if entry.media_type == "image":
                key = f"f:{entry.file_id}"
            elif entry.media_type == "gif":
                key = f"g:{entry.external_url}"
            else:
                key = f"m:{entry.mux_upload_id}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append(entry)
        return deduped

    async def _validate_event_belongs_to_course(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        event_id: UUID,
    ) -> None:
        """Reject an embedded event_id that isn't a live event on this
        course (wrong course, soft-deleted, or non-existent)."""
        from polar.community.events_repository import CommunityEventRepository

        repo = CommunityEventRepository.from_session(session)
        event = await repo.get_by_id(event_id)
        if event is None or event.course_id != course_id:
            raise InvalidMediaReference()

    async def _get_post_for_render(
        self, session: AsyncSession, post_id: UUID
    ) -> CommunityPost:
        """Return a CommunityPost with all selectin relationships loaded.

        Wraps `repo.get_by_id` with a non-null assertion so callers that
        just inserted or updated the row can rely on the fully-hydrated
        object for serialization."""
        repo = CommunityPostRepository.from_session(session)
        fresh = await repo.get_by_id(post_id)
        if fresh is None:
            raise RuntimeError(
                f"Post {post_id} not found after create/update — "
                "this should be impossible within the same session"
            )
        return fresh

    async def vote_poll(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        post_id: UUID,
        option_id: str,
        voter_enrollment_id: UUID | None = None,
        voter_user_id: UUID | None = None,
    ) -> CommunityPost:
        """Record one vote on a post's poll. One vote per user — picking a
        new option switches the previous one; re-picking the same option
        is idempotent. Returns the post, re-hydrated for serialization."""
        repo = CommunityPostRepository.from_session(session)
        post = await repo.get_by_id(post_id)
        if post is None or post.course_id != course_id or post.poll is None:
            raise PollNotFound()

        poll = dict(post.poll)
        option_ids = {o["id"] for o in poll.get("options", [])}
        if option_id not in option_ids:
            raise InvalidPollOption()

        voter_key = (
            f"u:{voter_user_id}"
            if voter_user_id is not None
            else f"e:{voter_enrollment_id}"
        )
        voters = dict(poll.get("voters") or {})
        votes = dict(poll.get("votes") or {})
        previous = voters.get(voter_key)
        if previous != option_id:
            if previous is not None:
                votes[previous] = max(0, votes.get(previous, 0) - 1)
            votes[option_id] = votes.get(option_id, 0) + 1
            voters[voter_key] = option_id
            poll["votes"] = votes
            poll["voters"] = voters
            # Reassigning the attribute (vs mutating in place) is enough
            # for SQLAlchemy to flush the JSONB change.
            post.poll = poll
            await session.flush()
        return await self._get_post_for_render(session, post.id)

    @staticmethod
    def build_poll_read(
        poll: dict | None,
        *,
        viewer_enrollment_id: UUID | None,
        viewer_user_id: UUID | None,
    ) -> CommunityPollRead | None:
        """Build the per-viewer poll payload (option vote counts + the
        viewer's own vote) from the stored JSONB."""
        if not poll:
            return None
        votes = poll.get("votes") or {}
        voters = poll.get("voters") or {}
        viewer_key = (
            f"u:{viewer_user_id}"
            if viewer_user_id is not None
            else f"e:{viewer_enrollment_id}"
            if viewer_enrollment_id is not None
            else None
        )
        options = [
            CommunityPollOptionRead(
                id=o["id"], text=o["text"], votes=int(votes.get(o["id"], 0))
            )
            for o in poll.get("options", [])
        ]
        return CommunityPollRead(
            options=options,
            total=sum(o.votes for o in options),
            my_vote=voters.get(viewer_key) if viewer_key else None,
        )

    async def get_post(
        self, session: AsyncSession, post_id: UUID
    ) -> CommunityPost | None:
        repo = CommunityPostRepository.from_session(session)
        return await repo.get_by_id(post_id)

    async def update_post(
        self,
        session: AsyncSession,
        *,
        post: CommunityPost,
        payload: CommunityPostUpdate,
    ) -> CommunityPost:
        repo = CommunityPostRepository.from_session(session)

        if payload.tag_id is not None:
            await self._validate_tag_belongs_to_course(
                session, course_id=post.course_id, tag_id=payload.tag_id
            )

        update_dict = payload.model_dump(exclude_unset=True, exclude_none=False)
        if not update_dict:
            return post
        await repo.update(post, update_dict=update_dict)
        # If tag_id changed, the in-memory `post.tag` cache points at
        # the OLD tag — selectin loaded it on the initial get_by_id.
        # Re-fetch so the renderer sees the new tag.
        return await self._get_post_for_render(session, post.id)

    async def soft_delete_post(
        self, session: AsyncSession, post: CommunityPost
    ) -> None:
        repo = CommunityPostRepository.from_session(session)
        await repo.soft_delete(post)

    async def create_milestone_post(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        customer_id: UUID,
        lesson_id: UUID,
    ) -> CommunityPost | None:
        """Create a 'just finished {module}' post when a student
        completes a module. Returns None when:
          * the customer isn't enrolled in the course
          * the lesson / module can't be resolved
          * the course has no `milestone` tag (creator deleted it)
          * a milestone post for this (enrollment, lesson, tag) already
            exists — Dramatiq retries shouldn't spawn duplicates

        The body is a third-person fragment ("just finished Module 2 —
        Hydration") because the frontend prepends the author name to
        render "Maya just finished Module 2 — Hydration".
        """
        # 1. Resolve the enrollment.
        enrollment = await course_service.get_enrollment_for_customer(
            session, customer_id, course_id
        )
        if enrollment is None:
            return None

        # 2. Resolve lesson → module → title.
        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None:
            return None
        module_repo = CourseModuleRepository.from_session(session)
        module = await module_repo.get_by_id(lesson.module_id)
        if module is None:
            return None

        # 3. Find the milestone tag for the course. If it was deleted
        # (creator's prerogative — the tag editor lets them remove it),
        # don't create a post — the feed has no place to file it.
        tag = await self.get_tag_by_slug(session, course_id, "milestone")
        if tag is None:
            return None

        # 4. Idempotency check — same enrollment+lesson+tag already
        # produced a milestone post. Skip rather than duplicate.
        post_repo = CommunityPostRepository.from_session(session)
        if await post_repo.milestone_exists_for_enrollment_lesson(
            enrollment_id=enrollment.id,
            lesson_id=lesson_id,
            tag_id=tag.id,
        ):
            return None

        # 5. Build + insert. We bypass the public create_post path
        # because that one validates lesson_id via the module-lookup we
        # just did, validates tag_id against the same course we just
        # confirmed, and forbids 'video' type — all moot here. Direct
        # insert keeps the system-author trail clean.
        body = f"just finished {module.title}"
        post = CommunityPost(
            course_id=course_id,
            author_enrollment_id=enrollment.id,
            type="text",
            body=body,
            body_format="plain",
            lesson_id=lesson_id,
            tag_id=tag.id,
            published_at=utc_now(),
        )
        created = await post_repo.create(post, flush=True)
        # Fan-out (SSE + bell) — same path as a normal post create.
        enqueue_job("community.post.created", post_id=created.id)
        return created

    async def list_for_moderation(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        cursor: str | None,
        limit: int,
    ) -> tuple[Sequence[CommunityPost], bool, dict]:
        """Creator moderation list — includes drafts. Same render
        context shape as `list_feed` so the editor can use the same
        per-post header / author chip render path."""
        repo = CommunityPostRepository.from_session(session)
        rows, has_next = await repo.list_for_moderation(
            course_id,
            cursor=decode_cursor(cursor) if cursor else None,
            limit=limit,
        )
        ctx = await self.build_render_context(
            session,
            posts=rows,
            viewer_enrollment_id=None,
            viewer_user_id=None,
        )
        return rows, has_next, ctx

    def encode_moderation_cursor(self, *, last: CommunityPost) -> str:
        return encode_cursor(last.created_at, last.id)

    # ---- Feed ----

    async def list_feed(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        sort: CommunityPostSortProperty,
        module_id: UUID | None,
        lesson_id: UUID | None,
        tag_id: UUID | None,
        cursor: str | None,
        limit: int,
        viewer_enrollment_id: UUID | None,
        viewer_user_id: UUID | None,
    ) -> tuple[Sequence[CommunityPost], bool, dict]:
        """Returns (posts, has_next_page, render_context) where
        render_context bundles the per-post lesson/tag/author/reaction
        data the endpoint needs to compose CommunityPostRead.

        Keeping render_context as a dict here keeps the service signature
        Pydantic-free — the endpoint does the final schema assembly so
        the service stays usable from tasks too."""
        post_repo = CommunityPostRepository.from_session(session)

        module_lesson_ids = None
        if module_id is not None:
            lesson_repo = CourseLessonRepository.from_session(session)
            # get_by_module_statement returns a Select — it's a
            # statement builder, NOT a coroutine. The await on it was a
            # bug: it raised TypeError("'Select' object can't be
            # awaited") the moment a feed request carried module_id.
            module_lessons_stmt = lesson_repo.get_by_module_statement(module_id)
            module_lesson_ids = {
                lesson.id for lesson in await lesson_repo.get_all(module_lessons_stmt)
            }

        rows, has_next = await post_repo.list_feed(
            course_id,
            sort=sort.value,
            module_lesson_ids=module_lesson_ids,
            lesson_id=lesson_id,
            tag_id=tag_id,
            cursor=decode_cursor(cursor) if cursor else None,
            limit=limit,
        )

        ctx = await self.build_render_context(
            session,
            posts=rows,
            viewer_enrollment_id=viewer_enrollment_id,
            viewer_user_id=viewer_user_id,
        )
        return rows, has_next, ctx

    def encode_next_cursor(
        self, *, last: CommunityPost, sort: CommunityPostSortProperty
    ) -> str:
        """The endpoint calls this when has_next_page=True to give the
        client a cursor for the next request."""
        if sort == CommunityPostSortProperty.recent:
            sort_key = last.pinned_at or last.published_at
        else:
            # top_week / unanswered both order by published_at desc.
            sort_key = last.published_at
        # Both fields are non-null on a published post (CHECK on
        # community_posts_pin_consistency); fallback to now() defensively.
        return encode_cursor(sort_key or utc_now(), last.id)

    # ------------------------------------------------------------------
    # Comments
    # ------------------------------------------------------------------

    async def list_comments(
        self,
        session: AsyncSession,
        *,
        post: CommunityPost,
    ) -> Sequence[CommunityComment]:
        """Visible replies plus soft-deleted parents whose replies still
        render, so the frontend can show tombstones — same pattern as
        lesson_comments. Uses the shared kit."""
        repo = CommunityCommentRepository.from_session(session)
        visible = list(await repo.get_by_post(post.id))

        orphan_ids = find_orphan_parent_ids(visible)
        if not orphan_ids:
            return visible
        tombstones = await repo.get_tombstone_parents(post.id, orphan_ids)
        return merge_with_tombstones(visible, tombstones)

    async def get_comment(
        self, session: AsyncSession, comment_id: UUID
    ) -> CommunityComment | None:
        repo = CommunityCommentRepository.from_session(session)
        return await repo.get_by_id(comment_id)

    async def create_comment(
        self,
        session: AsyncSession,
        *,
        post: CommunityPost,
        author_enrollment_id: UUID | None = None,
        author_user_id: UUID | None = None,
        payload: CommunityCommentCreate,
    ) -> CommunityComment:
        # Resolve the effective comments_mode — post-level override
        # wins, else falls back to the course-wide setting.
        mode = await self._resolve_comments_mode(session, post)
        if mode == "hidden":
            raise CommentsHidden()
        if mode == "locked":
            raise CommentsLocked()

        if (author_enrollment_id is None) == (author_user_id is None):
            raise ValueError(
                "Exactly one of author_enrollment_id / author_user_id required."
            )

        comment_repo = CommunityCommentRepository.from_session(session)
        if payload.parent_id is not None:
            parent = await comment_repo.get_by_id(payload.parent_id)
            if parent is None or parent.post_id != post.id:
                raise InvalidParentComment()

        comment = CommunityComment(
            post_id=post.id,
            parent_id=payload.parent_id,
            author_enrollment_id=author_enrollment_id,
            author_user_id=author_user_id,
            content=payload.content,
            # Only set on video posts. For text posts we clamp to None so
            # an over-eager client can't pin replies to a moment that
            # doesn't exist.
            timestamp_seconds=(
                payload.timestamp_seconds if post.type == "video" else None
            ),
        )
        created = await comment_repo.create(comment, flush=True)

        post_repo = CommunityPostRepository.from_session(session)
        await post_repo.increment_comment_count(post.id, by=1)

        # Bell notification to the post author. The task skips self-
        # replies and silently no-ops if the post / comment / target
        # user resolution fails downstream.
        enqueue_job("community.comment.created", comment_id=created.id)
        return created

    async def soft_delete_comment(
        self,
        session: AsyncSession,
        *,
        comment: CommunityComment,
    ) -> None:
        comment_repo = CommunityCommentRepository.from_session(session)
        await comment_repo.soft_delete(comment)
        # Counter stays decremented even though the row is recoverable —
        # the customer-facing count is "visible replies", not "row count".
        post_repo = CommunityPostRepository.from_session(session)
        await post_repo.increment_comment_count(comment.post_id, by=-1)

    # ------------------------------------------------------------------
    # Reactions
    # ------------------------------------------------------------------

    async def toggle_reaction(
        self,
        session: AsyncSession,
        *,
        target_type: Literal["post", "comment"],
        target_id: UUID,
        actor_enrollment_id: UUID | None = None,
        actor_user_id: UUID | None = None,
        emoji: CommunityReactionEmoji,
    ) -> tuple[bool, int, list[CommunityReactionSummaryEntry]]:
        """Apply the toggle/switch and return
        (is_active_after_toggle, total_count, per_emoji_summary).

        The summary is the authoritative per-emoji breakdown for this
        target from the viewer's perspective — clients should overwrite
        their cached `post.reactions` / `comment.reactions` with it on
        success rather than mutating in place, otherwise stale
        per-emoji counts will drift from the truth."""
        if (actor_enrollment_id is None) == (actor_user_id is None):
            raise ValueError(
                "Exactly one of actor_enrollment_id / actor_user_id required."
            )

        reaction_repo = CommunityReactionRepository.from_session(session)
        active = await reaction_repo.toggle(
            target_type=target_type,
            target_id=target_id,
            actor_enrollment_id=actor_enrollment_id,
            actor_user_id=actor_user_id,
            emoji=emoji,
        )
        # The repo flushes via execute()s on the session, but the
        # follow-up SELECT in summary_for_targets reads from the same
        # session — we need to flush so the just-mutated rows are
        # visible to the subsequent statements without committing.
        await session.flush()

        summary_raw = await reaction_repo.summary_for_targets(
            target_type=target_type,
            target_ids={target_id},
            viewer_enrollment_id=actor_enrollment_id,
            viewer_user_id=actor_user_id,
        )
        summary = [
            CommunityReactionSummaryEntry(
                emoji=e,  # type: ignore[arg-type]
                count=int(payload["count"]),
                mine=bool(payload["mine"]),
            )
            for e, payload in summary_raw.get(target_id, {}).items()
        ]
        total = sum(entry.count for entry in summary)

        if target_type == "post":
            post_repo = CommunityPostRepository.from_session(session)
            await post_repo.set_reaction_count(target_id, total)

        return active, total, summary

    # ------------------------------------------------------------------
    # Pinning
    # ------------------------------------------------------------------

    async def pin_post(
        self,
        session: AsyncSession,
        *,
        post: CommunityPost,
        payload: CommunityPinPayload,
    ) -> CommunityPost:
        repo = CommunityPostRepository.from_session(session)

        # Only one prompt_of_week pin at a time per course; clear any
        # existing one before pinning this post.
        if payload.pin_type == "prompt_of_week":
            await repo.clear_existing_prompt_pin(post.course_id)

        now = utc_now()
        expires = payload.expires_at or (now + DEFAULT_PIN_DURATION)

        updated = await repo.update(
            post,
            update_dict={
                "pinned_at": now,
                "pin_type": payload.pin_type,
                "pin_expires_at": expires,
            },
        )

        # If pinning as prompt_of_week, also point settings at this post
        # so the customer portal can render the prompt card without
        # scanning posts.
        if payload.pin_type == "prompt_of_week":
            settings = await self.get_or_create_settings(session, post.course_id)
            settings_repo = CommunitySettingsRepository.from_session(session)
            await settings_repo.update(
                settings,
                update_dict={"prompt_of_week_post_id": post.id},
            )

        return updated

    async def unpin_post(
        self,
        session: AsyncSession,
        post: CommunityPost,
    ) -> CommunityPost:
        repo = CommunityPostRepository.from_session(session)
        updated = await repo.update(
            post,
            update_dict={
                "pinned_at": None,
                "pin_type": None,
                "pin_expires_at": None,
            },
        )
        if post.pin_type == "prompt_of_week":
            settings = await self.get_settings(session, post.course_id)
            if settings is not None and settings.prompt_of_week_post_id == post.id:
                settings_repo = CommunitySettingsRepository.from_session(session)
                await settings_repo.update(
                    settings, update_dict={"prompt_of_week_post_id": None}
                )
        return updated

    # ------------------------------------------------------------------
    # Tags
    # ------------------------------------------------------------------

    async def list_tags(
        self, session: AsyncSession, course_id: UUID
    ) -> Sequence[CommunityTag]:
        repo = CommunityTagRepository.from_session(session)
        return await repo.get_by_course(course_id)

    async def get_tag_by_slug(
        self, session: AsyncSession, course_id: UUID, slug: str
    ) -> CommunityTag | None:
        repo = CommunityTagRepository.from_session(session)
        return await repo.get_by_slug(course_id, slug)

    async def create_tag(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        label: str,
        slug: str | None = None,
    ) -> CommunityTag:
        """Create a new tag for a course. Slug is auto-derived from the
        label if the caller didn't supply one. Raises TagSlugConflict
        if the slug already exists for this course."""
        repo = CommunityTagRepository.from_session(session)
        normalized_slug = (slug or _slugify(label)).strip()
        if not normalized_slug:
            raise TagSlugInvalid()
        existing = await repo.get_by_slug(course_id, normalized_slug)
        if existing is not None:
            raise TagSlugConflict()

        position = (await repo.get_max_position(course_id)) + 1
        tag = CommunityTag(
            course_id=course_id,
            slug=normalized_slug,
            label=label.strip(),
            position=position,
        )
        return await repo.create(tag, flush=True)

    async def update_tag(
        self,
        session: AsyncSession,
        *,
        tag: CommunityTag,
        label: str | None,
        position: int | None,
    ) -> CommunityTag:
        """Rename / reposition a tag. Slug stays stable (the milestone
        job and other code paths reference seeded tags by slug)."""
        repo = CommunityTagRepository.from_session(session)
        update_dict: dict[str, str | int] = {}
        if label is not None:
            stripped = label.strip()
            if stripped:
                update_dict["label"] = stripped
        if position is not None and position != tag.position:
            update_dict["position"] = position
        if not update_dict:
            return tag
        return await repo.update(tag, update_dict=update_dict)

    async def delete_tag(
        self,
        session: AsyncSession,
        *,
        tag: CommunityTag,
    ) -> None:
        """Soft-delete the tag, then NULL out tag_id on any post that
        references it so the post stops rendering a ghost-pill."""
        repo = CommunityTagRepository.from_session(session)
        await repo.clear_tag_from_posts(tag.id)
        await repo.soft_delete(tag)

    async def reorder_tags(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        ordered_ids: list[UUID],
    ) -> Sequence[CommunityTag]:
        repo = CommunityTagRepository.from_session(session)
        await repo.reorder(course_id, ordered_ids)
        return await repo.get_by_course(course_id)

    # ------------------------------------------------------------------
    # Permission helpers — who can moderate this post / comment?
    # ------------------------------------------------------------------

    def is_creator(self, auth_subject: AuthSubject[User | Organization]) -> bool:
        """Crude check: the auth dependency already ensured the subject
        is a creator-side actor. The course-id check happens at the
        endpoint via course.repository.get_readable_by_id."""
        return True  # Type-narrow on the union; presence here = creator

    def is_post_owner(
        self,
        post: CommunityPost,
        *,
        enrollment_id: UUID | None,
        user_id: UUID | None,
    ) -> bool:
        if enrollment_id is not None and post.author_enrollment_id == enrollment_id:
            return True
        if user_id is not None and post.author_user_id == user_id:
            return True
        return False

    def is_comment_owner(
        self,
        comment: CommunityComment,
        *,
        enrollment_id: UUID | None,
        user_id: UUID | None,
    ) -> bool:
        if enrollment_id is not None and comment.author_enrollment_id == enrollment_id:
            return True
        if user_id is not None and comment.author_user_id == user_id:
            return True
        return False

    # ------------------------------------------------------------------
    # Author resolution — used by endpoints to build CommunityPostRead
    # ------------------------------------------------------------------

    async def resolve_comment_reactions(
        self,
        session: AsyncSession,
        *,
        comment_ids: set[UUID],
        viewer_enrollment_id: UUID | None,
        viewer_user_id: UUID | None,
    ) -> dict[UUID, list[CommunityReactionSummaryEntry]]:
        """Per-comment reaction summary — same shape as the per-post
        summary `build_render_context` produces. Returns
        `{comment_id: [CommunityReactionSummaryEntry, ...]}` with
        `mine=True` flagged for the viewer's own reactions.

        Bulk-loaded so a comment thread of N replies costs one query,
        not N."""
        if not comment_ids:
            return {}
        reaction_repo = CommunityReactionRepository.from_session(session)
        raw = await reaction_repo.summary_for_targets(
            target_type="comment",
            target_ids=comment_ids,
            viewer_enrollment_id=viewer_enrollment_id,
            viewer_user_id=viewer_user_id,
        )
        out: dict[UUID, list[CommunityReactionSummaryEntry]] = {}
        for comment_id, by_emoji in raw.items():
            out[comment_id] = [
                CommunityReactionSummaryEntry(
                    emoji=emoji,  # type: ignore[arg-type]
                    count=int(payload["count"]),
                    mine=bool(payload["mine"]),
                )
                for emoji, payload in by_emoji.items()
            ]
        return out

    async def resolve_authors(
        self,
        session: AsyncSession,
        *,
        course_id: UUID | None = None,
        enrollment_ids: set[UUID],
        user_ids: set[UUID],
    ) -> dict[tuple[Literal["enrollment", "user"], UUID], CommunityAuthor]:
        """One round-trip per author kind. Returns a dict keyed by
        ('enrollment'|'user', id) so endpoints can look up each post's
        author without N+1 queries.

        When `course_id` is provided, instructor authors get the
        course's `instructor_name` overlaid as their display name —
        that's the creator-facing identity they actually edit in the
        course settings, and it's what the community surface should
        render rather than the raw User email."""
        out: dict[tuple[Literal["enrollment", "user"], UUID], CommunityAuthor] = {}

        post_repo = CommunityPostRepository.from_session(session)

        # Resolve the course's instructor identity up front: name override,
        # org-logo avatar fallback, and the set of org-member users. Falls
        # back gracefully when no course_id was threaded through.
        instructor_name_override: str | None = None
        instructor_avatar_fallback: str | None = None
        org_members: dict[str, tuple[UUID, str | None]] = {}
        if course_id is not None:
            from polar.models.organization import Organization

            course_repo = CourseRepository.from_session(session)
            course = await course_repo.get_by_id(course_id)
            if course is not None:
                if course.instructor_name and course.instructor_name.strip():
                    instructor_name_override = course.instructor_name.strip()
                org = await session.get(Organization, course.organization_id)
                if org is not None:
                    # Organization.avatar_url mints the logo.dev URL when
                    # no upload exists.
                    instructor_avatar_fallback = org.avatar_url
                org_members = {
                    member_email.lower(): (member_user_id, member_avatar)
                    for member_user_id, member_email, member_avatar in (
                        await post_repo.list_org_member_users(
                            course.organization_id
                        )
                    )
                }

        # Student authors. Customer has no native avatar column, but the
        # org always carries a logo (logo.dev fallback when the creator
        # hasn't uploaded one) — surface it so every student row gets
        # the same "the system's got a picture for them" treatment as
        # the dashboard does elsewhere.
        #
        # ONE identity for the admin: an org member writing from the
        # portal (their own customer account) — or via the retired
        # preview sandbox — is the HOST, not a student. Emit the
        # instructor author kind so every surface (Host chip, identity
        # pairing) treats their posts exactly like dashboard-authored
        # ones.
        for (
            enrollment_id,
            name,
            email,
            customer_avatar,
            org_avatar,
            _org_id,
        ) in await post_repo.list_student_author_rows(enrollment_ids):
            lowered = email.lower() if isinstance(email, str) else ""
            is_preview = lowered.endswith("@course-preview.invalid")

            member = org_members.get(lowered)
            host_user_id: UUID | None = member[0] if member else None
            if host_user_id is None and is_preview:
                # Legacy sandbox emails encode the admin's user id:
                # preview+{user_id}@course-preview.invalid — parse it so
                # old sandbox posts pair with the same host identity.
                try:
                    host_user_id = UUID(
                        lowered.split("+", 1)[1].split("@", 1)[0]
                    )
                except (IndexError, ValueError):
                    host_user_id = None

            cleaned_name = (
                (name or "").removesuffix(" (preview)").strip() or None
            )

            if host_user_id is not None:
                out[("enrollment", enrollment_id)] = CommunityAuthorInstructor(
                    user_id=host_user_id,
                    name=instructor_name_override
                    or cleaned_name
                    or _resolve_display_name(None, email),
                    avatar_url=customer_avatar
                    or (member[1] if member else None)
                    or instructor_avatar_fallback,
                )
                continue

            resolved_name = (
                cleaned_name if is_preview else _resolve_display_name(name, email)
            )
            out[("enrollment", enrollment_id)] = CommunityAuthorStudent(
                enrollment_id=enrollment_id,
                name=resolved_name,
                # Only the admin's preview customer borrows the org logo
                # — real students stay at None so they render initials,
                # never with another author's brand on their face.
                avatar_url=customer_avatar or (org_avatar if is_preview else None),
            )

        # Instructor authors. The User table has no display name distinct
        # from email, but the course carries an `instructor_name`
        # override that's the editorial-facing identity (set in the
        # course editor). If present, that beats the email-local
        # fallback so admins see "Mira Chen" on their own posts instead
        # of "mira.chen". Avatars fall back to the org's logo (resolved
        # above) when the user hasn't uploaded their own.
        for user_id, email, avatar_url in await post_repo.list_instructor_author_rows(
            user_ids
        ):
            out[("user", user_id)] = CommunityAuthorInstructor(
                user_id=user_id,
                name=instructor_name_override or _resolve_display_name(None, email),
                avatar_url=avatar_url or instructor_avatar_fallback,
            )

        return out

    # ------------------------------------------------------------------
    # Lesson-chip resolution — used by endpoints to build CommunityPostRead
    # ------------------------------------------------------------------

    async def resolve_lesson_chips(
        self,
        session: AsyncSession,
        lesson_ids: set[UUID],
    ) -> dict[UUID, CommunityLessonChip]:
        if not lesson_ids:
            return {}
        lesson_repo = CourseLessonRepository.from_session(session)
        lessons = await lesson_repo.get_all(
            lesson_repo.get_base_statement().where(lesson_repo.model.id.in_(lesson_ids))
        )
        out: dict[UUID, CommunityLessonChip] = {}
        for lesson in lessons:
            out[lesson.id] = CommunityLessonChip(
                lesson_id=lesson.id,
                lesson_title=lesson.title,
                module_id=lesson.module_id,
                module_title=None,  # Phase 1: lesson title only;
                # module title resolved lazily in Phase 2 if useful.
            )
        return out

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _validate_lesson_belongs_to_course(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        lesson_id: UUID | None,
    ) -> None:
        """Lesson → module → course. Walking via module_id (rather than
        the lesson's org_id) is the only way to distinguish two courses
        owned by the same organization."""
        if lesson_id is None:
            return
        lesson_repo = CourseLessonRepository.from_session(session)
        lesson = await lesson_repo.get_by_id(lesson_id)
        if lesson is None:
            raise InvalidLessonReference()
        module_repo = CourseModuleRepository.from_session(session)
        module = await module_repo.get_by_id(lesson.module_id)
        if module is None or module.course_id != course_id:
            raise InvalidLessonReference()

    async def _validate_tag_belongs_to_course(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        tag_id: UUID | None,
    ) -> None:
        if tag_id is None:
            return
        tag_repo = CommunityTagRepository.from_session(session)
        tag = await tag_repo.get_by_id(tag_id)
        if tag is None or tag.course_id != course_id:
            raise InvalidTagReference()

    async def _resolve_comments_mode(
        self,
        session: AsyncSession,
        post: CommunityPost,
    ) -> Literal["visible", "hidden", "locked"]:
        """Post-level override wins; else fall back to the course's
        community_settings.comments_mode; default visible."""
        if post.comments_mode is not None:
            return post.comments_mode  # type: ignore[return-value]
        settings = await self.get_settings(session, post.course_id)
        if settings is None:
            return "visible"
        return settings.comments_mode  # type: ignore[return-value]

    async def build_render_context(
        self,
        session: AsyncSession,
        *,
        posts: Sequence[CommunityPost],
        viewer_enrollment_id: UUID | None,
        viewer_user_id: UUID | None,
    ) -> dict:
        """Bulk-load everything the endpoint needs to compose
        CommunityPostRead for a feed page in O(1) queries per kind."""
        if not posts:
            return {
                "authors": {},
                "lessons": {},
                "reactions": {},
                "polls": {},
                "events": {},
            }

        enrollment_ids = {
            p.author_enrollment_id for p in posts if p.author_enrollment_id
        }
        user_ids = {p.author_user_id for p in posts if p.author_user_id}
        lesson_ids = {p.lesson_id for p in posts if p.lesson_id}
        post_ids = {p.id for p in posts}

        # All posts in a render context belong to the same course (the
        # feed/list endpoints scope the query that way). Lift the
        # course_id off any post so resolve_authors can overlay the
        # course's instructor_name on instructor authors.
        course_id_for_overlay = posts[0].course_id if posts else None

        authors = await self.resolve_authors(
            session,
            course_id=course_id_for_overlay,
            enrollment_ids=enrollment_ids,
            user_ids=user_ids,
        )
        lessons = await self.resolve_lesson_chips(session, lesson_ids)

        reactions_summary = {}
        reaction_repo = CommunityReactionRepository.from_session(session)
        raw = await reaction_repo.summary_for_targets(
            target_type="post",
            target_ids=post_ids,
            viewer_enrollment_id=viewer_enrollment_id,
            viewer_user_id=viewer_user_id,
        )
        for post_id, by_emoji in raw.items():
            entries = []
            for emoji, payload in by_emoji.items():
                entries.append(
                    CommunityReactionSummaryEntry(
                        emoji=emoji,  # type: ignore[arg-type]
                        count=int(payload["count"]),
                        mine=bool(payload["mine"]),
                    )
                )
            reactions_summary[post_id] = entries

        # For pin_type='activity' posts, resolve {post_id: activity_id}
        # so the feed can render an 'Open activity' CTA on the pinned
        # post.
        from .activities_repository import CommunityActivityRepository

        activity_post_ids = {p.id for p in posts if p.pin_type == "activity"}
        activity_repo = CommunityActivityRepository.from_session(session)
        activity_by_post = await activity_repo.map_by_pinned_post_ids(activity_post_ids)
        # Richer summary for the inline activity-CTA panel (submission
        # type + count). Kept separate from the legacy `activities`
        # map so the existing `activity_id` field on CommunityPostRead
        # stays backward compatible.
        activity_summary_by_post = await activity_repo.summary_by_pinned_post_ids(
            activity_post_ids
        )
        module_info_by_post = await activity_repo.module_info_by_pinned_post_ids(
            activity_post_ids
        )

        # Polls (per-viewer vote counts + the viewer's own vote) read
        # straight off each post's JSONB — no extra query.
        polls = {
            p.id: self.build_poll_read(
                p.poll,
                viewer_enrollment_id=viewer_enrollment_id,
                viewer_user_id=viewer_user_id,
            )
            for p in posts
            if p.poll
        }

        # Embedded event cards — one bulk fetch for every linked event.
        events: dict[UUID, CommunityEvent] = {}
        event_ids = {p.event_id for p in posts if p.event_id}
        if event_ids:
            from .events_repository import CommunityEventRepository

            event_repo = CommunityEventRepository.from_session(session)
            statement = event_repo.get_base_statement().where(
                CommunityEvent.id.in_(event_ids)
            )
            by_id = {e.id: e for e in await event_repo.get_all(statement)}
            for p in posts:
                if p.event_id and p.event_id in by_id:
                    events[p.id] = by_id[p.event_id]

        return {
            "authors": authors,
            "lessons": lessons,
            "reactions": reactions_summary,
            "activities": activity_by_post,
            "activity_summaries": activity_summary_by_post,
            "modules": module_info_by_post,
            "polls": polls,
            "events": events,
        }


community = CommunityService()
