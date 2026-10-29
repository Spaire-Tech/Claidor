import AppKit
import SwiftUI
import SimeonCore

/**
 * Reactions as Messages offers them (29 October 2026, the founder: "the
 * chat reaction emoji lags terribly … its also not intuitive. not apple
 * like"): a capsule in glass just above the message, at its outer corner,
 * holding the six quick reactions (the person's own on the blue, as
 * Messages marks a Tapback already given) and More emoji. It opens from the
 * hover bar's smiley and the right click's Add reaction, in place of the
 * menu that held the row. A pick shows on the message at once
 * (`AppStore.react`) and closes it; a click elsewhere, Escape, a scroll or
 * the window going to the back closes it too. A panel of its own above the
 * window, so the chat's edge never cuts it off.
 */
@MainActor
enum Tapback {
  private static var panel: NSPanel?
  private static var monitors: [Any] = []
  private static var resigned: NSObjectProtocol?
  private static var holding: (id: String, control: ChatControl)?
  /** The message whose capsule a click just closed, and when: the smiley pressed again closes it rather than opening it anew. */
  private static var closedByClick: (id: String, at: Date)?

  /** The capsule's size, with the room its shadow takes around it. */
  private static let size = NSSize(width: TapbackBar.width + 2 * TapbackBar.margin, height: TapbackBar.height + 2 * TapbackBar.margin)

  /** Opens over `bubble` (its frame in the window, bottom-left coordinates); without one, at the pointer. */
  static func show(for bubble: Bubble, agentId: String, store: AppStore, control: ChatControl, over frame: CGRect?) {
    if let closed = closedByClick, closed.id == bubble.id, Date().timeIntervalSince(closed.at) < 0.5 {
      closedByClick = nil
      return
    }
    close()
    guard let window = NSApp.keyWindow ?? MacServices.shared.mainWindow, let content = window.contentView else { return }
    let look = Look(NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light)
    let anchor: CGRect
    if let frame, frame != .zero {
      anchor = frame
    } else {
      let point = window.mouseLocationOutsideOfEventStream
      anchor = CGRect(x: point.x, y: point.y, width: 1, height: 1)
    }
    let bar = TapbackBar(look: look, mine: Set(bubble.myReactions)) { emoji in
      close()
      if let emoji {
        Task { await store.react(emoji, to: bubble.id, in: agentId) }
      } else {
        // More emoji: the full picker where the capsule was.
        EmojiPopover.show(look: look, mine: Set(bubble.myReactions), holding: bubble.id, control: control, under: anchor) { picked in
          Task { await store.react(picked, to: bubble.id, in: agentId) }
        }
      }
    }
    let hosting = FirstClickHostingView(rootView: bar)
    hosting.frame = NSRect(origin: .zero, size: size)
    let shown = NSPanel(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    shown.isOpaque = false
    shown.backgroundColor = .clear
    shown.hasShadow = false
    shown.isFloatingPanel = true
    shown.becomesKeyOnlyIfNeeded = true
    shown.contentView = hosting
    shown.setFrameOrigin(window.convertPoint(toScreen: origin(over: anchor, in: content.bounds, endAligned: bubble.fromPerson)))
    window.addChildWindow(shown, ordered: .above)
    panel = shown
    holding = (id: bubble.id, control: control)
    control.menuFor = bubble.id
    watch(window)
  }

  static func close() {
    for monitor in monitors { NSEvent.removeMonitor(monitor) }
    monitors = []
    if let resigned { NotificationCenter.default.removeObserver(resigned) }
    resigned = nil
    if let panel {
      panel.parent?.removeChildWindow(panel)
      panel.orderOut(nil)
    }
    panel = nil
    if let holding, holding.control.menuFor == holding.id { holding.control.menuFor = nil }
    holding = nil
  }

  /**
   * Where the capsule's panel goes (window coordinates): its bottom 2 above
   * the message's top, its outer edge 8 past the message's outer edge (the
   * left of an agent's, the right of the person's), kept inside the window;
   * under the message when there is no room above it.
   */
  static func origin(over anchor: CGRect, in bounds: CGRect, endAligned: Bool) -> CGPoint {
    let margin = TapbackBar.margin
    var x = endAligned ? anchor.maxX + 8 - TapbackBar.width - margin : anchor.minX - 8 - margin
    x = min(max(x, bounds.minX), bounds.maxX - size.width)
    var y = anchor.maxY + 2 - margin
    if y + size.height > bounds.maxY - 8 { y = anchor.minY - 2 - TapbackBar.height - margin }
    y = max(y, bounds.minY)
    return CGPoint(x: x, y: y)
  }

  private static func watch(_ window: NSWindow) {
    // A click or a scroll anywhere but the capsule closes it and still does what it does; Escape only closes it.
    let clicks = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { event in
      MainActor.assumeIsolated {
        guard event.window !== panel else { return }
        closedByClick = holding.map { (id: $0.id, at: Date()) }
        close()
      }
      return event
    }
    let keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.keyCode == 53 else { return event }
      MainActor.assumeIsolated { close() }
      return nil
    }
    let scrolls = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
      MainActor.assumeIsolated { if event.window !== panel { close() } }
      return event
    }
    monitors = [clicks, keys, scrolls].compactMap { $0 }
    resigned = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: window, queue: .main) { _ in
      MainActor.assumeIsolated { close() }
    }
  }
}

/** The capsule's view: a click on it acts at once, though its panel never takes the keys. */
private final class FirstClickHostingView<Content: View>: NSHostingView<Content> {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/**
 * The capsule: six quick reactions (`MessageMenu.quick`) in 36-point
 * circles, the emoji 22, grey under the pointer and the person's own on the
 * blue; then More emoji. It grows out of its corner with a spring.
 */
struct TapbackBar: View {
  let look: Look
  let mine: Set<String>
  let pick: (String?) -> Void
  @State private var shown = false

  static let cell: CGFloat = 36
  static let gap: CGFloat = 2
  static let inset: CGFloat = 5
  static let width = CGFloat(MessageMenu.quick.count + 1) * cell + CGFloat(MessageMenu.quick.count) * gap + 2 * inset
  static let height = cell + 2 * inset
  /** Room around the capsule for its shadow. */
  static let margin: CGFloat = 14

  var body: some View {
    HStack(spacing: Self.gap) {
      ForEach(MessageMenu.quick, id: \.self) { emoji in
        TapbackCell(emoji: emoji, chosen: mine.contains(emoji), look: look) { pick(emoji) }
      }
      TapbackMore(look: look) { pick(nil) }
    }
    .padding(Self.inset)
    .liquidGlass(in: Capsule())
    .overlay(Capsule().strokeBorder(look.ink.opacity(0.08), lineWidth: 0.5))
    .shadow(color: .black.opacity(look.dark ? 0.4 : 0.16), radius: 10, x: 0, y: 4)
    .scaleEffect(shown ? 1 : 0.8)
    .opacity(shown ? 1 : 0)
    .padding(Self.margin)
    .frame(width: Self.width + 2 * Self.margin, height: Self.height + 2 * Self.margin)
    .onAppear { withAnimation(.spring(response: 0.26, dampingFraction: 0.72)) { shown = true } }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Add reaction")
  }
}

private struct TapbackCell: View {
  let emoji: String
  let chosen: Bool
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Text(emoji)
        .font(.system(size: 22))
        .scaleEffect(hovered ? 1.15 : 1)
        .animation(.spring(response: 0.2, dampingFraction: 0.6), value: hovered)
        .frame(width: TapbackBar.cell, height: TapbackBar.cell)
        .background(Circle().fill(chosen ? look.settingsBlue : hovered ? look.rowHover : .clear))
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .onHover { hovered = $0 }
    .help(emoji)
    .accessibilityLabel(chosen ? "Remove your \(emoji) reaction" : "React with \(emoji)")
  }
}

private struct TapbackMore: View {
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "face.smiling")
        .font(.system(size: 17, weight: .regular))
        .foregroundStyle(look.inkSecondary)
        .frame(width: TapbackBar.cell, height: TapbackBar.cell)
        .background(Circle().fill(hovered ? look.rowHover : .clear))
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .onHover { hovered = $0 }
    .help(String(localized: "More emoji"))
    .accessibilityLabel(String(localized: "More emoji"))
  }
}
