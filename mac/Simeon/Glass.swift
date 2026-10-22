import SwiftUI

/**
 * Liquid Glass where the Mac has it (macOS 26 and later), and the system's
 * plainer material before it (12 October 2026). The app opens on macOS 15:
 * every glass surface goes through these, so the design is Apple's own on
 * 26 and still readable on 15.
 */
extension View {
  /** The surface's glass in `shape` (`interactive`: it answers the pointer, as the composer's attach button does); before macOS 26, the regular material in the same shape. */
  @ViewBuilder
  func liquidGlass(in shape: some Shape, interactive: Bool = false) -> some View {
    if #available(macOS 26, *) {
      glassEffect(interactive ? Glass.regular.interactive() : Glass.regular, in: shape)
    } else {
      background(.regularMaterial, in: shape)
    }
  }

  /** A main button in glass, tinted (`.glassProminent`); before macOS 26, the bordered prominent button. */
  @ViewBuilder
  func prominentGlassButton() -> some View {
    if #available(macOS 26, *) {
      buttonStyle(.glassProminent)
    } else {
      buttonStyle(.borderedProminent)
    }
  }
}

/**
 * A round button in glass, the window's own (the sidebar's Search and New
 * chat; the founder, 21 October 2026: "look at the whole mac app, and how
 * the buttons are design"): its symbol at 40% of its side, regular, in the
 * discs' ink (black at 78%, white at 86% on dark), in Apple's glass. Back,
 * close and the like on the app's panels and sheets.
 */
struct GlassDiscButton: View {
  let symbol: String
  let help: String
  var size: CGFloat = 32
  /** Its symbol in the blue (a filter that is set). */
  var tinted = false
  let action: () -> Void
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: size * 0.4, weight: .regular))
        .foregroundStyle(tinted ? Look(scheme).settingsBlue : (scheme == .dark ? Color.white.opacity(0.86) : Color.black.opacity(0.78)))
        .frame(width: size, height: size)
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .liquidGlass(in: .circle)
    .help(help)
    .accessibilityLabel(help)
  }
}
