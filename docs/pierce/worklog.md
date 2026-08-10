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
