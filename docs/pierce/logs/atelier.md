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
