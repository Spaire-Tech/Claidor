# The Clause Failure Registry — build plan

A list. Each row says: *this kind of clause, worded this way, went to court
in this state, and the court did this to it — here is the judgment.*

Everything else in the product checks a draft against that list.

Context and the reasoning behind the decisions: `docs/direction-2026-08.md`.

---

## The first three doctrines

Chosen because the rule is clear enough to test from the text of a draft,
and because courts reproduce the disputed wording when enforceability
turns on it.

1. **Texas express negligence** — an indemnity covering the indemnitee's
   own negligence is unenforceable unless it says so expressly *and* is
   conspicuous (*Ethyl Corp. v. Daniel Construction*, 725 S.W.2d 705 (Tex.
   1987); *Dresser Industries v. Page Petroleum*, 853 S.W.2d 505 (Tex.
   1993)). Two prongs, both machine-checkable. First.
2. **UCC §2-316 warranty disclaimers** — must be conspicuous and must name
   the warranty disclaimed.
3. **New York consequential-damages exclusions that omit lost profits** —
   lost profits can be *direct* damages where they flow from the contract
   itself (*Biotronik v. Conor Medsystems Ireland*, 22 N.Y.3d 799 (2014)),
   so a bare consequential-damages waiver may not exclude them.

Citations above are from research and should be read in the original
before any entry relies on them.

---

## The nine steps

### 1. Get the cases

CourtListener publishes US opinions in bulk, free, no authentication —
verified working on 2026-08-09. For Texas express negligence that is 291
decisions in the Texas appellate courts plus 49 in the federal courts
applying Texas law. Download the full text of all of them and keep it;
the opinion is the evidence, everything else is derived.

### 2. Throw out the ones that aren't really about it

Most decisions mention a doctrine in passing. A model reads each and
answers: *did this case turn on whether the clause was enforceable?*
Expect 10–25% to survive — from 340, roughly 40 to 80 real cases.

### 3. Read each one twice, by two models, asked opposite questions

- Reader A: *"What clause was at issue, quote it exactly, and what did the
  court do with it?"*
- Reader B: *"What did the court refuse to enforce, and on what ground?"*

Opposite questions on purpose. Two models given the same prompt agree out
of habit; asked from different directions they agree only when the case is
genuinely clear.

This is the design already specified for Claidor's unfinished treatment
labels — propose, review, agreement rate — and it is the radiology
second-reader pattern: two independent readings, with disagreement as the
signal.

### 4. Check the quote is real

Whatever clause text a reader claims the court quoted must appear,
character for character, in the opinion. If it does not, the entry is
discarded — no override. Same rule that governs everything built here:
never state law you cannot point at.

### 5. Sort into two piles

Agreement → provisional entry. Disagreement → human queue. Disagreements
should cluster on split holdings, procedural rulings and dicta.

### 6. Build the gold set

100 cases labelled by a human who can read a US commercial judgment.

**This is the one step that cannot be automated.** A gold set graded by a
model measures nothing at all. Roughly 10–20 minutes a case — 20–35 hours
of qualified reading.

### 7. Get the three numbers

| Measurement | What it tells us |
|---|---|
| Agreement rate | How much human review is actually saved |
| **Precision when they agree** | Whether "agreed" may mean "verified" |
| Screening recall | How many real cases step 2 silently discarded |

The third is the one that hides. False negatives in screening are
invisible — measure it on a second hand-labelled sample of raw hits.

### 8. The gate

**Precision-on-agreement ≥95% → scale. Below → fix the pipeline before
anything else is built.**

For calibration: Shepard's and KeyCite, with decades of human editorial
investment, mislabel roughly a third of negative treatments (Hellyer, 110
Law Libr. J. 449 (2018)) **[research]**. Clearing 95% would be a strong
result worth publishing on its own.

### 9. Repeat for doctrines two and three

Faster each time; the machinery exists.

---

## Known failure modes

**Correlated error.** Two frontier models make the *same* mistakes, and in
case-law labelling those mistakes have a predictable shape: dicta read as
holding, a procedural ruling read as a merits determination, "enforced in
part" collapsed to yes or no, a holding attributed to the wrong clause.
Where both are wrong together the disagreement detector stays quiet, and
the entry enters the registry stamped verified. This is why precision-on-
agreement — not agreement rate — is the gate.

**Mitigations:** opposed lenses rather than duplicate prompts; a cheap
third model as tie-breaker on disagreements only; model and prompt hash
recorded on every entry so a systematic bias can be re-audited later.

**Recall.** The ensemble improves precision on cases we process and says
nothing about cases never retrieved. Separate gold set, separate number.

**Quotation rate.** Some opinions paraphrase rather than reproduce the
clause. Estimated 50–70% reproduce enough to register the wording
**[estimate]**; measure it on the real sample before scaling.

---

## Two kinds of finding, never blurred

This resolves the tension between "the bright-line doctrines don't need a
big corpus" and "the corpus is the moat."

Each entry carries a **rule** where one exists, and **precedent wordings**.

- **Rule hits are assertive.** *"Texas will not enforce an own-negligence
  indemnity unless it says 'negligence' and is conspicuous. Yours does
  neither."* Needs a rule and two cases, not a corpus.
- **Similarity hits are suggestive.** *"Wording close to a clause a New
  York court read down"*, shown beside the precedent.

Two visually distinct finding types in the product. The first is why we
ship value from doctrine one; the second is what the corpus deepens.

---

## Schema sketch

```
registry.opinions          raw court opinions, full text, citation,
                           court, date, source URL
registry.candidates        opinion × doctrine, screening verdict + reason
registry.readings          one row per model reading: clause text,
                           treatment, ground, model, prompt hash
registry.entries           adjudicated: clause pattern, wording,
                           jurisdiction, case, treatment, reason, rule,
                           verification status
registry.rules             machine-checkable predicates per doctrine
registry.gold              human labels — the ground truth
```

Every entry links to the passage of the judgment it came from. The
registry holds **no client data** and never will: a firm's documents are
never a source for it. That is a security property worth stating to
buyers, and it is why the data-rights problem that sinks feedback-derived
datasets does not apply here.

---

## Division of labour

| Step | Who |
|---|---|
| 1–5, 7, 9 — ingestion, readers, verification, measurement, API, review screen | Claude |
| 6 — the gold set | A human who can read a US commercial judgment |
| 8 — the call on whether the gate is met | Founder |

## Cost

- Court data: free
- Model calls: low hundreds of dollars for the first doctrine
- **Gold set: $2,000–5,000** at US freelance contract-attorney rates, less
  with a law student. This is the real cost of the exercise.

## Timeline

| When | What |
|---|---|
| Week 1 | Cases downloaded, screening built and run, candidate set ready |
| Week 2 | Two-model reading, verbatim check, disagreement queue, gold set comparison, the three numbers |
| Weeks 3–5 | Doctrines two and three, the API, the review screen |

Two weeks to know whether this is a company.

## The open decision

Who does the gold set: a freelance US contract attorney, a law student, or
the founder. Step 1 does not depend on the answer and can start now.
