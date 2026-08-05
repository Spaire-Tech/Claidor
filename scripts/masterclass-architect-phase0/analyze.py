#!/usr/bin/env python3
"""Phase 0 bake-off — step 2: turn the raw snapshot into the evidence pack.

Fully offline (no network). Reads data/<slug>/channel.json, writes:
  data/<slug>/evidence.json — the structured pack the proposal model receives
  data/<slug>/mirror.md     — the human-readable fast pass ("the mirror"),
                              scored on its own in the bake-off

Usage:
    python analyze.py <slug> [--faq "the question people keep asking them"]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Comment phrases that signal demand for a longer / deeper / structured
# version. Deliberately broad — the LLM re-reads the actual quotes later; this
# filter only decides which comments make it into the pack.
DEMAND_PATTERNS = [
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
DEMAND_RE = re.compile("|".join(DEMAND_PATTERNS), re.IGNORECASE)

TOP_OUTLIERS = 15  # outlier videos carried into the pack, with full context
MAX_QUOTES_PER_VIDEO = 8
MAX_OWNER_REPLIES = 40


def load(slug: str) -> dict:
    path = Path(__file__).parent / "data" / slug / "channel.json"
    if not path.exists():
        sys.exit(f"{path} not found — run fetch_channel.py first.")
    return json.loads(path.read_text())


def demand_comments(thread: dict) -> list[dict]:
    hits = [c for c in thread["comments"] if DEMAND_RE.search(c["text"])]
    hits.sort(key=lambda c: c["likes"], reverse=True)
    return hits[:MAX_QUOTES_PER_VIDEO]


def build(snapshot: dict, faq_answer: str) -> tuple[dict, str]:
    ch = snapshot["channel"]
    videos = {v["id"]: v for v in snapshot["videos"]}
    threads = {t["video_id"]: t for t in snapshot["comment_threads"]}

    ranked = [v for v in snapshot["videos"] if v.get("outlier_ratio")]
    ranked.sort(key=lambda v: v["outlier_ratio"], reverse=True)

    outliers = []
    for v in ranked[:TOP_OUTLIERS]:
        thread = threads.get(v["id"], {"comments": [], "owner_replies": []})
        quotes = demand_comments(thread)
        outliers.append(
            {
                "video_id": v["id"],
                "title": v["title"],
                "views": v["views"],
                "baseline_views": v["baseline_views"],
                "outlier_ratio": v["outlier_ratio"],
                "published_at": v["published_at"],
                "age_days": v["age_days"],
                "definition": v["definition"],
                "duration_seconds": v["duration_seconds"],
                "description_excerpt": v["description"][:500],
                "demand_comment_count": sum(
                    1 for c in thread["comments"] if DEMAND_RE.search(c["text"])
                ),
                "total_comments_sampled": len(thread["comments"]),
                "demand_quotes": [
                    {"text": q["text"], "likes": q["likes"]} for q in quotes
                ],
            }
        )

    owner_replies = []
    for t in snapshot["comment_threads"]:
        owner_replies += [r["text"] for r in t["owner_replies"]]
    owner_replies = owner_replies[:MAX_OWNER_REPLIES]

    # The full catalogue, compact: every long-form title with its ratio and
    # age. This is what lets the model see subject clusters and recency.
    catalogue = [
        {
            "id": v["id"],
            "t": v["title"],
            "r": v.get("outlier_ratio"),
            "d": v["age_days"],
            "hd": v["definition"] == "hd",
        }
        for v in sorted(
            (v for v in snapshot["videos"] if not v["is_short"]),
            key=lambda v: v["published_at"],
            reverse=True,
        )
    ]

    shorts_count = sum(1 for v in snapshot["videos"] if v["is_short"])
    evidence = {
        "channel": ch,
        "counts": {
            "videos_total": len(snapshot["videos"]),
            "longform": len(catalogue),
            "shorts_excluded_from_baseline": shorts_count,
        },
        "creator_faq_answer": faq_answer or None,
        "top_outliers": outliers,
        "owner_reply_samples": owner_replies,
        "catalogue": catalogue,
    }

    # The mirror — the 20-second fast pass a creator would see, rendered for
    # human scoring. Only stats and quotes; deliberately no advice.
    top3 = outliers[:3]
    lines = [
        f"# The mirror — {ch['title']}",
        "",
        f"{ch['video_count']} videos · {ch['subscribers']:,} subscribers · "
        f"channel since {ch['created_at'][:4]}",
        "",
    ]
    for v in top3:
        lines.append(
            f"**{v['title']}** — {v['views']:,} views, "
            f"{v['outlier_ratio']}× your typical {v['baseline_views']:,} at the time. "
            f"{v['demand_comment_count']} comments asking for more."
        )
        for q in v["demand_quotes"][:2]:
            lines.append(f'> "{q["text"]}" — {q["likes"]} likes')
        lines.append("")
    mirror = "\n".join(lines)
    return evidence, mirror


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    slug = sys.argv[1]
    faq = ""
    if "--faq" in sys.argv:
        faq = sys.argv[sys.argv.index("--faq") + 1]
    snapshot = load(slug)
    evidence, mirror = build(snapshot, faq)
    out_dir = Path(__file__).parent / "data" / slug
    (out_dir / "evidence.json").write_text(
        json.dumps(evidence, indent=1, ensure_ascii=False)
    )
    (out_dir / "mirror.md").write_text(mirror)
    n_demand = sum(v["demand_comment_count"] for v in evidence["top_outliers"])
    print(
        f"Wrote evidence.json ({len(evidence['top_outliers'])} outliers, "
        f"{n_demand} demand comments) and mirror.md"
    )


if __name__ == "__main__":
    main()
