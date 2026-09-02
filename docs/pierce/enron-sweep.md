# The Enron sweep — registration, before any result is looked at

Founder's instruction, 2 September 2026: « fetch the enron corpus and
run the engine on it all. » This file fixes what is measured and what
is predicted before the sweep produces a number. Results are appended
below the line at the bottom, never edited above it.

## The corpus, as fetched

- Source: `SheetJS/enron_xls` on GitHub, partial clone (tree only,
  blobs streamed per batch, because this container has under 7 GB free
  and the full checkout is larger). Nothing from it is committed.
- Licence: the collection is published under CC0 by its collector.
  The underlying documents are Enron's, released through the EDRM
  data set. The standing note in `scripts/corpus_formulas.py` holds:
  **internal measurement only; legal advice before anything from it
  goes near a product, a published corpus or training material.**
- Population: **20,872 files ending in `.xls`**. The tree holds
  20,901 entries in all: 20,276 under `edrm/` and 617 under `nuix/`,
  the remainder being README, licence and script files, which are
  not in the population. The earlier research note said 9,145
  workbooks; that count came from a different listing and is
  superseded by this one, which is the tree as cloned today.
- The collector's README warns the set is « in original format,
  including BIFF2, TSV, semicolon-delimited values, SYLK and HTML
  files saved as XLS », de-duplicated by MD5. So a large share are
  not BIFF8 workbooks at all. Readability is therefore the first
  measure, not an assumption.
- Held-corpus contamination set: the MD5 of every workbook already in
  this container (regulator, AU/UK, closed-deal, pairs, cascade
  fixtures, and the CUSTODES subjects inside their tarballs), 463
  hashes. A file whose hash is in the set is reported and **excluded
  from every sample**.

## What was looked at before this was written

Two files, while proving the script runs: one readable BIFF8 workbook
with a few hundred formulas and no findings, one with no formulas at
all. No other result has been seen.

## Engine and conditions, fixed

- Engine at commit `0131160` on `claude/pierce-phase-6-writing-mjkaj6`
  plus the sweep script `scripts/corpus_enron.py` (no engine change).
- Static audit only: `read_workbook` → `read_structure` → `audit`.
  No recalculation, no analytics beyond what `audit()` carries.
- One process per file, killed at 600 s; three workers on four CPUs.
- Resumable by file name; every file recorded once, success or failure.

## Measures, fixed now

1. **Readability.** Files opened and audited; files failed, by failure
   class (not a workbook the reader knows, timeout, worker died, any
   exception type by name). Reported as counts and shares of 20,872.
2. **Formula-bearing files.** Files with at least one formula. Bands,
   fixed: *thin* 1–99 formulas, *model* 100–1,499, *deep* 1,500 and
   above. The « deep » line is the earlier research note's own
   threshold for « project-finance shaped ».
3. **Findings.** Total, per rule, per tier, over formula-bearing files;
   findings per thousand formulas per band; files with more than 200
   findings listed as floods.
4. **Silence.** Share of formula-bearing files with zero findings, per
   band.
5. **Time.** Median and 95th-percentile seconds per file, per band;
   timeouts counted as failures in (1), not here.
6. **Contamination.** Count of held-hash matches; all excluded from (7).
7. **Usefulness sample.** Seed `20260902`. From findings on files in
   the *model* and *deep* bands, not held: 40 findings drawn across
   rules in proportion to each rule's share, with a floor of 3 per
   rule that has at least 3; plus 20 findings drawn from tier 1 only.
   Judged from harvested cell neighbourhoods under the A/B/C/D rubric
   of `findings-usefulness-audit.md` (A definitely useful, B probably,
   C false alarm, D duplicate of another finding). Reported: A+B
   share, C share with each C's named cause, D share with each D's
   named fold. Judging is by the engine's author, as in every prior
   round, and the neighbourhoods are kept so a second judge can
   re-score.
8. **Reader defects.** Every distinct exception type is a defect to
   name, with one example file each.

## Predictions, registered

1. Readability: between half and three quarters of the files open as
   BIFF8 workbooks. The rest are the non-workbook formats the README
   names.
2. Formula-bearing: fewer than half of the readable files carry any
   formula; the *deep* band is in the low hundreds.
3. Silence in the *thin* band above 70%; in the *deep* band below 30%.
4. Usefulness A+B on the sample: **between 60% and 80%**. Below the
   80.1% of the last unseen round, because this is a new dialect
   (corporate, energy trading, turn-of-the-century layouts) and every
   new corpus so far has shown at least one noise class the grammar
   did not know. If it comes in above 80% that is the better surprise
   and is reported as such; if below 60% the grammar has a gap this
   round must name.
5. At least one new noise class will account for a majority of the C
   verdicts, and it will be nameable as a general principle.
6. Floods (more than 200 findings on one file) will occur, on
   data-table sheets, and will be fold candidates rather than defects.

## What this round does not claim

No recall number: nothing is planted. No precision number beyond the
judged sample. No comparison to any published tool. No claim about
the product's behaviour on these files beyond the static audit.

---

# Results

*(appended after the sweep; nothing above this line changes)*
