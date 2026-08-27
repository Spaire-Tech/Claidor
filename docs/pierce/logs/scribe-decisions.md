# Scribe — the open decisions, on one page

Everything this lane can do without a decision is done. This is the
whole ask, one item per section: the question, the evidence in a
sentence, and what happens on each answer. **Nothing here needs the
log read first**; every claim links to the round that measured it in
`docs/pierce/logs/scribe.md`.

Written at the twenty-third sweep. The orders file has been
byte-identical for ten sweeps, so this is not a complaint about
slowness — it is an attempt to make five asks cost a minute instead of
an hour.

---

## 1. D1 — must a change leave every line *unchanged*, or *undamaged*?

**The question.** Round V repairs a defect that costs 2,653 invented
facts on the Finch corpus. It does so by changing how lines are read,
so **142 ED2 line entries differ**. Hand-read one at a time: **20
repairs, 0 damage.**

| bar | verdict on round V |
|---|---|
| **unchanged** — no ED2 line may differ | **rejected** (142 differ) |
| **undamaged** — no ED2 line may be made worse | **accepted** (0 damage) |

Under « unchanged » no repairing rule can ever pass, because a repair
is a change. That is an argument for « undamaged », not a measurement,
and it is yours.

**Evidence.** Per document, v4 against round V: `72_src_0` 3,286 → 152
spaced facts, `4_src_8` 204 → 0, **every other file identical to the
unit**, ED2's 8,015 facts and the dash round's 750 nils untouched, ED2
still 30 of 30 abstentions.

- **« undamaged »** → I ship round V: `_LINE_TOLERANCE = 1.5`,
  `_SCRIPT_UP = 6.5`, `_SCRIPT_DOWN = 3.0`, `EXTRACTOR_VERSION` → `"5"`,
  four harnesses re-run. Half a turn.
- **« unchanged »** → round V dies with the other six, D1 keeps the
  defect, and I stop working on it. Also fine — say so and it is closed.

## 2. D5 — build the unsourced-number finding, or shelve it?

**The question.** The shape (`all-but-this-one`) is measured on a real
closed-deal model. Is it worth building?

**Evidence.** Inverness College, 380,506 cells, 20,027 formulas: 21
sections declared, 6 usable, **175 typed cells inside one (0.09%)**.
At a hundred confirmations the surviving threshold fires **about one
finding**. The two rejected thresholds fail loudly — « any » gives 169
findings from ten confirmations, « half » drives its noise from 0.1 to
66.8 as the budget grows.

- **build** → I register the persistence and the reporting round.
- **shelve** → nothing ships; the measurement stands for whenever the
  question returns.

**My own reading, offered and not assumed:** one finding per deal is
either safely quiet or too quiet to build, and which of those it is
depends on how good that one finding is — which is a product judgement
I am not placed to make.

## 3. D4 — approve the confirmed-link store?

**The question.** D4's contract passed **eight of eight** on its
registered table (plus four cases the table did not cover), as pure
functions in `anchor.py` with tests. It cannot go further without a
table, a migration and a repository, which my orders say need your
approval.

- **approve** → I build the store; the amendment adding
  `value_at_confirmation` is registered and waiting.
- **not yet** → `anchor.py` stays a library that reports nothing.

## 4. D3 round 4 — three URLs, or close the round?

**The question.** The Scottish route is **open for models** — Kelso,
Levenmouth and Oban all fetch from the public bucket, which contradicts
my orders' « structurally closed ». The **contracts** are not there;
thirteen probed key forms return 403 while the model key returns 200.

- **someone opens the portal in a browser** and saves three agreement
  PDFs → round 4 runs unchanged, harness committed and proven ready.
- **close it** → I mark round 4 abandoned and stop keeping the harness
  warm.

## 5. Newbattle — drop it from the proof's sample?

**The question.** While chasing a claim I later retracted, I read nine
of Newbattle's finding records in full. If the cold-run condition means
« no lane has looked at what the engine says about this file »,
**Newbattle is compromised and the other ten are not.**

- **drop it** → ten models, condition intact.
- **keep it** → the condition is weaker than stated, and the record
  should say so.

Either is cheaper than a proof whose conditions were quietly broken.
I have no preference; I only know what I read.

---

## What this lane will do with no answer at all

Keep the record honest and stop manufacturing rounds. Seven D1 rounds
are in the log — six dead by their own criteria, one waiting — and an
eighth would be noise. If nothing here is decided, the next turns are
short by design, and that is the correct behaviour rather than a
protest.
