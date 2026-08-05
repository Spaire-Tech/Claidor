"""HTTP routes for the Community feed.

Two routers in one file so the module's HTTP surface lives in one place:

  creator_router  — mounted at /v1/community/{course_id}/...
                    Auth: CommunityCreatorRead/Write (web + product scopes;
                    Same as the course editor).

  customer_router — mounted at /v1/customer-portal/community/{course_id}/...
                    Auth: CommunityCustomerRead/Write (customer-portal
                    session token or seat-claimed member).

Both routers register on polar.api in Chunk 5's same commit.
"""

from collections.abc import Iterable
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, HTTPException, Query, UploadFile
from fastapi import File as FastAPIFile
from pydantic import UUID4

from polar.auth.models import (
    is_user,
)
from polar.course import mux as mux_client
from polar.course.repository import CourseRepository
from polar.customer_portal.utils import get_customer_id
from polar.file.s3 import S3_SERVICES
from polar.kit.pagination import ListResourceWithCursorPagination
from polar.models.community_comment import CommunityComment
from polar.models.community_event import CommunityEvent
from polar.models.community_post import CommunityPost
from polar.models.file import FileServiceTypes
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .auth import (
    CommunityCreatorRead,
    CommunityCreatorWrite,
    CommunityCustomerRead,
    CommunityCustomerWrite,
)
from .repository import CommunityTagRepository
from .schemas import (
    CommunityAuthor,
    CommunityAuthorInstructor,
    CommunityAuthorStudent,
    CommunityCommentCreate,
    CommunityCommentRead,
    CommunityCourseSummary,
    CommunityLessonChip,
    CommunityMemberRead,
    CommunityModuleChip,
    CommunityPinPayload,
    CommunityPollRead,
    CommunityPollVote,
    CommunityPostActivityPin,
    CommunityPostCreate,
    CommunityPostEventRef,
    CommunityPostImageUploadResult,
    CommunityPostMediaRead,
    CommunityPostRead,
    CommunityPostVideoUploadResult,
    CommunityReactionSummaryEntry,
    CommunityReactionToggle,
    CommunityReactionToggleResult,
    CommunitySettingsRead,
    CommunitySettingsUpdate,
    CommunityTagCreate,
    CommunityTagRead,
    CommunityTagReorderRequest,
    CommunityTagUpdate,
)
from .service import community as community_service
from .sorting import CommunityPostSortProperty

# ---------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------

creator_router = APIRouter(
    prefix="/community",
    tags=["community"],
)

customer_router = APIRouter(
    prefix="/customer-portal/community",
    tags=["customer_portal_community", APITag.public],
)

# Unauthenticated public surface — shareable event pages and the matching
# .ics download. Mounted alongside the other two routers in api.py.
public_router = APIRouter(
    prefix="/community/public",
    tags=["community", APITag.public],
)


# ---------------------------------------------------------------------
# Path params
# ---------------------------------------------------------------------

CourseID = Annotated[UUID4, ...]
PostID = Annotated[UUID4, ...]
CommentID = Annotated[UUID4, ...]


# ---------------------------------------------------------------------
# Helpers — render-context → response schemas
# ---------------------------------------------------------------------


def _author_for_post(
    post: CommunityPost,
    authors: dict[tuple[Literal["enrollment", "user"], UUID], CommunityAuthor],
) -> CommunityAuthor:
    """Look up the resolved author from the bulk-load map. Falls back to
    a synthetic 'unknown' author if the underlying row was deleted
    between page-fetch and now."""
    if post.author_enrollment_id is not None:
        resolved = authors.get(("enrollment", post.author_enrollment_id))
        if resolved is not None:
            return resolved
        return CommunityAuthorStudent(
            enrollment_id=post.author_enrollment_id,
            name=None,
            avatar_url=None,
        )
    # author_user_id is non-null per the CHECK constraint.
    assert post.author_user_id is not None
    resolved = authors.get(("user", post.author_user_id))
    if resolved is not None:
        return resolved
    return CommunityAuthorInstructor(
        user_id=post.author_user_id,
        name=None,
        avatar_url=None,
    )


def _author_for_comment(
    comment: CommunityComment,
    authors: dict[tuple[Literal["enrollment", "user"], UUID], CommunityAuthor],
) -> CommunityAuthor:
    if comment.author_enrollment_id is not None:
        resolved = authors.get(("enrollment", comment.author_enrollment_id))
        if resolved is not None:
            return resolved
        return CommunityAuthorStudent(
            enrollment_id=comment.author_enrollment_id,
            name=None,
            avatar_url=None,
        )
    assert comment.author_user_id is not None
    resolved = authors.get(("user", comment.author_user_id))
    if resolved is not None:
        return resolved
    return CommunityAuthorInstructor(
        user_id=comment.author_user_id,
        name=None,
        avatar_url=None,
    )


def _media_to_read(post: CommunityPost) -> list[CommunityPostMediaRead]:
    # The CommunityPostMedia.file relationship is selectin so this
    # loop is N+0 across the feed page — the file rows came in with
    # the post's media row in the original SELECT.
    out: list[CommunityPostMediaRead] = []
    for m in post.media:
        public_url: str | None = None
        playback_url: str | None = None
        external_url: str | None = m.external_url
        thumbnail_url: str | None = m.thumbnail_url
        if m.media_type == "image" and m.file is not None and m.file.is_uploaded:
            public_url = S3_SERVICES[
                FileServiceTypes.community_post_image
            ].get_public_url(m.file.path)
        elif m.media_type == "video" and m.mux_playback_id:
            # Sign per-request so the URL TTL is fresh on each feed page.
            # `playback_url` falls back to None when signing keys aren't
            # configured — HlsVideo then composes a public stream.mux URL
            # from `mux_playback_id` itself.
            playback_url = mux_client.playback_url(m.mux_playback_id)
            if thumbnail_url is None:
                thumbnail_url = mux_client.thumbnail_url(m.mux_playback_id)
        out.append(
            CommunityPostMediaRead(
                id=m.id,
                media_type=m.media_type,  # type: ignore[arg-type]
                position=m.position,
                external_url=external_url,
                file_id=m.file_id,
                public_url=public_url,
                mux_playback_id=m.mux_playback_id,
                playback_url=playback_url,
                mux_status=m.mux_status,
                duration_seconds=m.duration_seconds,
                thumbnail_url=thumbnail_url,
            )
        )
    return out


def _module_chip_from_ctx(post: CommunityPost, ctx: dict) -> CommunityModuleChip | None:
    """Resolve a CommunityModuleChip for activity-pin posts whose
    underlying activity is module-scoped. Returns None for posts that
    aren't activity pins or are lesson-scoped (those use lesson_chip)."""
    if post.pin_type != "activity":
        return None
    info = ctx.get("modules", {}).get(post.id)
    if info is None:
        return None
    module_id, module_title = info
    return CommunityModuleChip(module_id=module_id, module_title=module_title)


def _event_ref(event: "CommunityEvent | None") -> CommunityPostEventRef | None:
    if event is None:
        return None
    return CommunityPostEventRef(
        id=event.id,
        title=event.title,
        type=event.type,  # type: ignore[arg-type]
        start_at=event.start_at,
        timezone=event.timezone,
        duration_minutes=event.duration_minutes,
        cover_url=event.cover_url,
        cover_object_position=event.cover_object_position,
        meeting_url=event.meeting_url,
    )


def _post_to_read(
    post: CommunityPost,
    *,
    author: CommunityAuthor,
    lesson_chip: CommunityLessonChip | None,
    reactions: list[CommunityReactionSummaryEntry],
    activity_id: UUID | None = None,
    activity_pin: CommunityPostActivityPin | None = None,
    module_chip: CommunityModuleChip | None = None,
    poll: "CommunityPollRead | None" = None,
    event: "CommunityEvent | None" = None,
) -> CommunityPostRead:
    return CommunityPostRead(
        id=post.id,
        course_id=post.course_id,
        type=post.type,  # type: ignore[arg-type]
        title=post.title,
        body=post.body,
        body_format=post.body_format,  # type: ignore[arg-type]
        author=author,
        lesson=lesson_chip,
        module=module_chip,
        tag=(
            CommunityTagRead.model_validate(post.tag, from_attributes=True)
            if post.tag is not None
            else None
        ),
        media=_media_to_read(post),
        published_at=post.published_at,
        pinned_at=post.pinned_at,
        pin_type=post.pin_type,  # type: ignore[arg-type]
        pin_expires_at=post.pin_expires_at,
        comments_mode=post.comments_mode,  # type: ignore[arg-type]
        reaction_count=post.reaction_count,
        comment_count=post.comment_count,
        reactions=reactions,
        activity_id=activity_id,
        activity=activity_pin,
        poll=poll,
        event=_event_ref(event),
        created_at=post.created_at,
        modified_at=post.modified_at,
    )


def _activity_pin_from_ctx(
    post: CommunityPost, ctx: dict
) -> CommunityPostActivityPin | None:
    """Build the inline activity-CTA-row payload from the bulk-loaded
    render context. Returns None for non-activity-pin posts."""
    if post.pin_type != "activity":
        return None
    info = ctx.get("activity_summaries", {}).get(post.id)
    if info is None:
        return None
    activity_id, submission_type, submission_count = info
    return CommunityPostActivityPin(
        id=activity_id,
        submission_type=submission_type,  # type: ignore[arg-type]
        submission_count=submission_count,
    )


async def _render_single_post(
    session: AsyncSession,
    post: CommunityPost,
    *,
    viewer_enrollment_id: UUID | None,
    viewer_user_id: UUID | None,
) -> CommunityPostRead:
    """Single-post variant of the feed's bulk render. Used by create /
    update / pin so the client gets the same shape back."""
    ctx = await community_service.build_render_context(
        session,
        posts=[post],
        viewer_enrollment_id=viewer_enrollment_id,
        viewer_user_id=viewer_user_id,
    )
    return _post_to_read(
        post,
        author=_author_for_post(post, ctx["authors"]),
        lesson_chip=ctx["lessons"].get(post.lesson_id) if post.lesson_id else None,
        reactions=ctx["reactions"].get(post.id, []),
        activity_id=ctx.get("activities", {}).get(post.id),
        activity_pin=_activity_pin_from_ctx(post, ctx),
        module_chip=_module_chip_from_ctx(post, ctx),
        poll=ctx.get("polls", {}).get(post.id),
        event=ctx.get("events", {}).get(post.id),
    )


# ---------------------------------------------------------------------
# Creator authorization helpers — endpoint-side course-readability
# guard. The auth dependency confirms scope; this confirms the actor
# can see the course in question (and therefore its community).
# ---------------------------------------------------------------------


async def _require_creator_owns_course(
    session: AsyncSession,
    course_id: UUID,
    auth_subject,
) -> None:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")


# ====================================================================
# CREATOR ROUTES — /v1/community/...
# ====================================================================


@creator_router.get(
    "/{course_id}/settings",
    response_model=CommunitySettingsRead,
    summary="Get Community Settings",
)
async def get_settings_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> CommunitySettingsRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    settings = await community_service.get_or_create_settings(session, course_id)
    return CommunitySettingsRead.model_validate(settings, from_attributes=True)


@creator_router.patch(
    "/{course_id}/settings",
    response_model=CommunitySettingsRead,
    summary="Update Community Settings",
)
async def update_settings_creator(
    course_id: CourseID,
    payload: CommunitySettingsUpdate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunitySettingsRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    settings = await community_service.update_settings(
        session, course_id=course_id, payload=payload
    )
    return CommunitySettingsRead.model_validate(settings, from_attributes=True)


@creator_router.delete(
    "/{course_id}",
    status_code=204,
    summary="Delete Community",
)
async def delete_community_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _require_creator_owns_course(session, course_id, auth_subject)
    await community_service.delete_community(session, course_id)


@creator_router.get(
    "/{course_id}/posts",
    response_model=ListResourceWithCursorPagination[CommunityPostRead],
    summary="List Community Posts (Creator / Moderation)",
)
async def list_posts_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
) -> ListResourceWithCursorPagination[CommunityPostRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    posts, has_next, ctx = await community_service.list_for_moderation(
        session, course_id=course_id, cursor=cursor, limit=limit
    )
    items = [
        _post_to_read(
            p,
            author=_author_for_post(p, ctx["authors"]),
            lesson_chip=ctx["lessons"].get(p.lesson_id) if p.lesson_id else None,
            reactions=ctx["reactions"].get(p.id, []),
            activity_id=ctx.get("activities", {}).get(p.id),
            activity_pin=_activity_pin_from_ctx(p, ctx),
            module_chip=_module_chip_from_ctx(p, ctx),
            poll=ctx.get("polls", {}).get(p.id),
            event=ctx.get("events", {}).get(p.id),
        )
        for p in posts
    ]
    return ListResourceWithCursorPagination.from_results(items, has_next_page=has_next)


@creator_router.get(
    "/{course_id}/preview",
    response_model=ListResourceWithCursorPagination[CommunityPostRead],
    summary="Preview Community Feed (Creator)",
)
async def preview_feed_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
    sort: CommunityPostSortProperty = CommunityPostSortProperty.recent,
    module_id: UUID4 | None = Query(default=None),
    lesson_id: UUID4 | None = Query(default=None),
    tag_id: UUID4 | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> ListResourceWithCursorPagination[CommunityPostRead]:
    """Read-only render of the student-side feed for the course-editor
    preview pane. Reuses list_feed so the same rendering primitives
    drive both surfaces. Drafts (published_at IS NULL) and disabled
    communities are excluded — the preview shows what a student would
    actually see right now, not what the creator could see if they
    were an admin."""
    await _require_creator_owns_course(session, course_id, auth_subject)
    viewer_user_id = auth_subject.subject.id if is_user(auth_subject) else None
    posts, has_next, ctx = await community_service.list_feed(
        session,
        course_id=course_id,
        sort=sort,
        module_id=module_id,
        lesson_id=lesson_id,
        tag_id=tag_id,
        cursor=cursor,
        limit=limit,
        viewer_enrollment_id=None,
        viewer_user_id=viewer_user_id,
    )
    items = [
        _post_to_read(
            p,
            author=_author_for_post(p, ctx["authors"]),
            lesson_chip=ctx["lessons"].get(p.lesson_id) if p.lesson_id else None,
            reactions=ctx["reactions"].get(p.id, []),
            activity_id=ctx.get("activities", {}).get(p.id),
            activity_pin=_activity_pin_from_ctx(p, ctx),
            module_chip=_module_chip_from_ctx(p, ctx),
            poll=ctx.get("polls", {}).get(p.id),
            event=ctx.get("events", {}).get(p.id),
        )
        for p in posts
    ]
    return ListResourceWithCursorPagination.from_results(items, has_next_page=has_next)


@creator_router.get(
    "/{course_id}/members",
    response_model=list[CommunityMemberRead],
    summary="List Community Members (Creator)",
)
async def list_members_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityMemberRead]:
    """Members tab for the course-editor preview. Returns the instructor
    + every active enrollment, newest-first. Avatars aren't joined —
    Phase 1 falls back to initials in the UI."""
    await _require_creator_owns_course(session, course_id, auth_subject)
    members = await community_service.list_members(session, course_id=course_id)
    return list(members)


@creator_router.get(
    "/{course_id}/tags",
    response_model=list[CommunityTagRead],
    summary="List Community Tags (Creator)",
)
async def list_tags_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityTagRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    tags = await community_service.list_tags(session, course_id)
    return [CommunityTagRead.model_validate(t, from_attributes=True) for t in tags]


@creator_router.post(
    "/{course_id}/tags",
    response_model=CommunityTagRead,
    status_code=201,
    summary="Create Community Tag",
)
async def create_tag(
    course_id: CourseID,
    payload: CommunityTagCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityTagRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    tag = await community_service.create_tag(
        session,
        course_id=course_id,
        label=payload.label,
        slug=payload.slug,
    )
    return CommunityTagRead.model_validate(tag, from_attributes=True)


@creator_router.patch(
    "/{course_id}/tags/{tag_id}",
    response_model=CommunityTagRead,
    summary="Update Community Tag",
)
async def update_tag(
    course_id: CourseID,
    tag_id: Annotated[UUID4, ...],
    payload: CommunityTagUpdate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityTagRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    tag_repo = CommunityTagRepository.from_session(session)
    tag = await tag_repo.get_by_id(tag_id)
    if tag is None or tag.course_id != course_id:
        raise HTTPException(status_code=404, detail="Tag not found")
    updated = await community_service.update_tag(
        session, tag=tag, label=payload.label, position=payload.position
    )
    return CommunityTagRead.model_validate(updated, from_attributes=True)


@creator_router.delete(
    "/{course_id}/tags/{tag_id}",
    status_code=204,
    summary="Delete Community Tag",
)
async def delete_tag(
    course_id: CourseID,
    tag_id: Annotated[UUID4, ...],
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _require_creator_owns_course(session, course_id, auth_subject)
    tag_repo = CommunityTagRepository.from_session(session)
    tag = await tag_repo.get_by_id(tag_id)
    if tag is None or tag.course_id != course_id:
        raise HTTPException(status_code=404, detail="Tag not found")
    await community_service.delete_tag(session, tag=tag)


@creator_router.post(
    "/{course_id}/tags/reorder",
    response_model=list[CommunityTagRead],
    summary="Reorder Community Tags",
)
async def reorder_tags(
    course_id: CourseID,
    payload: CommunityTagReorderRequest,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityTagRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    tags = await community_service.reorder_tags(
        session, course_id=course_id, ordered_ids=payload.ordered_ids
    )
    return [CommunityTagRead.model_validate(t, from_attributes=True) for t in tags]


@creator_router.post(
    "/{course_id}/posts/{post_id}/pin",
    response_model=CommunityPostRead,
    summary="Pin Community Post",
)
async def pin_post(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityPinPayload,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")
    updated = await community_service.pin_post(session, post=post, payload=payload)
    viewer_user_id = auth_subject.subject.id if is_user(auth_subject) else None
    return await _render_single_post(
        session,
        updated,
        viewer_enrollment_id=None,
        viewer_user_id=viewer_user_id,
    )


@creator_router.delete(
    "/{course_id}/posts/{post_id}/pin",
    response_model=CommunityPostRead,
    summary="Unpin Community Post",
)
async def unpin_post(
    course_id: CourseID,
    post_id: PostID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")
    updated = await community_service.unpin_post(session, post)
    viewer_user_id = auth_subject.subject.id if is_user(auth_subject) else None
    return await _render_single_post(
        session,
        updated,
        viewer_enrollment_id=None,
        viewer_user_id=viewer_user_id,
    )


@creator_router.delete(
    "/{course_id}/posts/{post_id}",
    status_code=204,
    summary="Moderator-delete Community Post",
)
async def delete_post_creator(
    course_id: CourseID,
    post_id: PostID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _require_creator_owns_course(session, course_id, auth_subject)
    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")
    await community_service.soft_delete_post(session, post)


@creator_router.delete(
    "/{course_id}/comments/{comment_id}",
    status_code=204,
    summary="Moderator-delete Community Comment",
)
async def delete_comment_creator(
    course_id: CourseID,
    comment_id: CommentID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _require_creator_owns_course(session, course_id, auth_subject)
    comment = await community_service.get_comment(session, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Cross-check: the comment's post is in this course.
    post = await community_service.get_post(session, comment.post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    await community_service.soft_delete_comment(session, comment=comment)


# ====================================================================
# Creator-side WRITE endpoints — the admin posts/comments/reacts AS
# the instructor on their own community surface. These mirror the
# customer-portal write endpoints but use the user auth subject so
# author_user_id is set (not author_enrollment_id). Org-token auth is
# rejected — a community needs a human identity behind the avatar.
# ====================================================================


def _require_user_subject(auth_subject) -> UUID:
    if not is_user(auth_subject):
        raise HTTPException(
            status_code=403,
            detail="Only user-authenticated sessions can act as the instructor.",
        )
    return auth_subject.subject.id


@creator_router.post(
    "/{course_id}/posts",
    response_model=CommunityPostRead,
    status_code=201,
    summary="Create Community Post (Creator)",
)
async def create_post_creator(
    course_id: CourseID,
    payload: CommunityPostCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    post = await community_service.create_post(
        session,
        course_id=course_id,
        author_user_id=user_id,
        payload=payload,
    )
    return await _render_single_post(
        session,
        post,
        viewer_enrollment_id=None,
        viewer_user_id=user_id,
    )


@creator_router.post(
    "/{course_id}/media/image-upload",
    response_model=CommunityPostImageUploadResult,
    status_code=201,
    summary="Upload Community Post Image (Creator)",
)
async def upload_post_image_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorWrite,
    file: UploadFile = FastAPIFile(...),
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostImageUploadResult:
    await _require_creator_owns_course(session, course_id, auth_subject)
    _require_user_subject(auth_subject)

    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    # SVG can carry inline <script> — served from our public bucket on a
    # trusted origin, that's an XSS gun pointed at the customer portal.
    # Block it explicitly; raster formats only.
    if content_type in ("image/svg+xml", "image/svg"):
        raise HTTPException(
            status_code=400,
            detail="SVG uploads are not supported. Use JPG, PNG, or WEBP.",
        )

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image must be under 10 MB.",
        )

    return await community_service.upload_post_image(
        session,
        course_id=course_id,
        filename=file.filename or "image",
        data=data,
        mime_type=content_type,
    )


@creator_router.post(
    "/{course_id}/media/mux-upload",
    response_model=CommunityPostVideoUploadResult,
    status_code=201,
    summary="Create Community Post Video Upload (Creator)",
)
async def create_video_upload_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostVideoUploadResult:
    await _require_creator_owns_course(session, course_id, auth_subject)
    _require_user_subject(auth_subject)
    try:
        return await community_service.create_video_upload()
    except Exception as e:
        raise HTTPException(
            status_code=502, detail="Failed to create video upload"
        ) from e


@creator_router.get(
    "/{course_id}/posts/{post_id}/comments",
    response_model=list[CommunityCommentRead],
    summary="List Community Post Comments (Creator)",
)
async def list_comments_creator(
    course_id: CourseID,
    post_id: PostID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityCommentRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    viewer_user_id = auth_subject.subject.id if is_user(auth_subject) else None
    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = await community_service.list_comments(session, post=post)
    return await _serialize_comments(
        session,
        comments,
        course_id=course_id,
        viewer_user_id=viewer_user_id,
    )


@creator_router.post(
    "/{course_id}/posts/{post_id}/comments",
    response_model=CommunityCommentRead,
    status_code=201,
    summary="Create Comment on Community Post (Creator)",
)
async def create_comment_creator(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityCommentCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityCommentRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)

    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = await community_service.create_comment(
        session,
        post=post,
        author_user_id=user_id,
        payload=payload,
    )
    serialized = await _serialize_comments(
        session,
        [comment],
        course_id=course_id,
        viewer_user_id=user_id,
    )
    return serialized[0]


@creator_router.post(
    "/{course_id}/posts/{post_id}/react",
    response_model=CommunityReactionToggleResult,
    summary="Toggle Reaction on Community Post (Creator)",
)
async def react_to_post_creator(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityReactionToggle,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityReactionToggleResult:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")
    active, count, reactions = await community_service.toggle_reaction(
        session,
        target_type="post",
        target_id=post.id,
        actor_user_id=user_id,
        emoji=payload.emoji,
    )
    return CommunityReactionToggleResult(
        emoji=payload.emoji, active=active, count=count, reactions=reactions
    )


@creator_router.post(
    "/{course_id}/posts/{post_id}/poll/vote",
    response_model=CommunityPollRead,
    summary="Vote on Community Post Poll (Creator)",
)
async def vote_poll_creator(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityPollVote,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPollRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    post = await community_service.vote_poll(
        session,
        course_id=course_id,
        post_id=post_id,
        option_id=payload.option_id,
        voter_user_id=user_id,
    )
    poll = community_service.build_poll_read(
        post.poll, viewer_enrollment_id=None, viewer_user_id=user_id
    )
    assert poll is not None
    return poll


@creator_router.post(
    "/{course_id}/comments/{comment_id}/react",
    response_model=CommunityReactionToggleResult,
    summary="Toggle Reaction on Community Comment (Creator)",
)
async def react_to_comment_creator(
    course_id: CourseID,
    comment_id: CommentID,
    payload: CommunityReactionToggle,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityReactionToggleResult:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    comment = await community_service.get_comment(session, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    post = await community_service.get_post(session, comment.post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    active, count, reactions = await community_service.toggle_reaction(
        session,
        target_type="comment",
        target_id=comment.id,
        actor_user_id=user_id,
        emoji=payload.emoji,
    )
    return CommunityReactionToggleResult(
        emoji=payload.emoji, active=active, count=count, reactions=reactions
    )


# Lightweight "who am I in this community" — used by the editor to seed
# the composer avatar + selfName without making the frontend stitch
# together user identity + course.instructor_name. Returns the same
# instructor display info that posts authored by this user surface.
@creator_router.get(
    "/{course_id}/me",
    response_model=CommunityAuthor,
    summary="Get Community Identity (Creator)",
)
async def get_self_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityAuthor:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    authors = await community_service.resolve_authors(
        session,
        course_id=course_id,
        enrollment_ids=set(),
        user_ids={user_id},
    )
    resolved = authors.get(("user", user_id))
    if resolved is None:
        return CommunityAuthorInstructor(user_id=user_id, name=None, avatar_url=None)
    return resolved


# ====================================================================
# CUSTOMER-PORTAL ROUTES — /v1/customer-portal/community/...
# ====================================================================


@customer_router.get(
    "/courses",
    response_model=list[CommunityCourseSummary],
    summary="List Communities Available to Customer",
)
async def list_customer_communities(
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityCourseSummary]:
    """Powers the /portal/community picker. Returns one entry per
    enrolled course with `community_enabled` flagged from
    community_settings, so the picker UI can filter to courses whose
    creator has actually turned the feed on."""
    customer_id = get_customer_id(auth_subject)
    rows = await community_service.list_customer_communities(
        session, customer_id=customer_id
    )
    return list(rows)


@customer_router.get(
    "/{course_id}/settings",
    response_model=CommunitySettingsRead,
    summary="Get Community Settings (Customer Portal)",
)
async def get_settings_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> CommunitySettingsRead:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    # Lazy-create the row so a student visiting before the creator
    # ever opened the editor tab sees `enabled=False` and the
    # "disabled" banner — not a 403 the frontend has no path for. The
    # row defaults to `enabled=False`, so this is a no-op from the
    # student's perspective until the creator flips the toggle.
    settings = await community_service.get_or_create_settings(session, course_id)
    return CommunitySettingsRead.model_validate(settings, from_attributes=True)


@customer_router.get(
    "/{course_id}/members",
    response_model=list[CommunityMemberRead],
    summary="List Community Members",
)
async def list_members_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityMemberRead]:
    """Members tab on the customer-portal community surface. Mirrors the
    creator endpoint but gates on enrollment + community-enabled, so a
    student visiting a disabled course can't list peers."""
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    members = await community_service.list_members(session, course_id=course_id)
    return list(members)


@customer_router.get(
    "/{course_id}/tags",
    response_model=list[CommunityTagRead],
    summary="List Community Tags",
)
async def list_tags_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityTagRead]:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    tags = await community_service.list_tags(session, course_id)
    return [CommunityTagRead.model_validate(t, from_attributes=True) for t in tags]


@customer_router.get(
    "/{course_id}/feed",
    response_model=ListResourceWithCursorPagination[CommunityPostRead],
    summary="List Community Feed (Customer Portal)",
)
async def list_feed_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
    sort: CommunityPostSortProperty = CommunityPostSortProperty.recent,
    module_id: UUID4 | None = Query(default=None),
    lesson_id: UUID4 | None = Query(default=None),
    tag_id: UUID4 | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> ListResourceWithCursorPagination[CommunityPostRead]:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    posts, has_next, ctx = await community_service.list_feed(
        session,
        course_id=course_id,
        sort=sort,
        module_id=module_id,
        lesson_id=lesson_id,
        tag_id=tag_id,
        cursor=cursor,
        limit=limit,
        viewer_enrollment_id=enrollment.id,
        viewer_user_id=None,
    )

    items = [
        _post_to_read(
            p,
            author=_author_for_post(p, ctx["authors"]),
            lesson_chip=ctx["lessons"].get(p.lesson_id) if p.lesson_id else None,
            reactions=ctx["reactions"].get(p.id, []),
            activity_id=ctx.get("activities", {}).get(p.id),
            activity_pin=_activity_pin_from_ctx(p, ctx),
            module_chip=_module_chip_from_ctx(p, ctx),
            poll=ctx.get("polls", {}).get(p.id),
            event=ctx.get("events", {}).get(p.id),
        )
        for p in posts
    ]
    return ListResourceWithCursorPagination.from_results(items, has_next_page=has_next)


@customer_router.post(
    "/{course_id}/media/mux-upload",
    response_model=CommunityPostVideoUploadResult,
    status_code=201,
    summary="Create Community Post Video Upload",
)
async def create_video_upload_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostVideoUploadResult:
    """Mint a Mux direct-upload URL for a video community post. The
    composer creates the upload, PUTs the file bytes to `upload_url`
    directly from the browser, then includes `upload_id` in the
    POST /posts payload as a media entry with media_type='video'.
    The Mux webhook handler in course/endpoints.py flips the media
    row from 'waiting' to 'ready' (with playback id + duration) once
    encoding completes."""
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    try:
        return await community_service.create_video_upload()
    except Exception as e:
        raise HTTPException(
            status_code=502, detail="Failed to create video upload"
        ) from e


@customer_router.post(
    "/{course_id}/media/upload",
    response_model=CommunityPostImageUploadResult,
    status_code=201,
    summary="Upload Community Post Image",
)
async def upload_post_image(
    course_id: CourseID,
    auth_subject: CommunityCustomerWrite,
    file: UploadFile = FastAPIFile(...),
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostImageUploadResult:
    """Server-proxied image upload for the composer. Students don't
    carry an org-write scope and so can't use the standard
    /v1/files/ presigned flow — the bytes go through the server,
    land in the community-post bucket, and a File row is created
    owned by the course's organization. The returned file_id is
    passed back in the POST /posts payload's `media[]`."""
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="File must be an image.",
        )

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image must be under 10 MB.",
        )

    return await community_service.upload_post_image(
        session,
        course_id=course_id,
        filename=file.filename or "image",
        data=data,
        mime_type=content_type,
    )


@customer_router.post(
    "/{course_id}/posts",
    response_model=CommunityPostRead,
    status_code=201,
    summary="Create Community Post",
)
async def create_post_customer(
    course_id: CourseID,
    payload: CommunityPostCreate,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPostRead:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    post = await community_service.create_post(
        session,
        course_id=course_id,
        author_enrollment_id=enrollment.id,
        payload=payload,
    )
    return await _render_single_post(
        session,
        post,
        viewer_enrollment_id=enrollment.id,
        viewer_user_id=None,
    )


@customer_router.delete(
    "/{course_id}/posts/{post_id}",
    status_code=204,
    summary="Delete Own Community Post",
)
async def delete_post_customer(
    course_id: CourseID,
    post_id: PostID,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")
    if not community_service.is_post_owner(
        post, enrollment_id=enrollment.id, user_id=None
    ):
        raise HTTPException(status_code=403, detail="Not your post")
    await community_service.soft_delete_post(session, post)


@customer_router.get(
    "/{course_id}/posts/{post_id}/comments",
    response_model=list[CommunityCommentRead],
    summary="List Community Post Comments",
)
async def list_comments_customer(
    course_id: CourseID,
    post_id: PostID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityCommentRead]:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")

    comments = await community_service.list_comments(session, post=post)
    return await _serialize_comments(
        session,
        comments,
        course_id=course_id,
        viewer_enrollment_id=enrollment.id,
    )


@customer_router.post(
    "/{course_id}/posts/{post_id}/comments",
    response_model=CommunityCommentRead,
    status_code=201,
    summary="Create Comment on Community Post",
)
async def create_comment_customer(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityCommentCreate,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityCommentRead:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = await community_service.create_comment(
        session,
        post=post,
        author_enrollment_id=enrollment.id,
        payload=payload,
    )
    serialized = await _serialize_comments(
        session,
        [comment],
        course_id=course_id,
        viewer_enrollment_id=enrollment.id,
    )
    return serialized[0]


@customer_router.delete(
    "/{course_id}/comments/{comment_id}",
    status_code=204,
    summary="Delete Own Comment",
)
async def delete_comment_customer(
    course_id: CourseID,
    comment_id: CommentID,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    comment = await community_service.get_comment(session, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    post = await community_service.get_post(session, comment.post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not community_service.is_comment_owner(
        comment, enrollment_id=enrollment.id, user_id=None
    ):
        raise HTTPException(status_code=403, detail="Not your comment")
    await community_service.soft_delete_comment(session, comment=comment)


@customer_router.post(
    "/{course_id}/posts/{post_id}/react",
    response_model=CommunityReactionToggleResult,
    summary="Toggle Reaction on Community Post",
)
async def react_to_post_customer(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityReactionToggle,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityReactionToggleResult:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    settings = await community_service.assert_community_enabled(session, course_id)
    if not settings.reactions_enabled:
        raise HTTPException(status_code=403, detail="Reactions are disabled")

    post = await community_service.get_post(session, post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Post not found")

    active, count, reactions = await community_service.toggle_reaction(
        session,
        target_type="post",
        target_id=post.id,
        actor_enrollment_id=enrollment.id,
        emoji=payload.emoji,
    )
    return CommunityReactionToggleResult(
        emoji=payload.emoji, active=active, count=count, reactions=reactions
    )


@customer_router.post(
    "/{course_id}/posts/{post_id}/poll/vote",
    response_model=CommunityPollRead,
    summary="Vote on Community Post Poll",
)
async def vote_poll_customer(
    course_id: CourseID,
    post_id: PostID,
    payload: CommunityPollVote,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityPollRead:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    post = await community_service.vote_poll(
        session,
        course_id=course_id,
        post_id=post_id,
        option_id=payload.option_id,
        voter_enrollment_id=enrollment.id,
    )
    poll = community_service.build_poll_read(
        post.poll, viewer_enrollment_id=enrollment.id, viewer_user_id=None
    )
    assert poll is not None
    return poll


@customer_router.post(
    "/{course_id}/comments/{comment_id}/react",
    response_model=CommunityReactionToggleResult,
    summary="Toggle Reaction on Community Comment",
)
async def react_to_comment_customer(
    course_id: CourseID,
    comment_id: CommentID,
    payload: CommunityReactionToggle,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityReactionToggleResult:
    customer_id = get_customer_id(auth_subject)
    enrollment = await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    settings = await community_service.assert_community_enabled(session, course_id)
    if not settings.reactions_enabled:
        raise HTTPException(status_code=403, detail="Reactions are disabled")

    comment = await community_service.get_comment(session, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    post = await community_service.get_post(session, comment.post_id)
    if post is None or post.course_id != course_id:
        raise HTTPException(status_code=404, detail="Comment not found")

    active, count, reactions = await community_service.toggle_reaction(
        session,
        target_type="comment",
        target_id=comment.id,
        actor_enrollment_id=enrollment.id,
        emoji=payload.emoji,
    )
    return CommunityReactionToggleResult(
        emoji=payload.emoji, active=active, count=count, reactions=reactions
    )


# ---------------------------------------------------------------------
# Comment serialization helper (used by list + create)
# ---------------------------------------------------------------------


async def _serialize_comments(
    session: AsyncSession,
    comments: Iterable[CommunityComment],
    *,
    course_id: UUID | None = None,
    viewer_enrollment_id: UUID | None = None,
    viewer_user_id: UUID | None = None,
) -> list[CommunityCommentRead]:
    comments = list(comments)
    if not comments:
        return []

    enrollment_ids = {
        c.author_enrollment_id for c in comments if c.author_enrollment_id
    }
    user_ids = {c.author_user_id for c in comments if c.author_user_id}
    # Pass course_id so resolve_authors can overlay course.instructor_name
    # on instructor comment authors. Falls back to the comment's own
    # post.course_id when the caller didn't thread it through.
    overlay_course_id = course_id
    if overlay_course_id is None:
        for c in comments:
            if hasattr(c, "post") and c.post is not None:
                overlay_course_id = c.post.course_id
                break
    authors = await community_service.resolve_authors(
        session,
        course_id=overlay_course_id,
        enrollment_ids=enrollment_ids,
        user_ids=user_ids,
    )

    # Bulk-load reactions for every comment in this batch. Soft-deleted
    # rows still get their reaction row queried — cheap and means the
    # tombstone shows the same surface as the live comment.
    comment_reactions = await community_service.resolve_comment_reactions(
        session,
        comment_ids={c.id for c in comments},
        viewer_enrollment_id=viewer_enrollment_id,
        viewer_user_id=viewer_user_id,
    )

    out: list[CommunityCommentRead] = []
    for c in comments:
        is_deleted = c.deleted_at is not None
        own = False
        if viewer_enrollment_id is not None:
            own = c.author_enrollment_id == viewer_enrollment_id and not is_deleted
        elif viewer_user_id is not None:
            own = c.author_user_id == viewer_user_id and not is_deleted
        out.append(
            CommunityCommentRead(
                id=c.id,
                post_id=c.post_id,
                parent_id=c.parent_id,
                author=_author_for_comment(c, authors),
                # Soft-deleted comments come back as tombstones — strip
                # the body so the deleted message itself isn't surfaced.
                content="" if is_deleted else c.content,
                timestamp_seconds=c.timestamp_seconds,
                deleted=is_deleted,
                is_own=own,
                reactions=comment_reactions.get(c.id, []),
                created_at=c.created_at,
                modified_at=c.modified_at,
            )
        )
    return out
