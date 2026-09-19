# What the Grok Bot 0.18 reconstruction gives us

**Written 19 September 2026, from the tree as it landed at `86d49feb`.**
Provenance, permission and the removal commitment are in
`grok-bot-source-provenance.md`. This file is the map: what is in
`vendor/grok-bot-0.18/`, and which of our open questions it answers.

**Read the honesty line first.** What follows is a survey of the tree plus a
handful of files read in full. Directory listings and five file heads are not
an audit. Where I have read the code I say so; where I am reading a filename I
say that too. Do not cite this file as evidence that something works.

## The shape of it

2,106 files, 34 MB, of which **2,002 are TypeScript**. Eight tests. Two design
documents (`docs/ARCHITECTURE.md`, `docs/PUBLISHING.md`).

| directory | files | what it is |
| --- | ---: | --- |
| `source/packages/` | 852 | the libraries: agent core, exec, transcript, inference, protobuf, MCP, hooks, redaction |
| `source/host/` | 471 | the agent host — the gateway, the runner, the box, routines, groups |
| `source/electron-main/` | 185 | the desktop shell |
| `source/shared/` | 165 | the contracts both sides agree on |
| `source/electron-preload/` | 16 | the bridge |
| `source/node-agent-coordinator/` | 24 | agent lifecycle |
| `source/box-exec-daemon/` | 3 | what runs **inside** the box |
| `source/local-exec-daemon/` | 3 | what runs on the **person's own machine** |
| `frontend/` | — | a partial reconstruction, not the shipped UI |

## What it is not, stated plainly

The distributed app shipped minified production JavaScript with no source maps.
**The renderer was never recovered.** `frontend/` is the reconstructor's own
partial rebuild and their README says so directly: it "should not be mistaken
for Anysphere's missing original frontend source or a pixel-perfect
replacement". Their packaged build keeps the real shipped renderer as a
checksum-pinned binary blob and patches one settings screen into it.

So: **we get the engine and the control plane. We do not get the UI.** Our
Messages design, our orb, our roster card, our cards — none of that has a
counterpart here to copy. That work stays ours, which is the right outcome
anyway, because the founder designed it.

Also absent by our choice: `research-archives/`, the signed installers, left
behind on purpose. `NOTICE.md` and `PROVENANCE.md` in the vendored tree still
describe them as present. They are not present here.

## The five things that answer a question we actually have

### 1. The box, and it is a remote sandbox by default

`source/shared/box-runtime.ts`, read in full, is six lines:

```ts
export type SandBoxRuntime = "remote" | "local-docker";
export const DEFAULT_SAND_BOX_RUNTIME: SandBoxRuntime = "remote";
```

`remote` is upstream's. `local-docker` is the reconstructor's addition. So the
product we were told is "miles ahead" runs its agent's computer in the cloud by
default — which is the decision `docs/product/box-substrate-read.md` already
reached independently, and this is the first outside confirmation of it.

`source/host/box/` is seventeen files: capabilities, env, factory, file
transfer, MCP, monitor layout, remote accessor, shell command, store-backend
policy, transfer, windows, exec-daemon process, protected-path guard, plus
`loopback-sand-box.ts` and `shared-desktop-sand-box.ts`.

**`box-remote-accessor.ts` contradicts a decision we already made.** I read its
first 45 lines. The transport is Connect RPC — `httpVersion: "1.1"`,
`useBinaryFormat: true`, interceptors, and `ExecClientMessage` /
`ExecServerMessage` generated from `agent/v1/exec_pb.js`. That is **binary
protobuf over Connect**, not the NDJSON-over-POST that §9 of
`agent-computer-plan.md` specifies and that Server is building right now.

This is not a reason to stop Server. NDJSON is a legitimate choice and the
contract is already written. It *is* a reason to read `box-remote-accessor.ts`
and `source/packages/agent-exec/remote.ts` properly before that contract
hardens, because whoever wrote this one had a running product and we do not.

### 2. Routines — a finished answer to the thing maty cannot do

`source/host/automations/` is seven files, and `automation.ts` is the one to
read. I read its first forty lines and it is not a stub.

A routine is a saved prompt plus a trigger. The trigger is **either** a 5-field
cron (with `CRON_TZ=` prefixes, `@hourly`/`@daily` shorthands, and
`@every 30s|5m|2h|1d`) **or** an event listener — Slack, GitHub, Microsoft
Teams, Linear, Sentry, PagerDuty. Fifty per agent. Twenty runs of history each.
They are stored as one `automation.json` per routine in a folder **on the box**,
which the agent can read and grep with its own Shell — and the prompt is
explicit that it must never reach for `ExternalShell`/`ExternalRead` there,
because that folder is not on the user's machine.

That last sentence is the file-custody rule from `cards-plan.md`, already
written down and already enforced in a shipped product.

**This is the gap in our build, exactly.** `CLAUDE.md` records it: the maty
queue is live, the runner matches its README line for line, and
`grep -ril maty desktop/src` returns nothing — a finished pipe with nothing
plugged into the input. This directory is the missing producer, written out.

The prompt writing in it is also the best argument I have seen for what Brief is
trying to do. It does not say "create routines when appropriate". It says be
aggressive and proactive, lists the phrasings that should trigger one ("every
morning", "remind me", "ping me when", "watch this"), then spends four
paragraphs on a single rule — that weekdays and waking hours are the DEFAULT,
that `@daily` quietly fires at midnight and `@every 30m` cannot be bounded at
all, that "check daily" is loose phrasing for "regularly" and not a request for
round-the-clock coverage, and that leaving the window needs a reason you could
say out loud. Then it lists the four acceptable reasons.

### 3. Their brief is 69,217 characters

`source/host/runner/system-prompt.ts` is 69,217 characters;
`system-prompt-assembly.ts` is another 16,163; `sand-agent-profile-prompt.ts`
2,482. Ours is about 38,000, and until 16 September the engine cut it at 20,000
because nothing set `bootstrapMaxChars`.

So the "the brief is too long" instinct has a number against it now, from a
product the founder judged far better than ours. Theirs is nearly twice ours and
assembled per-turn from composable pieces rather than concatenated whole. That
is Brief's problem restated with evidence, and it changes the question from *cut
it* to *assemble it*.

The first thing in that file is a system reminder that plain assistant text is
never delivered and only a real `SendMessage` tool call reaches the person. Our
Messages design says the same thing; they enforce it with a reminder appended to
every user message.

### 4. The reviewer, and it is thirteen files

`source/host/runner/` has `sand-auto-review.ts` plus specialised classifiers for
automations, browser, cloud agents, computer, shell, subagents, and separate
files for summaries and tool escalations. Our `direction.md` describes exactly
this — "the engine's reviewer flags with a reason on the card", review item 68 —
as a thing we intend. Here it is built, broken down by tool class.

### 5. The tool surface

`source/host/runner/tools/` — 23 files. Named: `send-message-tool.ts` (with its
own schema and encoding files), `communicate-tool.ts`, `sand-computer-tool.ts`
and its subagent, `sand-browser-tools.ts` with a driver source and its own
subagent, `sand-file-transfer-tools.ts`, `sand-agent-management-tools.ts`,
`sand-subagent-management-tools.ts`, `sand-mcp-management-tools.ts`,
`mcp-meta-tools.ts`, `sand-permission-request.ts`, `sand-secret-request.ts`,
`sand-spotlight-tools.ts`, `sand-state-tool.ts`, `sand-reaction-tool.ts`,
`box-help-tool.ts`, `turn-toolset.ts`.

Note `sand-permission-request.ts` and `sand-secret-request.ts` as separate
tools — asking for permission and asking for a secret are different acts with
different shapes. And `sand-reaction-tool.ts`: the agent can react to a message.

## The rest of the map, unread

- `source/host/agents/` — avatar, clone, messaging, profile, workflow
  enablement, settings file. Our roster card and agent-to-agent work.
- `source/host/groups/` — group chat, group store, remote room store, `xuser`.
- `source/host/cloud-agents/` — images, tool, transcript dump.
- `source/host/agent-isolation/` — worker pool, per-conversation blob store and
  its GC, transcript mirror offload. How they keep agents from reading each
  other, which is the audit in `agent-to-agent-audit.md`.
- `source/host/local-exec/` and `source/local-exec-daemon/` — the half that runs
  on the person's own Mac, against `source/box-exec-daemon/` which runs in the
  box. The two-machine model `cards-plan.md` decided on, as code.
- `source/shared/forever-box.ts`, `box-secrets.ts`, `box-migration.ts`,
  `local-tool-permission.ts` and `local-tool-permission-machinery.ts`.
- `source/packages/` — 852 files including `agent-core`, `agent-exec`,
  `chat-inference`, `prompt-jsx`, `redaction`, `hooks`, `mcp-core`.

`prompt-jsx` is worth a look on name alone: a brief assembled as components.

## What this does not change

The product is still Caisra and the design is still the founder's. Nothing here
replaces `desktop/`, and the rule in `CLAUDE.md` stands — **`desktop/` is the
product, not a parts bin**, and now neither is this. This is a reference tree we
read, not a foundation we move onto. The last time a foundation swap was tried
it cost two days and ended with "i just wanna go back".
