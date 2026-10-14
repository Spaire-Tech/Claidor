import SwiftUI
import SimeonCore

/**
 * Connectors' pages and parts beyond its two lists (Settings.swift),
 * ported from the Mac's Plugins window
 * (mac/Simeon/PluginsWindow.swift) with its behaviour and words, drawn as
 * the phone's Connect apps is drawn: a plugin's page, the setup page, a
 * skill's page, Yours › Private, the GitHub banner, the Team mark, the
 * filter's Type and Ownership, and the notice.
 */

extension Ink {
  /** Orange words (the Mac's `--sand-text-warning`): the GitHub banner's title. */
  static let pluginWarning = Color.dynamic(light: "#c27400", dark: "#ffaf38")
  /** The GitHub banner's orange wash (the Mac's `#ff9800` at 9%, 17% on dark). */
  static let pluginBanner = Color.dynamic(light: "#ff980017", dark: "#ff98002c")
}

// MARK: - The notice

/**
 * The notice (the Mac's `TKn`): at the foot, over every page of the sheet;
 * a tick in green or a cross in red, the words, Dismiss. It goes after
 * 3.5 s, or 6 s for a failure; the phone taps under the finger as it comes
 * (ConnectAppsModel.show).
 */
struct PluginNoticeBar: View {
  @Environment(ConnectAppsModel.self) private var model

  var body: some View {
    if let notice = model.notice {
      HStack(spacing: 10) {
        Image(systemName: notice.isError ? "xmark.circle.fill" : "checkmark.circle.fill")
          .font(.system(size: 17))
          .foregroundStyle(notice.isError ? Ink.danger : Ink.live)
          .accessibilityHidden(true)
        Text(notice.text)
          .font(.system(size: 15))
          .foregroundStyle(Ink.primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
        Button { model.show(nil) } label: {
          Image(systemName: "xmark")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Ink.secondary)
            .frame(width: 28, height: 28)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dismiss")
      }
      .padding(.leading, 14)
      .padding(.trailing, 8)
      .padding(.vertical, 10)
      .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .padding(.horizontal, 16)
      .padding(.bottom, 12)
      .transition(.move(edge: .bottom).combined(with: .opacity))
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.updatesFrequently)
    }
  }
}

// MARK: - The filter

/** The Mac's Filter menu (`ii`): Type (All types, Connectors, Skills), then Ownership (All, Team, Public); one choice each. */
struct PluginFilterPickers: View {
  @Binding var filter: PluginFilter

  var body: some View {
    Section("Type") {
      Picker("Type", selection: $filter.type) {
        ForEach(PluginFilter.Kind.allCases, id: \.self) { kind in Text(PluginFilter.label(kind)).tag(kind) }
      }
    }
    Section("Ownership") {
      Picker("Ownership", selection: $filter.ownership) {
        ForEach(PluginFilter.Ownership.allCases, id: \.self) { owner in Text(PluginFilter.label(owner)).tag(owner) }
      }
    }
  }
}

// MARK: - Rows' parts

/** Team (the Mac's `TeamBadge`, `it`): people and "Team" at 11 in the faint grey on the quiet fill, 18 high; what the Mac's tooltip says is read out with it. */
struct TeamBadge: View {
  let tip: String

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "person.2").font(.system(size: 10))
      Text("Team").font(.system(size: 11))
    }
    .foregroundStyle(Ink.tertiary)
    .padding(.leading, 5)
    .padding(.trailing, 6)
    .frame(height: 18)
    .background(Ink.pillButton, in: Capsule())
    .fixedSize()
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Team")
    .accessibilityValue(tip)
  }
}

/** A skill's tile (the Mac's `SkillTile`): the list mark on the logos' tile, at the rows' size (42) or a page's (56). */
struct SkillTile: View {
  var size: CGFloat = ConnectorLogo.row

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: size * 11 / 40, style: .continuous)
    Image(systemName: "list.bullet.rectangle")
      .font(.system(size: size * 0.4))
      .foregroundStyle(Ink.secondary)
      .frame(width: size, height: size)
      .background(Ink.tile, in: shape)
      .overlay(shape.stroke(Ink.tileEdge, lineWidth: 0.5))
      .accessibilityHidden(true)
  }
}

/**
 * Connect, on a Marketplace row and on a plugin's page (the Mac's
 * `requestAdd`; Add until 13 October 2026, `Connecting`): a skills-only
 * plugin is added at once, for Private's agent; the rest ask first
 * (ConnectConsentSheet), then open the setup page when the plugin asks for
 * values, or else install the app and open its sign-in in one go
 * (AppConnector), its skills synced once it is connected. A sign-in the
 * person cancels takes the app back out: nothing waits under a second
 * button in Your plugins.
 */
struct PluginAddButton<Label: View>: View {
  /** The app's name as the connect knows it (`CatalogApp.title`). */
  let name: String
  let catalogApp: CatalogApp?
  let entryId: String
  @ViewBuilder var label: () -> Label
  @Environment(AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    Button(action: add) { label() }
      .buttonStyle(.plain)
      .disabled(connector.connecting != nil || model.isBusy)
      // The setup page or the sign-in opens once the consent has gone.
      .sheet(item: $asking, onDismiss: {
        guard confirmed else { return }
        confirmed = false
        if let entry = model.entry(entryId), model.needsSetup(entry) {
          model.setup = ConnectAppsModel.Setup(entryId: entry.id, editing: false)
          return
        }
        Task {
          let end = await connector.connect(name, store: store)
          await model.connectEnded(model.entry(entryId), name: name, end: end)
        }
      }) { consent in
        ConnectConsentSheet(consent: consent) { confirmed = true }
      }
  }

  private func add() {
    if let entry = model.entry(entryId), entry.connectorList.isEmpty {
      Task { await model.addSkills(entry) }
      return
    }
    asking = ConnectConsent(app: catalogApp, name: name)
  }
}

// MARK: - Your plugins' parts

/**
 * The GitHub banner (the Mac's, at the top of Yours): what can't be
 * fetched, and Fix with agent ("Opening…" while it starts), which opens the
 * Plugin Setup agent's chat; the list opens it as it opens a tapped
 * notification's, closing Settings on the way.
 */
struct GitHubBanner: View {
  @Environment(ConnectAppsModel.self) private var model

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 3) {
        Text("Complete GitHub auth to sync installed plugins")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Ink.pluginWarning)
        Text(Plugins.authBlockedLine(model.authBlocked))
          .font(.system(size: 13))
          .foregroundStyle(Ink.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button {
        Task {
          guard let id = await model.fixWithAgent() else { return }
          Haptics.tap()
          Notifications.shared.openAgent = id
        }
      } label: {
        PluginPill(title: model.launchingFix ? "Opening…" : "Fix with agent", fill: Ink.pillButton, ink: Ink.primary)
      }
      .buttonStyle(.plain)
      .disabled(model.launchingFix)
    }
    .padding(14)
    .background(Ink.pluginBanner, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Plugin content needs GitHub authentication")
  }
}

/** An added plugin with no server of its own (skills only) on Your plugins: its logo, name (with the team's mark) and what it brings; it opens its page. */
struct SkillsPluginRow: View {
  let entry: PluginEntry
  let mode: PluginInstallMode

  var body: some View {
    NavigationLink { PluginPage(entryId: entry.id) } label: {
      HStack(spacing: 14) {
        ConnectorTile(name: entry.displayName, size: ConnectorLogo.row, logo: ConnectorLogo.fill, id: entry.id)
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(entry.displayName).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
            if let team = Plugins.modeLabel(mode) { TeamBadge(tip: team) }
          }
          Text(Plugins.contributions(entry)).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        ConnectorMark.added()
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .padding(.vertical, 13.5)
  }
}

/**
 * Yours › Private (the Mac's, `Ml`): the agent's own skills and the ones
 * the person published, by name, each opening its page; the agent's own
 * with its switch. The Mac shows the open agent's; the phone's head names
 * the agent and changes it.
 */
struct PrivateSkillsSection: View {
  let skills: [AgentSkill]
  let query: String
  @Environment(AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model

  var body: some View {
    ConnectorsSectionTitle(title: "Private") {
      if !model.skillAgents.isEmpty { agentMenu }
    }
    if model.agentId == nil || skills.isEmpty {
      Text(Plugins.privateEmpty(agentOpen: model.agentId != nil, query: query))
        .font(.system(size: 15))
        .foregroundStyle(Ink.secondary)
        .padding(.top, 8)
    } else {
      ForEach(skills) { skill in PrivateSkillRow(skill: skill) }
    }
  }

  /** Whose skills: the person's agents, the chosen one ticked. */
  private var agentMenu: some View {
    Menu {
      Picker("Agent", selection: Binding(get: { model.agentId ?? "" }, set: { id in Task { await model.choose(agent: id) } })) {
        ForEach(model.skillAgents) { agent in Text(agent.name).tag(agent.id) }
      }
    } label: {
      HStack(spacing: 4) {
        Text(store.agent(model.agentId)?.name ?? "Agent").lineLimit(1)
        Image(systemName: "chevron.up.chevron.down").font(.system(size: 10, weight: .medium))
      }
      .contentShape(.rect)
    }
    .accessibilityLabel("Agent")
    .accessibilityValue(store.agent(model.agentId)?.name ?? "")
  }
}

/** A private skill's row: its tile, name (16.4) and line (13, the Mac's "Created locally · …"); the agent's own with its switch, changed at once; it opens the skill's page. */
struct PrivateSkillRow: View {
  let skill: AgentSkill
  @Environment(ConnectAppsModel.self) private var model

  var body: some View {
    HStack(spacing: 12) {
      NavigationLink { SkillPage(skillId: skill.id) } label: {
        HStack(spacing: 14) {
          SkillTile()
          VStack(alignment: .leading, spacing: 2) {
            Text(skill.name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
            Text(skill.subtitle).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      if skill.source == "workflow" {
        // A failure is let go, as the Mac's overlay does: the switch shows what the box says.
        Toggle("Enable \(skill.name)", isOn: Binding(get: { skill.isEnabledForAgent }, set: { _ in Task { await model.setEnabled(skill) } }))
          .labelsHidden()
          .tint(Ink.blue)
      }
    }
    .padding(.vertical, 13.5)
  }
}

// MARK: - A skill's page

/**
 * A skill's page (the Mac's `SkillPage`, `Hi`): its tile, name and kind,
 * and what it is for; Name, Description ("Use when…", its hint while it is
 * empty) and Instructions; Save in the bar once something changed and all
 * three are filled; Delete skill for the agent's own, which closes the
 * page. A skill the organization manages is read only.
 */
struct SkillPage: View {
  let skillId: String
  @Environment(ConnectAppsModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var details = ""
  @State private var instructions = ""
  @State private var working = false

  var body: some View {
    let skill = model.skills.first { $0.id == skillId }
    Form {
      if let skill {
        let managed = skill.source == "managed"
        Section {
          HStack(spacing: 14) {
            SkillTile(size: 56)
            VStack(alignment: .leading, spacing: 3) {
              Text(skill.name).font(.system(size: 20, weight: .semibold)).foregroundStyle(Ink.primary)
              Text(skill.kindLine).font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
          }
          .padding(.vertical, 6)
          if !skill.description.isEmpty {
            Text(skill.description).font(.system(size: 15)).foregroundStyle(Ink.secondary).textSelection(.enabled)
          }
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          TextField("Name", text: $name).disabled(managed)
        } header: {
          Text("Name")
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          TextField("Use when…", text: $details, axis: .vertical).disabled(managed)
        } header: {
          Text("Description")
        } footer: {
          if details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !managed { Text(Plugins.skillDescriptionHint) }
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          TextField("Markdown instructions the agent follows when it runs this skill", text: $instructions, axis: .vertical)
            .lineLimit(5...)
            .disabled(managed)
        } header: {
          Text("Instructions")
        }
        .listRowBackground(Ink.groupedRow)
        if !managed && skill.source == "workflow" && model.agentId != nil {
          Section {
            Button("Delete skill", role: .destructive) {
              Task { if await model.delete(skill) { dismiss() } }
            }
          }
          .listRowBackground(Ink.groupedRow)
        }
      }
    }
    .groupedGround()
    .navigationTitle(skill?.name ?? "")
    .inlineBarTitle()
    .toolbar {
      ToolbarItem(placement: .trailingBar) {
        if let skill, skill.source != "managed" {
          Button("Save") { save(skill) }.disabled(!ready(skill))
        }
      }
    }
    // The fields follow the skill when it changes from outside (and after Save).
    .onChange(of: skill, initial: true) { _, now in
      guard let now else { return }
      name = now.name
      details = now.description
      instructions = now.body
    }
  }

  private func ready(_ skill: AgentSkill) -> Bool {
    let changed = name != skill.name || details != skill.description || instructions != skill.body
    return Plugins.canSaveSkill(agentOpen: model.agentId != nil, changed: changed, name: name, description: details, body: instructions, saving: working)
  }

  private func save(_ skill: AgentSkill) {
    working = true
    Task {
      _ = await model.save(skill, name: name, description: details, body: instructions)
      working = false
    }
  }
}

// MARK: - The setup page

/**
 * The setup page (the Mac's `SetupPage`, `Di`), a sheet on the phone: what
 * it is for, each value (secrets hidden, "(optional)"), what is required,
 * and Add or Save Values; Cancel leaves it. Current values are never shown.
 * It goes once the plugin is added or its values saved.
 */
struct PluginSetupSheet: View {
  let setup: ConnectAppsModel.Setup
  @Environment(ConnectAppsModel.self) private var model
  @State private var values: [String: String] = [:]
  @State private var tried = false

  var body: some View {
    let entry = model.entry(setup.entryId)
    let fields = entry?.fields ?? []
    let missing = Plugins.setupMissing(fields, values)
    let name = entry?.displayName ?? "the plugin"
    NavigationStack {
      Form {
        Section {
          Text(Plugins.setupIntro(name, editing: setup.editing))
            .font(.system(size: 15))
            .foregroundStyle(Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .listRowBackground(Ink.groupedRow)
        ForEach(fields) { field in
          let invalid = tried && missing.contains(field)
          Section {
            SetupFieldRow(field: field, text: binding(field)) { submit(missing: missing) }
          } header: {
            Text(field.isRequired ? field.label : "\(field.label) (optional)").textCase(nil)
          } footer: {
            if invalid {
              Text(Plugins.requiredLine(field.label)).foregroundStyle(Ink.danger)
            } else if let hint = field.hint {
              Text(hint)
            }
          }
          .listRowBackground(Ink.groupedRow)
        }
      }
      .groupedGround()
      .navigationTitle(entry?.displayName ?? "")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) {
          Button("Cancel") { model.setup = nil }.disabled(model.isBusy)
        }
      }
      .safeAreaInset(edge: .bottom) {
        VStack(spacing: 8) {
          if tried && !missing.isEmpty {
            Text(Plugins.fillInLine(missing: missing.count)).font(.system(size: 13)).foregroundStyle(Ink.secondary)
          }
          Button { submit(missing: missing) } label: {
            Group {
              if model.isBusy { ProgressView().tint(.white) } else { Text(Plugins.setupSubmit(name, editing: setup.editing)) }
            }
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
          }
          .buttonStyle(.glassProminent)
          // Our blue, as the consent's Connect has it.
          .tint(Ink.blue)
          .disabled(model.isBusy)
        }
        .padding(.horizontal, 24)
        .padding(.top, 10)
        .padding(.bottom, 8)
      }
    }
    .overlay(alignment: .bottom) { PluginNoticeBar().animation(.easeOut(duration: 0.2), value: model.notice) }
    .interactiveDismissDisabled(model.isBusy)
    .onAppear { if values.isEmpty { values = Plugins.setupStart(fields) } }
  }

  private func binding(_ field: PluginEntry.Field) -> Binding<String> {
    Binding(get: { values[field.key] ?? "" }, set: { values[field.key] = $0 })
  }

  private func submit(missing: [PluginEntry.Field]) {
    tried = true
    guard missing.isEmpty, !model.isBusy else {
      if !missing.isEmpty { Haptics.warning() }
      return
    }
    let given = Plugins.setupValues(values)
    Task { await model.submitSetup(given) }
  }
}

/** A setup value's field: hidden for a secret, typed as it is; its placeholder the catalog's, else its key. */
struct SetupFieldRow: View {
  let field: PluginEntry.Field
  @Binding var text: String
  let submit: () -> Void

  var body: some View {
    Group {
      if field.isSecret {
        SecureField(field.placeholder ?? field.key, text: $text)
      } else {
        TextField(field.placeholder ?? field.key, text: $text)
          .autocorrectionDisabled()
      }
    }
    .typedAsIs()
    .font(.system(size: 17))
    .submitLabel(.go)
    .onSubmit(submit)
    .accessibilityLabel(field.label)
  }
}

// MARK: - A plugin's page

/** Under a plugin's name: its marketplace and View Source ↗ (its homepage, opened outside the app), joined by "·" (the Mac's `MetaLine`). */
struct PluginMetaLine: View {
  let market: String?
  let homepage: String?
  @Environment(\.openURL) private var openURL

  var body: some View {
    let source = homepage.flatMap { URL(string: $0) }.flatMap { ["http", "https"].contains($0.scheme?.lowercased() ?? "") ? $0 : nil }
    if market != nil || source != nil {
      HStack(spacing: 6) {
        if let market { Text(market).lineLimit(1) }
        if market != nil && source != nil { Text("·") }
        if let source {
          Button { openURL(source) } label: {
            HStack(spacing: 3) {
              Text("View Source")
              Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .medium))
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
        }
      }
      .font(.system(size: 13))
      .foregroundStyle(Ink.secondary)
    }
  }
}

/** A folded section (the Mac's `FoldCard`): its count ("1 connector", "2 skills"), opened to each one's name and what it does. */
struct PluginFoldSection: View {
  let heading: String
  let summary: String
  let rows: [(String, String)]
  @State private var open = false

  var body: some View {
    Section(heading) {
      DisclosureGroup(isExpanded: $open) {
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          VStack(alignment: .leading, spacing: 2) {
            Text(row.0).font(.system(size: 17)).foregroundStyle(Ink.primary)
            Text(row.1).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(3)
          }
        }
      } label: {
        Text(summary).foregroundStyle(Ink.primary)
      }
    }
    .listRowBackground(Ink.groupedRow)
  }
}

/** Details' line (the Mac's `DetailPair`): the term, and its value in grey, cut in the middle when it is long. */
struct PluginDetailRow: View {
  let term: String
  let value: String

  var body: some View {
    LabeledContent(term) {
      Text(value).lineLimit(1).truncationMode(.middle).foregroundStyle(Ink.secondary)
    }
  }
}

/**
 * A plugin's page (the Mac's `PluginPage`, `Ri`, and its `ServerPage`,
 * `_i`), from a Marketplace row (its entry) or from Your plugins (its app's
 * server). The head: the logo, the name, how it is connected, where it
 * comes from (the marketplace and View Source ↗, or a server's host), the
 * team's label, and Add while it is not added. Then what it does; its
 * accounts, each with its state, sign-in, rename and remove, and its tools,
 * each with a switch that turns it off for every agent (the phone's own
 * since 9 October 2026); Setup with Edit Values; its connectors and skills,
 * folded; for a server no entry claims, its Details (Source, Transport, URL
 * or Command, Tools); and Uninstall, or Remove for what the team added.
 */
struct PluginPage: View {
  /** The catalog entry, from a Marketplace row. */
  var entryId: String? = nil
  /** The app's server, from Your plugins. */
  var app: ConnectedApp? = nil
  @Environment(AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var tools: [AppTool] = []
  @State private var loadingTools = true
  @State private var renaming: ConnectedApp?
  @State private var newName = ""
  @State private var switching: Set<String> = []
  @State private var removing = false
  /** An account's sign-in, asked first as every connect is (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var signingIn: ConnectedApp?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  /** What the page shows, read as the Mac's pages read it. */
  private struct Shown {
    var entry: PluginEntry?
    /** The store's catalog row of a Marketplace page: its name, what it does and Add while the box's catalog is read (or could not be). */
    var catalogApp: CatalogApp?
    var installed: Plugins.Installed?
    /** A server no entry claims (the Mac's server page). */
    var server: PluginServer?
    var serverId: String?
    var accounts: [ConnectedApp]
    /** Add, Uninstall, the team's Remove or label (`ft`), once the catalog and the servers are read. */
    var action: Plugins.PageAction?
    var name: String
  }

  private var resolved: Shown {
    let entry = entryId.flatMap { model.entry($0) } ?? app.flatMap { model.entry(for: $0) }
    let installed = entry.map { model.installed($0) }
    let serverId = app?.serverId ?? installed?.server?.id
    let server = entry == nil ? serverId.flatMap { id in model.onePerServer.first { $0.id == id } } : nil
    var action: Plugins.PageAction?
    if model.catalogLoaded && model.serversLoaded {
      if let entry, let installed {
        let mode = installed.plugin?.installMode ?? installed.server?.installMode ?? model.item(of: entry)?.installMode
        action = Plugins.pageAction(installed: installed.isInstalled, mode: mode)
      } else if let server {
        action = Plugins.pageAction(installed: true, mode: server.installMode)
      }
    }
    let accounts = serverId.map { store.accounts(of: $0) } ?? []
    let catalogApp = entryId.flatMap { id in store.catalog.first { $0.id == id } }
    return Shown(entry: entry, catalogApp: catalogApp, installed: installed, server: server, serverId: serverId, accounts: accounts, action: action,
                 name: entry?.displayName ?? app?.name ?? catalogApp?.title ?? "")
  }

  var body: some View {
    let shown = resolved
    let connected = shown.accounts.contains { $0.status == "connected" }
    Form {
      Section { head(shown, connected: connected) }
        .listRowBackground(Ink.groupedRow)
      if let about = shown.entry?.description ?? shown.catalogApp?.summary, !about.isEmpty {
        Section {
          Text(about)
            .font(.system(size: 15))
            .foregroundStyle(Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        }
        .listRowBackground(Ink.groupedRow)
      }
      if !shown.accounts.isEmpty {
        accountsSection(shown.accounts)
        toolsSection(serverId: shown.serverId, connected: connected)
      }
      if let entry = shown.entry { contributions(entry, installed: shown.installed) }
      if let server = shown.server { details(server) }
      actionSection(shown)
    }
    .groupedGround()
    .navigationTitle(shown.name)
    .inlineBarTitle()
    .task(id: "\(shown.serverId ?? "")\u{1F}\(connected)") {
      guard let serverId = resolved.serverId else {
        tools = []
        loadingTools = false
        return
      }
      loadingTools = true
      tools = await store.tools(of: serverId)
      loadingTools = false
    }
    .alert("Rename account", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Account name", text: $newName)
      Button("Rename") { if let account = renaming { Task { await store.renameAccount(account, to: newName) } }; renaming = nil }
      Button("Cancel", role: .cancel) { renaming = nil }
    }
    // The sign-in page opens once the sheet has gone; then how it went, as Connect says it.
    .sheet(item: $asking, onDismiss: {
      let account = signingIn
      signingIn = nil
      guard confirmed, let account else { confirmed = false; return }
      confirmed = false
      Task {
        let end = await connector.signIn(account, store: store)
        await model.connectEnded(model.entry(for: account), name: account.name, end: end)
      }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
  }

  // MARK: The head

  private func head(_ shown: Shown, connected: Bool) -> some View {
    HStack(spacing: 14) {
      ConnectorTile(name: shown.name, size: 56, logo: ConnectorLogo.fill, id: shown.entry?.id ?? shown.catalogApp?.id)
      VStack(alignment: .leading, spacing: 3) {
        Text(shown.name).font(.system(size: 20, weight: .semibold)).foregroundStyle(Ink.primary)
        if let first = shown.accounts.first {
          Text(connected ? "Connected · \(tools.isEmpty ? first.toolCount : tools.filter { !$0.isDisabled }.count) tools" : "Not connected")
            .font(.system(size: 13)).foregroundStyle(connected ? Ink.secondary : Ink.danger)
        }
        if let entry = shown.entry {
          PluginMetaLine(market: entry.marketplace?.displayName, homepage: entry.homepage)
        } else if let host = Plugins.hostLine(shown.server?.url) {
          Text(host).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
        }
        if let label = teamLabel(shown.action) {
          PluginPill(title: label, fill: Ink.pillButton, ink: Ink.secondary).padding(.top, 3)
        }
      }
      Spacer(minLength: 8)
      if case .add = shown.action, let entry = shown.entry {
        addButton(entry.id)
      } else if shown.entry == nil, let catalogApp = shown.catalogApp, !store.isConnected(catalogApp.title) {
        // Not in the box's catalog (yet): the row's own Add.
        addButton(catalogApp.id)
      }
    }
    .padding(.vertical, 6)
  }

  /** The team's words beside what it added or requires. */
  private func teamLabel(_ action: Plugins.PageAction?) -> String? {
    switch action {
    case .remove(let label)?, .managed(let label)?: return label
    default: return nil
    }
  }

  /** Connect (the blue, as the Mac's page has it; Add until 13 October 2026, `Connecting`), the spinner while it connects, or Coming soon (`AppsComingSoon`). */
  @ViewBuilder
  private func addButton(_ entryId: String) -> some View {
    let app = store.catalog.first { $0.id == entryId }
    let name = app?.title ?? model.entry(entryId)?.displayName ?? entryId
    if app?.comingSoon == true || store.isComingSoon(entryId) {
      PluginPill(title: AppsComingSoon.label, fill: Ink.pillButton, ink: Ink.tertiary)
        .accessibilityLabel("\(name) is coming soon")
    } else if model.adding == entryId || connector.connecting == name {
      ProgressView().controlSize(.small).frame(width: 44)
    } else {
      PluginAddButton(name: name, catalogApp: app, entryId: entryId) {
        PluginPill(title: Connecting.connect, fill: Ink.authenticate, ink: .white)
      }
      .accessibilityLabel("Connect \(name)")
    }
  }

  // MARK: Accounts and tools

  private func accountsSection(_ accounts: [ConnectedApp]) -> some View {
    Section("Accounts") {
      ForEach(accounts) { account in
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text(account.accountName).font(.system(size: 17))
            Text(account.status == "connected" ? Connecting.connected : "Not connected")
              .font(.system(size: 13)).foregroundStyle(account.status == "connected" ? Ink.secondary : Ink.danger)
          }
          Spacer()
          if account.status != "connected" {
            if connector.connecting == account.name {
              ProgressView().controlSize(.small)
            } else {
              Button(Connecting.connect) {
                signingIn = account
                asking = ConnectConsent(app: store.catalogApp(named: account.name), name: account.name)
              }
              .buttonStyle(GreyButtonStyle(capsule: true))
              .disabled(connector.connecting != nil)
            }
          }
        }
        .swipeActions {
          if accounts.count > 1 {
            Button("Remove", role: .destructive) { Task { await store.removeAccount(account) } }
          }
          Button("Rename") { newName = account.accountKey == "default" ? "" : account.accountKey; renaming = account }
        }
      }
    }
    .listRowBackground(Ink.groupedRow)
  }

  private func toolsSection(serverId: String?, connected: Bool) -> some View {
    Section("Tools") {
      if loadingTools && tools.isEmpty {
        HStack { ProgressView(); Text("Loading tools…").foregroundStyle(Ink.secondary) }
      } else if tools.isEmpty {
        Text(connected ? "No tools listed." : "Connect it to see its tools.").foregroundStyle(Ink.secondary)
      }
      ForEach(tools) { tool in
        // The switch moves at once and holds until the box answers, so a second tap cannot undo the first.
        Toggle(isOn: Binding(get: { !tool.isDisabled }, set: { on in
          guard let serverId, !switching.contains(tool.name), let index = tools.firstIndex(where: { $0.name == tool.name }) else { return }
          tools[index].isDisabled = !on
          switching.insert(tool.name)
          Task {
            if let next = await store.toggleTool(serverId, tool.name) { tools = next }
            else if let now = tools.firstIndex(where: { $0.name == tool.name }) { tools[now].isDisabled = on }
            switching.remove(tool.name)
          }
        })) {
          VStack(alignment: .leading, spacing: 2) {
            Text(tool.title ?? tool.name).font(.system(size: 17))
            if let summary = tool.summary, !summary.isEmpty {
              Text(summary).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2)
            }
          }
        }
        .tint(Ink.blue)
        .disabled(switching.contains(tool.name))
      }
    }
    .listRowBackground(Ink.groupedRow)
  }

  // MARK: Setup, connectors, skills, details

  @ViewBuilder
  private func contributions(_ entry: PluginEntry, installed: Plugins.Installed?) -> some View {
    if installed?.isInstalled == true && model.item(of: entry) != nil && entry.hasSetupFields {
      Section("Setup") {
        HStack {
          Text("Setup Values").foregroundStyle(Ink.primary)
          Spacer()
          Button("Edit Values") { model.editValues(entry) }
            .buttonStyle(GreyButtonStyle(capsule: true))
            .disabled(model.isBusy)
        }
      }
      .listRowBackground(Ink.groupedRow)
    }
    if !entry.connectorList.isEmpty {
      PluginFoldSection(heading: "Connectors", summary: Plugins.count(entry.connectorList.count, "connector"),
                        rows: entry.connectorList.map { ($0.name, $0.description.isEmpty ? "Connector" : $0.description) })
    }
    if let skills = entry.skills, !skills.isEmpty {
      PluginFoldSection(heading: "Skills", summary: Plugins.count(skills.count, "skill"),
                        rows: skills.map { ($0.name, $0.description.isEmpty ? "Skill" : $0.description) })
    }
  }

  private func details(_ server: PluginServer) -> some View {
    Section("Details") {
      PluginDetailRow(term: "Source", value: Plugins.sourceWord(isTeamServer: server.isTeamServer))
      PluginDetailRow(term: "Transport", value: Plugins.transportWord(server.transport))
      if let url = server.url {
        PluginDetailRow(term: "URL", value: Plugins.detailValue(url))
      } else {
        PluginDetailRow(term: "Command", value: Plugins.detailValue(server.command))
      }
      PluginDetailRow(term: "Tools", value: Plugins.toolsValue(enabled: tools.filter { !$0.isDisabled }.count, total: tools.count, count: server.toolCount))
    }
    .listRowBackground(Ink.groupedRow)
  }

  // MARK: Uninstall, Remove

  /** Uninstall for what the person added, Remove for what the team added; nothing for what the team requires (its label is in the head). No question asked, as on the Mac. */
  @ViewBuilder
  private func actionSection(_ shown: Shown) -> some View {
    switch shown.action {
    case .uninstall?:
      removeSection("Uninstall", shown)
    case .remove?:
      removeSection("Remove", shown)
    default:
      EmptyView()
    }
  }

  private func removeSection(_ title: String, _ shown: Shown) -> some View {
    Section {
      Button(role: .destructive) { remove(shown) } label: {
        HStack {
          Text(title)
          if removing { Spacer(); ProgressView() }
        }
      }
      .disabled(removing || model.isBusy)
    }
    .listRowBackground(Ink.groupedRow)
  }

  /** The plugin uninstalled when the box has it on, else its server removed (`Tt`, `dn`); a plugin's page stays, now with Add, and a server's own goes. */
  private func remove(_ shown: Shown) {
    removing = true
    Task {
      if let entry = shown.entry, let installed = shown.installed {
        if installed.plugin != nil {
          await model.uninstall(pluginId: entry.id)
        } else if let server = installed.server {
          _ = await model.remove(serverId: server.id)
        }
      } else if let server = shown.server {
        if await model.remove(serverId: server.id) { dismiss() }
      }
      removing = false
    }
  }
}
