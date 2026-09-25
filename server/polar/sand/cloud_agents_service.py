"""Cloud agents as a projection over the maty queue (25 September 2026).

The app in `desktop/` already has the whole client: the CloudAgent tool
(`host/cloud-agents/cloud-agent-tool.ts`, thirteen actions), the manager
that composes each request (`host/extensions/cloud-agents/`), the poll
loop that waits on a run, the `cursor-agent` card and its provider. All
of it speaks Cursor's `aiserver.v1.BackgroundComposerService`. What was
missing was the server. This is it, and it is not a new engine: a cloud
agent is a `SandCloudAgent` row spanning one or more `MatyJob` turns, and
the queue (`polar.maty`) does what it always did — claim, lease,
heartbeat, a scoped token, memory in and memory out.

What each RPC becomes:

- StartBackgroundComposerFromSnapshot → one job, `kind=task`, with the
  person's message as its `conversation`; the row remembers the `bcId`
  the app minted, the repository named and the model asked for.
- GetBackgroundComposerInfo / ListBackgroundComposers → the row and its
  latest job, projected into `DetailedBackgroundComposer`. Status:
  queued → CREATING, running → RUNNING, done → FINISHED, failed → ERROR.
  Branch, pull request and diff counts are empty until an executor
  that clones a repository exists (`runner/src/executor.ts`).
- AddAsyncFollowupBackgroundComposer → the follow-up appended to the
  conversation. A queued job simply carries it; a finished one gets a
  continuation job (`parent_job_id`) with the whole conversation; a
  running one keeps it pending and the continuation is enqueued when
  the job settles (`on_job_settled`, called from the runner's complete
  and fail routes). `synchronous: true` (the tool's `interrupt`) also
  asks the running job to stop first.
- PauseBackgroundComposer → `MatyService.request_cancel`: a queued job is
  called off, a running one gets `cancel_requested`, which the runner
  reads off its heartbeat.
- Rename / Archive / Delete → the row.
- ListBackgroundComposerArtifacts → what the executor reported at
  `complete` (none today).
- GetBackgroundComposerConversation → the latest job's conversation as
  `ConversationMessage`s (HUMAN 1 / AI 2), which
  `convertConversationMessagesToTrace` reads for the `dump` action.
- GetPullRequestMergeStatus / GetOptimizedDiffDetails → the « no PR »
  shape the client handles (nothing merged, no diffs).
- GetEnvironment / ListEnvironments → one environment, "Simeon's
  computer", with no repositories configured, so a launch on it still
  needs `repo_url`, the way the client's resolver already works.

A `[claidor] cloud-agent` log line per state change names what happened,
so a failure on a Mac names its cause from the API's log.
"""

from __future__ import annotations

import logging
from typing import Any

from polar.kit.utils import utc_now
from polar.maty.service import (
    CANCELLED_REASON,
    MatyError,
    MatyJobNotFound,
    maty,
)
from polar.models import MatyJob, MatyJobKind, MatyJobStatus, SandCloudAgent, User
from polar.postgres import AsyncSession

from .cloud_agents_repository import CloudAgentJobRepository, SandCloudAgentRepository
from .connect import ConnectError

log = logging.getLogger(__name__)

#: `BackgroundComposerStatus` in `background_composer_pb.ts`.
STATUS_UNSPECIFIED = 0
STATUS_RUNNING = 1
STATUS_FINISHED = 2
STATUS_ERROR = 3
STATUS_CREATING = 4
STATUS_EXPIRED = 5

#: `ConversationMessage.MessageType` in `chat_pb.ts`.
MESSAGE_HUMAN = 1
MESSAGE_AI = 2

#: `ErrorDetails.Error.CUSTOM_MESSAGE` in `utils_pb.ts`: the app shows
#: `details.title` and `details.detail` as they are.
ERROR_CUSTOM_MESSAGE = 29

#: The one environment Simeon Labs serves. The client resolves a launch on
#: a saved environment by `publicId` or by name; either finds this.
ENVIRONMENT_PUBLIC_ID = "simeon-computer"
ENVIRONMENT_NAME = "Simeon's computer"

#: `ListBackgroundComposers.n` is what the client sends (20 by default);
#: the queue's own listing cap is the ceiling.
LIST_LIMIT = 50


def _ms(value: Any) -> int:
    return int(value.timestamp() * 1000) if value is not None else 0


def status_of(job: MatyJob) -> int:
    """The composer status the client reads (`mapRunStatus`)."""
    if job.status is MatyJobStatus.queued:
        return STATUS_CREATING
    if job.status is MatyJobStatus.running:
        return STATUS_RUNNING
    if job.status is MatyJobStatus.done:
        return STATUS_FINISHED
    return STATUS_ERROR


def first_user_text(conversation: list[dict[str, Any]] | None) -> str:
    for message in conversation or []:
        if message.get("role") == "user":
            return str(message.get("text") or "")
    return ""


def has_pending_followup(conversation: list[dict[str, Any]] | None) -> bool:
    """True when a follow-up arrived while the turn was running: the
    runner never saw it (`pending`), so no turn has answered it yet."""
    return any(message.get("pending") is True for message in conversation or [])


def settled(conversation: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The conversation as the next turn is handed it: every message
    seen, nothing pending any more."""
    return [
        {key: value for key, value in message.items() if key != "pending"}
        for message in conversation
    ]


def user_message_text(action: dict[str, Any] | None) -> str:
    """The text out of a `ConversationAction`, as the client builds it
    (`buildCloudAgentConversationAction`): the oneof `action` with the
    `userMessageAction` case, in protobuf JSON."""
    if not isinstance(action, dict):
        return ""
    user_action = action.get("userMessageAction")
    if not isinstance(user_action, dict):
        # A hand-built client might spell the oneof out.
        inner = action.get("action")
        if isinstance(inner, dict) and inner.get("case") == "userMessageAction":
            user_action = inner.get("value")
    if not isinstance(user_action, dict):
        return ""
    message = user_action.get("userMessage")
    if not isinstance(message, dict):
        return ""
    return str(message.get("text") or "").strip()


def requested_model_id(request: dict[str, Any]) -> str:
    models = request.get("requestedModels")
    if isinstance(models, list) and models and isinstance(models[0], dict):
        return str(models[0].get("modelId") or "")
    model = request.get("requestedModel")
    if isinstance(model, dict):
        return str(model.get("modelId") or "")
    return ""


def _connect_error(error: MatyError) -> ConnectError:
    """A queue refusal, in Connect's shape and with the queue's sentence:
    the tool shows the message to the person."""
    code = {
        400: "invalid_argument",
        404: "not_found",
        409: "failed_precondition",
        429: "resource_exhausted",
        503: "unavailable",
    }.get(error.status_code, "internal")
    return ConnectError(code, error.message)  # type: ignore[arg-type]


class CloudAgentsService:
    # --- reads -----------------------------------------------------------

    async def _agent(
        self, session: AsyncSession, user: User, bc_id: str
    ) -> tuple[SandCloudAgent, MatyJob]:
        agent = await SandCloudAgentRepository.from_session(session).get_by_bc_id(
            user.id, bc_id.strip()
        )
        if agent is None:
            raise ConnectError("not_found", f"There is no cloud agent {bc_id!r}.")
        job = await CloudAgentJobRepository.from_session(session).get_by_id(
            agent.job_id
        )
        if job is None:
            raise ConnectError("not_found", f"Cloud agent {bc_id!r} has no run.")
        return agent, job

    def composer(self, agent: SandCloudAgent, job: MatyJob) -> dict[str, Any]:
        """`aiserver.v1.BackgroundComposer`, the fields the client reads."""
        return {
            "bcId": agent.bc_id,
            "createdAtMs": _ms(agent.created_at),
            "updatedAtMs": _ms(job.modified_at or job.created_at),
            "name": agent.name,
            "branchName": "",
            "repoUrl": agent.repo_url,
            "isArchived": agent.is_archived,
            "status": status_of(job),
            "prUrl": "",
            "isPrMerged": False,
            "linesAdded": 0,
            "linesRemoved": 0,
            "filesChanged": 0,
            "commitCount": 0,
            "workspaceRootPath": "/workspace",
            "hasStartedVm": job.status is not MatyJobStatus.queued,
            "isKilled": job.status is MatyJobStatus.failed
            and job.error == CANCELLED_REASON,
            **(
                {"requestedModel": {"modelId": agent.model_id}}
                if agent.model_id
                else {}
            ),
        }

    def detailed(self, agent: SandCloudAgent, job: MatyJob) -> dict[str, Any]:
        """`aiserver.v1.DetailedBackgroundComposer`."""
        body: dict[str, Any] = {
            "composer": self.composer(agent, job),
            "status": status_of(job),
            "baseBranch": agent.base_branch,
            "prompt": {"text": first_user_text(job.conversation) or job.prompt},
            "prs": [],
            "autoCreatePr": False,
            "autoBranch": False,
            "environmentName": ENVIRONMENT_NAME,
        }
        if job.status is MatyJobStatus.done and job.result:
            body["summary"] = job.result
        if job.status is MatyJobStatus.failed and job.error:
            body["permanentError"] = {
                "error": ERROR_CUSTOM_MESSAGE,
                "details": {
                    "title": "The cloud agent stopped",
                    "detail": job.error,
                    "additionalInfo": {},
                },
                "isExpected": job.error == CANCELLED_REASON,
            }
        return body

    def conversation(self, job: MatyJob) -> list[dict[str, Any]]:
        """`aiserver.v1.ConversationMessage`s, as
        `convertConversationMessagesToTrace` reads them."""
        rows: list[dict[str, Any]] = []
        for index, message in enumerate(job.conversation or []):
            created = message.get("createdAtMs") or 0
            rows.append(
                {
                    "text": str(message.get("text") or ""),
                    "type": MESSAGE_HUMAN
                    if message.get("role") == "user"
                    else MESSAGE_AI,
                    "bubbleId": f"{message.get('jobId') or job.id}-{index}",
                    "isAgentic": True,
                    "createdAt": str(created),
                }
            )
        return rows

    def environment(self) -> dict[str, Any]:
        """`aiserver.v1.LogicalEnvironment`: the one we have."""
        return {
            "publicId": ENVIRONMENT_PUBLIC_ID,
            "name": ENVIRONMENT_NAME,
            "repoConfig": {"repos": []},
            "createdAtMs": "0",
            "updatedAtMs": "0",
        }

    # --- the app's verbs -------------------------------------------------

    async def start(
        self, session: AsyncSession, user: User, request: dict[str, Any]
    ) -> tuple[SandCloudAgent, MatyJob]:
        bc_id = str(request.get("bcId") or "").strip()
        if not bc_id:
            raise ConnectError("invalid_argument", "A cloud agent needs a bcId.")
        text = user_message_text(request.get("conversationAction"))
        if not text:
            raise ConnectError(
                "invalid_argument", "A cloud agent needs something to do."
            )
        repository = SandCloudAgentRepository.from_session(session)
        if await repository.get_by_bc_id(user.id, bc_id) is not None:
            raise ConnectError(
                "already_exists", f"Cloud agent {bc_id!r} already exists."
            )

        now_ms = _ms(utc_now())
        try:
            job = await maty.create_for_person(
                session, user, kind=MatyJobKind.task, prompt=text
            )
        except MatyError as error:
            raise _connect_error(error)
        job.conversation = [
            {"role": "user", "text": text, "createdAtMs": now_ms, "jobId": str(job.id)}
        ]
        session.add(job)

        starting_point = request.get("devcontainerStartingPoint")
        base_branch = str(request.get("baseBranch") or "")
        if not base_branch and isinstance(starting_point, dict):
            base_branch = str(starting_point.get("ref") or "")
        agent = SandCloudAgent(
            user_id=user.id,
            bc_id=bc_id,
            job_id=job.id,
            name=str(request.get("name") or "").strip(),
            repo_url=str(request.get("repoUrl") or ""),
            base_branch=base_branch,
            model_id=requested_model_id(request),
        )
        session.add(agent)
        await session.flush()
        log.info(
            "[claidor] cloud-agent started bcId=%s job=%s repo=%s model=%s",
            bc_id,
            job.id,
            agent.repo_url or "-",
            agent.model_id or "-",
        )
        return agent, job

    async def info(
        self, session: AsyncSession, user: User, bc_id: str
    ) -> dict[str, Any]:
        agent, job = await self._agent(session, user, bc_id)
        return self.detailed(agent, job)

    async def list_composers(
        self, session: AsyncSession, user: User, *, n: int, include_archived: bool
    ) -> list[dict[str, Any]]:
        limit = max(1, min(int(n or 20), LIST_LIMIT))
        agents = await SandCloudAgentRepository.from_session(session).list_for_user(
            user.id, include_archived=include_archived, limit=limit
        )
        jobs = CloudAgentJobRepository.from_session(session)
        rows: list[dict[str, Any]] = []
        for agent in agents:
            job = await jobs.get_by_id(agent.job_id)
            if job is not None:
                rows.append(self.composer(agent, job))
        return rows

    async def followup(
        self,
        session: AsyncSession,
        user: User,
        bc_id: str,
        *,
        text: str,
        interrupt: bool,
        model_id: str = "",
    ) -> str:
        """The follow-up lands on the conversation; the answer is the id
        of the job that will answer it (the client's `runId`)."""
        agent, job = await self._agent(session, user, bc_id)
        text = text.strip()
        if not text:
            raise ConnectError(
                "invalid_argument", "A follow-up needs something to say."
            )
        if model_id:
            agent.model_id = model_id
            session.add(agent)
        message = {
            "role": "user",
            "text": text,
            "createdAtMs": _ms(utc_now()),
            "jobId": str(job.id),
        }
        if job.is_final:
            continuation = await self._continue(
                session, user, agent, job, [*(job.conversation or []), message]
            )
            log.info(
                "[claidor] cloud-agent follow-up bcId=%s continuation=%s",
                bc_id,
                continuation.id,
            )
            return str(continuation.id)
        # A queued job is handed the whole list at the claim; a running
        # one has already been handed its list, so this message waits for
        # the continuation `on_job_settled` enqueues.
        if job.status is MatyJobStatus.running:
            message["pending"] = True
        job.conversation = [*(job.conversation or []), message]
        session.add(job)
        if interrupt and job.status is MatyJobStatus.running:
            await maty.request_cancel(session, user, job.id)
            log.info(
                "[claidor] cloud-agent follow-up bcId=%s job=%s interrupt",
                bc_id,
                job.id,
            )
        else:
            log.info(
                "[claidor] cloud-agent follow-up bcId=%s job=%s queued", bc_id, job.id
            )
        await session.flush()
        return str(job.id)

    async def _continue(
        self,
        session: AsyncSession,
        user: User,
        agent: SandCloudAgent,
        parent: MatyJob,
        conversation: list[dict[str, Any]],
    ) -> MatyJob:
        try:
            job = await maty.create_for_person(
                session,
                user,
                kind=MatyJobKind.task,
                prompt=first_user_text(conversation) or parent.prompt,
            )
        except MatyError as error:
            raise _connect_error(error)
        job.conversation = [
            {**message, "jobId": message.get("jobId") or str(job.id)}
            for message in settled(conversation)
        ]
        job.parent_job_id = parent.id
        session.add(job)
        agent.job_id = job.id
        session.add(agent)
        await session.flush()
        return job

    async def pause(self, session: AsyncSession, user: User, bc_id: str) -> None:
        agent, job = await self._agent(session, user, bc_id)
        try:
            job = await maty.request_cancel(session, user, job.id)
        except MatyJobNotFound as error:
            raise _connect_error(error)
        log.info(
            "[claidor] cloud-agent pause bcId=%s job=%s status=%s cancelRequested=%s",
            bc_id,
            job.id,
            job.status.value,
            job.cancel_requested,
        )

    async def rename(
        self, session: AsyncSession, user: User, bc_id: str, name: str
    ) -> None:
        agent, _ = await self._agent(session, user, bc_id)
        agent.name = name.strip()
        session.add(agent)
        await session.flush()

    async def archive(
        self, session: AsyncSession, user: User, bc_id: str, *, archived: bool
    ) -> None:
        agent, _ = await self._agent(session, user, bc_id)
        agent.is_archived = archived
        session.add(agent)
        await session.flush()

    async def delete(self, session: AsyncSession, user: User, bc_id: str) -> None:
        agent, job = await self._agent(session, user, bc_id)
        if not job.is_final:
            await maty.request_cancel(session, user, job.id)
        agent.deleted_at = utc_now()
        session.add(agent)
        await session.flush()
        log.info("[claidor] cloud-agent deleted bcId=%s", bc_id)

    async def artifacts(
        self, session: AsyncSession, user: User, bc_id: str
    ) -> list[dict[str, Any]]:
        _, job = await self._agent(session, user, bc_id)
        return [
            {
                "absolutePath": str(artifact.get("path") or ""),
                "sizeBytes": str(int(artifact.get("sizeBytes") or 0)),
                "updatedAtUnixMs": str(int(artifact.get("updatedAtMs") or 0)),
            }
            for artifact in job.artifacts or []
            if artifact.get("path")
        ]

    async def transcript(
        self, session: AsyncSession, user: User, bc_id: str
    ) -> list[dict[str, Any]]:
        _, job = await self._agent(session, user, bc_id)
        return self.conversation(job)

    # --- the runner's side -----------------------------------------------

    async def on_job_settled(self, session: AsyncSession, job: MatyJob) -> None:
        """Called by the runner's complete and fail routes once a job is
        final. A follow-up that arrived while it ran is still unanswered
        (the conversation ends on the person's word): enqueue the
        continuation now, carrying the whole conversation."""
        if not job.is_final or not has_pending_followup(job.conversation):
            return
        agent = await SandCloudAgentRepository.from_session(session).get_by_job_id(
            job.id
        )
        if agent is None:
            return
        user = await session.get(User, agent.user_id)
        if user is None:
            return
        try:
            continuation = await self._continue(
                session, user, agent, job, list(job.conversation or [])
            )
        except ConnectError as error:
            log.warning(
                "[claidor] cloud-agent continuation refused bcId=%s job=%s: %s",
                agent.bc_id,
                job.id,
                error.message,
            )
            return
        log.info(
            "[claidor] cloud-agent continuation bcId=%s after=%s job=%s",
            agent.bc_id,
            job.id,
            continuation.id,
        )


cloud_agents = CloudAgentsService()

__all__ = [
    "ENVIRONMENT_NAME",
    "ENVIRONMENT_PUBLIC_ID",
    "CloudAgentsService",
    "cloud_agents",
    "status_of",
    "user_message_text",
]
