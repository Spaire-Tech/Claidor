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
