"""Thin Vercel project-domains API client.

Vercel issues and renews TLS certificates automatically for any domain
attached to a project. We attach a creator's verified custom storefront
domain (learn.creator.com) to the web project when it activates, and
detach it when the creator removes or replaces it.

The creator's CNAME points at settings.CUSTOM_DOMAIN_CNAME_TARGET, which
must itself resolve to Vercel (e.g. a CNAME to cname.vercel-dns.com), so
traffic reaches the project as soon as the domain is attached.

Docs: https://vercel.com/docs/rest-api/reference/endpoints/projects
"""

from typing import Any

import httpx
import structlog

from polar.config import settings
from polar.exceptions import PolarError

log: structlog.stdlib.BoundLogger = structlog.get_logger()

# Returned by Vercel when the domain is already attached to this project —
# benign for us (attach is idempotent).
_ALREADY_ATTACHED_CODES = {"domain_already_in_use", "domain_already_exists"}


class VercelDomainsError(PolarError): ...


class VercelDomainsNotConfigured(VercelDomainsError):
    def __init__(self) -> None:
        super().__init__(
            "Vercel API token/project are not configured on this server.",
            503,
        )


class VercelDomainsAPIError(VercelDomainsError):
    """Surfaced when Vercel returns an unexpected non-2xx response."""

    def __init__(self, status_code: int, body: Any) -> None:
        message = "Vercel API error"
        if isinstance(body, dict):
            error = body.get("error")
            if isinstance(error, dict) and error.get("message"):
                message = error["message"]
        super().__init__(message, 502)
        self.response_status_code = status_code
        self.body = body


def is_configured() -> bool:
    return bool(settings.VERCEL_API_TOKEN and settings.VERCEL_PROJECT_ID)


def _client() -> httpx.AsyncClient:
    if not is_configured():
        raise VercelDomainsNotConfigured()
    params = {}
    if settings.VERCEL_TEAM_ID:
        params["teamId"] = settings.VERCEL_TEAM_ID
    return httpx.AsyncClient(
        base_url=settings.VERCEL_API_BASE_URL,
        headers={"Authorization": f"Bearer {settings.VERCEL_API_TOKEN}"},
        params=params,
        timeout=httpx.Timeout(15.0),
    )


def _error_code(body: Any) -> str | None:
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return error.get("code")
    return None


async def add_domain(domain: str) -> dict[str, Any]:
    """Attach a domain to the project (idempotent). Vercel starts issuing
    the TLS certificate as soon as DNS points at it."""
    async with _client() as http:
        response = await http.post(
            f"/v10/projects/{settings.VERCEL_PROJECT_ID}/domains",
            json={"name": domain},
        )
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            if _error_code(body) in _ALREADY_ATTACHED_CODES:
                log.info("vercel.domains.add.already_attached", domain=domain)
                return body
            raise VercelDomainsAPIError(response.status_code, body)
        log.info("vercel.domains.add", domain=domain)
        return body


async def remove_domain(domain: str) -> None:
    """Detach a domain from the project (idempotent — 404 is fine)."""
    async with _client() as http:
        response = await http.delete(
            f"/v9/projects/{settings.VERCEL_PROJECT_ID}/domains/{domain}",
        )
        if response.status_code >= 400 and response.status_code != 404:
            body = response.json() if response.content else {}
            raise VercelDomainsAPIError(response.status_code, body)
        log.info("vercel.domains.remove", domain=domain)
