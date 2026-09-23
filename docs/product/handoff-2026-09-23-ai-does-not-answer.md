# Handoff, 23 September 2026: the AI does not answer, and it costs money while not answering

Repository `Spaire-Tech/Claidor`, branch `claude/vibrant-thompson-02vdng`
(PR #162, merged to `main` and deployed on Render as of this morning).
Read `CLAUDE.md` first, then `docs/product/spend-guards.md`,
`docs/product/model-roles-measured.md`, `docs/product/grok-bot-layers-measured.md`.

## The product in one paragraph

`desktop/` is Simeon: an Electron app on the founder's Mac, built from a
source reconstruction of Grok Bot 0.18.0 (`desktop/PROVENANCE.md`). The
agent ("host") runs inside a local Docker container, `simeon-box` (`grok-bot-local-vm` until 23 September).
The app talks to the host over a gateway on 127.0.0.1:1340. The host calls
the model through Claidor's proxy at `https://api.claidor.com/desktop/api/proxy/v1/responses`
(OpenAI Responses wire; models `gpt-5.6-terra` for the loop, `gpt-5.6-luna`
for cheap roles). The only way anything reaches the person is the agent's
`SendMessage` tool; plain assistant text is invisible by design (Grok Bot's).

## The symptom

The person types "hi" to a fresh agent in a fresh box. Nothing ever appears
in the chat. Meanwhile the host makes one model call every 3 to 4 seconds
until the proxy's hourly budget refuses (code 40201). The host log in the
box (`/tmp/sand-host.log`; copy out with
`docker cp simeon-box:/tmp/sand-host.log ~/Desktop/sand-host.log`)
shows, for every one of those calls:

```
[claidor] model=gpt-5.6-terra effort=high input=31843 cached=31549 output=151 reasoning=37 ms=3543 tools=SendMessage({"type":"text","content":"Hey, I’m New Agent. What would you like to tackle firs…)
```

So the model does the right thing every step: it calls `SendMessage` with a
proper hello. Each step adds about 290 tokens to the history. The message
never shows, and the model is made to call it again.

## What is established

- Metering is right: 481 calls, $5.82, 99 percent cache hits
  (`server/scripts/desktop_usage_report.py`). Every call returned 200.
- Offline, the real `SendMessage` tool driven through the real loop
  (`packages/agent/tool-stream-executor.ts`) on the claidor executor
  against a fake Responses server **works**: the call is parsed, delivered
  through the tool's own closure, and the model is told "Message sent to
  user". Test: `desktop/tests/send-message-on-claidor.test.mjs`. So the
  tool and the executor are not the fault by themselves.
- In the box's host log there is **no** `nal.tool_call` line at all (the
  loop logs tool starts, successes and unexpected errors under that name)
  and **no** "Failed to send the message to the user" sentence (what the
  tool renders to the model on a refusal). Both greps came back empty.
- The app-side connect race that blinded the app earlier is fixed
  (`local-docker-host-connector.ts`, `persistInferenceCredential`).
- The earlier runaway was a different agent that had 146,000 tokens of
  history from the first runaway; the box volumes have since been deleted
  and this is a fresh agent. Same symptom.

## The two hypotheses left, and what decides them

1. **The message is written but the loop is told it was not.** The path:
   `runner/tools/send-message-tool.ts` `execute` → `interactionHandler.executeToolCall`
   (`packages/agent/interaction-handler.ts`) → `deps.onSendMessage`
   (`host/host-runner-composition.ts` ~2035, via `turn.emitUpdate`) →
   `runner/sand-agent-runner.ts` `emitUpdate` (`sentMessageCount += 1`) →
   `production-turn-run-shell-adapter.ts` `emitUpdate` (`collectSendMessage`)
   → `extensions/transcript/turn-runtime.ts` `case "send-message"` (writes
   the entry, `fulfillAckObligation`). If any hop after the count throws,
   the tool's `serializeError` returns an error result and the model
   retries. Nothing was logged, which argues against a throw.
2. **The step is re-run.** `runner/stream-attempt.ts` retries a step up to 3
   times on transient errors; `extensions/transcript/turn-runtime.ts`
   nudges up to 3 times plus a closing nudge when `sentMessageCount === 0`;
   `extensions/transcript/ack-obligations.ts` re-drives a turn up to 3
   times when delivery stays owed. If the agent worker's update never
   reaches the host (the loop runs in a worker thread:
   `[agent-isolation] spawned worker for agent …`), `sentMessageCount`
   stays 0 on the host side and everything above fires. This would also
   explain why nothing is in the chat.

What decides it: the host log lines **between** the `[claidor]` lines.

```
grep -n -B4 "\[claidor\]" ~/Desktop/sand-host.log | grep -v privacy | tail -60
grep -iE "error|warn|retr|exhaust|redrive|nudge|ack" ~/Desktop/sand-host.log | grep -v privacy | tail -40
```

Not yet run by anyone. The founder has the file on their desktop.

## The changes that preceded this, newest first (all mine, all on the branch)

- `2c0eed90`, `456097fb`: spend guards (hourly budget on the proxy, a
  per-turn model-call budget in `provider-session.ts`, intro greets and
  stops, box stops on quit, `[claidor]` log line). Guards hold; they did
  not change the message path.
- `e31a3378`: reasoning effort by role (`reasoning: { effort }` on the
  Responses body). All calls still return 200.
- `750331c1` (22 September): product turns moved from the Mac-side
  text router (`node-agent-coordinator/inference-router.ts`, which did
  answer texts) onto Grok Bot's full host loop in the box
  (`turn-run-shell.ts`). **That loop has never once produced a visible
  answer on a Mac.** The founder's "it worked before" is the Mac path.
  `SAND_CLAIDOR_FULL_AGENT=off` in the packaged environment
  (`scripts/lib/config.mjs`, `packagedEnvironment`) switches back to it.

## Rules the founder set

- Do not run the app or the box to test until the cause is found from the
  logs. Each run costs money and shows nothing.
- Do not guess. Say what was measured and what was not.
- Do not touch the pinned renderer bytes except through
  `scripts/lib/router-renderer-patch.mjs`. Keep the gateway's 15 s
  deadlines. Do not put anything over the agent marks.
- The brake by hand is `docker stop simeon-box`. Quitting the app
  now stops the box too.

## Build loop, macOS only

```
cd desktop && nvm use 26.5.0 && npm ci && npm run bootstrap && npm run check && npm run package && open dist/Simeon.app
```

`npm run check` is the gate: both typechecks and `node --test tests/*.test.mjs`
(126 tests, 4 skipped without Playwright). The server tests need Postgres:
`cd server && uv run task test`.

## Corrected later the same day — read `ai-does-not-answer-measured.md`

Three of the "established" facts above are not evidence: the box silences
the loop's logger (so no `nal.tool_call` line could ever appear), the
"Failed to send" sentence is a tool result the model reads and is never
logged, and the worker thread is the SQLite store, not the loop. The real
Agent loop now runs offline in
`desktop/tests/send-message-through-agent-loop.test.mjs` and delivers. Three
new `[claidor]` lines (tool result, send-message written / not written)
make the next run's log decide what the old one could not.
