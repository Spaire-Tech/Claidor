from uuid import UUID

from fastapi import Depends, HTTPException, Query
from pydantic import UUID4

from polar.email_subscriber.auth import EmailSubscribersRead, EmailSubscribersWrite
from polar.exceptions import ResourceNotFound
from polar.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from polar.routing import APIRouter

from .schemas import (
    EmailSegment as EmailSegmentSchema,
)
from .schemas import (
    EmailSegmentCreate,
    EmailSegmentSubscriberAction,
    EmailSegmentUpdate,
)
from .service import email_segment as email_segment_service

router = APIRouter(prefix="/email-segments", tags=["email-segments"])


@router.get("/", response_model=list[EmailSegmentSchema])
async def list_email_segments(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[EmailSegmentSchema]:
    segments = await email_segment_service.list(session, organization_id)
    return [EmailSegmentSchema(**s) for s in segments]


@router.post("/", response_model=EmailSegmentSchema, status_code=201)
async def create_email_segment(
    auth_subject: EmailSubscribersWrite,
    segment_create: EmailSegmentCreate,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> EmailSegmentSchema:
    from .service import EmailSegmentSlugTaken

    try:
        segment = await email_segment_service.create(
            session,
            organization_id=organization_id,
            name=segment_create.name,
            slug=segment_create.slug,
            type=segment_create.type,
            product_id=segment_create.product_id,
        )
    except EmailSegmentSlugTaken as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return EmailSegmentSchema(
        id=segment.id,
        organization_id=segment.organization_id,
        name=segment.name,
        slug=segment.slug,
        type=segment.type,
        product_id=segment.product_id,
        is_system=segment.is_system,
        subscriber_count=0,
        created_at=segment.created_at,
        modified_at=segment.modified_at,
    )


@router.patch("/{segment_id}", response_model=EmailSegmentSchema)
async def update_email_segment(
    auth_subject: EmailSubscribersWrite,
    segment_id: UUID4,
    segment_update: EmailSegmentUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> EmailSegmentSchema:
    segment = await email_segment_service.get_by_id(
        session, auth_subject, segment_id
    )
    if segment is None:
        raise ResourceNotFound()
    updated = await email_segment_service.update(
        session, segment, name=segment_update.name
    )
    return EmailSegmentSchema(
        id=updated.id,
        organization_id=updated.organization_id,
        name=updated.name,
        slug=updated.slug,
        type=updated.type,
        product_id=updated.product_id,
        is_system=updated.is_system,
        subscriber_count=0,
        created_at=updated.created_at,
        modified_at=updated.modified_at,
    )


@router.delete("/{segment_id}", status_code=204)
async def delete_email_segment(
    auth_subject: EmailSubscribersWrite,
    segment_id: UUID4,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    segment = await email_segment_service.get_by_id(
        session, auth_subject, segment_id
    )
    if segment is None:
        raise ResourceNotFound()
    await email_segment_service.delete(session, segment)


@router.post("/ensure-system", response_model=list[EmailSegmentSchema], status_code=201)
async def ensure_system_segments(
    auth_subject: EmailSubscribersRead,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> list[EmailSegmentSchema]:
    """Ensure system segments exist for an organization."""
    created = await email_segment_service.ensure_system_segments(
        session, organization_id
    )
    return [
        EmailSegmentSchema(
            id=s.id,
            organization_id=s.organization_id,
            name=s.name,
            slug=s.slug,
            type=s.type,
            product_id=s.product_id,
            is_system=s.is_system,
            subscriber_count=0,
            created_at=s.created_at,
            modified_at=s.modified_at,
        )
        for s in created
    ]


@router.post("/{segment_id}/subscribers", status_code=200)
async def add_subscribers_to_segment(
    auth_subject: EmailSubscribersWrite,
    segment_id: UUID4,
    action: EmailSegmentSubscriberAction,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    segment = await email_segment_service.get_by_id(
        session, auth_subject, segment_id
    )
    if segment is None:
        raise ResourceNotFound()
    added = await email_segment_service.add_subscribers(
        session, segment, action.subscriber_ids
    )
    return {"added": added}


@router.delete("/{segment_id}/subscribers", status_code=200)
async def remove_subscribers_from_segment(
    auth_subject: EmailSubscribersWrite,
    segment_id: UUID4,
    action: EmailSegmentSubscriberAction,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    segment = await email_segment_service.get_by_id(
        session, auth_subject, segment_id
    )
    if segment is None:
        raise ResourceNotFound()
    removed = await email_segment_service.remove_subscribers(
        session, segment, action.subscriber_ids
    )
    return {"removed": removed}
