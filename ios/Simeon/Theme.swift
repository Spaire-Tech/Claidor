import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

extension Color {
  init(_ rgb: RGB) { self.init(.sRGB, red: rgb.r, green: rgb.g, blue: rgb.b, opacity: rgb.a) }

  /** One colour for light, one for dark, resolved by iOS as the appearance changes. */
  static func dynamic(light: String, dark: String) -> Color {
    Color(uiColor: UIColor.dynamic(light: light, dark: dark))
  }
}

extension UIColor {
  convenience init(hex: String) {
    let rgb = RGB(hex: hex)
    self.init(red: rgb.r, green: rgb.g, blue: rgb.b, alpha: rgb.a)
  }

  /** Both read once: the colour is resolved on every draw, and parsing its text each time showed up while scrolling. */
  static func dynamic(light: String, dark: String) -> UIColor {
    let lit = UIColor(hex: light), dim = UIColor(hex: dark)
    #if os(iOS)
    return UIColor { traits in traits.userInterfaceStyle == .dark ? dim : lit }
    #else
    // The Mac: resolved by the appearance it is drawn in (the window's, or the one the app is set to).
    return NSColor(name: nil) { appearance in appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dim : lit }
    #endif
  }
}

/**
 * The window's own colours, measured from the phone design as the founder
 * approved it (the web window at 393 pt, 8 October 2026), light and dark,
 * so the native app reads as the same Simeon. Apple's parts (sheets, menus,
 * glass) bring their own.
 */
enum Ink {
  /** The chat's ground (`--sand-bg-base`). */
  static let ground = Color.dynamic(light: "#fcfcfc", dark: "#070707")
  /** The list's ground (`--sand-bg-subtle`, the Mac's sidebar). */
  static let listGround = Color.dynamic(light: "#f7f7f7", dark: "#111111")
  static let primary = Color.dynamic(light: "#141414", dark: "#fcfcfc")
  static let secondary = Color.dynamic(light: "#14141499", dark: "#fcfcfc99")
  static let tertiary = Color.dynamic(light: "#14141466", dark: "#fcfcfc66")
  static let hairline = Color.dynamic(light: "#1414141a", dark: "#fcfcfc1a")
  /** A field's or a button's edge (`--sand-border-default`). */
  static let edge = Color.dynamic(light: "#14141426", dark: "#2e2e2e")
  /** Your bubble (`--sand-fill-bubble-user`). */
  static let bubbleMine = Color.dynamic(light: "#255a93", dark: "#1f5087")
  static let mineText = Color.dynamic(light: "#fcfcfc", dark: "#fcfcfc")
  /** An agent's bubble and every card: the Messages grey (`AGENT_BUBBLE_LIGHT`). */
  static let bubbleTheirs = Color.dynamic(light: "#e9e9eb", dark: "#262626")
  static let theirsText = Color.dynamic(light: "#1d1d1f", dark: "#fcfcfc")
  /** A field inside a card, the email's body, the code block. */
  static let field = Color.dynamic(light: "#fcfcfc", dark: "#1a1a1a")
  /** A quiet pill or button inside a card (`rgba(119,119,119,.063)`). */
  static let pill = Color.dynamic(light: "#77777710", dark: "#ffffff14")
  /** The controls drawn flat in dark (`--simeon-dark-control`). */
  static let control = Color.dynamic(light: "#ffffff", dark: "#212121")
  /** The chat's blue on buttons and checks; one step brighter on dark (`SWITCH_BLUE_DARK`). */
  static let blue = Color.dynamic(light: "#255a93", dark: "#2f6db0")
  /** The call button's glyph (`.simeon-call-button`). */
  static let callGlyph = Color.dynamic(light: "#255a93", dark: "#8cb8e8")
  static let link = Color.dynamic(light: "#0c64c1", dark: "#459ffe")
  static let codeInk = Color.dynamic(light: "#c21d2e", dark: "#ff6b78")
  static let codeTint = Color.dynamic(light: "#77777717", dark: "#ffffff17")
  /** The reaction pill under a bubble. */
  static let reaction = Color.dynamic(light: "#f3f3f3", dark: "#2a2a2a")
  /** The flights card's greys (`--f-ink-2`, `--f-ink-3`). */
  static let fineGrey = Color.dynamic(light: "#86868b", dark: "#98989d")
  static let chevron = Color.dynamic(light: "#c7c7cc", dark: "#48484a")
  /**
   * An app's logo tile and an agent's avatar disc: white in light; in dark,
   * a dark tile with a faint edge, as Apple's own dark icons sit (the
   * founder, 9 October 2026: no white backgrounds in dark mode).
   */
  static let tile = Color.dynamic(light: "#ffffff", dark: "#232325")
  static let tileEdge = Color.dynamic(light: "#14141414", dark: "#ffffff1f")
  static let tileInitial = Color.dynamic(light: "#595959", dark: "#b4b4b8")
  /** A flight's total, green as Muse's (the system's green; the darker one on white, where the bright one is hard to read). */
  static let fare = Color.dynamic(light: "#248a3d", dark: "#30d158")
  /** An agent's title in the list ("Chief of Staff"). */
  static let title = Color.dynamic(light: "#255a93", dark: "#5090e2")
  static let unread = Color.dynamic(light: "#0a84ff", dark: "#0a84ff")
  /** An agent waiting on the person ("Needs attention", `--sand-fill-warning`). */
  static let attention = Color(RGB(hex: "#ff9800"))
  /** The list's swipe buttons: Pin in orange, Hide in grey, as Messages colours its own. */
  static let pinSwipe = Color(RGB(hex: "#ff9f0a"))
  static let hideSwipe = Color(RGB(hex: "#8e8e93"))
  /** A message a quote jumped to, lit a moment (the window's yellow, `--simeon-yellow`). */
  static let jumpGlow = Color(RGB(hex: "#f1b467")).opacity(0.32)
  /** The "New" line (`--sand-text-accent`). */
  static let newLine = Color.dynamic(light: "#1a73d9", dark: "#4a9bf5")
  /** A call in progress, on the list (`--sand-fill-success`). */
  static let live = Color(RGB(hex: "#00c972"))
  static let danger = Color.dynamic(light: "#c21d2e", dark: "#ff5667")
  /** The Mac's call banner: the card, the red End, the orange of a muted mic. */
  static let callCard = Color.dynamic(light: "#ffffff", dark: "#2a2a2d")
  static let callEnd = Color(RGB(hex: "#ff3b30"))
  static let callMuted = Color(RGB(hex: "#ff9f0a"))
}

/** The window's card shadow, light theme only (`0 0 0 .5px rgba(20,30,60,.07), 0 1px 2px rgba(20,30,60,.04)`). */
struct CardEdge: ViewModifier {
  var radius: CGFloat
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    if scheme == .dark {
      content
    } else {
      // The shadow is cast by a plain shape behind the card, not by the card itself: cast by the card it was worked out from the text too, on every frame of a scroll.
      content
        .background {
          RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Ink.bubbleTheirs)
            .shadow(color: Color(.sRGB, red: 20 / 255, green: 30 / 255, blue: 60 / 255, opacity: 0.04), radius: 1, y: 1)
        }
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color(.sRGB, red: 20 / 255, green: 30 / 255, blue: 60 / 255, opacity: 0.07), lineWidth: 0.5))
    }
  }
}

extension View {
  /** The Messages grey card with its faint edge: every card in the chat. */
  func card(radius: CGFloat = 16, padding: CGFloat = 12) -> some View {
    self.padding(padding)
      .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
      .modifier(CardEdge(radius: radius))
  }
}
