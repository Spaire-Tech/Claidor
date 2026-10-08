import SwiftUI
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
 */
struct HomeView: View {
  /** A screen to open at launch (`--screen=`, the screenshots). */
  let opening: String?
  @Environment(AppStore.self) private var store
  @State private var path: [String] = []
  @State private var sheet: HomeSheet?
  @State private var openedAtLaunch = false

  var body: some View {
    NavigationStack(path: $path) {
      List {
        ForEach(store.agents) { agent in
          // A link with no chevron: the Mac's row has none.
          ZStack {
            NavigationLink(value: agent.id) { EmptyView() }.opacity(0)
            AgentRow(agent: agent, members: store.members(of: agent), call: store.call?.agentId == agent.id ? store.call : nil)
          }
          .listRowBackground(Ink.listGround)
          .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
          .listRowSeparator(.hidden)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Ink.listGround)
      .overlay {
        if store.agents.isEmpty && !store.isLoading {
          ContentUnavailableView("No agents yet", systemImage: "square.and.pencil", description: Text("Tap the pencil to make your first agent."))
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
          } label: {
            Image(systemName: "square.and.pencil")
          }
          .accessibilityLabel("New")
        }
      }
      .navigationDestination(for: String.self) { agentId in
        ChatView(agentId: agentId, opening: openingCall(for: agentId))
      }
      .refreshable { await store.reloadRoster() }
    }
    .tint(Ink.primary)
    .sheet(item: $sheet) { which in
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
    .alert("Something went wrong", isPresented: Binding(get: { store.problem != nil }, set: { if !$0 { store.problem = nil } })) {
      Button("OK", role: .cancel) { store.problem = nil }
    } message: {
      Text(store.problem ?? "")
    }
    .task(id: store.agents.isEmpty) { openAtLaunch() }
  }

  private func open(_ agentId: String) {
    sheet = nil
    path = [agentId]
  }

  /** `--screen=chat:theo`, `call:theo`, `call-full:theo`, `agent:simeon`, `new-agent`, `new-group`, `search`, `settings`. */
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

/** One agent or group in the list: the Mac's row at the phone's size (butterfly 52, name semibold, title in blue, the time, the last line). */
struct AgentRow: View {
  let agent: Agent
  let members: [Agent]
  let call: CallState?

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      AgentAvatar(agent: agent, members: members)
        .frame(width: 52, height: 52)
      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(agent.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(1)
          if !agent.title.isEmpty {
            Text(agent.title).font(.system(size: 14)).foregroundStyle(Ink.title).lineLimit(1)
          }
          Spacer(minLength: 4)
          if let call {
            CallChip(call: call)
          } else if let at = agent.lastActivityAt, at > 0 {
            Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000))).font(.system(size: 14)).foregroundStyle(Ink.secondary)
          }
        }
        HStack(spacing: 8) {
          Text(line).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
          Spacer(minLength: 0)
          if agent.hasUnread {
            Circle().fill(Ink.unread).frame(width: 10, height: 10).accessibilityLabel("Unread")
          }
        }
      }
    }
    .padding(.vertical, 4)
  }

  private var line: String {
    if agent.isBusy, let activity = agent.activityLabel { return activity }
    if agent.isComposing { return "Typing…" }
    return agent.lastMessagePreview ?? agent.description
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
