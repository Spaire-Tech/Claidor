# What already exists, and where

> **Superseded as an inventory, 26 September 2026 (ledger F-427).** The
> table below names files under `desktop/src` (`macTasks.ts`,
> `useOnboarding.ts`, the strongs, whisper) that left the tree with the
> 18 September re-founding; a reader sent to them finds nothing. The rule
> the file states still holds and is repeated in `CLAUDE.md` ("X does
> not exist" requires a search, over `desktop/source` and `server/polar`).
> For what is built now, read `docs/product/grok-bot-layers-measured.md`,
> `docs/product/cursor-dependencies-map.md`,
> `docs/product/served-overnight-2026-09-25.md` and the ledger.

**Read this before saying anything does not exist.**

This file is here because of one failure, repeated: I said a thing was not
built, when it was built, tested and working, in this repository. On 18
September I told the founder the onboarding Mac tasks had "genuinely nothing
behind them". They are 178 lines of AppleScript with 107 lines of tests in
`desktop/src/main/onboarding/macTasks.ts`, and the founder had run them many
times. `useOnboarding.ts`, which I had read that same session, says
`window.electron?.onboarding` — a direct pointer to the code I claimed was
absent. I reasoned forward from my own file instead of searching.

So: **"X does not exist" is a claim that requires a search.** Not having seen
something is not evidence of its absence. Grep first, then speak.

Everything below was counted with `wc -l` on 18 September 2026, not recalled.

---

## The rule

Before writing any of these words about this product — *missing, absent, not
built, nothing behind it, a hole, not yet, needs building, does not exist* —
run a search across `desktop/src` and `server/polar`. If the search finds
nothing, say what you searched for. If it finds something, the answer is a port
or a wiring job, not a build.

(Until 18 September this rule also named `rakazo/packages` and `rakazo/apps`.
Those directories do not exist. Searching them silently finds nothing, which is
exactly the failure this file was written to stop.)

**`desktop/` is the product.** This file said twice that it was "frozen, which
means **do not add to it**", and called it a parts bin. That was one of the two
wrong headings the root `CLAUDE.md` now names as having cost days: the founder
came back to the Mac app on 18 September and `desktop/` is the thing being
built. Add to it. The code in it is finished and tested; reach for it first.

---

## What is in `desktop/src`, and it is the product

| What | Where | Lines | State |
|---|---|---|---|
| **Onboarding Mac tasks** — riddle into Notes, flip appearance, Messages marked unavailable. Real AppleScript through `osascript`, handles macOS `-1743` by saying where to turn it on | `main/onboarding/macTasks.ts` | 178 (+107 tests) | Works. Founder-tested. |
| Onboarding IPC channels | `main/ipcHandlers/onboarding/handlers.ts` | 42 | Works |
| **Speech recognition** — local whisper.cpp server | `main/speech/whisperServer.ts` | 263 (+2 test files) | Works |
| Speech IPC channels | `main/ipcHandlers/speech/handlers.ts` | 95 | Works |
| **Ask-input MCP server** — the pattern behind every ask-first card | `main/libs/askInputMcpServer.ts` | 328 | Works |
| **Agent browser through Playwright** | `main/libs/agentBrowserPlaywright.ts` | 186 | Written, never run in this tree |
| **Connections catalogue** — the services, their marks, their reach | `shared/connections/catalog.ts` | 386 | Works |
| **Chief of Staff brief** | `shared/agent/chiefOfStaff.ts` | 44 | Works. (This said "needs the 17 Sept rewrite (item 83)". `review.md` has no item 83 — it ends at 81. The rewrite was for the Rakazo topology, which is gone.) |
| **The 23 strongs** and the roster | `shared/staffing/strongs.ts`, `roster.ts` | — | Works |
| **The 25 faces** | `shared/agent/avatars.ts` | 134 | Works. (The Rakazo port it named is deleted.) |
| **The artifacts prompt** | `main/libs/artifactsPrompt.ts` | 50 | Works |
| **The whole design** | `src/renderer/design/` | 8,334 tsx | The source of truth for every screen |

## Was ported into `rakazo/`, and is now deleted

**Deleted 18 September 2026, and `rakazo/` with it.** None of the rows below are
in the working tree, and neither is the directory that held them. (This section
said "`rakazo/` is the complete fork and nothing else", which was true for part
of one day and is not true now — the whole subtree was removed.) They are in this
branch's history at commit `4118ac0f` — `git show 4118ac0f:<path>` reads any of
them.

| What | Where, at `4118ac0f` |
|---|---|
| The design tokens | `rakazo/apps/caisra/src/tokens.css`, held against `desktop`'s `tokens.ts` by `design.test.ts` |
| Yodo's onboarding script, verbatim, with the founder's 12 tests | `rakazo/packages/core/src/caisra-onboarding.ts` |
| The onboarding screen, clouds and clock | `rakazo/apps/caisra/src/Onboarding.tsx`, `useOnboarding.ts`, `ambientClouds.ts` |
| Message blocks to rows | `rakazo/packages/core/src/caisra-thread.ts` |
| Cards and artifacts (OpenUI) | `rakazo/packages/core/src/caisra-cards.ts` |
| Layout, files, routines, settings, compose | `rakazo/packages/core/src/caisra-*.ts` |
| The live thread reducer | `rakazo/packages/core/src/caisra-live.ts` |
| Every screen | `rakazo/apps/caisra/src/` |

`desktop/src` is untouched and is the place to reach for.

## The server, live right now

`server/polar/` serves the desktop account protocol under `/desktop`: browser
login, tokens, the metered model proxy, memory sync (with a client in the
box since 25 September 2026, `host/extensions/memory-sync/`;
`memory-sync-served.md`), the skill/kit/MCP
catalogues, Pipedream Connect links (mounted; no caller in the app since the 24 September vendor sign-in decision). `render.yaml` is deployed and answers.
See the root `CLAUDE.md` for the detail.

---

## What genuinely is not built

**Rewritten 18 September.** The three entries that stood here were all written
against the Rakazo tree, and two of them described work that only existed
because Caisra had been moved off the Mac app. Both are moot: there is no
`rakazo/apps/desktop` to register channels on, and no `rakazo/apps/caisra/src/live/`
to point at a server. `desktop/` is the shell, and it runs.

What survives the move, searched for and not found in `desktop/src`:

- **Voice output.** The server serves text-to-speech at
  `/api/proxy/v1/audio/speech` (`server/polar/desktop/endpoints.py:1046`).
  `grep -rn "audio/speech" desktop/src` returns nothing. The route is live and
  metered; the app has never called it. A wiring job.

And one thing that is built, which this file previously implied was not:

- **Speech recognition is wired.** `useDictation.ts` → `window.electron.speech`
  → `ipcHandlers/speech/handlers.ts` → `whisperServer.ts`, registered at
  `main.ts:304`. It runs on the Mac and never asks the server. The dead NetEase
  route (`/api/asr/realtime/sessions`) is reached only from the upstream cowork
  voice input, which is a different surface.
