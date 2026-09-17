# What already exists, and where

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
run a search across `desktop/src`, `server/polar`, `rakazo/packages` and
`rakazo/apps`. If the search finds nothing, say what you searched for. If it
finds something, the answer is a port or a wiring job, not a build.

`desktop/` is frozen, which means **do not add to it**. It does not mean the
code in it is gone. It is the opposite: it is a finished, tested parts bin.

---

## The parts bin: `desktop/src`, frozen but portable

| What | Where | Lines | State |
|---|---|---|---|
| **Onboarding Mac tasks** — riddle into Notes, flip appearance, Messages marked unavailable. Real AppleScript through `osascript`, handles macOS `-1743` by saying where to turn it on | `main/onboarding/macTasks.ts` | 178 (+107 tests) | Works. Founder-tested. |
| Onboarding IPC channels | `main/ipcHandlers/onboarding/handlers.ts` | 42 | Works |
| **Speech recognition** — local whisper.cpp server | `main/speech/whisperServer.ts` | 263 (+2 test files) | Works |
| Speech IPC channels | `main/ipcHandlers/speech/handlers.ts` | 95 | Works |
| **Ask-input MCP server** — the pattern behind every ask-first card | `main/libs/askInputMcpServer.ts` | 328 | Works |
| **Agent browser through Playwright** | `main/libs/agentBrowserPlaywright.ts` | 186 | Written, never run in this tree |
| **Connections catalogue** — the services, their marks, their reach | `shared/connections/catalog.ts` | 386 | Works |
| **Chief of Staff brief** | `shared/agent/chiefOfStaff.ts` | 44 | Works; needs the 17 Sept rewrite (item 83) |
| **The 23 strongs** and the roster | `shared/staffing/strongs.ts`, `roster.ts` | — | Works |
| **The 25 faces** | `shared/agent/avatars.ts` | 134 | Ported to `rakazo/apps/caisra/src/Blob.tsx` |
| **The artifacts prompt** | `main/libs/artifactsPrompt.ts` | 50 | Works |
| **The whole design** | `src/renderer/design/` | 8,334 tsx | The source of truth for every screen |

## Was ported into `rakazo/`, and is now archived

**Archived 18 September 2026.** None of the rows below are in the working tree.
`rakazo/` is the complete fork and nothing else. They are in this branch's
history at commit `4118ac0f` — `git show 4118ac0f:<path>` reads any of them.

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

The parts bin above it is untouched: `desktop/src` is still there, still
frozen, still the place to reach for.

## The server, live right now

`server/polar/` serves the desktop account protocol under `/desktop`: browser
login, tokens, the metered model proxy, memory sync, the skill/kit/MCP
catalogues, Pipedream Connect links. `render.yaml` is deployed and answers.
See the root `CLAUDE.md` for the detail.

---

## What genuinely is not built

Stated only because each was searched for and not found:

Written 18 September, before the archive. All three are now moot in the same
way: there is no Caisra app in the tree to build them into.

- **A Caisra desktop shell.** `rakazo/apps/desktop` is the fork's Electron app
  and has `main.ts`, `ipcMain` and a preload, but nothing of ours is registered
  on it. This was the one thing standing between the onboarding Mac tasks and
  working again: move the three files in, register the channels, pass the
  bridge. A port, not a build.
- **Caisra's screens on live data.** At `4118ac0f`,
  `rakazo/apps/caisra/src/live/` existed and was typed against their contract;
  `main.tsx` still rendered fixtures. Nothing ever ran against a live server.
- **Voice output in Caisra.** The server serves text-to-speech at
  `/api/proxy/v1/audio/speech`; nothing of ours ever called it.
