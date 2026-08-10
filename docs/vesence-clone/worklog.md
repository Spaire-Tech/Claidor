# Worklog — Phase 1

A record of what actually happened, including the parts that went wrong.
Written as the work was done rather than reconstructed afterwards.

---

## 2026-08-09 — Phase 1, first day

### Objective

A Word add-in that checks a document and shows the findings, with fixes
landing as native tracked changes.

### Initial state

A backend of ~21,300 reusable lines, no add-in, and a defined-term engine
built the same day with five checks and its own vocabulary.

### Investigation

Read vesence.com directly, having previously reported it unreachable. It
was not: `WebFetch` has a domain allowlist, and a plain HTTPS request
returns 200. **I reported a tool's restriction as a fact about the world
and reasoned from press coverage for two documents.** All thirteen pages
are now checked in under `product/`, and `spec.md` records five things I
had wrong.

The most useful single artefact on their site is a screenshot of the Check
panel. It publishes their defect names, their four severity buckets, and
the counts for a real document.

### Decisions

1. **Adopt their vocabulary exactly** — Undefined term, Unused definition,
   Multiple definitions, Unordered definitions. A clone whose findings can
   be compared to the original without translation is worth more than one
   with better names.
2. **Delete `used_before_defined`.** It reported every term named in the
   recitals of a correctly drafted contract. They do not have it either.
   Deleting beat patching.
3. **Build `undefined_term`**, which they rank Critical and we did not
   have. Labelled *probable*, because it is the only check that cannot be
   exact.
4. **Only a wrong case gets a Fix button.** Everything else needs a
   drafting decision.
5. **Requirement set 1.3 in the manifest, probe for 1.4 at runtime.**
   Requiring 1.4 would stop the add-in loading at all on an older host.

### Changes

- `polar/redline/terms.py` — taxonomy, severities, undefined-term
  detection, alphabetical ordering, three performance rewrites
- `polar/redline/{endpoints,schemas,auth}.py` — `POST /v1/redline/check`
  and `/check/document`
- `polar/api.py` — router registered
- `clients/apps/word-addin/` — manifest, task pane, panel, Office.js layer
- `tests/redline/` — 77 tests; `word-addin/src/locate.test.ts` — 19

### Problems, and what caused them

**The undefined-term check produced false positives on its first run.**
`Delaware` and `Washington` — states, capitalised, used twice. No stoplist
can enumerate states and company names. Root cause: I was matching
capitalisation and nothing else. Fixed by requiring a *definite
determiner* before the candidate: « the Long Stop Date » is a term, « in
Seattle, Washington » and « means Acme Operating Co. » are not. That one
rule removed four false positives.

**The alphabetical check reported a correctly alphabetised contract.** It
was counting the parties clause — « Acme Inc. (the "Seller") » — as
entries in the definitions list, so Seller and Buyer came before Accounts.
Root cause: definitions did not record *how* they were written. They now
carry `kind`, and the list excludes naming asides and repeat definitions.

**`If` and `In` reported as undefined terms.** Sentence-start detection
looked for punctuation or a newline followed by whitespace, and a clause
number sits in between: « 3.2 If the Conditions ». The capital after it
looked mid-sentence. Fixed by consuming the clause number.

**5.7 seconds on a document the size of their own example.** Profiled
rather than guessed. Three algorithmic mistakes, all invisible on short
inputs:

| Mistake | Cost |
|---|---|
| « Is this offset inside a definition? » as a linear scan, per candidate | 16 of 20 seconds, 62M comparisons |
| Occurrence index computed by walking from offset zero | 2.6M string searches |
| One regex pass per defined term | The one a repeated fixture cannot catch |

The third is the interesting one. The repeated fixture has 14 distinct
terms and looked fine after the first two fixes; a *realistic* agreement
has ~170 and still took 5 seconds. Measured after: 0.38s and 0.72s.

**I broke 29 tests with a name collision.** The new occurrence helper was
called `occurrences`, shadowing a loop variable already called that. The
error said exactly what it was.

**A test of mine was wrong, not the code.** `test_a_sentence_opener_is_not
_part_of_the_term` used « the Purchaser », which genuinely *is* an
undefined term in that text. Fixed the fixture, not the engine.

### Verification

- 77 backend tests, passing in random order. Ruff and mypy clean on
  `polar/redline`; the 258 errors under `polar/api.py` are the existing
  baseline, identical before and after — checked by stashing.
- 233 tests across `redline`, `lecteur`, `corpus`, `librarian` — no
  regression from editing `api.py`.
- The engine returns **exactly** the five findings in their published
  screenshot, in the same three buckets, on a document built to contain
  those defects and nothing else.
- The endpoints are tested against the real app: 401 anonymous, 403
  without scope, 413 oversized, 415 unreadable upload, 200 on a real
  `.docx`, and offsets asserted to index the submitted string.
- 19 add-in unit tests; TypeScript clean; production bundle builds.

### Remaining uncertainty

**The add-in has never run in Word.** There is no Office host here and no
honest way to fake one. Reading the document, selecting a finding and
applying a tracked change are written and unproven. The README has the
checklist.

**The undefined-term rules are tuned against fixtures I wrote myself.**
This is the weakest thing in the work. `MIN_SIGHTINGS`, the determiner
rule, the indefinite-article rule and the opener list were each added
because they removed a false positive from *one* share purchase agreement
that I authored. They have never met a real third-party contract. Rules
fitted to one document tend to be rules about that document. Until this
runs against agreements somebody else drafted, the false-positive rate is
unmeasured, and the honest description of « zero false positives » is
« zero on the two documents it was tuned on ».

**« Agreement » in the SPA fixture is my judgement, not arithmetic.** It
is reported as an undefined term because the fixture uses « this
Agreement » throughout without defining it. I believe that is a real
defect. A lawyer might reasonably say the title of the instrument needs no
definition.

### Next

1. Run the add-in in a real Word and work through the README checklist.
2. Get three real agreements from outside and measure the false-positive
   rate properly.
3. Cross-references and numbering — the rest of the Check panel's
   categories, and still unbuilt.

## Assumption ledger — Phase 1

| # | Assumption | Status | How it gets settled |
|---|---|---|---|
| 11 | Word's search order matches our occurrence index | **Unresolved** | Step 6 of the README checklist |
| 12 | `body.paragraphs` joined by `\n` equals what we submit | **Unresolved** | Step 5 of the checklist |
| 13 | The undefined-term rules generalise beyond my fixtures | **Unresolved, and the weakest link** | Three third-party agreements |
| 14 | `changeTrackingMode` refuses rather than silently no-ops when unsupported | **Unresolved** | Step 7 of the checklist |
| 15 | 4M characters is a sane ceiling | [estimate] | Their example is ~650KB, so 6× headroom |
| 16 | Matching case on every search is right | [verified by reasoning] | A case-insensitive search would select the correctly-cased occurrence and show the reader nothing wrong |

---

## 2026-08-09 (later) — a note that will save someone an hour

The container's development services stop. When they do, `pytest` reports
**194 errors** across the redline suite, which reads exactly like a code
regression and is not one — the session fixtures need Postgres, Redis and
Minio, and none of them announce their absence usefully. The first error
in the traceback is a `ConnectionRefusedError` from `urllib3`, eleven
frames deep.

Docker is not available in this container, so `docker compose up` does not
work. The services run as ordinary processes:

```bash
pg_ctlcluster 16 main start                     # Postgres
redis-server --daemonize yes --port 6379        # Redis
MINIO_ROOT_USER=claidor MINIO_ROOT_PASSWORD=claidorclaidor \
  minio server /var/lib/minio --address :9000   # S3
```

**The Minio credentials are the trap.** The test fixture in
`tests/fixtures/file.py` authenticates with `settings.MINIO_USER` /
`MINIO_PWD` — `claidor` / `claidorclaidor` — and *not* with
`AWS_ACCESS_KEY_ID`. Start Minio with the AWS pair and every test fails
with `InvalidAccessKeyId` while a direct boto3 call succeeds, which is a
confusing hour if you do not know where to look.

Minio must also be started detached properly; backgrounding it with `&`
inside a tool call gets it reaped when the call ends, and the port then
looks free while a zombie still answers on it.

---

## 2026-08-09 (later still) — the fork landed, and what reading it changed

Forked `Vaquill-AI/ms-word-addin`. The roadmap said the decision needed an
hour of reading their source against four questions. It got that, and three
of the four answers were not what the README implied.

**1. Are their checks deterministic or a model call?** Deterministic —
`src/lib/defined-terms.ts` is 188 lines of regex, entirely client-side. So
the two engines are not duplicates, they are the same *kind* of thing at
very different depths: three defects against ten, no severities, no
certainties, no offsets. Ours replaces theirs; the panel is what we adopt.

**2. How coupled is it to their backend?** Less than expected. The
community build routes every call through a local shim, so the coupling is
one function (`request`) with a branch in it. Our routes go through the same
function, which is why there is no second HTTP stack in this fork.

**3. Is the code worth living in?** Yes, with a caveat: 40,000 lines, 30
feature areas, **zero tests**. The Office.js layer is careful in the way
that only comes from running into the problems — `readDocumentText` uses
`getReviewedText` rather than `body.text` because a redlined contract reads
back as deletions and insertions smeared together mid-word, and there is a
comment saying so. Nobody writes that comment from the documentation.

**4. What does Apache 2.0 oblige?** Notice, licence, statement of changes.
`FORK.md` is the statement; it took an hour and it is the cheapest hour in
the project.

### Three things reading found that running would not have

**Their cross-reference check can see something ours cannot.** It reads
each paragraph's computed `listString`, so it finds section numbers on an
auto-numbered contract where the number is not in the text at all. The
server only ever sees text. On an auto-numbered agreement our numbering
checks back off (the unreadable-ratio guard) and theirs still works. Their
tool stays for that reason, and passing Word's numbering to the server is
now a real roadmap item rather than a nicety.

**`build:community` would have shipped a cloud bundle.** It depended on a
committed `.env.community`, which this repo's root `.gitignore` excludes
along with every other `.env.*`. The build would not have failed — it would
have produced a bundle that calls a backend, from a command named
`build:community`. `vite.config.ts` now sets the variable from the mode.
Confirmed by reading the minified output both ways: `isBuildCommunity()`
folds to `return!0` in one and keeps the runtime check in the other.

**Their occurrence search and our occurrence index do not agree.** The
server counts occurrences with `str.find` — substrings. Their
`locateOccurrence` counts whole words. Those diverge the moment a literal
sits inside a longer word, and when they do, nothing throws: Word selects a
real occurrence of the right words, the wrong one. So `src/claidor/goto.ts`
is a separate, deliberately dumber locator that searches the way the server
counted. This is assumption 11 from the table above, and reading their code
turned it from "unresolved" into "resolved in the wrong direction, fixed".

### Wire contract, verified

The add-in's TypeScript types were checked against the API's generated
OpenAPI rather than against the Python source:

```
RedlineFinding -> defect severity certainty term note context start end literal occurrence
RedlineReview  -> findings critical_count warning_count to_review_count characters
RedlineTerm    -> term meaning kind start end uses use_count linked
```

Field for field, and `polar.kit.schemas.Schema` sets no alias generator, so
the wire really is snake_case. Routes are `/v1/redline/{check,judge,terms}`.

### Still not run in Word

Every Office.js path in this fork — 40,000 lines of it — is written but
unproven here. That has not changed and cannot change from this container.

---

## 2026-08-10 — the fork broke the dashboard's deploys, and how

Three production builds of the web app failed between the fork landing and
this being noticed. Nobody saw a broken site — a failed build is not
promoted, so the last good deployment kept serving — but the dashboard
could not ship anything for several hours, and the cause had nothing to do
with the dashboard.

The add-in depends on `office-word-diff`, written the way upstream wrote it:

```json
"office-word-diff": "github:yuch85/office-word-diff"
```

pnpm expands that shorthand to `git@github.com:yuch85/office-word-diff.git`
and records the **SSH** URL in the lockfile. It installed here without a
murmur, because this container's proxy rewrites git SSH to HTTPS. Vercel's
build machine does no such rewrite and holds no key for github.com:

```
Host key verification failed.
pnpm: Command failed with exit code 128: /usr/bin/git clone git@github.com:yuch85/...
Error: Command "pnpm install" exited with 1
```

And because this is one pnpm workspace, the add-in's dependency is the web
app's install. A Word add-in the Next.js app does not import took the
Next.js app's deployments down with it.

Now pinned to an explicit HTTPS URL and a commit, verified three ways: an
anonymous clone from a clean directory, a `--frozen-lockfile` install (what
Vercel runs), and the lockfile, which no longer holds an SSH ref anywhere.
The next build went green.

**The lesson is the environment, not the URL.** This container rewrites git
URLs, so « it installed here » says nothing about whether it installs
anywhere else. Every dependency that resolves through a rewritten URL is
untested until something without the rewrite tries it. The same applies to
the proxy's domain allowlist and to `HTTPS_PROXY` generally: a thing that
works here has been tested against a kinder network than the one it will
live on.

It also says something about the shape of a monorepo. One workspace means
one install, and one install means the least important package in the tree
can stop the most important one from shipping. That is worth knowing before
the next dependency is added, not after.

### And a second thing, found while looking

The dashboard's Vercel project has **deployment protection** on: every URL
302s to `vercel.com/sso-api`. Its Next.js config also sends
`X-Frame-Options: DENY` and `frame-ancestors 'self'`.

Both are right for a dashboard and both make it impossible to serve an
Office task pane from that project: Word on the web loads the pane in an
iframe with no session, so it would be redirected to a login it cannot
complete, and refused framing even if it got there. The add-in needs its
own origin. That is a fact about the product, not a temporary inconvenience.

---

## 2026-08-10 — the login, end to end, and three things found on the way

The panel could not talk to the server. Five pieces were missing and only
one of them was the one I set out to fix.

**1. The routes refused every credential the add-in can carry.**
`redline/auth.py` required `web:read`/`web:write`, which are in
`RESERVED_SCOPES` — granted only by `create_user_session`, which sets a
cookie. No token can hold them; none can request them. So routes written
for an add-in were reachable only by a browser. 274 tests passed
throughout, because every one of them authenticates with the default
fixture and the default fixture grants the web scopes. Fixed with
`redline:read` / `redline:write`, following the convention every other
module already used.

**2. The token store named in `decisions.md` does not exist in Word.**
`Office.context.roamingSettings` is `[Api set: Mailbox 1.1]` — Outlook's.
The `api.ts` this fork replaced read it, got `undefined`, and would have
reported « not signed in » forever without saying why. Word's equivalent,
`Office.context.document.settings`, is worse: it serialises *into the
.docx*, so a token there travels with the agreement to the counterparty.
The answer is `localStorage` on the add-in's own origin, which is where
upstream put its refresh token for the same reason.

**3. There was no way to create a token at all.** The inherited codebase
carried `list`, `get` and `delete` for personal access tokens and nothing
that issued one. The last link in the chain was the first one missing.

### The rule I got wrong, and what it taught

The create service refuses to mint a scope the caller does not hold. That
sounds right and is wrong: a web session carries the two reserved scopes
and nothing else, so under that rule nobody could ever mint anything.
**Session scopes say how you authenticated, not what you are entitled to.**

The rule that expresses the actual intent is *only a browser session may
mint*, enforced by requiring a reserved scope — which, since no token can
hold one, means exactly « a human freshly signed in ». A token can never
mint a token, so a narrow one is never one request from a wide one.

Four tests failed on the first version. It is the only reason it is not
still there.

### The test that proved nothing

I wrote an end-to-end test: mint a token, send it as a bearer, check the
route opens. It passed immediately, which should have been the warning.

`polar/app.py` skips `AuthSubjectMiddleware` entirely under
`settings.is_testing()`, and the `client` fixture replaces the
auth-subject dependency with a fixed value. An `Authorization` header sent
to that client is decoration — the request is authenticated whatever it
says. The test passed without a bearer ever being involved.

That is the same failure as #1 above, in the tool meant to catch it. It now
calls `get_auth_subject` — the real resolver the middleware uses — with a
real request carrying a real token, and has a control beside it: a made-up
token must raise. What remains untested is the one line in `app.py` that
installs the middleware, which is worth stating rather than papering over.

**The general form: a test that cannot fail is worse than no test**, because
it stops anyone writing the one that can.

### And the client had drifted

`packages/client/src/v1.ts` described 49,787 lines of API. The API is
44,780 lines' worth. The difference is routes pruned months ago that the
generated client still claimed existed.

Regenerated from `app.openapi()` directly rather than from a running
server. Checked by comparing the exact error sets before and after, not the
counts — three errors either way, the *same* three, one pre-existing
`FileRead` union with a variant missing `public_url`. Comparing counts
would have hidden three fixed and three new.

### The comparison that was worse than no comparison — [same day]

I regenerated the typed client, ran the web app's typecheck before and
after, got three errors both times, concluded the regeneration was safe,
and committed that claim.

It was not a before-and-after. `@claidor/client` resolves to its built
`dist/`; `dist/` is gitignored; I had already rebuilt it from the new
source before stashing only `src/v1.ts`. **Both runs used the new types.**
Checking out the pre-regeneration `v1.ts` and rebuilding `dist` gives five
errors, all in files I had just written, and none in `FileRead` — so the
three were mine, and `next build` would have failed the dashboard's deploy
for the second time in a day.

The same commit message also said the regeneration made the client "5,000
lines smaller". It is 3,345 lines *larger*: I compared prettier-formatted
output against unformatted. Two numbers in one message, both meaningless,
both stated with confidence.

**Comparing the wrong two things is worse than not comparing**, because it
produces a number that looks like evidence and stops the checking. The
artifact under test was the built package, not the source I stashed —
and I never asked which one the compiler actually reads.

The other half: `pnpm typecheck` was not the check that mattered. `next
build` runs TypeScript itself and is what Vercel runs; it is the command
that fails, so it is the command to run. Typecheck alone reported the three
errors and I explained them away as pre-existing.

The cause, once found, is dull: `DossierDocumentFileRead` was added to the
API months ago, the web app keeps a hand-written union of file shapes — in
two files, already drifted from each other — and neither listed it. One
declaration now, imported.

---

## 2026-08-10 — Phase 2 opens: the matter as a workspace

The web app's job is not a nicer file list. Vesence's own page for it says
« files, chats and drafts live together in a project », and the screenshot
they lead with is a consistency check across twenty-four transaction
documents. Five pieces landed today, and the ordering was chosen so each
one is verifiable here rather than pending on a screen.

### What was built

| | |
|---|---|
| `POST /dossiers/{id}/check` | The engine over every readable file, per file, with the matter's totals |
| `GET /dossiers/{id}/documents/{id}/text` | The preview pane's source |
| `dossier/agent/tools.py` | Four tools: list, read, check, search |
| `dossier/agent/loop.py` | The agent loop, model injected |
| `agent_tasks` / `agent_steps` | The task and its trace, persisted |

### The recurring design question, and it was always the same one

Every one of these had exactly one interesting decision, and it was always
*what to do about what we cannot see*.

The matter check: a scan without OCR has no text and gets no findings.
« No issues found in 24 files » when six could not be opened is the most
misleading sentence this product could print, so `unreadable` is computed
from what the matter holds rather than from what happened to be checkable,
and it is a required field of the response.

The preview: `text` is `null` when extraction failed, never an empty
string. Blank and unreadable look identical on screen and mean opposite
things.

The agent's workspace: built from `list_documents`, not
`list_readable_documents`. The tempting call is the wrong one — an agent
that cannot see the scans cannot say six files could not be read, so it
answers as though the matter were only what it could read.

The loop: running out of steps is reported, and the budget is checked
*before* the calls rather than after, or a limit of three produces a trace
showing four.

### Containment is structural

The agent's tools take a `Workspace` — a fixed tuple of documents loaded
once from the matter the caller is assigned to — not a session and not an
id they resolve themselves. « Read the other side's file » is not one
prompt injection away; it is not expressible. A document outside the
workspace does not exist, which from inside the matter is the true answer.

That is also why 25 of the tool tests need no database at all. Tools over
data can be tested as data.

### And the lesson from this morning, applied

Fifteen loop tests drive a hand-written fake client. A fake whose shape
drifts from `anthropic.types.Message` keeps passing while the loop breaks
on first contact with a real model — the same « test that cannot fail »
that let the check routes ship unreachable.

So the sixteenth builds genuine SDK objects — `Message`, `TextBlock`,
`ToolUseBlock`, `Usage` — and runs the loop on those. It is the control for
the whole file. I had checked the field names by hand first; this is that
check, kept rather than remembered.

mypy found the same class of thing twice more: the `Client` protocol
declared `messages` as a settable attribute where the SDK has a read-only
property, and is narrower than the concrete overloaded signature. The first
was a real mismatch. The second is a limit of structural typing, so it is a
cast with its reason written beside it.

### What is deliberately not built

Cross-document contradiction — « the cap in the SPA does not match the
LOI ». That is a *reading*, and readings go through `redline/judgement.py`,
where quotes are verified and arithmetic recomputed before anything reaches
a reader. Reporting one without that machinery would be the most confident
wrong answer the product could give, so it gets built properly or not at
all.

### Not verified

The agent has never run against a real model. Every path is tested with a
scripted one, which proves the loop does what it is told and proves nothing
about whether Claude uses these four tools well on a real bundle. That
needs a matter with real documents in it, and it is the next honest thing
to find out.

---

## 2026-08-10 — the model-dependent half, finally measured

Everything under `tests/` runs the agent and the cross-document check
against a scripted model. That proves the plumbing and says nothing about
whether Claude *uses* four tools sensibly on a real bundle, which is the
only question that matters for the product. There is an API key in this
environment, so there was no reason left not to find out.

Two evals, both kept out of pytest for the same reason `librarian_eval.py`
is: whether the checks are useful and whether the code is correct are
different numbers and are never reported together.

### The bundle

Four documents I wrote, so the ground truth is known rather than judged: an
MSA, a letter of intent, a side letter, board minutes. Three conflicts
planted. **Four distractors planted** — a completion date stated
identically in two documents, a fee stated identically in two more, a
figure appearing once, and two figures about different things that a check
pattern-matching on « two numbers » would pair.

### Cross-document check

Both required conflicts found. None of the four distractors reported.
Nothing invented. 26 commitments from four documents, three conflicts
proposed, three through the gates.

The notice period was not reported and that is correct rather than a miss:
the side letter says « notwithstanding clause 10.1, and for the Pilot
Period only », which the prompt explicitly describes as a narrowing. It is
scored as a judgement call — either answer defensible, reported, never
failed — because grading a judgement call as a failure teaches the wrong
thing.

**What the run found that the tests could not:** it reported the
governing-law disagreement *twice*, once per document pair. Both pairs
real, both quoting correctly. At scale that is not untidiness — one loose
term across twenty documents is nineteen pairs, so three loose ends would
report sixty findings and read as a disaster. Conflicts are now grouped by
union-find over shared commitments. Re-run: three pairs into two findings,
extras 1 → 0.

### The agent

Three prompts, all clean. The traces are the interesting part:

```
Used 7 tools
  Listed 5 documents (1 not machine-readable)
  Read Master Services Agreement
  Read Letter of Intent
  Read Side Letter
  Read Board Minutes
  Searched 4 documents for « liability » — 3 hits
  Checked Master Services Agreement — 3 findings
```

It opened with `list_documents` every time. It used `check_document`
rather than judging defined terms by eye when told to. It quoted correctly.
And unprompted, on « is there an indemnity anywhere in this matter », it
wrote:

> One document could not be read: the *Disclosure Letter (scanned)*
> returned no text. A disclosure letter is exactly where a carve-out or
> qualification to the cap might sit, so I cannot tell you the cap is
> unqualified across this matter — only across the four files I could read.

That is the property the whole design is arranged around, produced without
being asked for in that prompt. It came from `list_documents` reporting
unreadable files rather than hiding them — the decision that looked
pedantic when I made it this morning.

### And the measurement was wrong first

The first agent run reported **thirteen invented quotes across three
answers**. There were none.

The extractor matched `"..."`, and a straight quote mark serves for
quotation, for nested quotation and for plain emphasis — so it paired the
*closing* mark of one span with the *opening* mark of the next and produced
fragments that were in no document because they were never quotations. It
also counted the checker's own notes as invention, when an answer quoting a
tool is quoting something real.

Fixed to markdown blockquotes and backticks, which have unambiguous
delimiters, with tool output in the corpus. 3/3 clean.

**Third time today** that a measurement produced a number which looked like
evidence and was not — after the client-regeneration diff and the bearer
test that authenticated nothing. The pattern is the same each time: the
thing being measured was not the thing I thought I was measuring, and the
result was plausible enough not to question. What catches it is not care;
it is reading the raw output before believing the summary.

---

# 10 August — the tie-out, against Project Cascade

First code in the new vertical. `polar/tieout/` reconciles a pitchbook
against the model behind it, measured on a real test pair: a nine-slide
sell-side deck, the five-tab model it came from, a linkage map naming
every figure's source cell, and a second copy of the deck with errors
injected.

The instruction that shaped everything: **build against the clean deck
first and get to zero false positives before touching the broken one.**

## Where it landed

| | Clean deck | Broken deck |
|---|---|---|
| Figures read | 100 | 100 |
| Reconciled against a model cell | 34 | 34 |
| **Drifts reported** | **0** | **6** |
| Output rows reached | 23 of 23 | — |
| Recall / precision on the injected errors | — | **100% / 100%** |

Zero on the clean deck was the gate, and the second row is what makes the
zero mean anything: a checker that reconciled nothing would also report
nothing. 34 of 100 is the honest number — the other 66 are peer multiples,
a sensitivity grid, timetable weeks and bridge components, none of which
the model publishes.

## The trap, and why it never fired

FY2025A reported EBITDA is $41.2mm; adjusted is $48.9mm. Both are correct,
both are in the deck, and a value-matching checker flags one against the
other. It never came up, because **nothing is ever linked on a value**.
The link is made on words and the value is only consulted afterwards, so
the reported figure and the adjusted figure are never candidates for each
other in the first place.

## Six false positives, and what each one taught

Every one of these was a correct figure the checker called wrong.

**1. One sentence, three figures, one label.** « FY2025A reported EBITDA
of $41.2mm adjusts to $48.9mm » gave both figures the same name, so
$41.2mm reconciled against the adjusted cell. Fixed by cutting each line
at its figures: a figure is named by the clause between it and the figure
before it. The cost is that « adjusts to $48.9mm » now names nothing and
goes unchecked — which is the right trade, and the reason it is right is
in the module docstring.

**2. A slide title read as a caption.** « Adjusted EBITDA bridge » sits a
few points above the subtitle on slide 4, close enough to look like a
metric tile's caption. Header-band shapes are now context, never labels:
they can support a decision and cannot carry one.

**3. `% margin` twice on one slide.** Once under gross profit, once under
adjusted EBITDA — the same three characters naming two different figures.
Derived rows now inherit the line item above them.

**4. `Median EV / revenue` reconciled against the median EV / EBITDA.**
Table labels are complete names, generated from two header cells, so every
content word in one has to be a word the output uses. This single rule
also retired a separate guard I had written for peer names: « Meridian
Flow Systems Enterprise value » fails it for the same reason.

**5. `(96.4)` against a model holding +96.4.** Parentheses in a bridge mean
« subtracted here », not « the cell is negative ». Parenthesised figures
compare on magnitude; figures the deck printed with a sign still compare
signed.

**6. « 9.8% WACC, 2.5% terminal growth ».** The name follows its figure
here, so the words before 2.5% are the tail of the WACC's name — the
checker reported that the WACC should be 9.8% when the deck already said
so. Labels now stop at the nearest clause boundary. Fixing it recovered
both figures: 9.8% found its own name in the words *after* it.

## The threshold turned out not to be the mechanism

Swept from 0.00 to 0.54 against the clean deck, the match threshold changes
nothing: the same 34 figures link and no false positive appears at any
setting. Everything that would have been wrong is refused earlier, by a
gate — a contradicted period, a contradicted basis, a percentage against a
figure that is not a fraction, a multiple against a name that is not a
ratio, a table label using a word the output does not, an endpoint of a
printed range, a figure nothing names.

That is a much better result than a tuned number, because a gate can be
explained to a banker who asks why their figure was skipped. It also means
the threshold is **untested** by this pair, and the code now says so rather
than presenting 0.50 as if it had been measured.

The margin gate does bite — 35 links at 0.00, 34 from 0.08, 32 at 0.20 —
but what it trades is recall against caution, not precision against noise.

## The measurement was wrong first. Again.

The first score against the broken deck read **100% recall, 80%
precision**, with slide 8's 10.4x reported as a false positive.

It was not one. The README beside the files says four breaks and that
« slide 8 still prints 9.9x in the methodology text ». The deck that
shipped has five changed figures: the 9.9x → 10.4x replacement hit every
occurrence, slide 8 included. I had encoded the prose as ground truth, so a
correct finding was scored as a mistake — and the run that had made no
mistakes at all reported 80%.

The eval now derives ground truth by diffing the two decks. **Fourth time
in two days** that a measurement produced a number which looked like
evidence and was not, and the first where the error made the work look
*worse* than it was rather than better. The correction is the same either
way: read the raw material before believing the summary — and a README is
raw material about intent, not about what shipped.

## What is not built

The tie-out reads a deck and a model and returns findings. There is no
endpoint, no persistence, no surface. It also assumes the model publishes
an Outputs tab; inferring that interface when there isn't one is a
different problem and a larger one.

---

# 10 August, later — reading the model instead of its table of contents

A survey of open-source components came back. Most of what it recommended
building was already built this morning, and it beat its own benchmark
(«  tie ≥90% of slide figures to model cells with <5% false positives »).
Three facts in it were worth more than the plan: the licences, that
`python-pptx` exposes a chart's embedded workbook, and — confirmed
independently — that nothing open source does deck-to-model provenance.

What it did not say, and what changed the build, came from checking the
model rather than the report.

## The Outputs tab is wrong

Four of Cascade's twenty-three source references point one row above the
figure they name.

| | Says | Actually at |
|---|---|---|
| O5 FY2025A adjusted EBITDA | `Model!D25` | D26 — D25 is blank |
| O6 adjusted EBITDA margin | `Model!D26` | D27 |
| O8 FY2026E adjusted EBITDA | `Model!E25` | E26 |
| O10 FY2030E adjusted EBITDA | `Model!I25` | I26 |

All in the adjustments block, all off by exactly one, which is what a row
insertion does to references written by hand. The values are right, so
nothing computes wrongly — a banker following the finding just arrives at
an empty cell.

That is the product's own thesis one link earlier than expected, and it
settled the design: **the Outputs tab is a link in the chain, not the end
of it.** References are now verified against the workbook and repaired
before a finding is written. A repair needs the value *and* the name —
four cells in the model hold 48.9, and proposing one on the value alone
would be the same mistake as a checker that links on values.

## The deck supplied as clean has six wrong figures

This is the part I did not expect.

| Slide | Prints | Model holds | |
|---|---|---|---|
| 5 | Unlevered FCF 28.8 / 35.4 / 41.6 | 27.9 / 34.6 / 41.0 | `Model!E37, G37, I37` |
| 7 | Sum of PV of forecast FCF 133.5 | 129.1 | `DCF!B13` |
| 7 | PV of terminal value 355.9 | 360.3 | `DCF!B15` |
| 6 | Peer mean EBITDA margin 18.6% | 18.655% → 18.7% | `Comps!G12` |

Checked before believing: **not one cell in the 313-cell workbook holds
28.8, 35.4, 41.6, 133.5 or 355.9.** The linkage map points the FCF row at
`Model!E32, G32, I32`, which is EBIT — 40.7 / 49.1 / 56.7, further away
still. These numbers came from a model version that is not in the file.

Slide 7 is the interesting one. It splits a *correct* enterprise value of
489.5 into two components that are individually wrong by +4.4 and −4.4 and
therefore sum right. That is the same shape as the break the test pair
injects deliberately on slide 6 and calls « the interesting one », except
nobody injected it.

The peer mean is one tick and probably a rounding convention; it is
reported, and reported as one tick, because a banker asking whether the
deck is right deserves the answer and the distinction rather than one of
them.

**None of these six is on the Outputs tab.** The linkage map marks them
`-`. A checker that reads only the published interface is structurally
incapable of finding them, which is the whole argument for reading the
workbook.

## What got built

`workbook.py` reads every numeric cell and names it from the labels beside
it: column A for the row, row 4 for the period. Same shape of name as an
Outputs row — « FY2025A Adjusted EBITDA » — deliberately, so one matcher
serves a published interface and a raw workbook without knowing which it
has. Precedents come from openpyxl's bundled Microsoft formula tokenizer,
so `=D16+D24` is readable without a calculation engine and without taking
on GPL (`pycel`) or EUPL (`formulas`).

`provenance.py` verifies and repairs the Outputs tab, offers every named
cell as a candidate, and renders the chain: *Model!D26 = 48.9, =D16+D24 =
Reported EBITDA 41.2, Total adjustments 7.7.*

Three rules earned their place while measuring:

- **A row with one number is a label and a value; a row with several is a
  series.** Only the second inherits its column's header. Without it every
  figure in a DCF's valuation bridge inherits « FY2026E » from the
  forecast grid above and claims to be about a year it has nothing to do
  with.
- **A cell whose whole formula is one reference is an alias, not a
  figure.** Cascade has thirty. Left in, « FY2025A adjusted EBITDA » has
  two homes with one value, which is precisely the ambiguity the matcher
  refuses to resolve.
- **In a chain, drop what the reader already knows.** `Model!E37`'s five
  precedents are all « FY2026E unlevered free cash flow » something;
  printed in full that is the same eight words six times.

## The numbers

| | Outputs tab | Whole workbook | Merged |
|---|---|---|---|
| Candidates | 23 | 273 | both |
| Figures reconciled (of 100) | 34 | 80 | **87** |
| Findings on the clean deck | 0 | 6 | **6** |
| Findings on the broken deck | 5 | 9 | **11** |
| False positives | 0 | 0 | **0** |

The two passes are complementary and neither subsumes the other. The
Outputs pass catches the revenue CAGR, which exists nowhere in the model —
it is computed on the Outputs tab itself. The workbook pass catches the
six figures the Outputs tab never published. Both run; the Outputs pass
wins where they overlap, because a name a human chose and a stated basis
read better in a finding than `Model!D26`.

## A measurement that made the work look worse

The eval initially scored the six pre-existing errors as false positives
and reported **precision 45%**. It was 100%. The scorer had been taught
that « wrong » meant « differs from the clean deck », which quietly assumes
the clean deck is right.

Fifth time in three days, and the second in a row where the error made a
correct run look wrong. The pattern is now well enough established to name:
**every ground truth in this project has been somebody's claim about the
data rather than the data.** The README about the breaks, the Outputs tab
about the cells, the clean deck about being clean. Each was believable and
each was wrong, and each time the fix was the same — go and look.

---

# 10 August, evening — the model audit, and a corpus that was reachable

A corpus survey arrived. Its most useful section was not a corpus: **Target
4**, two dozen mechanically checkable rules distilled from the FAST
Standard, the ICAEW *Twenty Principles*, SMART and Operis. That is a
specification for Phase 1, and `workbook.py` — written this afternoon —
already reads everything the rules need.

## What was reachable and what was not

| | |
|---|---|
| Damodaran's models | **Yes.** Four in native `.xlsx`, downloaded and used |
| EDGAR, Zenodo | Reachable, not yet used |
| **CUSTODES** — the only hand-labelled error corpus | **Blocked.** `sccpu2.cse.ust.hk` is outside this environment's egress allowlist |
| The legacy `.xls` majority of every corpus | **Blocked.** LibreOffice refuses to load them and openpyxl cannot read them at all |

CUSTODES is the measurement that matters, because it is the only one with
labelled ground truth and the only place the published baselines live —
CUSTODES itself at 20.3% mean per-workbook precision, ExceLint at a median
of 1.0 on the same data. Not reachable from here, and the corpus is
legacy binary besides.

So the same move that worked for the deck: **build the ground truth.**
`scripts/cascade/build_audit_fixture.py` writes a model with nine defects
at known addresses and eight structures that look like defects and are
not. Recall is now a test, not a claim.

## The result

**9 of 9 planted defects found, 0 false positives.** And on real models:

| | cells | formulas | errors | smells |
|---|---|---|---|---|
| cascade_model | 313 | 228 | **0** | 1 |
| capstru | 2,113 | 927 | **0** | 59 |
| fcffginzu | 6,763 | ~890 | 1 | 164 |
| fcffsimpleginzu | 9,167 | ~1,230 | 3 | 145 |
| fcffsimpleginzuCorona | 6,722 | ~1,060 | 2 | 87 |

**Precision on the real models is not measured and the code says so.**
They have no labelled ground truth. What is measured is that the rate is
low — under half a per cent of formulas — and that a well-built model
(Cascade) produces zero errors, which is the property an audit has to have
before anything else about it matters.

## The eight exemptions, each of them a false positive first

The first run reported **18, 15, 30 and 14 errors** on the four real
models. Reading them by hand, one was a genuine defect and the rest were
legitimate structure. This is exactly the failure the literature
describes, and it is why a detector can post 61% recall and 20% precision.

What fixed it, in order of how much noise each removed:

1. **A row must be a series before it can break a pattern.** An inputs
   sheet has a row where B is a lookup and C is a cross-sheet reference,
   and they are supposed to differ. Only a *contiguous run* of cells is a
   series. This alone took 77 errors to 8.
2. **The ends of a series may differ.** The first forecast period reaches
   back to the last actual; the terminal year stops compounding. Only
   interior cells are judged.
3. **A cell pulling straight from an inputs sheet is a hand-off, not a
   broken formula** — and the alias detection written this afternoon for a
   completely different reason already identified them.
4. **A typed history is not a hardcode.** The boundary between the typed
   past and the calculated future is found per sheet, by agreement across
   rows.
5. **Circularity is deliberate unless the model says otherwise.** All four
   Damodaran models switch on iterative calculation; Cascade does not.
   That flag is in the file format, so it is read rather than guessed.
6. `#N/A` and `#DIV/0!` are routine in a template with empty inputs;
   `#REF!` and `#NAME?` never are.
7. A number that could not be an assumption — a sign flip, `/100`, `*12` —
   is not a buried assumption.
8. **Anchoring differences are graded separately.** `Assumptions!B3` where
   the series says `$B$3` computes the right answer today and breaks the
   moment it is copied. A defect that has not happened yet.

## Two bugs the fixture caught that four real models did not

**A constant typed over a formula was never reported in a consistent row.**
The pattern check returned early when all the formulas agreed, and the
constant check sat behind it — so the commonest way a model breaks was
invisible in exactly the case where it is easiest to spot. Four real
models never showed this because it needs a defect to be present, and
this is what a fixture with planted defects is *for*.

**Anchoring cannot be compared by making everything relative.** `$B$3` on
an assumptions sheet is the same cell from every column, so its relative
offset differs from each one, and relativising made two identical
references look unlike. Nor by resolving everything to absolute addresses,
because the references that are supposed to move do move. The test that
works: every reference must match its twin on *one* of the two — same
offset, or same address.

**And a limitation neither had shown.** A workbook written by a generator
and never opened in Excel has formulas and no cached values, and the
reader kept only cells that had a value — so the entire fixture was
invisible until `Cell.value` became optional. Real models all carried
cached values; nothing before this had ever read a model that had not been
calculated.

## Where the corpus report actually paid

Not in corpora — in the rules. Every finding now cites the standard it
comes from, so « says who » has an answer that is not « the tool ». That
was free, it came straight from Target 4, and it is the difference between
a checker and an opinion.

---

# 10 August, late — reading `.xls`, and what 73 real models then said

Every corpus of real spreadsheets is legacy binary. EUSES is `.xls`, the
Enron archive is `.xls`, CUSTODES is `.xls`, and sixty-nine of Damodaran's
seventy-three models are `.xls`. A model auditor that reads only `.xlsx`
can be measured against almost nothing.

## The route, after two dead ends

**LibreOffice is installed here and refuses to load them** — every one,
with `Error: source file could not be loaded`, headless, no display, no
Java. The files are ordinary BIFF8 and open elsewhere, so that is an
environment defeating a converter rather than a format problem.

**`xlrd` reads them perfectly and gives only values**, which is what a
reader for data does and precisely not what an audit needs.

The way through was already inside xlrd. Excel stores a formula as a
postfix token stream, and `xlrd.formula.decompile_formula` turns one back
into text — written for defined names, never wired to cells. So:
`polar/tieout/legacy.py` walks the raw BIFF record stream for `FORMULA`
records and hands each token stream to a decompiler that has been in the
package the whole time.

The file format supplied the rest of the work. Sheets are located through
`BOUNDSHEET` offsets, because scanning for `BOF` finds chart sheets and
gets the order wrong. Records over 8,224 bytes arrive split across
`CONTINUE` blocks. And **shared formulas** — Excel stores a formula
repeated across a range once, with every cell holding a stub — which is
not an inconvenience but the thing the row-consistency check is about.

**69 of 70 legacy files read. 48,130 cells, 10,403 formulas decompiled.**
The one failure is `lboval.xls`, which is not BIFF8 at all: it is a raw
Excel 4.0 stream with no OLE container.

## Two bugs that only real models could show

**A formula is a string, so a column of formulas counts as a column of
labels.** The label-column detector picked whichever column held the most
text; on `apv.xls` that was a column of calculations, and every figure on
the sheet was named after the arithmetic beside it. Cascade never showed
it because nothing in its column A is calculated. This was wrong in the
`.xlsx` path too, and had been all day.

**The formula book was missing its text.** openpyxl's non-data workbook
holds a formula where there is one and the literal contents everywhere
else, so the row labels are in *both* of its books. The legacy reader
returned only formulas, so every cell was named the empty string.

## Then 73 real models, four times over

The audit's first pass over them reported a **1.9% error rate**. Four
refinements, each read by hand from a specific model, took it to **0.36%**
with **57 of 69 legacy models producing nothing at all**:

1. **A lone constant between two formulas** — not a block of them.
   `risk.xls` has fifty-nine rows of typed market prices followed by the
   statistics computed from them; that is a data region, not somebody
   pasting over a formula. **99 findings to 0**, and the fixture unaffected.
2. **A series is a series when its columns are periods.** `apv.xls` has a
   ratings table whose columns are « min coverage », « rating », « cost of
   debt » — they are supposed to differ. Five rows, five findings, all
   wrong.
3. **One deviant, not two.** A typo overwrites one cell. Two or more means
   the row changes meaning partway across — three sums and then two
   ratios — and every cell in it is doing what it was meant to.
4. **A cell pulling straight from an inputs sheet is a hand-off**, already
   detected as an alias for other reasons.

## The finding that validated the whole thing

`apv.xls` reports sixteen circular references, and they are real:

> `Interest` → `Pre-tax cost of debt` → `Pre-tax interest coverage` →
> `Interest`

Interest depends on the cost of debt, which is looked up from interest
coverage, which is computed from interest. The textbook circularity of an
optimal-capital-structure model. The file ships with iterative calculation
**off** — and the workbook's own `READ ME FIRST` sheet says:

> *« Open preferences in excel, go into calculation options and put a
> check in the iteration box. »*

So the loop is real, deliberate, undeclared in the file, and the author
knew. A banker who opens that model without reading the instructions gets
a circular-reference warning and no numbers. That is the rule working
exactly as intended, confirmed by the model's own documentation rather
than by my reading of it.

## The honest caveat

`inconsistent-row` now fires **zero times across all 73 real models**,
while still catching the planted defect in the fixture. Two readings are
available and I cannot distinguish them here: either those models contain
no inconsistent rows, or I tightened until the rule stopped firing. Every
tightening was justified by hand-reading a specific legitimate structure,
and the fixture is the guard against the second reading — but a fixture I
wrote is weaker evidence than a corpus somebody else labelled.

Which is still CUSTODES, and it is still one allowlisted hostname away.
The `.xls` half of that obstacle is now gone.
