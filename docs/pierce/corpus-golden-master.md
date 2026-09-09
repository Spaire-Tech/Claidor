# The golden-master corpus gate

After the flood collapses landed, every corpus file the change was not
aimed at reported byte-identically. The mentor's direction: promote
that from an observation to a permanent gate.

**The rule: any engine change runs the corpus, and the diff must be
empty except where intended.**

## The pieces

- `docs/pierce/corpus-au-uk-manifest.md` — re-fetchable URLs for every
  file (the files are public, together >150MB, and not committed).
- `server/scripts/corpus_gate.py` — the sweep and the comparison.
- `docs/pierce/corpus-golden-master.json` — the committed baseline:
  every finding of every file, `(rule, severity, ref, figure, detail)`
  in report order. Not counts — counts can match while reports drift.

## The protocol

```bash
# from server/, with the corpus fetched per the manifest
uv run python scripts/corpus_gate.py sweep  CORPUS_DIR  /tmp/current.json
uv run python scripts/corpus_gate.py diff   ../docs/pierce/corpus-golden-master.json  /tmp/current.json
```

Exit 0 means every file reports identically, finding for finding. A
non-zero exit prints each changed file with `-` and `+` lines.

An engine change that *means* to change reports regenerates the
baseline and commits it in the same change — the baseline's own git
diff is then the review artifact, file by file, finding by finding,
and the reviewer reads exactly what the change did to real models and
nothing else.

## Regenerations

Each regeneration is committed with the change that meant it; the
baseline's git diff is the review artifact. Where a regeneration
carries more than one change, the accounting lives with the round:

- **2 September 2026** — cut after the consequence round (house-style
  sentences, the one-line long-formula fold, the skipped-cell fold
  keyed on the missed rows) and the regularity check. Every line
  traced by rule in `regularity-check.md`, « Measure 1 »; one
  regression (the cross-sheet error fold split by the sheet's name in
  the sentence) was found by this diff and fixed before the cut.
- **3 September 2026** — cut after the label-column round
  (`reader-label-formulas.md`). Two files change, both CAA H7
  price-control models, each losing one `hardcode-in-formula` at
  `I_Series!H352`: the cell is typed text that begins with `=`, not
  a formula, and the reader no longer takes such text for
  arithmetic. Nothing else moves across the 27 files.
- **3 September 2026, later** — cut after the wrong-switch round
  (`wrong-switch.md`). One file changes: Ofgem's final GD3 BPFM gains
  one `anchored-elsewhere` error at `MainInputs!AU472` (five cells),
  the row that reads its sibling's phasing switch — the registered
  case, found by hand in the truth-set round. The other 26 files
  report identically.
- **3 September 2026, later still** — cut after the previous-version
  round (`overwritten-since.md`), whose rule abstains on every
  single-file sweep and changes no finding. The one line that moves
  is the wording of the GD3 `anchored-elsewhere` detail, rewritten
  under the sentence gate (headline and detail as two sentences, no
  « sibling »); the finding, its cells and its grade are unchanged.
  The other 26 files report identically.

## Honest bounds

- The gate covers what the corpus covers. AER models are still absent
  (aer.gov.au blocks non-browser fetches — see the manifest); files
  the founder feeds through Check a model are not in it.
- `detail` sentences are part of the fingerprint on purpose: a wording
  change is a report change and must be intended too.
- The baseline was first cut on 2026-08-17, after the mentor round
  (reference-semantics policy table, cross-column gap agreement,
  sibling-aggregate exemption). History before that lives in
  `corpus-au-uk-sweep.json` / `corpus-au-uk-sweep-after-collapses.json`
  as counts.
