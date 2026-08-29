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

# Results

*(appended after the run; empty at registration)*
