import csv
import io
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import UUID4

from polar.config import settings
from polar.course.repository import CourseRepository
from polar.email_copy import ai as email_copy_ai
from polar.email_subscriber.auth import EmailSubscribersRead, EmailSubscribersWrite
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

from .schemas import (
    EmailBroadcast as EmailBroadcastSchema,
)
from .schemas import (
    EmailBroadcastABTest as EmailBroadcastABTestSchema,
)
from .schemas import (
    EmailBroadcastABTestState,
    EmailBroadcastABTestUpsert,
    EmailBroadcastABVariantStats,
    EmailBroadcastAnalytics,
    EmailBroadcastCreate,
    EmailBroadcastDailyEngagementPoint,
    EmailBroadcastDeviceShare,
    EmailBroadcastRowAnalytics,
    EmailBroadcastSchedule,
    EmailBroadcastSendRow,
    EmailBroadcastTestInline,
    EmailBroadcastTestSend,
    EmailBroadcastTopLink,
    EmailBroadcastUpdate,
    EmailBroadcastWithAnalytics,
    EmailCopyRequest,
    EmailCopyResponse,
)
from .service import email_broadcast as email_broadcast_service

router = APIRouter(prefix="/email-broadcasts", tags=["email-broadcasts"])


@router.get("/", response_model=ListResource[EmailBroadcastWithAnalytics])
async def list_email_broadcasts(
    auth_subject: EmailSubscribersRead,
    pagination: PaginationParamsQuery,
    organization_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    include_analytics: bool = Query(default=True),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[EmailBroadcastWithAnalytics]:
    results, count = await email_broadcast_service.list(
        session,
        auth_subject,
        organization_id=organization_id,
        status=status,
        q=q,
        pagination=pagination,
    )

    analytics_by_id: dict = {}
    if include_analytics and results:
        analytics_by_id = await email_broadcast_service.list_analytics(
            session, [r.id for r in results]
        )

    items: list[EmailBroadcastWithAnalytics] = []
    for r in results:
        base = EmailBroadcastSchema.model_validate(r, from_attributes=True)
        a = analytics_by_id.get(r.id)
        items.append(
            EmailBroadcastWithAnalytics(
                **base.model_dump(),
                analytics=EmailBroadcastRowAnalytics(**a) if a else None,
            )
        )
    return ListResource.from_paginated_results(items, count, pagination)


@router.get("/aggregate-analytics")
async def get_broadcast_aggregate_analytics(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int | None = Query(
        default=None,
        ge=1,
        le=365,
        description="Constrain to the last N days; omit for lifetime.",
    ),
    compare_prior: bool = Query(
        default=False,
        description="Include prior-window aggregate + delta map.",
    ),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> dict:
    return await email_broadcast_service.get_aggregate_analytics(
        session,
        organization_id,
        days=days,
        compare_prior=compare_prior,
    )


@router.get("/engagement-heatmap")
async def get_broadcast_engagement_heatmap(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int = Query(default=90, ge=7, le=365),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> dict:
    return await email_broadcast_service.get_engagement_heatmap(
        session, organization_id, days=days
    )


@router.get("/export-analytics")
async def export_broadcast_analytics(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Response:
    """Return a CSV bundle of the analytics screen.

    Sections: aggregate metrics + delta, daily engagement, top
    broadcasts (sent within the window), top links, devices.
    """
    payload = await email_broadcast_service.get_aggregate_analytics(
        session, organization_id, days=days, compare_prior=True
    )
    daily = await email_broadcast_service.get_daily_engagement(
        session, organization_id, days=days
    )
    top_links = await email_broadcast_service.get_top_links(
        session, organization_id, days=days, limit=20
    )
    devices = await email_broadcast_service.get_device_share(
        session, organization_id, days=max(days, 30)
    )

    def _cell(v: object) -> object:
        # csv.writer renders None as the literal string "None" which is
        # confusing in spreadsheets; render empty cells instead so users
        # can see "data unavailable" vs "0".
        return "" if v is None else v

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([f"# Email analytics export — last {days} days"])
    writer.writerow([])
    writer.writerow(["Metric", "Value", "Prior", "Delta"])
    current = payload.get("current") or {}
    prior = payload.get("prior") or {}
    delta = payload.get("delta") or {}
    rows = [
        ("Total sent", current.get("total_sent"), prior.get("total_sent"), delta.get("total_sent_pct")),
        ("Open rate %", current.get("open_rate"), prior.get("open_rate"), delta.get("open_rate_pt")),
        ("Click rate %", current.get("click_rate"), prior.get("click_rate"), delta.get("click_rate_pt")),
        ("Unsub rate %", current.get("unsub_rate"), prior.get("unsub_rate"), delta.get("unsub_rate_pt")),
    ]
    for label, cur, pri, d in rows:
        writer.writerow([label, _cell(cur), _cell(pri), _cell(d)])
    writer.writerow([])
    writer.writerow(["Day", "Open rate %", "Click rate %"])
    for r in daily:
        writer.writerow([
            r.get("day"),
            _cell(r.get("open_rate")),
            _cell(r.get("click_rate")),
        ])
    writer.writerow([])
    writer.writerow(["Top links — URL", "Clicks", "CTR %"])
    for r in top_links:
        writer.writerow([r.get("url"), r.get("clicks"), r.get("ctr")])
    writer.writerow([])
    writer.writerow(["Device", "Share %"])
    for r in devices:
        writer.writerow([r.get("name"), r.get("share")])

    csv_bytes = buf.getvalue().encode("utf-8")
    today = datetime.now(UTC).date().isoformat()
    filename = f"email-analytics-{today}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/top-links", response_model=list[EmailBroadcastTopLink])
async def get_broadcast_top_links(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int = Query(default=14),
    limit: int = Query(default=10),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[dict]:
    return await email_broadcast_service.get_top_links(
        session, organization_id, days=days, limit=limit
    )


@router.get("/devices", response_model=list[EmailBroadcastDeviceShare])
async def get_broadcast_devices(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int = Query(default=90),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[dict]:
    return await email_broadcast_service.get_device_share(
        session, organization_id, days=days
    )


@router.get(
    "/daily-engagement", response_model=list[EmailBroadcastDailyEngagementPoint]
)
async def get_broadcast_daily_engagement(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int = Query(default=14),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[dict]:
    return await email_broadcast_service.get_daily_engagement(
        session, organization_id, days=days
    )


@router.get("/daily-sends")
async def get_broadcast_daily_sends(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    days: int = Query(default=30),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[dict]:
    return await email_broadcast_service.get_daily_sends(
        session, organization_id, days
    )


@router.post("/", response_model=EmailBroadcastSchema, status_code=201)
async def create_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_create: EmailBroadcastCreate,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.create(
        session,
        organization_id=organization_id,
        subject=broadcast_create.subject,
        preview_text=broadcast_create.preview_text,
        sender_name=broadcast_create.sender_name,
        sender_email=broadcast_create.sender_email,
        reply_to_email=broadcast_create.reply_to_email,
        content_json=broadcast_create.content_json,
        content_html=broadcast_create.content_html,
        segment_id=broadcast_create.segment_id,
        filter_rules=broadcast_create.filter_rules,
    )
    return EmailBroadcastSchema.model_validate(broadcast, from_attributes=True)


@router.post("/generate-copy", response_model=EmailCopyResponse)
async def generate_email_copy(
    auth_subject: EmailSubscribersWrite,
    body: EmailCopyRequest,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailCopyResponse:
    """Generate lifecycle email recap copy from a course (the Welcome note)."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503, detail="AI copy generation is not configured."
        )
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_readable_by_id(body.course_id, auth_subject)
    if course is None:
        raise ResourceNotFound()

    lessons = [
        {"title": lesson.title}
        for module in course.modules
        for lesson in module.lessons
    ]
    brief = email_copy_ai.build_course_brief(
        {
            "title": course.title,
            "description": course.description,
            "instructor_name": course.instructor_name,
            "lessons": lessons,
        }
    )
    copy = await email_copy_ai.generate_email_copy(
        api_key=settings.ANTHROPIC_API_KEY,
        model=settings.EMAIL_COPY_MODEL,
        brief=brief,
        moment=body.moment,
    )
    return EmailCopyResponse(
        subject=copy.subject,
        preview=copy.preview,
        heading=copy.heading,
        body=copy.body,
    )


@router.get("/{broadcast_id}", response_model=EmailBroadcastSchema)
async def get_email_broadcast(
    auth_subject: EmailSubscribersRead,
    broadcast_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    return EmailBroadcastSchema.model_validate(broadcast, from_attributes=True)


@router.patch("/{broadcast_id}", response_model=EmailBroadcastSchema)
async def update_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    broadcast_update: EmailBroadcastUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    # Only forward fields the client actually sent so we don't blank out values.
    update_dict = broadcast_update.model_dump(exclude_unset=True)
    updated = await email_broadcast_service.update(
        session, broadcast, update=update_dict
    )
    return EmailBroadcastSchema.model_validate(updated, from_attributes=True)


@router.post("/{broadcast_id}/send", response_model=EmailBroadcastSchema)
async def send_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    sent = await email_broadcast_service.send(session, broadcast)
    return EmailBroadcastSchema.model_validate(sent, from_attributes=True)


@router.post("/{broadcast_id}/schedule", response_model=EmailBroadcastSchema)
async def schedule_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    schedule: EmailBroadcastSchedule,
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    from .service import BroadcastAlreadySent
    try:
        scheduled = await email_broadcast_service.schedule(
            session, broadcast, scheduled_at=schedule.scheduled_at
        )
    except BroadcastAlreadySent as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=str(e))
    return EmailBroadcastSchema.model_validate(scheduled, from_attributes=True)


@router.get("/{broadcast_id}/analytics", response_model=EmailBroadcastAnalytics)
async def get_email_broadcast_analytics(
    auth_subject: EmailSubscribersRead,
    broadcast_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailBroadcastAnalytics:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    analytics = await email_broadcast_service.get_analytics(session, broadcast_id)
    return EmailBroadcastAnalytics(**analytics)


@router.get(
    "/{broadcast_id}/sends", response_model=ListResource[EmailBroadcastSendRow]
)
async def list_email_broadcast_sends(
    auth_subject: EmailSubscribersRead,
    broadcast_id: UUID4,
    pagination: PaginationParamsQuery,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[EmailBroadcastSendRow]:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    sends, count = await email_broadcast_service.list_sends(
        session, broadcast_id, pagination=pagination
    )
    items = [
        EmailBroadcastSendRow(
            id=s.id,
            subscriber_id=s.subscriber_id,
            subscriber_email=s.subscriber.email if s.subscriber else "",
            subscriber_name=s.subscriber.name if s.subscriber else None,
            status=s.status,
            sent_at=s.sent_at,
            opened_at=s.opened_at,
            open_count=s.open_count,
            clicked_at=s.clicked_at,
            click_count=s.click_count,
            bounced_at=s.bounced_at,
            unsubscribed_at=s.unsubscribed_at,
        )
        for s in sends
    ]
    return ListResource.from_paginated_results(items, count, pagination)


@router.post("/{broadcast_id}/duplicate", response_model=EmailBroadcastSchema, status_code=201)
async def duplicate_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    copy = await email_broadcast_service.duplicate(session, broadcast)
    return EmailBroadcastSchema.model_validate(copy, from_attributes=True)


@router.post("/{broadcast_id}/cancel-schedule", response_model=EmailBroadcastSchema)
async def cancel_email_broadcast_schedule(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    updated = await email_broadcast_service.cancel_schedule(session, broadcast)
    return EmailBroadcastSchema.model_validate(updated, from_attributes=True)


@router.get(
    "/{broadcast_id}/ab-test", response_model=EmailBroadcastABTestState
)
async def get_email_broadcast_ab_test(
    auth_subject: EmailSubscribersRead,
    broadcast_id: UUID4,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EmailBroadcastABTestState:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    config = await email_broadcast_service.get_ab_test(session, broadcast_id)
    variants: dict[str, EmailBroadcastABVariantStats] | None = None
    if config is not None:
        raw = await email_broadcast_service.get_ab_analytics(session, broadcast_id)
        variants = {
            v: EmailBroadcastABVariantStats(**raw[v]) for v in raw
        }
    return EmailBroadcastABTestState(
        config=EmailBroadcastABTestSchema.model_validate(
            config, from_attributes=True
        )
        if config
        else None,
        variants=variants,
    )


@router.put(
    "/{broadcast_id}/ab-test", response_model=EmailBroadcastABTestSchema
)
async def upsert_email_broadcast_ab_test(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    body: EmailBroadcastABTestUpsert,
    session: AsyncSession = Depends(get_db_session),
) -> EmailBroadcastABTestSchema:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    from fastapi import HTTPException

    from .service import BroadcastError

    try:
        ab_test = await email_broadcast_service.upsert_ab_test(
            session,
            broadcast,
            subject_b=body.subject_b,
            slice_pct=body.slice_pct,
            decide_after_minutes=body.decide_after_minutes,
            winner_metric=body.winner_metric,
        )
    except BroadcastError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return EmailBroadcastABTestSchema.model_validate(
        ab_test, from_attributes=True
    )


@router.delete("/{broadcast_id}/ab-test", status_code=204)
async def delete_email_broadcast_ab_test(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    from fastapi import HTTPException

    from .service import BroadcastError

    try:
        await email_broadcast_service.delete_ab_test(session, broadcast)
    except BroadcastError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/upload-image")
async def upload_email_image(
    auth_subject: EmailSubscribersWrite,
    organization_id: UUID = Query(),
    upload: UploadFile = File(..., alias="file"),
) -> dict[str, str]:
    """Upload an inline image for use in a broadcast.

    The composer used to set image src to a `blob:` URL produced by
    `URL.createObjectURL`, which only worked in the author's browser —
    recipients saw a broken image. This endpoint uploads the file to the
    public assets bucket and returns a permanent URL the composer stores
    on the block.
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


@router.post("/{broadcast_id}/test", status_code=204)
async def send_test_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    body: EmailBroadcastTestSend,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Send a one-off test rendering of this broadcast to a single inbox."""
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    await email_broadcast_service.send_test(
        session, broadcast, to_email=body.email
    )


@router.post("/test-inline", status_code=204)
async def send_test_inline_email(
    auth_subject: EmailSubscribersWrite,
    body: EmailBroadcastTestInline,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Send a test of in-progress authored content (not a saved broadcast).

    Used by the sequence email editor's "Send test to me" — the creator sees
    the exact email in their own inbox before saving it into a sequence.
    """
    from polar.auth.models import is_user

    to_email = body.to_email
    if not to_email and is_user(auth_subject):
        to_email = auth_subject.subject.email
    if not to_email:
        raise HTTPException(
            status_code=400, detail="No recipient email for the test send"
        )
    await email_broadcast_service.send_test_inline(
        session,
        organization_id=organization_id,
        subject=body.subject,
        content_html=body.content_html,
        preview_text=body.preview_text,
        sender_name=body.sender_name,
        to_email=to_email,
    )


@router.delete("/{broadcast_id}", status_code=204)
async def archive_email_broadcast(
    auth_subject: EmailSubscribersWrite,
    broadcast_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    broadcast = await email_broadcast_service.get_by_id(
        session, auth_subject, broadcast_id
    )
    if broadcast is None:
        raise ResourceNotFound()
    await email_broadcast_service.archive(session, broadcast)
