"""The truth-set registry's rules (`docs/pierce/truth-set.md`): every
line names its grade and source; a labelled cell names its file by
content hash; the candidates file is read from a revision log."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import truth_set


def test_the_committed_registry_is_well_formed() -> None:
    entries = truth_set.load()
    assert entries, "the registry is seeded"
    ids = [one["id"] for one in entries]
    assert len(ids) == len(set(ids))
    for one in entries:
        truth_set.check(one)


def test_a_cell_without_its_file_hash_is_refused() -> None:
    with pytest.raises(ValueError, match="needs sha"):
        truth_set.check(
            {
                "id": "x",
                "grade": "independent-real",
                "source": "s",
                "description": "d",
                "added": "2026-09-03",
                "file": "f.xlsx",
                "sheet": "S",
                "cell": "A1",
            }
        )


def test_an_unknown_grade_is_refused() -> None:
    with pytest.raises(ValueError, match="grade"):
        truth_set.check(
            {
                "id": "x",
                "grade": "guess",
                "source": "s",
                "description": "d",
                "added": "d",
            }
        )


def test_candidates_are_read_from_a_revision_log(tmp_path: Path) -> None:
    log = tmp_path / "pair.log"
    log.write_text(
        "pr24-AFW: draft=8 final=13 NEW=8 FIXED=0 PERSISTENT=2\n"
        "  NEW [hardcode-in-formula] InpS!InpS!Q1394,InpS!R1394 "
        "'FY2029 Ofwat - Total gross operational expenditure including'\n"
        "  NEW [broken-name] ! 'defined names'\n"
        "riio3-et3: draft=34 final=42 NEW=11 FIXED=6 PERSISTENT=21\n"
        "  NEW [typed-over-formula] FinRatios RoRE decomposition!"
        "FinRatios RoRE decomposition!AP29 'FY2022 Revenue impact'\n"
    )
    out = tmp_path / "candidates.json"
    truth_set.candidates(log, "unused", out)
    import json

    found = json.loads(out.read_text())
    assert len(found) == 3
    assert found[0]["pair"] == "pr24-AFW"
    assert found[0]["rule"] == "hardcode-in-formula"
    assert found[0]["sheet"] == "InpS"
    assert found[0]["refs"] == ["Q1394", "R1394"]
    assert found[0]["grade"] == ""
    assert found[1] == {
        "pair": "pr24-AFW",
        "rule": "broken-name",
        "sheet": "",
        "refs": [],
        "name": "defined names",
        "grade": "",
        "note": "",
    }
    assert found[2]["pair"] == "riio3-et3"
    assert found[2]["sheet"] == "FinRatios RoRE decomposition"
    assert found[2]["refs"] == ["AP29"]
