"""Keeping the file, so that a correction can be written into it.

Everything else in this module works off rows. A check re-runs without
opening a document, a chain renders without opening a document, and that
property is deliberate — it is what lets a deal keep its chain after the
documents themselves have been dropped.

**Writing is the one thing that cannot.** « Accept $48.9mm » produces a
new version of a real `.pptx`, and there is no way to build one out of
figures and cells. So the bytes are kept, and this is the whole of how.

**Failing to keep a file never fails an upload.** The chain is the product
and the object store is a convenience for one feature; an ingest that
refused because S3 was slow would trade the thing that works for the thing
that might. A file that was not kept says so when somebody tries to write
into it, in a sentence that tells them what to do — upload it again.
"""

from uuid import UUID

import structlog

from polar.file.s3 import S3_SERVICES
from polar.integrations.aws.s3 import S3Service
from polar.models import Artifact
from polar.models.file import FileServiceTypes

log = structlog.get_logger()

#: What a deal's documents are stored as. The same private bucket a
#: matter's case file uses: never publicly readable, reachable only
#: through the deal it belongs to.
SERVICE = FileServiceTypes.dossier_document

MIME = {
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
}


class FileNotKept(Exception):
    """The document is not stored here, so nothing can be written into it.

    Not an error in the engineering sense: it is a state of the deal, and
    it reads to a banker as « upload this again ».
    """


def _s3() -> S3Service:
    return S3_SERVICES[SERVICE]


def mime_for(filename: str) -> str:
    lowered = filename.lower()
    for suffix, kind in MIME.items():
        if lowered.endswith(suffix):
            return kind
    return "application/octet-stream"


def path_for(dossier_id: UUID, artifact_id: UUID, filename: str) -> str:
    """Where a document lives. Keyed by artifact, so a version is a file.

    Two uploads of « the model » are two objects, not one overwritten
    twice: a correction is written against the version it was proposed
    on, and a path that folded versions together would make that
    impossible to hold true.
    """
    return f"tieout/{dossier_id}/{artifact_id}/{filename}"


def keep(artifact: Artifact, payload: bytes) -> str | None:
    """Store the bytes, and say where. `None` when it did not work."""
    path = path_for(artifact.dossier_id, artifact.id, artifact.filename)
    try:
        _s3().upload(payload, path, mime_for(artifact.filename))
    except Exception as problem:
        log.warning(
            "tieout.storage.keep_failed",
            artifact=str(artifact.id),
            error=str(problem)[:160],
        )
        return None
    return path


def fetch(artifact: Artifact) -> bytes:
    """The document as it was uploaded, or :class:`FileNotKept`."""
    if not artifact.storage_path:
        raise FileNotKept(
            f"{artifact.filename} is not stored here any more, so it cannot "
            "be corrected. Upload it again and re-run the check."
        )
    try:
        obj = _s3().get_object_or_raise(artifact.storage_path)
        return bytes(obj["Body"].read())
    except FileNotKept:
        raise
    except Exception as problem:
        log.warning(
            "tieout.storage.fetch_failed",
            artifact=str(artifact.id),
            error=str(problem)[:160],
        )
        raise FileNotKept(
            f"{artifact.filename} could not be read back from storage. Try "
            "again in a moment, or upload it again."
        ) from problem


def download_url(artifact: Artifact) -> str:
    """A link that opens the file, good for as long as a download takes."""
    if not artifact.storage_path:
        raise FileNotKept(
            f"{artifact.filename} is not stored here any more. The figures "
            "read out of it are, and so is everything checked against them."
        )
    url, _ = _s3().generate_presigned_download_url(
        path=artifact.storage_path,
        filename=artifact.filename,
        mime_type=mime_for(artifact.filename),
    )
    return url


__all__ = [
    "FileNotKept",
    "download_url",
    "fetch",
    "keep",
    "mime_for",
    "path_for",
]
