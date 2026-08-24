# Swens in the product: the plan

**Scope note.** This is the plan for one job — the workspace rebuild —
now executed (`swens-product-build.md` is its record). The platform
plan, from today to « complete », is `swens-plan.md`.

**What this is.** The workspace at `dashboard/[organization]` rebuilt
to the founder's Swens design — the design as drawn, fed by real runs,
placeholders gone. The mock work (`docs/pierce/swens/`) was the
rehearsal: every interaction is already decided and proven there. This
plan moves it into `clients/apps/web`.

**The standing rules, applied here:**

- The design is the reference, and it wins. Where a screen needs a
  state the design does not draw (loading, empty, error), the state is
  built from the design's own patterns and listed in the phase report
  — never invented silently.
- Placeholders go away. Every number on screen comes from an API
  response, or the screen shows its honest empty state. No Northbank
  sample data survives into the product.
- When the design cannot work as drawn against real data, stop and
  ask. Not substitute.

---

## 0. What exists, so nothing is rebuilt twice

The product already has a working data layer and the previous
(Ances) screens:

- `components/Workspace/` — 13,300 lines. `Workspace.tsx` (shell +
  dock), seven screens, `Chat.tsx`, `design.ts` (tokens),
  `api.ts` (1,311 lines).
- `api.ts` already covers what the Swens screens need: `deals`,
  `deal`, `findings`, `corrections`, `propose`, `decideCorrection`,
  `dismiss`, `chain`, `grid`, `cells`, `versions`, `check`, `runs`,
  `download`, `houseRules`/`putHouseRules`, `team`,
  `connectorState`/`drives`/`driveItems`/`connectedFolder`/
  `syncFolder`/`disconnect`, `ask`/`askFile`/`assist`, `upload`,
  `createDeal`, mail.
- `DealPage` returns per-checker last runs with **null for
  never-ran** — the field the design's verdict chip and "Checked
  ·" line hang off.

**What survives:** `api.ts` (extended, not rewritten), the engine, the
endpoints. **What is replaced:** the shell, the screens, `design.ts`,
the brand. The old screens are mine against the old design; replacing
them with the founder's new design is the point, not a deletion of
founder work.

One coupling to respect: `design.ts` is copy-synced with
`clients/apps/panel/src/design.ts` and a test fails the build if they
differ. The Swens tokens land in both, same commit.

---

## 1. The design, fixed in the repo first

Phase 0 checks the founder's Swens export into
`docs/pierce/design-swens/` untouched, plus the wired mock and the
extraction of its tokens (type scale, ink palette, radii, the S
mark, the serif). Every later phase cites this directory, the way the
mock build cited the export. The icons and font binaries embedded in
the export are extracted into the app's assets so the product uses
the design's own files.

Done when: the export renders from the repo, byte-identical to what
the founder sent; the token file exists; the panel copy matches.

---

## 2. The screens, in build order

Order chosen so every phase ships something the founder can open and
judge, and so the data-risky screens come while there is the most
room to stop and ask.

### Phase 1 — Brand + shell + dock

Swens wordmark (serif, as drawn), the three-item dock **Ask · Project
· Settings** with the account chip, the frame, the account popover.
The old dock's Models / Check a model / Assistant entries go; their
routes stop existing rather than lingering unreachable.

Done when: the shell screenshot sits beside the mock's and the
founder can't tell which is which except by the data.

### Phase 2 — Project: the list

The design's project list: name, model file, version, checked-when,
findings count with severity dot, hairline rows. Fed by `deals()` +
per-deal state. The design's `openNew` folder browser is the new
project flow (SharePoint picker → confirm → first check), reusing the
existing `NewDeal` wiring restyled to the drawn browser.

Real empty state: no projects yet → the design's empty-state pattern,
one blue link to connect or create.

### Phase 3 — Project: Overview · Findings · Sources

The heart, and the phase with the most data mapping. Per element:

| drawn | fed by |
|---|---|
| verdict chip ("Not ready to send" / live step while checking) | derived from open findings by severity; per-checker `last`; `runs()` polling during `check()` |
| "Checked ·" line | run timestamps; null → "Never checked", never a fake date |
| Re-check | `check(dealId)` + `runs()` — the mock's exact button/chip behaviour |
| version dropdown (v22…) | `versions(artifactId)` on the current model |
| summary bullets | computed from findings (counts, worst items) — deterministic, not LLM |
| "Read full report" (3 pages) | **not built server-side — see Open question 1** |
| Findings tab: severity chips, groups, expand → was/should, why | `findings()`, `chain()` |
| Apply the fix → prepared → Accept → Undo | `propose`, `decideCorrection` — the determined-corrections line holds: only fixes carrying a value the model already states |
| Not a finding + reason (save gated >2 chars) | `dismiss(reason)` — rulings persist across re-checks (already true in the engine) |
| Open the cell | `grid`/`cells` + the document panel opened at the ref |
| Download the marked-up model | **the founder's spec, recorded in §4 — interim state per Open question 2** |
| Sources: Map | `links(dealId)` + `coverage` — the drawn node map, real in/out documents |
| Sources: Documents | `artifacts()` — name, what it covers, date |

### Phase 4 — Settings: Connections · House rules · People

All three drawn cards against the endpoints that already exist:
connector state with both halves (connected / not), watched folders +
Change (drive browser), the Excel add-in card (manifest install
steps + copy link — the shipped panel's real path), house rules
(rounding, writing, checks toggles, the audit-rule list —
`houseRules`/`putHouseRules`), People (`team`, invite).

Honest note that stays: `rounding` and `writing` persist server-side
but nothing consumes them yet. The control is real, the setting is
stored; the consumer is engine work, listed as such.

### Phase 5 — Ask: the shell

The screen exactly as drawn: serif greeting, composer, history rail
(pinned / dated groups, project–all scope switch, working search,
⌘K), the **S** mark on answers, Share. The answer *style* is the
design's — including the AI's clarifying double-question before it
runs — and the mechanism behind it is deferred to the chat
discussion the founder called. Until then Ask is wired to the
existing `assist`/`ask` endpoints for plain grounded answers, and the
nine-workflow choreography waits. History persists per person
(server-side if we add the small endpoint, else honestly
session-local — named in the phase report, not hidden).

### Phase 6 — The sweep

The mock's verification, ported to the product: click every button on
every screen against a dev server with a real seeded deal; screenshot
every screen beside its mock counterpart; every number on screen
traced to the API response it came from. The phase report lists any
deviation from the design with the reason, the way the mock build
printed its removal report.

---

## 3. What has no data source yet, said now

1. **The AI-written report** (the 3-page "Read full report"). No
   server feature writes it today. Options in Open question 1.
2. **Chat answers beyond plain Q&A** — the nine workflows, the
   double-question flow. Deferred by the founder to the chat
   discussion; the shell ships first.
3. **The marked-up workbook** — spec below; engine A-track work.

Everything else in the design has a live endpoint behind it today.

---

## 4. The marked-up model — the founder's spec, verbatim intent

Recorded here so it cannot drift again. This corrects my earlier
substitute (a findings CSV), which was wrong.

> **What it is.** Your own model handed back to you, with every
> problem cell coloured in and a note stuck on it saying what's
> wrong. Plus a first sheet listing all findings so you can sort
> them and tick them off.
>
> **Who it's for.** The person who has to fix it. They don't want a
> description of the problem — they want to be standing on the cell.
>
> **What's in it.**
> - Sheet 1: the list. Severity, sheet, cell, what's wrong, and
>   blank columns for their own notes.
> - Everything after: your model, unchanged, with the problem cells
>   coloured by severity and a note on each.
>
> **The promise that matters:** nothing in the model is altered. Not
> one formula, not one number. Only colour and notes. It's a copy,
> with a different filename, so the original is never at risk.

Build note for when its phase comes: this sits directly on the
proven write path (byte-identical on 27 files). Colour fills + cell
notes + one prepended sheet, written to a copy — exactly the class
of edit the writer already refuses to get wrong. It is engine work
(Track A), scheduled after the screens, not now.

---

## 5. Open questions (defaults named, building to the default unless told otherwise)

1. **"Read full report" before the report-writer exists.** Default:
   the button shows the design's report frame filled with the
   deterministic content we genuinely have (verdict, counts, the
   findings themselves, coverage) and no generated prose; the
   AI-written narrative becomes its own later phase. Alternative:
   hide the button until the writer exists. Either is honest — the
   default keeps the drawn screen visible; the alternative avoids
   shipping a thinner version of it.
2. **"Download the marked-up model" before Track A ships.** Default:
   the button is present as drawn, disabled state with one line
   saying what it will hand over (the §4 file). No CSV substitute.
3. **Old screens the new design doesn't have** — Check a model (the
   private bench) and the standalone Assistant. Default: removed
   from the product when the dock changes. They exist in git history
   if wanted back.

---

## 6. Order of work and gates

Each phase: build → run against a real seeded deal → screenshots
beside the mock → short phase report (what deviated and why, what
state was added and which drawn pattern it borrowed) → founder
looks → next phase. No phase builds on an unreviewed one for more
than one step ahead.

Phase 0 and 1 are one push. Phases 2–5 one push each. Phase 6 closes.
