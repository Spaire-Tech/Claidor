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
| **Grok** | **To check with xAI.** xAI publishes no programme for other apps. Kilo Code and Hermes Agent use the same device-code sign-in with SuperGrok plans. | hermes-agent docs (xai-grok-oauth), kilo.ai docs (xai) |
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
  sign-in lasts while the computer sleeps and wakes; when a computer is
  replaced (a new image or engine), the person signs in to Claude again.
- **The agents on Claude.** With Claude chosen in the model menu, an agent's
  turn is run by Claude Code on the computer (`claude -p`, its session resumed
  per agent), in place of the engine's own loop. Simeon's tools (messages to
  the person, reactions, cards and forms, the browser and the screen, the
  person's connected apps, other agents) are given to it as an MCP server the
  engine runs on the computer; Claude Code's own tools (shell, files, web
  search) are its own. Its permission prompts go to the engine's safety review
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
  its reply when nothing else reached them, or when it worked on after its
  last message ("On it", then the result in its own words); no hidden turn
  pokes it, and the closing nudge, which reads the engine's own history that
  Claude Code doesn't write, is not asked (`claudeCodeReplyToSend`,
  `turn-runtime.ts`). The brief tells Claude so. The host log's own lines
  showed every turn `outcome=done`: Claude was answering.
- **How hard it thinks.** Beside the model on the composer, on the person's
  own plan: Light, Medium, High, Extra High, Max (Reason's words). Claude's
  are Claude Code's `--effort` (`low` to `max`, read from `claude --help` of
  2.1.311; High until one is chosen); ChatGPT's are Light, Medium and High
  only, the three every Codex model takes, and replace the engine's own
  effort on the agent's turns, not on its machinery (Medium until chosen).
  Kept with the choice (`users.meta.own_model_effort`, `PUT models/own`
  `{effort}`); the engine reads it with the roles (`claudeCodeEffort`).
- **A choice applies to the next message.** The engine read the roles every
  five minutes, so a model or an effort chosen on the composer reached the
  agents up to five minutes later (the founder connected Claude at 22:44 and
  his next two messages were answered on Simeon's model). Before each agent
  turn, the roles are now read again when the last read is more than fifteen
  seconds old, the turn waiting at most three seconds for it.

**The steps:**

| Step | What | About |
|---|---|---|
| C1 | This plan | done |
| C2 | The image installs Claude Code (2.1.311, its stable release); the credentials file kept out of the backup; the engine's commands `claudeCodeStatus`, `claudeCodeSignInStart` (the link), `claudeCodeSignInFinish` (`{code}`), `claudeCodeSignInCancel`, `claudeCodeSignOut` (`desktop/source/host/claude-code/claude-code-account.ts`) | done 9 November 2026, tested against a stand-in `claude`; not yet on any computer |
| C3 | The server's Claude row (no token, `POST /desktop/api/models/accounts/claude`), Connect Claude on the Mac, the iPhone and the web (the shared cores' `startClaude`, `finishClaude`, `cancelClaude`), Claude Opus and Sonnet in the model menu, the ten languages | done 9 November 2026: server tests, web tests and a Chromium check against a stand-in server and computer; the Swift not compiled (no Swift here) |
| C4 | The engine runs a Claude turn through Claude Code with Simeon's tools over MCP, the safety review, the fallback | in progress. Part 1 done 9 November 2026: the engine's roles read the `claude-code` row (`claudeCode`: `opus` or `sonnet`, kept in `model-roles.json`; `primary` stays Simeon's), and `desktop/source/host/claude-code/claude-code-turn.ts` runs one turn (`claude -p` in stream-json, the brief and the MCP config in private files, `--permission-prompt-tool`, each agent's session in `claude-code-sessions.json`, started afresh when the computer no longer has it) and sorts its ending: done, the plan's limit (and until when), signed out, not installed, stopped, failed. Tested against a stand-in `claude`; nothing calls it yet. Part 2 done 9 November 2026: Simeon's tools as an MCP server inside the engine for the length of a turn (`simeon-mcp-server.ts`: MCP's Streamable HTTP answered in plain JSON, on 127.0.0.1 at a path holding a token made for the turn, refusing a web page's `Origin` and any other host name; one log line per call with the tool and how it ended, never its input or output), the engine's own tools bridged with their names, descriptions, schemas, `execute` and `render` (`claude-code-tools.ts`; the tools Claude Code has its own of, files, shell, web search and fetch, its to-do list, left out), and `ReviewPermission` answering Claude Code's permission asks from the safety review. Tested with Simeon's real SendMessage, and end to end with a stand-in `claude` that reads the config file, connects, lists and calls. Part 3 done 9 November 2026: the agent's own turns (never a subagent's, a box-scoped helper's or a shared room's) run through Claude Code when the roles name it. The agent's user-message handler (`handle()`), once the turn is set up and before its own loop, calls the host's hook (`claude-code-agent-turn.ts`, in the agent's config as `claudeCodeTurn`) with the turn's own tools built as the loop builds them, the brief, the context and the person's words; Claude Code's last words are kept as the turn's text. The brief gets a note naming the tools `mcp__simeon__<Name>`; the context goes with a session's first turn only. When Claude Code can't, the loop answers on Simeon's model, and Claude waits: until the limit resets (an hour when Claude Code doesn't say), five minutes after the sign-in is gone, an hour when not installed, a minute after a failure. A turn the person stopped is over. Host log: `claude-code turn agent=… model=… outcome=… tools=… ms=…`, and one `claude-code tool=… ok=…` line per tool call. Tested end to end with a stand-in `claude`; the full engine suite passes (the one failure is a renderer asset not built in the container). Part 4 done 9 November 2026: **the shell goes through the person's safety review**: Claude Code's own `Bash` (and `BashOutput`, `KillShell`) is off for the turn and the engine's `Shell`, which carries the review, is offered instead; the brief says so. Simeon's tools are allowed without asking (`--allowedTools mcp__simeon`: they carry their own cards and reviews); what still asks (a file written, a page fetched) is allowed, the agent's own computer as with the engine's own tools. **The chat's one line** when Claude can't (`shared/words/areas/models.ts`, the ten languages; `host/extensions/transcript/claude-code-notice.ts`): the plan's limit, the sign-in gone (with where to connect again), or Claude Code not running; once an hour per agent and reason. The tools offered are named once a run in the host log (`claude-code tools offered=…`), so the first real turn shows the list. Checked against the real Claude Code 2.1.311 (installed here, run without signing in): every flag the engine passes is accepted (`--append-system-prompt-file`, `--permission-prompt-tool` and `--max-turns` are hidden from `--help` but parse); the words the engine reads are the program's own ("No conversation found with session ID", "Not logged in", "Please run /login", "Invalid API key"); its plan limit comes as a `rate_limit_event` with `status: \"rejected\"` and `resetsAt` in seconds, or an API error coded `usage_limit_reached`, and the turn now stops at that event instead of waiting for the reset. Still to do after a real run: Claude's tool calls kept in the engine's history (the loop's own interaction handler); the list of tools left out checked against that run |
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

## 7. Then: API keys

The "API keys" list, Reason's order. Connect asks for the key, checks it with
one call, and keeps it sealed. Calls are billed by the provider. Most of these
providers speak OpenAI's Chat Completions and not the Responses API the engine
sends, so the relay will need a translation between the two, which it doesn't
have today ("Nothing here translates between the two"). That's the main work
of this step. Anthropic, OpenAI, Google and Bedrock keys need none.

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
