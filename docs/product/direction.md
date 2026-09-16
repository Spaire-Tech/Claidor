# The direction, as the founder set it

13 September 2026. This is the record of what was decided, not a plan.
Where the founder's own words are exact, they are quoted. Where I checked
something in code, the file is named. Nothing here is from memory.

The design it describes is the founder's redesign of the app, delivered
as a Claude Design canvas. The canvas is the source of truth for shape;
this file is the source of truth for the decisions around it.

---

## 0. The name is Caisra

Decided 13 September 2026 as Faiser, after Maties and Swens were both
rejected; renamed to **Caisra**, the founder's official name, on
15 September 2026. The rename reached every string a person or the agent
can read, the deep-link scheme, the data directory and the database name;
`adoptLegacyUserData()` in `main.ts` moves a Faiser install's directory
and database to the Caisra names on first start, so the two days of
builds in between keep their conversations.

It is applied. `desktop/src/main/appConstants.ts` is the one definition
site, and it carries `APP_NAME`, `APP_ID`, `APP_USER_MODEL_ID`,
`DB_FILENAME`, `APP_PROTOCOL` (the `caisra://` sign-in deep link),
`APP_HOME_DIR_NAME` and `APP_TEMP_DIR_NAME`. `electron-builder.json` and
`package.json` carry the packaging identity.

The reason it had to be decided before any build left the building:
`main.ts` calls `app.setName(APP_NAME)` and `configureUserDataPath()`
joins that name onto `appData`, so this constant decides where a
person's conversations, memory, logins and engine state live. Changing
it after anyone installs orphans all of it.

**Internal identifiers deliberately keep the old names**, and renaming
any of them would be damage rather than tidiness. Nobody reads them: not
a person, not the agent. They are the engine's environment variables
(`OPENCLAW_*`), its config file and state directory (`openclaw.json`,
`userData/openclaw`), file and module names, IPC channel names, the
`X-LobsterAI-*` request headers the server expects, the `lobsterai_`
analytics event prefix, the plugin ids `lobsterai-model-compat` and
`lobster-media-generation`, and `LOBSTERAI_SKILLS_ROOT`, which the app
still sets beside the new `CAISRA_SKILLS_ROOT` so bundled skill scripts
keep working. The developer log tags are `[Engine]` and
`[EngineConfigSync]` since 15 September. Three more, from the 13th:

- the OpenClaw extension and provider id `lobster` — upstream's, and the
  runtime breaks without it;
- the `agent:<id>:lobsterai:<session>` session-key format in
  `openclawChannelSessionSync.ts` — an internal format no person sees,
  where a rewrite risks session routing for no gain. The agent does
  see it, in its own plumbing, and on 16 September one read it out;
  since then every agent's managed instructions say what these names
  are and that they stay inside (review item 65);
- `EXPORT_FORMAT_TYPE` in `renderer/constants/app.ts` — the provider
  export format, which goes away with the provider screens.

Everything else that named the old product and is *visible* now follows
the constant: the installer filenames, the web package, the backup and
rollback archives a person saves, the default working directory under
home, and the quit dialog's title.

## 0b. Under the hood, never a setting

16 September 2026, the founder, verbatim: *"my users should never put a
key. everything happens under the hood. not a setting."* And, on the
Claude Code sign-in they had asked for: *"its for you to switch the
mechanic in the code, but thats not visible to others."*

Applied that day (`docs/product/review.md` item 53) and finished the
same evening (item 56), after the founder, again: *"i told you to
remove that settings for api keys. or allowance or whatever that is."*
Nothing about models is a setting. There is no Models row, no
allowance choice, no key field of any kind: the account's models run
through the metered proxy, Claidor's Composio key is on the server
(`polar/desktop/composio.py`) and the app has no field for it. Anything
a client would have to be told to type in is the wrong design.

**Claude Code is off, since 17 September 2026.** For three days a
development build ran its turns through the founder's Claude Code
sign-in (`desktop/src/main/libs/claudeCodeMode.ts`, decided in code,
logged at `[ClaudeCode]`). The founder ended it: *"i want out of the
model. bring me back to my old open ai model - the one before we switch
to claude code, the api … claude code is a coding assistant. nothing to
do with any of this."* Every build now runs on the account's model
through the metered proxy; `CAISRA_CLAUDE_CODE=1` at a terminal is the
one way back, and no screen or build takes it by itself. The engine
patch `openclaw-claude-tools-ask-first.patch` stays, corrected and
unused (review item 66).

## 0c. The main agent is Yodo, the Chief of Staff

16 September 2026, with the onboarding canvas: *"there is a cloud
avatar, who's the chief of staff. his name is yodo. he's the main agent.
his job is literally being a chief of staff."* And the goal the first
step of onboarding works towards: *"the final goal is to have the chief
of staff create the first agents for the user. i'll figure out the rest
later. for now after get started it should take them to the chat."*

Applied that day (`docs/product/review.md` item 55).
`desktop/src/shared/agent/constants.ts` names him and carries his
colours and seed; `chiefOfStaff.ts` is his brief, written into the main
agent's managed instructions; the twelve role presets stay and the
Chief of Staff preset is gone, because it was him. The first step of
onboarding (`design/onboarding/`) is the canvas exactly, and the one
small thing it does on the Mac is real.

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

Exactly seven kinds of thing may appear in a thread. This is a closed
list, and it is the discipline that makes the app feel unlike an AI app:

| Kind | What it is |
|---|---|
| `text` | a bubble; in a group it carries the sender's orb and name |
| `system` | a centred grey line — "Perrin can run commands on your computer from now on." |
| `status` | orb plus a shimmering verb, deleted when the work finishes |
| `choice` | a question card, lettered options with hints, optional free-text |
| `auth` | the approval card |
| `attachment` | a file as the whole message — an image shown, anything else named and openable |
| `secret` | a masked field; what is typed never enters the transcript |

No step cards. No tool logs. No thinking blocks. No raw blobs.

### It was five, until 15 September 2026

The first version of this section fixed **five** kinds and said adding a
sixth was a product decision rather than a convenience. It was put to the
founder as exactly that decision, against the four Grok Bot documents in
`docs/product/sources/`, which carry seven. Their answer:

> *"seven kinds. build both and amend direction.md"*

So:

- **`attachment`.** A produced document was arriving as a lone chip
  inside an otherwise empty bubble — a `text` item pretending to be
  something else. A file the agent made is a thing, not a sentence about
  a thing, and an image it made should be looked at rather than opened.
- **`secret`.** "Never ask somebody to paste a password or a key into
  chat" is a rule with nowhere to go. Without a masked field the agent
  either asks in the open, or gives up on a step it could have finished.
  What is typed into this card never enters the transcript, the model's
  context, or any log.

The closed list is still closed. An eighth is the same decision, asked
the same way.

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
  short messages, pushed whole, one second apart. They land like texts.
  (The canvas had 420 ms. The founder, 15 September, having watched it:
  *"i dont want the second to IMMEDIATELY come. i want a bit of realism.
  so 1 second might be good between it."* `BUBBLE_GAP_MS` in
  `design/thread/stagger.ts`.)
- **Voice mode** — the same parts are streamed word by word.

So streaming is a property of speech, not of text. A typed answer should
never crawl out a token at a time.

**Amended 15 September.** The founder, on seeing the built app: *"it's
supposed come as text. but the ai write it in streams. which creates
lags. i want to have it as text. always."* So: a reply is drawn only
when it is complete, in every mode. While it is arriving, the typing
animation is the whole of what says "working". There is no speech in
this product yet; when there is, it is the *speech* that will stream,
never the bubble.

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

**And a thirteenth, added 15 September 2026: Chief of Staff.** It is not
a thirteenth role — it does no work of its own. It knows which of the
twelve should, hands the job over whole, brings the answer back, and
comes to the person for a decision rather than for progress. From
`docs/product/sources/grok-bot.md` §3.2, where it is the agent that
manages the fleet. Added rather than replacing anything, so the twelve
above are untouched; `presetAgents.test.ts` counts them separately so a
future change cannot quietly turn twelve into eleven.

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

---

## 12. Before the first thread

The founder, 13 September: *"i have not designed the onboarding yet so
you're going to have to just have a simple sign in here… be smart on how
the ai greet for the first time. never an empty state. have not design
that yet, but i will. so for now nothing."*

So three things are settled and one is deliberately not built.

**Sign-in is one screen.** Not a flow, not a tour, not a six-step
onboarding. An account is mandatory because the proxy meters against it,
so something has to come before the first thread — and that something is
as close to nothing as it can be while still being a door.

**Never an empty state.** This is the rule, and it outlives the screen it
was said about. A person who has just signed in does not meet a blank
list and a placeholder telling them to start typing. The agent has
already said something. The same rule applies to every surface that can
be empty — a thread with no messages, an Apps list with nothing
installed, a Routines tab with no routines. The canvas already does this
where it drew it: a new agent opens with *"Hey Bass — good to meet you"*
and a question card, not a cursor.

**The first greeting is the agent's, not the product's.** Not a welcome
banner, not a feature tour. It is a message in a thread, in the voice
brief of §4, and it should do what the canvas's does: say hello, then ask
one real question whose answer shapes the agent. That is onboarding
disguised as a conversation, and it costs no screens.

**And the design of it is the founder's, not mine.** They said it is
coming. So nothing is built for it beyond the sign-in door — no invented
welcome screens, no placeholder illustrations, no copy standing in for
copy they will write. When their design lands it should meet an app that
has left the space for it, not one that has filled it with my guesses.

---

## What is decided, in one list

1. The name is Caisra, applied; `appConstants.ts` is the one site.
2. Messages shape; five surfaces; four settings tabs.
3. Five message kinds, closed list; approval card with the real command.
4. The computer asks once: the first action raises the card, Allow is
   this computer until the person changes it in Settings, Not now is
   that one action. Decided 17 September from the founder's
   `sources/caisra-permissions.md` (*"we MUST follow"*), replacing "ask
   before every action", which asked five times for one poem.
   Deleting, sending and paying still ask, as a question card.
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
13. OpenAI throughout, on cost. One model the person talks to, cheap ones
    for machinery they never see, Claude as a fallback nobody sees. The
    agent never picks its own model.
14. One sign-in screen, no onboarding flow. Never an empty state: the
    agent greets first, in its own voice, and asks one real question.
    The design of that is the founder's and is not yet built.

