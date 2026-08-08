from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from fastapi import Depends, Query
from pydantic import Field
from sqlalchemy import select

from polar.corpus import auth
from polar.corpus.repository import CorpusRepository
from polar.exceptions import ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.kit.schemas import Schema
from polar.models import Veille, VeilleSignal, WatchTarget
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter

from .service import veille_service

router = APIRouter(prefix="/veilles", tags=["veilles", APITag.private])


class VeilleCreate(Schema):
    target: WatchTarget
    target_id: UUID
    label: str | None = Field(
        default=None, max_length=256, description="Defaults to the article's own label."
    )


class VeilleUpdate(Schema):
    active: bool


class VeilleSignalRead(Schema):
    id: UUID
    veille_id: UUID
    text: str
    source_kind: str
    source_id: UUID | None
    happened_on: datetime | None
    created_at: datetime


class VeilleRead(Schema):
    id: UUID
    target: WatchTarget
    target_id: UUID
    label: str
    active: bool
    signal_count: int
    last_signal_at: datetime | None


async def _list(session: AsyncReadSession, organization_id: UUID) -> Sequence[Veille]:
    statement = (
        select(Veille)
        .where(
            Veille.organization_id == organization_id,
            Veille.deleted_at.is_(None),
        )
        .order_by(Veille.created_at.desc())
    )
    return (await session.execute(statement)).scalars().all()


@router.get("", response_model=list[VeilleRead])
async def list_veilles(
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[VeilleRead]:
    """What the cabinet is watching."""
    veilles = await _list(session, organization_id)
    out: list[VeilleRead] = []
    for veille in veilles:
        signals = (
            (
                await session.execute(
                    select(VeilleSignal)
                    .where(
                        VeilleSignal.veille_id == veille.id,
                        VeilleSignal.deleted_at.is_(None),
                    )
                    .order_by(VeilleSignal.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
        out.append(
            VeilleRead(
                id=veille.id,
                target=veille.target,
                target_id=veille.target_id,
                label=veille.label,
                active=veille.active,
                signal_count=len(signals),
                last_signal_at=signals[0].created_at if signals else None,
            )
        )
    return out


@router.get("/signals", response_model=list[VeilleSignalRead])
async def list_signals(
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    limit: int = Query(50, le=200),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Sequence[VeilleSignal]:
    """The recent signal feed, newest first."""
    veille_ids = select(Veille.id).where(
        Veille.organization_id == organization_id, Veille.deleted_at.is_(None)
    )
    statement = (
        select(VeilleSignal)
        .where(
            VeilleSignal.veille_id.in_(veille_ids),
            VeilleSignal.deleted_at.is_(None),
        )
        .order_by(VeilleSignal.created_at.desc())
        .limit(limit)
    )
    return (await session.execute(statement)).scalars().all()


@router.post("", response_model=VeilleRead, status_code=201)
async def create_veille(
    body: VeilleCreate,
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> VeilleRead:
    """Watch an article or an act.

    Created with the corpus as it stands already marked as seen: watching
    art. 170 today must not report the decisions that cited it since 2001.
    """
    label = body.label
    if label is None and body.target == WatchTarget.article:
        repository = CorpusRepository.from_session(session)
        ref = await repository.get_article_ref(body.target_id)
        if ref is None:
            raise ResourceNotFound("Article introuvable dans le corpus chargé.")
        label = f"Art. {ref[0]} ({ref[1]} {ref[2]})"
    if not label:
        raise ResourceNotFound("Indiquez ce qu'il faut surveiller.")

    existing = (
        await session.execute(
            select(Veille).where(
                Veille.organization_id == organization_id,
                Veille.target_id == body.target_id,
                Veille.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        # Watching the same thing twice would double every signal.
        existing.active = True
        session.add(existing)
        await session.flush()
        veille = existing
    else:
        veille = Veille(
            organization_id=organization_id,
            created_by_id=auth_subject.subject.id,
            target=body.target,
            target_id=body.target_id,
            label=label,
            active=True,
        )
        session.add(veille)
        await session.flush()
        # Mark everything already in the corpus as seen, without emitting.
        await veille_service.scan(session, [veille])
        await session.execute(
            VeilleSignal.__table__.delete().where(VeilleSignal.veille_id == veille.id)
        )

    return VeilleRead(
        id=veille.id,
        target=veille.target,
        target_id=veille.target_id,
        label=veille.label,
        active=veille.active,
        signal_count=0,
        last_signal_at=None,
    )


@router.patch("/{veille_id}", response_model=VeilleRead)
async def update_veille(
    veille_id: UUID,
    body: VeilleUpdate,
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> VeilleRead:
    """Suspend or resume a watch."""
    veille = (
        await session.execute(
            select(Veille).where(
                Veille.id == veille_id,
                Veille.organization_id == organization_id,
                Veille.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veille is None:
        raise ResourceNotFound("Veille introuvable.")
    veille.active = body.active
    session.add(veille)
    await session.flush()
    return VeilleRead(
        id=veille.id,
        target=veille.target,
        target_id=veille.target_id,
        label=veille.label,
        active=veille.active,
        signal_count=0,
        last_signal_at=None,
    )
