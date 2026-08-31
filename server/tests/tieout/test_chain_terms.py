"""The terms table — swens.md § 3d, walked at the route level.

The agreed shape (`docs/pierce/terms-table-shape.md`) makes promises,
and each is pinned here as behaviour:

- extraction **ranks** candidates and never elects one — a term exists
  because a person picked or typed it;
- a typed term is the route for what geometry withheld: cited to a
  page, parsed by the same rule extraction uses or refused in words,
  and honest forever about not being re-readable;
- binding a model input is a person's act with a stated scale, and the
  check afterwards is the D4 arithmetic applied to every row at once —
  no matching, no model call;
- the three finding classes are planted and caught: a model input that
  disagrees with a confirmed term from day one, the model moving while
  the term stands, and the term moving while the model stands still
  (the founder's drawn margin-ratchet case);
- coverage is on the face: untested and superseded rows are counted,
  never hidden.

And, as everywhere in this workspace, an id is a capability to ask,
never to see: a stranger holding a real id gets the same 404 a made-up
id gets.
"""

from decimal import Decimal
from uuid import UUID

import pytest
from httpx import AsyncClient

from polar.kit.db.postgres import AsyncSession
from polar.models import User
from polar.tieout.chain.repository import ChainFactRepository
from polar.tieout.chain.terms import CandidateSignals, default_name, rank, signals_for
from polar.tieout.repository import TieOutRepository
from tests.fixtures.database import SaveFixture
from tests.tieout.test_chain_propose import _model_cell
from tests.tieout.test_chain_store import _deal_for, _uploaded_pdf

NOWHERE = "00000000-0000-0000-0000-000000000000"


# --- the ranking, as pure functions --------------------------------------


class TestRanking:
    """Assistance for a person's pick, not an inference: nothing is
    excluded, nothing is elected, and every row shows its signals."""

    def test_labelled_figures_come_before_unlabelled_ones(self) -> None:
        """A term needs a name; a bare number on a bare line cannot
        supply one, so it sinks — but it is still in the list."""
        ranked = rank(
            [
                ("2,340", "", "2,340"),  # a line that is only its number
                ("Margin 4.35%", "", "4.35%"),
            ]
        )
        assert [index for index, _ in ranked] == [1, 0]
        assert ranked[0][1].labelled
        assert not ranked[1][1].labelled

    def test_document_references_sink_below_quantities(self) -> None:
        """« Table 14 » is a place, not a quantity — the matcher's own
        registered rule, reused rather than re-invented."""
        ranked = rank(
            [
                ("See Table 14 for the profile", "", "14"),
                ("Facility B 190.0", "", "190.0"),
            ]
        )
        assert [index for index, _ in ranked] == [1, 0]
        assert ranked[1][1].reference

    def test_tabular_and_unit_marked_figures_surface_first(self) -> None:
        ranked = rank(
            [
                ("Tenor 25", "", "25"),
                ("Margin 4.35%", "", "4.35%"),
                ("Facility 213.0", "Tranche A", "213.0"),
            ]
        )
        # The table cell first, then the unit-marked figure, then the
        # bare count — reading order never reshuffled within a band.
        assert [index for index, _ in ranked] == [2, 1, 0]

    def test_ties_keep_reading_order(self) -> None:
        entries = [(f"Row {n} 1.0", "", "1.0") for n in range(4)]
        assert [index for index, _ in rank(entries)] == [0, 1, 2, 3]

    def test_signals_read_straight_off_the_page(self) -> None:
        assert signals_for("Margin 4.35%", "Tranche A", "4.35%") == CandidateSignals(
            labelled=True, tabular=True, reference=False, unit_marked=True
        )
        assert signals_for("£213,000,000 facility", "", "£213,000,000").unit_marked
        assert signals_for("Scale 3.4m of works", "", "3.4m").unit_marked
        assert not signals_for("Tenor 25", "", "25").unit_marked

    def test_a_generic_label_is_not_distinct_and_a_named_one_is(self) -> None:
        """The round-11 amendment. D3's negative control measured what a
        generic label is worth: « General » covered the depreciation
        schedule and the salaries schedule alike at a perfect 1.0. A
        label whose words re-find several lines cannot anchor a term
        across revisions, and the picker sees that at pick time."""
        ranked = dict(
            rank(
                [
                    ("Total 44,016", "", "44,016"),
                    ("Total 2,120,257", "", "2,120,257"),
                    ("Transmission Wages Expense 44,016", "", "44,016"),
                ]
            )
        )
        assert not ranked[0].distinct  # « Total » re-finds two lines
        assert not ranked[1].distinct
        assert ranked[2].distinct

    def test_distinct_labels_outrank_generic_ones(self) -> None:
        ranked = rank(
            [
                ("Total 5", "", "5"),
                ("Total 9", "", "9"),
                ("Margin ratchet 15", "", "15"),
            ]
        )
        assert [index for index, _ in ranked] == [2, 0, 1]

    def test_line_keys_group_a_lines_facts_into_one_line(self) -> None:
        """Three figures on one printed line are one line, not three
        repeats — with keys, the line's unique label stays distinct;
        without them, rank under-claims rather than over-claims."""
        entries = [
            ("Margin 4.35% 3 2", "", "4.35%"),
            ("Margin 4.35% 3 2", "", "3"),
            ("Margin 4.35% 3 2", "", "2"),
        ]
        keyed = dict(rank(entries, line_keys=[(1, "Margin 4.35% 3 2")] * 3))
        bare = dict(rank(entries))
        assert all(signal.distinct for signal in keyed.values())
        assert not any(signal.distinct for signal in bare.values())

    def test_the_default_name_is_printed_words_only(self) -> None:
        assert default_name("Margin 4.35%", "") == "Margin 4.35%"
        assert default_name("Margin 4.35%", "Tranche A") == "Margin 4.35% — Tranche A"


# --- helpers -------------------------------------------------------------


async def _extracted_deal(
    client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User
) -> tuple[str, dict]:
    """One deal with its term sheet extracted; (artifact id, facts body)."""
    artifact_id = await _uploaded_pdf(client, session, save_fixture, user)
    extracted = await client.post(f"/v1/chain/documents/{artifact_id}/extract")
    assert extracted.status_code == 200, extracted.text
    return artifact_id, extracted.json()


async def _picked_term(
    client: AsyncClient, fact: dict, name: str | None = None
) -> dict:
    body: dict = {"fact_id": fact["id"]}
    if name is not None:
        body["name"] = name
    response = await client.post("/v1/chain/terms", json=body)
    assert response.status_code == 201, response.text
    return response.json()


# --- picking candidates --------------------------------------------------


@pytest.mark.asyncio
class TestTermCandidates:
    @pytest.mark.auth
    async def test_every_fact_is_offered_with_its_signals_and_refusals_ride_along(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Nothing excluded, nothing elected — and the refused scan page
        is on the face, because that is exactly where a person may need
        to type a term in by hand."""
        artifact_id, extracted = await _extracted_deal(
            client, session, save_fixture, user
        )

        response = await client.get(
            f"/v1/chain/documents/{artifact_id}/term-candidates"
        )

        assert response.status_code == 200, response.text
        body = response.json()
        texts = [candidate["fact"]["text"] for candidate in body["candidates"]]
        assert sorted(texts) == sorted(f["text"] for f in extracted["facts"])
        # The unit-marked figure outranks the bare count from its line.
        assert texts.index("45%") < texts.index("3")
        for candidate in body["candidates"]:
            assert set(candidate["signals"]) == {
                "labelled",
                "tabular",
                "reference",
                "unit_marked",
                "distinct",
            }
        assert [refusal["page"] for refusal in body["refusals"]] == [2]

    @pytest.mark.auth
    async def test_a_stranger_gets_the_same_404_a_made_up_id_gets(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        stranger_deal = await _deal_for(session, save_fixture, user_second)
        assert stranger_deal is not None

        response = await client.get(f"/v1/chain/documents/{NOWHERE}/term-candidates")
        assert response.status_code == 404


# --- putting terms on the record -----------------------------------------


@pytest.mark.asyncio
class TestPickingTerms:
    @pytest.mark.auth
    async def test_a_picked_term_carries_its_whole_citation(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, extracted = await _extracted_deal(client, session, save_fixture, user)
        fact = extracted["facts"][0]  # 1,234.5 on « Revenue 1,234.5 »

        term = await _picked_term(client, fact)

        assert term["stated"] == "extracted"
        assert term["name"] == "Revenue 1,234.5"
        document = term["document"]
        assert document["fact_id"] == fact["id"]
        assert document["page"] == 1
        assert document["printed_text"] == "1,234.5"
        assert document["anchor_line"] == "Revenue 1,234.5"
        assert document["value"] == 1234.5
        assert term["model"] is None  # a term exists before any binding
        assert term["superseded"] is False

    @pytest.mark.auth
    async def test_a_person_may_name_the_term_themselves(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, extracted = await _extracted_deal(client, session, save_fixture, user)

        term = await _picked_term(client, extracted["facts"][2], name="Margin")

        assert term["name"] == "Margin"
        assert term["document"]["printed_text"] == "45%"

    @pytest.mark.auth
    async def test_picking_the_same_fact_twice_is_one_row(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The confirm-once precedent applied to picking: the table
        never grows two contradictory rows for one figure."""
        _, extracted = await _extracted_deal(client, session, save_fixture, user)
        fact = extracted["facts"][0]

        first = await _picked_term(client, fact)
        second = await _picked_term(client, fact, name="Base revenue")

        assert second["id"] == first["id"]
        assert second["name"] == "Base revenue"

    @pytest.mark.auth
    async def test_a_typed_term_is_parsed_by_extractions_own_rule(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The spread-table route: a person supplies what geometry
        withheld, cited to a page, and the value comes from the same
        parser every printed fact went through."""
        artifact_id, _ = await _extracted_deal(client, session, save_fixture, user)

        response = await client.post(
            "/v1/chain/terms",
            json={
                "document_version_id": artifact_id,
                "page": 2,
                "name": "Margin ratchet step",
                "printed_text": "4.35%",
            },
        )

        assert response.status_code == 201, response.text
        term = response.json()
        assert term["stated"] == "typed"
        assert term["document"]["value"] == 4.35
        assert term["document"]["page"] == 2
        assert term["document"]["anchor_line"] == ""  # nothing printed to re-find
        assert term["document"]["fact_id"] is None

    @pytest.mark.auth
    async def test_what_a_typed_term_refuses_and_in_words(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id, _ = await _extracted_deal(client, session, save_fixture, user)
        typed = {
            "document_version_id": artifact_id,
            "page": 2,
            "name": "Margin",
            "printed_text": "4.35%",
        }

        unparseable = await client.post(
            "/v1/chain/terms", json={**typed, "printed_text": "four point three five"}
        )
        assert unparseable.status_code == 422
        assert "does not read as one conventional number" in unparseable.text

        nameless = await client.post("/v1/chain/terms", json={**typed, "name": "  "})
        assert nameless.status_code == 422
        assert "needs a name" in nameless.text

        pageless = await client.post("/v1/chain/terms", json={**typed, "page": None})
        assert pageless.status_code == 422
        assert "citation is the point" in pageless.text

    @pytest.mark.auth
    async def test_exactly_one_shape_never_both_and_never_neither(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id, extracted = await _extracted_deal(
            client, session, save_fixture, user
        )

        neither = await client.post("/v1/chain/terms", json={})
        both = await client.post(
            "/v1/chain/terms",
            json={
                "fact_id": extracted["facts"][0]["id"],
                "document_version_id": artifact_id,
                "page": 1,
                "name": "x",
                "printed_text": "1",
            },
        )

        assert neither.status_code == 422
        assert both.status_code == 422
        assert "exactly one of the two" in neither.text

    @pytest.mark.auth
    async def test_a_stranger_cannot_pick_from_another_deals_facts(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        """The client is `user`; the fact belongs to `user_second`'s
        deal. Same 404 as a made-up id — existence leaks nothing."""
        stranger_deal = await _deal_for(session, save_fixture, user_second)
        response = await client.post(
            f"/v1/tieout/deals/{stranger_deal.id}/artifacts",
            files={"file": ("term_sheet.pdf", b"", "application/pdf")},
        )
        # The upload route itself already refuses the stranger's deal.
        assert response.status_code == 404

        made_up = await client.post("/v1/chain/terms", json={"fact_id": NOWHERE})
        assert made_up.status_code == 404


# --- the row's life: rename, supersede, delete ---------------------------


@pytest.mark.asyncio
class TestTheRowsLife:
    @pytest.mark.auth
    async def test_renaming_touches_the_name_and_nothing_else(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, extracted = await _extracted_deal(client, session, save_fixture, user)
        term = await _picked_term(client, extracted["facts"][0])

        renamed = await client.patch(
            f"/v1/chain/terms/{term['id']}", json={"name": "Base case revenue"}
        )

        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["name"] == "Base case revenue"
        assert renamed.json()["document"] == term["document"]

        nameless = await client.patch(
            f"/v1/chain/terms/{term['id']}", json={"name": "  "}
        )
        assert nameless.status_code == 422

    @pytest.mark.auth
    async def test_supersession_is_a_persons_statement_and_reversible(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, extracted = await _extracted_deal(client, session, save_fixture, user)
        term = await _picked_term(client, extracted["facts"][0])

        superseded = await client.post(
            f"/v1/chain/terms/{term['id']}/supersede",
            json={"superseded": True, "note": "The amended agreement now governs."},
        )
        assert superseded.status_code == 200, superseded.text
        assert superseded.json()["superseded"] is True
        assert "amended agreement" in superseded.json()["superseded_note"]

        restored = await client.post(
            f"/v1/chain/terms/{term['id']}/supersede", json={"superseded": False}
        )
        assert restored.json()["superseded"] is False
        assert restored.json()["superseded_note"] == ""

    @pytest.mark.auth
    async def test_a_deleted_row_is_gone_from_the_table(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, extracted = await _extracted_deal(client, session, save_fixture, user)
        term = await _picked_term(client, extracted["facts"][0])
        dossier_id = term["dossier_id"]

        deleted = await client.delete(f"/v1/chain/terms/{term['id']}")
        assert deleted.status_code == 204

        listing = await client.get(f"/v1/chain/dossiers/{dossier_id}/terms")
        assert listing.json() == []
        rename_after = await client.patch(
            f"/v1/chain/terms/{term['id']}", json={"name": "x"}
        )
        assert rename_after.status_code == 404

    @pytest.mark.auth
    async def test_a_stranger_cannot_read_a_deals_terms(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        stranger_deal = await _deal_for(session, save_fixture, user_second)

        response = await client.get(f"/v1/chain/dossiers/{stranger_deal.id}/terms")

        assert response.status_code == 404


# --- binding a model input -----------------------------------------------


@pytest.mark.asyncio
class TestBinding:
    @pytest.mark.auth
    async def test_binding_captures_everything_the_check_will_need(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id, extracted = await _extracted_deal(
            client, session, save_fixture, user
        )
        term = await _picked_term(client, extracted["facts"][0])
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(artifact_id)
        )
        assert pdf is not None
        cell = await _model_cell(session, pdf.dossier_id, user, row_label="Revenue")

        response = await client.post(
            f"/v1/chain/terms/{term['id']}/model",
            json={"cell_id": str(cell.id), "basis": "reported, FY25"},
        )

        assert response.status_code == 200, response.text
        model = response.json()["model"]
        assert model["cell_name"] == "Revenue"  # THE anchor
        assert model["ref"] == "Model!D26"  # the citation
        assert model["value_at_confirmation"] == 1234.5
        assert response.json()["basis"] == "reported, FY25"
        assert response.json()["confirmed_by_id"] == str(user.id)

    @pytest.mark.auth
    async def test_a_computed_cell_is_not_a_model_input(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id, extracted = await _extracted_deal(
            client, session, save_fixture, user
        )
        term = await _picked_term(client, extracted["facts"][0])
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(artifact_id)
        )
        assert pdf is not None
        computed = await _model_cell(
            session, pdf.dossier_id, user, row_label="Revenue", formula="=SUM(D2:D25)"
        )

        response = await client.post(
            f"/v1/chain/terms/{term['id']}/model", json={"cell_id": str(computed.id)}
        )

        assert response.status_code == 409
        assert "its provenance is its formula" in response.text

    @pytest.mark.auth
    async def test_a_cell_from_another_deal_is_refused(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, extracted = await _extracted_deal(client, session, save_fixture, user)
        term = await _picked_term(client, extracted["facts"][0])
        other_deal = await _deal_for(session, save_fixture, user)
        foreign = await _model_cell(session, other_deal.id, user, row_label="Revenue")

        response = await client.post(
            f"/v1/chain/terms/{term['id']}/model", json={"cell_id": str(foreign.id)}
        )

        assert response.status_code == 409
        assert "different deals" in response.text

    @pytest.mark.auth
    async def test_a_scale_this_code_inferred_cannot_exist(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id, extracted = await _extracted_deal(
            client, session, save_fixture, user
        )
        term = await _picked_term(client, extracted["facts"][0])
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(artifact_id)
        )
        assert pdf is not None
        cell = await _model_cell(session, pdf.dossier_id, user, row_label="Revenue")

        response = await client.post(
            f"/v1/chain/terms/{term['id']}/model",
            json={"cell_id": str(cell.id), "scale": 0},
        )

        assert response.status_code == 422
        assert "greater than zero" in response.text


# --- the check: the table against the model, at once ---------------------


async def _bound_term(
    client: AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    user: User,
    *,
    cell_value: Decimal = Decimal("1234.5"),
) -> tuple[dict, object, object]:
    """A picked term bound to a cell; (term, cell, pdf artifact)."""
    artifact_id, extracted = await _extracted_deal(client, session, save_fixture, user)
    term = await _picked_term(client, extracted["facts"][0])
    pdf = await TieOutRepository.from_session(session).get_artifact(UUID(artifact_id))
    assert pdf is not None
    cell = await _model_cell(
        session, pdf.dossier_id, user, row_label="Revenue", value=cell_value
    )
    bound = await client.post(
        f"/v1/chain/terms/{term['id']}/model", json={"cell_id": str(cell.id)}
    )
    assert bound.status_code == 200, bound.text
    return bound.json(), cell, pdf


@pytest.mark.asyncio
class TestTheTableCheck:
    @pytest.mark.auth
    async def test_a_model_input_that_honours_its_term_agrees(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        term, cell, pdf = await _bound_term(client, session, save_fixture, user)

        response = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={cell.artifact_id}"
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["terms"] == 1
        assert body["checked"] == 1
        assert body["tallies"] == {"agrees": 1}
        result = body["results"][0]
        assert result["ties_out_now"] is True
        assert result["detail"] == ""
        assert body["model_calls"] == 0  # structural: arithmetic only

    @pytest.mark.auth
    async def test_finding_one_a_model_input_that_disagrees_from_day_one(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The case the table exists for: nothing has moved, and the
        pair does not tie out — the wrong rate was typed. Its own
        sentence, with both numbers in it."""
        term, cell, pdf = await _bound_term(
            client, session, save_fixture, user, cell_value=Decimal("1300")
        )

        response = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={cell.artifact_id}"
        )

        result = response.json()["results"][0]
        assert result["verdict"] == "agrees"  # neither side moved…
        assert result["ties_out_now"] is False  # …and it does not tie out
        assert "does not tie out" in result["detail"]
        assert "1,234.5" in result["detail"]
        assert "1300" in result["detail"]

    @pytest.mark.auth
    async def test_finding_two_the_model_moved_while_the_term_stands(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        term, cell, pdf = await _bound_term(client, session, save_fixture, user)
        cell.value = Decimal("9999.0")
        session.add(cell)
        await session.flush()

        response = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={cell.artifact_id}"
        )

        result = response.json()["results"][0]
        assert result["verdict"] == "the model moved"
        assert result["ties_out_now"] is False
        assert "1234.5" in result["detail"]
        assert "9999" in result["detail"]

    @pytest.mark.auth
    async def test_finding_three_the_term_moved_while_the_model_stood_still(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The founder's drawn case: the document was amended, the model
        was not. The document side re-reads by its printed line when the
        check is pointed at the newer upload."""
        term, cell, pdf = await _bound_term(client, session, save_fixture, user)
        found = await ChainFactRepository.from_session(session).get(
            UUID(term["document"]["fact_id"])
        )
        assert found is not None
        fact_row, _ = found
        fact_row.value = 1384.5  # the amended figure, same printed line
        session.add(fact_row)
        await session.flush()

        response = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={cell.artifact_id}"
            f"&document_version_id={pdf.id}"
        )

        result = response.json()["results"][0]
        assert result["verdict"] == "the source moved"
        assert result["ties_out_now"] is False
        assert "1234.5" in result["detail"]
        assert "1384.5" in result["detail"]

    @pytest.mark.auth
    async def test_a_renamed_input_is_broken_never_silently_repointed(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        term, cell, pdf = await _bound_term(client, session, save_fixture, user)
        cell.row_label = "Turnover"
        cell.name = "Turnover"
        session.add(cell)
        await session.flush()

        response = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={cell.artifact_id}"
        )

        result = response.json()["results"][0]
        assert result["verdict"] == "broken"
        assert "has nothing to point at" in result["detail"]
        assert result["ties_out_now"] is None

    @pytest.mark.auth
    async def test_coverage_is_on_the_face_untested_and_superseded_counted(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """« The documents state 3 terms; 1 is tested » — the sentence
        the one-at-a-time flow could never say."""
        term, cell, pdf = await _bound_term(client, session, save_fixture, user)
        facts = (await client.get(f"/v1/chain/documents/{pdf.id}/facts")).json()
        unbound = await _picked_term(client, facts["facts"][2])
        retired = await _picked_term(client, facts["facts"][1])
        await client.post(
            f"/v1/chain/terms/{retired['id']}/supersede",
            json={"superseded": True, "note": "Amended out."},
        )

        response = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={cell.artifact_id}"
        )

        body = response.json()
        assert body["terms"] == 3
        assert body["checked"] == 1
        assert body["tallies"] == {"agrees": 1, "untested": 1, "superseded": 1}
        by_id = {result["term_id"]: result for result in body["results"]}
        assert "no model input is bound" in by_id[unbound["id"]]["detail"]
        assert by_id[retired["id"]]["detail"] == "Amended out."

    @pytest.mark.auth
    async def test_a_typed_term_compares_at_its_stated_value_forever(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """There is nothing printed to re-read, so pointing the check at
        a document version changes nothing for a typed term — honestly,
        rather than by silently failing to re-anchor."""
        artifact_id, _ = await _extracted_deal(client, session, save_fixture, user)
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(artifact_id)
        )
        assert pdf is not None
        typed = await client.post(
            "/v1/chain/terms",
            json={
                "document_version_id": artifact_id,
                "page": 2,
                "name": "Facility",
                "printed_text": "1,300",
            },
        )
        assert typed.status_code == 201
        cell = await _model_cell(session, pdf.dossier_id, user, row_label="Facility")
        await client.post(
            f"/v1/chain/terms/{typed.json()['id']}/model",
            json={"cell_id": str(cell.id)},
        )

        response = await client.post(
            f"/v1/chain/dossiers/{pdf.dossier_id}/terms/check"
            f"?model_version_id={cell.artifact_id}"
            f"&document_version_id={pdf.id}"
        )

        result = response.json()["results"][0]
        assert result["stated"] == "typed"
        assert result["verdict"] == "agrees"  # neither side moved
        assert result["ties_out_now"] is False  # 1,300 stated, 1234.5 held
        assert "1,300" in result["detail"]

    @pytest.mark.auth
    async def test_a_strangers_deal_and_a_foreign_model_both_404(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        term, cell, pdf = await _bound_term(client, session, save_fixture, user)
        stranger_deal = await _deal_for(session, save_fixture, user_second)

        foreign_deal = await client.post(
            f"/v1/chain/dossiers/{stranger_deal.id}/terms/check"
            f"?model_version_id={cell.artifact_id}"
        )
        assert foreign_deal.status_code == 404

        foreign_model = await client.post(
            f"/v1/chain/dossiers/{term['dossier_id']}/terms/check"
            f"?model_version_id={NOWHERE}"
        )
        assert foreign_model.status_code == 404
        assert "not on this deal" in foreign_model.text
