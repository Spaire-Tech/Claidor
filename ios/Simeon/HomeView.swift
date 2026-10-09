import SwiftUI
import UIKit
import SimeonCore

/** The sheets the list opens: New Agent and New Group Chat from the compose button, Settings from the name's menu (search is the list's own field now). */
enum HomeSheet: String, Identifiable {
  case newAgent, newGroup, search, settings
  var id: String { rawValue }
}

/**
 * The list, as Messages draws it (the founder, 9 October 2026: "exactly like
 * iMessage"): rows with the butterfly, the name, the last line's time and a
 * chevron, two lines of the last message, a hairline between rows from the
 * text on, the blue dot of an unread chat in the margin; the search field
 * and the compose button at the bottom. At the top, as Instagram has it,
 * the person's name with a menu (Settings, Appearance, Hidden Agents) in
 * place of the account button.
 *
 * A long press on a row or a pinned agent shows the chat itself above its
 * menu, as Messages does (Pin, Mark as Read, Hide Alerts, Delete; then the
 * Mac's Edit Profile, Duplicate, Hide from List). A swipe does the row's
 * most used two each way. Pinned agents sit in a grid above the rows,
 * shared with the Mac through the host's `pinnedAgentIds`.
 */
struct HomeView: View {
  /** A screen to open at launch (`--screen=`, the screenshots). */
  let opening: String?
  @Environment(AppStore.self) private var store
  @State private var path: [String] = []
  @State private var sheet: HomeSheet?
  @State private var openedAtLaunch = false
  @State private var deleting: Agent?
  @State private var profile: AgentRef?
  @State private var showsHidden = false
  @State private var query = ""
  @State private var filter = ListFilter.all

  /** The filter menu's choice, as Messages': every chat, or only the unread ones. */
  enum ListFilter { case all, unread }

  /** The rows: every listed chat, or those the search finds (hidden ones too) by name, title, description or last line. */
  private var shown: [Agent] {
    let words = query.trimmingCharacters(in: .whitespaces)
    guard !words.isEmpty else { return filter == .unread ? store.listed.filter(\.hasUnread) : store.listed }
    return store.agents.filter { agent in
      agent.name.localizedCaseInsensitiveContains(words) || agent.title.localizedCaseInsensitiveContains(words)
        || agent.description.localizedCaseInsensitiveContains(words) || agent.previewLine.localizedCaseInsensitiveContains(words)
    }
  }

  var body: some View {
    NavigationStack(path: $path) {
      List {
        if query.isEmpty && filter == .all && !store.pinned.isEmpty {
          PinGrid(pins: store.pinned, open: open, menu: menu)
            .listRowBackground(Ink.listGround)
            .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 10, trailing: 12))
            .listRowSeparator(.hidden)
        }
        ForEach(shown) { agent in
          Button { open(agent.id) } label: {
            // Drawn again only when its own agent changes, not on every change to the roster.
            AgentRow(agent: agent, members: store.members(of: agent)).equatable()
          }
          .contextMenu { menu(agent) } preview: { ChatPeek(agentId: agent.id).environment(store) }
          .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button { Task { await store.setUnread(agent.id, !agent.hasUnread) } } label: {
              Label(agent.hasUnread ? "Read" : "Unread", systemImage: agent.hasUnread ? "message" : "message.badge")
            }
            .tint(Ink.unread)
            Button { Task { await store.setPinned(agent.id, !store.pinnedIds.contains(agent.id)) } } label: {
              Label(store.pinnedIds.contains(agent.id) ? "Unpin" : "Pin", systemImage: store.pinnedIds.contains(agent.id) ? "pin.slash" : "pin")
            }
            .tint(Ink.pinSwipe)
          }
          .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button { deleting = agent } label: { Label("Delete", systemImage: "trash") }
              .tint(Ink.callEnd)
            Button { Task { await store.setNotify(agent.id, !agent.notifyOnUpdates) } } label: {
              Label(agent.notifyOnUpdates ? "Hide Alerts" : "Show Alerts", systemImage: agent.notifyOnUpdates ? "bell.slash" : "bell")
            }
            .tint(Ink.hideSwipe)
          }
          .listRowBackground(Ink.listGround)
          // The margin on the left holds the unread dot; the hairline below starts where the text does (AgentRow).
          .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
          .listRowSeparatorTint(Ink.hairline)
        }
        if query.isEmpty && filter == .all && !store.hiddenAgents.isEmpty && !store.listed.isEmpty {
          Button { showsHidden = true } label: {
            HStack {
              Text("Hidden Agents")
              Spacer()
              Text("\(store.hiddenAgents.count)").monospacedDigit()
              Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
            }
            .font(.system(size: 15))
            .foregroundStyle(Ink.secondary)
            .contentShape(.rect)
          }
          .accessibilityHint("Shows the agents hidden from the list")
          .listRowBackground(Ink.listGround)
          .listRowInsets(EdgeInsets(top: 12, leading: 22, bottom: 12, trailing: 16))
          .listRowSeparator(.hidden)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Ink.listGround)
      // Rows move to their new place when an agent answers, is pinned or hidden.
      .animation(.spring(response: 0.38, dampingFraction: 0.86), value: shown.map(\.id))
      .animation(.spring(response: 0.38, dampingFraction: 0.86), value: store.pinnedIds)
      .overlay {
        if shown.isEmpty && (store.pinned.isEmpty || !query.isEmpty) && !store.isLoading {
          VStack(spacing: 14) {
            Text(!query.isEmpty ? "No results" : filter == .unread ? "No unread chats" : "No saved agents yet.").font(.system(size: 15.6)).foregroundStyle(Ink.secondary)
            if query.isEmpty && !store.hiddenAgents.isEmpty {
              Button("Show Hidden Agents") { showsHidden = true }
                .buttonStyle(GreyButtonStyle())
            }
          }
        }
      }
      // At the bottom, as Messages has them: the search field, and new chat at the right. Our own bar: the system's
      // search in the bottom toolbar was set up again on every redraw of the list ("Ignoring searchBarPlacement…").
      .safeAreaBar(edge: .bottom, spacing: 0) {
        ListBottomBar(query: $query, newAgent: { sheet = .newAgent }, newGroup: { sheet = .newGroup })
      }
      .navigationBarTitleDisplayMode(.inline)
      .navigationTitle("Messages")
      .toolbar {
        // The account at the top left, straight to Settings.
        ToolbarItem(placement: .topBarLeading) {
          Button { sheet = .settings } label: {
            Text(store.account?.initials.isEmpty == false ? store.account!.initials : "?")
              .font(.system(size: 15, weight: .semibold))
          }
          .accessibilityLabel("Settings")
        }
        // The filter at the top right, as Messages': every chat, the hidden ones, or only the unread.
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            Toggle(isOn: Binding(get: { filter == .all }, set: { if $0 { filter = .all } })) {
              Label("Messages", systemImage: "bubble.left.and.bubble.right")
            }
            Button { showsHidden = true } label: { Label("Hidden Agents", systemImage: "eye.slash") }
              .disabled(store.hiddenAgents.isEmpty)
            Section("Filter By") {
              Toggle(isOn: Binding(get: { filter == .unread }, set: { filter = $0 ? .unread : .all })) {
                Label("Unread", systemImage: "message.badge")
              }
            }
          } label: {
            Image(systemName: "line.3.horizontal.decrease")
          }
          .accessibilityLabel("Filter")
        }
      }
      .navigationDestination(for: String.self) { agentId in
        ChatView(agentId: agentId, opening: openingCall(for: agentId))
      }
      .refreshable {
        await store.reloadRoster()
        await store.loadPins()
      }
    }
    .tint(Ink.primary)
    .sheet(item: $sheet) { which in
      Group {
        switch which {
        case .newAgent:
          NewAgentSheet { id in open(id) }
        case .newGroup:
          NewGroupSheet { id in open(id) }
        case .search:
          SearchSheet(onOpen: { id in open(id) }, onSheet: { next in
            sheet = nil
            Task { try? await Task.sleep(nanoseconds: 450_000_000); sheet = next }
          })
        case .settings:
          SettingsSheet()
        }
      }
      .problemAlert()
    }
    .sheet(item: $profile) { ref in AgentPageSheet(agentId: ref.id).problemAlert() }
    .sheet(isPresented: $showsHidden) {
      HiddenAgentsSheet { id in
        showsHidden = false
        open(id)
      }
    }
    .alert(deleting.map { "Delete “\($0.name)”" } ?? "", isPresented: Binding(get: { deleting != nil }, set: { shown in if !shown && deleting != nil { deleting = nil } }), presenting: deleting) { agent in
      Button("Cancel", role: .cancel) {}
      Button("Delete", role: .destructive) {
        Task {
          if await store.delete([agent.id]) { path.removeAll { $0 == agent.id } }
        }
      }
    } message: { agent in
      Text(agent.isGroup
        ? "This permanently deletes the group and its chat history. The Agents in it are not deleted and remain available individually. This can't be undone."
        : "This permanently deletes the agent and its chat history. This can't be undone.")
    }
    .problemAlert()
    .task(id: store.agents.isEmpty) { openAtLaunch() }
    // A tapped notification opens that agent's chat (once the roster has it).
    .task(id: OpenRequest(agent: Notifications.shared.openAgent, ready: !store.agents.isEmpty)) {
      guard let agentId = Notifications.shared.openAgent, store.agent(agentId) != nil else { return }
      Notifications.shared.openAgent = nil
      open(agentId)
    }
  }

  /** A chat's menu on a long press, Messages' four first (Pin, Mark as Read, Hide Alerts, Delete), then the Mac's own (Edit Profile, Duplicate, Hide from List, Copy conversation ID). */
  @ViewBuilder
  private func menu(_ agent: Agent) -> some View {
    let isPinned = store.pinnedIds.contains(agent.id)
    Button { Task { await store.setPinned(agent.id, !isPinned) } } label: {
      Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
    }
    Button { Task { await store.setUnread(agent.id, !agent.hasUnread) } } label: {
      Label(agent.hasUnread ? "Mark as Read" : "Mark as Unread", systemImage: agent.hasUnread ? "checkmark.message" : "message.badge")
    }
    Button { Task { await store.setNotify(agent.id, !agent.notifyOnUpdates) } } label: {
      Label(agent.notifyOnUpdates ? "Hide Alerts" : "Show Alerts", systemImage: agent.notifyOnUpdates ? "bell.slash" : "bell")
    }
    Button(role: .destructive) { deleting = agent } label: { Label("Delete", systemImage: "trash") }
    Section {
      if !agent.isGroup {
        Button { profile = AgentRef(id: agent.id) } label: { Label("Edit Profile", systemImage: "pencil") }
        Button { Task { await store.duplicate(agent.id) } } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
      }
      Button { Task { await store.setHidden(agent.id, true) } } label: { Label("Hide from List", systemImage: "eye.slash") }
      Button { UIPasteboard.general.string = agent.id } label: { Label("Copy Conversation ID", systemImage: "doc.on.doc") }
    }
  }

  private struct OpenRequest: Equatable {
    let agent: String?
    let ready: Bool
  }

  private func open(_ agentId: String) {
    sheet = nil
    path = [agentId]
  }

  /** `--screen=chat:theo`, `call:theo`, `call-full:theo`, `agent:simeon`, `new-agent`, `new-group`, `search`, `settings`, `pins` (two pinned, the demo). */
  private func openAtLaunch() {
    guard !openedAtLaunch, let opening, !store.agents.isEmpty else { return }
    openedAtLaunch = true
    let parts = opening.split(separator: ":", maxSplits: 1).map(String.init)
    guard let first = parts.first else { return }
    switch first {
    case "new-agent": sheet = .newAgent
    case "new-group": sheet = .newGroup
    case "search": sheet = .search
    case "settings": sheet = .settings
    case "pins":
      Task {
        await store.setPinned("theo", true)
        await store.setPinned("launch-squad", true)
      }
    case "chat", "call", "call-full", "agent":
      if parts.count > 1 { path = [parts[1]] }
    default: break
    }
  }

  private func openingCall(for agentId: String) -> String? {
    guard let opening, opening.hasSuffix(":\(agentId)") else { return nil }
    return opening.split(separator: ":").first.map(String.init)
  }
}

/** The list's foot, as Messages': the search field in glass with its mic, and new chat in a glass circle at the right. */
struct ListBottomBar: View {
  @Binding var query: String
  let newAgent: () -> Void
  let newGroup: () -> Void
  @FocusState private var searching: Bool
  @State private var dictation = Dictation()

  var body: some View {
    HStack(spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.secondary)
        TextField("Search", text: $query)
          .font(.system(size: 17))
          .focused($searching)
          .submitLabel(.search)
          .autocorrectionDisabled()
        if !query.isEmpty {
          Button { query = "" } label: {
            Image(systemName: "xmark.circle.fill").font(.system(size: 17)).foregroundStyle(Ink.tertiary)
              .frame(width: 30, height: 30).contentShape(.circle)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Clear search")
        } else {
          Button { dictation.isListening ? dictation.stop() : dictation.start { text in query = text } } label: {
            Image(systemName: dictation.isListening ? "stop.circle.fill" : "mic").font(.system(size: 18))
              .foregroundStyle(dictation.isListening ? Ink.danger : Ink.secondary)
              .frame(width: 30, height: 30).contentShape(.circle)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(dictation.isListening ? "Stop dictation" : "Dictate")
        }
      }
      .padding(.leading, 14).padding(.trailing, 8)
      .frame(height: 48)
      .background { Color.clear.contentShape(.capsule).onTapGesture { searching = true } }
      // Glass, not interactive glass: the field and its buttons take the touches (GlassDisc).
      .glassEffect(.regular, in: .capsule)
      Menu {
        Button(action: newAgent) { Label("New Agent", systemImage: "person.crop.circle.badge.plus") }
        Button(action: newGroup) { Label("New Group Chat", systemImage: "person.2") }
      } label: {
        Image(systemName: "square.and.pencil").font(.system(size: 19, weight: .medium)).foregroundStyle(Ink.primary)
          .frame(width: 48, height: 48)
          .contentShape(.circle)
          .glassEffect(.regular, in: .circle)
      }
      .accessibilityLabel("New")
    }
    .padding(.horizontal, 16)
    .padding(.top, 6)
    .padding(.bottom, 4)
  }
}

/** An agent's id as a sheet's item. */
struct AgentRef: Identifiable, Hashable {
  let id: String
}

/**
 * The pinned agents above the rows: the Mac's pin grid (`sand-pinned-grid`,
 * tiles 80 wide, 60 butterflies, 11 pt names, 12 between rows and 8
 * between columns) zoomed ×1.2 as the phone's rows are. A tile's long
 * press is the row's menu; dragging a tile onto another moves it there.
 */
struct PinGrid<Actions: View>: View {
  let pins: [Agent]
  let open: (String) -> Void
  @ViewBuilder let menu: (Agent) -> Actions
  @Environment(AppStore.self) private var store
  @State private var target: String?

  var body: some View {
    // Rows of three, each centred as Messages centres its pins: one pin sits in the middle.
    let rows = stride(from: 0, to: pins.count, by: 3).map { Array(pins[$0..<min($0 + 3, pins.count)]) }
    VStack(spacing: 14.4) {
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        HStack(spacing: 9.6) {
          ForEach(row) { agent in tile(agent) }
        }
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 7.2)
  }

  private func tile(_ agent: Agent) -> some View {
    Button { open(agent.id) } label: {
      PinTile(agent: agent, members: store.members(of: agent)).equatable()
    }
    .buttonStyle(PinPress())
    .contextMenu { menu(agent) } preview: { ChatPeek(agentId: agent.id).environment(store) }
    .draggable(agent.id) {
      AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 72, height: 72)
    }
    .dropDestination(for: String.self) { ids, _ in
      guard let moved = ids.first, moved != agent.id, let index = store.pinnedIds.firstIndex(of: agent.id) else { return false }
      Task { await store.movePin(moved, to: index) }
      return true
    } isTargeted: { over in
      // Only a change is written: written on every call, a call made while the grid was drawn drew it again, and again.
      let next = over ? agent.id : (target == agent.id ? nil : target)
      if next != target { target = next }
    }
    .opacity(target == agent.id ? 0.55 : 1)
    .transition(.scale(scale: 0.8).combined(with: .opacity))
  }
}

/** One pinned agent: its butterfly, the status dot at the corner, the name, the title in blue. */
struct PinTile: View, Equatable {
  let agent: Agent
  let members: [Agent]

  var body: some View {
    VStack(spacing: 4) {
      AgentAvatar(agent: agent, members: members)
        .frame(width: 72, height: 72)
        .overlay(alignment: .bottomTrailing) {
          if let dot = RowStatus(agent: agent).cornerOnPin {
            StatusDot(colour: dot, size: 12).offset(x: -2.4, y: -2.4)
          }
        }
      VStack(spacing: 0) {
        Text(agent.name).font(.system(size: 13.2)).foregroundStyle(Ink.primary).lineLimit(1)
        if !agent.title.isEmpty {
          Text(agent.title).font(.system(size: 13.2)).foregroundStyle(Ink.title).lineLimit(1)
        }
      }
      .frame(width: 86.4)
    }
    .padding(.top, 7.2).padding(.bottom, 4.8).padding(.horizontal, 4.8)
    .frame(width: 96)
    .contentShape(.rect(cornerRadius: 16.8))
    .accessibilityElement(children: .combine)
    .accessibilityLabel(RowStatus(agent: agent).label.map { "\(agent.name), \($0)" } ?? agent.name)
  }
}

/** A pressed tile dims a little, as a pressed row does. */
struct PinPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.6 : 1)
      .scaleEffect(configuration.isPressed ? 0.96 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

/**
 * The Mac's row status (`projectSidebarAgentStatus`): an agent waiting on
 * the person needs attention (orange), else unread (blue); a working agent
 * whose work has no name yet shows the green dot at its butterfly's corner.
 */
struct RowStatus {
  let agent: Agent

  var needsAttention: Bool { agent.waitingReason != nil }
  var isWorking: Bool { !needsAttention && agent.isRunning }
  /** The dot at the end of the row's second line. */
  var marker: Color? { needsAttention ? Ink.attention : agent.hasUnread ? Ink.unread : nil }
  /** The dot at a row's butterfly: working, with nothing named yet. */
  var cornerOnRow: Color? { isWorking && agent.activityLabel == nil ? Ink.live : nil }
  /** A pinned tile shows its marker at the corner, else the working dot. */
  var cornerOnPin: Color? { marker ?? cornerOnRow }
  var label: String? { needsAttention ? "Needs attention" : agent.hasUnread ? "Unread activity" : isWorking ? "Working" : nil }
}

/** The status dot, with a ring of the list's ground so it sits apart from the butterfly (the Mac cuts a hole for it). */
struct StatusDot: View {
  let colour: Color
  var size: CGFloat = 10

  var body: some View {
    Circle().fill(colour)
      .frame(width: size, height: size)
      .padding(2)
      .background(Ink.listGround, in: Circle())
  }
}

/**
 * The hidden agents (the Mac's "Hidden Agents" dialog): its line, then each
 * one with Unhide; tapping a name opens its chat.
 */
struct HiddenAgentsSheet: View {
  let open: (String) -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(store.hiddenAgents) { agent in
            HStack(spacing: 12) {
              Button { open(agent.id) } label: {
                HStack(spacing: 12) {
                  AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 32, height: 32)
                  Text(agent.name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
                  Spacer(minLength: 0)
                }
                .contentShape(.rect)
              }
              .buttonStyle(.borderless)
              Button("Unhide") { Task { await store.setHidden(agent.id, false) } }
                .buttonStyle(.borderless)
                .font(.system(size: 17))
                .foregroundStyle(Ink.secondary)
            }
          }
        } header: {
          Text("Hidden Agents stay active and keep their history, they just don't show in the sidebar.")
            .font(.system(size: 15)).foregroundStyle(Ink.secondary).textCase(nil)
            .padding(.bottom, 6)
        }
      }
      .navigationTitle("Hidden Agents")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        // The bar's own button: it draws its glass itself, and a glass disc inside it was glass on glass, each taking the touch.
        ToolbarItem(placement: .topBarTrailing) { CloseButton() }
      }
      .onChange(of: store.hiddenAgents.isEmpty) { _, empty in if empty { dismiss() } }
    }
    .presentationDetents([.medium, .large])
    .problemAlert()
  }
}

/**
 * One agent or group in the list, as Messages draws a conversation: the
 * unread dot in the margin (orange when it waits on you), the butterfly,
 * the name in 17 pt semibold with the last line's time and a chevron at the
 * right, and two lines of the last message under it in grey; the hairline
 * between rows starts where the text does.
 */
struct AgentRow: View, Equatable {
  let agent: Agent
  let members: [Agent]
  @Environment(AppStore.self) private var store

  static func == (a: AgentRow, b: AgentRow) -> Bool { a.agent == b.agent && a.members == b.members }

  var body: some View {
    let status = RowStatus(agent: agent)
    HStack(alignment: .center, spacing: 0) {
      ZStack {
        if let marker = status.marker {
          Circle().fill(marker).frame(width: 10, height: 10)
            .accessibilityLabel(status.label ?? "")
        }
      }
      .frame(width: 22)
      AgentAvatar(agent: agent, members: members)
        .frame(width: 46, height: 46)
        .overlay(alignment: .bottomTrailing) {
          if let dot = status.cornerOnRow { StatusDot(colour: dot, size: 9.6).offset(x: -1, y: -1) }
        }
        .padding(.trailing, 10)
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(agent.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(1)
          Spacer(minLength: 6)
          RowTime(agent: agent)
          Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
        }
        Text(line).font(.system(size: 15)).foregroundStyle(Ink.secondary)
          .lineLimit(2, reservesSpace: true)
          .multilineTextAlignment(.leading)
      }
      .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
      .padding(.vertical, 10)
    }
    .contentShape(.rect)
  }

  /** The Mac sidebar's order: what it is doing while it works, else your unsent draft, else "Waiting for you: …" or the last line. */
  private var line: String {
    if agent.isBusy, let activity = agent.activityLabel { return activity }
    if agent.isComposing { return "Typing…" }
    if let draft = store.drafts[agent.id] { return "Draft: " + draft.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
    return agent.previewLine
  }
}

/**
 * A chat as a long press shows it above its menu (Messages' preview): its
 * newest lines, read for the preview without opening the chat (so it stays
 * unread), at the bottom of a card the size of most of the screen.
 */
struct ChatPeek: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  private static let width: CGFloat = 360

  var body: some View {
    let rows = Array(store.rows(for: agentId).suffix(16))
    Group {
      if rows.isEmpty {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
              ChatRowView(row: row, agentId: agentId).equatable()
                .padding(.top, ChatMessages.gap(index > 0 ? rows[index - 1] : nil, row))
            }
          }
          .padding(.horizontal, 16).padding(.vertical, 14)
          .environment(\.chatWidth, Self.width - 32)
        }
        .defaultScrollAnchor(.bottom)
        .scrollDisabled(true)
      }
    }
    .frame(width: Self.width, height: 440)
    .background(Ink.ground)
    .task { await store.peek(agentId) }
  }
}

/** The row's time, or the call's green time on the agent you are talking to: the only part of a row the call redraws. */
struct RowTime: View {
  let agent: Agent
  @Environment(AppStore.self) private var store

  var body: some View {
    if let call = store.call, call.agentId == agent.id {
      CallChip(call: call)
    } else if let at = agent.lastActivityAt, at > 0 {
      Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000))).font(.system(size: 14.4)).foregroundStyle(Ink.tertiary)
    }
  }
}

/** The call's time on the list, green, ticking (round 4: "the green thing, with the seconds going"). */
struct CallChip: View {
  let call: CallState

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      HStack(spacing: 4) {
        Image(systemName: "phone.fill").font(.system(size: 11, weight: .semibold))
        Text(call.phase == .live ? Chat.callClock(call.seconds(now: context.date)) : call.status)
          .font(.system(size: 13, weight: .semibold)).monospacedDigit()
      }
      .foregroundStyle(.white)
      .padding(.horizontal, 8).padding(.vertical, 3)
      .background(Ink.live, in: Capsule())
    }
  }
}

/**
 * "Something went wrong" with the store's problem line. Every sheet carries
 * it too: an alert asked for under an open sheet never shows, so a failed
 * Add in Connect apps said nothing until both sheets were closed.
 */
struct ProblemAlert: ViewModifier {
  @Environment(AppStore.self) private var store

  func body(content: Content) -> some View {
    content.alert("Something went wrong", isPresented: Binding(get: { store.problem != nil }, set: { shown in if !shown && store.problem != nil { store.problem = nil } })) {
      Button("OK", role: .cancel) { store.problem = nil }
    } message: {
      Text(store.problem ?? "")
    }
  }
}

extension View {
  func problemAlert() -> some View { modifier(ProblemAlert()) }
}
