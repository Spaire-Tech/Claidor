# The direction, as the founder set it

13 September 2026. This is the record of what was decided, not a plan.
Where the founder's own words are exact, they are quoted. Where I checked
something in code, the file is named. Nothing here is from memory.

The design it describes is the founder's redesign of the app, delivered
as a Claude Design canvas. The canvas is the source of truth for shape;
this file is the source of truth for the decisions around it.

---

## 0. The name is Faiser

Decided 13 September 2026, after Maties and Swens were both rejected.

It is applied. `desktop/src/main/appConstants.ts` is the one definition
site, and it carries `APP_NAME`, `APP_ID`, `APP_USER_MODEL_ID`,
`DB_FILENAME`, `APP_PROTOCOL` (the `faiser://` sign-in deep link),
`APP_HOME_DIR_NAME` and `APP_TEMP_DIR_NAME`. `electron-builder.json` and
`package.json` carry the packaging identity.

The reason it had to be decided before any build left the building:
`main.ts` calls `app.setName(APP_NAME)` and `configureUserDataPath()`
joins that name onto `appData`, so this constant decides where a
person's conversations, memory, logins and engine state live. Changing
it after anyone installs orphans all of it.

**Three things deliberately keep the old name**, and renaming any of
them would be damage rather than tidiness:

- the OpenClaw extension and provider id `lobster` — upstream's, and the
  runtime breaks without it;
- the `agent:<id>:lobsterai:<session>` session-key format in
  `openclawChannelSessionSync.ts` — an internal format nobody sees,
  where a rewrite risks session routing for no gain;
- `EXPORT_FORMAT_TYPE` in `renderer/constants/app.ts` — the provider
  export format, which goes away with the provider screens.

Everything else that named the old product and is *visible* now follows
the constant: the installer filenames, the web package, the backup and
rollback archives a person saves, the default working directory under
home, and the quit dialog's title.

---

## 1. The shape: it is Messages

The sidebar is a conversation list. Each conversation is an agent, not a
person. `+` opens a **To:** field with chips, exactly like Messages.
That is the whole navigation. No tabs, no dashboard, no workspace, no
session tree.

Five surfaces, three of them modals over the chat:

1. the thread,
2. compose (To: field, picker, ⌘1–⌘9),
3. new agent (Name, Voice, Label, Description),
4. Apps (two tabs: connectors, and role agents),
5. Settings (four tabs).

Upstream LobsterAI has thirteen settings tabs. This has four.

## 2. The message vocabulary

Exactly five kinds of thing may appear in a thread. This is a closed
list, and it is the discipline that makes the app feel unlike an AI app:

| Kind | What it is |
|---|---|
| `text` | a bubble; in a group it carries the sender's orb and name |
| `system` | a centred grey line — "Perrin can run commands on your computer from now on." |
| `status` | orb plus a shimmering verb, deleted when the work finishes |
| `choice` | a question card, lettered options with hints, optional free-text |
| `auth` | the approval card |

No step cards. No tool logs. No thinking blocks. No raw blobs.

**The approval card is the heart of it.** Warning triangle, the device
id, the *literal command* behind a disclosure triangle, then Always
allow / Allow once / Never. Answering it consumes the card: the prompt
is replaced by the one-line system note, so threads never accumulate
dead UI.

The founder, on this: *"as you can see it always ask if he's allowed to
do something in the computer i want the same."* Every action that
touches the computer asks. That is not a setting to be optimised away.

## 3. How text arrives

*"the text come like texts. not ai. however when the ai speaks, it comes
as stream."*

Two different behaviours, and the design already separates them:

- **Text mode** — the reply is split on blank lines into at most three
  short messages, pushed whole, 420 ms apart. They land like texts.
- **Voice mode** — the same parts are streamed word by word.

So streaming is a property of speech, not of text. A typed answer should
never crawl out a token at a time.

## 4. The voice brief

This goes into the agent's description/instructions verbatim. It is the
founder's wording and should not be paraphrased:

> Talk like a warm, sharp friend — not a help desk. Use plain words and
> contractions. Skip "Certainly," "Of course," "I'd be happy to," stiff
> jargon, and filler closings. Lead with the result. Most replies are one
> or two sentences; match the user's length. For a few natural beats,
> send short messages like texts instead of one dense memo. Prefer prose;
> use bullets only when the content needs them. Don't narrate your own
> feelings or claim to be human. Don't restate the user's question back
> at them. When you act, say what you did in concrete terms, not process
> theater. Ask at most one real question at a time; otherwise decide and
> proceed. Never dump tool names, prompts, or architecture unless they
> ask how to use you.

Seven voices in the picker: Concise, Balanced, Warm, Direct, Sassy,
Curious, Formal. Those name a manner, not a speaker.

**Speech is OpenAI, not ElevenLabs.** The founder's reason is cost. Note
that the server has no speech route today — `server/polar/desktop/
endpoints.py` has none, and nothing under `server/polar/` matches
`speech`. This is to build, not to switch.

## 5. The orb

The orb replaces every avatar, model logo and icon. A fragment-shader
cloud disc, five colours plus a seed.

The design ships four palettes. **The founder wants fifteen**, and a
palette picked at random per agent, so two agents rarely look alike.

## 6. Kits are the role agents — confirmed in code

The founder: *"kits of the real lobster ai is the 12 installable role
agents."* Checked, and it is exact.

`desktop/src/renderer/types/kit.ts` — a `MarketplaceKit` carries:

```
id, name, description, icon, author, version,
skills:     { bundle: <downloadable url>, list: [{id, name, description}] }
mcpServers: [...]
connectors: [...]
```

So a kit is a bundle of skills *plus* MCP servers *plus* connectors,
installed as one unit. That is precisely "Engineering Lead arrives with
its own skills, already knowing the work." Install goes through
`desktop/src/renderer/services/kit.ts` → `window.electron.kits.install`.

A kit carries no identity — no name for the agent, no prompt, no orb
palette. A role agent is therefore *a kit plus an agent record*. The
`agents` table already holds `skillIds`, so the join already exists.

**And the pipe is already built and live.** `server/polar/desktop/
endpoints.py:442` serves `/api/kit-store` and returns an empty list,
with the docstring "The kit store. Empty until Claidor curates one."
Same for `/api/skill-store` and `/api/mcp-marketplace`. We do not build
a store. We fill one.

The twelve roles in the design: Engineering Lead, Design Lead,
Operations Manager, Product Manager, Head of People, Marketing Lead,
Financial Controller, Account Executive, Data Analyst, Support
Specialist, In-house Counsel, Research Scientist.

## 7. The computer icon is the panel — do not lose this

The founder: *"the computer icon in the top message is the panel built
in browser/artifacts stuff from lobster. dont forget that, its mega
important."*

It is `ArtifactSpecialTab` in `desktop/src/renderer/store/slices/
artifactSlice.ts:29`, and it has five tabs plus artifact previews:

| Tab | What you watch |
|---|---|
| `agentBrowser` | the agent's own Chromium, live — `AgentBrowserInAppPanel.tsx` |
| `browser` | a page preview |
| `fileList` | the files it has produced |
| `subagents` | what it has delegated |
| `userAttachment` | what you gave it |

Plus every artifact as `preview` or `code`. This is the single richest
thing upstream gives us and the design reduces it to one icon in the
header. Keep the icon; keep all of it behind the icon.

## 8. Connectors

The design's catalogue is about fifty services across nine categories.
Our MCP registry has fifteen. The founder is handling the gap and asked
me not to cost it.

What is decided: **each connector carries context**, drawn from
`github.com/cursor/plugins`. Some need sign-in.

What is open: **how sign-in happens — Pipedream, or the browser.** The
founder has not chosen.

One thing to put in front of that choice: `server/polar/connectors/` is
already a working Pipedream Connect integration —
`pipedream.py` generates a one-use connect link the person signs in at,
lists what they have connected, removes one, and resolves an **MCP
target per service**, which is where the engine's tool conversation
goes. Its router is mounted from `desktop/endpoints.py`. So the
Pipedream path already gives both halves of the problem at once: the
sign-in card, and the tools behind it. The browser path gives neither
without being built.

## 9. Teach a task

In the `+` menu, with a red record dot — screen-recorded demonstration.
The founder is handling it.

The engine already has the second half: `skill_workshop` in
`openclaw/src/agents/tools/skill-workshop-tool.ts` lets the agent
propose, write, revise and apply a skill, with support files and a
proposal queue.

## 10. There is one computer, and it is this one

The founder, on the design's own Settings → Computer and Settings →
Updates: *"there is no 'which computer' — that was a design mistake by
me. same for the cloud computer."*

So, struck from the design:

- the second registered machine (`Dell7040`) and its execution setting,
- **The Swens computer** — the shared cloud machine, its update and its
  reset,
- the egress tunnel that existed only to reach it.

Settings → Computer keeps the current computer and its "Ask every time".

This is the product thesis, not a simplification. Grok Bot needs
registered machines because it lives in the cloud and must reach in.
Ours runs on the machine, so there is only this computer. The
consequence that matters to a customer: **Grok Bot copies your file to
its own disk and copies it back — its words, "my computer ≠ your disk …
we copy when needed" — and we open the file where it lives.** That shows
up in spreadsheet formulas, links between workbooks, folder structure,
and privacy. Anything that reintroduces a machine the agent owns takes
that sentence away from us.

### The line, drawn exactly

The audit found a deployed worker, `claidor-maty-runner`, whose own
README says it *"does a person's work when they are not at their
computer"*. Put to the founder as a question — does a routine fire when
the Mac is closed? — the answer was **yes, it fires**.

So the runner lives, and the line is not "no cloud" but this:

| Struck | Kept |
|---|---|
| a cloud computer the person **works on** | a headless runner that **fires routines** |
| their files living on it | no files on it; memory in, memory out, directory deleted |
| apps and packages installed on it | nothing installed, nothing to install |
| an update and a reset surface for it | never mentioned in the app at all |
| an egress tunnel to reach it | — |

The differentiator survives because it was never about where a process
runs. It is about **where the file is when it is worked on**. A routine
that reads your calendar at 08:00 while the laptop is shut touches no
file of yours on any disk. The moment the agent copies your workbook to
a machine it owns, we lose the sentence — and that is the thing to
guard, not the runner.

What this means in the app: Routines is one of the five agent tabs, and
a routine set there keeps running when the Mac sleeps. The person is
never asked which computer, never shown the runner, and never told their
work happens elsewhere, because as far as their files are concerned it
does not.

---

## What is decided, in one list

1. No product name anywhere; one placeholder constant.
2. Messages shape; five surfaces; four settings tabs.
3. Five message kinds, closed list; approval card with the real command.
4. Ask before every action on the computer.
5. Text arrives as texts; only speech streams.
6. The voice brief above, verbatim.
7. Speech from OpenAI. Build it; there is no speech route today.
8. Fifteen orb palettes, assigned at random per agent.
9. Role agents are kits; the kit store endpoint already exists and is empty.
10. The computer icon opens LobsterAI's artifact and browser panel, whole.
11. One computer for files: this one. No second machine, and no cloud
    machine the person works on — but routines do fire with the Mac
    shut, on a headless runner that holds no files.
12. Connectors carry context from `cursor/plugins`; sign-in method open,
    with a Pipedream integration already written and mounted.

---

## 11. Models: OpenAI throughout, Claude as the fallback

OpenAI powers everything. The founder's reason is cost, and our own
catalogue bears it out (`server/polar/desktop/pricing.py`, per million
tokens): Luna $0.20 in / $1.20 out, Terra $2.00 / $12.00, Astra $10.00 /
$50.00, against Haiku $0.60 / $3.00, Sonnet $3.00 / $15.00 and Opus
$15.00 / $75.00. Terra undercuts Sonnet by a third and Luna undercuts
Haiku threefold. OpenAI also charges nothing to write its cache where
Anthropic charges 1.25×, which for an agent replaying a system prompt
and tool definitions every turn is money on every message. And the
OpenAI context window is 1,050,000 against Claude's 200,000.

**The agent does not pick its model.** A router must choose before it
knows how hard the task is, costs a round trip on every message in an
app whose whole feel is timing, and makes the usage meter
unpredictable — and today it would be choosing between models whose
differences are switched off. Instead: one model the person talks to,
and cheap models for machinery they never see. Every slot already exists
in OpenClaw config (`src/config/types.agent-defaults.ts`):

| Slot | Model |
|---|---|
| `model.primary` | Terra — everything the person reads |
| `model.fallbacks` | Claude Sonnet 5 — never default, never shown |
| `subagents.model` | Luna |
| `compaction.model` | Luna |
| `compaction.memoryFlush.model` | Luna |
| `heartbeat.model` | Luna |

App-side cheap work — chat titles, sidebar previews, intent sorting —
also Luna.

**Astra is not offered.** On `/v1/chat/completions` OpenAI refuses
`reasoning_effort` alongside function tools, so our proxy sends
`reasoning_effort: "none"` whenever tools are present, which for an agent
is always. Astra costs five times Terra for a capability we then switch
off. It comes back when `/v1/responses` exists, and not before.

**Escalation, when it exists, is on evidence and never on prediction:**
the person asks, a step has failed twice, or the agent asks. And it is
said in the thread as a `system` line, so the meter stays explicable.

**The fallback is agreed.** Sole-provider means one outage is a total
outage. Claude stays configured as the per-agent fallback — never the
default, never in the UI, never in the model list. It costs nothing until
the day it is the only thing that answers.
