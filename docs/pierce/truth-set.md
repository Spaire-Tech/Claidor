# The truth set — registration, before any code

3 September 2026. The last of the four meaning-layer rounds. The
research said it plainly: the largest published set of real errors
in real spreadsheets is a few dozen, and nobody has published one for
financial models. What we hold is scattered across study records,
answer keys and planting logs, graded nowhere, and the engine's
recall on **real** errors has never been stated as one number. This
round makes one registry of every labelled defect we hold, grades
each by where its label came from, runs the revision pipeline — the
Watch pointed backwards — on the one new pair set we hold, and states
today's recall on the labels that are independent of the engine.

## What a label is worth — the grades, fixed now

| Grade | Meaning | What it can measure |
| --- | --- | --- |
| **independent-real** | a defect in a real model, labelled by someone or something other than this engine: a regulator's own correction, a modeller's answer key, a revision that fixed it, a hand reading of the cells | recall of the engine on real errors |
| **engine-found, hand-verified** | the engine flagged it and a person read the cells and agreed | precision; and a regression check that the engine still finds it |
| **synthetic** | planted by our own planter with the ground truth written first | recall on classes we chose |
| **external** | a published set from outside (Enron errors, INFO1, the Tasi labels) | comparison with other tools, under its own licence |

A label that is only « the engine said so » is not in the registry.

## The registry, fixed now

`docs/pierce/truth-set/registry.jsonl`, one line per labelled
defect or per labelled set, with: `id`, `grade`, `source` (the study
or key it came from, by document), `file` (name and content hash
where the file is held; the file itself is never committed),
`sheet`, `cell` or `cells`, `class` (the engine's rule vocabulary
where it applies), `description` in plain words, `evidence` (the
document, page or URL), `licence`, `added` (date). External sets are
entered once as a set with their counts, not row by row, because
their files and licences are theirs.

Seeded from the record as it stands:

- the twelve hand-read PR24 draft→final regressions
  (`revision-defect-results.md`): eleven genuine, one new structure
  — grade engine-found hand-verified; the six « formula overwritten
  with a constant » and five « adjustment typed into a formula
  tail » cases;
- the Kelso answer key (73 clause → term → figure rows written by the
  original bankers, `chain-kelso-round.md`) — independent-real, for
  the document link, not the model;
- the closed-deal ground truth (`closed-deal-ground-truth.md`);
- the planting rounds' ground-truth files (round 4, the regularity
  round) — synthetic, by reference to their logs;
- the external sets fetched 2 September: Enron errors (48 rows, 26
  files), INFO1 (119 files), the Tasi labels (1,974 cells) — with
  their licence lines.

## The pipeline, fixed now

`scripts/revision_diff.py` already does the study's work: the same
audit on both versions, findings matched on rule + sheet + cell
name, never address; NEW / FIXED / PERSISTENT / UNMATCHED. This
round adds a `--candidates` output: every NEW finding of the final
version, written to a file a person can read and grade, and a
`scripts/truth_set.py` that appends graded candidates to the
registry with their provenance. That is the standing job: every
revision cycle a regulator publishes is a pair, every pair is a
candidates file, every graded candidate is a line in the registry.

## Measures, fixed now

1. **The registry**: lines by grade and by source, after seeding.
2. **The RIIO-3 pairs, new material**: the three business-plan
   models and the WACC model, draft (June 2025) → final, through the
   pipeline: NEW / FIXED / PERSISTENT / UNMATCHED per pair; up to
   twelve NEW findings read by hand, stratified across the pairs and
   rules, graded genuine regression / new structure / reading
   artefact; the genuine ones added to the registry.
3. **The PR24 pairs under today's engine**: the same sixteen pairs
   re-run; NEW per pair beside the study's numbers; and whether each
   of the eleven verified regressions is still among today's NEW
   findings (a regression check on the engine, not a new claim).
4. **Recall on independent-real labels in models we hold**: the
   share of registry lines of that grade whose cell today's audit
   flags under any rule. Stated with the denominator, however small.
5. **Cost**: wall time per pair.

## Predictions, registered

- The registry seeds with under 30 independent-real lines on models
  we hold: the honest number is small, and that is the point of
  writing it down.
- RIIO-3: between 5 and 60 NEW findings across the four pairs; of
  twelve read, at least eight genuine — a revision that moved the
  draft determinations to finals touched the financeability sheets,
  as PR24's did.
- PR24 re-run: NEW per pair within ±5 of the study's numbers for
  fourteen of sixteen companies (the engine has folded and reworded
  since; the *cells* should hold, the counts may fold); all eleven
  verified regressions still found.
- Recall on independent-real labels: at or above 80%, on a
  denominator under 30.
- Cost: under six minutes a pair for PR24, under twelve for a
  RIIO-3 business-plan model.

## Out of scope, named

- No paid annotation. The registry is the container it would fill.
- No publishing. The publishable slice is a decision for the founder
  once the mutation numbers stand beside it.
- The Enron sweep stays paused.

---

# Results

*(appended after the round; nothing above this line changes)*

## Result — 3 September 2026

### Measure 1 — the registry

Seeded, before any pair ran: 11 lines. After the round: **28 lines**
(`docs/pierce/truth-set/registry.jsonl`; `scripts/truth_set.py count`).

| Grade | Seeded | After the round | What the lines are |
| --- | --- | --- | --- |
| independent-real | 2 | 3 | Kelso's 73 answer-key rows and the DGRI's 10 figures tie a *document* to a model — neither is a defect in a cell. The third line is a wrong switch reference found by hand in GD3 (below). |
| engine-found, hand-verified | 5 | 21 | the PR24 study's twelve readings (seven now pinned to a cell and a content hash, four unnamed), the twelve RIIO-3 readings, the PR24 switches |
| synthetic | 1 | 1 | the 50 plants of the regularity round |
| external | 3 sets | 3 sets | Enron 48, INFO1 5,609, Tasi 1,974 = 7,631 labelled cells, each under its own licence line |

Two corrections to the seed, made when the cells were re-read and
named here: the « remaining seven » line was miscounted (the twelve
readings are seven named cells, four unnamed, one new-structure
block), and it now says so; and every line from this round carries a
`revision` field — `regression`, `new-structure`, `unchanged-cells`,
`persistent` — because the round showed that « a defect » and « a
regression » are different questions (measure 2).

### Measure 2 — the RIIO-3 pairs, new material

Draft determinations (June 2025) → final, through
`scripts/revision_diff.py`, one audit each side:

| Pair | Draft | Final | NEW | FIXED | PERSISTENT | UNMATCHED d/f | Formulas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ET3 business-plan model | 34 | 42 | 11 | 6 | 21 | 7/10 | 584,339 |
| GD3 business-plan model | 49 | 52 | 10 | 8 | 32 | 9/10 | 638,766 |
| GT3 business-plan model | 32 | 43 | 14 | 5 | 20 | 7/9 | 586,147 |
| GDT3 WACC rates model | 10 | 10 | 1 | 1 | 6 | 3/3 | 335,717 |
| **Total** | | | **36** | 20 | 79 | | |

Twelve NEW findings read by hand, stratified across the four pairs
and the five rules that fired (`scratchpad/riio_cells*.txt`, the
formulas of both versions beside each other):

| # | Pair · cell | Rule | What the cells say | Grade |
| --- | --- | --- | --- | --- |
| 1 | ET3 Revenue!AY25 | inconsistent-row | the FY2031 profiling adjustment reads an unlabelled helper (`MainInputs!AZ461 = -AY462-AY463`) that unwinds the TVOM account; every other year reads row 460 | new structure; true as read, deliberate |
| 2 | GD3 Revenue!AY26 | inconsistent-row | the same design, `AZ344 = -(AY345+AY346)` | new structure; deliberate |
| 3 | ET3 FinRatios RoRE decomposition!AP29 | typed-over-formula | a row of typed zeros (« Revenue impact from AIP adjustments ») between two rows that link, on a sheet that does not exist at draft | new structure; a real placeholder |
| 4 | ET3 Revenue!AP16 | typed-over-formula | « Return adjustment »: typed zeros in every year, **identical at draft and final**; the draft audit has no finding on the Revenue sheet at all — the rows around it changed | unchanged cells (a category the registration did not foresee) |
| 5 | GT3 PCFMInterface_SO!I184 | typed-over-formula | a typed 0.06 in a column of links to the NGGT SO sheet; the NGGT SO row it should read carries no value — the 6% has no source in the model | new structure; a real defect |
| 6 | ET3 Finance&Tax!AP258, AP307 | hardcode-in-formula | `=AP343>5`: the £5m loss-restriction allowance typed into the test | new structure; a real hardcode |
| 7 | ET3 Finance&Tax!AP259, AP308 | hardcode-in-formula | `=AP258*(5+(AP343-5)*50%)`: the £5m and the 50% typed in | new structure; a real hardcode |
| 8 | GD3 MainInputs!AU472 | hardcode-in-formula | `=IF($I$474=1,$AU$471/5,AT10*$AU$471)`: the five-year control length typed as `/5` — **and the row reads the other factor's switch** (`$I$474`, the K Correction Factor's) instead of its own `$I$472`; ET3's twin reads its own | new structure; a real hardcode, and a wrong reference the engine has no rule for |
| 9 | GT3 SystemOperator!AP931, AP979 | hardcode-in-formula | the loss-restriction block again in the System Operator's tax | new structure; a real hardcode |
| 10 | ET3 TaxPools!AP106, AP118 | volatile | the straight-line allowance rewritten with `OFFSET(…)` inside; no OFFSET at draft | **genuine regression**, style tier |
| 11 | GT3 SystemOperator!AP731, AP742 | volatile | the same rewrite in the SO's pools | **genuine regression**, style tier |
| 12 | WACC One-Off Wedge!E16 | hardcode-in-formula | `IF(A16=2030, 22/24, IF(A16=2031, 10/24,0))`, identical at draft and final; the column header changed from « % of RPI!=CPI » to « % of RPI!=CPIH », the finding's name changed with it, and the pipeline reported one NEW and one FIXED | reading artefact of the matcher |

**Genuine regressions: 2 of 12. New structure: 8, of which 6 hold a
real defect and 2 are deliberate exceptions read true. Unchanged
cells: 1. Reading artefact: 1.** The registered prediction — at least
eight genuine regressions — is wrong, and the reason is worth more
than the number: the PR24 revision moved cells inside an existing
template, while the RIIO-3 revision *added* structure (a loss
restriction block in three models, a RoRE decomposition sheet, PCFM
interface sheets, profiling-adjustment rows), and the defects it
brought live inside the new blocks. A registry that only asked « is
this a regression? » would have thrown six real hardcodes away; hence
the `revision` field.

One defect found by hand that no rule sees: GD3's Adjustment Factor
phasing row anchored on the wrong switch (#8). Both switches are 0
for the selected company, so the number is right today; a company
choosing different phasing for the two legacy factors would get the
wrong answer. Registered as independent-real, with the caveat that
the eye was led to the cell by the engine's `/5`.

Fourteen lines went into the registry from this measure (twelve
readings, the wrong switch, and the persistent WACC hardcode under
its true name).

### Measure 3 — the PR24 pairs under today's engine

The sixteen draft→final pairs re-run (`scratchpad/pr24_pairs.log`),
beside the study's numbers of 27 August:

| Company | Today draft | Today final | Today NEW | Study NEW | Δ |
| --- | --- | --- | --- | --- | --- |
| Affinity | 8 | 13 | 8 | 4 | +4 |
| Anglian | 6 | 6 | 2 | 0 | +2 |
| Hafren Dyfrdwy | 15 | 17 | 2 | 0 | +2 |
| Northumbrian | 5 | 13 | 7 | 0 | **+7** |
| Portsmouth | 11 | 13 | 4 | 6 | −2 |
| South West | 4 | 11 | 4 | 5 | −1 |
| SES | 65 | 9 | 5 | 0 | +5 |
| South East | 23 | 8 | 3 | 0 | +3 |
| Southern | 5 | 10 | 4 | 3 | +1 |
| South Staffs | 5 | 10 | 7 | 4 | +3 |
| Severn Trent | 4 | 13 | 8 | 7 | +1 |
| Thames | 4 | 7 | 2 | 4 | −2 |
| United Utilities | 6 | 13 | 6 | 7 | −1 |
| Welsh | 4 | 6 | 2 | 0 | +2 |
| Wessex | 4 | 12 | 7 | 4 | +3 |
| Yorkshire | 3 | 46 | 43 | 40 | +3 |
| **Total** | | | **114** | **84** | |

Fifteen of sixteen within ±5 (Northumbrian at +7); the prediction of
fourteen holds. The models report 3–65 findings a side today against
the study's ~650: the folds built since August take the template's
~581 inherited findings out of every model, which is what the folds
were for.

**A template-wide regression the study did not name.** Every one of
the sixteen finals reports « Switch - Dividend yield » (InpS!F225)
and « Switch - Reprofiling » (F284) as typed over, and four (South
West, SES, Southern, Severn Trent) the two run-off-rate switches too.
Read in Affinity and South West: `=IF(F_Inputs!T1675="",0,
F_Inputs!T1675)` at draft, a typed `1` or `2` at final. Forty control
switches that the inputs sheet no longer drives; 40 of today's 114
NEW. One registry line, count 40.

**The eleven verified regressions.** The study named seven cells;
four it described only by kind and cannot be re-checked until they
are found again (the registry says so). Of the seven:

| Verified cell | Engine today | Pipeline today |
| --- | --- | --- |
| Severn Trent InpS!N1885 tail hardcode | found | NEW |
| Affinity InpS!Q1394 tail hardcode | found | NEW |
| Portsmouth InpS!F1456 tail hardcode | found | NEW |
| Yorkshire's post-financeability block (N1885:R1888, 20 cells) | found, all twenty | NEW |
| Affinity base revenue M2024, M2025 | found | NEW |
| South West base revenue M2024 | found | **UNMATCHED** |
| Southern base revenue M2024, M2025 | found | **UNMATCHED** |

Seven of seven found by the engine; five of seven reach the pipeline.
The two that do not: in South West and Southern the typed-over cells
run down the column (M2024, M2025, M2026, M2028, M2029), the audit
folds them into one « typed over down a column » finding, and that
finding carries its row label in `flow` and nothing in `name`. The
matcher keys on `name` and drops it. Severn Trent's M2024 is the same
shape, unnamed, and not in the study.

**Deviation, post hoc, named before the number is used.** The matcher
now falls back to `flow` when `name` is empty (`revision_diff.py`,
`name_of`; tested). This changes the registered pipeline after its
results were read, so the table above stands as the registered run
and the fallback's run is reported separately below.

### Measure 4 — recall on independent-real labels in models we hold

**Denominator before the round: 0.** The Kelso answer key and the
DGRI figures label a document's tie to a model, not a defect in a
cell; the registration counted them as independent-real lines and
they are, but they cannot enter a recall on defects. **After the
round: 0 of 1** — the GD3 wrong switch, found by hand, flagged by no
rule. The prediction (at or above 80% on a denominator under 30)
cannot be scored as registered; what can be said is that no held
model carries an independent cell-level defect label today, and the
one that exists now the engine misses.

What would create the denominator, named: a cell-level diff of a
draft→final pair — every changed cell, not the engine's flags — read
and graded by hand, so the label owes nothing to the rules; and the
Enron errors (48 rows, held, external) under the sweep the founder
paused.

### Measure 5 — cost

| | |
| --- | --- |
| PR24 pair (two ~414,000-formula models) | 3.4 min (16 pairs in 55 min, one process) |
| RIIO-3 business-plan pair (two ~600,000-formula models) | ~9 min (264 s + 273 s for ET3) |
| WACC pair | ~3.3 min |

Both predictions hold.

### Predictions, scored

- Registry seeds with under 30 independent-real lines on models we
  hold — holds, and more sharply than written: zero cell-level defect
  labels; two document-tie sets.
- RIIO-3 NEW between 5 and 60 — holds (36). At least eight of twelve
  genuine regressions — **wrong** (2); the revision added structure.
- PR24 NEW within ±5 for fourteen of sixteen — holds (15). All
  eleven verified regressions still found — seven checkable, seven
  found by the engine, five by the pipeline; four unnamed by the
  study — **partly wrong**, on the matcher.
- Recall on independent-real labels at or above 80% — **not
  scorable**; 0 of 1.
- Cost under six and twelve minutes — holds.

### What the round decides

1. **The registry exists, and its honest shape is: many external
   cells, a few dozen hand-verified lines, almost nothing
   independent.** Every future revision cycle adds to the middle
   grade; only a cell-level diff or an outside label adds to the
   first.
2. **« Regression » and « defect » are two questions.** The RIIO-3
   finals carry real hardcoded tax parameters, a placeholder row and
   an unsourced 6% — inside blocks that did not exist at draft. The
   Watch's « new since the version you trusted » is right for the
   customer; the truth set records the defect and the revision
   separately.
3. **Two matcher gaps, one fixed.** Column folds lost their name
   (fixed, re-run below); a header rename turns one persistent
   finding into NEW + FIXED (named, not fixed — the key carries the
   year prefix and the header, and both are the finding's real name).
4. **A rule the hand found and the engine lacks:** a row anchored on
   another row's switch (`$I$474` from row 472). Named for the
   backlog; not built here.
5. **The two reader questions of the patterns round stand** (year
   rows as labels; « carried forward » lines), plus one more from
   this round: the finding's name is empty on a column fold, which
   is the same gap as the matcher's, seen from the audit's side.

### Post hoc — the twenty pairs again, with the fold's label as its name

The deviation named under measure 3, run after the registered
results were read (`scratchpad/pr24_pairs_v2*.log`,
`riio_pairs_v2.log`). NEW per pair, registered run → fallback run:

| Pair | NEW before | NEW after | What moved |
| --- | --- | --- | --- |
| Affinity | 8 | 9 | — |
| Anglian | 2 | 2 | FIXED 1 → 2 |
| Hafren Dyfrdwy | 2 | 2 | UNMATCHED 12/12 → 6/6; PERSISTENT 3 → 9 |
| Northumbrian | 7 | 8 | |
| Portsmouth | 4 | 4 | |
| South West | 4 | **6** | the base-revenue fold now NEW |
| SES | 5 | 5 | |
| South East | 3 | 4 | |
| Southern | 4 | **5** | the base-revenue fold now NEW |
| South Staffs | 7 | 7 | |
| Severn Trent | 8 | 9 | its own base-revenue fold, not in the study, now NEW |
| Thames | 2 | 3 | |
| United Utilities | 6 | 7 | |
| Welsh | 2 | 2 | |
| Wessex | 7 | 8 | |
| Yorkshire | 43 | 43 | |
| **PR24 total** | **114** | **124** | |
| RIIO-3 ET3 | 11 | 11 | FIXED 6 → 9; UNMATCHED 7/10 → 4/10 |
| RIIO-3 GD3 | 10 | 10 | FIXED 8 → 11; UNMATCHED 9/10 → 6/10 |
| RIIO-3 GT3 | 14 | 14 | FIXED 5 → 8; UNMATCHED 7/9 → 4/9 |
| WACC | 1 | 1 | PERSISTENT 6 → 8; UNMATCHED 3/3 → 1/1 |

**Seven of seven named verified regressions now reach the pipeline
as NEW.** The ten PR24 findings the fallback adds are all column
folds that had no name; the RIIO-3 NEW counts do not move, and the
unnamed findings on both sides become FIXED or PERSISTENT instead of
falling out. Fifteen of sixteen PR24 pairs stay within ±5 of the
study (Northumbrian at +8). The twelve readings above were graded on
the registered run and are not re-graded.
