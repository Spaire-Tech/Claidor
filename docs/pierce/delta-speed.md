# Piece 9 — the delta report's speed

The Watch's delta report (`polar/tieout/watch/delta.py`) against its
registered test (`docs/pierce/logs/prism.md`, « MY PIECE: version
comparison in usable time »):

> A real published pair — Welsh Water draft against final, 12 MB each,
> today 2 h 06 m — completes in under two minutes with parity against
> `revision_diff` still EXACT.

The Welsh Water pair is unreachable from this container (Ofwat 403s —
recorded in the same log), so this round runs on the standing local
proxy, **larger** than the test's subject: the RIIO-3 GD3 pair, draft
BPFM (15.1 MB, 652,176 cells) against final BPFM (15.0 MB, 693,753
cells). Prism's last measurement on it: `delta_of` with findings
handed in **438 s**, scaled to 12 MB roughly **350 s — about 3× over
the two-minute line**. That 3× is this piece's opening position.

## The starting-state audit — code first, docs second

Every line below was checked in the tree this session, not inherited.

**What exists and runs.** The delta machinery is where the lead
believed: `polar/tieout/watch/` — `delta.py` (the report), `align.py`
(anchor decomposition + DP), `signature.py` (grids), `diff.py`,
`tiers.py`. The report's semantics are pinned by 16 tests in
`tests/tieout/test_watch_delta.py`, including one that pins « passing
findings gives the same report as running them ». The tieout suite at
main's tip: 914 passed, 10 skipped, one pre-existing failure in the
Chain's extract test (not this piece's path), 8 collection errors from
the container's known pydantic breakage.

**What was already built for this problem, and is not wired.**
`delta_of` already takes `old_findings` / `new_findings` — the old
Prism lane built it and measured 2.55× on the GD3 pair. But the
product's one real caller, `service.delta_between`
(`service.py:2091`), calls `delta_report(old_path, new_path)` and
hands nothing in — even though `ingest.py:185` audits every upload as
it arrives. The optimisation exists; the product does not use it.

**The recorded diagnosis, verified in code.** `audit()` clears the
shared parse caches when it finishes (`audit.py:857-859`), so a delta
that runs two audits and then builds grids pays the cold shape pass
up to three times. The clear is content-keyed housekeeping — memory
only, never correctness — which is what makes retaining it across a
pipeline safe by construction.

**What is claimed but absent.** The registered acceptance test — the
Welsh Water pair under two minutes, parity EXACT — has **never been
run**: the pair is unreachable from this container (Ofwat 403s,
recorded in the prism log). Prism's 438 s / « 3× over » numbers are
measurements from a previous session's tip; this round re-measures
them on today's main before acting on them.

**The gate.** Corpus rebuilt from the manifest (27 files, 159 MB);
the sweep on untouched main is **gate clean, 27 of 27**, finding for
finding — the baseline this round's identity claims stand on.

**One document error corrected.** `pieces.md` § 1c called the delta
report's speed « Piece 5 » while its own order-of-work table numbers
it 9; the row now says Piece 9.

## The hard constraint

This is optimisation, so the output is **identical** before and after
— not equivalent, identical. Two oracles:

1. **The full-report differential.** `scripts/watch_delta_profile.py`
   serializes the *entire* report — every field of every item, no
   truncation, sorted keys — and digests it. The digest before any
   change must equal the digest after every change, on every pair
   measured. (`scripts.watch_delta` truncates at 400 items; right for
   reading, wrong for a differential.)
2. **The golden-master gate.** Any change touching the engine
   (`audit.py`) re-runs the 27-file corpus sweep and diffs
   finding-for-finding against `docs/pierce/corpus-golden-master.json`.

## The measurement protocol

This container swings ±30% on repeated identical runs
(`a1-performance.md`, « The machine, stated first »). So: no single
stopwatch numbers; back-to-back A/B runs of the same script on the
same pair; heavy runs one at a time (the OOM lesson in
`lead-handoff.md`). A claimed speed-up must survive the A/B being run
in both orders or be large enough that ±30% cannot explain it.

## The target, registered

On the GD3 pair (the 15 MB proxy), **`delta_of` with findings handed
in completes in ≤ 150 s** — the 15 MB equivalent of the two-minute
line at prism's own 12 MB scaling (120 × 438/350) — with the report
digest unchanged. The stopwatch sentence for the real Welsh Water
pair stays owed to a machine that can reach it, exactly as A1's
under-a-minute sentence stays owed to a quiet one.

## Baseline profile (measured this session, untouched main)

`scripts.watch_delta_profile` on the GD3 pair, one process, phases in
the product's order:

| phase | seconds |
| --- | --- |
| read old / read new | 119.4 / 127.4 |
| audit old / audit new | 283.2 / 294.0 |
| grids old, caches cold | 182.4 |
| grids new (reuses old's warm cache) | 29.5 |
| grids old, warm rerun | 10.9 |
| align 45 common sheets | 90.7 |
| `delta_of`, findings in hand, caches **warm** | 125.8 |

Report digest `8128e2b2449ce63b…`, 3,167 items, 48,757 changed cells
— items and changed-cells identical to prism's recorded run, so the
report itself has not moved since.

**The cold-call composition.** A caller with findings in hand but a
cold process pays warm-`delta_of` plus the cold parse pass:
~126 + ~190 ≈ **~316 s** (measured directly as the A side below).
Prism's 438 s on their tip is today ~316 s on main — main got faster
between; the diagnosis held.

**Inside the cold parse pass** (GD3 final: 638,790 formula cells,
601,159 distinct texts — near-zero text-level reuse, as round 5
found): tokenize 94.4 s, shape-side 97.0 s. A cProfile sample puts
`_normal_form` at ~75% of the shape side (`_interleave` a third of
that) and `_offset` at ~11%. `_normal_form` is a pure function of its
post-`_offset` pieces, and pieces repeat down every filled block —
the one part of the pass with high reuse left unexploited.

**Where prism's estimate was wrong, said plainly:** the delta's own
comparison loop is ~20 s, not « ~100 s ». The order's original
premise (alignment 87%) was already dead; the ~100 s guess for the
loop dies here. The cold parse pass and the alignment are the piece.

## Predictions, registered before optimising

The changes, each output-identical by construction, with the bar and
my predicted worth on the GD3 pair — written before any of them runs:

1. **The comparison loop iterates occupied positions, not
   rows × columns** — same `record()` sequence, provably (positions
   where neither side holds a cell produce no call today; the
   rewrite visits exactly the others, in the same order).
   *Prediction: comparison ~20 s → ≤ 6 s.*
2. **Alignment takes the identity fast path when the two Line
   sequences are equal** — for equal sequences the anchor + DP path
   provably matches i↔i at similarity 1.0 (anchors pair unique keys
   `(i,i)`; in the gaps the DP's diagonal ties win by its own `>=`),
   so returning that directly is the same answer. *Prediction:
   align 90.7 s → ≤ 45 s. Least certain — I do not know how many of
   the 45 sheets are line-identical; if most big sheets carry even
   one changed row, this saves little.*
3. **`_normal_form` caches by its pieces tuple** — a pure function,
   so the cache is exact by construction; keyed on content like every
   other engine cache, cleared alongside them. *Prediction:
   shape-side 97 s → ≤ 55 s.*
4. **`audit()` stops clearing the parse caches inside a retained
   scope** — a context manager; the delta pipeline opts in, every
   other caller keeps today's clear-at-end. Correctness unaffected
   (content-keyed, the clear is memory housekeeping). *Prediction: no
   effect on the cold A/B quantity below; the product's full
   `delta_report` path stops paying the grids' cold pass (−~200 s
   end-to-end) and audit-new's re-tokenize.*

**The bar, restated:** cold-process `delta_of` with findings in hand,
GD3 pair, ≤ 150 s. **My registered prediction: changes 1–3 land it
at ~180–210 s — short of the bar** — and the remaining distance is
the tokenizer floor (94 s of openpyxl `Tokenizer` on 601k distinct
texts). If the A/B confirms that, the round continues with change 5:
a conservative fast-path scanner producing openpyxl's exact token
stream for plain formulas, falling back to openpyxl for anything
else (round 5's pattern), verified by a token-stream differential
over every formula in all 27 corpus files. *Prediction for 5:
tokenize 94 s → ≤ 50 s, total ~135–165 s — the bar met, within this
box's noise.* If 1–3 alone meet the bar, 5 is not built.

## The A/B protocol, registered

Two trees, one box, back to back in the same hour: A = main's tip in
a git worktree, B = this branch, the same runner script (read both
books, audit both, caches cold, then time `delta_of` with findings
handed in; print seconds and the full-report digest). PASS needs:
digests equal between A and B and equal to `8128e2b2449ce63b…`; B's
time under the bar; and if B/A shows less than 2× the run is
repeated in the reverse order before any claim. Identity is also
checked on two more pairs (ED2 v4 2026-01 → v5, H7 debt indexation
FP → FDS), and any engine-touching change re-runs the full 27-file
golden-master gate.

## A/B round 1 — changes 1–4 (measured back to back, same hour)

| quantity | A (main) | B (branch) | |
| --- | --- | --- | --- |
| cold `delta_of`, findings in hand, GD3 | 316.1 s | **209.3 s** | 1.51× |
| `delta_report` whole, ED2 v4→v5 | 20.1 s | 16.2 s | |
| `delta_report` whole, H7 debt FP→FDS | 2.7 s | 2.3 s | |
| audits (same script, outside any scope) | 551.2 s | 379.5 s | the `_normal_form` cache pays inside a single audit too |

**Digests: identical on all three pairs, and GD3's equals the
captured baseline** `8128e2b2…` — the report has not moved by one
character. Reads measured within 0.4 s of each other across the two
runs, so the box was comparable.

**The registered prediction (180–210 s, bar missed) was right**: B
landed at 209.3 s, at the top of the range, above the 150 s bar. The
round continues as registered.

## Round 2 predictions, registered before optimising (addendum)

The branch's 209 s decomposed (pickled pair, phases isolated): grids
cold 139 + 23 (of which tokenize ~94), align 68, comparison ~6.
A cProfile of the three heaviest sheets put **`lcs_length` at 256 of
267 profiled seconds** — the alignment *is* the LCS, and one sheet
(`F6 - Debt Dataset`, 1,644→1,978 unanchorable data rows) is
two-thirds of it. Only 9 of 45 sheets are fully grid-identical, so
the identity path alone was never going to carry the alignment.

5. **The tokenizer fast path** (as registered above): a conservative
   scanner emitting openpyxl's exact token stream for plain formulas
   — no strings, no spaces, no brackets, no `%`/`#`/`{}` — falling
   back to openpyxl for everything else, proven by a token-stream
   differential over every distinct formula in the 27-file corpus
   (zero mismatches allowed; coverage reported, not assumed).
   *Prediction: tokenize ~94 s → ≤ 30 s at ≥ 80% fast-path coverage.*
6. **`lcs_length` goes bit-parallel** — the standard bit-vector
   LCS-length algorithm; the same length by definition, pinned by a
   differential test against the classic DP kept as the oracle.
   *Prediction: align 68 s → ≤ 15 s.*

**Revised total prediction: cold `delta_of` on GD3 lands at
100–135 s — under the bar.** If coverage of the fast path
disappoints, the miss will be reported as a miss.

## A/B results, final

*to be filled; every change gated on the digest and the corpus gate*
