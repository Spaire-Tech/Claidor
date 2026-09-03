# Materials intake — the meaning layer, 2 September 2026

The research agent's second round could not reach any host but GitHub
and the package registries. This container can. Everything below was
fetched from here today and counted from the files themselves. The
files sit in the session scratchpad and are **not committed** (corpora
and third-party files never are). Every number is from the file, not
from a page describing it.

Fetches used a plain `Swens-research/1.0` user agent with no personal
contact in it.

## 1. SEC Financial Statement Data Sets — one quarter — FETCHED

- `https://www.sec.gov/files/dera/data/financial-statement-data-sets/2026q2.zip`,
  HTTP 200, 60.4 MB. Inside: `sub.txt`, `pre.txt` (96 MB), `num.txt`
  (600 MB, not opened), `tag.txt`, `readme.htm`.
- `pre.txt` columns: `adsh, report, line, stmt, inpth, rfile, tag,
  version, plabel, negating`. **785,490 lines** for the quarter — each
  is one printed statement line with the filer's own label (`plabel`)
  beside the standard concept (`tag`).
- Distinct filer labels mapped to one concept:

| Concept | Lines | Distinct labels | Top labels |
| --- | --- | --- | --- |
| `Revenues` | 2,378 | 217 | Total revenues 437 · Revenues 369 · Revenue 352 · Total revenue 229 · Net sales 101 |
| `IncomeTaxExpenseBenefit` | 5,089 | 401 | Income tax expense 1,280 · Provision for income taxes 1,028 · Income tax provision 287 · Income tax expense (benefit) 244 |

- **The `negating` column is the « Less: » marker.** 109,794 of the
  785,490 lines carry `negating=1`: the filer printed the number with
  the opposite sign to the concept's own (interest expense shown as a
  positive line on the way down the statement, and so on). This is
  the sign-convention training signal the first report looked for
  under the name « negated label ».
- Terms: SEC public data, no licence text in the zip beyond the
  readme; SEC asks automated clients to identify themselves.

## 2. Taxonomies — FETCHED, both

**US GAAP 2026 (FASB)** — `https://xbrl.fasb.org/us-gaap/2026/`:

| File | Size | Counted |
| --- | --- | --- |
| `elts/us-gaap-2026.xsd` | 5.0 MB | 17,182 elements; `balance='credit'` 3,467, `'debit'` 3,910; `periodType='instant'` 4,714, `'duration'` 12,465 |
| `stm/us-gaap-stm-sfp-cls-cal-2026.xml` (classified balance sheet, calculation) | 246 KB | 563 arcs with weight +1, **31 with weight −1** — e.g. the credit-loss allowance subtracted from current assets |
| `elts/us-gaap-lab-2026.xml` | 14 MB | label roles: standard 17,179, total 1,368, period start/end 115 each, terse 9. **No negated-label role in the base taxonomy**; the sign lives in the calculation weight and in the SEC `negating` column |

Example element, verbatim: `name='IncomeTaxExpenseBenefit' …
xbrli:balance='debit' xbrli:periodType='duration'`.

Terms (`xbrl.fasb.org/terms/TaxonomiesTermsConditions.html`, read):
the taxonomy « may be incorporated without change, in whole or in
part, in other works … that comment on, explain, or assist in the use
or implementation of the Taxonomy », and such works « may be copied,
published and distributed … without restriction of any kind imposed
hereby; provided this Authorized Uses notice is included on the first
page thereof. » Read the full page before shipping it inside the
product.

**UK FRC, FRS 102, 2025-01-01** — `https://xbrl.frc.org.uk/…`:

| File | Size | Counted |
| --- | --- | --- |
| `FRS-102/2025-01-01/FRS-102-2025-01-01.xsd` (entry point) | 3 KB | imports the core schema and presentation linkbases only |
| `fr/2025-01-01/core/frc-core-2025-01-01.xsd` | 1.7 MB | 6,172 elements; `balance="credit"` 1,381, `"debit"` 1,379; `periodType="instant"` 935, `"duration"` 5,218 |

**The FRC taxonomy references no calculation linkbase** from either
file (definition, label, reference and presentation only), so for UK
accounts the add/subtract rules are not in the taxonomy; the sign is
in the balance attribute and the filer's `sign="-"` on the fact.
Directory listings and the guessed calculation file return 403.
Licence page not obtained (the FRC website refuses non-browser
fetches).

## 3. Multiplication patterns — the agent's item, not re-fetched

The Packt toll-road model (MIT, 75 rows of label → formula counted by
the agent) stands as reported. One file, not a corpus. Our own sixteen
PR24 models remain the real source for this and are already held.

## 4. Labelled real-error sets — FETCHED, both

**Enron errors corpus (Schmitz & Jannach, TU Graz mirror)** —
`https://spreadsheets.sai.tugraz.at/wp-content/uploads/sites/3/2017/06/Error_ENRON.zip`,
HTTP 200, 789 KB, 55 files:

- 26 spreadsheets (`.xls`) with 26 configuration files marking faulty
  cells as `sheet!column!row`, plus `enron-errors.xlsx`, the overview
  dated 2016-03-15: 48 error rows with columns *Error Nr, Spreadsheet
  Nr, Faulty spreadsheet/worksheet/cells, Corrected
  spreadsheet/worksheet/cells, Type, Subtype, Cell type, Change,
  Additional information*. Sample row: error 1, `2_HPLN0601.xls`,
  Sheet1 `F28:G28`, Quantitative, Mechanical, Formula, Inserted,
  « Range error ».
- The configuration files mark **630 faulty cells in total**, but
  two files carry 472 of them (one marks 337, one 135): a single wrong
  formula filled across a region counts once per cell there. Read as
  situations, it is the 48 rows of the overview; read as cells, 630.
  The `FAULT_TYPE` fields are empty.
- No licence file. The site asks for citation of the IEEE paper.

**INFO1 (TU Graz student spreadsheets)** —
`https://spreadsheets.sai.tugraz.at/wp-content/uploads/sites/3/benchmarks/Info1.zip`,
HTTP 200, 8.5 MB, 245 files:

- 119 faulty spreadsheets in two cohorts (`WS1011`, `WS1314`), each
  with a configuration file naming correct-output cells, incorrect
  outputs with their expected values, and faulty cells: **5,609
  faulty cells marked** across the 119 files. Civil-engineering
  exercises, not financial models. No licence file.

**FinSheet-Bench** (`arxiv.org/abs/2603.07316`, HTTP 200, read): it is
**not an error set**. It is a question-answering benchmark on
*synthetic* private-equity portfolio spreadsheets, scoring how well
language models read tables. Useful as a reading about model limits,
not as material for us. No repository link on the page.

## 5. Modern Excel constructs — the agent's item, confirmed by our own run

The agent's file-format map (table parts under `xl/tables/`, named
LAMBDA in `definedNames`, the `_xlfn.` prefix, spill metadata in
`xl/metadata.xml`) matches what our own probe saw when it built and
evaluated such a file; our run also showed Formualizer refusing the
whole workbook on a table and IronCalc returning `#VALUE!` on a spill
reference. The detection rule is sound and is the first thing to
build.

## 6. Companies House — READ, terms quoted

- Bulk accounts (`download.companieshouse.gov.uk/en_accountsdata.html`,
  HTTP 200): « The Accounts Data Product is a free downloadable ZIP
  file, which contains the individual data files (instance documents)
  of company accounts filed electronically. » « Each data file is
  provided free of charge and is not supported. » Daily zips listed
  (e.g. `Accounts_Bulk_Data-2026-06-04.zip`). None downloaded today.
- API rate limit (`developer-specs.company-information.service.gov.uk/guides/rateLimiting`,
  HTTP 200): « your rate limit will reset back to its maximum value
  of 600 requests » per five-minute window; applications that
  regularly exceed it may be banned without notice.
- A real filing and a real 10-K were not parsed today; the agent's
  sample parse (an anonymised FRS-102 test filing, `sign="-"` on a
  printed-positive net current liabilities figure) stands as reported.

## 7. What was not obtained

| Looked for | Result |
| --- | --- |
| FRC licence text | website refuses non-browser fetches |
| FRC calculation rules | the taxonomy has none; sign only |
| A real Companies House filing and a real 10-K parsed with arelle | not attempted today |
| FAST standard files | not attempted today |
| The SEC `num.txt` | 600 MB, left unopened; not needed for labels |
