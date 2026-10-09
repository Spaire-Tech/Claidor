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
          } else if store.agents.isEmpty && (store.isLoading || session.firstRun == .checking) {
            MacSettingUp()
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
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
      store.isForeground = true
      // The window coming forward reads the computers again (at most once a minute, not mid-rebuild).
      store.windowCameForward(rebuilding: store.rebuild.isHardLocked)
    }
    // The sidebar says when the agents cannot be read; no alert on top of it (the window's).
    .onAppear { store.reportsRosterFailure = false }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in store.isForeground = false }
  }
}

/** The boot screen (`C0t`): "Setting up Simeon's computer" in its moving light, while the agents are first read. */
struct MacSettingUp: View {
  static let words = "Setting up Simeon's computer"

  var body: some View {
    // The moving light, or plain words for those who reduce motion (ShimmerText does both).
    ShimmerText(text: Self.words, font: .system(size: 17, weight: .medium))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Self.words)
  }
}

/**
 * The window once signed in, in Apple's parts: the agents in the sidebar,
 * the open agent's chat (or the new chat's To: line) as the detail, and the
 * agent's pane as the inspector beside it (480 wide, 280 at least; the
 * sidebar becomes its rail while it is open). Questions are sheets in the
 * window's words.
 */
struct MacWindow: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @Environment(SessionController.self) private var session
  @Environment(\.openWindow) private var openWindow
  @State private var columns = NavigationSplitViewVisibility.all
  @State private var askingName = false

  var body: some View {
    @Bindable var navigation = navigation
    @Bindable var newChat = navigation.newChat
    NavigationSplitView(columnVisibility: $columns) {
      MacSidebar()
        .navigationSplitViewColumnWidth(min: navigation.railShown ? 72 : 220, ideal: navigation.railShown ? 72 : 280, max: navigation.railShown ? 88 : 420)
    } detail: {
      detail
        .inspector(isPresented: Binding(get: { paneVisible }, set: { open in if !open { navigation.closePane() } })) {
          if let id = navigation.selected {
            MacAgentPane(agentId: id)
              .id(id)
              .inspectorColumnWidth(min: 280, ideal: 480, max: 480)
          }
        }
    }
    // Simeon's computer rebuilt or out of reach: the pills at the top, the dialogs (MacRebuild.swift).
    .modifier(MacRebuildSurfaces())
    // Esc closes the pane when nothing in front of it took the key (the window's `CDn`).
    .onExitCommand { if navigation.paneOpen { navigation.closePane() } }
    .onChange(of: paneVisible, initial: true) { _, now in navigation.paneShown = now }
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
        // "Toggle details" on ⇧⌘I too, as the window has it on a Mac (⌥⌘B is in the View menu).
        Button("") { navigation.toggleDetails() }.keyboardShortcut("i", modifiers: [.command, .shift])
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
    .sheet(item: $navigation.confirm) { confirmation in
      MacConfirmSheet(confirmation: confirmation)
        .environment(navigation)
    }
    .sheet(isPresented: $askingName) {
      MacNameSheet { askingName = false }
        .environment(store)
        .environment(session)
    }
    .alert(NewChat.limitTitle, isPresented: $newChat.limitReached) {
      Button("Got it", role: .cancel) {}
    } message: {
      Text(NewChat.limitMessage)
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
    // The name the agents call the person, asked once the first run is over and none was given (the window's name sheet).
    .task(id: session.nameNeeded) {
      guard session.nameNeeded else { return }
      try? await Task.sleep(nanoseconds: 4_000_000_000)
      if session.nameNeeded && session.firstRun == .done { askingName = true }
    }
    // A new agent's chat shows once it has something, or after 20 s; another agent opened lets it go.
    .task(id: newChat.creating?.id) {
      guard let started = newChat.creating?.id else { return }
      try? await Task.sleep(nanoseconds: 20_000_000_000)
      if newChat.creating?.id == started { newChat.creating = nil }
    }
    // Another agent opened while the new one is made, or after: the creating screen lets it go.
    .onChange(of: navigation.selected) { _, now in
      if let creating = newChat.creating, now != creating.agentId, now != creating.from { newChat.creating = nil }
    }
  }

  @ViewBuilder
  private var detail: some View {
    let newChat = navigation.newChat
    if newChat.isOpen {
      MacNewChatView()
    } else if let creating = newChat.creating, !revealed(creating) {
      MacCreatingScreen()
    } else if let id = navigation.selected, store.agent(id) != nil {
      MacChat(agentId: id).id(id)
    } else {
      MacNoChat()
    }
  }

  /** The creating screen gives way when the new agent is open and has lines, is working, or was made with nothing to show. */
  private func revealed(_ creating: MacNewChatState.Creating) -> Bool {
    guard let id = creating.agentId, navigation.selected == id, let agent = store.agent(id) else { return false }
    if !creating.expectsContent { return true }
    return !store.rows(for: id).isEmpty || agent.isRunning || agent.isRunningTurn
  }

  /** The pane is on screen: open, with an agent to show, and no new chat over the chat. */
  private var paneVisible: Bool { navigation.paneOpen && store.agent(navigation.selected) != nil && !navigation.newChat.isOpen }

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
    case .hiddenAgents:
      MacHiddenAgents { id in navigation.sheet = nil; navigation.selected = id }
    case .palette:
      MacPalette()
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
      Button("New Agent") { navigation.openNewChat() }
        .buttonStyle(.glass)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
  }
}

/**
 * The name sheet after the first run (`__simeonNameSheet`): "What should
 * your agents call you?", the name the server suggests in the field, Not
 * now or Continue ("Saving…"); "Couldn’t save your name. Try again." when it
 * fails.
 */
struct MacNameSheet: View {
  let done: () -> Void
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @State private var name = ""
  @State private var saving = false
  @State private var failed = false
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("What should your agents call you?").font(.system(size: 15, weight: .semibold))
      Text(Onboarding.nameNote).font(.system(size: 13)).foregroundStyle(.secondary)
      TextField(Onboarding.namePlaceholder, text: $name)
        .textFieldStyle(.roundedBorder)
        .focused($focused)
        .accessibilityLabel(Onboarding.namePlaceholder)
        .onChange(of: name) { _, now in if now.count > 60 { name = String(now.prefix(60)) } }
        .onSubmit { save() }
      if failed {
        Text("Couldn\u{2019}t save your name. Try again.").font(.system(size: 12)).foregroundStyle(Ink.danger)
      }
      HStack {
        Spacer()
        Button("Not now") { done() }
          .keyboardShortcut(.cancelAction)
        Button(saving ? "Saving\u{2026}" : "Continue") { save() }
          .keyboardShortcut(.defaultAction)
          .disabled(saving || Onboarding.normalizedName(name).isEmpty)
      }
    }
    .padding(20)
    .frame(width: 380)
    .onAppear {
      name = session.suggestedName ?? ""
      focused = true
    }
  }

  private func save() {
    let typed = Onboarding.normalizedName(name)
    guard !typed.isEmpty, !saving else { return }
    saving = true
    failed = false
    Task {
      if await store.saveNameReporting(typed) {
        session.nameNeeded = false
        done()
      } else {
        failed = true
      }
      saving = false
    }
  }
}
