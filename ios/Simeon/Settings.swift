import SwiftUI
import UIKit
import SimeonCore

/**
 * Settings, as the Mac's General page on a phone (the founder's phone
 * design): Account, Appearance, Agent (Timezone, Auto-review and its
 * rules), Usage & Billing, then Connect apps, Sign Out and the mark. The
 * Mac-only rows (Execution on Local Computer, Security Key) are left out:
 * nothing on the phone uses them.
 */
struct SettingsSheet: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @Environment(\.openURL) private var openURL
  @AppStorage("simeon.theme") private var theme = "system"
  @State private var settings: JSON?
  @State private var quota: JSON?
  @State private var showsApps = false
  @State private var copied = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Account") {
          HStack(spacing: 14) {
            Initials(letters: store.account?.initials ?? "", size: 50)
              .background(Ink.bubbleTheirs, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
              Text(store.account?.name ?? "").font(.system(size: 17)).foregroundStyle(Ink.primary)
              HStack(spacing: 8) {
                Text(store.account?.email ?? "").font(.system(size: 15)).foregroundStyle(Ink.secondary)
                  .lineLimit(1).minimumScaleFactor(0.75)
                Button {
                  UIPasteboard.general.string = store.account?.email
                  copied = true
                } label: {
                  Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 13)).foregroundStyle(Ink.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Copy email")
              }
            }
          }
          .padding(.vertical, 4)
        }
        Section("Appearance") {
          Picker("Theme", selection: $theme) {
            Text("Follow System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
        }
        Section("Agent") {
          NavigationLink {
            TimeZonePicker(current: settings?["userTimeZoneOverride"]?.string ?? "", detected: settings?["userTimeZone"]?.text ?? TimeZone.current.identifier) { zone in
              Task { if let next = await store.setHostSettings(["userTimeZoneOverride": .string(zone)]) { settings = next } }
            }
          } label: {
            LabeledContent("Timezone", value: timeZoneLabel)
          }
          Toggle(isOn: autoReview) {
            VStack(alignment: .leading, spacing: 3) {
              Text("Auto-review")
              Text("Simeon checks each action before it runs and asks you first when needed. Add rules to customize what it can do automatically.")
                .font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
          }
          .tint(Ink.blue)
          NavigationLink {
            AutoReviewRules(settings: $settings)
          } label: {
            VStack(alignment: .leading, spacing: 3) {
              Text("Auto-review Rules")
              Text(rulesSummary).font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
          }
        }
        Section("Usage & Billing") {
          if let quota {
            UsageRow(quota: quota)
            Button {
              Task { if let url = await store.billingPortal() { openURL(url) } }
            } label: {
              Label("Manage Billing", systemImage: "arrow.up.right.square")
            }
            if let upgrade = quota["upgradeUrl"]?.text.flatMap(URL.init(string:)) {
              Button { openURL(upgrade) } label: { Label("Upgrade", systemImage: "sparkles") }
            }
          } else {
            HStack { ProgressView(); Text("Loading usage…").foregroundStyle(Ink.secondary) }
          }
        }
        Section {
          Button { showsApps = true } label: {
            HStack {
              Text("Connect apps").foregroundStyle(Ink.primary)
              Spacer()
              AppLogoTrio()
            }
          }
          .padding(.vertical, 6)
        }
        Section {
          Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
        }
        Section {
          VStack(spacing: 8) {
            ButterflyView(palette: .named("blue"), motion: .idle).frame(width: 56, height: 56)
            Text("Simeon").font(.system(size: 20, weight: .semibold))
            Text(SessionController.clientVersion).font(.system(size: 12)).foregroundStyle(Ink.tertiary)
          }
          .frame(maxWidth: .infinity)
          .listRowBackground(Color.clear)
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton() } }
      .sheet(isPresented: $showsApps) { ConnectAppsSheet() }
      .task {
        async let host = store.hostSettings()
        async let usage = store.quota()
        settings = await host
        quota = await usage
      }
    }
  }

  private var timeZoneLabel: String {
    let override = settings?["userTimeZoneOverride"]?.text
    let zone = override ?? settings?["userTimeZone"]?.text ?? TimeZone.current.identifier
    let short = TimeZone(identifier: zone)?.abbreviation() ?? zone
    return override == nil ? "Auto-detect (\(short))" : zone.replacingOccurrences(of: "_", with: " ")
  }

  private var instructions: JSON { settings?["autoReviewInstructions"] ?? ["isEnabled": true, "allowInstructions": [], "blockInstructions": []] }

  private var rulesSummary: String {
    let count = (instructions["allowInstructions"]?.array?.count ?? 0) + (instructions["blockInstructions"]?.array?.count ?? 0)
    return count == 0 ? "Write one short rule for each action." : "\(count) \(count == 1 ? "rule" : "rules")"
  }

  private var autoReview: Binding<Bool> {
    Binding(
      get: { instructions["isEnabled"]?.bool ?? true },
      set: { on in
        let next = instructions.setting("isEnabled", .bool(on))
        settings = (settings ?? [:]).setting("autoReviewInstructions", next)
        Task { await store.setHostSettings(["autoReviewInstructions": next]) }
      }
    )
  }
}

/** The three apps on the Connect apps row (Gmail, Calendar, Drive), as the Mac's button shows them. */
struct AppLogoTrio: View {
  var body: some View {
    HStack(spacing: -8) {
      ForEach(Array(["Gmail", "Google Calendar", "Google Drive"].enumerated()), id: \.offset) { index, name in
        ConnectorTile(name: name, size: 28)
          .rotationEffect(.degrees([-6, 0, 6][index]))
          .shadow(color: .black.opacity(0.08), radius: 1.5, y: 1)
      }
    }
    .accessibilityHidden(true)
  }
}

/** This period's usage: the plan, a bar, and when it resets. */
struct UsageRow: View {
  let quota: JSON

  var body: some View {
    let limit = quota["creditsLimit"]?.double ?? 0
    let used = quota["creditsUsed"]?.double ?? 0
    let share = limit > 0 ? min(1, used / limit) : 0
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(quota["planName"]?.text ?? "Plan").font(.system(size: 17, weight: .medium))
        Spacer()
        if let status = quota["subscriptionStatus"]?.text, status != "active" {
          Text(status.capitalized).font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
      }
      ProgressView(value: share).tint(share > 0.9 ? Ink.danger : Ink.blue)
      HStack {
        Text("\(Int((share * 100).rounded()))% used").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        Spacer()
        if let end = quota["periodEnd"]?.text.flatMap(UsageRow.date) {
          Text("Resets \(end.formatted(.dateTime.month(.abbreviated).day()))").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
      }
    }
    .padding(.vertical, 4)
  }

  static func date(_ text: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
  }
}

/** "Auto-detect (zone)", then every zone with its current time (the Mac's picker); the choice is the box's `userTimeZoneOverride`. */
struct TimeZonePicker: View {
  let current: String
  let detected: String
  let choose: (String) -> Void
  @State private var query = ""
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    List {
      Button { choose(""); dismiss() } label: {
        HStack {
          Text("Auto-detect (\(TimeZone(identifier: detected)?.abbreviation() ?? detected))").foregroundStyle(Ink.primary)
          Spacer()
          if current.isEmpty { Image(systemName: "checkmark").foregroundStyle(Ink.blue) }
        }
      }
      ForEach(zones, id: \.self) { zone in
        Button { choose(zone); dismiss() } label: {
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(zone.replacingOccurrences(of: "_", with: " ")).foregroundStyle(Ink.primary)
              Text(Self.now(in: zone)).font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
            Spacer()
            if current == zone { Image(systemName: "checkmark").foregroundStyle(Ink.blue) }
          }
        }
      }
    }
    .searchable(text: $query, prompt: "Search")
    .navigationTitle("Timezone")
    .navigationBarTitleDisplayMode(.inline)
  }

  private var zones: [String] {
    TimeZone.knownTimeZoneIdentifiers.filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query.replacingOccurrences(of: " ", with: "_")) }
  }

  static func now(in zone: String) -> String {
    guard let tz = TimeZone(identifier: zone) else { return "" }
    var style = Date.FormatStyle.dateTime.hour().minute()
    style.timeZone = tz
    return Date().formatted(style)
  }
}

/**
 * Auto-review's rules (the Mac's table and its add box): "When Simeon wants
 * to:" one short line, "It should:" Allow automatically or Ask first, Add
 * Rule. Stored in the box as `autoReviewInstructions`.
 */
struct AutoReviewRules: View {
  @Binding var settings: JSON?
  @Environment(AppStore.self) private var store
  @State private var wants = ""
  @State private var should = "allow"

  private var instructions: JSON { settings?["autoReviewInstructions"] ?? ["isEnabled": true, "allowInstructions": [], "blockInstructions": []] }
  private var allow: [String] { instructions["allowInstructions"]?.array?.compactMap(\.text) ?? [] }
  private var ask: [String] { instructions["blockInstructions"]?.array?.compactMap(\.text) ?? [] }

  var body: some View {
    Form {
      Section {
        Text("Write one short, natural-language rule for each action. \"Ask first\" takes priority if rules conflict.")
          .font(.system(size: 14)).foregroundStyle(Ink.secondary)
      }
      if !allow.isEmpty {
        Section("Allow automatically") {
          ForEach(allow, id: \.self) { Text($0) }
            .onDelete { offsets in save(allow: allow.enumerated().filter { !offsets.contains($0.offset) }.map(\.element), ask: ask) }
        }
      }
      if !ask.isEmpty {
        Section("Ask first") {
          ForEach(ask, id: \.self) { Text($0) }
            .onDelete { offsets in save(allow: allow, ask: ask.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)) }
        }
      }
      Section {
        VStack(alignment: .leading, spacing: 8) {
          Text("When Simeon wants to:").font(.system(size: 15))
          TextField("e.g. reply to emails for me", text: $wants, axis: .vertical).lineLimit(1...4)
        }
        Picker("It should:", selection: $should) {
          Text("Allow automatically").tag("allow")
          Text("Ask first").tag("ask")
        }
        Button("Add Rule") {
          let rule = wants.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !rule.isEmpty else { return }
          wants = ""
          if should == "allow" { save(allow: allow + [rule], ask: ask) } else { save(allow: allow, ask: ask + [rule]) }
        }
        .disabled(wants.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      } footer: {
        Text("These rules apply only to you. Built-in safety checks always apply.")
      }
    }
    .navigationTitle("Auto-review Rules")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func save(allow: [String], ask: [String]) {
    let next = instructions.setting("allowInstructions", JSON(allow)).setting("blockInstructions", JSON(ask))
    settings = (settings ?? [:]).setting("autoReviewInstructions", next)
    Task { await store.setHostSettings(["autoReviewInstructions": next]) }
  }
}

/**
 * Connect apps (the Mac's Plugins): the catalog by category with Add, the
 * person's own apps under Yours, search across both. Add installs the app in
 * the box and opens its sign-in in the system's sheet.
 */
struct ConnectAppsSheet: View {
  @Environment(AppStore.self) private var store
  @State private var tab = "marketplace"
  @State private var query = ""

  var body: some View {
    NavigationStack {
      List {
        Picker("Show", selection: $tab) {
          Text("Marketplace").tag("marketplace")
          Text("Yours").tag("yours")
        }
        .pickerStyle(.segmented)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        if tab == "marketplace" {
          if store.catalog.isEmpty {
            HStack { ProgressView(); Text("Loading apps…").foregroundStyle(Ink.secondary) }
          }
          ForEach(categories, id: \.self) { category in
            Section(category.isEmpty ? "Apps" : category) {
              ForEach(catalog(in: category)) { app in AppRow(app: app) }
            }
          }
        } else {
          let mine = store.appsOnce.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
          if mine.isEmpty {
            Text("No apps yet. Add one from the Marketplace.").foregroundStyle(Ink.secondary)
          }
          ForEach(mine) { app in
            NavigationLink { ConnectedAppDetail(app: app) } label: {
              HStack(spacing: 12) {
                ConnectorTile(name: app.name, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                  Text(app.name).font(.system(size: 16, weight: .medium))
                  Text(app.status == "connected" ? "\(app.toolCount) tools" : "Needs sign-in")
                    .font(.system(size: 13)).foregroundStyle(app.status == "connected" ? Ink.secondary : Ink.danger)
                }
              }
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .searchable(text: $query, prompt: "Search apps")
      .navigationTitle("Connect apps")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton() } }
      .task { await store.loadApps() }
      .refreshable { await store.loadApps() }
    }
  }

  private func matches(_ app: CatalogApp) -> Bool {
    query.isEmpty || app.title.localizedCaseInsensitiveContains(query) || app.summary.localizedCaseInsensitiveContains(query)
  }

  private var categories: [String] {
    var seen: [String] = []
    for app in store.catalog where matches(app) && !seen.contains(app.category) { seen.append(app.category) }
    return seen
  }

  private func catalog(in category: String) -> [CatalogApp] { store.catalog.filter { $0.category == category && matches($0) } }
}

/** One app in the catalog: its tile, name and what it does, and Add (or Added). */
struct AppRow: View {
  let app: CatalogApp
  @Environment(AppStore.self) private var store
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    HStack(spacing: 12) {
      ConnectorTile(name: app.title, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(app.title).font(.system(size: 16, weight: .medium)).foregroundStyle(Ink.primary)
        if !app.summary.isEmpty { Text(app.summary).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2) }
      }
      Spacer(minLength: 8)
      if app.comingSoon {
        Text("Soon").font(.system(size: 13)).foregroundStyle(Ink.tertiary)
      } else if store.isConnected(app.title) {
        Label("Added", systemImage: "checkmark").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary)
      } else if connector.connecting == app.title {
        ProgressView().controlSize(.small)
      } else {
        Button("Add") { Task { await connector.connect(app.title, store: store) } }
          .buttonStyle(GreyButtonStyle(capsule: true))
          .disabled(connector.connecting != nil)
      }
    }
    .padding(.vertical, 4)
  }
}

/**
 * One connected app (the Mac's connector page): its accounts, each with
 * its state, sign-in, rename and remove; its tools, each with a switch
 * that turns it off for every agent; and removing the app.
 */
struct ConnectedAppDetail: View {
  let app: ConnectedApp
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var tools: [AppTool] = []
  @State private var loadingTools = true
  @State private var renaming: ConnectedApp?
  @State private var newName = ""
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    let accounts = store.accounts(of: app.serverId)
    let connected = accounts.contains { $0.status == "connected" }
    Form {
      Section {
        HStack(spacing: 14) {
          ConnectorTile(name: app.name, size: 56)
          VStack(alignment: .leading, spacing: 3) {
            Text(app.name).font(.system(size: 20, weight: .semibold))
            Text(connected ? "Connected · \(tools.isEmpty ? app.toolCount : tools.filter { !$0.isDisabled }.count) tools" : "Not signed in")
              .font(.system(size: 14)).foregroundStyle(connected ? Ink.secondary : Ink.danger)
          }
        }
        .padding(.vertical, 6)
      }
      Section("Accounts") {
        ForEach(accounts.isEmpty ? [app] : accounts) { account in
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(account.accountName).font(.system(size: 16))
              Text(account.status == "connected" ? "Connected" : "Needs sign-in")
                .font(.system(size: 13)).foregroundStyle(account.status == "connected" ? Ink.secondary : Ink.danger)
            }
            Spacer()
            if account.status != "connected" {
              if connector.connecting == account.name {
                ProgressView().controlSize(.small)
              } else {
                Button("Sign in") { Task { await connector.signIn(account, store: store) } }
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
      Section("Tools") {
        if loadingTools && tools.isEmpty {
          HStack { ProgressView(); Text("Loading tools…").foregroundStyle(Ink.secondary) }
        } else if tools.isEmpty {
          Text(connected ? "No tools listed." : "Sign in to see its tools.").foregroundStyle(Ink.secondary)
        }
        ForEach(tools) { tool in
          Toggle(isOn: Binding(get: { !tool.isDisabled }, set: { _ in Task { if let next = await store.toggleTool(app.serverId, tool.name) { tools = next } } })) {
            VStack(alignment: .leading, spacing: 2) {
              Text(tool.title ?? tool.name).font(.system(size: 16))
              if let summary = tool.summary, !summary.isEmpty {
                Text(summary).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2)
              }
            }
          }
          .tint(Ink.blue)
        }
      }
      Section {
        Button("Remove \(app.name)", role: .destructive) {
          Task { await store.removeApp(app); dismiss() }
        }
      }
    }
    .navigationTitle(app.name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: connected) {
      loadingTools = true
      tools = await store.tools(of: app.serverId)
      loadingTools = false
    }
    .alert("Rename account", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Account name", text: $newName)
      Button("Rename") { if let account = renaming { Task { await store.renameAccount(account, to: newName) } }; renaming = nil }
      Button("Cancel", role: .cancel) { renaming = nil }
    }
  }
}
