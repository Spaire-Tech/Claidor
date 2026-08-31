# Terms table — round 3, the changed-term half, on real revisions

Registered before the harness runs, committed first with the extended
fetcher; results appended below the line after one run; the bars do
not move.

## The question

Rounds 2/2b measured finding class 1 (a day-one disagreement).
Classes 2 and 3 — **the model moving while the term stands, and the
term moving while the model stands still** (the founder's drawn
margin-ratchet case) — were built and pinned by tests but unmeasured
on real revisions, because no second version of a real pair was in
the corpus. It is now: the same filer's next annual cycle, found on
PJM's own formula-rates listing and fetched by the committed fetcher,
accepted on magic bytes and sha256.

## The corpus — the Rochelle lineage, four files deeper

| file | what it is | state |
| --- | --- | --- |
| `rmu-2015-form1.pdf` | CY2015 Form 1 (the confirmed pair's document) | already held |
| `rmu-2016-formula-rate.xlsx` | the 2016 model (the confirmed pair's model) | already held |
| **`cor-2016-form1.pdf`** | **CY2016 Form 1 — the document revision.** 132 pdf pages, 103 footer pages, **all seven cited pages present**; extraction reads 5,025 facts with 0 refused pages | fetched, sha-pinned |
| **`cor-2017-h25b.xlsx`** | **the 2017 annual update — the model revision.** Same `Appendix A - TSRR Summary` geometry: citation in F, label in C, typed value in H | fetched, sha-pinned |
| `cor-2017-form1.pdf` | CY2017 Form 1 — partial (page 207 absent); recorded, not this round's pair | fetched, sha-pinned |
| `cor-2020-h25b.xlsx` | the 2020 update — kept for later rounds | fetched, sha-pinned |

A record correction that travels with this: the old manifest's
« cor-2017-form1.pdf » (378,634 bytes, partial) is the **CY2017**
filing from PJM's 2018 folder; the complete CY2016 Form 1 —
1,110,563 bytes — was never previously held. Byte counts of the two
workbooks match the manifest exactly.

## Observations named before registration (no credit taken later)

Verifying the 2017 workbook's geometry unavoidably showed four rows'
new model values (rows 10, 12, 13, 19 — e.g. Transmission Wages
44,016 → 102,030): those four are **known moved** and predicting
them counts for nothing. Also structural, not results: Form 1 is a
standard federal form, so schedule line text is expected stable
across years; and the 2017 Appendix A carries 32 `p…` citations
against the 2016 workbook's ~35.

## The two legs — both real files, nothing synthesized

Terms are constructed and bound exactly as round 2b left them: the
15 truth rows on the (CY2015 document, 2016 model) pair, frozen
selection geometry, « negate » stated on rows 21/57/59, scale 1.0.

- **Leg A — class 3, the source moved.** The 2016 model genuinely
  did not change (it is the same file); the document genuinely did
  (the next year's filing). The check runs with the document side
  re-read from `cor-2016-form1.pdf`: extracted terms re-anchor by
  printed line and ordinal — the D4 rule, no matcher — and the four
  typed terms are **blind by design** (they compare at their stated
  value; a typed term has nothing printed to re-read). That
  blindness is the typed route's price and this round counts it on
  the face.
- **Leg B — class 2, the model moved.** The document side stands as
  stated; the model side re-anchors by the cell's name against the
  2017 workbook's Appendix A rows (name = column C, value = column
  H, ref = the row's address — the round-8 frozen geometry applied
  to the new file). No matcher: `reanchor_model`'s exact-name rule,
  ambiguity honestly reported.

## Bars (registered now)

- **R1 — no silent re-points, either side, either leg:** every
  re-anchored row is hand-verified to be the same schedule line (leg
  A, at the printed pages) or the same appendix line (leg B, at the
  workbook rows). One wrong re-point fails the round — a wrongly
  re-pointed link is worse than a broken one.
- **R2 — verdict correctness:** for every anchored row, the verdict
  (« the source moved » / « the model moved » / « agrees », with
  ties) matches the hand-read comparison of the stated values. Zero
  wrong verdicts; this is arithmetic over anchoring, and a miss is a
  defect.
- **R3 — honest refusals:** every broken or ambiguous outcome names
  a true state of the file, hand-checked. A refusal is not a
  failure; a false reason is.
- **R4 — the typed price on the face:** the four typed rows' leg-A
  blindness is stated in the results, not buried.

## Predictions (stated so they can be wrong)

- **Leg A (11 extracted rows):** 9–11 re-anchor (the form's fixed
  wording), 0–2 ambiguous where label tokens collide across lines,
  0 broken. Of the re-anchored: **≥ 8 « the source moved »** (annual
  data moves), 0–2 « agrees » (a balance repeating year-on-year).
- **Leg B (15 rows):** 11–14 re-anchor by name against the 2017
  pool; **1–3 ambiguous or broken, « General » (row 41) the
  likeliest** — round 11's generic-label lesson arriving on the
  model side. Of the anchored: **≥ 10 « the model moved »**
  (including the four known-moved), 0–2 « agrees ».
- Bars R1–R3 pass at zero, or the round reports a defect.

Harness: `server/scripts/terms_table_round3.py`, committed with this
file, run once after this commit; it prints everything the
hand-verification needs (old value, new value, the re-found line or
row). Verdicts: `terms-table-round3-verdicts.json`, committed
whatever they say.
