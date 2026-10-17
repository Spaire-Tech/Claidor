"""A person's Link connection, held by the server (17 October 2026).

Link, Stripe's agent wallet, lets the agents buy what the person asked
for and read the bank accounts they shared (docs/services-agents.md §7d).
Since Simeon Labs' own OAuth client was approved, the sign-in runs through
the server (`simeon.desktop.link_wallet`): one row per person with Link's
tokens, both sealed (`simeon.kit.sealed`). The refresh token never leaves
the server; the person's cloud computers are handed the short-lived access
token for each Link command (`LINK_ACCESS_TOKEN`).
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from simeon.kit.db.models import RecordModel


class DesktopLinkWallet(RecordModel):
    __tablename__ = "desktop_link_wallets"

    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=False,
        unique=True,
        index=True,
    )
    #: Link's access token, sealed; about an hour long (`expires_at`).
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    #: Link's refresh token, sealed. Link rotates it on every refresh.
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    #: What the person granted, as Link answered it (they may grant less
    #: than was asked).
    scope: Mapped[str] = mapped_column(Text, nullable=False, default="")
    authorization_details: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True
    )
