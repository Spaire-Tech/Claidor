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

  // Each part below reads only what it draws, so typing a letter or the
  // call's waveform ticking redraws that part and not the conversation.
  var body: some View {
    ChatMessages(agentId: agentId)
      .environment(actions)
      .safeAreaInset(edge: .top, spacing: 0) {
        ChatHeader(agentId: agentId, back: { dismiss() }, showsPage: $showsPage, showsCall: $showsCall, showsTranscript: $showsTranscript)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId) }
      .environment(reply)
      .background(Ink.ground)
      .toolbar(.hidden, for: .navigationBar)
      .background(BackSwipe().frame(width: 0, height: 0))
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

/** What a row can open (the agent's page, its computer), given once so the rows never need drawing again for it. */
@MainActor
@Observable
final class ChatActions {
  @ObservationIgnored var openPage: () -> Void = {}
  @ObservationIgnored var openComputer: () -> Void = {}
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

/** Scrolls the conversation to a message: a reply's quote goes to what it answers. */
private struct JumpKey: EnvironmentKey { static let defaultValue: (String) -> Void = { _ in } }

extension EnvironmentValues {
  var jumpToMessage: (String) -> Void {
    get { self[JumpKey.self] }
    set { self[JumpKey.self] = newValue }
  }
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
  private static let firstWindow = 60
  private static let bottomId = "chat-bottom"

  var body: some View {
    let all = store.rows(for: agentId)
    let rows = all.count > window ? Array(all.suffix(window)) : all
    let hidden = all.count - rows.count
    let _ = Trace.mark("drawing \(agentId), \(rows.count) of \(all.count) rows (\(Dictionary(grouping: rows, by: \.kind).map { "\($0.value.count) \($0.key)" }.sorted().joined(separator: ", "))), the longest \(rows.map(\.size).max() ?? 0) bytes")
    ScrollViewReader { reader in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          if hidden > 0 || store.olderBefore[agentId] != nil {
            // Near the top: the rows above these, then the lines before them (`getAgentTranscriptTail` with `beforeSeq`).
            ProgressView()
              .frame(maxWidth: .infinity)
              .padding(.vertical, 14)
              .onAppear {
                if hidden > 0 { window += ChatMessages.firstWindow } else { Task { await store.loadOlder(agentId) } }
              }
          }
          ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
            Group {
              if case .unread = row {
                ChatRowView(row: row, agentId: agentId).equatable()
                  .onScrollVisibilityChange(threshold: 0.2) { visible in if visible { dividerSeen = true } }
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
        .environment(\.jumpToMessage) { id in
          reveal(id) { withAnimation(.snappy) { reader.scrollTo(id, anchor: .center) } }
          glow.id = id
          Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            if glow.id == id { withAnimation(.easeOut(duration: 0.5)) { glow.id = nil } }
          }
        }
      }
      .modifier(PeekDrag(peek: peek))
      .onScrollGeometryChange(for: Bool.self) { geometry in
        geometry.contentSize.height - geometry.visibleRect.maxY < 120
      } action: { _, bottom in
        atBottom = bottom
        if bottom { unseen = 0 }
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
    .onGeometryChange(for: CGFloat.self) { $0.size.width - 32 } action: { width = max(200, $0) }
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

/** The agent at work, at the end of the conversation. */
struct TypingSlot: View {
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    if let agent = store.agent(agentId), agent.isBusy {
      TypingRow(agent: agent, step: agent.isGroup ? (agent.activityLabel ?? store.steps[agentId]) : nil)
        .padding(.top, 16)
        .transition(.opacity)
    }
  }
}

/**
 * The top of the chat (`.sand-chat-header` on a phone): the back disc 46 pt
 * at 12, 12; the butterfly 52 pt centred 4 pt down; the name pill under it
 * (13 pt, 500); the call button 24 pt beside the name; the page's ground at
 * 78 % with a blur behind, fading out over its last 30 pt.
 */
struct ChatHeader: View {
  let agentId: String
  let back: () -> Void
  @Binding var showsPage: Bool
  @Binding var showsCall: Bool
  @Binding var showsTranscript: Bool
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 0) {
      ZStack(alignment: .top) {
        if let agent = store.agent(agentId) {
          VStack(spacing: 4) {
            Button { showsPage = true } label: {
              AgentAvatar(agent: agent, members: store.members(of: agent), groupInARow: true, moves: true)
                .frame(width: agent.isGroup ? nil : 52, height: 52)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(agent.name), details")
            Button { showsPage = true } label: {
              Text(agent.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
                .padding(.horizontal, 12).padding(.vertical, 4)
                .contentShape(.capsule)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: .capsule)
            .overlay(alignment: .trailing) {
              if store.canCall && !agent.isGroup {
                Button { store.startCall(agent) } label: {
                  Image(systemName: "phone.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.callGlyph)
                    .frame(width: 26, height: 26)
                    .contentShape(.circle)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: .circle)
                .accessibilityLabel("Call \(agent.name)")
                .disabled(store.call != nil)
                .offset(x: 26 + 8)
              }
            }
          }
          .padding(.top, 4)
          .padding(.horizontal, 70)
        }
        HStack {
          Button(action: back) {
            Image(systemName: "chevron.left").font(.system(size: 19, weight: .semibold)).foregroundStyle(Ink.primary)
              .frame(width: 46, height: 46)
              .contentShape(.circle)
          }
          .buttonStyle(.plain)
          .glassEffect(.regular.interactive(), in: .circle)
          .accessibilityLabel("Back")
          Spacer()
        }
        .padding(.leading, 12).padding(.top, 12)
      }
      if let call = store.call, call.agentId == agentId {
        CallPill(call: call, showsTranscript: $showsTranscript) { showsCall = true }
          .padding(.horizontal, 12)
          .padding(.top, 12)
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .frame(maxWidth: .infinity)
    // The header takes the taps on itself; its faded strip below lets them through to the messages.
    .contentShape(.rect)
    .padding(.bottom, 26)
    .background { HeaderGround().allowsHitTesting(false) }
    .animation(.snappy, value: store.call?.agentId)
    .onChange(of: store.call == nil) { _, gone in if gone { showsCall = false } }
  }
}

/** The header's ground: the page's colour at 78 % over a blur of what scrolls under it, fading out over the last 30 pt. */
struct HeaderGround: View {
  var body: some View {
    Rectangle()
      .fill(.ultraThinMaterial)
      .overlay(Ink.ground.opacity(0.78))
      .mask {
        VStack(spacing: 0) {
          Color.black
          LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: 30)
        }
      }
      .ignoresSafeArea(edges: .top)
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
      VStack(alignment: .leading, spacing: 6) {
      if let target = reply?.target {
        // The quote being answered (`Kvn`): the arrow, the line cut at 72, and Cancel reply.
        HStack(spacing: 6) {
          Image(systemName: "arrowshape.turn.up.right").font(.system(size: 12)).foregroundStyle(Ink.tertiary)
          Text(Self.replyLine(target)).font(.system(size: 14)).foregroundStyle(Ink.secondary).lineLimit(1)
          Spacer(minLength: 0)
          Button { reply?.target = nil } label: {
            Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ink.secondary)
              .frame(width: 28, height: 28).contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Cancel reply")
        }
        .padding(.leading, 8).padding(.trailing, 0).padding(.vertical, 0)
        .background(Ink.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .transition(.move(edge: .bottom).combined(with: .opacity))
      }
      HStack(alignment: .bottom, spacing: 8) {
        Button { picking = true } label: {
          Image(systemName: "plus").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary.opacity(0.78))
            .frame(width: 30, height: 30)
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel("Attach")
        TextField(reply?.target != nil ? "Reply…" : "Message \(name)", text: $draft, axis: .vertical)
          .font(.system(size: MessageType.size))
          .lineLimit(1...8)
          .focused($typing)
          .padding(.vertical, 5)
          .frame(maxWidth: .infinity, alignment: .leading)
        ZStack {
          switch mode {
          case .stop:
            Button { dictation.stop() } label: {
              Image(systemName: "stop.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                .frame(width: 28, height: 28).background(Ink.danger, in: Circle())
                .frame(width: 36, height: 36).contentShape(.circle)
            }
            .accessibilityLabel("Stop dictation")
            .transition(.scale(scale: 0.6).combined(with: .opacity))
          case .mic:
            Button { dictation.start { text in draft = text } } label: {
              Image(systemName: "mic.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 28, height: 28).background(Ink.bubbleMine, in: Circle())
                .frame(width: 36, height: 36).contentShape(.circle)
            }
            .accessibilityLabel("Dictate")
            .transition(.scale(scale: 0.6).combined(with: .opacity))
          case .send:
            Button(action: send) {
              Image(systemName: "arrow.up").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                .frame(width: 28, height: 28).background(Ink.bubbleMine, in: Circle())
                .frame(width: 36, height: 36).contentShape(.circle)
            }
            .accessibilityLabel("Send")
            .transition(.scale(scale: 0.6).combined(with: .opacity))
          }
        }
        .buttonStyle(.plain)
        .frame(width: 36, height: 36)
        .padding(.vertical, -4)
        // The send and mic glyphs cross over in 200 ms, as the Mac's (`sand-prompt-shell` send button).
        .animation(.easeOut(duration: 0.2), value: mode)
      }
      }
      .padding(.leading, 8).padding(.trailing, 8).padding(.vertical, 7)
      // Growing a line, or a quote above, eases in as the Mac's composer does (`0.3 s` spring).
      .animation(.spring(response: 0.3, dampingFraction: 0.9), value: lineCount)
      .animation(.spring(response: 0.3, dampingFraction: 0.9), value: reply?.target?.id)
      // The shadow on the shape alone: on the whole composer it was worked out again from the text on every keystroke.
      .background {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .fill(scheme == .dark ? Ink.control : Ink.ground)
          .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.05), radius: 4, y: 2)
          // A tap anywhere on the bubble that is not a button goes to the text, as in Messages. The text alone is
          // one 14 pt line (about 17 pt) of a 44 pt bubble: taps above or below it, or on its padding, did nothing.
          .onTapGesture { typing = true }
      }
      .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Ink.edge, lineWidth: 1).allowsHitTesting(false))
    }
    .padding(.horizontal, 16)
    .padding(.top, 6)
    .padding(.bottom, 8)
    .background(Ink.ground.opacity(0.001))
    .animation(.snappy(duration: 0.2), value: mentionQuery != nil)
    .onAppear { name = store.agent(agentId)?.name ?? "" }
    .composerPicker(isPresented: $picking) { picked in attachments.append(contentsOf: picked) }
    .onChange(of: dictation.problem) { _, problem in if let problem { store.problem = problem } }
    .onChange(of: reply?.target?.id) { _, id in if id != nil { typing = true } }
    // The unsent draft stays with its chat, as on the Mac.
    .onAppear { if draft.isEmpty, let kept = store.drafts[agentId] { draft = kept } }
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
  @Environment(\.jumpToMessage) private var jump
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?
  @State private var reacting: Set<String> = []
  /** Show more on a long message (the Mac folds one past 664 pt). */
  @State private var expanded = false

  /** What is drawn of the message: 3,000 characters folded, 40,000 open. A message of megabytes (a file or an image pasted as text) laid out whole held the screen still for minutes. */
  private var shown: (text: String, clipped: Bool) { Chat.clipped(bubble.text, limit: expanded ? 40_000 : 3_000) }

  /** The window's reaction row (`dGe`). */
  private static let quickReactions = ["👍", "👎", "❤️", "😂", "🎉", "😮"]

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
          Button { jump(target) } label: {
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
          .contextMenu { menu }
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
  private var menu: some View {
    ControlGroup {
      ForEach(Self.quickReactions, id: \.self) { emoji in
        Button(emoji) { react(emoji) }
      }
    }
    .controlGroupStyle(.compactMenu)
    if let reply {
      Button { reply.target = bubble } label: { Label("Reply", systemImage: bubble.fromPerson ? "arrowshape.turn.up.right" : "arrowshape.turn.up.left") }
    }
    Button { UIPasteboard.general.string = bubble.text } label: { Label("Copy", systemImage: "doc.on.doc") }
  }

  @ViewBuilder
  private var reactions: some View {
    if !bubble.reactions.isEmpty {
      HStack(spacing: 4) {
        ForEach(Array(Self.counted(bubble.reactions).enumerated()), id: \.offset) { _, item in
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
        }
      }
      .padding(.horizontal, 10)
      .offset(y: 16)
    }
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
 * in a one-to-one chat its butterfly alone, 28 pt, moving as it works:
 * folded into three dots while it thinks, five dots circling while it
 * waits on someone, a dot flying off while it messages another agent. In
 * a group (`sand-activity-line`), one member's butterfly at 22 pt, working,
 * beside what the group is doing ("Searching the web").
 */
struct TypingRow: View {
  let agent: Agent
  let step: String?
  @Environment(AppStore.self) private var store

  var body: some View {
    if agent.isGroup {
      let members = store.members(of: agent)
      HStack(spacing: 8) {
        if let member = members.first(where: \.isBusy) ?? members.first {
          ButterflyView(palette: member.palette, motion: .working).frame(width: 22, height: 22)
        }
        Text(step ?? "Working…").font(.system(size: 14)).foregroundStyle(Ink.secondary).lineLimit(1)
      }
      .padding(.leading, 8)
      .frame(height: 36)
      .accessibilityElement(children: .combine)
    } else {
      ButterflyView(palette: agent.palette, motion: agent.markState == .idle ? .working : agent.markState)
        .frame(width: 28, height: 28)
        .padding(.leading, 8)
        .frame(height: 36)
        .accessibilityLabel(agent.markState == .thinking ? "\(agent.name) is typing" : "\(agent.name) is working")
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
 * up to 82 pt; let go, or lose the drag to the scroll, and it springs back.
 * Its state lives here, so a drag frame redraws this and not the chat.
 */
struct PeekDrag: ViewModifier {
  let peek: TimePeek
  @GestureState private var pulling: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .simultaneousGesture(
        DragGesture(minimumDistance: 12)
          .updating($pulling) { drag, state, _ in
            guard abs(drag.translation.width) > abs(drag.translation.height) else { return }
            state = min(82, max(0, -drag.translation.width))
          }
      )
      .onChange(of: pulling) { _, x in
        if x == 0 { withAnimation(.spring(response: 0.43, dampingFraction: 0.78)) { peek.x = 0 } } else { peek.x = x }
      }
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
