# The China open-source haul — the founder's research, the lead's verification and disposition

27 August 2026. The founder's research agent surveyed Chinese
spreadsheet-science open source; the lead verified the load-bearing
claims from this container before grading. Dispositions below are
orders where cheap, plan-amendment proposals where structural.

## Verified by the lead, this container, today

- **Tasi** (`github.com/tcse-iscas/Tasi`, ISSTA 2021): cloned.
  `Groundtruth and tool results.xls` confirmed — 291 worksheet rows,
  per-cell ground truth split into formula errors and missing
  formulas, plus per-tool cell lists **including ExceLint**. This is
  a second, independent labelling of the same 70 CUSTODES/EUSES
  files our A2 benchmark uses. No licence file in the repo —
  internal benchmarking only, citation owed, no redistribution.
- **VEnron2 mirror** (`castle.cse.ust.hk/venron/`): unreachable from
  this container (connection fails). figshare answers — the archive
  route to try at fetch time; otherwise the founder's browser.
  Terms are research-only; commercial use needs the authors' word.

## Dispositions

1. **Tasi re-score — ordered (Sentinel, next after candidate 4).**
   Registered round: our engine over the same 70 files, scored
   against Tasi's labels with conventions fixed first; the ExceLint
   column tabulated into the six-way table (it largely settles what
   task #55's blocked ExceLint run was for — the run-it-ourselves
   half stays optional). The 1,974-vs-3,702 disagreement between
   two expert labellings of identical files is itself a result: the
   field's noise floor, ours to publish with pre-registration
   discipline. The founder's researcher reproduced Tasi's published
   75.2%/82.9% with an independent scorer and caught a README digit
   transposition (3,072 vs 3,702) — cite accordingly.
2. **AutoMR — proposed as a plan amendment (needs the founder's
   go).** Metamorphic-relation *mining* over the recalculator: the
   model is run blind under input perturbations and its own
   invariant laws are discovered (PSO + SVD + Z3 per the ICSME 2019
   paper), then checked across versions — « the eleven laws your
   model obeys, and the one that stopped holding between v8 and
   v12 ». Fits as **B5** after B4; the recalculator interface is
   already the required shape. **Clean-room from the paper** (the
   reference code is LGPL-3.0, which bites the in-tenant plan);
   stochastic and slow — the overnight pass, never the demo. Their
   published oracle: zero false detections across all programs.
3. **SQLSolver — ordered as required reading (Prism) before tier 1
   registers.** SIGMOD 2024, Apache-2.0: equivalence with unbounded
   summation (LIA*) — precisely the wall our C4 tier-1 fragment
   would hit on SUM-over-symbolic-ranges. Read before writing the
   Z3 fragment; use it if the Excel bridge is buildable, learn from
   it if not.
4. **WARDER/SGUARD** (Nanjing): clustering-validity precision ideas
   over CUSTODES-style grouping; code link 404s — ideas only, filed
   for Sentinel's future mining rounds.
5. **Auto-Formula inversion** (house-style drift: « this formula
   differs from the same position in the firm's other models ») —
   filed as a future A5-adjacent candidate; idea only, no code.
6. **PaddleOCR PP-StructureV3** (Apache-2.0): candidate for D1's
   scan-fallback slot (today scans are refused; the plan always
   allowed a measured fallback). Filed for Scribe's future round;
   not ordered now.
7. **Univer formula engine** (Apache-2.0): possible third
   calculator/tie-breaker — but decimal.js semantics ≠ Excel's
   binary floats, so for a fidelity gate it adds a voter with
   different arithmetic. Filed, low priority.
8. **TableSense** (ODUA — clean licence): table-boundary ground
   truth over versioned corpora; filed for structure-layer
   measurement. **MinerU**: attribution-in-product obligation —
   product decision, filed. **ForTaP/TUTA**: weak transfer, skip.
   GNN anomaly scoring and LLM sheet-agent benchmarks: skip, for
   the reasons the researcher gave — unexplainable suspicion is the
   opposite of defensible findings.
9. **VEnron2 archiving** — with the founder (browser + form, or
   figshare); 16.9% of evolution groups introducing errors is an
   independent base rate to sit beside our PR24 10-of-16.
