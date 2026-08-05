from datetime import datetime

from pydantic import UUID4

from polar.benefit.schemas import BenefitID
from polar.file.schemas import FileDownload
from polar.kit.schemas import Schema
from polar.models.downloadable import DownloadableStatus
from polar.models.product import ProductCategory


class DownloadableURL(Schema):
    url: str
    expires_at: datetime


class DownloadableRead(Schema):
    id: UUID4
    benefit_id: UUID4

    file: FileDownload

    # Enrichment surfaced for the redesigned customer portal Downloads page.
    # All fields are optional so existing consumers (e.g. benefit-grant cards)
    # keep working without changes.
    product_id: UUID4 | None = None
    product_name: str | None = None
    product_category: ProductCategory | None = None
    product_thumbnail_url: str | None = None
    downloaded_count: int = 0
    last_downloaded_at: datetime | None = None


class DownloadableCreate(Schema):
    file_id: UUID4
    customer_id: UUID4
    benefit_id: BenefitID
    status: DownloadableStatus


class DownloadableUpdate(Schema):
    file_id: UUID4
    customer_id: UUID4
    benefit_id: BenefitID
    status: DownloadableStatus
