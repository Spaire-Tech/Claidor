"""Community events service.

Business logic for creating, listing, updating, deleting events, and
toggling RSVPs. Notification fan-out is enqueued here; the actual
dramatiq actors live in `community.events_tasks`."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog

from polar.kit.utils import utc_now
from polar.logging import Logger
from polar.models.community_event import CommunityEvent
from polar.models.community_event_announcement import CommunityEventAnnouncement
from polar.models.community_event_rsvp import CommunityEventRsvp
from polar.postgres import AsyncSession
from polar.worker import enqueue_job

from .events_repository import (
    CommunityEventAnnouncementRepository,
    CommunityEventRepository,
    CommunityEventRsvpRepository,
)
from .events_schemas import (
    CommunityEventAnnouncementCreate,
    CommunityEventCreate,
    CommunityEventUpdate,
)
from .exceptions import CommunityNotEnrolled

log: Logger = structlog.get_logger()


class EventNotFound(Exception):
    pass


class EventHostMismatch(Exception):
    """Raised when a non-host tries to mutate an event."""

    pass


def is_live(event: CommunityEvent, *, now: datetime | None = None) -> bool:
    now = now or utc_now()
    end_at = event.start_at + timedelta(minutes=event.duration_minutes)
    return event.start_at <= now < end_at


def is_past(event: CommunityEvent, *, now: datetime | None = None) -> bool:
    now = now or utc_now()
    end_at = event.start_at + timedelta(minutes=event.duration_minutes)
    return now >= end_at


class CommunityEventService:
    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def list_for_course(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        viewer_customer_id: UUID | None,
    ) -> tuple[list[CommunityEvent], dict[UUID, bool]]:
        """Returns (events, going_by_event_id). Sorted by start_at asc.
        `going_by_event_id` is empty when viewer_customer_id is None
        (e.g. instructor-side preview)."""
        repo = CommunityEventRepository.from_session(session)
        events = list(await repo.list_for_course(course_id))

        going_map: dict[UUID, bool] = {}
        if viewer_customer_id is not None and events:
            rsvp_repo = CommunityEventRsvpRepository.from_session(session)
            ids = [e.id for e in events]
            going_ids = await rsvp_repo.list_event_ids_for_customer(
                ids, viewer_customer_id
            )
            going_map = {eid: (eid in going_ids) for eid in ids}

        return events, going_map

    async def get(
        self,
        session: AsyncSession,
        *,
        event_id: UUID,
        course_id: UUID,
    ) -> CommunityEvent:
        repo = CommunityEventRepository.from_session(session)
        event = await repo.get_by_id_for_course(event_id, course_id)
        if event is None:
            raise EventNotFound()
        return event

    # ------------------------------------------------------------------
    # Writes — host side
    # ------------------------------------------------------------------

    async def create(
        self,
        session: AsyncSession,
        *,
        course_id: UUID,
        host_user_id: UUID,
        payload: CommunityEventCreate,
    ) -> CommunityEvent:
        # Normalize naive datetimes to UTC. Clients sometimes send
        # `YYYY-MM-DDTHH:MM` without an offset — interpret as UTC.
        start_at = payload.start_at
        if start_at.tzinfo is None:
            start_at = start_at.replace(tzinfo=UTC)

        event = CommunityEvent(
            course_id=course_id,
            host_user_id=host_user_id,
            title=payload.title.strip(),
            type=payload.type,
            description=(payload.description or None),
            start_at=start_at,
            timezone=payload.timezone or "UTC",
            duration_minutes=payload.duration_minutes,
            meeting_url=payload.meeting_url,
            location=payload.location,
            cover_url=payload.cover_url,
            cover_object_position=payload.cover_object_position,
            notify_on_publish=payload.notify_on_publish,
            rsvp_count=0,
            replay_nag_state="pending",
        )

        repo = CommunityEventRepository.from_session(session)
        await repo.create(event, flush=True)

        # Schedule the T-24h / T-15m / live reminders. The "event
        # published" auto-fire is gone — the host now composes an
        # announcement via the dedicated composer modal (POST
        # /announcements). `notify_on_publish` on the model is
        # vestigial and stays only so old data isn't lost; we can
        # drop the column in a follow-up cleanup.
        log.info(
            "community.event.create.enqueued",
            event_id=str(event.id),
            course_id=str(course_id),
            host_user_id=str(host_user_id),
            start_at=event.start_at.isoformat(),
        )
        enqueue_job("community.event.schedule_reminders", event_id=event.id)

        return event

    async def update(
        self,
        session: AsyncSession,
        *,
        event_id: UUID,
        course_id: UUID,
        host_user_id: UUID,
        payload: CommunityEventUpdate,
    ) -> CommunityEvent:
        event = await self.get(session, event_id=event_id, course_id=course_id)
        if event.host_user_id != host_user_id:
            raise EventHostMismatch()

        data = payload.model_dump(exclude_unset=True)

        # Cover replacement: enqueue cleanup of the old image so we
        # don't accumulate orphans in S3 when the host swaps covers.
        prev_cover = event.cover_url
        for k, v in data.items():
            if k == "start_at" and v is not None and v.tzinfo is None:
                v = v.replace(tzinfo=UTC)
            setattr(event, k, v)

        await session.flush()

        if (
            "cover_url" in data
            and prev_cover
            and prev_cover != event.cover_url
        ):
            enqueue_job("community.cover.cleanup", cover_url=prev_cover)

        # If start_at changed, re-schedule reminders.
        if "start_at" in data or "duration_minutes" in data:
            enqueue_job("community.event.schedule_reminders", event_id=event.id)

        return event

    async def delete(
        self,
        session: AsyncSession,
        *,
        event_id: UUID,
        course_id: UUID,
        host_user_id: UUID,
    ) -> None:
        event = await self.get(session, event_id=event_id, course_id=course_id)
        if event.host_user_id != host_user_id:
            raise EventHostMismatch()
        repo = CommunityEventRepository.from_session(session)
        await repo.soft_delete(event)
        if event.cover_url:
            enqueue_job("community.cover.cleanup", cover_url=event.cover_url)

    async def preview_announcement(
        self,
        session: AsyncSession,
        *,
        event_id: UUID,
        course_id: UUID,
        host_user_id: UUID,
        subject: str,
        body: str,
    ) -> tuple[str, str]:
        """Render what an announcement email would look like without
        persisting or sending.

        Powers the composer modal's preview pane. Reuses the same
        payload-builder + render() path the real fan-out uses, so the
        preview is byte-equivalent to what recipients will actually
        receive. Auth mirrors create_announcement — only the event's
        host can preview.

        Returns (subject, html_body).
        """
        from polar.customer_notifications.notification_types import (
            EVENT_ANNOUNCEMENT,
            render,
        )

        from .events_tasks import _build_payload

        event = await self.get(session, event_id=event_id, course_id=course_id)
        if event.host_user_id != host_user_id:
            raise EventHostMismatch()

        payload = await _build_payload(session, event)
        payload["announcement_subject"] = subject.strip()
        payload["announcement_body"] = body or ""
        # The preview endpoint hits this from a logged-in admin
        # context; stamp the host's own email as the recipient so the
        # footer line ("This email was sent to ...") shows something
        # sensible in the preview rather than blank.
        payload["_recipient_email"] = "preview@example.com"

        return render(EVENT_ANNOUNCEMENT, payload)

    async def create_announcement(
        self,
        session: AsyncSession,
        *,
        event_id: UUID,
        course_id: UUID,
        host_user_id: UUID,
        payload: CommunityEventAnnouncementCreate,
    ) -> CommunityEventAnnouncement:
        """Persist a host-composed announcement and (for v1) enqueue the
        fan-out immediately.

        The flow replaces the old auto-fire "Notify members" on event
        create. The composer modal POSTs the host's subject + body
        here; the actor handles the actual bell + email fan-out so the
        request returns fast and the host gets immediate feedback.

        Authorization mirrors update/delete — only the host of the
        underlying event can announce. Other course owners can edit
        the event but can't speak for the host without going through
        a separate "owner announce" surface we haven't built yet.
        """
        event = await self.get(session, event_id=event_id, course_id=course_id)
        if event.host_user_id != host_user_id:
            raise EventHostMismatch()

        # Count the enrolled members up-front so the create response can
        # report the real "will notify N members" number immediately.
        # Without this, recipient_count was 0 on the response (the actor
        # populates it asynchronously) and the host saw "no members to
        # notify yet" even when everyone got the announcement. The actor
        # re-confirms this same count after fan-out.
        from polar.course.repository import CourseEnrollmentRepository

        enrolled_ids = await CourseEnrollmentRepository.from_session(
            session
        ).list_customer_ids_for_course(event.course_id)
        intended_recipients = len(enrolled_ids)

        repo = CommunityEventAnnouncementRepository.from_session(session)
        announcement = await repo.create(
            CommunityEventAnnouncement(
                event_id=event.id,
                course_id=event.course_id,
                sent_by_user_id=host_user_id,
                subject=payload.subject.strip(),
                body=payload.body or "",
                status="sending" if payload.send_now else "draft",
                recipient_count=intended_recipients,
            ),
            flush=True,
        )

        log.info(
            "community.event.announcement.created",
            announcement_id=str(announcement.id),
            event_id=str(event.id),
            send_now=payload.send_now,
            intended_recipients=intended_recipients,
        )

        if payload.send_now:
            enqueue_job(
                "community.event.send_announcement",
                announcement_id=announcement.id,
            )

        return announcement

    # ------------------------------------------------------------------
    # Writes — RSVP (customer side)
    # ------------------------------------------------------------------

    async def rsvp(
        self,
        session: AsyncSession,
        *,
        event_id: UUID,
        course_id: UUID,
        customer_id: UUID,
        going: bool,
    ) -> tuple[bool, int]:
        """Toggle RSVP. Idempotent — re-RSVP'ing or re-unrsvp'ing is a
        no-op against the live row state but always re-syncs rsvp_count.
        Returns (going_after, rsvp_count_after)."""
        event = await self.get(session, event_id=event_id, course_id=course_id)
        rsvp_repo = CommunityEventRsvpRepository.from_session(session)
        existing = await rsvp_repo.get_for_event_customer(event_id, customer_id)

        # Was the customer already live-RSVP'd before this call? Used
        # below to decide whether to fire a confirmation notification —
        # a repeat RSVP from a customer who's already going shouldn't
        # re-email a calendar invite.
        was_going = existing is not None and existing.deleted_at is None

        if going:
            if existing is None:
                row = CommunityEventRsvp(
                    event_id=event_id, customer_id=customer_id
                )
                await rsvp_repo.create(row)
            elif existing.deleted_at is not None:
                # Reviving a soft-deleted RSVP — clear the tombstone.
                existing.deleted_at = None
                session.add(existing)
        else:
            if existing is not None and existing.deleted_at is None:
                await rsvp_repo.soft_delete(existing)

        await session.flush()

        count = await rsvp_repo.count_for_event(event_id)
        event.rsvp_count = count
        session.add(event)
        await session.flush()

        # Fire the confirmation only on a real transition into "going"
        # (first-time or revived). The actor itself drops past events,
        # so we don't double-check the time here.
        log.info(
            "community.event.rsvp.applied",
            event_id=str(event_id),
            customer_id=str(customer_id),
            going=going,
            was_going=was_going,
            rsvp_count=count,
            will_send_confirmation=(going and not was_going),
        )
        if going and not was_going:
            enqueue_job(
                "community.event.rsvp_confirmed",
                event_id=event_id,
                customer_id=customer_id,
            )

        return going, count


events_service = CommunityEventService()
_ = CommunityNotEnrolled  # re-exported for symmetry with community/service.py
