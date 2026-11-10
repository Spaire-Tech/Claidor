import Foundation

// What the Credentials Store's forms make of what is typed, the same on the
// iPhone and the Mac (and, translated, on the web: `core/formEntry.ts`), so
// nobody wonders how to write a field (10 November 2026, the founder:
// "Help the user. dont confuse him. have the card number be number only.
// separate them … automatically … add the / automatically … add flags, add
// area code like +1 us"):
//
//   - a card's number: digits only, grouped as the card prints them
//     (4242 4242 4242 4242; American Express 3782 822463 10005), no longer
//     than its network's;
//   - its expiry: the slash written by itself (08/28), a month that can't be
//     one refused as it's typed;
//   - its security code: digits only, 4 for American Express, 3 for the rest;
//   - a phone: the country's flag and code (+1, +33…) apart, the number
//     grouped as that country writes it, kept as "+33 6 12 34 56 78".

extension CardNumber {
  /** The most digits a card of this network has. */
  public static func maxDigits(_ brand: String) -> Int {
    switch brand {
    case "amex": return 15
    case "diners": return 14
    case "visa", "mastercard", "discover", "jcb": return 16
    default: return 19
    }
  }

  /** The digits kept from what was typed: digits only, at most the network's. */
  public static func typed(_ text: String) -> String {
    let all = digits(text)
    return String(all.prefix(maxDigits(brand(all))))
  }

  /** The number as the card prints it: 4-6-5 for American Express, 4-6-4 for Diners Club, else fours. */
  public static func grouped(_ text: String) -> String {
    let number = typed(text)
    let brand = brand(number)
    let sizes: [Int] = brand == "amex" ? [4, 6, 5] : brand == "diners" ? [4, 6, 4] : [4, 4, 4, 4, 3]
    var groups: [String] = []
    var rest = Substring(number)
    for size in sizes where !rest.isEmpty {
      groups.append(String(rest.prefix(size)))
      rest = rest.dropFirst(size)
    }
    return groups.joined(separator: " ")
  }

  /** How many digits the security code has: 4 on American Express, 3 on the others. */
  public static func codeLength(_ brand: String) -> Int { brand == "amex" ? 4 : 3 }

  /** The security code as typed: digits only, no more than the card's (4 while the network is unknown). */
  public static func typedCode(_ text: String, brand: String) -> String {
    String(digits(text).prefix(brand.isEmpty ? 4 : codeLength(brand)))
  }

  /**
   * The expiry as it's typed, its slash written by itself: "1" stays (10 to
   * 12 may follow), "4" becomes "04/", "12" becomes "12/", "13" keeps "1";
   * a slash deleted takes its month's last digit with it, so it can be
   * typed again. At most "MM/YY".
   */
  public static func typedExpiry(old: String, new: String) -> String {
    var numbers = digits(new)
    // The slash alone was deleted ("08/" to "08"): the month's last digit goes with it.
    if new.count < old.count, old.hasSuffix("/"), digits(old) == numbers { numbers = String(numbers.dropLast()) }
    numbers = String(numbers.prefix(4))
    guard let first = numbers.first else { return "" }
    if numbers.count == 1 {
      return first == "0" || first == "1" ? numbers : "0\(numbers)/"
    }
    var month = String(numbers.prefix(2))
    var year = String(numbers.dropFirst(2))
    if month == "00" || (Int(month) ?? 0) > 12 {
      // "13": the 1 is a month's first digit, the 3 can't follow it; "4…" became "04" above.
      if first == "0" || first == "1" { return String(first) }
      month = "0\(first)"
      year = String(numbers.dropFirst(1).prefix(2))
    }
    return year.isEmpty && new.count >= old.count ? "\(month)/" : year.isEmpty ? month : "\(month)/\(year)"
  }

  /** Whether a card expiring "MM/YY" has expired: it's good to the month's last day. */
  public static func isExpired(_ text: String, now: Date = Date()) -> Bool {
    guard let expiry = expiry(text) else { return false }
    let parts = expiry.split(separator: "/")
    guard parts.count == 2, let month = Int(parts[0]), let year = Int(parts[1]) else { return false }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone.current
    let today = calendar.dateComponents([.year, .month], from: now)
    let thisYear = (today.year ?? 2000) % 100
    let thisMonth = today.month ?? 1
    return year < thisYear || (year == thisYear && month < thisMonth)
  }
}

/** The digits of a field that writes its own spaces and brackets. */
public enum TypedDigits {
  /**
   * The digits of what was typed. When only a space, a bracket or a slash
   * between them was deleted, the digit before it goes too, so deleting
   * never stalls on a symbol the field writes back.
   */
  public static func of(before: String, after: String) -> String {
    let digits = CardNumber.digits(after)
    if after.count < before.count, digits == CardNumber.digits(before) { return String(digits.dropLast()) }
    return digits
  }
}

/** A country: its code (ISO, "FR"), its name in the person's language, its flag, its phone code. */
public struct Country: Hashable, Identifiable, Sendable {
  public let code: String
  public let name: String
  /** "33", without the plus. */
  public let dial: String
  public var id: String { code }
  /** 🇫🇷, from the code's two letters. */
  public var flag: String { Countries.flag(code) }
  /** "+33". */
  public var dialLabel: String { "+\(dial)" }
}

/** The countries a form chooses from, each with its flag and phone code. */
public enum Countries {
  /** Each country's phone code (ITU E.164), by its ISO code. */
  public static let dialCodes: [String: String] = [
    "AD": "376", "AE": "971", "AF": "93", "AG": "1", "AI": "1", "AL": "355", "AM": "374", "AO": "244", "AR": "54", "AS": "1",
    "AT": "43", "AU": "61", "AW": "297", "AX": "358", "AZ": "994", "BA": "387", "BB": "1", "BD": "880", "BE": "32", "BF": "226",
    "BG": "359", "BH": "973", "BI": "257", "BJ": "229", "BL": "590", "BM": "1", "BN": "673", "BO": "591", "BQ": "599", "BR": "55",
    "BS": "1", "BT": "975", "BW": "267", "BY": "375", "BZ": "501", "CA": "1", "CC": "61", "CD": "243", "CF": "236", "CG": "242",
    "CH": "41", "CI": "225", "CK": "682", "CL": "56", "CM": "237", "CN": "86", "CO": "57", "CR": "506", "CU": "53", "CV": "238",
    "CW": "599", "CX": "61", "CY": "357", "CZ": "420", "DE": "49", "DJ": "253", "DK": "45", "DM": "1", "DO": "1", "DZ": "213",
    "EC": "593", "EE": "372", "EG": "20", "EH": "212", "ER": "291", "ES": "34", "ET": "251", "FI": "358", "FJ": "679", "FK": "500",
    "FM": "691", "FO": "298", "FR": "33", "GA": "241", "GB": "44", "GD": "1", "GE": "995", "GF": "594", "GG": "44", "GH": "233",
    "GI": "350", "GL": "299", "GM": "220", "GN": "224", "GP": "590", "GQ": "240", "GR": "30", "GT": "502", "GU": "1", "GW": "245",
    "GY": "592", "HK": "852", "HN": "504", "HR": "385", "HT": "509", "HU": "36", "ID": "62", "IE": "353", "IL": "972", "IM": "44",
    "IN": "91", "IO": "246", "IQ": "964", "IR": "98", "IS": "354", "IT": "39", "JE": "44", "JM": "1", "JO": "962", "JP": "81",
    "KE": "254", "KG": "996", "KH": "855", "KI": "686", "KM": "269", "KN": "1", "KP": "850", "KR": "82", "KW": "965", "KY": "1",
    "KZ": "7", "LA": "856", "LB": "961", "LC": "1", "LI": "423", "LK": "94", "LR": "231", "LS": "266", "LT": "370", "LU": "352",
    "LV": "371", "LY": "218", "MA": "212", "MC": "377", "MD": "373", "ME": "382", "MF": "590", "MG": "261", "MH": "692", "MK": "389",
    "ML": "223", "MM": "95", "MN": "976", "MO": "853", "MP": "1", "MQ": "596", "MR": "222", "MS": "1", "MT": "356", "MU": "230",
    "MV": "960", "MW": "265", "MX": "52", "MY": "60", "MZ": "258", "NA": "264", "NC": "687", "NE": "227", "NF": "672", "NG": "234",
    "NI": "505", "NL": "31", "NO": "47", "NP": "977", "NR": "674", "NU": "683", "NZ": "64", "OM": "968", "PA": "507", "PE": "51",
    "PF": "689", "PG": "675", "PH": "63", "PK": "92", "PL": "48", "PM": "508", "PR": "1", "PS": "970", "PT": "351", "PW": "680",
    "PY": "595", "QA": "974", "RE": "262", "RO": "40", "RS": "381", "RU": "7", "RW": "250", "SA": "966", "SB": "677", "SC": "248",
    "SD": "249", "SE": "46", "SG": "65", "SH": "290", "SI": "386", "SJ": "47", "SK": "421", "SL": "232", "SM": "378", "SN": "221",
    "SO": "252", "SR": "597", "SS": "211", "ST": "239", "SV": "503", "SX": "1", "SY": "963", "SZ": "268", "TC": "1", "TD": "235",
    "TG": "228", "TH": "66", "TJ": "992", "TK": "690", "TL": "670", "TM": "993", "TN": "216", "TO": "676", "TR": "90", "TT": "1",
    "TV": "688", "TW": "886", "TZ": "255", "UA": "380", "UG": "256", "US": "1", "UY": "598", "UZ": "998", "VA": "39", "VC": "1",
    "VE": "58", "VG": "1", "VI": "1", "VN": "84", "VU": "678", "WF": "681", "WS": "685", "XK": "383", "YE": "967", "YT": "262",
    "ZA": "27", "ZM": "260", "ZW": "263",
  ]

  /** The country a shared code means when nothing says otherwise (+1 the United States, +44 the United Kingdom…). */
  static let primary: [String: String] = [
    "1": "US", "7": "RU", "39": "IT", "44": "GB", "47": "NO", "61": "AU", "212": "MA", "262": "RE", "358": "FI", "590": "GP", "599": "CW",
  ]

  /** 🇫🇷 from "FR": its two letters as the regional indicators every system draws as the flag. */
  public static func flag(_ code: String) -> String {
    let letters = code.uppercased().unicodeScalars.filter { $0.value >= 65 && $0.value <= 90 }
    guard letters.count == 2 else { return "" }
    return String(String.UnicodeScalarView(letters.compactMap { Unicode.Scalar(127_397 + $0.value) }))
  }

  /** The country's name in the person's language ("France", "Allemagne"), else its code. */
  public static func name(_ code: String, locale: Locale = .current) -> String {
    locale.localizedString(forRegionCode: code) ?? Locale(identifier: "en").localizedString(forRegionCode: code) ?? code
  }

  /** Every country with a phone code, by its name in the person's language. */
  public static func all(locale: Locale = .current) -> [Country] {
    dialCodes.map { Country(code: $0.key, name: name($0.key, locale: locale), dial: $0.value) }
      .sorted { $0.name.compare($1.name, locale: locale) == .orderedAscending }
  }

  public static func country(_ code: String, locale: Locale = .current) -> Country? {
    let key = code.uppercased()
    return dialCodes[key].map { Country(code: key, name: name(key, locale: locale), dial: $0) }
  }

  /** The person's own country, from their device's region; the United States when it names none. */
  public static var here: String {
    let region: String?
    #if canImport(Darwin)
    if #available(iOS 16, macOS 13, *) { region = Locale.current.region?.identifier } else { region = Locale.current.regionCode }
    #else
    region = Locale.current.regionCode
    #endif
    if let region, dialCodes[region.uppercased()] != nil { return region.uppercased() }
    return "US"
  }
}

/** A phone number as a form writes it: the country apart, the rest grouped as that country does. */
public enum PhoneEntry {
  /** How each country groups its numbers, without the 0 dialled at home ("#" a digit). */
  static let patterns: [String: String] = [
    "US": "(###) ###-####", "CA": "(###) ###-####",
    "FR": "# ## ## ## ##", "MA": "# ## ## ## ##", "CM": "# ## ## ## ##",
    "GB": "#### ######", "DE": "### ########", "AT": "### #######", "NL": "# ########",
    "BE": "### ## ## ##", "CH": "## ### ## ##", "LU": "### ### ###", "IE": "## ### ####",
    "ES": "### ## ## ##", "PT": "### ### ###", "IT": "### ### ####", "GR": "### ### ####",
    "SE": "## ### ## ##", "NO": "### ## ###", "DK": "## ## ## ##", "FI": "## ### ####",
    "PL": "### ### ###", "TR": "### ### ## ##", "RU": "### ###-##-##", "KZ": "### ###-##-##",
    "SN": "## ### ## ##", "CI": "## ## ## ## ##", "DZ": "### ## ## ##", "TN": "## ### ###",
    "NG": "### ### ####", "ZA": "## ### ####", "KE": "### ######", "EG": "### ### ####",
    "AE": "## ### ####", "SA": "## ### ####", "IL": "##-###-####", "IN": "##### #####",
    "CN": "### #### ####", "JP": "##-####-####", "KR": "##-####-####", "AU": "### ### ###",
    "NZ": "## ### ####", "BR": "(##) #####-####", "MX": "## #### ####",
  ]

  /** The countries whose numbers are dialled with a 0 at home, a 0 left out after the country's code. */
  static let homeZero: Set<String> = [
    "FR", "GB", "DE", "AT", "NL", "BE", "CH", "IE", "SE", "FI", "TR", "MA", "DZ", "TN", "NG", "ZA", "KE", "EG",
    "AE", "SA", "IL", "IN", "CN", "JP", "KR", "AU", "NZ", "BR", "MX", "AR", "PE", "CO", "TH", "VN", "MY", "ID", "PH", "PK",
  ]

  /** The most digits a number has after its country's code. */
  public static let maxDigits = 14

  /** The digits kept from what was typed after the country's code: digits only, a home 0 left out. */
  public static func national(_ typed: String, country: String) -> String {
    var numbers = CardNumber.digits(typed)
    if homeZero.contains(country.uppercased()), numbers.hasPrefix("0") { numbers.removeFirst() }
    return String(numbers.prefix(maxDigits))
  }

  /** The digits grouped as the country writes them; elsewhere in threes, the last group of up to four. */
  public static func formatted(_ national: String, country: String) -> String {
    let numbers = CardNumber.digits(national)
    guard !numbers.isEmpty else { return "" }
    if let pattern = patterns[country.uppercased()], pattern.filter({ $0 == "#" }).count >= numbers.count {
      var written = ""
      var rest = Substring(numbers)
      for character in pattern {
        if rest.isEmpty { break }
        if character == "#" {
          written.append(rest.removeFirst())
        } else {
          written.append(character)
        }
      }
      return written
    }
    // In threes: 612 345 678, 612 345 6789.
    var groups: [String] = []
    var rest = Substring(numbers)
    while rest.count > 4 {
      groups.append(String(rest.prefix(3)))
      rest = rest.dropFirst(3)
    }
    groups.append(String(rest))
    return groups.joined(separator: " ")
  }

  /** As it's kept: "+33 6 12 34 56 78"; empty with no number. */
  public static func joined(country: String, national: String) -> String {
    let numbers = CardNumber.digits(national)
    guard !numbers.isEmpty else { return "" }
    let dial = Countries.dialCodes[country.uppercased()] ?? ""
    let written = formatted(numbers, country: country)
    return dial.isEmpty ? written : "+\(dial) \(written)"
  }

  /**
   * A kept number taken apart: its country (from its code, the one asked
   * for when the code is shared, as +1 is) and the digits after it. A number
   * with no code is the country asked for.
   */
  public static func split(_ phone: String, preferring wanted: String) -> (country: String, national: String) {
    let preferred = wanted.uppercased()
    let text = phone.trimmingCharacters(in: .whitespacesAndNewlines)
    var numbers = CardNumber.digits(text)
    let international = text.hasPrefix("+") || numbers.hasPrefix("00")
    guard international else { return (preferred, national(numbers, country: preferred)) }
    if numbers.hasPrefix("00") { numbers.removeFirst(2) }
    for length in [3, 2, 1] where numbers.count > length {
      let dial = String(numbers.prefix(length))
      let countries = Countries.dialCodes.filter { $0.value == dial }.map(\.key)
      guard !countries.isEmpty else { continue }
      let country = countries.contains(preferred) ? preferred : Countries.primary[dial] ?? countries.sorted()[0]
      return (country, String(numbers.dropFirst(length).prefix(maxDigits)))
    }
    return (preferred, String(numbers.prefix(maxDigits)))
  }
}
