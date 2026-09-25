"""The listener relay's logic (25 September 2026): what a box listens
for, which routine an event fires, the two queues and the cron owed.

Every shape here is the app's. A relay event is what
`mapRelayWireEvent` reads (`backend-relay-source.ts`); a fire's `event`
is what `parseFireTriggerEvent` reads
(`sand-automation-fire-consumer.ts`); a workflow's triggers are
`aiserver.v1.Trigger` as protobuf JSON, written by
`sand-automation-cloud-sync.ts` and `sand-automation-cloud-trigger.ts`.
The matching below mirrors `host/automations/automation-trigger.ts`
(`slackListenerMatches`, `githubListenerMatches`,
`listenerMatchesEvent`), because the box re-checks every fire against
its own copy of the trigger and drops one that no longer matches.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import structlog

from polar.kit.utils import utc_now
from polar.models import (
    SandAutomation,
    SandAutomationFire,
    SandListenerConnection,
    SandListenerEvent,
    SandListenerSubscription,
)
from polar.postgres import AsyncSession
from polar.redis import Redis

from .listeners_cron import next_workflow_fire
from .listeners_repository import (
    SandAutomationFireRepository,
    SandAutomationRepository,
    SandListenerConnectionRepository,
    SandListenerEventRepository,
    SandListenerSubscriptionRepository,
)
from .notify import publish

log = structlog.get_logger()

SHADOW_PREFIX = "sand-shadow:"
ANY_SCOPE = "*"
#: A pending fire older than this is not handed to a box that comes back:
#: a routine that missed its slot by hours runs at its next one instead.
FIRE_TTL = timedelta(hours=2)
#: A relay event nobody polled for in this long is dropped.
RELAY_EVENT_TTL = timedelta(days=2)
NEXT_POLL_AFTER_MS = 15_000
WEBHOOK_PLATFORMS = ("linear", "sentry", "pagerduty")

GITHUB_KINDS = (
    "pr-opened",
    "pr-pushed",
    "pr-merged",
    "review-requested",
    "review-approved",
    "review-changes-requested",
    "review-commented",
    "pr-comment",
    "inline-review-comment",
    "review-thread-resolved",
    "review-thread-unresolved",
    "issue-assigned",
    "ci-passed",
    "ci-failed",
)
PR_ACTION_OF_KIND = {"pr-opened": 1, "pr-pushed": 2, "pr-merged": 3, "pr-comment": 4}
PR_ACTION_NAMES = {
    "UNSPECIFIED": 0,
    "OPENED": 1,
    "PUSHED": 2,
    "MERGED": 3,
    "COMMENTED": 4,
    "DRAFT_OPENED": 5,
    "LABELED": 6,
    "UNLABELED": 7,
}
CI_CONDITION_NAMES = {"UNSPECIFIED": 0, "FAILURE": 1, "SUCCESS": 2, "ANY": 3}
PR_OWNER_KINDS = {
    "pr-opened",
    "pr-pushed",
    "pr-merged",
    "pr-comment",
    "inline-review-comment",
}
REVIEW_KINDS = {
    "review-approved",
    "review-changes-requested",
    "review-commented",
    "review-thread-resolved",
    "review-thread-unresolved",
    "review-requested",
}


def _enum(value: object, names: dict[str, int], prefix: str) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        key = value.upper()
        if key.startswith(prefix):
            key = key[len(prefix) :]
        return names.get(key, 0)
    return 0


def _strings(value: object) -> list[str]:
    return (
        [entry for entry in value if isinstance(entry, str)]
        if isinstance(value, list)
        else []
    )


def _repo_of_url(url: str) -> str:
    stripped = url.strip().rstrip("/")
    for prefix in ("https://github.com/", "http://github.com/", "github.com/"):
        if stripped.lower().startswith(prefix):
            stripped = stripped[len(prefix) :]
            break
    return stripped.removesuffix(".git").lower()


def _repos_match(repos: object, repo: str) -> bool:
    wanted = repo.lower()
    return any(_repo_of_url(entry) == wanted for entry in _strings(repos))


def slack_scope_matches(scope: str, channel: str, channel_id: str | None) -> bool:
    if scope == ANY_SCOPE:
        return True
    if channel_id is not None and scope == channel_id:
        return True
    return scope.lstrip("#").lower() == channel.lstrip(
        "#"
    ).lower() and not scope.startswith("@")


def _slack_channels_match(trigger: dict[str, Any], event: dict[str, Any]) -> bool:
    channels = _strings(trigger.get("channels"))
    if not channels and isinstance(trigger.get("channel"), str):
        channels = [trigger["channel"]]
    channel = event.get("channel")
    if not isinstance(channel, str):
        return False
    channel_id = (
        event.get("channelId") if isinstance(event.get("channelId"), str) else None
    )
    return any(slack_scope_matches(scope, channel, channel_id) for scope in channels)


def _emoji_name(value: object) -> str:
    return (
        str(value).strip().strip(":").split("::")[0].lower()
        if isinstance(value, str)
        else ""
    )


def _admit(users: list[str], subject: object) -> bool:
    if not isinstance(subject, str):
        return True  # `admitMissingSubject`, as the box re-checks
    return any(
        user.lower().lstrip("@") == subject.lower().lstrip("@") for user in users
    )


def _git_matches(git: dict[str, Any], event: dict[str, Any]) -> bool:
    repo, kind = event.get("repo"), event.get("kind")
    if not isinstance(repo, str) or not isinstance(kind, str):
        return False
    matched = False
    if (
        (pull := git.get("pullRequest"))
        and isinstance(pull, dict)
        and kind in PR_ACTION_OF_KIND
    ):
        action = _enum(
            pull.get("prAction"), PR_ACTION_NAMES, "GIT_PULL_REQUEST_ACTION_"
        )
        matched = (
            _repos_match(pull.get("repos"), repo) and action == PR_ACTION_OF_KIND[kind]
        )
    elif (
        (requested := git.get("pullRequestReviewRequested"))
        and isinstance(requested, dict)
        and kind == "review-requested"
    ):
        matched = _repos_match(requested.get("repos"), repo)
    elif (
        (review := git.get("pullRequestReview"))
        and isinstance(review, dict)
        and kind in ("review-approved", "review-changes-requested", "review-commented")
    ):
        flag = {
            "review-approved": "onApproved",
            "review-changes-requested": "onChangesRequested",
            "review-commented": "onCommented",
        }[kind]
        matched = _repos_match(review.get("repos"), repo) and review.get(flag) is True
    elif (
        (comment := git.get("pullRequestReviewComment"))
        and isinstance(comment, dict)
        and kind == "inline-review-comment"
    ):
        matched = _repos_match(comment.get("repos"), repo)
    elif (
        (thread := git.get("reviewThread"))
        and isinstance(thread, dict)
        and kind in ("review-thread-resolved", "review-thread-unresolved")
    ):
        flag = "onResolved" if kind == "review-thread-resolved" else "onUnresolved"
        matched = _repos_match(thread.get("repos"), repo) and thread.get(flag) is True
    elif (
        (assigned := git.get("issueAssigned"))
        and isinstance(assigned, dict)
        and kind == "issue-assigned"
    ):
        matched = _repos_match(assigned.get("repos"), repo)
    elif (
        (ci := git.get("ciCompleted"))
        and isinstance(ci, dict)
        and kind in ("ci-passed", "ci-failed")
    ):
        condition = _enum(
            ci.get("condition"), CI_CONDITION_NAMES, "GIT_CI_COMPLETION_CONDITION_"
        )
        wanted = {"ci-passed": (2, 3), "ci-failed": (1, 3)}[kind]
        branch = ci.get("branch")
        branch_ok = (
            not isinstance(branch, str)
            or not branch
            or not isinstance(event.get("branch"), str)
            or event["branch"] == branch
        )
        return _repos_match(ci.get("repos"), repo) and condition in wanted and branch_ok
    if not matched:
        return False
    users = _strings(git.get("userAllowlist"))
    if not users:
        return True
    if kind in PR_OWNER_KINDS:
        return _admit(users, event.get("prOwner"))
    if kind in REVIEW_KINDS:
        return _admit(users, event.get("actor")) and _admit(users, event.get("prOwner"))
    return _admit(users, event.get("actor"))


def _ids_match(wanted: object, actual: object) -> bool:
    ids = _strings(wanted)
    return not ids or (isinstance(actual, str) and actual in ids)


def trigger_matches_event(trigger: dict[str, Any], event: dict[str, Any]) -> bool:
    """One `aiserver.v1.Trigger` (protobuf JSON) against one fire event."""
    source = event.get("source")
    if source == "slack":
        is_reaction = isinstance(event.get("reactionEmoji"), str) and bool(
            event["reactionEmoji"]
        )
        if (mention := trigger.get("slackMention")) is not None and isinstance(
            mention, dict
        ):
            return (
                not is_reaction
                and event.get("isMention") is True
                and _slack_channels_match(mention, event)
            )
        if (plain := trigger.get("slackTrigger")) is not None and isinstance(
            plain, dict
        ):
            if is_reaction or not _slack_channels_match(plain, event):
                return False
            contains = plain.get("messageContains")
            if isinstance(contains, str) and contains:
                text = event.get("text")
                return isinstance(text, str) and contains.lower() in text.lower()
            return True
        if (reaction := trigger.get("slackReactionAdded")) is not None and isinstance(
            reaction, dict
        ):
            if not is_reaction or not _slack_channels_match(reaction, event):
                return False
            if (
                reaction.get("onlyOwnerReactions") is True
                and event.get("isSelf") is not True
            ):
                return False
            return _emoji_name(reaction.get("emojiName")) == _emoji_name(
                event.get("reactionEmoji")
            )
        if (
            any_reaction := trigger.get("slackAnyReactionAdded")
        ) is not None and isinstance(any_reaction, dict):
            if not is_reaction or not _slack_channels_match(any_reaction, event):
                return False
            return (
                any_reaction.get("onlyOwnerReactions") is not True
                or event.get("isSelf") is True
            )
        return False
    if source == "github":
        git = trigger.get("git")
        return isinstance(git, dict) and _git_matches(git, event)
    if source == "linear":
        linear = trigger.get("linear")
        if not isinstance(linear, dict):
            return False
        if not _ids_match(
            linear.get("projectIds"), event.get("projectId")
        ) or not _ids_match(linear.get("teamIds"), event.get("teamId")):
            return False
        kind = event.get("event")
        if kind == "issueCreated":
            return isinstance(linear.get("issueCreated"), dict)
        if kind == "statusChanged":
            changed = linear.get("statusChanged")
            return isinstance(changed, dict) and _ids_match(
                changed.get("statusIds"), event.get("statusId")
            )
        if kind == "endOfCycle":
            end = linear.get("endOfCycle")
            return isinstance(end, dict) and _ids_match(
                end.get("cycleIds"), event.get("cycleId")
            )
        return False
    if source == "sentry":
        sentry = trigger.get("sentry")
        if not isinstance(sentry, dict) or not _ids_match(
            sentry.get("projectIds"), event.get("projectId")
        ):
            return False
        kind = event.get("event")
        return isinstance(sentry.get("issueAny"), dict) or (
            isinstance(kind, str) and isinstance(sentry.get(kind), dict)
        )
    if source == "pagerduty":
        pagerduty = trigger.get("pagerduty")
        if not isinstance(pagerduty, dict) or not _ids_match(
            pagerduty.get("serviceIds"), event.get("serviceId")
        ):
            return False
        kind = event.get("event")
        return isinstance(pagerduty.get("incidentAny"), dict) or (
            isinstance(kind, str) and isinstance(pagerduty.get(kind), dict)
        )
    return False


def workflow_matches_event(workflow: dict[str, Any], event: dict[str, Any]) -> bool:
    triggers = workflow.get("triggers")
    if not isinstance(triggers, list):
        return False
    return any(
        isinstance(trigger, dict) and trigger_matches_event(trigger, event)
        for trigger in triggers
    )


def relay_event_of_fire_event(event: dict[str, Any]) -> dict[str, Any]:
    """The relay's wire shape of a Slack or GitHub fire event: what
    `mapRelayWireEvent` reads and turns back into the fire shape."""
    if event.get("source") == "slack":
        sender = event.get("sender")
        wire: dict[str, Any] = {
            "source": "slack",
            "kind": "reaction" if event.get("reactionEmoji") else "message",
            "channelName": event.get("channel"),
            "senderSlackUserId": sender[1:]
            if isinstance(sender, str) and sender.startswith("@")
            else sender,
            "text": event.get("text", ""),
            "isMention": event.get("isMention") is True,
            "isSelf": event.get("isSelf") is True,
            "timestampMs": event.get("timestampMs"),
        }
        for key in ("channelId", "ts", "threadTs"):
            if isinstance(event.get(key), str):
                wire[key] = event[key]
        if event.get("reactionEmoji"):
            wire["reactionEmoji"] = _emoji_name(event["reactionEmoji"])
        return wire
    wire = {
        key: value
        for key, value in event.items()
        if key
        in (
            "source",
            "repo",
            "kind",
            "title",
            "actor",
            "url",
            "detail",
            "prOwner",
            "branch",
            "timestampMs",
        )
    }
    return wire


def _timestamp_ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


class ListenersService:
    # --- subscriptions ----------------------------------------------------

    async def register_subscriptions(
        self, session: AsyncSession, user_id: UUID, body: dict[str, Any]
    ) -> SandListenerSubscription:
        repository = SandListenerSubscriptionRepository.from_session(session)
        row = await repository.get_for_user(user_id)
        values = {
            "slack_channels": _strings(body.get("slackChannels")),
            "github_repos": [
                repo.lower() for repo in _strings(body.get("githubRepos"))
            ],
            "github_kinds": [
                kind
                for kind in _strings(body.get("githubKinds"))
                if kind in GITHUB_KINDS
            ],
        }
        if row is None:
            row = await repository.create(
                SandListenerSubscription(user_id=user_id, **values), flush=True
            )
        else:
            row = await repository.update(row, update_dict=values)
        return row

    # --- the relay queue ----------------------------------------------------

    async def poll_relay_events(
        self, session: AsyncSession, user_id: UUID, ack_ids: list[str]
    ) -> list[dict[str, Any]]:
        repository = SandListenerEventRepository.from_session(session)
        await repository.ack(
            user_id,
            [uuid for uuid in (_uuid(value) for value in ack_ids) if uuid is not None],
        )
        await repository.delete_older_than(utc_now() - RELAY_EVENT_TTL)
        return [
            {"id": str(row.id), **row.payload}
            for row in await repository.list_pending(user_id)
        ]

    # --- the fire queue -----------------------------------------------------

    async def poll_fires(
        self, session: AsyncSession, user_id: UUID, ack_run_uuids: list[str]
    ) -> list[dict[str, Any]]:
        repository = SandAutomationFireRepository.from_session(session)
        await repository.ack(
            user_id,
            [
                uuid
                for uuid in (_uuid(value) for value in ack_run_uuids)
                if uuid is not None
            ],
        )
        await repository.expire_pending_before(user_id, utc_now() - FIRE_TTL)
        events: list[dict[str, Any]] = []
        for fire in await repository.list_open(user_id):
            wire: dict[str, Any] = {
                "id": str(fire.id),
                "sandAgentId": fire.sand_agent_id,
                "automationId": fire.automation_id,
                "timestampMs": _timestamp_ms(fire.created_at),
            }
            if fire.definition_revision:
                wire["definitionRevision"] = fire.definition_revision
            if fire.scheduled_for is not None:
                wire["scheduledForMs"] = _timestamp_ms(fire.scheduled_for)
            if fire.event is not None:
                wire["event"] = fire.event
            events.append(wire)
        return events

    async def complete_fire(
        self,
        session: AsyncSession,
        user_id: UUID,
        run_uuid: str,
        status: str,
        error_message: str | None,
    ) -> bool:
        repository = SandAutomationFireRepository.from_session(session)
        fire_id = _uuid(run_uuid)
        fire = (
            None if fire_id is None else await repository.get_for_user(user_id, fire_id)
        )
        if fire is None:
            return False
        if fire.status in ("completed", "acked"):
            return True
        await repository.update(
            fire,
            update_dict={
                "status": "completed",
                "outcome": "succeeded" if status == "succeeded" else "failed",
                "error_message": error_message,
                "completed_at": utc_now(),
            },
        )
        log.info(
            "sand.listeners.run_completed",
            user_id=str(user_id),
            run_uuid=run_uuid,
            automation_id=fire.automation_id,
            status=status,
            error=error_message,
        )
        return True

    async def enqueue_fire(
        self,
        session: AsyncSession,
        automation: SandAutomation,
        *,
        event: dict[str, Any] | None = None,
        scheduled_for: datetime | None = None,
    ) -> SandAutomationFire:
        repository = SandAutomationFireRepository.from_session(session)
        fire = await repository.create(
            SandAutomationFire(
                user_id=automation.user_id,
                automation_row_id=automation.id,
                sand_agent_id=automation.sand_agent_id,
                automation_id=automation.automation_id,
                definition_revision=automation.definition_revision,
                scheduled_for=scheduled_for,
                event=event,
                status="pending",
            ),
            flush=True,
        )
        log.info(
            "sand.listeners.fire_enqueued",
            user_id=str(automation.user_id),
            run_uuid=str(fire.id),
            automation_id=automation.automation_id,
            source=None if event is None else event.get("source"),
            scheduled_for=None if scheduled_for is None else scheduled_for.isoformat(),
        )
        return fire

    # --- the shadow workflows ------------------------------------------------

    async def upsert_automation(
        self,
        session: AsyncSession,
        user_id: UUID,
        *,
        automation_id: str,
        sand_agent_id: str | None,
        name: str | None,
        description: str | None,
        enabled: bool | None,
        workflow: dict[str, Any] | None,
    ) -> SandAutomation:
        repository = SandAutomationRepository.from_session(session)
        row = await repository.get_by_automation_id(user_id, automation_id)
        now = utc_now()
        if row is None:
            row = await repository.create(
                SandAutomation(
                    user_id=user_id,
                    sand_agent_id=sand_agent_id or "",
                    automation_id=automation_id,
                    name=name or "",
                    description=description or "",
                    enabled=True if enabled is None else enabled,
                    workflow=workflow or {},
                    next_fire_at=next_workflow_fire(workflow or {}, now),
                ),
                flush=True,
            )
        else:
            update_dict: dict[str, Any] = {}
            if sand_agent_id:
                update_dict["sand_agent_id"] = sand_agent_id
            if name is not None:
                update_dict["name"] = name
            if description is not None:
                update_dict["description"] = description
            if enabled is not None:
                update_dict["enabled"] = enabled
            if workflow is not None:
                update_dict["workflow"] = workflow
                update_dict["next_fire_at"] = next_workflow_fire(workflow, now)
            row = await repository.update(row, update_dict=update_dict, flush=True)
        log.info(
            "sand.listeners.automation_upserted",
            user_id=str(user_id),
            automation_id=automation_id,
            enabled=row.enabled,
            next_fire_at=None
            if row.next_fire_at is None
            else row.next_fire_at.isoformat(),
        )
        return row

    async def delete_automation(
        self, session: AsyncSession, user_id: UUID, automation_id: str
    ) -> bool:
        repository = SandAutomationRepository.from_session(session)
        row = await repository.get_by_automation_id(user_id, automation_id)
        if row is None:
            return False
        await session.delete(row)
        await session.flush()
        return True

    async def list_automations(
        self, session: AsyncSession, user_id: UUID, sand_agent_id: str
    ) -> list[SandAutomation]:
        repository = SandAutomationRepository.from_session(session)
        return list(await repository.list_for_agent(user_id, sand_agent_id))

    # --- ingress → the two queues ---------------------------------------------

    async def ingest_event(
        self,
        session: AsyncSession,
        redis: Redis,
        user_ids: list[UUID],
        event: dict[str, Any],
    ) -> dict[str, int]:
        """One normalized event (the fire shape) for the people it may
        concern: a relay row for every subscribed box, a fire for every
        enabled shadow routine whose trigger matches. Wakes both streams."""
        event.setdefault("timestampMs", _timestamp_ms(utc_now()))
        relayed = 0
        fired = 0
        source = event.get("source")
        subscriptions = SandListenerSubscriptionRepository.from_session(session)
        events = SandListenerEventRepository.from_session(session)
        automations = SandAutomationRepository.from_session(session)
        for user_id in dict.fromkeys(user_ids):
            subscription = await subscriptions.get_for_user(user_id)
            if (
                source in ("slack", "github")
                and subscription is not None
                and self._subscribed(subscription, event)
            ):
                await events.create(
                    SandListenerEvent(
                        user_id=user_id,
                        source=str(source),
                        payload=relay_event_of_fire_event(event),
                    ),
                    flush=True,
                )
                relayed += 1
                await publish(redis, user_id, "listener-events")
            fired_here = 0
            for automation in await automations.list_enabled(user_id):
                if workflow_matches_event(automation.workflow, event):
                    await self.enqueue_fire(session, automation, event=event)
                    fired_here += 1
            if fired_here:
                fired += fired_here
                await publish(redis, user_id, "automation-fires")
        log.info(
            "sand.listeners.event_ingested",
            source=source,
            users=len(set(user_ids)),
            relayed=relayed,
            fired=fired,
        )
        return {"relayed": relayed, "fired": fired}

    @staticmethod
    def _subscribed(
        subscription: SandListenerSubscription, event: dict[str, Any]
    ) -> bool:
        if event.get("source") == "slack":
            channel = event.get("channel")
            channel_id = (
                event.get("channelId")
                if isinstance(event.get("channelId"), str)
                else None
            )
            return isinstance(channel, str) and any(
                slack_scope_matches(scope, channel, channel_id)
                for scope in subscription.slack_channels
            )
        repo, kind = event.get("repo"), event.get("kind")
        return (
            isinstance(repo, str)
            and repo.lower() in subscription.github_repos
            and (not subscription.github_kinds or kind in subscription.github_kinds)
        )

    # --- cron ----------------------------------------------------------------

    async def fire_due_crons(
        self, session: AsyncSession, redis: Redis, now: datetime | None = None
    ) -> int:
        """Called every minute by the worker: one fire per due routine,
        never a second pending one for the same routine (a box that was
        off for a day gets one run, not twenty-four), then the next slot."""
        now = now or utc_now()
        automations = SandAutomationRepository.from_session(session)
        fires = SandAutomationFireRepository.from_session(session)
        count = 0
        woken: set[UUID] = set()
        for automation in await automations.list_due(now):
            slot = automation.next_fire_at
            following = next_workflow_fire(automation.workflow, now)
            await automations.update(
                automation, update_dict={"next_fire_at": following}
            )
            if slot is None or await fires.has_pending_cron_fire(automation.id):
                continue
            await self.enqueue_fire(session, automation, scheduled_for=slot)
            count += 1
            woken.add(automation.user_id)
        for user_id in woken:
            await publish(redis, user_id, "automation-fires")
        if count:
            log.info("sand.listeners.cron_fired", fires=count, users=len(woken))
        return count

    # --- connections ---------------------------------------------------------

    async def has_connection(
        self, session: AsyncSession, user_id: UUID, platform: str
    ) -> bool:
        repository = SandListenerConnectionRepository.from_session(session)
        return len(await repository.list_for_user(user_id, platform)) > 0

    async def ensure_webhook_connection(
        self, session: AsyncSession, user_id: UUID, platform: str
    ) -> SandListenerConnection:
        """The person's inbound webhook for Linear, Sentry or PagerDuty:
        a URL token and a signing secret, minted once per person."""
        if platform not in WEBHOOK_PLATFORMS:
            raise ValueError(platform)
        repository = SandListenerConnectionRepository.from_session(session)
        rows = await repository.list_for_user(user_id, platform)
        if rows:
            return rows[0]
        return await repository.create(
            SandListenerConnection(
                user_id=user_id,
                platform=platform,
                external_id=f"user:{user_id}",
                external_name=platform,
                webhook_token=secrets.token_urlsafe(24),
                signing_secret=secrets.token_hex(32),
                extra={},
            ),
            flush=True,
        )


def _uuid(value: object) -> UUID | None:
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


listeners = ListenersService()
