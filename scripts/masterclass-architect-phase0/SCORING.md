# Phase 0 scoring — how to run it and what decides Gate A

## Who scores

For each channel: the creator themself if you can get them (best), or someone
who genuinely knows the channel (watches it, could name its hits). Never the
person who ran the scripts.

## What a scorer receives

1. `data/<slug>/mirror.md` — the fast pass.
2. `blind/<slug>/set-1.md` and `set-2.md` — the two proposal sets, unlabeled.
   (One is public-data-only, one used transcripts. Do not tell the scorer
   which is which — you don't know either until `key.json` is opened at the
   end.)
3. A copy of `scorecard.csv` to fill in.

## The questions (per proposal set)

| # | Question | Scale |
|---|---|---|
| M1 | Mirror: "Did the fast pass tell you something true you'd never seen laid out?" | 1–5 |
| Q1 | "Is this YOUR masterclass, or a template with your thumbnails?" | 1 = template … 5 = unmistakably mine |
| Q2 | "Would you actually start filming the missing episodes this month?" | yes / no |
| Q3 | Receipts: spot-check 3 quotes and 2 video claims. All real and fairly used? | yes / no (note any fabrication — an automatic fail for that set) |
| Q4 | Footage map: do the 🟢have / 🟡refilm / 🔴film tags feel right? Roughly how many would you flip? | count |
| Q5 | Proposal count: did it feel padded (a weak filler proposal present) or truncated (an obvious theme missing)? | padded / right / truncated |
| Q6 | If more than one set: which set would you pick, gun to head? | set-1 / set-2 / neither |

Free-text box: "What did it get most right? Most wrong?"

## Gate A — read the results like this

Open every `key.json` only after all scorecards are in, then aggregate:

- **Is the magic real?** Median Q1 ≥ 4 AND Q2 "yes" for the majority of
  channels (on the better variant). If not met → stop; fix the recipe or the
  signals before any product code. That's the gate doing its job.
- **Do transcripts matter?** Compare variants A vs B on Q1/Q2/Q6. If A is
  within ~0.5 of B on Q1 and wins/ties most Q6 picks → transcripts are OFF
  the roadmap (delete the OAuth track). If B clearly wins → transcripts
  remain a *post-launch quality upgrade*; launch on A regardless.
- **Any fabricated receipt (Q3)** → recipe bug, fix before drawing any other
  conclusion from that round.
- **Calibration outputs** (feed Phase 1): the smallest channel that still
  scored Q1 ≥ 4 (→ the fork threshold); typical flip-count on Q4 (→ how
  loudly the wizard should invite corrections); Q5 pattern (→ tune the
  confidence gate: padded means the bar is too low, truncated too high).

## Hygiene

- Don't edit generated proposals before scoring — score what the machine made.
- Keep the recipe frozen within a scoring round; note `RECIPE_VERSION` on
  every scorecard. Change the recipe → new round, fresh scorecards.
- 10–15 channels minimum, mixed sizes (~50 to ~1,000 videos) and shapes
  (tutorial, vlog, talking-head). Include at least two channels you EXPECT
  to fail (tiny, or scattered) — the gate needs to see the floor, not just
  the highlight reel.
