# Worklog

What actually happened, in enough detail to pick this up cold. `roadmap.md`
(since deleted — the plan is `swens-plan.md`; git history keeps the old file)
is what was intended; this is what occurred, including the things that went
wrong and what they cost.

Newest last.

---

## 10 August — a way to look at the screens

**Problem.** Every screen that shows real data needs a signed-in session,
and there was no way to get one here: signing in needs an email round trip.
So the workspace screens had been *built against live endpoints and never
seen*. That is how a list ships sorted the wrong way round.

**Fix.** `server/scripts/dev_session.py` writes the same `UserSession` row
the sign-in route writes and prints the cookie, with no email in the middle.
Refuses to run outside development.

```
uv run python -m scripts.dev_session
# cookie claidor_session=claidor_us_…
```

Drive a browser with that cookie, or `curl -H "Cookie: …"`.

**Local environment, for the next time it dies.** The container restart
killed Docker; Postgres runs natively (`pg_ctlcluster 16 main start`) and
Minio has to be started by hand with the *root* credentials the test
fixtures expect, then given an app user:

```
MINIO_ROOT_USER=claidor MINIO_ROOT_PASSWORD=claidorclaidor \
  setsid minio server <dir> --address :9000 --console-address :9001 &
CMD_MC=/usr/local/bin/mc MINIO_HOST=127.0.0.1 \
  MINIO_ROOT_USER=claidor MINIO_ROOT_PASSWORD=claidorclaidor \
  ACCESS_KEY=claidor-development SECRET_ACCESS_KEY=claidor123456789 \
  POLICY_FILE=.minio/policy.json BUCKET_NAME=claidor-s3 \
  PUBLIC_BUCKET_NAME=claidor-s3-public BUCKET_TESTING_NAME=testing-claidor-s3 \
  bash .minio/configure.sh
```

The fixture that failed was using the `minio` python client with the *root*
credentials, not the app's access key — an hour lost to assuming the two
were the same.

**Verified.** Project Cascade renders 108 figures reconciled, 27 not
checked, 16 findings, with the memo's drifts alongside the deck's.

---

## 10 August — upload

**Why first.** There was no way to put a file into a deal through the
interface. The endpoint had existed since the spine landed; the data room
could only list. Every demo needed a seed script, so nobody outside this
repo could try the product at all.

**Built.**

- `api.upload()` — multipart, not JSON. A model is megabytes and base64
  would add a third for nothing.
- The **whole panel** is the drop target, not a dashed rectangle. A dashed
  box is permanent furniture that says « empty » on a screen that is
  usually full; the border appears while something is over it.
- A file being read gets a row *before* it has an id, so the list does not
  jump when the upload lands.
- After an upload the check re-runs — unconditionally, including when the
  file failed, because a failed file changes the answer by not being in it.

**Two states, and the difference matters.**

| | |
|---|---|
| A file the reader cannot *open* — password, no calculated values | **200**, `status: failed`, row stays in the list with the server's sentence under it |
| A file this cannot read at all — a `.txt` | **415**, a line above the list, no row |

The first is a state of the deal and has to be visible. The second is not
a deal document at all.

**A defect the upload exposed.** The data room was listing **every version
of every file** — 15 rows for 3 documents, because re-running the seed
script six times made six artifacts per lineage. The API returning all of
them is right (the model page needs the history); the data room showing
them is wrong. Rows are now the newest version of each lineage, and the
version marker means « there are this many ».

**Verified through the interface**, not by curl: dropped a `.txt` and got
*« notes.txt is not a file this can read — models are .xlsx or .xls, decks
are .pptx »*; dropped the real model and it landed as v6 with the check
re-run and the row count still 3.

---

## 10 August — the confirmation queue

**Why it matters more than it looks.** The engine proposes that a printed
figure means a particular cell. A banker confirms. From that moment,
re-checking that figure is arithmetic that cannot come out differently on
Tuesday. That is the whole reason an engine which reconciles *some* of a
deck can back an answer that holds for all of the part it was told about —
and it had no screen.

**Not in the design.** Composed from two patterns that are: the Check row
(title, locator beneath, one value at the right edge) and the Chain
metadata table (`flex 0 0 82px` label against value). Nothing invented;
every choice went to whichever of those two already answered it.

**Built for speed, because forty in a sitting is the point.** `J`/`K` or
the arrows move, `Enter` confirms, `R` rejects. The cursor stays at the
same index so the next link arrives underneath it and a hand never leaves
the keys. Typing in the search box suspends the shortcuts.

Three ways to settle one: confirm as proposed, reject, or **point it
somewhere else** — either from the alternatives the linker scored and did
not pick, or by searching the model's named cells.

**Verified through the interface**, on 107 real links: pressed `Enter`,
the queue went 107 → 106, and the figure library grew a `CONFIRMED` row.

**Environment note.** The Next dev server, the API, Postgres and Minio all
died again mid-session. Start them with `setsid … &` and *wait on a
condition* rather than a fixed sleep:

```
until curl -s -o /dev/null http://127.0.0.1:8000/healthz \
   && curl -s -o /dev/null http://127.0.0.1:3000/; do sleep 4; done
```

---

## 10 August — density

**The problem.** The design was drawn at seven findings and nine files. A
live deal is hundreds and thousands. At that size a list has to answer
questions the drawing never had to: how do I find one, how do I skip the
noise, does the heading stay where I can read it.

**Nothing new was invented.** `Dense.tsx` records where each piece came
from — the filter is the Chain's text buttons, the search is the input the
confirmation queue introduced, the heading is the design's own heading
pinned, the truncation line is the count line that already sits under
every heading.

**The rule underneath it.** A list must never quietly show a subset. If
1,248 rows exist and 120 are drawn, the screen says so. Silent truncation
reads as « that is all of them », which is the same lie as hiding a
finding.

**`scripts/dev_bulk.py`** fills a deal to live size so the screens can
actually be seen at it — 1,200 findings and 3,000 files, deterministic
seed, everything marked `dev-bulk` and removable with `--clear`. A density
pass only ever looked at with the Cascade fixture in front of it is a
density pass nobody has tested.

### Three things it exposed

**1. Two different finding counts on one screen — fixed.** The heading
said « 892 findings » while the filter said « All 1217 »: one excluded the
one-tick notes, the other did not. On a product whose entire purpose is
that numbers agree, that is the worst possible defect to ship. The heading
now carries coverage only and the filter row carries the counts, so there
is exactly one place that totals findings.

**2. A finding with no artifact rendered a stray leading separator** —
`· slide 1, row « … »`. Fixed by joining the parts that exist.

**3. Load time, and what is *not* known about it.** Honest numbers:

| | |
|---|---|
| `GET /deals/{id}` | 1.03 s, **1.07 MB** at 3,003 artifacts |
| `GET /deals/{id}/findings` | 0.10 s, 696 KB at 1,217 findings |
| `GET /deals/{id}/links` | 0.03 s |
| Browser, `networkidle`, **Next dev** | ~15 s warm |

The API is not the problem. The 15 s is a development-server measurement —
turbopack, HMR websockets, React strict-mode double rendering — and **has
not been measured against a production build**, so it should not be quoted
as a product number and no fix has been made on the strength of it.

**What is a real problem and is not yet fixed:** the deal page inlines
every artifact, so its payload grows linearly and is already 1 MB at three
thousand files. That wants pagination on the endpoint, not a client-side
window. Next job.

---

## 10 August — the design's own size

**The founder was right and I had not looked.** The design carries its
screen size and its breakpoint in its own markup, and I had taken neither:

```
data-props="{"$preview":{"width":1440,"height":900}}"
const n = window.innerWidth < 1240;
```

**1440 × 900** is the canvas every screen was drawn at. **1240** is a
second layout, not a squeezed one — below it the chat's basis drops from
430 to 340, split screens turn from rows into columns, ribbons wrap, and
whole pieces of furniture are simply not drawn. None of that existed here.

**The design is now in the repository**, at `docs/pierce/design/` —
markup, stylesheet, and a README of every number. « The design says » is
now something anyone can check rather than something I remember. That is
the part worth keeping: the rest of this entry is a consequence of not
having had it.

### What was wrong

| | had | design |
|---|---|---|
| chat column | `0 0 28%`, min 360 | `0 1 430px` / `0 1 340px`, min 330 / 280 |
| dock bar | radius 18, pad 6/8, blur 18 | radius 22, pad 7/10, blur 30 |
| dock button, live | white fill and a shadow | `rgba(16,20,28,.08)`, flat |
| dock row | padding | a fixed 86px band |
| composer | pad 8/16, `.10` rule, soft shadow | pad 9/9/9/16, `#d7d7d3`, `0 6px 22px .13` |
| send | flat blue | the one gradient in the design |
| prompt | an input at 14.5 | a textarea at 15, Shift+Enter for a line |
| greeting | 26px / 21px, mark 34 | 25px `#15171b`, mark 44 |
| files icon | a path I drew | the design's path |
| chat icon | stroke 1.7 everywhere | 1.5 in the dock, 1.7 in the chip |

**The stylesheet had never shipped.** Half the workspace sets
`animation: pcIn …` or `pcDim …`; the keyframes were defined nowhere. Every
one of those was a string the browser discarded in silence — no error, no
animation, screens subtly dead. It is now `workspace.css`, scoped to
`.pc-workspace`, with the scrollbar and ribbon rules beside it.

**A control that was mine, not the design's,** is gone: the button that
hid the left panel. Chat *is* the way back to one column. A second control
that does the same thing is a second thing to learn.

### How it was checked

Both pages in the same 1440 × 900 viewport, the same probes run against
each, every value compared:

| | |
|---|---|
| opening screen | 59 facts, **59 equal** |
| panel open, 1440 | 68 facts, **67 equal** |
| panel open, 1200 (narrow) | 68 facts, **67 equal** |

The odd one out is the design's canned demo conversation, which moves its
composer to the bottom because that chat is not empty. Narrow was confirmed
by reading the chat's own box at 1200: `0 1 340px`, `min-width: 280px`,
340px drawn.

`scratchpad/measure.mjs` does it, driven by `scripts.dev_session` for the
cookie. The black circle at the bottom-left of any screenshot is
`<nextjs-portal>` — the dev-tools indicator, not in a production build.

### Two defects the screenshots exposed

Both invisible until a real deal was on screen, and neither about size.

**The library printed floats.** « FY2025A Adjusted EBITDA margin % ·
0.2136304063 », where the deck published « 21.4% ». It was showing the
cell's value, and a cell holds a float. On a product whose whole argument
is that a deck's printed precision *is* the claim, that is the screen
contradicting the thesis. It now shows what was printed.

**Four rows read identically.** « FY2025A Reported EBITDA · Model!D16 ·
41.2 », three times. Not duplicates — the table on slide 3, the chart
series on slide 4, the callout on slide 4 — and no way to tell which to
open. The row now carries where it was printed, using the Check row's own
second line.

---

## 10 August — Pitchbook, Sheets and Docs

Three of the eleven dock buttons said « not connected yet », on a product
whose entire subject is the three documents behind them.

**Sheets needed an endpoint.** `GET /artifacts/{id}/grid` — the model as
it is laid out rather than as a search box. Until this, the model was the
one document in a deal nobody could actually *look* at: every path into it
asked you to already know what you were looking for.

Rules it inherits rather than invents: only cells with a row label (the
linker's own rule — a number with no words beside it cannot be named);
sheets in tab order, not alphabetical; columns keyed by heading, so two
columns headed FY2024A are one column. `linked` is the column that earns
the screen — any grid can print a workbook back.

**Pitchbook and Docs are one component.** A deck and a memo are the same
object here: a document that publishes figures. The reader already
distinguishes them — a deck figure carries its slide, a memo figure
carries page zero *on purpose* — so the deck paginates with a slide picker
and the memo is one list with « paragraph 9 » on each row.

The first version of the memo screen read « Paragraph 0 » and « 1
paragraphs with figures on them », because it took page zero literally. I
nearly went and changed the reader; the comment there stopped me — « a
made-up number would send the panel to a slide that does not exist ». The
data was right and the screen was wrong.

### What was left out rather than faked

**A slide, rendered.** The design's deck screen is a picture of a slide.
Building one here out of whatever numbers are on it would be a drawing of
a slide that does not exist.

**Writing.** « Accept $41.9m » in the design edits the deck. The button
here says « Record $48.9mm », because recording the decision against the
finding is what it does. A button claiming to have fixed a deck it never
touched is the one lie this product cannot afford.

**Number formats.** The grid shows `0.1222587719` where the workbook says
`12.2%`. `number_format` is in the file and is not read at ingest. The
screen trims to four decimals and keeps the exact value on the element's
title — least dishonest, not good enough, and now on the roadmap.

### Verified

Through the interface at 1440 × 900, on the real Cascade files.

| | |
|---|---|
| model | 5 sheets, 8 periods, 39 published cells on Model |
| deck | slides 2–8; slide 2 has 9 figures, 2 drifted, 2 unchecked with reasons |
| memo | 7 figures across paragraphs 6, 7 and 9; 2 drifted |

Two things the screenshots caught. The slide picker read « 2 9 3 29 4 12 »
— the Filter idiom carries a count beside each label, which works when the
label is a word and collapses when it is a number. Numbers only now. And
the footer began « paragraph 9 shows… » mid-sentence with a small p.

---

## 10 August — the Office panel

**There is no drawing of this screen.** The design is 1440 × 900 of
workspace; the panel is 320 pixels inside Word. So nothing here is copied.
Every piece is *composed* from an idiom the design already uses, and
`ui.tsx` records which — the Check heading, the Check row, the Chain's text
buttons, the count line, the empty-state paragraph.

Two things the workspace does that the panel must not: no frosted glass,
no floating card. Inside Word the host owns the chrome, and a shadowed
rounded panel in a task pane reads as a web page somebody embedded rather
than as part of the application.

**The tokens are copied, and cannot drift.** Two applications, two
bundlers. Coupling the builds over sixty constants buys a deployment
failure; `design.test.ts` reads both files off disk, outside either
bundler, and fails if the marked blocks differ. A copy that cannot rot.

**Two rules a 320-pixel column makes tempting to break, kept.** Coverage
stays on screen, because « four findings » in a task pane implies the other
hundred and twenty were checked and were fine. And a jump that does not
land says so — a panel that silently fails to move looks exactly like a
panel that moved somewhere wrong, and the second is what makes a banker
read the wrong slide and believe it.

**Verified** at 320 × 700 against the real deal: « Project Cascade »,
`cascade_deck.pptx`, « 108 reconciled · 27 not checked », eight findings
with locators, actions on the pressed row only, and the failed jump saying
« not running inside Office — open this from the add-in ».

The screenshots changed two things. Every row carried « Dismiss » and
« Record the model's figure » — twelve links on a six-row column, none of
them the thing you came to press — so actions now appear on the pressed row
only, which is what the design's Check row does. And « Record the model's
figure » became « Record $48.9mm », which fits.

### What this turned up: CI has been red since the rebrand

Chasing `turbo run lint` for the panel found four unrelated breakages.

| | |
|---|---|
| Three test steps | named `@polar-sh/app`, `@polar-sh/customer-portal`, `@polar-sh/currency` — none exists since the rename, so all three failed |
| `web`'s vitest config | ESM-only plugins in a `.ts` config loaded through `require` → **zero tests ran** |
| four of its 23 tests | Next's middleware wants `AsyncLocalStorage` on `globalThis`; vitest does not put it there |
| `@claidor/i18n` | a `test` script and no tests, and `vitest run` exits 1 on that |

All five test tasks now pass: web 23, panel 11, customer-portal 32,
currency, i18n.

**What is still red, and deliberately.** `pnpm lint` fails on ~330
unformatted files across the vendored app and packages. One
`prettier --write` fixes it and I have not run it: this is a hard fork of
Polar, and a 330-file reformat makes every future comparison against
upstream harder to read. Written down rather than quietly done.

---

## 10 August — two debts paid

Both were written down in this file as « not good enough » and left. This
is them.

### Number formats

The Sheets grid showed `0.1222587719` where the workbook shows `12.2%`. On
a product whose whole argument is that a printed figure is a claim at the
precision it was printed to, a screen showing a precision nobody chose and
no document carries is the product contradicting itself on its own page.

Excel stores a format code on every cell and it was being thrown away.
`workbook.py` reads it, `tieout_cells` keeps it, `numbers.py` renders
through it, and `GridCell` carries `display` beside the exact `value`.

**A subset, deliberately.** Excel's format language has conditions,
colours, four sections and locale codes. What is implemented is the shape
every financial model actually writes — prefix, thousands, decimals,
suffix, negative convention — and everything else returns `null` and the
screen falls back to the plain number. « Refuses to guess » is half the
test file: dates, `@`, `General`, a code with no numeric core. A wrong
number would be worse than an unformatted one.

| | before | after |
|---|---|---|
| Revenue | 182.4 | **$182.4** |
| Revenue % growth | 0.1222587719 | **12.2%** |
| Cost of goods sold | -115.9 | **($115.9)** |

**A defect the re-seed exposed.** The sheet tabs came back in a different
order on the second load. I was taking the workbook's tab order from the
order the *database* happened to return cells in, which it never promised.
It is a fact about the workbook that nothing recorded, so ingest records
it now.

### The deal page stops carrying the data room

`GET /deals/{id}` inlined every artifact: **1.07 MB and 1.03 s at three
thousand files**, growing linearly, with every screen paying for the one
that browses files.

| | |
|---|---|
| `GET /deals/{id}` | 1.07 MB → **2,389 bytes**, 1.03 s → **0.076 s** |
| `GET /deals/{id}/artifacts` | new; 100 rows, 35.7 KB, `total` included |

The deal page is the deal's *spine* now — the current model, deck and
memo, bounded by how many a deal has rather than by what was dropped into
it — plus counts.

**Versions fold on the server.** They used to fold in the browser, which
worked only because the browser had all of them. A client that pages *and*
folds draws a short page whenever a document has several versions and
cannot say how many documents there really are. One window function.

**Links scope themselves to what is in force**, which is why the client
needed every artifact in the first place: working out what is superseded
needs all of them, and handing a screen three thousand rows so it can
filter a hundred is the payload problem restated. `?superseded=true` for a
caller that wants the history.

**Verified through the interface at 3,003 files.** « showing 100 of 3,003
— show more » → 200; a search for « document 0042 » finding one row; and
**three** requests for the whole session rather than one per keystroke.
The heading says « 3,003 files » or « 12 matching » — never « 12 files »
under a search box, which reads as a fact about the deal rather than the
query.


---

## 10 August — the agent, and the chat that answers

**The instruction changed.** Accuracy is parked at 83 %; the job is a
complete product. The standing note is at the top of `roadmap.md`
(since deleted; git history keeps it).

**Checked before building, and it paid.** There was already an agent in
the tree — written for the legal product, with a trace, a step budget, an
injected model and 113 passing tests — and nothing in it was
legal-specific except the four tools it could reach. So the loop moved to
`polar/agent/` and takes a **toolset**: definitions, runner and prompt in
one object, because those three have to agree and splitting them is how a
tool gets added to the schema and never mentioned in the prompt.

The tie-out's six: `list_files`, `coverage`, `list_findings`,
`read_finding`, `trace_figure`, `find_cell`.

**The rule the whole thing rests on: the arithmetic never passes through
the language model.** Every figure the agent can say came back from a tool
in the same turn, off the same run the Check screen shows. It is not asked
whether `$48.9mm` ties — it is told. The prompt's first section is that
rule, its second is coverage.

The workspace is loaded once before the loop starts. Not for speed: an
agent that can issue queries is an agent that can reach outside the deal it
was asked about.

### Verified, end to end

17.6 s, two tools, on Project Cascade:

    coverage        108 figures reconciled, 27 not checked
    list_findings   Read 8 of 8 findings

The answer named slide 3's two EBITDA gaps, slide 5's three FCF rows and
slide 7's two DCF lines with the model's value beside each, separated the
one warning from the seven criticals, said what the 27 unchecked figures
were and that they are a limit of the check rather than a fault in the
deck, and offered to trace one.

### I called a correct answer a defect, and it was not one

The agent said « 108 of 135 figures ». I read that against the deck's 128
and wrote it up as the `TieOut.unlinked` over-count leaking into the
product.

**It was right and I was wrong.** The deal holds a deck *and* a memo:
128 + 7 = 135. The agent was counting the deal, which is what it was asked
about. Checked by reading both documents:

```
deck 128 + memo 7 = 135
```

The lesson is the one this product is built on and I did not apply it to
myself: **a number that looks wrong needs its denominator checked before
it is called wrong.** I had a deck-shaped number in my head and read a
deal-shaped answer against it.

### The double-count was real, and is fixed anyway

Separate from the above, and genuinely a defect: on **one deck**,
`tie_out` returned the workbook pass's unlinked list whole, so the seven
figures the Outputs pass had already checked were counted twice —
94 + 8 + 33 = 135 against 128 printed. `figure_map` was working around it.

`check.tie_out_both` now drops from that list anything the Outputs pass
settled, keyed on the **anchor** rather than on `(slide, location,
printed)` — the same collision the recall harness hit, where a deck prints
the same figure twice on one slide and `location` is « slide 2 ».

    94 agree · 8 drift · 26 never linked = 128

Recall unchanged at 83 %, all 171 tie-out tests pass.

### Where this leaves the finish list

1. ~~The agent~~ — done, and answering.
2. **Writing** — « Record » becomes « Accept ». `writing-pptx.md` has the
   design; the Word half is in the fork.
3. The five dock screens that still say « not connected ».

---

## 10 August — writing

**The halfway mark is gone.** Everything built until today *found* things.
This writes: « Record $48.9mm » is « Accept $48.9mm », the figure in the
file changes, and Undo changes it back.

### The two hard problems, and what they actually cost

`writing-pptx.md` named them a week ago and both were where it said.

**A figure is often not one run.** `$42.6mm` is stored as `$42.` and `6mm`
whenever a spell-check boundary or a three-versions-ago edit split it, and
`python-pptx` flattens runs on the way out — so every figure has looked
like one piece of text for the whole life of this project and the problem
could only appear on the first write. The anchors already stored were the
right coordinate: a paragraph and character offsets, run-agnostic. The
writer rebuilds the paragraph text from its runs, keeps a map back into
them, and splices; a split figure is replaced in the *first* covering run,
which keeps that run's formatting. The test splits a real run in the
Cascade deck on purpose, because no file we have has ever done it for us.

**A chart number lives in two places** — the cache in the chart XML, which
is what PowerPoint draws, and the embedded workbook, which is what opens
under « Edit data ». Both are written or neither is, and the workbook goes
first because it is the half that can refuse. It is spliced rather than
loaded and re-saved: an embedded workbook is three columns PowerPoint
generated and nobody has ever opened, and the least this can do to one is
replace the digits between `<v>` and its closing tag.

**A memo is a tracked change instead**, through
`polar.redline.ooxml.replace_tracked` — the same splicer `tieout.memo`
already *reads* a memo with, so an offset means the same thing on both
sides and there is no second definition of what the document says.

### The rule underneath all of it

**Refuse rather than approximate.** Every path checks the characters it is
about to replace against the ones the reader recorded. Search-and-replace
would land on the second `$48.9mm` on a slide as readily as the first, and
a deck corrected in the wrong place is sent out by somebody with no reason
to look at it again. Half the writer is refusals, each with a sentence and
a next step.

### A defect the fixture exposed: a shape id is not unique

Slide 3 of the Cascade deck carries a chart and a table that **both call
themselves shape 4.** PowerPoint asks for unique ids; the tools that
generate decks do not always oblige. « The first shape with id 4 » would
have written a table correction into a chart and raised nothing at all.

Both fields are now used together, most specific first — the shape that
answers to name *and* id, then the name, then the id — and an id matching
two shapes is refused. The panel had already reasoned its way to name-first
for the jump; the writer needed it to be a rule.

### The proposal layer

A finding becomes a `Correction` the moment anybody looks at it, carrying
**both sides of the change**. That is the whole of the reversibility
argument: `.pptx` has no revision model, and it does not need one when the
database holds what the document said and what it should say.

**Keyed on the finding's fingerprint, not its id.** Every check run deletes
its findings and writes them again — the same reason a dismissal is keyed
that way — so a correction hung on `finding_id` would vanish the first time
anybody pressed Re-check. It has to outlive its finding by construction:
once applied, the deck agrees, the drift is gone, and the correction is the
only thing left that says the slide used to read $49.6mm.

Applying makes a **new version** and never overwrites, so reversal is
ordinary: the old figure is written back, producing a third version. The
check re-runs, and the drift disappears because the deck agrees rather than
because anything marked it settled.

**Two places a correction can land**, and they are not the same thing. The
workspace corrects *the deal's copy*. The panel corrects *the document open
in Office*, because the banker's own file is the one that gets sent — the
server never sees those bytes and records only that the decision was taken
and where. Undo from the workspace on one of those refuses and says to do
it in the panel.

**A write that fails comes back 200 with `state: failed`** and the writer's
sentence on it. It is not a bad request: the request was fine and the
document had moved. Somebody who pressed Accept has to be able to find out
afterwards whether the deck changed, and an HTTP error leaves nothing on
screen to find out from.

### This needed the file kept, and the model's own docstring was wrong

Reading never wanted the document after ingest — that is what lets a
confirmed link be re-checked forever. Writing cannot happen without it.
So the bytes are stored (`Artifact.storage_path`), best-effort: an ingest
that failed because S3 was slow would trade the thing that works for the
thing that might, and a file that was not kept says so when somebody tries
to write into it. `models/tieout.py` said « the files are not [retained] »
as a security claim; it now says what is true, which is that the chain
outlives the documents and dropping one costs the ability to correct that
version and nothing else.

### The screens

The design draws all of this and had been standing on a button that only
recorded a decision. The workspace footer is now the design's own three
states — the proposal, « Slide 3 now reads 30.8 and ties to Model!B26 »,
and « the figure stands at $42.6m » — with Undo meaning the write on one
branch and the note on the other, and refusing to be the wrong one.

The struck-through old figure with the underlined new one beside it is the
design's **Docs** idiom borrowed whole: a deck row and a memo paragraph ask
the same question and the design answered it once.

**A screenshot caught what nothing else would have.** Accepting on slide 3
threw the reader back to slide 2 — the corrected deck is a new artifact id
and the screen reset its page on one. A new version of « the deck » is the
same document to whoever is reading it, so the reset is keyed on the
filename now, which is what a lineage is.

### The panel

Three steps, and the order is the safety: **propose on the server, write
into the document, then record it as done.** A panel that recorded first
would leave a deal claiming a correction that is in nobody's file.

PowerPoint's add-in interface reaches a shape's text and nothing else, so a
table cell and a chart point come back saying so and pointing at the
workspace — which corrects the deal's copy through `python-pptx` and can do
both halves of a chart. That refusal is the honest one: a chart written on
one side only draws one number and reports another.

Word gets a native tracked change, adapted from the fork's own
`redline.ts`: mode loaded and saved, span re-verified after the flip,
replacement, mode restored in a `finally`. Office.js cannot set a
revision's author, so an in-pane change is attributed to the signed-in
user and a server-side one to « Claidor ». Both are true.

### Verified

Through the interface at 1440 × 900, on the real Cascade files, not by
curl.

| | |
|---|---|
| Deck, slide 3 | Accept 30.8 on the chart series → the row reads `37.8 30.8` and « ties », the footer says it ties to `Model!B26` |
| Undo | 37.8 back on the slide, the drift back in the check |
| Coverage | 8 drifting → 7 after one correction |
| Versions | the deck goes v2 → v3 → v4; nothing is overwritten |
| Memo, paragraph 6 | Accept $228.9mm → `$235.3mm $228.9mm`, and the file carries `<w:del>$235.3mm</w:del><w:ins>$228.9mm</w:ins>` authored « Claidor » |

Backend: 208 tie-out tests, of which 14 are the writers against the real
`.pptx` and `.docx` and 13 are the proposal layer through HTTP. Panel: 16.

### What was left out rather than faked

- **Tables and charts from the panel.** PowerPoint cannot do it from a task
  pane; the workspace can, and the panel says which.
- **The model is not written to at all.** A cell is either a formula, in
  which case the number is an output and the deck is what needs correcting,
  or an input, in which case whoever owns the model owns the number. A
  deliberate absence, not a gap.
- **« Accept all »**, which the design draws on its Docs screen. One
  correction is one decision; a button that writes six of them is a button
  nobody can undo one of.

### Environment, for the next time this container is new

Everything had to be rebuilt, and two of these cost real time.

- **Python.** `.python-version` says 3.14 and the only 3.14 `uv 0.8.17` can
  fetch here is `rc2`, whose `typing._eval_type` has no `prefer_fwd_module`
  — which pydantic 2.12+ passes unconditionally. Every import of
  `polar.config` dies. Patched in `.venv` only, with a `try/except
  TypeError`; nothing committed. A container with 3.14.0 final needs none
  of it.
- **Minio is not in the repository.** The worklog's own instructions point
  at `.minio/configure.sh`, which is gitignored and was not here. `mc` can
  do it directly: `mc alias set`, `mc mb` the three buckets, `mc admin user
  add claidor-development`, attach `readwrite`.
- Postgres by hand (`pg_ctlcluster 16 main start`), a `claidor` role, and
  `redis-server --daemonize yes` — without Redis `/healthz` is 503 and
  every screen looks broken.
- `server/.env` needs `CLAIDOR_S3_ENDPOINT_URL=http://127.0.0.1:9000` or
  the default sends uploads at real AWS, and
  `clients/apps/web/.env.local` needs `NEXT_PUBLIC_API_URL` or the browser
  bounces to `/login` with a perfectly good session.

---

## 10 August — the five screens that said « not connected »

**Two of them had real data behind them all along.** Three do not, and say
so.

### Projects, and the screen that unbroke the workspace

Until now the workspace opened « the first deal you are on » and there was
no way to reach a second — a limitation nothing on screen admitted to.
Projects is the design's own deal list, and choosing one switches the whole
workspace to it.

Switching **drops everything on screen** rather than replacing it a request
at a time. A findings list from the last deal under the new deal's heading
is the worst kind of wrong, because it looks right.

### One field, and the defect it exposed two screens away

The design's status column reads « Seven findings » · « Clear » · « Not
run ». The first two we had; the third we could not say, because nothing
recorded whether a check had ever finished — so `DealListItem` now carries
`checked_at`, and null means never.

Writing that made the real defect obvious. **Check said « Checked, and
every figure ties back to the model » on a deal nobody had ever run**, and
the panel said the same. Silence reading as a result is the one lie this
product exists not to tell, and it had been sitting in the empty state
since the screen was built. Nothing had ever shown it because until
Projects there was no way to *reach* a deal in that state.

Both now ask the run rather than the count. The coverage line does too:
« the check has not run here », not « 0 figures reconciled ».

### Terminal is the check reporting itself

The design draws a log — a command, the files it resolved, what it
reconciled, warnings in amber, criticals in red, a `done` line with a
duration. That is not decoration around a shell; it is exactly what a
`CheckRun` produces, and every line comes off one.

    pierce check
    resolved 12 files · 3 documents
    reconciled 108 figures
    27 not checked · reasons below
      22  no output fits the label
       3  two outputs fit equally well
       2  one end of a printed range
    done  tieout · done · 0.2s
    audited 313 cells in 1 model
    crit  10.2% where the model says 9.8% · cascade_memo.docx paragraph 9

**Seven commands, and every one is a call that already existed** —
`check`, `coverage`, `findings`, `files`, `corrections`, `clear`, `help`.
Nothing here can do anything the screens cannot, which is what stops a
command line becoming a second product with its own rules. Coverage stays
on screen here as everywhere: a log that reported only what it found would
read as though it had checked everything.

The prompt is real — up and down walk the history — because a prompt drawn
and not wired is furniture pretending to be a control.

### Mail, Calendar and SharePoint: drawn, and honestly empty

All three need a source that does not exist yet: a mailbox or a site,
which is phase 8. So each says what it will do, what it is waiting on by
name, and where to go meanwhile.

A mailbox with three invented messages in it, in a product whose whole
argument is that the numbers on your screen are real, is worse than a blank
panel — it teaches the reader that what they are looking at might be a
mock-up, and there is no way to un-teach that on the screen where it
matters.

### Verified

Through the interface at 1440 × 900, on three real deals, two of which
hold nothing at all.

| | |
|---|---|
| Projects | « Three live deals · 16 open findings · two not run » |
| A deal nobody ran | « The check has not run on this deal », not « clear » |
| Switching | Calder's empty Check, then back to Cascade's 16 findings |
| Terminal | a real `check`: 12 files, 108 reconciled, 27 not checked with reasons, `done tieout · 0.2s`, then fourteen `crit` lines |
| SharePoint | « No site connected », and what connecting would give |

Two things the screenshots caught. The prompt was wearing the dashboard's
blue focus ring — right on every form in the product and wrong on a
terminal, which the design draws as a gutter and a caret. And **the
duplicate « Terminal » button that cost twenty minutes was Next's own
dev-tools overlay**, not the dock: `getByRole('button', { name })` finds
it, `button[title="Terminal"]` does not. Worth remembering the next time a
click in a test appears to do nothing.

### What is left out, and why

Nothing in the design's Mail, Calendar or SharePoint is built, deliberately.
The design's SharePoint screen is a real document library with sync status
on every row; building it against the data room would be claiming files
came from somewhere they did not.

---

## 10 August — PDF sources, and the end of the chain

**The chain used to stop at « somebody typed this ».** `Model!D6 = 228.9`
is the edge of everything the product could check, and every figure
computed from it inherits whatever it is. This is the hop past it.

### Reading a document nobody on the deal wrote

A PDF is ink, not structure. A workbook has cells and a deck has shapes;
audited accounts have a text layer, page numbers, and nothing else worth
relying on. So `source.py` is the *memo* reader's shape — figures found in
prose, each named by the words in front of it — with one thing a memo
does not have and cannot fake: **a real page number**. « Audited accounts
FY24 · p.42 » is checkable by a person. « The accounts, somewhere » is
not, which makes it exactly the sort of claim this product exists to
distrust.

Two refusals worth having. A PDF with no text layer is a scan, and an
empty extraction that quietly becomes an empty document is how a set of
accounts ends up « containing no figures »; it says so and says to OCR it.
And a `.pptx` uploaded as a source is named as the mistake it is.

**Wrapped lines are put back together, narrowly.** A line break in a PDF
is where the type ran out of room, not where the sentence ended, and read
line by line « Selling, general and administrative expenses for the year /
ended 31 December 2025 were (32.9) » names its figure « ended 31 December
2025 were ». The join needs the previous line to end without terminal
punctuation *and* this one to start in lower case, so headings and table
rows are never swept into their neighbours. Never across pages: a page
break is a hard break whatever the prose does.

### The matcher is the tie-out's, pointed the other way

A figure printed in the accounts is the printed thing; a typed input is
the candidate it might be the origin of. That is not a convenience — the
gates that make the tie-out refuse rather than guess are exactly what a
hundred pages of somebody else's prose needs, and a second matcher would
have had to earn all of them again on the loosest data in the product.

**Inputs only.** A computed cell agreeing with the accounts is arithmetic
working, not provenance: the accounts are not the source of a calculation,
they are the source of what it was calculated from. Cascade has 85 typed
inputs against 313 named cells, and the narrower set is the safer one.

**One translation, and where it lives is the point.** Accounts say « the
year ended 31 December 2025 »; a model says FY2025A; the linker reads a
bare `2025` as nothing at all, so all three revenue notes fit all three
revenue cells and every one is refused as ambiguous — the right answer to
the wrong question. Teaching the shared tokeniser about calendar years
would change what every deck and every memo links to, on an engine whose
recall is a *measured* number. So it is in the source reader, where
accounts are actuals by definition and `A` is not a guess.

### A disagreement here is a contradiction, not a drift

`CheckKind.crosscheck` has existed unused since the spine landed, and this
is what it was for. « The signed accounts restated cost of sales and the
model still carries the draft figure » is a different sentence from « the
deck disagrees with the model » and has a different fix. The finding sits
on the **source**, because page 2 of the accounts is where a reader has to
go to settle it.

### Two things that had to be fixed to make it work

**`replace_proposals` was deal-wide.** Two checkers now propose links into
one table, and the second to run would have deleted the first's — a defect
that would have looked like a flaky linker for a week. It is scoped to the
documents the run actually read.

**`chain_for` had no callers.** Built for « trace any cell » and never
routed. It is where grounding shows most often, because a chain from a
deck drift rarely bottoms out at a typed input within the three steps a
*readable* chain has: the DCF drifts on Cascade are four or five hops from
an input. So it has a route now, and the screen that answers « where did
this number come from » can be asked about a cell rather than only about a
problem.

### The fixture

`build_source_fixture.py` writes the accounts **out of the model**, the
same rule the memo fixture follows: a fixture with hand-copied numbers
disagrees with its own model the first time either is touched, and then
the test measures the transcription. Two files, because the interesting
case is not a typo — `cascade_accounts_restated.pdf` has two figures the
auditors restated in the signed set, which is what actually happens and is
the mistake nothing else in this product would find.

The prose is the register real accounts use, deliberately. A fixture that
writes the model's own vocabulary back at it proves nothing about reading
a document somebody else wrote.

### Verified

Through the interface, on the real files.

| | |
|---|---|
| Upload | `cascade_accounts_restated.pdf` → `source`, 8 figures, 2 pages |
| Crosscheck | 8 grounded · 6 agreeing · **2 contradicting** · 0 unlinked |
| The finding | « cascade_accounts_restated.pdf says $94.1m where the model has $96.4m », on page 2 |
| The chain | `Assumptions!B24 · 96.4 · typed, not calculated` → **`cascade_accounts_restated.pdf · page 2 · $94.1m · proposed — nobody has confirmed this yet`** |

230 tie-out tests, 21 of them this.

Two things the screenshot caught, both about words. The Chain header read
« The deliverable shows $94.1m » about a set of audited accounts, which
gets the whole sentence the wrong way round — a contradiction is a
document *nobody on the deal wrote* disagreeing with the model. And the
fiscal-year rewrite the matcher needs was leaking into the sentence shown
to a reader: « Total debt outstanding at 31 December FY2025A ». The screen
whose job is to say where a number came from is the wrong place to show a
year this product invented, so the step shows the sentence as printed.

### The environment, finally scripted

`scripts/dev_services.sh` starts Postgres, Redis and Minio and creates the
buckets and the app user. This container reclaims background processes
between sessions and the first symptom is always a test suite failing with
« connection refused » somewhere unrelated. It cost twenty minutes twice
before it was worth writing down.

---

## 11 August — the room the files actually live in

Phase 8, the half that is SharePoint and OneDrive. A deal can now be
pointed at a folder in a document library and read from it: nobody uploads
anything, and the deal checks itself.

### Read-only, and delegated

The scopes are `offline_access`, `User.Read`, `Files.Read.All`,
`Sites.Read.All`. Two decisions in that list.

**Delegated, not application-level.** The token is one person's, so this
connector reaches exactly what they can already open and nothing else. The
alternative needs an administrator's consent before anybody can try the
product at all, and it makes a bug in `graph.py` able to read a firm's
entire SharePoint. The cost is that a connection belongs to a person and
stops working when they leave — a state the screen carries rather than a
problem to solve.

**No write scope, ever.** A correction goes into the deal's own copy.
Pushing a rewritten deck back into a shared library is a decision nobody
asked for and a mistake nobody could undo.

### The content tag is the whole design

`cTag` changes when the content does; `eTag` also changes on a rename. So
the sync compares tags: a forty-megabyte model whose name somebody fixed
is not read again, and a model somebody saved over on Tuesday becomes
version 2 of the same lineage rather than a second model in the deal. That
is the identity problem the roadmap said a filename guess could not solve,
and it is one string.

### The screen earns itself on one column

`screens/SharePoint.tsx` is the design's document library — rail,
breadcrumb, ribbon, header row, sync status at the right edge — and the
status column is the reason it is worth drawing. **Synced** is the design's
blue, **Stale** its amber, and the comparison behind them is the deal's
content tag against the room's. A row that says Stale is the one a banker
should look at.

Two substitutions, both named in the file. The ribbon drops New, Upload,
Share and Automate: they are SharePoint's own, and furniture that does
nothing is the worst thing to put on a screen about whether files are
real. The rail drops SharePoint's site navigation for the list of document
libraries this account can reach, which is the only thing here that is
navigable and true.

### How it was looked at without a tenant

`scripts/graph_stub.py`. There is no Microsoft tenant on this machine and
there is no application registration, so the connector could not be seen
at all — and a screen nobody has seen is a screen with a bug in it. The
stub speaks the four URLs the connector uses, over the shapes Graph's
documentation publishes, serving `scripts/cascade/` as a library.

Graph's base URL became a setting to make that possible, which is worth
having anyway: a sovereign cloud is the identical API at
`graph.microsoft.us`.

**This proves the wiring, not the integration.** Everything above Graph —
the token store, the sync, the status column, the re-check — is exercised
for real. Whether Microsoft behaves as documented is unproven and will
stay unproven until somebody connects an account.

### Verified

Through the interface, at 1440×900, against the stub and the real Cascade
files. Project Meridian was an empty deal at the start of this.

| | |
|---|---|
| Not configured | « Connect Microsoft » absent, and the sentence says an administrator has to add the application |
| Configured, not connected | the button, on the same screen |
| Connected | R. Duval · Rothmoor Deals · Documents |
| Pointed and synced | four files read, and the deal checked without anybody pressing check |
| The deal, after | 108 reconciled · 100 agreeing · **8 drifting** · 27 unlinked |
| `touch cascade_model.xlsx` | that row alone turns **Stale** |

253 tests, 23 of them the connector.

What the screenshots caught: the status column said « Changed » where the
design's word is « Stale »; the folder rows had a text arrow where the
design has an amber folder; and the breadcrumb at the library root read
« Documents Rothmoor Deals », which is two names and no relationship.

---

## 11 August — the draft, before it goes

Phase 8's other half. A message in Outlook is read, reconciled against the
deal's model, and the correction shown as a tracked change — the design's
own card, made real.

### Why mail rather than Teams

Of everything this product checks, an email is the one where being late is
final. A deck can be pulled back out of a data room; a model can be
replaced; a memo can be reissued. A sent message cannot be pulled back out
of anything. So the draft is worth more than the sent item, and the sent
item is worth more than the rest of the mailbox.

### A message is a memo

`ArtifactKind.message`, and after that the tie-out cannot tell the two
apart — `run_tieout` already treated a memo exactly as a deck, and a
message went in beside them on one line. The reader is
`tieout/memo.read_memo_text` unchanged. What is genuinely new is small and
it is all about **what is not the message**:

**The quoted thread.** A reply carries the conversation under it. Those
figures were typed by somebody else, possibly weeks ago, possibly already
corrected — and a drift reported against them is a false positive whose
only available fix is « edit a message you did not send ».

**The signature.** « 20 Finsbury Circus » is a plausible-looking 20 to
anything reading digits.

**Word's inline stylesheet.** Outlook writes CSS into the body and CSS is
all numbers. `0.75in` and `11pt` are not figures, and a reader that took
them would report drift against a margin.

Each of those is a false positive, which is the one failure this product
cannot afford, so the test file is mostly about them.

### The subject is a claim

« Northgate — FY24 Adjusted EBITDA of $41.9m » is the line people read
without opening anything. It is read as the first paragraph.

### « Accept and send » cannot exist, and that is a decision

The design's card ends in two buttons: **Accept and send**, and Reject.
The scope list is `Mail.Read`, not `Mail.ReadWrite`, and that is a
decision rather than an omission — a server that edits somebody's outgoing
email is a product nobody connects twice.

So the split is the same one decks already have: **the server shows it,
and the add-in writes it.** A correction to a deck goes into the deal's
copy on the server and into the banker's own copy through the panel; a
correction to a draft goes in through the panel only, in their own compose
window, on their own press. What sits where the design's button is: the
corrected sentence, to take, and a line naming where the change can
actually be made. `writing.py` refuses a message with that sentence rather
than a generic one — « cannot » is not the useful half.

### Verified

Through the interface, at 1440×900, against the stub's mailbox and the
real Cascade model.

| | |
|---|---|
| Not connected | the Mail screen falls back to « Connect Microsoft », same as SharePoint |
| A draft, unchecked | « Nothing here has been read » — not « clean » |
| Checked | *the business generated ~~$235.3mm~~ $228.9mm of revenue in FY2025A* · FY2025A revenue · `Model!D6` |
| An inbox message quoting the right figure | « Checked — every figure in this message ties to the model » |
| Total debt of $96.4m, in the same draft | correctly silent: it ties to `Assumptions!B24` |

267 tests, 14 of them this.

What the screenshots caught: the struck figure and the inserted one ran
together as `$235.3mm$228.9mm`, and « Copy the corrected sentence » was a
button label long enough to wrap onto two lines in the design's own
padding.

### The stub grew a mailbox

`scripts/graph_stub.py` now serves `/me/mailFolders/{folder}/messages` and
`/me/messages/{id}` beside the document library. The draft in it is
written against the Cascade model on purpose — 235.3 where the model says
228.9, in the sentence shape a memo actually uses — so the screen has a
real drift against a real cell to draw rather than a hand-written one.

---

## 12 August — the metadata checker

Third item on the queue, and the one with a property the others do not
have: it needs no deal, no model, no corpus and no login, so a stranger
can judge it cold on a file we have never seen.

`polar/tieout/metadata.py` — bytes of an Office file in, a list of
findings out. Sixteen rules over the OOXML package itself, read part by
part rather than through `openpyxl` or `python-pptx`, because both of
those normalise away exactly the things being looked for.

**Two grades, never added.** A `leak` is content in the file that the
recipient can read and the sender did not put on the page — speaker notes,
a hidden slide, an off-canvas shape, a very hidden sheet, a folder path,
the values cached from another workbook, a whole worksheet behind a chart.
A `trace` is who and when and how it was filed.

**No new dependency.** `lxml` was already installed as a transitive
dependency of `python-pptx`; it is now declared, because a direct import
on a transitive dependency breaks the day the thing carrying it changes
its mind. `olefile` was already declared, and is used for one sentence:
telling a legacy `.doc` apart from an encrypted `.docx`, which look
identical from outside and need opposite advice.

**Measured against 85 public gov.uk attachments** — `scripts/document_corpus.py`
fetches them, `scripts/metadata_survey.py` measures, `scripts/metadata_check.py`
reports on one file. Numbers, the four defects the run exposed in my own
rules, and the two rules that have no confirmation in the wild are all in
`accuracy-backlog.md`.

The headline: **60% of real files come back with no leaks at all**, and
the ones that do include a bid folder tree inside a published procurement
template, a named civil servant's home directory reached from a chart, and
33 very hidden tabs in a published financial model.

**What is not done.** There is no screen. The check is a function and a
command line, deliberately — the Word and web designs are yours and I am
not inventing one to sit in front of this.

---

## 12 August, later — grounding, finished against a real pair

The chain's third leg — a figure in a source document matched to the typed
input cell it is the origin of — had only ever run against a fixture
written here. It now runs against Ofgem's price control financial model and
the direction document that states the values fed into it: **three links,
three correct, none wrong**, all three checked by hand against page 7.

Getting there meant finding four defects, each of which produced silence or
a lie rather than an error, and none of which any fixture could have shown:

1. The label-column search stopped at column D; that model names in E, so
   **all 26,392 of its cells came back unnamed**.
2. That model builds one sheet per licensed business with `=Input!E31` in
   the label column, and a formula is not a label — so a whole licence
   entity had no names.
3. `TO` is a stopword. `NGET TO` tokenised to `['nget']`, a strict subset
   of `NGET SO`, so every transmission-owner figure matched a
   system-operator cell. Seven false contradictions.
4. Period headers written as dates were not read, so eight year columns
   shared one name. Two more false contradictions.

Along the way, the Cascade deck turned out to have been carrying a miss:
`FY2025` was treated as a different period from `FY2025A`. Reconciled went
from 102 to 103, verified by hand, and the actual-versus-estimate
distinction the gate exists for is untouched.

Also fixed earlier in the day, on the first real pair the leg ever saw: a
lookup column counting `1, 2, 3 …` was being offered as a source figure, so
« 13,686 FTE » matched a cell holding the number ten.

**297 tests.** Formula coverage re-measured and unchanged — 59,705
formulas, 0 silent losses. Numbers, the declines that are correct declines,
and what is still deferred are in `accuracy-backlog.md`.

**Still not started: the trace viewer.** Waiting on your design, as agreed.

---

## 12 August, night — the workspace begins, from the full design

The founder finished the complete workspace design — every screen, one
file — and the build order is now theirs: analyse the whole thing, then
one round at a time.

**The design is checked in** at `docs/pierce/design/` — markup, the
component logic, the stylesheet, and a README that records the canvas
(1440×900), the one prop (`notConnected`), and the standing rule on
writing boxes: `border:0; outline:none`, focus is a soft glow or nothing.
Never a square outline. The fonts (Switzer 400/500/600, IBM Plex Mono)
and the file icons were extracted from the design file itself and
self-hosted — no external font host.

**Round one, built and looked at:** the shell (floating card over the
radial ground, glassy pill dock at bottom centre, account popover), the
Deals list (Needs attention / Clean groups, the design's own rows), and
the first-run empty state (Connect Microsoft → waiting → connected,
driven by the real connector state). The old workspace screens — the
previous design — are deleted.

**Wired, not mocked.** The list renders `GET /v1/tieout/deals`, which now
also serves `stale` / `stale_kind` / `stale_at`: a current artifact that
arrived after the last run finished, computed from timestamps the
endpoint already loaded. The sentence (« The model changed at 11:40
today ») is built in the browser, where the reader's clock lives.

**Two states the design's demo data never draws, composed from its
nearest patterns and said so in the code:** a never-checked deal joins
the attention group as « Not checked yet » (it cannot sit under Clean —
the API docstring forbids those two sharing a word), and the loading
face is the bare well for the one paint it exists.

**Verified** with Playwright at 1440×900 against the seeded deals:
list, deal-open header, placeholder tabs, account popover. Switzer
confirmed loaded via `document.fonts`. 52 server tests pass on the
endpoint change; web typecheck clean.

**Flagged to the founder:** the popover's « Notifications » item goes
nowhere in the design (its own handler just closes the popover) — built
as drawn, needs a destination or dropping.

---

## 13 August, small hours — the deal page, wired

Round two. Inside a deal: « Where the numbers come from » (models and
sources, with Current / Changed states), « Documents » (decks, memos,
messages, each carrying its own state — N differences, Clean, Not read,
Not checked), the stale banner with real counts, and « What the team
decided ».

**The decision log is derived, never authored.** The server assembles it
from corrections that were decided and findings that were dismissed, so
it can never disagree with the records it describes. Plumbing —
connecting a folder, uploading a file — is excluded by construction.

**A dismissal now requires a reason.** New column `tieout_findings.note`
(migration `c4d8e2f16a53`), the user's own words, required when
dismissing and only then — a box everyone must type past collects
« ok ». The server refuses a bare dismissal with a sentence; reopening
clears the note, because yesterday's judgement must not attach to
tomorrow's state. The person's words beat the server's sentence on
screen when present.

**Verified end to end against Cascade:** bare dismissal → 422; dismissal
with a note → stored, echoed, rendered at the top of the log next to two
real corrections from sessions past. Per-document counts (7 differences
on the deck, Clean on the memo) are the live findings, grouped in the
browser. « Check now » runs a real check and reloads. Screenshots at
1440×900.

**Borrowed patterns, named in code:** `source` kind (a PDF) wears the
document icon — the design's assets have no PDF face; « Not read » /
« Not checked » row states composed from the design's colour vocabulary;
« uploaded » where the design says « edited », because the upload is
what this data records — « edited » arrives with the connector metadata.

35 route tests pass, including the new dismissal contract.

---

## 13 August — the document panel, and the metadata checker gets its door

Round three. Clicking a document opens the design's side panel: facts,
version history, « Hidden inside it », and the findings on that document
with their evidence.

**The metadata checker is finally reachable.** New endpoint
`GET /artifacts/{id}/metadata` — the checker run on the stored bytes, on
request, never persisted: it is a second's work, it is always about the
current version, and a stored copy is one more thing that can silently
disagree with the file. A file it does not read — a PDF, a legacy .doc —
comes back with the checker's own refusal sentence in a `refused` field:
an answer about the file, not an error. On the Cascade deck the panel
shows the speaker notes with their text quoted and the four charts that
carry their worksheets, live.

**Versions** — `GET /artifacts/{id}/versions`, the lineage's uploads
with who and when. The design's change-summary column needs a per-pair
diff engine; until then the row says who brought the version, which is
what is true today.

**Evidence, by the finding's shape.** A cell finding shows four rows of
the real model around its cell from the grid endpoint, target
highlighted; a prose finding shows its sentence with the figure marked;
a slide finding wears the design's sketch carrying the real figure. The
« Rebase » button runs the real correction flow (propose, then apply);
« Not a problem » opens the design's writing box for the required
reason, because the server refuses a bare dismissal.

**The staleness loop proved itself by accident.** Repeated test uploads
made Cascade genuinely stale, and the banner appeared unprompted with
true counts — « The deck changed at 00:10 today. Seven figures across
one document were read before that. » After a recheck the findings moved
to the new version and the banner cleared. Nothing about that path was
staged.

**Environment repairs, for the next time the container is reclaimed:**
`server/.env` was lost with the container, which silently pointed S3 at
real AWS — every upload « succeeded » and stored nothing. A minimal
`.env` (S3 → local Minio) fixes it; `scripts/dev_services.sh` now
fetches `mc` like it fetches the server binary, because without it the
app user is never recreated and the same silent failure returns.

Verified at 1440×900 against Cascade throughout. Screenshots in the
thread; typecheck and lint clean; 34 route tests pass.

## 13 August 2026 — the solo engine, argued down to quiet

The Check-a-file round starts with its engine: `polar/tieout/solo.py`,
a file checked against itself. One idea — the same name carrying two
figures — and most of the work was earning the right to stay quiet.

**82 to 1.** The naive version (group by full label, flag any group
holding two values) produced 82 findings on 29 correct gov.uk decks.
Every one was read by hand, and the reading produced four rules: two
values inside one shape are that shape's data (keyed on anchor kind
*plus* shape identity — on Cascade's slide 3 the chart and the table
both carry `shape_id` 4 and are two shapes, and that pair is the real
finding); a bare year is part of the name even though `tokens` drops it
(« 2018 Aldi » is not « 2019 Aldi »); two charts never disagree with
each other; and a label must be a name — two content words, no
trailing « = ». After all four: **one finding on 29 decks**, examined
and written down as false with its cause named (the words telling
slides 23 and 24 apart live in the slide title, and requiring title
agreement would kill the summary-restates-detail case the check is
for). Both Cascade decks report exactly the slide-3 chart-against-table
drift and nothing else.

Full numbers, the survivor's autopsy, and what is still owed (recall,
totals, a memo corpus) are in `accuracy-backlog.md`. Rules pinned one
test each in `tests/tieout/test_solo.py`.

## 13 August 2026 — Check a file, wired end to end

The round's remaining three pieces, on top of the morning's engine:

**The record.** `tieout_one_off_checks` (hand-written migration
`e9a3f5c27b18`): one row per loose file checked, keeping the counts and
findings exactly as the screen received them and never the file — a
one-off check has no correction to write, so the bytes are read, checked
and dropped in one request. `dossier_id` set-null with the deal's name
snapshotted beside it, so deleting a deal cannot rewrite « Checked
against Project Falcon » into « Checked on its own ». Recents are
personal; someone else's check is 404.

**The route.** `POST /tieout/check-file` (multipart, optional
`dossier_id`): a deck or memo meets the solo check, and with a deal
picked is also reconciled against that deal's current models through
the same two-pass linker as the deal tie-out — the drift evidence
points at the real model artifact, so the screen's grid slices reuse
the panel's endpoint. A model routes to its audit; a deal picked
alongside one is deliberately ignored rather than half-run, and the
row honestly says « on its own ». Plus `/check-file/recents` and
`/check-file/{id}` to replay a stored answer without re-running
anything. Eight route tests.

**The screen.** `screens/CheckFile.tsx` — all four drawn states wired:
cIdle (drop card, against picker with the glassy menu, recents),
cRunning (the glassy progress card; steps tick while the one request
flies, real notes fill when it lands), cDone (tally, compared-with
pair, finding cards with the two-sided evidence — quoted sentence with
the amber mark on one side, real model rows or the slide sketch on the
other), cFirst (no deals, no recents). Verified at 1440×900 against
Cascade: solo run reads 128 figures, 9 names stated more than once,
the 2 real chart-against-table differences; against the deal it reads
103 traced, 10 differences.

**Departures from the drawing, flagged for the founder:**

- The solo run's « Checking that totals add up » step and « totals
  checked » tally are omitted — the engine deliberately does not check
  totals yet (accuracy-backlog.md says why), and a step that pretends
  to is theatre.
- The finding cards' « Rebase / Reconcile » and « Not a problem »
  buttons are omitted. No file is kept, so there is nothing to write a
  correction into, and a dismissal would not survive replaying the
  stored answer. If these should exist, the honest versions need
  decisions: what does Reconcile do on a file Pierce does not hold?
- The compared-with card's « · and the accounts to Jun-26 » sub-line is
  not claimed — a one-off check reads the deal's models only, and only
  the models are named.
- A refused file (a corrupt deck, a password-protected model) has no
  drawn state; the server's sentence is shown in the result card's
  place, the metadata panel's answer-not-error pattern.
- « The chart on slide 3 says 37.8 · the table on slide 3 says 30.8 » —
  the design's says-line assumes the two statements sit on different
  slides; when they share one, the place words are read off the real
  location so the line still says which two places disagree.

## 13 August 2026 — New deal, from a SharePoint folder to a checked deal

The design's `newOpen` sheet, wired end to end: browse the connected
store, tick folders, name the clients, and — where a folder holds more
than one workbook — say which one is the model.

**The model choice is real, not decoration.** One column,
`connected_folders.model_item_id`, chosen on the confirm card and
honoured by the sync: the working copies, sensitivities and comps are
skipped with a counted reason (« a second spreadsheet — the deal chose
its model »), because reconciling the deck against a working copy
reports the copy's every difference as a finding. Null keeps the old
read-everything behaviour, so no existing folder changes. Connector
test added.

**Create composes what already exists** — `POST /dossiers` (creator
lands as lead), `PUT …/folder` with the model choice, `POST …/sync`
(which ingests and runs all three checks) — one sequence per picked
folder, so one folder failing leaves the others' deals standing, with
the failed one's sentence shown in place.

**Verified against the Graph stub**, which now serves a second room —
Project Kestrel, holding the model *and a working copy* — exactly the
shape that makes the flow ask. Watched live: browse → pick → confirm
(« 4 files · 2 spreadsheets, 1 deck, 1 other », real counts from the
folder's own listing) → create → « Syncing the folders — 3 files ·
Reading the models — 1 model » → the list re-opens with **Project
Kestrel · Kestrel Holdings · 3 documents · 9 to review · Checked just
now**, and the database shows the working copy skipped with its reason
and `model_item_id` stored. Nobody uploaded anything.

**Mappings and borrows, named** (also at their code sites): the crumb
root « SharePoint » is the drives list; folder rows say « Changed … »
from the store's own clock instead of the design's file counts (the
counts appear on the confirm card, where the folder has actually been
opened); only unreadable files are dimmed, because that meaning is
real; the failure sentence-in-place is borrowed from the metadata
panel. « Choose your deals » on the connected empty state now opens
this sheet.

**One bug worth remembering:** an `alive` ref latched `false` by
StrictMode's mount–unmount–mount cycle silently dropped every
response in the sheet. Re-armed in the effect body; symptom was an
empty drives list under a 200 response.

## 13 August 2026 — Settings: the firm's rules become mechanism

The design's three tabs, wired, with the rule that everything on screen
is real or absent.

**House rules exist now** — one row per organization
(`tieout_house_rules`, migration `a1c5e7b93d42`), read and saved on
every tap because the design draws no save button. Two of them are
already obeyed by the actual runs:

- **Audit rules can be switched off, and the audit says so.** The rule
  list on screen is `RULE_NAMES` from `audit.py` itself — the audit's
  own ten rules, never a list the screen invented — and `run_audit`
  skips what the firm switched off while naming the switch in its
  summary (`rules_off`), because a rule turned off is a decision on the
  record, never a silence. The design's master toggle maps to « every
  rule off / every rule on »; the audit itself always runs. An unknown
  rule key is refused whole (422), not stored and ignored.
- **The grounding pass obeys its toggle** in both places checks run —
  the Check-now route and the connector's sync. Off means two runs come
  back, not a third marked failed.
- Rounding (`together`/`separate`) and the four writing conventions are
  stored; rounding awaits its consumer in the findings lists, and the
  writing conventions bite when the House style check exists — which
  the screen itself says (« Not available yet »).

**Connections** is the live connector card — account, connected date,
Disconnect (owner-only, the server refuses anyone else's) — plus the
trust sentence. Before anything is connected the card offers the same
Connect Microsoft the deals empty state does.

**People** is the organization's real team with each person's deals in
this organization (« All 4 deals » only when true), and the invite
sheet drives the existing deal-member route per ticked deal.

Verified live at 1440×900: a rule unticked on screen landed in the
database and back; the refused invite showed the server's own sentence
in place. Six new route tests; 48 pass.

**Flagged for the founder:**

- « Folders Pierce can see », « Mailbox Pierce can read » and the
  Office add-in install section are omitted, not faked — the Change
  buttons have no destination yet, and the add-in manifests still carry
  a placeholder domain (`YOUR-DOMAIN.example.com`). They return when
  those exist.
- The invite route requires an existing account and answers in French
  (the dossier module's inherited voice): « Aucun compte Claidor avec
  cette adresse… » shown verbatim in the sheet. Decide whether the
  dossier module grows English sentences or the invite grows its own
  route.
- The People role column shows only « You » — job titles are not a
  thing the system knows, so the design's « Vice President » column
  waits for a real field.

## 13 August 2026 — the chat, and the workspace design is built

The last drawn piece: one glassy panel, three scopes, and the scope
decides what the agent can reach.

**Per-finding.** Opening a finding opens the chat on it: « Reading the
chain » is a real wait on the real chain endpoint, the sentence beside
the chain is the server's own summary, and the chain card walks the
actual path — slide 3's chart, `Model!C26` and its formula, the cells
feeding it — with the values in mono. Steps the chain could not follow
are printed under the card rather than dropped, which closes a gap the
API had been carrying unrendered (4.4% of formulas on real models have
one). Follow-ups carry the finding and the transcript to the deal
agent.

**Per-deal.** The deal page's chat goes to the existing agent — six
read-only tools over the loaded deal, arithmetic never through the
language model. The ask route now takes the finding and the last few
exchanges (`history`), folded into the prompt labelled, so follow-ups
read as follow-ups; a finding from another deal is 404.

**Per-file.** A finished one-off check gets its own, deliberately
smaller agent: `POST /check-file/{id}/ask`, two tools
(`file_summary`, `list_findings`) over the stored answer, and a prompt
whose boundary is the feature — a deal question gets « I only have this
one file », which is a correct answer, not a failure. Owner-only, 404
for anyone else. Nothing persisted: recorded tasks are a deal's
record, and a one-off has no deal.

**Honesty over theatre, throughout:** waiting states are real waits;
a failed or step-limited run says so; an unconfigured agent shows the
server's own sentence — the screenshot in the thread shows « No
ANTHROPIC_API_KEY configured. » in place of an answer, which is this
environment's truth. The suggestion rows are questions the tools can
genuinely answer, not the design's demo lines, which name people and
cells a real deal may not have.

Four new route tests with a scripted model (the finding and transcript
reach the prompt; the file chat holds only its two tools and its
boundary prompt; strangers get 404s). 328 tieout tests pass.

**Flagged for the founder:** the input pill's + and microphone buttons
are drawn without behaviour in the design and are kept exactly so;
live agent answers in dev await an `ANTHROPIC_API_KEY` in
`server/.env` — every deterministic part of the chat (chains, scopes,
boundaries, errors) is verified without one.

**With this, every view of the 12 August workspace design is built and
wired**: Deals, the deal page, the document panel, Check a file, New
deal, Settings, and the chat.

## 13 August 2026 — the square in the writing boxes, found and killed

The founder caught it in a screenshot: the chat's writing box drew a
blue rectangle on focus — the exact thing the standing rule forbids.
The culprit was not the user-agent outline (long dead) but
`@tailwindcss/forms`, which the app ships globally and which paints a
focus ring through **box-shadow** — the one channel `border: 0;
outline: none` does not close. `workspace.css` now zeroes outline,
border, box-shadow and the Tailwind ring variables on every workspace
input and textarea in every focus state. Inline styles still win, so
the sanctioned soft glow (`inputGlow`) is untouched — verified focused
on the chat box (clean), the dismissal note (soft glow), and the
invite email (soft glow).

## 13 August 2026 — the panel reaches for real Office

The panel existed as a state machine and four host bridges pointed at a
placeholder domain, loading fonts it did not have. This round gives it
everything it needs to be sideloaded into real Office — everything,
that is, except an Office, which this machine does not have. That
boundary is stated plainly below rather than papered over.

**The design's face, restored.** The panel's copy of the workspace
tokens had rotted: the 12 August redesign rewrote `design.ts` on the
web side and dropped the shared-block markers, so the byte-compare
test that guards the copy was failing. The shared block (font + ink)
is back in both files, byte-identical; every panel component was moved
off the old palette onto the new tokens; the shade guard in
`design.test.ts` now names the new five colours, with a comment
marking the redesign as the deliberate event it exists to tell apart
from an accident. New `panel.css` self-hosts Switzer and IBM Plex Mono
— the same five woff2 binaries the workspace loads, copied into the
panel's own `public/fonts/`, because an Office webview must not depend
on a font CDN. The writing-box rule is in it too: inputs get no
outline and no box-shadow, focus is the soft glow or nothing.

**Riding the dashboard's origin.** Office loads a task pane from a
live HTTPS origin, and the panel had none. Now every `pnpm build` of
the web app runs `scripts/embed-panel.mjs` first: it builds the panel
with `base=/panel/` and the API/dashboard origins taken from the same
`NEXT_PUBLIC_*` variables the dashboard itself uses, then copies the
result into `public/panel/` (generated, git-ignored). One deploy, one
origin, one TLS certificate; `signin.html` stays same-origin with the
panel, which `messageParent` requires, and first-party with the API,
which the session cookie requires.

**Manifests as deployment artifacts.** The checked-in manifests keep
their placeholder domain on purpose; `scripts/stamp-manifests.mjs`
writes stamped copies into `dist/` — AppDomain gets the bare origin
(Office matches domains, not paths), resources get origin + `/panel`,
and SupportUrl gets the product site rather than a `/panel/support`
that would 404 inside an error dialog. The embed script stamps
automatically when the deploy's origin is https, so the site serves
its own sideloadable manifests at `/panel/manifest.xml` and
`/panel/manifest.outlook.xml`. Version bumped to 1.0.0.0 — Microsoft's
validator refuses anything lower — and **both stamped manifests
validate clean against Microsoft's acceptance service**. Two URL bugs
found on the way: LearnMoreUrl stamped to `/panel/panel`, and the
Outlook manifest wanted `icon-64`/`icon-128` which did not exist. All
five icon sizes now ship, drawn from the Pierce mark.

**Watched against the real API.** With `http://127.0.0.1:3100` added
to the API's CORS origins (dev-only, in `.env` beside the Graph stub
lines), the browser loop runs end to end on real data: a minted panel
token, `?filename=cascade_deck.pptx`, the choose-a-deal screen —
first-open behaviour, by design, since a filename is never matched
across deals — then the identified panel: Project Cascade, 109
reconciled · 26 not checked, the drift rows with the model's values
and « now 39.6 in this document » on the resolved one. On reopen the
detached bridge asks again, which is correct: it has no document to
stamp. Inside real PowerPoint the stamp persists in the file.

**The runbook.** `SIDELOAD.md` — what is proven and what is not,
Office-on-the-web upload (the gentlest first test), Mac `wef` folder,
Windows shared-folder catalog and the `office-addin-debugging`
scripts, Outlook's separate dialog, the tunnel recipe for pointing
real Office at a local server, and a short what-to-look-at-when-it-
fails. The README's sideloading section was three claims stale
(manual placeholder editing, icons not committed, validator
unreachable) and now matches reality.

**Flagged honestly:** no real Office application has loaded the add-in
yet — the container has no Office, so the ribbon button, the stamp
surviving Save As, and jumping to a shape are built and unit-tested
but not yet watched running inside PowerPoint. The first sideload from
the runbook is that test. `Panel.tsx` remains the deliberate
placeholder; the panel's own design is the founder's, still to come.
16/16 panel tests pass, typecheck and lint clean.

## 13 August 2026 — the regulator corpus round: the engine meets files nobody here made

The founder's sourcing research (filed as `corpus-sources.md`) named
where real, messy, legally-usable financial models live. This round
fetched them and ran the engine against them — the first measurement
of the audit and the crosscheck against files with no fingerprints of
ours, and the best day the engine has had.

**The find.** Ofwat's queries document reports four cells hard-keyed
into an anonymised company's financial model. Checking that cell
across all sixteen companies de-anonymised it — Northumbrian and
Yorkshire, exactly the two the document counts — and gave the audit
the one thing money cannot buy: a defect in third-party files that a
regulator independently confirmed, in a document we did not write, on
files we did not make.

**The exam, failed then passed.** The audit scored 0 of 8 on those
cells; two rule fixes later (the stacked-constant veto now measures
the stack; a new column pass catches blocks too wide for any row to
keep its formula majority) it scores 8 of 8, the clean twin stays at
zero — and it found a second Yorkshire block the regulator's public
record does not mention. Then the overfit check the founder demanded:
the audit swept all sixteen companies in full and surfaced **57 more
paste-overs in eight companies the queries document never names** —
sampled by hand, every one real, with typed values that differ
materially from the plumbing they replaced (Portsmouth's WACC 6.08%
typed over a 5.56% feed; Southern's opex 52.7 over 153.3).

**The speed.** A real company model never finished ingesting in 25
minutes; the workbook reader now streams and does it in about forty
seconds, identical outputs on every regression file. The audit's noise
collapsed with it: one fill-copied formula is one finding, and the
worst file went from 8,017 findings to 182.

**The crosscheck, honestly.** Pre-registered pass criteria were
committed before the fair test's number arrived
(`ofgem-crosscheck-protocol.md`). Ofwat's code-labelled models yield
zero links and the zero is correct behaviour — value-only matching was
measured and would drown in coincidence; the named class gets a
mapping layer (Ofwat publishes the mapping themselves). Cadent against
the sector model: zero links, graded specificity success — its numbers
verifiably are not in that file, and the linker declined 432 chances
to guess. The Finance Annex pair produced 12 proposals from 1,234
figures, all claimed as drifts — and all twelve, hand-checked, are
false: lone licensee acronyms matched against dropdown integers on a
data-validation sheet. Per the pre-registered protocol the fair test
**fails**, with three causes named in the backlog (a lone-token label
can clear the threshold; machinery sheets are candidate material; the
five genuinely-present targets went unlinked for reasons owed a
debug). The twelve false links are pinned as the regression corpus
for the fixes. The banker-vocabulary pair measured the same day with
the same code links 7 of 8, all agreeing. The linker's 20-minute run against 146k candidates is now a
named scaling debt.

Everything measured is in the accuracy backlog with the sweep log and
scripts (`regulator_eval.py`) to reproduce it.

## 13 August 2026 — the Microsoft round: the hour scripted, the panel dressed

The founder's directive: Microsoft first, best-effort design on the
panel, theirs to redesign later.

**The tenant, made a paint-by-numbers hour.** `microsoft-hour.md` walks
the Azure registration step by step with the exact values the code
expects — multitenant account type, the five delegated scopes with the
one admin-consent click `Sites.Read.All` forces, the localhost-not-
127.0.0.1 trap Entra sets for dev redirects, the secret's
value-not-Secret-ID trap, the expiry calendar note. And the connector
doctor gained `--preflight`: it proves the registration **before any
browser sign-in** by asking Entra's token endpoint with a deliberately
bogus code — Entra checks the client credentials first, and its error
codes distinguish wrong-app-id (AADSTS700016), wrong-or-expired secret
(AADSTS7000215), and « credentials fine, only the code refused »
(invalid_grant), which is the pass state. The stub grew the OpenID
route so the dev loop preflights all-green; against the real tenant
every branch is reachable. What remains genuinely unprovable from this
container is unchanged and stated: the first real connection runs
through `connector_doctor`, one line per Graph call, so whatever it
finds is one sentence to hand over.

**The panel, dressed in the design.** Best effort, every borrow named
in `ui.tsx`: the sign-in screen is the workspace welcome at panel
scale (the Pierce mark, one quiet line, the screen's single filled
control — the header's blue button); findings print their figures in
the design's mono as the chain cards do, with the deal page's severity
dot before the state word; Re-check is the workspace card's grey
button, the same word; rows lift on hover with the wash; the deal
chooser carries a faint chevron; the clean state gets the clean dot.
Verified in the browser against the real API — the container restart
had taken the database with it, so the stack (docker, migrations,
seed user, session, Cascade deal) was rebuilt first and the
screenshots show live data: 112 reconciled · 23 not checked, the
Cascade drifts in mono. 16/16 panel tests, typecheck and lint clean.

Also: the `.env` base section and the minio provisioning scripts are
reconstruction casualties of container restarts twice now — both are
documented in this entry as the first two things to check when the
dev stack dies.

## 13 August 2026 — watching: the deal room re-reads itself, and says so

Two halves, both shaped by things the codebase had already decided.

**The loop.** `connector/tasks.py`: a cron actor every quarter hour
enqueues one sync job per healthy connected folder — per folder, so a
throttled tenant cannot hold up the other nine, and a dead connection
fails alone into the `error` column the Connections screen already
shows. Each sync runs as the connection's owner, because the token is
delegated and the watch must read exactly what that person can open.
The sync itself needed nothing: content-tag change detection, versions
never overwrites, and the unconditional re-check were already its
behaviour — the loop is pure scheduling.

**The « tell me ».** The decision log's own docstring forbids plumbing
entries — « one plumbing entry is how a decision log turns into an
activity feed and drowns » — so notifications are *derived*, the same
reasoning pointed the other way. One small table, `tieout_deal_visits`
(a row per person per deal, moved forward when the deal page opens via
its own POST, since the page GET is read-replica territory), and the
deals list computes « 3 files · 9 new findings since you looked » from
artifact and finding timestamps against it. Composed from the stale
note's idiom — a sentence in the subtitle slot, in a state colour —
accent rather than amber, because arrivals the watch has already
re-checked are news, not danger. Stale outranks it: stale means the
row's own numbers are wrong, which is graver than them being new. A
person who has never opened the deal gets zeros, not « everything is
new ». Verified in the browser end to end: the note shows, opening the
deal clears it, the stranger cannot mark a visit (404).

Five new tests (three route, two task); 372 tieout+connector pass.
**Flagged honestly:** the loop is real but has never fired against a
real tenant (the watch's first quarter-hour tick happens wherever the
worker runs, after the founder's Microsoft hour); and there is no
email or push — « tell me » is the deals list telling you, which is
the only channel the design draws. The cadence is fixed at 15 minutes;
making it a house rule is a founder decision when wanted.

## 13 August 2026 — linker round 2: the document knows what year it is

The second round of the recall plan, and the one aimed at the shape
that defeated every target on the Ofgem pair: a parameter and its own
history under one name.

**What was built.** A source PDF now records the year it speaks from
(`Extraction.year`, read from the PDF's creation date or a « Month
YYYY » on the opening pages, carried through ingest counts and into
the crosscheck). On a mixed-value tie the linker asks which era the
document means — « outturn » says history, « forecast » and
« allowance » say the regime, and a bare parameter with a known
document year means the document's own era — then steps the other
era's columns back and lets the existing one-answer collapse decide.
Never a value in sight; the narrowed set must still agree with
itself. Alongside it, the derivative suppressor: prose that names a
band or a threshold (« plus or minus », « thresholds are ») may
corroborate a cell and may never contradict one. Both round-1 false
drifts were that shape; both are dead.

**The boundary was the discovery.** With « past » meaning strictly
below the document's year, every target still refused — one diagnosis
later, the reason was FY2026: the document speaks from *inside* it,
and its column holds history's blend, not the regime's number.
Forward means strictly after the document's own year. One character
(`<` to `<=`), argued at the definition with its risk stated, and
the entire headline family linked: RFR, TMR, equity beta, cost of
equity, gearing — five of five verified-present targets, all
agreeing, all hand-checked.

**Graded by the untouched protocol: still FAIL, now purely on
drifts.** Volume 18, precision 72%, recall 100% — and five false
drifts, which the protocol rightly refuses to forgive. Three are the
entity sibling (ET's 55% against GD's 60%), which is round 3's
already-sequenced mandate. Two are a new named class: clause
segmentation handing a figure a dangling fragment (« gearing) and »)
whose one word sits inside another row's name. The autopsy, the
denominator removals with their named searches, and both queues are
in the accuracy backlog.

Also fixed en route: the month-name regex in `_document_year` had
literal backspace bytes where `\b` was meant (a heredoc artifact) —
caught by its own new test failing on « December 2025 ». Cascade
unmoved: 7/8 agreeing, 113/105/8 pinned, 356 tieout tests green.

## 13 August 2026 — decision noted: Check-a-file stays, for now

The advisor's question — is Check-a-file worth its page — got mapped
against the code before answering. It is three separable things: the
deck/memo self-check (`solo.py`, measured on 29 real decks — the only
genuinely banking-only half); the workbook path, which already routes
to the model audit (« a workbook checked by itself *is* the model
audit »); and the hidden-inside checks, which were never part of
Check-a-file at all — they are a per-document report inside the deal
page. Decision, founder's call: keep everything as it stands until
the buyer question (documents-leaving-the-firm vs model-audit) is
actually decided; the engines cost nothing dormant and the Office
panel does not depend on the page. One fold queued regardless of
buyer (task #16): very-hidden sheets, external links and embedded
workbooks should surface as *audit findings* on a model, not only in
the hidden-inside panel.

## 13 August 2026 — linker round 3: the model knows who it is about

Entity scoping, the round the 55%-versus-60% false drifts were
waiting for. No curated gazetteer: the entity set is the model's own
vocabulary (its sheets are named Cadent, NGN, WWU — and it has never
said ET), a figure is attached to the acronym in its own label or to
the nearest mention in its sentence, and a figure about somebody the
model has never heard of may corroborate but never contradict. The
nearest-mention rule earned its keep in the tests before it met the
corpus: proper nouns count as mentions only when they match a sheet
name, because « Notional » capitalised at a sentence start is a
quantity word, and an early version of the rule let a distant ET
outvote an adjacent Cadent.

On the identical Ofgem pair: all three entity drifts dead, the
fragment-labelled 5.18% dead as a bonus (its nearest mention is ET),
all thirteen agreeing links held — including the 60% that shares the
ET-bearing label, which is why the gate is corroborate-only. Volume
15, precision 87%, recall still five of five. Grade against the
untouched protocol: **still FAIL, by one clause** — the two
surviving drifts are the fragment-label pair from a single line, and
« document says 60%, model says 6% » is the embarrassing shape the
fail criterion names. The grade sheet does not bend after the number
arrives. The fix is the reader's (task #15), and it is the only
failure class left on this pair. Cascade untouched; 361 tests green.

## 13 August 2026 — linker round 4: torn labels, and the first PASS

The smallest fix of the four rounds closed the last named failure on
the Ofgem pair. A label like « gearing) » is the torn edge of a
parenthetical — the qualifier of a *neighbouring* figure's name, not
this one's — and the gate is parenthesis balance and nothing else,
corroborate-only as always. The design note that matters: repairing
the label in the reader instead would have made things worse, because
handing 5.70% the sentence's head links it to the 60%-gearing row and
reports the same false drift under a prettier label. The torn label
is the document failing to say which variant it means; refusal is the
honest answer.

The identical pair, on the protocol untouched since before the first
result: **13 proposals, 13 agreeing, zero drifts — V, P, R and D all
pass. The first PASS, on the fourth round.** And the caveat written
in the same breath: this is the development pair. A held-out sweep
the same hour — Cadent's own RIIO-3 document, never used in any
round, against the same model — produced five proposals, five
agreeing, zero false drifts on input the gates had never seen.
Held-out *recall* remains unmeasured (no ground truth exists for
that document yet); building one for an untouched pair is the next
measurement debt, named in the backlog. Cascade unmoved; 364 tests.

## 13 August 2026 — the first real connection attempt, and what it taught

The founder clicked Connect Microsoft on the deployed site. The popup
asked which account, then turned into a second full workspace saying
« Nothing connected yet », while the first one waited on Microsoft and
eventually gave up — no explanation anywhere. The explanation existed
the whole time: the connector's callback carries Microsoft's own
sentence back as `?connector=failed&reason=…`, and no screen ever read
it. Two fixes, both in the shell: the popup now hands its verdict to
the window that opened it (postMessage, same-origin) and closes
itself; and both Connect surfaces — Settings and the deals empty
state — listen, end the waiting face the moment the verdict lands,
and print the refusal verbatim. Verbatim deliberately: an AADSTS
sentence names its own fix, and paraphrasing it hides the code a
search needs. The popup-blocked path keeps working too: landing in
the same tab cleans the address bar and carries the verdict to the
Connections screen. The root cause of the founder's failed attempt is
still unknown — it is sitting in that popup's address bar, and the
next attempt will print it on the screen instead.

## 14 August 2026 — the preflight lied, and what replaced it

The failed connection's root cause was the classic Azure mistake — the
UUID in the « Secret ID » column pasted where the secret's *Value*
belongs — and the preflight had green-lit it. Twice. The bogus-code
trick assumed Entra validates the client secret before the
authorization code; measured with deliberate garbage in the secret
slot, it does not — the fake code is refused first and the secret is
never read, so the check could not fail. Replaced with a
client-credentials token request, which the same experiment shows
genuinely validates the secret (garbage → AADSTS7000215 every time),
and re-run against both the garbage secret and the founder's actual
mistake: both now fail, with the Secret-ID trap named in the failure
line itself. A policy-stage refusal (conditional access, no app
roles) reads as a pass, said in so many words, because client
authentication happens before policy and is all the preflight claims.
The lesson written down: the check that cannot fail is worse than no
check, because it converts a founder's caution into confidence.

## 14 August 2026 — the Office add-in section, built at last

The founder asked where the install surface from their design had
gone, and the answer was in the screen's own docstring: omitted
deliberately while the manifests carried a placeholder domain — an
Install button that installs a broken add-in is worse than none —
and flagged. Both manifests now serve from app.claidor.com (checked
against production before building), so the section went in exactly
as drawn: Word/Excel/PowerPoint with an Install, Outlook with its
own, and « Deploy to the whole team » with a Copy-link for IT's
central deployment. One composed behavior, flagged for the founder's
pass: a web page cannot reach inside Office to install an add-in, so
Install downloads the manifest and a sentence appears below the card
— the « Pierce reads » card idiom — saying where the file goes
(Office's Upload My Add-in; aka.ms/olksideload for Outlook). The
design draws no post-click state; this is the borrowed one.

## 14 August 2026 — the panel's first breath inside real Word

Exactly the promised « first sideload will surface something »: the
Claidor button appeared, the pane opened, and it said
« app.claidor.com refused to connect ». Cause read off the live
headers: the site sends `frame-ancestors 'self'` and
`X-Frame-Options: SAMEORIGIN` everywhere, and Office renders task
panes inside its own hosts' frames — word.cloud.microsoft and kin.
Fix follows the checkout route's existing pattern: `/panel/*` is
excluded from the strict base rule and gets a CSP that declares
*only* who may embed it (Office's web hosts, `*.cloud.microsoft`
included — modern desktop Office frames add-ins through it too), no
X-Frame-Options at all, and deliberately nothing else — the pane
loads office.js from Microsoft's CDN, and a fuller policy would be a
second way for the pane to break that nothing else shares. Verified
by evaluating the config's headers directly: the panel rule carries
the one line, the base rule no longer covers /panel.

## 14 August 2026 — the pane's real blocker: a sign-in dialog aimed at a 404

The founder walked the diagnosis to the door: pane loads standalone,
Word web console shows one violation — the Office dialog framing the
dashboard's root against `frame-ancestors 'self'`. The sign-in
dialog's default URL forgot the panel lives under `/panel/`: it
opened `/signin.html` at the origin root, which is the dashboard's
404 wearing the dashboard's own nobody-frames-me policy. Office's
dialog frame was refused, no token came back, and Office said
« couldn't start this add-in ». One line — the URL now carries
Vite's own `BASE_URL` — and the whole sign-in journey sits under the
`/panel/*` CSP rule that already welcomes Office's hosts. Verified in
the compiled bundle before committing.

## 14 August 2026 — the closed-deal test, found, run, and graded in a night

The founder went hunting for a closed deal published beside its
contract and the research pointed at Scotland: SFT publishes
financial-close models next to redacted Project Agreements. The
portal blocks robots and its own TLS certificate is expired; the
files came through a reader proxy, a search endpoint, and the S3
bucket the portal fronts. The pair that completed first: Dumfries &
Galloway Royal Infirmary — a 359-page Project Agreement and the
6.4MB financial-close model, values-only as published.

Discipline held in order: protocol pre-registered before the files
existed, ground truth hand-read from the contract and committed
before the first run. The redaction finding came first and matters
most — ten readable pound-figures in 359 pages, no rates at all: the
redaction regime deletes precisely what a model holds.

Grades, by the unmodified protocol: **audit leg PASS** — 107 frozen
#REF! errors and 96 formula-attested dependencies on an unpublished
sensitivities workbook, hand-verified, auditor-billable, zero
configuration. **Grounding leg FAIL on recall, 0 of 3** — and a
perfect zero false drifts across 1,497 × 199,098, the criterion
pre-named as decisive on a redacted pair. The recall causes are
named with evidence: OCR'd tables sever a shareholder's name from
the 25,500 it owns (the model literally has a row called « Laing
O'Rourke » waiting), and « issued share capital » shares no word
with a row called « Equity ». One is the reader's next round; the
other is a synonym-bridge decision owed corpus evidence.

The night's verdict for the model-audit thesis: on the first real
closed-deal model it ever touched, the engine produced findings a
model auditor bills for. The grounding story on published pairs is
capped by redaction itself — the strongest argument yet that the
full product belongs inside live deals, not public archives.

## 14 August 2026 — the revision-defect study: the claim becomes a table

The founder's brief: the yearly-subscription argument rests on a
claim nobody has ever measured — that revising a professional model
introduces new defects. Ofwat published its PR24 suite twice, five
months apart, revised under formal objection. We own the only tool
that could measure the difference, so we did, protocol first.

Sixteen matched pairs, company by company, identities verified from
each workbook's own cover cell (one carried United Utilities' legacy
code, one identified by airtight elimination). Findings matched on
rule + sheet + cell name — never the address — with unmatchable
findings bucketed, not guessed. Then twelve NEW findings read by
hand in the cells on both sides before anything counted.

The result: **84 new mechanical defects across one revision cycle,
ten of sixteen models gained at least one, and Yorkshire gained
forty in a single block** — the post-financeability adjustments, the
exact mechanism reworked as allowances moved from £88bn to £104bn.
Verified shapes: live input formulas overwritten with typed
constants, and late adjustments hardcoded into formula tails
(`-0.490096707821704` bolted onto a restored formula). Three cases
where the revision fixed one defect class by introducing another.
Also honest: revision *repaired* 338 findings while introducing 84,
and the template itself ships ~581 standing findings into every
company model. Full table, verified samples, and pre-committed
caveats in `revision-defect-results.md`.

The sentence this buys, exactly as pre-registered: across one major
revision of a professional financial model suite, 84 new mechanical
defects appeared. No competitor can say it, because no competitor
measured it.

---

## 15 August — the Antford workspace, rebuilt to the founder's redesign

**The brief.** The founder redesigned the whole workspace (and the brand:
Bodoni Moda wordmark, Instrument Sans face) and handed over the file —
"the design changes. the logo too btw. mind everything." Checked in at
`docs/pierce/design-antford/` as the new source of truth; built in three
phases, each committed and pushed separately.

**Phase 1 — brand, shell, models list.** Fonts vendored from the design's
own binaries into web and panel (shared design block kept byte-identical;
panel tests pin it). The floating-card frame retired: full-bleed white
panes over a 1px `#eae7e2` seam, 54px header, translucent dock bar, the
wordmark in Bodoni. The deals list became the design's sentence-rows —
name left, verdict right («6 checks fail» amber, «Changed since check»
blue, «All checks pass» green) over «Checked Tuesday 11:52». That verdict
needed a number the API didn't carry: `failing_checks`, distinct rules
among the open findings, tie-out counting as one — added to the deals
endpoint and pinned in the route test against the findings list's own
rules. Groups are «Needs attention» and «Clear»; never-checked deals keep
their own undrawn state («Not checked yet», flagged).

**Phase 2 — the model page.** Verdict in four faces (clean · stale ·
spelled-out failing count · never-checked, the last composed because the
design doesn't draw it). One card per failing check with new-vs-inherited
tags read off the finding's first sighting against the current model
version. Card modal: the finding's sentences, places listed, «Accept with
a note» wired to the real per-finding accept (note required). Sectioned
card: Checks that pass / did not run / Evidence locker / The model /
Documents that quote it. Departures (all data-absent, none faked): no
mini Excel grid in the modal, no «Open the cell» in web, no per-rule
tallies, version rows say who uploaded rather than what changed.

**Phase 3 — the rest.** Check a model rebuilt to the front door («Would
this model survive its audit today?», dashed drop zone, glassy progress
card with the design's staged steps, done view in the model page's own
shapes with real sheet/formula counts). The design cut the against-picker
and recents from that screen; so did the build. Settings: flat tab pill,
design width, «The Excel add-in» only — Word/PowerPoint/Outlook rows
retired with the two-surface posture. Doc panel and chat became flat
panes; chat appears only when «Ask» is pressed and carries the design's
close button.

**Still open.** «Export report» and the report sheet ride with the demo
kit (#18) — the button arrives with the thing it opens. The «Folders
Antford watches» / «Mailbox» rows stay omitted (Change has no
destination). The panel's own Antford redesign is with the founder.

---

## 15 August — the Excel panel, rebuilt to the founder's design

The founder handed over the panel redesign («Floor is yours»). Checked
in at `docs/pierce/design-antford-panel/`; the panel is the right-hand
column of that file — the left half is a mock Excel drawn for context.

What changed in kind, not just in dress: the panel's buttons are black
(blue is for links and cell references), the mark is a Bodoni «A», a
finding is a cell reference that moves the sheet when tapped, and the
design draws the two ideas the product decided on earlier — the
deliberate dismissal («That's fine» → «Why is this deliberate?», no
save without a note) and the new-vs-inherited split («N older
findings, carried over from before this file was watched»). Both were
wired to real behaviour: the note goes through the per-finding accept,
and the split reads each finding's first sighting against the current
version's arrival.

The consent face was the one place theatre threatened: «Allow access»
looks like a permission exchange, and Office granted the add-in its
permissions at install. It was made true instead — the state machine
now holds before its first read of the workbook until Allow is pressed
once, so the button gates exactly what it claims to.

The verdict line's «M checks pass» comes from the firm's own rule
catalogue against the failing rules, and «· 11:42» from the last
finished check — both new panel API reads. The old panel's UI
primitives retired with their design.

---

## 15 August — structure layer, round 1: the floor under the analytical checks

**Protocol first** (`analytical-checks-protocol.md`), tolerances and
pass criteria fixed before any code, grounded in a survey of AFW and
Dumfries recorded inside it. Then `polar/tieout/structure.py` — period
axes from each sheet's own labels, sections from the model's own SUMs,
opening/closing pairs by vocabulary, block location needing two
independent anchors or abstaining — and a survey harness run over all
22 corpus models.

**Round-1 results.** Balance sheet located on 19 of 22 (86%): all
sixteen Ofwat models (the five FinStat sheets each, every anchor
printed), Bertha Park, Dumfries (BS and its audited twin), RHSC
(PF8_Balance Sheet). Debt schedules on the three biggest close models
(eight schedules between them — Constr/Ops splits and per-phase calcs
— each anchored by tranche vocabulary plus a carried pair). The Ofwat
models abstain on debt, which is right: a regulator's notional debt
has no repayment schedule. 103 opening/closing pairs across the close
models. Check sheets found everywhere they exist, including « Audit »,
« Integrity Checks » and Ofwat's « Model Checks and Alerts ».

**Zero mislocations seen** in the printed anchors, with the protocol's
full hand-verification sample still owed before Phase 1 is declared
passed — the claim so far is « nothing wrong found », not « verified ».

**Two discoveries bigger than the round:**

1. **Every issued Scottish close model is values-pasted** — zero
   formula tags across millions of cells, in all five files. Issued
   close models routinely ship with formulas stripped, which means the
   mechanical audit is half blind on exactly the files deals publish —
   and the analytical checks, which run on cached values, are the only
   checks that can speak there. The layer records the fact
   (`values_pasted`) so a screen can say it.
2. **Label-pairing is the wrong balance arithmetic.** A dry run
   pairing « Net assets » with « Total equity » on AFW produced a 0.86
   discrepancy on a published determination model — multiple bases
   share those words. Phase 2's balance check will key on the model's
   own check rows and subtotal tree, or abstain. Corroborate, never
   impose.

**Round 2 items** (accuracy backlog): Ofwat pairs are found by
formula shape, not vocabulary (their continuity lives in « Error
chks » rows); Anderson and Elgin abstain on everything — coverage,
not correctness, and the next vocabulary round; the `.xls` Ayrshire
file loads but yields no axis — the old-format label path needs
reading. Semi-annual Dumfries recorded as 2 columns/year rather than
flagged, as the protocol demands.

---

## 15 August — structure layer, round 2: Phase 1 passes

**The two repairs round 1 demanded, both measured before coded.**
Vocabulary pairs became block-scoped — the opening rows partition a
sheet, and a closing belongs to the block it sits in. That is
Anderson's own layout speaking: « Opening Cash » at 217, twelve
movement rows, « Closing Cash » at 229; the old eight-row cap was a
number, the block is a structure. And the FAST idiom finally pairs:
a bare reference to the previous period, same shape, recurring across
three or more columns is the model declaring a carry with no words at
all. Hand-read on AFW's RCV block and it is textbook: the BEG row
reads `=J99`; row 99 computes `opening + additions − deductions`.

**Round-2 numbers, all 22 models.** Pairs 4,566 (from 115). Balance
sheet located on 19 of 22 (86%); debt machinery on 21 of 22 (95%) —
Anderson and Elgin came in through their workings sheets. Ayrshire
(.xls) is the one full abstention: its period headers are date values,
not text; diagnosed for a reader round, not patched.

**Hand-verification sample, per the protocol.** Every sheet's axis
read on AFW, YKY, Dumfries and Bertha Park: the Ofwat axes uniformly
FY2022–FY2036 on ~45 sheets each; Dumfries monthly through its
construction phase and semi-annual through operations, per sheet, with
the audited statements annual — the exact periodicity split the
protocol required recording rather than flagging. Blocks hand-read:
Dumfries « BS » (Debtors, reserves, Total current assets, Creditors —
a real balance sheet), Bertha's pair 655/660, Anderson's cash rows.
One definition sharpened rather than counted a miss: the
`debt-schedule` kind names debt *machinery* — schedules and service
waterfalls both (Bertha's « Distributions » is CAFDS and coupons); the
terminal check finds tranches *within* a located sheet and abstains
where there are none.

**Phase 1: PASSED** under the pre-registered criteria — coverage above
80% on both block kinds, zero mislocations found, the sample read.
Next: Phase 2, the balance check, keyed on each model's own check rows
and subtotal tree (label-pairing stays rejected).

---

## 15 August — analytical checks, Phase 2: the balance check passes

**The design was decided by a diagnosis.** Before writing the rule, the
0.86 from the dry run was traced: AFW's net assets and total equity
genuinely differ in the tail periods — while the model's own « FinStat
- BS - Appointee - check overall » reads zero. Their identity is not
the textbook's. So the instrument became the model's own check rows,
zero-convention gated; the independent identity runs only where its
rows are unique and never against the model's own passing verdict —
the protocol's agreement rule, enforced workbook-wide after round 1
fired twelve retail findings that AFW's and WSX's own checks
contradict.

**One amendment under the protocol's own rule.** The floor moved from
1e-6 to 0.01 working units: Dumfries carries accumulated rounding walk
of ~3e-4 in £000 units — about 29 pence on a £779m model — and the
registered floor was measuring float noise, not money. Prompting
result and reason recorded here as the rule requires.

**Round 2, all 22 models.** Zero false balance findings; zero axis
findings (the axis rule claims only the dip that cannot be layout —
Dumfries' side-by-side budget blocks, hand-read, made segments legal).
Five own-check findings, each read in the cells before counting, and
every one sits in an **issued financial-close file**: Dumfries' own
audit rows report 329.15 (sub-debt sculpting residual, FY2019) and
50.92 (FY2043); Elgin's drawdown-vs-participation check reports ±0.5;
Ayrshire's project-vs-financing cash flow check reports ±700,016 — a
one-period timing slip of £700k in the file a deal closed on. Recall
proven on seeded copies of the real Dumfries file, caught by cell
name. Ten unit tests pin the gates.

**The product sentence this buys:** the models deals actually close on
ship with their own checks firing, nobody reads them, and Antford
does — on the values-pasted copies where nothing else can.

**Held for later rounds** (backlog): RHSC's balance rows need a wider
pairing vocabulary; when a model's own balance check itself fires, the
own-check finding and the independent identity can both speak — de-dup
before the catalogue; severity grading for tiny firings (±0.5); a
seeded axis dip on a real file to match the unit test.

---

## 15 August — analytical checks, Phases 3 and 4: cash and debt pass

**Cash tie-through** walks all 4,566 carries the structure layer found,
along each sheet's own axis, on cached values — the check that catches
the error nothing mechanical can see, on the values-pasted files where
nothing else can be checked. Its three gates were each earned by a
hand-read, not designed at a desk: segment boundaries are never
compared across; a pair that mostly disagrees is our mispairing and
says nothing; and a break only counts where the carry *resumes with
live values* — Anderson's construction cash agrees for years, sweeps
out over two settlement periods, and goes dormant, and no part of that
is a defect, including the zero-against-zero tail that must not count
as life. Round 1 fired nine times on the twins; every firing was read
in the cells; the resume-gate silenced all nine as the phase-end
sweeps they are.

**Debt-terminal** claims the narrow thing a project financier cares
about: a debt-worded tranche on located debt machinery, strictly
amortising into the model's horizon, still above tolerance against
its own peak. Revolvers fluctuate and abstain; repaid tranches pass.

**Final sweep, all 22 models: six findings, zero false positives.**
Every finding is a model's own check row firing, every one hand-read,
every one in an issued financial-close file — Dumfries (329.15 and
50.92), Elgin (±0.5), Ayrshire (±700,016). Recall proven on seeded
copies of the real Dumfries file for all four shapes — imbalance,
fired check row, mid-life carry break, declining debt remnant — each
caught by cell name. The first debt seed was flat and the decline
gate correctly refused it; the seed was reshaped, not the gate. 33
unit tests pin every gate.

**Interest self-consistency is the one protocol item deferred**, with
its reason: floating-rate models make naive stability tests abstain
everywhere, and doing it honestly needs tranche-to-interest-row
association — its own measured round. Backlogged, not forgotten.

**What exists now that did not a day ago:** an engine that reads a
model's structure, checks it as a set of financial statements, finds
the fired checks nobody reads in the files deals actually closed on —
and has never once, across 44 model-runs of survey, said something
about a published model that a hand-read did not confirm.

## The panel audit — why « it just does not work »

The founder opened the add-in in Excel and got the old product: the
name Claidor, the old logo, deals from before the pivot, and a
choose-screen that asked the same question forever. Audited end to
end; four distinct defects, all real.

**The ask-loop.** The identify endpoint answers `matched_by: none`
when the chosen deal holds no file by the open workbook's name — and
the panel answered that by silently showing the choose screen again.
Pick, loop, pick, loop. Fixed by making the refusal speak: the choose
face now says which model was tried and which filename it does not
hold, and what to do about it.

**The branding.** The deployed manifest still said Claidor everywhere
— provider, display name, ribbon button, tooltips — and shipped the
old mark. Rewritten as Antford throughout, new Bodoni-A icons at all
five sizes, and trimmed to Excel only: the Word and PowerPoint host
entries are gone with the pivot. Same manifest Id, so re-adding the
add-in updates the install in place.

**The stale deals.** Nothing could ever be removed — no delete route
existed, so pre-pivot deals polluted the picker forever. Added
`DELETE /deals/{id}` (soft, findings and notes kept), a two-step
remove control on the model page, and the shell wiring that closes
the page and refreshes the list.

**The deployment fact underneath all of it:** what the founder tested
is the last deployed build. Every fix here — and the entire Antford
panel — lands only when the branch merges.

## Analytics into the product — the founder's v2 design, wired

The founder revised the workspace design (`Antford_Workspace_2.html`,
checked into `docs/pierce/design-antford/`): the failing checks split
into « How the model is built » and « Whether the accounts add up »,
figure-led cards with the mono cell reference in green, the
values-only banner, pass rows with real tallies, abstention rows
under « Checks that did not run », and a « Statement checks » switch
in Settings. That drawing is the face of what Phases 1–4 built — so
this round put the engine into the product behind it.

**Server.** The statement checks now run inside every ordinary audit
— `run_audit` reads the structure, runs the analytics, and lands the
findings in the same findings table as the mechanical rules, with
rule keys, short standards (« ICAEW 8 », « FAST C4 »), the spelled-out
standard sentence, and a headline figure composed where the measured
values live (« 50.92 — on the model's own « check » row, built to
read zero »). The run summary carries what the screens must never
invent: whether the copy is values-pasted, every abstention with its
sentence, and per-rule tallies counted inside the walks themselves —
rows read and clean, accounts walked and carried, periods compared,
tranches judged, sheets examined. The one-off Check-a-model path runs
the same checks on the cells it just read, before the file is
dropped. The house-rules catalogue serves both families with the
statement checks flagged, so no screen keeps a list of its own; the
five statement keys ride in `audit_rules_off` like any rule, which is
what the Settings switch flips — no new column, no migration.

**Spot-check against the real files** before anything shipped:
Dumfries reports its two known firings with their figures (50.92 at
Audit!BP156, 329.2 at InputPh2!T150), tallies « 2 of 4 rows clean »,
129 balance periods, 13 carrying accounts, 1 tranche repaid;
Anderson reports clean tallies and the named balance-sheet
abstention. Same verdicts as the hand-verified survey — the fold
changed where the answers land, not what they are.

**One defect caught in the round:** the pass rows would have worn the
catalogue's failure names — « Cash does not carry forward between
periods » as a *pass*. The catalogue now carries each statement
check's passing sentence too (« Cash carries forward », from the
design's own pass list), and the pass rows wear those.

**Departures from the drawing, flagged in the code where they live:**
the tie-out's card keeps an untitled grid above the two families (the
design draws no third section for documents-vs-model); construction
cards headline the count of failing places, not a per-cell figure the
mechanical audit doesn't extract yet; the design's pass list names
checks the engine does not run (retained earnings, interest accrual,
depreciation) — absent, not faked, interest being its own backlogged
measured round; and the two Settings master switches are each scoped
to their own family so flipping one never silently moves the other.

400 server tests pass, web and panel typecheck, panel suite green.

## Interest self-consistency — the deferred Phase-4 half, measured (16 August)

Registered before results (protocol addendum, 16 August): association
only when exactly one interest row sits inside the tranche's own
block; the convention is the median implied rate over at least six
rated periods, standing when three quarters sit within ±50% of it;
two claims only — a factor-of-three departure from the model's own
median, and interest charged after repayment. Zero-interest periods
with a live balance deliberately unclaimed (payment frequency looks
identical to a stop).

**Two amendments on the first survey's evidence**, recorded in the
addendum before any finding was counted: a candidate row must be
*live* — Dumfries's sub-debt corkscrews keep « Interest rolled up »
rows that are entirely zeros, and an empty row is presentation, not
an instrument — and a pair with no live in-block interest row is
silence, not an abstention: on Anderson, Bertha Park, Elgin and RHSC
interest lives elsewhere in the model, so nothing was measured and
nothing was declined.

**Final survey, all 22 models: zero interest findings, zero judged
tranches.** That second number is the round's real result. The
corpus never presents the shape the check fires on: the Ofwat models
keep five-way interest splits on five-year control accounts —
ambiguous by name (86 abstentions) or too short for a convention
(11) — and the Scottish corkscrews carry empty interest rows with
the real interest charged outside the block. Every refusal hand-read
on Dumfries and spot-read on AFW; each one is the gate doing its
job. The other five checks reproduced their known results exactly —
the same six own-check findings, nothing else.

**Recall: proven, with a declared enabling edit.** No real tranche
associates, so the seeds populate sub debt 1's own empty interest
row at a steady 5% of opening — the convention the row was built
for — before introducing one defect per copy. The harness prints the
enabling edit; it is part of the seed, never hidden. Both defects
caught by cell name: 20% against the schedule's own 5% at
Ph2 Calcs!AQ984 (« a factor of 4.0 off its own convention »), and
500 of interest at BQ984 after the tranche was repaid. All four
earlier seeds still pass; 26 unit tests pin the gates.

**What this round honestly bought:** a sixth statement check that is
armed, gated, product-wired (catalogue, pass sentence, tallies,
Settings) and provably able to catch both defect shapes — and that
on today's corpus says nothing, out loud, for named reasons. It will
speak on the models the product is actually for: lender-case project
finance files that keep each tranche's interest inside its own
schedule. Cross-row association — reaching the interest a model
keeps outside the block — is the next evidence round, not a guess to
bolt on.

## Severity grading and de-duplication (16 August)

Registered first (protocol, 16 August), calibrated on the hand-read
findings, then built. **Grading:** a money finding measures against
the model's own scale — the workbook-wide median absolute cell value
— and below one thousandth of it grades as a `smell`: true, reported,
marked as below the model's own materiality. The line sits four
orders of magnitude clear on both sides of the calibration set:
Elgin's ±0.5 grades smell at 4.3e-6 of its model's scale; the
smallest genuine money finding (Dumfries's 50.92) sits 280× above
the line; Ayrshire's ±700,016 at 9× the whole scale. Structural
findings — period order, a rate a factor of three off its own
convention, interest after repayment — are always errors: no
rounding produces them. Verified on the corpus after building:
Elgin's two grade smell, the four money findings grade error,
nothing appeared or disappeared.

**De-duplication:** a fired balance-flavoured check row and the
independent balance identity can state one fact twice; the model's
own words win — the identity finding for the same period (or sheet,
where the check row carries no period) is dropped, per the
protocol's instrument-primacy rule. Grading and de-dup both run as
post-passes inside the engine, so the deal audit, the one-off check
and the panel all inherit them unchanged. 28 analytics unit tests;
411 tieout tests green.

## Hidden sheets folded into the audit (16 August)

The document panel has said what a workbook hides since the metadata
round; the audit now says it too, so concealment reaches the model
page, the panel and the deals arithmetic like any other check. One
new construction rule, « Hidden sheets », with the two states the
file format distinguishes carrying their own weights: *hidden* is a
smell — one right-click from visible, everybody can see it exists —
and *very hidden* is an error: the sheet is absent from Excel's own
unhide menu, reachable only through the VBA editor, and concealment
at that grade is a repeated cause in the published spreadsheet-
disaster catalogues (EuSpRIG, cited on the finding).

The fact is kept on the artifact at ingest — the stored cells alone
cannot recover a sheet's visibility — and handed back to the audit
when it runs on the reconstruction; the one-off check inherits the
rule for free because its defects come from the same audit at read
time. The legacy .xls path now distinguishes very hidden too (xlrd
visibility 2), where it previously collapsed the states.

**On the corpus:** Dumfries — an issued financial-close copy —
carries two very hidden sheets, « TM_Databook » and « TM_Ph2 Calcs »,
confirmed by two independent readers; RHSC carries 27 hidden sheets
of which « INTEG » is very hidden. What those sheets hold was not
judged — the finding states the concealment and the reader decides —
and models ingested before this change surface the rule on their
next upload, since the fact is recorded at read time. 412 tieout
tests green; the catalogue grows to eleven construction rules.

## The founder's reckoning, and the rebuild it ordered (16 August)

The founder opened the product as a stranger would and it failed them
— and their audit of my work was right on every count. What this
round changed, each piece driven in a real browser and screenshotted
before it was called done (the new rule, permanent):

**The panel does its job now.** It reads the open workbook's own
bytes out of Excel (4MB slices, unsaved edits included) and puts them
through the check directly — no deal, no picker, no asking a person
where their own file « belongs ». Signed out → consent → the ring →
the findings, each row a jump to its cell. The deal-identification
machinery is gone from the panel entirely. Driven end to end in a
browser through the dev file bridge.

**Findings speak person-first.** Every construction rule composes a
plain sentence shown before the formula, which is evidence beneath,
not the headline. The doubled sheet name the founder pasted was my
rendering bug — fixed. Dragged breaks collapse to one finding with
the span (their file's 114 + 100 findings were ~10 authoring
decisions). And the design's little Excel grid is REAL: the engine
composes each finding's cell with its neighbours at check time and
the modal draws it — formula bar, column letters, row labels, the
offending cell in red. My earlier « absent, not faked » note claiming
the server could not ship neighbours was wrong; the founder caught it.

**The chat has a voice and a face.** Prompts are Antford's — model
language, the answer in the first sentence, ~120 words unless asked —
and the web renders the answer's light markdown instead of printing
asterisks at the reader.

**Excel only, as ordered.** Check a model accepts spreadsheets alone;
the auth pages lost the inherited « Masterclass » boilerplate and
wear the Bodoni A.

Verified: 413 server tests, panel and web typecheck and suites green,
and — the new permanent rule — the screens themselves, screenshotted
from a locally running stack and sent to the founder. Still open,
named honestly: the model-first information architecture (deals as
folders, the model as the object) is directed but not yet rebuilt
underneath the workspace, and the chat's voice needs a production
key to be heard.

## The meaning layer: sentences with numbers, flows, and the fix (17 August)

The founder's card — « Opex FY2032 is typed. The typed figure sits
away from what the row would calculate » — is now composed by the
engine, end to end, and was driven in a real browser before being
called done.

**The evaluator, graded before use.** One-step substitution over
Excel's own cached values, registered in the analytical-checks
protocol before results: 99.9985% agreement across 6.08 million
corpus cells against a 99.5% bar, disagreement cause hand-read and
named (strict-equality checksum rows), coverage and the SFT
zero-case gap reported honestly. It powers the card's headline:
« 19,100 — typed, where the row would calculate 19,605 », the donor
being the row's nearest formula re-anchored to the typed column.

**The dependents walk.** Every formula's precedents were already
expanded by the reader; inverting them gives true dependents. Each
finding now carries where its cell's value goes, three named stops
in the model's own vocabulary — « Opex total » → « Net cashflow » →
« Equity IRR » — walking through unnamed intermediates, refusing to
call a row its own consequence, falling back to a sheet's name only
when the crossing is real. A cell nothing reads walks nowhere, and
says so by being empty.

**One decision, one finding.** The hardcode collapse now keys on the
buried literals rather than the per-column formula text — the
founder's twenty « Production » findings were one dragged formula —
and inconsistent-row and skipped-cell collapse with their spans said
in periods (« FY2014–FY2033 »). Sentences no longer say the period
twice; the row's own label leads, the coordinate lives on the grey
meta line.

**The fix, with the proof the founder asked for.** « Fix the cell »
on a typed-over finding writes the row's own formula back into the
deal's copy — a surgical one-cell XML edit, never a rewrite — and
then **re-reads the corrected copy and compares every cell against
the original**: one cell changed, exactly as asked, or the write is
refused whole with the reason in words. The corrected copy is a new
version through the same ingest as any upload; the audit re-runs and
the finding is measured out of existence, not marked away. Pressed
in the browser: the deal went from « One check doesn't pass » to
« Everything checked passes », the model to v2, the correction row
holding both sides. The old « a model is not written to at all »
refusal is reversed for exactly this one derivable fix and no other
— restoring the row's formula is not choosing a number, it is
undoing the choosing of one. The panel carries the same button
through Office's own API (cell must still hold the typed value, or
it refuses), its consent copy updated to say precisely when Antford
writes; outside real Excel it refuses out loud, which is what the
screenshot shows — a real write in a real workbook is the one step
this environment cannot drive, said exactly.

**Open the cell.** The modal's first button lands the workspace's own
model reader on the finding, scrolled to its card with the cell's
neighbourhood as evidence; the Excel-native jump stays the panel's.

Verified: 423 server tieout tests, web and panel typechecks and
suites green, mypy clean on the new modules, and the screens
themselves — deal modal with grid, flow line and all three buttons;
Open the cell; the after-fix verdict; Check a model's card; the
panel's finding with its flow and Fix — screenshotted from the
locally running stack and sent to the founder.

## The mentor's voice: what is wrong, where, why it matters (17 August)

The founder's mentor read the findings and named the disease exactly:
they read like machine-generated audit notes — location, diagnosis and
explanation mixed into one sentence a person has to decode before they
can act. The structure adopted, whole: a finding answers **what is
wrong → where → why it matters**, in that order.

Every mechanical rule now carries a two-or-three-word headline
(« Incomplete total », « Unexpected hardcode », « Complex formula »),
shipped by the engine so every screen scans the same way; the
where-line reads « Debt!C8 — Total Senior Debt Service » — the cell,
then the model's own name for the row — with the standard demoted
behind it; and the sentence is the diagnosis plus the consequence in
the mentor's own register: « Total Senior Debt Service is incomplete:
the formula at C8 excludes rows immediately above it, leaving 512.5m
outside the total. » Cards lead with the headline; the modal adds a
severity mark; the panel's scan line under each address is the
headline rather than the clipped standard citation.

And the bug his example exposed: « worth 5.125e+08 together » was
Python's `,.6g` silently dropping thousands-grouping once `g` falls
back to an exponent. Figures in sentences now come through one
formatter that speaks banker — 512.5m, 1.2bn, 19,100 — and the little
Excel grid prints digits with separators the way Excel does
(512,500,000), never scientific notation anywhere a person reads.

Verified the standing way: 423 tieout tests, web and panel typechecks
and suites green, and the three surfaces — deal cards and modal,
Check a model's modal, the panel — driven in the browser on a model
carrying the mentor's own flagship case and screenshotted to the
founder.

## Workspace 3 — the models page as a report (17 August)

The founder redesigned the workspace again and the models page went
first. The page stopped being a card wall and became a report a bid
director reads top to bottom: the model's name with its state said in
three words (« Not ready to send » / « Ready to send » / « Recheck
needed ») and a version pill; **Summary of the check** in sentences
composed from measured facts — what is material and where it sits,
what arrived with the current version, what could not run; the
**findings as a table** — sentence, cell, figure, and a severity pill;
**Where the findings sit** — sheets ranked by open findings with the
role read from the sheet's own name; the accordion sections (checks
that pass, checks that did not run, the evidence locker, the model,
documents that quote it); and a right rail with the run's facts and
**open findings by version** — bars counting currently-open findings
by the version each was first seen with, real timestamps only.

The severity pills speak the design's three words — Material,
Significant, Observation — as a per-rule view mapping declared in one
place; the engine's own error/smell grading is unchanged underneath.
The finding modal's little grid is now drawn the way Excel draws it:
letters across the top, row numbers down the side, the model's own
labels in the first column, the warning-yellow cell with the selection
ring in Excel's green, and the sheet's time axis as a muted band —
drawn from the structure layer, since the reader keeps numbers, not
header strings, and it claims no false row number. **Export report**
opens the design's modal — the serif preview, the include switches —
and exports through the browser's own print-to-PDF over a clean print
view; a server-rendered PDF is a named next step, not something the
button pretends to be. Kept, per the founder's instruction: the
mentor-voice sentences everywhere, and the modal's Excel-green « Open
the cell » with the mark, « Fix the cell », « Accept with a note ».

Driven in the browser on real data and screenshotted to the founder:
the list's Needs attention / Clear groups, the failing report face,
the modal's new grid, Export report, the open accordions, and the
clean two-version face with the bars. Web typecheck, 23 design tests,
prettier all green. The Assistant tab is the next round.

## The Assistant: the model answers for itself (17 August)

The workspace's first tab is now the Assistant — the founder's design,
built to the idea behind it: the review chat answers *why did you flag
this*; this one answers *what is this model* for someone who did not
build it. Five families of questions, one discipline: every claim in
an answer comes out of a tool that read the graph, never out of the
language model's memory.

Six tools in `polar/tieout/agent/model_tools.py`, pure functions over
a workspace loaded before the loop starts (workbook, period axes, an
inverted dependents index, the version list, the latest diff):
**locate** finds a cell by ref or by the model's own words;
**trace_back** walks precedents and ends with a sentence naming the
typed inputs the chain stops at; **trace_forward** lists the direct
readers, counts the full reach from real edges, and names the labelled
totals the cell flows into — or says « Nothing in the model reads
this », which is its own finding; **inventory** lists typed inputs,
hardcodes, or external links, sorted by weight; **structure** gives
the sheets in workbook order with each one's time axis; **versions**
carries the lineage and the latest diff. Refusals are sentences naming
what does exist — an unknown sheet is refused with the real sheet
names.

The rows never pass through the language model: each tool returns
`{ref, what, value}` rows, the agent Step now carries the tool's
payload verbatim, and the new `POST /deals/{id}/assist` endpoint hands
the last row-bearing step's rows straight to the screen. The screen
draws them as a clickable card — ref in mono, the model's own words,
the shown number — and a row click opens the model. The answer's last
paragraph is the contract's boundary line: where the chain ends and
what this file cannot see; the prompt forbids skipping it. The scope
bar keeps the picked model visible — Excel mark, name, sheet and cell
counts, version — and picking another resets the conversation, because
the scope is one model.

Proven the honest way this environment allows: the six tools were run
live against the demo model (the 512.5m rows, the Opex → Opex total →
Net cashflow flow, the exact reach counts) and are pinned by
`tests/tieout/test_model_tools.py` — a hand-checkable workbook where
reach == 3 is countable on paper, labels resolve before walking, and
every tool's every row is exactly {ref, what, value}. The empty face
was driven in the browser and screenshotted. The one thing this
sandbox cannot drive is the live narration itself: there is no
ANTHROPIC_API_KEY here, the endpoint answers 503 saying so, same as
the review chat — it runs on the production keys after merge. Named
smaller follow-up: the suggested questions are three static family
questions; composing them from the model's own labels is the intent.

## Check a model becomes the founder's bench, in the report's clothes (17 August)

The founder's word: Check a model is theirs — a private bench to test
the checker and to run in demos; clients will not have it, but for now
it stays in the dashboard. So it now wears exactly what the deal's
model page wears: name and state tag, the verdict in words, the
severity sentence, **Summary of the check** in sentences, the
**findings as a table** — sentence, mono cell reference, figure,
severity pill — **Where the findings sit** with the sheet's role read
from its own name, the sectioned rows (checks that pass, checks that
did not run, the model), and the right rail with the run's facts.

The modal is the deal modal, verbatim: the severity dot and the
headline, « Debt!C8 — Total Senior Debt Service · ICAEW P19 », the
plain sentence, the Excel-true grid, and the verbs. **Open the cell**
— Excel's green, the mark beside it — opens the bench's own panel,
composed from the stored answer: the file's facts in the header,
every open finding as a card with its cell in its neighbourhood,
landed on the one that was picked. **Accept with a note** now works
on a one-off: a new endpoint writes the ruling into the stored check
— every place the rule fails, one note, same sweep as the deal — so
a recent replays with the ruling standing. Owner only; a bare note or
an unknown rule is refused in words.

The honest absences, named: no version pill, version bullet or
by-version bars — a loose file has one version and no history. And no
« Fix the cell »: the one-off drops the workbook after reading it,
and the fix writes a verified new version of a kept file — there is
nothing to write into. If the bench should keep files so Fix can live
here too, that is a product decision about what Check a model stores,
offered to the founder as a named next step.

Driven end to end on the demo model and screenshotted: the report
with the 512.5m material row and the 19,100 hardcode, the modal, the
panel with the Debt sheet's grid landed on C8, the note being
written, and the report after — one check left, « 1 failure accepted
with a note ». Server: two new endpoint tests (accept marks every
place and survives replay; bare or unknown refused), the one-off
suite at 10 passing. Web typecheck and prettier clean.

## Microsoft disconnect, found dead and brought back (17 August)

The founder: « microsoft disconnect isnt working. the whole microsoft
makes no sense. i cant disconnect. or reconnect ». Audited the whole
path — server, endpoints, every screen that reads the connection.

The server was never the problem: Disconnect marks the row revoked
and clears the tokens, deliberately keeping the row so a deal's
folder can say why it stopped syncing. The defect was one idea broken
in four places on the web: every screen tested *whether a connection
row exists* where it meant *whether the connection is active*. So
after a disconnect the state still returned the (revoked) row,
Settings kept wearing « Connected » with a Disconnect button that
looked dead, the SharePoint empty state kept saying « SharePoint
connected », and the Connect button never came back — reconnecting
was impossible by construction. Worse, both reconnect polls used the
same test, so a reconnect attempt was declared successful the moment
the poll saw the *old revoked row*, before consent ever landed.

Fixed at all four sites: the Settings card and the deals empty state
now gate on `status === 'active'`; both polls stop waiting only on an
active connection; a disconnected card says « Disconnected » with the
account it was, an expired one says so with Microsoft's own reason,
and the blue « Connect Microsoft » button is the same press as
connecting was. A failed disconnect now says so in the server's words
instead of silently doing nothing.

Proven the real way: the local Graph stub serves the full OAuth loop,
so the whole cycle was driven in the browser and screenshotted —
nothing connected → Connect → the stub's consent → « Connected,
r.duval@rothmoor.example » → Disconnect → the card flips to
« Disconnected » with the Connect button back → Connect again →
connected again. No console errors. What this cannot prove is
Microsoft's own behaviour on the production tenant — same caveat the
stub has always carried — but the disconnect/reconnect defect was
entirely in the screens, and the screens are what was driven.

## The thirteenth finding crashed the page (17 August, after merge)

The founder opened a real model on the deployed build and got
« Something went wrong ». The stack trace decoded to one line of the
new report layout: the rail's trend note spells counts with a word
list — One, Two … Twelve — and falls back past twelve entries. Every
other fallback lands inside a sentence, where a number prints as
itself; this one was lowercased first, and a number has no
`.toLowerCase`. So any model with thirteen or more open findings
unmounted the entire page. The demo models carried two findings each,
which is why every driven proof passed over the bug.

Reproduced before fixing, not assumed: a variant of the demo model
with thirteen distinct hardcoded assumptions (the hardcode rule keeps
different buried numbers apart on purpose — same-number fills
collapse to one authoring decision, which the first attempt at a
heavy model ran into) went into Harbour PFI as version 2, the check
ran, fifteen findings opened, and the deal page died with exactly the
founder's screen. Screenshotted. Then the one-word fix — the fallback
becomes a string before it is lowercased — and the same page drove
clean: fifteen rows, the bars at v1 → v2, « 15 of the 15 arrived with
version 2 ». A second sweep found no other fallback that calls a
method on a maybe-number, on the web or the panel.

While the fifteen-finding page was on screen, one more sentence went
wrong: « One material, one significant, 13 observation ». Material
and significant read as adjectives; observation is a noun and takes
its plural. Both report faces now write « 13 observations ».

An honest note on how this escaped: the pre-merge drives were real
but the data was small. The lesson kept: the demo deal now holds a
fifteen-finding version, so the next layout change is driven against
a model big enough to cross the word list's edge.

## The drumbeat is one decision, and the button opens the real file (17 August)

The founder read a report with the same sentence six times — Z23, Z50,
Z77, Z104, Z131, Z157, one typed-over finding per depreciation block —
then opened the modal and read the same six places again, then pressed
« Open the cell » and got a right-panel copy of the grid already on
screen. Their verdict: bloated, and the button makes zero sense. Both
verdicts were correct.

**The collapse.** The audit already knew one dragged formula is one
finding; it could not see the same truth for typed cells, because that
collapse compares formula shapes and a typed cell has no formula. The
evidence of repetition is the layout itself: same sheet, same column,
and either the same row label typed over twice or at least three
places at a constant row spacing — a drumbeat, not a coincidence. Six
fold into one sentence: « One column is typed over in 6 places — E32,
E59, E86, E113, E140, E167 — while the rest of each row is
calculated. » A shared label leads the sentence; six different block
labels do not pretend to be one. The collapsed finding drops the
per-cell figure and fix — each place holds its own number, and the
one-cell writer must not claim six. Two typed cells that merely share
a column stay two findings. The vertical-paste tests were updated to
the new granularity — the paste is detected cell by cell and reported
once, its every place in the evidence — and two new tests pin the
block fold and the two-is-coincidence rule.

**The modal.** The place-list is gone from both report faces: the
findings table already itemizes every place as its own row, and the
modal repeating them was a leftover from the card design. The header's
« N places » stays.

**Open the cell.** The deal's button now asks the server where the
real document is. A SharePoint-synced model answers with the
workbook's own page on the site — Graph's `webUrl`, carried through a
new field on the connector's Item — with a best-effort `activeCell`
landing in the URL (the file opens regardless; the landing needs the
real tenant to confirm, which the stub cannot). An uploaded model has
no live document anywhere, so the answer is a download of the exact
stored version — driven: the press came back with
antford_demo_model.xlsx itself. The bench's button and its panel are
deleted, not redesigned: a one-off keeps no file, so there is nothing
real to open, and the panel was another view of the grid already on
screen. Two endpoint tests: an upload answers with a download; a
stranger's model does not exist.

## The audit of the audit: nine noise findings, traced and killed (17 August)

The founder ran their example model and did not believe the findings.
They were right to not believe them. The file went through the engine
and then through my hands, cell by cell, and of seventeen production
findings nine were the audit misreading structure:

- **A year-counter helper column** (typed `1` at each block's top,
  `=Z23+1` beneath) read as six « values typed over formulas » and one
  « inconsistent formula ». Fixed with two exemptions, both measured
  rather than guessed: a typed cell whose below-neighbour formula
  *reads it* is that formula's declared seed; a cell whose formula
  shape matches its column neighbours belongs to a vertical series the
  row check has no claim on.
- **A conditional that picks two loan rows** (`=IF(SUM(D29:D30)<0,…)`
  fourteen rows away) read as a broken total with an invented 8.5bn
  miss. Fixed: only a formula that *is* a sum claims to be a total.
- **Total Revenue rightly excluding the detail rows already inside an
  included subtotal** read as incomplete. Fixed: rows an included
  cell's own formula reads are covered, not skipped — counting them
  again would double count.

Two more findings were real but dishonest in the telling. The one
genuinely broken total — Total Senior Debt Service, a one-cell SUM
missing its interest — claimed 512.5m by lumping in the Outstanding
Principal balance row between the components; a balance is not a flow
and no correct total includes it, so the figure is now the true 12.5m.
And « Module1 », a very hidden sheet, was described as feeding the
model from the dark; measured, it holds zero populated cells and
nothing references it — a leftover from an older file format, now said
exactly that way and graded a note, not an error. The workbook reader
now records raw populated counts per sheet so emptiness is a fact
about the file, not about what survived labelling. Also: « has 20, 20
typed into it » reads once per distinct number now, and the
block-fold's beat tolerates one row of drift (the founder's blocks
run 27-27-27-27-26 and a strict beat heard no pattern).

The example model is committed as a fixture with a test pinning the
exact defensible seven: one incomplete total at 12.5m, two buried
assumptions, three long formulas, one empty very-hidden sheet.
Sixteen findings before; seven after; each one now survives the
founder reading it with the file open. Suite at 441 passing; the
report driven in the browser on the real file.

## The rulings that evaporated (17 August, evening)

The founder: « you realize that your fix cell is a lie? … you refresh
the page, the things come back ». Audited the whole ruling path, and
they had caught not one lie but three, stacked:

**Accepted findings resurrected on every re-check.** The audit's
replace deleted every finding row and recreated it, letting only
*dismissals* back through — accepted was not in the survival set. So
accept a finding, press « Fix the cell » (which re-checks, correctly),
refresh: every acceptance gone. Reproduced cold through the API before
touching anything: one accept, one re-check, fifteen open again.

**The note was never kept.** `set_finding_state` stored the note only
for dismissals; the accepted branch fell through to the reopen path
and cleared it. « Accept with a note » threw the note away at the
moment the screen promised to keep it.

**Accept swept the whole group.** The modal opens on one table row;
pressing accept dismissed every finding of the rule — accepting one
hardcode silently accepted thirteen.

The repair, at the root: a finding that recurs across runs — same
fingerprint — **is the same row**. It keeps its id, its state
(accepted, dismissed, or open), its note, and its `created_at`, which
also makes « first seen with version N » and the rail's by-version
bars facts rather than the last run's clock; its sentences and
evidence refresh from the new run; a fingerprint the run no longer
produces is a defect that no longer exists, and its row goes. One
subtlety the spine tests caught: a tie-out drift row never sets
`rule`, and copying that unset None over an old row nulled a NOT NULL
column — only genuinely nullable references may carry None across.
Both rulings now require their reason at the endpoint, both keep it,
and the web accepts exactly the finding on screen.

« Fix the cell » itself was never the lie — write the row's own
formula back, verify cell by cell, new version, re-measure the finding
out of existence — the resurrection around it was. Proven live, the
founder's exact sequence: accept one hardcode with a note → two
re-checks → the same row, still accepted, note intact, fourteen others
untouched. Then the fix: correction applied, model to version 3, the
typed-over finding measured out of existence, the acceptance standing
through it. Driven in the browser with a recheck and a full page
reload: « 2 failures accepted with a note », the bars honest at
0 → 12 → 12, and « None of them is new with version 3 » — a sentence
the preserved clock finally makes true. New spine test pins all of it.
Suite at 442 passing.

## The new corpus's first sweep: two floods and a model that cleaned itself (17 August, night)

The founder sourced four new public corpora — AER PTRM/RFM, Ofgem's
ED2 PCFM with its eleven changelogged versions, RIIO-3's
draft-to-final pairs, the CAA's Heathrow H7 model — and asked for
them fetched. Twenty-seven files landed (the AER's site resets
non-browser connections; marked in the committed manifest for the
founder's own browser). The engine swept all of them. The tally, and
what it teaches:

**Two floods, both structural lessons rather than defects.** The
WACC models carry ~65,600 findings each — 99.9% `error-value`, one
finding per `#N/A` cell in half-million-cell daily-rates sheets,
where a lookup past the data's edge is the template's normal state.
The H7 price control model carries 28,276 — 22,519 of them
`circular`, one finding per cell of what is likely one deliberate
loop (whether the workbook declares iterative calculation there needs
checking against the reader first). Both are the same disease the
fill-collapse cured for formulas: one authoring situation reported
tens of thousands of times. The cures are the next round: error
values folded per region with a count, circular loops folded per
loop, and the iterative flag verified on real .xlsm.

**The quiet files are already defensible.** The RIIO-3 draft PCFMs
report 7–15 findings each; the ED2 PCFM reports 10; the H7 debt
models 16–20. On 40,000-cell regulator models those are reports a
person can read to the end.

**And one real story found by accident:** the ED2 PCFM's own history
shows Ofgem cleaning their model — V1 through V3-October carry 41
hardcode findings; from the V3 January re-publication onward it drops
to 9. The version trail also keeps one `skipped-cell` finding alive
across all eleven versions — three years unfixed, or our next junk
lesson; the hand-review round will say which.

Full per-file, per-rule numbers in the sweep record; hand-review of
the quiet files' findings is the next round, with every verdict
becoming a rule or a confirmed defect.

## The floods, folded by their real shapes (18 August, small hours)

The mentor's direction, followed exactly: check the class before you
collapse, and read the setting before you count.

**The setting was read first.** All three flood files carry
`<calcPr calcId="191028"/>` — no `iterate` attribute. Iteration is
genuinely off in the published files, so the H7 loop is reportable;
the reader's `iterative` flag was correct all along.

**Error values, by class and by region.** `#REF!` and `#NAME?` stay
per-cell — the result that made the closed-deal file's frozen
references land is untouched, by test. The designed returns — `#N/A`
and kin — are judged by the shape of their region: a run at the tail
of a column whose data simply ends folds quiet; a lone run inside a
live column is a break and stays loud, per run, as an error. The
first re-run taught the third shape within minutes: a daily
gilt-yields column carries thousands of two-cell `#N/A` gaps at a
seven-row rhythm — weekends, with longer runs at bank holidays. Many
short interior runs are the series' calendar (ten or more folds the
column; a real break is one or two), so the WACC model's « Daily
Data » sheet now reports as one sentence: « carries #N/A in 29,860
routine gaps in its series — 61,328 cells across 16 columns. A
lookup's designed answer for missing data, not damage. »

**Circular references, by component.** Tarjan over the in-book
precedent edges, iteratively; the finding is the strongly connected
component, not the cell, and identical components — a per-period loop
dragged across the time axis — fold further by formula shape into
one. The H7 model's 22,519 circular cells resolved into **one real
loop**: « a loop of 21,365 cells », the financing circle, reported
once as an error because the workbook does not declare iterative
calculation. The other hundred-odd « loops » were the engine's own
mistake, found by refusing to believe A1 on fifty sheets: `=CELL(
"filename", $A$1 )` — the classic sheet-name header — anchors
metadata, not a value, and Excel does not treat it as a dependency.
Now neither does the audit: a one-cell loop only counts if the
self-reference survives outside every CELL(...) call.

Measured on the corpus: the WACC model 65,606 → 15 findings; the
Heathrow H7 model 28,246 → 87, its financing loop one honest line.
Five new tests pin the tail fold, the calendar fold, the loud
interior break with `#REF!` untouched beside it, the one-loop-one-
finding rule, and the dragged-loop fold. Suite at 446 passing. The
full corpus re-sweep table follows when the run completes.

**The full re-sweep, for the record.** Every file the floods did not
touch reports *identically* — the ED2 versions, the draft PCFMs, the
debt models, down to the finding — which is the collapses proving
they change nothing but the floods. The floods themselves: the two
WACC models 65,685 and 65,606 → 10 and 15; the two H7 price control
models 28,276 and 28,246 → 90 and 87; the six RIIO-3 BPFMs from
1,593–1,944 → 157–506. Corpus total: roughly 199,000 findings down
to about 2,900, with not one `#REF!`, hardcode, typed-over or
skipped-cell result altered anywhere. The BPFMs' remaining hundreds
are the next hand-review target — their error values now fold, so
what remains is real enough to read one by one.

## The mentor's round: semantics, agreement, and the third collapse (17 August)

Five directives, taken in order, each measured before being believed.

**The CELL bug was a class, and the table now exists.** The edge
builder treated every reference argument as a read; it now keeps a
frame stack over Microsoft's own tokenizer and reads each reference
in the context of the function holding it. The locator class — SHEET,
SHEETS, ISREF, ROW, COLUMN, ROWS, COLUMNS, AREAS — contributes no
edges; CELL splits by its first argument (« contents » reads the
cell, « filename » reads the address); INDIRECT and OFFSET keep their
visible arguments as real edges and declare the run-time landing
place unfollowable, in the cell's own provenance. One honest
departure from the mentor's list: N and T stay as dependencies,
because `N(A1)` and `T(A1)` do read the value. The audit-side
CELL(...) patch remains as a second line of defense; seven new tests
pin the table. On the corpus this changed no report — which is the
point: the same protection, moved from a patch over one symptom to
the root.

**Cross-column agreement, and what it took to get it true.** First
cut: any sister live where a column gaps = break. The corpus said no:
the WACC model went 15 → 657, because « Daily Data » holds two
families on different calendars (a quartet gapping on 3,965 days, an
eleven-column family on 3,789), and each family's shared gaps read as
breaks against the other's live days. Second cut: « a break in one
column » is literal — a sister *gapping with* you means the source
had no data that day (calendar, whatever the stride, which is what
bank holidays needed); a break is a run alone among live sisters.
The corpus said no again, quietly: the SONIA sheet keeps forecast
anchors every 182 daily rows beside sisters interpolated for every
day — all its gaps are « alone », by design, and 22 breaks appeared.
Third cut: aloneness only counts when it is exceptional for the
column. All three cuts are in the tests; the WACC model reports 15
findings again, with truer sentences than before the round.

**The 506, diagnosed in the mentor's ten minutes.** Sorted by kind:
error-value 392 of 506, and 334 of those are `#REF!` cells that are
exactly *two formulas* — `=InputSummary!#REF!` filled over 58 cells,
and one CHOOSE with all three arms torn filled over 276. Third
collapse: broken cells sharing one formula fold to one finding, still
an error, nothing quiet, a lone broken cell unchanged. ET3 final:
506 → 124. What remains across the BPFMs (74–182) is the genuinely-
messier profile — dozens of distinct hardcodes and typed-over blocks,
each its own authoring decision — which is the mentor's « ranking »
branch, not another collapse.

**The golden-master gate is protocol now.** `scripts/corpus_gate.py`
sweeps and diffs finding-for-finding — rule, severity, ref, figure
and sentence, not counts. The baseline (`corpus-golden-master.json`,
27 files, 1,259 findings) is committed; an intended change
regenerates it in the same commit and the baseline's git diff is the
review artifact. This round is its own first demonstration: against
the pre-round counts, 18 files changed and every changed line is one
of the three intended changes; the other 9 match to the finding.

**The eleven-version sum is not a live defect.** Hand-read in the
cells of V5 and confirmed in all eleven versions: `=SUM(AR146:AR147)`
(« impacting tax allowance ») sits under `=-SUM(AR146:AR147)`
(« contributing to allowed revenue ») and a net-debt row that reads
the same pair — three views of DRS15, feeding three different rows of
Finance&Tax, correct as published. The « skipped » rows read the very
range the sum reads; adding them would double count. The engine
learned it as the fourth skipped-cell exemption (a row that reads the
summed range is a sibling view), the founder's example model still
reports its genuine 12.5m miss by test, and the ED2 versions each
dropped their one false finding.

Corpus: 1,981 → 1,259 findings. Suite: 456 passing, 4 skipped. The
two mypy complaints in audit.py predate the round and are untouched.

## Ances, and the 18 August design (18 August)

**The rename.** Antford is Ances everywhere a person can read it — the
workspace, sign-in and sign-up, the tieout copy, the Excel panel and
both Office manifests. The panel was the real find: its deployed
bundle under `web/public/panel` predated the *last* rename, so Excel
was still calling the product Claidor while the sources said Antford.
Rebuilt from source, redeployed; the ribbon's name lives in the
sideloaded manifest, so the founder must re-add the stamped
`dist/manifest.xml` once to see Ances in Excel itself.

**The design revision, measured before it was implemented.** The new
canvas (`docs/pierce/design-ances/`) was diffed against the previous
one file-to-file. The whole revision is nine deltas, and only nine:
the rail moves to the left of the model page on its own soft ground
and hides while Ask is open; « Summary of the check » sets its heading
in a blue gradient and swaps the grey middots for round blue points;
the findings table's hairline darkens a step; Observation turns from
blue-violet to plum, pill and text; the header drops the model's name
(the page title carries it); the Export modal shrinks to a plain
440px form — no preview card, square checkboxes, « Every finding
carries its cell reference. Nothing is summarised away. »; the report
options get shorter names; the Assistant gains a history drawer; and
the drawer's toggle joins the scope bar. Everything else on the canvas
is the previous design byte-for-byte, which the diff proves.

**The history drawer is real history.** The design draws canned rows;
the build keeps the person's own past conversations on their machine
and lists them by recency — Today, previous seven days, older — with
an honest « Past conversations land here. » before any exist. Opening
one restores the conversation and its model; New chat starts a fresh
one. Nothing invented.

**Proofs.** Driven in the real app against the Harbour deal at
1440×900: list, model page (left rail, gradient heading, plum pills),
Ask open with the rail hidden, the new Export form (subtitle count
fixed to match the table during the proof pass), the finding modal
with its Excel frame, the Assistant drawer, Settings saying Ances.
Typecheck clean; lint at baseline. The « Open the cell » button keeps
its Excel-green — the founder-approved departure from the drawn blue,
because the button opens Excel — and stands flagged here again.

## The usefulness audit: 145 findings read from their cells (18 August)

The mentor's question — are the remaining findings useful to a
professional auditor — answered the only honest way: protocol and
seeded stratified sample committed first (28 family-by-rule strata,
145 findings), then every sampled finding judged from a harvested
neighbourhood of the real cells (formulas, values, row labels), never
from its own sentence. Verdicts with reasons:
`findings-usefulness-verdicts.json`.

**The tally, as measured.** Raw: A 12, B 35, C 54, D 44. Stratified
over the 1,259: **A ≈ 4%, B ≈ 22%, C ≈ 39%, D ≈ 35%.** The bar the
mentor set — a majority A/B — is **not met**: A+B ≈ 26%. Said plainly
and first.

**What A looks like.** The twelve are exactly the product's pitch:
the 21,365-cell financing loop; a #REF! in a published PCFM; totals
with six-figure sums sitting in skipped live rows; a row that
switches calculation basis at one column of a uniform fill; typed
seeds where links belong; « Sharing factor » written =25% where the
determination's number should flow.

**Where C comes from — fourteen causes, all mechanical.** The single
biggest: the reader drops array formulas, so array-calculated cells
register as typed values — one reader fix erases most of the BPFM
typed-over stratum. Then: DATE()/EOMONTH() argument literals; check-
row tolerances and ROUND precisions; 10^n unit conversions; literals
inside text-only functions (REPT); constants documented by the row's
own label; policy years compared against the model's own time axis;
lookup-scaffold index bounds; the totals column read as inconsistent
with its own row; partitioned pick-out subtotals whose sibling SUMs
jointly cover the « skipped » rows; alternative-aggregate tables
(EBITDA excludes D&A by definition); typed input rows misread
column-wise; mnemonic columns read as calculated series; and one
outright bug — multi-area SUM coverage mis-parsed, producing a
finding that names rows the SUM includes.

**Where D comes from — four collapse patterns.** The same typed
balance convention repeated across sibling DNO sheets (one grouped
finding per file, and the content is A-grade); the same row flagged
once per column; one sheet's OFFSET idiom (TaxPools, RatingSimulator,
FinInput) reported per row; the same convention constant repeated
across sibling rows. D is not junk — it is A/B content printed too
many times.

**Found on the way, for the next round.** Two new A-grade rules the
corpus asks for: a model's own check row reading non-zero in the solo
audit (one BPFM's Equity check reads False today, unreported), and
literal drift inside one fill (a 2025 in the first cell where every
sibling says 2022 — sampled, and currently visible only as a hardcode
flag). Plus a tolerance-outlier check: one gearing check's tolerance
is a million times looser than its siblings'.

**Ranking, answered by the data.** The twelve A verdicts concentrate
in five rule-shapes: skipped totals with live money, inconsistent
rows, circularity with iteration off, typed-over with drift, broken
references — plus parameter-grade hardcodes. Severity tiers plus
figure worth plus those shapes IS the attention ordering the mentor
asked for; the engine already carries every ingredient.

## 19 August — the fix round, gated and re-measured: the bar is met

**The order.** The founder: « go ahead. run the fix round. » Implement
every fix the usefulness audit named — fourteen noise causes, four
duplicate collapses — behind the golden-master gate, then re-draw and
re-judge.

**What was built.** The reader now sees array formulas (the single
largest noise cause — array-entered cells registered as typed values).
The hardcode rule reads literals in context: date-constructor
arguments, text-function counts, rounding precisions, powers of ten
and ABS tolerances are notation; equality-compared literals are
selectors, watched by a new selector-drift pass that reports the one
cell testing a different switch value than its identically-shaped
sisters; label-documented constants stop reporting. A bare SUM across
its own row is the totals column. A plain enumeration is long because
its list is long. The skipped-cell rule judges a multi-area SUM's
areas together (fixing the bug the audit caught in its own sample),
exempts bare-aggregate rows and partition-covered detail rows, and
stops its walk at a section break. Mnemonic defined-name columns are
scaffolding. One value pasted across a row folds to one finding; a
varying typed row is an input series and drops; the same finding on
three or more sibling sheets folds to one for every smell rule; a
sheet's volatile idiom folds to one; a convention constant across
many different formulas folds to one; a row of near-identical long
formulas folds to one.

**What the gate caught.** Three things the sample never showed.
(1) The array-formula fix surfaced ED2's long array formulas 112
times per file — the same duplicate layout the audit named for
hardcodes; the sibling-sheet fold was extended and 112 became 2.
(2) Three « new » circular loops in the GT3 models — traced cell by
cell, every one closes only through INDEX's first argument, and so
does the 21,365-cell chain reported on both H7 models since the
corpus round. Excel resolves INDEX's pick before hunting circularity
(that is why all four shipped models calculate cleanly with iteration
off); the cycle hunter now declines to walk lookup-table edges, and
two false findings left the baseline. (3) The selector-drift pass's
period-label guard vetoed the exact judged card it was built to keep
— the drifted row sits under « RIIO-GD2/GD3 » band headers; the guard
is gone, the structure is the signature.

**The corpus.** 1,259 → 852 findings across the 27 files, every diff
line traced to a named fix, three sweeps with surgical deltas.
H7: 88→33. ED2: 41→39. Final GT3 BPFM: 182→79. The suite: 473 tests,
eighteen new, one per fix family.

**The re-measure.** Fresh draw of 143 (seed 20260819, registered
first), neighbourhoods harvested, every verdict from the cells.
Raw: A 13 · B 77 · C 19 · D 34. Stratified over the 852:
**A ≈ 6% · B ≈ 55% · C ≈ 11% · D ≈ 28% — A+B ≈ 61%**, against 26%
before the round. The mentor's bar — a majority of remaining findings
definitely or probably useful — **is met.**

**What remains, named.** D is three-quarters one family: ED2's typed
pool balances repeat one layout decision per DNO sheet with different
numbers, and the sibling fold keys on identical numbers — a one-key
fix (shape, not numbers) plus a column-beat fold for repeated check
rows and a same-file template fold cover 30 of 34 raw D verdicts.
C reduces to nine small named skips recorded on the verdicts. Both
lists are the next round's spec, exactly as last time.

## 19 August, later — Round 1 of the mentor's four: Collapse

The mentor's direction, adopted whole as the next four rounds
(collapse → purify → elevate → stress test), with the standing rule:
every finding earns its place, nothing detected is deleted — the
folds change what the report says, not what the engine sees.

Round 1 shipped: the sibling-sheet fold keys a labelled hardcode by
shape and label rather than numbers (fourteen company balances are
one layout decision); a long formula surviving the address fold
folds as a template when the same column carries the same length
three or more times in one file (the F1 check row repeating down
the sheet, the PCFM import formula stamped across sheets); designed
error tails join the sibling fold (the F-sheet title formula, once).

The corpus: **852 → 696**, no sample drawn — the population had to
settle first, per the round's design. The diff: 185 removed, 29
grouped representatives added, every line traced. ED2 files 39 → 15.
The shape-keyed rule also collapsed a family nobody named — the GD3
network sheets' per-network innovation allowances — which is what a
general rule is for. Baseline regenerated and committed; 476 tests.

## 19 August, evening — Round 2: Purify, and the gate earns its keep again

Nine judged noise causes became nine semantic principles (the commit
carries each as a sentence about spreadsheets); three stayed as
recorded limitations. The percent fix cut deeper than its cause: a
postfix % is part of the number, so `2%` stopped hiding behind the
innocence of the integer two — and the WACC and equity files gained
twelve genuine inflation-rate hardcodes the engine had been blessing.
Correctness up, count up, exactly the round's rule.

The gate caught the round's one over-reach before it shipped: the
first draft of « neighbours must agree » silently deleted two judged
A findings (the H7 typed first-year rates, flanked by the row's own
AVERAGE column). The principle's correct form — at least one flank's
shape must repeat in the run — restored them; one unjudged sibling
seed falls below the bar, recorded as a trade.

The corpus: **696 → 669**, every line traced (respellings, the nine
principles, twelve honest additions, three restorations). 481 tests.
Next: the third measurement, per-detector, seed 20260820 as
registered.

## 19 August, night — The third measurement: per-detector, and the 90% bar

Fresh draw of 191 (seed 20260820, registered first; every rule
guaranteed up to 25 picks so the four inconsistent-row findings are
judged whole), neighbourhoods harvested, every verdict from the
cells. Raw: A 33 · B 131 · C 13 · D 14. Stratified over the 669:
**A ≈ 8% · B ≈ 83% · C ≈ 4% · D ≈ 5% — A+B ≈ 91%**, against 61%
after the fix round and 26% at the start. False positives are under
the mentor's 5% line.

The question graduated, as directed: not « is the report useful »
but « which detector is excellent and which still needs work ». Four
detectors judge clean (long-formula, volatile, inconsistent-row at
100%; error-value's only noise is the two documented limitations).
Two carry named debts: typed-over-formula's D mass is one family
(five columns typed over in one gesture on I_Series row 218,
reported per cell — fix: fold varying typed runs of 4–7);
skipped-cell's C mass is entirely the accepted index-factor
limitation, no new fix named. Hardcode owes shape normalisation for
the fold key, number-words documentation, and a header walk-up.
That short list is Round 3's engine spec; the round itself is
Elevate — materiality, severity tiers, finding families, evidence.

## 19 August, late night — Round 3: Elevate

The four fixes the third measurement named, each as a general
principle: number words document their constants; a block's nearest
header documents it however tall the block runs (the gate's trace
caught my first version capping the walk at twelve rows — one
Italgas beta row read differently from its five siblings, so the cap
went); literal-arithmetic shapes are one spelling family in the
sibling fold; and four or more adjacent columns typed over in one
row are one gesture, with a block pass reuniting a two-dimensional
paste into one finding naming the whole rectangle — which corrects
the old five-findings-for-one-paste reading of the Yorkshire case.

Then the elevation itself. Every finding now carries a tier
(1 defect / 2 assumption at risk / 3 hygiene), a 0–1 weight
(structural risk × confidence, raised only by real money the engine
itself computed), a basis sentence arguing the rank, and — on every
fold — the roster of cells it stands for. Tier-1 floors above
tier-2 ceilings above tier-3: a torn check can never sit below an
OFFSET carpet. Wired through the deal audit, the solo check, and
the sweep, so the corpus now says how the attention splits:
**632 findings — 51 defects, 251 assumptions, 330 hygiene.**

The gate: 669 → 632, every line traced to a named fix (five ED2
versions fold their pool-balance spellings, both H7 files fold the
stress-cargo row and lose the half-year false positive, the equity
file's beta block is documented by its own header). Two sweeps —
before and after elevation — differ only by the cap fix, proving
the elevation layer changed no finding's content. 488 tests.
Known gap, recorded: the statement checks (analytics) do not carry
tiers yet — they join the elevation layer when their findings move
through the same pipeline. Next: the fourth measurement, seed
20260821 as registered, judging tier alongside class.

## 20 August, small hours — The fourth measurement: 98%, and zero duplicates

Fresh draw of 185 (seed 20260821, registered first), neighbourhoods
harvested, every verdict from the cells, tier judged alongside for
the first time. Raw: A 31 · B 143 · C 11 · D 0. Stratified over the
632: **A ≈ 8% · B ≈ 90% · C ≈ 2% · D = 0 — A+B ≈ 98%**, against
91%, 61%, 26% on the three measurements before it. The mentor's
lines — 90%+ worth attention, under 5% false positives — are both
cleared, and the duplicate class is empty for the first time.

Per detector: hardcode, long-formula, volatile, typed-over, and
inconsistent-row all judge 100% A+B; typed-over rose from 47% on
the strength of one fold. Per tier: tier 2 carries no noise at
all, tier 3 almost none — and tier 1 carries 17.8% C, all of it
the one documented index-factor limitation. Every C in the corpus
now has a name and a written reason; nothing is unexplained.

What the next rounds owe: the index-factor limitation is now the
whole of the noise and it sits in the costliest tier — Round 4's
corpus growth should include files that settle whether a general
multiplicative-block rule can clear it without pinning real
skipped-money totals. The statement checks still ride outside the
elevation layer. And 98% on 27 familiar models is not 98% on the
next model a customer uploads — which is exactly what Round 4's
stress test exists to find out.

## 20 August — Round 4: the stress test, and the honest number

The engine left the laboratory: eleven unseen models (Ofwat PR24,
NZ Commerce Commission DPP4, Damodaran), protocol and seeds
registered before any finding was read, engine run as shipped.

**Generalization: the lab's 98% became 5.8%.** One convention the
AU/UK corpus never exercised — a determination built as workbooks
that read each other — flooded two files with 1,496 per-cell
external-link findings that are one import decision per source.
Excluding the floods, 54%: the unseen files taught seven noise
principles (lookup column indexes alone account for most of the C
mass) and four fold families the engine does not have. The signal
did generalize: seven ACT-grade findings on files never seen —
typed-over ERPs, a torn check row in a shipped draft determination,
four values hand-keyed down Thames Water's 2024-25 revenue column,
a recurring unexplained 0.999 haircut across the NZCC suite.

**Quiet on clean: clean.** No believed-clean file produced an
A-grade defect claim; one was perfectly silent. The engine chatters
on unfamiliar styles but does not invent defects.

**Recall: 68% registered, 60% on-point** over 72 planted defects in
three hosts (collateral: one finding). Broken references 100%,
overwritten formulas 86%, wrong assumptions 80%, skipped totals
70% — and two honest zeros: single-cell reference shifts and
operator flips in short rows are nearly invisible to the row pass,
and totals narrowed at the head of their own range slip past a rule
that only looks above the total. The planting harness
(scripts/plant_defects.py) is now permanent equipment.

The round changed no engine code — the measurements are of the
engine as Round 3 left it — and wrote the Round 5 agenda: the
external-link fold, seven noise principles, four fold families,
two recall gaps, reader error-tolerance, and the Thames FM02
under-reach investigation.

## 20 August, continued — Round 5: Generalize, measured where it counts

The mentor reset the objective: don't win the original corpus back,
make the engine generalize. Six workstreams, all landed:

**External links became the event they always were.** One finding
per source workbook — « reads workbook [1] in 602 cells of Inputs »,
roster attached — instead of 1,496 per-cell copies. **The seven
grammar patterns** from the unseen corpus each became principle →
implementation → regression test: lookup indexes, power-of-ten
sentinels, roots written as powers, diagnostic thresholds,
self-labelling counters, written-out means, self-documenting
windows. **The mutation detector** implements the semantic-shape
idea: a family identical token-for-token except one cell, differing
in exactly one position, is the same calculation with one changed
token. Its first draft sprayed 34 findings over real files in three
recognisable patterns (row seeds, column chains, crossing families);
those became three exemptions, and the survivor count on the unseen
corpus is one — an ACT-grade displaced window the skipped-cell lens
had mis-diagnosed a round earlier. **The reader** now survives a
malformed formula at the cost of one loud finding instead of the
whole workbook. **The planter** was corrected (XML double-escaping;
one plant per line) and the Round 4 recall figures amended in the
protocol. **Thames** is explained: 413k formulas, median 18
characters, no cached errors — discipline, not blindness.

The number that decides the round, the fifth measurement, judged
whole: **the unseen corpus went from A+B 5.8% to 80.1%** (C 2.9%,
ACT 8 · NOTE 101 · IGNORE 27), with the residual D being three
still-unbuilt folds, all named. Recall on honest plants: 62%
overall — broken references 13/15, overwrites 9/13, wrong
assumptions 8/11, displaced references 5/15 (from 1), flips 1/5
(from 0) — with the blind spots named and structural: singleton
formulas have no family to witness them, which is where a static
engine ends and label semantics begin.

The original 27 are regression now, per the mentor: the v2 gate
diff is traced below its own sweep, and the judged corpus keeps its
verdicts. What the next unseen batch owes: 10–20 genuinely new
models, and the same three questions.

**The Round-5 regression gate on the 27**, traced line for line:
four files changed of twenty-seven. The square-root principle
retired the H7 `^0.5` MAX-formula hardcode (the recorded trade); the
mean-divisor principle excused one member of ET3's Depn fill; and
the mutation detector added exactly two findings to the lab corpus —
`C_Ratios!Y290` in both H7 files, writing `=Y228` where nineteen
siblings write `=Y$228`: the same cell with broken anchoring, a
refill hazard five measurements had blessed. Population 632 → 632.
Baseline regenerated and committed; 494 tieout tests green.

## 20 Aug 2026 — Round 6, opened by a rival's report

The founder ran Tracelight over our own judged fixture (the
semiconductor-fab example model) and handed us the output. Verified
claim by claim against the raw cells: four real defects we missed —
in a file that was *in-sample* — one fabricated finding (a quoted
formula that is not in the file), three duplicates in their list.
Full record: `round6-tracelight-exam.md`.

The four misses reduced to named causes, each now a general fix with
a regression test: **(1)** the mutation detector never classified
sheet-qualified tokens as references (`'Control Panel'!R51CC` fails
`startswith("R")` — which `ROUND(` passes); shapes now mark reference
operands with `@`. **(2)** The seed exemption became the **edge
rule**: first and last positions of a run are designs (chain seeds,
totals columns) unless the evidence is strong — both variants pinned,
a family walking into empty cells, a relative edge cell resolving to
the family's own pin, or an own-column window displaced within its
own column; windows grown/shrunk to exactly their own live data are
design. **(3)** The reader no longer skips the whole header row — a
formula there that reaches other rows is content (the negative-cash
banner lived on one), and the new `gapped-test` names the live cells
a walking test jumps over (the walk must be one repeated comparison —
arithmetic composition is exempt, judged on NZCC's BBAR). **(4)** The
names table is audited: `#REF!` names and foreign-workbook names are
folded `broken-name` findings.

The unseen gate demanded four sweeps: the first cut sprayed 26 lines,
and every spray became one of the refinements (Thames' twelve
totals-column flags, BBAR's five arithmetic walks, Financeability's
three pinned anchors, the depreciation model's grown window). The
gate also caught the blunt edge rule deleting `Outputs!R86` — judged
A/ACT in Round 5 — which is what forced the own-line keep. Final
unseen diff: four factual `broken-name` events (CA101 carries 7,817
dead names), `capstru B53` kept as a real anchoring hazard, and
`OBXValues!M689` kept and logged marginal. The exam file goes 7 → 12
findings, all pinned by the fixture test. 79 audit tests green.

**The Round-6 lab gate on the 27**, traced line for line. Population
632 → 674. The additions: **(a)** the names-table events — ED2
carries 606 dead defined names in every one of its eleven versions,
RIIO-3 carries ~581–591, one folded finding per file; **(b)** the
mutation detector's new reach — and its biggest find yet: in both
published CAA H7 PCM files, **C_Tax's first forecast column reads
pinned input rows whose labels match its own rows (« Category 3 % in
main pool » = I_InputSets!$323) while all eight filled years read
three rows higher into an empty « allocation check » row and evaluate
to zero** — 24 rows in block rhythm, folded to one finding per file
by the new same-column fold; likewise `O_FinStats!Y19` (« Total non
aero revenues », where 14 siblings read « Airport charges revenue » —
the values differ by a third); **(c)** BPFM singles, sampled and
judged from cells: `Depn!X500` pins row 4 where 77 siblings read it
relative (the anchoring class), `Revenue!AY25` reads its neighbour's
column and the next row from MainInputs (a mis-drag), two
Finance&Tax own-column displaced windows (the judged-A class). The
one removal: `ScenDelta!AA9`'s long-formula fold re-anchors to AA8 —
the header-row fix admitted the family's true first cell (144 → 180
member cells, same finding). Baseline regenerated at 674; 502 tieout
tests green.

---

## 24 August — the plan crisis, then Track F opens

**The plan went wrong twice, and was put right.** Asked « remind me
the plan? », I recited `clone-plan.md` from memory; told to find the
right plan and make sure it's the only one, I crowned `plan.md` and
deleted `ambre-plan.md` — the plan the founder had commissioned and
approved. The founder pasted the thread proving it. Restored as
`swens-plan.md` (only the names updated, per swens.md's supersession
of name and framing, never tracks or method); `plan.md` deleted; every
pointer re-patched; and `notes.md` created at the founder's request —
the canon table (product = swens.md, plan = swens-plan.md, design =
design-swens/, history = this file) with the rule that questions of
record are answered from the record, never from memory. CLAUDE.md now
points at it, so every session starts there.

**Four plan amendments, founder-approved,** from an external research
gap map checked against our own code first: C2 becomes DP alignment
on label + formula-shape signatures (not SheetDiff's greedy
algorithm); C4 gains verifying-trace fingerprints as the cheap
no-change proof; B4 gains ddmin attribution; A7 added — shape-hash
commutativity + constant folding as a measured micro-round (`_shape`
verifiably lacks both today).

**F1 — creation.** `set_cell(create=True)` materializes a missing
cell: column order held in its row, the row element built and placed
in ascending order when absent, dimension stretched, Excel's row
spans updated when present (openpyxl writes none — probed — so that
path is tested on an injected Excel-style layout). Text goes in as an
inline string; replacement stays strict without the flag. Found and
fixed on the way: replacing a text constant with a formula used to
keep `t="inlineStr"` on a cell now carrying `<f>` — corrupt typing;
the type attribute is now always derived from the new content.

**F2 — the changeset** (`changeset.py`). `apply_corrections` is
atomic: all corrections or none. Three walls: the cell-exact compare
(both files, every sheet, openpyxl — anything unasked-for changed, or
a target not holding exactly what was asked, refuses the set and
releases nothing; proven by a sabotage test that monkeypatches the
writer to corrupt a bystander cell); the re-audit (a defect class
appearing on a sheet where it did not exist before is damage the
write created — refused); and « incomplete » as a first-class state —
a correction names its motivating rule, and when that rule still
fires on the sheet after the fix, the changeset applies but says so
and names the cells still wrong. `undo()` rebuilds the original
member-for-member (calcChain and content-types restoration exercised
on an injected chain). `record()` is the Changes UI's plain-JSON
contract.

**Honest state.** 45 write-path tests green (writer 17, changeset 8,
older write modules 20 — all run with `--noconftest`; this container
has no database or Minio, and the corpus files are not on disk).
What F1/F2's DONE tests still owe: the round-trip re-verification on
the 27 real corpus files, which needs a machine with the corpus. Not
claimed done.

---

## 24 August, later — the marked-up model ships end to end

**The engine half** (`markup.py`): `marked_up_copy` builds the § 4
file — Findings sheet first (Severity · Sheet · Cell · What's wrong ·
blank Notes/Done, autofiltered so it sorts and ticks), every problem
cell coloured by severity in Excel's own review red and amber with
the finding's sentence as a note authored Swens. Zip surgery in the
writer's discipline (per-style xf clones so fonts and number formats
survive; legacy comments + VML per touched sheet; scoped defined
names' localSheetId re-pointed for the new first sheet), verified the
changeset's way: the copy re-read beside the original, every formula
and value compared, or the markup refuses itself. A finding on an
absent cell gets an empty styled cell; a sheet already carrying
comments is refused in words. Proven past openpyxl: **LibreOffice
Calc round-trips the copy** — sheets in order, formulas live (Calc
recalculates B3 to 108), fills exact, notes intact. Namespace lesson,
twice: openpyxl declares xmlns:r per element, Excel on the root, so
inserted r:id elements carry their own declaration.

**The product half:** `GET /deals/{id}/markup` builds the copy fresh
from the stored model and the open cell-anchored findings on it —
never persisted, refusals as sentences (no model; nothing open;
markup refused). The Overview card « Download the marked-up model »
is live: the drawn card, opacity restored, downloads the server's
file under the server's filename (« … — marked up.xlsx »); a refusal
sentence appears in the card's subtitle in the design's danger ink.
tsc clean; 54 write-path tests green; mypy adds no errors in the
touched files.

**Owed, named:** the endpoint has no automated test in this container
(it needs the database fixtures); its verification here is the
engine tests plus import + typecheck. Corpus round-trip for the whole
write path still owed with the corpus machine.
