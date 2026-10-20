# Simeon in other languages

Simeon is written in English and translated, French first (20 October 2026).
Each later language (Spanish, German, Portuguese (Brazil), Japanese, Italian,
Dutch, Korean, Chinese (Traditional), Arabic) is a translation pass: add the
language where this page says, fill in its words, and run
`python3 scripts/check_translations.py`.

English stays the source language in the code. Every translation lives in one
place per platform.

## One language for the whole product

The person's language is the app's: the iPhone follows the phone (Settings ›
Simeon › Language changes it), the Mac follows the Mac or the Language picker
in Settings › General (it relaunches). It travels everywhere text is written
outside the apps:

| Where | How it gets there | Code |
|---|---|---|
| Simeon Labs' server | `Accept-Language` on every request | `AppLanguage`, `SimeonAPI.clientHeaders`, `SimeonConfig.serverHeaders` (`ios/SimeonCore`) |
| The account | `POST /desktop/api/user/profile {"language"}` after every sign-in; kept in `users.language` | `AppStore.tellLanguage`, `server/simeon/desktop/language.py` |
| The person's computer | the host setting `userLanguage`, beside `userTimeZone`, after every sign-in and reconnect | `AppStore.tellLanguage`, `desktop/source/shared/node/settings/sand-settings-store.ts` |
| The agents | `## Language` in every agent's instructions; a closing line on the first-run cues (each agent's hello, Simeon's introduction, a staffed agent's first turn) | `desktop/source/shared/user-language.ts` |
| Voice calls | the call's `language`, its first line and a `Language:` rule in its prompt | `voice-call-prompt.ts` (engine), `VoiceCallText` (core); the server's agent knows each language (`VOICE_LANGUAGES` in `server/simeon/desktop/voice.py`) |
| Dictation | the iPhone's speech recognizer follows the phone; the server's transcription gets `language` when it is not English | `SimeonAPI.transcribe` |

English, or no language, leaves every prompt and every request exactly as it
was. The shop's `customer.locale` and `checkout.locale` belong to the
inherited checkout and are not this.

## The voice: "tu"

All French in the apps, the website pages Simeon owns, the emails and the
agents says "tu": warm and direct, like a capable friend at work, never stiff.

- The agents say "tu" by default. When the person asks for "vous" (or writes
  in "vous" and asks for it), the agent switches, keeps it for that person
  from then on, and saves it to the person's shared memory ("Prefers to be
  addressed as vous in French") so every agent follows it.
- The app's own screens always say "tu".
- One exception: the inherited checkout page's legal payment text
  (`clients/packages/i18n/src/locales/fr.ts`, `checkout.footer.mandate*`)
  keeps its formal wording. It is legal text, and Simeon does not sell through
  it today.

## Translation rules

- **Never translate** Simeon, SimeonLabs, simeonlabs.com; agent names; app and
  connector names (Gmail, Link, Shop, Stripe…); plan names. Duffel is never
  shown to people, in any language.
- **French typography**: a narrow no-break space (U+202F) before `:` `;` `!`
  `?`; « » for quotes in sentences, with a narrow no-break space inside; the
  curly apostrophe ’; money and dates in the locale's format (12,50 €,
  20 octobre 2026, 14 h 30), from the locale, never written by hand.
- **Short words on buttons.** Check that nothing truncates at iPhone SE width
  and in the Mac's narrowest window.
- Write the French yourself, then re-read each screen in context. Anything you
  are unsure of goes in the PR for the founder.

## Where each platform keeps its words

| Platform | Place | Check |
|---|---|---|
| The iPhone app's screens | `ios/Simeon/Localizable.xcstrings`; its permission prompts in `ios/Simeon/InfoPlist.xcstrings` | `check_translations.py` |
| The notification extension | `ios/SimeonNotifications/Localizable.xcstrings` | `check_translations.py` |
| The Mac app's screens | `mac/Simeon/Localizable.xcstrings` (with the strings of `ios/Simeon/Voice.swift` and `Computer.swift`, which the Mac also builds); `mac/Simeon/InfoPlist.xcstrings` | `check_translations.py` |
| The engine (the agents' prompts, voice calls) | `desktop/source/shared/user-language.ts`; the calls' greetings in `voice-call-prompt.ts` | `desktop/tests/user-language.test.mjs` |
| The core (calls) | `ios/SimeonCore/Sources/SimeonCore/VoiceCall.swift` (`firstMessage`), word for word as the engine's | `LanguageTests.swift` |
| The server's voice agent | `VOICE_LANGUAGES` in `server/simeon/desktop/voice.py` | `server/tests/desktop/test_language.py` |

`scripts/check_translations.py` fails when any of these has an English
sentence without its French.

### Writing the apps' screens

Xcode reads the code's strings into the String Catalogs on each build
(`SWIFT_EMIT_LOC_STRINGS`), new ones marked untranslated, and
`check_translations.py` then fails until they have their French.

- A literal SwiftUI localizes by itself: `Text("…")`, `Button("…")`,
  `Label`, `Toggle`, `Section`, `.navigationTitle`, `TextField`, `.help`,
  `.accessibilityLabel("…")`, and a ternary of two literals.
- Anything that reaches the screen as a `String` is not localized: a custom
  view's `title: String`, an AppKit menu, an alert's button, a value built in
  code, a ternary or `??` with a `String` on the other side. Write those
  `String(localized: "…")` where the words are written.
- A whole sentence per key, never fragments glued together: French puts its
  words in another order (`"\(who) is typing…"`, not `who + " is typing…"`).
- The same English with two meanings gets its own key, with the same English:
  `String(localized: "section.open", defaultValue: "Open")` (a section's state,
  "Ouverte", beside the button "Ouvrir"), `traveller.title` (Civilité, beside an
  agent's Titre).
- Counts: plural variations in the catalog (French "one" covers 0 and 1).
- Words written by the shared core (`SimeonCore`) or the engine and shown as
  they come are not in these catalogs: stages 3 and 4 of the plan translate
  them where they are made.

## When it misbehaves

- The agents write English to a French person: read the host setting
  (`getHostSettings`, `userLanguage`). Empty means the app never told it:
  the app tells it after each sign-in and reconnect (`AppStore.tellLanguage`).
- A French call does not connect, or speaks English: the server logs
  `desktop.voice.languages_refused` when ElevenLabs refused the agent's other
  languages; the agent is then written without them, so English calls go on.
- The account's language: `GET /desktop/api/user/profile` answers `language`.

## Adding a language

1. The apps: add it to `CFBundleLocalizations` in `ios/project.yml` (the app
   and the notification extension) and `mac/project.yml`, then fill its column
   in each String Catalog (Xcode's catalog editor, or the JSON).
2. The calls: add it to `VOICE_CALL_LANGUAGES` (engine), `VoiceCallText.languages`
   (core) and `VOICE_LANGUAGES` (server, with its first message), add its
   greetings beside the French ones (engine and core, word for word), then
   raise `VOICE_AGENT_CONFIG_VERSION`. Use ElevenLabs' code as the iPhone's
   kit names it (its `Language`): Brazilian Portuguese is `pt` (the kit has no
   `pt-br`; the call's rule still says "Brazilian Portuguese"), Chinese
   (Traditional) is `zh`.
3. Run `python3 scripts/check_translations.py`, the tests, and read every
   screen in the new language on an iPhone and a Mac.
