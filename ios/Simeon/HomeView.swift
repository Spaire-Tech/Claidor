import SwiftUI
import UIKit
import SimeonCore

/** The sheets the list opens: the + menu's two, search, and Settings from the account button. */
enum HomeSheet: String, Identifiable {
  case newAgent, newGroup, search, settings
  var id: String { rawValue }
}

/**
 * The list (the founder's step 1, then round 2 and 4): the agents and
 * groups, newest first, big rows; the account button at the top left
 * (Settings), search and new chat at the top right; the call's green time
 * on the agent you are talking to.
 *
 * What the Mac's sidebar does, the list does: pinned agents in a grid
 * above the rows (shared with the Mac through the host's `pinnedAgentIds`,
 * dragged to reorder), the row menu on a long press (Pin, Mark as Read,
 * Edit Profile, Duplicate, Copy conversation ID, Hide from sidebar,
 * Delete, in the Mac's order and sections), Delete asking first in the
 * Mac's words, and "Hidden Agents" at the end, opening the hidden ones.
 * A swipe does the row's most used two each way, as Messages does.
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

  var body: some View {
    let _ = Trace.tally("HomeView drawn")
    NavigationStack(path: $path) {
      List {
        if !store.pinned.isEmpty {
          PinGrid(pins: store.pinned, open: open, menu: menu)
            .listRowBackground(Ink.listGround)
            .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 10, trailing: 12))
            .listRowSeparator(.hidden)
        }
        ForEach(store.listed) { agent in
          Button { open(agent.id) } label: {
            AgentRow(agent: agent, members: store.members(of: agent))
          }
          .contextMenu { menu(agent) }
          .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button { Task { await store.setUnread(agent.id, !agent.hasUnread) } } label: {
              Label(agent.hasUnread ? "Read" : "Unread", systemImage: agent.hasUnread ? "bell" : "bell.badge")
            }
            .tint(Ink.unread)
            Button { Task { await store.setPinned(agent.id, true) } } label: { Label("Pin", systemImage: "pin") }
              .tint(Ink.pinSwipe)
          }
          .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button { deleting = agent } label: { Label("Delete", systemImage: "trash") }
              .tint(Ink.callEnd)
            Button { Task { await store.setHidden(agent.id, true) } } label: { Label("Hide", systemImage: "eye.slash") }
              .tint(Ink.hideSwipe)
          }
          .listRowBackground(Ink.listGround)
          .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
          .listRowSeparator(.hidden)
        }
        if !store.hiddenAgents.isEmpty && !store.listed.isEmpty {
          Button { showsHidden = true } label: {
            HStack {
              Text("Hidden Agents")
              Spacer()
              Text("\(store.hiddenAgents.count)").monospacedDigit()
            }
            .font(.system(size: 15.6))
            .foregroundStyle(Ink.secondary)
            .contentShape(.rect)
          }
          .accessibilityHint("Shows the agents hidden from the list")
          .listRowBackground(Ink.listGround)
          .listRowInsets(EdgeInsets(top: 10, leading: 20, bottom: 10, trailing: 20))
          .listRowSeparator(.hidden)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Ink.listGround)
      // Rows move to their new place as the Mac's do when an agent answers, is pinned or hidden.
      .animation(.spring(response: 0.38, dampingFraction: 0.86), value: store.listed.map(\.id))
      .animation(.spring(response: 0.38, dampingFraction: 0.86), value: store.pinnedIds)
      .overlay {
        if store.listed.isEmpty && store.pinned.isEmpty && !store.isLoading {
          VStack(spacing: 14) {
            Text("No saved agents yet.").font(.system(size: 15.6)).foregroundStyle(Ink.secondary)
            if !store.hiddenAgents.isEmpty {
              Button("Show Hidden Agents") { showsHidden = true }
                .buttonStyle(GreyButtonStyle())
            }
          }
        }
      }
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button { sheet = .settings } label: {
            Initials(letters: store.account?.initials ?? "")
          }
          .accessibilityLabel("Account and settings")
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button { sheet = .search } label: { Image(systemName: "magnifyingglass") }
            .accessibilityLabel("Search")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            Button { sheet = .newAgent } label: { Label("New Agent", systemImage: "person.crop.circle.badge.plus") }
            Button { sheet = .newGroup } label: { Label("New Group Chat", systemImage: "person.2") }
            if !store.hiddenAgents.isEmpty {
              Button { showsHidden = true } label: { Label("Hidden Agents (\(store.hiddenAgents.count))", systemImage: "eye.slash") }
            }
          } label: {
            Image(systemName: "square.and.pencil")
          }
          .accessibilityLabel("New")
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
    .alert(deleting.map { "Delete “\($0.name)”" } ?? "", isPresented: Binding(get: { deleting != nil }, set: { shown in Trace.tally("Delete alert set"); if !shown && deleting != nil { deleting = nil } }), presenting: deleting) { agent in
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

  /** The Mac's row menu (`AgentRowActions`), its four sections in its order; a group has no Edit Profile and no Duplicate. */
  @ViewBuilder
  private func menu(_ agent: Agent) -> some View {
    let isPinned = store.pinnedIds.contains(agent.id)
    Section {
      Button { Task { await store.setPinned(agent.id, !isPinned) } } label: {
        Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
      }
      Button { Task { await store.setUnread(agent.id, !agent.hasUnread) } } label: {
        Label(agent.hasUnread ? "Mark as Read" : "Mark as Unread", systemImage: agent.hasUnread ? "bell" : "bell.badge")
      }
    }
    if !agent.isGroup {
      Section {
        Button { profile = AgentRef(id: agent.id) } label: { Label("Edit Profile", systemImage: "pencil") }
        Button { Task { await store.duplicate(agent.id) } } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
      }
    }
    Section {
      Button { UIPasteboard.general.string = agent.id } label: { Label("Copy conversation ID", systemImage: "doc.on.doc") }
    }
    Section {
      Button { Task { await store.setHidden(agent.id, true) } } label: { Label("Hide from sidebar", systemImage: "eye.slash") }
      Button(role: .destructive) { deleting = agent } label: { Label("Delete", systemImage: "trash") }
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

  private let columns = Array(repeating: GridItem(.fixed(96), spacing: 9.6), count: 3)

  var body: some View {
    let _ = Trace.tally("PinGrid drawn")
    LazyVGrid(columns: columns, alignment: .center, spacing: 14.4) {
      ForEach(pins) { agent in
        Button { open(agent.id) } label: {
          PinTile(agent: agent, members: store.members(of: agent))
        }
        .buttonStyle(PinPress())
        .contextMenu { menu(agent) }
        .draggable(agent.id) {
          AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 72, height: 72)
        }
        .dropDestination(for: String.self) { ids, _ in
          guard let moved = ids.first, moved != agent.id, let index = store.pinnedIds.firstIndex(of: agent.id) else { return false }
          Task { await store.movePin(moved, to: index) }
          return true
        } isTargeted: { over in
          Trace.tally("PinGrid drop target")
          // Only a change is written: written on every call, a call made while the grid was drawn drew it again, and again.
          let next = over ? agent.id : (target == agent.id ? nil : target)
          if next != target { target = next }
        }
        .opacity(target == agent.id ? 0.55 : 1)
        .transition(.scale(scale: 0.8).combined(with: .opacity))
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 7.2)
  }
}

/** One pinned agent: its butterfly, the status dot at the corner, the name, the title in blue. */
struct PinTile: View {
  let agent: Agent
  let members: [Agent]

  var body: some View {
    let _ = Trace.tally("PinTile drawn")
    VStack(spacing: 4) {
      AgentAvatar(agent: agent, members: members, moves: true)
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
        ToolbarItem(placement: .topBarTrailing) { CloseDisc { dismiss() } }
      }
      .onChange(of: store.hiddenAgents.isEmpty) { _, empty in if empty { dismiss() } }
    }
    .presentationDetents([.medium, .large])
    .problemAlert()
  }
}

/**
 * One agent or group in the list: the Mac's row zoomed ×1.2 as the phone
 * design has it (measured: the name 16.8 pt semibold, the title 13.2 pt in
 * the chat's blue, the time 14.4 pt at 40 %, the last line 15.6 pt at 60 %,
 * the butterfly 52).
 */
struct AgentRow: View {
  let agent: Agent
  let members: [Agent]
  @Environment(AppStore.self) private var store

  var body: some View {
    let _ = Trace.tally("AgentRow drawn")
    HStack(alignment: .center, spacing: 12) {
      AgentAvatar(agent: agent, members: members, moves: true)
        .frame(width: 52, height: 52)
        .overlay(alignment: .bottomTrailing) {
          if let dot = RowStatus(agent: agent).cornerOnRow { StatusDot(colour: dot, size: 9.6).offset(x: -2.4, y: -2.4) }
        }
      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(agent.name).font(.system(size: 16.8, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(1)
          if !agent.title.isEmpty {
            Text(agent.title).font(.system(size: 13.2)).foregroundStyle(Ink.bubbleMine).lineLimit(1)
          }
          Spacer(minLength: 4)
          RowTime(agent: agent)
        }
        HStack(spacing: 8) {
          Text(line).font(.system(size: 15.6)).foregroundStyle(Ink.secondary).lineLimit(1)
          Spacer(minLength: 0)
          if let marker = RowStatus(agent: agent).marker {
            Circle().fill(marker).frame(width: 10, height: 10)
              .accessibilityLabel(RowStatus(agent: agent).label ?? "")
          }
        }
      }
    }
    .padding(.vertical, 4)
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

/** The row's time, or the call's green time on the agent you are talking to: the only part of a row the call redraws. */
struct RowTime: View {
  let agent: Agent
  @Environment(AppStore.self) private var store

  var body: some View {
    let _ = Trace.tally("RowTime drawn")
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
    let _ = Trace.tally("ProblemAlert drawn")
    content.alert("Something went wrong", isPresented: Binding(get: { store.problem != nil }, set: { shown in Trace.tally("ProblemAlert set"); if !shown && store.problem != nil { store.problem = nil } })) {
      Button("OK", role: .cancel) { store.problem = nil }
    } message: {
      Text(store.problem ?? "")
    }
  }
}

extension View {
  func problemAlert() -> some View { modifier(ProblemAlert()) }
}
