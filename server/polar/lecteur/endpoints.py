from fastapi import Depends, File, HTTPException, UploadFile

from polar.corpus import auth
from polar.kit.db.postgres import AsyncReadSession
from polar.kit.document_text import UnsupportedDocument, read_document
from polar.openapi import APITag
from polar.postgres import get_db_read_session
from polar.routing import APIRouter

from .example import EXAMPLE_NAME, EXAMPLE_TEXT
from .schemas import LecteurFinding, LecteurReview
from .service import Review, lecteur_service

router = APIRouter(prefix="/lecteur", tags=["lecteur", APITag.private])

#: Conclusions run to a few hundred kilobytes; a file this size is either a
#: scanned bundle or a mistake, and either way it is not a filing to read.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

#: Below this there is no document — an empty text layer, a scan without
#: OCR — and reporting « aucune référence » would be a false clean bill.
MIN_READABLE_CHARS = 40


def _response(review: Review) -> LecteurReview:
    return LecteurReview(
        document_name=review.document_name,
        page_count=review.page_count,
        meta=review.meta,
        findings=[
            LecteurFinding(
                kind=finding.kind,
                cite=finding.cite,
                status=str(finding.status),
                note=finding.note,
                article_id=finding.article_id,
                decision_id=finding.decision_id,
                context=finding.context,
            )
            for finding in review.findings
        ],
        verified_count=review.verified_count,
        unverified_count=review.unverified_count,
        weak_count=review.weak_count,
    )


@router.post("/review", response_model=LecteurReview)
async def review_document(
    auth_subject: auth.CorpusRead,
    upload: UploadFile = File(..., alias="file"),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> LecteurReview:
    """Check every text and decision a document cites.

    The file is read and dropped: nothing about an opposing party's filing
    is stored by this route.
    """
    payload = await upload.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Document trop volumineux (25 Mo).")
    try:
        document = read_document(payload, upload.content_type or "application/pdf")
    except UnsupportedDocument:
        raise HTTPException(
            status_code=415,
            detail="Format non pris en charge — déposez un PDF, un document "
            "Word (.docx) ou un fichier texte.",
        )
    except Exception:
        raise HTTPException(status_code=422, detail="Document illisible.")
    if len(document.text.strip()) < MIN_READABLE_CHARS:
        raise HTTPException(
            status_code=422,
            detail="Aucun texte lisible — ce document est probablement un scan "
            "sans reconnaissance de caractères.",
        )
    review = await lecteur_service.review(
        session,
        document.text,
        document_name=upload.filename or "Document",
        page_count=document.page_count,
    )
    return _response(review)


@router.post("/review/example", response_model=LecteurReview)
async def review_example(
    auth_subject: auth.CorpusRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> LecteurReview:
    """The same check, run on an example filing.

    The document is fictional; the verification is not — it runs against
    the loaded corpus like any other.
    """
    review = await lecteur_service.review(
        session, EXAMPLE_TEXT, document_name=EXAMPLE_NAME, page_count=None
    )
    return _response(review)
