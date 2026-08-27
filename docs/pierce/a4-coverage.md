# A4 — coverage on the face of the report: the registered round

swens-plan Track A, step A4: « Every audit states what was checked,
what was not, and why (« 102 checked, 26 not »). The structure map
already knows; the report must say it. DONE: every report carries
the denominator. » Registered before implementation.

## What already exists, checked in the code before designing

Three things carry a denominator today, and none of them is the
mechanical audit's:

- `schemas.Coverage` — « 102 of 128 figures reconciled » — is the
  **tie-out's** reach (deck against model), with its reasons.
- `Analytics` carries `tallies` (« 223 of 226 rows clean », keyed
  by rule) and `abstentions` (`rule`, `why`) — the analytical
  checks already say what they examined and where they declined.
- `Structure.unlocated` holds the blocks that could not be found,
  each with the sentence a screen shows.

The **mechanical audit** has only `Audit.examined: int` — a raw
cell count. So a reader cannot tell « this rule looked and found
nothing » from « this rule had nothing to look at ». That
distinction is the whole of A4, and it is the gap this round fills.

## What this round does (fixed now)

The audit gains the two fields the analytics side already has, with
the **same names and the same shapes**, so the product meets one
vocabulary rather than two:

- `Audit.tallies: dict[str, dict[str, int]]` — per rule, what it
  examined. Absent means the rule examined nothing it could count.
- `Audit.abstentions: list[Abstention]` — `rule` and `why`, for a
  rule whose denominator is zero *for a nameable reason*.

**The denominators, fixed now**, each the population the rule
actually walks — not a guess, and never larger than what the rule
could have flagged:

| rule(s) | examined |
|---|---|
| `long-formula`, `volatile`, `hardcode-in-formula`, `inconsistent-anchoring`, `inconsistent-row`, `external-link` | formula cells |
| `error-value` | cells carrying a cached value |
| `typed-over-formula`, `typed-over-edge` | typed cells sitting inside a run of formulas |
| `skipped-cell`, `inconsistent-total`, `range-over-block` | bare aggregations judged |
| `circular` | cells with precedents |
| `hidden-sheet` | sheets |
| `broken-name` | defined names |

**Abstention reasons, fixed now** — only these, each a fact about
the file rather than a judgement:

1. « the workbook holds no formulas — a values-pasted copy ».
2. « this workbook declares no defined names ».
3. « this workbook has one sheet ».
4. « nothing of this kind is present in the file » — the honest
   catch-all, used only when the denominator is genuinely zero and
   none of the above applies.

A rule with a **non-zero** denominator never abstains: it looked,
and silence means clean.

## The boundary — what this round does not touch

`FindingRead` and the report JSON are **Atelier's**, per `lanes.md`.
This round stops at the engine: it computes the coverage and hangs
it on `Audit`. The product-side surfacing is written up as a
request and **routed through the lead**, exactly as the orders
direct — I do not touch `schemas.py`, `service.py` or
`endpoints.py`.

## The measurement (fixed now)

This round changes **no finding**. So the criterion is unusually
sharp and worth stating plainly:

1. **The gate must be clean.** The full 27-file sweep diffed
   against the committed baseline must be identical in findings.
   Any movement whatsoever refuses the round — there is no
   examination that could excuse it, because a coverage counter has
   no business changing what the engine reports.
2. The conftest-free tieout tests stay green, with new tests
   pinning the tallies and each abstention reason.
3. The catalogue is unchanged — no rule is added — so there is
   nothing for Atelier's count test.
4. Spot-checked by hand on at least two corpus files: the tallies
   must be *arithmetically consistent* with the file (a formula-cell
   tally equals the file's formula-cell count), and any abstention
   must be true of that file.

## Prediction (written before running)

The gate is clean, because the change only counts. On the AU-UK
corpus I expect **no abstentions at all** on the BPFM and PCFM
models — they are formula-rich, multi-sheet, and carry defined
names — and abstentions to appear, if anywhere, on the smallest
files. If one appears on a large model, it is either a real fact
worth knowing about that file or a bug in my denominator, and the
hand check decides which.
