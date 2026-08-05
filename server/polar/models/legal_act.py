from datetime import date
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel


class LegalAct(RecordModel):
    """A uniform act (the abstract work, independent of any revision).

    Identified by its Akoma Ntoso FRBR *work* URI so our identifiers stay
    interoperable with Laws.Africa / AfricanLII infrastructure, e.g.
    ``/akn/aa-ohada/act/2023/organisation-des-procédures-simplifiées-…``.
    """

    __tablename__ = "legal_acts"

    akn_work_uri: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None, unique=True
    )
    # Practitioner short code, e.g. "AUPSRVE" — how lawyers cite the act.
    short_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    # ISO 3166-ish jurisdiction code; "aa-ohada" for the OHADA supranational space.
    jurisdiction: Mapped[str] = mapped_column(
        String(32), nullable=False, default="aa-ohada"
    )

    versions: Mapped[list["LegalActVersion"]] = relationship(
        "LegalActVersion", back_populates="act", lazy="raise"
    )


class LegalActVersion(RecordModel):
    """One temporal expression of an act (e.g. AUPSRVE 1998, AUPSRVE 2023).

    OHADA revises whole acts; both expressions can be simultaneously in
    active legal life (the 2023 AUPSRVE governs proceedings started on or
    after 2024-02-16, the 1998 act still governs earlier ones), so validity
    is an interval plus an explicit transitional rule, never a boolean.
    """

    __tablename__ = "legal_act_versions"
    __table_args__ = (UniqueConstraint("act_id", "label"),)

    act_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("legal_acts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    # Akoma Ntoso FRBR *expression* URI, encoding language and version date,
    # e.g. ".../fra@2024-07-02".
    akn_expression_uri: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None, unique=True
    )
    # Human label practitioners use: "1998", "2023".
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    adopted_on: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    # Official publication reference (e.g. "J.O. OHADA, numéro spécial, 15 nov. 2023").
    gazette_reference: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    in_force_from: Mapped[date | None] = mapped_column(
        Date, nullable=True, default=None
    )
    # None = still in force for its temporal scope. The 1998 act keeps a None
    # here: it remains applicable to proceedings begun before the 2023 act's
    # entry into force, per the transitional rule below.
    in_force_to: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    # Plain-language statement of which proceedings this expression governs —
    # surfaced verbatim next to every answer anchored to this version.
    transitional_rule: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    act: Mapped[LegalAct] = relationship(
        "LegalAct", back_populates="versions", lazy="raise"
    )


class ArticleEquivalenceRelation(StrEnum):
    unchanged = "unchanged"
    renumbered = "renumbered"
    amended = "amended"
    split = "split"
    merged = "merged"
    new = "new"
    repealed = "repealed"
