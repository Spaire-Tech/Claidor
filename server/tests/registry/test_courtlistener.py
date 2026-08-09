"""Reading a CourtListener search response.

The fixture is a real response, saved verbatim from the live API on
2026-08-09 — the first page of ``"express negligence"`` across the Texas
Supreme Court and courts of appeals. Not a hand-written approximation:
what breaks a harvester is the shape the API actually has, and only a real
response carries that.
"""

import json
from datetime import date
from pathlib import Path

import pytest

from polar.registry.courtlistener import (
    BASE_URL,
    next_cursor,
    parse_results,
    search_params,
)

FIXTURE = Path(__file__).parent / "courtlistener_search_page.json"


@pytest.fixture
def payload() -> dict:
    return json.loads(FIXTURE.read_text())


class TestParsing:
    def test_every_opinion_of_every_case_is_read(self, payload: dict) -> None:
        # A result is a *cluster* — one case, possibly several opinions.
        # Reading only the first would lose dissents, and losing them
        # silently is worse than not having them.
        opinions = parse_results(payload)
        expected = sum(len(r["opinions"]) for r in payload["results"])
        assert len(opinions) == expected
        assert len(opinions) > len(payload["results"])

    def test_case_metadata_is_carried_onto_each_opinion(self, payload: dict) -> None:
        first = parse_results(payload)[0]
        assert first.case_name
        assert first.court_id.startswith("tx") or first.court_id == "tex"
        assert first.court_name
        assert isinstance(first.date_filed, date)

    def test_the_source_url_is_absolute_and_reachable_by_a_human(
        self, payload: dict
    ) -> None:
        # Provenance is not optional: every claim the registry makes has to
        # be traceable to a document someone else can open.
        for opinion in parse_results(payload):
            assert opinion.source_url.startswith(f"{BASE_URL}/opinion/")

    def test_dissents_are_identified(self, payload: dict) -> None:
        # A clause "struck down" according to a dissent was not struck down.
        # This flag is what stops that becoming a registry entry.
        opinions = parse_results(payload)
        dissents = [o for o in opinions if o.is_dissent]
        assert dissents, "fixture should contain at least one dissent"
        for dissent in dissents:
            assert dissent.opinion_type == "dissent"
        for other in opinions:
            if other.opinion_type in {"combined-opinion", "lead-opinion"}:
                assert not other.is_dissent

    def test_separate_writings_are_not_the_holding(self, payload: dict) -> None:
        # A dissent, a concurrence, or an opinion concurring in part decided
        # nothing. Extracting "the court refused to enforce this clause"
        # from one of them would be the worst error the registry can make.
        opinions = parse_results(payload)
        for opinion in opinions:
            kind = (opinion.opinion_type or "").lower()
            if kind in {"dissent", "concurrence-opinion", "in-part-opinion"}:
                assert not opinion.states_the_holding
            else:
                assert opinion.states_the_holding

    def test_an_unknown_opinion_type_is_treated_as_the_holding(self) -> None:
        # Erring towards inclusion: an unrecognised type is far more likely
        # to be a majority under a name we have not seen than a separate
        # writing, and the screening step still has to read it.
        payload = {
            "results": [
                {
                    "cluster_id": 1,
                    "caseName": "X v. Y",
                    "court_id": "tex",
                    "court": "Texas Supreme Court",
                    "dateFiled": "2020-01-01",
                    "absolute_url": "/opinion/1/x/",
                    "opinions": [{"id": 1, "type": "some-new-type"}],
                }
            ]
        }
        assert parse_results(payload)[0].states_the_holding

    def test_missing_citations_are_an_empty_list_not_a_failure(
        self, payload: dict
    ) -> None:
        # Most recent Texas appellate memoranda are unpublished and carry no
        # reporter citation. That is a fact about the corpus, and the reason
        # the Caselaw Access Project cannot substitute for this source.
        opinions = parse_results(payload)
        assert any(o.citations == [] for o in opinions)
        for opinion in opinions:
            assert isinstance(opinion.citations, list)

    def test_an_opinion_without_an_id_is_skipped_not_invented(self) -> None:
        # Nothing can be fetched or deduplicated without an identifier.
        broken = {
            "results": [
                {
                    "cluster_id": 1,
                    "caseName": "Broken v. Broken",
                    "court_id": "tex",
                    "court": "Texas Supreme Court",
                    "dateFiled": "2020-01-01",
                    "absolute_url": "/opinion/1/broken/",
                    "opinions": [{"type": "combined-opinion"}, {"id": 99}],
                }
            ]
        }
        opinions = parse_results(broken)
        assert [o.source_id for o in opinions] == ["99"]

    def test_a_malformed_date_does_not_raise(self) -> None:
        payload = {
            "results": [
                {
                    "cluster_id": 1,
                    "caseName": "X v. Y",
                    "court_id": "tex",
                    "court": "Texas Supreme Court",
                    "dateFiled": "not-a-date",
                    "absolute_url": "/opinion/1/x/",
                    "opinions": [{"id": 1, "type": "combined-opinion"}],
                }
            ]
        }
        assert parse_results(payload)[0].date_filed is None

    def test_an_empty_payload_yields_nothing(self) -> None:
        assert parse_results({}) == []
        assert parse_results({"results": []}) == []


class TestPagination:
    def test_the_cursor_is_read_from_the_next_url(self, payload: dict) -> None:
        # The cursor is opaque; reconstructing it would be guessing.
        cursor = next_cursor(payload)
        assert cursor
        assert "cursor=" not in cursor

    def test_no_next_url_means_the_end(self) -> None:
        assert next_cursor({"next": None}) is None
        assert next_cursor({}) is None


class TestQueryBuilding:
    def test_courts_are_space_separated(self) -> None:
        params = search_params('"express negligence"', ("tex", "texapp"))
        assert params["court"] == "tex texapp"
        assert params["type"] == "o"
        assert params["q"] == '"express negligence"'
        assert "cursor" not in params

    def test_a_cursor_is_passed_through_when_given(self) -> None:
        params = search_params("q", ("tex",), cursor="abc123")
        assert params["cursor"] == "abc123"
