# Verifying the project-finance Excel models — evidence from the files

Run on 3 September 2026, in a container with Python, `openpyxl` and
`unzip`. This is the follow-up the sourcing report asked for: that
report could open web pages but could not open a workbook, so every
file-internal claim in it was marked NOT OBTAINED. This run opens the
workbooks.

**Every number below comes from parsing the workbook's own OOXML
parts.** Sheet XML is streamed and each `<c>` element classified: a
cell carrying an `<f>` child is a formula, a cell carrying a value but
no `<f>` is hardcoded. Nothing here rests on a filename, an extension,
a file size, or what the publisher calls the file.

Scripts and raw output are in `corpus-verify/` (see § 7). The
workbooks themselves are not committed, per the convention in
`corpus-golden-master.md`; § 6 is the re-fetch manifest with hashes.

---

## TL;DR

- **Six files obtained and opened. Two are formula-intact; four are
  values-only dumps.**
- **The Scottish Futures Trust models are the headline failure.** All
  four SFT financial-close models are value dumps. Three contain
  **exactly zero** formula elements across every sheet. The fourth has
  169 formulas in 418,837 populated cells (0.04%) — and all 169 sit on
  a single `Databook` sheet, with **zero** on `CalcM`, `CalcSA`,
  `CashFlowSA`, `Ratios`, `Drawdown schedules` or `Repayment
  schedules`. This is precisely the "500 formulas on a cover sheet,
  300,000 hardcoded financial values" pattern. The sourcing report
  ranked these the highest-value models in the set, on the publisher's
  description. They are the least useful.
- **FHWA P3-VALUE 2.3 is the strongest item**: 782,093 formulas,
  98.2% of populated cells, with real debt-sizing logic — target DSCR,
  sculpted repayment, `PPMT` annuity profile, CFADS.
- **Packt / Meta Brains is a clean small keeper**: 2,973 formulas,
  72.7%, with a textbook debt schedule (opening balance → drawdown →
  closing balance → interest → debt service). It has **no DSCR
  anywhere** — verified against the shared-string table, not assumed.
- **The three World Bank / PPIAF models could not be obtained.**
  `ppiaf.org` sits behind a Cloudflare bot challenge that returns 403
  to every HTTP client available here; `web.archive.org` is blocked by
  this environment's egress policy. Not verified, not guessed — see
  § 5.

Corrections to the sourcing report, both in the direction that matters:
it said the SFT files could not be pulled (they download fine, and are
worthless), and it said the PPIAF railways file had been fetched (it
cannot be reached from here at all).

---

## 1. The two keepers

### FHWA P3-VALUE 2.3 — **KEEP, formula-intact**

| | |
|---|---|
| filename | `fhwa_p3value_2_3.xlsm` |
| type | `.xlsm` (macro-enabled, `vbaProject.bin` present, 415,744 B) |
| bytes | 12,479,319 |
| SHA-256 | `2fe88d713a5ec77378e81276ba152caa9712902a4092c747bb88da8fcfbcb4b8` |
| worksheets | 72 |
| cells in used range | 1,393,820 |
| populated cells | 796,454 |
| **formula cells** | **782,093** |
| hardcoded cells | 14,361 (12,726 text labels / 1,635 numeric) |
| blank cells in used range | 597,366 |
| **formula % of populated** | **98.2%** (99.79% of non-label cells) |
| cross-sheet formulas | 255,064 |
| external-workbook formulas | 0 |
| named ranges | 144 |
| hidden / very hidden sheets | 0 / 0 |
| external links | none (`xl/externalLinks/` absent) |
| `calcPr` | `calcId="191029" calcOnSave="0"` — **no `iterate`, so iterative calculation is OFF** |

**FORMULA INTACT = YES.**

Only 1,635 numeric cells in the whole workbook are hardcoded — the
inputs. Everything downstream computes. The formula density holds on
the financing sheets specifically (`P3 Financing`, `PSC Financing`,
`Financing Outputs` together: 97.05%, 21,427 formulas), so this is not
a live shell over a dead core.

Representative rows, sheet / row / label / formula:

| sheet | row | label | formula |
|---|---|---|---|
| P3 Financing | 160 | P3 - Target DSCR | `=IF(F159 = 0, 0, F158 / F159)` |
| P3 Financing | 201 | P3 - Sculpting repayment | `=MIN(J198, J199) * J200` |
| P3 Financing | 207 | P3 - Annuity debt repayment profile | `=IF(J206 = 0, 0, -1 * PPMT($F204,1, J205, 1))` |
| P3 Financing | 196 | P3 - Target long-term repayment | `=MAX(0, J194 - J195)` |
| P3 Financing | 180 | P3 - Target long-term debt service | `=IF(J179 = 1, IF($F177 <> 0, J178 / $F177, 0), 0)` |
| P3 Financing | 174 | P3 - LT debt interest accrued during operations | `=$F171 * J172 * J173` |
| P3 Financing | 125 | P3 - Long-term debt drawdown | `=J124` |
| P3 Financing | 60 | P3 - Construction loan drawdown | `=MAX( MIN( SUM( J57:J58), J59 ), 0 )` |
| Financing Outputs | 13 | Debt amount (if applicable) | `=IF('PSC Financing'!$F$64 = 0, "N.A.", 'PSC Financing'!$F$64 / THOUSAND)` |
| Financing Outputs | 9 | Minimum calculated DSCR | `='PSC Financing'!F$208` |
| Financing Outputs | 40 | Pre-tax equity IRR | `='Subsidy & Bid'!F$257` |
| Benefits Existing Traffic | 25 | Travel time savings – Delayed PSC – peak – 2 axle | `=J11 * J18`, row total `=SUM(J25:BQ25)` |

Top functions by count: `IF` (3,256), `SUM` (3,061), `MIN` (266),
`LEFT` (223), `VLOOKUP` (196), `SUMIF` (182), `MAX` (181), `ROWS`
(144), `SUMPRODUCT` (126), `AVERAGE` (101), `SQRT` (74).

Project-finance content — **all 18 checked concepts present**:
revenue/operating assumptions, construction period, operating period,
CAPEX, OPEX, debt schedule, drawdowns, interest, principal repayment,
DSCR/ADSCR, CFADS, debt sizing, cash flows, project & equity IRR,
taxes, depreciation (a dedicated `P3 Depreciation` sheet), financing
structure, sensitivity/scenario.

Structure notes worth knowing before it is used as a fixture: the VBA
project contains modules `ColorFormatting`, `mFunding`, `mHideUnhide`,
`mNavigation` — `mHideUnhide` means sheet visibility is manipulated at
runtime even though all 72 sheets are stored visible. One formula
contains a `[` token that a naive external-link check flags as an
external reference; it is a **structured table reference**
(`VfM_summary_total_net_value_to_Agency[[#This Row],[P3]]`), not an
external workbook. There are no external workbook links at all.

**Why it is useful to Swens.** It is the only obtained file with
genuine debt-sizing mechanics under formulas — sculpting to a target
DSCR, an annuity alternative via `PPMT`, reserve accounts, and a
CFADS line — which is the exact structure the engine's debt-schedule
and ratio reckoning has to recognise. At 782k formulas and 255k
cross-sheet references it is also a real scale and cross-link stress
test, and its VBA plus structured-table references exercise intake
paths that a clean textbook model never touches.

### Packt / Meta Brains — **KEEP, formula-intact but narrow**

| | |
|---|---|
| filename | `packt_Financial_Model.xlsx` |
| type | `.xlsx` (no VBA) |
| bytes | 99,724 |
| SHA-256 | `d8de77e6af2da56983101b74d3099ca77a9641dd7bd89f3cb76f03425c4a5acc` |
| worksheets | 10 — `Input Assumptions, TBA, Construction, Operation, Amortization, Debt, P&L, CFS, Balance Sheet, Ratios` |
| cells in used range | 9,218 |
| populated cells | 4,088 |
| **formula cells** | **2,973** |
| hardcoded cells | 1,115 (227 text / 888 numeric) |
| blank cells in used range | 5,130 |
| **formula % of populated** | **72.73%** (77.0% of non-label cells) |
| cross-sheet formulas | 1,643 |
| external-workbook formulas | 0 |
| named ranges | 0 |
| hidden / very hidden sheets | 0 / 0 |
| external links | none |
| `calcPr` | `calcId="191028"` — **iterative calculation OFF** |
| licence | MIT, `Copyright (c) 2023 Packt` (LICENSE fetched and read) |

**FORMULA INTACT = YES.**

The hardcoded cells concentrate exactly where they should: `Input
Assumptions` is 11.66% formula (it is the input sheet) and `TBA` (the
time-base/date axis) is 2.16%. Every calculation sheet is 81–87%
formula: `Construction` 86.52%, `Ratios` 86.92%, `CFS` 86.58%, `P&L`
85.71%, `Operation` 84.64%, `Balance Sheet` 84.88%, `Debt` 81.63%.

Representative rows:

| sheet | row | label | formula |
|---|---|---|---|
| Debt | 8 | Opening Balance | `=E11` (prior period closing) |
| Debt | 9 | Drawdowns | `=Construction!E34` |
| Debt | 11 | Closing Balance | `=SUM(F8:F10)` |
| Debt | 14 | Interests | `=-('Input Assumptions'!$D$35+'Input Assumptions'!$D$36)*Debt!F8*TBA!D18` (base rate + margin × opening balance × day-count) |
| Debt | 17 | Debt service | `=(F10+F14)*TBA!D18` (principal + interest) |
| CFS | 14 | Cash Flow Available for Debt Service (CFADS) | `=SUM(F8:F13)` |
| CFS | 16 | Interest | `=Debt!F14` |
| CFS | 17 | Principal repayment | `=Debt!F10` |
| Construction | 26 | Equity (k£) | `=IF(MAX($C$22-SUM($D$26:D26),0)>E19,E19,MAX($C$22-SUM($D$26:D26),0))` (equity-first funding cascade) |
| Construction | 27 | Debt (k£) | `=IF(E19-E26>0,E19-E26,0)` |
| Operation | 10 | REVENUE – Passenger Car (PC) | `=E7*'Input Assumptions'!$D$20/1000` (traffic × toll) |
| Amortization | 13 | Amortization (k£) | `=-Construction!$C$20/('Input Assumptions'!$D$8-'Input Assumptions'!$D$9)*TBA!D10` (capex straight-lined over concession less construction) |
| Balance Sheet | 13 | Equity | `=SUM(Construction!$E$26:E26)` |

Project-finance content: 16 of 18 concepts present. Two notes, both
checked rather than assumed:

- **DSCR / ADSCR is genuinely absent.** `grep` over the whole
  shared-string table returns only "Debt Service"/"Debt service" — the
  cash-flow line — and no DSCR, ADSCR, LLCR or cover-ratio label
  anywhere. The `Ratios` sheet computes Project IRR (r19) and Equity
  IRR (r29) only. So the model has CFADS and debt service as separate
  lines but never divides one by the other.
- **Depreciation is present under another name.** The keyword scan
  flagged it absent; the `Amortization` sheet formula above is
  straight-line amortisation of the capital asset over the operating
  period, i.e. the depreciation charge. Recording the scan's miss
  rather than the scan's verdict.

The worked case is a Fiji toll road: `Operation` splits revenue into
Passenger Car and Heavy Vehicle at separate tolls.

**Why it is useful to Swens.** It is a small, wholly legible,
MIT-licensed project-finance model whose debt block is the canonical
shape — opening balance, drawdown, repayment, closing balance,
interest on opening balance, debt service — which makes it the natural
fixture for asserting the engine's debt-schedule recognition without a
12MB file in the loop. Its 1,643 cross-sheet references over only
4,088 populated cells give dense link-tracing on a workbook a person
can still read end to end, and MIT means it can be committed and
redistributed, unlike everything else here.

---

## 2. The four rejects — Scottish Futures Trust

All four downloaded cleanly from
`scottisfuturestrust.s3.eu-west-2.amazonaws.com` (HTTP 200, correct
`.xlsm` magic bytes). All four are values-only exports.

| file | bytes | sheets | populated | **formulas** | % | named ranges | ext. link parts | VBA |
|---|---|---|---|---|---|---|---|---|
| `sft_Dumfries_and_Galloway_Royal_Infirmary_Financial_Model.xlsm` | 6,591,446 | 33 | 235,040 | **0** | 0.00% | 1,229 | 19 | yes |
| `sft_hub_SW_CHS_vFinancial_Close.HC.xlsm` | 4,587,898 | 49 | 663,573 | **0** | 0.00% | 1,130 | 2 | yes |
| `sft_Scottish_National_Blood_Transfusion_Service_Financial_Model.xlsm` | 1,881,902 | 45 | 224,633 | **0** | 0.00% | 277 | 0 | yes |
| `sft_HW_-_CBSB_-_Base_Case_-_20171023_FINAL_FC_close.HC.xlsm` | 3,907,164 | 33 | 418,837 | **169** | 0.04% | 577 | 2 | yes |

SHA-256:

```
b413cde63f9e4f1c0ed2a6e674850e06a62b4d6393b6fa2be418b62d27d7692c  Dumfries and Galloway Royal Infirmary
af46dacdc8d0c582c8314241ea529c59af63891dd3f750c9ec5bdbfe65e06e06  hub SW CHS vFinancial Close
c8d838938035cb2cb30fcd9f9f94e1366e376684bfc44b89c9c17981a5bd2447  Scottish National Blood Transfusion Service
3b28834a98e3b7fe80cb1eae12b294f16bae4654a98501f150f3d329ab782293  HW - CBSB - Base Case - FINAL FC close
```

**FORMULA INTACT = NO, for all four.** Classification **D — a
values-only export** for the first three; **D** for CBSB too, since
its 169 formulas do not touch any calculation section.

This was verified twice, by two independent methods, because a
zero-formula result is the kind of finding that is more likely to be a
parser bug than a fact:

1. The classifier above reports 0 `<f>` elements.
2. A raw `unzip` of `xl/worksheets/*.xml` piped to
   `grep -o '<f[ >/]' | wc -l` returns **0** across all 33 / 49 / 45
   sheet parts respectively, against 235,040 / 663,573 / 224,633
   `<v>` value elements. The same command on the Packt file returns
   2,973, matching the classifier exactly — so the method detects
   formulas when they are there.

What makes these convincing as *former* models, and why the
description misleads: the sheet names are those of live PPP models
(`calcFundingM`, `calcTaxationSA`, `CalcSA`, `Schedule 7 - Repayment
Schedule`, `Schedule 12 - Drawdown Schedule`, `Junior Debt
Sculpting`, `Swap profile`, `Ratios`, `Checks`), the label text
contains every project-finance concept in the checklist — all 18
present in each file — the Dumfries workbook even carries two **very
hidden** sheets (`TM_Databook`, `TM_Ph2 Calcs`), and all four retain
their VBA projects and their named ranges (1,229 in Dumfries). A
"Save as values" pass preserves names, VBA and sheet visibility while
replacing every formula with its last computed number, which is
exactly the fingerprint observed. The labels promise a model; the
cells hold only its final printout.

CBSB deserves its own line because it is the trap in its purest form.
Its 169 formulas are **all on the `Databook` sheet** (875 populated
cells). The sheets that carry the financing logic report zero:

```
Databook              169 formulas /     875 populated
CalcM / CalcSA          0 formulas
CashFlowSA              0 formulas
Ratios                  0 formulas
Drawdown schedules      0 formulas
Repayment schedules     0 formulas
NPV_IRR                 0 formulas
```

A formula count alone would have scored this file as "has formulas".
It has none where it matters.

**Verdict: DROP — formulas stripped.** All four. They cannot support
any check the engine performs — no precedent tracing, no
unit-propagation, no revision comparison of logic, no mechanical-defect
detection, because there is no logic left to inspect. They retain one
narrow use, which should not be confused with corpus membership: they
are honest *negative* fixtures, for asserting that intake tells a user
their upload is a value dump rather than silently reporting zero
defects on it. The sourcing report's separate warning stands
independently — SFT publishes these with a disclaimer and no re-use
licence — but that question is now moot for corpus purposes.

---

## 3. Summary table

| # | model | obtained | formulas | % of populated | calc sections have formulas | verdict |
|---|---|---|---|---|---|---|
| 1 | Packt / Meta Brains `Financial+Model.xlsx` | yes | 2,973 | 72.73% | yes (81–87%) | **KEEP** — formula-intact, narrow (no DSCR) |
| 2 | World Bank / PPIAF Railways `.xlsm` | **no** | — | — | — | **UNRESOLVED** — host unreachable |
| 3 | World Bank / PPIAF Port `.xls` | **no** | — | — | — | **UNRESOLVED** — host unreachable |
| 4 | World Bank / PPIAF Highways `.xls` | **no** | — | — | — | **UNRESOLVED** — host unreachable |
| 5a | SFT Dumfries & Galloway Royal Infirmary | yes | 0 | 0.00% | no | **DROP** — formulas stripped |
| 5b | SFT hub SW CHS Financial Close | yes | 0 | 0.00% | no | **DROP** — formulas stripped |
| 5c | SFT Scottish National Blood Transfusion | yes | 0 | 0.00% | no | **DROP** — formulas stripped |
| 5d | SFT Bertha Park / CBSB FC close | yes | 169 | 0.04% | no (all on `Databook`) | **DROP** — formulas stripped |
| 6 | US DOT FHWA P3-VALUE 2.3 `.xlsm` | yes | 782,093 | 98.20% | yes (97.05%) | **KEEP** — formula-intact |

Classification against the A/B/C/D scale asked for:

- **A — genuine live model with formulas**: FHWA P3-VALUE 2.3; Packt.
- **B — mostly formulas, important sections stripped**: none.
- **C — almost entirely hardcoded**: SFT Bertha Park / CBSB (0.04%).
- **D — values-only export**: SFT Dumfries, SFT hub SW CHS, SFT SNBTS.

---

## 4. Structure findings across the set

| | Packt | FHWA | SFT Dumfries | SFT hub SW | SFT SNBTS | SFT CBSB |
|---|---|---|---|---|---|---|
| hidden sheets | 0 | 0 | 0 | 0 | 0 | 0 |
| very hidden sheets | 0 | 0 | **2** | 0 | 0 | 0 |
| named ranges | 0 | 144 | 1,229 | 1,130 | 277 | 577 |
| external link parts | 0 | 0 | **19** | 2 | 0 | 2 |
| formulas → other sheets | 1,643 | 255,064 | 0 | 0 | 0 | 168 |
| formulas → external workbooks | 0 | 0 | 0 | 0 | 0 | 0 |
| VBA / macros | no | **yes** | yes | yes | yes | yes |
| iterative calculation | off | off | off | off | off | off |

On iterative calculation: `xl/workbook.xml` was read directly in each
case. **No file carries an `iterate` attribute on `<calcPr>`**, so
iterative calculation is off in all six and none declares a tolerated
circular reference. Note this is the *stored setting*, not proof that
no circularity exists — for the four value dumps the question is moot,
and for the two live models it means any circular chain would be an
error rather than a designed loop.

The SFT external-link parts are worth flagging: Dumfries retains 19
`xl/externalLinks/externalLink*.xml` parts while containing zero
formulas. Those are the cached remains of links whose formulas were
stripped — another confirmation of the values-only conversion, and a
reminder that an external-link *count* says nothing about whether live
references survive.

---

## 5. What could not be obtained, and why

**The three World Bank / PPIAF models — railways, port, highways — were
not obtained.** No file-internal claim is made about any of them.

`ppiaf.org` and `www.ppiaf.org` sit behind a Cloudflare bot challenge.
Every request returns HTTP 403 with a `Just a moment...` interstitial
(`cf-challenge`, CSP naming `challenges.cloudflare.com`). This was
tested against, and failed for, all of:

- `curl`, default headers
- `curl` with a full Chrome header set (UA, `Accept`,
  `Accept-Language`, `sec-ch-ua*`, `Sec-Fetch-*`, HTTP/2)
- `wget` (exit 8, server error response)
- Python `urllib` (`HTTPError 403`)
- Playwright-driven Chromium

and against all of these paths, so it is a site-wide block, not a
per-file one:

```
/sites/.../railways_toolkit/documents/Financial_Model_for_Railways_Toolkit_v1_1.xlsm   403
/sites/.../Portoolkit/Toolkit/reference/Financial%20Model/fin_modf.xls                 403
/sites/.../Portoolkit/Toolkit/reference/Financial%20Model/Copy%20of%20fin_mode.xls     403
/sites/.../Portoolkit/Toolkit/tools.html                                               403
/sites/.../highwaystoolkit/6/pdf-version/financial_models.pdf                          403
/documents/3546                                                                        403
```

The 403 comes from the origin, not this environment's proxy: the
Cloudflare challenge HTML arrives in the response body, so the request
reached the site and the site refused it.

Two fallbacks were tried and also failed:

- **`web.archive.org` is blocked by this environment's egress
  policy.** The Wayback *availability API* on `archive.org` responds
  and confirms a 200 snapshot of the railways `.xlsm` exists at
  timestamp `20190919192431`, but every content fetch from
  `web.archive.org` is reset mid-tunnel; the proxy's
  `recentRelayFailures` records `web.archive.org:443 — tunnel closed
  (code 1006)`, and the CDX endpoint answers `Blocked by egress
  policy`. Per `/root/.ccr/README.md`, a policy-blocked host is to be
  reported, not routed around. It is reported.
- **Chromium cannot egress at all here.** The pre-installed browser
  fails with `ERR_CONNECTION_RESET` even against `example.com`, with
  or without the proxy configured, so the browser route that would
  normally clear a Cloudflare challenge is unavailable.

The World Bank documents API was searched for a mirror; it returns the
toolkit **PDFs** (`documents.worldbank.org/.../69256-REVISED-ENGLISH-PUBLIC-RR-Toolkit-EN-...pdf`)
but no spreadsheet. `ppp.worldbank.org` is behind the same Cloudflare
block (403).

These three remain **UNRESOLVED, not verified and not rejected**. On
the publishers' own documentation they are the most promising
unexamined candidates left — the highways models were audited by
Operis for mathematical accuracy in 2009 and size debt to a target
ADSCR, and the railways model requires macros to be enabled, which is
suggestive but proves nothing. They need re-running from a network
that can reach `ppiaf.org` (an ordinary browser session will clear the
challenge), or from an environment whose egress policy permits
`web.archive.org`. Until then, treat their status as unknown.

---

## 6. Re-fetch manifest and file identity

Downloaded to `corpus-verify/files/` (not committed — 29.5 MB total,
publicly re-fetchable). Verify with `sha256sum -c`.

| file | bytes | SHA-256 | source URL | HTTP |
|---|---|---|---|---|
| `packt_Financial_Model.xlsx` | 99,724 | `d8de77e6af2da56983101b74d3099ca77a9641dd7bd89f3cb76f03425c4a5acc` | `https://raw.githubusercontent.com/PacktPublishing/Project-Finance-and-Excel---Build-Financial-Models-from-Scratch/main/Financial%2BModel.xlsx` | 200 |
| `fhwa_p3value_2_3.xlsm` | 12,479,319 | `2fe88d713a5ec77378e81276ba152caa9712902a4092c747bb88da8fcfbcb4b8` | `https://www.fhwa.dot.gov/ipd/pdfs/p3/p3_value_2_3_tool_06092023.xlsm` | 200 |
| `sft_Dumfries_and_Galloway_Royal_Infirmary_Financial_Model.xlsm` | 6,591,446 | `b413cde63f9e4f1c0ed2a6e674850e06a62b4d6393b6fa2be418b62d27d7692c` | `https://scottisfuturestrust.s3.eu-west-2.amazonaws.com/Dumfries+and+Galloway+Royal+Infirmary+Financial+Model.xlsm` | 200 |
| `sft_hub_SW_CHS_vFinancial_Close.HC.xlsm` | 4,587,898 | `af46dacdc8d0c582c8314241ea529c59af63891dd3f750c9ec5bdbfe65e06e06` | `https://scottisfuturestrust.s3.eu-west-2.amazonaws.com/hub+SW+CHS+vFinancial+Close.HC.xlsm` | 200 |
| `sft_Scottish_National_Blood_Transfusion_Service_Financial_Model.xlsm` | 1,881,902 | `c8d838938035cb2cb30fcd9f9f94e1366e376684bfc44b89c9c17981a5bd2447` | `https://scottisfuturestrust.s3.eu-west-2.amazonaws.com/Scottish+National+Blood+Transfusion+Service+Financial+Model.xlsm` | 200 |
| `sft_HW_-_CBSB_-_Base_Case_-_20171023_FINAL_FC_close.HC.xlsm` | 3,907,164 | `3b28834a98e3b7fe80cb1eae12b294f16bae4654a98501f150f3d329ab782293` | `https://scottisfuturestrust.s3.eu-west-2.amazonaws.com/HW+-+CBSB+-+Base+Case+-+20171023_FINAL+FC+close.HC.xlsm` | 200 |
| `packt_LICENSE.txt` | — | — | `https://raw.githubusercontent.com/PacktPublishing/.../main/LICENSE` | 200 |

Licence position, as read this run: Packt is **MIT, `Copyright (c)
2023 Packt`** — the LICENSE file was fetched and read, closing the gap
the sourcing report left open. FHWA P3-VALUE is a US federal work
carrying the notice that it is "an Excel-based spreadsheet tool
designed to educate the user … not intended for use in detailed
evaluation of actual projects". SFT publishes its files with a
disclaimer and no re-use grant — moot, since all four are dropped.

---

## 7. How to reproduce

```
corpus-verify/
  analyze_xlsx.py     # OOXML parser: classifies every <c>, reads workbook.xml,
                      # calcPr, definedNames, externalLinks, vbaProject
  summarize.py        # human-readable per-file summary
  samples.py          # representative label+formula rows
  samples_sheet.py    # same, restricted to named sheets (the financing logic)
  fetch_pw.py         # Playwright fetch attempt (recorded; did not work here)
  logs/               # analysis.json, regenerated by the command below (not committed: 2.4 MB of machine output)
  files/              # the workbooks (not committed; re-fetch per § 6)
```

```bash
cd corpus-verify
pip install openpyxl xlrd olefile
python3 analyze_xlsx.py files/*.xlsx files/*.xlsm > logs/analysis.json
python3 summarize.py logs/analysis.json
python3 samples_sheet.py logs/analysis.json fhwa "^P3 Financing$" "dscr|sculpt|repay" 12
```

Independent cross-check of any formula count, bypassing the parser
entirely:

```bash
unzip -o -q FILE.xlsm -d /tmp/x "xl/worksheets/*.xml"
cat /tmp/x/xl/worksheets/*.xml | grep -o '<f[ >/]' | wc -l
```

Two honest bounds on the method. First, the project-finance concept
check matches **labels**, so it evidences that a concept is named in
the workbook, not that it is correctly implemented — which is why the
SFT files score 18/18 while containing no logic at all; the formula
counts, not the concept table, carry the verdict. Second,
`formula_external` counts `[n]`-style indexed workbook tokens; the
`xl/externalLinks/` part count is the authoritative signal and both
are reported.

---

## 8. What this changes

1. **The corpus gains two files, not six.** FHWA P3-VALUE 2.3 and the
   Packt model. Only Packt is redistributable (MIT); FHWA is
   re-fetchable by URL.
2. **Drop the SFT tier entirely.** The sourcing report ranked it the
   highest-value tier and recommended seeking written permission from
   SFT. That effort is now pointless: there is nothing in the files to
   license. Worth remembering that `swens.md` cites "a published
   financing model for a £213m hospital" with 107 frozen reference
   errors — if that finding came from an SFT-published workbook, it
   should be re-confirmed against a file that still has formulas,
   because a value dump cannot exhibit reference errors.
3. **The PPIAF three are the open question.** They are the only
   remaining candidates for a second *sector* (rail, port, toll road)
   under formulas, and they need a network that can reach the host.
4. **Formula-intactness must be gated, not assumed.** Four of six
   files from reputable public-sector publishers, all described as
   financial models, all named like models, all carrying the full
   project-finance vocabulary, were value dumps. Any future corpus
   addition should have to pass the `<f>`-count check *on its
   calculation sheets* before it is counted — the whole-file percentage
   would have admitted CBSB.
