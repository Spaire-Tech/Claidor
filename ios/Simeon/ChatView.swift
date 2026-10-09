import SwiftUI
import UIKit
import SimeonCore

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
  @State private var reply = ReplyDraft()
  @State private var actions = ChatActions()
  @State private var messageMenu = MessageMenu()

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
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if store.canCall && !store.groupIds.contains(agentId) {
          ToolbarItem(placement: .topBarTrailing) { ChatCallButton(agentId: agentId) }
        }
      }
      // A long press on a message: the reactions and what can be done with it, in a sheet from the bottom.
      .sheet(item: Binding(get: { messageMenu.target }, set: { messageMenu.target = $0 })) { target in
        MessageActionsSheet(bubble: target.bubble, agentId: agentId).environment(reply)
      }
      .sheet(isPresented: $showsPage) { AgentPageSheet(agentId: agentId).problemAlert() }
      .sheet(isPresented: $showsComputer) { ComputerSheet(agentId: agentId).problemAlert() }
      .fullScreenCover(isPresented: $showsCall) { CallScreen(showsTranscript: $showsTranscript) }
      .onAppear {
        actions.openPage = { showsPage = true }
        actions.openComputer = { showsComputer = true }
      }
      .onDisappear { store.close(agentId) }
      // Back from the background: what was said while the phone slept did not stream, so fetch it.
      .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await store.refresh(agentId) } } }
      .task {
        await store.open(agentId)
        guard let agent = store.agent(agentId) else { return }
        switch opening {
        case "call": store.startCall(agent)
        case "call-full": store.startCall(agent); showsTranscript = true; showsCall = true
        case "agent": showsPage = true
        default: break
        }
      }
  }
}

/** What a row can do (open the agent's page or its computer, go to the message a quote answers), given once so the rows never need drawing again for it. */
@MainActor
@Observable
final class ChatActions {
  @ObservationIgnored var openPage: () -> Void = {}
  @ObservationIgnored var openComputer: () -> Void = {}
  @ObservationIgnored var jump: (String) -> Void = { _ in }
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

  var body: some View {
    let all = store.rows(for: agentId)
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
          if hidden > 0 || store.olderBefore[agentId] != nil {
            // Near the top (below): the rows above these, then the lines before them (`getAgentTranscriptTail` with `beforeSeq`).
            ProgressView()
              .frame(maxWidth: .infinity)
              .padding(.vertical, 14)
              // Every row already drawn and still more lines before them: fetch those once (a chat too short to scroll).
              .onAppear { if hidden == 0, store.olderBefore[agentId] != nil { Task { await store.loadOlder(agentId) } } }
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
          TypingSlot(agentId: agentId)
          Color.clear.frame(height: 1).id(Self.bottomId)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .environment(\.chatWidth, width)
        .environment(peek)
        .environment(glow)
      }
      .gesture(PeekPan(peek: peek))
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
      // Scrolled near the top: more rows, then older lines. Only ever more, so it cannot go back and forth.
      .onScrollGeometryChange(for: Bool.self) { geometry in
        geometry.contentSize.height > geometry.containerSize.height && geometry.visibleRect.minY < 300
      } action: { _, nearTop in
        guard nearTop else { return }
        if store.rows(for: agentId).count > window { window += ChatMessages.firstWindow } else if store.olderBefore[agentId] != nil { Task { await store.loadOlder(agentId) } }
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
        let now = store.rows(for: agentId)
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
    }
    // The chat's width, measured and kept for the rows to cap themselves at. In whole points, and kept only when it moves by
    // one or more: a width that came back a fraction different on each measure would redraw every row, again and again.
    .onGeometryChange(for: CGFloat.self) { ($0.size.width - 32).rounded(.down) } action: { measured in
      let next = max(200, measured)
      if abs(next - width) >= 1 { width = next }
    }
    .defaultScrollAnchor(.bottom)
    .defaultScrollAnchor(.bottom, for: .sizeChanges)
    .scrollDismissesKeyboard(.interactively)
    .background(Ink.ground)
    // The pill for a "New" line above waits until the chat has settled at its end, so a line in view never flashes it.
    .task {
      try? await Task.sleep(nanoseconds: 700_000_000)
      settled = true
    }
  }

  /** A row above the drawn ones is drawn first, then scrolled to. */
  private func reveal(_ id: String, then scroll: @escaping () -> Void) {
    let all = store.rows(for: agentId)
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
    let working = agent.map { $0.isBusy || ($0.isRunning && !$0.awaitingUserResponse) } ?? false
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

  enum Mode { case send, mic, stop }

  private var mode: Mode {
    if dictation.isListening { return .stop }
    return draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty ? .mic : .send
  }

  /** Lines in the draft, for the composer's growth (at most the field's eight). */
  private var lineCount: Int { min(8, draft.reduce(1) { $1 == "\n" ? $0 + 1 : $0 } + draft.count / 38) }

  /** What follows an "@" being typed at the end, if one is. */
  private var mentionQuery: String? { Mentions.query(draft) }

  var body: some View {
    let _ = Trace.mark("drawing the composer of \(agentId), \(draft.count) characters")
    VStack(spacing: 6) {
      if let query = mentionQuery {
        MentionPicker(query: query, chatId: agentId) { name in
          draft = Mentions.inserting(name, into: draft)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }
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
      if let target = reply?.target {
        // The message being answered: the arrow, its line, and Cancel, on glass above the field.
        HStack(spacing: 8) {
          Image(systemName: "arrowshape.turn.up.left").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary)
          Text(Self.replyLine(target)).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
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
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel("Attach")
        HStack(alignment: .bottom, spacing: 4) {
          TextField(reply?.target != nil ? "Reply" : "Message", text: $draft, axis: .vertical)
            .font(.system(size: 17))
            .lineLimit(1...6)
            .focused($typing)
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
    .animation(.snappy(duration: 0.2), value: mentionQuery != nil)
    .onAppear {
      let named = store.agent(agentId)?.name ?? ""
      if name != named { name = named }
    }
    .composerPicker(isPresented: $picking) { picked in attachments.append(contentsOf: picked) }
    .onChange(of: dictation.problem) { _, problem in if let problem { store.problem = problem } }
    .onChange(of: reply?.target?.id) { _, id in if id != nil { typing = true } }
    // The unsent draft stays with its chat, as on the Mac.
    .onAppear { if draft.isEmpty, let kept = store.drafts[agentId], kept != draft { draft = kept } }
    // Saved when typing pauses, not per letter (the list redraws on a save).
    .task(id: draft) {
      try? await Task.sleep(nanoseconds: 600_000_000)
      if !Task.isCancelled { store.setDraft(draft, for: agentId) }
    }
    .onDisappear { store.setDraft(draft, for: agentId) }
  }

  static func replyLine(_ bubble: Bubble) -> String {
    let text = bubble.text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    return text.count > 72 ? String(text.prefix(72)) + "…" : text
  }

  private func send() {
    let text = draft
    let files = attachments
    let answering = reply?.target?.id
    draft = ""
    attachments = []
    reply?.target = nil
    dictation.stop()
    Task { await store.send(text, to: agentId, attachments: files.map { ($0.name, $0.data) }, replyTo: answering) }
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
    case .file(_, let name, let url, let fromPerson):
      FileCardView(name: name, url: url, agentId: agentId, fromPerson: fromPerson)
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
      RoutinesLine(action: action, routines: routines) { _ in openPage() }
    case .notice(_, let text):
      EventLine { Text(text) }
    case .failedSend(_, let nonce):
      FailedSendRow(nonce: nonce, agentId: agentId)
    }
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
        if let quote = bubble.quote, let target = bubble.replyTo {
          // What this answers (`pCn`): one line over the bubble; a tap goes to it.
          Button { actions?.jump(target) } label: {
            HStack(spacing: 4) {
              Image(systemName: "arrowshape.turn.up.right").font(.system(size: 10))
              Text(quote).lineLimit(1)
            }
            .font(.system(size: 13))
            .foregroundStyle(Ink.tertiary)
            .padding(.horizontal, 8).padding(.top, 4)
          }
          .buttonStyle(.plain)
          .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: bubble.fromPerson ? .trailing : .leading)
          .accessibilityLabel("Jump to replied message")
        }
        content
          .modifier(Glow(id: bubble.id))
          // Held: the reactions and the message's actions in a sheet from the bottom. UIKit's own long press, as Messages
          // has it: a finger that moves is a scroll, and the press gives way. SwiftUI's long press held the finger, and a
          // scroll that started on a message did not move.
          .gesture(MessageHold {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            messageMenu?.target = MessageTarget(bubble: bubble)
          })
          .overlay(alignment: bubble.fromPerson ? .bottomTrailing : .bottomLeading) { reactions }
          .padding(.bottom, bubble.reactions.isEmpty ? 0 : 16)
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
    if bubble.isLoneEmoji {
      Text(bubble.text.trimmingCharacters(in: .whitespacesAndNewlines)).font(.system(size: 32))
    } else if bubble.fromPerson {
      VStack(alignment: .trailing, spacing: 6) {
        Text(shown.text)
          .font(.system(size: MessageType.size))
          .lineSpacing(MessageType.spacing(lineHeight: MessageType.mineLineHeight))
          .foregroundStyle(Ink.mineText)
          .fixedSize(horizontal: false, vertical: true)
        if shown.clipped || expanded { more(light: true) }
      }
        .padding(.horizontal, 15).padding(.vertical, 10)
        .background(Ink.bubbleMine, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .frame(maxWidth: maxWidth, alignment: .trailing)
    } else {
      VStack(alignment: .leading, spacing: 6) {
        MarkdownView(blocks: Markdown.cachedBlocks(shown.text), mentioning: Mentioning(names: store.mentionNames, personName: store.account?.name, dark: scheme == .dark))
          .foregroundStyle(Ink.theirsText)
          .tint(Ink.link)
        if shown.clipped || expanded { more(light: false) }
      }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .modifier(CardEdge(radius: 18))
        .frame(maxWidth: maxWidth, alignment: .leading)
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
 * What the agent is doing, in words (`TJn`): its little picture and the
 * line under the moving light. A new activity comes in from 4 pt below
 * (0.18 s); one that changes again within 0.8 s waits its turn, so the
 * words do not flicker; after a minute at it, how long (" · 3m").
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
        ActivityIcon(icon: current.icon)
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

/** The activity's little picture: the window's glyph as the system's symbol, the app's logo, or the agent being messaged. */
struct ActivityIcon: View {
  let icon: ActivityLine.Icon
  @Environment(AppStore.self) private var store

  var body: some View {
    Group {
      switch icon {
      case .glyph(let name):
        Image(systemName: Self.symbol(name)).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary)
      case .connector(let service):
        if let logo = UIImage(named: "Connectors/\(CatalogApp.slug(service))") {
          Image(uiImage: logo).resizable().scaledToFit()
        } else {
          Image(systemName: "powerplug").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary)
        }
      case .agent(let id):
        if let agent = store.agent(id) { AgentAvatar(agent: agent) } else {
          Image(systemName: "bubble.left").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary)
        }
      }
    }
    .frame(width: 16, height: 16)
  }

  /** The window's glyphs, as SF Symbols. */
  static func symbol(_ glyph: String) -> String {
    switch glyph {
    case "thinking-medium": return "brain"
    case "magnifying-glass": return "magnifyingglass"
    case "globe": return "globe"
    case "book-open": return "book"
    case "pencil": return "pencil"
    case "laptop": return "laptopcomputer"
    case "terminal": return "apple.terminal"
    case "hourglass": return "hourglass"
    case "image": return "photo"
    case "cursor-logo": return "chevron.left.forwardslash.chevron.right"
    case "device-desktop": return "desktopcomputer"
    case "person-chat-bubble": return "bubble.left"
    case "plug": return "powerplug"
    default: return "wrench.adjustable"
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
    .glassEffect(.regular.interactive(), in: .capsule)
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

/** The names offered after an "@" (the Mac's composer list): agents whose name starts with what was typed, a tap writes it in. */
struct MentionPicker: View {
  let query: String
  let chatId: String
  let pick: (String) -> Void
  @Environment(AppStore.self) private var store

  private var names: [Mentions.AgentName] {
    let chat = store.agent(chatId)
    let pool = chat?.isGroup == true ? store.mentionNames.filter { chat?.memberIds.contains($0.id) == true } : store.mentionNames
    return Array(pool.filter { query.isEmpty || $0.name.lowercased().hasPrefix(query.lowercased()) }.prefix(5))
  }

  var body: some View {
    if !names.isEmpty {
      VStack(spacing: 0) {
        ForEach(names, id: \.id) { name in
          Button { pick(name.name) } label: {
            HStack(spacing: 10) {
              ButterflyView(palette: .named(name.colour)).frame(width: 24, height: 24)
              Text(name.name).font(.system(size: 15)).foregroundStyle(Ink.primary)
              Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.vertical, 4)
      .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
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
        group([
          Action(title: "Reply", symbol: "arrowshape.turn.up.left") { reply?.target = bubble; dismiss() },
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
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
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
