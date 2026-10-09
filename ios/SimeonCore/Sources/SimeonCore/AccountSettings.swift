import Foundation

/**
 * Settings as the shipped window has them (the settings chunk,
 * `clients/apps/web/public/app/assets/index-BlqerJhg.js`, and the helpers it
 * takes from the main bundle), ported rule for rule and checked against
 * those functions run in Node (Tests/…/Fixtures/settings.json): the
 * account card's letters and lines, Auto-review's rules editor, the usage
 * meters and their words, and the Manage Plan card the patch adds.
 */

/** The account card's letters (`zon`): the first and last words' first letters, brackets left out; else the first letter that is not punctuation; else "?". */
public enum AccountInitials {
  private static let bracketed = try! NSRegularExpression(pattern: "[(\\[{（［｛【〔][^)\\]}）］｝】〕]*[)\\]}）］｝】〕]?")
  private static let word = try! NSRegularExpression(pattern: "[\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M}'’-]*")
  private static let quiet = try! NSRegularExpression(pattern: "^[\\p{P}\\p{Z}\\p{C}\\p{M}]+$")

  public static func of(_ name: String) -> String {
    let plain = bracketed.stringByReplacingMatches(in: name, range: NSRange(name.startIndex..., in: name), withTemplate: " ")
    for text in [plain, name] {
      let words = word.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { Range($0.range, in: text).map { String(text[$0]) } }
      guard let first = words.first else { continue }
      let last = words.count > 1 ? words.last : nil
      let letters = (first.first.map(String.init) ?? "") + (last?.first.map(String.init) ?? "")
      if !letters.isEmpty { return letters.uppercased() }
    }
    let lone = firstLetter(plain) ?? firstLetter(name) ?? ""
    return lone.isEmpty ? "?" : lone.uppercased()
  }

  private static func firstLetter(_ text: String) -> String? {
    for character in text {
      let piece = String(character)
      if quiet.firstMatch(in: piece, range: NSRange(piece.startIndex..., in: piece)) == nil { return piece }
    }
    return nil
  }
}

/** The account card's two lines (`resolveAccountDisplay`, `uct`): the name ("Simeon" with none), and the e-mail under it unless it is the name. */
public struct AccountDisplay: Equatable, Sendable {
  public let name: String?
  public let secondary: String?

  public init(displayName: String?, email: String?) {
    let name = Self.trimmed(displayName)
    let mail = Self.trimmed(email)
    self.name = name
    secondary = mail != nil && mail?.lowercased() != name?.lowercased() ? mail : nil
  }

  /** What the card's name says. */
  public var title: String { name ?? "Simeon" }

  private static func trimmed(_ text: String?) -> String? {
    guard let value = text?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
    return value
  }
}

/**
 * Auto-review's rules (`autoReviewInstructions`, the box's host settings):
 * two lists, "Allow automatically" and "Ask first", twenty rules each, a
 * thousand characters a rule. The editor's rules (`Ce`, `Ke`, `Ks`): no rule
 * twice in a list, no rule into a full list, and an edited rule that moves
 * to the other list goes to its end.
 */
public struct AutoReviewInstructions: Equatable, Sendable {
  public enum Behavior: String, Sendable, CaseIterable { case allow, ask }

  /** A rule as the table lists it: which list, its words, its place in that list. */
  public struct Rule: Equatable, Sendable, Hashable {
    public let behavior: Behavior
    public let text: String
    public let listIndex: Int
    public init(behavior: Behavior, text: String, listIndex: Int) { self.behavior = behavior; self.text = text; self.listIndex = listIndex }
  }

  public static let maxRules = 20
  public static let maxCharacters = 1_000
  /** Under a full list's composer (`Ys`). */
  public static let limitNote = "max \(maxRules) rules"

  public var isEnabled: Bool
  public var allow: [String]
  public var ask: [String]

  public init(isEnabled: Bool = true, allow: [String] = [], ask: [String] = []) { self.isEnabled = isEnabled; self.allow = allow; self.ask = ask }

  /** From the host's settings; Auto-review on with no rules when there are none (`BMt`). */
  public init(json: JSON?) {
    isEnabled = json?["isEnabled"]?.bool ?? true
    allow = json?["allowInstructions"]?.array?.compactMap(\.string) ?? []
    ask = json?["blockInstructions"]?.array?.compactMap(\.string) ?? []
  }

  public var json: JSON { ["isEnabled": .bool(isEnabled), "allowInstructions": JSON(allow), "blockInstructions": JSON(ask)] }

  public static func label(_ behavior: Behavior) -> String { behavior == .allow ? "Allow automatically" : "Ask first" }

  public func list(_ behavior: Behavior) -> [String] { behavior == .allow ? allow : ask }

  public func with(_ behavior: Behavior, _ list: [String]) -> AutoReviewInstructions {
    var next = self
    if behavior == .allow { next.allow = list } else { next.ask = list }
    return next
  }

  /** The table's rows: the allowed ones, then the ask-first ones (`Hs`). */
  public var rules: [Rule] {
    allow.enumerated().map { Rule(behavior: .allow, text: $0.element, listIndex: $0.offset) }
      + ask.enumerated().map { Rule(behavior: .ask, text: $0.element, listIndex: $0.offset) }
  }

  public static func isFull(_ list: [String]) -> Bool { list.count >= maxRules }

  public func removing(_ rule: Rule) -> AutoReviewInstructions {
    with(rule.behavior, list(rule.behavior).enumerated().filter { $0.offset != rule.listIndex }.map(\.element))
  }

  /** The rule being edited, found again after the lists changed (`Ks`); nil once it is gone. */
  public func relocate(_ rule: Rule) -> Rule? {
    guard let index = list(rule.behavior).firstIndex(of: rule.text) else { return nil }
    return index == rule.listIndex ? rule : Rule(behavior: rule.behavior, text: rule.text, listIndex: index)
  }

  /** A rule added, or `editing` saved with these words and this list; nil when it may not be (`Ce`). */
  public func saving(_ text: String, as behavior: Behavior, editing: Rule?) -> AutoReviewInstructions? {
    let target = list(behavior)
    let sameList = editing?.behavior == behavior
    if target.enumerated().contains(where: { $0.element == text && !(sameList && $0.offset == editing?.listIndex) }) { return nil }
    guard let editing else { return Self.isFull(target) ? nil : with(behavior, target + [text]) }
    if sameList {
      var next = target
      if next.indices.contains(editing.listIndex) { next[editing.listIndex] = text } else { next.append(text) }
      return with(behavior, next)
    }
    if Self.isFull(target) { return nil }
    let without = removing(editing)
    return without.with(behavior, without.list(behavior) + [text])
  }

  /** A draft as the composer keeps it: cut at a thousand characters. */
  public static func clip(_ draft: String) -> String { draft.count <= maxCharacters ? draft : String(draft.prefix(maxCharacters)) }
}

/**
 * The usage summary the Electron app builds from the server's quota
 * (`usageSummaryFromSimeonQuota` in electron-main/account/account-profile.ts):
 * the share of the plan's window used and when it resets, whether this is a
 * trial and whether it can be cancelled, the on-demand spend, the upgrade
 * button and the Manage Plan card.
 */
public struct UsageSummary: Equatable, Sendable {
  public struct OnDemand: Equatable, Sendable {
    public let usedCents: Double
    public let limitCents: Double?
    public let resetMs: Double?
  }

  /** The upgrade button: its words and the page it opens. */
  public struct UpgradeButton: Equatable, Sendable {
    public let label: String
    public let url: URL
  }

  /** The plan on Stripe, for the Manage Plan card (`managePlanOfQuota`). */
  public struct ManagePlan: Equatable, Sendable {
    public struct NextTier: Equatable, Sendable { public let tier: String; public let label: String }
    public let planName: String
    public let tier: String
    public let status: String
    public let periodEndMs: Double?
    public let nextTier: NextTier?

    /** The card's line (the patch's `line`): when the trial ends or the usage resets, and "Upgrade for more usage." when there is a plan above. */
    public func line(locale: Locale = .current, timeZone: TimeZone = .current) -> String {
      var when: String?
      if let periodEndMs {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("MMMd")
        when = formatter.string(from: Date(timeIntervalSince1970: periodEndMs / 1000))
      }
      let head = status == "trialing" ? (when.map { "Your trial ends on \($0)." } ?? "Your trial is running.") : (when.map { "Usage resets on \($0)." } ?? "")
      return (head + (nextTier != nil ? " Upgrade for more usage." : "")).trimmingCharacters(in: .whitespaces)
    }
  }

  public let isEnterprise: Bool
  public let usagePercent: Double?
  public let resetMs: Double?
  public let hasAvailableUsage: Bool
  public let isTrial: Bool
  public let hasEndedTrial: Bool
  public let hasNonZeroIncludedLimit: Bool
  public let canCancelTrial: Bool
  public let onDemand: OnDemand?
  public let upgrade: UpgradeButton?
  public let managePlan: ManagePlan?

  private static let nextTiers: [String: ManagePlan.NextTier?] = ["standard": .init(tier: "pro", label: "Pro"), "pro": .init(tier: "max", label: "Max"), "max": nil]

  public init(quota: JSON, now: Date = Date()) {
    let limit = Self.finite(quota["creditsLimit"])
    let used = Self.finite(quota["creditsUsed"])
    let periodEnd = Self.milliseconds(quota["periodEnd"])
    var percent: Double?
    var included = false
    if let limit, let used {
      included = limit > 0
      percent = included ? max(0, min(100, used / limit * 100)) : 0
    }
    var spend: (used: Double, limit: Double)?
    if let raw = quota["onDemand"], let spentCents = Self.finite(raw["usedCents"]), let limitCents = Self.finite(raw["limitCents"]), limitCents > 0 {
      spend = (spentCents, limitCents)
    }
    let remaining = Self.finite(quota["creditsRemaining"])
    let status = quota["subscriptionStatus"]?.string
    let trialing = status == "trialing"
    let trialEnd = Self.milliseconds(quota["trialEndsAt"])
    isEnterprise = false
    usagePercent = percent
    resetMs = percent == nil ? nil : periodEnd
    hasAvailableUsage = remaining.map { $0 > 0 } ?? (percent.map { $0 < 100 } ?? false)
    isTrial = trialing
    hasEndedTrial = !trialing && trialEnd != nil && trialEnd! <= now.timeIntervalSince1970 * 1000
    hasNonZeroIncludedLimit = included
    canCancelTrial = trialing && quota["trialCancelable"]?.bool == true
    onDemand = spend.map { OnDemand(usedCents: $0.used, limitCents: $0.limit, resetMs: percent == nil ? nil : periodEnd) }
    upgrade = Self.upgrade(quota)
    managePlan = Self.plan(quota)
  }

  private static func upgrade(_ quota: JSON) -> UpgradeButton? {
    guard let text = quota["upgradeUrl"]?.text, let url = URL(string: text), let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme), url.host?.isEmpty == false else { return nil }
    let status = quota["subscriptionStatus"]?.string
    return UpgradeButton(label: status == "none" || status == "trialing" ? "Choose a plan" : "Get more usage", url: url)
  }

  private static func plan(_ quota: JSON) -> ManagePlan? {
    let tier = quota["tier"]?.string ?? ""
    let status = quota["subscriptionStatus"]?.string ?? ""
    guard let next = nextTiers[tier], ["trialing", "active", "past_due"].contains(status) else { return nil }
    return ManagePlan(planName: quota["planName"]?.text ?? tier, tier: tier, status: status, periodEndMs: milliseconds(quota["periodEnd"]), nextTier: next)
  }

  static func finite(_ value: JSON?) -> Double? {
    guard let number = value?.double, number.isFinite else { return nil }
    return number
  }

  /** `Date.parse` of an ISO time, in milliseconds; nil for nothing, "" or a time before 1970. */
  static func milliseconds(_ value: JSON?) -> Double? {
    guard let text = value?.text else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text) else { return nil }
    let ms = (date.timeIntervalSince1970 * 1000).rounded()
    return ms > 0 ? ms : nil
  }
}

/**
 * Usage & Billing's meters as the window draws them (`NKn`, `yDn`): "Weekly
 * usage" or "Trial usage" with its share and when it resets (or ends), the
 * on-demand spend, and the upgrade card's line.
 */
public struct UsageMeters: Equatable, Sendable {
  public struct Meter: Equatable, Sendable {
    public let valueLabel: String
    public let barPercent: Double?
    public let resetLabel: String?
  }

  public static let onDemandTitle = "On-demand usage"
  public static let noIncludedUsage = "No included usage available on your plan right now."

  public let weekly: Meter?
  public let includedUsageTitle: String
  public let onDemand: Meter?
  public let upgrade: UsageSummary.UpgradeButton?
  public let upgradeSupportingText: String?
  public let canCancelTrial: Bool

  public init(_ summary: UsageSummary, now: Date = Date()) {
    let nowMs = now.timeIntervalSince1970 * 1000
    if let percent = summary.usagePercent {
      let reset = summary.isTrial
        ? Self.countdown(summary.resetMs, now: nowMs, verb: "Ends")
        : Self.countdown(summary.resetMs, now: nowMs, verb: "Resets") ?? (summary.hasNonZeroIncludedLimit ? "Resets in 7 days" : nil)
      weekly = Meter(valueLabel: Self.percent(percent), barPercent: max(0, min(100, percent)), resetLabel: reset)
    } else {
      weekly = nil
    }
    if let spend = summary.onDemand {
      let reset = Self.countdown(spend.resetMs, now: nowMs, verb: "Resets")
      if let limit = spend.limitCents {
        onDemand = Meter(valueLabel: "\(Self.money(spend.usedCents)) / \(Self.money(limit))", barPercent: max(0, min(100, spend.usedCents / limit * 100)), resetLabel: reset)
      } else {
        onDemand = Meter(valueLabel: Self.money(spend.usedCents), barPercent: nil, resetLabel: reset)
      }
    } else {
      onDemand = nil
    }
    includedUsageTitle = summary.isTrial ? "Trial usage" : "Weekly usage"
    upgrade = summary.upgrade
    upgradeSupportingText = Self.supportingText(summary)
    canCancelTrial = summary.isTrial && summary.canCancelTrial
  }

  private static func supportingText(_ summary: UsageSummary) -> String? {
    guard summary.upgrade != nil else { return nil }
    if !summary.hasNonZeroIncludedLimit && summary.hasAvailableUsage, let percent = summary.usagePercent, percent < 100 { return "Get more Simeon usage" }
    if summary.isTrial { return "You’ve used all of your trial usage" }
    if summary.hasEndedTrial { return "Your trial has ended. Upgrade to continue using Simeon." }
    return nil
  }

  /** "Resets today", "Resets in 1 day", "Ends in 3 days" (`jct`): whole days, rounded up. */
  public static func countdown(_ resetMs: Double?, now: Double, verb: String) -> String? {
    guard let resetMs, resetMs.isFinite else { return nil }
    let left = resetMs - now
    if left <= 0 { return "\(verb) today" }
    let days = Int((left / 86_400_000).rounded(.up))
    return days == 1 ? "\(verb) in 1 day" : "\(verb) in \(days) days"
  }

  /** "42%", "1%" for anything above nothing and under one (`qct`). */
  public static func percent(_ value: Double) -> String {
    guard value.isFinite else { return "0%" }
    let clamped = max(0, min(100, value))
    if clamped > 0 && clamped < 1 { return "1%" }
    return "\(Int(clamped.rounded(.toNearestOrAwayFromZero)))%"
  }

  /** Cents as dollars, "$12" or "$12.34" (`Xve`). */
  public static func money(_ cents: Double) -> String {
    let dollars = cents / 100
    let whole = dollars.rounded(.towardZero) == dollars
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .currency
    formatter.currencyCode = "USD"
    formatter.minimumFractionDigits = whole ? 0 : 2
    formatter.maximumFractionDigits = 2
    formatter.roundingMode = .halfUp
    return formatter.string(from: NSNumber(value: dollars)) ?? "$\(dollars)"
  }
}

/** What Usage & Billing has to show (`usageSummary`'s states): nothing yet, reading, the summary, or a failure over the last one. */
public enum UsageLoad: Equatable, Sendable {
  case empty
  case loading(previous: UsageSummary?)
  case ready(UsageSummary)
  case failed(previous: UsageSummary?)

  /** The summary to draw: the one read, or the last one while reading again or after a failure. */
  public var summary: UsageSummary? {
    switch self {
    case .empty: return nil
    case .ready(let summary): return summary
    case .loading(let previous), .failed(let previous): return previous
    }
  }

  /** Whether Settings lists Usage & Billing (`kDn`): once a summary is in, and not for an enterprise team. */
  public var showsSection: Bool { summary.map { !$0.isEnterprise } ?? false }

  public var isLoading: Bool { if case .loading = self { return true }; return false }
  public var isFailed: Bool { if case .failed = self { return true }; return false }
}

/** Settings' Timezone menu (`la`): "Auto-detect (Zone)", the chosen zone if it is not listed, then every zone, "_" read as a space. */
public enum TimeZoneChoices {
  public static let automatic = "auto"

  public static func label(_ zone: String) -> String { zone.replacingOccurrences(of: "_", with: " ") }

  public static func automaticLabel(detected: String?) -> String {
    detected.map { "Auto-detect (\(label($0)))" } ?? "Auto-detect"
  }

  /** The menu's values in order: `automatic`, the override when it is not a known zone, then the known zones. */
  public static func values(override: String?, known: [String]) -> [String] {
    var values = [automatic]
    if let override, !known.contains(override) { values.append(override) }
    return values + known
  }
}
