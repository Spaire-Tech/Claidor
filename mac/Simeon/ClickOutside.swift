import AppKit
import SwiftUI

/**
 * A sheet that closes on a click outside it (the founder, 21 October 2026:
 * "any iframe, when you click outside the iframe, it closes. not just the x
 * button"), as the window's own panels close on a click on their dim: a
 * click on the window the sheet hangs from dismisses the sheet and goes no
 * further. The product's page, the travellers' details, the hidden chats.
 */
extension View {
  func closesOnClickOutside(_ close: @escaping () -> Void) -> some View {
    background(SheetOutsideClicks(close: close))
  }
}

private struct SheetOutsideClicks: NSViewRepresentable {
  let close: () -> Void

  func makeNSView(context: Context) -> Watcher {
    let view = Watcher()
    view.close = close
    return view
  }

  func updateNSView(_ view: Watcher, context: Context) {
    view.close = close
  }

  final class Watcher: NSView {
    var close: () -> Void = {}
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
        let outside = MainActor.assumeIsolated { () -> Bool in
          // A click on the window under the sheet: the sheet's own window and any other (a menu, a panel) keep theirs.
          guard let self, let parent = self.window?.sheetParent, event.window === parent else { return false }
          self.close()
          return true
        }
        return outside ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}
