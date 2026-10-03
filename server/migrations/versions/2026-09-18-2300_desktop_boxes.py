"""the person's computer: one box row per account

Revision ID: desktop_boxes_0918
Revises: desktop_voice_calls_0930
Create Date: 2026-09-18 23:00:00.000000

One new table and nothing else touched. See simeon/models/desktop.py,
simeon/desktop/boxes.py and docs/product/agent-computer-plan.md.

The unique constraint is on (user_id, scope_key), and that pair is what
makes `POST /box/sandboxes` mean « ensure » rather than « create »: the
engine asks for a scope and the broker decides whether that is a box it
already has. The product uses one scope, `shared` — one box for all of
a person's agents — so in practice there is one row per account, which
is the founder's rule (*there is no "which computer", only this
computer*). Each accidental extra row would be a second bill.

Re-pointed four times, every time for the same reason. It was written
against `maty_job_times_0912`; `desktop_box_credential_0925` landed on
`main` against that same parent, and then five more (`sand_listeners`,
`desktop_share_rooms`, `sand_cloud_agents`, `sand_boxes`, `sand_plugins`)
chained behind it, which cost two re-pointings on 25 September. On 29
September `sand_box_sleep_0928` landed on `main` against
`sand_plugins_0925` — the parent this file had just been given — and on
1 October `desktop_voice_calls_0930` landed against *that* one, each time
printing two heads, and `upgrade head` refuses to run with two. Four
re-pointings, one cause, every time. It now stacks on
`desktop_voice_calls_0930`, `main`'s tip. The file is still dated the
18th because that is when it was written; the chain, not the filename, is
what alembic reads.

Expect to do this again, and expect nothing to warn you: the suite builds
its schema from `Model.metadata.create_all`, so every test passes with
two heads, and `Server: Migration Check` has never been given a runner.
`alembic heads` is the only thing that says so, and it has to be run by
hand after every merge of `main`.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "desktop_boxes_0918"
down_revision = "desktop_voice_calls_0930"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.create_table(
        "desktop_boxes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("scope_key", sa.String(length=128), nullable=False),
        sa.Column("sandbox_id", sa.String(length=128), nullable=True),
        sa.Column("template_id", sa.String(length=128), nullable=False),
        sa.Column("snapshot_id", sa.String(length=128), nullable=True),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("running_since", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("billed_through", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("desktop_boxes_user_id_fkey"),
            ondelete="cascade",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("desktop_boxes_pkey")),
    )
    # Unique among **live** rows only, and the partial predicate is the
    # whole point. A deleted box is soft-deleted, so its row keeps
    # holding (user_id, scope_key) forever; with a plain unique
    # constraint the next `ensure` after somebody deletes their computer
    # is refused by the database, which is the obvious thing to do after
    # a reset that went badly.
    op.create_index(
        "ix_desktop_boxes_live_scope",
        "desktop_boxes",
        ["user_id", "scope_key"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        op.f("ix_desktop_boxes_created_at"),
        "desktop_boxes",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_boxes_deleted_at"),
        "desktop_boxes",
        ["deleted_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_desktop_boxes_user_id"),
        "desktop_boxes",
        ["user_id"],
        unique=False,
    )
    # Looked up by sandbox id when E2B tells us about a box rather than
    # the other way round — a webhook, or a reconciliation sweep.
    op.create_index(
        op.f("ix_desktop_boxes_sandbox_id"),
        "desktop_boxes",
        ["sandbox_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("desktop_boxes")
