# Scribe — cold-start handoff

Written for a successor who remembers nothing. The log
(`docs/pierce/logs/scribe.md`) is the diary, newest last; this is the
map. Where they disagree, the log is the record and this file is
stale — say so and fix it.

## Who you are

Scribe, the Chain lane (Track D): **document → model**, the
direction the engine did not have. Branch `swens/scribe`, always
based on the integration tip
(`origin/claude/pierce-phase-6-writing-mjkaj6`). Charter and paths:
`docs/pierce/lanes.md` — you own `server/polar/tieout/chain/`
(including its router, which the lead mounts), `server/tests/tieout/
test_chain*`, `server/scripts/{corpus_documents,corpus_extract_pdfs}*`,
your log, and (amended into lanes.md at the eleventh sweep) the
chain's migrations plus its one line of model registration. The
engine is a read-only library. Every working turn: fetch the
integration branch, read `docs/pierce/orders/scribe.md`, do it, push
to your branch, stop. Read `notes.md` before answering anything of
record; never answer from memory.

The discipline that matters more than any code here: **registration
before results.** Criteria, sample, and judging protocol are written
and committed *before* a number is looked at, and a bad number is
reported as it is. Three D3 rounds and a D5 flood were run this way;
two of them returned numbers that killed what they measured, and
that is the lane working, not failing.

## Shipped and merged

- **D1, citation-grade extraction** (`chain/extract.py`): every
  numeric token of a text-layer PDF with page, printed text, parsed
  signed value, bounding box (PDF points, top-left origin), and the
  printed line it sits in. Scans refused **in words**, never OCR'd,
  never silent. `EXTRACTOR_VERSION = "2"`. Measured on 20 gov.uk
  PDFs: 640 pages, 13,062 numbers, 4 pages refused, and a seeded
  ten-crop spot-check where 10 of 10 boxes covered their digits.
- **D2, the fact store** (`chain/store.py`, `repository.py`): two
  tables (`tieout_chain_facts`, `tieout_chain_refusals`) behind the
  JSON-schema contract the lead approved from the log. Fact ids are
  **deterministic** — UUID5 over (artifact, extractor version, page,
  ordinal, printed text) — so re-extracting a version rewrites
  byte-identical rows, which is what lets D4's confirmations hang
  off them. Refusals are stored with facts so page coverage stays
  answerable forever.
- **The routes** (`chain/router.py`, mounted at `/v1/chain`):
  `POST /extract` (stateless), `POST /documents/{id}/extract`
  (persisting), `GET /facts/{id}`, `GET /documents/{id}/facts`,
  `GET /cells/{id}/proposals`. Every stored-fact route resolves the
  deal and requires membership — 404, never 403.
- **Atelier consumes the fact store**, not the proposals: their
  source viewer draws my boxes over a rendered page. That is
  measured ground; proposals are not.

## Frozen, measured, and NOT shipped

**D3, link proposal** (`chain/propose.py`). Rule, from the plan:
matched **by labels near both, never by value** — enforced in the
tokenizer (purely numeric tokens are dropped from both sides, so no
caller can leak a value in as a string). Abstains below `FLOOR = 0.5`
coverage and on exact ties among eligible candidates, always in
words. Two frozen reference defenses, each bought with a measured
round: reference-worded numbers (« SpC 3.2 », « Table 14 ») and
leading paragraph numbers (« 10.246 Ofgem's decision… »).

Three rounds, same 30-cell sample and recorded truth (seed 314159,
Ofgem ED2 PCFM V5 against three Ofgem PDFs):

| | v1 | v2 | v3 |
|---|---|---|---|
| false proposal | 8 | 2 | **0** |
| true abstention | 22 | 28 | **30** |

Read that correctly: it says the matcher stays quiet where there is
nothing to find, on a corpus running the wrong direction (the Finance
Annex derives *from* the model, so the typed cells D3 restricts itself
to are machine inputs no narrative document restates: 90 seeded draws,
zero stated).

**The hit-rate case has since been measured, on Finch, and the answer
is zero.** Rounds 5–7 and part B, same 42-cell sample and recorded
truth (seed 271828, seven document→spreadsheet workflows):

| | round 5 | dash round | **A + B, the whole sample** |
|---|---|---|---|
| true proposal | 0 | 0 | **0** |
| false proposal | 2 | 1 | **1** |
| scored rows | 27 | 24 | **39 of 42** |
| rows the documents state | 18 | 20 | **35** |

**Recall is 0 of 35, and the earlier denominators were flattering** —
the rows the judge had set aside as unjudgeable were the same rows the
matcher finds hardest. The blockage is located and it is not on the
document side: `Cell.column_label` reads one header row, so two money
columns of a stacked-header workbook come back with the identical name
« $ Total Direct Expense » and the tie is correct behaviour. That case
is written up for Sentinel.

The route carries `PROPOSAL_STANDING`, an **in-band sentence in
every proposal response** stating the measured record — now 0 of 35,
including the fact that earlier rounds quoted a smaller denominator.
Update it only from a registered round's result; never let a screen
present a proposal as a link.

**D4 round 4** is registered and blocked only on bytes — see below.

**D5, the unsourced-number finding**: registered, flood measured,
naive shape killed by its own number (22,693 candidates on a
regulator model, 85 on the small Cascade fixture). The proposed
flood-proof shape — fire only where sourcing is the *local* rule —
is with the lead and founder. D5 reports nothing until a shape is
approved.

## The largest open defect, handed over deliberately

**D1 stores single digits torn out of character-spaced text.** Some
PDFs place glyphs one at a time (a chart overlay, a rotated axis label
crossing a table); pdfplumber's line then reads « 1 9 , 8 4 2 » and D1
files five facts where the page prints one, each with a citation box
around a single glyph. Measured at **56% of the Finch corpus** and
0.0% of ED2 — which is why three ED2 rounds never saw it.

**The cause is D1's own, and that took five rounds to establish.**
`_LINE_TOLERANCE` is 3.0 and `page.extract_words()` defaults to 3;
a financial PDF that prints a table over a chart routinely leads its
rows exactly 3.0 apart, so D1 merges two baselines into one row, sorts
by x, and zips two texts together character by character. Rounds P, Q
and R all tried to *detect* that damage before round R's calibration
showed D1 was inflicting it. **Read the log's rounds P through T before
touching this** — five deaths, each by a criterion frozen in advance,
and between them they rule out most of the obvious moves:

| round | tried | died on |
|---|---|---|
| P | refuse lines ≥60% one-character tokens | caught **nils** |
| Q | refuse lines with ≥3 lone letters | caught **prose**, formula legends |
| R | character-gap geometry | no constant exists — and found the real cause |
| S | y-tolerance 1.5 | split **subscripts**, 0.1 pt from the zips |
| T | 1.5 + merge small runs by font size | shuffled **display mathematics** |

**What is settled:** font size separates sub/superscripts from merged
baselines where distance cannot; the genuine glyph-by-glyph population
is four lines, not thousands; display mathematics is a third population
nothing yet handles; and round T's shape recovers ~2,400 junk facts in
task 72 while losing nothing in task 81, task 5 or ED2.

**Measured since, and it changes the shape of the question.** All 143
differing line entries — 32 logical changes — were hand-read against
the page: **20 repairs, 1 damage, 11 neither** (display mathematics).
The one damage is unambiguous: `8. Legacy adjustments` becomes
`8. Legacy adju2s+tm𝑅𝑅ℎ𝐷𝐷e𝑅𝑅nts`, an equation denominator merged into a
heading. **Both candidate criteria reject round T** — « unchanged » at
32, « undamaged » at 1.

**Round V clears all four criteria it registered, and the criterion
question is what decides whether that is enough.** Under « undamaged »
it passes (20 repairs, 0 damage). Under « unchanged » it is rejected,
because it changes 142 ED2 line entries — **and so would any rule that
repairs anything, since a repair is a change.** That is the argument
for « undamaged » being the right bar; it is an argument, not a
measurement, and the lead's to accept or reject. Do not let this lane
tell you the question has gone away — it did once, and it was wrong.

The
damage was never the downward branch — it was one reach constant used
for both directions. Measured: 21 of 22 downward merges sit between 1.8
and 2.4 points, the 22nd sits at 5.1 and is the damage, and the upward
branch genuinely needs the full 6.5 (its tail runs to 6.2). So reach
becomes directional — **6.5 up, 3.0 down** — and nothing else moves.

Result: **20 repairs, 0 damage**, ED2 still 30 of 30, Finch's facts
6,842 → 4,189 (87% of the shredded lines repaired), **ED2's 8,015 facts
and the dash round's 750 nils untouched to the unit**.

**To ship it**: `_words` from round T with `_SCRIPT_UP = 6.5` /
`_SCRIPT_DOWN = 3.0`, `_LINE_TOLERANCE = 1.5`, `EXTRACTOR_VERSION` to
`"5"`, then re-run the four harnesses. **Do not ship it without the
lead's word** — that is this lane's standing commitment, not a
technical blocker.

Two harnesses are committed and ready:
`corpus_documents_spaced_round.py` (seeded 20-line hand-check) and
`corpus_documents_linetext_check.py` (ED2 line-text regression). Both
report nothing while no candidate rule is in the extractor, which is
the current state.

## All five decisions were answered at the twenty-fourth sweep

`docs/pierce/logs/scribe-decisions.md` holds the questions as they were
asked; the answers are in `docs/pierce/orders/scribe.md` and acted on:

| | decision | state |
|---|---|---|
| D1 | the bar is **undamaged**; ship round V | **shipped**, extractor version 5 |
| D5 | **shelve** until D4's store holds confirmations from a real deal | waiting on that trigger |
| D4 | **approved** | **built and complete** — table, migration, repository, three routes, thirteen tests |
| D3 round 4 | **closed**; harness stays committed | closed |
| Newbattle | **keep**, caveat recorded; excluded from 1B | nothing to do |

**D4 is finished, not just started.** `POST /chain/links` confirms,
`GET /chain/dossiers/{id}/links` reads, and
`POST /chain/dossiers/{id}/recheck` is the « forever » half — it takes
the deal's confirmed links against a newer pair of versions and
returns the four registered verdicts plus broken and ambiguous, each
with both numbers in its sentence. `model_calls: 0` is structural: the
package imports no model client.

**D5's trigger is now reachable** — « when the D4 store holds
confirmations from at least one *real* deal, not a fixture ». The store
exists; what is missing is a real confirmation.

**One pattern to watch, from four instances:** this lane's recurring
defect is not carelessness about values, it is **re-deriving a rule at
the call site instead of calling the function that owns it** — a fact
key without its y-coordinate, finding refs without their sheet, two
unaligned lists zipped, and `ordinal_in_line` counted by line text when
`with_ordinals` counts by physical line. When two places implement one
rule here, they have disagreed every time.

**The standing bar for this lane, now policy:** a change to extraction
must leave no line *worse*; it need not leave every line *identical*.
Damage is judged by hand against the documents, never by a diff count,
and the repair/damage tally is reported with every such round.

## The decision sheet, kept for its shape

`docs/pierce/logs/scribe-decisions.md` — each with its question, its
evidence in a sentence, and what happens on either answer. Read that
before the log; the log is 4,200 lines and the decisions are five.

## D5's state, as of round 4 — the shape finally has a real subject

Rounds 1–3 could never put D5's question to a real model: the regulator
corpus has **zero** typed cells inside declared sections (inputs and
totalled blocks are disjoint), and the eight published Scottish deal
models are **value-only**, so they declare no totals at all.

**Inverness College is the subject.** 380,506 cells, 20,027 formulas,
21 sections declared, 6 usable, **175 typed cells inside one (0.09%)**.
Round 2's threshold verdict replicates at scale: « any » floods (169
findings from ten confirmations), « half » drives its random noise from
0.1 to **66.8** as the budget grows 10 → 100, and **« all-but-this-one »
survives** at 5 adversarial and about 1 random.

**State the limitation with the result**: 0.09% is a small surface and
this model yields roughly one finding at a hundred confirmations.
Safely quiet, or too quiet to build — that is a product judgement and
it is open.

`uv run python -m scripts.corpus_documents_unsourced_shape formula-bearing`

## Read this first if you are picking this lane up on 28 August

Two findings from the fifteenth turn that are **not about this lane's
own tracks** and are the most consequential things it currently holds:

1. **The Scottish route is not closed.** My orders say it is,
   structurally. It is not — the models sit in a public S3 bucket and
   `scripts/corpus_sft_models.py` fetches them today. Kelso, Levenmouth
   and Oban (D3 round 4's registered deals) are three of the eight.
   **Round 4's blocker is now the contract half alone**, and thirteen
   probed key forms say the agreements are not in that bucket.
2. **The published closed-deal models are all but value-only** — 1,938
   formula cells in 6,130,539, and three of the eight contain no
   formula at all. The population proof plans a cold run on these. What
   that means for the proof is the lead's call, not this lane's; the
   measurement is in the log.

I also wrote up a « fourth engine intake gap » that turn and
**retracted it the same turn, before it was pushed** — wrong cause,
wrong harm, wrong consequence; the log carries the retraction. What
survives is small: in two of the eight models the reader returns fewer
formula cells than the file holds (Kelso 814 of 875, Newbattle 492 of
616), those cells carry neither formula nor value, and on this corpus
the discrepancy is inert. **Cause unestablished — do not guess a
mechanism**, two collapsed under test already.

And, measured rather than inferred: running the engine as the service
runs it over all eight gives **16 rule findings and 12 analytics in
total**, with four of the eight producing nothing at all.

## Before you publish a number: run the audit

```
uv run python -m scripts.corpus_documents_audit
```

Eight corpus-level numbers re-derived, non-zero exit on any mismatch,
and it prints the four harnesses it cannot cover. Four self-checks in
three turns found four errors of mine — a fact key that addressed two
facts, a criterion that could not tell repair from damage, a claim
generalised from two samples to twenty-two, and a count wrong by eight
times. **None changed a headline finding, and all four were the same
mistake:** the measurement was right and the sentence generalised
further than the run did.

So: **every number in the log names the population it was measured
over, in the same sentence.** « 562 » was a count of colliding *keys*
over the round's *seven tasks*, and it got written as « 562 facts of
this corpus ». That is the whole failure mode.

## The corpus, and the one blocker

Corpora are re-fetchable, never committed (`.gitignore`).

- `scripts.corpus_documents` — gov.uk PDFs, D1's measurement set.
- `scripts.corpus_documents_extract` — D1's counts and the seeded
  box spot-check crops.
- `scripts.corpus_documents_link_round` — D3's rounds: `sheet` /
  `score` (unsourced case) and `sourced-sheet` / `sourced-score`
  (hit-rate case). Two phases so truth is judged blind.
- `scripts.corpus_documents_unsourced` — D5's flood metrics.
- `scripts.corpus_documents_sft` — **the Scottish deal pairs**, D3's
  missing direction (the founder's 26 Aug research): contract +
  close model, Kelso / Levenmouth / Oban & Campbeltown. Origin
  first with TLS verification **on**, Internet Archive fallback,
  per-file completeness gates, retries.

**The blocker, measured, not guessed:** the hub subdomain
(`contracts.scottishfuturestrust.org.uk`) serves a certificate that
is expired *and* issued for the wrong host, so automated fetching
fails verification for everyone; the archive caps every document at
exactly 1 MiB on this path and holds no capture of the financial
models at all (they postdate every snapshot). Round 4 runs unchanged
the moment the six files exist on the lead's container — the two
unblock paths are with the founder. **Do not force it onto a corpus
that runs the wrong direction; that is what round 2 taught.**

## Working conditions in this container

- Python 3.14.0**rc2** ships here and breaks pydantic (`ForwardRef`
  assertion) — every `import fastapi` fails. Fixed locally, not
  committed: a current `uv` (the bundled one's manifest stops at
  rc2), `uv python install 3.14` (3.14.7), venv rebuilt on it.
- Route tests need real services: native PostgreSQL 16, Redis, and a
  downloaded MinIO. **They die between turns** and restart in seconds
  from their surviving data directories — restart them before blaming
  a test. The exact incantations, because guessing them cost half an
  hour once:

  ```
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgdata \
      -l /tmp/pg.log -o '-p 5432' start"
  redis-server --daemonize yes --port 6379
  cd /var/tmp && MINIO_ROOT_USER=claidor MINIO_ROOT_PASSWORD=claidorclaidor \
      setsid nohup minio server /var/tmp/minio-data \
      --address 127.0.0.1:9000 --console-address 127.0.0.1:9001 \
      > /var/tmp/minio.log 2>&1 < /dev/null &
  ```

  **MinIO's root user is `claidor` / `claidorclaidor`**, from
  `MINIO_USER`/`MINIO_PWD` in `.env.testing` — *not* the
  `claidor-development` access key beside it, which is the S3 key the
  app uses. Starting MinIO with the wrong root gives every test
  `InvalidAccessKeyId` and looks like a code failure. Postgres data is
  `/var/tmp/pgdata`, not `/var/lib/postgresql/16/main` (that one has
  no `postgresql.conf`).
- **Never run two pytest sessions at once.** Both take the bucket
  `testing-claidor-s3-master` and delete each other's; the symptom is
  hundreds of setup errors in a suite that passes alone. Heavy workbook
  jobs run alone too — a concurrent pair OOM-killed a sweep once.
- `pgrep -f "<anything>"` matches the *wrapper shell* of any command
  whose own text contains that string — **including the pgrep command
  itself**. So `until ! pgrep -f "pytest tests/tieout"` never exits,
  and `pgrep -f "bin/pytest" && echo BUSY || pytest …` always reports
  BUSY and never runs the suite. Both happened here, the second one
  *after* this note was written warning about the first. If you need a
  guard, compare against a pid file or just run the thing.
