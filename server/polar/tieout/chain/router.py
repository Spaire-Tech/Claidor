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
from datetime import UTC, datetime
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
from .anchor import (
    AGREES,
    BOTH_MOVED,
    MODEL_MOVED,
    SOURCE_MOVED,
    Anchored,
    Broken,
    DocumentAnchor,
    ModelAnchor,
    reanchor_document,
    reanchor_model,
    recheck,
    with_ordinals,
)
from .extract import EXTRACTOR_NAME, EXTRACTOR_VERSION, Extraction, extract_pdf
from .link import ChainLink, LinkState
from .propose import Abstained, propose
from .repository import (
    ChainFactRepository,
    ChainLinkRepository,
    ChainRefusalRepository,
)
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
    "Measured, and it does not work on tables: over the whole drawn "
    "sample of a real document-fed corpus, the matcher proposed the "
    "correct source 0 times out of 36 cells whose document states "
    "them - it abstains because a table row carries several numbers "
    "and its anchor is the line. Earlier rounds of this measurement "
    "reported 0 of 18, on a smaller denominator: the rows the judge "
    "had set aside were the same rows the matcher finds hardest, and "
    "35 is the honest count. It stays quiet rather than guessing (30 "
    "of 30 correct abstentions where nothing was there to find, "
    "rounds 1-3). A proposal is a candidate for a person to check "
    "against the cited page - never a link."
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


# --- D4: confirmed links -------------------------------------------------


class LinkRead(Schema):
    """A confirmed link, in the approved schema's own field names."""

    id: UUID
    dossier_id: UUID
    state: str
    document: dict[str, object]
    model: dict[str, object]
    transformation: str
    scale: float
    basis: str
    note: str
    confirmed_by_id: UUID | None
    confirmed_at: datetime

    @classmethod
    def of(cls, link: ChainLink) -> "LinkRead":
        return cls(
            id=link.id,
            dossier_id=link.dossier_id,
            state=str(link.state),
            document={
                "document_id": str(link.document_id),
                "document_version_id": str(link.document_version_id),
                "fact_id": str(link.fact_id) if link.fact_id else None,
                "page": link.page,
                "printed_text": link.printed_text,
                "anchor_line": link.anchor_line,
                "ordinal_in_line": link.ordinal_in_line,
                "value_at_confirmation": link.document_value_at_confirmation,
            },
            model={
                "model_id": str(link.model_id),
                "model_version_id": str(link.model_version_id),
                "cell_id": str(link.cell_id),
                "ref": link.model_ref,
                "cell_name": link.cell_name,
                "value_at_confirmation": link.model_value_at_confirmation,
            },
            transformation=link.transformation,
            scale=link.scale,
            basis=link.basis,
            note=link.note,
            confirmed_by_id=link.confirmed_by_id,
            confirmed_at=link.confirmed_at,
        )


class ConfirmLink(Schema):
    """What a person states when they confirm. Nothing here is inferred."""

    cell_id: UUID
    fact_id: UUID
    #: document value × scale = model value. **The person states it.**
    #: Swens never infers a scale: unit inference is Track E's, and this
    #: field is deliberately the boundary between them.
    scale: float = 1.0
    transformation: str = "identity"
    basis: str = ""
    note: str = ""


@router.post("/links", response_model=LinkRead, status_code=201)
async def confirm_link(
    body: ConfirmLink,
    auth_subject: auth.TieOutWrite,
    session: AsyncSession = Depends(get_db_session),
) -> LinkRead:
    """A person vouches that this cell comes from this document figure.

    The write D3 does not make. Both sides are checked to be on the same
    deal, and everything the re-check will ever need is captured now —
    the labels that re-find the pair, and both values, so a later check
    can say which side moved.

    Confirming the same pair twice updates the one row rather than
    growing two contradictory ones.
    """
    repository = TieOutRepository.from_session(session)
    cell = await repository.get_cell(body.cell_id)
    if cell is None:
        raise ResourceNotFound("Cell not found.")
    model_artifact = await _artifact_for(
        session, cell.artifact_id, auth_subject.subject.id
    )

    found = await ChainFactRepository.from_session(session).get(body.fact_id)
    if found is None:
        raise ResourceNotFound(NOT_FOUND)
    fact, document_artifact = found
    if document_artifact.dossier_id != model_artifact.dossier_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "That cell and that figure belong to different deals, so "
                "one cannot be the source of the other."
            ),
        )
    if cell.value is None:
        raise HTTPException(
            status_code=409,
            detail=f"{cell.ref} holds no value, so there is nothing to confirm.",
        )
    if body.scale <= 0:
        raise HTTPException(
            status_code=422,
            detail="Scale must be greater than zero: document value × scale = model value.",
        )

    #: The tiebreak is only sound if confirmation and re-anchoring count
    #: the same way, so this uses `anchor.with_ordinals` rather than
    #: re-deriving it — the first cut of this route counted every fact
    #: on the page sharing the line's *text*, which is the exact bug
    #: `with_ordinals` documents and avoids: two identical lines on one
    #: page would be numbered 1,2,3,4 across both instead of 1,2 and
    #: 1,2, and the tiebreak would then never match.
    ordered = await ChainFactRepository.from_session(session).list_for_artifact(
        fact.artifact_id
    )
    ordinals = {
        row.id: ordinal
        for row, (_, _, ordinal, _, _) in zip(
            ordered, with_ordinals(ordered), strict=True
        )
    }

    links = ChainLinkRepository.from_session(session)
    existing = await links.find_pair(model_artifact.dossier_id, cell.id, fact.id)
    values = {
        "state": LinkState.confirmed,
        "document_id": document_artifact.lineage_id,
        "document_version_id": document_artifact.id,
        "fact_id": fact.id,
        "page": fact.page,
        "printed_text": fact.text,
        "anchor_line": fact.line,
        "ordinal_in_line": ordinals.get(fact.id, 1),
        "document_value_at_confirmation": fact.value,
        "model_id": model_artifact.lineage_id,
        "model_version_id": model_artifact.id,
        "cell_id": cell.id,
        "model_ref": cell.ref,
        "cell_name": cell.name or f"{cell.row_label} {cell.column_label}".strip(),
        "model_value_at_confirmation": float(cell.value),
        "transformation": body.transformation,
        "scale": body.scale,
        "basis": body.basis,
        "note": body.note,
        "confirmed_by_id": auth_subject.subject.id,
        "confirmed_at": datetime.now(UTC),
    }
    if existing is not None:
        link = await links.update(existing, update_dict=values)
    else:
        link = await links.create(
            ChainLink(dossier_id=model_artifact.dossier_id, **values), flush=True
        )
    return LinkRead.of(link)


@router.get("/dossiers/{dossier_id}/links", response_model=list[LinkRead])
async def list_links(
    dossier_id: UUID,
    auth_subject: auth.TieOutRead,
    state: str | None = None,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[LinkRead]:
    """The deal's confirmed links, newest first; `state` narrows them."""
    from polar.dossier.repository import DossierRepository

    dossier = await DossierRepository.from_session(session).get_for_user(
        dossier_id, auth_subject.subject.id
    )
    if dossier is None:
        raise ResourceNotFound("Deal not found.")
    wanted = None
    if state is not None:
        try:
            wanted = LinkState(state)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"'{state}' is not a link state. They are: "
                    + ", ".join(s.value for s in LinkState)
                    + " — and note there is no 'proposed': a proposal is "
                    "computed on demand and never stored."
                ),
            ) from None
    found = await ChainLinkRepository.from_session(session).list_for_dossier(
        dossier_id, state=wanted
    )
    return [LinkRead.of(link) for link in found]


class RecheckRead(Schema):
    """One confirmed link, re-checked against a named pair of versions."""

    link_id: UUID
    cell_name: str
    #: agrees / the model moved / the source moved / both moved, or the
    #: anchoring outcome that stopped the arithmetic happening at all.
    verdict: str
    #: True only when the pair still ties out under the stated scale.
    #: Reported separately from the verdict on purpose: « both moved »
    #: and still agreeing is a deal team that updated everything, and
    #: « both moved » and not agreeing is one that updated half of it.
    ties_out_now: bool | None
    #: Where each side was re-found, and how. Null when it was not.
    model_ref_now: str | None
    document_key_now: str | None
    #: In words, whenever the answer is anything but plain agreement.
    detail: str


class RecheckSummaryRead(Schema):
    """What a re-check of one deal's confirmed map came to."""

    dossier_id: UUID
    model_version_id: UUID
    document_version_id: UUID
    checked: int
    #: The registered vocabulary, counted.
    tallies: dict[str, int]
    results: list[RecheckRead]
    #: A structural fact, not a runtime count: this package imports no
    #: model client, so after confirmation there is no inference left —
    #: re-anchoring is a lookup by name and the answer is arithmetic.
    model_calls: int = 0


@router.post("/dossiers/{dossier_id}/recheck", response_model=RecheckSummaryRead)
async def recheck_links(
    dossier_id: UUID,
    model_version_id: UUID,
    document_version_id: UUID,
    auth_subject: auth.TieOutRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> RecheckSummaryRead:
    """Confirm once, arithmetic forever — the « forever » half.

    Takes the deal's confirmed links and asks, of a *newer* pair of
    versions: is each side still there, and do the two numbers still
    agree? Both anchors are labels — the cell's own name and the
    printed line — so a row inserted above the cell or a repaginated
    document changes nothing, while a renamed row is honestly reported
    as broken rather than silently re-pointed.

    **No matching happens here and no model is called.** That is
    structural: this package imports no model client at all, and after
    confirmation there is nothing left to infer.
    """
    from polar.dossier.repository import DossierRepository

    deal = await DossierRepository.from_session(session).get_for_user(
        dossier_id, auth_subject.subject.id
    )
    if deal is None:
        raise ResourceNotFound("Deal not found.")

    repository = TieOutRepository.from_session(session)
    model_artifact = await repository.get_artifact(model_version_id)
    document_artifact = await repository.get_artifact(document_version_id)
    for artifact, what in ((model_artifact, "model"), (document_artifact, "document")):
        if artifact is None or artifact.dossier_id != dossier_id:
            raise ResourceNotFound(f"That {what} version is not on this deal.")
    assert model_artifact is not None  # the loop above raised otherwise
    assert document_artifact is not None

    cells = [
        (
            cell.ref,
            cell.name or f"{cell.row_label} {cell.column_label}".strip(),
            float(cell.value) if cell.value is not None else 0.0,
        )
        for cell in await repository.cells_of(model_artifact.id)
    ]
    facts = with_ordinals(
        await ChainFactRepository.from_session(session).list_for_artifact(
            document_artifact.id
        )
    )

    links = await ChainLinkRepository.from_session(session).list_for_dossier(
        dossier_id, state=LinkState.confirmed
    )

    results: list[RecheckRead] = []
    tallies: dict[str, int] = {}
    for link in links:
        model_anchor = ModelAnchor(
            ref=link.model_ref,
            cell_name=link.cell_name,
            value=link.model_value_at_confirmation,
        )
        document_anchor = DocumentAnchor(
            page=link.page,
            printed_text=link.printed_text,
            value=link.document_value_at_confirmation,
            anchor_line=link.anchor_line,
            ordinal_in_line=link.ordinal_in_line,
        )
        model_side = reanchor_model(model_anchor, cells)
        document_side = reanchor_document(document_anchor, facts)

        stopped = next(
            (
                side
                for side in (model_side, document_side)
                if not isinstance(side, Anchored)
            ),
            None,
        )
        if stopped is not None:
            verdict = "broken" if isinstance(stopped, Broken) else "ambiguous"
            detail = stopped.reason
            ties = None
            model_ref_now = model_side.key if isinstance(model_side, Anchored) else None
            document_key_now = (
                document_side.key if isinstance(document_side, Anchored) else None
            )
        else:
            assert isinstance(model_side, Anchored)
            assert isinstance(document_side, Anchored)
            verdict, ties = recheck(
                model_anchor,
                document_anchor,
                model_side.value,
                float(document_side.value),
                scale=link.scale,
            )
            model_ref_now = model_side.key
            document_key_now = document_side.key
            detail = _recheck_detail(link, verdict, ties, model_side, document_side)

        tallies[verdict] = tallies.get(verdict, 0) + 1
        results.append(
            RecheckRead(
                link_id=link.id,
                cell_name=link.cell_name,
                verdict=verdict,
                ties_out_now=ties,
                model_ref_now=model_ref_now,
                document_key_now=document_key_now,
                detail=detail,
            )
        )

    return RecheckSummaryRead(
        dossier_id=dossier_id,
        model_version_id=model_version_id,
        document_version_id=document_version_id,
        checked=len(links),
        tallies=tallies,
        results=results,
    )


def _recheck_detail(
    link: ChainLink,
    verdict: str,
    ties_out: bool,
    model_side: "Anchored",
    document_side: "Anchored",
) -> str:
    """The sentence a reviewer reads, with both numbers in it.

    A verdict without its numbers makes a person go and look them up,
    which is the work this is supposed to save.
    """
    if verdict == AGREES:
        return ""
    moved = []
    if verdict in (MODEL_MOVED, BOTH_MOVED):
        moved.append(
            f"the model moved, {link.model_value_at_confirmation:g} → "
            f"{float(model_side.value):g}"
        )
    if verdict in (SOURCE_MOVED, BOTH_MOVED):
        moved.append(
            f"the source moved, {link.document_value_at_confirmation:g} → "
            f"{document_side.value:g}"
        )
    tail = (
        " and the pair still ties out."
        if ties_out
        else " and the pair no longer ties out."
    )
    return "; ".join(moved).capitalize() + tail
