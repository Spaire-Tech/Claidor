import boto3
from polar.config import settings

s3 = boto3.client(
    "s3",
    endpoint_url=settings.S3_ENDPOINT_URL,
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    region_name=settings.AWS_REGION,
)

buckets = [
    settings.S3_FILES_BUCKET_NAME,
    settings.S3_FILES_PUBLIC_BUCKET_NAME,
    settings.S3_CUSTOMER_INVOICES_BUCKET_NAME,
    settings.S3_PAYOUT_INVOICES_BUCKET_NAME,
]

for bucket in buckets:
    try:
        kwargs = {"Bucket": bucket}
        # us-east-1 must NOT include LocationConstraint
        if settings.AWS_REGION != "us-east-1":
            kwargs["CreateBucketConfiguration"] = {"LocationConstraint": settings.AWS_REGION}
        s3.create_bucket(**kwargs)
        print(f"Created: {bucket}")
    except s3.exceptions.BucketAlreadyOwnedByYou:
        print(f"Already exists: {bucket}")
    except Exception as e:
        print(f"Error on {bucket}: {e}")
