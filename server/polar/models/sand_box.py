"""The person's computer in the cloud (25 September 2026).

One row per person per box: the container Simeon Labs' box host runs
for them, where it is reachable, and the two secrets the app is handed
by `aiserver.v1.GrokBotService/EnsureSandBox` (`polar.sand.box_broker`).
The app side of this was complete before the row existed
(`BrokeredHostConnector`, the descriptor cache, the VNC proxy rewrite,
the egress tunnel); this table is what the broker answers from.

- `gateway_token` is the bearer the in-box gateway (port 1340) checks,
  the same `SAND_GATEWAY_TOKEN` the local Docker path draws at random.
- `network_token` is what Cursor's pod proxy checked as
  `x-anyrun-network-token`; here `polar.sand.box_proxy` checks it on
  every proxied request, and the Caddy on a box VM checks it when the
  founder runs the per-port hostnames instead (`docs/product/cloud-computer-served.md`).
- `ports` maps the box's inner ports (1340 gateway, 6080/6081 noVNC,
  8790 egress tunnel) to the host ports the box host published them on.
- `credential_session_id` is the `desktop_sessions` row (a box
  credential, `is_box_credential`) injected into the container as
  `SAND_INFERENCE_RENEWAL_CREDENTIAL`; when that row is revoked (sign-out)
  the next `EnsureSandBox` recreates the container with a fresh one.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from .user import User


class SandBox(RecordModel):
    __tablename__ = "sand_boxes"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: `docker` or `e2b`: the `BoxHost` that runs it (`polar.sand.box_hosts`).
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    #: The host's own id for the box: a Docker container id, an E2B sandbox id.
    provider_box_id: Mapped[str] = mapped_column(String(256), nullable=False)
    #: The address the API reaches the published ports on (the box VM).
    host_address: Mapped[str] = mapped_column(String(256), nullable=False)
    #: Inner port → published host port, as strings ("1340" → 32768).
    ports: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    gateway_token: Mapped[str] = mapped_column(Text, nullable=False)
    network_token: Mapped[str] = mapped_column(Text, nullable=False)
    #: What the last `EnsureSandBox` answered, so the local-exec trade and
    #: the run-state read answer the same thing without recomputing.
    gateway_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    vnc_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    fork_vnc_base_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: `running`, `hibernated` (stopped, data kept) or `absent` (removed);
    #: `aiserver.v1.SandBoxRunState` is answered from this.
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="absent")
    image: Mapped[str] = mapped_column(Text, nullable=False, default="")
    image_digest: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    credential_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_sessions.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    last_ensured_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="joined")

    def host_port(self, inner: int) -> int | None:
        value = self.ports.get(str(inner))
        return (
            int(value)
            if isinstance(value, int | str) and str(value).isdigit()
            else None
        )
