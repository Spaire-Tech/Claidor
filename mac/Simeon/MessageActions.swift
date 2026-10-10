import AppKit
import SwiftUI
import SimeonCore

/**
 * What one chat is doing besides showing its lines (step 2d): the message
 * being answered, the message under the pointer, a message jumped to and
 * lit, and the composer asked to take the keys. One per open chat.
 */
@MainActor
@Observable
final class ChatControl {
  /** The message the next one answers (`sand-prompt-reply-pill`): its id, its line (72 characters) and the field's words. */
  struct Reply: Equatable {
    let id: String
    let line: String
    let placeholder: String
  }

  var reply: Reply?
  /** The message under the pointer, for the right-click menu. */
  var hovered: Bubble?
  /** The message whose menu is open: its hover bar stays. */
  var menuFor: String?
  /** A row jumped to: the transcript scrolls to it and lights it (`sand-12cjh1l`), the count making each jump new. */
  struct Jump: Equatable {
    let id: String
    let count: Int
  }

  var jump: Jump?
  /** The row lit by the last jump, until its light fades. */
  var lit: String?
  /** A message to jump to once the thread being opened is on screen (a quote of a reply in a thread). */
  var jumpAfterThread: String?
  /** A row brought to the middle without lighting it (find's `scrollToEntryWithoutHighlight`). */
  var reveal: Jump?
  /** Bumped to give the composer the keys. */
  var focusCount = 0
  /** The message field's frame (44 on one line), so the last message clears it. */
  var composerHeight: CGFloat = 44

  /** The files waiting to go with the next message (step 2e), six at most. */
  var staged: [StagedFile] = []
  /** The line over the words when files were left out (five seconds), and its count so the latest stays. */
  var attachNotice: String?
  var noticeCount = 0
  /** Files being read off the disk for `staged`. */
  var reading = 0

  /** The agent whose messages with this one are open over the chat (`tunnelPeer`, read only). */
  var exchangePeer: Party?
  /** The exchange's message under the pointer, for the right-click menu: its id and words. */
  var exchangeHovered: (id: String, text: String)?

  // Find in the chat (⌘F, the window's `b_n`).
  var findOpen = false
  var findQuery = ""
  /** Bumped to give find's field the keys with its words chosen (`focusNonce`). */
  var findFocus = 0
  /** The match stepped to, for the words it was found with, and its place then (`forQuery`, `match`, `index`). */
  struct FindChoice: Equatable {
    let query: String
    let match: ChatFind.Match
    let index: Int
  }

  var findChoice: FindChoice?

  /** Reply: the message quoted over the field, which takes the keys. */
  func startReply(_ bubble: Bubble, entries: [Entry]) {
    let entry = entries.first { $0.id == bubble.id }
    reply = Reply(id: bubble.id, line: Chat.quoteLine(entry, limit: 72), placeholder: Chat.replyPlaceholder(entry))
    focusCount += 1
  }

  /** Bring a row to the middle and light it in the yellow, which holds a second and fades (`sand-12cjh1l`, 2.5 s). */
  func jump(to id: String) {
    let count = (jump?.count ?? 0) + 1
    jump = Jump(id: id, count: count)
    lit = id
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(1))
      guard let self, self.jump?.count == count else { return }
      withAnimation(.easeOut(duration: 1.5)) { self.lit = nil }
    }
  }

  /** ⌘F: the bar, or its field again with its words chosen. */
  func openFind() {
    findOpen = true
    findFocus += 1
  }

  /** Close find (its X or Escape): its words go with it. */
  func closeFind() {
    findOpen = false
    findQuery = ""
    findChoice = nil
  }

  /**
   * Where find stands among `matches` (`h_n`): the match stepped to while
   * it is still there, else the place it had (or the last place left), and
   * with nothing stepped to for these words, the newest.
   */
  func findIndex(_ matches: [ChatFind.Match]) -> Int? {
    guard !matches.isEmpty else { return nil }
    guard let choice = findChoice, choice.query == findQuery else { return matches.count - 1 }
    return matches.firstIndex(of: choice.match) ?? min(choice.index, matches.count - 1)
  }

  /** Next (`delta` 1) or Previous (-1), round at either end (`p_n`), the row brought to the middle unlit. */
  func stepFind(_ delta: Int, in matches: [ChatFind.Match]) {
    guard let current = findIndex(matches) else { return }
    let index = ((current + delta) % matches.count + matches.count) % matches.count
    findChoice = FindChoice(query: findQuery, match: matches[index], index: index)
    reveal = Jump(id: matches[index].rowId, count: (reveal?.count ?? 0) + 1)
  }

  /** An exchange opens over the chat; the message field, now under it, lets go of the keys. */
  func openExchange(_ peer: Party) {
    exchangePeer = peer
    exchangeHovered = nil
    NSApp.keyWindow?.makeFirstResponder(nil)
  }

  func closeExchange() {
    exchangePeer = nil
    exchangeHovered = nil
  }
}

// MARK: The hover bar

/**
 * A message's actions under the pointer (`sand-message-hover-actions`):
 * beside the bubble, 6 from it and level with its middle, 2 apart; Add
 * reaction, Reply and More (24, 8 round, glyphs 14 at 60%), Add reaction
 * nearest the bubble: so on the person's side the order runs More, Reply,
 * Add reaction. More opens Start a thread and Copy; Add reaction the six
 * quick reactions. Native menus, as the window's are menus.
 */
struct HoverBar: View {
  let bubble: Bubble
  let agentId: String
  let inThread: Bool
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control

  var body: some View {
    let buttons = [
      AnyView(BarButton(symbol: "face.smiling", label: "Add reaction", look: look) {
        MessageMenu.show(for: bubble, agentId: agentId, kind: .reactions, inThread: inThread, store: store, control: control)
      }),
      AnyView(BarButton(symbol: bubble.fromPerson ? "arrowshape.turn.up.right" : "arrowshape.turn.up.left", label: bubble.fromPerson ? "Reply to your message" : "Reply to Agent message", look: look) {
        control.startReply(bubble, entries: store.transcripts[agentId] ?? [])
      }),
      AnyView(BarButton(symbol: "ellipsis", label: "More message actions", look: look) {
        MessageMenu.show(for: bubble, agentId: agentId, kind: .more, inThread: inThread, store: store, control: control)
      }),
    ]
    HStack(spacing: 2) {
      ForEach(Array((bubble.fromPerson ? buttons.reversed() : buttons).enumerated()), id: \.offset) { _, button in
        button
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(bubble.fromPerson ? "Message actions for your message" : "Message actions for Agent message")
  }
}

/** A hover bar button (`sand-message-hover-actions__button`): 24, 8 round, the glyph 14 at 60%, grey under the pointer. */
struct BarButton: View {
  let symbol: String
  let label: String
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12, weight: .regular))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 24, height: 24)
        .background(hovered ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 8))
        .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .help(label)
    .accessibilityLabel(label)
  }
}

// MARK: The menus

/**
 * A message's menus as Mac menus (the window's `ui-menu`): Add reaction
 * shows the six quick reactions in a row (👍 👎 ❤️ 😂 🎉 😮, 32 square,
 * 20 high, 6 round) with More emoji; More shows Start a thread and Copy;
 * the right-click menu shows the row, then Reply, Start a thread and Copy.
 * Start a thread is not offered inside a thread.
 */
@MainActor
enum MessageMenu {
  enum Kind { case reactions, more, context }

  /** The quick reactions (`sand-reaction-picker`), in the window's order. */
  static let quick = ["👍", "👎", "❤️", "😂", "🎉", "😮"]

  static func show(for bubble: Bubble, agentId: String, kind: Kind, inThread: Bool, store: AppStore, control: ChatControl, at event: NSEvent? = nil) {
    let menu = NSMenu()
    menu.autoenablesItems = false
    let handler = Handler(bubble: bubble, agentId: agentId, store: store, control: control)
    if kind != .more {
      let row = NSMenuItem()
      let look = Look(NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light)
      let picker = NSHostingView(rootView: ReactionRow(look: look) { [weak menu] emoji in
        menu?.cancelTracking()
        if let emoji {
          Task { await store.react(emoji, to: bubble.id, in: agentId) }
        } else {
          // More emoji: the full picker where the menu was, once the menu has gone.
          DispatchQueue.main.async {
            EmojiPopover.show(look: look, mine: Set(bubble.myReactions), holding: bubble.id, control: control) { emoji in
              Task { await store.react(emoji, to: bubble.id, in: agentId) }
            }
          }
        }
      })
      picker.frame = NSRect(x: 0, y: 0, width: 246, height: 44)
      row.view = picker
      menu.addItem(row)
    }
    if kind == .context {
      menu.addItem(.separator())
      menu.addItem(handler.item("Reply", symbol: "arrowshape.turn.up.left", action: #selector(Handler.reply)))
    }
    if kind != .reactions {
      if !inThread {
        menu.addItem(handler.item("Start a thread", symbol: "bubble.left.and.bubble.right", action: #selector(Handler.thread)))
      }
      menu.addItem(handler.item("Copy", symbol: "doc.on.doc", action: #selector(Handler.copyText)))
    }
    // The handler lives as long as the menu.
    objc_setAssociatedObject(menu, &Handler.key, handler, .OBJC_ASSOCIATION_RETAIN)
    pop(menu, for: bubble.id, control: control, at: event)
  }

  /** A message between two agents (the exchange is read only, `isReadOnly`): More and the right click hold Copy alone. */
  static func showCopy(_ text: String, id: String, control: ChatControl, at event: NSEvent? = nil) {
    let menu = NSMenu()
    menu.autoenablesItems = false
    let handler = CopyHandler(text: text)
    let item = NSMenuItem(title: "Copy", action: #selector(CopyHandler.copyText), keyEquivalent: "")
    item.target = handler
    item.image = NSImage(systemSymbolName: "doc.on.doc", accessibilityDescription: nil)
    menu.addItem(item)
    objc_setAssociatedObject(menu, &Handler.key, handler, .OBJC_ASSOCIATION_RETAIN)
    pop(menu, for: id, control: control, at: event)
  }

  /** The menu at the pointer, the message's hover bar kept while it is open. */
  private static func pop(_ menu: NSMenu, for id: String, control: ChatControl, at event: NSEvent?) {
    control.menuFor = id
    let shown = event ?? NSApp.currentEvent
    if let shown, let view = shown.window?.contentView ?? NSApp.keyWindow?.contentView {
      NSMenu.popUpContextMenu(menu, with: shown, for: view)
    }
    control.menuFor = nil
  }

  final class CopyHandler: NSObject {
    let text: String

    init(text: String) { self.text = text }

    @MainActor @objc func copyText() {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(text, forType: .string)
    }
  }

  final class Handler: NSObject {
    nonisolated(unsafe) static var key = 0
    let bubble: Bubble
    let agentId: String
    let store: AppStore
    let control: ChatControl

    init(bubble: Bubble, agentId: String, store: AppStore, control: ChatControl) {
      self.bubble = bubble
      self.agentId = agentId
      self.store = store
      self.control = control
    }

    func item(_ title: String, symbol: String, action: Selector) -> NSMenuItem {
      let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
      item.target = self
      item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
      return item
    }

    @MainActor @objc func reply() {
      control.startReply(bubble, entries: store.transcripts[agentId] ?? [])
    }

    @MainActor @objc func thread() {
      store.openThread(bubble.id, in: agentId)
      control.focusCount += 1
    }

    @MainActor @objc func copyText() {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(bubble.text, forType: .string)
    }
  }
}

/**
 * The quick reactions in a menu (`sand-reaction-picker`): six 32-point
 * squares (the emoji 20, 6 round, grey under the pointer), 2 apart, then
 * More emoji (28, the glyph at 60%), padded 6. More emoji opens the full
 * picker (`EmojiPicker`).
 */
private struct ReactionRow: View {
  let look: Look
  let pick: (String?) -> Void

  var body: some View {
    HStack(spacing: 2) {
      ForEach(MessageMenu.quick, id: \.self) { emoji in
        Cell(emoji: emoji, look: look) { pick(emoji) }
      }
      MoreEmoji(look: look) { pick(nil) }
    }
    .padding(.trailing, 2)
    .padding(6)
    .frame(width: 246, height: 44, alignment: .leading)
  }

  private struct Cell: View {
    let emoji: String
    let look: Look
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
      Button(action: action) {
        Text(emoji)
          .font(.system(size: 20))
          .frame(width: 32, height: 32)
          .background(hovered ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
          .contentShape(RoundedRectangle(cornerRadius: 6))
      }
      .buttonStyle(.plain)
      .onHover { hovered = $0 }
      .help(emoji)
      .accessibilityLabel("React with \(emoji)")
    }
  }

  private struct MoreEmoji: View {
    let look: Look
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
      Button(action: action) {
        Image(systemName: "face.smiling")
          .font(.system(size: 14))
          .foregroundStyle(look.inkSecondary)
          .overlay(alignment: .bottomTrailing) {
            Image(systemName: "plus")
              .font(.system(size: 7, weight: .bold))
              .foregroundStyle(look.inkSecondary)
              .offset(x: 3, y: 2)
          }
          .frame(width: 28, height: 28)
          .background(hovered ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
          .contentShape(RoundedRectangle(cornerRadius: 6))
      }
      .buttonStyle(.plain)
      .onHover { hovered = $0 }
      .help("More emoji")
      .accessibilityLabel("More emoji")
    }
  }
}

/**
 * A right click on a message opens its menu (the window's `contextmenu`):
 * the message under the pointer is known from its hover, so the click is
 * taken before the text under it would show its own menu.
 */
struct RightClickMenu: NSViewRepresentable {
  let agentId: String
  let inThread: Bool
  let store: AppStore
  let control: ChatControl
  /** A file, picture or diagram full screen: right clicks are its own then. */
  let viewers: Viewers

  func makeNSView(context: Context) -> CatchView {
    let view = CatchView()
    view.open = { open($0) }
    return view
  }

  func updateNSView(_ view: CatchView, context: Context) {
    view.open = { open($0) }
  }

  private func open(_ event: NSEvent) -> Bool {
    guard viewers.shown == nil else { return false }
    // Over an exchange, only its own messages, and only Copy.
    if control.exchangePeer != nil {
      guard let hovered = control.exchangeHovered else { return false }
      MessageMenu.showCopy(hovered.text, id: hovered.id, control: control, at: event)
      return true
    }
    guard let bubble = control.hovered else { return false }
    MessageMenu.show(for: bubble, agentId: agentId, kind: .context, inThread: inThread, store: store, control: control, at: event)
    return true
  }

  final class CatchView: NSView {
    var open: ((NSEvent) -> Bool)?
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window, let open = self.open,
                self.bounds.contains(self.convert(event.locationInWindow, from: nil)) else { return false }
          return open(event)
        }
        return took ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}

// MARK: Reply

/**
 * The message being answered, over the words (`sand-prompt-reply-pill`):
 * 30 high, 10 round, on the grey wash, padded 4 4 4 8; the reply glyph (12,
 * at 40%), the message's line (14 on 22, at 60%, one line), and Cancel reply
 * (20, round, the X 12 at 40%).
 */
struct ReplyPill: View {
  let reply: ChatControl.Reply
  let look: Look
  let cancel: () -> Void

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "arrowshape.turn.up.left")
        .font(.system(size: 10))
        .foregroundStyle(look.inkTertiary)
        .frame(width: 12, height: 12)
      Text(reply.line)
        .font(.system(size: 14))
        .foregroundStyle(look.inkSecondary)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(action: cancel) {
        Image(systemName: "xmark")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(look.inkTertiary)
          .frame(width: 20, height: 20)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .help("Cancel reply")
      .accessibilityLabel("Cancel reply")
    }
    .padding(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 4))
    .frame(height: 30)
    // `rgba(119,119,119,.09)` on light, `.14` on dark.
    .background(look.dark ? look.wash : look.rowHover, in: RoundedRectangle(cornerRadius: 10))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Replying to \(reply.line)")
  }
}

// MARK: Threads

/**
 * Under a message that has replies (`sand-thread-affordance`): "2 replies"
 * with a chevron (13 on 18, at 40%; at 60% under the pointer, which also
 * turns it to "View thread"). Joined under its bubble as a chin (the
 * bubble's lower corners square, padded 7 12, the grey wash, a hairline
 * along its top, 18 round below), or, when the message has reactions, a
 * small pill of its own under them (padded 4 10, 4 down).
 */
struct ThreadChin: View {
  let rootId: String
  let count: Int
  let attached: Bool
  let look: Look
  let open: () -> Void
  @State private var hovered = false

  var body: some View {
    let replies = count == 1 ? "1 reply" : "\(count) replies"
    Button(action: open) {
      ZStack(alignment: .leading) {
        label(replies).opacity(hovered ? 0 : 1)
        label("View thread").opacity(hovered ? 1 : 0)
      }
      .font(.system(size: 13))
      .foregroundStyle(hovered ? look.inkSecondary : look.inkTertiary)
      .padding(attached ? EdgeInsets(top: 7, leading: 12, bottom: 7, trailing: 12) : EdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 10))
      .frame(maxWidth: attached ? .infinity : nil, alignment: .leading)
      .background(look.rowHover, in: shape)
      .overlay(alignment: .top) {
        if attached { Rectangle().fill(look.ink.opacity(0.05)).frame(height: 1) }
      }
      .contentShape(shape)
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .padding(.top, attached ? 0 : 4)
    .accessibilityLabel("View thread, \(replies)")
  }

  private var shape: UnevenRoundedRectangle {
    attached
      ? UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 0)
      : UnevenRoundedRectangle(topLeadingRadius: 999, bottomLeadingRadius: 999, bottomTrailingRadius: 999, topTrailingRadius: 999)
  }

  private func label(_ words: String) -> some View {
    HStack(spacing: 2) {
      Text(words).lineLimit(1).fixedSize()
      Image(systemName: "chevron.right")
        .font(.system(size: 8, weight: .semibold))
        .frame(width: 12, height: 12)
    }
    .frame(height: 18)
  }
}

/**
 * A thread's head (`sand-chat-header__breadcrumbs`, 44 high on the ground,
 * padded 0 12 0 8): the chat's butterfly (20) and name (13, 500) going back
 * to the chat, a chevron (12, at 40%), and the thread's first message cut
 * to one line. Each crumb is padded 6, 6 round, grey under the pointer. The
 * rest of the head moves the window.
 */
struct ThreadHeader: View {
  let agent: Agent
  let title: String
  let look: Look
  let back: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    ZStack(alignment: .leading) {
      look.ground
      WindowDragArea()
      HStack(spacing: 0) {
        Crumb(look: look, label: "Back to \(agent.name)", action: back) {
          HStack(spacing: 4) {
            AgentMark(agent: agent, agents: store.agents, size: 20)
            Text(agent.name).lineLimit(1)
          }
        }
        Image(systemName: "chevron.right")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(look.inkTertiary)
          .frame(width: 12, height: 12)
        Crumb(look: look, label: "View conversation details", action: {}) {
          Text(title).lineLimit(1).truncationMode(.tail)
        }
      }
      .padding(.leading, 8)
      .padding(.trailing, 12)
    }
    .frame(height: 44)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Thread breadcrumb")
  }

  private struct Crumb<Content: View>: View {
    let look: Look
    let label: String
    let action: () -> Void
    @ViewBuilder let content: () -> Content
    @State private var hovered = false

    var body: some View {
      Button(action: action) {
        content()
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.ink)
          .padding(6)
          .frame(height: 30)
          .background(hovered ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
          .contentShape(RoundedRectangle(cornerRadius: 6))
      }
      .buttonStyle(.plain)
      .onHover { hovered = $0 }
      .help(label)
      .accessibilityLabel(label)
    }
  }
}
