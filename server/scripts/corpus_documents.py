"""The Chain's document corpus: real PDFs that quote numbers at people.

`scripts/document_corpus.py` fetches ordinary Office files to teach the
metadata checker what silence sounds like. This fetches something
different: **PDF documents of the kind a deal actually cites** —
determinations, impact assessments, accounts, business plans — because
the Chain's first promise (D1) is measured over documents, and a promise
about « every number with a page and a box » means nothing until it has
met real layouts: tables, footnotes, columns, the odd scanned annex.

gov.uk again, for the same reason as its sibling: the search API gives
pages, the content API gives attachment URLs, and the library is
enormous, real, and legally clean (Crown copyright / OGL).

    uv run python -m scripts.corpus_documents             # fetch (default 20)
    uv run python -m scripts.corpus_documents --count 40  # more

Files land in `scripts/corpus_documents/pdfs/`, inside the directory
`.gitignore` already excludes: public documents, but megabytes of
binary, and a re-fetchable corpus does not belong in a repository.

**The sample is not stable** — gov.uk publishes and withdraws
constantly, so a run next month returns an overlapping but different
set. Every measurement over this corpus prints its own file count for
exactly that reason.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent / "corpus_documents" / "pdfs"

#: Bigger than this is a photo album or a bound volume, not a document
#: the extractor should be measured on first.
MAX_BYTES = 25 * 1024 * 1024

#: Searches chosen for documents that *quote figures* — the habit D1 is
#: measured against — rather than for any subject in particular.
QUERIES = [
    "price control determination",
    "impact assessment",
    "annual report and accounts",
    "business plan",
    "cost benefit analysis",
    "funding settlement",
    "financial model handbook",
    "tariff determination",
]


def _get(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; Pierce corpus)"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return bytes(response.read())


def _pages() -> list[str]:
    """Every gov.uk page the searches turn up, without repeats."""
    found: list[str] = []
    seen: set[str] = set()
    for query in QUERIES:
        url = (
            "https://www.gov.uk/api/search.json?count=20&fields=link&q="
            + urllib.parse.quote(query)
        )
        try:
            results = json.loads(_get(url))["results"]
        except (urllib.error.URLError, OSError, ValueError, KeyError) as problem:
            print(f"[fail] search {query!r}: {str(problem)[:70]}", file=sys.stderr)
            continue
        for one in results:
            link = one.get("link") or ""
            if link.startswith("/") and link not in seen:
                seen.add(link)
                found.append(link)
    return found


def _attachments(link: str) -> list[str]:
    """The PDFs hanging off one page, via the content API."""
    try:
        page = json.loads(_get(f"https://www.gov.uk/api/content{link}"))
    except (urllib.error.URLError, OSError, ValueError) as problem:
        print(f"[fail] {link}: {str(problem)[:70]}", file=sys.stderr)
        return []
    urls: list[str] = []
    for attachment in page.get("details", {}).get("attachments") or []:
        url = attachment.get("url") or ""
        if url.lower().endswith(".pdf"):
            urls.append(url)
    return urls


def main() -> int:
    limit = 20
    if "--count" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--count") + 1])

    HERE.mkdir(parents=True, exist_ok=True)
    pages = _pages()
    print(f"{len(pages)} pages", file=sys.stderr)

    got = 0
    for link in pages:
        for url in _attachments(link):
            if got >= limit:
                print(f"\n{got} files in {HERE}", file=sys.stderr)
                return 0
            name = urllib.parse.unquote(url.rsplit("/", 1)[-1])[:120]
            target = HERE / name
            if target.exists():
                got += 1
                continue
            try:
                payload = _get(url)
            except (urllib.error.URLError, OSError) as problem:
                print(f"[fail] {name}: {str(problem)[:70]}", file=sys.stderr)
                continue
            if len(payload) > MAX_BYTES:
                print(f"[skip] {name}: {len(payload)} bytes", file=sys.stderr)
                continue
            target.write_bytes(payload)
            got += 1
            print(f"[{got}] {name}", file=sys.stderr)

    print(f"\n{got} files in {HERE}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
