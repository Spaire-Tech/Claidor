import SwiftUI
import UIKit
import SimeonCore

extension Color {
  init(_ rgb: RGB) { self.init(.sRGB, red: rgb.r, green: rgb.g, blue: rgb.b, opacity: rgb.a) }

  /** One colour for light, one for dark, resolved by iOS as the appearance changes. */
  static func dynamic(light: String, dark: String) -> Color {
    Color(uiColor: UIColor { traits in
      let rgb = RGB(hex: traits.userInterfaceStyle == .dark ? dark : light)
      return UIColor(red: rgb.r, green: rgb.g, blue: rgb.b, alpha: rgb.a)
    })
  }
}

/**
 * The window's own colours (its `--sand-*` tokens, light and dark), so the
 * native app reads as the same Simeon. Apple's parts (bars, sheets, menus,
 * glass) bring their own.
 */
enum Ink {
  /** The chat's ground (`--sand-bg-base`). */
  static let ground = Color.dynamic(light: "#fcfcfc", dark: "#070707")
  /** The list's ground (`--sand-bg-subtle`, the Mac's sidebar). */
  static let listGround = Color.dynamic(light: "#f7f7f7", dark: "#111111")
  static let primary = Color.dynamic(light: "#141414", dark: "#f2f2f2")
  static let secondary = Color.dynamic(light: "#14141499", dark: "#f2f2f299")
  static let tertiary = Color.dynamic(light: "#14141466", dark: "#f2f2f266")
  static let hairline = Color.dynamic(light: "#14141426", dark: "#f2f2f226")
  /** Your bubble (`--sand-fill-bubble-user`). */
  static let bubbleMine = Color.dynamic(light: "#255a93", dark: "#1f5087")
  /** An agent's bubble (`--sand-fill-bubble-agent`). */
  static let bubbleTheirs = Color.dynamic(light: "#e9e9eb", dark: "#262626")
  /** An agent's title in the list ("Chief of Staff"). */
  static let title = Color.dynamic(light: "#255a93", dark: "#5090e2")
  static let unread = Color.dynamic(light: "#0a84ff", dark: "#0a84ff")
  /** A call in progress, on the list (`--sand-fill-success`). */
  static let live = Color(RGB(hex: "#00c972"))
  static let danger = Color.dynamic(light: "#c21d2e", dark: "#ff5667")
  /** The Mac's call banner: the card, the red End, the orange of a muted mic. */
  static let callCard = Color.dynamic(light: "#ffffff", dark: "#2a2a2d")
  static let callEnd = Color(RGB(hex: "#ff3b30"))
  static let callMuted = Color(RGB(hex: "#ff9f0a"))
}

/** The brands the agents name in bold, in their own colours, as the window draws them. */
enum Brand {
  static let colours: [String: (light: String, dark: String)] = [
    "Linear": ("#5e6ad2", "#8b93f0"),
    "Gmail": ("#d93025", "#f2675c"),
    "Stripe": ("#635bff", "#8f88ff"),
    "QuickBooks": ("#2ca01c", "#4cc23a"),
    "Google Calendar": ("#1a73e8", "#5a9bf2"),
    "HubSpot": ("#ff7a59", "#ff9a80"),
    "Salesforce": ("#00a1e0", "#3dbcf0"),
    "Intercom": ("#1f8ded", "#55a9f2"),
  ]

  static func colour(_ name: String) -> Color? {
    colours[name].map { Color.dynamic(light: $0.light, dark: $0.dark) }
  }
}

/**
 * An agent's message as rich text: Markdown's bold and italics, a brand in
 * its colour, and a teammate's name in their butterfly's colour.
 */
func richText(_ markdown: String, agents: [Agent], dark: Bool) -> AttributedString {
  var text = (try? AttributedString(markdown: markdown, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(markdown)
  let bold = text.runs.compactMap { run -> Range<AttributedString.Index>? in
    guard let intent = run.inlinePresentationIntent, intent.contains(.stronglyEmphasized) else { return nil }
    return run.range
  }
  for range in bold {
    if let colour = Brand.colour(String(text[range].characters)) { text[range].foregroundColor = colour }
  }
  for agent in agents where !agent.isGroup && agent.name.count > 1 {
    var searchStart = text.startIndex
    while let range = text[searchStart...].range(of: agent.name) {
      let before: Character = range.lowerBound > text.startIndex ? text.characters[text.characters.index(before: range.lowerBound)] : " "
      let after: Character = range.upperBound < text.endIndex ? text.characters[range.upperBound] : " "
      if !before.isLetter && !after.isLetter {
        text[range].foregroundColor = Color(agent.palette.nameColour(dark: dark))
        text[range].inlinePresentationIntent = .stronglyEmphasized
      }
      searchStart = range.upperBound
    }
  }
  return text
}
