"""Quota definitions — the static contract between producers, the quotas
service, and the entitlements limits.

Each quota:
  - has a `key` that matches a field on TierEntitlements.limits
  - is "filled" by events with `event_name` (producers emit these)
  - is computed by an aggregation over those events
  - has a `scope` of either "lifetime" or "monthly"
  - has a `unit_divisor` so raw event values (seconds, bytes) can be
    compared against tier limits that use friendlier units (hours, GB)

Examples:

  video_views_monthly:
    event_name = "spaire.video.viewed"
    aggregation = count
    scope = monthly (only events in current UTC calendar month count)

Email is NOT metered here. List size (email_subscribers) is enforced
directly against the tier limit at subscriber-add time
(polar/email_subscriber/service.py); email *sends* are uncapped on every
tier, so there is no email quota key.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal


class QuotaKey(StrEnum):
    storage_gb = "storage_gb"


QuotaAggregation = Literal["count", "sum"]
QuotaScope = Literal["lifetime", "monthly"]


@dataclass(frozen=True)
class QuotaDefinition:
    key: QuotaKey
    event_name: str
    aggregation: QuotaAggregation
    aggregation_property: str | None  # required when aggregation == "sum"
    scope: QuotaScope
    # Conversion factor from display units (the tier-limit unit) to the
    # storage unit emitted by producers. Internally arithmetic happens in
    # storage units so byte-level precision is preserved on the check
    # path; `used` is converted back to display units for the caller.
    #
    #   storage_gb:          1 GB    = 1_073_741_824 bytes
    #   counts (sends, views): 1 unit display = 1 unit storage
    storage_units_per_display_unit: int = 1


_BYTES_IN_GB = 1024 * 1024 * 1024


_DEFINITIONS: dict[QuotaKey, QuotaDefinition] = {
    QuotaKey.storage_gb: QuotaDefinition(
        key=QuotaKey.storage_gb,
        event_name="spaire.storage.bytes",
        aggregation="sum",
        aggregation_property="bytes_delta",
        scope="lifetime",
        storage_units_per_display_unit=_BYTES_IN_GB,
    ),
}


def get_definition(key: QuotaKey) -> QuotaDefinition:
    return _DEFINITIONS[key]


def all_quotas() -> list[QuotaDefinition]:
    return list(_DEFINITIONS.values())
