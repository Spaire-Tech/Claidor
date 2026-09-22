# What in `desktop/` is Grok Bot's, what is the reconstructor's, and what is ours (22 September 2026)

The founder asked: "is there a way we literally take everything from grok
bot, aside from the server (claidor), and leave whatever we built on the
side completely?" and then: "audit the grok bot repo again thoroughly before
you make all those claims." This is that audit. Every number was measured in
this container against the branch at `85203c2c`; nothing here is recalled.

## The tree is three layers, not two

**Layer 0 — Anysphere's own bytes, 0.18.0.** `npm run bootstrap` unpacks the
pinned DMG into `src/app/dist` (gitignored): the renderer, the Electron shell,
and compiled `main.cjs`, `host-main.cjs`, the coordinator and the preloads.
The `.app` we ship carries only the renderer and the shell from here
(`docs/product/building-the-app.md`). The compiled main and host are in the
payload too (`scripts/host-production-activation.mjs:24`,
`electron-main-production-activation.mjs:41-50` anchor into them by line
number) and are **never shipped**: `prepareProductionActivations`
(`scripts/clean-build.mjs:79-97`) ignites both from `source/` whenever the
binding step does not report `clean`, and with no manifest supplied it never
does. There is no flag that ships the original main and host. An earlier
claim of mine that "the build already has the switch" was wrong: the
`artifact-fallback` row exists (`clean-build.mjs:53,60`) and is overridden
unconditionally.

**Layer 1 — the reconstruction, by one author.** `source/` is 1,743 `.ts`
files of readable TypeScript written from the binary under an evidence rule
(`PROVENANCE.md`); `frontend/` is that author's partial redraw of the UI,
which does not ship. This layer is **not** Grok Bot as Anysphere shipped it.
Its own README at `ce9fc2d8` says so: "reconstructed **and extended**", and
lists what the author added:

- an inference router for Cursor, Claude Code, Codex and OpenRouter
  (`shared/inference-router.ts`, `node-agent-coordinator/inference-router.ts`,
  231 lines at `ce9fc2d8`, `host/extensions/inference/provider-session.ts`);
- Grok Bot plugin/MCP tools across those routed providers;
- local usage tracking for routed inference;
- **an optional local Docker sandbox in place of the remote box**
  (`electron-main/box/local-docker-host-connector.ts`), with "Remote mode
  remains the default";
- the Settings → Router page, patched into the pinned renderer
  (`scripts/lib/router-renderer-patch.mjs`).

So the local Docker computer, the Router page and every non-Cursor provider
are the reconstructor's experiments. Grok Bot 0.18.0 itself has one box, a
remote one, brokered by `GrokBotService.ensureSandBox` on Cursor's backend
(`electron-main/box/box-host-connector.ts:78-98`), and one inference wire,
`InferenceService/Stream`. `docs/product/grok-bot-reconstruction-audit.md`
§1 ("they have a local-Docker mode") attributes the toggle to Grok Bot; the
README attributes it to the author. The README is the primary source.

**Layer 2 — ours, since the re-founding.** Measured with
`git diff ce9fc2d8 HEAD`:

| where | files | lines |
| --- | ---: | ---: |
| `source/` (excluding a comment-only rename in 156 generated protos) | 28 added, 3 deleted, ~127 modified | +4,511 −752 |
| `scripts/` | 17 | +1,313 −43 |
| `tests/` | 8 → 36 test files | +3,754 −89 |
| `frontend/` (does not ship) | 19 added (18 drawn assets), 42 modified | — |
| `brand/` | 5 binaries | — |

At `ce9fc2d8` the word "claidor" appears in **zero** files under `source/`;
now in 34. The whole of our layer in `source/` is about 4,500 lines on a tree
of 1,743 files. `@evidence` anchors cannot separate it from the
reconstruction: `source/` carries none (they live in `frontend/`); the diff
above is the only instrument.

What the 4,500 lines are, largest first:

| piece | lines | what it is |
| --- | ---: | --- |
| `shared/grok-bot-tools.ts`, `host/extensions/transcript/routed-agent-tools.ts`, `shared/grok-bot-box-tools.ts`, `shared/grok-bot-transcript.ts`, the growth of `node-agent-coordinator/inference-router.ts` | ~1,330 | Grok Bot's tools bolted onto the author's Mac-side router. **Off by default** since 22 September (`SAND_CLAIDOR_FULL_AGENT=off` is the only way in). |
| `host/extensions/inference/provider-session.ts` (+241), `shared/inference/*`, `shared/node/cursor-backend/claidor-api.ts`, `claidor-generate-image.ts`, `host/extensions/inference/capability-tools.ts`, `electron-main/account/claidor-transcribe.ts`, `shared/node/web-fetch.ts` | ~750 | **The Claidor seam.** The `claidor` executor on the OpenAI Responses wire, and the four capability doors (image, transcription, web fetch, web search). This is the part that cannot be left aside. |
| `shared/node/composio/*`, `shared/node/vendor-mcp/*`, `shared/node/mcp/mcp-marketplace-view.ts`, `host/host-plugin-gateway.ts` | ~900 | The Plugins overlay fed from Claidor's connector catalogue instead of Cursor's marketplace. |
| `electron-main/vnc/computer-stream-log.ts`, `electron-preload/computer-stream-notice.ts`, `shared/computer-stream.ts`, `electron-preload/preload-vnc.ts` | ~450 | The computer-screen narration added 22 September. Diagnostics only. |
| `node-agent-coordinator/permission-scope-stamp.ts` | 79 | Makes the Allow card show. Fixes a gap present on the stock path too. |
| `electron-main/startup/desktop-user-data-bootstrap.ts`, `account/account-display-name.ts`, `shared/agents/*`, `shared/product-name.ts`, `shared/errors.ts` | ~200 | The name (Simeon), the data-folder move, the agent default name. |
| everything else | ~800 | Small edits: local Docker as the default box, `SAND_BACKEND_URL` into the container, no default host-bundle origin, cloud-service absence tolerated in automations, notification window guard, Cursor strings replaced. |

## What "everything from Grok Bot, except the server" would mean

The shipped 0.18.0 app talks to seven Connect services on Cursor's backend,
binary protobuf over HTTP/2 (`source/packages/proto/generated/aiserver/v1/
*_connect.ts`). Measured at `HEAD`, the callers in `source/` and what they
ask for:

| service | called for |
| --- | --- |
| `InferenceService` | the agent loop (`stream`), post-turn labelling |
| `GrokBotService` | the remote box: `ensureSandBox`, `recreateSandBox`, `forceRecreateSandBox`; access status; notifications; box migration |
| `DashboardService` | `getMe`, `getTeams`, `getSandUsageStatus`, `getCurrentPeriodUsage`, trial status, plugin publish, MCP OAuth, marketplace |
| `AiService` | `availableModels`, transcription, web fetch, image generation, privacy mode, metrics |
| `BackgroundComposerService` | cloud agents, agent-store sync (presigned reads/writes) |
| `AutomationsService` | routines in the cloud, Slack/SCM listener status |
| `AnalyticsService` | telemetry (`submitLogs`), Statsig bootstrap |

Plus, outside Connect: the login trio (`/loginDeepControl`, `/auth/poll`,
`/oauth/token`), the update feed (`api2.cursor.sh/updates`,
`update-feed.ts:8`), the Statsig event proxy (`api3.cursor.sh/tev1/v1`,
`statsig-bootstrap.ts:12`) and the host-bundle S3 origin.

Claidor serves the login trio (`server/polar/desktop/app_sign_in.py`) and an
OpenAI-compatible proxy. It serves **none** of the seven Connect services.
So the literal version of the question — ship layer 0 untouched and point it
at Claidor with the three environment variables — gives an app that signs in
and then can do nothing: no model, no box, no profile. To make *that* app
work, the work moves whole onto the server: Claidor would have to implement
Cursor's protobuf API, starting with `InferenceService/Stream` (1,772 lines
of generated message types) and a cloud box broker. That is route (a) in
`host-wall-measured.md`, and it is larger than everything in layer 2 put
together.

The version we have is the other one: keep layer 0 for what it is good at
(the renderer and the shell), compile the rest from layer 1, and replace
each Cursor call with a Claidor call in layer 2. The seam is about 750
lines. "Leaving ours aside" is not available, because without those lines
the app calls Cursor.

What *can* be left aside, if the founder wants the layer thinner:

- the ~1,330 lines of Mac-side tools on the author's router (already off);
- the ~450 lines of computer-screen narration (diagnostics);
- the Plugins catalogue (~900), if the overlay may stay empty for now.

That would leave the seam, the name, the stamp and the small edits: about
1,800 lines.

## Claims I made earlier, and whether they held

1. "The build already has the switch to ship Grok Bot's original main and
   host." **Wrong.** The row exists; ignition replaces it every time.
2. "The local Docker box is Grok Bot's." **Wrong.** It is the
   reconstructor's addition; stock Grok Bot has a remote box only.
3. "The agent loop still speaks `InferenceService/Stream`" (in `CLAUDE.md`).
   **Stale.** True on 19 September; since `c0128b33` the loop runs on the
   `claidor` executor and `turn-run-shell.ts:182` hard-codes it. The Cursor
   path is dead code that is still in the tree.
4. "`docs/product/start-here.md` is the current map" (in `CLAUDE.md`).
   **Wrong.** It describes the LobsterAI tree and was never rewritten.
5. "`frontend/` is Grok Bot's renderer." **Wrong, and never shipped.** It is
   the author's partial redraw; the `.app` carries the pinned 0.18.0 bytes.
6. "The sign-in mark is inside the pinned renderer and cannot be swapped from
   here." **Held.** It sits in `index-UbX-y3il.js` near offset 130769; the
   bytes are not in this container (DMG is 403 here).
7. "Our layer is small." **Held, now with a number:** ~4,500 lines in
   `source/`, of which ~750 are the seam that cannot go.

## Two things the shipped app may still say to Cursor

Not fixed here, recorded so they are not forgotten:

- **Updates: closed.** `DEFAULT_UPDATE_BASE_URL` is `api2.cursor.sh/updates`,
  but the staged bundle's prelude sets `SAND_DISABLE_UPDATES` to `1`
  (`scripts/lib/build-asar.mjs:18`), and `computeUpdateDisabledReason`
  returns `disabled-by-env` first (`update-gate.ts:2`). A packaged Simeon
  does not poll Cursor's feed. I wrote the opposite in a first draft of this
  bullet from `config.mjs` alone; the prelude is where the switch is.
- **Telemetry and Sentry: closed** by the same prelude (`SAND_DISABLE_SENTRY`,
  `SAND_DISABLE_TELEMETRY`, `build-asar.mjs:19-20`).
- **Statsig.** The experiments bootstrap goes to the configured backend
  (Claidor, which answers 404 and is tolerated); the event proxy constant is
  Cursor's. `sandStatsigNetworkOverride` allows only `/rgstr` URLs through.

## Not run

No Mac, no DMG, no box in this container. Nothing above is a runtime
measurement; it is the tree, the diff and the build scripts, read.
