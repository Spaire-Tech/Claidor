"""The routes, through HTTP, where the promises are actually kept.

``test_spine.py`` proves the engine survives the trip into the tables.
What is left to prove is the part that only exists once there is a request
attached: that a deal is closed to everyone not on it, that an upload the
reader cannot use is refused with a sentence rather than a stack trace,
and that the shapes the founder is building screens against are the shapes
that come back.

The access tests are the ones worth reading twice. Every route here takes
a deal id or something reachable from one, and a single route that checks
the scope and forgets the membership is the widest hole this product could
have.
"""

from pathlib import Path

import pytest
from httpx import AsyncClient

from polar.auth.scope import Scope
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
CLEAN = CASCADE / "cascade_deck.pptx"
MODEL = CASCADE / "cascade_model.xlsx"

DECK_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
NOWHERE = "00000000-0000-0000-0000-000000000000"


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
    await session.flush()
    return deal


async def _loaded(
    session: AsyncSession, save_fixture: SaveFixture, owner: User
) -> Dossier:
    deal = await _deal_for(session, save_fixture, owner)
    for path, kind in ((MODEL, ArtifactKind.model), (CLEAN, ArtifactKind.deck)):
        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=kind,
            filename=path.name,
            payload=path.read_bytes(),
            user_id=owner.id,
        )
    await tieout.run_tieout(session, dossier_id=deal.id, user_id=owner.id)
    await tieout.run_audit(session, dossier_id=deal.id, user_id=owner.id)
    await session.flush()
    return deal


@pytest.mark.asyncio
class TestAccess:
    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        response = await client.get(f"/v1/tieout/deals/{NOWHERE}")
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_a_deal_you_are_not_on_does_not_exist(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """404, not 403.

        A banker outside the deal should not learn that it exists, which
        is the same rule the rest of the workspace follows and the reason
        organization membership grants nothing here.
        """
        stranger = await create_user(save_fixture)
        deal = await _loaded(session, save_fixture, stranger)

        assert (await client.get(f"/v1/tieout/deals/{deal.id}")).status_code == 404
        assert (
            await client.get(f"/v1/tieout/deals/{deal.id}/findings")
        ).status_code == 404
        assert (
            await client.get(f"/v1/tieout/deals/{deal.id}/links")
        ).status_code == 404
        assert (
            await client.post(f"/v1/tieout/deals/{deal.id}/check")
        ).status_code == 404

    @pytest.mark.auth
    async def test_a_file_in_someone_elses_deal_does_not_exist_either(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """The routes that take an artifact id reach a deal too.

        Checking the deal on the deal routes and forgetting it on these
        would leave every figure in the workspace readable by id.
        """
        stranger = await create_user(save_fixture)
        deal = await _loaded(session, save_fixture, stranger)
        repository = TieOutRepository.from_session(session)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )

        assert (await client.get(f"/v1/tieout/artifacts/{deck.id}")).status_code == 404
        assert (
            await client.get(f"/v1/tieout/artifacts/{deck.id}/figures")
        ).status_code == 404
        assert (
            await client.delete(f"/v1/tieout/artifacts/{deck.id}")
        ).status_code == 404

    @pytest.mark.auth
    async def test_a_finding_and_its_chain_are_closed_as_well(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        stranger = await create_user(save_fixture)
        deal = await _loaded(session, save_fixture, stranger)
        repository = TieOutRepository.from_session(session)
        finding = (await repository.findings_of(deal.id))[0]
        link = (await repository.links_of(deal.id))[0]

        assert (
            await client.get(f"/v1/tieout/findings/{finding.id}/chain")
        ).status_code == 404
        assert (await client.get(f"/v1/tieout/links/{link.id}")).status_code == 404
        assert (
            await client.patch(
                f"/v1/tieout/findings/{finding.id}", json={"state": "dismissed"}
            )
        ).status_code == 404


@pytest.mark.asyncio
class TestTheDataRoom:
    """The room pages, folds versions, and says how much it is not showing."""

    @pytest.mark.auth
    async def test_it_pages_and_says_how_many_there_are(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_for(session, save_fixture, user)
        for index in range(7):
            await tieout.ingest(
                session,
                dossier_id=deal.id,
                kind=ArtifactKind.source,
                filename=f"note {index}.txt",
                payload=b"not readable, and that is a state of the deal",
                user_id=user.id,
            )
        await session.flush()

        first = await client.get(
            f"/v1/tieout/deals/{deal.id}/artifacts", params={"limit": 3}
        )
        assert first.status_code == 200
        page = first.json()
        assert len(page["items"]) == 3
        # The total rides with the page, so the screen can write « 3 of 7 »
        # rather than quietly implying it has them all.
        assert page["total"] == 7

        rest = await client.get(
            f"/v1/tieout/deals/{deal.id}/artifacts",
            params={"limit": 100, "offset": 3},
        )
        assert len(rest.json()["items"]) == 4

    @pytest.mark.auth
    async def test_a_re_upload_is_one_row_not_two(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_for(session, save_fixture, user)
        for _ in range(3):
            await tieout.ingest(
                session,
                dossier_id=deal.id,
                kind=ArtifactKind.model,
                filename=MODEL.name,
                payload=MODEL.read_bytes(),
                user_id=user.id,
            )
        await session.flush()

        page = (
            await client.get(f"/v1/tieout/deals/{deal.id}/artifacts")
        ).json()
        assert page["total"] == 1
        assert len(page["items"]) == 1
        # Folded on the server, so the count and the rows agree — a client
        # that pages and folds can do neither.
        assert page["items"][0]["version"] == 3

    @pytest.mark.auth
    async def test_it_searches_on_the_name(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        page = (
            await client.get(
                f"/v1/tieout/deals/{deal.id}/artifacts", params={"q": "deck"}
            )
        ).json()
        assert page["total"] == 1
        assert "deck" in page["items"][0]["filename"]


@pytest.mark.asyncio
class TestTheDealPage:
    @pytest.mark.auth
    async def test_it_answers_in_one_request(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        response = await client.get(f"/v1/tieout/deals/{deal.id}")

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Project Cascade"
        # The deal's spine — the documents it is built on — and counts
        # for the room, rather than the room itself.
        assert len(body["documents"]) == 2
        assert {one["kind"] for one in body["documents"]} == {"model", "deck"}
        assert body["files"] == 2
        assert body["lineages"] == 2
        assert body["coverage"]["reconciled"] == 102
        assert body["coverage"]["drifting"] == 8
        # The coverage line carries its own misses, with reasons.
        assert body["coverage"]["unlinked"] > 0
        assert body["coverage"]["reasons"][0]["count"] > 0
        # Eight drifts from the tie-out and one smell from the audit. Both
        # checks ran, and their findings live in one list.
        assert body["findings"]["open"] == 9
        assert body["last_tieout"]["status"] == "done"
        assert body["last_audit"]["status"] == "done"

    @pytest.mark.auth
    async def test_an_empty_deal_is_not_an_error(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A deal with no files is the first screen anybody sees."""
        deal = await _deal_for(session, save_fixture, user)
        await session.flush()
        response = await client.get(f"/v1/tieout/deals/{deal.id}")

        assert response.status_code == 200
        body = response.json()
        assert body["documents"] == []
        assert body["files"] == 0
        assert body["coverage"]["reconciled"] == 0
        assert body["last_tieout"] is None


@pytest.mark.asyncio
class TestUpload:
    @pytest.mark.auth
    async def test_a_deck_is_read_on_the_way_in(
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
            files={"file": ("cascade_deck.pptx", CLEAN.read_bytes(), DECK_MEDIA)},
        )

        assert response.status_code == 200
        body = response.json()
        # The kind was not passed; it came from the extension.
        assert body["kind"] == "deck"
        assert body["status"] == "ready"
        assert body["version"] == 1
        assert body["counts"]["figures"] > 0
        assert body["uploaded_by"]["id"] == str(user.id)

    @pytest.mark.auth
    async def test_a_file_nobody_can_read_is_refused_in_words(
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
            files={"file": ("notes.txt", b"hello", "text/plain")},
        )

        assert response.status_code == 415
        assert "models are .xlsx" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_file_that_fails_to_parse_is_kept_with_its_reason(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """200, not 400. « This one did not work » is a state of the deal.

        The screen has to be able to show the file and what to do about it,
        which is impossible if the request failed and nothing was written.
        """
        deal = await _deal_for(session, save_fixture, user)
        await session.flush()

        response = await client.post(
            f"/v1/tieout/deals/{deal.id}/artifacts",
            files={"file": ("model.xlsx", b"not a workbook", "application/zip")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "failed"
        assert "Excel" in body["error"]


@pytest.mark.asyncio
class TestFindingsAndTheChain:
    @pytest.mark.auth
    async def test_the_findings_carry_where_and_what_the_model_says(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        response = await client.get(
            f"/v1/tieout/deals/{deal.id}/findings", params={"kind": "drift"}
        )

        assert response.status_code == 200
        findings = response.json()
        assert len(findings) == 8
        first = findings[0]
        assert first["printed"]
        assert first["expected"]
        assert first["where"]["filename"] == "cascade_deck.pptx"
        assert first["where"]["label"].startswith("slide ")
        assert first["source"]["ref"]
        # A one-tick difference is shown and ranked last, never hidden.
        assert [one["one_tick"] for one in findings] == sorted(
            one["one_tick"] for one in findings
        )

    @pytest.mark.auth
    async def test_the_panel_can_ask_for_one_document(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        repository = TieOutRepository.from_session(session)
        model = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.model
        )
        response = await client.get(
            f"/v1/tieout/deals/{deal.id}/findings",
            params={"artifact_id": str(model.id)},
        )

        assert response.status_code == 200
        # The drifts belong to the deck, so the model's list is its audit's.
        assert all(one["kind"] != "drift" for one in response.json())

    @pytest.mark.auth
    async def test_dismissing_is_visible_and_reversible(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        findings = (await client.get(f"/v1/tieout/deals/{deal.id}/findings")).json()
        target = findings[0]["id"]

        dismissed = await client.patch(
            f"/v1/tieout/findings/{target}", json={"state": "dismissed"}
        )
        assert dismissed.status_code == 200
        assert dismissed.json()["state"] == "dismissed"

        back = await client.patch(
            f"/v1/tieout/findings/{target}", json={"state": "open"}
        )
        assert back.json()["state"] == "open"

    @pytest.mark.auth
    async def test_the_chain_reaches_the_model(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        findings = (await client.get(f"/v1/tieout/deals/{deal.id}/findings")).json()

        response = await client.get(f"/v1/tieout/findings/{findings[0]['id']}/chain")

        assert response.status_code == 200
        steps = response.json()["steps"]
        assert steps[0]["kind"] == "figure"
        assert any(step["kind"] in {"cell", "input"} for step in steps)
        assert response.json()["summary"]


@pytest.mark.asyncio
class TestTheConfirmationQueue:
    @pytest.mark.auth
    async def test_a_link_carries_both_sides(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        response = await client.get(
            f"/v1/tieout/deals/{deal.id}/links", params={"state": "proposed"}
        )

        assert response.status_code == 200
        links = response.json()
        assert links
        first = links[0]
        assert first["figure"]["printed"]
        assert first["cell"]["ref"]
        assert first["transformation"] == "identity"
        # Ordered by confidence, so the easy ones clear first.
        assert links[0]["confidence"] >= links[-1]["confidence"]

    @pytest.mark.auth
    async def test_one_link_offers_the_runners_up(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        links = (await client.get(f"/v1/tieout/deals/{deal.id}/links")).json()

        response = await client.get(f"/v1/tieout/links/{links[0]['id']}")

        assert response.status_code == 200
        alternatives = response.json()["alternatives"]
        # Never the cell already chosen — that is not an alternative.
        assert all(one["cell_id"] != links[0]["cell"]["id"] for one in alternatives)

    @pytest.mark.auth
    async def test_confirming_records_who_and_when(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        links = (await client.get(f"/v1/tieout/deals/{deal.id}/links")).json()

        response = await client.patch(
            f"/v1/tieout/links/{links[0]['id']}", json={"state": "confirmed"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["state"] == "confirmed"
        assert body["confirmed_by"]["id"] == str(user.id)
        assert body["confirmed_at"] is not None

    @pytest.mark.auth
    async def test_pointing_it_somewhere_else_stops_being_a_score(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """A banker's answer is not a 0.62. It is the answer."""
        deal = await _loaded(session, save_fixture, user)
        links = (await client.get(f"/v1/tieout/deals/{deal.id}/links")).json()
        target = next(one for one in links if one["confidence"] < 1)

        cells = (
            await client.get(
                f"/v1/tieout/artifacts/{target['cell']['artifact_id']}/cells",
                params={"q": "EBITDA"},
            )
        ).json()
        elsewhere = next(one for one in cells if one["id"] != target["cell"]["id"])

        response = await client.patch(
            f"/v1/tieout/links/{target['id']}",
            json={"state": "confirmed", "cell_id": elsewhere["id"]},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["cell"]["ref"] == elsewhere["ref"]
        assert body["confidence"] == 1.0

    @pytest.mark.auth
    async def test_a_cell_from_another_deal_is_refused(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        mine = await _loaded(session, save_fixture, user)
        theirs = await _loaded(session, save_fixture, user)
        repository = TieOutRepository.from_session(session)
        other_model = next(
            one
            for one in await repository.current_artifacts(theirs.id)
            if one.kind is ArtifactKind.model
        )
        foreign = (await repository.cells_of(other_model.id))[0]
        link = (await repository.links_of(mine.id))[0]

        response = await client.patch(
            f"/v1/tieout/links/{link.id}",
            json={"state": "confirmed", "cell_id": str(foreign.id)},
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestTheFigureMap:
    @pytest.mark.auth
    async def test_every_figure_appears_and_the_misses_say_why(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)
        repository = TieOutRepository.from_session(session)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )

        response = await client.get(f"/v1/tieout/artifacts/{deck.id}/figures")

        assert response.status_code == 200
        body = response.json()
        shown = [one for slide in body["slides"] for one in slide["figures"]]
        assert len(shown) == deck.counts["figures"]
        assert {one["state"] for one in shown} <= {
            "agreeing",
            "drifting",
            "confirmed",
            "unlinked",
        }
        unlinked = [one for one in shown if one["state"] == "unlinked"]
        assert unlinked
        assert all(one["reason"] for one in unlinked)


@pytest.mark.asyncio
class TestThePanel:
    @pytest.mark.auth
    async def test_a_stamped_document_needs_no_guessing(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The lineage id travels inside the file and is not a guess."""
        deal = await _loaded(session, save_fixture, user)
        repository = TieOutRepository.from_session(session)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )

        response = await client.post(
            "/v1/tieout/identify", json={"lineage_id": str(deck.lineage_id)}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["matched_by"] == "stamp"
        assert body["artifact"]["id"] == str(deck.id)
        assert body["dossier_name"] == "Project Cascade"
        # Already stamped, so nothing to write back.
        assert body["stamp_lineage_id"] is None

    @pytest.mark.auth
    async def test_a_filename_inside_a_chosen_deal_is_a_guess_worth_stamping(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _loaded(session, save_fixture, user)

        response = await client.post(
            "/v1/tieout/identify",
            json={"filename": "cascade_deck.pptx", "dossier_id": str(deal.id)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["matched_by"] == "filename"
        assert body["stamp_lineage_id"] is not None

    @pytest.mark.auth
    async def test_a_stamp_from_someone_elses_deal_reveals_nothing(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """Not « found but forbidden ». Not found, and not a hint either."""
        stranger = await create_user(save_fixture)
        deal = await _loaded(session, save_fixture, stranger)
        repository = TieOutRepository.from_session(session)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )

        response = await client.post(
            "/v1/tieout/identify", json={"lineage_id": str(deck.lineage_id)}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["matched_by"] == "none"
        assert body["artifact"] is None
        assert body["dossier_id"] is None

    @pytest.mark.auth
    async def test_an_unknown_document_says_so(
        self, client: AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        response = await client.post(
            "/v1/tieout/identify", json={"filename": "someone_elses.pptx"}
        )
        assert response.status_code == 200
        assert response.json()["matched_by"] == "none"

    @pytest.mark.auth
    async def test_the_deal_list_is_scoped_to_this_person(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        mine = await _deal_for(session, save_fixture, user)
        stranger = await create_user(save_fixture)
        await _deal_for(session, save_fixture, stranger)
        await session.flush()

        response = await client.get("/v1/tieout/deals")

        assert response.status_code == 200
        ids = [one["id"] for one in response.json()]
        assert str(mine.id) in ids
        assert len(ids) == 1

    @pytest.mark.auth
    async def test_a_deal_nobody_has_checked_does_not_look_clear(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The distinction Projects is built on.

        « No open findings » on a deal nobody ran reads exactly like « no
        open findings » on one checked this morning, and a product whose
        argument is that what was *not* checked stays on screen cannot let
        those two look the same. `checked_at` is null until a run finishes.
        """
        await _deal_for(session, save_fixture, user)
        await session.flush()

        never = (await client.get("/v1/tieout/deals")).json()[0]
        assert never["checked_at"] is None
        assert never["open_findings"] == 0

        checked = await _loaded(session, save_fixture, user)
        await session.flush()

        rows = {one["id"]: one for one in (await client.get("/v1/tieout/deals")).json()}
        assert rows[str(checked.id)]["checked_at"] is not None
        assert rows[str(checked.id)]["open_findings"] > 0

    @pytest.mark.auth
    async def test_a_finding_carries_coordinates_a_host_can_act_on(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """« Click a finding and PowerPoint goes to it » is a lookup.

        Prose in `location` cannot be parsed back into a selection, so the
        same position rides along in numbers.
        """
        deal = await _loaded(session, save_fixture, user)
        findings = (
            await client.get(
                f"/v1/tieout/deals/{deal.id}/findings", params={"kind": "drift"}
            )
        ).json()

        for finding in findings:
            anchor = finding["where"]["anchor"]
            assert anchor["shape_id"] > 0
            assert anchor["kind"] in {"text", "table", "chart"}

        audit = (
            await client.get(
                f"/v1/tieout/deals/{deal.id}/findings", params={"kind": "audit"}
            )
        ).json()
        # An audit finding sits at a cell, which Excel selects as it stands.
        assert all(one["where"]["anchor"]["kind"] == "cell" for one in audit)
        assert all(one["where"]["anchor"]["ref"] for one in audit)


@pytest.mark.asyncio
class TestThePanelToken:
    async def test_anonymous_gets_nothing(self, client: AsyncClient) -> None:
        response = await client.post("/v1/tieout/panel/token")
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_a_browser_session_mints_a_narrow_token(
        self, client: AsyncClient, user: User
    ) -> None:
        """The panel holds a credential, and only these two scopes.

        Fixed here rather than taken from the request: a caller that could
        name its own scopes would make this endpoint a way to widen any
        session into anything.
        """
        response = await client.post("/v1/tieout/panel/token")

        assert response.status_code == 201
        body = response.json()
        assert body["token"].startswith("claidor_pat_")
        assert body["scopes"] == ["tieout:read", "tieout:write"]
        assert body["expires_in"] == 30 * 24 * 3600

    @pytest.mark.auth
    async def test_the_token_it_mints_is_a_real_resolvable_credential(
        self, client: AsyncClient, session: AsyncSession, user: User
    ) -> None:
        """Resolve the plaintext the way the authenticator does.

        Not through a request: the `auth` marker replaces the
        authentication dependency wholesale, so a bearer header in a test
        is ignored and a route would answer 200 whatever the token said.
        An « end to end » assertion there would pass with the token
        deleted, which is worse than no test.

        So the token is looked up by its own hash — the same call the real
        authenticator makes — and checked for the two scopes and the
        expiry.
        """
        from polar.personal_access_token.service import (
            personal_access_token as tokens,
        )

        plaintext = (await client.post("/v1/tieout/panel/token")).json()["token"]
        found = await tokens.get_by_token(session, plaintext)

        assert found is not None
        assert found.user_id == user.id
        assert set(found.scopes) == {Scope.tieout_read, Scope.tieout_write}
        assert found.expires_at is not None

    @pytest.mark.auth
    async def test_it_carries_nothing_the_panel_does_not_need(
        self, client: AsyncClient, session: AsyncSession, user: User
    ) -> None:
        """Two scopes, and no way for a caller to ask for more.

        The scopes are fixed in the endpoint rather than read from the
        request. A body naming its own would turn this into a way to widen
        any browser session into anything the account can do.
        """
        from polar.personal_access_token.service import (
            personal_access_token as tokens,
        )

        plaintext = (
            await client.post(
                "/v1/tieout/panel/token",
                json={"scopes": ["organizations:write"]},
            )
        ).json()["token"]
        found = await tokens.get_by_token(session, plaintext)

        assert found is not None
        assert Scope.organizations_write not in found.scopes
        assert set(found.scopes) == {Scope.tieout_read, Scope.tieout_write}
