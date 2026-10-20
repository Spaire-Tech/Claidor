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
| The engine's calls to the server | `Accept-Language` (the person's) on the flight booking calls and the phone pushes, so the server's refusals and a push's card line come back in it; a flight search's fields stay English (the apps read them) | `acceptLanguageHeader` (`shared/user-language.ts`), `simeonApiData(…, { language })`, `mobile-push-notifier.ts` |
| The sign-in code email | the request's `Accept-Language` (the app's, or the browser's) | `login_code.service.send`, `server/emails/src/words.ts` |

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
| The shared core's sentences (`SimeonCore`, `SimeonMacCore`): cards, consent, routines, calls, errors, plans | `ios/SimeonCore/Sources/SimeonCore/Resources/Localizable.xcstrings`, read by `L10n.text` | `check_translations.py` (each `L10n.text` is in it) |
| The engine's sentences shown as they come: card notes, refusals, trays, previews, notifications, approvals, the connectors list | `desktop/source/shared/words/areas/*.ts` (an `EN` and an `FR` object in each), read by `say(language, key, values)` (`shared/say.ts`) | `desktop/tests/say.test.mjs`, `check_translations.py`, the type check |
| The server's answers: refusals, the sign-in pages, the free month | `server/simeon/desktop/words/` (`_booking.py`, `_account.py`: `EN` and `FR`; `en.py`, `fr.py` gather them), read by `say(key, **values)` in the request's `Accept-Language` | `server/tests/desktop/test_words.py`, `check_translations.py` |
| The sign-in code email | `server/emails/src/words.ts` | `check_translations.py` |
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
- Words written by the shared core, the engine or the server and shown as
  they come are not in these catalogs: they are translated where they are
  made (below).

### Writing the core's sentences

The core (`ios/SimeonCore`) has no screens and builds on Linux, where Apple's
`String(localized:)` does not exist. It writes each sentence it shows through
`L10n.text` (`L10n.swift`), which reads the core's own catalog on the iPhone
and the Mac and returns the English on Linux, so `swift test` reads every
sentence as before:

```swift
L10n.text("Couldn’t reach \(name).")            // key "Couldn’t reach %@."
L10n.text("\(count) agents")                    // key "%lld agents", a French plural
L10n.text("section.open", default: "Open")      // one English word, two meanings
```

- The key is the English with each value as Apple's format writes it: a
  `String` is `%@`, an `Int` is `%lld`, a `%` is `%%`. Only those two types
  go in a sentence (a `Double` would read "2.500000": format it first), so
  what builds on Linux builds on the iPhone.
- The English keeps its own `n == 1` branch; the French plural is a variation
  of the count's key.
- Dates, times and money are shown in `L10n.locale()`: the English screens'
  own locale (`en_US`) while the app is in English, else the app's language
  in the person's region. Reading a date keeps `en_US_POSIX`.
- Not translated: what a model reads (prompts, the call's instructions),
  what the server or the engine parses, logs, and anything stored or compared.
- A new sentence: add its key and its French to the catalog (the JSON, or
  Xcode's catalog editor, entries marked `manual`); `check_translations.py`
  names any `L10n.text` whose key is missing.

### Writing the engine's and the server's sentences

The engine and the server write some sentences the person reads as they
come: a purchase card's note, a refusal the apps show in an alert, a tray,
a list preview, a push. Each goes through `say` with a key:

```ts
say(this.tm.userLanguage?.(), "flight.priceChanged", { total: offer.total })   // the engine
```

```python
say("sign_in.wrong_code")                    # the server: the request's language
say("email.login_code.subject", language="fr")
```

- The English is in the `EN` table, the French in the `FR` table beside it,
  with the same keys and the same `{values}`. The type check (engine) and
  the tests (both) fail on a missing one.
- The engine's language is the host setting `userLanguage`
  (`this.tm.userLanguage?.()` in the transcript extension,
  `currentUserLanguage()` where nothing passes it in; unset, as in the
  tests, it is English). The server's is the request's `Accept-Language`
  (`language.answer_in_request_language`, on the apps' routers); the engine
  sends the person's on its booking calls and pushes.
- Not translated: what a model reads (tool results, wake prompts, the
  agents' instructions), what the apps parse (a flight search's fields, the
  call's `Voice call · …` line), logs and error codes.

## When it misbehaves

- The agents write English to a French person: read the host setting
  (`getHostSettings`, `userLanguage`). Empty means the app never told it:
  the app tells it after each sign-in and reconnect (`AppStore.tellLanguage`).
- A French call does not connect, or speaks English: the server logs
  `desktop.voice.languages_refused` when ElevenLabs refused the agent's other
  languages; the agent is then written without them, so English calls go on.
- The account's language: `GET /desktop/api/user/profile` answers `language`.
- A server refusal in English to a French person: the request had no
  `Accept-Language` naming French. The apps send theirs on every request;
  the engine sends the person's on the flight booking calls and the pushes only.

## Adding a language

1. The apps: add it to `CFBundleLocalizations` in `ios/project.yml` (the app
   and the notification extension) and `mac/project.yml`, then fill its column
   in each String Catalog, the core's included (Xcode's catalog editor, or the
   JSON).
2. The calls: add it to `VOICE_CALL_LANGUAGES` (engine), `VoiceCallText.languages`
   (core) and `VOICE_LANGUAGES` (server, with its first message), add its
   greetings beside the French ones (engine and core, word for word), then
   raise `VOICE_AGENT_CONFIG_VERSION`. Use ElevenLabs' code as the iPhone's
   kit names it (its `Language`): Brazilian Portuguese is `pt` (the kit has no
   `pt-br`; the call's rule still says "Brazilian Portuguese"), Chinese
   (Traditional) is `zh`.
3. The engine, the server and the emails: add the language's table beside
   each `FR` (`desktop/source/shared/words/areas/*.ts` and `TABLES` in
   `shared/say.ts`; `server/simeon/desktop/words/_*.py`, a `<language>.py`
   and `TABLES` in `words/__init__.py`, and `TRANSLATED` in `language.py`;
   `server/emails/src/words.ts`).
4. Run `python3 scripts/check_translations.py`, the tests, and read every
   screen in the new language on an iPhone and a Mac.
