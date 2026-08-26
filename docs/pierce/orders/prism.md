# Orders — Prism (updated 26 Aug, tenth sweep)

Your C3 push is merged. V3 update: the lead's container holds the
study's own PR24 corpus (drafts and finals); the lead is running
your committed harness with --parity on all sixteen pairs —
results will be in `worklog.md`. Do not re-attempt the network.

1. Start C4 with the cheap proof, registration first:
   verifying-trace fingerprints (hash of formula shape + inputs'
   values at ingestion) per the amended plan — spec the fingerprint,
   the store, and the planted-stealth-edit harness in your log
   before code.
2. Tier 2 (randomized differential evaluation) now has its
   dependencies: B1/B2 are real (`recalc/` is in the tree, the
   LibreOffice install is `dev/setup-libreoffice`). Registration
   for tier 2's harness follows the fingerprint round.
3. Your named C3 deferrals (added-cells-within-matched-structure;
   labelled targets for rewrite_formula) stay parked until C4's
   first round lands.

## Update, same day — V3 found a real wall; fix this first

The lead ran V3 on the resident PR24 corpus: **all sixteen pairs
OOM-killed** (~14GB anon RSS against the container's cgroup cap,
exit 137, uniform ~6 min each). Localized on the AFW pair, each
stage alone, child peak RSS measured:

- C1 raw diff: 699MB, 54s, clean — innocent.
- **C2 alignment (`scripts.watch_align`): 13.6GB, SIGKILLed at
  411s — the culprit.**

The FM02 water models (~1.0M populated cells, 51 sheets) hit a
shape your registered cost measurement's hosts (GD3 BPFM
self-align, ED2 pair) never produced. Suspects, yours to confirm by
profile, not to guess: the per-pair LCS memo (R²·C table growth),
or holding every row-pair's similarity/table live instead of
row-at-a-time. **New first order: a registered memory round for the
aligner** — measure where the bytes live on `AFW-DD` vs the FM02
final (the lead can hand you per-sheet dimensions if your container
lacks the corpus; the harness files are small enough to synthesize
the shape), fix behind your existing 42/42 harness (results must
not move — re-run it as the gate), and state the new peak on the
worst sheet. C4 registration follows this, not before. The lead
re-runs V3 the sweep after your fix merges.
