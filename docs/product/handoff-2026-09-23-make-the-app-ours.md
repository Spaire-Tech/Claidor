# Handoff — make the app ours (23 September 2026)

You are picking up the Simeon desktop app in the `Spaire-Tech/Claidor`
repository, directory `desktop/`. Read `CLAUDE.md` at the root first, then
`docs/product/building-the-app.md` and `docs/product/name-measured.md`.
Do not reason from memory about this tree: grep it, and read the build
output. Every claim in the docs is tied to a file; keep it that way.

## The founder's ask

"Any reason why this app is linked to Grok Bot? The name up left, the app
icon, etc. Can we make a plan to make it ours. When the app is there, I
can't open Grok Bot." Then: "I want to make this ours at last."

Separately, the founder is moving the product from claidor.com to
simeonlabs.com (APIs included). That is **not** this job; they will say
when. Do not change any hostname.

## Why the app is still Grok Bot's

`npm run package` takes Cursor's signed Grok Bot 0.18.0 bundle from the
bootstrap cache, replaces the JavaScript inside it with ours, and edits a
few plist keys (`scripts/package-macos.mjs`). Everything the bundle itself
carries stays theirs:

1. **Executable and helpers.** `CFBundleExecutable` is `Grok Bot`; the four
   helper bundles under `Contents/Frameworks` are `Grok Bot Helper*.app`.
   Electron finds its helpers by the compiled-in product name, then by the
   bundle's `CFBundleName`. Setting `CFBundleName` to Simeon alone killed
   the app at launch (SIGTRAP in `ElectronMain`, crash report `94A9FD31`,
   23 September); the line is reverted with the reason next to it in
   `package-macos.mjs`. So the menu bar, Activity Monitor and crash reports
   say Grok Bot until the executable, the helpers, their inner executables
   and their plists are renamed together, the way electron-packager does
   (`mac.js` in that project is the reference), then re-signed with the
   existing `signAppBundleAdHoc`.
2. **Bundle identifier** `com.anysphere.sand.reconstructed`
   (`scripts/lib/config.mjs`, `reconstructedBundleId`). Target:
   `com.claidor.simeon` or whatever the founder names. macOS Keychain ties
   `safeStorage` secrets to the app identity, so the person signs in once
   more after this change; say so before shipping it.
3. **URL scheme `sand://`**, claimed by both apps
   (`package-macos.mjs`, `CFBundleURLTypes`). macOS gives a scheme to one
   app, so sign-in callbacks can land in the wrong one. A `simeon://` scheme
   has to change in the app and in the server's sign-in redirect
   (`server/polar/desktop/app_sign_in.py`) in the same step.
4. **The local computer** is a Docker container named `grok-bot-local-vm`
   on fixed ports 1337, 1339, 1340, 6080, 6081, 8790
   (`desktop/source/electron-main/box/local-docker-host-connector.ts`),
   the same name Grok Bot's own local mode uses. Rename the container
   (`simeon-box`); leave the ports unless both local boxes must run at
   once. `desktop/tests/local-docker-box.test.mjs` covers the connector.
5. **The data folder** is `~/Library/Application Support/Simeon`, copied
   once from the `Grok Bot` folder on first launch
   (`desktop/source/electron-main/startup/desktop-user-data-bootstrap.ts`,
   `migrateUserDataFromPreviousName`). The copy filter excludes Chromium's
   caches but **not** `SingletonLock`, `SingletonSocket` and
   `SingletonCookie`, the symlinks Chromium uses for its single-instance
   lock. Copied symlinks let the two apps hand a launch to each other's
   running process. This is the leading explanation for "I can't open Grok
   Bot while Simeon is running". It is not yet measured; the founder was
   asked to run:

   ```
   ls -la ~/Library/Application\ Support/Simeon/Singleton* ~/Library/Application\ Support/Grok\ Bot/Singleton*; pgrep -fl "MacOS/Grok Bot$"
   ```

   and to say what happens when Grok Bot is clicked (nothing, a bounce,
   or Simeon coming to the front). Get that answer before changing the
   filter, then exclude the three names from the copy and remove copied
   ones once at startup. Add a test next to the existing bootstrap tests.
6. **The icon** is already the founder's tile (`brand/Simeon.icns`,
   written over every `.icns` the shell carried). If the Dock still shows
   Grok Bot's, it is the LaunchServices cache:
   `touch /Applications/Simeon.app && lsregister -f /Applications/Simeon.app && killall Dock`.

Already ours and not to redo: the user-facing strings (brand pass in
`scripts/lib/router-renderer-patch.mjs`), `productName` Simeon in the staged
`package.json` (`build-asar.mjs`), `CFBundleDisplayName`, the Dock icon
files, `~/.caisra` and the `caisra`/`CAISRA_*` identifiers, which stay.

## Order, and the rule for each step

One step per build. Each gets `npm run check`, then `npm run package` on
the founder's Mac, then a launch, before the next step stacks on it. The
founder runs the builds; you cannot (macOS arm64 only, and the bootstrap
download is blocked from the container).

1. The lock symlinks (after the founder's paste) and the container name,
   one commit.
2. Executable and helper rename. This is the step that can die at launch
   the way the `CFBundleName` change did. If it does, get
   `~/Library/Logs/DiagnosticReports` or run the binary from the terminal
   (`./dist/Simeon.app/Contents/MacOS/<name> 2>&1 | tail -60`) before
   touching code. `scripts/verify.mjs` compares the reconstructed bundle
   against the official one; read it first, it may reject renamed helpers
   and need its own change.
3. Bundle id and `simeon://` scheme together, with the server redirect,
   and tell the founder the sign-in cost.

## Rules the founder has set, and that cost real time when broken

- Do not guess. Read the log or the crash report first. Three confident
  wrong answers in this repository came from reasoning instead of reading.
- "X does not exist" needs a grep before it is written.
- Be careful not to break anything: the smallest change that the evidence
  supports, one thing per commit, and say what was not measured.
- Do not touch the pinned renderer bytes except through
  `scripts/lib/router-renderer-patch.mjs`.
- Do not put anything over the agent marks.
- Work on branch `claude/zen-cerf-w9w3i4` unless told otherwise, and push
  with `git push -u origin <branch>`.

## Open beside this job, not yours unless asked

- The agent sometimes sends two messages for one reply. Measured 23
  September from the box log: every send succeeded, no nudge fired; the
  model re-sends on its next step, and the early-result reminder in
  `desktop/source/host/runner/send-message-reminder-middleware.ts`
  (threshold 0) asks for a message after any tool call. The founder said
  "it's okay for now".
- The first attachment an agent sent crashed the window (`n.filter is not
  a function`); fixed 23 September in
  `desktop/source/host/extensions/session/session-projection.ts`.
