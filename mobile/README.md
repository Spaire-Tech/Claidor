# Simeon on the iPhone

The iPhone app is the Simeon window you already have on the web
(app.simeonlabs.com/app) inside a small native app. The app adds what a
browser tab can't do: signing in with the iPhone's own sign-in sheet,
keeping you signed in (in the Keychain), notifications when an agent has
finished or needs you, and opening that agent when you tap one.

iPhone only, portrait only, for now. Bundle id `com.simeonlabs.simeon.ios`,
URL scheme `simeon-ios` (the Mac app owns `simeon`).

## What you need, once

- A Mac with Xcode (from the App Store; open it once so it installs its
  extra parts) and Node 22 or later (`node --version`).
- The Apple Developer account Simeon will be published from.
- An Expo account (free): https://expo.dev/signup. Expo's servers (EAS)
  build the app, sign it, and send it to App Store Connect, so you never
  need to touch signing in Xcode.

## Install

```sh
cd mobile
npm install
```

## Run it in the iPhone Simulator

Against Simeon Labs' real server (you sign in with your own account):

```sh
cd mobile
npx expo run:ios
```

The first run builds the native app (a few minutes) and opens the
Simulator. After that, `npx expo start` and pressing `i` is enough while
you only change JavaScript. Expo Go won't do: the app has its own URL
scheme and notifications, so it always runs as its own build.

Against the stand-in on your Mac (no real server, no account; the same
pretend agents as the website's demo):

```sh
# terminal 1
cd desktop && npm ci && npm run web

# terminal 2
cd mobile
EXPO_PUBLIC_SIMEON_API=http://127.0.0.1:4174 EXPO_PUBLIC_SIMEON_APP=http://127.0.0.1:4174/app npx expo run:ios
```

Tap Sign in, then "Sign in as bass@simeonlabs.com" on the page that opens.
Notifications never arrive in the Simulator; they need a real iPhone (a
preview build, below).

## One-time setup with Expo

```sh
npm install -g eas-cli
eas login
cd mobile
eas init
```

`eas init` creates the project on expo.dev and prints its id. Because the
app's settings are a `.ts` file it can't write the id itself: open
`app.config.ts`, find the `TODO(founder)` and put the id between the quotes
on the next line (`process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "<the id>"`),
then commit it. Builds and notifications need it. If `eas init` also asks
for an `owner` (when the project belongs to an Expo organisation), add
`owner: "<the organisation>"` next to `slug` in the same file.

## Notifications: the Apple key

Notifications go from Simeon Labs' server through Expo's push service to
Apple. Expo needs an Apple Push Notifications key for that, once:

```sh
cd mobile
eas credentials -p ios
```

Choose the production profile, then "Push Notifications: Manage your Apple
Push Notifications Key" and "Set up a new key" (EAS makes it in your Apple
account; or upload the `.p8` you made at developer.apple.com → Keys). The
first `eas build` offers the same thing.

The app asks for permission once, after the first sign-in, on a plain
screen ("Turn on notifications" / "Not now"). It then registers the phone
with the server (`POST /desktop/push-devices`) at every sign-in and launch,
and takes it off on sign-out (`DELETE /desktop/push-devices`).

## Builds

```sh
cd mobile

# For a few iPhones you register, installed from a link (no TestFlight):
eas device:create                      # once per iPhone: open the link it prints on that phone
eas build -p ios --profile preview

# For TestFlight and the App Store:
eas build -p ios --profile production
```

The build number goes up by itself (`eas.json`). Change `version` in
`app.config.ts` when you want a new version number people see.

## Send it to TestFlight

```sh
cd mobile
eas submit -p ios --latest
```

The first time it asks for your Apple ID and makes the app in App Store
Connect if it isn't there yet. You can also build and send in one go:
`eas build -p ios --profile production --auto-submit`. Apple then
processes the build (10 to 30 minutes); it appears under your app →
TestFlight in App Store Connect. The app says it uses no encryption beyond
HTTPS, so there is no export question to answer each time.

## Adding friends

Two kinds of testers, both in App Store Connect → your app → TestFlight:

- **Internal testers**, up to 100. They must be users of your App Store
  Connect team: add them first under Users and Access (any role, e.g.
  Marketing), they accept the e-mail, then add them to an internal group.
  Every build reaches them at once, with no review.
- **External testers**, up to 10,000, anyone with an e-mail address or a
  public link. Each new version's first build goes through Beta App Review
  (usually within a day). Apple needs a short description, a feedback
  e-mail, and a test account to sign in with, since the app starts at a
  sign-in: give them a Simeon account that has a plan, or they can't get
  past the sign-in.

Either way your friends install the TestFlight app from the App Store and
open the invitation.

## What is and isn't in this version

In: signing in (your Google account, through the iPhone's sign-in sheet),
the whole Simeon window, notifications, opening an agent from a
notification, attaching photos and files with the composer's +,
connecting apps (Notion, Linear, …) and links opening in Safari's sheet.

Not yet: voice calls and dictation (the app has no microphone access in
this version), the agent's hands on your own Mac, saving a file from a
chat to the phone, iPad and landscape. The window's phone layout is being
designed separately; the app shows whatever the web window looks like.

## Things worth knowing

- **Billing.** If the server requires a plan before sign-in
  (`SIMEON_DESKTOP_BILLING_REQUIRED`), someone without one is sent to the
  billing page (Stripe) inside the sign-in sheet. That is fine for
  internal testers; Apple's review of external builds and of the App
  Store can refuse an app that sells outside Apple's own payments, so for
  external testers use accounts that already have a plan.
- **Connecting an app** opens the app's own sign-in in the iPhone's
  sign-in sheet. It finishes on Simeon's page at
  app.simeonlabs.com/app/connected.html inside that sheet, which uses the
  Simeon sign-in Safari keeps (made when you signed in to the app); the
  sheet closes by itself once your agents' computer has the connection.
  If Safari has no Simeon sign-in any more (it lasts 31 days), that page
  says "Sign in to Simeon first": close the sheet, sign in at
  app.simeonlabs.com in Safari, and connect again.
- **Signed in after reinstalling.** iOS keeps the Keychain when an app is
  deleted, so reinstalling Simeon starts signed in. Sign out in the app to
  forget the account.

## How it works

- `src/App.tsx`: the app's states (signed out, asking about notifications,
  the window).
- `src/screens/WindowScreen.tsx`: the window in a WKWebView, the pair
  injected before the page loads, every navigation decided by
  `src/core/routing.ts`.
- `src/core/sign-in.ts`: the Mac app's own sign-in (`/loginDeepControl`,
  `/auth/poll`), byte for byte; `src/native/session.ts` runs it in the
  sign-in sheet.
- `src/core/notifications.ts`, `src/native/push.ts`: registering the phone
  and opening the agent a tapped notification names.
- The page's side is `desktop/web/` (`api.ts`, `bridge.ts`): inside the app
  it uses the pair the app hands it, posts every refreshed pair back,
  tells the app when the session ends, and opens an agent when asked
  (`window.__simeonNative.openAgent`). After changing anything there, run
  `cd desktop && npm run web:build` and commit `clients/apps/web/public/app`.

## Checks

```sh
cd mobile
npx tsc --noEmit            # types
npm test                    # the sign-in, the pair, the routing, notifications (Node's test runner)
npx expo-doctor             # the Expo setup
npx expo export --platform ios   # the JavaScript bundles for iOS
npm run icons               # redraws the icon and the launch screen from Simeon's mark
```

`npm run icons` needs Playwright: `SIMEON_PLAYWRIGHT=../desktop/node_modules/playwright-core npm run icons`.

Nothing here is done until it has run on a real iPhone: a TestFlight or
preview build, signed in, a notification received and tapped.
