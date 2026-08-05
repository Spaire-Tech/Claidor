"""Masterclass Architect — orchestration decisions (pure, import-light).

The judgment calls the service and tasks layers make, factored out so they
can be unit-tested without booting the app: status transitions, the
channel-reuse window, and the mapping from raw upstream errors to the typed
AnalysisFailure taxonomy the wizard's fork consumes.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .architect_ai import AnalysisFailure
from .youtube import YouTubeAPIError

# ── Statuses ────────────────────────────────────────────────────────────────
# queued        row created, channel resolved, fast pass enqueued
# mirror_ready  fast pass done — mirror stored, deep pass enqueued
# completed     proposals stored (possibly zero — that's honest, not failed)
# failed        typed failure_reason set; the wizard lands this in the fork
STATUS_QUEUED = "queued"
STATUS_MIRROR_READY = "mirror_ready"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

ALL_STATUSES = {
    STATUS_QUEUED,
    STATUS_MIRROR_READY,
    STATUS_COMPLETED,
    STATUS_FAILED,
}
# Idempotency guards: which status each actor requires to do any work.
# A re-delivered message for a row in any other state is a silent no-op.
FAST_PASS_REQUIRES = STATUS_QUEUED
DEEP_PASS_REQUIRES = STATUS_MIRROR_READY

TERMINAL_STATUSES = {STATUS_COMPLETED, STATUS_FAILED}

# A repeat paste of the same channel by the same organization inside this
# window returns the existing analysis instead of burning YouTube quota and
# model tokens on a duplicate.
REUSE_WINDOW = timedelta(hours=24)


def can_reuse(
    *, existing_status: str, existing_created_at: datetime, now: datetime
) -> bool:
    """A prior analysis is reusable unless it failed (a failed run should be
    retryable immediately — the failure may have been quota or a blip) or it
    has aged out of the window."""
    if existing_status == STATUS_FAILED:
        return False
    return now - existing_created_at <= REUSE_WINDOW


def map_youtube_failure(error: YouTubeAPIError) -> AnalysisFailure:
    """Collapse upstream YouTube errors into the typed taxonomy.

    Quota exhaustion is its own reason so the wizard can say "ready shortly"
    instead of implying the channel was unreadable. Everything else is
    upstream unavailability — same landing (the fork), different copy.
    """
    if error.status_code == 429 or (
        error.status_code == 403
        and ("quotaExceeded" in error.detail or "rateLimitExceeded" in error.detail)
    ):
        return AnalysisFailure.QUOTA_EXHAUSTED
    return AnalysisFailure.UPSTREAM_UNAVAILABLE
