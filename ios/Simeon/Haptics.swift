import SwiftUI
import UIKit
import SimeonCore

/**
 * The phone's taps under the finger (the founder, 11 October 2026: "have the
 * apple haptic. on by default"): Apple's own feedback generators, at the
 * moments Apple's apps give one — a message held, a message sent, a reaction
 * chosen, something copied, an agent made, a call that connects or ends.
 * Settings › Haptics turns them off; the system's own (switches, swipes,
 * menus) follow the phone's setting, as in every app.
 */
enum Haptics {
  /** `@AppStorage` key; on until turned off. */
  static let key = "simeon.haptics"

  static var isOn: Bool { UserDefaults.standard.object(forKey: key) as? Bool ?? true }

  /** A light tap: a message sent, something copied. */
  static func tap() { impact(.light) }

  /** A firmer tap: a message held for its menu. */
  static func press() { impact(.medium) }

  /** A choice made: a reaction picked. */
  static func select() {
    guard isOn else { return }
    UISelectionFeedbackGenerator().selectionChanged()
  }

  /** Done: an agent made, a call connected. */
  static func success() { notify(.success) }

  /** Something went wrong. */
  static func warning() { notify(.warning) }

  private static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
    guard isOn else { return }
    UIImpactFeedbackGenerator(style: style).impactOccurred()
  }

  private static func notify(_ kind: UINotificationFeedbackGenerator.FeedbackType) {
    guard isOn else { return }
    UINotificationFeedbackGenerator().notificationOccurred(kind)
  }
}

/** A call felt as well as heard: a tap of success when it connects, a light one when it ends, a warning when it could not start. */
struct CallHaptics: ViewModifier {
  @Environment(AppStore.self) private var store

  func body(content: Content) -> some View {
    content.onChange(of: store.call?.phase) { old, new in
      if new == .live && old != .live {
        Haptics.success()
      } else if new == .ended && old != .ended {
        if store.call?.failed == true { Haptics.warning() } else if old == .live { Haptics.tap() }
      }
    }
  }
}
