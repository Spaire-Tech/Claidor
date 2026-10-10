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

/** Reaches the window a view is in, once, to set its frame up. */
struct WindowAccessor: NSViewRepresentable {
  func makeNSView(context: Context) -> NSView { WindowWatchingView() }
  func updateNSView(_ view: NSView, context: Context) {}

  final class WindowWatchingView: NSView {
    private weak var configured: NSWindow?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      guard let window, window !== configured else { return }
      configured = window
      WindowChrome.configure(window)
      // Once SwiftUI has laid the title bar out.
      Task { @MainActor [weak window] in
        if let window { WindowChrome.placeTrafficLights(window) }
      }
    }
  }
}

/**
 * The Mac's sidebar material, which the Electron window lets show through
 * behind its agents' list (`vibrancy: "sidebar"`, greyed when the window is
 * not in front: `followWindow`).
 */
struct SidebarMaterial: NSViewRepresentable {
  func makeNSView(context: Context) -> NSVisualEffectView {
    let view = NSVisualEffectView()
    view.material = .sidebar
    view.blendingMode = .behindWindow
    view.state = .followsWindowActiveState
    return view
  }

  func updateNSView(_ view: NSVisualEffectView, context: Context) {}
}
