from uuid import UUID, uuid4

from fastapi import Depends, File, HTTPException, Query, UploadFile
from pydantic import UUID4

from polar.config import settings
from polar.exceptions import ResourceNotFound
from polar.integrations.aws.s3 import S3Service
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from polar.routing import APIRouter

from .auth import EmailSequencesRead, EmailSequencesWrite
from .schemas import (
    EmailSequence as EmailSequenceSchema,
)
from .schemas import (
    EmailSequenceAnalytics,
    EmailSequenceCreate,
    EmailSequenceEnrollRequest,
    EmailSequenceFireEvent,
    EmailSequenceFireEventResult,
    EmailSequenceFromTemplate,
    EmailSequenceReorderItem,
    EmailSequenceStepCreate,
    EmailSequenceStepTestSend,
    EmailSequenceStepUpdate,
    EmailSequenceUpdate,
)
from .schemas import (
    EmailSequenceEnrollment as EmailSequenceEnrollmentSchema,
)
from .schemas import (
    EmailSequenceStep as EmailSequenceStepSchema,
)
from .schemas import (
    EmailSequenceStepAnalytics as EmailSequenceStepAnalyticsSchema,
)
from .schemas import (
    EmailSequenceTemplate as EmailSequenceTemplateSchema,
)
from .service import AlreadyEnrolled
from .service import email_sequence as sequence_service
from .templates import TEMPLATES, get_template

router = APIRouter(prefix="/email-sequences", tags=["email-sequences"])


@router.get("/", response_model=ListResource[EmailSequenceSchema])
async def list_email_sequences(
    auth_subject: EmailSequencesRead,
    pagination: PaginationParamsQuery,
    organization_id: UUID | None = Query(default=None),
    course_id: UUID | None = Query(default=None),
    lesson_id: UUID | None = Query(default=None),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[EmailSequenceSchema]:
    results, count = await sequence_service.list(
        session,
        auth_subject,
        organization_id=organization_id,
        course_id=course_id,
        lesson_id=lesson_id,
        pagination=pagination,
    )
    return ListResource.from_paginated_results(
        [EmailSequenceSchema.model_validate(r, from_attributes=True) for r in results],
        count,
        pagination,
    )


@router.post("/", response_model=EmailSequenceSchema, status_code=201)
async def create_email_sequence(
    auth_subject: EmailSequencesWrite,
    sequence_create: EmailSequenceCreate,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceSchema:
    # Merge an optional top-level flow_doc into trigger_config so the editor
    # can ship a fully-authored flow on first save (audit issue #27).
    trigger_config = dict(sequence_create.trigger_config or {})
    if sequence_create.flow_doc is not None:
        trigger_config["flow_doc"] = sequence_create.flow_doc

    sequence = await sequence_service.create(
        session,
        organization_id=organization_id,
        name=sequence_create.name,
        description=sequence_create.description,
        trigger_type=sequence_create.trigger_type,
        trigger_config=trigger_config,
        course_id=sequence_create.course_id,
        lesson_id=sequence_create.lesson_id,
    )
    return EmailSequenceSchema.model_validate(sequence, from_attributes=True)


# ── Templates ─────────────────────────────────────────────────────────────────
# Registered before /{sequence_id} so the literal path wins.

@router.get("/templates", response_model=list[EmailSequenceTemplateSchema])
async def list_email_sequence_templates(
    auth_subject: EmailSequencesRead,
) -> list[EmailSequenceTemplateSchema]:
    return [
        EmailSequenceTemplateSchema(
            slug=t["slug"],
            name=t["name"],
            description=t["description"],
            category=t["category"],
            trigger_type=t["trigger_type"],
            step_count=len(t["steps"]),
            flow_doc=t.get("flow_doc"),
        )
        for t in TEMPLATES
    ]


@router.post("/from-template", response_model=EmailSequenceSchema, status_code=201)
async def create_email_sequence_from_template(
    auth_subject: EmailSequencesWrite,
    body: EmailSequenceFromTemplate,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceSchema:
    template = get_template(body.slug)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    sequence = await sequence_service.create_from_template(
        session,
        organization_id=organization_id,
        template=dict(template),
        course_id=body.course_id,
        lesson_id=body.lesson_id,
    )
    return EmailSequenceSchema.model_validate(sequence, from_attributes=True)


# ── Image upload ──────────────────────────────────────────────────────────────

@router.post("/upload-image")
async def upload_sequence_image(
    auth_subject: EmailSequencesWrite,
    organization_id: UUID = Query(),
    upload: UploadFile = File(..., alias="file"),
) -> dict[str, str]:
    """Upload an inline image used in a sequence step.

    Mirrors the broadcast image-upload endpoint: stores into the public
    assets bucket so recipients (not just the author's browser) can load it.
    """
    content_type = upload.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await upload.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 10 MB")

    ext = (upload.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"

    path = f"email-marketing/{organization_id}/{uuid4().hex}.{ext}"
    s3 = S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
    s3.upload(data, path, content_type)
    return {"url": s3.get_public_url(path)}


@router.get("/{sequence_id}", response_model=EmailSequenceSchema)
async def get_email_sequence(
    auth_subject: EmailSequencesRead,
    sequence_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailSequenceSchema:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    return EmailSequenceSchema.model_validate(sequence, from_attributes=True)


@router.patch("/{sequence_id}", response_model=EmailSequenceSchema)
async def update_email_sequence(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    sequence_update: EmailSequenceUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceSchema:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    updated = await sequence_service.update(
        session,
        sequence,
        name=sequence_update.name,
        description=sequence_update.description,
        trigger_type=sequence_update.trigger_type,
        trigger_config=sequence_update.trigger_config,
        status=sequence_update.status,
        course_id=sequence_update.course_id,
        lesson_id=sequence_update.lesson_id,
    )
    return EmailSequenceSchema.model_validate(updated, from_attributes=True)


@router.delete("/{sequence_id}", status_code=204)
async def delete_email_sequence(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    await sequence_service.delete(session, sequence)


@router.post("/{sequence_id}/duplicate", response_model=EmailSequenceSchema, status_code=201)
async def duplicate_email_sequence(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceSchema:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    clone = await sequence_service.duplicate(session, sequence)
    return EmailSequenceSchema.model_validate(clone, from_attributes=True)


# ── Steps ─────────────────────────────────────────────────────────────────────

@router.get("/{sequence_id}/steps", response_model=list[EmailSequenceStepSchema])
async def list_sequence_steps(
    auth_subject: EmailSequencesRead,
    sequence_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[EmailSequenceStepSchema]:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    steps = await sequence_service.get_steps(session, sequence_id)
    return [EmailSequenceStepSchema.model_validate(s, from_attributes=True) for s in steps]


@router.post("/{sequence_id}/steps", response_model=EmailSequenceStepSchema, status_code=201)
async def add_sequence_step(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    step_create: EmailSequenceStepCreate,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceStepSchema:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    step = await sequence_service.add_step(
        session,
        sequence,
        position=step_create.position,
        delay_hours=step_create.delay_hours,
        subject=step_create.subject,
        sender_name=step_create.sender_name,
        sender_email=step_create.sender_email,
        reply_to_email=step_create.reply_to_email,
        content_html=step_create.content_html,
        content_json=step_create.content_json,
        flow_step_id=step_create.flow_step_id,
    )
    return EmailSequenceStepSchema.model_validate(step, from_attributes=True)


@router.post("/{sequence_id}/steps/reorder", status_code=204)
async def reorder_sequence_steps(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    items: list[EmailSequenceReorderItem],
    session: AsyncSession = Depends(get_db_session),
) -> None:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    await sequence_service.reorder_steps(
        session, [{"id": item.id, "position": item.position} for item in items]
    )


@router.patch("/{sequence_id}/steps/{step_id}", response_model=EmailSequenceStepSchema)
async def update_sequence_step(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    step_id: UUID4,
    step_update: EmailSequenceStepUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceStepSchema:
    from .repository import EmailSequenceRepository

    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()

    repository = EmailSequenceRepository.from_session(session)
    step = await repository.get_step(step_id)
    if step is None or step.sequence_id != sequence_id:
        raise ResourceNotFound()

    updated_step = await sequence_service.update_step(
        session,
        step,
        position=step_update.position,
        delay_hours=step_update.delay_hours,
        subject=step_update.subject,
        sender_name=step_update.sender_name,
        sender_email=step_update.sender_email,
        reply_to_email=step_update.reply_to_email,
        content_html=step_update.content_html,
        content_json=step_update.content_json,
        flow_step_id=step_update.flow_step_id,
    )
    return EmailSequenceStepSchema.model_validate(updated_step, from_attributes=True)


@router.delete("/{sequence_id}/steps/{step_id}", status_code=204)
async def delete_sequence_step(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    step_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    from .repository import EmailSequenceRepository

    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()

    repository = EmailSequenceRepository.from_session(session)
    step = await repository.get_step(step_id)
    if step is None or step.sequence_id != sequence_id:
        raise ResourceNotFound()

    await sequence_service.delete_step(session, step)


# ── Enrollments ───────────────────────────────────────────────────────────────

@router.get("/{sequence_id}/enrollments", response_model=list[EmailSequenceEnrollmentSchema])
async def list_sequence_enrollments(
    auth_subject: EmailSequencesRead,
    sequence_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[EmailSequenceEnrollmentSchema]:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    enrollments = await sequence_service.get_enrollments(session, sequence_id)
    return [EmailSequenceEnrollmentSchema.model_validate(e, from_attributes=True) for e in enrollments]


@router.post("/{sequence_id}/enrollments", response_model=EmailSequenceEnrollmentSchema, status_code=201)
async def enroll_subscriber(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    enroll_request: EmailSequenceEnrollRequest,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceEnrollmentSchema:
    from fastapi import HTTPException

    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()

    try:
        enrollment = await sequence_service.enroll(session, sequence, enroll_request.subscriber_id)
    except AlreadyEnrolled as e:
        raise HTTPException(status_code=409, detail=str(e))

    return EmailSequenceEnrollmentSchema.model_validate(enrollment, from_attributes=True)


@router.delete("/{sequence_id}/enrollments/{subscriber_id}", status_code=204)
async def unenroll_subscriber(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    subscriber_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    await sequence_service.unenroll(session, sequence_id, subscriber_id)


# ── Step send-test ────────────────────────────────────────────────────────────

@router.post("/{sequence_id}/steps/{step_id}/test", status_code=204)
async def send_test_sequence_step(
    auth_subject: EmailSequencesWrite,
    sequence_id: UUID4,
    step_id: UUID4,
    body: EmailSequenceStepTestSend,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    from .repository import EmailSequenceRepository

    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()

    repository = EmailSequenceRepository.from_session(session)
    step = await repository.get_step(step_id)
    if step is None or step.sequence_id != sequence_id:
        raise ResourceNotFound()

    await sequence_service.send_test_step(session, step, to_email=body.email)


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get(
    "/{sequence_id}/step-analytics",
    response_model=list[EmailSequenceStepAnalyticsSchema],
)
async def get_sequence_step_analytics(
    auth_subject: EmailSequencesRead,
    sequence_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[EmailSequenceStepAnalyticsSchema]:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    rows = await sequence_service.get_step_analytics(session, sequence_id)
    return [EmailSequenceStepAnalyticsSchema(**row) for row in rows]


# ── Event firing (resumes parked until-event waits) ──────────────────────────


@router.post(
    "/events/fire",
    response_model=EmailSequenceFireEventResult,
)
async def fire_sequence_event(
    auth_subject: EmailSequencesWrite,
    body: EmailSequenceFireEvent,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSequenceFireEventResult:
    """Fire a named event for a subscriber.

    Resumes any active enrolment parked on `wait{ mode:'until-event',
    event:<name> }` for that subscriber.
    """
    from polar.email_subscriber.repository import EmailSubscriberRepository
    from polar.models.email_subscriber import EmailSubscriber

    repo = EmailSubscriberRepository.from_session(session)
    statement = repo.get_readable_statement(auth_subject).where(
        EmailSubscriber.id == body.subscriber_id
    )
    subscriber = await repo.get_one_or_none(statement)
    if subscriber is None:
        raise ResourceNotFound()

    from .events import fire_event

    woken = await fire_event(
        session,
        organization_id=subscriber.organization_id,
        subscriber_id=subscriber.id,
        event_name=body.event_name,
    )
    return EmailSequenceFireEventResult(
        woken_enrolment_ids=[w.id for w in woken]
    )


@router.get("/{sequence_id}/analytics", response_model=EmailSequenceAnalytics)
async def get_sequence_analytics(
    auth_subject: EmailSequencesRead,
    sequence_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailSequenceAnalytics:
    sequence = await sequence_service.get_by_id(session, auth_subject, sequence_id)
    if sequence is None:
        raise ResourceNotFound()
    analytics = await sequence_service.get_analytics(session, sequence_id)
    return EmailSequenceAnalytics(**analytics)
