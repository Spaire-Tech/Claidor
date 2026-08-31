# The fidelity gate, re-run on LibreOffice 25.8

*Registered 31 August 2026, before the sweep. Nothing below the
« Result » heading existed when this was committed.*

## The correction that starts this round

I told the founder « 23 of 27 match, 4 don't ». **That is wrong.** I
took it from a summary line rather than from the data, which is the
thing I am not supposed to do. The v1 record
(`fidelity-lab27-v1.jsonl`, 27 files, LibreOffice 24.2) actually says:

| state | files |
| --- | --- |
| perfect, 1.000000 | **3** — both H7 debt-indexation models, RIIO GDT3 RoE summary |
| one mismatching cell (`Cover!G4`, a filename cell) | **9** ED2 versions, 0.999983–0.999984 |
| 66 mismatching cells, all per-sheet titles built from the filename | **2** H7 PCM, 0.999819 |
| real divergence, 159 and 195 cells | **2** draft PCFMs, 0.9924 / 0.9941 |
| 1,294 `#NAME?` — functions 24.2 does not know | **1** draft GT3 PCFM, 0.9610 |
| **22,476 and 23,831 mismatching cells** | **2** WACC models, 0.9631 / 0.9583 |
| **`diff failed` — never compared at all, no reason recorded** | **8** — six BPFM `.xlsm` and two ED2 versions |

So it is not four files. **Eight never ran, and five diverged for
reasons ranging from cosmetic to enormous.** Eleven more differ only
in cells that name the file, which is a recalculated copy honestly
reporting its own new filename rather than a fidelity failure — v1
already flagged that class for exclusion from scoring.

## Why re-run at all

`pieces.md` said this container runs LibreOffice **24.2**; it runs
**25.8.7.3**, installed at `/opt/libreoffice25.8` by the committed
`dev/setup-libreoffice`, and `find_install()` has been preferring it
all along. The v1 numbers are the 24.2 run and **have never been
repeated**. The plan's own note on this piece says to check the
version gap first, and nobody has.

Every arbiter-shaped decision downstream — which files need real
Excel to referee them — rests on numbers taken under a version we no
longer run.

## Conditions

- The same 27-file corpus, rebuilt from
  `corpus-au-uk-manifest.md`, unchanged.
- `scripts/recalc_gate.py`, unchanged. Files one at a time, a fresh
  `soffice` per file, incremental per-file output.
- **Scoring identical to v1**, including counting the filename cells
  as mismatches. v1 flagged that class for exclusion in v2 and it
  deserves excluding — but changing the scoring *between the two runs
  being compared* makes them incomparable, which would defeat the
  point. The class is reported separately instead, and the exclusion
  is a later decision made once, on both runs.

## Predictions, before the sweep

1. **The 1,294 `#NAME?` on draft GT3 largely disappear.** XLOOKUP and
   LET arrived in LibreOffice well before 25.8, and that failure was
   explicitly diagnosed as the version gap. This is the prediction the
   whole round turns on: if it does not hold, the diagnosis on record
   was wrong.
2. **The 11 filename cells do not change at all.** They are
   environment-volatile by nature, not version-dependent. If any of
   them moves, my understanding of that class is wrong.
3. **The 8 `diff failed` files are the real unknown.** No reason was
   ever recorded, so I am not going to pretend to predict them. What I
   will do is **capture the reason this time** — a failure with no
   diagnosis is the thing that let this sit unexamined for a week.
4. **The two 22k+ WACC models: I do not know.** One of them is the
   single manual-calculation file found in Piece 1, and « the manual
   file is one of the two WACC models failing the gate » was recorded
   then as a hypothesis and never tested. This run does not test it
   either; it just stops me pretending the number is unexplained when
   there is a candidate explanation on the record.

## What may not happen

No tolerance is changed, no file is excluded, and no denylist entry is
added to improve a number. If 25.8 fixes less than predicted, that is
the result, and the arbiter is the larger job the plan already says it
is.

---

# Result — 31 August 2026

Raw output: `fidelity-lab27-v2-lo258.json`. Engine string recorded per
file: `LibreOffice 25.8 (UNO, /opt/libreoffice25.8/program)`.

## The registered comparison is VOID, and the fault is mine

**The two runs do not compare the same population**, so no per-file
match rate from v1 may be set beside one from v2.

| file | v1 « cells » | v2 « compared » |
| --- | ---: | ---: |
| `h7_new_debt_indexation_fds.xlsx` | 6,665 | **2,233** |
| `v5_2026-06.xlsx` | 62,407 | **19,261** |
| `DRAFT_GD3 PCFM_Jun25.xlsx` | 20,950 | **8,185** |
| `final_wacc.xlsx` | 571,976 | **240,061** |

Every file, roughly a third. v1 counted one thing and v2 counts
another — v2 compares formula cells carrying a stored value and
reports `no_stored_value` separately, and v1's harness was not this
script. So « 22,476 mismatches became zero » on the WACC model is
**not established**: those cells may simply be outside v2's
population. The same doubt applies to every improvement in the table.

**This registration said, in writing:** « Scoring identical to v1 …
changing the scoring *between the two runs being compared* makes them
incomparable, which would defeat the point. » I wrote that sentence
and then ran a different harness without checking it was the same one.
The condition I set is the exact condition I broke.

It is the fourth time in one day that a claim was made without opening
the file first — after the stale LibreOffice version, the measurement
declared unmeasured, and the capability reported blocked on the
founder. The pattern is not carelessness about any one fact; it is
treating a document's summary as evidence.

## What the run does establish, and it is worth having

**Processability**, which does not depend on the population question at
all. This is the honest result of the round.

| | v1 (24.2) | v2 (25.8) |
| --- | ---: | ---: |
| produced **no verdict at all** (« diff failed ») | **8** | **0** |
| ran and produced a real number | 19 | 22 |
| refused before recalculating, with a reason | 0 | 4 |
| crashed the recalculator | — | 1 |

**Every silent failure became a stated outcome.** The six BPFM
workbooks and two ED2 versions that produced nothing now either
compare, fail with numbers, or are refused by the denylist prescan
with a named reason. « We did not check this, and here is why » is on
the report where « nothing » used to be, which is what B2's own
docstring demands.

Per-file, on the eight that were silent: `v3_2023-11.xlsx` and
`v3_2024-01.xlsm` now compare with **zero mismatches**; the three
draft BPFMs now fail or crash with real diagnostics; the three final
BPFMs are **refused**.

`DRAFT_GT3 PCFM`, whose 1,294 `#NAME?` errors were the headline
version-gap evidence, is now **refused before recalculation** rather
than recalculated badly. That is arguably correct behaviour, and it is
**not** the same claim as « 25.8 fixed it » — the file is no longer
being asked the question. Prediction 1 is therefore **unevaluable**,
not confirmed. Prediction 2 (the filename cells) is unevaluable for
the same reason.

## The experiment that would actually answer the question

One harness, two engines: run `scripts/recalc_gate.py` unchanged
against **25.8** and against the system's **24.2**, same corpus, same
population, only the version differing. That isolates the variable the
round was named for. Roughly six machine-hours for the pair, and it is
the only comparison that would mean anything.

Held for the founder's word rather than started on my own say-so,
because the value of the answer is now in question: the practical
decision the round fed — which files need the arbiter — is already
answered by the processability table above.
