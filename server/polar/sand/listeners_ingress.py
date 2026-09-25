"""Where events come in (25 September 2026): Slack's Events API,
Simeon's GitHub App webhook, and one signed webhook per person for
Linear, Sentry and PagerDuty. Each verifies the sender, turns the
platform's payload into the one event shape the box reads
(`parseFireTriggerEvent` in `sand-automation-fire-consumer.ts`), finds
the people it concerns, and hands it to `ListenersService.ingest_event`,
which fills the relay queue and the fire queue and wakes the notify bus.

None of these routes take a bearer: a Slack delivery is signed with the
app's signing secret, a GitHub delivery with the App's webhook secret,
and a Linear/Sentry/PagerDuty delivery names the person by an
unguessable token in its URL and is signature-checked when the service
signs. Every delivery writes one `sand.listeners.ingress` line with what
it was and where it went; an unverified one writes
`sand.listeners.ingress_refused`.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Any
from uuid import UUID

import structlog
from fastapi import Depends, Header, Request
from fastapi.responses import JSONResponse

from polar.config import settings
from polar.models import SandListenerConnection
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.redis import Redis, get_redis
from polar.routing import APIRouter

from .listeners_connections import resolve_slack_channel
from .listeners_repository import SandListenerConnectionRepository
from .listeners_service import WEBHOOK_PLATFORMS, listeners
from .listeners_slack import verify_signature as verify_slack_signature

log = structlog.get_logger()

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)


async def _json(request: Request) -> dict[str, Any]:
    try:
        decoded = await request.json()
    except ValueError:
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _get(value: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def _text(value: Any, limit: int = 4000) -> str:
    return value[:limit] if isinstance(value, str) else ""


# --- Slack -----------------------------------------------------------------------


def normalize_slack_event(
    event: dict[str, Any], connection: SandListenerConnection
) -> dict[str, Any] | None:
    """One Events API `event` into the fire shape, for one workspace
    connection (whose member decides `isSelf` and whose channel cache
    names the channel)."""
    kind = event.get("type")
    bot_user_id = str(connection.extra.get("bot_user_id") or "")
    if kind == "reaction_added":
        channel_id = _get(event, "item", "channel")
        if not isinstance(channel_id, str):
            return None
        channel = resolve_slack_channel(connection, channel_id)
        user = event.get("user")
        return {
            "source": "slack",
            "channel": f"#{channel['name']}"
            if channel and channel.get("name")
            else channel_id,
            "channelId": channel_id,
            "sender": f"@{user}" if isinstance(user, str) else "someone",
            "text": "",
            "isMention": False,
            "isSelf": isinstance(user, str)
            and user == (connection.external_user_id or ""),
            "reactionEmoji": f":{str(event.get('reaction') or '').strip(':')}:",
            **(
                {"ts": event["item"]["ts"]}
                if isinstance(_get(event, "item", "ts"), str)
                else {}
            ),
        }
    if kind not in ("message", "app_mention"):
        return None
    if event.get("bot_id") or (
        event.get("subtype") not in (None, "file_share", "thread_broadcast")
    ):
        return None
    channel_id = event.get("channel")
    if not isinstance(channel_id, str):
        return None
    text = _text(event.get("text"))
    if kind == "message" and bot_user_id and f"<@{bot_user_id}>" in text:
        return None  # the app_mention delivery carries this one
    channel = resolve_slack_channel(connection, channel_id)
    user = event.get("user")
    normalized: dict[str, Any] = {
        "source": "slack",
        "channel": f"#{channel['name']}"
        if channel and channel.get("name")
        else channel_id,
        "channelId": channel_id,
        "sender": f"@{user}" if isinstance(user, str) else "someone",
        "text": text,
        "isMention": kind == "app_mention",
    }
    if isinstance(event.get("ts"), str):
        normalized["ts"] = event["ts"]
    if isinstance(event.get("thread_ts"), str):
        normalized["threadTs"] = event["thread_ts"]
    return normalized


@router.post("/sand/ingress/slack/events", name="sand:ingress_slack_events")
async def slack_events(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
    x_slack_signature: str | None = Header(default=None),
    x_slack_request_timestamp: str | None = Header(default=None),
) -> JSONResponse:
    body = await request.body()
    if not settings.SLACK_SIGNING_SECRET:
        log.warning(
            "sand.listeners.ingress_refused",
            platform="slack",
            reason="CLAIDOR_SLACK_SIGNING_SECRET is empty",
        )
        return JSONResponse(
            {"error": "Simeon's Slack app is not registered on this server yet."},
            status_code=503,
        )
    if not verify_slack_signature(
        settings.SLACK_SIGNING_SECRET,
        x_slack_request_timestamp,
        x_slack_signature,
        body,
    ):
        log.warning(
            "sand.listeners.ingress_refused", platform="slack", reason="bad signature"
        )
        return JSONResponse({"error": "bad signature"}, status_code=401)
    payload = await _json(request)
    if payload.get("type") == "url_verification":
        return JSONResponse({"challenge": payload.get("challenge", "")})
    if payload.get("type") != "event_callback":
        return JSONResponse({"ok": True})
    team_id = payload.get("team_id")
    event = payload.get("event")
    if not isinstance(team_id, str) or not isinstance(event, dict):
        return JSONResponse({"ok": True})
    repository = SandListenerConnectionRepository.from_session(session)
    connections = await repository.list_by_external("slack", team_id)
    delivered = 0
    for connection in connections:
        if connection.user_id is None:
            continue
        normalized = normalize_slack_event(event, connection)
        if normalized is None:
            continue
        counts = await listeners.ingest_event(
            session, redis, [connection.user_id], normalized
        )
        delivered += counts["relayed"] + counts["fired"]
    log.info(
        "sand.listeners.ingress",
        platform="slack",
        team_id=team_id,
        kind=event.get("type"),
        connections=len(connections),
        delivered=delivered,
    )
    return JSONResponse({"ok": True})


# --- GitHub ----------------------------------------------------------------------


def verify_github_signature(secret: str, signature: str | None, body: bytes) -> bool:
    if not secret or not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


CI_FAILED_CONCLUSIONS = ("failure", "timed_out", "startup_failure")


def normalize_github_event(
    event_name: str, payload: dict[str, Any]
) -> dict[str, Any] | None:
    """One GitHub App webhook into the fire shape, or None when it is not
    one of the fourteen kinds the app knows."""
    repo = _get(payload, "repository", "full_name")
    if not isinstance(repo, str):
        return None
    actor = _get(payload, "sender", "login")
    action = payload.get("action")
    base: dict[str, Any] = {
        "source": "github",
        "repo": repo,
        "actor": actor if isinstance(actor, str) else "someone",
    }

    def pr_fields(pull: Any) -> dict[str, Any]:
        fields: dict[str, Any] = {"title": _text(_get(pull, "title"), 400)}
        if isinstance(_get(pull, "html_url"), str):
            fields["url"] = pull["html_url"]
        if isinstance(_get(pull, "user", "login"), str):
            fields["prOwner"] = pull["user"]["login"]
        if isinstance(_get(pull, "head", "ref"), str):
            fields["branch"] = pull["head"]["ref"]
        if isinstance(_get(pull, "number"), int):
            fields["detail"] = f"#{pull['number']}"
        return fields

    if event_name == "pull_request":
        pull = payload.get("pull_request")
        kind = {
            "opened": "pr-opened",
            "synchronize": "pr-pushed",
            "review_requested": "review-requested",
        }.get(str(action))
        if action == "closed" and _get(pull, "merged") is True:
            kind = "pr-merged"
        if kind is None:
            return None
        return {**base, "kind": kind, **pr_fields(pull)}
    if (
        event_name == "issue_comment"
        and action == "created"
        and _get(payload, "issue", "pull_request") is not None
    ):
        issue = payload.get("issue")
        fields = pr_fields(issue)
        fields["detail"] = _text(_get(payload, "comment", "body"), 600)
        if isinstance(_get(payload, "comment", "html_url"), str):
            fields["url"] = payload["comment"]["html_url"]
        return {**base, "kind": "pr-comment", **fields}
    if event_name == "pull_request_review" and action == "submitted":
        state = str(_get(payload, "review", "state") or "").lower()
        kind = {
            "approved": "review-approved",
            "changes_requested": "review-changes-requested",
            "commented": "review-commented",
        }.get(state)
        if kind is None:
            return None
        fields = pr_fields(payload.get("pull_request"))
        if _get(payload, "review", "body"):
            fields["detail"] = _text(_get(payload, "review", "body"), 600)
        return {**base, "kind": kind, **fields}
    if event_name == "pull_request_review_comment" and action == "created":
        fields = pr_fields(payload.get("pull_request"))
        fields["detail"] = _text(_get(payload, "comment", "body"), 600)
        if isinstance(_get(payload, "comment", "html_url"), str):
            fields["url"] = payload["comment"]["html_url"]
        return {**base, "kind": "inline-review-comment", **fields}
    if event_name == "pull_request_review_thread" and action in (
        "resolved",
        "unresolved",
    ):
        return {
            **base,
            "kind": f"review-thread-{action}",
            **pr_fields(payload.get("pull_request")),
        }
    if event_name == "issues" and action == "assigned":
        issue = payload.get("issue")
        issue_fields: dict[str, Any] = {"title": _text(_get(issue, "title"), 400)}
        issue_url = _get(issue, "html_url")
        if isinstance(issue_url, str):
            issue_fields["url"] = issue_url
        assignee = _get(payload, "assignee", "login")
        if isinstance(assignee, str):
            issue_fields["detail"] = f"assigned to {assignee}"
        return {**base, "kind": "issue-assigned", **issue_fields}
    if event_name == "check_suite" and action == "completed":
        suite = payload.get("check_suite")
        conclusion = str(_get(suite, "conclusion") or "")
        if conclusion == "success":
            kind = "ci-passed"
        elif conclusion in CI_FAILED_CONCLUSIONS:
            kind = "ci-failed"
        else:
            return None
        branch = _get(suite, "head_branch")
        head_sha = _get(suite, "head_sha")
        repo_url = _get(payload, "repository", "html_url")
        ci_fields: dict[str, Any] = {
            "title": f"CI {conclusion} on {branch}"
            if isinstance(branch, str)
            else f"CI {conclusion}"
        }
        if isinstance(branch, str):
            ci_fields["branch"] = branch
        if isinstance(head_sha, str):
            ci_fields["detail"] = head_sha[:12]
            if isinstance(repo_url, str):
                ci_fields["url"] = f"{repo_url}/commit/{head_sha}"
        return {**base, "kind": kind, **ci_fields}
    return None


async def _record_installation(
    session: AsyncSession, event_name: str, payload: dict[str, Any]
) -> None:
    installation_id = _get(payload, "installation", "id")
    if installation_id is None:
        return
    repository = SandListenerConnectionRepository.from_session(session)
    row = await repository.get_by_external("github", str(installation_id))
    account = _get(payload, "installation", "account", "login")
    if event_name == "installation" and payload.get("action") == "deleted":
        if row is not None:
            await session.delete(row)
            await session.flush()
        return
    repos: set[str] = (
        set(
            str(name).lower()
            for name in (row.extra.get("repos") or [])
            if row is not None
        )
        if row is not None and isinstance(row.extra.get("repos"), list)
        else set()
    )
    for name in ("repositories", "repositories_added"):
        for entry in payload.get(name) or []:
            if isinstance(_get(entry, "full_name"), str):
                repos.add(entry["full_name"].lower())
    for entry in payload.get("repositories_removed") or []:
        if isinstance(_get(entry, "full_name"), str):
            repos.discard(entry["full_name"].lower())
    extra = {**(row.extra if row is not None else {}), "repos": sorted(repos)}
    if row is None:
        await repository.create(
            SandListenerConnection(
                platform="github",
                external_id=str(installation_id),
                external_name=account if isinstance(account, str) else "",
                extra=extra,
            ),
            flush=True,
        )
    else:
        await repository.update(
            row,
            update_dict={
                "extra": extra,
                **({"external_name": account} if isinstance(account, str) else {}),
            },
            flush=True,
        )


@router.post("/sand/ingress/github/events", name="sand:ingress_github_events")
async def github_events(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
) -> JSONResponse:
    body = await request.body()
    if not settings.SAND_GITHUB_WEBHOOK_SECRET:
        log.warning(
            "sand.listeners.ingress_refused",
            platform="github",
            reason="CLAIDOR_SAND_GITHUB_WEBHOOK_SECRET is empty",
        )
        return JSONResponse(
            {"error": "Simeon's GitHub App is not registered on this server yet."},
            status_code=503,
        )
    if not verify_github_signature(
        settings.SAND_GITHUB_WEBHOOK_SECRET, x_hub_signature_256, body
    ):
        log.warning(
            "sand.listeners.ingress_refused", platform="github", reason="bad signature"
        )
        return JSONResponse({"error": "bad signature"}, status_code=401)
    payload = await _json(request)
    event_name = x_github_event or ""
    if event_name in ("installation", "installation_repositories"):
        await _record_installation(session, event_name, payload)
        log.info(
            "sand.listeners.ingress",
            platform="github",
            kind=event_name,
            action=payload.get("action"),
        )
        return JSONResponse({"ok": True})
    normalized = normalize_github_event(event_name, payload)
    if normalized is None:
        return JSONResponse({"ok": True, "ignored": event_name})
    installation_id = _get(payload, "installation", "id")
    repository = SandListenerConnectionRepository.from_session(session)
    connections = (
        await repository.list_by_external("github", str(installation_id))
        if installation_id is not None
        else []
    )
    user_ids: list[UUID] = [
        row.user_id for row in connections if row.user_id is not None
    ]
    counts = (
        await listeners.ingest_event(session, redis, user_ids, normalized)
        if user_ids
        else {"relayed": 0, "fired": 0}
    )
    log.info(
        "sand.listeners.ingress",
        platform="github",
        webhook=event_name,
        kind=normalized["kind"],
        repo=normalized["repo"],
        installation_id=installation_id,
        users=len(user_ids),
        **counts,
    )
    return JSONResponse({"ok": True})


# --- Linear, Sentry, PagerDuty ------------------------------------------------------


def normalize_linear_event(payload: dict[str, Any]) -> dict[str, Any] | None:
    kind, action, data = payload.get("type"), payload.get("action"), payload.get("data")
    if not isinstance(data, dict):
        return None
    if kind == "Issue":
        if action == "create":
            event = "issueCreated"
        elif action == "update" and isinstance(
            _get(payload, "updatedFrom", "stateId"), str
        ):
            event = "statusChanged"
        else:
            return None
        result: dict[str, Any] = {"source": "linear", "event": event}
        for name, value in (
            ("issueIdentifier", data.get("identifier")),
            ("title", data.get("title")),
            ("url", data.get("url")),
            ("status", _get(data, "state", "name")),
            ("statusId", _get(data, "state", "id") or data.get("stateId")),
            ("projectId", _get(data, "project", "id") or data.get("projectId")),
            ("teamId", _get(data, "team", "id") or data.get("teamId")),
        ):
            if isinstance(value, str) and value:
                result[name] = value[:400]
        return result
    if (
        kind == "Cycle"
        and action == "update"
        and data.get("completedAt")
        and not _get(payload, "updatedFrom", "completedAt")
    ):
        result = {"source": "linear", "event": "endOfCycle"}
        for name, value in (
            ("cycleId", data.get("id")),
            ("cycleName", data.get("name")),
            ("teamId", data.get("teamId") or _get(data, "team", "id")),
        ):
            if isinstance(value, str) and value:
                result[name] = value[:400]
        return result
    return None


def normalize_sentry_event(
    resource: str | None, payload: dict[str, Any]
) -> dict[str, Any] | None:
    if resource not in (None, "issue"):
        return None
    action = str(payload.get("action") or "")
    event = {
        "created": "issueCreated",
        "resolved": "issueResolved",
        "assigned": "issueAssigned",
        "archived": "issueArchived",
        "unresolved": "issueUnresolved",
        "ignored": "issueArchived",
    }.get(action)
    issue = _get(payload, "data", "issue")
    if event is None or not isinstance(issue, dict):
        return None
    result: dict[str, Any] = {"source": "sentry", "event": event}
    for name, value in (
        ("issueId", issue.get("id")),
        ("shortId", issue.get("shortId")),
        ("title", issue.get("title")),
        ("projectId", _get(issue, "project", "id")),
        ("projectSlug", _get(issue, "project", "slug")),
        ("url", issue.get("permalink") or issue.get("web_url")),
        ("status", issue.get("status")),
        ("substatus", issue.get("substatus")),
    ):
        if value is not None and str(value):
            result[name] = str(value)[:400]
    if "issueId" not in result or "shortId" not in result or "title" not in result:
        return None
    return result


def normalize_pagerduty_event(payload: dict[str, Any]) -> dict[str, Any] | None:
    event_type = str(_get(payload, "event", "event_type") or "")
    event = {
        "incident.triggered": "incidentTriggered",
        "incident.acknowledged": "incidentAcknowledged",
        "incident.resolved": "incidentResolved",
        "incident.escalated": "incidentEscalated",
    }.get(event_type)
    data = _get(payload, "event", "data")
    if event is None or not isinstance(data, dict):
        return None
    result: dict[str, Any] = {"source": "pagerduty", "event": event}
    for name, value in (
        ("incidentId", data.get("id")),
        ("title", data.get("title")),
        ("status", data.get("status")),
        ("serviceId", _get(data, "service", "id")),
        ("serviceName", _get(data, "service", "summary")),
        ("url", data.get("html_url")),
    ):
        if isinstance(value, str) and value:
            result[name] = value[:400]
    if any(
        name not in result for name in ("incidentId", "title", "status", "serviceId")
    ):
        return None
    return result


def _hmac_hex(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_platform_signature(
    platform: str, secret: str | None, headers: Any, body: bytes
) -> bool | None:
    """True/False when the service signed and we could check; None when
    it sent no signature (the URL token stands alone)."""
    if not secret:
        return None
    if platform == "linear":
        sent = headers.get("linear-signature")
        return None if not sent else hmac.compare_digest(_hmac_hex(secret, body), sent)
    if platform == "sentry":
        sent = headers.get("sentry-hook-signature")
        return None if not sent else hmac.compare_digest(_hmac_hex(secret, body), sent)
    if platform == "pagerduty":
        sent = headers.get("x-pagerduty-signature")
        if not sent:
            return None
        expected = _hmac_hex(secret, body)
        return any(
            hmac.compare_digest(expected, part.strip().removeprefix("v1="))
            for part in sent.split(",")
        )
    return None


@router.post("/sand/ingress/{platform}/{token}", name="sand:ingress_webhook")
async def platform_webhook(
    platform: str,
    token: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    if platform not in WEBHOOK_PLATFORMS:
        return JSONResponse({"error": "unknown platform"}, status_code=404)
    repository = SandListenerConnectionRepository.from_session(session)
    row = await repository.get_by_webhook_token(platform, token)
    if row is None or row.user_id is None:
        log.warning(
            "sand.listeners.ingress_refused", platform=platform, reason="unknown token"
        )
        return JSONResponse({"error": "unknown webhook"}, status_code=404)
    body = await request.body()
    signed = verify_platform_signature(
        platform, row.signing_secret, request.headers, body
    )
    if signed is False:
        log.warning(
            "sand.listeners.ingress_refused",
            platform=platform,
            user_id=str(row.user_id),
            reason="bad signature",
        )
        return JSONResponse({"error": "bad signature"}, status_code=401)
    payload = await _json(request)
    if platform == "linear":
        normalized = normalize_linear_event(payload)
    elif platform == "sentry":
        normalized = normalize_sentry_event(
            request.headers.get("sentry-hook-resource"), payload
        )
    else:
        normalized = normalize_pagerduty_event(payload)
    if normalized is None:
        log.info(
            "sand.listeners.ingress",
            platform=platform,
            user_id=str(row.user_id),
            ignored=True,
        )
        return JSONResponse({"ok": True, "ignored": True})
    counts = await listeners.ingest_event(session, redis, [row.user_id], normalized)
    log.info(
        "sand.listeners.ingress",
        platform=platform,
        user_id=str(row.user_id),
        kind=normalized["event"],
        signed=signed,
        **counts,
    )
    return JSONResponse({"ok": True})
