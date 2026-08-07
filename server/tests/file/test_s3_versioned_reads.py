"""A narrower S3 policy must not break uploads.

Completing an upload reads the object back at the version S3 just
returned, and extraction re-reads the pièce the same way. Those versioned
reads need ``s3:GetObjectVersion`` — a different permission from
``s3:GetObject``, and one a reasonable policy often omits. The read we
want is always the version we just wrote, so falling back to the current
version is both safe and enough to keep the product working.
"""

import pytest
from botocore.exceptions import ClientError

from polar.integrations.aws.s3.exceptions import S3FileError
from polar.integrations.aws.s3.service import S3Service

HEAD = {
    "ContentType": "application/pdf",
    "ETag": '"abc"',
    "Metadata": {"polar-name": "PV de saisie.pdf"},
}


class VersionDeniedClient:
    """Allows current-version reads, denies versioned ones."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def _guard(self, kwargs: dict, operation: str) -> None:
        self.calls.append(kwargs)
        if "VersionId" in kwargs:
            raise ClientError(
                {"Error": {"Code": "AccessDenied", "Message": "denied"}}, operation
            )

    def head_object(self, **kwargs: object) -> dict:
        self._guard(dict(kwargs), "HeadObject")
        return HEAD

    def get_object(self, **kwargs: object) -> dict:
        self._guard(dict(kwargs), "GetObject")
        return {"Body": "payload"}


class DeniedClient:
    """Denies every read, versioned or not."""

    def head_object(self, **kwargs: object) -> dict:
        raise ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "denied"}}, "HeadObject"
        )

    def get_object(self, **kwargs: object) -> dict:
        raise ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "denied"}}, "GetObject"
        )


def _service(client: object) -> S3Service:
    return S3Service(bucket="claidor-files", client=client)  # type: ignore[arg-type]


def test_head_falls_back_to_the_current_version() -> None:
    client = VersionDeniedClient()
    head = _service(client).get_head_or_raise("dossier_document/x/PV.pdf", "v-1")

    assert head == HEAD
    # Tried the version first, then the current object.
    assert "VersionId" in client.calls[0]
    assert "VersionId" not in client.calls[1]


def test_get_falls_back_to_the_current_version() -> None:
    client = VersionDeniedClient()
    obj = _service(client).get_object_or_raise("dossier_document/x/PV.pdf", "v-1")

    assert obj == {"Body": "payload"}
    assert "VersionId" in client.calls[0]
    assert "VersionId" not in client.calls[1]


def test_a_genuine_denial_still_fails_and_names_the_code() -> None:
    # The fallback must not paper over a real permission problem: the
    # error still says AccessDenied, which is what makes it fixable.
    with pytest.raises(S3FileError, match="AccessDenied"):
        _service(DeniedClient()).get_head_or_raise("dossier_document/x/PV.pdf", "v-1")

    with pytest.raises(S3FileError, match="AccessDenied"):
        _service(DeniedClient()).get_object_or_raise("dossier_document/x/PV.pdf")
