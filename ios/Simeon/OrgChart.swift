import SwiftUI
import SimeonCore

/**
 * The org chart on the iPhone (the Mac's `OrgChartView`, mac/Simeon/
 * OrgChart.swift; the window's `view:org-chart`), full screen: every agent a
 * node, a solid line between agents that have messaged each other, a dashed
 * one from a group to its members, green with a moving spark while both
 * ends work, laid out, lit and worded by the core's `AgentNetwork` as the
 * Mac's is. Pinch to zoom (1 to 3 times), drag to pan, double-tap the ground
 * to reset; a node or a line tapped shows its card in a sheet from the
 * bottom with the chart still live above it, the same again or the ground
 * closes it. × closes the chart; Open chat or Open room on a card closes it
 * and opens that chat.
 */
struct OrgChartScreen: View {
  /** Open chat or Open room on a card: the chart closes and that chat opens. */
  let openChat: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var pick: NetworkPick?
  /** The card the sheet shows: the last one picked, kept while the sheet slides away. */
  @State private var shown: NetworkPick?

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        NetworkStage(pick: $pick)
        Text(AgentNetwork.touchFooter)
          .font(.system(size: 12))
          .foregroundStyle(Ink.tertiary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity)
          .padding(EdgeInsets(top: 8, leading: 20, bottom: 12, trailing: 20))
      }
      .background(Ink.ground)
      .containerBackground(Ink.ground, for: .navigation)
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) {
          Button { dismiss() } label: { Image(systemName: "xmark") }
            .accessibilityLabel("Close org chart")
        }
        ToolbarItem(placement: .principal) { ChartTitle() }
      }
    }
    .tint(Ink.primary)
    .onChange(of: pick) { _, next in if let next { shown = next } }
    // The card: half the screen, the chart above it still taking taps and drags; pulled up, all of it.
    .sheet(isPresented: Binding(get: { pick != nil }, set: { if !$0 { pick = nil } })) {
      // Another node or line swaps the card in place; closing, the last card stays on the sheet as it slides away.
      if let card = pick ?? shown {
        NetworkCardSheet(pick: card, close: { pick = nil }, openChat: openChat)
          .presentationDetents([.medium, .large])
          .presentationBackgroundInteraction(.enabled(upThrough: .medium))
          .presentationDragIndicator(.visible)
          .presentationBackground(Ink.ground)
      }
    }
  }
}

extension View {
  /**
   * The org chart over a screen (the Mac's `view:org-chart`, from its ⌘K and
   * "/"): `isOn` read as the Mac reads it, `isAgentNetworkEnabled` once the
   * computer is reached and each time the app comes forward; the chart full
   * screen while `isPresented`. Open chat on a card closes it and opens that
   * chat. The Mac offers it only with the network on and an agent to show.
   */
  func orgChart(isPresented: Binding<Bool>, isOn: Binding<Bool>, openChat: @escaping (String) -> Void) -> some View {
    modifier(OrgChartPresenter(isPresented: isPresented, isOn: isOn, openChat: openChat))
  }
}

/** Reads the org chart's gate and presents the chart (`orgChart(isPresented:isOn:openChat:)`). */
private struct OrgChartPresenter: ViewModifier {
  @Binding var isPresented: Bool
  @Binding var isOn: Bool
  let openChat: (String) -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase

  func body(content: Content) -> some View {
    let reached = store.backend != nil
    content
      .task(id: "\(reached)|\(scenePhase == .active)") {
        guard reached, scenePhase == .active else { return }
        isOn = await store.agentNetworkEnabled()
      }
      // Full screen, not a sheet: a sheet's pull down to close would fight the chart's own drag.
      .fullScreenCover(isPresented: $isPresented) {
        OrgChartScreen { agentId in
          isPresented = false
          openChat(agentId)
        }
        .problemAlert()
        .presentationBackground(Ink.ground)
      }
  }
}

extension Ink {
  /** The Mac's green words and lines (`look.added`, mac/Simeon/Look.swift): "Working…", "Talking now", a talking link, "Connected". */
  static let addedGreen = Color.dynamic(light: "#009957", dark: "#38d591")
}

/** The head in the bar (`sand-org-chart__header`): "Org chart" over the count line ("4 agents · 1 group · 2 message links"). */
private struct ChartTitle: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    let agents = store.agents
    VStack(spacing: 1) {
      Text(AgentNetwork.title)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Ink.primary)
      Text(AgentNetwork.subtitle(agents, edges: AgentNetwork.edges(agents)))
        .font(.system(size: 12))
        .foregroundStyle(Ink.secondary)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }
}

/** What a card shows: an agent or a line; the same again closes it. */
enum NetworkPick: Hashable {
  case agent(String)
  case edge(AgentNetwork.Edge)
}

/** The canvas (`sand-org-chart-network`, "Agent network"): the lines, the nodes, the zoom and the pan. */
private struct NetworkStage: View {
  @Binding var pick: NetworkPick?
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var view = AgentNetwork.View.identity
  /** Where a drag began: the chart as it was and the finger's travel then (a finger left on the glass after a pinch pans on from there). */
  @State private var dragStart: (view: AgentNetwork.View, translation: CGSize)?
  @State private var pinchStart: AgentNetwork.View?
  /** A node's double tap opens its card once, not open-then-shut. */
  @State private var lastPick: (pick: NetworkPick, at: Date)?
  @State private var size: CGSize = .zero
  @State private var memo = ChartLayoutMemo()

  var body: some View {
    let agents = store.agents
    let edges = AgentNetwork.edges(agents)
    // The lines' light reads the time every 15 s (`Ee`).
    TimelineView(.periodic(from: .now, by: 15)) { context in
      let nowMs = context.date.timeIntervalSince1970 * 1000
      GeometryReader { geometry in
        canvas(agents: agents, edges: edges, size: geometry.size, nowMs: nowMs)
          .onAppear { size = geometry.size }
          .onChange(of: geometry.size) { _, now in size = now }
      }
      .contentShape(Rectangle())
      // Beside the nodes' and lines' own taps: a drag that starts on a node pans too.
      .simultaneousGesture(pan)
      .simultaneousGesture(pinch)
      .clipped()
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Agent network")
    }
  }

  // MARK: The canvas

  @ViewBuilder
  private func canvas(agents: [Agent], edges: [AgentNetwork.Edge], size: CGSize, nowMs: Double) -> some View {
    if agents.isEmpty {
      Text(AgentNetwork.noAgents)
        .font(.system(size: 15))
        .foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if size.width > 0 && size.height > 0 {
      let points = memo.points(agents: agents, edges: edges, size: size)
      let byId = Dictionary(agents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
      ZStack(alignment: .topLeading) {
        // The ground: a tap closes the card, a double tap puts the zoom back.
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture { pick = nil }
          .simultaneousGesture(TapGesture(count: 2).onEnded { reset() })
        ForEach(edges, id: \.key) { edge in
          if let a = points[edge.sourceId], let b = points[edge.targetId] {
            NetworkLine(edge: edge, from: CGPoint(x: a.x, y: a.y), to: CGPoint(x: b.x, y: b.y), activity: AgentNetwork.activity(edge, byId: byId, nowMs: nowMs),
                        selected: pick == .edge(edge),
                        label: AgentNetwork.edgeLabel(edge.kind, source: byId[edge.sourceId]?.name ?? "", target: byId[edge.targetId]?.name ?? ""),
                        reduceMotion: reduceMotion) {
              toggle(.edge(edge))
            }
          }
        }
        ForEach(agents) { agent in
          if let point = points[agent.id] {
            NetworkNode(agent: agent, selected: pick == .agent(agent.id)) {
              toggle(.agent(agent.id))
            }
            .position(x: point.x, y: point.y)
          }
        }
      }
      .frame(width: size.width, height: size.height, alignment: .topLeading)
      .scaleEffect(view.scale, anchor: .topLeading)
      .offset(x: view.x, y: view.y)
      // A new agent or another size: the nodes glide to their places (.48 s).
      .animation(reduceMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.48), value: memo.key)
    }
  }

  /** The same node or line again closes its card; the second tap of a double tap (the system's 0.35 s) changes nothing. */
  private func toggle(_ next: NetworkPick) {
    if let last = lastPick, last.pick == next, Date().timeIntervalSince(last.at) < 0.35 { return }
    lastPick = (next, Date())
    pick = pick == next ? nil : next
  }

  /** A drag past 4 points pans, half the canvas past its edges at most (`we`, margin 0.5); while two fingers pinch, the pinch has the chart. */
  private var pan: some Gesture {
    DragGesture(minimumDistance: 4)
      .onChanged { value in
        guard pinchStart == nil else { dragStart = nil; return }
        let start = dragStart ?? (view: view, translation: value.translation)
        if dragStart == nil { dragStart = start }
        view = AgentNetwork.pan(start.view, dx: value.translation.width - start.translation.width, dy: value.translation.height - start.translation.height,
                                width: size.width, height: size.height, margin: 0.5)
      }
      .onEnded { _ in dragStart = nil }
  }

  /** A pinch zooms about where it began (the Mac's pinch and wheel, `ve`). */
  private var pinch: some Gesture {
    MagnifyGesture()
      .onChanged { value in
        let start = pinchStart ?? AgentNetwork.clamp(view, width: size.width, height: size.height)
        if pinchStart == nil { pinchStart = start }
        view = AgentNetwork.zoom(start, factor: value.magnification, atX: value.startLocation.x, y: value.startLocation.y, width: size.width, height: size.height)
      }
      .onEnded { _ in pinchStart = nil }
  }

  private func reset() {
    guard view != .identity else { return }
    withAnimation(reduceMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.24)) { view = .identity }
  }
}

/** The layout, worked out again only when the agents, the lines or the canvas's size change (it is the same answer each time). */
@MainActor
private final class ChartLayoutMemo {
  private(set) var key = ""
  private var cached: [String: AgentNetwork.Point] = [:]

  func points(agents: [Agent], edges: [AgentNetwork.Edge], size: CGSize) -> [String: AgentNetwork.Point] {
    let ids = AgentNetwork.order(agents)
    let width = Double(Int(size.width.rounded())), height = Double(Int(size.height.rounded()))
    let nodes: String = ids.joined(separator: ",")
    let lines: String = edges.map { $0.key }.joined(separator: ",")
    let next = "\(nodes)|\(lines)|\(Int(width))x\(Int(height))"
    if next != key {
      key = next
      cached = AgentNetwork.layout(nodeIds: ids, edges: edges, width: width, height: height)
    }
    return cached
  }
}

/**
 * A node (`be`): 120 wide, its point at the middle of the whole node; the
 * picture (36) with its dot, the name (the second ink, 104 at most) and
 * the line under it (green while it works); a ring round the picture and
 * the name in the full ink while its card shows.
 */
private struct NetworkNode: View {
  let agent: Agent
  let selected: Bool
  let tap: () -> Void

  var body: some View {
    let caption = AgentNetwork.caption(agent)
    Button(action: tap) {
      VStack(spacing: 5) {
        NodeMark(agent: agent, size: 36)
          .overlay {
            if selected {
              Circle().strokeBorder(Ink.link, lineWidth: 2).padding(-4)
            }
          }
          .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.12), value: selected)
        Text(agent.name)
          .font(.system(size: 12, weight: selected ? .medium : .regular))
          .foregroundStyle(selected ? Ink.primary : Ink.secondary)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: 104)
        if !caption.text.isEmpty {
          Text(caption.text)
            .font(.system(size: 12))
            .foregroundStyle(caption.live ? Ink.addedGreen : Ink.tertiary)
            .lineLimit(1)
            .frame(maxWidth: 104)
        }
      }
      .padding(.vertical, 6)
      .padding(.horizontal, 8)
      .frame(width: 120)
      .contentShape(Rectangle())
    }
    .buttonStyle(.tactile)
    .accessibilityLabel("\(agent.name) details")
    .accessibilityValue(caption.text)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/** An agent's picture (or a group's), with the list's dot at its lower right: unread blue, working green, both as blue round green. */
private struct NodeMark: View {
  let agent: Agent
  let size: CGFloat
  @Environment(AppStore.self) private var store

  var body: some View {
    let state = AgentNetwork.state(agent)
    let busy = state == .working || state == .typing
    let dot: CGFloat = size >= 72 ? 13 : 8
    AgentAvatar(agent: agent, members: store.members(of: agent))
      .frame(width: size, height: size)
      .overlay(alignment: .topLeading) {
        if agent.hasUnread || busy {
          ZStack {
            Circle().fill(agent.hasUnread ? Ink.unread : Ink.live)
            if agent.hasUnread && busy {
              Circle().fill(Ink.live).padding(dot / 4)
            }
          }
          .frame(width: dot, height: dot)
          .background(Circle().fill(Ink.ground).padding(-2.5))
          .offset(x: size * 0.75, y: size * 0.75)
        }
      }
  }
}

/**
 * A line (`xe`): 1 point, solid for messages and dashed for membership, in
 * the faint ink, darker for a pair active in the last two minutes; green
 * with a spark running along it while both ends work; the blue while its
 * card shows. A 24-point band takes the tap (the Mac's 16, for a finger).
 */
private struct NetworkLine: View {
  let edge: AgentNetwork.Edge
  let from: CGPoint
  let to: CGPoint
  let activity: AgentNetwork.Activity
  let selected: Bool
  let label: String
  let reduceMotion: Bool
  let tap: () -> Void

  private var colour: Color {
    if selected { return Ink.link }
    if activity == .talking { return Ink.addedGreen }
    if activity == .recent { return Ink.tertiary }
    return edge.kind == .message ? Ink.primary.opacity(0.30) : Ink.primary.opacity(0.20)
  }

  private var opacity: Double {
    if selected { return 0.9 }
    if activity == .talking { return 0.95 }
    return edge.kind == .membership ? 0.6 : 0.8
  }

  var body: some View {
    let line = Path { path in
      path.move(to: from)
      path.addLine(to: to)
    }
    ZStack {
      line.stroke(colour, style: StrokeStyle(lineWidth: 1, dash: edge.kind == .membership ? [3.5, 1.5] : []))
        .opacity(opacity)
      if activity == .talking && !reduceMotion {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { context in
          let t = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.5) / 1.5
          let eased = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
          let along = 0.04 + 0.92 * eased
          let fade = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1
          Circle()
            .fill(colour)
            .frame(width: 6, height: 6)
            .shadow(color: colour, radius: 4)
            .position(x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along)
            .opacity(fade)
            .allowsHitTesting(false)
        }
      }
    }
    .contentShape(line.strokedPath(StrokeStyle(lineWidth: 24, lineCap: .round)))
    .onTapGesture(perform: tap)
    .accessibilityElement()
    .accessibilityLabel(label)
    .accessibilityAddTraits(.isButton)
    .accessibilityHint(activity == .talking ? AgentNetwork.talkingNow : "")
  }
}

// MARK: - The card

/** The card (`me`, "Org chart details") in its sheet: an agent's or a group's, a membership's, or two agents' conversation; × at the top left. */
private struct NetworkCardSheet: View {
  let pick: NetworkPick
  let close: () -> Void
  let openChat: (String) -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    NavigationStack {
      Group {
        switch pick {
        case .agent(let id):
          if let agent = store.agent(id) {
            scrolling { ChartAgentCard(agent: agent, openChat: openChat) }
          }
        case .edge(let edge):
          if let source = store.agent(edge.sourceId), let target = store.agent(edge.targetId) {
            if edge.kind == .membership {
              scrolling { ChartMembershipCard(group: source, member: target, openChat: openChat) }
            } else {
              // The light of the pair, read every 15 s as the chart's lines are.
              TimelineView(.periodic(from: .now, by: 15)) { context in
                let activity = AgentNetwork.activity(edge, byId: [source.id: source, target.id: target], nowMs: context.date.timeIntervalSince1970 * 1000)
                VStack(alignment: .leading, spacing: 14) {
                  ChartExchangeCard(source: source, target: target, activity: activity)
                }
                .padding(EdgeInsets(top: 8, leading: 20, bottom: 12, trailing: 20))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
              }
            }
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .background(Ink.ground)
      .containerBackground(Ink.ground, for: .navigation)
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) {
          Button(action: close) { Image(systemName: "xmark") }
            .accessibilityLabel("Close details")
        }
      }
    }
    .tint(Ink.primary)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Org chart details")
  }

  private func scrolling<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    let card = content()
    return ScrollView {
      VStack(alignment: .leading, spacing: 18) { card }
        .padding(EdgeInsets(top: 8, leading: 20, bottom: 24, trailing: 20))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/** A section's heading (`ys`): upper case, spaced, the faintest ink. */
@MainActor
private func chartHeading(_ text: String) -> some View {
  Text(text.uppercased())
    .font(.system(size: 12, weight: .medium))
    .tracking(0.66)
    .foregroundStyle(Ink.primary.opacity(0.30))
    .accessibilityAddTraits(.isHeader)
}

/** An agent or a group (`te`): its picture (72) and state, About, its members, its last activity, Open chat or Open room. */
private struct ChartAgentCard: View {
  let agent: Agent
  let openChat: (String) -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    let word = AgentNetwork.cardWord(agent)
    VStack(spacing: 8) {
      NodeMark(agent: agent, size: 72)
      Text(agent.name)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Ink.primary)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(word.text)
        .font(.system(size: 13))
        .foregroundStyle(word.live ? Ink.addedGreen : Ink.tertiary)
    }
    .frame(maxWidth: .infinity)
    let about = agent.description.trimmingCharacters(in: .whitespacesAndNewlines)
    if !about.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        chartHeading(String(localized: "About"))
        Text(about)
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
          .lineLimit(5)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    if agent.isGroup {
      VStack(alignment: .leading, spacing: 6) {
        chartHeading(AgentNetwork.members(agent.memberIds.count))
        ChartMemberMarks(members: store.members(of: agent))
      }
    }
    // Named with its module: SwiftUI brings a `Preview` of its own (the canvas's previews).
    if let entry = agent.lastEntry, let line = SimeonCore.Preview.line(entry), !line.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        chartHeading(String(localized: "Last activity"))
        Text(line)
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
          .fixedSize(horizontal: false, vertical: true)
        if let at = agent.lastActivityAt ?? agent.updatedAt, at > 0 {
          Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000)))
            .font(.system(size: 13))
            .foregroundStyle(Ink.primary.opacity(0.30))
        }
      }
    }
    Button(agent.isGroup ? "Open room" : "Open chat") { openChat(agent.id) }
      .buttonStyle(Tactile(look: GreyButtonStyle(capsule: true)))
  }
}

/** A group's members at 32, 6 apart, wrapping: the first twelve, then "+N" (the third ink). */
private struct ChartMemberMarks: View {
  let members: [Agent]

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 32, maximum: 32), spacing: 6, alignment: .leading)], alignment: .leading, spacing: 6) {
      ForEach(members.prefix(AgentNetwork.memberCap)) { member in
        AgentAvatar(agent: member)
          .frame(width: 32, height: 32)
          .accessibilityLabel(member.name)
      }
      if let more = AgentNetwork.moreMembers(members.count) {
        Text(more)
          .font(.system(size: 13))
          .foregroundStyle(Ink.tertiary)
          .frame(height: 32)
      }
    }
  }
}

/** Two pictures overlapping (44, the second 10 over the first), "A ⇄ B" and a line under it (`Rs`). */
private struct PairHead: View {
  let first: Agent
  let second: Agent
  let caption: String
  let live: Bool
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 8) {
      HStack(spacing: -10) {
        ForEach([first, second]) { agent in
          AgentAvatar(agent: agent, members: store.members(of: agent))
            .frame(width: 44, height: 44)
            .background(Circle().fill(Ink.ground).padding(-2.5))
        }
      }
      Text(AgentNetwork.pair(first.name, second.name))
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Ink.primary)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(caption)
        .font(.system(size: 13))
        .foregroundStyle(live ? Ink.addedGreen : Ink.tertiary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
  }
}

/** A group and one of its members (`re`): the group's members, and Open room (the group's). */
private struct ChartMembershipCard: View {
  let group: Agent
  let member: Agent
  let openChat: (String) -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    PairHead(first: group, second: member, caption: AgentNetwork.edgeLabel(.membership, source: group.name, target: member.name), live: false)
    VStack(alignment: .leading, spacing: 6) {
      chartHeading(AgentNetwork.members(group.memberIds.count))
      ChartMemberMarks(members: store.members(of: group))
    }
    Button("Open room") { openChat(group.id) }
      .buttonStyle(Tactile(look: GreyButtonStyle(capsule: true)))
  }
}

/**
 * Two agents' conversation (`ce`), read from the first one's chat (its last
 * 200 lines), again when it changes: their last 30 messages to each other,
 * kept at the newest; loading, failed with Retry, or none yet. Read only.
 */
private struct ChartExchangeCard: View {
  let source: Agent
  let target: Agent
  let activity: AgentNetwork.Activity
  @Environment(AppStore.self) private var store
  @State private var lines: [AgentNetwork.ExchangeLine]?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    let caption = AgentNetwork.exchangeCaption(activity)
    PairHead(first: source, second: target, caption: caption.text, live: caption.live)
    ScrollViewReader { reader in
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          if let lines, !lines.isEmpty {
            ForEach(lines, id: \.id) { line in
              row(line).id(line.id)
            }
          } else if lines == nil && !failed {
            Text(AgentNetwork.loading).font(.system(size: 13)).foregroundStyle(Ink.tertiary)
          } else if failed {
            Text(AgentNetwork.couldNotLoad).font(.system(size: 13)).foregroundStyle(Ink.tertiary)
            Button("Retry") { attempt += 1 }
              .buttonStyle(Tactile(look: GreyButtonStyle(capsule: true)))
          } else {
            Text(AgentNetwork.noMessages).font(.system(size: 13)).foregroundStyle(Ink.tertiary)
          }
        }
        .padding(2)
        .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
      }
      .frame(maxHeight: .infinity)
      .onChange(of: lines?.count ?? 0) { _, _ in
        if let last = lines?.last { reader.scrollTo(last.id, anchor: .bottom) }
      }
    }
    .task(id: "\(source.id)>\(target.id)|\(source.updatedAt ?? 0)|\(attempt)") { await load() }
    VStack(spacing: 0) {
      Rectangle().fill(Ink.hairline).frame(height: 1)
      Text(AgentNetwork.readOnly)
        .font(.system(size: 13))
        .foregroundStyle(Ink.primary.opacity(0.30))
        .frame(maxWidth: .infinity)
        .padding(EdgeInsets(top: 10, leading: 0, bottom: 2, trailing: 0))
    }
  }

  private func row(_ line: AgentNetwork.ExchangeLine) -> some View {
    let author = line.authorId.flatMap { store.agent($0) }
    return HStack(alignment: .top, spacing: 10) {
      Group {
        if let author {
          AgentAvatar(agent: author, members: store.members(of: author))
        } else {
          Image(systemName: "person.crop.circle.fill")
            .resizable()
            .foregroundStyle(Ink.tertiary)
        }
      }
      .frame(width: 28, height: 28)
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(author?.name ?? line.authorName ?? String(localized: "Unknown"))
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Ink.primary)
          if let time = Chat.listTime(ms: line.timestampMs) {
            Text(time)
              .font(.system(size: 12))
              .foregroundStyle(Ink.primary.opacity(0.30))
          }
        }
        Text(line.text)
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }
    }
  }

  private func load() async {
    guard let backend = store.backend else { failed = true; return }
    do {
      let entries = try await backend.tail(source.id, limit: 200)
      lines = AgentNetwork.exchange(entries, source: (id: source.id, name: source.name), targetId: target.id)
      failed = false
    } catch {
      // A failure keeps what was read; with nothing read, it says so with Retry.
      if lines == nil || lines?.isEmpty == true { failed = true }
    }
  }
}
