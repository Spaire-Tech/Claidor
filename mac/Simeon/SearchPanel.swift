import AppKit
import SwiftUI
import SimeonCore

/**
 * Search (⌘K, step 4): the window's command palette (`QFn`). What is typed,
 * the tab, the row lit, whether ⌘ is held (the rows' ⌘1–⌘9 show), and what
 * the person's computer answered: its messages and files for the words
 * (asked 150 ms after the last key, the older answer kept until the new one
 * comes), every routine, and whether its search, the agent network and the
 * open chat's channels are on.
 */
@MainActor
@Observable
final class SearchState {
  var isOpen = false {
    didSet { SearchState.showing = isOpen }
  }
  /** Search is over the window: the chat's, the exchange's and the viewers' own keys, the right-click menu and sideways swipes wait under it. */
  static var showing = false
  var query = ""
  var tab: SearchTab = .all
  var highlight = 0
  /** Bumped when the keys move the light, so the list brings that row into view (the pointer moving it does not). */
  var keyMoves = 0
  var modifierHeld = false
  /** Bumped to give the field the keys. */
  var focus = 0

  var globalSearch = true
  var orgChart = false
  var hasChannels = false
  var messages = HostAnswer<MessageHit>(blankAsked: false)
  var files = HostAnswer<FileHit>(blankAsked: true)
  var routines: [RoutineHit] = []
  var routinesStatus: Jump.Status = .empty

  /**
   * One list the computer answers for the words (`_0t`): the words asked,
   * the words its answer is for, the answer (kept while the next is on its
   * way or failed), and where it stands.
   */
  struct HostAnswer<Hit> {
    let blankAsked: Bool
    var answered = ""
    var results: [Hit] = []
    var status: Jump.Status = .empty
    var generation = 0
  }

  /** ⌘K, the sidebar's Search: open, emptied, on All, the field taking the keys. */
  func open(store: AppStore, window: WindowState) {
    query = ""
    tab = .all
    highlight = 0
    modifierHeld = false
    isOpen = true
    focus += 1
    let current = window.selected
    Task {
      let searchOn = await store.globalSearchEnabled()
      let networkOn = await store.agentNetworkEnabled()
      var channelsOn = false
      if let current { channelsOn = await store.channelsAvailable(current) }
      guard isOpen else { return }
      globalSearch = searchOn
      orgChart = networkOn
      hasChannels = channelsOn
      if searchOn {
        ask(query, store: store)
        routinesStatus = .loading
        let all = await store.allRoutines()
        guard isOpen else { return }
        routines = all
        routinesStatus = .ready
      }
    }
  }

  func close() {
    isOpen = false
    // The keys go back to the message field, as the window's dialog gives the focus back.
    WindowState.composerFocus += 1
    modifierHeld = false
    messages = HostAnswer(blankAsked: false)
    files = HostAnswer(blankAsked: true)
    routines = []
    routinesStatus = .empty
  }

  func toggle(store: AppStore, window: WindowState) {
    if isOpen { close() } else { open(store: store, window: window) }
  }

  /** The words changed: the light goes to the top and the computer is asked again. */
  func typed(store: AppStore) {
    highlight = 0
    keyMoves += 1
    ask(query, store: store)
  }

  /** Asks for messages (only for words) and files (also with none), 150 ms after the last key (`J0t`). */
  func ask(_ raw: String, store: AppStore) {
    guard globalSearch else { return }
    let words = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    messages.generation += 1
    files.generation += 1
    let messageTurn = messages.generation
    let fileTurn = files.generation
    if words.isEmpty {
      messages.answered = ""
      messages.results = []
      messages.status = .empty
    } else {
      messages.status = .loading
    }
    files.status = .loading
    Task {
      try? await Task.sleep(for: .milliseconds(Int(Search.debounce * 1000)))
      if !words.isEmpty, messages.generation == messageTurn {
        do {
          let hits = try await store.searchMessages(words)
          if messages.generation == messageTurn {
            messages.answered = words
            messages.results = hits
            messages.status = hits.isEmpty ? .empty : .ready
          }
        } catch {
          if messages.generation == messageTurn { messages.status = .failed }
        }
      }
      guard files.generation == fileTurn else { return }
      do {
        let hits = try await store.searchFiles(words)
        if files.generation == fileTurn {
          files.answered = words
          files.results = hits
          files.status = hits.isEmpty ? .empty : .ready
        }
      } catch {
        if files.generation == fileTurn { files.status = .failed }
      }
    }
  }

  // MARK: What is listed

  struct Listing {
    let rows: [Jump.Row]
    let agentsById: [String: Agent]
    let tabs: [SearchTab]
    let settled: Jump.Settled
    let filtered: Bool
  }

  /** The rows for the tab and the words (`WFn`): the agents (pins first), the actions, and, with the computer's search on, its answers, the open chat's links and the routines. */
  func listing(store: AppStore, window: WindowState) -> Listing {
    let visible = store.agents.filter { !$0.isHidden }
    let hidden = store.agents.filter(\.isHidden)
    let byId = Dictionary(store.agents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let theme = UserDefaults.standard.string(forKey: MacTheme.key) ?? "system"
    let commands = Jump.commands(orgChart: orgChart && !store.agents.isEmpty, hiddenCount: hidden.count, current: store.agent(window.selected),
                                 hasChannels: hasChannels, theme: theme)
    let tabs = Jump.tabs(globalSearch: globalSearch)
    let tab = tabs.contains(self.tab) ? self.tab : .all
    let words = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let links = globalSearch ? Jump.links(store.transcripts[window.selected ?? ""] ?? []) : []
    let rows = Jump.results(
      agents: Jump.ordered(visible, pinnedIds: store.pinnedIds), hidden: hidden, commands: commands,
      messages: globalSearch ? messages.results.filter { byId[$0.agentId] != nil } : [],
      files: globalSearch ? files.results.filter { byId[$0.agentId] != nil } : [],
      messagesStale: messages.answered != words, filesStale: files.answered != words,
      links: links, routines: globalSearch ? routines : [], tab: tab, query: query)
    let filtered = !Jump.tokens(query).isEmpty
    let settled = Jump.settled(tab: tab, globalSearch: globalSearch, filtered: filtered, messages: messages.status, files: files.status, routines: routinesStatus)
    return Listing(rows: rows, agentsById: byId, tabs: tabs, settled: settled, filtered: filtered)
  }

  // MARK: Keys

  /**
   * A key while search is open (`Pe`): Escape closes; ↑ and ↓ move the
   * light (stopping at the ends); ← and → with nothing typed, and Tab and
   * ⇧Tab, change the tab round; ⌘1–⌘9 open the first nine rows; Return opens
   * the lit one. True when the key was search's.
   */
  func key(_ event: NSEvent, store: AppStore, window: WindowState, sidebar: SidebarState) -> Bool {
    let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
    let listing = listing(store: store, window: window)
    let count = listing.rows.count
    let lit = count == 0 ? 0 : min(max(highlight, 0), count - 1)
    // ⌘F is the chat's find, not under search.
    if mods == .command, event.charactersIgnoringModifiers?.lowercased() == "f" { return true }
    switch event.keyCode {
    case 53:
      close()
      return true
    case 125, 126:
      guard count > 0 else { return true }
      highlight = min(max(lit + (event.keyCode == 125 ? 1 : -1), 0), count - 1)
      keyMoves += 1
      return true
    case 123 where query.isEmpty && mods.isEmpty, 124 where query.isEmpty && mods.isEmpty:
      choose(Jump.nextTab(listing.tabs.contains(tab) ? tab : .all, by: event.keyCode == 123 ? -1 : 1, in: listing.tabs))
      return true
    case 48:
      choose(Jump.nextTab(listing.tabs.contains(tab) ? tab : .all, by: mods.contains(.shift) ? -1 : 1, in: listing.tabs))
      return true
    case 36, 76:
      if count > 0 { activate(listing.rows[lit], store: store, window: window, sidebar: sidebar) }
      return true
    default:
      break
    }
    if mods == .command || mods == .control, let digit = event.charactersIgnoringModifiers.flatMap({ Int($0) }), (1...9).contains(digit) {
      if digit <= count { activate(listing.rows[digit - 1], store: store, window: window, sidebar: sidebar) }
      return true
    }
    return false
  }

  /** ⌘ or Control held: the first nine rows show their shortcut. */
  func flags(_ event: NSEvent) {
    let held = !event.modifierFlags.intersection([.command, .control]).isEmpty
    if held != modifierHeld { modifierHeld = held }
  }

  func choose(_ next: SearchTab) {
    tab = next
    highlight = 0
    keyMoves += 1
  }

  /**
   * A row chosen (`qe`), then search closes: an agent opens; an action does
   * what it says; a message or a file opens its chat at that line, lit; a
   * link opens in the browser; a routine opens its agent.
   */
  func activate(_ row: Jump.Row, store: AppStore, window: WindowState, sidebar: SidebarState) {
    switch row {
    case .agent(let agent, _):
      sidebar.selection.plain(agent.id)
      window.open(agent.id, store: store)
    case .command(let command):
      run(command.id, sidebar: sidebar)
    case .message(let hit):
      window.reveal(hit.entryId, in: hit.agentId, store: store)
    case .file(let hit):
      window.reveal(hit.entryId, in: hit.agentId, store: store)
    case .link(let url):
      if let address = URL(string: url) { NSWorkspace.shared.open(address) }
    case .routine(let hit):
      if window.selected != hit.agentId { window.open(hit.agentId, store: store) }
    }
    close()
  }

  /**
   * An action. The themes and Open Hidden Agents work now; the rest open
   * screens copied in later steps (mac/STEPS.md): Org Chart (12), Members,
   * Channels and Chat Settings (7), Settings (8), Plugins (9).
   */
  private func run(_ id: String, sidebar: SidebarState) {
    switch id {
    case "theme:system": MacTheme.set("system")
    case "theme:light": MacTheme.set("light")
    case "theme:dark": MacTheme.set("dark")
    case "open-hidden-chats": sidebar.showsHidden = true
    default: break
    }
  }
}

// MARK: The panel

/**
 * Search over the window (`sand-command-palette`, D01–D07): the window
 * dimmed (the text colour at 50%, 70% on dark), and in its middle the
 * panel, 560 wide, 16 round, the raised ground with a hairline (15%) and a
 * deep shadow (none on dark). A click outside closes it.
 */
struct SearchLayer: View {
  @Environment(SearchState.self) private var search
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    GeometryReader { box in
      ZStack {
        if search.isOpen {
          Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5)
            .contentShape(Rectangle())
            .onTapGesture { search.close() }
            .transition(.opacity)
          SearchPanel(width: min(560, max(0, box.size.width - 32)))
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
      }
      .frame(width: box.size.width, height: box.size.height)
    }
    .animation(.easeOut(duration: 0.12), value: search.isOpen)
    .allowsHitTesting(search.isOpen)
    .accessibilityHidden(!search.isOpen)
  }
}

private struct SearchPanel: View {
  let width: CGFloat
  @Environment(SearchState.self) private var search
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar
  @Environment(\.colorScheme) private var scheme
  @FocusState private var typing: Bool

  var body: some View {
    @Bindable var search = search
    let look = Look(scheme)
    let listing = search.listing(store: store, window: window)
    let unavailable = listing.settled == .unavailable
    VStack(spacing: 0) {
      // The field (`padding 14 10 14 14`), a hairline under it.
      HStack(spacing: 4) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(look.inkTertiary)
          .frame(width: 18, height: 18)
        TextField("", text: $search.query, prompt: Text("Search").foregroundStyle(look.inkTertiary))
          .textFieldStyle(.plain)
          .font(.system(size: 14))
          .tracking(-0.15)
          .foregroundStyle(look.ink)
          .focused($typing)
          .onChange(of: search.query) { _, _ in search.typed(store: store) }
          .accessibilityLabel("Search")
        if unavailable && !listing.rows.isEmpty {
          Text("Search unavailable")
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
            .fixedSize()
        }
      }
      .frame(height: 22)
      .padding(EdgeInsets(top: 14, leading: 14, bottom: 14, trailing: 10))
      .overlay(alignment: .bottom) { Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1) }
      TabRow(tabs: listing.tabs, current: listing.tabs.contains(search.tab) ? search.tab : .all, look: look) { search.choose($0) }
      results(listing, look: look, unavailable: unavailable)
        .frame(height: 360)
    }
    .frame(width: width)
    .background(look.elevated, in: RoundedRectangle(cornerRadius: 16))
    .clipShape(RoundedRectangle(cornerRadius: 16))
    .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
    .shadow(color: .black.opacity(look.dark ? 0 : 0.56), radius: 35, x: 0, y: 22)
    .task(id: search.focus) {
      // The field takes the keys once it is in the window (a moment after it appears), and again when search is opened over itself.
      try? await Task.sleep(for: .milliseconds(30))
      typing = true
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Search")
  }

  @ViewBuilder
  private func results(_ listing: SearchState.Listing, look: Look, unavailable: Bool) -> some View {
    if listing.rows.isEmpty && listing.settled == .pending {
      Skeleton(look: look)
    } else if !listing.rows.isEmpty {
      let lit = min(max(search.highlight, 0), listing.rows.count - 1)
      ScrollViewReader { scroller in
        ScrollView {
          LazyVStack(spacing: 2) {
            ForEach(Array(listing.rows.enumerated()), id: \.element.id) { index, row in
              ResultRow(row: row, index: index, lit: index == lit, listing: listing, query: search.query,
                        tab: listing.tabs.contains(search.tab) ? search.tab : .all, shortcuts: search.modifierHeld, look: look) {
                search.activate(row, store: store, window: window, sidebar: sidebar)
              } hover: {
                if search.highlight != index { search.highlight = index }
              }
              .id(row.id)
            }
          }
          .padding(8)
        }
        .scrollIndicators(.automatic)
        .onChange(of: search.keyMoves) { _, _ in
          let rows = listing.rows
          guard !rows.isEmpty else { return }
          scroller.scrollTo(rows[min(max(search.highlight, 0), rows.count - 1)].id)
        }
      }
      .accessibilityLabel("Results")
    } else {
      Empty(listing: listing, tab: listing.tabs.contains(search.tab) ? search.tab : .all, unavailable: unavailable, look: look)
    }
  }
}

/**
 * The tabs (`Filter results`, padded 8 8 9, 2 apart): All, Messages,
 * Agents, Groups, Files, Links, Routines, Actions (the computer's four only
 * while its search is on), each 13 on 18, padded 4 8, 8 round; the chosen
 * one in the text colour on grey, the rest at 60%, grey under the pointer.
 */
private struct TabRow: View {
  let tabs: [SearchTab]
  let current: SearchTab
  let look: Look
  let choose: (SearchTab) -> Void

  var body: some View {
    HStack(spacing: 2) {
      ForEach(tabs, id: \.self) { tab in
        TabButton(title: tab.title, chosen: tab == current, look: look) { choose(tab) }
      }
      Spacer(minLength: 0)
    }
    .padding(EdgeInsets(top: 8, leading: 8, bottom: 9, trailing: 8))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Filter results")
  }
}

private struct TabButton: View {
  let title: String
  let chosen: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13))
        .tracking(-0.08)
        .foregroundStyle(chosen ? look.ink : look.inkSecondary)
        .frame(height: 18)
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(chosen || hovering ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 8))
        .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .focusable(false)
    .onHover { hovering = $0 }
    .accessibilityAddTraits(chosen ? .isSelected : [])
  }
}

// MARK: A row

/**
 * One result (`MFn`), 49 high, padded 6 10 6 8, 10 round, lit grey (17%,
 * 32% on dark) under the pointer or the arrows: its picture (24), then its
 * words (13 on 18, the query's letters in semibold; an agent's title in
 * blue beside them) over a line at 60%; a hidden agent's "Hidden" tag; the
 * theme in use ticked; at the right, with ⌘ held, ⌘1–⌘9, else on All what
 * it is ("Agent", "Action", …) and on a routine's tab its date, at 40%.
 */
private struct ResultRow: View {
  let row: Jump.Row
  let index: Int
  let lit: Bool
  let listing: SearchState.Listing
  let query: String
  let tab: SearchTab
  let shortcuts: Bool
  let look: Look
  let action: () -> Void
  let hover: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Leading(row: row, agents: listing.agentsById, look: look)
          .frame(width: 24, height: 24)
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 6) {
            title
            if case .agent(let agent, _) = row, !agent.isGroup, !agent.title.trimmingCharacters(in: .whitespaces).isEmpty {
              Text(agent.title)
                .font(.system(size: 11))
                .tracking(0.055)
                .foregroundStyle(look.blue)
                .lineLimit(1)
                .padding(.vertical, 3)
                .layoutPriority(-1)
            }
          }
          let line = subtitle
          if !line.isEmpty {
            Text(line)
              .font(.system(size: 13))
              .tracking(-0.08)
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
              .truncationMode(.tail)
              .frame(height: 18)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if case .agent(_, true) = row {
          Text("Hidden")
            .font(.system(size: 11))
            .foregroundStyle(look.inkTertiary)
            .padding(.horizontal, 4)
            .frame(height: 16)
            .background(look.rowHover, in: RoundedRectangle(cornerRadius: 3))
        }
        if case .command(let command) = row, command.isActive {
          Image(systemName: "checkmark")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
            .frame(width: 12, height: 12)
            .accessibilityLabel("Current")
        }
        trailing
      }
      .padding(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 10))
      .frame(height: 49)
      .background(lit ? look.logoTile : .clear, in: RoundedRectangle(cornerRadius: 10))
      .contentShape(RoundedRectangle(cornerRadius: 10))
    }
    .buttonStyle(.plain)
    .focusable(false)
    .onContinuousHover { phase in
      if case .active = phase { hover() }
    }
    .accessibilityAddTraits(lit ? .isSelected : [])
  }

  /** The words, bold where the query is found (`q0t`); a link's page title once read, else its address. */
  private var title: some View {
    let words: String
    if case .link(let url) = row { words = LinkTitle.known[url] ?? Jump.address(url) } else { words = row.title }
    var styled = AttributedString()
    for run in Jump.marks(words, query: query) {
      var part = AttributedString(run.text)
      part.font = .system(size: 13, weight: run.isMatch ? .semibold : .regular)
      styled += part
    }
    return Text(styled)
    .tracking(-0.08)
    .foregroundStyle(look.ink)
    .lineLimit(1)
    .truncationMode(.tail)
    .frame(height: 18)
  }

  private var subtitle: String {
    if case .link(let url) = row { return LinkTitle.known[url] == nil ? "" : Jump.address(url) }
    return Jump.subtitle(row, agents: listing.agentsById)
  }

  @ViewBuilder
  private var trailing: some View {
    if shortcuts, let number = Jump.shortcut(index) {
      HStack(spacing: 2) {
        Keycap(text: "⌘", look: look)
        Keycap(text: "\(number)", look: look)
      }
    } else if tab == .all {
      Text(row.kind)
        .font(.system(size: 12))
        .foregroundStyle(look.inkTertiary)
        .fixedSize()
    } else if let date = row.dateMs {
      Text(Chat.listTime(Date(timeIntervalSince1970: date / 1000)))
        .font(.system(size: 12))
        .foregroundStyle(look.inkTertiary)
        .fixedSize()
    }
  }
}

/** A key of a shortcut: 16 square, 3 round, 11 at 60% on grey. */
private struct Keycap: View {
  let text: String
  let look: Look

  var body: some View {
    Text(text)
      .font(.system(size: 11))
      .foregroundStyle(look.inkSecondary)
      .padding(.horizontal, text.count > 1 ? 3 : 0)
      .frame(minWidth: 16, minHeight: 16)
      .background(look.rowHover, in: RoundedRectangle(cornerRadius: 3))
  }
}

/** A row's picture: an agent's butterfly or group, an action's icon on grey, a file's kind in its colour, a link's site icon, a routine's clock on violet. */
private struct Leading: View {
  let row: Jump.Row
  let agents: [String: Agent]
  let look: Look

  var body: some View {
    switch row {
    case .agent(let agent, _):
      AgentMark(agent: agent, agents: Array(agents.values), size: 24)
    case .message(let hit):
      if let agent = agents[hit.agentId] {
        AgentMark(agent: agent, agents: Array(agents.values), size: 24)
      } else {
        tile(symbol: "bubble.left", ink: look.inkSecondary, ground: look.rowHover)
      }
    case .command(let command):
      tile(symbol: SearchIcons.symbol(command.icon), ink: look.inkSecondary, ground: look.rowHover)
    case .file(let hit):
      FileKindTile(kind: hit.kind, look: look)
    case .link(let url):
      LinkTile(url: url, look: look)
    case .routine:
      tile(symbol: "clock", ink: look.jsonKeyword, ground: Color(hex: 0x9159fe).opacity(look.dark ? 0.173 : 0.09))
    }
  }

  private func tile(symbol: String, ink: Color, ground: Color) -> some View {
    Image(systemName: symbol)
      .font(.system(size: 11, weight: .medium))
      .foregroundStyle(ink)
      .frame(width: 24, height: 24)
      .background(ground, in: RoundedRectangle(cornerRadius: 8))
  }
}

/** A file's kind (`OCe`, 24): its icon (13) in its colour on that colour at 9% (17% on dark), 6 round, a half-point edge. */
private struct FileKindTile: View {
  let kind: String
  let look: Look

  var body: some View {
    let pick = SearchIcons.file(kind)
    let tint = pick.1
    let colour = tint ?? Color(hex: 0x777777)
    Image(systemName: pick.0)
      .font(.system(size: 11, weight: .medium))
      .foregroundStyle(colour)
      .frame(width: 24, height: 24)
      .background(colour.opacity(look.dark ? 0.173 : 0.09), in: RoundedRectangle(cornerRadius: 6))
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .strokeBorder(tint.map { $0.opacity(0.17) } ?? look.ink.opacity(0.15), lineWidth: 0.5)
      }
  }
}

/** A link's site icon (14) once read, else the link icon, on the raised ground with a half-point edge, 8 round. */
private struct LinkTile: View {
  let url: String
  let look: Look
  @State private var icon: NSImage?

  var body: some View {
    Group {
      if let icon {
        Image(nsImage: icon).resizable().interpolation(.high).frame(width: 14, height: 14)
      } else {
        Image(systemName: "link").font(.system(size: 11, weight: .medium)).foregroundStyle(look.inkSecondary)
      }
    }
    .frame(width: 24, height: 24)
    .background(look.elevated, in: RoundedRectangle(cornerRadius: 8))
    .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(look.ink.opacity(0.1), lineWidth: 0.5) }
    .task(id: url) {
      let meta = await LinkMetadataReader.shared.metadata(for: url)
      let title = meta?.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      if !title.isEmpty, LinkTitle.known[url] != title { LinkTitle.known[url] = title }
      if let data = meta?.favicon { icon = NSImage(data: data) }
    }
  }
}

/** Page titles read for links this session (the window's `a4e` query cache), so a row shows its page's title over its address. */
@MainActor
@Observable
final class LinkTitle {
  static let shared = LinkTitle()
  var titles: [String: String] = [:]

  static var known: [String: String] {
    get { shared.titles }
    set { shared.titles = newValue }
  }
}

/** While the first rows are on their way (after 150 ms): five rows of grey bars that shimmer (`YFn`). */
private struct Skeleton: View {
  let look: Look
  @State private var shown = false
  @State private var phase = false
  private static let widths: [(CGFloat, CGFloat)] = [(0.58, 0.34), (0.41, 0.26), (0.67, 0.39), (0.48, 0.30), (0.36, 0.22)]

  var body: some View {
    GeometryReader { box in
      VStack(spacing: 2) {
        ForEach(0..<5, id: \.self) { index in
          let widths = Self.widths[index]
          HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 8).fill(bar).frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 4) {
              RoundedRectangle(cornerRadius: 4).fill(bar).frame(width: (box.size.width - 66) * widths.0, height: 9)
              RoundedRectangle(cornerRadius: 4).fill(bar).frame(width: (box.size.width - 66) * widths.1, height: 7)
            }
            Spacer(minLength: 0)
          }
          .padding(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 10))
          .frame(height: 49)
        }
        Spacer(minLength: 0)
      }
      .padding(8)
    }
    .opacity(shown ? (phase ? 0.6 : 1) : 0)
    .task {
      try? await Task.sleep(for: .milliseconds(150))
      withAnimation(.easeOut(duration: 0.12)) { shown = true }
      withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { phase = true }
    }
    .accessibilityHidden(true)
  }

  private var bar: Color { look.ink.opacity(look.dark ? 0.1 : 0.06) }
}

/**
 * Nothing to list: "No results" (13, 60%) for words that find nothing;
 * otherwise the tab's own words under its icon (24 at 30%: the glass for
 * Messages, people for the rest), 13 at 500, and a line under them (12,
 * 40%), in the middle.
 */
private struct Empty: View {
  let listing: SearchState.Listing
  let tab: SearchTab
  let unavailable: Bool
  let look: Look

  var body: some View {
    VStack(spacing: 8) {
      if listing.filtered && !unavailable {
        Text("No results")
          .font(.system(size: 13))
          .tracking(-0.08)
          .foregroundStyle(look.inkSecondary)
      } else {
        let empty = Jump.empty(tab: tab, unavailable: unavailable)
        Image(systemName: empty.glass ? "magnifyingglass" : "person.2")
          .font(.system(size: 20))
          .foregroundStyle(look.ink.opacity(0.3))
          .frame(width: 24, height: 24)
        Text(empty.label)
          .font(.system(size: 13, weight: .medium))
          .tracking(-0.08)
          .foregroundStyle(look.inkSecondary)
        if let hint = empty.hint {
          Text(hint)
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
        }
      }
    }
    .multilineTextAlignment(.center)
    .padding(.horizontal, 16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/** The window's icon names as SF Symbols. */
enum SearchIcons {
  static func symbol(_ name: String) -> String {
    switch name {
    case "organization-filled": return "person.3"
    case "eye-slash": return "eye.slash"
    case "people": return "person.2"
    case "chat-bubbles": return "bubble.left.and.bubble.right"
    case "settings-gear": return "gearshape"
    case "chart-bars": return "chart.bar"
    case "plug": return "powerplug"
    case "display": return "display"
    case "sun": return "sun.max"
    case "moon": return "moon"
    case "device-desktop": return "desktopcomputer"
    default: return "circle"
    }
  }

  /** A file's kind (`tin`): its icon and colour (none: the neutral grey). */
  static func file(_ kind: String) -> (String, Color?) {
    switch kind {
    case "document", "text", "markdown": return ("doc.text", Color(hex: 0x1084fe))
    case "pdf": return ("doc.richtext", Color(hex: 0xff263c))
    case "table": return ("tablecells", Color(hex: 0x00c972))
    case "shell": return ("terminal", Color(hex: 0x00c972))
    case "json": return ("curlybraces", Color(hex: 0xff9800))
    case "audio": return ("music.note", Color(hex: 0xff309b))
    case "image": return ("photo", Color(hex: 0xff6700))
    case "video": return ("video", Color(hex: 0xff6700))
    case "archive": return ("archivebox", nil)
    default: return ("doc", nil)
    }
  }
}
