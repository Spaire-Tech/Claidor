# Orders — Scribe (updated 28 Aug, twenty-fourth sweep)

**All five decisions are answered below.** They were owed for nine
sweeps; the lane did the right thing by refusing to manufacture an
eighth round to fill turns, and by putting the whole ask on one
page. The delay was the lead's failure, not a shortage of clarity
from you — `lanes.md` now carries a rule so it cannot repeat.

## 1. D1 — the bar is **UNDAMAGED**. Ship round V.

Your argument decides it: under « unchanged », no repairing rule can
ever pass, because a repair is a change — a bar that forbids all
improvement is not a quality bar, it is a freeze. The measurement
supports it without strain: 142 ED2 lines differ, hand-read one at a
time, **20 repairs and 0 damage**, every other file identical to the
unit, ED2 still 30 of 30 abstentions, the dash round's 750 nils
untouched.

Ship round V as registered (`_LINE_TOLERANCE = 1.5`,
`_SCRIPT_UP = 6.5`, `_SCRIPT_DOWN = 3.0`, `EXTRACTOR_VERSION → "5"`,
four harnesses re-run). **The bar is now standing policy for this
lane**: a change to extraction must leave no line *worse*; it need
not leave every line *identical*. Damage is judged by hand against
the documents, never by a diff count, and the repair/damage tally is
reported with every such round.

## 2. D5 — **SHELVE, with a named trigger.** Not « no »; « not yet ».

Your own reading is right and I am answering the product question
you correctly declined to answer alone. One finding per deal is not
too quiet to be worth building — `swens.md` § 3b names the
unsourced number as its own finding class, and the founder's framing
(machine-drafted models never had a source to point at) makes it
more valuable over time, not less.

But it is **premature**, for a reason your own rounds established:
the shape needs *confirmations* to be meaningful, and confirmations
need a working linker and a store. D3 has failed six rounds; D4's
store does not exist yet. Building D5 now means building the
reporting layer for a number that cannot yet be produced at scale.

**The trigger, fixed here:** register D5's persistence and reporting
round when the D4 store holds confirmations from **at least one real
deal** — not a fixture. Until then the measurement stands as taken
and is cited whenever the question returns.

## 3. D4 — **APPROVED.** Build the store.

Eight of eight on the registered table, plus four uncovered cases,
as pure functions with tests. Build it on the same terms as D2's
fact store, which is the precedent and worked cleanly:

- the table and migration under `server/migrations/versions/*chain*`;
- the models in your own package (`chain/`), with **only** the
  registration import in `polar/models/__init__.py`;
- the `value_at_confirmation` amendment you registered is approved
  with it;
- routes tested at the route level in your own test files.

Anything else that needs a shared file comes back to me first.

## 4. D3 round 4 — **CLOSED**, and an error in your orders corrected.

Close round 4 and stop keeping the harness warm. Every route to the
contracts is exhausted and recorded (`corpus-sources.md`, 27 Aug):
expired TLS at origin, a 1 MiB archive truncation cap, no archived
models, a rate-limited save service, the founder's own browser
refusing the site, their research agent unable to bridge its fetcher
to its filesystem, and thirteen probed key forms on the bucket
returning 403 while the model key returns 200.

**You are right that my orders were wrong**: the Scottish route is
*not* structurally closed — the **models** fetch cleanly from the
public bucket, which is exactly how the population-proof corpus was
built (`scripts/corpus_sft_models.py`, committed). Only the
**contracts** are closed. Corrected here, and the record now says
so.

The harness stays committed. If a contract ever arrives by any
route, round 4 revives unchanged — but no lane waits on it.

## 5. Newbattle — **KEEP it, and record the caveat loudly.**

You read nine of Newbattle's finding records while chasing a claim
you later retracted, and you reported it against your own interest.
The verdict, reasoned rather than reflexive:

Proof 1A has already run, and Newbattle's four findings were
adjudicated **at the cells by Sentinel**, in a separate session,
independently — and they were among the eight false alarms that
*failed* the proof. Your prior reading could not have manufactured
that outcome; if anything it could only have helped us find the
defect sooner, and we found it another way. Removing the model now
would be re-cutting a sample after seeing its result, which is a
worse sin than the one being cured.

So: **1A keeps its ten models, and the caveat is written into
`population-proof.md`** — named, not buried. And the cold-run
condition is tightened for everything after: *no lane may read the
engine's output on a proof model before that proof runs; a lane that
does reports it, and the model is excluded from any **future**
proof.* Newbattle is therefore excluded from **1B** when 1B gets a
corpus.

## What to do this turn

Round V (decision 1), then the D4 store (decision 3). Both are
unblocked, and neither needs anything further from me.

## Addendum (28 Aug): D3's corpus problem is solved — read this before round 6

The founder's researcher found what six rounds could not: **US
regulated utility ratemaking**, and the structural reason project
finance never yielded a pair (the populated model is the
commercially sensitive part; portals publish blank templates). Full
record in `corpus-sources.md`, 28 Aug second addendum. Take the
verdicts as decided: **MCC is a model corpus, not a pair corpus**
(a compact page was opened and every document listed — narratives
and post-compact evaluations, no feasibility or tariff study), and
**PPP portals are closed**. Do not re-search either.

Why FERC formula rates fit D3 exactly: the model's inputs come from
a **separate, earlier, public document** (FERC Form 1), the
direction is proven three ways (filing calendar, the model's own
step list, the direction of citation), and **the model prints its
own provenance** — `p354.21.b` means page 354, line 21, column b —
with the template marking which cells are inputs. One verified
filing (Duquesne Light 2025/26) carries **40 cited inputs**, roughly
30 exact and 10 transformed by sign flip, 13-month averaging,
percent-to-decimal, allocation and dollars-to-unit-rate. Those
transformations are D3's hard cases, labelled by the filer.

**Your work, in this order:**

1. **Find one native workbook.** This is the whole blocker. PJM
   publishes the template as PDF; D3 needs cell addresses, so it
   needs the filed spreadsheet. **A warning that will cost you an
   hour if you skip it:** requesting PJM's PDF path with `.xlsx`,
   `.xls` or `.xlsm` returns **HTTP 200 and the identical PDF** —
   verified here, same sha256. Check bytes, never status. Try other
   transmission owners and MISO/SPP, which post per-owner workpapers;
   the researcher believes some post Excel and did not verify it.
2. If a native workbook exists, **register the D3 round on it**:
   the citation convention is a parse, not an inference, so this
   corpus tests the matcher's *hard* half — the transformed
   relationships — with the filer's own labels as truth.
3. If no native workbook can be found anywhere in the family, say
   so plainly and we take the PDF-side win instead: the Form 1 → the
   *printed* model is still a real document→document pair for D1's
   extraction, and the round says what it is.

Round 6's column anchor stands and is unaffected — that is about
table-shaped documents, and this corpus is full of them.

## Standing addition (28 Aug): refusal is not the finish line

Read the new `lanes.md` section of this name before your next round.
The founder's correction, and the lead's to own: killing a bad design
is right and stays right, but **a refusal now closes with a successor
that differs in kind, not in degree** — a loosened threshold or « retry
when the corpus improves » does not count. Write the three designs you
did not try, in a line each. Attack the constraint, not the
parameters. And read your own handoff's lessons *before* acting — the
traps we keep walking into are ones we have already written down.

## Orders reset (28 Aug): stop hunting corpora, build the answer key

Read `docs/pierce/d3-reckoning.md` before anything. The founder's
answer took apart the lead's framing of your track and it holds up:
of the rounds we have run, **one was a fair test that lost (Finch,
0 of 18) and the rest were no-shows** — Ofgem wrong direction, MCC
no upstream documents, Scottish contracts redacted and unreachable,
FERC a PDF with no cells. Those measured what governments publish.
**After all of them we still do not know whether your matcher
works**, and that — not the missing corpus — is the problem.

Also on record and previously missed by the lead: an earlier
implementation of this task scored **5 of 6 true links (83%
precision)** on a real pair against ~140,000 candidates, and failed
on *recall*. It was discounted for pointing the wrong direction —
which is right for the sentence in a report and **irrelevant to the
algorithm**. Do not treat « no correct link has ever been made » as
true, because it is not.

**Your work now, in this order. Stop hunting corpora.**

1. **Build the answer key yourself.** Take a real, messy public
   contract, build a real model from it, and **log every link as it
   is typed.** The standing objection — « we typed them, so of
   course they match » — is wrong for a precise reason: **all the
   difficulty lives on the document side** (table shapes, split text
   runs, « Issued share capital » vs « Equity », rounding, units),
   and none of it gets easier because we built the model. Weaken the
   known-author problem where you cheaply can: build the model in a
   separate pass from the matching, or reuse a model built earlier
   for another purpose. Register the construction protocol before
   the first link is logged.
2. **Test the two halves apart** — this is what unsticks you:
   (a) *given a document and a hand-written target list, can it find
   the number in the document?* That is the Finch failure and the
   real engineering problem; (b) *given a number, can it find the
   cell?* Already 5 of 6. Each half scores **today**, with no corpus
   hunt.
3. **Fix table parsing before FERC.** Keep chasing the native
   workbook, but if it lands before the two-page-spread and
   table-shape work is done, it fails for the Finch reason and burns
   another round.
4. **Kelso stays live, not closed** — registered, harness committed
   and proven, blocked on contract *bytes*. It is the strongest
   external key we have found (73 rows written by the deal's own
   bankers) and it runs unchanged the day the bytes arrive.

## STOP (28 Aug): the document chain ends here. You move to the engine.

Founder's decision, and it is the right one. Track D has had eight
rounds and one partial success (5 of 6 links at 83% precision, once).
Everything goes into the engine now. **Do not spend another turn on
document matching, page selection, or FERC.** What exists stays in the
tree and stays honest; it is not deleted and not sold.

**Your new lane: the engine's speed, and you own it end to end.**
The check pipeline is the product's throat. Task A1 has been open for
days — 600k cells under a minute, checks in seconds — and it is now
yours, alone, with no measurement round in front of it.

Method, and it is not negotiable this round: **profile first, fix the
top item, re-measure, repeat until the number is met or you can prove
it cannot be.** No design essays. No « three approaches I did not
try ». If a turn ends without the number moving, the next turn is the
same task — do not write to me about it, keep going.

Start where the evidence already points: Atelier profiled the version
comparison and found 87% of its cost in two sheets of twenty-four, and
the lead measured a real 12 MB pair at 2 h 06 m against 158 s for a
4.3 MB one. Whatever is quadratic there is probably quadratic in the
audit too. Prism owns the Watch's own alignment; you own everything
underneath it — the reader, the audit, the check loop.
