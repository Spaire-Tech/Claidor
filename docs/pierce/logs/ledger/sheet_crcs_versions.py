"""Does the zip CRC of a worksheet survive a real Excel revision?

Atelier proposed pruning the Watch's comparison to sheets whose zip
entry CRC-32 proves them byte-identical — exact, and cheap, since a
zip directory read costs milliseconds. It called the idea unmeasurable
because « no two Excel saves of one model exist in this corpus ».

They do, and not in `corpus_sft`: the AU-UK corpus is built of them.
Ofgem publishes eleven consecutive revisions of the ED2 price control
model, and the CAA publishes the H7 price control model at final
proposals and again at final determinations. This runs the check over
every consecutive pair.

Result on 28 Aug 2026: **0 byte-identical worksheets out of 372**,
including two ED2 revisions seventeen days apart. Excel recalculates
on open and rewrites cached values, row spans and <dimension> into
every formula-bearing sheet, so an untouched sheet is not an untouched
zip entry. The design is refused on measurement.

Caveat, stated because it is the honest one: these are published
files, possibly re-saved wholesale by the regulator. A lightly-edited
desktop pair could in principle behave differently. 372 of 372 makes
that unlikely enough that no lane spends another hour here without new
evidence.

    uv run python docs/pierce/logs/ledger/sheet_crcs_versions.py
"""

import zipfile
from pathlib import Path

CORPUS = Path(__file__).resolve().parents[4] / "server" / "scripts" / "corpus_au_uk"


def sheets(path: Path) -> dict[str, tuple[int, int]]:
    """Every worksheet entry's CRC-32 and uncompressed size.

    `xl/worksheets/sheet*.xml` only: the sibling `_rels/*.xml.rels`
    stubs live under the same prefix and are identical across almost
    any pair, which is how the lead's first pass reported 62 matches
    that were not sheets at all.
    """
    with zipfile.ZipFile(path) as archive:
        return {
            item.filename: (item.CRC, item.file_size)
            for item in archive.infolist()
            if item.filename.startswith("xl/worksheets/sheet")
            and item.filename.endswith(".xml")
        }


def pairs() -> list[tuple[str, Path, Path]]:
    ed2 = sorted((CORPUS / "ofgem_ed2").glob("v*.xls*"))
    out = [
        (f"ed2 {old.stem} -> {new.stem}", old, new)
        for old, new in zip(ed2, ed2[1:], strict=False)
    ]
    h7 = CORPUS / "caa_h7"
    proposals = next(h7.glob("*v2-10*"), None)
    determinations = next(h7.glob("*v2-11*"), None)
    if proposals and determinations:
        out.append(("h7 pcm v2-10 -> v2-11", proposals, determinations))
    return out


def main() -> int:
    compared = identical = 0
    for label, old, new in pairs():
        before, after = sheets(old), sheets(new)
        shared = before.keys() & after.keys()
        same = [name for name in shared if before[name] == after[name]]
        compared += len(shared)
        identical += len(same)
        print(f"{label[:52]:52s} shared {len(shared):3d}  identical {len(same):3d}")
    print(
        f"\n{identical} byte-identical worksheets of {compared} compared, "
        f"across {len(pairs())} real consecutive-version pairs"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
