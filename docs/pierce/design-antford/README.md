# The Antford workspace design — source of truth

Uploaded by the founder 14 August 2026 (`Antford_Workspace_1.html`,
a dc-runtime bundle; unpacked here) and revised by the founder
15 August 2026 (`Antford_Workspace_2.html`, same unpack): the failing
checks split into « How the model is built » and « Whether the
accounts add up », figure-led cards with mono cell references, the
values-only banner, statement-check pass tallies and abstention rows,
the « Statement checks » settings switch, and flat hairline-ring card
shadows. Canvas 1440×900. This replaces `docs/pierce/design/` as the
workspace's source of truth.

- `workspace.html` — the template (x-dc, sc-if/sc-for view logic)
- `component.js` — the design's own state + demo data
- `props.json` — preview/editor props
- `assets/` — fonts (Instrument Sans, Bodoni Moda, IBM Plex Mono,
  Aptos Narrow subsets), images, manifest.json

Brand: **Antford** — Bodoni Moda wordmark; Instrument Sans UI; IBM
Plex Mono figures. Vocabulary: Models (not deals), checks that
pass/fail/did-not-run, evidence locker, verdicts. The build rule is
unchanged: the design is followed to the pixel, gaps are composed
from its nearest pattern and named, departures are flagged.
