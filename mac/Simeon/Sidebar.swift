import AppKit
import SwiftUI
import SimeonCore

/**
 * The sidebar's width as the Electron window keeps it (`ui-layout`): 280 at
 * first, dragged between 240 and 400, its rail 88 wide. It folds to its rail
 * when the person folds it (⌘B, or dragging it under 210), and by itself
 * whenever the chat beside it would be narrower than 424 (`can`).
 */
@MainActor
@Observable
final class SidebarLayout {
  static let firstWidth: CGFloat = 280
  static let narrowest: CGFloat = 240
  static let widest: CGFloat = 400
  static let railWidth: CGFloat = 88
  /** The chat is never narrower than this while the sidebar is open (`dme`). */
  static let chatMinimum: CGFloat = 424
  /** Dragged under this, the sidebar folds (`Ult`); folded, it opens again from 10 more (`GFe`). */
  static let foldBelow: CGFloat = 210
  /** The fold and unfold: 0.2 s on the window's curve. */
  static let motion = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.2)

  var expandedWidth: CGFloat = {
    let saved = UserDefaults.standard.double(forKey: SidebarLayout.widthKey)
    return saved > 0 ? min(max(CGFloat(saved), SidebarLayout.narrowest), SidebarLayout.widest) : SidebarLayout.firstWidth
  }() {
    didSet { UserDefaults.standard.set(Double(expandedWidth), forKey: Self.widthKey) }
  }

  var isCollapsed: Bool = UserDefaults.standard.bool(forKey: SidebarLayout.collapsedKey) {
    didSet { UserDefaults.standard.set(isCollapsed, forKey: Self.collapsedKey) }
  }

  private static let widthKey = "simeon.sidebar.width"
  private static let collapsedKey = "simeon.sidebar.collapsed"

  /** Shown as its rail: folded, or the window too narrow for it open (`DCe`). */
  func showsRail(windowWidth: CGFloat) -> Bool {
    isCollapsed || windowWidth < expandedWidth + Self.chatMinimum
  }

  func width(windowWidth: CGFloat) -> CGFloat {
    showsRail(windowWidth: windowWidth) ? Self.railWidth : expandedWidth
  }

  /** ⌘B. */
  func toggle() {
    withAnimation(Self.motion) { isCollapsed.toggle() }
  }

  /** The edge dragged to `x` from the sidebar's left (`kan`). */
  func drag(to x: CGFloat, windowWidth: CGFloat) {
    let room = windowWidth - Self.chatMinimum
    let rail = showsRail(windowWidth: windowWidth)
    if rail ? (x < Self.foldBelow + 10 || room < Self.foldBelow + 10) : x < Self.foldBelow {
      if !rail { withAnimation(Self.motion) { isCollapsed = true } }
      return
    }
    guard room >= Self.narrowest else { return }
    let width = max(Self.narrowest, min(Self.widest, min(x, room)))
    if rail {
      withAnimation(Self.motion) { expandedWidth = width; isCollapsed = false }
    } else {
      expandedWidth = width
      isCollapsed = false
    }
  }
}

/**
 * The agents' sidebar (`aside.sand-agents-sidebar`, reference B01, B07),
 * measured at 1040 × 760: a 60-point head with search and new chat at its
 * right, the rows (54 high, 4 apart, 12 from the sides), and its foot with
 * the account's initials and Connect apps. Over the Mac's sidebar material,
 * painted at 93%, with a hairline at its right edge.
 */
struct Sidebar: View {
  let rail: Bool
  let width: CGFloat
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        if rail {
          Color.clear
            .frame(height: 60)
            .background(WindowDragArea())
        } else {
          SidebarHead()
        }
        AgentList(rail: rail)
        if rail {
          RailFoot()
        } else {
          SidebarFoot()
        }
      }
      .frame(width: width - 0.5)
      Rectangle()
        .fill(look.sidebarEdge)
        .frame(width: 0.5)
    }
    .frame(width: width)
    .background {
      ZStack {
        SidebarMaterial()
        look.sidebarPaint
      }
    }
  }
}

// MARK: The head and the foot

/** Search and new chat, 40 round, 10 apart, 12 from the right edge (`sand-agents-sidebar__new-actions`). */
private struct SidebarHead: View {
  var body: some View {
    HStack(spacing: 10) {
      Spacer(minLength: 0)
      SearchDisc()
      NewChatDisc()
    }
    .padding(.trailing, 12)
    .frame(height: 60)
    .background(WindowDragArea())
  }
}

/** The account's initials (32) and Connect apps beside them (`sand-agents-sidebar__footer`). */
private struct SidebarFoot: View {
  var body: some View {
    HStack(spacing: 8) {
      AccountDisc()
      ConnectApps()
      Spacer(minLength: 0)
    }
    .padding(.top, 2)
    .padding(.horizontal, 12)
    .padding(.bottom, 12)
  }
}

/** The rail's foot: search, new chat and the initials stacked, 10 apart, 8 from the bottom (`simeon-rail-discs`). */
private struct RailFoot: View {
  var body: some View {
    VStack(spacing: 10) {
      SearchDisc()
      NewChatDisc()
      AccountDisc()
    }
    .frame(maxWidth: .infinity)
    .padding(.bottom, 8)
  }
}

/** One of the window's round buttons, in Apple's glass. */
private struct Disc<Content: View>: View {
  let size: CGFloat
  let help: String
  let action: () -> Void
  @ViewBuilder let label: () -> Content

  var body: some View {
    Button(action: action) {
      label()
        .frame(width: size, height: size)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular, in: .circle)
    .help(help)
    .accessibilityLabel(help)
  }
}

/** The disc's icon colour: black at 78% (white at 86% on dark). */
private func discInk(_ scheme: ColorScheme) -> Color {
  scheme == .dark ? Color.white.opacity(0.86) : Color.black.opacity(0.78)
}

/** Search (⌘K): the search panel comes with step 4 (mac/STEPS.md). */
private struct SearchDisc: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Disc(size: 40, help: "Search", action: {}) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(discInk(scheme))
    }
  }
}

/** New chat (⌘N): the To: line comes with step 5 (mac/STEPS.md). */
private struct NewChatDisc: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Disc(size: 40, help: "New chat", action: {}) {
      Image(systemName: "square.and.pencil")
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(discInk(scheme))
    }
  }
}

/** The account's initials (`Open account menu`): the menu comes with step 10 (mac/STEPS.md). */
private struct AccountDisc: View {
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    Disc(size: 32, help: "Open account menu", action: {}) {
      Text(store.account?.initials ?? "")
        .font(.system(size: 12, weight: .medium))
        .tracking(0.24)
        .foregroundStyle(look.initials)
    }
  }
}

/**
 * Connect apps (`sand-agents-sidebar__plugins`): 15, medium, the window's
 * blue, then Gmail, Calendar and Drive on three white tiles, the first
 * turned 7° left, the last 7° right. The Plugins window comes with step 9
 * (mac/STEPS.md).
 */
private struct ConnectApps: View {
  @State private var hovering = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    Button {} label: {
      HStack(spacing: 10) {
        Text("Connect apps")
          .font(.system(size: 15, weight: .medium))
          .tracking(-0.075)
          .foregroundStyle(hovering ? look.blueHover : look.blue)
          .fixedSize()
        HStack(spacing: -4) {
          LogoTile(image: "Gmail", turn: -7, look: look)
          LogoTile(image: "GoogleCalendar", turn: 0, look: look)
          LogoTile(image: "GoogleDrive", turn: 7, look: look)
        }
      }
      .padding(.horizontal, 8)
      .frame(height: 32)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

private struct LogoTile: View {
  let image: String
  let turn: Double
  let look: Look

  var body: some View {
    Image(image)
      .resizable()
      .interpolation(.high)
      .aspectRatio(contentMode: .fit)
      .frame(width: 17)
      .frame(width: 26, height: 26)
      .background(look.tile, in: RoundedRectangle(cornerRadius: 7))
      .overlay {
        RoundedRectangle(cornerRadius: 7)
          .inset(by: -0.5)
          .stroke(look.tileHairline, lineWidth: 1)
      }
      .shadow(color: look.tileShadow, radius: 1, x: 0, y: 1)
      .rotationEffect(.degrees(turn))
  }
}

// MARK: The rows

/** The agents in the window's order (pins first, then the list; SimeonCore's `SidebarSections.order`). */
private struct AgentList: View {
  let rail: Bool
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window

  var body: some View {
    let visible = store.agents.filter { !$0.isHidden }
    let order = SidebarSections.order(agents: visible, pinnedIds: store.pinnedIds, sections: store.sidebarSections ?? [], collapsed: [])
    let byId = Dictionary(visible.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    ScrollView {
      LazyVStack(spacing: 4) {
        ForEach(order, id: \.self) { id in
          if let agent = byId[id] {
            AgentRow(agent: agent, agents: store.agents, rail: rail, selected: window.selected == id) {
              window.open(id, store: store)
            }
          }
        }
      }
      .padding(EdgeInsets(top: 4, leading: 12, bottom: 24, trailing: 12))
    }
    .scrollIndicators(.automatic)
    .onAppear { window.chooseFirst(order, store: store) }
    .onChange(of: order) { _, next in window.chooseFirst(next, store: store) }
  }
}

/**
 * One row (`sand-agent-item`): the butterfly (36) and, beside it 8 away,
 * the name (14, medium), the title in the window's blue (11), the time at
 * the right (12, 40%), and under them the last line (13, 60%). The open
 * agent's row is a white card (14 round; 10 and white at 12% on dark), a
 * row under the pointer grey. Unread is a blue dot at the right, in the
 * time's place; at work, a green dot on the butterfly's corner. On the rail
 * the row is the butterfly alone, unread on its corner.
 */
private struct AgentRow: View {
  let agent: Agent
  let agents: [Agent]
  let rail: Bool
  let selected: Bool
  let onOpen: () -> Void
  @State private var hovering = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    Button(action: onOpen) {
      HStack(spacing: 8) {
        avatar(look)
        if !rail { details(look) }
      }
      .padding(rail ? 9 : 8)
      .frame(width: rail ? 54 : nil, height: 54, alignment: .leading)
      .frame(maxWidth: rail ? nil : .infinity, alignment: .leading)
      .background { rowGround(look) }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity)
    .onHover { hovering = $0 }
    .accessibilityLabel(agent.hasUnread ? "\(agent.name), Unread activity" : agent.name)
  }

  private func avatar(_ look: Look) -> some View {
    AgentMark(agent: agent, agents: agents, size: 36)
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

  private func details(_ look: Look) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 6) {
        Text(agent.name)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .layoutPriority(1)
        if !agent.isGroup && !agent.title.isEmpty {
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
        if !agent.hasUnread, let time = agent.lastActivityAt {
          Text(Chat.listTime(Date(timeIntervalSince1970: time / 1000)))
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
            .lineLimit(1)
            .fixedSize()
        }
      }
      .frame(height: !agent.isGroup && !agent.title.isEmpty ? 22 : 20)
      let line = agent.previewLine
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

  @ViewBuilder
  private func rowGround(_ look: Look) -> some View {
    let shape = RoundedRectangle(cornerRadius: look.rowRadius)
    if selected {
      shape
        .fill(look.rowSelected)
        .overlay { shape.inset(by: -0.25).stroke(look.rowSelectedHairline, lineWidth: 0.5) }
        .shadow(color: look.rowSelectedShadow, radius: 1, x: 0, y: 1)
    } else if hovering {
      shape.fill(look.rowHover)
    }
  }
}

/** The sidebar's right edge, 12 wide over the hairline: drag to widen, narrow or fold it (`Resize sidebar`). */
struct SidebarResizeEdge: View {
  let windowWidth: CGFloat
  @Environment(SidebarLayout.self) private var layout

  var body: some View {
    Color.clear
      .frame(width: 12)
      .contentShape(Rectangle())
      .onHover { inside in
        if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() }
      }
      .gesture(
        // In the window's coordinates, where the sidebar starts at 0: the pointer's x is the sidebar's new width.
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
          .onChanged { value in layout.drag(to: value.location.x, windowWidth: windowWidth) }
      )
      .accessibilityLabel("Resize sidebar")
  }
}

/**
 * Lets the window be moved from where the Electron window's page is its
 * title bar (the sidebar's head, the chat's top), double-click zooming it
 * as a title bar does.
 */
struct WindowDragArea: NSViewRepresentable {
  func makeNSView(context: Context) -> NSView { DragView() }
  func updateNSView(_ view: NSView, context: Context) {}

  final class DragView: NSView {
    override var mouseDownCanMoveWindow: Bool { true }

    override func mouseDown(with event: NSEvent) {
      if event.clickCount == 2 {
        let action = UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") ?? "Maximize"
        if action == "Minimize" { window?.performMiniaturize(nil) } else if action != "None" { window?.performZoom(nil) }
      } else {
        window?.performDrag(with: event)
      }
    }
  }
}
