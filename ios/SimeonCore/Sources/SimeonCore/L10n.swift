import Foundation

/**
 * The core's sentences in the app's language (docs/localization.md). English
 * is the source and is written in the code; each translation lives in
 * `Resources/Localizable.xcstrings`, the core's String Catalog, which Xcode
 * builds into the package for the iPhone and the Mac.
 *
 *     L10n.text("Couldn’t reach \(name).")              // the key is "Couldn’t reach %@."
 *     L10n.text("section.open", default: "Open")        // one English word, two meanings
 *
 * A key is the English with each value written as Apple's format does: a
 * String is `%@`, an Int `%lld`. Only those two can be put in a sentence (a
 * Double reads "2.500000": format it into a String first), so what builds on
 * Linux builds on the iPhone. A count's French plural is a variation of its
 * key in the catalog; the English keeps its own `n == 1` branch.
 *
 * Linux has no String Catalogs: there the English is returned as written, so
 * `swift test` reads every sentence as before. Where a translation is missing
 * the English is shown too.
 */
public enum L10n {
  #if canImport(Darwin)
  public typealias Value = String.LocalizationValue

  /** The sentence in the app's language. */
  public static func text(_ value: Value) -> String {
    String(localized: value, bundle: .module)
  }

  /** A sentence whose English has two meanings, told apart by its own key. */
  public static func text(_ key: StaticString, default value: Value) -> String {
    String(localized: key, defaultValue: value, bundle: .module)
  }
  #else
  /** The English sentence, with its values in place. */
  public struct Value: ExpressibleByStringInterpolation, Sendable {
    let english: String

    public init(stringLiteral value: String) { english = value }
    public init(stringInterpolation: StringInterpolation) { english = stringInterpolation.english }

    public struct StringInterpolation: StringInterpolationProtocol {
      var english = ""
      public init(literalCapacity: Int, interpolationCount: Int) { english.reserveCapacity(literalCapacity) }
      public mutating func appendLiteral(_ literal: String) { english += literal }
      public mutating func appendInterpolation(_ value: String) { english += value }
      public mutating func appendInterpolation(_ value: Int) { english += String(value) }
    }
  }

  public static func text(_ value: Value) -> String { value.english }

  public static func text(_ key: StaticString, default value: Value) -> String { value.english }
  #endif

  /**
   * Where dates, times and money are shown: `english` (what the English
   * screens have always used, like "en_US") while the app is in English,
   * else the app's language in the person's region ("fr_FR", "fr_CA").
   * Reading a date or a number keeps "en_US_POSIX".
   */
  public static func locale(english: Locale = Locale(identifier: "en_US")) -> Locale {
    let language = AppLanguage.current
    if AppLanguage.isEnglish(language) { return english }
    let tag = language.replacingOccurrences(of: "-", with: "_")
    let namesRegion = tag.split(separator: "_").dropFirst().contains { $0.count == 2 && $0 == $0.uppercased() }  // "pt-BR"
    guard !namesRegion, let region = Locale.current.region?.identifier else { return Locale(identifier: tag) }
    return Locale(identifier: "\(tag)_\(region)")
  }
}
