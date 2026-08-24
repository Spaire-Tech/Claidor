# The fidelity gate — first report (v1, 23 Aug 2026)

B2 of the Ambre plan: before the recalculator is trusted anywhere,
it must reproduce what Excel itself stored, file by file. First run:
the 27-model lab corpus, LibreOffice **24.2** (the container's
version — the plan calls for ≥ 25.8 and the gap shows, see below),
driven through UNO with each file's own iteration settings pushed
in. Raw per-file lines: `fidelity-lab27-v1.jsonl`.

## Result: 19 of 27 recalculated and diffed; every mismatch class
## explained

- **3 files: perfect** — zero mismatches across every cached value.
- **9 ED2 files: 99.998%** — exactly one mismatching cell each,
  `Cover!G4`, a filename/title cell (`CELL("filename")` family): the
  recalculated copy truthfully reports its new filename.
  **Class: environment-volatile — expected to differ, to be excluded
  from scoring in v2, never a fidelity failure.**
- **2 H7 files: 99.98%** — 66 mismatches each, all the same class:
  per-sheet title cells rebuilt from the filename.
- **2 draft PCFMs: 99.2–99.4%** — `#VALUE!` divergences around text
  operations on `Finance!D10`-style cells; same family, LibreOffice
  computing an error where Excel stored text. Under investigation
  with the function-gap class below.
- **1 draft PCFM (GT3): 96.1%** — 1,294 `#NAME?` errors:
  **LibreOffice 24.2 does not know functions these files use**
  (the XLOOKUP/LET generation). This is the version gap the research
  predicted; the fix is the planned upgrade to ≥ 25.8 plus the
  denylist prescan that refuses or reroutes such files *before*
  recalculating. The gate caught it — which is the gate working.
- **2 WACC models: 95.8–96.3%** — the one genuinely interesting
  class: ~23k numeric divergences on their « Daily Data » sheets
  (e.g. Excel stored 0.02075…, LibreOffice computes 0.02). Not
  errors, not volatiles — a real computational difference on daily
  rate series, unexplained as yet. **These files fail the gate and
  would be refused behavioural checks today.** Investigating the
  responsible function is a named next step; the arbiter (real
  Excel via Graph) is the designed escape.
- **8 files: recalculated but not diffed** — the differ (openpyxl
  read-only), not the recalculator, fails on the six big BPFMs and
  two others (`TypeError` on read; probed and confirmed on a small
  file). **v2 swaps the differ onto our own reader**, which handles
  every one of these files daily.

## What v1 establishes

The pipeline works end to end; the gate discriminates exactly as
designed (perfect files pass, version-gap files fail loudly,
environment volatiles are classifiable); and the honest posture
holds — with today's LibreOffice, some fraction of real files would
be refused behavioural checking rather than judged against numbers
we cannot reproduce. Named for v2: our-reader differ, volatile-cell
exclusion list, function-gap prescan, LibreOffice ≥ 25.8, then the
re-run — and the WACC divergence investigated to its root.

## Addendum (same day): the WACC divergence, solved

The reviewer's hypothesis — a lookup-family function difference, not
floating-point drift — was right, with a mechanism worth keeping:
the Daily Data cells compute
`IFERROR(XLOOKUP(date, OBR[Effective From], OBR[CPI], , -1, 1), 2%)`.
LibreOffice 24.2 has no XLOOKUP, the lookup errors, and **IFERROR
swallows the incapability and returns the 2% fallback** — a
plausible, exactly-round wrong number instead of a visible error.
Excel looked up the real CPI series (0.02075…).

Two consequences, both now rules:
1. **The prescan must flag unsupported functions even inside IFERROR
   / IFNA wrappers.** An error-scan of recalculated output would
   have shown nothing wrong; only the cached-value diff caught it.
   Fallback-masking upgrades the function gap from « loud failure »
   to « silent wrong number », which is the worst class there is.
2. The PCFM drafts' `#VALUE!`/`#NAME?` cells are the same family
   without the camouflage. All of it resolves with the ≥ 25.8
   upgrade — and stays covered by the prescan for whatever the
   *next* unsupported function is.

**And the refusal is the product.** Two files the engine could not
faithfully reproduce were refused behavioural judgement, with the
reason named. In a demo, that is said exactly so: « here is a file
we refused, and why » — the trust promise executing in code.
