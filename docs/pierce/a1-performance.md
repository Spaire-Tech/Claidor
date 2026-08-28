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

---

# The speed round — 28 August

Rounds 3–6, run in one day after the founder's direction (« i really
need that memory + time fixed. needs to be seconds. thats the one
thing that makes the difference »). Every round is sourced to its
commit; the commit bodies carry the full working.

## What changed, in order

### Round 3 — intern every reference (`a8496fc`)

Measured before touching anything, on Ofgem's GD3 business plan model
(693,753 cells), reading alone in a fresh process: **252 s, 6,290 MB.**
Counted rather than guessed:

| | |
| --- | --- |
| precedent strings held | 74,491,268 |
| distinct by value | 825,694 |
| distinct by identity | 74,491,268 |
| duplication factor | **90.2×** |
| mean reference length | 22.9 chars |

At 22.9 characters a string costs about 72 bytes, so those 74.5 M
objects are ~5.4 GB — essentially the entire peak. Every reference is
born in one function, `_cells`, so `sys.intern` there collapses ninety
copies into one and the lists hold pointers.

**6,290 MB → 1,763 MB (3.6×); objects 74,491,268 → 825,694; read
252 s → 236 s** (faster, because it allocates far less).

### Round 4 — the range cap was four times too generous (`d5c9570`)

`tracemalloc` on the heaviest model named the cost exactly:
`refs=tuple(found)` held 597 MB and `via_lookup=tuple(...)` 185 MB —
**61% of everything retained**, both range expansion. `MAX_RANGE` was
200, chosen when written and never tested.

| cap | read | peak | corpus sweep | findings |
| --- | --- | --- | --- | --- |
| 200 | 252 s | 6,290 MB | 3,300 s | the baseline |
| 50 | 121 s | 1,255 MB | 2,463 s | **identical, all 27 files** |

150 of every 200 expanded cells were never read by any check. **10 was
also clean and is deliberately not taken**: a twelve-month sum and a
thirty-year schedule are units a modeller thinks of as whole, and
truncating those would be real loss even though this corpus cannot see
it. 50 keeps every ordinary range intact and bites only the
whole-column selections the cap exists for.

One test failed and was right to — `test_the_range_cap_says_when_it_bit`
pinned the literal 200. Rewritten against `MAX_RANGE` itself: a test
that pins the tuning rather than the promise fails for the wrong reason
every time somebody improves it.

### Round 5 — one pass over the workbook instead of two (`45ce411`, `5931ec1`)

Three hypotheses died on measurement rather than after a week of
building, and they are on the record because a rejected idea is worth
as much as an adopted one:

- **sharing precedent tuples** — recovers 0.1%;
- **empty-cell padding** — not the cost: `reset_dimensions` cut cells
  touched 6,079,186 → 412,560 and the time did not move at all;
- **caching tokens by formula text** — worthless at 1.1× reuse.

The one that was real: `read_workbook` opened every model **twice** —
`data_only=False` for formulas, `data_only=True` for values — because
that is the only way openpyxl gives both. On a median regulator model
that was **16.4 s of a 19.5 s read, 84% of it**, against a 2 s audit.
The reader was the product's speed, and half the reader was reading the
file again.

Both layers sit in the same element (`<c><f>D16+D24</f><v>48.9</v></c>`);
openpyxl discards one depending on a flag. A single lxml pass keeping
both measured **1.6 s and 119 MB against openpyxl's 16.4 s and 356 MB**
— ten times, measured *before* a line was written, which is why the
build was worth starting.

`polar/tieout/sheets.py` reads the formula layer, the value layer and
the number formats together. **It does not re-invent Excel's semantics
and must not**: every conversion — number casting, the serial-to-date
rule, shared strings, booleans, inline strings, ISO dates, shared and
array formulas — imports openpyxl's own helpers and calls them in
openpyxl's own order, transcribed from `WorkSheetParser.parse_cell` and
`parse_formula`. The iteration machinery is replaced, which is where the
time was; the meaning is kept, which is where the risk is. Anything it
cannot read falls back to the two loads, so an unfamiliar workbook is
slow rather than wrong.

Median model read **21 s → 9.2 s**, peak **384 MB → 317 MB**; corpus
sweep 2,463 s → 2,167 s.

### Round 6 — open a workbook without its stylesheet (`1711eda`)

After the single-pass reader, the remaining read was 9.2 s and
`load_workbook` was **5.62 s of it, before a single cell was parsed**.
The reason: a real regulator model carries a **13.5 MB `styles.xml`
with 55,808 records**, and openpyxl turns each into a font, a fill, a
border, an alignment and a colour. What the engine wants from all of
that is one attribute per style: the number-format code.

`sheets.open_workbook` runs openpyxl's own reader stage by stage and
omits `apply_stylesheet`; `sheets.number_formats` reads the two things
that matter straight out of the XML. Everything fiddly — sheet order
and state, defined names and their scopes, the epoch — is still
openpyxl's own code producing openpyxl's own objects.

`load_workbook` 5.62 s → open + our styles **0.44 s**.

## The result

Median corpus model — what a customer actually uploads:

| | 25 Aug | 28 Aug |
| --- | --- | --- |
| read | 21.0 s | **4.4 s** |
| audit | 2.0 s | 2.5 s |
| **total** | **23.0 s** | **6.9 s** |
| peak memory | 384 MB | **155 MB** |

Heaviest model (GD3 BPFM, 693,753 cells): **6,290 MB → 1,255 MB (5.0×)**
and read **252 s → 121 s (2.1×)**. Corpus sweep **3,300 s → 2,067 s**.

155 MB sits comfortably inside the 512 MB production box (Render
`starter` = 0.5 CPU / 512 MB). 1,255 MB does not — the heaviest
regulator model still needs a bigger plan, and the cheapest Render plan
with ≥ 8 GB is `2c-8g`. That is a cost decision for the founder, stated
rather than buried.

## How it was verified — three independent oracles, all after the fix

| Oracle | Scope | Result |
| --- | --- | --- |
| Cell-by-cell differential vs openpyxl | 27 files; formulas, values, number formats | **zero differences** |
| Styles differential | 27 files; every style id, code, date flag | **zero differences** |
| Golden-master gate | 27 files, finding for finding | **clean, 27 of 27 identical** |
| Test suite | | 1,062 passed, 4 skipped; lint, format, types clean |

## Two mistakes recorded, because both nearly shipped

1. **The openpyxl bug that was mine.** The styles differential flagged
   two files. I concluded openpyxl had an off-by-two in its
   custom-format lookup, wrote that up, and changed the module to
   « match the bug » — which made **eleven** files differ instead of
   two. Reading `Stylesheet._normalise_numbers` showed the defect was
   mine: a workbook may **redefine a builtin format id** (these models
   redefine 43 and 44), and openpyxl consults the workbook's own table
   at *every* id before falling back to the builtin. Corrected to that
   rule → zero differences. The write-up of an openpyxl bug that does
   not exist was deleted rather than left standing.

2. **A latent bug no gate could have caught.** `open_workbook` skips
   the stylesheet, and the *fallback* path read `cell.number_format`
   off that object — so any workbook taking the fallback would have
   received default formats, silently. Nothing in the corpus takes that
   path, so no test and no gate could see it. It was found by reading a
   diff, and fixed by re-opening with `load_workbook` in the fallback
   (verified: 43,101 cells, 42,146 with real formats). The lesson is
   that a green gate is evidence about the paths the corpus exercises
   and nothing more.

## What A1 still owes

**The spec's sentence — 600k cells read in under a minute — is not
proven and I will not claim it.** The heaviest model reads in 121 s
here. This container swings ±30% on repeated identical runs, so it
cannot honestly measure « under a minute » either way. The claim stays
owed to a quiet machine; everything above is a delta or a controlled
A/B, which is what this box can support.
