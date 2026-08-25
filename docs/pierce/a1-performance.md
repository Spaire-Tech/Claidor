# A1 — the performance round: measurements, fixes, refusals

swens-plan Track A, step A1. The spec's sentence to make true, on
the biggest corpus file (`final_gd3_bpfm.xlsm`, 693,753 cells, 49
sheets): *600k cells read in under a minute, checks in seconds.*
Every change in this round is results-identical by construction and
certified by the golden-master gate — findings must not move by one.

## The machine, stated first

All numbers here come from a shared 15GB container on a Python
3.14 release candidate, and repeated identical runs swing **±30%**
(the same read measured 223s, 229s, 230s, 297s across one day). A
single timing on this box proves nothing; only large deltas,
controlled A/Bs run back-to-back, and per-file sweep comparisons
count. The spec's sentence itself — « under a minute » — cannot be
honestly measured here and stays owed to a quiet machine.

## The baseline profile (693k cells)

- read_workbook ≈ 223s · read_structure 1.3s · audit ≈ 10–15 min.
- Inside the audit: **4.39 million tokenizations** (944s
  cumulative) and **1.7 million shape computations** (890s) for a
  few hundred thousand distinct formulas — every detector
  re-parsing the same cells. `Counter` sums over shapes: 560s.
- Inside the reader: the precedents graph is built by expanding
  every range into individual cells — 3.47M `_cells` calls, **280
  million list appends** (the « edge explosion » the research map
  warned about), plus its own full tokenization pass (140s).

## Round 1 — remember the parse (KEPT)

Tokens cached by formula text; shapes by (formula, row, column,
anchoring) — the inputs that fully determine each, so equality is by
construction and clearing (at the end of every audit) is about
memory only. No caller mutates the shared lists, checked in both
modules. Measured: audit ~324s against the baseline's 10–15
minutes, findings 82, identical. The literal scan (pure in the
formula text) joined the caches in round 2.

## Round 2 — share the cache with the reader (MEASURED, REJECTED)

The idea: the reader parses every formula anyway; share one cache
and the audit's first pass becomes free. The measurement: the
audit saved ~80s — and the read cost ~80–100s more, A/B'd
back-to-back in the same hour (230s with the cache bypassed,
305–328s populated), so it was the cache and not the machine:
storing 640k token lists mid-read is allocation pressure the read
pays for and the audit does not earn back, plus 1–2GB of memory a
sweep cannot afford. The reader parses and moves on; the audit
caches for itself. Kept on record because a plausible idea measured
and rejected is worth as much as one adopted.

## Where it stands, and the named next targets

Roughly, on this noisy box: read ~230–300s · audit ~240–330s for
693k cells, findings identical throughout. The spec needs another
order of magnitude, and the profile names where it lives:

1. **The range-expansion storm** (the reader's ~130s of `_cells` and
   280M appends): represent ranges as compressed nodes instead of
   expanded cell lists — the research map's interval-tree item. A
   representation change touching every consumer of precedents; its
   own round, the biggest single win available.
2. **The tokenizer floor** (~190s of first-parses in the audit,
   ~140s in the reader): openpyxl's tokenizer is the per-formula
   cost floor. Compact token storage (three-field tuples) or a
   faster scanner — measured against exact-equivalence first.
3. **Detector interiors** after that: `_offset` (87s), the loops
   pass's generator (51s).

The golden-master gate certifies each round: the full-corpus re-run
for rounds 1–2 is recorded below.

## Gate certification (appended when the run lands)

**Certified, 25 Aug:** the full 27-file sweep on the rounds-1-and-2
configuration is **gate clean** — every file reports identically to
the adopted baseline, finding for finding. The speed work changed
nothing the engine says. Sweep wall time 3,634s for the 27 files on
the noisy box (per-file times in the run log); the stopwatch claim
for the spec's sentence stays owed to a quiet machine, as stated
above.
