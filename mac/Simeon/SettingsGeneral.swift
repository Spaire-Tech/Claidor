import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * Settings › General, laid out as the founder's reference (21 October
 * 2026): the account first (Simeon Account; its page under General),
 * Language, Appearance (Mode: the sun, the moon, the screen), and
 * the time zone the agents keep. Connect apps and About are the sidebar's,
 * not here again ("why do we have dup of stuff").
 */
struct SettingsGeneralPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings
  @State private var model = GeneralSettingsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      SettingsGroup(look: look) {
        AccountRow(look: look) { settings.page = .account }
      }
      LanguageGroup(look: look)
      AppearanceGroup(look: look)
      TimeZoneGroup(model: model, look: look)
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
 * The account's row, as the founder's reference names its maker's account
 * (22 October 2026: "do like them for meta account instead of showing the
 * email"): the Simeon mark (16, grey), "Simeon Account" over what its page holds, the
 * chevron; its page under General, where the name and email are.
 */
private struct AccountRow: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 14) {
        // As the reference's logo sits by its words: 16, in the line's grey (22 in the text colour was too big and too dark).
        Image("SignIn/Mark")
          .resizable()
          .renderingMode(.template)
          .interpolation(.high)
          .scaledToFit()
          .frame(width: 16, height: 16)
          .foregroundStyle(look.inkSecondary)
          .frame(width: 28)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 3) {
          Text("Simeon Account")
            .font(PanelType.row)
            .foregroundStyle(look.ink)
            .lineLimit(1)
          Text("Name, email and password")
            .font(PanelType.detail)
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(look.inkTertiary)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, SettingsRowSize.vertical)
      .frame(minHeight: 64)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityElement(children: .combine)
  }
}

/**
 * The time zone the agents' computer keeps: "Set Automatically" follows
 * this Mac's; turned off, it keeps this Mac's until another is chosen in the
 * menu of every zone, each with the time there now.
 */
private struct TimeZoneGroup: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var spot = WindowSpot()

  var body: some View {
    let automatic = model.zoneOverride == nil
    SettingsGroup(title: String(localized: "Time Zone"), footer: String(localized: "Your agents keep this time zone for routines and reminders."), look: look) {
      SettingsSwitch(label: String(localized: "Set Time Zone Automatically"),
                     isOn: Binding(get: { automatic }, set: { on in model.setZone(on ? nil : model.detectedZone, store: store) }),
                     disabled: model.zonePending, look: look)
      SettingsLine(label: String(localized: "Time Zone"), divided: true, look: look) {
        if automatic {
          Text(TimeZoneChoices.label(model.detectedZone))
            .font(PanelType.row)
            .foregroundStyle(look.inkSecondary)
        } else {
          Button { zoneMenu(under: spot.frame) } label: {
            SettingsMenuLabel(text: TimeZoneChoices.label(model.zoneOverride ?? model.detectedZone), look: look)
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

/** Language (System, or a language the app is in, each in its own name); a change waits for a relaunch, with the row that does it. */
private struct LanguageGroup: View {
  let look: Look
  @State private var chosen = MacLanguage.chosen

  var body: some View {
    let waiting = chosen != MacLanguage.atLaunch
    SettingsGroup(footer: waiting ? String(localized: "Relaunch Simeon to use it.") : nil, look: look) {
      SettingsMenu(label: String(localized: "Language"), options: MacLanguage.options, value: chosen, look: look) { value in
        MacLanguage.choose(value)
        chosen = value
      }
      if waiting {
        SettingsActionRow(title: String(localized: "Relaunch"), divided: true, look: look) { MacLanguage.relaunch() }
      }
    }
  }
}

/** Appearance, the reference's Mode: Light, Dark or System as the sun, the moon and the screen, the whole app at once (`MacTheme`, as ⌘K's and "/"'s). */
private struct AppearanceGroup: View {
  let look: Look
  @AppStorage(MacTheme.key) private var theme = "system"

  var body: some View {
    SettingsGroup(title: String(localized: "Appearance"), look: look) {
      SettingsLine(label: String(localized: "Mode"), look: look) {
        SettingsSymbolPicker(options: [(value: "light", symbol: "sun.max", label: String(localized: "Light")),
                                       (value: "dark", symbol: "moon", label: String(localized: "Dark")),
                                       (value: "system", symbol: "display", label: String(localized: "System"))],
                             value: ["light", "dark"].contains(theme) ? theme : "system", look: look) { MacTheme.set($0) }
      }
    }
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
 * The account, under General: its face (56) beside its name and email, from
 * the left; Name, written in place (what the agents call the person, the
 * name the first run asked for; 22 October 2026), then Email (copied with a
 * click) and Password (set or changed here, typed twice). No Delete Account
 * on the Mac (the founder, 21 October 2026); Log out is at the foot of the
 * list of pages.
 */
struct SettingsAccountPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var copied = false
  @State private var changingPassword = false
  /** Why the name was not saved, under its card in red. */
  @State private var nameProblem: String?

  var body: some View {
    let account = store.account
    let display = AccountDisplay(displayName: account?.name, email: account?.email)
    VStack(alignment: .leading, spacing: 22) {
      HStack(spacing: 16) {
        SettingsAccountFace(size: 44, look: look)
        VStack(alignment: .leading, spacing: 3) {
          Text(display.title)
            .font(PanelType.section)
            .foregroundStyle(look.ink)
            .lineLimit(1)
          if let mail = display.secondary {
            Text(mail)
              .font(PanelType.detail)
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
          }
        }
      }
      SettingsGroup(footer: nameProblem ?? String(localized: "Your agents call you by this name."),
                    footerTint: nameProblem == nil ? nil : look.danger, look: look) {
        NameLine(look: look) { nameProblem = $0 }
      }
      SettingsGroup(look: look) {
        if let mail = account?.email, !mail.isEmpty {
          Button { copy(mail) } label: {
            SettingsLine(label: String(localized: "Email"), look: look) {
              HStack(spacing: 8) {
                Text(mail)
                  .font(PanelType.row)
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
        SettingsLinkRow(label: String(localized: "Password"), divided: !(account?.email ?? "").isEmpty, look: look) { changingPassword.toggle() }
        if changingPassword {
          PasswordForm(look: look) { changingPassword = false }
        }
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
 * Name, written in its row (the founder, 22 October 2026: "theres name
 * there, but uneditable"): a field at the row's end, saved on Return or
 * when it lets go of the keys, when it changed (`AppStore.changeName`); a
 * spinner while it goes. Refused, the name comes back and why is said
 * under the card.
 */
private struct NameLine: View {
  let look: Look
  let problem: (String?) -> Void
  @Environment(AppStore.self) private var store
  @State private var text = ""
  @State private var saving = false
  @FocusState private var focused: Bool

  var body: some View {
    let saved = store.account?.name ?? ""
    SettingsLine(label: String(localized: "Name"), look: look) {
      HStack(spacing: 8) {
        if saving { ProgressView().controlSize(.small) }
        TextField("", text: $text)
          .textFieldStyle(.plain)
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .focused($focused)
          .onSubmit(save)
          .disabled(saving)
          .padding(.horizontal, 10)
          .frame(width: 240, height: 30)
          .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.groupedGround))
          .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(focused ? 0.25 : 0.1), lineWidth: 1))
          .accessibilityLabel(String(localized: "Name"))
      }
    }
    .onAppear { text = saved }
    .onChange(of: saved) { _, now in if !focused && !saving { text = now } }
    .onChange(of: focused) { _, now in if !now { save() } }
  }

  private func save() {
    let saved = store.account?.name ?? ""
    let typed = Onboarding.normalizedName(text)
    guard !saving else { return }
    // Nothing new, or nothing at all: the name stays as it was.
    guard !typed.isEmpty, typed != saved else {
      text = saved
      return
    }
    saving = true
    problem(nil)
    Task {
      let refused = await store.changeName(typed)
      saving = false
      text = store.account?.name ?? saved
      problem(refused)
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
        .font(PanelType.detail)
        .foregroundStyle(problem != nil || mismatch ? look.danger : look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Spacer(minLength: 0)
        if saving { ProgressView().controlSize(.small) }
        SettingsPill(title: hasPassword == true ? String(localized: "Change Password") : String(localized: "Set Password"), primary: true, disabled: !ready || saving, look: look, action: save)
      }
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, SettingsRowSize.vertical)
    .overlay(alignment: .top) { SettingsDivider(look: look) }
    .task { hasPassword = await store.hasPassword() }
  }

  private func field(_ prompt: String, text: Binding<String>) -> some View {
    SecureField(prompt, text: text)
      .textFieldStyle(.plain)
      .font(PanelType.row)
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
 * there"; the founder, 22 October 2026: "absolutely ugly and not easy to
 * understand"). Auto-review and what it does; on, its two lists as two
 * cards, each saying what it means under it: Allow automatically (done
 * without asking) and Ask first (asked about first). A list's rules are
 * its rows, edited in their row and deleted at once; its last row adds one
 * to it, typed there. Twenty rules a list and a thousand characters a rule
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
                       symbol: "checkmark.shield",
                       isOn: Binding(get: { model.rules.isEnabled }, set: { @MainActor on in model.setReviewing(on, store: store) }),
                       disabled: model.rulesPending, look: look)
      }
      if model.rules.isEnabled {
        RuleList(behavior: .allow, model: model, look: look)
        RuleList(behavior: .ask, model: model, look: look)
      }
    }
    .task { await model.load(store: store) }
  }
}

/** One list (Allow automatically, Ask first): its rules, then the row that adds one; what the list means under it. */
private struct RuleList: View {
  let behavior: AutoReviewInstructions.Behavior
  @Bindable var model: GeneralSettingsModel
  let look: Look

  var body: some View {
    let listed = model.rules.rules.filter { $0.behavior == behavior }
    SettingsGroup(title: AutoReviewInstructions.label(behavior),
                  footer: behavior == .allow ? String(localized: "Simeon does these without asking you.")
                                             : String(localized: "Simeon asks you before doing these. When two rules disagree, it asks."),
                  look: look) {
      ForEach(Array(listed.enumerated()), id: \.element) { index, rule in
        RuleLine(rule: rule, divided: index > 0, model: model, look: look)
      }
      NewRuleLine(behavior: behavior, divided: !listed.isEmpty, model: model, look: look)
    }
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
          BehaviorMenu(value: editing.behavior, look: look) { model.editing?.behavior = $0 }
          Spacer(minLength: 0)
          if editing.behavior != rule.behavior && AutoReviewInstructions.isFull(model.rules.list(editing.behavior)) {
            Text(AutoReviewInstructions.limitNote).font(.system(size: 11)).foregroundStyle(look.link)
          }
          SettingsPill(title: String(localized: "Cancel"), look: look) { model.editing = nil }
          SettingsPill(title: String(localized: "Save Rule"), primary: true, disabled: !model.canSave, look: look) { model.save(store: store) }
        }
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, SettingsRowSize.vertical)
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

/**
 * A list's last row: a rule typed straight into it ("e.g. read my
 * calendar"), the plus before it, Add at its end (or Return); a full list
 * says so instead.
 */
private struct NewRuleLine: View {
  let behavior: AutoReviewInstructions.Behavior
  let divided: Bool
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let full = AutoReviewInstructions.isFull(model.rules.list(behavior))
    HStack(spacing: 12) {
      Image(systemName: "plus.circle.fill")
        .font(.system(size: 15))
        .foregroundStyle(full ? look.inkTertiary : look.settingsAction)
        .frame(width: 20)
        .accessibilityHidden(true)
      if full {
        Text(AutoReviewInstructions.limitNote)
          .font(PanelType.row)
          .foregroundStyle(look.inkSecondary)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        TextField("", text: Binding(get: { model.drafts[behavior] ?? "" }, set: { @MainActor in model.drafts[behavior] = AutoReviewInstructions.clip($0) }),
                  prompt: Text(behavior == .allow ? String(localized: "e.g. read my calendar") : String(localized: "e.g. reply to emails for me"))
                    .foregroundStyle(look.inkTertiary),
                  axis: .vertical)
          .textFieldStyle(.plain)
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .lineLimit(1...4)
          .onSubmit { model.add(behavior, store: store) }
          .accessibilityLabel(String(localized: "Add Rule"))
          .frame(maxWidth: .infinity, alignment: .leading)
        if model.rulesPending && !(model.drafts[behavior] ?? "").isEmpty {
          ProgressView().controlSize(.small)
        }
        SettingsPill(title: String(localized: "Add"), disabled: !model.canAdd(behavior), look: look) { model.add(behavior, store: store) }
      }
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, SettingsRowSize.vertical)
    .frame(minHeight: SettingsRowSize.minHeight)
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
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
      .font(PanelType.row)
      .lineLimit(1...4)
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.groupedGround))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
      .onSubmit { submit?() }
  }
}

/** Allow automatically or Ask first, as a menu reading "value ⌄". */
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
      SettingsMenuLabel(text: AutoReviewInstructions.label(value), look: look)
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
        .font(.system(size: 12))
        .foregroundStyle(hovering && !disabled ? look.ink : look.inkSecondary)
        .frame(width: 28, height: 28)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering && !disabled ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .onHover { hovering = $0 }
    .accessibilityLabel(label)
  }
}

// MARK: - Help & support

/**
 * Help & support (the founder, 22 October 2026, with another app's for
 * reference: "leave it there even tho it doesn't point to anything yet"):
 * the Help Center on the web and Submit feedback in one card, Report an
 * issue with its bug in the next. Each goes through `HelpSupport`, where
 * they are to be pointed somewhere.
 */
struct SettingsHelpPage: View {
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      SettingsGroup(look: look) {
        SettingsLinkRow(label: String(localized: "Simeon Help Center"), external: true, look: look) { HelpSupport.openHelpCenter() }
        SettingsLinkRow(label: String(localized: "Submit feedback"), divided: true, look: look) { HelpSupport.submitFeedback() }
      }
      SettingsGroup(look: look) {
        SettingsLinkRow(label: String(localized: "Report an issue"), trailingSymbol: "ladybug", look: look) { HelpSupport.reportIssue() }
      }
    }
  }
}

/**
 * Where Help & support's rows and the account menu's Report an issue go. Not
 * pointed anywhere yet (the founder, 22 October 2026: "i'll take care of
 * it"): each does nothing until it is.
 */
enum HelpSupport {
  static func openHelpCenter() {}
  static func submitFeedback() {}
  static func reportIssue() {}
}

// MARK: - Legal

/** Legal (the reference's "Legal info"): the Privacy Policy and the Terms of Service on the web, the company under them. */
struct SettingsLegalPage: View {
  let look: Look

  var body: some View {
    SettingsGroup(footer: AboutSimeon.copyright, look: look) {
      SettingsLinkRow(label: String(localized: "Privacy Policy"), external: true, look: look) { NSWorkspace.shared.open(SettingsLegal.privacy) }
      SettingsLinkRow(label: String(localized: "Terms of Service"), divided: true, external: true, look: look) { NSWorkspace.shared.open(SettingsLegal.terms) }
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
  /** The rule being written at the foot of each list. */
  var drafts: [AutoReviewInstructions.Behavior: String] = [:]

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

  /** A list's Add may be pressed: words, room in the list, not there already, no edit under way, nothing on its way. */
  func canAdd(_ behavior: AutoReviewInstructions.Behavior) -> Bool {
    let text = (drafts[behavior] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return !text.isEmpty && editing == nil && !rulesPending && rules.saving(text, as: behavior, editing: nil) != nil
  }

  func add(_ behavior: AutoReviewInstructions.Behavior, store: AppStore) {
    guard canAdd(behavior), let next = rules.saving((drafts[behavior] ?? "").trimmingCharacters(in: .whitespacesAndNewlines), as: behavior, editing: nil) else { return }
    write(next, store: store) { [weak self] in self?.drafts[behavior] = nil }
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
