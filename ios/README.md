# Simeon on the iPhone, native

The iPhone app in SwiftUI, Apple's own toolkit. It draws the phone design
the founder made on 8 October 2026 on the review link (the list, a chat,
the + menu with New Agent and New Group Chat, the agent's page, search,
Settings and the call) with Apple's own parts. Its bars, sheets, menus,
buttons and the composer get iOS 26's Liquid Glass, and back is the native
swipe.

Its views are built into the native Mac app too (`mac/README.md`): what
only the phone has stays behind `#if os(iOS)`, so a change here is built
for both apps (`ios/scripts/mac.sh` and `mac/scripts/build.sh`).

It replaced the Expo shell that was in `mobile/` (it showed the web window
in a web view; retired and removed on 11 October 2026). It is the same app
on the App Store (bundle id `com.simeonlabs.simeon.ios`, URL scheme
`simeon-ios`), so a build of this one replaces that one on TestFlight.

## How it works

Nothing about the agents runs on the phone. They run in the person's cloud
computer, and the app asks it and listens to it the way the web window does
(`desktop/web/gateway.ts`):

- **Signing in.** This is the Mac's sign-in, byte for byte. The system's
  sign-in sheet opens `/loginDeepControl`, and the app polls `/auth/poll`
  meanwhile. The pair is kept in the Keychain and refreshed at
  `/oauth/token` with five minutes left. The app is the only party that
  refreshes it. See `SimeonCore/Sources/SimeonCore/SignIn.swift` and
  `Tokens.swift`.
- **The cloud computer.** The app asks the broker where the box is
  (`EnsureSandBox`). It POSTs each command to `{gateway}/api/{method}`,
  the same commands the web window sends (`listAgents`,
  `getAgentTranscriptWindow`, `sendPrompt`, `respondToWidget`, `sendDraft`,
  `uploadAttachment`, `desktopMcp`, `getHostSettings`,
  `createAgentAutomation`, `ensureForeverBox`, `voiceCall` and the rest).
  It reads `{gateway}/events` for live changes: the roster, each chat's
  entries, the steps an agent is on. See `Gateway.swift`, `Backend.swift`
  and `Store.swift`.
- **The chats.** The host sends finished entries ("add", "update",
  "remove"). The app keeps them by id and draws them. It folds them the
  window's way: a time stamp after 15 minutes, "N messages with …" for
  agents talking to each other, and a call as one "Voice chat" line. See
  `Chat.swift`.

`SimeonCore/` holds all of that, with no UIKit or SwiftUI, and has its own
tests. `Simeon/` is the screens.

## The demo

`--demo` (or `SIMEON_DEMO=1`) runs the app on the review link's agents,
word for word (`desktop/demo/scenario.ts`): Simeon, Theo, Iris, Scout and
the Launch squad. It also runs the scripted call. No account is needed.
`--screen=` opens one screen, which is what the screenshots use:

| `--screen=` | Opens |
|---|---|
| `chat:theo` | Theo's chat |
| `chat:launch-squad` | The group |
| `call:theo`, `call-full:theo` | A call with Theo, the pill or the full screen |
| `agent:simeon` | Simeon's page |
| `new-agent`, `new-group`, `search`, `settings` | That sheet |

`--theme=light` or `--theme=dark` picks the appearance. `--gallery` adds a
"Cards" chat holding every card the Mac draws (questions, drafts, flights,
connectors, approvals, secrets, files), for checking them side by side; it
is never shown on a real account.
`--onboarding` runs the demo as a new account: no agents, so the first run
plays (the name, Face ID where the phone has it, notifications) and ends in
Simeon's chat.
`--api=http://127.0.0.1:8000` points the app at another server.

## Build and run it (a Mac)

One command does it all: it makes the project, builds the app for the
iPhone Simulator, photographs every screen on the demo (light and dark,
into `ios/screens`), and leaves the app open in the Simulator. If the build
fails it copies the errors to the clipboard.

```sh
ios/scripts/mac.sh
```

It needs Xcode 26 or later (from the App Store, opened once). It installs
XcodeGen with Homebrew if it is missing, and downloads the iPhone
Simulator if Xcode has none.

By hand:

```sh
cd ios
xcodegen generate          # makes Simeon.xcodeproj from project.yml
open Simeon.xcodeproj      # then Run (⌘R) on an iPhone simulator
```

To see the demo, edit the scheme (Product → Scheme → Edit Scheme → Run →
Arguments) and add `--demo`.

The core's tests run anywhere Swift does, Linux included:

```sh
cd ios/SimeonCore && swift test
```

On GitHub, the "iPhone app (native)" workflow (by hand, Actions → Run
workflow) builds the app for the Simulator, runs the tests and photographs
every screen, light and dark. The screenshots are the run's artifact.
macOS minutes cost ten times Linux ones, so it never runs by itself.

## To a real iPhone and TestFlight

While the app runs from Xcode, its console shows a line whenever the
screen stands still for more than a quarter of a second, with what the app
had last begun and how long before the freeze (`[simeon] the screen stood
still 1840 ms, while laying out ava, 512 lines (begun 3 ms before the screen
stopped)`: a step begun seconds before is not what froze), then where the
main thread was a quarter of a second in, one line per call (the system's
names; the app's own code shows as `Simeon 0x…`), and any step that took
longer than a frame (`[simeon] slow: …`). A freeze that lasts two seconds also writes where the main thread is
stuck, read from its own stack (`[simeon] the main thread is in:` and one
line per call), again at ten seconds, and what of the app's own kept
happening meanwhile (`[simeon]   48210 × ChatMessages drawn`): a loop is the
count that climbs. Copy those lines into the chat to find a lag. Run (⌘R) builds Release, optimised as
TestFlight's build is, so what you feel from Xcode is what people get (Debug's
unoptimised Swift was several times slower). Push notifications still go
through Apple's sandbox for such a build: the app reads that from its signing
profile, not from the configuration.

1. Signing uses the company's Apple developer team, `496QXRMJXG`
   (`DEVELOPMENT_TEAM` in `project.yml`, set 12 October 2026; the Mac
   app's `project.yml` has the same). Sign in to that team in Xcode
   (Settings › Accounts) once.
2. Plug in the iPhone and Run. The first time, the phone asks you to trust
   the developer (Settings → General → VPN & Device Management).
3. For TestFlight, choose Product → Archive, then Distribute App → App
   Store Connect. It lands in the app record "Simeon by SimeonLabs"
   (Apple ID 6821751771, bundle id `com.simeonlabs.simeon.ios`, made 12
   October 2026; build 1 was refused at processing for a missing camera
   description, so build 2 is its first). Raise `CURRENT_PROJECT_VERSION` in
   `project.yml` for each upload.

## Calls, notifications and the computer

- **Calls** use ElevenLabs' own iPhone kit (`elevenlabs-swift-sdk` 3.4.0,
  added by `project.yml`; Xcode fetches it on the first build). The call
  token comes from Simeon Labs' server (`/desktop/api/proxy/v1/voice/calls`),
  which answers 503 while calls are switched off and 402 without credit.
  The call speaks the Mac's protocol to the agent (`voiceCall`), written in
  `SimeonCore/VoiceCall.swift`.
- **Notifications** go straight from Simeon Labs' server to Apple. The app
  asks once after sign-in and registers its Apple token at
  `/desktop/push-devices`. The server needs an APNs key on Render:
  `SIMEON_APNS_KEY_ID`, `SIMEON_APNS_TEAM_ID` and `SIMEON_APNS_KEY` (the
  `.p8` file's contents), from the Apple developer account (Certificates,
  Identifiers & Profiles → Keys → Apple Push Notifications service).
  Without them the server logs `desktop.push.apns_not_configured` and
  sends nothing to this app. The app's Push capability comes from
  `Simeon/Simeon.entitlements`; signing with a personal (free) team
  refuses it, so sign with the paid team Simeon publishes from.
  Since 12 October 2026 (build 5) each push shows as a message from the
  agent who sent it, its picture beside it and the app's icon small in the
  corner: the `SimeonNotifications` extension (Apple's communication
  notifications, `SimeonNotifications/NotificationService.swift`) reads the
  picture the app saved for that agent in the App Group
  `group.com.simeonlabs.simeon` (`PictureShelf.swift`, written by
  `NotificationPictures` in `Notifications.swift`). The app's entitlements
  carry the Communication Notifications capability and the App Group, the
  extension's the App Group (`com.simeonlabs.simeon.ios.notifications`).
  Xcode's automatic signing registers both the first time it archives; if
  it says the profile lacks an entitlement, press Try Again under Signing
  & Capabilities. A push for the chat on screen is not shown, and opening
  a chat clears its notifications.
- **The computer**: each agent's own screen, live, through noVNC's client
  (bundled in `Simeon/Computer/`, MPL 2.0) on the box's WebSocket.
- **Connectors** (14 October 2026, the founder's reference: ChatGPT's
  Plugins): Apple's bar with the title's menu (Available or Yours) and the
  filter, each category's name with › over its first four apps (the name
  opens all of them), + on each row, the search floating at the bottom
  (`Settings.swift` `ConnectAppsSheet`, `ConnectorsList.swift`). Every
  connector shows its own app icon (`Assets.xcassets/AppIcons`): 74 from the
  apps' own App Store listings, 12 with no iOS app drawn from their marks in
  `desktop/brand/connector-logos`. `python3 ios/scripts/app_icons.py` builds
  the icons and `GeneratedAppIcons.swift` from the catalogue, and fails when
  a connector has none; `… fetch` takes them again (where each came from:
  `desktop/brand/app-icons/sources.json`). `ConnectorIcons` finds an icon by
  any of an app's names ("monday.com", "Facebook Pages", "Excel").
- **App names in messages** (`Mentions.find`, `GeneratedBrands.swift`): the
  Mac window's 75 spellings, and since 14 October 2026 the 36 connectors added
  after it plus "Facebook Pages" and "TikTok Ads"
  (`ios/scripts/connector-mentions.json`, iPhone and Mac only), each in its
  colour with its logo. A name that is also an everyday word (Link, Kit,
  Square, Ramp, Capsule, Mercury, Apollo, Gong) is not marked as a sentence's
  first word ("Link your account"). `node ios/scripts/make-assets.mjs` draws
  the logos into `Assets.xcassets/Brands`, copies them to the Mac's, and
  writes the Swift list (`CHROMIUM=` the Chromium binary when it is not at
  `/opt/pw-browsers/chromium`).
- **Sign-in and the first run** (12 October 2026): Apple's own sheet and
  Google's own page (`AppleSignIn`, `GoogleSignIn`), each answered with the
  pair by the server, no web page between; then the free month is asked for
  with the phone's DeviceCheck token (`FreeMonthAsk.swift`,
  docs/services-billing.md section 10); then three screens, one question
  each: the name ("What should we call you?"), Face ID (the lock,
  `AppLock.swift`), notifications with their switch (on, Continue brings
  Apple's prompt; off, Settings' Notifications is off). Simeon is made out of sight meanwhile; his chat opens at the end.
  Google needs `SIMEON_GOOGLE_IOS_CLIENT_ID` on the server (an OAuth client
  of type iOS); until then the app uses the web sign-in.
- **Plans** are bought in the app with Apple's in-app purchase (StoreKit 2,
  `Simeon/Purchases.swift`, `Simeon/PlansSheet.swift`): monthly, no free
  week (the free month is the trial); the server checks Apple's signature
  and starts the plan. When the credits are spent or the free month is
  over, the composer's banner and the cover lead to the same sheet
  (`PhoneUpgrade`). The products, the server
  notifications URL and `SIMEON_APPLE_APP_ID` are set up once in App Store
  Connect and on Render: `docs/services-billing.md`, section 9. To try it,
  sign in on the phone with a sandbox Apple account (Settings › App Store ›
  Sandbox Account) and buy from a TestFlight or Xcode build.

## What has and has not been checked

- `SimeonCore`'s tests (344 on 12 October 2026) pass on Linux: the chat's rows for every card,
  the call protocol against a fake voice, sign-in and tokens, the agents'
  faces (the catalogue's bytes and versions, the choice by gender, least
  used, the same on every device, Shuffle and Reset; `AgentFaceTests`),
  the list's menu commands and shared pins, sending with Resend, older
  pages, and a streamed answer redrawing only its row.
- The server's push tests pass, with Apple's endpoint mocked.
- The computer view was run against a real VNC server in Chromium.
- The app built on the founder's Mac on 8 October 2026. Changes since then
  parse and were read through against the iOS 26 SDK; the next build on
  the Mac is their check, and `ios/scripts/mac.sh` copies any errors to
  the clipboard.
- Nothing has run on an iPhone yet: calls, notifications (they also need
  the APNs key above), dictation and the photo picker need a real device.
- In-app purchase has not been compiled or run: StoreKit is not on Linux.
  Its shared parts (`ApplePlans`, `PlansCopy`, the quota's `billedBy`) and
  the server's signature checks have tests.

## Still to do

See `PARITY.md` for every difference from the Mac, item by item, with
what is done and what is left.
