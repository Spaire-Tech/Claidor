import hashlib
import json
import logging
from uuid import UUID, uuid4

from fastapi import Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select

from polar.auth.models import is_organization, is_user
from polar.customer.repository import CustomerRepository
from polar.customer_session.service import customer_session
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.models import Organization, UserOrganization
from polar.models.community_activity_submission import CommunityActivitySubmission
from polar.models.community_post_media import CommunityPostMedia
from polar.models.course_lesson import CourseLesson
from polar.models.customer import Customer
from polar.openapi import APITag
from polar.organization.repository import OrganizationRepository
from polar.postgres import AsyncSession, get_db_session
from polar.quotas.definitions import QuotaKey
from polar.quotas.exceptions import QuotaExceededError
from polar.quotas.producers import emit_video_uploaded, enforce
from polar.routing import APIRouter

from . import auth
from . import mux as mux_client
from .repository import (
    CourseLessonRepository,
    CourseModuleRepository,
    CourseRepository,
)
from .schemas import (
    CourseCreate,
    CourseEnrollmentCustomer,
    CourseEnrollmentProgress,
    CourseEnrollmentRead,
    CourseLessonCreate,
    CourseLessonRead,
    CourseLessonThumbnailFromVideo,
    CourseLessonUpdate,
    CourseModuleCreate,
    CourseModuleRead,
    CourseModuleUpdate,
    CourseRead,
    CourseUpdate,
    LessonAiRewriteRequest,
    MuxUploadRead,
    ReorderRequest,
)
from .service import course_service

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/courses",
    tags=["courses", APITag.private],
)

# Conservative projected duration used when reserving quota at upload-
# initiate time. Mux returns the real duration in the webhook later;
# this number is just a guard against "upload-initiate always passes
# because we passed requested_storage_units=0". 10 minutes sits at the
# 95th percentile of lesson length we see in practice.
_ESTIMATED_LESSON_SECONDS = 600


def _lesson_read(lesson) -> CourseLessonRead:
    return CourseLessonRead(
        id=lesson.id,
        module_id=lesson.module_id,
        title=lesson.title,
        content_type=lesson.content_type,
        content=lesson.content,
        video_asset_id=lesson.video_asset_id,
        duration_seconds=lesson.duration_seconds,
        position=lesson.position,
        is_free_preview=lesson.is_free_preview,
        published=lesson.published,
        mux_upload_id=lesson.mux_upload_id,
        mux_asset_id=lesson.mux_asset_id,
        mux_playback_id=lesson.mux_playback_id,
        # Signed HLS URL (falls back to the public URL when signing keys
        # aren't configured). Dashboard reads are creator-authenticated, so
        # inlining it is safe — without it the editor's own Play button and
        # sample-clip preview 403 the moment signed playback is enabled.
        mux_playback_url=mux_client.playback_url(lesson.mux_playback_id),
        mux_storyboard_url=mux_client.storyboard_url(lesson.mux_playback_id),
        mux_status=lesson.mux_status,
        transcript_status=getattr(lesson, "transcript_status", None),
        ai_autofill_status=getattr(lesson, "ai_autofill_status", None),
        thumbnail_url=lesson.thumbnail_url,
        description=getattr(lesson, "description", None),
        release_at=getattr(lesson, "release_at", None),
        drip_days=getattr(lesson, "drip_days", None),
        comments_mode=getattr(lesson, "comments_mode", "visible"),
        thumbnail_object_position=getattr(lesson, "thumbnail_object_position", None),
        created_at=lesson.created_at,
        modified_at=lesson.modified_at,
    )


def _module_read(module) -> CourseModuleRead:
    return CourseModuleRead(
        id=module.id,
        course_id=module.course_id,
        title=module.title,
        description=module.description,
        position=module.position,
        status=module.status,
        release_at=module.release_at,
        drip_days=module.drip_days,
        is_bonus=bool(getattr(module, "is_bonus", False)),
        lessons=[_lesson_read(lesson) for lesson in module.lessons],
        created_at=module.created_at,
        modified_at=module.modified_at,
    )


def _course_read(course) -> CourseRead:
    return CourseRead(
        id=course.id,
        product_id=course.product_id,
        organization_id=course.organization_id,
        title=course.title,
        slug=course.slug,
        course_type=course.course_type,
        format=course.format,
        paywall_enabled=course.paywall_enabled,
        paywall_lesson_id=course.paywall_lesson_id,
        paywall_position=course.paywall_position,
        ai_generated=course.ai_generated,
        hero_variant=getattr(course, "hero_variant", "cover"),
        lesson_card_variant=getattr(course, "lesson_card_variant", "catalog"),
        trial_mode=getattr(course, "trial_mode", "free_preview"),
        description=course.description,
        thumbnail_url=course.thumbnail_url,
        thumbnail_object_position=course.thumbnail_object_position,
        instructor_name=course.instructor_name,
        instructor_bio=course.instructor_bio,
        trailer_url=course.trailer_url,
        instructor_name_italic=course.instructor_name_italic,
        instructor_name_bold=course.instructor_name_bold,
        instructor_name_uppercase=course.instructor_name_uppercase,
        landing_overrides=course.landing_overrides,
        sample=course.sample,
        modules=[_module_read(m) for m in course.modules],
        created_at=course.created_at,
        modified_at=course.modified_at,
    )


async def _user_in_org(
    session: AsyncSession, user_id: UUID, organization_id: UUID
) -> bool:
    stmt = select(UserOrganization).where(
        UserOrganization.user_id == user_id,
        UserOrganization.organization_id == organization_id,
        UserOrganization.deleted_at.is_(None),
    )
    res = await session.execute(stmt)
    return res.first() is not None


@router.get("/organization/{organization_id}", response_model=list[CourseRead])
async def list_courses_by_organization(
    organization_id: UUID,
    auth_subject: auth.CoursesRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CourseRead]:
    if is_organization(auth_subject):
        if auth_subject.subject.id != organization_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif is_user(auth_subject):
        if not await _user_in_org(session, auth_subject.subject.id, organization_id):
            raise HTTPException(status_code=403, detail="Forbidden")
    courses = await course_service.list_by_organization(session, organization_id)
    result = []
    for c in courses:
        try:
            result.append(_course_read(c))
        except Exception:
            log.exception(
                "course.list serialize failed",
                extra={"course_id": str(c.id)},
            )
            # Skip this course rather than 500 the entire list
            continue
    return result


@router.get("/product/{product_id}", response_model=CourseRead)
async def get_course_by_product(
    product_id: UUID,
    auth_subject: auth.CoursesRead,
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    course = await course_service.get_by_product(session, product_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    repo = CourseRepository.from_session(session)
    if await repo.get_readable_by_id(course.id, auth_subject) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return _course_read(course)


@router.get("/{course_id}", response_model=CourseRead)
async def get_course(
    course_id: UUID,
    auth_subject: auth.CoursesRead,
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return _course_read(course)


@router.post("/", response_model=CourseRead, status_code=201)
async def create_course(
    course_create: CourseCreate,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    if is_organization(auth_subject):
        if auth_subject.subject.id != course_create.organization_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif is_user(auth_subject):
        if not await _user_in_org(
            session, auth_subject.subject.id, course_create.organization_id
        ):
            raise HTTPException(status_code=403, detail="Forbidden")
    try:
        course = await course_service.create(session, course_create)
        return _course_read(course)
    except Exception:
        log.exception(
            "course.create failed",
            extra={
                "product_id": str(course_create.product_id),
                "organization_id": str(course_create.organization_id),
                "module_count": len(course_create.modules),
            },
        )
        raise


@router.patch("/{course_id}", response_model=CourseRead)
async def update_course(
    course_id: UUID,
    course_update: CourseUpdate,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if course_update.landing_overrides is not None:
        media = course_update.landing_overrides.get("media") or {}
        log.info(
            "course.update landing_overrides.media",
            extra={
                "course_id": str(course_id),
                "media_slot_ids": sorted(media.keys()),
                "media_count": len(media),
            },
        )
    course = await course_service.update(session, course, course_update)
    return _course_read(course)


# Limited series (format='series') are a single invisible season, complete at
# launch. The editor hides season and scheduling controls for them; these
# guards make the invariant real for any client.
_LIMITED_SERIES_SEASON_DETAIL = (
    "A limited series has a single season; seasons can't be added or removed."
)
_LIMITED_SERIES_SCHEDULE_DETAIL = (
    "A limited series is complete at launch; release scheduling is only "
    "available on season-format courses."
)


async def _series_course_for_module(session: AsyncSession, course_id: UUID) -> bool:
    """True when the module's parent course is a limited series."""
    repo = CourseRepository.from_session(session)
    course = await repo.get_by_id(course_id)
    return course is not None and course.format == "series"


@router.post("/{course_id}/modules", response_model=CourseModuleRead, status_code=201)
async def add_module(
    course_id: UUID,
    module_create: CourseModuleCreate,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseModuleRead:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.format == "series":
        # The single season container may still be bootstrapped (the editor
        # creates it on the first "Add episode"), but never a second one —
        # and never with a release schedule.
        if module_create.release_at is not None or module_create.drip_days is not None:
            raise HTTPException(status_code=400, detail=_LIMITED_SERIES_SCHEDULE_DETAIL)
        module_repo = CourseModuleRepository.from_session(session)
        existing = await module_repo.count(
            module_repo.get_by_course_statement(course_id)
        )
        if existing >= 1:
            raise HTTPException(status_code=400, detail=_LIMITED_SERIES_SEASON_DETAIL)
    module = await course_service.add_module(session, course, module_create)
    return _module_read(module)


@router.patch("/modules/{module_id}", response_model=CourseModuleRead)
async def update_module(
    module_id: UUID,
    module_update: CourseModuleUpdate,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseModuleRead:
    module_repo = CourseModuleRepository.from_session(session)
    module = await module_repo.get_readable_by_id(module_id, auth_subject)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    changes = module_update.model_dump(exclude_unset=True)
    if (
        changes.get("release_at") is not None or changes.get("drip_days") is not None
    ) and await _series_course_for_module(session, module.course_id):
        raise HTTPException(status_code=400, detail=_LIMITED_SERIES_SCHEDULE_DETAIL)
    module = await course_service.update_module(session, module, module_update)
    return _module_read(module)


@router.delete("/modules/{module_id}", status_code=204)
async def delete_module(
    module_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    module_repo = CourseModuleRepository.from_session(session)
    module = await module_repo.get_readable_by_id(module_id, auth_subject)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if await _series_course_for_module(session, module.course_id):
        raise HTTPException(status_code=400, detail=_LIMITED_SERIES_SEASON_DETAIL)
    await course_service.delete_module(session, module)


@router.post(
    "/modules/{module_id}/lessons", response_model=CourseLessonRead, status_code=201
)
async def add_lesson(
    module_id: UUID,
    lesson_create: CourseLessonCreate,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    module_repo = CourseModuleRepository.from_session(session)
    module = await module_repo.get_readable_by_id(module_id, auth_subject)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if (
        lesson_create.release_at is not None or lesson_create.drip_days is not None
    ) and await _series_course_for_module(session, module.course_id):
        raise HTTPException(status_code=400, detail=_LIMITED_SERIES_SCHEDULE_DETAIL)
    lesson = await course_service.add_lesson(session, module, lesson_create)
    return _lesson_read(lesson)


@router.patch("/lessons/{lesson_id}", response_model=CourseLessonRead)
async def update_lesson(
    lesson_id: UUID,
    lesson_update: CourseLessonUpdate,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson_changes = lesson_update.model_dump(exclude_unset=True)
    if (
        lesson_changes.get("release_at") is not None
        or lesson_changes.get("drip_days") is not None
    ):
        module_repo = CourseModuleRepository.from_session(session)
        parent = await module_repo.get_by_id(lesson.module_id)
        if parent is not None and await _series_course_for_module(
            session, parent.course_id
        ):
            raise HTTPException(status_code=400, detail=_LIMITED_SERIES_SCHEDULE_DETAIL)
    # Moving the lesson to another module (the outline's cross-season drag):
    # the target must exist, be writable by this subject, and belong to the
    # same course — a lesson can never hop between courses.
    target_module_id = lesson_changes.get("module_id")
    if target_module_id is not None and target_module_id != lesson.module_id:
        module_repo = CourseModuleRepository.from_session(session)
        target = await module_repo.get_readable_by_id(target_module_id, auth_subject)
        if target is None:
            raise HTTPException(status_code=404, detail="Target module not found")
        current = await module_repo.get_by_id(lesson.module_id)
        if current is None or target.course_id != current.course_id:
            raise HTTPException(
                status_code=400,
                detail="Lessons can only move between modules of the same course",
            )
    lesson = await course_service.update_lesson(session, lesson, lesson_update)
    return _lesson_read(lesson)


@router.delete("/lessons/{lesson_id}", status_code=204)
async def delete_lesson(
    lesson_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await course_service.delete_lesson(session, lesson)


@router.delete(
    "/lessons/{lesson_id}/video",
    response_model=CourseLessonRead,
    summary="Remove Lesson Video",
)
async def remove_lesson_video(
    lesson_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    """Detach the video asset from a lesson without deleting the lesson itself."""
    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson = await course_service.clear_lesson_video(session, lesson)
    return _lesson_read(lesson)


@router.post(
    "/lessons/{lesson_id}/ai-autofill/cancel",
    response_model=CourseLessonRead,
    summary="Cancel AI Lesson Draft",
)
async def cancel_lesson_ai_autofill(
    lesson_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    """The creator clicked "I'll write it myself": stop the AI from filling
    this lesson's details. Only the autofill is cancelled — the transcript
    keeps generating for captions and the Course Assistant."""
    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    # A draft that already landed can't be un-written; anything else —
    # including the pre-attach window where the status is still null —
    # records the opt-out so attach_ready_asset won't queue a draft.
    if lesson.ai_autofill_status != "done":
        lesson = await lesson_repo.update(
            lesson, update_dict={"ai_autofill_status": "cancelled"}
        )
    return _lesson_read(lesson)


@router.post(
    "/lessons/{lesson_id}/ai-rewrite",
    response_model=CourseLessonRead,
    summary="Rewrite Lesson Section With AI",
)
async def rewrite_lesson_with_ai(
    lesson_id: UUID,
    rewrite: LessonAiRewriteRequest,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    """Rewrite one editor section (details or overview) from the lesson's
    video transcript. Overwrites that section — the creator explicitly asked.
    409 until the transcript is ready (the editor only shows the button once
    it is)."""
    from polar.course_assistant.service import (
        DraftGenerationFailed,
        NotConfigured,
        TranscriptNotReady,
        course_assistant_service,
    )

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    try:
        lesson = await course_assistant_service.rewrite_lesson_section(
            session, lesson, section=rewrite.section
        )
    except NotConfigured:
        raise HTTPException(
            status_code=503, detail="AI is not configured on this deployment"
        )
    except TranscriptNotReady:
        raise HTTPException(
            status_code=409,
            detail="This lesson's transcript isn't ready yet — try again in a minute.",
        )
    except DraftGenerationFailed:
        raise HTTPException(
            status_code=502,
            detail="The AI couldn't draft this lesson — please try again.",
        )
    return _lesson_read(lesson)


@router.get(
    "/{course_id}/enrollments",
    response_model=ListResource[CourseEnrollmentRead],
)
async def list_course_enrollments(
    course_id: UUID,
    auth_subject: auth.CoursesRead,
    pagination: PaginationParamsQuery,
    query: str | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> ListResource[CourseEnrollmentRead]:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    enrollments, total = await course_service.paginate_enrollments_for_course(
        session,
        course_id,
        organization_id=course.organization_id,
        limit=pagination.limit,
        page=pagination.page,
        query=query,
    )

    # Progress rollup for the page: completed / started lesson counts and
    # the last time each student was active, in two grouped queries.
    lesson_repo = CourseLessonRepository.from_session(session)
    total_lessons = await lesson_repo.count_published_by_course(course_id)
    summaries = await course_service.get_enrollment_progress_summaries(
        session, [e.id for e in enrollments]
    )

    # `paginate_enrollments_for_course` already eager-loads .customer
    # via selectinload, so this loop never goes back to the DB.
    items: list[CourseEnrollmentRead] = []
    for e in enrollments:
        c = e.customer
        summary = summaries[e.id]
        completed_lessons = summary.completed_lessons
        items.append(
            CourseEnrollmentRead(
                id=e.id,
                customer_id=e.customer_id,
                enrolled_at=e.enrolled_at,
                customer=(
                    CourseEnrollmentCustomer(
                        id=c.id,
                        email=c.email,
                        name=c.name,
                        avatar_url=getattr(c, "avatar_url", None),
                    )
                    if c is not None
                    else None
                ),
                progress=CourseEnrollmentProgress(
                    total_lessons=total_lessons,
                    completed_lessons=completed_lessons,
                    started_lessons=summary.started_lessons,
                    completion_percent=(
                        min(
                            100.0,
                            round(completed_lessons / total_lessons * 100, 1),
                        )
                        if total_lessons
                        else 0.0
                    ),
                    last_active_at=summary.last_active_at,
                ),
            )
        )
    return ListResource.from_paginated_results(items, total, pagination)


@router.delete("/{course_id}/enrollments/{enrollment_id}", status_code=204)
async def revoke_course_enrollment(
    course_id: UUID,
    enrollment_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    enrollment = await course_service.get_enrollment_by_id(session, enrollment_id)
    if enrollment is None or enrollment.course_id != course_id:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    # Also revoke the course-access benefit grant(s) behind this
    # enrollment — otherwise the entitlement survives and the student is
    # silently re-enrolled on the next benefit re-grant (e.g. a
    # subscription past_due→active bounce).
    await course_service.revoke_enrollment_and_entitlements(session, enrollment_id)


@router.post("/{course_id}/modules/reorder", response_model=CourseRead)
async def reorder_modules(
    course_id: UUID,
    payload: ReorderRequest,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    try:
        await course_service.reorder_modules(session, course, payload.ordered_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(course, attribute_names=["modules"])
    return _course_read(course)


@router.post("/modules/{module_id}/lessons/reorder", response_model=CourseModuleRead)
async def reorder_lessons(
    module_id: UUID,
    payload: ReorderRequest,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseModuleRead:
    module_repo = CourseModuleRepository.from_session(session)
    module = await module_repo.get_readable_by_id(module_id, auth_subject)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    try:
        await course_service.reorder_lessons(session, module, payload.ordered_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.refresh(module, attribute_names=["lessons"])
    return _module_read(module)


# --- Mux video endpoints ---


@router.post(
    "/staging/mux-upload",
    response_model=MuxUploadRead,
    status_code=201,
    summary="Create Staged Mux Direct Upload",
)
async def create_staged_mux_upload(
    auth_subject: auth.CoursesWrite,
    organization_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> MuxUploadRead:
    """Create a Mux direct upload that isn't yet attached to a lesson.

    Used by the create-course wizard so video upload can start the moment
    the user picks a file, before the course / lessons exist. The returned
    `upload_id` is later passed in `CourseLessonCreate.mux_upload_id` so the
    Mux webhook can attach the asset to the new lesson once it processes.
    """
    from polar.config import settings

    if not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        raise HTTPException(status_code=503, detail="Mux not configured")

    # Org membership check — staging endpoint isn't gated by a course row
    # since no course exists yet.
    if is_organization(auth_subject):
        if auth_subject.subject.id != organization_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif is_user(auth_subject):
        if not await _user_in_org(session, auth_subject.subject.id, organization_id):
            raise HTTPException(status_code=403, detail="Forbidden")

    # Same quota gate as the per-lesson endpoint — duration isn't known
    # until Mux processes the asset, so refuse new uploads outright once
    # the org's existing total exceeds the limit.
    org_repo = OrganizationRepository.from_session(session)
    organization = await org_repo.get_by_id(organization_id)
    if organization is not None:
        try:
            await enforce(
                session,
                organization,
                QuotaKey.video_hours_hosted,
                requested_storage_units=0,
            )
        except QuotaExceededError as exc:
            raise HTTPException(status_code=402, detail=exc.message) from exc

    try:
        result = await mux_client.create_direct_upload()
    except Exception as e:
        log.error("Staged Mux upload creation failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to create upload")

    return MuxUploadRead(
        upload_id=result["upload_id"],
        upload_url=result["upload_url"],
    )


@router.post(
    "/staging/media",
    summary="Upload Staging Media (returns URL only)",
)
async def upload_staged_media(
    auth_subject: auth.CoursesWrite,
    organization_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Upload an image or video to S3 before the course exists.

    Returns `{url, kind}`. Used by the create-course wizard for course
    thumbnail / trailer / landing slot media so upload can start the
    moment the user picks a file. The returned URL is then passed into
    the course-create payload (thumbnail_url, trailer_url, or stored on
    landing_overrides.media).
    """
    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    if is_organization(auth_subject):
        if auth_subject.subject.id != organization_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif is_user(auth_subject):
        if not await _user_in_org(session, auth_subject.subject.id, organization_id):
            raise HTTPException(status_code=403, detail="Forbidden")

    content_type = file.content_type or "application/octet-stream"
    is_image = content_type.startswith("image/")
    is_video = content_type.startswith("video/")
    if not (is_image or is_video):
        raise HTTPException(status_code=400, detail="File must be an image or video")

    data = await file.read()
    max_bytes = (500 if is_video else 10) * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File must be under {max_bytes // (1024 * 1024)} MB",
        )

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if not ext or "/" in ext:
        ext = "mp4" if is_video else "jpg"

    path = f"course-staging/{organization_id}/{uuid4().hex}.{ext}"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    public_url = s3.get_public_url(path)
    return {"url": public_url, "kind": "video" if is_video else "image"}


@router.post(
    "/lessons/{lesson_id}/mux-upload",
    response_model=MuxUploadRead,
    status_code=201,
    summary="Create Mux Direct Upload",
)
async def create_mux_upload(
    lesson_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> MuxUploadRead:
    """Create a Mux direct upload URL for a lesson video.

    The client should PUT the video file directly to the returned upload_url.
    Mux will call the webhook once the asset is ready.
    """
    from polar.config import settings

    if not settings.MUX_TOKEN_ID or not settings.MUX_TOKEN_SECRET:
        raise HTTPException(status_code=503, detail="Mux not configured")

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Block new uploads if the org would exceed its video-hours cap.
    # The actual duration isn't known until Mux processes the asset, so
    # we project against a conservative 10-minute estimate — that's at
    # the upper end of a typical short lesson and ensures the cap holds
    # for normal content. Once Mux reports the real duration in the
    # webhook handler we run the check again with the precise value
    # and flip the lesson to `quota_exceeded` if it pushes past the
    # grace ceiling, so a single oversized upload can't blow through
    # the limit either.
    organization_id = await lesson_repo.get_organization_id_for_lesson(lesson.id)
    if organization_id is not None:
        org_repo = OrganizationRepository.from_session(session)
        organization = await org_repo.get_by_id(organization_id)
        if organization is not None:
            try:
                await enforce(
                    session,
                    organization,
                    QuotaKey.video_hours_hosted,
                    requested_storage_units=_ESTIMATED_LESSON_SECONDS,
                )
            except QuotaExceededError as exc:
                raise HTTPException(status_code=402, detail=exc.message) from exc

    try:
        result = await mux_client.create_direct_upload()
    except Exception as e:
        log.error("Mux upload creation failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to create upload")

    # Replace = remove + attach: the previous asset (or a still-processing
    # previous upload) is deleted at Mux, its video-hours refunded, and the
    # stale playback/duration/transcript state cleared so the editor shows
    # the new upload's progress instead of the old video.
    await course_service.stage_lesson_video_replacement(
        session, lesson, upload_id=result["upload_id"]
    )

    return MuxUploadRead(
        upload_id=result["upload_id"],
        upload_url=result["upload_url"],
    )


@router.post(
    "/lessons/{lesson_id}/thumbnail",
    response_model=CourseLessonRead,
    summary="Upload Lesson Thumbnail",
)
async def upload_lesson_thumbnail(
    lesson_id: UUID,
    auth_subject: auth.CoursesWrite,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 10 MB")

    ext = (file.filename or "thumbnail.jpg").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"

    # Content-addressed path so re-uploading a new image yields a fresh URL
    # — without this the studio kept showing the previous thumbnail because
    # the browser cached the bytes under an unchanging URL.
    digest = hashlib.sha256(data).hexdigest()[:12]
    path = f"course-thumbnails/{lesson_id}/{digest}.{ext}"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    thumbnail_url = s3.get_public_url(path)

    lesson = await lesson_repo.update(
        lesson, update_dict={"thumbnail_url": thumbnail_url}
    )
    return _lesson_read(lesson)


@router.post(
    "/lessons/{lesson_id}/thumbnail/from-video",
    response_model=CourseLessonRead,
    summary="Set Lesson Thumbnail From Video Frame",
)
async def set_lesson_thumbnail_from_video(
    lesson_id: UUID,
    body: CourseLessonThumbnailFromVideo,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    """YouTube-style thumbnail-from-video: grab the frame at the requested
    timestamp from the lesson's processed Mux video and store it as the
    thumbnail image (same content-addressed S3 path as an uploaded one, so
    everything downstream — cards, rails, portal — just works)."""
    import httpx

    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    if not lesson.mux_playback_id:
        raise HTTPException(
            status_code=400,
            detail="This lesson's video isn't processed yet",
        )

    frame_url = (
        f"https://image.mux.com/{lesson.mux_playback_id}/thumbnail.jpg"
        f"?time={body.time_seconds:.2f}&width=1280&fit_mode=preserve"
    )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(frame_url)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="Could not grab that frame"
        ) from exc
    if resp.status_code != 200 or not resp.content:
        raise HTTPException(status_code=502, detail="Could not grab that frame")

    data = resp.content
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Frame is too large")

    digest = hashlib.sha256(data).hexdigest()[:12]
    path = f"course-thumbnails/{lesson_id}/{digest}.jpg"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, "image/jpeg")
    thumbnail_url = s3.get_public_url(path)

    # A picked frame is the full frame — reset any crop from a previous image.
    lesson = await lesson_repo.update(
        lesson,
        update_dict={
            "thumbnail_url": thumbnail_url,
            "thumbnail_object_position": None,
        },
    )
    return _lesson_read(lesson)


@router.post(
    "/{course_id}/thumbnail",
    response_model=CourseRead,
    summary="Upload Course Thumbnail",
)
async def upload_course_thumbnail(
    course_id: UUID,
    auth_subject: auth.CoursesWrite,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 10 MB")

    ext = (file.filename or "thumbnail.jpg").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"

    # Content-addressed path so re-uploading a new image yields a fresh URL
    # — see upload_lesson_thumbnail.
    digest = hashlib.sha256(data).hexdigest()[:12]
    path = f"course-thumbnails/courses/{course_id}/{digest}.{ext}"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    thumbnail_url = s3.get_public_url(path)

    course = await repo.update(course, update_dict={"thumbnail_url": thumbnail_url})
    return _course_read(course)


@router.post(
    "/{course_id}/trailer",
    response_model=CourseRead,
    summary="Upload Course Trailer",
)
async def upload_course_trailer(
    course_id: UUID,
    auth_subject: auth.CoursesWrite,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
) -> CourseRead:
    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    content_type = file.content_type or "video/mp4"
    if not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    data = await file.read()
    if len(data) > 500 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Trailer must be under 500 MB")

    ext = (file.filename or "trailer.mp4").rsplit(".", 1)[-1].lower()
    if ext not in {"mp4", "mov", "webm", "m4v"}:
        ext = "mp4"

    # Content-addressed path so replacing the trailer yields a fresh URL —
    # the previous fixed `{course_id}.{ext}` key meant browsers (and CDNs)
    # kept serving the cached old trailer after a replace.
    digest = hashlib.sha256(data).hexdigest()[:12]
    path = f"course-trailers/{course_id}/{digest}.{ext}"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    trailer_url = s3.get_public_url(path)

    # Best-effort cleanup of the replaced trailer object.
    old_url = course.trailer_url
    if old_url and old_url != trailer_url:
        old_path = old_url.split("/course-trailers/", 1)
        if len(old_path) == 2:
            try:
                s3.delete_file(f"course-trailers/{old_path[1].split('?')[0]}")
            except Exception as e:
                log.warning("Failed to delete old trailer from S3: %s", e)

    course = await repo.update(course, update_dict={"trailer_url": trailer_url})
    return _course_read(course)


@router.post(
    "/{course_id}/landing-media",
    summary="Upload Landing Media (returns URL only)",
)
async def upload_course_landing_media(
    course_id: UUID,
    auth_subject: auth.CoursesWrite,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    from uuid import uuid4

    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    repo = CourseRepository.from_session(session)
    course = await repo.get_readable_by_id(course_id, auth_subject)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    content_type = file.content_type or "application/octet-stream"
    is_image = content_type.startswith("image/")
    is_video = content_type.startswith("video/")
    if not (is_image or is_video):
        raise HTTPException(status_code=400, detail="File must be an image or video")

    data = await file.read()
    max_bytes = (500 if is_video else 10) * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File must be under {max_bytes // (1024 * 1024)} MB",
        )

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if not ext or "/" in ext:
        ext = "mp4" if is_video else "jpg"

    path = f"course-landing-media/{course_id}/{uuid4().hex}.{ext}"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    public_url = s3.get_public_url(path)
    log.info(
        "course.landing_media uploaded",
        extra={
            "course_id": str(course_id),
            "bucket": settings.S3_FILES_PUBLIC_BUCKET_NAME,
            "path": path,
            "content_type": content_type,
            "size_bytes": len(data),
            "public_url": public_url,
            "kind": "video" if is_video else "image",
        },
    )
    return {"url": public_url, "kind": "video" if is_video else "image"}


@router.post(
    "/lessons/{lesson_id}/attachments",
    response_model=CourseLessonRead,
    summary="Upload Lesson Attachment",
)
async def upload_lesson_attachment(
    lesson_id: UUID,
    auth_subject: auth.CoursesWrite,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File must be under 100 MB")

    attachment_id = str(uuid4())
    filename = file.filename or "attachment"
    safe_name = filename.replace("/", "_").replace("\\", "_")
    path = f"course-attachments/{lesson_id}/{attachment_id}/{safe_name}"
    content_type = file.content_type or "application/octet-stream"

    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    url = s3.get_public_url(path)

    attachment = {
        "id": attachment_id,
        "filename": safe_name,
        "url": url,
        "size": len(data),
        "content_type": content_type,
        "path": path,
    }

    content = dict(lesson.content or {})
    attachments = list(content.get("attachments") or [])
    attachments.append(attachment)
    content["attachments"] = attachments

    lesson = await lesson_repo.update(lesson, update_dict={"content": content})
    return _lesson_read(lesson)


@router.delete(
    "/lessons/{lesson_id}/attachments/{attachment_id}",
    response_model=CourseLessonRead,
    summary="Delete Lesson Attachment",
)
async def delete_lesson_attachment(
    lesson_id: UUID,
    attachment_id: str,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CourseLessonRead:
    from polar.config import settings
    from polar.integrations.aws.s3 import S3Service

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_readable_by_id(lesson_id, auth_subject)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    content = dict(lesson.content or {})
    attachments = list(content.get("attachments") or [])
    target = next((a for a in attachments if a.get("id") == attachment_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if target.get("path"):
        try:
            s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
            s3.delete_file(target["path"])
        except Exception as e:
            log.warning("Failed to delete attachment from S3: %s", e)

    content["attachments"] = [a for a in attachments if a.get("id") != attachment_id]
    lesson = await lesson_repo.update(lesson, update_dict={"content": content})
    return _lesson_read(lesson)


@router.post(
    "/{course_id}/preview-access",
    summary="Get Preview Access Token",
    response_model=dict[str, str],
)
async def get_preview_access(
    course_id: UUID,
    auth_subject: auth.CoursesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Sign the requesting org member into the portal as themselves.

    Finds-or-creates the instructor's OWN customer record — their real
    dashboard email — in the course's organization, enrolls it, and mints a
    customer session. The portal identifies instructors by matching the
    customer email against org-member emails, so this account automatically
    gets the instructor badge and moderation powers in lesson discussions,
    and the enrollments listing excludes it from student-facing counts.

    Security: the session is only ever minted for the requesting user's own
    email — never an arbitrary customer — so this cannot be used to
    impersonate a student. Signing in "as yourself" is something the user
    could already do through the portal's email-code flow.
    """
    if not is_user(auth_subject):
        raise HTTPException(
            status_code=400, detail="Preview requires user authentication"
        )

    user = auth_subject.subject

    course_repo = CourseRepository.from_session(session)
    stmt = course_repo.get_base_statement().where(course_repo.model.id == course_id)
    course = await course_repo.get_one_or_none(stmt)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    if not await _user_in_org(session, user.id, course.organization_id):
        raise HTTPException(status_code=403, detail="Access denied")

    org = await session.get(Organization, course.organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    customer_repo = CustomerRepository.from_session(session)
    # Display name for a freshly-created record mirrors the admin's
    # editorial identity: course instructor_name → org name → email-local.
    display_name = (
        (course.instructor_name or "").strip()
        or (org.name or "").strip()
        or user.email.split("@")[0]
    )
    customer = await customer_repo.get_by_email_and_organization(
        user.email, course.organization_id
    )
    if customer is None:
        customer = await customer_repo.create(
            Customer(
                email=user.email,
                name=display_name,
                # The portal's top-right avatar shows the admin's real
                # dashboard picture, not initials.
                avatar_url=user.avatar_url,
                organization_id=course.organization_id,
            ),
            flush=True,
        )
    else:
        # Backfill name/avatar, but never overwrite values the customer
        # record already carries (e.g. set via portal onboarding).
        updates: dict[str, str] = {}
        if not (customer.name or "").strip():
            updates["name"] = display_name
        if not customer.avatar_url and user.avatar_url:
            updates["avatar_url"] = user.avatar_url
        if updates:
            customer = await customer_repo.update(customer, update_dict=updates)

    # Don't fire enrollment events: previewing your own course must not
    # trigger the org's own email automations.
    await course_service.enroll_customer(
        session, course_id=course_id, customer=customer, fire_events=False
    )

    # Retire the legacy preview sandbox for this admin: one identity, not
    # two members. Its authored content still renders (author lookups join
    # by id, and the community resolver attributes it to the host).
    legacy_sandbox = await customer_repo.get_by_email_and_organization(
        f"preview+{user.id}@course-preview.invalid", course.organization_id
    )
    if legacy_sandbox is not None:
        legacy_enrollment = await course_service.get_enrollment_for_customer(
            session, legacy_sandbox.id, course_id
        )
        if legacy_enrollment is not None:
            await course_service.revoke_enrollment(session, legacy_enrollment.id)

    # Preview sessions get their own configurable lifetime
    # (COURSE_PREVIEW_SESSION_TTL) so a course-in-progress link can be made
    # long-lived without extending real customers' portal sessions, which
    # keep the shorter CUSTOMER_SESSION_TTL.
    from polar.config import settings
    from polar.kit.utils import utc_now

    token, _ = await customer_session.create_customer_session(
        session,
        customer,
        expires_at=utc_now() + settings.COURSE_PREVIEW_SESSION_TTL,
    )

    portal_url = org.storefront_url(
        f"/portal/courses/{course_id}?customer_session_token={token}"
    )
    return {"token": token, "portal_url": portal_url}


@router.post(
    "/mux/webhook",
    status_code=204,
    summary="Mux Webhook",
    include_in_schema=False,
)
async def mux_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Handle Mux webhook events (video.asset.ready etc.)."""
    body = await request.body()
    sig_header = request.headers.get("mux-signature", "")

    if not mux_client.verify_webhook_signature(body, sig_header):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = json.loads(body)
    event_type = payload.get("type", "")
    data = payload.get("data", {})

    lesson_repo = CourseLessonRepository.from_session(session)

    async def _find_lesson_by_upload(upload_id: str) -> CourseLesson | None:
        stmt = select(CourseLesson).where(
            CourseLesson.mux_upload_id == upload_id,
            CourseLesson.deleted_at.is_(None),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def _find_community_media_by_upload(
        upload_id: str,
    ) -> CommunityPostMedia | None:
        """Community-post video media uses the same Mux pipeline. The
        webhook arrives without a discriminator so we try the lesson
        table first (the original consumer); when there's no match we
        check community media."""
        stmt = select(CommunityPostMedia).where(
            CommunityPostMedia.mux_upload_id == upload_id,
            CommunityPostMedia.deleted_at.is_(None),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def _find_activity_submission_by_upload(
        upload_id: str,
    ) -> CommunityActivitySubmission | None:
        """Community-activity video submissions ride the same Mux
        pipeline. Without this lookup, video submissions are inserted
        with mux_upload_id but never get a mux_playback_id, so the
        portal can't play them back."""
        stmt = select(CommunityActivitySubmission).where(
            CommunityActivitySubmission.mux_upload_id == upload_id,
            CommunityActivitySubmission.deleted_at.is_(None),
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    if event_type == "video.asset.ready":
        upload_id = data.get("upload_id")
        asset_id = data.get("id")
        playback_ids = data.get("playback_ids", [])
        playback_id = playback_ids[0]["id"] if playback_ids else None
        duration = data.get("duration")

        if upload_id and asset_id and playback_id:
            activity_submission = await _find_activity_submission_by_upload(upload_id)
            if activity_submission is not None:
                activity_submission.mux_asset_id = asset_id
                activity_submission.mux_playback_id = playback_id
                activity_submission.mux_status = "ready"
                session.add(activity_submission)
                return

            community_media = await _find_community_media_by_upload(upload_id)
            if community_media is not None:
                # Community-post video lifecycle is simpler than lessons:
                # no per-org video-hours quota (community videos count
                # against the same Mux account but we don't gate them
                # here yet — Phase 3A trade-off).
                update: dict = {
                    "mux_asset_id": asset_id,
                    "mux_playback_id": playback_id,
                    "mux_status": "ready",
                }
                if duration:
                    update["duration_seconds"] = int(duration)
                for key, value in update.items():
                    setattr(community_media, key, value)
                session.add(community_media)
                return

            lesson = await _find_lesson_by_upload(upload_id)
            if lesson:
                # Quota check + attach + captions + transcript seeding +
                # video-hours emit, shared with the stalled-upload
                # reconcile cron (which recovers missed webhooks).
                await course_service.attach_ready_asset(
                    session,
                    lesson,
                    asset_id=asset_id,
                    playback_id=playback_id,
                    duration=duration,
                )

    elif event_type in ("video.upload.errored", "video.asset.errored"):
        upload_id = data.get("upload_id") or data.get("id")
        if upload_id:
            activity_submission = await _find_activity_submission_by_upload(upload_id)
            if activity_submission is not None:
                activity_submission.mux_status = "errored"
                session.add(activity_submission)
                return

            community_media = await _find_community_media_by_upload(upload_id)
            if community_media is not None:
                community_media.mux_status = "errored"
                session.add(community_media)
                return
            lesson = await _find_lesson_by_upload(upload_id)
            if lesson:
                await lesson_repo.update(lesson, update_dict={"mux_status": "errored"})

    elif event_type in (
        "video.asset.created",
        "video.upload.asset_created",
        "video.asset.preparing",
    ):
        upload_id = data.get("upload_id") or data.get("id")
        if upload_id:
            activity_submission = await _find_activity_submission_by_upload(upload_id)
            if activity_submission is not None:
                if activity_submission.mux_status != "ready":
                    activity_submission.mux_status = "processing"
                    session.add(activity_submission)
                return

            community_media = await _find_community_media_by_upload(upload_id)
            if community_media is not None:
                if community_media.mux_status != "ready":
                    community_media.mux_status = "processing"
                    session.add(community_media)
                return
            lesson = await _find_lesson_by_upload(upload_id)
            if lesson and lesson.mux_status != "ready":
                await lesson_repo.update(
                    lesson, update_dict={"mux_status": "processing"}
                )

    elif event_type == "video.asset.deleted":
        upload_id = data.get("upload_id")
        if upload_id:
            activity_submission = await _find_activity_submission_by_upload(upload_id)
            if activity_submission is not None:
                activity_submission.mux_status = "deleted"
                activity_submission.mux_playback_id = None
                activity_submission.mux_asset_id = None
                session.add(activity_submission)
                return

            community_media = await _find_community_media_by_upload(upload_id)
            if community_media is not None:
                community_media.mux_status = "deleted"
                community_media.mux_playback_id = None
                community_media.mux_asset_id = None
                session.add(community_media)
                return
            lesson = await _find_lesson_by_upload(upload_id)
            if lesson:
                previous_duration = lesson.duration_seconds
                previously_ready = lesson.mux_status == "ready"
                await lesson_repo.update(
                    lesson,
                    update_dict={
                        "mux_status": "deleted",
                        "mux_playback_id": None,
                        "mux_asset_id": None,
                    },
                )
                # Free up the org's video-hours quota. Only emit if the
                # asset had reached ready (i.e. its duration had been
                # counted in the first place).
                if previously_ready and previous_duration:
                    organization_id = await lesson_repo.get_organization_id_for_lesson(
                        lesson.id
                    )
                    if organization_id is not None:
                        emit_video_uploaded(
                            session,
                            organization_id=organization_id,
                            duration_seconds=-int(previous_duration),
                        )

    elif event_type == "video.asset.track.ready":
        # An auto-generated caption track finished. Pull its transcript for the
        # Course Assistant. Only text tracks matter here.
        if data.get("type") == "text":
            asset_id = data.get("asset_id")
            if asset_id:
                lesson = await lesson_repo.get_by_mux_asset_id(asset_id)
                if lesson is not None:
                    from polar.course_assistant.service import (
                        course_assistant_service,
                    )
                    from polar.worker import enqueue_job

                    # Fetch + store inline (the API path works); fall back to
                    # the worker only if the fetch isn't ready yet.
                    stored = False
                    try:
                        stored = (
                            await course_assistant_service.fetch_and_store_transcript(
                                session, lesson_id=lesson.id
                            )
                        )
                    except Exception:
                        log.exception(
                            "course.transcript.inline_fetch_failed",
                            lesson_id=str(lesson.id),
                        )
                    if stored:
                        course_id = await lesson_repo.get_course_id_for_lesson(
                            lesson.id
                        )
                        if course_id is not None:
                            enqueue_job(
                                "course_assistant.maybe_build", course_id=course_id
                            )
                    else:
                        enqueue_job(
                            "course_assistant.fetch_transcript",
                            lesson_id=lesson.id,
                        )

    elif event_type == "video.asset.track.errored":
        # Caption generation failed for this asset. Don't let it block the
        # assistant build forever — mark it unavailable and re-check the course.
        if data.get("type") == "text":
            asset_id = data.get("asset_id")
            if asset_id:
                lesson = await lesson_repo.get_by_mux_asset_id(asset_id)
                if lesson is not None:
                    errored_update: dict = {"transcript_status": "unavailable"}
                    if lesson.ai_autofill_status == "pending":
                        # No transcript will come, so no AI draft either —
                        # resolve the editor's banner instead of hanging it.
                        errored_update["ai_autofill_status"] = "failed"
                    await lesson_repo.update(lesson, update_dict=errored_update)
                    from polar.worker import enqueue_job

                    course_id = await lesson_repo.get_course_id_for_lesson(lesson.id)
                    if course_id is not None:
                        enqueue_job(
                            "course_assistant.maybe_build",
                            course_id=course_id,
                        )
