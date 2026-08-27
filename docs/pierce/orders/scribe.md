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
