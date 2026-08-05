# Masterclass Architect — Phase 0 bake-off kit

Answers the two questions that gate the whole project
(see `docs/plans/masterclass-architect-plan.md`, Gate A):

1. **Is the magic real?** Do proposals generated from a creator's existing
   channel feel like *their* masterclass, not a template?
2. **Do transcripts matter?** Is public data alone (no OAuth, no permissions,
   works on anyone) good enough — or do transcripts add enough to justify the
   consent flow, Google verification, and caption rationing?

No product code. Plain Python 3.11+, standard library only. Two keys:

- `YOUTUBE_API_KEY` — a YouTube Data API v3 key (public reads only; a fresh
  Google Cloud project's default 10,000 units/day is plenty — a 300-video
  channel costs well under 100 units).
- `ANTHROPIC_API_KEY` — proposals default to `claude-sonnet-5`; set
  `ARCHITECT_MODEL=claude-opus-5` for the final scored runs.

## One channel, one command

```bash
cd scripts/masterclass-architect-phase0
YOUTUBE_API_KEY=... ANTHROPIC_API_KEY=... python run.py @thechannel \
    --faq "optional: the question people keep asking them"
```

This fetches the public snapshot, builds the evidence pack, renders the
fast-pass **mirror**, generates **variant A** proposals (public data only),
and drops blind copies in `blind/<slug>/`.

To also run **variant B** (with transcripts), put owner-provided transcript
files in a folder as `<videoId>.txt` and add `--transcripts thatfolder/`.
Get them legitimately: the creator exports their own captions from YouTube
Studio (Subtitles → download), or you transcribe files the creator hands you.
**No scraping tools** — this company handles payments; we don't play loose
with YouTube's terms even in a throwaway experiment.

## The pipeline, step by step (each script also runs standalone)

| Step | Script | Reads → writes |
|---|---|---|
| 1 | `fetch_channel.py @handle` | YouTube → `data/<slug>/channel.json` |
| 2 | `analyze.py <slug>` | snapshot → `evidence.json` + `mirror.md` |
| 3 | `generate_proposals.py <slug> [--transcripts d/]` | evidence → `proposals-a/b.{json,md}` |
| 4 | `blind.py <slug>` | proposals → `blind/<slug>/set-*.md` + sealed `key.json` |
| 5 | humans | `SCORING.md` + `scorecard.csv` |

Method notes baked in:

- **Outliers are growth-adjusted**: each video is scored against the median
  of its ~10 nearest-in-time uploads, so a 2019 hit is judged by 2019's
  baseline. Shorts (≤62s) and videos younger than 45 days are excluded from
  baseline math.
- **Comment demand** is pre-filtered by phrases ("full course", "deep dive",
  "part 2", "would pay"…) and passed to the model as verbatim quotes with
  like-counts — the receipts.
- **The recipe is versioned** (`prompts.py: RECIPE_VERSION`). Freeze it
  within a scoring round; any change starts a new round.
- **The A/B is honest**: both variants share the identical prompt; the only
  difference is whether transcripts are present in the input.

## Scoring and the gate

Everything about who scores, the questions, and how to read the results —
including the exact Gate A pass/fail criteria and what gets calibrated for
Phase 1 (fork threshold, confidence bar, refilm-flag trust) — is in
`SCORING.md`. Blank scorecard: `scorecard.csv`.

Run 10–15 channels, mixed sizes (~50 → ~1,000 videos) and shapes, including
at least two you expect to fail. `data/` and `blind/` are git-ignored —
they contain other people's channel data and belong on your machine, not in
the repo (YouTube's terms also want stored API data refreshed/discarded
within ~30 days; a throwaway local folder satisfies that by design).
