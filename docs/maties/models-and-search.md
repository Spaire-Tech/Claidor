# A second model, and search

September 11, 2026. The founder asked for two things on this date: an
OpenAI key for **a second model to choose from**, and an OpenAI key for
**web search**. This is the design note for both, written before the code.

The short of it: the first is cheaper than expected and the second cannot
be done with an OpenAI key at all. Both are explained below, and the
second has an answer that costs nothing.

Read with `docs/maties/plan.md` (the plan of record, which this note
contradicts in one place, deliberately and on the founder's instruction)
and `docs/maties/engine-audit.md` (which is where the state of the engine
was established).

## 1. What is already true

Established by looking, not remembered:

- **The engine already ships OpenAI.** `dist/extensions/openai` survives
  our packaging. The audit's line about « forty or so model suppliers
  correctly deleted » is accurate about the forty and misleading about
  this one: the big names were kept. So a second model needs nothing
  built into the engine.
- **The engine ships no OpenAI search.** Its search providers are Brave,
  DuckDuckGo, Exa, Gemini, Grok, Kimi, MiniMax, Ollama, Perplexity and
  SearXNG. There is no tenth called OpenAI. An OpenAI key buys search
  here in no way at all.
- **We forbid search outright today.** `MANAGED_TOOL_DENY = ['web_search']`
  in `openclawConfigSync.ts`, with an instruction telling the assistant
  not to ask for it. Our packaging then deletes all ten providers. Search
  today is the person's own browser, and that is a decision we made, not
  an accident.
- **There is no API-key screen in the app, by design**, and every model
  call already goes through Claidor's metered proxy on Claidor's key
  (`/desktop/api/proxy/v1/messages`). The model catalogue in
  `polar/desktop/service.py` already carries a `provider` field on every
  entry, and every entry says `anthropic`.

## 2. The second model

### What changes in the plan of record

Section 2 of `docs/maties/plan.md` sells one account and one model, not a
menu, and `CLAIDOR-NOTES.md` records that provider and API-key screens
were deliberately retired. **This note reverses the first half of that on
the founder's instruction of September 11.** It does not reverse the
second: there is still no API-key screen, and there will not be one.

That distinction is the whole design. A person picks a model. A person
never sees, types, or holds a key. The key is Claidor's, on Claidor's
server, exactly as the Anthropic one is today.

### The shape

The catalogue already has the field the design needs. So:

1. **The model says who serves it.** GPT entries join `MODELS` with
   `provider: "openai"`. Nothing else in the app learns a new concept —
   the model list endpoint already ships this field.
2. **The proxy routes on it.** Today the handler hardwires
   `DESKTOP_ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`. It learns to ask
   the model which provider serves it, and takes the base URL and key
   from that. One branch, in one place.
3. **The wire format follows the provider.** The engine speaks
   Anthropic's `/v1/messages` to its Anthropic provider and OpenAI's
   `/v1/chat/completions` to its OpenAI one. The loopback token proxy in
   the app already forwards both shapes, so this needs no translation
   layer — each provider talks its own language end to end. Do not build
   a converter; it would be a large thing to maintain for no gain.
4. **Metering knows two price lists.** This is the part that is easy to
   get wrong and expensive to get wrong. Credits are recorded from token
   counts, and a GPT token is not priced like a Claude token. The usage
   record must carry the provider, and the price table must be per
   provider, or the credit figures quietly stop meaning anything and
   step 9's pricing is built on sand.

### What it costs

A key, and whatever the person spends through it. Note for step 9 that a
second supplier means a second monthly bill to reconcile, and that people
will pick the expensive model for trivial work unless the default is
chosen for them. The default stays Claude.

### Settings

`CLAIDOR_OPENAI_API_KEY`, alongside `CLAIDOR_ANTHROPIC_API_KEY`, in the
`claidor-shared` group. Empty means the GPT entries are not offered — a
missing key must read as « not available here », never as an error at the
moment somebody sends a message.

## 3. Search, which needs a different key

An OpenAI key does not buy search in this engine. What would:

| Supplier | Key needed | Notes |
|---|---|---|
| **DuckDuckGo** | **None** | Free. We ship it in no build because our packaging deletes it. One line to restore. Marked experimental by its own authors. |
| **SearXNG** | None | Free, but you must run the search service yourself. |
| Brave | Yes | A free allowance, then paid. The engine's instructions already name it. |
| Exa, Perplexity | Yes | Paid, and better for research-shaped questions. |
| Gemini, Grok, Kimi, MiniMax | Yes | Search through a model supplier's own service. |

**The recommendation is DuckDuckGo first**, because it is free, needs no
account, and answers the question « is search worth having at all » for
the price of one line in `prune-openclaw-runtime.cjs`. If the answer is
yes and the quality disappoints, Brave or Exa is a key away and the
switch is a setting.

Three things must change together, and this is the part to get right:

1. Stop deleting the provider in the packaging script.
2. Take `web_search` off `MANAGED_TOOL_DENY` in `openclawConfigSync.ts`.
3. Remove the instruction that tells the assistant search is disabled and
   not to ask for it. Leaving that line in place while switching search on
   produces an assistant that has a tool it has been told not to use —
   worse than no search, because it fails silently and looks like
   stupidity.

### What it costs the trust page

Today we can say the assistant searches with the person's own browser,
which is a strong and simple claim. Switching on a search supplier means
the person's search terms go to that supplier. That is a sentence on the
trust page, not a problem, but it must be a written sentence rather than
a quiet change.

## 4. One thing found while looking, not asked for

Our build ships ten Chinese model providers — `deepseek`, `kimi-coding`,
`minimax`, `moonshot`, `qianfan`, `qwen`, `stepfun`, `volcengine`,
`xiaomi`, `zai`. `desktop/CLAUDE.md` says plainly that Maties carries no
Chinese services, and the Chinese messengers were retired for exactly
that reason. These were missed.

They are not offered in the app, so nothing reaches them; they are dead
weight in the installer and a contradiction of a stated rule. Deleting
them is one line each in the packaging script and makes the installer
smaller. Not urgent, not this note's job, but it should not keep being
missed.

## 5. Order of work

1. The second model: the provider on the catalogue entry, the branch in
   the proxy, the per-provider price table, the setting. The price table
   is the piece that must not be rushed.
2. Search: the three changes above, with DuckDuckGo, and a line on the
   trust page.
3. The Chinese providers, whenever the packaging script is next open.
