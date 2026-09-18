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
2. **Does the box replace `claidor-maty-runner`, or sit beside it?** The maty
   queue and the runner are deployed and live, and how complete they are has
   never been established. If the box is where routines fire when the Mac is
   shut, they overlap.
3. **Per-agent desktops from day one?** The spec has one machine with a desktop
   per agent — forked X displays, one `computerUse` at a time per desktop. One
   shared desktop is simpler and visibly worse when two agents work at once.
4. **Delete the Windows `computerUse`?** It cannot run on a Mac and carries the
   Chinese banner. My recommendation is to delete it in the same change that
   builds the real one, rather than leave a second thing called computerUse.

### Answerable by reading, before anything is built

- What does OpenClaw's `sandbox.mode: 'all'` actually provision — a container,
  a chroot, a VM? Is it a candidate substrate for the box, or unrelated?
- Does the engine's browser `target: "sandbox"` reach that same sandbox?
- What does the maty runner actually do today, end to end?

### Deliberately not yet asked

The desktop stack (xvfb / x11vnc / noVNC / xfwm4 / picom), `box-doctor`'s check
list, and the Update-versus-Reset semantics are all well specified in the
sources and are implementation once the substrate is chosen. There is no point
designing them before question 1 is answered.
