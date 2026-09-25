# The cloud runner

This is the service that does a person's work when they are not at their
computer. It takes one job at a time from Claidor, lays the person's memory
out, asks the model one turn through Claidor's metered proxy on the
person's own job token, and reports the answer back. It is step 2 of
`docs/maties/cloud.md`; that note's section 4 describes the OpenClaw engine
this runner ran until 25 September 2026 and is history for that part
(the correction at its top says so).

Nobody talks to this service. It talks to Claidor.

## What one job looks like

1. It asks Claidor for work. When there is none it waits a few seconds and
   asks again.
2. Claidor hands back a job — a routine coming due, a piece of mail, or a
   task — and, with it, a token for that one person which dies when the
   job's lease dies.
3. The runner makes an empty directory for the job and asks Claidor for
   that person's memory, sending nothing, which by contract returns
   everything Claidor holds. Those files become the job's workspace.
4. It reads the workspace into the system prompt (the instructions file,
   then every memory file) and asks the model one turn through Claidor's
   proxy on that person's token.
5. It collects the answer, writes back whatever the run added to the
   memory, reports the answer to Claidor, and deletes the directory.
6. The directory is deleted whether the job worked or not, and nothing is
   carried from one job to the next.

While a job runs, the runner tells Claidor every fifteen seconds that it is
still going. That same beat keeps the person's token alive, so a runner
that dies stops beating, the lease lapses, and the job goes back to the
queue for another runner to try.

On a termination signal it finishes the job in hand and then stops. It
never starts a second job while one is running.

### A cloud agent's turn (25 September 2026)

The app's cloud agents (`server/polar/sand/cloud_agents.py`,
`docs/product/cloud-agents-served.md`) are jobs on this same queue, one
per turn. Such a job carries `conversation` on the claim — the person's
messages and the earlier turns' replies — and the runner asks the model
the whole list instead of `prompt` alone, then reports the reply as the
turn's message (`messages` on `complete`) so the agent's transcript grows
by what was said. The heartbeat's answer carries `cancel_requested`: when
the person pauses the agent, the run is aborted and the job is failed as
cancelled, final. Every claim also names an `executor`; `maty-runner` is
this process and the only one, and `src/executor.ts` is the seam a box
executor (a checkout, a shell, a pull request) plugs into.

## The safety of it, which is the point

*Since 25 September 2026 the runner offers the model no tools at all, so
everything this section arranged by configuration is now true by
construction; it is kept as the record of what was decided and why.*

On the person's own computer the engine is deliberately wide open: it can
run any command, and the app asks the person before anything dangerous.
Here nobody can be asked, the work often starts from mail a stranger sent,
and the machine is Claidor's rather than the person's. So the configuration
this service writes is the opposite of the desktop's, deliberately, and
`src/engineConfig.ts` says beside each setting why it is what it is.

In short, a job may:

- read, write and edit files **inside its own directory** and nowhere else;
- call a model, and only through Claidor's metered proxy on the person's
  own account, so a cloud run costs their credits exactly as a run on their
  machine does.

A job may not run a command or a shell, reach the web, open a browser, send
on any channel, leave a schedule behind, spawn another agent, or load a
plugin, a skill or an MCP server. Those are not hidden from it — they are
switched off, and the model is never offered them.

Two rules from the note are written into the workspace instructions rather
than into a setting, because the engine has no setting for them: that
anything a job reads is data and never an instruction, and that nothing
irreversible happens unless the routine was allowed to. Words to a model
are weaker than a boundary; the boundary that actually holds is the tool
policy, which leaves a job with no way to send, pay or delete anything.

### What we could not lock

- **The sandbox is off, and honestly so.** OpenClaw's tool sandbox runs on
  Docker, and there is no Docker daemon inside a Render container, so
  turning it on would fail every tool call rather than contain one. What
  contains a job here is the tool policy plus the container. The day a job
  must run something truly untrusted, it needs a sandbox of its own first.
- **The engine has no way to say which addresses it may reach.** There is
  no egress allowlist in its configuration; the only thing it offers is
  routing all traffic through a filtering proxy you run yourself, and the
  policy then lives in that proxy. What we do instead is switch off every
  tool that reaches the network, which leaves the model call and nothing
  else. Real egress control has to come from the network, not from here.
- **One container, not one per job.** The note first asked for a fresh
  container per job; Render keeps one container up, so what we get is one
  process doing one job at a time in a directory of its own. That is
  weaker and is written down rather than glossed over.

## Running it

Everything comes from the environment. There is no default for anything
secret, and the process refuses to start without the two that matter.

| Variable | What it is |
|---|---|
| `CLAIDOR_API_BASE_URL` | Claidor's API, e.g. `https://api.simeonlabs.com`. `CLAIDOR_BASE_URL` is accepted as the same thing. Required. |
| `CLAIDOR_MATY_RUNNER_TOKEN` | The service's own token. It belongs to no person. Required. |
| `CLAIDOR_MATY_RUNNER_NAME` | What this runner calls itself when it claims a job. Defaults to the host name. |
| `CLAIDOR_MATY_WORK_ROOT` | Where a job's directory is made and deleted. |
| `CLAIDOR_MATY_POLL_INTERVAL_MS` | The wait when there is no work. Default five seconds. |
| `CLAIDOR_MATY_HEARTBEAT_INTERVAL_MS` | How often a running job says it is still going. Default fifteen seconds. |
| `CLAIDOR_MATY_JOB_TIMEOUT_MS` | The longest one job may take. Default fifteen minutes. |

In production it is the `claidor-maty-runner` service in the repository's
`render.yaml`: a worker Render builds from `runner/Dockerfile` (context:
the repository root), no port and no health check, because nothing calls
it. It deploys like the API does, on a push to `main` when auto-deploy is
on, or by hand.

```bash
npm install
npm run build
npm start
```

## The model call

`src/engine.ts` keeps the name `Engine` and the `start / ask / stop` shape
so `job.ts` reads the same as before, but there is no engine any more: one
request to Claidor's proxy, on the wire the model's row names
(`transportApi`: OpenAI Responses, chat completions, or Anthropic
Messages), carrying the workspace instructions and every memory file as
the system prompt and the job's conversation as the messages. There are no
tools, so the model cannot write files; memory written by a cloud turn is
a follow-up (`docs/product/cloud-agents-served.md`).

Until 25 September 2026 the runner started the OpenClaw gateway the
LobsterAI-era desktop shipped, and the image built that engine from source
with the desktop's patches. The patches, the script that applied them and
the desktop's pin left the repository with the 18 September re-founding,
so the image could not be built from the tree at all (the last image on
Render was the 22 September one), and the product's own loop no longer runs
on that engine. The Dockerfile is a plain Node build now:

```bash
docker build -f runner/Dockerfile -t claidor-maty-runner .
```

## Tests

```bash
npm test
```

`src/engine.test.ts` runs the turn against an in-process fake of the proxy
that speaks the three wires: the request lands on the right path with the
job's bearer, the memory is in the prompt, the answer is read on each
shape, a refusal names the proxy's sentence, a cancel is a cancel. It
proves nothing about the real proxy or a real model.
