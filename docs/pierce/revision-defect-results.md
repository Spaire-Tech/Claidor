# Results: defects introduced by revision (PR24 draft → final)

Study per `revision-defect-protocol.md` (pre-registered `a2159ca`,
before any draft file was downloaded). Sixteen matched pairs: each
company's PR24 financial model at draft determinations (11 July 2024)
versus final determinations (19 December 2024). Same audit engine,
same configuration, both sides. Findings matched on rule + sheet +
cell name, never address; unmatchable findings bucketed, not guessed.

## The earned sentence

**Across one major revision of a professional financial model suite,
84 new mechanical defects appeared across sixteen company models —
ten of the sixteen models gained at least one.** Hand-verified
sample: 11 of 12 genuine regressions read in the cells, 1 of 12 new
structure, 0 reading artefacts.

One revision cycle, one publisher, the regulator's own FAST-standard
models — not bank-built deal models, and not a per-version rate.
Exactly this and nothing more.

## Per-pair results

| Company | Draft | Final | NEW | FIXED | PERSISTENT | UNMATCHED d/f | NEW per 1k formulas |
|---|---|---|---|---|---|---|---|
| Affinity Water | 713 | 657 | 4 | 14 | 581 | 118/72 | 0.01 |
| Anglian Water | 666 | 633 | 0 | 34 | 581 | 51/52 | 0.00 |
| Hafren Dyfrdwy | 657 | 644 | 0 | 14 | 581 | 62/63 | 0.00 |
| Northumbrian Water | 652 | 657 | 0 | 16 | 585 | 51/72 | 0.00 |
| Portsmouth Water | 682 | 669 | 6 | 20 | 611 | 51/52 | 0.01 |
| South West Water | 646 | 658 | 5 | 14 | 581 | 51/72 | 0.01 |
| SES Water | 706 | 633 | 0 | 74 | 581 | 51/52 | 0.00 |
| South East Water | 666 | 653 | 0 | 34 | 581 | 51/72 | 0.00 |
| Southern Water | 651 | 641 | 3 | 14 | 586 | 51/52 | 0.01 |
| South Staffs Water | 648 | 637 | 4 | 16 | 581 | 51/52 | 0.01 |
| Severn Trent Water | 646 | 641 | 7 | 14 | 581 | 51/53 | 0.02 |
| Thames Water | 646 | 637 | 4 | 14 | 581 | 51/52 | 0.01 |
| United Utilities | 646 | 640 | 7 | 14 | 581 | 51/52 | 0.02 |
| Welsh Water | 646 | 633 | 0 | 14 | 581 | 51/52 | 0.00 |
| Wessex Water | 650 | 657 | 4 | 18 | 581 | 51/72 | 0.01 |
| Yorkshire Water | 646 | 673 | **40** | 14 | 581 | 51/52 | 0.10 |
| **Total / mean** | — | — | **84** | 338 | ~581 | — | ~0.013 |

Each model holds ~413,000 formulas. The ~581 persistent findings are
the template's own: the suite ships with them replicated into every
company model before any revision happens — a finding in itself.

## What the verified regressions look like (12 read by hand)

- **Formula overwritten with a constant (6 verified).** Yorkshire's
  entire post-financeability-adjustments block — forty cells,
  FY2026–FY2030 — held live links to the inputs sheet at draft
  (`=IF(F_Inputs!J1142="",0,F_Inputs!J1142)`) and holds typed
  constants (`0.5248991766742258`) at final. Affinity, South West
  and Southern show the same shape on « Base revenue for 2024-25 »
  rows. If the inputs sheet moves again, these cells silently do not.
- **Manual adjustment hardcoded into a formula tail (5 verified).**
  Severn Trent's `N1885` reads
  `=IF(F_Inputs!J1142="",0,F_Inputs!J1142)-0.490096707821704` at
  final; Affinity's `Q1394` gained `+0.462324538414574`; Portsmouth's
  RCV opening balance gained `+0.1629228`. Late-stage adjustments
  typed into formulas rather than modelled. In three of these the
  draft had a *typed-over* defect at the same spot: the revision
  restored the formula and introduced a hardcode — it changed the
  defect's class rather than clearing it.
- **New structure, correctly excluded (1).** Portsmouth's equity
  issuance apportionment block (ADDN1) does not exist at draft; its
  findings are new sections, not regressions, and are not counted in
  the claim.

The financeability mechanism — the very thing reworked as allowances
moved from £88bn to £104bn under company objections — is where the
regressions cluster. Revision under pressure marks exactly the cells
the pressure touches.

Sampling note, stated plainly: the 12 verified findings were chosen
across companies and rule classes (stratified), not by uniform random
draw. FIXED is also real: revision repaired 338 findings while
introducing 84 — the study measures churn, not decay alone.

## Caveats, as pre-committed

- Regulator's models, not bank-built deal models. Different
  population.
- The FM02 suite is FAST-standard Excel; the reader saw ordinary
  workbooks throughout. No Openbox layer was present in these files.
- One revision cycle. No extrapolation to a per-version rate.
- 2025 republication check: the financial models were not
  republished; several outcome-model calculators were (v2, January
  2025) — additional pairs available for a future extension.
- UNMATCHED (findings with no usable cell name, ~51–118 per side)
  are reported above and excluded from NEW/FIXED rather than guessed.

## Why it matters

The yearly-subscription claim was logical; now it is measured: a
professional modelling team, revising under formal scrutiny, left 84
new mechanical defects across sixteen models in one cycle — including
forty in one model's financeability block. « The model changes
constantly, and changes introduce defects » is no longer an argument.
It is a table.
