"""An AI account a person connected for their agents (8 November 2026).

The founder: "allow people to bring their own subscriptions and charge only
for the computer" (docs/your-own-models.md). One row per account: the
provider, the account's own id there, a name to show, the plan it is on,
and its tokens, sealed (`simeon.kit.sealed`). The tokens never leave the
server: the model proxy uses them for the person's agents
(`simeon.desktop.model_accounts`).
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from simeon.kit.db.models import RecordModel


class DesktopModelAccount(RecordModel):
    __tablename__ = "desktop_model_accounts"
    __table_args__ = (UniqueConstraint("user_id", "provider", "account_key"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: Whose account: `chatgpt` for now.
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    #: How it was connected: `subscription` (a sign-in) or `api_key`.
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    #: The provider's own id for the account (ChatGPT's account id), so
    #: signing in to the same account again replaces it, not adds it.
    account_key: Mapped[str] = mapped_column(String(200), nullable=False)
    #: What the person sees: the account's e-mail, or a name they gave it.
    label: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    #: The provider's plan, as it named it (`plus`, `pro`, …), when it did.
    plan: Mapped[str | None] = mapped_column(String(40), nullable=True)
    #: The access token or key, sealed.
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    #: The refresh token, sealed; none for a key.
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: When the access token ends; none for a key.
    expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    #: `available`, or `signed_out` once the provider ended the sign-in
    #: (the person connects again).
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available")
    #: Until when the account's plan limit was reached, when the provider
    #: said so; its calls go elsewhere until then.
    limited_until: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    #: How much of the plan's limits is used, as the provider last said
    #: (9 November 2026): `{"windows": [{"kind", "usedPercent", "resetsAt",
    #: "minutes"}], "at"}`. ChatGPT's comes with each answer through the
    #: relay; Claude's from Claude Code on the person's computer. None until
    #: the account has been used.
    usage: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
