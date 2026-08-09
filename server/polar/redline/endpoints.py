"""The Check route.

Two ways in, because there are two surfaces. The Word add-in has the
document open and sends its text; the web app has a file and sends that.
Both return the same findings in the same shape, so the panel is written
once.

**Nothing here is stored.** The text is read, checked, and dropped. There
is no document model and no document table, and that is a property this
module is required to keep — see ``docs/vesence-clone/decisions.md``. A
client's draft agreement written to a disk is not recoverable by deleting
it later; the security questionnaire still asks.
"""

from fastapi import File, HTTPException, UploadFile

from polar.kit.document_text import UnsupportedDocument, read_document
from polar.openapi import APITag
from polar.routing import APIRouter

from . import auth
from .schemas import RedlineFinding, RedlineRequest, RedlineReview
from .terms import Finding, Severity, review_terms

router = APIRouter(prefix="/redline", tags=["redline", APITag.private])

#: An agreement runs to a few hundred thousand characters — Vesence's own
#: example is 186 pages. Beyond this it is not a document, and checking it
#: would tie up a worker rather than help anyone.
MAX_CHARACTERS = 4_000_000

#: Matches the Lecteur's ceiling. A larger file is a scanned bundle.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _review(text: str) -> RedlineReview:
    findings = review_terms(text)
    return RedlineReview(
        findings=[_finding(f) for f in findings],
        critical_count=_count(findings, Severity.critical),
        warning_count=_count(findings, Severity.warning),
        to_review_count=_count(findings, Severity.to_review),
        characters=len(text),
    )


def _count(findings: list[Finding], severity: Severity) -> int:
    return sum(1 for finding in findings if finding.severity is severity)


def _finding(finding: Finding) -> RedlineFinding:
    return RedlineFinding(
        defect=str(finding.defect),
        severity=str(finding.severity),
        certainty=str(finding.certainty),
        term=finding.term,
        note=finding.note,
        context=finding.context,
        start=finding.start,
        end=finding.end,
        literal=finding.literal,
        occurrence=finding.occurrence,
    )


@router.post("/check", response_model=RedlineReview)
async def check_text(
    auth_subject: auth.RedlineRead,
    request: RedlineRequest,
) -> RedlineReview:
    """Check document text for defined-term defects.

    This is the add-in's route: Word has the document open, Office.js
    reads its text, and the offsets that come back are into exactly the
    string that was sent.
    """
    if len(request.text) > MAX_CHARACTERS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Document is {len(request.text):,} characters; the limit is "
                f"{MAX_CHARACTERS:,}."
            ),
        )
    return _review(request.text)


@router.post("/check/document", response_model=RedlineReview)
async def check_document(
    auth_subject: auth.RedlineRead,
    upload: UploadFile = File(..., alias="file"),
) -> RedlineReview:
    """Check an uploaded Word file or PDF.

    The file is read and dropped; nothing about it is stored.
    """
    payload = await upload.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large to check.")

    try:
        document = read_document(
            payload,
            upload.content_type or "application/octet-stream",
            filename=upload.filename,
        )
    except UnsupportedDocument as error:
        raise HTTPException(status_code=415, detail=str(error)) from error

    return _review(document.text)
