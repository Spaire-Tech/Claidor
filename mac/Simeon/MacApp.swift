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
 * Where the window is: the open agent, the agent's pane beside the chat,
 * the new chat, the rows picked together, the sheet or question up. Shared
 * by the window and the menus, so the Agent menu acts on the agent the
 * window shows.
 */
@MainActor
@Observable
final class MacNavigation {
  enum Sheet: Identifiable, Equatable {
    case hiddenAgents
    case palette

    var id: String {
      switch self {
      case .hiddenAgents: return "hidden"
      case .palette: return "palette"
      }
    }
  }

  /** The pane's tabs and the window's names for them (`settings`, `routines`, `overview`). */
  enum PaneTab: String, Hashable { case profile = "settings", routines, computer = "overview" }

  /** A routine's editor in the pane: a new one not yet made, or one the computer has. */
  enum RoutineTarget: Hashable {
    case draft(UUID)
    case existing(String)
  }

  /** What the pane opens on (the window's section request): a tab, and a routine's editor. */
  struct PaneRequest: Equatable {
    let tab: PaneTab
    let routine: String?
  }

  var selected: String?
  var sheet: Sheet?
  var sidebarShown = true
  /** A connector to add from a `plugin/add` link: the window opens Connect apps for it. */
  var connectAppsAsked = false
  /** A question with Cancel and an action (deleting, removing), in the window's words. */
  var confirm: MacConfirmation?

  // MARK: The agent's pane (the window's info pane)

  /** Open or not, kept from one launch to the next (`sand.infoPane.open`). */
  var paneOpen: Bool = UserDefaults.standard.bool(forKey: MacNavigation.paneKey) {
    didSet { UserDefaults.standard.set(paneOpen, forKey: Self.paneKey) }
  }
  /** What the pane opens on next; the pane takes it. */
  var paneRequest: PaneRequest?
  /** The sidebar as its rail of butterflies (the window compacts it while the pane is open); a pane left open at the last quit keeps it so. */
  var sidebarRail = UserDefaults.standard.bool(forKey: MacNavigation.paneKey) && UserDefaults.standard.bool(forKey: MacNavigation.tookKey)
  /** The pane is on screen (open, with an agent to show and no new chat over it), set by the window. */
  var paneShown = false
  /** The rail is drawn only while the pane is on screen beside it. */
  var railShown: Bool { sidebarRail && paneShown }
  /** The pane is what put the sidebar on its rail, so closing it gives the sidebar back (`simeon.paneTookSidebar`). */
  private var paneTookSidebar: Bool = UserDefaults.standard.bool(forKey: MacNavigation.tookKey) {
    didSet { UserDefaults.standard.set(paneTookSidebar, forKey: Self.tookKey) }
  }
  private static let paneKey = "simeon.infoPane.open"
  private static let tookKey = "simeon.paneTookSidebar"

  /** The header's agent button and ⌘⇧, ("Toggle agent settings"): closes an open pane, else opens it on Profile. */
  func toggleAgentSettings() {
    if paneOpen { closePane() } else { openPane(.profile) }
  }

  /** ⌘⇧I and ⌘⌥B ("Toggle details"): the same, the pane always opening on Profile. */
  func toggleDetails() { toggleAgentSettings() }

  /** Opens the pane on a tab (and a routine's editor), for the open agent or another one, which opens too. */
  func openPane(_ tab: PaneTab, agent: String? = nil, routine: String? = nil) {
    if let agent, agent != selected { selected = agent }
    paneRequest = PaneRequest(tab: tab, routine: routine)
    guard !paneOpen else { return }
    paneOpen = true
    if sidebarShown && !sidebarRail {
      paneTookSidebar = true
      sidebarRail = true
    } else {
      paneTookSidebar = false
    }
  }

  func closePane() {
    guard paneOpen else { return }
    paneOpen = false
    if paneTookSidebar && sidebarRail { sidebarRail = false }
    paneTookSidebar = false
  }

  // MARK: The new chat (the window's To: line)

  let newChat = MacNewChatState()

  /** ⌘N and the sidebar's New chat: the To: line, empty, unless it is open already (`openNewChat`). */
  func openNewChat() {
    guard !newChat.isOpen else { return }
    newChat.open()
  }

  // MARK: Rows picked together

  var selection = SidebarSelection()
  /** The agent whose name is being changed in its row. */
  var renaming: String?
  /** The section whose name is being changed in its header. */
  var renamingSection: String?

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

  /** Folded sections, the window's own (`collapsedSectionIds`), kept on this Mac. */
  var foldedSections: Set<String> = Set(UserDefaults.standard.stringArray(forKey: MacNavigation.foldKey) ?? []) {
    didSet { UserDefaults.standard.set(Array(foldedSections), forKey: Self.foldKey) }
  }
  private static let foldKey = "simeon.sidebar.collapsedSectionIds"

  /** The sidebar's order: the pinned agents, then the list or the open sections' agents (SimeonCore `SidebarSections.order`). */
  func order(_ store: AppStore) -> [String] {
    SidebarSections.order(agents: store.agents.filter { !$0.isHidden }, pinnedIds: store.pinnedIds, sections: store.sidebarSections ?? [], collapsed: foldedSections)
  }

  /** Asks before deleting agents or groups (the window's `I3n`): one question, whichever way it was asked. */
  func askToDelete(_ ids: [String], store: AppStore) {
    let agents = store.agents.filter { ids.contains($0.id) }
    guard !agents.isEmpty else { return }
    confirm = MacConfirmation(title: AgentDeletion.title(agents), message: AgentDeletion.message(agents), action: "Delete", pending: AgentDeletion.pending, failure: AgentDeletion.failure) { [weak self] in
      do {
        try await store.deleteAgents(agents.map(\.id))
        if let self {
          if let open = self.selected, ids.contains(open) { self.selected = nil }
          self.selection.keep(Set(store.agents.map(\.id)))
        }
        return true
      } catch {
        return false
      }
    }
  }
}

/**
 * A question with Cancel and one action, as the window's alert asks it: the
 * action in red, its word while it runs ("Deleting..."), and the failure in
 * red under the question, which stays up.
 */
struct MacConfirmation: Identifiable {
  let id = UUID()
  let title: String
  let message: String
  let action: String
  var pending: String? = nil
  var failure: String? = nil
  let perform: @MainActor () async -> Bool
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
      // The window's "New Agent" (⌘N): the new chat's To: line, where a group is made by naming two or more.
      Button("New Agent") { navigation.openNewChat() }
        .keyboardShortcut("n")
      Divider()
      Button("Jump To…") { navigation.sheet = .palette }
        .keyboardShortcut("k")
    }
    // The Mac's Show Sidebar (⌃⌘S) and Enter Full Screen; the window follows the sidebar's state either way.
    SidebarCommands()
    CommandGroup(after: .sidebar) {
      HiddenAgentsItem(navigation: navigation, store: store)
      Divider()
      // The window's "Toggle agent settings" (⌘⇧,) and "Toggle details" (⌘⇧I and ⌘⌥B on a Mac).
      Button("Toggle Agent Settings") { navigation.toggleAgentSettings() }
        .keyboardShortcut(",", modifiers: [.command, .shift])
      // ⇧⌘I does the same, from a key of the window's own (MacWindow).
      Button("Toggle Details") { navigation.toggleDetails() }
        .keyboardShortcut("b", modifiers: [.command, .option])
    }
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

/** The Agent menu: the open agent's call, pane, computer and row actions in the row menu's words; moving between agents; Delete. */
struct AgentMenuItems: View {
  let navigation: MacNavigation
  let store: AppStore
  @Environment(\.openWindow) private var openWindow

  private var agent: Agent? { store.agent(navigation.selected) }

  var body: some View {
    let agent = agent
    Button(agent.map { "Call \($0.name)" } ?? "Call") { if let agent { store.startCall(agent) } }
      .disabled(agent == nil || agent?.isGroup == true || !store.canCall || store.call != nil)
    Button("Edit Profile") { if let agent { navigation.openPane(.profile, agent: agent.id) } }
      .disabled(agent == nil)
    Button("Open Computer") { if let agent { openWindow(id: "computer", value: agent.id) } }
      .disabled(agent == nil || agent?.isGroup == true)
    Button("Message Field") { NotificationCenter.default.post(name: .simeonFocusComposer, object: nil) }
      .keyboardShortcut("l")
      .disabled(agent == nil)
    Button("Find in Chat…") { NotificationCenter.default.post(name: .simeonFind, object: nil) }
      .keyboardShortcut("f")
      .disabled(agent == nil)
    Button("Find Next") { NotificationCenter.default.post(name: .simeonFind, object: "next") }
      .keyboardShortcut("g")
      .disabled(agent == nil)
    Button("Find Previous") { NotificationCenter.default.post(name: .simeonFind, object: "previous") }
      .keyboardShortcut("g", modifiers: [.command, .shift])
      .disabled(agent == nil)
    Divider()
    if let agent {
      let pinned = store.pinnedIds.contains(agent.id)
      Button(pinned ? "Unpin" : "Pin") { Task { await store.setPinned(agent.id, !pinned) } }
      Button(agent.hasUnread ? "Mark as Read" : "Mark as Unread") { Task { await store.setUnread(agent.id, !agent.hasUnread) } }
        .keyboardShortcut("u", modifiers: [.command, .shift])
      if !agent.isGroup && !agent.isRemoteRoom {
        Button("Duplicate") { Task { if let copy = await store.duplicate(agent.id) { navigation.selected = copy } } }
      }
      Button("Copy conversation ID") { UIPasteboard.general.string = agent.id }
      Button("Hide from sidebar") { Task { await store.setHidden(agent.id, true) } }
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
    // While the To: line is open, ⌘1–⌘9 pick its rows instead.
    .disabled(navigation.newChat.isOpen)
    Divider()
    Button("Delete…") { if let agent { navigation.askToDelete([agent.id], store: store) } }
      .disabled(agent == nil)
  }

  private func step(_ by: Int) {
    if let next = SidebarOrder.neighbour(of: navigation.selected, in: navigation.order(store), step: by) { navigation.selected = next }
  }
}
