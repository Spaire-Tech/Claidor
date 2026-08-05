from datetime import datetime

from pydantic import Field

from polar.kit.schemas import Schema
from polar.models.organization_custom_domain import OrganizationCustomDomainStatus


class CustomDomainDNSRecord(Schema):
    """A DNS record the creator must install at their registrar."""

    type: str = Field(description="Record type (CNAME or TXT).")
    name: str = Field(description="Fully-qualified record name.")
    value: str = Field(description="Expected record value.")


class CustomDomainChecks(Schema):
    """Outcome of the most recent explicit DNS verification."""

    cname_ok: bool = Field(
        description="Whether the domain CNAMEs to the platform target."
    )
    txt_ok: bool = Field(
        description="Whether the ownership TXT record carries the expected token."
    )


class CustomDomainStatus(Schema):
    """Current state of the organization's custom storefront domain."""

    domain: str | None = Field(
        description="Configured custom domain (None if not configured)."
    )
    status: OrganizationCustomDomainStatus | None = Field(
        description="Verification lifecycle state (None if not configured)."
    )
    verified_at: datetime | None = Field(
        description="When DNS verification first succeeded."
    )
    last_checked_at: datetime | None = Field(
        description="When DNS records were last checked."
    )
    dns_records: list[CustomDomainDNSRecord] = Field(
        description="DNS records the creator must install (empty if not configured)."
    )
    checks: CustomDomainChecks | None = Field(
        default=None,
        description=(
            "Per-record outcome of the verification just performed. Only "
            "populated by the verify endpoint."
        ),
    )


class CustomDomainSet(Schema):
    domain: str = Field(
        description=(
            "Subdomain to serve the storefront and customer portal from, "
            "e.g. learn.creator.com. Apex domains (creator.com) are not "
            "supported yet."
        ),
        min_length=1,
        max_length=253,
    )
