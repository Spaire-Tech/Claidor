# Making Caisra depend on nothing from Cursor

**19 September 2026.** Produced by six parallel readers over `desktop/source`, `server/polar`, the built bundles and the project wiki, then one synthesis pass. Every claim cites file:line. Where readers contradicted each other the conflict is named and resolved, not silently picked.

---

# Making Caisra depend on nothing from Cursor or Anysphere

**Read this first.** One architectural fact reorganises everything below, and it is the thing the six readers disagreed about. I checked it directly.

**The packaged app is a hybrid. Source edits reach five runtimes and do not reach the host.** `scripts/lib/clean-build.mjs:52` and `:60` mark `electron-main` and `host` as `mode: "artifact-fallback"`. Electron-main is nonetheless upgraded to clean-source, because `manifests/reconstruction/electron-main-production-bindings-manifest.json` exists on disk (confirmed: `ls manifests/reconstruction/` returns it) and `scripts/clean-build.mjs:219` defaults to it — whereas `:218` defaults `hostBindingManifest` to a literal `|| null`, and **no host manifest exists**. So:

| Runtime | Source edits reach it? | Evidence |
|---|---|---|
| `node-agent-coordinator` | **YES** | `clean-build.mjs:44` `mode: "clean-source"`; in `executableReplacements` (`:41`) |
| `electron-main` | **YES** | manifest present; `clean-build.mjs:219` |
| preloads, box-exec-daemon, local-exec-daemon | **YES** | `clean-build.mjs:33-37, 42-43` |
| **`host`** | **NO — Anysphere's compiled bytes** | `clean-build.mjs:60` `artifact-fallback`; no host manifest; absent from `executableReplacements` |

**Reader 1, 3 and 4 propose editing `source/host/extensions/inference/provider-session.ts`. Reader 5 says edits under `source/host` never reach the product. Both are right, and the resolution is decisive in our favour:** `provider-session.ts` is imported by the coordinator at `source/node-agent-coordinator/inference-router.ts:5` (`import { runRoutedProviderText } from "../host/extensions/inference/provider-session.js"`), so it is compiled into the coordinator bundle too. Measured:

```
dist/node-agent-coordinator/main.cjs : openrouter.ai/api/v1 = 1,  RunWebSearch = 0,  api3.cursor.sh = 0,  asphr bucket = 0
dist/host/host-main.cjs              : openrouter.ai/api/v1 = 1,  RunWebSearch = 23, api3.cursor.sh = 1,  asphr bucket = 1
```

Editing `provider-session.ts` changes the coordinator (which we ship) and the host (which we don't). The coordinator intercepts every user `sendPrompt` before the host sees it (`node-agent-coordinator/main.ts:228`). **That is why the cheap path works.** It is also why web search, web fetch and image generation cannot be fixed by editing source at all — they live only in the host bundle.

---

## What is already ours

Nothing on this list needs any work.

| Thing | Proof |
|---|---|
| **Every backend URL already points at Claidor.** All three names are frozen into `LSEnvironment`. | `scripts/lib/config.mjs:69-72` — `CURSOR_API_BASE_URL`, `CURSOR_WEBSITE_URL`, `SAND_BACKEND_URL` all `https://api.claidor.com`; read at `source/shared/node/cursor-token.ts:38` |
| **An OpenAI-compatible, metered, authenticated inference surface is deployed.** Four routes, live. | `server/polar/desktop/endpoints.py:100` (`prefix="/desktop"`), `:749` messages, `:762` chat/completions, `:790` responses, `:811` models |
| **Auth accepts a static PAT, not just the app's 1-hour token.** | `server/polar/desktop/auth.py` — `is_desktop_access_token(token)` first, then `Scope.model_proxy in auth_subject.scopes` |
| **The provider abstraction, its persistence, its Settings UI and its local transcript store all exist and ship.** | `source/shared/inference-router.ts:1`; `sand-settings-store.ts:158`; `scripts/lib/router-renderer-patch.mjs:13-18`; `main-edge.ts:115` |
| **A generic OpenAI-compatible executor exists. Its only provider-specific values are baseURL, key, two vanity headers and a model id.** | `source/host/extensions/inference/provider-session.ts:247-255` |
| **A secrets store the provider already reads, already writable from the shipped Router panel.** | `provider-session.ts:35-49` (`persistedSecrets()`); `router-renderer-patch.mjs` (`RRouterCredential`) |
| **Escaping the Cursor-brokered box is a setting, fully wired end to end — container start/stop, rollback on failure, coordinator restart.** | `local-docker-host-connector.ts:245`; `main-edge.ts:117-118` |
| **The local box needs no Claidor auth endpoint.** In local-docker mode the in-box renewer reads a bind-mounted file instead of calling the network. | `host/extensions/auth/auth-service.ts:56-62`; file written at `local-docker-host-connector.ts:51-60` |
| **Local-docker already disables the Anysphere host-bundle auto-update.** The container is created with `SAND_BOX_AUTO_UPDATE=0`. | `local-docker-host-connector.ts:192` (verified in the `docker run` arg list) |
| **Sentry / metrics.cursor.sh is unwired, not merely gated.** `initSandSentryForDesktop` has zero call sites. | `electron-main/telemetry/sentry.ts:15-16`; reader 5's grep across `source/ src/ scripts/ tests/` |
| **api3.cursor.sh receives zero traffic today, and Claidor's 404 is what keeps it that way.** | `statsig-bootstrap.ts:12`; client only constructed at `cursor-experiments.ts:75`, which needs a bootstrap config Claidor does not serve |
| **The updater is off in every packaged build.** | `scripts/lib/build-asar.mjs:17` injects `SAND_DISABLE_UPDATES ??= "1"`; `update-gate.ts:2`; `sand-update-service.ts:46` |
| **Text-to-speech is already Claidor's.** | `endpoints.py:1046` |
| **Skill store (14 skills) and MCP marketplace (15 servers) are live and non-empty.** | `endpoints.py:447, :494, :551`; `polar/desktop/skills/catalog.json` |
| **Root-mounted routes work on api.claidor.com** — the pattern a Connect handler would need is already proven. | `polar/desktop/app_sign_in.py:65` (prefix-less router), included at `polar/app.py:276`; `curl -X POST https://api.claidor.com/loginDeepControl` → 200 |
| **Adding a fifth provider requires no server route at all.** | `endpoints.py:762` already serves the wire |

---

## The shortest path

Ordered by dependency, cheapest high-value first. Steps 1–4 are roughly a day and produce an app that completes a turn without contacting Cursor.

**Step 1 — Close the executable-code channel. 2 lines, zero server work, do it today.**
`scripts/lib/config.mjs:69`, add to `packagedEnvironment`:
```js
SAND_HOST_BUNDLE_S3_BASE_URL: "https://api.claidor.com/desktop/host-bundle",
SAND_BOX_AUTO_UPDATE: "0",
```
This is the only remaining path by which an Anysphere-controlled server ships executable code into the product, and it is **on by default** (`host/extensions/host-upgrade/extension.ts:12`). The destination is env-redirectable (`host-bundle-source.ts:11`) and both failure paths are silent no-ops (`:15`, `host-upgrade-service.ts:45`), so a 404 is a safe kill switch. Note this matters only for `boxRuntime: "remote"` — the local-docker container already sets `SAND_BOX_AUTO_UPDATE=0` (`local-docker-host-connector.ts:192`).

**Step 2 — Add the `claidor` provider. ~60 lines across four files.** Reaches the product through the coordinator bundle, as established above.

- `source/shared/inference-router.ts:1` — add `"claidor"` to the tuple; `:24` `emptySandInferenceRouterUsage` hardcodes the four keys, add the fifth.
- `source/host/extensions/inference/provider-session.ts` — add `claidorExecutor`, a copy of `openRouterExecutor` (`:247-255`) with `baseURL: `${getConfiguredBackendUrl()}desktop/api/proxy/v1``, `name: "claidor"`, and a credential reader modelled on `openRouterCredential()` (`:45-49`) reading a Claidor PAT from the same secrets store. Wire it into `ProviderPromptExecutor.stream` (`:259-263`), `createProviderPromptSession` (`:267`) and `runRoutedProviderText` (`:279-283`).
- **`source/node-agent-coordinator/inference-router.ts:37` — add `"claidor"` to the second, independent hardcoded list** `["codex","claude-code","openrouter"]`. I verified this line. It is a transcript-row filter comparing `String(row.provider)`; TypeScript will not catch the omission, and the symptom is that every conversation sends correctly and then has its entire history silently discarded on reload.
- `scripts/lib/router-renderer-patch.mjs:13-18` (`RRouterProviders`) — add it to the shipped picker.

Credential, cheapest version: mint a PAT with `Scope.model_proxy` (Account → Developer) and store it through the existing Router panel. No new IPC. `auth.py` accepts it.

**Step 3 — Make it the default. 1 line.**
`source/shared/node/settings/sand-settings-store.ts:158` — `?? "cursor"` becomes `?? "claidor"`. Until this changes, every fresh install dials `aiserver.v1.InferenceService/Stream` and 404s.

**Step 4 — Move the box off Cursor's broker. 1 line.**
`source/shared/box-runtime.ts:3` — `DEFAULT_SAND_BOX_RUNTIME` from `"remote"` to `"local-docker"`. This single edit removes `EnsureSandBox`, `RecreateSandBox`, `ForceRecreateSandBox`, `/sand-box/local-exec-daemon-credential` and `/sand-box/inference-credential` from the must-build list (`local-docker-host-connector.ts:245` short-circuits before `remote.connect()`; `ensureSandBox` is called in exactly one place, `box-host-connector.ts:84`). Gate on Docker being present — reverting the setting on failure is already implemented at `main-edge.ts:118`.

**Step 5 — Fix the live token leak. 1 line, in editable code.**
`source/electron-main/box/local-docker-host-connector.ts:192-196`. I read the full `docker run` arg list: the container gets `SAND_BACKEND_URL` **only** when `issueInferenceCredential` wins a 3-second race (`:234-238`), and never gets `CURSOR_API_BASE_URL`. When the race is lost, the host bundle mounted into that container falls back to `DEFAULT_CURSOR_BACKEND_URL` — and that exact string is in the file being mounted (`grep api2.cursor.sh dist/host/host-main.cjs` → 1 hit). A Claidor bearer token then goes to api2.cursor.sh. Always pass `--env SAND_BACKEND_URL=${getSandInferenceBackendUrl()}` and `--env CURSOR_API_BASE_URL=...`, unconditionally.

**Step 6 — Remove the last gateway dependency from a routed turn. ~5 lines.**
`source/node-agent-coordinator/inference-router.ts:128` — verified unguarded:
```ts
const [remote, beforeUser] = await Promise.all([options.dispatchRemote("getAgentTranscriptTail", { id: agentId }), load()]);
```
`dispatchRemote` routes this to the box gateway (`main.ts:217-221`). If the box is unreachable, the rejection surfaces as a `Router error:` bubble (`:216-224`) and the turn dies even though the model was reachable. Wrap it in a try/catch falling back to `{ entries: [] }`. After this, a routed turn touches nothing but Claidor.

**Step 7 — Server, optional, cheap: a catch-all for `/aiserver.v1.*`.**
Today Claidor answers FastAPI's JSON 404, and connect-es maps HTTP 404 to `Code.Unimplemented` (`@connectrpc/connect/protocol-connect/http-status.js:33-34`), while the app's friendly branch only fires on `Unauthenticated`/`PermissionDenied` (`box-host-connector.ts:93`). So the designed access cover never appears; users get raw `Unimplemented`. A prefix-less route returning `{"code":"unimplemented","message":"..."}` with the right status restores the intended UX with zero app changes. Mount it like `app_sign_in.py:65`.

---

## What Claidor must serve

After steps 1–6, this is the genuinely MUST_BUILD list. **Everything here is Connect RPC in binary protobuf at the root of the API host, and none of it can be avoided by editing source**, because every caller lives in `dist/host/host-main.cjs`, which is artifact-fallback.

| Endpoint | Why | Request/response shape | How hard |
|---|---|---|---|
| `POST /aiserver.v1.AiService/RunWebSearch` | The agent's web-search tool. Handed to the agent unconditionally on every provider and model (`host/runner/tools/turn-toolset.ts:1414-1417`). Fails soft to "An error occurred while searching the web" — the model is never told it is blind. | `RunWebSearchRequest`/`Response` recovered from `packages/proto/generated/aiserver/v1/*_pb.ts` | **Protobuf required.** Medium: schema recovery + a search backend Claidor does not have |
| `POST /aiserver.v1.AiService/RunWebFetch` | Same toolset. Client already does SSRF/local-network blocking before the call (`web-fetch.ts:104-108`), so a server implementation inherits that protection. | oneof response with a graceful `undefined` arm | **Protobuf required.** Low-medium once the transport exists |
| `POST /aiserver.v1.AiService/RunGenerateImage` | Two callers: the agent's GenerateImage tool (`generate-image-service.ts:12`) and agent-avatar generation (`avatar-images.ts:72`). **This, not `/desktop/api/media/images/models`, is the real image call** — `docs/product/images-state.md` is measuring the wrong door. | error/undefined arms throw `SandGenerateImageError` | **Protobuf required.** Medium |
| `POST /aiserver.v1.DashboardService/ListSandMcpTools` | Without it the agent has **no connector tools on the routed path**, because `listRoutedMcpTools` returns only what the MCP extension holds (verified, `host/host-gateway-api.ts:141-151`). | `{serverIdentifiers[]}` → `[{name, providerIdentifier, toolName, description?, inputSchema?}]`, 60s timeout (`backend-mcp-exec.ts:3-6`) | **Protobuf required.** Low — Claidor already serves the substance at `/desktop/api/mcp-marketplace` and `/desktop/api/connectors` |
| `POST /aiserver.v1.DashboardService/ExecuteSandMcpTool` | The execution half. Degrades to a per-tool error string, so the agent limps rather than crashes. | `{serverIdentifier, toolName, args, toolCallId, agentId}`, 180s | **Protobuf required.** Low — Pipedream/Composio proxies exist (`connectors/endpoints.py:189`, `endpoints.py:1196`) |

**On protobuf, plainly: these five cannot be served as plain JSON.** `useBinaryFormat` defaults to `true` in `@connectrpc/connect-node` (verified at `node-transport-options.js:54`), and none of the three call sites pass it: `cursor-inference.ts:157`, `cursor-marketplace-client.ts:36`, `host/box/generated-production.ts:237`.

**Reader 2 called `useBinaryFormat: false` "the single biggest lever" and said the transport is built in exactly two places. I found three, and the lever does not work for this list.** All five callers above are compiled into the host bundle, which we cannot rebuild from source. Setting `useBinaryFormat: false` in `cursor-inference.ts` would change the electron-main copy only. It remains a real lever for the *electron-main* RPCs (`TranscribeAudio`, `AvailableModels`, the profile and connector-config family) — worth taking for those — but it does not turn the host's five into JSON. Claidor needs a protobuf codec and Connect framing (`{"code","message","details"}` error bodies, `application/proto`, HTTP/1.1, no HTTP/2, no gRPC) and the `.proto` schemas must be recovered from `packages/proto/generated/**/*_pb.ts` — `find desktop -name '*.proto'` returns 0.

---

## What we delete

| Delete | What is lost |
|---|---|
| Cloud agents — 21 BackgroundComposer methods (`host/extensions/cloud-agents/*`) | Cursor's cloud-agent product. Its permalinks are `https://cursor.com/agents/${bcId}` (`cloud-agents-service.ts:31`). Nothing of ours. |
| Cursor billing/trial — `GetSandUsageStatus`, `GetCurrentPeriodUsage`, `GetSandTrialClaimStatus`, `CancelSandTrial`, `ClientAction` | Nothing. Claidor meters independently (`endpoints.py:_proxy`, `pricing.py:667`). Already behind the `sand_usage_page` gate. |
| Team methods — `GetTeamRules`, `GetTeamPluginPopularity`, `PublishPlugin`, `UnpublishPlugin` | Nothing. Unreachable for a teamless account (`mcp-team-popularity.ts:5`, `team-rules.ts:20`). `{teams: []}` is a complete answer. |
| Telemetry family — `TrackEvents`, `SubmitLogs`, `RecordSandAuditEvents`, `ReportClientNumericMetrics`, `ReportSandProcessMetrics`, both `RecordAgent*Labeling` | Nothing. All seven swallow their own failures (`buffer.ts:115`, `structured-log-transport.ts:117`, `sand-labeling.ts:41`). |
| **`BootstrapStatsig` — delete, and specifically do not serve it** | Counter-intuitive but correct: serving a config is the only thing that constructs a `StatsigClient` (`cursor-experiments.ts:75`), whose upload host is the hardcoded, non-overridable `https://api3.cursor.sh/tev1/v1` (`statsig-bootstrap.ts:12`). **The 404 is load-bearing.** Only serve this after that constant is changed — and it lives in the host bundle too, so today it cannot be. |
| Multiplayer — 13 `/sand/xuser/*` and `/sand/share-rooms/*` paths | Nothing. Gated off by `sand_multiplayer`, which without Statsig sits at its default (`cross-user-sharing/extension.ts:18`). Outside the direction: one person, one computer. |
| Box object store — 13 RPCs | Nothing. Off unless `SAND_BOX_STORE_SYNC` is set (`box-store-backend-policy.ts:10`), and a `local-fs` backend already exists (`box-object-store.ts:278`). |
| Three hardcoded cursor.com links | The Help Center item (`electron-main/application-menu.ts:101`) **is** editable — electron-main is clean-source. The upgrade/pricing buttons (`agent-run-error.ts:8,120,156`) and the integrations fallback (`listener-integrations.ts:13`) are in the host bundle and **cannot be edited**; they only appear on error cards we will not generate. |

---

## What is genuinely lost

**1. The agent's native tools, on the routed path. This is the big one and it is not cheap.**
On the coordinator path the agent sees **only MCP plugin tools**. I verified `listRoutedMcpTools` at `host/host-gateway-api.ts:141-151`: it maps `mcp.listTools()` and nothing else. No shell, no file edit, no computer use, no browser. Path B — the in-agent-loop swap at `provider-session.ts:259-263` — *does* receive full native tool definitions (`packages/agent/tool-stream-executor.ts:904-913`), but the coordinator intercepts every user `sendPrompt` before the host sees it (`main.ts:228`), so path B only fires for automations, workflows, teach-recording and subagents. **So steps 1–6 buy a Cursor-free turn whose agent is a chatbot with connectors.** Three ways out, and the choice should be made deliberately:

- **(a)** Serve `InferenceService/Stream` in binary protobuf, keep `provider=cursor`, and the host's full agent loop works unchanged with every native tool. Most capability, most server work: a streaming Connect endpoint plus recovered schemas.
- **(b)** Produce `manifests/reconstruction/host-production-bindings-manifest.json` so the host becomes clean-source. Then `provider=claidor` runs path B with native tools. Cost unknown — `clean-build.mjs:60` says "recovered host main requires concrete host factories and process bootstrap dependencies", and the electron-main equivalent took a manifest of 5,851 bytes.
- **(c)** Ship (1–6) as an honest v1 and accept the limitation.

Also note the live defect on path B: codex advertises tools but passes `undefined` where `executeTool` belongs (`provider-session.ts:260` vs `codex-direct-responses.ts:162`, which throws). Copy `openRouterExecutor`'s signature, not codex's.

**2. Web search and web fetch.** Not free. Claidor has no search backend; serving `RunWebSearch` means buying one (Brave/Exa/Serper) *and* building the protobuf transport. Until then the agent carries a WebSearch tool that silently returns "An error occurred while searching the web" on every model. **That is precisely the Rakazo blindness failure this repo already wrote down, in a different costume** — the agent is blind and reads as stupid. If we do not serve it, remove the tool rather than leave it failing.

**3. Image generation.** Same protobuf gate, plus a real image provider. `/desktop/api/media/images/models` returning 404 is a different, secondary hole.

**4. Reasoning quality on the chat/completions wire.** `endpoints.py:663-704` forces `reasoning_effort: "none"` whenever an OpenAI model carries tools and `model.tool_reasoning is not True`. The `ai` SDK's `createOpenAI().chat()` speaks that wire. CLAUDE.md records that the `/responses` wire exists to avoid exactly this. Start on `.chat()` because it works today; move to Responses before calling it done.

**5. Model choice.** `GET /desktop/api/proxy/v1/models` returns only OpenAI models reachable on the completions wire — today `gpt-5.6-terra` and `gpt-5.6-luna` (`pricing.py:380-385`, `:202`). `claude-sonnet-5` is filtered out. Anthropic models via the routed provider need the `/v1/messages` wire or a catalogue change.

**6. Crash reporting.** Already gone, and worth knowing: Sentry is unwired, not disabled. Nobody calls `initSandSentryForDesktop`.

---

## Open questions

| Question | Exact command or test that settles it |
|---|---|
| Do the host and coordinator child processes inherit `LSEnvironment` and the `??= "1"` guards? The guard is prepended to the electron-main bundle only (`scripts/electron-main-production-activation.mjs:427`). If they do not inherit, the host's Statsig falls back to `https://api2.cursor.sh`. **This decides whether Step 1 works at all.** | On a packaged Mac: `open dist/Caisra.app`, then `ps eww $(pgrep -f host-main.cjs) \| tr ' ' '\n' \| grep -E 'SAND_BACKEND_URL\|CURSOR_API_BASE_URL\|SAND_HOST_BUNDLE_S3_BASE_URL\|SAND_BOX_AUTO_UPDATE'` |
| Does the shipped checksum-pinned 0.18.0 renderer contain its own hardcoded Cursor hosts? `src/app/dist` is empty here (`find desktop/src -maxdepth 4` → `src/app/package.json` only), so nobody has checked. | After `npm run bootstrap` on a Mac: `grep -o 'https://[a-z0-9.]*cursor[a-z.]*' src/app/dist/renderer/assets/*.js \| sort -u` |
| Does openrouter-style path B actually work, or does it throw like codex? Reader 1 marked this UNVERIFIED-by-running. It decides whether option (b) above is worth pricing. | `SAND_OPENROUTER_MODEL=... OPENROUTER_API_KEY=... node --test desktop/tests/` plus one automation turn with `inferenceProvider: "openrouter"` and a native tool in scope |
| Is the local-docker image still pullable, and do we want an Anysphere artifact at the base of our box? Reader 6 confirmed anonymous pull works today (ECR token + manifest → 200); reader 1 flagged it as outside our control. | `docker pull public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest` — then decide whether to mirror it to our own registry |
| What does a real host bindings manifest cost? This is the difference between option (b) and option (c). | Diff `manifests/reconstruction/electron-main-production-bindings-manifest.json` against what `scripts/clean-build.mjs:77` `buildProductionHostIfSupplied` demands; run it with a stub manifest and read the first failure |
| Does CLAUDE.md's whisper claim hold? Reader 2 found `whisperServer.ts` and `useDictation.ts` absent and `grep -rl whisper source/` empty — contradicting CLAUDE.md, which states whisper is wired at `main.ts:304`. If whisper is genuinely absent, `TranscribeAudio` moves from NICE_TO_HAVE to a real gap. | `npm run bootstrap` then `grep -rl whisper src/app/dist/` — the claim may describe the un-hydrated bundle |

**One contradiction I could not resolve and am not picking a side on:** reader 3 reports `desktop/src` holding 1 file and `desktop/source` holding 1,724, concluding the Caisra/LobsterAI tree named throughout CLAUDE.md "is gone from the working tree". I confirmed `dist/caisra-build.json` says `"mode": "clean-source", "upstreamBinaryUsed": false` — so the `dist/` I measured above is the **workspace** build (`scripts/build.mjs`), which CLAUDE.md explicitly says is *not* the product. My bundle measurements are therefore sound for what source compiles into, but the definitive packaged-app measurement needs `npm run bootstrap && npm run package` on a Mac. Everything in the table at the top comes from `clean-build.mjs`'s declared composition and the on-disk manifests, not from the workspace `dist/`.