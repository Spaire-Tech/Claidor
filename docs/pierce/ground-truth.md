# Ground truth — what we own, what we must buy, and what nobody has published

28 August 2026. Written after the founder's answer to the lead's
research brief corrected it in four places. The brief had asked for
« somebody else's labels » as a single undifferentiated need. That
was wrong in ways worth writing down, because the corrections change
what we spend money and time on.

## Correction 1 — precision and recall are different purchases

**Precision** (are the flags we raise right?) needs someone to judge
**the cells we flagged**. A hundred flags is a day's work for one
finance person.

**Recall** (what did we miss?) needs someone to have labelled **the
whole model**, because nothing else can tell you what was not
flagged. That is a hundred thousand cells, not a hundred.

The lead's proposal — a hundred blind-labelled rows — buys precision
and **almost no recall**: in a hundred random rows of a real model
there may be one or two defects, far too few to measure anything.
Any future labelling spend states which of the two it is buying.

## Correction 2 — recall does not need labels; it needs someone
## else's defect list, and we have one

The seeding objection we raised against our own 37-of-37 was that
**we chose what to plant**. The founder's answer removes the
objection without removing the method: **we do not have to choose.**

The Ofwat draft-to-final study found **84 new defects that real
people put into real financial models in one revision cycle** —
including the class-change case where a repair restored a formula
and then hardcoded into its tail. That is a defect catalogue written
by the UK water industry.

**The move: turn those before-and-after pairs into transformations
and replay them onto other models.** The seeding becomes empirical
rather than imagined, and the taxonomy is somebody else's. The same
holds for the published spreadsheet mutation operators already named
in the plan — using another group's operator set means we did not
pick the classes.

## Correction 3 — we already own independent ground truth the brief
## did not count

The brief said « what closes it is somebody else's labels » without
counting what we hold. Counted now:

1. **The recalculation fidelity key is the purest we will ever
   have.** 3,862,412 cells checked against values *Excel* computed
   and the model's own author accepted and saved. That answer key
   was written by Microsoft and by a stranger; we did not touch it,
   could not have influenced it, and cannot be accused of grading
   it. It measures fidelity rather than defect-finding — say so —
   but it is the one number in this company that is
   unimpeachable by construction.
2. **The Ofwat Q&A**: a regulator naming specific cells as wrong in
   a third party's model. n = 4, and it is a label nobody can argue
   with.
3. **Kelso's provenance tab**: 73 « clause → term → figure » rows
   written by the deal's own bankers at close.

## Correction 4 — split the key by class *before* buying anything

Some checks have a **computable** right answer: does this sum skip a
row inside its own block, does the balance sheet balance, does debt
repay to zero. Those need no human at all. What they need is a
**spec and a second implementation written by someone who did not
write the first** — differential testing, where disagreement between
two independent implementations is the signal.

Only the **judgement** rows need human eyes: is this hardcode a
defect or a deliberate assumption. Sorting first means every bought
label lands where nothing else can reach.

## If we do buy labels: three people, not a friend

Three labellers, one written protocol, working **blind and apart**,
and then **publish how much they disagree with each other**.

Our own evidence predicts they will disagree a lot: two expert groups
labelling the same 70 files produced 1,974 and 3,702. If three
finance professionals agree with each other only two times in three,
then any tool scored against one of them is **already at the noise
ceiling**, and saying that out loud is worth more than the score.

**Nobody in model audit has ever published a human-versus-human
number.** That is an artifact we could own.

## The two-group gap is a finding, not a wound

The same 70 files, one count nearly double the other, the smaller
nesting inside the larger. That does not mean our number is soft. It
means **a single recall number is not a real object**: the count is a
question of where the scope line is drawn, and no published tool
states its line.

So the discipline is the one we already run on coverage: **ship the
scope with the number.** « Recall is X against scope Y » is a real
claim; « recall is X » is not, from anyone.
