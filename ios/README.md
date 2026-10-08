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
  (`EnsureSandBox`). It POSTs each command to `{gateway}/api/{method}`
  (`listAgents`, `getAgentTranscriptWindow`, `sendPrompt`, `createAgent`,
  `createGroup`, `respondToWidget`, `setAgentUnread`, `updateAgent`,
  `getAgentAutomations`). It reads `{gateway}/events` for live changes:
  the roster, each chat's entries, the steps an agent is on. See
  `Gateway.swift` and `Backend.swift`.
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

`--theme=light` or `--theme=dark` picks the appearance.
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

1. In Xcode, open Signing & Capabilities for the Simeon target. Choose the
   Apple developer team Simeon publishes from, or set `DEVELOPMENT_TEAM`
   in `project.yml`.
2. Plug in the iPhone and Run. The first time, the phone asks you to trust
   the developer (Settings → General → VPN & Device Management).
3. For TestFlight, choose Product → Archive, then Distribute App → App
   Store Connect. It lands in the same app record as the Expo builds,
   because the bundle id is the same. Raise `CURRENT_PROJECT_VERSION` in
   `project.yml` for each upload.

## Not in this version yet

Everything below is in the web window on the phone today and still has to
be built here. Each item names what it needs:

- **Notifications.** The server sends through Expo's push service
  (`server/simeon/desktop/push.py`), which takes Expo tokens. A native app
  has an Apple token, so the server needs a path straight to Apple (APNs),
  plus a push key from the developer account.
- **Attachments.** The composer's + is drawn but not wired; it needs
  `uploadAttachment`.
- **Dictation.** The mic is drawn; the keyboard's own dictation works
  meanwhile.
- **Real calls.** The call screens run on the demo's scripted call. A real
  call needs ElevenLabs on the phone, the server's call token for the
  phone, and microphone permission.
- **The cloud computer's screen** on the agent's page. It is a placeholder;
  it needs the box's screen in a web view.
- **Connect apps.** A connector card shows its state; connecting one needs
  the sign-in sheet flow the web window uses (`desktopMcp`).
- **Brand logos** next to the names in messages. The names are in the
  brands' colours; the logos are not drawn yet.
- **Creating a routine.** The routines tab lists them; making one is still
  done by asking the agent.
