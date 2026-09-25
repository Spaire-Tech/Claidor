# Cloud agents, served (25 September 2026)

The founder's rule for this batch: "always assume that we already have
it … first preserve and use everything we already have, then only build
the missing server contract that the existing code actually expects."
This is the record for cloud agents: what was reused, what was built,
the routes, and what has not run on a Mac. Everything here was measured
offline by `server/tests/sand/test_cloud_agents.py` (15 cases) and
`desktop/tests/cloud-agents-served.test.mjs` (the real client against an
in-process server); nothing has run on a Mac.

## What was reused, unchanged in what it does

- `desktop/source/host/cloud-agents/cloud-agent-tool.ts` — the CloudAgent
  tool, thirteen actions (launch, list, models, get, dump, watch, reply,
  rename, cancel, archive, unarchive, delete, list_artifacts).
- `desktop/source/host/extensions/cloud-agents/cloud-agents-service.ts`
  — `SandCloudAgentManager`, which composes every request; `cloud-agent-
  request-composition.ts`; `cloud-agent-poll-loop.ts` (10 s poll, 5 h
  cap); `model-catalog-fetch.ts` (`AiService/AvailableModels`).
- The `cursor-agent` card: the SendMessage type, the transcript's card,
  the renderer's `cloud-agent-provider.ts` (5 s live poll through the
  gateway's `getCloudAgentInfo`, which is `manager.getInfo`).
- `host-runner-composition.ts`'s wiring, `isCloudAgentsServed()` (on by
  default since 8e29abf3), the brief's cloud-agent sections.
- `server/polar/maty/` and `runner/` — the queue (claim, lease,
  heartbeat, scoped token, memory in and out) and the runner that
  executes a job on Render.

## What was built

### The server: `aiserver.v1.BackgroundComposerService` as a projection over the queue

`server/polar/sand/cloud_agents.py` (the wire), `cloud_agents_service.py`
(the projection), `cloud_agents_repository.py` (the queries), served at
the root of the API host through the `polar.sand` foundation
(`connect.py`). A cloud agent is a `sand_cloud_agents` row
(`polar/models/cloud_agent.py`: `bc_id` the app minted, `user_id`, the
name, `is_archived`, `deleted_at`, the `repo_url`/`base_branch`/`model_id`
the launch named, and `job_id`, the latest turn) over one `MatyJob` per
turn. `maty_jobs` gained four columns (`migrations/versions/2026-09-25-1400_cloud_agents.py`):
`conversation` (the messages a turn continues, `{"role","text",
"createdAtMs","jobId"}`), `parent_job_id`, `cancel_requested`, and
`artifacts`.

| RPC | What it is on Simeon |
|---|---|
| `StartBackgroundComposerFromSnapshot` | `maty.create_for_person(kind=task)` with the user message as `conversation[0]`; the row remembers `bcId`, name, repo, base branch, model. A queue refusal (no runner: 503 `unavailable`; ten live jobs: `resource_exhausted`) comes back as a Connect error with the queue's own sentence. |
| `GetBackgroundComposerInfo` | `DetailedBackgroundComposer` off the row and its latest job. Status: queued → CREATING (4), running → RUNNING (1), done → FINISHED (2), failed → ERROR (3). `summary` = the job's result; `permanentError.details.detail` = the failure's reason; `prompt.text` = the first user message; `branchName`, `prUrl`, `prs`, `filesChanged` empty/zero. Somebody else's or a deleted `bcId` is `not_found`, which the client reads as null. |
| `ListBackgroundComposers` | the person's rows, newest first, archived ones only with `includeArchived`. |
| `AddAsyncFollowupBackgroundComposer` | the follow-up appended. Queued turn: it rides along (the runner is handed the whole list at the claim). Finished turn: a continuation job with `parent_job_id` and the whole conversation. Running turn: the message waits as `pending` and the continuation is enqueued when the job settles (`on_job_settled`, from the runner's complete and fail routes); `synchronous: true` (the tool's `interrupt`) also asks the running job to stop. `runId` = the job that answers it. |
| `PauseBackgroundComposer` | `MatyService.request_cancel`: a queued job is called off (`failed`, "Cancelled before it started."); a running one gets `cancel_requested`, which the heartbeat's answer now carries. |
| `Rename` / `Archive` / `Delete` | the row; delete also asks a live turn to stop. |
| `ListBackgroundComposerArtifacts` | `job.artifacts` as `{absolutePath, sizeBytes, updatedAtUnixMs}` (int64 as strings). Empty today. |
| `GetBackgroundComposerConversation` | the latest job's conversation as `ConversationMessage`s (`type` HUMAN 1 / AI 2, `text`, `bubbleId`), which the client's `convertConversationMessagesToTrace` reads for `dump`. |
| `GetPullRequestMergeStatus` / `GetOptimizedDiffDetails` | the « no PR » shapes: nothing merged, no diffs. |
| `GetEnvironment` / `ListEnvironments` | one environment, `simeon-computer` / "Simeon's computer", no repositories configured. |
| `aiserver.v1.AiService/AvailableModels` | the `/desktop/api/models/available` menu in `AvailableModelsResponse`, with the same mapping the Mac's `claidor-model-catalog.ts` applies (a `fallback` role left off, exactly one `defaultOn`). |

`GetTeams` and `GetTeamAdminSettingsOrEmptyIfNotInTeam` are
`DashboardService` and are not here.

Every state change writes a `[claidor] cloud-agent …` line to the API's
log (`started`, `follow-up`, `continuation`, `pause`, `deleted`,
`continuation refused`), so a failure on a Mac names its cause from
Render's log.

### The runner: one seam, the same executor

`runner/src/executor.ts` — `Executor { name; run(claimed, settings,
signal) }`, a registry keyed by the job's `executor` field (which the
claim now carries, `maty-runner` for every job today), and
`UnknownExecutor`, a final refusal. The box executor of
`docs/product/box-substrate-read.md` registers here under its own name;
the loop, the lease and the token do not change for it.

What today's runner does with a cloud agent's turn: the same as with a
routine — the person's memory laid out, the engine started, one call —
except the engine is asked the whole conversation (`engineInput` in
`job.ts`, `Engine.ask` takes messages) and the reply goes back as the
turn's message (`messages` on `complete`), so the agent's transcript grows
by what was actually said. The heartbeat's answer is read: the
`cancel_requested` flag aborts the engine call and the job is failed as
"Cancelled by the person while it ran." (final, never retried). No
checkout, no shell, no branch, no pull request: that is the executor
`runner/README.md` describes, and the brief says so.

`runner/src/*.test.ts`: 65 pass, 5 skipped (no built engine), and the
four `engineVersion.test.ts` cases fail before and after this work
because `desktop/scripts/patches/` and the desktop's OpenClaw pin left
the tree with the Grok Bot re-founding (18 September); that test
describes the LobsterAI-era desktop.

### The desktop

- `openCloudAgent` (`electron-main/main-edge.ts`) and the manager's
  `cloudAgentUrl` open `https://app.simeonlabs.com/agents/<bcId>`
  (`cloudAgentWebUrl` in `shared/cloud-agents-availability.ts`,
  `SAND_CLOUD_AGENTS_WEB_BASE` to point elsewhere), never cursor.com nor
  the API host (ledger F-150, F-220, F-406, F-480). **That page does not
  exist yet (needs-web)**: until the dashboard on Vercel draws a run, the
  card's conversation in the app is the record.
- The brief (`host/runner/system-prompt.ts`): the `## Origin` block
  (Cursor's SCM, cursor.com/codebase) is `## Repositories` (GitHub, and
  Simeon's agents page); the code-changes section keeps Grok Bot's
  structure and says what our runner does — no checkout, branch or PR
  yet, "never promise a PR"; the environment bullet names "Simeon's
  computer" and rules out pools and private workers (they need a team);
  the artifacts bullet no longer names `/opt/cursor` or cursor.com.
- `cloud-agent-tool.ts`: the launch reply says the run reports into its
  conversation, not that it will open a PR; the runtime is "Simeon's
  cloud runner". `cloud-agent-poll-loop.ts`: "Summary from the cloud
  agent", no cursor.com dashboard. `shared/channel-messaging.ts` and
  `packages/agent/prompts/cloud/no-repository-access.ts` point at
  Simeon's page.
- `shared/cloud-agents-availability.ts`'s comment is corrected (dated).

### Two client defects found by running the client, both fixed

1. **The Connect transport sent binary protobuf.** `createSandBackendTransport`
   built `@connectrpc/connect-node`'s transport with its default
   `useBinaryFormat: true`, so every request left as `application/proto`
   and the client refused a JSON answer ("[internal] unsupported content
   type application/json"). `connect.py`'s docstring and the map said
   "the default JSON codec" — true of connect-web, not connect-node. The
   transport now passes `useBinaryFormat: false`. **This affects every
   Connect service in `polar/sand`**, not only cloud agents; the
   foundation's own test posted JSON with httpx and could not see it.
2. **Enum fields carried strings.** The reconstruction sent `source:
   "grok-bot"`, `followupSource: "grok-bot"`, `startingMessageType:
   "user-message"` and the user message's `mode: "agent"` where the
   bundle had enum values; the JSON codec refuses them ("cannot encode
   field … to JSON"). They are `BackgroundComposerSource.GROK_BOT`,
   `StartingMessageType.USER_MESSAGE` and `AgentMode.AGENT` now.

Also measured: protobuf JSON leaves default fields out, so a follow-up
without `interrupt` arrives with no `synchronous` key; the server reads
absent as false.

## What is measured

- `server/tests/sand/test_cloud_agents.py`: start → info → list; another
  person's id is 404; empty prompt refused; no runner → `unavailable`;
  the runner's claim carries `executor` and the conversation, a claimed
  turn reads RUNNING, `complete` with `messages` and `artifacts` reads
  FINISHED with the summary, the transcript and the artifacts; a failed
  run reads ERROR with its reason; a follow-up on a finished run is a
  continuation carrying the whole conversation; on a queued run it rides
  along; on a running run it waits and the continuation is enqueued at
  settle; an interrupting follow-up sets the cancel flag; pause before
  claim cancels, pause during a run sets the flag the heartbeat returns;
  rename, archive, unarchive, delete; no PR, no diff, one environment;
  AvailableModels in the app's shape.
- `desktop/tests/cloud-agents-served.test.mjs`: the real
  `SandCloudAgentManager` over the real transport against an in-process
  server answering the shapes above: launch (the request's `bcId`,
  `repoUrl`, `baseBranch`, `name`, user message text, `requestedModels`,
  and the privacy pre-flight reaching our DashboardService), `getInfo`
  before and after the run (the card's fields), `not_found` → null,
  list, `getTranscriptDump`, reply, the model catalogue, cancel, rename,
  archive, artifacts, delete; and the brief's sentences.
- `runner/src/claidor.test.ts`, `loop.test.ts`: the claim's executor
  and conversation, the heartbeat's cancel flag, `complete` with
  messages, the cancel aborting a run and reporting it final.

## Not yet run on a Mac

Nothing here has. The three things to read, in order:

1. In the app, "launch a cloud agent for <repo>: <task>". The agent's
   reply names `bc-<uuid>` and `https://app.simeonlabs.com/agents/…`; in
   Render's API log, `[claidor] cloud-agent started bcId=… job=…`. A
   `Could not launch the cloud agent: The cloud engine is not available
   on this Simeon.` means `CLAIDOR_MATY_RUNNER_TOKEN` is unset on the
   API service.
2. The runner's log (`claidor-maty-runner` on Render): `job <id> (task,
   maty-runner) claimed` … `the engine answered` … `job <id> done`. If
   the runner is not deployed, the card stays at "creating" and the
   agent's `get` says so; that is the queue waiting, not a bug.
3. The card in the chat turning to finished, and CloudAgent `get`
   quoting the summary.

Founder decisions this needs: the runner deployed (it is in
`render.yaml`; whether it is running is not known from here), and the
page at `app.simeonlabs.com/agents/<bcId>` (needs-web). Not built, on
purpose: a coding executor (clone, shell, commit, PR) — the box
substrate's job, behind the `Executor` seam; images attached to a launch
(the request carries them as bytes and the server ignores them).
