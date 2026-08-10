# The road to a finished product

Written 10 August 2026. Supersedes the sequencing in `build-order.md`,
which was correct when the engine was the whole of it and is now out of
date on everything above the API.

This is the plan I am working through **independently**. `worklog.md` is
the running record of what actually happened, in enough detail to pick up
cold. When the two disagree, the worklog is what occurred and this file is
what was intended.

---

## The line the product is standing on

**Reading is nearly finished. Writing has not started.**

Everything built so far *finds* things. Nothing *fixes* anything. That is
the honest halfway mark, and it is the single most useful sentence in this
document.

| | State |
|---|---|
| Engine — decks, models, memos, audit, chain | Done |
| Persisted spine — artifacts, figures, cells, links, findings | Done |
| API — 17 routes, anchors, identity, panel auth | Done |
| Workspace — 5 of 13 screens live | Part |
| Office panel — plumbing done, UI placeholder | Part |
| Writing — proposals, apply, reverse | **Not started** |
| PDF sources, connectors, firm standards | Not started |
| Accuracy | Forever, never blocking |

---

## Phases, in the order I am doing them

### 1 · Upload  *(the product cannot be used without it)*

There is no way to put a file in through the interface. The endpoint has
existed since the spine landed; the data room can only list. Every demo
until now has needed a seed script, which means nobody outside this repo
can try it at all.

- Drop zone on the data room, in the design's own register
- Progress while it reads; `processing` → `ready` → `failed` polled
- A failed file **stays in the list** with the server's sentence on it
- Re-upload of the same name makes a version, and the screen says so

### 2 · The confirmation queue  *(the mechanism the promise rests on)*

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

### 3 · Density  *(the state the design has never met)*

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

### 4 · The screens already drawn, that need no new backend

- **Pitchbook** — the figure map is live (`/artifacts/{id}/figures`);
  every figure on the deck, coloured, with the unlinked ones saying why
- **Sheets** — the model audit is live; cells, formulas, findings
- **Docs** — memo reading is live; figures in paragraphs

### 5 · The Office panel, in the design

320 px, four hosts, one build. Plumbing done and waiting: host bridge,
manifests, sign-in, anchors to jump by.

### 6 · Writing  *(the big one — weeks, not days)*

- The proposal layer: a change is proposed, never applied
- `.pptx` splice — PowerPoint has never had tracked changes, so the
  reversible-edit story has to be invented
- Word tracked changes — the redline engine already writes `w:ins`/`w:del`
- Apply on accept, undo, and « nothing leaves the firm without a banker
  accepting it »

### 7 · PDF sources  *(the chain's last hop)*

The design already draws it: *Audited accounts FY24 · p.42*. Today the
chain stops at a typed input, which is the edge of the model and the
beginning of the real question. A PDF is ink rather than structure, so
this is a different engine from the spreadsheet one.

### 8 · Connectors and firm standards

SharePoint, OneDrive, Outlook, Teams as sources. House rules as
configuration. Both also solve document identity properly — a drive item
id beats a filename guess.

### 9 · Accuracy — forever, never blocking

`accuracy-backlog.md` holds the list. The one that matters most: **the
deck tie-out has no recall measurement at all.** The model audit has one
(56 %, by mutation); the deck side has never been measured.

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
