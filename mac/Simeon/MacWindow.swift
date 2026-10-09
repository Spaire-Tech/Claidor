import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * The window's states, the iPhone's (`RootView` in ios/Simeon): the
 * sign-in, then a new account's first run, then the agents. A chat open in
 * a window behind another app's is not being read (`AppStore.isForeground`).
 */
struct MacRoot: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store

  var body: some View {
    Group {
      switch session.phase {
      case .starting:
        Ink.ground
      case .signedOut, .signingIn:
        SignInScreen()
          .toolbar(.hidden, for: .windowToolbar)
      case .signedIn:
        ZStack {
          if session.firstRun == .needed {
            OnboardingFlow()
              .toolbar(.hidden, for: .windowToolbar)
              .transition(.opacity)
          } else {
            MacWindow().transition(.opacity)
          }
        }
        .animation(.easeInOut(duration: 0.35), value: session.firstRun == .needed)
      }
    }
    // The Electron window's smallest (`window-chrome.ts`).
    .frame(minWidth: 680, minHeight: 520)
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in store.isForeground = true }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in store.isForeground = false }
  }
}

/**
 * The window once signed in, in Apple's parts: the agents in the sidebar
 * (glass, folding away with ⌃⌘S), the open agent's chat as the detail with
 * its name and buttons in the toolbar. New Agent, New Group Chat, the agent's
 * page, the hidden agents and Jump To are sheets over it.
 */
struct MacWindow: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @Environment(\.openWindow) private var openWindow
  @State private var columns = NavigationSplitViewVisibility.all

  var body: some View {
    @Bindable var navigation = navigation
    NavigationSplitView(columnVisibility: $columns) {
      MacSidebar()
        .navigationSplitViewColumnWidth(min: 220, ideal: 280, max: 420)
    } detail: {
      if let id = navigation.selected, store.agent(id) != nil {
        MacChat(agentId: id).id(id)
      } else {
        MacNoChat()
      }
    }
    .onChange(of: navigation.sidebarShown) { _, shown in withAnimation { columns = shown ? .all : .detailOnly } }
    .onChange(of: columns) { _, now in
      let shown = now != .detailOnly
      if navigation.sidebarShown != shown { navigation.sidebarShown = shown }
    }
    // The Electron window's own keys beside the menus': ⌘B folds the sidebar, ⌘I goes to the message field (⌘L is in the Agent menu).
    .background {
      Group {
        Button("") { navigation.sidebarShown.toggle() }.keyboardShortcut("b")
        Button("") { NotificationCenter.default.post(name: .simeonFocusComposer, object: nil) }.keyboardShortcut("i")
      }
      .opacity(0)
      .accessibilityHidden(true)
    }
    .sheet(item: $navigation.sheet) { sheet in
      MacSheet(sheet: sheet)
        .environment(store)
        .environment(navigation)
        .problemAlert()
    }
    .alert(navigation.deleting.map { "Delete “\($0.name)”" } ?? "", isPresented: Binding(get: { navigation.deleting != nil }, set: { shown in if !shown { navigation.deleting = nil } }), presenting: navigation.deleting) { agent in
      Button("Cancel", role: .cancel) {}
      Button("Delete", role: .destructive) {
        Task {
          if await store.delete([agent.id]), navigation.selected == agent.id { navigation.selected = nil }
        }
      }
    } message: { agent in
      Text(agent.isGroup
        ? "This permanently deletes the group and its chat history. The Agents in it are not deleted and remain available individually. This can't be undone."
        : "This permanently deletes the agent and its chat history. This can't be undone.")
    }
    .problemAlert()
    .task(id: navigation.connectAppsAsked) {
      guard navigation.connectAppsAsked else { return }
      navigation.connectAppsAsked = false
      openWindow(id: "connect-apps")
    }
    // A tapped notification opens its agent (once the roster has it).
    .task(id: OpenRequest(agent: Notifications.shared.openAgent, ready: !store.agents.isEmpty)) {
      guard let agentId = Notifications.shared.openAgent, store.agent(agentId) != nil else { return }
      Notifications.shared.openAgent = nil
      navigation.selected = agentId
    }
    // Opening on the first agent, as the Electron window opens on the last one shown.
    .task(id: store.agents.isEmpty) {
      if navigation.selected == nil { navigation.selected = navigation.order(store).first }
    }
  }

  private struct OpenRequest: Equatable {
    let agent: String?
    let ready: Bool
  }
}

/** What each sheet over the window is, at the size it is drawn on the Mac. */
struct MacSheet: View {
  let sheet: MacNavigation.Sheet
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    switch sheet {
    case .newAgent:
      NewAgentSheet { id in navigation.sheet = nil; navigation.selected = id }
        .frame(width: 440, height: 600)
    case .newGroup:
      NewGroupSheet { id in navigation.sheet = nil; navigation.selected = id }
        .frame(width: 440, height: 600)
    case .hiddenAgents:
      HiddenAgentsSheet { id in navigation.sheet = nil; navigation.selected = id }
        .frame(width: 440, height: 480)
    case .palette:
      MacPalette()
    case .agentPage(let id, let routine):
      AgentPageSheet(agentId: id, routineId: routine)
        .frame(width: 480, height: 680)
    }
  }
}

/** No chat open: the idle butterfly (the Electron window's idle mark) and New Agent. */
struct MacNoChat: View {
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    VStack(spacing: 16) {
      ButterflyView(palette: .named("blue"), motion: .idle).frame(width: 72, height: 72)
      Text("Choose an agent, or start a new one.").font(.system(size: 15)).foregroundStyle(.secondary)
      Button("New Agent") { navigation.sheet = .newAgent }
        .buttonStyle(.glass)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
  }
}

// MARK: - The sidebar

/**
 * The agents (the Electron window's sidebar, `sidebar.tsx`): the pinned ones
 * as tiles, then the rest, each with its butterfly, name, title, last line,
 * time and status; the search field at the top as the Mac's sidebars have
 * it; Hidden Agents at the end; the account at the foot. A right click gives
 * the row's menu in the Electron window's order.
 */
struct MacSidebar: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var query = ""

  /** Every listed agent, or those the search finds (hidden ones too) by name, title, description or last line. */
  private var shown: [Agent] {
    let words = query.trimmingCharacters(in: .whitespaces)
    guard !words.isEmpty else { return store.listed }
    return store.agents.filter { agent in
      agent.name.localizedCaseInsensitiveContains(words) || agent.title.localizedCaseInsensitiveContains(words)
        || agent.description.localizedCaseInsensitiveContains(words) || agent.previewLine.localizedCaseInsensitiveContains(words)
    }
  }

  var body: some View {
    @Bindable var navigation = navigation
    List(selection: $navigation.selected) {
      if query.isEmpty && !store.pinned.isEmpty {
        MacPinGrid(pins: store.pinned)
          .listRowSeparator(.hidden)
      }
      ForEach(shown) { agent in
        MacAgentRow(agent: agent, members: store.members(of: agent), draft: store.drafts[agent.id], call: store.call?.agentId == agent.id ? store.call : nil)
          .equatable()
          .tag(agent.id)
          .contextMenu { MacAgentMenu(agent: agent) }
      }
      if query.isEmpty && !store.hiddenAgents.isEmpty {
        Button { navigation.sheet = .hiddenAgents } label: {
          HStack {
            Text("Hidden Agents")
            Spacer()
            Text("\(store.hiddenAgents.count)").monospacedDigit()
          }
          .font(.system(size: 12))
          .foregroundStyle(.secondary)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
      }
    }
    .listStyle(.sidebar)
    .searchable(text: $query, placement: .sidebar, prompt: "Search")
    .overlay {
      if shown.isEmpty && (store.pinned.isEmpty || !query.isEmpty) && !store.isLoading {
        Text(query.isEmpty ? "No saved agents yet." : "No results").font(.system(size: 13)).foregroundStyle(.secondary)
      }
    }
    .animation(.spring(response: 0.38, dampingFraction: 0.86), value: shown.map(\.id))
    .animation(.spring(response: 0.38, dampingFraction: 0.86), value: store.pinnedIds)
    .safeAreaInset(edge: .bottom, spacing: 0) { MacAccountBar() }
    .toolbar {
      ToolbarItem {
        Menu {
          Button { navigation.sheet = .newAgent } label: { Label("New Agent", systemImage: "person.crop.circle.badge.plus") }
          Button { navigation.sheet = .newGroup } label: { Label("New Group Chat", systemImage: "person.2") }
        } label: {
          Label("New", systemImage: "square.and.pencil")
        }
        .help("New Agent or Group Chat")
      }
    }
  }
}

/**
 * One agent or group in the sidebar (`sidebar-agent-status.ts`): its
 * butterfly (moving while it works, the green dot at its corner while the
 * work has no name), the name, the title, the time; under them the last line
 * (what it is doing while it works, your unsent draft, else its last
 * message) and the dot of an unread chat, orange when it waits on you.
 */
struct MacAgentRow: View, Equatable {
  let agent: Agent
  let members: [Agent]
  let draft: String?
  let call: CallState?

  static func == (a: MacAgentRow, b: MacAgentRow) -> Bool {
    a.agent == b.agent && a.members == b.members && a.draft == b.draft && a.call?.agentId == b.call?.agentId && a.call?.phase == b.call?.phase
  }

  var body: some View {
    let status = RowStatus(agent: agent)
    HStack(alignment: .center, spacing: 10) {
      AgentAvatar(agent: agent, members: members, moves: true)
        .frame(width: 34, height: 34)
        .overlay(alignment: .bottomTrailing) {
          if let dot = status.cornerOnRow { StatusDot(colour: dot, size: 8).offset(x: 2, y: 2) }
        }
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(agent.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
          if !agent.title.isEmpty {
            Text(agent.title).font(.system(size: 11)).foregroundStyle(Ink.title).lineLimit(1)
          }
          Spacer(minLength: 4)
          if let call {
            CallChip(call: call)
          } else if let at = agent.lastActivityAt, at > 0 {
            Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000))).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize()
          }
        }
        HStack(alignment: .top, spacing: 6) {
          Text(line).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
          Spacer(minLength: 0)
          if let marker = status.marker {
            Circle().fill(marker).frame(width: 8, height: 8).padding(.top, 4)
              .accessibilityLabel(status.label ?? "")
          }
        }
      }
    }
    .padding(.vertical, 4)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }

  /** The Electron sidebar's order: what it is doing while it works, else your unsent draft, else the last line. */
  private var line: String {
    if agent.isBusy, let activity = agent.activityLabel { return activity }
    if agent.isComposing { return "Typing…" }
    if let draft { return "Draft: " + draft.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
    return agent.previewLine
  }
}

/**
 * The pinned agents above the rows (the Electron window's pin grid,
 * `sand-pinned-grid`: tiles 80 wide, the butterfly, the name, the title in
 * blue). A click opens the chat; a right click is the row's menu; dragging a
 * tile onto another moves it there (the host's `pinnedAgentIds`, shared with
 * the iPhone).
 */
struct MacPinGrid: View {
  let pins: [Agent]
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var target: String?

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 74, maximum: 96), spacing: 6)], spacing: 10) {
      ForEach(pins) { agent in
        Button { navigation.selected = agent.id } label: {
          VStack(spacing: 4) {
            AgentAvatar(agent: agent, members: store.members(of: agent), moves: true)
              .frame(width: 48, height: 48)
              .overlay(alignment: .bottomTrailing) {
                if let dot = RowStatus(agent: agent).cornerOnPin { StatusDot(colour: dot, size: 9).offset(x: 1, y: 1) }
              }
            Text(agent.name).font(.system(size: 11, weight: navigation.selected == agent.id ? .semibold : .regular)).lineLimit(1)
            if !agent.title.isEmpty { Text(agent.title).font(.system(size: 10)).foregroundStyle(Ink.title).lineLimit(1) }
          }
          .padding(.vertical, 6).padding(.horizontal, 4)
          .frame(maxWidth: .infinity)
          .background(navigation.selected == agent.id ? AnyShapeStyle(.selection.opacity(0.25)) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          .contentShape(.rect(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .contextMenu { MacAgentMenu(agent: agent) }
        .draggable(agent.id) {
          AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 48, height: 48)
        }
        .dropDestination(for: String.self) { ids, _ in
          guard let moved = ids.first, moved != agent.id, let index = store.pinnedIds.firstIndex(of: agent.id) else { return false }
          Task { await store.movePin(moved, to: index) }
          return true
        } isTargeted: { over in
          let next = over ? agent.id : (target == agent.id ? nil : target)
          if next != target { target = next }
        }
        .opacity(target == agent.id ? 0.55 : 1)
        .accessibilityLabel(RowStatus(agent: agent).label.map { "\(agent.name), \($0)" } ?? agent.name)
      }
    }
    .padding(.vertical, 4)
  }
}

/**
 * A row's right-click menu, in the Electron window's order
 * (`agent-row-actions-model.ts`): Edit Profile; Pin; Mark as Read or Unread;
 * Duplicate; Copy Conversation ID; Hide from Sidebar; Delete.
 */
struct MacAgentMenu: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let isPinned = store.pinnedIds.contains(agent.id)
    if !agent.isGroup {
      Button { navigation.sheet = .agentPage(agent.id, routine: nil) } label: { Label("Edit Profile", systemImage: "pencil") }
    } else {
      Button { navigation.sheet = .agentPage(agent.id, routine: nil) } label: { Label("Members", systemImage: "person.2") }
    }
    Divider()
    Button { Task { await store.setPinned(agent.id, !isPinned) } } label: {
      Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
    }
    Button { Task { await store.setUnread(agent.id, !agent.hasUnread) } } label: {
      Label(agent.hasUnread ? "Mark as Read" : "Mark as Unread", systemImage: agent.hasUnread ? "checkmark.message" : "message.badge")
    }
    if !agent.isGroup {
      Button { Task { await store.duplicate(agent.id) } } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
    }
    Button { UIPasteboard.general.string = agent.id } label: { Label("Copy Conversation ID", systemImage: "doc.on.doc") }
    Button { Task { await store.setHidden(agent.id, true) } } label: { Label("Hide from Sidebar", systemImage: "eye.slash") }
    Divider()
    Button(role: .destructive) { navigation.deleting = agent } label: { Label("Delete…", systemImage: "trash") }
  }
}

/** The account at the sidebar's foot (the Electron window's account disc): Settings, Connect Apps, Sign Out. */
struct MacAccountBar: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @Environment(\.openSettings) private var openSettings
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    Menu {
      Button("Settings…") { openSettings() }
      Button("Connect Apps…") { openWindow(id: "connect-apps") }
      Divider()
      Button("Sign Out") { Task { await session.signOut() } }
    } label: {
      HStack(spacing: 8) {
        ZStack {
          Circle().fill(Ink.bubbleTheirs)
          if let initials = store.account?.initials, !initials.isEmpty {
            Text(initials).font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.primary)
          } else {
            Image(systemName: "person.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.primary)
          }
        }
        .frame(width: 26, height: 26)
        Text(store.account?.name ?? "Account").font(.system(size: 13)).lineLimit(1)
        Spacer(minLength: 0)
      }
      .contentShape(.rect)
    }
    .menuStyle(.button)
    .buttonStyle(.plain)
    .menuIndicator(.hidden)
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .accessibilityLabel("Account")
  }
}
