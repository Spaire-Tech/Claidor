"""Step one: harvest the candidate set for a doctrine.

Fetching, and only fetching. What to take out of a response lives in
:mod:`polar.registry.courtlistener`; which cases to look for lives in
:mod:`polar.registry.doctrines`.

Two properties this has to have, and they are the reason it is written
rather than scripted:

**Idempotent.** Re-running must update, never duplicate. Keyed on
``(source, source_id)``, so the harvest can be re-run when a query is
added, when coverage is questioned, or simply because it failed halfway.

**Honest about what it looked at.** A candidate row is written for every
opinion the search returned, before anything has read it. A registry that
remembers only what it accepted cannot answer « what did you consider and
reject? » — and that question is the reason the assessment ledger exists.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

from polar.kit.db.postgres import AsyncSession

from .courtlistener import (
    BASE_URL,
    SEARCH_PATH,
    USER_AGENT,
    SearchedOpinion,
    next_cursor,
    parse_results,
    search_params,
)
from .doctrines import Doctrine, get_doctrine
from .repository import RegistryRepository

log = structlog.get_logger()

#: Seconds between requests. CourtListener is a non-profit serving this
#: data for free; a harvest that finishes an hour later costs us nothing.
#:
#: Set from observation, not taste: at 1.0s an unauthenticated run was rate
#: limited five times in 43 pages. Being throttled repeatedly is a request
#: to slow down, and ignoring it while taking free data is not a position
#: worth defending.
REQUEST_DELAY = 2.5

#: Pages per query. A stop, not a target — reaching it means the query is
#: broader than a doctrine and should be narrowed, and the run says so.
MAX_PAGES = 60

#: Retries on transport failure, with a widening pause.
MAX_RETRIES = 4


@dataclass
class HarvestReport:
    """What a run actually did, including what it could not do."""

    doctrine: str
    pages_fetched: int = 0
    #: Hits summed across queries — the same opinion surfaces under several
    #: phrasings, so this counts it once per phrasing. It measures how hard
    #: the searches worked, not how much law was found.
    opinions_seen: int = 0
    #: Distinct opinions. This is the corpus size; the number above is not,
    #: and reporting the larger one as though it were would inflate the
    #: asset by roughly a third.
    unique_opinions: int = 0
    opinions_created: int = 0
    opinions_updated: int = 0
    candidates_created: int = 0
    dissents_seen: int = 0
    per_query: dict[str, int] = field(default_factory=dict)
    #: Queries that hit MAX_PAGES — coverage is incomplete for these, and
    #: saying so is the difference between a limit and a silent truncation.
    truncated_queries: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        parts = [
            f"{self.doctrine}: {self.unique_opinions} distinct opinions "
            f"({self.opinions_seen} hits across {self.pages_fetched} pages)",
            f"{self.opinions_created} new, {self.opinions_updated} updated",
            f"{self.candidates_created} candidates",
            f"{self.dissents_seen} dissents flagged",
        ]
        if self.truncated_queries:
            parts.append(f"TRUNCATED: {', '.join(self.truncated_queries)}")
        if self.errors:
            parts.append(f"{len(self.errors)} errors")
        return " | ".join(parts)


async def _get_page(
    client: httpx.AsyncClient, params: dict[str, str]
) -> dict[str, Any]:
    """One search page, retried on transport failure.

    A 4xx other than rate limiting is not retried: asking the same bad
    question again will get the same answer, and hammering for it is rude.
    """
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(SEARCH_PATH, params=params)
            if response.status_code == 429:
                pause = REQUEST_DELAY * (2 ** (attempt + 2))
                log.warning("registry.harvest.rate_limited", pause=pause)
                await asyncio.sleep(pause)
                continue
            response.raise_for_status()
            return dict(response.json())
        except httpx.HTTPStatusError as e:
            if 400 <= e.response.status_code < 500:
                raise
            last = e
        except (httpx.TransportError, ValueError) as e:
            last = e
        await asyncio.sleep(REQUEST_DELAY * (2**attempt))
    raise RuntimeError(f"search failed after {MAX_RETRIES} attempts: {last}")


async def _run_query(
    client: httpx.AsyncClient,
    query: str,
    doctrine: Doctrine,
    report: HarvestReport,
) -> list[SearchedOpinion]:
    """Every opinion one query returns, following the cursor to the end."""
    found: list[SearchedOpinion] = []
    cursor: str | None = None
    for page in range(MAX_PAGES):
        params = search_params(query, doctrine.courts, cursor)
        payload = await _get_page(client, params)
        report.pages_fetched += 1

        opinions = parse_results(payload)
        found.extend(opinions)

        cursor = next_cursor(payload)
        if not cursor:
            break
        await asyncio.sleep(REQUEST_DELAY)
    else:
        # Loop finished without break: the cursor never ran out.
        report.truncated_queries.append(query)
        log.warning("registry.harvest.truncated", query=query, doctrine=doctrine.slug)

    report.per_query[query] = len(found)
    return found


async def harvest_doctrine(
    session: AsyncSession, slug: str, *, dry_run: bool = False
) -> HarvestReport:
    """Harvest every candidate for one doctrine.

    ``dry_run`` performs the searches and reports the counts without
    writing, so coverage can be questioned before the database is touched.
    """
    doctrine = get_doctrine(slug)
    report = HarvestReport(doctrine=slug)
    repository = RegistryRepository.from_session(session)

    # Deduplicate across queries in memory: the same opinion surfaces under
    # several phrasings, and each should count once as a candidate while
    # still recording which query first reached it.
    seen: dict[str, tuple[SearchedOpinion, str]] = {}

    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=httpx.Timeout(60.0),
        follow_redirects=True,
    ) as client:
        for query in doctrine.queries:
            try:
                opinions = await _run_query(client, query, doctrine, report)
            except Exception as e:  # recorded, never swallowed
                message = f"{query}: {e}"
                report.errors.append(message)
                log.error(
                    "registry.harvest.query_failed",
                    query=query,
                    doctrine=slug,
                    error=str(e),
                )
                continue
            for opinion in opinions:
                report.opinions_seen += 1
                if opinion.is_dissent:
                    report.dissents_seen += 1
                seen.setdefault(opinion.source_id, (opinion, query))
            await asyncio.sleep(REQUEST_DELAY)

    report.unique_opinions = len(seen)

    if dry_run:
        return report

    for opinion, query in seen.values():
        row, created = await repository.upsert_opinion(opinion)
        if created:
            report.opinions_created += 1
        else:
            report.opinions_updated += 1
        if await repository.ensure_candidate(
            opinion_id=row.id, doctrine=slug, query=query, snippet=opinion.snippet
        ):
            report.candidates_created += 1

    return report
