# The CUSTODES benchmark — archived copy

Saved 20 August 2026 from `http://castle.cse.ust.hk/custodes/` (the
research group's mirror; the primary host `sccpu2.cse.ust.hk` was
returning 503 and this data — the only cell-level ground truth of
its kind — was judged one budget decision from gone).

**What this is:** the evaluation dataset of *CUSTODES: Automatic
Spreadsheet Cell Clustering and Smell Detection Using Strong and
Weak Features* (Cheung, Chen, Liu, Xu — ICSE 2016). 70 spreadsheets
sampled from the EUSES corpus, with manually marked cell clusters
and smelly cells (1,974 labelled defect cells across 291 sheets) —
the de-facto shared benchmark of the field, used by ExceLint
(OOPSLA 2018), WARDER, and others.

| File | Contents | sha256 |
|---|---|---|
| `subjects.tar.gz` | the 70 subject workbooks (.xls), unmodified | `cde410d6fcdb112d7b71978cd40ad5aded723e6b8eb8c2902647d88cf5988a14` |
| `ground_truth.tar.gz` | the same workbooks with the authors' manual annotations (clusters as background colours, smelly cells as red-triangle comments) | `a5eaae92face0951a4f32f472fcf1a0c8043df6ad75321e2ac0481f56ee62644` |
| `data.tar.gz` | the full distribution (~11 MB « all data » package) | `0a8da61194987cb8966fffb74b101107f72b35a78fa186318330f6751f97407c` |
| `smell_detection_result/smell_detection_result.xls` | the authors' per-tool detection results | `4831d1cdf943cfcbc66b35bdb654a9f95c00f65e85a448b1278e23a9dd02b057` |

**Terms:** research data published openly by its authors for
benchmarking; cite the ICSE 2016 paper in anything that uses it.
Archived here for preservation and internal benchmarking only —
not redistributed as a product.

**Note for use:** files are `.xls` (legacy binary) — convert through
LibreOffice headless before running the xlsx engine on them.
