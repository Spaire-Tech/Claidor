"""Fetch the Scottish Futures Trust closed-deal financial models.

The population proof's corpus (`docs/pierce/population-proof.md`):
real UK public-infrastructure models agreed at financial close and
published two years after project completion — hospitals, colleges,
schools. Never committed; rebuilt with this script.

The route, and why it is this one. The portal itself
(`contracts.scottishfuturestrust.org.uk`) serves an expired TLS
certificate issued for the wrong host, so no honest client can fetch
from it — recorded in `corpus-sources.md`. The files themselves sit
in a public S3 bucket with a valid certificate, under a stable
convention: `{Project Words}+Financial+Model.{ext}` at the bucket
root. Discovered by probing a file we already held, then swept
across the portal's alphabetical index.

Format note, honestly: the portal publishes `.xlsm`, `.xlsb` and
`.xls`. Our reader is openpyxl-based and reads the XML formats only,
so `.xlsb` (binary) and `.xls` (OLE2) are fetched and kept but are
**format-blocked** until plan step A6 lands. This script fetches all
three and labels which is which; it never pretends a blocked file is
a subject.

Usage:
    uv run python -m scripts.corpus_sft_models
"""

import sys
import urllib.request
from pathlib import Path

BUCKET = "https://scottisfuturestrust.s3.eu-west-2.amazonaws.com"
HERE = Path(__file__).parent / "corpus_sft"

#: local stem -> the bucket key's project words and extension.
MODELS: dict[str, tuple[str, str]] = {
    "baldragon": ("Baldragon Academy", "xlsm"),
    "glasgow_college": ("City of Glasgow College", "xlsm"),
    "forfar": ("Forfar Community Campus", "xlsm"),
    "inverurie_foresterhill": ("Inverurie and Foresterhill Health Centres", "xlsm"),
    "kelso": ("Kelso High School", "xlsm"),
    "levenmouth": ("Levenmouth Academy", "xlsm"),
    "newbattle": ("Newbattle Centre", "xlsm"),
    "oban_campbeltown": ("Oban and Campbeltown High Schools", "xlsm"),
    #: format-blocked until A6 — fetched so the gap stays visible.
    "barrhead": ("Barrhead High School", "xlsb"),
    "largs": ("Largs Academy", "xlsb"),
    "inverclyde": ("Inverclyde Care Home", "xls"),
}

#: Projects on the portal's index whose model is not published (the
#: agreement publishes at financial close, the model two years after
#: completion). Swept and absent on 27 August 2026 — kept so a later
#: sweep can tell « not yet published » from « we never looked ».
ABSENT = (
    "Aberdeen Health Village",
    "Aberdeen Western Peripheral Route",
    "Alford Academy",
    "Ayr Academy",
    "Blairdardie and Carntyne Primaries",
    "Cumbernauld Academy and Art Theatre",
    "East Lothian Community Hospital",
    "Forres Woodside and Tain Health Centres",
    "Gorbals and Woodside Health Centres",
    "Greenfaulds High School",
    "James Gillespie's High School",
    "Ladyloan and Muirfield",
    "M8 M73 M74 Motorway Improvements",
    "Maryhill and Eastwood Health Centres",
    "NHS Lanarkshire Bundle",
    "NHS Lothian Bundle",
    "NHS Orkney New Hospital",
    "North Ayrshire Community Hospital",
)

BLOCKED = {"xlsb", "xls"}


def _url(project: str, extension: str) -> str:
    return f"{BUCKET}/{project.replace(' ', '+')}+Financial+Model.{extension}"


def main() -> int:
    HERE.mkdir(parents=True, exist_ok=True)
    readable = blocked = 0
    for stem, (project, extension) in MODELS.items():
        target = HERE / f"{stem}_model.{extension}"
        note = " [format-blocked until A6]" if extension in BLOCKED else ""
        if target.exists():
            print(f"[ ok ] {target.name}: already fetched{note}", file=sys.stderr)
        else:
            request = urllib.request.Request(
                _url(project, extension),
                headers={"User-Agent": "Mozilla/5.0 (compatible; Pierce corpus)"},
            )
            with urllib.request.urlopen(request, timeout=300) as response:
                payload = bytes(response.read())
            target.write_bytes(payload)
            print(
                f"[ ok ] {target.name}: {len(payload):,} bytes{note}", file=sys.stderr
            )
        if extension in BLOCKED:
            blocked += 1
        else:
            readable += 1

    print(
        f"\n{readable} readable models, {blocked} format-blocked, "
        f"{len(ABSENT)} indexed projects with no model published",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
