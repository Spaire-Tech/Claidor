"""The Scottish deal pairs: contract + close model, both halves free.

The founder's 26 August research (`corpus-sources.md`, addendum)
broke D3's missing direction open: ~30 NPD/hub deals publish the
signed project agreement *and* the financial close model, no NDA, on
the SFT contracts hub. This fetches the pairs the founder verified
end to end — Kelso (whose model carries the 73-row provenance tab),
Levenmouth, Oban & Campbeltown — landing models beside the six close
models `corpus_sft/` already holds (extending, never duplicating)
and agreements under `corpus_documents/sft/`. All git-ignored; the
corpus is re-fetchable and never committed.

The network, honestly: on 26 August the hub's subdomain served an
**expired certificate issued for the wrong host**, so origin fetches
fail TLS verification — which stays on. Each fetch therefore tries
origin first and falls back to the Internet Archive's snapshot of
the same URL, and says which one answered. A day when neither serves
is a day this prints failures, not a conclusion about the corpus.

    uv run python -m scripts.corpus_documents_sft
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SCRIPTS = Path(__file__).parent
MODELS = SCRIPTS / "corpus_sft"
AGREEMENTS = SCRIPTS / "corpus_documents" / "sft"

HUB = "https://contracts.scottishfuturestrust.org.uk"

#: The founder-verified deals. Slug is the hub's own tag.
DEALS = [
    ("kelso-high-school", "Kelso High School"),
    ("levenmouth-academy", "Levenmouth Academy"),
    ("oban-and-campbeltown-high-schools", "Oban and Campbeltown High Schools"),
]


def _get(url: str, timeout: int = 120) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; Pierce corpus)"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return bytes(response.read())


def _snapshot(url: str) -> str | None:
    """The Wayback Machine's closest capture of one URL, or None."""
    api = "http://archive.org/wayback/available?url=" + url.replace("https://", "")
    try:
        closest = json.loads(_get(api, timeout=60))["archived_snapshots"].get("closest")
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        return None
    if not closest or closest.get("status") != "200":
        return None
    return f"https://web.archive.org/web/{closest['timestamp']}id_/{url}"


def _complete(payload: bytes) -> bool:
    """A whole file, not a chopped stream.

    The archive has been seen cutting a download at exactly 1 MiB with
    no error raised — so completeness is checked from the bytes: a PDF
    carries %%EOF near its tail, a zip its central-directory record,
    a legacy .xls its OLE header (small enough that truncation shows
    elsewhere). Anything else passes; the caller's own sniffing rules.
    """
    if payload.startswith(b"%PDF"):
        return b"%%EOF" in payload[-2048:]
    if payload.startswith(b"PK"):
        return b"PK\x05\x06" in payload[-66000:]
    return True


def _fetch(url: str, label: str, attempts: int = 3) -> bytes | None:
    """Origin first, archive second, retried; says which answered."""
    try:
        payload = _get(url)
        if _complete(payload):
            print(f"  [origin]  {label}: {len(payload):,} bytes", file=sys.stderr)
            return payload
        print(f"  [origin]  {label}: truncated stream, refused", file=sys.stderr)
    except (urllib.error.URLError, OSError) as problem:
        print(f"  [origin]  {label}: {str(problem)[:80]}", file=sys.stderr)
    archived = _snapshot(url)
    if archived is None:
        print(f"  [archive] {label}: no snapshot", file=sys.stderr)
        return None
    for attempt in range(1, attempts + 1):
        try:
            payload = _get(archived)
        except (urllib.error.URLError, OSError) as problem:
            print(
                f"  [archive] {label} (try {attempt}): {str(problem)[:70]}",
                file=sys.stderr,
            )
            time.sleep(20 * attempt)
            continue
        if _complete(payload):
            print(f"  [archive] {label}: {len(payload):,} bytes", file=sys.stderr)
            return payload
        print(
            f"  [archive] {label} (try {attempt}): truncated at "
            f"{len(payload):,} bytes, refused",
            file=sys.stderr,
        )
        time.sleep(20 * attempt)
    return None


def _documents(page: bytes) -> list[tuple[str, int]]:
    """(title, document id) pairs from one tag page, in page order.

    Titles are the panel headings (« Kelso High School - Project
    Agreement »); each download link is bound to the nearest heading
    above it, which survives the archive's URL rewriting untouched.
    """
    html = page.decode("utf-8", errors="replace")
    titles = [
        (m.start(), m.group(1).strip())
        for m in re.finditer(
            r">([^<>]*(?:Financial Model|Project Agreement)[^<>]*)<", html
        )
    ]
    out: list[tuple[str, int]] = []
    for m in re.finditer(r"/document/(\d+)/download", html):
        above = [title for position, title in titles if position < m.start()]
        if not above:
            continue
        pair = (above[-1], int(m.group(1)))
        if pair not in out:
            out.append(pair)
    return out


def main() -> int:
    MODELS.mkdir(parents=True, exist_ok=True)
    AGREEMENTS.mkdir(parents=True, exist_ok=True)
    got = 0
    for slug, name in DEALS:
        print(f"\n{name}", file=sys.stderr)
        page = _fetch(f"{HUB}/tag/{slug}", "tag page")
        if page is None:
            continue
        for title, document in _documents(page):
            is_model = "financial model" in title.lower()
            is_agreement = "project agreement" in title.lower()
            if not (is_model or is_agreement):
                continue
            target = (
                MODELS / f"{slug}-model.bin"
                if is_model
                else AGREEMENTS / f"{slug}-agreement.pdf"
            )
            if is_model:
                # Extension decided by content below; skip on any match.
                existing = list(MODELS.glob(f"{slug}-model.*"))
                if existing:
                    print(f"  [have]    {title}", file=sys.stderr)
                    got += 1
                    continue
            elif target.exists():
                print(f"  [have]    {title}", file=sys.stderr)
                got += 1
                continue
            payload = _fetch(f"{HUB}/document/{document}/download", title)
            if payload is None:
                continue
            if is_model:
                if not payload.startswith(b"PK") and not payload.startswith(
                    b"\xd0\xcf\x11\xe0"
                ):
                    print(f"  [refuse]  {title}: not a workbook", file=sys.stderr)
                    continue
                suffix = ".xlsx" if payload.startswith(b"PK") else ".xls"
                target = MODELS / f"{slug}-model{suffix}"
            elif not payload.startswith(b"%PDF"):
                print(f"  [refuse]  {title}: not a PDF", file=sys.stderr)
                continue
            target.write_bytes(payload)
            got += 1
            print(f"  [saved]   {target.name}", file=sys.stderr)
    print(f"\n{got} documents present across {len(DEALS)} deals", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
