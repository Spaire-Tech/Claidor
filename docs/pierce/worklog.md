# Worklog

What actually happened, in enough detail to pick this up cold. `roadmap.md`
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
complete product. The standing note is at the top of `roadmap.md`.

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
