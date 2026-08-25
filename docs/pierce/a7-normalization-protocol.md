# A7 — shape-hash normalization: the registered micro-round

swens-plan Track A, step A7, plus the idiom guard the A3 mining
round ordered (« normalize, never flag »). Registered here before
the change is implemented or measured. The shape hash decides which
formulas are « the same calculation » — it feeds the typed-over
detector, the folds, and the finding counts — so it is never edited
quietly: this round measures the whole corpus before and after, and
adopts only if every difference is an intended idiom-merge.

## The three normalizations (fixed now)

Applied inside the engine's `_shape`, after the existing
reference-relativization and number-erasure:

1. **Commutative chain ordering.** In a chain whose operators are
   *all* `+` or *all* `*`, and in the argument list of a symmetric
   function (`SUM`, `MIN`, `MAX`, `AVERAGE`, `COUNT`, `COUNTA`,
   `PRODUCT`), the normalized operand tokens are sorted. Chains with
   mixed operators, any `-` or `/`, are untouched — `a-b+c` is
   order-sensitive and stays as written.
2. **Constant-shape folding.** At shape level every number is
   already `#`; pure-constant arithmetic reduces to one `#`
   (`#*#` → `#`, `(#)` → `#`, repeated to a fixed point), so
   `=A1*2*3` and `=A1*6` — one decision, two spellings — carry one
   shape.
3. **Unary plus erasure.** The Lotus-era leading `+` (`=+C26`) and
   unary `+` after an operator or `(` are dropped. The A3 evidence:
   `=+C26+C31` and `=F26+F31` translated to the same cell are the
   same calculation; today they carry different shapes.

4. **Whitespace erasure** — added by amendment before any
   measurement: the implementation re-renders the shape from a parse
   of the token stream, and the re-render carries no whitespace, so
   `=A1 + B1` and `=A1+B1` become one shape. A consequence of the
   mechanism, registered as its own normalization rather than
   slipped in. Formulas the mini-parser cannot parse fall back to
   the old token join, whitespace and all — never an error.

**Explicitly out of scope,** noted from the mining round:
`SUM(A1:A3)` vs `(A1+A2+A3)` equivalence — expanding ranges needs
cell knowledge the tokenizer does not have; it stays a distinct
shape and never becomes a finding on its own.

## The measurement (fixed now)

- **Instrument:** the golden-master gate (`scripts/corpus_gate.py`)
  over the 27-file AU-UK corpus rebuilt by `scripts/corpus_au_uk.py`.
- **Precondition:** the gate is green on the unmodified engine on
  this machine (its own fresh sweep equals the committed baseline)
  **before** the change lands — otherwise the round stops.
- **After the change:** the full sweep re-runs; every file-level
  difference from the baseline is read by hand and must be an
  intended merge — two findings that were one authoring decision now
  reported once, or one finding whose member roster grew because an
  idiom variant joined its family. Any difference that is not that —
  a finding appearing, a finding vanishing without its family
  absorbing it — refuses the round.
- **Recorded either way:** total findings before and after, per-rule
  deltas, and the hand-read sentence for every changed file.
- **On adoption:** the baseline is regenerated and committed in the
  same commit as the change, per the gate's own protocol; the 502
  tieout tests must stay green.

## Prediction (written before running)

Finding counts go down or hold; no new finding appears. The likely
movers are hardcode-in-formula and long-formula families whose
members differ only by constant-spelling or unary plus, and any
typed-over family whose formula flank was split by an idiom variant.
If a *new* finding appears anywhere, the normalization widened a
family until a deviant became visible — that is not automatically
wrong, but it refuses this round and gets its own examination.

---

## Precondition result (25 Aug, before the after-sweep)

The unmodified engine's fresh sweep of the rebuilt 27-file corpus is
**gate clean** against the committed baseline — every file reports
identically, finding for finding, on this machine. (First attempt
was OOM-killed by a concurrent heavy run; the clean run had the
machine to itself. Heavy workbook jobs run alone now.) The
after-sweep with the four normalizations live runs next; its diff
and the hand reading land below.
