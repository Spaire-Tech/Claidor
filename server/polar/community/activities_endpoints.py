"""HTTP routes for community activities + submissions.

Two surfaces, mounted into the existing community routers (see
events_endpoints.py for the same pattern):

  /v1/community/{course_id}/activities                (host)
  /v1/customer-portal/community/{course_id}/activities (student)

The submission media pipeline (photo file uploads + Mux video uploads)
is reused from the existing /media routes — clients call those first to
get a file_id or mux_upload_id, then POST the submission with that ref.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import UUID4
from sqlalchemy import select

from polar.auth.models import is_user
from polar.course.repository import CourseRepository
from polar.customer_portal.utils import get_customer_id
from polar.file.s3 import S3_SERVICES
from polar.models.community_activity import CommunityActivity
from polar.models.community_activity_submission import CommunityActivitySubmission
from polar.models.course_lesson import CourseLesson
from polar.models.course_module import CourseModule
from polar.models.customer import Customer
from polar.models.file import File, FileServiceTypes
from polar.models.user import User
from polar.postgres import AsyncSession, get_db_session

from .activities_repository import (
    CommunityActivityRepository,
    CommunityActivitySubmissionRepository,
)
from .activities_schemas import (
    CommunityActivityCreate,
    CommunityActivityHost,
    CommunityActivityRead,
    CommunityActivitySubmissionCommentAuthor,
    CommunityActivitySubmissionCommentCreate,
    CommunityActivitySubmissionCommentRead,
    CommunityActivitySubmissionCreate,
    CommunityActivitySubmissionRead,
    CommunityActivityUpdate,
)
from .activities_service import (
    ActivityChannelInvalid,
    ActivityClosed,
    ActivityHostMismatch,
    ActivityNotFound,
    ActivitySubmissionInvalid,
    activities_service,
)
from .auth import (
    CommunityCreatorRead,
    CommunityCreatorWrite,
    CommunityCustomerRead,
    CommunityCustomerWrite,
)
from .endpoints import creator_router, customer_router
from .service import community as community_service

CourseID = Annotated[UUID4, ...]
ActivityID = Annotated[UUID4, ...]


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _require_user_subject(auth_subject) -> UUID:
    if not is_user(auth_subject):
        raise HTTPException(
            status_code=403,
            detail="Only user-authenticated sessions can host activities.",
        )
    return auth_subject.subject.id


async def _require_creator_owns_course(
    session: AsyncSession, course_id: UUID, auth_subject
) -> None:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")


async def _resolve_channel_label(
    session: AsyncSession, activity: CommunityActivity
) -> str | None:
    """Single-activity channel-label lookup. Use the repository's
    `bulk_load_channel_labels` for list endpoints to avoid N+1."""
    if activity.channel_kind == "module" and activity.module_id:
        row = await session.get(CourseModule, activity.module_id)
        return row.title if row else None
    if activity.channel_kind == "lesson" and activity.lesson_id:
        row = await session.get(CourseLesson, activity.lesson_id)
        return row.title if row else None
    return None


def _host_from_user(
    user: User | None, instructor_name: str | None
) -> CommunityActivityHost:
    if user is None:
        return CommunityActivityHost(
            user_id=UUID(int=0), name=instructor_name or "Instructor"
        )
    name = (
        (instructor_name or "").strip()
        or (getattr(user, "public_name", None) or "").strip()
        or getattr(user, "username", None)
        or getattr(user, "email", None)
        or "Instructor"
    )
    return CommunityActivityHost(
        user_id=user.id,
        name=name,
        avatar_url=getattr(user, "avatar_url", None),
    )


async def _activity_to_read(
    session: AsyncSession,
    activity: CommunityActivity,
    *,
    instructor_name: str | None,
    distinct_submitters: int,
    has_own: bool,
    hosts_cache: dict[UUID, User] | None = None,
    channel_labels: dict[UUID, str | None] | None = None,
) -> CommunityActivityRead:
    host_user: User | None
    if hosts_cache is not None:
        host_user = hosts_cache.get(activity.host_user_id)
    else:
        host_user = await session.get(User, activity.host_user_id)
    if channel_labels is not None:
        channel_label = channel_labels.get(activity.id)
    else:
        channel_label = await _resolve_channel_label(session, activity)
    return CommunityActivityRead(
        id=activity.id,
        course_id=activity.course_id,
        channel_kind=activity.channel_kind,  # type: ignore[arg-type]
        module_id=activity.module_id,
        lesson_id=activity.lesson_id,
        channel_label=channel_label,
        title=activity.title,
        description=activity.description,
        cover_url=activity.cover_url,
        cover_object_position=activity.cover_object_position,
        submission_type=activity.submission_type,  # type: ignore[arg-type]
        status=activity.status,  # type: ignore[arg-type]
        pin_to_feed=activity.pin_to_feed,
        notify_on_publish=activity.notify_on_publish,
        submission_count=activity.submission_count,
        distinct_submitter_count=distinct_submitters,
        host=_host_from_user(host_user, instructor_name),
        has_own_submission=has_own,
        created_at=activity.created_at,
        modified_at=activity.modified_at,
    )


async def _submission_to_read(
    session: AsyncSession,
    submission: CommunityActivitySubmission,
    *,
    viewer_customer_id: UUID | None,
    authors_cache: dict[UUID, Customer] | None = None,
) -> CommunityActivitySubmissionRead:
    if authors_cache is not None:
        customer = authors_cache.get(submission.customer_id)
    else:
        customer = await session.get(Customer, submission.customer_id)
    author_name = (
        (getattr(customer, "name", None) or "").strip()
        or (getattr(customer, "email", None) or "Member")
    )
    avatar = getattr(customer, "avatar_url", None) if customer else None

    file_url: str | None = None
    if submission.file_id:
        f = await session.get(File, submission.file_id)
        if f is not None:
            try:
                s3 = S3_SERVICES[FileServiceTypes.community_post_image]
                file_url = s3.get_public_url(f.path)  # type: ignore[attr-defined]
            except Exception:
                file_url = None

    return CommunityActivitySubmissionRead(
        id=submission.id,
        activity_id=submission.activity_id,
        submission_type=submission.submission_type,  # type: ignore[arg-type]
        body=submission.body,
        file_id=submission.file_id,
        file_url=file_url,
        mux_playback_id=submission.mux_playback_id,
        mux_status=submission.mux_status,
        link_url=submission.link_url,
        image_object_position=submission.image_object_position,
        visibility=submission.visibility,  # type: ignore[arg-type]
        author_name=author_name,
        author_avatar_url=avatar,
        is_own=(
            viewer_customer_id is not None
            and submission.customer_id == viewer_customer_id
        ),
        created_at=submission.created_at,
        modified_at=submission.modified_at,
    )


# ====================================================================
# CREATOR ROUTES — /v1/community/{course_id}/activities/...
# ====================================================================


@creator_router.get(
    "/{course_id}/activities",
    response_model=list[CommunityActivityRead],
    summary="List Community Activities (Creator)",
)
async def list_activities_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityActivityRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    instructor_name = course.instructor_name if course else None

    activities = await activities_service.list_for_course(
        session, course_id=course_id
    )
    sub_repo = CommunityActivitySubmissionRepository.from_session(session)
    counts = await sub_repo.distinct_submitter_counts([a.id for a in activities])
    act_repo = CommunityActivityRepository.from_session(session)
    hosts = await act_repo.bulk_load_hosts({a.host_user_id for a in activities})
    channel_labels = await act_repo.bulk_load_channel_labels(activities)

    return [
        await _activity_to_read(
            session,
            a,
            instructor_name=instructor_name,
            distinct_submitters=counts.get(a.id, 0),
            has_own=False,
            hosts_cache=hosts,
            channel_labels=channel_labels,
        )
        for a in activities
    ]


@creator_router.post(
    "/{course_id}/activities",
    response_model=CommunityActivityRead,
    status_code=201,
    summary="Create Community Activity",
)
async def create_activity_creator(
    course_id: CourseID,
    payload: CommunityActivityCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityActivityRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        activity = await activities_service.create(
            session,
            course_id=course_id,
            host_user_id=user_id,
            payload=payload,
        )
    except ActivityChannelInvalid:
        raise HTTPException(
            status_code=400,
            detail="channel_kind must agree with module_id/lesson_id.",
        ) from None
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    return await _activity_to_read(
        session,
        activity,
        instructor_name=course.instructor_name if course else None,
        distinct_submitters=0,
        has_own=False,
    )


@creator_router.patch(
    "/{course_id}/activities/{activity_id}",
    response_model=CommunityActivityRead,
    summary="Update Community Activity",
)
async def update_activity_creator(
    course_id: CourseID,
    activity_id: ActivityID,
    payload: CommunityActivityUpdate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityActivityRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        activity = await activities_service.update(
            session,
            activity_id=activity_id,
            course_id=course_id,
            host_user_id=user_id,
            payload=payload,
        )
    except ActivityNotFound:
        raise HTTPException(status_code=404, detail="Activity not found") from None
    except ActivityHostMismatch:
        raise HTTPException(
            status_code=403, detail="Only the host can edit this activity."
        ) from None
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    sub_repo = CommunityActivitySubmissionRepository.from_session(session)
    distinct = await sub_repo.distinct_submitter_count(activity.id)
    return await _activity_to_read(
        session,
        activity,
        instructor_name=course.instructor_name if course else None,
        distinct_submitters=distinct,
        has_own=False,
    )


@creator_router.delete(
    "/{course_id}/activities/{activity_id}",
    status_code=204,
    summary="Delete Community Activity",
)
async def delete_activity_creator(
    course_id: CourseID,
    activity_id: ActivityID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        await activities_service.delete(
            session,
            activity_id=activity_id,
            course_id=course_id,
            host_user_id=user_id,
        )
    except ActivityNotFound:
        raise HTTPException(status_code=404, detail="Activity not found") from None
    except ActivityHostMismatch:
        raise HTTPException(
            status_code=403, detail="Only the host can delete this activity."
        ) from None


@creator_router.get(
    "/{course_id}/activities/{activity_id}/submissions",
    response_model=list[CommunityActivitySubmissionRead],
    summary="List Submissions for Activity (Creator)",
)
async def list_submissions_creator(
    course_id: CourseID,
    activity_id: ActivityID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityActivitySubmissionRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    try:
        await activities_service.get(
            session, activity_id=activity_id, course_id=course_id
        )
    except ActivityNotFound:
        raise HTTPException(status_code=404, detail="Activity not found") from None
    sub_repo = CommunityActivitySubmissionRepository.from_session(session)
    rows = await sub_repo.list_for_activity(activity_id)
    authors = await sub_repo.bulk_load_authors({s.customer_id for s in rows})
    return [
        await _submission_to_read(
            session, s, viewer_customer_id=None, authors_cache=authors
        )
        for s in rows
    ]


# ====================================================================
# CUSTOMER ROUTES — /v1/customer-portal/community/{course_id}/activities/...
# ====================================================================


@customer_router.get(
    "/{course_id}/activities",
    response_model=list[CommunityActivityRead],
    summary="List Community Activities (Customer Portal)",
)
async def list_activities_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityActivityRead]:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)

    activities = await activities_service.list_for_course(
        session, course_id=course_id
    )
    sub_repo = CommunityActivitySubmissionRepository.from_session(session)
    ids = [a.id for a in activities]
    distinct_map = await sub_repo.distinct_submitter_counts(ids)
    own_ids = await sub_repo.activity_ids_with_own_submission(ids, customer_id)
    act_repo = CommunityActivityRepository.from_session(session)
    hosts = await act_repo.bulk_load_hosts({a.host_user_id for a in activities})
    channel_labels = await act_repo.bulk_load_channel_labels(activities)

    return [
        await _activity_to_read(
            session,
            a,
            instructor_name=course.instructor_name if course else None,
            distinct_submitters=distinct_map.get(a.id, 0),
            has_own=a.id in own_ids,
            hosts_cache=hosts,
            channel_labels=channel_labels,
        )
        for a in activities
    ]


@customer_router.get(
    "/{course_id}/activities/{activity_id}/submissions",
    response_model=list[CommunityActivitySubmissionRead],
    summary="List Submissions for Activity (Customer Portal)",
)
async def list_submissions_customer(
    course_id: CourseID,
    activity_id: ActivityID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityActivitySubmissionRead]:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    try:
        await activities_service.get(
            session, activity_id=activity_id, course_id=course_id
        )
    except ActivityNotFound:
        raise HTTPException(status_code=404, detail="Activity not found") from None
    sub_repo = CommunityActivitySubmissionRepository.from_session(session)
    rows = await sub_repo.list_for_activity_for_customer(
        activity_id, customer_id
    )
    authors = await sub_repo.bulk_load_authors({s.customer_id for s in rows})
    return [
        await _submission_to_read(
            session,
            s,
            viewer_customer_id=customer_id,
            authors_cache=authors,
        )
        for s in rows
    ]


@customer_router.post(
    "/{course_id}/activities/{activity_id}/submissions",
    response_model=CommunityActivitySubmissionRead,
    status_code=201,
    summary="Submit to Community Activity",
)
async def submit_activity_customer(
    course_id: CourseID,
    activity_id: ActivityID,
    payload: CommunityActivitySubmissionCreate,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityActivitySubmissionRead:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    try:
        submission = await activities_service.submit(
            session,
            activity_id=activity_id,
            course_id=course_id,
            customer_id=customer_id,
            payload=payload,
        )
    except ActivityNotFound:
        raise HTTPException(status_code=404, detail="Activity not found") from None
    except ActivityClosed:
        raise HTTPException(
            status_code=409, detail="This activity is closed."
        ) from None
    except ActivitySubmissionInvalid:
        raise HTTPException(
            status_code=400, detail="Submission payload is invalid."
        ) from None
    return await _submission_to_read(
        session, submission, viewer_customer_id=customer_id
    )


# ====================================================================
# SUBMISSION COMMENTS — shared serializer + creator/customer routes
# ====================================================================


async def _comment_to_read(
    session: AsyncSession,
    comment,  # CommunityActivitySubmissionComment
    *,
    viewer_user_id: UUID | None,
    viewer_enrollment_id: UUID | None,
    instructor_name: str | None,
) -> CommunityActivitySubmissionCommentRead:
    """Resolve the author identity for a submission comment.

    No bulk-load helper yet — thread depth is bounded (the modal renders
    a single submission's comments at a time, typically <20 rows), so a
    per-row session.get is acceptable. Promote to a bulk-load if the
    typical thread length grows."""
    from polar.models.course_enrollment import CourseEnrollment

    author: CommunityActivitySubmissionCommentAuthor
    is_own = False
    if comment.author_user_id is not None:
        user = await session.get(User, comment.author_user_id)
        name = (
            (instructor_name or "").strip()
            or (getattr(user, "public_name", None) or "").strip()
            or getattr(user, "username", None)
            or getattr(user, "email", None)
            or "Instructor"
        )
        author = CommunityActivitySubmissionCommentAuthor(
            kind="instructor",
            name=name,
            avatar_url=getattr(user, "avatar_url", None) if user else None,
        )
        if viewer_user_id is not None and viewer_user_id == comment.author_user_id:
            is_own = True
    else:
        enr = (
            await session.get(CourseEnrollment, comment.author_enrollment_id)
            if comment.author_enrollment_id is not None
            else None
        )
        cust = (
            await session.get(Customer, enr.customer_id) if enr is not None else None
        )
        name = (
            (getattr(cust, "name", None) or "").strip()
            or (getattr(cust, "email", None) or "Member")
        )
        author = CommunityActivitySubmissionCommentAuthor(
            kind="student",
            name=name,
            avatar_url=getattr(cust, "avatar_url", None) if cust else None,
        )
        if (
            viewer_enrollment_id is not None
            and comment.author_enrollment_id == viewer_enrollment_id
        ):
            is_own = True

    return CommunityActivitySubmissionCommentRead(
        id=comment.id,
        submission_id=comment.submission_id,
        body=comment.body,
        author=author,
        is_own=is_own,
        created_at=comment.created_at,
        modified_at=comment.modified_at,
    )


SubmissionID = Annotated[UUID4, ...]


async def _assert_submission_in_course(
    session: AsyncSession,
    *,
    submission_id: UUID,
    activity_id: UUID,
    course_id: UUID,
):
    """Verify the (submission, activity, course) chain so a comment write
    can't address a submission that doesn't actually belong to the
    course on the path."""
    try:
        activity = await activities_service.get(
            session, activity_id=activity_id, course_id=course_id
        )
    except ActivityNotFound:
        raise HTTPException(status_code=404, detail="Activity not found") from None
    sub_repo = CommunityActivitySubmissionRepository.from_session(session)
    submission = await sub_repo.get_by_id(submission_id)
    if submission is None or submission.activity_id != activity.id:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


@creator_router.get(
    "/{course_id}/activities/{activity_id}/submissions/{submission_id}/comments",
    response_model=list[CommunityActivitySubmissionCommentRead],
    summary="List Submission Comments (Creator)",
)
async def list_submission_comments_creator(
    course_id: CourseID,
    activity_id: ActivityID,
    submission_id: SubmissionID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityActivitySubmissionCommentRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    await _assert_submission_in_course(
        session,
        submission_id=submission_id,
        activity_id=activity_id,
        course_id=course_id,
    )
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    instructor_name = course.instructor_name if course else None
    viewer_user_id = (
        auth_subject.subject.id if is_user(auth_subject) else None
    )
    rows = await activities_service.list_submission_comments(
        session, submission_id=submission_id
    )
    return [
        await _comment_to_read(
            session,
            c,
            viewer_user_id=viewer_user_id,
            viewer_enrollment_id=None,
            instructor_name=instructor_name,
        )
        for c in rows
    ]


@creator_router.post(
    "/{course_id}/activities/{activity_id}/submissions/{submission_id}/comments",
    response_model=CommunityActivitySubmissionCommentRead,
    status_code=201,
    summary="Comment on a Submission (Creator)",
)
async def create_submission_comment_creator(
    course_id: CourseID,
    activity_id: ActivityID,
    submission_id: SubmissionID,
    payload: CommunityActivitySubmissionCommentCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityActivitySubmissionCommentRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    await _assert_submission_in_course(
        session,
        submission_id=submission_id,
        activity_id=activity_id,
        course_id=course_id,
    )
    comment = await activities_service.create_submission_comment(
        session,
        submission_id=submission_id,
        payload=payload,
        author_user_id=user_id,
    )
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    return await _comment_to_read(
        session,
        comment,
        viewer_user_id=user_id,
        viewer_enrollment_id=None,
        instructor_name=course.instructor_name if course else None,
    )


@customer_router.get(
    "/{course_id}/activities/{activity_id}/submissions/{submission_id}/comments",
    response_model=list[CommunityActivitySubmissionCommentRead],
    summary="List Submission Comments (Customer Portal)",
)
async def list_submission_comments_customer(
    course_id: CourseID,
    activity_id: ActivityID,
    submission_id: SubmissionID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityActivitySubmissionCommentRead]:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    submission = await _assert_submission_in_course(
        session,
        submission_id=submission_id,
        activity_id=activity_id,
        course_id=course_id,
    )
    # Hide threads under instr-only submissions from peer customers.
    if (
        submission.visibility == "instr"
        and submission.customer_id != customer_id
    ):
        raise HTTPException(status_code=404, detail="Submission not found")

    from polar.course.repository import CourseEnrollmentRepository

    enrollment = await CourseEnrollmentRepository.from_session(
        session
    ).get_active_for_customer_course(customer_id, course_id)
    viewer_enrollment_id = enrollment.id if enrollment else None
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    rows = await activities_service.list_submission_comments(
        session, submission_id=submission_id
    )
    return [
        await _comment_to_read(
            session,
            c,
            viewer_user_id=None,
            viewer_enrollment_id=viewer_enrollment_id,
            instructor_name=course.instructor_name if course else None,
        )
        for c in rows
    ]


@customer_router.post(
    "/{course_id}/activities/{activity_id}/submissions/{submission_id}/comments",
    response_model=CommunityActivitySubmissionCommentRead,
    status_code=201,
    summary="Comment on a Submission (Customer Portal)",
)
async def create_submission_comment_customer(
    course_id: CourseID,
    activity_id: ActivityID,
    submission_id: SubmissionID,
    payload: CommunityActivitySubmissionCommentCreate,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityActivitySubmissionCommentRead:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    submission = await _assert_submission_in_course(
        session,
        submission_id=submission_id,
        activity_id=activity_id,
        course_id=course_id,
    )
    # Same visibility gate as the read path — a peer can't reply under
    # an instructor-only submission they shouldn't be able to see.
    if (
        submission.visibility == "instr"
        and submission.customer_id != customer_id
    ):
        raise HTTPException(status_code=404, detail="Submission not found")

    from polar.course.repository import CourseEnrollmentRepository

    enrollment = await CourseEnrollmentRepository.from_session(
        session
    ).get_active_for_customer_course(customer_id, course_id)
    if enrollment is None:
        raise HTTPException(status_code=403, detail="Not enrolled in this course.")
    comment = await activities_service.create_submission_comment(
        session,
        submission_id=submission_id,
        payload=payload,
        author_enrollment_id=enrollment.id,
    )
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    return await _comment_to_read(
        session,
        comment,
        viewer_user_id=None,
        viewer_enrollment_id=enrollment.id,
        instructor_name=course.instructor_name if course else None,
    )


# Silence unused-import helper.
_ = select
