import AppKit
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

// MARK: The list

/**
 * The sidebar's list (`sand-agents-list`, step 3), padded 4 12 24: the
 * pinned agents as tiles (C03), then the rows, or the person's sections
 * with "Unassigned" last (C06–C09), then Hidden Agents when any agent is
 * hidden (C12). On the rail: the pins as rows over a hairline, then the
 * open sections' rows, a hairline between sections.
 */
struct AgentList: View {
  let rail: Bool
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme
  /** Each section's and tile's place in its drop zone, for where a drag is let go. */
  @State private var places = DropPlaces()
  @State private var listTarget: ListTarget?
  @State private var pinTarget: PinTarget?

  var body: some View {
    let look = Look(scheme)
    let visible = store.agents.filter { !$0.isHidden }
    let byId = Dictionary(visible.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let pins = store.pinnedIds.compactMap { byId[$0] }
    let pinIds = Set(store.pinnedIds)
    let listed = visible.filter { !pinIds.contains($0.id) }
    let sections = store.sidebarSections ?? []
    let shown = SidebarSections.shown(agents: visible, pinnedIds: store.pinnedIds, sections: sections, collapsed: sidebar.folded)
    let order = SidebarSections.order(agents: visible, pinnedIds: store.pinnedIds, sections: sections, collapsed: sidebar.folded)
    let hiddenCount = store.agents.count - visible.count
    ScrollViewReader { scroller in
      ScrollView {
        VStack(spacing: 0) {
          if rail {
            railBody(look: look, pins: pins, listed: listed, sections: sections, shown: shown)
          } else {
            if !pins.isEmpty || isDraggingAgent {
              PinGrid(pins: pins, places: places, target: $pinTarget)
                .padding(.top, 8)
                .padding(.bottom, 12)
            }
            rows(look: look, listed: listed, sections: sections, shown: shown, hiddenCount: hiddenCount)
          }
        }
        .padding(EdgeInsets(top: 4, leading: 12, bottom: 24, trailing: 12))
      }
      .scrollIndicators(.automatic)
      .onChange(of: sidebar.cycle?.next) { _, next in
        if let next { withAnimation(.easeOut(duration: 0.15)) { scroller.scrollTo(next) } }
      }
    }
    .onAppear { window.chooseFirst(order, store: store) }
    .onChange(of: order) { _, next in
      window.chooseFirst(next, store: store)
      sidebar.selection.keep(Set(visible.map(\.id)))
    }
  }

  private var isDraggingAgent: Bool {
    if case .agent = sidebar.dragging { return true }
    return false
  }

  // MARK: Expanded

  @ViewBuilder
  private func rows(look: Look, listed: [Agent], sections: [SidebarSection], shown: [SidebarSections.Shown], hiddenCount: Int) -> some View {
    let wholeListLit = listTarget == .list
    VStack(spacing: 4) {
      if sections.isEmpty {
        LazyVStack(spacing: 4) {
          ForEach(listed) { agent in
            AgentRow(agent: agent, rail: false)
          }
        }
      } else {
        VStack(spacing: 10) {
          ForEach(shown) { section in
            SectionBlock(section: section, lit: listTarget == .section(section.id), line: line(for: section.id))
              .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(DropSpace.list)) } action: { places.sections[section.id] = $0 }
          }
        }
      }
      if hiddenCount > 0 {
        HiddenFoot(count: hiddenCount)
          .padding(.top, 6)
      }
      emptyLines(look: look, listed: listed, hiddenCount: hiddenCount)
    }
    .background(wholeListLit ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 12))
    .coordinateSpace(.named(DropSpace.list))
    .onDrop(of: [.sidebarItem], delegate: ListDrop(sidebar: sidebar, store: store, places: places, sections: shown, target: $listTarget))
  }

  private func line(for sectionId: String) -> VerticalEdge? {
    if case .line(let id, let edge) = listTarget, id == sectionId { return edge }
    return nil
  }

  /** No agents yet (`No saved agents yet.`), or every one hidden (`All bots are hidden`). */
  @ViewBuilder
  private func emptyLines(look: Look, listed: [Agent], hiddenCount: Int) -> some View {
    if store.hasReachedBox && store.agents.isEmpty {
      Text("No saved agents yet.")
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    } else if listed.isEmpty && store.pinned.isEmpty && hiddenCount > 0 {
      VStack(alignment: .leading, spacing: 4) {
        Text("All bots are hidden")
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
        Button("Show Hidden Agents") { sidebar.showsHidden = true }
          .buttonStyle(.plain)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(look.link)
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: The rail

  @ViewBuilder
  private func railBody(look: Look, pins: [Agent], listed: [Agent], sections: [SidebarSection], shown: [SidebarSections.Shown]) -> some View {
    if !pins.isEmpty {
      VStack(spacing: 4) {
        ForEach(pins) { agent in
          AgentRow(agent: agent, rail: true)
        }
        RailHairline(look: look).padding(.top, 6)
      }
      .padding(.bottom, 16)
    }
    if sections.isEmpty {
      LazyVStack(spacing: 4) {
        ForEach(listed) { agent in
          AgentRow(agent: agent, rail: true)
        }
      }
    } else {
      let open = shown.filter { !$0.isCollapsed && !$0.agents.isEmpty }
      VStack(spacing: 10) {
        ForEach(Array(open.enumerated()), id: \.element.id) { index, section in
          VStack(spacing: 4) {
            if index > 0 { RailHairline(look: look).padding(.vertical, 2) }
            ForEach(section.agents) { agent in
              AgentRow(agent: agent, rail: true)
            }
          }
        }
      }
    }
  }
}

/** The rail's hairline under the pins and between sections: 54 wide, the text colour at 15%. */
private struct RailHairline: View {
  let look: Look

  var body: some View {
    Rectangle().fill(look.ink.opacity(0.15)).frame(width: 54, height: 0.5)
  }
}

// MARK: Pins

/**
 * The pinned agents as tiles (`sand-pinned-grid`, C03), padded 6 on a 12
 * round ground: as many 80-point columns as fit, 8 apart, the grid in the
 * middle, rows 12 apart. While an agent is dragged and nothing is pinned, a
 * dashed zone 104 high says "Drag here to pin" (14 on 20, 60%). An agent
 * let go on the grid is pinned (where it is let go, on a tile); a tile let
 * go on another takes its place. The grid greys while a drop would land.
 */
private struct PinGrid: View {
  let pins: [Agent]
  let places: DropPlaces
  @Binding var target: PinTarget?
  @Environment(AppStore.self) private var store
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    let lit = target == .grid
    Group {
      if pins.isEmpty {
        Text("Drag here to pin")
          .font(.system(size: 14))
          .foregroundStyle(look.inkSecondary)
          .frame(maxWidth: .infinity)
          .frame(height: 104)
          .background(lit ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 12))
          .overlay {
            RoundedRectangle(cornerRadius: 12)
              .strokeBorder(look.ink.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
          }
          .accessibilityLabel("Pin drop zone")
      } else {
        PinGridLayout {
          ForEach(pins) { agent in
            PinTile(agent: agent, lit: target == .tile(agent.id))
              .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(DropSpace.pins)) } action: { places.tiles[agent.id] = $0 }
          }
        }
        .padding(6)
        .background(lit ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Pinned agents")
      }
    }
    .coordinateSpace(.named(DropSpace.pins))
    .onDrop(of: [.sidebarItem], delegate: PinDrop(sidebar: sidebar, store: store, places: places, pins: pins.map(\.id), target: $target))
  }
}

/**
 * The grid's columns as the window's CSS grid makes them
 * (`repeat(auto-fit, minmax(80px, max-content))`, centred): as many as fit
 * at 80 and 8 apart, each as wide as its widest tile, the empty ones
 * dropped, the whole in the middle; rows 12 apart, each as high as its
 * highest tile, tiles at their top left.
 */
private struct PinGridLayout: Layout {
  static let column: CGFloat = 80
  static let columnGap: CGFloat = 8
  static let rowGap: CGFloat = 12

  struct Grid {
    var columns: [CGFloat]
    var rows: [CGFloat]
    var sizes: [CGSize]
    var count: Int { columns.count }
  }

  func grid(width: CGFloat, subviews: Subviews) -> Grid {
    let sizes = subviews.map { view -> CGSize in
      let size = view.sizeThatFits(.unspecified)
      return CGSize(width: max(Self.column, size.width), height: size.height)
    }
    let columns = width.isFinite ? ((width + Self.columnGap) / (Self.column + Self.columnGap)).rounded(.down) : 1
    let fit = max(1, Int(min(columns, 1000)))
    let count = max(1, min(fit, sizes.count))
    var columns = Array(repeating: CGFloat(0), count: count)
    var rows: [CGFloat] = []
    for (index, size) in sizes.enumerated() {
      let column = index % count
      let row = index / count
      columns[column] = max(columns[column], size.width)
      if row == rows.count { rows.append(0) }
      rows[row] = max(rows[row], size.height)
    }
    return Grid(columns: columns, rows: rows, sizes: sizes)
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? (Self.column * 2 + Self.columnGap)
    let grid = grid(width: width, subviews: subviews)
    let height = grid.rows.reduce(0, +) + Self.rowGap * CGFloat(max(0, grid.rows.count - 1))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let grid = grid(width: bounds.width, subviews: subviews)
    let used = grid.columns.reduce(0, +) + Self.columnGap * CGFloat(max(0, grid.count - 1))
    let left = bounds.minX + (bounds.width - used) / 2
    for (index, view) in subviews.enumerated() {
      let column = index % grid.count
      let row = index / grid.count
      let x = left + grid.columns[..<column].reduce(0, +) + Self.columnGap * CGFloat(column)
      let y = bounds.minY + grid.rows[..<row].reduce(0, +) + Self.rowGap * CGFloat(row)
      view.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(grid.sizes[index]))
    }
  }
}

/**
 * A pinned agent's tile (`sand-agent-item` as a tile, C03): its live
 * butterfly 60 over its name (11 on 16) and its title in blue, padded 6 4
 * 4, 6 between, at least 80 wide, the name at most 92. Unread (blue) or at
 * work (green) is a 10-point dot at the butterfly's corner, 2 in. The open
 * agent's tile is the white card; picked, the blue wash; under the pointer,
 * grey.
 */
private struct PinTile: View {
  let agent: Agent
  let lit: Bool
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme
  @State private var hovering = false

  var body: some View {
    let look = Look(scheme)
    Button {
      sidebar.click(agent.id, store: store, window: window)
    } label: {
      VStack(spacing: 6) {
        AgentMark(agent: agent, agents: store.agents, size: 60, live: true)
          .overlay(alignment: .bottomTrailing) {
            if let dot = cornerDot(look) {
              Circle().fill(dot).frame(width: 10, height: 10).padding(2)
            }
          }
        VStack(spacing: 4) {
          Text(agent.name)
            .font(.system(size: 11))
            .tracking(0.055)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(maxWidth: 92)
            .frame(height: 16)
          if !agent.isGroup && !agent.title.isEmpty {
            Text(agent.title)
              .font(.system(size: 11))
              .tracking(0.055)
              .foregroundStyle(look.blue)
              .lineLimit(1)
              .truncationMode(.tail)
              .frame(maxWidth: 92)
              .padding(.vertical, 3)
              .padding(.horizontal, 1)
          }
        }
      }
      .padding(EdgeInsets(top: 6, leading: 4, bottom: 4, trailing: 4))
      .frame(minWidth: 80)
      .background {
        RowGround(open: window.selected == agent.id, picked: sidebar.selection.contains(agent.id), hovering: hovering || lit, look: look)
      }
      .overlay { CycleRing(on: sidebar.cycle?.next == agent.id, look: look) }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .contextMenu { RowMenu(agent: agent) }
    .onDrag {
      sidebar.begin(.pin(agent.id))
      return .sidebarItem(agent.id)
    }
    .id(agent.id)
    .accessibilityLabel(agent.hasUnread ? "\(agent.name), Unread activity" : agent.name)
  }

  /** The butterfly's corner: unread (blue), else at work (green). */
  private func cornerDot(_ look: Look) -> Color? {
    if agent.hasUnread { return look.unread }
    if agent.isRunning { return look.working }
    return nil
  }
}

// MARK: Sections

/**
 * A section (`sand-agents-section`, C06–C09): its header, then, open, its rows
 * 4 below and 4 apart, or "Drag chats here" (12 on 16, 40%, padded 6 8)
 * when it has none. A section a drop would land in greys (8 round); a
 * section dragged over another shows a hairline where it would go.
 */
private struct SectionBlock: View {
  let section: SidebarSections.Shown
  let lit: Bool
  let line: VerticalEdge?
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    VStack(spacing: 0) {
      SectionHeader(section: section)
      if !section.isCollapsed {
        VStack(spacing: 4) {
          if section.agents.isEmpty {
            Text(SidebarSections.emptySection)
              .font(.system(size: 12))
              .foregroundStyle(look.inkTertiary)
              .padding(.vertical, 6)
              .padding(.horizontal, 8)
              .frame(maxWidth: .infinity, alignment: .leading)
          } else {
            ForEach(section.agents) { agent in
              AgentRow(agent: agent, rail: false)
            }
          }
        }
        .padding(.top, 4)
        .transition(.opacity)
      }
    }
    .background(lit ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 8))
    .overlay(alignment: line == .bottom ? .bottom : .top) {
      if line != nil {
        Rectangle().fill(look.ink.opacity(0.3)).frame(height: 1).allowsHitTesting(false)
      }
    }
  }
}

/**
 * A section's header (`sand-agents-section__header`, C08, C09): 30 high,
 * padded 8 8 6, 6 round, its name (12 on 16, 60%), its count at the right
 * while folded, and under the pointer a chevron (12 in 16, 4 from the
 * count; pointing down while open) on a grey ground. A click folds or opens
 * it; the right click has the section's menu, and the header drags to
 * reorder. "Unassigned" has neither menu nor drag.
 */
private struct SectionHeader: View {
  let section: SidebarSections.Shown
  @Environment(AppStore.self) private var store
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme
  @State private var hovering = false

  var body: some View {
    let look = Look(scheme)
    let renaming = sidebar.renamingSection == section.id && !section.isUnassigned
    if renaming {
      HeaderLine(count: section.isCollapsed ? section.agents.count : nil, folded: section.isCollapsed, hovering: false, look: look) {
        NameField(initial: section.name, size: 12, line: 16) { name in
          SidebarActions.renameSection(section.id, to: name, store: store)
        } exit: {
          if sidebar.renamingSection == section.id { sidebar.renamingSection = nil }
        }
        .accessibilityLabel("Rename section")
      }
    } else if section.isUnassigned {
      header(look)
    } else {
      header(look)
        .contextMenu { SectionMenu(id: section.id, name: section.name) }
        .onDrag {
          sidebar.begin(.section(section.id))
          return .sidebarItem(section.id)
        }
    }
  }

  private func header(_ look: Look) -> some View {
    Button {
      sidebar.fold(section.id)
    } label: {
      HeaderLine(count: section.isCollapsed ? section.agents.count : nil, folded: section.isCollapsed, hovering: hovering, look: look) {
        Text(section.name)
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .lineLimit(1)
          .truncationMode(.tail)
      }
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel(section.name)
    .accessibilityValue(section.isCollapsed ? "Folded" : "Open")
  }
}

/** The header's line: the name (or its field), the folded count, the chevron under the pointer. */
private struct HeaderLine<Name: View>: View {
  let count: Int?
  let folded: Bool
  let hovering: Bool
  let look: Look
  @ViewBuilder let label: () -> Name

  var body: some View {
    HStack(spacing: 0) {
      label()
        .frame(maxWidth: .infinity, alignment: .leading)
      if let count {
        Text("\(count)")
          .font(.system(size: 12))
          .monospacedDigit()
          .foregroundStyle(look.inkSecondary)
      }
      if hovering {
        Image(systemName: "chevron.right")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .rotationEffect(.degrees(folded ? 0 : 90))
          .frame(width: 16, height: 16)
          .padding(.leading, 4)
      }
    }
    .frame(height: 16)
    .padding(EdgeInsets(top: 8, leading: 8, bottom: 6, trailing: 8))
    .background(hovering ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
    .contentShape(Rectangle())
  }
}

/** Hidden Agents at the list's foot (C12), in a section header's look with the count: it opens the Hidden Agents dialog. */
private struct HiddenFoot: View {
  let count: Int
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme
  @State private var hovering = false

  var body: some View {
    let look = Look(scheme)
    Button {
      sidebar.showsHidden = true
    } label: {
      HeaderLine(count: count, folded: true, hovering: hovering, look: look) {
        Text("Hidden Agents")
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
      }
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel("Hidden Agents, \(count)")
  }
}

// MARK: A row

/**
 * One row (`sand-agent-item`): the live butterfly (36) and, 8 away, the
 * name (14, medium), the title in blue (11), the time at the right (12,
 * 40%), and under them the last line (13, 60%): "Waiting for you: …" when
 * the agent waits on the person, else "Draft: …" when something is typed
 * and not sent in another agent's chat. The open agent's row is the white
 * card; a picked row the blue wash (C11); under the pointer, grey; Control-
 * Tab's row a 2-point blue ring inside. Unread is a blue dot in the
 * time's place; at work, a green dot on the butterfly's corner. A double
 * click renames it in place (C10). On the rail the row is the butterfly
 * alone, unread on its corner.
 */
struct AgentRow: View {
  let agent: Agent
  let rail: Bool
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme
  @State private var hovering = false

  var body: some View {
    let look = Look(scheme)
    let renaming = !rail && sidebar.renamingAgent == agent.id
    Group {
      if renaming {
        content(look, renaming: true)
      } else {
        Button {
          sidebar.click(agent.id, store: store, window: window)
        } label: {
          content(look, renaming: false)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
          TapGesture(count: 2).onEnded {
            guard !rail, NSEvent.modifierFlags.intersection([.command, .shift]).isEmpty else { return }
            sidebar.renamingAgent = agent.id
          }
        )
        .contextMenu { RowMenu(agent: agent) }
        .onDrag {
          sidebar.begin(.agent(agent.id))
          return .sidebarItem(agent.id)
        }
      }
    }
    .frame(maxWidth: .infinity)
    .onHover { hovering = $0 }
    .id(agent.id)
    .accessibilityLabel(agent.hasUnread ? "\(agent.name), Unread activity" : agent.name)
  }

  private func content(_ look: Look, renaming: Bool) -> some View {
    HStack(spacing: 8) {
      avatar(look)
      if !rail { details(look, renaming: renaming) }
    }
    .padding(rail ? 9 : 8)
    .frame(width: rail ? 54 : nil, height: 54, alignment: .leading)
    .frame(maxWidth: rail ? nil : .infinity, alignment: .leading)
    .background {
      RowGround(open: window.selected == agent.id, picked: sidebar.selection.contains(agent.id), hovering: hovering, look: look)
    }
    .overlay { CycleRing(on: sidebar.cycle?.next == agent.id, look: look) }
    .contentShape(Rectangle())
  }

  private func avatar(_ look: Look) -> some View {
    AgentMark(agent: agent, agents: store.agents, size: 36, live: true)
      .overlay(alignment: .topLeading) {
        if let dot = cornerDot(look) {
          Circle().fill(dot).frame(width: 8, height: 8).offset(x: 26, y: 26)
        }
      }
  }

  /** The butterfly's corner: at work (green); on the rail, unread first (blue). */
  private func cornerDot(_ look: Look) -> Color? {
    if rail && agent.hasUnread { return look.unread }
    if agent.isRunning { return look.working }
    return nil
  }

  /** The second line (`sidebar-agent-item.tsx`): waiting for the person, else a draft in another chat, else the last line. */
  private var preview: String {
    if agent.awaitingUserResponse, let reason = agent.waitingReason, !reason.isEmpty { return agent.previewLine }
    if window.selected != agent.id, let draft = store.drafts[agent.id] {
      let flat = draft.split(whereSeparator: \.isWhitespace).joined(separator: " ")
      if !flat.isEmpty { return "Draft: \(flat)" }
    }
    return agent.previewLine
  }

  private func details(_ look: Look, renaming: Bool) -> some View {
    let titled = !agent.isGroup && !agent.title.isEmpty
    return VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        if renaming {
          NameField(initial: agent.name, size: 14, line: 20) { name in
            Task { await store.renameAgent(agent.id, to: name) }
          } exit: {
            if sidebar.renamingAgent == agent.id { sidebar.renamingAgent = nil }
          }
          .accessibilityLabel("Rename agent")
        } else {
          Text(agent.name)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .truncationMode(.tail)
            .layoutPriority(1)
        }
        if titled {
          Text(agent.title)
            .font(.system(size: 11))
            .tracking(0.055)
            .foregroundStyle(look.blue)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.vertical, 3)
            .padding(.horizontal, 1)
        }
        Spacer(minLength: 0)
        if !renaming && !agent.hasUnread, let time = agent.lastActivityAt {
          Text(Chat.listTime(Date(timeIntervalSince1970: time / 1000)))
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
            .lineLimit(1)
            .fixedSize()
        }
      }
      .frame(height: titled ? 22 : 20)
      let line = preview
      if !line.isEmpty {
        Text(line)
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(height: 18)
          .help(line)
      }
    }
    .padding(.trailing, agent.hasUnread ? 16 : 0)
    .frame(maxWidth: .infinity, alignment: .leading)
    .overlay(alignment: .trailing) {
      if agent.hasUnread {
        Circle().fill(look.unread).frame(width: 8, height: 8)
      }
    }
  }
}

/**
 * A row's or tile's ground: the open agent's white card (a hairline and a
 * soft shadow; white at 12% on dark), a picked row's blue wash (`#376ca3`
 * at 33.5%, `#6188b2` at 45.7% on dark), grey under the pointer.
 */
struct RowGround: View {
  let open: Bool
  let picked: Bool
  let hovering: Bool
  let look: Look

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: look.rowRadius)
    if picked {
      shape.fill(look.dark ? Color(hex: 0x6188b2, opacity: 0.457) : Color(hex: 0x376ca3, opacity: 0.335))
    } else if open {
      shape
        .fill(look.rowSelected)
        .overlay { shape.inset(by: -0.25).stroke(look.rowSelectedHairline, lineWidth: 0.5) }
        .shadow(color: look.rowSelectedShadow, radius: 1, x: 0, y: 1)
    } else if hovering {
      shape.fill(look.rowHover)
    }
  }
}

/** Control-Tab's row: a 2-point ring of the window's blue, inside the row. */
private struct CycleRing: View {
  let on: Bool
  let look: Look

  var body: some View {
    if on {
      RoundedRectangle(cornerRadius: look.rowRadius)
        .strokeBorder(look.unread, lineWidth: 2)
        .allowsHitTesting(false)
    }
  }
}

/**
 * A name typed over in place (a row's, 14 on 20 at 500; a section's, 12 on
 * 16 at 500): it opens with the name chosen; Return or leaving it keeps a
 * changed, non-empty name; Escape puts the old one back.
 */
struct NameField: View {
  let initial: String
  let size: CGFloat
  let line: CGFloat
  let commit: (String) -> Void
  let exit: () -> Void
  @State private var text: String
  @State private var done = false
  @FocusState private var focused: Bool
  @Environment(\.colorScheme) private var scheme

  init(initial: String, size: CGFloat, line: CGFloat, commit: @escaping (String) -> Void, exit: @escaping () -> Void) {
    self.initial = initial
    self.size = size
    self.line = line
    self.commit = commit
    self.exit = exit
    _text = State(initialValue: initial)
  }

  var body: some View {
    TextField("", text: $text)
      .textFieldStyle(.plain)
      .font(.system(size: size, weight: .medium))
      .foregroundStyle(Look(scheme).ink)
      .frame(height: line)
      .focused($focused)
      .onSubmit { finish(keep: true) }
      .onExitCommand { finish(keep: false) }
      .onChange(of: focused) { _, now in if !now { finish(keep: true) } }
      .task {
        // Focused once it is in the window (a moment after it appears), its words chosen as a field chooses them on taking the keys.
        try? await Task.sleep(for: .milliseconds(30))
        focused = true
      }
  }

  private func finish(keep: Bool) {
    guard !done else { return }
    done = true
    let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if keep && !name.isEmpty && name != initial { commit(name) }
    exit()
  }
}

// MARK: Dropping

/** Where things are in the two drop zones, written as they lay out; read only when a drop moves. */
@MainActor
final class DropPlaces {
  var sections: [String: CGRect] = [:]
  var tiles: [String: CGRect] = [:]
}

/** The two drop zones' coordinate spaces. */
enum DropSpace {
  static let list = "sidebar-list"
  static let pins = "sidebar-pins"
}

/** What a drag over the list would do: unpin onto the list, go into a section, or (a section) go above or below another. */
enum ListTarget: Equatable {
  case list
  case section(String)
  case line(String, VerticalEdge)
}

enum PinTarget: Equatable {
  case grid
  case tile(String)
}

/**
 * Drops on the list (`sidebar-dnd`): a tile let go there is unpinned (into
 * the section it is let go on, if any); a row let go on a section moves into
 * it; a section let go on another goes before it (dragged up) or after it
 * (dragged down). "Unassigned" stays last.
 */
private struct ListDrop: DropDelegate {
  let sidebar: SidebarState
  let store: AppStore
  let places: DropPlaces
  let sections: [SidebarSections.Shown]
  @Binding var target: ListTarget?

  func validateDrop(info: DropInfo) -> Bool {
    MainActor.assumeIsolated { sidebar.dragging != nil }
  }

  func dropEntered(info: DropInfo) {
    let point = info.location
    MainActor.assumeIsolated { target = aim(at: point) }
  }

  func dropUpdated(info: DropInfo) -> DropProposal? {
    let point = info.location
    let lands = MainActor.assumeIsolated { () -> Bool in
      let aimed = aim(at: point)
      if aimed != target { target = aimed }
      return aimed != nil
    }
    return DropProposal(operation: lands ? .move : .forbidden)
  }

  func dropExited(info: DropInfo) {
    MainActor.assumeIsolated { target = nil }
  }

  func performDrop(info: DropInfo) -> Bool {
    let point = info.location
    return MainActor.assumeIsolated {
      let aimed = aim(at: point)
      target = nil
      guard let dragged = sidebar.dragging, let aimed else { return false }
      sidebar.dragging = nil
      switch (dragged, aimed) {
      case (.pin(let id), .list):
        SidebarActions.pin(id, false, store: store)
      case (.pin(let id), .section(let section)):
        SidebarActions.pin(id, false, store: store)
        store.editSections { SidebarSections.assign($0, agentIds: [id], to: section) }
      case (.agent(let id), .section(let section)):
        let ids = sidebar.selection.targets(for: id).filter { !store.pinnedIds.contains($0) }
        SidebarActions.move(ids, to: section, store: store, sidebar: sidebar)
      case (.section(let id), .line(let other, let edge)):
        store.editSections { SidebarSections.move($0, id: id, to: other, before: edge == .top) }
      default:
        return false
      }
      return true
    }
  }

  /** What letting go here would do, or nil when nothing. */
  @MainActor
  private func aim(at point: CGPoint) -> ListTarget? {
    guard let dragged = sidebar.dragging else { return nil }
    let under = sections.first { places.sections[$0.id]?.contains(point) == true }
    switch dragged {
    case .pin:
      if let under { return .section(under.id) }
      return .list
    case .agent(let id):
      // Into another section; its own section takes nothing.
      guard let under, SidebarSections.sectionId(of: id, in: store.sidebarSections ?? []) != under.id else { return nil }
      return .section(under.id)
    case .section(let id):
      guard let under, !under.isUnassigned, under.id != id,
            let from = sections.firstIndex(where: { $0.id == id }),
            let to = sections.firstIndex(where: { $0.id == under.id }) else { return nil }
      return .line(under.id, to < from ? .top : .bottom)
    }
  }
}

/** Drops on the pins: a row is pinned (at the tile it is let go on); a tile takes the place of the tile it is let go on. */
private struct PinDrop: DropDelegate {
  let sidebar: SidebarState
  let store: AppStore
  let places: DropPlaces
  let pins: [String]
  @Binding var target: PinTarget?

  func validateDrop(info: DropInfo) -> Bool {
    MainActor.assumeIsolated {
      switch sidebar.dragging {
      case .agent, .pin: return true
      default: return false
      }
    }
  }

  func dropEntered(info: DropInfo) {
    let point = info.location
    MainActor.assumeIsolated { target = aim(at: point) }
  }

  func dropUpdated(info: DropInfo) -> DropProposal? {
    let point = info.location
    let lands = MainActor.assumeIsolated { () -> Bool in
      let aimed = aim(at: point)
      if aimed != target { target = aimed }
      return aimed != nil
    }
    return DropProposal(operation: lands ? .move : .forbidden)
  }

  func dropExited(info: DropInfo) {
    MainActor.assumeIsolated { target = nil }
  }

  func performDrop(info: DropInfo) -> Bool {
    let point = info.location
    return MainActor.assumeIsolated {
      let aimed = aim(at: point)
      target = nil
      guard let dragged = sidebar.dragging, aimed != nil else { return false }
      sidebar.dragging = nil
      let place = tileIndex(at: point)
      switch dragged {
      case .agent(let id):
        Task {
          await store.setPinned(id, true)
          if let place { await store.movePin(id, to: place) }
        }
      case .pin(let id):
        guard let place else { return false }
        Task { await store.movePin(id, to: place) }
      case .section:
        return false
      }
      return true
    }
  }

  @MainActor
  private func tileIndex(at point: CGPoint) -> Int? {
    pins.firstIndex { places.tiles[$0]?.contains(point) == true }
  }

  @MainActor
  private func aim(at point: CGPoint) -> PinTarget? {
    switch sidebar.dragging {
    case .agent(let id):
      return pins.contains(id) ? nil : .grid
    case .pin(let id):
      guard let index = tileIndex(at: point), pins[index] != id else { return nil }
      return .tile(pins[index])
    default:
      return nil
    }
  }
}
