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
