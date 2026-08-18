# The Ances workspace design, as given

`markup.html`, `component.js` and `stylesheet.css` are the founder's
`Ances_Workspace.html` — 18 August — with nothing removed but the
embedded font binaries and the bundler's wrapper. Checked in so that
« the design says » is a claim anyone can check.

The build is measured against these files. If a value in the web app
disagrees with a value here, the file here is right.

## The canvas

**1440 × 900**, light theme only.

## The name

The product is **Ances** (the founder's rename from Antford; the serif
« A » mark stays). The design's wordmark says Ances; seventeen copy
strings inside it still say « Antford » because the canvas predates the
rename — the implementation writes **Ances** wherever the design writes
Antford. That is the one deliberate departure from the file.

## The two props

- `notConnected` (default false) — first-run faces: Models empty state,
  Check-a-model's first-run face.
- `manyModels` (default false) — false means one watched model: the
  Models tab opens straight onto it, no list, no back chip. True gives
  the list (« Needs attention » / « Clear » groups) and the back chip.

## The shape of the thing

- **Bottom dock** navigation: Assistant · Models · Check a model ·
  Settings · account avatar. The wordmark sits top-left in Bodoni Moda;
  body type is Instrument Sans; cell references are IBM Plex Mono.
- **Assistant is the home tab**: serif A mark, « What would you like to
  know about this model? », model chip with meta line, five suggested
  questions in labelled rows (Trace back / Trace forward / Inventory /
  Structure / Versions), structured answers (sentence → ref rows →
  « ends » paragraph).
- **Model page**: left rail (Owner, Date of latest run, Version,
  Standards, Coverage, « Open findings by version » bar chart), title +
  verdict tag + version pill, « Summary of the check » bullets under a
  blue-gradient heading, a flat **Findings table** (finding + figure
  unit + category · Where in green mono · Figure in blue · Severity
  pill Material/Significant/Observation), « Where the findings sit »
  sheet table, then collapsible rows: Checks that pass · Checks that
  did not run · Evidence locker · The model · Documents that quote it.
- **Finding modal**: standard + ref subtitle, one plain sentence, a
  mini Excel frame (name box, fx bar, column/row headers, the guilty
  cell amber `#ffeb9c`/`#9c5700`, Excel-green selection `#107c41`,
  sheet tab strip), explanation, « Open the cell » + « Accept with a
  note ». Accepting requires a note (> 2 chars) and files into the
  evidence locker.
- **Check a model**: centred drop card; run card with file chip,
  progress bar and step list; done state is the grouped report
  (PROBABLE FORMULA DEFECTS…, F-01 ids, caps severity labels) with
  Ask / Export report / Check another in the top bar.
- **Ask sheet**: right-hand panel (× and + top corners), serif A,
  « Ask me about this model. », pill input (+ · mic · blue send),
  arrow-icon suggestion rows.
- **Settings**: centred segmented pill (Connections / House rules /
  People) on the grey canvas; card lists. Connections holds the
  Microsoft account, « Folders Ances watches », « Mailbox Ances can
  read », the Excel add-in (Install / Deploy to the whole team).
- **Add models**: sheet modal (Cancel · Choose folders · Next),
  SharePoint breadcrumbs, folder rows with file counts, confirm step
  naming a client per pick, then a three-step setup run.
- **Export report**: modal with include-checkboxes and « Every finding
  carries its cell reference. Nothing is summarised away. »

## Palette

Blue `#0060d0` (hover `#0055ba`); ink `#1d1d1f`; greys `#86868b`,
`#a1a1a6`, `#aeaeb2`, `#8e8e93`; hairlines `#e6e6ea`/`#eceaec`; canvas
radial `#ffffff→#f4f5f7→#e9ebef→#e2e4e9`; green `#34c759`/`#2a9d4f`;
severity: Material `#c9302c` on `#fdecea`, Significant `#0060d0` on
`#eaf2fd`, Observation `#7a4a8c` on `#f6eef8`; amber accents `#c8790a`
/ `#e8a33d`; mono refs green `#2a9d4f`.

Screenshots of every captured state sit in the session record; the
live app is verified against the same 1440×900 canvas.
