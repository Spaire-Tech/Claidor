"""A piece of work the agent did in a matter, and how it did it.

Vesence calls these tasks — « Untitled task » in the sidebar, one per thing
you asked for, each with its own trace. They are kept for the same reason a
firm keeps attendance notes: somebody will ask, three weeks later, where a
number in a memo came from, and « the agent said so » is not an answer while
« it read Schedule 4 of the SPA at these offsets » is.

**The steps are the record, not a log.** A log is something you consult
when there is a problem; this is shown on screen every time, under « Used
12 tools ». It is stored because it is displayed, and because an answer
whose trace has been discarded cannot be audited afterwards.

**A task that failed is still a task.** Runs that hit the step limit or
died on a provider error are written down with what they managed, rather
than vanishing — a matter where three of yesterday's twenty tasks silently
never happened is worse than one that shows three failures.

This is the one place in the product that stores anything derived from a
client's documents, and it stores summaries rather than contents: a step
records « Read Project_Atlas_SPA.docx », not what the document said. The
documents live in the matter; nothing here duplicates them.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel


class AgentTask(RecordModel):
    """One prompt, worked against one matter."""

    __tablename__ = "agent_tasks"
    __table_args__ = (
        Index("ix_agent_tasks_dossier_id_created_at", "dossier_id", "created_at"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossiers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    #: Who asked. A matter is shared, so « who ran this » is part of it.
    created_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="restrict"), nullable=False
    )

    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    #: Empty when the run failed before saying anything. Never invented.
    answer: Mapped[str] = mapped_column(Text, nullable=False, default="")

    #: ``answered``, ``step_limit`` or ``failed`` — see
    #: :class:`polar.dossier.agent.loop.Stopped`. Stored as text rather
    #: than an enum so a new outcome does not need a migration to be
    #: recorded, which matters because the alternative is recording it
    #: wrongly.
    stopped: Mapped[str] = mapped_column(String(24), nullable=False)
    #: The provider's message, when there was one.
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    steps: Mapped[list["AgentStep"]] = relationship(
        "AgentStep",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="AgentStep.ordinal",
        lazy="raise",
    )


class AgentStep(RecordModel):
    """One tool call inside a task.

    ``summary`` is the line the trace shows and it is written by the tool,
    not by the model: « Checked Project_Atlas_SPA.docx — 14 findings » is a
    statement about what happened, and a model asked to narrate its own
    tool use would eventually narrate one it did not make.
    """

    __tablename__ = "agent_steps"
    __table_args__ = (
        Index("ix_agent_steps_task_id_ordinal", "task_id", "ordinal"),
    )

    task_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("agent_tasks.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    #: 1-based, in the order the calls were made.
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    tool: Mapped[str] = mapped_column(String(64), nullable=False)
    #: What the tool was called with. Small by construction — a document id,
    #: an offset, a search term.
    arguments: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    #: False for a refusal: a document outside the matter, an invented tool
    #: name, bad arguments. Kept, because a refusal is a fact about the run.
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    milliseconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    task: Mapped[AgentTask] = relationship("AgentTask", back_populates="steps")
