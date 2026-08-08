"""Dossiers: a workspace per matter.

Two responsibilities live here:

- **Reading the file.** An uploaded piece becomes readable text, or it is
  honestly marked unreadable. A scan without OCR is never passed to the
  model as though its contents were known.
- **Asking with the matter in hand.** A question asked inside a dossier
  carries its documents into the answer, and the answer is written back as
  the matter's record — with every claim's source kept, and facts marked
  apart from law.

An answer inside a matter is a record, not a chat: it is produced in full
and persisted within the request that asked for it, so what the team reads
later is exactly what was stored — never a stream the client reassembled.
"""

from typing import Any
from uuid import UUID

import structlog

from polar.file.s3 import S3_SERVICES
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.kit.document_text import UnsupportedDocument, read_document
from polar.librarian.service import librarian
from polar.models import (
    CitationNature,
    CitationSourceKind,
    DocumentCategory,
    Dossier,
    DossierDocument,
    DossierQuestion,
    ExtractionStatus,
    File,
    QuestionStatus,
)
from polar.models.file import FileServiceTypes

from .repository import DossierRepository

log = structlog.get_logger()

# Below this, an extraction is a scan with a few stray glyphs rather than a
# document we can honestly claim to have read.
MIN_EXTRACTED_CHARS = 40


class DossierService:
    # --- reading the file ------------------------------------------------

    def extract_text(self, payload: bytes, mime_type: str) -> tuple[str | None, str]:
        """Return ``(text, reason)`` — text is None when nothing readable.

        The reason becomes a visible extraction status in the file list,
        rather than an empty document silently entering an answer.
        """
        try:
            text = read_document(payload, mime_type).text
        except UnsupportedDocument:
            return None, "unsupported_type"
        except Exception as e:
            log.warning("dossier.extract.failed", error=str(e)[:160])
            return None, "extraction_failed"
        if len(text.strip()) < MIN_EXTRACTED_CHARS:
            return None, "no_text_layer"
        return text, "extracted"

    async def extract_document(
        self, session: AsyncSession, document: DossierDocument, file: File
    ) -> DossierDocument:
        """Fetch the stored object and record what could be read from it."""
        repository = DossierRepository.from_session(session)
        s3 = S3_SERVICES[FileServiceTypes.dossier_document]
        try:
            obj = s3.get_object_or_raise(file.path, file.storage_version or "")
            payload = obj["Body"].read()
        except Exception as e:
            log.warning("dossier.extract.fetch_failed", error=str(e)[:160])
            return await repository.set_extraction(
                document, status=ExtractionStatus.failed, text=None
            )

        text, reason = self.extract_text(payload, file.mime_type)
        if text is None:
            status = (
                ExtractionStatus.unextractable
                if reason in ("no_text_layer", "unsupported_type")
                else ExtractionStatus.failed
            )
            log.info(
                "dossier.extract.unreadable", document=str(document.id), reason=reason
            )
            return await repository.set_extraction(document, status=status, text=None)

        return await repository.set_extraction(
            document, status=ExtractionStatus.extracted, text=text
        )

    # --- asking with the matter in hand ----------------------------------

    async def ask(
        self,
        session: AsyncSession,
        read_session: AsyncReadSession,
        *,
        dossier: Dossier,
        user_id: UUID,
        question: str,
        answer_both_versions: bool = False,
    ) -> DossierQuestion:
        """Answer inside the matter and keep the result as its record.

        The question row is written before the answer is produced, so a
        matter never loses the fact that something was asked — even if the
        answer fails.
        """
        repository = DossierRepository.from_session(session)
        documents = await repository.list_readable_documents(dossier.id)
        row = await repository.create_question(
            dossier_id=dossier.id, asked_by_id=user_id, question=question
        )

        answer_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        status = QuestionStatus.failed
        versions_used: list[str] | None = None
        authority_label: str | None = None
        authority_count: int | None = None
        clarification: str | None = None

        async for event in librarian.answer_stream(
            read_session,
            question,
            answer_both_versions=answer_both_versions,
            case_documents=documents,
        ):
            kind = event["type"]
            if kind == "text":
                answer_parts.append(event["delta"])
            elif kind == "citation":
                citations.append(event)
            elif kind == "authority":
                authority_label = event.get("label")
                authority_count = event.get("count")
            elif kind == "clarification":
                status = QuestionStatus.clarification_requested
                clarification = event.get("message")
            elif kind == "done":
                status = QuestionStatus.answered
                versions_used = event.get("versions_used") or []
            elif kind == "error":
                log.warning("dossier.ask.failed", message=event.get("message"))

        await repository.record_answer(
            row,
            answer="".join(answer_parts) or clarification,
            status=status,
            versions_used=versions_used,
            authority_label=authority_label,
            authority_count=authority_count,
        )

        # Citations are deduplicated on (source, quote): the model often
        # cites one passage for several sentences, and the matter's record
        # should show a source once.
        seen: set[tuple[str, str]] = set()
        for citation in citations:
            source_id = citation.get("source_id")
            quote = (citation.get("quote") or "").strip()
            key = (str(source_id), quote)
            if not quote or key in seen:
                continue
            seen.add(key)
            source_kind = citation.get("source_kind") or "article"
            await repository.add_citation(
                question_id=row.id,
                nature=(
                    CitationNature.fact
                    if citation.get("nature") == "fact"
                    else CitationNature.law
                ),
                source_kind=CitationSourceKind(source_kind),
                source_id=UUID(source_id) if source_id else None,
                title=(citation.get("title") or "?")[:512],
                quote=quote,
            )
        return row

    # --- helpers ----------------------------------------------------------

    def guess_category(self, filename: str) -> DocumentCategory:
        """A first guess from the filename; the lawyer can always correct it."""
        name = filename.lower()
        if any(w in name for w in ("conclusion", "assignation", "requête", "requete")):
            return DocumentCategory.pleading
        if any(w in name for w in ("pv ", "proces-verbal", "procès-verbal", "constat")):
            return DocumentCategory.exhibit
        if any(w in name for w in ("contrat", "convention", "bail")):
            return DocumentCategory.contract
        if any(w in name for w in ("releve", "relevé", "decompte", "décompte")):
            return DocumentCategory.statement
        if any(w in name for w in ("courrier", "lettre", "mise en demeure")):
            return DocumentCategory.correspondence
        if any(w in name for w in ("jugement", "arret", "arrêt", "ordonnance")):
            return DocumentCategory.decision
        return DocumentCategory.other


dossier_service = DossierService()
