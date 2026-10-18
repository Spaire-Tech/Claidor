import StoreKit
import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

/**
 * Settings, in the order the founder's reference has it (9 and 11 October
 * 2026): the account and, under it, Usage with its share; Connect apps, as
 * the Mac's sidebar has it; the agents' settings (Auto-review and its rules,
 * the time zone, set automatically or chosen); Notifications, Face ID (where
 * the phone has it, off until turned on), Appearance and Haptics (both
 * switches on until turned off); Privacy Policy, Terms of
 * Service and About; Sign Out (asked first) and the mark. Usage opens the
 * Mac's Usage & Billing (UsagePage).
 */
struct SettingsSheet: View {
  @Environment(SimeonCore.AppStore.self) private var store
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
          // The founder, 18 October 2026: Wallet, Secure credentials store, Permissions and Messaging channels here, in
          // that order and with no icons; Permissions first, holding Auto-review and its rules. The other three join as
          // each is built.
          NavigationLink { PermissionsPage(settings: $settings) } label: { Text("Permissions").foregroundStyle(Ink.primary) }
        }
        .listRowBackground(Ink.groupedRow)
        AgentSettingsSection(settings: $settings)
        Section {
          // On until turned off: off, this phone is taken off the person's pushes (`/desktop/push-devices`); back on, it
          // registers again. Refused in the phone's own Settings, the switch shows off and opens them.
          Toggle("Notifications", isOn: notificationsSwitch)
            .tint(Ink.blue)
            .onChange(of: notificationsOn) { _, _ in Haptics.select() }
          // Face ID when the app opens and after a quarter of an hour away (AppLock.swift); only on a phone that has it.
          if AppLock.available {
            Toggle(AppLock.name, isOn: faceIDSwitch)
              .tint(Ink.blue)
          }
          // A menu in the row, not a page of its own: the page slid back while the whole app redrew in the new colours,
          // and the two together stalled (the founder, 11 October 2026: "lags severely always").
          Picker("Appearance", selection: $theme) {
            Text("System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
          .pickerStyle(.menu)
          .tint(Ink.secondary)
          .onChange(of: theme) { _, _ in Haptics.select() }
          Toggle("Haptics", isOn: $haptics)
            .tint(Ink.blue)
            // Turned on, it is felt at once: the way to tell it works.
            .onChange(of: haptics) { _, on in if on { Haptics.success() } }
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
          // Asked first, as on the Mac (`AccountMenu.signOut…`). Delete Account is on the Account page (AccountPage).
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
  @State private var faceIDOn = AppLock.isOn

  private var faceIDSwitch: Binding<Bool> {
    Binding(
      get: { faceIDOn },
      set: { on in
        if on {
          // On only once Face ID says it is the owner.
          Task { faceIDOn = await AppLock.shared.enable() }
        } else {
          AppLock.shared.disable()
          faceIDOn = false
        }
      }
    )
  }

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
 * The agents' settings: the time zone the agents' computer keeps (set
 * automatically, or chosen). Auto-review and its rules moved to
 * Permissions (PermissionsPage) on 18 October 2026. `settings` is the box's
 * host settings, read once by the page that holds this section.
 */
struct AgentSettingsSection: View {
  @Binding var settings: JSON?
  @Environment(SimeonCore.AppStore.self) private var store

  /** This device, as the time zone's line names it. */
  private var device: String { AppPlatform.isMac ? "Mac" : "phone" }

  var body: some View {
    Section("Agents") {
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

}

/**
 * Permissions (the founder, 18 October 2026: "bring auto review and auto
 * review rules there"): Auto-review, with the line saying what it does, and
 * its rules. `settings` is the box's host settings, read by Settings.
 */
struct PermissionsPage: View {
  @Binding var settings: JSON?
  @Environment(SimeonCore.AppStore.self) private var store

  var body: some View {
    Form {
      Section {
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
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("Permissions")
    .inlineBarTitle()
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

/**
 * The account: the person's name and email, the email copied with a tap;
 * then Delete Account with one line under it, as the founder's reference
 * has it (12 October 2026). Apple asks every app that makes accounts to
 * delete them from inside the app (server/simeon/desktop/account_deletion.py
 * does the deleting; the question before it says what goes).
 */
struct AccountPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @State private var copied = false
  @State private var askingDelete = false
  @State private var deleting = false
  @State private var deleteProblem: String?

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
      Section {
        Button(role: .destructive) { askingDelete = true } label: {
          HStack(spacing: 10) {
            Image(systemName: "trash")
            Text(AccountMenu.deleteAccount)
            if deleting {
              Spacer()
              ProgressView()
            }
          }
          .foregroundStyle(Ink.danger)
        }
        .disabled(deleting)
      } footer: {
        Text(AccountMenu.deleteFooter)
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle("Account")
    .inlineBarTitle()
    .alert(AccountMenu.deleteTitle, isPresented: $askingDelete) {
      Button(AccountMenu.signOutCancel, role: .cancel) {}
      Button(AccountMenu.deleteAccount, role: .destructive) {
        Task {
          deleting = true
          deleteProblem = await session.deleteAccount()
          deleting = false
        }
      }
    } message: {
      // A plan bought through Apple is not cancelled by deleting the account: Apple keeps charging until it is cancelled there.
      Text(store.usage.summary?.billedByApple == true ? "\(AccountMenu.deleteLine)\n\n\(AccountMenu.deleteAppleLine)" : AccountMenu.deleteLine)
    }
    .alert(AccountMenu.deleteRefused, isPresented: Binding(get: { deleteProblem != nil }, set: { if !$0 { deleteProblem = nil } })) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(deleteProblem ?? "")
    }
  }
}

/**
 * Usage & Billing, the Mac's (mac/Simeon/SettingsUsage.swift) on the phone:
 * the week's usage (or the trial's) with its bar and when it resets, the
 * on-demand spend, the upgrade line with its button, Cancel Trial when it
 * applies, the refresh failure with Retry; then Manage Plan: the plan and
 * its line, Upgrade to the plan above, and Manage Billing ↗ (Stripe's page).
 * Read when the page shows unless it was read in the last 30 seconds.
 *
 * In-app purchase (12 October 2026): with no plan, or a plan bought through
 * Apple, choosing or upgrading opens the App Store's plans (PlansSheet), and
 * Manage Subscription and Cancel Trial open Apple's own subscription sheet.
 * A plan bought on the web keeps its Stripe links where Apple allows them
 * (the United States); elsewhere they are not shown.
 */
struct UsagePage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var purchases = Purchases.shared
  @State private var opening: String?
  @State private var failure: String?
  @State private var askingCancel = false
  @State private var cancelling = false
  @State private var cancelFailure: String?
  @State private var showsPlans = false
  @State private var plansTier: String?

  var body: some View {
    Form {
      if let summary = store.usage.summary {
        let meters = UsageMeters(summary)
        // Who changes the plan here: Apple's sheets, or Stripe's pages where Apple allows a link to them.
        let apple = summary.billedByApple || summary.managePlan == nil
        let web = !apple && purchases.webLinkAllowed
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
          if apple || web {
            Button {
              if apple { choosePlan(summary.managePlan?.nextTier?.tier) } else if let upgrade = meters.upgrade { openURL(upgrade.url) } else { open("billing", flow: nil, tier: nil) }
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
          }
          if let upgrade = meters.upgrade, let line = meters.upgradeSupportingText, apple || web {
            VStack(alignment: .leading, spacing: 10) {
              Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary)
              Button(upgrade.label) {
                if apple { choosePlan(summary.managePlan?.nextTier?.tier) } else { openURL(upgrade.url) }
              }
              .buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
            }
            .padding(.vertical, 4)
          }
          if meters.canCancelTrial {
            Button(cancelling ? "Canceling…" : "Cancel Trial", role: .destructive) {
              // Apple's free week is cancelled in Apple's own sheet.
              if summary.billedByApple { manageWithApple() } else { askingCancel = true }
            }
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
            if summary.billedByApple {
              if let next = plan.nextTier {
                Button { choosePlan(next.tier) } label: {
                  Text("Upgrade to \(next.label)").foregroundStyle(Ink.link)
                }
              }
              Button { manageWithApple() } label: {
                HStack {
                  Text("Manage Subscription").foregroundStyle(Ink.primary)
                  Spacer()
                  Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
                }
                .contentShape(.rect)
              }
            } else if web {
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
            }
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
    .sheet(isPresented: $showsPlans, onDismiss: { Task { await store.refreshUsage() } }) {
      PlansSheet(preselect: plansTier).presentationBackground(Ink.groupedGround)
    }
  }

  /**
   * Apple's own subscription page (change, cancel, or end the free week),
   * over the whole screen rather than from inside Settings' sheet (12
   * October 2026: from the sheet it loaded without end, then said "Cannot
   * Connect"); the App Store's subscriptions page when Apple's cannot be
   * shown. The usage is read again once it closes.
   */
  private func manageWithApple() {
    Task {
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      if let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first {
        do {
          try await StoreKit.AppStore.showManageSubscriptions(in: scene)
          await store.refreshUsage()
          return
        } catch {
          Trace.log("[simeon] manage subscriptions: \(error.localizedDescription)")
        }
      }
      openURL(Self.appStoreSubscriptions)
      await store.refreshUsage()
    }
  }

  /** The App Store's own page of the Apple ID's subscriptions (Apple's documented link). */
  static let appStoreSubscriptions = URL(string: "https://apps.apple.com/account/subscriptions")!

  /** The App Store's plans, on `tier` when one is asked for (an upgrade). */
  private func choosePlan(_ tier: String?) {
    plansTier = tier
    showsPlans = true
  }

  /**
   * Stripe's page for the plan above (`update_confirm`) or its front page, in
   * the app and back in it when done (`BillingPage`, 14 October 2026; it
   * ended on the web's billing page, which asks to sign in); "Opening…"
   * while it is asked for, the failure under the rows.
   */
  private func open(_ which: String, flow: String?, tier: String?) {
    guard opening == nil else { return }
    opening = which
    failure = nil
    Task {
      failure = await BillingPage.shared.open(flow: flow, tier: tier, store: store, openURL: openURL)
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
  @Environment(SimeonCore.AppStore.self) private var store

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
  /** What the hang watch wrote down when the app last stood still (HangWatch), read as the page opens. */
  @State private var freezes: String?
  @State private var copiedFreezes = false

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
      // A freeze is written down as it happens, even one that ends in quitting the app: copied here, it says where it was.
      if let freezes {
        Section {
          Button {
            UIPasteboard.general.string = freezes
            Haptics.tap()
            copiedFreezes = true
            Task {
              try? await Task.sleep(nanoseconds: UInt64(AboutSimeon.copiedSeconds * 1_000_000_000))
              copiedFreezes = false
            }
          } label: {
            HStack {
              Text(copiedFreezes ? AboutSimeon.copied : "Copy Freeze Report").foregroundStyle(Ink.primary)
              Spacer()
              Image(systemName: copiedFreezes ? "checkmark" : "doc.on.doc").font(.system(size: 14)).foregroundStyle(Ink.secondary)
            }
            .contentShape(.rect)
          }
          Button("Clear Freeze Report", role: .destructive) {
            try? FileManager.default.removeItem(at: HangWatch.reportURL)
            self.freezes = nil
          }
        } footer: {
          Text("What the app was doing each time it stood still. Paste it to the team.")
        }
        .listRowBackground(Ink.groupedRow)
      }
    }
    .groupedGround()
    .navigationTitle("About")
    .inlineBarTitle()
    .task { freezes = HangWatch.savedReport() }
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
  @Environment(SimeonCore.AppStore.self) private var store
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
 * Connectors, as the founder's reference has them (14 October 2026,
 * ChatGPT's Plugins: "this is how i need you to design connectors in
 * mobile. full logo"), on the app's ground. Apple's bar: the round Back,
 * the title in the middle with its menu (Available or Yours, which was
 * Apple's segmented control under the search until then), and the filter
 * (the Mac's Type and Ownership). Available is the catalog by category,
 * Featured first and the rest A to Z: each category's name with › over its
 * first four apps, the name opening all of them (ConnectorCategoryPage);
 * a search shows every match. Each app has its own icon (AppIcons), its
 * name, what it does in a line, and +, which asks first
 * (ConnectConsentSheet), then installs the app in the box and opens its
 * sign-in, in one go (`Connecting`). Yours is what the person added
 * (YoursList). The search floats at the bottom.
 */
struct ConnectAppsSheet: View {
  // Since the Mac's Plugins came over (11 October 2026): a row opens the plugin's page (PluginPage); + opens the setup page
  // for a plugin that asks for values, and adds a skills-only one at once; the Mac's notice says how each went
  // (ConnectAppsModel.swift, ConnectAppsPages.swift).
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var tab: ConnectorsTab = .available
  /** What the Mac's Plugins window knows and does, for this opening (ConnectAppsModel). */
  @State private var model = ConnectAppsModel()

  var body: some View {
    NavigationStack {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          switch tab {
          case .available: available
          case .yours: YoursList(query: query)
          }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
      }
      .scrollDismissesKeyboard(.immediately)
      .refreshable {
        await store.loadApps()
        await model.load()
      }
      .safeAreaInset(edge: .bottom) { ConnectorsSearchPill(text: $query) }
      .background(Ink.ground.ignoresSafeArea())
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button { dismiss() } label: { Image(systemName: "chevron.left") }
            .accessibilityLabel("Back")
        }
        ToolbarItem(placement: .principal) { titleMenu }
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

  /** Available: each category's name and its first apps (Featured first), or every app the search and the filter keep. */
  @ViewBuilder
  private var available: some View {
    let sections = connectorSections(store.catalog, query: query, model: model)
    let searching = !query.trimmingCharacters(in: .whitespaces).isEmpty
    if store.catalog.isEmpty {
      HStack(spacing: 10) { ProgressView(); Text("Loading apps…").font(.system(size: 15)).foregroundStyle(Ink.secondary) }
        .padding(.top, 24)
    } else if sections.isEmpty {
      Text(query.isEmpty ? Plugins.noFilterMatch : "No apps match \u{201C}\(query)\u{201D}.").font(.system(size: 15)).foregroundStyle(Ink.secondary)
        .padding(.top, 24)
    }
    ForEach(sections) { section in
      ConnectorsSectionLink(title: section.title)
      ForEach(searching ? section.apps : Array(section.apps.prefix(ConnectorsPreview.count))) { app in AppRow(app: app) }
    }
  }

  /** The title (the reference's "Plugins ⌄"): what is shown, and its menu, Available or Yours. */
  private var titleMenu: some View {
    Menu {
      Picker("Show", selection: $tab) {
        ForEach(ConnectorsTab.allCases, id: \.self) { tab in Text(tab.title).tag(tab) }
      }
    } label: {
      HStack(spacing: 5) {
        Text(tab.heading).font(.system(size: 17, weight: .semibold))
        Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold))
      }
      .foregroundStyle(Ink.primary)
      .contentShape(.rect)
    }
    .accessibilityLabel("Show")
    .accessibilityValue(tab.title)
  }

  /** The filter, in Apple's bar: the Mac's Type and Ownership, for what is shown; its glyph in blue while something is chosen. */
  private var filterMenu: some View {
    Menu {
      switch tab {
      case .available: PluginFilterPickers(filter: $model.marketplaceFilter)
      case .yours: PluginFilterPickers(filter: $model.yoursFilter)
      }
    } label: {
      Image(systemName: "line.3.horizontal.decrease")
        .foregroundStyle((tab == .available ? model.marketplaceFilter.isAll : model.yoursFilter.isAll) ? Ink.primary : Ink.blue)
    }
    .accessibilityLabel("Filter connectors")
  }
}

/**
 * A connector's logo on Connectors' rows: 44, the app's own icon filling it
 * with an app icon's corners (14 October 2026, the founder's reference:
 * "full logo"); a mark on a tile, at 76%, for an app with no icon of its own
 * (was 37 at 60%; 13 October 2026: "bigger the logos").
 */
enum ConnectorLogo {
  static let row: CGFloat = 44
  static let fill: CGFloat = 0.76
  /** An app icon's corner, as the Home Screen draws it, for its side. */
  static let iconCorner: CGFloat = 0.2237
}

/** Connectors' two halves (13 October 2026: "connected become yours"): what can be added, and what the person has. */
enum ConnectorsTab: CaseIterable {
  case available, yours

  var title: String {
    switch self {
    case .available: "Available"
    case .yours: "Yours"
    }
  }

  /** The bar's title for it. */
  var heading: String {
    switch self {
    case .available: "Connectors"
    case .yours: "Yours"
    }
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
    // The section's name finds its apps too ("finance" finds Finance & Money's), as the Mac's search weighs the category.
    for app in catalog where words.isEmpty || app.title.localizedCaseInsensitiveContains(words) || app.summary.localizedCaseInsensitiveContains(words)
      || app.category.localizedCaseInsensitiveContains(words) {
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
 * Yours (Your plugins until 13 October 2026, a page of its own then; now
 * Connectors' second half): the installed apps, each with its logo, its
 * name ("Error" beside it in red when the box says so) and its tools; at
 * the right Connected once it is signed in, else Connect, which asks first
 * as every connect does, then opens its sign-in. A row opens the app's page
 * (PluginPage). As the Mac's Yours: the GitHub banner over them, the
 * filter's Type and Ownership, the plugins added with no app of their own
 * (skills only), and Private, an agent's own skills.
 */
struct YoursList: View {
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
    if !model.authBlocked.isEmpty { GitHubBanner().padding(.top, 8) }
    if !showsInstalled && !showsPrivate {
      Text(Plugins.noFilterMatch).font(.system(size: 15)).foregroundStyle(Ink.secondary).padding(.top, 24)
    }
    if showsInstalled {
      ConnectorsSectionTitle(title: "Installed") { EmptyView() }
      if apps.isEmpty && skillsOnly.isEmpty {
        Text(q.isEmpty || store.appsOnce.isEmpty ? "No apps yet. Add one from Available." : "No apps match \u{201C}\(q)\u{201D}.")
          .font(.system(size: 15)).foregroundStyle(Ink.secondary)
          .padding(.top, 8)
      }
      ForEach(apps) { app in InstalledRow(app: app) }
      ForEach(skillsOnly, id: \.entry.id) { plugin in SkillsPluginRow(entry: plugin.entry, mode: plugin.mode) }
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

/** One installed app on Your plugins; the team's mark beside its name when the team added it (the Mac's `TeamBadge`). */
struct InstalledRow: View {
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
          ConnectorTile(name: app.name, size: ConnectorLogo.row, logo: ConnectorLogo.fill)
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
              Text(app.name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
              if let team = teamLabel { TeamBadge(tip: team) }
              if app.status == "error" { Text("Error").font(.system(size: 13)).foregroundStyle(Ink.danger).fixedSize() }
            }
            let line = connected ? (app.toolCount == 1 ? "1 tool" : app.toolCount > 0 ? "\(app.toolCount) tools" : Connecting.connected) : "Not connected"
            Text(line)
              .font(.system(size: 15)).foregroundStyle(!connected ? Ink.danger : line == Connecting.connected ? Ink.success : Ink.secondary).lineLimit(1)
          }
          Spacer(minLength: 4)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.tactile)
      if connected {
        ConnectorMark.added()
      } else if connector.connecting == app.name {
        ConnectorMark.busy()
      } else {
        // Added but not signed in: + signs it in, after the same question as every connect.
        Button { asking = ConnectConsent(app: store.catalogApp(named: app.name), name: app.name) } label: { ConnectorMark.plus() }
          .buttonStyle(.tactile)
          .disabled(connector.connecting != nil)
          .accessibilityLabel("Connect \(app.name)")
      }
    }
    .padding(.vertical, 13.5)
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

/** A row's pill (the reference's Connect, Connected; Added for a plugin of skills alone): 13 medium, 26 high, 12 either side, round, never cut. */
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

/**
 * One app in the catalog (the founder's reference, 14 October 2026): its own
 * icon (44), its name (17, with the Mac's Team mark for a team's
 * marketplace) and what it does in a line (15), and + at the right, a tick
 * once it is signed in (or added, for a plugin of skills alone, which has
 * nothing to sign in to). The row opens the plugin's page (PluginPage), as
 * the Mac's Marketplace rows do; + (PluginAddButton) is the consent, then the
 * setup page or the sign-in, in one go. An app added before but not signed
 * in shows + too, and + then only signs it in.
 */
struct AppRow: View {
  let app: CatalogApp
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(ConnectAppsModel.self) private var model
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    // A plugin of skills alone has no app to sign in to: it is in once it is added (the Mac's `et`).
    let skillsAdded = model.entry(app.id).map { $0.connectorList.isEmpty && model.installed($0).isInstalled } ?? false
    // An app that can't be added yet: dimmed, "Coming soon" in place of + (`AppsComingSoon`).
    let soon = store.isComingSoon(app.id)
    HStack(spacing: 8) {
      NavigationLink { PluginPage(entryId: app.id) } label: {
        HStack(spacing: 14) {
          ConnectorTile(name: app.title, size: ConnectorLogo.row, logo: ConnectorLogo.fill, id: app.id)
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
              Text(app.title).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
              if let team = model.entry(app.id).flatMap({ Plugins.teamMark($0) }) { TeamBadge(tip: team) }
            }
            if !app.summary.isEmpty { Text(app.summary).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1) }
          }
          Spacer(minLength: 4)
        }
        .contentShape(.rect)
        .opacity(soon ? 0.6 : 1)
      }
      .buttonStyle(.tactile)
      if soon {
        ConnectorMark.soon()
          .accessibilityLabel("\(app.title) is coming soon")
      } else if store.isConnected(app.title) || skillsAdded {
        ConnectorMark.added()
      } else if connector.connecting == app.title || model.adding == app.id {
        ConnectorMark.busy()
      } else {
        PluginAddButton(name: app.title, catalogApp: app, entryId: app.id) { ConnectorMark.plus() }
          .accessibilityLabel("Connect \(app.title)")
      }
    }
    .padding(.vertical, 13.5)
  }
}
