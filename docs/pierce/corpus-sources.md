# Where to find real, messy financial models to test Pierce against

Founder-supplied research, filed 13 August 2026. This is the sourcing
map for paying down the measurement debts in
[accuracy-backlog.md](accuracy-backlog.md) — in particular the ones
that require **files nobody on the team made**: crosscheck
precision/recall against a foreign model+document pair, audit-rule
precision adjudication, a memo corpus, and solo recall.

Two claims below are recorded as the research states them but were not
independently verified at filing time and must be checked live during
the harvest: the Finch/FinWorkBench dataset's existence and contents,
and the exact current URLs (regulator pages move). One product check to
run before counting on the Ofgem files: whether Pierce's upload path
accepts `.xlsm` at all.

---

## TL;DR

- The two best places to start tomorrow are **Ofwat's PR24 water
  price-review models** (UK, native Excel `.xlsx`/`.xlsm` with live
  formulas, Crown copyright/Open Government Licence, and — crucially —
  a published "queries" document that quotes exact cell references)
  and **US state utility rate-case discovery workpapers** (California
  CPUC and Texas PUC, native `.xlsx` quoted line-by-line in testimony
  PDFs). Both give you the paired "model + document that quotes its
  numbers" you need, legally.
- The academic corpora are real and downloadable, but most preserve
  values or general spreadsheets, not confidential-grade financial
  models. **Finch/FinWorkBench** (posted to arXiv 15 Dec 2025,
  accepted to ACL 2026 Findings, CC BY 3.0) is the closest to the
  target: 1,710 real spreadsheets with formulas preserved and tasks
  that match figures in PDFs to workbook cells. The **Enron
  spreadsheet corpus** is the largest real, messy, multi-author set
  but is old (pre-2002) and largely non-financial-model.
- Twenty usable, formula-preserving test files are assemblable in
  **one to two working days**, almost entirely from Ofwat, Ofgem
  RIIO-3 and CPUC/Texas PUC. The hardest missing piece — a private LBO
  with three analysts' fingerprints — has no exact legal substitute,
  but regulated-utility business-plan models and rate-case workpapers
  reproduce most of the "spaghetti" that matters (named ranges,
  cross-sheet links, hardcoded overrides, adjusted-vs-unadjusted
  labels).

## Key findings

1. **Native Excel, with formulas, is genuinely downloadable from
   regulators.** UK water (Ofwat), UK energy (Ofgem), and several US
   state utility commissions publish or attach working Excel models.
   This is the richest legal seam.
2. **"Paired artifacts" exist and are better than expected.** Ofwat
   publishes a queries document that quotes specific cells and values
   from its `.xlsx` models. US rate-case testimony PDFs quote
   workpaper filenames and the exact numbers inside them. These are
   real document-to-cell pairs.
3. **The academic corpora mostly are not financial models.** EUSES,
   FUSE and the Enron set are general or old. Finch is the exception
   and is worth downloading first among the research datasets.
4. **Beware the traps.** Many commissions and companies publish only
   PDFs. Some datasets preserve values but strip formulas. Some famous
   corpora have been withdrawn from their original hosts.

## Details

### A. US public utility commission rate cases (native Excel workpapers)

Rate cases are the closest US analogue to a messy corporate model: a
utility asks a state commission to raise prices, and files a
revenue-requirement model plus hundreds of supporting workpapers. The
numbers in the testimony are meant to trace back to the workbooks.

- **California CPUC** — The document portal docs.cpuc.ca.gov serves
  testimony and workpapers mostly as PDF, but the live `.xlsx` files
  are attached in the discovery record and are quoted by filename and
  value inside the testimony PDFs. Concrete dockets: **A.23-05-010**
  (Southern California Edison 2025 General Rate Case), where
  intervenor TURN explicitly demanded "workpapers in Excel with all
  cells active" and got files like
  `TURN-SCE-117, Q. 63 (Fuel Cell).xlsx` supporting Table VII-12; and
  **A.25-05-009** (PG&E 2027 GRC). There is also an open directory at
  `files.cpuc.ca.gov/puc/telco/datarequests/` with directly clickable
  native `.xls` files. This is the single best US pairing: a PDF that
  quotes a number, plus the live Excel workpaper behind it. One
  caution: SoCalGas and SCE in some volumes did *not* PDF their
  largest Excel models (e.g. the risk-spend-efficiency calculators)
  and instead offer them "upon request" — which confirms the live
  models exist and are obtainable.
- **Texas PUC** — The clearest on-the-record confirmation of native
  Excel. In **Docket No. 51415** (Southwestern Electric Power Company
  rate change), a PUC filing states it contains "the native format
  Excel files of the number running workpapers from staff," including
  `51415 SWEPCO PFD revenue requirement.xlsx` and
  `51415 PFD Schedule B.xlsx`, delivered as a ZIP on the PUC
  Interchange.
- **Michigan MPSC** — Filing rules require workpapers "in native
  Microsoft Excel format" and require that "the exhibits shall include
  the formulas that explain the relationship among the exhibit rows."
  However, the E-Dockets public filing system requires filed documents
  to be PDF; the live Excel is provided in discovery. Live examples:
  DTE Electric case **U-21860** (opened Feb 2025), and Consumers
  Energy **U-21816 / U-21829**, where testimony references Excel
  workpapers with "data, formulas and links" on specific tabs. Getting
  an MPSC E-Dockets account is a two-step MILogin-for-Business
  process.
- **Other states** — New York DPS/PSC, Ohio PUCO, Minnesota PUC,
  Colorado PUC and Massachusetts DPU run the same kind of proceeding.
  Practice on native-file availability varies; some post PDFs only.
  CPUC and Texas are the most reliable starting points.

**Licence:** US state regulatory filings are public records, freely
downloadable. No formal open licence, but effectively public-domain
access. Safe to test privately; quoting small excerpts publicly is
normal, but check for confidential/redacted markings on any specific
file.

### B. FERC filings

- **FERC Form 1** (annual report of major electric utilities) contains
  full financial statements. But the native format is a Visual FoxPro
  database (1994–2020) and XBRL (2021 onward) — not Excel workbooks
  with formulas. Third parties (Catalyst Cooperative's PUDL project; a
  Department of Energy dataset on data.gov and data.openei.org titled
  "FERC Form 1 Electric Utility Cost… 1994-2019.xlsx") republish it as
  spreadsheets, but these are flat data tables, not models with
  formulas. **Verdict: useful as messy data, not as a formula model.**
  Lower priority for Pierce.

### C. UK and EU regulatory price reviews (strongest single seam)

- **Ofwat PR24 (water, England & Wales)** — The best starting point.
  Ofwat publishes the PR24 financial model as a standalone Excel
  workbook — "the version that companies are expected to submit with
  their business plans" and "the version that Ofwat will use for draft
  and final determinations." It is built to the FAST modelling
  standard (formula-driven). Direct files include the per-company
  model `PR24-FD-FM02-Financial-model-Anglian-Water.xlsx`, base-cost
  feeder models like `PR24-FD-CA05-Base-costs-water-model-3.xlsx`, and
  a mapping tool
  `PR24_Business_plan_tables_to_financial_model_mapping_tool_v4.xlsx`.
  The landing page is the "Final determinations models" page under the
  2024 price review
  (ofwat.gov.uk/regulated-companies/price-review/2024-price-review/final-determinations-models/),
  which itself notes: "For optimal viewing, please download and open
  files using Microsoft Excel rather than in your web browser."
  **Paired document:** Ofwat's "PR24 FD inbound queries" document
  quotes specific cell references (e.g. "Cell C11 and C12") and values
  from named `.xlsx` models — a genuine document-to-cell reference to
  score against. The "mapping tool" designed to link the business-plan
  data tables to the financial model is itself a pre-built
  figure-to-cell correspondence usable as ground truth.
- **Ofgem RIIO-3 (energy networks)** — The RIIO-3 Final Determinations
  decision page (published Dec 2025, models added Feb 2026) hosts
  large macro-enabled `.xlsm` models with live formulas: Gas
  Distribution Business Plan Financial Model (`.xlsm`, ~16.65 MB),
  Electricity Transmission BPFM (`.xlsm`, ~13.69 MB), Gas Transmission
  BPFM (`.xlsm`, ~13.63 MB), a Cost of Debt model (`.xlsm`,
  ~25.71 MB), and a WACC rates model (`.xlsx`, ~7.64 MB). Ofgem notes
  some of these files "are not fully accessible" — meaning they are
  full working models, not stripped exports. Company versions (e.g.
  Northern Gas Networks' `GD3_BPFM_v7b`, published as a redacted
  `.xlsm`/PDF pair) are on company websites, and the redaction notes
  themselves quote exact cell addresses and formula changes (e.g.
  "LicenseeInputs AU879:AY879"; "Row 260 changed from …"). **These are
  large, complex, cross-sheet, macro-driven models — very close to the
  target, and they come with change-logs that name cells.**
- **CAA (Heathrow/NATS), Ofcom, and equivalents (Ireland CRU,
  Australia AER, NZ Commerce Commission, Canada)** — Not separately
  verified in this research; likely similar but confirm native-file
  availability before relying on them. The Australian AER in
  particular publishes "PTRM" (Post-Tax Revenue Model) and "RFM"
  (Roll Forward Model) Excel templates for each electricity/gas
  determination — worth checking as a close analogue to Ofgem.

**Licence:** Ofwat and Ofgem content is Crown copyright, reusable
under the Open Government Licence (OGL) — usable privately and
quotable publicly with attribution. Company-submitted models published
by the regulator are effectively public.

### D. Development banks and PPP model repositories

- **World Bank / PPIAF** — Native `.xls` project-finance models with
  formulas and macros. Confirmed direct files: the Port Reform Toolkit
  financial model (`Copy of fin_mode.xls`) on ppiaf.org, and the
  Toolkit for Public-Private Partnerships in Roads & Highways, which
  ships two toll-road Excel models (a "graphical" and a "numerical"
  BOT concession model with tolls, subsidies, three debt tranches,
  depreciation and debt-service cover). The user guide instructs you
  to enable macros — i.e. they are live models, and the guide notes
  the base data "has been obtained from real highway concession
  contracts in Eastern Europe." **Smaller and cleaner than a real deal
  model, but genuine, formula-driven project-finance models, free and
  legal.**
- **ADB, EIB, IFC, Global Infrastructure Hub** — Not separately
  verified; likely hold similar toolkit models. Confirm before
  relying.

**Licence:** World Bank/PPIAF materials are generally open-access
(CC BY) with an attribution requirement and a liability disclaimer.
Safe to test and quote.

### E. UK government business cases and open data

- **HS2 and Green Book five-case business cases** — The published
  financial and economic cases (e.g. `financial-case-hs2.pdf`,
  `hs2-economic-case.pdf`) are PDFs, not Excel. The Green Book
  "templates and support material" on gov.uk are templates, not
  populated models. **Verdict: mostly PDF; low priority for
  native-file testing, though excellent as documents that quote model
  outputs.**
- **data.gov / data.gov.uk** — Hold many `.xlsx` datasets but mostly
  flat tables, not models. Useful for messy data, not formulas.

### F. Bankruptcy and restructuring dockets

- Chapter 11 disclosure statements always contain a **liquidation
  analysis** and **financial projections**. These are the banker-style
  artifacts wanted — but on claims-agent sites (Kroll, Verita, Epiq,
  Stretto, Donlin Recano) and PACER they are published almost entirely
  as **PDF**, not native Excel. **Verdict: rich documents, but native
  Excel is rare. Use these as the "document" side of a pair only if
  the matching model can be found, which is usually not filed
  natively.**

### G. Municipal bond disclosure (MSRB EMMA)

- EMMA (emma.msrb.org) is the SEC-designated official repository for
  municipal securities disclosures, including feasibility studies for
  toll roads, stadiums and utilities. But documents are posted as
  **PDF official statements and engineer's reports**. Native Excel
  models are not the norm. **Verdict: good for feasibility-study
  documents, weak for native models.**

### H. SEC EDGAR

- **`Financial_Report.xlsx`** — Every 10-K and 10-Q filing has an
  auto-generated `Financial_Report.xlsx` attached (URL pattern
  `.../Archives/edgar/data/<cik>/<accession>/Financial_Report.xlsx`).
  But this is a rendered export of tagged XBRL values — **flat
  statements, no formulas, no cross-sheet logic.** Useless for
  Pierce's core test.
- **De-SPAC and merger S-4 projections** — S-4 registration statements
  reproduce management's financial projections as HTML tables
  (examples: DENTSPLY/Sirona, IMARA/Enliven, Diffusion/EIP). These are
  the "document" side of a pair — a deck-style projection quoted in a
  filing — but the **underlying model is not filed**, so you only get
  the document, not the model. Still valuable as realistic "printed
  figures" to trace, but sourcing the matching model would mean
  building it — which violates the rule against self-made fixtures.

### I. Academic and benchmark spreadsheet corpora

- **Finch / FinWorkBench** (arXiv:2512.13168, posted 15 Dec 2025;
  huggingface.co/datasets/FinWorkBench/Finch;
  github.com/FinWorkBench/Finch) — Accepted to ACL 2026 Findings on
  6 April 2026. Per Dong et al. (2025): "This yields 172 composite
  workflows with 384 tasks, involving 1,710 spreadsheets with
  27 million cells, along with PDFs and other artifacts." Sourced
  primarily from Enron (~15,000 spreadsheet files) and the EUSES
  corpus (~450 financial spreadsheets), extended with 2024–2025
  artifacts from investment/securities firms, the World Bank, and
  Canadian and British government agencies. **Formulas are
  preserved** — the paper describes tasks writing native Excel XNPV
  formulas and "sheets [that] contain a large number of formulas that
  encode latent business logic, temporal assumptions, and fine-grained
  dependencies." **Crucially, "cross-sheet/file retrieval" is a named
  task type, and several tasks require matching a figure in a PDF or
  image to a workbook cell** (e.g. task ids 3, 4, 16, 42, 48, 63,
  68). Source files are directly downloadable (e.g.
  `.../resolve/main/files/0/0_src_0.xlsx`). The benchmark is hard even
  for the best systems — "GPT-5.1 Pro spends an average of
  16.8 minutes per workflow yet passes only 38.4% of workflows" (Dong
  et al.), which says these files are genuinely messy. **Licence:
  CC BY 3.0 (US).** The single most relevant research dataset —
  download it first among the academic sets. *(Unverified at filing
  time — check live.)*
- **Enron spreadsheet corpus** (SheetJS/enron_xls on GitHub; EDRM
  v2) — The largest genuinely real, multi-author, in-the-wild set. Per
  Hermans & Murphy-Hill (ICSE 2015), it holds **15,770 analyzable
  spreadsheets (16,189 unique by MD5, drawn from 51,572 Excel files
  among 265,586 email attachments)**, containing 79,983 worksheets —
  an average of 5.1 per spreadsheet. On messiness: 9,120 of the
  spreadsheets contain formulas, and "24% of Enron spreadsheets with
  at least one formula contain an Excel error," while "76% of
  spreadsheets … use the same 15 functions." The cleaned Nuix version
  was withdrawn; the SheetJS project preserves a download path via the
  Internet Archive with a `parse.mjs` script, in original formats
  (BIFF2, XLS, etc.), de-duplicated by MD5. Downsides: pre-2002, many
  are budgets/trading sheets rather than deal models, and file formats
  are old. On PowerPoint: the corpus's `.ppt` attachments exist in the
  underlying email archive, but **no published, extracted-and-cleaned
  set of Enron `.ppt` decks paired to the same spreadsheets appears to
  exist** — extracting it from the PST files is possible
  (`pst-extractor` + SheetJS) but is real work, for 20-year-old
  results.
- **EUSES** — ~4,000–5,600 spreadsheets in six categories including
  "Financial" and "Modeling," gathered by web search. Available via
  the tera-PROMISE repository and a modified fault-seeded version at
  spreadsheets.sai.tugraz.at (TU Graz). Real but mostly small and
  non-corporate.
- **FUSE** — ~249,376 unique spreadsheets scraped from over 26 billion
  web pages; reproducible, but general-purpose, not financial models.
- **VEnron2 / VEUSES / VFUSE** (microsoft/TableSense;
  castle.cse.ust.hk/venron) — "Versioned" corpora that group
  spreadsheets into evolution groups (VEnron2: 1,609 groups, 12,254
  spreadsheets; VEUSES: 177 groups, 363 sheets; VFUSE: 188 groups,
  1,143 sheets). Useful because versioning mimics multi-author edits,
  but derived from the same Enron/EUSES/FUSE bases and converted
  `.xls`→`.xlsx` (which can alter formulas). Requires leaving contact
  information to download.
- **SpreadsheetBench** (arXiv:2406.14991; spreadsheetbench.github.io;
  huggingface.co/datasets/KAKA22/SpreadsheetBench) — Per Ma et al.
  (2024): "912 instructions and 2,729 test cases, with an average of
  three test cases per instruction," all `.xlsx`, ~111 MB, CC BY 4.0.
  Real and messy but forum-sourced single-user problems, not corporate
  financial models. A newer "V2" focused on business spreadsheet
  workflows is announced on the project site.
- **SheetCopilot, microsoft/TableSense datasets** — General
  spreadsheet manipulation, not financial-model corpora.

## Recommendations

**Day 1:**

1. **Ofwat PR24 "Final determinations models" page.** Download 6–8
   files: the per-company financial model (`PR24-FD-FM02` Anglian),
   two or three base-cost feeder models, the
   business-plan-tables-to-financial-model mapping tool, and the
   "PR24 FD inbound queries" document. That is native `.xlsx` models
   *plus* a document that quotes specific cells — a ready-made scoring
   set for link accuracy, with the mapping tool as partial ground
   truth for free.
2. **Ofgem RIIO-3 Final Determinations.** Download the three Business
   Plan Financial Models (`.xlsm`) and the Cost of Debt and WACC
   models. The largest, most spaghetti-like legal models available —
   macros, cross-sheet references, many tabs — and the company
   redaction change-logs name exact cells.

**Day 2:**

3. **CPUC docket A.23-05-010 (SCE 2025 GRC)** and **Texas PUC Docket
   51415** — pull the native `.xlsx` workpapers and the testimony PDFs
   that quote them. US-style, adjusted-vs-unadjusted,
   hardcoded-override messiness with real document pairs.
4. **Download Finch/FinWorkBench** from HuggingFace (CC BY 3.0). Use
   its cross-file-retrieval tasks (figure-in-PDF → cell-in-workbook)
   as a direct, pre-labelled benchmark for exactly what Pierce does.

**Twenty usable test files:** achievable in one to two working days.
Roughly: 8 from Ofwat, 5 from Ofgem, 4 from CPUC/Texas, 3 from
PPIAF/World Bank — all native, formula-preserving, all with clear
licences.

**Benchmarks that would change the plan:**

- If proposed-link precision on the Ofwat/Ofgem models is **above
  ~90%**, the design holds — immediately seek harder cases (Enron
  deal-style sheets, restructuring models) to find its breaking point.
- If precision is **below ~60%** on these clean, well-labelled
  regulator models, fix the engine before touching messier
  private-style files — the problem is fundamental, not data quality.
- If genuine multi-author "fingerprints" are needed, add the **Enron
  spreadsheet corpus** and **VEnron2** version groups, accepting the
  age and format trade-offs.

## Caveats and honest flags

- **No exact substitute for a private LBO exists legally.**
  Confidential PE/IB models are not public. Regulated-utility
  business-plan models are the closest: they share the structural mess
  (named ranges, cross-sheet links, hardcoded overrides,
  adjusted-vs-unadjusted labels) but not the deal-specific logic
  (management-case toggles, sponsor return waterfalls). This tests
  structure, not deal semantics.
- **PDF-only traps:** Bankruptcy dockets, MSRB EMMA feasibility
  studies, HS2/Green Book business cases, and most SEC S-4 projections
  give documents, not native models.
- **Values-not-formulas traps:** SEC `Financial_Report.xlsx`, FERC
  Form 1 spreadsheet republications, and most data.gov/data.gov.uk
  files preserve numbers but not formulas.
- **Withdrawn/moved corpora:** The cleaned Nuix Enron set was removed;
  use the SheetJS/Internet Archive path. VEnron requires a contact
  form. Some tera-PROMISE/EUSES links have moved — the TU Graz mirror
  is the most reliable.
- **Format-conversion risk:** VEnron2/VEUSES/VFUSE were converted
  `.xls`→`.xlsx`, which can silently change or drop formulas. Prefer
  original-format files where formula fidelity matters.
- **CPUC nuance:** the docs.cpuc.ca.gov portal serves testimony as
  PDF; the live `.xlsx` sits in the discovery record and is quoted
  (filename + value) inside the PDF. The cleanest directly-clickable
  native Excel are the `files.cpuc.ca.gov` directory and the Texas PUC
  ZIP.
- **Finch task count:** the public HuggingFace split displays 172
  workflow rows in the data viewer; the "384 tasks" figure refers to
  decomposed sub-tasks within those 172 composite workflows. Use them
  consistently.
- **Enron `.ppt` pairing** — the tantalising "same-thread deck +
  model" pairing is not published as a ready dataset; extracting it
  from the PST files is possible but is work, and the result would be
  more than 20 years old.

---

## Addendum, 26 August 2026 — the founder's research corrects this file

The record first: `closed-deal-ground-truth.md` concluded from the
Dumfries & Galloway pair that the Scottish project agreements redact
every model-shaped figure, and that conclusion quietly became « the
Scottish contracts are censored ». **The founder checked fifteen
deals; seven leave the principal money figure visible.** One deal was
true; the generalization was ours and it was wrong. Corrected here.

### The Scottish deal pairs (document-feeds-model — D3's missing direction)

~30 NPD/hub deals publish both halves free, no NDA: the signed
project agreement and the financial close model
(scottishfuturestrust.org.uk — reachable from the containers, HTTP
200). The founder hand-verified two end to end:

- **Levenmouth Academy**: contract « £3,741,000 a year » ↔ model cell
  `3.741` labelled « Unitary Charge » (a millions sheet — scale and
  wording differ, the link is exactly D3's task). Contract « 22% »
  indexation ↔ cell « Gearing of Unitary Charge to Indexation ».
- **Oban & Campbeltown**: contract £4,912,193 ↔ model 4,912,193.07.
- **Kelso**: the model carries a hand-written provenance tab — **73
  rows of « clause → term → figure »** (« Schedule 1 → Base Credit
  Facility → £21,461,602.52 », « Loan Agreement → Margin →
  3.349% ») — a marking scheme written by the deal team at close,
  independent of us.

Named limitations, stated before any measurement: the published
models are **formula-stripped** (every cell a value), so typed vs
computed cannot be read from the file — a registered convention
(e.g. « input tabs count as typed ») must be declared openly; the
contracts are **OCR'd photocopies** (garbled letters, numbers
survive better); some referenced loan agreements were **never
published**, so part of Kelso's 73 rows points at unavailable
paper.

### Also from the founder's research (each verified reachable where noted)

- **MCC ERR models** (mcc.gov/our-impact/err/, HTTP 200): ~100 real
  third-party `.xls/.xlsx/.xlsm` across ~30 country programmes.
  Narrative docs are model-derived (the Ofwat direction), but input
  sources (feasibility studies) are often published — one road
  project decides that. Independently valuable as round-4 unseen
  corpus for the engine — and general spreadsheets may make A3
  candidate 3 (beat families) measurable.
- **EDGAR EX-10 credit agreements**: unredacted economic terms,
  HTML, full-text search since 2001 (the tested search endpoint
  returned 403 from here; the www.sec.gov document paths are the
  ones to verify at fetch time).
- **Smoke-test pairs**: ModelOff cases, A.CRE (case + solution
  model), Bodmer's library, HBS/Ivey/Darden case+spreadsheet pairs
  (paid, ~$10 each).
- **FinWorkBench (Finch)** on HuggingFace (HTTP 200), CC BY 3.0:
  172 expert-annotated workflows incl. document-grounded extraction
  with reference outputs — the only hand-annotated ground truth of
  this exact shape.

### 27 August — the Scottish route is closed; the pivot

The Scottish deal pairs are **unobtainable by any automated route**,
and the failure is structural, not effort. Recorded so nobody spends
another day on it:

- Origin (`contracts.scottishfuturestrust.org.uk`): TLS certificate
  expired 10 July 2026, issued for the wrong host. Every honest
  client refuses it. Verified from the lead's container and by
  Scribe independently.
- Internet Archive: agreements truncate at exactly 1,048,576 bytes
  (verified twice — a hard cap on that path, not a coincidence); the
  **financial models are not archived at all** (every snapshot
  predates their publication). Save Page Now rate-limits anonymous
  robots (429 on first attempt).
- The founder's browser: the site is refused client-side on their
  machine.
- The founder's research agent: its file-writing sandbox cannot
  reach the host, and its fetching tool returns text into context
  and cannot write bytes to disk. No bridge exists between the two.

**The verified pivot: FinWorkBench/Finch** (HuggingFace, **CC BY
3.0** — permissive, commercial use with attribution, unlike every
academic corpus we hold). Verified from this container: dataset
public and ungated, 537 files, **17 PDFs paired with source and
reference spreadsheets**, per-task JSON, downloads succeed
(`huggingface.co/datasets/FinWorkBench/Finch/resolve/main/...`).
It contains document-grounded extraction tasks — values that must be
pulled from supporting documents into a spreadsheet, **with
reference outputs** — which is D3's exact shape with hand-annotated
ground truth. Small, but it is the only such ground truth that
exists and the only one we may use commercially.

Also verified reachable and unclaimed: **MCC ERR** (~100 real
third-party models, mcc.gov) as the round-4 unseen corpus.
