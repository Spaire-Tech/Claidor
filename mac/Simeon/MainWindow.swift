import AppKit
import SwiftUI
import WebKit
import SimeonCore

/** What the window shows: the open agent, kept from one launch to the next (the Electron window reopens on the agent left open). */
@MainActor
@Observable
final class WindowState {
  var selected: String? = UserDefaults.standard.string(forKey: WindowState.selectedKey) {
    didSet { UserDefaults.standard.set(selected, forKey: Self.selectedKey) }
  }

  private static let selectedKey = "simeon.window.selectedAgent"

  /** A message or file found by search, its chat to open at that line, lit (`revealSearchHit`); the count makes each one new. */
  struct Reveal: Equatable {
    let agentId: String
    let entryId: String
    let count: Int
  }

  var pendingReveal: Reveal?
  /** Files typed into the new chat, waiting for the chat they went to (step 5). */
  var handoffFiles: [String: [StagedFile]] = [:]
  /** Bumped when search closes, for the open chat's message field to take the keys back. */
  static var composerFocus = 0 {
    didSet { NotificationCenter.default.post(name: WindowState.composerFocusNote, object: nil) }
  }
  static let composerFocusNote = Notification.Name("simeon.window.composerFocus")

  /** Search's message or file: its chat opens (if it is not the open one) and goes to the line. */
  func reveal(_ entryId: String, in agentId: String, store: AppStore) {
    // The open agent's line too: the chart gives way to its chat.
    orgChart = false
    if selected != agentId { open(agentId, store: store) }
    opened += 1
    pendingReveal = Reveal(agentId: agentId, entryId: entryId, count: (pendingReveal?.count ?? 0) + 1)
  }

  /** Bumped each time the person opens an agent themselves (a row, search, Control-Tab, a hit): it closes the new chat even onto the agent already open. */
  var opened = 0

  /**
   * The org chart in the chat's place (step 12, `view:org-chart`), from ⌘K
   * and "/": no sidebar row lit while it shows; any agent opened (a row,
   * the current one too, a card's Open chat), ⌘N or a page of the pane
   * closes it. Each opening starts afresh.
   */
  var orgChart = false

  /** The full computer view (step 13, `bbn`): whose computer, and the helper's screen asked for. */
  struct ComputerOpen: Equatable {
    let agentId: String
    var helper: String?
  }

  /**
   * An agent's computer over the whole window, from its pane's preview or
   * the chat's hand-off card. Choosing an agent (search), Settings and
   * Plugins close it, as do its own Exit and its banner's buttons.
   */
  var computer: ComputerOpen? {
    didSet { WindowState.computerShowing = computer != nil }
  }
  /** The computer is over the window: the window's own keys go to its screen. */
  static var computerShowing = false

  /** A computer question asked (⌘K or "/" Update, the sidebar's or "Couldn't Reach"'s Recover): its dialog shows when no other does. */
  var computerAsk: ComputerAsk?

  /** Opening it starts the computer (`ensureForeverBox`); nothing behind keeps the keys. */
  func openComputer(_ agentId: String, helper: String?, store: AppStore) {
    store.openComputer(agentId)
    computer = ComputerOpen(agentId: agentId, helper: helper)
    NSApp.keyWindow?.makeFirstResponder(nil)
  }

  /** Exit and the banner's buttons: the view goes and the message field takes the keys (`W`). */
  func closeComputer() {
    guard computer != nil else { return }
    computer = nil
    WindowState.composerFocus += 1
  }

  /** ↑← and ↓→ between two or more helpers' screens, round (`bbn`). */
  func stepComputerHelper(_ delta: Int, store: AppStore) {
    guard let open = computer else { return }
    let helpers = store.computerHelpers(open.agentId)
    if let next = ComputerHelper.step(helpers, from: ComputerHelper.focused(helpers, asked: open.helper), by: delta) {
      computer?.helper = next
    }
  }

  /** The person opens an agent: as `open`, and the new chat makes way. */
  func choose(_ agentId: String, store: AppStore) {
    open(agentId, store: store)
    opened += 1
  }

  /** A row clicked: its agent opens (its chat read, its unread cleared). */
  func open(_ agentId: String, store: AppStore) {
    orgChart = false
    // Choosing an agent closes the computer (`Fzn`).
    computer = nil
    selected = agentId
    store.windowSelection = agentId
    Task { await store.open(agentId) }
  }

  /**
   * The agent left open while it is there (hidden from the sidebar or in a
   * folded section too), else the first in the list.
   */
  func chooseFirst(_ order: [String], store: AppStore) {
    if let selected, store.agents.contains(where: { $0.id == selected }) {
      if store.openChat != selected { open(selected, store: store) }
      return
    }
    guard let first = order.first else { return }
    open(first, store: store)
  }
}

/** The app's one window: the sign-in until the person is signed in and their computer reached, a new account's first run, then the sidebar and the chat. */
struct AppRoot: View {
  @Environment(MacSession.self) private var session
  @Environment(AppStore.self) private var store

  var body: some View {
    // Refused before the computer was ever reached, and no Simeon on this account (`mzn`): the access cover.
    let covered = store.accessBlocked && !store.hasReachedBox && store.access.state != .granted
    Group {
      switch session.phase {
      case .signedIn where covered, .firstRun where covered:
        AccessCover(access: store.access)
      case .signedIn:
        MainWindow()
      case .firstRun:
        // The first run (step 6), in the whole window.
        FirstRunScreen()
      default:
        SignInScreen()
      }
    }
    // About (step 10), over everything, the sign-in too.
    .overlay { AboutLayer() }
    // Deep Links (step 14), from a `…/v1/info?topic=deep-links` link, signed out too.
    .overlay { DeepLinksLayer() }
    // Links in messages open only on the web, in mail, Obsidian or the phone (`shell.openExternal`'s allowlist, decision 7);
    // any other kind does nothing, as in the Electron app.
    .environment(\.openURL, OpenURLAction { url in
      ["http", "https", "mailto", "obsidian", "tel"].contains(url.scheme?.lowercased() ?? "") ? .systemAction(url) : .discarded
    })
    .frame(minWidth: WindowChrome.minimum.width, minHeight: WindowChrome.minimum.height)
    .background(WindowAccessor())
    .ignoresSafeArea()
  }
}

/**
 * The sidebar and the chat side by side (`sand-shell`), the sidebar's edge
 * draggable. The chat is the open agent's (`ChatPane`), drawn afresh for
 * each agent so it opens at its newest message with its own draft.
 */
struct MainWindow: View {
  @Environment(AppStore.self) private var store
  @Environment(SidebarLayout.self) private var layout
  @Environment(WindowState.self) private var window
  @Environment(NewChatState.self) private var newChat
  @Environment(PaneState.self) private var pane
  @Environment(SettingsState.self) private var settings
  @Environment(PluginsState.self) private var plugins
  @Environment(AccountState.self) private var account
  @Environment(\.colorScheme) private var scheme

  /** The computer this window follows (the store counts who watches). */
  @State private var watching: String?

  /** The open agent, when it has a computer (not a group or a shared room). */
  private var watchedComputer: String? {
    guard let id = window.selected, let agent = store.agent(id), !agent.isGroup else { return nil }
    return id
  }

  var body: some View {
    let look = Look(scheme)
    GeometryReader { box in
      let windowWidth = box.size.width
      // The agent's pane (step 7): drawn while open, the new chat closed, and the chat keeping its 424 beside the sidebar as it stands (`uan`).
      let paneWidth = pane.dragWidth ?? pane.width
      let standing = layout.isCollapsed ? SidebarLayout.railWidth : layout.expandedWidth
      let paneShown = pane.isOpen && !newChat.isOpen && PaneState.fits(windowWidth: windowWidth, sidebarWidth: standing, paneWidth: paneWidth)
      let shownWidth = paneShown ? paneWidth : 0
      let rail = layout.showsRail(windowWidth: windowWidth - shownWidth)
      let sidebarWidth = rail ? SidebarLayout.railWidth : layout.expandedWidth
      // Its page keeps its width as it slides, never wider than the window leaves it (`sand-1uxagwj`).
      let pageWidth = max(0, min(paneWidth, windowWidth - sidebarWidth - SidebarLayout.chatMinimum))
      HStack(spacing: 0) {
        Sidebar(rail: rail, width: sidebarWidth)
        Group {
          if newChat.isOpen {
            // New chat (⌘N, step 5) in the chat's place.
            NewChatPane()
          } else if window.orgChart {
            // The org chart (step 12), the chat and its head under it; the pane stays beside it.
            OrgChartView()
          } else if newChat.creating != nil {
            CreatingScreen()
          } else if let agentId = window.selected {
            ChatPane(agentId: agentId)
              .id(agentId)
          } else {
            ZStack(alignment: .top) {
              look.ground
              // The top of the chat moves the window, as the Electron window's title strip does.
              WindowDragArea().frame(height: 52)
            }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        AgentPaneColumn(agentId: window.selected, shownWidth: shownWidth, pageWidth: pageWidth, windowWidth: windowWidth, sidebarWidth: sidebarWidth)
      }
      .onChange(of: paneShown, initial: true) { _, shown in pane.isVisible = shown }
      .overlay(alignment: .topLeading) {
        SidebarResizeEdge(windowWidth: windowWidth)
          .frame(height: box.size.height)
          .offset(x: sidebarWidth - 7)
      }
      .animation(SidebarLayout.motion, value: rail)
    }
    // A file, a picture or a diagram opened full screen, over the sidebar and the chat.
    .overlay { ViewerLayer() }
    // An agent's computer (step 13), over the whole window.
    .overlay { ComputerLayer() }
    // Settings (⌘,, step 8), over the window; search over it.
    .overlay { SettingsLayer() }
    // Plugins (Connect apps, step 9), in Settings' place.
    .overlay { PluginsLayer() }
    // Search (⌘K), over everything.
    .overlay { SearchLayer() }
    // The agents being read with none to show yet (Reload, ⌘R): "Setting up Simeon's computer" over the window (`Yzn`).
    .overlay {
      if store.isLoading && store.agents.isEmpty && !store.rosterFailed {
        ZStack {
          look.ground
          SettingUp(look: look)
        }
        .ignoresSafeArea()
      }
    }
    // The computer's dialogs (step 13), one at a time, over everything; its pills at the top over them.
    .overlay { ComputerDialogLayer() }
    .overlay { ComputerPills() }
    // The usage is read once signed in: Settings lists Usage & Billing, and ⌘K and "/" offer it, only once it is in.
    .task { await store.loadUsage() }
    // Settings opening shuts what floats over the pane (a routine's trigger popover, the avatar editor), as a click outside them would.
    .onChange(of: settings.isOpen) { _, open in
      guard open else { return }
      // It takes the computer's place (the window's one overlay slot).
      window.computer = nil
      pane.routineEditor?.closePopover(store: store)
      if pane.avatarEditor != nil { pane.closeAvatarEditor() }
    }
    // Plugins opening does the same, and About.
    .onChange(of: plugins.isOpen) { _, open in
      guard open else { return }
      window.computer = nil
      pane.routineEditor?.closePopover(store: store)
      if pane.avatarEditor != nil { pane.closeAvatarEditor() }
    }
    .onChange(of: account.aboutOpen) { _, open in
      guard open else { return }
      pane.routineEditor?.closePopover(store: store)
      if pane.avatarEditor != nil { pane.closeAvatarEditor() }
    }
    // Signed out (or the computer lost): Settings and Plugins go with the window.
    .onDisappear {
      settings.close()
      plugins.close()
      plugins.model.forget()
      // The next sign-in opens on a chat, not the chart nor a computer.
      window.orgChart = false
      window.computer = nil
      window.computerAsk = nil
      if let watching { store.unwatchComputer(watching) }
      watching = nil
    }
    // The open agent's computer is read and followed while it is open (`XOn` → `NTn(current)`), not a group's.
    .onChange(of: watchedComputer, initial: true) { _, now in
      guard now != watching else { return }
      if let watching { store.unwatchComputer(watching) }
      watching = now
      if let now { store.watchComputer(now) }
    }
    // The window coming forward: a computer started here is started again, and what is watched read again (at most once a minute).
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
      store.windowCameForward(rebuilding: store.rebuild.isHardLocked)
      // Whether this account may use Simeon, read again each time (not while the computer is rebuilt).
      if !store.rebuild.isHardLocked { Task { await store.refreshAccess() } }
    }
    // Another agent opened from the sidebar or search closes the new chat (its own single agent is its preview).
    .onChange(of: window.selected) { _, selected in
      // The pane stays open on another agent, drawn afresh on Profile (or the page asked for it).
      pane.agentChanged(to: selected)
      guard newChat.isOpen, newChat.previewId(window) == nil else { return }
      newChat.close()
    }
    // The new chat (⌘N) and a page of the pane (Channels, Chat Settings, `openSection`) close the org chart.
    .onChange(of: newChat.isOpen) { _, open in
      if open { window.orgChart = false }
    }
    .onChange(of: pane.isOpen) { _, open in
      if open { window.orgChart = false }
    }
    .onChange(of: pane.section) { _, _ in
      if pane.isOpen { window.orgChart = false }
    }
    // Making an agent from the new chat closes the pane (`HDn`).
    .onChange(of: newChat.creating != nil) { _, making in
      if making { pane.close(layout: layout) }
    }
    .onChange(of: window.opened) { _, _ in
      guard newChat.isOpen, newChat.previewId(window) == nil else { return }
      newChat.close()
    }
    .background(KeyWatcher())
  }
}

/**
 * The window's own keys that are not in a menu (the Electron window's
 * `global-keyboard-shortcuts`): ⌘B folds and opens the sidebar; ⌘K opens and
 * closes search, ⌘⇧F opens it, and while it is open its keys are its own
 * (SearchPanel.swift). With rows
 * picked, Escape lets them go and Delete (or Backspace) deletes them, after
 * the confirmation, unless a field has the keys. Control-Tab and
 * Control-Shift-Tab walk the sidebar's rows; letting go of Control opens the
 * row walked to, Escape or leaving the window calls it off. The other
 * keys come with the screens they open.
 */
private struct KeyWatcher: NSViewRepresentable {
  @Environment(SidebarLayout.self) private var layout
  @Environment(SidebarState.self) private var sidebar
  @Environment(WindowState.self) private var windowState
  @Environment(AppStore.self) private var store
  @Environment(SearchState.self) private var search
  @Environment(NewChatState.self) private var newChat
  @Environment(PaneState.self) private var pane
  @Environment(Viewers.self) private var viewers
  @Environment(SettingsState.self) private var settings
  @Environment(PluginsState.self) private var plugins

  func makeNSView(context: Context) -> NSView {
    let view = WatchView()
    update(view)
    return view
  }

  func updateNSView(_ view: NSView, context: Context) {
    if let view = view as? WatchView { update(view) }
  }

  private func update(_ view: WatchView) {
    view.layout = layout
    view.sidebar = sidebar
    view.windowState = windowState
    view.store = store
    view.search = search
    view.newChat = newChat
    view.pane = pane
    view.viewers = viewers
    view.settings = settings
    view.plugins = plugins
  }

  final class WatchView: NSView {
    var layout: SidebarLayout?
    var sidebar: SidebarState?
    var windowState: WindowState?
    var store: AppStore?
    var search: SearchState?
    var newChat: NewChatState?
    var pane: PaneState?
    var viewers: Viewers?
    var settings: SettingsState?
    var plugins: PluginsState?
    nonisolated(unsafe) private var monitors: [Any] = []
    nonisolated(unsafe) private var resigned: NSObjectProtocol?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      stop()
      guard let window else { return }
      let keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window else { return false }
          return self.key(event)
        }
        return took ? nil : event
      }
      let flags = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
        MainActor.assumeIsolated {
          guard let self, event.window === self.window else { return }
          self.flags(event)
        }
        return event
      }
      monitors = [keys, flags].compactMap { $0 }
      resigned = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification, object: window, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          self?.sidebar?.cycle = nil
          self?.newChat?.shortcutsShown = false
        }
      }
    }

    /** One key pressed; true when it was the window's. */
    private func key(_ event: NSEvent) -> Bool {
      // About over the window (step 10): its Escape is its own (`AboutKeys`), and the window's keys wait.
      if AccountState.aboutShowing { return false }
      // A computer dialog over the window (step 13): its keys are its own (`ComputerDialogLayer`).
      if ComputerDialog.showing { return false }
      // Caps Lock aside.
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      // The computer over the window (step 13): every key is its screen's (Escape, ⌘K, ⌘N and ⌘, too, as once the window's
      // screen has the keys); Tab stays inside the view, and the arrows switch helpers' screens while the screen has no keys.
      if WindowState.computerShowing, let windowState {
        if screenHasKeys { return false }
        if event.keyCode == 48 { return true }
        if mods.isEmpty, let store, [123, 124, 125, 126].contains(event.keyCode) {
          windowState.stepComputerHelper(event.keyCode == 123 || event.keyCode == 126 ? -1 : 1, store: store)
          return true
        }
        return false
      }
      if mods == .command, event.charactersIgnoringModifiers?.lowercased() == "b" {
        if let layout { pane?.makeRoomForSidebar(layout) }
        layout?.toggle()
        return true
      }
      // ⌘, (`sand.openSettings`): Settings on General, from a field too; again while it is open, nothing.
      if mods == .command, event.charactersIgnoringModifiers == "," {
        settings?.open(.general)
        return true
      }
      // ⌘⇧M ("Customize", `sand.openTools`) and ⌘⇧W ("Skills", `sand.openWorkflows`): Plugins on Marketplace, from a field too.
      if mods == [.command, .shift], let key = event.charactersIgnoringModifiers?.lowercased(), key == "m" || key == "w" {
        plugins?.open()
        return true
      }
      // Plugins open, search not over it: ⌘F the search (on a page, nothing: the chat behind never gets it); Escape clears
      // the search's words, then lets go of it, then closes Plugins (on a page too, as the window does).
      if let plugins, plugins.isOpen, search?.isOpen != true {
        if mods == .command, event.charactersIgnoringModifiers?.lowercased() == "f" {
          plugins.focusSearch()
          return true
        }
        if event.keyCode == 53, mods.isEmpty {
          if let text = window?.firstResponder as? NSTextView, text.hasMarkedText() { return false }
          if window?.firstResponder is NSText {
            // On a page (setup values, a skill's words) the field lets go first, so what is typed is not lost with Plugins.
            if plugins.model.path.isEmpty, !plugins.model.query.isEmpty { plugins.model.query = "" } else { window?.makeFirstResponder(nil) }
            return true
          }
          plugins.close()
          return true
        }
      }
      // Settings open, search not over it: Escape closes it, unless one of its fields has the keys (a rule's own Escape).
      if let settings, settings.isOpen, event.keyCode == 53, mods.isEmpty, search?.isOpen != true {
        if window?.firstResponder is NSText { return false }
        settings.close()
        return true
      }
      // The avatar editor open (7b): Escape closes it whatever has the keys (the window's capture-phase listener); ⌘V outside a field pastes a picture into it.
      if let editor = pane?.avatarEditor, !WindowOverlay.showing {
        if event.keyCode == 53, mods.isEmpty {
          // Letters still being composed (Japanese, Chinese) take Escape first.
          if let text = window?.firstResponder as? NSTextView, text.hasMarkedText() { return false }
          pane?.closeAvatarEditor()
          return true
        }
        if mods == .command, event.charactersIgnoringModifiers?.lowercased() == "v", !(window?.firstResponder is NSText) {
          editor.paste()
          return true
        }
      }
      // The agent's pane: ⌘⇧, (`sand.toggleAgentSettings`) and ⌘⇧I or ⌥⌘B (`sand.toggleInfo`); not behind Settings or Plugins.
      if let pane, let layout, search?.isOpen != true, !WindowOverlay.showing {
        let key = event.charactersIgnoringModifiers?.lowercased()
        if mods == [.command, .shift], key == "," || key == "<" {
          pane.toggleSettings(layout: layout)
          return true
        }
        if (mods == [.command, .shift] && key == "i") || (mods == [.command, .option] && event.keyCode == 11) {
          pane.toggleDetails(layout: layout)
          return true
        }
      }
      guard let sidebar, let windowState, let store else { return false }
      if let search {
        let key = event.charactersIgnoringModifiers?.lowercased()
        // ⌘K (`sand.commandPalette`, `mod+k`) and ⌘⇧F (`sand.focusSearch`, `mod+shift+f`).
        if mods == .command, key == "k" {
          search.toggle(store: store, window: windowState)
          return true
        }
        if mods == [.command, .shift], key == "f" {
          if !search.isOpen { search.open(store: store, window: windowState) }
          return true
        }
        // ⌘N (`sand.newAgent`, `mod+n`): the new chat, search closing for it.
        if mods == .command, key == "n", let newChat {
          if search.isOpen { search.close() }
          newChat.open()
          return true
        }
        if search.isOpen {
          // Letters still being composed (Japanese, Chinese) are the field's: Return, the arrows and Escape act on them.
          if let text = window?.firstResponder as? NSTextView, text.hasMarkedText() { return false }
          return search.key(event, store: store, window: windowState, sidebar: sidebar)
        }
      }
      // ⌘1–⌘9 with the To: line's field holding the keys choose its rows.
      if let newChat, newChat.isOpen, mods == .command, ((window?.firstResponder as? NSTextView)?.delegate as AnyObject?) is ToField.Field,
         let digit = event.charactersIgnoringModifiers.flatMap({ Int($0) }), (1...9).contains(digit) {
        return newChat.command(.shortcut(digit), store: store, window: windowState, sidebar: sidebar)
      }
      switch event.keyCode {
      case 48 where mods.subtracting(.shift) == .control && !WindowOverlay.showing:
        // Control-Tab, Control-Shift-Tab (not behind Settings or Plugins).
        sidebar.step(mods.contains(.shift) ? -1 : 1, order: sidebar.order(store), current: windowState.selected)
        return true
      case 53 where mods.isEmpty:
        // Escape: Control-Tab's walk first, then the picked rows, unless a field has the keys (its own Escape).
        if sidebar.cycle != nil {
          sidebar.cycle = nil
          return true
        }
        // A routine's trigger popover (7c): Escape closes it, from its fields too; the pane stays (`Y`).
        if let pane, pane.isVisible, let editor = pane.routineEditor, editor.popover != nil {
          if let text = window?.firstResponder as? NSTextView, text.hasMarkedText() { return false }
          window?.makeFirstResponder(nil)
          editor.closePopover(store: store)
          return true
        }
        // The org chart's Escape is its own (its card, then the chart), before the picked rows'.
        if windowState.orgChart { return false }
        // The new chat open and no field holding the keys: Escape closes it (`zDn`). A field's own Escape comes first (the To: line's, the message field's).
        if let newChat, newChat.isOpen, !(window?.firstResponder is NSText) {
          newChat.close()
          return true
        }
        // The pane shown, nothing over it (a viewer, an exchange, the org chart, whose Escape is its own) and no field holding the keys:
        // Escape closes it (`CDn`). A field's own Escape comes first.
        // The agent's Allow card over the message field takes this Escape first, as the window's does (step 14).
        let askShown = LocalAskDock.shown > 0 && viewers?.shown == nil && !ChatControl.exchangeShowing
        if let pane, let layout, pane.isVisible, viewers?.shown == nil, !ChatControl.exchangeShowing, !windowState.orgChart, !askShown,
           !(window?.firstResponder is NSText) {
          pane.close(layout: layout)
          return true
        }
        guard !sidebar.selection.isEmpty, sidebar.renamingAgent == nil, sidebar.renamingSection == nil, !askShown,
              !(window?.firstResponder is NSText) else { return false }
        sidebar.selection.clear()
        return true
      case 51 where mods.isEmpty, 117 where mods.isEmpty:
        // Delete and forward delete, unless a field has the keys or Settings is over the window.
        guard !sidebar.selection.isEmpty, !(window?.firstResponder is NSText), !WindowOverlay.showing else { return false }
        SidebarActions.confirmDelete(Array(sidebar.selection.ids), store: store, sidebar: sidebar)
        return true
      default:
        return false
      }
    }

    /** The computer's screen (a web view) holds the keys. */
    private var screenHasKeys: Bool {
      var view = window?.firstResponder as? NSView
      while let current = view {
        if current is WKWebView { return true }
        view = current.superview
      }
      return false
    }

    /** Control let go: Control-Tab's row opens. */
    private func flags(_ event: NSEvent) {
      if let search, search.isOpen { search.flags(event) }
      // ⌘ held over the To: line's menu shows its rows' shortcuts.
      if let newChat, newChat.isOpen {
        let held = event.modifierFlags.contains(.command)
        if newChat.shortcutsShown != held { newChat.shortcutsShown = held }
      }
      guard !event.modifierFlags.contains(.control), let sidebar, let cycle = sidebar.cycle, let windowState, let store else { return }
      sidebar.cycle = nil
      sidebar.selection.plain(cycle.next)
      windowState.choose(cycle.next, store: store)
    }

    private func stop() {
      for monitor in monitors { NSEvent.removeMonitor(monitor) }
      monitors = []
      if let resigned { NotificationCenter.default.removeObserver(resigned) }
      resigned = nil
    }

    deinit {
      for monitor in monitors { NSEvent.removeMonitor(monitor) }
      if let resigned { NotificationCenter.default.removeObserver(resigned) }
    }
  }
}
