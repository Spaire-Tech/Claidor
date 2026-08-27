"""The fact store — D2's contract, persisted as rows.

The shape is the one approved from the Scribe log: a fact is one
printed number, cited to the exact document version, page and box it
was read from, carrying its printed line for label anchoring and its
extractor's name and version for provenance. Refusals are stored
alongside facts so « which pages were not covered » stays answerable
forever — D5, the unsourced-number finding, depends on that record
existing.

Two mappings from the approved schema to the engine's tables, named
here so nobody has to guess: `document_version_id` is
`tieout_artifacts.id` (an upload of a document at one version), and
`document_id` is that artifact's `lineage_id` (versions of one
document share it). The serving schema in `router.py` translates back
out to the approved field names.

**Fact ids are deterministic.** The approved contract promises an id
that never changes across re-extraction of the same document version,
because D4's confirmed links hang off it. So the id is a UUID5 over
(artifact, extractor version, page, ordinal, printed text) rather than
a random draw — running extraction twice writes the same rows with the
same ids, and persisting is a delete-and-rewrite that is idempotent by
construction. A bumped extractor version yields new ids on purpose:
different code read the page, so they are different claims.
"""

import uuid
from uuid import UUID

from sqlalchemy import Float, ForeignKey, Integer, String, Text, Uuid, delete
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel
from polar.kit.db.postgres import AsyncSession
from polar.models.tieout import Artifact

from .extract import EXTRACTOR_NAME, EXTRACTOR_VERSION, Extraction

#: Fixed namespace for fact ids. Never change it: every confirmed link
#: in every deal points at ids derived through it.
FACT_NAMESPACE = uuid.UUID("6f6c1c3e-9d1a-5e6b-8a2f-0d4c8b7a1e29")


def fact_id(
    artifact_id: UUID, extractor_version: str, page: int, ordinal: int, text: str
) -> UUID:
    """The stable id of one fact: same extraction in ⇒ same id out."""
    return uuid.uuid5(
        FACT_NAMESPACE,
        f"{artifact_id}|{extractor_version}|{page}|{ordinal}|{text}",
    )


class ChainFact(RecordModel):
    """One printed number, cited to its page and box, forever.

    The box is flattened into four columns rather than kept as JSON —
    the engine's rule that everything works off rows, applied here: a
    query can ask « every fact on page 4 » or « facts whose box sits in
    this column » without opening a blob.
    """

    __tablename__ = "tieout_chain_facts"

    #: The document version this fact is true of — the approved
    #: schema's `document_version_id`. Its `lineage_id` is the schema's
    #: `document_id`.
    artifact_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def artifact(cls) -> Mapped["Artifact"]:
        return relationship("Artifact", lazy="raise")

    page: Mapped[int] = mapped_column(Integer, nullable=False)
    page_width: Mapped[float] = mapped_column(Float, nullable=False)
    page_height: Mapped[float] = mapped_column(Float, nullable=False)

    #: PDF points, top-left origin — highlight this rectangle and you
    #: highlight the figure.
    x0: Mapped[float] = mapped_column(Float, nullable=False)
    top: Mapped[float] = mapped_column(Float, nullable=False)
    x1: Mapped[float] = mapped_column(Float, nullable=False)
    bottom: Mapped[float] = mapped_column(Float, nullable=False)

    #: The token exactly as printed. The authoritative record; `value`
    #: is derived.
    text: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)

    #: The printed line the token sits in — the label neighborhood D3
    #: matches on and D4 anchors by. No opinion about which words in it
    #: are the label; that inference lives in D3 where it is measured.
    line: Mapped[str] = mapped_column(Text, nullable=False)

    #: The column header above the figure — the other half of a table
    #: cell's identity, added at extractor version 3 (round 6).
    column: Mapped[str] = mapped_column(Text, nullable=False, default="")

    extractor_name: Mapped[str] = mapped_column(String(128), nullable=False)
    extractor_version: Mapped[str] = mapped_column(String(32), nullable=False)


class ChainRefusal(RecordModel):
    """A page the extractor would not pretend to read, on the record.

    Stored with the same permanence as facts: a coverage question
    (« was page 2 ever read? ») must stay answerable after everyone has
    forgotten the upload.
    """

    __tablename__ = "tieout_chain_refusals"

    artifact_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def artifact(cls) -> Mapped["Artifact"]:
        return relationship("Artifact", lazy="raise")

    page: Mapped[int] = mapped_column(Integer, nullable=False)

    #: In words, as produced — never a code.
    reason: Mapped[str] = mapped_column(Text, nullable=False)


async def persist_extraction(
    session: AsyncSession, artifact: Artifact, extraction: Extraction
) -> tuple[list[ChainFact], list[ChainRefusal]]:
    """Write one extraction down, replacing any earlier one wholesale.

    Delete-and-rewrite, not merge: the extraction is a pure function of
    (document version, extractor version), and the deterministic ids
    make re-running it write byte-identical rows. Facts from an older
    extractor version disappear here on purpose — two versions' claims
    about one page must never sit in the store together.
    """
    await session.execute(delete(ChainFact).where(ChainFact.artifact_id == artifact.id))
    await session.execute(
        delete(ChainRefusal).where(ChainRefusal.artifact_id == artifact.id)
    )

    sizes = {size.page: size for size in extraction.pages}
    facts = [
        ChainFact(
            id=fact_id(
                artifact.id, EXTRACTOR_VERSION, number.page, ordinal, number.text
            ),
            artifact_id=artifact.id,
            page=number.page,
            page_width=sizes[number.page].width,
            page_height=sizes[number.page].height,
            x0=number.box.x0,
            top=number.box.top,
            x1=number.box.x1,
            bottom=number.box.bottom,
            text=number.text,
            value=number.value,
            line=number.line,
            column=number.column,
            extractor_name=EXTRACTOR_NAME,
            extractor_version=EXTRACTOR_VERSION,
        )
        for ordinal, number in enumerate(extraction.numbers)
    ]
    refusals = [
        ChainRefusal(artifact_id=artifact.id, page=refusal.page, reason=refusal.reason)
        for refusal in extraction.refusals
    ]
    session.add_all(facts)
    session.add_all(refusals)
    await session.flush()
    return facts, refusals
