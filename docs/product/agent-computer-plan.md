# The agent's computer: can the engine drive a pod from a Mac?

**18 September 2026. A measurement, not a plan yet.** Nothing in this document
proposes code. The task was to find out, cheaply and before anyone writes an E2B
backend, whether the architecture survives the distance between the person's
laptop and a pod in someone else's datacentre.

**The short answer: latency is not what kills this. The browser is.** Driving a
remote pod costs one network round trip per shell call and one to four per file
operation, fully serialised — a real tax, not a fatal one. But the sandbox
browser, which is the entire point of an agent's computer, is not behind the
backend interface at all. It is 533 lines of `docker` commands that reach the
browser at `http://127.0.0.1:<published port>`. On a Mac driving an E2B pod,
that loopback address is the Mac. That part does not lean on Docker; it *is*
Docker, and no plugin can replace it through the extension point that exists.

---

## 0. Read this first: the briefing was wrong about what is in the repository

I was told to read five documents before doing anything:

| Document | Exists? |
| --- | --- |
| `docs/product/box-substrate-read.md` | **No** |
| `docs/product/agent-computer-plan.md` | **No** — this file is its first version |
| `docs/product/sources/grok-bot-agent-computer.md` | **No** |
| `docs/product/sources/grok-bot-debugging-the-box.md` | **No** |
| `docs/product/cards-plan.md` | **No** |

What I searched, so the claim can be checked: `ls` on each of the five paths;
`find . -iname '*box*' -o -iname '*agent-computer*' -o -iname '*grok*' -o -iname
'*cards-plan*'` across the tree; `grep -rl` for each of the five stems; and
`git log --all --diff-filter=A --name-only` over the whole history. `git log`
finds no commit that ever added any of them, on any branch in this clone.

What does exist and is adjacent: `docs/product/sources/grok-bot.md`,
`grok-bot-agent-reference.md`, `grok-bot-agent-system-contract.md`,
`grok-bot-app-ui.md`, `grok-bot-chat.md`, and
`docs/product/sources/caisra-permissions.md`. For "cards-plan" there is
`desktop/harness/cards-plan-walk.mjs` and a screenshot that left with the
Rakazo removal. **I did not read the five, because there was nothing to read.**
Everything below rests on the engine source and on measurements, not on them.
If those documents exist somewhere outside this repository, the conclusions here
were reached without them.

---

## 1. What I ran, and what I did not

**Ran:**

- Cloned the engine at the pin: `github.com/openclaw/openclaw` tag `v2026.6.1`,
  commit `2e08f0f4221f522b60423ed6ffd83427942b28de`. It is not in this
  repository. `pnpm install --ignore-scripts` on Node 22.22.2.
- Read `backend.ts`, `backend.types.ts`, `backend-handle.types.ts`,
  `docker-backend.ts` (151 lines), `ssh-backend.ts` (306), `docker.ts` (706),
  `ssh.ts` (794), `fs-bridge.ts` (306), `remote-fs-bridge.ts` (686),
  `browser.ts` (533), `context.ts`, and the exec path in
  `bash-tools.exec-runtime.ts`.
- Ran the engine's own `src/agents/sandbox/backend.test.ts` — 2 passed.
- **Wrote and ran a probe** that registers a sandbox backend the engine has
  never heard of, drives `resolveSandboxContext` and the real fs bridges against
  it, counts round trips, and charges an injectable RTT for each one. It is kept
  at `docs/product/measurements/box-probe.test.ts` with instructions
  for re-running it. 4 tests, all passing.

**Did not run, and no conclusion below depends on having run it:**

- **Anything touching E2B.** There is no key and I did not create one. No pod
  was ever started. Every E2B number here is arithmetic on a measured trip count
  times an assumed RTT, and is labelled as such.
- **The Docker backend.** No Docker daemon in this container.
- **The SSH backend against a real host.** Its cost is read off the source, not
  timed.
- **The sandbox browser.** Nobody in this repository has ever run it — that was
  already true of the in-app browser and it is true of this one too. The browser
  findings below are from reading `browser.ts`, not from watching it fail.
- **The real agent loop.** The probe drives the sandbox layer, not a model turn.
- **A real Mac-to-E2B RTT.** I tried to time `api.e2b.dev` from here and got
  `http=000` through this container's egress proxy — the connection never left.
  This is a datacentre in any case, not a laptop on domestic wifi. **Nobody has
  measured the number that the latency arithmetic below multiplies by.** That is
  the one cheap experiment still worth doing, and it needs a Mac, not an agent.

---

## 2. The backend contract is genuinely a plugin seam, and it holds

`registerSandboxBackend(id, …)` writes into a `Symbol.for`-keyed map on
`globalThis` (`src/agents/sandbox/backend.ts:25-60`). The two shipped backends
register themselves at the bottom of that same file. `requireSandboxBackendFactory`
throws the "Load the plugin that provides it" error for anything else
(`backend.ts:70-84`).

It is a supported extension point, not an accident: `package.json` exports
`./plugin-sdk/sandbox`, and `src/plugin-sdk/sandbox.ts` re-exports
`registerSandboxBackend`, `SandboxBackendHandle`, `CreateSandboxBackendParams`,
and — importantly — `createRemoteShellSandboxFsBridge`. **A box backend can be
an ordinary OpenClaw plugin.** No patching, no fork.

**Measured, not assumed:** the probe registered a backend called `box` that
touches no Docker, and asked the engine for a session on it.

```
[probe] context held: backendId=box runtime=box-pod-probe
```

`resolveSandboxContext` returned `enabled: true`, `backendId: "box"`,
`runtimeId: "box-pod-probe"`, and a working `fsBridge`. **The engine will hold a
session on a backend it has never heard of.** That question is settled.

`sandbox.scope` works as the spec wants, too: `scope: "shared"` collapses the
scope key to the literal `"shared"` (`shared.ts:24-28`) and points every agent at
one workspace root (`context.ts:44`) — one machine shared by all agents. "A
desktop each" is `scope: "agent"`, which also gives a runtime each.

**One thing stands in the way on our side, and it is one line.**
`mapExecutionModeToSandboxMode` in `desktop/src/main/libs/openclawConfigSync.ts:138`
returns `'off'` before it looks at anything else unless the install is
enterprise. Every ordinary Caisra install therefore has the sandbox disabled, so
no backend of ours would ever be constructed. Changing that is a decision about
the product, not about E2B, and it is not made here.

---

## 3. How much of the Docker backend leans on Docker semantics the interface does not express?

A great deal, and it is concentrated in three places. Two are survivable. The
third is the finding.

### 3a. The shared context type speaks Docker, not "sandbox"

`SandboxFsBridgeContext` (`backend-handle.types.ts:26-40`) — the type every
backend's fs bridge receives — has fields named `containerName`,
`containerWorkdir`, and a `docker: { binds?: string[] }`. `SandboxResolvedPath`
calls its third field `containerPath`. The SSH backend, which has no containers
at all, fills `containerName` with a directory-name-shaped string and throws
outright if anyone sets binds:

```ts
// ssh-backend.ts:106-108
if ((params.cfg.docker.binds?.length ?? 0) > 0) {
  throw new Error("SSH sandbox backend does not support sandbox.docker.binds.");
}
```

It also reads `cfg.docker.env` and `cfg.docker.workdir` for its own env and
workdir. This is cosmetic — vocabulary, not behaviour — but it means a box
backend inherits a config surface shaped like `docker run`, and anyone reading
our code later will have to be told that `containerName` means "pod".

### 3b. The default fs bridge reads files off the host disk — measured

This is the one that would have cost real time if it had been found later.

`createSandboxFsBridge` is the bridge every backend gets unless it supplies its
own. Its read path is:

```ts
// fs-bridge.ts:242-249
private async readPinnedFile(target: SandboxResolvedFsPath): Promise<Buffer> {
  const opened = await this.pathGuard.openReadableFile(target);
  try {
    return fs.readFileSync(opened.fd);   // <- a HOST file descriptor
```

It reads the sandbox's files through Node's own `fs` on the host, because with
Docker the workspace is bind-mounted and the host path and the container path
are the same bytes. The probe caught this as a number:

```
[probe] fsBridge.readFile: trips=0 wall=1.8ms kinds=
```

**Zero round trips to the backend for a file read.** On a pod that is not a fast
read, it is a wrong one — it would read whatever is at that path on the Mac, or
nothing.

The same file falls back to Docker when a backend does not supply the hook at
all (`fs-bridge.ts:232`, calling `runDockerSandboxShellCommand`). Docker is the
hardcoded default underneath the abstraction.

The fix is already in the tree and already exported to plugins:
`createRemoteShellSandboxFsBridge`, which does every operation as a shell script
on the far side. The SSH backend wires it up in exactly this way
(`ssh-backend.ts:171-176`). A box backend must do the same, and must never be
allowed to fall through to the default. **This is a known, solved shape, not a
new problem** — but it is invisible in the interface, and a backend that simply
omits `createFsBridge` compiles, runs, and silently reads the wrong disk.

### 3c. The browser is not behind the interface at all

`capabilities.browser` is a single boolean on the handle. The Docker backend
sets it `true`; the SSH backend does not set it, so SSH has no sandbox browser.
Reading the flag, `context.ts:201-205` throws:

> `Sandbox backend "<id>" does not support browser sandboxes yet.`

and when it is `true`, `context.ts:206-216` calls `ensureSandboxBrowser` —
which never consults the backend handle again. `browser.ts` is 533 lines of
`execDocker`: it pulls an image (`browser.ts:164`), creates a bridge network
(`:205-209`), creates and starts a *second container* (`:388-389`), and
publishes ports on host loopback:

```ts
// browser.ts:366-368
args.push("-p", `127.0.0.1::${params.cfg.browser.cdpPort}`);
if (noVncEnabled) {
  args.push("-p", `127.0.0.1::${params.cfg.browser.noVncPort}`);
}
```

then reads the mapped port back with `docker port` and builds the control URL as
`http://127.0.0.1:<mapped>` (`browser.ts:121`, `:401`). The URL the person would
watch is anchored to the host twice over: the engine starts a browser bridge
server **on the host** (`browser.ts:455-495`) pointed at that loopback port, and
the noVNC link is built from that local server's base URL (`browser.ts:517-526`).

So `SandboxBrowserSettings` does carry `cdpPort`, `vncPort`, `noVncPort` and
`enableNoVnc` — that much of the briefing is right — but **they are ports inside
a Docker container, published onto the host's loopback.** They do not describe a
browser reachable anywhere else. Nothing browser-related is exported from
`plugin-sdk/sandbox`. There is no seam here for a plugin to fill.

**What that means concretely.** A box backend that declares
`capabilities.browser: true` does not get a browser in the pod. It gets the
engine running `docker run` **on the person's Mac** and then talking to that
local container, while the agent's shell commands run 5,000 km away. The two
would not even share a filesystem. A box backend that declares it `false` — the
honest answer — gets the engine refusing to start whenever
`sandbox.browser.enabled` is on.

E2B can expose a port from a pod at a public hostname, so a browser *in* the box
is physically possible. But reaching it means the engine building a CDP URL that
is not `127.0.0.1`, and that string is assembled inside `browser.ts` from a
`docker port` lookup. **Getting a watchable browser inside an E2B box requires
changing engine code that the plugin interface does not reach.** That is a fork
or an upstream patch, and this fleet has a rule about who patches.

---

## 4. Is the SSH backend a closer template for E2B than Docker?

**Yes, clearly, and it is the only sane starting point.** But it is a template
for the shape, not for the transport, and it carries two habits that would be
expensive to copy.

What makes it the right template:

- It already drives a machine that is not this one: a target, an identity, a
  remote `workspaceRoot`, remote paths built with `path.posix`
  (`ssh-backend.ts:284-292`).
- It supplies `createFsBridge` and uses the remote shell bridge — §3b's answer
  (`ssh-backend.ts:171-176`).
- It carries a `finalizeToken` through `buildExecSpec` and tears the connection
  down in `finalizeExec` (`ssh-backend.ts:145-168`). A pod handle would use the
  same slot.
- Its `SandboxBackendManager` answers "is this runtime alive?" by running a
  command on the far side rather than asking Docker (`ssh-backend.ts:40-70`).
- It does not claim `capabilities.browser`, which is the honest position a box
  backend also starts from.

What it does that a box backend should not copy:

1. **It opens a fresh connection for every single call.** `runRemoteShellScript`
   does `createSession()` → command → `disposeSshSandboxSession()`, and
   `createSshSandboxSessionFromSettings` writes a fresh temp config directory
   each time (`ssh.ts:524`). There is **no** `ControlMaster` or `ControlPersist`
   anywhere in the engine source — I grepped both, across all of `src/`, and
   found nothing. So each of the file-operation round trips counted in §5 is, on
   SSH, a full TCP connect plus key exchange plus auth. E2B's transport is
   HTTP/WebSocket to an already-authenticated pod, which is *cheaper* than what
   the SSH backend already does. A box backend should hold one client and reuse
   it.
2. **First use uploads the whole workspace and wipes the far side first.**
   `ensureRuntimeInner` clears the remote directory and then streams the local
   one over as a tar (`ssh-backend.ts:200-258`, `ssh.ts:636-661`, `tar -cf -` on
   one end into `tar -xf -` on the other). That is the engine's built-in answer
   to "the remote machine has no files", and it is **the opposite of the file
   custody decision**: explicit import, one deliberate copy at a time, never
   ambient. A box backend must not inherit this. It should start the pod with an
   empty workspace and let import be the only thing that puts a person's file in
   it — which means writing `ensureRuntime` fresh rather than copying SSH's.

There is one thing Docker's backend has that SSH's lacks and a box backend will
want: a real `SandboxBackendManager` with `removeRuntime`, so a pod gets killed
rather than leaked. E2B bills by the second; SSH's `removeRuntime` only deletes
a directory.

---

## 5. The latency shape, measured

Every `[probe]` number below came out of
`docs/product/measurements/box-probe.test.ts`, run against the
engine at the pin. "Trips" is the number of times the host has to call the
backend to finish one operation.

**Round trips per operation.** The left column is the default bridge (what
Docker gets). The right is `createRemoteShellSandboxFsBridge`, **the one a box
backend has to use**, and therefore the column that matters.

| Operation | Default bridge | Remote bridge |
| --- | --- | --- |
| Shell tool call (`buildExecSpec`) | 1 | 1 |
| `readFile` | **0** (reads host disk — §3b) | 1 |
| `writeFile` | 5 | 3 |
| `stat` | 3 | 4 |
| `mkdirp` | 3 | 1 |
| `rename` | 5 | 3 |
| `remove` | 3 | 3 |

The remote bridge is *cheaper in trips* than the default one for most
operations, which was not what I expected — the default bridge spends trips on
host-side path-guard checks that the remote bridge folds into its scripts.

**The engine does not pipeline. Cost is trips × RTT, exactly.** The probe ran
one write, one read and one exec spec at three injected RTTs:

| Injected RTT | Trips | Wall | Added over RTT=0 | Trips × RTT |
| --- | --- | --- | --- | --- |
| 0 ms | 6 | 73.0 ms | — | — |
| 40 ms | 6 | 317.0 ms | 244 ms | 240 ms |
| 120 ms | 6 | 799.5 ms | 726 ms | 720 ms |

Linear, within measurement noise. There is no concurrency to hide behind: each
trip waits for the last.

**What that costs a real turn — arithmetic, not a measurement.** With an
unmeasured RTT of *R*:

- a shell command: **1 × R** added, plus its own runtime (the command streams
  over one connection, so a long-running command costs R once, not per second);
- a file read: **1 × R**; a file write: **3 × R**;
- a turn doing ten tool calls of a realistic mix: roughly **15–20 × R**.

At R = 40 ms (a laptop and a pod in the same continent, if that is what E2B
gives us) that is **0.6–0.8 s added per turn**. At R = 120 ms (transatlantic)
it is **1.8–2.4 s**. A model turn is seconds on its own. **This is a tax, not a
wall.** Shell and files survive the distance.

The arithmetic breaks for anything chatty. Browser automation is the obvious
one: a single "click this and read the page" is many CDP messages, and at
15–20 × R *per interaction* rather than per turn it stops being usable. Which
returns to §3c — except that CDP never goes through the backend at all, so the
box would not even pay this cost; it would simply be driving the wrong browser.

---

## 6. How the app reaches the box, and what it cost us

Decided while building, from a read of our own code rather than a guess.

**The app never holds the sandbox credential, and it should not hold a raw
account token either.** The pattern already in the tree is the local token
proxy (`desktop/src/main/libs/openclawTokenProxy.ts`): a loopback HTTP server
that injects the account's access token, refreshes it when it expires, and
forwards to the Caisra server under `/api/proxy/…` (`openclawTokenProxy.ts:219`).
The Composio plugin uses it precisely so no token is written into
`openclaw.json`, where it would go stale. The box uses the same road, so its
broker paths are `/box/…` and the server serves them at `/api/proxy/box/…`.

**That proxy cannot carry a WebSocket.** It has no `upgrade` handler, and it
strips the `upgrade` header outright (`openclawTokenProxy.ts:883` — I grepped
`'upgrade'`, `on('upgrade'` and `WebSocket` across the file and that is the only
hit). The first version of the bridge opened a WebSocket; it would have
connected to nothing.

So the exec transport is **one chunked POST**: stdin goes up in the request
body, and stdout, stderr and the exit code come back as NDJSON frames as they
happen. One request per Shell tool call, which is the same round-trip count §5
measured.

**What that costs: interactive terminal sessions.** A command cannot be fed
after it starts, so a pty cannot work over this road. The engine only asks for
one when `usePty` is set, and the bridge refuses that with a reason rather than
hanging on stdin that never closes. Restoring it means either teaching the
token proxy to proxy an upgrade, or letting the bridge talk to the server
directly with a token of its own — the second is cheaper and worse, because it
puts a token in a config file and loses refresh.

---

## 7. What I think this means

**The architecture does not have to change, but one part of the promise does.**

- **Shell and files in a pod, driven from a Mac: yes.** Measured trip counts,
  linear latency, an extension point that demonstrably holds a session. The work
  is an ordinary plugin against `plugin-sdk/sandbox`, modelled on the SSH
  backend, with its own `createFsBridge`, one reused client instead of a
  connection per call, its own `ensureRuntime` that does *not* upload the
  workspace, and a real `removeRuntime` so pods die.
- **A watchable browser in the box: not through this interface.** `browser.ts`
  is Docker end to end and hands back a `127.0.0.1` URL. A box backend must
  declare `capabilities.browser: false` and be honest that turning on
  `sandbox.browser.enabled` will refuse to start. Anything better is an
  upstream change, and the rule in this fleet is that the Engine agent is the
  sole patcher — so that is a conversation, not a commit.

**The cheapest thing anyone can do next is not code.** It is to sit at the Mac
and measure the actual round-trip time to the nearest E2B region. Every number
in §5 is that one unmeasured quantity times a trip count I did measure. If it
comes back at 30 ms the tax is invisible; if it comes back at 200 ms on domestic
wifi, §5's arithmetic is a different conversation and worth having before a line
of backend code exists.

**Things I want on the record as not established:** whether E2B's per-call
transport really is cheaper than an SSH handshake (assumed from how the two
protocols work, not timed); what a pod costs to start cold, which is the latency
the person actually feels when they first ask for something; and whether the
sandbox browser works *at all*, on Docker, on anyone's machine — nobody here has
run it, so "Docker has a working browser and E2B would not" is a claim about
code I read, not about software I watched work.
