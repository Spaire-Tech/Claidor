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
nothing to find. **It does not say the matcher can find a source
that exists** — that hit-rate case has never been measured, because
this corpus runs the wrong direction (the Finance Annex derives
*from* the model, so what it states are computed cells, while the
typed cells D3 restricts itself to are machine inputs no narrative
document restates: 90 seeded draws, zero stated). The route
therefore carries `PROPOSAL_STANDING`, an **in-band sentence in
every proposal response** stating the measured record. Update it
only from a registered round's result; never let a screen present a
proposal as a link.

**D4 round 4** is registered and blocked only on bytes — see below.

**D5, the unsourced-number finding**: registered, flood measured,
naive shape killed by its own number (22,693 candidates on a
regulator model, 85 on the small Cascade fixture). The proposed
flood-proof shape — fire only where sourcing is the *local* rule —
is with the lead and founder. D5 reports nothing until a shape is
approved.

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
  downloaded MinIO started by hand with the `.env.testing`
  credentials (plus a `claidor-development` MinIO user). **They die
  between turns** and restart in seconds from their surviving data
  directories — restart them before blaming a test.
- Heavy workbook jobs run alone; a concurrent pair OOM-killed a
  sweep on this hardware once.
