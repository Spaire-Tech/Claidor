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

---

# Measured. Stage 1 clears its bar; the round does not clear, and the prediction was wrong.

*Run once, as registered, nothing tuned after. Verdicts:
`scribe-d3-round10-verdicts.json`; harness:
`server/scripts/corpus_d3_round10.py`.*

| | result | bar |
|---|---|---|
| stage 1 — truth page among selected | **11 of 15** | ≥ 8 — **PASS** |
| correct | **0** | ≥ 3 and > wrong — **NOT CLEARED** |
| wrong | **0** | kill criterion (wrong > correct) — did not fire |
| abstained | 14 | — |
| unreachable-page | 1 | — |

**Page selection by title works.** Eleven of fifteen rows, from a
six-line rule and a section-header column — against 3 of 15 for every
bag-of-words page scorer previously tried. The four misses are the
rows whose real key is the FERC account number (r119 « Account 924 »,
r121 « Account 930.1 »), a section the titles do not speak
(« Proprietary Capital »), and one empty-title page (r187).

**And the prediction was wrong — 5 to 8 correct predicted, zero
delivered — for a reason I should have caught at registration.** The
« 9 of 15 alone at the top of its own page » ceiling this round was
aimed at was measured **without the floor**. Under the frozen
`FLOOR = 0.5`, the ordinary Form 1 truth line shares one word in
three with the model's label (« Transmission Wages Expense » against
« 21Transmission (Enter Total of lines 4 and 14) » — 0.33) and is
unreachable by construction, right page or not. I registered a
prediction against a ceiling whose rules were not the rules I froze.

**The two causes, read at the lines, not asserted:**

1. **The title line is circular evidence and it ties everything.**
   Stage 1 selects every page of a multi-page schedule; each carries
   the schedule's own title as a line; a model label like « Electric
   Plant in Service » then ties at 1.00 with *the very string stage 1
   already consumed* — eleven copies. A successor must exclude a
   page's title line from stage-2 candidacy: a heading names the
   table, it does not state a value.
2. **The floor rejects statutory phrasing.** Seven rows abstain at
   the floor with the truth page correctly selected — coverage 0.33
   against the bar of 0.5. Whether the floor may be different when
   the pool is one schedule instead of a whole document is a design
   decision of the same class as the « unchanged vs undamaged » bar —
   registered for a successor round with the founder's word, never
   slid quietly.

**One finding that changes round 9's arithmetic.** On the tie rows,
the best *non-title* candidate is the **left half of the spread
itself** — « 104TOTAL Electric Plant in Service (Enter Total of
lines… » — the same schedule line whose column-(g) figure the filer
cites on the continuation page. The registered verdict rule counts
that as wrong (different printed page), and a human would call it the
right row read at its label half. Round 9 measured that a perfect
spread reconstruction buys zero **against the whole document**; with
the pool narrowed to one schedule and titles excluded, that bound no
longer applies. Spread reconstruction is worth re-pricing *inside*
this design — as its own registration, not as a patch here.

**Nothing ships.** `chain/propose.py` is untouched; the standing
sentence does not change (no registered number about the product
route moved). The design stayed honest under pressure: zero confident
wrong answers.
