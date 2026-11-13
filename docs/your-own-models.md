# Your own AI models: the plan

The founder, 8 November 2026, after trying Reason (reasonmachines.com):
"allow people to bring their own subscriptions and charge only for the
computer", then "we first plan this and do it exactly like Reason. then the
api keys". This is the plan.

**ChatGPT first, with Codex's sign-in** (the founder, 8 November 2026: "use
codex sign in. everybody does. even reason. i'm going to request the chat
gpt."). Until OpenAI approves Simeon for Sign in with ChatGPT, the person
signs in with OpenAI's device code under Codex's client id, and their agents'
calls go where Codex sends its own (`chatgpt.com/backend-api/codex`). When
OpenAI approves, only the client id changes. Built so far, on the server
(`services-core.md`, section 2, "The person's own AI accounts"): the model
accounts, the ChatGPT sign-in, the person's choice of model, and the relay
on their account. A limit moves the call to their next account, then to
Simeon's model. In the apps (9 November 2026): Settings › AI Models on the
Mac, the iPhone and the web and Windows app (step 7 below), and, since 9
November 2026, the model chosen on the composer (step 8: the founder, "the
model chosen is on the composer. not on the setting app. ours will have the
logo though"; its mark, its name and a chevron before the microphone, a
menu of Simeon and each connected provider's models, then Add More…, which
opens Settings › AI Models). Next: the Privacy Policy and Terms (step 10).
The model is chosen per person for now (every agent uses it, whichever chat
it is chosen in); per agent comes later.

## 1. What Reason does (read from its app and docs, 8 November 2026)

**Settings › AI models**, "Connect providers and choose the models your agents
use", in three lists:

- **Connected:** each account connected, with its kind ("Subscription",
  "Trial · Your plan's model starts with your first payment"), a status on
  the right ("Usage available" in green, "Usage not shared"), the picture of
  the person who connected it, and a `⋯` menu.
- **Subscriptions:** ChatGPT, Grok, GitHub Copilot, Kimi Code, Muse (and
  Claude, already connected in the founder's account), each with **Connect**.
- **API keys:** Anthropic, OpenAI, SpaceXAI, Google, Amazon Bedrock, Ant Ling,
  Azure OpenAI, Baseten, Groq, Hugging Face, Meta, MiniMax, Mistral, Moonshot
  AI, NVIDIA, OpenCode Go, Qwen, Together, and gateways (OpenRouter, Vercel AI
  Gateway, Cloudflare AI Gateway).

**The message field** carries a pill with the model in use ("Claude Opus 5.5
High"). It opens a menu: "Search all models", one row per connected provider
(a check on the one in use, `›` to its models and their effort), and "Add
more +", which opens Settings.

**Connecting** takes one of three forms:

| Provider | What the person sees | Whose sign-in it is |
|---|---|---|
| ChatGPT | "Use ChatGPT to sign in to Reason" (auth.openai.com) | OpenAI's official **Sign in with ChatGPT**, for partner apps |
| ChatGPT (also) | "Choose an account to continue to Codex" | Codex's own sign-in |
| Claude | "Claude Code would like to connect to your Claude chat account" (claude.ai, `code=true`) | Claude Code's own sign-in: approve, then a code to paste back |
| Grok | "Connect Grok, SuperGrok or X Premium+": a code to copy, then "Sign in to Grok Build" on accounts.x.ai, "Waiting for you to approve…" | Grok Build's own sign-in, by device code |
| Muse | "Connect Muse": a code, then auth.meta.com, "Meta Model API" | Meta's developer API account, by device code |

**What it charges** (its Plans page): Pro $50 a month with 1,250 credits a
week, Max $200 with 5,000; a credit is $0.04. "Reason's models and cloud
computers draw credits. Models you connect yourself are billed by that
provider." When a connected account reaches its limit, Reason tries the
person's other accounts for that provider, then its own credits, and says so
in the conversation.

## 2. What each provider allows (checked 8 November 2026)

| Provider | Allowed for Simeon? | Source |
|---|---|---|
| **ChatGPT** | **Yes, officially, once OpenAI approves Simeon.** Commercial apps join a waitlist with OpenAI's interest form. Plus and Pro (and Go) users let an app use their plan, with a weekly cap per app they set themselves. The app gets an access token (1 hour) and a refresh token (30 days) and calls the Responses API: `store: false`, `stream: true`, no `temperature` or `max_output_tokens`. A capped app gets `subscription_sharing_usage_limit_exceeded` (a 429, or `response.failed` mid-stream). | developers.openai.com/siwc (quickstart, request-client-id), help.openai.com article 20001542 |
| **Claude** | **Yes, through the real Claude Code only.** Not from Simeon's server: Anthropic: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users … developers may not collect, store, or intermediate Claude.ai credentials." The Agent SDK page: "Unless previously approved". **But the real Claude Code may run on a platform's computers, each person signing in to it with their own plan** (read 9 November 2026). Reason's screen is that sign-in. Simeon's server won't sign in as Claude Code; Claude Code itself runs on the person's computer (section 6). | code.claude.com/docs/en/legal-and-compliance, /agent-sdk/overview, support.claude.com article 13189465 |
| **Grok** | **Done the way the tools xAI's own CLI is shared with do it** (section 9, 10 November 2026). xAI publishes no programme for other apps; Grok Build's public client id is the one Hermes, Kilo Code and OpenCode sign in with, each naming itself as the `referrer`. Simeon does the same and asks xAI for an id of its own (the e-mail in section 9). xAI's terms bar access it hasn't authorised, so its answer decides. | hermes-agent docs (xai-grok-oauth), kilo.ai docs (xai), github.com/xai-org/grok-build |
| **GitHub Copilot** | **To check with GitHub.** Not read yet. | |
| **Kimi Code** | **To check with Moonshot.** Not read yet. | |
| **Muse** | **Likely yes:** it signs in to Meta's developer API (Meta Model API, `api.meta.ai/v1`), whose use is billed by Meta. Meta's terms on an app holding the token not read yet. | |
| **API keys** (section 7) | **Yes.** A person's own key, billed to them, is the use every provider documents. | |

## 3. What changes in Simeon

Every model call an agent makes already goes through Simeon's server
(`services-core.md`, section 2): the engine sends it to
`/desktop/api/proxy/v1/responses` or `/v1/messages`, and the relay
(`server/simeon/desktop/endpoints.py`, `_relay`) picks the model under the
person's policy, checks the allowance (`budget_refusal`), adds Simeon's key
and forwards it. So the change sits mostly on the server, in one place.

**On the server**

1. **Model accounts.** A table of the accounts a person connected:
   - the provider and the kind (subscription or API key);
   - a name, and who connected it;
   - the secret, sealed as the Credentials Store's are (`simeon/kit/sealed.py`);
   - for a subscription, its refresh token and when its access ends;
   - its status (usable, limit reached until a time, signed out) and the
     last error.

   Routes for the apps: list, connect (start, then poll for a device code, or
   an OAuth return), rename, make default, disconnect. Delete Account removes
   every row.
2. **The relay uses the person's account.** When the agent's model belongs to
   a connected account, the relay sends the call with that account's token to
   that provider:
   - It shapes the body as the provider asks. For ChatGPT: `store: false`,
     `stream: true`, `max_output_tokens` and `temperature` taken out.
   - It refreshes an expired token first.
   - It writes the usage row with no credits and the account named, so the
     week's allowance isn't touched.
3. **When the account reaches its limit,** in Reason's order: the person's
   other accounts for that provider, then Simeon's own model if the week's
   allowance has room. The chat says it in one line ("Your ChatGPT limit is
   reached until 4:00 PM. Using Simeon's model meanwhile."). With no room
   left, the turn stops with that sentence.
4. **The models offered.** `/desktop/api/models/available` adds each
   connected account's models (read from the provider with the person's
   token, as OpenAI advises). The engine already follows that list.
5. **The computer is what's charged.** `simeon_box_seconds` is already
   metered to Stripe, but charges nothing today (`services-billing.md`,
   section 5). With your own model, the week's credits pay for:
   - the computer's time, at a price per hour still to set (section 8);
   - what stays on Simeon: voice calls, dictation and video (the founder, 8
     November 2026: "it's ok to keep video, dictation and voice calls. the
     rest goes to chat"). Web search and pictures run on the person's
     ChatGPT account, as the helpers' cheap model does.

**In the engine**

6. **A model per agent.** Reason's pill sets the model for the chat; in
   Simeon a chat is an agent, so the choice is the agent's. The engine reads
   one set of roles for the whole computer today
   (`simeon-model-roles.ts`). The upstream window had a model menu and the
   engine's protocol carries a model override (`SubagentModelOverride`).
   Whether a per-agent choice is already there is to be read before
   building; if not, it's the one engine change.

**In the apps** (Mac, iPhone, web and Windows, the same in each)

7. **Settings › AI models**, Reason's page:
   - "Connected", "Subscriptions" and later "API keys";
   - each row's status, and the picture of whoever connected it;
   - `⋯`: rename, make default, disconnect.

   Connect opens Reason's sheet: "Connect Grok", "1 Copy this code", "2 Enter
   it on accounts.x.ai and approve", "Waiting for you to approve…", Cancel.
   For OAuth (ChatGPT) it opens the provider's page in the browser and comes
   back.
8. **The pill in the message field** ("Claude Opus 5.5 High"), and its menu:
   - Search all models;
   - the providers, with a check on the agent's and `›` to their models and
     effort;
   - Simeon's own models first;
   - Add more.

   Done 9 November 2026 on the Mac, the iPhone and the web and Windows app
   (`ComposerModelMenu`), with our logo (the founder's "✳ Claude Opus 5.5",
   "⌘ Simeon"): the mark, the model's name and a chevron before the
   microphone (on the iPhone the mark and the chevron, for room); the menu
   is Simeon, then each connected provider with a tick on the one in use
   and `›` to its models, then Add More…. Left out: search (a handful of
   models) and effort (not offered by the server). The choice is the
   person's, for every agent.
9. Every new string in the ten languages.

**In the documents**

10. The Privacy Policy and Terms: Simeon keeps the person's provider sign-ins
    and keys, sealed, and sends their agents' work to the provider they chose,
    under that provider's terms. `services-core.md` and `services-billing.md`
    describe the new relay and the computer's price.

## 4. Order of work

| Step | What | About |
|---|---|---|
| 0 | The founder: OpenAI's interest form (openai.com/form/sign-in-with-chatgpt-interest/); a short email to Anthropic (below); questions to xAI, GitHub, Moonshot and Meta | 30 minutes |
| 1 | Server: model accounts, the relay on a person's account, the fallback, the models offered, the computer's price in credits; tests with stand-ins for each provider | 3 to 4 days |
| 2 | Engine: a model per agent, if not already there | 1 to 2 days |
| 3 | Apps: Settings › AI models and the pill, Mac, iPhone, web and Windows; translations | 4 to 5 days |
| 4 | Providers switched on one by one as each says yes; ChatGPT first | a day each |
| 5 | API keys (section 7) | about a week |

Each step is checked with stand-ins (no real provider is reached in tests),
then in the app on a Mac and an iPhone with the founder's own accounts.

## 5. The email to Anthropic

> Simeon (simeonlabs.com) gives people a team of AI agents, each with a cloud
> computer. We'd like our users to use their own Claude plan for their agents:
> they sign in on claude.ai, and their agents' model calls draw on their plan's
> limits, with Simeon charging only for the computer. Is there an approved way
> to do this, and what would you need from us? If not, may we run the
> unmodified Claude Code on each user's cloud computer, signed in by the user
> with their own plan, for the work they give it?

## 6. Claude through Claude Code (the founder, 9 November 2026: "do it like Reason. Claude code.")

**What Anthropic allows** (code.claude.com/docs/en/legal-and-compliance, read
9 November 2026). A product may preinstall or run Claude Code "in hosted
sandboxes or other agent infrastructure" under Anthropic's Commercial Terms,
if:

- "The Claude Code binary must not be modified", and none of its sign-in
  methods is removed or restricted;
- "Each end user must authenticate with their own … Claude subscription plan
  credentials", billed to them; the product doesn't pay for, resell or
  intermediate their use.

The same page forbids the other way: "Anthropic does not permit third-party
developers to offer Claude.ai login into their own applications, or to route
requests through Free, Pro, Max, or Ultra plan credentials on behalf of their
users. Moreover, developers may not collect, store, or intermediate Claude.ai
credentials or session tokens — sign-in to a Claude account must complete
through Anthropic's own flow", adding that this doesn't prevent "an end user
from signing in to the unmodified Claude Code binary with their own Claude
subscription, including where a platform hosts Claude Code". So the ChatGPT
way (the server keeps the sign-in and makes the calls) is not open for Claude;
Claude Code on the person's computer is. Reason's screen (the founder's
screenshot: "Claude Code would like to connect to your Claude chat account",
approve, paste the code back) is Claude Code's own sign-in.

**What Simeon does:**

- **Where it runs.** The person's cloud computer, where their agents' engine
  already runs (the agents on the server were taken out in #581). **Correction,
  9 November 2026:** the computers people use run box2's pinned image
  (`box/e2b/build_template.py`, `BOX2_IMAGE`, on E2B and on the Docker box
  servers alike), not `box/Dockerfile`, so C2's install in the Dockerfile
  reached none of them. The engine now installs Claude Code itself
  (`desktop/source/host/claude-code/claude-code-install.ts`): Anthropic's own
  npm package, unmodified and pinned (2.1.311), the first time Connect Claude
  or a Claude turn needs it, into `/var/tmp/simeon-claude-code` (outside the
  person's home and the data root, so never in the backup). Since 2.1 the
  package carries a native program; Node runs only its install script, so
  box2's Debian Node 20 is enough. Measured here with the real package: 4
  seconds, 281 MB, `2.1.311 (Claude Code)`. The first Connect waits up to 90
  seconds for it, or says to try again in a moment while it finishes. So
  only the engine needs publishing; no image.
- **The sign-in.** AI Models › Subscriptions › Claude › Connect wakes the
  computer, which runs `claude auth login`. The sheet shows the link Claude
  Code prints; the person approves on claude.ai and pastes the code Claude
  shows; the app hands it to Claude Code on the computer, which finishes its
  own sign-in. Claude Code keeps the sign-in in its own file on the computer
  (`~/.claude/.credentials.json`). Simeon's server keeps only that Claude is
  connected, with the e-mail and plan Claude Code reports (`claude auth
  status`), never the sign-in.
- **Not in the backup.** The computer's backup goes to Simeon's own store
  (`box-store-sync`), so Claude Code's credentials file is left out of it. The
  sign-in lasts while the computer sleeps and wakes, and (since 9 November
  2026) across an engine published: the new engine goes onto the same
  computer, its disk kept (`docs/services-core.md`, "Simeon's cloud computer
  on E2B"). Until then every engine published gave each person a new
  computer, which got back only its backup, and Claude was signed out on all
  of them (the founder: "we cant have people always having to sign back
  in"). A new computer image, a move to another server, or a swap that fails
  still makes a new computer, and the person connects Claude again.
- **Signed out, said.** When a turn finds Claude Code signed out, the engine
  tells the server (`POST /desktop/api/models/accounts/claude/signed-out`,
  log line `desktop.models.signed_out`): the account shows signed out in AI
  Models (red, with Connect Again), Claude is offered to the agents no more,
  and the engine reads its roles again, so turns go to Simeon's models
  without trying Claude first. Connecting again brings back the model chosen.
  The engine tells it with the computer's own credential; until 11 November
  2026 the route took the app's sign-in only and answered every report 401,
  so AI Models went on showing Claude connected and the composer went on
  naming it while the chat said it wasn't (the same held for the plan's
  usage, below). Once the server has taken it, the chat says so as it says
  any change of model, "Changed from ✳ Claude Opus 5.5 to ⌘ Simeon"
  (`claudeCodeSignedOut`, the founder: "can we change that massively long
  text to the original changed from x to y"), and the apps read the model
  again on that line, so the composer names Simeon at once. Only when the
  server doesn't take it does the long line say why (written for the person,
  `forPerson`, at most once an hour), since the choice is still Claude.
- **The person's words reach Claude.** The handler read the turn's message
  as a plain string, which the engine never keeps it as (it is a wrapped
  `RedactedString`), so every turn Claude ran was given none of the person's
  words, only the line for an empty turn ("The person sent nothing to read").
  Claude answered "I'm here whenever you need me" to "archive anything not
  important" (the founder's screenshot, 9 November 2026), and before the
  lead line it went looking around the computer instead. Fixed the same day
  (`claude-code-turn-words.ts`): the message's own words, and before them
  any earlier messages the turn took in, sent while the agent was busy. The
  tests had passed plain strings to the hook, never the turn's real message;
  one now reads the engine's own wrapped message. Pictures and files
  attached to a message don't reach Claude yet.
- **What Claude said, in the history.** Each message and reaction Claude
  sends, and its last words, go into the model's history as the loop's own
  turns do (`claudeCodeHistory`). Simeon's model, answering a later turn,
  sees each message answered; with only the person's messages there, it told
  them "a few of your messages got dropped on my end" and did the work again.
- **The agents on Claude.** With Claude chosen in the model menu, an agent's
  turn is run by Claude Code on the computer (`claude -p`, its session resumed
  per agent), in place of the engine's own loop. Simeon's tools (messages to
  the person, reactions, cards and forms, the browser and the screen, the
  person's connected apps, other agents) are given to it as an MCP server the
  engine runs on the computer; Claude Code's own tools (files, web search)
  are its own. Its own shell is turned off: commands run in Simeon's Shell,
  over the same MCP server, under the person's safety review (C4 part 4,
  `CLAUDE_CODE_TOOLS_OFF`). Its permission prompts go to the engine's safety review
  (`--permission-prompt-tool`), so auto-review still decides. The model
  calls are Claude Code's, on the person's plan: no Simeon credits, no
  usage row.
- **When it can't.** A plan limit, an expired sign-in or Claude Code failing
  to start: the turn runs on Simeon's model instead, on credits, and the chat
  says why once (as ChatGPT's limit does).
- **Its own words are its answer** (9 November 2026, after the founder's
  first real turns: "TAKING FOREVER TO ANSWER", every reply opening with
  "Sorry, I missed your last message"). Claude Code often answers in its own
  words rather than through SendMessage; those words reached no one, and the
  engine poked Claude three more times in hidden turns ("they received
  nothing and are still waiting"), the person's next message waiting behind
  them. After a turn the person started, Claude's last words are now sent as
  its reply when nothing else reached them; no hidden turn pokes it, and the
  closing nudge, which reads the engine's own history that Claude Code
  doesn't write, is not asked (`claudeCodeReplyToSend`, `turn-runtime.ts`).
  From 9 to 10 November they were also sent when it worked on after its last
  message; its notes to itself then reached the person ("I told Bass I'll
  use Nov 15…"), so once it has sent a message its later words stay its own,
  and the brief tells it to send what came of the work itself. The host
  log's own lines showed every turn `outcome=done`: Claude was answering.
- **A long command wakes it when it ends** (12 November 2026). Tessa wrote
  "Now I'm switching on the two Azure services. That takes a few minutes"
  and then nothing came until the founder wrote "let me know": Claude Code
  ended its turn trusting the brief's "you're notified the moment it
  completes", and nothing ever did, on Claude or on Simeon's model. Now a
  Shell command still running when its wait ends, or started with
  `block_until_ms: 0`, keeps running in the background on the computer, and
  its end wakes the agent in a hidden turn, which Claude Code runs like any
  other (`docs/services-agents.md`, "A long command keeps running in the
  background"). Claude Code's Shell is Simeon's, over MCP, so the same
  watch catches it. The brief and the note added to it
  (`claudeCodeBriefNote`) say that only such a command wakes it: before
  saying something "takes a few minutes" it starts one that waits for it
  (`--wait`, or a loop that checks). In the wake's turn only what it sends
  with SendMessage reaches the person.
- **Who it is, first.** Claude Code's own instructions, which the agent's
  brief is added to, make it a coding assistant: it looked around the
  computer with a command or two before answering (each first command waits
  on the safety review, 7 to 8 seconds) and answered tersely. The brief now
  opens with who it is: not a coding assistant, one of the person's agents
  in Simeon, in its own voice; answer first, and look at files or run
  commands only when the request needs it (`claudeCodeBriefLead`, 9
  November 2026). Claude Code's own instructions stay: replacing them
  (`--system-prompt-file`) is not tried until a real turn on a Claude plan
  shows it is accepted.
- **How hard it thinks.** Beside the model on the composer, on the person's
  own plan: Light, Medium, High, Extra High, Max (Reason's words). Claude's
  are Claude Code's `--effort` (`low` to `max`, read from `claude --help` of
  2.1.311; High until one is chosen); ChatGPT's are Light, Medium and High
  only, the three every Codex model takes (Medium until chosen). Kept with
  the choice (`users.meta.own_model_effort`, `PUT models/own` `{effort}`);
  the engine reads it with the roles (`claudeCodeEffort`).
- **Which calls think at the effort chosen** (12 November 2026, the founder:
  every way of running the agents behaves the same). The agent's own
  replies, in its chat and in group chats, and a general helper an agent
  starts for a task: the effort chosen. Background work, on the same model
  and the same plan or key, always at low (a model without low: the lowest
  it takes): the helpers on the computer's screen, in its browser and on a
  video, the safety review of a command or a browser action, the memory
  written after a turn, a chat's summary, a title, a web search. Simeon's
  own models already ran this way (`isCheapSimeonSession`,
  `isHelperSimeonSession`, `provider-session.ts`). From 11 to 12 November
  everything ran at the effort chosen; at High on the founder's Claude plan,
  a helper on the screen thought for about 2 s before each click, and the
  safety review took 6 to 8 s per command.
  - **ChatGPT, the other plans and API keys** go through the server's relay,
    which reads why each call is made from the engine's
    `x-simeon-call-reason` (`simeonCallReason`). Background work:
    `computer`, `browser`, `video`, `safety`, `memory`, `summary`, `cheap`
    (`own_models.BACKGROUND_REASONS`, `call_effort`). The effort chosen:
    `chat`, `routine`, `wake`, `nudge`, `voice`, `agent_wake`,
    `first_message`, `background` (an agent's turn nobody asked for, resumed
    or woken) and `helper`. A web search on the account asks low, as
    Simeon's own search does.
  - **Claude** runs in Claude Code on the computer. A helper on the screen or
    in the browser is marked in the agent's config (`claudeCodeBackground`,
    read as `isHelperSimeonSession` reads it, `turn-agent-composition.ts`)
    and its turn gets `--effort low` (`claude-code-agent-turn.ts`); each
    small job too (`claudeCodeTextChoice`, `claude-code-text.ts`). A video
    helper stays on Simeon's video model. The host log shows it:
    `claude-code turn helper=… effort=low`, `claude-code job … effort=low`.
- **A choice applies to the next message.** The engine read the roles every
  five minutes, so a model or an effort chosen on the composer reached the
  agents up to five minutes later (the founder connected Claude at 22:44 and
  his next two messages were answered on Simeon's model). Before each agent
  turn, the roles are now read again when the last read is more than fifteen
  seconds old, the turn waiting at most three seconds for it.
- **The person's pictures go to Claude** (12 November 2026: an agent on
  Claude answered eight pictures with "None of the 8 reached me"). A picture
  sent in the chat travels on the message as a selected image, never in its
  words, and the turn handed Claude Code only the words. Now each picture is
  read from the turn's message (its bytes, or the blob it was kept under),
  made as small as Simeon's own model gets it (1024 pixels a side, 1 MB), and
  sent before the words as an image in Claude Code's stream-json message, at
  most 20 a turn; the words say how many came, where their files are (to
  upload or attach), and any that couldn't be read
  (`claude-code-turn-images.ts`). Host log when one can't be read:
  `claude-code turn pictures not read`.

**The steps:**

| Step | What | About |
|---|---|---|
| C1 | This plan | done |
| C2 | The image installs Claude Code (2.1.311, its stable release); the credentials file kept out of the backup; the engine's commands `claudeCodeStatus`, `claudeCodeSignInStart` (the link), `claudeCodeSignInFinish` (`{code}`), `claudeCodeSignInCancel`, `claudeCodeSignOut` (`desktop/source/host/claude-code/claude-code-account.ts`) | done 9 November 2026, tested against a stand-in `claude`; not yet on any computer |
| C3 | The server's Claude row (no token, `POST /desktop/api/models/accounts/claude`), Connect Claude on the Mac, the iPhone and the web (the shared cores' `startClaude`, `finishClaude`, `cancelClaude`), Claude Opus and Sonnet in the model menu, the ten languages | done 9 November 2026: server tests, web tests and a Chromium check against a stand-in server and computer; the Swift not compiled (no Swift here) |
| C4 | The engine runs a Claude turn through Claude Code with Simeon's tools over MCP, the safety review, the fallback | in progress. Part 1 done 9 November 2026: the engine's roles read the `claude-code` row (`claudeCode`: `opus` or `sonnet`, kept in `model-roles.json`; `primary` stays Simeon's), and `desktop/source/host/claude-code/claude-code-turn.ts` runs one turn (`claude -p` in stream-json, the brief and the MCP config in private files, `--permission-prompt-tool`, each agent's session in `claude-code-sessions.json`, started afresh when the computer no longer has it) and sorts its ending: done, the plan's limit (and until when), signed out, not installed, stopped, failed. Tested against a stand-in `claude`; nothing calls it yet. Part 2 done 9 November 2026: Simeon's tools as an MCP server inside the engine for the length of a turn (`simeon-mcp-server.ts`: MCP's Streamable HTTP answered in plain JSON, on 127.0.0.1 at a path holding a token made for the turn, refusing a web page's `Origin` and any other host name; one log line per call with the tool and how it ended, never its input or output), the engine's own tools bridged with their names, descriptions, schemas, `execute` and `render` (`claude-code-tools.ts`; the tools Claude Code has its own of, files, shell, web search and fetch, its to-do list, left out), and `ReviewPermission` answering Claude Code's permission asks from the safety review. Tested with Simeon's real SendMessage, and end to end with a stand-in `claude` that reads the config file, connects, lists and calls. Part 3 done 9 November 2026: the agent's own turns (never a subagent's, a box-scoped helper's or a shared room's) run through Claude Code when the roles name it. The agent's user-message handler (`handle()`), once the turn is set up and before its own loop, calls the host's hook (`claude-code-agent-turn.ts`, in the agent's config as `claudeCodeTurn`) with the turn's own tools built as the loop builds them, the brief, the context and the person's words; Claude Code's last words are kept as the turn's text. The brief gets a note naming the tools `mcp__simeon__<Name>`; the context goes with a session's first turn only. When Claude Code can't, the loop answers on Simeon's model, and Claude waits: until the limit resets (an hour when Claude Code doesn't say), five minutes after the sign-in is gone, an hour when not installed, a minute after a failure. A turn the person stopped is over. Host log: `claude-code turn agent=… model=… outcome=… tools=… ms=…`, and one `claude-code tool=… ok=…` line per tool call. Tested end to end with a stand-in `claude`; the full engine suite passes (the one failure is a renderer asset not built in the container). Part 4 done 9 November 2026: **the shell goes through the person's safety review**: Claude Code's own `Bash` (and `BashOutput`, `KillShell`) is off for the turn and the engine's `Shell`, which carries the review, is offered instead; the brief says so. Its own `AskUserQuestion` is off too (10 November 2026): no app shows it, so a question goes as Simeon's question card (SendMessage's widget), and the brief's note says so. Simeon's tools are allowed without asking (`--allowedTools mcp__simeon`: they carry their own cards and reviews); what still asks (a file written, a page fetched) is allowed, the agent's own computer as with the engine's own tools. **The chat's one line** when Claude can't (`shared/words/areas/models.ts`, the ten languages; `host/extensions/transcript/claude-code-notice.ts`): the plan's limit, the sign-in gone (with where to connect again), or Claude Code not running; once an hour per agent and reason. The tools offered are named once a run in the host log (`claude-code tools offered=…`), so the first real turn shows the list. Checked against the real Claude Code 2.1.311 (installed here, run without signing in): every flag the engine passes is accepted (`--append-system-prompt-file`, `--permission-prompt-tool` and `--max-turns` are hidden from `--help` but parse); the words the engine reads are the program's own ("No conversation found with session ID", "Not logged in", "Please run /login", "Invalid API key"); its plan limit comes as a `rate_limit_event` with `status: \"rejected\"` and `resetsAt` in seconds, or an API error coded `usage_limit_reached`, and the turn now stops at that event instead of waiting for the reset. Still to do after a real run: Claude's tool calls kept in the engine's history (the loop's own interaction handler); the list of tools left out checked against that run |
| C5 | Docs, Privacy Policy and Terms, checks | 1 day |

Until C4, choosing Claude moves nothing: the engine skips the `claude-code`
row it doesn't know and the server answers a call named `own:claude:…` with
Simeon's model, on credits. C2 and C4 go out in one engine release, so
Connect Claude never works on a computer that can't yet run a turn on it (on
today's computers its start answers 404 and the sheet says the computer needs
an update).

C2 to C4 reach people with a new engine alone (`npm run publish:host-bundle`
on a Mac, `docs/building-the-app.md`); the founder said to publish on 9
November 2026. No computer image is needed (the engine installs Claude Code).
Tests use a stand-in `claude` program; nothing reaches claude.ai or
Anthropic in a test.

**Still true:** Simeon's own Claude models on credits stay as they are, and a
person's own Anthropic API key (section 7) comes later.

### How much of the plan is used (9 November 2026)

The founder: "we need the usage for both claude and chat gpt ... it should
look like usage and billing ... then a way to go to their plan in claude or
chat website ... you can click on chatgpt and claude, like with connectors".

- **In the apps.** In Settings › Usage & Billing, once ChatGPT or Claude is
  connected, "Subscriptions" lists each account under Simeon's own usage
  and plan: its icon, its name over "5-hour limit 42% · Weekly limit 18%"
  (its plan before its first use), and `›` to its page (the founder: "it's
  okay to keep simeon as it is. if one is connected, have Simeon usage, and
  below a tab Subscriptions ... no need to have it in AI models"). With
  nothing connected, Usage & Billing is as it was. The page: "Usage", the
  plan's 5-hour limit and weekly limit drawn as
  Usage & Billing draws its meters (what is used, when it resets, the bar,
  red past 90%), with when the provider last said it under; then "Plan",
  the plan and Manage Plan ↗, the provider's own page
  (`chatgpt.com/codex/settings/usage`, `claude.ai/settings/usage`). Mac
  (`SettingsModelAccountPage`) and the web and Windows app (the same name
  in `SettingsModels.tsx`); the words from the shared core (`PlanUsage`).
  Before the account's first use, one line says it shows after the agents
  next use it. A window whose reset has passed reads as unused until the
  provider says again; nothing is guessed.
- **ChatGPT's** comes with every answer through the relay: the headers
  Codex reads (`x-codex-primary-used-percent`, `-window-minutes`,
  `-reset-at`; the same for `secondary`). The relay keeps them on the
  account (`model_accounts.chatgpt_usage`, `keep_usage`), in a short session
  of its own, never in the way of the answer (`desktop.models.usage_not_kept`
  if it fails).
- **Claude's** comes from Claude Code on the person's computer: its stream's
  `rate_limit_event` carries `unifiedWindows` (`five_hour`, `seven_day`: a
  `utilization` and a `resetsAt`). After each turn the engine sends the last
  it said (`POST /desktop/api/models/accounts/claude/usage`, log line
  `desktop.models.usage provider=claude windows=five_hour=42,weekly=18`),
  again only when it changes or every fifteen minutes. Simeon never asks
  Anthropic for it with the person's sign-in. It sends it with the
  computer's own credential, which the route refused until 11 November 2026
  (401): no usage ever showed, and the page said "Shown after your agents
  next use Claude" all day (the founder: "other models usage is a lie").
- Usage & Billing's Subscriptions lists the plans' accounts only, never an
  API key's, which has no plan to show (11 November 2026).
- Kept in `desktop_model_accounts.usage` (migration
  `desktop_model_usage_1109`), in each account's JSON as `usage`.
- **What reaches people when.** The server and the apps' pages with the
  next deploy and app builds; ChatGPT's figures from the first answer after
  the server deploys. Claude's need the new engine published
  (`npm run publish:host-bundle` on a Mac).

## 7. API keys (10 November 2026)

The founder: "these are all the keys i want our users to be able to use.
Below subscription something called api keys." The list, in the founder's
order, with Connect on each: Anthropic, OpenAI, SpaceXAI, Google, Amazon
Bedrock, Ant Ling, Azure OpenAI, Baseten, Cerebras, Cloudflare Workers AI,
DeepSeek, Fireworks, GitHub Copilot, Groq, Hugging Face, Meta, MiniMax,
Mistral, Moonshot AI, NVIDIA, OpenCode Go, Qwen, Together, Xiaomi, Z.AI.
The reconstruction has none of them; everything here is new.

**The server's part:**

- `server/simeon/desktop/key_providers.py`: one entry per provider, where
  its API is, how it reads a key (`Authorization: Bearer`, Azure's
  `api-key`, Anthropic's `x-api-key`), the wire the relay speaks to it, the
  page where the person makes a key, the details it needs besides the key
  (Azure's endpoint and deployments, Cloudflare's account id, Bedrock's
  region, each checked before anything is sent: the server only sends a key
  to the provider's own domains), and the models worth offering. Read from
  each provider's documentation on 10 November 2026; not one was tried with
  a real key.
- **Three wires, no engine release.** Every `own:` call reaches the server
  on OpenAI's Responses wire. OpenAI, SpaceXAI and Azure take it as it is.
  Claude, and MiniMax (its recommended wire), get Claude's own Messages
  (`messages_wire.py`): the brief cached at its end and the conversation's
  last block cached, so each call reads the one before from the cache
  (about a tenth of the price on the person's key), adaptive thinking
  summarized, the effort as `output_config.effort`, no sampling settings
  and no forced tool use. Every other provider gets Chat Completions
  (`chat_wire.py`). Both write the answer back as the Responses events the
  engine's SDK reads; checked by running the engine's own SDK
  (`ai` 4.3.17, `@ai-sdk/openai` 1.3.24) on their output: words, thinking,
  tool calls with their arguments, the finish and the cached tokens all
  read back.
- **What a provider wants back.** DeepSeek, Kimi, MiniMax, Xiaomi, GLM and
  the hosts of those models want what the model thought back with its tool
  calls; Gemini a signature on each call; Claude its thinking blocks,
  signed. The engine's wire drops all of it, so the server keeps it six
  hours by call id (Redis, `desktop:own-kept:<user>:<call>`) and gives it
  back on the turn that made the calls. Claude's blocks go back where Claude
  wrote them, between its words and its calls.
- **A model that refuses the rest** (a 400 or 422: an effort, a usage
  option, a picture it can't see) is sent the plain request once, and only
  that for a day when it took it (`desktop.models.key_plain`).
- **Connect** (`POST /desktop/api/models/accounts/keys/{provider}`): the
  key is tried first, with the provider's model list (no cost) or, where
  there is none (MiniMax, Azure's deployments), a one-word call (a few
  tokens on the person's key). A key the provider refuses is never kept.
  Kept sealed with its details and the models it reaches (a new `models`
  column); its name is its last four characters. The same key again
  replaces its row.
- **Models offered**: the ones named in the catalogue that the key's list
  has, by their names (Claude Opus 5.5…, GPT-6 Astra…, DeepSeek V4 Pro…);
  for the hosts of many models (Together, Fireworks, Hugging Face, NVIDIA,
  Cloudflare, Bedrock, OpenCode Go, Baseten) others from the list too, the
  families agents do best with first and the bigger first within each,
  nothing under 14B when the host lists bigger (an agent needs a model that
  calls its tools reliably), one line per name, 24 at most; a host that
  gives no name gets one read from the id ("Gemma 4 27B", "Qwen3.5 235B
  A22B": no "Instruct" or "it"). This is the composer's menu: each provider
  a line with its mark, its models in its submenu, the effort beside the
  model only where the provider takes one (Anthropic's five; none for
  DeepSeek, Groq or Together). The machinery (titles,
  summaries) runs on the provider's cheaper model where the key reaches one
  (Claude Haiku 5.5, GPT-6 Luna, Gemini 3.8 Flash, DeepSeek Flash…): the
  person's key pays for it.
- **Efforts**: Anthropic's five (Medium until chosen: Anthropic's own
  default), OpenAI's, Azure's, SpaceXAI's and Google's three, Kimi's Light,
  High and Max. The others take none. Background work runs at low (12
  November 2026, section 6).
- **Same rules as a plan's.** The person's other keys for the provider in
  turn; a rate limit waits as the provider says (`retry-after`), credits run
  out an hour; then Simeon's model on credits. A key the provider no longer
  takes (401) shows signed out. A request the provider refuses (other 4xx)
  goes back to the agent in the provider's words. Web search and pictures
  stay on Simeon's for a key.

**Not offered yet** ("Soon" in the list): **GitHub Copilot**, which has no
API a key opens (only its own CLI's sign-in, and GitHub's terms bar sharing
its tokens); **Meta**, whose Model API terms forbid a key passing through
another's server (§3.1, §10.1; the founder: "Lets wait on meta"). **Coding
plans** (Z.AI's GLM Coding Plan, Qwen's Coding Plan) are for their own
tools only: the key here is the pay-as-you-go one. NVIDIA's free key is for
trying models out.

**The apps' part** (Mac, iPhone, web and Windows; `ios/SimeonCore`'s
`KeyProviders.swift` and the web's `keyProviders` in `aiModels.ts`):

- **API keys**, under Subscriptions in Settings › AI Models: each provider
  with its logo and Connect, in the server's order; "Soon" where it isn't
  offered. SpaceXAI, Anthropic and OpenAI carry one line more, for a person
  who has the plan: connect the plan instead ("SuperGrok or X Premium+?
  Connect Grok under Subscriptions.", Claude Pro or Max, ChatGPT Plus or
  Pro), so nobody pays twice. The footer: "Each provider bills the calls on
  your key."
- **Connect** opens the consent, as a plan's, in a key's words (the key is
  kept encrypted on Simeon's server and sent only to the provider; the
  agents never see it; the provider bills each call), with the provider's
  own logo. Then the key sheet: 1, make a key on the provider's page (Open,
  https only); 2, paste it (hidden as a password; the keys in it at once),
  and the details the provider needs, named (Azure's endpoint and
  deployments, Cloudflare's account ID, Bedrock's region, filled with
  us-east-1). "Checking with DeepSeek…" while the server tries it; a refused
  key says why in the provider's name and is cleared, never kept in the app.
  Connected, the key's best model is chosen when none was.
- **The key's account** shows under Connected as the provider, "API key
  …7f3a" (its last four); Add Another and Connect Again open the key sheet;
  a name the person gives it replaces the provider's.
- **Logos**: LobeHub's icons (github.com/lobehub/lobe-icons, MIT; credited in
  `NOTICE`, each mark its owner's trademark), drawn once into tiles on the
  brand's ground (192) and marks for the composer: the web's
  `clients/apps/app/src/assets/providers/`, the Mac's and the iPhone's
  `Providers/<slug>` and `Providers/<slug>-mark` (template).

**Verified:** `server/tests/desktop/test_chat_wire.py` (23),
`test_messages_wire.py` (10), `test_api_keys.py` (23, every provider stood in
by respx), and the engine's SDK on both translators' output; the apps' core
in Swift on Linux and in vitest, and the web app in Chromium against a
stand-in server with the real catalogue (`docs/web-app/PROGRESS.md`, 10
November 2026). **Not verified:** any provider with a real key; the Mac and
iPhone apps built and run.

## 8. For the founder to decide

1. **The computer's price** when an agent runs on the person's own model:
   credits per hour of the computer (it can be measured from
   `simeon_box_seconds`), or a plan that covers it (Reason's Pro, $50 with
   credits for computers and its own models).
2. Whether a person on their own model still needs a plan (Reason: yes).
3. Fall back to Simeon's models when their limit is reached: on by default,
   as Reason does?
4. Whether a teammate's agents may use an account someone connected (Reason's
   "Usage not shared").

## 9. Grok, on the person's own plan (10 November 2026)

The founder: "now we need to bring meta and grok - both should be the same
as chat gpt", then "No api key. Sign in." and "lets do grok. we'll decide on
meta later". Grok is now what ChatGPT is, read from Grok Build's own code
(xai-org/grok-build, Apache-2.0; nothing has met xAI's real servers in a
test):

- **Connect.** AI Models › Grok › Connect, the consent, then the same sheet
  as ChatGPT's: "Copy this code", "Enter it on accounts.x.ai/oauth2/device
  and approve" (the page opens with the code already in it), "Waiting for
  you to approve…". The server asks xAI for the code (`grok.py`, OAuth's
  device code at `auth.x.ai`, Grok Build's client id, Simeon as the
  `referrer`) and asks no faster than xAI wants (`slow_down`).
- **Who may.** Signed in, the plan is asked whether it may use Grok here
  (the proxy's `/settings`, the gate Grok Build's own paywall reads). A plan
  it bars (Free) is never kept: the sheet says "Grok didn't allow this
  account to sign in here. It needs SuperGrok or X Premium." with **See Grok
  Plans** (grok.com/supergrok) and Try Again, and the sign-in is ended at
  xAI.
- **The account.** Kept sealed like ChatGPT's; its plan is the access
  token's `tier` (SuperGrok, SuperGrok Heavy, X Premium, X Premium+…);
  refreshed five minutes ahead; Disconnect ends it at xAI (OAuth's revoke).
  A team's sign-in is its own account.
- **The models.** Grok 4.6 (chosen on connecting) and Grok 4.5, Grok
  Build's two, 500,000 tokens each. Thinking: Light, Medium, High (Grok's
  own default) and Extra High on 4.6; up to High on 4.5. The machinery
  (titles, summaries, memory) runs on the chosen model, as Grok Build's, at
  low effort since 12 November 2026 (section 6, which calls think at the
  effort chosen).
- **The calls.** Where Grok Build sends its own
  (`cli-chat-proxy.grok.com/v1/responses`), with its headers and Simeon named
  as the client, on the Responses wire both its models use. The brief goes as
  a `system` message; `store: false`. Web search is the proxy's own
  `web_search` tool on Grok 4.6; pictures are Grok Imagine on xAI's API,
  except for Free and X Basic, which xAI keeps from pictures (Simeon's
  draws them, on credits).
- **The plan's usage.** xAI's billing (`/billing?format=credits`) says how
  much of the week's or the month's credits is used and when the period
  ends: asked after an answer, at most every five minutes, and shown as
  "Weekly limit" or "Monthly limit" in Usage & Billing and on Grok's page.
- **When it runs out.** Out of credits (402, or 403 or 429 saying so) moves
  the call to the person's next Grok account, then to Simeon's model, and the
  account waits until its period ends ("Limit reached until …").

**The e-mail to xAI** (to send to legal@x.ai, and to the developer contact
on x.ai):

> Subject: A client id for Simeon to sign people in with their Grok plan
>
> Hello,
>
> We make Simeon (simeonlabs.com), a team of AI agents that work on a cloud
> computer for each person. People ask to use the Grok plan they already
> pay for (SuperGrok, X Premium) for their agents, as they can in Hermes,
> Kilo Code and OpenCode.
>
> Today we sign them in with OAuth's device code at auth.x.ai, under Grok
> Build's public client id with `referrer=simeon`, and send their agents'
> calls to the Grok Build proxy with Simeon named as the client. The person
> approves on accounts.x.ai; we keep the tokens encrypted on our server,
> never share them, end the sign-in when they disconnect, and respect the
> plan's gate and its credits.
>
> We would like a client id of our own, and to know the terms you want us
> to follow. We'll change anything you ask.
>
> Simeon Labs

## 10. The chat says when an agent's model changes (10 November 2026)

The founder, with a picture of the line he wanted: "whenever a model is
changed, i want this to fire in the chat. that at least tells us that it's
working." So the chat says **Changed from ⌘ Simeon to ✳ Claude Opus
5.5**: small and grey, centred, each model with its mark as on the
composer.

**When.** At the start of each of an agent's own turns (a message, a
routine, a wake; not a subagent's, a box-scoped helper's or a shared
room's), right after the engine reads the roles (`beforeTurn` in
`turn-agent-composition.ts`), it works out which model the turn runs on
(`turnModelOf`, `host/extensions/inference/turn-model.ts`):

- Claude on the person's plan when the roles name the `claude-code` row
  (`own:claude:…`, named as the server names it, e.g. Claude Opus 5.5);
- else the person's own model when the primary is `own:<provider>:<model>`
  (ChatGPT, Grok or a key's model), with the server's name for it, or the
  model's id when the server gave none;
- else **Simeon**: any of Simeon's own models is Simeon, so Simeon moving
  from one GPT to another is never a line about the person's choice.

It compares that with the model it last saw for the agent, kept in
`model-seen.json` in the engine's data folder (mode 600). A different model
writes one line; the same model, none; the same model under a better name
is only kept. An agent the file doesn't know yet (every agent once this
engine arrives) is compared, at its first turn, with the model the computer
was last on before the engine started: the roles its last run kept
(`model-roles.json`, read as the engine starts), when the agent was there
then. The founder switched from the Claude plan to an Anthropic key, and
the first message the new engine ran showed no line: that first turn had
only been remembered (fixed the same day). An agent made since the engine
started, or a computer that kept no roles, is only remembered, so nobody
gets a line for a change nobody made. When the server no longer lists the
model it was on (the Claude plan's, once a key is chosen), its name is read
from its id: `claude-opus-5-5` is "Claude Opus 5.5".

The line comes once the computer runs the engine that writes it: the server
sees a newly published engine within 10 minutes (`BUNDLE_POINTER_TTL`) and
moves a computer to it the next time the app reaches it while it is idle
(`sand.box.updated_in_place`).

**How.** The line is an `event` in the chat's own lines,
`{type: "model-changed", from: {model, name, provider}, to: {…}}`, written
as the Claude line is (`transcript/chat-line.ts`, shared by both), into the
open chat, a running one or one at rest. It is only for the person: it
never reaches the model's conversation, never wakes the agent (it is not
the timeline's path, which would run a turn for the agent to answer), and
is never written in a group chat. Writing it waits a second at most and
never fails a turn; the host log says `model-changed agent=… from=… to=…`
(`docs/services-core.md`, "When it misbehaves").

**The apps** (`ModelChange` in `SimeonCore/Chat.swift`, `modelChange` in
the web app's `core/chat.ts`) draw it as a centred line, the sentence
translated whole ("Changed from %@ to %@", the ten languages) so each
language keeps its own order, with each model's mark and name in place of
`%@`: Simeon's ⌘, Claude's ✳ in its colour, the others' marks in the ink.
An old app that does not know the event leaves it out.

It needs the engine published (a host bundle) and the apps rebuilt.

## 11. Codex codes for a cloud agent on the ChatGPT account (13 November 2026)

The founder: "running one in Codex is not built." A cloud agent's coding
(`docs/services-agents.md`, section 1) now runs in Codex when the person's
plan is ChatGPT's, as it runs in Claude Code when it is Claude's.

**No second sign-in.** The person connected ChatGPT once, on the server
(section 3). Codex on the computer is not signed in and holds no ChatGPT
token. It is given a model provider of its own whose address is a relay
inside the engine, on the loopback, for the length of one turn
(`host/codex/codex-relay.ts`). The relay hands each of Codex's calls to the
server's model relay with the computer's own credential, the model named
`own:chatgpt:<model>` and the reason `coding`.

**On the server** (`own_models.relay`), a call with that reason on a
ChatGPT model:

- goes to ChatGPT on the person's account whatever model they chose for
  their agents (a person on Simeon's model with ChatGPT connected can still
  have a cloud agent code in Codex);
- keeps Codex's own body (`coding_body`: only the model, `stream` and
  `store` are set) and its own headers (`codex_own_headers`: its session,
  thread and request ids and what it says of itself);
- never falls back to Simeon's model: coding on the person's plan stops
  when the plan does;
- is refused with 429 `usage_limit_reached` and when the limit ends
  (ChatGPT's own time, or the one kept on the account), with 401
  `chatgpt_not_connected` when no account is signed in, else with ChatGPT's
  own refusal.

**Which program** is said by the server too: `/desktop/api/models/available`
ends with rows of the role `coding` (`coding_rows`), one per program whose
plan is usable, the chosen model's provider first.

Tested with stand-ins only (`TestCodexCodesOnTheAccount`, and the real
Codex 0.168.0 program against a stand-in server). Nothing reached
chatgpt.com, so whether ChatGPT accepts Codex's calls relayed this way is
not known until a real run.

## 12. Cursor codes for a cloud agent on the person's Cursor plan (13 November 2026)

The founder: "Cursor now". A cloud agent's coding can run in Cursor's own
command-line agent, beside Claude Code and Codex
(`docs/services-agents.md`, section 1).

- Cursor is not a model for the person's agents and has no row in Settings ›
  AI Models. It is connected from the chat's card ("Connect Cursor", "Runs on
  your Cursor plan."), and only cloud agents use it.
- The sign-in is Cursor's own, on the person's cloud computer: Cursor's
  program prints a link to Cursor's site, the person approves there, and the
  program keeps the sign-in on the computer. Simeon Labs' server never has
  it, and it is not in the computer's backup. Cursor's calls go from the
  computer to Cursor; none passes through the server.
- The card's dialog says so: the agents keep the model they have, the
  sign-in stays on the cloud computer, and to disconnect the person asks an
  agent.
- Which program codes when several are connected: Claude Code or Codex as
  before; Cursor when the person names it, or when it is the only one.

What is not known until a real run with a Cursor account: a turn that reaches
a model (how its answer and its limits read in practice).

## Sources

- Reason: reasonmachines.com/guides/use-all-your-ai-subscriptions;
  docs.reasonmachines.com/docs/plans; docs.reasonmachines.com/docs/provider-accounts
- OpenAI: developers.openai.com/siwc/quickstart, /siwc/request-client-id;
  help.openai.com/en/articles/20001542
- Anthropic: code.claude.com/docs/en/legal-and-compliance;
  code.claude.com/docs/en/agent-sdk/overview;
  support.claude.com/en/articles/13189465,
  /en/articles/15036540
- xAI's device sign-in as other tools use it:
  hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth; kilo.ai/docs/ai-providers/xai
- Grok Build's own code (read 10 November 2026, commit 2bdd1d6):
  github.com/xai-org/grok-build, `crates/codegen/xai-grok-login`
  (sign-in), `xai-grok-sampler` (the calls), `xai-grok-shell/src/extensions/billing.rs`
  (usage)
