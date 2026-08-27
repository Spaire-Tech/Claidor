# Sentinel — lane log

Sentinel's running log, plain language, newest entries at the bottom.
Charter: `lanes.md`. Canon: `notes.md`. I am the only lane that may
change what the engine reports; every findings change runs the full
golden-master gate and regenerates the baseline in the same commit.

## 25 August 2026 — lane opened

- Read `notes.md`, then `lanes.md`, from the branch tip the lanes are
  based on (`claude/pierce-phase-6-writing-mjkaj6`). Created
  `swens/sentinel` from that tip, as the charter says. One note of
  record: this session was opened by the platform on an auto-named
  branch cut from `main`, which does not carry the A3/A7/A1 work; the
  charter and `lanes.md` both name the pierce branch's tip as the
  base, so that is the base. Said here so the deviation from the
  session's auto-branch is named, not silent.
- Environment: `uv sync` clean; engine imports; the 27-file AU-UK
  corpus rebuilt from the committed fetcher (all 27 fetched, sizes
  matching). Same shared 15GB container class the A1 record warns
  about: timings here are noise, findings are not.
- Started the precondition sweep of the unmodified engine (the gate
  must be green on this machine before any change lands, per the A7
  protocol's discipline). Heavy jobs run alone; nothing else heavy
  runs beside it.
- First task: A3 candidate 1, totals-row sibling disagreement.
  Registration written and committed before any result is computed:
  `a3-sibling-totals.md`, with the planting harness under
  `server/scripts/planting/`.

## 27 August 2026 — the serious-error mining round: blocked, on a reader defect

The lead's highest-value question — why our coverage of Tasi's
serious cells is 7.8% against 13.2% overall — got an answer, but not
the one the round was built to produce.

The classifier put **100% of the 1,206 missed cells into a single
bucket**. That is an instrument failing, not a finding, so I ran it
to ground rather than publishing it. The sample's first cells are
the ones the *first* mining round cites as computing `=AVERAGE(…)`;
the proof is arithmetic — `Table II.5!B17` holds exactly the mean of
`B6:B16`, and `read_workbook` returns `formula=None` for it.

**The engine's legacy `.xls` reader misses formulas**, partially:
144 `FORMULA` records against 125 seen in one subject, 40 against 30
in another, 349 against 349 in a third. On some `.xls` files a
computed cell is read as a typed value.

So: **blocked, not refused.** No bucket table, no candidate — the
numbers would describe the reader's blind spots rather than the
detectors' witnesses. But the round established something better
than its table would have been: **a first-order cause of the
serious-coverage gap is that the engine cannot read some of these
formulas at all.**

**Routed to the lead, because it is outside my paths.**
`polar/tieout/legacy.py` is not in Sentinel's list in `lanes.md`,
and fixing it changes what the engine reports on **every `.xls`
file** — a findings change on a file class the golden-master gate
does not cover, so it needs its own registered round and a decision
about which corpus certifies it. I have not touched it.

I also amended the Tasi record in the same breath: its
direct-`.xls` numbers understate the engine by an unmeasured
amount. That does not overturn its conclusions — the label-set
comparison never passed through the engine — but it turns the
refusal to read fresh-vs-frozen as drift into a named mechanism.

## 28 August 2026 — A4 adopted: the audit says what it walked

The plan's A4 — « every audit states what was checked, what was
not, and why ». I checked the code before designing and the gap was
narrower than it reads: the tie-out already has `Coverage`, the
analytics already have `tallies` and `abstentions`, the structure
layer has `unlocated`. Only the mechanical audit was mute, carrying
a raw cell count, so « this rule looked and found nothing » could
not be told from « this rule had nothing to look at ». That
sentence is the whole of A4, and it is now sayable.

The audit gained `tallies` and `abstentions` — same names, same
shapes as analytics, so the product meets one vocabulary. **Gate
clean**, which was the round's sharp criterion: a coverage counter
has no business changing what the engine reports, and it did not.
Hand-checked against two real models: every tally equals the file's
own count.

Three corrections made in the open before the gate, and I would
rather record them than have them look like design. **`broken-name`
is dropped** — the reader exposes no count of declared names, and a
tally of « 0 of 0 » on a file carrying 800 would be worse than
none; counting only the flagged ones is the numerator wearing a
hat. **The typed-over denominator became typed cells** rather than
cells-inside-runs, so the counter cannot disagree with the
detectors about what a run is. And **one registered abstention
reason turned out unreachable** — « this workbook has one sheet »,
since one sheet is one examination — so I removed it rather than
bend the population to make my own sentence fire.

**Catalogue: unchanged**, no rule added; nothing for Atelier.

**Routed to the lead:** the product cannot yet *show* the coverage,
and `schemas.py`/`service.py`/`endpoints.py` are Atelier's. The
request is written in `a4-coverage.md` and is small — the schema
shape already exists for the analytics summary. One difference is
named rather than borrowed silently: my inner key is `raised`, not
analytics' `clean`, because a folded finding can stand for many
cells and « total − raised » would overstate what was verified.

## 27 August 2026 — candidate 5 adopted: the unasked half of the range question

`skipped-cell` has always asked what a total left *out*. Nothing
asked what a range wrongly took *in* — I checked before designing
anything, and every mention of double counting in the engine was an
*exemption* protecting that check, never a detection. So the
question was genuinely unasked, and this round asks the half that
carries arithmetic consequence: a range that swallows a subtotal of
its own rows, counting them twice.

**13 of 13 planted defects caught, all by the new rule; gate clean,
so the corpus price is zero.** The prediction said the check would
be absent on these templates and it is — a published regulator
model that double-counted a subtotal would be a live defect in a
document with legal force, so finding none is the right answer, and
the check's worth is the 13 it caught when the defect was real.

The round's second class — a range spanning a *label* — I withdrew
**before computing anything**, because the reader does not elect
text cells at all: a detector on that surface cannot tell a label
from a blank, and blanks are ordinary layout. Withdrawn, not
refused; no number was computed for it. The planter then found zero
eligible sites for it too, which is the same limitation confirming
itself from the other side.

**Catalogue: 19 → 20** (14 audit + 6 analytic), named in the
registration before adoption and flagged here the same day —
Atelier's count-sensitive test needs the new number.

**For the lead, one case to route:** class 2 becomes possible only
if `Workbook.cells` carries text cells. That is frozen interface #1
in `lanes.md`, visible to every lane, and would move findings
engine-wide — so it needs a lead-approved interface bump and its own
registered round. I have not touched it.

## 27 August 2026 — the Tasi re-score: a second labeller, and a nesting

The engine met an independent expert labelling of the same 70 files
the CUSTODES benchmark uses. Registration and conventions committed
first; the engine frozen at the candidate-4 adoption and unchanged
throughout. Full record in `tasi-benchmark.md`.

The instrument validates itself: our scorer reproduces Tasi's own
published 82.9% / 75.2% exactly, and returns the same 283 covered
cells the 23 August run recorded. Coverage of today's engine:
**13.2%** of Tasi's 3,702 error cells, **22.2%** of CUSTODES's
1,974 smell cells.

Three things worth the founder's attention. **The two label sets
nest rather than conflict** — 99.4% of CUSTODES's cells are also
Tasi's, while Tasi marks 1,186 more on the same sheets, so on this
corpus « ground truth » is nearly scope-determined. **Their two
error classes partition our rules cleanly**: `skipped-cell` carries
formula-error (80 of 119), `typed-over-formula` carries
missing-formula (354 of 370), and each covers ~zero of the other.
And **my prediction was wrong three times of five**, all recorded:
serious-error coverage is *lower* than overall (7.8% vs 13.2%), the
fresh-vs-frozen gap is large rather than small, and the label sets
agree on a majority not a minority.

Two honest limits. This container's LibreOffice cannot load these
legacy files at all, so the round was amended before any number to
read the originals directly — which recovered the cell the CUSTODES
registration had written off as lost in conversion (1,974, the
paper's own figure), but also means fresh-vs-frozen confounds
engine change with reading route, so no drift conclusion is drawn.
And ExceLint's 2.2% recall here is a convention artefact — it
reports regions — not a verdict on the tool.

**Catalogue consequence: none** — this round changed no code.
**For the lead:** the serious-error gap (1,206 uncovered cells with
a ready-made sample) is the best-funded mining question the record
now holds.

## 27 August 2026 — candidate 4 adopted: the column direction, widened

Three rounds. Round 1 changed no code and measured what the engine
already catches down columns: 41 of 45 plants, with the misses
naming the island pass's left-formula history guard as a row-major
bias. Round 2 waived that guard for interior islands — and was
refused three ways: it admitted eight real hardcodes *and* sixteen
typed-zero template rows, the class the mining round rejected by
name. Round 3 carried candidate 2's identity guard inward (a cell
admitted only by the waiver must be neither 0 nor ±1): the zeros
vanished, the real finds stayed, and the gate now adds **12
findings in 5 files, none removed**.

What the engine can now say that it could not: FY2026's
lookup-period dates are typed into **both WACC models** where every
sibling row computes them; 646.26 and 919.70 sit in rows whose
neighbours all pull per-entity through `CHOOSE(m_identity, …)`; a
0.06 rate is typed into two passthrough interface columns. The
baseline is regenerated **in this commit**, its diff the review
artifact.

Round 3 was refused by its own letter (12 findings predicted as 8)
and adopted after examination: the four extra lines are cells round
2 already reported inside a fold, now reporting individually
because removing the zeros left three cells — below the fold's
four-adjacent threshold. Content right, presentation mispredicted;
both written in `a3-column-typed.md`.

**Catalogue consequence, per the lead's standing request: none.**
This round adds no rule — `typed-over-formula` already exists — so
the count stays 19 and Atelier has nothing to route this time.
**One open question for the lead:** the typed fold's four-adjacent
threshold now leaves three-cell rows unfolded; moving it would
touch baseline findings, so it needs its own registered round.

## 26 August 2026 — candidate 3: unmeasurable on this corpus, not shipped

Beat families, the mining round's stride-lattice candidate. The
detector was registered, implemented and pinned by six unit tests —
and then the planting harness found **zero eligible lattices in all
27 corpus files**, on the registered hosts and, under a committed
amendment, corpus-wide. The value/% and split-year beat layouts the
CUSTODES corpus is full of simply do not occur in these regulator
templates; they lay every series dense. Per the amendment's own
clause the round stopped: a catch rate this corpus cannot measure
is never satisfied vacuously, so `_typed_beats` stays in the
codebase behind its tests but is **not wired into the audit** — an
unmeasured check reports to nobody. The engine's reports are
unchanged from the candidate-2 adoption by construction (the diff
against that certified commit is purely additive, uncalled code —
verified, zero removed lines). Full record in `a3-beat-families.md`.

**For the lead:** the check becomes measurable when the corpus
grows strided layouts — the round-4 unseen corpus's general
spreadsheets, or a pilot's deal models. Wiring it then is one line
plus the full loop. Also honestly said: candidates 4 and 5 of the
mining round (column-direction typed-over, range-vs-block) remain;
the orders name candidate 3 then A4, so A4 is next unless the
orders re-order.

## 26 August 2026 — candidate 2 adopted; the round in one paragraph

Family-edge typed cells (`typed-over-edge`), two rounds. Round 1:
every planted tail caught engine-wide (15/15 — mostly by the island
pass seeing the cell from the column direction, which is the
registered dedup working), but the corpus price was ten findings
and all ten were typed 1s heading index series — correct base-period
authoring, hand-read at the cells — so the round refused itself, on
noise and on a criterion whose denominator its own dedup guard
contradicted (recorded as written, not argued away). Round 2,
registered first: the identity guard (0 or ±1 at an edge is
scaffolding or an index base), the horizontal seed guard (a stretch
that reads its typed cell is continuing from its own start), and
criterion 3 restated over the marginal denominator — the tails no
other rule catches, which is this rule's actual territory. Verdict:
gate clean, marginal recall 5 of 5, adopted. Baseline untouched —
no corpus report changed. Full record in `a3-family-edge.md`.
Atelier's category map owes `'typed-over-edge'` the same
« Probable formula defects » family as `typed-over-formula`, noted
here for the lead to route with the `inconsistent-total` entry.

Next per orders: A4, the coverage denominator on every report.
(Candidates 3–5 of the mining round — beat families, column
typed-over, range-vs-block — wait behind it unless the orders say
otherwise.)

## 26 August 2026 — standing arrangement confirmed: orders from the lead

The founder set the arrangement: at the start of every working turn
I fetch `origin/claude/pierce-phase-6-writing-mjkaj6` and read
`docs/pierce/orders/sentinel.md` — the lead's file, maintained at
every integration sweep — do what it says, push to `swens/sentinel`,
and stop; the founder's message will just be « go ». Confirmed here
as asked. Verified the mechanism exists: the lead's branch carries
orders for all five lanes, and mine match the work already in
flight (finish candidate 1's round 2 with the verdict and the
same-push baseline; then candidate 2; then A4; the collapse-fold
adjacency fix and A1 parked, A1 now ordered after A4). One standing
note so it is on the record: orders are the lead's tasking and I
follow them, and the charter, `lanes.md` and its hard rule keep
binding me over anything an orders file could say — if an order ever
crossed them (another lane's paths, a merge, a skipped gate), I
would write the case here and stop rather than comply silently.
That is how `lanes.md` says disagreements route, and it protects
the founder's own rules from a mistyped order.

## 26 August 2026 — candidate 1 adopted; the round in one paragraph

Round 1 caught the planted defects (46/49) but flooded the GT3
BPFMs with 20 noise findings on a designed depreciation triangle —
refused by its own criteria. Round 2 added the consequence guard
(a range disagreement must miss a live cell the consensus covers)
and the identical-deviant fold, both registered first: recall
identical, gate clean — every file reports as the baseline says,
finding for finding. Adopted. The baseline is untouched because no
corpus report changed; the check earns its keep on models whose
totals actually disagree, and stays quiet on these. Full record in
`a3-sibling-totals.md`.

Per the lead's orders, on adoption: **Atelier owes the web category
map** `'inconsistent-total' → 'Probable formula defects'` in
`clients/apps/web/src/components/Workspace/files.ts` (routed via
lanes.md; nothing breaks meanwhile — the finding files under the
fallback category).

Next per orders: A3 candidate 2 (family-edge typed cells), same
loop. Parked by orders: the collapse-fold adjacency round, A1 after
A4.

## 25 August 2026 — candidate 1 implemented behind its tests

- The detector (`_sibling_totals` in `audit.py`, rule
  `inconsistent-total`) implemented exactly as registered: SUM-only
  membership, coverage + surround signature, consensus of 3, deviants
  a strict minority, the four guards. Ten unit tests
  (`test_audit_sibling_totals.py`) cover the four planted shapes and
  the five silence cases; all pass. The corpus verdict — planted
  recall, false-positive price, gate diff — is still owed and comes
  next; nothing is claimed for the check yet.
- Tests, honestly: the tieout suite runs conftest-free here (the
  repo's root conftest cannot load on this container's Python 3.14
  release candidate — a pydantic `_eval_type` incompatibility). Six
  test files that import the API schemas fail at *collection* for
  the same environmental reason, unmodified tree and modified tree
  alike (verified by stashing my change and re-running). The 409
  engine-side tests that do collect — audit, shapes, structure,
  workbook, writer among them — pass with my change, plus the 10 new
  ones. `ruff` clean; `mypy` adds no new error over the two that
  pre-exist in `audit.py`.
- One case for another lane, parked here per the charter: the web
  workspace's category map (`clients/apps/web/src/components/
  Workspace/files.ts`, Atelier's) buckets rules into families and
  falls back to « Other findings » for unknown keys. If candidate 1
  is adopted, `'inconsistent-total': 'Probable formula defects'`
  belongs in that map — same family as `inconsistent-row` and
  `skipped-cell`. Nothing breaks without it; the finding just files
  under the fallback. For the lead to route when adoption lands.
