"""Applying the fixes we are willing to make, as tracked changes.

The first thing in this project that *writes*. Everything until now
inspected a document and reported; this changes one.

Two rules, and both are refusals.

**Only a wrong case is fixed.** The term is written one way and defined
another, and the correction is the defined form — there is no judgement in
it. A term nobody defined, a definition nobody uses, two definitions of
one term, a broken cross-reference: each needs a drafting decision, and a
button that guesses at one is the worst thing this could do to a lawyer's
draft.

**Nothing is written without a revision mark.** Every edit goes through
:func:`polar.redline.ooxml.replace_tracked`, which produces `w:ins` and
`w:del`. An untracked edit to a client's agreement is not noticed until
somebody compares versions, and by then it is in a signed document.

The offsets have to line up exactly, which is why the checks are run
against the text the OOXML reader produces rather than against a
separately-extracted copy. Two extractions of the same document that
differ by one character put every fix in the wrong place.
"""

from dataclasses import dataclass, field

from .ooxml import CannotEdit, Edit, Package
from .terms import Defect, Finding


@dataclass
class FixReport:
    """What was changed, and what was left alone."""

    considered: int = 0
    applied: int = 0
    #: Findings with no mechanical fix — the great majority, deliberately.
    needs_a_decision: int = 0
    #: Fixes the engine refused to place. A span it cannot locate exactly
    #: is a span it must not edit.
    refused: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"{self.considered} findings | {self.applied} fixed as tracked "
            f"changes, {self.needs_a_decision} need a drafting decision, "
            f"{len(self.refused)} refused"
        )


#: The only defect with a correction that is not a judgement call.
FIXABLE = frozenset({Defect.case_mismatch})


def fix_for(finding: Finding) -> str | None:
    """The replacement text, or ``None`` when there is no safe one."""
    if finding.defect not in FIXABLE:
        return None
    if not finding.term.strip():
        return None
    return finding.term


def apply_fixes(
    package: Package, findings: list[Finding], *, author: str = "Claidor"
) -> FixReport:
    """Edit the package in place, returning what happened.

    Findings whose spans overlap are dropped rather than merged: two
    overlapping revisions cannot be reviewed coherently, and picking one
    would be arbitrary.
    """
    report = FixReport(considered=len(findings))

    edits: list[Edit] = []
    claimed: list[tuple[int, int]] = []
    for finding in sorted(findings, key=lambda f: f.start):
        replacement = fix_for(finding)
        if replacement is None:
            report.needs_a_decision += 1
            continue
        if any(start < finding.end and finding.start < end for start, end in claimed):
            report.refused.append(f"{finding.term}: overlaps another fix")
            continue
        claimed.append((finding.start, finding.end))
        edits.append(Edit(finding.start, finding.end, replacement))

    if not edits:
        return report

    try:
        package.document = replace_tracked_document(package, edits, author=author)
    except CannotEdit as error:
        # All or nothing. A partial application would leave the caller
        # holding a document whose findings no longer match its text.
        report.refused.append(str(error))
        return report

    report.applied = len(edits)
    return report


def replace_tracked_document(
    package: Package, edits: list[Edit], *, author: str
) -> bytes:
    from .ooxml import replace_tracked

    return replace_tracked(package.document, edits, author=author)
