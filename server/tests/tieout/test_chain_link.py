"""D4's store, walked at the route level: confirm once, arithmetic forever.

A confirmed link is human input, not engine output, so every test here
goes through the route a person's click would hit — a real deal, a real
extracted document, a real model cell — rather than constructing rows.

The cases that matter are the ones the contract was written to make
impossible: a link across two deals, a scale this code inferred, a
« proposed » state existing at all, and a stranger reading somebody
else's deal.
"""

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
