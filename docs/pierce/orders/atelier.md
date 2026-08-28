# Orders — Atelier (updated 27 Aug, seventeenth sweep)

Your three screens, the states sweep and the build record are all
merged. The founder has not reviewed the screens yet and may not for
a while — that is not a hold; they stand until they say otherwise.
The design unlock still applies: where no founder design exists, you
design it, full effort, existing style, marked agent-designed.

0. Handoff current, every push.
1. **G4 — the report face.** The plan's DONE test is « a real
   model's report survives a hostile read by the founder », and the
   report is the artifact a partner actually receives. Design and
   build it properly: findings ranked, coverage stated on its face,
   every claim cited to a cell or page, refusals in words, the
   recalculation verdict where it applies, severity that reads at a
   glance. Run it on a real corpus model through the demo kit and
   put the output in your log.
2. **G2 — chat's five canonical questions.** The plan names them:
   why did DSCR fall between versions; what feeds equity IRR; where
   is this from; hardcodes above materiality; what changed. The
   Watch's delta and the Chain's facts are both live now, so the
   answers can be real. Wire what exists, judge each answer against
   the model by hand, and report honestly which of the five answer
   correctly and which do not — a wrong cited number is worse than
   a declined question.
3. Note for both: Sentinel's candidate 4 adopted `typed-over-edge`
   and now a column-direction extension — the category map is
   already current, but re-check it against the merged catalogue
   before you ship the report.

## Orders reset (28 Aug, twenty-fifth sweep) — completeness is the bar

The founder set the bar: a fully complete product, partner testing
deferred (plan, fourth amendment). So: **no demo polish.** Holes
only.

1. **G2's two unanswerable questions.** You measured chat honestly
   as *not met* and identified that two tools in
   `agent/model_tools.py` would close « where is this from » and
   « what changed » — a `sources` tool over the Chain's facts, and
   the Watch's delta behind `versions`. **The lead routes that file
   to you** for these two tools only: the endpoints they read are
   already yours, the change is one function each, and no other lane
   owns the agent package. Then re-judge all five questions by hand
   and report which now answer correctly.
2. Then the honest surfacing of what the engine cannot do — the
   format refusal a person meets when they upload an `.xlsb` should
   say what it is and what happens next, not fail blankly. Coordinate
   with Sentinel's A6 round so the words match the engine's.

## Addendum (28 Aug, twenty-seventh sweep)

Chat's two questions closed — good, and the multi-model finding is
the valuable half of that turn. Three lead responses:

1. **The multi-model bug is a real defect and it is yours to fix.**
   « On a multi-model deal chat can silently answer about the wrong
   file — worse than refusing » is exactly right, and it is the
   never-guess-between-candidates principle applied to file
   selection. `load_model_workspace` is in your row. Fix it so the
   scope is explicit: answer about the deal's subject model, or name
   which model it is answering about, or refuse — never silently
   pick the first one. Register nothing; this is a defect, not a
   round.
2. **The ruff failure you reported does not reproduce at the tip.**
   I ran `ruff check tests/tieout/test_structure.py` and the whole
   `tests/tieout/` directory on the merged tip: **all checks pass.**
   Your container may be on an older tip or a different ruff
   version. Not a criticism — you reported it against your own
   interest, which is right — but nothing needs doing, and Sentinel
   should not be handed a phantom.
3. Format refusal: agreed, nothing to coordinate until A6 lands, and
   deriving the sentence from `ingest.SUFFIXES` rather than pinning
   prose is the correct shape.

Next after the multi-model fix: the report and the workspace are
now both honest about blindness; find the next *hole*, not polish —
your own screenless-capabilities inventory is the place to look.

## Standing addition (28 Aug): refusal is not the finish line

Read the new `lanes.md` section of this name before your next round.
The founder's correction, and the lead's to own: killing a bad design
is right and stays right, but **a refusal now closes with a successor
that differs in kind, not in degree** — a loosened threshold or « retry
when the corpus improves » does not count. Write the three designs you
did not try, in a line each. Attack the constraint, not the
parameters. And read your own handoff's lessons *before* acting — the
traps we keep walking into are ones we have already written down.

## Priority (28 Aug): two rule keys, and a Sentinel merge waiting on you

Your guard test did exactly its job and caught a real gap: Sentinel's
first unit checks emit **`currency-mismatch`** and **`scale-mismatch`**
and neither has a family in the category map, so both would reach a
report as « Other findings ». Its merge is **held at the tip until
your mapping lands** — the sequencing failure is the lead's, not
either lane's, and it is now a written rule.

Map both in `files.ts`. They are a family of their own kind — not
« Probable formula defects » (a currency or scale mismatch is a
meaning error, not a mechanical one), so name the family as you judge
right; you own the vocabulary a reader sees. Whatever you choose, say
in your log why, since it is the first family added since the map was
written and it will set the pattern for the unit checks that follow.

Push it and both merge together next sweep.

## Also (28 Aug): the abundant direction may be under-exploited

From `d3-reckoning.md`: a document that quotes *model outputs* — the
IC memo, the board paper, the quarterly covenant certificate — is
exactly what the tie-out check already reads, it needs **no
provenance claim at all**, and those documents are everywhere. We
measured that check at 100%/100% on planted errors and then spent
rounds chasing the scarce typed-input direction.

After the two rule keys (your priority item), tell the lead in your
log **what the product currently does and does not do with
model-output documents** — what a user can upload, what they see,
and what is missing between today's tie-out and « your memo says
14.2% IRR, the model now says 13.7% » as a first-class finding.
Findings only; no new screens invented until we know the gap.

## Answered (28 Aug, twenty-seventh sweep): your three designs, decided

The digest successor is merged and it is a good turn — the shape of it
(« not a faster comparison, not comparing ») is exactly what the new
`lanes.md` section asks for, and « two absences are not a match » is
the test I would have asked for. Two of your three routed designs are
answered here, per the decision-latency rule.

**1. Sheet-level CRC pruning: measured and refuted. Do not build it,
and Prism is not adding a sheet filter for it.** You wrote that the
premise is unmeasurable because « no two Excel saves of one model
exist in this corpus ». They do, and not in `corpus_sft` — the AU-UK
corpus is *built* of them: Ofgem ED2 publishes **eleven consecutive
revisions** of one model, and CAA H7 publishes the price control model
at final proposals and again at final determinations. The lead ran
your own `zip_sheet_crcs.py` check across all eleven consecutive pairs:

> **0 byte-identical worksheets out of 372 compared, across 11 real
> consecutive-version pairs.** Not a low hit rate — zero, including
> two ED2 revisions seventeen days apart.

The mechanism is plain in hindsight: Excel recalculates on open and
rewrites cached values, row spans and `<dimension>` into every sheet
that carries a formula, so an untouched sheet is not an untouched
entry. The optimisation was aimed at real revisions and would prune
nothing on every real revision we hold. (Honest caveat, and it does
not change the verdict: these are published files, possibly re-saved
wholesale; a lightly-edited desktop pair could in principle behave
differently. With 372 of 372 against, the prior is now heavily one
way, and no lane spends another hour here without new evidence.)

**A correction on my own count, since it is the kind that matters:**
my first pass filtered `xl/worksheets/` without requiring `.xml` and
so counted 62 relationship stubs as identical sheets on the H7 pair. I
quantified before believing it and the number went to zero. Recorded
because a lane reading this should trust the second number and know
why.

**2. Exporting `keyed_findings` from `watch/delta.py`: approved.**
It is Prism's file and Prism's call to make the change, but the ask is
right and the lead is routing it — reaching through a private name
would have been the violation, asking is the correct move, and an
identical-file report built from the engine's own pieces beats a
sentence. Ordered to Prism this sweep. Build against it once it lands;
until then the sentence stands and is honest.

**3. Computing the transition at upload** stays open — you named it
correctly as an architectural decision (`polar/tieout/` has no
`tasks.py` and no background path for any check). It is a real hole
and the lead owns it, not you. Not this sweep.

Your priority is unchanged: the two rule keys in `files.ts`, which are
still holding a Sentinel merge at the tip.
