import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * Simeon on the Mac, native (mac/README.md): the Electron app's window in
 * Apple's own parts. The agents' sidebar, the chat and the agent's page in
 * one window; Settings in the Mac's Settings window; each agent's computer
 * in a window of its own; the Electron app's menus and keys. The sign-in,
 * the first run, the chat's rows and cards, the agent's page and the call
 * are the iPhone app's own views (ios/Simeon), built into this app too.
 */
@main
struct SimeonMacApp: App {
  @State private var session = SessionController()
  @State private var navigation = MacNavigation()
  @AppStorage("simeon.theme") private var theme = "system"

  var body: some Scene {
    WindowGroup("Simeon", id: "main") {
      MacRoot()
        // The launch: the small butterfly turning until the app is ready, over everything (the iPhone's).
        .overlay { LaunchCover() }
        .environment(session)
        .environment(session.store)
        .environment(navigation)
        .onChange(of: session.launch.theme ?? theme, initial: true) { _, name in MacAppearance.apply(name) }
        .task { await session.start() }
        .task { HangWatch.start() }
        // A link to the app (back from the browser's sign-in, a connector to add) comes to this window, not a new one.
        .onOpenURL { url in navigation.open(url) }
        .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
    }
    .handlesExternalEvents(matching: ["*"])
    // The Electron window's size the first time (`window-state-store.ts`); after that the Mac keeps where it was left.
    .defaultSize(width: 1040, height: 760)
    .windowToolbarStyle(.unified)
    .commands { SimeonCommands(navigation: navigation, store: session.store) }

    // Each agent's computer, in a window of its own (the Electron window's full-size computer).
    WindowGroup("Computer", id: "computer", for: String.self) { $agentId in
      if let agentId {
        MacComputerWindow(agentId: agentId)
          .environment(session)
          .environment(session.store)
      }
    }
    .defaultSize(width: 1100, height: 760)

    // Connect apps (⇧⌘M), the Electron window's Plugins, as a window.
    Window("Connect Apps", id: "connect-apps") {
      ConnectAppsSheet()
        .environment(session)
        .environment(session.store)
        .problemAlert()
        .frame(minWidth: 560, minHeight: 520)
    }
    .defaultSize(width: 720, height: 680)

    Settings {
      MacSettings()
        .environment(session)
        .environment(session.store)
    }
  }
}

/**
 * Where the window is: the open agent, the sheet up, the agent being
 * deleted. Shared by the window and the menus, so the Agent menu acts on
 * the agent the window shows.
 */
@MainActor
@Observable
final class MacNavigation {
  enum Sheet: Identifiable, Equatable {
    case newAgent
    case newGroup
    case hiddenAgents
    case palette
    case agentPage(String, routine: String?)

    var id: String {
      switch self {
      case .newAgent: return "new-agent"
      case .newGroup: return "new-group"
      case .hiddenAgents: return "hidden"
      case .palette: return "palette"
      case .agentPage(let id, let routine): return "agent:\(id):\(routine ?? "")"
      }
    }
  }

  var selected: String?
  var sheet: Sheet?
  var deleting: Agent?
  var sidebarShown = true
  /** A connector to add from a `plugin/add` link: the window opens Connect apps for it. */
  var connectAppsAsked = false

  /** A link to the app, read by the Electron app's own rules (SimeonMacCore `DeepLink`). */
  func open(_ url: URL) {
    guard let link = DeepLink.parse(url.absoluteString, schemes: [SimeonConfig.macURLScheme]) else { return }
    switch link.route {
    case .open, .info:
      // Bringing the window forward is all `open` asks; macOS has done it.
      break
    case .pluginAdd:
      connectAppsAsked = true
    }
  }

  /** The sidebar's order: the pinned agents, then the list (SimeonMacCore `SidebarOrder`). */
  func order(_ store: AppStore) -> [String] { store.pinned.map(\.id) + store.listed.map(\.id) }
}

/** The appearance the person chose (Settings, or the palette's Theme), on every window and sheet at once. */
enum MacAppearance {
  @MainActor
  static func apply(_ name: String) {
    switch name {
    case "light": NSApp.appearance = NSAppearance(named: .aqua)
    case "dark": NSApp.appearance = NSAppearance(named: .darkAqua)
    default: NSApp.appearance = nil
    }
  }
}

extension Notification.Name {
  /** ⌘L and ⌘I: the cursor into the open chat's message field (the Electron window's keys). */
  static let simeonFocusComposer = Notification.Name("simeon.focus-composer")
}

/**
 * The menus: the Electron app's (`application-menu.ts`: Simeon, File, Edit,
 * View, Agent, Window; no Help menu) with every key its window answers
 * (`global-keyboard-shortcuts.ts`), and the row menu's actions in the Agent
 * menu. What changes with the open agent is drawn by views (`AgentMenuItems`,
 * `HiddenAgentsItem`), which follow the window as it changes; a menu's own
 * body is drawn once.
 */
struct SimeonCommands: Commands {
  let navigation: MacNavigation
  let store: AppStore
  @Environment(\.openWindow) private var openWindow

  var body: some Commands {
    CommandGroup(after: .appSettings) {
      Button("Connect Apps…") { openWindow(id: "connect-apps") }
        .keyboardShortcut("m", modifiers: [.command, .shift])
    }
    CommandGroup(replacing: .newItem) {
      Button("New Agent") { navigation.sheet = .newAgent }
        .keyboardShortcut("n")
      Button("New Group Chat") { navigation.sheet = .newGroup }
        .keyboardShortcut("n", modifiers: [.command, .shift])
      Divider()
      Button("Jump To…") { navigation.sheet = .palette }
        .keyboardShortcut("k")
    }
    // The Mac's Show Sidebar (⌃⌘S) and Enter Full Screen; the window follows the sidebar's state either way.
    SidebarCommands()
    CommandGroup(after: .sidebar) { HiddenAgentsItem(navigation: navigation, store: store) }
    CommandMenu("Agent") { AgentMenuItems(navigation: navigation, store: store) }
    // The Electron app hid its Help menu's items (4 October 2026).
    CommandGroup(replacing: .help) {}
  }
}

struct HiddenAgentsItem: View {
  let navigation: MacNavigation
  let store: AppStore

  var body: some View {
    Button("Show Hidden Agents") { navigation.sheet = .hiddenAgents }
      .disabled(store.hiddenAgents.isEmpty)
  }
}

/** The Agent menu: the open agent's call, page, computer and row actions; moving between agents; Delete. */
struct AgentMenuItems: View {
  let navigation: MacNavigation
  let store: AppStore
  @Environment(\.openWindow) private var openWindow

  private var agent: Agent? { store.agent(navigation.selected) }

  var body: some View {
    let agent = agent
    Button(agent.map { "Call \($0.name)" } ?? "Call") { if let agent { store.startCall(agent) } }
      .disabled(agent == nil || agent?.isGroup == true || !store.canCall || store.call != nil)
    Button(agent?.isGroup == true ? "Members" : "Edit Profile") { if let agent { navigation.sheet = .agentPage(agent.id, routine: nil) } }
      .disabled(agent == nil)
    Button("Open Computer") { if let agent { openWindow(id: "computer", value: agent.id) } }
      .disabled(agent == nil || agent?.isGroup == true)
    Button("Message Field") { NotificationCenter.default.post(name: .simeonFocusComposer, object: nil) }
      .keyboardShortcut("l")
      .disabled(agent == nil)
    Divider()
    if let agent {
      let pinned = store.pinnedIds.contains(agent.id)
      Button(pinned ? "Unpin" : "Pin") { Task { await store.setPinned(agent.id, !pinned) } }
      Button(agent.hasUnread ? "Mark as Read" : "Mark as Unread") { Task { await store.setUnread(agent.id, !agent.hasUnread) } }
        .keyboardShortcut("u", modifiers: [.command, .shift])
      if !agent.isGroup {
        Button("Duplicate") { Task { await store.duplicate(agent.id) } }
      }
      Button("Copy Conversation ID") { UIPasteboard.general.string = agent.id }
      Button("Hide from Sidebar") { Task { await store.setHidden(agent.id, true) } }
    }
    Divider()
    // ⌥↑ ⌥↓ work in the message field too, as the Electron window's (`isEnabledInContentEditable`).
    Button("Previous Agent") { step(-1) }
      .keyboardShortcut(.upArrow, modifiers: .option)
    Button("Next Agent") { step(1) }
      .keyboardShortcut(.downArrow, modifiers: .option)
    Menu("Go To") {
      let order = Array(navigation.order(store).prefix(9))
      ForEach(Array(order.enumerated()), id: \.element) { index, id in
        Button(store.agent(id)?.name ?? id) { navigation.selected = id }
          .keyboardShortcut(KeyEquivalent(Character(String(index + 1))))
      }
    }
    Divider()
    Button("Delete…") { navigation.deleting = agent }
      .disabled(agent == nil)
  }

  private func step(_ by: Int) {
    if let next = SidebarOrder.neighbour(of: navigation.selected, in: navigation.order(store), step: by) { navigation.selected = next }
  }
}
