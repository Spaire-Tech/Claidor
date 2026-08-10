# Surface inventory

Read from the five Vesence platform pages on 10 August 2026, as a feature
list to design against. Everything below is what those pages state, in
their own words where the wording is specific.

The point of the document is not the list. It is the **eight components**
in the last section: every screen on every surface is built from them, so
designing them once covers all five.

---

## The shape every surface shares

Each surface opens with **three or four named modes**, shown as tabs:

| Surface | Modes |
|---|---|
| Web | **Create · Edit · Organize** |
| Word | **Draft · Review · Check** |
| Excel | **Review · Check · Format · Create** |
| PowerPoint | **Check · Refine · Create** |
| Outlook | **Draft · Track Changes · Check** |

Four verbs cover all of it: **create · improve · check · organise.** Every
surface is those verbs pointed at a different file type.

Each page also repeats the same two promises:

- *« Connected to the tools your firm already uses »* — local files, the
  data room, SharePoint, iManage, Outlook, prior work, all reachable from
  the prompt.
- *« One workflow. Two surfaces. »* — the same agent and the same review,
  in the web app or inside the Office host.

---

## Web

**Modes:** Create · Edit · Organize

| Feature | What it does |
|---|---|
| Chat with attachments | A prompt box over the matter's files |
| Bulk generation | *« Create contract notes for each person in the spreadsheet using the template »* → seven named `.docx` files out |
| Multi-document editing | Open, compare and update several Word documents side by side, applying consistent changes across all |
| Bulk review over a set | *« Analyzed 47 contracts »* → a table with counterparty, risk level, provision, notice period. Risk graded High / Medium / Low |
| Project consistency check | Run across every file in a project. Findings ranked Critical downward, each naming a file and a section: *« Indemnity cap exceeds LOI threshold ($2.5M vs $1.8M) »*, *« Option pool dilution not reflected in cap table totals »* |
| Reformat to house style | Headings, numbering, defined terms, cross-references — as accept/reject changes, paged (*1 / 14*) |
| File and folder management | Move, rename, restructure across the workspace and the data room's numbered sections |
| Launchpad | Every app and agent available, filterable by origin, pinnable to a dock |
| Library | Skills, agents and integrations — kept private or published to the firm |
| Projects | Files, chats and drafts in one place, shared with the team |
| Parallel agents | *« Start as many chats as you have work. Each agent takes its own document and runs at the same time »* |
| In-place redlining | Tracked changes in the browser, the same as in Word |

Navigation: **Applications · Library · Projects**.

---

## Word

**Modes:** Draft · Review · Check *(plus Create · Format in the examples)*

| Feature | What it does |
|---|---|
| Draft from template | First draft aligned to firm styles and matter context |
| Complex inline edits | *« Change the pricing mechanism from locked box to closing accounts »* — updates the section, adds completion-statement provisions, revises definitions in a schedule, all tracked |
| Playbook review | A named list: Buy-Side SPA (Locked Box), Buy-Side SPA (Closing Accounts), Sell-Side SPA, Shareholders' Agreement, Due Diligence Report, Loan Agreement (LMA), Merger Agreement |
| Quality checks | Cross-references, defined terms, formatting, logical inconsistencies |
| Defined-terms panel | Severity buckets **Critical · Warning · To review · Ignored**, with defect names: *undefined term · unused definition · multiple definitions · unordered definitions* |
| Formatting fixes | *« Heading levels (12 corrections) · Numbering sequences (8) · Cross-reference links (5 updates) »* |
| Citations | Every statement clickable to its source clause |
| Hover a defined term | Meaning, source and linked terms inline, without leaving the page |
| Document mechanics | Rename a term → *« Updated 23 cross-references · Resequenced Clauses 4.2–4.9 · No broken links or orphaned terms »* |
| Severity ranking | Every issue ranked before it is shown |

Chrome: page number, *Page 12 of 186*, word count, zoom.

---

## Excel

**Modes:** Review · Check · Format · Create

| Feature | What it does |
|---|---|
| Explain a formula | *« Explain the formula in F9 and how it flows through to the Returns sheet »* → reads the workbook, analyses the formula, traces `F9 → Returns!C4` |
| Cross-check against documents | Workbook against an SHA → *« Aspen Capital's Series A holding shows 400,000 shares in the workbook, but Schedule 1 of the SHA lists 420,000 »* |
| Formatting | Currency, percentages, table styling, header and total rows to house format |
| Generate a workbook | From a term-sheet PDF, with live `SUM` formulas and currency formatting |
| Traceable numbers | Every figure carries a citation to a cell or a source clause |
| Live formulas, never values | *« It never pastes flat values over your model »* — keeps number formats, styles and cross-sheet links |
| Tracked changes in the grid | Added rows tinted, changed values struck through, accept all / reject all |
| Whole-workbook reading | Follows every reference across sheets, catching **broken and circular formulas** |
| Foot check | *« Does the cap table foot? Trace the Total to its sources »* → *« 142 formulas and cross-sheet links · the Total foots across all 3 sheets, with no broken references »* |

Chrome: cell reference box, formula bar, sheet tabs.

---

## PowerPoint

**Modes:** Check · Refine · Create

| Feature | What it does |
|---|---|
| **Check Setup** | A step before running: choose which checks. **Language** (spelling, grammar, terminology) · **Formatting** (alignment, spacing, hierarchy) · **Validity** (cross-slide consistency and figures) · **Styleguide** (Firm House Style) |
| Findings | Each names an exact slide and carries **Ignore** and **Fix**: *« Slide 3 quotes SEK 1.2m — slide 5 shows SEK 1.4m »*, *« Slide 2 still reads "Project Atlas" »* |
| Refine | Improve wording and layout across every slide while preserving template, fonts and colours |
| Create | A deck from a memo, model or meeting notes, reviewed slide by slide |
| Traceable figures | Numbers stay linked to engagement letters, models and prior decks; click a citation to jump to the clause or slide |
| Tracked changes on the slide | *« insertions underlined, deletions struck through »*, painted onto the slide itself. Accept all / reject all |
| Layout intelligence | Alignment, spacing, **overflow** and hierarchy checked against the slide master |
| Template fidelity | Applies the firm `.potx` — master, theme colours, fonts |
| Slide redesign | A bullet list becomes a colour-coded Gantt chart |

---

## Outlook

**Modes:** Draft · Track Changes · Check

| Feature | What it does |
|---|---|
| Draft a reply | Grounded in the thread, its attachments and house style |
| Thread summary | **Agreed · Still open · Owed by you**, with citations back to the message |
| **Pre-send check** | Five named categories: **Language & Grammar · Recipients · Attachments · Subject Line · Consistency**. Example findings: a misspelling, *« Greeting says "John" but recipient is "Jon Doe" »*, *« Body references the "Closing Checklist" but no such file is attached »*, *« SPA described as "v5" but Next Steps references "SPA v4" »*, *« Escrow duration "24 months" contradicts the 18 months agreed earlier in the thread »* |
| House style | Salutation, sign-off, hedging openers, body font — each as an accept/reject change |
| **Tracked changes inside email** | Sender records edits in the message itself; recipient sees a pane listing each change with accept and reject. *« No separate document, no attachment round trip »* |
| Calendar | Attendee calendars side by side, drag out a slot, draft the invitation with subject, agenda and Teams link |
| **Attachment naming** | Proposes names to the firm's convention — `Document1 (3).docx` → `01 DemoCo-TargetCo SPA (executed).docx`. Drag to reorder, click to edit, reject or apply |
| **Attachment order** | Numbered to match the order the email describes them; superseded versions dropped; bundled into a folder when there are too many |
| **Metadata cleaning** | Finds and strips unaccepted tracked changes, internal comments, author names and revision history, and **lists exactly what was removed** |
| **Attachment verification** | Files referenced in the body but missing, the wrong version against what the thread agreed, and anything still carrying markup |

---

## The eight components

Every screen above is assembled from these. Design them once.

### 1. Prompt box with attachments
*« What can I do for you? »* Accepts files, names them with their type
badge (Word · Excel · PDF). Present on all five surfaces.

### 2. Tool-use trace
The agent showing its work as it goes:

> **Used 3 tools** → `Read` Cap_Table.xlsx (3 sheets) → `Analyzed` Formula
> in F9 → `Traced` F9 → Returns!C4

A vertical list of *verb + object*, streaming, collapsible. Appears in
every example on every page.

### 3. Findings list with severity
Buckets — **Critical · Warning · To review · Ignored** — each finding
naming an exact location and carrying two actions: **Fix** and **Ignore**.
Used by Word's defined terms, PowerPoint's deck check, Outlook's pre-send
check and the web project check, unchanged.

### 4. Tracked-changes review
Insertions underlined, deletions struck through, **accept / reject per
change** plus accept all / reject all, and a count — *« 3 slides changed »*,
*« 7 changes »*, *« 5 tracked changes in the body »*. Rendered over a
document, a slide, a grid and an email body; the control is identical.

### 5. Citation chip
A small clickable reference — `3.2`, `E5:E6`, `Slide 5` — inline in prose,
jumping to the clause, cell or slide. Every surface calls this
*traceable*; it is the same chip.

### 6. Check setup
Before a run: choose which checks, choose a style guide, **Start**.
Explicit on PowerPoint; implied on the others.

### 7. Source picker
*« Connected to the tools your firm already uses »* — local files, the
data room, SharePoint, iManage, prior matters, Outlook.

### 8. Before / after
Two panes, a prompt between them. Used for slide redesign, formatting and
house style alike.

**Eight components, five surfaces.** The Office panel is one 320px app;
the web app is the same components at full width.

---

## Where our engine sits against this

Not a gap analysis of everything — only where what we have already lands.

| Their feature | Ours |
|---|---|
| PowerPoint *Validity — cross-slide consistency and figures* | The tie-out, and it goes further: figures against the **model**, not only against other slides |
| Excel *broken and circular formulas*, *does it foot* | The model audit — circularity, skipped totals, hardcodes, broken references, nine rules citing published standards |
| Excel *traceable numbers · click to the cell* | The chain — and ours renders the arithmetic: `Model!D26 = 48.9, =D16+D24 = Reported EBITDA 41.2, Total adjustments 7.7` |
| Word *defined terms · cross-references · severity buckets* | Built, tuned for legal, needs re-tuning for banking documents |
| Web *project consistency check* | The cross-document check |
| *Tracked changes* everywhere | Word only. PowerPoint and Excel have never had them — that is the proposal layer, and it is weeks |
| Outlook, attachments, calendar, launchpad, library, parallel agents | Not started |

The one line worth keeping in view: their PowerPoint check compares slide
3 against slide 5. Ours compares slide 3 against `Model!D26` and shows the
formula behind it. That is the difference the whole product turns on, and
it is the half that already works.
