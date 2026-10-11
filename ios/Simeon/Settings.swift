import SwiftUI
#if os(iOS)
import UIKit
#endif
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
        .listRowBackground(Ink.groupedRow)
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
        .listRowBackground(Ink.groupedRow)
        AgentSettingsSection(settings: $settings)
        Section {
          Picker("Appearance", selection: $theme) {
            Text("System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
          #if os(iOS)
          .pickerStyle(.navigationLink)
          #endif
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          // The SimeonLabs mark and wordmark (the sign-in's) and the version as an update names it (the founder, 11 October 2026: "0.1.0").
          VStack(spacing: 10) {
            Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit().frame(width: 36, height: 36)
            Image("SignIn/Wordmark").resizable().renderingMode(.template).scaledToFit().frame(height: 17)
            Text(SessionController.displayVersion).font(.system(size: 13)).foregroundStyle(Ink.tertiary).monospacedDigit()
          }
          .foregroundStyle(Ink.primary)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 6)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel("SimeonLabs, version \(SessionController.displayVersion)")
          .listRowBackground(Color.clear)
        }
      }
      .groupedGround()
      .navigationTitle("Settings")
      .inlineBarTitle()
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
      .sheet(isPresented: $showsApps) { ConnectAppsSheet().problemAlert() }
      .task {
        async let host = store.hostSettings()
        async let usage = store.quota()
        settings = await host
        quota = await usage
      }
    }
  }
}

/**
 * The agents' settings, the same on the iPhone and the Mac: Auto-review and
 * its rules, and the time zone the agents' computer keeps (set
 * automatically, or chosen). `settings` is the box's host settings, read
 * once by the page that holds this section.
 */
struct AgentSettingsSection: View {
  @Binding var settings: JSON?
  @Environment(AppStore.self) private var store

  /** This device, as the time zone's line names it. */
  private var device: String { AppPlatform.isMac ? "Mac" : "phone" }

  var body: some View {
    Section("Agents") {
      Toggle(isOn: autoReview) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Auto-review")
          Text("Simeon checks each action before it runs and asks you first when needed.")
            .font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
      }
      .tint(Ink.blue)
      NavigationLink {
        AutoReviewRules(settings: $settings)
      } label: {
        LabeledContent("Auto-review Rules", value: rulesCount == 0 ? "None" : "\(rulesCount)")
      }
      Toggle(isOn: automaticZone) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Set Time Zone Automatically")
          Text("Your agents' computer follows this \(device)'s time zone.")
            .font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
      }
      .tint(Ink.blue)
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
    .listRowBackground(Ink.groupedRow)
  }

  private var detectedZone: String { settings?["userTimeZone"]?.text ?? TimeZone.current.identifier }

  /** The zone the agents' computer keeps: the one chosen, else this device's. */
  private var zoneName: String {
    (settings?["userTimeZoneOverride"]?.text ?? detectedZone).replacingOccurrences(of: "_", with: " ")
  }

  /** Automatic while no zone is chosen (`userTimeZoneOverride` empty); turned off, it keeps this device's zone until another is chosen. */
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
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("Account")
    .inlineBarTitle()
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
        .listRowBackground(Ink.groupedRow)
        Section {
          LabeledContent("Plan", value: quota["planName"]?.text ?? "")
          if let status = quota["subscriptionStatus"]?.text, status != "active" {
            LabeledContent("Status", value: status.capitalized)
          }
        }
        .listRowBackground(Ink.groupedRow)
      } else {
        HStack { ProgressView(); Text("Loading usage…").foregroundStyle(Ink.secondary) }
        .listRowBackground(Ink.groupedRow)
      }
    }
    .groupedGround()
    .navigationTitle("Usage")
    .inlineBarTitle()
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
      .listRowBackground(Ink.groupedRow)
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
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .searchable(text: $query, prompt: "Search")
    .navigationTitle("Timezone")
    .inlineBarTitle()
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
      .listRowBackground(Ink.groupedRow)
      if !allow.isEmpty {
        Section("Allow automatically") {
          ForEach(allow, id: \.self) { Text($0) }
            .onDelete { offsets in save(allow: allow.enumerated().filter { !offsets.contains($0.offset) }.map(\.element), ask: ask) }
        }
        .listRowBackground(Ink.groupedRow)
      }
      if !ask.isEmpty {
        Section("Ask first") {
          ForEach(ask, id: \.self) { Text($0) }
            .onDelete { offsets in save(allow: allow, ask: ask.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)) }
        }
        .listRowBackground(Ink.groupedRow)
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
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("Auto-review Rules")
    .inlineBarTitle()
  }

  private func save(allow: [String], ask: [String]) {
    let next = instructions.setting("allowInstructions", JSON(allow)).setting("blockInstructions", JSON(ask))
    settings = (settings ?? [:]).setting("autoReviewInstructions", next)
    Task { await store.setHostSettings(["autoReviewInstructions": next]) }
  }
}

/**
 * Connect apps, in the founder's reference (11 October 2026: "no more
 * marketplace - yours"): one page, Marketplace, on the app's ground. At its
 * top Back, the title, and how many apps are installed with the first
 * three's logos, which opens Your plugins; under them the search and a
 * filter by category. Then the catalog by category, Featured first and the
 * rest A to Z, four of each with View all (the Mac's Plugins:
 * `Plugins.marketplaceLimit`), each app with its logo, name, what it does
 * and Add. Add asks first (ConnectConsentSheet), then installs the app in
 * the box and opens its sign-in in the system's sheet.
 */
struct ConnectAppsSheet: View {
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  /** The category the filter keeps, or all of them. */
  @State private var category: String?

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        PluginsHead(title: "Marketplace", back: { dismiss() }) {
          NavigationLink { YourPluginsPage() } label: { InstalledPill(apps: store.appsOnce) }
            .buttonStyle(.plain)
        }
        HStack(spacing: 10) {
          PluginsSearchField(text: $query)
          filterMenu
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0) {
            if store.catalog.isEmpty {
              HStack(spacing: 10) { ProgressView(); Text("Loading apps…").foregroundStyle(Ink.secondary) }
                .padding(.top, 28)
            } else if sections.isEmpty {
              Text("No apps match \u{201C}\(query)\u{201D}.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
                .padding(.top, 28)
            }
            ForEach(sections) { section in
              let shown = Plugins.collapse(section.apps, expanded: !query.isEmpty || category != nil, limit: Plugins.marketplaceLimit)
              PluginsSectionHead(title: section.title) {
                if shown.hidden > 0 {
                  NavigationLink { CategoryPage(title: section.title, apps: section.apps) } label: { Text("View all") }
                    .buttonStyle(.plain)
                }
              }
              ForEach(shown.visible) { app in AppRow(app: app) }
            }
          }
          .padding(.horizontal, 18)
          .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await store.loadApps() }
      }
      .background(Ink.ground.ignoresSafeArea())
      .toolbar(.hidden, for: .navigationBar)
      .task { await store.loadApps() }
    }
    .presentationBackground(Ink.ground)
  }

  /** The filter (the reference's button beside the search): every category, or one. */
  private var filterMenu: some View {
    Menu {
      Picker("Category", selection: $category) {
        Text("All apps").tag(String?.none)
        ForEach(AppSections.make(store.catalog, query: "").map(\.title), id: \.self) { title in
          Text(title).tag(String?.some(title))
        }
      }
    } label: {
      Image(systemName: "line.3.horizontal.decrease")
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(category == nil ? Ink.primary : Ink.blue)
        .frame(width: 44, height: 44)
        .background(Ink.groupedRow, in: Circle())
    }
    .accessibilityLabel("Filter")
  }

  private var sections: [AppSections.Section] {
    let all = AppSections.make(store.catalog, query: query)
    guard let category else { return all }
    return all.filter { $0.title == category }
  }
}

/** The catalog's sections: by category, Featured first and the rest A to Z (the Mac's Marketplace), with what the search matches. */
enum AppSections {
  struct Section: Identifiable {
    let title: String
    let apps: [CatalogApp]
    var id: String { title }
  }

  static func make(_ catalog: [CatalogApp], query: String) -> [Section] {
    let words = query.trimmingCharacters(in: .whitespaces)
    var order: [String] = []
    var apps: [String: [CatalogApp]] = [:]
    for app in catalog where words.isEmpty || app.title.localizedCaseInsensitiveContains(words) || app.summary.localizedCaseInsensitiveContains(words) {
      let title = app.category.isEmpty ? "Apps" : app.category
      if apps[title] == nil { order.append(title) }
      apps[title, default: []].append(app)
    }
    let sorted = order.sorted { a, b in
      if a == Plugins.featured { return b != Plugins.featured }
      if b == Plugins.featured { return false }
      return a.localizedStandardCompare(b) == .orderedAscending
    }
    return sorted.map { Section(title: $0, apps: apps[$0] ?? []) }
  }
}

/** A page's head (the reference's): the round Back on the left, the title beside it, and what the page puts at the right. */
struct PluginsHead<Trailing: View>: View {
  let title: String
  let back: () -> Void
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 14) {
      Button(action: back) {
        Image(systemName: "chevron.left")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(Ink.primary)
          .frame(width: 44, height: 44)
          .background(Ink.groupedRow, in: Circle())
          .contentShape(.circle)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Back")
      Text(title).font(.system(size: 20, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 8)
      trailing()
    }
    .padding(.horizontal, 18)
    .padding(.top, 18)
  }
}

/** "4 installed" with the first three apps' logos overlapping, in the control's fill: it opens Your plugins. */
struct InstalledPill: View {
  let apps: [ConnectedApp]

  var body: some View {
    HStack(spacing: 10) {
      if !apps.isEmpty {
        HStack(spacing: -9) {
          ForEach(Array(apps.prefix(3).enumerated()), id: \.offset) { index, app in
            ConnectorTile(name: app.name, size: 26)
              .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
              .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Ink.groupedRow, lineWidth: 2))
              .zIndex(Double(3 - index))
          }
        }
      }
      Text("\(apps.count) installed").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
    }
    .padding(.leading, apps.isEmpty ? 16 : 10)
    .padding(.trailing, 16)
    .frame(height: 44)
    .background(Ink.groupedRow, in: Capsule())
    .contentShape(.capsule)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(apps.count) installed")
    .accessibilityHint("Shows your plugins")
  }
}

/** The search, in the control's fill, round: "Search plugins". */
struct PluginsSearchField: View {
  @Binding var text: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.secondary)
      TextField("Search plugins", text: $text)
        .font(.system(size: 17))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
      if !text.isEmpty {
        Button { text = "" } label: {
          Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(Ink.tertiary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, 16)
    .frame(height: 44)
    .background(Ink.groupedRow, in: Capsule())
  }
}

/** A section's head: its name in the faint grey, and View all at the right when some are hidden. */
struct PluginsSectionHead<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack {
      Text(title).font(.system(size: 15)).foregroundStyle(Ink.tertiary).accessibilityAddTraits(.isHeader)
      Spacer()
      trailing().font(.system(size: 15)).foregroundStyle(Ink.secondary)
    }
    .padding(.top, 26)
    .padding(.bottom, 6)
  }
}

/** View all: every app of one category, as the Marketplace lists them. */
struct CategoryPage: View {
  let title: String
  let apps: [CatalogApp]
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      PluginsHead(title: title, back: { dismiss() }) { EmptyView() }
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(apps) { app in AppRow(app: app) }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 28)
      }
    }
    .background(Ink.ground.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
  }
}

/**
 * Your plugins (the reference's): the installed apps, each with its logo,
 * its name ("Error" beside it in red when the box says so) and its tools;
 * at the right Added once it is signed in, else Authenticate, which asks
 * first as every connect does, then opens its sign-in. A row opens the
 * app's page (its accounts and tools).
 */
struct YourPluginsPage: View {
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""

  var body: some View {
    let apps = store.appsOnce.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
    VStack(spacing: 0) {
      PluginsHead(title: "Your plugins", back: { dismiss() }) { EmptyView() }
      PluginsSearchField(text: $query)
        .padding(.horizontal, 18)
        .padding(.top, 14)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          PluginsSectionHead(title: "Installed") { EmptyView() }
          if apps.isEmpty {
            Text(store.appsOnce.isEmpty ? "No apps yet. Add one from the Marketplace." : "No apps match \u{201C}\(query)\u{201D}.")
              .font(.system(size: 15)).foregroundStyle(Ink.secondary)
              .padding(.top, 8)
          }
          ForEach(apps) { app in InstalledRow(app: app) }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 28)
      }
      .scrollDismissesKeyboard(.immediately)
      .refreshable { await store.loadApps() }
    }
    .background(Ink.ground.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
  }
}

/** One installed app on Your plugins. */
struct InstalledRow: View {
  let app: ConnectedApp
  @Environment(AppStore.self) private var store
  /** What the person reads before the sign-in page opens (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    let connected = app.status == "connected"
    HStack(spacing: 14) {
      NavigationLink { ConnectedAppDetail(app: app) } label: {
        HStack(spacing: 14) {
          ConnectorTile(name: app.name, size: 36)
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
              Text(app.name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
              if app.status == "error" { Text("Error").font(.system(size: 15)).foregroundStyle(Ink.danger) }
            }
            Text(app.toolCount > 0 ? (app.toolCount == 1 ? "1 tool" : "\(app.toolCount) tools") : (connected ? "Connected" : "Not signed in"))
              .font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      if connected {
        PluginPill(title: "Added", fill: Ink.pillButton, ink: Ink.secondary)
      } else if connector.connecting == app.name {
        ProgressView().controlSize(.small).frame(width: 44)
      } else {
        Button { asking = ConnectConsent(app: store.catalogApp(named: app.name), name: app.name) } label: {
          PluginPill(title: "Authenticate", fill: Ink.authenticate, ink: .white)
        }
        .buttonStyle(.plain)
        .disabled(connector.connecting != nil)
      }
    }
    .padding(.vertical, 12)
    // The sign-in page opens once the sheet has gone.
    .sheet(item: $asking, onDismiss: {
      guard confirmed else { return }
      confirmed = false
      Task { await connector.signIn(app, store: store) }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
  }
}

/** A row's pill (the reference's Add, Added, Authenticate): 15 medium, 34 high, round. */
struct PluginPill: View {
  let title: String
  let fill: Color
  let ink: Color

  var body: some View {
    Text(title)
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(ink)
      .padding(.horizontal, 16)
      .frame(height: 34)
      .background(fill, in: Capsule())
      .fixedSize()
  }
}

/** One app in the catalog (the reference's): its logo, name and what it does in two lines, and Add, or Added once it is in. */
struct AppRow: View {
  let app: CatalogApp
  @Environment(AppStore.self) private var store
  /** What the person reads before the sign-in page opens (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    HStack(spacing: 14) {
      ConnectorTile(name: app.title, size: 36)
      VStack(alignment: .leading, spacing: 2) {
        Text(app.title).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
        if !app.summary.isEmpty { Text(app.summary).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(2) }
      }
      Spacer(minLength: 8)
      if app.comingSoon {
        Text("Soon").font(.system(size: 15)).foregroundStyle(Ink.tertiary)
      } else if store.isConnected(app.title) {
        PluginPill(title: "Added", fill: Ink.pillButton, ink: Ink.secondary)
      } else if connector.connecting == app.title {
        ProgressView().controlSize(.small).frame(width: 44)
      } else {
        Button { asking = ConnectConsent(app: app, name: app.title) } label: {
          PluginPill(title: "Add", fill: Ink.pillButton, ink: Ink.primary)
        }
        .buttonStyle(.plain)
        .disabled(connector.connecting != nil)
        .accessibilityLabel("Add \(app.title)")
      }
    }
    .padding(.vertical, 12)
    // The sign-in page opens once the sheet has gone.
    .sheet(item: $asking, onDismiss: {
      guard confirmed else { return }
      confirmed = false
      Task { await connector.connect(app.title, store: store) }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
        .macSheetSize(width: 440, height: 560)
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
      .listRowBackground(Ink.groupedRow)
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
      .listRowBackground(Ink.groupedRow)
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
      .listRowBackground(Ink.groupedRow)
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
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle(app.name)
    .inlineBarTitle()
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
        .macSheetSize(width: 440, height: 560)
    }
  }
}
