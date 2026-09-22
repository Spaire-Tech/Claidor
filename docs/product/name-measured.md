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

## Simeon (22 September 2026)

The founder: "replace all 'Grok Bot' by 'Simeon' everywhere in the app.
Replace all new names 'New Bot' by 'New Agent'. replace grok bot logos by
this." (a 400×400 mark: twelve petals in a whirl, black on transparent).

| Surface | Was | Now | How |
|---|---|---|---|
| Pinned 0.18.0 renderer: onboarding ("Meet Grok Bot"), sign-in, About, "Grok Bot's Computer", "Grok Bot settings", page title | Grok Bot | Simeon | `router-renderer-patch.mjs` brand pass over every renderer chunk, stylesheet and `index.html`, after the Settings patch; counts recorded in `dist/renderer-router-extension.json`; the build refuses a renderer that never said Grok Bot |
| Pinned renderer: the default agent name, "New Bot" shortcut label, onboarding placeholder | New Bot | New Agent | same pass |
| Host: the name a new agent gets (`SAND_DEFAULT_AGENT_NAME`) | New Bot | New Agent | `source/shared/agents/agents.ts`; "New Bot" stays recognised as a default so renaming still works on old agents |
| In-app icon (onboarding, About) | a sand tile with a C | Simeon's mark on a paper tile | `scripts/lib/simeon-logo.mjs` draws it from twelve measured ellipses; `make-runtime-assets.mjs app-icon` rasterises it and rewrites the manifest hash `verify.mjs` checks |
| Dock and Finder icon | Grok Bot's, inherited from the 0.18.0 shell | Simeon's mark | `scripts/make-app-icon.mjs` → `brand/Simeon.icns` (packed in Node, no iconutil); `package-macos.mjs` writes it over every `.icns` in `Contents/Resources` |
| Auth callback URL name in Info.plist | Grok Bot reconstructed auth callback | Simeon auth callback | `package-macos.mjs` |

The mark is not a picture file in the app: the twelve petals were measured
off the founder's PNG as moment ellipses and are drawn from those numbers.
`tests/simeon-logo.test.mjs` rasterises the drawing and measures it against
the PNG: intersection over union 0.947.

Left as it was, on purpose: `CFBundleName` / `CFBundleExecutable` stay
`Grok Bot` (Electron derives the helper process names from them; the
display name is the fork's); the class `sand-grok-bot-mark` and other
internal identifiers; the words "Bot" and "Bots" on their own ("Create new
Bot", "Message Bot", "Search or create Bots", "Give each Bot a job"), which
the founder did not name; and "Caisra" where our own Settings copy says it.

Not run on a Mac: the brand pass and the icon swap run inside `npm run
package`, which only runs there.
