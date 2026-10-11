# Simeon on the Mac, native

**The Mac app.** On 11 October 2026 the founder made it the one people get
("swift is the real deal now … retire the rest"): it took the Electron
app's identity (below, "The switch") and the Electron app in `desktop/` was
retired.

The Mac app in SwiftUI, Apple's own toolkit, which replaced the Electron app in
`desktop/`. It is a copy of the Electron Mac app as merged on `main`: the
same behaviour, the same layout and layout rules, with Apple's own
controls. It is copied one step at a time, each step built on the founder's
Mac and matched against the reference pictures before the next
(`STEPS.md`).

On 10 October 2026 the earlier Swift build, which had taken the iPhone
app's screens, was removed (the founder: "you should have copied EXACTLY …
the mac app"). Nothing here comes from the iPhone app's screens.

## Why

- **The window stops being someone else's.** Today the Mac window is another
  company's compiled renderer, read from their installer on the building
  Mac and patched at package time (`desktop/NOTICE.md`,
  `desktop/scripts/lib/router-renderer-patch.mjs`). A native app needs
  neither that nor `npm run bootstrap`.
- **Apple's design.** Apple's buttons, menus, glass and windows of macOS 26,
  instead of a web page in a frame, in the Electron window's layout.

## How it works

Nothing about the agents runs on the Mac. They run in the person's cloud
computer, and the app talks to it through `SimeonCore`
(`ios/SimeonCore`), the part shared with the iPhone that has no screens:

- sign-in through `/loginDeepControl` in the Mac's browser, polling
  `/auth/poll`, the token pair kept in the Keychain and refreshed at
  `/oauth/token` (`SignIn.swift`, `Tokens.swift`);
- the broker's `EnsureSandBox` for the computer's address, then its
  commands and events (`Gateway.swift`, `LiveBackend`);
- the store: the agents, their chats, the account (`Store.swift`).

Each step checks what it uses of the core against the Electron app's own
code.

## Where the code is

- `mac/project.yml`: XcodeGen makes `SimeonMac.xcodeproj` from it. One macOS
  app, `Simeon`, needing macOS 26.
- `mac/Simeon/`: the app.
  - `SimeonMacApp.swift`: the app, its window, the menus.
  - `MacSession.swift`: signing in, the Keychain, reaching the computer.
  - `SignInScreen.swift`: sign-in, "Continue in your browser", "Setting up
    Simeon's computer".
  - `MainWindow.swift`: the window's two sides and its own keys.
  - `Sidebar.swift`: the agents' sidebar, its rows, its rail and width.
  - `Butterflies.swift`: every agent's butterfly or own picture, and a
    group's.
  - `MacServices.swift`: what the Electron app's main process does around
    the window (step 14): notifications, the Dock's number, telling the
    computer the window is in front, links into the app, the menus' last
    touches, Move to Applications.
  - `MacLocalHands.swift`: the agent's hands on this Mac, serving the
    computer's requests to run commands and read files while Simeon is
    open and signed in (`~/.simeon/local-exec-daemon.log`).
  - `MacLocalPermission.swift`: "Execution on Local Computer" per account,
    and the Allow card over the message field.
  - `MacConnector.swift`: connecting an app, the iPhone's consent in the
    window, then the app's sign-in in Apple's sheet on it (the Apple design
    pass, `STEPS.md`).
  - `WindowChrome.swift`: the window's frame and its zoom.
  - `Look.swift`: the Electron window's colours, light and dark.
  - `Fonts/`: Suravaram, the sign-in wordmark's face (SIL Open Font
    License).
- `ios/SimeonCore`: the shared core, a Swift package. Its Mac-only library,
  `SimeonMacCore`, holds Mac rules with no screen.
- `ios/Simeon/Voice.swift`: the call's voice (ElevenLabs' Swift kit, the
  package `elevenlabs-swift-sdk`), its ring and hang-up, and the Mac's
  `voice-call.log`, compiled into both apps (step 11). The call's banner
  is `CallBannerWindow.swift`; its line in the chat `CallChat.swift`.
- `mac/PARITY.md`: the inventory of what the Electron app does, read from
  its code on 9 October 2026. Its "Mac" column describes the earlier build,
  which is gone.

## The switch (11 October 2026)

- **While it grew,** the Swift app was `com.simeonlabs.simeon.mac` with the
  URL scheme `simeon-mac`, so both apps installed side by side and signed in
  separately. The server's sign-in takes any app scheme as `redirectTarget`
  (`REDIRECT_TARGET` in `server/simeon/desktop/app_sign_in.py`).
- **At the switch** (done 11 October 2026) it took the Electron app's
  identity: bundle id `com.simeonlabs.simeon` and scheme `simeon`
  (`project.yml`, `SimeonConfig.macURLScheme`). Still to do: sign it with
  the same Developer ID team, and have the website's Download button
  (`/desktop/download/mac`) serve its DMG. People move by downloading the
  new app once: every packaged Electron build has its updater switched off
  (`SAND_DISABLE_UPDATES=1`). On a Mac that still has the Electron app,
  delete it, so `simeon://` links open this one.
- **The Keychain item** keeps its name (`com.simeonlabs.simeon.mac`): the
  name is only a label, and keeping it keeps the earlier Swift build's
  sign-in where macOS allows it (otherwise the person signs in once more).
- **Updates** come with Sparkle, set up at the switch (STEPS step 14,
  decision 11): its feed written beside `latest.json` in the release
  bucket, each release signed with a key kept on the founder's Mac.
- **Move to Applications** asks only in a release build whose Info.plist
  has `SimeonAskToMoveToApplications` set to true; it is set since the
  switch, so the move puts this app in the Electron app's place.
- Pins, sidebar sections, onboarding, secrets and the agents live in the
  cloud computer, so they carry over. The person signs in once more.

The switch was planned for when every step of `STEPS.md` had been matched
on the founder's Mac; the founder made it on 11 October 2026.

## Build and run it (a Mac)

One command, from the repository:

```sh
mac/scripts/build.sh
```

It needs Xcode 26 (and installs XcodeGen with Homebrew if it is missing).
The app opens only on macOS 26 or later. If the build fails, its errors are
copied to the clipboard (and kept in `mac/build/errors.txt`): paste them in
the chat.

By hand: `cd mac && xcodegen generate && open SimeonMac.xcodeproj`, then
Run. Without a team in `project.yml` the app is signed to run on this Mac
only, which is enough to try it; after a rebuild the Mac may ask once
whether Simeon may read its Keychain item again: Always Allow.

## What can and cannot be checked here

- `SimeonCore` and `SimeonMacCore` build and their tests run on Linux
  (`cd ios/SimeonCore && swift test`).
- The app's own files can only be parsed off a Mac (`swiftc -parse`), not
  compiled: SwiftUI and AppKit are not on Linux. Each step counts only once
  it has been built and seen on the founder's Mac.
