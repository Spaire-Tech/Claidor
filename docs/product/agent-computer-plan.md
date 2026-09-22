# The agent's computer: what the spec asks for, and what we have

18 September 2026. Sources, saved verbatim and not paraphrased:

- `sources/grok-bot-agent-computer.md` — the box, compiled from Grok Bot's live system
- `sources/grok-bot-debugging-the-box.md` — its failure modes and doctor
- `sources/grok-bot-app-ui-paths.md` — its Settings paths

**The app UI is not ours to copy.** The founder: *"for the app ui, we'll write
based on our own ui in due time."* The third source is kept for the *shape* of
what a Computer settings tab has to carry (registered machines, recovery,
per-agent live preview), never for its paths or its copy.

Nothing here is built. This is what the spec asks for, measured against the
tree.

---

## What the spec asks for, in one paragraph

One persistent Linux machine per user — "the box" internally, **"my computer"**
to the person — shared by all of that person's agents, where each agent gets its
own desktop and browser window but **not** its own machine. Files and installed
tools and browser logins persist across turns. The person's own machines are
*registered* alongside it (`ListMachines`), reached by passing a `machineId`,
and crossing between them is an explicit `CopyToBox` / `CopyFromBox`. The agent
cannot click or type itself: GUI work is delegated to `computerUse` /
`browserUse` subagents. Recovery is **Update** (fresh instance, keeps files and
logins, loses installed software) and never **Reset**.

This is the registry plus explicit-import model already locked in
`cards-plan.md`. The spec is consistent with the lock; no contradiction found.

## What we already have

| Spec asks for | In this tree | State |
|---|---|---|
| A box (Linux, persistent) | — | **Nothing.** No container, no pod, no substrate |
| Registered user machines, `ListMachines` | — | **Nothing** |
| `CopyToBox` / `CopyFromBox` | — | **Nothing** |
| `computerUse` subagent | `main/computerUse/` (1,195 lines) | **Wrong thing** — see below |
| `browserUse` / agent browser | `libs/agentBrowserPlaywright.ts`, `agentBrowserHost.ts` | Written, **never run** |
| Screenshot of the agent's desktop | the computer panel's `agentBrowser` tab | Browser only, no desktop |
| Box handoff (`request_box_help`) | — | **Nothing** |
| In-chat form filled into the box browser | `askInputMcpServer.ts` | Collects values; does not fill a page |
| Cookie-origin import | — | **Nothing** |
| `box-doctor` | — | **Nothing** |
| Update / Reset Computer | — | **Nothing** |
| Per-agent live desktop preview | — | **Nothing** |
| Sandbox as a substrate | engine `sandbox.mode` | **Exists and is forced off** — see below |

### The `computerUse` we have is not the one the spec means

`main/computerUse/computerUseRuntime.ts` is upstream's helper for driving **the
person's own PC**, and it is:

- **Windows x64 only** (`Platform: 'win32'`, `Arch: 'x64'`) — on a Mac it
  reports `Unsupported`, so it has never done anything in this product;
- downloaded at runtime from a **NetEase CDN**
  (`ydhardwarebusiness.nosdn.127.net`), pinned by SHA-256;
- carrying **Chinese UI strings** — `Locale: 'zh-CN'`, `按 Esc 取消`, and an
  on-screen banner reading `Caisra 正在使用你的电脑`.

That last one is a live breach of `direction.md` §0, which says no string a
person can read names the machinery underneath — this one is worse than a name,
it is a whole language. It has never appeared because the runtime is
Windows-only, which is the only reason nobody has seen it.

The spec's `computerUse` is the opposite thing: a subagent clicking **the box's**
desktop, never the person's. So this is not a head start. It is 1,195 lines to
delete or to replace, and a decision either way.

### The engine already has a sandbox, and we switched it off

`openclawConfigSync.ts:136` maps our execution mode onto the engine's
`sandbox.mode` (`off` | `non-main` | `all`) — and returns `off` immediately
unless the install is **enterprise**:

```ts
if (!isEnterprise) return 'off';
```

So the engine has a container concept, and every non-enterprise install has it
disabled. Two things follow. First, **the browser brief will need rewriting**:
it currently says *"Do not use `target="sandbox"` or `target="node"`: there is no
sandbox and no other machine in this product"*, which stops being true the day
the box exists. Second, **whether the engine's sandbox is the right substrate for
the box is unknown from here** — the OpenClaw source is not in this tree
(`vendor/openclaw-runtime/` is built, not committed), so what its sandbox
actually provisions has not been read. That is the first thing to find out, and
it is a read, not a build.

## What the agent browses in today, and the three browsers

Asked directly — *"right now everything the agent do is thru the user's browser
or no?"* — the answer is **no, and by design it never is.** Traced 18 September.

**The default path.** `defaultBrowserWebAccessConfig` is `profileMode: managed`
and `displayMode: in-app`, which resolves to the runtime profile
`caisra-in-app` with `driver: 'existing-session'` and `attachOnly: true`
(`openclawConfigSync.ts:2579`). That is **Caisra's own Chromium** — Electron
`WebContentsView`s inside the app, drawn in the computer panel. Its cookies live
in a separate Electron session partition, `persist:lobster-agent-browser`, so
nothing it signs into touches the person's own browsing.

**What Playwright is for.** `agentBrowserPlaywright.ts` drives those same
in-app views. Electron starts with `--remote-debugging-port=0`, Chromium writes
the chosen port to `DevToolsActivePort`, and Playwright connects to it. It can
see every page the app has, including the app's own window, so the driver hands
out only views looked up by the DevTools target id the host read from the view
itself — the agent gets the pages it opened and nothing else. The founder chose
it over hand-written DevTools calls: *"lets use Playwright."* It replaced a
synthetic `element.click()` and a hand-cut accessibility tree.

**Three browsers exist in this product, and that is worth knowing before the
box adds a fourth:**

| | What | When it runs |
|---|---|---|
| `caisra-in-app` | Electron `WebContentsView`s, Playwright-driven, drawn in the panel | The default |
| `openclaw` (managed) | The engine's own separate Chromium | Fallback when an in-app half is missing |
| `user` | **The person's real Chrome** | Never — the brief forbids `profile: "user"` outright |
| the `web-search` / `playwright` skills | Their own Playwright process, from the terminal | Whenever the agent runs those skills |

The last row is the surprise: the `web-search` skill drives its **own**
Playwright browser out of `SKILLs/web-search/dist/`, separate from the agent
browser entirely, and the `playwright` skill is a CLI wrapper doing the same.
Both are enabled. So "the agent's browser" is already two different things
depending on which path it took, before the box introduces a third that lives on
a different machine.

**None of this has been run.** `CLAUDE.md` still says nobody has run the browser
in this tree, and that stands. The line that settles which profile is actually in
charge on a given Mac is `[EngineConfigSync] browser profile=…`, and on a
fallback it names which half was missing.

**What this means for the box.** Today the agent browses on the person's machine,
inside the app, with its own cookie jar. On E2B it will browse on the box, in the
box's Chrome, with the box's logins — which is the spec's model and is *why*
cookie-origin import exists there. The two are not the same browser and must not
be described to a person as if they were.

## What the spec obliges that we already knew

From `cards-plan.md`, unchanged and now confirmed by the source:

- the approval card has to name a machine;
- "their computer asks once" is written for a world with one machine;
- box handoff is **box desktop only** — the spec says so in as many words:
  *"not 'control Bass's Mac'"*;
- a file card has to make custody visible.

And one the spec adds: **the agent must never say each agent has its own
machine.** They share one computer and have separate desktops. That is a line
for the brief's identity section, where the other never-say rules live.

## Open questions

Marked as the founder's, mine, or answerable by reading.

### For the founder

1. **Where does the box run, and who pays for it while it is idle?** Grok Bot
   ships a brokered pod server-side and uses local Docker only for development.
   A hosted box is a persistent Linux machine per user — it has to exist even
   when nobody is talking to it, because logins and files live on it. That is a
   standing cost per user, unlike the model proxy, which costs only when used.
   The alternative is Docker on the person's Mac: no infrastructure, better
   privacy, and it keeps files nearer — but the laptop-closed problem stays, and
   it asks a normal person to install Docker.
2. ~~**Does the box replace `claidor-maty-runner`, or sit beside it?**~~
   **Answered 18 September: neither.** Its queue is kept and its executor becomes
   a box, so a routine and an interactive turn run on one substrate. The read and
   the decision are in `docs/product/box-substrate-read.md`.
3. **Per-agent desktops from day one?** The spec has one machine with a desktop
   per agent — forked X displays, one `computerUse` at a time per desktop. One
   shared desktop is simpler and visibly worse when two agents work at once.
4. **Delete the Windows `computerUse`?** It cannot run on a Mac and carries the
   Chinese banner. My recommendation is to delete it in the same change that
   builds the real one, rather than leave a second thing called computerUse.

### Substrate: E2B — locked 18 September 2026

The founder: *"i did mean e2b. lets lock e2b. we're review the 30 days claim in
due time."*

**The box runs on E2B.** That answers question 1's *where*, and reframes rather
than removes its *what it costs*. The 30-day question below is deferred, not
dismissed, and it is the one thing that could unpick this.

**What the box needs from a substrate**, taken from the spec: persist a
filesystem and browser logins across turns and days; resume fast enough that a
message does not stall; a real Linux desktop with mouse, keyboard and a
watchable stream; per-user isolation; and a snapshot/restore pair to implement
Update and Reset.

**E2B, as documented in September 2026:**

- Pause saves **filesystem and memory** — running processes and loaded
  variables included. Resume is about **1 second**; pausing costs about
  **4 seconds per GiB of RAM**.
- While paused, **compute billing stops** and only storage accrues.
- It offers a screen — mouse, keyboard and a live stream — aimed at
  computer-use agents, which is the spec's desktop requirement.
- Compute is about **$0.0504/vCPU-hr and $0.0162/GiB-hr**, billed per second
  (rates quoted for April–June 2026). A 2 vCPU / 4 GiB box is roughly
  **$0.17/hour while awake**.

**Two catches, and the first is load-bearing:**

1. **Paused sandboxes appear to be auto-deleted after 30 days.** Sources
   conflict — E2B's own persistence page is quoted as saying paused sandboxes
   are kept indefinitely with no TTL, and several third-party write-ups say
   30 days. **Deferred by the founder, to review in due time**, and it must be
   verified against E2B directly rather than a blog. It matters more than the
   price: our box holds the person's browser logins, and a dormant user losing
   theirs silently is the kind of failure that ends trust. If it is real the fix
   is probably a keep-alive that resumes each box monthly, which is cheap — so
   this is a thing to know, not a thing to fear.
2. **Awake time is the cost, and it is per user.** At ~$0.17/hour, a person
   whose agents work two hours a day is roughly $10/month in compute alone,
   before a single token. That is the standing cost question from (1) above, now
   with a number on it.

**EC2 is the wrong shape** for this, if that was the question. It gives raw
VMs; every part the spec needs — pause/resume with memory, snapshot, "move to a
fresh instance keeping files and logins", a desktop stack, per-user
provisioning — is a lifecycle layer we would build and operate ourselves. Stopped
instances do keep an EBS volume cheaply, so it is *possible*, but it is
months of infrastructure to arrive where a sandbox provider starts.

**Others in the same category**, named but not evaluated: Modal, Daytona,
Northflank, Blaxel, Beam, Morph, Vercel Sandbox. Worth a comparison when the
decision is live; not worth one before.

**What this changes:** question 1 stops being "hosted box versus Docker on the
person's Mac" and becomes "at what awake-hours per user". It also makes the
question cheap to answer for real — one box, one agent, one afternoon, measured
rather than argued.

### What the lock decides on its own: the server brokers the box

This follows from the lock plus a rule the founder already set, so it is not a
new decision so much as an unavoidable consequence — but it decides where the
work goes, so it is written down.

The founder, 16 September: *"my users should never put a key. everything happens
under the hood. not a setting."* So the E2B key is **Claidor's**, not the
person's. And a key that ships inside an Electron app is a key that is published:
anyone with the app has it, and one extracted key bills every box we run.

**Therefore the desktop app never talks to E2B.** `server/polar/desktop/` brokers
the box exactly as it already brokers the models: the key stays on the server, the
app authenticates with its existing desktop session token, and the server creates,
pauses, resumes and kills boxes on the person's behalf and meters what they use.
This is the shape that already exists twice — the metered model proxy, and
Composio's key in `polar/connectors/`. It is not a new pattern to invent.

What that implies, and none of it is built:

- a box record per account on the server, with its E2B sandbox id and state;
- routes to ensure-a-box, pause it, resume it, and recover it (Update / Reset);
- metering of awake seconds against the same account the models bill to, since
  the box is the first thing this product sells that costs money while idle;
- the app holding only an opaque handle and a stream URL, never a key.

**The open question this raises**, and it is a real one: the agent process runs on
the person's Mac, and the box is in E2B. Every Shell call, every Screenshot, every
`computerUse` click is a round trip from their laptop to a pod. Grok Bot does not
have this problem — its agent runs beside the box. Whether our engine drives the
box acceptably from the other side of the internet, or whether the agent itself
eventually has to move, is the thing to measure first and the thing most likely
to change the architecture.

### Answerable by reading, before anything is built

- What does OpenClaw's `sandbox.mode: 'all'` actually provision — a container,
  a chroot, a VM? Is it a candidate substrate for the box, or unrelated?
- Does the engine's browser `target: "sandbox"` reach that same sandbox?
- What does the maty runner actually do today, end to end?
- Does E2B's own documentation say paused sandboxes survive past 30 days? The
  answer decides whether a hosted box can hold a login at all.

### Deliberately not yet asked

The desktop stack (xvfb / x11vnc / noVNC / xfwm4 / picom), `box-doctor`'s check
list, and the Update-versus-Reset semantics are all well specified in the
sources and are implementation once the substrate is chosen. There is no point
designing them before question 1 is answered.

---

# Part Two — The measurement, and what was built on it

**18–19 September 2026. Read the note directly below before anything else.**

## 0. Where the thing this describes actually is

Part One above ends on a question: *whether our engine drives the box
acceptably from the other side of the internet.* Part Two answers it, and then
describes a build.

**That build is not on this branch and never will be.** It is on
`claude/caisra-box`, PR #126, written against the OpenClaw engine that
`desktop/` carried until the re-founding on the Grok Bot 0.18 reconstruction.
Every file path in §8's table — `desktop/openclaw-extensions/box/`,
`desktop/src/main/box/` — refers to that branch, not to `main`. The engine
those files plug into is gone from the product.

So why land this document at all, when the code it describes is superseded?

**Because the measurement is not.** §5 measured how the engine behaves when its
sandbox is on the far side of a network: the round trips each operation costs,
and that cost is exactly trips × RTT because nothing pipelines. §3 found that
the default filesystem bridge reads through to the *host* disk, and that the
sandbox browser is not behind the backend interface at all. §6 found that the
app's own token proxy cannot carry a WebSocket. **§9 is a server route
contract that names no engine.** None of that depends on which application
shell the product ships. All of it would otherwise have to be discovered
again, by someone, the expensive way.

`docs/product/measurements/` holds the scripts, so the numbers can be re-run
rather than believed.

**Two claims in what follows are no longer true of `main`, and are left in
place rather than quietly edited, because they were true when measured:**

- §8's inventory describes files on PR #126.
- §10's handoff asks the Brief agent to fix a sentence in a browser brief that
  the re-founding removed.

Everything else stands as measured.

## 0a. A correction, and where the sources actually were

The first version of this half opened by reporting that four of the five
documents I had been told to read did not exist. I had searched properly — `ls`
on each path, `find` over four stems, `grep -rl`, and `git log --all
--diff-filter=A` across every branch in my clone — and found nothing.

**Three of them did exist**, on `claude/caisra-mac-app-ouliez`, a branch this
session was cut before and which my clone therefore did not have:
`sources/grok-bot-agent-computer.md`, `sources/grok-bot-debugging-the-box.md`,
and `cards-plan.md`. They are here now, merged, and Part One is built on them.
`box-substrate-read.md` still does not exist anywhere.

The search was sound and the conclusion was wrong, which is worth keeping rather
than quietly deleting: **"not in this repository" and "not on this branch" are
different claims, and only the second one was ever checked.** A `git log --all`
only sees the refs the clone has.

What this did *not* change: box-doctor was built from a checklist relayed in a
message rather than from `grok-bot-debugging-the-box.md`. Now that the file is
here, §10 checks the build against it.

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

---

## 8. What is built, and what has never run

Built on 18 September, all of it in this branch.

| Piece | Where | Verified by |
| --- | --- | --- |
| The box as an engine sandbox backend | `desktop/openclaw-extensions/box/` | 7 integration tests driving it through the engine's own `resolveSandboxContext` |
| The exec bridge that stands in for a process | `…/box/execBridge.mjs` | 14 tests spawning the real bridge against a local HTTP broker |
| Broker client | `…/box/brokerClient.ts` | 17 tests against a fake fetch |
| Turning the sandbox on | `desktop/src/main/libs/boxSandboxSettings.ts` | 11 tests |
| box-doctor | `desktop/src/main/box/doctor.ts` | 17 tests, including the generated script run through a real shell |
| File custody guards | `desktop/src/main/box/custody.ts` | 17 tests |
| Update / Reset | `desktop/src/main/box/operations.ts` | 11 tests |
| The seven IPC calls | `desktop/src/main/ipcHandlers/box/` | 16 tests through the bridge itself |

**Never run, and this is the important row.** Nothing has contacted E2B or the
Caisra server. This container refuses both — `api.e2b.dev` and
`api.claidor.com` are denied by its egress proxy, which I checked rather than
assumed (`curl` returns `http=000`; the proxy's own status log names
`connect_rejected … api.e2b.dev:443`). **No pod has ever been started, no
broker route has ever answered, and the box has never been driven by a real
agent turn.** Every test above replaces the broker with a fake. They prove the
code does what it says against a contract; they cannot prove the contract
matches what the server will actually serve.

The first person with a Mac and a running server should expect the first
attempt to fail somewhere in §9's contract, and should read the gateway log
line `[EngineConfigSync] sandbox mode: …` — it now says *why*, not just what.

**Also not done:** the browser in the box (§3c — it needs engine changes
outside the plugin surface), and interactive terminal sessions (§6 — the
account proxy cannot carry a two-way connection).

---

## 9. The routes the server needs to serve

**For the Server agent. I do not touch `server/`.**

Everything sits under `/api/proxy/box/…`, because the app reaches the server
through the local token proxy, which prefixes `/api/proxy` and injects the
account's bearer (§6). **The sandbox credential stays on the server. The app
never sees it, and no route may return it.** Every route is scoped to the
account the token belongs to; a box id from one account must be invisible to
another.

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| POST | `/box/sandboxes` | `{scopeKey, template?}` | `{boxId, running, template, createdAtMs, workspaceDir, agentWorkspaceDir}` |
| GET | `/box/sandboxes/{boxId}` | — | same shape |
| DELETE | `/box/sandboxes/{boxId}` | — | 204; a 404 is fine and is treated as already gone |
| POST | `/box/sandboxes/{boxId}/shell` | `{script, args[], stdinBase64?}` | `{stdoutBase64, stderrBase64, exitCode}` |
| POST | `/box/sandboxes/{boxId}/exec` | `{command, workdir?, env{}, pty, stdinBase64?}` | **streamed NDJSON**, see below |
| PUT | `/box/sandboxes/{boxId}/file` | `{path, contentBase64}` | 200 |
| GET | `/box/sandboxes/{boxId}/file?path=` | — | `{contentBase64}` |
| POST | `/box/sandboxes/{boxId}/update` | — | the new `{boxId, …}` |
| POST | `/box/sandboxes/{boxId}/reset` | — | the new `{boxId, …}` |
| GET | `/box/machines` | — | `{machines: [{id, kind, label, state, template, createdAtMs}]}` |

**`/exec` is the one with sharp edges.** One JSON object per line,
`Content-Type: application/x-ndjson`:

```
{"t":"stdout","d":"<base64>"}
{"t":"stderr","d":"<base64>"}
{"t":"exit","code":0}
```

or `{"t":"error","message":"…"}` when the command could not be run at all.

Four things it must do, each because the bridge depends on it:

1. **Flush every frame as it happens.** Buffering until the command ends turns
   a three-minute build into three minutes of silence, and the agent cannot
   tell that from a hang.
2. **Always send an `exit` frame.** A stream that ends without one is treated
   as a failure, on purpose — reporting success when the box never said how the
   command finished would be a lie the agent then acts on.
3. **Kill the command in the box when the client disconnects.** That
   disconnect is how an aborted tool call reaches the box; without it, an
   abandoned command runs on, billing.
4. **`pty: true` may be refused.** The bridge already refuses it before
   connecting (§6), so the server never needs to support it — but it should not
   pretend to.

**`/box/sandboxes` (POST) is ensure, not create.** Given the same account and
`scopeKey`, it must return the box that is already running rather than starting
another. `scope: "shared"` means one box for every agent, and each accidental
extra box is a second bill.

**Two things the plugin has no way to do and the server must.** Keep the box
alive while it is in use — E2B sandboxes die on an idle timeout, and the person
should not lose their session because the agent was thinking. And take the
snapshot that `/reset` restores from; the plugin only asks for the restore.

**`workspaceDir` in the answer is not decoration.** The plugin treats its own
`/home/user/workspace` as a default and prefers whatever the broker names,
because the broker started the template and is the one that knows. A
non-absolute answer is ignored rather than guessed at.

---

## 10. Checked against the spec, once it arrived

`sources/grok-bot-agent-computer.md` and `sources/grok-bot-debugging-the-box.md`
came with the merge, after the build. Four things in the build disagreed with
them, and all four were changed to follow the spec rather than the other way
round.

**The filesystem layout.** The box keeps its scratch and working tree at
`/workspace` and its profile, memory and agent data at `/home/box` (§3). I had
guessed `/home/user/workspace` and `/home/user/agent`. Corrected; they remain
defaults the broker can override.

**Where a copy lands.** `CopyToBox` defaults to `/workspace/uploads`, which the
spec names (§4.2). I had dropped files straight into the workspace root. That
is worse than untidy: files the person handed over, loose among the agent's own
working files, is how custody stops being legible to either of them.

**box-doctor's check list and output.** The spec's list is canonical and I was
missing **Chrome file-descriptor pressure**; my screen check tested whether
`DISPLAY` was set rather than whether the spec's display `:1` answers
`xdpyinfo`. Both fixed. More importantly the output shape is
`[box-doctor] PASS|FAIL <name>: <detail>` with a final `SUMMARY`, left at
`/tmp/box-doctor.log` — **and that is an interface, not our private business**,
because the spec has the agent run `box-doctor` over Shell and read that log
itself. The script now decides PASS or FAIL inside the box and writes that log;
it has to, or the log the agent reads would hold no verdicts. The one thing the
box cannot know by itself is what time it is *here*, so this Mac's clock is
passed in. Our own report keeps a third state, `warn`, for an old Chrome or a
small clock drift; the log line stays PASS, because the documented shape has
only two.

I also added the runtime check the debugging doc leads with — `/.dockerenv`
present means a local Docker container, absent means a brokered pod — because
it decides where someone looks next.

**Two real bugs came out of writing those checks honestly, and both would have
made box-doctor lie:**

1. **`pgrep -f` matched the doctor itself.** It scans whole command lines, and
   the doctor's own command line names every process it hunts for. x11vnc,
   noVNC and the compositor all reported *running* on a machine where none of
   them was. The fix is the bracketed first letter (`'[x]11vnc'`), which cannot
   match the literal in the script that contains it. There is a test that runs
   the script from a file, in a clean process tree, and fails if any of the
   three passes here.
2. **The scratch file was a fixed path.** Two doctors running at once — the
   startup check and a person pressing the button — appended to and counted
   each other's lines, and both reports came out wrong. It is per-process now.

**Still not built from the spec**, and named rather than quietly skipped:
`request_box_help` (handing the person a manual step on a working desktop, for
a login or a captcha), the `computerUse` / `browserUse` subagents, and the
per-agent desktops. The last two need the box's desktop, which is §3c's
blocker, not an omission.

**One handoff for the Brief agent.** Part One says the browser brief needs
rewriting: it currently tells the agent *"Do not use `target="sandbox"` or
`target="node"`: there is no sandbox and no other machine in this product."*
The first half of that is now false — there is a sandbox, and a box. The second
half should stay true until §3c is solved, because the box's browser is not
reachable yet. That sentence is the Brief agent's to change, not mine.
