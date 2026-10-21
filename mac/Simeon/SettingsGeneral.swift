import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * Settings › General, as the iPhone's Settings has it (ios/Simeon/Settings.swift,
 * the founder, 21 October 2026: "match the iphone in design"): Connect apps;
 * the time zone the agents keep, set automatically or chosen; Appearance and
 * Language; Privacy Policy, Terms of Service and About; Sign Out (asked
 * first); the mark and the version. The account, Wallet, Permissions, the
 * computer and updates have pages of their own in the list on the left.
 */
struct SettingsGeneralPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings
  @Environment(MacSession.self) private var session
  @State private var model = GeneralSettingsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      SettingsGroup(look: look) {
        ConnectAppsSettingsRow(look: look) { settings.openConnectors() }
      }
      TimeZoneGroup(model: model, look: look)
      AppearanceGroup(look: look)
      SettingsGroup(look: look) {
        SettingsLinkRow(label: String(localized: "Privacy Policy"), external: true, look: look) { NSWorkspace.shared.open(SettingsLegal.privacy) }
        SettingsLinkRow(label: String(localized: "Terms of Service"), divided: true, external: true, look: look) { NSWorkspace.shared.open(SettingsLegal.terms) }
        SettingsLinkRow(label: String(localized: "About Simeon"), divided: true, look: look) { settings.page = .about }
      }
      SettingsGroup(look: look) {
        // Asked first (`AccountMenu.signOut…`), as the menu's Log out. Delete Account is on the Account page.
        SettingsActionRow(title: String(localized: "Sign Out"), destructive: true, look: look) { AccountActions.askToSignOut(session: session, settings: settings) }
      }
      SettingsMark(look: look)
    }
    .task { await model.load(store: store) }
  }
}

/** Where the legal pages are: the iPhone's and the web app's sign-in link to the same two. */
enum SettingsLegal {
  static let privacy = URL(string: "https://www.simeonlabs.com/legal/privacy-policy")!
  static let terms = URL(string: "https://www.simeonlabs.com/legal/terms-of-service")!
}

/** The app's version, as the About card reads it. */
enum SettingsVersion {
  static var current: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
}

/**
 * Connect apps as the sidebar has it (Sidebar.swift `ConnectApps`), and the
 * iPhone's Settings row after it: the words in the window's blue, medium,
 * then Gmail, Calendar and Drive on three white tiles, the first turned 7°
 * left, the last 7° right; the chevron at the end. Opens Connectors.
 */
private struct ConnectAppsSettingsRow: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Text("Connect apps")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(hovering ? look.blueHover : look.blue)
          .fixedSize()
        HStack(spacing: -4) {
          tile("Connectors/gmail", turn: -7)
          tile("Connectors/google-calendar", turn: 0)
          tile("Connectors/google-drive", turn: 7)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(look.inkTertiary)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 9)
      .frame(minHeight: 44)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel("Connect apps")
  }

  private func tile(_ image: String, turn: Double) -> some View {
    Image(image)
      .resizable()
      .interpolation(.high)
      .aspectRatio(contentMode: .fit)
      .frame(width: 16)
      .frame(width: 26, height: 26)
      .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(look.tile))
      .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).inset(by: -0.5).stroke(look.tileHairline, lineWidth: 1))
      .shadow(color: look.tileShadow, radius: 1, x: 0, y: 1)
      .rotationEffect(.degrees(turn))
  }
}

/**
 * The time zone the agents' computer keeps (the iPhone's: "Set Time Zone
 * Automatically", then the zone): automatic follows this Mac's; turned off,
 * it keeps this Mac's until another is chosen in the menu of every zone,
 * each with the time there now.
 */
private struct TimeZoneGroup: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var spot = WindowSpot()

  var body: some View {
    let automatic = model.zoneOverride == nil
    SettingsGroup(look: look) {
      SettingsSwitch(label: String(localized: "Set Time Zone Automatically"),
                     isOn: Binding(get: { automatic }, set: { on in model.setZone(on ? nil : model.detectedZone, store: store) }),
                     disabled: model.zonePending, look: look)
      SettingsLine(label: String(localized: "Time Zone"), divided: true, look: look) {
        if automatic {
          Text(TimeZoneChoices.label(model.detectedZone))
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
        } else {
          Button { zoneMenu(under: spot.frame) } label: {
            HStack(spacing: 5) {
              Text(TimeZoneChoices.label(model.zoneOverride ?? model.detectedZone))
                .font(.system(size: 13))
                .foregroundStyle(look.inkSecondary)
                .lineLimit(1)
              Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(look.inkTertiary)
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(.hand)
          .disabled(model.zonePending)
          .background(WindowSpotReader(spot: spot))
          .accessibilityLabel("Time Zone")
        }
      }
    }
  }

  /** Every zone, each with the time there now in grey, the chosen one ticked and under the pointer. */
  private func zoneMenu(under frame: CGRect) {
    let known = TimeZone.knownTimeZoneIdentifiers.sorted()
    let values = TimeZoneChoices.values(override: model.zoneOverride, known: known).filter { $0 != TimeZoneChoices.automatic }
    let current = model.zoneOverride ?? model.detectedZone
    let menu = NSMenu(title: String(localized: "Time Zone"))
    menu.autoenablesItems = false
    menu.minimumWidth = 360
    let grey = NSColor(look.inkTertiary)
    let times = TimeZoneChoices.timesNow(in: values)
    var selected: NSMenuItem?
    for (value, time) in zip(values, times) {
      let title = TimeZoneChoices.label(value)
      let item = BlockMenuItem(title) {
        guard value != current else { return }
        model.setZone(value, store: store)
      }
      let words = NSMutableAttributedString(string: title, attributes: [.font: NSFont.menuFont(ofSize: 13)])
      if !time.isEmpty {
        words.append(NSAttributedString(string: "   " + time, attributes: [.font: NSFont.menuFont(ofSize: 13), .foregroundColor: grey]))
      }
      item.attributedTitle = words
      item.state = value == current ? .on : .off
      if value == current { selected = item }
      menu.addItem(item)
    }
    RoutineMenus.popUp(menu, under: frame, over: selected)
  }
}

/**
 * Appearance (System, Light or Dark, the whole app at once: `MacTheme`, as
 * ⌘K's and "/"'s) and Language (System, or a language the app is in, each in
 * its own name; a change waits for a relaunch, with the row that does it).
 */
private struct AppearanceGroup: View {
  let look: Look
  @AppStorage(MacTheme.key) private var theme = "system"
  @State private var chosen = MacLanguage.chosen

  var body: some View {
    let waiting = chosen != MacLanguage.atLaunch
    SettingsGroup(footer: waiting ? String(localized: "Relaunch Simeon to use it.") : nil, look: look) {
      SettingsMenu(label: String(localized: "Appearance"),
                   options: [(value: "system", label: String(localized: "System")), (value: "light", label: String(localized: "Light")), (value: "dark", label: String(localized: "Dark"))],
                   value: ["light", "dark"].contains(theme) ? theme : "system", look: look) { MacTheme.set($0) }
      SettingsMenu(label: String(localized: "Language"), divided: true, options: MacLanguage.options, value: chosen, look: look) { value in
        MacLanguage.choose(value)
        chosen = value
      }
      if waiting {
        SettingsActionRow(title: String(localized: "Relaunch"), divided: true, look: look) { MacLanguage.relaunch() }
      }
    }
  }
}

/** The SimeonLabs mark, "Simeon" and the version under the groups, as the foot of the iPhone's Settings. */
private struct SettingsMark: View {
  let look: Look

  var body: some View {
    VStack(spacing: 8) {
      Image(nsImage: NSApp.applicationIconImage)
        .resizable()
        .interpolation(.high)
        .frame(width: 36, height: 36)
      Text(SettingsVersion.current)
        .font(.system(size: 12))
        .foregroundStyle(look.inkTertiary)
        .monospacedDigit()
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 4)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Simeon, version \(SettingsVersion.current)")
  }
}

/** The app's language on the Mac: chosen in Settings › General, kept as the app's own `AppleLanguages`. */
enum MacLanguage {
  /** What the picker shows chosen: the app's own language, or System (`AppLanguage.chosen`, as the iPhone's). */
  static var chosen: String { AppLanguage.chosen() }

  /** The choice the app was opened with: a different one waits for a relaunch. */
  static let atLaunch = chosen

  /** System, then each language the app is in, in its own name (English, Français, …). */
  static var options: [(value: String, label: String)] { AppLanguage.choices(Bundle.main.localizations) }

  static func choose(_ value: String) { AppLanguage.choose(value) }

  /** Opens Simeon again and quits this one, as Move to Applications does (`MacServices`). */
  static func relaunch() {
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: configuration) { _, _ in
      Task { @MainActor in NSApp.terminate(nil) }
    }
  }
}

// MARK: - Account

/**
 * The account (the iPhone's Account page): the face and the name over the
 * groups; Name, Email (copied with a click) and Password (set or changed
 * here, typed twice); Delete Account with its line under it; Sign Out.
 */
struct SettingsAccountPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(MacSession.self) private var session
  @Environment(SettingsState.self) private var settings
  @State private var copied = false
  @State private var deleting = false
  @State private var changingPassword = false

  var body: some View {
    let account = store.account
    let display = AccountDisplay(displayName: account?.name, email: account?.email)
    VStack(alignment: .leading, spacing: 24) {
      SettingsHead {
        SettingsAccountFace(size: 72, look: look)
        Text(display.title)
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(look.ink)
      }
      SettingsGroup(look: look) {
        SettingsLine(label: String(localized: "Name"), look: look) {
          Text(account?.name ?? "")
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
        }
        if let mail = account?.email, !mail.isEmpty {
          Button { copy(mail) } label: {
            SettingsLine(label: String(localized: "Email"), divided: true, look: look) {
              HStack(spacing: 8) {
                Text(mail)
                  .font(.system(size: 13))
                  .foregroundStyle(look.inkSecondary)
                  .lineLimit(1)
                  .truncationMode(.middle)
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                  .font(.system(size: 11))
                  .foregroundStyle(look.inkSecondary)
              }
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(.hand)
          .accessibilityHint("Copies the email")
        }
        SettingsLinkRow(label: String(localized: "Password"), divided: true, look: look) { changingPassword.toggle() }
        if changingPassword {
          PasswordForm(look: look) { changingPassword = false }
        }
      }
      SettingsGroup(footer: AccountMenu.deleteFooter, look: look) {
        SettingsActionRow(title: AccountMenu.deleteAccount, destructive: true, busy: deleting, look: look) {
          AccountActions.askToDeleteAccount(session: session, settings: settings) { deleting = $0 }
        }
      }
      SettingsGroup(look: look) {
        SettingsActionRow(title: String(localized: "Sign Out"), destructive: true, look: look) { AccountActions.askToSignOut(session: session, settings: settings) }
      }
    }
  }

  private func copy(_ mail: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(mail, forType: .string)
    copied = true
    Task {
      try? await Task.sleep(nanoseconds: 1_200_000_000)
      copied = false
    }
  }
}

/**
 * The password (the iPhone's Password page, in its row): typed twice, at
 * least eight characters; Set Password, or Change Password once there is
 * one. A refusal or a mismatch in red under the fields.
 */
private struct PasswordForm: View {
  let look: Look
  let done: () -> Void
  @Environment(AppStore.self) private var store
  @State private var hasPassword: Bool?
  @State private var password = ""
  @State private var again = ""
  @State private var saving = false
  @State private var problem: String?

  private var mismatch: Bool { !again.isEmpty && again != password }
  private var ready: Bool { password.count >= EmailSignIn.minimumPassword && again == password }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      field(hasPassword == true ? String(localized: "New password") : String(localized: "Password"), text: $password)
      field(String(localized: "Type it again"), text: $again)
      Text(problem ?? (mismatch ? String(localized: "The two don't match.") : String(localized: "At least \(EmailSignIn.minimumPassword) characters. You'll sign in with \(store.account?.email ?? "your email") and this password.")))
        .font(.system(size: 12))
        .foregroundStyle(problem != nil || mismatch ? look.danger : look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Spacer(minLength: 0)
        if saving { ProgressView().controlSize(.small) }
        SettingsPill(title: hasPassword == true ? String(localized: "Change Password") : String(localized: "Set Password"), primary: true, disabled: !ready || saving, look: look, action: save)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .overlay(alignment: .top) { SettingsDivider(look: look) }
    .task { hasPassword = await store.hasPassword() }
  }

  private func field(_ prompt: String, text: Binding<String>) -> some View {
    SecureField(prompt, text: text)
      .textFieldStyle(.plain)
      .font(.system(size: 13))
      .padding(.horizontal, 10)
      .frame(height: 30)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.groupedGround))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
      .onSubmit(save)
  }

  private func save() {
    guard ready, !saving else { return }
    saving = true
    problem = nil
    Task {
      let refused = await store.setPassword(password)
      saving = false
      if let refused { problem = refused } else { done() }
    }
  }
}

// MARK: - Permissions

/**
 * Permissions (the iPhone's: "bring auto review and auto review rules
 * there"): Auto-review, with the line saying what it does; its rules by
 * list, Allow automatically then Ask first, each editable in its row and
 * deletable at once; then a new rule, "When Simeon wants to:" and "It
 * should:", Add Rule. Twenty rules a list and a thousand characters a rule
 * (`AutoReviewInstructions`). A change is shown once the computer has it.
 */
struct SettingsPermissionsPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model = GeneralSettingsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      SettingsGroup(look: look) {
        SettingsSwitch(label: String(localized: "Auto-review"),
                       detail: String(localized: "Simeon checks each action before it runs and asks you first when needed."),
                       isOn: Binding(get: { model.rules.isEnabled }, set: { @MainActor on in model.setReviewing(on, store: store) }),
                       disabled: model.rulesPending, look: look)
      }
      if model.rules.isEnabled {
        Text("Write one short, natural-language rule for each action. \"Ask first\" takes priority if rules conflict.")
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 14)
        ForEach(AutoReviewInstructions.Behavior.allCases, id: \.self) { behavior in
          let listed = model.rules.rules.filter { $0.behavior == behavior }
          if !listed.isEmpty {
            SettingsGroup(title: AutoReviewInstructions.label(behavior), look: look) {
              ForEach(Array(listed.enumerated()), id: \.element) { index, rule in
                RuleLine(rule: rule, divided: index > 0, model: model, look: look)
              }
            }
          }
        }
        NewRuleGroup(model: model, look: look)
      }
    }
    .task { await model.load(store: store) }
  }
}

/** A rule's row: its words; Edit and Delete under the pointer. Edited, the row holds its words and its list, Cancel and Save Rule. */
private struct RuleLine: View {
  let rule: AutoReviewInstructions.Rule
  let divided: Bool
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var hovering = false

  var body: some View {
    if let editing = model.editing, editing.rule == rule {
      VStack(alignment: .leading, spacing: 10) {
        RuleField(text: Binding(get: { model.editing?.text ?? "" }, set: { @MainActor in model.editing?.text = AutoReviewInstructions.clip($0) }),
                  prompt: String(localized: "Action"), look: look)
        HStack(spacing: 8) {
          BehaviorMenu(value: editing.behavior, look: look) { @MainActor in model.editing?.behavior = $0 }
          Spacer(minLength: 0)
          if editing.behavior != rule.behavior && AutoReviewInstructions.isFull(model.rules.list(editing.behavior)) {
            Text(AutoReviewInstructions.limitNote).font(.system(size: 11)).foregroundStyle(look.link)
          }
          SettingsPill(title: String(localized: "Cancel"), look: look) { model.editing = nil }
          SettingsPill(title: String(localized: "Save Rule"), primary: true, disabled: !model.canSave, look: look) { model.save(store: store) }
        }
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
    } else {
      SettingsLine(label: rule.text, divided: divided, look: look) {
        HStack(spacing: 4) {
          RuleIcon(systemImage: "square.and.pencil", label: String(localized: "Edit rule"), disabled: model.editing != nil || model.rulesPending, look: look) { model.edit(rule) }
          RuleIcon(systemImage: "trash", label: String(localized: "Delete rule"), disabled: model.rulesPending, look: look) { model.delete(rule, store: store) }
        }
        .opacity(hovering ? 1 : 0)
      }
      .onHover { hovering = $0 }
    }
  }
}

/** A new rule (the iPhone's): "When Simeon wants to:" one short line, "It should:" its list, Add Rule; the note under it. */
private struct NewRuleGroup: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let full = AutoReviewInstructions.isFull(model.rules.list(model.behavior))
    SettingsGroup(title: String(localized: "New Rule"),
                  footer: full ? String(localized: "\(AutoReviewInstructions.label(model.behavior)) is full (\(AutoReviewInstructions.limitNote)).") : String(localized: "These rules apply only to you. Built-in safety checks always apply."),
                  look: look) {
      VStack(alignment: .leading, spacing: 6) {
        Text("When Simeon wants to:").font(.system(size: 12)).foregroundStyle(look.inkSecondary)
        RuleField(text: Binding(get: { model.draft }, set: { @MainActor in model.draft = AutoReviewInstructions.clip($0) }),
                  prompt: String(localized: "e.g. reply to emails for me"), look: look, submit: { model.add(store: store) })
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      SettingsLine(label: String(localized: "It should:"), divided: true, look: look) {
        BehaviorMenu(value: model.behavior, look: look) { model.behavior = $0 }
      }
      SettingsActionRow(title: String(localized: "Add Rule"), divided: true, busy: model.rulesPending, disabled: !model.canAdd, look: look) { model.add(store: store) }
    }
  }
}

/** A rule's words: a field on the ground, a line to four, the iPhone's. */
private struct RuleField: View {
  let text: Binding<String>
  let prompt: String
  let look: Look
  var submit: (() -> Void)? = nil

  var body: some View {
    TextField(prompt, text: text, axis: .vertical)
      .textFieldStyle(.plain)
      .font(.system(size: 13))
      .lineLimit(1...4)
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.groupedGround))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
      .onSubmit { submit?() }
  }
}

/** Allow automatically or Ask first, as a menu reading "value ⌃⌄". */
private struct BehaviorMenu: View {
  let value: AutoReviewInstructions.Behavior
  let look: Look
  let pick: (AutoReviewInstructions.Behavior) -> Void

  var body: some View {
    Menu {
      ForEach(AutoReviewInstructions.Behavior.allCases, id: \.self) { behavior in
        Toggle(AutoReviewInstructions.label(behavior), isOn: Binding(get: { behavior == value }, set: { _ in pick(behavior) }))
      }
    } label: {
      HStack(spacing: 5) {
        Text(AutoReviewInstructions.label(value)).font(.system(size: 13)).foregroundStyle(look.inkSecondary)
        Image(systemName: "chevron.up.chevron.down").font(.system(size: 9, weight: .semibold)).foregroundStyle(look.inkTertiary)
      }
      .contentShape(Rectangle())
    }
    .menuStyle(.button)
    .buttonStyle(.borderless)
    .menuIndicator(.hidden)
    .fixedSize()
    .handCursor()
    .accessibilityLabel("Rule behavior")
  }
}

private struct RuleIcon: View {
  let systemImage: String
  let label: String
  let disabled: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 11))
        .foregroundStyle(hovering && !disabled ? look.ink : look.inkSecondary)
        .frame(width: 24, height: 24)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering && !disabled ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .onHover { hovering = $0 }
    .accessibilityLabel(label)
  }
}

// MARK: - About

/** About Simeon (the iPhone's About page): the icon, "Simeon", the version, the copyright; Copy Version Info ("Copied" for 1.2 s), the two legal pages. */
struct SettingsAboutPage: View {
  let look: Look
  @State private var copied = false

  var body: some View {
    let version = SettingsVersion.current
    VStack(alignment: .leading, spacing: 24) {
      SettingsHead {
        Image(nsImage: NSApp.applicationIconImage)
          .resizable()
          .interpolation(.high)
          .frame(width: 72, height: 72)
          .accessibilityHidden(true)
        VStack(spacing: 2) {
          Text(AboutSimeon.name).font(.system(size: 22, weight: .semibold)).foregroundStyle(look.ink)
          if !version.isEmpty {
            Text(AboutSimeon.versionLine(version)).font(.system(size: 13)).foregroundStyle(look.inkSecondary).monospacedDigit()
          }
        }
        Text(AboutSimeon.copyright).font(.system(size: 12)).foregroundStyle(look.inkTertiary)
      }
      SettingsGroup(look: look) {
        Button {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(AboutSimeon.versionInfo(version: version), forType: .string)
          copied = true
          Task {
            try? await Task.sleep(nanoseconds: UInt64(AboutSimeon.copiedSeconds * 1_000_000_000))
            copied = false
          }
        } label: {
          SettingsLine(label: copied ? AboutSimeon.copied : String(localized: "Copy Version Info"), look: look) {
            Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 12)).foregroundStyle(look.inkSecondary)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .disabled(version.isEmpty)
      }
      SettingsGroup(look: look) {
        SettingsLinkRow(label: String(localized: "Privacy Policy"), external: true, look: look) { NSWorkspace.shared.open(SettingsLegal.privacy) }
        SettingsLinkRow(label: String(localized: "Terms of Service"), divided: true, external: true, look: look) { NSWorkspace.shared.open(SettingsLegal.terms) }
      }
    }
  }
}

// MARK: - The values the computer keeps

/**
 * General's values as the computer keeps them: the time zone chosen, how
 * the agent may use this Mac and the team's ceiling, Auto-review and its
 * rules, and the rule being written or edited. Each page that shows some of
 * them holds its own, read when the page shows.
 */
@MainActor
@Observable
final class GeneralSettingsModel {
  /** The zone this Mac is in, and the one chosen instead (nil: this Mac's). */
  let detectedZone = TimeZone.current.identifier
  var zoneOverride: String?
  var zonePending = false

  var permission: LocalToolPermission = LocalToolSettings().effective
  var ceiling: LocalToolPermission? = LocalToolSettings().ceiling
  var permissionPending = false

  var rules = AutoReviewInstructions()
  var rulesPending = false
  /** The rule being written, and which list it goes to. */
  var draft = ""
  var behavior: AutoReviewInstructions.Behavior = .allow

  /** A rule being edited in its row: the rule as stored, and its words and list as changed. */
  struct Editing: Equatable {
    var rule: AutoReviewInstructions.Rule
    var text: String
    var behavior: AutoReviewInstructions.Behavior
  }
  var editing: Editing?

  private let localTools = LocalToolSettings()

  /** The page shown (`getTimeZone`, `getLocalToolPermission`, its ceiling, `getAutoReviewInstructions`). */
  func load(store: AppStore) async {
    // The same key as at sign-in (MacServices: lower case), or another account's would be taken and the choice wiped.
    if let email = store.account?.email, !email.isEmpty { localTools.scope(to: email.lowercased()) }
    permission = localTools.effective
    if let settings = await store.readHostSettings() {
      zoneOverride = TimeZoneChoices.override(hostSettings: settings)
      rules = AutoReviewInstructions.normalized(json: settings["autoReviewInstructions"])
    }
    if let team = await store.teamAdminSettings() {
      let ceiling = LocalToolPermission.ceiling(teamAdminSettings: team)
      localTools.ceiling = ceiling
      self.ceiling = ceiling
      permission = localTools.effective
      MacLocalPermission.shared.took(ceiling: ceiling)
    }
  }

  func setZone(_ zone: String?, store: AppStore) {
    zonePending = true
    Task {
      if await store.setTimeZone(zone, detected: detectedZone) { zoneOverride = zone }
      zonePending = false
    }
  }

  /** Execution on Local Computer: kept here, then given to the computer until it says it back. */
  func setPermission(_ next: LocalToolPermission, store: AppStore) {
    guard !next.isAbove(ceiling) else { return }
    permissionPending = true
    Task {
      localTools.choice = next
      let effective = localTools.effective
      _ = await store.pushHostSetting("localToolPermission", .string(effective.rawValue))
      permission = effective
      permissionPending = false
    }
  }

  // MARK: Auto-review

  /** One write of both lists and the switch; shown once the computer has them. */
  private func write(_ next: AutoReviewInstructions, store: AppStore, then done: @escaping () -> Void = {}) {
    rulesPending = true
    Task {
      if await store.setAutoReview(next) {
        rules = AutoReviewInstructions.normalized(json: next.json)
        // The rule being edited, found again in the new lists, or the edit over.
        if let editing { self.editing = rules.relocate(editing.rule).map { Editing(rule: $0, text: editing.text, behavior: editing.behavior) } }
        done()
      }
      rulesPending = false
    }
  }

  func setReviewing(_ on: Bool, store: AppStore) {
    var next = rules
    next.isEnabled = on
    write(next, store: store)
  }

  /** Add Rule may be pressed: words, room in the list, not there already, no edit under way, nothing on its way. */
  var canAdd: Bool {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return !text.isEmpty && editing == nil && !rulesPending && rules.saving(text, as: behavior, editing: nil) != nil
  }

  func add(store: AppStore) {
    guard canAdd, let next = rules.saving(draft.trimmingCharacters(in: .whitespacesAndNewlines), as: behavior, editing: nil) else { return }
    write(next, store: store) { [weak self] in
      self?.draft = ""
      self?.behavior = .allow
    }
  }

  func delete(_ rule: AutoReviewInstructions.Rule, store: AppStore) {
    if editing?.rule == rule { editing = nil }
    write(rules.removing(rule), store: store)
  }

  func edit(_ rule: AutoReviewInstructions.Rule) {
    guard editing == nil, !rulesPending else { return }
    editing = Editing(rule: rule, text: rule.text, behavior: rule.behavior)
  }

  var canSave: Bool {
    guard let editing, !rulesPending else { return false }
    let text = editing.text.trimmingCharacters(in: .whitespacesAndNewlines)
    return !text.isEmpty && rules.saving(text, as: editing.behavior, editing: editing.rule) != nil
  }

  func save(store: AppStore) {
    guard canSave, let editing, let next = rules.saving(editing.text.trimmingCharacters(in: .whitespacesAndNewlines), as: editing.behavior, editing: editing.rule) else { return }
    write(next, store: store) { [weak self] in self?.editing = nil }
  }
}

/** The security key switch as this Mac keeps it, on by default; the computer is told it on each connect too (MacServices). */
enum SecurityKeySetting {
  static let key = "simeon.webauthnProxyEnabled"

  static var enabled: Bool { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
}
