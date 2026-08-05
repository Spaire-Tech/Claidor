import secrets
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models.base import RecordModel

from .organization import Organization


class OrganizationCustomDomainStatus(StrEnum):
    """Lifecycle of a creator's storefront domain.

    pending: saved, waiting for the creator to install DNS records.
    active: DNS verified; the domain serves the storefront/portal.
    failed: was active (or verifying) but DNS checks have been failing
        past the failure threshold; excluded from storefront lookup until
        a check succeeds again.
    """

    pending = "pending"
    active = "active"
    failed = "failed"


def generate_verification_token() -> str:
    return secrets.token_hex(16)


class OrganizationCustomDomain(RecordModel):
    """A creator-owned domain (e.g. learn.creator.com) serving the
    masterclass landing + customer portal.

    One domain per organization in v1 (unique organization_id); modeled as
    its own table so multiple domains per org stay possible later. Rows are
    hard-deleted on removal — the unique index on `domain` must not be
    blocked by soft-deleted rows when a domain is re-added.
    """

    __tablename__ = "organization_custom_domains"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        unique=True,
    )

    domain: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True)

    status: Mapped[OrganizationCustomDomainStatus] = mapped_column(
        String,
        nullable=False,
        default=OrganizationCustomDomainStatus.pending,
    )

    # Expected value of the TXT record at _spaire-verify.{domain},
    # proving the creator controls the domain's DNS.
    verification_token: Mapped[str] = mapped_column(
        String(64), nullable=False, default=generate_verification_token
    )

    verified_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    # Consecutive failed re-verification checks while active; the domain is
    # demoted to `failed` once this passes the configured threshold.
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    @declared_attr
    def organization(cls) -> Mapped[Organization]:
        return relationship(Organization, lazy="raise")
