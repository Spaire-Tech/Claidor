"""The route the Word add-in calls.

The engine is tested elsewhere. What is tested here is the contract
between the add-in and the server, because that is what breaks silently:
offsets that no longer index the string that was sent, counts that
disagree with the list beneath them, a route that answers without
authentication, and the promise that nothing about a client's draft
agreement is written anywhere.
"""

import io
import zipfile

import pytest
from httpx import AsyncClient

from tests.fixtures.auth import AuthSubjectFixture

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _docx(paragraphs: list[str]) -> bytes:
    """A minimal but real .docx — a zip with the parts Word requires."""
    body = "".join(f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>" for text in paragraphs)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/'
        'wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/'
            'content-types"><Default Extension="xml" ContentType="application/'
            'xml"/></Types>',
        )
        archive.writestr("word/document.xml", document)
    return buffer.getvalue()


#: The Vesence screenshot document, inline. Two undefined terms, one unused
#: definition, one term defined twice, definitions out of order.
EXAMPLE = (
    'HELIOS SYSTEMS LTD (the "Company") and ZENITH CAPITAL LLP '
    '(the "Subscriber") agree.\n\n'
    "1. DEFINITIONS\n\n"
    '"Subscription Price" means EUR 2,500,000.\n\n'
    '"Claim" means any claim made by the Subscriber.\n\n'
    '"Bank Account" means the account notified by the Company.\n\n'
    '"Warranties" means the warranties set out in Schedule 1.\n\n'
    '"Claim" means any claim for breach of the Warranties.\n\n'
    "2. SUBSCRIPTION\n\n"
    "2.1 The Subscriber shall subscribe for the New Shares at the "
    "Subscription Price.\n\n"
    "2.2 Allotment of the New Shares shall take place at the Completion.\n\n"
    "2.3 Any Claim shall be notified to the Company in writing.\n\n"
    "2.4 The Warranties shall be repeated at the Completion.\n"
)

CLEAN = (
    '"Closing Date" means 30 June 2026.\n'
    '"Consideration" means $5,000,000.\n'
    "The buyer shall pay the Consideration on the Closing Date.\n"
)


@pytest.mark.asyncio
class TestCheckText:
    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        response = await client.post("/v1/redline/check", json={"text": EXAMPLE})

        assert response.status_code == 401

    @pytest.mark.auth(AuthSubjectFixture(scopes=set()))
    async def test_missing_scope_is_refused(self, client: AsyncClient) -> None:
        response = await client.post("/v1/redline/check", json={"text": EXAMPLE})

        assert response.status_code == 403

    @pytest.mark.auth
    async def test_the_counts_match_vesences_own_panel(
        self, client: AsyncClient
    ) -> None:
        response = await client.post("/v1/redline/check", json={"text": EXAMPLE})

        assert response.status_code == 200
        body = response.json()
        assert body["critical_count"] == 2
        assert body["warning_count"] == 2
        assert body["to_review_count"] == 1
        assert len(body["findings"]) == 5

    @pytest.mark.auth
    async def test_the_counts_agree_with_the_list_beneath_them(
        self, client: AsyncClient
    ) -> None:
        # The panel shows « Critical (2) » above the findings. If the header
        # and the list disagree, the reader trusts neither.
        response = await client.post("/v1/redline/check", json={"text": EXAMPLE})
        body = response.json()

        for severity, key in (
            ("critical", "critical_count"),
            ("warning", "warning_count"),
            ("to_review", "to_review_count"),
        ):
            counted = sum(1 for f in body["findings"] if f["severity"] == severity)
            assert counted == body[key]

    @pytest.mark.auth
    async def test_offsets_index_the_text_that_was_sent(
        self, client: AsyncClient
    ) -> None:
        # The add-in jumps to a finding using these offsets. If they index
        # anything other than the exact string submitted — a normalised or
        # re-encoded copy — every jump lands in the wrong place.
        response = await client.post("/v1/redline/check", json={"text": EXAMPLE})

        for finding in response.json()["findings"]:
            assert EXAMPLE[finding["start"] : finding["end"]] == finding["literal"]

    @pytest.mark.auth
    async def test_a_clean_document_returns_nothing(self, client: AsyncClient) -> None:
        response = await client.post("/v1/redline/check", json={"text": CLEAN})

        body = response.json()
        assert body["findings"] == []
        assert body["critical_count"] == 0
        assert body["characters"] == len(CLEAN)

    @pytest.mark.auth
    async def test_empty_text_is_answered_not_refused(
        self, client: AsyncClient
    ) -> None:
        # An empty selection is a normal thing for a user to do. It gets an
        # empty panel, not an error.
        response = await client.post("/v1/redline/check", json={"text": ""})

        assert response.status_code == 200
        assert response.json()["findings"] == []

    @pytest.mark.auth
    async def test_an_oversized_document_is_refused_with_its_size(
        self, client: AsyncClient
    ) -> None:
        from polar.redline.endpoints import MAX_CHARACTERS

        response = await client.post(
            "/v1/redline/check", json={"text": "a" * (MAX_CHARACTERS + 1)}
        )

        assert response.status_code == 413
        assert f"{MAX_CHARACTERS:,}" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_missing_body_is_a_validation_error(
        self, client: AsyncClient
    ) -> None:
        response = await client.post("/v1/redline/check", json={})

        assert response.status_code == 422


@pytest.mark.asyncio
class TestCheckDocument:
    @pytest.mark.auth
    async def test_a_word_file_is_read_and_checked(self, client: AsyncClient) -> None:
        payload = _docx(
            [
                '"Subscription Price" means EUR 2,500,000.',
                "The Subscriber shall pay the Subscription Price.",
                '"Bank Account" means the account notified.',
            ]
        )

        response = await client.post(
            "/v1/redline/check/document",
            files={"file": ("agreement.docx", payload, DOCX_MIME)},
        )

        assert response.status_code == 200
        body = response.json()
        assert "Bank Account" in {f["term"] for f in body["findings"]}

    @pytest.mark.auth
    async def test_an_unreadable_file_says_so(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/redline/check/document",
            files={"file": ("photo.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        )

        assert response.status_code == 415

    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/redline/check/document",
            files={"file": ("a.docx", _docx(["hello"]), DOCX_MIME)},
        )

        assert response.status_code == 401


@pytest.mark.asyncio
class TestNothingIsStored:
    """The invariant from ``docs/vesence-clone/decisions.md``.

    Vesence's answer to « where are my files stored? » is that Workspace
    files stay in the browser and are not held on their servers. Ours is
    that the text is read, checked and dropped. That is cheap to keep and
    impossible to recover once broken: a client's draft agreement written
    to a disk is not un-written by deleting it later.

    This test fails the moment somebody adds a table for documents.
    """

    async def test_there_is_no_document_model(self) -> None:
        import polar.models as models

        suspects = [
            name
            for name in dir(models)
            if name.lower() in {"document", "redlinedocument", "checkeddocument"}
        ]
        assert suspects == []

    async def test_the_check_route_writes_nothing(self) -> None:
        # A cheaper and more durable check than mocking the session: the
        # module must not import a repository, a model, or a session.
        import inspect

        from polar.redline import endpoints

        source = inspect.getsource(endpoints)
        for forbidden in ("AsyncSession", "Repository", "session.add", "flush("):
            assert forbidden not in source
