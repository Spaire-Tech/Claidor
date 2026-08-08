"""Turning corpus movement into signals, and nothing else into signals.

A veille answers one question — « has anything happened to this? » — and
the honest answer comes from facts the corpus can observe: a decision
that cites the watched article, a new version of the watched act. What
the change *means* for the reader's case is not something this decides.

Two properties make it trustworthy:

- **a new watch does not fire retroactively.** It is created with the
  corpus as it stands marked as already seen, so watching art. 170 today
  does not report the two hundred decisions that cited it since 2001.
- **a signal is never emitted twice.** Scanning is idempotent: the same
  scan run again produces nothing, so a cron that overlaps itself, or a
  reload of the corpus, cannot flood the feed.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

import structlog
from sqlalchemy import select

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionKind,
    DecisionLinkStatus,
    LegalActVersion,
    Veille,
    VeilleSignal,
    WatchTarget,
)

log = structlog.get_logger()


class VeilleService:
    async def _existing_sources(
        self, session: AsyncSession, veille_id: UUID
    ) -> set[UUID]:
        rows = (
            await session.execute(
                select(VeilleSignal.source_id).where(
                    VeilleSignal.veille_id == veille_id,
                    VeilleSignal.deleted_at.is_(None),
                )
            )
        ).scalars()
        return {row for row in rows if row is not None}

    async def scan(
        self, session: AsyncSession, veilles: Sequence[Veille]
    ) -> list[VeilleSignal]:
        """Emit a signal for anything that appeared since the last scan."""
        created: list[VeilleSignal] = []
        for veille in veilles:
            if not veille.active:
                continue
            seen = await self._existing_sources(session, veille.id)
            since = veille.scanned_at

            if veille.target == WatchTarget.article:
                statement = (
                    select(CourtDecision)
                    .join(
                        DecisionArticleLink,
                        DecisionArticleLink.decision_id == CourtDecision.id,
                    )
                    .where(
                        DecisionArticleLink.article_id == veille.target_id,
                        DecisionArticleLink.status == DecisionLinkStatus.verified,
                        CourtDecision.kind == DecisionKind.arret,
                    )
                    .order_by(CourtDecision.decided_on.desc())
                )
                if since is not None:
                    statement = statement.where(CourtDecision.created_at > since)
                for decision in (await session.execute(statement)).scalars().unique():
                    if decision.id in seen:
                        continue
                    seen.add(decision.id)
                    signal = VeilleSignal(
                        veille_id=veille.id,
                        text=(
                            f"{decision.court} {decision.number} cite {veille.label}"
                        ),
                        source_kind="decision",
                        source_id=decision.id,
                        happened_on=datetime(
                            decision.decided_on.year,
                            decision.decided_on.month,
                            decision.decided_on.day,
                            tzinfo=UTC,
                        ),
                    )
                    session.add(signal)
                    created.append(signal)

            elif veille.target == WatchTarget.act:
                statement = select(LegalActVersion).where(
                    LegalActVersion.act_id == veille.target_id
                )
                if since is not None:
                    statement = statement.where(LegalActVersion.created_at > since)
                for version in (await session.execute(statement)).scalars():
                    if version.id in seen:
                        continue
                    seen.add(version.id)
                    signal = VeilleSignal(
                        veille_id=veille.id,
                        text=(f"Nouvelle version {version.label} de {veille.label}"),
                        source_kind="article",
                        source_id=None,
                        happened_on=None,
                    )
                    session.add(signal)
                    created.append(signal)

            veille.scanned_at = datetime.now(UTC)
            session.add(veille)

        await session.flush()
        log.info("veille.scan", veilles=len(veilles), signals=len(created))
        return created


veille_service = VeilleService()
