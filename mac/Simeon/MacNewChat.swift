import AppKit
import SwiftUI
import SimeonCore

/**
 * The new chat (⌘N, the sidebar's New chat): the shipped window's To: line
 * (`L4n`) over an empty stage and its composer, in Apple's parts, as
 * Messages starts a conversation. Names are searched as they are typed;
 * picking an agent puts it on the line (and opens its chat behind, when it
 * is the only one); a name no agent has makes a new one; two or more make
 * a group named after them. Nothing is sent until the composer sends it.
 * Every rule is SimeonCore's `NewChat`, ported from the window.
 */
@MainActor
@Observable
final class MacNewChatState {
  /** The new chat's draft, kept as the window keeps it (`sand:new-chat`). */
  static let draftScope = "sand:new-chat"

  var isOpen = false
  var recipients: [NewChat.Recipient] = []
  var query = ""
  var highlighted = 0
  var menuOpen = false
  /** An agent being made: its name, and its id once the computer answers (the sidebar's "Creating…" row and the window's creating screen). */
  var creating: Creating?
  /** The host's "50 is the maximum": the window's alert. */
  var limitReached = false
  /** ⌘ held: the menu's rows show their numbers. */
  var commandHeld = false
  /** What the composer under the line is told (its placeholder, Send held, the message taken). */
  let hook = ComposerHook()

  struct Creating: Equatable {
    let id = UUID()
    let name: String
    var agentId: String?
    let expectsContent: Bool
    let started = Date()
  }

  /** Opened empty (the window's `openNewChat`: recipients cleared, the menu open as the field takes the focus). */
  func open() {
    recipients = []
    query = ""
    highlighted = 0
    menuOpen = true
    isOpen = true
    syncHook()
  }

  func close() {
    isOpen = false
    menuOpen = false
    query = ""
    syncHook()
  }

  func rows(_ store: AppStore) -> [NewChat.Row] {
    NewChat.rows(candidates: store.agents.map(NewChat.Candidate.init), recipients: recipients, query: query)
  }

  /** The line names one agent, the one open behind it: its chat shows under the line (the window's preview). */
  func previewId(_ navigation: MacNavigation) -> String? {
    guard recipients.count == 1, case .agent(let id, _) = recipients[0], navigation.selected == id else { return nil }
    return id
  }

  func syncHook() {
    hook.placeholder = isOpen ? NewChat.composerPlaceholder(recipients: recipients) : nil
    hook.sendDisabled = isOpen && recipients.isEmpty
  }

  // MARK: Picking

  /** A row clicked, or ⌘1–⌘9: Create new Agent, Create “x” on an empty line and a group open at once; an agent becomes a chip. */
  func choose(_ row: NewChat.Row, store: AppStore, navigation: MacNavigation) {
    if NewChat.commitsAtOnce(row, recipientCount: recipients.count) {
      commit(.single(row.recipient), store: store, navigation: navigation)
    } else {
      add(row.recipient, navigation: navigation)
    }
  }

  /** A chip (`z4n.add`): none past six or twice; the first agent's chat opens behind the line. */
  func add(_ recipient: NewChat.Recipient, navigation: MacNavigation) {
    guard let next = NewChat.adding(recipient, to: recipients) else { return }
    recipients = next
    if next.count == 1, case .agent(let id, _) = recipient { navigation.selected = id }
    query = ""
    syncHook()
  }

  /** A chip's ✕, or Backspace on an empty line for the last: when one agent is left, its chat opens behind. */
  func remove(at index: Int, navigation: MacNavigation) {
    guard recipients.indices.contains(index) else { return }
    recipients.remove(at: index)
    if recipients.count == 1, case .agent(let id, _) = recipients[0], navigation.selected != id { navigation.selected = id }
    syncHook()
  }

  /** Enter on the line (`J4n`, then `onCommit`). */
  func enter(store: AppStore, navigation: MacNavigation) {
    let list = rows(store)
    let lit = list.indices.contains(highlighted) ? list[highlighted] : nil
    commit(NewChat.commit(recipients: recipients, query: query, highlighted: lit), store: store, navigation: navigation)
  }

  /**
   * What the line asked for (`onCommit`): what is written is taken from the
   * composer, the new chat closes, and nothing is sent. A new agent with
   * something written is made quietly and gets it in its composer; with
   * nothing written it introduces itself (or takes a name that reads like a
   * request as its first message). An agent opens, with what was written in
   * its composer. Several make a group.
   */
  func commit(_ commit: NewChat.Commit, store: AppStore, navigation: MacNavigation) {
    if commit == .noop { return }
    let draft = hook.take?() ?? ComposerHook.Message(text: "", richText: nil, files: [])
    let written = !draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !draft.files.isEmpty
    close()
    switch commit {
    case .noop: return
    case .single(.new(let name)):
      if written {
        Task { await makeQuietly(name, draft: draft, store: store, navigation: navigation) }
      } else {
        Task { await launch(.new(name: name), text: "", files: [], store: store, navigation: navigation) }
      }
    case .single(.agent(let id, _)):
      if written { store.handDraft(to: id, text: draft.text, richText: draft.richText, files: Self.files(draft)) }
      navigation.selected = id
    case .group(let list):
      Task { await makeGroup(list, text: "", files: [], draft: written ? draft : nil, store: store, navigation: navigation) }
    }
  }

  /**
   * The composer's Send while the line is open (`submitNewChat`): the one
   * agent open behind it gets it as any message; else, with something
   * written, the agents are made (or opened) and it is sent to them.
   */
  func submit(_ message: ComposerHook.Message, store: AppStore, navigation: MacNavigation) -> ComposerHook.Outcome {
    guard let first = recipients.first else { return .kept }
    if previewId(navigation) != nil { return .sendHere }
    if message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && message.files.isEmpty { return .kept }
    let list = recipients
    close()
    if list.count == 1 {
      Task { await launch(first, text: message.text, files: message.files, richText: message.richText, store: store, navigation: navigation) }
    } else {
      Task { await makeGroup(list, text: message.text, files: message.files, draft: nil, store: store, navigation: navigation) }
    }
    return .taken
  }

  // MARK: Making them

  /** One recipient (`launchSingleRecipient`). */
  private func launch(_ recipient: NewChat.Recipient, text: String, files: [ComposerAttachment], richText: String? = nil, store: AppStore, navigation: MacNavigation) async {
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let written = !words.isEmpty || !files.isEmpty
    switch recipient {
    case .agent(let id, _):
      navigation.selected = id
      if written { await store.send(words, to: id, attachments: Self.pairs(files), richText: richText, id: AppStore.newMessageId()) }
    case .new(let name):
      let clean = NewChat.cleanName(name)
      creating = Creating(name: clean, expectsContent: true)
      let was = navigation.selected
      // A name that reads like a request, with nothing written, is the first message.
      let first = !words.isEmpty ? words : (!written && NewChat.looksLikeSentence(name) ? name : "")
      let sends = !first.isEmpty || written
      do {
        let id = try await store.makeAgent(name: clean, kickstart: !sends)
        creating?.agentId = id
        if navigation.selected == was { navigation.selected = id }
        if sends {
          await store.send(first, to: id, attachments: Self.pairs(files), richText: words.isEmpty ? nil : richText, id: AppStore.newMessageId())
        } else {
          await store.kickstart(id)
        }
      } catch {
        creating = nil
        refused(error, store: store)
      }
    }
  }

  /** A new agent for what was written (`Ae`): made without its introduction, what was written put in its composer. */
  private func makeQuietly(_ name: String, draft: ComposerHook.Message, store: AppStore, navigation: MacNavigation) async {
    let clean = NewChat.cleanName(name)
    creating = Creating(name: clean, expectsContent: false)
    let was = navigation.selected
    do {
      let id = try await store.makeAgent(name: clean, quiet: true)
      creating?.agentId = id
      store.handDraft(to: id, text: draft.text, richText: draft.richText, files: Self.files(draft))
      if navigation.selected == was { navigation.selected = id }
    } catch {
      let abandoned = navigation.selected != was
      creating = nil
      refused(error, store: store)
      guard !abandoned else { return }
      // Back where it was: the draft in the new chat, the line empty and open again.
      store.handDraft(to: Self.draftScope, text: draft.text, richText: draft.richText, files: Self.files(draft))
      open()
    }
  }

  /** Several recipients (`Ne`): the new ones made, then the group named after them all; on a failure the ones just made go again. */
  private func makeGroup(_ list: [NewChat.Recipient], text: String, files: [ComposerAttachment], draft: ComposerHook.Message?, store: AppStore, navigation: MacNavigation) async {
    let name = NewChat.groupName(list)
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    creating = Creating(name: name, expectsContent: !words.isEmpty || !files.isEmpty)
    let was = navigation.selected
    var made: [String] = []
    do {
      var members: [String] = []
      for recipient in list {
        switch recipient {
        case .agent(let id, _): members.append(id)
        case .new(let newName):
          let id = try await store.makeAgent(name: NewChat.cleanName(newName))
          members.append(id)
          made.append(id)
        }
      }
      let group = try await store.makeGroup(name: name, memberIds: members)
      made = []
      creating?.agentId = group
      if let draft { store.handDraft(to: group, text: draft.text, richText: draft.richText, files: Self.files(draft)) }
      if navigation.selected == was { navigation.selected = group }
      if !words.isEmpty || !files.isEmpty { await store.send(words, to: group, attachments: Self.pairs(files), id: AppStore.newMessageId()) }
    } catch {
      creating = nil
      refused(error, store: store)
      if !made.isEmpty { try? await store.deleteAgents(made) }
    }
  }

  /** The host's refusal: at 50 agents its own alert, else what it said. */
  private func refused(_ error: Error, store: AppStore) {
    let words = error.localizedDescription
    if words.contains(NewChat.limitError) { limitReached = true } else { store.problem = words }
  }

  private static func pairs(_ files: [ComposerAttachment]) -> [(name: String, data: Data)] { files.map { ($0.name, $0.data) } }
  private static func files(_ draft: ComposerHook.Message) -> [(name: String, data: Data)] { pairs(draft.files) }
}

/** The new chat in the window's place for a chat: the To: line, and under it the stage and composer, or the one agent's chat. */
struct MacNewChatView: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var barHeight: CGFloat = 40

  var body: some View {
    let state = navigation.newChat
    Group {
      if let id = state.previewId(navigation), store.agent(id) != nil {
        MacChat(agentId: id, inNewChat: true).id(id)
      } else {
        // The window's empty `sand-new-chat-stage`, then the composer.
        Color.clear
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Ink.ground)
          .safeAreaBar(edge: .bottom, spacing: 0) { ChatComposer(agentId: MacNewChatState.draftScope) }
      }
    }
    .environment(state.hook)
    .safeAreaBar(edge: .top, spacing: 0) {
      MacToLine().onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
    }
    // The menu hangs over the chat from under the line.
    .overlay(alignment: .topLeading) {
      if state.menuOpen {
        MacToMenu()
          .padding(.leading, 40)
          .padding(.top, barHeight + 4)
          .transition(.opacity)
      }
    }
    .animation(.snappy(duration: 0.15), value: state.menuOpen)
    .accessibilityLabel("New chat")
    .onAppear {
      state.hook.submit = { [weak state] message in state?.submit(message, store: store, navigation: navigation) ?? .kept }
      state.hook.afterSend = { [weak state] in state?.close() }
      state.syncHook()
    }
  }
}

/**
 * The To: line (`L4n`): "To:", a chip for each one picked (its ✕ "Remove
 * …"), the field, and ✕ "Close new chat" once someone is on it; the menu
 * under it lists who matches, Create first. Keys: ↑↓ move, Tab or , adds,
 * Backspace takes the last chip off, Return opens, Esc clears, closes the
 * menu, then the new chat; ⌘1–⌘9 pick a row, their numbers shown while ⌘
 * is held.
 */
struct MacToLine: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @FocusState private var focused: Bool
  @State private var monitor: Any?

  var body: some View {
    let state = navigation.newChat
    @Bindable var bindable = state
    let rows = state.rows(store)
    VStack(spacing: 0) {
      HStack(alignment: .center, spacing: 8) {
        Text("To:").font(.system(size: 13)).foregroundStyle(.secondary)
        ChipFlow(spacing: 6) {
          ForEach(Array(state.recipients.enumerated()), id: \.offset) { index, recipient in
            chip(recipient, index: index)
          }
          TextField(NewChat.fieldPlaceholder(recipients: state.recipients), text: $bindable.query)
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .frame(minWidth: 160)
            .focused($focused)
            .accessibilityLabel("Search or create Agents")
            .onKeyPress(phases: .down) { press in key(press, rows: rows) }
            .onSubmit { state.enter(store: store, navigation: navigation) }
        }
        if !state.recipients.isEmpty {
          Button { state.close() } label: {
            Image(systemName: "xmark.circle.fill").font(.system(size: 14)).foregroundStyle(.secondary)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Close new chat")
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      Divider()
    }
    .background(.bar)
    .onAppear {
      focused = true
      watchCommand()
    }
    .onDisappear {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
    }
    .onChange(of: focused) { _, now in state.menuOpen = now }
    .onChange(of: state.query) { _, _ in state.highlighted = NewChat.defaultHighlight(state.rows(store), query: state.query) }
    .onChange(of: state.recipients) { _, _ in state.highlighted = NewChat.defaultHighlight(state.rows(store), query: state.query) }
  }

  /** A chip (`j4n`): the agent's butterfly or a plus for one to be made, the name, and its ✕. */
  private func chip(_ recipient: NewChat.Recipient, index: Int) -> some View {
    HStack(spacing: 5) {
      if let id = recipient.agentId, let agent = store.agent(id) {
        AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 18, height: 18)
      } else {
        Image(systemName: "plus").font(.system(size: 10, weight: .semibold)).frame(width: 18, height: 18)
      }
      Text(recipient.name).font(.system(size: 13)).lineLimit(1)
      Button { navigation.newChat.remove(at: index, navigation: navigation) } label: {
        Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Remove \(recipient.name)")
    }
    .padding(.leading, 4).padding(.trailing, 8).padding(.vertical, 3)
    .background(Color.accentColor.opacity(0.14), in: Capsule())
  }

  /** The line's keys, as the window's (`j` in `L4n`). */
  private func key(_ press: KeyPress, rows: [NewChat.Row]) -> KeyPress.Result {
    let state = navigation.newChat
    if press.modifiers.contains(.command), let digit = Int(press.characters), (1...9).contains(digit) {
      guard state.menuOpen, digit - 1 < rows.count, digit - 1 < NewChat.shortcutRows else { return .ignored }
      state.choose(rows[digit - 1], store: store, navigation: navigation)
      return .handled
    }
    switch press.key {
    case .downArrow, .upArrow:
      if !state.menuOpen { state.menuOpen = true; return .handled }
      guard !rows.isEmpty else { return .handled }
      let step = press.key == .downArrow ? 1 : -1
      state.highlighted = min(max(state.highlighted + step, 0), rows.count - 1)
      return .handled
    case .tab:
      guard state.menuOpen, rows.indices.contains(state.highlighted) else { return .ignored }
      let row = rows[state.highlighted]
      if !NewChat.commitsAtOnce(row, recipientCount: state.recipients.count) { state.add(row.recipient, navigation: navigation) }
      return .handled
    case .delete:
      guard state.query.isEmpty, !state.recipients.isEmpty else { return .ignored }
      state.remove(at: state.recipients.count - 1, navigation: navigation)
      return .handled
    case .escape:
      if !state.query.isEmpty { state.query = "" } else if state.menuOpen { state.menuOpen = false } else { state.close() }
      return .handled
    default:
      if press.characters == ",", state.menuOpen, rows.indices.contains(state.highlighted) {
        let row = rows[state.highlighted]
        if !NewChat.commitsAtOnce(row, recipientCount: state.recipients.count) { state.add(row.recipient, navigation: navigation) }
        return .handled
      }
      return .ignored
    }
  }

  /** ⌘ held shows the rows' numbers; let go, they hide. */
  private func watchCommand() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { event in
      let held = event.modifierFlags.contains(.command)
      if held != navigation.newChat.commandHeld { navigation.newChat.commandHeld = held }
      return event
    }
  }
}

/** The menu under the To: line (`Recipients`): who matches, Create first, the lit row, ⌘ numbers while ⌘ is held, and the keys' hints. */
struct MacToMenu: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  /** The menu under the line (`Recipients`), and its keys' hints. */
  var body: some View {
    let state = navigation.newChat
    let rows = state.rows(store)
    VStack(alignment: .leading, spacing: 0) {
      if rows.isEmpty {
        Text(NewChat.emptyText(query: state.query))
          .font(.system(size: 13)).foregroundStyle(.secondary)
          .padding(12)
      } else {
        ScrollViewReader { scroller in
          ScrollView {
            VStack(spacing: 0) {
              ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                menuRow(row, index: index, lit: index == state.highlighted)
                  .id(index)
              }
            }
            .padding(4)
          }
          .frame(maxHeight: 300)
          .onChange(of: state.highlighted) { _, now in scroller.scrollTo(now) }
        }
        .accessibilityLabel("Recipients")
      }
      Divider()
      HStack(spacing: 12) {
        hint("Tab", "add")
        hint("\u{23CE}", "open")
      }
      .padding(.horizontal, 12).padding(.vertical, 6)
    }
    .frame(width: 320)
    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Ink.hairline, lineWidth: 0.5))
    .shadow(color: .black.opacity(0.18), radius: 16, y: 6)
  }

  private func menuRow(_ row: NewChat.Row, index: Int, lit: Bool) -> some View {
    Button { navigation.newChat.choose(row, store: store, navigation: navigation) } label: {
      HStack(spacing: 8) {
        if case .agent(let id, _, _) = row, let agent = store.agent(id) {
          AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 22, height: 22)
        } else {
          Image(systemName: "plus").font(.system(size: 11, weight: .semibold)).frame(width: 22, height: 22)
        }
        Text(row.label).font(.system(size: 13)).lineLimit(1)
        Spacer(minLength: 8)
        if navigation.newChat.commandHeld && index < NewChat.shortcutRows {
          Text("\u{2318}\(index + 1)").font(.system(size: 11).monospacedDigit()).foregroundStyle(lit ? .white.opacity(0.8) : .secondary)
        }
      }
      .foregroundStyle(lit ? .white : .primary)
      .padding(.horizontal, 8)
      .frame(height: 30)
      .background(lit ? Color.accentColor : .clear, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(lit ? .isSelected : [])
  }

  private func hint(_ cap: String, _ label: String) -> some View {
    HStack(spacing: 4) {
      Text(cap).font(.system(size: 10, weight: .medium))
        .padding(.horizontal, 4).padding(.vertical, 1)
        .overlay(RoundedRectangle(cornerRadius: 3).stroke(Ink.edge, lineWidth: 1))
      Text(label).font(.system(size: 11))
    }
    .foregroundStyle(.secondary)
  }

}

/** The window's creating screen (`H4n`): a spinner while the new agent is made, until its chat has something to show. */
struct MacCreatingScreen: View {
  var body: some View {
    ProgressView()
      .controlSize(.regular)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Ink.ground)
      .accessibilityLabel("Creating Agent")
  }
}

/** Chips and the field in rows that wrap, as Messages' To: field. */
struct ChipFlow: Layout {
  var spacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? 600
    var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
    for view in subviews {
      let size = view.sizeThatFits(.unspecified)
      if x > 0 && x + size.width > width { x = 0; y += row + spacing; row = 0 }
      x += size.width + spacing
      row = max(row, size.height)
    }
    return CGSize(width: width, height: y + row)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
    for (index, view) in subviews.enumerated() {
      var size = view.sizeThatFits(.unspecified)
      if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
      // The field, last, takes the rest of its row.
      if index == subviews.count - 1 { size.width = max(size.width, bounds.maxX - x) }
      view.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(width: size.width, height: size.height))
      x += size.width + spacing
      row = max(row, size.height)
    }
  }
}
