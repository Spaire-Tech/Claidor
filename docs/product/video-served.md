# Watching a video, served (25 September 2026)

The founder's rule for this batch: "always assume that we already have
it." We did. Grok Bot's `watchVideo` and `videoReview` subagents were
in the tree end to end and refused at three places, all measured in
`cursor-dependencies-map.md` §6: nothing registered them, the executor
could not carry a video, and the brief said "You can't watch videos
yet". This is the record of what was reused, what was built, the
routes, and what has not run on a Mac.

## What was reused, untouched

- The subagent types and their names: `packages/agent/tools/core/subagent/subagent-config.ts`
  (`getSubagentTypeName`: proto case `watchVideo` → "watchVideo",
  `mediaReview` → "videoReview"; `isGeminiVideoSubagentType`;
  `normalizeSubagentTypeName`, which reads "mediaReview" as videoreview).
- Attachment preparation: `task-subagent-preparation.ts` reads the video
  from its box path with the read executor, refuses a non-Gemini model
  (`isGeminiModelId`), builds `SelectedVideo` with the bytes inline up
  to `getInlineVideoMaxBytes` (15 MB) and fps 4 by default; the MIME map
  and the trusted roots (`SAND_BOX_WORKSPACE_ROOT` via `turn-toolset.ts`).
- The Task tool's model resolution: `resolveSubagentModel`
  (`task-cluster-internal.ts`) returns a config's `userRequestedModelId`
  as is under the production options (`isModelValid: () => true`).
- The context part: `context-processing.ts` ~283 turns the video into
  `{type: "image", image: "data:video/mp4;base64,…", mimeType,
  providerOptions: {cursor: {videoFps}}}` when the agent state's
  `modelId` says gemini (`state.ts:1770` passes `this.modelId`).
- The child's own prompt, `buildSandSubagentSystemPrompt`, and the
  per-identity shell (`buildProductionTurnRunShell`).
- The whole model proxy: `_proxy` in `server/polar/desktop/endpoints.py`
  meters the answer, relays a stream, logs a refusal
  (`desktop.proxy.upstream_refused`), applies the month's allowance and
  the hourly brake. It gained three keyword overrides and nothing else.

## What was built

**Server** (`CLAIDOR_GEMINI_API_KEY` on Render is what turns it on):

- `polar/config.py`: `GEMINI_API_KEY` (env `CLAIDOR_GEMINI_API_KEY`),
  `DESKTOP_GEMINI_BASE_URL`.
- `polar/desktop/pricing.py`: `DesktopProvider.gemini`,
  `SpokenApi.gemini_generate_content`, `ModelRole.video` (offered, never
  in the menu), `DesktopModel.supports_video`, price rows for
  `gemini-2.5-flash` (the video role) and `gemini-2.5-pro` (priced, not
  offered), `Usage.from_gemini_payload` (`usageMetadata`:
  `promptTokenCount` less `cachedContentTokenCount` as input, cached as
  a cache read, `candidatesTokenCount + thoughtsTokenCount` as output),
  `GeminiUsageTally` (the last cumulative `usageMetadata` of an
  `alt=sse` stream), `video_models()`. ⚠️ The Gemini prices are written
  from memory and marked "to confirm" in the file; nobody should be
  charged against them until someone reads ai.google.dev/pricing.
- `polar/desktop/video.py`: `parse_gemini_call` (the `{model}:{method}`
  path segment), `count_video_parts` (for the log line).
- `polar/desktop/endpoints.py`: `POST /desktop/api/proxy/v1beta/models/{model}:generateContent`
  and `:streamGenerateContent` (`proxy_gemini_generate`), which hand
  `_proxy` the model from the path, the upstream path with its query
  (`?alt=sse` forwarded) and whether it streams; `_gemini_headers`
  (`x-goog-api-key`), `_gemini_body` (untouched); the pricing
  catalogue's `videoModels` is filled from the offered models; one
  `desktop.video.generate` log line per call (model, stream, inline and
  URI video counts, inline bytes, fps).
- `tests/desktop/test_video_proxy.py` (14 tests, `respx` against a fake
  Google): the path parsing, the usage reader and tally, the model
  lists with and without a key, the key injection and the untouched
  body, the metered row (900 in / 100 cached / 25 out, provider
  `gemini`), the relayed stream with its query, 503 with no key, 400
  for a non-Gemini model on this wire, 404 for an unknown method, the
  hourly brake, and a refusal handed back and written down.

**Desktop**:

- `shared/video-availability.ts`: the switch `SAND_VIDEO_SUBAGENT_SERVED`
  (default on; "0" is off), the model `SAND_CLAIDOR_VIDEO_MODEL`
  (default `gemini-2.5-flash`), `VIDEO_INLINE_MAX_MB = 15`, the
  coming-soon sentence. The Mac forwards both envs into the box
  (`SERVED_SWITCH_ENVS`, `local-docker-host-connector.ts`).
- `host/extensions/inference/gemini-direct-generate.ts`: Gemini's wire
  by hand (`@ai-sdk/google` is not installed; measured:
  `desktop/node_modules/@ai-sdk/` holds openai, provider,
  provider-utils, react, ui-utils). `toGeminiRequest` writes the loop's
  messages as `systemInstruction` + `contents`: the video as
  `inlineData {mimeType, data}` with `videoMetadata {fps}` from
  `providerOptions.cursor.videoFps` (a URL video as `fileData`), the
  assistant's tool calls as `functionCall`, tool results as
  `functionResponse` in a user content, consecutive same-role contents
  folded (Gemini wants alternation); tools as `functionDeclarations`
  with the schema reduced to Gemini's OpenAPI subset
  (`sanitizeGeminiSchema`: no `$schema`, `additionalProperties`,
  `default`; `["number","null"]` becomes nullable; a tool with no
  properties gets no `parameters`). `streamGeminiGenerateContent` reads
  the `alt=sse` stream (CRLF lines) and yields the parts the loop
  consumes: `text-delta` and `tool-call` (Gemini 2.5 returns no call
  ids; one is minted per call), then `done` with the usage.
- `provider-session.ts`: `ClaidorSessionModelOptions.isVideoSubagent`
  puts a session on the video model at low effort (the flag, never the
  name: Grok Bot's summarization session names `gemini-2.5-flash` too
  and stays on Luna); `claidorExecutor` sends a Gemini id to
  `geminiExecutor`, which writes the same `[claidor] model=` line as
  every other call plus one `[claidor] video model=… parts=N
  video/mp4@4fps 612KB offered=…` line, and a `[claidor] model-error`
  line on failure. No Luna fallback on a 429: a model that cannot see
  the video is not an answer.
- `host/runner/tools/sand-video-subagent.ts`: the two configs, on the
  real proto cases (`watchVideo`, `mediaReview`), pinned to the video
  model by `userRequestedModelId`, with descriptions that say
  `file_attachments`, the 15 MB limit and what to report back.
- `host-runner-composition.ts`: `resolveSubagentConfigs` registers them
  while the switch is on; a child whose `subagentType` is a video type
  (`isVideoSubagentType`) gets the video model in its static config
  (`turnModelId`, so `state.modelId` says gemini and the video is
  accepted) and `isVideoSubagent: true` on its owner input (so the
  executor speaks Gemini); the `[claidor] prompt … identity=video:watchVideo`
  line names it. The flag is threaded through
  `production-turn-agent-owner.ts` and `turn-run-shell.ts` the way the
  computer/browser flags are.
- `system-prompt.ts`: the "You can't watch videos yet" sentence is gone
  from the served brief; in its place the brief says to dispatch Task
  with `subagent_type watchVideo` (or `videoReview`), the video's box
  path in `file_attachments`, up to 15 MB, never to claim to have
  watched a video itself. The coming-soon sentence sits behind the
  switch (`videoSubagentOffered`, default from the environment). A
  video child's subagent prompt says the video is in its task message
  and not to open the file with a tool.
- `electron-main/models/claidor-model-catalog.ts`: a `video` role row
  stays off the picker, like `fallback`.
- `tests/watch-video.test.mjs` (6 tests, offline): the configs and the
  Task tool's resolver, the composition's wiring, the whole executor
  against a fake Gemini door (URL, bearer, `systemInstruction`,
  `inlineData` + `videoMetadata`, the sanitized tool schema, the
  `text-delta` and `tool-call` parts, the usage, the two log lines), the
  request conversion of a tool round and a URL video, the brief's
  switch, the picker and the forwarded envs.
  `tests/prompt-and-turn.test.mjs` now pins the served sentence.

## The path of one video, end to end

1. The person attaches `clip.mp4`; the attachment note gives the agent
   its box path (attachment-topology, 25 September).
2. The agent dispatches `Task({subagent_type: "watchVideo",
   file_attachments: ["/workspace/uploads/clip.mp4"], prompt: …})`.
3. `resolveTaskSubagentConfig` finds the config (registered), resolves
   the model to `gemini-2.5-flash`; `processAttachments` reads the file
   through the read executor, accepts it (the model says gemini), keeps
   it inline when ≤ 15 MB, else throws "Video exceeds maximum size".
4. `createSubagentRunner` builds the child with `subagentType:
   "watchVideo"`; its shell's static config carries the video model and
   its owner input the flag; `processSelectedContext` writes the
   `data:video/mp4;base64,…` part with fps 4.
5. `createProviderPromptSession(…, {isVideoSubagent: true})` →
   `claidorExecutor` → `geminiExecutor` → `POST
   /desktop/api/proxy/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`
   with the bearer.
6. The server checks the model (a Gemini one, on the Gemini wire), the
   key, the month and the hour, logs `desktop.video.generate`, forwards
   with `x-goog-api-key`, relays the stream, meters the last
   `usageMetadata` into `desktop_usage` with provider `gemini`.
7. The child's text comes back as the Task's result; the agent tells
   the person.

## What is not built, and the limits

- **Files over 15 MB.** Grok Bot's signed-URL path
  (`GetSignedUrlForAttachedMedia`, `agent.v1.AgentService`) and Gemini's
  Files API upload are not served: no `polar/sand/media.py`, no
  `POST /desktop/api/proxy/v1beta/files`. A signed-URL store is a
  separate build (a bucket, presigned PUT/GET, a renewal), and the
  inline path covers a short clip. The brief and the config say so and
  tell the agent to trim or transcode with ffmpeg first. Gemini's own
  inline request limit is about 20 MB, so 15 MB inline is inside it.
- **The Mac does not push the server's `videoModels` into the box.** The
  box reads `SAND_CLAIDOR_VIDEO_MODEL` (default the server's video role,
  `gemini-2.5-flash`) and `SAND_VIDEO_SUBAGENT_SERVED`, forwarded from
  the Mac's environment. If the server has no Gemini key the child's
  first call answers 503 "The model service is not configured." and
  that sentence is the Task's result; the brief still offers the
  subagent. Reading `pricing-catalog.videoModels` on the Mac and
  forwarding it as the env is the next step if that ever bites.
- **Gemini's prices are unconfirmed** (`PROVIDER_TOKEN_WEIGHTS`, the two
  rows in `MODELS`).
- `gemini-2.5-pro` is priced and not offered; `SAND_CLAIDOR_VIDEO_MODEL=gemini-2.5-pro`
  selects it on the box side, and the server serves any Gemini model
  in the catalogue.
- Reasoning effort is logged for the Gemini call but not sent: Gemini's
  `thinkingConfig` is a different knob and was not mapped.

## Not yet run on a Mac

Nothing here has run on a Mac. What would show it working:

- In the box, `docker exec simeon-box tail -f /tmp/sand-host.log`, a
  turn that attaches a short clip and asks what happens in it:
  `[claidor] prompt conversation=subagent-… identity=video:watchVideo`,
  then `[claidor] video model=gemini-2.5-flash parts=1 video/mp4@4fps
  612KB offered=…`, then `[claidor] model=gemini-2.5-flash effort=low
  input=… output=…`.
- On the server, one `desktop.video.generate` line with
  `inline_videos=1`, and a `desktop_usage` row with `provider = 'gemini'`.
- A failure names itself: a 503 (no key), a 402 (the brake), or Google's
  own sentence in `desktop.proxy.upstream_refused` and in the child's
  `[claidor] model-error` line.

Needs the founder: `CLAIDOR_GEMINI_API_KEY` on Render.
