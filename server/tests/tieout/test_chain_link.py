"""D4's store, walked at the route level: confirm once, arithmetic forever.

A confirmed link is human input, not engine output, so every test here
goes through the route a person's click would hit — a real deal, a real
extracted document, a real model cell — rather than constructing rows.

The cases that matter are the ones the contract was written to make
impossible: a link across two deals, a scale this code inferred, a
« proposed » state existing at all, and a stranger reading somebody
else's deal.
"""

from decimal import Decimal
from uuid import UUID

import pytest
from httpx import AsyncClient

from polar.kit.db.postgres import AsyncSession
from polar.models import User
from polar.tieout.chain.link import LinkState
from polar.tieout.repository import TieOutRepository
from tests.fixtures.database import SaveFixture
from tests.tieout.test_chain_propose import _model_cell
from tests.tieout.test_chain_store import _deal_for, _uploaded_pdf


async def _fact_and_cell(
    client: AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    user: User,
    *,
    row_label: str = "Revenue",
) -> tuple[dict, object]:
    """One extracted document fact and one model cell on the same deal."""
    artifact_id = await _uploaded_pdf(client, session, save_fixture, user)
    await client.post(f"/v1/chain/documents/{artifact_id}/extract")
    facts = (await client.get(f"/v1/chain/documents/{artifact_id}/facts")).json()
    pdf = await TieOutRepository.from_session(session).get_artifact(UUID(artifact_id))
    assert pdf is not None
    cell = await _model_cell(session, pdf.dossier_id, user, row_label=row_label)
    return facts["facts"][0], cell


@pytest.mark.asyncio
class TestConfirming:
    @pytest.mark.auth
    async def test_a_person_confirms_and_everything_the_recheck_needs_is_kept(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The whole point: after this row exists, re-checking is arithmetic.

        So both anchors and both values must be on it — the anchors to
        re-find the pair in a later version, the values to say which
        side moved.
        """
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)

        response = await client.post(
            "/v1/chain/links",
            json={"cell_id": str(cell.id), "fact_id": fact["id"], "scale": 1.0},
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["state"] == "confirmed"
        # the anchors: labels, not coordinates
        assert body["document"]["anchor_line"] == fact["line"]
        assert body["model"]["cell_name"]
        # the citations, kept but never used to locate
        assert body["document"]["page"] == fact["page"]
        assert body["model"]["ref"] == "Model!D26"
        # the amendment: both sides' values at confirmation
        assert body["document"]["value_at_confirmation"] == fact["value"]
        assert body["model"]["value_at_confirmation"] == 1234.5
        assert body["confirmed_by_id"] == str(user.id)

    @pytest.mark.auth
    async def test_confirming_the_same_pair_twice_updates_one_row(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Two contradictory rows for one pair would be a bug a person
        could never see, so the second confirmation edits the first."""
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)
        payload = {"cell_id": str(cell.id), "fact_id": fact["id"]}

        first = await client.post("/v1/chain/links", json=payload)
        second = await client.post(
            "/v1/chain/links", json={**payload, "note": "checked against schedule 3"}
        )

        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] == second.json()["id"]
        assert second.json()["note"] == "checked against schedule 3"

    @pytest.mark.auth
    async def test_a_scale_of_zero_is_refused_in_words(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Scale is stated by the person and multiplies; zero is not a
        statement about units, it is a way to make anything tie out."""
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)

        response = await client.post(
            "/v1/chain/links",
            json={"cell_id": str(cell.id), "fact_id": fact["id"], "scale": 0},
        )

        assert response.status_code == 422
        assert "greater than zero" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_cell_with_no_value_has_nothing_to_confirm(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        fact, _ = await _fact_and_cell(client, session, save_fixture, user)
        pdf_id = fact["document_version_id"]
        pdf = await TieOutRepository.from_session(session).get_artifact(UUID(pdf_id))
        assert pdf is not None
        empty = await _model_cell(
            session, pdf.dossier_id, user, row_label="Revenue", value=None
        )

        response = await client.post(
            "/v1/chain/links",
            json={"cell_id": str(empty.id), "fact_id": fact["id"]},
        )

        assert response.status_code == 409
        assert "nothing to confirm" in response.json()["detail"]


@pytest.mark.asyncio
class TestReading:
    @pytest.mark.auth
    async def test_the_deals_links_come_back_newest_first(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)
        await client.post(
            "/v1/chain/links", json={"cell_id": str(cell.id), "fact_id": fact["id"]}
        )
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(fact["document_version_id"])
        )
        assert pdf is not None

        response = await client.get(f"/v1/chain/dossiers/{pdf.dossier_id}/links")

        assert response.status_code == 200, response.text
        assert len(response.json()) == 1
        assert response.json()[0]["model"]["ref"] == "Model!D26"

    @pytest.mark.auth
    async def test_there_is_no_proposed_state_and_asking_says_so(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A proposal is computed on demand and never stored — so the
        absence of that state is part of the contract, and the refusal
        explains it rather than returning an empty list."""
        fact, _ = await _fact_and_cell(client, session, save_fixture, user)
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(fact["document_version_id"])
        )
        assert pdf is not None

        response = await client.get(
            f"/v1/chain/dossiers/{pdf.dossier_id}/links?state=proposed"
        )

        assert response.status_code == 422
        assert "no 'proposed'" in response.json()["detail"]
        assert "computed on demand" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_stranger_cannot_read_a_deals_links(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        """A link is a person's statement about a deal; a deal id must
        never be a capability to read one."""
        stranger_deal = await _deal_for(session, save_fixture, user_second)

        response = await client.get(f"/v1/chain/dossiers/{stranger_deal.id}/links")

        assert response.status_code == 404


@pytest.mark.asyncio
class TestTheStatesThemselves:
    async def test_the_states_are_exactly_the_four_registered(self) -> None:
        """No « proposed », and the three non-confirmed ones are set by
        re-anchoring rather than by any matcher."""
        assert [state.value for state in LinkState] == [
            "confirmed",
            "rejected",
            "broken",
            "ambiguous",
        ]


@pytest.mark.asyncio
class TestTheOrdinalTiebreak:
    async def test_two_identical_lines_are_numbered_separately(self) -> None:
        """The tiebreak only works if both sides count the same way.

        This route's first cut numbered every fact on the page whose
        line *text* matched, so a page carrying the same row twice —
        « Total - - - » in two blocks — numbered them 1, 2, 3, 4 across
        both instead of 1, 2 and 1, 2. Re-anchoring counts by physical
        line, so the tiebreak would then never match and every such
        link would come back ambiguous.

        The route now calls `with_ordinals`, which is where that rule
        lives and where it was already fixed once.
        """
        from polar.tieout.chain.anchor import with_ordinals

        class _Fact:
            def __init__(self, page: int, line: str, value: float, text: str) -> None:
                self.page, self.line, self.value, self.text = page, line, value, text

        same = "Total 1.0 2.0"
        page = [
            _Fact(1, same, 1.0, "1.0"),
            _Fact(1, same, 2.0, "2.0"),
            _Fact(1, "Revenue 9.0", 9.0, "9.0"),
            _Fact(1, same, 1.0, "1.0"),  # the same row again, lower down
            _Fact(1, same, 2.0, "2.0"),
        ]

        ordinals = [ordinal for _, _, ordinal, _, _ in with_ordinals(page)]

        assert ordinals == [1, 2, 1, 1, 2]
        # and the by-text derivation this replaced would have said:
        assert ordinals != [1, 2, 1, 3, 4]


@pytest.mark.asyncio
class TestTheRecheck:
    """« Confirm once, arithmetic forever » — the forever half.

    Each case plants a revision and asserts the verdict the D4 contract
    registered for it, through the route rather than the pure function,
    so the store and the anchoring are tested together.
    """

    @pytest.mark.auth
    async def test_nothing_changed_agrees_and_says_nothing(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)
        confirmed = await client.post(
            "/v1/chain/links",
            json={
                "cell_id": str(cell.id),
                "fact_id": fact["id"],
                "scale": 1234.5 / fact["value"],
            },
        )
        assert confirmed.status_code == 201, confirmed.text
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(fact["document_version_id"])
        )
        assert pdf is not None

        response = await client.post(
            f"/v1/chain/dossiers/{pdf.dossier_id}/recheck"
            f"?model_version_id={cell.artifact_id}"
            f"&document_version_id={pdf.id}"
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["checked"] == 1
        assert body["tallies"] == {"agrees": 1}
        assert body["results"][0]["ties_out_now"] is True
        assert body["results"][0]["detail"] == ""
        #: structural, not a runtime count: the package imports no
        #: model client, so after confirmation nothing is inferred.
        assert body["model_calls"] == 0

    @pytest.mark.auth
    async def test_the_model_moved_is_reported_with_both_numbers(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The cell changed and its source did not — the finding a
        reviewer wants, with the numbers in the sentence so nobody has
        to go and look them up."""
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)
        await client.post(
            "/v1/chain/links",
            json={"cell_id": str(cell.id), "fact_id": fact["id"], "scale": 1.0},
        )
        cell.value = Decimal("9999.0")
        session.add(cell)
        await session.flush()
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(fact["document_version_id"])
        )
        assert pdf is not None

        response = await client.post(
            f"/v1/chain/dossiers/{pdf.dossier_id}/recheck"
            f"?model_version_id={cell.artifact_id}"
            f"&document_version_id={pdf.id}"
        )

        assert response.status_code == 200, response.text
        result = response.json()["results"][0]
        assert result["verdict"] == "the model moved"
        assert "1234.5" in result["detail"]
        assert "9999" in result["detail"]
        assert "no longer ties out" in result["detail"]

    @pytest.mark.auth
    async def test_a_renamed_cell_is_broken_never_silently_repointed(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A wrongly re-pointed link is worse than a broken one, because
        nobody goes looking for it."""
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)
        await client.post(
            "/v1/chain/links",
            json={"cell_id": str(cell.id), "fact_id": fact["id"]},
        )
        cell.row_label = "Turnover"
        cell.name = "Turnover"
        session.add(cell)
        await session.flush()
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(fact["document_version_id"])
        )
        assert pdf is not None

        response = await client.post(
            f"/v1/chain/dossiers/{pdf.dossier_id}/recheck"
            f"?model_version_id={cell.artifact_id}"
            f"&document_version_id={pdf.id}"
        )

        result = response.json()["results"][0]
        assert result["verdict"] == "broken"
        assert "has nothing to point at" in result["detail"]
        assert result["ties_out_now"] is None

    @pytest.mark.auth
    async def test_a_version_from_another_deal_is_refused(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(fact["document_version_id"])
        )
        assert pdf is not None
        stranger = await _deal_for(session, save_fixture, user_second)
        other_cell = await _model_cell(
            session, stranger.id, user_second, row_label="Revenue"
        )

        response = await client.post(
            f"/v1/chain/dossiers/{pdf.dossier_id}/recheck"
            f"?model_version_id={other_cell.artifact_id}"
            f"&document_version_id={pdf.id}"
        )

        assert response.status_code == 404
        assert "not on this deal" in response.json()["detail"]


@pytest.mark.asyncio
class TestTheCreditConvention:
    @pytest.mark.auth
    async def test_a_link_confirmed_with_an_unnamed_transformation_is_refused(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """One vocabulary across both tracks: the registry names what a
        person may state, and anything else is refused in words rather
        than stored as a meaningless string."""
        fact, cell = await _fact_and_cell(client, session, save_fixture, user)

        response = await client.post(
            "/v1/chain/links",
            json={
                "cell_id": str(cell.id),
                "fact_id": fact["id"],
                "transformation": "reciprocal",
            },
        )

        assert response.status_code == 422
        assert "not a named transformation" in response.text
        assert "negate" in response.text
