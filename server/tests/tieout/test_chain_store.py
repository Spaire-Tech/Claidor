"""D2's promise, held over HTTP: fact id ⇒ page + box, and nothing leaks.

The document is the same hand-assembled three-page PDF the extraction
tests use — four numbers at known coordinates, a scan page, a blank
page — uploaded through the engine's own artifacts route so the test
walks the real path: upload, store, extract into rows, serve back.

The access tests matter most, as everywhere in this workspace: a fact
id is a capability to ask, never to see. A stranger holding a real
fact id gets the same 404 a made-up id gets.
"""

from pathlib import Path

import pytest
from httpx import AsyncClient

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    Dossier,
    DossierMember,
    DossierRole,
    User,
    UserOrganization,
)
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user
from tests.tieout.test_chain_extract import _fixture_pdf

NOWHERE = "00000000-0000-0000-0000-000000000000"
PDF_MEDIA = "application/pdf"
DECK = Path(__file__).resolve().parents[2] / "scripts" / "cascade" / "cascade_deck.pptx"
DECK_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


async def _deal_for(
    session: AsyncSession, save_fixture: SaveFixture, owner: User
) -> Dossier:
    organization = await create_organization(save_fixture)
    deal = Dossier(
        organization_id=organization.id,
        name="Project Cascade",
        client_name="Cascade Industrial Holdings",
        created_by_id=owner.id,
    )
    session.add(deal)
    await session.flush()
    session.add(
        DossierMember(dossier_id=deal.id, user_id=owner.id, role=DossierRole.lead)
    )
    session.add(UserOrganization(user_id=owner.id, organization_id=organization.id))
    await session.flush()
    return deal


async def _uploaded_pdf(
    client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, owner: User
) -> str:
    """A term sheet in a deal, through the real upload route; its id."""
    deal = await _deal_for(session, save_fixture, owner)
    await session.flush()
    response = await client.post(
        f"/v1/tieout/deals/{deal.id}/artifacts",
        files={"file": ("term_sheet.pdf", _fixture_pdf(), PDF_MEDIA)},
    )
    assert response.status_code == 200, response.text
    return str(response.json()["id"])


@pytest.mark.asyncio
class TestExtractDocument:
    @pytest.mark.auth
    async def test_facts_and_refusals_are_written_and_returned(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)

        response = await client.post(f"/v1/chain/documents/{artifact_id}/extract")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["document_version_id"] == artifact_id
        assert [f["value"] for f in body["facts"]] == [1234.5, -2340.0, 45.0, 3.0]
        first = body["facts"][0]
        assert first["page"] == 1
        assert first["text"] == "1,234.5"
        assert first["line"] == "Revenue 1,234.5"
        assert first["box"]["x1"] > first["box"]["x0"] > 72
        assert first["extractor"]["name"].endswith("chain.extract")
        assert [r["page"] for r in body["refusals"]] == [2]
        assert "scan" in body["refusals"][0]["reason"]

    @pytest.mark.auth
    async def test_running_twice_is_running_once(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Deterministic ids: re-extraction rewrites the same rows.

        D4's confirmed links will hang off fact ids, so the id of « the
        1,234.5 on page 1 of this version » must not move when somebody
        clicks extract again.
        """
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)

        first = await client.post(f"/v1/chain/documents/{artifact_id}/extract")
        second = await client.post(f"/v1/chain/documents/{artifact_id}/extract")

        assert first.status_code == second.status_code == 200
        assert [f["id"] for f in first.json()["facts"]] == [
            f["id"] for f in second.json()["facts"]
        ]

    @pytest.mark.auth
    async def test_a_deck_is_not_extractable_here(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_for(session, save_fixture, user)
        await session.flush()
        response = await client.post(
            f"/v1/tieout/deals/{deal.id}/artifacts",
            files={"file": ("deck.pptx", DECK.read_bytes(), DECK_MEDIA)},
        )
        assert response.status_code == 200
        deck_id = response.json()["id"]

        refused = await client.post(f"/v1/chain/documents/{deck_id}/extract")
        assert refused.status_code == 415
        assert "not a PDF" in refused.json()["detail"]


@pytest.mark.asyncio
class TestServing:
    @pytest.mark.auth
    async def test_fact_id_serves_page_and_box(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)
        extracted = await client.post(f"/v1/chain/documents/{artifact_id}/extract")
        fact = extracted.json()["facts"][1]  # (2,340), the accounting negative

        response = await client.get(f"/v1/chain/facts/{fact['id']}")

        assert response.status_code == 200
        served = response.json()
        assert served == fact
        assert served["page"] == 1
        assert served["value"] == -2340.0
        assert served["line"] == "Loss (2,340) recorded"
        assert served["box"]["bottom"] > served["box"]["top"]
        assert served["page_height"] == 792.0

    @pytest.mark.auth
    async def test_a_document_serves_its_whole_record(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)
        await client.post(f"/v1/chain/documents/{artifact_id}/extract")

        response = await client.get(f"/v1/chain/documents/{artifact_id}/facts")

        assert response.status_code == 200
        body = response.json()
        assert len(body["facts"]) == 4
        assert [r["page"] for r in body["refusals"]] == [2]
        assert body["document_version_id"] == artifact_id

    @pytest.mark.auth
    async def test_an_unextracted_document_serves_an_empty_record(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)

        response = await client.get(f"/v1/chain/documents/{artifact_id}/facts")

        assert response.status_code == 200
        assert response.json()["facts"] == []
        assert response.json()["refusals"] == []


@pytest.mark.asyncio
class TestAccess:
    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        assert (await client.get(f"/v1/chain/facts/{NOWHERE}")).status_code == 401
        assert (
            await client.post(f"/v1/chain/documents/{NOWHERE}/extract")
        ).status_code == 401

    @pytest.mark.auth
    async def test_a_stranger_gets_404_not_403(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A real fact id in someone else's deal answers like a fake one."""
        from polar.models.tieout import ArtifactKind
        from polar.tieout.service import tieout

        stranger = await create_user(save_fixture)
        deal = await _deal_for(session, save_fixture, stranger)
        artifact = await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=ArtifactKind.source,
            filename="term_sheet.pdf",
            payload=_fixture_pdf(),
            user_id=stranger.id,
        )
        await session.flush()

        # The caller (`user`) is not on the stranger's deal.
        extract = await client.post(f"/v1/chain/documents/{artifact.id}/extract")
        assert extract.status_code == 404

        listing = await client.get(f"/v1/chain/documents/{artifact.id}/facts")
        assert listing.status_code == 404

    @pytest.mark.auth
    async def test_a_made_up_fact_is_not_found(self, client: AsyncClient) -> None:
        assert (await client.get(f"/v1/chain/facts/{NOWHERE}")).status_code == 404
