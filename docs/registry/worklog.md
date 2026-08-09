# Registry worklog

What actually happened, in order, including the parts that went wrong.
Not written after the fact to look tidy.

Plan: `docs/registry/plan.md` · Direction: `docs/direction-2026-08.md`

---

## 2026-08-09 — Step 1: harvest the candidate set

### Objective

Every candidate opinion for Texas express negligence, held with provenance,
re-runnable without duplicating or destroying work.

### Initial state

Nothing. No registry module, no tables. The repo carried the Claidor
engine (corpus, retrieval, evals, auth, workers) as the base.

### Investigation — what was checked rather than assumed

**CourtListener's API.** Search answers **unauthenticated**; I confirmed it
by calling it. `/api/rest/v4/opinions/{id}/` and `/clusters/{id}/` both
return **401**. So candidate metadata is free and **full opinion text is
not** — which is why harvesting and text-fetching are separate steps.

**Bulk data.** Public-read on S3 (`com-courtlistener-storage/bulk-data/`),
regenerated quarterly, and `opinions-*.csv` does include `plain_text`. But
`opinions-2026-06-30.csv.bz2` is **50.81 GB compressed** against 23 GB of
free disk here. Not viable in this environment; viable on a machine with
room, and worth revisiting if a token never materialises.

**Caselaw Access Project.** Open, per-reporter, per-volume — `sw`, `sw2d`,
`sw3d`, `tex`, `tex-civ-app`, `tex-ct-app` all present, so downloads are
small. But coverage is book-published material through ~2020, and a large
share of recent Texas appellate memoranda are unpublished with **no
reporter citation at all** — the first search result I looked at had
`citation: []`. CAP is a partial fallback, not a substitute.

**Court identifiers.** Downloaded the bulk `courts` table (81 KB) rather
than guessing. `texapp` is a *parent* with 17 children (`txctapp1` …
`txctapp15`), and querying the parent rolls up the children — confirmed by
a `texapp` query returning `txctapp5` results. Also picked up `texbizct`,
the new Texas Business Court, which is commercial and in use.

**Result shape.** A search *result* is a **cluster** — one case — holding
one to three opinions, typed `combined-opinion`, `lead-opinion`,
`dissent`. That is why the model stores one row per *opinion* with a
`cluster_id`, and why `opinion_type` exists.

### Decisions

- **Doctrines live in code**, not a table: a doctrine is a query set, a
  rule and prose, none of which is row-shaped.
- **Queries run separately, not OR'd.** Recall per phrasing is a number we
  need; the candidate records which query reached it.
- **A candidate row is written for everything the search returned**,
  before anything reads it, so « what did you consider and reject? » has an
  answer.
- **Harvest never writes `plain_text`.** Overwriting fetched text with
  nothing would silently undo the expensive half of the work.
- **Re-harvesting never resets a screening verdict.** Tested explicitly.

### Changes

- `polar/models/registry.py` — `RegistryOpinion`, `RegistryCandidate`
- `polar/registry/{doctrines,courtlistener,harvest,repository}.py`
- `migrations/…_registry_harvest.py`
- `tests/registry/` — 23 tests, fixture is a **real** API response

### Verification

- 23 registry tests pass; **320 tests pass** across the whole suite, so
  nothing that worked before is broken.
- Migration upgrades, downgrades and upgrades again cleanly.
- Ran the harvest live: **419 distinct opinions, 901 hits, 43 pages,
  374 distinct cases, 419 candidates.**

| Query | Opinions |
|---|---|
| `"express negligence"` | 383 |
| `"express negligence doctrine"` | 246 |
| `"fair notice" "conspicuous" indemnity` | 152 |
| `"indemnify" "its own negligence" conspicuous` | 120 |

Date range 1930-05-14 → 2026-05-15. Opinion types: combined 345, lead 55,
dissent 11, concurrence 5, in-part 2, rehearing 1.

**Landmark recall: both present.** *Ethyl Corp. v. Daniel Construction*
(1987-02-25, `tex`) and *Dresser Industries v. Page Petroleum*
(1993-06-09, `tex`, opinion 2450513).

### Problems, and what they turned out to be

**1. A count that didn't add up.** The harvest reported 383 opinions for a
query the API said returned 291, then 340. Not a bug: the API's `count` is
**clusters**; the harvest counts **opinions**, and a case holds ~1.13–1.25
of them. Verified by querying the same terms and comparing directly.

**2. A real defect this exposed.** `opinions_seen` summed hits across
queries, counting the same opinion once per phrasing. Reporting it as the
corpus size would have inflated the asset by more than half — 901 against
419. Added `unique_opinions`; the summary now leads with the honest number.

**3. Rate limiting.** Five 429s in 43 pages at a 1.0s delay. Being
throttled repeatedly while taking free data from a non-profit is not a
position worth defending; the delay is now 2.5s.

**4. A mistake I made.** I reported *Dresser* missing and started hunting a
pagination bug. **The diagnostic was wrong, not the harvester** — my check
searched `case_name ILIKE '%Dresser%' ORDER BY date_filed LIMIT 4`, which
printed four 1989 rows of a different case and truncated before reaching
the 1993 landmark. Dresser was in the database the whole time.

Before finding that, I independently verified pagination by paging one
query under two orderings (`score desc` and `dateFiled desc`): both
exhausted at 2 pages, 29 unique opinions, agreeing with each other. So
pagination is sound, and the near-miss was a lesson in checking the
instrument before the machine.

**5. A gap the data exposed.** `is_dissent` only caught `dissent`, but
`concurrence-opinion` and `in-part-opinion` are equally not the court's
decision. Replaced with `states_the_holding`, tested, with unknown types
erring towards inclusion.

### Remaining uncertainty

- **`combined-opinion` contains the dissent's text inside it** (345 of 419
  rows). It states the holding *and* carries text that is not the holding.
  Whatever reads it in step 3 has to know that. Not solved here.
- **Recall beyond four phrasings is unmeasured.** Both landmarks are in,
  which is encouraging and is not a measurement. The screening gold set
  (plan step 6) is what will settle it.
- **Federal courts applying Texas law are included.** A federal court's
  reading of Texas law is a prediction, not a holding of the Texas courts,
  and entries should eventually say so.
- **The 419 are candidates, not entries.** None has been read. Expect
  10–25% to survive screening — roughly 40 to 100 real cases.

### Blocked

**Full opinion text needs a CourtListener API token.** Search is open;
the opinion endpoint is not. 419 opinions is 419 requests — trivial once a
token exists. Registration is free at courtlistener.com.

`RegistryRepository.list_awaiting_text()` is the queue that drains the
moment one is available. Until then step 2 (screening) cannot run, because
there is nothing to read.

### Next

1. Token → fetch the 419 texts, store with SHA-256.
2. Step 2: screening — on-point or passing mention.
3. Step 6 in parallel: the gold set. Needs a human who can read a US
   commercial judgment; a gold set graded by a model measures nothing.

---

## 2026-08-09 — Step 1b: opinion text. Two routes tried, one abandoned.

### Objective

Fill in `plain_text` for the 419 harvested candidates.

### What was verified

**API limits.** CourtListener throttles an authenticated account to
**5 requests/minute, 50/hour, 125/day**. 419 opinions is four days on a
free account; the whole registry is weeks. A Free Law Project membership
($10/mo, $100/yr) raises this to roughly 1,000–1,400/day.

**Bulk export.** Public, unthrottled, and it contains `plain_text`.
Two format facts established against the real file, either of which would
have corrupted text silently rather than raising:

- The CSV escapes quotes with a **backslash**, not by doubling them. On a
  12 MB sample, Python's default parsing gave 76,172 rows of which
  **76,151 had the wrong field count**; `escapechar='\\'` gave 250 rows
  and **none** malformed.
- Opinion text contains **raw newlines inside quoted fields**, so the file
  cannot be processed line by line.

Also: the bulk export types opinions `010combined` / `040dissent` where
the search API says `combined-opinion` / `dissent`. Both now pass through
`normalise_opinion_type`, so the dissent guard holds either way.

### What went wrong

**Attempt 1 — `httpx.ReadTimeout` after ~35 minutes, nothing loaded.**
Root cause was mine, in three parts:

1. A 300s read timeout on a stream we consume at our own pace. Measured
   parsing at 66 MB/s decompressed against ~75 MB/s arriving, so ordinary
   backpressure became a failed run.
2. A dict of 22 keys built for every one of ~10M rows, to keep 419.
3. **No progress logging at all**, which is why the failure told me
   nothing about how far it had got. That was the worst of the three.

All three fixed: read timeout removed, id filtered before the dict is
built, progress logged every 250,000 rows.

**Attempt 2 — abandoned.** With the fixes it ran, but throughput collapsed:
~171 MB read in roughly ten minutes, against an earlier burst measurement
of 50 MB/s. At that rate a 50 GB file is around two days. Sustained large
downloads appear to be shaped in this environment; the earlier
twenty-second measurement was not representative, and I should not have
planned a twenty-minute stream on it.

### Decision

**The API is the right route for this volume; bulk was over-engineering.**
419 opinions is 419 requests — resumable, observable, and it fails one
opinion at a time instead of losing an entire pass. Bulk remains correct
and is the right tool at tens of thousands of opinions, so the code stays,
tested, as the fallback and the route at scale.

Written down because the reverse — quietly deleting the bulk loader and
presenting the API as the plan all along — would hide a real mistake.

### Changes

- `polar/registry/bulk.py` — streaming loader, three defects fixed
- `polar/registry/fetch.py` — API fetcher; resumable by construction,
  distinguishes a burst limit from an exhausted daily allowance, and fails
  loudly with no token rather than quietly doing nothing
- `tests/registry/test_bulk.py` — format facts pinned as tests

### Verification

47 registry tests pass. The API fetcher has **not** been run end to end —
there is no token yet, and I will not claim a path works before it has
carried a single opinion.

### Blocked

**`COURTLISTENER_API_TOKEN`.** Free at
https://www.courtlistener.com/profile/api-token/ after registering.

With the membership active, one run of ~21 minutes covers all 419.
Without it, the free allowance covers 125 a day and the fetcher stops
cleanly and resumes the next day.

### Next

1. Token → run `fetch_texts`, verify text against source, then screening.
2. The gold set, in parallel — still needs a human who can read a US
   commercial judgment.
