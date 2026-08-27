# The own-check period defect — the registered round

Proof 1A failed (`population-proof.md` § Results), and all three of
its criteria failed on one cause. This round fixes that cause.
Registered before any code is changed and before any result is
looked at.

## The defect, as the proof established it

`_own_checks` in `analytics.py` gathers **every numeric cell** of a
row whose label reads like a check, and treats each non-zero one as
the model's own verdict. It has no notion of which columns are
periods — even though `run_analytics(book, structure)` already
receives the structure, which knows each sheet's period axis.

On Kelso's and Newbattle's `ReportRatiosSA` the time axis starts at
**column H** (row 2: `G='period'`, `H='15/16: I'`, …). Column **E**
is where the model parks scalars — the same column holds
`Input checks:`, `Calc checks:`, `Accounting: IFRS - Financial
Asset` in rows 4–7. The covenant **breach level 1.15** and
**lockup level 1.1** sit there. Both were read as failing periods of
a check row whose actual series is zero from G onward: those
covenants pass everywhere.

Eight of Proof 1A's thirteen findings were this, on two models. It
is a false-alarm class the whole regulator corpus never surfaced,
because those models do not park scalars beside their period grid.

## The change (fixed now)

**One condition:** a check row's cells are judged **only where the
sheet's period axis says a period is**. Cells outside it are not the
model's verdict about a period and are never quoted as one.

**Fallbacks, fixed now, because a wrong fallback is how a fix
becomes a new blindness:**

1. If the structure layer has **no period axis for the sheet**, the
   pass behaves exactly as it does today — every numeric cell
   judged. A sheet whose axis we cannot read is not a sheet where
   we may silently stop checking; today's behaviour is the safe
   one, and this round does not widen the blind spot it inherits.
2. The zero-share and cell-count admissions (`ZERO_CELLS`,
   `ZERO_SHARE`) are computed on the **same restricted set** the
   verdict uses. Judging one population and admitting on another is
   how a threshold quietly changes meaning.
3. No threshold moves. No label rule moves. Nothing else in
   `analytics.py` is touched.

## What certifies this — the gate does not

**Stated plainly because it matters:** `scripts/corpus_gate.py`
calls `audit()` only. **The golden-master baseline does not contain
a single analytical finding**, so this change is invisible to the
gate that certifies every other round I run. A clean gate here would
prove nothing, and claiming it as certification would be
misleading. This round is certified differently:

1. **The AU-UK regulator corpus (27 files), analytics before and
   after.** These are the models the analytical checks were built
   and tuned on. **Criterion: no analytical finding may move.** If
   one does, the fix has reached beyond the defect and the round
   refuses.
2. **The SFT corpus (10 models), analytics before and after** — the
   population that exposed the defect. This is where change is
   expected, and it is fully specified in advance by Proof 1A's own
   adjudication:
   - the **8 false alarms** (Kelso and Newbattle,
     `ReportRatiosSA!E352/E353/E356/E357`) must **disappear**;
   - the **5 true breaks** (Inverurie's four `Check` rows at BG/AF,
     SNBTS's cash carry) must **remain, unchanged in wording**;
   - the **5 silent models** must stay silent;
   - Inverness's judgement call at the `FinClose` stub column: its
     fate is **not predicted** and is read by hand — `FinClose` is a
     labelled column of that sheet's own header row, so whether the
     axis admits it is a fact about the structure layer, not a
     preference of mine.
3. **Unit tests** pinning both directions: a threshold in a
   parameter column is not a finding; a genuine non-zero in a
   period column still is; and a sheet with no axis keeps today's
   behaviour.

## Adoption criteria (fixed now)

1. AU-UK analytics: **zero movement**. Any change refuses.
2. SFT analytics: exactly the 8 named false alarms gone, the 5
   named true breaks intact and identically worded, the 5 silent
   models still silent. Anything else is read by hand and must be
   explained before adoption, not after.
3. The conftest-free tieout tests stay green.
4. The golden-master gate is run anyway and must be clean — not as
   certification, but because a change to `analytics.py` that moved
   an *audit* finding would mean I had touched something I did not
   intend to.

## After adoption

**Proof 1A is re-run** under the same frozen conditions, at a new
named commit, and reported as a **second run** — the first run's
FAIL stands in the record exactly as taken. A re-run after a fix is
not a correction of the first result; it is a new measurement, and
the document will say so.

## Prediction (written before the change)

The AU-UK corpus does not move. The eight false alarms vanish. The
five true breaks stay. Inverness's `FinClose` finding **survives**,
because `FinClose` heads a column in the sheet's own header row and
I expect the period axis to include it — but I am genuinely unsure,
and that is why it is registered as read-by-hand rather than as a
prediction I could later claim to have made either way.

---

## Results (computed after the registration)

**SFT corpus (10 models) — exactly as specified in advance.**

| model | before | after | |
|---|---|---|---|
| kelso | 4 | **0** | the four false alarms gone |
| newbattle | 4 | **0** | the four false alarms gone |
| inverurie_foresterhill | 4 | 4 | true breaks, identically worded |
| snbts | 1 | 1 | true break, identically worded |
| inverness_college | 1 | 1 | survived |
| the five silent models | 0 | 0 | still silent |

All eight adjudicated false alarms are gone; not one of the five
true breaks moved. **Inverness's `FinClose` finding survived** —
registered as read-by-hand rather than predicted, and the answer is
that the period axis does admit that column. Recorded as the fact
it is, not as a prediction I could claim either way after the event.

**AU-UK regulator corpus (27 files) — zero movement.** 18 analytical
findings before, 18 after, no file changed. Criterion 1 met.

### A measurement I threw away, and why

The first AU-UK before/after diff was **void and is not the number
above**. Two independent faults, both mine:

1. Its baseline covered **19 of 27 files**, so eight models had no
   « before » entry and every finding of theirs would have read as
   a spurious addition — the diff appeared to show five files
   moving and findings going 2 → 18, which is an artefact of the
   missing denominator, not a result.
2. **I edited `analytics.py` while that baseline sweep was still
   running**, and stashed and popped the same file twice during the
   window while checking whether Scribe's test failures pre-existed.
   The file mtimes settle it: the baseline was still writing at
   18:46, after the fix was committed at 18:39:45. A sweep whose
   code state cannot be pinned down is not a baseline.

The baseline was re-run alone, on the pre-fix `analytics.py`
extracted explicitly from the commit before the fix (verified: the
old copy contains no restriction, the new one does), then the new
version restored. That re-run is the 18 above.

Recorded because a discarded measurement is part of the record, and
because the failure mode — mutating the code under a running
baseline — is one this lane should never repeat.

## Verdict: ADOPTED

1. AU-UK analytics: zero movement ✓
2. SFT analytics: the eight named false alarms gone, the five named
   true breaks intact and identically worded, the five silent
   models still silent ✓
3. Engine tests green — 168 across audit, analytics, structure,
   workbook and this round's three ✓
4. Golden-master gate: run as a tripwire, result recorded below ✓

**On the baseline:** `corpus-golden-master.json` is untouched, and
this round is the reason to say plainly why — it holds no analytical
finding at all, so there is nothing in it for an analytical change
to update.

**Next:** Proof 1A is re-run at a new named commit and reported as a
**second run**. The first run's FAIL stands in the record exactly as
taken; a re-run after a fix is a new measurement, not a correction.
