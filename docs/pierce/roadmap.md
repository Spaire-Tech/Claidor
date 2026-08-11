# The road to a finished product

Written 10 August 2026. Supersedes the sequencing in `build-order.md`,
which was correct when the engine was the whole of it and is now out of
date on everything above the API.

This is the plan I am working through **independently**. `worklog.md` is
the running record of what actually happened, in enough detail to pick up
cold. When the two disagree, the worklog is what occurred and this file is
what was intended.

---

## Standing instruction, 10 August

**Finish the product first. Improve the AI second.** The accuracy numbers
are good enough to build on and are not to be chased further until the
product is complete — 83 % on the deck, 56 % on the model, zero false
alarms on both. `accuracy-backlog.md` holds everything known about how to
raise them, written down so it can be picked up cold. Do not wander back
into it.

What « complete » means, in order:

1. ~~**The agent.**~~ Done, 10 August. The composer answers, and every
   figure in the answer came back from a tool in the same turn.
2. ~~**Writing.**~~ Done, 10 August. « Record $48.9mm » is « Accept
   $48.9mm », the correction goes into the file, and Undo takes it out.
3. ~~**The five dock screens that say « not connected ».**~~ Done, 10
   August. Projects and Terminal had real data behind them and are built
   on it; Mail, Calendar and SharePoint need a source that does not exist
   yet and say so, by name, with somewhere to go meanwhile.

---

## The line the product is standing on

**It reads, and now it writes.** As of 10 August a figure a banker accepts
changes in the file — in the deal's copy through the workspace, in their
own copy through the panel — and Undo changes it back.

**Every screen in the dock now does something**, and the three that cannot
yet say precisely what they are waiting for.

**The chain no longer stops inside the building.** A typed input ends at
the page of the audited accounts it was read out of, which is the last
thing the design drew that this could not do.

**A deal can read the room its files live in.** As of 11 August a deal is
pointed at a SharePoint folder and syncs from it, and nothing about that
has been proven against a real Microsoft tenant.

**A figure is checked before it leaves the building.** As of 11 August a
draft in Outlook is reconciled against the model on a press, and the
correction is shown as a tracked change in the design's own card.

What is left is Teams, house rules as configuration, and accuracy, which
is forever.

| | State |
|---|---|
| Engine — decks, models, memos, audit, chain | Done |
| Persisted spine — artifacts, figures, cells, links, findings | Done |
| API — 37 routes, anchors, identity, panel auth | Done |
| Workspace — 13 of 14 screens on real data, 1 waiting on a source | Done |
| Office panel — plumbing and screen both done | Done |
| Writing — proposals, apply, reverse | Done |
| PDF sources — the chain's last hop | Done |
| SharePoint, OneDrive, Outlook | Done, against a stub |
| Teams, firm standards | Not started |
| Accuracy — deck 83 %, model 56 %, both by mutation | Measured |

---

## Phases, in the order I am doing them

### 1 · Upload  ✓ *(10 August)*

There is no way to put a file in through the interface. The endpoint has
existed since the spine landed; the data room can only list. Every demo
until now has needed a seed script, which means nobody outside this repo
can try it at all.

- Drop zone on the data room, in the design's own register
- Progress while it reads; `processing` → `ready` → `failed` polled
- A failed file **stays in the list** with the server's sentence on it
- Re-upload of the same name makes a version, and the screen says so

### 2 · The confirmation queue  ✓ *(10 August)*

The engine proposes a link; a banker confirms it; from then on re-checking
that figure is arithmetic that cannot come out differently. That is why a
56 %-recall engine can back a promise that holds every time — and there is
still no screen for it.

The API is complete: `/deals/{id}/links`, `/links/{id}` with alternatives,
`PATCH` to confirm, reject, or re-point.

- The queue, ordered by confidence, keyboard-first
- One link with its alternatives
- « Point it somewhere else » — search the model's cells
- Confirmed state visible in the figure library

### 3 · Density  ✓ *(10 August)*

Every screen is drawn at seven findings and nine files. Real numbers are
128 figures per deck, hundreds of findings, thousands of data-room files.

- Sticky heading, scrolling body
- Filter by severity, by file, by state
- Search
- Grouping — by file, or by slide
- Paging or windowing above a threshold
- The four states everywhere: empty, loading, error, **too much**

Taken as a first pass in the founder's vocabulary, for him to correct.
No new visual language.

### 4 · The screens already drawn  ✓ *(10 August)*

- **Pitchbook** — every figure on the selected slide, the unlinked ones
  saying why, and the slide's drift carrying the decision
- **Sheets** — the model as a grid: sheets, rows down, periods across,
  published cells in ink. Wanted one new endpoint, `/artifacts/{id}/grid`
- **Docs** — the memo's figures in document order, « paragraph 9 » on each

Two things these screens want and do not have. Both are features rather
than polish, and both were left out rather than faked:

- **A slide, rendered.** The design's deck screen is a picture of a slide.
  Assembling one here out of whatever numbers happen to be on it would be
  a drawing of a slide that does not exist. Doing it properly is a
  converter, an image in S3 and a job — and then the figures overlay it.
- ~~**Number formats.**~~ Done, 10 August. `number_format` is read at
  ingest and rendered by `numbers.py`; the grid shows `12.2%` and
  `($115.9)` where the model does, with the exact value on the title. A
  subset of Excel's format language, and everything outside it falls back
  to the plain number rather than guessing.

### 5 · The Office panel, in the design  ✓ *(10 August)*

320 px, four hosts, one build. Composed from the workspace's idioms rather
than copied, because the design has no drawing of a task pane — see
`clients/apps/panel/src/ui.tsx`, which names the source of each piece.

What it still needs is the thing behind it rather than the screen: writing.
Today the two actions record a decision against the finding. « Accept
$41.9m » only becomes true when phase 6 lands.

### 6 · Writing  ✓ *(10 August)*

Two corrections, both from the founder, both material.

**Word is largely already ours.** `clients/apps/word-addin` — the fork —
carries 4,031 lines of Office.js under `src/office/`, including a
`redline.ts` that applies grounded edits as native Word tracked changes
through `office-word-diff` (Apache-2.0). It fell out of the pnpm workspace
over an SSH-resolving git dependency and out of sight with it. Bring it
back and adapt, rather than build.

**PowerPoint does not need an invented format.** The .pptx spec has no
revision model — true — but nobody has one: PowerPoint's own Compare
diffs two files and stores nothing. We already hold both sides of every
change (`Finding.printed` and `Finding.expected`), so accept writes the
new value, reject leaves the old, reverse writes it back, and the file
stays a normal file. `docs/pierce/writing-pptx.md` has the whole of it.

- ~~The proposal layer~~ — `Correction`, keyed on the finding's
  fingerprint so it survives the run that deletes the finding, and holding
  both sides so reversal needs no revision format
- ~~`.pptx` write~~ — split runs and charts in two places, both as the
  document said. A third turned up that the document did not predict: **a
  shape id is not unique**, and slide 3 of the Cascade deck proves it
- ~~Word~~ — a tracked change, adapted from the fork's `redline.ts` in the
  panel and from `redline.ooxml` on the server
- ~~Apply on accept, reverse~~ — applying makes a new version, never an
  overwrite, so undo is an ordinary write in the other direction

**It needed the file kept.** Reading never wanted the document after
ingest; writing cannot happen without it. Storing is best-effort and a
document that was not kept says so, in a sentence with a next step in it.

What was left out rather than faked is in the worklog: tables and charts
from inside PowerPoint, which a task pane cannot reach; writing to a model
at all; and « Accept all ».

### 7 · PDF sources  ✓ *(10 August)*

The design already drew it: *Audited accounts FY24 · p.42*, and the chain
ends there now. A PDF is ink rather than structure, so the reader is the
memo's shape rather than the workbook's — figures in prose, named by the
words in front of them — with a real page number, which is the thing that
makes a grounded figure checkable by a person.

- ~~Read a source document~~ — `source.py`, and a scan is refused with the
  OCR instruction rather than read as an empty document
- ~~Ground the model in it~~ — the tie-out's own matcher pointed the other
  way, against **typed inputs only**: a computed cell agreeing with the
  accounts is arithmetic working, not provenance
- ~~Say when they disagree~~ — a `contradiction`, which is a different
  sentence from a drift and has a different fix. `CheckKind.crosscheck`
  had existed unused since the spine landed and this is what it was for
- ~~The chain's last step~~ — the document, the page, the sentence, and
  whether anybody has confirmed it

What it does not do: table rows. A statement's columns are headings the
prose reader cannot see, so a figure in one is named by its row alone and
usually goes unlinked — the safe direction, and a real gap. Notes carry
the period in words and link cleanly.

### 8 · Connectors and firm standards  ◐ *(11 August — SharePoint and Outlook)*

SharePoint, OneDrive and Outlook as sources, through Microsoft Graph.
Delegated access only, and read scopes only — this connector reads exactly
what the person who connected it can already open, and **never writes to a
customer's file store or their mailbox**.

- ~~Connect an account~~ — `connector/`, OAuth with a signed state that
  carries the organization and the person, because the browser coming
  back from Microsoft may not carry the cookie at all
- ~~Point a deal at a folder~~ — by drive item id, not by path
- ~~Sync it~~ — content tag in, content tag out: a file that has not
  changed is not downloaded again, a rename is not a second document, and
  everything skipped is counted with a reason
- ~~The screen~~ — `screens/SharePoint.tsx`, the design's document
  library with a **real** sync column: Synced, Stale, Not read, against
  what this deal actually holds
- ~~Exercise it without a tenant~~ — `scripts/graph_stub.py` serves the
  Cascade files as a document library over Graph's own shapes, which is
  how everything above got looked at

Then Outlook, which is the same plumbing pointed at a mailbox and a
different argument for existing: a deck can be pulled back out of a data
room, and a sent message cannot be pulled back out of anything.

- ~~Read a message~~ — `tieout/message.py`, which is the *memo* reader
  with Outlook's HTML in front of it and the quoted thread and signature
  cut off, because a drift reported against a sentence somebody else
  wrote three weeks ago is a false positive with no available fix
- ~~Check it~~ — a message is an `ArtifactKind.message` and the tie-out
  cannot tell it from a memo. One press, one message: a product that
  quietly reconciled an inbox would be a surveillance tool that also
  checks numbers
- ~~The screen~~ — `screens/Mail.tsx`, the design's mailbox with the
  tracked-change card real: the sentence as written, the figure struck
  through, the model's figure underlined
- **« Accept and send » cannot exist.** The design's button, and the
  server has no write scope on a mailbox by decision. What is there is
  the corrected sentence to take, and the add-in — which writes it into
  the draft in the writer's own compose window, on their own press

**Nothing here has run against a real tenant**, and that is the honest
state: the shapes come from the published API and the wiring above them is
real. The first connection will find something — and
`scripts/connector_doctor.py` is what makes it say what, rather than a 502
on a screen and an afternoon. Register the application, connect once
through the SharePoint screen, run the doctor: it makes every call the
connector makes, in dependency order, and each failure carries the
permission or the setting that would fix it.

Still waiting: Teams, and house rules as configuration. Calendar is still
`screens/Waiting.tsx`.

### 9 · Accuracy — forever, never blocking

`accuracy-backlog.md` holds the list and now holds a number for the deck
side too: **83 % overall, 100 % on the figures it links, 0 collateral**,
by mutation on the clean Cascade deck (`scripts/deck_recall.py`).

Every miss was a figure that was never linked. Not one was linked and then
missed. So the work is **coverage, not comparison** — the comparison is
exact by construction and cannot be wrong. Two thirds of the gap is « no
output fits the label ».

And the number is one deck, written here. The next real step is **decks
nobody here made**, which is what made the model audit's 56 % worth
quoting.

---

## Standing rules for this work

1. **The founder's design is the source of truth.** Extend it, never
   substitute it. Where it has a gap, compose from the nearest pattern it
   already has and say which one was borrowed.
2. **Never fake data.** A screen that shows invented numbers inside a
   product about numbers being right is worse than a screen that says it
   is not connected.
3. **What was not checked is part of the answer.** Coverage stays on
   screen. An unmatched figure is never a finding and never hidden.
4. **A false positive costs more than a miss.** After two, nobody opens
   the tool again.
5. **Measure before changing a rule.** The « of » binding in `prose.py` is
   the model: the obvious generalisation cost a false positive and was
   dropped on evidence, not taste.
6. **Every failure message says what a person can do about it.**
