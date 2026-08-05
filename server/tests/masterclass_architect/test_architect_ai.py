from datetime import UTC, datetime, timedelta

from polar.masterclass_architect.architect_ai import (
    MAX_PROPOSALS,
    AnalysisFailure,
    build_evidence_pack,
    build_mirror,
    channel_floor_failure,
    parse_architect_json,
    validate_and_gate,
)
from polar.masterclass_architect.signals import (
    DemandQuote,
    VideoDemand,
    VideoSignal,
    compute_outlier_ratios,
)

NOW = datetime(2026, 7, 28, tzinfo=UTC)

CHANNEL = {
    "title": "Test Golf",
    "about": "Caddie turned coach.",
    "avatar_url": "http://a/x.jpg",
    "video_count": 20,
    "subscriber_count": 82_000,
    "created_at": "2019-03-01T00:00:00Z",
}


def make_pack(outlier_quote: str = "Please make a full course on this"):
    videos = [
        VideoSignal(
            video_id=f"vid{i:03d}",
            title=f"Golf tip {i}",
            published_at=NOW - timedelta(days=60 + i * 14),
            duration_seconds=600,
            views=10_000,
            comment_count=10,
        )
        for i in range(20)
    ]
    videos[10].views = 50_000
    compute_outlier_ratios(videos, now=NOW)
    demands = {
        "vid010": VideoDemand(
            video_id="vid010",
            demand_comment_count=12,
            total_comments_sampled=100,
            quotes=[DemandQuote(text=outlier_quote, likes=91)],
        )
    }
    return build_evidence_pack(
        channel=CHANNEL,
        videos=videos,
        demands=demands,
        owner_replies=["Maybe one day!"],
        faq_answer="how do I stop three-putting",
        now=NOW,
    )


class TestChannelFloor:
    def test_below_floor(self) -> None:
        assert channel_floor_failure(5) == AnalysisFailure.CHANNEL_TOO_SMALL

    def test_at_floor(self) -> None:
        assert channel_floor_failure(12) is None


class TestEvidencePack:
    def test_pack_shape_and_ground_truth(self) -> None:
        pack = make_pack()
        assert pack.pack["channel"]["title"] == "Test Golf"
        assert pack.pack["top_outliers"][0]["video_id"] == "vid010"
        assert pack.pack["creator_faq_answer"] == "how do I stop three-putting"
        assert "vid010" in pack.known_video_ids
        assert any("full course" in q for q in pack.known_quotes)

    def test_mirror_is_pure_stats(self) -> None:
        mirror = build_mirror(make_pack())
        assert mirror["channel"]["title"] == "Test Golf"
        top = mirror["highlights"][0]
        assert top["video_id"] == "vid010"
        assert top["outlier_ratio"] >= 4.9
        assert top["demand_comment_count"] == 12
        assert top["top_quotes"][0]["likes"] == 91


class TestParsing:
    def test_plain_and_fenced_json(self) -> None:
        assert parse_architect_json('{"proposals": []}') == {"proposals": []}
        assert parse_architect_json('```json\n{"a": 1}\n```') == {"a": 1}
        assert parse_architect_json('Sure! Here it is: {"a": 1} done') == {"a": 1}

    def test_garbage_returns_none(self) -> None:
        assert parse_architect_json("no json here") is None
        assert parse_architect_json("{broken") is None
        assert parse_architect_json('["a list"]') is None


def proposal(
    *,
    title: str = "The Short Game Masterclass",
    confidence: str = "high",
    video_id: str = "vid010",
    quote: str = "Please make a full course on this",
    episodes: list | None = None,
) -> dict:
    return {
        "title": title,
        "promise": "A promise.",
        "format": "seasons",
        "confidence": confidence,
        "receipts": {
            "videos": [{"video_id": video_id, "title": "t", "outlier_ratio": 5.0}],
            "quotes": [{"text": quote, "likes": 91, "video_id": video_id}],
        },
        "seasons": [
            {
                "title": "Season 1",
                "episodes": episodes
                or [
                    {
                        "title": "Ep 1",
                        "description": "d",
                        "status": "have",
                        "source_video_ids": ["vid010"],
                    }
                ],
            }
        ],
    }


class TestValidateAndGate:
    def test_clean_result_passes(self) -> None:
        pack = make_pack()
        gated, violations = validate_and_gate(
            {"mirror_pattern": "p", "proposals": [proposal()]}, pack
        )
        assert violations == []
        assert len(gated["proposals"]) == 1
        assert gated["flagship"] is True
        assert gated["no_proposal_reason"] is None

    def test_fabricated_quote_stripped(self) -> None:
        pack = make_pack()
        gated, violations = validate_and_gate(
            {"proposals": [proposal(quote="I never said this")]}, pack
        )
        assert any("quote_fabricated" in v for v in violations)
        assert gated["proposals"][0]["receipts"]["quotes"] == []

    def test_fabricated_video_drops_proposal(self) -> None:
        pack = make_pack()
        gated, violations = validate_and_gate(
            {"proposals": [proposal(video_id="vid999")]}, pack
        )
        assert gated["proposals"] == []
        assert any("no_receipts" in v for v in violations)

    def test_low_confidence_dropped_and_cap_enforced(self) -> None:
        pack = make_pack()
        many = [proposal(title=f"P{i}") for i in range(5)]
        many.append(proposal(title="Weak", confidence="low"))
        gated, violations = validate_and_gate({"proposals": many}, pack)
        assert len(gated["proposals"]) == MAX_PROPOSALS
        assert gated["flagship"] is False
        assert any("confidence" in v for v in violations)

    def test_have_without_source_demoted_to_film(self) -> None:
        pack = make_pack()
        eps = [
            {
                "title": "Ghost episode",
                "description": "d",
                "status": "have",
                "source_video_ids": ["vid999"],  # fabricated source
            }
        ]
        gated, violations = validate_and_gate(
            {"proposals": [proposal(episodes=eps)]}, pack
        )
        ep = gated["proposals"][0]["seasons"][0]["episodes"][0]
        assert ep["status"] == "film"
        assert ep["source_video_ids"] == []
        assert any("demoted_no_source" in v for v in violations)

    def test_zero_proposals_is_honest(self) -> None:
        pack = make_pack()
        gated, _ = validate_and_gate(
            {"proposals": [], "no_proposal_reason": "signals too thin"}, pack
        )
        assert gated["proposals"] == []
        assert gated["flagship"] is False
        assert gated["no_proposal_reason"] == "signals too thin"
