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

extension View {
  /**
   * `content` just outside this view's trailing edge (its leading edge on
   * it), or outside its leading edge, level with its middle: hung from a
   * zero-size anchor on that edge, so it needs no custom alignment guide
   * (those were not honoured in an overlay on the founder's Mac, and the
   * hover bar showed inside the bubble).
   */
  func outside<Content: View>(trailing: Bool, @ViewBuilder _ content: () -> Content) -> some View {
    overlay(alignment: trailing ? .trailing : .leading) {
      Color.clear
        .frame(width: 0, height: 0)
        .overlay(alignment: trailing ? .leading : .trailing) { content() }
    }
  }

  /** `content` just above this view, as wide, its bottom `gap` over this view's top: hung from a zero-height anchor on the top edge. */
  func above<Content: View>(gap: CGFloat, @ViewBuilder _ content: () -> Content) -> some View {
    overlay(alignment: .top) {
      Color.clear
        .frame(height: 0)
        .overlay(alignment: .bottom) {
          content()
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, gap)
        }
    }
  }
}

extension PrimitiveButtonStyle where Self == HandButtonStyle {
  /** The plain button with the pointing hand. */
  static var hand: HandButtonStyle { HandButtonStyle() }
}
