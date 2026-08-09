"""Reading CourtListener's search API — parsing only, no network.

Split from fetching for the same reason as :mod:`polar.corpus.juricaf`:
every decision about what we take from a response should be testable
against a saved response, without a server and without luck.

What was verified against the live API on 2026-08-09, rather than assumed:

* ``/api/rest/v4/search/?type=o`` answers **unauthenticated**.
* ``/api/rest/v4/opinions/{id}/`` and ``/clusters/{id}/`` answer **401**.
  Full opinion text therefore needs a token, and harvesting the candidate
  list is deliberately a separate step that does not.
* A search *result* is a cluster — one case — holding one to three
  opinions, typed ``combined-opinion``, ``lead-opinion`` or ``dissent``.
* Pagination is by opaque cursor in ``next``, not by page number.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from typing import Any

BASE_URL = "https://www.courtlistener.com"

SEARCH_PATH = "/api/rest/v4/search/"

#: Opinion types that are not the court's decision. Separate writings —
#: however persuasive — bind nobody.
#:
#: Compared after :func:`normalise_opinion_type`, because the same document
#: is typed differently depending on where it is read from: the search API
#: says ``dissent``, the bulk export says ``040dissent``.
NON_HOLDING_TYPES = frozenset({"dissent", "concurrence", "in-part"})


def normalise_opinion_type(raw: str | None) -> str:
    """One vocabulary for CourtListener's two.

    Search API: ``combined-opinion``, ``lead-opinion``, ``dissent``,
    ``concurrence-opinion``, ``in-part-opinion``, ``rehearing``.
    Bulk export: ``010combined``, ``020lead``, ``040dissent``,
    ``100trialcourt`` — Django choice keys, sort-ordered by prefix.

    Both reduce to the bare word. Verified against real data from each,
    rather than inferred from one and hoped for the other.
    """
    if not raw:
        return ""
    return raw.strip().lower().lstrip("0123456789").removesuffix("-opinion")


#: Sent on every request. A crawler that will not say who it is has no
#: business asking a non-profit for its data.
USER_AGENT = "Claidor registry harvester (+https://claidor.com; legal research)"


@dataclass(frozen=True)
class SearchedOpinion:
    """One opinion from a search result, with its case's metadata attached."""

    source_id: str
    cluster_id: str | None
    opinion_type: str | None
    case_name: str
    court_id: str
    court_name: str
    date_filed: date | None
    docket_number: str | None
    citations: list[str]
    precedential_status: str | None
    snippet: str | None
    absolute_url: str

    @property
    def source_url(self) -> str:
        return f"{BASE_URL}{self.absolute_url}"

    @property
    def is_dissent(self) -> bool:
        return normalise_opinion_type(self.opinion_type) == "dissent"

    @property
    def states_the_holding(self) -> bool:
        """Whether this document is the court's decision.

        A dissent decided nothing; neither did a concurrence, nor an
        opinion concurring in part. Extracting « the court refused to
        enforce this clause » from one of those would be the worst error
        this registry can make, so the distinction is drawn at the source
        rather than left to a model to notice.

        Observed across 419 harvested Texas opinions: combined-opinion
        (345), lead-opinion (55), dissent (11), concurrence-opinion (5),
        in-part-opinion (2), rehearing (1).

        Kept as a property rather than filtered at parse time: what we
        harvested and what we reasoned over should be separately
        recoverable, and silently dropping documents is how a corpus
        acquires gaps nobody can explain later.

        **A caution for the reading step, not solved here.** A
        ``combined-opinion`` is the whole disposition in one document —
        majority, concurrence and dissent together. It states the holding,
        but it also contains text that is not the holding. Whatever reads
        it has to know that.
        """
        return normalise_opinion_type(self.opinion_type) not in NON_HOLDING_TYPES


def search_params(
    query: str, courts: tuple[str, ...], cursor: str | None = None
) -> dict[str, str]:
    """Query parameters for one search request.

    Courts are space-separated — CourtListener reads that as a set, and a
    parent identifier rolls up its children.
    """
    params = {
        "type": "o",
        "q": query,
        "court": " ".join(courts),
        "format": "json",
        "order_by": "score desc",
    }
    if cursor:
        params["cursor"] = cursor
    return params


def _citation_strings(raw: Any) -> list[str]:
    """Citations as plain strings, whatever shape they arrive in.

    Observed as a list of strings, but the field is frequently empty: a
    large share of recent Texas appellate memoranda are unpublished and
    carry no reporter citation at all. That is a fact about the corpus, not
    a parsing failure, so an empty list is a valid answer.
    """
    if not raw:
        return []
    if isinstance(raw, list):
        out = []
        for item in raw:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                # Defensive: the field is a list of strings today, but a
                # citation is naturally an object and may become one.
                parts = [str(item.get(k, "")) for k in ("volume", "reporter", "page")]
                joined = " ".join(p for p in parts if p).strip()
                if joined:
                    out.append(joined)
        return out
    return [str(raw)]


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def parse_results(payload: dict[str, Any]) -> list[SearchedOpinion]:
    """Every opinion on one page of results, cluster metadata folded in."""
    found: list[SearchedOpinion] = []
    for result in payload.get("results") or []:
        cluster_id = result.get("cluster_id")
        common = {
            "cluster_id": str(cluster_id) if cluster_id is not None else None,
            "case_name": result.get("caseName") or result.get("caseNameFull") or "",
            "court_id": result.get("court_id") or "",
            "court_name": result.get("court") or "",
            "date_filed": _parse_date(result.get("dateFiled")),
            "docket_number": result.get("docketNumber") or None,
            "citations": _citation_strings(result.get("citation")),
            "precedential_status": result.get("status") or None,
            "absolute_url": result.get("absolute_url") or "",
        }
        for opinion in result.get("opinions") or []:
            opinion_id = opinion.get("id")
            if opinion_id is None:
                # No identifier means nothing can be fetched or deduplicated
                # later. Skip rather than invent one.
                continue
            found.append(
                SearchedOpinion(
                    source_id=str(opinion_id),
                    opinion_type=opinion.get("type"),
                    snippet=opinion.get("snippet") or None,
                    **common,
                )
            )
    return found


def next_cursor(payload: dict[str, Any]) -> str | None:
    """The cursor for the following page, if there is one.

    Read out of the ``next`` URL rather than reconstructed, because the
    cursor is opaque and its encoding is not ours to guess.
    """
    nxt = payload.get("next")
    if not nxt:
        return None
    _, _, query = str(nxt).partition("?")
    for pair in query.split("&"):
        key, _, value = pair.partition("=")
        if key == "cursor":
            from urllib.parse import unquote

            return unquote(value)
    return None


def iter_pages(payload_pages: Iterator[dict[str, Any]]) -> Iterator[SearchedOpinion]:
    """Flatten pages into opinions, in the order the API returned them."""
    for payload in payload_pages:
        yield from parse_results(payload)
