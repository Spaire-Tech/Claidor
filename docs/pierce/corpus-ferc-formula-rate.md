# The FERC formula-rate corpus — manifest

*Recorded by Scribe (Track D), 28 August 2026. Every file below was
fetched and verified by its **magic bytes**, never by its HTTP status.
See "The extension trap" — status codes lie on this host.*

This is the first corpus in this lane's history that carries a real
**document → model** pair with the **filer's own citations as truth**.
It is the corpus the orders of 28 August sent me to find.

## Why this family fits D3

A US transmission owner's annual formula-rate update is a spreadsheet
whose inputs are drawn from a **separate, earlier, public document** —
the utility's FERC Form 1 annual report. The workbook prints its own
provenance beside each input: `p354.21.b` means **printed page 354,
line 21, column (b)** of that Form 1.

That makes the truth a **parse, not an inference**. Nobody has to judge
what the modeller meant; the modeller wrote it down. The direction is
proven three ways — the filing calendar (the Form 1 is filed months
earlier), the model's own step list, and the direction of citation (the
model cites the document; the document never mentions the model).

## The extension trap, verified here

PJM serves its formula-rate assets from a media path. **Requesting a
PDF's path with `.xlsx`, `.xls` or `.xlsm` returns HTTP 200 and the
byte-identical PDF.** Verified independently in this lane: the 2025
JCPL ATRR at `.pdf` and at `.xlsx` both returned 200, both 4,070,119
bytes, the same sha256 `22ea2d6848f5…`, and both began `25504446`
(`%PDF`).

**Check bytes, never status.** Everything in this manifest carries the
first four bytes it was accepted on.

## The pair — Rochelle Municipal Utilities (RMU), rate year 2016/17

Both halves published by PJM in the **same folder**, for the same
filer, in the same rate cycle.

| role | file | bytes | magic | sha256 |
|---|---|---|---|---|
| **document** | `rmu-2015-ferc-form-1.pdf` | 443,121 | `25504446` PDF | `b46018ef0d06…` |
| **model** | `rmu-2016-formula-rate.xlsx` | 262,916 | `504b0304` XLSX | `01be958d92ca…` |

Source paths, both under `https://www.pjm.com/-/media/DotCom/markets-ops/trans-service/june-to-may/2016-2017/rmu/`.

**Document.** RMU's FERC Form 1 for calendar year 2015, filed 23 May
2016. 132 PDF pages. **103** of them carry a Form 1 footer; those
footers name **103 distinct printed pages**, spanning 102–429, with
**zero collisions** under the footer rule below.

**Model.** RMU's 2016 Attachment H-25B annual update. 10 sheets, 4,472
non-empty cells, 2,239 formulas, **47 citation cells**.

### The footer rule (a parse rule, declared before use)

A page's printed Form 1 number is the one in its **footer**, matched as
`FERC FORM NO. 1 … Page NNN`. It is *not* any occurrence of `Page NNN`
in the text.

This matters and was nearly got wrong here. A loose search for
`Page \d{3}` makes **10** printed numbers ambiguous — printed page 112
appears to live on two PDF pages, page 117 on three. Every extra hit is
a **body cross-reference** ("…recorded in Page 117, Line 78",
"Net Income for the Year (Page 117)"), not a page mark. Under the
footer rule the mapping is **unique for all 103 pages**, and all 22
cited pages resolve.

### The citations

47 citation cells. Splitting them by whether one citation names one
document cell:

| kind | count |
|---|---|
| clean single target (`p354.21.b` and nothing else) | 31 |
| single target wrapped in prose (`Subtotal - p234.18.c`, `p219.28.c (footnote)`) | 8 |
| **multi-target** (`p227.6.c & 16.c`, `p336.7.b&c&d`, `p117.62-67.c`, `p337.43.b*e`) | 8 |

Under the per-sheet geometry declared in the round's registration, **35
of 37** single-target citations have a **typed** value cell — not a
formula. Two are blank (reserved rows).

### One citation, resolved end to end

`Appendix A - TSRR Summary`:

- `F10 = "p354.21.b"` — the citation
- `C10 = "Transmission Wages Expense"` — the model's label
- `H10 = 44016` — the model's typed input

Printed page 354 (PDF index 107), line 21, is

```
21Transmission (Enter Total of lines 4 and 14)   $ 44,016   $ 44,016
```

Column (b) is *Direct Payroll Distribution* = **44,016**. The citation
resolves exactly.

**And the labels differ**, which is the point. The document calls it
"Transmission (Enter Total of lines 4 and 14)"; the model calls it
"Transmission Wages Expense". This is a real matching problem, not
string equality.

**It is harder than that.** On that one page the bare word
*Transmission* labels **three** lines — line 4 (Operation), line 14
(Maintenance) and line 21 (the total of the two). A matcher that keys
on the label alone must either disambiguate or abstain, and the truth
key says which one is right. This is exactly D3's hard half.

## Other files fetched and kept

| file | bytes | magic | verdict |
|---|---|---|---|
| `cor-2017-form1.pdf` | 378,634 | PDF | 53 pages, **partial** — cited pages 200 and 207 absent. Usable, thinner. |
| `cor-2017-h25b.xlsx` | 267,252 | XLSX | 56 citation cells |
| `cor-2020-h25b.xlsx` | 259,477 | XLSX | 46 citation cells |
| `cor-2019-form1.pdf` | 149,571 | PDF | **2 pages — a cover letter, not the form.** Not a document half. |

## The large owners: workbooks without a document half

PJM's formula-rate page lists **745** spreadsheet/zip links across
owners and years. Three current-year workbooks were fetched and
byte-verified:

| file | bytes | magic | engine reads it? |
|---|---|---|---|
| `2025/jcpl/2025-atrr.xlsx` | 1,309,740 | XLSX | yes — 4,346 cells, 2,910 formulas, 1,436 typed |
| `2025/pseg/workpaper-1.xlsx` | 283,984 | XLSX | yes |
| `2025/atsi/2024-atrr.xlsx` | 1,225,523 | XLSX | **no — `ValueError` on read** |

JCPL's 2025 ATRR carries **72 citation cells / 73 distinct references**,
in two geometries:

- **row-adjacent** — `Attachment 20 - OpEx` heads a column
  "FERC Form No. 1 Citation" (G) beside "FERC Form No. 1 Balance" (I),
  one citation per row, 39 of them.
- **column-header** — `Attachment 3 - Gross Plant` and
  `Attachment 8 - Cap Structure` put the citation in a header row
  (`E8 = 112.16.c`) over a **column of thirteen monthly values**. That
  is the 13-month averaging transformation, and it is also precisely
  the shape round 6's column anchor was built for.

**But PJM publishes no FERC Form 1 for the large owners.** Only three
Form 1 PDFs appear on the whole page, all for the small municipal
filers (RMU / City of Rochelle). So the large owners give a rich
*model* corpus with citations but **no document half**; RMU gives the
complete pair. The round is registered on RMU.

`www.ferc.gov` answers **403** to this environment; `forms.ferc.gov`
and `elibrary.ferc.gov` answer 200 but are ASP.NET postback surfaces.
Obtaining Form 1 documents for the large owners is therefore an open
problem, not a solved one, and is **not** assumed anywhere below.

## Licensing

US federal and RTO filings. FERC Form 1 is a public federal filing;
PJM publishes these assets openly on its formula-rate page. No CC
attribution string travels with these numbers as it does with Finch,
but the source URL and sha256 do — recorded above.
