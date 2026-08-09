"""Opinion text from the CourtListener API, one opinion at a time.

The counterpart to :mod:`polar.registry.bulk`, and for a few hundred
opinions the better of the two.

The choice between them is arithmetic, not taste:

* **API.** One request per opinion, resumable, observable, and it fails one
  opinion at a time. Throttled to 125 requests a day on a free account —
  useless at this volume — but a Free Law Project membership raises that to
  roughly a thousand a day, which covers a doctrine in one sitting.
* **Bulk.** No throttle at all, but it means streaming a 50 GB file for a
  few hundred documents, over a single HTTP connection held for twenty
  minutes. Right for tens of thousands of opinions. Heavy machinery for
  419, and the first attempt died to a read timeout.

So: this is the default once a token exists; bulk is the fallback and the
route at scale. Reaching for bulk first was over-engineering, recorded
here rather than quietly corrected.

The token belongs in ``COURTLISTENER_API_TOKEN`` in the environment. It is
never logged and never committed.
"""

import asyncio
import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx
import structlog

from polar.kit.db.postgres import AsyncSession

from .bulk import text_of
from .courtlistener import BASE_URL, USER_AGENT
from .repository import RegistryRepository

log = structlog.get_logger()

OPINION_PATH = "/api/rest/v4/opinions/{opinion_id}/"

#: Seconds between requests. Measured against the live token rather than
#: assumed: this account allows **10/min, 75/hour, 300/day** (Tier 1),
#: read from ``/api/rest/v4/api-usage/``.
#:
#: 6.5s keeps us under the per-minute limit. The hourly cap binds first and
#: is handled by backing off on 429 rather than by pacing at one request
#: every 48 seconds, because a run that produces nothing for an hour is
#: indistinguishable from a run that has hung.
REQUEST_DELAY = 6.5

MAX_RETRIES = 4


class MissingToken(RuntimeError):
    """Raised when no API token is configured.

    Loud on purpose. A fetcher that quietly did nothing without a token
    would look exactly like a corpus with no opinions in it.
    """


@dataclass
class FetchReport:
    wanted: int = 0
    stored: int = 0
    empty_text: int = 0
    #: Opinions the API refused or did not have, with the reason. Named
    #: rather than counted: a gap in the corpus is something a person has
    #: to be able to go and look at.
    failures: list[str] = field(default_factory=list)
    #: True when the run stopped because an allowance ran out — hourly or
    #: daily; the API does not say which and it does not matter, because the
    #: response is the same. The work already done is committed and the run
    #: resumes when the window clears.
    throttled: bool = False

    def summary(self) -> str:
        parts = [f"{self.stored}/{self.wanted} opinions stored"]
        if self.empty_text:
            parts.append(f"{self.empty_text} with no text")
        if self.failures:
            parts.append(f"{len(self.failures)} failed")
        if self.throttled:
            parts.append("STOPPED: rate allowance exhausted, resumable")
        return " | ".join(parts)


async def _get_opinion(client: httpx.AsyncClient, opinion_id: str) -> dict | None | str:
    """One opinion. ``None`` if it is genuinely gone, a string if throttled."""
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(OPINION_PATH.format(opinion_id=opinion_id))
            if response.status_code == 429:
                # Two throttles bind here, and only one is worth waiting out.
                # The per-minute limit clears in seconds; the hourly and
                # daily allowances do not, and backing off four times over
                # ninety seconds then raising — which is what this did — would
                # abort a run that had merely reached its quota for the hour.
                #
                # So: retry a few times for the burst case, and if the limit
                # is still there, stop cleanly. The work done is committed
                # and the queue is « candidates with no text », so the next
                # run simply resumes.
                if attempt == MAX_RETRIES - 1:
                    return "throttled"
                await asyncio.sleep(REQUEST_DELAY * (2 ** (attempt + 1)))
                continue
            if response.status_code == 404:
                return None
            if response.status_code in (401, 403):
                raise MissingToken(
                    "CourtListener rejected the token "
                    f"({response.status_code}). Check COURTLISTENER_API_TOKEN."
                )
            response.raise_for_status()
            return dict(response.json())
        except httpx.HTTPStatusError as e:
            if 400 <= e.response.status_code < 500:
                raise
            last = e
        except httpx.TransportError as e:
            last = e
        await asyncio.sleep(REQUEST_DELAY * (2**attempt))
    raise RuntimeError(f"opinion {opinion_id} failed after {MAX_RETRIES}: {last}")


async def fetch_texts(
    session: AsyncSession,
    doctrine: str,
    *,
    token: str,
    limit: int | None = None,
) -> FetchReport:
    """Fill in opinion text for a doctrine's candidates, via the API.

    Resumable by construction: the queue is « candidates with no text yet »,
    so a run that stops halfway simply finds less to do next time.
    """
    if not token:
        raise MissingToken(
            "No CourtListener API token. Set COURTLISTENER_API_TOKEN; get one "
            "at https://www.courtlistener.com/profile/api-token/"
        )

    repository = RegistryRepository.from_session(session)
    awaiting = await repository.list_awaiting_text(doctrine, limit=limit or 100_000)
    report = FetchReport(wanted=len(awaiting))
    if not awaiting:
        return report

    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={
            "Authorization": f"Token {token}",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
        timeout=httpx.Timeout(60.0),
        follow_redirects=True,
    ) as client:
        for row in awaiting:
            payload = await _get_opinion(client, row.source_id)

            if payload == "throttled":
                report.throttled = True
                log.warning(
                    "registry.fetch.allowance_exhausted",
                    stored=report.stored,
                    remaining=report.wanted - report.stored,
                )
                break
            if payload is None:
                report.failures.append(f"{row.source_id}: not found")
                await asyncio.sleep(REQUEST_DELAY)
                continue

            assert isinstance(payload, dict)
            found = text_of(payload)
            if found is None:
                report.empty_text += 1
                log.warning("registry.fetch.no_text", opinion=row.source_id)
            else:
                text, column = found
                row.plain_text = text
                row.text_sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()
                row.text_fetched_at = datetime.now(UTC)
                if not row.opinion_type and payload.get("type"):
                    row.opinion_type = payload["type"]
                session.add(row)
                report.stored += 1
                log.debug("registry.fetch.stored", opinion=row.source_id, column=column)

            await asyncio.sleep(REQUEST_DELAY)

    await session.flush()
    return report
