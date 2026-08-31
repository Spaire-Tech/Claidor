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
