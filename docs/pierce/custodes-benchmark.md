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
