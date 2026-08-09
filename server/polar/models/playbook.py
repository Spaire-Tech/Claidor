"""A firm's negotiating positions, written down once.

A playbook is the house position at clause level, in a form the checks can
act on: the wording the firm wants, how far it will flex, the line it will
not cross, and who has to sign off past it. Once it exists, a review scores
counterparty paper against *that* standard rather than a generic one.

The shape follows Vaquill's, which is better than the flat list of rules
I first sketched — three layers per clause, and one rule that makes the
whole thing usable:

**Only the preferred position is required.** A playbook holding nothing
but preferred wording still works. Everything else is optional depth. That
is the difference between a feature a firm adopts in an afternoon and one
abandoned at a setup screen with forty empty fields.

| Layer | What it controls |
|---|---|
| Language | what good looks like — preferred wording, acceptable range |
| Guardrails | the limits that trip a review — fallback, floor, numeric caps |
| Governance | who signs off, and how loudly a miss is flagged |

Nothing here holds a client's document. A playbook is the firm's own
drafting standard, which is why it is the one thing in this product that
*is* stored — see ``docs/vesence-clone/decisions.md``.
"""

from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel


class Severity(StrEnum):
    """How loudly a deviation from this rule is reported.

    Deliberately the same vocabulary the checks already use, so a playbook
    finding sits in the panel beside a defined-term finding without a
    translation step.
    """

    critical = "critical"
    warning = "warning"
    to_review = "to_review"


class Approval(StrEnum):
    """Who has to agree before a deviation goes back out."""

    none = "none"
    lawyer = "lawyer"
    senior = "senior"
    partner = "partner"


class Playbook(RecordModel):
    """One contract type, one firm's positions on it."""

    __tablename__ = "playbooks"
    __table_args__ = (
        # A firm may hold one playbook per name; two called « Buy-Side SPA »
        # is a filing error rather than a choice.
        UniqueConstraint("organization_id", "name", name="playbooks_org_name_key"),
        Index("ix_playbooks_organization_id", "organization_id"),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="cascade"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    #: « Share purchase agreement », « NDA », « Loan agreement ». Free text
    #: rather than an enum: a firm's taxonomy is its own.
    contract_type: Mapped[str] = mapped_column(String(160), nullable=False)
    #: Which side of the table this playbook speaks for. The same clause has
    #: opposite preferred positions for a buyer and a seller.
    side: Mapped[str | None] = mapped_column(String(40), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    rules: Mapped[list["PlaybookRule"]] = relationship(
        "PlaybookRule",
        back_populates="playbook",
        cascade="all, delete-orphan",
        order_by="PlaybookRule.position",
        lazy="raise",
    )


class PlaybookRule(RecordModel):
    """One clause, and what the firm wants from it.

    Every field but ``clause`` and ``preferred`` is optional, and that is
    load-bearing rather than lenient — see the module docstring.
    """

    __tablename__ = "playbook_rules"
    __table_args__ = (
        UniqueConstraint("playbook_id", "clause", name="playbook_rules_clause_key"),
        Index("ix_playbook_rules_playbook_id", "playbook_id"),
    )

    playbook_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("playbooks.id", ondelete="cascade"), nullable=False
    )
    #: « Limitation of liability », « Governing law ». What a lawyer calls
    #: it, because that is what they will search for.
    clause: Mapped[str] = mapped_column(String(200), nullable=False)
    #: Order in the playbook, so a review reports in the firm's own order
    #: rather than alphabetically.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ---- Language: what good looks like -------------------------------
    #: The only required field on the rule.
    preferred: Mapped[str] = mapped_column(Text, nullable=False)
    #: What the firm will accept without escalating.
    acceptable: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- Guardrails: the limits that trip a review --------------------
    #: Positions to fall back to, in order, before the floor.
    fallback: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: The line the firm will not cross. A document past this is not a
    #: deviation to negotiate; it is a refusal.
    walk_away: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- Governance: who signs off ------------------------------------
    severity: Mapped[Severity] = mapped_column(
        String(20), nullable=False, default=Severity.warning
    )
    approval: Mapped[Approval] = mapped_column(
        String(20), nullable=False, default=Approval.none
    )
    #: Why the position is what it is. The field a new associate reads.
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    playbook: Mapped[Playbook] = relationship("Playbook", back_populates="rules")
