import re
from collections.abc import Sequence
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import Float, cast, func, select
from sqlalchemy.orm import joinedload

from polar.kit.repository import RepositoryBase
from polar.models import (
    CourtDecision,
    LegalAct,
    LegalActVersion,
    LegalArticle,
)

from .search_query import normalize_decision_number

#: Rank below which a full-text hit is noise rather than a result.
MIN_RANK = 0.01

#: Words too common in legal French to narrow anything.
_STOP_TERMS = {"de", "du", "des", "la", "le", "les", "un", "une", "et", "en", "au"}


def _any_term_tsquery(query: str) -> Any | None:
    """An OR-of-terms tsquery, or None when nothing usable remains."""
    terms = [
        term
        for term in re.split(r"[^0-9A-Za-zÀ-ÿ-]+", query)
        if len(term) > 2 and term.lower() not in _STOP_TERMS
    ]
    if not terms:
        return None
    return func.to_tsquery("french", " | ".join(terms))


class SearchRepository(RepositoryBase[LegalArticle]):
    """Full-text and citation lookup over the corpus (global, not tenant data)."""

    model = LegalArticle

    # --- exact landings ---------------------------------------------------

    async def find_articles_by_number(
        self,
        number: str,
        *,
        act_code: str | None = None,
        version_label: str | None = None,
    ) -> Sequence[LegalArticle]:
        """Every version of an article with this number.

        Returning all of them is deliberate: the same number means different
        text in 1998 and 2023, and which one the reader wants depends on
        their file. The caller shows them side by side rather than picking.
        """
        statement = (
            select(LegalArticle)
            .join(LegalActVersion, LegalActVersion.id == LegalArticle.act_version_id)
            .join(LegalAct, LegalAct.id == LegalActVersion.act_id)
            .where(LegalArticle.number == number)
            .options(
                joinedload(LegalArticle.act_version).joinedload(LegalActVersion.act)
            )
            .order_by(LegalAct.short_code, LegalActVersion.label)
        )
        if act_code is not None:
            statement = statement.where(LegalAct.short_code == act_code)
        if version_label is not None:
            statement = statement.where(LegalActVersion.label == version_label)
        return (await self.session.execute(statement)).unique().scalars().all()

    async def find_decisions_by_number(self, number: str) -> Sequence[CourtDecision]:
        """Decisions matching a number as typed, ignoring zero padding.

        Chambers number independently, so "22/2010" can legitimately match
        more than one decision; all are returned, most recent first.
        """
        normalized = normalize_decision_number(number)
        padded_variants = {
            normalized,
            number.strip(),
            f"0{normalized}",
            f"00{normalized}",
        }
        statement = (
            select(CourtDecision)
            .where(CourtDecision.number.in_(sorted(padded_variants)))
            .order_by(CourtDecision.decided_on.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    # --- full text --------------------------------------------------------

    async def _search_articles_with(
        self,
        ts_query: Any,
        *,
        act_code: str | None,
        version_label: str | None,
        limit: int,
    ) -> Sequence[tuple[LegalArticle, float]]:
        rank = func.ts_rank(LegalArticle.search_vector, ts_query)
        statement = (
            select(LegalArticle, cast(rank, Float).label("rank"))
            .join(LegalActVersion, LegalActVersion.id == LegalArticle.act_version_id)
            .join(LegalAct, LegalAct.id == LegalActVersion.act_id)
            .where(LegalArticle.search_vector.op("@@")(ts_query))
            .options(
                joinedload(LegalArticle.act_version).joinedload(LegalActVersion.act)
            )
            .order_by(rank.desc(), LegalArticle.sort_key)
            .limit(limit)
        )
        if act_code is not None:
            statement = statement.where(LegalAct.short_code == act_code)
        if version_label is not None:
            statement = statement.where(LegalActVersion.label == version_label)
        rows = (await self.session.execute(statement)).unique().all()
        return [(article, float(score)) for article, score in rows]

    async def search_articles(
        self,
        query: str,
        *,
        act_code: str | None = None,
        version_label: str | None = None,
        limit: int = 20,
    ) -> Sequence[tuple[LegalArticle, float]]:
        """All terms first; any term if that finds nothing.

        Strict matching is right when it works — a lawyer asking for three
        terms means all three. But act texts are terse and PDF extraction
        leaves spacing artifacts ("po rtées"), so requiring every term can
        exclude the very article the query is about. Falling back to
        any-term keeps the result honest: ranking still puts the articles
        matching most terms first.
        """
        strict = await self._search_articles_with(
            func.websearch_to_tsquery("french", query),
            act_code=act_code,
            version_label=version_label,
            limit=limit,
        )
        if strict:
            return strict
        loose = _any_term_tsquery(query)
        if loose is None:
            return []
        return await self._search_articles_with(
            loose, act_code=act_code, version_label=version_label, limit=limit
        )

    async def search_decisions(
        self,
        query: str,
        *,
        decided_from: date | None = None,
        decided_to: date | None = None,
        chamber: str | None = None,
        limit: int = 20,
    ) -> Sequence[tuple[CourtDecision, float]]:
        ts_query = func.websearch_to_tsquery("french", query)
        rank = func.ts_rank(CourtDecision.search_vector, ts_query)
        statement = (
            select(CourtDecision, cast(rank, Float).label("rank"))
            .where(CourtDecision.search_vector.op("@@")(ts_query))
            .order_by(rank.desc(), CourtDecision.decided_on.desc())
            .limit(limit)
        )
        if decided_from is not None:
            statement = statement.where(CourtDecision.decided_on >= decided_from)
        if decided_to is not None:
            statement = statement.where(CourtDecision.decided_on <= decided_to)
        if chamber is not None:
            statement = statement.where(CourtDecision.chamber == chamber)
        rows = (await self.session.execute(statement)).all()
        return [(decision, float(score)) for decision, score in rows]

    # --- browse (no query, filters only) ---------------------------------

    async def list_decisions_filtered(
        self,
        *,
        decided_from: date | None = None,
        decided_to: date | None = None,
        chamber: str | None = None,
        limit: int = 20,
    ) -> Sequence[CourtDecision]:
        """Filters without a query — "all decisions since 2015", browsed."""
        statement = (
            select(CourtDecision).order_by(CourtDecision.decided_on.desc()).limit(limit)
        )
        if decided_from is not None:
            statement = statement.where(CourtDecision.decided_on >= decided_from)
        if decided_to is not None:
            statement = statement.where(CourtDecision.decided_on <= decided_to)
        if chamber is not None:
            statement = statement.where(CourtDecision.chamber == chamber)
        return (await self.session.execute(statement)).scalars().all()

    async def list_chambers(self) -> Sequence[str]:
        statement = (
            select(CourtDecision.chamber)
            .where(CourtDecision.chamber.is_not(None))
            .distinct()
            .order_by(CourtDecision.chamber)
        )
        return [row for (row,) in (await self.session.execute(statement)).all()]

    async def article_titles(
        self, article_ids: Sequence[UUID]
    ) -> dict[UUID, tuple[str, str, str]]:
        """(act short code, version label, number) per article id."""
        if not article_ids:
            return {}
        statement = (
            select(
                LegalArticle.id,
                LegalAct.short_code,
                LegalActVersion.label,
                LegalArticle.number,
            )
            .join(LegalActVersion, LegalActVersion.id == LegalArticle.act_version_id)
            .join(LegalAct, LegalAct.id == LegalActVersion.act_id)
            .where(LegalArticle.id.in_(list(article_ids)))
        )
        rows = (await self.session.execute(statement)).all()
        return {row[0]: (row[1], row[2], row[3]) for row in rows}
