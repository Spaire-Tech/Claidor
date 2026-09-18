# Two reads before building the box

18 September 2026. Both were reads, not builds. Both changed the plan.

---

## 1. OpenClaw's sandbox: far more than expected

`agent-computer-plan.md` said the engine's sandbox "exists and is forced off",
and that what it provisions "cannot be answered from here" because the source is
not in this tree. It can be answered: the pin is `v2026.6.1` from
`github.com/openclaw/openclaw`, and reading it changes the estimate for the box
from *build one* to *integrate one*.

**The backend is a plugin registry, not a fixed list.**
`src/agents/sandbox/backend.ts` exports `registerSandboxBackend(id, …)`, keyed
on a global map, and the error for an unknown one reads:

> `Sandbox backend "<id>" is not registered.`
> `Load the plugin that provides it, or set agents.defaults.sandbox.backend=docker.`

Two ship: **docker** (151 lines) and **ssh** (306 lines). The SSH one already
drives a *remote* machine — `target: user@host[:port]`, identity file or inline
key, host-key checking, a remote `workspaceRoot`. So "the engine works on a
machine that is not this one" is not a new capability we have to invent.

**The backend interface is small.** From `backend-handle.types.ts`, a backend
provides `buildExecSpec`, `runShellCommand`, a filesystem bridge, a workdir and
env, and declares `capabilities.browser`. That is the whole contract. E2B's own
API is command execution plus a filesystem, which is the same shape.

**The sandbox already knows about a desktop.** `SandboxBrowserSettings` carries
`image`, `cdpPort`, `vncPort`, `noVncPort`, `enableNoVnc`, `headless` and a CDP
source-range allowlist. A browser inside the sandbox, watchable over noVNC, is
implemented — for the Docker backend — and it is exactly the stack the Grok Bot
spec describes (x11vnc, noVNC, a Chrome the agent drives).

**And it already has the scope question we were going to have to answer.**
`sandbox.scope: "session" | "agent" | "shared"` is precisely the spec's "one
machine shared by all agents, a desktop each": `shared` is the box, `agent` is a
desktop per agent.

Also present: `workspaceAccess: "none" | "ro" | "rw"`, and `prune` settings.

### What this means

**An E2B sandbox backend, written as an OpenClaw plugin, is plausibly most of
the substrate work.** Not a guarantee — nothing here has been run, and the two
shipped backends may lean on Docker semantics the interface does not express.
But the honest estimate moved a long way: the comparison is a few hundred lines
against a docker backend of 151 and an ssh backend of 306, not a box built from
nothing.

Two caveats that matter:

- **`mode` defaults to non-main sessions.** The box in the spec is where the
  *main* agent works, which is `mode: "all"`. Our app forces `off` for every
  non-enterprise install (`mapExecutionModeToSandboxMode`), so that gate has to
  go or change meaning.
- **The sandboxed browser settings are Docker-shaped** — a network name, a
  container prefix, an image. How much survives a different backend is unread.

**First experiment, and it is small:** register a trivial backend and see
whether the engine will hold a session on it. That answers the latency question
in `agent-computer-plan.md` — our agent runs on the person's Mac while the box
is in E2B — with a measurement instead of an argument.

---

## 2. `claidor-maty-runner`: complete, careful, and unplugged

The question was whether the cloud runner overlaps the box. Read end to end.

**What it is.** A worker that takes one job at a time from Claidor, runs it with
the *same* engine build as the desktop (same pin, same patches, enforced by
`engineVersion.test.ts`), and reports back. It makes a fresh directory per job,
pulls that person's memory, runs one instruction, writes the memory back,
reports, and deletes the directory. Fifteen-second heartbeats keep a lease alive
so a dead runner's job returns to the queue. It never runs two jobs at once.

**It is deliberately, severely locked down**, and the code matches the README
line for line (`runner/src/engineConfig.ts`): an allowlist of tools with
`group:runtime`, `group:web` and `group:ui` denied on top — no shell, no web, no
browser — plus `exec.mode: 'deny'`, `elevated: false`, `search`/`fetch`
disabled, `cron` disabled, `browser` plugin disabled, and a bundled-skill
allowlist naming a skill that does not exist so none can load. A job may read
and write files inside its own directory and call a model through the metered
proxy on the person's own account. Nothing else.

**Why it is locked down that hard, in its own words:** *"OpenClaw's tool sandbox
runs on Docker, and there is no Docker daemon inside a Render container, so
turning it on would fail every tool call rather than contain one."* And: *"The
day a job must run something truly untrusted, it needs a sandbox of its own
first."*

**Live state, measured:**

- `POST https://api.claidor.com/maty/runner/claim` → **401**. The queue is
  deployed and asking who you are.
- Both routers are mounted: `/maty/runner` for the runner,
  `/desktop/api/maty/jobs` for the app.
- **`grep -ril maty desktop/src` returns nothing.** The desktop app has no maty
  client of any kind.

**So: it is a finished pipe with nothing plugged into the input.** The server
can queue jobs, the runner can take them, and no code anywhere creates one. That
is the answer to "how complete is it", which `CLAUDE.md` and the going-back
brief have both said was never established. It is complete and unreachable.

### The recommendation

**Do not build a producer for the runner as it stands, and do not retire it.
Keep its queue and change its executor.**

The runner is two things stacked. The top half — claim, lease, heartbeat,
per-job scoped token that dies with the lease, memory in and memory out, delete
the directory either way — is the hard, careful part, it is tested, and it is
exactly what firing a routine while the laptop is shut needs. The bottom half —
*a Render container with no Docker* — is the part that forced every interesting
tool to be switched off.

E2B removes precisely that constraint. So:

- keep `polar/maty/` and the queue contract as they are;
- replace the runner's executor with a box, so a job runs in the same kind of
  sandbox an interactive turn does;
- then relax the tool policy on purpose, because a routine that cannot browse or
  run a command cannot do much, and the reason it could not was the missing
  sandbox rather than a decision about risk.

That gives one cloud execution substrate with two entry points — a routine
coming due, and an interactive turn — instead of two substrates that do
overlapping work and drift apart. It also means the Routines dock item has
somewhere real to land.

**What not to do:** wire the app to the queue first. A producer against today's
executor would ship routines that can read a file and call a model and nothing
else, and that is a feature people would rightly call broken.
