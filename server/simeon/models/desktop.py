"""The desktop app's sign-in and metering.

The desktop app, Maties (`desktop/`), speaks a small server protocol
in its account mode: a browser login that ends in an auth code, an
exchange of that code for an access token and a refresh token, a
refresh, a quota, and a model proxy. These three tables are the whole
server-side state of that protocol.

- `DesktopAuthCode`: the short-lived, single-use code the browser hands
  the app after the person signs in on the web.
- `DesktopSession`: one signed-in desktop. Both tokens are stored as
  keyed hashes, never in clear; the refresh token rotates on every use.
  A row that names a `maty_jobs` row is the same thing narrowed to one
  cloud job and one lease; see the class.
- `DesktopUsage`: one row per model call the app made through the
  proxy, with the provider that served it, the token counts it reported
  and the credits they cost. The quota is a sum over these rows for the
  current month.

One more table carries the shared memory (`docs/maties/cloud.md`):

- `DesktopMemoryFile`: one row per person per memory file. Two sides —
  the app on a computer, and later the cloud runner — read it before
  they work and write it after, so a person with two machines has one
  assistant instead of two strangers.

And two the copy of the agents and their chats (26 October 2026, the
computer as a worker; `simeon.desktop.chats`):

- `DesktopChatAgent`: one row per person per agent, as their computer
  last listed it.
- `DesktopChatLine`: one row per line of an agent's chat, its newest
  lines only, as the computer wrote it.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    CHAR,
    TIMESTAMP,
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from simeon.kit.db.models import RecordModel

if TYPE_CHECKING:
    from simeon.models import User


class DesktopAuthCode(RecordModel):
    __tablename__ = "desktop_auth_codes"

    code_hash: Mapped[str] = mapped_column(
        CHAR(64), nullable=False, index=True, unique=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, index=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="joined")


class DesktopSession(RecordModel):
    """One signed-in desktop — or, when `job_id` is set, one cloud job.

    A row with a `job_id` is not a device: it is the credential Simeon
    mints when a runner claims a job, so the runner can act as that one
    person for the life of the lease and no longer. It is a
    `DesktopSession` on purpose — see
    `simeon.maty.service.MatyService.claim` for why — and it differs from
    a device's session in three ways, all of them narrowing:

    - its access token expires exactly when the lease does;
    - its refresh token is generated and thrown away, and
      `DesktopService.refresh` refuses a row that names a job, so it can
      never be traded up into a long-lived session;
    - it is revoked the moment the job leaves the runner's hands.
    """

    __tablename__ = "desktop_sessions"

    access_token_hash: Mapped[str] = mapped_column(
        CHAR(64), nullable=False, index=True, unique=True
    )
    access_expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    refresh_token_hash: Mapped[str] = mapped_column(
        CHAR(64), nullable=False, index=True, unique=True
    )
    refresh_expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    user_agent: Mapped[str] = mapped_column(Text, nullable=False, default="")
    client_version: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    #: What kind of client signed this session in (4 October 2026):
    #: `desktop` for the Mac app, `web` for the window served at
    #: app.simeonlabs.com. The web has no Mac behind it, so a web session
    #: can be listed, limited and revoked on its own, and the routes that
    #: only make sense with a Mac (the local-exec daemon credential) refuse
    #: it. Rows from before the column are the Mac's.
    client_kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="desktop", server_default="desktop"
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The cloud job this session exists for, when it is a job token
    #: rather than a device. None for every session a person signed in to.
    job_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("maty_jobs.id", ondelete="cascade"),
        nullable=True,
        default=None,
        index=True,
    )

    #: The signed-in desktop this row is the box credential of, when it
    #: is one (25 September 2026). The person's box (the local Docker
    #: container the agent runs in) keeps running after Simeon quits so
    #: routines fire while the Mac is awake, and with the app gone nothing
    #: rewrites its one-hour access token; this row lets the box renew its
    #: own at `POST /sand-box/inference-credential`. It follows its parent:
    #: re-parented on the parent's refresh, revoked with it on logout,
    #: never traded up (`DesktopService.refresh` refuses it).
    box_of_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_sessions.id", ondelete="cascade"),
        nullable=True,
        default=None,
        index=True,
    )

    #: The session a refresh traded this one for (28 October 2026). A
    #: refresh whose answer never reached the app (the Mac asleep, the phone
    #: leaving the app, the network dropping) left it holding this row's
    #: spent refresh token, and the next refresh signed the person out.
    #: While that successor has never been used, the spent token may be
    #: traded again (`DesktopService.refresh`).
    replaced_by_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_sessions.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    #: When this row's tokens were first used: its access token presented,
    #: or its refresh token traded. None for a pair its app may never have
    #: received.
    first_used_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="joined")

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_job_token(self) -> bool:
        """A credential minted for one cloud job, not a signed-in device."""
        return self.job_id is not None

    @property
    def is_box_credential(self) -> bool:
        """The credential a person's box renews its access token with."""
        return self.box_of_session_id is not None

    @property
    def is_web(self) -> bool:
        """Signed in from the browser at app.simeonlabs.com, with no Mac."""
        return self.client_kind == "web"


class DesktopUsage(RecordModel):
    __tablename__ = "desktop_usage"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_sessions.id", ondelete="set null"),
        nullable=True,
        index=True,
    )
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    #: Who served the call, and therefore which price list the credits
    #: below were read off — `simeon.desktop.pricing.DesktopProvider`.
    #: Without it a credit figure cannot be traced back to the list that
    #: produced it, and two providers' figures stop being comparable the
    #: first time either list moves.
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False, default="anthropic", server_default="anthropic"
    )
    #: What the provider reported for the call, untouched. Cached reads
    #: are their own count and are never part of `input_tokens`, which is
    #: Anthropic's shape; OpenAI's prompt total is split into the two
    #: before it is stored (`Usage.from_openai_payload`).
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_creation_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: What the call cost the person's monthly allowance; see
    #: `simeon.desktop.service.credits_for` for the weights.
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: The part of `credits` drawn from extra credits rather than the week
    #: (27 October 2026, `simeon.plans.credits`): the week counts the rest.
    extra_credits: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    stream: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: The status the provider answered with; a failed call costs nothing.
    upstream_status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Why the app made the call (`chat`, `routine`, `agent_wake`, `helper`,
    #: `safety`, `memory`, `summary`, …), from the `x-simeon-call-reason`
    #: header; None for rows written before it and apps built before it.
    reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    #: When these credits were sent to Stripe's meter
    #: (`simeon.plans.service.report_usage`); None until then.
    stripe_reported_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None, index=True
    )


class DesktopMemoryFile(RecordModel):
    """One memory file of one person, as Simeon holds it.

    The assistant's memory is a handful of small text files in its
    workspace: the durable facts (`MEMORY.md`), a note file per day
    (`memory/YYYY-MM-DD.md`), and a short profile of the person
    (`USER.md`). Each machine used to keep its own copy; this table is
    the shared one, so the app on a computer and the cloud runner write
    into one memory.

    The name is a relative path inside the workspace, and only the three
    shapes above are accepted — see
    `simeon.desktop.memory_merge.is_accepted_memory_name`, which is the
    boundary that keeps a name from escaping the workspace.

    `version` counts writes, starting at 1. A side that writes sends the
    version it started from; when the row has moved on since, Simeon
    merges the two copies by the file's rule and the version goes up by
    one again.
    """

    __tablename__ = "desktop_memory_files"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The path inside the workspace, e.g. `memory/2026-09-11.md`.
    name: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class DesktopChatAgent(RecordModel):
    """One agent of one person, as their computer last listed it (26
    October 2026, the computer as a worker).

    The apps read the agents' list from the computer, so with the
    computer asleep or being updated they had nothing to show. The
    computer now sends its list here (`host/extensions/chat-copy/`) and
    the apps read it while the computer is away (`simeon.desktop.chats`).
    The row is the computer's own (`listAgents`), without its inline
    picture and without what the agent was doing at that moment, which
    a list read later would show as still going.
    """

    __tablename__ = "desktop_chat_agents"
    __table_args__ = (UniqueConstraint("user_id", "agent_id"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    agent_id: Mapped[str] = mapped_column(String(200), nullable=False)
    row: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class DesktopChatLine(RecordModel):
    """One line of one agent's chat, as the computer wrote it (26 October
    2026): a message, a card, a file, a notice, in the shape the apps read
    from the computer (`entry`). Only an agent's newest lines are kept
    (`simeon.desktop.chats.LINES_KEPT`); older ones stay on the computer.
    `at_ms` orders them: the line's own time (`timestampMs`), or when it
    first came for a line without one.
    """

    __tablename__ = "desktop_chat_lines"
    __table_args__ = (
        UniqueConstraint("user_id", "agent_id", "entry_id"),
        Index(
            "ix_desktop_chat_lines_user_id_agent_id_at_ms",
            "user_id",
            "agent_id",
            "at_ms",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    agent_id: Mapped[str] = mapped_column(String(200), nullable=False)
    entry_id: Mapped[str] = mapped_column(String(300), nullable=False)
    at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    entry: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class DesktopChatInbox(RecordModel):
    """A message for one of a person's agents, waiting for their computer
    (26 October 2026, the computer as a worker): written in an app while the
    computer was asleep or out of reach. The computer is woken, takes it
    (`simeon.desktop.chats`, `host/extensions/chat-copy/chat-inbox.ts`) and
    hands it to the agent as if the app had sent it; the row goes once it
    has. `nonce` is the app's own id for the message, which the computer
    keeps on the line it writes, so a message sent both ways lands once.
    `kind` is `prompt` (a message written in an app); `message` is what the
    app would have sent the computer (`sendPrompt`).
    """

    __tablename__ = "desktop_chat_inbox"
    __table_args__ = (UniqueConstraint("user_id", "nonce"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    agent_id: Mapped[str] = mapped_column(String(200), nullable=False)
    nonce: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class DesktopChannelBot(RecordModel):
    """An agent's own Discord or Slack bot, listened to from the server (26
    October 2026, `simeon.desktop.channel_bots`): the person's computer
    hands its tokens here and the cloud runner holds the bot's connection,
    so the bot hears its messages while the computer sleeps. `secrets` is
    the tokens sealed (`simeon.kit.sealed`), never the tokens themselves;
    `fingerprint` is the computer's own mark of them, which says whether
    they changed without opening them. `status`, `detail` and `status_at`
    are what the runner last reported of the connection.
    """

    __tablename__ = "desktop_channel_bots"
    __table_args__ = (UniqueConstraint("user_id", "agent_id", "platform"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    agent_id: Mapped[str] = mapped_column(String(200), nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)
    secrets: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )


class DesktopVoiceCall(RecordModel):
    """One voice call the app placed to an agent, once it was billed.

    The call itself runs between the app and ElevenLabs
    (`simeon.desktop.voice`); Simeon only mints the token that opens it
    and, when the app hangs up, bills the minutes. This row is written at
    that moment and is what makes the bill idempotent: the conversation
    id is unique, so an app that says « ended » twice is billed once, and
    a conversation already claimed by one person is never another's.
    """

    __tablename__ = "desktop_voice_calls"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_sessions.id", ondelete="set null"),
        nullable=True,
        index=True,
    )
    #: ElevenLabs' own id for the conversation (`conv_…`).
    conversation_id: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True
    )
    #: The seconds billed.
    seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Where `seconds` came from: `provider` when ElevenLabs reported the
    #: call's duration, `app` when it did not and the app's own count
    #: (capped) was used instead.
    duration_source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="provider"
    )
