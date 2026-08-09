"""Database access for the registry.

Global data, not tenant data: the registry is built from public court
records and is the same for every customer. It holds no client information
and never will.
"""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select

from polar.kit.repository import RepositoryBase
from polar.models import OpinionSource, RegistryCandidate, RegistryOpinion
from polar.models.registry import ScreeningVerdict

from .courtlistener import SearchedOpinion


class RegistryRepository(RepositoryBase[RegistryOpinion]):
    """Opinions and candidates."""

    model = RegistryOpinion

    async def upsert_opinion(
        self, found: SearchedOpinion
    ) -> tuple[RegistryOpinion, bool]:
        """Store an opinion, or refresh the metadata of one already held.

        Returns ``(row, created)``.

        Deliberately does **not** touch ``plain_text``: harvesting sees
        metadata only, and overwriting fetched text with nothing would
        silently undo the expensive half of the work.
        """
        statement = select(RegistryOpinion).where(
            RegistryOpinion.source == OpinionSource.courtlistener,
            RegistryOpinion.source_id == found.source_id,
        )
        row = (await self.session.execute(statement)).scalar_one_or_none()
        created = row is None
        if row is None:
            row = RegistryOpinion(
                source=OpinionSource.courtlistener,
                source_id=found.source_id,
            )

        row.source_url = found.source_url
        row.cluster_id = found.cluster_id
        row.opinion_type = found.opinion_type
        row.case_name = found.case_name
        row.court_id = found.court_id
        row.court_name = found.court_name
        row.date_filed = found.date_filed
        row.docket_number = found.docket_number
        row.citations = found.citations or None
        row.precedential_status = found.precedential_status

        self.session.add(row)
        await self.session.flush()
        return row, created

    async def ensure_candidate(
        self,
        *,
        opinion_id: UUID,
        doctrine: str,
        query: str,
        snippet: str | None,
    ) -> bool:
        """Record that this opinion was considered for this doctrine.

        Returns True when the candidate is new. An existing candidate is
        left untouched — re-running the harvest must never reset a
        screening verdict that a model or a human has already reached.
        """
        statement = select(RegistryCandidate).where(
            RegistryCandidate.opinion_id == opinion_id,
            RegistryCandidate.doctrine == doctrine,
        )
        existing = (await self.session.execute(statement)).scalar_one_or_none()
        if existing is not None:
            return False

        self.session.add(
            RegistryCandidate(
                opinion_id=opinion_id,
                doctrine=doctrine,
                found_by_query=query,
                snippet=snippet,
                verdict=ScreeningVerdict.pending,
            )
        )
        await self.session.flush()
        return True

    async def count_candidates(self, doctrine: str) -> dict[str, int]:
        """Candidates per verdict, for one doctrine."""
        statement = (
            select(RegistryCandidate.verdict, func.count())
            .where(RegistryCandidate.doctrine == doctrine)
            .group_by(RegistryCandidate.verdict)
        )
        rows = (await self.session.execute(statement)).all()
        return {str(verdict): count for verdict, count in rows}

    async def list_awaiting_text(
        self, doctrine: str, *, limit: int = 500
    ) -> Sequence[RegistryOpinion]:
        """Candidates whose opinion text has not been fetched yet.

        The harvest deliberately stops at metadata, because full text needs
        an API token that the search endpoint does not. This is the queue
        the fetch step drains once one exists.
        """
        statement = (
            select(RegistryOpinion)
            .join(RegistryCandidate, RegistryCandidate.opinion_id == RegistryOpinion.id)
            .where(
                RegistryCandidate.doctrine == doctrine,
                RegistryOpinion.plain_text.is_(None),
            )
            .order_by(RegistryOpinion.date_filed.desc().nullslast())
            .limit(limit)
        )
        return (await self.session.execute(statement)).scalars().all()
