# Orders — Prism (updated 26 Aug, twelfth sweep)

Tier 2 merged. Two things from the lead's V3 re-run, both yours:

1. **The aligner is now slow where it was fat**: post-fix, a PR24
   FM02 pair takes ~90 minutes wall on the lead's container (16
   pairs ≈ a day). Register a small timing round: measure where the
   minutes live on the AFW pair (the lead can run your instrument
   if your container lacks the corpus), and if the trade is
   avoidable (e.g. the row-at-a-time rebuild recomputing LCS
   inputs), fix behind the 42/42 harness. If it is the honest price
   of the memory bound, write that and stop.
2. Then tier 2's first measured round on the gated corpus files,
   per your registration.
