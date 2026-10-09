import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings (⌘,), in the Mac's Settings window: the shipped window's
 * sections (`SETTINGS_SECTIONS` with Updates taken out by the patch).
 * General: Account, Appearance, Agent (Timezone, Execution on Local
 * Computer, Auto-review and its rules). Usage & Billing, listed once the
 * account's usage has been read (`useVisibleSettingsSections`): the meters,
 * the upgrade card, Cancel Trial, Manage Plan. Security Key comes with
 * slice 8.
 */
struct MacSettings: View {
  @Environment(AppStore.self) private var store
  @State private var section = "general"

  var body: some View {
    TabView(selection: $section) {
      Tab("General", systemImage: "gearshape", value: "general") { MacGeneralSettings() }
      if store.usage.showsSection {
        Tab("Usage & Billing", systemImage: "chart.bar", value: "usage") { MacUsageSettings() }
      }
    }
    .frame(width: 620, height: 600)
    // Read as the window's Settings reads it: on opening, unless it was read in the last 30 s.
    .task { await store.loadUsage() }
    .onChange(of: store.usage.showsSection) { _, shown in if !shown { section = "general" } }
  }
}

// MARK: General

struct MacGeneralSettings: View {
  @Environment(AppStore.self) private var store
  @State private var settings: JSON?
  @State private var saving = false

  var body: some View {
    Form {
      Section("Account") { MacAccountCard() }
      MacAppearanceSection()
      Section("Agent") {
        MacTimeZoneRow(settings: $settings, saving: $saving)
        MacLocalExecutionRow()
        MacAutoReview(settings: $settings, saving: $saving)
      }
    }
    .formStyle(.grouped)
    .task { settings = await store.hostSettings() }
  }
}

/**
 * The account card (`Vs`): the picture, else the name's letters; the name
 * ("Simeon" with none) and the e-mail with its copy button; Sign Out, which
 * asks first ("Sign out?"). Signed out: "Not signed in" and Sign In, which
 * brings the window with the sign-in forward; while signing in, "Finish
 * signing in from your browser" and Cancel.
 */
struct MacAccountCard: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @Environment(\.openWindow) private var openWindow
  @State private var copied = false
  @State private var asksSignOut = false

  var body: some View {
    let display = AccountDisplay(displayName: store.account?.name, email: store.account?.email)
    HStack(spacing: 12) {
      avatar(display)
      VStack(alignment: .leading, spacing: 2) {
        Text(title(display)).font(.system(size: 13, weight: .medium)).lineLimit(1)
        HStack(spacing: 4) {
          Text(meta(display)).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
          if session.phase == .signedIn, let email = display.secondary {
            Button {
              UIPasteboard.general.string = email
              copied = true
              Task { try? await Task.sleep(nanoseconds: 1_500_000_000); copied = false }
            } label: {
              Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 11))
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Copy email address")
            .help("Copy email address")
          }
        }
      }
      .accessibilityElement(children: .combine)
      Spacer(minLength: 8)
      action
    }
    .padding(.vertical, 4)
    .alert("Sign out?", isPresented: $asksSignOut) {
      Button("Cancel", role: .cancel) {}
      Button("Sign out", role: .destructive) { Task { await session.signOut() } }
    } message: {
      Text("You’ll need to sign in again to use Simeon.")
    }
  }

  private func title(_ display: AccountDisplay) -> String {
    switch session.phase {
    case .signedIn: return display.title
    case .signingIn: return "Signing in"
    default: return "Not signed in"
    }
  }

  private func meta(_ display: AccountDisplay) -> String {
    switch session.phase {
    case .signedIn: return display.secondary ?? "Signed in"
    case .signingIn: return "Finish signing in from your browser"
    default: return "Sign in to Simeon"
    }
  }

  @ViewBuilder
  private var action: some View {
    switch session.phase {
    case .signedIn:
      Button("Sign Out") { asksSignOut = true }
    case .signingIn:
      Button("Cancel") { session.cancelSignIn() }
    default:
      Button("Sign In") {
        // The window with the sign-in, brought forward; a new one only when there is none.
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue.hasPrefix("main") == true }) {
          window.makeKeyAndOrderFront(nil)
          NSApp.activate()
        } else {
          openWindow(id: "main")
        }
      }
      .buttonStyle(.borderedProminent)
    }
  }

  private func avatar(_ display: AccountDisplay) -> some View {
    ZStack {
      Circle().fill(Ink.bubbleTheirs)
      if session.phase != .signedIn {
        Image(systemName: "person.fill").font(.system(size: 17)).foregroundStyle(.secondary)
      } else if let picture = store.account?.pictureURL {
        AsyncImage(url: picture) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          letters(display)
        }
        .clipShape(Circle())
      } else {
        letters(display)
      }
    }
    .frame(width: 40, height: 40)
    .accessibilityHidden(true)
  }

  private func letters(_ display: AccountDisplay) -> some View {
    Text(AccountInitials.of(display.title)).font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
  }
}

/** Appearance › Theme (`pa`): Follow System, Light or Dark. */
struct MacAppearanceSection: View {
  @AppStorage("simeon.theme") private var theme = "system"

  var body: some View {
    Section("Appearance") {
      Picker("Theme", selection: $theme) {
        Text("Follow System").tag("system")
        Text("Light").tag("light")
        Text("Dark").tag("dark")
      }
    }
  }
}

/**
 * Agent › Timezone (`la`): "Auto-detect (the Mac's zone)", then every zone
 * with its time now; the choice is the box's `userTimeZoneOverride`
 * (cleared for Auto-detect).
 */
struct MacTimeZoneRow: View {
  @Binding var settings: JSON?
  @Binding var saving: Bool
  @Environment(AppStore.self) private var store

  private static let known = TimeZone.knownTimeZoneIdentifiers.sorted()

  var body: some View {
    let detected = settings?["userTimeZone"]?.text ?? TimeZone.current.identifier
    let override = settings?["userTimeZoneOverride"]?.text
    let now = Date()
    Picker("Timezone", selection: Binding(get: { override ?? TimeZoneChoices.automatic }, set: choose)) {
      ForEach(TimeZoneChoices.values(override: override, known: Self.known), id: \.self) { value in
        let zone = value == TimeZoneChoices.automatic ? detected : value
        let label = value == TimeZoneChoices.automatic ? TimeZoneChoices.automaticLabel(detected: detected) : TimeZoneChoices.label(value)
        Text("\(Text(label))  \(Text(Self.time(now, in: zone)).foregroundStyle(.tertiary))").tag(value)
      }
    }
    .disabled(saving || settings == nil)
  }

  private func choose(_ value: String) {
    let zone = value == TimeZoneChoices.automatic ? "" : value
    settings = (settings ?? [:]).setting("userTimeZoneOverride", zone.isEmpty ? nil : .string(zone))
    saving = true
    Task {
      // A save that failed puts back what the computer has.
      if let next = await store.setHostSettings(["userTimeZoneOverride": .string(zone)]) { settings = next } else { settings = await store.hostSettings() }
      saving = false
    }
  }

  static func time(_ date: Date, in zone: String) -> String {
    guard let timeZone = TimeZone(identifier: zone) else { return "" }
    var style = Date.FormatStyle(date: .omitted, time: .shortened)
    style.timeZone = timeZone
    return date.formatted(style)
  }
}

/**
 * Agent › Auto-review (`ea`, `Qs`): the switch and its line; while it is on,
 * "Auto-review Rules": the composer ("When Simeon wants to:", "It
 * should:", Add Rule), the table (Action, Behavior, edit and delete), a rule
 * edited in its own row (Save Rule, Cancel), and the line under them. ⌘↩
 * adds or saves, Esc cancels or clears. The rules' rules are SimeonCore's
 * (`AutoReviewInstructions`).
 */
struct MacAutoReview: View {
  @Binding var settings: JSON?
  @Binding var saving: Bool
  @Environment(AppStore.self) private var store
  @State private var draft = ""
  @State private var behavior: AutoReviewInstructions.Behavior = .allow
  @State private var editing: Editing?

  struct Editing: Equatable {
    var rule: AutoReviewInstructions.Rule
    var text: String
    var behavior: AutoReviewInstructions.Behavior
  }

  private var instructions: AutoReviewInstructions { AutoReviewInstructions(json: settings?["autoReviewInstructions"]) }

  var body: some View {
    let instructions = instructions
    LabeledContent {
      Toggle("Auto-review", isOn: Binding(get: { instructions.isEnabled }, set: { on in
        var next = instructions
        next.isEnabled = on
        save(next)
      }))
      .labelsHidden()
      .toggleStyle(.switch)
      .disabled(saving || settings == nil)
    } label: {
      Text("Auto-review")
      Text("Simeon checks each action before it runs and asks you first when needed. Add rules to customize what it can do automatically.")
    }
    if instructions.isEnabled {
      rules(instructions)
    }
  }

  @ViewBuilder
  private func rules(_ instructions: AutoReviewInstructions) -> some View {
    let found = editing.flatMap { instructions.relocate($0.rule) }
    let current = editing.flatMap { edit in found.map { Editing(rule: $0, text: edit.text, behavior: edit.behavior) } }
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Auto-review Rules").font(.system(size: 13, weight: .semibold))
        Text("Write one short, natural-language rule for each action. \"Ask first\" takes priority if rules conflict.")
          .font(.system(size: 12)).foregroundStyle(.secondary)
      }
      let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
      let target = instructions.list(behavior)
      let full = AutoReviewInstructions.isFull(target)
      MacRuleComposer(
        draft: $draft, behavior: $behavior,
        disabled: saving || current != nil,
        canSubmit: !saving && current == nil && !trimmed.isEmpty && !full && !target.contains(trimmed),
        showsLimit: full, submitLabel: "Add Rule", submitAccessibility: "Add rule",
        draftAccessibility: "Auto-review rule draft", behaviorAccessibility: "Rule behavior",
        autoFocus: false, cancel: nil,
        submit: {
          guard !saving, current == nil, !trimmed.isEmpty, let next = instructions.saving(trimmed, as: behavior, editing: nil) else { return }
          save(next)
          draft = ""
          behavior = .allow
        }
      )
      if !instructions.rules.isEmpty {
        table(instructions, editing: current)
      }
      Text("These rules apply only to you. Built-in safety checks always apply.")
        .font(.system(size: 12)).foregroundStyle(.tertiary)
    }
    .padding(.vertical, 6)
    .onChange(of: found) { _, now in if editing != nil && now == nil { editing = nil } }
  }

  private func table(_ instructions: AutoReviewInstructions, editing current: Editing?) -> some View {
    VStack(spacing: 0) {
      HStack {
        Text("Action").frame(maxWidth: .infinity, alignment: .leading)
        Text("Behavior").frame(width: 150, alignment: .leading)
        Color.clear.frame(width: 52, height: 1)
      }
      .font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
      .padding(.horizontal, 10).padding(.vertical, 6)
      Divider()
      ForEach(Array(instructions.rules.enumerated()), id: \.element) { index, rule in
        if let current, current.rule.behavior == rule.behavior, current.rule.text == rule.text {
          editor(instructions, current: current, number: index + 1)
            .padding(10)
        } else {
          HStack {
            Text(rule.text).lineLimit(1).truncationMode(.tail).help(rule.text).frame(maxWidth: .infinity, alignment: .leading)
            Text(AutoReviewInstructions.label(rule.behavior)).frame(width: 150, alignment: .leading)
            HStack(spacing: 2) {
              Button { editing = Editing(rule: rule, text: rule.text, behavior: rule.behavior) } label: { Image(systemName: "square.and.pencil") }
                .disabled(saving || current != nil)
                .accessibilityLabel("Edit rule \(index + 1)")
              Button { delete(rule, in: instructions) } label: { Image(systemName: "trash") }
                .disabled(saving)
                .accessibilityLabel("Delete rule \(index + 1)")
            }
            .buttonStyle(.borderless)
            .frame(width: 52, alignment: .trailing)
          }
          .font(.system(size: 13))
          .padding(.horizontal, 10).padding(.vertical, 7)
        }
        if index < instructions.rules.count - 1 { Divider() }
      }
    }
    .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(.separator, lineWidth: 0.5))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Auto-review rules")
  }

  private func editor(_ instructions: AutoReviewInstructions, current: Editing, number: Int) -> some View {
    let text = current.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let saved = text.isEmpty ? nil : instructions.saving(text, as: current.behavior, editing: current.rule)
    return MacRuleComposer(
      draft: Binding(get: { editing?.text ?? current.text }, set: { editing?.text = $0 }),
      behavior: Binding(get: { editing?.behavior ?? current.behavior }, set: { editing?.behavior = $0 }),
      disabled: saving,
      canSubmit: !saving && saved != nil,
      showsLimit: current.rule.behavior != current.behavior && AutoReviewInstructions.isFull(instructions.list(current.behavior)),
      submitLabel: "Save Rule", submitAccessibility: "Save rule \(number)",
      draftAccessibility: "Edit action for rule \(number)", behaviorAccessibility: "Behavior for rule \(number)",
      autoFocus: true, cancel: { editing = nil },
      submit: {
        guard !saving, let saved else { return }
        save(saved)
        editing = nil
      }
    )
  }

  private func delete(_ rule: AutoReviewInstructions.Rule, in instructions: AutoReviewInstructions) {
    save(instructions.removing(rule))
    if let editing, editing.rule.behavior == rule.behavior, editing.rule.text == rule.text { self.editing = nil }
  }

  private func save(_ next: AutoReviewInstructions) {
    settings = (settings ?? [:]).setting("autoReviewInstructions", next.json)
    saving = true
    Task {
      if let answer = await store.setHostSettings(["autoReviewInstructions": next.json]) { settings = answer } else { settings = await store.hostSettings() }
      saving = false
    }
  }
}

/** A rule's composer (`Oe`): what Simeon wants to do, what it should do, the limit, Cancel and the button. */
struct MacRuleComposer: View {
  @Binding var draft: String
  @Binding var behavior: AutoReviewInstructions.Behavior
  let disabled: Bool
  let canSubmit: Bool
  let showsLimit: Bool
  let submitLabel: String
  let submitAccessibility: String
  let draftAccessibility: String
  let behaviorAccessibility: String
  let autoFocus: Bool
  let cancel: (() -> Void)?
  let submit: () -> Void
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 6) {
        Text("When Simeon wants to:").font(.system(size: 13))
        TextField("e.g. reply to emails for me", text: Binding(get: { draft }, set: { draft = AutoReviewInstructions.clip($0) }), axis: .vertical)
          .lineLimit(1...6)
          .textFieldStyle(.roundedBorder)
          .focused($focused)
          .disabled(disabled)
          .accessibilityLabel(draftAccessibility)
          .onKeyPress(.return, phases: .down) { press in
            guard press.modifiers.contains(.command) else { return .ignored }
            submit()
            return .handled
          }
          .onKeyPress(.escape) {
            if let cancel { cancel() } else { draft = ""; behavior = .allow }
            return .handled
          }
      }
      HStack(spacing: 8) {
        Text("It should:").font(.system(size: 13))
        Picker("It should:", selection: $behavior) {
          ForEach(AutoReviewInstructions.Behavior.allCases, id: \.self) { Text(AutoReviewInstructions.label($0)).tag($0) }
        }
        .labelsHidden()
        .fixedSize()
        .disabled(disabled)
        .accessibilityLabel(behaviorAccessibility)
        Spacer(minLength: 8)
        if showsLimit {
          Text(AutoReviewInstructions.limitNote).font(.system(size: 12)).foregroundStyle(.tertiary)
        }
        if let cancel {
          Button("Cancel", action: cancel)
            .disabled(disabled)
            .accessibilityLabel("Cancel editing rule")
        }
        Button(submitLabel, action: submit)
          .buttonStyle(.borderedProminent)
          .disabled(!canSubmit)
          .accessibilityLabel(submitAccessibility)
      }
    }
    .onAppear { if autoFocus { focused = true } }
  }
}

// MARK: Usage & Billing

/**
 * Usage & Billing (`Na`, and the patch's Manage Plan): "Weekly usage" or
 * "Trial usage" with its bar, share and reset; "On-demand usage"; the
 * upgrade card with its line, Cancel Trial and the plan's button; the
 * Manage Plan card. "Loading usage…", "Couldn’t load usage." and
 * "Couldn’t refresh usage — showing the last known values." with Retry.
 */
struct MacUsageSettings: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    Form {
      if let summary = store.usage.summary {
        let meters = UsageMeters(summary)
        Section("Usage") {
          MacUsageMeter(title: meters.includedUsageTitle, meter: meters.weekly, emptyHint: UsageMeters.noIncludedUsage)
          if let onDemand = meters.onDemand {
            MacUsageMeter(title: UsageMeters.onDemandTitle, meter: onDemand, emptyHint: "Not available.")
          }
          if let upgrade = meters.upgrade, let line = meters.upgradeSupportingText {
            MacUpgradeRow(upgrade: upgrade, line: line, canCancelTrial: meters.canCancelTrial)
          } else if meters.canCancelTrial {
            HStack { Spacer(); MacCancelTrialButton() }
          }
        }
        if store.usage.isFailed {
          Section {
            HStack {
              Text("Couldn’t refresh usage — showing the last known values.").font(.system(size: 12)).foregroundStyle(.red)
              Spacer()
              Button("Retry") { Task { await store.refreshUsage() } }.disabled(store.usage.isLoading)
            }
          }
        }
        if let plan = summary.managePlan {
          MacManagePlan(plan: plan)
        }
      } else {
        Section("Usage") {
          if store.usage.isFailed {
            HStack {
              Text("Couldn’t load usage.").font(.system(size: 12)).foregroundStyle(.red)
              Spacer()
              Button("Retry") { Task { await store.refreshUsage() } }
            }
          } else {
            Text("Loading usage…").font(.system(size: 12)).foregroundStyle(.tertiary)
          }
        }
      }
    }
    .formStyle(.grouped)
    .task { await store.loadUsage() }
  }
}

/** One meter (`Ge`): its title and reset, the bar, the value; or the hint when there is none. */
struct MacUsageMeter: View {
  let title: String
  let meter: UsageMeters.Meter?
  let emptyHint: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text(title).font(.system(size: 13))
        Spacer()
        if let reset = meter?.resetLabel { Text(reset).font(.system(size: 12)).foregroundStyle(.tertiary) }
      }
      if let meter {
        if let bar = meter.barPercent {
          ProgressView(value: bar, total: 100)
            .progressViewStyle(.linear)
            .tint(Ink.blue)
            .accessibilityLabel("\(title): \(meter.valueLabel)")
        }
        Text(meter.valueLabel).font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit()
      } else {
        Text(emptyHint).font(.system(size: 12)).foregroundStyle(.tertiary)
      }
    }
    .padding(.vertical, 4)
  }
}

/** The upgrade card (`xa`): its line, Cancel Trial while one can, and the plan's button, which opens the plans page. */
struct MacUpgradeRow: View {
  let upgrade: UsageSummary.UpgradeButton
  let line: String
  let canCancelTrial: Bool
  @Environment(\.openURL) private var openURL

  var body: some View {
    HStack(spacing: 8) {
      Text(line).font(.system(size: 12)).foregroundStyle(.secondary)
      Spacer(minLength: 8)
      if canCancelTrial { MacCancelTrialButton() }
      Button(upgrade.label) { openURL(upgrade.url) }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
    }
  }
}

/** Cancel Trial (`ja`), and its question: "Cancel your trial?", Keep Trial, Cancel Trial ("Canceling…"), the failure under it. */
struct MacCancelTrialButton: View {
  @Environment(AppStore.self) private var store
  @State private var asking = false
  @State private var pending = false
  @State private var failure: String?

  var body: some View {
    Button(pending ? "Canceling…" : "Cancel Trial") { failure = nil; asking = true }
      .controlSize(.small)
      .disabled(pending)
      .sheet(isPresented: $asking) {
        VStack(alignment: .leading, spacing: 12) {
          Text("Cancel your trial?").font(.system(size: 15, weight: .semibold))
          Text("This ends your Simeon trial now and removes your remaining trial credits. Your card won’t be charged either way — the trial never turns into a paid plan on its own.")
            .font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
          if let failure { Text(failure).font(.system(size: 12)).foregroundStyle(.red) }
          HStack {
            Spacer()
            Button("Keep Trial") { asking = false }
              .keyboardShortcut(.cancelAction)
              .disabled(pending)
            Button(pending ? "Canceling…" : "Cancel Trial", role: .destructive) {
              pending = true
              Task {
                let message = await store.cancelTrial()
                pending = false
                if let message { failure = message } else { asking = false }
              }
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .disabled(pending)
          }
        }
        .padding(20)
        .frame(width: 380)
        .interactiveDismissDisabled(pending)
      }
  }
}

/**
 * Manage Plan (the patch's `__simeonManagePlan`, 6 October 2026): "Current
 * plan: Pro", when the trial ends or the usage resets, "Upgrade to Max",
 * and "Manage billing on Stripe" with Manage Billing ↗; each opens Stripe's
 * portal in the browser ("Opening…" meanwhile).
 */
struct MacManagePlan: View {
  let plan: UsageSummary.ManagePlan
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var busy: String?
  @State private var failure: String?

  var body: some View {
    Section("Manage Plan") {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Current plan: \(plan.planName)").font(.system(size: 13))
          let line = plan.line()
          if !line.isEmpty { Text(line).font(.system(size: 12)).foregroundStyle(.secondary) }
        }
        Spacer(minLength: 8)
        if let next = plan.nextTier {
          Button(busy == "update_confirm" ? "Opening…" : "Upgrade to \(next.label)") { open(flow: "update_confirm", tier: next.tier) }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(busy != nil)
        }
      }
      HStack {
        Text("Manage billing on Stripe").font(.system(size: 13))
        Spacer()
        Button(busy == "manage" ? "Opening…" : "Manage Billing ↗") { open(flow: nil, tier: nil) }
          .controlSize(.small)
          .disabled(busy != nil)
      }
      if let failure {
        Text(failure).font(.system(size: 12)).foregroundStyle(.red)
      }
    }
  }

  private func open(flow: String?, tier: String?) {
    guard busy == nil else { return }
    busy = flow ?? "manage"
    failure = nil
    Task {
      let answer = await store.billingPortal(flow: flow, tier: tier)
      if let url = answer.url { openURL(url) } else { failure = answer.message ?? "Couldn’t open billing. Try again." }
      busy = nil
    }
  }
}
