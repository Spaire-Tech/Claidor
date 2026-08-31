# Terms table — round 2, registered before the harness runs

Piece 7, second round. Round 1 (`terms-table-round1.md`) measured
that the table can *hold* the corpus that beat the matcher. This
round measures what the founder ordered measured first and alone:
**finding class 1 — a model input that disagrees with a confirmed
term** — because the other classes are worth less if this one cries
wolf. Classes 2 and 3 (a side moving after confirmation) are not
measured here and nothing below claims them.

Results are appended below the line after one run; the bars do not
move afterwards.

## Corpus and truth — reused, not invented

The RMU pair (`corpus-ferc-formula-rate.md`), sha-verified on this
container. Truth rows: D3 round 8's registered 15 scorable rows
(`scribe-d3-round8-sample.json`), each carrying the model's own
label, its typed input value, and the filer's citation
(page.line.column). The oracle's locate rule (footer page mark +
edge-anchored printed line number) finds the truth line; values
locate nothing, here as everywhere.

## What was inspected before this registration, stated honestly

Building the selection rule required reading the fifteen cited lines
and the schedules' column headers, and two things were **seen before
this file was written** — they are named as observations, not
predictions, so no credit is taken for them later:

1. **Row 44 is a genuine day-one disagreement in the real pair.**
   The model types **0** for « Less: General Plant Account 397 —
   Communications », citing p207.94.g. Hand-read at the printed
   pages: the label half names line 94 « (397) Communication
   Equipment », beginning balance $704,462, no additions or
   retirements printed, and the continuation's end-of-year column
   prints **$704,462** in the g x-band. The document states 704,462;
   the model holds 0. Whether the filer's 0 is a deliberate election
   is exactly what a reviewer must see and sign; the check must flag
   it.
2. **The spread arithmetic cross-checks the locate rule**: line 104's
   halves reconcile exactly (71,101,379 + 2,222,245 − 7,741 =
   73,315,883), so the label-half/continuation pairing used in the
   hand-reads is the right one.
3. **Rows 21, 57 and 59 print their figures as credits in
   parentheses** — the accumulated-depreciation schedule states
   (41,209,384), (6,046,528), (919,728) — while the model holds the
   positive magnitudes. The binding schema states « document value ×
   scale = model value » with scale > 0, so a sign flip is not
   expressible: the check will flag these three by its own rules,
   and the flag is *of a difference the document genuinely prints*
   (the sign), not an arithmetic error. `ChainLink` already carries a
   `transformation` column for exactly this family and the terms
   schema does not; whether to carry it over (and have the check
   apply it) is a schema question recorded for the founder below,
   **not patched mid-round**.

## The selection rule — the person's eyes, frozen as geometry

A person picking a term reads the cited column off the page. The
harness stands in for them with a per-schedule rule frozen from the
schedules' own printed headers, **value-free at selection time**:

- Take every extracted fact on the truth line.
- **p207 column g** (the plant spread's continuation; printed columns
  d, e, f, g): the fact whose box sits in the g x-band, `x0` in
  [400, 540] — measured on the hand-read lines (g figures at
  441–450; the right-edge line numbers at 550–554; column d at 131).
  No fact in the band, or more than one → the row is **UNRESOLVABLE**
  and says so; never a silent zero.
- **p227 column c** (Materials & Supplies; printed b, c): the
  rightmost fact.
- **p354 column b, p323 column b, p219 column c, p112 column c,
  p111 column c** (schedules whose cited column is followed by
  exactly one more printed column — allocation/prior-year/d): the
  **second-from-right** fact. Counting from the right is what steps
  over label-embedded numbers (« lines 4 and 14 », the account
  number « (189) ») without ever reading a value.

All fifteen lines were hand-read against this rule during inspection
(the table of lines and box positions is in the session record and
re-printed by the harness); the selected figure is the cited column's
on every resolvable row, by eye.

## Term construction and binding — as the product does it

- Round 1's 11 **PICKABLE** rows: the term is the selected fact —
  anchor line, printed text, parsed value, `stated=extracted`.
- Round 1's 4 **NEEDS TYPING** rows (19, 36, 41, 44): a typed term —
  the printed token as `printed_text`, empty anchor line,
  `stated=typed` — the person reading the figure off the page the
  extractor cannot label.
- The name is the model's own row label (the person names the term
  in their vocabulary).
- Binding: `cell_name` = the model label, model value = the typed
  input from the truth sample, **scale = 1.0 stated for every row**
  (both halves print plain dollars — the manifest's worked example),
  basis empty. Comparison happens at the document's printed
  precision, as the check always does.
- The harness exercises the same functions the route calls
  (`_check_term`, `reanchor_model`, `recheck` — constructed
  `ChainTerm` rows, no HTTP); the route layer is pinned by the
  34-test suite and is not what this round measures.

## The control leg — the unmodified pair (quietness)

Run the check once on the pair exactly as filed.

- **Bar C1 — selection resolves:** ≥ 14 of 15 rows resolve
  (UNRESOLVABLE ≤ 1).
- **Bar C2 — zero false alarms:** every row the check flags as
  disagreeing must hand-verify at the printed page as a difference
  the document genuinely states — a wrong value (row 44's class) or
  a printed sign convention (rows 21/57/59's class, counted under
  its own name, `sign-convention`). One flag with **no** printed
  difference behind it fails the round — quietness is the product.
- **Prediction (stated so it can be wrong):** 15 of 15 resolve;
  **exactly four** flags — row 44 (true value disagreement, the
  finding class this round exists for) and rows 21/57/59
  (sign-convention) — and the other 11 tie out. The genuinely
  predictive content, given the honesty notes above, is that **no
  fifth row flags** and every selection resolves cleanly.

## The planted leg — catch rate on class 1 alone

For each of the 15 rows, two plants applied to the **model value
before binding** (so each is a day-one disagreement, class 1's exact
shape), one row at a time — 30 runs, the other 14 rows untouched in
each:

- **P1, slipped magnitude:** model value × 10. For row 44's zero
  (× 10 of zero is undetectable by construction) the named
  substitution is **0 → 100,000** — a pasted-wrong-figure shape.
- **P2, last printed digit:** model value + 10^(−p), where p is the
  document's printed decimal places for that row — the smallest
  disagreement the document's own precision can state.

- **Bar P1/P2 — catch:** 30 of 30 planted rows report « does not tie
  out ». This is arithmetic; 29 of 30 is not a near-miss, it is a
  pipeline defect.
- **Bar Q — quiet under plants:** across all 30 runs, every
  non-planted row's verdict is identical to its control-leg verdict
  (420 row-checks, 0 changes).
- **Prediction:** 30/30 caught, 0 changes.

## The scale probe — the person's statement governs

Row 10 re-bound once with a deliberately wrong stated scale (1000).
- **Bar S:** the check reports the pair not tying out (44,016 × 1000
  against 44,016) — nothing infers around a person's statement.
- **Prediction:** flagged.

## What this round deliberately is not

Not a measurement of classes 2 and 3 (the model or the document
moving after confirmation — that needs a second version of a real
pair, which this corpus does not hold); not a measurement of picking
speed or of any matcher (the piece contains none); and not a
correction of anything — row 44's flag, if it lands, is a finding
for a person to accept or explain, never a write.

**Recorded for the founder, not decided here:** three of fifteen
real rows need a stated sign convention (« the document prints this
as a credit ») that the binding schema cannot carry. `ChainLink`
already has the `transformation` column for this family (unapplied
by the re-check there too). Whether terms gain it — and whether the
check applies it — changes what the product silences, so it is the
founder's call after this round's numbers are in front of them.

Harness: `server/scripts/terms_table_round2.py` (committed with
this file; run once, after this commit). Verdicts:
`docs/pierce/terms-table-round2-verdicts.json`, committed with the
results whatever they say.
