import AppKit
import SwiftUI
import SimeonCore

/**
 * Simeon on the Mac, native: a copy of the Electron Mac app (desktop/),
 * screen by screen, with Apple's own controls and the Electron window's
 * layout. What each step copies, and what is still to come, is in
 * mac/STEPS.md.
 */
@main
struct SimeonMacApp: App {
  @State private var session = MacSession()
  @State private var window = WindowState()
  @State private var layout = SidebarLayout()
  @State private var viewers = Viewers()
  @State private var sidebar = SidebarState()
  @State private var search = SearchState()
  @State private var newChat = NewChatState()

  init() {
    Faces.register()
  }

  var body: some Scene {
    WindowGroup("Simeon", id: "main") {
      AppRoot()
        .environment(session)
        .environment(session.store)
        .environment(window)
        .environment(layout)
        .environment(viewers)
        .environment(sidebar)
        .environment(search)
        .environment(newChat)
        .task { await session.start() }
        // The theme chosen with "/" (and, in step 8, Settings), as it was left.
        .onAppear { MacTheme.apply() }
        // The browser's confirm page opens `simeon-mac://…`, which brings the app forward; the poll finishes the sign-in.
        .onOpenURL { _ in }
        .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
    }
    .handlesExternalEvents(matching: ["*"])
    // The Electron window's size the first time (`window-state-store.ts`); after that macOS keeps its size and place.
    .defaultSize(width: WindowChrome.firstSize.width, height: WindowChrome.firstSize.height)
    .windowStyle(.hiddenTitleBar)
    .windowResizability(.contentMinSize)
    .commands { SimeonCommands(session: session, window: window, store: session.store) }
  }
}

/**
 * The Electron app's menus (`application-menu.ts`): Simeon (About Simeon,
 * Services, Hide Simeon, Hide Others, Show All, Quit Simeon), File (Close
 * Window), Edit (the system's), View (Reload ⌘R, Enter Full Screen), Agent
 * (Call <name>, or a disabled Call Agent with no agent open), Window (the
 * system's). No Help menu's items.
 */
struct SimeonCommands: Commands {
  let session: MacSession
  let window: WindowState
  let store: AppStore

  var body: some Commands {
    // About Simeon opens the window's About (the account step, mac/STEPS.md).
    CommandGroup(replacing: .appInfo) {
      Button("About Simeon") {}
    }
    // File holds Close Window only.
    CommandGroup(replacing: .newItem) {}
    CommandGroup(before: .toolbar) {
      Button("Reload") { session.reload() }
        .keyboardShortcut("r")
      Divider()
    }
    CommandMenu("Agent") { CallItem(window: window, store: store) }
    CommandGroup(replacing: .help) {}
  }
}

/** Agent › Call <name>: the open agent (a person, not a group), else a disabled "Call Agent". The call itself is the calls step (mac/STEPS.md). */
private struct CallItem: View {
  let window: WindowState
  let store: AppStore

  var body: some View {
    let callee = store.agents.first { $0.id == window.selected && !$0.isGroup }
    Button(callee.map { "Call \($0.name)" } ?? "Call Agent") {}
      .disabled(callee == nil)
  }
}
