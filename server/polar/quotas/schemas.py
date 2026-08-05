from pydantic import Field

from polar.kit.schemas import Schema

from .definitions import QuotaKey
from .service import QuotaUsage as QuotaUsageDataclass


class QuotaUsage(Schema):
    quota: QuotaKey = Field(description="Quota key, e.g. 'storage_gb'.")
    limit: int | None = Field(
        description="Tier-defined limit in display units. null = unlimited."
    )
    used: int = Field(description="Current usage in display units (rounded down).")
    used_exact: float = Field(
        default=0.0,
        description=(
            "Exact usage in display units (e.g. 0.87 GB) so usage under one "
            "whole unit doesn't render as zero."
        ),
    )
    remaining: int | None = Field(
        description="Remaining capacity in display units. null = unlimited."
    )
    is_unlimited: bool
    is_exceeded: bool

    @classmethod
    def from_dataclass(cls, source: QuotaUsageDataclass) -> "QuotaUsage":
        return cls(
            quota=source.quota,
            limit=source.limit,
            used=source.used,
            used_exact=source.used_exact,
            remaining=source.remaining,
            is_unlimited=source.is_unlimited,
            is_exceeded=source.is_exceeded,
        )


class OrganizationUsage(Schema):
    """Snapshot of every tier-gated quota for an organization."""

    items: list[QuotaUsage] = Field(
        description="One entry per QuotaKey, in declaration order."
    )
