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
- **Packaging identity.** `CFBundleExecutable` stays `Grok Bot` (the
  executable and the helper bundles are the 0.18 shell, unrenamed).
  `CFBundleName`, which the menu bar shows top left, **also stays
  `Grok Bot`**, and this was measured the hard way on 23 September 2026:
  set to `Simeon` ("rename it to Simeon too"), the packaged app died
  0.2 s after launch, `EXC_BREAKPOINT (SIGTRAP)` in `ElectronMain`, before
  any JavaScript ran (crash report `94A9FD31`, `Grok Bot [54613]`).
  Electron locates its helper bundles as `<name> Helper*.app`, trying the
  compiled-in product name and then the bundle's `CFBundleName`; the
  helpers are the shell's `Grok Bot Helper*.app`, so `Simeon` finds none
  and Electron aborts ("Unable to find helper app"). The line is out
  again. To make the menu bar say Simeon, rename the four helper bundles,
  their executables and plists the way electron-packager does, then
  re-sign. **Done 23 September 2026, later the same day, not yet run on a
  Mac:** `scripts/lib/macos-bundle-rename.mjs` reads the shell's
  `CFBundleExecutable`, renames every `Grok Bot *.app` under
  `Contents/Frameworks` with its inner executable and its
  `CFBundleExecutable`/`CFBundleName`/`CFBundleDisplayName`, then the main
  executable, `CFBundleExecutable` and `CFBundleName`, and refuses to touch
  the main executable if it found no helpers (that is the crash above).
  Bundle identifiers are not this step's. `tests/macos-bundle-rename.test.mjs`
  runs it on a fake shell offline and checks the launch invariant: each
  plist's `CFBundleExecutable` is a file in its own `MacOS` directory, and
  every helper is `<CFBundleName> Helper*.app`. The package verification
  reads the reconstructed executable by its new name; the official
  reference keeps its own.

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

Left as it was, on purpose: `CFBundleExecutable` stays `Grok Bot` (the
executable and helper bundles of the 0.18 shell; `CFBundleName` too, since
changing it crashes the app, see above); the class `sand-grok-bot-mark` and other
internal identifiers; the words "Bot" and "Bots" on their own ("Create new
Bot", "Message Bot", "Search or create Bots", "Give each Bot a job"), which
the founder did not name; and "Caisra" where our own Settings copy says it.

Not run on a Mac: the brand pass and the icon swap run inside `npm run
package`, which only runs there.

## Simeon, the whole way (22 September 2026, later the same day)

The founder: "change all this by agent. And any caisra word become Simeon.
also find attached the Simeon app logo. Also rename everything Caisra -
Simeon." So:

| Surface | Was | Now | How |
|---|---|---|---|
| Every user-facing string of ours (Settings, sign-in, permissions, the Computer chrome, onboarding, updates, the agent's brief, MCP registration, the web-fetch user agent) | Caisra | Simeon | 96 files, `Caisra` → `Simeon`, in `source/` (not generated protos), `frontend/src`, `tests`, `scripts`, `package.json` |
| The bare words in the pinned renderer ("Create new Bot", "Message Bot", "Search or create Bots", "Give each Bot a job", "Hidden Bots", "Reset to the Bot") | Bot, Bots | Agent, Agents | a word pass in the brand patch that only takes the word between quotes, spaces or tag brackets, so a minified identifier spelled `Bot` is never touched; the same words in the reconstruction's copy |
| What Electron calls the app: the application menu, "About …", the window title, and the user-data folder | Grok Bot (the staged package.json's `productName` was never changed, so the app **shared `~/Library/Application Support/Grok Bot` with the real Grok Bot**) | Simeon | `build-asar.mjs` writes `productName = reconstructedName` on every build |
| The user-data folder | `~/Library/Application Support/Grok Bot` | `~/Library/Application Support/Simeon` | the first launch copies the old folder once, caches left behind, the other app's folder untouched (`desktop-user-data-bootstrap.ts` `migrateUserDataFromPreviousName`), so nobody signs in again |
| Finder / Dock name and bundle | Caisra.app | Simeon.app | `config.mjs` |
| The icon | the mark on a paper tile | the founder's icon: the mark in white on a black rounded tile with a sheen | `simeon-logo.mjs` `simeonAppIconSvg`, measured off the supplied 1024 file (tile 56..967, corners ~171, mark 234..790); drawn back and compared: tile IoU 0.988, mark IoU 0.891 |

Kept, on purpose: `CFBundleExecutable` `Grok Bot` (the shell's executable and
helper names, and `CFBundleName` with them, see above); identifiers and paths spelled in lower case (`caisra` in the
npm name, `CAISRA_*` environment variables, `caisra-ignition-activation.mjs`,
`~/.caisra`, `data-caisra-screen-notice`); comments in generated protos; and
this repository's history documents, which say Caisra because they were
written then.

**A correction to an earlier instruction.** `docs/product/computer-stream-measured.md`
and the PR said the stream log was at `~/Library/Application Support/Caisra/`.
It never was: with `productName` still `Grok Bot`, it was under `Grok Bot`.
From this build it is `~/Library/Application Support/Simeon/computer-stream.log`.

**The icon, corrected the same evening.** The founder: "i gave you a new
icon app for simeon, you did not use it. i gave you a logo for it too (both
dark and light) you didnt use it. i still see grok bot's." The drawn icon
was an approximation of the founder's file; the icon is now the file itself,
pixel for pixel (`brand/simeon-app-icon-source.png`, rasterised to every
size for `Simeon.icns` and the in-app icon; the drawing remains only as the
fallback when the file is absent). The two marks are kept as
`brand/simeon-mark-black.png` and `brand/simeon-mark-white.png` for wherever
a logo is next needed; the pinned renderer has no logo slot besides the app
icon. `package-macos.mjs` now touches the bundle and re-registers it with
LaunchServices after writing the icon, because macOS caches an app's icon
by bundle and keeps showing the old one otherwise. If the Dock still shows
Grok Bot's after a rebuild:

```
rm -rf ~/Library/Caches/com.apple.iconservices.store; killall Dock Finder
```

**Why it never changed, measured 23 September 2026.** After the executable
rename the founder reported "menu bar says Simeon now, icon did not
change", and pasted `Contents/Resources`: `Assets.car` and `icon.icns`,
with `CFBundleIconName = icon` in `Info.plist`. That key points macOS at
the compiled asset catalogue, and while it is present the Dock and Finder
draw from `Assets.car` and never read `icon.icns`. So every build since
22 September wrote the tile into a file nothing looked at, and the cache
commands above cleared nothing that mattered. `package-macos.mjs` now
removes `CFBundleIconName` after writing the icon; `verify.mjs` refuses a
bundle that still carries it; `Assets.car` itself is left in place. Not
yet seen on a Mac.

## The executable, measured 23 September 2026

Menu bar top left says Simeon, on the founder's Mac, from a build of
`084f5971` installed over `/Applications/Simeon.app`. The first report of
"literally nothing changed" was measured before believing it: the checkout
was still at the previous commit, `dist/` held no bundle, and the running
process was the morning's install; nothing had been built.

## The identity, 23 September 2026

**Measured on the founder's Mac, the same day, from a build of `c5be3bb8`:
"it launched, sign in worked, simeon came to the front."** So the bundle
identifier, the `simeon://` claim, the sign-in round trip through
Claidor and the return link all work. Whether macOS asked for the privacy
grants again, and what identifiers the helper bundles carry, were not
reported.

"go step 3, com.claidor.simeon is fine." The bundle identifier is
`com.claidor.simeon` (was `com.anysphere.sand.reconstructed`) and the URL
scheme the bundle claims, the app registers with LaunchServices, the parser
accepts and the app sends the server as `redirectTarget` is `simeon` (was
`sand`, which Grok Bot claims too; macOS gives a scheme to one app). One
constant, `SAND_DEEP_LINK_SCHEME` in `source/shared/desktop.ts`, and one in
`scripts/lib/config.mjs`; `tests/app-identity.test.mjs` fails if they part.
The helper bundles keep the identifiers the 0.18 shell gave them; they were
not read and are not this step's.

**The server needed no change, contrary to the handoff.** `app_sign_in.py`
builds `<redirectTarget>://app/v1/open` from whatever token the app sends
and never spelled `sand`; a server test now pins `simeon`. So the build
order is free: the app can ship before or after any deploy.

**The cost.** `safeStorage` secrets (the sign-in tokens in
`sand-secrets.json`, the Settings secrets) are read through the Keychain;
a value that no longer decrypts reads as `null` (`secret-store.ts`), which
is "signed out", never a crash. So after the first build with the new
identifier: one sign-in, and Settings secrets re-entered, at most; and the
privacy grants macOS keys on the bundle identifier (screen recording,
accessibility, automation) asked again. Whether the Keychain actually
refuses is not measured; the ad-hoc signature already changes every build.
Agents, chats, files and the box are not encrypted that way and are
untouched.

**Not measured:** whether the pinned 0.18.0 renderer prints `sand://` links
anywhere a person could click (a grep over `src/app/dist/renderer/assets`
on a bootstrapped Mac decides it; such a link would now open Grok Bot).

## The marks in the shipped screens (23 September 2026, evening)

The founder, on the screens: "can we make it a cloud rather" (the landing
mark next to the name), "make it a cloud" (the onboarding hero), and for
the boot screen's Grok Bot logo the petal mark, "with a slow turn so it
still feels alive", in black and in white.

Located on the pinned chunk `index-UbX-y3il.js`, all package-time in
`scripts/lib/router-renderer-patch.mjs` (`MARK_REPLACEMENTS`,
`patchOriginalMarks`), each anchor exactly once
(`tests/renderer-marks-patch.test.mjs` checks the real chunk when
`GROK_BOT_PINNED_RENDERER` names it):

| Screen | What it was | What it is |
|---|---|---|
| Landing, next to "Simeon" | `sd` 64 px, black, default blob, mood every 1.2 s (`pjn`) | same, `shape:"cloud"` |
| Onboarding hero across the screens (`QBn`) | `shape:"blob"` | `shape:"cloud"`; teammates unchanged |
| Boot screen "Setting up Simeon's computer" (`C0t`, 56 px) | `tOt`: Grok Bot's logo, SMIL morph through 158 paths | twelve petals from `SIMEON_PETALS`, viewBox `80 80 240 240`, fill `MNe(color)` (light-dark), `animateTransform` rotate 14 s, none under reduced motion |
| Hand-off "Waking your computer…" and About | `assets/app-icon-C7NKj2u7.png`, **Grok Bot's icon** (sha `79e6a73e…`); nothing overwrote it | the founder's icon from `frontend/runtime-assets` (sha `70ddf961…`), copied at package time |

Measured here: the patched chunk parses; the petal SVG at 56 px on white
and on `#111` (headless Chromium, 2×) is the founder's mark at the same
size the old logo had. Not yet seen on a Mac.

## The agents' colours (23 September 2026, later still)

"i wanna change the color palettes choices of the bots. completely" —
three reference spheres (a grainy sunset, sage, blue-lavender) — then,
on a sheet of twelve drawn on the cloud and the blob in light and dark,
"im okay with all. replace all existing colors with this."

| id (kept) | palette | top | middle (`--fg`, swatch) | bottom |
|---|---|---|---|---|
| yellow | Dusk | #8b8bea | #f7a1b3 | #ffb98a |
| cyan | Sage | #2f6f72 | #6e9c95 | #b8d1c5 |
| violet | Lagoon | #7cc0e0 | #d7a9dc | #2b4c92 |
| red | Ember | #ff9a76 | #ffd0a0 | #6b3e8f |
| green | Moss | #6f8f4f | #a8c58a | #dfeacb |
| brown | Sand | #f6e2c4 | #f2b48b | #c6754e |
| magenta | Berry | #e07aa8 | #f4b7d0 | #3e2a7a |
| blue | Ocean | #1f3b73 | #3c7fb7 | #7fd4d0 |
| gray | Rose | #f6c1c7 | #f0a4b8 | #8f5c86 |
| black | Slate | #8c9db8 | #5e6d86 | #d9dfe8 |
| orange | Peach | #ffd1a6 | #ffb0a3 | #e56f8f |
| mint (new) | Mint | #bff0e2 | #8fd3c3 | #3c8a86 |

Mechanism, on the pinned chunk (`patchOriginalPalette`, ten anchors each
once): the three colour tables (`G_t` gradients, `snt` flat, `PQ` picker)
are replaced; the picker filter no longer hides black; `K_t`/`Y_t` gain a
middle stop; the `sd` and mirror spans set `--ink-from/mid/to`; the
animator's `<defs>` always hold a three-stop gradient on those variables
and a `feTurbulence` grain filter, and the body path is filled with the
gradient through the filter. The animator's `inkGradient` prop, which
`sd` never passed, is gone with the old two-stop block. Faces, springs,
morphs and mirrors are untouched. Previewed headless with the eyes on,
light and dark; not yet seen on a Mac; the grain filter's frame cost on a
full sidebar is not measured.

