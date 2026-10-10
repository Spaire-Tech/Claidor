import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * Settings › General (`Sa`), its sections 28 apart: Account (the person,
 * Copy email, Sign Out), Appearance (Theme), Agent (Timezone, Execution on
 * Local Computer, Auto-review and its rules), Security Key. A change is
 * shown once the computer has taken it, its control waiting meanwhile; a
 * refusal leaves the old value and says nothing.
 */
struct SettingsGeneralPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model = GeneralSettingsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 28) {
      SettingsSection(title: "Account", look: look) {
        AccountCard(look: look)
      }
      SettingsSection(title: "Appearance", look: look) {
        ThemeRow(look: look)
      }
      SettingsSection(title: "Agent", look: look) {
        TimezoneRow(model: model, look: look)
        ExecutionRow(model: model, look: look)
        AutoReviewRow(model: model, look: look)
        if model.rules.isEnabled {
          AutoReviewRules(model: model, look: look)
        }
      }
      SettingsSection(title: "Security Key", look: look) {
        SecurityKeyRow(look: look)
      }
    }
    .task { await model.load(store: store) }
  }
}

/**
 * General's values as the computer keeps them: the time zone chosen, how
 * the agent may use this Mac and the team's ceiling, Auto-review and its
 * rules, and the rule being written or edited.
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

  /** General shown (`getTimeZone`, `getLocalToolPermission`, its ceiling, `getAutoReviewInstructions`). */
  func load(store: AppStore) async {
    if let email = store.account?.email, !email.isEmpty { localTools.scope(to: email) }
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

  func clearDraft() {
    draft = ""
    behavior = .allow
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

// MARK: - Account

/**
 * The account card (`Vs`, 72 high): the person's letters in a 44 disc (or
 * their picture), their name over their e-mail and the copy button, and
 * Sign Out, which asks first.
 */
private struct AccountCard: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(MacSession.self) private var session
  @Environment(SettingsState.self) private var settings

  var body: some View {
    let account = store.account
    let display = AccountDisplay(displayName: account?.name, email: account?.email)
    HStack(spacing: 14) {
      ZStack {
        Circle().fill(look.rowHover)
        if let url = account?.pictureURL {
          AsyncImage(url: url) { image in
            image.resizable().aspectRatio(contentMode: .fill)
          } placeholder: {
            initials(account)
          }
        } else {
          initials(account)
        }
      }
      .frame(width: 44, height: 44)
      .clipShape(Circle())
      .overlay(Circle().strokeBorder(look.ink.opacity(0.05), lineWidth: 1))
      VStack(alignment: .leading, spacing: 0) {
        Text(display.title)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
        HStack(spacing: 8) {
          if let mail = display.secondary {
            Text(mail)
              .lineLimit(1)
              .truncationMode(.tail)
            CopyEmailButton(email: mail, look: look)
          } else {
            Text("Signed in")
          }
        }
        .font(.system(size: 13))
        .foregroundStyle(look.inkSecondary)
        .frame(minHeight: 20)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      SettingsButton(title: "Sign Out", look: look) { askToSignOut() }
    }
    .padding(.vertical, 14)
    .padding(.horizontal, 16)
    .frame(minHeight: 72)
  }

  private func initials(_ account: Account?) -> some View {
    Text(account?.initials ?? "?")
      .font(.system(size: 17, weight: .medium))
      .foregroundStyle(look.inkSecondary)
  }

  /** Sign Out's question (`qon`, the account menu's too): "Sign out?", Cancel and Sign out. */
  private func askToSignOut() {
    let alert = NSAlert()
    alert.messageText = "Sign out?"
    alert.informativeText = "You’ll need to sign in again to use Simeon."
    alert.addButton(withTitle: "Sign out")
    alert.addButton(withTitle: "Cancel").keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      settings.close()
      Task { await session.signOut() }
    }
  }
}

/** Copy email address: 20, round 6, the copy glyph; a check for 1.2 s once copied. */
private struct CopyEmailButton: View {
  let email: String
  let look: Look
  @State private var copied = false
  @State private var hovering = false

  var body: some View {
    Button {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(email, forType: .string)
      copied = true
      Task {
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        copied = false
      }
    } label: {
      Image(systemName: copied ? "checkmark" : "doc.on.doc")
        .font(.system(size: 11))
        .foregroundStyle(hovering ? look.ink : look.inkSecondary)
        .frame(width: 20, height: 20)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel("Copy email address")
  }
}

// MARK: - Appearance

/** Theme: Follow System, Light or Dark, the whole app at once (`MacTheme`, as ⌘K's and "/"'s). */
private struct ThemeRow: View {
  let look: Look
  @AppStorage(MacTheme.key) private var theme = "system"

  var body: some View {
    SettingsRow(label: "Theme", look: look) {
      SettingsSelect(label: "Theme", options: [(value: "system", label: "Follow System"), (value: "light", label: "Light"), (value: "dark", label: "Dark")],
                     value: ["light", "dark"].contains(theme) ? theme : "system", look: look) { MacTheme.set($0) }
    }
  }
}

// MARK: - Agent

/** Timezone (`la`): Auto-detect (this Mac's zone) or a zone of the person's, each with the time there now; the zone the agents and routines use. */
private struct TimezoneRow: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let auto = TimeZoneChoices.automatic
    SettingsRow(label: "Timezone", look: look) {
      SettingsSelect(label: "Timezone", options: [(value: auto, label: TimeZoneChoices.automaticLabel(detected: model.detectedZone))],
                     value: model.zoneOverride ?? auto, pending: model.zonePending,
                     shown: TimeZoneChoices.triggerLabel(override: model.zoneOverride, detected: model.detectedZone), look: look,
                     menu: { frame in zoneMenu(under: frame) }) { _ in }
    }
  }

  /** The menu (424 wide): Auto-detect, the chosen zone when it is not a known one, then every zone, each with the time there now in grey. */
  private func zoneMenu(under frame: CGRect) {
    let known = TimeZone.knownTimeZoneIdentifiers.sorted()
    let values = TimeZoneChoices.values(override: model.zoneOverride, known: known)
    let current = model.zoneOverride ?? TimeZoneChoices.automatic
    let menu = NSMenu(title: "Timezone")
    menu.autoenablesItems = false
    menu.minimumWidth = 424
    let grey = NSColor(look.inkTertiary)
    let times = TimeZoneChoices.timesNow(in: values.map { $0 == TimeZoneChoices.automatic ? model.detectedZone : $0 })
    var selected: NSMenuItem?
    for (value, time) in zip(values, times) {
      let isAuto = value == TimeZoneChoices.automatic
      let title = isAuto ? TimeZoneChoices.automaticLabel(detected: model.detectedZone) : TimeZoneChoices.label(value)
      let item = BlockMenuItem(title) {
        guard value != current else { return }
        model.setZone(isAuto ? nil : value, store: store)
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

/** Execution on Local Computer (`da`): Always allow, Ask every time or Never allow; above the team's ceiling greyed, with its line. */
private struct ExecutionRow: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    var hints = [LocalToolPermission.explanation]
    if let ceiling = model.ceiling { hints.append(LocalToolPermission.ceilingLine(ceiling)) }
    return SettingsRow(label: LocalToolPermission.title, hints: hints, divided: true, look: look) {
      SettingsSelect(label: LocalToolPermission.title, options: LocalToolPermission.choices.map { (value: $0, label: $0.label) },
                     disabled: Set(LocalToolPermission.choices.filter { $0.isAbove(model.ceiling) }),
                     value: model.permission, pending: model.permissionPending, look: look) { model.setPermission($0, store: store) }
    }
  }
}

/** Auto-review (`ea`): the switch; off, its rules go from the page. */
private struct AutoReviewRow: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    SettingsRow(label: "Auto-review", hints: ["Simeon checks each action before it runs and asks you first when needed. Add rules to customize what it can do automatically."], divided: true, look: look) {
      Toggle("", isOn: Binding(get: { model.rules.isEnabled }, set: { @MainActor on in model.setReviewing(on, store: store) }))
        .toggleStyle(.switch)
        .labelsHidden()
        .controlSize(.mini)
        .tint(look.paneSwitchOn)
        .disabled(model.rulesPending)
        .accessibilityLabel("Auto-review")
    }
  }
}

/**
 * Auto-review Rules (`Qs`, `Oe`): what Simeon may do by itself and what it
 * asks first about. A rule written (When Simeon wants to:, It should:) and
 * added; the table of rules, allowed ones first, each editable in its row
 * and deletable at once; "These rules apply only to you…" under them.
 */
private struct AutoReviewRules: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Auto-review Rules")
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
        Text("Write one short, natural-language rule for each action. \"Ask first\" takes priority if rules conflict.")
          .font(.system(size: 13))
          .lineSpacing(LineBox.extra(size: 13, lineHeight: 18))
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      VStack(alignment: .leading, spacing: 28) {
        RuleComposer(text: $model.draft, behavior: $model.behavior, label: "Auto-review rule draft", focusOnAppear: false,
                     disabled: model.editing != nil || model.rulesPending,
                     showsLimit: AutoReviewInstructions.isFull(model.rules.list(model.behavior)), look: look,
                     submit: { model.add(store: store) }, cancel: { model.clearDraft() }) {
          SettingsButton(title: "Add Rule", kind: .primary, disabled: !model.canAdd, look: look) { model.add(store: store) }
            .accessibilityLabel("Add rule")
        }
        if !model.rules.rules.isEmpty {
          RulesTable(model: model, look: look)
        }
      }
      Text("These rules apply only to you. Built-in safety checks always apply.")
        .font(.system(size: 13))
        .foregroundStyle(look.inkTertiary)
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 14)
    .overlay(alignment: .top) { SettingsHairline(look: look) }
  }
}

/** A rule's words and list: "When Simeon wants to:" over the field (34 to 72 high, then it scrolls), "It should:" over the list's select and the buttons. */
private struct RuleComposer<Buttons: View>: View {
  @Binding var text: String
  @Binding var behavior: AutoReviewInstructions.Behavior
  let label: String
  let focusOnAppear: Bool
  let disabled: Bool
  let showsLimit: Bool
  let look: Look
  let submit: () -> Void
  let cancel: () -> Void
  @ViewBuilder let buttons: () -> Buttons
  @State private var focused = false
  @State private var height: CGFloat = 19

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      VStack(alignment: .leading, spacing: 4) {
        Text("When Simeon wants to:")
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
        PaneTextArea(text: Binding(get: { text }, set: { @MainActor next in text = AutoReviewInstructions.clip(next) }),
                     focused: $focused, height: $height, ink: NSColor(look.ink), editable: !disabled,
                     fontSize: 13, lineHeight: 19, inset: CGSize(width: 10, height: 6), focusOnAppear: focusOnAppear,
                     onCommandReturn: submit, onCancel: cancel)
          .frame(height: min(72, max(34, height + 14)))
          .overlay(alignment: .topLeading) {
            if text.isEmpty {
              Text("e.g. reply to emails for me")
                .font(.system(size: 13))
                .foregroundStyle(look.inkTertiary)
                .padding(.vertical, 7)
                .padding(.horizontal, 10)
                .allowsHitTesting(false)
            }
          }
          .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .fill(look.dark ? look.fillElevated : Color.white)
              .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.10), lineWidth: 1))
          )
          .opacity(disabled ? 0.5 : 1)
          .accessibilityLabel(label)
      }
      VStack(alignment: .leading, spacing: 4) {
        Text("It should:")
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
        HStack(spacing: 8) {
          SettingsSelect(label: "Rule behavior", options: AutoReviewInstructions.Behavior.allCases.map { (value: $0, label: AutoReviewInstructions.label($0)) },
                         value: behavior, pending: disabled, look: look) { behavior = $0 }
          Spacer(minLength: 0)
          if showsLimit {
            Text(AutoReviewInstructions.limitNote)
              .font(.system(size: 11))
              .foregroundStyle(look.link)
          }
          buttons()
        }
      }
    }
  }
}

/**
 * The rules (`role=table`, round 8, on the raised fill): Action, Behavior
 * and the row's buttons, the columns 1.45 to 1 (Behavior at least 168) and
 * 52; rows 32 high, a faint grey under the pointer; Edit and Delete
 * numbered in the table's order.
 */
private struct RulesTable: View {
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    GeometryReader { box in
      let columns = Self.columns(width: box.size.width - 16)
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 12) {
          Text("Action").frame(width: columns.action, alignment: .leading)
          Text("Behavior").frame(width: columns.behavior, alignment: .leading)
          Color.clear.frame(width: 52)
        }
        .font(.system(size: 12))
        .foregroundStyle(look.inkTertiary)
        .padding(EdgeInsets(top: 12, leading: 6, bottom: 10, trailing: 6))
        Rectangle().fill(look.ink.opacity(0.15)).frame(height: 0.5)
        VStack(spacing: 0) {
          ForEach(Array(model.rules.rules.enumerated()), id: \.element) { index, rule in
            if let editing = model.editing, editing.rule == rule {
              RuleEditorRow(model: model, number: index + 1, look: look)
            } else {
              RuleRow(rule: rule, number: index + 1, columns: columns, model: model, look: look)
            }
          }
        }
        .padding(.top, 6)
      }
      .padding(EdgeInsets(top: 0, leading: 8, bottom: 8, trailing: 8))
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.fillElevated))
      .background(GeometryReader { inner in Color.clear.preference(key: RulesTableHeight.self, value: inner.size.height) })
    }
    .frame(height: tableHeight)
    .onPreferenceChange(RulesTableHeight.self) { tableHeight = $0 }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Auto-review rules")
  }

  @State private var tableHeight: CGFloat = 120

  /** `minmax(0, 1.45fr) minmax(168, 1fr) 52`, 12 apart. */
  static func columns(width: CGFloat) -> (action: CGFloat, behavior: CGFloat) {
    let free = max(0, width - 12 - 52 - 24)
    var behavior = free / 2.45
    if behavior < 168 { behavior = min(168, free) }
    return (max(0, free - behavior), behavior)
  }
}

private struct RulesTableHeight: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/** A rule's row: its words (cut, the whole of them under the pointer), its list, and Edit and Delete (20, round 6). */
private struct RuleRow: View {
  let rule: AutoReviewInstructions.Rule
  let number: Int
  let columns: (action: CGFloat, behavior: CGFloat)
  @Bindable var model: GeneralSettingsModel
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 12) {
      Text(rule.text)
        .lineLimit(1)
        .truncationMode(.tail)
        .help(rule.text)
        .frame(width: columns.action, alignment: .leading)
      Text(AutoReviewInstructions.label(rule.behavior))
        .lineLimit(1)
        .frame(width: columns.behavior, alignment: .leading)
      HStack(spacing: 6) {
        RuleIconButton(systemImage: "square.and.pencil", label: "Edit rule \(number)", disabled: model.editing != nil || model.rulesPending, look: look) { model.edit(rule) }
        RuleIconButton(systemImage: "trash", label: "Delete rule \(number)", disabled: model.rulesPending, look: look) { model.delete(rule, store: store) }
      }
      .frame(width: 52, alignment: .trailing)
    }
    .font(.system(size: 13))
    .foregroundStyle(look.ink)
    .padding(6)
    .frame(height: 32)
    .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(hovering ? look.wash : .clear))
    .onHover { hovering = $0 }
  }
}

/** A rule being edited (one at a time): the composer in its row, on the faint grey, Cancel and Save Rule. */
private struct RuleEditorRow: View {
  @Bindable var model: GeneralSettingsModel
  let number: Int
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    if let editing = model.editing {
      let moving = editing.behavior != editing.rule.behavior && AutoReviewInstructions.isFull(model.rules.list(editing.behavior))
      RuleComposer(text: Binding(get: { model.editing?.text ?? "" }, set: { @MainActor in model.editing?.text = $0 }),
                   behavior: Binding(get: { model.editing?.behavior ?? .allow }, set: { @MainActor in model.editing?.behavior = $0 }),
                   label: "Edit action for rule \(number)", focusOnAppear: true, disabled: model.rulesPending, showsLimit: moving, look: look,
                   submit: { model.save(store: store) }, cancel: { model.editing = nil }) {
        SettingsButton(title: "Cancel", look: look) { model.editing = nil }
          .accessibilityLabel("Cancel editing rule")
        SettingsButton(title: "Save Rule", kind: .primary, disabled: !model.canSave, look: look) { model.save(store: store) }
          .accessibilityLabel("Save rule \(number)")
      }
      .padding(12)
      .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(look.wash))
    }
  }
}

private struct RuleIconButton: View {
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
        .frame(width: 20, height: 20)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering && !disabled ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .onHover { hovering = $0 }
    .accessibilityLabel(label)
  }
}

// MARK: - Security Key

/**
 * Use hardware security keys (`va`), on by default. The Mac's own key
 * handling (the Electron app's signer) comes with step 14; until then the
 * choice is kept on this Mac and not given to the computer.
 */
private struct SecurityKeyRow: View {
  let look: Look
  @AppStorage("simeon.webauthnProxyEnabled") private var enabled = true

  var body: some View {
    SettingsRow(label: "Use hardware security keys",
                hints: ["Allow Simeon to use a security key (such as a YubiKey) connected to your computer. You’ll be asked to approve each use."], look: look) {
      Toggle("", isOn: $enabled)
        .toggleStyle(.switch)
        .labelsHidden()
        .controlSize(.mini)
        .tint(look.paneSwitchOn)
        .accessibilityLabel("Use hardware security keys")
    }
  }
}
