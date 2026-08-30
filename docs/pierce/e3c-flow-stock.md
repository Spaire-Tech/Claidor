# E3c — the flagship finding, third attempt: judge a row against itself

**Registered before any code was written or any result looked at.**
This is the successor design the previous round specified in its own
post-mortem, built by the lead after the lanes were stood down.

## The question, unchanged since the plan

`swens.md` § 3a names it as the class that survives every other check:
« a formula that adds a monthly figure to an annual one is a perfectly
valid formula. It is only wrong in meaning. » `swens-plan.md` E3 makes
it the flagship demo finding, and the fourth amendment puts units at
the top of the holes.

## Two attempts died first, and both post-mortems are the design

**Attempt 1 — read the words.** `period` in the units inference. Killed
by vocabulary, not accuracy: the inference's whole period vocabulary is
`annual`, `point-in-time`, `none`, `unknown`, and **the word « month »
does not occur in `units/inference.py` at all**. « Monthly in an annual
line » is not inaccurate there, it is inexpressible (`e3b-period-granularity.md`).

**Attempt 2 — read the formulas, then read the values.** Kelso ships
470,594 values and 814 formulas, so the formula path died on it. The
values path — « if an annual value equals the sum of twelve monthly
values, that *is* the aggregation » — then failed **its own registered
coincidence control**:

| prediction | outcome |
|---|---|
| 1 — a row aggregates across ≥ 6 periods | 655 rows did |
| 2 — zero defects on clean Kelso | **failed: 65 reported** |
| 3 — a planted defect is caught | not run |
| 4 — **the coincidence control** | **failed: 503 of 655, 77%** |

Two causes, both named at the time:

1. **Most rows are mostly zeros, and zero aggregates with zero.**
   `0 = 0 + 0 + …` holds for forty periods, so any sparse row pairs
   with any other sparse row. The six-period bar measured nothing.
2. **The 65 « defects » were all stocks** — retained earnings, MRA,
   cash at bank, deferred tax. **A closing balance is not the sum of
   twelve months.** The check demanded `coarse = sum(fine)` of rows
   that never obey it and never should.

## The successor, and it is about what a row *is*

Not a threshold change. Two corrections:

1. **A row must actually vary.** The same triviality rule
   `recalc/mine.py` already applies to mined relations: a series whose
   relative spread is at or below `FROZEN_SPREAD` is arithmetic about
   constants, not a fact about the model. Applied to both series of a
   pair, this removes every zero-with-zero match.
2. **Each row declares whether it is a flow or a stock, from its own
   behaviour.** A **flow** satisfies `coarse = sum(fine)` — revenue,
   opex, interest paid. A **stock** satisfies `coarse = last(fine)` —
   any closing balance. Both are tested across all periods and the row
   is whichever it obeys.

**Then a defect is a break in the row's own established pattern**: a
flow row that takes one month where it takes twelve everywhere else,
or a stock row that suddenly sums. The row is judged against itself,
not against an assumption about what rows do.

This also fixes the sentence. « Your closing cash does not equal the
sum of its months » is wrong and a banker knows it instantly. « This
row sums its twelve months in every year but 2031, where it takes
March alone » is a finding.

## Definitions, fixed now

- **A row varies** when `(max − min) / max(|values|) > FROZEN_SPREAD`
  (1e-12), the rule already in `recalc/mine.py`. Both the fine and the
  coarse series must vary.
- **A flow period** matches when `coarse[i] == sum(fine[i·r : (i+1)·r])`
  at the lane's standing tolerance (relative 1e-9, floor 1e-12).
- **A stock period** matches when `coarse[i] == fine[(i+1)·r − 1]` — the
  last fine value in the window — at the same tolerance.
- **A row's kind** is whichever it matches in **strictly more** periods,
  and only when that kind matches at least `MIN_PERIODS` (6). A tie is
  no kind, and no kind is no finding.
- **A defect** is a period that breaks the row's established kind **and**
  equals a single fine cell in its window. A period that matches neither
  the kind nor a single cell is `unexplained` and is **not** a finding —
  it is reported as coverage.

## Criteria — the previous round's bar, verbatim and unmoved

> **The bar does not move**: the shuffle control runs again, and unless
> mismatched pairs fall to near zero the line of attack is dead and I
> will report it dead.

« Near zero » was not given a number, so one is fixed here **before the
run**, erring strict:

1. **The coincidence control.** Rows paired with deliberately wrong
   partners must produce **at most 5% as many aggregating rows as the
   real pairing**. Above that, the design is dead and this document
   says so. (Previous round: 77%.)
2. **Zero unexplained defects on clean Kelso**, and **every** defect
   reported is hand-read at the cells before it is called anything.
   Kelso is a control, not a hunting ground.
3. **Planted recall, reported against its scope.** One year of a flow
   row's coarse value is overwritten with one month's value; the check
   must name that row and that year. The number of plantable sites is
   reported alongside the ratio — a recall of 1/1 on a scope of 1 shows
   the mechanism connects and nothing more, and is not to be quoted as
   more.
4. **No existing finding may move**, in wording or presence, and the
   full golden-master gate runs before anything is wired into `audit()`.
5. **The sentence must be one a banker would repeat.** Judged, not
   measured, and written into the round so it is judged rather than
   assumed.

## Predictions, written before the run

- **The control will pass.** Requiring both series to vary should
  eliminate the sparse-row coincidence entirely, because the failure
  mode was arithmetic on zeros and nothing else.
- **Prediction 2 is the one at risk.** Stocks are now classified rather
  than mis-flagged, so the 65 should disappear — but I expect a
  residue of rows that are neither clean flows nor clean stocks
  (part-period rows, rows restated mid-model, rows whose fine and
  coarse blocks do not start on the same date). If that residue is not
  small, this refuses like the two before it.
- **Block alignment is where I expect to be wrong first.** The window
  arithmetic assumes coarse period *i* covers fine periods
  `i·r … (i+1)·r − 1`. Two blocks whose first columns are not the same
  date break that silently, and nothing currently checks it.

---

# Results — round 1, 28 August 2026

**Status: criterion 1 PASSED, criterion 2 NOT MET. Nothing is wired
into `audit()` and the golden master is untouched.**

| criterion | bar | result |
| --- | --- | --- |
| 1 — coincidence control | ≤ 5% | **0.0%** (0 of 63) — **PASS** |
| 2 — zero defects on clean Kelso | 0 | **2** — **NOT MET** |
| 3 — planted recall | against scope | scope measured: **42 sites**; recall not run |
| 4 — no finding moves, full gate | — | not reached; nothing wired |

## The control, and how it moved

| design | shuffled vs real |
| --- | --- |
| Previous round (sum-only, no variance rule) | **77%** — died of it |
| This design, first run | 8.8% — **failed my own 5% bar** |
| This design, corrected control | 3.9% |
| This design, after the three corrections below | **0.0%** |

**The bar never moved.** It was 5% before the first run and it is 5%
now. What moved was the design, and once the instrument itself was
found to be broken, the instrument.

### The control was measuring the wrong thing, and it inflated its own failure

**A block-pair sharing exactly one label cannot be shuffled.** A
one-element list has one permutation, so `partner == label` and the
« deliberately mismatched » run silently measured the *real* pairing.
Kelso has 35 such pairs and they supplied **16 of the 28 apparent
shuffled survivors** — more than half the control's number was the
real pairing wearing a control's name.

Such pairs are now excluded from **both sides** of the ratio. Dropping
them from the shuffled count alone would be precisely the tuning this
round exists to avoid: they carry no evidence in either direction,
because there is no alternative partner to mismatch them against.

**This flaw was inherited from the previous round's script, so that
round's 77% was also inflated.** It failed by fifteen times its bar
either way, so its verdict stands — but the number was wrong and is
corrected here rather than left standing.

## The ten defects, hand-read at the cells, and all ten false

Criterion 2 required every defect hand-read before being called
anything. All ten were. **All ten were false alarms**, with three
distinct causes — every one a category error, not a threshold:

**(a) Zero periods voted for every reading.** A window of zeros
satisfies `sum`, `first` and `last` at once. Those periods decided
nothing and still counted, which is how « cash bank **carried
forward** » — a balance by its own name — came to be classified as a
flow, on a margin made of zeros. *Correction: a period votes only when
the readings actually disagree.*

**(b) The defect test matched zero against zero.** « This period took
one fine cell » was satisfied by a coarse 0.0 sitting beside a window
containing 0.0. `spv admin costs` and `equity bridge facility` were
both reported for taking « one month » where the month was 0.0 and so
was the year. *Correction: both ends must be real numbers.*

**(c) Opening balances were judged as closing ones.** `bal b f` is a
**brought-forward** balance: it carries the **first** value of its
window, not the last. Judging it by `last` made every b/f row look
broken. *Correction: three readings — flow, opening, closing — and the
row's behaviour picks one. Still no header word is read; « b/f » is
never matched as text.*

After the three: **10 defects → 2, and the control fell to 0.0%.**

## The two that remain, and why criterion 2 is not met

Both are the same row: `cash bank` (`ReportFinStatsSA!83 →
ReportFinStatsAnnual!82`) and `cash bank carried forward`
(`!200 → !200`) hold **identical values**. Hand-read at the cells:

| year | annual | halves | sum | last |
| --- | --- | --- | --- | --- |
| 2 | 33.6438 | 0, 33.644 | 33.6438 | 33.6438 |
| **3** | **6.8184** | **16.299, 6.818** | **23.1175** | **6.8184** |

The row sums its halves in 25 discriminating periods and in year 3
takes the second half alone. That is exactly the flagship shape — and
**I cannot certify from arithmetic alone whether it is a defect or a
convention I do not understand**, so it is not being called either.

Two things are certain and both are mine:

1. **Criterion 2 is not met.** Kelso is a control, and a control with
   two findings on it has not been passed. Saying « only two, and they
   look plausible » would be exactly the tuning-by-narrative this round
   was written to prevent.
2. **One authoring decision is being reported twice.** Two identical
   rows on two sheets are one decision, and `swens.md`'s first
   non-negotiable principle says so. The collapse discipline every
   other rule in the engine obeys has not been applied here.

## What is next, and what it is not

Not adoption. In order: collapse identical rows to one finding;
resolve the `cash bank` row against the model itself rather than
against its arithmetic; then criterion 3's planted recall against the
42-site scope; then the gate.

**And a limit worth stating now: this is one model.** Kelso is a
control, not a corpus. Whatever this check becomes, its false-positive
price is unknown until it runs across the closed-deal set, and the
number from one file is not the number.

---

# Criterion 1, restated and re-measured — 28 August, after the research round

**The criterion I registered was incoherent, and the proof is
arithmetic rather than opinion.** The founder's research round
established two facts about the method, both independent of any result
of ours:

1. **A ratio of two counts is not a false-match rate.** I scored
   « shuffled patterns ÷ real patterns ». A rate needs the pairs
   *examined* as its denominator, and a claim about it needs an exact
   bound. With zero matches in `d` pairs the one-sided 95% upper bound
   is `1 − 0.05^(1/d)`: **59 pairs are needed before « under 5% » can
   be claimed at all**, and 0 of 2 is consistent with a true rate of
   **77.6%**.
2. **Below four rows the question is not askable.** A permutation test
   on `n` rows has `n!` arrangements, so the smallest reachable
   p-value is `1/n!` — **0.5 at n = 2**, 0.167 at n = 3. The two-row
   models I reported as failures cannot reach the bar however clean
   they are. « Not measurable » is a third outcome and I did not have
   one.

And a consequence for what I reported: if the true rate were a healthy
2%, the chance that at least one of sixteen small samples breaches 5%
is roughly 48–96%. **One model over the line is the expected outcome of
scoring sixteen tiny samples separately.** That is what I saw, and what
I called a failure.

**This is a correction to my criteria, not to the check, and it is not
a loosening.** Pooled with an exact bound the claim is *harder* to
make: it requires 59 clean pairs rather than a favourable ratio on
whatever sample a model happens to offer. Stated before the number was
computed, so the direction cannot be read backwards from the result.

## The pooled measurement

Across all 22 closed-deal models, mismatched pairs **examined**, not
patterns compared with patterns:

| | |
| --- | --- |
| mismatched pairs examined | **10,827** |
| of those, still patterned | **30** |
| point estimate | **0.277%** |
| 95% upper bound (Clopper–Pearson, exact) | **0.376%** |
| pairs needed to claim « under 5% » | 59 — we have 10,827 |

**CRITERION 1: PASS.** The true false-match rate is under 0.4% at 95%
confidence, against a 5% bar, on a sample 183 times the minimum.

Per-model counts are reported for transparency in
`scripts/e3c_pooled.py`'s output and **no per-model verdict is issued**,
because that unit is what produced the error above.

### The three « failures » I reported, corrected

| model | what I reported | false-match rate, measured |
| --- | --- | --- |
| barrhead | 5.6% — FAIL | **10 of 1,430 = 0.70%** |
| glasgow_college | 50% | 1 of 40 = 2.5% |
| inverness_college | 150% | 3 of 910 = 0.33% |

Inverness, which I reported at **150%**, has a true rate of a third of
one per cent. The two numbers were never measuring the same thing.

### A bug in the instrument that computed this

`upper_bound` returned the **point estimate** whenever `matches > 0`,
under a label reading « 95% upper bound ». Written that way to avoid
inventing a bound, it invented a worse thing: a number that understates
uncertainty while claiming to bound it. Caught by computing the bound
by hand and finding it did not match what the script printed. Now
exact Clopper–Pearson by bisection, and verified against the research
round's own three published values: 30/10,827 → 0.376%, 0/59 → 4.95%,
0/2 → 77.6%. All three reproduce.

## Where the round now stands

| criterion | bar | result |
| --- | --- | --- |
| 1 — coincidence control | ≤ 5% | **0.376% upper bound — PASS** |
| 2 — defects on clean models | 0 | **open** — 27 reports across 16 models, not yet hand-read |
| 3 — planted recall | against scope | not run; 42 sites on Kelso |
| 4 — no finding moves, full gate | — | not reached; nothing wired |

**Criterion 2 is now the whole question**, and it is the one that
cannot be rescued by a better statistic: it asks whether the findings
are *right*, and the only instrument for that is reading them at the
cells.

---

# Criterion 2 — all 27 hand-read, and the correction registered before it was written

## 27 reports are 6 findings

The collapse earns its place immediately. Barrhead reports the same
`days in period` row against **eleven** partner sheets; folded, it is
one decision.

| model | reports | findings |
| --- | --- | --- |
| kelso | 2 | **1** |
| levenmouth | 1 | **1** |
| barrhead | 12 | **2** |
| our_lady_st_patricks | 12 | **2** |
| **total** | **27** | **6** |

## All six read at the cells

**Five of the six are one class, and it is not money.**

| finding | break | window | departure |
| --- | --- | --- | --- |
| barrhead `days in period` | 182 | [182, 183] | 0.5% |
| barrhead `days in year` | 365 | [366, 365] | 0.3% |
| our_lady `days in period` | 182 | [182, 183] | 0.5% |
| our_lady `days in year` | 365 | [366, 365] | 0.3% |
| levenmouth `days in ops phase period` | 182 | [183 ×5, 182] | 0.5% |
| **kelso `cash bank`** | **6.8184** | **[16.299, 6.818]** | **70%** |

The five are **calendar rows** — day counts per period. They are
neither flows nor stocks: they are properties of the time axis itself,
and their « breaks » are which half-year carries the extra day and
which years are leap years. **Every one departs from its pattern by
about half of one per cent.**

Kelso's `cash bank` departs by **70%**, and it is the only one of the
six with the shape the check exists to find.

## The correction, registered before any code

**A break must be a material departure from what the row's own pattern
predicts.** This is not a threshold on the *values* — it is the claim
the finding makes, stated arithmetically:

> This period took one cell where it takes the whole window everywhere
> else.

If a row's cells are roughly equal, taking one of `r` instead of the
sum departs by `(r − 1) / r` — **50% at a 2:1 ratio, 92% at 12:1.**
That is the smallest departure a genuine instance of this defect can
produce. A calendar row's one-day slip is bounded by `1 / 182` ≈
**0.5%**.

Two orders of magnitude separate them, so any line inside that gap says
the same thing. **The bar is fixed now at 10%** — twenty times calendar
noise, five times below the smallest genuine case, and round.

This is a category correction, not a loosening: a departure of half a
per cent was never the defect being claimed, and reporting one said
something the check does not mean. Registered here before the code, and
the re-measurement follows below whatever it says.

**Prediction, on the record:** the five calendar rows go, Kelso's
`cash bank` stays, and criterion 2 lands at **one finding on sixteen
clean models** — which is not zero, and whether one unresolvable
finding across a whole corpus passes a bar written as « zero » is a
judgement I will put to the founder rather than decide by adjusting the
bar again.

---

# Criteria 2 and 3, measured

## Criterion 2 — the corpus re-swept

The prediction registered before the materiality rule was written held
exactly:

| | across all 22 models |
| --- | --- |
| patterned rows examined | 864 |
| defect reports **before** | 27, across 4 models |
| defect reports **after** | **2**, across 1 model |
| findings after folding | **1** |

Every calendar row is gone. `cash bank` on Kelso is the only survivor —
the one of the six with the shape the check exists to find.

**Criterion 2 stands at one finding across sixteen models with
patterned rows, against a bar written as zero.** Not passed, and not
adjusted. See the judgement below.

## Criterion 3 — planted recall, against a real scope

One coarse period of each clean flow row overwritten with a single fine
cell's value, planted **in the cells the reader produced** and the whole
detection path re-run, then reverted.

| model | caught | sites |
| --- | --- | --- |
| kelso | 41 | 42 |
| dalbeattie | 42 | 43 |
| largs | 40 | 42 |
| dumfries | 42 | 51 |
| **total** | **165** | **178** |

**92.7% on a scope of 178.** The previous attempt could report only
1 of 1 on a scope of 1, which showed the mechanism connected and
nothing more. This is a rate.

**The 13 misses cluster, and the cluster is informative.** Nine of the
thirteen are on Dumfries and three of those are at the same period
index (21) — `creditors increase decrease`, `financing fees`,
`transfers into cash buffer` — with the fourth model's single miss at
period 20. That is not thirteen independent failures; it is a
structural blind spot at a particular position in a particular model's
axis, and it is the obvious next thing to read at the cells. **It is
not read yet, and 92.7% is reported without an explanation for its
remainder.**

---

# The judgement this round cannot make for itself

Three criteria measured:

| criterion | bar | result |
| --- | --- | --- |
| 1 — coincidence control | ≤ 5% | **0.376%** (30 of 10,827) — PASS |
| 2 — defects on clean models | **0** | **1** finding across 16 models |
| 3 — planted recall | vs scope | **92.7%**, scope 178 |
| 4 — no finding moves, full gate | — | pending |

**Criterion 2 is one finding short of its bar**, and the whole round
turns on whether that is a pass.

**The case for adopting.** One finding across sixteen real close models
is a false-positive rate no other check in this engine has had to beat.
The finding that remains has the exact shape the check exists to
find — a flow row that sums its halves in 25 periods and takes one half
in the twenty-sixth — and it may well be true, in which case the
denominator is not sixteen clean models with one false alarm but
sixteen models with one *finding*. Recall is 92.7% on a scope of 178.

**The case against.** The bar was written as zero and it is one.
`cash bank` is unresolved: I could not certify it either way from
arithmetic, and « probably real » is the sentence every flood in this
project's history began with. Kelso is a control, not a hunting
ground, and finding something on a control is what a control is for.
Two criteria have already been corrected this round; both corrections
were arithmetic and one made the bar harder, but a third — on a
judgement rather than a proof — is how a bar becomes whatever the
result needed.

**Held for the founder.** Nothing is wired into `audit()`, the
catalogue is unchanged at 20 rules, and the golden master is untouched.

**What would settle it without a judgement call:** resolving `cash
bank` against the Kelso model itself rather than its arithmetic. If it
is a real defect the round passes on the evidence; if it is a
convention, the check has a sixth false-alarm class to name and the
bar is met literally. That is a reading task, and it is the honest
next step rather than a decision.

---

# The round, complete — all four criteria on one version of the check

Every number below comes from the same code. The earlier sections
record how it got here, including two criteria I had to correct and
three false-alarm classes I had to find.

| criterion | bar | result | |
| --- | --- | --- | --- |
| 1 — coincidence control | ≤ 5% | **0.33%** — 26 of 10,827 mismatched pairs, exact 95% bound | **PASS** |
| 2 — defects on clean models | 0 | **0** across 22 models and 855 patterned rows | **PASS** |
| 3 — planted recall | vs scope | **92.7%** — 165 of 178 sites | **measured** |
| 4 — no finding moves, full gate | — | **gate clean, 27 of 27**, finding for finding; 1,154 tests pass | **PASS** |

## What each number is worth, and what it is not

**Criterion 2 passing at zero is the weakest of the three**, and the
E3a round already named the trap: « if both fire zero times on the
whole corpus, the round's result is *armed, correct, and silent here*
— which is a pass on the false-positive criterion and **not** evidence
the check works. » Zero false alarms is trivially achievable by
detecting nothing.

**Criterion 3 is what carries the round.** 165 of 178 planted defects
caught, each one a coarse period overwritten with a single fine cell's
value, planted in the reader's own cells with the whole detection path
re-run. The scope is reported because a rate without one is a story:
the previous design could offer 1 of 1 on a scope of 1.

**And recall did not move when the false alarms went.** Before the
dust rule: 165 of 178. After: 165 of 178, the same thirteen misses.
That is the result worth trusting — the corrections removed false
alarms without trading away detection, which is the trade this round
was most at risk of making silently.

## The 13 misses, unexplained and reported as such

Nine are on Dumfries and three of those share a period index (21);
Largs's single miss sits at 20. **That is a structural blind spot at a
position in an axis, not thirteen independent failures.** It has not
been read at the cells. 92.7% is published without an account of its
remainder rather than with a guess at one, and the reading is the
obvious next round.

## Coverage — the denominator nobody asks for

**Six of 22 models produce no patterned rows at all**: the check cannot
speak on them, because they carry no two dated blocks sharing labels.
That is an honest silence, and it is also a limit on the flagship: a
check that cannot speak on **27% of real close models** is a different
product from one that can. The number belongs beside the others.

## What changed the answer, in order

1. **Zero periods voted for every reading** — fixed, and « cash bank
   carried forward » stopped being a flow.
2. **The defect test matched zero against zero** — fixed.
3. **Opening balances were judged as closing ones** — three readings
   now, from behaviour, never from the words « b/f ».
4. **A break had to be material** — five of six findings were calendar
   rows slipping by one day in 182.
5. **Float dust cleared the absolute floor** — the zero rule
   generalised to the row's own scale. This was the last false alarm
   and the third catch of one failure mode.

Every one is a category error rather than a threshold, and each was
registered before it was written.

## What adoption would require, named in advance

A new rule key routes to the workspace category map before adoption;
the catalogue moves 20 → 21 and the golden master is regenerated in
the same commit. Nothing is wired into `audit()` until criteria 1–4
hold.

---

# Adoption round — registered 30 August 2026, before the sweep was read

The founder's instruction was « turn on and on to the next piece ».
Turning it on means it stops being measured on the corpus it was
designed against: `audit()` runs on the **27-file AU-UK regulator
corpus**, where this check's false-alarm rate has never been measured
at all. So the criteria go down first, and the sweep is read after.

## What I predict, stated before looking

The regulator corpus is not the closed-deal corpus wearing a different
name. These are price-control financial models — one licensee grid per
sheet, values pushed through a rate calculation — not a monthly
statement pair published beside its annual roll-up. **I expect this
check to be mostly silent here, and I expect the abstention rather
than the finding to be the common outcome.** Numerically: **0 to 5
findings across the 27 files.** If it fires far more than that, the
prediction was wrong and that is the result, not an inconvenience.

## What counts as a pass

1. **Every finding is hand-read at the cells before the baseline
   moves.** A finding I cannot account for from the model's own cells
   is a false alarm, and it counts as one.
2. **More than one false alarm and the check comes back out** of
   `audit()` in this form. Its cause is then fixed as a category
   error and the sweep re-run. **One false alarm is not a pass
   either** — it is recorded here as a limit, with its cause named.
3. **Every other rule reports byte-identically to the golden master.**
   If a pre-existing finding moves, the wiring touched something it
   had no business touching, and that is a defect whatever
   `broken-aggregation` says. The gate's diff decides this, not me.

## What may not happen

**No threshold moves to make this number better.** Not
`MATERIAL_DEPARTURE`, not `MIN_PERIODS`, not `NEGLIGIBLE`, not
`MIN_AXIS`, not `EARLIEST`. Every correction in the round above was a
*category error* — a class of thing the check was wrong to consider —
and that is the only kind of correction allowed here. Any change to
the criteria states its direction before the number is recomputed.

## Two things the wiring itself already changed, recorded now

- **The constants came within one commit of being wrong.** Moving
  `date_axes` out of `scripts/` into the product, I wrote `EARLIEST =
  32874.0` and `MIN_AXIS = 4` where the measured scripts had `18264.0`
  and `6`. Those two numbers decide which rows count as a time axis,
  so they decide which blocks exist and therefore every number above.
  They are reconciled to the measured values, the scripts now import
  the product's one definition rather than keeping their own, and the
  constants carry a comment saying they may not move without re-running
  this round.
- **A sheet whose only date row is its header row hands this check no
  axis.** The reader keeps header-row cells out of the audit — they are
  words, not content — so the axis has to be a data row. This is true
  of the measured scripts too, because they read through the same
  reader, so it changes no number above. It is a real limit on reach
  and it is written down rather than discovered later.

## The result — 30 August, read after the criteria were committed

**The registered criteria all hold.**

| criterion, as registered | result |
| --- | --- |
| 0–5 findings predicted across 27 regulator models | **0** — the prediction held |
| every finding hand-read before the baseline moves | none to read |
| more than one false alarm and the check comes back out | **0 false alarms** |
| every other rule byte-identical to the golden master | **gate clean, 27 of 27** |

Zero findings and a clean gate means the golden master **did not need
regenerating**: the check is on and the committed baseline is still the
truth, file for file and finding for finding.

## And zero findings here was silence, not a clean bill

The number that matters more than the zero: **the check spoke on 0 of
the 27 regulator models.** Not « looked and found nothing » — *never
looked*. On the closed-deal corpus it speaks on 16 of 22; here on none.
The gate sweep cannot show this, because its output is compared byte
for byte against the baseline and so cannot carry denominators;
`scripts/e3c_coverage.py` asks the same engine the other question.

Every one of the 27 silences was hand-traced to a cause, and **all
three causes are the check being right**:

| why it said nothing | models |
| --- | --- |
| fewer than two sheets carry a date axis at all | **19 of 27** |
| dated blocks exist but all are **annual** — no two granularities, so no comparable pair can exist | **2 of 27** (CAA H7 PCM, 43 blocks each) |
| a comparable pair exists, but the fine sheet is a **dataset table**, not a labelled line-item grid | **6 of 27** (RIIO-3 BPFMs) |

The third deserves its cells, because « monthly sheet present, annual
sheet present, still nothing » is the shape that would hide a defect.
On `final_gt3_bpfm.xlsm` the monthly block is `F5 - Inflation Linked
Debt` — 194 columns, 154,759 cells, 452 rows carrying values, and
**zero row labels**. Read at the cells: row 11 is a field header
(`Ofgem Identifier`, `category`, `sector`, `licensee`) and every data
row's left columns hold `-`. It is one row per debt instrument, not one
row per named line item. There is no `Total inflation-linked interest`
on it to match the annual summary's. Nothing to compare is the correct
answer, and the reader is not at fault.

## What this says about the check, plainly

**It earns nothing on regulator price-control models.** Its whole value
is on project-finance close models — the corpus it was designed
against, where it speaks on 16 of 22 and where its one surviving
finding lives. A sentence that quotes 92.7% recall or 0.33% coincidence
without this one is selling the check on a corpus it cannot read.

It stays wired, on three grounds and no others: it raises **nothing
false** on models it cannot read, its abstention prints the reason so a
report never passes silence off as a clean bill, and the gate proves it
moved no existing finding. Silence is not a reason to remove a check
that is right to be silent — but it is not a reason to claim reach
either.
