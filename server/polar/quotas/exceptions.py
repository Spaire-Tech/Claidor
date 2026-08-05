"""Errors surfaced by quota enforcement.

QuotaExceededError is raised by producers when a tier limit would be
breached. It's a 402 Payment Required — the operation cannot proceed
on the current tier but would succeed after upgrading.
"""

from polar.exceptions import PolarError

from .definitions import QuotaKey
from .service import QuotaCheckResult


_HUMAN_QUOTA_LABEL: dict[QuotaKey, tuple[str, str]] = {
    QuotaKey.video_hours_hosted: ("Video hosting", "hours"),
    QuotaKey.video_views_monthly: ("Video views (this month)", "views"),
    QuotaKey.storage_gb: ("File storage", "GB"),
}


class QuotaExceededError(PolarError):
    def __init__(self, result: QuotaCheckResult) -> None:
        label, unit = _HUMAN_QUOTA_LABEL[result.quota]
        limit = result.limit if result.limit is not None else "unlimited"
        super().__init__(
            (
                f"{label} quota exceeded. Your plan allows {limit} {unit} and "
                f"you've used {result.used}. Upgrade your Spaire plan to "
                f"raise this limit."
            ),
            402,
        )
        self.result = result
