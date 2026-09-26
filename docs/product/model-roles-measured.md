# Model roles: Grok Bot's table, and ours (22 September 2026)

The founder: "right now everything runs on OpenAI Terra or Luna. how can we
do better, save money and never remove efficiency. check exactly how Grok
Bot does it in the codebase." Then, after the reading: copy Grok Bot's
model architecture first, measure after. This is the reading and the change.

## How Grok Bot chooses a model

There is no reflex model and no per-step routing. The choice is by role, in
a fixed table:

| role | model | effort | where |
| --- | --- | --- | --- |
| the agent loop, every step | `grok-4.5`, max mode | `effort: high`, `fast: true` | `shared/agents/agent-model.ts` (`SAND_DEFAULT_MODEL_SELECTION`) |
| summarization, memory | `gemini-2.5-flash` | — | `shared/agents/sand-agent-model.ts`, `runner/turn-run-shell.ts:188`, `extensions/memory/production.ts:69` |
| computer-use subagent | `claude-opus-4-8` | `effort: low`, `thinking: false` | `sand-agent-model.ts` (`SAND_COMPUTER_USE_MODEL_SELECTION`) |
| browser-use subagent | stored selection, else the loop's | — | `extensions/inference/cursor-session.ts:31` |
| done or continue | the same loop model, re-run with a hidden nudge | — | `extensions/transcript/turn-runtime.ts:45,555-599` (`MAX_REPLY_NUDGES = 3`, plus one closing nudge; the closing nudge could never fire until 25 September 2026 because nothing set the runner's latest-prompt-messages getter, design-audit-ledger F-020) |
| risky or safe | a classifier on Cursor's server, not in the app; since 24 September Luna through Simeon Labs' proxy, and since 25 September enforcing (gate `sand_auto_review` on in `simeon-gate-defaults.ts`, read by the box host) | — | `extensions/auto-review/sand-backend-smart-mode-classifier-exec.ts` (`classifySandAutoReview`); gate `sand_auto_review` defaults false → shadow |
| post-turn labelling | fire-and-forget to Cursor's server | — | `extensions/inference/sand-labeling.ts` |

Background summarization starts when the conversation reaches 90 percent of
the token limit, or 10,000 tokens from it
(`runner/turn-agent-composition.ts:210-211`).

## Ours, after this change

| role | model | effort |
| --- | --- | --- |
| the agent loop | Terra | **high** (was: not set, so OpenAI's default) |
| summarization, memory, group chat | Luna | **low** (was: not set) |

**Memory, corrected 25 September 2026.** Until that day no memory role
ran at all: the production shell handed the settle no memory store, so
extraction never fired, and had it fired it would have used the agent's
own Terra/high session. Since `tests/memory-wired.test.mjs` the
extraction runs on a hidden summarization session on Luna at low, and
writes a `[claidor] memory extraction` line. Dreaming (synthesis) stays
gated off (`sand_memory_dreaming`), because turning it on switches the
legacy extraction off.
| computer-use and browser-use subagents | Luna | **low** (was: not set) |
| watchVideo and videoReview subagents (25 September 2026) | `gemini-2.5-flash` on Gemini's own wire through Simeon Labs' proxy (`ModelRole.video` in `pricing.py`; `SAND_CLAIDOR_VIDEO_MODEL` on the box) | logged as low, not sent (Gemini's knob is `thinkingConfig`, unmapped); `docs/product/video-served.md` |
| done or continue | Grok Bot's mechanism, unchanged since the 22 September decision | — |
| risky or safe | Luna at low effort through Simeon Labs' proxy, and enforcing (24–25 September 2026; `host/extensions/auto-review/simeon-smart-mode-classifier-exec.ts`, `applySimeonGateDefaults`, `sand_auto_review` on). This row said "left alone; effectively off" until 26 September (ledger F-434); it was true on 22 September and not since. | **low** |
| escalation | not built; `pricing.py` reserves Astra for "the person asks, a step has failed twice, or the agent asks" | — |

The change is `host/extensions/inference/provider-session.ts`:
`claidorReasoningEffortForSession` gives `high` to a loop session and `low`
to any session `isCheapClaidorSession` accepts (cheap, summarization,
computer-use, browser-use), and `claidorExecutor` sends it as
`providerOptions.openai.reasoningEffort`, which the AI SDK writes as
`reasoning: { effort }` on the Responses body for any `gpt-5*` id. The proxy
forwards that body untouched (`server/polar/desktop/endpoints.py`,
`_openai_responses_body`). Effort follows the role, not the model: a loop
turn that falls back to Luna on a rate limit keeps `high`. Environment
overrides: `SAND_CLAIDOR_REASONING_EFFORT`,
`SAND_CLAIDOR_CHEAP_REASONING_EFFORT` (minimal, low, medium, high; anything
else is ignored).

Not copied: Grok Bot's `fast: true` and max mode. Neither has an equivalent
field on the Responses wire.

Tests: `tests/claidor-reasoning-effort.test.mjs` reads the effort off the
fake Responses server for each role and for the overrides;
`tests/claidor-host-loop.test.mjs` now pins `high` on every loop step.

## What to read on the Mac

Two things, one turn each, from the proxy's usage record:

1. `reasoning.effort` on the loop's request is `high`, and on a summarization
   request `low`.
2. `cached_tokens` on the second and later steps of a turn is non-zero. The
   brief is about 70,000 characters and is sent on every step; OpenAI caches
   a stable prefix and the proxy meters cached input at one tenth
   (`pricing.py`, `cache_read=0.1`). If it reads zero, something near the
   top of the brief changes between calls, and that is the next thing to
   find.

Neither has been run. A one-user week of totals would say less than these
two lines.

## Read on the Mac, 26 September 2026

Both lines above were read on the founder's Mac, from `/tmp/sand-host.log`,
over two turns 48 s apart:

```
model=gpt-5.6-terra effort=high input=49861 cached=0     … (turn 1, step 1)
model=gpt-5.6-terra effort=high input=50015 cached=49858 … (turn 1, step 2)
model=gpt-5.6-terra effort=high input=50147 cached=0     … (turn 2, step 1)
model=gpt-5.6-terra effort=high input=50316 cached=50144 … (turn 2, step 2)
```

1. Effort is `high` on the loop and `low` on the Luna memory call. Measured.
2. Within a turn the cache works: step two reads all of step one. Across
   turns it did not: the first call of turn 2 read nothing, although turn 2
   step 1 is turn 1 step 2 plus ~130 tokens (the reply and the new message).
   Every message paid for ~50,000 uncached tokens.

**What Grok Bot does that we did not.** Its loop names the conversation on
every model request: `packages/agent/index.ts` puts `config.conversationId`
in the context (`conversationIdKey`), and its inference client sends it as
`InferenceStreamRequest.conversationId` (`chat-inference-proto/client.ts`,
`buildStreamRequest`), which Cursor's server had to key its cache on. Our
executor received that context and ignored it (`stream(_ctx, …)` in
`provider-session.ts`), so every request reached OpenAI with no cache key.
OpenAI's form of the same thing is `prompt_cache_key`, which routes requests
sharing the key and their prefix to the same cache. The executor now reads
the id from the context and sends `prompt_cache_key: simeon-<sha256(id)[:32]>`
(the id itself never leaves the Mac). The AI SDK in the tree (1.3.24) has no
option for it, so the authenticated fetch adds it to the body; a 400 naming
the key is retried once without it and the key stays off for the process,
with a `[claidor] prompt-cache-key refused` line. `tests/prompt-cache-key.test.mjs`.

**What this does not prove.** Whether the missing key is the whole cause is
not established: two turns are one observation. The memory section is not
it on its own: Grok Bot freezes it (`resolveFrozenMemoryPrompt`) and it sits
after the ~58,000-character brief, so a change there would still have left
the brief's tokens cached, not zero. So every `[claidor] model=` line now
ends with `prefix=sys:<8>,tools:<8>,key:<8>`, hashes of the system prompt,
the tool definitions and the key. On the next run, compare turn N step 2 with
turn N+1 step 1:

- same `sys` and `tools`, `cached` near the input: fixed.
- same `sys` and `tools`, `cached=0`: the prompt did not move and the cache
  still missed; the key did not help and the cause is on OpenAI's side.
- a different `sys` or `tools`: the prompt moved between turns, and the hash
  that changed names the half to diff.

**The "x" padding is not answered by Grok Bot's code.** GPT fills every
SendMessage field (`url:""`, `images:[]`, and `widget`/`secret` with `"x"`
to satisfy their `minLength: 1`), about 60 output tokens a message, dropped
before validation (`stripFieldsOfOtherTypes`). The schema is Grok Bot's
unchanged (only `type` required; the reconstruction at `ce9fc2d8` has the
same object), the tool description's examples fill only what their type
needs, and Grok Bot's client sends Cursor the same JSON schema
(`agentToolToProto`) with no strict-mode or nullable conversion. Whatever
Cursor's server did with it is not in the reconstruction. The one lever in
our hands, OpenAI strict mode with nullable optionals for SendMessage, needs
a live request to know OpenAI accepts that schema; a refusal would fail
every turn, so it was not shipped blind.
