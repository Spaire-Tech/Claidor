from datetime import UTC, datetime, timedelta

from polar.masterclass_architect.signals import (
    VideoSignal,
    compute_outlier_ratios,
    is_demand_comment,
    mine_demand,
    pick_comment_candidates,
)

NOW = datetime(2026, 7, 28, tzinfo=UTC)


def make_video(
    i: int,
    *,
    views: int,
    days_ago: int,
    duration: int = 600,
    comment_count: int = 10,
) -> VideoSignal:
    return VideoSignal(
        video_id=f"vid{i:03d}",
        title=f"Video {i}",
        published_at=NOW - timedelta(days=days_ago),
        duration_seconds=duration,
        views=views,
        comment_count=comment_count,
    )


class TestOutlierRatios:
    def test_planted_outlier_found_and_growth_adjusted(self) -> None:
        # Steady 10k-view channel with one 50k spike in the middle.
        videos = [make_video(i, views=10_000, days_ago=60 + i * 14) for i in range(20)]
        videos[10].views = 50_000
        ranked = compute_outlier_ratios(videos, now=NOW)
        assert ranked[0].video_id == "vid010"
        assert ranked[0].outlier_ratio is not None
        assert ranked[0].outlier_ratio >= 4.9
        assert ranked[0].baseline_views == 10_000

    def test_old_video_judged_by_its_own_era(self) -> None:
        # Channel grew 10x: old era ~1k views, new era ~10k. An old 3k video
        # is a 3x outlier for ITS time even though it's below today's normal.
        old = [make_video(i, views=1_000, days_ago=2000 - i * 14) for i in range(10)]
        new = [
            make_video(100 + i, views=10_000, days_ago=300 - i * 14) for i in range(10)
        ]
        old[5].views = 3_000
        ranked = compute_outlier_ratios(old + new, now=NOW)
        spike = next(v for v in ranked if v.video_id == "vid005")
        assert spike.outlier_ratio is not None
        assert spike.outlier_ratio >= 2.9

    def test_shorts_and_fresh_videos_excluded(self) -> None:
        videos = [make_video(i, views=10_000, days_ago=100 + i * 10) for i in range(10)]
        short = make_video(90, views=900_000, days_ago=200, duration=45)
        fresh = make_video(91, views=500_000, days_ago=5)
        ranked = compute_outlier_ratios(videos + [short, fresh], now=NOW)
        ranked_ids = {v.video_id for v in ranked}
        assert "vid090" not in ranked_ids
        assert "vid091" not in ranked_ids
        assert short.outlier_ratio is None
        assert fresh.outlier_ratio is None

    def test_empty_and_single_video(self) -> None:
        assert compute_outlier_ratios([], now=NOW) == []
        lone = [make_video(0, views=1000, days_ago=100)]
        assert compute_outlier_ratios(lone, now=NOW) == []


class TestDemandMining:
    def test_demand_phrases_hit(self) -> None:
        for text in [
            "Please make a full course on this, I would pay",
            "we NEED a deep dive series",
            "part 2 please!",
            "can you do a step-by-step tutorial",
        ]:
            assert is_demand_comment(text)

    def test_ordinary_praise_misses(self) -> None:
        for text in ["nice video", "love this", "first!", "great editing man"]:
            assert not is_demand_comment(text)

    def test_mine_demand_sorts_by_likes_and_caps_quotes(self) -> None:
        comments = [(f"full course please #{i}", i) for i in range(20)]
        comments.append(("nice video", 999))
        demand = mine_demand("vid001", comments, max_quotes=3)
        assert demand.demand_comment_count == 20
        assert demand.total_comments_sampled == 21
        assert [q.likes for q in demand.quotes] == [19, 18, 17]


class TestCommentCandidates:
    def test_outliers_plus_most_commented_deduped(self) -> None:
        videos = [
            make_video(i, views=10_000, days_ago=100 + i * 10, comment_count=i)
            for i in range(30)
        ]
        videos[3].views = 60_000  # outlier AND (low) comment count
        compute_outlier_ratios(videos, now=NOW)
        candidates = pick_comment_candidates(videos, by_ratio=5, by_comments=3)
        ids = [v.video_id for v in candidates]
        assert ids[0] == "vid003"  # top outlier first
        assert "vid029" in ids  # most-commented included
        assert len(ids) == len(set(ids))  # deduped
        assert len(ids) <= 8
