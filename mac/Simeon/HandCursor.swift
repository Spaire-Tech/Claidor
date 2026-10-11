import SwiftUI

/**
 * The pointing hand over everything that can be clicked, as the Electron
 * window shows it (its `cursor: pointer`): every button, switch, picker,
 * tab and clickable mark. Not while the control is disabled (the arrow
 * then), and not over a dialog's backdrop, a text field, or a place whose
 * cursor says something else (resize edges, the avatar's crop, zoom, the
 * org chart's pan).
 */
struct HandCursor: ViewModifier {
  @Environment(\.isEnabled) private var isEnabled

  func body(content: Content) -> some View {
    content.pointerStyle(isEnabled ? .link : nil)
  }
}

extension View {
  /** The pointing hand while enabled. Put it before `.disabled(…)`, so it sees it. */
  func handCursor() -> some View { modifier(HandCursor()) }
}

/**
 * The plain button with the pointing hand (`.buttonStyle(.hand)`): the
 * plain style itself, its look and press unchanged, the hand added over it
 * while the button is enabled. Every borderless button in the app uses it.
 */
struct HandButtonStyle: PrimitiveButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    Button(configuration)
      .buttonStyle(.plain)
      .handCursor()
  }
}

extension PrimitiveButtonStyle where Self == HandButtonStyle {
  /** The plain button with the pointing hand. */
  static var hand: HandButtonStyle { HandButtonStyle() }
}
