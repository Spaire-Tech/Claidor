# The host wall, measured (19 September 2026)

The brief for "Caisra is ours" says the host is the wall:

> Today five runtimes compile from source and the host does not — it ships as
> Anysphere's compiled bytes, because
> `manifests/reconstruction/host-production-bindings-manifest.json` does not
> exist. … That single missing file is the wall between us and the product.

and asks for one thing before anyone builds: price route (b), recovering the
host from source, by running `buildProductionHostIfSupplied` with a stub
manifest and reading the first failure.

This is that run. The result is not a price. The premise is false.

## What was run

Linux container, Node 26.5.0 (the `engines` pin), `npm ci`, and
`src/app/dist` hydrated from the pinned 0.18.0 `app.asar` through the
project's own `hydrateSourcePayloadFromAsar` (checksum enforced; the DMG came
from the GitHub mirror named in `building-the-app.md`, sha256 `a253ccd8…203eb`
as pinned). Then, from `desktop/`:

```
$ node scripts/host-production-activation.mjs
Host production bindings: 8 bound, 0 mandatory unbound (b86885f9…aede5cea).
bound   ports.executeBoxCopyInFromEnv
bound   ports.extensionHost.boxGenerated
bound   ports.extensionHost.convertCloudAgentConversationToTrace
bound   ports.runnerContext
bound   ports.createTranscriptMirror
bound   extensionBindings.stateBackstop
bound   extensionBindings.localExecCodec
bound   extensionBindings.secretsContext
```

No manifest was supplied. All eight mandatory bindings are bound anyway,
because `scripts/host-production-activation.mjs` carries built-in specs for
each that point at paths under `source/host/`; a manifest file can override
them and is not required to exist.

Then the function the brief names, with `manifestPath: null`, which is what
`buildCleanDistribution` and `buildFidelityDistribution` pass when
`GROK_BOT_HOST_BINDINGS_MANIFEST` is unset (`scripts/clean-build.mjs:218`,
`:229`):

```
hostActivation: { status: "validated-clean-source", clean: true }
```

Then `buildFidelityDistribution()` itself — the function `npm run package`
calls, minus the macOS packaging step — and its audit at
`.build/fidelity-clean-runtime/dist/runtime-composition-audit.json`:

```
cleanAccepted: [electron-main, electron-dev-controls, primary-preload,
  dev-controls-preload, webview-preload, vnc-preload, node-agent-coordinator,
  host, host-agent-store-worker, host-transcript-mirror-worker,
  host-box-store-vacuum-worker, host-search-index-worker, box-exec-daemon,
  local-exec-daemon]
cleanNotEvaluated: []
blockedFallbacks: []
```

Fourteen runtimes, fourteen `clean-source`. The host entry resolves to
`{ mode: "clean-source", source: "source/host/main.ts" }`
(`scripts/clean-build.mjs:49-50`). The built `dist/host/host-main.cjs` is
19,972,384 bytes and is compiled from `source/host`. The pieces that are
*not* compiled from source are the renderer (checksum-pinned, by design — see
`building-the-app.md`), native dependencies, and the Electron shell.

The manifest file the brief calls the wall does not exist, and that is
correct: `ls manifests/reconstruction/` shows
`electron-main-production-bindings-manifest.json`, `renderer-closure.json`,
`runner-parity-audit.json`. The host does not need one.

## Why the brief believed otherwise

The audit it drew from read `runtimeComposition`'s default row for the host,
which is `artifact-fallback`, and the name `buildProductionHostIfSupplied`,
and concluded that with no manifest supplied the fallback ships. The name
is misleading: "IfSupplied" gates nothing. The function assembles the
built-in bindings, compiles, validates, and reports `clean: true`, and
`compositionWithProductionActivations` then replaces the fallback row before
packaging. Reading the built artifact would have shown it; reading the
default row did not.

This is the failure `CLAUDE.md` already names twice — "grep the built
artifact before saying a thing is absent" — and it was made again, upstream of
this repository, in a document this one was asked to take as its spec.

## Cost of route (b)

Zero. It is the state of `main`.

## What the wall actually is

The host compiles from our source, and that source still speaks Cursor's wire
for the agent loop. The full turn — shell, files, computer use, browser — is
driven by `aiserver.v1.InferenceService/Stream`
(`source/packages/proto/generated/aiserver/v1/inference_connect.ts:11,20`), a
binary-protobuf Connect stream, built by
`createSandCursorBackendClient(InferenceService, …)` in
`source/shared/node/cursor-backend/cursor-inference.ts:191`. Claidor serves
no such route: `rg -n "aiserver.v1.InferenceService" server/polar` returns
nothing. What Claidor serves is an OpenAI-compatible proxy
(`/api/proxy/v1/messages`, `/chat/completions`, `/responses`, `/models` in
`server/polar/desktop/endpoints.py`).

So the wall is not a missing manifest. It is the gap between the message
shape the agent loop speaks and the shape Claidor answers. Two ways across,
both real work, both now priceable because the code on our side is ours:

**(a) Serve the wire.** Implement `InferenceService/Stream` on Claidor,
translating to and from the OpenAI Responses API behind it. The generated
message types are 1,772 lines (`inference_pb.ts`); the server would have to
speak Connect over HTTP/2 with binary protobuf, which nothing in
`server/polar` does today. Keeps the agent loop byte-for-byte; makes Claidor
carry Cursor's protocol forever.

**(b′) Change the executor.** The host already dispatches a non-Cursor
provider to `createProviderPromptSession` at every point the loop asks for a
session: `source/host/runner/turn-run-shell.ts:186-196`,
`source/host/extensions/inference/inference-service.ts:60-66`,
`cursor-inference.ts:190`. `ProviderPromptExecutor.stream`
(`provider-session.ts:257-264`) returns an AI-SDK `fullStream` with
tool-call events left unexecuted, which is the shape the loop consumes.
`openRouterExecutor` (`provider-session.ts:247-255`) does this today in nine
lines against an OpenAI-compatible endpoint. A `claidor` executor is that
function pointed at our proxy with the desktop token as bearer. That is Phase
2, and on the host path it is not a reduced agent — it is the same loop with a
different executor.

What is **not** established is whether the loop completes a full turn on
that shape today with any routed provider. `openrouter` has shipped on this
path since the router landed; no record in this repository says a shell or
computer-use turn has been run through it. Nothing could have: the
coordinator intercepts `sendPrompt` for every non-Cursor provider
(`node-agent-coordinator/inference-router.ts`, `handledLocally`) and runs the
connector-only turn on the Mac, so the host's dispatch to
`createProviderPromptSession` has never been reached by a real turn.

**The run that decides Phase 3.** Phase 2 added the `claidor` provider and a
switch, `SAND_CLAIDOR_FULL_AGENT=1`, that makes the coordinator pass claidor
turns through to the host instead of running them itself
(`routesClaidorThroughHost`). On a Mac, with the packaged app carrying that
variable in `LSEnvironment` beside `SAND_BACKEND_URL`:

1. Settings → Router → Claidor. Box runtime is local Docker by default.
2. Ask the agent to edit a file, run a command, and take a screenshot.
3. Read the gateway log for the turn, and watch the network.

If it completes, route (a) is unnecessary and Phase 3 is done. If it does not,
the failure names what (b′) is missing — and that is the price, measured, not
the 1,772-line guess above. Without the switch, claidor behaves exactly like
`openrouter`: a Cursor-free turn with connector tools, the milestone the brief
allows and does not call the product.

## What this changes in the brief

- Phase 1 is done and its number is zero.
- Phase 3 "the wall" is not a manifest. It is the executor question above,
  and its first step is a run, not a build.
- Bucket B "ours to take" is already taken. The "hardcoded `api3.cursor.sh`"
  the brief attributes to the host is one constant in
  `source/shared/node/experiments/statsig-bootstrap.ts:12`, in our tree,
  editable now; it is bucket C.
- The "five must-build protobuf endpoints" stop being mandatory for the reason
  the brief itself gives — their callers are ours — except `InferenceService/
  Stream`, which is mandatory only under route (a).

## Not run

`npm run package` and `npm run verify` are macOS-only and were not run. No
turn was run against any provider; there is no Mac and no box in this
container. Everything above is build output and source, not runtime.

---

# Phase 3: the executor, measured (19 September 2026, later the same day)

The section above ends with "the first step is a run, not a build", and names
a run that needs a Mac. Rakazo's eval harness
(`rakazo/docs/agent-verification.md` at `34325164`) shows the run does not
need one: drive the real agent loop against a local model fixture, offline,
and read the first failure. That is what was done here. The line numbers in
the (b′) paragraph above (`provider-session.ts:247-264`) are the file as it
was that morning; the executor now sits at `provider-session.ts:299-384`.

## What was run

`desktop/tests/claidor-host-loop.test.mjs`, with
`tests/fixtures/claidor-host-loop-entry.ts` as its bundle entry. It builds
the host's own tool loop — `SimplePromptToolExecutor` from
`source/packages/agent/tool-stream-executor.ts`, the class every real turn
runs through (`turn-run-shell.ts:226`, `turn-agent-composition.ts:202`) —
around `createProviderPromptSession("claidor")`, gives it one tool made by
`createZodAgentTool` (`tools/common.ts`, the wrapper every native tool goes
through), and points `fetch` at a fake Responses server. The state starts
with a system message and a user message, as a real turn's does. Step one:
the fixture answers with a `function_call`. Step two: the loop has executed
the tool and appended its result; the fixture answers with text.

Before the fixes, the first step already told the story:

```
step 1 chunks   [step-start, tool-call-streaming-start, tool-call-delta, tool-call, …]
executed        [ { command: 'ls' } ]
step 2          FAILED: Invalid prompt: message must be a CoreMessage or a UI message
request 1       tools[0].parameters = { "jsonSchema": { "type": "object", … } }
                input = [developer, developer, user]
401 mode        FAILED: step 1 hung
```

The loop is fine. The model's tool call was parsed, the tool ran with the
right arguments, the tool-result message was built. Every failure is in the
executor, and each is a shape the loop speaks that the AI SDK does not:

1. **Tool schemas double-wrapped.** The host's tools carry `parameters`
   already wrapped by the AI SDK's `jsonSchema()`
   (`packages/agent/tools/common.ts:124`). `toToolSet` wrapped them again, so
   the proxy received `"parameters": {"jsonSchema": {…}}` for every tool.
   The coordinator's connector tools carry bare `inputSchema`, which is why
   Phase 2's test, which only ran that path, passed.
2. **Two system prompts.** The executor always sent the router prompt
   ("You are Caisra, a warm, concise desktop assistant … Respond directly to
   the user") as `system`, in front of the state's real system prompt. On
   the host path that is the whole brief, followed by a paragraph telling
   the model to ignore the SendMessage design.
3. **Every turn with a tool call died at the second model call.** The loop
   appends tool results with Cursor's wire metadata under
   `providerOptions.cursor.highLevelToolCallResult`
   (`tool-stream-executor.ts:741`), and `isError` in it is `undefined` for a
   successful tool. The AI SDK validates `providerOptions` as JSON; `undefined`
   is not JSON; the prompt is refused. This alone means no routed provider has
   ever completed a tool call on the host path, `openrouter` included.
4. **A proxy refusal hung the turn forever.** When the first request fails
   (401 expired token, 402 no credits, 5xx), the AI SDK (v4.3.17) yields one
   `error` part and closes the stream, and never settles `response`
   (`node_modules/ai/dist/index.mjs:5469`, `recordedSteps.length === 0`
   → return). The loop then awaits `response`
   (`tool-stream-executor.ts:1205`, and again at `:1224` on the error path).
   Measured: the step was still waiting at the 5-second timeout.
5. **Images in tool results were dropped.** The Responses converter in
   `@ai-sdk/openai` 1.3.24 emits `output: JSON.stringify(part.result)` and
   ignores `experimental_content` (`dist/index.mjs:1931-1939`). A screenshot
   — the computer-use tool's whole output — reached the model as
   `output: undefined`, an invalid request; had it been valid, the model would
   have been blind. This is the Rakazo failure `CLAUDE.md` says must be made
   impossible.

## What changed

All in `source/host/extensions/inference/provider-session.ts`, shared by the
`claidor` and `openrouter` executors, which now go through one
`aiSdkExecutor`:

- `toolParameterSchema` unwraps an AI SDK `Schema` to its bare JSON Schema
  and leaves bare schemas alone; `codexTools` uses it too.
- `toCoreMessages` is the copy the wire sees: text/image user parts, text/
  tool-call/reasoning assistant parts (signatures and `providerOptions`
  dropped), tool results with a string `result` (falling back to the rendered
  text, then to a one-line placeholder), and every image found in a tool
  result carried as the **next user message** — the Responses wire takes no
  images inside a function output, so the person's model sees the screenshot
  as an attachment that follows it. The loop keeps its own messages
  untouched.
- The router prompt is only sent when the messages carry no system message.
- `settleAiSdkStream` races every promise the loop awaits against the first
  `error` part and throws from the stream, so a refusal ends the step with
  the provider's own sentence.

After the fixes, the same harness:

```
request 1  tools[0].parameters = { "type": "object", "properties": { "command": … } }
           input = [developer("You are the real system prompt."), user("list files")]
step 2     response.messages = [assistant("done")]
request 2  input = [developer, user, function_call(call_1, run_shell, {"command":"ls"}),
                    function_call_output(call_1, "a.txt")]
image      … function_call_output(call_1, "(the tool returned an image; it follows as an attachment)"),
           user[input_text, input_image(data:image/png;base64,…)]
401        response.error = "desktop access token expired", within 300 ms
```

`npm run check`: 35 tests, 33 pass, 2 skipped (as before), both typechecks
green. The four new tests fail on the previous executor (4/4; the refusal
test by hitting its timeout) and pass on this one.

## What this establishes, and what it does not

Established: the host's tool loop completes a two-step turn on the claidor
executor, with a tool call executed in between, against a Responses server
that answers in OpenAI's documented event shapes. The wire the proxy sees is
what OpenAI documents. Route (a), serving `InferenceService/Stream` on Claidor,
is not needed for this; the earlier "1,772-line guess" is retired.

Not established, and still needing the Mac run above:

- A live model's behaviour on the real system prompt (~38,000 characters) and
  the full tool set. The fixture answers what it is told to.
- Whether OpenAI accepts a `function_call` continuation without the reasoning
  item that preceded it. The AI SDK sends none (`dist/index.mjs:1918-1926`,
  no `id`s), which is the documented-safe form; the proxy forwards what it
  is given. If this fails it shows in `desktop.proxy.upstream_refused`.
- `function_call_output` is a JSON-encoded string (`"\"a.txt\""`), the AI
  SDK's convention for every OpenAI user. Large shell output arrives with
  escaped newlines. Not wrong; noted.
- Whether the turn *above* this loop — `AnysphereAgent.runStream`, the
  action handlers, summarization, self-summary — has any other provider
  assumption. It is the same code the `SAND_AGENT_MOCK_RESPONSE` mock
  executor already exercises in production, and the mock's contract
  (`packages/chat-inference/mock-prompt-executor.ts`) is the one the claidor
  executor now meets, but that is reasoning, not a run.
