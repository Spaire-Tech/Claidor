"""Masterclass Architect — the proposal brain (import-light).

Turns the fast-pass signals into the deep-pass output: up to three
signal-gated masterclass proposals with receipts, the three-status footage
map, and banked themes. Design contract lives in
docs/plans/masterclass-architect-plan.md; the prompt recipe was developed in
scripts/masterclass-architect-phase0/ and is versioned here.

Import-light on purpose (same precedent as course_assistant/ai.py): pure
builders, parsers, and the anti-fabrication validator are all exercisable
without booting the app or importing the Anthropic SDK — the client and
settings are imported lazily inside the functions that actually call out.

The validator is the honesty layer: every quote and video a proposal cites
must exist in the evidence pack it was generated from. Fabricated receipts
are stripped; a proposal that loses all its video receipts is dropped. A
wrong proposal with visible reasoning costs little; an invented one costs
everything.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from .signals import VideoDemand, VideoSignal

log = logging.getLogger(__name__)

RECIPE_VERSION = "launch-v1"

MAX_PROPOSALS = 3
TOP_OUTLIERS_IN_PACK = 15
MAX_QUOTES_PER_VIDEO = 8
MAX_OWNER_REPLIES = 40
MAX_OUTPUT_TOKENS = 16_000

# Below this many rated long-form videos the outlier math is noise and the
# creator belongs in the fork, warmly. Conservative default; tuned from the
# hand-read early cohort (plan: Phase 3).
MIN_RATED_LONGFORM = 12


class AnalysisFailure(StrEnum):
    """Every way a pasted link can disappoint, typed so the wizard can land
    each one gracefully in the fork instead of showing an error."""

    NOT_YOUTUBE = "not_youtube"
    CHANNEL_NOT_FOUND = "channel_not_found"
    CHANNEL_TOO_SMALL = "channel_too_small"
    QUOTA_EXHAUSTED = "quota_exhausted"
    UPSTREAM_UNAVAILABLE = "upstream_unavailable"
    AI_UNAVAILABLE = "ai_unavailable"
    AI_OUTPUT_INVALID = "ai_output_invalid"


def channel_floor_failure(
    rated_longform_count: int,
) -> AnalysisFailure | None:
    if rated_longform_count < MIN_RATED_LONGFORM:
        return AnalysisFailure.CHANNEL_TOO_SMALL
    return None


# --------------------------------------------------------------------------- #
# Evidence pack + mirror (pure)
# --------------------------------------------------------------------------- #


@dataclass
class EvidencePack:
    """Everything the proposal model is allowed to know. Also the ground
    truth the validator checks receipts against."""

    pack: dict[str, Any]
    known_video_ids: set[str] = field(default_factory=set)
    known_quotes: list[str] = field(default_factory=list)


def _normalize_quote(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def build_evidence_pack(
    *,
    channel: dict[str, Any],
    videos: list[VideoSignal],
    demands: dict[str, VideoDemand],
    owner_replies: list[str],
    faq_answer: str | None = None,
    now: datetime | None = None,
) -> EvidencePack:
    """Assemble the model input from the fast-pass results.

    `channel` is a plain dict (title/about/subscriber_count/…) so this stays
    decoupled from the youtube client's dataclass.
    """
    now = now or datetime.now(UTC)
    ranked = [v for v in videos if v.outlier_ratio is not None]
    ranked.sort(key=lambda v: v.outlier_ratio or 0, reverse=True)

    outliers = []
    for v in ranked[:TOP_OUTLIERS_IN_PACK]:
        demand = demands.get(v.video_id)
        outliers.append(
            {
                "video_id": v.video_id,
                "title": v.title,
                "views": v.views,
                "baseline_views": v.baseline_views,
                "outlier_ratio": v.outlier_ratio,
                "published_at": v.published_at.isoformat(),
                "age_days": v.age_days(now),
                "definition": v.definition,
                "duration_seconds": v.duration_seconds,
                "description_excerpt": v.description[:500],
                "demand_comment_count": (demand.demand_comment_count if demand else 0),
                "demand_quotes": [
                    {"text": q.text, "likes": q.likes}
                    for q in (demand.quotes[:MAX_QUOTES_PER_VIDEO] if demand else [])
                ],
            }
        )

    catalogue = [
        {
            "id": v.video_id,
            "t": v.title,
            "r": v.outlier_ratio,
            "d": v.age_days(now),
            "hd": v.definition == "hd",
        }
        for v in sorted(
            (v for v in videos if not v.is_short),
            key=lambda v: v.published_at,
            reverse=True,
        )
    ]

    pack = {
        "channel": channel,
        "counts": {
            "videos_total": len(videos),
            "longform": len(catalogue),
            "rated_longform": len(ranked),
        },
        "creator_faq_answer": faq_answer or None,
        "top_outliers": outliers,
        "owner_reply_samples": owner_replies[:MAX_OWNER_REPLIES],
        "catalogue": catalogue,
    }
    known_quotes = [
        _normalize_quote(q["text"]) for o in outliers for q in o["demand_quotes"]
    ]
    return EvidencePack(
        pack=pack,
        known_video_ids={v.video_id for v in videos},
        known_quotes=known_quotes,
    )


def build_mirror(pack: EvidencePack) -> dict[str, Any]:
    """The fast pass a creator sees within ~20s: evidence only, no advice.
    Built from stats alone — no model call, nothing to hallucinate."""
    highlights = []
    for o in pack.pack["top_outliers"][:3]:
        highlights.append(
            {
                "video_id": o["video_id"],
                "title": o["title"],
                "views": o["views"],
                "baseline_views": o["baseline_views"],
                "outlier_ratio": o["outlier_ratio"],
                "demand_comment_count": o["demand_comment_count"],
                "top_quotes": o["demand_quotes"][:2],
            }
        )
    return {
        "channel": {
            "title": pack.pack["channel"].get("title"),
            "avatar_url": pack.pack["channel"].get("avatar_url"),
            "video_count": pack.pack["channel"].get("video_count"),
            "created_at": pack.pack["channel"].get("created_at"),
        },
        "highlights": highlights,
    }


# --------------------------------------------------------------------------- #
# Prompt recipe (versioned — bump RECIPE_VERSION on any change)
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """\
You are the Masterclass Architect: the A&R person for creators. You read the
public record of a creator's existing body of work and find the masterclass
hiding in it. You never invent a creator that isn't in the evidence.

You receive an EVIDENCE PACK: channel info, the full long-form catalogue with
per-video outlier ratios (views vs. the median of that video's ~10
nearest-in-time uploads — already growth-adjusted), the top outlier videos
with real audience comments asking for more, samples of the creator's own
replies (their voice), and possibly the creator's answer to "what do people
keep asking you about?".

THE THREE SIGNALS — a masterclass lives where they overlap:
1. Overperformance: videos that beat the creator's own baseline (ratio >= ~2).
2. Audience demand: comments asking for a longer / deeper / structured
   version. Quote them verbatim; never paraphrase a quote.
3. Subject ownership: topics that belong to this creator because they come
   from lived experience — visible in how they title, describe, and reply.
   Weight RECENT videos more: read the creator as who they are now, not who
   they were five years ago.

PROPOSAL COUNT IS SIGNAL-GATED — never pad:
- Score each candidate theme's confidence: "high" = all three signals
  clearly present; "medium" = two strong signals; anything less is "low".
- Output only high/medium proposals, at most 3, distinct in angle (never
  three flavors of one idea). One strong proposal alone is FLAGSHIP mode —
  that is a good outcome, not a failure. Zero is also honest: say so.
- Themes that are real but ranked 4th+ go in "banked_themes" (name + one
  sentence + key video ids), not in proposals.

EACH PROPOSAL:
- title: the masterclass name a creator would proudly sell.
- promise: one sentence, the transformation for the buyer. No hype words.
- format: "seasons" (episodic arc) or "chapters" (skill-building) — choose
  from the shape of the material, and say why in format_reason.
- confidence: "high" | "medium", with confidence_rationale citing the
  numbers (ratios, demand counts).
- receipts: {"videos": [{"video_id", "title", "outlier_ratio",
  "why_it_matters"}], "quotes": [{"text" (verbatim), "likes", "video_id"}]}
  — every receipt must exist in the evidence pack. Never fabricate a quote,
  ratio, or video.
- seasons: 1-3 groups, each with "title" and 3-6 episodes. Episode:
  {"title", "description" (1-2 sentences, specific, instructional register),
   "status", "source_video_ids", "status_reason"}.

THE FOOTAGE MAP — three statuses, honestly assigned:
- "have": a reasonably recent video covers this episode's ground
  (source_video_ids required).
- "refilm": the TOPIC is proven by an older/weaker asset (old, or SD, or
  clearly pre-dating the channel's current era) but deserves a fresh take.
  status_reason must say what the flag is based on (age, definition). You
  cannot hear audio quality — present refilm as a suggestion, not a verdict.
- "film": a true gap; nothing in the catalogue covers it. Keep the total
  "film" count honest — the pitch is "a short list left to shoot", but never
  force material into "have" to flatter the count.

Also produce "mirror_pattern": ONE sentence naming the pattern in the top
outliers — evidence-flavored, no advice.

OUTPUT: a single JSON object, no markdown fences, no commentary:
{"mirror_pattern": "...",
 "proposals": [ ... as specified ... ],
 "banked_themes": [{"name","one_liner","video_ids"}],
 "no_proposal_reason": null | "..." }
"""

USER_TEMPLATE = """\
EVIDENCE PACK:
{evidence}

Produce the JSON now."""


def build_user_prompt(pack: EvidencePack) -> str:
    return USER_TEMPLATE.format(evidence=json.dumps(pack.pack, ensure_ascii=False))


# --------------------------------------------------------------------------- #
# Parsing + the anti-fabrication gate (pure)
# --------------------------------------------------------------------------- #

VALID_STATUSES = {"have", "refilm", "film"}
VALID_CONFIDENCE = {"high", "medium"}


def parse_architect_json(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def validate_and_gate(
    result: dict[str, Any], pack: EvidencePack
) -> tuple[dict[str, Any], list[str]]:
    """Enforce the honesty rules on the model output.

    Returns (gated_result, violations). Violations are logged upstream —
    they are recipe bugs to fix, and their rate is a launch health metric.
    """
    violations: list[str] = []
    proposals: list[dict[str, Any]] = []

    for p in result.get("proposals", [])[: MAX_PROPOSALS * 2]:
        if p.get("confidence") not in VALID_CONFIDENCE:
            violations.append(f"proposal_dropped:confidence:{p.get('title')}")
            continue

        receipts = p.get("receipts") or {}
        valid_videos = []
        for rv in receipts.get("videos", []):
            if rv.get("video_id") in pack.known_video_ids:
                valid_videos.append(rv)
            else:
                violations.append(f"receipt_video_fabricated:{rv.get('video_id')}")
        valid_quotes = []
        for q in receipts.get("quotes", []):
            normalized = _normalize_quote(str(q.get("text", "")))
            if normalized and any(
                normalized in known or known in normalized
                for known in pack.known_quotes
            ):
                valid_quotes.append(q)
            else:
                violations.append(f"receipt_quote_fabricated:{q.get('text')!r}")
        if not valid_videos:
            violations.append(f"proposal_dropped:no_receipts:{p.get('title')}")
            continue
        p["receipts"] = {"videos": valid_videos, "quotes": valid_quotes}

        for season in p.get("seasons", []):
            for ep in season.get("episodes", []):
                status = ep.get("status")
                sources = [
                    s
                    for s in ep.get("source_video_ids", [])
                    if s in pack.known_video_ids
                ]
                ep["source_video_ids"] = sources
                if status not in VALID_STATUSES:
                    ep["status"] = "film"
                    violations.append(f"episode_status_invalid:{ep.get('title')}")
                elif status in ("have", "refilm") and not sources:
                    # Claiming material without a real source is the exact
                    # overpromise the product must never make.
                    ep["status"] = "film"
                    ep["status_reason"] = ""
                    violations.append(f"episode_demoted_no_source:{ep.get('title')}")
        proposals.append(p)

    proposals = proposals[:MAX_PROPOSALS]
    banked = [
        b
        for b in result.get("banked_themes", [])
        if isinstance(b, dict) and b.get("name")
    ]
    gated = {
        "recipe_version": RECIPE_VERSION,
        "mirror_pattern": str(result.get("mirror_pattern") or ""),
        "proposals": proposals,
        "banked_themes": banked,
        "flagship": len(proposals) == 1,
        "no_proposal_reason": (
            result.get("no_proposal_reason") if not proposals else None
        ),
    }
    return gated, violations


# --------------------------------------------------------------------------- #
# The model call (lazy imports — the only network code in this module)
# --------------------------------------------------------------------------- #


def _client(api_key: str) -> Any:
    from anthropic import AsyncAnthropic

    return AsyncAnthropic(api_key=api_key)


async def generate_proposals(
    pack: EvidencePack,
    *,
    api_key: str | None = None,
    model: str | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Run the deep pass. Returns (gated_result, violations).

    Raises AnalysisFailure-mapped exceptions upstream: the service layer
    translates SDK errors into AnalysisFailure.AI_UNAVAILABLE and a None
    parse into AnalysisFailure.AI_OUTPUT_INVALID.
    """
    if api_key is None or model is None:
        from polar.config import settings

        api_key = api_key or settings.ANTHROPIC_API_KEY
        model = model or settings.MASTERCLASS_ARCHITECT_MODEL
    client = _client(api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_prompt(pack)}],
    )
    raw = "".join(block.text for block in response.content if hasattr(block, "text"))
    result = parse_architect_json(raw)
    if result is None:
        log.warning(
            "masterclass_architect.ai_output_invalid",
            extra={"recipe_version": RECIPE_VERSION},
        )
        raise ValueError(AnalysisFailure.AI_OUTPUT_INVALID)
    gated, violations = validate_and_gate(result, pack)
    if violations:
        log.warning(
            "masterclass_architect.receipt_violations",
            extra={
                "recipe_version": RECIPE_VERSION,
                "violations": violations[:20],
            },
        )
    return gated, violations
