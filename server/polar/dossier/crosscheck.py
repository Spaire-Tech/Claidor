"""Inconsistencies *between* the documents of a matter.

« Indemnity cap exceeds LOI threshold ($2.5M vs $1.8M) » is the finding
Vesence leads with, and it is the one thing a per-document check can never
produce: each document is internally coherent and the transaction is not.

The obvious approach is to put the documents in front of a model together
and ask. It does not survive contact with a transaction bundle — twenty
files is far past a context window, and comparing every pair is four
hundred calls to answer a question about six numbers.

So it is two stages, and the split is what makes the whole thing checkable.

**Stage one: extract, do not compare.** Each document is read on its own
and reduced to a short list of *commitments* — the figures, dates, periods
and governing terms that could conflict with another document — each with
a verbatim quote. One call per document, and every quote has exactly one
text it could have come from, which is what makes it verifiable at all.

**Stage two: compare the extractions.** They are small, so they fit
together. The model is shown the commitments and asked only where two of
them disagree. It never sees two documents at once and never has to hold
one in mind while reading another.

Three gates stand between a proposal and a finding, and all three are
arithmetic rather than judgement:

1. **Both quotes must be verbatim in their own documents.** The same
   `locate_quote` the single-document judgement uses, against the text the
   extraction came from. A conflict quoting words a document does not
   contain is dropped.
2. **Both commitments must be ones we extracted.** The model compares a
   list we gave it; a commitment that is not on that list was invented in
   the comparison step, which is exactly where invention is most plausible
   and least visible.
3. **The two documents must be different.** A contradiction inside one
   document is a real thing and it is `redline/judgement.py`'s job. Letting
   it surface here would report the same defect twice under a name that
   says something stronger than it is.

What survives is a claim a reader can check in two clicks: this document
says that, that document says this, here are both sentences.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from uuid import UUID

import structlog

from polar.models.dossier import DossierDocument
from polar.redline.judgement import locate_quote

log = structlog.get_logger()

EXTRACT_PROMPT = Path(__file__).parent / "prompts" / "extract_commitments.md"
COMPARE_PROMPT = Path(__file__).parent / "prompts" / "compare_commitments.md"

CROSSCHECK_MODEL = "claude-opus-5"

#: How much of a document the extraction reads. A commitment worth
#: comparing — a cap, a date, a governing law — is stated in the operative
#: clauses, and a bundle of twenty files read whole is minutes of latency
#: for a question about six numbers.
EXTRACT_CHARACTERS = 60_000

#: Past this a matter is a data room and wants the background worker.
MAX_DOCUMENTS = 40

#: Commitments per document. A document producing more than this is being
#: summarised rather than mined for conflicts.
MAX_COMMITMENTS = 25


class Client(Protocol):
    @property
    def messages(self) -> Any: ...


@dataclass(frozen=True)
class Commitment:
    """One thing a document commits to, with the words that say so."""

    document_id: UUID
    document_title: str
    #: « Liability cap », « Governing law », « Notice period ».
    subject: str
    #: What this document says about it, in a sentence.
    value: str
    #: The document's own words. Verified before this is ever used.
    quote: str
    start: int
    end: int


@dataclass
class Conflict:
    """Two commitments that cannot both be honoured."""

    subject: str
    note: str
    left: Commitment
    right: Commitment


@dataclass
class CrossCheckReport:
    documents_read: int = 0
    unreadable: int = 0
    commitments: int = 0
    proposed: int = 0
    #: Dropped because a quote is not in the document it was credited to.
    unquotable: int = 0
    #: Dropped because the commitment was not one we extracted.
    invented: int = 0
    #: Dropped because both sides are the same document.
    same_document: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def kept(self) -> int:
        return self.proposed - self.unquotable - self.invented - self.same_document

    def summary(self) -> str:
        return (
            f"{self.documents_read} read ({self.unreadable} unreadable), "
            f"{self.commitments} commitments | {self.proposed} proposed, "
            f"{self.kept} kept ({self.unquotable} unquotable, "
            f"{self.invented} invented, {self.same_document} same document) | "
            f"{self.input_tokens:,} in / {self.output_tokens:,} out"
        )


COMMITMENTS_TOOL = {
    "name": "record_commitments",
    "description": (
        "Record what this document commits to on the points that could "
        "conflict with another document in the same transaction."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "commitments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "subject": {
                            "type": "string",
                            "description": (
                                "What the commitment is about, in two or "
                                "three words: « Liability cap », "
                                "« Governing law », « Notice period »."
                            ),
                        },
                        "value": {
                            "type": "string",
                            "description": "What this document says about it.",
                        },
                        "quote": {
                            "type": "string",
                            "description": (
                                "The document's own words, copied character "
                                "for character."
                            ),
                        },
                    },
                    "required": ["subject", "value", "quote"],
                },
            }
        },
        "required": ["commitments"],
    },
}

CONFLICTS_TOOL = {
    "name": "record_conflicts",
    "description": (
        "Record where two commitments from different documents cannot both "
        "be honoured. Return an empty list when they are consistent."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "conflicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "left": {
                            "type": "integer",
                            "description": "Index of the first commitment.",
                        },
                        "right": {
                            "type": "integer",
                            "description": "Index of the second commitment.",
                        },
                        "note": {
                            "type": "string",
                            "description": (
                                "One or two sentences: what each says and why "
                                "they cannot both hold."
                            ),
                        },
                    },
                    "required": ["left", "right", "note"],
                },
            }
        },
        "required": ["conflicts"],
    },
}


def verify_commitments(
    document: DossierDocument, proposed: list[dict[str, Any]], report: CrossCheckReport
) -> list[Commitment]:
    """Keep the commitments this document's own words support.

    A quote that is not in the document is not a commitment it made. This
    is the gate that makes stage two safe: everything compared later has
    already been located in a real text, so a conflict can always be shown
    to a reader with both sentences.
    """
    text = document.extracted_text or ""
    kept: list[Commitment] = []

    for item in proposed[:MAX_COMMITMENTS]:
        quote = item.get("quote")
        span = locate_quote(text, quote) if isinstance(quote, str) else None
        if span is None:
            report.unquotable += 1
            log.debug(
                "dossier.crosscheck.unquotable",
                document_id=str(document.id),
                subject=item.get("subject"),
            )
            continue

        subject = str(item.get("subject") or "").strip()
        value = str(item.get("value") or "").strip()
        if not subject or not value:
            report.unquotable += 1
            continue

        kept.append(
            Commitment(
                document_id=document.id,
                document_title=document.title,
                subject=subject,
                value=value,
                quote=text[span[0] : span[1]],
                start=span[0],
                end=span[1],
            )
        )

    return kept


def verify_conflicts(
    commitments: list[Commitment],
    proposed: list[dict[str, Any]],
    report: CrossCheckReport,
) -> list[Conflict]:
    """Keep the conflicts both commitments actually support.

    The indices are into the list the model was given. Anything outside it
    was invented in the comparison step — the place where invention is
    most plausible, because the model is no longer looking at a document.
    """
    kept: list[Conflict] = []
    seen: set[tuple[int, int]] = set()

    for item in proposed:
        left_index = item.get("left")
        right_index = item.get("right")
        if not isinstance(left_index, int) or not isinstance(right_index, int):
            report.invented += 1
            continue
        if not (
            0 <= left_index < len(commitments) and 0 <= right_index < len(commitments)
        ):
            report.invented += 1
            log.debug(
                "dossier.crosscheck.invented", left=left_index, right=right_index
            )
            continue

        left = commitments[left_index]
        right = commitments[right_index]

        if left.document_id == right.document_id:
            # A contradiction inside one document is judgement.py's job.
            report.same_document += 1
            continue

        note = str(item.get("note") or "").strip()
        if not note:
            report.invented += 1
            continue

        key = (min(left_index, right_index), max(left_index, right_index))
        if key in seen:
            continue
        seen.add(key)

        kept.append(
            Conflict(
                subject=left.subject,
                note=note,
                left=left,
                right=right,
            )
        )

    return kept


def describe(commitments: list[Commitment]) -> str:
    """The commitments as the comparison step is shown them."""
    lines = []
    for index, commitment in enumerate(commitments):
        lines.append(
            f"[{index}] {commitment.document_title} — {commitment.subject}: "
            f"{commitment.value}\n    « {commitment.quote} »"
        )
    return "\n".join(lines)


async def extract(
    client: Client,
    document: DossierDocument,
    report: CrossCheckReport,
    *,
    model: str = CROSSCHECK_MODEL,
) -> list[Commitment]:
    """What one document commits to."""
    text = document.extracted_text
    if not text:
        report.unreadable += 1
        return []

    template = EXTRACT_PROMPT.read_text(encoding="utf-8")
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4_000,
            tools=[COMMITMENTS_TOOL],
            tool_choice={"type": "tool", "name": "record_commitments"},
            messages=[
                {
                    "role": "user",
                    "content": template.format(
                        title=document.title,
                        extract=text[:EXTRACT_CHARACTERS],
                    ),
                }
            ],
        )
    except Exception as error:  # noqa: BLE001
        report.failures.append(f"{document.title}: {error}")
        log.warning(
            "dossier.crosscheck.extract_failed",
            document_id=str(document.id),
            error=str(error),
        )
        return []

    report.documents_read += 1
    report.input_tokens += getattr(response.usage, "input_tokens", 0)
    report.output_tokens += getattr(response.usage, "output_tokens", 0)

    answer = next(
        (block.input for block in response.content if block.type == "tool_use"), None
    )
    if not isinstance(answer, dict):
        return []
    found = answer.get("commitments")
    if not isinstance(found, list):
        return []

    return verify_commitments(
        document, [item for item in found if isinstance(item, dict)], report
    )


async def compare(
    client: Client,
    commitments: list[Commitment],
    report: CrossCheckReport,
    *,
    model: str = CROSSCHECK_MODEL,
) -> list[Conflict]:
    """Where two commitments disagree."""
    if len(commitments) < 2:
        return []

    template = COMPARE_PROMPT.read_text(encoding="utf-8")
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4_000,
            tools=[CONFLICTS_TOOL],
            tool_choice={"type": "tool", "name": "record_conflicts"},
            messages=[
                {
                    "role": "user",
                    "content": template.format(commitments=describe(commitments)),
                }
            ],
        )
    except Exception as error:  # noqa: BLE001
        report.failures.append(f"comparison: {error}")
        log.warning("dossier.crosscheck.compare_failed", error=str(error))
        return []

    report.input_tokens += getattr(response.usage, "input_tokens", 0)
    report.output_tokens += getattr(response.usage, "output_tokens", 0)

    answer = next(
        (block.input for block in response.content if block.type == "tool_use"), None
    )
    if not isinstance(answer, dict):
        return []
    found = answer.get("conflicts")
    if not isinstance(found, list):
        return []

    proposed = [item for item in found if isinstance(item, dict)]
    report.proposed = len(proposed)
    return verify_conflicts(commitments, proposed, report)


async def cross_check(
    client: Client,
    documents: list[DossierDocument],
    *,
    model: str = CROSSCHECK_MODEL,
) -> tuple[list[Conflict], CrossCheckReport]:
    """Read each document, then compare what they promised."""
    report = CrossCheckReport()
    commitments: list[Commitment] = []

    for document in documents[:MAX_DOCUMENTS]:
        commitments.extend(await extract(client, document, report, model=model))

    report.commitments = len(commitments)
    conflicts = await compare(client, commitments, report, model=model)

    log.info("dossier.crosscheck.done", summary=report.summary())
    return conflicts, report


__all__ = [
    "CROSSCHECK_MODEL",
    "EXTRACT_CHARACTERS",
    "MAX_COMMITMENTS",
    "MAX_DOCUMENTS",
    "Commitment",
    "Conflict",
    "CrossCheckReport",
    "compare",
    "cross_check",
    "describe",
    "extract",
    "verify_commitments",
    "verify_conflicts",
]
