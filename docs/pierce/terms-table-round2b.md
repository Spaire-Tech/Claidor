# Terms table — round 2b, the credit convention re-measured

Registered before the harness runs, committed first; results appended
below the line after one run; the bars do not move.

## Why this round exists

Round 2 measured class 1 and passed every bar, with four flags on the
real pair: one true wrong input (row 44) and three `sign-convention`
flags (rows 21/57/59 — the schedule prints credits in parentheses,
the model holds magnitudes, and the binding schema could not state
the flip). The founder approved wiring the credit convention through
(31 Aug): `ChainTerm` and the check now carry `transformation` from
the shared registry (« identity », « negate »), stated by the person
at binding, applied at check time, refused in words when unnamed.
`ChainLink`'s re-check applies the same registry — one vocabulary,
both tracks.

This round re-measures the control and planted legs with the
convention **stated where the page prints it** — and proves the
statement is applied, never absorbed: a wrongly stated convention
must flag exactly as a wrongly stated scale does.

## Protocol — round 2 unchanged except the statements

Corpus, truth, the frozen selection geometry, term construction and
binding are round 2's, verbatim. One change: rows **21, 57, 59** are
bound with `transformation="negate"` — the person reading the
parenthesised credits off pages 219's schedule and stating what they
see. Every other row stays `identity`.

## Bars and predictions (registered now)

- **Bar B1 — the noise is gone and the finding is not:** the control
  leg flags **exactly one** row — row 44, the true wrong input — and
  **14 of 15** tie out. A sign-convention flag surviving means the
  wiring failed; row 44 going quiet means the wiring silenced a real
  finding, which is worse.
- **Bar B2 — plants still caught:** the full planted leg re-run (30
  plants, one row at a time, negate bindings in place): **30 of 30**
  caught, including P1/P2 on the three negate rows.
- **Bar B3 — quiet under plants:** 0 changed verdicts across the 420
  non-planted row-checks.
- **Bar B4 — a wrong statement is caught, not absorbed:** row 10
  (a plain positive pair) bound once with `negate`: the check must
  report the pair not tying out (44,016 against −44,016). The
  person's statement governs in both directions.
- **Prediction:** 14/15 tie, row 44 the only flag; 30/30; 0/420;
  the wrong-statement probe flagged. All arithmetic — any miss is a
  wiring defect, not a near-miss.

Harness: `server/scripts/terms_table_round2b.py`, reusing round 2's
frozen selection and construction by import, committed with this
file and run once after this commit. Verdicts:
`terms-table-round2b-verdicts.json`, committed whatever they say.

---

# Results (one run, after the registration commit; the bars did not move)

Run 31 Aug 2026. Full verdicts: `terms-table-round2b-verdicts.json`.

| bar | result |
| --- | --- |
| B1 — one flag, and it is the finding | **PASS — 14 of 15 tie out; row 44 is the only flag.** The three credits, bound as the page prints them, go quiet; the true wrong input does not |
| B2 — plants still caught | **PASS — 30 of 30**, the negate rows included |
| B3 — quiet under plants | **PASS — 0 of 420** |
| B4 — a wrong statement is caught | **PASS — flagged** (row 10 bound « negate » it does not deserve reads 44,016 against −44,016) |

**Every registered prediction held exactly.**

## Where class 1 now stands, in one sentence

On the real pair, with the credit convention statable, the check
raises **exactly one flag and it is a genuine wrong input** — a model
typing 0 against a cited document cell printing $704,462 — with 30 of
30 planted disagreements caught, zero noise on the 14 clean rows,
and a wrongly stated convention flagged rather than absorbed. The
founder's order — class 1 right before anything else — is met with
its numbers.

**Gate status:** `dev/verify` on the wired state: **pass** — lint,
format and types clean, **1,199 passed, 11 skipped** (the six new
credit-convention tests included). The golden master stands from
round 1's sweep: this round touched the chain package only, and the
engine's audit path is unchanged.
