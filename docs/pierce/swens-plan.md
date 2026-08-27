# The Swens build plan — every step to a complete platform

**This is the plan, and the only one.** It was written 23 August 2026
as `ambre-plan.md`, at the founder's request (« a detailed step by
step plan for building the whole ambre platform complete »), and the
founder approved it. `swens.md` — the document of record — superseded
the Ambre *name and framing*; the tracks and the method below stand.
On 24 August I wrongly deleted this file and crowned `plan.md` (the
superseded 20 August direction) in its place; this is the approved
text restored, with only the names updated. Where this plan and
`swens.md` disagree, `swens.md` wins.

---

23 August 2026. The complete plan for building Swens (the product
described in `swens.md`), from today's state to « complete ». It
replaces `clone-plan.md` (whose foundations survive inside it; since
deleted, git history keeps it) and sits on the decisions in
`ambre-toolbox.md`. The founder owns UI/UX for every surface; the
engine side below is built UI-less first, and every piece ends in an
API the UI binds to.

## First, the correction to « build everything, then train
## everything »

That is not quite how this works, and the difference is the whole
method. There is no separate training phase. Every capability goes
through the same loop, one at a time:

1. **Harness first.** Before the feature: the thing that will judge
   it — ground truth, planted defects, a golden master, a fidelity
   gate. If we cannot say how we will know it works, we do not
   build it yet.
2. **Build to the harness.**
3. **Registered measurement.** Rules written and committed before
   results are looked at. The number is what it is.
4. **Fix rounds until quiet.** Every false alarm names a general
   principle; every miss names its detector. Re-measure.
5. **Gate forever.** The capability joins the standing gates and can
   never silently regress.

A capability is « working the way we want » when its number is
published per class, its gate is green, and its refusals are honest.
That is the definition used for every DONE below. The engine already
went through this loop five times; the plan extends the same loop to
everything else.

## Where we stand today (so the plan starts honestly)

Built and measured: the static engine (80.1% useful on unseen
financial models, 2.9% false positives; golden-master gated), the
deck-to-model tie-out (measured at 100%/100% on planted errors), the
contract-to-model linking design (« confirmed once, then arithmetic
forever »), the write path's first step (byte-preserving cell
replacement, tested on 27 real files), the CUSTODES benchmark
archived and first-scored, the Microsoft connector (auth, drives,
files), the workspace and panel shells. Decided and researched: the
recalculator architecture, the citation stack, the outward data
sources, the equivalence tiers.

---

# The tracks

Owner is Engine unless marked. Every step has a DONE test.

## Track A — the Engine, from strong to unbeatable

- **A1. The performance round.** The Swens spec promises 600k cells
  read in under a minute, checks in seconds; today the biggest file
  takes minutes (the mutation detector dominates). Profile, fix,
  keep the gate green. DONE: the spec's sentence is true on the
  biggest corpus file, measured.
- **A2. The cheap head-to-head.** Score the CUSTODES authors' own
  shipped detections with our registered scorer — same files, same
  truth, same conventions. Then run ExceLint's open core on the same
  corpus and score it identically. **Both axes published or nothing
  is** — coverage of their truth AND rightness-when-flagging, per
  tool; one axis alone is a story, both are a result. The table is
  **instrument calibration, not a result about Swens** — internal,
  and publishable only as a methodology appendix beneath the
  seeded financial-model number (see the status note in
  custodes-benchmark.md). DONE: the two-axis table exists and the
  scorer is validated against published figures.
- **A3. Mine their labels for missed patterns — not their
  thresholds.** Go through the CUSTODES labels for defect patterns
  we genuinely miss and genuinely care about on financial models;
  each becomes a check through the normal loop, measured on our own
  corpora. Explicitly not done: adopting their looser thresholds to
  score better on their corpus — that optimises for the exam instead
  of the job, and the quietness is the product. DONE: any adopted
  pattern is justified by financial-model value, never by the
  benchmark score.
- **A4. Coverage on the face of the report.** Every audit states
  what was checked, what was not, and why (« 102 checked, 26 not »).
  The structure map already knows; the report must say it. DONE:
  every report carries the denominator.
- **A5. House rules as configuration.** Materiality thresholds,
  rounding tolerance, checks on/off (never silently — the record
  shows what was disabled and by whom), findings mapped to the named
  modelling standards. DONE: two different firm configurations
  produce two correctly different reports from one model.
- **A6. Legacy intake.** `.xls` (and friends) accepted via the
  LibreOffice conversion pass, with the one-at-a-time fallback the
  CUSTODES run taught us. DONE: the whole EUSES-era world is
  readable.
- **A7. Shape-hash normalization polish.** Two upgrades to the
  formula-shape hash, verified missing from `_shape` today: sort the
  arguments of order-independent operators (`+`, `*`, `SUM`) so
  `A1+B1` and `B1+A1` collapse to one shape, and fold constant-only
  arithmetic so `A1*2*3` and `A1*6` do. Both change fold groups, so
  this is a measured micro-round against the golden master, not a
  quiet edit. DONE: the before/after finding counts are recorded and
  every standing gate is green.

## Track B — the recalculator and behavioural checks

- **B1. The LibreOffice worker pool.** ≥25.8, UNO socket,
  `calculateAll()`, the file's own iteration settings pushed in
  explicitly, one document per process, recycled. DONE: a changed
  input produces changed downstream values, unattended.
- **B2. The fidelity gate — the keystone.** Recalculate every corpus
  file *unchanged*; diff against Excel's own stored values,
  cell by cell, with tolerance rules per the toolbox. Per-file match
  rates recorded; the denylist (LAMBDA, CUBE, RTD, UDFs, external
  links) routes to refusal or the arbiter. **No behavioural check
  ever runs on a file that failed its gate.** DONE: the fidelity
  report exists for all corpora and gates everything downstream.
- **B3. The arbiter.** The Graph Excel API through our existing
  connector: when LibreOffice and a file disagree, real Excel
  decides. DONE: a gate failure produces an arbiter verdict, not a
  shrug.
- **B4. Behavioural checks, one law at a time.** Zero-input (volume
  0 ⇒ revenue exactly 0), proportionality (price ×2 ⇒ revenue ×2),
  scale invariance (cents for pounds ⇒ ratios unchanged),
  consolidation (segments sum to the total). Each: planted defects
  first, then the check, then the measured catch rate per class.
  A violated law is a symptom, not a finding: delta debugging
  (ddmin) over the dependency slice between the perturbed input and
  the broken output narrows it to the one responsible cell — one
  authoring decision, one finding, same as everywhere else.
  DONE: the hardcode-in-the-tail class — invisible to static
  reading — is caught and measured, and each catch names its cell.

- **B5. Relation mining — the model's own laws.** (Added 27 Aug,
  founder-approved.) On top of B1/B2: discover a model's invariant
  relations automatically — run it blind under registered input
  perturbations and search for equations that always hold
  (particle-swarm candidate search, SVD + Z3 cleansing, per the
  ICSME 2019 AutoMR paper — **clean-room reimplementation from the
  paper; the reference code's LGPL is incompatible with in-tenant
  delivery**). Mined laws join B4's hand-written ones and are
  checked across versions: a law that held at v8 and breaks at v12
  is a behavioural change stated in review language. Stochastic and
  slow by nature — the overnight pass, never the interactive path.
  DONE: on a gated corpus model, mined laws are stable across two
  mining runs, planted law-breaking edits are caught at a measured
  rate with the per-class table, and zero false law-violations on
  the unedited model.

- **B6. Diagnosis — the smallest explanation.** (Added 27 Aug,
  founder-approved.) A broken mined rule names every cell in the
  relation; the culprit is usually one. Reiter's minimal-diagnosis
  (1987) with spectrum-based fault localisation over B5's
  passing/failing rules computes the smallest cell sets that explain
  every observed break — the one-authoring-decision-one-finding
  principle as an algorithm. The academic blocker (spreadsheets have
  no failing tests) is removed by the mined rules themselves. DONE:
  on planted and real-diff defects, the diagnosis names the planted
  cell in its smallest set at a measured rate, and multi-rule breaks
  collapse to single findings.

## Track C — the Watch

- **C1. The raw version diff** (cells added/removed/changed, by
  formula and by value). DONE: an adjacent ED2 pair diffs completely
  against hand-check.
- **C2. Shift detection.** Dynamic-programming row/column alignment
  in the RowColAlign shape (SheetDiff's successor — the greedy
  hypothesis algorithm misaligns and can loop; the DP version is a
  2-D extension of longest-common-subsequence), run on row/column
  signatures of label hash + formula-shape hash rather than raw
  values, so matches survive a full re-forecast. Its O(n⁴) cost is
  measured on the biggest corpus file before anything depends on it.
  Evaluated by planted edits (our planter discipline applied to
  diff) — the paper's zero-error claim is its authors' number, not
  ours, until our harness reproduces it. DONE: one inserted row
  reads as one structural change; planted-edit recovery measured.
- **C3. The delta report in review language.** New defects, repaired
  defects, moved assumptions, methodology changes, materially
  different outputs — folded and ranked like findings. Includes the
  class-change case (repaired cell, hardcoded tail). DONE: the
  PR24 revision pair reproduces its 84 introduced defects through
  this report.
- **C4. What did not change — the three tiers.** Before any tier,
  the cheap proof: verifying-trace fingerprints — a hash of each
  cell's formula shape and its inputs' values, stored at ingestion
  (Build Systems à la Carte's reading of Excel as a build system).
  Matching fingerprints prove a cell could not have changed, at hash
  cost, no evaluation — shrinking the suspect set the tiers work on
  and keeping the solver the crown, not the foundation. Then tier 2
  first: randomized differential evaluation over the changed cells'
  cone of influence (needs B1/B2 and the dependency graph). Tier 1
  after: Z3 proof for the arithmetic/IF/SUM fragment. Tier 3
  always: named unsupported constructs, honest refusal. Tiers never
  blurred. DONE: planted stealth edits (a change hidden outside the
  declared cells) are caught by tier 2 at a measured rate.
- **C6. The rule-set diff.** (Added 27 Aug, founder-approved.) Mine
  the old version's invariant laws and the new version's (B5's
  machinery), then diff the law sets: « v12 obeys all 47 rules v8
  obeyed, adds 2, broke 1 — cash closing no longer ties to its
  flows in periods 14–15. » Compares behaviour, not positions, so it
  survives inserted rows, moved blocks and renamed sheets by
  construction. Tier-2 strength (no divergence in N samples), stated
  as such, never sold as proof. DONE: on a real revision pair, the
  rule-set diff names the behavioural break the cell diff buries,
  and a planted law-breaking edit is caught with the per-class
  table.
- **C5. The Watch on documents.** Model moved, deck did not ⇒
  finding (the tie-out re-run on the new version). DONE: wired.

## Track D — the Chain

- **D1. Citation-grade extraction.** docling + pdfplumber; every
  number with page and highlight box; scans routed to the paid
  fallback or refused in words. DONE: a term sheet's numbers come
  out with boxes a viewer can highlight.
- **D2. The fact store and source viewer contract** (founder UI on
  top). DONE: fact id ⇒ page + box, served.
- **D3. Link proposal.** Typed model number → candidate document
  facts, matched by labels near both — never by value; abstention
  when candidates tie. DONE: proposal quality measured on a real
  deal set (registered sample, judged from the documents).
- **D4. Confirm-once, arithmetic forever.** A person confirms a
  link; from then on re-checking is deterministic; the confirmed map
  survives model and document revisions (anchor by labels, not
  coordinates). DONE: a revised model re-checks its confirmed links
  with no model call and correct survival.
- **D5. The unsourced-number finding.** A typed number with no
  confirmable source, flagged as its own class. DONE: in the
  report, measured for flood on real models first.
- **D6. Deliverable checking joins the pipeline.** The measured
  deck-to-model tie-out, re-pointed at the Chain's fact store and
  the Watch. DONE: one pipeline, three directions (documents in,
  deliverables out, world outside).
- **D7. The outward checks.** EDGAR company facts, Companies House
  via arelle, the four free rate sources. Each check class measured
  before shipped (does the model-to-filing match produce true
  mismatches?). DONE: « the filing says 409 » works on real US and
  UK names, cited to the filing.

## Track E — units

- **E1. The protocol first.** Ground truth: hand-labelled units
  (currency, scale, period, rate-vs-decimal) for a registered
  sample of rows across real models. Committed before any
  inference exists. DONE: the labelled set exists.
- **E2. Inference.** The Williams-2020 shape: number formats +
  labels + propagation through formulas; abstention as a first-class
  outcome. DONE: accuracy per unit dimension measured against E1.
- **E3. The mismatch checks**, armed only where inference is
  measured-accurate: monthly into annual, percent as decimal,
  currency mixes, thousands vs millions. Flood-killed the usual
  way — every false alarm names a principle. DONE: the flagship
  demo finding (« a monthly figure in an annual line ») exists with
  a published per-class number, or it stays out of the demo.

## Track F — determined corrections and custody

- **F1. Write path completion.** Cell/row creation (A2 of the old
  plan), shared-formula unsharing (A3) — the founder's own test file
  showed most real cells live in shared groups. DONE: the writer can
  touch any cell the corrections need, round-trip verified.
- **F2. The changeset.** Every correction recorded (before, after,
  why, who accepted), applied atomically, invertible — and **every
  write is followed by a full re-read and re-audit as a hard gate:
  any unexpected structural change aborts and rolls back.** Not a
  check that runs; a gate that blocks. (The self-closing-XML bug is
  the standing argument: a construct the writer cannot see will
  exist again, and the re-audit is what catches it.) The changeset
  also carries **« incomplete repair » as a first-class state** —
  not success, not failure — for fixes that leave siblings wrong,
  exactly as the E41 repair did; the Changes UI designs for it now.
  DONE: apply → undo is byte-identical; a sabotaged write is caught
  by its own gate; the founder's Changes UI has its contract
  including the incomplete state.
- **F3. The determined-fix classes**, each with the « determined,
  not inferred » test written first: restore the formula the block
  declares; widen the sum the structure defines; replace the deck
  figure with the model's number; the unit conversion the labels
  determine; the stale figure whose confirmed source moved. Anything
  short of determined produces a finding and no proposal. DONE:
  each class measured on planted cases — including cases where the
  right answer is to refuse.
- **F4. Custody.** Corrections produce a new version held by Swens,
  released only on acceptance; Swens never writes into the
  customer's own stores. DONE: enforced by construction, not by
  policy.

## Track G — Grid, Chat, panel, report (backend halves; founder owns
## every screen)

- **G1. The findings API**: severity, materiality, evidence, cell
  sets, accept/explain-on-the-record, house-rule filtering. DONE:
  the Grid renders entirely from it.
- **G2. Chat anchored to the model**: questions answered from the
  structure map, the graph, the Chain and the Watch — every number
  in an answer cited to a cell or a page; questions outside the
  model declined. DONE: the five canonical questions (why did DSCR
  fall between versions; what feeds equity IRR; where is this from;
  hardcodes above materiality; what changed) answer correctly on a
  real model, judged.
- **G3. The panel contracts**: findings beside the cell, the chain
  behind a number, accept/explain, proposed corrections with
  accept — all as APIs the existing Excel panel binds to. DONE:
  panel runs against them end to end.
- **G4. The report.** The partner-ready document: findings ranked,
  coverage stated, every claim cited, refusals in words. DONE: a
  real model's report survives a hostile read by the founder.

## Track H — delivery

- **H1. Files-only engagement, end to end**: secure intake, a deal
  workspace, versions in, report out, at deal speed with no
  integration. DONE: a stranger's two versions produce the demo
  (findings + delta) within a day, hands off.
- **H2. Closed-by-default deals**, per-deal access, the security
  answers written down before they are asked. DONE: the posture doc
  exists and the defaults are enforced.
- **H3. Connection mode** (SharePoint through the existing
  connector, designated-model-only, re-read on change) — sold to
  existing customers later; not on the critical path.

---

# The order

Tracks run in parallel where they can; this is the dependency spine:

1. **Now:** A2 (cheap head-to-head) · F1–F2 (write path, changeset)
   · B1–B2 (recalculator + fidelity gate) — three independent
   starts.
2. **Then:** C1–C3 (the Watch's diff, on the graph) · B4
   (behavioural checks, behind the gate) · D1–D2 (extraction).
3. **Then:** C4 (equivalence tiers) · D3–D5 (the Chain's links) ·
   A1/A3/A4 (perf, dialect, coverage) · E1 (units ground truth).
4. **Then:** E2–E3 (units) · D6–D7 (deliverables + outward) · F3–F4
   (corrections) · G1–G4 (surface APIs as the founder's screens
   need them).
5. **Then:** H1–H2 (delivery) and the proofs below.

Rough honesty about time: each numbered step is between days and a
few weeks; the whole spine is quarters, not weeks — front-loaded so
that every couple of weeks something new is measured and bindable.

# The proofs that make it « complete » (the founder's document § 10,
# as tests)

1. **The population proof:** ten models from the chosen first
   population, run cold, findings hand-verified — the same test the
   regulator corpus passed, repeated where the market is.
2. **The units proof:** unit inference measured accurate enough to
   ship, per dimension, on real models — or units stays out of the
   product and the demo.
3. **The catch-rate proof:** seeded defects per class across real
   hosts; the per-class catch table published — the number no firm
   in the industry publishes.
4. **The delivery proof:** two design-partner firms taken from
   agreement to delivered findings on files alone, at deal speed.

When all four hold and every § 3 part of `swens.md` is live behind
the founder's screens, the platform is complete — and the compounding
asset (the confirmed link maps, the version history, the gates) is
what makes every deal after that cheaper than the last.

# Division of labour

- **Founder:** every screen — the Grid, the Watch's delta view, the
  source viewer, Chat, the panel, the report's face, the workspace;
  plus the design-partner conversations.
- **Engine:** everything above; each step lands as a committed,
  measured capability with a JSON contract; nothing is declared
  working without its number.
- **Cadence:** when a track lands a step, the founder gets the
  contract and a one-paragraph honest state (what it does, what it
  refuses, what its number is). The plan bends at the checkpoints —
  the head-to-head, the fidelity report, the first design-partner
  feedback — in writing, never silently.

# Amendments

- **24 August 2026** (founder-approved, from the external research
  gap map, each claim checked against our own code and records
  first): C2 names the dynamic-programming alignment on
  label + formula-shape signatures instead of SheetDiff's greedy
  algorithm; C4 gains verifying-trace fingerprints as the cheap
  proof ahead of the tiers; B4 gains ddmin attribution so a broken
  law names its one responsible cell; A7 added — commutativity and
  constant-folding polish to the shape hash, as a measured
  micro-round. The tracks, the method, and every DONE test are
  otherwise unchanged.
- **27 August 2026** (founder-approved): B5 added to Track B —
  relation mining (the model's own laws discovered over the
  recalculator, clean-room from the AutoMR paper), after B4's
  measured table stood at 37/37. Registered rounds and the
  planted-defect discipline apply unchanged.
- **27 August 2026, second amendment** (founder-approved): C6 added
  to Track C (the rule-set diff over B5's mined laws) and B6 to
  Track B (Reiter/spectrum diagnosis over broken rules). Background
  and adopted design laws: `swens-aha.md`.
- **27 August 2026, third amendment** (founder-relayed review,
  adopted): **C6 is gated on two stability preconditions, measured
  before any diff code exists** — (1) seed stability: mine one
  unmodified model five times under five seeds; the rule sets must
  agree, or « v12 broke a rule » is seed noise; (2) cosmetic
  invariance: insert blank rows, rename a sheet, reformat a block;
  the mined rule sets must be identical, or the claimed advantage
  over positional diff is unproven. **B6 is HELD, not cancelled**,
  pending evidence: if real regressions typically break one or two
  rules, blame-the-changed-cell wins and Reiter is over-engineering;
  if they break many, B6 is exactly right — the Ofwat run decides.
  **B5's measurement registers both directions**: overlap with the
  84 static-found regressions AND the set B5 flags that the static
  engine missed, hand-verified — the second set is where the thesis
  lives or dies. **Input typing is one component**: the
  continuous/flag/rate/date classifier B5 needs is E2's unit
  inference wearing another hat — built once, consumed by both
  tracks, never twice by two lanes.
- **28 August 2026, fourth amendment** (founder's direction, in their
  words: « lets just keep working. Until we have a fully complete
  product. Its the bar im setting. I'm okay with waiting… All the
  partners testing will come later. Rn lets build the best engine we
  can. »): **completeness is the bar, and it outranks readiness.**
  Two consequences, binding on every lane's orders:
  1. **Proof 4 (two design-partner firms) is deferred by the
     founder**, not failed and not forgotten. It stays in the four
     proofs; it is simply not on anyone's critical path until the
     founder opens it. No lane optimises for a demo.
  2. **Priority order for the remaining work is by *hole*, not by
     polish**: a part of `swens.md` § 3 that does not exist outranks
     a part that exists and could be better. The named holes, in the
     order the lead will route them: **units (E3)** — the flagship
     finding, absent; **intake (A6)** — one real model in three
     cannot be opened at all; **the Chain's linking (D3/D4)** — six
     failed rounds and no store; **chat's unanswerable questions
     (G2)**; **the arbiter (B3)** — four corpus files wait on it;
     **determined corrections (F3)**; **the outward checks
     (D6–D7)**. « Best engine » is measured by how few of these
     remain, not by how good the finished parts look.
