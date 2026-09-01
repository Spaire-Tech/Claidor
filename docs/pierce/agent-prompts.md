# Agent prompts — one per piece, paste-ready

Six pieces that can start **now**, each independent of the others.
Create one session per piece and paste its prompt whole.

Everything each agent needs beyond its own paragraph is in
`docs/pierce/agent-brief.md`, which every prompt makes them read first.

**What is deliberately not here.** Pieces 10, 12, 14 and 15 have no
prompt yet, and that is on purpose: 10 needs 6 to work first, 12 is
safest after 6 and 7, 14 needs external accounts and keys the founder
has to obtain, and 15 is by definition last. An agent started on a
blocked piece spends day one guessing, which is the exact failure this
whole brief exists to prevent.

The state each prompt asserts was checked in the repository on 31 Aug
by the lead — but **it is stated as a belief to verify, not a fact to
build on**, because the lead has been wrong about exactly this three
times in a week.

---

## Piece 6 — Linking numbers back to the contract

```
You are building one piece of Swens, working for the founder (they/them).

FIRST, before anything else, run this and read what it prints, in full:

  git fetch origin claude/pierce-phase-6-writing-mjkaj6
  git show origin/claude/pierce-phase-6-writing-mjkaj6:docs/pierce/agent-brief.md

That is the constitution for this work — the audit mandate, the
measurement discipline, and the operational lessons already paid for.
It is NOT on main yet, which is why you fetch it this way. Do not skip
it, and do not proceed if the command fails — say so instead.

Work on whatever branch this session is bound to. Do not try to create
or push to a branch of your own choosing.

YOUR PIECE: the Chain — linking a number in a financial model back to
the clause in the contract, term sheet or quote it came from.


WHAT THE LEAD BELIEVES, FOR YOU TO VERIFY RATHER THAN TRUST:
- polar/tieout/chain/ exists and is substantial: anchor.py, extract.py,
  link.py, propose.py, repository.py, router.py, store.py.
- Six rounds have been attempted and none reached the bar. The recorded
  diagnosis is that the failure is DOCUMENT GEOMETRY - how text is
  extracted off the page - not the matching algorithm.
- Rounds 1-3 of the linker are logged in docs/pierce/logs/ and there are
  several protocol documents. FIND AND READ THEM BEFORE PROPOSING
  ANYTHING. This piece has more failed history than any other, and
  repeating a dead approach is the likeliest way to waste a week.

START HERE, IN THIS ORDER:
1. Audit what exists and what every previous round actually measured.
   Write it down in plain English and commit it.
2. Say whether the geometry diagnosis is supported by the evidence, or
   whether it is a story told after the fact. Be willing to say it is
   the latter.
3. Only then register a round: criteria, bar and prediction committed
   BEFORE you run anything.

Report to the founder in plain English: are we close, what are we
waiting on. No jargon.
```

---

## Piece 7 — The terms table

```
You are building one piece of Swens, working for the founder (they/them).

FIRST, before anything else, run this and read what it prints, in full:

  git fetch origin claude/pierce-phase-6-writing-mjkaj6
  git show origin/claude/pierce-phase-6-writing-mjkaj6:docs/pierce/agent-brief.md

That is the constitution for this work — the audit mandate, the
measurement discipline, and the operational lessons already paid for.
It is NOT on main yet, which is why you fetch it this way. Do not skip
it, and do not proceed if the command fails — say so instead.

Work on whatever branch this session is bound to. Do not try to create
or push to a branch of your own choosing.

YOUR PIECE: the terms table. swens.md section 3d says the Grid holds a
second use of extraction: "pulling the terms out of the contracts, term
sheets and quotes into a structured table, so the model's inputs can be
tested against them at scale rather than one at a time."


WHAT THE LEAD BELIEVES, FOR YOU TO VERIFY RATHER THAN TRUST:
- This is in swens.md — the founder's own product document, which wins
  over everything — but it is MISSING FROM THE PLAN ENTIRELY. Nobody has
  built it and nobody scheduled it.
- Extraction machinery already exists in polar/tieout/chain/extract.py
  and the document corpus work. You should be building ON that, not
  beside it. Duplicating it is a failure of this piece.
- The lead's guess, unverified, is that this is the real fix for the
  Chain's scale problem: comparing a model against a structured table of
  terms is a different and easier problem than linking each number to a
  clause one at a time. Test that guess; do not inherit it.

START HERE, IN THIS ORDER:
1. Read swens.md section 3 whole, so you build what the founder
   described rather than what you would design.
2. Audit what extraction already exists and what it produces.
3. Write down what "a terms table" must contain to be useful to a
   banker, and get that shape agreed with the founder before building.

Report to the founder in plain English: are we close, what are we
waiting on. No jargon.
```

---

## Piece 8 — Decide whether the fancy diagnosis is worth it

```
You are building one piece of Swens, working for the founder (they/them).

FIRST, before anything else, run this and read what it prints, in full:

  git fetch origin claude/pierce-phase-6-writing-mjkaj6
  git show origin/claude/pierce-phase-6-writing-mjkaj6:docs/pierce/agent-brief.md

That is the constitution for this work — the audit mandate, the
measurement discipline, and the operational lessons already paid for.
It is NOT on main yet, which is why you fetch it this way. Do not skip
it, and do not proceed if the command fails — say so instead.

Work on whatever branch this session is bound to. Do not try to create
or push to a branch of your own choosing.

YOUR PIECE: settle an open argument with a measurement. The plan calls
for model-slicing / root-cause diagnosis (Reiter's framework) to explain
WHY a model misbehaves, not just that it does. Nobody has established
whether that earns its keep or is over-engineering.


THIS PIECE IS A MEASUREMENT, NOT A BUILD. Your job is to produce a
defensible answer to "is this worth building", and the honest answer may
well be no. A well-evidenced no is a success here.

WHAT THE LEAD BELIEVES, FOR YOU TO VERIFY RATHER THAN TRUST:
- polar/tieout/recalc/narrow.py and laws.py already exist — there is
  more built here than the plan's status suggests. Read them first.
- The law-mining work (B5) has an extensive history in
  docs/pierce/logs/dynamo.md, including several rounds, a negative
  result that redirected the whole plan, and stability gates that passed
  on 31 Aug (docs/pierce/c6-stability.md). READ ALL OF IT before
  measuring anything.
- Two limits are on the record and both bear on your answer: the mined
  rules are NOT yet recognisable to a modeller, and the rule identity
  cannot tell one year from another. Either could sink the case.

START HERE, IN THIS ORDER:
1. Audit what is built and what every round has already measured.
2. Register the question, the bar and your prediction in a round
   document, committed BEFORE you run.
3. Measure. Then say plainly whether it is worth it.

Report to the founder in plain English: are we close, what are we
waiting on. No jargon.
```

---

## Piece 9 — Make the "what changed" report faster

```
You are building one piece of Swens, working for the founder (they/them).

FIRST, before anything else, run this and read what it prints, in full:

  git fetch origin claude/pierce-phase-6-writing-mjkaj6
  git show origin/claude/pierce-phase-6-writing-mjkaj6:docs/pierce/agent-brief.md

That is the constitution for this work — the audit mandate, the
measurement discipline, and the operational lessons already paid for.
It is NOT on main yet, which is why you fetch it this way. Do not skip
it, and do not proceed if the command fails — say so instead.

Work on whatever branch this session is bound to. Do not try to create
or push to a branch of your own choosing.

YOUR PIECE: the delta report — what changed between two versions of a
model — currently runs about 3x slower than its target of two minutes.
Make it meet the target without changing a single number it reports.


THE HARD CONSTRAINT: this is optimisation, so the output must be
IDENTICAL before and after. The golden-master gate exists exactly for
this: scripts/corpus_gate.py sweeps the 27-model corpus and diffs
finding-for-finding. Read its docstring. A speed-up that changes one
character of one finding is a failure, not a trade-off.

WHAT THE LEAD BELIEVES, FOR YOU TO VERIFY RATHER THAN TRUST:
- The delta machinery is in polar/tieout/watch/ — delta.py, diff.py,
  align.py, signature.py, tiers.py.
- The recorded diagnosis is that the biggest cost is the engine throwing
  away work it just did. Verify that with a profile before acting on it.
- An earlier performance round (docs/pierce/a1-performance.md) got a ~2x
  audit speed-up via parse caching, gate-clean. Read it: the technique
  may apply again, and its measurement protocol definitely does.

TIMING ON THIS MACHINE IS NOISE. Single timings mean nothing here.
Use back-to-back A/B runs and per-file comparisons, exactly as the
earlier round did. Do not quote a stopwatch number as a result.

START HERE, IN THIS ORDER:
1. Audit and profile. Find where the time actually goes.
2. Register the target and your prediction before optimising.
3. Optimise. Re-run the gate every time. Report the A/B.

Report to the founder in plain English: are we close, what are we
waiting on. No jargon.
```

---

## Piece 11 — Test the Excel sidebar properly

```
You are building one piece of Swens, working for the founder (they/them).

FIRST, before anything else, run this and read what it prints, in full:

  git fetch origin claude/pierce-phase-6-writing-mjkaj6
  git show origin/claude/pierce-phase-6-writing-mjkaj6:docs/pierce/agent-brief.md

That is the constitution for this work — the audit mandate, the
measurement discipline, and the operational lessons already paid for.
It is NOT on main yet, which is why you fetch it this way. Do not skip
it, and do not proceed if the command fails — say so instead.

Work on whatever branch this session is bound to. Do not try to create
or push to a branch of your own choosing.

YOUR PIECE: the Excel task pane — findings shown beside the cell, inside
Excel itself. It is BUILT and has NEVER BEEN VERIFIED END TO END. Your
job is to prove it works, or find out exactly where it does not.


WHAT THE LEAD BELIEVES, FOR YOU TO VERIFY RATHER THAN TRUST:
- clients/apps/panel/ is a real Office add-in: manifest.xml, Panel.tsx,
  api.ts, auth.ts, host/, a built dist/, and SIDELOAD.md.
- There is a separate clients/apps/word-addin/ with several manifests.
  Work out which is which before touching either.
- A Microsoft connection IS configured and working — credentials are set
  and the connector can list SharePoint drives, browse and download.
  The lead wrongly told the founder this was missing; check it yourself
  rather than believing either of us.
- A runbook for serving the panel to real Office exists somewhere in
  docs/pierce/. Find it.

THE HONEST DIFFICULTY: you may not be able to run real Excel from this
container. If so, say so plainly and early, and establish exactly how
much CAN be verified headlessly — the manifest's validity, the build,
the API contract, the auth flow, the rendering — so the founder knows
precisely what remains untested and why. Do not report "verified" for
anything you have not actually seen work.

START HERE, IN THIS ORDER:
1. Audit: what exists, what builds, what is tested, what has ever run.
2. Tell the founder what can and cannot be proven from here.
3. Prove everything in the first category. Name the second category
   exactly.

Report to the founder in plain English: are we close, what are we
waiting on. No jargon.
```

---

## Piece 13 — Prove firm-specific rules work

```
You are building one piece of Swens, working for the founder (they/them).

FIRST, before anything else, run this and read what it prints, in full:

  git fetch origin claude/pierce-phase-6-writing-mjkaj6
  git show origin/claude/pierce-phase-6-writing-mjkaj6:docs/pierce/agent-brief.md

That is the constitution for this work — the audit mandate, the
measurement discipline, and the operational lessons already paid for.
It is NOT on main yet, which is why you fetch it this way. Do not skip
it, and do not proceed if the command fails — say so instead.

Work on whatever branch this session is bound to. Do not try to create
or push to a branch of your own choosing.

YOUR PIECE: house rules. A firm must be able to switch checks off and
set its own standards, and the report must change accordingly. This is
BUILT AND WIRED but has NEVER BEEN DEMONSTRATED.


THE DELIVERABLE, CONCRETELY: two different firm configurations, run
against ONE model, producing two correct and visibly different reports —
with the difference being exactly what the configuration says it should
be, and nothing else.

WHAT THE LEAD BELIEVES, FOR YOU TO VERIFY RATHER THAN TRUST:
- The mechanism is in polar/tieout/endpoints.py (_house_rules,
  get_house_rules, an update endpoint that refuses unknown rule keys)
  and the filtering happens in service.py via a rules_off set.
- The rule catalogues are RULE_NAMES and HEADLINES in
  polar/tieout/audit.py and ANALYTIC_RULE_NAMES in analytics.py.
- KNOWN GAP, WORTH CONFIRMING: several rules the engine actually emits
  are absent from those catalogues — gapped-test, typed-over-beat,
  broken-name, currency-mismatch, scale-mismatch were all recorded as
  missing. A firm therefore CANNOT switch those off. If that is still
  true it is a real defect in your piece and it is yours to fix.
- There is a settings screen in the web app. Check it lists what the
  engine runs, and nothing it does not.

START HERE, IN THIS ORDER:
1. Audit: which rules can actually be switched off, end to end, from
   the screen through to the report.
2. Register what the demonstration must show before you build it.
3. Build the two configurations and show the two reports.

Report to the founder in plain English: are we close, what are we
waiting on. No jargon.
```

---

# Follow-up prompts — « check your docs »

Send this to an agent once it has read the brief. It isolates the audit
mandate into one demand with one deliverable, so the founder can see the
audit actually happened rather than take it on trust.

Each names the documents that piece genuinely depends on, found by
searching the repository rather than by memory. **The agent must still
search for more** — a list handed to it is a starting point, and
treating it as complete is the failure this exercise exists to catch.

---

## To the Piece 6 agent (the Chain)

```
Before building anything, audit the documents your piece depends on
against the actual code, and report what you find.

Read at least: docs/pierce/d3-reckoning.md, docs/pierce/logs/scribe.md,
docs/pierce/logs/scribe-decisions.md,
docs/pierce/scribe-answer-key-protocol.md, docs/pierce/corpus-sources.md,
and the Chain sections of docs/pierce/swens.md and swens-plan.md.
Then SEARCH for the ones I have not listed — this piece has six failed
rounds and their records are scattered.

For each document, answer three questions:
1. What does it CLAIM is built, measured or decided?
2. Is that claim TRUE in the code today? Open the file. Run it.
3. If it is not true, what is actually the case?

Then answer directly: is the "document geometry, not matching"
diagnosis actually supported by a measurement, or is it a story told
after six failures? Quote the evidence either way.

Deliver: one plain-English list of every claim that is wrong or stale,
with the evidence. Commit it as a round document. Tell me in simple
words what you found before you propose any plan.
```

---

## To the Piece 7 agent (the terms table)

```
Before building anything, audit the documents your piece depends on
against the actual code, and report what you find.

Read at least: docs/pierce/swens.md section 3 (the founder's own
product document — it wins over everything), docs/pierce/platform.md,
docs/pierce/logs/scribe.md, and the extraction parts of
docs/pierce/swens-plan.md. Then SEARCH for more.

For each document, answer three questions:
1. What does it CLAIM is built, measured or decided?
2. Is that claim TRUE in the code today? Open the file. Run it.
3. If it is not true, what is actually the case?

Then answer directly: exactly how much of the extraction this piece
needs ALREADY EXISTS in polar/tieout/chain/extract.py and the document
corpus work? Building a second extractor beside the first is the main
way this piece fails.

Deliver: one plain-English list of every claim that is wrong or stale,
with the evidence, plus a clear statement of what exists versus what
must be built. Commit it. Tell me in simple words before you plan.
```

---

## To the Piece 8 agent (is the diagnosis worth it)

```
Before measuring anything, audit the documents your piece depends on
against the actual code, and report what you find.

Read at least: docs/pierce/logs/dynamo.md IN FULL — it is long, it
contains several complete rounds, and it holds results people have
already forgotten — plus docs/pierce/c6-stability.md,
docs/pierce/swens-aha.md, docs/pierce/serious-mining.md,
docs/pierce/research-brief.md, and the B5/B6/C6 sections of
docs/pierce/swens-plan.md. Then SEARCH for more.

For each document, answer three questions:
1. What does it CLAIM is built, measured or decided?
2. Is that claim TRUE in the code today? Open the file. Run it.
3. If it is not true, what is actually the case?

Pay particular attention to this: the status file recently claimed two
required measurements had "never been measured" when they had been done
a week earlier and passed. Assume more of that. Your single most useful
output may be a list of things already measured that nobody remembers.

Deliver: one plain-English list of every claim that is wrong or stale,
with the evidence, and a list of what has ALREADY been measured. Commit
it. Tell me in simple words before you register a round.
```

---

## To the Piece 9 agent (make the delta report faster)

```
Before optimising anything, audit the documents your piece depends on
against the actual code, and report what you find.

Read at least: docs/pierce/a1-performance.md (an earlier speed round —
its measurement protocol is the one you must follow),
docs/pierce/logs/prism.md, docs/pierce/logs/atelier.md,
docs/pierce/tier-table.md, and the C-track sections of
docs/pierce/swens-plan.md. Then SEARCH for more.

For each document, answer three questions:
1. What does it CLAIM is built, measured or decided?
2. Is that claim TRUE in the code today? Open the file. Run it.
3. If it is not true, what is actually the case?

Then answer directly, with evidence: where does the time ACTUALLY go?
The record says "the engine throws away work it just did". Profile it
and confirm or refute that before you act on it. And tell me what the
current timing really is — the "3x too slow" figure needs checking,
because timings on this machine are noise and a single measurement
means nothing.

Deliver: one plain-English list of every claim that is wrong or stale,
plus a real profile. Commit it. Tell me in simple words before you
change any code.
```

---

## To the Piece 11 agent (the Excel sidebar)

```
Before testing anything, audit the documents your piece depends on
against the actual code, and report what you find.

Read at least: docs/pierce/microsoft-hour.md, docs/pierce/platform.md,
docs/pierce/logs/atelier.md, docs/pierce/security-posture.md,
docs/pierce/how-antford-checks-a-model.md, docs/pierce/design-reference.md,
and clients/apps/panel/README.md and SIDELOAD.md. Then SEARCH for more.

For each document, answer three questions:
1. What does it CLAIM is built, measured or decided?
2. Is that claim TRUE in the code today? Open the file. Build it. Run it.
3. If it is not true, what is actually the case?

Three specific things to establish, because the lead got one of them
wrong and told the founder the opposite of the truth:
- Is the Microsoft connection configured and working? (The lead said
  no; it is actually yes. Verify for yourself.)
- What permission scopes do we request, and what do they permit?
- Which is the real Excel add-in — clients/apps/panel or
  clients/apps/word-addin — and what is the other one for?

Deliver: one plain-English list of every claim that is wrong or stale,
and a clear split of what CAN be verified from this container versus
what genuinely needs real Excel. Commit it. Tell me in simple words.
```

---

## To the Piece 13 agent (firm-specific rules)

```
Before building anything, audit the documents your piece depends on
against the actual code, and report what you find.

Read at least: docs/pierce/a4-coverage.md, docs/pierce/engine.md,
docs/pierce/tier-table.md, docs/pierce/surface-inventory.md,
docs/pierce/security-posture.md, docs/pierce/swens-build.md, and the A5
sections of docs/pierce/swens-plan.md. Then SEARCH for more.

For each document, answer three questions:
1. What does it CLAIM is built, measured or decided?
2. Is that claim TRUE in the code today? Open the file. Run it.
3. If it is not true, what is actually the case?

Then do this one concretely, because it is the heart of your piece:
list EVERY rule the engine can actually emit, and cross it against the
catalogues a firm can switch off (RULE_NAMES and HEADLINES in
polar/tieout/audit.py, ANALYTIC_RULE_NAMES in analytics.py) and against
what the settings screen shows. Any rule that reaches a report but
cannot be switched off is a defect and it is yours. Several were
recorded as missing; confirm whether that is still true.

Deliver: that cross-check as a table, plus one plain-English list of
every claim that is wrong or stale. Commit it. Tell me in simple words
before you build the demonstration.
```
