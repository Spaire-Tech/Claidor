import AppKit
import SwiftUI
import SimeonCore

/**
 * New chat (⌘N, step 5): the window's To: line (`L4n`) and what choosing
 * from it does (`HDn`). Who is on the line, the words typed, the row lit,
 * whether its menu is open, whether ⌘ is held (the rows' shortcuts show),
 * the message field under it (its own draft and files), and the agent or
 * group being made.
 */
@MainActor
@Observable
final class NewChatState {
  /** The draft's own key, as the window keeps the new chat's draft apart (`Zmt`). */
  static let draftKey = "__new-chat__"

  var isOpen = false
  var recipients: [NewChat.Recipient] = []
  var query = ""
  var highlight = 0
  var menuOpen = true
  var shortcutsShown = false
  /** Bumped to give the To: line the keys. */
  var focus = 0
  /** An agent or group being made, its name, until its chat opens (`creationScreen`). */
  var creating: String?
  /** The message field under the line: its files and the rest of a chat's own state. */
  let draftControl = ChatControl()

  /** ⌘N, the sidebar's New chat: the line empty, its menu open, the keys in it. */
  func open() {
    guard !isOpen else {
      focus += 1
      return
    }
    recipients = []
    query = ""
    highlight = 0
    menuOpen = true
    shortcutsShown = false
    isOpen = true
    focus += 1
  }

  func close() {
    isOpen = false
    query = ""
    shortcutsShown = false
  }

  /** The agents the line offers, as the roster lists them, and its rows for the words (`Bie`). */
  func rows(_ store: AppStore) -> [NewChat.Row] {
    NewChat.rows(candidates: store.agents.map(NewChat.Candidate.init), recipients: recipients, query: query)
  }

  /** The new chat is open with no agent's chat under it: the sidebar shows its draft row, and no row is the open agent's. */
  func hidesOpenRow(_ window: WindowState) -> Bool { isOpen && previewId(window) == nil }

  /** The single agent on the line while it is the open one: its chat shows under the line (`isNewChatPreviewActive`). */
  func previewId(_ window: WindowState) -> String? {
    guard recipients.count == 1, let id = recipients[0].agentId, window.selected == id else { return nil }
    return id
  }

  // MARK: The line

  func typed(_ text: String, store: AppStore) {
    query = text
    menuOpen = true
    highlight = NewChat.defaultHighlight(rows(store), query: text)
  }

  /** Tab, a comma, a click on a row that adds: the row becomes a chip and the words go (`z4n.add`). A single agent on the line opens under it. */
  func add(_ row: NewChat.Row, store: AppStore, window: WindowState) {
    guard let next = NewChat.adding(row.recipient, to: recipients) else { return }
    recipients = next
    query = ""
    menuOpen = true
    highlight = NewChat.defaultHighlight(rows(store), query: "")
    focus += 1
    preview(store: store, window: window)
  }

  func remove(at index: Int, store: AppStore, window: WindowState) {
    guard recipients.indices.contains(index) else { return }
    recipients.remove(at: index)
    highlight = NewChat.defaultHighlight(rows(store), query: query)
    focus += 1
    preview(store: store, window: window)
  }

  /** One agent on the line: its chat opens under it, as the window's `selectPreviewAgent`. */
  private func preview(store: AppStore, window: WindowState) {
    if recipients.count == 1, let id = recipients[0].agentId, window.selected != id {
      window.open(id, store: store)
    }
  }

  /** A row chosen by ⌘1–⌘9 or a click (`ee`): Create new Agent, Create “x” on an empty line and a group open at once; others become chips. */
  func activate(_ index: Int, store: AppStore, window: WindowState, sidebar: SidebarState) {
    let rows = rows(store)
    guard rows.indices.contains(index) else { return }
    let row = rows[index]
    if NewChat.commitsAtOnce(row, recipientCount: recipients.count) {
      commit(.single(row.recipient), store: store, window: window, sidebar: sidebar)
    } else {
      add(row, store: store, window: window)
    }
  }

  /**
   * The To: line's keys (`j`): ↑ ↓ move the light (opening the menu when it
   * is shut); Tab or a comma adds the lit row; Backspace on empty words takes
   * the last chip off; Return opens; Escape clears the words, then shuts the
   * menu, then closes the new chat; ⌘1–⌘9 choose a row. True when it was
   * the line's.
   */
  func command(_ command: ToField.Command, store: AppStore, window: WindowState, sidebar: SidebarState) -> Bool {
    let rows = rows(store)
    let lit = rows.isEmpty ? 0 : min(highlight, rows.count - 1)
    switch command {
    case .up, .down:
      if !menuOpen {
        menuOpen = true
        return true
      }
      highlight = command == .down ? (rows.isEmpty ? 0 : min(lit + 1, rows.count - 1)) : max(lit - 1, 0)
      return true
    case .tab:
      guard menuOpen, rows.indices.contains(lit) else { return true }
      if !NewChat.commitsAtOnce(rows[lit], recipientCount: recipients.count) { add(rows[lit], store: store, window: window) }
      return true
    case .backspace:
      guard query.isEmpty, !recipients.isEmpty else { return false }
      remove(at: recipients.count - 1, store: store, window: window)
      return true
    case .enter:
      let full = recipients.count >= NewChat.maxRecipients
      let picked = full || !rows.indices.contains(lit) ? nil : rows[lit]
      commit(NewChat.commit(recipients: recipients, query: query, highlighted: picked), store: store, window: window, sidebar: sidebar)
      return true
    case .escape:
      if !query.isEmpty {
        query = ""
        highlight = NewChat.defaultHighlight(self.rows(store), query: "")
      } else if menuOpen {
        menuOpen = false
      } else {
        close()
      }
      return true
    case .shortcut(let number):
      guard menuOpen, number >= 1, number <= NewChat.shortcutRows, number <= rows.count else { return false }
      activate(number - 1, store: store, window: window, sidebar: sidebar)
      return true
    }
  }

  // MARK: Opening and making

  /** The message field's words and files, there or not. */
  private func draftHasContent(_ store: AppStore) -> Bool {
    !(store.drafts[Self.draftKey] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !draftControl.staged.isEmpty
  }

  /**
   * Return on the line, or a row that opens at once (`ve`): the new chat
   * closes, and an agent opens with what was typed below waiting in its
   * field; a new name makes the agent (silent, with the typed words waiting;
   * else introducing itself, or with the name as its first message when it
   * reads like a request); several make a group named for them.
   */
  func commit(_ commit: NewChat.Commit, store: AppStore, window: WindowState, sidebar: SidebarState) {
    // With an agent's chat under the line, what was typed is in its own field already.
    let carry = previewId(window) == nil && draftHasContent(store)
    switch commit {
    case .noop:
      return
    case .single(.agent(let id, _)):
      close()
      if carry { handOver(to: id, store: store, window: window) }
      sidebar.selection.plain(id)
      window.open(id, store: store)
    case .single(.new(let name)):
      close()
      if carry { makeSilently(name, store: store, window: window) } else { launch(.new(name: name), text: "", files: [], store: store, window: window) }
    case .group(let people):
      close()
      group(people, text: "", files: [], carry: carry, store: store, window: window)
    }
  }

  /**
   * Return in the message field under the line (`ge`): with someone on it
   * and words or files, the new chat closes and they go: to the agent, to a
   * new agent as its first message, or to a new group of them. False leaves
   * the field as it is.
   */
  func submit(text: String, files: [StagedFile], store: AppStore, window: WindowState) -> Bool {
    guard !recipients.isEmpty else { return false }
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !words.isEmpty || !files.isEmpty else { return false }
    let people = recipients
    close()
    if people.count == 1 {
      launch(people[0], text: words, files: files, store: store, window: window, restore: people)
    } else {
      group(people, text: words, files: files, carry: false, store: store, window: window, restore: people)
    }
    return true
  }

  /** A send that could not make its agent or group: the new chat comes back as it was, the message in its field. */
  private func restore(_ people: [NewChat.Recipient], text: String, files: [StagedFile], store: AppStore) {
    recipients = people
    query = ""
    if !text.isEmpty { store.setDraft(text, for: Self.draftKey) }
    if !files.isEmpty { draftControl.staged = files }
    isOpen = true
    focus += 1
  }

  /** One recipient (`ke`): an agent opens and gets the message; a new one is made, opens, and gets it (or the name, when it reads like a request). */
  private func launch(_ recipient: NewChat.Recipient, text: String, files: [StagedFile], store: AppStore, window: WindowState, restore people: [NewChat.Recipient]? = nil) {
    let attachments = files.map { (name: $0.name, data: $0.data) }
    switch recipient {
    case .agent(let id, _):
      window.open(id, store: store)
      if !text.isEmpty || !files.isEmpty {
        Task { await store.send(text, to: id, attachments: attachments) }
      }
    case .new(let name):
      let first = !text.isEmpty ? text : (files.isEmpty && NewChat.looksLikeSentence(name) ? name : "")
      let sends = !first.isEmpty || !files.isEmpty
      creating = NewChat.cleanName(name)
      Task {
        do {
          let id = try await store.createChatAgent(name: name, kickstart: !sends)
          creating = nil
          window.open(id, store: store)
          if sends { await store.send(first, to: id, attachments: attachments) }
        } catch {
          creating = nil
          failed(error)
          if let people { restore(people, text: text, files: files, store: store) }
        }
      }
    }
  }

  /** A new name with words waiting below (`Ae`): the agent is made without its introduction and opens with them in its field; if it fails, the new chat comes back with them. */
  private func makeSilently(_ name: String, store: AppStore, window: WindowState) {
    creating = NewChat.cleanName(name)
    Task {
      do {
        let id = try await store.createChatAgent(name: name, kickstart: false, suppressIntroduction: true)
        creating = nil
        handOver(to: id, store: store, window: window)
        window.open(id, store: store)
      } catch {
        creating = nil
        failed(error)
        recipients = []
        query = ""
        isOpen = true
        focus += 1
      }
    }
  }

  /** Several (`Ne`): the new names made first, then the group of them all, named for them; what was typed waits in its field, or goes as its first message. Made agents go again if the group fails. */
  private func group(_ people: [NewChat.Recipient], text: String, files: [StagedFile], carry: Bool, store: AppStore, window: WindowState, restore restoring: [NewChat.Recipient]? = nil) {
    let name = NewChat.groupName(people)
    creating = name
    Task {
      var made: [String] = []
      do {
        var members: [String] = []
        for person in people {
          switch person {
          case .agent(let id, _):
            members.append(id)
          case .new(let newName):
            let id = try await store.createChatAgent(name: newName, kickstart: false)
            members.append(id)
            made.append(id)
          }
        }
        let id = try await store.createChatGroup(name: name, memberIds: members)
        creating = nil
        if carry { handOver(to: id, store: store, window: window) }
        window.open(id, store: store)
        if !text.isEmpty || !files.isEmpty {
          await store.send(text, to: id, attachments: files.map { (name: $0.name, data: $0.data) })
        }
      } catch {
        creating = nil
        failed(error)
        if !made.isEmpty { await store.delete(made) }
        if let restoring { restore(restoring, text: text, files: files, store: store) }
      }
    }
  }

  /** What was typed below the line goes to the chat it was meant for: its words and picks to that chat's field, its files with them (`be`). */
  private func handOver(to agentId: String, store: AppStore, window: WindowState) {
    Composer.handOver(from: Self.draftKey, to: agentId, store: store)
    if !draftControl.staged.isEmpty {
      window.handoffFiles[agentId] = draftControl.staged
      draftControl.staged = []
    }
  }

  /** The 50-agent limit has its own alert (`V4n`); the window says nothing for other refusals. */
  private func failed(_ error: Error) {
    guard case AppStore.CreateFailure.limit? = error as? AppStore.CreateFailure else { return }
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = NewChat.limitTitle
    alert.informativeText = NewChat.limitMessage
    alert.addButton(withTitle: "OK")
    SidebarActions.present(alert) { _ in }
  }
}

// MARK: The pane

/**
 * The chat's place while the new chat is open (`main[aria-label="New
 * chat"]`): the To: line along its top, under it the single agent's chat
 * when one is on the line and open, otherwise an empty stage over the
 * message field ("Message Agent", "Message Theo, Iris").
 */
struct NewChatPane: View {
  @Environment(NewChatState.self) private var newChat
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    ZStack(alignment: .top) {
      look.ground
      if let preview = newChat.previewId(window) {
        ChatPane(agentId: preview, underToLine: true)
          .id(preview)
      } else {
        let names = newChat.recipients.map(\.name).joined(separator: ", ")
        Color.clear
          .overlay(alignment: .bottom) {
            Composer(agentId: NewChatState.draftKey, name: names.isEmpty ? "Agent" : names, threadRoot: nil, look: look, takesKeys: false) { text, files in
              newChat.submit(text: text, files: files, store: store, window: window)
            }
            .environment(newChat.draftControl)
          }
      }
      ToLine(look: look)
    }
    // Search closed over the new chat: the To: line takes the keys back.
    .onReceive(NotificationCenter.default.publisher(for: WindowState.composerFocusNote)) { _ in newChat.focus += 1 }
  }
}

/** While an agent or group is being made (`H4n`): the Mac's spinner in the middle of the chat's place. */
struct CreatingScreen: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZStack {
      Look(scheme).ground
      ProgressView().controlSize(.regular)
    }
    .accessibilityLabel("Creating")
  }
}

/**
 * The To: line (`sand-new-chat-bar`, in a 44-high head with a hairline
 * under it, padded 0 12 0 8): "To:" (14 on 20, 40%), the chips (6 apart),
 * the field (14 on 20) saying "Search or create Agents" or "Add or create
 * another Agent", and with anyone on the line a 20-point Close at the
 * right. The menu hangs under it while open.
 */
private struct ToLine: View {
  let look: Look
  @Environment(NewChatState.self) private var newChat
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar
  @State private var closeHover = false

  var body: some View {
    GeometryReader { box in
      HStack(spacing: 6) {
        Text("To:")
          .font(.system(size: 14))
          .foregroundStyle(look.inkTertiary)
          .fixedSize()
        if !newChat.recipients.isEmpty {
          HStack(spacing: 6) {
            ForEach(Array(newChat.recipients.enumerated()), id: \.offset) { index, recipient in
              Chip(recipient: recipient, look: look) { newChat.remove(at: index, store: store, window: window) }
            }
          }
          .fixedSize()
        }
        ToField(
          text: newChat.query,
          placeholder: NewChat.fieldPlaceholder(recipients: newChat.recipients),
          focus: newChat.focus,
          look: look,
          changed: { newChat.typed($0, store: store) },
          command: { newChat.command($0, store: store, window: window, sidebar: sidebar) },
          focused: { inside in
            if inside { newChat.menuOpen = true } else { newChat.menuOpen = false }
          }
        )
        .frame(height: 20)
        if !newChat.recipients.isEmpty {
          Button { newChat.close() } label: {
            Image(systemName: "xmark")
              .font(.system(size: 10, weight: .medium))
              .foregroundStyle(look.inkSecondary)
              .frame(width: 20, height: 20)
              .background(closeHover ? look.rowHover : .clear, in: Circle())
              .contentShape(Circle())
          }
          .buttonStyle(.plain)
          .onHover { closeHover = $0 }
          .help("Close new chat")
          .accessibilityLabel("Close new chat")
        }
      }
      .padding(.leading, 8)
      .padding(.trailing, 12)
      .frame(width: box.size.width, height: 43, alignment: .leading)
      .background(look.ground)
      .overlay(alignment: .bottom) { Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1).offset(y: 1) }
      .overlay(alignment: .topLeading) {
        if newChat.menuOpen {
          RecipientMenu(look: look, width: min(560, max(0, box.size.width - 8 - 26 - 12)), maxHeight: max(120, box.size.height - 60))
            .offset(x: 8 + 26, y: 35)
            .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)).animation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.1)))
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("New chat")
  }
}

/** Someone on the line (`sand-new-chat-chip`): 24 high, round, grey; their butterfly (16) or a plus, their name (12 on 16, 200 at most), and Remove. */
private struct Chip: View {
  let recipient: NewChat.Recipient
  let look: Look
  let remove: () -> Void
  @Environment(AppStore.self) private var store
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 4) {
      if let id = recipient.agentId, let agent = store.agent(id) {
        AgentMark(agent: agent, agents: store.agents, size: 16)
      } else {
        Image(systemName: "plus")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 16, height: 16)
          .background(look.rowHover, in: Circle())
      }
      Text(recipient.name)
        .font(.system(size: 12))
        .foregroundStyle(look.ink)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: 200, alignment: .leading)
      Button(action: remove) {
        Image(systemName: "xmark")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 16, height: 16)
          .background(hovering ? look.rowHover : .clear, in: Circle())
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .onHover { hovering = $0 }
      .help("Remove \(recipient.name)")
      .accessibilityLabel("Remove \(recipient.name)")
    }
    .padding(.leading, 4)
    .padding(.trailing, 2)
    .frame(height: 24)
    .background(look.rowHover, in: Capsule())
  }
}

/**
 * The menu under the line (`sand-new-chat-menu`): 26 in, 8 over the
 * line's foot, 560 wide at most, 14 round, the raised ground (`#2f2f2f` on
 * dark) with a hairline and a soft shadow. Its rows (36 high, 2 apart,
 * padded 6 8, 8 round, lit grey): a plus in a grey circle for Create, an
 * agent's butterfly (22), the name (13 on 18). With ⌘ held, the first
 * nine show ⌘1–⌘9. Under a hairline: Tab add, ⏎ open.
 */
private struct RecipientMenu: View {
  let look: Look
  let width: CGFloat
  let maxHeight: CGFloat
  @Environment(NewChatState.self) private var newChat
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar

  var body: some View {
    let rows = newChat.rows(store)
    let lit = rows.isEmpty ? 0 : min(newChat.highlight, rows.count - 1)
    VStack(spacing: 0) {
      if rows.isEmpty {
        Text(NewChat.emptyText(query: newChat.query))
          .font(.system(size: 13))
          .foregroundStyle(look.inkTertiary)
          .padding(.vertical, 10)
          .padding(.horizontal, 14)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        ScrollView {
          VStack(spacing: 2) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
              MenuRow(row: row, lit: index == lit, shortcut: newChat.shortcutsShown && index < NewChat.shortcutRows ? index + 1 : nil, look: look) {
                newChat.activate(index, store: store, window: window, sidebar: sidebar)
              } hover: {
                if newChat.highlight != index { newChat.highlight = index }
              }
            }
          }
          .padding(6)
        }
        .frame(height: max(0, min(maxHeight - 37, CGFloat(rows.count) * 38 + 10)))
        .scrollIndicators(.automatic)
      }
      Rectangle().fill(look.ink.opacity(0.15)).frame(height: 0.5)
      HStack(spacing: 10) {
        Spacer(minLength: 0)
        KeyHint(cap: "Tab", label: "add", look: look)
        KeyHint(cap: "⏎", label: "open", look: look)
      }
      .padding(.horizontal, 12)
      .frame(height: 36)
    }
    .frame(width: width)
    .background(look.dark ? Color(hex: 0x2f2f2f) : look.elevated, in: RoundedRectangle(cornerRadius: 14))
    .clipShape(RoundedRectangle(cornerRadius: 14))
    .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 8)
    .shadow(color: .black.opacity(0.05), radius: 3, x: 0, y: 2)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Recipients")
  }
}

private struct MenuRow: View {
  let row: NewChat.Row
  let lit: Bool
  let shortcut: Int?
  let look: Look
  let action: () -> Void
  let hover: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Group {
          if case .agent(let id, _, _) = row, let agent = store.agent(id) {
            AgentMark(agent: agent, agents: store.agents, size: 22)
          } else {
            Image(systemName: "plus")
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(look.inkSecondary)
              .frame(width: 24, height: 24)
              .background(look.rowHover, in: Circle())
          }
        }
        .frame(width: 24, height: 24)
        Text(row.label)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let shortcut {
          HStack(spacing: 2) {
            KeyCap(text: "⌘", look: look)
            KeyCap(text: "\(shortcut)", look: look)
          }
        }
      }
      .padding(.vertical, 6)
      .padding(.horizontal, 8)
      .frame(height: 36)
      .background(lit ? look.logoTile : .clear, in: RoundedRectangle(cornerRadius: 8))
      .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .focusable(false)
    .onContinuousHover { phase in
      if case .active = phase { hover() }
    }
    .accessibilityAddTraits(lit ? .isSelected : [])
  }
}

/** A key on the menu's foot or a row (`keyCap`): 11 on 16 at 40%, on grey, a hairline at 5%, 4 round, padded 0 3. */
private struct KeyCap: View {
  let text: String
  let look: Look

  var body: some View {
    Text(text)
      .font(.system(size: 11))
      .tracking(0.055)
      .foregroundStyle(look.inkTertiary)
      .padding(.horizontal, 3)
      .frame(minWidth: 16, minHeight: 16)
      .background(look.logoTile, in: RoundedRectangle(cornerRadius: 4))
      .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(look.ink.opacity(0.05), lineWidth: 1) }
  }
}

private struct KeyHint: View {
  let cap: String
  let label: String
  let look: Look

  var body: some View {
    HStack(spacing: 4) {
      KeyCap(text: cap, look: look)
      Text(label)
        .font(.system(size: 11))
        .tracking(0.055)
        .foregroundStyle(look.inkTertiary)
    }
  }
}

// MARK: The field

/**
 * The To: line's field, the Mac's own text field so its keys can be read as
 * the window reads them: ↑ ↓, Tab and a comma, Backspace, Return, Escape
 * and ⌘1–⌘9 go to the line; letters still being composed keep theirs.
 */
struct ToField: NSViewRepresentable {
  enum Command: Equatable {
    case up, down, tab, backspace, enter, escape
    case shortcut(Int)
  }

  let text: String
  let placeholder: String
  let focus: Int
  let look: Look
  let changed: (String) -> Void
  let command: (Command) -> Bool
  let focused: (Bool) -> Void

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeNSView(context: Context) -> Field {
    let field = Field()
    field.isBordered = false
    field.isBezeled = false
    field.drawsBackground = false
    field.focusRingType = .none
    field.font = .systemFont(ofSize: 14)
    field.lineBreakMode = .byTruncatingTail
    field.usesSingleLineMode = true
    field.cell?.isScrollable = true
    field.delegate = context.coordinator
    field.setAccessibilityLabel("Search or create Agents")
    context.coordinator.field = field
    update(field, context: context)
    return field
  }

  func updateNSView(_ field: Field, context: Context) {
    update(field, context: context)
  }

  /** As wide as it is offered, one line high: it does not grow with what is typed. */
  func sizeThatFits(_ proposal: ProposedViewSize, nsView: Field, context: Context) -> CGSize? {
    CGSize(width: proposal.width ?? 120, height: 20)
  }

  private func update(_ field: Field, context: Context) {
    let coordinator = context.coordinator
    coordinator.changed = changed
    coordinator.command = command
    coordinator.focused = focused
    field.focused = focused
    if field.stringValue != text, (field.currentEditor() as? NSTextView)?.hasMarkedText() != true { field.stringValue = text }
    field.textColor = NSColor(look.ink)
    field.placeholderAttributedString = NSAttributedString(string: placeholder, attributes: [
      .font: NSFont.systemFont(ofSize: 14), .foregroundColor: NSColor(look.inkTertiary),
    ])
    if coordinator.focus != focus {
      coordinator.focus = focus
      DispatchQueue.main.async { [weak field] in
        guard let field, let window = field.window else { return }
        window.makeFirstResponder(field)
        field.currentEditor()?.selectedRange = NSRange(location: field.stringValue.utf16.count, length: 0)
      }
    }
  }

  final class Field: NSTextField {
    var focused: ((Bool) -> Void)?

    override func becomeFirstResponder() -> Bool {
      let took = super.becomeFirstResponder()
      if took { focused?(true) }
      return took
    }

    /** ⌘1–⌘9 while the field has the keys. */
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      if mods == .command, currentEditor() != nil, let digit = event.charactersIgnoringModifiers.flatMap({ Int($0) }), (1...9).contains(digit),
         let coordinator = delegate as? Coordinator, coordinator.command?(.shortcut(digit)) == true {
        return true
      }
      return super.performKeyEquivalent(with: event)
    }
  }

  @MainActor
  final class Coordinator: NSObject, NSTextFieldDelegate {
    weak var field: Field?
    var changed: ((String) -> Void)?
    var command: ((Command) -> Bool)?
    var focused: ((Bool) -> Void)?
    var focus = -1

    func controlTextDidChange(_ note: Notification) {
      guard let field else { return }
      var value = field.stringValue
      // A comma adds the lit row, as Tab does, and is not typed.
      if value.hasSuffix(","), (field.currentEditor() as? NSTextView)?.hasMarkedText() != true {
        value.removeLast()
        field.stringValue = value
        changed?(value)
        _ = command?(.tab)
        return
      }
      changed?(value)
    }

    func controlTextDidEndEditing(_ note: Notification) {
      focused?(false)
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
      if textView.hasMarkedText() { return false }
      switch selector {
      case #selector(NSResponder.moveUp(_:)): return command?(.up) ?? false
      case #selector(NSResponder.moveDown(_:)): return command?(.down) ?? false
      case #selector(NSResponder.insertTab(_:)): return command?(.tab) ?? false
      case #selector(NSResponder.insertNewline(_:)): return command?(.enter) ?? false
      case #selector(NSResponder.cancelOperation(_:)): return command?(.escape) ?? false
      case #selector(NSResponder.deleteBackward(_:)): return command?(.backspace) ?? false
      default: return false
      }
    }
  }
}

// MARK: The sidebar's draft row

/**
 * The new chat's row at the top of the sidebar (`sand-agent-item--compose-
 * draft`), while no agent's chat shows under the line: grey (17%, 32% on
 * dark), a plus in a 36-point circle with a hairline, "Create new" or the
 * names on the line (14 at 500).
 */
struct NewChatDraftRow: View {
  let rail: Bool
  @Environment(NewChatState.self) private var newChat
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    let label = NewChat.draftRowLabel(recipients: newChat.recipients)
    Button { newChat.focus += 1 } label: {
      HStack(spacing: 8) {
        Image(systemName: "plus")
          .font(.system(size: 13, weight: .regular))
          .foregroundStyle(look.dark ? Color(hex: 0xb7b7b7) : Color(hex: 0x3d3d3d))
          .frame(width: 36, height: 36)
          .background(look.rowHover, in: Circle())
          .overlay { Circle().strokeBorder(look.ink.opacity(0.1), lineWidth: 1) }
        if !rail {
          Text(label)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .truncationMode(.tail)
          Spacer(minLength: 0)
        }
      }
      .padding(rail ? 9 : 8)
      .frame(width: rail ? 54 : nil, height: 54, alignment: .leading)
      .frame(maxWidth: rail ? nil : .infinity, alignment: .leading)
      .background(look.logoTile, in: RoundedRectangle(cornerRadius: look.rowRadius))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity)
    .accessibilityLabel("New chat draft: \(label)")
  }
}
