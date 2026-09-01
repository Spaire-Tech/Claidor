# Piece 6 — the Chain: the audit, before anything new is built

*31 August 2026. Written for the founder, from the record, before any
new round was registered. Every claim below was checked against the
files this session — the code in `polar/tieout/chain/`, the lane log
(`logs/scribe.md`, 6,161 lines), the verdict files
(`scribe-d3-round*-verdicts.json`), `worklog.md`,
`accuracy-backlog.md`, `d3-reckoning.md`, and the protocol documents.
Nothing is from memory.*

**One deviation, named in writing:** the brief for this piece names
the branch `piece/6-chain`. This session's designated push branch is
`claude/chain-linking-audit-r8xr65`, created from the current `main`
tip (`a85db46`) — same base, different name. The work is on that
branch because it is the only one this session may push to.

---

## 1. What exists, verified in the tree

`server/polar/tieout/chain/` is real and substantial, and it matches
what the lane log claims, file for file:

| file | what it is | state |
|---|---|---|
| `extract.py` | D1 — numbers off a PDF page with page + box + line, scans refused in words | **shipped, v5** — the round-V baseline repair in place (`_LINE_TOLERANCE = 1.5`, `_SCRIPT_UP = 6.5`, `_SCRIPT_DOWN = 3.0`), the dash-nil rule, the column anchor recorded but not scored |
| `store.py` | D2 — the fact store, deterministic UUID5 ids, refusals stored beside facts | **shipped and merged**, route-level tested |
| `propose.py` | D3 — the matcher: label overlap, never-by-value, `FLOOR = 0.5`, exact-tie abstention, two reference defenses | **built, honest, and it has never proposed a correct source** — see § 3 |
| `router.py` | the routes; every proposal response carries a standing sentence stating the measured record (« 0 times out of 36 ») in-band | shipped |
| `anchor.py` | D4's re-anchoring — labels locate, values only report | **8 of 8 on its registered survival table**, plus 4 extra cases |
| `link.py`, `repository.py` | D4's confirmed-link store, `value_at_confirmation` amendment in, re-check route with the four verdicts | **built and approved**, 13 route-level tests; **zero real confirmations exist** |

So the founder's sentence in the plan — « propose links, a person
confirms, then re-checking is arithmetic forever » — is **two thirds
built and one third broken**: confirming works, re-checking forever
works (0.51 ms per link, no model call by construction), and
**proposing has never once been right.**

## 2. Every round, and what each one actually measured

There are two directions in this track and the record only makes
sense when they are kept apart.

### Direction A — a document quotes the model's outputs (memo, deck, annex → cell)

This is the *other* half of the Chain, and it mostly works:

| round | corpus | result |
|---|---|---|
| deck tie-out | planted errors | **100% / 100%** — DONE in `pieces.md`, not disputed |
| Ofgem crosscheck, first run (12–13 Aug) | Finance Annex ↔ GD-BPFM, ~140k cells | 12 proposals, **all 12 false** — FAIL |
| the re-test after three named fixes | same pair, same protocol | 6 proposals, **5 true — 83% precision**, 1 false drift; **FAIL on recall** (1 of 5 targets) |
| linker rounds 1–4 (13 Aug) | same pair; era prior, entity scoping, torn labels | round 4: **13 proposals, 13 agreeing, zero drifts — the first PASS**; held-out Cadent sweep 5/5, zero false drifts; held-out *recall* never measured |
| Dumfries grounding | first real closed-deal pair | **0 of 3 recall** (redaction + OCR + « issued share capital » vs « Equity »), 0 false drifts across 1,497 × 199,098 |

### Direction B — a contract clause feeds a typed cell (the Chain proper, `chain/propose.py`)

The « six failed rounds » of the brief. What each one measured, exactly:

| round | corpus | what it measured | result |
|---|---|---|---|
| D3 r1–3 (26 Aug) | Ofgem ED2, 30 seeded typed cells | the **unsourced** case — none of the 30 is stated by the documents | v1: 8 false proposals → v2: 2 → v3: **0 false, 30 of 30 correct abstentions.** The unsourced side *works* |
| D3 r5 (27 Aug) | Finch (7 doc→model tasks), 42 drawn cells | the first real hit-rate | **recall 0 of 18** — 12 of 17 misses are the tie rule on table rows |
| D3 r6 | same rows | column anchor scored | **died by its own criterion** — 2 new confident wrongs, 0 fixed |
| D3 r7 | same rows | keep `$`/`%` symbols as tokens | mechanism worked, **number did not move** — blockage located on the **model side**: two cells named « $ Total Direct Expense » because `Cell.column_label` reads one header row |
| part B (28 Aug) | the 18 rows the judge had set aside | the honest denominator | **recall 0 of 35** (later 0 of 36) — the earlier 0-of-18 was a flattering denominator |
| D3 r8 (28 Aug) | **RMU FERC Form 1 → formula rate** — the only pair with third-party truth (the filer's own 47 citations) | 15 scorable rows, whole document as pool | **0 correct, 2 wrong, 13 abstained — kill criterion fired** |

Alongside those, the D1 extraction rounds: dash-nils shipped (750
nils, 20/20 hand-check); then the character-spacing defect (56% of
Finch's facts shredded into single digits) — **rounds P, Q, R, S and T
all died by their own registered criteria**, and **round V shipped**
under the founder-decided « undamaged » bar: 2,653 invented facts
gone, ED2 and the nils untouched to the unit.

And D5 (the unsourced-number finding): measured to a decision —
only the « all-but-this-one » threshold survives flood, ~1 finding
per deal — and **shelved by the founder with a named trigger** (D4's
store holding confirmations from a real deal).

### The lifetime tally (Scribe's own, reproduced from the committed verdict files)

**Six rounds, three corpora: 0 correct proposals, 15 false proposals,
109 true abstentions.** `propose.py`'s precision over its whole life
is 0 of 15. Its abstention behaviour is measured excellent. The one
qualification `d3-reckoning.md` rightly forces: the **earlier linker
implementation** (direction A) did reach 83% precision and a PASS,
so « the Chain has never made a correct link » is false as a sentence
about the task — it is true only of `chain/propose.py`.

### Registered and never run — the two best test assets we own

1. **Kelso (D3 round 4).** 73 « clause → term → figure » rows written
   by the deal's own bankers — the strongest external truth ever
   found. **Never ran**: the three contract PDFs are unreachable
   (expired TLS, 1 MiB archive cap, 13 probed bucket keys all 403).
   The models *are* reachable. Harness committed and proven on a
   stand-in. Closed by the lead, revives the day three PDFs arrive.
2. **The answer key.** Protocol registered
   (`scribe-answer-key-protocol.md`), document selected by frozen rule
   and fetched (the £3.2bn HM Treasury–Ireland facility agreement,
   sha256 recorded). **Construction never started** — the next turn's
   orders moved Scribe onto engine speed (A1), and the lanes were
   stood down two days later.

## 3. The verdict on the geometry diagnosis

**The diagnosis on record** (worklog, twenty-ninth sweep, carried
into `pieces.md` piece 6 and `research-brief.md`): *« That is a
document-geometry problem, not a matching one, and no amount of
matcher tuning touches it. »*

**That diagnosis is not supported by the evidence, and the evidence
that refutes it is Scribe's own, committed the following turn and
never swept into the queue.** Said carefully:

**What is true in it.** The geometry defects are real. Round V fixed
a real one (2,653 invented facts). The two-page spread is real: four
of round 8's fifteen rows cite a continuation page that carries no
labels at all, and the founder's research round confirmed no
published method handles it (PubTables-v2: every model scores 0.000
on split tables).

**What the counterfactual says.** Scribe's round-9 investigation
(twenty-fourth « go ») **hand-supplied a perfect repair** — took the
facing page's labels, verified by eye, and gave them to the
continuation page's rows — and re-ran round 8:

| | correct | wrong | abstained |
|---|---|---|---|
| round 8 as run | 0 | 2 | 13 |
| **+ perfect geometry fix** | **0** | 2 | 13 |
| + halve the candidate pool too | **0** | 2 | 13 |

**A perfect geometry repair buys zero.** Fixing the spread converts
« unreachable » into « tied », never into « correct ». Six document-side
levers were then tested in every combination — spread fix, dedupe,
unglue, prose exclusion, rarity weighting, page-context tie-break —
and the best any combination achieved was removing the two wrong
answers. Still 0 correct.

**Where the failure actually is, measured:**

1. **On FERC, the binding gap is page selection.** Given the *right
   page* with prose excluded, the row label alone resolves **9 of
   15**; across the whole document the ceiling is 4 of 15 and the
   score is 0. Every page-scoring design tried (three of them) was
   won by the densest page in the filing — the balance sheet is a
   universal false donor.
2. **On Finch, the binding gap is the tie rule.** The oracle bound
   (committed as `scripts/corpus_d3_oracle.py`): the truth is the
   **single top-scoring candidate for 6 of 13 rows**, and D3 abstains
   on every one because the top is tied. The rules cost that recall,
   not the evidence — and a *blind* tie-break would produce ~1.2
   right and ~4.8 wrong, which fails the lane's own kill criterion,
   so abstaining is correct *given the current evidence*, and the
   whole headroom belongs to a tie-breaker better than chance.
3. **A real subset is unreachable by labels on any corpus, ever** —
   page 354 prints « Transmission » on three lines (Operation,
   Maintenance, Total) and the model's name carries no signal of
   which; and the model side itself hands over colliding names
   (`Cell.column_label` reads one header row of a two-level header —
   flagged to Sentinel, still open). Those rows need model-side
   evidence (what the cell feeds), not document repair.

**So: the geometry sentence is a story that fossilized.** It was an
honest first read of round 8, written the day the round landed —
and it was refuted by measurement within a day, in a push that was
never swept before the lanes were stood down. `pieces.md`,
`research-brief.md` and the worklog all still carry it. The failure
is the **matching design** — one label string scored against every
line of a whole document — with page selection the largest measured
component, not the page geometry. Building a document-geometry round
first (as piece 6's queue entry implies) would repeat a measured
dead end: **that exact fix was simulated perfectly and bought
nothing.**

## 4. Are we close? (plain English)

- The confirm-and-recheck half of the Chain is **done and tested**:
  a person confirms a link once, and every later re-check is
  arithmetic, fast, with no model call possible by construction.
  What it lacks is not code — it is **one real deal with a person
  confirming links**.
- The propose half has never been right, but the failure is now
  **located, bounded and priced** — and round 10 (registered and run
  after this audit, `chain-round10.md`) moved one piece of it: page
  selection by schedule title works, **11 of 15**, against 3 of 15
  for every earlier page scorer. End-to-end recall is still zero, for
  two newly named causes: the schedule's own repeated title line ties
  with every strong label (circular evidence), and the 0.5 floor
  rejects statutory phrasing that shares one word in three. Zero
  wrong answers throughout — the honesty held.
- Round 11 (`chain-round11.md`) then took the founder's decision — a
  floor derived from deliberately-shuffled labels, never chosen — and
  the control **refused a lower floor and proved the refusal
  correct**: the one-shared-word truths score exactly what
  deliberately-wrong pairings score (0.333 against 0.333). Label
  overlap inside a selected page is now exhausted by measurement; the
  unplayed evidence is model-side (account numbers, the formula
  graph) and the spread's label-half question, both put to the
  founder in that document.
- The abstention instrument is genuinely good (30 of 30, 109 true
  abstentions) and the product already tells the truth about itself
  in-band.
- **Waiting on:** a **real deal's unredacted papers** — the Kelso
  round (§ 4a) proved no public pair can test the product case, so
  the next honest measurement needs a deal room or the registered
  answer-key construction; Sentinel's `Cell.column_label`
  stacked-header fix (still the thing between D3 and part of its
  recall); and a first real confirmed deal for D4/D5.

## 4a. Kelso intake — 31 August, the founder's upload, verified

The founder sent `KelsoHighSchoolFinancialModel.xlsm` (4,231,503
bytes, sha256 `e35ec98254a8…`). Verified rather than assumed:
**byte-identical to the public bucket copy** the committed fetcher
(`corpus_sft_models.py`) already reaches — same sha256, fetched and
compared this session — so the model needs no upload in future, and
nothing about round 4's blocker changed on the model side.

What the file settles is better than reachability: the answer sheet
round 4's registration rests on is confirmed **in** it. The tab is
named **`Gaps List`** — 73 rows, columns « No. · Clause No. ·
Information Required · Information from Model · Description of
Document » (« Schedule 1 → Base Credit Facility Commitment →
21,461,602.52 ») — the deal team's own clause → term → figure map.
Two sibling tabs (`Credit Agreement Gaps`, `DBFM Gaps`) carry the
same shape with document references.

**Round 4 has now run** — the founder supplied the signed Project
Agreement (7,702,131 bytes, sha256 `78ac5bff9b76…`) the same day.
Result, in `chain-kelso-round.md`: **0 of 50 rows reachable.** 31
rows cite papers never published, 10 carry no figure, 6 sit behind
black redaction bars in the published copy, and 3 are handwritten
into the executed copy and destroyed by OCR — readable by eye
(« 21.85 % », « £1,901,275.00 »), invisible to any text layer. The
matcher was never tested; the *pair* was, and it cannot carry the
test. The Dumfries redaction finding is replicated against the deal
team's own answer key, and the conclusion is the reckoning's, reached
a third time: the real test of the Chain lives inside a deal room
with the unredacted papers, not in public archives.

## 5. Corrections this audit owes the record

1. `pieces.md` § 4 piece 6 says « the diagnosis says it is document
   geometry, not matching ». Corrected by § 3 above; the queue entry
   now points here.
2. `pieces.md` § 1b labels the typed-number row « Piece 2 » where the
   queue says Piece 6 — a stale cross-reference, noted.
3. « Six rounds and none reached the bar » is right for
   `chain/propose.py` and wrong as a sentence about the task: the
   direction-A linker passed its registered protocol (13/13, zero
   drifts) and measured 83% precision — `d3-reckoning.md` already
   made this correction and it bears repeating wherever the six-round
   figure travels.
