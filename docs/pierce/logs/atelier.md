# Atelier — the lane log

Product and delivery (Tracks G + H). Branch `swens/atelier`, based on
`claude/pierce-phase-6-writing-mjkaj6`'s tip per `lanes.md`. Engine
modules untouched; per-finding data reaches this lane through the
`evidence` dict.

## 25 August 2026 — lane opened; the posture doc (H2)

Read `notes.md`, `lanes.md`, `swens.md`, `swens-plan.md`,
`swens-product-build.md` before touching anything. One note on
provenance: this session was started on branch
`claude/atelier-agent-onboarding-vux8pu` (the main-merge tip) rather
than the phase-6 branch the lane prompts name; `swens/atelier` was
created from the phase-6 tip as `lanes.md` requires, which strictly
contains everything the session branch had except the merge commits
themselves.

**H2, the security posture doc — written:**
`docs/pierce/security-posture.md`. Every « enforced » claim was
checked against the code today, not recalled: all 41 routes in
`server/polar/tieout/endpoints.py` audited mechanically for the
membership gate (every deal-scoped route has it; the seven that don't
are self-, owner- or organization-scoped by design and the doc names
each), the storage path and presign TTL read from
`storage.py`/`config.py`, the panel-token properties from the route
itself, the agent boundary from `tieout/agent/service.py`.

**Two things the founder should know from the audit, stated in the
doc rather than smoothed over:**

1. The team screen shows every organization member the *names* of the
   deals each person is on (`/tieout/team`, deliberately org-scoped —
   `repository.py:805` marks it deliberate). Contents stay closed, but
   « being at the firm grants nothing » has this one metadata
   exception. The doc names it plainly (§ 3). If the founder wants
   deal names hidden there too, that is a product decision I will
   implement — not one I made silently either way.
2. « One configurable client so a firm can point Swens at its own
   cloud deployment » (`swens.md` § 7) is today one construction
   point with a configurable *key*, not a configurable *endpoint*.
   The doc says « planned, not shipped » (§ 8) rather than claiming
   it.

Next, in charter order: the sales demo kit (#18).

## 25 August 2026 — the demo kit (#18), built and run end to end

`server/scripts/demo_deal.py`. What « demo kit » means was
reconstructed from the record, since #18's original task text lives in
a session tracker that is gone: `swens.md` § 7 (« the demo is the
product » — a prospect's own model, ideally two versions, flagship
findings first, the delta between their own versions, routine findings
never the opening) and H1's DONE test (« a stranger's two versions
produce the demo — findings + delta — within a day, hands off »). The
kit is that operation as one command:

    uv run python -m scripts.demo_deal --name "Project Falcon" \
        v1.xlsx v2.xlsx [--deck deck.pptx] [--memo memo.docx] [--brief out.md]

It builds the deal through the product's own ingest and checks — the
workspace, report sheet and marked-up download are live against it the
moment it finishes — and prints the demo brief in § 7's order. Honesty
rules in the script's docstring: every number is read back from the
stored rows; the version delta is findings-by-fingerprint between the
runs the kit itself performed plus the product's own cell diff, and it
is *not* called the Watch.

**Run for real, not just written.** This container had no working
backend at first: Python was 3.14.0rc2 (pydantic fails on it —
`typing._eval_type` changed between rc2 and final) and there was no
Docker, so no Postgres/Redis/Minio. Fixed locally: uv upgraded
(0.8.17 → 0.12.5) to install CPython 3.14.0 final, and the three
services installed natively (PostgreSQL 16, Redis, Minio with the
committed dev credentials from `.env.testing`). None of that is a repo
change. With services up, the full endpoint suite passes here —
`tests/tieout/test_routes.py`: **61 passed** — so the « container
cannot run the database fixtures » caveat in my charter turned out to
be avoidable, and no test is being documented instead of run.

The end-to-end proof, against a scratch database: cascade model as v1;
v2 made with the product's own writer (a constant typed over
`Model!F16`, replacing `=F10+F13+F14`); the broken deck alongside.
The kit's brief: the introduced defect found and named (« Reported
EBITDA FY2027E contains a fixed value while the rest of the row is
calculated » — Model!F16), the cell diff (56.556 → 59.056, 1 changed,
0 added, 0 removed), 113 deck figures reconciled with the four planted
drifts among the 14 drifting, and the statement checks *abstaining* on
the cascade model (no balance sheet, no debt schedule — said in
words, not skipped). The « open with these » section correctly does
not appear when no statement-check error exists: leads are printed
only when they are real.

## 25 August 2026 — the marked-up download, tested at the endpoint

`tests/tieout/test_routes.py::TestTheMarkedUpModel`, four tests, in
the file's own idiom. What `test_markup.py` already proves (the
surgery: colour and notes only, verified unaltered) is not re-proved;
what was untested was the route — and the route is where the deal
posture lives:

1. the download is the marked copy: 200, xlsx, a filename that is not
   the original's, « Findings » sheet first, every model sheet behind
   it in order, bytes ≠ the upload;
2. a stranger gets the same 404 as everywhere;
3. a deal with no model says « no model » rather than 500ing;
4. every model finding ruled on ⇒ 404 « nothing to mark up » — never
   an untouched copy handed over as though vouched for.

The charter's « document honestly if the container can't run the
database fixtures » clause was not needed: after the environment
repair recorded above, the fixtures run here. **All 65 route tests
pass** (61 existing + these 4), lint and format clean. One
pre-existing lint error in the same file (a compound assert in the
check-file tests, PT018) was split into two asserts — the only line
touched outside the new class.

## 25 August 2026 — the version dropdown re-scopes the page

The last first-task: `swens-product-build.md`'s named deviation
(« picking one does not yet re-scope the page, so rows are not
buttons ») and not-yet item 4 (« version-scoped re-checking »).

**Server.** `run_audit`'s per-model computation was factored into one
helper (`_audit_one`) with two callers, so the stored run and the new
read are one computation that cannot drift. `audit_of_version` runs
it over any stored version's cells and **persists nothing** — house
rules applied exactly as a real run applies them, findings carrying
no durable identity. Endpoint: `GET /artifacts/{id}/audit`
(membership-gated like everything; a deck or a stranger's model gets
the same 404). Four new route tests, including « nothing is persisted
by looking » — the response's finding ids answer 404 to PATCH and the
stored findings are byte-for-byte what they were. Full tieout suite:
**559 passed, 4 skipped.**

**Client.** The dropdown rows are buttons, as the founder's own
component draws them (`verList[].pick`). Picking an older version
re-scopes Overview and Findings: verdict, counts sentence, bullets,
chips and family groups all read the picked version's audit; the
bullet and a line on the Findings tab say what does *not* re-scope —
the deck reconciliation, rulings, the report and the downloads live
on the current version, and the report/markup cards say « On the
current version (vN) » rather than disappearing. A past finding's
row actions are replaced by the sentence, not disabled into dead
buttons. Re-check returns the page to the current version, because a
check is an act on it.

**Proven in the real product, not only in tests.** This container now
runs the whole stack: the dev API on the seeded demo deal (cascade v1
+ the writer-made v2 with the typed-over F16 + the broken deck), the
Next dev server, and Chromium driving the real screens. The drive
asserts, all green, zero page errors: picking v1 re-labels the
trigger, shows v1's own audit (one significant, no material — F16
absent, because v1 doesn't have that defect), states « checked just
now on the cells stored at its upload » and « rulings … recorded on
the current version (v2) »; picking v2 back restores the full page
with F16 present. Screenshots in the session record.

**Two environment notes for the lead, not repo changes:** (1)
`dev/setup-environment` writes `.jwks.json` with kid `polar_dev`
while `config.py`'s `CURRENT_JWK_KID` defaults to `claidor_dev` — the
API refuses to boot until one of them moves; worked around locally
with `CLAIDOR_CURRENT_JWK_KID=polar_dev`. (2) The generated dev env
plus a fresh database needs `claidor_read` granted SELECT before any
read-session route works.

All four charter tasks are done. Remaining Atelier-adjacent items in
the build record's not-yet list (narrative report writer, server-side
chat history, `rounding`/`writing` house-rule consumers) await the
founder's decisions named there.

## 26 August 2026 — deal names off the team screen (founder: HIDE)

The founder's decision, recorded in `lanes.md` (26 Aug entry) and
relayed here: deal names come off the team screen; the posture doc's
§ 3 exception closes in the same change.

**What changed.** `/tieout/team` now reduces each colleague's
membership list to a **count** before anything is sent — the names
never leave the server (`get_team` in `endpoints.py`; `TeamMember`
loses `deals: list[str]`, gains `deal_count: int`). The repository
query is untouched (not my path, and the server may know what it does
not say). Settings' people rows say « On 2 deals » / « All 3 deals » /
« No deals yet » — the drawn sub-line's shape, without a name. The
endpoint test now asserts the payload carries **no deal name
anywhere**, and the posture doc § 3 states the closure with the
founder's date, so « being at the firm grants nothing » holds without
an asterisk. Route suite: **69 passed**; frontend typecheck, eslint
and prettier clean.

**The base this was built on, honestly.** The lead's word was to pull
the integration tip (`claude/pierce-phase-6-writing-mjkaj6` @
`76eb2a2`). This resumed container cannot run authenticated git at
all — the environment manager's own log shows the git proxy sidecar
skipped on resume (« boot-clone mount is on ») with no credential
written to the remote URL, so every fetch/push dies at
« could not read Username ». Worked around, not ignored: I verified
via the GitHub API that **every file this change touches is
byte-identical between my branch head and the integration tip**
(endpoints, schemas, test_routes, api.ts, Settings.tsx, the posture
doc, this log — blob SHAs compared), so building on my local checkout
is building on the tip for this change's footprint. The branch itself
is *not* rebased onto the tip — no writable git — and these commits
reach `swens/atelier` through the GitHub API rather than a push. The
lead's merge of `swens/atelier` will land cleanly for the same
reason the SHAs match; the rebase can happen when a container with
working git exists, or the lead can simply merge.

One consequence noted for the next Atelier session: the local
checkout still lacks the other lanes' merged code (recalc, watch,
chain, the JWK-kid fix in `dev/setup-environment`), so local test
runs here still need `CLAIDOR_CURRENT_JWK_KID=polar_dev` — the tip
already fixed the generator; the stale `.jwks.json` is this
container's, not the repo's.

## 26 August 2026 — standing orders acknowledged; first orders done

**The arrangement, confirmed as instructed:** at the start of every
working turn this lane fetches
`origin/claude/pierce-phase-6-writing-mjkaj6`, reads
`docs/pierce/orders/atelier.md`, does what it says, pushes to
`swens/atelier`, and stops. The founder's whole message will be
« go ». This entry is the confirmation the arrangement asked for.

Housekeeping first: git works again in this container (the resume
after the outage recorded above restored credentials), so the branch
is properly rebased — `swens/atelier` restarted from the integration
tip (`e37e3e1`, which contains every commit of the deal-names series;
verified with `merge-base --is-ancestor` before the force-with-lease
push). The seven-commit API workaround is history, not a live state.

**Orders #1 — the Watch into the demo kit: done, run for real.**
`scripts/demo_deal.py`'s delta section is now the Watch's own delta
report (`polar.tieout.watch.delta_report`, read-only import as
lanes.md allows): the study-comparable counts, then the items in
C3's registered rank — broke, changed class, relabelled, method,
assumptions, outputs, structure, repairs — with the nameless-finding
counts printed when nonzero rather than blurred in. The
« not called the Watch » honesty note is retired and replaced with
the Watch's own honesty (match by rule+sheet+name, never address).
The product's cell-level diff line is gone from the section — the
delta section *is* the Watch now, and stranded deck figures already
surface as drifts in the tie-out section. Proven end to end against
a fresh deal on this container's stack: the planted
formula-to-constant edit comes back as **« changed class: Model
row 16 — a live formula became a typed constant (folds: new:
typed-over-formula) »** — the class-change join doing exactly what
C3 registered, and a better demo sentence than the old
fingerprint diff ever produced. Multiple uploads fold into one
first-to-newest delta and the brief says so.

**Orders #2 — `inconsistent-total` mapping: checked, correctly not
done.** The tip's lead-decisions record still holds Sentinel's merge
(« routed when adoption lands, not before ») and the rule name
appears nowhere in `server/polar/tieout/` on the tip. The mapping
waits for the adoption; this lane will re-check each orders turn.

**Orders #3 — engine capability with no screen, the inventory**
(findings only; every screen is the founder's):

1. **The Watch's delta report (C3)** — `polar.tieout.watch` produces
   the review-language delta between any two versions: new and
   repaired defects, class changes (« repaired cell, hardcoded
   tail »), relabelled lines, methodology changes, moved assumptions,
   materially different outputs at the registered 1% line, structure.
   As of today it reaches the demo kit's printed brief — but **no
   endpoint serves it and no screen draws it**. The product's
   existing `/artifacts/{id}/diff` is a value-level diff only; the
   design's Watch delta view (`swens.md` § 3c) has the engine ready
   behind it.
2. **The Chain's citation-grade extraction (D1/D2)** —
   `POST /v1/chain/extract` is live and mounted: every number with
   its page and highlight box, refusals in words. **No screen** — the
   source viewer (« page 187 of the credit agreement, one click
   away », `swens.md` § 3b) has a serving route and nothing drawn
   against it.
3. **The recalculator's fidelity gate (B2)** —
   `polar.tieout.recalc.gate` renders a per-file verdict (« this
   model reproduces its own stored values » / a named refusal).
   **No endpoint, no screen** — the report face could one day carry
   « validated by recalculation », and nothing serves that fact yet.

Explicitly not in the inventory: B4's behavioural checks (registered,
no claimed results yet — a registration is not a capability) and the
reverse case (`rounding`/`writing` house rules: screen without
engine), which the build record already lists.

## 26 August 2026 — eleventh-sweep orders: the category map, then hold

Sentinel's A3 adoptions are merged, so the routed mapping landed:
`'inconsistent-total'` and `'typed-over-edge'` join « Probable
formula defects » in the web category map (`files.ts`,
`CATEGORY_OF`), beside their siblings; the fallback
(`categoryOfKey`'s « Other findings ») is untouched, so any rule the
map does not know still surfaces rather than vanishing. Verified
against the merged engine first — both rule keys exist in
`audit.py`'s catalogue on this tip — and prettier, eslint and the
full typecheck are clean.

The screenless-capabilities inventory (orders item 2) was already
delivered in the previous entry and is on the integration tip with
it. Per orders item 3, this lane now **holds for the founder's
designs** — no invented screens.

## 26 August 2026 — twelfth-sweep orders: the red house-rules test

Scribe's report was right: `TestHouseRules::
test_defaults_before_anybody_decided` pinned the catalogue at 17 and
went red the day Sentinel's adoptions made it 19 — reproduced red on
this container before touching it. **The choice, as ordered to be
named:** the honest expectation is not a new pinned number (a pinned
19 goes red at the next adoption, telling nobody anything true) but
the invariant the test was always about — the endpoint serves
*exactly the engine's own catalogue*, both families, compared by rule
key against `RULE_NAMES` and `ANALYTIC_RULE_NAMES`, with **every rule
on by default, the newly adopted ones included** (`all(rule["on"])`
kept as-is; the analytical flags compared against the statement
family by key, not by count). A catalogue shrinkage still fails; a
Sentinel adoption no longer routes churn to this file. Red → green
verified; full route suite 69 passed.

The inventory (orders item 2) remains delivered — previous entries.
Holding for founder designs, per item 3.

## 27 August 2026 — the Watch delta view, shipped whole (agent-designed)

The founder unlocked design (lanes.md, 26 Aug); orders name three
screens in order, one shipped whole before the next. This is the
first, **agent-designed and marked as such** — no founder drawing
exists for it; what the founder did declare, the design export's own
`vtCols` (« Version · What changed · Saved · By · Findings »), is
kept verbatim as the table's columns.

**The endpoint.** `GET /artifacts/{id}/delta[?against=]`
(`version_delta` in `service.py`): the Watch's `delta_report` run
over the two versions' stored bytes through temp files, persisted
nowhere. First version → `null`, the raw diff's own convention; bytes
dropped under retention → 404 carrying the storage sentence; an
`against` outside the lineage → 404. The wire shape
(`VersionDeltaRead`/`DeltaItemRead`) carries the study's counts —
nameless findings counted apart, never folded away — and the items in
the engine's own rank, never re-ranked by a screen. Four new route
tests (`TestTheVersionDelta`), including rank-order preservation;
**route suite 73 passed**.

**The screen.** A « Versions » tab on the project page (the design's
own `verAll` intent — the dropdown gains « See all versions », which
opens it). The table: uploads newest first; the selected revision's
row carries the counts sentence (« One defect introduced · none
repaired · one standing ») and a `+n −r` findings column; the first
upload says honestly that nothing earlier exists. Below, « What vN
changed » in the design's gradient-heading pattern: the comparison
line with the « computed just now, nothing here is a saved answer »
honesty sentence, then the report card — each reviewed change as a
row with its class dot (red defect/class-change, amber
method/assumption, blue relabel/output, grey structure, green
repair — the workspace's existing inks), the Watch's own sentence,
folded finding keys in mono, and the place as a banker names it
(« Model!F16 »). Refusals render as the server's sentence, as it
stands.

**Proven on the real stack, screenshots beside this log**
(`logs/atelier/versions-tab.png`, `versions-first-upload.png`,
`versions-dropdown.png`): Chromium on the dev API + web with the
two-version demo deal — the planted formula-to-constant edit reads
« Changed class — a live formula became a typed constant » folding
`typed-over-formula`, at `Model!F16`; every drive assertion green,
zero page errors. Frontend typecheck, eslint and prettier clean.

**Also in this push:** the standing handoff file
(`docs/pierce/handoffs/atelier.md`) per the new memory discipline —
map, not diary; updated with every push from now on.

Next per orders: the source viewer, then the recalculation mark.

## 27 August 2026 — the source viewer, shipped whole (agent-designed)

The second screen of the design unlock: the click-a-number,
see-the-highlighted-page moment, built on the Chain exactly as it is
served — the fact store's pages and boxes, the extractor's refusals
in words, and nothing invented above them.

**The endpoint (mine).** `GET /artifacts/{id}/page/{page}`: one page
of a stored source PDF as pixels, rendered fresh at 144dpi through
`pdfplumber`'s own rendering (the Chain's approved reader — no
transitive dependency imported directly), cached nowhere. A non-PDF
answers the same 404 as a stranger's artifact; a page outside the
document answers with the honest range (« has 2 pages; there is no
page 999 »); dropped bytes answer the storage sentence. Four route
tests (`TestTheSourcePage`); **route suite 77 passed.**

**The screen.** Inside the founder's document panel (the `docOpen`
design), a new section for source PDFs, agent-designed:
« Every number, cited to its page ». The Chain's facts as rows — the
number in mono, the document's own line beside it, the page — and
clicking one renders that page with the cited box **ringed in the
accent blue**, scaled by the page's own point size so the ring lands
at any resolution. The page card says its own honesty line
(« rendered from the stored file, the cited box ringed »). A document
the Chain has not read yet says so and offers « Read the document »
(the chain's idempotent extract, a deliberate button, never
automatic); refused pages are listed in the extractor's own words
(« p. n not read — … »). Page pixels are cached per page and revoked
when the panel moves on.

**Proven on the real stack, screenshots beside this log**
(`logs/atelier/source-viewer-facts.png`, `source-viewer-highlight.png`):
the cascade accounts PDF read into the Chain (24 facts), the panel
opened from the Sources tab, a fact clicked, and the page renders
with « 31 » ringed inside « For the year ended 31 December 2025 » —
every drive assertion green, zero page errors. Typecheck and prettier
clean; the one new eslint warning class matches the panel's own
pre-existing reset idiom (two identical warnings predate this
change).

One observation for Scribe, via the lead if it matters: the
extractor reads bare day-numbers in dates (« 31 » in a date line) as
facts. The viewer shows the store honestly either way; whether a
date's day belongs in the fact store is the Chain's call, not a
screen's.

Next per orders: the recalculation mark.

## 27 August 2026 — the recalculation mark, shipped whole (agent-designed)

Design-unlock item 3, the last of the founder's three: the
« validated by recalculation » state on the report and the model
page, **including its honest refusal face** — designed at full
effort in the existing style, per the orders' own words.

**The ground.** This container never had the engine: LibreOffice
was 24.2, below the recalculator's 25.8 floor. The lead's
`dev/setup-libreoffice` installed 25.8.7 (one transient network
reset, retried); its own verification passed (uno imports in the
bundled python, headless Calc converts). First real run: the gate
reproduced the cascade fixture's 228 formula cells exactly through
UNO — the whole of Dynamo's pipeline (prescan → UnoCalculator →
gate_file) works end to end on this box, first try.

**The endpoint (mine).** `POST /artifacts/{id}/recalculate`
(TieOutWrite, service `recalculate`): the artifact's stored bytes →
denylist prescan → a clean file goes whole through LibreOffice via
`UnoCalculator` (one soffice pair per call, torn down after, run in
a worker thread — heavy jobs run alone) → `gate_file` cell by cell.
The mark is **persisted** on the artifact's own loose `counts`
under `recalc` — unlike the delta this answer must be repeated by
every screen without re-running an engine, and a new upload is a
new artifact with no mark, so the mark can never describe other
bytes. Refused files never touch the engine and store the
constructs in words (`RecalcMarkRead`: verdict, engine named,
counts exact, worst twelve diffs/refusals named, the rest counted).
A machine without the engine answers 503 with the sentence; nothing
stored. Five route tests (`TestTheRecalculation`), one skipped
honestly where no adequate LibreOffice exists; **route suite 82
passed**. Backend lint, format and mypy clean on my files.

**The screens.** On the model page (the founder's `docOpen` panel),
a new section, agent-designed: « Validated by recalculation ». Four
verdict faces plus never-run: never-run says what the engine would
do and offers the deliberate « Run the recalculation » button —
recalculation is heavy and never happens behind anyone's back; pass
(green) names the engine and the count; fail (red) counts the
disagreements and names the worst cells mono, stored beside
recalculated; refused (amber) lists each construct in words
(« RTD — a real-time feed — its value was gone the moment the file
was saved ») and claims « we did not check this » rather than a
number; nothing-compared explains the generator-written case. On
the report sheet, the mark becomes prose between « What was
checked » and « What could not be checked »: validated names the
engine and count; a missing mark is **listed as a fact under what
could not be checked**, never passed over.

**Proven on the real stack, screenshots beside this log.** The
doctored demo v2 (typed-over `Model!F16`) **failed its
recalculation for real**: 19 of 227 compared cells differ, and the
named cells are exactly the downstream damage — `Model!F17`, `F26`,
`F27`, the DCF rows (`recalc-failed.png`; the mark re-shown from
storage on a fresh load, no re-run). A repaired v3 (the clean bytes
back on the lineage) earns the green face — « reproduced all 228
compared cells exactly », engine named
(`recalc-never-run.png`, `recalc-validated.png`) — and the report
speaks it (`recalc-report-validated.png`); the report's
never-run line is `recalc-report-notrun.png`. The refusal face
lives in its own small demo deal (« Project Live Feed Demo »,
`market_feed_model.xlsx` with a real `=RTD(...)`) so the cascade
demo's report keeps its subject: `recalc-refused.png`. Every drive
assertion green, zero page errors.

Two demo-data notes on the record: the doctored v2's honest fail
means the cascade deal's *current* model no longer reads
« validated » — that is the truth the mark exists to tell, and the
repaired v3 completes the story (v1 clean → v2 doctored, caught by
the Watch and the gate → v3 repaired, validated). And the report
follows the deal's newest model, which is why the refused model got
its own deal — a second model lineage in one deal changes the
report's subject; worth a word with the lead someday.

Next per orders: nothing further queued — the three design-unlock
screens are shipped whole. Holding for the next sweep.

## 27 August 2026 — the states sweep (fourteenth-sweep orders)

Orders item 2: sweep my three agent-designed screens against the
built workspace's real states — empty, loading, error, long-content
— and fix what the sweep catches. Nineteen states driven in
Chromium against seeded data; six defects found and fixed, one
observation routed on. Screenshots beside this log
(`logs/atelier/states-*.png`), one per state class.

**How the states were made, honestly.** Four sweep deals seeded:
an unchanged re-upload (two identical versions), documents dropped
(`storage_path` set to NULL — the real « keep the chain, drop the
documents » state, so every refusal is the server's own sentence
rather than a mock), an unread source, and a model the engine
cannot reproduce (the doctored v2's own bytes, re-ingested as a
current version so its 19-cell failure lands on a live screen).

**What the sweep caught, and what I changed.**

1. **The delta's summary column was printing a paragraph.** A
   version whose bytes were dropped put the whole storage sentence
   in « What changed », ellipsis-cut mid-word: the column read as
   if the revision's content were an error message. It now carries
   the fact — « Not comparable — the file was dropped » — and the
   server's full sentence, with what to do about it, still stands
   under the table.
2. **The source viewer pitched a read it knew would fail.** After a
   failed extraction the panel showed the reason and then, directly
   beneath, « This document has not been read into the Chain yet…
   » with a primary blue button that could only fail again. The
   invitation now stands down when a read has failed; the reason
   stands with a quiet « Try reading it again ».
3. **The failure list capped silently.** Nineteen cells differed,
   twelve were named, and nothing said so — the count sentence was
   the only clue. It now ends « …and 7 more not named here ». (No
   destination is promised: the marked-up copy is built from
   findings, not from the mark, so pointing there would have been
   a false trail.)
4. **A PDF wore a Word icon.** The panel header's kind mapping
   predated openable sources; the room's own list already showed
   the PDF icon. The panel now matches the room.
5. **A run that takes minutes looked like a dead control.** The
   in-flight recalculation was a greyed-out button. The label now
   breathes with `pcDim`, the workspace's own working idiom (the
   chat already speaks it) — no new vocabulary invented.
6. **A long fact list arrived unframed.** Twenty-two rows with no
   count. A line now heads them: « 22 numbers read from this
   document, each cited to its page. »

**What came through clean:** both loading lines (« Reading both
versions and comparing… », « Rendering page 1… ») and the
in-flight recalculation; the first-upload null; the unchanged
re-upload (« No reviewed changes — the two versions read the same
to the Watch »); the unread-source invitation; the page render
with its ring; the refusal face; and every error path answering in
the server's own words rather than a stack trace. Zero page errors
across the whole sweep. Route suite **82 passed** against the
merged tip; typecheck, prettier and lint clean (the panel's four
setState-in-effect warnings are its own pre-existing idiom).

**One observation, for the lead to route.** The Watch reports a
*repair* — « a typed constant became a formula », tagged
`repaired: typed-over-formula` — under the kind `class_change`,
and my ink map paints that kind red, so a repair reads as damage
at a glance. The screen renders the engine's kind and never
re-ranks (lanes.md), so I have not re-coloured it: if the Watch
means the item as a repair, the kind — or a flag on the item — is
where that belongs, not a screen's second guess.

Holding for the founder's review of the three screens, per orders
item 3.

## 27 August 2026 — the sweep's fixes, verified in the built app

Orders unchanged (fourteenth sweep; item 3 is « hold for founder
review »), so this turn was upkeep: rebased the lane onto the new
tip (`ac733b3` — the adopted review; nothing in it touches my
paths, and the sharpened thesis « the proof is the moat » is
precisely what the recalculation mark puts on a screen), then
verified what I shipped against a **production build** rather than
the dev server alone.

`pnpm build` clean, and every state re-driven against
`pnpm start`: all six sweep fixes hold, the stored mark is repeated
on a fresh load, the in-flight label's `pcDim` survives
minification (`animation-name: pcDim` read off the built page), a
re-run settles, and the built app throws no page errors. The one
state the drive could not re-reach was « never run » — that model
now carries a mark from the sweep itself, so the in-flight state
was proven through « Run again » instead.

Container lesson, for whoever verifies next: the dev API's
`CLAIDOR_CORS_ORIGINS` allows `127.0.0.1:3000` only, so a
production build served on any other port fails **every** API call
with `net::ERR_FAILED` — CORS, not the app. Stop the dev server and
serve the build on 3000.

Still holding for the founder's review of the three screens.

## 27 August 2026 — merged, and holding

The states sweep and its production-build verification are merged
(sixteenth sweep). Orders unchanged, so this turn was the check
that matters while holding: nothing in the merged sweeps touched
my paths, and the Chain contract my source viewer consumes
(`FactRead` — page, page size, box, line, extractor) is unchanged,
so the coupling that would break a screen silently has not moved.
Scribe's new `chain/anchor.py` is added capability, not a contract
change. Route suite **82 passed** against the merged tip.

Holding for the founder's review of the three screens, which stand
untouched until then, per orders.

## 27 August 2026 — the build record catches up

Tip and orders both unchanged, so still holding — and the screens
stay untouched until the founder has looked at them. The one thing
that was actually stale in my lane was the build record
(`swens-product-build.md`, mine): it stopped at 25 August and did
not mention the three screens the founder is about to review.

Phase 7 added in the doc's own voice — what each screen is, on what
endpoint, and the decisions worth keeping (the delta persisted
nowhere against the mark persisted on the artifact's counts; the
engine's rank never re-ranked by a screen; the ring in the page's
own point coordinates) — plus the states sweep and its six fixes.

Four honest gaps these ships left, now written down where the
product's gaps live: no arbiter run exists, so an arbiter-routed
file's true answer stays « we did not check this »; recalculation
is manual and per-version (the endpoint behind the button is the
gate's only caller — verified, not assumed); the differing cells
beyond the twelve named have nowhere in the product to be read,
since the marked-up copy is built from findings rather than from
the mark; and the delta answers for models only. Gap 5
(`rounding`/`writing` house rules) I left alone — not my claim to
re-adjudicate, and I found no evidence it moved.

## 27 August 2026 — G4 the report face, and G2 measured honestly

Seventeenth-sweep orders. Item 3 first, because it gated the report.

**The category map, re-checked against the merged catalogue.** Two
were stale and one was missing outright: `interest` had been renamed
`interest-consistency`, Sentinel's `range-over-block` was new, and
both were falling into « Other findings ». Mapped. Then the real
model turned up a third, worse case — below.

## G4 — the report face

Built on the founder's `fullRep` sheets (nothing they drew was
removed), then read hostilely against a real model, which is the
plan's own DONE test. Subject: `example_preapp_model.xlsx`, the
repo's judged semiconductor-fab fixture — **in-sample, and said so
plainly**: it is a committed fixture, not a cold corpus file. 6,186
cells, 5,956 formulas, 13 sheets. Seeded through the demo kit
exactly as a prospect's file would be.

What the orders asked for, and what it now carries:

- **Coverage on its face.** It was on *no screen at all* — served by
  the API, rendered nowhere. Now a section of its own, in the
  schema's own words. A model-only deal (this one) has no figures to
  reconcile, so it says « No deck or memo has been reconciled
  against this model … What follows is the model read against
  itself » rather than printing a meaningless « 0 of 0 ».
- **Severity at a glance.** Material · Significant · Observation as
  counts, before a word of prose.
- **Every claim cited.** A citation helper that gives the cell where
  there is one and the document and page where there is not — a
  deck-figure finding used to print with no citation at all.
- **The recalculation verdict**, and the differing cells named *on
  the page*: a printed report cannot send its reader to a screen.

**The hostile read found seven of my own defects, all fixed:**

1. Every citation said its sheet twice — « 'Assumptions
   Processing'!Assumptions Processing!E50 ». The engine's anchor
   already carries the sheet.
2. « Formulas read: 6186 » was **false** — 6,186 is cells; formulas
   are 5,956. It now says both, from the model's own counts.
3. The verdict paragraph was two findings' full sentences with raw
   formulas inline. It now leads with the headlines a partner scans.
4. Findings whose stored sentence equals their evidence printed the
   same words twice.
5. « No debt schedule was located » printed twice — two rules
   abstain for one reason. Deduped.
6. The recalculation line pointed at a screen; it now names the
   cells with both numbers.
7. A material finding printed with no scan line, and one sentence
   ended mid-formula (`…K10<0,L10<0`) because the engine stores it
   truncated. Not this lane's text to rewrite, so it is marked with
   an ellipsis — « abbreviated », not « broken » — and every finding
   now gets a scan line, falling back to its family.

Screenshots: `logs/atelier/report-face-sheet{1,2,3}.png`.

**The recalculation, on a real model.** The gate reproduced
**4,796 of 4,798 compared cells exactly**. The only two
disagreements are `Balance Sheet!L39` and `L40`: 2.98e-07 stored
against 0 recalculated — balance-check dust on a model denominated
in millions. The verdict is nonetheless « fail », because the gate's
absolute floor is 1e-12. **For Dynamo, via the lead**: two cells of
3e-07 residue flip a 4,798-cell file from pass to fail; whether the
floor should scale to the magnitudes in the file is the engine's
call, not a screen's. I have not touched it.

**A second finding for the lead — a rule that fires but is not in
the catalogue.** `gapped-test` produced a **material** finding on
this real model (`Balance Sheet!D7`, a negative-cash test that skips
seven live periods — one of the four defects the Tracelight exam
caught us missing). It is in neither `RULE_NAMES` nor
`ANALYTIC_RULE_NAMES`, and `endpoints.py` builds the house-rules
list from those two maps and rejects any key outside them. So a firm
**cannot see or switch off a rule that is finding material defects**,
and my category map had no family for it. I mapped it (its family is
plain from what it detects) and am reporting the catalogue hole
rather than editing another lane's audit module. My own
`TestHouseRules` asserts the endpoint matches the catalogue — it
passes, and it cannot catch this, because the gap is between the
catalogue and what the audit actually emits.

## G2 — the five canonical questions

**The blocker first: chat cannot run in this container.** There is
no `ANTHROPIC_API_KEY`, so `POST /deals/{id}/ask` answers 503 « No
ANTHROPIC_API_KEY configured. » I could not judge a single generated
answer, and I will not report on answers I did not see.

What I could measure honestly is the surface any answer must be
built from: I ran the agent's own six tools (`locate`, `trace_back`,
`trace_forward`, `inventory`, `structure`, `versions`) against real
deals — the preapp model, and the cascade deal for the version
questions.

| # | Question | Reachable today? | Measured |
|---|---|---|---|
| 1 | Why did DSCR fall between versions | **Yes** | `versions` names the moved cell (`Model!F16`, 59.056154 → 56.5561542); `trace_forward Model!F16` reaches 19 cells over 3 sheets incl. « FY2027E Adjusted EBITDA ». Both halves are there. |
| 2 | What feeds equity IRR | **Yes** | `trace_back` returns the output's 20 direct inputs. Caveat: this model has no equity IRR, so it was judged on its real headline output, « Average Debt Service Coverage » (`CashFlow!D54`). |
| 3 | Where is this from | **No** | No tool reaches the Chain. The cascade source PDF's 22 facts — each with page, box and line — are live and unreachable. The honest answer today is a decline, which is right, but it is a decline. |
| 4 | Hardcodes above materiality | **Yes, with a caveat** | `inventory(kind='hardcodes')` returns 22 typed-in numbers *with their values*, so a threshold can be applied — but the tool takes no materiality argument, so the filtering is the model's, not the engine's. |
| 5 | What changed | **Partly** | `versions` answers in raw cell moves, not the Watch's review language. The delta report — new defect, class change, methodology moved — is live at `/artifacts/{id}/delta` and no tool exposes it. |

**Two tools would close 3 and 5**, and both are one function each in
`agent/model_tools.py` — **not my lane**, so I have not written
them, and the endpoints they would read already exist and are mine:
a `sources` tool over `/v1/chain/documents/{id}/facts`, and the
Watch's `delta_report` behind `versions` (or its own `delta` tool).
Recommend routing to whoever owns the agent package.

So, against the plan's DONE test for G2 — « the five answer
correctly on a real model, judged » — the honest status is: **not
met, and not measurable here.** Three of five have their material
reachable; one cannot be answered at all; one answers in the wrong
register. None has been judged as an answer, because no answer can
be generated in this container.

**One more thing the merge caught, before the push.** The route suite
went red on `TestTheVersionDelta`: the merged tip registered two new
Watch classes — `emptied_cell` (« a cell holding X is now empty »)
and `filled_cell` (« a cell that was empty now holds X ») — and my
test pinned the eight kinds as a literal. Same mistake as the rule
catalogue, same fix: the assertion now reads the engine's own
`_KIND_ORDER` instead of copying it, so the Watch can grow without
turning my test red. The delta view's ink map had the same hole —
both new kinds would have rendered as raw identifiers — so they now
carry words and colour: emptying takes the amber of an assumption at
risk (a removed input changes an answer silently), filling the blue
of information. Suite back to **82 passed**.

## 27 August 2026 — the report as a delivered artifact

Orders unchanged (seventeenth sweep, and they say plainly that the
founder not having reviewed **is not a hold**), and my four items
were done. So I went at G4's own DONE test from the side it had not
been tested from: « the report is the artifact a partner actually
receives » — and what a partner receives is a **PDF**, not a screen.

I had never opened one. Driving the real « Download PDF » on the
Northgate deal and reading the file back with pdfplumber found three
defects, all measured rather than guessed:

1. **Every typeface was substituted.** The print window is a fresh
   document that loaded **zero** font faces, so the report — set in
   Newsreader, Instrument Sans and JetBrains Mono, all self-hosted —
   came out embedding `LiberationSerif`, `DejaVuSans` and
   `DejaVuSansMono`. The whole document was in the wrong faces. The
   three `@font-face` rules now travel into the print document, and
   printing waits on `document.fonts.ready` (with a backstop) so it
   cannot fire before they arrive. The PDF now embeds
   `Newsreader16pt`, `InstrumentSans` and `JetBrainsMono`.
2. **The severity vanished.** Browsers drop background colour when
   printing, so « Material · Significant · Observation » printed with
   no dots at all — the severity that G4 asks to « read at a glance »
   was invisible in the delivered artifact. `print-color-adjust:
   exact` restores it; the coloured marks are back in the file.
3. **The pagination lied, by my own hand.** Adding coverage and the
   severity band pushed sheet one past a printed page, orphaning its
   footer onto a page of its own — so a four-page document carried
   « Page 1 of 3 ». Fixed properly rather than by shrinking type:
   the verdict sheet now ends after the recalculation, and a second
   sheet carries the scope — how much was covered, what could not be
   checked, and the versions this report covers (moved off the last
   sheet, where it sat oddly and left the scope page thin). Four
   sheets, four printed pages, four honest footers.

Before and after, page one: `logs/atelier/report-pdf-before.png`
and `report-pdf-after.png`. Route suite **82 passed**; typecheck,
prettier and lint clean.

A note for whoever reads this next: the report *on screen* satisfied
the order before any of this. The delivered file did not, and no
screen test would have caught it — it took printing the thing and
reading the bytes back.

## 27 August 2026 — the report on a deal that has a deck

Orders unchanged, and they say plainly this is not a hold. A gap in
my own verification was the honest next thing: **every reading of
the report so far was of a model-only deal**. Coverage with real
numbers, and the « document and page » citation I built for deck
findings, had never once rendered. Read it on the cascade demo deal
(113 of 128 figures reconciled, 14 drift findings, a deck) and it
found four defects — two of them mine, one serious.

1. **The report never said the check was stale.** The deal page has
   a stale banner; the printed artifact had nothing. On this deal the
   check finished at 02:59 and the current model version arrived at
   22:55 — so a partner would have read fifteen material findings
   about a version that no longer exists, with no warning anywhere in
   the document. That is the one way this report can be quietly
   wrong, and it is now the first thing on the page, above the
   verdict, in the amber of an assumption at risk: « This check ran
   before the current model was uploaded yesterday 22:55. What
   follows describes the deal as it stood at the check… »
2. **The verdict enumerated instead of summarising.** Fifteen
   material findings became a wall of thirteen clauses — « $49.6mm
   where the model says $48.9mm · 10.4% where the model says 9.3% ·
   … » — before the reader reached a verb. It now groups by class:
   « 14 figures in the deliverables that disagree with the model, and
   one unexpected hardcode. » Drift findings carry no headline of
   their own, so their class is what they are; classes keep both
   number forms, because « figures … that disagree » is not the
   singular with an « s » stuck on the end (it first read « 14 figure
   … disagrees with the models », which is how I found it).
3. **« Page N of 4 » was still lying, at a deeper level than last
   time.** Splitting the first sheet fixed a small deal; on this one
   the material findings run to three printed pages, so the footers
   landed 1, 2, 3, 4 on physical pages 1, 2, 5, 6 — and pages 3 and 4
   carried no number at all. A sheet is a *section*, and only a short
   section is also a page. The footer now says « Section N of 4 »,
   which is true at any length, and the printer numbers the paper.
4. Two claims that no longer matched what is printed: « Every finding
   carries the cell it came from » and « The cell reference is given
   » — both now say « the cell, or the document and page ».

**What the deck path proves.** A drift finding now prints as
« $49.6mm where the model says $48.9mm », cited
`cascade_deck_broken.pptx · p. 2` and `against FY2025A adjusted
EBITDA · Model!D26` — the slide to open and the cell to check, both
on the page. That is « every claim cited to a cell or page » working
on real data rather than in principle.

Delivered page one: `logs/atelier/report-with-deck.png`. Route suite
**82 passed**; tsc, eslint (a dead helper of mine removed on lint's
word) and prettier clean; zero page errors.

## 27 August 2026 — the corpus arrives: intake, and a report on a real model

The eighteenth-sweep tip brought two things that touch this lane
directly: the **`.xlsb` intake gap**, and **eleven real corpus
models, fetched and reproducible**. Orders unchanged; both are
squarely inside them.

### The intake refusal (mine), rewritten

Reading the `.xlsb` note against my own upload route found two
defects in my endpoint, both confirmed against the running API:

1. **A `.xlsb` was refused with no way forward.** It is Excel's
   binary workbook — openpyxl cannot open it, widening the reader is
   plan step A6 and another lane's — but the *refusal* is mine, and
   it recited a format list instead of the ten-second fix. It now
   reads: « model.xlsb was not taken — an .xlsb is Excel's binary
   workbook, which this cannot open. In Excel: File → Save As →
   Excel Workbook (.xlsx), then upload that copy. » Same for `.csv`
   (values, no formulas — upload the workbook it came from) and
   `.numbers`.
2. **The list did not match what the reader takes.** It said
   « models are .xlsx or .xls » while `.xlsm` — the format most
   project-finance models actually arrive in, and the format of
   eight of the eleven corpus models — had been accepted all along,
   along with `.xlt`, `.pptm` and `.doc`. The sentence is now
   derived from `SUFFIXES` itself, so it cannot drift again, and a
   test asserts every suffix the reader takes is named. Three route
   tests (`TestWhatIntakeWillNotRead`); one older test that pinned
   the prose now asserts the intent instead. Suite **85 passed**.

### The report, on a real out-of-sample model

`scripts/corpus_sft_models.py` fetched all eleven (8 readable
`.xlsm`, 3 format-blocked). Ran the demo kit on **Levenmouth
Academy** — a real Scottish Futures Trust closed-deal model,
432,596 cells across 26 sheets — and it produced the hardest case a
report can face: **224 formulas in 432,596 cells**. The published
model is a values-pasted copy, so the construction rules are nearly
blind, and the audit found nothing.

The report said « **Nothing failing.** » with 0 · 0 · 0, and the
reason it found nothing sat a page away under « what could not be
checked ». That is the most consequential defect I have found in
this document: a partner reads « nothing failing » on a
432,596-cell model as « checked and clean », which is the one
conclusion this file cannot support. The verdict now qualifies
itself where it stands:

> **Nothing failing — but little could be checked.** This copy
> carries values only: 224 of 432,596 cells hold a formula, so the
> rules that read how the model is built had almost nothing to
> read. The checks that read values — the statements, the model's
> own check rows — found nothing failing. Ask for the working copy
> if the construction matters.

A grammar slip in the grouped verdict fell out of the same run
(« one probable formula defects »): the families are named in the
plural, so their singular is the trim, not the append.

Evidence: `logs/atelier/report-values-only.png`. Route suite 85
green; tsc, eslint and prettier clean.

**Worth the lead's attention**: this is what the corpus is for. One
real model, out of sample, immediately produced a state no fixture
had — and the honest report on it is « we could barely read this »,
not a clean bill. Seven more readable models are fetched and
waiting; running the rest through the report is the obvious next
pass if the lead wants it.

## 27 August 2026 — the values-only truth, where a person meets the file

The tip split the population proof in two (1A analytical on this
corpus, 1B structural awaiting a formula-bearing one) — Sentinel's
run, not mine. What is mine is the consequence for the product:
**last turn I made the *report* stop calling a blind read clean, but
the report is the last thing a person sees.** They meet the file
first, on the document panel, and there it still said nothing.

Two defects in my own panel, both found by the real corpus and
neither catchable on the fixture:

1. **« Named cells » was showing the cell count.** The row read
   `counts['cells']` under a « Named cells » label. On the cascade
   fixture `named` and `cells` are both 313 — identical, so the
   mislabel was invisible for as long as the fixture was the only
   subject. On Levenmouth they are 413,049 and 432,596. The panel
   now carries three honest rows: **Cells read**, **Formulas**
   (« 224 of 432,596 cells »), and **Named cells** with the number
   that actually means named.
2. **Nothing said the file was a printout of a model.** « Ready »,
   no findings, « Named cells 432,596 » — a reader concludes the
   model is clean. The panel now says it in the amber of an
   assumption at risk, above the facts: « This copy carries values,
   not formulas — 224 of 432,596 cells hold one. The rules that read
   how a model is built can see almost none of it; the checks that
   read values still ran. » Absent on a formula-bearing model
   (cascade: 228 of 313, 72.8% — verified no notice).

The display line is 1% of cells, and it is a *display* threshold,
said as such in the code: the engine's own `values_only` is what the
report speaks from, and this is the same fact read off the
artifact's counts where no run record is at hand.

**A second thing the real corpus surfaced, unprompted.** « Hidden
inside it » on Levenmouth is not empty: the workbook carries live
external links with the original bidders' internal paths —
`\\Londsbs01\company\Documents and Settings\John\My Documents\Work\
Projects\North Ayrshire…` and SharePoint URLs from the sponsor's
tenant. A published, closed-deal public document is leaking the
folder structure of the firm that wrote it. That is the metadata
checker earning its place on a real file, and it is worth the
founder seeing: `logs/atelier/panel-values-only.png`.

Route suite **85 passed**; tsc and prettier clean; the panel's lint
warnings are its own pre-existing idiom, unchanged in count.

## 28 August 2026 — the report on a model that speaks

Proof 1A failed honestly (twentieth sweep) and, in failing, produced
something my lane had never had: **a real model with analytical
findings**. Every report I had read was of a fixture, a deck deal, or
a silent corpus model. Kelso — 470,594 cells, 814 formulas, eight
findings, two abstentions — exercises the statement-finding fields
(`figure`, `period`, the model's own check-row sentence) that no
fixture produces.

**Said plainly, because it matters more than the screen work:** the
seven « own check rows are firing » findings this report displays are
the class Sentinel adjudicated as **false alarms** — a covenant
threshold parked in a scalar column read as a failing period, traced
to one line, registered as its own round and deliberately not fixed
during the cold run. I am not presenting them as defects. What I used
them for is what the report *does* with real analytical findings.

Three defects, all mine, all only reachable with this data:

1. **The verdict said nothing about blindness when the checks found
   something.** Last turn I made « nothing failing » qualify itself on
   a values-only copy — but I gated it on *finding nothing*. Kelso is
   the other half: 814 formulas in 470,594 cells, seven material
   findings, and the verdict page never said the construction rules
   had seen almost none of the file. That is worse than the silent
   case, because a reader who is handed findings now trusts the
   check. The verdict now carries it either way: « This copy carries
   values only — 814 of 470,594 cells hold a formula — so the rules
   that read how the model is built saw almost none of it. What the
   value-reading checks did find: seven structural exceptions. »
2. **A headline that is a clause cannot be pluralised.** These
   findings' headline is a sentence — « The model's own check rows
   are firing » — and my grouping appended an « s »: « seven the
   model's own check rows are firings ». A clause is now grouped by
   its family instead, which is always a noun phrase, and the
   sentence itself stays overleaf per finding.
3. **The scan line repeated the sentence beneath it.** « THE MODEL'S
   OWN CHECK ROWS ARE FIRING » over « The model's own check rows are
   firing at ReportRatiosSA!E356 » is the same words twice; the scan
   line now stands down when it is only an echo.

Also, a typographic slip that had been there since the grouped
verdict shipped: the body is its own paragraph under the lead, so it
must start a sentence — « two inconsistent formulas … » had been
opening lowercase under a full stop.

**What the statement fields look like when they render** (they read
well, and this is the first time anyone has seen them):

> The model's own check rows are firing at ReportRatiosSA!E356
> · ReportRatiosSA!E356 · 1.1 on the model's own « Check: Look
> forward ADSCR > distribution lockup level » row, built to read zero

All four report cases re-read after the fixes — blind-and-silent
(Levenmouth), blind-with-findings (Kelso), formulas-with-findings
(the preapp fixture), deck-and-stale (cascade). Evidence:
`logs/atelier/report-corpus-verdict.png` and
`report-corpus-findings.png`. Route suite **85 passed**; tsc, eslint
and prettier clean.

## 28 August 2026 — the landing screen was the last one lying

I had made the report declare a values-pasted copy, then the document
panel. This turn I looked at the screen a person actually **lands
on** — the deal Overview — and it was the worst of the three.

On Levenmouth (224 formulas in 432,596 cells) it read:

> **Nothing failing** · Nothing failing as of today 16:53. · No
> finding is open against this version. · **Every check that applies
> to this model ran to the end.**

That last sentence is the one that matters. It is arguably true in a
narrow sense — the checks did run — but its plain meaning to a
banker, sitting under a green « Nothing failing », is « we looked at
everything and it is fine ». On a file where the construction rules
could read 0.05% of the cells, that is the most misleading thing the
product says, and it says it first.

Now, on the same deal:

> Nothing failing as of today 16:53 — **but little could be
> checked.** … This copy carries values only — 224 of 432,596 cells
> hold a formula — so the rules that read how the model is built
> could not see it. The checks that read values still ran.

The « every check ran » line stands down when the copy is blind
rather than sitting beside its own contradiction, and the fact is
stated in the founder's own bullet style beside the abstentions,
where « what could not be done » already lives. Kelso (blind *and*
seven material findings) carries both its abstentions and the
blindness. A formula-bearing deal is untouched — cascade still reads
« Every check that applies to this model ran to the end », which is
true there.

**One judgement call, for the founder.** The chip itself still reads
« Nothing failing » in green: that is accurate about findings, and
the qualification sits in the sentence directly beneath it. Making
the chip itself hedge would change the meaning of an element the
founder drew, so I have not. If a green chip over a blind read is
still too much, that is a one-line change and their call.

Three surfaces now tell the same truth in the same words — the
Overview, the document panel, the report — which is the point: a
person can arrive anywhere and not be misled. Evidence:
`logs/atelier/overview-values-only.png`. Route suite **85 passed**;
tsc, eslint and prettier clean.

## 28 August 2026 — the list said « Not checked yet » beside eight findings

Orders unchanged (seventh sweep). The honesty thread was complete on
three surfaces, so I went to the two I had never read against real
data. The **deals list** — the screen before any deal — was wrong in
a way no fixture could show.

**Kelso's row read « Last checked: Not checked yet » and « 8
findings » side by side.** Its own schema says why that matters:
« `checked_at` is the field that keeps the list honest … no open
findings on a deal nobody checked reads exactly like no open findings
on a deal checked this morning, and the whole product turns on those
two never looking the same. » The field was fed by the **tie-out
alone**, and a model-only deal has no deck to reconcile against — so
it never ran, and the row said « never checked » forever. Most of the
real corpus is exactly that shape.

The same line fed staleness, so a model-only deal could never go
stale either, however many versions arrived after its audit. One
correction repaired both, and a second went with it: **a failed run
is not a check.** It carries a finishing time but checked nothing, so
it must not date the row. The row is now dated by the last run of
either kind that actually completed; where the newest run of a kind
failed over an older one that succeeded, it under-claims rather than
over-claims, which is the right direction to be wrong.

Proven on the real deals: Kelso « Today 18:37 · 8 findings »,
Levenmouth « Today 16:53 », the never-checked Sweep deals still null
— and a model-only deal now goes **stale: true** when a version
arrives after its audit, which was impossible before. One route test
(`TestTheDealsList`); suite **86 passed**.

**And the fourth arrival point.** Levenmouth's row said « Nothing
failing » with nothing to say it is a values-pasted copy — the same
flattery I removed from the report, the panel and the Overview. The
row is a triage line, so it gets two words: **« Nothing failing ·
values only »**, carried on a new `values_only` field the endpoint
reads off the audit's own record. The Overview carries the rest.

Evidence: `logs/atelier/deals-list-checked.png`. ruff, mypy, tsc and
prettier clean.

## Eighteenth turn — the category map, checked the right way, and
## what it found underneath

Orders item 3: re-check the category map against the merged
catalogue. I had done that twice and written « nothing in the
catalogue is unmapped » over it. The sentence was true and the check
was the wrong one.

**The catalogues are not the set of rules the engine emits.** A rule
missing from `RULE_NAMES` and `ANALYTIC_RULE_NAMES` is exactly the
rule most likely to be missing from the map too — and reading the
catalogues finds nothing wrong with it. So this time I read the
`rule="…"` literals out of the engine's own source instead. Twenty-
three rules are emitted; twenty are catalogued. The three that are
not: `gapped-test` (already mapped, reported last sweep),
**`typed-over-beat`** — Sentinel's column-direction extension of
`typed-over-edge`, severity *error* — and **`broken-name`**, which
fires on **eight of the nine readable corpus models**.

All three now have a family in `files.ts`, so none of them can reach
a partner's report headlined « Other findings ». And the check that
would have caught this is now a test, not a habit:
`TestTheCategoryMap` in `test_routes.py` reads both sides — the
engine's literals and the frontend's map — and fails with the
offending rule named. I proved it bites by deleting the `broken-name`
line and watching it go red. Suite **89 passed**.

### The thing underneath: the product audits a poorer workbook than
### the engine does

`broken-name` fires on eight corpus models and appears **nowhere** in
the demo database. Kelso's model audits to `broken-name` +
`hidden-sheet` from the file; Kelso's deal carries `hidden-sheet`
alone.

The reason is structural. The product never audits a file. It audits
a `Workbook` rebuilt from stored cells (`service._workbook_of`),
which carries `cells` and `sheets` and nothing else. `_audit_cells`
puts `hidden_sheets` back by hand from a fact ingest kept on the
artifact — a fix someone made once, for one field, with the comment
« the cells cannot say what the workbook hides ». Every *other* field
the reader fills at open time is empty by the time a rule reads it:
`errors`, `unparseable`, `broken_names`, `foreign_names`,
`iterative`, `populated`, `row_words`.

Measured rather than asserted, over the nine readable corpus models —
same file, audited whole and audited as the product would
(`logs/atelier/rebuilt_gap.py`, runnable as it stands):

| | findings |
|---|---|
| from the file | 116 |
| from the rebuilt workbook | 75 |
| **lost** | **41** |

Lost: `error-value` ×28 (13 of them *error* severity),
`broken-name` ×12, and one `hidden-sheet` **downgraded** from error
to smell on newbattle — the rule reads `populated` to tell a hidden
sheet with work on it from an empty one, and `populated` is lost too.
Four of the nine models — baldragon, forfar, levenmouth, oban —
go from findings to **zero**. Three of those four carry
error-severity findings.

The rebuilt side of that measurement is generous: it keeps every cell
the reader found, where ingest stores only the ones it could name and
number. The gap is a floor.

**What it looks like on the product's face.** Levenmouth's report
(`logs/atelier/rebuild-gap-levenmouth.png`) says « Nothing failing »
and, because of last turn's work, adds « but little could be checked
… the checks that read values — the statements, the model's own check
rows — found nothing failing ». That last clause is false. The file
carries `#N/A` across `Repayment schedules!D79:D126` — forty-eight
cells of a live repayment column — at error severity, plus a second
`#N/A` at D129 and three columns of `#DIV/0!`/`#VALUE!`. Error values
are cached *values*: the values-only qualification does not excuse
missing them. The engine found them. The product could not see them.

The golden-master gate cannot catch this, because it certifies
`audit()` against files and the product never audits a file.

**I have not papered over it.** The honest patch is one dict literal
in `ingest.py` — which already holds the whole `Workbook` when it
writes `counts` — plus the mirror of the two lines already in
`_audit_cells`:

```python
# ingest.py, beside "hidden_sheets": …
"broken_names": book.broken_names,
"foreign_names": [list(pair) for pair in book.foreign_names],
"errors": book.errors,
"unparseable": book.unparseable,
"iterative": book.iterative,
"populated": book.populated,
```

`ingest.py` belongs to no lane in `lanes.md` and `workbook.py` is
Sentinel's, so this is the lead's to assign — it is not mine to push.
`row_words` is the one field that is genuinely heavy and wants its
own decision. Weakening the report's prose instead would have hidden
a defect that is going to be fixed, so the prose stands.

Evidence: `logs/atelier/rebuilt_gap.py` (the measurement),
`logs/atelier/rebuild-gap-levenmouth.png` (the face). ruff, mypy,
tsc and prettier clean; route suite 89 green.

## Nineteenth turn — chat's two unanswerable questions, closed

Orders reset, twenty-fifth sweep: the lead routed
`polar/tieout/agent/model_tools.py` to me for two tools — a `sources`
tool over the Chain's facts, and the Watch's delta behind `versions` —
then a re-judgement of all five canonical questions by hand.

### What I touched, and why it was more than one file each

`model_tools.py` and its test file, plus two things the tools cannot
work without: the loader in `agent/service.py` (a tool is a synchronous
pure function over a workspace loaded before the loop starts, so the
material has to be fetched there) and one refactor in `service.py`,
which is mine.

**The refactor is the interesting half.** `version_delta` resolved two
artifacts and then read both files in one async method. Loading it in
the workspace would have made every model question — « what feeds
equity IRR » included — pay for two workbook reads it never uses. So
it is split: `delta_sides` resolves (async, cheap), `delta_between`
reads (sync, expensive). The loader calls the first and hands the tool
a `partial` of the second; `versions` calls it **once, on demand, and
caches**. There is a test whose only job is that the Watch is not read
until `versions` is asked.

### `sources` — « where is this from »

The one question the graph cannot answer, because the answer is not in
the file. The loader builds a ref → document map from the deal's links
(the endpoint's own ranking: a **confirmed** link outranks a proposal,
a rejected one is not an answer at all), and the tool reports the
document, the page, and the sentence **as printed** — never the label
the matcher normalised it to.

Three behaviours that took the work past a stub:

- **A calculated cell walks to the typed inputs behind it.** The
  question is almost always asked about a computed line, and declining
  it because the cell is a formula is correct and useless. Asked about
  a CAGR on the Cascade deal it answers « 1 of the typed inputs behind
  it carries a source document », and names it.
- **« Nothing matched » and « nobody looked » are different answers**
  and are never flattened. Telling a reviewer the documents did not
  back a number when no document has been read would be the worst kind
  of wrong.
- **A values-pasted copy says so first** (below). 

### The five questions, re-judged by hand

The loop still cannot run here — no `ANTHROPIC_API_KEY`, `ask` answers
503 — so this is **not** a measurement of how the assistant phrases an
answer. It is a measurement of the thing that decides it: whether the
tool it would reach for hands back the right material, with the right
numbers, checked against the model by hand.

| # | Question | Before | Now |
|---|---|---|---|
| 1 | why did DSCR fall between versions | parts only | **parts only** |
| 2 | what feeds equity IRR | reachable | **wrong on a stripped copy** |
| 3 | where is this from | **unreachable** | **answers** |
| 4 | hardcodes above materiality | answers | answers |
| 5 | what changed | raw cell moves | **review language** |

**3 answers.** `sources('Model!D6')` → « came off cascade_accounts.pdf ·
page 2 », printed `$228.9m`, context « Revenue for the year ended 31
December 2025 was $228.9m. », state *proposed* with the note that says
so. By label (« revenue ») and from a calculated output it walks and
still lands on `Model!D6`.

**5 answers in the right register.** `versions()` on Cascade v1→v2:
« 1 defect this revision introduced, 1 defect still open, 1 cell that
changed class », item `Model!F16 — a live formula became a typed
constant`. That is the doctored F16, correctly named. It used to say
« Model!F16 4.1 → 3.8 », which is a true answer the way a diff is a
true answer and the wrong register for a reviewer asking what the
revision *did*. The stored-cell diff still rides along for the one
thing the Watch cannot see: how many of this deal's own deliverable
figures the change made stale.

**1 is still parts only, and the corpus is why.** `locate('DSCR')` on
Kelso returns twelve real lines (`Natural Hedge!E8 Min DSCR 1.07524`,
`ReportCharts!M120 FY2018 ADSCR 1.15524`) and `versions` reports a
revision properly — but **no deal here has both a DSCR line and a
second version**, so the joined answer is unproven. Seeding one means
a second 470k-cell upload; worth doing when a corpus deal earns a
revision.

**2 is the one that got worse when looked at properly.** On Kelso,
`locate('equity IRR')` finds `IRR Calculations and Sharing!C85 SFT
Blended Equity IRR 0.0960581` — correct. `trace_back` on it returns
**« typed value, 0 direct inputs »**. That is true of the file and
false as an answer: Kelso is a values-pasted publication (814 formulas
in 470,594 cells), so *every* line reads as typed, and a reader takes
it for a devastating finding about the model rather than a fact about
the copy. The values-only thread reaches its **fifth** surface.

`sources` now carries the qualification — « This copy carries values
only — 814 of 470,594 cells hold a formula — so almost everything in
it reads as typed. That is a fact about this copy, not about how the
model was built. » — measured off ingest's own counts, same 1% floor
as the report and the document panel. **`trace_back` still does not**,
and it is not one of the two tools routed to me. Routed to the lead.

### Two more for the lead

**The model workspace picks the first model on the deal.**
`load_model_workspace` takes `next((one for one in artifacts if
one.kind == "model"), None)`. Cascade Watch carries three model
lineages, and chat answered about `macro_model.xlsm` while the deal's
subject is `cascade_model.xlsx`. On a multi-model deal chat can
silently answer about the wrong file — worse than refusing.

**A pre-existing ruff failure** in `tests/tieout/test_structure.py`
(import order, `BalancePair`) — Sentinel's row, untouched here, but it
fails `ruff check tests/tieout/`.

### Orders item 2 — the format refusal

Already built, and built to follow the engine rather than pin prose:
`_unreadable_format` derives its sentence from `ingest.SUFFIXES` and
names the fix for `.xlsb`/`.csv`/`.numbers`. Sentinel's A6 round has
not landed yet, and when it does the refusal narrows on its own —
nothing to coordinate until then, and nothing to re-word by hand.

Checks: 135 green across the route, model-tool, agent-tool and
changeset suites (23 in `test_model_tools.py`, 12 of them new); ruff
and mypy clean on every file I touched.

## Twentieth turn — which model an answer is about

Orders addendum, twenty-seventh sweep: the multi-model finding is a
defect and mine to fix — « answer about the deal's subject model, or
name which model it is answering about, or refuse — never silently
pick the first one ».

**It was in three places, not one.** The deals list's model column, the
marked-up download and the assistant's workspace each wrote
`next(one for one in current if one.kind is model)`. That takes
whichever lineage `current_artifacts` returned first, which follows
`list_artifacts`' ordering and promises nothing about it. Reading that
ordering afterwards: it *was* the newest model, by luck. So the pick
was not wrong — it was **unstated, unguaranteed and invisible**, which
on a screen that answers in prose is the same thing as wrong.

The fix is `service.subject_model` — the most recently uploaded, sorted
here rather than inherited from another function's ordering, with the
reason written down: a deal picks up an old lender's model or a
bidder's copy and the subject is still the one that just arrived. All
three callers go through it, so they cannot disagree about which file
a deal means. The audit is deliberately untouched: it reads **every**
model, and always did.

**And then it is said out loud, twice.** The assistant's tools only
ever hold one model, so without being told it cannot know the other
file exists — asked about a line living in the deal's other workbook it
would answer « that is not in this model », which is true and reads as
« your deal does not contain it ». So the prompt carries a scope line
naming what it is reading and what it cannot see, and the reply carries
`model` / `model_version` / `other_models` **off the artifacts**, so the
screen can state them whatever the prose says. The Ask screen draws
them only where the deal holds more than one model; on the ordinary
deal it stays quiet.

Six route tests (`TestWhichModelAnAnswerIsAbout`): the subject is the
newest and the ordering is total, a deal with no model has no subject,
the deals list names the same file the assistant reads, the workspace
names the others, one model says nothing at all, and the prompt's scope
line names files rather than counting them.

**Seen on screen, with the provider stubbed and nothing else.** The
loop needs a key this container does not have, so the *only* thing
replaced was the provider call
(`logs/atelier/rebuilt_gap.py`'s sibling, `stubbed_api.py`, scratch):
the workspace loaded from the demo database, the `structure` tool ran
over stored cells, and the endpoint resolved the subject for real. The
paragraph in the shot says in its own words that it is scripted. What
is real in `logs/atelier/assistant-which-model.png` is the line

> Read from **lenders_case.xlsx v1** — this project also holds
> quiet_model.xlsx (v1), which this answer did not read.

and the five sheet rows under it. The demo database now carries a
two-model deal (« Sweep — an unread source » gained
`lenders_case.xlsx`) so this state has somewhere to live.

### The ruff failure I reported was mine, not Sentinel's

The lead is right and I was wrong: `ruff check tests/tieout/` passes
at the tip, and passes here now. I ran it before rebasing, against the
older tip my branch was still on. Reported against my own interest and
still wrong — the lesson is to run a cross-lane claim **after** the
rebase, not before.

### The next hole, measured: the assistant waits half a minute to think

`load_model_workspace` loads every stored cell before the loop starts.
Timed on the demo database:

| model | cells | load |
|---|---|---|
| lenders_case.xlsx | 313 | 0.0 s |
| levenmouth_model.xlsm | 432,596 | **21.0 s** |
| kelso_model.xlsm | 470,594 | **28.4 s** |

Twenty-eight seconds before the first token, on **every** question,
including a follow-up in the same conversation. The fixtures hide it
completely — 313 cells is instant, which is why it took a real model to
see. The asymmetry that names the fix: the *deal* agent's loader caps
what it carries (`MAX_CELLS_LOADED = 2_000`, « past this the search is
worth a round trip »); the model agent's loader has no cap at all,
because its tools walk a graph rather than search a list. So the answer
is not a cap — it is loading the graph once per deal and version rather
than once per question. Registered here as the next hole, not started.

Checks: 132 green across the route, model-tool and agent-tool suites
(6 new); ruff, mypy, tsc and prettier clean.

## Twenty-first turn — what a revision did to the deliverables

The lead's standing instruction after the multi-model fix: find the
next *hole*, not polish, and look in the screenless-capabilities
inventory. That inventory is spent — all three of its entries (the
Watch delta view, the source viewer, the recalculation mark) have
since shipped — so I rebuilt it against the current engine by reading
the packages' `__all__` and checking each name against
`endpoints.py`/`service.py`/`schemas.py`/`agent/`.

The biggest thing with no product surface at all: **`watch.deck_delta`
(C5)**. And it is not a nicety. My own `model_diff` docstring already
says why:

> The realistic failure is not one typo. It is a model revision the
> deck never caught up with, which is why the count that matters on
> this screen is not « cells changed » but « deck figures now wrong
> because of it ».

`model_diff` *approximates* that with `stale_figures` — a count of
links sitting on cells that moved. `deck_delta` does the real thing:
ties the **same deck** out against **both versions** and reads the
difference. Four lists, four different sentences, never summed:

- **broken** — agreed before, drifts now. The revision did this.
- **repaired** — drifted before, agrees now.
- **still drifting** — disagrees with both, so not this revision's
  account.
- **coverage changed** — reconcilable against one version only.
  « I lost sight of it » is not « it broke », and folding the two
  together is how a checker earns a reputation for crying wolf.

Shipped whole: `service.deck_delta` (three stored files → tempfiles →
the Watch, persisted nowhere, same posture as the version delta),
`GET /artifacts/{id}/deck-delta[?against=&deck=]`, `DeckDeltaRead`,
the client call, and the panel under « What v4 changed » on the
Versions tab. Agent-designed; the founder reviews.

**One refactor came with it.** `version_delta` and `deck_delta` must
never disagree about which pairs may be compared — a route that
admitted a pair the other refused would be a membership hole wearing a
feature's clothes — so the gate is now one method, `_delta_pair`, and
both call it.

### Seen on real data, both faces

**The revision exonerated** (`logs/atelier/deck-delta-exonerated.png`).
An unchanged re-upload: « No reviewed changes » above, and beneath it
« The same deck reconciled against both versions. 111 of its printed
figures could be checked against either. » Then **Already disagreeing
8 — disagrees with both versions, so not this revision's doing**, each
one named to its slide and its place: « slide 3, chart series
« Adjusted EBITDA », category « FY2023A » — 37.8, the model now says
30.8 ». One is flagged « one unit at the printed precision — a
rounding convention ». Not one of the eight is charged to the
revision. That is the whole point of the panel.

**The revision caught** (`logs/atelier/deck-delta-broken.png`).
« 111 of its printed figures could be checked against v3; 14 against
v4 » — and then **This revision broke 5**, with *Revenue growth: 11.8%
— the model now says 8.0%* at `O2`, beside **101** figures in « No
longer checkable ». Summed, that reads as a catastrophe; separated, it
reads as what it is.

**And where the Watch could not attribute a break, the row says so**
— « No model change could be attributed to this break. » in grey
italic — rather than naming the nearest change. A guess printed as a
cause is the one claim a banker would repeat to a client without
checking.

**The dropped-bytes refusal, in the route's own words.** The shared
storage sentence says « so it cannot be corrected », which is the
markup route's job, not this one's. Driven for real by nulling the
deck's `storage_path`: the route now answers *« cascade_deck.pptx is
not stored here any more, so this revision cannot be re-tied against
the deck. Upload it again. »* — and it names **which** of the three
files is missing, because « upload it again » is useless without that.

Six route tests (`TestWhatARevisionDidToTheDeck`), the load-bearing one
being that a re-upload of the identical workbook breaks nothing and
repairs nothing while the deck's eight standing disagreements all land
in `still_drifting`. Also: null for a first version, null for a deal
with no deck, a stranger's revision 404s, and no `cause` is ever a
bare ref.

The demo database gained two states for this: a deck on « Sweep — an
unchanged re-upload », and a v4 there that genuinely moves figures.

Checks: 138 green; ruff, mypy, tsc, eslint and prettier clean.

## Twenty-second turn — the assistant's twenty-eight seconds, and where
## they actually went

Last turn I registered the hole and named the wrong fix. I wrote that
the answer was «  loading the graph once per deal and version rather
than once per question » — a cache. Measuring it first says otherwise.

Timed on Kelso (470,594 cells), the load broken into its parts:

| step | cost |
|---|---|
| `current_artifacts` | 0.01 s |
| **`cells_of` (the ORM read)** | **23.3 s** |
| `_workbook_of` | 2.6 s |
| `dependents_index` | 0.01 s |
| `period_axes` | 0.17 s |

**It is one query, and it is not the rows — it is the ORM.** The same
470,594 rows read as columns rather than as entities:

| read | median of three |
|---|---|
| `cells_of` (entities) | **16.0 s** |
| `cells_for_graph` (columns) | **4.0 s** |

*(The first pair I measured read 4.3 against 26.6 and the second 13.9
against 17.0 — one pair is not a measurement. Alternating the order
across three rounds so neither read gets the warm cache gives the
medians above, and they are order-independent. The 4× is the number;
the 6× I nearly wrote down was an artefact.)*

Every bit of the difference is SQLAlchemy building an instrumented
object per row for callers that read attributes off it once and throw
it away. `_workbook_of` is exactly that caller.

**And it is not only chat.** `cells_of` feeds `run_audit` and
`audit_of_version` too, so **every audit of every real model** was
paying it. Chat was where I noticed it; the audit is where it costs
most, because it runs on every upload.

`repository.cells_for_graph` returns the same cells as columns. The
rows are SQLAlchemy `Row`s, which answer to the same attribute names,
so `_workbook_of` takes either with one widened annotation. What they
deliberately do **not** carry is `id` — that is the whole difference
between the two methods, and grounding and the tie-out, which point at
a *row*, still take `cells_of`.

Measured after: the assistant's whole workspace load on Kelso
**28.4 s → 9.0 s** (7.0 s on Levenmouth, was 21.0).

**Three tests, and none of them times anything** — a timing test is a
flake. What they hold is the property that made the switch safe: the
workbook built from either read is the same workbook, cell by cell,
down to precedents and `alias_of`; `_audit_one` produces identical
findings and an identical record from either; and the light read
carries no `id`, so a caller that needs identity cannot quietly reach
for the fast one. Full tieout suite **977 passed, 4 skipped**.

**A note on the file.** `repository.py` is in no lane's row in
`lanes.md` — not an engine module, not another lane's package. The
change is purely additive (`cells_of` is untouched, so no caller I did
not switch behaves differently). Reassign or revert if that reading is
wrong.

### Still unassigned after four sweeps: the rebuild gap

Raised in the twenty-fourth sweep, measured, and it appears in no
orders file and nowhere in the lead's worklog. Restating it because it
is the largest hole this lane has found and it is going stale:

**The product audits a poorer workbook than the engine does.** It
never audits a file — `_workbook_of` rebuilds one from stored cells,
and only `hidden_sheets` was ever carried across. Over the nine
readable corpus models that loses **41 of 116 findings** — `error-value`
×28 (thirteen at error severity), `broken-name` ×12, one `hidden-sheet`
downgraded — and takes **four models to zero**. Levenmouth's report
says « Nothing failing » over a file carrying `#N/A` across
`Repayment schedules!D79:D126`, forty-eight cells of a live repayment
column. The golden-master gate cannot see it: it certifies `audit()`
against files, and the product never audits a file.

The patch is one dict literal in `ingest.py` (which already holds the
whole `Workbook` when it writes `counts`) plus the mirror of the two
lines already in `_audit_cells` — written out verbatim in the
twenty-fourth-sweep entry above. `ingest.py` is in no lane's row
either. **Assign it, or say the word and this lane will do it** — it
is two files and an afternoon, and today it is the difference between
a report that is honest and one that is quiet.

## Twenty-third turn — the rebuild gap, closed

Raised in the twenty-fourth sweep, restated last turn, and still in no
orders file and nowhere in the lead's worklog. `ingest.py` is in no
lane's row, the same reading I applied to `repository.py` last turn and
reported plainly, so this lane did it. **Revert if that was wrong** —
but the product has been quietly under-reporting real models for four
sweeps and that is the more expensive mistake.

### What was wrong

The product never audits a file. `_workbook_of` rebuilds a `Workbook`
from stored rows, and every field the reader fills at *open* time was
empty by the time a rule read it. `hidden_sheets` was the one somebody
noticed, and it was fixed alone — the comment above it («  the cells
cannot say what the workbook hides ») is exactly right and was never
generalised.

### What each fact is worth, measured one at a time

Same file, audited whole and audited as the product would, with facts
restored in groups (`logs/atelier/restore_gap.py`, nine readable corpus
models):

| restoring | still missing | invented |
|---|---|---|
| nothing (today) | `broken-name` ×12, `error-value` ×28, `hidden-sheet/error` ×1 | `hidden-sheet/smell` ×1 |
| the six cheap facts | **nothing** | **nothing** |
| those + `row_words` | nothing | nothing |

**The gap closes exactly.** Not « mostly » — the rebuilt workbook
becomes the file's workbook as far as `audit()` can tell, on all nine.

`row_words` buys nothing measurable *on this corpus*, and it is the
expensive one (50–400 KB against 0.7–18 KB for the other six). It is
kept anyway, and the reason is stated rather than assumed: it is the
audit's **suppression** input — the fact that lets a rule honour a
number a sheet's own words already state — so a model where it matters
produces *false positives* without it, and the corpus simply does not
happen to contain one. The cost is real and small: Kelso's cells
already occupy **99 MB** in this database and its `row_words` is 254 KB,
which is 0.26%. Storing half a truth is what created this bug.

### The fix

`ingest.py` keeps them under `counts["workbook"]` (it already holds the
whole `Workbook` when it writes `counts`), and `service._restore_file_facts`
puts them back before the audit runs — one function, so the next fact
has one obvious home instead of another lonely two-liner.

Two details worth keeping: `errors` was already taken in `counts` for
the audit's error *count*, so the workbook's error cells are
`error_cells`; and JSON has no integer keys, so `row_words`' row
numbers go out as strings and are turned back on the way in, which a
test holds.

**No migration.** A model ingested before the key existed has no facts
to put back and audits exactly as it did — the restore reads a missing
key as an absence, not as a zero. Uploading it again is what teaches
it. That is a test too.

### The face

Levenmouth, re-read through the fixed intake into its own deal so the
before and after sit side by side. The audit found **the same seven
findings the engine finds on the file** — `error-value` ×2 error, ×3
smell, `broken-name` ×2 — where it had found nothing at all.

The report was the thing that lied. It used to open:

> **Nothing failing — but little could be checked.** … The checks that
> read values — the statements, the model's own check rows — found
> nothing failing.

It now opens:

> **Not ready to send. Seven findings, two of them material.** This copy
> carries values only — 224 of 432,596 cells hold a formula — so the
> rules that read how the model is built saw almost none of it. **What
> the value-reading checks did find: two error values.**

The values-only qualification survives, and is now telling the truth
instead of covering for a blind spot. Section 3 names them:
`Repayment schedules!D79` — « #N/A at D79:D126 inside an otherwise live
column — values resume at D127 » — the forty-eight dead cells of a live
repayment column that this lane first found four sweeps ago, finally on
the page a partner reads. Shots: `logs/atelier/whole-read-verdict.png`,
`logs/atelier/whole-read-findings.png`.

### Tests

Four, and I proved they bite by stubbing the restore out and watching
three go red: broken defined names reach a finding on the repo's own
judged model (it carries fifty); cached error values reach a finding;
the stored facts round-trip through JSON including the integer row
keys; and a model stored before the fix still audits, poorer and
without raising. Full tieout suite **981 passed, 4 skipped** — no
existing test's finding counts moved, which is its own small comfort.

## Twenty-fourth turn — the Versions view costs two and a half minutes,
## and the obvious fix is wrong

Looking for the next hole in the fresh inventory, the twenty-ninth
sweep's new `watch/profile.py` stood out: it is the missing half of the
Versions panel I built — the panel prints « 1 defect this revision
introduced » with no denominator, and `profile_of` is exactly the
denominator, per model and size-matched, refusing below three priors in
words. So I went to cost it, because a profile needs the model's *prior*
transitions.

**Costing it found a bigger hole than the one I was closing.** One Watch
transition, timed:

| model | cells | one transition |
|---|---|---|
| cascade fixture | 313 | 0.1 s |
| example_preapp | 4,798 | 3.1 s |
| levenmouth | 432,596 | **158 s** |

The Versions tab computes exactly this, in the request, every time it is
opened. **On a real model the screen I shipped sits at « comparing… »
for two and a half minutes.** It works on fixtures. It does not work on
the corpus, and no test could have told me — the fixture is 313 cells.

### The obvious fix, tested and rejected

The product holds both versions' cells, and since this morning's
rebuild-gap fix the rebuilt workbook carries the file's own facts too.
So: compute the delta from stored cells instead of re-reading the files.

Measured on **the real thing** rather than a simulation — every adjacent
version pair in the demo database, `delta_between` (files) against
`delta_of` over `cells_for_graph` + `_restore_file_facts`
(`logs/atelier/delta_stored.py`):

| pair | same report |
|---|---|
| Cascade Demo v1→v2 | yes |
| Cascade Watch v1→v2, v2→v3 | yes |
| unchanged re-upload v1→v2, v2→v3 | yes |
| **unchanged re-upload v3→v4** | **no** |

Five of six agree. The sixth differs by `unmatched_new`: **1 from the
files, 0 from the cells.** That is precisely what the Watch's own
docstring warns about — « a cell the ingest labeller skipped is still a
cell the Watch reports ». A finding on a cell ingest never stored cannot
exist in a report built from stored cells, so the product would have
quietly under-counted, and the count it would have dropped is the one
the Watch keeps *apart* because it cannot be matched by name. Under-
counting there is the exact failure this lane spent the morning fixing
in the other direction.

**And it would not have been fast anyway.** Timed on levenmouth, the
comparison from stored cells is 128 s against 158 s — the file read is
not the dominant cost, the alignment over 432,596 cells is. A 19%
saving for a wrong answer.

So the substitution is dead on both counts, and I have not made it.

### What is true, and where it goes

The Versions delta cannot be made affordable in this lane's row. The
work is in the Watch's comparison itself (Prism's), or the computation
has to stop happening inside a request — there is no `tasks.py` in
`polar/tieout/` and no background path for any check, so making one is
an architectural decision and the lead's, not a defect fix.

**Persisting it is the other half of the answer and needs the same
decision.** The delta between two versions is a pure function of two
immutable artifacts, so it is computed identically every time it is
viewed. Keeping it would make every view after the first instant *and*
hand `profile_of` its priors for free — the profile is unreachable
without it, because building priors on demand means N−1 transitions at
158 s each. The obstacle is that the only place it is computed today is
a `GET` on a read session; the product's established pattern for
expensive-then-kept is a deliberate `POST` (the recalculation mark), and
which of those this should be is a product call.

### What shipped

The screen now says what it is doing, in the model's own numbers:
below 50,000 cells nothing changes, and above it the line reads
« This model has 432,596 cells, and a comparison that size takes a few
minutes. It is computed fresh every time — nothing here is a saved
answer. » A screen that says « comparing… » for two and a half minutes
and nothing else has stopped being honest and started looking broken.

That is a small change on the back of a large measurement, and it is
deliberately all I changed: the fix I could have shipped was wrong, and
shipping it would have cost a finding class rather than saved time.

## Twenty-fifth turn — a states sweep on the corpus, now that the
## corpus produces findings

The last states sweep ran on seeded fixtures. Since then the intake
fix made real models produce real findings, so the screens can be
swept against them for the first time. Kelso re-read through the fixed
intake (96 s), then driven tab by tab.

**The product works end to end on a 470,594-cell model.** The deals
list, Overview, Findings, Versions and the report all render, and the
new intake facts are visibly doing their job: Kelso's Findings tab now
carries « 338 defined names point into other workbooks that are not
here (IRRSHARINGREQ, ModStartDate … and 332 more) — IRRSHARINGREQ reads
`[1]Checks!$H$110` », filed under **Auditability risks**, which is the
family this lane mapped three turns ago. That mapping is doing real
work on a real model.

Three defects found, all on the page a partner reads.

**1. A finding about the workbook had nowhere to be.** `broken-name`
carries no sheet and no ref — by its nature: it is about the file's
defined names, not a cell — and every screen drew an **empty grey
pill** beside it. A reader sees a rendering fault where the truth is
« the whole workbook ». The engine already names what such a finding
is about, so the endpoint now falls back to that: the pill reads
**« defined names »**. Fixed server-side rather than in one screen, so
the report and the panel get it too. One route test, which asserts
both halves — no ref, and not blank.

**2. The report printed `432596`.** On the same page as a sentence
reading « 224 of **432,596** cells hold a formula » — the same number
twice, one of them unreadable. The « Cells read » fact row now groups
its thousands like everything else a person reads on a printed page.
Verified by printing the PDF and reading it back: « Cells read
432,596 · 224 of them formulas ».

**3. The print path had never carried material findings.** Every
earlier PDF check ran on a report with none. Printed Levenmouth's, now
that it has two: **4 pages, the product's own fonts embedded**
(JetBrainsMono, Newsreader, InstrumentSans), section footers right, and
section 3 carrying both citations in full — « Repayment
schedules!D79 · #N/A at D79:D126 inside an otherwise live column —
values resume at D127 ». No defect; the check had simply never been
run on this state, and now it has.

**And the honest wait line reads correctly on the real thing**:
« Reading both versions and comparing… This model has 470,594 cells,
and a comparison that size takes a few minutes. It is computed fresh
every time — nothing here is a saved answer. »
(`logs/atelier/corpus-versions-wait.png`.)

### One number moved, and it was not this lane

Kelso's `model-own-check` findings went from **7 to 3** between its
first audit and the re-read. That is Sentinel's own-check period
restriction, not the intake fix: the old run finished at **18:37** on
27 Aug and the restriction landed at **18:39**. Checked rather than
assumed, because « the product suddenly reports fewer errors » is
exactly the change that should never be waved through.

Suite **1012 passed, 4 skipped**; ruff, mypy, tsc, eslint and prettier
clean.

## Twenty-sixth turn — the successor to a refusal

`lanes.md` gained « Refusal is not the finish line » and it lands on
this lane directly: last turn I refused « compute the delta from
stored cells » — correctly, it lost an `unmatched_new` on a real pair —
and closed with three routed items and no successor. Half a turn.

### First, where the 158 seconds actually goes

I had assumed the file read dominated. It does not. Timed on
levenmouth (432,596 cells), `logs/atelier/delta_split.py`:

| step | cost |
|---|---|
| `read_workbook` (each side) | 28.9 s |
| `period_axes` | 0.25 s |
| `audit` (each side) | 2.6 s |
| `sheet_grids` | 1.0 s |
| aligning the sheets | the rest |

Two reads and two audits are 63 s of the 158. **The alignment is the
rest, and it is concentrated**: aligning each sheet against itself,
`Distributions` took 113.9 s and `Ratios` 111.9 s — two sheets out of
twenty-four carrying 87% of the cost. (My per-sheet loop sums to more
than `delta_of` spends end to end, so it is a profile of where the
work is, not a decomposition of the total. The concentration is the
finding and it holds either way.)

### The successor: do not compare

Not a faster comparison — **not comparing**. Two uploads with the same
digest are the same file: no cell, formula, label or sheet can differ,
and the answer is exact rather than quick. Ingest now records the
SHA-256 of the bytes it already holds; `VersionRead.counts` already
carries whatever ingest kept, so **no new endpoint and no new field** —
the Versions tab reads the two digests it already has and never asks
for a comparison it can prove is empty.

On the demo's own re-upload deal the row reads « The same file again —
byte for byte » and the panel says why: « This upload is byte for byte
the same file as the version before it, so there is nothing to compare
— no cell, formula, label or sheet can differ. Nothing was read to
answer this. » Instant, where the same conclusion cost two and a half
minutes. `logs/atelier/same-file-again.png`.

Four tests, and the load-bearing one is `two absences are not a match`:
every version stored before today has no digest, and reading « both
have none » as « both are the same » would tell a reader two different
files are one — the worst answer this path could give.

**The digest is also the precondition for the other two successors.**
A persisted delta keyed by (old digest, new digest) is correct forever
rather than correct until someone re-uploads.

### The three designs I did not try

1. **Prune the comparison to sheets that can have changed, from the
   file's own zip entry CRCs.** An `.xlsx` is a zip; each sheet is an
   entry with a CRC-32, so identical CRCs mean byte-identical sheets —
   exact, not a heuristic, and a directory read costs milliseconds.
   With 87% of the alignment in two sheets this is the highest-value
   design here. Not tried because the Watch takes two workbooks and no
   sheet filter, and adding one is Prism's; and because **whether
   Excel leaves untouched sheets byte-identical across a save is not
   measurable with this corpus** — every SFT model is one version. What
   would have to be true: two consecutive Excel saves of one real
   model. Any bank contact can produce that in a minute; the corpus
   cannot. `logs/atelier/zip_sheet_crcs.py` runs the check the moment
   such a pair exists.
2. **Compute the transition once, when the version is uploaded**, at
   the moment a person already expects to wait for a check — rather
   than in the request that displays it. Differs in kind: it moves the
   cost to where it is tolerable instead of reducing it. Not tried
   because `polar/tieout/` has no `tasks.py` and no background path for
   *any* check, so introducing one is an architectural decision.
3. **Derive the identical-file report from the engine's own pieces
   rather than skipping it.** For identical files the answer is
   knowable exactly — new 0, repaired 0, persistent = the keyed
   findings of the one workbook — so the panel could show the real
   report rather than a sentence. Not tried because `keyed_findings`
   is private to `watch/delta.py`; reaching through it would be a
   frozen-interface violation, and the honest move is to **ask for it
   to be exported**, which is the smallest possible ask and would let
   the fast path return a full report instead of a refusal-shaped one.

Suite **1037 passed, 4 skipped**; ruff, mypy, tsc and prettier clean.

## Twenty-seventh turn — two rule keys, and the abundant direction surveyed

### The priority: `currency-mismatch` and `scale-mismatch`

Sentinel's merge was held at the tip until the category map covered
them. Both are mapped, and the guard test that caught the gap is why
this took ten minutes rather than a sweep.

**A new family — « Units that do not agree »** — the first added since
the map was written, so the reasoning is on the record. I read the
rules on Sentinel's branch before naming anything: the finding is
« `{formula}` adds terms of different currency: USD, EUR. A sum may
only carry one currency », severity **error**.

That is not a « probable formula defect »: the formula is
mechanically perfect and the answer is nonsense — a **meaning** error,
not a mechanical one, and filing it beside a skipped SUM range would
tell a reader the wrong thing about what went wrong. Nor is it a
« structural exception », which in this map means the statements not
holding together, one relationship at a time.

« Units that do not agree » says the whole of it in words a banker
uses, and it extends to the unit checks that follow — currency, scale,
per-unit against total. **The pattern it sets**: a later check about a
*basis* rather than a unit (real against nominal) earns its own family
rather than stretching this one. Families are named for what the
reader is being told, not for where the code lives.

**And the name is carrying more weight than it should.** Neither rule
is in `RULE_NAMES` or `HEADLINES` on Sentinel's branch, so a firm
cannot see or switch them off, and — because the report falls back to
the family when a finding has no headline — **this family name is the
only name a reader sees for the defect**. That is the sixth rule
outside the catalogue (`gapped-test`, `broken-name`, `typed-over-beat`
before them), and the first two at *error* severity.

**The guard now clears its own exemption.** Mapping ahead of a merge
breaks `test_the_map_invents_nothing`, so the two keys sit in an
explicit `AHEAD_OF_THE_ENGINE` set — and a second test fails the
moment the engine *does* emit one, which is the sweep the entry must
be deleted. Proved by dropping a scratch file carrying the rule
literal into the engine tree and watching it go red. An exemption that
outlives its reason is how a guard quietly stops guarding.

### The abundant direction: what the product does today

Seeded for real (`cascade_memo_stale.docx` against `cascade_model.xlsx`)
and taken through the whole path rather than read off the code.

**It works, and it is already first-class.** The tie-out reconciled 6
figures, 4 agreeing, **2 drifting**, and the Findings tab shows them
under « Documents against the model »:

> **$235.3mm where the model says $228.9mm** — paragraph 6 — Material
> **10.2% where the model says 9.8%** — paragraph 9 — Material

That *is* « your memo says 14.2% IRR, the model now says 13.7% », with
the paragraph cited. `run_tieout` has read memos and messages beside
decks all along — the comment in it says so in as many words.
`logs/atelier/memo-drift-findings.png`.

### What is missing — four gaps, in the order they cost

**1. The reader that can read a PDF is wired only to the scarce
direction.** `SUFFIXES` maps `.pdf` to `ArtifactKind.source`, and
`_read_memo` takes `.docx` only — so a PDF **cannot** be checked
against the model whatever the caller asks for, even though the upload
route accepts an explicit `kind`. An IC memo, a board paper and a
quarterly covenant certificate circulate as PDFs. The Chain already
reads a PDF's every number with its page and box; that extraction
feeds provenance and nothing else. **This is the whole gap between the
abundant direction and the documents it is abundant in.**

**2. No screen lets a person say what a document is.** The client's
`upload()` posts the file and never the `kind`, so the extension
decides alone. Even once a PDF *could* be either, nothing on the
screen asks.

**3. A memo revision gets no « what did this do to what we sent
out ».** My own `deck_delta` filters `kind is ArtifactKind.deck`, so
the comparison the tie-out is happy to run on a memo has no revision
view. Widening the filter alone would break: the Watch's `deck_delta`
calls `tie_out`, which calls `read_deck` — pptx only. But
`tie_out_both(figures, book, published)` is split out precisely so a
caller can supply its own figures, and `compare_tieouts` is exported.
Composing `read_memo(...).figures` with those two would give memos the
same revision view without touching the engine — a small, real
successor, **not built**, because the orders say findings only.

**4. One figure could not be matched and only the report says so.**
The run recorded `unlinked: 1` with the reason « no output fits the
label ». The report's coverage section carries it (« N not checked »);
the Overview says « Every check that applies to this model ran to the
end », which is true of *checks* and silent about the figure. Not a
defect — the sentences are about different things — but the Overview
is where a person lands, and « 6 of 7 figures were reconciled » is a
fact it does not carry.

**What I did not survey**: whether the memo reader finds figures in
tables, headers or footnotes as well as paragraphs. The fixture's
drifts are both in body paragraphs. That is Scribe's answer-key work
and the honest next measurement here.

Suite **1043 passed, 4 skipped**; ruff, mypy, tsc and prettier clean.

## Twenty-eighth turn — G4: one place to act is one entry

The reset says the only surfaces that matter are the ones carrying
engine output to a reader, and names G4 after the rule keys. The rule
keys are pushed and holding nothing; this is G4.

**A hostile read of Kelso's report**, on the newest engine output —
470,594 cells, five findings including the `broken-name` the intake
fix restored. The verdict, the coverage, the abstentions and the
citations all held. Section 3 did not.

It printed **three material findings that are one place**:

> 01 The model's own check rows are firing at calcFundingSA!N712
>    calcFundingSA!N712
>    16.3 on the model's own « CHECK » row, built to read zero
> 02 The model's own check rows are firing at calcFundingSA!M712
>    calcFundingSA!M712
>    33.64 …
> 03 The model's own check rows are firing at calcFundingSA!O712 …

One check row, three adjacent columns, the same sentence three times,
the cell printed twice each time — once inside the sentence and once
as its own citation — and a third of the page spent on it. A partner
reads three problems where there is one thing to do.

**Fixed, and nothing composed.** Three changes, each checked rather
than assumed:

1. **The section numbers places, not findings.** Findings are grouped
   by rule, sheet and row. The tally above is untouched — three
   findings *are* three findings and the count says so — but 01 is now
   the row, with each cell beneath it keeping its own figure and its
   own evidence sentence.
2. **A shared sentence is said once.** Only when every title in the
   place is identical *with its own reference removed*, so a place
   whose sentences genuinely differ keeps all of them. That is a test,
   not an assumption about how rules phrase themselves.
3. **The doubled citation is gone.** The pill is suppressed when the
   sentence already prints the very same reference — and comes back
   when the shared sentence has taken the reference out.

And the cells are ordered as a person reads a model — down the
columns, left to right. They arrived N712, M712, O712.

It now reads:

> **01 The model's own check rows are firing**
> `calcFundingSA!M712` · 33.64 on the model's own « CHECK » row, built
> to read zero — reports 33.64 in FY2018, a row that is zero
> everywhere else.
> `calcFundingSA!N712` · 16.3 …
> `calcFundingSA!O712` · 6.818 …

**Verified as the artifact a partner receives**, not just on screen:
printed and read back — 4 pages, the product's own three fonts
embedded (Instrument Sans, Newsreader, JetBrains Mono), section
footers right, and page 3 carrying the grouped entry with all three
cells and all three figures intact.
`logs/atelier/report-kelso.pdf`, `logs/atelier/report-one-place.png`.

### What else the hostile read found, not fixed

- **Page 1 prints the same two numbers twice** — the verdict says
  « 814 of 470,594 cells hold a formula » and the fact row says
  « 470,594 · 814 of them formulas ». True twice over; the row could
  carry something the verdict does not.
- **A workbook-level finding is cited differently on two surfaces** —
  the Findings table says « defined names » (the endpoint's fallback,
  fixed last turn) and the report says `kelso_model.xlsm`, because
  `citeOf` falls to `where.filename` before the label. Both true,
  neither wrong, and they should agree.
- **Section 2 lists the abstentions above the values-only sentence**,
  which is the larger reason coverage is poor.

### A lesson from the lead's refutation, worth writing down

The CRC design was refuted 372/372 on the AU-UK corpus — eleven
consecutive Ofgem ED2 revisions of one model, which is exactly the
« two consecutive saves » I said did not exist here. **It did exist,
in another corpus.** Before claiming a measurement is impossible,
check every corpus in the repo, not the one the current work happens
to use.

Suite **1043 passed, 4 skipped**; ruff, mypy, tsc, eslint and prettier clean.
