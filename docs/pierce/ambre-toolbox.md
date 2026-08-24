# The Ambre toolbox — what exists in the world, what we own, what we adopt

20 August 2026. Three parallel investigations (calculation engines;
the spreadsheet-QA research field; document extraction, public data
and equivalence proving), verified against current sources, mapped
onto Ambre's components. Verdicts: **OURS** (built here, measured),
**ADOPT**, **TRIAL**, **LEARN-FROM**, **SKIP**.

The headline: for Ambre's two newest promises — shift-aware version
diff and automated behavioural (metamorphic) testing of workbooks —
**we found no open implementation**. The literature names the
methods; no code we could find ships them. Those are ours to take.

---

## 1. The Engine (static reading and checks)

**OURS.** The best published numbers on our finding classes: CACheck
86.8% precision / 71.0% recall on curated samples; ExceLint better
precision than CUSTODES (F 0.72) on the 70-workbook benchmark. Our
own measurement (80.1% A+B, 2.9% false positives) was taken on real
100k+-cell financial models — **a different measure on different
files, so the figures are not comparable and must not be quoted side
by side.** The comparison only becomes credible when both tools run
on the same corpus, which is exactly why archiving the CUSTODES
benchmark is this document's first action. What is fair to say
today: none of the published tools fold findings, rank by
materiality, or state coverage.

- **ExceLint** (OOPSLA'18, Apache-2.0, live TypeScript at
  github.com/ExceLint/ExceLint-core) — **LEARN-FROM + BENCHMARK.**
  Its reference-vector « fingerprint » is a cousin of our
  `_shape_list`; the rectangular-decomposition idea may strengthen
  block-level inconsistency detection. It is also the published bar
  any credibility claim must beat.
- **XLParser** (SANER'15, github.com/spreadsheetlab/XLParser) —
  **ADOPT the grammar.** 99.9% parse rate validated on ~1M real
  formulas; the paper enumerates every dark corner (intersection
  operator, quoting, R1C1, structured refs). Port productions into
  our fault-tolerant reader as cases arise; don't run the C#.
- **Melford** (MSR 2017, paper only) — **LEARN-FROM.** Independent
  validation of the hardcode-detection thesis; note the Microsoft
  patent (US 11,080,475) for an IP glance before any neural version.
- **CUSTODES annotated benchmark** (1,974 labelled defect cells — the
  only cell-level ground truth in existence) + **Enron corpus**
  (figshare, alive, CC) — **BENCHMARK.** The primary HKUST server
  was returning 503; **archived — our copy lives in
  `docs/pierce/custodes/` (subjects, ground truth, results, hashed),
  saved from the group's `castle.cse.ust.hk` mirror the day this
  document was written.** Note: corpora are `.xls` —
  convert once through LibreOffice headless (which also unlocks the
  old accuracy-backlog blocker that stalled on `.xls` reading).
- SpreadsheetLLM's SheetCompressor encoding (2024) — **LEARN-FROM**
  if an LLM layer is ever added; **FLARE** (2025) is the benchmark
  showing LLMs fail multi-step audits — which is the market argument
  for our typed engine, in a citable paper.

## 2. Behavioural checks and the recalculator (Engine + Watch)

**Decision: LibreOffice ≥ 25.8 headless via UNO as the primary
engine; Microsoft Graph's Excel API as the fidelity arbiter; the
Python `formulas` library as an optional third leg.**

- **LibreOffice** — **ADOPT.** MPL-2.0. The only free engine with
  true iterative circular calculation and full xlsx round-trip
  (reads Excel's cached values, writes fresh ones). ~500 functions;
  24.8/25.8 added XLOOKUP, LET, FILTER, the array stack. Hard-won
  specifics from the research: use the UNO socket path with
  `calculateAll()` (the CLI convert path does not reliably recalc);
  **push the file's own `calcPr` iteration settings into the
  document via UNO yourself** — don't trust import mapping; run a
  pool of long-lived soffice workers, one document per process,
  recycled every N files (it leaks); pin ≥ 25.2, ideally 25.8
  (distro 7.x lacks XLOOKUP/LET). Known gaps: **no LAMBDA**, spill
  semantics differ, iterative convergence order legitimately differs
  within epsilon.
- **The validation gate** (Ambre §5 made concrete): per file, read
  Excel's cached values first, recalc unchanged, diff cell-by-cell —
  relative tolerance ~1e-9 on plain chains, convergence-based
  tolerance inside iterative cycles — and prescan formulas for a
  denylist (LAMBDA, CUBE*, RTD, UDFs, external links) that routes to
  the arbiter or an honest refusal.
- **Microsoft Graph Excel API** — **TRIAL as arbiter.** Real Excel
  in the cloud: createSession → set inputs → `application/calculate`
  (Full) → read. Excel-perfect fidelity, and **we already own the
  OAuth/tenant plumbing** (`polar/connector/graph.py` does auth,
  drives, download today — the workbook endpoints are the same stack
  one family over). Wrong for batch (5-minute sessions, sequential
  per workbook, undocumented throttling, ~4MB payloads, chunked
  reads) — right for deciding, when a file fails the LibreOffice
  gate, whether the file or LibreOffice is at fault, and for serving
  low-volume Excel-perfect reruns.
- **`formulas`** (vinci1it2000, EUPL, active — Mar 2026 release) —
  **TRIAL.** ~250 functions, explicit circular solving, compiles a
  workbook once then re-runs scenarios cheaply: the natural engine
  for high-frequency sweeps on one validated model, cross-checked
  against LibreOffice on a sample.
- **SKIP, with reasons on file:** HyperFormula (GPL for our use, no
  iterative calc — any circularity returns #CYCLE, statically);
  pycel (dead 2021) and xlcalculator (dormant 2023); EPPlus
  (circular refs throw or become empty — no convergence); SpreadJS
  (UI product, per-hostname licensing); NPOI/SheetJS-Pro (partial
  evaluators). Gnumeric `ssconvert --recalc` kept as an emergency
  third opinion. **Escape hatch if LibreOffice's fidelity failure
  rate proves too high:** Aspose.Cells (~$1.2–1.7k/developer), the
  only commercial engine with genuine Excel-style iterative calc.
- **Metamorphic testing** (volume→0, price×2, currency rescale) —
  relations taxonomy exists in the literature (Poon et al. 2014,
  2017, human-executed); **we found no automated metamorphic
  testing over xlsx. We build it and own it.**

## 3. The Watch (versions, and proving what did not change)

- **SheetDiff** (VL/HCC 2010) — **LEARN-FROM, then own.** The greedy
  row/column insert/delete hypothesis algorithm is directly
  implementable, and its follow-up paper's **planted-edit evaluation
  method is literally our planter discipline applied to diff** —
  measure shift-detection recall on edits we planted ourselves.
  **We found no open-source shift-aware spreadsheet diff.** The
  incumbent (Microsoft Spreadsheet Compare, Office Pro only,
  Windows-only, no API) is purely positional — its weakness is our
  feature.
- **Equivalence between versions — the three-tier claim,** which
  replaces the Ambre document's « every possible set of inputs »
  sentence: **(1) proven equivalent** — changed cells whose formulas
  fall in the arithmetic/IF/SUM fragment get compiled to Z3 and
  proven (`f1≠f2` UNSAT; counterexample when SAT). No off-the-shelf
  Excel→SMT encoder exists; VeriEQL (OOPSLA'24) and EqDAC (ICSE'23)
  give the encoding pattern. Breaks on lookups over data-dependent
  ranges, text, volatiles, IEEE-754 exactness. **(2) no divergence
  in N samples** — randomized differential evaluation over the
  changed cells' cone of influence, with branch-aware input choice;
  Schwartz–Zippel gives real probabilistic guarantees on polynomial
  formulas. Covers every construct. **(3) not comparable** — named
  constructs, honest refusal. The tiers are never blurred, per the
  trust commitments.

## 4. The Chain (documents, citations, outward checks)

- Today we use **pypdf** — page-accurate (the « p.42 » citations),
  no coordinates. The click-to-highlight source viewer needs boxes:
- **docling** (IBM, MIT, active) — **ADOPT.** Layout + TableFormer
  table structure + provenance (page + bbox) as a single design;
  its docling-parse layer exposes word/character coordinates.
- **pdfplumber** (MIT) — **ADOPT as companion.** Native word-level
  bboxes on digital PDFs: docling finds the table cell, pdfplumber
  pins the exact token « 412,300 » box. Store
  `(value, page, x0,y0,x1,y1, engine)`; render highlights over
  PDF.js.
- **Azure Document Intelligence Layout** (~$10/1k pages) — **TRIAL**
  for scanned/degraded documents only. **SKIP:** PyMuPDF (AGPL
  unless paid), marker/surya (revenue-capped model weights),
  unstructured.io (element-level only), Camelot kept as a narrow
  ruled-table fallback.
- **Outward checks — four free integrations carry it:**
  **SEC EDGAR** `companyfacts` JSON (every structured fact a US
  filer ever filed, keyed to the source filing, no key, 10 req/s;
  nightly bulk ZIPs) — the « model says 412, filing says 409 » check
  with no parsing. **Companies House** (free key, 600 req/5min,
  ~97% of accounts as iXBRL, free bulk product) parsed with
  **arelle** (Apache-2.0, actively maintained; python-xbrl is dead).
  **Rates:** FRED (free key), NY Fed markets API (SOFR, no key),
  Bank of England IADB (stable CSV endpoint; SONIA next-day free),
  ECB SDMX (€STR, no key). UK regulator determinations stay
  documents — they come through the PDF pipeline, not an API.

## 5. Units (the hardest new promise)

- **Williams, Negreanu, Gordon, Sarkar (Microsoft, VL/HCC 2020)** —
  **the blueprint.** Constraint solving + probabilistic unit
  labelling from number formats, formulas and textual labels; the
  only modern reference. No released tool — the field is open, and
  nothing since 2020 does label-driven scale inference for finance.
- **XeLda** (ICSE'04) — the cautionary tale: it worked and died
  because it required manual annotations. **The check must be
  inference-only or it will not be used.**
- Plan stands as written in the assessment: protocol → seeded ground
  truth → judged measurement before product code.

## 6. What we already owned before asking

openpyxl reader + tokenizer (with our fault-tolerance layer) · the
measured engine and its five disciplines · the planter (which is
also the diff-evaluation method per SheetDiff's follow-up) · the
corpus gate · pypdf page-cited extraction (`tieout/source.py`) · the
Dumfries contract-to-model linker · the write path A1 (surgical,
byte-preserving — which no library offers) · **the Microsoft Graph
connector** (auth, drives, download — the hard part of the
Excel-API arbiter) · fpdf2, lxml · the regulator corpora and their
manifests.

## Actions this document creates, in order

1. **Archive the benchmarks now** — CUSTODES via Wayback (server
   503), Enron via figshare — into our corpus store; convert `.xls`
   → `.xlsx` with LibreOffice headless.
2. **B1/B2 proceed on the researched architecture**: LO ≥25.8 UNO
   worker pool + calcPr push + validation gate + denylist; Graph
   arbiter wired through the existing connector.
3. **The Watch's equivalence ships as the three-tier claim**;
   Ambre's prose updates to match (no « every possible input »
   outside tier 1).
4. **Compare implements SheetDiff's algorithm** and is measured by
   planted edits.
5. **Units starts from Williams 2020**, as a measurement protocol
   first.
6. **Benchmark run against ExceLint on the archived CUSTODES
   corpus** — same files, same ground truth, both tools. Only then
   does a head-to-head number exist at all.
