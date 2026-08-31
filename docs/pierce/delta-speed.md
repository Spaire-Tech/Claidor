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
