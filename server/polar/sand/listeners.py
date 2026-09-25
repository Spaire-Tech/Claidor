"""Event routines (listeners) — Slack, GitHub, Linear, Sentry, PagerDuty
— served from Simeon Labs' server (25 September 2026,
`docs/product/listeners-served.md`).

The app side never changed: the automations extension in the box
(`desktop/source/host/extensions/automations/`) registers what it
listens for, polls two queues, mirrors each routine as a shadow workflow
and completes runs, exactly as it did against Cursor's server. This
package is that server, split by what the app calls:

- `listeners_relay.py` — the five JSON routes (`/sand/listener-*`,
  `/sand/automation-*`), plus the webhook mint;
- `listeners_automations.py` — `aiserver.v1.AutomationsService`
  (List/Create/Update/DeleteSandAutomation);
- `listeners_connections.py` — the `DashboardService` Slack/SCM reads,
  the install pages for Simeon's Slack app and GitHub App;
- `listeners_ingress.py` — where Slack, GitHub, Linear, Sentry and
  PagerDuty deliver;
- `listeners_service.py`, `listeners_repository.py`, `listeners_cron.py`,
  `listeners_slack.py`, `listeners_tasks.py` — the logic, the queries,
  the cron reader, the Slack client, the worker's minute tick.

Microsoft Teams stays Coming Soon: its trigger is accepted and stored,
but no bot delivers a Teams message here.
"""

from __future__ import annotations

from polar.openapi import APITag
from polar.routing import APIRouter

from . import (
    listeners_automations,
    listeners_connections,
    listeners_ingress,
    listeners_relay,
)

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)
router.include_router(listeners_relay.router)
router.include_router(listeners_ingress.router)
router.include_router(listeners_connections.router)
router.include_router(listeners_automations.router)
