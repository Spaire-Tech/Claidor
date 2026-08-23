# The Ambre build plan — every step to a complete platform

23 August 2026. The complete plan for building Ambre (the product
described in the founder's Ambre document), from today's state to
« complete ». It replaces `clone-plan.md` (whose foundations survive
inside it) and sits on the decisions in `ambre-toolbox.md`. The
founder owns UI/UX for every surface; the engine side below is
built UI-less first, and every piece ends in an API the UI binds to.

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

- **A1. The performance round.** The Ambre spec promises 600k cells
  read in under a minute, checks in seconds; today the biggest file
  takes minutes (the mutation detector dominates). Profile, fix,
  keep the gate green. DONE: the spec's sentence is true on the
  biggest corpus file, measured.
- **A2. The cheap head-to-head.** Score the CUSTODES authors' own
  shipped detections with our registered scorer — same files, same
  truth, same conventions. Then run ExceLint's open core on the same
  corpus and score it identically. DONE: a three-way table (us,
  CUSTODES, ExceLint) under one scoring convention, publishable.
- **A3. Dialect witness-widening.** Their truth as the signal for
  looser missing-formula witnesses that arm only on non-model
  dialects; measured there for recall and on our corpora for the
  false-positive price. DONE: both numbers move the right way or the
  widening is rejected on the record.
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
  DONE: the hardcode-in-the-tail class — invisible to static
  reading — is caught and measured.

## Track C — the Watch

- **C1. The raw version diff** (cells added/removed/changed, by
  formula and by value). DONE: an adjacent ED2 pair diffs completely
  against hand-check.
- **C2. Shift detection.** SheetDiff's row/column hypothesis
  algorithm; evaluated by planted edits (our planter discipline
  applied to diff). DONE: one inserted row reads as one structural
  change; planted-edit recovery measured.
- **C3. The delta report in review language.** New defects, repaired
  defects, moved assumptions, methodology changes, materially
  different outputs — folded and ranked like findings. Includes the
  class-change case (repaired cell, hardcoded tail). DONE: the
  PR24 revision pair reproduces its 84 introduced defects through
  this report.
- **C4. What did not change — the three tiers.** Tier 2 first:
  randomized differential evaluation over the changed cells' cone
  of influence (needs B1/B2 and the dependency graph). Tier 1
  after: Z3 proof for the arithmetic/IF/SUM fragment. Tier 3
  always: named unsupported constructs, honest refusal. Tiers never
  blurred. DONE: planted stealth edits (a change hidden outside the
  declared cells) are caught by tier 2 at a measured rate.
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
  why, who accepted), applied atomically, invertible. DONE:
  apply → undo is byte-identical; the founder's Changes UI has its
  contract.
- **F3. The determined-fix classes**, each with the « determined,
  not inferred » test written first: restore the formula the block
  declares; widen the sum the structure defines; replace the deck
  figure with the model's number; the unit conversion the labels
  determine; the stale figure whose confirmed source moved. Anything
  short of determined produces a finding and no proposal. DONE:
  each class measured on planted cases — including cases where the
  right answer is to refuse.
- **F4. Custody.** Corrections produce a new version held by Ambre,
  released only on acceptance; Ambre never writes into the
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

# The proofs that make it « complete » (Ambre §10, as tests)

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

When all four hold and every § 3 part of the Ambre document is live
behind the founder's screens, the platform is complete — and the
compounding asset (the confirmed link maps, the version history, the
gates) is what makes every deal after that cheaper than the last.

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
