import SwiftUI
import UIKit
import SimeonCore

/**
 * Settings, in the order the founder's reference has it (9 October 2026):
 * the account and, under it, Usage with its share; Connect apps; the
 * agents' settings (Auto-review and its rules, the time zone, set
 * automatically or chosen); Appearance; Sign Out and the mark. Usage opens
 * its own page: the period's bar, when it resets, and Change Limit.
 */
struct SettingsSheet: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @AppStorage("simeon.theme") private var theme = "system"
  @State private var settings: JSON?
  @State private var quota: JSON?
  @State private var showsApps = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          NavigationLink { AccountPage() } label: {
            HStack(spacing: 14) {
              Initials(letters: store.account?.initials ?? "", size: 44)
                .background(Ink.bubbleTheirs, in: Circle())
              VStack(alignment: .leading, spacing: 2) {
                Text(store.account?.name ?? "").font(.system(size: 17)).foregroundStyle(Ink.primary)
                Text(store.account?.email ?? "").font(.system(size: 13)).foregroundStyle(Ink.secondary)
                  .lineLimit(1).minimumScaleFactor(0.75)
              }
            }
            .padding(.vertical, 4)
          }
          NavigationLink { UsagePage(quota: quota) } label: {
            LabeledContent("Usage", value: quota.map { "\(UsageNumbers(quota: $0).percent)%" } ?? "")
          }
        }
        Section {
          Button { showsApps = true } label: {
            HStack {
              VStack(alignment: .leading, spacing: 3) {
                Text("Connect apps").foregroundStyle(Ink.primary)
                Text("Tools and skills for your agents").font(.system(size: 13)).foregroundStyle(Ink.secondary)
              }
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
            }
            .contentShape(.rect)
          }
          .padding(.vertical, 2)
        }
        Section("Agents") {
          Toggle(isOn: autoReview) {
            VStack(alignment: .leading, spacing: 3) {
              Text("Auto-review")
              Text("Simeon checks each action before it runs and asks you first when needed.")
                .font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
          }
          .tint(Ink.live)
          NavigationLink {
            AutoReviewRules(settings: $settings)
          } label: {
            LabeledContent("Auto-review Rules", value: rulesCount == 0 ? "None" : "\(rulesCount)")
          }
          Toggle(isOn: automaticZone) {
            VStack(alignment: .leading, spacing: 3) {
              Text("Set Time Zone Automatically")
              Text("Your agents' computer follows this phone's time zone.")
                .font(.system(size: 13)).foregroundStyle(Ink.secondary)
            }
          }
          .tint(Ink.live)
          if automaticZone.wrappedValue {
            LabeledContent("Time Zone", value: zoneName)
          } else {
            NavigationLink {
              TimeZonePicker(current: settings?["userTimeZoneOverride"]?.string ?? "", detected: detectedZone) { zone in
                Task { if let next = await store.setHostSettings(["userTimeZoneOverride": .string(zone)]) { settings = next } }
              }
            } label: {
              LabeledContent("Time Zone", value: zoneName)
            }
          }
        }
        Section {
          Picker("Appearance", selection: $theme) {
            Text("System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
          .pickerStyle(.navigationLink)
        }
        Section {
          Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
        }
        Section {
          VStack(spacing: 8) {
            ButterflyView(palette: .named("blue")).frame(width: 56, height: 56)
            Text("Simeon").font(.system(size: 17, weight: .semibold))
            Text(SessionController.clientVersion).font(.system(size: 12)).foregroundStyle(Ink.tertiary)
          }
          .frame(maxWidth: .infinity)
          .listRowBackground(Color.clear)
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton() } }
      .sheet(isPresented: $showsApps) { ConnectAppsSheet().problemAlert() }
      .task {
        async let host = store.hostSettings()
        async let usage = store.quota()
        settings = await host
        quota = await usage
      }
    }
  }

  private var detectedZone: String { settings?["userTimeZone"]?.text ?? TimeZone.current.identifier }

  /** The zone the agents' computer keeps: the one chosen, else this phone's. */
  private var zoneName: String {
    (settings?["userTimeZoneOverride"]?.text ?? detectedZone).replacingOccurrences(of: "_", with: " ")
  }

  /** Automatic while no zone is chosen (`userTimeZoneOverride` empty); turned off, it keeps this phone's zone until another is chosen. */
  private var automaticZone: Binding<Bool> {
    Binding(
      get: { settings?["userTimeZoneOverride"]?.text == nil },
      set: { on in
        let zone = on ? "" : detectedZone
        settings = (settings ?? [:]).setting("userTimeZoneOverride", .string(zone))
        Task { if let next = await store.setHostSettings(["userTimeZoneOverride": .string(zone)]) { settings = next } }
      }
    )
  }

  private var instructions: JSON { settings?["autoReviewInstructions"] ?? ["isEnabled": true, "allowInstructions": [], "blockInstructions": []] }

  private var rulesCount: Int {
    (instructions["allowInstructions"]?.array?.count ?? 0) + (instructions["blockInstructions"]?.array?.count ?? 0)
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

/** The account: the person's name and email, the email copied with a tap. */
struct AccountPage: View {
  @Environment(AppStore.self) private var store
  @State private var copied = false

  var body: some View {
    Form {
      Section {
        VStack(spacing: 10) {
          Initials(letters: store.account?.initials ?? "", size: 72)
            .background(Ink.bubbleTheirs, in: Circle())
          Text(store.account?.name ?? "").font(.system(size: 20, weight: .semibold)).foregroundStyle(Ink.primary)
        }
        .frame(maxWidth: .infinity)
        .listRowBackground(Color.clear)
      }
      Section {
        LabeledContent("Name", value: store.account?.name ?? "")
        Button {
          UIPasteboard.general.string = store.account?.email
          copied = true
        } label: {
          HStack {
            Text("Email").foregroundStyle(Ink.primary)
            Spacer()
            Text(store.account?.email ?? "").foregroundStyle(Ink.secondary).lineLimit(1).minimumScaleFactor(0.75)
            Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 13)).foregroundStyle(Ink.secondary)
          }
        }
        .accessibilityHint("Copies the email")
      }
    }
    .navigationTitle("Account")
    .navigationBarTitleDisplayMode(.inline)
  }
}

/** The usage figures from the server's `user/quota`: the share used, its period's name, when it resets. */
struct UsageNumbers {
  let share: Double
  let percent: Int
  let title: String
  let resets: String?

  init(quota: JSON, now: Date = Date()) {
    let limit = quota["creditsLimit"]?.double ?? 0
    let used = quota["creditsUsed"]?.double ?? 0
    share = limit > 0 ? min(1, max(0, used / limit)) : 0
    percent = Int((share * 100).rounded())
    let start = quota["periodStart"]?.text.flatMap(UsageNumbers.date)
    let end = quota["periodEnd"]?.text.flatMap(UsageNumbers.date)
    let days = start.flatMap { s in end.map { $0.timeIntervalSince(s) / 86_400 } }
    title = days.map { $0 <= 8 ? "Weekly usage" : $0 <= 32 ? "Monthly usage" : "Usage" } ?? "Usage"
    if let end {
      let left = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: now), to: Calendar.current.startOfDay(for: end)).day ?? 0
      resets = left <= 0 ? "Resets today" : left == 1 ? "Resets tomorrow" : "Resets in \(left) days"
    } else {
      resets = nil
    }
  }

  static func date(_ text: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
  }
}

/** Usage, as the founder's reference has it: the period's name and when it resets, the bar, the share; then Change Limit. */
struct UsagePage: View {
  let quota: JSON?
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var opening = false

  var body: some View {
    Form {
      if let quota {
        let usage = UsageNumbers(quota: quota)
        Section {
          VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
              Text(usage.title).font(.system(size: 17)).foregroundStyle(Ink.primary)
              Spacer()
              if let resets = usage.resets { Text(resets).font(.system(size: 13)).foregroundStyle(Ink.tertiary) }
            }
            GeometryReader { geometry in
              ZStack(alignment: .leading) {
                Capsule().fill(Ink.pill)
                Capsule().fill(usage.share > 0.9 ? Ink.danger : Ink.blue).frame(width: geometry.size.width * usage.share)
              }
            }
            .frame(height: 6)
            Text("\(usage.percent)%").font(.system(size: 13)).foregroundStyle(Ink.secondary)
          }
          .padding(.vertical, 6)
          .accessibilityElement(children: .combine)
          Button { changeLimit(quota) } label: {
            HStack {
              Text("Change Limit").foregroundStyle(Ink.primary)
              Spacer()
              if opening { ProgressView() } else {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
              }
            }
            .contentShape(.rect)
          }
          .disabled(opening)
        }
        Section {
          LabeledContent("Plan", value: quota["planName"]?.text ?? "")
          if let status = quota["subscriptionStatus"]?.text, status != "active" {
            LabeledContent("Status", value: status.capitalized)
          }
        }
      } else {
        HStack { ProgressView(); Text("Loading usage…").foregroundStyle(Ink.secondary) }
      }
    }
    .navigationTitle("Usage")
    .navigationBarTitleDisplayMode(.inline)
  }

  /** The plans page when there is one to move to, else the billing portal. */
  private func changeLimit(_ quota: JSON) {
    if let upgrade = quota["upgradeUrl"]?.text.flatMap(URL.init(string:)) { openURL(upgrade); return }
    opening = true
    Task {
      if let url = await store.billingPortal() { openURL(url) }
      opening = false
    }
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
          .font(.system(size: 13)).foregroundStyle(Ink.secondary)
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
          Text("When Simeon wants to:").font(.system(size: 13)).foregroundStyle(Ink.secondary)
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
                  Text(app.name).font(.system(size: 17))
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
  /** What the person reads before the sign-in page opens (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    HStack(spacing: 12) {
      ConnectorTile(name: app.title, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(app.title).font(.system(size: 17)).foregroundStyle(Ink.primary)
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
        Button("Add") { asking = ConnectConsent(app: app, name: app.title) }
          .buttonStyle(GreyButtonStyle(capsule: true))
          .disabled(connector.connecting != nil)
      }
    }
    .padding(.vertical, 4)
    // The sign-in page opens once the sheet has gone.
    .sheet(item: $asking, onDismiss: {
      guard confirmed else { return }
      confirmed = false
      Task { await connector.connect(app.title, store: store) }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
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
  @State private var switching: Set<String> = []
  @State private var removing = false
  /** An account's sign-in, asked first as every connect is (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var signingIn: ConnectedApp?
  @State private var confirmed = false
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
              .font(.system(size: 13)).foregroundStyle(connected ? Ink.secondary : Ink.danger)
          }
        }
        .padding(.vertical, 6)
      }
      Section("Accounts") {
        ForEach(accounts.isEmpty ? [app] : accounts) { account in
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(account.accountName).font(.system(size: 17))
              Text(account.status == "connected" ? "Connected" : "Needs sign-in")
                .font(.system(size: 13)).foregroundStyle(account.status == "connected" ? Ink.secondary : Ink.danger)
            }
            Spacer()
            if account.status != "connected" {
              if connector.connecting == account.name {
                ProgressView().controlSize(.small)
              } else {
                Button("Sign in") {
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
      Section("Tools") {
        if loadingTools && tools.isEmpty {
          HStack { ProgressView(); Text("Loading tools…").foregroundStyle(Ink.secondary) }
        } else if tools.isEmpty {
          Text(connected ? "No tools listed." : "Sign in to see its tools.").foregroundStyle(Ink.secondary)
        }
        ForEach(tools) { tool in
          // The switch moves at once and holds until the box answers, so a second tap cannot undo the first.
          Toggle(isOn: Binding(get: { !tool.isDisabled }, set: { on in
            guard !switching.contains(tool.name), let index = tools.firstIndex(where: { $0.name == tool.name }) else { return }
            tools[index].isDisabled = !on
            switching.insert(tool.name)
            Task {
              if let next = await store.toggleTool(app.serverId, tool.name) { tools = next }
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
      Section {
        Button(role: .destructive) {
          removing = true
          Task { await store.removeApp(app); dismiss() }
        } label: {
          HStack {
            Text("Remove \(app.name)")
            if removing { Spacer(); ProgressView() }
          }
        }
        .disabled(removing)
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
    // The sign-in page opens once the sheet has gone.
    .sheet(item: $asking, onDismiss: {
      let account = signingIn
      signingIn = nil
      guard confirmed, let account else { confirmed = false; return }
      confirmed = false
      Task { await connector.signIn(account, store: store) }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
  }
}
