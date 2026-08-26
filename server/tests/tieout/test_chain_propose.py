"""D3's rule, held: labels near both, never by value; ties abstain.

The pure cases plant exactly the traps the registration names. The
value trap is the one worth reading twice: a candidate whose line
prints the very number the cell holds, against a candidate whose line
shares the cell's words — the matcher must follow the words and never
notice the number, because a value-matching matcher would score
perfectly on every harness and be circular on every one.

The route tests then walk the stored path: a real deal, a real
extracted document, a model cell planted beside it, and the proposal
served — with the computed-cell refusal and the stranger's 404.
"""

import uuid
from decimal import Decimal
from uuid import UUID

import pytest
from httpx import AsyncClient

from polar.kit.db.postgres import AsyncSession
from polar.models import User
from polar.models.tieout import Artifact, ArtifactKind, ArtifactStatus, ModelCell
from polar.tieout.chain.propose import (
    FLOOR,
    Abstained,
    Proposed,
    label_tokens,
    propose,
)
from polar.tieout.repository import TieOutRepository
from tests.fixtures.database import SaveFixture
from tests.tieout.test_chain_store import _deal_for, _uploaded_pdf

A, B, C = (UUID(int=1), UUID(int=2), UUID(int=3))


# --- the tokenizer: where never-by-value is enforced ---------------------


def test_purely_numeric_tokens_never_survive() -> None:
    assert label_tokens("FY2025A Adjusted EBITDA") == {"fy2025a", "adjusted", "ebitda"}
    assert label_tokens("2025 48.9 1,234") == set()
    assert label_tokens("") == set()


# --- the matcher, case by case -------------------------------------------


def test_labels_single_out_the_right_fact() -> None:
    answer = propose(
        "FY2025A Adjusted EBITDA",
        [
            (A, "Adjusted EBITDA for FY2025A was £48.9mm"),
            (B, "Total revenue grew in the period"),
        ],
    )
    assert isinstance(answer, Proposed)
    assert answer.candidate.fact_id == A
    assert answer.candidate.score == 1.0
    assert answer.candidate.shared == ("adjusted", "ebitda", "fy2025a")


def test_a_matching_value_alone_proposes_nothing() -> None:
    """The value trap: the number is right there, and it must not count.

    The cell is 48.9; a line prints 48.9 twice and shares no label
    word. A matcher that peeked would pounce. This one abstains and
    says the honest thing: no label coverage, maybe no source.
    """
    answer = propose(
        "Net leverage ratio",
        [(A, "48.9 appears here, and 48.9 again, labelled nothing")],
    )
    assert isinstance(answer, Abstained)
    assert answer.ranked[0].score == 0.0
    assert "no candidate line covers" in answer.reason.lower()


def test_labels_beat_a_value_coincidence() -> None:
    answer = propose(
        "Net leverage ratio",
        [
            (A, "48.9 printed with no words the cell knows"),
            (B, "Net leverage ratio of 4.5x at close"),
        ],
    )
    assert isinstance(answer, Proposed)
    assert answer.candidate.fact_id == B


def test_a_tie_abstains_in_words() -> None:
    answer = propose(
        "Margin",
        [(A, "Margin 45% up 3 points"), (B, "Margin 45% up 3 points")],
    )
    assert isinstance(answer, Abstained)
    assert "tie" in answer.reason
    assert [c.score for c in answer.ranked] == [1.0, 1.0]


def test_weak_coverage_abstains_below_the_floor() -> None:
    answer = propose(
        "Adjusted EBITDA margin percentage",
        [(A, "The margin narrowed slightly")],
    )
    assert isinstance(answer, Abstained)
    assert answer.ranked[0].score == 0.25 < FLOOR
    assert "25%" in answer.reason


def test_numeric_only_labels_abstain_rather_than_guess() -> None:
    answer = propose("2025", [(A, "2025 was a good year")])
    assert isinstance(answer, Abstained)
    assert "purely numeric" in answer.reason
    assert answer.ranked == ()


def test_the_ranking_is_deterministic() -> None:
    first = propose("Adjusted EBITDA", [(A, "Adjusted only"), (B, "Adjusted EBITDA")])
    second = propose("Adjusted EBITDA", [(B, "Adjusted EBITDA"), (A, "Adjusted only")])
    assert first == second
    assert isinstance(first, Proposed)
    assert [c.fact_id for c in first.ranked] == [B, A]


# --- the route, over the stored path -------------------------------------


async def _model_cell(
    session: AsyncSession,
    dossier_id: UUID,
    owner: User,
    *,
    row_label: str,
    formula: str | None = None,
    value: Decimal | None = Decimal("1234.5"),
) -> ModelCell:
    artifact = Artifact(
        dossier_id=dossier_id,
        kind=ArtifactKind.model,
        filename="model.xlsx",
        version=1,
        lineage_id=uuid.uuid4(),
        status=ArtifactStatus.ready,
        uploaded_by_id=owner.id,
    )
    session.add(artifact)
    await session.flush()
    cell = ModelCell(
        artifact_id=artifact.id,
        ref="Model!D26",
        sheet="Model",
        row=26,
        column=4,
        value=value,
        formula=formula,
        row_label=row_label,
        column_label="",
        name=row_label,
    )
    session.add(cell)
    await session.flush()
    return cell


@pytest.mark.asyncio
class TestProposalRoute:
    @pytest.mark.auth
    async def test_a_typed_number_gets_its_source_proposed(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)
        await client.post(f"/v1/chain/documents/{artifact_id}/extract")
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(artifact_id)
        )
        assert pdf is not None
        cell = await _model_cell(session, pdf.dossier_id, user, row_label="Revenue")

        response = await client.get(f"/v1/chain/cells/{cell.id}/proposals")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["cell_labels"] == "Revenue"
        assert body["reason"] is None
        assert body["proposed"]["text"] == "1,234.5"
        assert body["proposed"]["line"] == "Revenue 1,234.5"
        assert body["score"] == 1.0
        assert body["shared"] == ["revenue"]

    @pytest.mark.auth
    async def test_two_facts_on_one_line_tie_and_abstain(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """« Margin 45% up 3 points » holds two numbers with one label.

        The labels cannot tell 45% from 3, so the matcher must not
        pick — the planted tie from the registration, walked end to
        end through the store.
        """
        artifact_id = await _uploaded_pdf(client, session, save_fixture, user)
        await client.post(f"/v1/chain/documents/{artifact_id}/extract")
        pdf = await TieOutRepository.from_session(session).get_artifact(
            UUID(artifact_id)
        )
        assert pdf is not None
        cell = await _model_cell(session, pdf.dossier_id, user, row_label="Margin")

        response = await client.get(f"/v1/chain/cells/{cell.id}/proposals")

        assert response.status_code == 200
        body = response.json()
        assert body["proposed"] is None
        assert "tie" in body["reason"]
        assert len(body["candidates"]) >= 2
        assert body["candidates"][0]["score"] == body["candidates"][1]["score"]

    @pytest.mark.auth
    async def test_a_computed_cell_is_refused_in_words(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_for(session, save_fixture, user)
        cell = await _model_cell(
            session, deal.id, user, row_label="Revenue", formula="=SUM(D2:D25)"
        )

        response = await client.get(f"/v1/chain/cells/{cell.id}/proposals")

        assert response.status_code == 409
        assert "its provenance is its formula" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_stranger_gets_404(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        from tests.fixtures.random_objects import create_user

        stranger = await create_user(save_fixture)
        deal = await _deal_for(session, save_fixture, stranger)
        cell = await _model_cell(session, deal.id, stranger, row_label="Revenue")

        response = await client.get(f"/v1/chain/cells/{cell.id}/proposals")
        assert response.status_code == 404
