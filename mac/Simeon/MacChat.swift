import AppKit
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

/**
 * The open agent's chat, the window's detail: the iPhone's conversation
 * (`ChatMessages`, every row and card) and composer (`ChatComposer`), with
 * the call in its own banner (`MacCallBanner`), not in the chat. Its name
 * sits in the middle of the toolbar, as the Electron window's header has it
 * (the butterfly and the name; a click opens the agent's page); Call, the
 * computer and the page are toolbar buttons. A message's actions are its right-click menu. A thread
 * opens in the chat's place, under its breadcrumb (the agent › the thread;
 * Esc goes back), as the window's thread view does.
 */
struct MacChat: View {
  let agentId: String
  /** Shown under the new chat's To: line (its one agent): the line stands in for the header and its buttons. */
  var inNewChat = false
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @Environment(\.openWindow) private var openWindow
  @State private var actions = ChatActions()
  @State private var messageMenu = MessageMenu()
  @State private var reply = ReplyDraft()
  @State private var exchange: ExchangeRoute?
  @State private var finding = false
  @State private var findQuery = ""
  @State private var findCurrent: ChatFind.Match?
  @State private var dropping = false
  @State private var hostWindow: NSWindow?
  @State private var pasteMonitor: Any?
  @Environment(\.openSettings) private var openSettings
  @AppStorage("simeon.theme") private var theme = "system"

  var body: some View {
    let agent = store.agent(agentId)
    let thread = store.openThreads[agentId]
    ChatMessages(agentId: agentId, thread: thread)
      .id(thread ?? "chat")
      .environment(actions)
      .environment(messageMenu)
      .safeAreaBar(edge: .top, spacing: 0) {
        VStack(spacing: 0) {
          // Low disk, under the toolbar (`D8n`).
          MacDiskBanner()
          if finding {
            MacFindBar(query: $findQuery, matches: findMatches, current: findCurrent, step: findStep, close: closeFind)
              .transition(.move(edge: .top).combined(with: .opacity))
          }
        }
        .animation(.snappy(duration: 0.2), value: finding)
      }
      .safeAreaBar(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId, thread: thread).id(thread ?? "chat") }
      // Esc leaves a thread (the window's), unless find is open, which Esc closes first; else it closes the agent's pane (`CDn`). A sheet takes its own Esc.
      .onExitCommand {
        if thread != nil && !finding { leaveThread() } else if !finding && navigation.paneOpen { navigation.closePane() }
      }
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
        if !inNewChat {
          ToolbarItem(placement: .principal) {
            if let thread {
              // In a thread, the window's breadcrumb: the agent (back to the chat) › the thread; its details button toggles the pane.
              ThreadBreadcrumb(agentId: agentId, rootId: thread, back: leaveThread, details: { navigation.toggleDetails() })
            } else {
              // The window's header button (`aSn`): the agent's pane, opened on Profile, or closed.
              Button { navigation.toggleAgentSettings() } label: { MacChatTitle(agentId: agentId) }
                .buttonStyle(.plain)
                .help("View agent settings")
                .accessibilityLabel("View agent settings")
                .accessibilityValue(navigation.paneOpen ? "expanded" : "collapsed")
            }
          }
          ToolbarItemGroup(placement: .primaryAction) {
            if store.canCall && agent?.isGroup == false {
              // One call at a time: while one is on, Call brings its banner forward (`voice-call-window.ts`).
              Button { if let agent { MacCallBanner.call(agent, store: store) } } label: { Label("Call", systemImage: "phone") }
                .disabled(agent == nil)
                .help("Call \(agent?.name ?? "")")
            }
          }
        }
      }
      .sheet(item: $exchange) { route in
        NavigationStack {
          ExchangePage(route: route)
            .toolbar { ToolbarItem(placement: .cancellationAction) { CloseButton() } }
        }
        .frame(width: 520, height: 640)
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
        actions.openRoutine = { id in navigation.openPane(.routines, agent: agentId, routine: id) }
        // The hand-off card's Take over and Open computer: the computer started, its window open (`XOn` `_`, trigger "handoff").
        actions.openComputer = { store.openComputer(agentId); openWindow(id: "computer", value: agentId) }
        actions.openExchange = { exchange = $0 }
        actions.openThread = { root in store.openThread(root, in: agentId) }
        actions.slashActions = { slashActions() }
        actions.runSlashAction = { id in runSlashAction(id) }
        watchPaste()
        // The open agent's computer is followed while its chat shows (`XOn`'s `NTn`): its hand-off makes the card wait.
        if agent?.isGroup != true { store.watchComputer(agentId) }
      }
      .task { await store.open(agentId) }
      .onDisappear {
        if agent?.isGroup != true { store.unwatchComputer(agentId) }
        store.closeThread(in: agentId)
        store.close(agentId)
        if let pasteMonitor { NSEvent.removeMonitor(pasteMonitor) }
        pasteMonitor = nil
      }
  }

  private func openPage() { navigation.openPane(.profile, agent: agentId) }

  /** Back from a thread to the chat (the agent's name in the breadcrumb, or Esc); what was being answered is let go. */
  private func leaveThread() {
    reply.target = nil
    withAnimation(.snappy(duration: 0.2)) { store.closeThread(in: agentId) }
  }

  // MARK: The app's actions after "/"

  /**
   * The palette's commands "/" offers (the window's `getComposerAppActions`,
   * in its order), those this app runs today: Open Hidden Agents (when some
   * are), Members (a group), Chat Settings, Settings: General, Plugins, and
   * Theme: System, Light and Dark.
   */
  private func slashActions() -> [ComposerLists.Action] {
    var out: [ComposerLists.Action] = []
    if !store.hiddenAgents.isEmpty {
      out.append(.init(id: "open-hidden-chats", label: "Open Hidden Agents", keywords: ["hidden", "unhide", "hide", "sidebar", "bots"], detail: "Sidebar"))
    }
    if let agent = store.agent(agentId) {
      if agent.isGroup && !agent.isRemoteRoom {
        out.append(.init(id: "info:members", label: "Members", keywords: ["people", "group", "participants"], detail: "Current chat"))
      }
      out.append(.init(id: "info:settings", label: "Chat Settings", keywords: ["details", "notifications"], detail: "Current chat"))
    }
    out.append(.init(id: "settings:general", label: "Settings: General", keywords: ["account", "model", "notifications", "preferences", "appearance", "theme", "mode", "security", "yubikey", "webauthn"], detail: "Settings"))
    out.append(.init(id: "overlay:plugins", label: "Plugins", keywords: ["plugins", "marketplace", "tools", "skills", "mcp", "connectors", "customize"]))
    out.append(.init(id: "theme:system", label: "Theme: System", keywords: ["appearance", "os", "auto", "follow"], detail: "Settings · Appearance"))
    out.append(.init(id: "theme:light", label: "Theme: Light", keywords: ["appearance", "day", "bright"], detail: "Settings · Appearance"))
    out.append(.init(id: "theme:dark", label: "Theme: Dark", keywords: ["appearance", "night", "mode"], detail: "Settings · Appearance"))
    if store.updateFacts.paletteAction != nil {
      out.append(.init(id: "update:computer", label: "Update Simeon's Computer", keywords: ["box", "image", "machine", "recreate", "latest", "shared"], detail: "Updates"))
    }
    return out
  }

  private func runSlashAction(_ id: String) {
    switch id {
    case "open-hidden-chats": navigation.sheet = .hiddenAgents
    // Members opens on the Computer tab, where a group's members are (a request with no section lands there); Chat Settings on Profile.
    case "info:members": navigation.openPane(.computer, agent: agentId)
    case "info:settings": navigation.openPane(.profile, agent: agentId)
    case "settings:general": openSettings()
    case "overlay:plugins": navigation.connectAppsAsked = true
    case "theme:system", "theme:light", "theme:dark":
      theme = String(id.dropFirst("theme:".count))
      MacAppearance.apply(theme)
    case "update:computer":
      if let action = store.updateFacts.paletteAction {
        navigation.updateConfirm = .init(busy: action == .busyOverride, workingNames: store.updateFacts.workingNames)
      }
    default: break
    }
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

/**
 * "More emoji" (the window's "Choose an emoji"): "Search emoji" at the top;
 * with nothing typed every group in its order ("Smileys & emotion", "People
 * & body"…), each under its name, eight to a row, skin tones included; with
 * something typed, "Results" (up to 96, as the window finds them) or "No
 * emoji found". A pick reacts with it (again takes it back) and closes.
 */
struct MacEmojiPicker: View {
  /** The reactions already yours on the message. */
  var mine: [String] = []
  let pick: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @FocusState private var searching: Bool

  private static let columns = Array(repeating: GridItem(.fixed(30), spacing: 4), count: 8)

  var body: some View {
    let typed = !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
        TextField("Search emoji", text: $query)
          .textFieldStyle(.plain)
          .focused($searching)
          .accessibilityLabel("Search emoji")
      }
      .padding(.horizontal, 10).padding(.vertical, 8)
      Divider()
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 8, pinnedViews: [.sectionHeaders]) {
          if typed {
            let found = EmojiCatalog.search(query)
            if found.isEmpty {
              Text("No emoji found").font(.system(size: 13)).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity).padding(.vertical, 24)
            } else {
              section("Results", found)
            }
          } else {
            ForEach(EmojiCatalog.categories) { category in section(category.label, category.emojis) }
          }
        }
        .padding(.horizontal, 8).padding(.bottom, 8)
      }
    }
    .frame(width: 294, height: 320)
    .accessibilityLabel("Choose an emoji")
    .onAppear { searching = true }
  }

  private func section(_ label: String, _ emojis: [Emoji]) -> some View {
    Section {
      LazyVGrid(columns: Self.columns, alignment: .leading, spacing: 4) {
        ForEach(emojis) { emoji in
          let yours = mine.contains(emoji.character)
          Button { pick(emoji.character); dismiss() } label: {
            Text(emoji.character).font(.system(size: 22)).frame(width: 30, height: 30)
              .background(yours ? Color.accentColor.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .help(emoji.name)
          .accessibilityLabel(yours ? "Remove \(emoji.name) reaction" : "React with \(emoji.name)")
          .accessibilityAddTraits(yours ? .isSelected : [])
        }
      }
    } header: {
      Text(label).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8).padding(.bottom, 2)
        .background(.bar)
        .accessibilityAddTraits(.isHeader)
    }
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

  /**
   * "Save image…": the save panel with "image.png" ("image.jpg"… for the
   * picture's own type), the Images types offered, as Electron's; false only
   * when the file could not be written.
   */
  @MainActor
  static func saveImage(_ data: Data) async -> Bool {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "image.\(imageExtension(data))"
    panel.allowedContentTypes = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].compactMap { UTType(filenameExtension: $0) }
    panel.allowsOtherFileTypes = true
    panel.canCreateDirectories = true
    guard panel.runModal() == .OK, let url = panel.url else { return true }
    return (try? data.write(to: url, options: .atomic)) != nil
  }

  /** A picture's type by its first bytes, as Electron names it from its MIME type ("png" when not known). */
  static func imageExtension(_ data: Data) -> String {
    let head = [UInt8](data.prefix(12))
    if head.starts(with: [0xFF, 0xD8, 0xFF]) { return "jpg" }
    if head.starts(with: [0x47, 0x49, 0x46]) { return "gif" }
    if head.count >= 12, head[0...3] == [0x52, 0x49, 0x46, 0x46], head[8...11] == [0x57, 0x45, 0x42, 0x50] { return "webp" }
    if head.starts(with: [0x42, 0x4D]) { return "bmp" }
    if head.count >= 12, head[4...7] == [0x66, 0x74, 0x79, 0x70], head[8...11] == [0x61, 0x76, 0x69, 0x66] { return "avif" }
    if let text = String(data: data.prefix(256), encoding: .utf8), text.contains("<svg") { return "svg" }
    return "png"
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
    // A picture with no name, as the window names one pasted: "image.png".
    return [ComposerAttachment(name: "image.png", data: png, preview: image)]
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
 * A message's right-click menu (the window's "Message actions"): the
 * reaction row (👍 👎 ❤️ 😂 🎉 😮, then "More emoji"); "Reply" and "Start a
 * thread" (not inside a thread); "Copy" for words (`onCopy`: not a link card
 * or another card). The window's hover toolbar holds the same actions; on
 * the Mac they are this menu, as in Messages.
 */
struct MessageContextMenu: View {
  /** The message: its id is what the reaction, the reply and the thread name. */
  let bubble: Bubble
  let agentId: String
  /** What "Copy" copies; nil for none. */
  var copy: (() -> Void)?
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
          .accessibilityLabel(bubble.reactions.contains(emoji) ? "Remove \(emoji) reaction" : "React with \(emoji)")
      }
      Button { messageMenu?.target = MessageTarget(bubble: bubble) } label: { Label("More emoji", systemImage: "face.smiling") }
    }
    .controlGroupStyle(.palette)
    .accessibilityLabel("Add reaction")
    if thread == nil {
      Button { reply?.target = bubble } label: { Label("Reply", systemImage: bubble.fromPerson ? "arrowshape.turn.up.right" : "arrowshape.turn.up.left") }
      Button { actions?.openThread(bubble.id) } label: { Label("Start a thread", systemImage: "bubble.left.and.bubble.right") }
    }
    if let copy {
      Button(action: copy) { Label("Copy", systemImage: "doc.on.doc") }
    }
  }
}

/** A link's own items, first in its menu (Electron's): "Open link", "Copy link address". */
struct LinkMenuItems: View {
  let url: URL

  var body: some View {
    Button("Open link") { NSWorkspace.shared.open(url) }
    Button("Copy link address") {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(url.absoluteString, forType: .string)
    }
  }
}

/**
 * A picture's own items, first in its menu (Electron's): "Copy image",
 * "Save image…" (as "image.png", "image.jpg"…, in the Images types), and
 * "Copy image address" for a picture from the web.
 */
struct ImageMenuItems: View {
  /** The picture as drawn, for Copy. */
  let image: NSImage?
  /** Its bytes, for Save. */
  let bytes: () async -> Data?
  /** Where it is on the web, when it is there. */
  var address: String?
  @Environment(AppStore.self) private var store

  var body: some View {
    Button("Copy image") { if let image { MacFiles.copy(image) } }
      .disabled(image == nil)
    Button("Save image…") {
      Task {
        guard let data = await bytes() else { return }
        if !(await MacFiles.saveImage(data)) { store.problem = "Couldn't save this picture." }
      }
    }
    if let address, address.hasPrefix("https://") || address.hasPrefix("http://") {
      Button("Copy image address") {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(address, forType: .string)
      }
    }
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
        // The window opens the routine's agent on its Routines tab (`onOpenRoutine(agentId)`).
        openRoutine: { hit in close(); navigation.openPane(.routines, agent: hit.agentId) },
        openSheet: { which in
          switch which {
          // On the Mac a group is made on the new chat's To: line.
          case .newAgent, .newGroup: close(); navigation.openNewChat()
          case .settings: close(); openSettings()
          }
        },
        showHidden: { navigation.sheet = .hiddenAgents },
        updateComputer: store.updateFacts.paletteAction.map { action in
          { close(); navigation.updateConfirm = .init(busy: action == .busyOverride, workingNames: store.updateFacts.workingNames) }
        }
      )
    }
    .frame(width: 640, height: 540)
    .onAppear { focused = true }
    .onExitCommand { close() }
  }

  private func close() { navigation.sheet = nil }
}
