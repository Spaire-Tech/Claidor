# Do revisions introduce defects? A measurement on sixteen published financial models

*Draft for the founder's voice pass. Not published, not sent. The
data is public; every claim below is checkable by anyone with the
links and a copy of Excel.*

## Summary

When Ofwat, the water regulator for England and Wales, revised its
PR24 financial model suite between draft determinations (July 2024)
and final determinations (December 2024), 84 new mechanical defects
appeared across the sixteen company models — typed constants
overwriting live formulas, and manual adjustments hardcoded into
formula tails. One company's model gained forty in a single block:
the post-financeability adjustments, the exact mechanism the
revision existed to rework. To our knowledge, no figure for
defect introduction during revision of professional financial models
has previously been published; the nearest published number comes
from Enron-era office spreadsheets, a different population entirely.

## Why this hasn't been measured before

Measuring it needs three things at once: two published versions of
the same professional model, an automated audit that reads every
formula the same way twice, and a way of matching findings across
versions in which rows have moved. Published version pairs of
professional models are rare — modelling firms do not publish, and
regulators rarely publish twice. Ofwat's PR24 process did: the same
sixteen company financial models (FAST-standard, ~413,000 formulas
each) at draft and at final determinations, revised in between under
formal objection, with the programme's total moving from £88bn to
£104bn. Both publications remain available through the UK National
Archives' web archive.

## Method

- The same automated audit, identical configuration, ran on both
  versions of each model. Rules cover, among others: formulas
  overwritten by typed constants, numeric constants embedded in
  formula bodies, error values, external-workbook references, and
  inconsistent formula runs.
- Findings were matched across versions on **rule + sheet + cell
  name** (the model's own row and column labels) — never on cell
  address, because rows move between versions. A finding present at
  final under a name absent at draft is NEW; the reverse is FIXED;
  matched both sides is PERSISTENT. Findings without a usable name
  were bucketed as UNMATCHED and excluded from NEW/FIXED rather than
  guessed at.
- The protocol — definitions, matching rule, verification procedure,
  and the exact sentence the study would be allowed to claim — was
  written and committed to version control **before any draft-stage
  file was downloaded**.
- Twelve NEW findings, chosen across companies and rule classes,
  were then verified by hand: the cell read in both versions before
  anything counted. Eleven were genuine regressions; one sat in a
  section that did not exist at draft and was excluded from the
  claim; none were artefacts of reading.

## Results

84 NEW findings across the sixteen pairs; ten of sixteen models
gained at least one; the mean is ~5 per model against ~413,000
formulas per model. Revision also FIXED 338 findings — the process
nets positive, which is worth stating plainly and is not the point:
the 338 were repaired while a public consultation had every figure
under contest, and the 84 arrived silently *in the final published
version*, which no further revision will ever visit.

Three verified shapes:

1. **Live formulas overwritten with constants.** Yorkshire Water's
   post-financeability-adjustments block: forty cells that read
   `=IF(F_Inputs!J1142="",0,F_Inputs!J1142)` at draft and
   `0.5248991766742258` at final. If the inputs sheet changes again,
   these cells silently do not.
2. **Adjustments hardcoded into formula tails.** Severn Trent's
   `InpS!N1885` at final:
   `=IF(F_Inputs!J1142="",0,F_Inputs!J1142)-0.490096707821704`.
   A late correction typed into the formula rather than modelled.
   Notably, in three verified cases this *replaced* a typed-constant
   defect present at draft: the revision restored the formula and
   introduced a hardcode — the defect changed class rather than
   being fixed. A check that asks only « is this cell a formula? »
   records these as repairs.
3. **Standing template findings.** Roughly 581 findings persist
   through both versions of every company model — they ship with the
   template. A professional model does not open clean; it opens with
   hundreds of inherited flags, which is why « what changed since
   the version you trusted » is the only reviewable view of a
   revision.

## Limits

- These are a regulator's models, built to a published standard —
  not deal models built by a bank's adviser. The population differs.
- One revision cycle, one publisher. This is « defects introduced
  across one major revision », not a per-version rate.
- The PR24 revision was unusually large — an £16bn movement under
  formal objection. 84 is more plausibly a ceiling than an average.
- Mechanical defects only. Whether any given typed constant produces
  a wrong allowance is a separate, per-cell question; what the study
  counts is cells that no longer respond to their inputs, and
  constants that no revision will ever find again.

## Data

Draft determination models: Ofwat, 11 July 2024 (via the UK National
Archives web archive). Final determination models: Ofwat, 19 December
2024. Sixteen matched pairs, identified by each workbook's own cover
cell. The per-pair table, matching code, and verification transcript
are available on request.
