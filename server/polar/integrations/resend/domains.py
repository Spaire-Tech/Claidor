"""Thin Resend domains-API client.

Resend exposes a Domains API for verifying DKIM. We use it to register
a creator's custom sender domain (PR 21), fetch the DNS records they
need to install, and poll for verification status.

Docs: https://resend.com/docs/api-reference/domains
"""

import logging
from typing import Any

import httpx
import structlog

from polar.config import settings
from polar.exceptions import PolarError

log: structlog.stdlib.BoundLogger = structlog.get_logger()
logging.getLogger(__name__)


class ResendDomainsError(PolarError): ...


class ResendDomainsNotConfigured(ResendDomainsError):
    def __init__(self) -> None:
        super().__init__(
            "Resend API key is not configured on this server.",
            503,
        )


class ResendDomainsAPIError(ResendDomainsError):
    """Surfaced when Resend returns a non-2xx response. Wraps the body
    so callers can show the message to the creator (e.g. "this domain
    is already registered to a different account")."""

    def __init__(self, status_code: int, body: Any) -> None:
        message = "Resend API error"
        if isinstance(body, dict):
            message = body.get("message") or message
        super().__init__(message, 502)
        self.body = body


def _require_api_key() -> str:
    if not settings.RESEND_API_KEY:
        raise ResendDomainsNotConfigured()
    return settings.RESEND_API_KEY


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.RESEND_API_BASE_URL,
        headers={"Authorization": f"Bearer {_require_api_key()}"},
        timeout=httpx.Timeout(15.0),
    )


async def create_domain(
    *, name: str, region: str = "us-east-1"
) -> dict[str, Any]:
    """POST /domains. Returns the new domain payload including its id
    and the DNS records the creator needs to install.
    """
    async with _client() as http:
        response = await http.post(
            "/domains", json={"name": name, "region": region}
        )
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise ResendDomainsAPIError(response.status_code, body)
        log.info("resend.domains.create", name=name, id=body.get("id"))
        return body


async def get_domain(domain_id: str) -> dict[str, Any]:
    """GET /domains/{id}. Returns current status (not_started / pending /
    verified / failed) and the records list."""
    async with _client() as http:
        response = await http.get(f"/domains/{domain_id}")
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise ResendDomainsAPIError(response.status_code, body)
        return body


async def verify_domain(domain_id: str) -> dict[str, Any]:
    """POST /domains/{id}/verify. Triggers a verification check; returns
    the same shape as get_domain."""
    async with _client() as http:
        response = await http.post(f"/domains/{domain_id}/verify")
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            raise ResendDomainsAPIError(response.status_code, body)
        log.info(
            "resend.domains.verify",
            id=domain_id,
            status=body.get("status"),
        )
        return body


async def delete_domain(domain_id: str) -> None:
    """DELETE /domains/{id}. Idempotent — 404 is treated as success."""
    async with _client() as http:
        response = await http.delete(f"/domains/{domain_id}")
        if response.status_code == 404:
            return
        if response.status_code >= 400:
            body = response.json() if response.content else {}
            raise ResendDomainsAPIError(response.status_code, body)
        log.info("resend.domains.delete", id=domain_id)
