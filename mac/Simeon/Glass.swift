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
