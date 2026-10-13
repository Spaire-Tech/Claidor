import SwiftUI
import SimeonCore

/**
 * Connectors, in Muse's layout (the founder, 13 October 2026: "design the
 * connectors page on iphone like this. bigger the logos ... connected
 * become yours. try to make it match"): the title in the bar with Back and
 * the filter, the search, Apple's segmented control (Available | Yours),
 * then on Available the featured apps as cards (what each does, its logo
 * large at the right) and every category as a group of rounded rows, four
 * of each with See all ›, each row the app's logo, its name and Connect in
 * the blue, or View once it is connected. Yours is what the person has
 * added: each app with its state and Connect or View, the plugins of
 * skills alone, and an agent's own skills. Connect asks first
 * (ConnectConsentSheet), then installs the app in the box and opens its
 * sign-in in one go (`Connecting`).
 */
struct ConnectAppsSheet: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var tab: ConnectorsTab = .available
  /** The category the filter keeps, or all of them. */
  @State private var category: String?
  /** What the Mac's Plugins window knows and does, for this opening (ConnectAppsModel). */
  @State private var model = ConnectAppsModel()

  var body: some View {
    NavigationStack {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          PluginsSearchField(text: $query)
          Picker("Show", selection: $tab) {
            ForEach(ConnectorsTab.allCases, id: \.self) { tab in Text(tab.title).tag(tab) }
          }
          .pickerStyle(.segmented)
          .controlSize(.large)
          .padding(.top, 12)
          switch tab {
          case .available: available
          case .yours: YoursConnectors(query: query)
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 32)
      }
      .scrollDismissesKeyboard(.immediately)
      .refreshable {
        await store.loadApps()
        await model.load()
      }
      .background(Ink.ground.ignoresSafeArea())
      .navigationTitle("Connectors")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button { dismiss() } label: { Image(systemName: "chevron.left") }
            .accessibilityLabel("Back")
        }
        ToolbarItem(placement: .topBarTrailing) { filterMenu }
      }
      .task { await store.loadApps() }
      .task {
        model.store = store
        await model.load()
      }
    }
    .overlay(alignment: .bottom) { PluginNoticeBar().animation(.easeOut(duration: 0.2), value: model.notice) }
    // The setup page: Connect's for a plugin that asks for values, or Edit Values'. A vendor's sign-in waits for it to go.
    .sheet(item: $model.setup, onDismiss: { model.signInAfterSetup() }) { setup in
      PluginSetupSheet(setup: setup)
        .environment(model)
        .presentationBackground(Ink.groupedGround)
    }
    // An app signed in or removed anywhere: the box's servers read again, for who added what.
    .onChange(of: store.apps) { _, _ in Task { await model.refreshServers() } }
    .environment(model)
    .presentationBackground(Ink.ground)
  }

  // MARK: Available

  @ViewBuilder
  private var available: some View {
    let sections = self.sections
    let expanded = !query.isEmpty || category != nil
    if store.catalog.isEmpty {
      HStack(spacing: 10) { ProgressView(); Text("Loading apps…").font(.system(size: 15)).foregroundStyle(Ink.secondary) }
        .padding(.top, 28)
    } else if sections.isEmpty {
      Text(query.isEmpty ? Plugins.noFilterMatch : "No apps match \u{201C}\(query)\u{201D}.")
        .font(.system(size: 15)).foregroundStyle(Ink.secondary)
        .padding(.top, 28)
    }
    ForEach(sections) { section in
      let shown = Plugins.collapse(section.apps, expanded: expanded, limit: Plugins.marketplaceLimit)
      PluginsSectionHead(title: section.title) {
        if shown.hidden > 0 {
          NavigationLink { ConnectorsCategoryPage(title: section.title, apps: section.apps) } label: { SeeAll() }
            .buttonStyle(.plain)
        }
      }
      ConnectorsCard {
        ForEach(Array(shown.visible.enumerated()), id: \.element.id) { index, app in
          let last = index == shown.visible.count - 1
          if section.title == Plugins.featured && !expanded {
            FeaturedConnectorRow(app: app).rowDivider(!last, inset: 16)
          } else {
            CatalogConnectorRow(app: app).rowDivider(!last)
          }
        }
      }
    }
  }

  /** The filter (Muse has none; ours keeps the Mac's): Type and Ownership, then, on Available, every category or one. */
  private var filterMenu: some View {
    let active = tab == .available ? category != nil || !model.marketplaceFilter.isAll : !model.yoursFilter.isAll
    return Menu {
      switch tab {
      case .available:
        PluginFilterPickers(filter: $model.marketplaceFilter)
        Section("Category") {
          Picker("Category", selection: $category) {
            Text("All apps").tag(String?.none)
            ForEach(AppSections.make(store.catalog, query: "").map(\.title), id: \.self) { title in
              Text(title).tag(String?.some(title))
            }
          }
        }
      case .yours:
        PluginFilterPickers(filter: $model.yoursFilter)
      }
    } label: {
      Image(systemName: "line.3.horizontal.decrease")
        .foregroundStyle(active ? Ink.link : Ink.primary)
    }
    .accessibilityLabel("Filter connectors")
  }

  private var sections: [AppSections.Section] {
    let all = AppSections.make(store.catalog, query: query)
    let filter = model.marketplaceFilter
    // The Mac's filter (`nt`) on each app's catalog entry; an app the box's catalog does not list is kept by All alone.
    let kept = filter.isAll ? all : all.compactMap { section -> AppSections.Section? in
      let apps = section.apps.filter { app in model.entry(app.id).map { Plugins.keeps($0, filter) } ?? false }
      return apps.isEmpty ? nil : AppSections.Section(title: section.title, apps: apps)
    }
    guard let category else { return kept }
    return kept.filter { $0.title == category }
  }
}

/** The two halves of Connectors: what can be added, and what the person has (Muse's Connected; "connected become yours"). */
enum ConnectorsTab: CaseIterable {
  case available, yours

  var title: String {
    switch self {
    case .available: "Available"
    case .yours: "Yours"
    }
  }
}

/** How large a logo sits in its tile on Connectors: as an app's icon, not the chat card's small mark. */
enum ConnectorLook {
  static let logo: CGFloat = 0.78
  /** A row's logo (Muse's are about this size), and a featured card's. */
  static let rowTile: CGFloat = 40
  static let featuredTile: CGFloat = 64
  /** Where a row's hairline starts: under its name. */
  static let rowInset: CGFloat = 16 + rowTile + 14
}

/** See all › (Muse's), in the section head's grey. */
struct SeeAll: View {
  var body: some View {
    HStack(spacing: 3) {
      Text("See all")
      Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
    }
    .contentShape(.rect)
  }
}

/** A group of rows on one rounded card (Muse's), each row's hairline drawn by the row (`rowDivider`). */
struct ConnectorsCard<Content: View>: View {
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(spacing: 0) { content() }
      .background(Ink.groupedRow, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
      .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
  }
}

extension View {
  /** The hairline under a card's row but its last, from the name's edge. */
  func rowDivider(_ shown: Bool, inset: CGFloat = ConnectorLook.rowInset) -> some View {
    overlay(alignment: .bottom) {
      if shown { Rectangle().fill(Ink.hairline).frame(height: 0.5).padding(.leading, inset) }
    }
  }
}

/** A row's word at the right, in the blue (Connect, View) or the grey (Added, Coming soon), 17 as Muse's, with room for a finger. */
struct RowWord: View {
  let title: String
  var ink: Color = Ink.link

  var body: some View {
    Text(title)
      .font(.system(size: 17))
      .foregroundStyle(ink)
      .lineLimit(1)
      .fixedSize()
      .padding(.vertical, 10)
      .padding(.leading, 10)
      .contentShape(.rect)
  }
}

/**
 * A featured app (Muse's Featured): its name (17 semibold) over what it does
 * (15, three lines), its logo large at the right; it opens the app's page,
 * where Connect is.
 */
struct FeaturedConnectorRow: View {
  let app: CatalogApp
  @Environment(SimeonCore.AppStore.self) private var store

  var body: some View {
    NavigationLink { PluginPage(entryId: app.id) } label: {
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 4) {
          Text(app.title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary).lineLimit(1)
          if !app.summary.isEmpty {
            Text(app.summary).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(3)
              .fixedSize(horizontal: false, vertical: true)
          }
          if store.isConnected(app.title) {
            Text(Connecting.connected).font(.system(size: 13)).foregroundStyle(Ink.secondary).padding(.top, 2)
          }
        }
        Spacer(minLength: 8)
        ConnectorTile(name: app.title, size: ConnectorLook.featuredTile, logo: ConnectorLook.logo)
      }
      .padding(16)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
  }
}

/**
 * One app of the catalog in its category's card (Muse's row): its logo, its
 * name (with the Team mark for a team's marketplace), and at the right
 * Connect in the blue; View once it is connected (its page), Added for a
 * plugin of skills alone, Coming soon for an app that can't be added yet.
 * The row opens the app's page. Connect (PluginAddButton) is the consent,
 * then the setup page or the sign-in, in one go; an app added before but not
 * signed in says Connect too, and Connect then only signs it in.
 */
struct CatalogConnectorRow: View {
  let app: CatalogApp
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    // A plugin of skills alone has no app to sign in to: it is in once it is added (the Mac's `et`).
    let skillsAdded = model.entry(app.id).map { $0.connectorList.isEmpty && model.installed($0).isInstalled } ?? false
    // An app that can't be added yet: dimmed, "Coming soon" in place of Connect (`AppsComingSoon`).
    let soon = store.isComingSoon(app.id)
    HStack(spacing: 8) {
      NavigationLink { PluginPage(entryId: app.id) } label: {
        HStack(spacing: 14) {
          ConnectorTile(name: app.title, size: ConnectorLook.rowTile, logo: ConnectorLook.logo)
          HStack(spacing: 6) {
            Text(app.title).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
            if let team = model.entry(app.id).flatMap({ Plugins.teamMark($0) }) { TeamBadge(tip: team) }
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
        .opacity(soon ? 0.6 : 1)
      }
      .buttonStyle(.plain)
      if soon {
        RowWord(title: AppsComingSoon.label, ink: Ink.tertiary)
          .accessibilityLabel("\(app.title) is coming soon")
      } else if store.isConnected(app.title) {
        NavigationLink { PluginPage(entryId: app.id) } label: { RowWord(title: "View") }
          .buttonStyle(.plain)
          .accessibilityLabel("View \(app.title)")
      } else if skillsAdded {
        RowWord(title: "Added", ink: Ink.secondary)
      } else if connector.connecting == app.title || model.adding == app.id {
        ProgressView().controlSize(.small).frame(width: 44, height: 40)
      } else {
        PluginAddButton(name: app.title, catalogApp: app, entryId: app.id) { RowWord(title: Connecting.connect) }
          .accessibilityLabel("Connect \(app.title)")
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
  }
}

/** See all: every app of one category, in one card. */
struct ConnectorsCategoryPage: View {
  let title: String
  let apps: [CatalogApp]

  var body: some View {
    ScrollView {
      ConnectorsCard {
        ForEach(Array(apps.enumerated()), id: \.element.id) { index, app in
          CatalogConnectorRow(app: app).rowDivider(index < apps.count - 1)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 12)
      .padding(.bottom, 32)
    }
    .background(Ink.ground.ignoresSafeArea())
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
  }
}

/**
 * Yours (Muse's Connected): the apps the person added, each with its logo,
 * its name ("Error" beside it in red when the box says so) and its tools or
 * "Not connected", and at the right View once it is connected, else Connect,
 * which asks first as every connect does, then opens its sign-in. Then the
 * plugins added with no app of their own (skills only), and Private, an
 * agent's own skills. Since the Mac's Plugins came over: the GitHub banner
 * over them, and the filter's Type and Ownership.
 */
struct YoursConnectors: View {
  let query: String
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model

  var body: some View {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let filter = model.yoursFilter
    let kept = keptServers(filter)
    let apps = store.appsOnce.filter { (q.isEmpty || $0.name.localizedCaseInsensitiveContains(q)) && (kept?.contains($0.serverId) ?? true) }
    let skillsOnly = skillsOnlyPlugins(query: q, filter: filter)
    let skills = Plugins.privateSkills(model.skills).filter { (q.isEmpty || $0.name.lowercased().contains(q.lowercased())) && Plugins.keeps($0, filter) }
    // The Mac's: with a filter set, a section with nothing in it is left out.
    let showsInstalled = filter.isAll || !apps.isEmpty || !skillsOnly.isEmpty
    let showsPrivate = filter.isAll || model.agentId == nil || !skills.isEmpty
    if !model.authBlocked.isEmpty { GitHubBanner().padding(.top, 16) }
    if !showsInstalled && !showsPrivate {
      Text(Plugins.noFilterMatch).font(.system(size: 15)).foregroundStyle(Ink.secondary).padding(.top, 26)
    }
    if showsInstalled {
      PluginsSectionHead(title: "Apps") { EmptyView() }
      if apps.isEmpty && skillsOnly.isEmpty {
        Text(q.isEmpty || store.appsOnce.isEmpty ? "No apps yet. Connect one from Available." : "No apps match \u{201C}\(q)\u{201D}.")
          .font(.system(size: 15)).foregroundStyle(Ink.secondary)
          .padding(.horizontal, 4)
      } else {
        ConnectorsCard {
          ForEach(Array(apps.enumerated()), id: \.element.id) { index, app in
            YoursConnectorRow(app: app).rowDivider(index < apps.count - 1 || !skillsOnly.isEmpty)
          }
          ForEach(Array(skillsOnly.enumerated()), id: \.element.entry.id) { index, plugin in
            SkillsPluginRow(entry: plugin.entry, mode: plugin.mode).rowDivider(index < skillsOnly.count - 1)
          }
        }
      }
    }
    if showsPrivate { PrivateSkillsSection(skills: skills, query: q) }
  }

  /** The servers the filter keeps (the Mac's `nt` on Yours' rows), or nil when it keeps every one. */
  private func keptServers(_ filter: PluginFilter) -> Set<String>? {
    guard !filter.isAll else { return nil }
    var kept = Set<String>()
    for item in model.yoursItems where Plugins.keeps(item, filter) {
      switch item {
      case .plugin(_, _, let connectors): kept.formUnion(connectors.map(\.id))
      case .connector(let server, _): kept.insert(server.id)
      }
    }
    return kept
  }

  /** The plugins added with no server (`rt`'s plugins without connectors), as the search and the filter keep them (`ui`, `nt`). */
  private func skillsOnlyPlugins(query: String, filter: PluginFilter) -> [(entry: PluginEntry, mode: PluginInstallMode)] {
    model.yoursItems.compactMap { item in
      guard case .plugin(let entry, let mode, let connectors) = item, connectors.isEmpty,
            Plugins.keeps(item, query: query), Plugins.keeps(item, filter) else { return nil }
      return (entry, mode)
    }
  }
}

/** One app on Yours; the team's mark beside its name when the team added it (the Mac's `TeamBadge`). */
struct YoursConnectorRow: View {
  let app: ConnectedApp
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  /** What the person reads before the sign-in page opens (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    let connected = app.status == "connected"
    HStack(spacing: 8) {
      NavigationLink { PluginPage(app: app) } label: {
        HStack(spacing: 14) {
          ConnectorTile(name: app.name, size: ConnectorLook.rowTile, logo: ConnectorLook.logo)
          VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
              Text(app.name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
              if let team = teamLabel { TeamBadge(tip: team) }
              if app.status == "error" { Text("Error").font(.system(size: 13)).foregroundStyle(Ink.danger).fixedSize() }
            }
            Text(connected ? (app.toolCount == 1 ? "1 tool" : app.toolCount > 0 ? "\(app.toolCount) tools" : Connecting.connected) : "Not connected")
              .font(.system(size: 13)).foregroundStyle(connected ? Ink.secondary : Ink.danger).lineLimit(1)
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      if connected {
        NavigationLink { PluginPage(app: app) } label: { RowWord(title: "View") }
          .buttonStyle(.plain)
          .accessibilityLabel("View \(app.name)")
      } else if connector.connecting == app.name {
        ProgressView().controlSize(.small).frame(width: 44, height: 40)
      } else {
        Button { asking = ConnectConsent(app: store.catalogApp(named: app.name), name: app.name) } label: {
          RowWord(title: Connecting.connect)
        }
        .buttonStyle(.plain)
        .disabled(connector.connecting != nil)
        .accessibilityLabel("Connect \(app.name)")
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    // The sign-in page opens once the sheet has gone; then how it went, as Connect says it.
    .sheet(item: $asking, onDismiss: {
      guard confirmed else { return }
      confirmed = false
      Task {
        let end = await connector.signIn(app, store: store)
        await model.connectEnded(model.entry(for: app), name: app.name, end: end)
      }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
  }

  /** The team's words for its row of Yours (`Xn`): "Added by your team" or "Managed by your team"; nothing for the person's own. */
  private var teamLabel: String? {
    let item = model.yoursItems.first { item in
      switch item {
      case .plugin(_, _, let connectors): return connectors.contains { $0.id == app.serverId }
      case .connector(let server, _): return server.id == app.serverId
      }
    }
    return item.flatMap { Plugins.modeLabel($0.installMode) }
  }
}
