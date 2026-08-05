#!/usr/bin/env python3
"""Phase 0 bake-off — one command per channel.

    YOUTUBE_API_KEY=... ANTHROPIC_API_KEY=... \\
        python run.py @handle [--faq "..."] [--transcripts DIR]

Runs: fetch → analyze → generate (variant A; plus variant B if --transcripts)
→ blind copies. Re-running skips the fetch if the snapshot already exists
(delete data/<slug>/channel.json to force a refresh).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).parent


def sh(script: str, *args: str) -> None:
    cmd = [sys.executable, str(BASE / script), *args]
    print(f"\n▶ {script} {' '.join(args)}")
    subprocess.run(cmd, check=True)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ref = sys.argv[1]
    faq = ""
    transcripts = ""
    argv = sys.argv[2:]
    if "--faq" in argv:
        faq = argv[argv.index("--faq") + 1]
    if "--transcripts" in argv:
        transcripts = argv[argv.index("--transcripts") + 1]

    # Fetch (unless a snapshot already exists for this exact ref's slug —
    # we discover the slug from the newest snapshot mentioning the ref only
    # after fetching, so probe by running fetch unless the user passed a
    # known slug that already has data).
    candidate = BASE / "data" / ref / "channel.json"
    if candidate.exists():
        slug = ref
        print(f"Using cached snapshot data/{slug}/channel.json")
    else:
        sh("fetch_channel.py", ref)
        snapshots = sorted(
            (BASE / "data").glob("*/channel.json"), key=lambda p: p.stat().st_mtime
        )
        slug = snapshots[-1].parent.name

    faq_args = ["--faq", faq] if faq else []
    sh("analyze.py", slug, *faq_args)
    sh("generate_proposals.py", slug)
    if transcripts:
        sh("generate_proposals.py", slug, "--transcripts", transcripts)
    sh("blind.py", slug)

    print(f"\nDone. Score with: data/{slug}/mirror.md + blind/{slug}/set-*.md")
    key = BASE / "blind" / slug / "key.json"
    if key.exists():
        print(f"(Variant mapping sealed in {key} — open after scoring.)")


if __name__ == "__main__":
    main()
