# Scribe — the Chain (Track D) — lane log

Plain-language running log, newest entry last. The lane's charter is
in `lanes.md`; the track is `swens-plan.md` § Track D. Owned paths:
`server/polar/tieout/chain/` (including its router file, mounted by
the lead at integration), `server/tests/tieout/test_chain*`,
`server/scripts/{corpus_documents,corpus_extract_pdfs}*`, and this
log.

## 25 August 2026 — lane opens

**Branch base, named as a deviation.** The session was opened on
`claude/scribe-chain-package-mtn71s`, whose tip (the PR #50 merge)
does not contain `notes.md`, `lanes.md`, or the last ten engine
commits. The pasted prompt says « from this branch's tip », but
`lanes.md` — read from `claude/pierce-phase-6-writing-mjkaj6`, where
it lives — says every lane branch bases on that branch's tip, and the
lane-prompts file confirms sessions were meant to start there. So
`swens/scribe` is based on `claude/pierce-phase-6-writing-mjkaj6`'s
tip (`265bfeb`), and this paragraph is the deviation named in
writing.

## Survey — what docling and pdfplumber need, and whether this network serves them

Everything below was measured on this container today, not recalled.
All installs went into a **throwaway venv in the session scratchpad,
outside the repository** — `server/pyproject.toml` and `uv.lock` are
untouched, per the one-pyproject-owner rule.

**The network serves both.**

- **PyPI**: `pypi.org` and `files.pythonhosted.org` both answer
  through the proxy.
- **pdfplumber 0.11.10** installs in seconds. Dependencies are
  light and pure: `pdfminer.six`, `Pillow`, `pypdfium2` — no
  compiled models, no downloads at runtime.
- **docling 2.121.0** installs, but the default resolution pulls the
  full CUDA stack (torch 502 MB, nvidia-cublas 403 MB, cudnn 349 MB,
  and friends): **≈ 2.5 GB downloaded, 5.2 GB on disk** — on a
  machine with **no GPU** (4 CPU cores). A CPU-only torch index
  would cut that by roughly two thirds.
- **docling's models** auto-download from Hugging Face on first
  conversion: ≈ 506 MB into `~/.cache/huggingface`. The old LFS host
  `cdn-lfs.huggingface.co` is blocked by the proxy (502), but
  current HF routing serves weights via `us.aws.cdn.hf.co`, which is
  allowed — verified with a real 2 MB range download and then the
  real thing.
- **End-to-end proof**: a real 38-page gov.uk PDF (Electricity
  Networks Strategic Framework appendix) converted successfully —
  4 pages in ≈ 27 s on CPU (~7 s/page), layout items carrying page
  number + bounding box, one table recognized with structure. OCR
  was off; scans are refused, not OCR'd, per the plan.
- **pdfplumber on the same file**: word-level text with bounding
  boxes, instantly.
- **Document sources are reachable**: the gov.uk search and content
  APIs, `assets.publishing.service.gov.uk`, and `ofwat.gov.uk` all
  answer through the proxy.

## Dependency proposal (for the lead — nothing added to the server env)

Per `lanes.md` frozen interface 5, proposed here before any install
into the project environment; the lead owns `pyproject`:

1. **`pdfplumber`** (≥ 0.11) — required for D1. Light, pure-Python
   chain; the citation core (numbers with boxes) stands on it.
2. **`docling`** (≥ 2.121) — **recommended as an optional extra**
   (e.g. `[chain-layout]`), used lazily for table structure and
   layout enrichment. It works here, but it is a 5 GB install plus a
   0.5 GB model cache for a machine with no GPU; the D1 core must
   not require it. If the lead wants it in the default env, the
   CPU-only torch index (`pytorch.org/whl/cpu`) is the way.

Until the lead approves, the chain package imports pdfplumber inside
functions and its tests skip with a plain message when the library
is absent — the engine's env and tests stay exactly as they were.

## D1 registration — written before any number is looked at

What D1 claims and how it will be measured:

- **Extraction contract**: for a text-layer PDF, every numeric token
  on every page comes out as (page number, raw text, parsed value,
  bounding box in PDF points, top-left origin) — the box tight
  enough that highlighting it highlights the figure. Sign from
  minus or accounting parentheses; currency/percent symbols kept in
  the raw text; **no unit inference** (units are Track E's).
- **Scan refusal**: a page whose text layer is effectively empty
  while images cover most of it is refused **in words naming the
  page and the reason** — never silently skipped, never OCR'd.
- **The corpus**: real PDFs fetched by `scripts/corpus_documents.py`
  (new, this lane) into a git-ignored directory — public regulator
  and gov.uk documents of the kind that quote model numbers. The
  corpus is re-fetchable, not committed, and unstable month to
  month; every measurement prints its own file count.
- **Measured and reported here**: documents, pages, numbers
  extracted, pages refused — and a hand spot-check of 10 randomly
  drawn extracted numbers (seeded draw, registered here as seed 271828)
  against the rendered page: the box must cover the digits. The
  spot-check verdicts go in this log with the failures counted, not
  narrated away.

## D1 built, run, and spot-checked — same day

**What was built.** `polar/tieout/chain/` now exists: `extract.py`
(the citation core — numbers with boxes, scans refused in words),
`router.py` (one stateless upload route serving the same contract;
the lead mounts it), and `tests/tieout/test_chain_extract.py`, whose
fixture is a three-page PDF assembled by hand, byte by byte, so the
tests know exactly what sits where. With pdfplumber present the
suite is 29 passed (verified on Python 3.14, the server's version);
in today's server env, which does not carry pdfplumber, it is 23
passed, 7 skipped with a sentence saying why. The engine is
untouched, and the engine's own conftest-free tests still pass here
(114 passed).

**One honest caveat on the router.** It could not be exercised over
HTTP in this container: importing *the engine's own* `endpoints.py`
or `auth.py` fails here with a pydantic/typing error that predates
this lane (verified against the untouched engine). The router
compiles, lints, and its test is written; it runs the day the env
does.

**The corpus.** `scripts.corpus_documents` fetched 20 PDFs — CMA /
CAA / NATS price-control submissions and responses, exactly the
document kind that quotes figures. Re-fetchable, git-ignored, not
committed; the sample is unstable month to month, so the counts
below print their own denominators.

**The D1 run** (`scripts.corpus_documents_extract`, on the corpus
fetched today):

- documents: 20 readable of 20 fetched
- pages: 640
- numbers extracted: 13,062 — each with page, printed text, parsed
  signed value, and a box in PDF points
- pages refused: 4, each in words naming the page — all four are
  genuinely image-only pages (scanned signature pages and annexes in
  otherwise-native PDFs), refused, not OCR'd

**The spot-check** (seed 271828, drawn as registered, crops with the
box drawn in red saved under the corpus directory):

| # | token | where | box covers the digits? |
|---|---|---|---|
| 01 | `105` (footnote number) | NATS reply, p. 28 | yes |
| 02 | `9.1` (« Figure 9.1 ») | CAA response, p. 80 | yes |
| 03 | `35` (paragraph number) | CAA response, p. 25 | yes |
| 04 | `45` | NATS SoC, p. 3 | yes |
| 05 | `(2019)` (a citation year) | AW/NW/WW submission, p. 18 | yes |
| 06 | `20` (page header) | NATS reply, p. 20 | yes |
| 07 | `5.33` | CAA response, p. 45 | yes |
| 08 | `1870` (« CAP 1870 ») | CAA response, p. 72 | yes |
| 09 | `2,735` (a table value) | Ryanair letter, p. 6 | yes |
| 10 | `2020.` (sentence-final year) | CAA response, p. 17 | yes |

**Verdict: 10 of 10 boxes cover their digits.** One value is wrong
and is recorded rather than smoothed over: #05, `(2019)`, is a
*citation year* in parentheses, and the accounting-negative rule
parses it as −2019. The box and the printed text are right; the
sign is not. A lone token cannot tell a Harvard citation from an
accounting negative — deciding from the token alone would be a
guess, and the lexer does not guess — so the rule stays literal and
this is filed as a known false-sign class for the linking stage
(D3), where label context exists to resolve it. Also visible in the
sample: most extracted numbers are *citational furniture* (footnote,
paragraph, page, figure numbers), which is expected — D1 extracts
everything, and D3's whole job is telling furniture from facts.

**docling and Python 3.14.** One survey addendum that matters for
the dependency decision: the server env requires Python ≥ 3.14, and
docling 2.121 **does resolve on 3.14** (116 packages, torch
included) — checked with a dry-run against a 3.14 interpreter. The
proposal above stands unchanged.

## D2 — the fact-store contract, proposed here before any database work

The contract below is the proposal; **no table, no migration, no
repository code exists or will exist until the lead approves it.**
It is written against what D3–D6 will need from it, so the store
never has to be re-cut: D3 anchors link proposals by labels near the
number, D4's confirmed links must survive document revisions, D6
re-points the deck tie-out at facts.

The shape, as JSON Schema (draft 2020-12):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "claidor:tieout/chain/fact",
  "title": "Chain fact — one printed number, cited to its page and box",
  "type": "object",
  "required": [
    "id", "document_id", "document_version_id",
    "page", "page_width", "page_height",
    "box", "text", "value", "line", "extractor"
  ],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string", "format": "uuid",
      "description": "Stable forever. D4's confirmed links hang off this id, so it never changes across re-extraction of the same document version."
    },
    "document_id": {
      "type": "string", "format": "uuid",
      "description": "The source document (the engine's artifact id)."
    },
    "document_version_id": {
      "type": "string", "format": "uuid",
      "description": "The exact version the page and box are true of. A revised document gets new facts; D4 re-anchors confirmed links by labels, never by coordinates."
    },
    "page": { "type": "integer", "minimum": 1 },
    "page_width": {
      "type": "number", "exclusiveMinimum": 0,
      "description": "PDF points, so a viewer can scale the box to pixels."
    },
    "page_height": { "type": "number", "exclusiveMinimum": 0 },
    "box": {
      "type": "object",
      "required": ["x0", "top", "x1", "bottom"],
      "additionalProperties": false,
      "description": "PDF points, top-left origin — highlight this and you highlight the figure.",
      "properties": {
        "x0": { "type": "number" },
        "top": { "type": "number" },
        "x1": { "type": "number" },
        "bottom": { "type": "number" }
      }
    },
    "text": {
      "type": "string", "minLength": 1,
      "description": "The token exactly as printed — currency, commas, percent and all. The authoritative record; value is derived."
    },
    "value": {
      "type": "number",
      "description": "Parsed magnitude with sign. No unit, no scale — units are Track E's, and a scale suffix stays in text."
    },
    "line": {
      "type": "string",
      "description": "The printed line the token sits in — the label neighborhood D3 matches on and D4 anchors by."
    },
    "extractor": {
      "type": "object",
      "required": ["name", "version"],
      "additionalProperties": false,
      "description": "Which code produced this fact, so a fidelity question is answerable years later.",
      "properties": {
        "name": { "type": "string" },
        "version": { "type": "string" }
      }
    }
  }
}
```

Two shapes ride along with it, named now so the router's contract is
whole: **serving** is `GET fact id ⇒ this object` (D2's one-line
promise), and a **refusal** is `{document_version_id, page, reason}`
with the reason in words — refusals are stored alongside facts so
« which pages were not covered » stays answerable forever, which D5
(the unsourced-number finding) depends on.

One deliberate absence: no `label` field distinct from `line`. Label
*selection* is inference (which words near a number name it), and
inference lives in D3 where it is measured — the store keeps only
what extraction determined. If D3's measurement shows it needs a
richer neighborhood than one line (the line above, a column header),
that is a schema bump proposed here, not a silent addition.

Next, once the lead has seen this: D2's serving routes against the
engine's storage, then D3.

## 26 August 2026 — standing orders acknowledged; D2 served

**The lead's channel, confirmed.** Per the founder's instruction and
`orders/README.md`: at the start of every working turn this lane
fetches `origin/claude/pierce-phase-6-writing-mjkaj6`, reads
`docs/pierce/orders/scribe.md`, does what it says, pushes to
`swens/scribe`, and stops. « Go » means exactly that. The lane branch
was fast-forwarded onto the integrated tip (`e37e3e1`) — the lead's
merge notes said the tip moved, and my four commits are all ancestors
of it. The orders' three claims were verified against the branch, not
taken on faith: pdfplumber is in `pyproject.toml`, the chain router
is mounted in `api.py`, and D2 stands approved in the orders file.

**The container is repaired — other lanes should hear this.** Every
`import fastapi` failed here with a pydantic `AssertionError`, which
is why my router could not be exercised over HTTP yesterday and why
Atelier was told to document if database fixtures cannot run. The
root cause was measured, not guessed: the container ships **Python
3.14.0rc2**, whose `ForwardRef` predates the final 3.14 that pydantic
2.12.5 expects. The fix, all local to the container, none of it
committed: a current `uv` (0.12.5, the bundled 0.8.17's manifest
stops at rc2), `uv python install 3.14` (3.14.7), the venv rebuilt on
it — plus native PostgreSQL 16, Redis, and a downloaded MinIO started
by hand with the `.env.testing` credentials. On that stack the whole
tieout suite runs: **680 passed, 8 skipped**, route-level tests
included. Route tests are possible in these containers; the recipe is
this paragraph.

**D2 is built and served, tests at the route level.**

- `chain/store.py`: `tieout_chain_facts` and `tieout_chain_refusals`,
  the approved contract as rows (box flattened into columns — the
  engine's everything-works-off-rows rule). Mapping, recorded:
  `document_version_id` = `tieout_artifacts.id`, `document_id` = that
  artifact's `lineage_id`.
- **Fact ids are deterministic** — UUID5 over (version, extractor
  version, page, ordinal, printed text) — honoring the approved
  schema's « never changes across re-extraction of the same document
  version »: extract twice, get byte-identical rows. A bumped
  extractor is new ids on purpose: different code, different claims.
- `chain/router.py` grew the serving routes:
  `POST /chain/documents/{id}/extract` (facts persisted at
  extraction, from the bytes the engine's storage kept),
  `GET /chain/facts/{id}` (the D2 one-liner), and
  `GET /chain/documents/{id}/facts` (the whole record, refusals
  alongside, so coverage is one call). Access is the workspace rule:
  deal membership on every route, 404 never 403 — a stranger holding
  a real fact id learns nothing a made-up id wouldn't teach.
- `extract.py` now records each number's printed **line** (the
  approved schema's label neighborhood) and stamps
  `EXTRACTOR_VERSION = "2"`.
- Tests: `test_chain_store.py`, 9 route-level cases through the real
  path — upload via the engine's artifacts route, extract, serve,
  re-extract idempotently, refuse a deck in words, refuse strangers
  with 404. All green; extraction tests now 31; tieout suite 680.

**Two touches outside my listed paths, named, not silent.** A fact
store cannot exist inside the package alone: (1) one import line in
`polar/models/__init__.py`, so the tables register in the metadata
that alembic and the test harness build from; (2) one new migration
file, `2026-08-26-0330_chain_facts.py`, revising the current head.
Both are new-file-or-one-line, neither touches another lane's files,
and both exist only because the orders command a persisted fact
store. If the lead wants either cut differently at integration, say
the word. (`alembic check` on this container reports a pile of
pre-existing drift across unrelated tables — none of it mentions the
chain tables, which match their migration exactly.)

## D3 registration — written before any matcher code exists

The order asks for the registered sample and judging protocol first.
Registered here, before a line of matcher exists:

**The task.** A typed model number (a `tieout_cells` row whose value
is typed, not computed) in a deal that also holds extracted
documents. The matcher proposes candidate facts from the store, or
abstains.

**The rule, from the plan verbatim:** matched **by labels near
both — never by value.** The cell brings its row and column labels;
the fact brings its printed line. Scoring is label affinity only.
The numeric value never enters scoring in any form — not as a
feature, not as a tiebreak, not as a filter. (Value-matching would
make every measurement circular and every link dishonest: the whole
point of a confirmed link is that the values may later *disagree*.)
**Abstention when candidates tie:** if the top two scores are within
the tie margin, the matcher proposes nothing, and that is recorded as
an abstention, not a failure.

**The sample.** The paired set is Ofwat PR24: real price-review
models and the published documents that quote them
(`corpus-sources.md` names this pairing as the reason PR24 exists in
our corpus; the lead's tenth-sweep note says the PR24 corpus is
resident). From the deal set, **30 typed model numbers drawn with
seed 314159** from the population of typed cells whose workbooks
pair with at least one extracted document. Draw registered now;
drawn only after the matcher is frozen for the round.

**The judging protocol.** For each of the 30, a person (me, judging
from the documents, blind to the matcher's score — candidates shown
in shuffled order without scores) reads the document pages and
records the ground truth first: « the document states this number at
page/box X », or « the document does not state this number ». Then
the matcher's output is compared:

| matcher says | truth says | verdict |
|---|---|---|
| proposes fact F | F is the stated place | true proposal |
| proposes fact F | stated elsewhere / not stated | false proposal |
| abstains | not stated, or genuinely ambiguous | true abstention |
| abstains | stated, unambiguous | missed |

**Reported numbers:** proposal precision (true proposals / all
proposals), abstention rate, miss rate — each with its denominator
printed. **No target is promised in advance**; the numbers are
whatever they are, and D3 ships to the product only when the founder
has seen them. Failures are counted in this log, not narrated away.

Next turn, unless the orders change: the matcher behind these
registered criteria, in the chain package, tests first.
