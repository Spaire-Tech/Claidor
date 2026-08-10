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
