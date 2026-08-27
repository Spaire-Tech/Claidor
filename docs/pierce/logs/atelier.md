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
