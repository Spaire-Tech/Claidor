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
