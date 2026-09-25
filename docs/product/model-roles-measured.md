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
| risky or safe | a classifier on Cursor's server, not in the app | — | `extensions/auto-review/sand-backend-smart-mode-classifier-exec.ts` (`classifySandAutoReview`); gate `sand_auto_review` defaults false → shadow |
| post-turn labelling | fire-and-forget to Cursor's server | — | `extensions/inference/sand-labeling.ts` |

Background summarization starts when the conversation reaches 90 percent of
the token limit, or 10,000 tokens from it
(`runner/turn-agent-composition.ts:210-211`).

## Ours, after this change

| role | model | effort |
| --- | --- | --- |
| the agent loop | Terra | **high** (was: not set, so OpenAI's default) |
| summarization, memory, group chat | Luna | **low** (was: not set) |
| computer-use and browser-use subagents | Luna | **low** (was: not set) |
| done or continue | Grok Bot's mechanism, unchanged since the 22 September decision | — |
| risky or safe | left alone; Cursor's classifier cannot answer on Claidor, so auto-review is effectively off | — |
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
