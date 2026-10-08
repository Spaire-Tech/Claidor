import SwiftUI
import UIKit
import SimeonCore

/**
 * One chat (step 1, rounds 2 to 4): the butterfly at the top and the name
 * under it with the call button, the conversation, the composer at the
 * bottom. Tapping the butterfly or the name opens the agent's page; while
 * on a call the pill sits under the header and opens the full call.
 */
struct ChatView: View {
  let agentId: String
  /** `call` or `call-full` or `agent`, from the screenshots' launch. */
  var opening: String? = nil
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @State private var draft = ""
  @State private var showsPage = false
  @State private var showsCall = false
  @State private var showsTranscript = false
  @FocusState private var typing: Bool

  private var agent: Agent? { store.agent(agentId) }

  var body: some View {
    let rows = store.rows(for: agentId)
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 6) {
        ForEach(rows) { row in
          ChatRowView(row: row, agentId: agentId)
        }
        if let agent, agent.isBusy || store.steps[agentId] != nil {
          TypingRow(agent: agent, step: store.steps[agentId])
            .id("typing")
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 8)
      .padding(.bottom, 12)
    }
    .defaultScrollAnchor(.bottom)
    .defaultScrollAnchor(.bottom, for: .sizeChanges)
    .scrollDismissesKeyboard(.interactively)
    .background(Ink.ground)
    .safeAreaInset(edge: .top, spacing: 0) { header }
    .safeAreaInset(edge: .bottom, spacing: 0) { composer }
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .principal) {
        Button { showsPage = true } label: {
          if let agent { AgentAvatar(agent: agent, members: store.members(of: agent), groupInARow: true).frame(width: agent.isGroup ? 64 : 44, height: 44) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(agent?.name ?? "Agent"), details")
      }
    }
    .sheet(isPresented: $showsPage) { AgentPageSheet(agentId: agentId) }
    .fullScreenCover(isPresented: $showsCall) { CallScreen(showsTranscript: $showsTranscript) }
    .task {
      await store.open(agentId)
      switch opening {
      case "call": if let agent { store.startCall(agent) }
      case "call-full": if let agent { store.startCall(agent); showsTranscript = true; showsCall = true }
      case "agent": showsPage = true
      default: break
      }
    }
    .onChange(of: store.call == nil) { _, gone in if gone { showsCall = false } }
  }

  private var header: some View {
    VStack(spacing: 8) {
      if let agent {
        GlassEffectContainer(spacing: 8) {
          HStack(spacing: 8) {
            Button { showsPage = true } label: {
              Text(agent.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
                .padding(.horizontal, 14).padding(.vertical, 7)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: .capsule)
            if store.canCall {
              Button { store.startCall(agent) } label: {
                Image(systemName: "phone.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.title)
                  .frame(width: 32, height: 32)
              }
              .buttonStyle(.plain)
              .glassEffect(.regular.interactive(), in: .circle)
              .accessibilityLabel("Call \(agent.name)")
              .disabled(store.call != nil)
            }
          }
        }
      }
      if let call = store.call, call.agentId == agentId {
        CallPill(call: call, showsTranscript: $showsTranscript) { showsCall = true }
          .padding(.horizontal, 12)
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .padding(.top, 2)
    .padding(.bottom, 6)
    .animation(.snappy, value: store.call?.agentId)
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: 8) {
      Button {} label: {
        Image(systemName: "plus").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
          .frame(width: 36, height: 36)
      }
      .buttonStyle(.plain)
      .glassEffect(.regular.interactive(), in: .circle)
      .disabled(true)
      .accessibilityLabel("Attach")
      TextField("Message \(agent?.name ?? "")", text: $draft, axis: .vertical)
        .lineLimit(1...6)
        .font(.system(size: 17))
        .focused($typing)
        .padding(.vertical, 8)
        .submitLabel(.send)
      if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Image(systemName: "mic.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
          .frame(width: 34, height: 34)
          .background(Ink.bubbleMine, in: Circle())
          .opacity(0.9)
          .accessibilityHidden(true)
      } else {
        Button(action: send) {
          Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
            .frame(width: 34, height: 34)
            .background(Ink.bubbleMine, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Send")
      }
    }
    .padding(.leading, 6).padding(.trailing, 6).padding(.vertical, 5)
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 23, style: .continuous))
    .padding(.horizontal, 12)
    .padding(.bottom, 6)
  }

  private func send() {
    let text = draft
    draft = ""
    Task { await store.send(text, to: agentId) }
  }
}

/** One row of the chat. */
struct ChatRowView: View {
  let row: ChatRow
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    switch row {
    case .stamp(_, let date):
      Text(Chat.stampText(date)).font(.system(size: 13)).foregroundStyle(Ink.secondary)
        .frame(maxWidth: .infinity).padding(.vertical, 10)
    case .bubble(let bubble):
      BubbleView(bubble: bubble, agents: store.agents, author: bubble.author.flatMap { store.agent($0.id) }, inGroup: store.agent(agentId)?.isGroup ?? false)
    case .file(_, let name, _, let fromPerson):
      FileCard(name: name).frame(maxWidth: .infinity, alignment: fromPerson ? .trailing : .leading)
    case .question(let id, let card):
      QuestionCardView(card: card) { value in Task { await store.answer(value, card: id, in: agentId) } }
    case .connectors(_, let names, let connected, let reason):
      ConnectorsCard(names: names, connected: connected, reason: reason)
    case .teammates(_, let count, let peers, let entries):
      TeammatesLine(count: count, peers: peers, entries: entries)
    case .voiceCall(_, let seconds, let lines):
      VoiceCallLine(seconds: seconds, lines: lines)
    case .routine(_, let action, let name):
      RoutineLine(action: action, name: name)
    }
  }
}

/** A bubble: yours on the right in blue, an agent's on the left in grey; in a group the member's name above and butterfly beside. */
struct BubbleView: View {
  let bubble: Bubble
  let agents: [Agent]
  let author: Agent?
  let inGroup: Bool
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      if bubble.fromPerson { Spacer(minLength: 56) }
      if inGroup && !bubble.fromPerson {
        Group {
          if bubble.showsAvatar, let author { ButterflyView(palette: author.palette, margin: 2) } else { Color.clear }
        }
        .frame(width: 26, height: 26)
      }
      VStack(alignment: bubble.fromPerson ? .trailing : .leading, spacing: 4) {
        if inGroup && bubble.showsName, let name = bubble.author?.name {
          Text(name).font(.system(size: 13)).foregroundStyle(Ink.secondary).padding(.leading, 12)
        }
        Text(bubble.fromPerson ? AttributedString(bubble.text) : richText(bubble.text, agents: agents, dark: scheme == .dark))
          .font(.system(size: 17))
          .foregroundStyle(bubble.fromPerson ? Color.white : Ink.primary)
          .padding(.horizontal, 14).padding(.vertical, 9)
          .background(bubble.fromPerson ? Ink.bubbleMine : Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
          .overlay(alignment: bubble.fromPerson ? .bottomLeading : .bottomTrailing) {
            if !bubble.reactions.isEmpty {
              Text(bubble.reactions.joined()).font(.system(size: 13))
                .padding(.horizontal, 5).padding(.vertical, 2)
                .background(Ink.ground, in: Capsule())
                .overlay(Capsule().stroke(Ink.hairline, lineWidth: 0.5))
                .offset(x: bubble.fromPerson ? -10 : 10, y: 12)
            }
          }
          .contextMenu {
            Button { UIPasteboard.general.string = bubble.text } label: { Label("Copy", systemImage: "doc.on.doc") }
          }
      }
      .padding(.bottom, bubble.reactions.isEmpty ? 0 : 10)
      if !bubble.fromPerson { Spacer(minLength: 56) }
    }
  }
}

/** A file an agent made or you sent: its kind's tile, its name, the download mark (the window's file card). */
struct FileCard: View {
  let name: String

  var body: some View {
    HStack(spacing: 12) {
      let kind = Self.kind(of: name)
      Image(systemName: kind.symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
        .frame(width: 32, height: 32)
        .background(kind.colour, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
      Text(name).font(.system(size: 15)).foregroundStyle(Ink.primary).lineLimit(1)
      Image(systemName: "icloud.and.arrow.down").font(.system(size: 15)).foregroundStyle(Ink.secondary)
    }
    .padding(.horizontal, 14).padding(.vertical, 12)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
  }

  static func kind(of name: String) -> (symbol: String, colour: Color) {
    switch (name as NSString).pathExtension.lowercased() {
    case "xlsx", "xls", "csv", "numbers": return ("tablecells", Color(RGB(hex: "#1d8b4f")))
    case "docx", "doc", "pages", "md", "txt": return ("doc.text", Color(RGB(hex: "#2b5fb4")))
    case "pdf": return ("doc.richtext", Color(RGB(hex: "#d4382c")))
    case "pptx", "key": return ("rectangle.on.rectangle", Color(RGB(hex: "#d0592a")))
    case "png", "jpg", "jpeg", "heic", "gif", "webp": return ("photo", Color(RGB(hex: "#7a5af5")))
    default: return ("doc", Color(RGB(hex: "#6e6e73")))
    }
  }
}

/** A question card: the agent's question, the choices, your own answer; the choice made, once answered (the window's widget). */
struct QuestionCardView: View {
  let card: QuestionCard
  let answer: (String) -> Void
  @State private var own = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(card.prompt).font(.system(size: 16, weight: .medium)).foregroundStyle(Ink.primary)
      if let help = card.help { Text(help).font(.system(size: 14)).foregroundStyle(Ink.secondary) }
      VStack(spacing: 0) {
        ForEach(card.options, id: \.self) { option in
          Button { answer(option) } label: {
            HStack(spacing: 10) {
              Image(systemName: card.answer == option ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 18)).foregroundStyle(card.answer == option ? Ink.title : Ink.tertiary)
              Text(option).font(.system(size: 15)).foregroundStyle(Ink.primary).multilineTextAlignment(.leading)
              Spacer(minLength: 0)
            }
            .padding(.vertical, 9)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .disabled(card.answer != nil)
          .opacity(card.answer == nil || card.answer == option ? 1 : 0.45)
          if option != card.options.last { Divider() }
        }
      }
      if card.allowsOwnAnswer && card.answer == nil {
        TextField("Type your own answer", text: $own)
          .font(.system(size: 15))
          .padding(.horizontal, 12).padding(.vertical, 8)
          .background(Ink.ground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          .submitLabel(.send)
          .onSubmit { if !own.trimmingCharacters(in: .whitespaces).isEmpty { answer(own) } }
      } else if let given = card.answer, !card.options.contains(given) {
        Text(given).font(.system(size: 15)).foregroundStyle(Ink.primary)
      }
    }
    .padding(14)
    .frame(maxWidth: 320, alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

/** Connected apps, or one to connect, as a small card. */
struct ConnectorsCard: View {
  let names: [String]
  let connected: Bool
  let reason: String?

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: connected ? "checkmark.circle.fill" : "link.circle.fill")
        .font(.system(size: 20)).foregroundStyle(connected ? Ink.live : Ink.title)
      VStack(alignment: .leading, spacing: 2) {
        Text(connected ? "Connected \(names.joined(separator: " and "))" : "Connect \(names.joined(separator: " and "))")
          .font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
        if let reason { Text(reason).font(.system(size: 13)).foregroundStyle(Ink.secondary) }
      }
    }
    .padding(.horizontal, 14).padding(.vertical, 10)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
  }
}

/** "4 messages with 🦋🦋 2 agents": agents talking to each other, folded; a tap shows what they said. */
struct TeammatesLine: View {
  let count: Int
  let peers: [Party]
  let entries: [Entry]
  @Environment(AppStore.self) private var store
  @State private var open = false

  var body: some View {
    VStack(spacing: 8) {
      Button { withAnimation(.snappy) { open.toggle() } } label: {
        HStack(spacing: 5) {
          Text("\(count) messages with")
          HStack(spacing: -4) {
            ForEach(peers, id: \.id) { peer in
              ButterflyView(palette: store.agent(peer.id)?.palette ?? .named(nil), margin: 2).frame(width: 18, height: 18)
            }
          }
          Text(peers.count == 1 ? peers[0].name : "\(peers.count) agents")
          Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold))
        }
        .font(.system(size: 13))
        .foregroundStyle(Ink.secondary)
      }
      .buttonStyle(.plain)
      if open {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(entries) { entry in
            VStack(alignment: .leading, spacing: 2) {
              Text(entry.toAgent != nil ? "To \(entry.toAgent!.name)" : "From \(entry.fromAgent?.name ?? "")")
                .font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.secondary)
              Text(entry.content ?? "").font(.system(size: 15)).foregroundStyle(Ink.primary)
            }
          }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.bubbleTheirs.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 4)
  }
}

/** A call, as one line: "Voice chat · 01:11"; a tap shows what was said. */
struct VoiceCallLine: View {
  let seconds: Int
  let lines: [CallLine]
  @State private var open = false

  var body: some View {
    VStack(spacing: 8) {
      Button { withAnimation(.snappy) { open.toggle() } } label: {
        HStack(spacing: 5) {
          Image(systemName: "waveform").font(.system(size: 12, weight: .semibold))
          Text("Voice chat · \(Chat.callLength(seconds))")
        }
        .font(.system(size: 13))
        .foregroundStyle(Ink.secondary)
      }
      .buttonStyle(.plain)
      .disabled(lines.isEmpty)
      if open {
        VStack(spacing: 8) {
          ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
            Text(line.text)
              .font(.system(size: 15))
              .foregroundStyle(line.fromPerson ? Ink.secondary : Ink.primary)
              .multilineTextAlignment(line.fromPerson ? .trailing : .leading)
              .frame(maxWidth: .infinity, alignment: line.fromPerson ? .trailing : .leading)
          }
        }
        .padding(.horizontal, 8)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 4)
  }
}

/** "Created routine ⏱ Monday launch check". */
struct RoutineLine: View {
  let action: String
  let name: String

  var body: some View {
    HStack(spacing: 5) {
      Text(action == "deleted" ? "Removed routine" : action == "updated" ? "Changed routine" : "Created routine")
      Image(systemName: "clock").font(.system(size: 12))
      Text(name)
    }
    .font(.system(size: 13))
    .foregroundStyle(Ink.secondary)
    .frame(maxWidth: .infinity)
    .padding(.vertical, 4)
  }
}

/** The agent at work: its butterfly, the step it is on, three dots. */
struct TypingRow: View {
  let agent: Agent
  let step: String?

  var body: some View {
    HStack(spacing: 8) {
      ButterflyView(palette: agent.palette, margin: 2).frame(width: 22, height: 22)
      if let step {
        Text(step).font(.system(size: 14)).foregroundStyle(Ink.secondary).lineLimit(1)
      }
      TypingDots()
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Ink.bubbleTheirs, in: Capsule())
    }
    .padding(.top, 4)
  }
}

struct TypingDots: View {
  var body: some View {
    TimelineView(.animation) { context in
      let t = context.date.timeIntervalSinceReferenceDate
      HStack(spacing: 4) {
        ForEach(0..<3, id: \.self) { index in
          Circle().fill(Ink.secondary).frame(width: 7, height: 7)
            .opacity(0.35 + 0.65 * max(0, sin((t * 4) - Double(index) * 0.8)))
        }
      }
    }
    .accessibilityLabel("Typing")
  }
}
