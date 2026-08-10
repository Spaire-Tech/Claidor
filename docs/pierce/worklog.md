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
