"""The Chain's own routes. Mounted by the lead at integration, not here.

One route for now, and it is stateless on purpose: upload a PDF, get
back every number with its page and highlight box, and the refusals in
words for pages that are scans. The fact store (D2) is a schema
proposed in the lane log before it is a table, so nothing here touches
the database yet — when D2 lands, extraction results gain ids and this
router grows read routes beside it.

Auth reuses the tie-out pair: reading a document's numbers is reading,
in exactly the sense `polar.tieout.auth` spells out.
"""

from fastapi import File, HTTPException, UploadFile

from polar.kit.schemas import Schema
from polar.openapi import APITag
from polar.routing import APIRouter

from .. import auth
from .extract import Extraction, extract_pdf

router = APIRouter(prefix="/chain", tags=["chain", APITag.private])

#: Source documents run bigger than models — a data-room PDF with maps
#: and photographs is tens of megabytes — but past this it is a mistake
#: worth catching before pdfminer chews on it.
MAX_UPLOAD_BYTES = 64 * 1024 * 1024


class BoxRead(Schema):
    x0: float
    top: float
    x1: float
    bottom: float


class NumberRead(Schema):
    page: int
    text: str
    value: float
    box: BoxRead


class RefusalRead(Schema):
    page: int
    reason: str


class PageRead(Schema):
    page: int
    width: float
    height: float


class ExtractionRead(Schema):
    """What D1 promises, over the wire: numbers, refusals, page sizes."""

    filename: str
    numbers: list[NumberRead]
    refusals: list[RefusalRead]
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
                )
                for n in extraction.numbers
            ],
            refusals=[
                RefusalRead(page=r.page, reason=r.reason) for r in extraction.refusals
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

    Pages the extractor cannot honestly read come back as refusals in
    words, never as silence — the caller always knows which pages were
    actually covered.
    """
    import io

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
