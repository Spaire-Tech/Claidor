import Foundation

/**
 * The app's language (20 October 2026): the one the iPhone or the Mac opened
 * the app in, chosen from the languages the app declares (`CFBundleLocalizations`
 * in `ios/project.yml` and `mac/project.yml`). One language for the whole
 * product: it travels everywhere text is written outside the app.
 *
 * - Simeon Labs' server hears it on every request (`Accept-Language`,
 *   `SimeonAPI.clientHeaders`, `SimeonConfig.serverHeaders`).
 * - The person's computer keeps it as the host setting `userLanguage`, beside
 *   `userTimeZone`: the agents write in it and a call speaks it
 *   (`desktop/source/shared/user-language.ts`).
 * - The account keeps it (`POST user/profile`), for what is written without a
 *   request, like the sign-in code email.
 *
 * The last two are told after every sign-in (`AppStore.tellLanguage`, from
 * `attach`). Changing the language relaunches the app (iOS does; the Mac's
 * picker asks to), so a launch is also "whenever it changes". English is the
 * source language (docs/localization.md).
 */
public enum AppLanguage {
  /** English, the source language. */
  public static let english = "en"

  /** Set by the tests; nil reads the app's own. */
  nonisolated(unsafe) public static var override: String?

  /** The language this run of the app is in: "fr", "en", "pt-BR". English where nothing else is known (Linux, the tests). */
  public static var current: String {
    if let override { return tag(override) }
    #if canImport(Darwin)
    return tag(Bundle.main.preferredLocalizations.first ?? english)
    #else
    return english
    #endif
  }

  /** A localization's name as a language tag: "pt_BR" is "pt-BR", "Base" (Xcode's own) is English. */
  public static func tag(_ identifier: String) -> String {
    let trimmed = identifier.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "_", with: "-")
    if trimmed.isEmpty || trimmed == "Base" { return english }
    return trimmed
  }

  /** "fr" for "fr-CA", "pt" for "pt-BR". */
  public static func code(_ tag: String) -> String {
    String(tag.split(separator: "-").first ?? Substring(tag)).lowercased()
  }

  public static func isEnglish(_ tag: String) -> Bool { code(tag) == english }

  /**
   * Each language Simeon is translated into, in its own words, as Settings
   * shows it ("Français", "English"); later languages are a line each.
   */
  static let ownNames: [String: String] = [
    "en": "English", "fr": "Français", "es": "Español", "de": "Deutsch", "pt-BR": "Português (Brasil)", "pt": "Português",
    "ja": "日本語", "it": "Italiano", "nl": "Nederlands", "ko": "한국어", "zh-Hant": "繁體中文", "ar": "العربية",
  ]

  /** Each language's name in English, for instructions to a model ("Speak French"). */
  static let englishNames: [String: String] = [
    "en": "English", "fr": "French", "es": "Spanish", "de": "German", "pt-BR": "Brazilian Portuguese", "pt": "Portuguese",
    "ja": "Japanese", "it": "Italian", "nl": "Dutch", "ko": "Korean", "zh-Hant": "Traditional Chinese", "zh": "Chinese", "ar": "Arabic",
  ]

  /** "French", for instructions to a model; the tag itself when it is none of Simeon's languages. */
  public static func englishName(_ tag: String) -> String {
    englishNames[tag] ?? englishNames[code(tag)] ?? tag
  }

  /** The language in its own words, for the Language row and the Mac's picker: "Français". */
  public static func ownName(_ tag: String) -> String {
    if let name = ownNames[tag] ?? ownNames[code(tag)] { return name }
    let locale = Locale(identifier: tag)
    let name = locale.localizedString(forIdentifier: tag) ?? tag
    return name.prefix(1).uppercased() + name.dropFirst()
  }

  /** The languages the app is in, for the Mac's picker: its localizations ("Base" left out), English first, then by own name. */
  public static func available(_ localizations: [String]) -> [String] {
    var seen = Set<String>()
    let tags = localizations.map(tag).filter { seen.insert($0).inserted }
    let rest = tags.filter { !isEnglish($0) }.sorted { ownName($0).localizedCompare(ownName($1)) == .orderedAscending }
    return [english] + rest
  }
}
