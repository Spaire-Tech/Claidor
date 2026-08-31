# D3 — the reckoning: one loss, seven no-shows, and a result the lead forgot

28 August 2026. Written after the founder's second answer took apart
the lead's own framing of the document-linking work. Three of its
points are corrections to things this record was saying wrongly.

## Correction 1 — « eight rounds, never a single correct link » is
## not what happened

The rounds are two different kinds and the lead reported them as one:

**Type A — the matcher got a fair test and lost.** *One* round:
**Finch, 0 of 18**, defeated by table shapes. That is a real
measurement of our engine and it named its own cause.

**Type B — there was nothing to match.** *Four* rounds: Ofgem (the
document is written *from* the model, so it quotes computed outputs,
not typed inputs); MCC (no upstream documents published at all);
the Scottish contracts (model-shaped figures redacted); FERC (no
cells at all — the model is published as a PDF). In every one of
these the matcher was never given a fair shot. **Those rounds
measured what governments publish, not what our software can do.**

So the honest count is **one loss and several no-shows** — and after
all of them **we still do not know whether the matcher works.** That
is the actual problem. The missing corpus was a symptom the lead
kept reporting as the disease.

## Correction 2 — we have five correct links on record, and the lead
## forgot them

Checked in `accuracy-backlog.md` after the founder's researcher
flagged it. On the real Ofgem Finance Annex ↔ GD-BPFM pair, against
~140,000 candidate cells, the final graded run:

| | first run | final run | criterion |
|---|---|---|---|
| Proposals | 12 | **6** | pass |
| **True links** | 0 of 12 | **5 of 6 — 83%** | **pass (≥70%)** |
| False drifts | 12 | 1 | not pass |
| Present targets linked | 0 of 5 | 1 of 5 | fail |

**It graded FAIL on *recall*, not on precision.** The matching
machinery found five correct links at 83% precision on a real pair.
The lead has repeatedly said « never a single correct link », which
described Scribe's newer rounds and misrepresented the record as a
whole. Corrected here.

Two honest qualifications, so this is not over-claimed in the other
direction: that run was an **earlier implementation** of the task
(the linker rounds), not Scribe's current `chain/propose.py`; and
the pair runs document-from-model, which is why we discounted it.
**But the founder's researcher is right about why that discount was
wrong:** label-and-header matching does not care which document was
written first. Direction matters for the *sentence in the report*.
It does not matter for the algorithm. We threw away a passing
precision result for a reason that has nothing to do with matching.

## Correction 3 — what happened to Kelso

Round 4 was registered with the strongest external key we have ever
found: **73 « clause → term → figure » rows written by the deal's
own bankers at close.** It is not in the list of rounds because **it
never ran.** The models fetch from the public bucket; the contracts
do not, by any route tried (expired TLS at origin, a 1 MiB archive
truncation cap, no archived models, a rate-limited save service, the
founder's own browser refusing the site, thirteen probed key forms
returning 403). The harness is committed and proven ready on a
stand-in pair. It is blocked on **bytes**, not on design, and it
stays live rather than closed.

## The reframe that changes the plan

**The discovery problem is a fact about our test method, not about
the product.** A banker reviewing a model already has the credit
agreement and the model in the same folder. Nobody has to go find a
public pair. Several rounds went into proving that governments do
not publish filled-in models — which was already true and has never
blocked a sale.

### So: make the answer key ourselves

We do this everywhere else — 37 planted frauds caught 37, seeded
defects in a real close model all caught, mutation testing is a
named plan step. **We have never once applied that method to the
document link.**

The objection is « we typed the numbers in, so of course they
match ». That objection is **wrong, and the reason is precise: all
the difficulty lives on the document side.** Table shapes. Scanned
columns splitting into separate text runs. « Issued share capital »
versus « Equity ». Rounding. Units. None of that gets easier because
we built the model. Take a real, messy public contract, build a real
model from it, log every link as it is typed — **the document stays
exactly as hard as it was.** The only thing lost is an unknown
author, and even that can be weakened: have an agent build the model
and log the links while nobody looks, or use a model built months
ago for another purpose.

### And test the two halves apart

Needing both ends public *at once* is what has kept us stuck. Split
it:

1. **Given a document and a target list written by hand, can it find
   the right number in the document?** — that is the Finch failure,
   and it is the whole engineering problem.
2. **Given a number, can it find the right cell?** — already measured
   at **5 of 6**.

Each half yields a score today instead of a corpus hunt.

### The near-miss may be the product, and we may have it backwards

A document that quotes *model outputs* is exactly what the tie-out
check reads: the IC memo, the board paper, the quarterly covenant
certificate. « Your memo says 14.2% IRR, the model now says 13.7% »
is a defect a reviewer is paid to catch, it needs **no provenance
claim at all**, and those documents are everywhere. The
typed-input direction is the rare one. We have measured the tie-out
at 100%/100% on planted errors and then spent rounds chasing the
scarce direction.

**Priority consequence:** the abundant, already-working direction is
under-exploited and the scarce one is over-invested. That is now
reflected in orders.

### And keep the FERC workbook — but fix the table parsing first

Chasing the native workbook stays right. But if it arrives before
the two-page-spread and table-shape problem is solved, it fails for
the Finch reason and burns another round.
