# Simeon on the iPhone, native

The iPhone app in SwiftUI, Apple's own toolkit. It draws the phone design
the founder made on 8 October 2026 on the review link (the list, a chat,
the + menu with New Agent and New Group Chat, the agent's page, search,
Settings and the call) with Apple's own parts. Its bars, sheets, menus,
buttons and the composer get iOS 26's Liquid Glass, and back is the native
swipe.

It replaces the Expo shell in `mobile/`, which shows the web window in a
web view. It is the same app on the App Store (bundle id
`com.simeonlabs.simeon.ios`, URL scheme `simeon-ios`), so a build of this
one replaces that one on TestFlight. `mobile/` stays until this one has
run on a real iPhone.

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
was doing (`[simeon] the screen stood still 1840 ms, while laying out ava,
512 lines`), and any step that took longer than a frame (`[simeon] slow:
…`). Copy those lines into the chat to find a lag. Run (⌘R) builds Debug,
which is slower than TestFlight's optimised build; for a fair feel of speed,
set the scheme's Run to Release (Product → Scheme → Edit Scheme).

1. In Xcode, open Signing & Capabilities for the Simeon target. Choose the
   Apple developer team Simeon publishes from, or set `DEVELOPMENT_TEAM`
   in `project.yml`.
2. Plug in the iPhone and Run. The first time, the phone asks you to trust
   the developer (Settings → General → VPN & Device Management).
3. For TestFlight, choose Product → Archive, then Distribute App → App
   Store Connect. It lands in the same app record as the Expo builds,
   because the bundle id is the same. Raise `CURRENT_PROJECT_VERSION` in
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
- **The computer**: each agent's own screen, live, through noVNC's client
  (bundled in `Simeon/Computer/`, MPL 2.0) on the box's WebSocket.

## What has and has not been checked

- `SimeonCore`'s tests (53) pass on Linux: the chat's rows for every card,
  the call protocol against a fake voice, sign-in and tokens, the
  butterfly's outline and motion checked against the window's own numbers,
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

## Still to do

See `PARITY.md` for every difference from the Mac, item by item, with
what is done and what is left.
