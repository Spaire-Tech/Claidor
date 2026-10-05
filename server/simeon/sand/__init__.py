"""`/sand/*`, `/simeon.v1.*` and, for one release, the upstream's
`/aiserver.v1.*` and `/agent.v1.*` names: the half of the upstream's server
the app in `desktop/` expects, served by Simeon Labs (25 September 2026,
`docs/services-agents.md`; Simeon's own service names since 5 October 2026).

Every route here sits at the root of the API host because the app builds
each with a leading slash (see `simeon.desktop.app_sign_in`). One module
per feature, each mounted below; the Connect catch-all goes last so that
any method nothing serves answers `unimplemented` in Connect's shape.
"""

from __future__ import annotations

from simeon.openapi import APITag
from simeon.routing import APIRouter

from . import (
    box_broker,
    cloud_agents,
    dashboard,
    listeners,
    notify,
    sharing,
    skill_registry,
)
from .connect import unimplemented_router

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)
router.include_router(notify.router)
router.include_router(dashboard.router)
router.include_router(listeners.router)
router.include_router(box_broker.router)
router.include_router(cloud_agents.router)
router.include_router(skill_registry.router)
router.include_router(sharing.router)
# After every served service.
router.include_router(unimplemented_router("simeon.v1", "aiserver.v1", "agent.v1"))

__all__ = ["router"]
