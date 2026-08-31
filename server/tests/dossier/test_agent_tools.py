"""What the agent can and cannot do inside a matter.

Every test here runs without a database, because the tools are functions
over a fixed set of documents rather than queries. That is not only
convenient: it is the containment property. A tool that took a session
could be talked into reading outside the matter; one that takes a
workspace cannot, and the tests can say so directly.
"""

from uuid import uuid4

import pytest

from polar.dossier.agent.tools import (
    MAX_HITS,
    READ_WINDOW,
    Workspace,
    check_document,
    list_documents,
    read_document,
    run_tool,
    search_documents,
)
from polar.models.dossier import DossierDocument

#: The same text `tests/redline/test_endpoints.py` pins the engine against:
#: 2 critical, 2 warning, 1 to review. Reused rather than invented so this
#: file cannot disagree with the engine's own tests about what it finds.
#:
#: The first version here was a three-line fixture that produced no
#: critical findings at all, because an undefined term needs two sightings
#: before it is reported and each term appeared once. The test asserting
#: otherwise was wrong, not the engine.
DEFECTIVE = (
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


def document(text: str | None, *, title: str = "SPA", piece: int | None = 1):
    return DossierDocument(
        id=uuid4(),
        dossier_id=uuid4(),
        file_id=uuid4(),
        uploaded_by_id=uuid4(),
        title=title,
        piece_number=piece,
        extracted_text=text,
    )


def workspace(*documents: DossierDocument) -> Workspace:
    return Workspace(dossier_id=uuid4(), documents=tuple(documents))


class TestContainment:
    """The matter is the boundary, and it is structural."""

    def test_a_document_outside_the_workspace_does_not_exist(self) -> None:
        # Not "is refused" — does not exist. From inside the matter that is
        # the true answer, and it is the same answer for a document that
        # was never created and one belonging to the other side.
        inside = document(DEFECTIVE)
        outside = document(DEFECTIVE, title="Someone else's file")

        result = read_document(workspace(inside), str(outside.id))

        assert result.ok is False
        assert "No such document" in result.summary

    def test_checking_a_document_outside_the_workspace_is_the_same(self) -> None:
        outside = document(DEFECTIVE)

        result = check_document(workspace(document(DEFECTIVE)), str(outside.id))

        assert result.ok is False

    def test_search_only_reaches_the_workspace(self) -> None:
        result = search_documents(workspace(document("alpha")), "alpha")

        assert result.data["documents_searched"] == 1


class TestListing:
    def test_unreadable_files_are_listed_not_hidden(self) -> None:
        # An agent that cannot see the scans cannot say "six files could
        # not be read", so it says "I checked every document" instead.
        result = list_documents(
            workspace(document(DEFECTIVE), document(None, title="Scan"))
        )

        assert result.data["readable"] == 1
        assert result.data["unreadable"] == 1
        assert len(result.data["documents"]) == 2
        assert "not machine-readable" in result.summary

    def test_an_empty_matter_lists_nothing(self) -> None:
        result = list_documents(workspace())

        assert result.ok is True
        assert result.data["documents"] == []


class TestReading:
    def test_it_says_how_much_is_left(self) -> None:
        # Without this an agent reads the first window and concludes the
        # agreement has no indemnity, when the indemnity is on page 90.
        space = workspace(document("x" * (READ_WINDOW * 2)))

        result = read_document(space, str(space.documents[0].id))

        assert result.data["remaining"] == READ_WINDOW

    def test_reading_on_from_an_offset(self) -> None:
        text = "abcdefghij"
        space = workspace(document(text))

        result = read_document(space, str(space.documents[0].id), start=4, length=3)

        assert result.data["text"] == "efg"
        assert result.data["start"] == 4
        assert result.data["end"] == 7
        assert result.data["remaining"] == 3

    def test_a_window_larger_than_the_ceiling_is_capped(self) -> None:
        text = "y" * (READ_WINDOW * 3)
        space = workspace(document(text))

        result = read_document(
            space, str(space.documents[0].id), length=READ_WINDOW * 3
        )

        assert len(result.data["text"]) == READ_WINDOW

    def test_an_unreadable_document_says_its_contents_are_unknown(self) -> None:
        # The wording matters more than the flag: an agent reading "holds no
        # machine-readable text" will not report on its contents. One
        # reading an empty string might.
        space = workspace(document(None, title="Scan"))

        result = read_document(space, str(space.documents[0].id))

        assert result.ok is False
        assert "unknown" in result.summary


class TestChecking:
    def test_it_returns_the_engine_s_own_findings(self) -> None:
        space = workspace(document(DEFECTIVE))

        result = check_document(space, str(space.documents[0].id))

        assert result.ok is True
        assert len(result.data["findings"]) > 0
        assert result.data["counts"]["critical"] >= 1

    def test_the_counts_agree_with_the_findings(self) -> None:
        space = workspace(document(DEFECTIVE))

        data = check_document(space, str(space.documents[0].id)).data

        assert sum(data["counts"].values()) == len(data["findings"])

    def test_a_clean_document_returns_nothing_rather_than_failing(self) -> None:
        clean = (
            '"Closing Date" means 30 June 2026.\n'
            '"Consideration" means $5,000,000.\n'
            "The buyer shall pay the Consideration on the Closing Date.\n"
        )
        space = workspace(document(clean))

        result = check_document(space, str(space.documents[0].id))

        assert result.ok is True
        assert result.data["findings"] == []

    def test_an_unreadable_document_cannot_be_checked(self) -> None:
        space = workspace(document(None))

        result = check_document(space, str(space.documents[0].id))

        assert result.ok is False


class TestSearching:
    def test_it_finds_every_occurrence_with_its_surroundings(self) -> None:
        space = workspace(document("The cap is X. The cap is Y."))

        result = search_documents(space, "cap")

        assert len(result.data["hits"]) == 2
        assert "The cap is X" in result.data["hits"][0]["quote"]

    def test_it_is_case_insensitive(self) -> None:
        result = search_documents(workspace(document("Indemnity")), "indemnity")

        assert len(result.data["hits"]) == 1

    def test_it_counts_the_documents_it_could_not_search(self) -> None:
        # So "no mention of an indemnity anywhere" can be qualified with
        # "in the files we could read".
        result = search_documents(
            workspace(document("nothing here"), document(None)), "indemnity"
        )

        assert result.data["hits"] == []
        assert result.data["documents_unreadable"] == 1

    def test_too_many_hits_says_so(self) -> None:
        result = search_documents(workspace(document("a " * 200)), "a")

        assert result.data["truncated"] is True
        assert len(result.data["hits"]) == MAX_HITS

    def test_an_empty_query_is_refused(self) -> None:
        result = search_documents(workspace(document("anything")), "   ")

        assert result.ok is False


class TestDispatch:
    def test_an_invented_tool_is_a_refusal_not_a_crash(self) -> None:
        # Models occasionally invent a tool name. The useful response is to
        # say it does not exist and let the run continue.
        result = run_tool(workspace(), "delete_everything", {})

        assert result.ok is False
        assert "no tool called" in result.summary

    def test_wrong_arguments_are_a_refusal_not_a_crash(self) -> None:
        result = run_tool(workspace(), "read_document", {"nonsense": 1})

        assert result.ok is False

    @pytest.mark.parametrize(
        "name",
        ["list_documents", "read_document", "check_document", "search_documents"],
    )
    def test_every_advertised_tool_can_be_dispatched(self, name: str) -> None:
        from polar.dossier.agent.tools import DEFINITIONS, TOOLS

        # The definitions are what the model is shown; TOOLS is what runs.
        # A name in one and not the other is a tool that either cannot be
        # called or is never offered.
        assert name in TOOLS
        assert name in {definition["name"] for definition in DEFINITIONS}


def test_the_definitions_and_the_implementations_do_not_drift() -> None:
    from polar.dossier.agent.tools import DEFINITIONS, TOOLS

    assert {definition["name"] for definition in DEFINITIONS} == set(TOOLS)
