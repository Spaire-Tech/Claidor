"""The model audit, against a fixture whose defects are known.

Nine planted defects and eight structures that look like defects and are
not. The second half is the point: every one of those eight was a false
positive on a real Damodaran valuation model before the rule that exempts
it existed, and each would come back the moment a rule is loosened.
"""

import sys
from pathlib import Path

import pytest

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
sys.path.insert(0, str(CASCADE))

from build_audit_fixture import DEFECTS  # noqa: E402


@pytest.fixture(scope="module")
def found():
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    by_ref: dict[str, set[str]] = {}
    for finding in result.findings:
        by_ref.setdefault(finding.ref, set()).add(finding.rule)
    return by_ref


@pytest.mark.parametrize(("ref", "rule"), sorted(DEFECTS.items()))
def test_every_planted_defect_is_found(found, ref: str, rule: str) -> None:
    assert rule in found.get(ref, set()), f"{ref} should have raised {rule}"


def test_nothing_else_is_reported(found) -> None:
    """The half that matters. A rule loosened to catch one more defect
    brings these back, and there are far more of them in a real model than
    there are defects."""
    assert set(found) == set(DEFECTS)


def test_a_typed_history_is_not_a_hardcode() -> None:
    """Three years of actuals, typed, then a forecast. Every model on
    earth is built this way and a check that flags it flags every model."""
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    typed = {f.ref for f in result.findings if f.rule == "typed-over-formula"}
    assert typed == {"Model!F11"}
    assert not typed & {"Model!B6", "Model!C6", "Model!D6", "Model!C8", "Model!D8"}


def test_circularity_is_reported_only_when_the_model_has_not_declared_it() -> None:
    """Every Damodaran valuation model tested carries deliberate circular
    references and switches on iterative calculation to say so. The
    fixture does not, so its one loop is a defect."""
    book = read_workbook(str(CASCADE / "audit_fixture.xlsx"))
    assert book.iterative is False
    assert any(f.rule == "circular" for f in audit(book).findings)

    book.iterative = True
    assert not any(f.rule == "circular" for f in audit(book).findings)


def test_a_well_built_model_is_quiet() -> None:
    """The Cascade model: 313 cells, 228 formulas, no mechanical errors.
    An audit that cannot be quiet on a good model is not an audit."""
    result = audit(read_workbook(str(CASCADE / "cascade_model.xlsx")))
    assert result.errors == []
    assert result.examined > 300


def test_errors_and_smells_are_never_added_together() -> None:
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    assert {f.severity for f in result.errors} == {"error"}
    assert {f.severity for f in result.smells} == {"smell"}
    assert len(result.findings) == len(result.errors) + len(result.smells)


def test_every_finding_cites_the_standard_it_comes_from() -> None:
    """« Says who » has to have an answer that is not « the tool »."""
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    assert all(finding.source for finding in result.findings)
