"""Fetch the answer key's source document, verified by bytes.

The document half of the D3 answer key: the executed £3,226,960,000 credit
facility agreement between HM Treasury and Ireland (December 2010), drafted
by Allen & Overy and published by HM Treasury. Chosen by the frozen
selection rule in docs/pierce/scribe-answer-key-protocol.md.

Status is not the check -- other hosts in this lane's history answer 200
with the wrong file. The magic bytes and the sha256 are.

    uv run python scripts/corpus_answer_key_fetch.py <destination-directory>
"""

import hashlib
import pathlib
import sys
import urllib.request

URL = (
    "https://assets.publishing.service.gov.uk/media/"
    "5a7c9a82e5274a0bb7cb8284/int_ireland_loan_agreement.pdf"
)
NAME = "ireland-loan-agreement.pdf"
SHA256 = "b70636bae70c17cf"  # first 16 hex characters, as recorded at selection


def main(destination: pathlib.Path) -> int:
    request = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = response.read()

    digest = hashlib.sha256(payload).hexdigest()
    problems = []
    if not payload.startswith(b"%PDF"):
        problems.append(f"magic {payload[:4]!r} is not %PDF")
    if not digest.startswith(SHA256):
        problems.append(f"sha256 {digest[:16]} != {SHA256}")
    if problems:
        print(f"REJECTED {NAME}: {'; '.join(problems)}")
        return 1

    destination.mkdir(parents=True, exist_ok=True)
    (destination / NAME).write_bytes(payload)
    print(f"ok  {NAME}  {len(payload)} bytes  {digest[:16]}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(pathlib.Path(sys.argv[1])))
