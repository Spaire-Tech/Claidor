# WARDER's three validity filters, read against our grammar

2 September 2026. The founder's research agent pointed at WARDER
(Cheung et al., QRS 2019 and JSS 2020): three validity filters that
reject a cluster before it accuses anyone, which the paper credits
with cutting CUSTODES's false positives from 1,705 to 728 while
keeping 81% of its true hits. The founder asked for them folded into
Purify. This is the reading, filter by filter, against what the
engine already does, with any gap named. Read from the published
abstracts and the QRS paper; the numbers are the authors' own, not
reproduced here.

| WARDER filter | What it says | What we do today | Gap |
| --- | --- | --- | --- |
| **Single-cell validity** — do not add a data cell to a cluster if casting it to the cluster's formula would make its references overlap the cluster's own references | A typed value may only be accused of « typed over a formula » if the formula the row would put there reads cells outside the family itself | `_typed_islands` derives the expected formula from the row's shape and refuses when the derived formula would read the island's own row (the « cumulative seed » and « first cell reads an anchor » exemptions). **Same principle, already named.** | None |
| **Multi-cell validity** — do not merge data cells with formula cells when replacing the data by any of those formulas would overlap references | A block of typed values beside a block of formulas is data, not a broken fill, when no formula from the block fits it | Parameter columns and typed history are data (`typed history is data`, `parameter columns are data`, Round 2). The check is by *label and position*, not by reference overlap. | **Small gap, named:** we do not test reference overlap directly. A typed block whose would-be formula would read itself is today exempted only if its label or position says so. Candidate principle: « a typed run is not a broken fill when the family's formula, placed there, would read the run itself. » Registered for the next Purify round; not wired here. |
| **Whole-cluster validity** — cancel a cluster if no formula in it unifies most of its members | A family may only accuse a member when one shape covers most of the family | The mutation detector requires the family to agree token-for-token but for one position (`family-agreement` exemption); the fill fold keys on one shape per family; `TOTAL_CONSENSUS = 3` requires three agreeing siblings before a total is accused. **Same principle, stricter.** | None |

## What was folded in

Nothing changed in code from this reading: two of the three filters
are already principles in the grammar under other names, and the
third is one candidate principle, registered above with its refusal
case, for the next Purify round through the normal loop (plant,
measure, gate).

## Sources

- WARDER: Refining Cell Clustering for Effective Spreadsheet Defect
  Detection via Validity Properties — QRS 2019.
- WARDER: Towards effective spreadsheet defect detection by
  validity-based cell cluster refinements — Journal of Systems and
  Software, 2020.
