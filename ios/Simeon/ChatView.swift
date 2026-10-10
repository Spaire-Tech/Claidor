import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

#if os(iOS)
/**
 * One chat, as the phone design draws the Mac's chat full screen (measured
 * from the web window at 393 pt, 8 October 2026): the back disc at the top
 * left, the agent's butterfly (52 pt) with its name pill under it and the
 * call button beside the name, all over the page's own ground; the
 * conversation; the composer. The butterfly or the name opens the agent's
 * page; on a call, the pill sits under the header and opens the full call.
 */
struct ChatView: View {
  let agentId: String
  /** `call` or `call-full` or `agent`, from the screenshots' launch. */
  var opening: String? = nil
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @State private var showsPage = false
  @State private var showsCall = false
  @State private var showsTranscript = false
  @State private var showsComputer = false
  /** Two agents' page, pushed over the chat from an exchange line (TeammatesLine). */
  @State private var exchange: ExchangeRoute?
  /** The opening asked for (a call, the agent's page) is done once: coming back from a page pushed over the chat runs `.task` again. */
  @State private var openedAsAsked = false
  @State private var reply = ReplyDraft()
  @State private var actions = ChatActions()
  @State private var messageMenu = MessageMenu()
  /** The thread open over the chat (its first message's id). */
  @State private var thread: ThreadRoute?

  // Each part below reads only what it draws, so typing a letter or the
  // call's waveform ticking redraws that part and not the conversation.
  var body: some View {
    ChatMessages(agentId: agentId)
      .environment(actions)
      .environment(messageMenu)
      // Bars, not insets: the messages scroll under the call and the composer and fade there, as in Messages.
      .safeAreaBar(edge: .top, spacing: 0) {
        VStack(spacing: 0) {
          ChatHeadline(agentId: agentId) { showsPage = true }
          ChatCallSlot(agentId: agentId, showsCall: $showsCall, showsTranscript: $showsTranscript)
        }
      }
      .safeAreaBar(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId) }
      .environment(reply)
      .background(Ink.ground)
      // The system's own bar, as Messages has it: its back button, and its swipe from the left edge that goes back with
      // the screen following the finger. The chat had hidden it for a bar of its own, and hidden, it does not swipe.
      .inlineBarTitle()
      .toolbar {
        // The butterfly is drawn up in the bar's row (ChatHeadline), but there the bar takes the touch, not the drawing: a
        // tap on the butterfly did nothing and only its name opened the page (the founder, 9 October 2026). The bar's
        // middle, where the butterfly is, takes it now; the drawing is unchanged.
        // A button, not a tap gesture on a clear view: the bar's middle took no tap that way either, and the top of the
        // butterfly still did nothing (the founder, 9 October 2026, again). The bar's glass behind it is off: nothing shows.
        ToolbarItem(placement: .principal) {
          Button { showsPage = true } label: {
            Color.clear
              .frame(width: 180, height: 44)
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityHidden(true)
        }
        .sharedBackgroundVisibility(.hidden)
        if store.canCall && !store.groupIds.contains(agentId) {
          ToolbarItem(placement: .trailingBar) { ChatCallButton(agentId: agentId) }
        }
      }
      // A long press on a message: the reactions and what can be done with it, in a sheet from the bottom.
      .sheet(item: Binding(get: { messageMenu.target }, set: { messageMenu.target = $0 })) { target in
        MessageActionsSheet(bubble: target.bubble, agentId: agentId).environment(reply).environment(actions)
      }
      // A thread over the chat: its first message and its replies, and a composer that answers there.
      .sheet(item: $thread, onDismiss: { store.closeThread(in: agentId) }) { route in
        ThreadSheet(agentId: agentId, rootId: route.rootId).problemAlert()
      }
      .sheet(isPresented: $showsPage) { AgentPageSheet(agentId: agentId).problemAlert() }
      .sheet(isPresented: $showsComputer) { ComputerSheet(agentId: agentId).problemAlert() }
      .fullScreenCover(isPresented: $showsCall) { CallScreen(showsTranscript: $showsTranscript) }
      .navigationDestination(item: $exchange) { route in ExchangePage(route: route) }
      .onAppear {
        actions.openPage = { showsPage = true }
        actions.openComputer = { showsComputer = true }
        actions.openExchange = { exchange = $0 }
        actions.openThread = { root in
          thread = ThreadRoute(rootId: root)
          store.openThread(root, in: agentId)
        }
      }
      .onDisappear { store.close(agentId) }
      // Back from the background: what was said while the phone slept did not stream, so fetch it.
      // Back in front with the chat on screen: what came meanwhile is read now.
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { Task { await store.refresh(agentId); store.markChatRead(agentId) } }
      }
      .task {
        await store.open(agentId)
        guard !openedAsAsked, let agent = store.agent(agentId) else { return }
        openedAsAsked = true
        switch opening {
        case "call": store.startCall(agent)
        case "call-full": store.startCall(agent); showsTranscript = true; showsCall = true
        case "agent": showsPage = true
        default: break
        }
      }
  }
}
#endif

/** What a row can do (open the agent's page or its computer, go to the message a quote answers), given once so the rows never need drawing again for it. */
@MainActor
@Observable
final class ChatActions {
  @ObservationIgnored var openPage: () -> Void = {}
  /** A routine named in the chat ("Created routine"): its editor in the agent's pane on the Mac; nil opens the page. */
  @ObservationIgnored var openRoutine: ((String) -> Void)?
  @ObservationIgnored var openComputer: () -> Void = {}
  @ObservationIgnored var openExchange: (ExchangeRoute) -> Void = { _ in }
  @ObservationIgnored var jump: (String) -> Void = { _ in }
  /** Opens a thread by its first message's id (a thread's "N replies", "Start a thread", a quote of a reply in one). */
  @ObservationIgnored var openThread: (String) -> Void = { _ in }
  /** The app's actions "/" offers here (the palette's commands that run something), and running one. */
  @ObservationIgnored var slashActions: () -> [ComposerLists.Action] = { [] }
  @ObservationIgnored var runSlashAction: (String) -> Void = { _ in }
}

/**
 * The Mac's new chat speaking to a composer (mac/Simeon/MacNewChat.swift):
 * its placeholder ("Message Nora, New Agent"), Send held while no one is on
 * the To: line, the message taken to make the agents first, and what is
 * written handed over when the To: line opens a chat. Nil everywhere else.
 */
@MainActor
@Observable
final class ComposerHook {
  struct Message {
    let text: String
    let richText: String?
    let files: [ComposerAttachment]
  }

  enum Outcome { case taken, kept, sendHere }

  var placeholder: String?
  var sendDisabled = false
  /** The message, before it is sent here: taken (the field empties), kept (nothing happens), or sent here as usual. */
  var submit: ((Message) -> Outcome)?
  /** After a message was sent here (the new chat closes). */
  var afterSend: (() -> Void)?
  /** Set by the composer: what is written, and the field emptied. */
  var take: (() -> Message)?
}

/** The message the person is answering (the Mac's Reply), shared by the bubbles' menu and the composer. */
@MainActor
@Observable
final class ReplyDraft {
  var target: Bubble?
}

/**
 * How far a sideways drag has pulled the conversation (0 to 82 pt), to show
 * each message's time. Only the small parts that move read it, so a drag
 * frame redraws them and not every bubble.
 */
@MainActor
@Observable
final class TimePeek {
  var x: CGFloat = 0
}

/** The message a reply's quote jumped to: it glows a moment, as on the Mac. */
@MainActor
@Observable
final class JumpGlow {
  var id: String?
}

/**
 * The conversation itself: redrawn when its rows change, and only then.
 * As the Mac's: a new line comes in with a short rise; older lines load as
 * you near the top; scrolled up, what arrives below is counted on a pill
 * ("2 new messages") that takes you down, and a "New" line out of sight
 * above has its own pill.
 */
struct ChatMessages: View {
  let agentId: String
  /** A thread of the chat instead of the chat (its first message's id): its rows, no older pages. */
  var thread: String? = nil
  @Environment(AppStore.self) private var store
  @Environment(ChatActions.self) private var actions: ChatActions?
  @State private var width: CGFloat = 361
  @State private var peek = TimePeek()
  @State private var glow = JumpGlow()
  @State private var atBottom = true
  @State private var unseen = 0
  @State private var dividerSeen = false
  @State private var dividerDismissed = false
  @State private var settled = false
  /** How many of the newest rows are drawn: a long chat opened at its end drew every message above it first, and stood still. More come in as you scroll up. */
  @State private var window = ChatMessages.firstWindow
  private static let firstWindow = 40
  private static let bottomId = "chat-bottom"

  /** The rows on screen: the chat's, or the open thread's. */
  private var allRows: [ChatRow] { thread == nil ? store.rows(for: agentId) : store.threadRows[agentId] ?? [] }

  var body: some View {
    let all = allRows
    let rows = all.count > window ? Array(all.suffix(window)) : all
    let hidden = all.count - rows.count
    let _ = Trace.mark("drawing \(agentId), \(rows.count) of \(all.count) rows")
    ScrollViewReader { reader in
      ScrollView {
        // A plain stack, not a lazy one: every row is measured as it is, once. A lazy stack guesses the height of the rows it
        // has not drawn, and held to the bottom (below) each corrected guess moves the view and brings other rows in: the kind
        // of loop Ava's chat froze in (SwiftUI applying changes without end, none of the app's code on the stack). The window
        // keeps the stack to the newest rows.
        VStack(alignment: .leading, spacing: 0) {
          if hidden > 0 || (thread == nil && store.olderBefore[agentId] != nil) {
            // Near the top (below): the rows above these, then the lines before them (`getAgentTranscriptTail` with `beforeSeq`).
            ProgressView()
              .frame(maxWidth: .infinity)
              .padding(.vertical, 14)
              // Every row already drawn and still more lines before them: fetch those once (a chat too short to scroll).
              .onAppear { if hidden == 0, thread == nil, store.olderBefore[agentId] != nil { Task { await store.loadOlder(agentId) } } }
          }
          ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
            Group {
              if case .unread = row {
                ChatRowView(row: row, agentId: agentId).equatable()
                  .onScrollVisibilityChange(threshold: 0.2) { visible in if visible && !dividerSeen { dividerSeen = true } }
              } else {
                // Equatable: a row is drawn again only when it changed, not each time the chat's own state moves.
                ChatRowView(row: row, agentId: agentId).equatable()
              }
            }
            .modifier(Arrival(id: row.id, arriving: store.arrived.contains(row.id)))
            .padding(.top, Self.gap(index > 0 ? rows[index - 1] : nil, row))
          }
          if thread == nil { TypingSlot(agentId: agentId) }
          Color.clear.frame(height: 1).id(Self.bottomId)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .environment(\.chatWidth, width)
        .environment(\.chatThread, thread)
        .environment(peek)
        .environment(glow)
      }
      #if os(iOS)
      .gesture(PeekPan(peek: peek))
      #endif
      // A quote's tap goes to what it answers. Given to the rows once: handed down as a new closure on every
      // redraw of the chat, it made every bubble draw again each time the chat's own state moved.
      .onAppear {
        let lit = glow
        actions?.jump = { id in
          reveal(id) { withAnimation(.snappy) { reader.scrollTo(id, anchor: .center) } }
          lit.id = id
          Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            if lit.id == id { withAnimation(.easeOut(duration: 0.5)) { lit.id = nil } }
          }
        }
      }
      // A line search found (the Mac's `revealSearchHit`): older pages until it is in, then to it, and it glows.
      .task(id: store.revealing[agentId]) {
        guard thread == nil, let entry = store.revealing[agentId] else { return }
        _ = await store.loadUntil(entry, in: agentId)
        store.revealing[agentId] = nil
        guard let rowId = Chat.rowId(for: entry, in: store.rows(for: agentId)) else { return }
        try? await Task.sleep(nanoseconds: 250_000_000)
        actions?.jump(rowId)
      }
      // Scrolled near the top: more rows, then older lines. Only ever more, so it cannot go back and forth.
      .onScrollGeometryChange(for: Bool.self) { geometry in
        geometry.contentSize.height > geometry.containerSize.height && geometry.visibleRect.minY < 300
      } action: { _, nearTop in
        guard nearTop else { return }
        if allRows.count > window { window += ChatMessages.firstWindow } else if thread == nil, store.olderBefore[agentId] != nil { Task { await store.loadOlder(agentId) } }
      }
      .onScrollGeometryChange(for: Bool.self) { geometry in
        geometry.contentSize.height - geometry.visibleRect.maxY < 120
      } action: { _, bottom in
        if atBottom != bottom { atBottom = bottom }
        if bottom && unseen != 0 { unseen = 0 }
      }
      // New rows at the bottom: drawn too (the window grows by them), and counted on the pill when you are reading further up. Older lines loaded at the top are neither.
      .onChange(of: all.last?.id) { old, _ in
        guard let old else { return }
        let now = allRows
        guard let from = now.lastIndex(where: { $0.id == old }) else { return }
        let added = now[(from + 1)...]
        window += added.count
        guard !atBottom else { return }
        unseen += added.filter { row in if case .bubble(let b) = row { return !b.fromPerson }; return false }.count
      }
      .overlay(alignment: .top) {
        let waiting = Self.unreadCount(all)
        if settled && waiting > 0 && !dividerSeen && !dividerDismissed {
          NewMessagesPill(count: waiting, up: true) {
            reveal("unread-divider") { withAnimation(.snappy) { reader.scrollTo("unread-divider", anchor: .top) } }
          } dismiss: { dividerDismissed = true }
          .padding(.top, 8)
          .transition(.move(edge: .top).combined(with: .opacity))
        }
      }
      .overlay(alignment: .bottom) {
        if unseen > 0 && !atBottom {
          NewMessagesPill(count: unseen, up: false) {
            withAnimation(.snappy) { reader.scrollTo(Self.bottomId, anchor: .bottom) }
          } dismiss: { unseen = 0 }
          .padding(.bottom, 10)
          .transition(.move(edge: .bottom).combined(with: .opacity))
        }
      }
      .animation(.snappy, value: unseen > 0 && !atBottom)
      .animation(.snappy, value: dividerSeen || dividerDismissed)
    }
    .overlay {
      // Its lines on their way from the computer (a chat the host had closed takes a moment to open): say so.
      if all.isEmpty && store.fetching.contains(agentId) { ProgressView() }
      // Nothing came and the fetch failed: the window's "Couldn't load this conversation" and Retry.
      else if all.isEmpty && thread == nil && store.loadFailed.contains(agentId) { ChatLoadFailed(agentId: agentId) }
    }
    // The chat's width, measured and kept for the rows to cap themselves at. In whole points, and kept only when it moves by
    // one or more: a width that came back a fraction different on each measure would redraw every row, again and again.
    .onGeometryChange(for: CGFloat.self) { ($0.size.width - 32).rounded(.down) } action: { measured in
      let next = max(200, measured)
      if abs(next - width) >= 1 { width = next }
    }
    .defaultScrollAnchor(.bottom)
    .defaultScrollAnchor(.bottom, for: .sizeChanges)
    #if os(iOS)
    .scrollDismissesKeyboard(.interactively)
    #endif
    .background(Ink.ground)
    // The pill for a "New" line above waits until the chat has settled at its end, so a line in view never flashes it.
    .task {
      try? await Task.sleep(nanoseconds: 700_000_000)
      settled = true
    }
  }

  /** A row above the drawn ones is drawn first, then scrolled to. */
  private func reveal(_ id: String, then scroll: @escaping () -> Void) {
    let all = allRows
    guard let index = all.firstIndex(where: { $0.id == id }), all.count - index > window else { return scroll() }
    window = all.count - index + 10
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 50_000_000)
      scroll()
    }
  }

  /** The agents' messages after the "New" line: the count on its pill. */
  static func unreadCount(_ rows: [ChatRow]) -> Int {
    guard let divider = rows.firstIndex(where: { $0.id == "unread-divider" }) else { return 0 }
    return rows[divider...].filter { row in if case .bubble(let b) = row { return !b.fromPerson }; return false }.count
  }

  /**
   * The space above a row, the window's way: 4 between lines of the same
   * side (each row's 2 pt padding), 16 when the speaker changes (the bubble's
   * 12 pt margin), 12 around the lines in the middle; a stamp brings its own.
   */
  static func gap(_ previous: ChatRow?, _ row: ChatRow) -> CGFloat {
    guard let previous else { return 4 }
    if case .stamp = row { return 0 }
    if case .stamp = previous { return 0 }
    if case .unread = row { return 8 }
    if case .unread = previous { return 4 }
    switch (previous.side, row.side) {
    case (.middle, _), (_, .middle): return 12
    case let (a, b) where a != b: return 16
    default: return 4
    }
  }
}

/**
 * The agent at work, at the end of the conversation, while it writes or
 * runs (the window's activity row: `isComposingMessage`, or `isRunning`
 * and not waiting on you). It comes in as the Mac's does (0.18 s, from
 * 92 %, `cubic-bezier(.22,1,.36,1)`) and goes the same way in 0.14 s.
 */
struct TypingSlot: View {
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    let agent = store.agent(agentId)
    // Not while an ask to use the Mac waits in the dock (the window's `!Le`).
    let working = (agent.map { $0.isBusy || ($0.isRunning && !$0.awaitingUserResponse) } ?? false) && store.localAsks[agentId] == nil
    ZStack(alignment: .leading) {
      if working, let agent {
        TypingRow(agent: agent, step: agent.isGroup ? (agent.activityLabel ?? store.steps[agentId]) : nil)
          .padding(.top, 16)
          .transition(.asymmetric(
            insertion: .scale(scale: 0.92, anchor: .leading).combined(with: .opacity).animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.18)),
            removal: .scale(scale: 0.92, anchor: .leading).combined(with: .opacity).animation(.easeIn(duration: 0.14))))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.18), value: working)
  }
}

/**
 * The agent at the top of the chat, as Messages has it: its butterfly at
 * 52 pt (its members side by side for a group) with its name in a glass
 * capsule under it, up beside the bar's back and call buttons; a tap opens
 * its page. Only this redraws when the agent changes.
 */
struct ChatHeadline: View {
  let agentId: String
  let open: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    if let agent = store.agent(agentId) {
      VStack(spacing: 4) {
        AgentAvatar(agent: agent, members: store.members(of: agent), groupInARow: true, moves: true)
          .frame(width: agent.isGroup ? nil : 52, height: 52)
        Text(agent.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
          .padding(.horizontal, 12).padding(.vertical, 4)
          .glassEffect(.regular, in: .capsule)
      }
      .padding(.horizontal, 70)
      .contentShape(.rect)
      .onTapGesture(perform: open)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(agent.name), details")
      .accessibilityAddTraits(.isButton)
      // Up into the bar's row, beside its back and call buttons.
      .padding(.top, -34)
      .padding(.bottom, 6)
      .frame(maxWidth: .infinity)
    }
  }
}

/** The call, at the right of the bar as Messages has its FaceTime button. */
struct ChatCallButton: View {
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    let agent = store.agent(agentId)
    Button { if let agent { store.startCall(agent) } } label: { Image(systemName: "phone.fill") }
      .accessibilityLabel("Call \(agent?.name ?? "")")
      .disabled(agent == nil || store.call != nil)
  }
}

/** The call with this agent, under the bar while it lasts; a tap opens it full. */
struct ChatCallSlot: View {
  let agentId: String
  @Binding var showsCall: Bool
  @Binding var showsTranscript: Bool
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 0) {
      if let call = store.call, call.agentId == agentId {
        CallPill(call: call, showsTranscript: $showsTranscript) { showsCall = true }
          .padding(.horizontal, 12)
          .padding(.top, 6)
          .padding(.bottom, 8)
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .frame(maxWidth: .infinity)
    .animation(.snappy, value: store.call?.agentId)
    .onChange(of: store.call == nil) { _, gone in if gone && showsCall { showsCall = false } }
  }
}

/**
 * The composer (`.sand-prompt-shell`): one 44 pt line on the page's ground
 * with a hairline edge, the + disc inside it at the left, the text at
 * 14 pt, the blue send (or mic) at the right. What you type stays here, so
 * a keystroke redraws only this.
 */
struct ChatComposer: View {
  let agentId: String
  /** Writing in a thread (its first message's id): every message answers it there (`isFork`). */
  var thread: String? = nil
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @State private var draft = ""
  @State private var attachments: [ComposerAttachment] = []
  @State private var picking = false
  @State private var dictation = Dictation()
  @FocusState private var typing: Bool
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?
  /** The agent's name for the placeholder, read once: reading it in the body would redraw the field on every roster change. */
  @State private var name = ""
  /** The agent's skills ("/") and routines ("@"), read once the chat is open (`getAgentWorkflows`). */
  @State private var skills: [ComposerMenus.Skill] = []
  @State private var routines: [ComposerMenus.Skill] = []
  /** What was picked from "@", "/" and "#", where it sits in the draft: it rides in the message's document (`richText`). */
  @State private var chips: [ComposerChip] = []
  /** The draft the chips were last placed in, to move them as it changes. */
  @State private var placedIn = ""
  /** The pull requests the chat named, read when a "#" starts (not on every key). */
  @State private var chatPulls: [ComposerMenus.PullRequest] = []
  /** The lit row of the open list. */
  @State private var highlighted = 0
  /** Where Esc put each list away (by its trigger character): it stays shut there (the window's `j5e`). */
  @State private var dismissed: [Character: Int] = [:]
  @Environment(ChatActions.self) private var actions: ChatActions?
  @Environment(ComposerHook.self) private var hook: ComposerHook?
  /** The ids of the emoji picked lately after ":", newest first, at most 50 (the window's `emojiRecents`); only those picks count. */
  @AppStorage("simeon.emoji.recents") private var recentEmoji = ""
  /** The "@" rows picked lately ("assistants:<id>"…), newest first, at most 20 (the window's `mentionRecents`). */
  @AppStorage("simeon.mention.recents") private var recentMentions = ""

  enum Mode { case send, mic, stop }

  private var mode: Mode {
    if dictation.isListening { return .stop }
    return draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty ? .mic : .send
  }

  /** Lines in the draft, for the composer's growth (at most the field's eight). */
  private var lineCount: Int { min(8, draft.reduce(1) { $1 == "\n" ? $0 + 1 : $0 } + draft.count / 38) }

  /**
   * The list open over the field, when one is: "@" (agents, groups,
   * everyone, routines, connectors), "/" (skills, then the app's actions),
   * "#" (pull requests the chat named) or ":" (emoji); each where its
   * trigger is being typed after the last pick, unless Esc put it away
   * there; none while the field is not in use.
   */
  private var openList: ComposerOpenList? {
    guard typing else { return nil }
    let start = ComposerDocument.textStart(chips, in: draft)
    if let at = ComposerLists.trigger("@", in: draft, after: start), dismissed["@"] != at.at {
      let current = store.agent(agentId)
      let members = ComposerLists.mentionMembers(current: current, roster: store.agents)
      let rows = ComposerLists.mentionRows(members: members, isGroupChat: current?.isGroup == true, routines: routines, connectors: ComposerLists.mentionConnectors(store.apps))
      return .mention(at, ComposerLists.filterMentions(rows, query: at.query, recents: recentMentions.split(separator: "\n").map(String.init)))
    }
    if let at = ComposerLists.trigger("/", in: draft, after: start), dismissed["/"] != at.at {
      let offered = actions?.slashActions() ?? []
      return .slash(at, ComposerLists.slashItems(skills: skills, actions: offered, query: at.query), hasAny: !skills.isEmpty || !offered.isEmpty)
    }
    if let at = ComposerLists.trigger("#", in: draft, after: start), dismissed["#"] != at.at {
      return .pulls(at, ComposerLists.filterPulls(chatPulls, query: at.query))
    }
    if let query = EmojiCatalog.query(draft) {
      let at = draft.count - query.count - 1
      if at >= start && dismissed[":"] != at {
        return .emoji(at: at, query: query, EmojiCatalog.suggestions(query, recent: recentEmoji.split(separator: " ").map(String.init)))
      }
    }
    return nil
  }

  /** Where the draft is kept: the chat's, or its thread's. */
  private var draftKey: String { AppStore.draftScope(agentId, thread: thread) }

  /**
   * "Message" on the iPhone ("Reply" while replying). On the Mac the
   * window's (`T9n`, `x9n`): "Listening…" while dictating, "Reply…" while
   * replying, "Add a message, or hit send." with files and no words, else
   * "Message *name*" ("Message group" for a group with no name, "Ask
   * anything, or drop a file." with no name at all).
   */
  private var placeholder: String {
    #if os(macOS)
    if dictation.isListening { return "Listening…" }
    if thread == nil, let target = reply?.target { return Chat.replyPlaceholder(replyEntry(target)) }
    // The new chat's own (`$4n`), while its To: line is open.
    if let resting = hook?.placeholder { return resting }
    if !attachments.isEmpty { return "Add a message, or hit send." }
    let named = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if !named.isEmpty { return "Message \(named)" }
    return store.groupIds.contains(agentId) ? "Message group" : "Ask anything, or drop a file."
    #else
    if reply?.target != nil { return "Reply" }
    return "Message"
    #endif
  }

  var body: some View {
    let _ = Trace.mark("drawing the composer of \(agentId), \(draft.count) characters")
    VStack(spacing: 6) {
      // The computer's notices about this agent ("Agent failed to respond"…), first over the composer (`sand-tray-stack`).
      TrayStack(agentId: agentId)
      if let list = openList, list.isVisible {
        ComposerListPanel(items: list.items, highlighted: $highlighted, emptyText: list.emptyText, label: list.label,
                          rowHeight: list.rowHeight, maxHeight: list.maxHeight) { index in pick(index, in: list) }
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
      if let notice = store.composerNotice, notice.agentId == agentId {
        // The window's line in the composer (`sand-prompt-error-notice`), for six seconds.
        Text(notice.text)
          .font(.system(size: 12)).foregroundStyle(Ink.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .accessibilityAddTraits(.updatesFrequently)
          .transition(.opacity)
      }
      if let words = store.access.notice {
        // While this account has no Simeon (`sand-access-notice`): why, and the page; Send waits meanwhile.
        AccessNotice(words: words)
      }
      #if os(macOS)
      if let ask = store.localAsks[agentId] {
        // The agent asks to use this Mac: the card waits here, above the composer (`sand-local-tool-permission-dock`).
        MacLocalAskCard(ask: ask, agentId: agentId).id(ask.entryId)
      }
      #endif
      if !attachments.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(attachments) { file in
              AttachmentChip(file: file) { attachments.removeAll { $0.id == file.id } }
            }
          }
          .padding(.horizontal, 4)
        }
      }
      if thread == nil, let target = reply?.target {
        // The message being answered (the window's reply pill): the arrow, what it is (its words cut at 72, "Photo", a file's
        // name, a link's host), and Cancel reply, on glass above the field.
        HStack(spacing: 8) {
          Image(systemName: "arrowshape.turn.up.right").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary)
          ReplyPreviewLine(entry: replyEntry(target), limit: 72, thumbnail: 28)
            .font(.system(size: 15)).foregroundStyle(Ink.secondary)
          Spacer(minLength: 0)
          Button { reply?.target = nil } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Ink.secondary)
              .frame(width: 32, height: 32).contentShape(.circle)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Cancel reply")
        }
        .padding(.leading, 14).padding(.trailing, 4)
        .glassEffect(.regular, in: .rect(cornerRadius: 18, style: .continuous))
        .padding(.leading, 48)
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }
      // Messages' composer: + in a glass circle, then the field in glass, the mic inside it at the right while it is
      // empty and the blue send once there is something to send. Nothing opaque: the chat shows through as it scrolls under.
      HStack(alignment: .bottom, spacing: 8) {
        Button { picking = true } label: {
          Image(systemName: "plus").font(.system(size: 19, weight: .regular)).foregroundStyle(Ink.primary)
            .frame(width: 40, height: 40)
        }
        .buttonStyle(GlassDisc())
        .accessibilityLabel("Attach")
        HStack(alignment: .bottom, spacing: 4) {
          TextField(placeholder, text: $draft, axis: .vertical)
            .font(.system(size: 17))
            .lineLimit(1...6)
            .focused($typing)
            // The open list's keys first (arrows, Return or Tab to pick, Esc to put it away); Esc with none leaves the field.
            .onKeyPress(phases: .down) { press in key(press) }
            #if os(macOS)
            // Return sends, as the Mac's window does; Option-Return starts a new line.
            .onSubmit {
              if let list = openList, list.count > 0 { pick(min(highlighted, list.count - 1), in: list); return }
              if mode == .send { send() }
            }
            #endif
            .padding(.leading, 16)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
          ZStack {
            switch mode {
            case .stop:
              Button { dictation.stop() } label: {
                Image(systemName: "stop.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                  .frame(width: 30, height: 30).background(Ink.danger, in: Circle())
                  .frame(width: 36, height: 36).contentShape(.circle)
              }
              .accessibilityLabel("Stop dictation")
              .transition(.scale(scale: 0.6).combined(with: .opacity))
            case .mic:
              Button { dictation.start { text in draft = text } } label: {
                Image(systemName: "mic").font(.system(size: 18, weight: .regular)).foregroundStyle(Ink.secondary)
                  .frame(width: 36, height: 36).contentShape(.circle)
              }
              .accessibilityLabel("Dictate")
              .transition(.scale(scale: 0.6).combined(with: .opacity))
            case .send:
              Button(action: send) {
                Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                  .frame(width: 30, height: 30).background(Ink.bubbleMine, in: Circle())
                  .frame(width: 36, height: 36).contentShape(.circle)
              }
              .accessibilityLabel("Send")
              .disabled(hook?.sendDisabled == true || store.isSendingPaused)
              .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
          }
          .buttonStyle(.plain)
          .frame(width: 36, height: 36)
          .padding(.trailing, 2).padding(.bottom, 2)
          .animation(.easeOut(duration: 0.2), value: mode)
        }
        .frame(minHeight: 40)
        // A tap anywhere on the field that is not its button goes to the text, as in Messages.
        .background { Color.clear.contentShape(.rect(cornerRadius: 20, style: .continuous)).onTapGesture { typing = true } }
        .glassEffect(.regular, in: .rect(cornerRadius: 20, style: .continuous))
      }
      // A new line or a quote above eases in.
      .animation(.spring(response: 0.3, dampingFraction: 0.9), value: lineCount)
      .animation(.spring(response: 0.3, dampingFraction: 0.9), value: reply?.target?.id)
    }
    .padding(.horizontal, 12)
    .padding(.top, 6)
    .padding(.bottom, 8)
    .animation(.snappy(duration: 0.2), value: openList?.isVisible == true)
    .animation(.easeOut(duration: 0.2), value: store.composerNotice?.id)
    // Picks move with the words around them, and go when edited; Esc's memory goes when its trigger does.
    .onChange(of: draft) { _, now in
      if now != placedIn {
        chips = ComposerDocument.carry(chips, from: placedIn, to: now)
        placedIn = now
      }
      for (character, at) in dismissed {
        var memory = ComposerLists.Dismissal(character: character)
        memory.at = at
        memory.check(now)
        if let list = openList, list.trigger.character == character { _ = memory.allows(list.trigger.at) }
        if memory.at == nil { dismissed[character] = nil }
      }
    }
    .onChange(of: openList?.identity) { _, _ in highlighted = 0 }
    .onChange(of: ComposerLists.trigger("#", in: draft, after: ComposerDocument.textStart(chips, in: draft)) != nil) { _, started in
      if started { chatPulls = ComposerLists.pullCandidates(store.transcripts[agentId] ?? []) }
    }
    .onAppear {
      let named = store.agent(agentId)?.name ?? ""
      if name != named { name = named }
    }
    // "/" and "@" offer the agent's skills and routines, read once per chat; "@" the connected apps too.
    .task(id: agentId) {
      let answer = await store.workflows(agentId)
      skills = ComposerMenus.skills(from: answer)
      routines = ComposerMenus.skills(from: answer, scheduled: true)
      if store.apps.isEmpty { await store.loadApps() }
    }
    .composerPicker(isPresented: $picking) { picked in stage(picked) }
    .onChange(of: dictation.problem) { _, problem in if let problem { store.problem = problem } }
    .onChange(of: reply?.target?.id) { _, id in if id != nil { typing = true } }
    #if os(macOS)
    // ⌘L and ⌘I put the cursor here (the Mac's Agent menu).
    .onReceive(NotificationCenter.default.publisher(for: .simeonFocusComposer)) { _ in typing = true }
    // Files dropped on the chat or pasted into it (mac/Simeon/MacChat.swift).
    .onReceive(NotificationCenter.default.publisher(for: .simeonAttachFiles)) { note in
      guard let request = note.object as? AttachRequest, request.agentId == agentId else { return }
      stage(request.files)
      typing = true
    }
    #endif
    // The unsent draft stays with its chat (or its thread), as on the Mac; it comes back, unless a message was handed here (the new chat's), which takes its place as the window's `setDraft` does.
    .onAppear {
      restoreCanceled()
      if draft.isEmpty, let kept = store.drafts[draftKey], kept != draft { draft = kept }
      hook?.take = { takeMessage() }
    }
    // A held message canceled: what was written comes back here, if this is its composer and it is empty (the window's cancel).
    .onChange(of: store.canceledDraft?.id) { _, _ in restoreCanceled() }
    // Saved when typing pauses, not per letter (the list redraws on a save).
    .task(id: draft) {
      try? await Task.sleep(nanoseconds: 600_000_000)
      if !Task.isCancelled { store.setDraft(draft, for: draftKey) }
    }
    .onDisappear { store.setDraft(draft, for: draftKey) }
  }

  /** A canceled or handed-over message comes back here, if this is its composer and it is empty (the window's cancel). */
  private func restoreCanceled() {
    guard let canceled = store.canceledDraft, canceled.scope == draftKey else { return }
    store.takeCanceledDraft(canceled.id)
    guard draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, attachments.isEmpty else { return }
    // The draft as it was written: its words and its picks, read back from its document.
    let restored = ComposerDocument.draft(from: canceled.richText) ?? (canceled.text, [])
    place(restored.draft, chips: restored.chips)
    attachments = canceled.files.map { ComposerAttachment(name: $0.name, data: $0.data, preview: FileKind.images.contains(($0.name as NSString).pathExtension.lowercased()) ? UIImage(data: $0.data) : nil) }
    if thread == nil, let replyTo = canceled.replyTo {
      reply?.target = Bubble(id: replyTo, text: "", fromPerson: false, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: false)
    }
    typing = true
  }

  /** What is written, handed to the new chat, and the field emptied (the window's `takeComposer`). */
  private func takeMessage() -> ComposerHook.Message {
    let message = ComposerHook.Message(text: ComposerDocument.prompt(draft), richText: ComposerDocument.richText(draft, chips: chips), files: attachments)
    place("", chips: [])
    attachments = []
    store.setDraft("", for: draftKey)
    return message
  }

  /**
   * Files into the composer, as the window stages them: six at most, each up
   * to 25 MB (200 MB for a video) and not empty; a line for five seconds
   * says what was left out.
   */
  private func stage(_ incoming: [ComposerAttachment]) {
    let admitted = AttachmentLimits.admit(incoming.count, staged: attachments.count)
    var refused: [(name: String, reason: AttachmentLimits.Refusal)] = []
    for file in incoming.prefix(admitted.accepted) {
      if let reason = AttachmentLimits.refusal(name: file.name, size: file.data.count) { refused.append((file.name, reason)) } else { attachments.append(file) }
    }
    if let line = AttachmentLimits.notice(refused) ?? admitted.notice {
      store.showComposerNotice(line, in: agentId, seconds: AttachmentLimits.noticeSeconds)
    }
  }

  /** The line being answered, from the chat's own lines. */
  private func replyEntry(_ target: Bubble) -> Entry? {
    store.transcripts[agentId]?.last { $0.id == target.id }
  }

  /** The draft and its picks set together, so the picks are not moved as if typed over. */
  private func place(_ text: String, chips placed: [ComposerChip]) {
    placedIn = text
    chips = placed
    draft = text
  }

  /** The open list's keys (the window's): arrows move and wrap, Return or Tab picks, Esc puts it away there; Esc with none open leaves the field. */
  private func key(_ press: KeyPress) -> KeyPress.Result {
    guard let list = openList, list.isVisible else {
      if press.key == .escape && press.modifiers.isEmpty { typing = false; return .handled }
      return .ignored
    }
    let count = list.count
    switch press.key {
    case .downArrow where count > 0:
      highlighted = (min(highlighted, count - 1) + 1) % count
      return .handled
    case .upArrow where count > 0:
      highlighted = (min(highlighted, count - 1) - 1 + count) % count
      return .handled
    case .return where count > 0, .tab where count > 0:
      pick(min(highlighted, count - 1), in: list)
      return .handled
    case .escape:
      // "@" and "/" remember Esc whenever they show; "#" and ":" only with something offered.
      dismissed[list.trigger.character] = list.trigger.at
      return .handled
    default:
      return .ignored
    }
  }

  /** A row picked: its piece in place of the trigger and what was typed after it, and a space (an action runs instead). */
  private func pick(_ index: Int, in list: ComposerOpenList) {
    switch list {
    case .mention(let at, let rows):
      guard rows.indices.contains(index) else { return }
      let row = rows[index]
      let node: ComposerChip.Node
      switch row.insert {
      case .mention(let id, let label): node = .mention(id: id, label: label)
      case .workflow(let id, let label, let iconId, let iconURL): node = .workflow(id: id, label: label, iconId: iconId, iconURL: iconURL)
      }
      let picked = ComposerDocument.picking(node, from: at.at, in: draft, chips: chips)
      place(picked.draft, chips: picked.chips)
      recentMentions = ComposerLists.rememberingMention(row.key, in: recentMentions.split(separator: "\n").map(String.init)).joined(separator: "\n")
    case .slash(let at, let items, _):
      guard items.indices.contains(index) else { return }
      switch items[index] {
      case .skill(let skill):
        let picked = ComposerDocument.picking(.workflow(id: skill.id, label: skill.name, iconId: skill.iconId, iconURL: skill.iconURL), from: at.at, in: draft, chips: chips)
        place(picked.draft, chips: picked.chips)
      case .action(let action):
        // The "/…" typed goes, and the action runs; nothing is written.
        place(String(Array(draft)[..<min(at.at, draft.count)]), chips: chips.filter { $0.end <= at.at })
        actions?.runSlashAction(action.id)
      }
    case .pulls(let at, let pulls):
      guard pulls.indices.contains(index) else { return }
      let pull = pulls[index]
      let picked = ComposerDocument.picking(.pullRequest(number: pull.number, title: pull.title, url: pull.url.isEmpty ? nil : pull.url), from: at.at, in: draft, chips: chips)
      place(picked.draft, chips: picked.chips)
    case .emoji(_, _, let found):
      guard found.indices.contains(index) else { return }
      let emoji = found[index]
      place(EmojiCatalog.inserting(emoji.character, into: draft), chips: chips)
      recentEmoji = EmojiCatalog.remembering(emoji.id, in: recentEmoji.split(separator: " ").map(String.init)).joined(separator: " ")
    }
    highlighted = 0
  }

  private func send() {
    // Nothing goes while Simeon's computer is being rebuilt (`isSendingPaused`).
    if store.isSendingPaused { return }
    // The words as sent, trimmed; the document as the editor holds it, picks and all (`richText`).
    let text = ComposerDocument.prompt(draft)
    let rich = ComposerDocument.richText(draft, chips: chips)
    let files = attachments
    // The new chat's To: line decides first: it makes the agents and sends there, holds it, or lets it go here.
    if let hook {
      if hook.sendDisabled { return }
      switch hook.submit?(ComposerHook.Message(text: text, richText: rich, files: files)) ?? .sendHere {
      case .kept: return
      case .taken:
        place("", chips: [])
        attachments = []
        store.setDraft("", for: draftKey)
        return
      case .sendHere: break
      }
    }
    defer { hook?.afterSend?() }
    // In a thread every message answers its first one; else the message Reply was chosen on.
    let answering = thread ?? reply?.target?.id
    place("", chips: [])
    attachments = []
    if thread == nil { reply?.target = nil }
    dictation.stop()
    // The composer's pictures are shown in the chat as they are, before anything goes to the computer.
    let id = AppStore.newMessageId()
    for (index, file) in files.enumerated() { if let preview = file.preview { ChatImages.keep(preview, under: [AppStore.outboxFileURL(id, index)]) } }
    let inThread = thread != nil
    Task { await store.send(text, to: agentId, attachments: files.map { ($0.name, $0.data) }, replyTo: answering, inThread: inThread, richText: rich, id: id) }
  }
}

/** One row of the chat. */
struct ChatRowView: View, Equatable {
  let row: ChatRow
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(ChatActions.self) private var actions: ChatActions?

  static func == (a: ChatRowView, b: ChatRowView) -> Bool { a.row == b.row && a.agentId == b.agentId }

  private func openPage() { actions?.openPage() }
  private func openComputer() { actions?.openComputer() }

  var body: some View {
    switch row {
    case .stamp(_, let date):
      Text(Chat.stampText(date)).font(.system(size: 12)).foregroundStyle(Ink.secondary)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .padding(.top, 14).padding(.bottom, 8)
    case .unread:
      UnreadDivider()
    case .bubble(let bubble):
      BubbleView(bubble: bubble, agentId: agentId, inGroup: store.groupIds.contains(agentId))
    case .flights(_, let card):
      FlightsCardView(card: card)
    case .file(let id, let name, let url, let fromPerson):
      FileCardView(entryId: id, name: name, url: url, agentId: agentId, fromPerson: fromPerson)
    case .question(let id, let card):
      QuestionCardView(entryId: id, agentId: agentId, card: card)
    case .draft(let id, let card):
      DraftCardView(entryId: id, agentId: agentId, card: card)
    case .connectors(_, let names, let connected, let reason):
      ConnectorsCardView(names: names, connected: connected, reason: reason)
    case .listenerConnect(_, let platform, let reason):
      ListenerConnectCard(platform: platform, reason: reason)
    case .request(let id, let card):
      RequestCardView(entryId: id, agentId: agentId, card: card, openComputer: openComputer)
    case .teammates(_, let exchange, let entries):
      TeammatesLine(exchange: exchange, entries: entries, agentId: agentId)
    case .voiceCall(_, let seconds, let lines):
      VoiceCallLine(seconds: seconds, lines: lines)
    case .routines(_, let action, let routines):
      RoutinesLine(action: action, routines: routines) { id in if let open = actions?.openRoutine { open(id) } else { openPage() } }
    case .notice(_, let text):
      EventLine { Text(text) }
    case .failedSend(_, let nonce):
      FailedSendRow(nonce: nonce, agentId: agentId)
    case .queuedSend(_, let nonce):
      QueuedSendRow(nonce: nonce, agentId: agentId)
    case .thread(_, let rootId, let count, let side):
      ThreadLinkRow(rootId: rootId, count: count, side: side)
    case .cloudAgent(let id, let bcId):
      CloudAgentCard(entryId: id, bcId: bcId, agentId: agentId)
    }
  }
}

/**
 * A message from a messaging channel or sent to one (`eTe`,
 * `sand-channel-tag`): an arrow (down in, up out) and the platform's name in
 * a small pill of the bubble's own ink, the sentence ("From Ada on
 * Discord", "Sent to Slack") as its tooltip.
 */
struct ChannelTagView: View {
  let tag: ChannelTag
  let ink: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: tag.inbound ? "arrow.down" : "arrow.up").font(.system(size: 9, weight: .semibold))
      Text(tag.platform).font(.system(size: 11, weight: .medium))
    }
    .foregroundStyle(ink.opacity(0.65))
    .padding(.leading, 6).padding(.trailing, 7).padding(.vertical, 2)
    .background(ink.opacity(0.12), in: Capsule())
    .help(tag.title)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(tag.title)
  }
}

/**
 * A bubble (`.sand-message`): yours on the right in the chat's blue, 10 × 15
 * with 14 pt text on 21 pt lines; an agent's on the left in the Messages
 * grey, 8 × 12, its Markdown, brands and teammates dressed as on the Mac;
 * both 18 pt round and at most the window's width. In a group, the member's
 * name over the first of their bubbles and their butterfly beside the last.
 * A lone emoji is drawn large with no bubble.
 */
struct BubbleView: View {
  let bubble: Bubble
  let agentId: String
  let inGroup: Bool
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @Environment(\.chatWidth) private var width
  @Environment(ChatActions.self) private var actions: ChatActions?
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?
  @Environment(MessageMenu.self) private var messageMenu: MessageMenu?
  @Environment(\.chatThread) private var thread
  @State private var reacting: Set<String> = []
  /** The reactions it had when it came on screen: only one added after pops in (the Mac's `FEn`). */
  @State private var reactionsSeen: Set<String>?
  /** Show more on a long message (the Mac folds one past 664 pt). */
  @State private var expanded = false

  /** What is drawn of the message: 3,000 characters folded, 40,000 open. A message of megabytes (a file or an image pasted as text) laid out whole held the screen still for minutes. */
  private var shown: (text: String, clipped: Bool) { Chat.clipped(bubble.text, limit: expanded ? 40_000 : 3_000) }

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      if bubble.fromPerson { Spacer(minLength: 0) }
      if inGroup && !bubble.fromPerson {
        Group {
          if bubble.showsAvatar, let author = bubble.author { ButterflyView(palette: .named(store.mentionNames.first { $0.id == author.id }?.colour ?? AgentPalette.defaultColour(forAgentId: author.id))) } else { Color.clear }
        }
        .frame(width: 22, height: 22)
      }
      VStack(alignment: bubble.fromPerson ? .trailing : .leading, spacing: 4) {
        if inGroup && bubble.showsName, let name = bubble.author?.name {
          Text(name).font(.system(size: 12)).foregroundStyle(Ink.secondary).padding(.leading, 12)
        }
        if let quote = bubble.quote, let target = bubble.replyTo, target != thread {
          // What this answers (`pCn`): one line over the bubble; a tap goes to it, or opens the thread it is in when it is a reply
          // in one. In a thread, not over a reply to its first message (every message there is one).
          let threadOfTarget = thread == nil ? store.threadRoot(of: target, in: agentId) : nil
          Button { if let threadOfTarget { actions?.openThread(threadOfTarget) } else { actions?.jump(target) } } label: {
            HStack(spacing: 4) {
              Image(systemName: "arrowshape.turn.up.right").font(.system(size: 10))
              Text(quote).lineLimit(1)
            }
            .font(.system(size: 13))
            .foregroundStyle(Ink.tertiary)
            .padding(.horizontal, 8).padding(.top, 4)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: bubble.fromPerson ? .trailing : .leading)
          .accessibilityLabel(threadOfTarget == nil ? "Jump to replied message" : "Open reply thread")
        }
        content
          .modifier(Glow(id: bubble.id))
          // Held: the reactions and the message's actions in a sheet from the bottom. UIKit's own long press, as Messages
          // has it: a finger that moves is a scroll, and the press gives way. SwiftUI's long press held the finger, and a
          // scroll that started on a message did not move.
          #if os(iOS)
          .gesture(MessageHold {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            messageMenu?.target = MessageTarget(bubble: bubble)
          })
          #else
          // On the Mac a message's actions are its right-click menu (mac/Simeon/MacChat.swift); a link card's and a
          // picture's own items come first in theirs. "More emoji" opens over the message.
          .modifier(MessageEmojiPopover(bubble: bubble, agentId: agentId))
          #endif
          .overlay(alignment: bubble.fromPerson ? .bottomTrailing : .bottomLeading) { reactions }
          .padding(.bottom, bubble.reactions.isEmpty ? 0 : 16)
        if let offline = bubble.sentOfflineAtMs { SentOfflineLine(ms: offline) }
      }
      .modifier(PeekShift(moves: bubble.fromPerson))
      if !bubble.fromPerson { Spacer(minLength: 0) }
    }
    .overlay(alignment: .trailing) {
      if let ms = bubble.timestampMs { PeekTime(ms: ms) }
    }
  }

  @ViewBuilder
  private var content: some View {
    let maxWidth = ChatMetrics.bubbleMax(width - (inGroup && !bubble.fromPerson ? 30 : 0))
    let shown = shown
    if let link = bubble.loneLink {
      // A message that is one link: its card (the window's `url-card.ts`), with no Copy.
      LinkCard(url: link, fromPerson: bubble.fromPerson)
        #if os(macOS)
        .contextMenu {
          LinkMenuItems(url: link)
          Divider()
          MessageContextMenu(bubble: bubble, agentId: agentId)
        }
        #endif
    } else if !bubble.images.isEmpty && bubble.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      // Pictures alone: the gallery without a bubble.
      ImageGallery(images: bubble.images, agentId: agentId, bubble: bubble)
    } else if bubble.isLoneEmoji {
      Text(bubble.text.trimmingCharacters(in: .whitespacesAndNewlines)).font(.system(size: 32))
        .modifier(MessageMenuOnMac(bubble: bubble, agentId: agentId))
    } else if bubble.fromPerson {
      VStack(alignment: .trailing, spacing: 6) {
        VStack(alignment: .leading, spacing: 6) {
          Text(shown.text)
            .font(.system(size: MessageType.size))
            .lineSpacing(MessageType.spacing(lineHeight: MessageType.mineLineHeight))
            .foregroundStyle(Ink.mineText)
            .fixedSize(horizontal: false, vertical: true)
          if let channel = bubble.channel { ChannelTagView(tag: channel, ink: Ink.mineText) }
        }
        if shown.clipped || expanded { more(light: true) }
      }
        .padding(.horizontal, 15).padding(.vertical, 10)
        .background(Ink.bubbleMine, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .modifier(MessageMenuOnMac(bubble: bubble, agentId: agentId))
        .frame(maxWidth: maxWidth, alignment: .trailing)
    } else {
      VStack(alignment: .leading, spacing: 6) {
        VStack(alignment: .leading, spacing: 6) {
          if !bubble.isStreaming, let record = CallRecord.parse(bubble.text) {
            // A call an older host wrote as a message: its row, which opens on the recap (the window's).
            CallRecordRow(record: record)
          } else {
            MarkdownView(blocks: Markdown.cachedBlocks(shown.text), mentioning: Mentioning(names: store.mentionNames, personName: store.account?.name, dark: scheme == .dark))
              .foregroundStyle(Ink.theirsText)
              .tint(Ink.link)
              // A diagram waits until the message is written (the window's rule).
              .environment(\.messageStreaming, bubble.isStreaming)
            if shown.clipped || expanded { more(light: false) }
          }
          if let channel = bubble.channel { ChannelTagView(tag: channel, ink: Ink.theirsText) }
        }
          .padding(.horizontal, 12).padding(.vertical, 8)
          .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
          .modifier(CardEdge(radius: 18))
          .modifier(MessageMenuOnMac(bubble: bubble, agentId: agentId))
          .frame(maxWidth: maxWidth, alignment: .leading)
        // The agent's pictures, under its words.
        if !bubble.images.isEmpty { ImageGallery(images: bubble.images, agentId: agentId, bubble: bubble) }
      }
    }
  }

  /** "Show more" and "Show less", with their chevron (the Mac's fold). */
  private func more(light: Bool) -> some View {
    Button { withAnimation(.snappy) { expanded.toggle() } } label: {
      HStack(spacing: 4) {
        Text(expanded ? "Show less" : "Show more")
        Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold))
      }
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(light ? Ink.mineText.opacity(0.85) : Ink.secondary)
      .padding(.vertical, 4)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder
  private var reactions: some View {
    if !bubble.reactions.isEmpty {
      HStack(spacing: 4) {
        ForEach(Self.counted(bubble.reactions), id: \.emoji) { item in
          HStack(spacing: 3) {
            Text(item.emoji).font(.system(size: 14))
            if item.count > 1 { Text("\(item.count)").font(.system(size: 12)).foregroundStyle(Ink.secondary) }
          }
          .padding(.leading, 7).padding(.trailing, 8)
          .frame(height: 22)
          .background(Ink.reaction, in: Capsule())
          .overlay(Capsule().stroke(Ink.ground, lineWidth: 2))
          .opacity(reacting.contains(item.emoji) ? 0.5 : 1)
          .contentShape(Capsule())
          .onTapGesture { react(item.emoji) }
          .modifier(ReactionPop(pops: reactionsSeen.map { !$0.contains(item.emoji) } ?? false))
        }
      }
      .padding(.horizontal, 10)
      .offset(y: 16)
    }
    Color.clear.frame(width: 0, height: 0)
      .onAppear { if reactionsSeen == nil { reactionsSeen = Set(bubble.reactions) } }
  }

  /** One reaction at a time per emoji: the host toggles it, so a second tap before it answers would take it back. */
  private func react(_ emoji: String) {
    guard reacting.insert(emoji).inserted else { return }
    Task {
      await store.react(emoji, to: bubble.id, in: agentId)
      try? await Task.sleep(nanoseconds: 1_200_000_000)
      reacting.remove(emoji)
    }
  }

  static func counted(_ emoji: [String]) -> [(emoji: String, count: Int)] {
    var out: [(emoji: String, count: Int)] = []
    for e in emoji { if let i = out.firstIndex(where: { $0.emoji == e }) { out[i].count += 1 } else { out.append((e, 1)) } }
    return out
  }
}

/**
 * The agent at work, as the Mac's chat shows it (`sand-activity-mark`):
 * in a one-to-one chat its butterfly, 28 pt, moving as it works (folded
 * into three dots while it thinks, five dots circling while it waits on
 * someone, a dot flying off while it messages another agent, whirling
 * while it makes a picture, a turn with its light trails every few seconds
 * while it runs commands), and beside it what it is doing, under the
 * Mac's moving light: "Running commands", "Searching the web", "Messaging
 * Iris" (the Mac shows the words when the pointer is over the row; a phone
 * has no pointer, so they always show). In a group (`sand-activity-line`),
 * one member's butterfly at 22 pt beside who is at work.
 */
struct TypingRow: View {
  let agent: Agent
  let step: String?
  @Environment(AppStore.self) private var store

  var body: some View {
    if agent.isGroup {
      GroupActivityLine(agent: agent, step: step)
    } else {
      let line = agent.activityLine(named: { store.agent($0)?.name })
      HStack(spacing: 8) {
        ButterflyView(palette: agent.palette, motion: agent.markState == .idle ? .working : agent.markState)
          .frame(width: 28, height: 28)
          .modifier(MarkPop())
        if let line { ActivityLabel(line: line) }
      }
      .padding(.leading, 8)
      .frame(height: 36)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(line.map { "\(agent.name): \($0.text)" } ?? (agent.markState == .thinking ? "\(agent.name) is typing" : "\(agent.name) is working"))
    }
  }
}

/** The butterfly's own entrance into the row (0.34 s from 60 %, a little past and back, 0.22 s after the row). */
struct MarkPop: ViewModifier {
  @State private var shown = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .scaleEffect(shown ? 1 : 0.6)
      .opacity(shown ? 1 : 0)
      .onAppear {
        guard !shown else { return }
        if reduceMotion { shown = true; return }
        withAnimation(.timingCurve(0.34, 1.56, 0.64, 1, duration: 0.34).delay(0.22)) { shown = true }
      }
  }
}

/**
 * What the agent is doing, in words (`TJn`), under the moving light; no
 * picture beside them (the founder, 9 October 2026: "no tool please"). A
 * new activity comes in from 4 pt below (0.18 s); one that changes again
 * within 0.8 s waits its turn, so the words do not flicker; after a minute
 * at it, how long (" · 3m").
 */
struct ActivityLabel: View {
  let line: ActivityLine
  @State private var shown: ActivityLine?
  @State private var shownAt = Date.distantPast
  @State private var startedAt = Date()

  var body: some View {
    let current = shown ?? line
    ZStack(alignment: .leading) {
      HStack(spacing: 6) {
        ShimmerText(text: current.text)
        TimelineView(.periodic(from: startedAt, by: 30)) { context in
          if let elapsed = ActivityLine.elapsed(context.date.timeIntervalSince(startedAt)) {
            Text("· \(elapsed)").font(.system(size: 12)).foregroundStyle(Ink.tertiary).monospacedDigit()
          }
        }
      }
      .lineLimit(1)
      .id(current.key)
      .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 4)), removal: .opacity))
    }
    .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.18), value: current.key)
    .task(id: line) {
      if let shown, shown == line { return }
      let wait = 0.8 - Date().timeIntervalSince(shownAt)
      if shown != nil && wait > 0 {
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        guard !Task.isCancelled else { return }
      }
      if shown?.key != line.key { startedAt = Date() }
      shown = line
      shownAt = Date()
    }
  }
}

/**
 * The Mac's moving light over a line (`sand-shimmer-text`): the words in the
 * text colour at 40 %, a band of full colour sweeping across them every
 * 2.2 s, eased both ways (a gradient twice their width, stops at 0, 25, 60,
 * 75 and 100 %, moved from 200 % to -200 %). Still for people who reduce
 * motion, in the secondary colour.
 */
struct ShimmerText: View {
  let text: String
  var font: Font = .system(size: 15, weight: .medium)
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if reduceMotion {
      Text(text).font(font).foregroundStyle(Ink.secondary)
    } else {
      TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
        let t = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.2) / 2.2
        let eased = t * t * (3 - 2 * t)
        let x = -(2 - 4 * eased)
        Text(text).font(font).foregroundStyle(LinearGradient(
          stops: [.init(color: Ink.tertiary, location: 0), .init(color: Ink.tertiary, location: 0.25), .init(color: Ink.primary, location: 0.6), .init(color: Ink.tertiary, location: 0.75), .init(color: Ink.tertiary, location: 1)],
          startPoint: UnitPoint(x: x, y: 0.5), endPoint: UnitPoint(x: x + 2, y: 0.5)))
      }
    }
  }
}

/**
 * A group at work (`sand-activity-line`): one member's butterfly, 22 pt,
 * and who is at it ("Theo is typing…", "Theo and Iris are working…",
 * "Theo, Iris and 2 others are working…"), or the group's current step;
 * a new line rolls up into place (0.3 s) and holds at least 1.2 s.
 */
struct GroupActivityLine: View {
  let agent: Agent
  let step: String?
  @Environment(AppStore.self) private var store
  @State private var shown: String?
  @State private var shownAt = Date.distantPast

  var body: some View {
    let members = store.members(of: agent)
    let text = Self.line(members: members, step: step)
    let current = shown ?? text
    HStack(spacing: 8) {
      if let member = members.first(where: { $0.isBusy || $0.isRunning }) ?? members.first {
        ButterflyView(palette: member.palette, motion: member.markState == .idle ? .working : member.markState).frame(width: 22, height: 22)
      }
      ZStack(alignment: .leading) {
        ShimmerText(text: current, font: .system(size: 14))
          .lineLimit(1)
          .id(current)
          .transition(.push(from: .bottom))
      }
      .clipped()
      .animation(.easeInOut(duration: 0.3), value: current)
    }
    .padding(.leading, 8)
    .frame(height: 36)
    .accessibilityElement(children: .combine)
    .task(id: text) {
      if shown == text { return }
      let wait = 1.2 - Date().timeIntervalSince(shownAt)
      if shown != nil && wait > 0 {
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        guard !Task.isCancelled else { return }
      }
      shown = text
      shownAt = Date()
    }
  }

  static func line(members: [Agent], step: String?) -> String {
    let typing = members.filter(\.isComposing).map(\.name)
    let working = members.filter { !$0.isComposing && ($0.isRunning || $0.isRunningTurn) && !$0.awaitingUserResponse }.map(\.name)
    if !typing.isEmpty { return names(typing) + (typing.count == 1 ? " is typing…" : " are typing…") }
    if let step, !step.isEmpty { return step }
    if !working.isEmpty { return names(working) + (working.count == 1 ? " is working…" : " are working…") }
    return "Working…"
  }

  static func names(_ list: [String]) -> String {
    switch list.count {
    case 1: return list[0]
    case 2: return "\(list[0]) and \(list[1])"
    case 3: return "\(list[0]), \(list[1]) and \(list[2])"
    default: return "\(list[0]), \(list[1]) and \(list.count - 2) others"
    }
  }
}

/** A reaction added while its message is on screen (`FEn`): in from 45 %, past to 108 % and back, 0.3 s, from its top. */
struct ReactionPop: ViewModifier {
  let pops: Bool
  @State private var scale: CGFloat = 1
  @State private var shown = true
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .scaleEffect(scale, anchor: .top)
      .opacity(shown ? 1 : 0)
      .onAppear {
        guard pops, !reduceMotion else { return }
        scale = 0.45; shown = false
        withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.195)) { scale = 1.08; shown = true } completion: {
          withAnimation(.easeOut(duration: 0.105)) { scale = 1 }
        }
      }
  }
}

/** A line that just arrived, or a message just sent: in with the Mac's motion (240 ms, a 12 pt rise, from 94 %, `cubic-bezier(.23,1,.32,1)`), once. */
struct Arrival: ViewModifier {
  let id: String
  @Environment(AppStore.self) private var store
  @State private var shown: Bool

  init(id: String, arriving: Bool) {
    self.id = id
    _shown = State(initialValue: !arriving)
  }

  func body(content: Content) -> some View {
    content
      .opacity(shown ? 1 : 0)
      .scaleEffect(shown ? 1 : 0.94, anchor: .bottom)
      .offset(y: shown ? 0 : 12)
      .onAppear {
        guard !shown else { return }
        store.settled(id)
        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.24)) { shown = true }
      }
  }
}

#if os(iOS)
/**
 * The sideways drag that shows each message's time (the window's `ZSn`):
 * up to 82 pt; let go and it springs back. UIKit's pan, starting only for a
 * drag to the left and running alongside the scroll, so an up-and-down drag
 * is always the scroll's (a SwiftUI drag on the scroll view held it).
 */
struct PeekPan: UIGestureRecognizerRepresentable {
  let peek: TimePeek

  func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
    let pan = UIPanGestureRecognizer()
    pan.delegate = PeekPanRule.shared
    return pan
  }

  func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
    switch pan.state {
    case .began, .changed:
      peek.x = min(82, max(0, -pan.translation(in: pan.view).x))
    default:
      withAnimation(.spring(response: 0.43, dampingFraction: 0.78)) { peek.x = 0 }
    }
  }
}

/** When the time pull may start: a drag mostly to the left; and it never stops the scroll. */
final class PeekPanRule: NSObject, UIGestureRecognizerDelegate {
  static let shared = PeekPanRule()

  func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
    guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
    let velocity = pan.velocity(in: pan.view)
    return velocity.x < 0 && abs(velocity.x) > abs(velocity.y) * 1.5
  }

  func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
}

/** A message held down: UIKit's long press, which fails as soon as the finger moves, so the scroll goes on. */
struct MessageHold: UIGestureRecognizerRepresentable {
  let action: () -> Void

  func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
    let press = UILongPressGestureRecognizer()
    press.minimumPressDuration = 0.35
    return press
  }

  func handleUIGestureRecognizerAction(_ press: UILongPressGestureRecognizer, context: Context) {
    if press.state == .began { action() }
  }
}
#endif

/**
 * A message's words and their right-click menu on the Mac (its reactions,
 * Reply, Start a thread, Copy). Copy copies the words; nothing while an
 * agent's empty message is still being written (the window's `GWn`).
 */
struct MessageMenuOnMac: ViewModifier {
  let bubble: Bubble
  let agentId: String

  func body(content: Content) -> some View {
    #if os(macOS)
    content.contextMenu { MessageContextMenu(bubble: bubble, agentId: agentId, copy: Self.copy(bubble)) }
    #else
    content
    #endif
  }

  /** What "Copy" does for a message's words. */
  static func copy(_ bubble: Bubble) -> () -> Void {
    {
      if bubble.isStreaming && bubble.text.isEmpty { return }
      UIPasteboard.general.string = bubble.text
    }
  }
}

#if os(macOS)
/** "More emoji" from a message's menu, over the message (the window swaps its menu for the picker). */
struct MessageEmojiPopover: ViewModifier {
  let bubble: Bubble
  let agentId: String
  @Environment(MessageMenu.self) private var messageMenu: MessageMenu?
  @Environment(AppStore.self) private var store

  func body(content: Content) -> some View {
    content.popover(isPresented: Binding(
      get: { messageMenu?.target?.id == bubble.id },
      set: { open in if !open, messageMenu?.target?.id == bubble.id { messageMenu?.target = nil } }
    ), arrowEdge: .top) {
      MacEmojiPicker(mine: bubble.myReactions) { emoji in Task { await store.react(emoji, to: bubble.id, in: agentId) } }
    }
  }
}
#endif

/** Your bubble pulled left by the sideways drag. */
struct PeekShift: ViewModifier {
  let moves: Bool
  @Environment(TimePeek.self) private var peek: TimePeek?

  func body(content: Content) -> some View {
    content.offset(x: moves ? -(peek?.x ?? 0) : 0)
  }
}

/** A message's own time, revealed by the sideways drag (`sand-row-timestamp`). */
struct PeekTime: View {
  let ms: Double
  @Environment(TimePeek.self) private var timePeek: TimePeek?

  var body: some View {
    if let peek = timePeek, peek.x > 0 {
      Text(Date(timeIntervalSince1970: ms / 1000).formatted(date: .omitted, time: .shortened))
        .font(.system(size: 12, weight: .medium)).monospacedDigit()
        .foregroundStyle(Ink.secondary)
        .lineLimit(1)
        .padding(.leading, 10)
        .opacity(peek.x / 82)
        .offset(x: (1 - peek.x / 82) * 60)
        .allowsHitTesting(false)
    }
  }
}

/** The message a quote jumped to, lit a moment in the Mac's yellow. */
struct Glow: ViewModifier {
  let id: String
  @Environment(JumpGlow.self) private var glow: JumpGlow?

  func body(content: Content) -> some View {
    content.overlay {
      if glow?.id == id {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .fill(Ink.jumpGlow)
          .allowsHitTesting(false)
          .transition(.opacity)
      }
    }
  }
}

/**
 * "2 new messages" (`sand-new-messages-pill`): the arrow, the count, and a
 * cross to put it away. Up for a "New" line out of sight above, down for
 * what arrived below while you read further up.
 */
struct NewMessagesPill: View {
  let count: Int
  let up: Bool
  let jump: () -> Void
  let dismiss: () -> Void

  var body: some View {
    HStack(spacing: 0) {
      Button(action: jump) {
        HStack(spacing: 6) {
          Image(systemName: up ? "arrow.up" : "arrow.down").font(.system(size: 12, weight: .semibold))
          Text(count == 1 ? "1 new message" : "\(count) new messages").font(.system(size: 14))
        }
        .foregroundStyle(Ink.primary)
        .padding(.leading, 14).padding(.trailing, 8)
        .frame(height: 34)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      Button(action: dismiss) {
        Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ink.secondary)
          .frame(width: 30, height: 34)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Dismiss new messages")
    }
    .padding(.trailing, 4)
    .glassEffect(.regular, in: .capsule)
  }
}

/** Under a message that did not reach the agent: "Failed to send", Resend, Delete (`sand-failed-send-actions`). */
struct FailedSendRow: View {
  let nonce: String
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 4) {
      Spacer(minLength: 0)
      Image(systemName: "exclamationmark.circle.fill").font(.system(size: 12)).foregroundStyle(Ink.danger)
      Text("Failed to send").foregroundStyle(Ink.danger)
      Button { Task { await store.resend(nonce, in: agentId) } } label: { action("Resend") }
      Button { store.discardFailed(nonce, in: agentId) } label: { action("Delete") }
    }
    .buttonStyle(.plain)
    .font(.system(size: 12, weight: .medium))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Failed message actions")
  }

  private func action(_ title: String) -> some View {
    Text(title).foregroundStyle(Ink.primary)
      .padding(.horizontal, 6).frame(minHeight: 32).contentShape(.rect)
  }
}

/**
 * What a reply answers, in one line (the window's `BAe`): the words (markdown
 * left out, cut at `limit`, "(empty)" when there are none), a picture's
 * thumbnail and "Photo", a file's icon and name, a link's icon and host, or
 * "(deleted)".
 */
struct ReplyPreviewLine: View {
  let entry: Entry?
  let limit: Int
  var thumbnail: CGFloat = 16

  var body: some View {
    let line = Chat.quoteLine(entry, limit: limit)
    HStack(spacing: 6) {
      switch Chat.ReplyPreview(entry) {
      case .image(let url):
        if let picture = ChatImages.image(for: [url]) {
          Image(uiImage: picture).resizable().scaledToFill()
            .frame(width: thumbnail, height: thumbnail)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        } else {
          Image(systemName: "photo")
        }
      case .file: Image(systemName: "doc")
      case .link: Image(systemName: "link")
      case .text, .missing: EmptyView()
      }
      Text(line).lineLimit(1)
    }
  }
}

/** A composer list over the field (":", "/", "#", "@"): on glass, scrolling past its height (the window's: 260 for ":", 300 for "#", 320 for "@"). */
struct SuggestionList<Content: View>: View {
  let rows: Int
  var rowHeight: CGFloat = 40
  var maxHeight: CGFloat = 320
  @ViewBuilder let content: Content

  var body: some View {
    ScrollView {
      VStack(spacing: 0) { content }
        .padding(.vertical, 4)
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: min(CGFloat(rows) * rowHeight + 8, maxHeight))
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
  }
}

/** The message held down, whose sheet is up. */
@MainActor
@Observable
final class MessageMenu {
  var target: MessageTarget?
}

struct MessageTarget: Identifiable {
  let bubble: Bubble
  var id: String { bubble.id }
}

#if os(iOS)
/**
 * A held message's sheet (the founder's reference, 9 October 2026): the
 * reactions in two rows of six, the last one opening the emoji keyboard
 * for any other; then Reply and Mark as Unread; then Copy and Select Text.
 */
struct MessageActionsSheet: View {
  let bubble: Bubble
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?
  @Environment(ChatActions.self) private var actions: ChatActions?
  @Environment(\.chatThread) private var thread
  @Environment(\.dismiss) private var dismiss
  @State private var choosingEmoji = false
  @State private var selecting = false

  /** The Mac's six (`dGe`), then five more people reach for. */
  static let reactions = ["👍", "👎", "❤️", "😂", "🎉", "😮", "🔥", "👀", "🙏", "😢", "💯"]

  private struct Action: Identifiable {
    let title: String
    let symbol: String
    let run: () -> Void
    var id: String { title }
  }

  var body: some View {
    ScrollView {
      VStack(spacing: 14) {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 12) {
          ForEach(Self.reactions, id: \.self) { emoji in
            Button { react(emoji) } label: {
              Text(emoji).font(.system(size: 27))
                .frame(width: 52, height: 52)
                .background(Ink.pill, in: Circle())
                .contentShape(.circle)
            }
            .buttonStyle(.plain)
          }
          Button { choosingEmoji = true } label: {
            Image(systemName: "face.smiling").font(.system(size: 22)).foregroundStyle(Ink.secondary)
              .overlay(alignment: .bottomTrailing) {
                Image(systemName: "plus.circle.fill").font(.system(size: 11)).foregroundStyle(Ink.secondary).offset(x: 4, y: 3)
              }
              .frame(width: 52, height: 52)
              .background(Ink.pill, in: Circle())
              .contentShape(.circle)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Another reaction")
        }
        // Inside a thread every message answers it: no Reply, no new thread.
        group((thread == nil ? [Action(title: "Reply", symbol: "arrowshape.turn.up.left") { reply?.target = bubble; dismiss() }] : []) + startThread + [
          Action(title: "Mark as Unread", symbol: "message.badge") { Task { await store.setUnread(agentId, true) }; dismiss() },
        ])
        group([
          Action(title: "Copy", symbol: "doc.on.doc") { UIPasteboard.general.string = bubble.text; dismiss() },
          Action(title: "Select Text", symbol: "character.cursor.ibeam") { selecting = true },
        ])
      }
      .padding(.horizontal, 18).padding(.top, 26).padding(.bottom, 12)
    }
    .scrollBounceBehavior(.basedOnSize)
    .presentationDetents([.height(420), .large])
    .presentationDragIndicator(.visible)
    .background { EmojiKeyboard(isActive: $choosingEmoji) { emoji in react(emoji) }.frame(width: 0, height: 0) }
    .sheet(isPresented: $selecting) { SelectTextSheet(text: bubble.text) }
  }

  /** "Start a Thread" in the chat (not in a thread, which has no actions to open one). */
  private var startThread: [Action] {
    guard thread == nil, let open = actions?.openThread else { return [] }
    return [Action(title: "Start a Thread", symbol: "bubble.left.and.bubble.right") { dismiss(); open(bubble.id) }]
  }

  private func group(_ actions: [Action]) -> some View {
    VStack(spacing: 0) {
      ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
        if index > 0 { Rectangle().fill(Ink.hairline).frame(height: 0.5).padding(.leading, 58) }
        Button(action: action.run) {
          HStack(spacing: 14) {
            Image(systemName: action.symbol).font(.system(size: 19)).frame(width: 26)
            Text(action.title).font(.system(size: 17))
            Spacer(minLength: 0)
          }
          .foregroundStyle(Ink.primary)
          .padding(.horizontal, 18)
          .frame(height: 54)
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
      }
    }
    .background(Ink.pill, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  private func react(_ emoji: String) {
    Task { await store.react(emoji, to: bubble.id, in: agentId) }
    dismiss()
  }
}

/** A thread opened over the iPhone's chat: its name, its messages, a composer that answers in it. */
struct ThreadSheet: View {
  let agentId: String
  let rootId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var actions = ChatActions()
  @State private var messageMenu = MessageMenu()
  @State private var reply = ReplyDraft()

  var body: some View {
    NavigationStack {
      ChatMessages(agentId: agentId, thread: rootId)
        .environment(actions)
        .environment(messageMenu)
        .safeAreaBar(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId, thread: rootId) }
        .environment(reply)
        .background(Ink.ground)
        .navigationTitle(threadTitle)
        .inlineBarTitle()
        .toolbar { ToolbarItem(placement: .trailingBar) { Button("Done") { dismiss() } } }
        .sheet(item: Binding(get: { messageMenu.target }, set: { messageMenu.target = $0 })) { target in
          MessageActionsSheet(bubble: target.bubble, agentId: agentId).environment(reply).environment(\.chatThread, rootId)
        }
    }
  }

  /** The thread's name, following its lines as they arrive. */
  private var threadTitle: String {
    _ = store.threadRows[agentId]?.count
    return store.threadTitle(rootId, in: agentId)
  }
}

/**
 * The emoji keyboard, for a reaction that is not in the sheet's rows: a
 * field no one sees, asking for the emoji keyboard; the first emoji typed
 * is the reaction.
 */
struct EmojiKeyboard: UIViewRepresentable {
  @Binding var isActive: Bool
  let picked: (String) -> Void

  func makeUIView(context: Context) -> EmojiField {
    let field = EmojiField()
    field.delegate = context.coordinator
    field.tintColor = .clear
    field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
    return field
  }

  func updateUIView(_ field: EmojiField, context: Context) {
    context.coordinator.parent = self
    if isActive && !field.isFirstResponder { DispatchQueue.main.async { field.becomeFirstResponder() } }
    if !isActive && field.isFirstResponder { DispatchQueue.main.async { field.resignFirstResponder() } }
  }

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  final class Coordinator: NSObject, UITextFieldDelegate {
    var parent: EmojiKeyboard
    init(_ parent: EmojiKeyboard) { self.parent = parent }

    @objc func changed(_ field: UITextField) {
      guard let typed = field.text?.last else { return }
      field.text = ""
      let scalars = typed.unicodeScalars
      // An emoji, not a digit or a letter typed on another keyboard (digits count as emoji in Unicode).
      if let first = scalars.first, first.properties.isEmoji, scalars.count > 1 || first.value > 0x238C {
        parent.picked(String(typed))
      }
      parent.isActive = false
    }

    func textFieldDidEndEditing(_ field: UITextField) {
      if parent.isActive { parent.isActive = false }
    }
  }

  /** A field that opens on the emoji keyboard. */
  final class EmojiField: UITextField {
    override var textInputContextIdentifier: String? { "simeon.reaction" }
    override var textInputMode: UITextInputMode? {
      UITextInputMode.activeInputModes.first { $0.primaryLanguage == "emoji" } ?? super.textInputMode
    }
  }
}

/** Select Text: the message on its own, selectable with the handles, as Messages has it. */
struct SelectTextSheet: View {
  let text: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      SelectableText(text: text)
        .navigationTitle("Select Text")
        .inlineBarTitle()
        .toolbar {
          ToolbarItem(placement: .trailingBar) { Button("Done") { dismiss() } }
        }
    }
  }
}

struct SelectableText: UIViewRepresentable {
  let text: String

  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.isEditable = false
    view.isSelectable = true
    view.font = .preferredFont(forTextStyle: .body)
    view.adjustsFontForContentSizeCategory = true
    view.backgroundColor = .clear
    view.textContainerInset = UIEdgeInsets(top: 16, left: 14, bottom: 16, right: 14)
    view.text = text
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    if view.text != text { view.text = text }
  }
}
#endif

/** The composer's access line (`Qvn`): its title over its words, and the button that opens simeonlabs.com. */
struct AccessNotice: View {
  let words: SandAccess.Words
  @Environment(\.openURL) private var openURL

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(words.title).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary)
        Text(words.body).font(.system(size: 12)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      if let action = words.action {
        Button(action) { openURL(SandAccess.page) }
          .buttonStyle(.borderedProminent)
          .buttonBorderShape(.capsule)
          .controlSize(.small)
      }
    }
    .padding(.horizontal, 14).padding(.vertical, 10)
    .background(Ink.pill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .contain)
  }
}
