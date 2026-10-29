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
  instead of a web page in a frame, in the Electron window's layout. The
  app opens on macOS 15 and later: on 15 the glass surfaces use the
  system's plainer material (`Simeon/Glass.swift`, 12 October 2026).

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
  app, `Simeon`, for macOS 15 and later, built with Xcode 26.
- `mac/Simeon/`: the app.
  - `SimeonMacApp.swift`: the app, its window, the menus.
  - `MacSession.swift`: signing in, the Keychain, reaching the computer.
  - `SignInScreen.swift`: sign-in, "Continue in your browser", "Setting up
    Simeon's computer".
  - `MainWindow.swift`: the window's two sides and its own keys.
  - `Sidebar.swift`: the agents' sidebar, its rows, its rail and width.
  - `Pictures.swift`: every agent's picture (a face from SimeonCore's
    catalogue, or its own), and a group's members together.
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
  - `Localizable.xcstrings`, `InfoPlist.xcstrings`: the app's words in
    French (and each later language), English being the code's own; the
    Language picker in Settings › General chooses (`docs/localization.md`).
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
  (`project.yml`, `SimeonConfig.macURLScheme`). It is released with
  `scripts/release.sh` (below, "Releasing"), signed with the company's
  Developer ID, and the website's Download button
  (`/desktop/download/mac`) serves its disk image once it is published.
  People move by downloading the new app once: every packaged Electron
  build has its updater switched off (`SAND_DISABLE_UPDATES=1`). On a Mac
  that still has the Electron app, delete it, so `simeon://` links open
  this one.
- **The Keychain item** keeps its name (`com.simeonlabs.simeon.mac`): the
  name is only a label, and keeping it keeps the earlier Swift build's
  sign-in where macOS allows it (otherwise the person signs in once more).
- **Updates** come with Sparkle (`Simeon/Updates.swift`, 12 October
  2026; STEPS step 14, decision 11): its feed written beside `latest.json`
  in the release bucket and served at
  `api.simeonlabs.com/desktop/download/mac/appcast.xml`, each release
  signed with a key kept in the release Mac's Keychain. Simeon › Check for
  Updates… is in released builds only; a Debug build never updates itself.
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
The app opens on macOS 15 or later (Liquid Glass on 26). If the build fails, its errors are
copied to the clipboard (and kept in `mac/build/errors.txt`): paste them in
the chat.

By hand: `cd mac && xcodegen generate && open SimeonMac.xcodeproj`, then
Run. Without a team in `project.yml` the app is signed to run on this Mac
only, which is enough to try it; after a rebuild the Mac may ask once
whether Simeon may read its Keychain item again: Always Allow.

## Releasing (a Mac)

```sh
mac/scripts/release.sh            # build, sign, notarize: mac/build/release/<version>/
mac/scripts/release.sh --publish  # the same, then on the website
```

It makes the Release build for Apple silicon with `MARKETING_VERSION` from
`project.yml` and the commit count as the build number, exports it for
Developer ID, has Apple notarize the app and the disk image and staples
both, writes the update zip, Sparkle's feed (`appcast.xml`) and the record
(`release.json`), and with `--publish` uploads them to
`s3://simeonlabs-files-public/releases/darwin-arm64/<version>/`, then
points `appcast.xml` and `latest.json` at them. The server reads only
`latest.json` (`server/simeon/desktop/releases.py`), so the Download
button serves the new disk image within five minutes, and installed apps
find the update on their next daily check. It refuses uncommitted changes
and a version already published (raise `MARKETING_VERSION` and commit;
`--replace` publishes the same version again). Translation catalogs that a
build rewrote (Xcode writes the code's strings into them on every build)
are not counted: their changes are kept in `mac/build/release/` and the
files put back as committed, before the build and after it.

The disk image's window (29 October 2026) is `scripts/dmg.sh`: Simeon and
an Applications link among six clay faces, each with its cursor
(`dmg/background.png` and `@2x`, drawn by `dmg/background.cjs`), laid out
by Finder. To see it without a release, after `scripts/build.sh`:
`mac/scripts/dmg.sh` makes `mac/build/Simeon.dmg` from the Debug app and
opens it.

Once per release Mac:

1. Xcode › Settings › Accounts: the team `496QXRMJXG`, and in Manage
   Certificates a "Developer ID Application" certificate.
2. An App Store Connect API key (Users and Access › Integrations › App
   Store Connect API, role Developer), stored for notarizing:
   `xcrun notarytool store-credentials simeon-notary --key AuthKey_….p8
   --key-id … --issuer …`.
3. For `--publish`, the `aws` command line signed in to an account that
   may write to the bucket (`brew install awscli`, `aws configure`).
4. Terminal allowed to control Finder, which lays out the disk image's
   window: macOS asks the first time (System Settings › Privacy &
   Security › Automation).
5. Sparkle's key is made in the Keychain by the first run, which also
   writes a copy to the Desktop: keep it in the password manager and
   delete the file. A later release from another Mac needs it imported
   (`generate_keys -f <file>`), or installed apps refuse the update.

Try the disk image from the first run on a clean Mac (or another user
account) before `--publish`: open it, drag Simeon to Applications, open
it, sign in, finish the first run.

## What can and cannot be checked here

- `SimeonCore` and `SimeonMacCore` build and their tests run on Linux
  (`cd ios/SimeonCore && swift test`).
- The app's own files can only be parsed off a Mac (`swiftc -parse`), not
  compiled: SwiftUI and AppKit are not on Linux. Each step counts only once
  it has been built and seen on the founder's Mac.
