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
