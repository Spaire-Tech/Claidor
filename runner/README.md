# The cloud runner

This is the service that does a person's work when they are not at their
computer. It takes one job at a time from Claidor, does it with the same
agent engine the Maties desktop app ships, and reports the answer back. It
is step 2 of `docs/maties/cloud.md`; read section 4 of that note before
changing anything here.

Nobody talks to this service. It talks to Claidor.

## What one job looks like

1. It asks Claidor for work. When there is none it waits a few seconds and
   asks again.
2. Claidor hands back a job — a routine coming due, a piece of mail, or a
   task — and, with it, a token for that one person which dies when the
   job's lease dies.
3. The runner makes an empty directory for the job and asks Claidor for
   that person's memory, sending nothing, which by contract returns
   everything Claidor holds. Those files become the engine's workspace.
4. It writes the engine's configuration, starts the engine, and sends the
   one instruction.
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

## The safety of it, which is the point

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
| `CLAIDOR_API_BASE_URL` | Claidor's API, e.g. `https://api.claidor.com`. `CLAIDOR_BASE_URL` is accepted as the same thing. Required. |
| `CLAIDOR_MATY_RUNNER_TOKEN` | The service's own token. It belongs to no person. Required. |
| `CLAIDOR_MATY_RUNNER_NAME` | What this runner calls itself when it claims a job. Defaults to the host name. |
| `CLAIDOR_MATY_ENGINE_ROOT` | The built engine: the directory holding `openclaw.mjs`. Defaults to `/engine`, where the image puts it. |
| `CLAIDOR_MATY_WORK_ROOT` | Where a job's directory is made and deleted. |
| `CLAIDOR_MATY_POLL_INTERVAL_MS` | The wait when there is no work. Default five seconds. |
| `CLAIDOR_MATY_HEARTBEAT_INTERVAL_MS` | How often a running job says it is still going. Default fifteen seconds. |
| `CLAIDOR_MATY_JOB_TIMEOUT_MS` | The longest one job may take. Default fifteen minutes. |
| `CLAIDOR_MATY_ENGINE_START_TIMEOUT_MS` | The longest to wait for the engine to be ready. Default three minutes. |

In production it is the `claidor-maty-runner` service in the repository's
`render.yaml`: a worker running the published image, no port and no health
check, because nothing calls it. A new image does not deploy itself —
Render pulls only when a deploy is asked for.

```bash
npm install
npm run build
npm start
```

## The engine

Pinned in this package's `package.json` under `openclaw`, and it must stay
equal to the pin in `desktop/package.json`: one person, one assistant, so
the two places it runs must be the same build. `src/engineVersion.test.ts`
fails if the runner, the desktop and the Dockerfile ever disagree.

The tag is only half of that engine. The other half is the patches in
`desktop/scripts/patches/<tag>/`, which go into the source before it is
built — which is why the engine is built here at all rather than installed
from npm, where the unpatched package sits looking like an hour saved. The
image applies them with the desktop's own script, so the order and the
checks are the desktop's too, and the same test fails if a patch stops
reaching the image.

The image builds the engine from its own repository at that tag, the way
`desktop/scripts/build-openclaw-runtime.sh` builds it, minus the parts that
exist only for Electron. `docs/maties/cloud.md`, section 4, names what the
desktop still does that this does not, and what it costs.

It is built in GitHub Actions (`.github/workflows/runner_image.yml`) and
published to `ghcr.io/spaire-tech/claidor-maty-runner`; Render pulls that
image rather than building one, because its build machine does not finish
the engine. Building it by hand takes the repository root as its context,
because the patches live outside this directory:

```bash
docker build -f runner/Dockerfile -t claidor-maty-runner .
```

## Tests

```bash
npm test
```

The last test is the one that matters: it starts a real engine from a built
runtime and makes it answer. It is skipped when no runtime is present.
Build one with `npm run openclaw:runtime:linux-x64` in `desktop/`, or point
`CLAIDOR_MATY_ENGINE_ROOT` at one.

Because a test cannot have a model, a stub stands in for Claidor's metered
proxy and speaks the same wire. That proves everything on our side of the
model: the config loads, the gateway starts, the tool policy is applied,
the call goes to the address we configured carrying the job's token, the
answer comes back, a file inside the job directory can be read, one outside
it cannot, and a command is refused. It proves nothing about the real proxy
or a real model.
