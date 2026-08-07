"""Diagnose the storage path end to end, with the app's own credentials.

Usage: ``uv run python -m scripts.s3_doctor``

Uploads fail in exactly one of a few places, and the HTTP error alone never
says which. This runs the same four calls the upload path makes, in order,
printing the S3 error *code* for each — so the answer is a permission name,
not a guess:

1. **who am I** — ``sts:GetCallerIdentity`` needs no permission at all, so
   it always answers. It names the IAM user the API actually authenticates
   as, which is the fastest way to see that a policy was attached to a
   different user than the one Render's keys belong to.
2. **write** — ``PutObject`` of a small probe object.
3. **read back** — ``HeadObject`` on that probe. This is the call behind
   « No metadata from S3 »: completing an upload asks S3 for the stored
   object's metadata, and a write-only policy fails precisely here.
4. **clean up** — ``DeleteObject`` of the probe.

Then it repeats the read against the newest real pièce in the database, so
a permission that works on a fresh key but not on an existing one (bucket
policy, encryption key) still shows itself.
"""

import asyncio

import boto3
import botocore.exceptions
from botocore.config import Config
from sqlalchemy import desc, select

from polar.config import settings
from polar.integrations.aws.s3.client import client
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import File
from polar.postgres import create_async_engine

PROBE_KEY = "dossier_document/_claidor_probe/probe.txt"


def _code(error: botocore.exceptions.ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", "unknown"))


def _identity() -> None:
    sts = boto3.client(
        "sts",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=Config(region_name=settings.AWS_REGION),
    )
    try:
        caller = sts.get_caller_identity()
        print(f"  identity   : {caller['Arn']}")
        print(f"  account    : {caller['Account']}")
    except botocore.exceptions.ClientError as e:
        print(f"  identity   : FAILED ({_code(e)}) — the credentials themselves")
        print("               are invalid, so no policy change can help.")
    except Exception as e:
        # No STS endpoint (local MinIO, for instance).
        print(f"  identity   : unavailable ({type(e).__name__})")


def _head(key: str, label: str) -> None:
    try:
        head = client.head_object(Bucket=settings.S3_FILES_BUCKET_NAME, Key=key)
        print(f"  {label}: OK ({head.get('ContentLength')} bytes)")
    except botocore.exceptions.ClientError as e:
        code = _code(e)
        print(f"  {label}: FAILED ({code})")
        if code in ("AccessDenied", "403"):
            print("               → the key lacks s3:GetObject on this bucket,")
            print("                 or a bucket policy / KMS key denies it.")
        elif code in ("NoSuchKey", "404"):
            print("               → the object is not there under that exact key.")


async def main() -> None:
    print("configuration")
    print(f"  bucket     : {settings.S3_FILES_BUCKET_NAME}")
    print(f"  region     : {settings.AWS_REGION}")
    print(f"  endpoint   : {settings.S3_ENDPOINT_URL or 'AWS (default)'}")
    print(f"  key id     : {settings.AWS_ACCESS_KEY_ID[:8]}…")
    _identity()

    print("\nround trip on a probe object")
    wrote = False
    try:
        client.put_object(
            Bucket=settings.S3_FILES_BUCKET_NAME,
            Key=PROBE_KEY,
            Body=b"claidor probe",
            ContentType="text/plain",
        )
        wrote = True
        print("  put        : OK")
    except botocore.exceptions.ClientError as e:
        code = _code(e)
        print(f"  put        : FAILED ({code})")
        if code in ("AccessDenied", "403"):
            print("               → the key lacks s3:PutObject on this bucket.")
        elif code in ("InvalidAccessKeyId", "SignatureDoesNotMatch"):
            print("               → the credentials are wrong, not the policy.")

    if wrote:
        _head(PROBE_KEY, "head       ")
        try:
            client.delete_object(Bucket=settings.S3_FILES_BUCKET_NAME, Key=PROBE_KEY)
            print("  delete     : OK")
        except botocore.exceptions.ClientError as e:
            print(f"  delete     : FAILED ({_code(e)})")

    # The S3 findings above are the point of this script, so a database
    # that will not open must not take them down with it.
    print("\nnewest pièce actually stored")
    try:
        engine = create_async_engine("script")
        sessionmaker = create_async_sessionmaker(engine)
        async with sessionmaker() as session:
            statement = (
                select(File)
                .where(File.service == "dossier_document")
                .order_by(desc(File.created_at))
                .limit(1)
            )
            file = (await session.execute(statement)).scalars().first()
            if file is None:
                print("  none in the database yet.")
            else:
                print(f"  file       : {file.id} · uploaded={file.is_uploaded}")
                print(f"  path       : {file.path}")
                _head(file.path, "head       ")
        await engine.dispose()
    except Exception as e:
        print(f"  database unavailable ({type(e).__name__}) — skipped.")


if __name__ == "__main__":
    asyncio.run(main())
