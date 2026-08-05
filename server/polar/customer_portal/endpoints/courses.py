import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

log = logging.getLogger(__name__)

from polar.auth.models import AuthSubject, Member, is_customer, is_member
from polar.auth.models import Customer as CustomerSubject
from polar.course import mux as mux_client
from polar.course.repository import (
    CourseEnrollmentRepository,
    CourseLessonRepository,
    CourseRepository,
)
from polar.organization.repository import OrganizationRepository
from polar.quotas.definitions import QuotaKey
from polar.quotas.exceptions import QuotaExceededError
from polar.quotas.producers import emit_video_viewed, enforce
from polar.course.schemas import (
    CourseLessonFlatRead,
    CourseLandingPageRead,
    CourseNoteRead,
    CourseNoteUpsert,
    CourseProgressRead,
    LessonCommentAuthor,
    LessonCommentCreate,
    LessonCommentLikeRead,
    LessonCommentRead,
    QuizAnswerResult,
    QuizAttemptResult,
    QuizAttemptSubmission,
    WatchProgressUpdate,
)
from polar.course.service import course_service
from polar.file.s3 import S3_SERVICES
from polar.models import Customer
from polar.models.course_enrollment import CourseEnrollment
from polar.models.course_lesson_progress import CourseLessonProgress
from polar.models.product import Product
from polar.models.product_media import ProductMedia
from polar.models.user import User
from polar.models.user_organization import UserOrganization
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .. import auth
from ..utils import get_customer, get_customer_id

router = APIRouter(prefix="/courses", tags=["customer_portal_courses", APITag.public])


async def _course_is_publicly_visible(session: AsyncSession, course) -> bool:
    """Whether a course's landing may be served to a non-enrolled visitor.

    Mirrors the storefront's own visibility gate: the org must not be
    blocked/deleted and the product must be live (not archived, not deleted).
    Without this the landing endpoint served full landing data — title,
    instructor, overrides, published lessons — for any course whose product was
    archived, to anyone holding the id. Enrolled customers keep access via the
    caller's separate enrollment check (they bought it before it was pulled).

    Note: this deliberately does NOT require ``storefront_enabled``. The
    course-only reposition (Phase 6) hides the Space UI and no longer flips that
    flag, so gating on it 404s every legitimate course landing. A live course
    product on an active org is public — same rule the storefront query uses.
    """
    from polar.models import Organization

    statement = (
        select(Product.id)
        .join(Organization, Organization.id == Product.organization_id)
        .where(
            Product.id == course.product_id,
            Product.deleted_at.is_(None),
            Product.is_archived.is_(False),
            Organization.deleted_at.is_(None),
            Organization.blocked_at.is_(None),
        )
    )
    result = await session.execute(statement)
    return result.first() is not None


def _serialize_lesson(
    lesson, completed_ids: set[str], *, accessible: bool = True
) -> dict:
    """Serialize a lesson for the customer portal.

    When ``accessible`` is False (paywall- or drip-locked), strip body fields
    that would let a client bypass the lock (content, mux playback id,
    attachments).
    """
    base = {
        "id": str(lesson.id),
        "module_id": str(lesson.module_id),
        "title": lesson.title,
        "content_type": lesson.content_type,
        "position": lesson.position,
        "duration_seconds": lesson.duration_seconds,
        "is_free_preview": lesson.is_free_preview,
        "thumbnail_url": getattr(lesson, "thumbnail_url", None),
        "thumbnail_object_position": getattr(
            lesson, "thumbnail_object_position", None
        ),
        "comments_mode": getattr(lesson, "comments_mode", "visible"),
        "completed": str(lesson.id) in completed_ids,
        # The one-line card description is marketing copy the public landing
        # renders on every lesson card (locked included) — it sells the
        # lesson, it doesn't reveal it. Only body fields below are gated.
        "description": getattr(lesson, "description", None),
    }
    if accessible:
        base["content"] = lesson.content
        playback_id = getattr(lesson, "mux_playback_id", None)
        base["mux_playback_id"] = playback_id
        # Do NOT inline a signed mux_playback_url here. The customer-
        # portal player must call POST /playback-url for each play so
        # the video_views_monthly quota is actually enforced (and the
        # view is counted). Returning a URL up-front meant the
        # enforcement endpoint was dead code: every view passed through
        # the public Mux URL embedded in the course-read response.
        base["mux_playback_url"] = None
        base["mux_status"] = getattr(lesson, "mux_status", None)
    else:
        base["content"] = None
        base["mux_playback_id"] = None
        base["mux_playback_url"] = None
        base["mux_status"] = None
    return base


def _build_module_list(course, paywall_position, enrolled_at, now, completed_ids):
    """Build module list for an enrolled customer.

    Returns (modules, accessible_lesson_ids) where accessible_lesson_ids is the
    set of lesson IDs included in the response (used as the progress denominator).

    Enrolled customers see every published lesson — the paywall only gates
    *non-enrolled* visitors and is enforced in the landing endpoint. Drip
    locking still applies: a module under drip release only exposes its
    free-preview lessons until the unlock date.
    """
    del paywall_position  # paywall is irrelevant for enrolled customers
    modules = []
    accessible_ids: set[str] = set()
    for m in course.modules:
        # Module-level lock drives the section-header "locked until" badge.
        drip_locked = False
        locked_until = None
        if m.release_at and now < m.release_at:
            drip_locked = True
            locked_until = m.release_at.isoformat()
        elif m.drip_days is not None:
            unlock_at = enrolled_at + timedelta(days=m.drip_days)
            if now < unlock_at:
                drip_locked = True
                locked_until = unlock_at.isoformat()

        published_lessons = [lesson for lesson in m.lessons if lesson.published]

        # Per-lesson visibility goes through the unified accessibility check so
        # BOTH module- and lesson-level drip are honoured (free previews stay
        # visible even inside a dripped module). A lesson the customer can't
        # access yet is omitted entirely — this `accessible_ids` set is the
        # authority the playback / complete / comments gate
        # (_verify_lesson_in_enrolled_course) relies on.
        visible = [
            lesson
            for lesson in published_lessons
            if course_service.calculate_lesson_accessibility(
                lesson, None, enrolled_at, now, module=m
            )[0]
        ]

        lessons = []
        for lesson in visible:
            # Per-lesson drip (release_at / drip_days) is enforced in ADDITION
            # to the module-level drip handled above. Previously this builder
            # only honored module drip, so a lesson dripped individually inside
            # an otherwise-unlocked module was serialized in full and counted as
            # accessible — letting the content/playback/complete endpoints (which
            # gate on this very accessible_ids set via
            # _verify_lesson_in_enrolled_course) be hit before the release date.
            # The flat lesson list already gated it; gate it here too so both
            # representations agree and the content endpoints are protected.
            is_accessible, locked_until_dt = (
                course_service.calculate_lesson_accessibility(
                    lesson, None, enrolled_at, now
                )
            )
            lesson_data = _serialize_lesson(
                lesson, completed_ids, accessible=is_accessible
            )
            lesson_data["locked"] = not is_accessible
            lesson_data["locked_until"] = (
                locked_until_dt.isoformat() if locked_until_dt else None
            )
            lessons.append(lesson_data)
            if is_accessible:
                accessible_ids.add(str(lesson.id))

        modules.append(
            {
                "id": str(m.id),
                "title": m.title,
                "description": m.description,
                "position": m.position,
                "locked": drip_locked,
                "locked_until": locked_until,
                "is_bonus": bool(getattr(m, "is_bonus", False)),
                "lessons": lessons,
            }
        )
    return modules, accessible_ids


def _bonus_lesson_ids(course) -> set[str]:
    """Lesson ids living in bonus sections — shown in the portal's "Bonus
    Content" rail but excluded from the completion denominator (a student
    hits 100% without the extras)."""
    return {
        str(lesson.id)
        for module in course.modules
        if getattr(module, "is_bonus", False)
        for lesson in module.lessons
    }


def _build_flat_lesson_list(course, paywall_position, enrolled_at, now, completed_ids):
    """Build flat lesson list with paywall/drip locks and only published lessons.

    Returns (lessons, accessible_lesson_ids) where accessible_lesson_ids is the
    set of lesson IDs included in the response (used as the progress denominator).

    ``paywall_position`` is interpreted as a global lesson count.
    """
    flat_lessons = []
    accessible_ids: set[str] = set()

    # Flatten lessons in module order, then by within-module position so the
    # global index matches what the studio outline shows.
    ordered_lessons: list[tuple[int, object, object]] = []
    for module in course.modules:
        for lesson in sorted(module.lessons, key=lambda x: x.position):
            ordered_lessons.append((module.position, module, lesson))
    ordered_lessons.sort(key=lambda triple: (triple[0], triple[2].position))

    global_idx = -1
    for _module_pos, module, lesson in ordered_lessons:
        # Only published lessons are visible
        if not lesson.published:
            continue
        global_idx += 1

        # Calculate accessibility
        is_accessible, locked_until = course_service.calculate_lesson_accessibility(
            lesson,
            paywall_position,
            enrolled_at,
            now,
            global_lesson_index=global_idx,
            module=module,
        )

        locked = not is_accessible
        locked_until_str = locked_until.isoformat() if locked_until else None

        # Free-preview lessons inside locked modules stay fully accessible.
        accessible = is_accessible or lesson.is_free_preview
        lesson_data = _serialize_lesson(
            lesson, completed_ids, accessible=accessible
        )
        lesson_data["locked"] = locked
        lesson_data["locked_until"] = locked_until_str

        flat_lessons.append(lesson_data)

        if is_accessible:
            accessible_ids.add(str(lesson.id))

    return flat_lessons, accessible_ids


@router.get(
    "/",
    summary="List Enrolled Courses",
)
async def list_enrolled_courses(
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    customer_id = get_customer_id(auth_subject)
    enrollments = await course_service.list_enrollments_for_customer(
        session, customer_id
    )

    # Eager-load products + product_medias for thumbnail fallback. Course's
    # `product` relationship is lazy="raise" so we explicitly fetch.
    course_product_ids = {
        e.course.product_id for e in enrollments if e.course.product_id is not None
    }
    products_by_id: dict[UUID, Product] = {}
    if course_product_ids:
        prod_stmt = (
            select(Product)
            .where(Product.id.in_(course_product_ids))
            .options(
                selectinload(Product.product_medias).joinedload(ProductMedia.file)
            )
        )
        prod_result = await session.execute(prod_stmt)
        for product in prod_result.scalars().unique().all():
            products_by_id[product.id] = product

    # Bulk-load progress for all enrollments in this list.
    enrollment_ids = [e.id for e in enrollments]
    progress_by_enrollment: dict[UUID, list[CourseLessonProgress]] = {
        eid: [] for eid in enrollment_ids
    }
    if enrollment_ids:
        # Filter soft-deleted rows — this raw select bypasses the
        # repository's base statement, and counting dead completions made
        # the Overview keep showing progress after a reset.
        prog_stmt = select(CourseLessonProgress).where(
            CourseLessonProgress.enrollment_id.in_(enrollment_ids),
            CourseLessonProgress.deleted_at.is_(None),
        )
        prog_result = await session.execute(prog_stmt)
        for progress in prog_result.scalars():
            progress_by_enrollment.setdefault(
                progress.enrollment_id, []
            ).append(progress)

    result = []
    now = datetime.now(tz=UTC)
    for enrollment in enrollments:
        course = enrollment.course
        progress_items = progress_by_enrollment.get(enrollment.id, [])
        completed_ids = {str(p.lesson_id) for p in progress_items}

        # Use the same accessibility logic as the detail endpoint so progress
        # lines up between list and detail views.
        _, accessible_ids = _build_flat_lesson_list(
            course,
            course.paywall_position,
            enrollment.enrolled_at,
            now,
            completed_ids,
        )
        # Bonus-section lessons never count toward completion.
        counted_ids = accessible_ids - _bonus_lesson_ids(course)
        total_lessons = len(counted_ids)
        completed_count = len(completed_ids & counted_ids)
        completion_percent = (
            round(completed_count / total_lessons * 100, 1)
            if total_lessons
            else 0.0
        )

        # Total duration across published lessons (in seconds).
        total_duration_seconds = sum(
            (lesson.duration_seconds or 0)
            for module in course.modules
            for lesson in module.lessons
            if lesson.published
        )

        # When the course is fully completed, surface the most recent
        # completion date so the UI can render "Completed Mar 14, 2025".
        completed_at: str | None = None
        if total_lessons > 0 and completed_count == total_lessons:
            relevant = [
                p for p in progress_items if str(p.lesson_id) in counted_ids
            ]
            if relevant:
                completed_at = max(p.completed_at for p in relevant).isoformat()

        # Thumbnail: prefer course's own thumbnail, else fall back to the
        # first uploaded product media so the customer portal always shows
        # imagery the merchant provided on the product.
        thumbnail_url = course.thumbnail_url
        if not thumbnail_url and course.product_id:
            owning_product = products_by_id.get(course.product_id)
            if owning_product is not None:
                for media in owning_product.product_medias:
                    file = media.file
                    if file is None or not file.is_uploaded:
                        continue
                    s3 = S3_SERVICES.get(file.service)
                    if s3 is None:
                        continue
                    thumbnail_url = s3.get_public_url(file.path)
                    break

        published_lesson_count = sum(
            sum(1 for lesson in m.lessons if lesson.published)
            for m in course.modules
        )
        result.append(
            {
                "enrollment_id": str(enrollment.id),
                "enrolled_at": enrollment.enrolled_at.isoformat(),
                "course": {
                    "id": str(course.id),
                    "title": course.title,
                    "course_type": course.course_type,
                    "module_count": len(course.modules),
                    "lesson_count": published_lesson_count,
                    "thumbnail_url": thumbnail_url,
                    "thumbnail_object_position": course.thumbnail_object_position,
                    "total_duration_seconds": total_duration_seconds,
                    # The creator's landing theme — the portal renders every
                    # page in this theme (dark landing → dark portal).
                    "theme_mode": (course.landing_overrides or {}).get(
                        "theme_mode", "light"
                    ),
                },
                "progress": {
                    "total_lessons": total_lessons,
                    "completed_lessons": completed_count,
                    "completion_percent": completion_percent,
                },
                "completed_at": completed_at,
            }
        )
    return result


async def _ensure_instructor_enrollment(
    session: AsyncSession,
    auth_subject: AuthSubject[CustomerSubject | Member],
    course_id: UUID,
) -> CourseEnrollment | None:
    """Self-healing access for org members.

    An instructor signing into the portal with their own email always has
    access to their org's courses — whether they arrived through the
    dashboard's Preview button or through the normal email-code sign-in,
    and regardless of whether an earlier enrollment was revoked. Anyone
    whose email doesn't belong to an org member of the course's
    organization gets None (the normal 404 path).
    """
    customer = get_customer(auth_subject)
    email = (customer.email or "").lower()
    if not email or email.endswith("@course-preview.invalid"):
        return None
    course = await CourseRepository.from_session(session).get_by_id(course_id)
    if course is None:
        return None
    if email not in await _instructor_emails(session, course.organization_id):
        return None
    # Mirror the admin's dashboard avatar onto their portal account so the
    # top-right avatar shows their real picture instead of initials.
    if customer.avatar_url is None:
        avatar_stmt = (
            select(User.avatar_url)
            .join(UserOrganization, UserOrganization.user_id == User.id)
            .where(
                UserOrganization.organization_id == course.organization_id,
                UserOrganization.deleted_at.is_(None),
                func.lower(User.email) == email,
                User.avatar_url.is_not(None),
            )
            .limit(1)
        )
        avatar_url = (await session.execute(avatar_stmt)).scalar_one_or_none()
        if avatar_url:
            customer.avatar_url = avatar_url
            session.add(customer)
    return await course_service.enroll_customer(
        session, course_id=course_id, customer=customer, fire_events=False
    )


@router.get(
    "/{course_id}",
    summary="Get Enrolled Course",
)
async def get_enrolled_course(
    course_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    customer_id = get_customer_id(auth_subject)
    enrollment = await course_service.get_enrollment_for_customer(
        session, customer_id, course_id
    )
    if enrollment is None:
        # Org members always have access to their own org's courses.
        enrollment = await _ensure_instructor_enrollment(
            session, auth_subject, course_id
        )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Course not found or not enrolled")

    progress_items = await course_service.get_progress_for_enrollment(
        session, enrollment_id=enrollment.id
    )
    completed_ids = {str(p.lesson_id) for p in progress_items}
    positions = await course_service.get_watch_positions_for_enrollment(
        session, enrollment_id=enrollment.id, completed_lesson_ids=completed_ids
    )

    course = enrollment.course
    now = datetime.now(tz=UTC)
    enrolled_at = enrollment.enrolled_at

    customer = await session.get(Customer, customer_id)
    customer_name = customer.name if customer else None
    # Real customers get their own avatar (set during the first-sign-in
    # onboarding flow or the Settings menu). The admin acting as a
    # student — an org member's own customer account (preview flow), or
    # a legacy @course-preview.invalid sandbox — falls back to the org's
    # avatar (logo.dev fallback when the creator hasn't uploaded one) so
    # the composer pill reads as the admin themselves.
    customer_avatar_url: str | None = customer.avatar_url if customer else None
    if customer_avatar_url is None and customer is not None:
        viewer_email = (customer.email or "").lower()
        is_admin_viewer = viewer_email.endswith("@course-preview.invalid")
        if not is_admin_viewer and viewer_email:
            is_admin_viewer = viewer_email in await _instructor_emails(
                session, course.organization_id
            )
        if is_admin_viewer:
            from polar.models.organization import Organization

            org = await session.get(Organization, customer.organization_id)
            if org is not None:
                customer_avatar_url = org.avatar_url

    modules, accessible_ids = _build_module_list(
        course, course.paywall_position, enrolled_at, now, completed_ids
    )
    flat_lessons, flat_accessible_ids = _build_flat_lesson_list(
        course, course.paywall_position, enrolled_at, now, completed_ids
    )

    # Progress only counts lessons the student can actually access —
    # and never bonus-section lessons (the extras don't gate 100%).
    counted_ids = flat_accessible_ids - _bonus_lesson_ids(course)
    total_lessons = len(counted_ids)
    completed_count = len(completed_ids & counted_ids)

    return {
        "enrollment_id": str(enrollment.id),
        "enrolled_at": enrolled_at.isoformat(),
        "customer_name": customer_name,
        "customer_avatar_url": customer_avatar_url,
        "progress": {
            "total_lessons": total_lessons,
            "completed_lessons": completed_count,
            "completion_percent": (
                round(completed_count / total_lessons * 100, 1)
                if total_lessons
                else 0.0
            ),
            # lesson_id -> completed_at. The client type has always
            # declared this map; the payload previously omitted it and
            # relied solely on each lesson's `completed` flag.
            "completed": {
                str(p.lesson_id): p.completed_at.isoformat()
                for p in progress_items
            },
            # Partial watch positions (fraction 0..1) for started-but-not-
            # completed lessons, so progress follows the student across
            # devices instead of living only in localStorage.
            "positions": positions,
        },
        "course": {
            "id": str(course.id),
            "title": course.title,
            "description": course.description,
            "thumbnail_url": course.thumbnail_url,
            "thumbnail_object_position": course.thumbnail_object_position,
            "instructor_name": course.instructor_name,
            "instructor_bio": course.instructor_bio,
            "trailer_url": course.trailer_url,
            "instructor_name_italic": course.instructor_name_italic,
            "instructor_name_bold": course.instructor_name_bold,
            "instructor_name_uppercase": course.instructor_name_uppercase,
            "course_type": course.course_type,
            "format": course.format,
            "paywall_enabled": course.paywall_enabled,
            "paywall_position": course.paywall_position,
            # Onboarding presentation choices — the portal renders the hero
            # and lesson-card layout the creator picked at create time.
            "hero_variant": getattr(course, "hero_variant", "cover"),
            "lesson_card_variant": getattr(
                course, "lesson_card_variant", "catalog"
            ),
            "trial_mode": getattr(course, "trial_mode", "free_preview"),
            "landing_overrides": course.landing_overrides,
            "modules": modules,
            "lessons": flat_lessons,
        },
    }


@router.post(
    "/{course_id}/lessons/{lesson_id}/quiz-attempt",
    response_model=QuizAttemptResult,
    summary="Submit Quiz Attempt",
)
async def submit_quiz_attempt(
    course_id: UUID,
    lesson_id: UUID,
    submission: QuizAttemptSubmission,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> QuizAttemptResult:
    customer_id = get_customer_id(auth_subject)
    enrollment, lesson = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )

    if lesson.content_type != "quiz":
        raise HTTPException(status_code=400, detail="Lesson is not a quiz")

    config = lesson.content or {}
    questions = list(config.get("questions") or [])
    if not questions:
        raise HTTPException(status_code=400, detail="Quiz has no questions")

    passing_grade = int(config.get("passing_grade", 70))
    prevent_complete_without_passing = bool(
        config.get("prevent_complete_without_passing", False)
    )

    submitted_by_qid = {a.question_id: set(a.selected_option_ids) for a in submission.answers}

    answer_results: list[QuizAnswerResult] = []
    graded_count = 0
    correct_count = 0
    for question in questions:
        qid = question.get("id")
        if not qid:
            continue
        graded = bool(question.get("graded", True))
        options = question.get("options") or []
        correct_ids = {o["id"] for o in options if o.get("is_correct") and o.get("id")}
        explanations = {
            o["id"]: o["explanation"]
            for o in options
            if o.get("id") and o.get("explanation")
        }
        selected = submitted_by_qid.get(qid, set())
        is_correct = bool(graded) and selected == correct_ids and len(correct_ids) > 0
        if graded:
            graded_count += 1
            if is_correct:
                correct_count += 1
        answer_results.append(
            QuizAnswerResult(
                question_id=qid,
                correct=is_correct,
                correct_option_ids=list(correct_ids),
                explanations=explanations,
            )
        )

    score = (correct_count / graded_count * 100) if graded_count else 100.0
    passed = score >= passing_grade if graded_count else True

    if passed or not prevent_complete_without_passing:
        await course_service.mark_lesson_complete(
            session, enrollment_id=enrollment.id, lesson_id=lesson_id
        )

    return QuizAttemptResult(
        score=round(score, 1),
        passed=passed,
        passing_grade=passing_grade,
        total_questions=graded_count,
        correct_count=correct_count,
        answers=answer_results,
    )


@router.post(
    "/{course_id}/lessons/{lesson_id}/playback-url",
    summary="Mint Lesson Playback URL",
)
async def mint_lesson_playback_url(
    course_id: UUID,
    lesson_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str | None]:
    """Authorize and mint a signed Mux playback URL for the lesson.

    The client should call this endpoint each time it starts video
    playback. Doing so records one view against the course owner's
    monthly video-view quota. When the org has exhausted its quota,
    this endpoint returns 402 and no playback URL is issued — the
    customer sees an explanatory message instead of the video.
    """
    customer_id = get_customer_id(auth_subject)
    enrollment, lesson = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    if lesson.content_type != "video":
        raise HTTPException(
            status_code=400, detail="Lesson is not a video lesson"
        )
    playback_id = getattr(lesson, "mux_playback_id", None)
    if not playback_id:
        raise HTTPException(
            status_code=404, detail="Lesson video is not available yet"
        )
    if getattr(lesson, "mux_status", None) == "quota_exceeded":
        # The creator's video-hours quota was already exceeded when this
        # asset finished processing; the course/endpoints.py webhook
        # handler refused to count it. Refuse to mint a playback URL too
        # — otherwise we'd serve the video for free past the cap.
        raise HTTPException(
            status_code=402,
            detail=(
                "This lesson is unavailable because the course owner's "
                "video-hours quota was exceeded when it was uploaded."
            ),
        )

    lesson_repo = CourseLessonRepository.from_session(session)
    organization_id = await lesson_repo.get_organization_id_for_lesson(lesson.id)
    if organization_id is not None:
        org_repo = OrganizationRepository.from_session(session)
        organization = await org_repo.get_by_id(organization_id)
        if organization is not None:
            try:
                await enforce(
                    session,
                    organization,
                    QuotaKey.video_views_monthly,
                    requested_storage_units=1,
                )
            except QuotaExceededError as exc:
                raise HTTPException(
                    status_code=402, detail=exc.message
                ) from exc
            emit_video_viewed(session, organization_id=organization.id)
    _ = enrollment

    return {
        "mux_playback_id": playback_id,
        "mux_playback_url": mux_client.playback_url(playback_id),
        # Storyboard VTT for hover-scrub thumbnails. Read-only metadata on
        # the same asset the play was just authorized for — no extra quota.
        "mux_storyboard_url": mux_client.storyboard_url(playback_id),
    }


@router.post(
    "/{course_id}/lessons/{lesson_id}/complete",
    status_code=204,
    summary="Mark Lesson Complete",
)
async def mark_lesson_complete(
    course_id: UUID,
    lesson_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    enrollment, lesson = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    # Quiz lessons must be completed via the quiz-attempt endpoint so the
    # passing-grade rule (prevent_complete_without_passing) is enforced.
    if lesson.content_type == "quiz":
        raise HTTPException(
            status_code=400,
            detail=(
                "Quiz lessons can only be completed by submitting a quiz attempt"
            ),
        )
    await course_service.mark_lesson_complete(
        session, enrollment_id=enrollment.id, lesson_id=lesson_id
    )


@router.post(
    "/{course_id}/lessons/{lesson_id}/watch-progress",
    status_code=204,
    summary="Record Watch Progress",
)
async def record_watch_progress(
    course_id: UUID,
    lesson_id: UUID,
    payload: WatchProgressUpdate,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Persist a partial watch position for a video lesson.

    The player reports the current position as a fraction of the lesson's
    duration. Stored server-side so partial progress survives closing the
    tab, follows the student across devices, and is visible to the
    instructor in the course editor's Customers tab.

    This fires every ~10s per active viewer, so the check is deliberately
    lighter than _verify_lesson_in_enrolled_course: two indexed lookups
    (active enrollment + published lesson in this course) instead of
    hydrating the full course tree and recomputing drip/paywall access —
    a position write is only useful for lessons the student can already
    play, and playback itself is gated by the playback-url endpoint.
    """
    customer_id = get_customer_id(auth_subject)
    enrollment_repo = CourseEnrollmentRepository.from_session(session)
    enrollment_id = await enrollment_repo.get_active_id_for_customer_course(
        customer_id, course_id
    )
    if enrollment_id is None:
        raise HTTPException(status_code=404, detail="Course not found or not enrolled")

    lesson_repo = CourseLessonRepository.from_session(session)
    if not await lesson_repo.is_published_in_course(lesson_id, course_id):
        raise HTTPException(status_code=404, detail="Lesson not found")

    await course_service.record_watch_progress(
        session,
        enrollment_id=enrollment_id,
        lesson_id=lesson_id,
        fraction=payload.fraction,
    )


@router.get(
    "/{course_id}/progress",
    summary="Get Course Progress",
)
async def get_course_progress(
    course_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> CourseProgressRead:
    customer_id = get_customer_id(auth_subject)
    enrollment = await course_service.get_enrollment_for_customer(
        session, customer_id, course_id
    )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Course not found or not enrolled")

    progress_items = await course_service.get_progress_for_enrollment(
        session, enrollment_id=enrollment.id
    )
    course = enrollment.course
    now = datetime.now(tz=UTC)
    completed_ids = {str(p.lesson_id) for p in progress_items}

    # Use the flat lesson list logic so progress matches the flat lesson list response
    _, accessible_ids = _build_flat_lesson_list(
        course,
        course.paywall_position,
        enrollment.enrolled_at,
        now,
        completed_ids,
    )
    total = len(accessible_ids)
    completed = len(completed_ids & accessible_ids)

    return CourseProgressRead(
        total_lessons=total,
        completed_lessons=completed,
        completion_percent=round(completed / total * 100, 1) if total else 0.0,
        completed={
            str(p.lesson_id): p.completed_at.isoformat() for p in progress_items
        },
        positions=await course_service.get_watch_positions_for_enrollment(
            session,
            enrollment_id=enrollment.id,
            completed_lesson_ids=completed_ids,
        ),
    )


@router.delete(
    "/{course_id}/progress",
    status_code=204,
    summary="Reset Course Progress",
)
async def reset_course_progress(
    course_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Wipe ALL progress for the authenticated customer's enrollment in this
    course — completed lessons and partial watch positions — so the student
    starts from zero. The portal's "Reset progress" action; scoped to the
    caller's own enrollment, it can never touch another student's data.
    """
    customer_id = get_customer_id(auth_subject)
    enrollment_repo = CourseEnrollmentRepository.from_session(session)
    enrollment_id = await enrollment_repo.get_active_id_for_customer_course(
        customer_id, course_id
    )
    if enrollment_id is None:
        raise HTTPException(status_code=404, detail="Course not found or not enrolled")
    await course_service.reset_progress_for_enrollment(
        session, enrollment_id=enrollment_id
    )


@router.get(
    "/{course_id}/landing",
    summary="Get Course Landing Page",
)
async def get_course_landing(
    course_id: UUID,
    auth_subject: auth.CustomerPortalLandingRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get course landing page data with public lesson list.

    This endpoint is used for both authenticated and unauthenticated users.
    For enrolled users, includes all lessons (with gating status).
    For non-enrolled users (or anonymous visitors), includes only free
    preview lessons.
    """
    # Anonymous visitors have no customer; only resolve a customer id when
    # the auth subject is actually a Customer or Member.
    customer_id = (
        get_customer_id(auth_subject)
        if is_customer(auth_subject) or is_member(auth_subject)
        else None
    )
    now = datetime.now(tz=UTC)

    # Load the course
    course = await course_service.get_by_id(session, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check if customer is enrolled
    enrollment = None
    if customer_id:
        enrollment = await course_service.get_enrollment_for_customer(
            session, customer_id, course_id
        )

    # Non-enrolled visitors only get the landing for a course that is actually
    # public. Enrolled customers bypass this — they may keep watching a course
    # whose product was later archived.
    if enrollment is None and not await _course_is_publicly_visible(session, course):
        raise HTTPException(status_code=404, detail="Course not found")

    # Build lesson list based on enrollment
    if enrollment:
        # Enrolled: show all accessible lessons with gating info
        progress_items = await course_service.get_progress_for_enrollment(
            session, enrollment_id=enrollment.id
        )
        completed_ids = {str(p.lesson_id) for p in progress_items}
        flat_lessons, _ = _build_flat_lesson_list(
            course, course.paywall_position, enrollment.enrolled_at, now, completed_ids
        )
        has_access = True
    else:
        # Not enrolled: return every published lesson so the public landing
        # can render both the free preview grid and the paywall CTA (with
        # locked-lesson previews). Sensitive fields are stripped from
        # locked lessons.
        flat_lessons = []
        # Flatten in (module.position, lesson.position) order so the global
        # index used by the paywall slice matches what the studio outline
        # shows. Sorting by `lesson.position` alone scrambled cross-module
        # ordering because lesson positions reset per module — that meant
        # paywall_position=3 could pick the wrong three lessons.
        published_lessons = []
        for module in sorted(course.modules, key=lambda m: m.position):
            for lesson in sorted(module.lessons, key=lambda l: l.position):
                if lesson.published:
                    published_lessons.append(lesson)

        # The free-preview slice for non-enrolled visitors is driven by the
        # paywall, with two rules that match the studio outline AND the public
        # PublicPortalView render:
        #   1. paywall_enabled is authoritative — when the toggle is off there
        #      is no positional paywall, only explicitly-flagged previews.
        #   2. The is_free_preview flag WINS — a lesson the creator marked free
        #      is free even if it sits past the positional cutoff.
        paywall_at = (
            course.paywall_position
            if (
                course.paywall_enabled
                and course.paywall_position is not None
                and course.paywall_position > 0
            )
            else None
        )

        for idx, lesson in enumerate(published_lessons):
            is_free = bool(lesson.is_free_preview) or (
                paywall_at is not None and idx < paywall_at
            )

            lesson_data = _serialize_lesson(lesson, set(), accessible=is_free)
            lesson_data["is_free_preview"] = is_free
            lesson_data["locked"] = not is_free
            lesson_data["locked_until"] = None
            flat_lessons.append(lesson_data)
        has_access = False

    # Calculate total duration
    total_duration = sum(l.get("duration_seconds") or 0 for l in flat_lessons)

    media = (course.landing_overrides or {}).get("media") or {}
    log.info(
        "course.landing served",
        extra={
            "course_id": str(course.id),
            "thumbnail_url": course.thumbnail_url,
            "trailer_url": course.trailer_url,
            "media_slot_ids": sorted(media.keys()),
            "lesson_ids": [l.get("id") for l in flat_lessons],
        },
    )
    # Modules (id + title + position) so the public landing's "Sections"
    # roadmap can render the same one-card-per-module layout the dashboard
    # customize tab shows. We don't include lessons here — `flat_lessons`
    # already covers what the public page needs.
    modules_public = [
        {
            "id": str(m.id),
            "title": m.title,
            "description": m.description,
            "position": m.position,
        }
        for m in sorted(course.modules, key=lambda m: m.position)
    ]

    # Series-only "Episode Sample" block. Self-contained: we embed the
    # playback id / signed playback url / title / poster on the sample
    # payload itself, so the frontend doesn't have to look the lesson up
    # in `flat_lessons` (which strips mux_* fields for any lesson that
    # isn't free-preview — the sample is meant as a promotional slice that
    # intentionally bypasses the paywall boundary, per product spec).
    #
    # Gates: lesson must still exist on the course, AND its mux asset must
    # be ready to play. Either failing means we omit the block; the editor
    # banner separately tells the creator the sample is misconfigured.
    sample_payload = None
    raw_sample = course.sample
    if (
        raw_sample
        and raw_sample.get("enabled")
        and raw_sample.get("lesson_id")
    ):
        target_lesson_id = str(raw_sample["lesson_id"])
        for module in course.modules:
            for lesson in module.lessons:
                if str(lesson.id) == target_lesson_id:
                    if (lesson.mux_status or "").lower() == "ready":
                        playback_id = getattr(lesson, "mux_playback_id", None)
                        # Do NOT inline a signed playback URL here. Like lesson
                        # bodies, the sample clip's URL is minted on demand via
                        # POST /{course_id}/sample/playback-url so the play is
                        # counted against the org's video-view quota instead of
                        # handing a full-episode URL to every visitor and
                        # crawler that loads the page, unmetered. The id +
                        # poster + window are enough for the client to render
                        # the block and request playback when the clip is
                        # actually scrolled into view.
                        sample_payload = {
                            "enabled": True,
                            "lesson_id": target_lesson_id,
                            "start_seconds": int(
                                raw_sample.get("start_seconds") or 0
                            ),
                            "duration_seconds": int(
                                raw_sample.get("duration_seconds") or 0
                            ),
                            "lesson_title": lesson.title,
                            "thumbnail_url": getattr(
                                lesson, "thumbnail_url", None
                            ),
                            "mux_playback_id": playback_id,
                            "mux_playback_url": None,
                        }
                    break

    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "thumbnail_url": course.thumbnail_url,
        "thumbnail_object_position": course.thumbnail_object_position,
        "instructor_name": course.instructor_name,
        "instructor_bio": course.instructor_bio,
        "trailer_url": course.trailer_url,
        "instructor_name_italic": course.instructor_name_italic,
        "instructor_name_bold": course.instructor_name_bold,
        "instructor_name_uppercase": course.instructor_name_uppercase,
        "course_type": course.course_type,
        "format": course.format,
        # Presentation choices — the public portal-style landing renders
        # the hero / lesson-card layout and trial affordance the creator
        # picked during onboarding.
        "hero_variant": getattr(course, "hero_variant", "cover"),
        "lesson_card_variant": getattr(course, "lesson_card_variant", "catalog"),
        "trial_mode": getattr(course, "trial_mode", "free_preview"),
        "lesson_count": len(flat_lessons),
        "total_duration_seconds": total_duration,
        "landing_overrides": course.landing_overrides,
        "lessons": flat_lessons,
        "modules": modules_public,
        "paywall_enabled": bool(course.paywall_enabled),
        "paywall_position": course.paywall_position,
        "has_access": has_access,
        "sample": sample_payload,
    }


@router.get(
    "/by-product/{product_id}/landing",
    summary="Get Course Landing Page by Product",
)
async def get_course_landing_by_product(
    product_id: UUID,
    auth_subject: auth.CustomerPortalLandingRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Public landing data for a course, looked up by its product id.

    Mirrors `/courses/{course_id}/landing` but lets the public storefront
    page resolve the course without first needing the course id.
    """
    course = await course_service.get_by_product(session, product_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return await get_course_landing(
        course_id=course.id, auth_subject=auth_subject, session=session
    )


@router.post(
    "/{course_id}/sample/playback-url",
    summary="Mint Sample Clip Playback URL",
)
async def mint_sample_playback_url(
    course_id: UUID,
    auth_subject: auth.CustomerPortalLandingRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Authorize and mint a signed Mux playback URL for the landing sample clip.

    Called by the public landing when the sample is scrolled into view, so the
    full-episode URL is never embedded in the page (where every crawler would
    get it) and each play counts against the course owner's monthly video-view
    quota — the same enforcement lesson playback goes through. The clip can run
    past the free-preview boundary by design (it's a marketing slice), but it is
    no longer unmetered or handed out up-front.
    """
    customer_id = (
        get_customer_id(auth_subject)
        if is_customer(auth_subject) or is_member(auth_subject)
        else None
    )

    course = await course_service.get_by_id(session, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    # Same visibility gate as the landing: a non-enrolled visitor only gets the
    # sample for a publicly visible course.
    enrollment = None
    if customer_id:
        enrollment = await course_service.get_enrollment_for_customer(
            session, customer_id, course_id
        )
    if enrollment is None and not await _course_is_publicly_visible(session, course):
        raise HTTPException(status_code=404, detail="Course not found")

    raw_sample = course.sample
    if not (raw_sample and raw_sample.get("enabled") and raw_sample.get("lesson_id")):
        raise HTTPException(status_code=404, detail="No sample configured")

    target_lesson_id = str(raw_sample["lesson_id"])
    sample_lesson = None
    for module in course.modules:
        for lesson in module.lessons:
            if str(lesson.id) == target_lesson_id:
                sample_lesson = lesson
                break
        if sample_lesson is not None:
            break

    if sample_lesson is None or (sample_lesson.mux_status or "").lower() != "ready":
        raise HTTPException(status_code=404, detail="Sample is not available")
    playback_id = getattr(sample_lesson, "mux_playback_id", None)
    if not playback_id:
        raise HTTPException(status_code=404, detail="Sample is not available")

    # Count the play against the org's monthly video-view quota, exactly like
    # lesson playback. When the quota is exhausted the clip stops playing (402)
    # rather than serving unmetered views.
    org_repo = OrganizationRepository.from_session(session)
    organization = await org_repo.get_by_id(course.organization_id)
    if organization is not None:
        try:
            await enforce(
                session,
                organization,
                QuotaKey.video_views_monthly,
                requested_storage_units=1,
            )
        except QuotaExceededError as exc:
            raise HTTPException(status_code=402, detail=exc.message) from exc
        emit_video_viewed(session, organization_id=organization.id)

    return {
        "mux_playback_id": playback_id,
        "mux_playback_url": mux_client.playback_url(playback_id),
        "start_seconds": int(raw_sample.get("start_seconds") or 0),
        "duration_seconds": int(raw_sample.get("duration_seconds") or 0),
    }


@router.post(
    "/{course_id}/lessons/{lesson_id}/preview-playback-url",
    summary="Mint Free-Preview Playback URL",
)
async def mint_preview_playback_url(
    course_id: UUID,
    lesson_id: UUID,
    auth_subject: auth.CustomerPortalLandingRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Authorize and mint a signed Mux playback URL for a free-preview lesson.

    The public landing plays free previews to anonymous visitors, who can't
    hit the enrolled playback-url endpoint. Without this, previews only work
    while assets use the public playback policy — turning on signed video
    silently breaks every free preview. Each play is counted against the
    course owner's monthly video-view quota, exactly like enrolled playback.
    """
    course = await course_service.get_by_id(session, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if not await _course_is_publicly_visible(session, course):
        raise HTTPException(status_code=404, detail="Course not found")

    lesson = None
    published_lessons = []
    for module in sorted(course.modules, key=lambda m: m.position):
        for candidate in sorted(module.lessons, key=lambda l: l.position):
            if candidate.published:
                published_lessons.append(candidate)
            if candidate.id == lesson_id:
                lesson = candidate
    if lesson is None or not lesson.published:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Free per the same rules the landing uses: the explicit flag wins,
    # lessons before an enabled positional paywall are free, and with the
    # paywall off entirely every published lesson is watchable before
    # purchase (mirrors the landing's allLessonsOpen semantics).
    paywall_at = (
        course.paywall_position
        if (
            course.paywall_enabled
            and course.paywall_position is not None
            and course.paywall_position > 0
        )
        else None
    )
    lesson_index = next(
        (i for i, l in enumerate(published_lessons) if l.id == lesson.id), None
    )
    is_free = (
        bool(lesson.is_free_preview)
        or not course.paywall_enabled
        or (
            paywall_at is not None
            and lesson_index is not None
            and lesson_index < paywall_at
        )
    )
    if not is_free:
        raise HTTPException(status_code=403, detail="Lesson is not a free preview")

    playback_id = getattr(lesson, "mux_playback_id", None)
    if not playback_id or (lesson.mux_status or "").lower() != "ready":
        raise HTTPException(
            status_code=404, detail="Lesson video is not available yet"
        )

    org_repo = OrganizationRepository.from_session(session)
    organization = await org_repo.get_by_id(course.organization_id)
    if organization is not None:
        try:
            await enforce(
                session,
                organization,
                QuotaKey.video_views_monthly,
                requested_storage_units=1,
            )
        except QuotaExceededError as exc:
            raise HTTPException(status_code=402, detail=exc.message) from exc
        emit_video_viewed(session, organization_id=organization.id)

    return {
        "mux_playback_id": playback_id,
        "mux_playback_url": mux_client.playback_url(playback_id),
        "mux_storyboard_url": mux_client.storyboard_url(playback_id),
    }


@router.post(
    "/{course_id}/lessons/{lesson_id}/can-access",
    summary="Check Lesson Access",
)
async def check_lesson_access(
    course_id: UUID,
    lesson_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Check if the current user can access a lesson.

    Returns { "can_access": bool, "reason": str, "locked_until": timestamp | null }
    Reasons: "free" (is_free_preview), "enrolled" (has product), "paywall", "drip", "unpublished"
    """
    customer_id = get_customer_id(auth_subject)
    now = datetime.now(tz=UTC)

    # Load lesson
    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_by_id(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Verify lesson is in this course
    course = await course_service.get_by_id(session, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    # Resolve the lesson's module from the course tree (course.modules is
    # selectin-loaded, unlike lesson.module which is lazy="raise"). Reject if
    # the lesson belongs to a different course — prevents probing other
    # courses' lesson ids through this endpoint.
    module = next((m for m in course.modules if m.id == lesson.module_id), None)
    if module is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Check if lesson is published
    if not lesson.published:
        return {"can_access": False, "reason": "unpublished", "locked_until": None}

    # Check if free preview
    if lesson.is_free_preview:
        return {"can_access": True, "reason": "free", "locked_until": None}

    # Check enrollment
    enrollment = None
    if customer_id:
        enrollment = await course_service.get_enrollment_for_customer(
            session, customer_id, course_id
        )

    if not enrollment:
        return {"can_access": False, "reason": "paywall", "locked_until": None}

    # User is enrolled — the only remaining gate is the drip schedule, on the
    # lesson and/or its module.
    is_accessible, locked_until = course_service.calculate_lesson_accessibility(
        lesson,
        course.paywall_position,
        enrollment.enrolled_at,
        now,
        module=module,
    )

    if is_accessible:
        return {"can_access": True, "reason": "enrolled", "locked_until": None}
    if locked_until:
        # A locked enrolled lesson is always a drip / scheduled-release lock
        # (release_at or drip_days, on the lesson or its module) — never a
        # paywall, which only gates non-enrolled visitors.
        return {
            "can_access": False,
            "reason": "drip",
            "locked_until": locked_until.isoformat(),
        }
    return {"can_access": False, "reason": "paywall", "locked_until": None}


# --- Lesson comments ---


async def _verify_lesson_in_enrolled_course(
    session: AsyncSession,
    customer_id: UUID,
    course_id: UUID,
    lesson_id: UUID,
):
    """Return (enrollment, lesson) or raise 404. Also rejects unpublished lessons
    and lessons that aren't in modules currently accessible to the student
    (paywall/drip)."""
    enrollment = await course_service.get_enrollment_for_customer(
        session, customer_id, course_id
    )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Course not found or not enrolled")

    lesson_repo = CourseLessonRepository.from_session(session)
    lesson = await lesson_repo.get_by_id(lesson_id)
    if lesson is None or not lesson.published:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Walk the course tree to confirm the lesson is in this course AND accessible.
    course = enrollment.course
    now = datetime.now(tz=UTC)
    _, accessible_ids = _build_module_list(
        course, course.paywall_position, enrollment.enrolled_at, now, set()
    )
    if str(lesson.id) not in accessible_ids:
        raise HTTPException(status_code=403, detail="Lesson is not accessible")

    return enrollment, lesson


def _resolve_author_name(name: str | None, email: str | None) -> str | None:
    if name:
        stripped = name.strip()
        if stripped:
            return stripped
    if email:
        local_part = email.split("@", 1)[0].strip()
        if local_part:
            return local_part
    return None


async def _instructor_emails(
    session: AsyncSession, organization_id: UUID
) -> set[str]:
    """Lowercased emails of the course org's members. A portal customer
    whose email matches one of these is the instructor — they authored the
    course and moderate its discussion (badge, pin, heart, delete-any)."""
    stmt = (
        select(User.email)
        .join(UserOrganization, UserOrganization.user_id == User.id)
        .where(
            UserOrganization.organization_id == organization_id,
            UserOrganization.deleted_at.is_(None),
        )
    )
    result = await session.execute(stmt)
    return {row.email.lower() for row in result if row.email}


async def _load_authors(
    session: AsyncSession,
    enrollment_ids: set[UUID],
    instructor_emails: set[str] | None = None,
) -> dict[UUID, LessonCommentAuthor]:
    if not enrollment_ids:
        return {}
    stmt = select(
        CourseEnrollment.id,
        Customer.name,
        Customer.email,
        Customer.avatar_url,
    ).join(Customer, Customer.id == CourseEnrollment.customer_id).where(
        CourseEnrollment.id.in_(enrollment_ids)
    )
    result = await session.execute(stmt)
    return {
        row.id: LessonCommentAuthor(
            enrollment_id=row.id,
            name=_resolve_author_name(row.name, row.email),
            avatar_url=row.avatar_url,
            # Legacy preview-sandbox authors were the admin acting as a
            # student — badge them as the instructor too so old comments
            # read as one identity.
            is_instructor=bool(
                row.email
                and (
                    row.email.lower().endswith("@course-preview.invalid")
                    or (
                        instructor_emails
                        and row.email.lower() in instructor_emails
                    )
                )
            ),
        )
        for row in result
    }


async def _viewer_is_instructor(
    session: AsyncSession,
    auth_subject: AuthSubject[CustomerSubject | Member],
    organization_id: UUID,
    instructor_emails: set[str] | None = None,
) -> tuple[bool, set[str]]:
    """(is_instructor, instructor_emails) for the requesting customer.
    Pass pre-fetched emails to skip the org-members query."""
    if instructor_emails is None:
        instructor_emails = await _instructor_emails(session, organization_id)
    customer = get_customer(auth_subject)
    email = (customer.email or "").lower()
    return bool(email and email in instructor_emails), instructor_emails


@router.get(
    "/{course_id}/lessons/{lesson_id}/comments",
    response_model=list[LessonCommentRead],
    summary="List Lesson Comments",
)
async def list_lesson_comments(
    course_id: UUID,
    lesson_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[LessonCommentRead]:
    customer_id = get_customer_id(auth_subject)
    enrollment, lesson = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    if getattr(lesson, "comments_mode", "visible") == "hidden":
        raise HTTPException(
            status_code=403, detail="Comments are disabled for this lesson"
        )
    comments = await course_service.list_lesson_comments(
        session, lesson_id=lesson_id
    )
    # Instructor identity: badge authors whose customer email matches an
    # org member, and tell the client whether the VIEWER is the instructor
    # (drives pin / heart / delete-any controls).
    viewer_instructor, instructor_emails = await _viewer_is_instructor(
        session, auth_subject, enrollment.course.organization_id
    )
    authors = await _load_authors(
        session, {c.enrollment_id for c in comments}, instructor_emails
    )
    # Hearts — total per comment + whether this enrollment has liked it.
    # Tombstones never carry likes (their body is stripped too).
    like_targets = [c.id for c in comments if c.deleted_at is None]
    like_counts, liked_ids = await course_service.get_lesson_comment_likes(
        session, comment_ids=like_targets, enrollment_id=enrollment.id
    )
    return [
        LessonCommentRead(
            id=c.id,
            lesson_id=c.lesson_id,
            parent_id=c.parent_id,
            # Soft-deleted comments come back as tombstones so their
            # replies remain in the tree — strip the body so the deleted
            # message itself is not surfaced.
            content="" if c.deleted_at is not None else c.content,
            created_at=c.created_at,
            is_own=c.enrollment_id == enrollment.id and c.deleted_at is None,
            author=authors.get(
                c.enrollment_id,
                LessonCommentAuthor(enrollment_id=c.enrollment_id, name=None),
            ),
            likes=like_counts.get(c.id, 0),
            liked=c.id in liked_ids,
            pinned=c.pinned_at is not None and c.deleted_at is None,
            instructor_hearted=(
                c.instructor_hearted_at is not None and c.deleted_at is None
            ),
            viewer_is_instructor=viewer_instructor,
            deleted=c.deleted_at is not None,
        )
        for c in comments
    ]


@router.post(
    "/{course_id}/lessons/{lesson_id}/comments",
    response_model=LessonCommentRead,
    status_code=201,
    summary="Create Lesson Comment",
)
async def create_lesson_comment(
    course_id: UUID,
    lesson_id: UUID,
    payload: LessonCommentCreate,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> LessonCommentRead:
    customer_id = get_customer_id(auth_subject)
    enrollment, lesson = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    mode = getattr(lesson, "comments_mode", "visible")
    if mode != "visible":
        raise HTTPException(
            status_code=403,
            detail=(
                "Comments are disabled for this lesson"
                if mode == "hidden"
                else "Comments are locked for this lesson"
            ),
        )
    try:
        comment = await course_service.create_lesson_comment(
            session,
            enrollment_id=enrollment.id,
            lesson_id=lesson_id,
            content=payload.content,
            parent_id=payload.parent_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    viewer_instructor, instructor_emails = await _viewer_is_instructor(
        session, auth_subject, enrollment.course.organization_id
    )
    authors = await _load_authors(session, {enrollment.id}, instructor_emails)
    return LessonCommentRead(
        id=comment.id,
        lesson_id=comment.lesson_id,
        parent_id=comment.parent_id,
        content=comment.content,
        created_at=comment.created_at,
        is_own=True,
        author=authors.get(
            enrollment.id,
            LessonCommentAuthor(enrollment_id=enrollment.id, name=None),
        ),
        viewer_is_instructor=viewer_instructor,
    )


@router.delete(
    "/{course_id}/lessons/{lesson_id}/comments/{comment_id}",
    status_code=204,
    summary="Delete Lesson Comment",
)
async def delete_lesson_comment(
    course_id: UUID,
    lesson_id: UUID,
    comment_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    enrollment, _ = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    comment = await course_service.get_lesson_comment(session, comment_id)
    if comment is None or comment.lesson_id != lesson_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Own comments are always deletable; the instructor moderates the whole
    # discussion (YouTube-style) and can delete anyone's.
    if comment.enrollment_id != enrollment.id:
        viewer_instructor, _ = await _viewer_is_instructor(
            session, auth_subject, enrollment.course.organization_id
        )
        if not viewer_instructor:
            raise HTTPException(status_code=403, detail="Not your comment")
    await course_service.delete_lesson_comment(session, comment)


async def _get_moderatable_comment(
    session: AsyncSession,
    auth_subject: AuthSubject[CustomerSubject | Member],
    course_id: UUID,
    lesson_id: UUID,
    comment_id: UUID,
):
    """Shared guard for pin/heart: lesson must be enrolled + accessible,
    the comment live, and the viewer the course's instructor."""
    customer_id = get_customer_id(auth_subject)
    enrollment, _ = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    viewer_instructor, _ = await _viewer_is_instructor(
        session, auth_subject, enrollment.course.organization_id
    )
    if not viewer_instructor:
        raise HTTPException(
            status_code=403, detail="Only the instructor can moderate comments"
        )
    comment = await course_service.get_lesson_comment(session, comment_id)
    if (
        comment is None
        or comment.lesson_id != lesson_id
        or comment.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


@router.post(
    "/{course_id}/lessons/{lesson_id}/comments/{comment_id}/pin",
    summary="Toggle Lesson Comment Pin",
)
async def pin_lesson_comment(
    course_id: UUID,
    lesson_id: UUID,
    comment_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    comment = await _get_moderatable_comment(
        session, auth_subject, course_id, lesson_id, comment_id
    )
    pinned = await course_service.toggle_lesson_comment_pin(
        session, comment=comment
    )
    return {"pinned": pinned}


@router.post(
    "/{course_id}/lessons/{lesson_id}/comments/{comment_id}/instructor-heart",
    summary="Toggle Instructor Heart",
)
async def instructor_heart_comment(
    course_id: UUID,
    lesson_id: UUID,
    comment_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    comment = await _get_moderatable_comment(
        session, auth_subject, course_id, lesson_id, comment_id
    )
    hearted = await course_service.toggle_instructor_heart(
        session, comment=comment
    )
    return {"hearted": hearted}


@router.post(
    "/{course_id}/lessons/{lesson_id}/comments/{comment_id}/like",
    response_model=LessonCommentLikeRead,
    summary="Toggle Lesson Comment Like",
)
async def like_lesson_comment(
    course_id: UUID,
    lesson_id: UUID,
    comment_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> LessonCommentLikeRead:
    customer_id = get_customer_id(auth_subject)
    enrollment, lesson = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    # Hidden comments aren't shown, so they can't be liked either.
    if getattr(lesson, "comments_mode", "visible") == "hidden":
        raise HTTPException(
            status_code=403, detail="Comments are disabled for this lesson"
        )
    comment = await course_service.get_lesson_comment(session, comment_id)
    if (
        comment is None
        or comment.lesson_id != lesson_id
        or comment.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Comment not found")
    liked, likes = await course_service.toggle_lesson_comment_like(
        session, comment=comment, enrollment_id=enrollment.id
    )
    return LessonCommentLikeRead(liked=liked, likes=likes)


# ── Notes ──────────────────────────────────────────────────────────────────


@router.get(
    "/{course_id}/notes",
    response_model=list[CourseNoteRead],
    summary="List All Notes for Course",
)
async def list_course_notes(
    course_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CourseNoteRead]:
    customer_id = get_customer_id(auth_subject)
    enrollment = await course_service.get_enrollment_for_customer(session, customer_id, course_id)
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Course not found or not enrolled")
    notes = await course_service.list_course_notes(session, enrollment.id)
    return [
        CourseNoteRead(id=n.id, lesson_id=n.lesson_id, content=n.content, created_at=n.created_at, modified_at=n.modified_at)
        for n in notes
    ]


@router.put(
    "/{course_id}/lessons/{lesson_id}/notes",
    response_model=CourseNoteRead,
    summary="Upsert Lesson Note",
)
async def upsert_lesson_note(
    course_id: UUID,
    lesson_id: UUID,
    payload: CourseNoteUpsert,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> CourseNoteRead:
    customer_id = get_customer_id(auth_subject)
    enrollment, _ = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    note = await course_service.upsert_lesson_note(
        session,
        enrollment_id=enrollment.id,
        lesson_id=lesson_id,
        content=payload.content,
    )
    return CourseNoteRead(id=note.id, lesson_id=note.lesson_id, content=note.content, created_at=note.created_at, modified_at=note.modified_at)


@router.delete(
    "/{course_id}/lessons/{lesson_id}/notes",
    status_code=204,
    summary="Delete Lesson Note",
)
async def delete_lesson_note(
    course_id: UUID,
    lesson_id: UUID,
    auth_subject: auth.CustomerPortalUnionRead,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    customer_id = get_customer_id(auth_subject)
    enrollment, _ = await _verify_lesson_in_enrolled_course(
        session, customer_id, course_id, lesson_id
    )
    note = await course_service.get_lesson_note(session, enrollment.id, lesson_id)
    if note is None:
        return
    await course_service.delete_lesson_note(session, note)
