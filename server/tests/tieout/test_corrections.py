"""Accepting a correction, and taking it back out, through HTTP.

`test_write.py` proves a `.pptx` can be written. This proves the thing a
banker actually does: press Accept on a finding and have the deck in the
deal read the model's figure afterwards, with the drift gone from the
check and a way back.

The end-to-end shape matters more than any single assertion here. The
correction has to survive a re-run of the check that deletes and rebuilds
every finding, the file has to come back out of storage and go in again as
a new version, and the reader has to see the change — three separate
things, any of which failing leaves a button that looks like it worked.
"""

from pathlib import Path

import pytest
from httpx import AsyncClient

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    ArtifactKind,
    Dossier,
    DossierMember,
    DossierRole,
    User,
)
from polar.tieout.repository import TieOutRepository
from polar.tieout.service import tieout
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
DECK = CASCADE / "cascade_deck.pptx"
MODEL = CASCADE / "cascade_model.xlsx"


async def _loaded(
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
    await session.flush()

    for path, kind in ((MODEL, ArtifactKind.model), (DECK, ArtifactKind.deck)):
        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=kind,
            filename=path.name,
            payload=path.read_bytes(),
            user_id=owner.id,
        )
    await tieout.run_tieout(session, dossier_id=deal.id, user_id=owner.id)
    await session.flush()
    return deal


async def _drifts(client: AsyncClient, deal: Dossier) -> list[dict]:
    response = await client.get(
        f"/v1/tieout/deals/{deal.id}/findings", params={"kind": "drift"}
    )
    assert response.status_code == 200
    return [one for one in response.json() if not one["one_tick"]]


@pytest.mark.asyncio
class TestProposing:
    @pytest.mark.auth
    async def test_a_drift_becomes_a_proposal_with_both_sides_on_it(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]

        response = await client.post(f"/v1/tieout/findings/{finding['id']}/correction")

        assert response.status_code == 201
        correction = response.json()
        assert correction["state"] == "proposed"
        assert correction["before"] == finding["printed"]
        assert correction["after"] == finding["expected"]
        # Nothing has been written. « Proposed » is the whole point.
        assert correction["wrote_artifact_id"] is None

    @pytest.mark.auth
    async def test_proposing_twice_gives_the_same_proposal(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Otherwise a screen that proposes on open makes a row per visit,
        and a banker who has already accepted is offered a fresh proposal
        underneath the correction they made."""
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]

        first = await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        second = await client.post(f"/v1/tieout/findings/{finding['id']}/correction")

        assert first.json()["id"] == second.json()["id"]

    @pytest.mark.auth
    async def test_an_audit_finding_says_why_it_cannot_be_corrected(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """« The total on Model!D31 skips a row » is a defect in a formula.

        Writing a number over it would replace a broken formula with a
        hardcode, which is the defect the audit exists to find.
        """
        deal = await _loaded(session, save_fixture, user)
        await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()

        audit = (
            await client.get(
                f"/v1/tieout/deals/{deal.id}/findings", params={"kind": "audit"}
            )
        ).json()
        response = await client.post(f"/v1/tieout/findings/{audit[0]['id']}/correction")

        assert response.status_code == 422
        assert "model" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_finding_carries_its_correction(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A screen draws one row per finding and needs the state on it."""
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        assert finding["correction"] is None

        await client.post(f"/v1/tieout/findings/{finding['id']}/correction")

        again = next(
            one for one in await _drifts(client, deal) if one["id"] == finding["id"]
        )
        assert again["correction"]["state"] == "proposed"


@pytest.mark.asyncio
class TestAccepting:
    @pytest.mark.auth
    async def test_accepting_writes_the_deck_and_closes_the_finding(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The whole of phase 6 in one test.

        Accept produces a new version of the deck that reads the model's
        figure, and the drift is gone from the check because the deck now
        agrees — not because anything marked it settled.
        """
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        expected = finding["expected"]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()

        response = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "accept"}
        )

        assert response.status_code == 200
        correction = response.json()
        assert correction["state"] == "applied", correction["error"]
        assert correction["where"] == "file"
        assert correction["wrote_artifact_id"]
        assert correction["decided_by"]["id"] == str(user.id)

        # A new version of the same document, not a second document.
        repository = TieOutRepository.from_session(session)
        written = await repository.get_artifact(correction["wrote_artifact_id"])
        assert written is not None
        assert written.version == 2
        assert written.filename == "cascade_deck.pptx"

        # The reader sees the correction on the slide.
        figures = (
            await client.get(f"/v1/tieout/artifacts/{written.id}/figures")
        ).json()
        printed = [
            one["printed"]
            for slide in figures["slides"]
            if slide["page"] == finding["page"]
            for one in slide["figures"]
        ]
        assert expected in printed

        # And the drift is gone, because the deck agrees now.
        remaining = [one["id"] for one in await _drifts(client, deal)]
        assert finding["id"] not in remaining

    @pytest.mark.auth
    async def test_a_correction_outlives_the_finding_it_came_from(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Every run deletes its findings and writes them again.

        A correction hung on a finding's id would be gone the first time
        anybody pressed Re-check, and there would be nothing left saying
        the deck ever read $49.6mm.
        """
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()
        await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "accept"}
        )

        await client.post(f"/v1/tieout/deals/{deal.id}/check")

        corrections = (
            await client.get(f"/v1/tieout/deals/{deal.id}/corrections")
        ).json()
        assert [one["id"] for one in corrections] == [proposal["id"]]
        assert corrections[0]["state"] == "applied"

    @pytest.mark.auth
    async def test_undo_puts_the_figure_back(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """We hold both sides of every change, which is why a format with
        no revision model still gets a reversible edit."""
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()
        await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "accept"}
        )

        response = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "reverse"}
        )

        assert response.status_code == 200
        assert response.json()["state"] == "reversed", response.json()["error"]

        # Version 3: the deck goes forward to go back. Every step is on
        # the record and no version is ever overwritten.
        repository = TieOutRepository.from_session(session)
        written = await repository.get_artifact(response.json()["wrote_artifact_id"])
        assert written is not None
        assert written.version == 3

        figures = (
            await client.get(f"/v1/tieout/artifacts/{written.id}/figures")
        ).json()
        printed = [
            one["printed"]
            for slide in figures["slides"]
            if slide["page"] == finding["page"]
            for one in slide["figures"]
        ]
        assert finding["printed"] in printed

    @pytest.mark.auth
    async def test_keeping_the_deck_does_not_dismiss_the_finding(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """« The deck is right » and « stop telling me about this » are
        different sentences, and a banker who says the first and gets the
        second stops being told about a figure they meant to leave."""
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()

        response = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "reject"}
        )

        assert response.json()["state"] == "rejected"
        still_there = next(
            one for one in await _drifts(client, deal) if one["id"] == finding["id"]
        )
        assert still_there["state"] == "open"

    @pytest.mark.auth
    async def test_undoing_a_keep_puts_the_proposal_back(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The design's Undo, on the branch where nothing was written.

        And it is refused on the branch where something was — that file
        has changed, and tearing up the note would say it had not.
        """
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()
        await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "reject"}
        )

        back = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "propose"}
        )
        assert back.json()["state"] == "proposed"

        await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "accept"}
        )
        refused = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "propose"}
        )
        assert refused.status_code == 422

    @pytest.mark.auth
    async def test_a_correction_says_which_cell_it_will_tie_to(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """« Slide 3 now reads $48.9mm and ties to Model!D26 » is the
        design's own sentence, and the cell has to survive the run that
        deletes the finding it came from."""
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()
        assert proposal["source"] == finding["source"]["ref"]

        await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "accept"}
        )
        corrections = (
            await client.get(f"/v1/tieout/deals/{deal.id}/corrections")
        ).json()
        assert corrections[0]["source"] == proposal["source"]

    @pytest.mark.auth
    async def test_the_panel_records_a_write_it_made_in_the_document(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The banker's own copy is the one that gets sent.

        When the panel writes the change through Office, the bytes never
        come here — so the record says `document`, and undoing it from the
        workspace is refused with the place to do it instead.
        """
        deal = await _loaded(session, save_fixture, user)
        finding = (await _drifts(client, deal))[0]
        proposal = (
            await client.post(f"/v1/tieout/findings/{finding['id']}/correction")
        ).json()

        applied = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "applied"}
        )
        assert applied.json()["state"] == "applied"
        assert applied.json()["where"] == "document"
        assert applied.json()["wrote_artifact_id"] is None

        refused = await client.post(
            f"/v1/tieout/corrections/{proposal['id']}", json={"action": "reverse"}
        )
        assert refused.status_code == 422
        assert "panel" in refused.json()["detail"]


@pytest.mark.asyncio
class TestAccess:
    @pytest.mark.auth
    async def test_corrections_on_a_deal_you_are_not_on_do_not_exist(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        stranger = await create_user(save_fixture)
        deal = await _loaded(session, save_fixture, stranger)
        repository = TieOutRepository.from_session(session)
        findings = await repository.findings_of(deal.id)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )

        assert (
            await client.get(f"/v1/tieout/deals/{deal.id}/corrections")
        ).status_code == 404
        assert (
            await client.post(f"/v1/tieout/findings/{findings[0].id}/correction")
        ).status_code == 404
        assert (
            await client.get(f"/v1/tieout/artifacts/{deck.id}/download")
        ).status_code == 404


@pytest.mark.asyncio
class TestTheFileItself:
    @pytest.mark.auth
    async def test_the_corrected_deck_can_be_downloaded(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A correction that cannot leave the building is not a correction."""
        deal = await _loaded(session, save_fixture, user)
        repository = TieOutRepository.from_session(session)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )

        response = await client.get(f"/v1/tieout/artifacts/{deck.id}/download")

        assert response.status_code == 200
        assert response.json()["filename"] == "cascade_deck.pptx"
        assert response.json()["url"].startswith("http")
