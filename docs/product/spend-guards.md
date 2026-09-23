# Spend guards (22–23 September 2026)

## What happened

The founder started Simeon on a fresh account, created one agent with a
description, and saw a chat bubble that never finished. Read off the
proxy's usage table (`scripts/desktop_usage_report.py`):

| | |
| --- | --- |
| model calls | 481 in 50 minutes |
| Terra | 379 calls, ~60,000 tokens in and ~130 out per call |
| Luna | 102 calls |
| cache hits | 99 percent of input tokens |
| cost by the proxy's meter | $5.82 (recomputed at OpenAI's list prices: the same) |

Nothing reached the screen. Four things stacked:

1. **Grok Bot's intro starts the assignment.** The first-run prompt told an
   agent with a description to skip the greeting and begin the job. A turn
   may run 5,000 steps (`SAND_AGENT_MAX_STEPS`) and the app has no money
   cap of its own.
2. **The intro re-ran on every open.** Grok Bot keeps the introduction
   owed until a message lands; with no message, every open of the agent ran
   the whole first turn again.
3. **The box keeps working after quit.** The agent runs in the container,
   and nothing on the quit path stopped it.
4. **The app was blind.** Our connect wrote the box's token file through
   one temporary name per process; a startup burst of ~25 calls raced on
   it, every loser's connect threw, and the coordinator reported
   `ControlPortCallError` for every method while the narration printed the
   type and not the sentence (`docs/product/computer-stream-measured.md`).

## The guards

| guard | where | default |
| --- | --- | --- |
| hourly credit budget on the proxy, 402 with its own code 40201 | `server/polar/desktop/proxy_common.py` `budget_refusal`, `service.py` `hourly_exhausted`, `config.py` `DESKTOP_HOURLY_CREDITS` | 200,000 credits an hour, about $0.60 |
| model-call budget per turn, counted in the session the turn shell holds | `provider-session.ts` `createModelCallBudget`, `shared/inference/turn-step-budget.ts` | 5,000 for a turn the person asked for (Grok Bot's), 40 for a hidden one (`SAND_HIDDEN_TURN_MAX_STEPS`) |
| the intro greets and stops | `shared/agents/onboarding.ts` | no assignment, no tools, until the person replies |
| the intro runs once | `agent-lifecycle.ts` `kickstartAgent` | undelivered → tray error with `INTRODUCTION_UNDELIVERED_DETAIL`, not owed again |
| the box stops on quit | `local-docker-host-connector.ts` `stopLocalDockerBoxOnQuit`, called from the quit flush in `main-production-services.ts` | on for local Docker; `SAND_KEEP_BOX_RUNNING_ON_QUIT=1` keeps it |
| one log line per model call | `provider-session.ts` `formatModelCallLogLine` → `/tmp/sand-host.log` in the box | `[claidor] model= effort= input= cached= output= reasoning= ms=` |
| the token file survives a burst | `persistInferenceCredential`: one writer at a time, unique temporary name; no duplicate write of the late token | — |
| the narration prints the failure's sentence | `production-provider.ts`, `causeDetail` on the reachability report | `detail=…` on the line |

Cached tokens are now counted on the host side too (`extendedUsage`),
where they were reported as zero.

## Checked, and not

Checked here: `npm run check` (both typechecks, the suite with
`tests/spend-guards.test.mjs`), `ruff` and `mypy` on the server files.
**Not run:** the server tests, because this container has no Postgres;
`tests/desktop/test_endpoints.py` gained two tests for the hourly budget
that CI or a Mac with Docker has to run. Not run on a Mac: a quit that
stops the box, an intro that greets and stops, a hidden turn hitting 40.

## How to read spend now

- The box: `docker exec grok-bot-local-vm sh -c 'grep "\[claidor\]" /tmp/sand-host.log | tail'`.
- The server: `python -m scripts.desktop_usage_report <email> --hours 24`
  from the Render shell.
- The brake by hand, still: `docker stop grok-bot-local-vm`.
