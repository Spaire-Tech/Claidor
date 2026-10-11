import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

/**
 * Settings, in the order the founder's reference has it (9 and 11 October
 * 2026): the account and, under it, Usage with its share; Connect apps, as
 * the Mac's sidebar has it; the agents' settings (Auto-review and its rules,
 * the time zone, set automatically or chosen); Notifications, Appearance and
 * Haptics (both switches on until turned off); Privacy Policy, Terms of
 * Service and About; Sign Out (asked first) and the mark. Usage opens the
 * Mac's Usage & Billing (UsagePage).
 */
struct SettingsSheet: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @AppStorage("simeon.theme") private var theme = "system"
  @State private var settings: JSON?
  @State private var showsApps = false
  @State private var askingSignOut = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          NavigationLink { AccountPage() } label: {
            HStack(spacing: 14) {
              AccountFace(size: 44)
              VStack(alignment: .leading, spacing: 2) {
                Text(store.account?.name ?? "").font(.system(size: 17)).foregroundStyle(Ink.primary)
                Text(store.account?.email ?? "").font(.system(size: 13)).foregroundStyle(Ink.secondary)
                  .lineLimit(1).minimumScaleFactor(0.75)
              }
            }
            .padding(.vertical, 4)
          }
          // Usage & Billing, as the Mac lists it: not for an enterprise team.
          if store.usage.summary == nil || store.usage.showsSection {
            NavigationLink { UsagePage() } label: {
              LabeledContent("Usage", value: store.usage.summary.flatMap { UsageMeters($0).weekly?.barPercent }.map { "\(Int($0.rounded()))%" } ?? "")
            }
          }
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          Button { showsApps = true } label: { ConnectAppsRow() }
        }
        .listRowBackground(Ink.groupedRow)
        AgentSettingsSection(settings: $settings)
        Section {
          // On until turned off: off, this phone is taken off the person's pushes (`/desktop/push-devices`); back on, it
          // registers again. Refused in the phone's own Settings, the switch shows off and opens them.
          Toggle("Notifications", isOn: notificationsSwitch)
          // A menu in the row, not a page of its own: the page slid back while the whole app redrew in the new colours,
          // and the two together stalled (the founder, 11 October 2026: "lags severely always").
          Picker("Appearance", selection: $theme) {
            Text("System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
          .pickerStyle(.menu)
          .tint(Ink.secondary)
          Toggle("Haptics", isOn: $haptics)
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          // The pages the web app's sign-in links to; they are written on simeonlabs.com, not in the app.
          LegalLink(title: "Privacy Policy", url: Legal.privacy)
          LegalLink(title: "Terms of Service", url: Legal.terms)
          NavigationLink { AboutPage() } label: { Text("About Simeon").foregroundStyle(Ink.primary) }
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          // Asked first, as on the Mac (`AccountMenu.signOut…`).
          Button("Sign Out", role: .destructive) { askingSignOut = true }
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
      .alert(AccountMenu.signOutTitle, isPresented: $askingSignOut) {
        Button(AccountMenu.signOutCancel, role: .cancel) {}
        Button(AccountMenu.signOutConfirm, role: .destructive) { Task { await session.signOut() } }
      } message: {
        Text(AccountMenu.signOutLine)
      }
      .task {
        async let host = store.hostSettings()
        async let usage: Void = store.loadUsage()
        settings = await host
        await usage
      }
      // Read again on coming back from the phone's Settings, where notifications may have just been allowed.
      .task(id: scenePhase) { notificationsRefused = await Notifications.refused() }
    }
  }

  @Environment(\.scenePhase) private var scenePhase
  @AppStorage(Notifications.key) private var notificationsOn = true
  @AppStorage(Haptics.key) private var haptics = true
  @State private var notificationsRefused = false

  private var notificationsSwitch: Binding<Bool> {
    Binding(
      get: { notificationsOn && !notificationsRefused },
      set: { on in
        if on && notificationsRefused {
          #if os(iOS)
          if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
          #endif
          return
        }
        notificationsOn = on
        Task { await Notifications.shared.turn(on) }
      }
    )
  }
}

/** Where the legal pages are: the web app's sign-in links to the same two. */
enum Legal {
  static let privacy = URL(string: "https://www.simeonlabs.com/legal/privacy-policy")!
  static let terms = URL(string: "https://www.simeonlabs.com/legal/terms-of-service")!
}

/** A page on the web from Settings: its name, and the arrow out at the right, as the reference has them. */
struct LegalLink: View {
  let title: String
  let url: URL
  @Environment(\.openURL) private var openURL

  var body: some View {
    Button { openURL(url) } label: {
      HStack {
        Text(title).foregroundStyle(Ink.primary)
        Spacer()
        Image(systemName: "arrow.up.right").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.tertiary)
      }
      .contentShape(.rect)
    }
  }
}

/**
 * Connect apps as the Mac's sidebar has it (mac/Simeon/Sidebar.swift
 * `ConnectApps`): the words in the window's blue, medium, then Gmail,
 * Calendar and Drive on three white tiles, the first turned 7° left, the
 * last 7° right; at the phone's size (17 for the Mac's 15, the tiles in
 * step).
 */
struct ConnectAppsRow: View {
  var body: some View {
    HStack(spacing: 12) {
      Text("Connect apps")
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(Ink.appsBlue)
        .fixedSize()
      HStack(spacing: -4.5) {
        AppTile(image: "Connectors/gmail", turn: -7)
        AppTile(image: "Connectors/google-calendar", turn: 0)
        AppTile(image: "Connectors/google-drive", turn: 7)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
    }
    .padding(.vertical, 4)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Connect apps")
    .accessibilityAddTraits(.isButton)
  }

  private struct AppTile: View {
    let image: String
    let turn: Double

    var body: some View {
      Image(image)
        .resizable()
        .interpolation(.high)
        .aspectRatio(contentMode: .fit)
        .frame(width: 19)
        .frame(width: 30, height: 30)
        .background(Ink.appsTile, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).inset(by: -0.5).stroke(Ink.appsTileEdge, lineWidth: 1) }
        .shadow(color: Ink.appsTileShadow, radius: 1, x: 0, y: 1)
        .rotationEffect(.degrees(turn))
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
          AccountFace(size: 72)
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

/**
 * Usage & Billing, the Mac's (mac/Simeon/SettingsUsage.swift) on the phone:
 * the week's usage (or the trial's) with its bar and when it resets, the
 * on-demand spend, the upgrade line with its button, Cancel Trial when it
 * applies, the refresh failure with Retry; then Manage Plan: the plan and
 * its line, Upgrade to the plan above, and Manage Billing ↗ (Stripe's page).
 * Read when the page shows unless it was read in the last 30 seconds.
 */
struct UsagePage: View {
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var opening: String?
  @State private var failure: String?
  @State private var askingCancel = false
  @State private var cancelling = false
  @State private var cancelFailure: String?

  var body: some View {
    Form {
      if let summary = store.usage.summary {
        let meters = UsageMeters(summary)
        Section("Usage") {
          if let weekly = meters.weekly {
            UsageMeterRow(title: meters.includedUsageTitle, meter: weekly)
          } else {
            VStack(alignment: .leading, spacing: 6) {
              Text(meters.includedUsageTitle).font(.system(size: 17)).foregroundStyle(Ink.primary)
              Text(UsageMeters.noIncludedUsage).font(.system(size: 13)).foregroundStyle(Ink.tertiary)
            }
            .padding(.vertical, 4)
          }
          if let onDemand = meters.onDemand {
            UsageMeterRow(title: UsageMeters.onDemandTitle, meter: onDemand)
          }
          // The founder's reference's Change Limit (9 October 2026): the plans page when there is one to move to, else Stripe's.
          Button {
            if let upgrade = meters.upgrade { openURL(upgrade.url) } else { open("billing", flow: nil, tier: nil) }
          } label: {
            HStack {
              Text("Change Limit").foregroundStyle(Ink.primary)
              Spacer()
              if opening == "billing" { ProgressView() } else {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
              }
            }
            .contentShape(.rect)
          }
          .disabled(opening != nil)
          if let upgrade = meters.upgrade, let line = meters.upgradeSupportingText {
            VStack(alignment: .leading, spacing: 10) {
              Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary)
              Button(upgrade.label) { openURL(upgrade.url) }
                .buttonStyle(PillButtonStyle(primary: true))
            }
            .padding(.vertical, 4)
          }
          if meters.canCancelTrial {
            Button(cancelling ? "Canceling…" : "Cancel Trial", role: .destructive) { askingCancel = true }
              .disabled(cancelling)
            if let cancelFailure {
              Text(cancelFailure).font(.system(size: 13)).foregroundStyle(Ink.danger)
            }
          }
          if store.usage.isFailed {
            HStack(spacing: 12) {
              Text("Couldn’t refresh usage — showing the last known values.")
                .font(.system(size: 13))
                .foregroundStyle(Ink.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
              Button("Retry") { Task { await store.refreshUsage() } }
                .buttonStyle(.borderless)
                .foregroundStyle(Ink.link)
                .disabled(store.usage.isLoading)
            }
          }
        }
        .listRowBackground(Ink.groupedRow)
        if let plan = summary.managePlan {
          Section("Manage Plan") {
            VStack(alignment: .leading, spacing: 4) {
              Text("Current plan: \(plan.planName)").font(.system(size: 17)).foregroundStyle(Ink.primary)
              let line = plan.line()
              if !line.isEmpty { Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary) }
            }
            .padding(.vertical, 2)
            if let next = plan.nextTier {
              Button { open("upgrade", flow: "update_confirm", tier: next.tier) } label: {
                Text(opening == "upgrade" ? "Opening…" : "Upgrade to \(next.label)").foregroundStyle(Ink.link)
              }
              .disabled(opening != nil)
            }
            Button { open("billing", flow: nil, tier: nil) } label: {
              HStack {
                Text(opening == "billing" ? "Opening…" : "Manage Billing").foregroundStyle(Ink.primary)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.tertiary)
              }
              .contentShape(.rect)
            }
            .disabled(opening != nil)
            if let failure {
              Text(failure).font(.system(size: 13)).foregroundStyle(Ink.danger)
            }
          }
          .listRowBackground(Ink.groupedRow)
        }
      } else if store.usage.isFailed {
        HStack(spacing: 12) {
          Text("Couldn’t load usage.").foregroundStyle(Ink.secondary).frame(maxWidth: .infinity, alignment: .leading)
          Button("Retry") { Task { await store.refreshUsage() } }.buttonStyle(.borderless).foregroundStyle(Ink.link)
        }
        .listRowBackground(Ink.groupedRow)
      } else {
        HStack { ProgressView(); Text("Loading usage…").foregroundStyle(Ink.secondary) }
          .listRowBackground(Ink.groupedRow)
      }
    }
    .groupedGround()
    .navigationTitle("Usage & Billing")
    .inlineBarTitle()
    .task { await store.loadUsage() }
    // The Mac's question, word for word.
    .alert("Cancel your trial?", isPresented: $askingCancel) {
      Button("Keep Trial", role: .cancel) {}
      Button("Cancel Trial", role: .destructive) {
        cancelling = true
        cancelFailure = nil
        Task {
          cancelFailure = await store.cancelTrial()
          cancelling = false
          if cancelFailure == nil { Haptics.success() } else { Haptics.warning() }
        }
      }
    } message: {
      Text("This ends your Simeon trial now and removes your remaining trial credits. Your card won’t be charged either way — the trial never turns into a paid plan on its own.")
    }
  }

  /** Stripe's page for the plan above (`update_confirm`) or its front page; "Opening…" while it is asked for, the failure under the rows. */
  private func open(_ which: String, flow: String?, tier: String?) {
    guard opening == nil else { return }
    opening = which
    failure = nil
    Task {
      let answer = await store.billingPortal(flow: flow, tier: tier)
      if let url = answer.url { openURL(url) } else { failure = answer.message ?? "Couldn’t open billing. Try again." }
      opening = nil
    }
  }
}

/** A meter: its title and when it resets, the bar in the blue (red past 90%), its value. */
private struct UsageMeterRow: View {
  let title: String
  let meter: UsageMeters.Meter

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(title).font(.system(size: 17)).foregroundStyle(Ink.primary)
        Spacer()
        if let reset = meter.resetLabel { Text(reset).font(.system(size: 13)).foregroundStyle(Ink.tertiary) }
      }
      if let percent = meter.barPercent {
        GeometryReader { geometry in
          ZStack(alignment: .leading) {
            Capsule().fill(Ink.pill)
            Capsule().fill(percent > 90 ? Ink.danger : Ink.blue).frame(width: geometry.size.width * CGFloat(min(100, max(0, percent)) / 100))
          }
        }
        .frame(height: 6)
      }
      Text(meter.valueLabel).font(.system(size: 13)).foregroundStyle(Ink.secondary)
    }
    .padding(.vertical, 6)
    .accessibilityElement(children: .combine)
  }
}

/** The account's picture when it has one, else its initials: the Mac's account button (mac/Simeon/Sidebar.swift `AccountPicture`). */
struct AccountFace: View {
  let size: CGFloat
  @Environment(AppStore.self) private var store

  var body: some View {
    ZStack {
      Initials(letters: store.account?.initials ?? "", size: Double(size))
        .background(Ink.bubbleTheirs, in: Circle())
      if let url = store.account?.pictureURL {
        AsyncImage(url: url) { phase in
          if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/** About Simeon, the Mac's card as a page: the mark, "Simeon", the version, the copyright, and Copy version info ("Copied" for 1.2 s). */
struct AboutPage: View {
  @State private var copied = false

  private var version: String { SessionController.displayVersion }

  var body: some View {
    Form {
      Section {
        VStack(spacing: 12) {
          Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit().frame(width: 64, height: 64)
            .foregroundStyle(Ink.primary)
            .accessibilityHidden(true)
          VStack(spacing: 2) {
            Text(AboutSimeon.name).font(.system(size: 22, weight: .semibold)).foregroundStyle(Ink.primary)
            Text(AboutSimeon.versionLine(version)).font(.system(size: 13)).foregroundStyle(Ink.secondary).monospacedDigit()
          }
          Text(AboutSimeon.copyright).font(.system(size: 12)).foregroundStyle(Ink.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .listRowBackground(Color.clear)
      }
      Section {
        Button {
          UIPasteboard.general.string = AboutSimeon.versionInfo(version: version, os: "ios")
          Haptics.tap()
          copied = true
          Task {
            try? await Task.sleep(nanoseconds: UInt64(AboutSimeon.copiedSeconds * 1_000_000_000))
            copied = false
          }
        } label: {
          HStack {
            Text(copied ? AboutSimeon.copied : "Copy Version Info").foregroundStyle(Ink.primary)
            Spacer()
            Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 14)).foregroundStyle(Ink.secondary)
          }
          .contentShape(.rect)
        }
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("About")
    .inlineBarTitle()
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
 * Auto-review's rules, the Mac's table on the phone (mac/Simeon/SettingsGeneral.swift):
 * the allowed ones, then the ask-first ones; a tap edits a rule (its words and
 * its list, Save Rule), a swipe deletes it. Below, "When Simeon wants to:" one
 * short line, "It should:" Allow automatically or Ask first, Add Rule. Twenty
 * rules a list and a thousand characters a rule, a rule already listed not
 * twice (`AutoReviewInstructions`). Stored in the box as `autoReviewInstructions`.
 */
struct AutoReviewRules: View {
  @Binding var settings: JSON?
  @Environment(AppStore.self) private var store
  @State private var wants = ""
  @State private var should = AutoReviewInstructions.Behavior.allow
  @State private var editing: EditingRule?

  struct EditingRule: Identifiable {
    let rule: AutoReviewInstructions.Rule
    var id: String { "\(rule.behavior.rawValue)/\(rule.listIndex)/\(rule.text)" }
  }

  private var rules: AutoReviewInstructions { AutoReviewInstructions.normalized(json: settings?["autoReviewInstructions"]) }

  var body: some View {
    let rules = self.rules
    let draft = wants.trimmingCharacters(in: .whitespacesAndNewlines)
    Form {
      Section {
        Text("Write one short, natural-language rule for each action. \"Ask first\" takes priority if rules conflict.")
          .font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      .listRowBackground(Ink.groupedRow)
      ForEach(AutoReviewInstructions.Behavior.allCases, id: \.self) { behavior in
        let listed = rules.rules.filter { $0.behavior == behavior }
        if !listed.isEmpty {
          Section(AutoReviewInstructions.label(behavior)) {
            ForEach(listed, id: \.self) { rule in
              Button { editing = EditingRule(rule: rule) } label: {
                HStack {
                  Text(rule.text).foregroundStyle(Ink.primary).lineLimit(3)
                  Spacer(minLength: 8)
                  Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
                }
                .contentShape(.rect)
              }
              .accessibilityHint("Edits the rule")
            }
            .onDelete { offsets in
              var next = rules
              for rule in offsets.map({ listed[$0] }).sorted(by: { $0.listIndex > $1.listIndex }) { next = next.removing(rule) }
              save(next)
            }
          }
          .listRowBackground(Ink.groupedRow)
        }
      }
      Section {
        VStack(alignment: .leading, spacing: 8) {
          Text("When Simeon wants to:").font(.system(size: 13)).foregroundStyle(Ink.secondary)
          TextField("e.g. reply to emails for me", text: $wants, axis: .vertical)
            .lineLimit(1...4)
            .onChange(of: wants) { _, text in if text.count > AutoReviewInstructions.maxCharacters { wants = AutoReviewInstructions.clip(text) } }
        }
        Picker("It should:", selection: $should) {
          ForEach(AutoReviewInstructions.Behavior.allCases, id: \.self) { Text(AutoReviewInstructions.label($0)).tag($0) }
        }
        Button("Add Rule") {
          guard let next = rules.saving(draft, as: should, editing: nil) else { return }
          wants = ""
          save(next)
        }
        .disabled(draft.isEmpty || rules.saving(draft, as: should, editing: nil) == nil)
      } footer: {
        if AutoReviewInstructions.isFull(rules.list(should)) {
          Text("\(AutoReviewInstructions.label(should)) is full (\(AutoReviewInstructions.limitNote)).")
        } else {
          Text("These rules apply only to you. Built-in safety checks always apply.")
        }
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("Auto-review Rules")
    .inlineBarTitle()
    .sheet(item: $editing) { item in
      RuleEditor(rule: item.rule, rules: rules) { next in save(next) }
        .presentationDetents([.medium])
        .presentationBackground(Ink.groupedGround)
    }
  }

  private func save(_ next: AutoReviewInstructions) {
    var next = next
    next.isEnabled = rules.isEnabled
    settings = (settings ?? [:]).setting("autoReviewInstructions", next.json)
    Haptics.tap()
    Task { await store.setHostSettings(["autoReviewInstructions": next.json]) }
  }
}

/** One rule being edited, as the Mac's row turns into its composer: its words, its list, Cancel and Save Rule (greyed while it may not be saved). */
private struct RuleEditor: View {
  let rule: AutoReviewInstructions.Rule
  let rules: AutoReviewInstructions
  let save: (AutoReviewInstructions) -> Void
  @State private var text: String
  @State private var behavior: AutoReviewInstructions.Behavior
  @Environment(\.dismiss) private var dismiss

  init(rule: AutoReviewInstructions.Rule, rules: AutoReviewInstructions, save: @escaping (AutoReviewInstructions) -> Void) {
    self.rule = rule
    self.rules = rules
    self.save = save
    _text = State(initialValue: rule.text)
    _behavior = State(initialValue: rule.behavior)
  }

  private var saved: AutoReviewInstructions? {
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return words.isEmpty ? nil : rules.saving(words, as: behavior, editing: rule)
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Action", text: $text, axis: .vertical)
            .lineLimit(1...6)
            .onChange(of: text) { _, words in if words.count > AutoReviewInstructions.maxCharacters { text = AutoReviewInstructions.clip(words) } }
          Picker("It should:", selection: $behavior) {
            ForEach(AutoReviewInstructions.Behavior.allCases, id: \.self) { Text(AutoReviewInstructions.label($0)).tag($0) }
          }
        } footer: {
          // Moving it to a full list: the Mac's limit note.
          if behavior != rule.behavior && AutoReviewInstructions.isFull(rules.list(behavior)) {
            Text(AutoReviewInstructions.limitNote)
          }
        }
        .listRowBackground(Ink.groupedRow)
      }
      .groupedGround()
      .navigationTitle("Edit Rule")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save Rule") {
            if let saved { save(saved) }
            dismiss()
          }
          .disabled(saved == nil)
        }
      }
    }
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
        .padding(.top, 10)
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0) {
            if store.catalog.isEmpty {
              HStack(spacing: 10) { ProgressView(); Text("Loading apps…").font(.system(size: 13)).foregroundStyle(Ink.secondary) }
                .padding(.top, 28)
            } else if sections.isEmpty {
              Text("No apps match \u{201C}\(query)\u{201D}.").font(.system(size: 13)).foregroundStyle(Ink.secondary)
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
          .padding(.top, 12)
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
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(category == nil ? Ink.primary : Ink.blue)
        .frame(width: 42, height: 42)
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

/**
 * A page's head, measured on the founder's reference (11 October 2026): the
 * round Back (42) on the left, the title beside it (16.4 medium), and what
 * the page puts at the right, kept whole (the title gives way first).
 */
struct PluginsHead<Trailing: View>: View {
  let title: String
  let back: () -> Void
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 14) {
      Button(action: back) {
        Image(systemName: "chevron.left")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(Ink.primary)
          .frame(width: 42, height: 42)
          .background(Ink.groupedRow, in: Circle())
          .contentShape(.circle)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Back")
      Text(title).font(.system(size: 16.4, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 8)
      trailing()
        .fixedSize()
        .layoutPriority(1)
    }
    .padding(.horizontal, 18)
    .padding(.top, 18)
  }
}

/** "4 installed" with the first three apps' logos overlapping, in the control's fill (42 high, 16.4 medium), never cut: it opens Your plugins. */
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
      Text("\(apps.count) installed").font(.system(size: 16.4, weight: .medium)).foregroundStyle(Ink.primary)
        .lineLimit(1)
        .fixedSize()
    }
    .padding(.leading, apps.isEmpty ? 16 : 10)
    .padding(.trailing, 16)
    .frame(height: 42)
    .background(Ink.groupedRow, in: Capsule())
    .contentShape(.capsule)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(apps.count) installed")
    .accessibilityHint("Shows your plugins")
  }
}

/** The search, in the control's fill, round (40 high, 15): "Search plugins". */
struct PluginsSearchField: View {
  @Binding var text: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .medium)).foregroundStyle(Ink.secondary)
      TextField("Search plugins", text: $text)
        .font(.system(size: 15))
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
    .frame(height: 40)
    .background(Ink.groupedRow, in: Capsule())
  }
}

/** A section's head: its name in the faint grey (13), and View all (13) at the right when some are hidden; 21 over it, 4 under. */
struct PluginsSectionHead<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack {
      Text(title).font(.system(size: 13)).foregroundStyle(Ink.tertiary).accessibilityAddTraits(.isHeader)
      Spacer()
      trailing().font(.system(size: 13)).foregroundStyle(Ink.secondary)
    }
    .padding(.top, 21)
    .padding(.bottom, 4)
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
        .padding(.top, 10)
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
        .padding(.top, 10)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          PluginsSectionHead(title: "Installed") { EmptyView() }
          if apps.isEmpty {
            Text(store.appsOnce.isEmpty ? "No apps yet. Add one from the Marketplace." : "No apps match \u{201C}\(query)\u{201D}.")
              .font(.system(size: 13)).foregroundStyle(Ink.secondary)
              .padding(.top, 8)
          }
          ForEach(apps) { app in InstalledRow(app: app) }
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
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
    HStack(spacing: 12) {
      NavigationLink { ConnectedAppDetail(app: app) } label: {
        HStack(spacing: 16) {
          ConnectorTile(name: app.name, size: 37)
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
              Text(app.name).font(.system(size: 16.4)).foregroundStyle(Ink.primary).lineLimit(1)
              if app.status == "error" { Text("Error").font(.system(size: 13)).foregroundStyle(Ink.danger).fixedSize() }
            }
            Text(app.toolCount > 0 ? (app.toolCount == 1 ? "1 tool" : "\(app.toolCount) tools") : (connected ? "Connected" : "Not signed in"))
              .font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
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
    .padding(.vertical, 17)
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

/** A row's pill (the reference's Add, Added, Authenticate): 13 medium, 26 high, 12 either side, round, never cut. */
struct PluginPill: View {
  let title: String
  let fill: Color
  let ink: Color

  var body: some View {
    Text(title)
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(ink)
      .lineLimit(1)
      .padding(.horizontal, 12)
      .frame(height: 26)
      .background(fill, in: Capsule())
      .fixedSize()
  }
}

/** One app in the catalog (the reference's, measured): its logo (37), name (16.4) and what it does in two lines (13), and Add, or Added once it is in. */
struct AppRow: View {
  let app: CatalogApp
  @Environment(AppStore.self) private var store
  /** What the person reads before the sign-in page opens (ConnectConsentSheet). */
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    HStack(spacing: 16) {
      ConnectorTile(name: app.title, size: 37)
      VStack(alignment: .leading, spacing: 2) {
        Text(app.title).font(.system(size: 16.4)).foregroundStyle(Ink.primary).lineLimit(1)
        if !app.summary.isEmpty { Text(app.summary).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2) }
      }
      Spacer(minLength: 8)
      if app.comingSoon {
        Text("Soon").font(.system(size: 13)).foregroundStyle(Ink.tertiary)
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
    .padding(.vertical, 17)
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
