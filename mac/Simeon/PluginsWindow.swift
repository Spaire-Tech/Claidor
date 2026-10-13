import AppKit
import SwiftUI
import SimeonCore

/**
 * Connectors (`overlay:plugins`, K01–K09; "Plugins" until 13 October 2026,
 * when it took the iPhone's design, Muse's: the founder's "in mac design it
 * better for it to match iphone. use apple style picker"): in Settings'
 * place over the whole window (one overlay at a time), the same panel and
 * dim. "Connectors" in the middle, "Search connectors" and the filter, then
 * Apple's segmented control, Available | Yours; the catalog by section in
 * rounded groups, Featured as cards with their logos large, See all ›; each
 * row its logo, name and Connect in the blue, or View; a plugin's page
 * (Add, Uninstall, its accounts, tools, setup values, connectors, skills),
 * a server's page, the setup page, a skill's page; the notice at the
 * bottom. Opened by Connect apps, ⌘K and "/" "Plugins", ⌘⇧M, ⌘⇧W and a
 * plugin's link; Escape (after the search's own), × or a click on the dim
 * close it, and closing forgets the view. Measured in mac/STEPS.md, step 9.
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
            .frame(width: max(0, min(760, box.size.width - 40)), height: max(0, min(720, box.size.height - 94)))
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

/** The panel: Settings' (14 round, a line at 15%, #F5F5F7 with its shadows, or the raised ground on dark); the list's header and bar or a page's bar, the scroll pane, the notice. */
private struct PluginsPanel: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    ZStack(alignment: .topTrailing) {
      VStack(spacing: 0) {
        if let page = model.path.last {
          DetailBar(title: PluginPages.title(page, model: model), look: look) { model.path.removeLast() }
        } else {
          // The iPhone's: the title in the middle of the bar.
          Text("Connectors")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .frame(height: 24)
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 12, leading: 48, bottom: 2, trailing: 48))
            .accessibilityAddTraits(.isHeader)
          PluginsBar(look: look)
        }
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
      PluginsClose(look: look) { plugins.close() }
        .padding(.top, 10)
        .padding(.trailing, 10)
    }
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

/** Close (28, round): × in grey, darker on the grey fill under the pointer. */
private struct PluginsClose: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(hovering ? look.ink : look.inkSecondary)
        .frame(width: 28, height: 28)
        .background(Circle().fill(hovering ? look.rowHover : .clear))
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel("Close")
  }
}

/** A page's bar (`sand-settings-detail-bar`, 44): Back, the page's name centred, room for the ×. */
private struct DetailBar: View {
  let title: String
  let look: Look
  let back: () -> Void
  @State private var hovering = false
  @State private var pressed = false

  var body: some View {
    HStack(spacing: 12) {
      Button(action: back) {
        Image(systemName: "chevron.left")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(hovering ? look.ink : look.inkSecondary)
          .frame(width: 16, height: 16)
          .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(hovering ? look.rowHover : .clear))
          // More room for the pointer than the 16 it draws.
          .padding(6)
          .contentShape(Rectangle())
          .padding(-6)
      }
      .buttonStyle(PressScale())
      .onHover { hovering = $0 }
      .accessibilityLabel("Back")
      Text(title)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(look.ink)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: .infinity)
        .accessibilityAddTraits(.isHeader)
      Color.clear.frame(width: 24, height: 1)
    }
    .padding(.horizontal, 10)
    .frame(height: 44)
  }
}

/** Back's press: 98%. */
private struct PressScale: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.scaleEffect(configuration.isPressed ? 0.98 : 1).handCursor()
  }
}

// MARK: - The bar

/**
 * Under the title, as the iPhone has them: "Search connectors" with the
 * filter beside it, then Apple's segmented control, Available | Yours
 * (the founder, 13 October 2026: "use apple style picker, not like we have
 * now"; the tabs were the Electron window's).
 */
private struct PluginsBar: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    @Bindable var model = plugins.model
    VStack(spacing: 12) {
      HStack(spacing: 8) {
        PluginsSearch(look: look)
        FilterButton(look: look)
      }
      Picker("Show", selection: $model.tab) {
        Text("Available").tag(PluginsModel.Tab.marketplace)
        Text("Yours").tag(PluginsModel.Tab.yours)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .controlSize(.large)
      .frame(maxWidth: 320)
      .accessibilityLabel("Show")
    }
    .padding(EdgeInsets(top: 12, leading: 32, bottom: 4, trailing: 32))
  }
}

/** Filter (28, 6 round): grey, darker under the pointer, on the grey while the tab's filter is set; its menu stays open while choosing. */
private struct FilterButton: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @State private var hovering = false
  @State private var spot = WindowSpot()

  var body: some View {
    let model = plugins.model
    let active = !model.filter.isAll
    Button { FilterMenu.show(model: model, under: spot.frame) } label: {
      Image(systemName: "line.3.horizontal.decrease")
        .font(.system(size: 14, weight: .regular))
        .foregroundStyle(hovering || active ? look.ink : look.inkSecondary)
        .frame(width: 28, height: 28)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(active ? look.fillHover : hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .background(WindowSpotReader(spot: spot))
    .help("Filter connectors")
    .accessibilityLabel("Filter connectors")
    .accessibilityAddTraits(active ? .isSelected : [])
  }
}

/** The Filter menu (`ii`, at least 180 wide): Type (All types, Connectors, Skills), a line, Ownership (All, Team, Public); one choice each, and a pick does not close it. */
@MainActor
private enum FilterMenu {
  static func show(model: PluginsModel, under frame: CGRect) {
    let menu = NSMenu(title: "Filter connectors")
    menu.autoenablesItems = false
    menu.minimumWidth = 180
    var types: [(PluginFilter.Kind, CheckMenuRow)] = []
    var owners: [(PluginFilter.Ownership, CheckMenuRow)] = []
    func refresh() {
      for (kind, row) in types { row.isOn = model.filter.type == kind }
      for (owner, row) in owners { row.isOn = model.filter.ownership == owner }
    }
    menu.addItem(.sectionHeader(title: "Type"))
    for kind in PluginFilter.Kind.allCases {
      let row = CheckMenuRow(title: PluginFilter.label(kind), on: model.filter.type == kind, width: 180, radio: true) { _ in
        model.filter.type = kind
        refresh()
      }
      types.append((kind, row))
      menu.addItem(CheckMenuRow.item(row))
    }
    menu.addItem(.separator())
    menu.addItem(.sectionHeader(title: "Ownership"))
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

/** "Search connectors" (the bar's width, 32 high): the glass, the words at 14; white and lifted (light) or the grey (dark); the blue edge while it has the keys. Follows each key. */
private struct PluginsSearch: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @FocusState private var focused: Bool
  /** ⌘F asked: the words are picked once the field has the keys. */
  @State private var selectsOnFocus = false

  var body: some View {
    @Bindable var model = plugins.model
    HStack(spacing: 4) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 13))
        .foregroundStyle(look.inkTertiary)
        .frame(width: 14, height: 14)
      TextField("", text: $model.query, prompt: Text("Search connectors").foregroundStyle(look.inkTertiary))
        .textFieldStyle(.plain)
        .font(.system(size: 14))
        .foregroundStyle(look.ink)
        .autocorrectionDisabled()
        .focused($focused)
        .accessibilityLabel("Search connectors")
    }
    .padding(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 4))
    .frame(maxWidth: .infinity)
    .frame(height: 32)
    .background {
      if look.dark {
        RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.rowHover)
      } else {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(Color.white)
          .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.09), radius: 0.5)
          .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.05), radius: 1, x: 0, y: 1)
      }
    }
    .overlay {
      RoundedRectangle(cornerRadius: look.dark ? 8 : 10, style: .continuous)
        .strokeBorder(focused ? look.unread : .clear, lineWidth: 1)
    }
    .contentShape(Rectangle())
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

/** The scroll pane (padded 32 at the sides, 28 under): Available or Yours, drawn afresh at the top for each. */
private struct PluginsList: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if model.tab == .marketplace { MarketplaceList(look: look) } else { YoursList(look: look) }
      }
      .padding(EdgeInsets(top: 0, leading: 32, bottom: 28, trailing: 32))
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .scrollIndicators(.automatic)
    .id(model.tab)
  }
}

/** Available (`ci`): the sections (Featured, then A–Z), or "Results" while searching; each folded at 4 with See all ›. */
private struct MarketplaceList: View {
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    let entries = Plugins.search(model.catalog, model.query).filter { Plugins.keeps($0, model.marketplaceFilter) }
    let searching = !model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    if entries.isEmpty {
      YoursEmpty(text: Plugins.marketplaceEmpty(loaded: model.catalogLoaded, catalogEmpty: model.catalog.isEmpty, filterSet: !model.marketplaceFilter.isAll, query: model.query), look: look)
        .padding(.top, 22)
    } else if searching {
      MarketplaceSection(title: "Results", entries: entries, folds: false, look: look)
    } else {
      ForEach(Plugins.sections(entries), id: \.key) { section in
        MarketplaceSection(title: section.title, entries: section.items, folds: true, look: look)
      }
    }
  }
}

/** A section: its head with See all › while some are folded away, then its apps on one rounded group; Featured's as cards. */
private struct MarketplaceSection: View {
  let title: String
  let entries: [PluginEntry]
  let folds: Bool
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    let shown = Plugins.collapse(entries, expanded: model.expanded.contains(title) || !folds, limit: Plugins.marketplaceLimit)
    let featured = folds && title == Plugins.featured
    SectionHead(title: title, look: look) {
      if shown.hidden > 0 { SeeAllButton(look: look) { model.expanded.insert(title) } }
    }
    GroupCard(look: look) {
      ForEach(Array(shown.visible.enumerated()), id: \.element.id) { index, entry in
        let last = index == shown.visible.count - 1
        if featured {
          FeaturedRow(entry: entry, look: look).cardDivider(!last, inset: 16, look: look)
        } else {
          EntryRow(entry: entry, look: look).cardDivider(!last, look: look)
        }
      }
    }
  }
}

/**
 * One app of the catalog (the iPhone's row): its logo, its name, and at the
 * right Connect in the blue; View once it is connected (its page), Added for
 * a plugin of skills alone, its state while it is neither, Coming soon for
 * an app that can't be added yet. One Connect (`Connecting`, 13 October
 * 2026): an app shows connected only once it is signed in.
 */
private struct EntryRow: View {
  let entry: PluginEntry
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @Environment(WindowState.self) private var window

  var body: some View {
    let model = plugins.model
    // An app that can't be added yet: dimmed, "Coming soon" in place of Connect (`AppsComingSoon`).
    let soon = !model.installed(entry).isInstalled && model.comingSoon(entry)
    GroupRow(title: entry.displayName, team: Plugins.teamMark(entry), look: look, dimmed: soon,
             icon: { PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, side: GroupRow<EmptyView, EmptyView>.tile, look: look) },
             open: { model.path.append(.plugin(entry.id)) }) {
      if model.adding == entry.id {
        AddingSpinner(name: entry.displayName, look: look)
      } else if model.installed(entry).isInstalled {
        let server = model.serverState(entry)
        if entry.connectorList.isEmpty || server == nil {
          RowWord(title: "Added", look: look)
        } else if let server, server.status == "needsAuth" {
          RowWord(title: Plugins.signInButton(model.signInState(server, accountKey: server.accountKey)), disabled: model.isBusy, look: look) {
            model.requestSignIn(server, accountKey: server.accountKey)
          }
          .accessibilityLabel("Connect \(entry.displayName)")
        } else if let server, server.status != "connected" {
          StatusWord(status: server.status, detail: server.statusDetail, look: look)
        } else {
          RowWord(title: "View", look: look) { model.path.append(.plugin(entry.id)) }
            .accessibilityLabel("View \(entry.displayName)")
        }
      } else if soon {
        RowWord(title: AppsComingSoon.label, look: look)
          .accessibilityLabel("\(entry.displayName) is coming soon")
      } else {
        RowWord(title: Connecting.connect, disabled: model.isBusy, look: look) {
          model.requestAdd(entry, agentId: window.selected)
        }
        .accessibilityLabel("Connect \(entry.displayName)")
      }
    }
  }
}

/** A featured app (the iPhone's Featured, Muse's): its name over what it does, its logo large at the right; it opens its page, where Connect is. */
private struct FeaturedRow: View {
  let entry: PluginEntry
  let look: Look
  @Environment(PluginsState.self) private var plugins
  @State private var hovering = false

  var body: some View {
    let model = plugins.model
    let connected = model.installed(entry).isInstalled && model.serverState(entry)?.status == "connected"
    Button { model.path.append(.plugin(entry.id)) } label: {
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 6) {
            Text(entry.displayName)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(look.ink)
              .lineLimit(1)
            if let team = Plugins.teamMark(entry) { TeamBadge(tip: team, look: look) }
          }
          if !entry.description.isEmpty {
            Text(entry.description)
              .font(.system(size: 13))
              .foregroundStyle(look.inkSecondary)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
          }
          if connected {
            Text(Connecting.connected).font(.system(size: 12)).foregroundStyle(look.inkTertiary).padding(.top, 1)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, side: 56, look: look)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .background(hovering ? look.ink.opacity(0.035) : .clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel("Open \(entry.displayName)")
  }
}

/** Yours (`ki`, the iPhone's): the GitHub banner, Apps (folded at 6, See all ›), Private (the open agent's skills). */
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
    let shown = Plugins.collapse(items, expanded: model.expanded.contains("Installed") || !q.isEmpty, limit: Plugins.installedLimit)
    if !model.authBlocked.isEmpty { GitHubBanner(look: look).padding(.top, 18) }
    if !showsInstalled && !showsPrivate { YoursEmpty(text: Plugins.noFilterMatch, look: look).padding(.top, 22) }
    if showsInstalled {
      SectionHead(title: "Apps", look: look) {
        if shown.hidden > 0 { SeeAllButton(look: look) { model.expanded.insert("Installed") } }
      }
      if items.isEmpty {
        YoursEmpty(text: Plugins.installedEmpty(query: q), look: look)
      } else {
        GroupCard(look: look) {
          ForEach(Array(shown.visible.enumerated()), id: \.offset) { index, item in
            InstalledRow(item: item, look: look).cardDivider(index < shown.visible.count - 1, look: look)
          }
        }
      }
    }
    if showsPrivate {
      SectionHead(title: "Private", look: look) { EmptyView() }
      if agentId == nil || skills.isEmpty {
        YoursEmpty(text: Plugins.privateEmpty(agentOpen: agentId != nil, query: q), look: look)
      } else {
        GroupCard(look: look) {
          ForEach(Array(skills.enumerated()), id: \.element.id) { index, skill in
            GroupRow(title: skill.name, line: skill.subtitle, team: nil, look: look,
                     icon: { SkillTile(side: GroupRow<EmptyView, EmptyView>.tile, look: look) },
                     open: { model.path.append(.skill(skill.id)) }) {
              if skill.source == "workflow" {
                PluginSwitch(on: skill.isEnabledForAgent, label: "Enable \(skill.name)", look: look) {
                  Task { await model.setEnabled(skill, agentId: agentId) }
                }
              }
            }
            .cardDivider(index < skills.count - 1, look: look)
          }
        }
      }
    }
  }
}

/** A row of Yours › Apps: a plugin with its first connector's state, or a server of its own; View once it is connected. */
private struct InstalledRow: View {
  let item: PluginItem
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    switch item {
    case .plugin(let entry, let mode, let connectors):
      GroupRow(title: entry.displayName, line: Plugins.contributions(entry), team: Plugins.modeLabel(mode), look: look,
               icon: { PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, side: GroupRow<EmptyView, EmptyView>.tile, look: look) },
               open: { model.path.append(.plugin(entry.id)) }) {
        if let first = connectors.first {
          RowState(server: first, look: look) { model.path.append(.plugin(entry.id)) }
        } else {
          RowWord(title: "View", look: look) { model.path.append(.plugin(entry.id)) }
        }
      }
    case .connector(let server, let mode):
      let entry = Plugins.entry(for: server, in: model.catalog)
      GroupRow(title: server.name, line: Plugins.contributions(server, catalog: model.catalog), team: Plugins.modeLabel(mode), look: look,
               icon: { PluginIcon(name: server.name, iconUrl: entry?.iconUrl, side: GroupRow<EmptyView, EmptyView>.tile, look: look) },
               open: { model.path.append(.installed(server.id)) }) {
        RowState(server: server, look: look) { model.path.append(.installed(server.id)) }
      }
    }
  }
}

/** A server's state at a row's end, as the iPhone says it: View once connected, Connect in the blue when it needs its sign-in, else its status word. */
private struct RowState: View {
  let server: PluginServer
  let look: Look
  let open: () -> Void
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    if server.status == "connected" {
      RowWord(title: "View", look: look, action: open)
        .accessibilityLabel("View \(server.name)")
    } else if server.status == "needsAuth" {
      RowWord(title: Plugins.signInButton(model.signInState(server, accountKey: server.accountKey)), disabled: model.isBusy, look: look) {
        model.requestSignIn(server, accountKey: server.accountKey)
      }
      .accessibilityLabel("Connect \(server.name)")
    } else {
      StatusWord(status: server.status, detail: server.statusDetail, look: look)
    }
  }
}

/** A server's state at a row's end: its status word, or the sign-in button when it needs one (no word then). */
private struct ServerState: View {
  let server: PluginServer
  let accountKey: String
  var showsWordWithButton = false
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    HStack(spacing: 8) {
      if server.status != "needsAuth" || showsWordWithButton { StatusWord(status: server.status, detail: server.statusDetail, look: look) }
      if server.status == "needsAuth" {
        PluginPill(title: Plugins.signInButton(model.signInState(server, accountKey: accountKey)), kind: .secondary, disabled: model.isBusy, look: look) {
          model.requestSignIn(server, accountKey: accountKey)
        }
      }
    }
  }
}

// MARK: - Rows and their parts

/** A section's head (the iPhone's): its name (15 semibold) and at the right what the section offers; 22 over it, 8 under. */
private struct SectionHead<Trailing: View>: View {
  let title: String
  let look: Look
  @ViewBuilder let trailing: Trailing

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(look.ink)
        .lineLimit(1)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 8)
      trailing
    }
    .padding(.horizontal, 4)
    .padding(.top, 22)
    .padding(.bottom, 8)
  }
}

/** See all › (Muse's): the rest of the section shown in place. */
private struct SeeAllButton: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 3) {
        Text("See all")
        Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
      }
      .font(.system(size: 13))
      .foregroundStyle(hovering ? look.ink : look.inkSecondary)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** A group of rows on one rounded card (macOS's grouped lists, the iPhone's): white on the panel's grey (light), a faint fill (dark), a hairline edge. */
private struct GroupCard<Content: View>: View {
  let look: Look
  @ViewBuilder let content: Content

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
    VStack(spacing: 0) { content }
      .background(shape.fill(look.dark ? look.ink.opacity(0.05) : Color.white))
      .clipShape(shape)
      .overlay(shape.strokeBorder(look.ink.opacity(look.dark ? 0.08 : 0.07), lineWidth: 1))
  }
}

private extension View {
  /** The hairline under a group's row but its last, from the name's edge. */
  func cardDivider(_ shown: Bool, inset: CGFloat = 14 + GroupRow<EmptyView, EmptyView>.tile + 12, look: Look) -> some View {
    overlay(alignment: .bottom) {
      if shown { Rectangle().fill(look.ink.opacity(0.08)).frame(height: 0.5).padding(.leading, inset) }
    }
  }
}

/** Yours' and the list's empty lines (12, the faint grey, padded 4 at the sides). */
private struct YoursEmpty: View {
  let text: String
  let look: Look

  var body: some View {
    Text(text)
      .font(.system(size: 12))
      .lineSpacing(3)
      .foregroundStyle(look.inkTertiary)
      .padding(.horizontal, 4)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/**
 * A group's row (the iPhone's): the open part (the logo, 36, then the name
 * at 13 medium with its Team mark, and a line at 12 in grey when it has
 * one) and its control at the right; a faint fill under the pointer.
 */
private struct GroupRow<Icon: View, Trailing: View>: View {
  /** The logo's tile. */
  static var tile: CGFloat { 36 }
  let title: String
  var line: String? = nil
  let team: String?
  let look: Look
  /** Faded, for an app that can't be added yet. */
  var dimmed = false
  @ViewBuilder let icon: Icon
  let open: () -> Void
  @ViewBuilder let trailing: Trailing
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 10) {
      Button(action: open) {
        HStack(spacing: 12) {
          icon
          VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
              Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(look.ink)
                .lineLimit(1)
                .truncationMode(.tail)
              if let team { TeamBadge(tip: team, look: look) }
            }
            if let line, !line.isEmpty {
              Text(line)
                .font(.system(size: 12))
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
    .padding(.vertical, 9)
    .background(hovering ? look.ink.opacity(0.035) : .clear)
    .onHover { hovering = $0 }
  }
}

/** A row's word at the right, as the iPhone's: in the blue when it does something (Connect, View), else in the faint grey (Added, Coming soon). Faded while it waits. */
private struct RowWord: View {
  let title: String
  var disabled = false
  let look: Look
  var action: (() -> Void)? = nil
  @State private var hovering = false

  var body: some View {
    if let action {
      Button(action: action) {
        Text(title)
          .font(.system(size: 13))
          .foregroundStyle(look.link.opacity(hovering && !disabled ? 0.75 : 1))
          .lineLimit(1)
          .padding(.vertical, 6)
          .padding(.leading, 8)
          .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .disabled(disabled)
      .opacity(disabled ? 0.56 : 1)
      .onHover { hovering = $0 }
      .fixedSize()
    } else {
      Text(title)
        .font(.system(size: 13))
        .foregroundStyle(look.inkTertiary)
        .lineLimit(1)
        .padding(.leading, 8)
        .fixedSize()
    }
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
 * An app's icon (`ToolIcon`), as the iPhone draws it on Connectors: its logo
 * large on its tile, as an app's icon (the founder, 13 October 2026: "bigger
 * the logos"), white with a hairline edge (light) or the raised grey (dark);
 * else its first letter. 36 on a row, 56 on a featured card or a page.
 */
private struct PluginIcon: View {
  let name: String
  let iconUrl: String?
  var side: CGFloat = 40
  let look: Look
  @Environment(PluginsState.self) private var plugins

  var body: some View {
    let model = plugins.model
    let bundled = AppLogoTile.logo(name)
    let image = bundled ?? iconUrl.flatMap { model.logos[$0] }
    let shape = RoundedRectangle(cornerRadius: side * 11 / 40, style: .continuous)
    ZStack {
      shape.fill(look.dark ? Color(hex: 0x232325) : Color.white)
      if let image {
        Image(nsImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fit)
          .frame(width: side * 0.78, height: side * 0.78)
      } else {
        Text(String(name.prefix(1)).uppercased())
          .font(.system(size: side * 0.4, weight: .semibold))
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

/** A skill's tile: the list mark on a faint fill (6 round). */
private struct SkillTile: View {
  let side: CGFloat
  let look: Look

  var body: some View {
    Image(systemName: "list.bullet.rectangle")
      .font(.system(size: side <= 40 ? 12 : 18))
      .foregroundStyle(side <= 40 ? look.inkTertiary : look.ink)
      .frame(width: side, height: side)
      .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(look.ink.opacity(side <= 40 ? 0.06 : 0.03)))
      .overlay {
        if side > 40 { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(look.ink.opacity(0.10), lineWidth: 1) }
      }
      .accessibilityHidden(true)
  }
}

/**
 * A pill (26 high, 13 round, padded 10, 12): secondary (the grey, darker
 * under the pointer), primary (the blue with white words), a team's
 * label (no fill, grey, faded) or Coming soon (the grey, grey words, not a
 * button). Faded to 56% while it waits.
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
        .font(.system(size: 12))
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.horizontal, 10)
        .frame(height: 26)
        .background(Capsule().fill(fill))
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .disabled(disabled || kind == .label || kind == .soon)
    .opacity(disabled || kind == .label ? 0.56 : 1)
    .onHover { hovering = $0 }
    .fixedSize()
  }

  private var ink: Color {
    switch kind {
    case .secondary: return look.ink
    case .primary: return Color(hex: 0xfcfcfc)
    case .label: return look.inkSecondary
    case .soon: return look.inkTertiary
    }
  }

  private var fill: Color {
    let live = hovering && !disabled
    switch kind {
    case .secondary: return live ? look.fillHover : look.pluginPill
    case .primary: return live ? look.link : look.unread
    case .label: return .clear
    case .soon: return look.pluginPill
    }
  }
}

/** While its add runs (`dt`, 34 × 26): a 17.5 ring turning every 0.7 s, its bottom quarter fainter. */
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
    .frame(width: 34, height: 26)
    .onAppear { withAnimation(.linear(duration: 0.7).repeatForever(autoreverses: false)) { turning = true } }
    .accessibilityElement()
    .accessibilityLabel("Connecting \(name)")
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

/** Settings' switch (mini, the pane's blue), changed at once. */
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
      .controlSize(.mini)
      .tint(look.paneSwitchOn)
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
      PluginPill(title: model.launchingFix ? "Opening…" : "Fix with agent", kind: .secondary, disabled: model.launchingFix, look: look) {
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
      .padding(EdgeInsets(top: 22, leading: 32, bottom: 28, trailing: 32))
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .scrollIndicators(.automatic)
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

/** A page's head (56): the icon, the name (17 medium) with its line under it, the action at the right. */
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
          .font(.system(size: 17, weight: .medium))
          .tracking(-0.136)
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
          PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, side: 56, look: look)
        } meta: {
          MetaLine(market: entry.marketplace?.displayName, homepage: entry.homepage, look: look)
        } action: {
          PageActionView(action: Plugins.pageAction(installed: installed.isInstalled, mode: mode), adding: model.adding == entry.id, name: entry.displayName, look: look,
                         comingSoon: !installed.isInstalled && model.comingSoon(entry),
                         add: { model.requestAdd(entry, agentId: window.selected) },
                         remove: {
                           Task {
                             if installed.plugin != nil { await model.uninstall(pluginId: entry.id, agentId: window.selected) }
                             else if let server = installed.server { await model.remove(serverId: server.id, agentId: window.selected) }
                           }
                         })
        }
        if !entry.description.isEmpty { Description(text: entry.description, look: look) }
      }
      VStack(alignment: .leading, spacing: 16) {
        if let server = installed.server {
          AccountsCard(serverId: server.id, look: look)
          ToolsCard(serverId: server.id, look: look)
        }
        if installed.isInstalled && item != nil && entry.hasSetupFields {
          PageCard(heading: "Setup", look: look) {
            CardRow(look: look) {
              Text("Setup Values").font(.system(size: 13)).foregroundStyle(look.ink).frame(maxWidth: .infinity, alignment: .leading)
              PluginPill(title: "Edit Values", kind: .secondary, disabled: model.isBusy, look: look) { model.editValues(entry) }
            }
          }
        }
        if !entry.connectorList.isEmpty {
          FoldCard(heading: "Connectors", summary: Plugins.count(entry.connectorList.count, "connector"),
                   rows: entry.connectorList.map { ($0.name, $0.description.isEmpty ? "Connector" : $0.description) }, look: look)
        }
        if let skills = entry.skills, !skills.isEmpty {
          FoldCard(heading: "Skills", summary: Plugins.count(skills.count, "skill"),
                   rows: skills.map { ($0.name, $0.description.isEmpty ? "Skill" : $0.description) }, look: look)
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
        PageActionView(action: Plugins.pageAction(installed: true, mode: server.installMode), adding: false, name: server.name, look: look,
                       add: {}, remove: { Task { await model.remove(serverId: server.id, agentId: window.selected) } })
      }
      VStack(alignment: .leading, spacing: 16) {
        AccountsCard(serverId: server.id, look: look)
        ToolsCard(serverId: server.id, look: look)
        PageCard(heading: "Details", look: look) {
          CardRow(look: look) { DetailPair(term: "Source", value: Plugins.sourceWord(isTeamServer: server.isTeamServer), look: look) }
          CardRow(divided: true, look: look) { DetailPair(term: "Transport", value: Plugins.transportWord(server.transport), look: look) }
          if let url = server.url {
            CardRow(divided: true, look: look) { DetailPair(term: "URL", value: Plugins.detailValue(url), look: look) }
          } else {
            CardRow(divided: true, look: look) { DetailPair(term: "Command", value: Plugins.detailValue(server.command), look: look) }
          }
          CardRow(divided: true, look: look) { DetailPair(term: "Tools", value: Plugins.toolsValue(model.tools[server.id], count: server.toolCount), look: look) }
        }
      }
    }
    .task { await model.loadTools(server.id) }
  }
}

/** The page's action (`ft`): Connect (the blue, or the spinner; Coming soon for an app that can't be added yet; Add until 13 October 2026), Uninstall, the team's label with Remove, or the team's label alone. No question asked. */
private struct PageActionView: View {
  let action: Plugins.PageAction
  let adding: Bool
  let name: String
  let look: Look
  var comingSoon = false
  let add: () -> Void
  let remove: () -> Void
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
      PluginPill(title: "Uninstall", kind: .secondary, disabled: busy, look: look, action: remove)
    case .remove(let label):
      HStack(spacing: 8) {
        PluginPill(title: label, kind: .label, look: look)
        PluginPill(title: "Remove", kind: .secondary, disabled: busy, look: look, action: remove)
      }
    case .managed(let label):
      PluginPill(title: label, kind: .label, look: look)
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

/** A card with its heading (12, the faint grey, padded 8, 14 and 6) over it: the grey fill, 14 round, no line, no shadow. */
private struct PageCard<Content: View>: View {
  let heading: String
  let look: Look
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(heading)
        .font(.system(size: 12))
        .foregroundStyle(look.inkTertiary)
        .padding(EdgeInsets(top: 8, leading: 14, bottom: 6, trailing: 14))
        .frame(height: 30, alignment: .bottomLeading)
        .accessibilityAddTraits(.isHeader)
      VStack(alignment: .leading, spacing: 0) { content }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.rowHover))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
  }
}

/** A card's row (padded 12 and 14, 8 apart): a 0.5 line above it, inset 12, when it follows another. */
private struct CardRow<Content: View>: View {
  var divided = false
  let look: Look
  @ViewBuilder let content: Content

  var body: some View {
    HStack(spacing: 8) { content }
      .padding(.vertical, 12)
      .padding(.horizontal, 14)
      .frame(minHeight: 42)
      .overlay(alignment: .top) {
        if divided { Rectangle().fill(look.ink.opacity(0.10)).frame(height: 0.5).padding(.horizontal, 12) }
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
      PageCard(heading: "Accounts", look: look) {
        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
          CardRow(divided: index > 0, look: look) {
            VStack(alignment: .leading, spacing: 2) {
              Text(Plugins.accountLabel(row.accountKey)).font(.system(size: 13)).foregroundStyle(look.ink).lineLimit(1)
              if row.status == "error", let detail = row.statusDetail {
                Text(detail).font(.system(size: 12)).foregroundStyle(look.inkSecondary)
                  .fixedSize(horizontal: false, vertical: true)
                  .textSelection(.enabled)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ServerState(server: row, accountKey: row.accountKey, showsWordWithButton: true, look: look)
              .padding(.trailing, 4)
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
      FoldShell(heading: "Tools", summary: Plugins.enabledLine(tools), look: look) {
        ForEach(tools) { tool in
          let name = names[tool.name] ?? tool.name
          CardRow(divided: true, look: look) {
            Text(name).font(.system(size: 13)).foregroundStyle(look.ink).lineLimit(1).help(tool.description)
              .frame(maxWidth: .infinity, alignment: .leading)
            PluginSwitch(on: !tool.isDisabled, label: tool.isDisabled ? "Enable \(name)" : "Disable \(name)", look: look) {
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
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .frame(minHeight: 42)
        .background(hovering ? look.rowHover : .clear)
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
  @State private var deleteHover = false

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
            Text(skill.name).font(.system(size: 17, weight: .medium)).tracking(-0.136).foregroundStyle(look.ink).lineLimit(1)
            Text(skill.kindLine).font(.system(size: 13)).foregroundStyle(look.inkSecondary)
          }
          Spacer(minLength: 0)
        }
        if !skill.description.isEmpty { Description(text: skill.description, look: look) }
      }
      SkillField(label: "Name", text: $name, placeholder: "", look: look).disabled(managed)
      VStack(alignment: .leading, spacing: 0) {
        SkillField(label: "Description", text: $details, placeholder: "Use when…", look: look).disabled(managed)
        if details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !managed {
          Text(Plugins.skillDescriptionHint).font(.system(size: 12)).foregroundStyle(look.inkTertiary).padding(.top, 4)
        }
      }
      SkillField(label: "Instructions", text: $instructions, placeholder: "Markdown instructions the agent follows when it runs this skill", lines: true, look: look)
        .disabled(managed)
      if !managed {
        HStack {
          Spacer(minLength: 0)
          PluginPill(title: "Save", kind: .primary, disabled: !ready, look: look) {
            guard let agentId else { return }
            working = true
            Task { _ = await model.save(skill, name: name, description: details, body: instructions, agentId: agentId); working = false }
          }
        }
        if let agentId, skill.source == "workflow" {
          Button {
            Task { await model.delete(skill, agentId: agentId) }
          } label: {
            Text("Delete skill")
              .font(.system(size: 13))
              .foregroundStyle(look.danger)
              .padding(10)
              .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
              .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(deleteHover ? look.danger.opacity(0.06) : look.rowHover))
              .contentShape(Rectangle())
          }
          .buttonStyle(.hand)
          .onHover { deleteHover = $0 }
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
  /** The secondary pill's grey (Add, Uninstall, Authenticate…). */
  var pluginPill: Color { dark ? Color(hex: 0x383838).opacity(0.32) : Color(hex: 0xd5d5d5).opacity(0.254) }
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
