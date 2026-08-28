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

## The FERC corpus — the blocker is broken, and round 8 has run

**D3 finally has a real document → model pair.** Manifest:
`docs/pierce/corpus-ferc-formula-rate.md`. Re-fetch it with
`uv run python scripts/corpus_ferc_fetch.py <dir>` — it verifies both
halves by magic bytes **and** sha256 and refuses anything else.

- **document** — RMU's FERC Form 1 for 2015 (132 pages, 103 printed
  page numbers, filed May 2016)
- **model** — RMU's 2016 formula rate workbook (4,472 cells, 47
  citation cells)
- **truth** — the filer's own `p354.21.b` citations: page, line,
  column. A parse, not a judgement. No one has to guess what the
  modeller meant.

**Check bytes, never status.** PJM answers HTTP 200 with the identical
PDF when you request a PDF's path with `.xlsx`. Verified here: same
size, same sha256, both `%PDF`.

**Two parse rules that own answers you will otherwise re-derive wrongly:**

- A page's printed Form 1 number is the one in its **footer**
  (`FERC FORM NO. 1 … Page NNN`), never any `Page NNN` in the body.
  Loose matching makes 10 printed numbers ambiguous; the footer rule
  is unique across all 103.
- A schedule's **Line No. column sits on the left of a left-hand page
  and on the right of its continuation** (`$ 218,200 48`). A
  start-anchored line finder silently misses every right-hand page.

### Round 8's result: it failed, and the failure is informative

0 correct, 2 wrong, 13 abstained over 15 scorable rows, against all
4,913 document numbers with no page hint. **Kill criterion 1 fired.**

The number that explains it is not the score: **the truth line clears
`FLOOR = 0.5` on only 3 of 15**, and on **11 of 15** some other line
scores strictly higher. The answer is not reachable with the evidence
the matcher may use, so the abstentions are correct and the two
proposals are the failure.

### READ THIS BEFORE YOU IMPROVE ANYTHING: D3 has never made a correct proposal

Tallied from every verdict file in `docs/pierce/scribe-d3-round*-verdicts.json`:

| round | corpus | correct | false proposals | true abstentions |
|---|---|---|---|---|
| 1 | ED2 | 0 | 8 | 22 |
| 2 run A | ED2 | 0 | 2 | 28 |
| 3 run A | ED2 | 0 | 0 | 30 |
| 5 | Finch | **0** | 1 | 9 |
| 6 | Finch | **0** | 2 | 7 |
| 8 | FERC | **0** | 2 | 13 |
| **total** | **three corpora** | **0** | **15** | **109** |

Rounds 1–3 are the *unsourced* case — abstention is the right answer
there and zero proposals is the design working. **Rounds 5, 6 and 8 are
the sourced case**: a correct answer demonstrably existed, across **69
judged rows on two independent corpora**, and the matcher found **zero**.
Lifetime precision is **0 of 15**.

Each round's zero was published at the time. Nobody added them up for ten
sweeps. **Do not spend another round improving the matcher's inputs
before this is settled** — that is what the last four rounds did.

The open decision, which belongs to the lead and not to this lane: D3 was
built as a source-*finder* and has never found a source. Either the
matching approach changes to something that can, or D3 is reframed as the
abstention instrument the evidence says it already is — 109 true
abstentions, 30 of 30 on round 3, plus round 8's finding that **10 of 25
cited inputs are nils**. *"We looked and there is nothing there"* is the
one statement D3 has earned.

**But the zero is not the whole story, and an earlier version of this
file said it was.** Stripping D3's floor and tie rule and asking only
whether the truth is ever the *top-scoring* candidate:

| | rows | truth is top-scoring (oracle) | blind pick among the tied |
|---|---|---|---|
| **Finch** (round 6) | 14 | **7** | 1.3 correct, 5.7 wrong |
| **FERC** (round 8) | 15 | **4** | 0.79 |

On prose the truth is top-scoring for **half** the rows and D3 abstains
on every one because the top score is **tied** — so there the **rules**
cost the recall, not the evidence. On the statutory form 11 of 15 are
unreachable regardless, and 7 truth lines share *no words at all* with
the cell's label.

The tie rule is still correct today: blind tie-breaking returns more
wrong than right and fails kill criterion 1. **The headroom is 1.3 → 7
on Finch, 0.79 → 4 on FERC, and all of it belongs to a better-than-chance
tie-breaker.** Do not read the lifetime zero as "the approach cannot
work" — read it as "the tie rule converts every reachable answer into an
abstention, and nothing yet breaks ties.

### Round 9 was investigated and **deliberately not built** — read this before you try

The obvious next fix is the **two-page spread**: a wide table's
continuation page carries no labels at all, so four of round 8's rows
extract as `$ 10,895,809 58` — a figure, a line number, no words. It is
real, it explains four failures, and **repairing it buys nothing.**
Measured, not assumed:

| candidate fix | ceiling |
|---|---|
| unglue the printed line number (`21Transmission`) | 0 of 15 |
| repair the spread (**hand-supplied perfect labels**) | 0 of 15 |
| drop repeated headers and prose (pool 4,913 → 2,272) | 0 of 15 |
| match on the FERC account number | ≤ 2 of 15 |
| model-side section header as a tie-breaker | 0 of 15 |
| **all six levers at once** | **0 of 15** |

The one lever that earns its keep: **excluding prose from the candidate
pool removes both wrong answers** (the two false proposals landed on the
same 20-word instruction sentence; all 15 truth lines have 0–8 word
tokens). It is not shipped — fixing precision on an instrument whose
precision is 0 of 15 is the lead's call.

A perfect spread fix moves rows from **unreachable** to **tied**, never
to correct: r19's top score ties across **seventeen copies of the
schedule's own title**, and r41 ("General") across 35 lines including
running prose. The ties re-form after the boilerplate is dropped,
because a statutory form legitimately says "General", "Total" and
"Transmission" on dozens of lines.

**Four join keys were tried and all fail.** PDF adjacency — this
document's pages are out of printed order (204, 206, 205, 207).
Line-number coverage — the balance sheet becomes a universal false
donor; the percentage said 92% and a hand-check caught it. Schedule
title — misses all four pages of the spread. Column letters — right on
the target, wrong on most pages it fires on, so it fails decision 1's
undamaged bar.

**The conclusion, and it is D3's not D1's:** the failure is not on the
document side. Label-overlap scoring cannot separate one row of a filed
return from the dozens sharing its two or three words. The unmeasured
idea worth putting to the lead is symmetric to round 6 — round 6 gave
the *document* side a second dimension; the **model** side still gets
only the row's own name, not its sheet, its section header, or its
account-number column. That is a design decision, not a patch.

**One product finding for the lead, not an accuracy one:** 10 of the 25
cited inputs are **nils** — the document prints no value on the line and
the filer records `0`. A tie-out that cannot say *"the document states
nothing here and the model recorded zero"* in words is silent on two
rows in five.

**Still open:** the transformations the researcher counted (13-month
averaging above all) live in the **large owners'** workbooks — JCPL's
2025 ATRR has 72 citation cells and puts one citation over a column of
thirteen monthly values, exactly round 6's column-anchor shape. **Those
workbooks have no document half.** `www.ferc.gov` answers 403 here;
`forms.ferc.gov` and `elibrary.ferc.gov` answer 200 but are ASP.NET
postback surfaces. Not solved, and not recorded as solved.

**One engine intake fact, for the lead to route:** ATSI's
`2024-atrr.xlsx` is a genuine XLSX by its bytes and the engine raises
`ValueError` on it. The engine is read-only to this lane.

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
