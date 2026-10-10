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

  /** A message or file found by search, its chat to open at that line, lit (`revealSearchHit`); the count makes each one new. */
  struct Reveal: Equatable {
    let agentId: String
    let entryId: String
    let count: Int
  }

  var pendingReveal: Reveal?
  /** Bumped when search closes, for the open chat's message field to take the keys back. */
  static var composerFocus = 0 {
    didSet { NotificationCenter.default.post(name: WindowState.composerFocusNote, object: nil) }
  }
  static let composerFocusNote = Notification.Name("simeon.window.composerFocus")

  /** Search's message or file: its chat opens (if it is not the open one) and goes to the line. */
  func reveal(_ entryId: String, in agentId: String, store: AppStore) {
    if selected != agentId { open(agentId, store: store) }
    pendingReveal = Reveal(agentId: agentId, entryId: entryId, count: (pendingReveal?.count ?? 0) + 1)
  }

  /** A row clicked: its agent opens (its chat read, its unread cleared). */
  func open(_ agentId: String, store: AppStore) {
    selected = agentId
    store.windowSelection = agentId
    Task { await store.open(agentId) }
  }

  /**
   * The agent left open while it is there (hidden from the sidebar or in a
   * folded section too), else the first in the list.
   */
  func chooseFirst(_ order: [String], store: AppStore) {
    if let selected, store.agents.contains(where: { $0.id == selected }) {
      if store.openChat != selected { open(selected, store: store) }
      return
    }
    guard let first = order.first else { return }
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
    // A file, a picture or a diagram opened full screen, over the sidebar and the chat.
    .overlay { ViewerLayer() }
    // Search (⌘K), over everything.
    .overlay { SearchLayer() }
    .background(KeyWatcher())
  }
}

/**
 * The window's own keys that are not in a menu (the Electron window's
 * `global-keyboard-shortcuts`): ⌘B folds and opens the sidebar; ⌘K opens and
 * closes search, ⌘⇧F opens it, and while it is open its keys are its own
 * (SearchPanel.swift). With rows
 * picked, Escape lets them go and Delete (or Backspace) deletes them, after
 * the confirmation, unless a field has the keys. Control-Tab and
 * Control-Shift-Tab walk the sidebar's rows; letting go of Control opens the
 * row walked to, Escape or leaving the window calls it off. The other
 * keys come with the screens they open.
 */
private struct KeyWatcher: NSViewRepresentable {
  @Environment(SidebarLayout.self) private var layout
  @Environment(SidebarState.self) private var sidebar
  @Environment(WindowState.self) private var windowState
  @Environment(AppStore.self) private var store
  @Environment(SearchState.self) private var search

  func makeNSView(context: Context) -> NSView {
    let view = WatchView()
    update(view)
    return view
  }

  func updateNSView(_ view: NSView, context: Context) {
    if let view = view as? WatchView { update(view) }
  }

  private func update(_ view: WatchView) {
    view.layout = layout
    view.sidebar = sidebar
    view.windowState = windowState
    view.store = store
    view.search = search
  }

  final class WatchView: NSView {
    var layout: SidebarLayout?
    var sidebar: SidebarState?
    var windowState: WindowState?
    var store: AppStore?
    var search: SearchState?
    nonisolated(unsafe) private var monitors: [Any] = []
    nonisolated(unsafe) private var resigned: NSObjectProtocol?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      stop()
      guard let window else { return }
      let keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window else { return false }
          return self.key(event)
        }
        return took ? nil : event
      }
      let flags = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
        MainActor.assumeIsolated {
          guard let self, event.window === self.window else { return }
          self.flags(event)
        }
        return event
      }
      monitors = [keys, flags].compactMap { $0 }
      resigned = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: window, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.sidebar?.cycle = nil }
      }
    }

    /** One key pressed; true when it was the window's. */
    private func key(_ event: NSEvent) -> Bool {
      // Caps Lock aside.
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      if mods == .command, event.charactersIgnoringModifiers?.lowercased() == "b" {
        layout?.toggle()
        return true
      }
      guard let sidebar, let windowState, let store else { return false }
      if let search {
        let key = event.charactersIgnoringModifiers?.lowercased()
        // ⌘K (`sand.commandPalette`, `mod+k`) and ⌘⇧F (`sand.focusSearch`, `mod+shift+f`).
        if mods == .command, key == "k" {
          search.toggle(store: store, window: windowState)
          return true
        }
        if mods == [.command, .shift], key == "f" {
          if !search.isOpen { search.open(store: store, window: windowState) }
          return true
        }
        if search.isOpen {
          // Letters still being composed (Japanese, Chinese) are the field's: Return, the arrows and Escape act on them.
          if let text = window?.firstResponder as? NSTextView, text.hasMarkedText() { return false }
          return search.key(event, store: store, window: windowState, sidebar: sidebar)
        }
      }
      switch event.keyCode {
      case 48 where mods.subtracting(.shift) == .control:
        // Control-Tab, Control-Shift-Tab.
        sidebar.step(mods.contains(.shift) ? -1 : 1, order: sidebar.order(store), current: windowState.selected)
        return true
      case 53 where mods.isEmpty:
        // Escape: Control-Tab's walk first, then the picked rows, unless a field has the keys (its own Escape).
        if sidebar.cycle != nil {
          sidebar.cycle = nil
          return true
        }
        guard !sidebar.selection.isEmpty, sidebar.renamingAgent == nil, sidebar.renamingSection == nil,
              !(window?.firstResponder is NSText) else { return false }
        sidebar.selection.clear()
        return true
      case 51 where mods.isEmpty, 117 where mods.isEmpty:
        // Delete and forward delete, unless a field has the keys.
        guard !sidebar.selection.isEmpty, !(window?.firstResponder is NSText) else { return false }
        SidebarActions.confirmDelete(Array(sidebar.selection.ids), store: store, sidebar: sidebar)
        return true
      default:
        return false
      }
    }

    /** Control let go: Control-Tab's row opens. */
    private func flags(_ event: NSEvent) {
      if let search, search.isOpen { search.flags(event) }
      guard !event.modifierFlags.contains(.control), let sidebar, let cycle = sidebar.cycle, let windowState, let store else { return }
      sidebar.cycle = nil
      sidebar.selection.plain(cycle.next)
      windowState.open(cycle.next, store: store)
    }

    private func stop() {
      for monitor in monitors { NSEvent.removeMonitor(monitor) }
      monitors = []
      if let resigned { NotificationCenter.default.removeObserver(resigned) }
      resigned = nil
    }

    deinit {
      for monitor in monitors { NSEvent.removeMonitor(monitor) }
      if let resigned { NotificationCenter.default.removeObserver(resigned) }
    }
  }
}
