# D3 round 10 — page selection by title, registered before any scored run

*31 August 2026. Piece 6. Everything below — design, constants, bar,
prediction — is committed before the harness produces a single
verdict. The truth is a third party's (the RMU filer's own citations,
committed in `scribe-d3-round8-sample.json` since round 8) and is not
touched.*

**Why « round 10 ».** Round 8 was the FERC measurement (0 correct, 2
wrong, 13 abstained). Round 9 was the two-page-spread repair —
investigated, bounded at zero, and deliberately not built. This is
the next registered round.

## What the audit says the round must test

`chain-piece6-audit.md` § 3: on the FERC pair the binding gap is
**page selection** — given the truth page with prose excluded, the
row label alone resolves **9 of 15**; across the whole document the
score is 0 and every page-scoring design tried was won by the densest
page. The successor argued in the lane log (twenty-eighth « go ») and
never built: **match the model's section header to the document's
page TITLE — two things of the same kind — instead of to a page's
bag of words.** This round builds and scores exactly that, and
nothing else.

## The corpus and the sample — unchanged from round 8

- Document `rmu-2015-form1.pdf` (sha256 `b46018ef0d06…`), model
  `rmu-2016-formula-rate.xlsx` (sha256 `01be958d92ca…`) — re-fetched
  this session from the PJM paths in `corpus-ferc-formula-rate.md`
  and byte-verified against the recorded hashes.
- The sample is round 8's **15 scorable rows**, frozen since that
  registration (r10, r12, r13, r19, r21, r36, r41, r44, r57, r59,
  r88, r119, r121, r179, r187). The truth for each is the filer's own
  citation `p<page>.<line>.<col>`, parsed, never judged by me.
- The verdict rule is round 8's, unchanged: a proposal is **correct**
  iff its fact lies on printed page P (footer rule) and printed line
  L (lead-or-tail anchor); column leniency declared as in round 8.
  Wrong = any other proposal. Abstention is its own outcome.
- Never-by-value, unchanged: scoring uses `propose.label_tokens`,
  which drops purely numeric tokens from both sides. Values appear
  only in the report.

## The design, frozen

**Stage 1 — pick the page(s) by title.**

- *Model side:* a sample row's **section header** is the nearest
  non-empty column-B string at or above its row on
  `Appendix A - TSRR Summary` (the sheet's own section column —
  « Plant In Service », « Accumulated Depreciation » — read from the
  workbook, mechanical rule, no judgement).
- *Document side:* a page's **title** is the longest match of
  `[A-Z][A-Z0-9 &/,\-\.()':]{7,}` containing at least 8 uppercase
  letters, over the page's first **6** extracted text lines.
  **Calibrated and frozen before this registration on the 96 footer
  pages the sample does not cite**: 93 of 96 yield a plausible
  schedule title, 3 yield none (counted, not hidden). The cited pages
  were not looked at during calibration.
- *Score:* coverage of the section header's label tokens by the
  title's label tokens. Selected pages = all pages tied at the
  maximum, provided the maximum is > 0. A zero maximum is recorded as
  `unreachable-page` — the row abstains at stage 1.

**Stage 2 — pick the line within the selected page(s).**

- Candidates: every extracted fact (D1 v5, the shipping extractor)
  on a selected page, **excluding prose lines** — a line carrying
  more than **10** alphabetic word tokens is prose and ineligible.
  (Round 8's published measurement: all 15 truth lines carry 0–8
  word tokens; the instruction sentence that drew both of round 8's
  wrong answers carries 20. The one lever that removed both wrong
  answers in the lane's six-lever table, now frozen as a rule.)
- Scoring identical to `corpus_d3_oracle.py`, which reproduced round
  8 exactly: coverage of the cell label's tokens by the candidate
  line's tokens, `FLOOR = 0.5`, **exact tie at the top → abstain**,
  propose the single top candidate otherwise.

**Nothing ships from this round.** `chain/propose.py` is not touched;
the harness (`scripts/corpus_d3_round10.py`, committed) is a
measurement. Wiring anything into the product is a separate decision
with the founder's word, after the number exists.

## The bar, in advance

1. **Stage-1 bar:** the truth page must be among the selected pages
   on at least **8 of 15** rows. Below that, title-to-section-header
   page selection is dead and the round reports it dead, whatever
   stage 2 does.
2. **Kill criterion (the lane's standing one):** more confident wrong
   answers than correct ones end-to-end = the round is a failure and
   is reported as one.
3. **Clearing the bar means:** correct > wrong **and** correct ≥ 3 —
   the first non-zero recall in this matcher's history, or nothing.

## The prediction, stated so it can be wrong

- Stage 1 places the truth page for **10–13 of 15** (misses:
  the 3-of-96 empty-title rate, plus schedule pages whose top lines
  carry a caps section row rather than the schedule title — seen on
  a calibration page).
- End-to-end: **5 to 8 correct, at most 2 wrong.** The gains come
  from the 9 rows measured « alone at the top of their own page »;
  the four p207 spread rows do **not** convert (their facts carry no
  words — stage 1 may find the page and stage 2 still has nothing to
  match), and at least one of the three same-word-three-lines rows
  (« Transmission » under Operation, Maintenance and Total) ties and
  abstains.
- If instead the round produces confident wrong answers from titles
  gluing to the wrong schedule, that is the outcome the design must
  prefer to expose, and the tie rule stays.

## Bias, admitted

The design is chosen *because of* the published twenty-eighth-« go »
ceiling measurements — that is what measurements are for, and it
means the 9-of-15 figure is a ceiling this round was aimed at, not an
independent discovery. The title rule's constants come from the 96
non-cited calibration pages only. The judge is nobody: the truth was
written by the filer in 2016. The one number that would be genuinely
new information is the stage-1 hit count, and it is reported first.
