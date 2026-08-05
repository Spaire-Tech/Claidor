import random
from collections.abc import Sequence
from datetime import datetime, timedelta
from uuid import UUID

from polar.auth.models import AuthSubject, Organization, User
from polar.entitlements.service import entitlements as entitlements_service
from polar.exceptions import PolarError
from polar.kit.pagination import PaginationParams
from polar.kit.utils import utc_now
from polar.models.email_broadcast import EmailBroadcast, EmailBroadcastStatus
from polar.models.email_broadcast_ab_test import EmailBroadcastABTest
from polar.models.email_broadcast_send import (
    EmailBroadcastSend,
    EmailBroadcastSendStatus,
)
from polar.models.email_subscriber import EmailSubscriber
from polar.postgres import AsyncReadSession, AsyncSession
from polar.worker import enqueue_job


class BroadcastError(PolarError): ...


class BroadcastAlreadySent(BroadcastError):
    def __init__(self) -> None:
        super().__init__("Broadcast has already been sent or is currently sending.")

from .render import render_blocks_to_html
from .repository import EmailBroadcastABTestRepository, EmailBroadcastRepository


def _pct_delta(current: float | int, prior: float | int) -> float | None:
    """Percent-change of `current` relative to `prior`.

    Audit issue #20 / fix-list #20: returning 100.0 when prior=0 was
    dishonest — that's "+100% growth" regardless of whether `current`
    is 1 or 1,000,000. We return None instead and let the UI render
    "—" so users don't read meaning into a fabricated number. Returns
    0.0 when both are zero (no change).
    """
    if not prior:
        return None if current else 0.0
    return float(current - prior) / float(prior) * 100.0


class EmailBroadcastService:
    async def list(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        *,
        organization_id: UUID | None = None,
        status: str | None = None,
        q: str | None = None,
        pagination: PaginationParams,
    ) -> tuple[Sequence[EmailBroadcast], int]:
        repository = EmailBroadcastRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject)

        if organization_id is not None:
            statement = statement.where(
                EmailBroadcast.organization_id == organization_id
            )

        if status is not None:
            statement = statement.where(EmailBroadcast.status == status)

        if q is not None and q.strip():
            from sqlalchemy import func

            like = f"%{q.strip().lower()}%"
            statement = statement.where(
                func.lower(EmailBroadcast.subject).like(like)
            )

        statement = statement.order_by(EmailBroadcast.created_at.desc())
        return await repository.paginate(statement, limit=pagination.limit, page=pagination.page)

    async def list_analytics(
        self,
        session: AsyncReadSession,
        broadcast_ids: list[UUID],
    ) -> dict[UUID, dict[str, int | float]]:
        """Per-broadcast headline numbers used by the broadcast list view."""
        if not broadcast_ids:
            return {}
        repository = EmailBroadcastRepository.from_session(session)
        raw = await repository.get_analytics_counts_for_broadcasts(broadcast_ids)
        out: dict[UUID, dict[str, int | float]] = {}
        for bid, c in raw.items():
            delivered = c["delivered"]
            opened = c["opened"]
            clicked = c["clicked"]
            total = c["total"]
            # Fall back to total-sent as denominator whenever Resend
            # isn't firing `email.delivered` — keeps rates visible
            # instead of forcing the row to read 0%/—.
            if delivered > 0:
                denom = delivered
            elif total > 0:
                denom = total
            else:
                denom = 0
            out[bid] = {
                "recipients": total,
                "delivered": delivered,
                "opens": opened,
                "clicks": clicked,
                "unsubs": c["unsubscribed"],
                "open_rate": (opened / denom * 100) if denom else 0.0,
                "click_rate": (clicked / denom * 100) if denom else 0.0,
            }
        return out

    async def list_sends(
        self,
        session: AsyncReadSession,
        broadcast_id: UUID,
        *,
        pagination: PaginationParams,
    ) -> tuple[list, int]:
        repository = EmailBroadcastRepository.from_session(session)
        return await repository.list_sends(
            broadcast_id, limit=pagination.limit, page=pagination.page
        )

    async def duplicate(
        self,
        session: AsyncSession,
        original: EmailBroadcast,
    ) -> EmailBroadcast:
        repository = EmailBroadcastRepository.from_session(session)
        copy = EmailBroadcast(
            organization_id=original.organization_id,
            subject=f"Copy of {original.subject}",
            sender_name=original.sender_name,
            sender_email=original.sender_email,
            reply_to_email=original.reply_to_email,
            content_json=original.content_json,
            content_html=original.content_html,
            segment_id=original.segment_id,
            status=EmailBroadcastStatus.draft,
        )
        return await repository.create(copy, flush=True)

    async def cancel_schedule(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
    ) -> EmailBroadcast:
        if broadcast.status != EmailBroadcastStatus.scheduled:
            return broadcast
        repository = EmailBroadcastRepository.from_session(session)
        broadcast.status = EmailBroadcastStatus.draft
        broadcast.scheduled_at = None
        return await repository.update(broadcast)

    async def get_ab_test(
        self, session: AsyncReadSession, broadcast_id: UUID
    ) -> EmailBroadcastABTest | None:
        repo = EmailBroadcastABTestRepository.from_session(session)
        return await repo.get_by_broadcast(broadcast_id)

    async def upsert_ab_test(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
        *,
        subject_b: str,
        slice_pct: int,
        decide_after_minutes: int,
        winner_metric: str,
    ) -> EmailBroadcastABTest:
        # A/B testing is Pro+. Existing tests on Free are not retroactively
        # disabled (we never delete on downgrade), but new ones cannot be
        # configured.
        await entitlements_service.require_feature(
            session, broadcast.organization_id, "email_ab_testing"
        )

        if broadcast.status not in (
            EmailBroadcastStatus.draft,
            EmailBroadcastStatus.scheduled,
        ):
            raise BroadcastError(
                "A/B test config can only change while the broadcast is a draft or scheduled."
            )

        slice_pct = max(5, min(50, int(slice_pct)))
        decide_after_minutes = max(15, int(decide_after_minutes))
        if winner_metric not in ("open_rate", "click_rate"):
            winner_metric = "open_rate"

        repo = EmailBroadcastABTestRepository.from_session(session)
        existing = await repo.get_by_broadcast(broadcast.id)
        if existing is not None:
            existing.subject_b = subject_b
            existing.slice_pct = slice_pct
            existing.decide_after_minutes = decide_after_minutes
            existing.winner_metric = winner_metric
            return await repo.update(existing)

        ab_test = EmailBroadcastABTest(
            broadcast_id=broadcast.id,
            subject_b=subject_b,
            slice_pct=slice_pct,
            decide_after_minutes=decide_after_minutes,
            winner_metric=winner_metric,
        )
        return await repo.create(ab_test, flush=True)

    async def delete_ab_test(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
    ) -> None:
        if broadcast.status not in (
            EmailBroadcastStatus.draft,
            EmailBroadcastStatus.scheduled,
        ):
            raise BroadcastError(
                "A/B test config can only change while the broadcast is a draft or scheduled."
            )
        repo = EmailBroadcastABTestRepository.from_session(session)
        existing = await repo.get_by_broadcast(broadcast.id)
        if existing is not None:
            existing.deleted_at = utc_now()
            await repo.update(existing)

    async def get_ab_analytics(
        self, session: AsyncReadSession, broadcast_id: UUID
    ) -> dict[str, dict[str, int | float]]:
        repo = EmailBroadcastABTestRepository.from_session(session)
        return await repo.variant_analytics(broadcast_id)

    async def archive(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
    ) -> None:
        from polar.kit.utils import utc_now

        broadcast.deleted_at = utc_now()
        repository = EmailBroadcastRepository.from_session(session)
        await repository.update(broadcast)

    async def get_by_id(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        broadcast_id: UUID,
    ) -> EmailBroadcast | None:
        repository = EmailBroadcastRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject).where(
            EmailBroadcast.id == broadcast_id
        )
        return await repository.get_one_or_none(statement)

    async def create(
        self,
        session: AsyncSession,
        *,
        organization_id: UUID,
        subject: str,
        sender_name: str,
        sender_email: str | None = None,
        preview_text: str | None = None,
        reply_to_email: str | None = None,
        content_json: dict | None = None,
        content_html: str | None = None,
        segment_id: UUID | None = None,
        filter_rules: dict | None = None,
    ) -> EmailBroadcast:
        # If the caller supplied content_html, trust it — the editor is the
        # source of truth for its own output. Only fall back to regenerating
        # from content_json when no HTML was provided (e.g. an API client
        # that only sends the JSON document). This mirrors the update path:
        # an explicit content_html always wins.
        if content_json and not content_html:
            content_html = render_blocks_to_html(content_json)

        repository = EmailBroadcastRepository.from_session(session)
        broadcast_kwargs: dict[str, object] = {
            "organization_id": organization_id,
            "subject": subject,
            "preview_text": preview_text,
            "sender_name": sender_name,
            "reply_to_email": reply_to_email,
            "content_json": content_json,
            "content_html": content_html,
            "segment_id": segment_id,
            "filter_rules": filter_rules,
            "status": EmailBroadcastStatus.draft,
        }
        # The model has a column-level default for sender_email; only
        # override it when the caller explicitly passes a value, so existing
        # callers that didn't know about the field continue to fall back to
        # the platform's notifications sender.
        if sender_email is not None:
            broadcast_kwargs["sender_email"] = sender_email
        broadcast = EmailBroadcast(**broadcast_kwargs)
        return await repository.create(broadcast, flush=True)

    async def update(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
        *,
        update: dict,
    ) -> EmailBroadcast:
        """Apply only the fields explicitly present in `update`. Pass `None` to clear."""
        repository = EmailBroadcastRepository.from_session(session)
        for key in (
            "subject",
            "preview_text",
            "sender_name",
            "reply_to_email",
            "content_json",
            "content_html",
            "segment_id",
            "filter_rules",
        ):
            if key in update:
                setattr(broadcast, key, update[key])

        # If the client patched content_json without supplying a matching
        # content_html, regenerate the HTML from the JSON so the worker stays
        # in sync. An explicit content_html in the same patch wins.
        if "content_json" in update and "content_html" not in update:
            broadcast.content_html = render_blocks_to_html(broadcast.content_json) or broadcast.content_html

        return await repository.update(broadcast)

    async def send_test(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
        *,
        to_email: str,
    ) -> None:
        """Send a one-off test of this broadcast to a single inbox.

        Enqueues the send through Dramatiq rather than calling the Resend
        client inline (audit issue #5 / #50): a synchronous HTTP roundtrip
        on the request thread blocked the API and offered no retry on
        Resend failure.
        """
        enqueue_job(
            "email_broadcast.send_test",
            broadcast_id=broadcast.id,
            to_email=to_email,
        )

    async def send_test_inline(
        self,
        session: AsyncSession,
        *,
        organization_id: UUID,
        subject: str,
        content_html: str,
        preview_text: str | None,
        sender_name: str | None,
        to_email: str,
    ) -> None:
        """Send a test of in-progress authored content (no saved broadcast).

        Used by the sequence email editor so a creator can preview the exact
        email in their own inbox before wiring it into a sequence. Runs through
        the same render + Resend path as a real broadcast test.
        """
        enqueue_job(
            "email_broadcast.send_test_inline",
            organization_id=organization_id,
            subject=subject,
            content_html=content_html,
            preview_text=preview_text,
            sender_name=sender_name,
            to_email=to_email,
        )

    async def send(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
    ) -> EmailBroadcast:
        """Initiate sending a broadcast. Creates send records and enqueues jobs."""
        repository = EmailBroadcastRepository.from_session(session)

        # Audience precedence: inline filter_rules → saved segment → all active.
        if broadcast.filter_rules:
            from polar.email_subscriber.service import (
                email_subscriber as subscriber_service,
            )

            subscribers = await subscriber_service.resolve_filter_subscribers(
                session,
                organization_id=broadcast.organization_id,
                filter_rules=broadcast.filter_rules,
            )
        elif broadcast.segment_id is not None:
            from polar.email_segment.service import email_segment as segment_service
            from polar.models.email_segment import EmailSegment

            segment = await session.get(EmailSegment, broadcast.segment_id)
            if segment is not None:
                subscriber_ids = await segment_service.get_subscriber_ids(
                    session, segment
                )
                subscribers = []
                for sid in subscriber_ids:
                    sub = await session.get(EmailSubscriber, sid)
                    if sub is not None:
                        subscribers.append(sub)
            else:
                subscribers = await repository.get_active_subscribers_for_org(
                    broadcast.organization_id
                )
        else:
            subscribers = await repository.get_active_subscribers_for_org(
                broadcast.organization_id
            )

        if not subscribers:
            broadcast.status = EmailBroadcastStatus.sent
            broadcast.sent_at = utc_now()
            broadcast.total_recipients = 0
            return await repository.update(broadcast)

        # Did the user configure an A/B test? If so, only the test slice gets
        # variant labels right now; the remainder stays variant=null and is
        # filled in once the winner is picked by the cron job.
        ab_repo = EmailBroadcastABTestRepository.from_session(session)
        ab_test = await ab_repo.get_by_broadcast(broadcast.id)
        ab_active = ab_test is not None and ab_test.winner_picked_at is None

        if ab_active and ab_test is not None:
            shuffled = list(subscribers)
            random.shuffle(shuffled)
            slice_size = max(2, int(len(shuffled) * (ab_test.slice_pct / 100)))
            slice_size = min(slice_size, len(shuffled))
            test_slice = shuffled[:slice_size]
            remainder = shuffled[slice_size:]
            half = len(test_slice) // 2
            for i, subscriber in enumerate(test_slice):
                variant = "a" if i < half else "b"
                session.add(
                    EmailBroadcastSend(
                        broadcast_id=broadcast.id,
                        subscriber_id=subscriber.id,
                        status=EmailBroadcastSendStatus.pending,
                        variant=variant,
                    )
                )
            for subscriber in remainder:
                session.add(
                    EmailBroadcastSend(
                        broadcast_id=broadcast.id,
                        subscriber_id=subscriber.id,
                        status=EmailBroadcastSendStatus.pending,
                        variant=None,
                    )
                )
            ab_test.test_sent_at = utc_now()
        else:
            for subscriber in subscribers:
                session.add(
                    EmailBroadcastSend(
                        broadcast_id=broadcast.id,
                        subscriber_id=subscriber.id,
                        status=EmailBroadcastSendStatus.pending,
                    )
                )

        broadcast.status = EmailBroadcastStatus.sending
        broadcast.total_recipients = len(subscribers)
        await repository.update(broadcast)

        # Flush to persist send records
        await session.flush()

        # Worker dispatch. For A/B we only release the test slice now; the
        # winner-picker cron releases the remainder once it has data.
        enqueue_job(
            "email_broadcast.send_emails",
            broadcast_id=broadcast.id,
            variant_filter="ab_test_only" if ab_active else None,
        )

        return broadcast

    async def schedule(
        self,
        session: AsyncSession,
        broadcast: EmailBroadcast,
        *,
        scheduled_at: datetime,
    ) -> EmailBroadcast:
        """Schedule a broadcast to be sent at a specific time."""
        if broadcast.status in (
            EmailBroadcastStatus.sending,
            EmailBroadcastStatus.sent,
        ):
            raise BroadcastAlreadySent()

        repository = EmailBroadcastRepository.from_session(session)
        broadcast.status = EmailBroadcastStatus.scheduled
        broadcast.scheduled_at = scheduled_at
        return await repository.update(broadcast)

    async def get_analytics(
        self,
        session: AsyncReadSession,
        broadcast_id: UUID,
    ) -> dict[str, int | float]:
        """Get analytics for a broadcast.

        Engagement counts (opened/clicked) come from the per-broadcast
        engagement query that reads `opened_at`/`clicked_at` directly —
        the status enum is unreliable for analytics because Resend
        webhooks can arrive out of order and late events (a bounce
        landing after an open) can overwrite engagement status.
        """
        repository = EmailBroadcastRepository.from_session(session)
        counts = await repository.get_analytics_counts(broadcast_id)
        engagement = (
            await repository.get_analytics_counts_for_broadcasts([broadcast_id])
        ).get(broadcast_id, {})

        total = sum(counts.values())
        delivered = engagement.get(
            "delivered",
            counts.get(EmailBroadcastSendStatus.delivered, 0)
            + counts.get(EmailBroadcastSendStatus.opened, 0)
            + counts.get(EmailBroadcastSendStatus.clicked, 0),
        )
        opened = engagement.get("opened", 0)
        clicked = engagement.get("clicked", 0)
        bounced = counts.get(EmailBroadcastSendStatus.bounced, 0)
        sent_count = total - counts.get(EmailBroadcastSendStatus.pending, 0) - counts.get(EmailBroadcastSendStatus.failed, 0)
        unsubscribed = await repository.count_unsubscribed_for_broadcast(broadcast_id)

        # Same denominator fallback as the aggregate: prefer delivered,
        # fall back to actually-sent count when Resend doesn't fire
        # `email.delivered` so rates remain visible.
        if delivered > 0:
            denom = delivered
        elif sent_count > 0:
            denom = sent_count
        else:
            denom = 0

        return {
            "total_recipients": total,
            "sent": sent_count,
            "delivered": delivered,
            "opened": opened,
            "clicked": clicked,
            "bounced": bounced,
            "unsubscribed": unsubscribed,
            "open_rate": (opened / denom * 100) if denom else 0.0,
            "click_rate": (clicked / denom * 100) if denom else 0.0,
            # Same hint as the aggregate analytics — false means we
            # delivered emails but haven't seen any engagement webhooks
            # yet, which usually means domain-level tracking is OFF.
            # The UI uses this to render a "tracking not detected"
            # banner instead of a misleading 0% engagement readout.
            "webhook_signal_present": delivered > 0 or opened > 0 or clicked > 0,
        }


    @staticmethod
    def _shape_aggregate(counts: dict[str, int]) -> dict[str, int | float | None]:
        total_sent = counts["total_sent"]
        delivered = counts["delivered"]
        opened = counts["opened"]
        clicked = counts["clicked"]
        unsubscribed = counts["unsubscribed"]
        # Denominator: prefer `delivered` when Resend confirms it, fall
        # back to `total_sent` whenever there are sends to count
        # against. The strict "delivered or null" version surfaced "—"
        # on the dashboard even when there were sends to compute a rate
        # against — users read that as "broken". Falling back to
        # total_sent makes the rate visible (0% if no opens, real % if
        # opens arrive without delivered webhooks).
        if delivered > 0:
            denom: int | None = delivered
        elif total_sent > 0:
            denom = total_sent
        else:
            denom = None
        open_rate = (opened / denom * 100) if denom else None
        click_rate = (clicked / denom * 100) if denom else None
        unsub_rate = (unsubscribed / denom * 100) if denom else None
        return {
            "total_sent": total_sent,
            "delivered": delivered,
            "opened": opened,
            "clicked": clicked,
            "unsubscribed": unsubscribed,
            # `webhook_signal_present` lets the UI render a "Connect
            # Resend webhooks for accurate rates" prompt instead of
            # silent dashes when delivered is zero but sends exist.
            "webhook_signal_present": delivered > 0 or opened > 0 or clicked > 0,
            "open_rate": open_rate,
            "click_rate": click_rate,
            "unsub_rate": unsub_rate,
        }

    async def get_aggregate_analytics(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        *,
        days: int | None = None,
        compare_prior: bool = False,
    ) -> dict:
        """Aggregate analytics for the org.

        When `days` is provided we constrain to the last N days; when
        `compare_prior` is also set we run the same query for the
        immediately preceding window (the same N days before that) and
        return both alongside a delta map. The frontend uses this to
        render "+12.4% vs prior 30d" on every tile.
        """
        repository = EmailBroadcastRepository.from_session(session)

        since: datetime | None = None
        until: datetime | None = None
        prior: dict[str, int | float] | None = None
        if days is not None:
            now = utc_now()
            since = now - timedelta(days=days)
            until = now

        current_counts = await repository.get_aggregate_analytics(
            organization_id, since=since, until=until
        )
        current = self._shape_aggregate(current_counts)

        delta: dict[str, float | None] = {}
        if compare_prior and days is not None and since is not None:
            prior_since = since - timedelta(days=days)
            prior_until = since
            prior_counts = await repository.get_aggregate_analytics(
                organization_id, since=prior_since, until=prior_until
            )
            prior = self._shape_aggregate(prior_counts)

            def _pt_delta(current_val: float | None, prior_val: float | None) -> float | None:
                # _shape_aggregate returns None for rates when the
                # denominator is zero. Previously we float(None)'d both
                # sides and 500'd. Return None so the UI renders "—".
                if current_val is None or prior_val is None:
                    return None
                return float(current_val) - float(prior_val)

            delta = {
                "total_sent_pct": _pct_delta(
                    current["total_sent"], prior["total_sent"]
                ),
                "open_rate_pt": _pt_delta(
                    current["open_rate"], prior["open_rate"]
                ),
                "click_rate_pt": _pt_delta(
                    current["click_rate"], prior["click_rate"]
                ),
                "unsub_rate_pt": _pt_delta(
                    current["unsub_rate"], prior["unsub_rate"]
                ),
            }

        # Industry benchmark (audit issue #10 / fix-list #29). The legacy
        # implementation hardcoded two unsourced constants (21% / 2.5%);
        # the new table is sourced from Mailchimp's 2024 industry
        # benchmarks and exposes a `source` string so the UI can label
        # the comparison ("vs Mailchimp 2024 benchmark") instead of
        # presenting fabricated numbers. Per-org category overrides are
        # follow-on work — Organization doesn't carry a marketing-
        # settings column today, so we ship the cross-industry median
        # (`all_industries`) as the default and let admins pick a
        # category once the settings UI lands.
        from .industry_benchmarks import get_industry_benchmark

        benchmark = get_industry_benchmark(None)

        return {
            "current": current,
            "prior": prior,
            "delta": delta,
            "industry": {
                "slug": benchmark.slug,
                "label": benchmark.label,
                "source": "Mailchimp 2024 industry benchmarks",
                "open_rate": benchmark.open_rate,
                "click_rate": benchmark.click_rate,
                "unsub_rate": benchmark.unsub_rate,
            },
        }

    async def get_engagement_heatmap(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        days: int = 90,
    ) -> dict:
        """7×24 (day-of-week × hour) open-rate heatmap.

        Returns the matrix shape directly (`matrix[dow][hour] = rate
        in 0..1 or null`) so the frontend can drop straight into the
        SVG. Buckets with fewer than the threshold sample size return
        null so the UI can render them as empty.
        """
        repository = EmailBroadcastRepository.from_session(session)
        rows = await repository.get_send_engagement_heatmap(
            organization_id, days=days
        )
        threshold = 5
        matrix: list[list[float | None]] = [
            [None for _ in range(24)] for _ in range(7)
        ]
        sample_total = 0
        for row in rows:
            sends = row["sends"]
            opens = row["opens"]
            sample_total += sends
            if sends < threshold:
                continue
            dow = row["dow"]
            hour = row["hour"]
            if 0 <= dow < 7 and 0 <= hour < 24:
                matrix[dow][hour] = (opens / sends) if sends > 0 else 0.0
        return {
            "matrix": matrix,
            "sample_size": sample_total,
            "threshold": threshold,
        }

    async def get_daily_sends(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        days: int = 30,
    ) -> list[dict]:
        repository = EmailBroadcastRepository.from_session(session)
        return await repository.get_daily_sends(organization_id, days)

    async def get_top_links(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        days: int = 14,
        limit: int = 10,
    ) -> list[dict]:
        repository = EmailBroadcastRepository.from_session(session)
        return await repository.get_top_links(organization_id, days, limit=limit)

    async def get_device_share(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        days: int = 90,
    ) -> list[dict]:
        repository = EmailBroadcastRepository.from_session(session)
        return await repository.get_device_share(organization_id, days)

    async def get_daily_engagement(
        self,
        session: AsyncReadSession,
        organization_id: UUID,
        days: int = 14,
    ) -> list[dict]:
        repository = EmailBroadcastRepository.from_session(session)
        return await repository.get_daily_engagement(organization_id, days)


email_broadcast = EmailBroadcastService()
