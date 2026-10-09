import AppKit
import SwiftUI
import SimeonCore

/**
 * The open agent's chat, the window's detail: the iPhone's conversation
 * (`ChatMessages`, every row and card) and composer (`ChatComposer`), with
 * the call's pill above while one is on. Its name sits in the middle of the
 * toolbar, as the Electron window's header has it (the butterfly and the
 * name; a click opens the agent's page); Call, the computer and the page are
 * toolbar buttons. A message's actions are its right-click menu.
 */
struct MacChat: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @Environment(\.openWindow) private var openWindow
  @State private var actions = ChatActions()
  @State private var messageMenu = MessageMenu()
  @State private var reply = ReplyDraft()
  @State private var showsCall = false
  @State private var showsTranscript = false
  @State private var exchange: ExchangeRoute?

  var body: some View {
    let agent = store.agent(agentId)
    ChatMessages(agentId: agentId)
      .environment(actions)
      .environment(messageMenu)
      .safeAreaBar(edge: .top, spacing: 0) {
        ChatCallSlot(agentId: agentId, showsCall: $showsCall, showsTranscript: $showsTranscript)
      }
      .safeAreaBar(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId) }
      .environment(reply)
      .background(Ink.ground)
      .navigationTitle(agent?.name ?? "")
      .toolbar(removing: .title)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Button { openPage() } label: { MacChatTitle(agentId: agentId) }
            .buttonStyle(.plain)
            .help("Show \(agent?.name ?? "the agent")'s page")
        }
        ToolbarItemGroup(placement: .primaryAction) {
          if store.canCall && agent?.isGroup == false {
            Button { if let agent { store.startCall(agent) } } label: { Label("Call", systemImage: "phone") }
              .disabled(agent == nil || store.call != nil)
              .help("Call \(agent?.name ?? "")")
          }
          if agent?.isGroup == false {
            Button { openWindow(id: "computer", value: agentId) } label: { Label("Computer", systemImage: "display") }
              .help("Open \(agent?.name ?? "the agent")'s computer")
          }
          Button { openPage() } label: { Label("Info", systemImage: "info.circle") }
            .help(agent?.isGroup == true ? "Members" : "Profile, routines and computer")
        }
      }
      .sheet(isPresented: $showsCall) {
        CallScreen(showsTranscript: $showsTranscript)
          .frame(width: 420, height: 640)
      }
      .sheet(item: $exchange) { route in
        NavigationStack {
          ExchangePage(route: route)
            .toolbar { ToolbarItem(placement: .cancellationAction) { CloseButton() } }
        }
        .frame(width: 520, height: 640)
      }
      .onAppear {
        actions.openPage = { openPage() }
        actions.openComputer = { openWindow(id: "computer", value: agentId) }
        actions.openExchange = { exchange = $0 }
      }
      .task { await store.open(agentId) }
      .onDisappear { store.close(agentId) }
  }

  private func openPage() { navigation.sheet = .agentPage(agentId, routine: nil) }
}

/** The toolbar's middle: the agent's butterfly (a group's members side by side) and its name, as the Electron window's header card. */
struct MacChatTitle: View {
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    if let agent = store.agent(agentId) {
      HStack(spacing: 8) {
        AgentAvatar(agent: agent, members: store.members(of: agent), groupInARow: true, moves: true)
          .frame(width: agent.isGroup ? nil : 24, height: 24)
        VStack(alignment: .leading, spacing: 0) {
          Text(agent.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary).lineLimit(1)
          if !agent.title.isEmpty {
            Text(agent.title).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
      .padding(.horizontal, 6)
      .accessibilityElement(children: .combine)
    }
  }
}

/**
 * A message's right-click menu (the Electron window's message menu,
 * `message-actions.tsx`): its reactions in one row (👍 👎 ❤️ 😂 🎉 😮), then
 * Reply and Copy.
 */
struct MessageContextMenu: View {
  let bubble: Bubble
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?

  static let reactions = ["👍", "👎", "❤️", "😂", "🎉", "😮"]

  var body: some View {
    ControlGroup {
      ForEach(Self.reactions, id: \.self) { emoji in
        Button(emoji) { Task { await store.react(emoji, to: bubble.id, in: agentId) } }
      }
    }
    .controlGroupStyle(.palette)
    Divider()
    Button { reply?.target = bubble } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
    Button { UIPasteboard.general.string = bubble.text } label: { Label("Copy", systemImage: "doc.on.doc") }
  }
}

/**
 * Jump To (⌘K, the Electron window's palette): the iPhone's search, with
 * everything the window's has (All, Messages, Agents, Groups, Files, Links,
 * Routines, Actions), under one field. A result opens where it is.
 */
struct MacPalette: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @Environment(\.openSettings) private var openSettings
  @State private var query = ""
  @FocusState private var focused: Bool

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .medium)).foregroundStyle(.secondary)
        TextField("Search agents, messages, files and actions", text: $query)
          .textFieldStyle(.plain)
          .font(.system(size: 15))
          .focused($focused)
          .onSubmit { navigation.sheet = nil }
      }
      .padding(.horizontal, 16)
      .frame(height: 48)
      Divider()
      SearchResults(
        query: query,
        openChat: { id in close(); navigation.selected = id },
        openEntry: { agentId, entryId in
          close()
          store.revealing[agentId] = entryId
          navigation.selected = agentId
        },
        openRoutine: { hit in navigation.sheet = .agentPage(hit.agentId, routine: hit.routine.id) },
        openSheet: { which in
          switch which {
          case .newAgent: navigation.sheet = .newAgent
          case .newGroup: navigation.sheet = .newGroup
          case .settings: close(); openSettings()
          }
        },
        showHidden: { navigation.sheet = .hiddenAgents }
      )
    }
    .frame(width: 640, height: 540)
    .onAppear { focused = true }
    .onExitCommand { close() }
  }

  private func close() { navigation.sheet = nil }
}
