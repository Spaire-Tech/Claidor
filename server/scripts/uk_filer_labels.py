"""The British source: (row label → FRC concept) pairs from Companies
House's daily bulk of inline-XBRL accounts (`docs/pierce/uk-filer-labels.md`).

    PYTHONPATH=. uv run python scripts/uk_filer_labels.py OUT.json.gz ZIP [ZIP ...]

For every tagged number (`ix:nonFraction`) in every account: the
concept (prefix removed, kept only if it is an FRC money concept the
vocabulary holds), the printed row label (the first cell of the
number's table row that carries a letter and is not the number's own
cell), and whether the number was printed sign-flipped. Pairs are
keyed on the vocabulary's own `normalise` and counted per concept;
pairs seen on fewer than three lines are dropped, as for the SEC.
"""

from __future__ import annotations

import gzip
import json
import sys
import time
import zipfile
from collections import Counter
from pathlib import Path

from lxml import html as LH

from polar.tieout.meaning import normalise, vocabulary


def row_label(fact: LH.HtmlElement) -> str | None:
    row = fact
    while row is not None and row.tag != "tr":
        row = row.getparent()
    if row is None:
        return None
    own = fact
    while own is not None and own.getparent() is not row:
        own = own.getparent()
    for cell in row:
        if cell is own or cell.tag not in ("td", "th"):
            continue
        text = " ".join(cell.text_content().split())
        if any(ch.isalpha() for ch in text):
            return text
    return None


def main(argv: list[str]) -> None:
    out = Path(argv[1])
    zips = [Path(one) for one in argv[2:]]
    frc = {name for (source, name) in vocabulary().by_name if source == "frc"}
    pairs: Counter[tuple[str, str]] = Counter()
    flipped: Counter[tuple[str, str]] = Counter()
    dropped: Counter[str] = Counter()
    concept_lines: Counter[str] = Counter()
    accounts = facts = 0
    started = time.time()
    for archive in zips:
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if not name.endswith((".html", ".xhtml")):
                    dropped["not html"] += 1
                    continue
                accounts += 1
                try:
                    doc = LH.fromstring(z.read(name))
                except Exception:
                    dropped["unparseable"] += 1
                    continue
                for fact in doc.iter():
                    if not isinstance(fact.tag, str) or not fact.tag.lower().endswith(
                        "nonfraction"
                    ):
                        continue
                    facts += 1
                    concept = (fact.get("name") or "").rsplit(":", 1)[-1]
                    if concept not in frc:
                        dropped["not an FRC money concept"] += 1
                        continue
                    label = row_label(fact)
                    if not label:
                        dropped["no row label"] += 1
                        continue
                    key = normalise(label)
                    if not key:
                        dropped["empty after normalising"] += 1
                        continue
                    pairs[(key, concept)] += 1
                    concept_lines[concept] += 1
                    if fact.get("sign") == "-":
                        flipped[(key, concept)] += 1
                if accounts % 2000 == 0:
                    print(
                        f"  {accounts} accounts, {facts} facts, {time.time() - started:.0f}s",
                        flush=True,
                    )
    by_label: dict[str, dict[str, list[int]]] = {}
    for (key, concept), count in pairs.items():
        if count < 3:
            dropped["pair seen under three times"] += 1
            continue
        by_label.setdefault(key, {})[concept] = [count, flipped[(key, concept)]]
    with gzip.open(out, "wt", encoding="utf-8") as handle:
        json.dump(by_label, handle, separators=(",", ":"))
    print("accounts", accounts, "| facts", facts, "| dropped", dict(dropped))
    print(
        "distinct labels kept",
        len(by_label),
        "| pairs kept",
        sum(len(v) for v in by_label.values()),
    )
    for concept in (
        "TurnoverRevenue",
        "OperatingProfitLoss",
        "ProfitLossBeforeTax",
        "Creditors",
        "NetCurrentAssetsLiabilities",
    ):
        labels = sorted(
            ((v[concept][0], k) for k, v in by_label.items() if concept in v),
            reverse=True,
        )[:10]
        print(f"  {concept} ({concept_lines[concept]} lines):", labels)
    print(
        "written",
        out,
        out.stat().st_size,
        "bytes in",
        round(time.time() - started),
        "s",
    )


if __name__ == "__main__":
    main(sys.argv)
