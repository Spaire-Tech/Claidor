from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import Date, Select, cast, func, or_, select

from polar.auth.models import AuthSubject, Organization, User, is_organization, is_user
from polar.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionMixin,
)
from polar.kit.utils import utc_now
from polar.models import UserOrganization
from polar.models.email_broadcast_send import EmailBroadcastSend
from polar.models.email_subscriber import (
    EmailSubscriber,
    EmailSubscriberSource,
    EmailSubscriberStatus,
)


# JSON shape that the audience builder serializes:
#   {"all": [{"field": "source", "op": "is", "value": "manual"}, ...]}
# Supported field/op combos are listed in build_filter_query below.
def build_filter_query(
    organization_id: UUID, filter_rules: dict | None
) -> Select:
    """Compile a filter_rules JSON object into a select(EmailSubscriber)."""
    statement = select(EmailSubscriber).where(
        EmailSubscriber.organization_id == organization_id,
        EmailSubscriber.deleted_at.is_(None),
    )

    if not filter_rules:
        return statement.where(
            EmailSubscriber.status == EmailSubscriberStatus.active,
        )

    rules = filter_rules.get("all") or []

    # Subquery only joined when a last_opened_at filter is present.
    last_open_subq = None

    # Default: only target active subscribers unless a status rule overrides.
    has_status_rule = any(r.get("field") == "status" for r in rules)
    if not has_status_rule:
        statement = statement.where(
            EmailSubscriber.status == EmailSubscriberStatus.active,
        )

    for rule in rules:
        field = rule.get("field")
        op = rule.get("op")
        value = rule.get("value")

        if field == "source":
            if op == "is":
                statement = statement.where(EmailSubscriber.source == value)
            elif op == "is_not":
                statement = statement.where(EmailSubscriber.source != value)

        elif field == "status":
            if op == "is":
                statement = statement.where(EmailSubscriber.status == value)
            elif op == "is_not":
                statement = statement.where(EmailSubscriber.status != value)

        elif field == "import_source":
            if op == "is":
                statement = statement.where(
                    EmailSubscriber.import_source == value
                )
            elif op == "contains" and isinstance(value, str):
                statement = statement.where(
                    func.lower(EmailSubscriber.import_source).like(
                        f"%{value.lower()}%"
                    )
                )

        elif field == "subscribed_at":
            try:
                days = int(value)
            except (TypeError, ValueError):
                continue
            cutoff = utc_now() - timedelta(days=days)
            if op == "within_days":
                statement = statement.where(
                    EmailSubscriber.created_at >= cutoff
                )
            elif op == "more_than_days_ago":
                statement = statement.where(
                    EmailSubscriber.created_at < cutoff
                )

        elif field == "last_opened_at":
            if last_open_subq is None:
                last_open_subq = (
                    select(
                        EmailBroadcastSend.subscriber_id.label("subscriber_id"),
                        func.max(EmailBroadcastSend.opened_at).label("last_open"),
                    )
                    .where(EmailBroadcastSend.opened_at.is_not(None))
                    .group_by(EmailBroadcastSend.subscriber_id)
                    .subquery()
                )
                statement = statement.outerjoin(
                    last_open_subq,
                    last_open_subq.c.subscriber_id == EmailSubscriber.id,
                )

            if op == "never_opened":
                statement = statement.where(last_open_subq.c.last_open.is_(None))
            else:
                try:
                    days = int(value)
                except (TypeError, ValueError):
                    continue
                cutoff = utc_now() - timedelta(days=days)
                if op == "within_days":
                    statement = statement.where(
                        last_open_subq.c.last_open >= cutoff
                    )
                elif op == "more_than_days_ago":
                    statement = statement.where(
                        or_(
                            last_open_subq.c.last_open.is_(None),
                            last_open_subq.c.last_open < cutoff,
                        )
                    )

    return statement


class EmailSubscriberRepository(
    RepositorySoftDeletionMixin[EmailSubscriber],
    RepositoryBase[EmailSubscriber],
):
    model = EmailSubscriber

    @staticmethod
    def apply_query_filter(
        statement: Select[tuple[EmailSubscriber]], q: str
    ) -> Select[tuple[EmailSubscriber]]:
        like = f"%{q.lower()}%"
        return statement.where(
            or_(
                func.lower(EmailSubscriber.email).like(like),
                func.lower(EmailSubscriber.name).like(like),
            )
        )

    async def get_by_email_and_organization(
        self, email: str, organization_id: UUID
    ) -> EmailSubscriber | None:
        statement = self.get_base_statement().where(
            func.lower(EmailSubscriber.email) == email.lower(),
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)

    async def get_by_customer_and_organization(
        self, customer_id: UUID, organization_id: UUID
    ) -> EmailSubscriber | None:
        statement = self.get_base_statement().where(
            EmailSubscriber.customer_id == customer_id,
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.deleted_at.is_(None),
        )
        return await self.get_one_or_none(statement)

    async def list_by_emails_and_organization(
        self, emails: list[str], organization_id: UUID
    ) -> list[EmailSubscriber]:
        """Batch lookup of subscribers in this org whose lowercased email is
        in the given set. Used by bulk_create to differentiate "new" from
        "existing-and-reactivated" in a single round-trip rather than
        N round-trips with the modified_at heuristic the audit (#44 / fix-
        list #44) flagged as unreliable.
        """
        if not emails:
            return []
        normalized = sorted({e.lower().strip() for e in emails if e})
        statement = self.get_base_statement().where(
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.deleted_at.is_(None),
            func.lower(EmailSubscriber.email).in_(normalized),
        )
        return await self.get_all(statement)

    async def count_by_organization(self, organization_id: UUID) -> int:
        """All active subscribers, buyers included. Used for dashboard
        totals — NOT for the cap (see count_marketing_subscribers)."""
        statement = select(func.count(EmailSubscriber.id)).where(
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.deleted_at.is_(None),
            EmailSubscriber.status == "active",
        )
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def count_marketing_subscribers(self, organization_id: UUID) -> int:
        """Active subscribers that count toward the email_subscribers cap.

        Buyers are deliberately uncapped: a contact linked to a paying
        customer (``customer_id`` set) or acquired through a purchase
        does NOT count, because they're already monetized by the
        transaction fee. Only marketing contacts — space signups,
        lead-magnet opt-ins, manual adds, and imports — count, so a
        creator is never pushed to upgrade by their own sales (the
        "success tax" that drove the Kajabi backlash). This mirrors the
        buyer-exclusion in EmailSubscriberService.create()'s cap gate.
        """
        statement = select(func.count(EmailSubscriber.id)).where(
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.deleted_at.is_(None),
            EmailSubscriber.status == EmailSubscriberStatus.active,
            EmailSubscriber.customer_id.is_(None),
            EmailSubscriber.source != EmailSubscriberSource.purchase,
        )
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def count_by_status(
        self, organization_id: UUID
    ) -> dict[str, int]:
        statement = (
            select(EmailSubscriber.status, func.count(EmailSubscriber.id))
            .where(
                EmailSubscriber.organization_id == organization_id,
                EmailSubscriber.deleted_at.is_(None),
            )
            .group_by(EmailSubscriber.status)
        )
        result = await self.session.execute(statement)
        counts = {row[0]: row[1] for row in result.all()}
        return counts

    async def count_filter_matches(
        self, organization_id: UUID, filter_rules: dict | None
    ) -> int:
        base = build_filter_query(organization_id, filter_rules)
        statement = select(func.count()).select_from(base.subquery())
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def list_filter_matches(
        self,
        organization_id: UUID,
        filter_rules: dict | None,
        *,
        limit: int | None = None,
    ) -> list[EmailSubscriber]:
        statement = build_filter_query(organization_id, filter_rules).order_by(
            EmailSubscriber.created_at.desc()
        )
        if limit is not None:
            statement = statement.limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_active_by_organization(
        self, organization_id: UUID
    ) -> list[EmailSubscriber]:
        statement = self.get_base_statement().where(
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.status == "active",
            EmailSubscriber.deleted_at.is_(None),
        )
        return await self.get_all(statement)

    async def get_all_for_export(
        self, organization_id: UUID
    ) -> list[EmailSubscriber]:
        """Get all subscribers (including non-active) for CSV export."""
        statement = self.get_base_statement().where(
            EmailSubscriber.organization_id == organization_id,
            EmailSubscriber.deleted_at.is_(None),
        ).order_by(EmailSubscriber.created_at.desc())
        return list(await self.get_all(statement))

    async def get_daily_counts(
        self, organization_id: UUID, days: int = 30
    ) -> list[dict]:
        """Get daily subscriber counts for the last N days."""
        start_date = date.today() - timedelta(days=days)
        statement = (
            select(
                cast(EmailSubscriber.created_at, Date).label("day"),
                func.count(EmailSubscriber.id).label("count"),
            )
            .where(
                EmailSubscriber.organization_id == organization_id,
                EmailSubscriber.deleted_at.is_(None),
                cast(EmailSubscriber.created_at, Date) >= start_date,
            )
            .group_by(cast(EmailSubscriber.created_at, Date))
            .order_by(cast(EmailSubscriber.created_at, Date))
        )
        result = await self.session.execute(statement)
        return [{"day": str(row[0]), "count": row[1]} for row in result.all()]

    async def get_daily_unsubscribes(
        self, organization_id: UUID, days: int = 30
    ) -> list[dict]:
        """Get daily unsubscribe counts for the last N days."""
        start_date = date.today() - timedelta(days=days)
        statement = (
            select(
                cast(EmailSubscriber.unsubscribed_at, Date).label("day"),
                func.count(EmailSubscriber.id).label("count"),
            )
            .where(
                EmailSubscriber.organization_id == organization_id,
                EmailSubscriber.deleted_at.is_(None),
                EmailSubscriber.unsubscribed_at.isnot(None),
                cast(EmailSubscriber.unsubscribed_at, Date) >= start_date,
            )
            .group_by(cast(EmailSubscriber.unsubscribed_at, Date))
            .order_by(cast(EmailSubscriber.unsubscribed_at, Date))
        )
        result = await self.session.execute(statement)
        return [{"day": str(row[0]), "count": row[1]} for row in result.all()]

    def get_readable_statement(
        self, auth_subject: AuthSubject[User | Organization]
    ) -> Select[tuple[EmailSubscriber]]:
        statement = self.get_base_statement()

        if is_user(auth_subject):
            user = auth_subject.subject
            statement = statement.where(
                EmailSubscriber.organization_id.in_(
                    select(UserOrganization.organization_id).where(
                        UserOrganization.user_id == user.id,
                        UserOrganization.deleted_at.is_(None),
                    )
                )
            )
        elif is_organization(auth_subject):
            statement = statement.where(
                EmailSubscriber.organization_id == auth_subject.subject.id,
            )

        return statement
