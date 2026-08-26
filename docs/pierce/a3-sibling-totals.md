# A3 candidate 1 — totals-row sibling disagreement: the registered round

The strongest candidate of the A3 mining round (`custodes-mining.md`,
verdict 1), through the loop the mining ordered: planted defects on
our own corpora first, catch rate and false-positive price measured,
gate at every step. Registered here before the detector is
implemented, before any plant is made, before any result is looked
at. The mining round's boundary travels with this document: the check
is justified by financial-model value — totals rows are the spine of
every financial model, and the engine's within-column analysis
structurally cannot see a disagreement *between* sibling totals —
never by any benchmark's score.

## The claim the check makes

In a row of same-function aggregations — each cell totalling its own
column — the siblings are one authoring decision dragged across, and
they should agree with each other after translation. A sibling that
disagrees is one of the mining round's four witnessed defect shapes:
an arithmetic plug (`=SUM(E10:E22)-1000` beside clean siblings), a
range off-by-one (`=SUM(L8:L29)` beside `=SUM(I7:I29)`), a
cross-column bleed (`=SUM(C6:D13)` beside `=SUM(E6:E13)`), or a
mis-dragged extra term (a stray `G34` inside column E's total). The
same claim, turned 90°, for a column of row-totals.

## The detector (fixed now, implemented after)

**Membership.** A cell belongs to a totals family when its formula is
an optional sign, one `SUM(...)` call, and an optional surround —
nothing else — where every argument is a same-sheet reference, the
argument columns include the cell's own column, every referenced row
is strictly above the cell, and at least one argument spans two or
more rows in the cell's own column. (Mirror, for the column
direction: arguments include the own row, columns strictly left…
transposed throughout.) `SUM` only in this round — every witnessed
miss in the mining sample was a `SUM`; other aggregation functions
wait for their own evidence.

**Signature.** Per member: the set of `(column offset from the cell,
absolute row)` cells its arguments cover, plus the *surround* — the
formula text outside the `SUM(...)` call, uppercased, whitespace
stripped, references rewritten to offsets from the holding cell,
numbers kept literal (a plug's value is the evidence, not noise to
erase).

**Family and deviants.** Members of one sheet row group into one
family. The consensus is the most common signature; it must hold
**at least 3** members, and the deviants must number **fewer than
the consensus** — a split family (3 vs 3) is two designs, not a
defect. Each deviant is judged alone and reported alone.

**Guards, each registered before any measurement:**

1. *Comparability.* A deviant's own-column rows must overlap at
   least half of the consensus's own-column rows — a total about a
   different block is not comparable, and stays silent.
2. *Block totals.* A deviant whose column span covers the columns of
   two or more consensus siblings is a summary of the family
   (`=SUM(C6:G22)` beside per-column totals), not a member
   disagreeing — silent. A bleed is one column beyond the cell's
   own, never a reach across the family.
3. *No double claim.* A deviant already reported by
   `inconsistent-row`, `inconsistent-anchoring` or `skipped-cell` at
   the same ref keeps that finding and is not reported again here.
   `hardcode-in-formula` is not in the dedup: a plug that is also an
   undocumented literal is two defects wearing one cell.
4. *No values.* Nothing in the check reads a cell's value — the
   never-match-on-values rule holds. The only number quoted is a
   constant in the deviant's own formula text.

**The finding.** Rule `inconsistent-total`, severity `error`, ref =
the deviant cell. Classes, decided from the signature difference:
same coverage with a different surround (the plug / extra-term
class), same surround with different rows (the range-disagreement
class), same surround with an extra column (the bleed class), both
different (a generic disagreement, quoted whole). The detail quotes
the deviant's formula and the consensus's, and says which part
disagrees. For a plug whose extra term is one constant, the finding
carries that constant as its figure — it is the amount by which the
total departs from its own range. New entries in `RULE_NAMES`
(« Totals that disagree with their siblings »), `HEADLINES`
(« Disagreeing totals »), a `plain_words` sentence, and a
`seen_by_rule` confidence in the elevation layer (0.9 — the family's
own agreement is the witness, and a family can be wrong together).

## The measurement (fixed now)

**Instrument and precondition.** The golden-master gate over the
27-file AU-UK corpus, rebuilt by the committed fetcher. The gate must
be green on the unmodified engine on this machine before the change
lands; the precondition run's verdict is recorded below. The
conftest-free tieout tests must stay green throughout.

**Planted recall.** The harness is
`server/scripts/planting/sibling_totals.py`, committed with this
registration. XML surgery on the xlsx zip (untouched cells keep
their cached values), one plant per family, no two plants sharing a
row or a column — the recall-v2 lessons, kept.

- *Hosts:* the three corpus files with the most eligible
  row-direction families among files under 400,000 cells, by the
  harness's own eligibility scan (`--scan`), ties broken by name.
  The scan reads formulas and counts families; it reads no finding.
  An eligible family has **4+** members sharing one signature with
  an empty surround, so a planted deviant leaves 3 to testify.
- *Classes and sites:* up to 5 families per class per host, drawn
  with seed **20260825** from the eligible families in (sheet, row,
  column) sort order: **plug** (append `-` then a seeded pick from
  {250, 1000, 3100, 47500} — 1000 kept in the set deliberately: it
  is on the literal check's INNOCENT list, which is exactly why the
  sibling witness has to catch it), **off-by-one** (the range's
  start row moved down one, so the total misses its own head — the
  blind spot round 4 named and deferred), **bleed** (the range
  widened one column toward the sheet's interior), **mis-drag**
  (append `+` then a same-sheet cell two columns away, seeded row
  from inside the summed span, live in the file).
- *Ground truth* (host, class, ref, before, after) is written by the
  harness before the engine sees any planted file. One planting run
  per host — no re-rolls.
- *Caught* means the finding's ref is the planted cell or the
  planted cell is in a finding's roster; reported per class as
  caught-by-any-rule and caught-by-`inconsistent-total`. Collateral
  — findings on a planted file at neither a planted site nor in the
  host's unplanted report — is counted and read.

**False-positive price.** The full 27-file sweep with the detector
live, diffed against the baseline. Every line of the diff is read by
hand. The price is the number of new findings on the *unplanted*
corpus, with a verdict per finding: **worth showing** (a banker
would act on it or want it in the appendix) or **noise** (they would
resent it), each with the sentence saying why, written from the
cells.

## Adoption criteria (fixed now)

1. The gate diff contains only `inconsistent-total` additions. Any
   existing finding that moves — vanishes, changes wording, changes
   figure — refuses the round, whatever else is true.
2. Every new finding is hand-read. Adoption needs at least
   two-thirds of them judged worth showing, and no single file
   gaining more than 5 — a flood means the check needs a fold or an
   exemption before it ships, which is a new registered round, not a
   quiet edit.
3. Planted recall is reported per class with no promised bar — but a
   check that catches nothing it was built for does not ship: at
   least the plug class must catch a majority of its plants.
4. The tieout tests stay green. On adoption the baseline is
   regenerated and committed **in the same commit** as the detector;
   the baseline's git diff is the review artifact. On refusal the
   detector does not land, and the refusal is written here with the
   evidence.

## Prediction (written before running)

Plugs, bleeds and mis-drags are caught by `inconsistent-total`
wherever 3 clean siblings survive the plant; off-by-one likewise —
`skipped-cell` cannot see a head narrowing, so the new rule is the
only witness for that class. On the unplanted corpus the check stays
quiet: single-digit new findings across all 27 files, because these
are disciplined regulator templates whose totals rows are dragged in
one gesture. No existing finding moves, because the detector only
adds. If the quiet prediction is wrong, the hand reading decides —
per the criteria, not per the hope.

---

## Results (appended after the registration, never edited into it)

**Precondition (25 Aug): gate clean.** The unmodified engine's fresh
sweep of the rebuilt 27-file corpus reports identically to the
committed baseline, finding for finding, on this machine. The
detector was implemented behind its unit tests while this sweep ran
(the sweep process had already imported the unmodified engine, so
the measurement is of the engine the baseline describes); the
after-sweep with the detector live comes next.

**Hosts, by the registered rule (25 Aug):** the scan ranked
`caa_h7/h7_pcm_v2-10_final_proposals.xlsm` (201 eligible families),
`caa_h7/h7_pcm_v2-11_final_determination.xlsm` (201) and
`ofgem_riio3/draft/DRAFT_GT3 PCFM_Jun25.xlsx` (140). Two hosts are
near-twin versions of one CAA model — less diverse than a free
choice would pick, but the selection rule was registered first and
it stands, said openly rather than re-rolled.

**Planted recall (25 Aug):** 49 defects planted of 60 drawn (11
draws refused by the harness's shared-master/array guard — a plant
there would have changed more cells than the one planted). Caught
means ref or roster, per the registration.

| class | planted | caught (any rule) | by inconsistent-total |
|---|---|---|---|
| plug | 11 | 11 | 9 |
| mis-drag | 12 | 12 | 11 |
| bleed | 15 | 15 | 3 |
| off-by-one | 11 | 8 | 3 |
| **overall** | **49** | **46 (94%)** | **26** |

The adoption criterion on plugs is met by the new rule alone (9/11).
Where another rule's name appears, the registered no-double-claim
dedup is working as written: in these templates many totals rows are
also contiguous runs, so the row passes (`inconsistent-row`, mostly
the mutation witness) claim the deviant first, and several bleeds
into a dependent column surfaced as genuine planted circularity the
engine also reported. The three misses, run to ground:

- `NonCore!AO86` (GT3, off-by-one): the plant collapsed
  `=SUM(AO84:AO85)` to `=SUM(AO85:AO85)` — a single-row range, which
  the registered membership excludes (no multi-row own-column
  range), so the deviant fell out of the family entirely. The
  registration's own boundary, not a detector bug: a two-row total
  narrowed by one is invisible to this round's rule. Named for a
  future round rather than patched mid-measurement.
- `C_Capex!AL463` (both H7 twins, off-by-one, deterministic): run to
  ground against the planted file. The row pass **did** catch it —
  `inconsistent-row` at AL463, pre-collapse — and the sibling check
  correctly deferred per the no-double-claim guard. The collapse
  layer then buried it: the fill fold groups findings by (sheet,
  rule, shape) with no adjacency test, so the two planted deviants
  at AN315 and AL463 — same relative shape `SUM` of the two rows
  above, 148 rows apart — folded into one finding anchored at AN315
  reading « filled across 2 cells », with no roster carrying AL463.
  Scored MISS by the registered criterion, honestly; the defect the
  score points at is the fold's missing adjacency, which is engine
  work for its own registered round, not a quiet patch inside this
  one.

---

## Round-1 verdict (25 Aug): REFUSED, by the registration's own criteria

The after-sweep differs from the baseline in two files, both gaining
**10** `inconsistent-total` findings — over the registered flood line
of 5 — and the hand reading judges all 20 noise. The cells: the
« Depreciation of additions from year end » block of the GT3 BPFM's
SystemOperator sheet (draft row 816, final row 817) is a
depreciation **triangle** — each addition-year row's entries begin
at that year's diagonal column — and the totals row carries two
spellings: columns L–AO sum rows 788–811, columns AP–AY sum
788–816. Verified against the cells: every populated cell in every
column lies inside its own column's summed range; the later columns
*need* the wider range (rows 812–816 hold entries only from AV on),
and the earlier columns' narrower range skips only empty rows. Two
range spellings, one correct staircase, no live cell missed — and
the check reported the design ten times per file.

Two lessons, each becoming a registered change:

1. The disagreement that matters is the one with a consequence. A
   deviant whose range differs only over cells that are *empty in
   its own line* computes the same total its siblings' spelling
   would; the triangle is exactly that.
2. Ten identical deviants are one authoring decision, and reporting
   a decision once is the collapse discipline this engine already
   lives by.

## Round 2, registered now, before it is measured

Two changes to the detector, nothing else:

1. **The consequence guard**, on the range-disagreement class only:
   translate the consensus range to the deviant's own line; report
   only when the deviant **misses a live cell that the consensus
   spelling covers** (a cell present in the book, in the deviant's
   own line — occupancy, not values). A deviant that only
   *over-reaches* — covers live cells the consensus does not — stays
   silent this round: the triangle proves over-reach is how designed
   staircases spell their totals, and a static check cannot tell
   that from a double-count without structure this round does not
   have. Named as a limitation, in the open. Plug, mis-drag and
   bleed classes are untouched — arithmetic outside the SUM and a
   reach into a neighbouring line carry their consequence in the
   formula text itself.
2. **The identical-deviant fold**: deviants of one family sharing
   one signature are one authoring decision — one finding, anchored
   on the first, every cell in the roster, the count in the
   sentence.

**Prediction (written before running):** the 20 triangle findings
vanish and the gate diff against the baseline is empty — the check
ships quiet on this corpus, which is the product's own discipline;
its value is proven by the planted recall, not by chatter. Planted
recall re-measured on the same planted files: plug, mis-drag and
bleed unchanged; an off-by-one plant whose excluded head row is
empty in its column would now be silenced by its own guard — any
off-by-one drop is read by hand and reported. The adoption criteria
are unchanged from the registration. Any other corpus difference
refuses round 2 the same way round 1 was refused.

---

## Round-2 verdict (26 Aug): ADOPTED — the prediction held exactly

**Planted recall, re-measured on the same planted files:** identical
to round 1, finding for finding — 46 of 49 caught, plugs 9/11 by
`inconsistent-total` alone, the same three explained misses. The
consequence guard cost nothing on the plants.

**The decisive sweep: gate clean.** All 27 files report identically
to the committed baseline, finding for finding. The 20 triangle
findings are gone; nothing else moved; no new finding appeared.

Against the registered criteria: (1) no existing finding moved —
the diff is empty; (2) zero new corpus findings to judge — no flood,
nothing to hand-read; (3) the plug class is caught by the new rule
alone, 9 of 11; (4) the conftest-free tieout tests are green (413
passing, plus the 14 check tests). **Adopted.** The check ships
quiet on this corpus — the quietness is the product — and its value
is the planted recall: on a model whose totals rows genuinely
disagree, the four mining shapes are caught, by this rule where the
row passes cannot see them and by the row passes where they can.

**On the baseline:** adoption changes no report on this corpus, so
`corpus-golden-master.json` is untouched — there is no findings
change to regenerate it for, and a timings-only rewrite would be
churn pretending to be review. The same-commit rule binds the day a
corpus report actually moves.

**Carried forward, named:** the over-reach limitation (a range
disagreement that only widens over live cells stays silent — the
triangle's spelling); single-row deviant ranges fall out of
membership; the collapse fold's missing adjacency test (the
C_Capex diagnosis) is its own registered round, parked by the
lead's orders; `SUM` only until another function earns its
evidence.
