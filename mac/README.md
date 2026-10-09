# Simeon on the Mac, native

The Mac app in SwiftUI, Apple's own toolkit, replacing the Electron app in
`desktop/`. On 9 October 2026 the founder asked for "the whole electron mac
in swift. literally everything … and more importantly, take apple design
again". This folder holds that app. `PARITY.md` lists everything the Electron
app does, one line each, with where it goes in Swift and whether it is done.

Slice 1, the window, is written (9 October 2026). It has not been built yet:
the next step is a build on the founder's Mac (below).

## Why

- **The window stops being someone else's.** Today the Mac window is another
  company's compiled renderer, read from their installer on the building
  Mac and patched at package time (`desktop/NOTICE.md`,
  `desktop/scripts/lib/router-renderer-patch.mjs`). The WebAuthn signer is
  theirs too. A native app needs neither, nor `npm run bootstrap`.
- **One app on two screens.** The iPhone app (`ios/`) already speaks to the
  agents natively. The Mac app shares its core and most of its views, so a
  fix to the chat or to a card lands on both.
- **Apple's design.** The sidebar, toolbar, inspector, menus, Settings window
  and Liquid Glass of macOS 26, instead of a web page in a frame.

## How it works

As on the iPhone, nothing about the agents runs on the Mac. They run in the
person's cloud computer, and the app talks to it through `SimeonCore`
(`ios/SimeonCore`, already built for `.macOS(.v15)`):

- sign-in through `/loginDeepControl`, polling `/auth/poll`, the token pair
  kept in the Keychain and refreshed at `/oauth/token` (`SignIn.swift`,
  `Tokens.swift`);
- the broker's `EnsureSandBox` for the box's address, then commands to
  `{gateway}/api/{method}` and the box's events (`Gateway.swift`,
  `LiveBackend`);
- the store, chat parsing, Markdown, calls, voices, sounds (`Store.swift`,
  `Chat.swift`, `VoiceCall.swift`, `AgentVoices.swift`, `CallTones.swift`).

The Electron app runs a second process between its window and the box
(`desktop/source/node-agent-coordinator/`). The Swift app does not: it talks
to the gateway itself, as the iPhone does. The coordinator's other duties
(the agent's hands on this Mac, connector sign-ins, permission scope) become
parts of the app, each in `PARITY.md`.

What stays where it is:

- **The host** (`desktop/source/host/`, about 72,000 lines of TypeScript).
  It runs in the cloud computer, not on the Mac, and ships as the host
  bundle. Only how the bundle is published changes (`PARITY.md`, "Build and
  release").
- **The web window** at `app.simeonlabs.com/app` (`desktop/web/`) and the
  Expo shell in `mobile/`, which use the pinned window. They are not part
  of this.

## Where the code goes

- `mac/project.yml`: XcodeGen makes `SimeonMac.xcodeproj` from it, as for
  the iPhone. One macOS app, `Simeon`, needing macOS 26 (Apple's design of
  this year, as the iPhone app needs iOS 26).
- `mac/Simeon/`: what only the Mac has. `MacApp.swift` (the app, its
  windows, the menus and keys), `MacWindow.swift` (the window: sidebar,
  pins, rows, their menus, the account), `MacChat.swift` (the chat, its
  toolbar, a message's right-click menu, Jump To), `MacSettings.swift`,
  `MacComputer.swift` (an agent's computer in its own window), and
  `UIKitOnMac.swift` (below).
- Shared with the iPhone: `ios/SimeonCore` as a package, and every view
  file of `ios/Simeon/` built into the Mac app as it is. What only the
  phone has (its list screen, its chat screen, its gestures, its keyboard,
  its sheets for a held message and for the computer) stays behind
  `#if os(iOS)` in those files; where the Mac does it its own way, the
  `#else` beside it says how. On the Mac, the names of UIKit's picture,
  colour and font types stand for AppKit's, and the few UIKit calls the
  shared views make are answered by `mac/Simeon/UIKitOnMac.swift`.
  `ios/Simeon/Platform.swift` holds what differs where the two meet (the
  app's URL scheme, the Keychain item, a sheet's bar buttons). A view is
  never copied: a copy drifts.
- Mac-only logic with no screen (the agent's hands on this Mac and its
  refused paths, the deep-link rules, when to notify, the Dock badge's
  count) goes in a second library of the same package, `SimeonMacCore`,
  so it is tested on Linux with `swift test` like the rest. The iPhone
  does not link it.

## Living beside the Electron app, then replacing it

- **While it grows,** the Swift app is `com.simeonlabs.simeon.mac` with the
  URL scheme `simeon-mac`, so both apps install side by side and sign in
  separately. The server's sign-in takes any app scheme as `redirectTarget`
  (`REDIRECT_TARGET` in `server/simeon/desktop/app_sign_in.py`), so this
  needs no server change.
- **At the switch,** it takes the Electron app's identity: bundle id
  `com.simeonlabs.simeon`, scheme `simeon`, the same Developer ID team, and
  the website's Download button (`/desktop/download/mac`) serves its DMG.
  The Electron app cannot update itself into it: every packaged Electron
  build switches its updater off (`SAND_DISABLE_UPDATES=1`,
  `desktop/scripts/lib/build-asar.mjs`). So people move by downloading
  the new app once. From then on the Swift app updates itself through
  Sparkle.
- Pins, sidebar sections, onboarding, secrets, the default model and the
  agents themselves live in the cloud computer, so they carry over. The
  person signs in once more: the Electron app's tokens are under Electron's
  own encryption (`desktop/source/electron-main/secrets/secret-store.ts`).

The switch happens when every line of `PARITY.md` is checked off on the
founder's Mac, not before.

## Build and run it (a Mac)

One command, from the repository:

```sh
mac/scripts/build.sh            # make the project, build, open the app
mac/scripts/build.sh --demo     # open it on the demo's agents, no sign-in
```

It needs Xcode 26 (and installs XcodeGen with Homebrew if it is missing).
The app opens only on macOS 26 or later; on an older macOS it still builds,
and says so. If the build fails, its errors are copied to the clipboard
(and kept in `mac/build/errors.txt`): paste them in the chat.

By hand: `cd mac && xcodegen generate && open SimeonMac.xcodeproj`, then
Run. Signing: without a team in `project.yml` the app is signed to run on
this Mac only, which is enough to try it.

What slice 1 has: the sign-in (the iPhone's screen), a new account's first
run, the window with the agents in the sidebar (pins, rows, their status,
the right-click menu, search, Hidden Agents, the account), the chat with
every row and card the iPhone draws, the composer (Return sends, + opens
the file chooser), the toolbar (the agent, Call, its computer, its page),
Jump To (⌘K), New Agent (⌘N) and New Group Chat (⇧⌘N), the agent's page
as a sheet, an agent's computer in its own window, Connect Apps (⇧⌘M) in
its own window, Settings (⌘,), and the Agent menu with the Electron
window's keys. `PARITY.md` marks each line it covers ("written").

## What can and cannot be checked here

- `SimeonCore` and `SimeonMacCore` build and their tests run on Linux
  (`cd ios/SimeonCore && swift test`): the links the app opens and the
  sidebar's order for ⌘1 to ⌘9 and ⌥↑ ⌥↓ among them.
- The app's own files, the Mac's and the shared iPhone ones, can only be
  parsed off a Mac (`swiftc -parse`), not compiled: SwiftUI and AppKit are
  not here. Every slice is built and run on the founder's Mac before it
  counts, and the iPhone app is built again with it, since its files
  changed too.
