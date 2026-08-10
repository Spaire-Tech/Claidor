"""The matter-wide check, through the route.

`test_review.py` covers the arithmetic without a database. What is left to
prove here is the part that only exists once there is one: that the route
is closed to people who are not on the matter, and that the two counts a
reader relies on — how many files were read, and how many could not be —
survive the trip from the repository to the response.

That second one is the whole point of the endpoint. « No issues found in 24
files » when six were scans is the most misleading sentence this product
could print, and it is only prevented if `unreadable` is computed from what
the matter actually holds rather than from what happened to be checkable.
"""

import pytest
from httpx import AsyncClient

from polar.dossier.repository import DossierRepository
from polar.kit.db.postgres import AsyncSession
from polar.models import DocumentCategory, ExtractionStatus, User
from polar.models.file import File, FileServiceTypes
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user

DEFECTIVE = (
    'HELIOS SYSTEMS LTD (the "Company") agrees.\n'
    '"Subscription Price" means EUR 2,500,000.\n'
    "The Subscriber shall pay the Consideration to the Escrow Agent.\n"
)


async def _file(save_fixture: SaveFixture, organization_id, name: str) -> File:
    file = File(
        organization_id=organization_id,
        name=name,
        path=f"dossier/{name}",
        mime_type="text/plain",
        size=100,
        service=FileServiceTypes.dossier_document,
        is_uploaded=True,
        is_enabled=True,
    )
    await save_fixture(file)
    return file


async def _matter_with(
    session: AsyncSession,
    save_fixture: SaveFixture,
    user: User,
    *,
    readable: list[str],
    scans: int = 0,
):
    organization = await create_organization(save_fixture)
    repository = DossierRepository.from_session(session)
    dossier = await repository.create_dossier(
        organization_id=organization.id,
        name="Project Atlas",
        created_by_id=user.id,
    )

    for index, text in enumerate(readable):
        file = await _file(save_fixture, organization.id, f"doc-{index}.txt")
        document = await repository.add_document(
            dossier_id=dossier.id,
            file_id=file.id,
            title=f"Document {index + 1}",
            category=DocumentCategory.contract,
            uploaded_by_id=user.id,
        )
        await repository.set_extraction(
            document, status=ExtractionStatus.extracted, text=text
        )

    for index in range(scans):
        file = await _file(save_fixture, organization.id, f"scan-{index}.pdf")
        document = await repository.add_document(
            dossier_id=dossier.id,
            file_id=file.id,
            title=f"Scan {index + 1}",
            category=DocumentCategory.exhibit,
            uploaded_by_id=user.id,
        )
        await repository.set_extraction(
            document, status=ExtractionStatus.unextractable, text=None
        )

    await session.flush()
    return dossier


@pytest.mark.asyncio
class TestCheckMatterRoute:
    async def test_anonymous_is_refused(self, client: AsyncClient) -> None:
        response = await client.post(
            "/v1/dossiers/00000000-0000-0000-0000-000000000000/check"
        )

        assert response.status_code == 401

    @pytest.mark.auth
    async def test_someone_not_on_the_matter_gets_nothing(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A matter is closed: membership is the only key, and a check route
        # that leaked its documents' contents would be the widest hole in
        # the product.
        stranger = await create_user(save_fixture)
        dossier = await _matter_with(
            session, save_fixture, stranger, readable=[DEFECTIVE]
        )

        response = await client.post(f"/v1/dossiers/{dossier.id}/check")

        assert response.status_code == 404

    @pytest.mark.auth
    async def test_it_checks_every_readable_document(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        dossier = await _matter_with(
            session, save_fixture, user, readable=[DEFECTIVE, DEFECTIVE]
        )

        response = await client.post(f"/v1/dossiers/{dossier.id}/check")

        assert response.status_code == 200
        body = response.json()
        assert body["checked"] == 2
        assert len(body["documents"]) == 2
        assert body["finding_count"] > 0

    @pytest.mark.auth
    async def test_the_totals_agree_with_the_documents_beneath_them(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        dossier = await _matter_with(
            session, save_fixture, user, readable=[DEFECTIVE, DEFECTIVE]
        )

        body = (await client.post(f"/v1/dossiers/{dossier.id}/check")).json()

        assert body["critical_count"] == sum(
            d["critical_count"] for d in body["documents"]
        )
        assert body["finding_count"] == sum(len(d["findings"]) for d in body["documents"])

    @pytest.mark.auth
    async def test_scans_are_reported_not_silently_dropped(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        # The one that matters. Two readable files and six scans must not
        # read as a matter of two files.
        dossier = await _matter_with(
            session, save_fixture, user, readable=[DEFECTIVE, DEFECTIVE], scans=6
        )

        body = (await client.post(f"/v1/dossiers/{dossier.id}/check")).json()

        assert body["checked"] == 2
        assert body["unreadable"] == 6

    @pytest.mark.auth
    async def test_an_empty_matter_says_it_checked_nothing(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        dossier = await _matter_with(session, save_fixture, user, readable=[])

        body = (await client.post(f"/v1/dossiers/{dossier.id}/check")).json()

        assert body["checked"] == 0
        assert body["finding_count"] == 0
        assert body["unreadable"] == 0

    @pytest.mark.auth
    async def test_findings_carry_what_the_panel_needs_to_locate_them(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        # The same shape the Word panel receives. If the workspace and the
        # add-in described a finding differently, the same defect read in
        # two places would be two objects that can disagree.
        dossier = await _matter_with(
            session, save_fixture, user, readable=[DEFECTIVE]
        )

        body = (await client.post(f"/v1/dossiers/{dossier.id}/check")).json()
        finding = body["documents"][0]["findings"][0]

        assert set(finding) == {
            "defect",
            "severity",
            "certainty",
            "term",
            "note",
            "context",
            "start",
            "end",
            "literal",
            "occurrence",
        }
