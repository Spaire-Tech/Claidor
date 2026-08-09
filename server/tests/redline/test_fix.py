"""The first route that writes.

Everything before this inspected a document and reported. This one
changes one, which raises the stakes: a wrong finding costs a lawyer a
minute, a wrong *edit* ends up in a signed agreement.

Two properties carry it, and both are refusals. Only a wrong case is
fixed, because it is the only defect whose correction is not a judgement
call. And nothing is written without a revision mark, because an
untracked edit is invisible until somebody compares versions.
"""

import pytest
from httpx import AsyncClient

from polar.redline import Defect, review_document
from polar.redline.fix import apply_fixes, fix_for
from polar.redline.ooxml import Package, read
from tests.redline.test_ooxml import document_xml, docx, paragraph, run

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

#: A document defining « Closing Date » and then writing it in lower case
#: — one mechanical fix — plus an « Escrow Amount » nobody uses, which is
#: a real defect with no correction anybody but a lawyer can make. The
#: fixture needs both or it cannot show the difference.
MISCASED = document_xml(
    paragraph(run('"Closing Date" means 30 June 2026.')),
    paragraph(run('"Consideration" means USD 5,000,000.')),
    paragraph(run('"Escrow Amount" means USD 500,000.')),
    paragraph(run('"Warranties" means the warranties in Schedule 1.')),
    paragraph(run("The Consideration is payable on the Closing Date.")),
    paragraph(run("Completion occurs on the "), run("closing date"), run(".")),
    paragraph(run("The Warranties survive the Closing Date.")),
)


class TestWhatGetsFixed:
    def test_a_wrong_case_has_a_correction(self) -> None:
        findings = [
            f
            for f in review_document(read(MISCASED).text)
            if f.defect is Defect.case_mismatch
        ]
        assert findings
        assert fix_for(findings[0]) == "Closing Date"

    @pytest.mark.parametrize(
        "defect",
        [
            Defect.undefined_term,
            Defect.unused_definition,
            Defect.multiple_definitions,
            Defect.unordered_definitions,
            Defect.broken_reference,
            Defect.numbering_gap,
            Defect.duplicate_number,
            Defect.contradiction,
            Defect.miscalculation,
            Defect.inconsistent_style,
        ],
    )
    def test_everything_else_needs_a_decision(self, defect: Defect) -> None:
        # A button that guesses at a drafting decision is the worst thing
        # this could do to a lawyer's draft.
        findings = [
            f for f in review_document(read(MISCASED).text) if f.defect is defect
        ]
        for finding in findings:
            assert fix_for(finding) is None


class TestApplyingThem:
    def test_the_fix_lands_as_a_tracked_change(self) -> None:
        package = Package.open(docx(MISCASED))
        report = apply_fixes(package, review_document(package.read().text))

        assert report.applied >= 1
        assert b"<w:ins " in package.document
        assert b"<w:del " in package.document

    def test_the_text_reads_correctly_afterwards(self) -> None:
        package = Package.open(docx(MISCASED))
        apply_fixes(package, review_document(package.read().text))

        after = package.read().text
        assert "closing date" not in after
        assert after.count("Closing Date") >= 3

    def test_the_findings_that_need_a_decision_are_counted_not_applied(self) -> None:
        package = Package.open(docx(MISCASED))
        report = apply_fixes(package, review_document(package.read().text))

        assert report.needs_a_decision >= 1
        assert report.considered == report.applied + report.needs_a_decision + len(
            report.refused
        )

    def test_the_other_parts_are_untouched(self) -> None:
        # Styles and numbering dying is the classic failure, and it is
        # silent.
        package = Package.open(docx(MISCASED))
        before = {
            name: package.part(name)
            for name in package.names
            if name != "word/document.xml"
        }
        apply_fixes(package, review_document(package.read().text))
        reopened = Package.open(package.save())

        for name, payload in before.items():
            assert reopened.part(name) == payload, name

    def test_a_document_with_nothing_to_fix_is_left_alone(self) -> None:
        clean = document_xml(
            paragraph(run('"Closing Date" means 30 June 2026.')),
            paragraph(run("Completion occurs on the Closing Date.")),
        )
        package = Package.open(docx(clean))
        before = package.document
        report = apply_fixes(package, review_document(package.read().text))

        assert report.applied == 0
        assert package.document == before

    def test_no_finding_at_all_writes_nothing(self) -> None:
        package = Package.open(docx(MISCASED))
        before = package.document
        assert apply_fixes(package, []).applied == 0
        assert package.document == before


@pytest.mark.asyncio
class TestTheRoute:
    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/redline/fix/document",
            files={"file": ("a.docx", docx(MISCASED), DOCX_MIME)},
        )

        assert response.status_code == 401

    @pytest.mark.auth
    async def test_it_returns_a_word_file(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/redline/fix/document",
            files={"file": ("agreement.docx", docx(MISCASED), DOCX_MIME)},
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == DOCX_MIME
        assert "agreement-redlined.docx" in response.headers["content-disposition"]

    @pytest.mark.auth
    async def test_the_returned_file_opens_and_carries_the_revisions(
        self, client: AsyncClient
    ) -> None:
        response = await client.post(
            "/v1/redline/fix/document",
            files={"file": ("agreement.docx", docx(MISCASED), DOCX_MIME)},
        )

        package = Package.open(response.content)
        assert b"<w:ins " in package.document
        assert "closing date" not in package.read().text

    @pytest.mark.auth
    async def test_the_counts_come_back_in_headers(self, client: AsyncClient) -> None:
        # So the caller knows what happened without parsing the document.
        response = await client.post(
            "/v1/redline/fix/document",
            files={"file": ("a.docx", docx(MISCASED), DOCX_MIME)},
        )

        assert int(response.headers["x-redline-applied"]) >= 1
        assert int(response.headers["x-redline-needs-decision"]) >= 1
        assert response.headers["x-redline-refused"] == "0"

    @pytest.mark.auth
    async def test_something_that_is_not_a_docx_is_refused(
        self, client: AsyncClient
    ) -> None:
        response = await client.post(
            "/v1/redline/fix/document",
            files={"file": ("photo.png", b"\x89PNG\r\n", "image/png")},
        )

        assert response.status_code == 415
