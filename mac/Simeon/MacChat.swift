import AppKit
import SwiftUI
import SimeonCore

/**
 * The open agent's chat, the window's detail: the iPhone's conversation
 * (`ChatMessages`, every row and card) and composer (`ChatComposer`), with
 * the call's pill above while one is on. Its name sits in the middle of the
 * toolbar, as the Electron window's header has it (the butterfly and the
 * name; a click opens the agent's page); Call, the computer and the page are
 * toolbar buttons. A message's actions are its right-click menu. A thread
 * opens in the chat's place, under "‹ Back to …" (Esc goes back), as the
 * window's thread view does.
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
  @State private var finding = false
  @State private var findQuery = ""
  @State private var findCurrent: ChatFind.Match?
  @State private var dropping = false
  @State private var hostWindow: NSWindow?
  @State private var pasteMonitor: Any?

  var body: some View {
    let agent = store.agent(agentId)
    let thread = store.openThreads[agentId]
    ChatMessages(agentId: agentId, thread: thread)
      .id(thread ?? "chat")
      .environment(actions)
      .environment(messageMenu)
      .safeAreaBar(edge: .top, spacing: 0) {
        VStack(spacing: 0) {
          if finding {
            MacFindBar(query: $findQuery, matches: findMatches, current: findCurrent, step: findStep, close: closeFind)
              .transition(.move(edge: .top).combined(with: .opacity))
          }
          ChatCallSlot(agentId: agentId, showsCall: $showsCall, showsTranscript: $showsTranscript)
        }
        .animation(.snappy(duration: 0.2), value: finding)
      }
      .safeAreaBar(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId, thread: thread).id(thread ?? "chat") }
      .environment(reply)
      .background(Ink.ground)
      .background { WindowReader(window: $hostWindow) }
      // Files dropped anywhere on the chat go into the composer (the window's "Drop files to add to chat").
      .dropDestination(for: URL.self) { urls, _ in
        let files = MacFiles.attachments(urls)
        guard !files.isEmpty else { return false }
        attach(files)
        return true
      } isTargeted: { over in dropping = over }
      .overlay {
        if dropping {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(Ink.blue, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            .background(Ink.ground.opacity(0.85), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay { Label("Drop files to add to chat", systemImage: "paperclip").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary) }
            .padding(12)
            .allowsHitTesting(false)
        }
      }
      .navigationTitle(agent?.name ?? "")
      .toolbar(removing: .title)
      .toolbar {
        ToolbarItem(placement: .principal) {
          if let thread {
            // In a thread, the window's breadcrumb: the agent (back to the chat) › the thread.
            ThreadBreadcrumb(agentId: agentId, rootId: thread, back: leaveThread, details: openPage)
          } else {
            Button { openPage() } label: { MacChatTitle(agentId: agentId) }
              .buttonStyle(.plain)
              .help("Show \(agent?.name ?? "the agent")'s page")
          }
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
      // "More Emoji…" from a message's menu: any reaction.
      .sheet(item: Binding(get: { messageMenu.target }, set: { messageMenu.target = $0 })) { target in
        MacEmojiPicker { emoji in Task { await store.react(emoji, to: target.bubble.id, in: agentId) } }
      }
      .onReceive(NotificationCenter.default.publisher(for: .simeonFind)) { note in
        switch note.object as? String {
        case "next": findStep(1)
        case "previous": findStep(-1)
        default: finding = true
        }
      }
      .onChange(of: findQuery) { _, _ in
        // As you type, to the newest match (a chat is read from its end), as the window's find counts from it.
        findCurrent = ChatFind.first(findMatches)
        if let findCurrent { actions.jump(findCurrent.rowId) }
      }
      .onChange(of: thread) { _, _ in
        findCurrent = ChatFind.first(findMatches)
      }
      .onAppear {
        actions.openPage = { openPage() }
        actions.openComputer = { openWindow(id: "computer", value: agentId) }
        actions.openExchange = { exchange = $0 }
        actions.openThread = { root in store.openThread(root, in: agentId) }
        watchPaste()
      }
      .task { await store.open(agentId) }
      .onDisappear {
        store.closeThread(in: agentId)
        store.close(agentId)
        if let pasteMonitor { NSEvent.removeMonitor(pasteMonitor) }
        pasteMonitor = nil
      }
  }

  private func openPage() { navigation.sheet = .agentPage(agentId, routine: nil) }

  /** Back from a thread to the chat (the agent's name in the breadcrumb). */
  private func leaveThread() {
    withAnimation(.snappy(duration: 0.2)) { store.closeThread(in: agentId) }
  }

  // MARK: Find in the chat

  /** Every time the words appear in the lines on screen: the chat's, or the open thread's. */
  private var findMatches: [ChatFind.Match] {
    let _ = store.rows(for: agentId).count + (store.threadRows[agentId]?.count ?? 0)
    return ChatFind.matches(findQuery, in: store.findableEntries(agentId))
  }

  /** To the next or previous match, lit as a quote's jump lights its message. */
  private func findStep(_ by: Int) {
    guard finding, let next = ChatFind.next(findMatches, from: findCurrent, step: by) else { return }
    findCurrent = next
    actions.jump(next.rowId)
  }

  private func closeFind() {
    finding = false
    findQuery = ""
    findCurrent = nil
  }

  // MARK: Files in

  private func attach(_ files: [ComposerAttachment]) {
    NotificationCenter.default.post(name: .simeonAttachFiles, object: AttachRequest(agentId: agentId, files: files))
  }

  /**
   * ⌘V with files or a picture on the clipboard, in this chat's window: they
   * go into the composer, as the window takes a pasted file. Text pastes as
   * text.
   */
  private func watchPaste() {
    guard pasteMonitor == nil else { return }
    pasteMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
            event.charactersIgnoringModifiers == "v",
            let window = hostWindow, event.window === window,
            let files = MacFiles.pasted(), !files.isEmpty else { return event }
      attach(files)
      return nil
    }
  }
}

/** The window holding a view, for a key watch that must only act in it. */
struct WindowReader: NSViewRepresentable {
  @Binding var window: NSWindow?

  func makeNSView(context: Context) -> NSView {
    let view = NSView()
    DispatchQueue.main.async { window = view.window }
    return view
  }

  func updateNSView(_ view: NSView, context: Context) {
    if window !== view.window { DispatchQueue.main.async { window = view.window } }
  }
}

/** Files for a chat's composer, from a drop or a paste. */
struct AttachRequest {
  let agentId: String
  let files: [ComposerAttachment]
}

extension Notification.Name {
  /** Files dropped on or pasted into a chat, for its composer (ios/Simeon/ChatView.swift). */
  static let simeonAttachFiles = Notification.Name("simeon.attach-files")
  /** ⌘F, ⌘G and ⇧⌘G: find in the open chat (object: nil, "next" or "previous"). */
  static let simeonFind = Notification.Name("simeon.find")
}

/**
 * Find in the chat (⌘F, the window's find bar): the field ("Find in chat"),
 * the count as the window writes it ("2/5", "0/0" in red), Previous match
 * and Next match (⇧⌘G and ⌘G, Shift-Return and Return), and Close find
 * (Esc).
 */
struct MacFindBar: View {
  @Binding var query: String
  let matches: [ChatFind.Match]
  let current: ChatFind.Match?
  let step: (Int) -> Void
  let close: () -> Void
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
      TextField("Find in chat", text: $query)
        .textFieldStyle(.plain)
        .focused($focused)
        .onKeyPress(.return, phases: .down) { press in
          step(press.modifiers.contains(.shift) ? -1 : 1)
          return .handled
        }
        // Should the field take Return before the key press is heard, its submit steps instead.
        .onSubmit { step(NSEvent.modifierFlags.contains(.shift) ? -1 : 1) }
        .onExitCommand(perform: close)
      if !query.trimmingCharacters(in: .whitespaces).isEmpty {
        Text("\(ChatFind.ordinal(matches, current))/\(matches.count)")
          .font(.system(size: 12)).foregroundStyle(matches.isEmpty ? Ink.danger : .secondary).monospacedDigit()
      }
      ControlGroup {
        Button { step(-1) } label: { Image(systemName: "chevron.up") }.help("Previous match (⇧⌘G)").accessibilityLabel("Previous match")
        Button { step(1) } label: { Image(systemName: "chevron.down") }.help("Next match (⌘G)").accessibilityLabel("Next match")
      }
      .controlSize(.small)
      .fixedSize()
      .disabled(matches.isEmpty)
      Button(action: close) { Image(systemName: "xmark") }
        .buttonStyle(.borderless).controlSize(.small)
        .help("Close find").accessibilityLabel("Close find")
    }
    .padding(.horizontal, 12).padding(.vertical, 6)
    .glassEffect(.regular, in: .capsule)
    .padding(.horizontal, 12).padding(.top, 6)
    .onAppear { focused = true }
  }
}

/** "More Emoji…": every emoji, found by name ("party" finds 🎉), for a reaction the six don't hold. */
struct MacEmojiPicker: View {
  let pick: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
        TextField("Search emoji", text: $query).textFieldStyle(.plain)
      }
      .padding(12)
      Divider()
      ScrollView {
        LazyVGrid(columns: Array(repeating: GridItem(.fixed(36), spacing: 4), count: 9), spacing: 4) {
          ForEach(EmojiCatalog.search(query, limit: 2_000), id: \.character) { emoji in
            Button { pick(emoji.character); dismiss() } label: {
              Text(emoji.character).font(.system(size: 24)).frame(width: 36, height: 36).contentShape(.rect)
            }
            .buttonStyle(.plain)
            .help(emoji.name)
          }
        }
        .padding(10)
      }
    }
    .frame(width: 380, height: 420)
    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
  }
}

/** Saving a file from the computer to this Mac, copying a picture, and reading files dropped or pasted. */
enum MacFiles {
  /** The save panel in Downloads; false only when the file could not be written (a cancel is not a failure). */
  @MainActor
  static func save(_ data: Data, suggestedName: String) async -> Bool {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedName
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    panel.canCreateDirectories = true
    guard panel.runModal() == .OK, let url = panel.url else { return true }
    return (try? data.write(to: url, options: .atomic)) != nil
  }

  @MainActor
  static func copy(_ image: NSImage) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.writeObjects([image])
  }

  /** Files from this Mac as the composer holds them (a picture with its preview); folders and unreadable files left out. */
  static func attachments(_ urls: [URL]) -> [ComposerAttachment] {
    urls.filter(\.isFileURL).compactMap { url in
      var folder: ObjCBool = false
      guard FileManager.default.fileExists(atPath: url.path, isDirectory: &folder), !folder.boolValue,
            let data = try? Data(contentsOf: url) else { return nil }
      let isImage = FileKind.images.contains(url.pathExtension.lowercased())
      return ComposerAttachment(name: url.lastPathComponent, data: data, preview: isImage ? NSImage(data: data) : nil)
    }
  }

  /** What ⌘V would attach: files copied in the Finder, else a picture; nil when the clipboard holds neither. */
  @MainActor
  static func pasted() -> [ComposerAttachment]? {
    let board = NSPasteboard.general
    if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty {
      return attachments(urls)
    }
    guard board.canReadObject(forClasses: [NSImage.self], options: nil),
          let image = board.readObjects(forClasses: [NSImage.self], options: nil)?.first as? NSImage,
          let png = image.pngData() else { return nil }
    return [ComposerAttachment(name: "Pasted image.png", data: png, preview: image)]
  }
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
 * `message-actions.tsx`): its reactions in one row (👍 👎 ❤️ 😂 🎉 😮) and
 * More Emoji…, then Reply and Start a Thread (not inside a thread), Mark as
 * Unread, and Copy.
 */
struct MessageContextMenu: View {
  let bubble: Bubble
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?
  @Environment(MessageMenu.self) private var messageMenu: MessageMenu?
  @Environment(ChatActions.self) private var actions: ChatActions?
  @Environment(\.chatThread) private var thread

  static let reactions = ["👍", "👎", "❤️", "😂", "🎉", "😮"]

  var body: some View {
    ControlGroup {
      ForEach(Self.reactions, id: \.self) { emoji in
        Button(emoji) { Task { await store.react(emoji, to: bubble.id, in: agentId) } }
      }
    }
    .controlGroupStyle(.palette)
    Button { messageMenu?.target = MessageTarget(bubble: bubble) } label: { Label("More Emoji…", systemImage: "face.smiling") }
    Divider()
    if thread == nil {
      Button { reply?.target = bubble } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
      Button { actions?.openThread(bubble.id) } label: { Label("Start a Thread", systemImage: "bubble.left.and.bubble.right") }
    }
    Divider()
    if let link = bubble.loneLink {
      Button { NSWorkspace.shared.open(link) } label: { Label("Open Link", systemImage: "safari") }
      Button { UIPasteboard.general.string = link.absoluteString } label: { Label("Copy Link", systemImage: "link") }
    }
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
