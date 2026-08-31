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

Format note, honestly, and **corrected on 28 August**: the portal
publishes `.xlsm`, `.xlsb` and `.xls`. All three are now readable.
`.xls` always was — `polar.tieout.legacy` decompiles BIFF8 formulas
directly — and this file was wrong to call it blocked. `.xlsb` became
readable when `polar.tieout.binary` landed, by converting through
LibreOffice.

What the fetch found once they could be opened, and it is worth
stating because it closes a question: **they are value-only too**, the
same as the `.xlsm` models. The formula counts LibreOffice reports on
them are its own — it writes every boolean cell out as `=TRUE()` or
`=FALSE()`, which is 10,417 of the 10,417 « formulas » in one of
these models. So the population proof's finding stands, and now
stands on every file rather than on the readable subset.

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
    #: Binary and OLE2 formats — readable since 28 Aug (binary.py, legacy.py).
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

#: Nothing is format-blocked any more; kept as a name so the counting
#: below still distinguishes the formats that need a converter.
CONVERTED = {"xlsb"}


def _url(project: str, extension: str) -> str:
    return f"{BUCKET}/{project.replace(' ', '+')}+Financial+Model.{extension}"


def main() -> int:
    HERE.mkdir(parents=True, exist_ok=True)
    direct = converted = 0
    for stem, (project, extension) in MODELS.items():
        target = HERE / f"{stem}_model.{extension}"
        note = " [read via LibreOffice conversion]" if extension in CONVERTED else ""
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
        if extension in CONVERTED:
            converted += 1
        else:
            direct += 1

    print(
        f"\n{direct} models read directly, {converted} through conversion, "
        f"{len(ABSENT)} indexed projects with no model published",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
