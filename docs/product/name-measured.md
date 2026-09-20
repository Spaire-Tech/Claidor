# The name, measured (19 September 2026)

Phase 5 of the ours brief: nothing a person or the agent can read says
Cursor, Grok Bot, or Anysphere. Internal identifiers stay. This is the
same rule `docs/product/direction.md` §0 already applied to LobsterAI
and OpenClaw.

## What a person or the agent now reads

| Surface | Was | Now |
|---|---|---|
| Settings provider label (`value:"cursor"`) | Cursor | Claidor |
| Settings Claude Code / Codex / secrets / box | Grok Bot | Caisra |
| Sign-in errors and MCP account gate | Cursor | Claidor |
| Recovered General card | Sign In with Cursor | Sign In with Claidor |
| Agent brief, plugin tools, listener cards | user's Cursor account | user's Claidor account |
| Cloud-agent tool copy | Cursor cloud agent / Cursor VM | cloud agent / managed VM |

The `cursor` provider id, `cursor-agent` message type, `CursorProfile`,
`isAnysphereUser`, `AnysphereAgent`, IPC names, and file names did not
move.

## What was left on purpose

- **`@Cursor` in Slack invite advice.** That is the Slack app's handle
  until we have our own. Changing it would send the person to the wrong
  bot.
- **`cursor.com` and `/opt/cursor/artifacts` paths.** Those are real
  addresses the cloud-agent VM still writes.
- **The pinned 0.18.0 renderer.** Onboarding, About, and the Computer
  chrome still say Grok Bot. Those strings live in checksum-pinned
  minified bytes. The only shipped-UI write path is
  `router-renderer-patch.mjs`. Evidence anchors in
  `frontend/src/production/evidence.ts` still name the pinned copy so
  a renderer swap cannot pretend it happened.
- **Packaging identity.** `CFBundleName` / `CFBundleExecutable` stay
  `Grok Bot` because Electron derives the Helper process names from
  them.

## What this test covers, and what it does not

`desktop/tests/product-name.test.mjs` reads Settings, sign-in errors,
and the agent's brief. It fails if Cursor or Grok Bot come back as
copy, and it fails if the internal ids disappear.

Not run on a Mac. The pinned renderer was not rebuilt. A person who
opens About on a packaged build will still see Grok Bot until that
renderer is patched the same way Settings was.
