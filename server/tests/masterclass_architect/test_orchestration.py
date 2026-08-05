from datetime import UTC, datetime, timedelta

from polar.masterclass_architect.architect_ai import AnalysisFailure
from polar.masterclass_architect.orchestration import (
    ALL_STATUSES,
    DEEP_PASS_REQUIRES,
    FAST_PASS_REQUIRES,
    REUSE_WINDOW,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_MIRROR_READY,
    STATUS_QUEUED,
    TERMINAL_STATUSES,
    can_reuse,
    map_youtube_failure,
)
from polar.masterclass_architect.youtube import YouTubeAPIError

NOW = datetime(2026, 7, 28, 12, 0, tzinfo=UTC)


class TestStatuses:
    def test_guards_are_valid_statuses(self) -> None:
        assert FAST_PASS_REQUIRES == STATUS_QUEUED
        assert DEEP_PASS_REQUIRES == STATUS_MIRROR_READY
        assert TERMINAL_STATUSES == {STATUS_COMPLETED, STATUS_FAILED}
        assert TERMINAL_STATUSES < ALL_STATUSES


class TestCanReuse:
    def test_recent_success_is_reused(self) -> None:
        for status in (STATUS_QUEUED, STATUS_MIRROR_READY, STATUS_COMPLETED):
            assert can_reuse(
                existing_status=status,
                existing_created_at=NOW - timedelta(hours=1),
                now=NOW,
            )

    def test_failed_is_always_retryable(self) -> None:
        assert not can_reuse(
            existing_status=STATUS_FAILED,
            existing_created_at=NOW - timedelta(minutes=1),
            now=NOW,
        )

    def test_aged_out_is_not_reused(self) -> None:
        assert not can_reuse(
            existing_status=STATUS_COMPLETED,
            existing_created_at=NOW - REUSE_WINDOW - timedelta(minutes=1),
            now=NOW,
        )

    def test_exactly_at_window_edge_is_reused(self) -> None:
        assert can_reuse(
            existing_status=STATUS_COMPLETED,
            existing_created_at=NOW - REUSE_WINDOW,
            now=NOW,
        )


class TestMapYouTubeFailure:
    def test_quota_exceeded(self) -> None:
        e = YouTubeAPIError(403, '{"reason": "quotaExceeded"}')
        assert map_youtube_failure(e) == AnalysisFailure.QUOTA_EXHAUSTED

    def test_rate_limit(self) -> None:
        e = YouTubeAPIError(403, '{"reason": "rateLimitExceeded"}')
        assert map_youtube_failure(e) == AnalysisFailure.QUOTA_EXHAUSTED
        assert (
            map_youtube_failure(YouTubeAPIError(429, "slow down"))
            == AnalysisFailure.QUOTA_EXHAUSTED
        )

    def test_plain_403_is_upstream_not_quota(self) -> None:
        e = YouTubeAPIError(403, '{"reason": "forbidden"}')
        assert map_youtube_failure(e) == AnalysisFailure.UPSTREAM_UNAVAILABLE

    def test_server_errors_are_upstream(self) -> None:
        for code in (500, 502, 503):
            assert (
                map_youtube_failure(YouTubeAPIError(code, "boom"))
                == AnalysisFailure.UPSTREAM_UNAVAILABLE
            )
