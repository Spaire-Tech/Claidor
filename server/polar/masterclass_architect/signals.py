"""Masterclass Architect — the signal math (pure, import-light).

The fast pass: growth-adjusted outlier detection and comment-demand mining
over a channel's public catalogue. No network, no database, no AI — plain
functions over plain data, unit-testable without booting the app. The design
and constants were validated by the Phase 0 kit
(scripts/masterclass-architect-phase0/) and must stay in sync with
docs/plans/masterclass-architect-plan.md.

Method notes:
* A video is scored against the MEDIAN views of its ~10 nearest-in-time
  long-form uploads — a 2019 video is judged by 2019's baseline, so channel
  growth can't crown recent videos or bury old ones.
* Shorts (≤62s) live in a different attention economy and are excluded from
  baseline math entirely; videos younger than 45 days haven't matured and
  are excluded too.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field
from datetime import UTC, datetime

# Under ~62s duration ≈ a Short.
SHORT_MAX_SECONDS = 62
# Younger than this and the view count hasn't matured.
MIN_AGE_DAYS = 45
# Neighbors on each side used for the rolling baseline.
BASELINE_WINDOW = 5

# Comment phrases signalling demand for a longer / deeper / structured
# version. Deliberately broad — the proposal model re-reads the actual quotes;
# this filter only decides which comments count as demand signal.
_DEMAND_PATTERNS = [
    r"\bfull (course|video|version|tutorial|series|guide)\b",
    r"\blonger\b",
    r"\bin[- ]depth\b",
    r"\bdeep(er)? dive\b",
    r"\bpart (2|two|3|three)\b",
    r"\bseries\b",
    r"\bmasterclass\b",
    r"\bcourse\b",
    r"\bstep[- ]by[- ]step\b",
    r"\bmore (videos?|content|detail)\b",
    r"\bbreak ?down\b",
    r"\bexplain (more|this)\b",
    r"\btutorial\b",
    r"\bteach (us|me)\b",
    r"\bhour[- ]?long\b",
    r"\bwould pay\b",
    r"\btake my money\b",
    r"\bplease make\b",
]
DEMAND_RE = re.compile("|".join(_DEMAND_PATTERNS), re.IGNORECASE)


@dataclass
class VideoSignal:
    """One video's public stats, plus the computed outlier fields."""

    video_id: str
    title: str
    published_at: datetime
    duration_seconds: int
    views: int
    comment_count: int
    description: str = ""
    definition: str = ""  # "hd" | "sd" per the API
    thumbnail_url: str = ""
    # Computed by compute_outlier_ratios:
    baseline_views: int | None = None
    outlier_ratio: float | None = None

    @property
    def is_short(self) -> bool:
        return self.duration_seconds <= SHORT_MAX_SECONDS

    def age_days(self, now: datetime) -> int:
        return (now - self.published_at).days


@dataclass
class DemandQuote:
    text: str
    likes: int


@dataclass
class VideoDemand:
    """Demand mined from one video's comment threads."""

    video_id: str
    demand_comment_count: int = 0
    total_comments_sampled: int = 0
    quotes: list[DemandQuote] = field(default_factory=list)


def compute_outlier_ratios(
    videos: list[VideoSignal], *, now: datetime | None = None
) -> list[VideoSignal]:
    """Fill baseline_views / outlier_ratio on eligible videos, in place.

    Returns the eligible videos sorted by ratio, best first. Ineligible
    videos (shorts, too recent, no baseline) keep ratio None.
    """
    now = now or datetime.now(UTC)
    eligible = [v for v in videos if not v.is_short and v.age_days(now) >= MIN_AGE_DAYS]
    eligible.sort(key=lambda v: v.published_at)
    for idx, v in enumerate(eligible):
        lo = max(0, idx - BASELINE_WINDOW)
        neighbors = [
            n.views
            for n in eligible[lo : idx + BASELINE_WINDOW + 1]
            if n.video_id != v.video_id
        ]
        if not neighbors:
            continue
        baseline = statistics.median(neighbors)
        if baseline <= 0:
            continue
        v.baseline_views = int(baseline)
        v.outlier_ratio = round(v.views / baseline, 2)
    ranked = [v for v in eligible if v.outlier_ratio is not None]
    ranked.sort(key=lambda v: v.outlier_ratio or 0, reverse=True)
    return ranked


def is_demand_comment(text: str) -> bool:
    return bool(DEMAND_RE.search(text))


def mine_demand(
    video_id: str,
    comments: list[tuple[str, int]],
    *,
    max_quotes: int = 8,
) -> VideoDemand:
    """Filter a video's (text, likes) comments down to the demand signal."""
    hits = [(text, likes) for text, likes in comments if is_demand_comment(text)]
    hits.sort(key=lambda c: c[1], reverse=True)
    return VideoDemand(
        video_id=video_id,
        demand_comment_count=len(hits),
        total_comments_sampled=len(comments),
        quotes=[
            DemandQuote(text=text, likes=likes) for text, likes in hits[:max_quotes]
        ],
    )


def pick_comment_candidates(
    videos: list[VideoSignal],
    *,
    by_ratio: int = 25,
    by_comments: int = 5,
) -> list[VideoSignal]:
    """Which videos deserve a comment pull: the top outliers plus the most
    commented long-form videos (a video can be discussion-heavy without being
    a view outlier — that's still demand surface)."""
    ranked = [v for v in videos if v.outlier_ratio is not None]
    ranked.sort(key=lambda v: v.outlier_ratio or 0, reverse=True)
    most_commented = sorted(
        (v for v in videos if not v.is_short),
        key=lambda v: v.comment_count,
        reverse=True,
    )
    seen: set[str] = set()
    out: list[VideoSignal] = []
    for v in ranked[:by_ratio] + most_commented[:by_comments]:
        if v.video_id not in seen:
            seen.add(v.video_id)
            out.append(v)
    return out[: by_ratio + by_comments]
