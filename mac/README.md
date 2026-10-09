# Simeon on the Mac, native

The Mac app in SwiftUI, Apple's own toolkit, replacing the Electron app in
`desktop/`. On 9 October 2026 the founder asked for "the whole electron mac
in swift. literally everything … and more importantly, take apple design
again". This folder holds that app. `PARITY.md` lists everything the Electron
app does, one line each, with where it goes in Swift and whether it is done.

Nothing is built here yet. The first step was the list.

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

- `mac/project.yml`: XcodeGen makes `Simeon.xcodeproj` from it, as for the
  iPhone. One macOS target, `SimeonMac`, needing macOS 26.
- `mac/Simeon/`: what only the Mac has (the window's layout, menus,
  Settings window, menu bar extra, the call window, the agent's hands on
  this Mac, updates).
- Shared with the iPhone: `ios/SimeonCore` as a package, and the iPhone's
  view files (`ios/Simeon/*.swift`) listed by path in the target's sources
  wherever a view fits both. Where they differ, `#if os(macOS)` in the
  shared file, or a Mac file of its own when most of it differs. A view is
  never copied: a copy drifts.
- Tests: Mac logic that can live in `SimeonCore` does, so it is tested on
  Linux with `swift test` like the rest.

## Living beside the Electron app, then replacing it

- **While it grows,** the Swift app is `com.simeonlabs.simeon.mac` with the
  URL scheme `simeon-mac`, so both apps install side by side and sign in
  separately. The server's sign-in takes any app scheme as `redirectTarget`
  (`REDIRECT_TARGET` in `server/simeon/desktop/app_sign_in.py`), so this
  needs no server change.
- **At the switch,** it takes the Electron app's identity: bundle id
  `com.simeonlabs.simeon`, scheme `simeon`, the same Developer ID team. The
  Electron app's last update then installs the Swift app in place: Squirrel
  accepts any build signed with the same identity. After that, updates
  come through Sparkle.
- Pins, sidebar sections, onboarding, secrets, the default model and the
  agents themselves live in the cloud computer, so they carry over. The
  person signs in once more: the Electron app's tokens are under Electron's
  own encryption (`desktop/source/electron-main/secrets/secret-store.ts`).

The switch happens when every line of `PARITY.md` is checked off on the
founder's Mac, not before.

## Build and run it (a Mac)

Not yet: the first slice adds `project.yml` and the commands, as in
`ios/README.md`.

## What can and cannot be checked here

- `SimeonCore` builds and its tests run on Linux (`swift test`).
- The app's own files can only be parsed off a Mac (`swiftc -parse`).
  Every slice is built and run on the founder's Mac before it counts.
