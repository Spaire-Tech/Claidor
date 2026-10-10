import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * The org chart in the chat's place (the window's `view:org-chart`, opened
 * from ⌘K or "/" as "Org Chart"): every agent as a node, a solid link
 * between agents that have messaged each other, a dashed one from a group to
 * its members, lit while both are mid-turn. Scroll or pinch to zoom (1 to 3
 * times), drag to pan, double-click to reset; a node or a link picked shows
 * its card. Opening any agent closes it; Esc does not.
 */
struct MacOrgChart: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let agents = store.agents
    let edges = AgentNetwork.edges(agents)
    VStack(spacing: 0) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Org chart").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary)
            .accessibilityAddTraits(.isHeader)
          Text(AgentNetwork.subtitle(agents, edges: edges)).font(.system(size: 11)).foregroundStyle(Ink.tertiary)
        }
        Spacer(minLength: 0)
        Button { navigation.closeOrgChart() } label: {
          Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.secondary)
            .frame(width: 28, height: 28).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close org chart")
        .help("Close org chart")
      }
      .padding(.top, 14).padding(.bottom, 10).padding(.horizontal, 20)
      MacNetworkStage(agents: agents, edges: edges)
      Text("Solid links are real agent-to-agent message history; dashed links are group membership. A link lights up while both agents are mid-turn. Scroll to zoom, drag to pan, double-click to reset.")
        .font(.system(size: 11)).foregroundStyle(Ink.tertiary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 8).padding(.horizontal, 20).padding(.bottom, 12)
    }
    .background(Ink.ground)
  }
}

/** What is picked: an agent or a link (`{kind:"agent"}`, `{kind:"edge"}`); the same again clears it. */
enum NetworkPick: Hashable {
  case agent(String)
  case edge(AgentNetwork.Edge)
}

/** The canvas and the card over it. */
struct MacNetworkStage: View {
  let agents: [Agent]
  let edges: [AgentNetwork.Edge]
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var view = AgentNetwork.View.identity
  @State private var pick: NetworkPick?
  @State private var dragStart: AgentNetwork.View?
  @State private var pinchStart: AgentNetwork.View?
  @State private var pointer: CGPoint?
  @State private var wheel: Any?
  @State private var size: CGSize = .zero

  var body: some View {
    // The links' light reads the time every 15 s (`org-chart-recency-tick`).
    TimelineView(.periodic(from: .now, by: 15)) { context in
      let nowMs = context.date.timeIntervalSince1970 * 1000
      ZStack(alignment: .topTrailing) {
        GeometryReader { geometry in
          canvas(size: geometry.size, nowMs: nowMs)
            .onAppear { size = geometry.size }
            .onChange(of: geometry.size) { _, now in size = now }
        }
        // Drags, pinches and the pointer read in the canvas's own points, outside the zoom.
        .contentShape(.rect)
        .gesture(pan(size: size))
        .simultaneousGesture(pinch(size: size))
        .onContinuousHover { phase in
          if case .active(let location) = phase { pointer = location } else { pointer = nil }
        }
        .clipped()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Agent network")
        if let pick, let card = card(pick, nowMs: nowMs) {
          // Its own card for each pick: another link's lines are not kept.
          card
            .id(pick)
            .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: 10)))
        }
      }
    }
    .onAppear(perform: watchWheel)
    .onDisappear { if let wheel { NSEvent.removeMonitor(wheel) }; wheel = nil }
  }

  // MARK: The canvas

  @ViewBuilder
  private func canvas(size: CGSize, nowMs: Double) -> some View {
    if agents.isEmpty {
      Text("No agents yet. Create a few teammates and the network draws itself.")
        .font(.system(size: 12)).foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .padding(.vertical, 48).padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if size.width > 0 && size.height > 0 {
      let points = MacNetworkLayout.shared.points(agents: agents, edges: edges, size: size)
      let byId = Dictionary(agents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
      let clamped = AgentNetwork.clamp(view, width: size.width, height: size.height, margin: 0.5)
      ZStack(alignment: .topLeading) {
        // The background: a click clears the pick, a double-click resets the zoom.
        Color.clear.contentShape(.rect)
          .onTapGesture(count: 2) { reset() }
          .onTapGesture { pick = nil }
        ForEach(edges, id: \.key) { edge in
          if let a = points[edge.sourceId], let b = points[edge.targetId] {
            MacNetworkEdge(edge: edge, from: CGPoint(x: a.x, y: a.y), to: CGPoint(x: b.x, y: b.y), activity: AgentNetwork.activity(edge, byId: byId, nowMs: nowMs), selected: pick == .edge(edge), names: (byId[edge.sourceId]?.name ?? "", byId[edge.targetId]?.name ?? ""), reduceMotion: reduceMotion) {
              pick = pick == .edge(edge) ? nil : .edge(edge)
            }
          }
        }
        ForEach(agents) { agent in
          if let point = points[agent.id] {
            MacNetworkNode(agent: agent, members: store.members(of: agent), selected: pick == .agent(agent.id)) {
              pick = pick == .agent(agent.id) ? nil : .agent(agent.id)
            }
            .position(x: point.x, y: point.y)
          }
        }
      }
      .frame(width: size.width, height: size.height, alignment: .topLeading)
      .scaleEffect(clamped.scale, anchor: .topLeading)
      .offset(x: clamped.x, y: clamped.y)
      .animation(reduceMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.48), value: points.map { "\($0.key)\(Int($0.value.x))\(Int($0.value.y))" }.sorted())
    }
  }

  /** A drag past 4 points pans, half the window past the edges at most (`we` with margin 0.5). */
  private func pan(size: CGSize) -> some Gesture {
    DragGesture(minimumDistance: 4)
      .onChanged { value in
        let start = dragStart ?? view
        if dragStart == nil { dragStart = view }
        view = AgentNetwork.pan(start, dx: value.translation.width, dy: value.translation.height, width: size.width, height: size.height, margin: 0.5)
      }
      .onEnded { _ in dragStart = nil }
  }

  /** A pinch zooms about where it began (the page's `ctrlKey` wheel). */
  private func pinch(size: CGSize) -> some Gesture {
    MagnifyGesture()
      .onChanged { value in
        let start = pinchStart ?? AgentNetwork.clamp(view, width: size.width, height: size.height)
        if pinchStart == nil { pinchStart = start }
        view = AgentNetwork.zoom(start, factor: value.magnification, atX: value.startLocation.x, y: value.startLocation.y, width: size.width, height: size.height)
      }
      .onEnded { _ in pinchStart = nil }
  }

  /** The scroll wheel over the canvas zooms about the pointer, clamped to the window's edges (`Se`, `ve`). */
  private func watchWheel() {
    guard wheel == nil else { return }
    wheel = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
      guard let pointer, size.width > 0 else { return event }
      // Over the card (312 wide, 12 from the edge) the wheel scrolls the card, not the chart.
      if pick != nil, pointer.x > size.width - 324 { return event }
      let lines = event.hasPreciseScrollingDeltas ? 1.0 : 16.0
      let factor = AgentNetwork.wheelFactor(deltaY: -event.scrollingDeltaY * lines, isPinch: false)
      let start = AgentNetwork.clamp(view, width: size.width, height: size.height)
      withAnimation(nil) { view = AgentNetwork.zoom(start, factor: factor, atX: pointer.x, y: pointer.y, width: size.width, height: size.height) }
      return nil
    }
  }

  private func reset() {
    guard view != .identity else { return }
    withAnimation(reduceMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.24)) { view = .identity }
  }

  // MARK: The card

  private func card(_ pick: NetworkPick, nowMs: Double) -> AnyView? {
    switch pick {
    case .agent(let id):
      guard let agent = store.agent(id) else { return nil }
      return AnyView(MacNetworkCard(onClose: { self.pick = nil }) { MacNetworkAgentCard(agent: agent) })
    case .edge(let edge):
      guard let source = store.agent(edge.sourceId), let target = store.agent(edge.targetId) else { return nil }
      let byId = [source.id: source, target.id: target]
      let activity = AgentNetwork.activity(edge, byId: byId, nowMs: nowMs)
      if edge.kind == .membership {
        return AnyView(MacNetworkCard(onClose: { self.pick = nil }) { MacMembershipCard(group: source, member: target) })
      }
      return AnyView(MacNetworkCard(onClose: { self.pick = nil }) { MacExchangeCard(source: source, target: target, activity: activity) })
    }
  }
}

/** The layout, worked out again only when the agents, the links or the canvas change (the window redoes it each draw; the answer is the same). */
@MainActor
final class MacNetworkLayout {
  static let shared = MacNetworkLayout()
  private var key = ""
  private var cached: [String: AgentNetwork.Point] = [:]

  func points(agents: [Agent], edges: [AgentNetwork.Edge], size: CGSize) -> [String: AgentNetwork.Point] {
    let ids = AgentNetwork.order(agents)
    let next = ids.joined(separator: ",") + "|" + edges.map(\.key).joined(separator: ",") + "|\(Int(size.width))x\(Int(size.height))"
    if next != key {
      key = next
      cached = AgentNetwork.layout(nodeIds: ids, edges: edges, width: Double(Int(size.width)), height: Double(Int(size.height)))
    }
    return cached
  }
}

/** A node (`be`): the avatar with its dot, the name, the line under it; a ring when picked. */
struct MacNetworkNode: View {
  let agent: Agent
  let members: [Agent]
  let selected: Bool
  let tap: () -> Void
  @State private var hovering = false

  var body: some View {
    let caption = AgentNetwork.caption(agent)
    let state = AgentNetwork.state(agent)
    Button(action: tap) {
      VStack(spacing: 5) {
        AgentAvatar(agent: agent, members: members, moves: true)
          .frame(width: 36, height: 36)
          .overlay(alignment: .bottomTrailing) {
            if agent.hasUnread { StatusDot(colour: Ink.unread, size: 8).offset(x: 2, y: 2) }
            else if state == .working || state == .typing { StatusDot(colour: Ink.live, size: 8).offset(x: 2, y: 2) }
          }
          .overlay {
            if selected { Circle().strokeBorder(Ink.blue, lineWidth: 2).padding(-4) }
          }
        Text(agent.name).font(.system(size: 11, weight: selected ? .medium : .regular))
          .foregroundStyle(selected ? Ink.primary : Ink.secondary)
          .lineLimit(1).truncationMode(.tail).frame(maxWidth: 104)
        if !caption.text.isEmpty {
          Text(caption.text).font(.system(size: 11)).foregroundStyle(caption.live ? Ink.live : Ink.tertiary)
            .lineLimit(1).frame(maxWidth: 104)
        }
      }
      .padding(.vertical, 6).padding(.horizontal, 8)
      .background(hovering ? Ink.primary.opacity(0.06) : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .scaleEffect(hovering ? 1.04 : 1)
      .animation(.easeOut(duration: 0.18), value: hovering)
      .frame(width: 120)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel("\(agent.name) details")
    .accessibilityValue(caption.text)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/** A link (`xe`): solid for messages, dashed for membership; green with a moving spark while both talk. */
struct MacNetworkEdge: View {
  let edge: AgentNetwork.Edge
  let from: CGPoint
  let to: CGPoint
  let activity: AgentNetwork.Activity
  let selected: Bool
  let names: (source: String, target: String)
  let reduceMotion: Bool
  let tap: () -> Void
  @State private var hovering = false

  private var colour: Color {
    if selected { return Ink.blue }
    if activity == .talking { return Ink.live }
    if activity == .recent { return hovering ? Ink.secondary : Ink.tertiary }
    if edge.kind == .message { return hovering ? Ink.secondary : Ink.primary.opacity(0.25) }
    return hovering ? Ink.tertiary : Ink.edge
  }

  private var opacity: Double {
    if activity == .talking { return 0.95 }
    if selected { return 0.9 }
    return edge.kind == .membership ? 0.6 : 0.8
  }

  var label: String {
    edge.kind == .message ? "Conversation between \(names.source) and \(names.target)" : "\(names.target) is a member of \(names.source)"
  }

  var body: some View {
    let line = Path { path in path.move(to: from); path.addLine(to: to) }
    ZStack {
      line.stroke(colour, style: StrokeStyle(lineWidth: 1.5, dash: edge.kind == .membership ? [4, 4] : []))
        .opacity(opacity)
      if activity == .talking && !reduceMotion {
        TimelineView(.animation) { context in
          let t = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.5) / 1.5
          let eased = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
          let along = 0.04 + 0.92 * eased
          let fade = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1
          Circle().fill(Ink.live).frame(width: 6, height: 6)
            .shadow(color: Ink.live, radius: 4)
            .position(x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along)
            .opacity(fade)
            .allowsHitTesting(false)
        }
      }
    }
    .contentShape(line.strokedPath(StrokeStyle(lineWidth: 16, lineCap: .round)))
    .onTapGesture(perform: tap)
    .onHover { hovering = $0 }
    .help(label)
    .accessibilityElement()
    .accessibilityLabel(label)
    .accessibilityAddTraits(.isButton)
    .accessibilityHint(activity == .talking ? "Agents are talking now" : "")
  }
}

/** The card (`me`): 312 wide at the top right, its ✕ clearing the pick. */
struct MacNetworkCard<Content: View>: View {
  let onClose: () -> Void
  @ViewBuilder let content: () -> Content

  var body: some View {
    ZStack(alignment: .topTrailing) {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) { content() }
          .padding(.top, 20).padding(.horizontal, 16).padding(.bottom, 16)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Button(action: onClose) {
        Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ink.secondary)
          .frame(width: 22, height: 22).contentShape(.rect)
      }
      .buttonStyle(.plain)
      .padding(8)
      .accessibilityLabel("Close details")
    }
    .frame(width: 312)
    .frame(maxHeight: .infinity)
    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.hairline, lineWidth: 1))
    .shadow(color: .black.opacity(0.18), radius: 14, y: 8)
    .padding(.vertical, 8).padding(.trailing, 12)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Org chart details")
  }
}

/** A section's label: small, upper case, spaced (`ys`). */
private func sectionLabel(_ text: String) -> some View {
  Text(text.uppercased()).font(.system(size: 11, weight: .medium)).kerning(0.66).foregroundStyle(Ink.tertiary)
}

/** An agent picked (`te`): its picture, name and state; About; its members; its last activity; Open chat or Open room. */
struct MacNetworkAgentCard: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let word = AgentNetwork.cardWord(agent)
    VStack(spacing: 8) {
      AgentAvatar(agent: agent, members: store.members(of: agent), moves: true)
        .frame(width: 72, height: 72)
        .overlay(alignment: .bottomTrailing) {
          if agent.hasUnread { StatusDot(colour: Ink.unread, size: 12) }
          else if word.live { StatusDot(colour: Ink.live, size: 12) }
        }
      Text(agent.name).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).multilineTextAlignment(.center)
      Text(word.text).font(.system(size: 11)).foregroundStyle(word.live ? Ink.live : Ink.tertiary)
    }
    .frame(maxWidth: .infinity)
    let about = agent.description.trimmingCharacters(in: .whitespacesAndNewlines)
    if !about.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        sectionLabel("About")
        Text(about).font(.system(size: 12)).foregroundStyle(Ink.secondary).lineLimit(5)
      }
    }
    if agent.isGroup {
      let members = store.members(of: agent)
      VStack(alignment: .leading, spacing: 6) {
        sectionLabel(AgentNetwork.members(members.count))
        MemberAvatars(members: members, showsMore: true)
      }
    }
    if let entry = agent.lastEntry, let preview = Preview.line(entry), !preview.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        sectionLabel("Last activity")
        Text(preview).font(.system(size: 12)).foregroundStyle(Ink.secondary)
        if let updated = agent.updatedAt, updated > 0 {
          Text(Chat.listTime(Date(timeIntervalSince1970: updated / 1000))).font(.system(size: 11)).foregroundStyle(Ink.tertiary)
        }
      }
    }
    HStack(spacing: 8) {
      Button(agent.isGroup ? "Open room" : "Open chat") { navigation.selected = agent.id }
        .buttonStyle(.bordered).controlSize(.small)
    }
  }
}

/** Up to twelve members' pictures with their names on hover, and "+N" past that where the window shows it. */
struct MemberAvatars: View {
  let members: [Agent]
  let showsMore: Bool
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 6) {
      ForEach(members.prefix(12)) { member in
        AgentAvatar(agent: member, members: store.members(of: member)).frame(width: 28, height: 28).help(member.name)
      }
      if showsMore && members.count > 12 {
        Text("+\(members.count - 12)").font(.system(size: 11)).foregroundStyle(Ink.tertiary)
      }
    }
  }
}

/** Two pictures overlapping, "A ⇄ B" and a line under it (`Rs`). */
struct MacPairHeader: View {
  let first: Agent
  let second: Agent
  let caption: String
  let live: Bool
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 8) {
      HStack(spacing: -10) {
        AgentAvatar(agent: first, members: store.members(of: first)).frame(width: 36, height: 36)
          .overlay(Circle().stroke(Ink.ground, lineWidth: 2.5))
        AgentAvatar(agent: second, members: store.members(of: second)).frame(width: 36, height: 36)
          .overlay(Circle().stroke(Ink.ground, lineWidth: 2.5))
      }
      Text("\(first.name) ⇄ \(second.name)").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).multilineTextAlignment(.center)
      Text(caption).font(.system(size: 11)).foregroundStyle(live ? Ink.live : Ink.tertiary).multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
  }
}

/** A group and one of its members (`re`): the members, and Open room. */
struct MacMembershipCard: View {
  let group: Agent
  let member: Agent
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    MacPairHeader(first: group, second: member, caption: "\(member.name) is a member of \(group.name)", live: false)
    let members = store.members(of: group)
    VStack(alignment: .leading, spacing: 6) {
      sectionLabel(AgentNetwork.members(members.count))
      MemberAvatars(members: members, showsMore: false)
    }
    Button("Open room") { navigation.selected = group.id }.buttonStyle(.bordered).controlSize(.small)
  }
}

/**
 * Two agents' conversation (`ce`), read from the first one's chat (200
 * lines, 500 when it is the one open), again when its row changes: the
 * last 30 messages between them; loading, failed with Retry, or none yet.
 */
struct MacExchangeCard: View {
  let source: Agent
  let target: Agent
  let activity: AgentNetwork.Activity
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var lines: [AgentNetwork.ExchangeLine]?
  @State private var failed = false
  @State private var attempt = 0

  private var caption: (String, Bool) {
    switch activity {
    case .talking: ("Talking now", true)
    case .recent: ("Active recently", false)
    case .idle: ("Agent-to-agent conversation", false)
    }
  }

  var body: some View {
    MacPairHeader(first: source, second: target, caption: caption.0, live: caption.1)
    VStack(alignment: .leading, spacing: 10) {
      if let lines, !lines.isEmpty {
        ForEach(lines, id: \.id) { line in row(line) }
      } else if lines == nil && !failed {
        Text("Loading conversation…").font(.system(size: 11)).foregroundStyle(Ink.tertiary)
      } else if failed && (lines ?? []).isEmpty {
        Text("Couldn't load this conversation.").font(.system(size: 11)).foregroundStyle(Ink.tertiary)
        Button("Retry") { attempt += 1 }.buttonStyle(.bordered).controlSize(.small)
      } else {
        Text("No messages between these two yet.").font(.system(size: 11)).foregroundStyle(Ink.tertiary)
      }
    }
    .frame(minHeight: 80, alignment: .topLeading)
    .task(id: "\(source.id)>\(target.id)|\(source.updatedAt ?? 0)|\(source.lastMessageId ?? "")|\(attempt)") { await load() }
    Text("Read-only — a conversation between two agents").font(.system(size: 11)).foregroundStyle(Ink.tertiary)
      .frame(maxWidth: .infinity)
      .padding(.top, 10)
      .overlay(alignment: .top) { Divider() }
  }

  private func row(_ line: AgentNetwork.ExchangeLine) -> some View {
    let author = line.authorId.flatMap { store.agent($0) }
    return HStack(alignment: .top, spacing: 8) {
      Group {
        if let author { AgentAvatar(agent: author, members: store.members(of: author)) }
        else { Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(Ink.tertiary) }
      }
      .frame(width: 22, height: 22)
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(author?.name ?? line.authorName ?? "Unknown").font(.system(size: 11, weight: .medium)).foregroundStyle(Ink.primary)
          if let ms = line.timestampMs {
            Text(Chat.listTime(Date(timeIntervalSince1970: ms / 1000))).font(.system(size: 11)).foregroundStyle(Ink.tertiary)
          }
        }
        Text(line.text).font(.system(size: 12)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
      }
    }
  }

  private func load() async {
    guard let backend = store.backend else { failed = true; return }
    let limit = navigation.selected == source.id ? 500 : 200
    do {
      let entries = try await backend.tail(source.id, limit: limit)
      lines = AgentNetwork.exchange(entries, source: (id: source.id, name: source.name), targetId: target.id)
      failed = false
    } catch {
      failed = true
    }
  }
}
