# D3 round 11 — the floor the evidence produces, registered before any run

*31 August 2026. Piece 6. The founder's decision, verbatim in effect:
the matcher may be less picky once the search is narrowed, **but the
new threshold must be worked out from the data, not chosen** — shuffle
the labels deliberately, match each model line against the wrong
document section, and set the threshold where those deliberately-wrong
pairs stop getting through. **And the kill rule stands: more wrong
than right and it is dead.** Everything below is committed before the
control has run and before any scored verdict exists.*

## Unchanged from round 10

Corpus (the RMU pair, byte-verified), the 15-row sample, the filer's
citations as truth, the verdict rule (printed page + printed line,
column leniency declared), stage 1 exactly as measured (11 of 15),
the prose rule, the tie rule (an exact tie at the top abstains), and
never-by-value — `label_tokens` still drops every numeric token from
both sides.

## The two changes, frozen

**1. A page's own title line is not a candidate.** Round 10 measured
the circularity: the schedule's title repeats at the top of each of
its pages, and a strong model label ties at 1.00 with the very string
stage 1 already consumed — eleven copies. Frozen rule: a candidate
fact is **ineligible** when its line contains the title of the page
it sits on (the title as round 10's rule extracts it; a page with no
extractable title excludes nothing). A heading names the table; it
does not state a value.

**2. The floor is derived by the founder's negative control, not
chosen.** Procedure, frozen:

- The shuffle pool is the **distinct section headers of the 15 sample
  rows**. For each row, every *other* section in the pool is a
  deliberately-wrong pairing: run stage 1 with the wrong section,
  take its selected pages, and score the row's label against those
  pages' candidates under exactly the scored run's rules (prose
  excluded, title lines excluded).
- **A wrong pairing whose selected pages overlap the true section's
  selected pages is excluded from the control** — a shuffle that
  lands on the real pages is the real pairing wearing a shuffle. This
  is the lesson the flow-stock round paid for (16 of 28 « shuffled »
  rows were the real pairing) and it is applied from the start, to
  the control side only, never to the scored side.
- Each surviving wrong pairing contributes its **top score**. The
  derived floor is the **maximum score any deliberately-wrong pairing
  achieves**; at scoring time a proposal must score **strictly
  above** it. That is « where the deliberately-wrong pairs stop
  getting through »: at this bar, zero of them pass, by construction,
  and the number is the evidence's, not anyone's.
- The full wrong-pair score distribution is printed and committed
  with the verdicts, so the floor can be audited against it.
- **If the derived floor lands at or above where round 10's floor
  was, that is a legitimate result and is reported as one**: the
  evidence refuses a lower bar, and nothing gets less picky.

## The bar and the kill rule, in advance

1. **Kill rule (the founder's, binding, strict):** more wrong answers
   than correct ones = the round is dead and is reported dead. A
   proposal that lands on the label half of the cited line — same
   printed line number, a selected page of the same schedule, but not
   the cited page — **counts as wrong** for this rule, and is *also*
   counted under its own name (`label-half-of-cited-line`) so the
   founder can see what the wrongs were. Round 10 found this shape:
   the left half of a two-page spread carries the row's name, the
   citation names the half that carries the figure.
2. **Clearing the bar means:** correct ≥ 3 and correct > wrong.
3. Nothing ships either way. `chain/propose.py` is untouched; this is
   a committed harness (`server/scripts/corpus_d3_round11.py`) and a
   committed verdict file (`scribe-d3-round11-verdicts.json`).

## The prediction, stated so it can be wrong

- The control's wrong pairings will reach **about 0.33** on generic
  words — « total », « less », « expense » appear in every schedule —
  so I expect the derived floor to land **between 0.33 and 0.5**,
  which keeps the one-shared-word truths (they score 0.33) out. The
  floor being derived does not rescue them; only richer labels would.
- End-to-end: **2 to 4 correct** (rows whose ties the title-exclusion
  breaks at high coverage), **1 to 3 wrong, mostly label-halves** —
  the four spread rows (r19, r36, r41, r44) now propose the labelled
  half of their own cited line at full coverage, and the strict
  verdict counts every one wrong. **Stated plainly: the kill rule may
  fire on label-halves alone.** If it does, the round is dead as
  registered, and the report will show whether every wrong was a
  label-half — because that outcome is not a matching failure, it is
  the verdict rule and the spread meeting each other, and what to do
  about it is the founder's call, not a patch.

## Bias, admitted

I have seen round 10's verdicts, so I know roughly where the truth
scores sit; that is exactly why the floor is not mine to pick. The
control is the guard: the number comes out of the shuffled pairs
mechanically, with the overlap exclusion applied to the control side
only, and it is committed beside the verdicts either way.

---

# Measured. The control refuses a lower floor — and proves the refusal correct.

*Run as registered, once. Verdicts and the full control distribution:
`scribe-d3-round11-verdicts.json`; harness:
`server/scripts/corpus_d3_round11.py`.*

**The derived floor is 1.0.** 82 deliberately-wrong pairings were
scored (9 more were excluded because their pages overlapped the true
section's — the shuffle-that-isn't guard, applied as registered), and
two of them achieved a **perfect 1.0**. Both are the same row: r41,
whose label is the single word « General », fully covered by lines in
the depreciation schedule and the salaries schedule alike. At the bar
where deliberately-wrong pairs stop getting through, nothing gets
through:

| | result | bar |
|---|---|---|
| correct | 0 | ≥ 3 and > wrong — **NOT CLEARED** |
| wrong | 0 | kill rule (wrong > correct) — **does not fire** |
| abstained | 14 | — |
| unreachable-page | 1 | — |

**And the pooling is not what blocked it.** One generic label setting
the bar for all fifteen was worth checking, so the same control was
re-read per row — each label barred only by its *own* wrong
pairings' maximum — as a labelled counterfactual, not the round's
result. **Per-row floors also produce zero correct:** ten rows sit at
or below their own floor, four clear it and land on a **tie**.

**The sentence the control earned, and it is the round's finding:**
for the one-shared-word rows, **the truth's score equals the score
deliberately-wrong pairings achieve — 0.333 against 0.333** (r10,
r12, r59: their own floors are exactly their truth's coverage). The
evidence the matcher is allowed to use genuinely cannot tell the
right line from a wrong-section line at that coverage, so *any* floor
that admits those truths admits equal-scoring garbage. Being less
picky here is now **measured unsafe**, not assumed unsafe — which is
exactly what the founder's control was for.

**What the four surviving ties are**, read at the lines:

- r19 « Electric Plant in Service »: a « tie » of two **facts on the
  same printed line** — the two dollar figures of « 104TOTAL Electric
  Plant in Service… » on the **label half of the spread** (truth is
  that same line 104, cited on the continuation page). Under the
  round's own declared line granularity that is one candidate, not a
  tie — and it is a label-half, which the strict rule counts wrong
  anyway. The tie rule and the verdict granularity disagree, worth
  one line in the record.
- r21, r88: genuine cross-line ties — a two-or-three-word label
  matching sibling lines (« Plant Materials and Operating Supplies »
  against its own TOTAL row) at equal coverage.
- r57: eleven lines tie at 0.33 **on the correct page** — a two-word
  label is everywhere even once the page is right.

## Where rounds 10 and 11 leave the design, together

Page selection is solved well enough (11 of 15, title-to-section).
Within the page, label overlap is now **exhausted by measurement**:
the floor cannot come down (this round), the ties cannot be broken
blind (the oracle bound), and the strongest matches land on the label
half of a spread the verdict rule cannot credit. The evidence that
remains unplayed is on the **model side** — the FERC account number
(shared on 2 of 15 rows), the formula graph, what the cell feeds —
and the **spread reconstruction** question, which round 10 reopened:
with the pool narrowed and titles excluded, the label half of the
cited line is frequently the top candidate, and whether that counts
as finding the source is a product question about what the citation
must point at, not a matching question. Both go to the founder;
neither is patched here.

**Nothing shipped. Zero wrong answers across both rounds — the
honesty held under a bar built to let more through.**
