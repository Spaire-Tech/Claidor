# Pre-registered protocol: defects introduced by revision (PR24 draft → final)

Committed **before any draft-determination file is downloaded**. The
question: does revising a professional financial model introduce new
mechanical defects, and at what rate? The claim is currently logical
(« the model changes constantly ») and not measured. Nobody has
published this number for specialist-built models; the nearest figure
(~17% of change-sequences introducing an error) comes from Enron-era
office spreadsheets, a different population. This study measures one
real revision cycle: Ofwat's PR24 modelling suite at draft
determinations (11 July 2024) versus final determinations
(19 December 2024) — a genuine rework under formal objection, with the
programme's total moving materially between the two publications.

## Definitions, fixed now

- **A finding** is one audit-engine defect: (rule, sheet, row label,
  column header, ref, detail), produced by the same engine version and
  the same configuration on both sides of every pair.
- **Matching key** for a finding across versions: `rule + sheet +
  row label + column header`. **Never the cell address** — rows are
  inserted between versions and the same defect moves. Where several
  findings share a key on either side, they are matched by count
  (min(n_draft, n_final) treated as persistent) and the excess falls
  to NEW or FIXED accordingly.
- **NEW**: present at final under a key absent at draft.
- **FIXED**: present at draft under a key absent at final.
- **PERSISTENT**: matched across both.
- **UNMATCHED**: a finding whose cross-version identity cannot be
  established with confidence (mangled or empty labels, renamed
  sheets). Bucketed as such rather than guessed — the matcher's own
  discipline. UNMATCHED counts are reported, not silently dropped.
- **A pair** is a draft-stage workbook and a final-stage workbook
  matched by published model name/code. Models present at only one
  stage are inventory data, listed, never force-paired.

## Procedure

1. This protocol committed. Output format below fixed.
2. Download draft models (Ofwat blocks this server directly; the UK
   National Archives mirror and reader-proxy route are the
   established path). Build the two-stage inventory; log unpaired
   models on both sides.
3. Audit every matched pair, identical configuration both sides.
4. Diff per the matching key. Report per pair and aggregate:
   defect count per stage; NEW / FIXED / PERSISTENT / UNMATCHED;
   NEW as a rate per model and per 1,000 formulas.
5. **Hand-verification before anything counts**: a random sample of
   at least 10 NEW findings (or all of them if fewer) read in the
   cells. Each is classified: (a) genuine regression — the defect
   did not exist in the draft's corresponding structure; (b) new
   structure — the section it sits in has no draft counterpart;
   (c) artefact of reading. Only (a) supports the revision-regression
   claim; the write-up reports the sample's split and scales its
   confidence accordingly.

## The sentence this can and cannot earn, decided now

If the verified number is non-trivial, the earned sentence is exactly:
« Across one major revision of a professional financial model suite,
N new mechanical defects appeared » — one revision cycle, one suite,
the regulator's own models. It is **not** a per-version error rate,
not a statement about bank-built deal models, and will not be
presented as either. If the number is near zero, that is the result
and it is reported with the same prominence — better to learn it now
than under a pricing model built on the assumption.

## Caveats carried into any write-up, verbatim commitments

- Population: the regulator's own models, built by/for Ofwat, not
  deal models built by a bank's adviser.
- Ofwat models are built with Openbox, a modelling layer above Excel.
  Whether that changes what our reader sees will be checked and
  recorded either way.
- One revision cycle, one publisher. No extrapolation.
- Any 2025 republication of final models is checked for; if found,
  those become additional pairs under the same protocol.
