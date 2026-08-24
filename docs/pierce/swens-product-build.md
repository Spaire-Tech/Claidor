# Swens in the product — the build record

The plan is `swens-product-plan.md`; this is what happened, phase by
phase, with what deviated and why. The reference for every screen is
`docs/pierce/design-swens/Swens_Workspace.html`, checked in untouched.

## Phase 0 — the reference

The export in the repo (md5-verified), its component source extracted
beside it, the tokens documented (`design-swens/tokens.md`). The
JetBrains Mono, Newsreader and pdf-icon binaries extracted from the
export's own resource map — the product renders the design's exact
files.

## Phase 1 — brand + shell

Dock **Ask · Project · Settings**; wordmark **Swens** in Bodoni Moda;
Check-a-model removed (dock entry, screen, lifted state); the rename
product-wide including login/signup and the Office panel. Panel token
block updated in the same commit; its byte-compare test passes.

## Phase 2 — the project list

The drawn table (`vDealsList`), one flat list, fed by `GET /deals` —
extended with `model_name` / `model_version` / `worst_tier`, computed
from data the endpoint's loop already loads. Honesty carried into the
drawn columns: « Not checked yet » never reads as « Nothing failing »;
a stale row's checked cell appends « · files changed since ».

## Phase 3 — the project page

`ProjectPage.tsx` — the `pjChosen` block on real endpoints:

- **Overview**: verdict chip (drawn state + the real states the demo
  data never shows: never-checked muted, clean green, « Findings
  open » when open-but-not-material); counts sentence; three
  deterministic bullets (materials + top sheets, current version +
  staleness, abstentions from the audit run's own record);
  « Read the full report »; the trend card from run history.
- **Findings**: chips counted from open findings; family groups
  (`categoryOfKey`); the expanded row — serif why (the stored
  evidence sentence), the engine's own composed grid with the hot
  cell ringed and the Original/Suggested hover, was → should from
  `fix_before`/`fix`, and the actions on real endpoints (propose /
  decide / dismiss-with-reason / open the cell).
- **Sources**: the Map with measured curves (ResizeObserver, the
  design's geometry) and figure-tie counts from `links()`; the
  Documents list.
- **The report sheet**: the drawn three pages filled with what is
  computable — verdict from counts, material findings in their own
  stored sentences, the rest one line per family, versions,
  abstentions, « what this doesn't tell you ». Download PDF prints
  the sheets.

Server: `FindingRead` gained `plain`, `tier`, `weight`, `basis`,
`cells`, `fix_before` (from the evidence dict the constructor already
read); audit run summaries now record per-tier tallies so the chart's
three series are real going forward.

**Named deviations, Overview:**
- The design's chart ticks are version tags (`v14 … v22`); a run does
  not record which version it read, so the ticks are run dates and
  the axis label reads « Check » until runs carry the version. Fewer
  than two runs → the honest sentence, not a shape.
- The version dropdown's rows are facts (v, who, when); picking one
  does not yet re-scope the page, so rows are not buttons.
- « Download the marked-up model » was present as drawn, disabled,
  saying what it would hand over. **Since built (24 August):** the
  server generates the §4 file on request and the card is live; the
  record is in `worklog.md` under that date.
- The report's narrative prose is a later phase; the sheet carries
  no generated text.

## Phase 4 — Settings

The shipped Settings was already this design generation, wired to the
real endpoints (connector, house rules with the server's own rule
catalogue, team). One drawn row was missing and is restored:
**« Folders Swens watches · Change »** in the account card — shown
once a connection exists; Change opens the folder browser.

## Phase 5 — Ask

`Assistant.tsx` rebuilt to the `vAssist` frame: the collapsible
history rail (search with the empty-state that names its shelf, ⌘K
that opens the rail first, New chat, the This project / All chats
scope, dated groups), the Newsreader greeting, the composer card with
the dark send circle, the project chip (the real picker), Share
(copies the chat's link and says so), and answers under the serif
**S** — the assist endpoint's own prose, the tool's rows verbatim,
the boundary line in grey.

**Real history:** the rail's rows are this machine's own past
conversations (localStorage, forty most recent, the Ances key read
once so nothing vanishes with the rename) — reopenable, which the
mock could not do. Server-side history is listed work.

**Deferred with the chat-mechanism discussion, by the founder's
decision — not built rather than built dead:** the composer's « + »
menu (attach / mention / Excel selection), the skill chip, and the
designed workflow answers with the AI's clarifying double-question.
The answer style is in place for them.

## Phase 6 — the sweep

Every visible button on every reachable screen clicked in Chromium
against API-shaped fixtures, the page reloaded between clicks:

```
clicked 121 buttons across 11 screens
DID NOTHING (22)
```

Twenty-two is not twenty-two defects; each was run down:

- **15 are self-navigation** — a dock pill, tab, or sub-toggle
  clicked while already active (Ask on Ask, Overview on Overview,
  Map as the selected half, the report card re-clicked behind its
  own open modal). Correct behaviour.
- **5 are already-selected or empty no-ops** — the selected scope
  and severity chips, New chat on an empty chat, Send with an empty
  composer.
- **2 are the text matcher missing icon-only buttons** (the rail
  toggle and Share carry a title, no text). Both verified directly:
  the rail collapses 298px → 0 and reopens; Share shows « Link
  copied » and the clipboard carries the chat's link.
- **0 dead controls.**

The two page errors the sweep logged came from the fixture's own
shapes (`TeamMember.deals` fed a number where the product's
interface says `string[]`), not from product code.

The sweep's own first two runs were wrong before they were right —
the click helper compared raw multi-line text against collapsed
labels, so it reported buttons dead that it had never clicked. The
matcher now collapses whitespace on both sides; the numbers above
are from the corrected run. DealPage and CheckFile are
gone; their shared helpers (`ago`, `avatarOf`, `initialsOf`,
`categoryOfKey`) live in `files.ts`; nothing imports the removed
screens.

## What is not in the product yet, in one place

1. ~~The marked-up workbook~~ — built 24 August (engine + endpoint +
   live card; see `worklog.md`).
2. The narrative report writer (the sheet is deterministic).
3. Server-side chat history and the workflow-answer mechanism (the
   founder's chat discussion decides these).
4. Version-scoped re-checking (the dropdown shows facts only).
5. `rounding`/`writing` house rules persist with no engine consumer.
