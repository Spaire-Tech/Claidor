# LobsterAI in this repository

This directory is a vendored copy of LobsterAI (NetEase Youdao, MIT
licence, `LICENSE` in this directory), the desktop app that runs the
OpenClaw agent engine underneath a window. It was added with

    git subtree add --prefix=desktop https://github.com/netease-youdao/LobsterAI.git main --squash

from upstream commit `7592cd03` (version 2026.9.4, bundling OpenClaw
v2026.6.1) on 9 September 2026.

Two lines are changed from upstream, both to point the app at Claidor:

- `src/main/libs/endpoints.ts`: the server base URL is
  `https://api.claidor.com/desktop` (test mode:
  `http://127.0.0.1:8000/desktop`) instead of NetEase's servers. The
  Claidor side is `server/polar/desktop`.
- `src/main/libs/authLocalCallbackServer.ts`: the post-login
  « return to » check accepts claidor.com hosts as well as youdao.com.

Everything else is upstream as is. The update-check, skill-store and
kit-store URLs still point at NetEase and are not wired.

To pull upstream later:

    git subtree pull --prefix=desktop https://github.com/netease-youdao/LobsterAI.git main --squash

It builds on its own (`README.md` here: Install, Developing, Packaging)
with its own `package.json`, and is not part of the `clients/` pnpm
workspace. Its `.github/workflows` do not run from this repository.

Read before relying on its safety claims: on the OpenClaw engine it
writes the engine's command-approval file to "security: full, ask:
off", delete protection is a system-prompt instruction, commands from
chat channels are auto-approved, and sandboxing is off outside
enterprise accounts (`src/main/libs/openclawConfigSync.ts`,
`src/main/libs/agentEngine/openclawApprovalBridge.ts`).
