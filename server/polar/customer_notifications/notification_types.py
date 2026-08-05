"""Customer-portal notification type registry.

Each `NotificationType.render(...)` returns (subject, html_body) for the
email channel. The same payload is also stored on the customer_notifications
row so the bell dropdown can render a richer in-portal card from it.

For community.event.* types, the rendered HTML now flows through the
React Email pipeline (server/emails/src/emails/community_event_*.tsx)
so each email is org-branded and visually consistent with the rest of
our transactional surface (order confirmation, subscription receipts,
etc.). The legacy inline-HTML branches are kept as fall-backs in case
an in-flight queued job from before the upgrade reaches the worker
without the new payload fields."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog
from pydantic import BaseModel

from polar.logging import Logger

log: Logger = structlog.get_logger()

# ----------------------------------------------------------------------
# Type identifiers — string column on customer_notifications.type
# ----------------------------------------------------------------------

EVENT_PUBLISHED = "community.event.published"
EVENT_ANNOUNCEMENT = "community.event.announcement"
EVENT_RSVP_CONFIRMED = "community.event.rsvp_confirmed"
EVENT_STARTING_SOON_24H = "community.event.starting_soon_24h"
EVENT_STARTING_SOON_15M = "community.event.starting_soon_15m"
EVENT_LIVE = "community.event.live"
EVENT_REPLAY_NAG_T2H = "community.event.replay_nag_t2h"
EVENT_REPLAY_NAG_T24H = "community.event.replay_nag_t24h"

ACTIVITY_PUBLISHED = "community.activity.published"
ACTIVITY_SUBMISSION_RECEIVED = "community.activity.submission_received"

ALL_TYPES = (
    EVENT_PUBLISHED,
    EVENT_ANNOUNCEMENT,
    EVENT_RSVP_CONFIRMED,
    EVENT_STARTING_SOON_24H,
    EVENT_STARTING_SOON_15M,
    EVENT_LIVE,
    EVENT_REPLAY_NAG_T2H,
    EVENT_REPLAY_NAG_T24H,
    ACTIVITY_PUBLISHED,
    ACTIVITY_SUBMISSION_RECEIVED,
)

# Per-type channel policy. Notifications always create a bell row; this
# governs whether the same notification also sends an email.
#
# 15-minute reminders stay bell-only on purpose — by the time the email
# arrives in the inbox the window has often already started, and the
# notification arrives every event so the volume would be noisy.
#
# RSVP confirmations are intentionally NOT in this set even though they
# do send an email — the confirmation email carries an `.ics` attachment
# and so flows through a dedicated send path (community.events_tasks.
# rsvp_confirmed) rather than the generic customer_notification.send_email
# actor, which doesn't take attachments.
#
# EVENT_PUBLISHED is no longer in EMAIL_TYPES because the auto-fire on
# event creation got replaced by the host-composed announcement
# (EVENT_ANNOUNCEMENT). Old bell rows of EVENT_PUBLISHED stay
# renderable so the bell history still works — they just won't fire
# new emails. New flows enqueue EVENT_ANNOUNCEMENT instead.
#
# REPLAY_NAG_* types stay defined above (so any in-flight queued jobs
# render rather than crash) but the cron that enqueued them is gone —
# see community/events_tasks.py. They never appear in EMAIL_TYPES now.
#
# Activity submission notifications go to the host only (bell, no email
# — high volume).
EMAIL_TYPES: frozenset[str] = frozenset(
    {
        EVENT_ANNOUNCEMENT,
        EVENT_STARTING_SOON_24H,
        EVENT_LIVE,
        ACTIVITY_PUBLISHED,
    }
)


# ----------------------------------------------------------------------
# Payloads
# ----------------------------------------------------------------------


class ActivityNotificationPayload(BaseModel):
    """Payload for community.activity.* notifications."""

    activity_id: str
    course_id: str
    title: str
    host_name: str
    course_name: str
    submission_type: str = "photo"
    channel_label: str | None = None
    # Set on submission_received so the host can see who just posted.
    submitter_name: str | None = None


class EventNotificationPayload(BaseModel):
    """Payload shared by every community.event.* notification — enough
    context for both the email body and the bell dropdown card.

    Org + URL + event-card fields are optional (defaulting to None) so
    in-flight jobs queued before the React Email upgrade still validate
    and render through the legacy inline-HTML fall-back. New emits from
    events_tasks._build_payload always populate them."""

    event_id: str
    course_id: str
    title: str
    start_at: datetime
    host_name: str
    host_avatar_url: str | None = None
    course_name: str
    meeting_url: str | None = None

    # Set on all emits from June 2026 onward. When present, render()
    # invokes the React Email templates (org-branded chrome, hero
    # cover, calendar-styled rows). When absent, render() falls back
    # to the legacy inline-HTML body so the actor still produces
    # _something_ rather than crashing the worker.
    organization_id: str | None = None
    organization_name: str | None = None
    organization_slug: str | None = None
    organization_avatar_url: str | None = None
    organization_website: str | None = None
    event_url: str | None = None
    type: str | None = None
    timezone: str | None = None
    duration_minutes: int | None = None
    description: str | None = None
    cover_url: str | None = None
    cover_object_position: str | None = None
    location: str | None = None

    # Set on EVENT_ANNOUNCEMENT bell rows / emails — the host's
    # composed subject + body, persisted on the
    # community_event_announcements row that owns this fan-out. The
    # other event types leave these unset.
    announcement_id: str | None = None
    announcement_subject: str | None = None
    announcement_body: str | None = None


def get_from_name(notification_type: str, payload: dict[str, Any]) -> str | None:
    """Pick the email From-name for a customer notification.

    For community.event.* emails the recipient is an enrolled customer
    of the org, so the message reads more naturally as coming from the
    creator (`Acme Inc.`) than from the platform (`Spaire`). The actual
    send address stays on the platform sender domain — this only
    overrides the human display name in the mail client.

    Returns None when no override applies; the caller should then use
    the platform default.
    """
    if notification_type.startswith("community.event.") or notification_type.startswith(
        "community.activity."
    ):
        name = (payload.get("organization_name") or "").strip()
        return name or None
    return None


# ----------------------------------------------------------------------
# Rendering
# ----------------------------------------------------------------------


def _fmt_when(dt: datetime) -> str:
    return dt.strftime("%a %b %-d at %H:%M UTC")


def render(notification_type: str, payload: dict[str, Any]) -> tuple[str, str]:
    """Return (subject, html_body) for the email channel.

    Falls back to a generic subject/body if the type isn't recognized —
    we never want a missing render to break the dramatiq actor."""
    # Activity-type renders first so the EventNotificationPayload parse
    # below doesn't reject activity payloads (different shape).
    if notification_type in (ACTIVITY_PUBLISHED, ACTIVITY_SUBMISSION_RECEIVED):
        try:
            ap = ActivityNotificationPayload.model_validate(payload)
        except Exception:
            return (
                "New activity in your community",
                "<p>You have a new community notification.</p>",
            )
        if notification_type == ACTIVITY_PUBLISHED:
            subject = f"New activity: {ap.title}"
            channel = f" — {ap.channel_label}" if ap.channel_label else ""
            body = (
                f"<p><strong>{ap.host_name}</strong> opened a new activity in "
                f"<em>{ap.course_name}</em>{channel}: "
                f"<strong>{ap.title}</strong>.</p>"
                f'<p><a href="#">Open in portal</a></p>'
            )
            return subject, body
        # submission_received
        subject = f"New submission to {ap.title}"
        who = ap.submitter_name or "Someone"
        body = (
            f"<p><strong>{who}</strong> just submitted to your activity "
            f"<strong>{ap.title}</strong>.</p>"
        )
        return subject, body

    try:
        ep = EventNotificationPayload.model_validate(payload)
    except Exception:
        return (
            "New activity in your community",
            "<p>You have a new community notification.</p>",
        )

    title = ep.title

    # Per-type subject lines first — used by the React Email path too,
    # since the subject lives outside the rendered body.
    if notification_type == EVENT_PUBLISHED:
        subject = f"New event: {title}"
    elif notification_type == EVENT_ANNOUNCEMENT:
        # The host's typed subject wins. Fall back to a sensible
        # default if somehow the payload was constructed without one
        # — better than the generic "New community notification" the
        # bottom of this if-chain produces.
        subject = (ep.announcement_subject or "").strip() or f"Update: {title}"
    elif notification_type == EVENT_RSVP_CONFIRMED:
        subject = f"You're going: {title}"
    elif notification_type == EVENT_STARTING_SOON_24H:
        subject = f"Tomorrow: {title}"
    elif notification_type == EVENT_LIVE:
        subject = f"Live now: {title}"
    elif notification_type == EVENT_STARTING_SOON_15M:
        subject = f"Starting soon: {title}"
    elif notification_type == EVENT_REPLAY_NAG_T2H:
        subject = f"Add a replay for {title}?"
    elif notification_type == EVENT_REPLAY_NAG_T24H:
        subject = f"Replay reminder: {title}"
    else:
        subject = "New community notification"

    # Try the React Email pipeline. Requires the full org + event-card
    # payload fields. If anything is missing — most commonly because an
    # in-flight job from before the upgrade reaches the worker — fall
    # back to legacy inline HTML so the customer still gets something.
    react_email_eligible = notification_type in {
        EVENT_PUBLISHED,
        EVENT_ANNOUNCEMENT,
        EVENT_RSVP_CONFIRMED,
        EVENT_STARTING_SOON_24H,
        EVENT_LIVE,
    }
    if react_email_eligible:
        html = _render_react_email(notification_type, ep, payload)
        if html is not None:
            return subject, html

    # ----- Legacy inline-HTML fall-back -----
    when = _fmt_when(ep.start_at)
    course = ep.course_name
    host = ep.host_name

    if notification_type == EVENT_PUBLISHED:
        body = (
            f"<p><strong>{host}</strong> just scheduled <strong>{title}</strong> "
            f"in <em>{course}</em>.</p>"
            f"<p>{when}</p>"
            f'<p><a href="#">Open in portal</a></p>'
        )
    elif notification_type == EVENT_RSVP_CONFIRMED:
        join_line = (
            f'<p><a href="{ep.meeting_url}">Join link</a></p>'
            if ep.meeting_url
            else ""
        )
        body = (
            f"<p>You're confirmed for <strong>{title}</strong> "
            f"in <em>{course}</em>.</p>"
            f"<p>{when}</p>"
            f"{join_line}"
            "<p>We've attached a calendar invite so you can add it to "
            "Google Calendar, Apple Calendar, or Outlook in one click.</p>"
        )
    elif notification_type == EVENT_STARTING_SOON_24H:
        body = (
            f"<p>Reminder — <strong>{title}</strong> starts tomorrow ({when}).</p>"
        )
    elif notification_type == EVENT_STARTING_SOON_15M:
        body = f"<p><strong>{title}</strong> starts in 15 minutes.</p>"
    elif notification_type == EVENT_LIVE:
        body = (
            f"<p><strong>{title}</strong> is live now. "
            f'<a href="{ep.meeting_url or "#"}">Join</a></p>'
        )
    elif notification_type == EVENT_REPLAY_NAG_T2H:
        body = (
            f"<p>Your event <strong>{title}</strong> ended a couple of hours ago. "
            "Paste a replay URL so attendees who missed it can catch up.</p>"
        )
    elif notification_type == EVENT_REPLAY_NAG_T24H:
        body = (
            f"<p>It's been a day since <strong>{title}</strong> ended. "
            "Adding a replay URL takes a few seconds and brings the event back to "
            "the top of the Replays section.</p>"
        )
    else:
        body = "<p>You have a new community notification.</p>"

    return subject, body


# ----------------------------------------------------------------------
# React Email pipeline (for the four customer-facing event templates)
# ----------------------------------------------------------------------


_TEMPLATE_BY_TYPE: dict[str, str] = {
    EVENT_PUBLISHED: "community_event_published",
    EVENT_ANNOUNCEMENT: "community_event_announcement",
    EVENT_RSVP_CONFIRMED: "community_event_rsvp_confirmed",
    EVENT_STARTING_SOON_24H: "community_event_starting_soon_24h",
    EVENT_LIVE: "community_event_live",
}


def _render_react_email(
    notification_type: str,
    ep: EventNotificationPayload,
    raw_payload: dict[str, Any],
) -> str | None:
    """Build the EmailAdapter props and call the Node renderer.

    Returns the rendered HTML on success, or None when a required
    field is missing (caller then falls back to legacy inline HTML)."""
    template = _TEMPLATE_BY_TYPE.get(notification_type)
    if template is None:
        return None

    # All four templates require an Organization (for the branded
    # header + footer) and an event_url (for CTA buttons). If either
    # is missing the in-flight job pre-dates the upgrade — log loud
    # and fall back so the worker doesn't 500.
    if not (
        ep.organization_id
        and ep.organization_name
        and ep.organization_slug
        and ep.event_url
        and ep.duration_minutes
        and ep.type
    ):
        log.info(
            "customer_notification.react_email.fallback",
            type=notification_type,
            event_id=ep.event_id,
            reason="payload_missing_react_email_fields",
        )
        return None

    # Local import — renderer subprocess + email schemas are heavy and
    # not needed for the bell-only types. Keeps the module load light
    # for callers (e.g. the dramatiq actor that creates bell rows but
    # never sends email).
    from polar.email.react import render_email_template
    from polar.email.schemas import (
        CommunityEmailOrgInfo,
        CommunityEventAnnouncementEmail,
        CommunityEventAnnouncementProps,
        CommunityEventCardData,
        CommunityEventLiveEmail,
        CommunityEventLiveProps,
        CommunityEventPublishedEmail,
        CommunityEventPublishedProps,
        CommunityEventRsvpConfirmedEmail,
        CommunityEventRsvpConfirmedProps,
        CommunityEventStartingSoon24hEmail,
        CommunityEventStartingSoon24hProps,
    )

    # Build the slim org-info from the flat payload fields. We don't
    # reach back into the DB here — the actor that enqueued the
    # notification already paid the cost of looking these up, and we
    # avoid a session-in-render anti-pattern.
    organization = CommunityEmailOrgInfo(
        id=ep.organization_id,
        name=ep.organization_name,
        slug=ep.organization_slug,
        avatar_url=ep.organization_avatar_url,
        website=ep.organization_website,
    )
    customer_email = (
        raw_payload.get("_recipient_email") or raw_payload.get("email") or ""
    )
    event_card = CommunityEventCardData(
        title=ep.title,
        type=ep.type or "workshop",
        start_at=ep.start_at.isoformat(),
        timezone=ep.timezone or "UTC",
        duration_minutes=ep.duration_minutes or 60,
        host_name=ep.host_name,
        # Falls back to the org avatar at the payload-build site
        # (events_tasks._build_payload), so the card consistently
        # shows a real image even when the host hasn't set a personal
        # user.avatar_url.
        host_avatar_url=ep.host_avatar_url,
        cover_url=ep.cover_url,
        cover_object_position=ep.cover_object_position,
        location=ep.location,
        meeting_url=ep.meeting_url,
    )

    # Union type so the branches below can reassign without mypy
    # narrowing to the first variant.
    email: (
        CommunityEventPublishedEmail
        | CommunityEventAnnouncementEmail
        | CommunityEventRsvpConfirmedEmail
        | CommunityEventStartingSoon24hEmail
        | CommunityEventLiveEmail
    )
    if notification_type == EVENT_PUBLISHED:
        email = CommunityEventPublishedEmail(
            props=CommunityEventPublishedProps(
                email=customer_email,
                organization=organization,
                course_name=ep.course_name,
                event_url=ep.event_url,
                event=event_card,
                host_name=ep.host_name,
            )
        )
    elif notification_type == EVENT_ANNOUNCEMENT:
        email = CommunityEventAnnouncementEmail(
            props=CommunityEventAnnouncementProps(
                email=customer_email,
                organization=organization,
                course_name=ep.course_name,
                event_url=ep.event_url,
                event=event_card,
                subject=ep.announcement_subject or f"Update: {ep.title}",
                body=ep.announcement_body or "",
                host_name=ep.host_name,
            )
        )
    elif notification_type == EVENT_RSVP_CONFIRMED:
        email = CommunityEventRsvpConfirmedEmail(
            props=CommunityEventRsvpConfirmedProps(
                email=customer_email,
                organization=organization,
                course_name=ep.course_name,
                event_url=ep.event_url,
                event=event_card,
            )
        )
    elif notification_type == EVENT_STARTING_SOON_24H:
        email = CommunityEventStartingSoon24hEmail(
            props=CommunityEventStartingSoon24hProps(
                email=customer_email,
                organization=organization,
                course_name=ep.course_name,
                event_url=ep.event_url,
                event=event_card,
            )
        )
    elif notification_type == EVENT_LIVE:
        email = CommunityEventLiveEmail(
            props=CommunityEventLiveProps(
                email=customer_email,
                organization=organization,
                course_name=ep.course_name,
                event_url=ep.event_url,
                event=event_card,
            )
        )
    else:
        return None

    try:
        return render_email_template(email)
    except Exception:
        # Renderer failures are loud (subprocess error in logs) but
        # we'd rather the customer get the plain-HTML fall-back than
        # nothing at all.
        log.exception(
            "customer_notification.react_email.render_failed",
            type=notification_type,
            event_id=ep.event_id,
        )
        return None
