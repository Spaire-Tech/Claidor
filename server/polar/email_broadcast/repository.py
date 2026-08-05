from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import Date, Select, cast, func, select, update

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from polar.models import UserOrganization
from polar.models.email_broadcast import EmailBroadcast, EmailBroadcastStatus
from polar.models.email_broadcast_ab_test import EmailBroadcastABTest
from polar.models.email_broadcast_send import (
    EmailBroadcastSend,
    EmailBroadcastSendStatus,
)
from polar.models.email_subscriber import EmailSubscriber, EmailSubscriberStatus


class EmailBroadcastRepository(
    RepositorySoftDeletionMixin[EmailBroadcast],
    RepositoryBase[EmailBroadcast],
):
    model = EmailBroadcast

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[EmailBroadcast]]:
        statement = self.get_base_statement()
        if is_user(auth_subject):
            user = auth_subject.subject
            statement = statement.where(
                EmailBroadcast.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == user.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                EmailBroadcast.organization_id == auth_subject.subject.id,
            )
        return statement

    async def get_active_subscribers_for_org(
        self, organization_id: UUID
    ) -> list[EmailSubscriber]:
        statement = select(EmailSubscriber).where(
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.status == EmailSubscriberStatus.active,
            EmailSubscriber.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_analytics_counts_for_broadcasts(
        self, broadcast_ids: list[UUID]
    ) -> dict[UUID, dict[str, int]]:
        """Per-broadcast send/open/click/unsub counts, in one query.

        Opens/clicks are counted from `opened_at`/`clicked_at` rather than
        status. The status enum can drift (Resend webhooks arrive out of
        order; a delayed bounce can clobber an `opened` row) but the
        timestamp columns are append-only — they're set the first time we
        see the event and never cleared, which makes them the only
        reliable source-of-truth for engagement analytics.
        """
        if not broadcast_ids:
            return {}
        # `total` here means "emails actually dispatched" — rows that
        # reached Resend or further. We exclude `pending` (still queued)
        # and `failed` (never left Polar) because counting them as
        # "Recipients" / "Emails sent" mis-states what happened.
        sent_or_later = EmailBroadcastSend.status.in_(
            [
                EmailBroadcastSendStatus.sent,
                EmailBroadcastSendStatus.delivered,
                EmailBroadcastSendStatus.opened,
                EmailBroadcastSendStatus.clicked,
                EmailBroadcastSendStatus.bounced,
            ]
        )
        statement = (
            select(
                EmailBroadcastSend.broadcast_id,
                func.count(EmailBroadcastSend.id)
                .filter(sent_or_later)
                .label("total"),
                func.count(EmailBroadcastSend.id)
                .filter(
                    EmailBroadcastSend.status.in_(
                        [
                            EmailBroadcastSendStatus.delivered,
                            EmailBroadcastSendStatus.opened,
                            EmailBroadcastSendStatus.clicked,
                        ]
                    )
                )
                .label("delivered"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.opened_at.is_not(None))
                .label("opened"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.clicked_at.is_not(None))
                .label("clicked"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.unsubscribed_at.isnot(None))
                .label("unsubscribed"),
            )
            .where(
                EmailBroadcastSend.broadcast_id.in_(broadcast_ids),
                EmailBroadcastSend.deleted_at.is_(None),
            )
            .group_by(EmailBroadcastSend.broadcast_id)
        )
        result = await self.session.execute(statement)
        out: dict[UUID, dict[str, int]] = {}
        for row in result.all():
            out[row[0]] = {
                "total": row[1],
                "delivered": row[2],
                "opened": row[3],
                "clicked": row[4],
                "unsubscribed": row[5],
            }
        return out

    async def list_sends(
        self, broadcast_id: UUID, *, limit: int, page: int
    ) -> tuple[list[EmailBroadcastSend], int]:
        """Per-recipient sends for a broadcast, joined with subscriber info."""
        from sqlalchemy.orm import joinedload

        offset = (page - 1) * limit
        base = select(EmailBroadcastSend).where(
            EmailBroadcastSend.broadcast_id == broadcast_id,
            EmailBroadcastSend.deleted_at.is_(None),
        )
        count_stmt = select(func.count()).select_from(base.subquery())
        count = (await self.session.execute(count_stmt)).scalar_one()

        statement = (
            base.options(joinedload(EmailBroadcastSend.subscriber))
            .order_by(EmailBroadcastSend.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all()), count

    async def get_analytics_counts(
        self, broadcast_id: UUID
    ) -> dict[str, int]:
        """Get status counts for a broadcast's real (non-test) sends."""
        statement = (
            select(EmailBroadcastSend.status, func.count(EmailBroadcastSend.id))
            .where(
                EmailBroadcastSend.broadcast_id == broadcast_id,
                EmailBroadcastSend.deleted_at.is_(None),
            )
            .group_by(EmailBroadcastSend.status)
        )
        result = await self.session.execute(statement)
        return {row[0]: row[1] for row in result.all()}

    async def count_unsubscribed_for_broadcast(
        self, broadcast_id: UUID
    ) -> int:
        """Count sends that resulted in an unsubscribe."""
        statement = (
            select(func.count(EmailBroadcastSend.id))
            .where(
                EmailBroadcastSend.broadcast_id == broadcast_id,
                EmailBroadcastSend.unsubscribed_at.isnot(None),
                EmailBroadcastSend.deleted_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def get_aggregate_analytics(
        self,
        organization_id: UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, int]:
        """Get aggregate analytics across all broadcasts for an org.

        Optional `since`/`until` constrain to a window — used by the
        period-over-period delta query so the prior window can be
        compared against the current one.
        """
        # Only count sends that belong to a broadcast the creator
        # actually finished sending. Drafts, scheduled, sending (still
        # in flight), failed, and pending_approval broadcasts must not
        # contribute to "Emails sent" — even if stale `EmailBroadcastSend`
        # rows exist from an aborted send.
        # `total_sent` only counts rows that actually left Polar — i.e.
        # status reached `sent` or later. Including `pending` / `failed`
        # in this number was the cause of "Emails sent: 0 (or wrong)"
        # complaints when broadcasts had stuck or rejected sends.
        # Opens/clicks are counted from the timestamp columns rather than
        # status — see `get_analytics_counts_for_broadcasts` for the
        # rationale.
        statement = (
            select(
                func.count(EmailBroadcastSend.id).filter(
                    EmailBroadcastSend.status.in_([
                        EmailBroadcastSendStatus.sent,
                        EmailBroadcastSendStatus.delivered,
                        EmailBroadcastSendStatus.opened,
                        EmailBroadcastSendStatus.clicked,
                        EmailBroadcastSendStatus.bounced,
                    ])
                ).label("total_sent"),
                func.count(EmailBroadcastSend.id).filter(
                    EmailBroadcastSend.status.in_([
                        EmailBroadcastSendStatus.delivered,
                        EmailBroadcastSendStatus.opened,
                        EmailBroadcastSendStatus.clicked,
                    ])
                ).label("delivered"),
                func.count(EmailBroadcastSend.id).filter(
                    EmailBroadcastSend.opened_at.is_not(None)
                ).label("opened"),
                func.count(EmailBroadcastSend.id).filter(
                    EmailBroadcastSend.clicked_at.is_not(None)
                ).label("clicked"),
                func.count(EmailBroadcastSend.id).filter(
                    EmailBroadcastSend.unsubscribed_at.isnot(None)
                ).label("unsubscribed"),
            )
            .join(EmailBroadcast, EmailBroadcastSend.broadcast_id == EmailBroadcast.id)
            .where(
                EmailBroadcast.organization_id == organization_id,
                EmailBroadcast.status == EmailBroadcastStatus.sent,
                EmailBroadcast.deleted_at.is_(None),
                EmailBroadcastSend.deleted_at.is_(None),
            )
        )
        if since is not None:
            statement = statement.where(EmailBroadcastSend.created_at >= since)
        if until is not None:
            statement = statement.where(EmailBroadcastSend.created_at < until)
        result = await self.session.execute(statement)
        row = result.one()
        return {
            "total_sent": row[0],
            "delivered": row[1],
            "opened": row[2],
            "clicked": row[3],
            "unsubscribed": row[4],
        }

    async def get_top_links(
        self, organization_id: UUID, days: int, limit: int = 10
    ) -> list[dict]:
        """Aggregate click counts across the org's stored clicked_links.

        CTR is computed per-link against the deliveries on the broadcasts
        that contained that link (audit issue #21 / fix-list #21). The
        previous denominator was the org's total deliveries in the
        window — a link sent in a 100-recipient broadcast that got 5
        clicks read "0.05% CTR" instead of "5%". Even when "broadcasts
        that contained the link" can only be approximated from the click
        log (we don't index every URL in `content_html`), the per-link
        denominator captures the right order of magnitude.
        """
        from datetime import timedelta

        from polar.kit.utils import utc_now

        cutoff = utc_now() - timedelta(days=days)
        # Unnest each send's clicked_links array, attaching the parent
        # broadcast_id so we can group both clicks AND deliveries by url.
        unnested = (
            select(
                EmailBroadcastSend.broadcast_id.label("broadcast_id"),
                func.jsonb_array_elements(EmailBroadcastSend.clicked_links).label(
                    "evt"
                ),
            )
            .join(
                EmailBroadcast,
                EmailBroadcastSend.broadcast_id == EmailBroadcast.id,
            )
            .where(
                EmailBroadcast.organization_id == organization_id,
                EmailBroadcastSend.deleted_at.is_(None),
                EmailBroadcastSend.created_at >= cutoff,
            )
            .subquery()
        )

        url_col = unnested.c.evt.op("->>")("url").label("url")
        # `broadcasts_with_link` for each url is a Postgres array of distinct
        # broadcast ids in which we observed at least one click on that
        # url; we use it as the per-link denominator scope below.
        statement = (
            select(
                url_col,
                func.count().label("clicks"),
                func.array_agg(unnested.c.broadcast_id.distinct()).label(
                    "broadcasts_with_link"
                ),
            )
            .where(url_col.is_not(None))
            .group_by(url_col)
            .order_by(func.count().desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        rows = list(result.all())

        # Pre-compute deliveries per broadcast in the window so the per-
        # link CTRs only need a dict lookup. One query, not N+1.
        deliveries_per_broadcast: dict[UUID, int] = {}
        if rows:
            broadcast_ids: set[UUID] = set()
            for row in rows:
                ids = row[2] or []
                for bid in ids:
                    if bid is not None:
                        broadcast_ids.add(bid)
            if broadcast_ids:
                # Same `created_at >= cutoff` window as the click query.
                # Without it, deliveries from older broadcasts that
                # happened to contain the link inflate the denominator
                # and the CTR drops artificially for popular evergreen
                # links (audit issue #142).
                delivery_q = (
                    select(
                        EmailBroadcastSend.broadcast_id,
                        func.count(EmailBroadcastSend.id),
                    )
                    .where(
                        EmailBroadcastSend.broadcast_id.in_(broadcast_ids),
                        EmailBroadcastSend.deleted_at.is_(None),
                        EmailBroadcastSend.created_at >= cutoff,
                        EmailBroadcastSend.status.in_(
                            [
                                EmailBroadcastSendStatus.delivered,
                                EmailBroadcastSendStatus.opened,
                                EmailBroadcastSendStatus.clicked,
                            ]
                        ),
                    )
                    .group_by(EmailBroadcastSend.broadcast_id)
                )
                delivery_rows = await self.session.execute(delivery_q)
                for bid, n in delivery_rows.all():
                    deliveries_per_broadcast[bid] = int(n or 0)

        out: list[dict] = []
        for row in rows:
            url = row[0]
            clicks = int(row[1] or 0)
            broadcast_ids_for_link = [b for b in (row[2] or []) if b is not None]
            denom = sum(
                deliveries_per_broadcast.get(b, 0) for b in broadcast_ids_for_link
            )
            ctr = round((clicks / denom * 100), 2) if denom > 0 else 0.0
            out.append({"url": url, "clicks": clicks, "ctr": ctr})
        return out

    async def get_device_share(
        self, organization_id: UUID, days: int
    ) -> list[dict]:
        """Bucket last_user_agent strings into device families and return shares."""
        from datetime import timedelta

        from polar.kit.utils import utc_now

        cutoff = utc_now() - timedelta(days=days)
        statement = (
            select(EmailBroadcastSend.last_user_agent)
            .join(
                EmailBroadcast,
                EmailBroadcastSend.broadcast_id == EmailBroadcast.id,
            )
            .where(
                EmailBroadcast.organization_id == organization_id,
                EmailBroadcastSend.deleted_at.is_(None),
                EmailBroadcastSend.created_at >= cutoff,
                EmailBroadcastSend.last_user_agent.is_not(None),
            )
        )
        result = await self.session.execute(statement)
        agents = [row[0] for row in result.all()]

        buckets: dict[str, int] = {}
        for ua in agents:
            buckets[_classify_user_agent(ua)] = (
                buckets.get(_classify_user_agent(ua), 0) + 1
            )
        total = sum(buckets.values()) or 1
        out = [
            {"name": k, "share": round(v / total * 100, 1)}
            for k, v in sorted(buckets.items(), key=lambda kv: -kv[1])
        ]
        return out

    async def get_daily_engagement(
        self, organization_id: UUID, days: int
    ) -> list[dict]:
        """Per-day open and click rates across all broadcasts in the window."""
        from datetime import timedelta

        from polar.kit.utils import utc_now

        cutoff = utc_now() - timedelta(days=days)
        day_col = cast(EmailBroadcastSend.created_at, Date).label("day")
        # Denominator is "delivered" — sends that actually reached the
        # inbox. The label here used to be "delivered" but counted every
        # send in the .where() set (including raw `sent` rows for which
        # Resend hadn't yet confirmed delivery). That made the rate look
        # artificially low while delivery webhooks were still in flight
        # (audit issue #140). Restrict the count to delivered/opened/
        # clicked statuses; rows still in `sent` show up in tomorrow's
        # numbers once Resend confirms.
        delivered_statuses = [
            EmailBroadcastSendStatus.delivered,
            EmailBroadcastSendStatus.opened,
            EmailBroadcastSendStatus.clicked,
        ]
        statement = (
            select(
                day_col,
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.status.in_(delivered_statuses))
                .label("delivered"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.opened_at.is_not(None))
                .label("opened"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.clicked_at.is_not(None))
                .label("clicked"),
            )
            .join(
                EmailBroadcast,
                EmailBroadcastSend.broadcast_id == EmailBroadcast.id,
            )
            .where(
                EmailBroadcast.organization_id == organization_id,
                EmailBroadcastSend.deleted_at.is_(None),
                EmailBroadcastSend.created_at >= cutoff,
                EmailBroadcastSend.status.in_(
                    [
                        EmailBroadcastSendStatus.delivered,
                        EmailBroadcastSendStatus.opened,
                        EmailBroadcastSendStatus.clicked,
                        EmailBroadcastSendStatus.sent,
                    ]
                ),
            )
            .group_by(day_col)
            .order_by(day_col)
        )
        result = await self.session.execute(statement)
        rows = result.all()
        out = []
        for row in rows:
            delivered = row[1] or 0
            opened = row[2] or 0
            clicked = row[3] or 0
            out.append(
                {
                    "day": str(row[0]),
                    "open_rate": round(
                        (opened / delivered * 100) if delivered else 0.0, 2
                    ),
                    "click_rate": round(
                        (clicked / delivered * 100) if delivered else 0.0, 2
                    ),
                }
            )
        return out

    async def get_send_engagement_heatmap(
        self, organization_id: UUID, days: int = 90
    ) -> list[dict]:
        """Buckets opens by (day-of-week, hour-of-day).

        Returns one row per filled bucket so the API can shape it into a
        7×24 matrix. `dow` is Postgres' EXTRACT semantics (0=Sunday).
        Cells with fewer than 5 sends are flagged for the UI to grey
        out — the rate is still returned so callers can choose to
        ignore the threshold.
        """
        from polar.kit.utils import utc_now

        cutoff = utc_now() - timedelta(days=days)
        # Bucket every send by its created_at (the moment we queued the
        # delivery). Open count comes from `opened_at` or `clicked_at`
        # within the same bucket — Resend opens may arrive later but
        # they're attributed to when the email was sent, which is what
        # "best time to send" really asks.
        dow = func.extract("dow", EmailBroadcastSend.created_at).label("dow")
        hour = func.extract("hour", EmailBroadcastSend.created_at).label("hour")
        opened_filter = EmailBroadcastSend.opened_at.is_not(None)
        # "sends" was previously a raw count that included pending /
        # failed / bounced rows. Those skew the "best time to send"
        # rate down (failures concentrate at the start of large send
        # batches). Restrict to the same delivered-or-later statuses
        # the daily query uses (audit issue #141).
        delivered_or_later = EmailBroadcastSend.status.in_(
            [
                EmailBroadcastSendStatus.delivered,
                EmailBroadcastSendStatus.opened,
                EmailBroadcastSendStatus.clicked,
            ]
        )
        statement = (
            select(
                dow,
                hour,
                func.count(EmailBroadcastSend.id)
                .filter(delivered_or_later)
                .label("sends"),
                func.count(EmailBroadcastSend.id).filter(opened_filter).label("opens"),
            )
            .join(EmailBroadcast, EmailBroadcastSend.broadcast_id == EmailBroadcast.id)
            .where(
                EmailBroadcast.organization_id == organization_id,
                EmailBroadcastSend.deleted_at.is_(None),
                EmailBroadcastSend.created_at >= cutoff,
            )
            .group_by(dow, hour)
        )
        result = await self.session.execute(statement)
        return [
            {
                "dow": int(row[0]),
                "hour": int(row[1]),
                "sends": int(row[2]),
                "opens": int(row[3]),
            }
            for row in result.all()
        ]

    async def get_daily_sends(
        self, organization_id: UUID, days: int = 30
    ) -> list[dict]:
        """Get daily send counts for chart."""
        start_date = date.today() - timedelta(days=days)
        statement = (
            select(
                cast(EmailBroadcastSend.created_at, Date).label("day"),
                func.count(EmailBroadcastSend.id).label("count"),
            )
            .join(EmailBroadcast, EmailBroadcastSend.broadcast_id == EmailBroadcast.id)
            .where(
                EmailBroadcast.organization_id == organization_id,
                EmailBroadcastSend.deleted_at.is_(None),
                cast(EmailBroadcastSend.created_at, Date) >= start_date,
            )
            .group_by(cast(EmailBroadcastSend.created_at, Date))
            .order_by(cast(EmailBroadcastSend.created_at, Date))
        )
        result = await self.session.execute(statement)
        return [{"day": str(row[0]), "count": row[1]} for row in result.all()]

    async def cancel_pending_sends_for_subscriber(
        self, subscriber_id: UUID
    ) -> int:
        """Flip any still-pending broadcast sends for this subscriber to
        ``failed`` so the send actor stops picking them up.

        Used when a subscriber bounces, complains, or unsubscribes —
        we don't want to keep mailing a dead address while pending rows
        drain the queue. Returns the number of rows flipped.
        """
        result = await self.session.execute(
            update(EmailBroadcastSend)
            .where(
                EmailBroadcastSend.subscriber_id == subscriber_id,
                EmailBroadcastSend.status == EmailBroadcastSendStatus.pending,
                EmailBroadcastSend.deleted_at.is_(None),
            )
            .values(status=EmailBroadcastSendStatus.failed)
        )
        return int(result.rowcount or 0)


class EmailBroadcastABTestRepository(
    RepositorySoftDeletionMixin[EmailBroadcastABTest],
    RepositoryBase[EmailBroadcastABTest],
):
    model = EmailBroadcastABTest

    async def get_by_broadcast(
        self, broadcast_id: UUID
    ) -> EmailBroadcastABTest | None:
        statement = self.get_base_statement().where(
            EmailBroadcastABTest.broadcast_id == broadcast_id,
            EmailBroadcastABTest.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)

    async def get_due_for_winner(self, now) -> list[EmailBroadcastABTest]:
        """Tests whose decide_after window has elapsed but no winner picked."""
        from datetime import timedelta as _td

        statement = self.get_base_statement().where(
            EmailBroadcastABTest.deleted_at.is_(None),
            EmailBroadcastABTest.test_sent_at.is_not(None),
            EmailBroadcastABTest.winner_picked_at.is_(None),
        )
        result = await self.session.execute(statement)
        rows = list(result.scalars().all())
        return [
            r
            for r in rows
            if r.test_sent_at is not None
            and now - r.test_sent_at >= _td(minutes=r.decide_after_minutes)
        ]

    async def variant_analytics(
        self, broadcast_id: UUID
    ) -> dict[str, dict[str, int | float]]:
        """Per-variant counts (delivered/opened/clicked) for a broadcast."""
        statement = (
            select(
                EmailBroadcastSend.variant,
                func.count(EmailBroadcastSend.id).label("total"),
                func.count(EmailBroadcastSend.id)
                .filter(
                    EmailBroadcastSend.status.in_(
                        [
                            EmailBroadcastSendStatus.delivered,
                            EmailBroadcastSendStatus.opened,
                            EmailBroadcastSendStatus.clicked,
                        ]
                    )
                )
                .label("delivered"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.opened_at.is_not(None))
                .label("opened"),
                func.count(EmailBroadcastSend.id)
                .filter(EmailBroadcastSend.clicked_at.is_not(None))
                .label("clicked"),
            )
            .where(
                EmailBroadcastSend.broadcast_id == broadcast_id,
                EmailBroadcastSend.deleted_at.is_(None),
                EmailBroadcastSend.variant.in_(["a", "b"]),
            )
            .group_by(EmailBroadcastSend.variant)
        )
        result = await self.session.execute(statement)
        out: dict[str, dict[str, int | float]] = {}
        for row in result.all():
            delivered = row[2] or 0
            opened = row[3] or 0
            clicked = row[4] or 0
            out[row[0]] = {
                "total": row[1] or 0,
                "delivered": delivered,
                "opened": opened,
                "clicked": clicked,
                "open_rate": (opened / delivered * 100) if delivered else 0.0,
                "click_rate": (clicked / delivered * 100) if delivered else 0.0,
            }
        for v in ("a", "b"):
            out.setdefault(
                v,
                {
                    "total": 0,
                    "delivered": 0,
                    "opened": 0,
                    "clicked": 0,
                    "open_rate": 0.0,
                    "click_rate": 0.0,
                },
            )
        return out

    async def assign_remainder_variant(
        self, broadcast_id: UUID, variant: str
    ) -> int:
        """Set variant on all currently-unassigned sends for this broadcast."""
        statement = (
            update(EmailBroadcastSend)
            .where(
                EmailBroadcastSend.broadcast_id == broadcast_id,
                EmailBroadcastSend.variant.is_(None),
                EmailBroadcastSend.deleted_at.is_(None),
            )
            .values(variant=variant)
        )
        result = await self.session.execute(statement)
        return result.rowcount or 0


def _classify_user_agent(ua: str | None) -> str:
    """Bucket a User-Agent string into a coarse mail-client family."""
    if not ua:
        return "Other"
    s = ua.lower()
    if "iphone" in s or ("apple" in s and "mobile" in s):
        return "iPhone Mail"
    if "ipad" in s:
        return "iPad Mail"
    if "macintosh" in s and "mail" in s:
        return "Apple Mail (Mac)"
    if "android" in s and "gmail" in s:
        return "Gmail (Android)"
    if "gmail" in s or "googlemail" in s:
        return "Gmail (web)"
    if "outlook" in s or "microsoft outlook" in s:
        return "Outlook"
    if "yahoo" in s:
        return "Yahoo Mail"
    if "thunderbird" in s:
        return "Thunderbird"
    if "android" in s:
        return "Android Mail"
    return "Other"
