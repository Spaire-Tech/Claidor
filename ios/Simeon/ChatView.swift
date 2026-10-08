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

  // Each part below reads only what it draws, so typing a letter or the
  // call's waveform ticking redraws that part and not the conversation.
  var body: some View {
    ChatMessages(agentId: agentId, openPage: { showsPage = true }, openComputer: { showsComputer = true })
      .safeAreaInset(edge: .top, spacing: 0) {
        ChatHeader(agentId: agentId, back: { dismiss() }, showsPage: $showsPage, showsCall: $showsCall, showsTranscript: $showsTranscript)
      }
      .safeAreaInset(edge: .bottom, spacing: 0) { ChatComposer(agentId: agentId) }
      .environment(reply)
      .background(Ink.ground)
      .toolbar(.hidden, for: .navigationBar)
      .sheet(isPresented: $showsPage) { AgentPageSheet(agentId: agentId) }
      .sheet(isPresented: $showsComputer) { ComputerSheet(agentId: agentId) }
      .fullScreenCover(isPresented: $showsCall) { CallScreen(showsTranscript: $showsTranscript) }
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

/** The message the person is answering (the Mac's Reply), shared by the bubbles' menu and the composer. */
@MainActor
@Observable
final class ReplyDraft {
  var target: Bubble?
}

/** How far a sideways drag has pulled the conversation (0 to 82 pt), to show each message's time. */
private struct TimePeekKey: EnvironmentKey { static let defaultValue: CGFloat = 0 }
/** Scrolls the conversation to a message: a reply's quote goes to what it answers. */
private struct JumpKey: EnvironmentKey { static let defaultValue: (String) -> Void = { _ in } }

extension EnvironmentValues {
  var timePeek: CGFloat {
    get { self[TimePeekKey.self] }
    set { self[TimePeekKey.self] = newValue }
  }
  var jumpToMessage: (String) -> Void {
    get { self[JumpKey.self] }
    set { self[JumpKey.self] = newValue }
  }
}

/** The conversation itself: redrawn when its rows change, and only then. */
struct ChatMessages: View {
  let agentId: String
  let openPage: () -> Void
  let openComputer: () -> Void
  @Environment(AppStore.self) private var store
  @State private var width: CGFloat = 361
  @State private var peek: CGFloat = 0

  var body: some View {
    let rows = store.rows(for: agentId)
    ScrollViewReader { reader in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
            ChatRowView(row: row, agentId: agentId, openPage: openPage, openComputer: openComputer)
              .padding(.top, Self.gap(index > 0 ? rows[index - 1] : nil, row))
          }
          TypingSlot(agentId: agentId)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .environment(\.chatWidth, width)
        .environment(\.timePeek, peek)
        .environment(\.jumpToMessage) { id in withAnimation(.snappy) { reader.scrollTo(id, anchor: .center) } }
      }
      // A sideways drag pulls your bubbles left, up to 82 pt, and shows each message's time (the window's `ZSn`); let go and it springs back.
      .simultaneousGesture(
        DragGesture(minimumDistance: 12)
          .onChanged { drag in
            guard abs(drag.translation.width) > abs(drag.translation.height) else { return }
            peek = min(82, max(0, -drag.translation.width))
          }
          .onEnded { _ in withAnimation(.spring(response: 0.43, dampingFraction: 0.78)) { peek = 0 } }
      )
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width - 32 } action: { width = max(200, $0) }
    .defaultScrollAnchor(.bottom)
    .defaultScrollAnchor(.bottom, for: .sizeChanges)
    .scrollDismissesKeyboard(.interactively)
    .background(Ink.ground)
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
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(agent.name), details")
            Button { showsPage = true } label: {
              Text(agent.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
                .padding(.horizontal, 12).padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: .capsule)
            .overlay(alignment: .trailing) {
              if store.canCall && !agent.isGroup {
                Button { store.startCall(agent) } label: {
                  Image(systemName: "phone.fill").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.callGlyph)
                    .frame(width: 26, height: 26)
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
    .padding(.bottom, 26)
    .frame(maxWidth: .infinity)
    .background { HeaderGround() }
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

  var body: some View {
    VStack(spacing: 6) {
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
            Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ink.secondary).frame(width: 20, height: 20)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Cancel reply")
        }
        .padding(.leading, 8).padding(.trailing, 4).padding(.vertical, 4)
        .background(Ink.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      }
      HStack(alignment: .bottom, spacing: 8) {
        Button { picking = true } label: {
          Image(systemName: "plus").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary.opacity(0.78))
            .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .circle)
        .accessibilityLabel("Attach")
        TextField("Message \(store.agent(agentId)?.name ?? "")", text: $draft, axis: .vertical)
          .font(.system(size: MessageType.size))
          .lineLimit(1...8)
          .focused($typing)
          .padding(.vertical, 5)
        if dictation.isListening {
          Button { dictation.stop() } label: {
            Image(systemName: "stop.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
              .frame(width: 28, height: 28).background(Ink.danger, in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Stop dictation")
        } else if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty {
          Button { dictation.start { text in draft = text } } label: {
            Image(systemName: "mic.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
              .frame(width: 28, height: 28).background(Ink.bubbleMine, in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Dictate")
        } else {
          Button(action: send) {
            Image(systemName: "arrow.up").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
              .frame(width: 28, height: 28).background(Ink.bubbleMine, in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Send")
        }
      }
      }
      .padding(.leading, 8).padding(.trailing, 8).padding(.vertical, 7)
      .background(scheme == .dark ? Ink.control : Ink.ground, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Ink.edge, lineWidth: 1))
      .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.05), radius: 4, y: 2)
    }
    .padding(.horizontal, 16)
    .padding(.top, 6)
    .padding(.bottom, 8)
    .background(Ink.ground.opacity(0.001))
    .composerPicker(isPresented: $picking) { picked in attachments.append(contentsOf: picked) }
    .onChange(of: dictation.problem) { _, problem in if let problem { store.problem = problem } }
    .onChange(of: reply?.target?.id) { _, id in if id != nil { typing = true } }
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
struct ChatRowView: View {
  let row: ChatRow
  let agentId: String
  let openPage: () -> Void
  let openComputer: () -> Void
  @Environment(AppStore.self) private var store

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
      BubbleView(bubble: bubble, agentId: agentId, inGroup: store.agent(agentId)?.isGroup ?? false)
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
  @Environment(\.timePeek) private var peek
  @Environment(\.jumpToMessage) private var jump
  @Environment(ReplyDraft.self) private var reply: ReplyDraft?

  /** The window's reaction row (`dGe`). */
  private static let quickReactions = ["👍", "👎", "❤️", "😂", "🎉", "😮"]

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      if bubble.fromPerson { Spacer(minLength: 0) }
      if inGroup && !bubble.fromPerson {
        Group {
          if bubble.showsAvatar, let author = bubble.author { ButterflyView(palette: store.agent(author.id)?.palette ?? .named(AgentPalette.defaultColour(forAgentId: author.id))) } else { Color.clear }
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
          .contextMenu { menu }
          .overlay(alignment: bubble.fromPerson ? .bottomTrailing : .bottomLeading) { reactions }
          .padding(.bottom, bubble.reactions.isEmpty ? 0 : 16)
      }
      .offset(x: bubble.fromPerson ? -peek : 0)
      if !bubble.fromPerson { Spacer(minLength: 0) }
    }
    .overlay(alignment: .trailing) {
      // Its own time, revealed by the sideways drag (`sand-row-timestamp`).
      if peek > 0, let ms = bubble.timestampMs {
        Text(Date(timeIntervalSince1970: ms / 1000).formatted(date: .omitted, time: .shortened))
          .font(.system(size: 12, weight: .medium)).monospacedDigit()
          .foregroundStyle(Ink.secondary)
          .lineLimit(1)
          .padding(.leading, 10)
          .opacity(peek / 82)
          .offset(x: (1 - peek / 82) * 60)
          .allowsHitTesting(false)
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    let maxWidth = ChatMetrics.bubbleMax(width - (inGroup && !bubble.fromPerson ? 30 : 0))
    if bubble.isLoneEmoji {
      Text(bubble.text.trimmingCharacters(in: .whitespacesAndNewlines)).font(.system(size: 32))
    } else if bubble.fromPerson {
      Text(bubble.text)
        .font(.system(size: MessageType.size))
        .lineSpacing(MessageType.spacing(lineHeight: MessageType.mineLineHeight))
        .foregroundStyle(Ink.mineText)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 15).padding(.vertical, 10)
        .background(Ink.bubbleMine, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .frame(maxWidth: maxWidth, alignment: .trailing)
        .textSelection(.enabled)
    } else {
      MarkdownView(blocks: Markdown.blocks(bubble.text), mentioning: Mentioning(agents: store.agents, personName: store.account?.name, dark: scheme == .dark))
        .foregroundStyle(Ink.theirsText)
        .tint(Ink.link)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .modifier(CardEdge(radius: 18))
        .frame(maxWidth: maxWidth, alignment: .leading)
    }
  }

  @ViewBuilder
  private var menu: some View {
    ControlGroup {
      ForEach(Self.quickReactions, id: \.self) { emoji in
        Button(emoji) { Task { await store.react(emoji, to: bubble.id, in: agentId) } }
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
          .onTapGesture { Task { await store.react(item.emoji, to: bubble.id, in: agentId) } }
        }
      }
      .padding(.horizontal, 10)
      .offset(y: 16)
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
