import AppKit
import SwiftUI
import SimeonCore

/**
 * The open agent's chat (`main.sand-chat`, B01–B03): its messages the
 * window's whole height, under a blurred head (the butterfly, the name in a
 * pill, the call button) and over the message field. Measured from the
 * merged window; what step 2a leaves for later is listed in mac/STEPS.md.
 */
struct ChatPane: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(Viewers.self) private var viewers
  @Environment(\.colorScheme) private var scheme
  @State private var control = ChatControl()
  /** Files dragged over the chat (`isDragOver`). */
  @State private var dropping = false

  var body: some View {
    let look = Look(scheme)
    let agent = store.agent(agentId)
    // A thread opens in the chat's place (`threadRootId`), under its breadcrumb (step 2d).
    let threadRoot = store.openThreads[agentId]
    // Find reads the lines on screen: the thread's while one is open (`ChatFind`).
    let matches = control.findOpen ? findMatches(threadRoot) : []
    ZStack(alignment: .top) {
      look.ground
      Transcript(agentId: agentId, threadRoot: threadRoot, find: findOnScreen(matches), look: look)
      if let agent {
        if let threadRoot {
          ThreadHeader(agent: agent, title: store.threadTitle(threadRoot, in: agentId), look: look) {
            store.closeThread(in: agentId)
          }
        } else {
          ChatHeader(agent: agent, look: look)
        }
      }
    }
    .overlay(alignment: .bottom) {
      Composer(agentId: agentId, name: agent?.name ?? "", threadRoot: threadRoot, look: look)
    }
    // Files dropped anywhere on the chat wait to go with the next message (`dragBindings` on `main.sand-chat`).
    .dropDestination(for: URL.self) { urls, _ in
      // Not under an exchange: its field is hidden and read only.
      guard control.exchangePeer == nil else { return false }
      let files = urls.filter(\.isFileURL)
      control.stage(files.map(IncomingFile.url))
      return !files.isEmpty
    } isTargeted: { dropping = $0 }
    .overlay {
      if dropping { DropOverlay(look: look) }
    }
    // Two agents' messages, over the chat and its field (`threadOverlay`).
    .overlay {
      if let peer = control.exchangePeer {
        ExchangeView(agentId: agentId, peer: peer, look: look)
      }
    }
    // Find's bar, 8 under the head and 16 from the right, over everything (`z-index: 4`).
    .overlay(alignment: .topTrailing) {
      if control.findOpen {
        FindBar(matches: matches, look: look)
          .padding(.top, (threadRoot == nil ? 116 : 44) + 8)
          .padding(.trailing, 16)
      }
    }
    .background(RightClickMenu(agentId: agentId, inThread: threadRoot != nil, store: store, control: control, viewers: viewers))
    .background(ViewerKeys { event in
      // ⌘F (`sand.findInChat`, `mod+f`), not while a file or picture is full screen.
      // Caps Lock aside.
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      guard mods == .command, event.charactersIgnoringModifiers?.lowercased() == "f", viewers.shown == nil else { return false }
      control.openFind()
      return true
    })
    .onChange(of: threadRoot) { _, _ in
      // The bar belongs to the lines on screen (`transcriptPlaneKey`): on a thread, or back, it starts again, still open.
      guard control.findOpen else { return }
      control.findQuery = ""
      control.findChoice = nil
      control.findFocus += 1
    }
    .environment(control)
  }

  /** Find's matches, recounted as lines come (the rows are watched; the lines under them are not). */
  private func findMatches(_ threadRoot: String?) -> [ChatFind.Match] {
    _ = threadRoot == nil ? store.rows(for: agentId) : store.threadRows[agentId] ?? []
    return ChatFind.matches(control.findQuery, in: store.findableEntries(agentId))
  }

  /** What find lights: its words once typed, and the match it stands on. */
  private func findOnScreen(_ matches: [ChatFind.Match]) -> FindOnScreen? {
    guard control.findOpen, !control.findQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return FindOnScreen(needle: control.findQuery.lowercased(), current: control.findIndex(matches).map { matches[$0] })
  }
}

// MARK: The head

/**
 * The chat's head (`header`, 116 high, padded 4 12 28 8): the ground at 78%
 * over a blur, fading out over its last 30 points; the agent's butterfly
 * (52) over its name in a pill (13, medium), the call button 8 to the
 * pill's right. The butterfly and the name open the agent's settings
 * (step 7), the call button calls it (step 11). The rest moves the window.
 */
private struct ChatHeader: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    ZStack(alignment: .top) {
      veil
      WindowDragArea()
      identity
        .padding(.top, 4)
        .padding(.leading, 8)
        .padding(.trailing, 12)
    }
    .frame(height: 116)
    .frame(maxWidth: .infinity)
  }

  private var veil: some View {
    Rectangle()
      .fill(.ultraThinMaterial)
      .overlay { look.headerVeil }
      .mask {
        LinearGradient(stops: [
          .init(color: .black, location: 0),
          .init(color: .black, location: 86.0 / 116.0),
          .init(color: .clear, location: 1),
        ], startPoint: .top, endPoint: .bottom)
      }
      .allowsHitTesting(false)
  }

  /**
   * `sand-chat-header__identity`: padded 0 8 2, its butterfly and pill 4
   * apart, both opening the agent's settings; the call button sits 8 past
   * the pill's right end, level with it.
   */
  private var identity: some View {
    VStack(spacing: 4) {
      Button {} label: {
        AgentMark(agent: agent, agents: store.agents, size: 52)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("View agent settings")
      Button {} label: {
        Text(agent.name)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .padding(.horizontal, 12)
          .frame(height: 26)
          .glassEffect(.regular, in: .capsule)
          .contentShape(Capsule())
      }
      .buttonStyle(.plain)
      .help(agent.name)
      .accessibilityLabel("View agent settings")
      .overlay(alignment: .trailing) {
        if !agent.isGroup {
          CallButton(name: agent.name, look: look)
            .alignmentGuide(.trailing) { $0[.leading] - 8 }
        }
      }
    }
    .padding(EdgeInsets(top: 0, leading: 8, bottom: 2, trailing: 8))
  }
}

/** `simeon-call-button`: a 24-point glass disc with the phone in the window's blue. Calls are step 11. */
private struct CallButton: View {
  let name: String
  let look: Look

  var body: some View {
    Button {} label: {
      Image(systemName: "phone.fill")
        .font(.system(size: 11, weight: .regular))
        .foregroundStyle(look.blue)
        .frame(width: 24, height: 24)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular, in: .circle)
    .help("Call \(name)")
    .accessibilityLabel("Call \(name)")
  }
}

// MARK: The messages

/**
 * The messages (`sand-virtual-transcript`): 16 in from each side, 116 down
 * from the top (under the head) and 112 up from the bottom (over the
 * message field), opening at the newest. The agent's working line has its
 * 40 of the 112 whether or not it works, so nothing moves when it starts.
 *
 * Scrolling as the window scrolls (its bottom pin, `lht`): at the newest
 * (within 4 points) the chat is pinned there, and anything new, longer
 * words or a taller field glide it down to stay at the newest; scrolling
 * up lets go, and scrolling back down to the newest pins it again. A
 * message that arrives while pinned comes in (`data-enter="new"`). A
 * sideways swipe shows every message's time (`PeekCatcher`).
 */
private struct Transcript: View {
  let agentId: String
  let threadRoot: String?
  /** Find's words and current match, while it has words. */
  let find: FindOnScreen?
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @State private var position = ScrollPosition(edge: .bottom)
  @State private var pinned = true
  @State private var userScrolling = false
  /** Rows that arrived while pinned, coming in. */
  @State private var arrivals = Arrivals()

  /** How the window measures the bottom: the gap under what shows, the content's height, the view's. */
  struct Bottom: Equatable {
    let gap: CGFloat
    let height: CGFloat
    let container: CGFloat
  }

  var body: some View {
    let rows = threadRoot == nil ? store.rows(for: agentId) : store.threadRows[agentId] ?? []
    let runs = threadRoot == nil ? store.runFlags[agentId] ?? [:] : [:]
    let agent = store.agent(agentId)
    let activity = agent?.activityLine(named: { id in store.agent(id)?.name })
    // A message's "N replies" joins it (`sand-thread-root-group`); one under a card stays its own row.
    let bubbleIds = Set(rows.compactMap { row -> String? in if case .bubble(let bubble) = row { return bubble.id }; return nil })
    let threads = Dictionary(rows.compactMap { row -> (String, Int)? in
      if case .thread(_, let root, let count, _) = row, bubbleIds.contains(root) { return (root, count) }
      return nil
    }, uniquingKeysWith: { first, _ in first })
    // Rows new since the last look, while pinned, come in (`KMt`); read as the rows are drawn, so a new row comes in from its first frame.
    let entering = arrivals.entering(rows.map(\.id), of: "\(agentId)|\(threadRoot ?? "")", pinned: pinned)
    // Each entry's time, for a sideways swipe (`Lpt`'s `timestampMs`).
    let times = Dictionary((store.transcripts[agentId] ?? []).compactMap { entry in entry.timestampMs.map { (entry.id, $0) } }, uniquingKeysWith: { first, _ in first })
    GeometryReader { box in
      let width = max(0, box.size.width - 32)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(rows) { row in
            if case .thread(_, let root, _, _) = row, threads[root] != nil {
              EmptyView()
            } else {
              // Under the last message while the agent works, the working line meets its bubble (`isIndicatorSeamingBubble`).
              TranscriptRow(row: row, agentId: agentId, isGroup: agent?.isGroup ?? false, run: runs[row.id] ?? RunFlags(), seamsBelow: activity != nil && row.id == rows.last?.id, threadCount: threads[row.id], threadRoot: threadRoot, visibleIds: bubbleIds, width: width, entering: entering.contains(row.id), time: Transcript.time(of: row, in: times), look: look)
                .environment(\.findMarks, find?.marks(for: row.id))
            }
          }
          ActivitySlot(agent: agent, line: activity, look: look)
        }
        .scrollTargetLayout()
        .padding(.horizontal, 16)
        .padding(.top, threadRoot == nil ? 116 : 44)
        // Over the message field: its frame and 28 (the working line's 40 is in the slot).
        .padding(.bottom, control.composerHeight + 28)
      }
      .scrollPosition($position)
      .background { PeekCatcher(control: control) }
      .onChange(of: control.jump) { _, jump in
        guard let jump else { return }
        withAnimation(.easeInOut(duration: 0.3)) { position.scrollTo(id: jump.id, anchor: .center) }
      }
      .onChange(of: control.reveal) { _, reveal in
        guard let reveal else { return }
        withAnimation(.easeInOut(duration: 0.3)) { position.scrollTo(id: reveal.id, anchor: .center) }
      }
      .onChange(of: threadRoot) { _, _ in
        // A quote that opened the thread jumps to its message there; otherwise the thread opens at its newest.
        if let id = control.jumpAfterThread, rows.contains(where: { $0.id == id }) {
          control.jumpAfterThread = nil
          control.jump(to: id)
        } else {
          control.jumpAfterThread = nil
          pinned = true
          position.scrollTo(edge: .bottom)
        }
      }
      .defaultScrollAnchor(.bottom, for: .initialOffset)
      .onScrollPhaseChange { _, phase in
        userScrolling = phase == .tracking || phase == .interacting || phase == .decelerating
      }
      .onScrollGeometryChange(for: Bottom.self) { geometry in
        Bottom(gap: geometry.contentSize.height - geometry.visibleRect.maxY, height: geometry.contentSize.height, container: geometry.containerSize.height)
      } action: { old, new in
        follow(old, new)
      }
    }
  }

  /** The window's pin (`lht`, 4 points) and its smooth follow while pinned. */
  private func follow(_ old: Bottom, _ new: Bottom) {
    if new.gap <= 4 {
      pinned = true
    } else if userScrolling && new.gap > old.gap + 0.5 {
      pinned = false
    }
    guard pinned, abs(new.height - old.height) > 0.5 else { return }
    if new.height > old.height && old.height > old.container {
      withAnimation(.smooth(duration: 0.3)) { position.scrollTo(edge: .bottom) }
    } else {
      position.scrollTo(edge: .bottom)
    }
  }

  /**
   * The rows a chat has shown (`KMt`): those appended while it is pinned at
   * the newest come in for 0.32 s; a chat opened or a thread switched is a
   * new baseline, as is a chat's first rows. Kept outside SwiftUI's state,
   * so reading it as the rows are drawn changes nothing else.
   */
  @MainActor
  final class Arrivals {
    private var key = ""
    private var seen: Set<String> = []
    private var since: [String: Date] = [:]

    func entering(_ ids: [String], of key: String, pinned: Bool) -> Set<String> {
      let now = Date()
      if key != self.key {
        self.key = key
        seen = Set(ids)
        since = [:]
        return []
      }
      if pinned && !seen.isEmpty {
        for id in ids where !seen.contains(id) { since[id] = now }
      }
      seen.formUnion(ids)
      since = since.filter { now.timeIntervalSince($0.value) < 0.32 }
      return Set(since.keys)
    }
  }

  /** An entry's row comes in; the window's grouped rows (an exchange, routines) and its times and "New" line do not. */
  static func enters(_ row: ChatRow) -> Bool {
    switch row {
    case .stamp, .unread, .teammates, .routines: return false
    default: return true
    }
  }

  /** A row's time for a swipe: its entry's, or the message's own. */
  static func time(of row: ChatRow, in times: [String: Double]) -> Double? {
    switch row {
    case .stamp, .unread, .thread, .failedSend, .queuedSend: return nil
    case .bubble(let bubble): return bubble.timestampMs ?? times[bubble.id]
    default: return times[row.id]
    }
  }
}

/**
 * One row (`sand-transcript-row`, padded 2 above and below): on the right
 * for the person, on the left for an agent, in the middle for a time, the
 * "New" line and the chat's events. Its run (SimeonCore's `Chat.runFlags`,
 * the window's `npt` and `REn`): a message or card that starts a group
 * (someone else spoke before it) sits 12 lower, and a bubble that runs on
 * from or into the same sender's has its corner on that side 6 round.
 */
private struct TranscriptRow: View {
  let row: ChatRow
  let agentId: String
  let isGroup: Bool
  let run: RunFlags
  let seamsBelow: Bool
  /** The replies in this message's thread, shown joined under it. */
  let threadCount: Int?
  /** The thread on screen, when a thread is open. */
  let threadRoot: String?
  /** The messages on screen, so a quote of one jumps to it. */
  let visibleIds: Set<String>
  let width: CGFloat
  /** Arrived while the chat was at its newest: it comes in. */
  let entering: Bool
  /** Its time, shown at its right on a sideways swipe. */
  let time: Double?
  let look: Look
  @Environment(ChatControl.self) private var control
  @Environment(\.findMarks) private var findMarks

  private var startsGroup: Bool { run.startsGroup }

  var body: some View {
    let mine = row.side == .person
    content
      .padding(.vertical, 2)
      .modifier(PeekShift(mine: mine))
      .modifier(RowEntrance(active: entering && Transcript.enters(row), anchor: mine ? .bottomTrailing : .bottomLeading))
      .frame(maxWidth: .infinity, alignment: alignment)
      .overlay(alignment: .trailing) {
        if let time { PeekTime(timestampMs: time, look: look) }
      }
      // A message jumped to from a quote lights up in the warning yellow at 22%, holds, then fades (`sand-12cjh1l`, 2.5 s, ease-out).
      .background(look.warn.opacity(control.lit == row.id ? 0.22 : 0))
  }

  @ViewBuilder
  private var content: some View {
    switch row {
    case .stamp(_, let date):
      Stamp(date: date, look: look)
    case .unread:
      UnreadDivider(look: look)
    case .bubble(let bubble):
      BubbleRow(bubble: bubble, agentId: agentId, isGroup: isGroup, run: run, seamsBelow: seamsBelow, threadCount: threadCount, threadRoot: threadRoot, visibleIds: visibleIds, width: width, look: look)
    case .file(_, let name, let url, _):
      FileCard(name: name, url: url, agentId: agentId, width: width, look: look)
        .padding(.top, startsGroup ? 12 : 0)
    case .teammates(_, let exchange, _):
      ExchangeEvent(exchange: exchange, look: look)
    case .routines(_, let action, let routines):
      RoutinesLine(action: action, routines: routines, look: look)
    case .voiceCall(_, let seconds, _):
      CallLineRow(seconds: seconds, look: look)
    case .notice(_, let text):
      FindLine.marked(text, marks: findMarks, look: look)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .multilineTextAlignment(.center)
        .cssLineHeight(16, size: 12)
    case .failedSend(_, let nonce):
      FailedSend(nonce: nonce, agentId: agentId, look: look)
    case .queuedSend(_, let nonce):
      QueuedSend(nonce: nonce, agentId: agentId, look: look)
    case .thread(_, let root, let count, _):
      // Under a card: the chip on its own.
      ThreadOpener(rootId: root, count: count, agentId: agentId, look: look)
    case .question(let id, let card):
      QuestionCardView(entryId: id, agentId: agentId, card: card, look: look)
        .frame(maxWidth: limit(640), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .draft(let id, let card):
      DraftCardView(entryId: id, agentId: agentId, card: card, look: look)
        .frame(maxWidth: limit(640), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .connectors(_, let names, _, let reason):
      ConnectorCards(names: names, reason: reason, look: look)
        .frame(maxWidth: limit(640), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .listenerConnect(_, let platform, let reason):
      ListenerConnectCardView(platform: platform, reason: reason, look: look)
        .frame(maxWidth: limit(420, share: 0.76), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .request(let id, .approval(let requestId, let summary, let reason, let command, let status, let surface, let proposedRule)):
      ApprovalCardView(entryId: id, agentId: agentId, requestId: requestId, summary: summary, reason: reason, command: command, status: status, surface: surface, proposedRule: proposedRule, look: look)
        .frame(maxWidth: limit(520), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .flights(_, let card):
      // An agent's message, drawn in its bubble (`__simeonFlights`).
      let shape = UnevenRoundedRectangle(topLeadingRadius: run.continuesPrevious ? 6 : 18, bottomLeadingRadius: run.continuesNext ? 6 : 18, bottomTrailingRadius: 18, topTrailingRadius: 18)
      FlightsCardView(card: card, look: look)
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(look.theirs, in: shape)
        .overlay { shape.inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
        .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
        .padding(.top, startsGroup ? 12 : 0)
    case .cloudAgent(_, let bcId):
      CloudAgentCardView(bcId: bcId, look: look)
        .frame(maxWidth: limit(640), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .request(_, .computer(_, let instruction, let resolution)):
      ComputerHandoffCard(agentId: agentId, instruction: instruction, resolution: resolution, look: look)
        .frame(maxWidth: limit(380), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    case .request(let id, .secret(let label, let description, let provided)):
      SecretCardView(entryId: id, agentId: agentId, label: label, description: description, provided: provided, look: look)
        .frame(maxWidth: limit(640), alignment: .leading)
        .padding(.top, startsGroup ? 12 : 0)
    default:
      LaterCard(kind: row.kind, look: look)
        .padding(.top, startsGroup ? 12 : 0)
    }
  }

  /** A card's widest (`max-width: min(88%, 640px, 100% - 82px)` and its kin). */
  private func limit(_ cap: CGFloat, share: CGFloat = 0.88) -> CGFloat {
    max(0, min(width * share, cap, width - 82))
  }

  private var alignment: Alignment {
    switch row {
    case .notice: return .center
    default: break
    }
    switch row.side {
    case .person: return .trailing
    case .middle: return .center
    case .agent: return .leading
    }
  }
}

/** A time over the messages after a quarter of an hour (`sand-transcript-time-separator`): 12, at 60%, 14 above and 8 below. */
struct Stamp: View {
  let date: Date
  let look: Look

  var body: some View {
    Text(Chat.stampText(date))
      .font(.system(size: 12))
      .foregroundStyle(look.inkSecondary)
      .lineLimit(1)
      .frame(height: 16)
      .padding(.vertical, 6)
      .padding(.top, 14)
      .padding(.bottom, 8)
  }
}

/** "New" between two blue hairlines before the first unread message (`sand-unread-divider`). */
private struct UnreadDivider: View {
  let look: Look

  var body: some View {
    HStack(spacing: 8) {
      Rectangle().fill(look.unread).frame(height: 1)
      Text("New")
        .font(.system(size: 11, weight: .medium))
        .tracking(0.055)
        .foregroundStyle(look.link)
        .frame(height: 16)
        .fixedSize()
      Rectangle().fill(look.unread).frame(height: 1)
    }
    .padding(.vertical, 2)
    .padding(.top, 14)
    .padding(.bottom, 8)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("New messages")
  }
}

// MARK: Bubbles

/**
 * A message: the person's on the right in the window's blue (14 on 21,
 * padded 10 15; on dark `#1f5087`, 14 on 20, padded 8 12), an agent's on
 * the left in grey with a hairline and a soft shadow (padded 8 12, its
 * blocks 10 apart). At most 88% of the column, 640, or the column less 82.
 * In a group the agents' messages sit 30 in, the author's name over the
 * first of a run (12, at 60%; it opens their chat) and their butterfly (22)
 * beside the last, whose lower left corner is 6 round. Reactions hang under
 * the message's right end.
 */
private struct BubbleRow: View {
  let bubble: Bubble
  let agentId: String
  let isGroup: Bool
  let run: RunFlags
  let seamsBelow: Bool
  let threadCount: Int?
  let threadRoot: String?
  let visibleIds: Set<String>
  let width: CGFloat
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(ChatControl.self) private var control
  @Environment(\.findMarks) private var findMarks
  @State private var hovered = false
  @State private var barHovered = false
  @State private var bubbleWidth: CGFloat = 0

  /** The thread's chip joins the bubble unless the message has reactions (`JEn`). */
  private var chinJoined: Bool { threadCount != nil && bubble.reactions.isEmpty }

  private var startsGroup: Bool { run.startsGroup }

  var body: some View {
    if !bubble.fromPerson && isGroup {
      HStack(alignment: .bottom, spacing: 8) {
        gutter
        VStack(alignment: .leading, spacing: 0) {
          if bubble.showsName, let author = bubble.author {
            Button { window.open(author.id, store: store) } label: {
              Text(author.name)
                .font(.system(size: 12))
                .foregroundStyle(look.inkSecondary)
                .lineLimit(1)
                .frame(height: 16)
                // `sand-group-author`: padded 0 6, 6 round, 6 in from the column.
                .padding(.horizontal, 6)
                .contentShape(RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open \(author.name)'s chat")
            .padding(EdgeInsets(top: 12, leading: 6, bottom: 4, trailing: 0))
          }
          message(column: width - 30)
        }
      }
      .padding(.top, startsGroup && !bubble.showsName ? 12 : 0)
    } else {
      message(column: width)
        .padding(.top, startsGroup ? 12 : 0)
    }
  }

  /** The author's butterfly beside the last message of their run (`sand-author-run__gutter`). */
  @ViewBuilder
  private var gutter: some View {
    if bubble.showsAvatar, let author = bubble.author, let member = store.agent(author.id) {
      AgentMark(agent: member, agents: store.agents, size: 22)
    } else {
      Color.clear.frame(width: 22, height: 22)
    }
  }

  private func message(column: CGFloat) -> some View {
    let limit = max(0, min(column * 0.88, 640, column - 82))
    let words = bubble.text.trimmingCharacters(in: .whitespacesAndNewlines)
    return VStack(alignment: bubble.fromPerson ? .trailing : .leading, spacing: 0) {
      // In a thread, a reply to its first message carries no quote (`x`).
      if let quote = bubble.quote, let target = bubble.replyTo, target != threadRoot {
        let shown = visibleIds.contains(target)
        ReplyQuote(text: quote, look: look, label: shown ? "Jump to replied message" : "Open reply thread") {
          if shown {
            control.jump(to: target)
          } else if let root = store.threadRoot(of: target, in: agentId) {
            control.jumpAfterThread = target
            store.openThread(root, in: agentId)
          }
        }
      }
      VStack(alignment: .trailing, spacing: -6) {
        if let link = bubble.loneLink {
          // A message that is one link is drawn as its card (`xEn`).
          LinkCardView(url: link, look: look)
            .frame(maxWidth: max(0, min(column * 0.76, 420, column - 82)))
            .overlay(alignment: bubble.fromPerson ? .leading : .trailing) { bar }
            .onHover { hover($0) }
        } else if !words.isEmpty || bubble.images.isEmpty {
          VStack(alignment: .leading, spacing: 0) {
            shaped
              .onGeometryChange(for: CGFloat.self) { proxy in proxy.size.width } action: { value in bubbleWidth = value }
            if chinJoined, let threadCount {
              ThreadChin(rootId: bubble.id, count: threadCount, attached: true, look: look) { openThread() }
                .frame(width: max(bubbleWidth, 0))
            }
          }
          .overlay(alignment: bubble.fromPerson ? .leading : .trailing) { bar }
          .onHover { hover($0) }
        }
        if !bubble.reactions.isEmpty {
          ReactionPills(bubble: bubble, agentId: agentId, look: look)
            .padding(.trailing, 10)
        }
      }
      if !chinJoined, let threadCount {
        ThreadChin(rootId: bubble.id, count: threadCount, attached: false, look: look) { openThread() }
      }
      if !bubble.images.isEmpty {
        PictureStrip(images: bubble.images, agentId: agentId, limit: max(0, min(column * 0.86, 560, column - 82)), look: look)
          .padding(.top, words.isEmpty ? 0 : 8)
      }
      if let held = bubble.sentOfflineAtMs {
        Text("Sent while offline · \(BubbleRow.offlineTime.string(from: Date(timeIntervalSince1970: held / 1000)))")
          .font(.system(size: 11))
          .foregroundStyle(look.inkTertiary)
          .padding(.top, 4)
          .padding(.trailing, 4)
      }
    }
    .frame(maxWidth: limit, alignment: bubble.fromPerson ? .trailing : .leading)
    .onDisappear { gone() }
  }

  /**
   * The hover bar, 6 beside the bubble and level with its middle, while the
   * pointer is on the message or the bar, or the message's menu is open.
   */
  @ViewBuilder
  private var bar: some View {
    // Not during a sideways swipe (`:not([data-peeking] *)`).
    if !control.peeking && (hovered || barHovered || control.menuFor == bubble.id) {
      HoverBar(bubble: bubble, agentId: agentId, inThread: threadRoot != nil, look: look)
        .fixedSize()
        // The 6 between is part of the bar, so the pointer can cross to it.
        .padding(bubble.fromPerson ? .trailing : .leading, 6)
        .contentShape(Rectangle())
        .onHover { barHovered = $0 }
        .alignmentGuide(bubble.fromPerson ? .leading : .trailing) { bubble.fromPerson ? $0[.trailing] : $0[.leading] }
    }
  }

  private func hover(_ inside: Bool) {
    hovered = inside
    if inside {
      control.hovered = bubble
    } else if control.hovered?.id == bubble.id {
      control.hovered = nil
    }
  }

  /** SwiftUI does not end a hover when the row goes (scrolled out, a thread opened): let go of it then. */
  private func gone() {
    if control.hovered?.id == bubble.id { control.hovered = nil }
  }

  private func openThread() {
    store.openThread(bubble.id, in: agentId)
  }

  /** "Oct 9, 3:12 PM". */
  static let offlineTime: DateFormatter = {
    let format = DateFormatter()
    format.setLocalizedDateFormatFromTemplate("MMMd jmm")
    return format
  }()

  @ViewBuilder
  private var shaped: some View {
    let trimmed = bubble.text.trimmingCharacters(in: .whitespacesAndNewlines)
    // An emoji on its own (`standaloneEmoji`): 32 on 38, no bubble.
    if Chat.isOneEmoji(trimmed) && bubble.channel == nil {
      Text(trimmed)
        .font(.system(size: 32))
        .cssLineHeight(38, size: 32)
        .textSelection(.enabled)
    } else if bubble.fromPerson {
      VStack(alignment: .leading, spacing: 0) {
        FoldingText(text: bubble.text, lineHeight: look.dark ? 20 : 21, centred: isShort(trimmed), marks: findMarks, look: look)
        if let tag = bubble.channel {
          ChannelTagView(tag: tag, ink: look.yoursText)
        }
      }
        .padding(.vertical, look.dark ? 8 : 10)
        .padding(.horizontal, look.dark ? 12 : 15)
        .frame(minWidth: isShort(trimmed) ? 36 : nil)
        .background(look.yours, in: UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: chinJoined ? 0 : 18, bottomTrailingRadius: chinJoined ? 0 : run.continuesNext ? 6 : 18, topTrailingRadius: run.continuesPrevious ? 6 : 18))
    } else {
      // A run's bubbles meet at 6-point corners (`assistantContinuedPrev`, `…Next`); so does the last one with the working line under it, and in a group the one beside its author's butterfly.
      let joinsBelow = run.continuesNext || (seamsBelow && bubble.reactions.isEmpty) || (isGroup && bubble.showsAvatar)
      let shape = UnevenRoundedRectangle(topLeadingRadius: run.continuesPrevious ? 6 : 18, bottomLeadingRadius: chinJoined ? 0 : joinsBelow ? 6 : 18, bottomTrailingRadius: chinJoined ? 0 : 18, topTrailingRadius: 18)
      VStack(alignment: .leading, spacing: 0) {
        if let call = CallRecordView.parse(bubble.text) {
          CallRecordView(duration: call.duration, recap: call.recap, look: look)
        } else {
          MessageBlocks(blocks: Markdown.cachedBlocks(bubble.text), line: MessageLine(size: 14, lineHeight: 20, colour: look.theirsText, look: look, agents: store.mentionNames, personName: store.account?.name, find: findMarks))
        }
        if let tag = bubble.channel {
          ChannelTagView(tag: tag, ink: look.theirsText)
        }
      }
        .font(.system(size: 14))
        .tracking(-0.042)
        .foregroundStyle(look.theirsText)
        .tint(look.link)
        .textSelection(.enabled)
        .environment(\.messageStreaming, bubble.isStreaming)
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .frame(minWidth: isShort(trimmed) ? 36 : nil)
        .background(look.theirs, in: shape)
        .overlay { shape.inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
        .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
    }
  }

  /** One or two characters (`Tpt`, counted as the window counts them): the bubble at least 36 wide, its words centred (`singleGlyphCircle`). */
  private func isShort(_ trimmed: String) -> Bool {
    bubble.channel == nil && !trimmed.isEmpty && trimmed.utf16.count <= 2
  }
}

/** "N replies" under a card (the window's `card` attachment): the chip on its own, opening the thread. */
private struct ThreadOpener: View {
  let rootId: String
  let count: Int
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    ThreadChin(rootId: rootId, count: count, attached: false, look: look) {
      store.openThread(rootId, in: agentId)
    }
  }
}

/**
 * The reactions under a message (`sand-reaction-pills`): each emoji once,
 * with how many when more than one, on a pale pill ringed with the ground,
 * 22 high. Clicking one adds or takes back the person's own.
 */
private struct ReactionPills: View {
  let bubble: Bubble
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store

  struct Pill: Hashable {
    let emoji: String
    let count: Int
  }

  static func pills(_ reactions: [String]) -> [Pill] {
    var order: [String] = []
    var counts: [String: Int] = [:]
    for emoji in reactions {
      if counts[emoji] == nil { order.append(emoji) }
      counts[emoji, default: 0] += 1
    }
    return order.map { Pill(emoji: $0, count: counts[$0] ?? 1) }
  }

  var body: some View {
    HStack(spacing: 4) {
      ForEach(Self.pills(bubble.reactions), id: \.emoji) { pill in
        Button {
          Task { await store.react(pill.emoji, to: bubble.id, in: agentId) }
        } label: {
          HStack(spacing: 3) {
            Text(pill.emoji)
              .font(.system(size: 14))
              .foregroundStyle(look.ink)
            if pill.count > 1 {
              Text("\(pill.count)")
                .font(.system(size: 12))
                .foregroundStyle(look.inkSecondary)
            }
          }
          .padding(.leading, 7)
          .padding(.trailing, 8)
          .frame(height: 22)
          .background(Capsule().fill(look.reaction))
          .background(Capsule().stroke(look.ground, lineWidth: 4))
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(bubble.myReactions.contains(pill.emoji) ? "Remove your \(pill.emoji) reaction" : "Toggle your \(pill.emoji) reaction")
      }
    }
  }
}

// MARK: Events

/**
 * A line about the chat in its middle (`sand-kit-system-event`): 12 on 16,
 * the words at 60% and a chip after them, 2 apart, 8 below the row before.
 */
private struct SystemEvent<Chips: View>: View {
  let label: String
  let look: Look
  @ViewBuilder let chips: () -> Chips

  var body: some View {
    HStack(spacing: 2) {
      Text(label)
        .foregroundStyle(look.inkSecondary)
        .lineLimit(1)
        .fixedSize()
      chips()
    }
    .font(.system(size: 12))
    .frame(minHeight: 24)
    .padding(.top, 8)
  }
}

/** A chip in an event (`sand-kit-system-event__chip`): a picture and words, padded 4 6 4 4, round. A routine's chip opens it in step 7. */
private struct EventChip<Leading: View>: View {
  let title: String
  let help: String
  let look: Look
  var spacing: CGFloat = 4
  var action: () -> Void = {}
  @ViewBuilder let leading: () -> Leading

  var body: some View {
    Button(action: action) {
      HStack(spacing: spacing) {
        leading()
        Text(title)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      .foregroundStyle(look.inkSecondary)
      .padding(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 6))
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .help(help)
    .accessibilityLabel(help)
  }
}

/**
 * Agents talking to each other, folded (`JIn`): "Messaged", "Message from"
 * or "4 messages with", then the agent, or "2 agents" over their
 * butterflies. One agent's chip opens their messages over the chat; with
 * several, a menu of them (`Agents in this exchange`) does.
 */
private struct ExchangeEvent: View {
  let exchange: Exchange
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control

  var body: some View {
    let peers = exchange.peers
    let title = peers.count == 1 ? peers[0].name : "\(peers.count) agents"
    SystemEvent(label: exchange.label, look: look) {
      EventChip(title: title, help: peers.count == 1 ? "Open \(title)'s messages" : "\(title), show list", look: look, action: {
        if peers.count == 1 {
          control.openExchange(peers[0])
        } else if !peers.isEmpty {
          ExchangeMenu.show(peers: peers, store: store, control: control, dark: look.dark)
        }
      }) {
        HStack(spacing: -6) {
          ForEach(Array(peers.prefix(3).enumerated()), id: \.offset) { _, peer in
            if let agent = store.agent(peer.id) {
              AgentMark(agent: agent, agents: store.agents, size: 16)
            } else {
              ButterflyMark(palette: AgentPalette.named(nil), size: 16)
            }
          }
        }
      }
    }
  }
}

/**
 * Routines changed (`XPn`): "Created routine" and its name after a clock,
 * two joined by "and", three or more as a count.
 */
private struct RoutinesLine: View {
  let action: String
  let routines: [RoutineRef]
  let look: Look

  var body: some View {
    let verb = Chat.routineVerb(action)
    if routines.count >= 3 {
      SystemEvent(label: verb, look: look) {
        EventChip(title: "\(routines.count) routines", help: "\(routines.count) routines, show list", look: look, spacing: 2) { clock }
      }
    } else {
      SystemEvent(label: "\(verb) \(routines.count == 1 ? "routine" : "routines")", look: look) {
        ForEach(Array(routines.enumerated()), id: \.offset) { index, routine in
          if index > 0 {
            Text("and").foregroundStyle(look.inkSecondary).fixedSize()
          }
          EventChip(title: routine.name, help: "Open routine \(routine.name)", look: look, spacing: 2) { clock }
        }
      }
    }
  }

  private var clock: some View {
    Image(systemName: "clock")
      .font(.system(size: 11))
      .frame(width: 16, height: 16)
  }
}

/** A call with the agent, as one line ("Voice chat · 01:49"); the call's card and its transcript are step 11. */
private struct CallLineRow: View {
  let seconds: Int
  let look: Look

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "waveform")
        .font(.system(size: 11))
      Text(String(format: "Voice chat · %02d:%02d", seconds / 60, seconds % 60))
    }
    .font(.system(size: 12))
    .foregroundStyle(look.inkSecondary)
    .frame(minHeight: 24)
    .padding(.top, 8)
  }
}

/** Under a message that did not reach the agent: "Failed to send", Resend, Delete. */
private struct FailedSend: View {
  let nonce: String
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 8) {
      Text("Failed to send")
        .foregroundStyle(Color(nsColor: .systemRed))
      Button("Resend") { Task { await store.resend(nonce, in: agentId) } }
        .buttonStyle(.plain)
        .foregroundStyle(look.link)
      Button("Delete") { store.discardFailed(nonce, in: agentId) }
        .buttonStyle(.plain)
        .foregroundStyle(look.inkSecondary)
    }
    .font(.system(size: 12))
    .padding(.top, 4)
  }
}

/** Under a message held while the computer is out of reach: "Waiting to send…" or "Will send when reconnected", and Cancel. */
private struct QueuedSend: View {
  let nonce: String
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 8) {
      Text(store.isLive ? "Waiting to send…" : "Will send when reconnected")
        .foregroundStyle(look.inkSecondary)
      Button("Cancel") { _ = store.cancelQueued(nonce, in: agentId) }
        .buttonStyle(.plain)
        .foregroundStyle(look.link)
    }
    .font(.system(size: 12))
    .padding(.top, 4)
  }
}

/** A card step 2c draws (flights, a question, a draft, apps to connect, an approval, a cloud agent): its place kept, and said. */
private struct LaterCard: View {
  let kind: String
  let look: Look

  var body: some View {
    Text("A \(kind) card (step 2c)")
      .font(.system(size: 12))
      .foregroundStyle(look.inkSecondary)
      .padding(.vertical, 8)
      .padding(.horizontal, 12)
      .background(look.theirs, in: RoundedRectangle(cornerRadius: 12))
  }
}

// MARK: Files

/**
 * A file (`sand-file-card`): 220 to 340 wide, grey and 12 round like an
 * agent's message, padded 8; its kind's icon (36, 6 round), its name (13,
 * medium; the name cut short before the extension, never the extension)
 * over its size (12, at 60%), and Save at the right. The name opens the
 * preview (step 2c) when the window would: never for a kind it cannot show,
 * and a text, Markdown or JSON file only once the computer read it as text.
 */
private struct FileCard: View {
  let name: String
  let url: String
  let agentId: String
  let width: CGFloat
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(Viewers.self) private var viewers
  @State private var meta = ""
  @State private var readsAsText: Bool?

  var body: some View {
    let parts = FileCard.split(name)
    let limit = max(0, min(width * 0.76, 460, width - 82))
    let opens = FilePreview.opens(FilePreview.kind(name), readsAsText: readsAsText)
    HStack(spacing: 8) {
      FileIcon(name: name, look: look)
      VStack(alignment: .leading, spacing: 0) {
        let title = HStack(alignment: .firstTextBaseline, spacing: 0) {
          Text(parts.base).lineLimit(1).truncationMode(.tail)
          Text(parts.ext).lineLimit(1).fixedSize()
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.theirsText)
        .frame(height: 18)
        if opens {
          Button { viewers.open(file: FileItem(name: name, url: url, agentId: agentId)) } label: { title }
            .buttonStyle(.plain)
            .accessibilityLabel("Open \(name)")
        } else {
          title
        }
        if !meta.isEmpty {
          Text(meta)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(height: 16)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button(action: save) {
        Image(systemName: "arrow.down.to.line")
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 24, height: 24)
          .contentShape(RoundedRectangle(cornerRadius: 6))
      }
      .buttonStyle(.plain)
      .help("Save \(name)")
      .accessibilityLabel("Save \(name)")
    }
    .padding(8)
    .frame(width: FileCard.width(name: name, meta: meta, limit: limit))
    .background(look.theirs, in: RoundedRectangle(cornerRadius: 12))
    .overlay { RoundedRectangle(cornerRadius: 12).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
    .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
    .padding(.vertical, 4)
    .task(id: url) {
      let facts = await store.fileFacts(url)
      meta = facts.line
      readsAsText = facts.readsAsText
    }
  }

  /** "Launch review" and ".docx". */
  static func split(_ name: String) -> (base: String, ext: String) {
    guard let dot = name.lastIndex(of: "."), dot > name.startIndex else { return (name, "") }
    return (String(name[..<dot]), String(name[dot...]))
  }

  /** As wide as its words, between 220 and 340 (`min-width: min(220px, 100%)`, `max-width: min(340px, 100%)`). */
  static func width(name: String, meta: String, limit: CGFloat) -> CGFloat {
    let nameWidth = (name as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 13, weight: .medium)]).width
    let metaWidth = (meta as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 12)]).width
    // Padding 16, the icon 36, two gaps of 8, Save 24.
    let natural: CGFloat = max(nameWidth, metaWidth).rounded(.up) + 92
    return min(max(natural, min(220, limit)), min(340, limit))
  }

  /** Save (`downloadAttachment`): the Mac's save panel in Downloads, then the file read from the computer into it. */
  private func save() {
    saveFile(name: name, url: url, agentId: agentId, store: store)
  }
}

/** A file's kind as the window draws it: Word, Excel, PowerPoint and PDF in their own colours, any other file as a page. */
private struct FileIcon: View {
  let name: String
  let look: Look

  var body: some View {
    Group {
      if let asset = FileIcon.asset(name) {
        Image(asset).resizable().interpolation(.high)
      } else {
        Image(systemName: "doc.fill")
          .font(.system(size: 18))
          .foregroundStyle(look.unread)
          .frame(width: 36, height: 36)
          .background(look.unread.opacity(0.12))
      }
    }
    .frame(width: 36, height: 36)
    .clipShape(RoundedRectangle(cornerRadius: 6))
  }

  static func asset(_ name: String) -> String? {
    switch (name as NSString).pathExtension.lowercased() {
    case "doc", "docx", "rtf": return "FileIcons/word"
    case "xls", "xlsx", "csv": return "FileIcons/excel"
    case "ppt", "pptx": return "FileIcons/powerpoint"
    case "pdf": return "FileIcons/pdf"
    default: return nil
    }
  }
}

/**
 * The person's words in their bubble, folded at 160 points when longer,
 * with Show more under them (13) and Show less once open, as the window
 * folds a long message.
 */
private struct FoldingText: View {
  let text: String
  let lineHeight: CGFloat
  let centred: Bool
  /** Find's marks on the words, while find has words. */
  let marks: FindMarks?
  let look: Look
  @State private var full: CGFloat = 0
  @State private var open = false

  var body: some View {
    let folds = full > 161
    VStack(alignment: .leading, spacing: 4) {
      FindLine.marked(text, marks: marks, look: look)
        .font(.system(size: 14))
        .tracking(-0.042)
        .foregroundStyle(look.yoursText)
        .multilineTextAlignment(centred ? .center : .leading)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
        .cssLineHeight(lineHeight, size: 14)
        .onGeometryChange(for: CGFloat.self) { proxy in proxy.size.height } action: { value in full = value }
        .frame(height: folds && !open ? 160 : nil, alignment: .top)
        .clipped()
      if folds {
        Button { open.toggle() } label: {
          HStack(spacing: 4) {
            Text(open ? "Show less" : "Show more")
              .font(.system(size: 13))
            Image(systemName: open ? "chevron.up" : "chevron.down")
              .font(.system(size: 10, weight: .semibold))
              .frame(width: 16, height: 16)
          }
          .foregroundStyle(look.yoursText)
          .padding(.vertical, 4)
          .padding(.horizontal, 6)
          .contentShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
      }
    }
  }
}
