"""The Chain's own routes. Mounted by the lead at integration, not here.

Three promises, three routes, plus the original stateless one:

- ``POST /chain/documents/{artifact_id}/extract`` — read a stored
  document version and write its facts and refusals down (D2's
  « facts persisted at extraction »).
- ``GET /chain/facts/{fact_id}`` — fact id ⇒ page + box, served: the
  D2 one-liner, in the approved schema's field names.
- ``GET /chain/documents/{artifact_id}/facts`` — everything the store
  holds for one document version, refusals alongside, so « which pages
  were not covered » is one call.
- ``POST /chain/extract`` — the original stateless route: upload a
  PDF, get the extraction back, nothing stored. Kept because a caller
  checking a document *before* it enters a deal is a real case.

Access is the engine's own rule, restated: a route that checks the
scope and forgets the membership is the widest hole this product could
have. Every stored-fact route resolves the deal and requires the
caller on it — 404, never 403, so an id leaks nothing about existence.

Auth reuses the tie-out pair: reading facts is reading; extracting
into the store writes rows a deal will rest on, so it takes the write
pair, exactly as confirming a link does.
"""

import io
from uuid import UUID

from fastapi import Depends, File, HTTPException, UploadFile

from polar.exceptions import ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.kit.schemas import Schema
from polar.models.tieout import Artifact
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter

from .. import auth, storage
from ..repository import TieOutRepository
from .extract import EXTRACTOR_NAME, EXTRACTOR_VERSION, Extraction, extract_pdf
from .propose import Abstained, propose
from .repository import ChainFactRepository, ChainRefusalRepository
from .store import ChainFact, ChainRefusal, persist_extraction

router = APIRouter(prefix="/chain", tags=["chain", APITag.private])

NOT_FOUND = "Fact not found."

#: Source documents run bigger than models — a data-room PDF with maps
#: and photographs is tens of megabytes — but past this it is a mistake
#: worth catching before pdfminer chews on it.
MAX_UPLOAD_BYTES = 64 * 1024 * 1024

#: What measurement says about link proposals today. This sentence
#: travels with every proposal response; it is updated only from a
#: registered round's result recorded in the Scribe log.
PROPOSAL_STANDING = (
    "Measured, and it does not work on tables: in round 5, on a real "
    "document-fed corpus, the matcher proposed the correct source 0 "
    "times out of 18 cells whose document states them - it abstains "
    "because a table row carries several numbers and its anchor is "
    "the line. It stays quiet rather than guessing (30 of 30 correct "
    "abstentions where nothing was there to find, rounds 1-3). A "
    "proposal is a candidate for a person to check against the cited "
    "page - never a link."
)


# --- access --------------------------------------------------------------


async def _artifact_for(
    session: AsyncSession | AsyncReadSession, artifact_id: UUID, user_id: UUID
) -> Artifact:
    """The document version, if the caller is on its deal. Else 404."""
    from polar.dossier.repository import DossierRepository

    artifact = await TieOutRepository.from_session(session).get_artifact(artifact_id)
    if artifact is None:
        raise ResourceNotFound("Document not found.")
    deal = await DossierRepository.from_session(session).get_for_user(
        artifact.dossier_id, user_id
    )
    if deal is None:
        raise ResourceNotFound("Document not found.")
    return artifact


# --- shapes --------------------------------------------------------------


class BoxRead(Schema):
    x0: float
    top: float
    x1: float
    bottom: float


class ExtractorRead(Schema):
    name: str
    version: str


class FactRead(Schema):
    """One fact, in the approved contract's own field names.

    `document_version_id` is the artifact (one upload, one version);
    `document_id` is its lineage, shared by every version of the same
    document.
    """

    id: UUID
    document_id: UUID
    document_version_id: UUID
    page: int
    page_width: float
    page_height: float
    box: BoxRead
    text: str
    value: float
    line: str
    column: str
    extractor: ExtractorRead

    @classmethod
    def from_row(cls, fact: ChainFact, artifact: Artifact) -> "FactRead":
        return cls(
            id=fact.id,
            document_id=artifact.lineage_id,
            document_version_id=artifact.id,
            page=fact.page,
            page_width=fact.page_width,
            page_height=fact.page_height,
            box=BoxRead(x0=fact.x0, top=fact.top, x1=fact.x1, bottom=fact.bottom),
            text=fact.text,
            value=fact.value,
            line=fact.line,
            column=fact.column,
            extractor=ExtractorRead(
                name=fact.extractor_name, version=fact.extractor_version
            ),
        )


class RefusalRead(Schema):
    """A page the store knows was never read, and why, in words."""

    document_version_id: UUID
    page: int
    reason: str

    @classmethod
    def from_row(cls, refusal: ChainRefusal) -> "RefusalRead":
        return cls(
            document_version_id=refusal.artifact_id,
            page=refusal.page,
            reason=refusal.reason,
        )


class DocumentFactsRead(Schema):
    """One document version's whole record: facts, refusals, coverage."""

    document_id: UUID
    document_version_id: UUID
    facts: list[FactRead]
    refusals: list[RefusalRead]


# --- the stateless route (unchanged contract, now with lines) ------------


class NumberRead(Schema):
    page: int
    text: str
    value: float
    box: BoxRead
    line: str
    column: str


class PageRead(Schema):
    page: int
    width: float
    height: float


class LooseRefusalRead(Schema):
    page: int
    reason: str


class ExtractionRead(Schema):
    """What D1 promises, over the wire: numbers, refusals, page sizes."""

    filename: str
    numbers: list[NumberRead]
    refusals: list[LooseRefusalRead]
    pages: list[PageRead]

    @classmethod
    def from_extraction(cls, filename: str, extraction: Extraction) -> "ExtractionRead":
        return cls(
            filename=filename,
            numbers=[
                NumberRead(
                    page=n.page,
                    text=n.text,
                    value=n.value,
                    box=BoxRead(
                        x0=n.box.x0, top=n.box.top, x1=n.box.x1, bottom=n.box.bottom
                    ),
                    line=n.line,
                    column=n.column,
                )
                for n in extraction.numbers
            ],
            refusals=[
                LooseRefusalRead(page=r.page, reason=r.reason)
                for r in extraction.refusals
            ],
            pages=[
                PageRead(page=p.page, width=p.width, height=p.height)
                for p in extraction.pages
            ],
        )


@router.post("/extract", response_model=ExtractionRead)
async def extract(
    auth_subject: auth.TieOutRead,
    upload: UploadFile = File(..., alias="file"),
) -> ExtractionRead:
    """Every number in an uploaded PDF, cited to a page and a box.

    Stateless: nothing is stored. Pages the extractor cannot honestly
    read come back as refusals in words, never as silence — the caller
    always knows which pages were actually covered.
    """
    payload = await upload.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is too large to read.")
    if not payload.startswith(b"%PDF"):
        raise HTTPException(
            status_code=415,
            detail=(
                f"{upload.filename or 'That file'} is not a PDF, and the "
                "Chain's extraction only speaks PDF for now."
            ),
        )

    try:
        extraction = extract_pdf(io.BytesIO(payload))
    except Exception:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{upload.filename or 'That file'} says it is a PDF but "
                "could not be opened as one."
            ),
        )

    return ExtractionRead.from_extraction(upload.filename or "upload", extraction)


# --- the fact store ------------------------------------------------------


@router.post("/documents/{artifact_id}/extract", response_model=DocumentFactsRead)
async def extract_document(
    artifact_id: UUID,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> DocumentFactsRead:
    """Read a stored document version and write its facts down.

    Idempotent by construction: fact ids are deterministic in the
    (document version, extractor version) pair, and persisting replaces
    the earlier extraction wholesale — running this twice leaves the
    store exactly as running it once did.
    """
    artifact = await _artifact_for(session, artifact_id, auth_subject.subject.id)
    if not artifact.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=415,
            detail=(
                f"{artifact.filename} is not a PDF. The Chain reads source "
                "documents; models and decks already have their own readers."
            ),
        )

    try:
        payload = storage.fetch(artifact)
    except storage.FileNotKept as problem:
        raise HTTPException(status_code=409, detail=str(problem))

    try:
        extraction = extract_pdf(io.BytesIO(payload))
    except Exception:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{artifact.filename} says it is a PDF but could not be opened as one."
            ),
        )

    facts, refusals = await persist_extraction(session, artifact, extraction)
    return DocumentFactsRead(
        document_id=artifact.lineage_id,
        document_version_id=artifact.id,
        facts=[FactRead.from_row(fact, artifact) for fact in facts],
        refusals=[RefusalRead.from_row(refusal) for refusal in refusals],
    )


@router.get("/facts/{fact_id}", response_model=FactRead)
async def get_fact(
    fact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> FactRead:
    """Fact id ⇒ page + box. The D2 promise, one route."""
    row = await ChainFactRepository.from_session(session).get(fact_id)
    if row is None:
        raise ResourceNotFound(NOT_FOUND)
    fact, artifact = row
    await _artifact_for(session, artifact.id, auth_subject.subject.id)
    return FactRead.from_row(fact, artifact)


@router.get("/documents/{artifact_id}/facts", response_model=DocumentFactsRead)
async def list_document_facts(
    artifact_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> DocumentFactsRead:
    """One document version's stored record, refusals alongside."""
    artifact = await _artifact_for(session, artifact_id, auth_subject.subject.id)
    facts = await ChainFactRepository.from_session(session).list_for_artifact(
        artifact.id
    )
    refusals = await ChainRefusalRepository.from_session(session).list_for_artifact(
        artifact.id
    )
    return DocumentFactsRead(
        document_id=artifact.lineage_id,
        document_version_id=artifact.id,
        facts=[FactRead.from_row(fact, artifact) for fact in facts],
        refusals=[RefusalRead.from_row(refusal) for refusal in refusals],
    )


# --- link proposal (D3) --------------------------------------------------


class RankedCandidateRead(Schema):
    """One candidate's score, for the screen that shows alternates."""

    fact_id: UUID
    score: float
    shared: list[str]
    #: The candidate's number is a document reference (a section, table
    #: or page pointer) — shown, never proposed.
    reference: bool


class ProposalRead(Schema):
    """The matcher's answer for one typed cell: a fact, or a reason.

    Exactly one of `proposed` and `reason` is set. `candidates` is the
    ranking behind either answer (top five), so a reviewer can see what
    the labels saw — including on an abstention, where the tie or the
    weak coverage is visible rather than asserted.
    """

    cell_id: UUID
    cell_labels: str
    proposed: FactRead | None
    score: float | None
    shared: list[str]
    reason: str | None
    candidates: list[RankedCandidateRead]
    #: The measured record, in-band, so no consumer can present a
    #: proposal as more than it is. Changes only when a registered
    #: round's measured number changes.
    standing: str


@router.get("/cells/{cell_id}/proposals", response_model=ProposalRead)
async def propose_for_cell(
    cell_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ProposalRead:
    """Candidate document facts for one typed model number.

    Labels near both, never by value; abstention when candidates tie or
    coverage is weak — the registered D3 rule, served. Proposing is
    read-only: confirming a link is D4's deliberate write, not this.
    """
    cell = await TieOutRepository.from_session(session).get_cell(cell_id)
    if cell is None:
        raise ResourceNotFound("Cell not found.")
    await _artifact_for(session, cell.artifact_id, auth_subject.subject.id)

    if cell.formula is not None or cell.alias_of is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{cell.ref} is computed from other cells, not typed, so "
                "it has no outside source to propose — its provenance is "
                "its formula."
            ),
        )
    if cell.value is None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{cell.ref} holds no value, so there is no number to "
                "find a source for."
            ),
        )

    cell_artifact = await TieOutRepository.from_session(session).get_artifact(
        cell.artifact_id
    )
    assert cell_artifact is not None  # _artifact_for above already found it
    pool = await ChainFactRepository.from_session(session).list_for_dossier(
        cell_artifact.dossier_id
    )
    by_id = {fact.id: (fact, artifact) for fact, artifact in pool}

    labels = cell.name or f"{cell.row_label} {cell.column_label}".strip()
    answer = propose(
        labels, [(fact.id, fact.line, fact.text, fact.column) for fact, _ in pool]
    )

    ranked = [
        RankedCandidateRead(
            fact_id=candidate.fact_id,
            score=candidate.score,
            shared=list(candidate.shared),
            reference=candidate.reference,
        )
        for candidate in answer.ranked[:5]
    ]
    if isinstance(answer, Abstained):
        return ProposalRead(
            cell_id=cell.id,
            cell_labels=labels,
            proposed=None,
            score=None,
            shared=[],
            reason=answer.reason,
            candidates=ranked,
            standing=PROPOSAL_STANDING,
        )
    fact, artifact = by_id[answer.candidate.fact_id]
    return ProposalRead(
        cell_id=cell.id,
        cell_labels=labels,
        proposed=FactRead.from_row(fact, artifact),
        score=answer.candidate.score,
        shared=list(answer.candidate.shared),
        reason=None,
        candidates=ranked,
        standing=PROPOSAL_STANDING,
    )


__all__ = [
    "EXTRACTOR_NAME",
    "EXTRACTOR_VERSION",
    "router",
]
