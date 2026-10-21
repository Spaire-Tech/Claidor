import AppKit
import SwiftUI
import SimeonCore

/**
 * Connectors (`overlay:plugins`, K01–K09; "Plugins" until 13 October 2026,
 * when it took the iPhone's Connectors: "in mac design it better for it to
 * match iphone. use apple style picker"): in Settings' place over the whole
 * window (one overlay at a time), the same panel and dim. "Connectors", the
 * search in glass with the filter beside it, Available | Yours as Apple's
 * segmented control in our glass (not the Mac's blue one); the catalog by
 * section, every app shown, one to a row as on the iPhone; a plugin's page
 * (Add, Uninstall, its accounts, tools, setup values, connectors, skills),
 * a server's page, the setup page, a skill's page; the notice at the
 * bottom. Opened by Connect apps, ⌘K and "/" "Plugins", ⌘⇧M, ⌘⇧W and a
 * plugin's link; Escape (after the search's own), × or a click on the dim
 * close it, and closing forgets the view. Measured in mac/STEPS.md, step 9.
 * Its rows and pages in the iPhone's parts (21 October 2026, the founder:
 * "same for connectors. make it match the iphone app"), laid out as the
 * founder's reference (ChatGPT's Plugins): a wide panel; the search across
 * it, bordered; each section's name in the ink with its ›, which opens all
 * its apps, over its first six in two columns; each app's own icon, its
 * name over what it does, and + at the row's end (the green tick once it is
 * in, the spinner while it connects, "Coming soon" said quietly). Back and
 * × are the window's round glass buttons. A click outside closes it.
 */
@MainActor
@Observable
final class PluginsState {
  /** What an opener asks for (`uSe`, `qRn`, `RRn`, `focusBrowseQuery`, a workflow). */
  enum Opening: Equatable {
    case marketplace
    case plugin(String)
    case server(String)
    case query(String)
    case skill(String)
  }

  private(set) var isOpen = false {
    didSet { PluginsState.showing = isOpen }
  }
  /** Bumped at each opening: the panel is drawn afresh, and the computer read again. */
  private(set) var opening = 0
  /** ⌘F asks the search for the keys. */
  private(set) var searchFocus = 0
  let model = PluginsModel()
  /** Settings, which takes the same place: opening Plugins closes it (set by the app). */
  @ObservationIgnored weak var settings: SettingsState?

  /** Plugins is over the window: the window's own keys under it wait. */
  static var showing = false

  func open(_ what: Opening = .marketplace) {
    settings?.close()
    if !isOpen {
      model.reset()
      opening += 1
      // Nothing behind keeps the keys.
      NSApp.keyWindow?.makeFirstResponder(nil)
    }
    switch what {
    case .marketplace:
      model.tab = .marketplace
      model.path = []
    case .plugin(let id):
      model.tab = .marketplace
      model.path = [.plugin(id)]
    case .server(let id):
      model.tab = .yours
      model.path = [.installed(id)]
    case .query(let text):
      model.tab = .marketplace
      model.query = text
      model.path = []
    case .skill(let id):
      model.tab = .yours
      model.path = [.skill(id)]
    }
    isOpen = true
  }

  func close() {
    guard isOpen else { return }
    NSApp.keyWindow?.makeFirstResponder(nil)
    isOpen = false
    model.reset()
  }

  /** ⌘F: the search, on the list (a page has none, and the chat behind does not get it either). */
  func focusSearch() {
    guard isOpen, model.path.isEmpty else { return }
    searchFocus += 1
  }
}

/** The dim and the panel, over the window (under search); the computer read at each opening and every 15 s while it is open. */
struct PluginsLayer: View {
  @Environment(PluginsState.self) private var plugins
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    if plugins.isOpen {
      let look = Look(scheme)
      GeometryReader { box in
        ZStack {
          Color.black.opacity(0.5)
            .contentShape(Rectangle())
            .onTapGesture { plugins.close() }
          PluginsPanel(look: look)
            .frame(width: max(0, min(1080, box.size.width - 48)), height: max(0, min(860, box.size.height - 64)))
            .id(plugins.opening)
        }
        .frame(width: box.size.width, height: box.size.height)
      }
      .ignoresSafeArea()
      .task(id: plugins.opening) {
        let model = plugins.model
        model.store = store
        // Which apps can't be added yet, from Simeon Labs' server, while the rest loads.
        async let soon: Void = store.loadAppsComingSoon()
        await model.load(agentId: window.selected)
        await soon
        // The servers every 15 s while it is open (`retainServers`).
        while !Task.isCancelled {
          try? await Task.sleep(nanoseconds: 15_000_000_000)
          guard !Task.isCancelled else { return }
          await model.refreshServers()
        }
      }
      .onChange(of: window.selected) { _, agentId in Task { await plugins.model.loadSkills(agentId) } }
      .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
        Task { await plugins.model.refreshServers() }
      }
    }
  }
}

/** The panel: Settings' (14 round, a line at 15%, the grouped ground with its shadows); its head, the bar on the list, the scroll pane, the notice. */
private struct PluginsPanel: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    VStack(spacing: 0) {
      PanelHead(page: model.path.last, look: look)
      if model.path.isEmpty { PluginsBar(look: look) }
      ZStack {
        // The list stays drawn under a page, so Back finds it where it was left.
        PluginsList(look: look)
          .opacity(model.path.isEmpty ? 1 : 0)
          .allowsHitTesting(model.path.isEmpty)
          .disabled(!model.path.isEmpty)
          .accessibilityHidden(!model.path.isEmpty)
        if let page = model.path.last {
          PluginPages(page: page, look: look)
            .id(page)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .overlay(alignment: .bottom) { NoticeBar(look: look) }
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.settingsPanel))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
    .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(look.dark ? 0 : 0.10), radius: 0.5)
    .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(look.dark ? 0 : 0.45), radius: 28, x: 0, y: 30)
    // A click on the panel is the panel's, not the dim's.
    .contentShape(Rectangle())
    .onTapGesture {}
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Connectors")
    .accessibilityAddTraits(.isModal)
  }
}

/**
 * The panel's head (36 high, 20 from its top and sides): on a page, Back as
 * the window's round glass button and the page's name (15 semibold); on the
 * list, "Connectors" (20 semibold); × in the same glass at the right.
 */
private struct PanelHead: View {
  let page: PluginsModel.Page?
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    HStack(spacing: 12) {
      if let page {
        GlassDiscButton(symbol: "chevron.left", help: String(localized: "Back")) { model.path.removeLast() }
        Text(PluginPages.title(page, model: model))
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .accessibilityAddTraits(.isHeader)
      } else {
        Text("Connectors")
          .font(.system(size: 20, weight: .semibold))
          .tracking(-0.3)
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .accessibilityAddTraits(.isHeader)
      }
      Spacer(minLength: 12)
      GlassDiscButton(symbol: "xmark", help: String(localized: "Close")) { plugins.close() }
    }
    .frame(height: 36)
    .padding(EdgeInsets(top: 20, leading: 20, bottom: 4, trailing: 20))
  }
}

// MARK: - The bar

/**
 * Under the head: the search across the panel with the filter beside it,
 * then Available | Yours (GlassSegments) at the left; 16 under the head, 24
 * at the sides, 8 under.
 */
private struct PluginsBar: View {
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 10) {
        PluginsSearch(look: look)
        FilterButton(look: look)
      }
      GlassSegments(look: look)
    }
    .padding(EdgeInsets(top: 16, leading: 24, bottom: 8, trailing: 24))
  }
}

/**
 * Available | Yours, as Apple's segmented control in our glass (the
 * founder, 13 October 2026: "use apple style picker", and of the Mac's own,
 * "whats that blue picker"): a capsule of glass (the material before macOS
 * 26), 34 high and 280 wide; the chosen half a lighter capsule that slides
 * to it (white and lifted on light, the grey on dark), its word in the ink
 * at 13 medium, the other at 60%. Chosen on the click.
 */
private struct GlassSegments: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Namespace private var thumb

  var body: some View {
    HStack(spacing: 0) {
      segment(String(localized: "Available"), .marketplace)
      segment(String(localized: "Yours"), .yours)
    }
    .padding(3)
    .frame(width: 280, height: 34)
    .liquidGlass(in: Capsule())
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Show")
  }

  private func segment(_ title: String, _ tab: PluginsModel.Tab) -> some View {
    let model = plugins.model
    let chosen = model.tab == tab
    return Button {
      guard !chosen else { return }
      withAnimation(.snappy(duration: 0.22)) { model.tab = tab }
    } label: {
      Text(title)
        .font(.system(size: 13, weight: chosen ? .medium : .regular))
        .foregroundStyle(chosen ? look.ink : look.inkSecondary)
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
          if chosen {
            Capsule()
              .fill(look.dark ? Color.white.opacity(0.14) : Color.white)
              .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(look.dark ? 0 : 0.12), radius: 1.5, x: 0, y: 1)
              .matchedGeometryEffect(id: "chosen", in: thumb)
          }
        }
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    // No keyboard ring around a half (the Mac's blue focus ring; the search panel's tabs do the same).
    .focusable(false)
    .accessibilityLabel(title)
    .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
  }
}

/** Filter (40, the window's round glass button, as high as the search): its glyph in the discs' ink, in the blue while the tab's filter is set (the iPhone's); its menu stays open while choosing. */
private struct FilterButton: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @State private var spot = WindowSpot()

  var body: some View {
    let model = plugins.model
    let active = !model.filter.isAll
    GlassDiscButton(symbol: "line.3.horizontal.decrease", help: String(localized: "Filter connectors"), size: 40, tinted: active) {
      FilterMenu.show(model: model, under: spot.frame)
    }
    .background(WindowSpotReader(spot: spot))
    .accessibilityAddTraits(active ? .isSelected : [])
  }
}

/** The Filter menu (`ii`, at least 180 wide): Type (All types, Connectors, Skills), a line, Ownership (All, Team, Public); one choice each, and a pick does not close it. */
@MainActor
private enum FilterMenu {
  static func show(model: PluginsModel, under frame: CGRect) {
    let menu = NSMenu(title: String(localized: "Filter connectors"))
    menu.autoenablesItems = false
    menu.minimumWidth = 180
    var types: [(PluginFilter.Kind, CheckMenuRow)] = []
    var owners: [(PluginFilter.Ownership, CheckMenuRow)] = []
    func refresh() {
      for (kind, row) in types { row.isOn = model.filter.type == kind }
      for (owner, row) in owners { row.isOn = model.filter.ownership == owner }
    }
    menu.addItem(.sectionHeader(title: String(localized: "Type")))
    for kind in PluginFilter.Kind.allCases {
      let row = CheckMenuRow(title: PluginFilter.label(kind), on: model.filter.type == kind, width: 180, radio: true) { _ in
        model.filter.type = kind
        refresh()
      }
      types.append((kind, row))
      menu.addItem(CheckMenuRow.item(row))
    }
    menu.addItem(.separator())
    menu.addItem(.sectionHeader(title: String(localized: "Ownership")))
    for owner in PluginFilter.Ownership.allCases {
      let row = CheckMenuRow(title: PluginFilter.label(owner), on: model.filter.ownership == owner, width: 180, radio: true) { _ in
        model.filter.ownership = owner
        refresh()
      }
      owners.append((owner, row))
      menu.addItem(CheckMenuRow.item(row))
    }
    RoutineMenus.popUp(menu, under: frame)
  }
}

/**
 * "Search connectors" (the bar's width, 40 high), the founder's reference: a
 * white capsule with a hairline edge, the glass and the words in grey, ×
 * once something is typed; no blue ring when it has the keys (13 October
 * 2026: "what is that search bar? that has blue underline when you
 * click?"), the edge a touch darker. Follows each key.
 */
private struct PluginsSearch: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @FocusState private var focused: Bool
  /** ⌘F asked: the words are picked once the field has the keys. */
  @State private var selectsOnFocus = false

  var body: some View {
    @Bindable var model = plugins.model
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 15, weight: .regular))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 18, height: 18)
      TextField("", text: $model.query, prompt: Text("Search connectors").foregroundStyle(look.inkTertiary))
        .textFieldStyle(.plain)
        .font(.system(size: 15))
        .foregroundStyle(look.ink)
        .autocorrectionDisabled()
        .focused($focused)
        .accessibilityLabel("Search connectors")
      if !model.query.isEmpty {
        Button { model.query = "" } label: {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 13))
            .foregroundStyle(look.inkTertiary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, 16)
    .frame(maxWidth: .infinity)
    .frame(height: 40)
    .background(Capsule().fill(look.dark ? Color.white.opacity(0.05) : Color.white))
    .overlay(Capsule().strokeBorder(look.ink.opacity(focused ? 0.22 : 0.12), lineWidth: 1))
    .contentShape(Capsule())
    .onTapGesture { focused = true }
    .onChange(of: plugins.searchFocus) { _, _ in
      // And its words picked, as the window's ⌘F selects them.
      if focused { Self.selectAll() } else { selectsOnFocus = true; focused = true }
    }
    .onChange(of: focused) { _, now in
      guard now, selectsOnFocus else { return }
      selectsOnFocus = false
      DispatchQueue.main.async { Self.selectAll() }
    }
  }
}

extension PluginsSearch {
  static func selectAll() { NSApp.sendAction(#selector(NSResponder.selectAll(_:)), to: nil, from: nil) }
}

// MARK: - The list

/** The scroll pane (padded 22, 32 and 28): Marketplace or Yours, drawn afresh at the top for each tab. */
private struct PluginsList: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        if model.tab == .marketplace { MarketplaceList(look: look) } else { YoursList(look: look) }
      }
      .padding(EdgeInsets(top: 4, leading: 10, bottom: 32, trailing: 10))
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .scrollIndicators(.automatic)
    .id(model.tab)
  }
}

/** How many of a section's apps Available shows under its name (two columns of three, the founder's reference); the name opens the rest. */
enum PluginsPreview {
  static let count = 6
}

/** Available (`ci`): the sections (Featured, then A–Z), each its first six under its name and ›, or "Results" while searching, every match. */
private struct MarketplaceList: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    let entries = MarketplaceList.entries(model)
    let searching = !model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    if entries.isEmpty {
      YoursEmpty(text: Plugins.marketplaceEmpty(loaded: model.catalogLoaded, catalogEmpty: model.catalog.isEmpty, filterSet: !model.marketplaceFilter.isAll, query: model.query), look: look)
        .padding(.top, 18)
    } else if searching {
      MarketplaceSection(title: String(localized: "Results"), entries: entries, look: look)
    } else {
      ForEach(Plugins.sections(entries), id: \.key) { section in
        MarketplaceSection(title: section.title, entries: Array(section.items.prefix(PluginsPreview.count)), look: look) {
          model.path.append(.category(section.key))
        }
      }
    }
  }

  /** What Available lists: the catalog as the search and the filter keep it. */
  static func entries(_ model: PluginsModel) -> [PluginEntry] {
    Plugins.search(model.catalog, model.query).filter { Plugins.keeps($0, model.marketplaceFilter) }
  }
}

/** A section's apps on a page of their own (its name's ›): all of them, in two columns. */
private struct CategoryPage: View {
  let key: String
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    let section = Plugins.sections(model.catalog.filter { Plugins.keeps($0, model.marketplaceFilter) }).first { $0.key == key }
    if let section {
      MarketplaceSection(title: nil, entries: section.items, look: look)
    } else {
      YoursEmpty(text: Plugins.noFilterMatch, look: look)
    }
  }
}

private struct MarketplaceSection: View {
  /** The section's name, over its apps; none on the section's own page. */
  let title: String?
  let entries: [PluginEntry]
  let look: Look
  /** Its name's ›: the section's page. */
  var open: (() -> Void)? = nil
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window

  var body: some View {
    let model = plugins.model
    VStack(alignment: .leading, spacing: 0) {
      if let title { SectionHeading(title: title, look: look, open: open) }
      PluginsGrid(look: look) {
        ForEach(entries) { entry in
          // An app that can't be added yet: dimmed, "Coming soon" in place of Add (`AppsComingSoon`).
          let soon = !model.installed(entry).isInstalled && model.comingSoon(entry)
          PluginRow(title: entry.displayName, line: entry.description, team: Plugins.teamMark(entry), look: look, dimmed: soon,
                    icon: { PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, id: entry.id, look: look) },
                    open: { model.path.append(.plugin(entry.id)) }) {
            // One Connect (`Connecting`, 13 October 2026): an app shows Connected only once it is signed in; the
            // iPhone's marks (21 October 2026): +, the green tick, the spinner, Coming soon in words.
            if model.adding == entry.id {
              AddingSpinner(name: entry.displayName, look: look)
            } else if model.installed(entry).isInstalled {
              let server = model.serverState(entry)
              if entry.connectorList.isEmpty || server == nil {
                AddedMark(title: String(localized: "Added"), look: look)
              } else if let server {
                ServerMark(server: server, name: entry.displayName, look: look)
              }
            } else if soon {
              SoonWord(look: look)
                .accessibilityLabel("\(entry.displayName) is coming soon")
            } else {
              PlusMark(disabled: model.isBusy, look: look) {
                model.requestAdd(entry, agentId: window.selected)
              }
              .accessibilityLabel("Connect \(entry.displayName)")
            }
          }
        }
      }
    }
  }
}

/** Yours (`ki`): the GitHub banner, Installed (all of them), Private (the open agent's skills). */
private struct YoursList: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window

  var body: some View {
    let model = plugins.model
    let q = model.query.trimmingCharacters(in: .whitespacesAndNewlines)
    let filter = model.yoursFilter
    let found = Plugins.search(model.onePerServer, q)
    let items = Plugins.items(found, catalog: model.catalog, plugins: model.plugins).filter { Plugins.keeps($0, query: q) && Plugins.keeps($0, filter) }
    let skills = Plugins.privateSkills(model.skills).filter { (q.isEmpty || $0.name.lowercased().contains(q.lowercased())) && Plugins.keeps($0, filter) }
    let agentId = window.selected
    let showsInstalled = filter.isAll || !items.isEmpty
    let showsPrivate = filter.isAll || agentId == nil || !skills.isEmpty
    if !model.authBlocked.isEmpty { GitHubBanner(look: look) }
    if !showsInstalled && !showsPrivate { YoursEmpty(text: Plugins.noFilterMatch, look: look) }
    if showsInstalled {
      VStack(alignment: .leading, spacing: 0) {
        SectionHeading(title: String(localized: "Installed"), look: look)
        if items.isEmpty {
          YoursEmpty(text: Plugins.installedEmpty(query: q), look: look)
        } else {
          PluginsGrid(look: look) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in InstalledRow(item: item, look: look) }
          }
        }
      }
    }
    if showsPrivate {
      VStack(alignment: .leading, spacing: 0) {
        SectionHeading(title: String(localized: "Private"), look: look)
        if agentId == nil || skills.isEmpty {
          YoursEmpty(text: Plugins.privateEmpty(agentOpen: agentId != nil, query: q), look: look)
        } else {
          PluginsGrid(look: look) {
            ForEach(skills) { skill in
              PluginRow(title: skill.name, line: skill.subtitle, team: nil, look: look,
                        icon: { SkillTile(side: 40, look: look) },
                        open: { model.path.append(.skill(skill.id)) }) {
                if skill.source == "workflow" {
                  PluginSwitch(on: skill.isEnabledForAgent, label: String(localized: "Enable \(skill.name)"), look: look) {
                    Task { await model.setEnabled(skill, agentId: agentId) }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

/** A row of Installed: a plugin with its first connector's state, or a server of its own. */
private struct InstalledRow: View {
  let item: PluginItem
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    switch item {
    case .plugin(let entry, let mode, let connectors):
      PluginRow(title: entry.displayName, line: Plugins.contributions(entry), team: Plugins.modeLabel(mode), look: look,
                icon: { PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, id: entry.id, look: look) },
                open: { model.path.append(.plugin(entry.id)) }) {
        if let first = connectors.first { ServerMark(server: first, name: entry.displayName, look: look) }
      }
    case .connector(let server, let mode):
      let entry = Plugins.entry(for: server, in: model.catalog)
      PluginRow(title: server.name, line: Plugins.contributions(server, catalog: model.catalog), team: Plugins.modeLabel(mode), look: look,
                icon: { PluginIcon(name: server.name, iconUrl: entry?.iconUrl, id: entry?.id, look: look) },
                open: { model.path.append(.installed(server.id)) }) {
        ServerMark(server: server, name: server.name, look: look)
      }
    }
  }
}

/**
 * A server at a row's end, as the iPhone's rows end: the green tick once it
 * is signed in; + when it waits on a sign-in (+ then only signs it in), or
 * Reopen and Retry while its page is open or has waited too long; else its
 * status word (Connecting…, Error).
 */
private struct ServerMark: View {
  let server: PluginServer
  let name: String
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    if server.status == "connected" {
      AddedMark(title: Connecting.connected, look: look)
    } else if server.status == "needsAuth" {
      let state = model.signInState(server, accountKey: server.accountKey)
      if state == Plugins.SignInState.none {
        PlusMark(disabled: model.isBusy, look: look) { model.requestSignIn(server, accountKey: server.accountKey) }
          .accessibilityLabel("Connect \(name)")
      } else {
        PluginPill(title: Plugins.signInButton(state), kind: .secondary, disabled: model.isBusy, look: look) {
          model.requestSignIn(server, accountKey: server.accountKey)
        }
        .accessibilityLabel("Connect \(name)")
      }
    } else {
      StatusWord(status: server.status, detail: server.statusDetail, look: look)
    }
  }
}

// MARK: - Rows and their parts

/** A section's name (17 semibold, the ink), the founder's reference: with its › (opening all its apps) when it has a page; 28 over it and 10 under, in line with the rows' icons. */
private struct SectionHeading: View {
  let title: String
  let look: Look
  var open: (() -> Void)? = nil
  @State private var hovering = false

  var body: some View {
    Group {
      if let open {
        Button(action: open) {
          HStack(spacing: 6) {
            Text(title)
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(look.ink)
            Image(systemName: "chevron.right")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(look.inkTertiary)
              .offset(x: hovering ? 2 : 0)
              .animation(.easeOut(duration: 0.15), value: hovering)
          }
          .lineLimit(1)
          .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .onHover { hovering = $0 }
        .accessibilityHint("Shows every app in \(title)")
      } else {
        Text(title)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(look.ink)
          .lineLimit(1)
      }
    }
    .padding(EdgeInsets(top: 28, leading: 14, bottom: 10, trailing: 14))
    .accessibilityAddTraits(.isHeader)
  }
}

/** Two apps to a line (the founder's reference; one to a line from 13 to 21 October 2026), 2 apart. */
private struct PluginsGrid<Content: View>: View {
  let look: Look
  @ViewBuilder let content: Content

  var body: some View {
    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12, alignment: .top), GridItem(.flexible(), spacing: 12, alignment: .top)], alignment: .leading, spacing: 2) {
      content
    }
  }
}

/** Yours' empty lines (the iPhone's: 13 in the grey, in line with the rows' icons). */
private struct YoursEmpty: View {
  let text: String
  let look: Look

  var body: some View {
    Text(text)
      .font(.system(size: 13))
      .lineSpacing(2)
      .foregroundStyle(look.inkSecondary)
      .padding(.horizontal, 14)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/**
 * A row, the founder's reference (ChatGPT's Plugins) and the iPhone's
 * `AppRow` (at least 68, padded 14 and 12): the open part (the app's icon,
 * 40, then its name at 15 with its Team mark over what it does at 13 in
 * grey, each cut short) and its mark. No card and no line: the grey under
 * the pointer, 14 round.
 */
private struct PluginRow<Icon: View, Trailing: View>: View {
  let title: String
  let line: String
  let team: String?
  let look: Look
  /** Faded, for an app that can't be added yet. */
  var dimmed = false
  @ViewBuilder let icon: Icon
  let open: () -> Void
  @ViewBuilder let trailing: Trailing
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 12) {
      Button(action: open) {
        HStack(spacing: 14) {
          icon
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
              Text(title)
                .font(.system(size: 15))
                .foregroundStyle(look.ink)
                .lineLimit(1)
                .truncationMode(.tail)
              if let team { TeamBadge(tip: team, look: look) }
            }
            if !line.isEmpty {
              Text(line)
                .font(.system(size: 13))
                .foregroundStyle(look.inkSecondary)
                .lineLimit(1)
                .truncationMode(.tail)
            }
          }
          Spacer(minLength: 0)
        }
        .opacity(dimmed ? 0.6 : 1)
        .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .accessibilityLabel("Open \(title)")
      trailing
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .frame(minHeight: 68)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(hovering ? look.groupedRow : .clear))
    .onHover { hovering = $0 }
  }
}

/** Team (`it`, 18 high): people and "Team" at 11 in the faint grey on a faint fill; its tooltip the marketplace's name or the team's words. */
private struct TeamBadge: View {
  let tip: String
  let look: Look

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "person.2").font(.system(size: 10))
      Text("Team").font(.system(size: 11))
    }
    .foregroundStyle(look.inkTertiary)
    .padding(EdgeInsets(top: 1, leading: 5, bottom: 1, trailing: 6))
    .frame(height: 18)
    .background(Capsule().fill(look.ink.opacity(0.07)))
    .help(tip)
    .fixedSize()
  }
}

/**
 * An app's icon (`ToolIcon`), as the iPhone draws it: the app's own icon,
 * whole, with an app icon's corners and a hairline (`AppIcons`, shared with
 * the iPhone; 21 October 2026, the founder: "the icons"); else its logo at
 * 76% of a tile (13 October 2026: "bigger the logos"), white with a hairline
 * edge (light) or the raised grey (dark); else its first letter. 40 on a
 * row, 56 on a page.
 */
private struct PluginIcon: View {
  let name: String
  let iconUrl: String?
  var side: CGFloat = 40
  /** The catalogue's id, when the caller has it; the name finds the icon otherwise. */
  var id: String? = nil
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    if let icon = AppLogoTile.appIcon(id: id, name: name) {
      AppIconImage(icon: icon, side: side, look: look)
    } else {
      tile
    }
  }

  @ViewBuilder
  private var tile: some View {
    let model = plugins.model
    let bundled = AppLogoTile.logo(name)
    let image = bundled ?? iconUrl.flatMap { model.logos[$0] }
    let shape = RoundedRectangle(cornerRadius: side * 11 / 40, style: .continuous)
    ZStack {
      shape.fill(look.dark ? Color(hex: 0x232325) : Color.white)
      if let image {
        Image(nsImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fit)
          .frame(width: side * 0.76, height: side * 0.76)
      } else {
        Text(String(name.prefix(1)).uppercased())
          .font(.system(size: side * 0.36, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
      }
    }
    .frame(width: side, height: side)
    .overlay(shape.strokeBorder(look.ink.opacity(look.dark ? 0.12 : 0.08), lineWidth: 0.5))
    .task(id: iconUrl) {
      guard bundled == nil, let iconUrl else { return }
      await model.loadLogo(iconUrl)
    }
    .accessibilityHidden(true)
  }
}

/** A skill's tile: the list mark on a faint fill, an app icon's corners (a row's, 40, without its edge). */
private struct SkillTile: View {
  let side: CGFloat
  let look: Look

  var body: some View {
    let row = side < 50
    let shape = RoundedRectangle(cornerRadius: side * 11 / 40, style: .continuous)
    Image(systemName: "list.bullet.rectangle")
      .font(.system(size: row ? 16 : 20))
      .foregroundStyle(row ? look.inkSecondary : look.ink)
      .frame(width: side, height: side)
      .background(shape.fill(look.ink.opacity(row ? 0.06 : 0.03)))
      .overlay {
        if !row { shape.strokeBorder(look.ink.opacity(0.10), lineWidth: 1) }
      }
      .accessibilityHidden(true)
  }
}

/**
 * A pill, the iPhone's `PluginPill` (13 medium, 26 high, 12 either side,
 * round): secondary (the iPhone's grey, darker under the pointer), primary
 * (Connect's blue with white words), a team's label (the grey, grey words,
 * not a button) or Coming soon (the grey, fainter words, not a button).
 * Faded to 56% while it waits.
 */
private struct PluginPill: View {
  enum Kind { case secondary, primary, label, soon }
  let title: String
  let kind: Kind
  var disabled = false
  let look: Look
  var action: () -> Void = {}
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.horizontal, 12)
        .frame(height: 26)
        .background(Capsule().fill(fill))
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .disabled(disabled || kind == .label || kind == .soon)
    .opacity(disabled ? 0.56 : 1)
    .onHover { hovering = $0 }
    .fixedSize()
  }

  private var ink: Color {
    switch kind {
    case .secondary: return look.ink
    case .primary: return .white
    case .label: return look.inkSecondary
    case .soon: return look.inkTertiary
    }
  }

  private var fill: Color {
    let live = hovering && !disabled
    switch kind {
    case .secondary: return live ? look.fillHover : look.pluginPill
    case .primary: return look.authenticate.opacity(live ? 0.88 : 1)
    case .label, .soon: return look.pluginPill
    }
  }
}

/** While its add runs (`dt`, in the marks' 32 square): a 17.5 ring turning every 0.7 s, its bottom quarter fainter. */
private struct AddingSpinner: View {
  let name: String
  let look: Look
  @State private var turning = false

  var body: some View {
    ZStack {
      Circle().stroke(look.inkTertiary, lineWidth: 2)
      // Three quarters in the darker grey: all but the bottom side, as the window's ring has it.
      Circle().trim(from: 0, to: 0.75).stroke(look.inkSecondary, lineWidth: 2).rotationEffect(.degrees(135))
    }
    .frame(width: 17.5, height: 17.5)
    .rotationEffect(.degrees(turning ? 360 : 0))
    .frame(width: 32, height: 32)
    .onAppear { withAnimation(.linear(duration: 0.7).repeatForever(autoreverses: false)) { turning = true } }
    .accessibilityElement()
    .accessibilityLabel("Connecting \(name)")
  }
}

/** Connected (`di`; "Added" for a plugin of skills alone), the iPhone's `ConnectorMark.added`: the tick in green, in the marks' 32 square, its word for the ear and the pointer. Not a button. */
private struct AddedMark: View {
  var title = Connecting.connected
  let look: Look

  var body: some View {
    Image(systemName: "checkmark")
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(look.success)
      .frame(width: 32, height: 32)
      .help(title)
      .accessibilityElement()
      .accessibilityLabel(title)
  }
}

/** Connect, the iPhone's `ConnectorMark.plus`: + in the ink (18, light) in a 32 square, a faint disc under the pointer. */
private struct PlusMark: View {
  var disabled = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "plus")
        .font(.system(size: 18, weight: .light))
        .foregroundStyle(look.ink)
        .frame(width: 32, height: 32)
        .background(Circle().fill(hovering && !disabled ? look.groupedRowHover : .clear))
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .opacity(disabled ? 0.45 : 1)
    .onHover { hovering = $0 }
    .help(Connecting.connect)
  }
}

/** An app that can't be added yet (`AppsComingSoon`), the iPhone's `ConnectorMark.soon`: said quietly, no +. */
private struct SoonWord: View {
  let look: Look

  var body: some View {
    Text(AppsComingSoon.label)
      .font(.system(size: 12))
      .foregroundStyle(look.inkTertiary)
      .fixedSize()
  }
}

/** A status (`lt`): its word at 13, green, orange, red or grey; an error's detail as its tooltip. */
private struct StatusWord: View {
  let status: String
  let detail: String?
  let look: Look

  var body: some View {
    Text(Plugins.statusWord(status))
      .font(.system(size: 13))
      .foregroundStyle(look.tone(Plugins.tone(status)))
      .lineLimit(1)
      .fixedSize()
      .help(status == "error" ? detail ?? "" : "")
  }
}

/** The iPhone's switch: Apple's own at its size, in Settings' blue; changed at once. */
private struct PluginSwitch: View {
  let on: Bool
  let label: String
  var disabled = false
  let look: Look
  let flip: () -> Void

  var body: some View {
    Toggle("", isOn: Binding(get: { on }, set: { _ in flip() }))
      .toggleStyle(.switch)
      .labelsHidden()
      .tint(look.settingsBlue)
      .handCursor()
      .disabled(disabled)
      .accessibilityLabel(label)
  }
}

/** The GitHub banner (`Yours`): what can't be fetched, and Fix with agent ("Opening…" while it starts). */
private struct GitHubBanner: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window
  @Environment(AppStore.self) private var store

  var body: some View {
    let model = plugins.model
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Complete GitHub auth to sync installed plugins")
          .font(.system(size: 12))
          .foregroundStyle(look.warning)
        Text(Plugins.authBlockedLine(model.authBlocked))
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      PluginPill(title: model.launchingFix ? String(localized: "Opening…") : String(localized: "Fix with agent"), kind: .secondary, disabled: model.launchingFix, look: look) {
        Task {
          guard let id = await model.fixWithAgent() else { return }
          window.choose(id, store: store)
          plugins.close()
        }
      }
    }
    .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 10))
    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(hex: 0xff9800).opacity(look.dark ? 0.173 : 0.09)))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.10), lineWidth: 0.5))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Plugin content needs GitHub authentication")
  }
}

/** The notice (`TKn`): at the panel's foot, 20 in from its sides and 16 above its edge; tinted green or red; a tick or a cross, the words, Dismiss. 3.5 s, or 6 s for a failure. */
private struct NoticeBar: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    if let notice = model.notice {
      let ink = notice.isError ? look.danger : look.success
      HStack(spacing: 8) {
        Image(systemName: notice.isError ? "xmark" : "checkmark")
          .font(.system(size: 11, weight: .semibold))
          .frame(width: 13, height: 13)
        Text(notice.text)
          .font(.system(size: 12.5))
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
        Button { model.show(nil) } label: {
          Image(systemName: "xmark")
            .font(.system(size: 10, weight: .semibold))
            .frame(width: 18, height: 18)
            .contentShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.hand)
        .opacity(0.7)
        .accessibilityLabel("Dismiss")
      }
      .foregroundStyle(ink)
      .padding(.vertical, 9)
      .padding(.horizontal, 12)
      .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(notice.isError ? look.noticeErrorFill : look.noticeSuccessFill))
      .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(ink.opacity(0.38), lineWidth: 1))
      .shadow(color: Color.black.opacity(look.dark ? 0 : 0.1), radius: 8, x: 0, y: 6)
      .padding(.horizontal, 20)
      .padding(.bottom, 16)
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.updatesFrequently)
    }
  }
}

// MARK: - Pages

/** The page on top of the stack: a plugin's, a server's, the setup page, a skill's; one whose thing has gone closes itself. */
private struct PluginPages: View {
  let page: PluginsModel.Page
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    ScrollView {
      Group {
        switch page {
        case .category(let key):
          CategoryPage(key: key, look: look)
        case .plugin(let id):
          if let entry = model.catalog.first(where: { $0.id == id }) { PluginPage(entry: entry, look: look) } else { missing }
        case .installed(let id):
          if let server = model.onePerServer.first(where: { $0.id == id }) {
            if let entry = Plugins.entry(for: server, in: model.catalog) { PluginPage(entry: entry, look: look) } else { ServerPage(server: server, look: look) }
          } else { missing }
        case .setup(let id):
          if let entry = model.catalog.first(where: { $0.id == id }), let setup = model.setup, setup.entryId == id {
            SetupPage(entry: entry, editing: setup.editing, look: look)
          } else { missing }
        case .skill(let id):
          if let skill = model.skills.first(where: { $0.id == id }), skill.hasPage { SkillPage(skill: skill, look: look) } else { missing }
        }
      }
      // A page's parts at a readable width, in the middle of the wide panel; a section's apps across it.
      .frame(maxWidth: isCategory ? CGFloat.infinity : 720, alignment: .leading)
      .padding(EdgeInsets(top: isCategory ? 4 : 22, leading: isCategory ? 10 : 32, bottom: 32, trailing: isCategory ? 10 : 32))
      .frame(maxWidth: .infinity, alignment: isCategory ? .leading : .top)
    }
    .scrollIndicators(.automatic)
  }

  private var isCategory: Bool {
    if case .category = page { return true }
    return false
  }

  /** Waits for the catalog; once it is in and the thing is not, the page goes (from itself only). */
  @ViewBuilder
  private var missing: some View {
    let model = plugins.model
    if !model.catalogLoaded {
      ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(.top, 40)
    } else {
      Color.clear.frame(height: 1).onAppear {
        if let index = model.path.lastIndex(of: page) { model.path.removeSubrange(index...) }
      }
    }
  }

  /** The page's name in the bar (`Rt`). */
  static func title(_ page: PluginsModel.Page, model: PluginsModel) -> String {
    switch page {
    case .category(let key):
      return Plugins.sections(model.catalog).first { $0.key == key }?.title ?? ""
    case .plugin(let id), .setup(let id):
      return model.catalog.first { $0.id == id }?.displayName ?? ""
    case .installed(let id):
      guard let server = model.onePerServer.first(where: { $0.id == id }) else { return "" }
      return Plugins.entry(for: server, in: model.catalog)?.displayName ?? server.name
    case .skill(let id):
      return model.skills.first { $0.id == id }?.name ?? ""
    }
  }
}

/** A page's head (56), the iPhone's: the icon, the name (18 semibold) with its line under it, the action at the right. */
private struct PageHead<Icon: View, Meta: View, Action: View>: View {
  let name: String
  let look: Look
  @ViewBuilder let icon: Icon
  @ViewBuilder let meta: Meta
  @ViewBuilder let action: Action

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      icon
      VStack(alignment: .leading, spacing: 2) {
        Text(name)
          .font(.system(size: 18, weight: .semibold))
          .tracking(-0.2)
          .foregroundStyle(look.ink)
          .lineLimit(1)
        meta
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      action
    }
    .frame(minHeight: 56)
  }
}

/** A plugin's page (`Ri`): its head and description; its accounts and tools when added; Setup; its connectors and skills. */
private struct PluginPage: View {
  let entry: PluginEntry
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window

  var body: some View {
    let model = plugins.model
    let installed = model.installed(entry)
    let item = model.yoursItems.first { if case .plugin(let e, _, _) = $0 { return e.id == entry.id }; return false }
    let mode = installed.plugin?.installMode ?? installed.server?.installMode ?? item?.installMode
    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 12) {
        PageHead(name: entry.displayName, look: look) {
          PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, side: 56, id: entry.id, look: look)
        } meta: {
          MetaLine(market: entry.marketplace?.displayName, homepage: entry.homepage, look: look)
        } action: {
          PageActionView(action: Plugins.pageAction(installed: installed.isInstalled, mode: mode), adding: model.adding == entry.id, name: entry.displayName, look: look,
                         comingSoon: !installed.isInstalled && model.comingSoon(entry),
                         add: { model.requestAdd(entry, agentId: window.selected) })
        }
        if !entry.description.isEmpty { Description(text: entry.description, look: look) }
      }
      VStack(alignment: .leading, spacing: 16) {
        if let server = installed.server {
          AccountsCard(serverId: server.id, look: look)
          ToolsCard(serverId: server.id, look: look)
        }
        if installed.isInstalled && item != nil && entry.hasSetupFields {
          PageCard(heading: String(localized: "Setup"), look: look) {
            CardRow(look: look) {
              Text("Setup Values").font(.system(size: 13)).foregroundStyle(look.ink).frame(maxWidth: .infinity, alignment: .leading)
              PluginPill(title: String(localized: "Edit Values"), kind: .secondary, disabled: model.isBusy, look: look) { model.editValues(entry) }
            }
          }
        }
        if !entry.connectorList.isEmpty {
          FoldCard(heading: String(localized: "Connectors"), summary: Plugins.count(entry.connectorList.count, "connector"),
                   rows: entry.connectorList.map { ($0.name, $0.description.isEmpty ? String(localized: "Connector") : $0.description) }, look: look)
        }
        if let skills = entry.skills, !skills.isEmpty {
          FoldCard(heading: String(localized: "Skills"), summary: Plugins.count(skills.count, "skill"),
                   rows: skills.map { ($0.name, $0.description.isEmpty ? String(localized: "Skill") : $0.description) }, look: look)
        }
        RemoveGroup(action: Plugins.pageAction(installed: installed.isInstalled, mode: mode), look: look) {
          Task {
            if installed.plugin != nil { await model.uninstall(pluginId: entry.id, agentId: window.selected) }
            else if let server = installed.server { await model.remove(serverId: server.id, agentId: window.selected) }
          }
        }
      }
    }
    .task { if let server = installed.server { await model.loadTools(server.id) } }
  }
}

/** A server no entry claims (`_i`): its head with its address's host, Uninstall, its accounts, tools and Details. */
private struct ServerPage: View {
  let server: PluginServer
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window

  var body: some View {
    let model = plugins.model
    VStack(alignment: .leading, spacing: 24) {
      PageHead(name: server.name, look: look) {
        PluginIcon(name: server.name, iconUrl: nil, side: 56, look: look)
      } meta: {
        if let host = Plugins.hostLine(server.url) {
          Text(host).font(.system(size: 13)).foregroundStyle(look.inkSecondary).lineLimit(1)
        }
      } action: {
        PageActionView(action: Plugins.pageAction(installed: true, mode: server.installMode), adding: false, name: server.name, look: look, add: {})
      }
      VStack(alignment: .leading, spacing: 16) {
        AccountsCard(serverId: server.id, look: look)
        ToolsCard(serverId: server.id, look: look)
        PageCard(heading: String(localized: "Details"), look: look) {
          CardRow(look: look) { DetailPair(term: String(localized: "Source"), value: Plugins.sourceWord(isTeamServer: server.isTeamServer), look: look) }
          CardRow(divided: true, look: look) { DetailPair(term: String(localized: "Transport"), value: Plugins.transportWord(server.transport), look: look) }
          if let url = server.url {
            CardRow(divided: true, look: look) { DetailPair(term: "URL", value: Plugins.detailValue(url), look: look) }
          } else {
            CardRow(divided: true, look: look) { DetailPair(term: String(localized: "Command"), value: Plugins.detailValue(server.command), look: look) }
          }
          CardRow(divided: true, look: look) { DetailPair(term: String(localized: "Tools"), value: Plugins.toolsValue(model.tools[server.id], count: server.toolCount), look: look) }
        }
        RemoveGroup(action: Plugins.pageAction(installed: true, mode: server.installMode), look: look) {
          Task { await model.remove(serverId: server.id, agentId: window.selected) }
        }
      }
    }
    .task { await model.loadTools(server.id) }
  }
}

/** The page's action (`ft`) in its head, as the iPhone's: Connect (the blue, or the spinner; Coming soon for an app that can't be added yet; Add until 13 October 2026), or the team's label. Uninstall and Remove are the page's foot (`RemoveGroup`). */
private struct PageActionView: View {
  let action: Plugins.PageAction
  let adding: Bool
  let name: String
  let look: Look
  var comingSoon = false
  let add: () -> Void
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let busy = plugins.model.isBusy
    switch action {
    case .add:
      if comingSoon {
        PluginPill(title: AppsComingSoon.label, kind: .soon, look: look).accessibilityLabel("\(name) is coming soon")
      } else if adding {
        AddingSpinner(name: name, look: look)
      } else {
        PluginPill(title: Connecting.connect, kind: .primary, disabled: busy, look: look, action: add).accessibilityLabel("Connect \(name)")
      }
    case .uninstall:
      EmptyView()
    case .remove(let label), .managed(let label):
      PluginPill(title: label, kind: .label, look: look)
    }
  }
}

/** Uninstall for what the person added, Remove for what the team added (the iPhone's): a red row in a group of its own, at the page's foot. No question asked. */
private struct RemoveGroup: View {
  let action: Plugins.PageAction
  let look: Look
  let remove: () -> Void
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    switch action {
    case .uninstall:
      SettingsGroup(look: look) {
        SettingsActionRow(title: String(localized: "Uninstall"), destructive: true, disabled: plugins.model.isBusy, look: look, action: remove)
      }
      .padding(.top, 8)
    case .remove:
      SettingsGroup(look: look) {
        SettingsActionRow(title: String(localized: "Remove"), destructive: true, disabled: plugins.model.isBusy, look: look, action: remove)
      }
      .padding(.top, 8)
    default:
      EmptyView()
    }
  }
}

/** Under a page's name: the marketplace's name and View Source ↗ (13, grey, darker under the pointer), joined by "·". */
private struct MetaLine: View {
  let market: String?
  let homepage: String?
  let look: Look
  @State private var hovering = false

  var body: some View {
    let source = homepage.flatMap(URL.init(string:))
    if market != nil || source != nil {
      HStack(spacing: 6) {
        if let market { Text(market) }
        if market != nil && source != nil { Text("·") }
        if let source {
          Button { NSWorkspace.shared.open(source) } label: {
            HStack(spacing: 4) {
              Text("View Source")
              Image(systemName: "arrow.up.right").font(.system(size: 11))
            }
            .foregroundStyle(hovering ? look.ink : look.inkSecondary)
            .contentShape(Rectangle())
          }
          .buttonStyle(.hand)
          .onHover { hovering = $0 }
        }
      }
      .font(.system(size: 13))
      .foregroundStyle(look.inkSecondary)
      .lineLimit(1)
    }
  }
}

/** A page's description: 14 on 20 in grey, wrapped. */
private struct Description: View {
  let text: String
  let look: Look

  var body: some View {
    Text(text)
      .font(.system(size: 14))
      .lineSpacing(3)
      .foregroundStyle(look.inkSecondary)
      .fixedSize(horizontal: false, vertical: true)
      .textSelection(.enabled)
  }
}

/** A page's group, Settings' (the iPhone's sections): its heading (12 medium, grey) over its rows on the grey, 12 round. */
private struct PageCard<Content: View>: View {
  let heading: String
  let look: Look
  @ViewBuilder let content: Content

  var body: some View {
    SettingsGroup(title: heading, look: look) { content }
  }
}

/** A group's row (padded 10 and 14, 8 apart, at least 40): Settings' line above it when it follows another. */
private struct CardRow<Content: View>: View {
  var divided = false
  let look: Look
  @ViewBuilder let content: Content

  var body: some View {
    HStack(spacing: 8) { content }
      .padding(.vertical, 10)
      .padding(.horizontal, 14)
      .frame(minHeight: 40)
      .overlay(alignment: .top) {
        if divided { SettingsDivider(look: look) }
      }
  }
}

/** Details' line: the term, then its value in the faint grey at the right, cut short with the whole as its tooltip. */
private struct DetailPair: View {
  let term: String
  let value: String
  let look: Look

  var body: some View {
    HStack(spacing: 8) {
      Text(term).font(.system(size: 13)).foregroundStyle(look.ink).lineLimit(1).fixedSize()
      Spacer(minLength: 0)
      Text(value)
        .font(.system(size: 13))
        .foregroundStyle(look.inkTertiary)
        .lineLimit(1)
        .truncationMode(.middle)
        .padding(.trailing, 4)
        .help(value)
    }
    .frame(maxWidth: .infinity)
  }
}

/** Accounts (`ut`): one row each, the default first: its name (and an error's detail), its status and sign-in. */
private struct AccountsCard: View {
  let serverId: String
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let rows = Plugins.accounts(plugins.model.servers, of: serverId)
    if !rows.isEmpty {
      PageCard(heading: String(localized: "Accounts"), look: look) {
        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
          CardRow(divided: index > 0, look: look) {
            VStack(alignment: .leading, spacing: 2) {
              Text(Plugins.accountLabel(row.accountKey)).font(.system(size: 13)).foregroundStyle(look.ink).lineLimit(1)
              Text(Plugins.statusWord(row.status)).font(.system(size: 12)).foregroundStyle(look.tone(Plugins.tone(row.status))).lineLimit(1)
              if row.status == "error", let detail = row.statusDetail {
                Text(detail).font(.system(size: 12)).foregroundStyle(look.inkSecondary)
                  .fixedSize(horizontal: false, vertical: true)
                  .textSelection(.enabled)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if row.status == "needsAuth" {
              PluginPill(title: Plugins.signInButton(plugins.model.signInState(row, accountKey: row.accountKey)), kind: .secondary, disabled: plugins.model.isBusy, look: look) {
                plugins.model.requestSignIn(row, accountKey: row.accountKey)
              }
            }
          }
        }
      }
    }
  }
}

/** Tools (`ht`): folded, "n of m enabled"; open, each tool's name and its switch, changed at once; a failure under them, in red. */
private struct ToolsCard: View {
  let serverId: String
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    let tools = model.tools[serverId] ?? []
    if !tools.isEmpty {
      let names = Plugins.toolNames(tools)
      FoldShell(heading: String(localized: "Tools"), summary: Plugins.enabledLine(tools), look: look) {
        ForEach(tools) { tool in
          let name = names[tool.name] ?? tool.name
          CardRow(divided: true, look: look) {
            Text(name).font(.system(size: 13)).foregroundStyle(look.ink).lineLimit(1).help(tool.description)
              .frame(maxWidth: .infinity, alignment: .leading)
            PluginSwitch(on: !tool.isDisabled, label: tool.isDisabled ? String(localized: "Enable \(name)") : String(localized: "Disable \(name)"), look: look) {
              Task { await model.toggle(tool, of: serverId) }
            }
          }
        }
      } footer: {
        if let failure = model.toolFailures[serverId] {
          CardRow(divided: true, look: look) {
            Text(failure).font(.system(size: 13)).foregroundStyle(look.danger).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
    }
  }
}

/** A folded card (`$n`): its summary ("1 connector", "2 skills"), then each line, the name at the left and what it does at the right. */
private struct FoldCard: View {
  let heading: String
  let summary: String
  let rows: [(String, String)]
  let look: Look

  var body: some View {
    FoldShell(heading: heading, summary: summary, look: look) {
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        CardRow(divided: true, look: look) {
          Text(row.0).font(.system(size: 13)).foregroundStyle(look.ink).lineLimit(1).fixedSize()
          Spacer(minLength: 8)
          Text(row.1).font(.system(size: 13)).foregroundStyle(look.inkTertiary).lineLimit(1).truncationMode(.tail).padding(.trailing, 4).help(row.1)
        }
      }
    } footer: { EmptyView() }
  }
}

/** The fold: a summary row that opens and shuts it (the chevron turns in 0.12 s; the rows come at once). */
private struct FoldShell<Rows: View, Footer: View>: View {
  let heading: String
  let summary: String
  let look: Look
  @ViewBuilder let rows: Rows
  @ViewBuilder let footer: Footer
  @State private var open = false
  @State private var hovering = false

  var body: some View {
    PageCard(heading: heading, look: look) {
      Button { open.toggle() } label: {
        HStack(spacing: 8) {
          Text(summary).font(.system(size: 13)).foregroundStyle(look.ink).frame(maxWidth: .infinity, alignment: .leading)
          Image(systemName: "chevron.down")
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(look.inkTertiary)
            .rotationEffect(.degrees(open ? 180 : 0))
            .animation(.easeOut(duration: 0.12), value: open)
            .padding(.trailing, 4)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 14)
        .frame(minHeight: 40)
        .background(hovering ? look.groupedRowHover : .clear)
        .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .onHover { hovering = $0 }
      .accessibilityValue(open ? "expanded" : "collapsed")
      if open { rows }
      footer
    }
  }
}

/** The setup page (`Di`): what it is for, each value (secrets hidden, "(optional)"), what is required, and Add or Save Values. */
private struct SetupPage: View {
  let entry: PluginEntry
  let editing: Bool
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window
  @State private var values: [String: String] = [:]
  @State private var tried = false

  var body: some View {
    let model = plugins.model
    let fields = entry.fields ?? []
    let missing = Plugins.setupMissing(fields, values)
    VStack(alignment: .leading, spacing: 16) {
      Description(text: Plugins.setupIntro(entry.displayName, editing: editing), look: look)
      VStack(alignment: .leading, spacing: 14) {
        ForEach(fields) { field in
          let invalid = tried && missing.contains(field)
          VStack(alignment: .leading, spacing: 4) {
            Text("\(Text(field.label).foregroundStyle(look.ink))\(field.isRequired ? Text("") : Text(" (optional)").foregroundStyle(look.inkTertiary))")
              .font(.system(size: 13, weight: .medium))
            SetupField(field: field, text: binding(field), invalid: invalid, look: look) { submit(missing: missing) }
            if invalid {
              Text(Plugins.requiredLine(field.label)).font(.system(size: 12)).foregroundStyle(look.danger)
            } else if let hint = field.hint {
              Text(hint).font(.system(size: 12)).foregroundStyle(look.inkTertiary).lineLimit(1).help(hint)
            }
          }
        }
      }
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        if tried && !missing.isEmpty {
          Text(Plugins.fillInLine(missing: missing.count)).font(.system(size: 12)).foregroundStyle(look.inkTertiary)
        }
        PluginPill(title: Plugins.setupSubmit(entry.displayName, editing: editing), kind: .primary, disabled: model.isBusy, look: look) { submit(missing: missing) }
      }
    }
    .onAppear { if values.isEmpty { values = Plugins.setupStart(fields) } }
  }

  private func binding(_ field: PluginEntry.Field) -> Binding<String> {
    Binding(get: { values[field.key] ?? "" }, set: { values[field.key] = $0 })
  }

  private func submit(missing: [PluginEntry.Field]) {
    tried = true
    guard missing.isEmpty, !plugins.model.isBusy else { return }
    let given = Plugins.setupValues(values)
    Task { await plugins.model.submitSetup(given, agentId: window.selected) }
  }
}

/** A setup value's field (32, 8 round, padded 10, 13): white with a faint ring (light) or the grey (dark); the blue edge with the keys, red when it is missing. */
private struct SetupField: View {
  let field: PluginEntry.Field
  @Binding var text: String
  let invalid: Bool
  let look: Look
  let submit: () -> Void
  @FocusState private var focused: Bool

  var body: some View {
    Group {
      if field.isSecret {
        SecureField("", text: $text, prompt: Text(field.placeholder ?? field.key).foregroundStyle(look.inkTertiary))
      } else {
        TextField("", text: $text, prompt: Text(field.placeholder ?? field.key).foregroundStyle(look.inkTertiary))
          .autocorrectionDisabled()
      }
    }
    .textFieldStyle(.plain)
    .font(.system(size: 13))
    .foregroundStyle(look.ink)
    .focused($focused)
    .onSubmit(submit)
    .padding(.horizontal, 10)
    .frame(height: 32)
    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.dark ? look.rowHover : Color.white))
    .overlay {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(invalid ? look.danger : focused ? look.unread : (look.dark ? .clear : Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.14)),
                      lineWidth: invalid || focused ? 1 : 0.5)
    }
    .accessibilityLabel(field.label)
  }
}

/** A skill's page (`Hi`): its tile, name and kind; Name, Description ("Use when…") and Instructions; Save; Delete skill for the agent's own. */
private struct SkillPage: View {
  let skill: AgentSkill
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window
  @State private var name = ""
  @State private var details = ""
  @State private var instructions = ""
  @State private var working = false

  var body: some View {
    let model = plugins.model
    let agentId = window.selected
    let managed = skill.source == "managed"
    let changed = name != skill.name || details != skill.description || instructions != skill.body
    let ready = Plugins.canSaveSkill(agentOpen: agentId != nil, changed: changed, name: name, description: details, body: instructions, saving: working)
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 12) {
          SkillTile(side: 56, look: look)
          VStack(alignment: .leading, spacing: 2) {
            Text(skill.name).font(.system(size: 18, weight: .semibold)).tracking(-0.2).foregroundStyle(look.ink).lineLimit(1)
            Text(skill.kindLine).font(.system(size: 13)).foregroundStyle(look.inkSecondary)
          }
          Spacer(minLength: 0)
        }
        if !skill.description.isEmpty { Description(text: skill.description, look: look) }
      }
      SkillField(label: String(localized: "Name"), text: $name, placeholder: "", look: look).disabled(managed)
      VStack(alignment: .leading, spacing: 0) {
        SkillField(label: String(localized: "Description"), text: $details, placeholder: String(localized: "Use when…"), look: look).disabled(managed)
        if details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !managed {
          Text(Plugins.skillDescriptionHint).font(.system(size: 12)).foregroundStyle(look.inkTertiary).padding(.top, 4)
        }
      }
      SkillField(label: String(localized: "Instructions"), text: $instructions, placeholder: String(localized: "Markdown instructions the agent follows when it runs this skill"), lines: true, look: look)
        .disabled(managed)
      if !managed {
        HStack {
          Spacer(minLength: 0)
          PluginPill(title: String(localized: "Save"), kind: .primary, disabled: !ready, look: look) {
            guard let agentId else { return }
            working = true
            Task { _ = await model.save(skill, name: name, description: details, body: instructions, agentId: agentId); working = false }
          }
        }
        if let agentId, skill.source == "workflow" {
          SettingsGroup(look: look) {
            SettingsActionRow(title: String(localized: "Delete skill"), destructive: true, look: look) {
              Task { await model.delete(skill, agentId: agentId) }
            }
          }
        }
      }
    }
    // The fields follow the skill when it changes from outside.
    .onChange(of: skill, initial: true) { _, now in name = now.name; details = now.description; instructions = now.body }
  }
}

/** A skill's field: its label (12, the faint grey, padded 8, 8 and 6) over a 14-round field (46, padded 12 and 16, 14). */
private struct SkillField: View {
  let label: String
  @Binding var text: String
  let placeholder: String
  var lines = false
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(label)
        .font(.system(size: 12))
        .foregroundStyle(look.inkTertiary)
        .padding(EdgeInsets(top: 8, leading: 8, bottom: 6, trailing: 8))
      Group {
        if lines {
          TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(look.inkTertiary), axis: .vertical)
            .lineLimit(3...)
            .frame(minHeight: 80, alignment: .topLeading)
        } else {
          TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(look.inkTertiary))
        }
      }
      .textFieldStyle(.plain)
      .font(.system(size: 14))
      .foregroundStyle(look.ink)
      .autocorrectionDisabled()
      .padding(.vertical, 12)
      .padding(.horizontal, 16)
      .frame(minHeight: 46)
      .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.dark ? look.rowHover : Color.white))
      .overlay {
        if !look.dark {
          RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.14), lineWidth: 0.5)
        }
      }
      .accessibilityLabel(label)
    }
  }
}

// MARK: - Colours

extension Look {
  /** Orange words (`--sand-text-warning`): "Needs auth", the GitHub banner's title. */
  var warning: Color { dark ? Color(hex: 0xffaf38) : Color(hex: 0xc27400) }
  /** The pills' grey, the iPhone's (`Ink.pillButton`): Edit Values, Reopen, a team's label, Coming soon. */
  var pluginPill: Color { dark ? Color(hex: 0x2b2b2d) : Color(hex: 0x767680).opacity(0x1f / 255) }
  /** Connect's blue (`Ink.authenticate`). */
  var authenticate: Color { dark ? Color(hex: 0x016cec) : Color(hex: 0x0a6cdf) }
  /** The notice's tints. */
  var noticeSuccessFill: Color { dark ? Color(hex: 0x1d362b) : Color(hex: 0xd4ece2) }
  var noticeErrorFill: Color { dark ? Color(hex: 0x3d2225) : Color(hex: 0xf3d8db) }

  /** A status word's colour. */
  func tone(_ tone: Plugins.Tone) -> Color {
    switch tone {
    case .success: return success
    case .warning: return warning
    case .danger: return danger
    case .tertiary: return inkTertiary
    }
  }
}
