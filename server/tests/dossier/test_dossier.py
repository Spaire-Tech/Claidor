"""Trust properties of dossiers, tested where they are enforced.

Three guarantees carry the feature, and each is checked here rather than
trusted to a prompt:
1. a matter is closed — membership is the only key;
2. a piece the machine cannot read never becomes a source for an answer;
3. a quote credited to a piece must be in that piece, or it is dropped.
"""

import pytest

from polar.dossier.repository import DossierRepository
from polar.dossier.service import dossier_service
from polar.kit.db.postgres import AsyncSession
from polar.librarian.service import SourceRef, normalize_quote
from polar.models import DocumentCategory, DossierRole, ExtractionStatus, User
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user


@pytest.mark.asyncio
class TestDossierAccess:
    async def test_matter_is_closed_to_non_members(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        organization = await create_organization(save_fixture)
        outsider = await create_user(save_fixture)
        repository = DossierRepository.from_session(session)

        dossier = await repository.create_dossier(
            organization_id=organization.id,
            name="Recouvrement — BICIS c/ SODICA",
            created_by_id=user.id,
        )

        # The creator is assigned to it...
        assert await repository.get_for_user(dossier.id, user.id) is not None
        # ...and a colleague in the same firm is not.
        assert await repository.get_for_user(dossier.id, outsider.id) is None
        assert (
            await repository.list_for_user(outsider.id, organization_id=organization.id)
            == []
        )

    async def test_creator_is_lead_and_access_follows_assignment(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        organization = await create_organization(save_fixture)
        colleague = await create_user(save_fixture)
        repository = DossierRepository.from_session(session)
        dossier = await repository.create_dossier(
            organization_id=organization.id,
            name="Sûretés — Financement CIMA",
            created_by_id=user.id,
        )

        membership = await repository.get_membership(dossier.id, user.id)
        assert membership is not None
        assert membership.role == DossierRole.lead

        await repository.add_member(
            dossier_id=dossier.id, user_id=colleague.id, role=DossierRole.member
        )
        assert await repository.get_for_user(dossier.id, colleague.id) is not None

        await repository.remove_member(dossier_id=dossier.id, user_id=colleague.id)
        assert await repository.get_for_user(dossier.id, colleague.id) is None

    async def test_deleted_matter_disappears_but_the_row_survives(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        organization = await create_organization(save_fixture)
        repository = DossierRepository.from_session(session)
        dossier = await repository.create_dossier(
            organization_id=organization.id,
            name="Bail commercial — SCI Palmeraie",
            created_by_id=user.id,
        )

        await repository.remove_dossier(dossier)

        # Gone from every product-facing read, even for its own lead...
        assert await repository.get_for_user(dossier.id, user.id) is None
        assert (
            await repository.list_for_user(user.id, organization_id=organization.id)
            == []
        )
        # ...but the record itself is a soft delete, not destruction.
        assert dossier.deleted_at is not None


class TestPieceUploadPath:
    """The browser's upload flow must survive the file API's typed unions.

    The intake UI posts ``service: dossier_document`` to ``POST /v1/files/``
    and reads the completed file back — both go through discriminated
    unions that silently reject any service left out of them. This broke in
    production once (422 on create); these tests pin the whole path.
    """

    def test_file_create_accepts_a_dossier_piece(self) -> None:
        from uuid import uuid4

        from pydantic import TypeAdapter

        from polar.file.schemas import DossierDocumentFileCreate, FileCreate

        parsed = TypeAdapter(FileCreate).validate_python(
            {
                "organization_id": str(uuid4()),
                "name": "PV de saisie.pdf",
                "mime_type": "application/pdf",
                "size": 123_456,
                "service": "dossier_document",
                "upload": {
                    "parts": [{"number": 1, "chunk_start": 0, "chunk_end": 123_455}]
                },
            }
        )
        assert isinstance(parsed, DossierDocumentFileCreate)

    def test_file_read_serializes_a_dossier_piece(self) -> None:
        from uuid import uuid4

        from polar.file.schemas import DossierDocumentFileRead, FileReadAdapter

        read = FileReadAdapter.validate_python(
            {
                "id": str(uuid4()),
                "organization_id": str(uuid4()),
                "name": "PV de saisie.pdf",
                "path": "dossier_document/x/PV de saisie.pdf",
                "mime_type": "application/pdf",
                "size": 123_456,
                "storage_version": None,
                "checksum_etag": None,
                "checksum_sha256_base64": None,
                "checksum_sha256_hex": None,
                "last_modified_at": None,
                "version": None,
                "service": "dossier_document",
                "is_uploaded": True,
                "created_at": "2026-08-08T08:00:00Z",
            }
        )
        assert isinstance(read, DossierDocumentFileRead)
        # A pièce is never a public file — no public_url on this variant.
        assert not hasattr(read, "public_url")

    def test_pieces_are_not_gated_by_the_content_storage_quota(self) -> None:
        from polar.file.service import STORAGE_EXEMPT_SERVICES
        from polar.models.file import FileServiceTypes

        # Claidor workspaces are auto-provisioned without a plan
        # (storage_gb=0): if a pièce counted against that quota, every
        # upload would be rejected.
        assert FileServiceTypes.dossier_document in STORAGE_EXEMPT_SERVICES


class TestExtraction:
    def test_readable_text_is_extracted(self) -> None:
        payload = (
            "PROCÈS-VERBAL DE SAISIE-ATTRIBUTION\n"
            "L'an deux mille vingt-quatre, le douze janvier."
        ).encode()
        text, reason = dossier_service.extract_text(payload, "text/plain")
        assert reason == "extracted"
        assert text is not None
        assert "douze janvier" in text

    def test_scan_without_text_layer_is_marked_unreadable(self) -> None:
        # A scan yields a handful of stray glyphs at most.
        text, reason = dossier_service.extract_text(b"  \n \x0c ", "text/plain")
        assert text is None
        assert reason == "no_text_layer"

    def test_unsupported_type_is_not_guessed_at(self) -> None:
        text, reason = dossier_service.extract_text(b"\x00\x01\x02", "image/jpeg")
        assert text is None
        assert reason == "unsupported_type"

    def test_category_guess_from_filename(self) -> None:
        assert (
            dossier_service.guess_category("Conclusions en réplique.pdf")
            == DocumentCategory.pleading
        )
        assert (
            dossier_service.guess_category("PV de saisie-attribution.pdf")
            == DocumentCategory.exhibit
        )
        assert dossier_service.guess_category("scan001.pdf") == DocumentCategory.other


@pytest.mark.asyncio
class TestOnlyReadableDocumentsReachTheModel:
    async def test_unreadable_pieces_are_excluded(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        from tests.fixtures.random_objects import create_organization

        organization = await create_organization(save_fixture)
        repository = DossierRepository.from_session(session)
        dossier = await repository.create_dossier(
            organization_id=organization.id,
            name="Recouvrement — test",
            created_by_id=user.id,
        )

        from polar.models import File
        from polar.models.file import FileServiceTypes

        readable_file = File(
            organization_id=organization.id,
            name="pv.txt",
            path="dossier/pv.txt",
            mime_type="text/plain",
            size=100,
            service=FileServiceTypes.dossier_document,
            is_uploaded=True,
            is_enabled=True,
        )
        scan_file = File(
            organization_id=organization.id,
            name="scan.pdf",
            path="dossier/scan.pdf",
            mime_type="application/pdf",
            size=100,
            service=FileServiceTypes.dossier_document,
            is_uploaded=True,
            is_enabled=True,
        )
        await save_fixture(readable_file)
        await save_fixture(scan_file)

        readable = await repository.add_document(
            dossier_id=dossier.id,
            file_id=readable_file.id,
            title="PV de saisie-attribution",
            category=DocumentCategory.exhibit,
            uploaded_by_id=user.id,
        )
        scan = await repository.add_document(
            dossier_id=dossier.id,
            file_id=scan_file.id,
            title="Contrat scanné",
            category=DocumentCategory.contract,
            uploaded_by_id=user.id,
        )
        await repository.set_extraction(
            readable,
            status=ExtractionStatus.extracted,
            text="Saisie pratiquée le 12 janvier 2024.",
        )
        await repository.set_extraction(
            scan, status=ExtractionStatus.unextractable, text=None
        )

        readable_documents = await repository.list_readable_documents(dossier.id)
        titles = [d.title for d in readable_documents]
        assert titles == ["PV de saisie-attribution"]
        # Both remain in the file for the humans.
        assert len(await repository.list_documents(dossier.id)) == 2

    async def test_piece_numbers_are_sequential_per_matter(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        organization = await create_organization(save_fixture)
        repository = DossierRepository.from_session(session)
        dossier = await repository.create_dossier(
            organization_id=organization.id,
            name="Numérotation",
            created_by_id=user.id,
        )
        assert await repository.next_piece_number(dossier.id) == 1


class TestFactFabricationGuard:
    """A quote credited to a pièce must be in that pièce."""

    def test_typography_and_spacing_do_not_defeat_a_genuine_quote(self) -> None:
        document = SourceRef(
            kind="document",
            id="x",
            title="PIÈCE n° 4",
            text="L’acte de saisie a été signifié  le 12 janvier 2024.",
        )
        model_quote = "L'acte de saisie a été signifié le 12 janvier 2024."
        assert normalize_quote(model_quote) in normalize_quote(document.text or "")

    def test_invented_quote_does_not_match(self) -> None:
        document = SourceRef(
            kind="document",
            id="x",
            title="PIÈCE n° 4",
            text="L'acte de saisie a été signifié le 12 janvier 2024.",
        )
        invented = "La créance s'élève à 45 000 000 FCFA."
        assert normalize_quote(invented) not in normalize_quote(document.text or "")
