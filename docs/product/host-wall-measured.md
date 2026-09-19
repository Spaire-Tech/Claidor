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
computer-use turn has been run through it. That is the first thing to run on a
Mac after Phase 2 lands: set the provider to `claidor`, ask for a file edit
and a command, and read the gateway log. If it completes, (a) is unnecessary.
If it does not, the failure names what (b′) is missing — and that is the
price, measured, not the 1,772-line guess above.

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
