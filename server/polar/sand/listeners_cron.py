"""The cron schedules a shadow workflow carries, read the way the app
writes them (25 September 2026).

`cronCloudTrigger` in `sand-automation-cloud-sync.ts` writes one
`aiserver.v1.CronTrigger.cron` per schedule: a five-field expression,
`CRON_TZ=<zone> <expression>` when the routine or the person has a time
zone, or `@every <n><s|m|h|d>`; the `@daily` aliases are expanded before
they reach the wire, but are accepted here anyway. The next slot is
computed with APScheduler's cron trigger, which the worker already
schedules with.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.triggers.cron import CronTrigger

EVERY_PATTERN = re.compile(r"^@every\s+(\d+)\s*(s|m|h|d)$", re.IGNORECASE)
UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}
CRON_ALIASES = {
    "@hourly": "0 * * * *",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@weekly": "0 0 * * 0",
    "@monthly": "0 0 1 * *",
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
}
TZ_PREFIX = re.compile(r"^(?:CRON_TZ|TZ)=(\S+)\s+")


def split_schedule(raw: str) -> tuple[str, str | None]:
    """The expression and the zone it pins, if any."""
    normalized = " ".join(raw.strip().split())
    match = TZ_PREFIX.match(normalized)
    if match is None:
        return normalized, None
    return normalized[match.end() :], match.group(1)


def next_fire_after(
    schedule: str, after: datetime, default_zone: str | None = None
) -> datetime | None:
    """The first slot strictly after `after`, in UTC; None when the
    schedule cannot be read."""
    expression, pinned_zone = split_schedule(schedule)
    if after.tzinfo is None:
        after = after.replace(tzinfo=UTC)
    every = EVERY_PATTERN.match(expression)
    if every is not None:
        seconds = int(every.group(1)) * UNIT_SECONDS[every.group(2).lower()]
        return after + timedelta(seconds=seconds) if seconds > 0 else None
    expression = CRON_ALIASES.get(expression.lower(), expression)
    zone_name = pinned_zone or default_zone or "UTC"
    try:
        zone = ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("UTC")
    try:
        trigger = CronTrigger.from_crontab(expression, timezone=zone)
    except ValueError:
        return None
    following = trigger.get_next_fire_time(None, after + timedelta(seconds=1))
    return None if following is None else following.astimezone(UTC)


def cron_expressions_of(workflow: dict[str, object]) -> list[str]:
    """Every `cron` trigger's expression in a workflow's protobuf JSON."""
    triggers = workflow.get("triggers")
    if not isinstance(triggers, list):
        return []
    found: list[str] = []
    for trigger in triggers:
        if not isinstance(trigger, dict):
            continue
        cron = trigger.get("cron")
        if (
            isinstance(cron, dict)
            and isinstance(cron.get("cron"), str)
            and cron["cron"].strip()
        ):
            found.append(cron["cron"])
    return found


def next_workflow_fire(workflow: dict[str, object], after: datetime) -> datetime | None:
    """The earliest next slot over every cron trigger of the workflow."""
    earliest: datetime | None = None
    for expression in cron_expressions_of(workflow):
        candidate = next_fire_after(expression, after)
        if candidate is not None and (earliest is None or candidate < earliest):
            earliest = candidate
    return earliest
