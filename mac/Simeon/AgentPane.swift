import AppKit
import SwiftUI
import SimeonCore

/**
 * The agent's pane on the window's right (`aside.sand-info-pane`, reference
 * I01–I07, B09), as the Electron window keeps it (`lan`/`e4e()`, `IDn`,
 * `E3n`): one pane for the window, open or closed and its width kept from
 * one launch to the next; drawn only while the chat keeps its 424 points
 * beside it and the new chat is closed, else kept open and drawn 0 wide.
 * Opening it folds an open sidebar to its rail and closing it opens the
 * sidebar again (`agent-pane-compacts-sidebar`); a window too narrow for it
 * beside the rail grows by what is missing, and shrinks back when it closes
 * if its width was not changed meanwhile.
 */
@MainActor
@Observable
final class PaneState {
  /** Its pages: Profile (`settings`), Routines, Computer (`overview`) and Channels (no tab of its own). */
  enum Section: Equatable { case profile, routines, computer, channels }

  static let defaultWidth: CGFloat = 480
  static let narrowest: CGFloat = 280
  static let widest: CGFloat = 480
  /** Dragged narrower than this, it closes when let go (`k3n`). */
  static let closeBelow: CGFloat = 244
  /** Width and fade: 0.24 s on the window's curve, the content 0.16 s; it stays 240 ms after closing (`T3n`). */
  static let motion = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.24)
  static let fade = Animation.easeInOut(duration: 0.16)
  static let linger = 0.24

  var isOpen: Bool = UserDefaults.standard.bool(forKey: PaneState.openKey) {
    didSet { UserDefaults.standard.set(isOpen, forKey: Self.openKey) }
  }
  var width: CGFloat = {
    let saved = UserDefaults.standard.double(forKey: PaneState.widthKey)
    return saved > 0 ? min(max(CGFloat(saved), PaneState.narrowest), PaneState.widest) : PaneState.defaultWidth
  }() {
    didSet { UserDefaults.standard.set(Double(width.rounded()), forKey: Self.widthKey) }
  }
  /** Whether opening it folded the sidebar, so closing it opens the sidebar again (`simeon.paneTookSidebar`). */
  private var tookSidebar: Bool = UserDefaults.standard.bool(forKey: PaneState.tookKey) {
    didSet { UserDefaults.standard.set(tookSidebar, forKey: Self.tookKey) }
  }

  var section: Section = .profile {
    didSet { if section != .routines { routineEditor = nil } }
  }
  /** The page is drawn: false 240 ms after closing, so the next opening starts on Profile. */
  var contentAlive = UserDefaults.standard.bool(forKey: PaneState.openKey)
  /** Drawn at all now (open, room for it, the new chat closed): set by the window. */
  var isVisible = false
  /** While the edge is dragged: the width shown, and whether letting go closes it. */
  var dragWidth: CGFloat?
  var dragCloses = false
  /** The width when the drag started: a plain click on the edge changes nothing. */
  @ObservationIgnored private var dragStart: CGFloat?

  /** The avatar editor, while it is open (7b), and where the avatar's button is in the window (a click on it is not "outside"). */
  var avatarEditor: AvatarEditorModel?
  var avatarTriggerFrame: CGRect = .zero

  func toggleAvatarEditor(for agent: Agent) {
    if avatarEditor?.agentId == agent.id { closeAvatarEditor() } else { avatarEditor = AvatarEditorModel(agentId: agent.id, isGroup: agent.isGroup) }
  }

  func closeAvatarEditor() {
    avatarEditor?.closeNow()
    avatarEditor = nil
  }

  /** The routine editor, while it is open (7c): it takes the whole page. Leaving Routines closes it. */
  var routineEditor: RoutineEditorModel?
  /** A routine's chip asked for its editor: opened when the agent's list has it (`W2n`). */
  var routineRequest: String?
  /** Test run's waits, for every routine. */
  @ObservationIgnored let runBlocks = RoutineRunBlocks()

  /** New Routine (nil) or a routine's row: its editor, afresh. */
  func openRoutine(_ routine: Routine?, agentId: String) {
    routineEditor = RoutineEditorModel(agentId: agentId, routine: routine)
  }

  /** Back to Routines, Delete, or the routine gone. */
  func backToRoutines() {
    routineEditor = nil
  }

  /** A routine's chip in the chat (`openAutomationDetail`): Routines, with that routine's editor once the list has it. */
  func openRoutine(_ routineId: String, for agentId: String, window: WindowState, store: AppStore, layout: SidebarLayout) {
    routineEditor = nil
    routineRequest = routineId
    open(.routines, for: agentId, window: window, store: store, layout: layout)
  }

  /** A page asked for another agent (Edit Profile), applied when that agent opens. */
  private var request: (agentId: String, section: Section)?
  /** The window grew for it: by how much, and its width after (`$lt`). */
  private var grew: (by: CGFloat, widthAfter: CGFloat)?
  @ObservationIgnored private var lingering: Task<Void, Never>?

  private static let openKey = "simeon.pane.open"
  private static let widthKey = "simeon.pane.width"
  private static let tookKey = "simeon.pane.tookSidebar"

  /** The window's width, the sidebar's and the chat's least, for the pane to fit (`uan`): sidebar + 424 + pane. */
  static func fits(windowWidth: CGFloat, sidebarWidth: CGFloat, paneWidth: CGFloat) -> Bool {
    windowWidth >= sidebarWidth + SidebarLayout.chatMinimum + paneWidth
  }

  // MARK: Opening and closing

  /** Opens on `section` (the openers' `I` and `A`): the window grows if the pane would not fit beside the rail; an open sidebar folds. */
  func open(_ section: Section = .profile, layout: SidebarLayout) {
    lingering?.cancel()
    self.section = section
    contentAlive = true
    // Kept open but without room (a narrow window): the window grows for it all the same.
    if !isVisible { growWindowIfNeeded() }
    guard !isOpen else { return }
    withAnimation(Self.motion) {
      if !layout.isCollapsed {
        tookSidebar = true
        layout.isCollapsed = true
      } else {
        tookSidebar = false
      }
      isOpen = true
    }
  }

  /**
   Close (×, Escape, the header's button): the sidebar opens again if the pane folded it; the window shrinks back if it grew for it.
   The pane slides shut first and the window follows when it has (the window shrinking first would cut the pane off at once).
   */
  func close(layout: SidebarLayout) {
    closeAvatarEditor()
    guard isOpen else { return }
    withAnimation(Self.motion) {
      isOpen = false
      if tookSidebar && layout.isCollapsed { layout.isCollapsed = false }
      tookSidebar = false
    }
    lingering?.cancel()
    lingering = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(PaneState.linger * 1_000_000_000))
      guard let self, !Task.isCancelled, !self.isOpen else { return }
      self.shrinkWindowIfGrown()
      self.contentAlive = false
      self.section = .profile
    }
  }

  /** The header's butterfly and name, ⌘⇧, (`toggleAgentSettingsAction`): shown → close, whatever page; else Profile. */
  func toggleSettings(layout: SidebarLayout) {
    if isVisible { close(layout: layout) } else { open(.profile, layout: layout) }
  }

  /** ⌘⇧I, ⌥⌘B and a thread's "View conversation details" (`sand.toggleInfo`): open → close (even while hidden for width); else the page it shows. */
  func toggleDetails(layout: SidebarLayout) {
    if isOpen { close(layout: layout) } else { open(section, layout: layout) }
  }

  /** A page for an agent that may not be the open one (Edit Profile): it opens there once that agent's chat does. */
  func open(_ section: Section, for agentId: String, window: WindowState, store: AppStore, layout: SidebarLayout) {
    if window.selected == agentId {
      open(section, layout: layout)
    } else {
      request = (agentId, section)
      open(section, layout: layout)
      window.choose(agentId, store: store)
    }
  }

  /** Another agent opened: its page starts on Profile (it is drawn afresh), or on the page asked for it. */
  func agentChanged(to agentId: String?) {
    closeAvatarEditor()
    routineEditor = nil
    if let request, request.agentId == agentId {
      section = request.section
    } else {
      section = .profile
      routineRequest = nil
    }
    request = nil
  }

  // MARK: The edge

  /** The edge dragged by `moved` points (left is wider): held at 280 below 244 (`w3n`). */
  func drag(moved: CGFloat, windowWidth: CGFloat, sidebarWidth: CGFloat) {
    if dragStart == nil { dragStart = width }
    let pointerWidth = (dragStart ?? width) - moved
    if pointerWidth < Self.closeBelow {
      dragCloses = true
      dragWidth = Self.narrowest
      return
    }
    dragCloses = false
    let room = min(Self.widest, windowWidth - SidebarLayout.chatMinimum - sidebarWidth)
    dragWidth = max(Self.narrowest, min(pointerWidth, max(Self.narrowest, room)))
  }

  /** Let go: below 244 it closes and keeps the width it had; else the new width is kept. */
  func endDrag(layout: SidebarLayout) {
    defer { dragWidth = nil; dragCloses = false; dragStart = nil }
    if dragCloses {
      close(layout: layout)
    } else if let dragWidth {
      width = dragWidth
    }
  }

  // MARK: The window

  private var mainWindow: NSWindow? { NSApp.keyWindow ?? NSApp.mainWindow }

  /** Beside the rail and the chat's 424 the pane does not fit: the window grows by what is missing (`dan`, `resizeWidthBy`), within its screen. */
  private func growWindowIfNeeded() {
    guard let window = mainWindow, !window.styleMask.contains(.fullScreen) else { return }
    let current = window.frame.width
    let missing = SidebarLayout.railWidth + SidebarLayout.chatMinimum + width - current
    guard missing > 0 else { return }
    var frame = window.frame
    frame.size.width += missing
    if let visible = window.screen?.visibleFrame {
      frame.size.width = min(frame.width, visible.width)
      if frame.maxX > visible.maxX { frame.origin.x = max(visible.minX, visible.maxX - frame.width) }
    }
    let by = frame.width - current
    guard by > 0 else { return }
    window.setFrame(frame, display: true, animate: true)
    grew = (by, frame.width)
  }

  /** ⌘B opening the sidebar beside the shown pane: the window grows by what the sidebar, the chat's 424 and the pane need (`jan`). */
  func makeRoomForSidebar(_ layout: SidebarLayout) {
    guard isVisible, layout.isCollapsed, let window = mainWindow, !window.styleMask.contains(.fullScreen) else { return }
    let missing = layout.expandedWidth + SidebarLayout.chatMinimum + width - window.frame.width
    guard missing > 0 else { return }
    var frame = window.frame
    frame.size.width += missing
    if let visible = window.screen?.visibleFrame {
      frame.size.width = min(frame.width, visible.width)
      if frame.maxX > visible.maxX { frame.origin.x = max(visible.minX, visible.maxX - frame.width) }
    }
    window.setFrame(frame, display: true, animate: true)
  }

  /** Closing: back by what it grew, if the window's width is still within 2 points of what the growing left (`zlt`). */
  private func shrinkWindowIfGrown() {
    defer { grew = nil }
    guard let grew, let window = mainWindow, abs(window.frame.width - grew.widthAfter) <= 2 else { return }
    var frame = window.frame
    frame.size.width -= grew.by
    window.setFrame(frame, display: true, animate: true)
  }
}

// MARK: - The pane

/**
 * The pane itself (`E3n`): it widens from the window's right edge over
 * 0.24 s while its page, laid out at its full width, slides in with it and
 * fades in over 0.16 s. On its left edge, inside it, the 10-point strip that
 * drags its width, with the half-point line that divides it from the chat.
 */
struct AgentPaneColumn: View {
  let agentId: String?
  /** The width it is drawn at (0 while closed or without room) and the width its page is laid out at. */
  let shownWidth: CGFloat
  let pageWidth: CGFloat
  let windowWidth: CGFloat
  let sidebarWidth: CGFloat
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    ZStack(alignment: .topLeading) {
      look.paneGround
      if pane.contentAlive {
        PanePage(agentId: agentId, width: pageWidth)
          .frame(width: pageWidth, alignment: .topLeading)
          .opacity(shownWidth > 0 ? 1 : 0)
          .animation(PaneState.fade, value: shownWidth > 0)
      }
      if shownWidth > 0 {
        PaneEdge(windowWidth: windowWidth, sidebarWidth: sidebarWidth, look: look)
      }
    }
    .frame(width: shownWidth, alignment: .leading)
    .frame(maxHeight: .infinity)
    .clipped()
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Conversation details")
    .accessibilityHidden(shownWidth == 0)
  }
}

/** The left edge (`b3n`): 10 points wide, a half-point line at its left in the faint stroke, darker under the pointer; dragging sets the width. */
private struct PaneEdge: View {
  let windowWidth: CGFloat
  let sidebarWidth: CGFloat
  let look: Look
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout
  @State private var hovering = false

  var body: some View {
    ZStack(alignment: .leading) {
      Color.clear
      Rectangle()
        .fill(hovering || pane.dragWidth != nil ? look.paneEdgeHover : look.paneEdge)
        .frame(width: 0.5)
        .animation(.easeInOut(duration: 0.12), value: hovering)
    }
    .frame(width: 10)
    .frame(maxHeight: .infinity)
    .contentShape(Rectangle())
    .onHover { inside in
      guard inside != hovering else { return }
      hovering = inside
      if inside { NSCursor.resizeLeftRight.push() } else { NSCursor.pop() }
    }
    .onDisappear {
      // Closed by a key with the pointer resting on it: the arrows go.
      if hovering { NSCursor.pop() }
      hovering = false
    }
    .gesture(
      // The pane's right edge is the window's: moving the edge left by n widens it by n.
      DragGesture(minimumDistance: 0, coordinateSpace: .global)
        .onChanged { value in pane.drag(moved: value.translation.width, windowWidth: windowWidth, sidebarWidth: sidebarWidth) }
        .onEnded { _ in pane.endDrag(layout: layout) }
    )
    .accessibilityLabel("Resize details")
  }
}

/**
 * The page (`p3n`): the top bar (44, Close at its right, the rest moves the
 * window), then the agent's page scrolling under it: its head, the three
 * tabs, the tab's body. Drawn afresh for each agent.
 */
private struct PanePage: View {
  let agentId: String?
  let width: CGFloat
  @Environment(AppStore.self) private var store
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    if let agentId, let agent = store.agent(agentId), pane.section == .routines, let editor = pane.routineEditor, editor.agentId == agentId {
      // A routine's editor (7c) takes the whole page, its own bars included.
      RoutineEditorPage(agent: agent, model: editor, width: width)
    } else {
      page(look: look)
    }
  }

  private func page(look: Look) -> some View {
    VStack(spacing: 0) {
      PaneTopBar(look: look) { pane.close(layout: layout) }
      if let agentId, let agent = store.agent(agentId) {
        ScrollView {
          AgentPage(agent: agent, look: look, contentWidth: max(0, width - 40))
            .padding(EdgeInsets(top: 6, leading: 20, bottom: 40, trailing: 20))
            .frame(width: width, alignment: .top)
        }
        .scrollIndicators(.automatic)
        .id(agentId)
      } else {
        // `y3n`: no agent open.
        Text("No agent selected.")
          .font(.system(size: 13))
          .foregroundStyle(look.inkTertiary)
          .padding(EdgeInsets(top: 28, leading: 12, bottom: 28, trailing: 12))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }
}

/** The pane's top bar (`Nmt`): 44 high, padded 12 a side; Close (28 × 28, round 6) at the right; the rest moves the window. */
private struct PaneTopBar: View {
  let look: Look
  let close: () -> Void

  var body: some View {
    ZStack {
      WindowDragArea()
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        PaneIconButton(systemImage: "xmark", label: "Close details", help: "Close", look: look, action: close)
      }
      .padding(.horizontal, 12)
    }
    .frame(height: 44)
  }
}

/** A ghost icon button of the pane's bars (`fr`, md): 28 × 28, round 6; the icon at 60% of the text, full and on the hover grey under the pointer. */
struct PaneIconButton: View {
  let systemImage: String
  let label: String
  let help: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 13, weight: .regular))
        .foregroundStyle(hovering ? look.ink : look.inkSecondary)
        .frame(width: 28, height: 28)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
    .help(help)
    .accessibilityLabel(label)
  }
}

// MARK: - The agent's page

/** `.simeon-pane`: the head, the tabs (32 above, 26 below), the body. */
private struct AgentPage: View {
  let agent: Agent
  let look: Look
  let contentWidth: CGFloat
  @Environment(PaneState.self) private var pane

  var body: some View {
    VStack(spacing: 0) {
      PaneHead(agent: agent, look: look, contentWidth: contentWidth)
      PaneTabs(look: look, width: contentWidth)
        .padding(.top, 32)
        .padding(.bottom, 26)
      Group {
        switch pane.section {
        case .profile:
          ProfileBody(agent: agent, look: look)
        case .routines:
          RoutinesBody(agent: agent, look: look)
        case .computer, .channels:
          // The computer (step 13) and channels (step 12) come with their parts.
          Color.clear.frame(height: 0)
        }
      }
      .frame(width: contentWidth, alignment: .top)
    }
    .frame(width: contentWidth)
    // The avatar editor (7b): 6 under the avatar (6 + 96 down the page), centred on it, over everything under it.
    .overlay(alignment: .top) {
      if let editor = pane.avatarEditor, editor.agentId == agent.id {
        AvatarEditorPopover(agent: agent, model: editor, width: min(294, contentWidth), look: look) { pane.closeAvatarEditor() }
          .background(OutsideClickCatcher(excluded: { pane.avatarTriggerFrame }) { pane.closeAvatarEditor() })
          .offset(y: 6 + 96 + 6)
      }
    }
  }
}

/**
 Closes what it is behind when a click lands outside it (and outside `excluded`, in the window's coordinates).
 With `swallows`, that click does nothing else (the window's full-window layer behind a popover); the window's own buttons still take it.
 */
struct OutsideClickCatcher: NSViewRepresentable {
  let excluded: () -> CGRect
  var swallows = false
  let onOutside: () -> Void

  func makeNSView(context: Context) -> CatchView {
    let view = CatchView()
    view.excluded = excluded
    view.swallows = swallows
    view.onOutside = onOutside
    return view
  }

  func updateNSView(_ view: CatchView, context: Context) {
    view.excluded = excluded
    view.swallows = swallows
    view.onOutside = onOutside
  }

  final class CatchView: NSView {
    var excluded: () -> CGRect = { .zero }
    var swallows = false
    var onOutside: () -> Void = {}
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
        let swallow = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window else { return false }
          let point = event.locationInWindow
          let mine = self.convert(self.bounds, to: nil)
          guard !mine.contains(point), !self.excluded().contains(point) else { return false }
          self.onOutside()
          // The close, minimise and zoom buttons are never covered.
          if let bar = self.window?.standardWindowButton(.closeButton)?.superview, bar.convert(bar.bounds, to: nil).contains(point) { return false }
          return self.swallows
        }
        return swallow ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}

/** Tells where it is in its window (bottom-left coordinates) as it is laid out. */
struct WindowFrameReader: NSViewRepresentable {
  let report: (CGRect) -> Void

  func makeNSView(context: Context) -> ReaderView {
    let view = ReaderView()
    view.report = report
    return view
  }

  func updateNSView(_ view: ReaderView, context: Context) {
    view.report = report
    view.tell()
  }

  final class ReaderView: NSView {
    var report: (CGRect) -> Void = { _ in }
    private var last: CGRect = .zero

    func tell() {
      guard window != nil else { return }
      let frame = convert(bounds, to: nil)
      guard frame != last else { return }
      last = frame
      DispatchQueue.main.async { [report] in report(frame) }
    }

    override func layout() {
      super.layout()
      tell()
    }

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      tell()
    }
  }
}

/**
 * The head (`.simeon-pane__head`, padded 6 above): the avatar's button (96),
 * the name 14 under it (22/28, medium, `-0.022em`) and, when it has one, the
 * title 1 under that (15/20, the pane's grey).
 */
private struct PaneHead: View {
  let agent: Agent
  let look: Look
  let contentWidth: CGFloat
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 0) {
      AvatarTrigger(agent: agent, look: look)
      Text(agent.name)
        .font(.system(size: 22, weight: .medium))
        .tracking(-0.484)
        .lineSpacing(LineBox.extra(size: 22, weight: .medium, lineHeight: 28))
        .foregroundStyle(look.paneInk)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: contentWidth)
        .frame(height: 28)
        .padding(.top, 14)
      if !agent.isGroup, !agent.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Text(agent.title)
          .font(.system(size: 15))
          .tracking(-0.16)
          .foregroundStyle(look.paneInk2)
          .lineLimit(1)
          .frame(height: 20)
          .padding(.top, 1)
      }
    }
    .padding(.top, 6)
    .frame(maxWidth: .infinity)
  }
}

/**
 * The avatar's button (`f3n`): a 96-point disc (white, `#2c2c2e` on dark,
 * a hairline inside) holding the agent's butterfly at 64 (a group's members
 * as its avatar draws them), and at its lower right the 32-point pencil disc
 * ringed 3 points in the pane's colour, a shade darker under the pointer.
 * It opens and closes the avatar editor (7b).
 */
private struct AvatarTrigger: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(PaneState.self) private var pane
  @State private var hovering = false

  var body: some View {
    let staged = pane.avatarEditor?.agentId == agent.id ? pane.avatarEditor?.staged : nil
    Button { pane.toggleAvatarEditor(for: agent) } label: {
      ZStack {
        Circle().fill(look.paneAvatarDisc)
        if let staged {
          // A colour picked for an agent with a picture, shown until Set avatar.
          ButterflyMark(palette: AgentPalette.named(staged), size: 64)
        } else if let picture = AvatarPictures.image(agent.avatarDataURL) {
          Image(nsImage: picture)
            .resizable()
            .aspectRatio(contentMode: .fill)
            .frame(width: 96, height: 96)
        } else {
          // The butterfly at 64, or a group's members in its 64-point frame, centred in the disc.
          AgentMark(agent: agent, agents: store.agents, size: 64)
        }
        Circle().strokeBorder(look.paneHairline, lineWidth: 1)
      }
      .frame(width: 96, height: 96)
      .clipShape(Circle())
      .overlay(alignment: .bottomTrailing) {
        PencilGlyph()
          .stroke(look.paneInk, style: StrokeStyle(lineWidth: 1.9 * 18 / 24, lineCap: .round, lineJoin: .round))
          .frame(width: 18, height: 18)
          .frame(width: 32, height: 32)
          .background(Circle().fill(hovering ? look.paneFill2 : look.paneFill))
          .background(Circle().fill(look.paneGround).padding(-3))
          .offset(x: 3, y: 3)
          .animation(.easeInOut(duration: 0.15), value: hovering)
      }
      .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .background(WindowFrameReader { pane.avatarTriggerFrame = $0 })
    .help("Edit Avatar")
    .accessibilityLabel("Edit agent avatar")
  }
}

/** The pencil (`M15.6 4.6a2.1 2.1 0 0 1 3 3L8.4 17.8l-4 1 1-4z`, `M13.9 6.3l3 3`) on a 24-point view. */
private struct PencilGlyph: Shape {
  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 24
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    var path = Path()
    path.move(to: p(15.6, 4.6))
    // The rounded end: half a turn from (15.6, 4.6) over the top right to (18.6, 7.6), about (17.1, 6.1).
    path.addArc(center: p(17.1, 6.1), radius: sqrt(4.5) * k, startAngle: .degrees(225), endAngle: .degrees(45), clockwise: false)
    path.addLine(to: p(8.4, 17.8))
    path.addLine(to: p(4.4, 18.8))
    path.addLine(to: p(5.4, 14.8))
    path.closeSubpath()
    path.move(to: p(13.9, 6.3))
    path.addLine(to: p(16.9, 9.3))
    return path
  }
}

// MARK: - The tabs

/**
 * The three tabs (`__simeonPaneSegments`): a 36-point pill track (padded 3,
 * the pane's fill), Profile, Routines and Computer as icons (19, stroke
 * 1.6), the chosen one's white pill sliding under it over 0.34 s; a short
 * line between two tabs unless one beside it is chosen. Each says its name
 * under the pointer.
 */
private struct PaneTabs: View {
  let look: Look
  let width: CGFloat
  @Environment(PaneState.self) private var pane

  private let tabs: [(section: PaneState.Section, name: String, glyph: TabGlyph.Kind)] = [
    (.profile, "Profile", .profile), (.routines, "Routines", .routines), (.computer, "Computer", .computer),
  ]

  var body: some View {
    let item = max(0, (width - 6) / 3)
    let chosen = tabs.firstIndex { $0.section == pane.section }
    ZStack(alignment: .leading) {
      Capsule().fill(look.paneFill)
      Capsule()
        .fill(look.paneThumb)
        .shadow(color: .black.opacity(0.06), radius: 1, x: 0, y: 1)
        .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
        .frame(width: item, height: 30)
        // On Channels (no tab of its own) it sits under Profile with no tab chosen.
        .offset(x: 3 + item * CGFloat(chosen ?? 0))
        .animation(.timingCurve(0.32, 0.72, 0, 1, duration: 0.34), value: chosen)
      // The lines between tabs 1 and 2, and 2 and 3.
      ForEach(1..<3, id: \.self) { index in
        Rectangle()
          .fill(look.paneSeparator)
          .frame(width: 1, height: 16)
          .offset(x: 3 + item * CGFloat(index) - 0.5)
          .opacity(chosen == index || chosen == index - 1 ? 0 : 1)
          .animation(.easeInOut(duration: 0.2), value: chosen)
      }
      HStack(spacing: 0) {
        ForEach(Array(tabs.enumerated()), id: \.offset) { index, tab in
          Button {
            // The computer's page comes with step 13.
            if tab.section != .computer { pane.section = tab.section }
          } label: {
            TabGlyph(kind: tab.glyph)
              .stroke(chosen == index ? look.paneInk : look.paneTabIdle, style: StrokeStyle(lineWidth: 1.6 * 19 / 24, lineCap: .round, lineJoin: .round))
              .frame(width: 19, height: 19)
              .animation(.easeInOut(duration: 0.2), value: chosen)
              .frame(width: item, height: 30)
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .help(tab.name)
          .accessibilityLabel(tab.name)
          .accessibilityAddTraits(chosen == index ? [.isSelected] : [])
        }
      }
      .padding(.horizontal, 3)
    }
    .frame(width: width, height: 36)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Agent")
  }
}

/** The tabs' icons, on a 24-point view. */
private struct TabGlyph: Shape {
  enum Kind { case profile, routines, computer }
  let kind: Kind

  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 24
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> CGRect { CGRect(x: rect.minX + (x - r) * k, y: rect.minY + (y - r) * k, width: 2 * r * k, height: 2 * r * k) }
    var path = Path()
    switch kind {
    case .profile:
      // `<circle cx=12 cy=8.2 r=3.6/>`, `M4.8 19.6c1.3-3.4 4-5.2 7.2-5.2s5.9 1.8 7.2 5.2`.
      path.addEllipse(in: circle(12, 8.2, 3.6))
      path.move(to: p(4.8, 19.6))
      path.addCurve(to: p(12, 14.4), control1: p(6.1, 16.2), control2: p(8.8, 14.4))
      path.addCurve(to: p(19.2, 19.6), control1: p(15.2, 14.4), control2: p(17.9, 16.2))
    case .routines:
      // `<circle cx=12 cy=12 r=8.2/>`, `M12 7.4V12l3.1 2`.
      path.addEllipse(in: circle(12, 12, 8.2))
      path.move(to: p(12, 7.4))
      path.addLine(to: p(12, 12))
      path.addLine(to: p(15.1, 14))
    case .computer:
      // `<rect x=3.2 y=4.4 width=17.6 height=12 rx=2.2/>`, `M8.8 19.8h6.4M12 16.4v3.4`.
      path.addRoundedRect(in: CGRect(x: rect.minX + 3.2 * k, y: rect.minY + 4.4 * k, width: 17.6 * k, height: 12 * k), cornerSize: CGSize(width: 2.2 * k, height: 2.2 * k))
      path.move(to: p(8.8, 19.8))
      path.addLine(to: p(15.2, 19.8))
      path.move(to: p(12, 16.4))
      path.addLine(to: p(12, 19.8))
    }
    return path
  }
}

// MARK: - Profile

/**
 * Profile (`h3n`): Name, Title (not for a group) and Description, each a
 * grey label (13/16) over its words (15/20) on a hairline that turns to the
 * text's colour while the field has the keys. A field is saved when it lets
 * go of the keys (Return does that for one line; in the description Return
 * is a new line); Escape puts the stored words back. An empty name is not
 * saved. The Chief of Staff's title and description are read only. Then, for
 * an agent, Notifications, 22 below.
 */
private struct ProfileBody: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let locked = Agent.chiefOfStaff(in: store.agents)?.id == agent.id
    VStack(alignment: .leading, spacing: 22) {
      VStack(alignment: .leading, spacing: 0) {
        PaneLineField(label: "Name", placeholder: "Bob", stored: agent.name, first: true, readOnly: false, look: look, required: true) { name in
          save(name: name)
        }
        if !agent.isGroup {
          PaneLineField(label: "Title", placeholder: "Describe what your agent does", stored: agent.title, first: false, readOnly: locked, look: look, required: false) { title in
            save(title: title)
          }
        }
        PaneDescriptionField(stored: agent.description, readOnly: locked && !agent.isGroup, look: look) { description in
          save(description: description)
        }
      }
      if !agent.isGroup {
        NotificationsCard(agent: agent, look: look)
      }
    }
  }

  /** `_Dn` → `updateAgent`: the name and description always, the title only when it is the field saved. */
  private func save(name: String? = nil, description: String? = nil, title: String? = nil) {
    let id = agent.id
    let current = store.agent(id) ?? agent
    Task { await store.saveProfileField(id, name: name ?? current.name, description: description ?? current.description, title: title) }
  }
}

/** A field's grey label (`Name`, `Title`, `Description`): 13/16, padded 14 above (none for the first) and 2 below. */
private struct PaneLabel: View {
  let text: String
  let first: Bool
  let look: Look

  var body: some View {
    Text(text)
      .font(.system(size: 13))
      .foregroundStyle(look.paneInk2)
      .frame(height: 16)
      .padding(.top, first ? 0 : 14)
      .padding(.bottom, 2)
  }
}

/** A one-line field (`Uwe`): padded 4 above and 12 below, its hairline under it. */
private struct PaneLineField: View {
  let label: String
  let placeholder: String
  let stored: String
  let first: Bool
  let readOnly: Bool
  let look: Look
  /** The name: empty, it goes back to what it was. */
  let required: Bool
  let commit: (String) -> Void
  @State private var draft = ""
  @FocusState private var focused: Bool
  /** `focused` kept past the field's going, which drops the keys without saying so. */
  @State private var editing = false
  /** What was last sent, until the stored words change: going and letting go of the keys both end in `done`, which sends once. */
  @State private var sent: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      PaneLabel(text: label, first: first, look: look)
      Group {
        if readOnly {
          Text(stored.isEmpty ? placeholder : stored)
            .foregroundStyle(stored.isEmpty ? look.panePlaceholder : look.paneInk)
            .textSelection(.enabled)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          TextField("", text: $draft, prompt: Text(placeholder).foregroundStyle(look.panePlaceholder))
            .textFieldStyle(.plain)
            .foregroundStyle(look.paneInk)
            .autocorrectionDisabled()
            .focused($focused)
            .focusEffectDisabled()
            .onSubmit { focused = false }
            .onExitCommand {
              draft = stored
              focused = false
            }
        }
      }
      .font(.system(size: 15))
      .frame(height: 20)
      .padding(.top, 4)
      .padding(.bottom, 12)
      .overlay(alignment: .bottom) {
        Rectangle().fill(focused ? look.paneInk : look.paneHairline).frame(height: 1)
      }
      .accessibilityLabel("Agent \(label.lowercased())")
    }
    .onAppear { draft = stored }
    .onChange(of: stored) { _, value in
      sent = nil
      if !focused { draft = value }
    }
    .onChange(of: focused) { _, now in
      editing = now
      if !now { done() }
    }
    // Closed or another agent opened while it held the keys: saved as letting go would.
    .onDisappear { if editing && !readOnly { editing = false; done() } }
  }

  /** Let go of the keys: trimmed; unchanged, nothing; an empty name goes back. */
  private func done() {
    let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard value != stored else { draft = stored; return }
    if required && value.isEmpty { draft = stored; return }
    draft = value
    guard value != sent else { return }
    sent = value
    commit(value)
  }
}

/**
 * The description (`Uwe` as a textarea): it grows with its words from 44 to
 * 160 points, then scrolls; Return is a new line; it is saved when it lets go
 * of the keys, and Escape puts the stored words back.
 */
private struct PaneDescriptionField: View {
  let stored: String
  let readOnly: Bool
  let look: Look
  let commit: (String) -> Void
  @State private var draft = ""
  @State private var focused = false
  @State private var textHeight: CGFloat = 20
  /** What was last sent, until the stored words change (see `PaneLineField.sent`). */
  @State private var sent: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      PaneLabel(text: "Description", first: false, look: look)
      PaneTextArea(text: $draft, focused: $focused, height: $textHeight, ink: NSColor(look.paneInk), editable: !readOnly, onCancel: {
        draft = stored
      })
      .frame(height: min(160 - 17, max(44 - 17, textHeight)))
      .overlay(alignment: .topLeading) {
        if draft.isEmpty {
          Text("What this agent is for")
            .font(.system(size: 15))
            .foregroundStyle(look.panePlaceholder)
            .allowsHitTesting(false)
        }
      }
      .padding(.top, 4)
      .padding(.bottom, 12)
      .overlay(alignment: .bottom) {
        Rectangle().fill(focused ? look.paneInk : look.paneHairline).frame(height: 1)
      }
      .accessibilityLabel("Agent description")
    }
    .onAppear { draft = stored }
    .onChange(of: stored) { _, value in
      sent = nil
      if !focused { draft = value }
    }
    .onChange(of: focused) { _, now in if !now { done() } }
    // Closed or another agent opened while it held the keys: saved as letting go would.
    .onDisappear { if focused { done() } }
  }

  private func done() {
    guard !readOnly else { return }
    let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard value != stored else { draft = stored; return }
    draft = value
    guard value != sent else { return }
    sent = value
    commit(value)
  }
}

/** The description's words (and a routine's instruction, 14/20): the Mac's own text view, 15/20, no box, its height told to the field. */
struct PaneTextArea: NSViewRepresentable {
  @Binding var text: String
  @Binding var focused: Bool
  @Binding var height: CGFloat
  let ink: NSColor
  let editable: Bool
  var fontSize: CGFloat = 15
  var lineHeight: CGFloat = 20
  let onCancel: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeNSView(context: Context) -> NSScrollView {
    let scroll = NSScrollView()
    scroll.drawsBackground = false
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.scrollerStyle = .overlay
    scroll.borderType = .noBorder
    let view = FocusTextView(frame: NSRect(x: 0, y: 0, width: 300, height: 20))
    view.minSize = .zero
    view.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    view.isVerticallyResizable = true
    view.isHorizontallyResizable = false
    view.autoresizingMask = [.width]
    view.textContainer?.widthTracksTextView = true
    view.textContainer?.containerSize = NSSize(width: 300, height: CGFloat.greatestFiniteMagnitude)
    scroll.documentView = view
    view.onFocus = { [weak coordinator = context.coordinator] now in coordinator?.parent.focused = now }
    // Its height is measured again whenever its width changes (the pane dragged, the first layout).
    view.postsFrameChangedNotifications = true
    NotificationCenter.default.addObserver(context.coordinator, selector: #selector(Coordinator.frameChanged(_:)), name: NSView.frameDidChangeNotification, object: view)
    view.delegate = context.coordinator
    view.drawsBackground = false
    view.isRichText = false
    view.allowsUndo = true
    view.isAutomaticQuoteSubstitutionEnabled = false
    view.isContinuousSpellCheckingEnabled = false
    view.textContainerInset = .zero
    view.textContainer?.lineFragmentPadding = 0
    view.font = NSFont.systemFont(ofSize: fontSize)
    let lines = NSMutableParagraphStyle()
    lines.minimumLineHeight = lineHeight
    lines.maximumLineHeight = lineHeight
    view.defaultParagraphStyle = lines
    view.typingAttributes = [.font: NSFont.systemFont(ofSize: fontSize), .foregroundColor: ink, .paragraphStyle: lines]
    view.string = text
    view.textColor = ink
    view.isEditable = editable
    view.isSelectable = true
    context.coordinator.measure(view)
    return scroll
  }

  func updateNSView(_ scroll: NSScrollView, context: Context) {
    context.coordinator.parent = self
    guard let view = scroll.documentView as? NSTextView else { return }
    if view.string != text {
      view.string = text
      context.coordinator.measure(view)
    }
    view.textColor = ink
    view.isEditable = editable
  }

  /** The text view that says when it takes the keys and lets them go (`textDidBeginEditing` waits for the first letter). */
  final class FocusTextView: NSTextView {
    var onFocus: (Bool) -> Void = { _ in }
    private var lastWidth: CGFloat = 0

    override func becomeFirstResponder() -> Bool {
      let took = super.becomeFirstResponder()
      if took { onFocus(true) }
      return took
    }

    override func resignFirstResponder() -> Bool {
      let gave = super.resignFirstResponder()
      if gave { onFocus(false) }
      return gave
    }

    /** Whether its width changed since it was last asked (its height changing is not a reason to measure). */
    func widthChanged() -> Bool {
      guard abs(frame.width - lastWidth) > 0.5 else { return false }
      lastWidth = frame.width
      return true
    }
  }

  final class Coordinator: NSObject, NSTextViewDelegate {
    var parent: PaneTextArea
    init(_ parent: PaneTextArea) { self.parent = parent }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc func frameChanged(_ notification: Notification) {
      guard let view = notification.object as? FocusTextView, view.widthChanged() else { return }
      measure(view)
    }

    func measure(_ view: NSTextView) {
      guard let layout = view.layoutManager, let container = view.textContainer else { return }
      layout.ensureLayout(for: container)
      let used = max(parent.lineHeight, ceil(layout.usedRect(for: container).height))
      if abs(parent.height - used) > 0.5 {
        DispatchQueue.main.async { self.parent.height = used }
      }
    }

    func textDidChange(_ notification: Notification) {
      guard let view = notification.object as? NSTextView else { return }
      parent.text = view.string
      measure(view)
    }

    func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
      guard !textView.hasMarkedText() else { return false }
      if selector == #selector(NSResponder.cancelOperation(_:)) {
        // Escape: the stored words back, and the keys let go (the pane stays open).
        parent.onCancel()
        textView.window?.makeFirstResponder(nil)
        return true
      }
      return false
    }

  }
}

/**
 * Notifications (`sand-agent-settings__card`): a 40-point tile (round 11,
 * the pane's fill) with the bell, "Notifications" (15/20, medium) over "Get
 * notified when this agent finishes or needs input" (13/17, grey), and the
 * Mac's switch (the window's blue when on) at the right; 14 apart.
 */
private struct NotificationsCard: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var saving = false

  var body: some View {
    HStack(spacing: 14) {
      BellGlyph()
        .stroke(look.paneInk, style: StrokeStyle(lineWidth: 1.6 * 20 / 24, lineCap: .round, lineJoin: .round))
        .frame(width: 20, height: 20)
        .frame(width: 40, height: 40)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(look.paneFill))
      VStack(alignment: .leading, spacing: 2) {
        Text("Notifications")
          .font(.system(size: 15, weight: .medium))
          .tracking(-0.16)
          .foregroundStyle(look.paneInk)
        Text("Get notified when this agent finishes or needs input")
          .font(.system(size: 13))
          .lineSpacing(LineBox.extra(size: 13, lineHeight: 17))
          .foregroundStyle(look.paneInk2)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Toggle("", isOn: Binding(get: { agent.notifyOnUpdates }, set: { on in
        saving = true
        let id = agent.id
        Task {
          await store.setNotify(id, on)
          saving = false
        }
      }))
      .toggleStyle(.switch)
      .labelsHidden()
      .controlSize(.small)
      .tint(look.paneSwitchOn)
      .disabled(saving)
      .accessibilityLabel("Notifications")
    }
  }
}

/** The bell (`M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.5 1.6H4.7z`, `M10 20.2a2.1 2.1 0 0 0 4 0`) on a 24-point view. */
private struct BellGlyph: Shape {
  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 24
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    var path = Path()
    path.move(to: p(6.2, 16.6))
    path.addLine(to: p(6.2, 11))
    path.addArc(center: p(12, 11), radius: 5.8 * k, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
    path.addLine(to: p(17.8, 16.6))
    path.addLine(to: p(19.3, 18.2))
    path.addLine(to: p(4.7, 18.2))
    path.closeSubpath()
    // The clapper: half a turn of radius 2 under the bell.
    path.move(to: p(10, 20.2))
    path.addArc(center: p(12, 20.2), radius: 2 * k, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: true)
    return path
  }
}

// MARK: - Colours

extension Look {
  /** The pane's ground (`#fbfbfd`, `#1c1c1e` on dark) and its own inks (`--simeon-ink`, `--simeon-ink-2`). */
  var paneGround: Color { dark ? Color(hex: 0x1c1c1e) : Color(hex: 0xfbfbfd) }
  var paneInk: Color { dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f) }
  var paneInk2: Color { dark ? Color(hex: 0x98989d) : Color(hex: 0x86868b) }
  /** The tabs' track, the pencil's disc, the bell's tile (`--simeon-fill`), and the pencil's disc under the pointer. */
  var paneFill: Color { dark ? Color(hex: 0x2c2c2e) : Color(hex: 0xf2f2f4) }
  var paneFill2: Color { dark ? Color(hex: 0x3a3a3c) : Color(hex: 0xe8e8ed) }
  var paneHairline: Color { dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08) }
  var paneAvatarDisc: Color { dark ? Color(hex: 0x2c2c2e) : .white }
  var paneThumb: Color { dark ? Color(hex: 0x636366) : .white }
  var paneTabIdle: Color { dark ? Color(hex: 0xaeaeb2) : Color(hex: 0x6e6e73) }
  var paneSeparator: Color { dark ? Color(hex: 0x48484a) : Color(hex: 0xd8d8dd) }
  var panePlaceholder: Color { inkSecondary }
  /** The divider on the pane's left (`--sand-border-weak`), darker under the pointer (20%). */
  var paneEdge: Color { ink.opacity(0.10) }
  var paneEdgeHover: Color { ink.opacity(0.20) }
  /** The switch when on: the window's blue (`#2f6db0` on dark). */
  var paneSwitchOn: Color { dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93) }
}
