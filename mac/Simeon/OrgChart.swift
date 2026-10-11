import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * The org chart (step 12, N01–N08; the window's `view:org-chart`, its chunk
 * `view-D0otXpJy.js`) in the chat's place, from ⌘K and "/": every agent a
 * node, a solid line between agents that have messaged each other, a dashed
 * one from a group to its members, green with a moving spark while both
 * ends work. Scroll to zoom (1 to 3 times), drag to pan, double-click to
 * reset; a node or a line clicked shows its card on the right. × or any
 * agent opened closes it; Escape closes the card, then the chart.
 */
struct OrgChartView: View {
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme
  @State private var pick: NetworkPick?

  var body: some View {
    let look = Look(scheme)
    let agents = store.agents
    let edges = AgentNetwork.edges(agents)
    VStack(spacing: 0) {
      header(agents: agents, edges: edges, look: look)
      NetworkStage(agents: agents, edges: edges, pick: $pick, look: look)
      Text(AgentNetwork.footer)
        .font(.system(size: 11))
        .cssLineHeight(14, size: 11)
        .foregroundStyle(look.inkTertiary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(EdgeInsets(top: 8, leading: 20, bottom: 12, trailing: 20))
    }
    .background(look.ground)
    // Escape: the card first, then the chart (the window does nothing; decision 2 in mac/STEPS.md).
    .background(ViewerKeys { event in
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      guard event.keyCode == 53, mods.isEmpty, !(NSApp.keyWindow?.firstResponder is NSText) else { return false }
      if pick != nil { pick = nil } else { window.orgChart = false }
      return true
    })
  }

  /** The head (`sand-org-chart__header`, 58): "Org chart" over the count line, × at the right. */
  private func header(agents: [Agent], edges: [AgentNetwork.Edge], look: Look) -> some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(AgentNetwork.title)
          .font(.system(size: 13, weight: .medium))
          .tracking(-0.08)
          .cssLineHeight(18, size: 13)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        Text(AgentNetwork.subtitle(agents, edges: edges))
          .font(.system(size: 11))
          .tracking(0.07)
          .cssLineHeight(14, size: 11)
          .foregroundStyle(look.inkTertiary)
      }
      Spacer(minLength: 0)
      ChartClose(look: look) { window.orgChart = false }
    }
    .padding(EdgeInsets(top: 14, leading: 20, bottom: 10, trailing: 20))
    .background(WindowDragArea())
  }
}

/** × (`Close org chart`): 20, round 4, the glyph 12 in the second ink; the full ink on the grey under the pointer. */
private struct ChartClose: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(hovering ? look.ink : look.inkSecondary)
        .frame(width: 20, height: 20)
        .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { inside in withAnimation(.easeOut(duration: 0.1)) { hovering = inside } }
    .help("Close org chart")
    .accessibilityLabel("Close org chart")
  }
}

/** What a card shows: an agent or a line; the same again closes it. */
enum NetworkPick: Hashable {
  case agent(String)
  case edge(AgentNetwork.Edge)
}

/** The canvas (`sand-org-chart-network`, "Agent network") and the card over its right. */
private struct NetworkStage: View {
  let agents: [Agent]
  let edges: [AgentNetwork.Edge]
  @Binding var pick: NetworkPick?
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var view = AgentNetwork.View.identity
  @State private var dragStart: AgentNetwork.View?
  @State private var pinchStart: AgentNetwork.View?
  @State private var pointer: CGPoint?
  @State private var size: CGSize = .zero
  @State private var memo = LayoutMemo()

  var body: some View {
    // The lines' light reads the time every 15 s (`Ee`).
    TimelineView(.periodic(from: .now, by: 15)) { context in
      let nowMs = context.date.timeIntervalSince1970 * 1000
      ZStack(alignment: .topTrailing) {
        GeometryReader { geometry in
          canvas(size: geometry.size, nowMs: nowMs)
            .onAppear { size = geometry.size }
            .onChange(of: geometry.size) { _, now in size = now }
        }
        .contentShape(Rectangle())
        .gesture(pan)
        .simultaneousGesture(pinch)
        .onContinuousHover { phase in
          if case .active(let location) = phase { pointer = location } else { pointer = nil }
        }
        .pointerStyle(cursor)
        .clipped()
        .background(WheelZoom { event in wheel(event) })
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Agent network")
        if let pick, let card = card(pick, nowMs: nowMs) {
          card
            .id(pick)
            // In from the right (.22 s) only when none showed; another card swaps at once, and closing is at once.
            .transition(.asymmetric(insertion: reduceMotion ? .identity : .opacity.combined(with: .offset(x: 10)), removal: .identity))
        }
      }
      .animation(reduceMotion ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: 0.22), value: pick == nil)
    }
  }

  /** The open hand while zoomed in, the closed one while dragging. */
  private var cursor: PointerStyle? {
    if dragStart != nil { return .grabActive }
    return view.scale > 1 ? .grabIdle : nil
  }

  // MARK: The canvas

  @ViewBuilder
  private func canvas(size: CGSize, nowMs: Double) -> some View {
    if agents.isEmpty {
      Text(AgentNetwork.noAgents)
        .font(.system(size: 13))
        .foregroundStyle(look.inkSecondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if size.width > 0 && size.height > 0 {
      let points = memo.points(agents: agents, edges: edges, size: size)
      let byId = Dictionary(agents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
      ZStack(alignment: .topLeading) {
        // The ground: a click closes the card, a double-click puts the zoom back.
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture(count: 2) { reset() }
          .onTapGesture { pick = nil }
        ForEach(edges, id: \.key) { edge in
          if let a = points[edge.sourceId], let b = points[edge.targetId] {
            NetworkLine(edge: edge, from: CGPoint(x: a.x, y: a.y), to: CGPoint(x: b.x, y: b.y), activity: AgentNetwork.activity(edge, byId: byId, nowMs: nowMs),
                        selected: pick == .edge(edge), label: AgentNetwork.edgeLabel(edge.kind, source: byId[edge.sourceId]?.name ?? "", target: byId[edge.targetId]?.name ?? ""),
                        reduceMotion: reduceMotion, look: look) {
              pick = pick == .edge(edge) ? nil : .edge(edge)
            }
          }
        }
        ForEach(agents) { agent in
          if let point = points[agent.id] {
            NetworkNode(agent: agent, selected: pick == .agent(agent.id), look: look) {
              pick = pick == .agent(agent.id) ? nil : .agent(agent.id)
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

  /** A drag past 4 points pans, half the canvas past its edges at most (`we`, margin 0.5). */
  private var pan: some Gesture {
    DragGesture(minimumDistance: 4)
      .onChanged { value in
        let start = dragStart ?? view
        if dragStart == nil { dragStart = view }
        view = AgentNetwork.pan(start, dx: value.translation.width, dy: value.translation.height, width: size.width, height: size.height, margin: 0.5)
      }
      .onEnded { _ in dragStart = nil }
  }

  /** A pinch zooms about where it began (the page's pinch, a ctrl wheel). */
  private var pinch: some Gesture {
    MagnifyGesture()
      .onChanged { value in
        let start = pinchStart ?? AgentNetwork.clamp(view, width: size.width, height: size.height)
        if pinchStart == nil { pinchStart = start }
        view = AgentNetwork.zoom(start, factor: value.magnification, atX: value.startLocation.x, y: value.startLocation.y, width: size.width, height: size.height)
      }
      .onEnded { _ in pinchStart = nil }
  }

  /** The wheel over the canvas zooms about the pointer (`Se`, `ve`); over the card it scrolls the card. */
  private func wheel(_ event: NSEvent) -> Bool {
    guard let pointer, size.width > 0, !agents.isEmpty else { return false }
    if pick != nil, pointer.x > size.width - 324 { return false }
    let factor = AgentNetwork.wheelFactor(deltaY: -event.scrollingDeltaY, deltaMode: event.hasPreciseScrollingDeltas ? 0 : 1, isPinch: false)
    guard factor != 1 else { return false }
    let start = AgentNetwork.clamp(view, width: size.width, height: size.height)
    view = AgentNetwork.zoom(start, factor: factor, atX: pointer.x, y: pointer.y, width: size.width, height: size.height)
    return true
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
      return AnyView(NetworkCard(look: look, close: { self.pick = nil }) { AgentCard(agent: agent, look: look) })
    case .edge(let edge):
      guard let source = store.agent(edge.sourceId), let target = store.agent(edge.targetId) else { return nil }
      if edge.kind == .membership {
        return AnyView(NetworkCard(look: look, close: { self.pick = nil }) { MembershipCard(group: source, member: target, look: look) })
      }
      let activity = AgentNetwork.activity(edge, byId: [source.id: source, target.id: target], nowMs: nowMs)
      return AnyView(NetworkCard(look: look, scrolls: false, close: { self.pick = nil }) { ExchangeCard(source: source, target: target, activity: activity, look: look) })
    }
  }
}

/** The layout, worked out again only when the agents, the lines or the canvas's size change (it is the same answer each time). */
@MainActor
private final class LayoutMemo {
  private(set) var key = ""
  private var cached: [String: AgentNetwork.Point] = [:]

  func points(agents: [Agent], edges: [AgentNetwork.Edge], size: CGSize) -> [String: AgentNetwork.Point] {
    let ids = AgentNetwork.order(agents)
    let width = Double(Int(size.width.rounded())), height = Double(Int(size.height.rounded()))
    let next = ids.joined(separator: ",") + "|" + edges.map(\.key).joined(separator: ",") + "|\(Int(width))x\(Int(height))"
    if next != key {
      key = next
      cached = AgentNetwork.layout(nodeIds: ids, edges: edges, width: width, height: height)
    }
    return cached
  }
}

/** The wheel over the canvas, taken before the window's own scrolling (a local monitor while the pointer is on the canvas). */
private struct WheelZoom: NSViewRepresentable {
  let handle: (NSEvent) -> Bool

  func makeNSView(context: Context) -> WheelView {
    let view = WheelView()
    view.handle = handle
    return view
  }

  func updateNSView(_ view: WheelView, context: Context) { view.handle = handle }

  final class WheelView: NSView {
    var handle: ((NSEvent) -> Bool)?
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window, !SearchState.showing, !WindowOverlay.showing else { return false }
          let local = self.convert(event.locationInWindow, from: nil)
          guard self.bounds.contains(local) else { return false }
          return self.handle?(event) ?? false
        }
        return took ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}

/**
 * A node (`be`): 120 wide, its point at the middle of the whole node; the
 * butterfly (36) with its dot, the name (11, the second ink, 104 at most)
 * and the line under it (green while it works); a ring round the butterfly
 * and the name in the full ink while its card shows. A touch larger on a
 * faint wash under the pointer.
 */
private struct NetworkNode: View {
  let agent: Agent
  let selected: Bool
  let look: Look
  let tap: () -> Void
  @Environment(AppStore.self) private var store
  @State private var hovering = false

  var body: some View {
    let caption = AgentNetwork.caption(agent)
    Button(action: tap) {
      VStack(spacing: 5) {
        NodeMark(agent: agent, size: 36, look: look)
          .overlay {
            if selected {
              Circle().strokeBorder(look.link, lineWidth: 2).padding(-4)
            }
          }
          .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.12), value: selected)
        Text(agent.name)
          .font(.system(size: 11, weight: selected ? .medium : .regular))
          .tracking(0.07)
          .foregroundStyle(selected ? look.ink : look.inkSecondary)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: 104)
        if !caption.text.isEmpty {
          Text(caption.text)
            .font(.system(size: 11))
            .foregroundStyle(caption.live ? look.added : look.inkTertiary)
            .lineLimit(1)
            .frame(maxWidth: 104)
        }
      }
      .padding(.vertical, 6)
      .padding(.horizontal, 8)
      .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(hovering ? look.ink.opacity(0.06) : .clear))
      .scaleEffect(hovering ? 1.04 : 1)
      .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.18), value: hovering)
      .frame(width: 120)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel("\(agent.name) details")
    .accessibilityValue(caption.text)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/** An agent's butterfly (or a group's) with the sidebar's dot at its lower right: unread blue, working green, both as blue round green. */
private struct NodeMark: View {
  let agent: Agent
  let size: CGFloat
  let look: Look
  var ring: Color? = nil
  @Environment(AppStore.self) private var store

  var body: some View {
    let state = AgentNetwork.state(agent)
    let busy = state == .working || state == .typing
    let dot = size >= 72 ? 13.0 : 8.0
    AgentMark(agent: agent, agents: store.agents, size: size, live: busy)
      .frame(width: size, height: size)
      .overlay(alignment: .topLeading) {
        if agent.hasUnread || busy {
          ZStack {
            Circle().fill(agent.hasUnread ? look.unread : look.working)
            if agent.hasUnread && busy {
              Circle().fill(look.working).padding(dot / 4)
            }
          }
          .frame(width: dot, height: dot)
          .background(Circle().fill(ring ?? look.ground).padding(-2.5))
          .offset(x: size * 0.75, y: size * 0.75)
        }
      }
  }
}

/**
 * A line (`xe`): 1 point, solid for messages and dashed for membership, in
 * the faint ink, darker for a pair active in the last two minutes and under
 * the pointer; green with a spark running along it while both ends work;
 * the blue while its card shows. A 16-point band takes the click.
 */
private struct NetworkLine: View {
  let edge: AgentNetwork.Edge
  let from: CGPoint
  let to: CGPoint
  let activity: AgentNetwork.Activity
  let selected: Bool
  let label: String
  let reduceMotion: Bool
  let look: Look
  let tap: () -> Void
  @State private var hovering = false

  private var colour: Color {
    if selected { return look.link }
    if activity == .talking { return look.added }
    if hovering { return edge.kind == .message || activity == .recent ? look.inkSecondary : look.inkTertiary }
    if activity == .recent { return look.inkTertiary }
    return edge.kind == .message ? look.ink.opacity(0.30) : look.ink.opacity(0.20)
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
    .animation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.48), value: hovering)
    .contentShape(line.strokedPath(StrokeStyle(lineWidth: 16, lineCap: .round)))
    .onTapGesture(perform: tap)
    .onHover { hovering = $0 }
    .help(label)
    .accessibilityElement()
    .accessibilityLabel(label)
    .accessibilityAddTraits(.isButton)
    .accessibilityHint(activity == .talking ? AgentNetwork.talkingNow : "")
  }
}

/** The card (`me`, "Org chart details"): 312 wide, 8 from the top and bottom and 12 from the right, round 14, the raised ground with a hairline and a soft shadow; × at its corner. */
private struct NetworkCard<Content: View>: View {
  let look: Look
  var scrolls = true
  let close: () -> Void
  @ViewBuilder let content: () -> Content

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Group {
        if scrolls {
          ScrollView {
            VStack(alignment: .leading, spacing: 14) { content() }
              .padding(EdgeInsets(top: 20, leading: 16, bottom: 16, trailing: 16))
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        } else {
          VStack(alignment: .leading, spacing: 14) { content() }
            .padding(EdgeInsets(top: 20, leading: 16, bottom: 16, trailing: 16))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
      }
      Button(action: close) {
        Image(systemName: "xmark")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 16, height: 16)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .padding(8)
      .accessibilityLabel("Close details")
    }
    .frame(width: 312)
    .frame(maxHeight: .infinity)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.elevated))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.ink.opacity(0.10), lineWidth: 1))
    .shadow(color: .black.opacity(0.18), radius: 14, y: 8)
    .padding(.vertical, 8)
    .padding(.trailing, 12)
    // A click on the card is the card's.
    .contentShape(Rectangle())
    .onTapGesture {}
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Org chart details")
  }
}

/** A section's heading (`ys`): 11, 500, upper case, spaced, the faintest ink. */
private func sectionHeading(_ text: String, look: Look) -> some View {
  Text(text.uppercased())
    .font(.system(size: 11, weight: .medium))
    .tracking(0.66)
    .foregroundStyle(look.ink.opacity(0.30))
}

/** Open chat / Open room (secondary, small): 20 high, round 4, the grey. */
private struct CardButton: View {
  let title: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13))
        .foregroundStyle(look.ink)
        .padding(.horizontal, 4)
        .frame(height: 20)
        .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(hovering ? look.fillHover : look.rowHover))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

/** An agent's chat opened from a card: the chart goes, the message field takes the keys. */
@MainActor
private func openChat(_ agentId: String, window: WindowState, sidebar: SidebarState, store: AppStore) {
  sidebar.selection.plain(agentId)
  window.choose(agentId, store: store)
  WindowState.composerFocus += 1
}

/** An agent or a group (`te`): its butterfly (72) and state, About, its members, its last activity, Open chat or Open room. */
private struct AgentCard: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar

  var body: some View {
    let word = AgentNetwork.cardWord(agent)
    VStack(spacing: 8) {
      NodeMark(agent: agent, size: 72, look: look, ring: look.elevated)
      Text(agent.name)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.ink)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(word.text)
        .font(.system(size: 11))
        .foregroundStyle(word.live ? look.added : look.inkTertiary)
    }
    .frame(maxWidth: .infinity)
    let about = agent.description.trimmingCharacters(in: .whitespacesAndNewlines)
    if !about.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        sectionHeading("About", look: look)
        Text(about)
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
          .foregroundStyle(look.inkSecondary)
          .lineLimit(5)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    if agent.isGroup {
      let members = store.members(of: agent)
      VStack(alignment: .leading, spacing: 6) {
        sectionHeading(AgentNetwork.members(agent.memberIds.count), look: look)
        MemberMarks(members: members, look: look)
      }
    }
    if let entry = agent.lastEntry, let line = Preview.line(entry), !line.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        sectionHeading("Last activity", look: look)
        Text(line)
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
        if let at = agent.lastActivityAt ?? agent.updatedAt, at > 0 {
          Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000)))
            .font(.system(size: 11))
            .foregroundStyle(look.ink.opacity(0.30))
        }
      }
    }
    CardButton(title: agent.isGroup ? "Open room" : "Open chat", look: look) {
      openChat(agent.id, window: window, sidebar: sidebar, store: store)
    }
  }
}

/** A group's members at 28, 6 apart, wrapping: the first twelve, then "+N" (12, the third ink). */
private struct MemberMarks: View {
  let members: [Agent]
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 28, maximum: 28), spacing: 6, alignment: .leading)], alignment: .leading, spacing: 6) {
      ForEach(members.prefix(AgentNetwork.memberCap)) { member in
        AgentMark(agent: member, agents: store.agents, size: 28)
          .frame(width: 28, height: 33)
          .help(member.name)
      }
      if let more = AgentNetwork.moreMembers(members.count) {
        Text(more)
          .font(.system(size: 12))
          .foregroundStyle(look.inkTertiary)
          .frame(height: 33)
      }
    }
  }
}

/** Two butterflies overlapping (36, the second 10 over the first), "A ⇄ B" and a line under it (`Rs`). */
private struct PairHead: View {
  let first: Agent
  let second: Agent
  let caption: String
  let live: Bool
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 8) {
      HStack(spacing: -10) {
        ForEach([first, second]) { agent in
          AgentMark(agent: agent, agents: store.agents, size: 36)
            .frame(width: 36, height: 36)
            .background(Circle().fill(look.elevated).padding(-2.5))
        }
      }
      Text(AgentNetwork.pair(first.name, second.name))
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.ink)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(caption)
        .font(.system(size: 11))
        .foregroundStyle(live ? look.added : look.inkTertiary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
  }
}

/** A group and one of its members (`re`): the group's members, and Open room (the group's). */
private struct MembershipCard: View {
  let group: Agent
  let member: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar

  var body: some View {
    PairHead(first: group, second: member, caption: AgentNetwork.edgeLabel(.membership, source: group.name, target: member.name), live: false, look: look)
    VStack(alignment: .leading, spacing: 6) {
      sectionHeading(AgentNetwork.members(group.memberIds.count), look: look)
      MemberMarks(members: store.members(of: group), look: look)
    }
    CardButton(title: "Open room", look: look) {
      openChat(group.id, window: window, sidebar: sidebar, store: store)
    }
  }
}

/**
 * Two agents' conversation (`ce`), read from the first one's chat (its last
 * 200 lines), again when it changes: their last 30 messages to each other,
 * kept at the newest; loading, failed with Retry, or none yet. Read only.
 */
private struct ExchangeCard: View {
  let source: Agent
  let target: Agent
  let activity: AgentNetwork.Activity
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var lines: [AgentNetwork.ExchangeLine]?
  @State private var failed = false
  @State private var attempt = 0

  var body: some View {
    let caption = AgentNetwork.exchangeCaption(activity)
    PairHead(first: source, second: target, caption: caption.text, live: caption.live, look: look)
    ScrollViewReader { reader in
      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          if let lines, !lines.isEmpty {
            ForEach(lines, id: \.id) { line in
              row(line).id(line.id)
            }
          } else if lines == nil && !failed {
            Text(AgentNetwork.loading).font(.system(size: 11)).foregroundStyle(look.inkTertiary)
          } else if failed {
            Text(AgentNetwork.couldNotLoad).font(.system(size: 11)).foregroundStyle(look.inkTertiary)
            CardButton(title: "Retry", look: look) { attempt += 1 }
          } else {
            Text(AgentNetwork.noMessages).font(.system(size: 11)).foregroundStyle(look.inkTertiary)
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
      Rectangle().fill(look.ink.opacity(0.05)).frame(height: 1)
      Text(AgentNetwork.readOnly)
        .font(.system(size: 11))
        .foregroundStyle(look.ink.opacity(0.30))
        .frame(maxWidth: .infinity)
        .padding(EdgeInsets(top: 10, leading: 0, bottom: 2, trailing: 0))
    }
  }

  private func row(_ line: AgentNetwork.ExchangeLine) -> some View {
    let author = line.authorId.flatMap { store.agent($0) }
    return HStack(alignment: .top, spacing: 8) {
      Group {
        if let author {
          AgentMark(agent: author, agents: store.agents, size: 22)
        } else {
          Image(systemName: "person.crop.circle.fill")
            .resizable()
            .foregroundStyle(look.inkTertiary)
        }
      }
      .frame(width: 22, height: 22)
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(author?.name ?? line.authorName ?? "Unknown")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(look.ink)
          if let ms = line.timestampMs {
            Text(Chat.listTime(Date(timeIntervalSince1970: ms / 1000)))
              .font(.system(size: 11))
              .foregroundStyle(look.ink.opacity(0.30))
          }
        }
        Text(line.text)
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
          .foregroundStyle(look.inkSecondary)
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
