# The CUSTODES benchmark — registration, before any score is computed

23 August 2026. The engine meets the field's only cell-level ground
truth. This section is written and committed **before** the score is
computed; results are appended below it afterwards, and any
amendment is logged, never rewritten.

## What is frozen

- **Engine output:** `custodes/sweep-cold-run.json` — the cold sweep
  of the 70 converted subjects (1,187 findings), produced and
  reported *before* the ground-truth annotations were opened. The
  engine is not modified between that sweep and the scoring.
- **Ground truth:** the comment-bearing cells of the authors' 291
  annotated sheet files (their site's legend: clusters as background
  colours, « smelly cells marked with a red triangle » — i.e. cell
  comments; every sampled comment reads « True smell »). Extracted
  from the LibreOffice-converted copies: **1,973 cells** against the
  paper's 1,974 — one cell lost somewhere in conversion or
  distribution; accepted and noted, not hunted.

## Mapping rules (fixed now)

1. A ground-truth file is named `<workbook>_<sheet>`; workbook names
   themselves contain underscores, so the mapping is by **longest
   prefix match** against the 70 known subject basenames; the
   remainder after the joining underscore is the sheet name.
2. A truth cell is keyed `(workbook, sheet, cell)`.
3. A finding's **cell set** is: its anchor `ref`, plus every cell in
   its `cells` roster, plus — when its detail says « one formula
   filled across N cells (A to B) » — the full rectangle A:B. All on
   the finding's sheet unless a roster entry names another.

## Metrics (fixed now)

- **Coverage:** the share of the 1,973 truth cells that fall inside
  any finding's cell set — overall, and broken down by which of our
  rules covers them. This is the recall-flavoured number.
- **Agreement:** the share of our findings whose cell set touches at
  least one truth cell — overall and per rule. **This is not
  precision**: the authors call their annotations « an approximation
  of ground truth » for *their* smell classes, and a finding outside
  them is not thereby false. It is reported as agreement and nothing
  stronger.
- **Out of scope, reported separately and excluded from agreement:**
  `hidden-sheet`, `broken-name`, `external-link` — file-level
  findings their cell-level truth cannot encode.

## What is deliberately not claimed

No precision claim. No side-by-side with CUSTODES's or ExceLint's
published figures — their scoring conventions differ (ExceLint
scores region decisions, not cells); a true head-to-head requires
running their tools on these same files, which is future work this
registration enables. The engine was tuned on financial models; this
corpus is a different dialect, and the number will be read with that
in mind either way.

---

## Results (computed after the registration above; scorer implements
## it as written, no amendments)

**Truth mapping:** all 1,973 cells mapped to (workbook, sheet, cell);
no ground-truth file failed the prefix mapping.

**Coverage: 283 / 1,973 = 14.3%** of their smelly cells fall inside
one of our findings' cell sets. By covering rule: typed-over-formula
202, skipped-cell 45, hardcode-in-formula 29, inconsistent-row 9,
error-value 2.

**Agreement: 239 / 1,166 = 20.5%** of our in-scope findings touch at
least one truth cell. Per rule: typed-over-formula **202/295 =
68.5%**, skipped-cell 9/20 = 45.0%, inconsistent-row 8/17 = 47.1%,
error-value 2/25 = 8.0%, hardcode-in-formula 18/805 = 2.2%,
long-formula 0/4. Out of scope, reported unscored: broken-name 7,
hidden-sheet 8, external-link 6.

**What the truth contains** (descriptive, computed after scoring):
1,687 of 1,973 cells (85.5%) are **value cells** — the « missing
formula » smell, a constant where their clustering says a formula
belongs; we cover 212 of them (12.6%). 264 (13.4%) are formula
cells — their dissimilar-formula/reference classes; we cover 70
(26.5%). 22 are empty or unresolvable in the converted subjects.

## Reading, honestly

1. **The shared class behaves as hoped.** Where their taxonomy and
   ours genuinely overlap — a value typed over a computing block —
   our findings agree with their labels 68.5% of the time, and that
   rule alone accounts for 71% of everything we cover.
2. **The hardcode number is a taxonomy mismatch, not a verdict.**
   805 of our findings flag literals *inside* formulas; their truth
   marks whole cells. 2.2% agreement was predictable from the class
   definitions, and the registration's refusal to call agreement
   « precision » exists for exactly this line.
3. **The real information is the coverage gap, and it has a name.**
   Their dominant smell is missing-formula detected by loose
   cluster witnesses (layout, labels, formats). Our engine demands
   strong witnesses — a row family, a fill pattern — because on
   financial models that discipline is what bought 2.9% false
   positives. This corpus prices the other side of that trade: on a
   dialect of small, irregular sheets, quiet-by-design costs
   roughly 85% of their labelled recall. Whether that price is
   right for Ambre depends on the population Ambre points at — but
   now it is a measured price, not a guess.

## What this enables next (named, not yet done)

- **The cheap head-to-head:** the archive includes the authors' own
  per-tool detection results (`smell_detection_result.xls`). Scoring
  *their* detections with *this same scorer* on *this same truth*
  gives the first same-convention comparison — no reimplementation
  needed. ExceLint's runnable core comes after.
- **A witness-widening round**, dialect-gated: their truth as the
  training signal for looser missing-formula witnesses that only
  arm on this kind of sheet, measured here for recall and on our
  own corpora for the false-positive price before anything ships.
