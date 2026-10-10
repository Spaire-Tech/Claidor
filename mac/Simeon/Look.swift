import AppKit
import CoreText
import SwiftUI

/**
 * The Electron window's colours, light and dark, as its stylesheet computes
 * them (measured from the merged window, mac/STEPS.md). Every screen takes
 * its colours from here, so a colour is set once.
 */
struct Look {
  let dark: Bool

  init(_ scheme: ColorScheme) { dark = scheme == .dark }

  // MARK: Text (`--sand-text-primary` and its 0.6 and 0.4 shades)

  var ink: Color { dark ? Color(hex: 0xfcfcfc) : Color(hex: 0x141414) }
  var inkSecondary: Color { ink.opacity(0.6) }
  var inkTertiary: Color { ink.opacity(0.4) }

  /** The window's blue for titles and Connect apps (`--simeon-foreground`, `#8cb8e8` on dark). */
  var blue: Color { dark ? Color(hex: 0x8cb8e8) : Color(hex: 0x255a93) }
  /** Connect apps under the pointer. */
  var blueHover: Color { dark ? Color(hex: 0xa9ccf0) : Color(hex: 0x1b4a7d) }
  /** A link's blue (Reopen link). */
  var link: Color { dark ? Color(hex: 0x459ffe) : Color(hex: 0x0c64c1) }

  // MARK: Grounds

  /** The chat's ground and the sign-in screens' (`--sand-bg-base`). */
  var ground: Color { dark ? Color(hex: 0x070707) : Color(hex: 0xfcfcfc) }
  /** The sidebar's paint over the Mac's sidebar material: `--simeon-bg-chrome` at 93%. */
  var sidebarPaint: Color { (dark ? Color(hex: 0x111111) : Color(hex: 0xf7f7f7)).opacity(0.93) }
  /** The sidebar's right edge: the text colour at 10%, half a point. */
  var sidebarEdge: Color { ink.opacity(0.10) }

  // MARK: The sidebar's rows

  /** The open agent's row: white with a hairline and a soft shadow (dark: white at 12%). */
  var rowSelected: Color { dark ? Color.white.opacity(0.12) : Color.white }
  var rowSelectedHairline: Color { dark ? Color.white.opacity(0.08) : Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.07) }
  var rowSelectedShadow: Color { dark ? Color.black.opacity(0.30) : Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.04) }
  /** A row under the pointer (`--simeon-bg-hover`). */
  var rowHover: Color { Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(dark ? 0.173 : 0.09) }
  /** The row's corner radius: 14 light, 10 dark, as the window draws them. */
  var rowRadius: CGFloat { dark ? 10 : 14 }

  /** Unread (`--simeon-accent`) and working (`--simeon-green`). */
  let unread = Color(hex: 0x1084fe)
  let working = Color(hex: 0x00c972)

  // MARK: Connect apps' logo tiles

  var tile: Color { dark ? Color(hex: 0x2c2c2e) : Color.white }
  var tileHairline: Color { dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08) }
  var tileShadow: Color { dark ? Color.black.opacity(0.45) : Color.black.opacity(0.10) }

  /** The account's initials. */
  var initials: Color { dark ? Color.white.opacity(0.86) : Color.black.opacity(0.72) }

  // MARK: Sign-in

  /** The Sign in button: near black on both themes, its words the light ground's colour. */
  let signInButton = Color(hex: 0x121212)
  let signInLabel = Color(hex: 0xfcfcfc)

  // MARK: The chat (B01, B03)

  /** The person's bubbles and the send button: the window's blue (`#1f5087` on dark). */
  var yours: Color { dark ? Color(hex: 0x1f5087) : Color(hex: 0x255a93) }
  let yoursText = Color(hex: 0xfcfcfc)
  /** An agent's bubbles, files and cards: light grey with a hairline and a soft shadow (dark: `#262626`, no shadow). */
  var theirs: Color { dark ? Color(hex: 0x262626) : Color(hex: 0xe9e9eb) }
  var theirsText: Color { dark ? Color(hex: 0xfcfcfc) : Color(hex: 0x1d1d1f) }
  var theirsHairline: Color { dark ? .clear : Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.07) }
  var theirsShadow: Color { dark ? .clear : Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.04) }
  /** The chat's head over the messages: the ground at 78%, blurred. */
  var headerVeil: Color { ground.opacity(0.78) }
  /** A reaction under a bubble, ringed with the ground. */
  var reaction: Color { dark ? Color(hex: 0x151515) : Color(hex: 0xf3f3f3) }
  /** The message field's frame (`sand-prompt-shell`). */
  var composer: Color { dark ? Color(hex: 0x212121) : Color(hex: 0xfcfcfc) }
  var composerEdge: Color { dark ? Color(hex: 0x2e2e2e) : ink.opacity(0.3) }
  var placeholder: Color { ink.opacity(0.3) }
}

extension Color {
  /** An sRGB colour from its hex value, 0xRRGGBB. */
  init(hex: UInt32, opacity: Double = 1) {
    self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255, opacity: opacity)
  }
}

/** The faces the window sets: Apple's system font (the window's `-apple-system`), and Suravaram for the sign-in wordmark. */
enum Faces {
  /** "Simeon" on the sign-in screen (`Simeon Suravaram`, 68 px), from the app's own copy of the font. */
  static let wordmark = "Suravaram"

  /** Makes the wordmark's face known to the app, once, at launch. */
  static func register() {
    guard let url = Bundle.main.url(forResource: "Suravaram-Regular", withExtension: "ttf") else { return }
    CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  }
}
