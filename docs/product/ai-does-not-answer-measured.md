# The AI does not answer: what is established, 23 September 2026 (afternoon)

Follows `handoff-2026-09-23-ai-does-not-answer.md`. Nothing here was run on
a Mac or in a box; everything was read off the source, the build script and
an offline harness in this repository. The founder's copy of the box log
(`~/Desktop/sand-host.log`) has still not been read by anyone.

## Three things the handoff took as evidence are not evidence

1. **The empty `nal.tool_call` grep.** The loop logs tool starts, successes
   and failures through `packages/context/logger.ts`, on the context the
   turn runs in. In the box that context is bound at build time to
   `createProductionRunnerContext()`
   (`scripts/host-production-activation.mjs`, `ports.runnerContext`), which
   is `createContext().with(loggerKey, { log: () => {} })`
   (`source/host/runner-context-production-provider.ts`). Every `logger.*`
   call from `packages/agent` is dropped: `nal.tool_call.*`, `Running
   step`, `nal.empty_response.*`, all of them. The grep had to be empty
   whether or not a tool ever ran. Check on the founder's file:
   `grep -c "Running step" ~/Desktop/sand-host.log` is 0 for the same reason.
2. **The absent "Failed to send the message to the user" sentence.** That
   sentence is what `send-message-tool.ts` `render` returns *to the model*
   when the tool's result is an error. It is a tool result, not a log line;
   it is never written anywhere but the model's context. Its absence from
   the log says nothing.
3. **The worker thread.** `[agent-isolation] spawned worker for agent …`
   is `host/agent-isolation/agent-worker-pool.ts`, the SQLite blob-store
   worker (`agent-store-worker.ts`). The loop does not run in it. The
   handoff's second hypothesis — updates lost across a worker boundary —
   has no boundary to cross.

## What the offline harness now establishes

`desktop/tests/send-message-through-agent-loop.test.mjs` builds the real
Agent the way a product turn builds it: `createTurnAgentRunContext` (the
real tool session with both reminder middlewares), `createSandAgentStaticConfig`,
`createTurnAgentForRun` (the real `InteractionHandler`,
`ForwardingInteractionListener`, redaction wrapper, turn recorder),
`createTurnAgentStreamStart` → `AnysphereAgent.runStream`, in the production
runner context, with the real SendMessage tool delivering through the real
`createSandTransport`, against a fake Responses server. Two cases:

- **Delivery works:** two model calls. The model is told
  `Message sent to user. (id: t1s1)`, the turn ends. The loop is not the
  fault by itself, and neither is the tool, the handler, the listener or
  the transport.
- **Delivery throws** (the transcript hop rejects): the model is told
  `Failed to send the message to the user: <the sentence>`, the loop calls
  the model again, and **nothing** reaches stdout from the loop's logger.
  Before today that was the whole story a failed SendMessage left.

So the remaining candidates all sit past `emitUpdate`, in host code the
harness does not run: `production-turn-run-shell-adapter.ts` `emitUpdate`
→ `hooks.transport.onUpdate` → `transcript-manager.ts` `handleAgentUpdate`
→ `turn-runtime.ts` case `"send-message"` (`getTranscript()`,
`nextEntryId`, `validateAiReplyTarget`, `applyAutoReplyThread`,
`appendSendMessageEntry`, `fulfillAckObligation`). A throw anywhere there
is exactly the second case above. A tool the loop never dispatched
(`Tool not found: SendMessage. Available tools: …`) would look the same
from the outside: the model retries and nothing is logged.

## What the model sees on every retry — and why the log could not say

The `[claidor] model=…` line names what the model asked for; nothing named
what the tool answered. Per step the history grows by the function call
(~120 tokens for that greeting) plus its output. `Message sent to user.
(id: …)` is ~20 tokens; the observed ~290 per step leaves room for an error
sentence or a tool-not-found list, and no room to decide which from the
outside.

## The lines that decide it, on the next run

Three lines now travel the same stdout channel as the model-call line
(`source/shared/host-log.ts`, the channel proven to reach
`/tmp/sand-host.log`):

| line | written by | means |
| --- | --- | --- |
| `[claidor] tool=<case> id=<callId> result=success …` / `result=error detail=<sentence>` | `host/runner/agent-adapters.ts` on every `toolCallCompleted`, via `host/runner/tool-call-log.ts` | what the tool answered, i.e. what the model reads next |
| `[claidor] send-message written id=<id> type=<text\|widget\|…>` | `host/ports/transport.ts` | the transcript took the message |
| `[claidor] send-message not written type=… error=<name: message>` | `host/ports/transport.ts` | the hop into the transcript threw; the sentence is what the model is told |
| `[claidor] subagent=dispatched\|settled\|result id=<agentId> …` | `host/runner/subagent-runtime.ts` (24 September 2026) | a Task ran: its type and title at dispatch, `status=done\|error\|aborted` at settle, and `result … chars=<n> text="…"` is what the parent reads back, `(the task finished without producing any text output)` included |

Reading the next log:

- `tools=SendMessage(…)` followed by **no** `tool=sendMessageToolCall` line:
  the loop never dispatched the call (tool map, name, or stream parsing).
- `tool=sendMessageToolCall … result=error detail=…` with a
  `send-message not written … error=…` before it: the transcript hop threw;
  the detail names the throw.
- `result=error` **without** a `not written` line: the throw is before the
  transport (in `executeToolCall`'s start update, `requireGeneratedToolCall`,
  or the listener).
- `send-message written id=…` and `result=success`, and still nothing in
  the chat: the write landed in a transcript the app is not showing (the
  `isForActiveAgent` branch in `turn-runtime.ts` `handleAgentUpdate`), and
  the fault is between the host's transcript and the renderer.

Greps, on the founder's existing file and on the next one:

```
grep -c "Running step" ~/Desktop/sand-host.log          # 0: the loop's logger is silent, as above
grep -n "\[claidor\] tool=\|send-message" ~/Desktop/sand-host.log | head -40
grep -n -B4 "\[claidor\] model=" ~/Desktop/sand-host.log | grep -v privacy | tail -60
```

## Checked, and not

Checked here: `npm run source:typecheck`, the new test, the existing
`send-message-on-claidor.test.mjs`, the full `npm test` (see the commit).
Node 26 is pinned by `package.json`; this container has Node 22 and
installed with `--force`, which changes nothing the tests exercise. Not
run: the app, the box, a Mac. The next single run of "hi" on a Mac decides
between the four readings above.

## Decided by the next run, 23 September 2026 (evening)

The founder ran "hi" on the Mac with the new lines in. Thirty pairs, one
model call every 3–5 seconds:

```
[claidor] model=gpt-5.6-terra effort=high input=35130 cached=34818 output=171 reasoning=38 ms=4863 tools=SendMessage({"type":"text","content":"Hey, I’m Chief of Staff. I can help keep work moving a…)
[claidor] tool=sendMessageToolCall id=call_lfv36D56pbb9mkROov76kH8z result=error detail=Invalid arguments: widget: widget is only valid with type:widget and cannot ride a type:text message — it would be silently dropped. Nothing was sent. Re-send a…
```

and once, the widget's own validation:

```
[claidor] tool=sendMessageToolCall id=call_W5L502ZxrXq7MMvp6WLlH6bL result=error detail=Invalid arguments: widget.prompt: String must contain at least 1 character(s) widget.helpText: String must contain at least 1 character(s) widget.options.0.labe…
```

So the loop dispatched the tool every time and the tool refused every time.
The model writes its greeting as a `type:text` SendMessage and, in the
same call, a `widget` object of empty strings — every property in the
schema, the foreign one blank. The wire schema is not strict and requires
only `type` (measured through the executor: `required: ["type"]`,
`strict` unset); the brief's "offer any choice as a question widget" is
the likely nudge. `refineSendMessage` treated a blank object as a provided
field, refused the whole call with "Nothing was sent. Re-send…", and the
model answered the refusal with the same call. That is the whole runaway:
no message ever reached the transcript, so every reply nudge, ack redrive
and step continued it.

**The fix** (`send-message-schema.ts`): a blank field — empty string,
empty array, object whose every leaf is blank — is dropped before
validation (`isBlankField`, `z.preprocess` on `widget`, `secret`,
`images`). A filled foreign field is still refused with the re-send
instruction, because that refusal the model does act on.
`tests/send-message-blank-fields.test.mjs` pins both; the agent-loop test
now sends the exact greeting from the log and it lands as text.

Not changed: the brief, the reminder middlewares, the nudges. Not yet run
on a Mac: this fix.

## The second run, with the widened log line

With `isBlankField` in the box, the model changed the padding, not the
habit. The whole call, now that the `model=` line carries 400 characters:

```
SendMessage({"type":"text","content":"Hey! How’s it going?","url":"","images":[],"alt":"","reply_to":"","channel":"","widget":{"prompt":"x","helpText":"x","options":[{"label":"x","value":"x","description":"x","style":"default"}],"allowCustom":false,"dismissOnMoveOn":false},"bcId":"","secret":{"label":"x","description":"x","connector":"x","field":"x"}})
```

Every property of the schema, every time; the ones it does not mean
padded with `x`. The proxy does not rewrite the tool schema (`server/polar/
desktop/`: no `strict`, no `required`), the host sends `required: ["type"]`,
so the padding is the model's own. Refusing the call for the foreign fields
is therefore never answered with a corrected call, only with the same one.

**The rule now** (`stripFieldsOfOtherTypes`, a `z.preprocess` on the whole
object): `type` decides. Fields that belong to another type are deleted
before validation, whatever they hold, and the typed message is sent. A
bad field of the *right* type (a `type:widget` with an unlabelled option, a
`type:text` with no content) is still refused, because that refusal names
a real mistake. The greeting above lands as text; the agent-loop test
sends it verbatim.

## The computerUse child ran on Shell alone, read 24 September 2026 (night)

The founder's Render test, from the box log (`subagent=` lines added the
same evening): the parent dispatched a computerUse child
(`subagent=dispatched … type=computerUse`), the child made seven Luna
calls at `effort=low`, every one of them `tools=Shell({"command":"printf
…"})` printing sentences to itself ("Waiting for the delegated browser
result", "Browser task remains asynchronous"), then `subagent=settled
status=done` and `subagent=result … "(the task finished without producing
any text output)"`. No `tool=` line names a computer tool. No `429`, no
`rate limit`, no `40201`: the "browser-helper rate limit" the agent
reported three times has nothing behind it. The "task text leaking as a
user message" is the completion hand-off prompt
(`[A background task just completed]`, a hidden user turn) as the model
sees it, not anything on the person's screen; every "You" line in their
transcript is theirs.

The child's sentences read like a parent waiting on a delegate, which
means either it was not offered the Computer tool, or it was offered it
under the agent's own brief. The code wires both correctly on paper
(`isComputerUseSubagent` → `factories.computer?.()` in `turn-toolset.ts`
under `remoteBoxHasDesktop && getRemoteBoxAvailable()`; the prompt glue
and assembly are built per identity with a silent fallback to the
agent's). Two lines now decide it on the next run:

| line | means |
| --- | --- |
| `[claidor] model=… tools=… offered=<names>` | every tool name in that request; a computerUse child's must list `Computer` |
| `[claidor] prompt conversation=<id> identity=computerUse glue=own\|agent-fallback assembly=own\|agent-fallback` | which prompt the child's shell serves; a fallback means it read the agent's brief |

```
docker exec simeon-box grep -n "\[claidor\] prompt \|\[claidor\] subagent=" /tmp/sand-host.log | tail -20
docker exec simeon-box grep -n "model=gpt-5.6-luna" /tmp/sand-host.log | grep -v "input=5[0-9][0-9] " | tail -10 | cut -c1-300
```

(The `input=5xx` Luna calls are the auto-review classifier, one per Shell
command, not the child.)
