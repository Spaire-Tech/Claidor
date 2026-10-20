import Foundation

/**
 * The org chart ("Agent network", the window's `org-chart/workspace/view.tsx`,
 * gate `sand_agent_network`, on in Simeon): every agent, solid links between
 * agents that have messaged each other, dashed links from a group to its
 * members, a link lit while both ends are mid-turn, laid out by a fixed
 * force simulation. Shared by the Mac (mac/Simeon/OrgChart.swift) and the
 * iPhone (ios/Simeon/OrgChart.swift).
 */
public enum AgentNetwork {
  public enum EdgeKind: String, Sendable { case message, membership }

  public struct Edge: Hashable, Sendable {
    public let key: String
    public let sourceId: String
    public let targetId: String
    public let kind: EdgeKind
  }

  /** Group to member (not itself, in the list), then each agent's partners, the pair in string order, once each (`se`). */
  public static func edges(_ agents: [Agent]) -> [Edge] {
    let ids = Set(agents.map(\.id))
    var seen = Set<String>()
    var out: [Edge] = []
    for agent in agents {
      if agent.isGroup {
        for member in agent.memberIds where member != agent.id && ids.contains(member) {
          let key = "member::\(agent.id)::\(member)"
          if seen.insert(key).inserted { out.append(Edge(key: key, sourceId: agent.id, targetId: member, kind: .membership)) }
        }
        continue
      }
      for partner in agent.conversationPartnerIds where partner != agent.id && ids.contains(partner) {
        let (low, high) = jsLess(agent.id, partner) ? (agent.id, partner) : (partner, agent.id)
        let key = "msg::\(low)::\(high)"
        if seen.insert(key).inserted { out.append(Edge(key: key, sourceId: low, targetId: high, kind: .message)) }
      }
    }
    return out
  }

  /** JavaScript's `<` on strings: by UTF-16 units. */
  static func jsLess(_ a: String, _ b: String) -> Bool { a.utf16.lexicographicallyPrecedes(b.utf16) }

  public enum Activity: String, Sendable { case talking, recent, idle }

  /** A link's light (`ne`): both ends running (and not waiting) talk; either changed in the last two minutes is recent. */
  public static func activity(_ edge: Edge, byId: [String: Agent], nowMs: Double) -> Activity {
    guard let source = byId[edge.sourceId], let target = byId[edge.targetId] else { return .idle }
    func busy(_ agent: Agent) -> Bool { !agent.awaitingUserResponse && agent.isRunning }
    if busy(source) && busy(target) { return .talking }
    let oldest = min(source.updatedAt ?? 0, target.updatedAt ?? 0)
    return nowMs - oldest <= 120_000 ? .recent : .idle
  }

  public enum State: String, Sendable { case waiting, typing, working, idle }

  /** Waiting on the person, typing, working, or idle (`os`). */
  public static func state(_ agent: Agent) -> State {
    if agent.awaitingUserResponse { return .waiting }
    if agent.isComposing { return .typing }
    if agent.isRunning { return .working }
    return .idle
  }

  /** The card's word and whether it is green (`ae`). */
  public static func cardWord(_ agent: Agent) -> (text: String, live: Bool) {
    switch state(agent) {
    case .typing: (L10n.text("Typing…"), true)
    case .working: (L10n.text("Working…"), true)
    case .waiting: (L10n.text("Waiting for you"), false)
    case .idle: (L10n.text("Idle"), false)
    }
  }

  /** The line under a node (`ke`): none for an idle agent; a group's member count. */
  public static func caption(_ agent: Agent) -> (text: String, live: Bool) {
    switch state(agent) {
    case .typing: return (L10n.text("Typing…"), true)
    case .working: return (L10n.text("Working…"), true)
    case .waiting: return (L10n.text("Waiting for you"), false)
    case .idle:
      guard agent.isGroup else { return ("", false) }
      return (members(agent.memberIds.count), false)
    }
  }

  public static func members(_ count: Int) -> String { count == 1 ? L10n.text("1 member") : L10n.text("\(count) members") }

  /** "4 agents · 1 group · 2 message links". */
  public static func subtitle(_ agents: [Agent], edges: [Edge]) -> String {
    let groups = agents.filter(\.isGroup).count
    let solo = agents.count - groups
    let links = edges.filter { $0.kind == .message }.count
    let agentsPart = solo == 1 ? L10n.text("1 agent") : L10n.text("\(solo) agents")
    let groupsPart = groups == 1 ? L10n.text("1 group") : L10n.text("\(groups) groups")
    let linksPart = links == 1 ? L10n.text("1 message link") : L10n.text("\(links) message links")
    return "\(agentsPart) · \(groupsPart) · \(linksPart)"
  }

  /** The nodes' order for the layout: oldest first, then by id (`Ce`). */
  public static func order(_ agents: [Agent]) -> [String] {
    agents.enumerated().sorted { a, b in
      let left = a.element.createdAt ?? 0, right = b.element.createdAt ?? 0
      if left != right { return left < right }
      let compared = a.element.id.compare(b.element.id, locale: Locale(identifier: "en_US"))
      return compared == .orderedSame ? a.offset < b.offset : compared == .orderedAscending
    }.map(\.element.id)
  }

  public struct Point: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
  }

  static func nudge(_ i: Int, _ j: Int) -> Double { Double((i * 7919 + j * 104_729) % 628) / 100 }

  /**
   * Where each node goes (`pe`): seeded on a golden-angle spiral, then 300
   * rounds of springs (160 apart), repulsion (within 480), a pull to the
   * middle shaped by the window, and two passes keeping nodes 112 apart,
   * cooling as it goes; then fitted, never enlarged, with 64 to spare.
   */
  public static func layout(nodeIds: [String], edges: [Edge], width: Double, height: Double, iterations: Int = 300) -> [String: Point] {
    let count = nodeIds.count
    let cx = width / 2, cy = height / 2
    if count == 0 { return [:] }
    if count == 1 { return [nodeIds[0]: Point(x: cx, y: cy)] }
    var px = [Double](repeating: 0, count: count), py = px, vx = px, vy = px
    var index: [String: Int] = [:]
    let golden = Double.pi * (3 - 5.0.squareRoot())
    for (i, id) in nodeIds.enumerated() {
      index[id] = i
      let radius = 56 * (0.5 + Double(i)).squareRoot()
      let angle = Double(i) * golden
      px[i] = radius * cos(angle)
      py[i] = radius * sin(angle)
    }
    var sources: [Int] = [], targets: [Int] = []
    var degree = [Double](repeating: 0, count: count)
    for edge in edges {
      guard let s = index[edge.sourceId], let t = index[edge.targetId], s != t else { continue }
      sources.append(s); targets.append(t)
      degree[s] += 1; degree[t] += 1
    }
    let springs = sources.count
    var strength = [Double](repeating: 0, count: springs), bias = strength
    for k in 0..<springs {
      let ds = degree[sources[k]], dt = degree[targets[k]]
      strength[k] = 1 / min(ds, dt)
      bias[k] = ds / (ds + dt)
    }
    let aspect = min(2.5, max(1 / 2.5, width / height))
    let gx = 0.06 / aspect, gy = 0.06 * aspect
    let cooling = 1 - pow(0.001, 1 / Double(iterations))
    var heat = 1.0
    for _ in 0..<iterations {
      heat += (0 - heat) * cooling
      for k in 0..<springs {
        let s = sources[k], t = targets[k]
        var dx = px[t] + vx[t] - px[s] - vx[s]
        var dy = py[t] + vy[t] - py[s] - vy[s]
        if dx == 0 && dy == 0 {
          let a = nudge(s, t)
          dx = cos(a) * 1e-6; dy = sin(a) * 1e-6
        }
        let distance = hypot(dx, dy)
        let pull = (distance - 160) / distance * heat * strength[k]
        let mx = dx * pull, my = dy * pull, b = bias[k]
        vx[t] -= mx * b; vy[t] -= my * b
        vx[s] += mx * (1 - b); vy[s] += my * (1 - b)
      }
      for i in 0..<count {
        for j in (i + 1)..<count {
          var dx = px[j] - px[i], dy = py[j] - py[i]
          if dx == 0 && dy == 0 {
            let a = nudge(i, j)
            dx = cos(a) * 1e-6; dy = sin(a) * 1e-6
          }
          let d2 = max(1, dx * dx + dy * dy)
          if d2 >= 480 * 480 { continue }
          let push = -900 * heat / d2
          vx[i] += dx * push; vy[i] += dy * push
          vx[j] -= dx * push; vy[j] -= dy * push
        }
      }
      for i in 0..<count {
        vx[i] -= px[i] * gx * heat
        vy[i] -= py[i] * gy * heat
      }
      for _ in 0..<2 {
        for i in 0..<count {
          for j in (i + 1)..<count {
            var dx = px[i] + vx[i] - px[j] - vx[j]
            var dy = py[i] + vy[i] - py[j] - vy[j]
            let gap = 56.0 * 2
            var d2 = dx * dx + dy * dy
            if d2 >= gap * gap { continue }
            if d2 == 0 {
              let a = nudge(i, j)
              dx = cos(a) * 1e-6; dy = sin(a) * 1e-6
              d2 = dx * dx + dy * dy
            }
            let d = d2.squareRoot()
            let spread = (gap - d) / d
            let ox = dx * spread * 0.5, oy = dy * spread * 0.5
            vx[i] += ox; vy[i] += oy
            vx[j] -= ox; vy[j] -= oy
          }
        }
      }
      for i in 0..<count {
        vx[i] *= 0.6; vy[i] *= 0.6
        px[i] += vx[i]; py[i] += vy[i]
      }
    }
    let minX = px.min() ?? 0, maxX = px.max() ?? 0, minY = py.min() ?? 0, maxY = py.max() ?? 0
    let roomX = max(1, width - 128), roomY = max(1, height - 128)
    let fit = min(1, roomX / max(1, maxX - minX), roomY / max(1, maxY - minY))
    let midX = (minX + maxX) / 2, midY = (minY + maxY) / 2
    var out: [String: Point] = [:]
    for (i, id) in nodeIds.enumerated() {
      out[id] = Point(x: cx + (px[i] - midX) * fit, y: cy + (py[i] - midY) * fit)
    }
    return out
  }

  // MARK: Words (step 12's spec, §§2–3)

  public static let title = L10n.text("Org chart")
  public static let footer = L10n.text("Solid links are real agent-to-agent message history; dashed links are group membership. A link lights up while both agents are mid-turn. Scroll to zoom, drag to pan, double-click to reset.")
  /** The iPhone's foot: the window's first two sentences, then what a finger does there (a pinch, a drag, a double tap). */
  public static let touchFooter = L10n.text("Solid links are real agent-to-agent message history; dashed links are group membership. A link lights up while both agents are mid-turn. Pinch to zoom, drag to pan, double-tap to reset.")
  public static let noAgents = L10n.text("No agents yet. Create a few teammates and the network draws itself.")
  public static let readOnly = L10n.text("Read-only — a conversation between two agents")
  public static let noMessages = L10n.text("No messages between these two yet.")
  public static let loading = L10n.text("Loading conversation…")
  public static let couldNotLoad = L10n.text("Couldn't load this conversation.")
  /** A talking link's description for VoiceOver. */
  public static let talkingNow = L10n.text("Agents are talking now")
  /** A group's card shows this many members, then "+N". */
  public static let memberCap = 12

  /** A link's tooltip and label: "Conversation between Scout and Simeon", "Simeon is a member of Launch squad". */
  public static func edgeLabel(_ kind: EdgeKind, source: String, target: String) -> String {
    kind == .message ? L10n.text("Conversation between \(source) and \(target)") : L10n.text("\(target) is a member of \(source)")
  }

  /** "Scout ⇄ Simeon" (`Rs`). */
  public static func pair(_ first: String, _ second: String) -> String { "\(first) ⇄ \(second)" }

  /** The line under a message link's pair: green while they talk. */
  public static func exchangeCaption(_ activity: Activity) -> (text: String, live: Bool) {
    switch activity {
    case .talking: (L10n.text("Talking now"), true)
    case .recent: (L10n.text("Active recently"), false)
    case .idle: (L10n.text("Agent-to-agent conversation"), false)
    }
  }

  /** "+3" past the twelve members a card shows; nil up to twelve. */
  public static func moreMembers(_ count: Int) -> String? { count > memberCap ? "+\(count - memberCap)" : nil }

  // MARK: Zoom and pan

  public struct View: Equatable, Sendable {
    public var scale: Double
    public var x: Double
    public var y: Double
    public static let identity = View(scale: 1, x: 0, y: 0)
    public init(scale: Double, x: Double, y: Double) { self.scale = scale; self.x = x; self.y = y }
  }

  static func clampValue(_ value: Double, _ low: Double, _ high: Double) -> Double { min(max(value, low), high) }

  /** Scale 1 to 3; the picture may be dragged `margin` of the window past its edges (`is`). */
  public static func clamp(_ view: View, width: Double, height: Double, margin: Double = 0) -> View {
    let scale = clampValue(view.scale, 1, 3)
    let mx = width * margin, my = height * margin
    return View(scale: scale, x: clampValue(view.x, width * (1 - scale) - mx, mx), y: clampValue(view.y, height * (1 - scale) - my, my))
  }

  /** Dragged by `dx`, `dy` (`we`). */
  public static func pan(_ view: View, dx: Double, dy: Double, width: Double, height: Double, margin: Double = 0) -> View {
    clamp(View(scale: view.scale, x: view.x + dx, y: view.y + dy), width: width, height: height, margin: margin)
  }

  /** Zoomed by `factor` about the pointer (`ve`). */
  public static func zoom(_ view: View, factor: Double, atX ax: Double, y ay: Double, width: Double, height: Double) -> View {
    let scale = clampValue(view.scale * factor, 1, 3)
    let ratio = scale / view.scale
    return clamp(View(scale: scale, x: ax - (ax - view.x) * ratio, y: ay - (ay - view.y) * ratio), width: width, height: height)
  }

  /** A scroll's zoom (`Se`): lines are 16, pages 100; a pinch zooms five times as fast. */
  public static func wheelFactor(deltaY: Double, deltaMode: Int = 0, isPinch: Bool) -> Double {
    let unit: Double = deltaMode == 1 ? 16 : deltaMode == 2 ? 100 : 1
    return exp(-deltaY * unit * (isPinch ? 0.01 : 0.002))
  }

  /** A press becomes a drag past 4 points (`je`). */
  public static func isDrag(dx: Double, dy: Double) -> Bool { hypot(dx, dy) > 4 }

  // MARK: The conversation between two agents

  public struct ExchangeLine: Equatable, Sendable {
    public let id: String
    public let text: String
    public let authorId: String?
    public let authorName: String?
    public let timestampMs: Double?
  }

  /**
   * What two agents said to each other, from the first one's chat (`Uan`):
   * its messages to the other, and the other's to it; the last 30.
   */
  public static func exchange(_ entries: [Entry], source: (id: String, name: String), targetId: String) -> [ExchangeLine] {
    var out: [ExchangeLine] = []
    for entry in entries where entry.kind == "message" {
      let toTarget = entry.toAgent?.id == targetId
      let fromTarget = entry.fromAgent?.id == targetId
      guard toTarget || fromTarget else { continue }
      let author: (id: String?, name: String?) = toTarget ? (source.id, source.name) : (entry.fromAgent?.id, entry.fromAgent?.name)
      out.append(ExchangeLine(id: entry.id, text: entry.content ?? "", authorId: author.id, authorName: author.name, timestampMs: entry.timestampMs))
    }
    return Array(out.suffix(30))
  }
}
