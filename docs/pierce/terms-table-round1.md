# Terms table — round 1, registered before any result was looked at

Piece 7. The shape is agreed (`terms-table-shape.md`, founder-approved
31 Aug); the build is on the session branch. This document registers
the round's criteria, bars and predictions **before the measurement
runs**, per the standing rule. Results are appended below the line
after the run, and the bars do not move afterwards.

## What is already on the record, honestly

Two things happened before this registration, and they are named
rather than laundered:

1. **The route-level planted cases were built and run without
   pre-registered criteria.** Thirty-one tests plant the three finding
   classes by construction (a disagreeing input from day one, the
   model moving, the source moving), plant the refusal cases, and hold
   the access rules; all pass, inside a tieout suite of 1,190. That is
   **engineering verification** — it pins behaviour and catches
   regressions — and it is not a measured number about real input,
   and this round does not count it as one.
2. **The golden-master gate is running as this is written** (sweep
   started before this file; its diff has not been looked at).
   Registered prediction: **the diff is empty** — this piece adds
   tables and routes and touches no audit path, so any moved finding
   is a defect in the piece, whatever it looks like.

## The round's question

`swens.md` § 3d promises the model's inputs tested against the
documents' terms **at scale**. The unproven half of the agreed shape
is the document side: can a person actually get a real document's
terms *into* the table — picked from extraction's candidates where the
page carries labels, typed where it does not? The shape document
prices the typed route by exactly this count, so the count is what
this round measures, on the corpus that defeated the per-cell matcher.

## Corpus and truth — reused, not invented

- **Document:** the RMU FERC Form 1 (2015), fetched by the committed
  `scripts/corpus_ferc_fetch.py`, sha-verified.
- **Truth:** D3 round 8's registered sample
  (`scribe-d3-round8-sample.json`), the same 15 scorable rows, each a
  model input citing a Form 1 page, line and column.
- **Judge:** the oracle's own truth-location rule
  (`scripts/corpus_d3_oracle.py`): the printed page found by the
  footer mark (unique across all pages of this filing), the cited line
  number as a left- or right-edge anchor on the printed line. Values
  validate a located truth; they locate nothing.

## Criteria (registered now)

For each of the 15 truth rows, locate its truth facts with the
judge's rule, then classify the row — every row must land in exactly
one class:

- **PICKABLE** — at least one truth fact's printed line carries label
  words (`signals_for(...).labelled`). A person scanning the cited
  page in the candidates list finds a named row to pick.
- **NEEDS TYPING** — truth facts exist and every one is label-less:
  the continuation-page case, where the row's name sits on the facing
  page. The typed route exists for exactly these, and this count is
  its honest price.
- **INVISIBLE** — no truth fact at all: an extraction gap the table
  cannot route around.

Also recorded, no bar attached: of the PICKABLE rows' labelled truth
facts, how many carry a column anchor (`tabular`), and each row's
class listed row by row so the verdicts are checkable by hand.

## Bars and predictions (registered now)

- **Bar 1 — the table carries the corpus that beat the matcher:**
  PICKABLE + NEEDS TYPING ≥ 14 of 15 (INVISIBLE ≤ 1). If the table
  cannot even hold the terms, testing at scale is an empty promise
  and the piece goes back to the founder as a failure.
- **Bar 2 — classification is total:** 15 of 15 rows classified,
  none unclassifiable. A judge that cannot place a row voids the row
  and the round says so.
- **Prediction (stated so it can be wrong):** PICKABLE 11, NEEDS
  TYPING 4, INVISIBLE 0 — round 8's diagnosis found exactly 4 rows
  citing a continuation page that carries no labels, and this
  predicts those same 4 are the typed route's whole price here.

## What this round is deliberately not

Not a measurement of the check's verdicts on the real pair — that
needs the formula-rate model ingested and each term bound by hand,
and it is **round 2**, to be registered separately before it runs.
Round 2's order is set by the founder (31 Aug): **finding class 1 —
a model input disagreeing with a confirmed term — is measured alone
first**; the other classes are worth less if that one cries wolf.
Nothing in this round exercises a matcher, because the piece contains
none.

---

# Results (run after the registration commit; the bars did not move)

Run: `uv run python -m scripts.terms_table_round1 <corpus-dir>` on the
sha-verified RMU pair, 31 Aug 2026.

| row | cited | truth facts | class |
| --- | --- | --- | --- |
| 10 | p354.21.b | 3 | PICKABLE |
| 12 | p354.28.b | 3 | PICKABLE |
| 13 | p354.27.b | 3 | PICKABLE |
| 19 | p207.104.g | 3 | **NEEDS TYPING** |
| 21 | p219.29.c | 4 | PICKABLE |
| 36 | p207.58.g | 2 | **NEEDS TYPING** |
| 41 | p207.99.g | 2 | **NEEDS TYPING** |
| 44 | p207.94.g | 2 | **NEEDS TYPING** |
| 57 | p219.25.c | 3 | PICKABLE |
| 59 | p219.28.c | 3 | PICKABLE |
| 88 | p227.8.c | 2 | PICKABLE |
| 119 | p323.185.b | 2 | PICKABLE |
| 121 | p323.191.b | 2 | PICKABLE |
| 179 | p112.16.c | 4 | PICKABLE |
| 187 | p111.81.c | 4 | PICKABLE |

**PICKABLE 11 · NEEDS TYPING 4 · INVISIBLE 0.**

- **Bar 1 — carried ≥ 14 of 15: PASS at 15 of 15.** Every row the
  matcher could not link is holdable by the table — 11 picked, 4
  typed. The typed route's price on this corpus is exactly 4 rows.
- **Bar 2 — all classified: PASS, 15 of 15.**
- **The registered prediction held exactly** (11 / 4 / 0). It was
  derived from round 8's continuation-page diagnosis, and the same
  judge family locates the truth here, so the agreement partly
  restates that diagnosis — what is new is that all 15 rows are
  extraction-visible (INVISIBLE 0) and that the four typed rows are
  confirmed label-less at the fact level, not just at the match level.
- **Hand-read before recording**, three rows at the lines: row 19's
  truth line is « $ (7,741) $ 73,315,883 104 » — figures and a line
  number, the name on the facing page, correctly NEEDS TYPING; rows
  10 and 57 print their names in the line (« 21Transmission (Enter
  Total of lines 4 and 14)… », « 25 Transmission… »), correctly
  PICKABLE.
- Informative, no bar: of the 33 labelled truth facts, 16 carry a
  column anchor.

**Golden-master gate:** prediction registered above is an empty diff.
Result: **PASS — « gate clean: every file reports identically,
finding for finding »**, full 27-file corpus rebuilt from the
manifest and swept on this container, diffed against the committed
baseline. The prediction held. `dev/verify` on the finished state:
lint, format and types clean, **1,193 passed, 11 skipped** across
the tieout suite.

## The round's honest summary

Built to the founder-approved shape and the three answered
decisions; all bars passed with the bars unmoved; the one prediction
registered was exactly right, which is worth stating plainly because
the last several rounds in this repository were not. What is
**measured**: the table can carry all 15 of the corpus rows that
defeated the per-cell matcher (11 picked, 4 typed — the typed
route's whole price here is the facing-page spread), extraction sees
every one, and the engine's reports did not move. What is **not yet
measured** and is not claimed: the check's verdicts on a real
document-model pair — round 2, disagreeing-input class first, to be
registered before it runs.
