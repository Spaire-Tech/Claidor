from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from fastapi import Depends, Query
from pydantic import Field
from sqlalchemy import select

from polar.corpus import auth
from polar.exceptions import ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.kit.repository import RepositoryBase
from polar.kit.schemas import Schema
from polar.models import SavedPrompt
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter

router = APIRouter(prefix="/prompts", tags=["prompts", APITag.private])


class SavedPromptRepository(RepositoryBase[SavedPrompt]):
    model = SavedPrompt

    async def list_for_organization(
        self, organization_id: UUID
    ) -> Sequence[SavedPrompt]:
        statement = (
            select(SavedPrompt)
            .where(
                SavedPrompt.organization_id == organization_id,
                SavedPrompt.deleted_at.is_(None),
            )
            .order_by(SavedPrompt.created_at.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_for_organization(
        self, prompt_id: UUID, organization_id: UUID
    ) -> SavedPrompt | None:
        statement = select(SavedPrompt).where(
            SavedPrompt.id == prompt_id,
            SavedPrompt.organization_id == organization_id,
            SavedPrompt.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()


class SavedPromptCreate(Schema):
    title: str = Field(min_length=2, max_length=160)
    text: str = Field(min_length=3, max_length=4000)


class SavedPromptRead(Schema):
    id: UUID
    title: str
    text: str
    created_at: datetime


@router.get("", response_model=list[SavedPromptRead])
async def list_prompts(
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Sequence[SavedPrompt]:
    """The cabinet's saved prompts, most recent first."""
    repository = SavedPromptRepository.from_session(session)
    return await repository.list_for_organization(organization_id)


@router.post("", response_model=SavedPromptRead, status_code=201)
async def create_prompt(
    body: SavedPromptCreate,
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> SavedPrompt:
    """Save a question the cabinet asks often."""
    prompt = SavedPrompt(
        organization_id=organization_id,
        created_by_id=auth_subject.subject.id,
        title=body.title.strip(),
        text=body.text.strip(),
    )
    session.add(prompt)
    await session.flush()
    return prompt


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(
    prompt_id: UUID,
    auth_subject: auth.CorpusRead,
    organization_id: UUID = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a saved prompt from the cabinet's library."""
    repository = SavedPromptRepository.from_session(session)
    prompt = await repository.get_for_organization(prompt_id, organization_id)
    if prompt is None:
        raise ResourceNotFound("Prompt introuvable.")
    prompt.set_deleted_at()
    session.add(prompt)
    await session.flush()
