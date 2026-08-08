from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel


class SavedPrompt(RecordModel):
    """A question the cabinet asks often, kept for everyone.

    « Prompts enregistrés par le cabinet », as the design puts it: the
    partner's way of asking a question becomes the way everyone asks it.
    Shared across the workspace on purpose — unlike Historique, which is
    personal, a saved prompt is house style.
    """

    __tablename__ = "saved_prompts"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="cascade"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
