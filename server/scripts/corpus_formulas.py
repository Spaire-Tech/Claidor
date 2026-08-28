"""Fetch the formula-bearing model corpora — Proof 1B's material.

Why this file exists. Every corpus we held until 28 August was either
tuned against (the regulator models), value-only (the published
closed-deal models — `population-proof.md`), or general spreadsheets
rather than financial models (CUSTODES/EUSES). Proof 1B — the
structural proof, the one that tests what Swens actually does — had
no corpus at all. These are candidates, verified reachable and
formula-bearing from these containers.

**Verified before this file was written**, by counting cells whose
XML carries an `<f>` element, on the files themselves:

- `solar` — one dense project-finance model, 5 sheets, 11,623 cells,
  **8,485 formulas (73%)**: DSCR, LLCR/PLCR, CFADS, reserve accounts,
  a real debt schedule. The densest single PF model found anywhere.
- `charlie` — 166 workbooks on real listed companies, **157 carry
  formulas**, 40,311 formula cells between them. Statement-driven and
  *thin* (≈257 formulas per file, some in single figures): this is a
  corporate/M&A *population*, useful for breadth and for the
  never-seen-this-dialect question, and it is **not** a substitute
  for depth.

**The corpus that matters most is not here, and cannot be until A6.**
`SheetJS/enron_xls` holds 9,145 real workbooks from a real energy
company; an independent count found 5,391 with live formulas and
**818 with more than 1,500 formulas and project-finance vocabulary**
— gas project financings, wind portfolio valuations, acquisition
models with full statement sets. They are `.xls`, which our reader
cannot open. It is 2.8 GB, so it is deliberately *not* fetched by
default: add `--enron` once intake exists.

**Licensing, and the lead's own omission (added 28 Aug, second
research round).** The first version of this file recorded formula
counts and said nothing about rights, which was a gap: a corpus that
cannot be used is not a corpus. Stated now, per source:

- `Charlie-Hill/Financial-Models` — **no LICENSE file at all**. Under
  copyright the default is all rights reserved: a public repository
  is readable, not reusable. **Research and internal measurement
  only. It never enters a shipped product, a published corpus, or
  training material.** One email to the author could change that; it
  has not been sent.
- `vincichan1089/solar-project-finance-model-mini-perm` — check the
  repository's own terms before any use beyond internal measurement;
  the same default applies where none is stated.
- `SheetJS/enron_xls` — the underlying Enron documents were never the
  collector's to license. Academic use treats this as settled; we are
  not academics. **Internal measurement only, and legal advice before
  it goes anywhere near a product.**

Nothing here is committed, nothing here ships, and any number
published from it names the corpus and its terms.

**Contamination rule, mandatory before any of this scores anything.**
Both the Enron corpus and our CUSTODES/EUSES benchmark subjects draw
on turn-of-the-century business spreadsheets. Every candidate is
hashed against `corpus_custodes/`, `corpus_sft/`, `corpus_au_uk/`
and `corpus_regulator/` before it enters a proof sample, exactly as
the closed-deal candidates were — four of seven of those turned out
to be files we already held.

Usage:
    uv run python -m scripts.corpus_formulas          # xlsx corpora
    uv run python -m scripts.corpus_formulas --enron  # + 2.8 GB
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent / "corpus_formulas"

REPOS = {
    "solar": "https://github.com/vincichan1089/solar-project-finance-model-mini-perm.git",
    "charlie": "https://github.com/Charlie-Hill/Financial-Models.git",
}

#: Blocked on plan step A6 (intake): every file is `.xls`, and 2.8 GB.
ENRON = "https://github.com/SheetJS/enron_xls.git"


def _clone(name: str, url: str) -> None:
    target = HERE / name
    if target.exists():
        print(f"[ ok ] {name}: already cloned", file=sys.stderr)
        return
    print(f"[ .. ] {name}: cloning", file=sys.stderr)
    subprocess.run(
        ["git", "clone", "--depth", "1", "-q", url, str(target)],
        check=True,
        timeout=1800,
    )
    print(f"[ ok ] {name}: cloned", file=sys.stderr)


def main() -> int:
    HERE.mkdir(parents=True, exist_ok=True)
    for name, url in REPOS.items():
        _clone(name, url)
    if "--enron" in sys.argv:
        _clone("enron", ENRON)
    else:
        print(
            "\nenron not fetched (2.8 GB, all .xls — needs A6). "
            "Pass --enron once intake exists.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
