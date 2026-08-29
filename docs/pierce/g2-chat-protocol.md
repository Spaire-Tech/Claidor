# G2 — the five canonical questions: the protocol, registered first

**Written and committed before any question was run.** Nothing below
was chosen after seeing an answer; where a choice had to be made after
looking at something, this file says which thing was looked at and why
that is setup rather than a result.

`swens-plan.md` G2's DONE test, verbatim:

> Chat anchored to the model: questions answered from the structure
> map, the graph, the Chain and the Watch — every number in an answer
> cited to a cell or a page; questions outside the model declined.
> **DONE: the five canonical questions (why did DSCR fall between
> versions; what feeds equity IRR; where is this from; hardcodes above
> materiality; what changed) answer correctly on a real model,
> judged.**

## Why this round exists

« Chat answers 3 of 5 core questions » circulated as fact. It was a
lane's assessment, repeated by the lead without opening the file, and
the founder caught it. The tool inventory suggests the two reported
gaps may already be closed. **Nobody has re-tested.** So: ask the five
questions of a real model, judge the answers by hand, publish what
holds.

## The honest split — what can be measured here and what cannot

`ANTHROPIC_API_KEY` is not set in this container, so the live agent
loop cannot run. That divides the DONE test in two, and both halves are
reported rather than one being quietly dropped:

**Half A — the tools (measured here).** For each question, does the
toolset yield the correct answer from a real model, with every number
attributable to a cell or a page? This is the load-bearing half: if a
tool cannot produce the fact, no model call can rescue it, and if it
can, the fact is in hand. It is deterministic and re-runnable.

**Half B — the loop (blocked, named).** Whether the agent picks the
right tools unprompted, phrases the answer in review language, and
declines a question outside the model. This needs a key. It is
**blocked, not passed and not failed**, and G2 is not DONE until it
runs.

## The subjects, chosen before any question was asked

Two, because the five questions are not all about one file:

- **Subject A — single-version questions (Q2, Q3, Q4).**
  `DumfriesandGallowayRoyalInfirmaryFinancialModel.xlsm` — a real
  project-finance model, issued at financial close, already hand-read
  for the closed-deal test (`closed-deal-ground-truth.md`). Chosen
  because it is real project finance (so DSCR and equity IRR are
  concepts it plausibly holds) and because independent hand-reading of
  it already exists.
- **Subject B — version questions (Q1, Q5).** The Ofgem ED2 adjacent
  pair `v3_2023-10 → v3_2023-11`, from the gate corpus. Chosen because
  it is a real revision of a real published model and C1's own DONE
  test uses an adjacent ED2 pair.

## Instantiating the questions

Q1 names DSCR and Q2 names equity IRR. Those are *examples of a shape*,
not a requirement that every model carry those two labels. The rule,
fixed now:

1. Ask the model for its own words for the metric (the `locate` tool).
2. If the metric exists, the question is asked about it.
3. **If it does not exist in the file, the substitution is named in the
   results and the question is asked about the model's nearest own
   headline metric.** A substitution is a deviation and is written
   down, never made silently.

Locating the metric is **setup, not a result**: `locate` is how a
person turns « the interest line » into a cell before any walk starts,
and every question below is asked from the cell it returns.

## The five questions, as they will be asked

| # | The canonical question | How it is asked |
| --- | --- | --- |
| **Q1** | Why did DSCR fall between versions? | On Subject B: `versions` for what moved, then `trace_back` from the metric to the changed cells that feed it |
| **Q2** | What feeds equity IRR? | On Subject A: `locate` the metric, then `trace_back` |
| **Q3** | Where is this number from? | On Subject A: `sources` on a typed input |
| **Q4** | Show me every hardcoded value above materiality | On Subject A: `inventory` for hardcodes |
| **Q5** | What changed? | On Subject B: `versions` |

## The verdicts, defined before any answer was read

Exactly three outcomes per question. No fourth, and no partial credit.

- **CORRECT** — the answer is true against the file, and **every
  number in it is attributable to a named cell** (or, for Q3, a
  document and page). Verified by hand against the workbook itself; the
  file is the ground truth.
- **ABSTAINED** — the tool says it cannot tell **and names what is
  missing**. Not correct, and not wrong: `swens.md` § 5 makes an honest
  refusal a first-class outcome, and « never guess between two
  candidates » is one of the four non-negotiable principles. An
  abstention is a pass for trustworthiness and a fail for the DONE
  test, and it is counted as its own column so neither reading is
  hidden.
- **WRONG** — it asserts something false, or produces a number that
  cannot be traced to a cell.

**A silent empty answer is WRONG, not ABSTAINED.** « No results » with
no reason is the shrug the product forbids.

## The bar

**G2's DONE test is met when all five are CORRECT on Half A *and*
Half B has run.** Anything less is published as it stands, per
question, with the reason. Four of five is four of five; it is not
« mostly working ».

## What gets published

A row per question — verdict, what was asked, what came back, and the
hand-check that settled it — appended to this file below the line, and
the count carried into `pieces.md`. Including, and especially, any
question that comes back WRONG.

---

# Results — round 1, 28 August 2026

**Half A score: 2 of 5 CORRECT.** Not three. The circulating number was
too generous, and the two that hold are not the two anyone assumed.

| # | Question | Verdict |
| --- | --- | --- |
| Q1 | Why did the metric fall between versions? | **INGREDIENTS ONLY** (see the rubric note) |
| Q2 | What feeds equity IRR? | **CORRECT**, two defects named |
| Q3 | Where is this number from? | **ABSTAINED** — blocked on the Chain, not on chat |
| Q4 | Hardcodes above materiality | **NOT CORRECT** — under-answered |
| Q5 | What changed? | **CORRECT**, one defect named |

## A rubric failure, declared rather than hidden

The registration allowed exactly three outcomes and said « no fourth ».
Q1 produced a fourth: **both halves of the answer, correct and cited,
with nothing joining them.** It is not CORRECT (it does not answer the
question), not ABSTAINED (nothing said it could not join them), and not
WRONG (it asserts nothing false).

Forcing it into one of the three would be bending criteria to fit
results, which is the whole thing registration exists to prevent. So a
fourth label is used, marked as **not in the registration**, and it
**counts as NOT CORRECT** for the bar. The score is unaffected; only my
claim to have anticipated the outcomes is.

## The subjects, and a discovery about them

Registered Subject A was the Dumfries close model. It turned out to be
**values-pasted** — 33 sheets, and every one but `GAPSLIST` holds zero
formulas. « What feeds equity IRR » cannot be answered on such a file
because nothing feeds anything: the answer is « somebody typed it ».
That is a defect in my subject choice, not in the tool, and it is why
round 2 added formula-bearing models.

Counted across the founder's own project-finance set:

| Model | Cells | With formulas |
| --- | --- | --- |
| Dumfries & Galloway Royal Infirmary | 223,383 | 328 (one sheet) |
| RHSC DCN (financial close) | 608,191 | **0** |
| Bertha Park (final) | 389,418 | 113 |
| Inverness College | 215,102 | 19,900 |

**Three of four issued close copies are values-pasted.** That is a fact
about the market, not about this round: the file a deal actually closes
on is frequently a paste-special of itself. Every question that depends
on the precedent graph is unanswerable on those files *by nature*, and
the product's honesty about it is worth more than a walk it cannot do.

## Q1 — « why did the metric fall between versions » · INGREDIENTS ONLY

Asked on the Ofgem ED2 pair `v3_2023-10 → v3_2023-11`.

**DSCR is genuinely absent** from an energy price-control model, and
the tool said so three times, cleanly and by name — « Nothing in
v3_2023-11.xlsx is named like « DSCR » ». Substituted, per the
registered rule, to the model's own headline metric: **allowed
return**.

What came back, both halves correct and cited:

- `locate('allowed return')` → `InputSummary!AR158` « FY2024 Allowed
  return on debt », 0.0304, plus the equity and gearing rows.
- `trace_back('InputSummary!AR158')` → walks to `AR157` « iBoxx
  trailing average », then `SelectedInputs!AR211`, then names three
  chain ends honestly: « ENWL!AR211 is a typed input — nothing behind
  it » (and NPgN, NPgY). Formula shown: `=SUM(AR157:AR157)`.
- `versions()` → among the 44 changed assumptions,
  `ENWL!211`, `NPgN!211`, `NPgY!211` moved **0.0313 → 0.0317**.

**The join is visible to a human reading the two outputs side by side
— those row-211 cells are precisely the traced precedents — and
nothing in the product performs it.** That join is Half B's job, and
Half B is blocked on a model key. Q1 is therefore not answerable today,
and the reason is precisely located rather than guessed at.

## Q2 — « what feeds equity IRR » · CORRECT, two defects

**Correct where a chain exists.** On Inverness College,
`trace_back('PF3_Financing!D34')` walks « Project IRR » 0.0619634 to
`Semester Workings!F868` « Project Returns - REAL Pre Tax », same
value, formula shown (`='Semester Workings'!$F$868`), chain end named
in words. Every number cited to a cell.

**Correct where no chain exists.** On Bertha Park,
`locate('equity IRR')` returns `NPV_IRR!I53` « Equity IRR (Real) »
0.0781079 first — exactly the right cell — and `trace_back` reports
`formula: typed value`, which is the truth about a values-pasted file.

**Defect 1 — `locate`'s result is padded with a log of filenames.** On
Inverness, `locate('equity IRR')` returns twelve rows: the first two
are genuine (`Input Scenarios!D19` and `F19`, « (Shortfall)/Excess from
Equity IRR »), and the other ten come from a `Model Log` sheet whose
row labels are model *filenames* — « Inverness Fin model v4804
Annity11yrs_EquityIRR_11-434%.xlsm ». Hand-checked against the file:
**820 cells carry « IRR » in a row label and 797 of them are in
`Model Log`.** A filename is not a name for a number, and nothing
demotes one.

> **Correction, same day.** My first write-up of this said the metric
> was buried and « the person asking gets a change log ». That is
> overstated and it is wrong: the existing sort — formula rows first,
> then shortest name — does put the two genuine rows on top, and on
> Bertha Park the result was exactly right with no noise at all. The
> real defect is narrower: ten of twelve slots are spent on filename
> noise, crowding out other genuine matches. Recorded rather than
> quietly edited, because an overstated defect is as misleading as a
> hidden one.

**Defect 2 — the summary understates what the payload knows.** On a
values-pasted file the sentence reads « Walked back from X (0 direct
inputs) », which a reader takes as « nothing feeds it ». The payload
does carry `formula: typed value`, but § 5 requires the refusal itself
to say what to do about it. « This file holds no formula for that cell
— it is a values-pasted copy » is the sentence owed.

## Q3 — « where is this number from » · ABSTAINED, exemplary

`sources('')` → « No number in this model is matched to a source
document », with the note: « No source document has been read on this
deal, so nothing in this model can be traced past the cell somebody
typed it into. »

That is the abstention the product promises: it names what is missing
and what would resolve it. It cannot be CORRECT today for a reason
outside this piece — **the Chain has never produced a confirmed link**
(its last round scored 0 of 15). **Q3 is blocked on the Chain piece,
not on chat**, and no amount of work here moves it.

## Q4 — « hardcodes above materiality » · NOT CORRECT

The tool lists hardcodes truthfully, cited, biggest first — on
Dumfries, `GAPSLIST!Q802 =8760`, `Q900 =6`, `Q1101 =0.22`; on
Inverness, `PF6_Cashflows!C57` « Nominal discount rate » 0.060875.

**But `inventory` has no materiality parameter at all.** Its whole
vocabulary is `kind` ∈ {typed, hardcodes, external-links} and an
optional `sheet`. Asked for « hardcodes above materiality » it silently
answers « hardcodes » — a narrower question, without saying it
narrowed. Nothing it says is false, which is why the registered rubric
did not catch it; answering a narrower question while appearing to
answer the one asked is its own failure, and the one the product's
« always show coverage » principle exists to forbid.

## Q5 — « what changed » · CORRECT, one defect

`versions()` on the ED2 pair: **« 11 defects still open, 44 assumptions
changed, 333 outputs moved materially »**, 377 items, each named to
sheet, row and columns with old → new values — « `Annual Inflation!50`
an assumption that was changed — 8.884624806289088 → 10.007381931931292
(6 cells), AQ, AR, AS, AT, AU, AV ». Review language, not a cell diff.
New defects 0, repaired 0, persistent 11. Every number traces.

**Defect — the versions are unnamed.** The summary prints « v? → v? »
because the version numbers are read from the stored-cell diff, which
this bench does not have. The workspace *does* hold the version list,
so the tool could say « v1 → v2 » from what it already has. A report
that cannot say which two things it compared is weaker than it needs
to be.

## What this round changes

Three defects are fixable here (Q2's two, Q4's, Q5's). Q1 needs the
join, which is Half B. Q3 needs the Chain.

---

# Round 2 — the fixes, and what they measure now

## The four changes

**1. A filename is not a name for a number.** `_resolve` now sorts
filename-shaped labels last, after « formula rows first » and before
« shortest name ». Stated as a principle rather than a Model Log
special case, because the next model will keep its change log
somewhere else.

**2. A walk that cannot happen says why.** `trace_back` on a cell with
no formula now reads « `Output!K65` holds a typed value — no formula,
so nothing feeds it », and on a values-pasted file it adds « … is a
values-pasted copy: almost none of its cells keep their formulas, so no
walk is possible anywhere in it. The version this was pasted from would
answer. » That last clause is § 5's requirement that a refusal name
what would resolve it.

*The values-pasted line was measured, not picked.* The four
project-finance close copies sit at 0.000% (RHSC), 0.029% (Bertha
Park) and 0.147% (Dumfries) formulas-per-cell; the one live model sits
at 9.25% (Inverness). **Two orders of magnitude separate them**, so any
line inside that gap says the same thing; 1% is the round number in the
middle. My first threshold was 0.1% and it missed Dumfries by a
whisker — caught by re-running against the real file, not by the tests.

**3. `inventory` takes a threshold, and always states it.** New `above`
parameter, exposed in the tool definition so the agent can pass it when
a question says « above materiality ». The summary now reads either
« above 1,000 of 47 found » or « (no size filter applied) » — never a
count that leaves the reader guessing whether one was.

**4. `versions` names what it compared.** The version numbers now fall
back to the workspace's own version list when the stored-cell diff has
none. « v? → v? » became « v1 → v2 ».

## A bug in my own fix, caught by the real file again

The first `above` implementation filtered on the cell's cached value.
On Dumfries that returned **zero hardcodes above 1** — when the true
answer is `=8760` and `=6`. The cause: a hardcode's magnitude is the
number *buried in the formula*, and on a values-pasted copy the cell
often has no cached value at all, so every one was silently dropped. A
filter that answers « none » to a question whose answer is « the 8760 »
is worse than no filter.

Fixed: hardcodes are sized by their largest buried literal, typed
inputs and external links by the cell's own value. Now returns
« 2 formulas with a number typed inside across 1 sheets, above 1 of 3
found », listing `=8760` and `=6` and correctly dropping `=0.22`.

**Twice in two pieces, the unit tests passed and the real file found
the bug.** Both times the fault was a plausible assumption about data
shape — that a summary sentence carries what the payload carries; that
a hardcode's size is its cell's value. Running against a real model is
not a final check on a piece; it is part of writing it.

## The score after round 2

| # | Question | Round 1 | Round 2 |
| --- | --- | --- | --- |
| Q1 | Why did the metric fall between versions? | ingredients only | **ingredients only** — the join is Half B |
| Q2 | What feeds equity IRR? | CORRECT, 2 defects | **CORRECT**, both defects closed |
| Q3 | Where is this number from? | ABSTAINED | **ABSTAINED** — blocked on the Chain |
| Q4 | Hardcodes above materiality | NOT CORRECT | **CORRECT** |
| Q5 | What changed? | CORRECT, 1 defect | **CORRECT**, defect closed |

**3 of 5 CORRECT on Half A, up from 2.** The two that remain are not
chat's to fix:

- **Q1** needs an agent to join a trace to a version delta. Both halves
  are produced, correct and cited; nothing joins them, and joining is
  what the loop does. **Half B, blocked on a model key.**
- **Q3** needs one confirmed document link to exist. The Chain's last
  round scored 0 of 15. **Blocked on the Chain piece.**

So « 3 of 5 » is, by coincidence, where the stale claim landed — but
for none of the reasons it gave, and now with the two gaps located, the
four defects closed, and every claim re-runnable.

## G2 is not DONE

The bar was all five CORRECT and Half B run. Neither holds. What
changed is that the remaining two are precisely attributed rather than
guessed at, and both are somebody else's piece:

- **G2 is not blocked on chat.** It is blocked on a model key (Q1's
  join, and everything in Half B) and on the Chain (Q3).
- **The key is one environment variable.** `ANTHROPIC_API_KEY` in the
  server environment and Half B runs.
