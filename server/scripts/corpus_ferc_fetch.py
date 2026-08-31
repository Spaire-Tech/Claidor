"""Fetch the FERC formula-rate pair for D3 round 8, verified by bytes.

The container this runs in is ephemeral, so the corpus has to be
re-fetchable. Status codes are not the check: PJM answers HTTP 200 with
the identical PDF when a PDF's path is requested with an .xlsx
extension. Every file is accepted on its magic bytes and its sha256.

    uv run python scripts/corpus_ferc_fetch.py <destination-directory>
"""

import hashlib
import pathlib
import sys
import urllib.request

PJM = "https://www.pjm.com/-/media/DotCom/markets-ops/trans-service"

# name -> (url path, expected magic bytes, expected sha256)
CORPUS = {
    "rmu-2015-form1.pdf": (
        f"{PJM}/june-to-may/2016-2017/rmu/rmu-2015-ferc-form-1.pdf",
        b"%PDF",
        "b46018ef0d065cfe60f993165b744e16b71bd9247c1c42212aa776c03b54bd19",
    ),
    "rmu-2016-formula-rate.xlsx": (
        f"{PJM}/june-to-may/2016-2017/rmu/rmu-2016-formula-rate.xlsx",
        b"PK\x03\x04",
        "01be958d92ca9004266a3641560d9a878fd13c8879d800e56588a749d9f6f269",
    ),
    # The revision lineage (terms round 3): same filer, later cycles,
    # every path read off PJM's own formula-rates listing page.
    "cor-2016-form1.pdf": (
        # CY2016 Form 1 — complete: all seven pages the truth sample
        # cites carry footers. The document half of the revision pair.
        f"{PJM}/june-to-may/2017-2018/cor/city-of-rochelle-2016-ferc-filing.pdf",
        b"%PDF",
        "c4e67b3d76671671bb91be6e98243bb0c36f62336f0f1d0e6e60afc0cb944104",
    ),
    "cor-2017-form1.pdf": (
        # CY2017 Form 1 — 53 pages, partial (printed page 207 absent);
        # kept for the record, not this round's pair.
        f"{PJM}/2018/city-of-rochelle-2017-rmu-ferc-form-1-2017.pdf",
        b"%PDF",
        "7e03557f3d31aeb7f415916fd2c5dde3381a3b539643f9b6840b4e06033b94fd",
    ),
    "cor-2017-h25b.xlsx": (
        # The 2017 annual update — the model half of the revision pair;
        # same Appendix A geometry (F citation, C label, H typed value).
        f"{PJM}/june-to-may/2017-2018/cor/city-of-rochelle-2017-h-25b.xlsx",
        b"PK\x03\x04",
        "923e6f4db9128d8ff4464ccc085a0ef52a8a6aee1e0aee3670e7227198dce379",
    ),
    "cor-2020-h25b.xlsx": (
        # The 2020 annual update — a further model revision, kept for
        # later rounds.
        f"{PJM}/june-to-may/2020-2021/cor/cor-rmu-h-25b.xlsx",
        b"PK\x03\x04",
        "741e430bce0592bd2c3fba6417f5c1d9d60f418c92403e7915839f6043153fc5",
    ),
}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def main(destination: pathlib.Path) -> int:
    destination.mkdir(parents=True, exist_ok=True)
    failures = 0
    for name, (url, magic, digest) in CORPUS.items():
        payload = fetch(url)
        actual = hashlib.sha256(payload).hexdigest()
        problems = []
        if not payload.startswith(magic):
            problems.append(f"magic {payload[:4]!r} != {magic!r}")
        if actual != digest:
            problems.append(f"sha256 {actual[:12]} != {digest[:12]}")
        if problems:
            failures += 1
            print(f"REJECTED {name}: {'; '.join(problems)}")
            continue
        (destination / name).write_bytes(payload)
        print(f"ok       {name}  {len(payload)} bytes  {actual[:12]}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(pathlib.Path(sys.argv[1])))
