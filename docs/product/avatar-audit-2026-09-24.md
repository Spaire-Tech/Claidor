# Changing an agent's avatar, audited against the reconstruction (24 September 2026, night)

"do the same for when you wanna change an avatar - upload and image
generation none of them work. audit the reconstruction and look at what
we do wrong." Read-only; nothing fixed. Three audits (the Mac side, the
host side, the server), the linchpin re-checked by hand. File:line
references are under `desktop/source/` unless a path says otherwise.

## The two flows, hop by hop

**Upload.** Editor → `window.desktop.pickAvatarFile()` (a file dialog
on the Mac, decode, 25 MB cap, downscale to 1024,
`electron-main/media/avatar-images.ts:17`) → the editor crops and
encodes a PNG → `setAgentAvatarBytes({id, pngBase64})` over the
coordinator to the box's gateway (`host/host-gateway-api.ts:551-557`) →
`agent-lifecycle.ts:566-587` → `session-mutations.ts:9` writes
`avatar.png` in the agent's directory in the box, invalidates the
data-URL cache, and emits `agent-upserted`. Nothing on this path
touches Simeon Labs' server, by design: the server has no upload route
at all (`server/polar/desktop/capabilities.py` serves one multipart
route, audio transcription).

**Generate.** Editor → `window.desktop.generateAgentAvatarImage(text)`
→ `POST /desktop/api/proxy/v1/images/generations` on Simeon Labs'
server with `{prompt, size: "auto", quality: "auto"}` and the account
bearer (`shared/node/cursor-backend/claidor-generate-image.ts:48-56`)
→ `gpt-image-1` (`server/polar/desktop/pricing.py:731`), base64 back
→ the editor crops it and sends it down the **same** upload path. No
avatar prompt template, style or size exists; the person's words go to
the model as they are.

Neither path calls a Cursor `aiserver.v1.*` RPC any more (the old
`RunGenerateImage` went on 19 September), and no feature gate sits on
either.

## What we do wrong

### 1. The roster never carries the image (upload and generate alike)

`buildSummary` (`host/extensions/session/session-summaries.ts:16`)
fills `avatarDataUrl`/`avatarVersion` only when it is handed a
`readAvatar` callback:

```
const avatar = await args.readAvatar?.(agentDir, extras?.legacyAvatarPath ?? null) ?? null
… avatarDataUrl: avatar?.dataUrl ?? null, avatarVersion: avatar?.version ?? null
```

Its two callers, `summarizeOpenSession` and `summarizeSession`
(`host/extensions/session/agent-session.ts:128, 150`), pass
`includeBlank` and `agentHasMemory` and **no `readAvatar`**. Verified:
`grep -rn "readAvatar" source` finds the parameter, the reader
(`host/agents/agent-avatar.ts:53`, `readAvatarWithinDir`, with its
128-entry cache) and one local alias in `session-profile-files.ts`;
no call site passes it. So every roster row, every `agent-upserted`
event, and the reply to a successful upload say `avatarDataUrl: null`.
The file is on disk in the box; the renderer, which reads the image
inline from roster rows, is never shown it. That is "upload does
nothing", and it is why a generated image also vanishes after the
crop.

The reconstruction did wire the readers: the gateway command
`getAgentAvatar` (`host-gateway-api.ts:558` →
`session-profile-files.ts:11`) and the HTTP door `GET /avatars/{id}`
(`host/gateway-server.ts:41-53`, bearer, ETag, nosniff). **Nothing on
the Mac calls either** (grepped `node-agent-coordinator`,
`electron-main`, `electron-preload`, `shared` for `getAgentAvatar` and
`GATEWAY_AVATARS_PATH`: only the host's sharing code uses the first).

`docs/product/reconstruction-gaps-2026-09-24.md` §avatar said the
image is "read back inline as `avatarDataUrl` in every roster summary"
and cited the reader. The reader exists; nothing calls it on the roster
path. That claim was wrong.

### 2. The agent's own avatar change never tells the roster

`UpdateState` with target `avatar` (`runner/tools/sand-state-tool.ts:303`)
→ `extensions/memory/agent-state.ts:60-61` writes `avatar.<ext>` and
calls `deps.onAvatarChanged?.()`. The production composition supplies
`readProfile`/`writeProfile`/`writeSettings` (since 24 September) and
**no `onAvatarChanged`** (`grep onAvatarChanged
host-runner-composition.ts`: none), so no `emitAgentUpdate` follows.
The file watcher (`profile-watch.ts:75-110`) covers the active session's
directory only, and its update would still carry null (point 1).

### 3. Generate can also fail before any of that, and the Mac keeps no record

The server refuses with a sentence the editor shows verbatim as
`edge/handler-failed: …`: "The image service is not configured." (503,
`CLAIDOR_OPENAI_API_KEY` empty on Render), the hourly or monthly budget
(402), "The image service could not be reached." (502), OpenAI's own
refusal passed through (for `gpt-image-1` typically the organisation
verification 403), or "The image service returned no picture." No live
generate has ever been recorded (`docs/product/capabilities-measured.md:58-61`:
server tests run against a stub). **There is no Mac-side log file for
this path**: the failure goes to structured telemetry shipped to the
server, or nowhere. The one readable trace is the server's
`desktop.proxy.upstream_refused` line and the editor's sentence.

### 4. Smaller

- `setAgentAvatarBytes` on the host writes whatever base64 arrives as
  `avatar.png` with no size cap and no MIME sniff
  (`session-mutations.ts:9`); the agent's own path has both
  (`agent-state.ts:16`). The Mac caps at 25 MB before the crop.
- The pinned renderer's bytes are gitignored (`src/app/dist`), so the
  renderer hop (which bridge names the 0.18.0 editor calls) is the
  reconstruction's recovered contract, not a measurement. If the stock
  editor called a name the preload does not expose, the editor's
  adapter goes `bridge-unavailable` silently, which would also read as
  "does nothing". The recovered contract lists exactly the three names
  the preload exposes.

## What the fix is, when asked for

1. Pass `readAvatar` at both `buildSummary` call sites in
   `agent-session.ts`, built from `resolveDerivedAvatarFilename` and
   `readAvatarWithinDir` the way `getAgentAvatar` already does in
   `session-profile-files.ts:11`. One callback; the cache is already
   there. That makes the upload reply and every roster row carry the
   image, for uploaded and generated avatars alike.
2. Supply `onAvatarChanged: () => emitAgentUpdate(session.id)` in the
   composition's agent-state deps, so the agent's own avatar change
   redraws.
3. Optional: apply the agent path's 5 MB cap and MIME sniff to the
   gateway write.

Point 3 (a server-side refusal of generate) is not a code fix; the
editor's sentence after one click says which of the five it is, and
whether `CLAIDOR_OPENAI_API_KEY` is set on Render is the first thing to
check.

## What only a click can settle

- Upload: after the fix, whether the pinned renderer redraws from the
  roster row (`avatarDataUrl`) or asks a door nobody wired. The recovered
  contract says the row.
- Generate: the exact sentence the editor shows today, and the server's
  `upstream_refused` line for that minute.
