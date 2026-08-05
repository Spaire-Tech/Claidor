"""HTTP routes for community events.

Two surfaces, mounted into the existing community routers:

  creator_router  /v1/community/{course_id}/events
    - Host (course owner): create, update, delete, list (sees own events).
    - Auth: CommunityCreatorWrite (user subject required for writes).

  customer_router /v1/customer-portal/community/{course_id}/events
    - Student: list, get, RSVP toggle.
    - Auth: CommunityCustomerRead/Write.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Response
from pydantic import UUID4

from polar.auth.models import is_user
from polar.course.repository import CourseRepository
from polar.customer_portal.utils import get_customer_id
from polar.kit.utils import utc_now
from polar.models.community_event import CommunityEvent
from polar.models.community_event_announcement import CommunityEventAnnouncement
from polar.models.user import User
from polar.organization.repository import OrganizationRepository
from polar.postgres import AsyncSession, get_db_session

from ._ics import build_event_ics
from .auth import (
    CommunityCreatorRead,
    CommunityCreatorWrite,
    CommunityCustomerRead,
    CommunityCustomerWrite,
)
from .endpoints import creator_router, customer_router, public_router
from .events_repository import (
    CommunityEventAnnouncementRepository,
    CommunityEventRepository,
    CommunityEventRsvpRepository,
)
from .events_schemas import (
    CommunityEventAnnouncementCreate,
    CommunityEventAnnouncementPreviewRequest,
    CommunityEventAnnouncementPreviewResult,
    CommunityEventAnnouncementRead,
    CommunityEventAttendee,
    CommunityEventCreate,
    CommunityEventHost,
    CommunityEventPublic,
    CommunityEventRead,
    CommunityEventRsvpResult,
    CommunityEventUpdate,
)
from .events_service import (
    EventHostMismatch,
    EventNotFound,
    events_service,
    is_live,
    is_past,
)
from .service import community as community_service

CourseID = Annotated[UUID4, ...]
EventID = Annotated[UUID4, ...]


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _require_user_subject(auth_subject) -> UUID:
    if not is_user(auth_subject):
        raise HTTPException(
            status_code=403,
            detail="Only user-authenticated sessions can host events.",
        )
    return auth_subject.subject.id


def _host_from_user(
    user: User,
    instructor_name: str | None,
    *,
    org_avatar_fallback: str | None = None,
) -> CommunityEventHost:
    name = (
        (instructor_name or "").strip() or (user.public_name or "").strip()
        if hasattr(user, "public_name")
        else None
    )
    fallback = (
        getattr(user, "username", None) or getattr(user, "email", None) or "Instructor"
    )
    # Most creators host under their org brand and never set a personal
    # `user.avatar_url`. Falling back to the organization's avatar
    # (their logo, including the logo.dev synth if unset) means the
    # event surfaces always have a real image rather than initials.
    avatar = getattr(user, "avatar_url", None) or org_avatar_fallback
    return CommunityEventHost(
        user_id=user.id,
        name=name or fallback,
        avatar_url=avatar,
    )


async def _event_to_read(
    session: AsyncSession,
    event: CommunityEvent,
    *,
    going: bool,
    instructor_name: str | None,
    org_avatar_fallback: str | None = None,
    hosts_cache: dict[UUID, User] | None = None,
) -> CommunityEventRead:
    # `hosts_cache` is the bulk-loaded {user_id: User} map populated by
    # the list endpoint; falls back to a per-row session.get for single-
    # event paths (create/update/get-by-id) where there's nothing to
    # bulk-load.
    host_user: User | None
    if hosts_cache is not None:
        host_user = hosts_cache.get(event.host_user_id)
    else:
        host_user = await session.get(User, event.host_user_id)
    if host_user is None:
        host = CommunityEventHost(
            user_id=event.host_user_id,
            name="Instructor",
            avatar_url=org_avatar_fallback,
        )
    else:
        host = _host_from_user(
            host_user,
            instructor_name,
            org_avatar_fallback=org_avatar_fallback,
        )

    return CommunityEventRead(
        id=event.id,
        course_id=event.course_id,
        title=event.title,
        type=event.type,  # type: ignore[arg-type]
        description=event.description,
        start_at=event.start_at,
        timezone=event.timezone or "UTC",
        duration_minutes=event.duration_minutes,
        meeting_url=event.meeting_url,
        location=event.location,
        cover_url=event.cover_url,
        cover_object_position=event.cover_object_position,
        notify_on_publish=event.notify_on_publish,
        rsvp_count=event.rsvp_count,
        host=host,
        going=going,
        live=is_live(event),
        past=is_past(event),
        created_at=event.created_at,
        modified_at=event.modified_at,
    )


async def _resolve_org_avatar(
    session: AsyncSession, course: object | None
) -> str | None:
    """Pulls the organization's avatar (real or logo.dev synth) off the
    course's parent org. Used as the host-avatar fallback so event
    cards always have a real image rather than initials — most creators
    host under their org brand and don't set a personal user.avatar_url.
    Returns None when there's no org context (preview surfaces)."""
    if course is None:
        return None
    org_id = getattr(course, "organization_id", None)
    if org_id is None:
        return None
    organization = await OrganizationRepository.from_session(session).get_by_id(org_id)
    return organization.avatar_url if organization is not None else None


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
# CREATOR ROUTES — /v1/community/{course_id}/events/...
# ====================================================================


@creator_router.get(
    "/{course_id}/events",
    response_model=list[CommunityEventRead],
    summary="List Community Events (Creator)",
)
async def list_events_creator(
    course_id: CourseID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityEventRead]:
    await _require_creator_owns_course(session, course_id, auth_subject)
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    instructor_name = course.instructor_name if course else None

    events, _ = await events_service.list_for_course(
        session, course_id=course_id, viewer_customer_id=None
    )
    hosts = await CommunityEventRepository.from_session(session).bulk_load_hosts(
        {e.host_user_id for e in events}
    )
    org_avatar = await _resolve_org_avatar(session, course)
    return [
        await _event_to_read(
            session,
            e,
            going=False,
            instructor_name=instructor_name,
            org_avatar_fallback=org_avatar,
            hosts_cache=hosts,
        )
        for e in events
    ]


@creator_router.post(
    "/{course_id}/events",
    response_model=CommunityEventRead,
    status_code=201,
    summary="Create Community Event",
)
async def create_event_creator(
    course_id: CourseID,
    payload: CommunityEventCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)

    event = await events_service.create(
        session,
        course_id=course_id,
        host_user_id=user_id,
        payload=payload,
    )
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    return await _event_to_read(
        session,
        event,
        going=False,
        instructor_name=course.instructor_name if course else None,
        org_avatar_fallback=await _resolve_org_avatar(session, course),
    )


@creator_router.patch(
    "/{course_id}/events/{event_id}",
    response_model=CommunityEventRead,
    summary="Update Community Event",
)
async def update_event_creator(
    course_id: CourseID,
    event_id: EventID,
    payload: CommunityEventUpdate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventRead:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        event = await events_service.update(
            session,
            event_id=event_id,
            course_id=course_id,
            host_user_id=user_id,
            payload=payload,
        )
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None
    except EventHostMismatch:
        raise HTTPException(
            status_code=403, detail="Only the host can edit this event."
        ) from None
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    return await _event_to_read(
        session,
        event,
        going=False,
        instructor_name=course.instructor_name if course else None,
        org_avatar_fallback=await _resolve_org_avatar(session, course),
    )


@creator_router.delete(
    "/{course_id}/events/{event_id}",
    status_code=204,
    summary="Delete (Cancel) Community Event",
)
async def delete_event_creator(
    course_id: CourseID,
    event_id: EventID,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        await events_service.delete(
            session,
            event_id=event_id,
            course_id=course_id,
            host_user_id=user_id,
        )
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None
    except EventHostMismatch:
        raise HTTPException(
            status_code=403, detail="Only the host can delete this event."
        ) from None


# ====================================================================
# CUSTOMER ROUTES — /v1/customer-portal/community/{course_id}/events/...
# ====================================================================


@customer_router.get(
    "/{course_id}/events",
    response_model=list[CommunityEventRead],
    summary="List Community Events (Customer Portal)",
)
async def list_events_customer(
    course_id: CourseID,
    auth_subject: CommunityCustomerRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityEventRead]:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)

    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(course_id)
    instructor_name = course.instructor_name if course else None

    events, going_map = await events_service.list_for_course(
        session, course_id=course_id, viewer_customer_id=customer_id
    )

    # Surface past events for ~30 days so the Past section stays
    # populated for a reasonable window after the live date.
    cutoff = utc_now() - timedelta(days=30)
    visible: list[CommunityEvent] = []
    for e in events:
        end_at = e.start_at + timedelta(minutes=e.duration_minutes)
        if end_at >= cutoff:
            visible.append(e)

    hosts = await CommunityEventRepository.from_session(session).bulk_load_hosts(
        {e.host_user_id for e in visible}
    )
    org_avatar = await _resolve_org_avatar(session, course)
    return [
        await _event_to_read(
            session,
            e,
            going=going_map.get(e.id, False),
            instructor_name=instructor_name,
            org_avatar_fallback=org_avatar,
            hosts_cache=hosts,
        )
        for e in visible
    ]


@customer_router.post(
    "/{course_id}/events/{event_id}/rsvp",
    response_model=CommunityEventRsvpResult,
    summary="RSVP to Community Event",
)
async def rsvp_event_customer(
    course_id: CourseID,
    event_id: EventID,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventRsvpResult:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    settings = await community_service.assert_community_enabled(session, course_id)
    if not settings.member_rsvp:
        raise HTTPException(
            status_code=403, detail="RSVP is disabled for this community"
        )
    try:
        going, count = await events_service.rsvp(
            session,
            event_id=event_id,
            course_id=course_id,
            customer_id=customer_id,
            going=True,
        )
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None
    return CommunityEventRsvpResult(going=going, rsvp_count=count)


@customer_router.delete(
    "/{course_id}/events/{event_id}/rsvp",
    response_model=CommunityEventRsvpResult,
    summary="Cancel RSVP to Community Event",
)
async def unrsvp_event_customer(
    course_id: CourseID,
    event_id: EventID,
    auth_subject: CommunityCustomerWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventRsvpResult:
    customer_id = get_customer_id(auth_subject)
    await community_service.assert_enrolled(
        session, customer_id=customer_id, course_id=course_id
    )
    await community_service.assert_community_enabled(session, course_id)
    try:
        going, count = await events_service.rsvp(
            session,
            event_id=event_id,
            course_id=course_id,
            customer_id=customer_id,
            going=False,
        )
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None
    return CommunityEventRsvpResult(going=going, rsvp_count=count)


# ====================================================================
# CREATOR — Attendees roster + Announce
# ====================================================================


@creator_router.get(
    "/{course_id}/events/{event_id}/attendees",
    response_model=list[CommunityEventAttendee],
    summary="List Event Attendees (Host)",
)
async def list_event_attendees(
    course_id: CourseID,
    event_id: EventID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityEventAttendee]:
    """Host-only roster: who has a live RSVP, when they made it, with
    enough metadata for the host to recognise them and follow up.

    Email is included because the host is already the data controller
    for enrolled customers (they bill them, message them through the
    portal, etc.) — same trust model as the course members list.
    """
    await _require_creator_owns_course(session, course_id, auth_subject)
    try:
        await events_service.get(session, event_id=event_id, course_id=course_id)
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None

    rows = await CommunityEventRsvpRepository.from_session(
        session
    ).list_attendees_for_event(event_id)

    out: list[CommunityEventAttendee] = []
    for customer, rsvp_at in rows:
        # `name` fallbacks mirror customer-display logic elsewhere —
        # `name` is optional, so fall back to the email local-part rather
        # than rendering "None" in the UI.
        display_name = (customer.name or "").strip() or customer.email.split("@")[0]
        out.append(
            CommunityEventAttendee(
                customer_id=customer.id,
                name=display_name,
                email=customer.email,
                avatar_url=customer.avatar_url,
                rsvp_at=rsvp_at,
            )
        )
    return out


@creator_router.post(
    "/{course_id}/events/{event_id}/announcements",
    response_model=CommunityEventAnnouncementRead,
    status_code=201,
    summary="Send Composed Announcement to Members",
)
async def create_event_announcement(
    course_id: CourseID,
    event_id: EventID,
    payload: CommunityEventAnnouncementCreate,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventAnnouncementRead:
    """Persist a host-composed announcement and (for v1) enqueue the
    fan-out immediately. Replaces the old POST /announce flow which
    re-fired a templated email — this one carries the host's actual
    subject + body so members get a personal note, not a system
    template.
    """
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        announcement = await events_service.create_announcement(
            session,
            event_id=event_id,
            course_id=course_id,
            host_user_id=user_id,
            payload=payload,
        )
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None
    except EventHostMismatch:
        raise HTTPException(
            status_code=403, detail="Only the host can announce this event."
        ) from None
    return _announcement_to_read(announcement)


@creator_router.post(
    "/{course_id}/events/{event_id}/announcements/preview",
    response_model=CommunityEventAnnouncementPreviewResult,
    summary="Preview a Composed Announcement",
)
async def preview_event_announcement(
    course_id: CourseID,
    event_id: EventID,
    payload: CommunityEventAnnouncementPreviewRequest,
    auth_subject: CommunityCreatorWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventAnnouncementPreviewResult:
    """Render the announcement HTML without persisting or sending.

    The composer modal POSTs the current draft on a debounce so the
    preview pane stays in sync as the host edits. Uses the same
    render() path the actual fan-out uses, so the preview is
    byte-equivalent to what recipients will see.
    """
    await _require_creator_owns_course(session, course_id, auth_subject)
    user_id = _require_user_subject(auth_subject)
    try:
        subject, html = await events_service.preview_announcement(
            session,
            event_id=event_id,
            course_id=course_id,
            host_user_id=user_id,
            subject=payload.subject,
            body=payload.body,
        )
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None
    except EventHostMismatch:
        raise HTTPException(
            status_code=403, detail="Only the host can preview announcements."
        ) from None
    return CommunityEventAnnouncementPreviewResult(subject=subject, html=html)


@creator_router.get(
    "/{course_id}/events/{event_id}/announcements",
    response_model=list[CommunityEventAnnouncementRead],
    summary="List Announcements for an Event",
)
async def list_event_announcements(
    course_id: CourseID,
    event_id: EventID,
    auth_subject: CommunityCreatorRead,
    session: AsyncSession = Depends(get_db_session),
) -> list[CommunityEventAnnouncementRead]:
    """Audit list — most-recent first. Useful for the host to confirm
    a fan-out actually went out (status=sent + recipient_count) or to
    spot a failed one to retry."""
    await _require_creator_owns_course(session, course_id, auth_subject)
    try:
        await events_service.get(session, event_id=event_id, course_id=course_id)
    except EventNotFound:
        raise HTTPException(status_code=404, detail="Event not found") from None

    rows = await CommunityEventAnnouncementRepository.from_session(
        session
    ).list_for_event(event_id)
    return [_announcement_to_read(r) for r in rows]


def _announcement_to_read(
    ann: CommunityEventAnnouncement,
) -> CommunityEventAnnouncementRead:
    return CommunityEventAnnouncementRead(
        id=ann.id,
        event_id=ann.event_id,
        course_id=ann.course_id,
        subject=ann.subject,
        body=ann.body,
        status=ann.status,  # type: ignore[arg-type]
        sent_at=ann.sent_at,
        recipient_count=ann.recipient_count,
        created_at=ann.created_at,
        modified_at=ann.modified_at,
    )


# ====================================================================
# PUBLIC — Shareable read + .ics download
# ====================================================================


async def _load_public_event(
    session: AsyncSession, event_id: UUID
) -> tuple[CommunityEvent, str, str]:
    """Returns (event, course_name, organization_slug) or raises 404.

    Used by both public endpoints below. Filters out soft-deleted events
    AND events whose course or organization has gone away — sharing a
    URL whose parent context no longer exists should 404, not leak the
    title of a deleted course.
    """
    repo = CommunityEventRepository.from_session(session)
    event = await repo.get_by_id(event_id)
    if event is None or event.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Event not found")

    course = await CourseRepository.from_session(session).get_by_id(event.course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Event not found")

    organization = await OrganizationRepository.from_session(session).get_by_id(
        course.organization_id
    )
    if organization is None or organization.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Event not found")

    return event, (course.title or "Course"), organization.slug


@public_router.get(
    "/events/{event_id}",
    response_model=CommunityEventPublic,
    summary="Get Community Event (Public Share)",
)
async def get_event_public(
    event_id: EventID,
    session: AsyncSession = Depends(get_db_session),
) -> CommunityEventPublic:
    event, course_name, organization_slug = await _load_public_event(session, event_id)

    host_user = await session.get(User, event.host_user_id)
    course = await CourseRepository.from_session(session).get_by_id(event.course_id)
    instructor_name = course.instructor_name if course else None
    org_avatar = await _resolve_org_avatar(session, course)
    if host_user is None:
        host = CommunityEventHost(
            user_id=event.host_user_id,
            name="Instructor",
            avatar_url=org_avatar,
        )
    else:
        host = _host_from_user(
            host_user,
            instructor_name,
            org_avatar_fallback=org_avatar,
        )

    return CommunityEventPublic(
        id=event.id,
        organization_slug=organization_slug,
        course_id=event.course_id,
        course_name=course_name,
        title=event.title,
        type=event.type,  # type: ignore[arg-type]
        description=event.description,
        start_at=event.start_at,
        timezone=event.timezone or "UTC",
        duration_minutes=event.duration_minutes,
        location=event.location,
        meeting_url=event.meeting_url,
        cover_url=event.cover_url,
        cover_object_position=event.cover_object_position,
        host=host,
        live=is_live(event),
        past=is_past(event),
    )


@public_router.get(
    "/events/{event_id}/ics",
    response_class=Response,
    summary="Download Event Calendar File (.ics)",
)
async def download_event_ics(
    event_id: EventID,
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """Serves the same calendar file the RSVP confirmation email
    attaches. Public so the public event page can deep-link "Add to
    Calendar" without an auth round-trip — the ICS only contains data
    already exposed by GET /events/{event_id}.
    """
    event, _course_name, _organization_slug = await _load_public_event(
        session, event_id
    )

    host_user = await session.get(User, event.host_user_id)
    host_email = getattr(host_user, "email", None) if host_user else None
    host_name = (
        getattr(host_user, "public_name", None) if host_user else None
    ) or "Instructor"

    ics_text = build_event_ics(
        event_id=str(event.id),
        title=event.title,
        description=event.description,
        start_at=event.start_at,
        duration_minutes=event.duration_minutes,
        location=event.location,
        meeting_url=event.meeting_url,
        host_name=host_name,
        host_email=host_email,
        # No attendee identity on the public download — that's only set
        # when a specific customer downloads (RSVP confirmation email).
        attendee_email=None,
    )
    # Slugify the title for the filename so calendar apps that surface
    # the attachment name show something readable.
    filename_slug = (
        "".join(c if c.isalnum() else "-" for c in event.title.lower()).strip("-")
        or "event"
    )[:60]

    return Response(
        content=ics_text,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_slug}.ics"',
            # Cache for a few minutes — events change, but a stampede
            # of share-link openers shouldn't all hit the DB.
            "Cache-Control": "public, max-age=300",
        },
    )
