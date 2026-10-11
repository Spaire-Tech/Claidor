import AppKit
import SwiftUI

/**
 * The window's frame as the Electron app makes it on a Mac
 * (`desktop/source/electron-main/window-chrome.ts`): a standard window with
 * no title, the page under a see-through title bar, the traffic lights at
 * 16 × 15 from the top left (`MAC_TRAFFIC_LIGHT_POSITION`), and at least
 * 512 × 520 (`SAND_MIN_WINDOW_SIZE`). Its first size, 1040 × 760, and
 * keeping its size and place between launches are the scene's
 * (`SimeonMacApp`).
 */
@MainActor
enum WindowChrome {
  static let trafficLights = CGPoint(x: 16, y: 15)
  static let minimum = NSSize(width: 512, height: 520)
  static let firstSize = NSSize(width: 1040, height: 760)

  static func configure(_ window: NSWindow) {
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.styleMask.insert(.fullSizeContentView)
    window.tabbingMode = .disallowed
    window.contentMinSize = minimum
    window.isMovableByWindowBackground = false
    placeTrafficLights(window)
    // macOS lays the buttons out again as the window changes; put them back each time, as Electron does.
    let center = NotificationCenter.default
    for name in [NSWindow.didResizeNotification, NSWindow.didEndLiveResizeNotification, NSWindow.didExitFullScreenNotification, NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification] {
      center.addObserver(forName: name, object: window, queue: .main) { [weak window] _ in
        MainActor.assumeIsolated {
          if let window { WindowChrome.placeTrafficLights(window) }
        }
      }
    }
  }

  /**
   * Electron's `trafficLightPosition` (`RedrawTrafficLights`): the buttons'
   * container as tall as a button plus twice the y, the buttons centred in
   * it, the first at x, the others as far apart as macOS spaces them.
   */
  static func placeTrafficLights(_ window: NSWindow) {
    guard !window.styleMask.contains(.fullScreen),
      let close = window.standardWindowButton(.closeButton),
      let minimize = window.standardWindowButton(.miniaturizeButton),
      let zoom = window.standardWindowButton(.zoomButton),
      let titlebar = close.superview,
      let container = titlebar.superview
    else { return }
    let buttonHeight = close.frame.height
    let height = buttonHeight + 2 * trafficLights.y
    var frame = container.frame
    frame.size.height = height
    frame.origin.y = window.frame.height - height
    container.frame = frame
    let space = minimize.frame.minX - close.frame.minX
    for (index, button) in [close, minimize, zoom].enumerated() {
      button.setFrameOrigin(NSPoint(x: trafficLights.x + CGFloat(index) * space, y: (height - buttonHeight) / 2))
    }
  }
}

/**
 * The whole window's zoom (`host-window-chords.ts`, decision 4): ⌘= or ⌘+
 * in, ⌘- out, ⌘0 back, 0.1 a step between 50% and 300%, caught before
 * anything in the window (a field too; not with ⌥). Like Chromium's page
 * zoom the window is laid out at its size over the factor and drawn at
 * the factor (the content view's bounds), so at 150% a 1040-wide window
 * folds the sidebar to its rail. The traffic lights stay as they are. Not
 * kept across launches.
 */
@MainActor
enum WindowZoom {
  private(set) static var factor = 1.0

  /** A zoom key, or nil. */
  static func step(for event: NSEvent) -> Double? {
    let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
    guard mods.contains(.command), !mods.contains(.option), !mods.contains(.control) else { return nil }
    switch event.charactersIgnoringModifiers {
    case "=", "+": return 0.1
    case "-": return -0.1
    case "0": return mods == .command ? 0 : nil
    default: return nil
    }
  }

  static func apply(_ step: Double, to window: NSWindow) {
    let next = step == 0 ? 1.0 : ((factor + step) * 100).rounded() / 100
    factor = min(3.0, max(0.5, next))
    fit(window)
  }

  /** The content laid out at its size over the factor, drawn at the factor. */
  static func fit(_ window: NSWindow) {
    guard let content = window.contentView else { return }
    let size = content.frame.size
    let bounds = NSSize(width: size.width / factor, height: size.height / factor)
    if content.bounds.size != bounds { content.setBoundsSize(bounds) }
  }
}

/** Reaches the window a view is in, once, to set its frame up. */
struct WindowAccessor: NSViewRepresentable {
  func makeNSView(context: Context) -> NSView { WindowWatchingView() }
  func updateNSView(_ view: NSView, context: Context) {}

  final class WindowWatchingView: NSView {
    private weak var configured: NSWindow?
    nonisolated(unsafe) private var zoomKeys: Any?
    nonisolated(unsafe) private var resized: NSObjectProtocol?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      guard let window, window !== configured else { return }
      configured = window
      WindowChrome.configure(window)
      // Once SwiftUI has laid the title bar out.
      Task { @MainActor [weak window] in
        if let window { WindowChrome.placeTrafficLights(window) }
      }
      // The app's services follow this window (step 14): notifications, the Dock, what the computer counts as read.
      MacServices.shared.mainWindow = window
      // ⌘= ⌘- ⌘0 (step 14), before anything in the window takes them.
      if let zoomKeys { NSEvent.removeMonitor(zoomKeys) }
      zoomKeys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, let window = self.window, event.window === window, let step = WindowZoom.step(for: event) else { return false }
          WindowZoom.apply(step, to: window)
          return true
        }
        return took ? nil : event
      }
      if let resized { NotificationCenter.default.removeObserver(resized) }
      resized = NotificationCenter.default.addObserver(forName: NSWindow.didResizeNotification, object: window, queue: .main) { [weak window] _ in
        MainActor.assumeIsolated {
          if let window, WindowZoom.factor != 1 { WindowZoom.fit(window) }
        }
      }
      if WindowZoom.factor != 1 { WindowZoom.fit(window) }
    }

    deinit {
      if let zoomKeys { NSEvent.removeMonitor(zoomKeys) }
      if let resized { NotificationCenter.default.removeObserver(resized) }
    }
  }
}
