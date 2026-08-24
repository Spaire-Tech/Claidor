# The plan — every step from today until the product is complete

Written 20 August 2026. Simple words, full detail. The direction is
in `platform.md`, the engine's state is in `engine.md`; this is the
to-do list that connects today to « done ». It replaces the 10 August
Pierce plan, preserved as `plan-pierce-2026-08-10.md` — its tie-out
measurements and its « link confirmed once, re-checked
deterministically » design carry forward into Part F here. Steps are numbered
straight through. Each step says what to do, who does it (Founder /
Engine / Both), and what « done » looks like.

**« Complete » means:** one real paying customer runs the entire
journey — uploads a model, gets a review, opens a project, compares
versions, traces numbers to documents, gets project-finance checks,
shares a scenario app with their lender, generates their deliverables,
lets the agent restructure debt in plan mode, and receives their
quarterly compliance certificate from us. When one customer does all
of that and pays for it, the product is complete. Everything after
that is growth.

## Rules that never change (they apply to every step below)

- **We never mislead anyone** — each other, customers, or investors.
  Placeholder features are labelled as placeholders everywhere,
  including demos.
- **Numbers are only real when measured** — with criteria written down
  before judging. Every engine change passes the corpus gate. Every
  new capability gets a registered measurement before we claim it
  works.
- **Every rung ships two things:** the feature, and a piece of public
  writing about it that brings the next customer in.
- **Plan mode is the entry condition** for anything that changes a
  cell in someone's model. No silent edits, ever.

---

## Part A — Open the door (weeks 1–3)

*Goal: the world can find us, and the shell exists to build into.*

**1. (Engine) Write the teardown article.** Take our PR24 measurement
(« sixteen published regulator models; one revision cycle introduced
84 new mechanical defects ») and write it for humans: what we found,
in which public files, with screenshots of real broken cells. No
product pitch except one line at the bottom: « check your own model,
free. » Done when: the founder reads it and would share it.

**2. (Founder) Stand up the public site.** One page: the article, the
free upload, and an email capture. Done when: a stranger can upload a
model and get findings back.

**3. (Engine) Wire the free upload to the engine.** The upload runs
`audit()`, returns the ranked findings (tier, weight, basis, cell
roster) in a clean report page. Cap file size, queue long files, email
the result if it takes more than a minute. Done when: a 50MB stranger
file returns a readable report with zero setup.

**4. (Both) Decide what the free tier shows.** Show every finding but
the full detail (cell rosters, trace) only after signup. The report
must be genuinely useful free — it is the wedge, not a teaser. Done
when: written down in the pricing notes.

**5. (Founder) Start the platform shell.** All five surfaces —
Projects, Review, Compare, Trace, Apps, Deliverables — with
placeholders and empty states, following the five shell rules in
`platform.md` (real vs placeholder labelled; Review real from day one;
the shell follows the project graph; placeholders replaced the week a
rung lands; empty states written as product copy). Done when: you can
click through the whole product and every empty state says what will
live there.

**6. (Engine) Start the PF corpus hunt — runs in the background from
now until Part D.** Collect real project-finance models and their
contracts: UK PFI/PPP disclosures, public-authority models,
Dumfries-family documents, World Bank/IFC published models, renewable
tariff models. Log each file: source, industry, what it contains.
Target: 15–25 real PF models before Part D starts. Done when: the
manifest exists in `docs/pierce/` and keeps growing.

**7. (Both) Publish the article. Watch what happens.** Every upload is
a lead. Reply to every single person who uploads. Done when: live.

---

## Part B — Compare Workbooks (weeks 2–6, overlaps Part A)

*Goal: « here is what changed between v12 and v13, and here is what
those changes broke. » Nearest new product; reuses the reader.*

**8. (Engine) Build the cell-level diff.** Read two versions of a
workbook with the existing reader. Report: cells added, removed,
changed — split into formula changes, value changes, and structural
changes (rows/columns/sheets inserted or deleted). Handle the hard
part honestly: when a row is inserted, every cell below it « changes »
— detect shifts so we report « row inserted at 14 » instead of 4,000
fake changes. This shift-detection is the actual product; the naive
diff is a weekend. Done when: two real regulator revisions produce a
diff a human calls fair.

**9. (Engine) Build « what the change broke ».** Run the audit on both
versions, diff the findings (this is `corpus_gate.py` repurposed).
Report new defects introduced by the revision, defects fixed, defects
unchanged. Done when: the PR24 pair (the revision that introduced 84
defects) reproduces as a customer-readable report.

**10. (Engine) Fold and rank the diff like we fold findings.** One
authoring event = one diff entry (a row copied across 40 columns is
one change, not 40). Rank by what matters: formula logic changes
first, then values, then formatting-level noise last or hidden. Done
when: a 400-change diff reads in one screen.

**11. (Engine) Registered measurement for Compare.** Before we claim
it works: take 10 version pairs of public models, pre-register the
questions (does the diff miss real changes? does it invent changes?
does shift-detection hold?), judge from the cells, write the numbers
down. Done when: the measurement doc exists with honest numbers.

**12. (Founder) Replace the Compare placeholder with the real thing.**
Upload two files → diff report. Done when: live in the shell.

**13. (Both) Publish piece #2:** « we diffed two published revisions
of a regulator's model — here is what the revision broke. » Done when:
live, with the free Compare behind it.

**14. (Both) First money conversation.** Review free; Compare needs an
account; somewhere here we pick the first price (a monthly seat).
Charge early and small rather than late and big — a paying stranger
teaches more than a hundred free ones. Done when: a price is on the
site.

---

## Part C — Trace and the project container (weeks 5–12)

*Goal: « where did this number come from? » — model → formula →
assumption → source document. The project quietly becomes real here.*

**15. (Engine) Build the precedent walk.** From any cell, walk
backwards through its references (we have `references_of`) to the
inputs it depends on, with the labels from `structure.py` naming each
step: DSCR ← CFADS ← revenue ← P50 yield input. Cap depth sensibly;
fold parallel paths. Done when: clicking a DSCR cell in a real model
shows a readable chain to its inputs.

**16. (Engine) Build the dependency graph as a real object.** Today
references are computed per formula; make the whole-workbook graph a
thing we store per version: every cell, its precedents, its
dependents. This is the « project graph » foundation — trace, the PF
brain, scenarios, and the agent all read it. Done when: the graph for
a 400k-formula model builds in acceptable time and answers « what
depends on this cell » instantly.

**17. (Engine) Build document ingestion.** PDFs into the project: term
sheet, PPA, EPC contract, yield report. Extract the numbers and terms
with page references. We built contract-to-model grounding for
Dumfries; this generalizes it into an input pipeline. Done when: a
yield report yields « P50 = X, page 22 » as structured data.

**18. (Engine) Build the grounding map.** Match model inputs to
document numbers: this margin ties to term sheet page 4; this
availability to EPC schedule 3; this input matches nothing. The
unmatched inputs are a new finding class: « a number no document
supports. » Done when: a real model + its documents produce a
grounding report, measured (registered, judged from cells) before we
claim precision.

**19. (Founder) Make the project real in the shell.** A project =
model versions + documents + the grounding map. Upload slots, version
list, document list. This is the platform arriving — quietly, as a
container Trace needs, not as a launch. Done when: the Acme setup
step (create project, drop in model + 6 documents) works end to end.

**20. (Both) Publish piece #3:** trace as theatre — « click the DSCR,
land on page 22 of the yield report. » Short video. Done when: live.

**21. (Both) Take stock — first real users checkpoint.** By here we
have review + compare + trace + projects. Somewhere in Parts A–C the
first demo calls happened (the demo IS the product on their file — no
deck). Honest question, answered in writing: are strangers uploading?
Did anyone pay? What do they ask for that we did not expect? The plan
after this line bends to what we learn. Done when: written down.

---

## Part D — The project-finance brain (months 3–6)

*Goal: Antford understands project finance economics, not just Excel.
Built the way the grammar was built: from real models, judged, gated,
measured — never from a textbook list.*

**22. (Engine) Freeze the PF corpus for round one.** From the hunt
(step 6): pick the 15–25 models, split them — a lab half we learn
from, an unseen half we measure on. Same discipline as ever. Done
when: manifest committed, split registered.

**23. (Engine) Teach the engine to find the PF skeleton.** In any PF
model, locate: the timeline (construction/operations, the COD switch),
CFADS, the debt schedule(s), DSCR row, the DSRA, the waterfall, equity
returns. This is structure-finding, like `structure.py` but for
meaning: labels + formula shapes + graph position. Done when: on the
lab half, the engine names these parts and we judge how often it is
right (registered measurement).

**24. (Engine) Build the PF checks, one at a time, each gated.** In
value order: (a) DSCR actually equals CFADS ÷ debt service — recompute
it independently and compare; (b) sculpting consistency — if
repayments are sculpted to a target, does every period hit it; (c)
DSRA logic — funded from the right source, sized to the stated months,
released at the right time (this is the Maya finding); (d) waterfall
order — cash flows through the priority order the docs state; (e)
circularity health — IDC and fee circularities converge and are
flagged where hand-broken; (f) covenant headroom — computed ratios vs
the covenant levels from the term sheet (needs Part C grounding).
Each check: principle → implementation → regression test → corpus
gate → registered measurement on the unseen half. Done when: each
check's honest numbers are written down.

**25. (Engine) Plant PF defects and measure recall.** Extend
`plant_defects.py` with PF classes: DSRA released early, DSCR formula
skipping a debt tranche, sculpt target drifting, waterfall line out of
order. Plant into clean PF models, measure what we catch. Done when:
recall numbers per class exist, including the zeros.

**26. (Both) Publish piece #4:** « we checked N public project-finance
models — here is what is broken in them. » This is the piece that
makes PF people take us seriously. Done when: live.

---

## Part E — Review v2 and the second exam (month 6–7)

*Goal: the world's best project-finance model reviewer — structural
grammar + PF semantics in one ranked report.*

**27. (Engine) Merge the PF checks into Review.** One report: tier 1
defects (structural + PF-semantic), tier 2 assumptions at risk
(including ungrounded numbers from step 18), tier 3 hygiene. Re-rank
weights so a DSRA error outranks a hardcode. Done when: one real PF
model produces the merged report and it reads like a senior
reviewer's memo.

**28. (Engine) The second exam.** 10–20 genuinely new models — new
industries, new modelling cultures (project finance, corporate
three-statement, LBO), clean models included, defects planted. The
mentor's bars: >80% unseen precision (must hold), <5% false positives
(holding), >90% recall on broken/overwrites/structural (not met yet:
87%/69%/—), mutations substantially up, and no catastrophic blind
spots — we must always know exactly what the engine cannot see. Done
when: the registered measurement is run and the numbers are written
down, whatever they are.

**29. (Engine) Fix what the exam teaches, gate everything.** Same loop
as Round 5: every false positive names its general fix, every miss
names its detector. Done when: the loop closes — the fixes move the
*next* unseen number, not just the lab.

**30. (Founder) Update the free door to Review v2.** The upload now
finds DSRA errors, not just torn references. The Maya story stops
being the destination and becomes the demo. Done when: live.

---

## Part F — Deliverables, starting with the one that recurs
(month 7–9)

*Goal: documents generated from the model, tied to it. First the one
that is contractually mandatory every quarter for twenty years.*

**31. (Engine) Build the quarterly compliance certificate.** From the
model: the DSCR calculation for the period, laid out the way the
credit agreement requires, every number linked to its cell. Word
output first (banks live in Word). Done when: a certificate generated
from a real model matches one a human would produce.

**32. (Engine) Build the auditor response schedule.** Input: a list of
findings (the model auditor's, or ours). Output: finding → cell →
what changed → in which version — pulled from Compare's history. Done
when: generated from a real project's version history.

**33. (Engine) Build « the deck is stale » checking before deck
generation.** Cheaper and more trusted than generating slides: point
at an existing lender presentation / credit paper, and flag every
number that no longer matches the model (« you changed the sculpt
Thursday; these six numbers are stale »). Full document *generation*
comes after checking works, because checking is measurable and
generation is taste. Done when: a real deck + model pair produces a
stale-number report.

**34. (Founder) Deliverables surface in the shell** — generate,
preview, download, regenerate when the model changes. Done when:
live.

---

## Part G — Scenario apps (month 8–11)

*Goal: the sponsor shares a working scenario tool; the model file
never leaves the building.*

**35. (Engine) Build the lattice runner.** The sponsor picks sliders
(construction delay, price curve, P50/P90, capex, base rate) and
ranges. Real Excel — headless, offline, ours — recalculates the
actual model at every grid point and stores the outputs (DSCR min/avg,
gearing, equity IRR, whatever the sponsor selects). No home-built
calculation engine; every number in the app was computed by Excel
from the real model. Done when: a 5-slider lattice on a real PF model
computes in hours, unattended.

**36. (Engine) Build the app viewer.** A shareable page: sliders move,
numbers and charts update instantly from the lattice, every number
clicks through to its source cell name (not the file). Access
controlled by the sponsor. Done when: a lender-side user can flex
scenarios with Excel closed and the model file inaccessible.

**37. (Both) Handle the lattice's edges honestly.** In-between slider
values are interpolated — label them as such, and offer « compute this
exact point » as a queued job. Done when: the app never shows an
interpolated number as an exact one.

**38. (Both) Publish piece #5:** « stop emailing the model. » Done
when: live, with a public demo app on a public model.

---

## Part H — The Excel agent (month 10–14)

*Goal: « change the sculpt to 1.35x » — planned, shown, approved,
executed, verified. Last because everything else is what makes it
safe.*

**39. (Engine) Build the write path.** Write cells into a real
workbook without corrupting anything: formulas, cached values, types,
styles preserved (the planter's XML surgery grows up into this).
Verified by reading the file back and by opening in real Excel. Done
when: a 1,000-edit write survives round-trip byte-comparison of
everything untouched.

**40. (Engine) Build plan mode.** For a requested change: the plan in
plain words (« resize debt, recalc sculpting, update DSRA funding,
propagate to waterfall — 6 sheets, 84 cells »), the exact cell list,
before/after for each. Nothing executes until approved. Done when: a
real restructure produces a plan a human approves or rejects in
minutes.

**41. (Engine) Build execute + verify.** Apply the plan, recalculate
(real Excel, headless), then run our own machinery on our own work:
Compare (did we change exactly what the plan said?) and Review (did
we introduce any defect?). The agent's edit is not done until the
audit of its own edit is clean. Done when: the verify loop runs
automatically after every execution.

**42. (Engine) Teach the first five tasks, one at a time, each
measured.** (a) size debt to a DSCR or gearing constraint, whichever
binds; (b) sculpt to a target DSCR; (c) add a tranche; (d) fund and
release a DSRA correctly; (e) switch timeline granularity at COD.
Each task: built, then run against models where we know the right
answer, recall/precision written down. « Substantially harder tasks
the agent refuses » is a feature — the agent says what it cannot do.
Done when: five tasks with honest numbers.

**43. (Engine) Skills — the customer's house method.** A customer's
conventions (sculpting method, check-row layout, naming) captured so
the agent builds *their* model. Start as structured config, not
free text. Done when: the same task run under two different skills
produces two convention-correct results.

**44. (Both) Agent measurement published.** Nobody else publishes
agent-edit safety numbers, because nobody else has the gate. « N
edits, zero introduced defects, verified by the same engine that
found 48,000 errors » — that is the trust story. Done when: live.

---

## Part I — After close: the twenty-year loop (month 12–15)

*Goal: the reason project finance beats every other vertical — the
product keeps working after the deal closes.*

**45. (Both) Base case lock.** At financial close, the agreed model
version is locked in the project as the signed base case — a
contractual object we hold. Done when: a version can be locked,
labelled, and never silently changed.

**46. (Engine) Pre/post-adjustment comparison.** A variation (change
order, curtailment settlement, new offtake) = a new version compared
against the locked base case, in the contract's own language:
pre-adjustment model, post-adjustment model, what moved. This is
Compare wearing the contract's vocabulary. Done when: generated on a
real variation.

**47. (Engine) Actuals against model.** Period actuals in (CSV or
typed), tracked against the model's projections, drift reported.
Done when: a year of actuals against a real model produces a variance
report.

**48. (Both) The quarterly loop runs itself.** Each quarter: actuals
in → DSCR computed → compliance certificate generated → sent. The
standing-order deliverable, standing. Done when: it has run for one
real customer for two consecutive quarters without us touching it.

---

## Part J — Call it complete (month 15+, whenever the bar is met)

**49. (Both) Security and trust table-stakes.** Before real lender
data lives with us: access control per project and per party (the
lender sees the app, never the model), encryption, audit log of who
saw what, and the SOC 2 process started (it takes months — start it
around Part F, finish it here). Done when: we would let a bank's
security team read our answers.

**50. (Both) Pricing, finalized.** Seats for the working team,
projects as the second axis (a project with locked base case +
quarterly certificates is priced per project per year), scenario-app
sharing included with the project. The audit-cost argument closes
sales: a model audit runs $25–50k with ~$5k per extra round; every
round we remove pays for a year. Done when: on the site, and at least
three customers pay it without a bespoke discount.

**51. (Both) The completeness test.** One real customer, all ten
steps of the journey: upload → review → project → compare → trace →
PF checks → scenario app → deliverables → agent in plan mode →
quarterly certificate. Each step used in anger, not demoed. Done
when: it happened, and we wrote down where it creaked.

**52. (Both) Say it out loud.** The product is complete. Everything
after this line is growth: more verticals of project finance
(transport PPP, transmission, storage), more house-method skills,
more deliverable types, the live-recalculation engine if the lattice
ever stops being enough, and the bank-side product — the lenders who
received our output every quarter become the customers we never had
to call.

---

## What we deliberately do NOT build (so the plan stays finishable)

- **A spreadsheet calculation engine** — real Excel computes; we
  orchestrate. Revisit only if the lattice provably blocks sales.
- **Chat-with-Excel** — general questions are a commodity; our agent
  does the named PF tasks with a plan, or declines.
- **Pitchbook generation** — we check documents against the model
  first (step 33); we generate only the documents that recur by
  contract.
- **A general-purpose file manager** — the project holds what the
  model draws from, nothing else.
- **Integrations before customers ask** — no data-room, ERP, or BI
  connectors until a paying customer names one.

## Standing risks, named

- **Two people, seven rungs.** The order is designed so any stopping
  point is a working business: A–C alone is a sellable review/compare/
  trace tool. If time or money runs short, we stop at a rung, not in
  the middle of one.
- **The PF corpus may be slow to gather.** That is why the hunt starts
  at step 6, months before Part D needs it.
- **Tracelight or another funded team moves into PF.** Our defence is
  the ladder's bottom: the measured engine, the corpus discipline, and
  the published numbers no one else can honestly claim.
- **The plan will be wrong somewhere.** Step 21 exists for that: what
  real users do in Parts A–C bends everything after it. Amend the
  plan in writing when it bends — never silently.
