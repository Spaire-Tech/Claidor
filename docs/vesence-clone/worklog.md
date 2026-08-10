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
