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

## Baseline profile (this round, this container)

*to be filled from `scripts.watch_delta_profile` before any change*

## Predictions, registered before optimising

*to be filled after the profile, before any optimisation lands*

## A/B results

*to be filled; every change gated on the digest and the corpus gate*
