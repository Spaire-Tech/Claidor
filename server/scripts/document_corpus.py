"""Real Office files from people who have never heard of us.

`scripts/model_corpus.py` fetches a handful of named financial models,
chosen one at a time for a property each one has. This fetches the
opposite: a *broad* sample of ordinary Office documents, chosen for
nothing at all.

That is the right corpus for the metadata checker, and the reason is the
question it has to answer. « Does this rule fire when the thing is
present » is answered by one file that has it. « Does this rule stay
silent on a file that is simply ordinary » is only answered by a lot of
files nobody selected — and the second question is the one that decides
whether a report gets read twice.

**gov.uk, because its search API gives attachment URLs and its library is
enormous and unfiltered.** Departments publish decks built in PowerPoint
and Google Slides, spreadsheets built by analysts and by consultants,
letters with track changes left on. It is not investment banking. It is
real work by people under deadline, saved and sent, which is the property
that matters here — and every leak found in it is a leak somebody actually
shipped.

    uv run python -m scripts.document_corpus            # fetch
    uv run python -m scripts.document_corpus --count 40 # fewer

Files land in `scripts/corpus_documents/`, which is git-ignored: they are
public documents but they are megabytes of binary, and a corpus that is
re-fetchable does not belong in a repository.

**The sample is not stable.** gov.uk publishes and withdraws constantly,
so a run next month returns an overlapping but different set. That is a
real limitation of every number measured against it, and the measurement
prints its own file count for exactly that reason.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent / "corpus_documents"

WANTED = (".docx", ".xlsx", ".pptx", ".xlsm", ".docm", ".pptm", ".xltx", ".potx")

#: Searches chosen to spread across the kinds of work that produce the
#: leaks — models, decks, packs, submissions — rather than across
#: departments. What is being sampled is habits, not subjects.
QUERIES = [
    "financial model",
    "spreadsheet",
    "presentation",
    "consultation response",
    "impact assessment",
    "board minutes",
    "annual accounts",
    "price control",
    "workforce statistics",
    "cost benefit analysis",
    "briefing pack",
    "tender",
    "risk register",
    "modelling assumptions",
    "valuation",
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
            "https://www.gov.uk/api/search.json?count=30&fields=link&q="
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
    """The Office files hanging off one page.

    The search API returns attachment *titles* and no URLs; the content
    API returns the URLs. Two calls, and the second is the one that
    matters.
    """
    try:
        page = json.loads(_get(f"https://www.gov.uk/api/content{link}"))
    except (urllib.error.URLError, OSError, ValueError) as problem:
        print(f"[fail] {link}: {str(problem)[:70]}", file=sys.stderr)
        return []
    urls: list[str] = []
    for attachment in page.get("details", {}).get("attachments") or []:
        url = attachment.get("url") or ""
        if url.lower().endswith(WANTED):
            urls.append(url)
    return urls


def main() -> int:
    limit = 200
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
            # An error page served with an `.xlsx` name is the kind of
            # thing that fails four steps later with a confusing message.
            if not payload.startswith(b"PK") and payload[:2] != b"\xd0\xcf":
                print(f"[skip] {name}: not an Office file", file=sys.stderr)
                continue
            target.write_bytes(payload)
            got += 1
            print(f"[ ok ] {name}  {len(payload):,}", file=sys.stderr)

    print(f"\n{got} files in {HERE}", file=sys.stderr)
    if got:
        print("Measure them:  uv run python -m scripts.metadata_survey")
    return 0 if got else 1


if __name__ == "__main__":
    raise SystemExit(main())
