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
OpenAI approves, only the client id changes. Built so far: the model
accounts and the ChatGPT sign-in on the server (`services-core.md`, section
2, "The person's own AI accounts"). Next: the relay on the person's account,
then the apps.

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
| **Claude** | **Not without Anthropic's approval.** Anthropic: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users … developers may not collect, store, or intermediate Claude.ai credentials." The Agent SDK page: "Unless previously approved". Reason's screen is Claude Code's sign-in, and whether Reason has that approval isn't public. **Simeon won't sign in as Claude Code**: it would present Simeon to Anthropic as Claude Code, against those terms. The allowed routes are below (section 6). | code.claude.com/docs/en/legal-and-compliance, /agent-sdk/overview, support.claude.com article 13189465 |
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
   - what stays on Simeon: web search, pictures, voice, transcription, video,
     and the helpers' cheap model unless the person's provider has one.

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

## 6. Claude meanwhile

Until Anthropic answers, Claude stays available in Simeon:

- **Simeon's own credits.** As today, on Bedrock or Anthropic's API.
- **The person's own Anthropic or Bedrock key** (section 7).
- **The real Claude Code on the agent's computer** is allowed by Anthropic's
  terms for a platform that hosts it: unmodified, the person signing in with
  their own plan. It would be a separate project: a worker the agent hands
  jobs to, not the agent's own voice.

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
