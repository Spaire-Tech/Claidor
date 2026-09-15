# Sources

Documents the founder hands over as **source of truth**. They are kept
verbatim. Nothing in this folder is mine.

| File | What it is | Given |
|---|---|---|
| `grok-bot.md` | Grok Bot's full product contract, builder-facing | 15 Sep 2026 |
| `grok-bot-chat.md` | How the bot is built (prompt stack, guardrails) and how chat is configured | 15 Sep 2026 |
| `grok-bot-app-ui.md` | The verified UI map the agent is given so it never invents a click-path | 15 Sep 2026 |
| `grok-bot-agent-reference.md` | The whole agent contract in one page: identity, voice, autonomy, safety, surfaces | 15 Sep 2026 |
| `grok-bot-agent-system-contract.md` | The full builder-facing contract, §§1–32 with both appendices | 15 Sep 2026 |

The fifth is answered by a document of ours in the same shape:
`../agent-contract.md`, which carries the section-by-section audit
(live / partial / missing / not ours, each tied to a file) and is the
list to work from. **The "What is still not built" section at the end
of this file predates most of a day's work and is kept as a record of
the reading, not as the list.** Where the two disagree, the contract is
current.

The founder's instruction with the first one: *"keep it in our repo as a
source of truth. we building exactly that."*

This README is the only editorial layer: what each source maps onto in
our tree, and where a source disagrees with something else the founder
has already decided. Disagreements are written down, never resolved
quietly.

---

## grok-bot.md — read against our tree

Checked on 15 September by listing the modules, not from memory. **A
module existing is not a claim that it works**; every "have" below means
the code is in the tree, nothing more.

### Already ours, and the doc confirms the shape

| Grok Bot | Ours |
|---|---|
| Settings: General / Computer / Usage & Billing / Updates | the same four, shipped — `design/settings/rows.ts` |
| Settings opened from the account button, no gear icon | the same — `design/shell/AccountMenu.tsx` |
| Choice cards, multi-select, custom free text | `design/thread/fromEngine.ts` → `ChoiceItem` |
| Attachments, images inline | `userAttachment` tab + thread parts |
| Auto-review on risky calls | our three exec policies — *ask / check-then-ask / allow* |
| Per-agent info pane: computer preview, routines, channels, members | the five agent tabs, behind the computer icon |
| Live preview of the agent's computer | `AgentBrowserInAppPanel.tsx` |
| Subagents (executor, computerUse) | `openclaw/src/agents/tools/subagents-tool.ts`, `subagents` panel tab |
| SendToAgent, CreateAgent, channels | `sessions-send-tool.ts`, `sessions-spawn-tool.ts`, `agents-list-tool.ts`, `openclaw/src/channels/` |
| Routines: cron + event listeners | `openclaw/src/cron/`, `cron-tool.ts`, `desktop/src/scheduledTask/` |
| Memory tiers and scopes | `openclaw/src/memory/`, our memory-bundle sync |
| Skills as a global library; demonstration → skill | `openclaw/src/skills/`, `skill-workshop-tool.ts` |
| Connectors as MCP plugins with a catalogue | `server/polar/connectors/` (Pipedream), `main/mcp/mcpStore.ts` |
| Secret requests — masked capture, never in chat | `openclaw/src/secrets/` |
| Voice memos | `openclaw/src/tts/`, `tts-tool.ts` |
| Reactions (tapbacks) | `openclaw/src/channels/ack-reactions.ts` |
| Image generation on request | `image-generate-tool.ts` |
| Web search / fetch, SSRF-guarded | `web-search.ts`, `web-fetch.ts` |

The read: **this document describes, feature for feature, an engine we
already vendor.** Most of what Grok Bot sells is sitting in
`openclaw/src/` unused. That is the most valuable thing in the file — it
is a map of what to surface, not a list of what to write.

### Genuinely new to us

- **Chief of Staff** — a fleet-managing agent that creates teammates and
  escalates to the person. We have the tools; nothing plays that role.
- **Group rooms with seated members** and room-specific turn rules.
- **Threaded replies** for bulk, key results kept in the main chat.
- **Reference chips** linking back to earlier messages.
- **Deep links into settings rows**, so the agent can point at a control.
- **Projects** as a memory and collaboration scope.
- **The escalation order**, written down:
  context → connector → web → signed-in browser → desktop GUI → ask.
  We have every step and no stated order.
- **Event listeners** for routines (Slack, GitHub, Linear, Sentry,
  PagerDuty, webhooks). Ours are cron only.

### Where it contradicts the founder's own direction

**`grok-bot.md` §4.1 — the box.** A persistent Linux machine the agent
owns, per-agent desktops on it, `/workspace`, packages installed,
`CopyToBox` / `CopyFromBox`, Update and Reset.

`docs/product/direction.md` §10 strikes exactly this, in the founder's
own words — *"there is no 'which computer' — that was a design mistake
by me. same for the cloud computer"* — and names Grok Bot as the thing
we differ **from**:

> Grok Bot copies your file to its own disk and copies it back — its
> words, "my computer ≠ your disk … we copy when needed" — and we open
> the file where it lives. […] Anything that reintroduces a machine the
> agent owns takes that sentence away from us.

Both are the founder's. They cannot both be built. Put to them the same
day, and **settled**:

> *"no box. keep direction.md's line."*

So `direction.md` §10 stands and `grok-bot.md` §4.1 is read as
background on a competitor, not as a specification. Nothing builds a
box, a machine registry, or a copy-to/copy-from. The sentence that
survives is the differentiator: **we open the file where it lives.**

Two smaller ones, same standing:

- **§4.2 registered user computers with `machineId`** — struck by the
  same section of `direction.md`.
- **§10 "repository work goes to a Cursor cloud agent"** — Cursor's
  product, not a capability we have or can borrow.
- **§2.1 "Sign In with Cursor"** — ours is the Claidor account.

---

## grok-bot-chat.md — read against our tree

The second source. Where the first was a feature map, this one is a
**behaviour contract**: what the agent is told, in what order, and what
chat is allowed to contain. Checked against our files on 15 September.

### The message vocabulary agrees with the founder's, exactly

`direction.md` §2 fixes five kinds and calls the closed list "the
discipline that makes the app feel unlike an AI app". Grok Bot's
delivery primitives are the same set, arrived at independently:

| `direction.md` §2 | `grok-bot-chat.md` §10 |
|---|---|
| `text` | `type: text` (with `images[]`) |
| `choice` | `type: widget` — *"ends the turn"* |
| `auth` | Auto-review / local-execution approval card |
| `system` | the centred grey line |
| `status` | progress beats between ack and result |

Ours are already built and typed — `design/thread/types.ts:19–25`. Two
additions the doc has and we do not: `type: attachment` as a message in
its own right, and `type: secret-request`.

And §2.2 — *"prefer multiple short bubbles over one dense memo"* — is
the founder's *"the text come like texts. not ai"* (`direction.md` §3),
which we ship as at most three parts, 420 ms apart.

### The real find: our managed prompt has the rules and none of the voice

**Correction, written the same day.** I first recorded that our managed
prompt had "three sections and no more". That was wrong — I grepped for
the three I had edited rather than for the constant. It has **seven**,
plus a workspace preamble, all in
`desktop/src/main/libs/openclawConfigSync.ts`:

| Section | Covers |
|---|---|
| `MANAGED_WEB_SEARCH_POLICY_PROMPT` | which tool to reach for; never claim to have searched |
| `MANAGED_BROWSER_POLICY_PROMPT` | `target` vs `profile`, the built-in browser |
| `MANAGED_EXEC_SAFETY_PROMPT` | delete ops, question cards, commands |
| `MANAGED_DELIVERABLE_LINKS_PROMPT` | link every output file by absolute path; keep scratch out |
| `MANAGED_MATH_FORMAT_PROMPT` | TeX in app chat, plain text on IM channels |
| `MANAGED_MEMORY_POLICY_PROMPT` | write the file *before* saying you will remember |
| `MANAGED_HEARTBEAT_POLICY_PROMPT` | `HEARTBEAT_OK` and nothing else when there is nothing |
| `FALLBACK_OPENCLAW_AGENTS_TEMPLATE` | the AGENTS.md workspace preamble |

So the gap is not size. It is **kind**. Every section we have is a rule
about a *tool*. Not one of them is about how the agent *talks* — and
that is the entire complaint.

Two of the rules I listed as missing are in fact partly there:
`HEARTBEAT_OK` is the silence rule for heartbeats (not for cron
routines), and the memory-write rule is stricter than Grok Bot's.

`grok-bot-chat.md` Part I is, almost section for section, the part we
never wrote:

| Missing from our prompt | Source |
|---|---|
| Reply-first on a person-opened turn | §2.1 |
| Ack ≠ delivery — the result must still be sent | §2.1, §6 |
| Progress beats at meaningful moments, not per command | §2.1, §6 |
| Tone: contractions, lead with the result, 1–2 sentences, no "Certainly" | §2.2 |
| Autonomy default — decide and proceed; state assumptions | §2.3 |
| Subagent opacity — never say "executor", speak in first person | §2.8 |
| Fabrication ban — no invented metrics, menus or click-paths | §3.7 |
| Stay silent on stale or duplicate background results | §2.5, §6 |
| A routine that finds nothing ends with no message at all | §6 |

This is the cheapest work in either document: the file is a list of
strings, the sections are written, and the behaviour the founder has
complained about most — the agent going quiet, or narrating every
command, or inventing an explanation — is what they address.

Our §2.4 equivalent already exists and is already fixed: the question
card was rewritten on 15 September so it is *"how you ask the user
anything that has a small set of answers … it is not a fallback"*, which
is this document's rule in our words.

### Already ours

Confirmed by file, not memory.

| Contract | Ours |
|---|---|
| Choice cards: 1–6 options, multiSelect, free text, ends the turn | `design/thread/fromEngine.ts` — `AskUserQuestion` → `ChoiceItem` |
| Never use a widget to confirm a tool with its own review UI | already in `MANAGED_EXEC_SAFETY_PROMPT` |
| Auto-review / approval card, one at a time | our exec policy + the auth card |
| Untrusted content is data, not instructions | `openclaw/src/security/` |
| Secret capture, never in chat | `openclaw/src/secrets/` |
| Reactions (tapbacks) | `openclaw/src/channels/ack-reactions.ts` |
| Voice memos | `openclaw/src/tts/` |
| Memory tiers and scopes, `instructions_update` | `openclaw/src/memory/` + our sync |
| Hidden cues: `[routine]`, `[agent]`, `[inbound]`, first run | our cron, `sessions-send-tool.ts`, channels |
| Markdown in answers | `design/thread/parts.ts` |
| Hidden chats, notify-on-updates | agent record fields |

### New to us

- **In-chat forms** (`request_user_form`) — a fillable card for a typed
  login, address or OTP, with write-only secrets. Nothing in
  `openclaw/src/agents/tools/` matches; `polls.ts` is the nearest and it
  is not the same thing. This is the one piece of chat UI in the
  document we would have to build from nothing.
- **Reference chips** — jump to an earlier message by address.
- **Deep-link pills** into settings rows.
- **Threading** — `reply_to` for secondary bulk under a TLDR.
- **"N new messages" jump control** when scrolled up. Directly implied
  by multi-bubble turns, which we already do.
- **The render matrix** (§11.5): widgets and cards do not exist in group
  rooms or external channels; text degrades terser. A rule we would have
  discovered the hard way.
- **Room turns invert reply-first** — work first, then send, and silence
  is a legitimate move.

### Not ours, and struck with the box

- `request_box_help` (§5, §14) — hands the box desktop to the user.
  There is no box. The fillable half (`request_user_form`) stands on its
  own and is worth having; the handoff half goes with §4.1.
- `type: cursor-agent` / cloud agent cards (§10.5) — Cursor's product.
- `[Sent from machine <id>]` provenance and machine-targeted approval
  (§3.3) — the machine registry, struck.

### Nothing here contradicts `direction.md`

Other than the three lines above, which are the box again. On
everything else the two documents agree, including the parts the
founder wrote before seeing this one.

---

## grok-bot-app-ui.md — read against our tree

The shortest of the three and the one with the clearest instruction to
copy. It is not a feature list: it is **a reference document handed to
the agent**, and the sentence at the top is the whole point —

> Use only what's listed here; for anything else, follow "Never fabricate
> data" and say you're unsure rather than inventing a path.

`grok-bot-chat.md` §3.7 names it: *"If unsure of a UI path, say so
(app-ui.md is the verified map)."* So the fabrication ban is not just a
rule in the prompt. It comes with the facts that make obeying it
possible.

### We have nothing like it

Our managed prompt (`openclawConfigSync.ts`) tells the agent about the
browser, the web, and commands. It says nothing at all about the app the
person is looking at. Asked "where do I turn that off", our agent has
no choice but to guess — and it does, confidently, which is the fault
recorded in `review.md` §22: three invented explanations for the
browser, none true.

### The version we should build is better than theirs, and cheaper

Theirs is hand-written prose, which is why it has to hedge: *"Some rows
exist only on some accounts, builds, or states; if the user cannot find
a row, say so."* That hedge exists because the document can drift from
the app.

Ours cannot drift, because our Settings is already data.
`design/settings/rows.ts` exports `settingsFor(tab, input)`, and every
row already carries the anchor id their document lists by hand:

| Tab | Our row ids |
|---|---|
| General | `sign-out`, `add-account`, `model-choice`, `model-api-key`, `memory` |
| Computer | `computer-name`, `exec-policy`, `working-directory` |
| Usage & Billing | `usage`, `refresh-usage` |
| Updates | `version` |

So the UI map is **generated from the same function that draws the
screen**, and a test asserts the two agree. A row that is conditional in
the app is conditional in the map, for the same reason, automatically.
That is a real advantage and it costs less than writing the prose.

### What carries over as-is

- **How settings open**: the account button bottom-left. Already ours
  (`design/shell/AccountMenu.tsx`), and already matching. Their "there's
  no gear icon" is our rule too.
- **Deleting an agent is permanent, from the sidebar, with a confirm, and
  is not in Settings.** No archive, no hide. A decision we have not made
  and should copy.
- **Two-click confirm** on a destructive row — "Click Again to Confirm"
  rather than a modal. Good pattern, no modal, fits the design.
- **Say so when the row is not there.** The honest failure mode.

### What does not carry over

- Everything in their Computer tab: registered machines, Update and
  Reset the box. Struck with the box.
- `update-computer` and `reset-computer` under Updates, same reason.
  Ours keeps Update Track and Check for Updates, which are about the app.
- "Sign In with Cursor" — ours is the Claidor account.
- Rows we have no feature behind: accent, microphone,
  hardware-acceleration, network-debugger, notification-sound, security
  keys, auto-review-rules. `rows.ts` already documents why they are
  absent; that decision stands and the map must describe the app we
  ship, not the app they ship.

### The action

1. Generate `docs/product/app-ui.md` from `settingsFor()`.
2. Inject it into the managed prompt as a fourth section, beside the
   browser and exec policies.
3. Test that the generated map and the rendered rows cannot disagree.

Do it after the Part I prompt sections from `grok-bot-chat.md`, not
before: the fabrication ban is the rule, and this is the evidence the
rule needs. Both belong in the same pass.

---

## grok-bot-agent-reference.md — read against our tree

The fourth source, and mostly a consolidation: §§4–16 restate
`grok-bot-chat.md` in one page. Recorded here is only what is **new in
this document**. (It skips from §17 to §19; there is no §18 in what was
given, and none has been invented.)

### New, and worth taking

**§1 — first run depends on the description.** *"If the profile
description is a concrete assignment, skip getting-started questions and
begin the assignment."* A role agent arriving with a job should start
the job, not interview you. We have the pieces — kits carry a role, the
agent record carries a description — and no rule joining them.

**§2 — the list of what never reaches the person.** Message ids, tool
names, system reminders, hidden turns, infrastructure state,
send/no-send reasoning, and *"executor/todo/subagent jargon"*. This is
the same fault as `review.md` items 15 and 21, stated as a prompt rule
instead of a rendering fix. Ours is half-solved: the thread drops raw
blobs, but nothing stops the agent *narrating* them in its own words.

Their §2 also fixes vocabulary — say **my computer**, never *the box*.
We need the opposite rule for the same reason: never say *the agent's
sandbox*, *the host*, or *the gateway*. The founder has been shown all
three.

**§13 — precedence.** *"Agent memory wins over conflicting shared user
facts when curated for role."* We sync shared memory and have no rule
for what happens when a role agent's note contradicts it. That is a
question our memory bundle will hit.

**§20 — reference docs live on disk and are named.** Not prose in the
system prompt: files (`app-ui.md`, `debugging-the-box.md`) at a known
path, with a "when to read" column. That is the delivery mechanism for
the UI map, and it is better than pasting it into every turn.

Ours has a home already: `resolveSkillCreationPath()` in
`openclawConfigSync.ts` resolves `~/Library/Application
Support/Caisra/SKILLs`, and the engine reads skills from there. A
`reference/` sibling, listed in AGENTS.md with the same "when to read"
table, is the same pattern without inventing anything.

Their second file, `debugging-the-box.md`, has no equivalent for us and
should not get one — but its *shape* should. When the built-in browser
fails, the agent invented three explanations (`review.md` §22). A
`reference/when-things-fail.md` naming the log directory and what to
read would have ended that in one turn.

### Already ours, and better

**§17 showing work** — attach real paths, never invent them, and
remember that artifact paths from elsewhere do not render.
`MANAGED_DELIVERABLE_LINKS_PROMPT` is our version and it is more
specific: link every output file by absolute path, keep intermediates in
the session temp directory, and never link a file you merely read.

**§7 refusal and disallow classes** — the engine carries its own safety
layer (`openclaw/src/security/`), and the app does not need to restate a
model-level policy in a product prompt.

### Struck with the box

§8 in full, `request_box_help` in §6, the cloud-agent row in §15, and
§19 with its `debugging-the-box.md`.

---

## What is still not built — 15 September

Two things were taken from these four documents: the conversation
section of the managed prompt, and the generated `reference/app-ui.md`
(`docs/product/review.md` §26). **That is two items out of roughly
twenty.** This is the rest, so that "we building exactly that" has a
list behind it rather than a feeling.

### Missing from the voice work I just did

Four rules from the same documents did not make it into
`MANAGED_CONVERSATION_PROMPT`, and three of them should:

- **Autonomy — "decide and proceed."** `grok-bot-chat.md` §2.3 and
  `grok-bot-agent-reference.md` §4: ask only for consequential or
  destructive actions, irreducible ambiguity, or a fact only the person
  knows; otherwise state the assumption and carry on. Our exec-safety
  section says *when* to draw a question card; nothing says when **not**
  to. An agent with a reply-first rule and no autonomy rule asks more,
  not less.
- **First run depends on the description** (`agent-reference.md` §1). A
  role agent whose description is a concrete assignment should start the
  assignment, not interview the person. Kits carry the role and the agent
  record carries the description; nothing joins them.
- **Never narrate a wake cue** (§2.5, §16). A routine firing, an inbound
  channel message, a teammate's message — the agent should act on these
  without telling the person a cue arrived. Our cron fires today and
  nothing says this.
- **Room turns invert reply-first** (§3, §6). Answer-before-you-work is
  right for a person's turn and wrong for a room. We have channels in the
  engine, so the rule that is now in the prompt is unqualified where it
  should not be. *This one is a defect in what shipped, not an omission.*

### Not started, from `grok-bot.md`

- **Chief of Staff** — an agent that manages the fleet and escalates.
- **Group rooms** with seated members and room turn rules.
- **Projects** as a memory and collaboration scope.
- **Memory precedence** — a role agent's note against shared user memory
  (`agent-reference.md` §13).
- **Event-listener routine triggers** — Slack, GitHub, Linear, Sentry,
  PagerDuty, webhooks. Ours are cron only, and the source says to prefer
  events over polling.
- **The escalation order**, written down: context → connector → web →
  signed-in browser → desktop → ask. Every step exists; the order does
  not, which is probably why the agent picks wrong.

### Not started, from `grok-bot-chat.md`

- **In-chat forms** (`request_user_form`) — the fillable card for a typed
  login, address or OTP, secrets write-only. The one piece of chat UI
  here with no engine equivalent, and the thing that unblocks every "sign
  in to continue" dead end.
- **`type: attachment`** as a message in its own right, and
  **`type: secret-request`** as a card. The engine has secrets; the
  thread has no card for them.
- **Threading** — `reply_to` for bulk under a TLDR.
- **Reference chips** — jump back to an earlier message.
- **Deep-link pills** into settings rows. Cheap now: every row already
  has the anchor id the map prints.
- **"N new messages" jump control**, which multi-bubble turns make
  necessary.
- **The render matrix** (§11.5) — widgets and cards do not exist in group
  rooms or external channels; text degrades terser.

### Not started, from `grok-bot-app-ui.md`

- **Deleting an agent** — permanent, from the sidebar, right-click, with
  a confirm, and not in Settings. No archive, no hide. We have not made
  this decision.
- **Two-click confirm** on a destructive row — "Click Again to Confirm"
  in place rather than a modal.

### A reference file we should have and do not

`agent-reference.md` §19 names `debugging-the-box.md`. We must not have a
box — but the *shape* is the thing. A `reference/when-things-fail.md`
naming the log directory and what to read in it would have ended review
§22 in one turn instead of three nights and three invented explanations.

### Deliberately not building

Everything in `direction.md` §10's struck column: the box, machine
registry, `CopyToBox`/`CopyFromBox`, `request_box_help`, cloud-agent
cards, `[Sent from machine <id>]`, and the Update/Reset computer rows.
Settled by the founder on 15 September — *"no box. keep direction.md's
line."*

---

## Event triggers: what was built, and the half that was not — 15 September

`grok-bot.md` §8 lists event listeners beside cron: Slack, GitHub,
Origin, Teams, Linear, Sentry, PagerDuty, webhooks, *"prefer event
listeners over polling when the event shape exists"*.

### The engine already had all of it

`openclaw/src/gateway/server/hooks-request-handler.ts` is a complete
inbound endpoint: token auth, rate limiting on failed auth, per-agent
targeting, session-key policy, payload mapping, idempotency so a retried
delivery does not run twice, and — the part that matters most — it marks
the body as **external content**, so a webhook payload is data the agent
reads rather than instructions it follows.

Writing that would have been weeks. It needed a config key, and it now
has one: `hooks.enabled` with a generated token, confined to `hook:`
session keys so an inbound event can never steer itself into the
conversation the person is having.

### What that reaches, and what it does not

The gateway binds to **loopback** — `--bind loopback`,
`openclawEngineManager.ts:769` — and `direction.md` §10 struck the
egress tunnel that would have changed that.

So this is live for anything already on the machine: a Shortcuts
automation, a Folder Action, a `launchd` job, a git hook, a script.
*"Run this whenever that folder changes"* works today.

**GitHub, Linear, Sentry and PagerDuty cannot reach it.** They are on
the internet and it is not. That is the half that is not built, and the
managed prompt says so in as many words, because an agent that cheerfully
offers to set up a GitHub webhook sends somebody off to configure
something that will never fire.

### What the remote half would take, and the decision in it

Checked, not assumed: there is no webhook receiver in `server/polar/`
and no poll loop in the desktop. So all of this is new:

1. A receiver on `api.claidor.com`, with per-person, per-source secrets.
2. **Signature verification per provider** — GitHub, Linear, Sentry and
   PagerDuty each sign differently, and a receiver that skips this is an
   open door to anybody who learns the URL.
3. A way to deliver to a machine behind NAT. The desktop polls, or holds
   a connection. Poll is simpler and survives sleep badly; a held
   connection is lower latency and more moving parts.
4. **The decision the founder has to make:** what happens when the Mac is
   shut. `direction.md` §10 already keeps *"a headless runner that fires
   routines"*, so the cloud runner could take the event — but it has no
   access to their files, so it can answer "did the build break" and
   cannot answer "put the new invoice in the folder". Splitting by
   capability is a product choice, not an implementation detail.

None of this is started. It is one item, it is the largest remaining
piece in these four documents, and it is not pretended to anywhere in the
code.

### The decision, made — 15 September

Put to the founder, who answered: *"decides for whats best."* So:

**Events queue on our server; the desktop drains the queue when it is
awake. The runner takes an event only when the routine it fires needs
nothing on the person's disk. The default is that it does, so the
default is to wait.**

Why that way round:

- The sentence we are protecting is *we open the file where it lives*. A
  runner that picks up "file the new invoice" has to copy the file to
  itself to do it, and the moment it does, we are Grok Bot with fewer
  features.
- Waiting is honest and explainable. *"That came in at 3am; I did it when
  you opened the Mac"* is a sentence a person accepts. *"I did it on a
  machine you have never seen, and here is your file back"* is not.
- The runner still earns its keep on everything that touches only
  services: a build that broke, a ticket assigned, a calendar that moved.
  Those are the events people most want at 3am and none of them need a
  local file.

And **poll, not a held connection.** A held socket is lower latency and
more moving parts, and it is the part most likely to be quietly broken
after a sleep/wake cycle. Thirty seconds is not the difference between a
useful invoice notice and a useless one. If latency ever matters, a
stream is an optimisation on top of a queue that already works, and the
queue is the durable half either way.

Still not built. This is the shape it should take when it is.
