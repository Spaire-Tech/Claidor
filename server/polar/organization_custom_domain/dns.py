"""Minimal DNS-over-HTTPS resolver for custom domain verification.

Uses the RFC 8484 JSON API (Cloudflare/Google compatible) via httpx so we
get async DNS lookups without adding a resolver dependency. The endpoint is
configurable through settings.CUSTOM_DOMAIN_DOH_URL.
"""

import httpx

from polar.config import settings
from polar.exceptions import PolarError

# RFC 1035 record type numbers, as returned in the DoH JSON `type` field.
_RECORD_TYPES = {"CNAME": 5, "TXT": 16}


class DNSResolutionError(PolarError):
    """The DoH query itself failed (network/HTTP error) — inconclusive,
    not a failed verification."""

    def __init__(self, name: str, record_type: str, detail: str) -> None:
        self.name = name
        self.record_type = record_type
        super().__init__(
            f"DNS lookup for {record_type} {name} failed: {detail}",
            status_code=502,
        )


def _clean(value: str) -> str:
    # TXT answers come wrapped in quotes; CNAME targets carry a trailing dot.
    return value.strip().strip('"').rstrip(".")


async def resolve(name: str, record_type: str) -> list[str]:
    """Resolve `name` and return the cleaned record values (empty list when
    the name doesn't resolve). Raises DNSResolutionError when the lookup
    itself can't complete."""
    type_number = _RECORD_TYPES[record_type]
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                settings.CUSTOM_DOMAIN_DOH_URL,
                params={"name": name, "type": record_type},
                headers={"accept": "application/dns-json"},
                timeout=10.0,
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as e:
        raise DNSResolutionError(name, record_type, str(e)) from e

    answers = payload.get("Answer") or []
    return [
        _clean(answer["data"])
        for answer in answers
        if answer.get("type") == type_number and isinstance(answer.get("data"), str)
    ]
