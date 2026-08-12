"""Real financial models, from people who are not us.

**Rule 7 in `docs/pierce/roadmap.md`, made operational.** Every number this
product has ever reported about itself was measured against fixtures it
generated, which is why it turned « think 60–70 minutes » into a financial
figure of $70m the first time somebody uploaded a document from outside.
A workbook you wrote cannot tell you your reader is wrong.

Genuine investment-banking deal models are not public and never will be —
that gap closes only with a paid pilot. What *is* public is the next best
thing: the models economic regulators publish and require companies to
fill in and submit. They are large, they are built by working analysts,
and they carry every habit a real model has — a master switch routed
through a defined name, whole-column `AVERAGEIFS`, sheet-scoped names that
mean different cells on different tabs, and defined names left pointing at
`#REF!`.

    uv run python -m scripts.model_corpus          # fetch what is reachable
    uv run python -m scripts.model_corpus --list   # just print the sources

Files land in `scripts/corpus_models/`, which is git-ignored. They are
public documents but they are megabytes of binary, and a corpus that is
re-fetchable from a URL does not belong in a repository.

**Some of these are not reachable from every network.** The AER's PTRM
would be the single most valuable file here — it ships with a documented
circular reference requiring Excel's iterative calculation, which is the
one hard case nothing else exercises — and it does not resolve from this
container at all. Ofwat returns 403 to a plain client. Both are left in
the list rather than deleted, because « we could not fetch it here » and
« it does not exist » are different sentences and the next machine may
have better luck.
"""

import sys
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).parent / "corpus_models"

#: What to fetch, and why each one earns its place.
SOURCES: list[tuple[str, str, str]] = [
    (
        "ofgem_riio_et1_pcfm_2015.xlsm",
        "https://www.ofgem.gov.uk/sites/default/files/docs/"
        "riio_et1_price_control_financial_model_following_the_annual_iteration_process_2015.xlsm",
        "Electricity transmission price control. Routes the whole model "
        "through one defined name used 3,542 times — the master switch "
        "case, and the reason a dropped precedent is not a shorter chain.",
    ),
    (
        "ofgem_ed2_pcfm_v5.xlsx",
        "https://www.ofgem.gov.uk/sites/default/files/2026-06/ED2-PCFM-V5.xlsx",
        "Electricity distribution, 2026. 791 workbook-scoped names and 594 "
        "sheet-scoped ones — the case where resolving a name without its "
        "scope produces a confidently wrong precedent.",
    ),
    (
        "ofgem_ed2_pcfm_v3_2023.xlsx",
        "https://www.ofgem.gov.uk/sites/default/files/2023-10/"
        "ED2%20PCFM%20V3%20%28published%2016%20October%202023%291697123823926.xlsx",
        "An earlier version of the same model. Two versions of one workbook "
        "is the shape the staleness work needs.",
    ),
    (
        "aer_ptrm_distribution.xlsx",
        "https://www.aer.gov.au/system/files/"
        "AER%20-%20Distribution%20PTRM%20-%20version%205%20-%20April%202021.xlsx",
        "UNREACHABLE FROM THIS CONTAINER. The post-tax revenue model, which "
        "carries a documented circular reference needing iterative "
        "calculation — the hard case nothing else here exercises.",
    ),
    (
        "ofwat_pr24_model.xlsx",
        "https://www.ofwat.gov.uk/wp-content/uploads/2024/12/"
        "PR24-final-determinations-Financial-model.xlsx",
        "403 TO A PLAIN CLIENT. Water price review. Left listed so the next "
        "machine can try.",
    ),
]


def fetch(name: str, url: str) -> tuple[bool, str]:
    import urllib.error
    import urllib.request

    target = HERE / name
    if target.exists():
        return True, f"already here, {target.stat().st_size:,} bytes"

    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; Pierce corpus)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = response.read()
    except (urllib.error.URLError, OSError, TimeoutError) as problem:
        return False, str(problem)[:90]

    # A login page or an error page is HTML, and an HTML file with an
    # `.xlsx` name is the kind of thing that fails four steps later with a
    # confusing message. Refuse it here instead.
    if not payload.startswith(b"PK"):
        return False, f"not a zip — got {payload[:40]!r}"

    target.write_bytes(payload)
    return True, f"{len(payload):,} bytes"


def main() -> int:
    if "--list" in sys.argv:
        for name, url, why in SOURCES:
            print(f"\n{name}\n  {unquote(url)}\n  {why}")
        return 0

    HERE.mkdir(parents=True, exist_ok=True)
    got = 0
    for name, url, _ in SOURCES:
        ok, detail = fetch(name, url)
        print(f"[{' ok ' if ok else 'fail'}] {name}\n        {detail}")
        got += ok

    print(f"\n{got} of {len(SOURCES)} in {HERE}")
    if got:
        print("Measure them:  uv run python -m scripts.formula_coverage")
    return 0 if got else 1


if __name__ == "__main__":
    raise SystemExit(main())
