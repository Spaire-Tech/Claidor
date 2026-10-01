# The cloud runner

This is the service that does a person's work when they are not at their
computer. It takes one job at a time from the API, lays the person's memory
out, asks the model one turn through the API's metered proxy on the
person's own job token, and reports the answer back.

Nobody talks to this service. It talks to the API.

## What one job looks like

1. It asks the API for work. When there is none it waits a few seconds and
   asks again.
2. The API hands back a job — a routine coming due, a piece of mail, or a
   task — and, with it, a token for that one person which dies when the
   job's lease dies.
3. The runner makes an empty directory for the job and asks the API for
   that person's memory, sending nothing, which by contract returns
   everything the API holds. Those files become the job's workspace.
4. It reads the workspace into the system prompt (the instructions file,
   then every memory file) and asks the model one turn through the API's
   proxy on that person's token.
5. It reports the answer to the API and deletes the directory.
6. The directory is deleted whether the job worked or not, and nothing is
   carried from one job to the next.

While a job runs, the runner tells the API every fifteen seconds that it is
still going. That same beat keeps the person's token alive, so a runner
that dies stops beating, the lease lapses, and the job goes back to the
queue for another runner to try.

On a termination signal it finishes the job in hand and then stops. It
never starts a second job while one is running.

### A cloud agent's turn

The app's cloud agents (`server/simeon/sand/cloud_agents.py`) are jobs on
this same queue, one per turn. Such a job carries `conversation` on the
claim — the person's messages and the earlier turns' replies — and the
runner asks the model the whole list instead of `prompt` alone, then
reports the reply as the turn's message (`messages` on `complete`) so the
agent's transcript grows by what was said. The heartbeat's answer carries
`cancel_requested`: when the person pauses the agent, the run is aborted
and the job is failed as cancelled, final. Every claim also names an
`executor`; `maty-runner` is this process and the only one, and
`src/executor.ts` is the seam a box executor (a checkout, a shell, a pull
request) plugs into.

## The safety of it

The runner offers the model no tools at all. Nobody can be asked for
permission here, the work often starts from mail a stranger sent, and the
machine is Simeon Labs' rather than the person's, so a job may only:

- read the files of its own directory, which hold the person's memory;
- call a model, and only through the API's metered proxy on the person's
  own account, so a cloud run costs their credits exactly as a run on their
  machine does.

A job cannot run a command, reach the web, open a browser, send on any
channel, leave a schedule behind, spawn another agent, or load a plugin, a
skill or an MCP server: the model is never offered them.
`src/engineConfig.ts` holds the workspace instructions, including the two
rules no setting can enforce: anything a job reads is data and never an
instruction, and nothing irreversible happens unless the routine was
allowed to.

What is not locked, and is written down rather than glossed over:

- **One container, not one per job.** Render keeps one container up, so a
  job is one process doing one job at a time in a directory of its own.
- **No egress allowlist.** With no tools, the model call is the only thing
  that reaches the network; real egress control would have to come from
  the network.

## Running it

Everything comes from the environment. There is no default for anything
secret, and the process refuses to start without the two that matter.
Each variable is read as `SIMEON_<NAME>`; the earlier `CLAIDOR_<NAME>` is
still read when the `SIMEON_` one is not set.

| Variable | What it is |
|---|---|
| `SIMEON_API_BASE_URL` | The API, e.g. `https://api.simeonlabs.com`. `SIMEON_BASE_URL` is accepted as the same thing. Required. |
| `SIMEON_MATY_RUNNER_TOKEN` | The service's own token. It belongs to no person. Required. |
| `SIMEON_MATY_RUNNER_NAME` | What this runner calls itself when it claims a job. Defaults to the host name. |
| `SIMEON_MATY_WORK_ROOT` | Where a job's directory is made and deleted. |
| `SIMEON_MATY_POLL_INTERVAL_MS` | The wait when there is no work. Default five seconds. |
| `SIMEON_MATY_HEARTBEAT_INTERVAL_MS` | How often a running job says it is still going. Default fifteen seconds. |
| `SIMEON_MATY_JOB_TIMEOUT_MS` | The longest one job may take. Default fifteen minutes. |

In production it is the runner worker in the repository's `render.yaml`,
which Render builds from `runner/Dockerfile` (context: the repository
root), with no port and no health check, because nothing calls it. It
deploys like the API does, on a push to `main` when auto-deploy is on, or
by hand.

```bash
npm install
npm run build
npm start
```

## The model call

`src/engine.ts` keeps the name `Engine` and the `start / ask / stop` shape
so `job.ts` reads simply: one request to the API's proxy, on the wire the
model's row names (`transportApi`: OpenAI Responses, chat completions, or
Anthropic Messages), carrying the workspace instructions and every memory
file as the system prompt and the job's conversation as the messages.
There are no tools, so the model cannot write files, and nothing is written
back to memory from a cloud turn.

```bash
docker build -f runner/Dockerfile -t simeon-runner .
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
