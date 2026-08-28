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
