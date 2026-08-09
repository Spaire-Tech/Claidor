"""Scoring a document against the firm's own positions.

The other checks ask whether a document is coherent. This one asks whether
it is acceptable — which is a reading, not arithmetic, so it needs a model
and therefore needs gates.

Two of them, and both are code:

- every finding quotes the document, verified before it is shown
- every finding names a rule that is actually in the playbook

No API calls here. What is tested is the gates and the severity path.
"""

import pytest

from polar.models.playbook import Approval, Playbook, PlaybookRule
from polar.models.playbook import Severity as RuleSeverity
from polar.redline import Certainty, Defect, Severity
from polar.redline.playbook import PlaybookReport, describe, verify

DOCUMENT = (
    "8. LIABILITY\n\n"
    "8.1 The Supplier's total liability under this agreement is limited to "
    "the fees paid in the three (3) months before the claim.\n\n"
    "9. GOVERNING LAW\n\n"
    "9.1 This agreement is governed by the laws of the State of Delaware.\n"
)


def rule(**over: object) -> PlaybookRule:
    fields: dict[str, object] = {
        "clause": "Limitation of liability",
        "position": 0,
        "preferred": "Liability capped at 12 months' fees.",
        "severity": RuleSeverity.warning,
        "approval": Approval.none,
    }
    fields.update(over)
    return PlaybookRule(**fields)  # type: ignore[arg-type]


def _report() -> PlaybookReport:
    return PlaybookReport(playbook="Test", rules=1)


class TestDescribingThePlaybook:
    def test_a_rule_with_only_a_preferred_position_is_one_line(self) -> None:
        # The design rule from Vaquill: a playbook holding nothing but
        # preferred wording still works. If this grew empty headings the
        # model would be answering about fields nobody filled in.
        described = describe([rule()])
        assert "Preferred" in described
        assert "Acceptable" not in described
        assert "Walk away" not in described

    def test_filled_fields_all_appear(self) -> None:
        described = describe(
            [
                rule(
                    acceptable="Down to 6 months' fees.",
                    fallback="9 months, then 6.",
                    walk_away="Any cap below 3 months' fees.",
                    rationale="Our insurance sits at 12 months.",
                )
            ]
        )
        for heading in ("Preferred", "Acceptable", "Fallback", "Walk away", "Why"):
            assert heading in described


class TestTheGates:
    def test_a_deviation_that_quotes_the_document_survives(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Three months against our twelve.",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        assert len(kept) == 1
        assert kept[0].defect is Defect.playbook_deviation
        assert kept[0].term == "Limitation of liability"

    def test_an_invented_quote_is_dropped(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to one (1) month of fees paid",
                    "note": "Far below our position.",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        assert kept == []
        assert report.unquotable == 1

    def test_a_clause_that_is_not_in_the_playbook_is_dropped(self) -> None:
        # The rule is ours; it came out of our own database. A finding
        # attributed to a rule nobody wrote is a rule the model invented.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Force majeure",
                    "quote": "governed by the laws of the State of Delaware",
                    "note": "Not our preferred jurisdiction.",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        assert kept == []
        assert report.unknown_clause == 1

    def test_a_finding_with_no_note_is_dropped(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "  ",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        assert kept == []

    def test_the_same_deviation_seen_twice_is_reported_once(self) -> None:
        # Overlapping windows show the same clause to the model twice.
        report = _report()
        item = {
            "clause": "Limitation of liability",
            "quote": "limited to the fees paid in the three (3) months",
            "note": "Three months against our twelve.",
        }
        kept = verify(
            DOCUMENT, [item, dict(item)], {"limitation of liability": rule()}, report
        )
        assert len(kept) == 1


class TestSeverity:
    def test_a_finding_carries_the_rules_severity_not_a_default(self) -> None:
        # The point of the governance layer: the firm decides how loudly
        # its own breach is reported.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Below our position.",
                }
            ],
            {"limitation of liability": rule(severity=RuleSeverity.to_review)},
            report,
        )
        assert kept[0].severity is Severity.to_review

    def test_passing_the_walk_away_line_is_critical(self) -> None:
        # The bug this test exists for: the severity was computed and then
        # thrown away, so a walk-away breach came out as an ordinary
        # warning. A term the firm has said it will not accept is not a
        # negotiating position, it is a refusal.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Three months.",
                    "beyond_walk_away": True,
                }
            ],
            {
                "limitation of liability": rule(
                    severity=RuleSeverity.to_review,
                    walk_away="Any cap below 6 months' fees.",
                )
            },
            report,
        )
        assert kept[0].severity is Severity.critical
        assert "walk-away" in kept[0].note

    def test_the_walk_away_flag_is_ignored_when_no_line_is_set(self) -> None:
        # A model asserting a breach of a line the firm never drew is not
        # evidence that the line exists.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Three months.",
                    "beyond_walk_away": True,
                }
            ],
            {"limitation of liability": rule(severity=RuleSeverity.warning)},
            report,
        )
        assert kept[0].severity is Severity.warning

    def test_findings_are_suggested_not_certain(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Below our position.",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        assert kept[0].certainty is Certainty.suggested


class TestWhatTheReaderSees:
    def test_the_note_carries_our_position_verbatim(self) -> None:
        # A lawyer wants both on screen: what the document says, and what
        # we said we wanted. Paraphrasing either is how a review becomes an
        # argument about what the playbook meant.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Three months.",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        assert "Liability capped at 12 months' fees." in kept[0].note

    def test_a_required_sign_off_is_named(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Three months.",
                }
            ],
            {"limitation of liability": rule(approval=Approval.partner)},
            report,
        )
        assert "Sign-off needed: partner" in kept[0].note

    def test_the_span_lands_on_the_documents_own_words(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "clause": "Limitation of liability",
                    "quote": "limited to the fees paid in the three (3) months",
                    "note": "Three months.",
                }
            ],
            {"limitation of liability": rule()},
            report,
        )
        finding = kept[0]
        assert DOCUMENT[finding.start : finding.end] == finding.literal
        assert "three (3) months" in finding.literal


@pytest.mark.asyncio
class TestNothingToDo:
    async def test_a_playbook_with_no_rules_needs_no_model(self) -> None:
        from polar.redline.playbook import review_against

        findings, report = await review_against(
            DOCUMENT, Playbook(name="Empty", contract_type="NDA"), []
        )
        assert findings == []
        assert report.chunks == 0

    async def test_empty_text_needs_no_model(self) -> None:
        from polar.redline.playbook import review_against

        findings, report = await review_against(
            "   ", Playbook(name="P", contract_type="NDA"), [rule()]
        )
        assert findings == []
        assert report.chunks == 0
