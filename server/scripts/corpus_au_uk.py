"""Rebuild the golden-master corpus — the manifest, made executable.

The golden-master gate's protocol says « rebuild the corpus from
docs/pierce/corpus-au-uk-manifest.md »; this script is that sentence
as code, so the rebuild is one command instead of an afternoon of
hand-downloading. Twenty-seven files into `scripts/corpus_au_uk/`
(git-ignored), named exactly as `corpus-golden-master.json` expects:
the eleven Ofgem ED2 versions, the RIIO-3 draft set (extracted from
Ofgem's own zip under the zip's internal names) and the four finals,
and the CAA H7 pair with its debt-indexation models. AER stays out,
as the manifest records: their host needs a human browser.

    uv run python -m scripts.corpus_au_uk          # fetch what is missing
    uv run python -m scripts.corpus_gate sweep scripts/corpus_au_uk OUT.json
    uv run python -m scripts.corpus_gate diff docs/pierce/corpus-golden-master.json OUT.json
"""

import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).parent / "corpus_au_uk"

OFGEM = "https://www.ofgem.gov.uk/sites/default/files/"
CAA = "https://www.caa.co.uk/media/"

#: golden-master path → direct URL.
FILES: dict[str, str] = {
    "ofgem_ed2/v5_2026-06.xlsx": OFGEM + "2026-06/ED2-PCFM-V5.xlsx",
    "ofgem_ed2/v4_2026-01.xlsx": OFGEM
    + "2026-01/ED2%20PCFM%20V4%20%28published%2028%20January%202026%29.xlsx",
    "ofgem_ed2/v4_2025-07.xlsx": OFGEM
    + "2025-07/ED2-PCFM-V4-published-25-July-2025.xlsx",
    "ofgem_ed2/v4_2025-01.xlsx": OFGEM + "2025-01/ED2_PCFM_V4_30_January_2025.xlsx",
    "ofgem_ed2/v4_2024-07.xlsx": OFGEM
    + "2024-07/ED2_PCFM_V4_updated_26_July_2024.xlsx",
    "ofgem_ed2/v3_2024-01.xlsm": OFGEM
    + "2024-01/ED2%20PCFM%20V3%20%28published%2026%20January%202024%29.xlsm",
    "ofgem_ed2/v3_2023-11.xlsx": OFGEM
    + "2024-01/ED2%20PCFM%20V3%20%28updated%2030%20November%202023%29.xlsx",
    "ofgem_ed2/v3_2023-10.xlsx": OFGEM
    + "2023-10/ED2%20PCFM%20V3%20%28published%2016%20October%202023%291697123823926.xlsx",
    "ofgem_ed2/v2_2023-07-31.xlsx": OFGEM
    + "2023-07/ED2%20Price%20Control%20Financial%20Model%20V2%2020230731%20for%20use%20in%20AIP.xlsx",
    "ofgem_ed2/v2_2023-07-14.xlsx": OFGEM
    + "2023-07/ED2%20Price%20Control%20Financial%20Model%20V2%2020230714.xlsx",
    "ofgem_ed2/v1_2023-02.xlsx": OFGEM + "2023-07/ED2%20PCFM%20V1%2020230203.xlsx",
    "ofgem_riio3/final_et3_bpfm.xlsm": OFGEM
    + "2026-02/RIIO-3%20Final%20Determinations%20Electricity%20Transmission%20Business%20Plan%20Financial%20Model.xlsm",
    "ofgem_riio3/final_gd3_bpfm.xlsm": OFGEM
    + "2026-02/RIIO-3%20Final%20Determinations%20Gas%20Distribution%20Business%20Plan%20Financial%20Model.xlsm",
    "ofgem_riio3/final_gt3_bpfm.xlsm": OFGEM
    + "2026-02/RIIO-3%20Final%20Determinations%20Gas%20Transmission%20Business%20Plan%20Financial%20Model.xlsm",
    "ofgem_riio3/final_wacc.xlsx": OFGEM
    + "2026-02/RIIO-3%20Final%20Determinations%20WACC%20rates%20model.xlsx",
    "caa_h7/h7_pcm_v2-11_final_determination.xlsm": CAA
    + "c2vfdpat/caa-h7-pcm-v2-11-7mar-fds.xlsm",
    "caa_h7/h7_pcm_v2-10_final_proposals.xlsm": CAA
    + "ao2j3hsh/caa-h7-pcm-v2-10-mid-pax-profiled-fp-external2.xlsm",
    "caa_h7/h7_new_debt_indexation_fds.xlsx": CAA
    + "5yzcbsge/cost-of-new-debt-indexation-model_fds-apr-23.xlsx",
    "caa_h7/h7_new_debt_indexation_fp.xlsx": CAA
    + "erydwwue/cost-of-new-debt-indexation-model_for-publication.xlsx",
}

#: The drafts arrive as one zip; members land under their own names.
DRAFT_ZIP = (
    OFGEM
    + "2025-06/RIIO-3%20Draft%20Determinations%20Business%20Plan%20Financial%20Models.zip"
)
DRAFT_DIR = "ofgem_riio3/draft"


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def main() -> int:
    HERE.mkdir(parents=True, exist_ok=True)
    got = 0
    for name, url in sorted(FILES.items()):
        target = HERE / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            print(f"[ ok ] {name}  already here, {target.stat().st_size:,} bytes")
            got += 1
            continue
        try:
            data = _get(url)
        except Exception as problem:
            print(f"[FAIL] {name}: {problem}")
            continue
        target.write_bytes(data)
        print(f"[ ok ] {name}  {len(data):,} bytes")
        got += 1

    draft_home = HERE / DRAFT_DIR
    draft_home.mkdir(parents=True, exist_ok=True)
    have = {p.name for p in draft_home.iterdir()}
    if not any(name.endswith((".xlsx", ".xlsm")) for name in have):
        try:
            payload = _get(DRAFT_ZIP)
            with zipfile.ZipFile(__import__("io").BytesIO(payload)) as archive:
                for member in archive.infolist():
                    leaf = Path(member.filename).name
                    if not leaf or not leaf.lower().endswith((".xlsx", ".xlsm")):
                        continue
                    (draft_home / leaf).write_bytes(archive.read(member))
                    print(f"[ ok ] {DRAFT_DIR}/{leaf}")
        except Exception as problem:
            print(f"[FAIL] draft zip: {problem}")
    else:
        print(f"[ ok ] {DRAFT_DIR}: already extracted ({len(have)} members)")

    total = len(list(HERE.rglob("*.xls[xm]")))
    print(f"\n{total} corpus files in {HERE} (golden master expects 27)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
