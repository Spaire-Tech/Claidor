# Staffing: who builds what, and how they stay out of each other's way

18 September 2026. The founder: *"they should never intertwine with each other,
so its always specific to the agent."*

**Eight agents.** Six can start now, one starts now but is gated on a key and a
finding, one waits for the founder's designs.

---

## The rule that makes this work: one file, one owner

Agents do not collide over *features*. They collide over *files*. So ownership
below is by path, not by topic, and every path has exactly one owner. An agent
that needs a change in someone else's file **asks for it** rather than making it.

Two files are wanted by nearly everybody, and both are handled explicitly:

- **the brief** — see Task Zero;
- **`desktop/scripts/patches/`** — one owner (Engine), because two agents
  patching the same vendored source is how a build stops reproducing.

## Task Zero, before anyone starts in parallel

**Extract the brief out of `openclawConfigSync.ts`.**

That file is 5,191 lines. The 21 managed-prompt constants are spread from line
365 to line 2,355, interleaved with the engine config sync — models, plugins,
sandbox mode, MCP servers. The Brief agent wants the prompts. The Box agent wants
`mapExecutionModeToSandboxMode` and the plugin entries. Cards and Files want rule
lines. That is four agents in one file on day one.

So first, one agent moves every `MANAGED_*` constant and every `buildManaged*`
into `desktop/src/main/libs/brief/`, leaving `syncAgentsMd` importing them. No
text changes, no behaviour changes, and the existing tests
(`briefConsistency.test.ts`, `openclawConfigSync.runtime.test.ts`) must pass
untouched — that is what proves it was a move.

`desktop/CLAUDE.md` asks for exactly this before structural work: *"propose a
focused extraction/refactor plan… Proceed with the refactor only after the
developer confirms."* This is that proposal. It is also what makes the brief
readable enough to triage.

**Nobody starts until this lands.** It is a day at most and it prevents the
whole class of problem.

---

## The eight

### 1. Brief — the agent's instructions
**Owns:** `desktop/src/main/libs/brief/**` (after Task Zero),
`shared/agent/chiefOfStaff.ts`, `shared/agent/voiceBrief.ts`,
`briefConsistency.test.ts`, `upstreamBrief.ts`.
**Nobody else writes a word the model reads.**

- The triage we agreed: every rule keeps its place only if it can name the
  incident in `review.md` that produced it. 81 numbered incidents; a rule that
  cannot cite one is somebody's theory, and the theories are what have been
  wrong.
- Every rule the other seven need — the box rules, the card rules, priority,
  file rules. They send the sentence; this agent places it and guards the
  one-owner axis.
- The brief lost ~26,000 characters with OpenUI, so it is around 48,000 now.

**Starts now.** Blocked by: Task Zero.

### 2. Box — the E2B computer
**Owns:** `desktop/openclaw-extensions/e2b-*/**`, box IPC under
`desktop/src/main/ipcHandlers/box/`, `docs/product/agent-computer-plan.md`.
The founder: *"the computer eb2 is a change on its own."*

- **First job is a measurement, not a build:** register a trivial sandbox
  backend and see whether the engine will hold a session on one. That answers the
  question that could change the whole architecture — our agent runs on the Mac
  while the box is in E2B, so every Shell call is a round trip. Grok Bot does not
  have this problem; its agent sits beside its box.
- Then the E2B backend itself. The read said the backend is a plugin registry
  (`registerSandboxBackend`), the contract is small (`buildExecSpec`,
  `runShellCommand`, an fs bridge, `capabilities.browser`), and the two shipped
  backends are 151 and 306 lines.
- Verify the 30-day paused-sandbox claim **with E2B directly**, not a blog. Our
  box holds the person's logins.
- Delete the Windows `computerUse` (1,195 lines, NetEase CDN, Chinese banner) in
  the same change that builds the real one.

**Starts now** on the measurement. The build needs an E2B key in Render's
environment — the founder's.

### 3. Server — Python, and the metered edge
**Owns:** `server/**`, `runner/**`. Touches no desktop file, ever.

- **The image route.** This is the highest-value single task on the board:
  images are dead until it exists. `GET /desktop/api/media/images/models` returns
  404 today. Mirror the speech route at `endpoints.py:1046`, add a pricing entry,
  meter it like every other call.
- Box brokering: a box record per account, ensure / pause / resume / recover,
  awake-seconds metering. The app must never hold the E2B key.
- maty: keep the queue, swap the executor to a box, then relax the tool policy —
  the reason a routine cannot browse is the missing sandbox, not a risk decision.

**Starts now** on the image route. Box routes follow the Box agent's findings.

### 4. Engine — patches to the vendored runtime
**Owns:** `desktop/scripts/patches/**` and nothing else. Sole patcher.

- **Priority for `sessions_send`.** Read first: what the engine does today when a
  send reaches a busy agent. If it queues, priority is a queue-order flag; if it
  always interrupts, then `false` is the new behaviour and the risk runs the other
  way. Then the patch: the schema param plus lane behaviour.
- Any patch another agent needs, by request.

**Starts now** on the read.

### 5. Cards — the fourteen families
**Owns:** the card components in `renderer/design/thread/` (Choice, Auth, Secret,
Roster, Connector and new ones), `shared/askInput/**`, the card MCP servers in
`main/libs/`.

- Build the five that do not depend on the computer: **Choice**, **Secret**, the
  form's **typed fields**, **draft composer**, **routine confirm**.
- The room-creation tool (agent may make a room: ids not names, own id to post,
  six members, never empty, no delete tool, never speculatively).
- **Designs its own UI and does not wait.** The founder: the UI agent will
  re-draw it later from their design. So make it work, make it plain, do not
  gold-plate.
- Waiting on the box: box handoff, cookie-origin, the permission surfaces, and
  the form's fill targets.

**Starts now.**

### 6. Files — attachments, documents, images in the thread
**Owns:** `thread/attachment.ts`, `thread/FileCard.tsx`, `thread/parts.ts`,
`thread/types.ts` file kinds, `shared/thread/links.ts`.

- **The defect first:** an image named inside a sentence renders as a paperclip.
  `peelAttachments` only takes link-only lines from the end of a reply, so
  *"here's the chart [chart.png](…) — revenue is flat"* shows a chip where the
  picture should be. This bites the first illustrated answer after the image
  route lands.
- `alt` on `AttachmentItem`: always written by the agent, never shown on hover.
- Three new kinds — archive, video, audio — with `.md`/`.json`/`.txt` folded into
  one Text kind. **Blocked on four drawings from the founder**; ship the kinds
  first and let them fall back to the paperclip, which still improves the label.
- Files in rooms: a named test, because it is already the behaviour and should be
  deliberate.
- A size limit, before files cross to a box.

**Starts now.** Partly blocked by: artwork.

### 7. Verify — make claims testable
**Owns:** `desktop/harness/**`, the eval harness port, and the job of running
things.

This repository's repeated failure is not bad code, it is unverified claims — the
browser has never been run, the Mac tasks were called missing while tested and
working, images were "fixed" while structurally impossible.

- Port the fork's eval harness (`rakazo/docs/agent-verification.md` at
  `34325164`): the real agent loop against a local model fixture, offline, graded
  on effects over three trials. Its rule is the founder's own — **missing
  credentials mean not run, never a pass.**
- Then point it at the brief rules, so "does this rule work" stops being an
  argument. Eight agents writing rules with no measurement is how we got here.
- Run the browser once and settle what `[EngineConfigSync] browser profile=…`
  says. Nobody has.

**Starts now.**

### 8. UI — the look, last
**Owns:** `renderer/design/` visual layer — tokens, layout, the Spatial Light
shell, and the screens the founder re-draws.

The founder: *"i will personally send a ui agent a design to change what they
did"*, and *"i need a ui agent who will work once everything is done, and once i
send them the design."*

So this agent is **idle until two things are true**: the feature work has landed,
and a design has arrived. Its queue already has:

- re-draw whatever Cards shipped;
- the computer: Settings → Computers, Update / Reset, the live desktop preview;
- **agent-to-agent visibility** — Grok Bot puts the traffic in the transcript,
  which needs a **tenth thread kind**, and that list is closed, so it is the
  founder's decision each time;
- the file kinds' four drawings.

**Waits.**

---

## What each is blocked by, at a glance

| Agent | Can start | Blocked by |
|---|---|---|
| Brief | after Task Zero | — |
| Box | now (measurement) | E2B key for the build |
| Server | now (image route) | Box findings for box routes |
| Engine | now (read) | — |
| Cards | now | the box, for 4 of 14 |
| Files | now | 4 drawings, for the icons |
| Verify | now | — |
| UI | — | everything, then a design |

## Where two agents must talk, and how

Not intertwining is not the same as not coordinating. Three seams exist and each
has a direction:

1. **Anyone → Brief.** Send the sentence; Brief places it. Never edit brief text.
2. **Box → Server.** Box establishes what E2B needs; Server builds the routes.
   Box never opens a Python file.
3. **Cards / Files → UI.** They ship working and plain; UI re-draws from the
   founder's design. UI never changes behaviour, only how it looks.

## The one I would start today

**Server, on the image route.** It is self-contained, it is in a language no
other agent touches, and images are the thing the founder has asked about twice
and been told was fixed twice. Everything else can begin the same day, but that
one closes an open wound.
