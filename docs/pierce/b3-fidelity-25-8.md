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
