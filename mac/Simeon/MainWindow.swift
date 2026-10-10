import AppKit
import SwiftUI
import SimeonCore

/** What the window shows: the open agent, kept from one launch to the next (the Electron window reopens on the agent left open). */
@MainActor
@Observable
final class WindowState {
  var selected: String? = UserDefaults.standard.string(forKey: WindowState.selectedKey) {
    didSet { UserDefaults.standard.set(selected, forKey: Self.selectedKey) }
  }

  private static let selectedKey = "simeon.window.selectedAgent"

  /** A row clicked: its agent opens (its chat read, its unread cleared). */
  func open(_ agentId: String, store: AppStore) {
    selected = agentId
    store.windowSelection = agentId
    Task { await store.open(agentId) }
  }

  /** The agent left open, or the first in the list when that one is gone. */
  func chooseFirst(_ order: [String], store: AppStore) {
    guard let first = order.first else { return }
    if let selected, order.contains(selected) {
      if store.openChat != selected { open(selected, store: store) }
      return
    }
    open(first, store: store)
  }
}

/** The app's one window: the sign-in until the person is signed in and their computer reached, then the sidebar and the chat. */
struct AppRoot: View {
  @Environment(MacSession.self) private var session

  var body: some View {
    Group {
      if session.phase == .signedIn {
        MainWindow()
      } else {
        SignInScreen()
      }
    }
    .frame(minWidth: WindowChrome.minimum.width, minHeight: WindowChrome.minimum.height)
    .background(WindowAccessor())
    .ignoresSafeArea()
  }
}

/**
 * The sidebar and the chat side by side (`sand-shell`), the sidebar's edge
 * draggable. The chat is the open agent's (`ChatPane`), drawn afresh for
 * each agent so it opens at its newest message with its own draft.
 */
struct MainWindow: View {
  @Environment(SidebarLayout.self) private var layout
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    GeometryReader { box in
      let windowWidth = box.size.width
      let rail = layout.showsRail(windowWidth: windowWidth)
      let sidebarWidth = rail ? SidebarLayout.railWidth : layout.expandedWidth
      HStack(spacing: 0) {
        Sidebar(rail: rail, width: sidebarWidth)
        Group {
          if let agentId = window.selected {
            ChatPane(agentId: agentId)
              .id(agentId)
          } else {
            ZStack(alignment: .top) {
              look.ground
              // The top of the chat moves the window, as the Electron window's title strip does.
              WindowDragArea().frame(height: 52)
            }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
      .overlay(alignment: .topLeading) {
        SidebarResizeEdge(windowWidth: windowWidth)
          .frame(height: box.size.height)
          .offset(x: sidebarWidth - 7)
      }
      .animation(SidebarLayout.motion, value: rail)
    }
    .background(KeyWatcher())
  }
}

/**
 * The window's own keys that are not in a menu (the Electron window's
 * `global-keyboard-shortcuts`): ⌘B folds and opens the sidebar. The other
 * keys come with the screens they open.
 */
private struct KeyWatcher: NSViewRepresentable {
  @Environment(SidebarLayout.self) private var layout

  func makeNSView(context: Context) -> NSView {
    let view = WatchView()
    view.layout = layout
    return view
  }

  func updateNSView(_ view: NSView, context: Context) {
    (view as? WatchView)?.layout = layout
  }

  final class WatchView: NSView {
    var layout: SidebarLayout?
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard mods == .command, event.charactersIgnoringModifiers?.lowercased() == "b" else { return event }
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window, let layout = self.layout else { return false }
          layout.toggle()
          return true
        }
        return took ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}
