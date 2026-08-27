"""Finch (FinWorkBench) — the pivot corpus, fetched and nothing more.

The Scottish route is closed (`corpus-sources.md`, 27 August), and
this is the lead's verified pivot: **FinWorkBench/Finch** on
HuggingFace, public, ungated, **CC BY 3.0** — the first corpus we
hold that permits commercial use with attribution. It carries
document-grounded extraction tasks with hand-made reference outputs,
which is the shape D3's hit-rate round has never had.

**Attribution obligation** (CC BY 3.0), to travel with every number
ever measured on it: *FinWorkBench/Finch*, arXiv:2512.13168,
huggingface.co/datasets/FinWorkBench/Finch, CC BY 3.0.

The layout, as the dataset publishes it: `files/{task}/{task}.json`
beside that task's `{task}_src_*` inputs and `{task}_ref_*` reference
outputs, plus a root `README.md` card and `finch_workflows_test.jsonl`.

By default this fetches the card, the workflow index, every task
JSON (all small), and the source/reference files **only of tasks that
carry a PDF** — which are the only ones that can be D3's task.
`--all` takes everything.

    uv run python -m scripts.corpus_documents_finch
    uv run python -m scripts.corpus_documents_finch --all

Files land in `scripts/corpus_finch/`, git-ignored: the corpus is
re-fetchable and never committed.
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent / "corpus_finch"

DATASET = "FinWorkBench/Finch"
API = f"https://huggingface.co/api/datasets/{DATASET}"
FILES = f"https://huggingface.co/datasets/{DATASET}/resolve/main"

#: Bigger than this is not a task file; refuse rather than fill a disk.
MAX_BYTES = 64 * 1024 * 1024


def _get(url: str, timeout: int = 120) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; Pierce corpus)"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return bytes(response.read())


def listing() -> list[str]:
    """Every path the dataset publishes."""
    return [s["rfilename"] for s in json.loads(_get(API))["siblings"]]


def wanted(paths: list[str], everything: bool) -> list[str]:
    """The card, the index, every task JSON, and the PDF-paired files."""
    keep = [p for p in paths if "/" not in p and p != ".gitattributes"]
    keep += [p for p in paths if p.endswith(".json") and p.startswith("files/")]
    if everything:
        return sorted(set(keep + [p for p in paths if p.startswith("files/")]))
    with_pdf = {
        p.split("/")[1] for p in paths if p.startswith("files/") and p.endswith(".pdf")
    }
    keep += [
        p
        for p in paths
        if p.startswith("files/")
        and p.split("/")[1] in with_pdf
        and not p.endswith(".json")
    ]
    return sorted(set(keep))


def main() -> int:
    everything = "--all" in sys.argv
    HERE.mkdir(parents=True, exist_ok=True)
    try:
        paths = listing()
    except (urllib.error.URLError, OSError, ValueError) as problem:
        print(f"dataset listing failed: {str(problem)[:90]}", file=sys.stderr)
        return 1
    targets = wanted(paths, everything)
    print(f"{len(paths)} files published; fetching {len(targets)}", file=sys.stderr)

    got = failed = 0
    for path in targets:
        target = HERE / path
        if target.exists() and target.stat().st_size:
            got += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            payload = _get(f"{FILES}/{path}")
        except (urllib.error.URLError, OSError) as problem:
            print(f"[fail] {path}: {str(problem)[:70]}", file=sys.stderr)
            failed += 1
            continue
        if len(payload) > MAX_BYTES:
            print(f"[skip] {path}: {len(payload):,} bytes", file=sys.stderr)
            continue
        target.write_bytes(payload)
        got += 1

    print(
        f"\n{got} files in {HERE}" + (f", {failed} failed" if failed else ""),
        file=sys.stderr,
    )
    print(
        "CC BY 3.0 — attribution travels with every number: FinWorkBench/Finch, "
        "arXiv:2512.13168.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
