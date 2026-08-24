# The workspace build — what it is, and what is true on it

23 August 2026. Built from the founder's export
(`Ances_Workspace_1.html`) by `docs/pierce/workspace/build.py`. The
design is theirs; what changed is that every number, name and file on
screen now comes from a run that actually happened, the screens that
were missing were drawn, and two defects in the export were fixed.

```bash
cd docs/pierce/workspace
python build.py SOURCE.html OUT.html     # apply the edits, check the nesting
node shots.mjs OUT.html shots            # photograph every screen
node sweep.mjs OUT.html                  # walk 23 screens and states
```

`sweep.mjs` is the check that matters: it clicks through every
reachable screen and state and reports any invented name still
reaching the glass, plus any page error. It reports none.

---

## 1. What is on screen, and where it came from

Nothing on any screen is invented. Every figure below is traceable to
a file in this repository.

| On screen | Where it came from |
| --- | --- |
| 62 sheets · 340,489 cells · 244,864 formulas · 29 findings · 80s | `real-h7.json` — the engine over `h7_pcm_v2-11_final_determination.xlsm` |
| 10 material / 14 significant / 5 observation | the same run, tiers 1/2/3 |
| Every finding sentence and every cell reference | the same run — the row's own label and the engine's own detail |
| v2.10: 29 findings, 2 new and 2 cleared | `real-h7.json`, second run |
| 28,805 cells changed · 52,189 numbers moved · 48 of 62 sheets | `real-diff.json`, produced by `diff_versions.py` reading both files twice |
| Saved 7 March 2023 / 29 June 2022 | the workbooks' own `docProps/core.xml` |
| The folder browser: 27 files across three corpora | `real-corpus.json`, cross-referenced to `corpus-golden-master.json` |
| The refusal screen's sentences | `real-refusals.json` — the shipped reader's own words, recorded by running it |
| The second check-history row: 3 sheets, 6,750 cells, 1.1s, nothing material | `corpus-golden-master.json`, `h7_new_debt_indexation_fp.xlsx` |

The comparison numbers deserve their own line, because they are two
different measurements and the screen keeps them apart. A cell
*changed* when its formula or typed content changed. A number *moved*
when the value Excel last cached in it differs. More numbers moved
than cells changed, because one rewritten formula moves every cell
that reads it. What the screen refuses to say is which change caused
which movement — that needs a recalculation, and the recalculation
engine is not validated against this workbook.

## 2. Two defects in the export, fixed

**The project tabs sat at three different depths.** The Overview
conditional opened and never closed, which is why the Findings tab
was blank. The earlier repair closed one container too many, so
Findings, Versions and Documents rendered *outside* the scrolling
column. They painted — which is exactly what made it look fixed — but
they hung off the wrong parent and their content could no longer
scroll. The build now measures the nesting depth at each tab's
conditional and refuses to write the file if the four disagree. It
prints `tab nesting: all four at depth 4`.

**Ask accepted a question and never answered it.** The message list
renders `user`, `working`, `ask`, `run` and `verdict`. There is no
branch for `answer` at all, so every question that did not match one
of the workflow triggers was swallowed: the question posted, the
working line ran, and then the message was replaced by markup that
does not exist. The props were all computed — `shown`, `chain`,
`findings`, `rows`, `chips`, `work` — only the markup was missing. It
is now there, in the same frame the workflow answer uses.

Six buttons did nothing on click: Search chats, Share, Disconnect,
two Changes, Install and Copy link. Two of them had a destination the
design had already built and were simply not wired to it. The other
four are for things that do not exist yet and now say which, and why.
`dead.mjs` reports every visible button has a handler.

## 3. What was added

- **Documents** replaces the seven-document diagram. There are no
  documents: two versions of one workbook, an empty « papers in »
  naming what attaching one would buy, and an empty « papers out »
  saying plainly that checking a deck against a model is not built.
- **Versions** was a `{{ pjTab }} — next up` stub. It is now the
  watch: what arrived, what cleared, and every version.
- **Compare workbooks** had two drop zones and no result. It has the
  result of the comparison that was actually run.
- **Overview** gained the coverage line, « what needs you », « worth
  looking at first », the papers band and « lately », and stopped
  repeating the findings table below its own chart.
- **What could not be checked** — four honest refusals, each naming
  what would resolve it.
- **States that had never been drawn**: the engine refusing a file,
  a result with nothing material in it, an empty chat history, empty
  documents, empty deliverables, a disconnected account, and four
  « not built yet » sheets.

## 4. What is still not true, and what is still missing

Said plainly, because a build that hides its gaps is worse than one
that has them.

- **Two folder names in the browser are structural, not real.** The
  files, counts and findings are real; « CAA » and « Ofgem » are
  labels over directories in the corpus. The root crumb says « Files »
  rather than « SharePoint », because these are published regulator
  models and not anybody's tenant.
- **The account persona is still a persona.** Elena Whitmore,
  `e.whitmore@harbourline.com`, connected 14 July. A workspace needs
  an account holder, and inventing one is less misleading than
  putting the founder's own name on a demo. It is the only invented
  identity left.
- **No wholly clean model exists to show.** The engine has never
  returned zero findings on a real regulator model — the quietest of
  the 27 is two. So the « clean » result screen shows what was
  actually found on that file: nothing material, and two numbers
  typed inside formulas. The word « clean » is not used.
- **Still undrawn**: a model still checking inside a project, an
  upload that failed part-way, permission denied, offline, and a
  finding whose cell no longer exists in the current version. None
  has a real event behind it in this build.
- **Two reader messages leak Python exception names.** Handed a file
  named `.xlsx` that is not a workbook, `ingest.py` returns « this
  workbook could not be opened (BadZipFile) ». A zip that is not an
  Office package returns « (KeyError) ». Both are in
  `real-refusals.json` and both are kept off the screen. This is a
  defect in the engine, not the design, and it is worth a fix.
- **A finding's figure has no unit.** The row for a sum that skips
  the cell above it used to read « worth 0.9182 », which in a model
  denominated in millions is nine hundred thousand pounds. The amount
  now stays in the detail, where the engine's own words carry it. It
  belongs back on the row the day a finding carries `figure_unit`.
- **The wordmark still says Ances**, as the founder asked. Copy that
  referred to the product in the third person has been rewritten to
  avoid the name entirely, so a rename touches the wordmark and
  little else.
- **Dead data left in place**: `hallProjects`, `ovTodo`,
  `ovActivity`, `recent`, `dealDocs`, `dealSources`, `LOCKER`,
  `DECK`, `DEAL_CHAT` and the deck-versus-model run script are
  computed and rendered nowhere. They carry old names but never reach
  a screen, and removing them risks breaking something that does.
  They are worth deleting in the design tool rather than here.

## 5. The files

```
docs/pierce/workspace/
  build.py            extract the page, apply the edits, check the nesting, re-embed
  edits.py            every edit, named, with why it exists; ALL is the ordered list
  screens.py          new markup, in the founder's own tokens
  diff_versions.py    the cell-by-cell comparison of two workbooks
  shots.mjs           photograph every screen
  sweep.mjs           walk 23 screens and states; report invented names and errors
  real-h7.json        both engine runs over the H7 model
  real-diff.json      the v2.10 → v2.11 comparison
  real-corpus.json    the 27 workbooks the engine has read
  real-refusals.json  the reader's own words when it refuses a file
  real-audit.json     the earlier run over the founder's uploaded model
```

One rule about the format, learned the hard way: when the page JSON
is re-embedded, `</` must be escaped as `<\u002F`. A literal
`</script>` inside the JSON closes the tag the JSON lives in and
truncates the file.
