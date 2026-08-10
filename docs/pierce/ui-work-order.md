# What the UI needs

The division: the founder builds every screen. This document says which
screens, what data each one receives, and what order to build them in so
that nothing waits on anything.

**Written before the endpoints exist, on purpose.** Every shape below is
the shape the API will return. Build against them as mock data today; when
the endpoint lands, `pnpm generate` produces the typed hook and the mock
comes out. Neither side blocks the other at any point.

---

## It is two surfaces, not five

The instinct was Web, Word, Excel, PowerPoint and Outlook — five things to
design. It is two.

**An Office add-in is a web page in a 320-pixel panel.** The same React
app runs in all four hosts. What differs between them is a manifest file
and which document API it calls to read the open file — both of those are
backend work, not design work.

So:

| | What it is | Whose |
|---|---|---|
| **The web app** | Next.js, the existing design system, full-width | Founder designs and builds |
| **The panel** | One React app, 320px wide, runs in Word · Excel · PowerPoint · Outlook | Founder designs and builds, **once** |
| Four manifests, host document APIs, sideload and deploy | XML and Office.js plumbing | Backend |

**Design one panel.** Not four. The findings list a banker sees in
PowerPoint is the same list, the same components and the same states as
the one in Excel; only the document underneath changes.

---

## The handoff, so neither of us waits

1. Backend ships an endpoint. It appears in the OpenAPI schema.
2. `cd clients && pnpm generate` — typed client and TanStack hooks appear.
3. Screen swaps its mock for the hook. Nothing else changes.

Every shape in this document is a contract. If one has to change, that is
a backend problem to absorb, not a screen to rebuild.

---

## Every screen needs four states

Learned the expensive way on the last build. A screen is not done until it
has all four, and the fourth is the one everyone forgets.

| State | What it means here |
|---|---|
| **Empty** | A deal with no files. A document with no findings — which is the *good* outcome and must not look like a failure |
| **Loading** | Extraction takes seconds on a big model. Skeleton, not a spinner on a blank page |
| **Error** | The model could not be read. The deck is password-protected. Say which and what to do |
| **Too much** | 1,248 findings. 313 cells. Nine slides of figures. The screen must stay usable at the top of that range |

---

# The web app

## 1. Deal page — **start here**

The hub. Everything else hangs off it. If only one screen existed, this is
it.

**What it holds:** the files in the deal, the coverage line, the findings.

```json
{
  "id": "dl_...",
  "name": "Project Cascade",
  "client": "Cascade Industrial Holdings",
  "coverage": {
    "reconciled": 102, "agreeing": 94, "drifting": 8, "unlinked": 13,
    "confirmed": 0,
    "reasons": [
      { "reason": "one end of a printed range", "count": 2 },
      { "reason": "two outputs fit equally well", "count": 4 },
      { "reason": "nothing names it", "count": 7 }
    ]
  },
  "artifacts": [
    { "id": "af_...", "kind": "model", "filename": "cascade_model.xlsx",
      "version": 3, "uploaded_at": "2026-08-10T09:14:00Z",
      "uploaded_by": { "name": "...", "avatar_url": null },
      "status": "ready", "counts": { "cells": 313, "formulas": 228, "sheets": 5 } },
    { "id": "af_...", "kind": "deck", "filename": "cascade_deck.pptx",
      "version": 1, "status": "ready", "counts": { "figures": 115, "slides": 9 } }
  ],
  "findings": { "open": 8, "dismissed": 0, "fixed": 0 }
}
```

**The coverage line is not decoration.** It is the product being honest:
*« 102 of 115 figures reconciled · 13 not checked »*, and the 13 must be
clickable through to the reasons. The engine misses things; a screen that
hides that is a screen that lies.

`kind` is one of `model` · `deck` · `memo` · `source`. Design for four.

**States:** no files yet (the upload is the whole screen) · one file but
not the other (nothing can be checked until there are two) · processing ·
a file that failed to read.

## 2. Findings list

Lives on the deal page and again, filtered, on each artifact.

```json
{
  "id": "fd_...",
  "kind": "drift",
  "severity": "error",
  "state": "open",
  "confidence": 0.94,
  "one_tick": false,
  "printed": "$49.6mm",
  "expected": "$48.9mm",
  "where": {
    "artifact_id": "af_...", "filename": "cascade_deck.pptx",
    "label": "slide 2", "detail": "metric tile, « FY2025A adjusted EBITDA »"
  },
  "source": {
    "ref": "Model!D26", "name": "FY2025A adjusted EBITDA",
    "basis": "Adjusted - see bridge", "artifact_id": "af_..."
  },
  "context": "FY2025A adjusted EBITDA",
  "standard": null
}
```

- `kind`: `drift` (deck disagrees with model) · `audit` (the model
  disagrees with itself) · `contradiction` (two documents disagree) ·
  `stale` (the model moved and this figure has not).
- `severity`: `error` · `smell`. **Never add them into one number.**
- `state`: `open` · `accepted` · `dismissed` · `fixed`. A dismissed
  finding that reappears is the fastest way to lose a user, so dismissal
  needs to be visible and reversible.
- `one_tick`: true when the deck and the model differ by exactly one unit
  at the printed precision — 18.6% against a mean of 18.655%. Almost
  always a rounding convention. Show it, rank it below the rest.
- `confidence`: 0–1, how sure the *link* was. A drift on a 0.56 link reads
  differently from one on a 1.00 link.
- `standard`: for audit findings, the rule's source — « ICAEW P14, FAST ».
  A banker asking « says who » gets an answer that is not « the tool ».

**States:** none (say *checked and clean*, with the count, not just white
space) · one · 1,248.

## 3. The chain — *the one that sells it*

Open a finding and see the whole path. Nothing else in this product is
hard to copy; this is.

```json
{
  "finding_id": "fd_...",
  "steps": [
    { "kind": "figure", "label": "slide 2, metric tile",
      "name": "FY2025A adjusted EBITDA", "printed": "$49.6mm" },
    { "kind": "cell", "ref": "Model!D26", "name": "FY2025A Adjusted EBITDA",
      "value": "48.9", "formula": "=D16+D24", "basis": "Adjusted - see bridge",
      "inputs": [
        { "ref": "Model!D16", "name": "FY2025A Reported EBITDA", "value": "41.2" },
        { "ref": "Model!D24", "name": "FY2025A Total adjustments", "value": "7.7" }
      ] },
    { "kind": "input", "ref": "Assumptions!B19", "name": "WACC", "value": "0.098",
      "note": "typed, not calculated" }
  ]
}
```

Reads as one sentence: **slide 2 says $49.6mm · the model says 48.9 at
Model!D26 · which is reported EBITDA 41.2 plus adjustments 7.7.**

A chain ends at a typed input — that is the edge of the model and the
beginning of the next question, *where did that number come from*. Later,
a PDF page. Design the step so it can be a document, not only a cell.

**States:** a one-step chain (a typed input, nothing behind it) · a
six-step chain · a step whose cell no longer exists because the model
changed.

## 4. Upload

Drop a file, watch it process, see what came out. Part of the deal page
but its own component.

```json
{ "id": "af_...", "status": "processing",
  "progress": { "stage": "reading the workbook", "done": false } }
```

`status`: `uploading` · `processing` · `ready` · `failed`. On `failed`,
`error` carries something a person can act on: *« this .xls is password
protected »*, *« this workbook has no calculated values — open it in Excel
once and save »*.

## 5. Link confirmation — *the mechanism the product rests on*

The engine proposes; a banker confirms; from then on re-checking is
arithmetic and cannot be wrong. This queue is where that happens, and it
is why a 56%-accurate engine can back a promise that holds every time.

```json
{
  "id": "lk_...",
  "state": "proposed",
  "confidence": 0.94,
  "figure": { "printed": "$48.9mm", "label": "FY2025A adjusted EBITDA",
              "location": "slide 2", "artifact_id": "af_..." },
  "cell": { "ref": "Model!D26", "name": "FY2025A Adjusted EBITDA",
            "value": "48.9", "basis": "Adjusted - see bridge" },
  "transformation": "identity",
  "alternatives": [
    { "ref": "Model!D16", "name": "FY2025A Reported EBITDA",
      "value": "41.2", "confidence": 0.45 }
  ],
  "confirmed_by": null, "confirmed_at": null
}
```

Three actions: **confirm** · **reject** · **point it somewhere else**
(pick from `alternatives`, or search the model).

`transformation` is `identity` today; later `sum` · `margin` · `growth` ·
`cagr` · `unit` · `currency`. Show it as words — *« sum of Model!D20:D23 »*
— never as a formula.

**This queue must be fast to move through.** Forty links in a sitting, on
a keyboard. It is the least glamorous screen and the one that decides
whether the product is used.

## 6. Figure map

Every number in the deck, laid out slide by slide, coloured: agreeing ·
drifting · confirmed · never checked. One screen that says *what has this
tool actually looked at*.

```json
{ "slides": [
    { "slide": 2, "figures": [
      { "id": "fg_...", "printed": "$228.9mm", "label": "FY2025A revenue",
        "location": "metric tile", "state": "agreeing", "link_id": "lk_..." },
      { "id": "fg_...", "printed": "90%", "label": "Positioning ...",
        "location": "body", "state": "unlinked",
        "reason": "no output fits the label" }
    ] }
] }
```

`state`: `agreeing` · `drifting` · `confirmed` · `unlinked` · `ignored`.

**The unlinked ones matter most.** They are what the tool did *not* check,
and making them visible is the difference between honest and impressive.

## 7. Model page

The workbook's own health, separate from any deck.

Audit findings (same finding shape, `kind: "audit"`), the sheet list, and
the version history. Plus the one screen with no equivalent anywhere else:
**what moved since the last version** — which cells changed, and which
deck figures went stale because of it.

```json
{ "from_version": 2, "to_version": 3,
  "changed": [ { "ref": "Model!D26", "name": "FY2025A Adjusted EBITDA",
                 "was": "48.9", "now": "51.2", "stale_figures": 4 } ] }
```

This is the realistic case, and the Cascade README says so: not one typo,
but a model revision the deck never caught up with.

## 8. Deal settings

Members, roles, house standards. Most of this exists from the legal build
and needs renaming rather than designing.

---

# The panel — one design, four hosts

320 pixels wide. A phone screen with no scroll to spare.

## What it shows

1. **Signed out** — one button, opens a dialog, comes back signed in.
2. **No deal chosen** — pick which deal this document belongs to. Once.
3. **Findings for *this* document** — the same finding shape, filtered to
   the open file. Click one and the host jumps to the slide, the cell, the
   paragraph.
4. **The chain, condensed** — three lines, not a diagram.
5. **Coverage for this document** — *« 34 of 40 figures on this slide
   checked »*.
6. **Later: propose a fix** — before and after, accept, undo.

## What differs by host, and it is not the design

| Host | What the panel reads | Where it jumps to |
|---|---|---|
| PowerPoint | The open deck | A slide, a shape |
| Excel | The open model | A cell |
| Word | The open memo | A paragraph |
| Outlook | The draft and its attachments | The line in the draft |

All four are the same components. **Design the panel once.**

## The constraint that bites

320px, inside an iframe, in Office. No hover-only affordances — a banker
on a touch-screen Surface is a real user. No horizontal scroll ever. Text
sizes that survive Word's own zoom.

---

# Order of work

Built in this order, nothing waits.

| | Screen | Why now |
|---|---|---|
| **1** | **Deal page** + upload + findings list | Everything hangs off it. Backend has it wired in week 2 |
| **2** | **The chain** | The thing nobody else has; worth seeing early |
| **3** | **Link confirmation queue** | The mechanism the promise rests on |
| **4** | **The panel** — signed out, findings list, chain | One design, four hosts, and it makes the product feel *inside Office* |
| **5** | **Figure map** | Coverage made visual |
| **6** | **Model page** + version diff | The audit and staleness |
| **7** | Deal settings, members | Mostly renaming what exists |
| **8** | Propose-a-fix, in the panel | Blocked on the proposal layer, which is weeks of backend |

**Start with the deal page.** If you build nothing else this week, build
the deal page with mock data from the shapes above — it will be wired to
real files before it is finished.

---

# What I will send as I go

- Every endpoint, the moment it exists, as a line in this repo's OpenAPI
  schema — `pnpm generate` and it is typed.
- A seeded deal with the real Cascade files in it, so the screens have
  true findings and not lorem ipsum. **This will be there before the deal
  page is.**
- A change to any shape above, announced before it lands, never after.
