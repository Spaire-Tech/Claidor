#!/usr/bin/env python3
"""Phase 0 bake-off — step 3: generate the proposals from the evidence pack.

Two variants:
  A (default): public data only — the launch-candidate recipe.
  B (--transcripts DIR): same recipe + transcript files named <videoId>.txt,
    obtained legitimately (the channel owner exports/provides them).

Usage:
    ANTHROPIC_API_KEY=... python generate_proposals.py <slug>
    ANTHROPIC_API_KEY=... python generate_proposals.py <slug> --transcripts dir/

Writes data/<slug>/proposals-{a|b}.json and a human-readable .md for scoring.
Model: claude-sonnet-5 by default; override with ARCHITECT_MODEL
(claude-opus-5 recommended for the final scored runs).
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

from prompts import RECIPE_VERSION, SYSTEM_PROMPT, TRANSCRIPTS_NOTE, USER_TEMPLATE

MAX_TRANSCRIPT_CHARS_PER_VIDEO = 24_000
MAX_TRANSCRIPT_VIDEOS = 20


def call_claude(system: str, user: str) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        sys.exit("Set ANTHROPIC_API_KEY.")
    model = os.environ.get("ARCHITECT_MODEL", "claude-sonnet-5")
    body = json.dumps(
        {
            "model": model,
            "max_tokens": 16_000,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = json.load(resp)
    return "".join(b.get("text", "") for b in data.get("content", []))


def parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        sys.exit(f"Model did not return JSON. First 300 chars:\n{text[:300]}")
    return json.loads(text[start : end + 1])


def load_transcripts(directory: str) -> str:
    chunks = []
    files = sorted(Path(directory).glob("*.txt"))[:MAX_TRANSCRIPT_VIDEOS]
    if not files:
        sys.exit(f"No .txt transcripts found in {directory}")
    for f in files:
        chunks.append(
            f"--- transcript video_id={f.stem} ---\n"
            + f.read_text()[:MAX_TRANSCRIPT_CHARS_PER_VIDEO]
        )
    return "\n".join(chunks)


def render_markdown(result: dict, variant: str, channel_title: str) -> str:
    L = [f"# Proposals ({variant.upper()}) — {channel_title}", ""]
    m = result.get("mirror", {})
    if m:
        L.append("## The mirror")
        for h in m.get("highlights", []):
            L.append(
                f"- **{h.get('title')}** — {h.get('outlier_ratio')}× baseline, "
                f"{h.get('views'):,} views, {h.get('demand_comment_count')} "
                "comments asking for more"
            )
        L += [f"\n_{m.get('pattern', '')}_", ""]
    props = result.get("proposals", [])
    if not props:
        L.append(f"**No proposal cleared the bar.** {result.get('no_proposal_reason')}")
    if result.get("flagship") and len(props) == 1:
        L.append("## ⭐ Flagship proposal")
    for i, p in enumerate(props, 1):
        L += [
            f"## {i}. {p.get('title')}",
            f"*{p.get('promise')}*",
            "",
            f"Format: {p.get('format')} — {p.get('format_reason', '')}",
            f"Confidence: **{p.get('confidence')}** — "
            f"{p.get('confidence_rationale', '')}",
            "",
            "**Receipts:**",
        ]
        for v in p.get("receipts", {}).get("videos", []):
            L.append(
                f"- [{v.get('title')}] ({v.get('outlier_ratio')}×) — "
                f"{v.get('why_it_matters')}"
            )
        for q in p.get("receipts", {}).get("quotes", []):
            L.append(f'- > "{q.get("text")}" ({q.get("likes")} likes)')
        status_icon = {"have": "🟢 have", "refilm": "🟡 refilm", "film": "🔴 film"}
        counts = {"have": 0, "refilm": 0, "film": 0}
        L.append("")
        for s in p.get("seasons", []):
            L.append(f"### {s.get('title')}")
            for ep in s.get("episodes", []):
                st = ep.get("status", "film")
                counts[st] = counts.get(st, 0) + 1
                src = (
                    f" ← {', '.join(ep.get('source_video_ids', []))}"
                    if ep.get("source_video_ids")
                    else ""
                )
                L.append(
                    f"- {status_icon.get(st, st)} **{ep.get('title')}** — "
                    f"{ep.get('description')}{src}"
                    + (
                        f" _({ep.get('status_reason')})_"
                        if ep.get("status_reason") and st != "have"
                        else ""
                    )
                )
            L.append("")
        total = sum(counts.values())
        L.append(
            f"**Footage map: {counts['have']} of {total} episodes have material, "
            f"{counts['refilm']} worth re-filming, {counts['film']} to film.**\n"
        )
    banked = result.get("banked_themes", [])
    if banked:
        L.append("## Banked for later ('your next masterclass')")
        for b in banked:
            L.append(f"- **{b.get('name')}** — {b.get('one_liner')}")
    return "\n".join(L)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    slug = sys.argv[1]
    data_dir = Path(__file__).parent / "data" / slug
    evidence_path = data_dir / "evidence.json"
    if not evidence_path.exists():
        sys.exit(f"{evidence_path} not found — run analyze.py first.")
    evidence = evidence_path.read_text()

    variant = "a"
    transcripts_note = ""
    if "--transcripts" in sys.argv:
        variant = "b"
        directory = sys.argv[sys.argv.index("--transcripts") + 1]
        transcripts_note = TRANSCRIPTS_NOTE.format(
            transcripts=load_transcripts(directory)
        )

    user = USER_TEMPLATE.format(evidence=evidence, transcripts_note=transcripts_note)
    print(
        f"Recipe {RECIPE_VERSION}, variant {variant.upper()}, "
        f"model {os.environ.get('ARCHITECT_MODEL', 'claude-sonnet-5')} — generating…"
    )
    raw = call_claude(SYSTEM_PROMPT, user)
    result = parse_json(raw)
    result["_meta"] = {"recipe": RECIPE_VERSION, "variant": variant}

    channel_title = json.loads(evidence)["channel"]["title"]
    (data_dir / f"proposals-{variant}.json").write_text(
        json.dumps(result, indent=1, ensure_ascii=False)
    )
    (data_dir / f"proposals-{variant}.md").write_text(
        render_markdown(result, variant, channel_title)
    )
    n = len(result.get("proposals", []))
    flag = " (flagship)" if result.get("flagship") else ""
    print(f"Wrote proposals-{variant}.json/.md — {n} proposal(s){flag}")


if __name__ == "__main__":
    main()
