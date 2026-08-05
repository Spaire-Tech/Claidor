"""Dramatiq actors for community event lifecycle.

Six actors orchestrate event notifications:

  community.event.published
    Fans out the "new event" notification to every enrolled customer
    in the course. Skipped when `notify_on_publish=False`.

  community.event.announce
    Re-fans the published notification on demand (POST /announce).
    Bypasses the `notify_on_publish` opt-out — the host explicitly
    asked for this one.

  community.event.rsvp_confirmed
    Bell + transactional email with `.ics` attachment when a customer
    first RSVPs (or revives a soft-deleted RSVP). Skipped for past
    events.

  community.event.schedule_reminders
    Enqueues the T-24h, T-15m, T-0 (live) reminders for an event.
    Called on create and on time/duration change. Cancel/dedup is
    handled by each reminder actor checking the event still exists +
    start_at still matches.

  community.event.reminder_24h / .reminder_15m / .live
    Per-RSVP'd-customer notification. Idempotent — they re-query
    who's RSVP'd at fire time, so late RSVPs get the live ping but
    not the earlier reminders.

All actors swallow non-fatal errors and log; an event being deleted
between schedule and fire is normal and should be a no-op."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

import structlog

from polar.course.repository import CourseEnrollmentRepository, CourseRepository
from polar.customer_notifications.notification_types import (
    EVENT_ANNOUNCEMENT,
    EVENT_LIVE,
    EVENT_PUBLISHED,
    EVENT_RSVP_CONFIRMED,
    EVENT_STARTING_SOON_15M,
    EVENT_STARTING_SOON_24H,
    EventNotificationPayload,
    render,
)
from polar.customer_notifications.repository import (
    CustomerNotificationPreferencesRepository,
)
from polar.customer_notifications.service import customer_notifications
from polar.email.sender import enqueue_email
from polar.exceptions import PolarTaskError
from polar.kit.utils import utc_now
from polar.logging import Logger
from polar.models.customer import Customer
from polar.models.user import User
from polar.worker import AsyncSessionMaker, TaskPriority, actor, enqueue_job

from ._ics import build_event_ics, to_ics_attachment
from .events_repository import (
    CommunityEventAnnouncementRepository,
    CommunityEventRepository,
    CommunityEventRsvpRepository,
)

log: Logger = structlog.get_logger()


class CommunityEventTaskError(PolarTaskError): ...


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


async def _build_payload(session, event) -> dict:
    course_repo = CourseRepository.from_session(session)
    course = await course_repo.get_by_id(event.course_id)
    host = await session.get(User, event.host_user_id)
    host_name = (
        (course.instructor_name if course else None)
        or (host.public_name if host and hasattr(host, "public_name") else None)
        or (host.email if host else "Instructor")
    )
    course_name = (course.title if course else "") or "your community"

    # Pull org metadata up-front so the React Email renderer can produce
    # an org-branded header + From-name override without reaching back
    # into the DB at render time. Falls back gracefully when any field
    # is missing — the renderer drops to legacy inline HTML in that
    # case (see customer_notifications.notification_types).
    from polar.organization.repository import OrganizationRepository

    organization = (
        await OrganizationRepository.from_session(session).get_by_id(
            course.organization_id
        )
        if course
        else None
    )
    event_url: str | None = None
    if organization is not None:
        event_url = organization.storefront_url(f"/events/{event.id}")

    # Host avatar with the same fallback chain the API uses:
    # user.avatar_url → organization.avatar_url. Lets every email card
    # render a real face/mark rather than initials.
    host_avatar_url = (
        (host.avatar_url if host and hasattr(host, "avatar_url") else None)
        or (organization.avatar_url if organization else None)
    )

    return EventNotificationPayload(
        event_id=str(event.id),
        course_id=str(event.course_id),
        title=event.title,
        start_at=event.start_at,
        host_name=host_name,
        host_avatar_url=host_avatar_url,
        course_name=course_name,
        meeting_url=event.meeting_url,
        organization_id=str(organization.id) if organization else None,
        organization_name=organization.name if organization else None,
        organization_slug=organization.slug if organization else None,
        organization_avatar_url=(
            organization.avatar_url if organization else None
        ),
        organization_website=organization.website if organization else None,
        event_url=event_url,
        type=event.type,
        timezone=event.timezone,
        duration_minutes=event.duration_minutes,
        description=event.description,
        cover_url=event.cover_url,
        cover_object_position=event.cover_object_position,
        location=event.location,
    ).model_dump(mode="json")


async def _enrolled_customer_ids(session, course_id: UUID) -> list[UUID]:
    return await CourseEnrollmentRepository.from_session(
        session
    ).list_customer_ids_for_course(course_id)


# ----------------------------------------------------------------------
# Published — fan out to every enrolled customer
# ----------------------------------------------------------------------


@actor(actor_name="community.event.published", priority=TaskPriority.LOW)
async def event_published(event_id: UUID) -> None:
    log.info("community.event.published.actor_start", event_id=str(event_id))
    async with AsyncSessionMaker() as session:
        repo = CommunityEventRepository.from_session(session)
        event = await repo.get_by_id(event_id)
        if event is None or event.deleted_at is not None:
            log.warning(
                "community.event.published.skipped",
                event_id=str(event_id),
                reason="event_missing_or_deleted",
                exists=event is not None,
                deleted=event.deleted_at is not None if event else None,
            )
            return
        if not event.notify_on_publish:
            log.info(
                "community.event.published.skipped",
                event_id=str(event_id),
                reason="notify_on_publish_false",
            )
            return

        payload = await _build_payload(session, event)
        customer_ids = await _enrolled_customer_ids(session, event.course_id)
        log.info(
            "community.event.published.fan_out",
            event_id=str(event_id),
            course_id=str(event.course_id),
            recipient_count=len(customer_ids),
        )
        if not customer_ids:
            # Most common "nothing happened" cause: the host created an
            # event in a course with zero enrolled customers (e.g. they
            # were testing on their own). Logged loud so this is obvious
            # in the worker output instead of a silent no-op.
            log.warning(
                "community.event.published.no_recipients",
                event_id=str(event_id),
                course_id=str(event.course_id),
            )
            return
        await customer_notifications.send_to_customers(
            session,
            customer_ids=customer_ids,
            notification_type=EVENT_PUBLISHED,
            payload=payload,
        )
        log.info(
            "community.event.published.done",
            event_id=str(event_id),
            recipient_count=len(customer_ids),
        )


@actor(
    actor_name="community.event.send_announcement", priority=TaskPriority.LOW
)
async def send_announcement(announcement_id: UUID) -> None:
    """Fan out a host-composed announcement to every enrolled customer.

    The announcement row was created synchronously by
    `events_service.create_announcement` with `status='sending'`.
    This actor:
      1. Loads the announcement + its event + builds the per-recipient
         payload (org info, event card, host subject/body).
      2. Sends bell + email to every enrolled customer via
         `customer_notifications.send_to_customers` — same path the
         auto-fired event emails use, but with type EVENT_ANNOUNCEMENT
         so the React Email template picks up the composer body.
      3. Stamps `sent_at`, `recipient_count`, and flips status to
         `sent`. Errors flip status to `failed` so the host can see
         what happened in the audit list (future feature).
    """
    log.info(
        "community.event.send_announcement.actor_start",
        announcement_id=str(announcement_id),
    )
    async with AsyncSessionMaker() as session:
        ann_repo = CommunityEventAnnouncementRepository.from_session(session)
        announcement = await ann_repo.get_by_id(announcement_id)
        if announcement is None or announcement.deleted_at is not None:
            log.warning(
                "community.event.send_announcement.skipped",
                announcement_id=str(announcement_id),
                reason="announcement_missing_or_deleted",
            )
            return

        event_repo = CommunityEventRepository.from_session(session)
        event = await event_repo.get_by_id(announcement.event_id)
        if event is None or event.deleted_at is not None:
            log.warning(
                "community.event.send_announcement.skipped",
                announcement_id=str(announcement_id),
                reason="event_missing_or_deleted",
            )
            announcement.status = "failed"
            session.add(announcement)
            return

        # Build the standard event payload, then stamp the
        # announcement-specific subject + body on top so the render()
        # path uses the composer's wording instead of the templated
        # "New event:" default.
        payload = await _build_payload(session, event)
        payload["announcement_id"] = str(announcement.id)
        payload["announcement_subject"] = announcement.subject
        payload["announcement_body"] = announcement.body

        customer_ids = await _enrolled_customer_ids(session, event.course_id)
        log.info(
            "community.event.send_announcement.fan_out",
            announcement_id=str(announcement_id),
            event_id=str(event.id),
            recipient_count=len(customer_ids),
        )

        try:
            if customer_ids:
                await customer_notifications.send_to_customers(
                    session,
                    customer_ids=customer_ids,
                    notification_type=EVENT_ANNOUNCEMENT,
                    payload=payload,
                )
            announcement.recipient_count = len(customer_ids)
            announcement.sent_at = utc_now()
            announcement.status = "sent"
            session.add(announcement)
            log.info(
                "community.event.send_announcement.done",
                announcement_id=str(announcement_id),
                recipient_count=len(customer_ids),
            )
        except Exception:
            announcement.status = "failed"
            session.add(announcement)
            log.exception(
                "community.event.send_announcement.failed",
                announcement_id=str(announcement_id),
            )
            raise


# ----------------------------------------------------------------------
# Reminders — schedule + per-window actors
# ----------------------------------------------------------------------


@actor(actor_name="community.event.schedule_reminders", priority=TaskPriority.LOW)
async def schedule_reminders(event_id: UUID) -> None:
    """Schedules T-24h, T-15m, and T-0 (live) reminder actors via
    `enqueue_job(..., delay=...)`. Each reminder actor re-validates the
    event's start_at so a rescheduled event doesn't double-fire."""
    log.info("community.event.schedule_reminders.actor_start", event_id=str(event_id))
    async with AsyncSessionMaker() as session:
        repo = CommunityEventRepository.from_session(session)
        event = await repo.get_by_id(event_id)
        if event is None or event.deleted_at is not None:
            log.warning(
                "community.event.schedule_reminders.skipped",
                event_id=str(event_id),
                reason="event_missing_or_deleted",
            )
            return

        now = utc_now()
        windows = [
            ("community.event.reminder_24h", event.start_at - timedelta(hours=24)),
            ("community.event.reminder_15m", event.start_at - timedelta(minutes=15)),
            ("community.event.live", event.start_at),
        ]
        scheduled = 0
        for actor_name, fire_at in windows:
            delta = fire_at - now
            if delta.total_seconds() <= 0:
                # Already past for this window — skip.
                continue
            delay_ms = int(delta.total_seconds() * 1000)
            enqueue_job(actor_name, event_id=event.id, delay=delay_ms)
            scheduled += 1
        log.info(
            "community.event.schedule_reminders.done",
            event_id=str(event_id),
            scheduled=scheduled,
            start_at=event.start_at.isoformat(),
        )


async def _fire_window(
    event_id: UUID, notification_type: str, *, only_if_within_minutes: int | None
) -> None:
    log.info(
        "community.event.reminder.actor_start",
        event_id=str(event_id),
        notification_type=notification_type,
    )
    async with AsyncSessionMaker() as session:
        repo = CommunityEventRepository.from_session(session)
        event = await repo.get_by_id(event_id)
        if event is None or event.deleted_at is not None:
            log.warning(
                "community.event.reminder.skipped",
                event_id=str(event_id),
                notification_type=notification_type,
                reason="event_missing_or_deleted",
            )
            return
        if only_if_within_minutes is not None:
            # If start_at moved more than the slack window in either
            # direction, this scheduled fire is stale — drop it.
            delta_min = abs((event.start_at - utc_now()).total_seconds() / 60.0)
            if delta_min > only_if_within_minutes:
                log.info(
                    "community.event.reminder.stale_drop",
                    event_id=str(event_id),
                    notification_type=notification_type,
                    delta_minutes=round(delta_min, 1),
                    slack_minutes=only_if_within_minutes,
                )
                return

        rsvp_repo = CommunityEventRsvpRepository.from_session(session)
        customer_ids = list(await rsvp_repo.list_customer_ids_for_event(event_id))
        if not customer_ids:
            log.warning(
                "community.event.reminder.no_rsvps",
                event_id=str(event_id),
                notification_type=notification_type,
            )
            return

        payload = await _build_payload(session, event)
        await customer_notifications.send_to_customers(
            session,
            customer_ids=customer_ids,
            notification_type=notification_type,
            payload=payload,
        )
        log.info(
            "community.event.reminder.done",
            event_id=str(event_id),
            notification_type=notification_type,
            recipient_count=len(customer_ids),
        )


# ----------------------------------------------------------------------
# RSVP confirmation — bell + email with .ics attachment
# ----------------------------------------------------------------------


@actor(actor_name="community.event.rsvp_confirmed", priority=TaskPriority.LOW)
async def rsvp_confirmed(event_id: UUID, customer_id: UUID) -> None:
    """Send the "you're going" confirmation when a customer RSVPs.

    Two channels:
      1. Bell row via `send_to_customer`. EVENT_RSVP_CONFIRMED is
         deliberately NOT in EMAIL_TYPES, so that path won't fan out an
         email — that would be a duplicate without the calendar invite.
      2. Email with a `.ics` attachment, sent directly through
         `enqueue_email` so we can attach the calendar file (the standard
         `customer_notification.send_email` actor doesn't pass attachments).

    Skipped for past events — a "you're going" + ICS for something that
    already ended is just noise.
    """
    log.info(
        "community.event.rsvp_confirmed.actor_start",
        event_id=str(event_id),
        customer_id=str(customer_id),
    )
    async with AsyncSessionMaker() as session:
        repo = CommunityEventRepository.from_session(session)
        event = await repo.get_by_id(event_id)
        if event is None or event.deleted_at is not None:
            log.warning(
                "community.event.rsvp_confirmed.skipped",
                event_id=str(event_id),
                customer_id=str(customer_id),
                reason="event_missing_or_deleted",
            )
            return

        # Past-event safety: avoid sending calendar invites for events
        # whose end time has already passed. Soft slack of 5 minutes
        # so an RSVP that lands just before start_at still triggers.
        end_at = event.start_at + timedelta(minutes=event.duration_minutes)
        if end_at <= utc_now() - timedelta(minutes=5):
            log.info(
                "community.event.rsvp_confirmed.skipped",
                event_id=str(event_id),
                customer_id=str(customer_id),
                reason="event_in_the_past",
            )
            return

        customer = await session.get(Customer, customer_id)
        if customer is None:
            log.warning(
                "community.event.rsvp_confirmed.skipped",
                event_id=str(event_id),
                customer_id=str(customer_id),
                reason="customer_not_found",
            )
            return

        payload = await _build_payload(session, event)

        # Bell row (no email — type isn't in EMAIL_TYPES).
        await customer_notifications.send_to_customer(
            session,
            customer_id=customer_id,
            notification_type=EVENT_RSVP_CONFIRMED,
            payload=payload,
        )

        if not customer.email:
            log.warning(
                "community.event.rsvp_confirmed.email_skipped",
                event_id=str(event_id),
                customer_id=str(customer_id),
                reason="customer_has_no_email",
            )
            return

        prefs_repo = CustomerNotificationPreferencesRepository.from_session(session)
        if not await prefs_repo.email_enabled(customer_id):
            log.info(
                "community.event.rsvp_confirmed.email_skipped",
                event_id=str(event_id),
                customer_id=str(customer_id),
                reason="customer_email_prefs_off",
            )
            return

        host = await session.get(User, event.host_user_id)
        host_email = getattr(host, "email", None) if host else None
        host_name = payload.get("host_name", "Instructor")

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
            attendee_email=customer.email,
        )
        attachment = to_ics_attachment(ics_text)

        # Stamp the recipient onto the payload so the React Email
        # FooterCustomer block can render "this email was sent to ...".
        # Side-channel key — only meaningful at render time, never
        # persisted on a bell row.
        render_payload = dict(payload)
        render_payload["_recipient_email"] = customer.email
        subject, body = render(EVENT_RSVP_CONFIRMED, render_payload)

        # Same From-name override as the shared customer_notification
        # send-email actor: org name appears in the mailbox, send
        # address stays on the platform sender domain.
        from polar.customer_notifications.notification_types import (
            get_from_name,
        )
        from polar.email.sender import DEFAULT_FROM_NAME

        from_name = (
            get_from_name(EVENT_RSVP_CONFIRMED, render_payload)
            or DEFAULT_FROM_NAME
        )

        try:
            enqueue_email(
                to_email_addr=customer.email,
                subject=subject,
                html_content=body,
                from_name=from_name,
                attachments=[attachment],
            )
            log.info(
                "community.event.rsvp_confirmed.email_enqueued",
                event_id=str(event.id),
                customer_id=str(customer_id),
                to=customer.email,
                from_name=from_name,
            )
        except Exception:
            log.exception(
                "community.event.rsvp_confirmed.email_failed",
                event_id=str(event.id),
                customer_id=str(customer_id),
            )


@actor(actor_name="community.event.reminder_24h", priority=TaskPriority.LOW)
async def reminder_24h(event_id: UUID) -> None:
    # 60 min slack — if the event was moved by more than an hour, skip.
    await _fire_window(event_id, EVENT_STARTING_SOON_24H, only_if_within_minutes=24 * 60 + 60)


@actor(actor_name="community.event.reminder_15m", priority=TaskPriority.LOW)
async def reminder_15m(event_id: UUID) -> None:
    await _fire_window(event_id, EVENT_STARTING_SOON_15M, only_if_within_minutes=60)


@actor(actor_name="community.event.live", priority=TaskPriority.LOW)
async def event_live(event_id: UUID) -> None:
    await _fire_window(event_id, EVENT_LIVE, only_if_within_minutes=15)


# ----------------------------------------------------------------------
# Replay nag — REMOVED.
#
# We deleted the "post-event replay reminder" emails. The host had to
# manually paste a Zoom/Loom/etc. URL after the event ended; the cron
# was nagging them about a workflow we never actually delivered (no
# native recording, no auto-pasted URL). When/if real recording lands,
# this can come back as a feature instead of a guilt-trip.
#
# The `replay_nag_state` column on community_events stays in the DB
# (no migration) so old data isn't lost. The `EVENT_REPLAY_NAG_*`
# notification types in customer_notifications.notification_types stay
# defined so any in-flight queued jobs render rather than crash, but
# nothing enqueues them anymore.
# ----------------------------------------------------------------------
