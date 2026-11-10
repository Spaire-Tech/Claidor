import AppKit
import SwiftUI
import SimeonCore

// MARK: - AI Models

/**
 * AI Models (8 November 2026; the founder: "allow people to bring their own
 * subscriptions and charge only for the computer", "do it exactly like
 * Reason", then "use codex sign in"): what it is for in a line; the
 * accounts connected, each its app's icon, its name and "Subscription" (how
 * it stands only when it can't be used) and a `⋯` (Rename, Add Another for
 * ChatGPT, Connect Again, Disconnect); then Subscriptions, the providers not
 * yet connected, each its app's icon, its name and Connect. 9 November, the
 * founder: "do not duplicate the subscription", "just have subscription
 * there", the icons whole as Wallet's Link and Shop, and the model chosen on
 * the composer (`ComposerModelMenu`), not here. The model (`AIModelsModel`)
 * is the shared core's, one for the app (`store.aiModels`), as the iPhone's
 * page and the web app's are.
 *
 * API keys (10 November 2026, the founder: "Below subscription something
 * called api keys"): under Subscriptions, every provider the server lists in
 * the founder's order, each its tile, its name (and, for those with a plan
 * of their own, where to connect the plan instead) and Connect, or "Soon";
 * Connect asks as an app's does, then the key sheet (`MacKeyConnectSheet`).
 * A key connected is under Connected, "API key …a1b2".
 */
struct SettingsModelsPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  /** The provider whose code sheet is open (ChatGPT's, Grok's). */
  @State private var connectingByCode: String?
  @State private var connectingClaude = false
  /** The key provider whose key sheet is open. */
  @State private var keying: KeyProvider?
  @State private var renaming: ModelAccount?
  @State private var newName = ""

  var body: some View {
    let model = store.aiModels
    VStack(alignment: .leading, spacing: 22) {
      Text("Connect providers and choose the models your agents use.")
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .fixedSize(horizontal: false, vertical: true)
      if !model.loaded {
        if let problem = model.problem {
          SettingsGroup(look: look) {
            SettingsLine(label: problem, labelTint: look.danger, look: look) {
              SettingsPill(title: String(localized: "Try Again"), look: look) { Task { await model.load() } }
            }
          }
        } else {
          ProgressView().controlSize(.small).frame(maxWidth: .infinity)
        }
      } else {
        let open = model.unconnected
        let footer = String(localized: "Voice calls, dictation and video still use your Simeon credits.")
        if !model.accounts.isEmpty {
          SettingsGroup(title: String(localized: "Connected"), footer: open.isEmpty ? footer : nil, look: look) {
            ForEach(Array(model.accounts.enumerated()), id: \.element.id) { index, account in
              MacModelAccountLine(
                account: account,
                divided: index > 0,
                look: look,
                rename: { newName = account.shownName; renaming = account },
                addAnother: account.kind == "api_key"
                  ? { keying = model.keyProvider(account.provider) }
                  : AIModels.signedInByCode.contains(account.provider) ? { connectingByCode = account.provider } : nil,
                connectAgain: {
                  if account.kind == "api_key" { keying = model.keyProvider(account.provider) } else { connect(account.provider) }
                },
                disconnect: { askToDisconnect(account, model: model) }
              )
            }
          }
        }
        if !open.isEmpty {
          SettingsGroup(title: String(localized: "Subscriptions"), footer: footer, look: look) {
            ForEach(Array(open.enumerated()), id: \.element) { index, provider in
              MacProviderLine(provider: provider, divided: index > 0, look: look) {
                SettingsPill(title: String(localized: "Connect"), look: look) { ask(provider) }
              }
            }
          }
        }
        let keys = model.unconnectedKeys
        if !keys.isEmpty {
          SettingsGroup(title: String(localized: "API keys"), footer: String(localized: "Each provider bills the calls on your key."), look: look) {
            ForEach(Array(keys.enumerated()), id: \.element.id) { index, one in
              MacProviderLine(provider: one.provider, name: one.name, hint: one.hint, divided: index > 0, look: look) {
                if one.available {
                  SettingsPill(title: String(localized: "Connect"), look: look) {
                    // The consent an app's Connect shows, in a key's words, then the key sheet.
                    MacConnector.shared.ask(consent: ConnectConsent(keyProvider: one.provider, name: one.name)) { keying = one }
                  }
                } else {
                  Text("Soon")
                    .font(PanelType.row)
                    .foregroundStyle(look.inkTertiary)
                    .padding(.horizontal, 10)
                }
              }
            }
          }
        }
        if let problem = model.problem {
          Text(problem)
            .font(PanelType.detail)
            .foregroundStyle(look.danger)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
        }
      }
    }
    .sheet(isPresented: Binding(get: { connectingByCode != nil }, set: { if !$0 { connectingByCode = nil } })) {
      MacChatGPTConnectSheet(model: model, provider: connectingByCode ?? AIModels.chatGPT)
    }
    .sheet(isPresented: $connectingClaude) { MacClaudeConnectSheet(model: model) }
    .sheet(item: $keying) { MacKeyConnectSheet(model: model, provider: $0) }
    .alert("Rename account", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField(String(localized: "Account name"), text: $newName)
      Button("Rename") {
        if let account = renaming { Task { await model.rename(account, to: newName) } }
        renaming = nil
      }
      Button("Cancel", role: .cancel) { renaming = nil }
    }
    .task { await model.load() }
  }

  /**
   * A provider's first Connect: the consent an app's Connect shows (9
   * November 2026, the founder: "have it like when you connect an app"),
   * then its sign-in.
   */
  private func ask(_ provider: String) {
    MacConnector.shared.ask(consent: ConnectConsent(modelProvider: provider)) { connect(provider) }
  }

  /** A provider's sign-in: the code sheet (ChatGPT, Grok), or Claude's. */
  private func connect(_ provider: String) {
    if provider == AIModels.claude { connectingClaude = true } else { connectingByCode = provider }
  }

  private func askToDisconnect(_ account: ModelAccount, model: AIModelsModel) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = String(localized: "Disconnect \(account.shownName)?")
    alert.informativeText = String(localized: "Your agents stop using this account. You can connect it again anytime.")
    alert.addButton(withTitle: String(localized: "Disconnect"))
    alert.addButton(withTitle: String(localized: "Cancel")).keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      Task { await model.disconnect(account) }
    }
  }
}

/** A provider not yet connected, under Subscriptions or API keys: its app's icon, its name (and a line under it, where it has one), and Connect; a line above it when it follows another. */
private struct MacProviderLine<Trailing: View>: View {
  let provider: String
  /** The server's name for a key provider; a plan's own otherwise. */
  var name: String? = nil
  var hint: String? = nil
  var divided = false
  let look: Look
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 12) {
      MacProviderIcon(provider: provider, look: look, side: 28)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: name ?? AIModels.providerName(provider))
          .font(PanelType.row)
          .foregroundStyle(look.ink)
        if let hint {
          Text(hint)
            .font(PanelType.detail)
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      trailing()
        .fixedSize()
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, 10)
    .frame(minHeight: SettingsRowSize.minHeight)
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
  }
}

/**
 * A provider's app icon, whole, as Wallet draws Link's and Shop's
 * (`AppIconImage`; the founder, 9 November 2026: "how link and shop have
 * their full logo, not inside a box"): ChatGPT's and Claude's own, from the
 * App Store (`Providers/<provider>`).
 */
struct MacProviderIcon: View {
  let provider: String
  let look: Look
  var side: CGFloat = 28

  var body: some View {
    if let icon = NSImage(named: "Providers/\(provider)") {
      AppIconImage(icon: icon, side: side, look: look)
    } else {
      AppLogoTile(name: AIModels.providerName(provider), look: look, side: side)
    }
  }
}

/** A connected account: its app's icon, its name ("ChatGPT", never the e-mail) over "Subscription", how it stands beside `⋯` (a dot and its words: "Usage available" in green, "Signed out" in red), and `⋯`. Its plan's usage is in Usage & Billing (`SubscriptionsGroup`). */
private struct MacModelAccountLine: View {
  let account: ModelAccount
  let divided: Bool
  let look: Look
  let rename: () -> Void
  /** ChatGPT's: another ChatGPT account, from here rather than a second row under Subscriptions. */
  let addAnother: (() -> Void)?
  let connectAgain: () -> Void
  let disconnect: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      MacProviderIcon(provider: account.provider, look: look, side: 28)
      VStack(alignment: .leading, spacing: 2) {
        Text(account.shownName).font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
        Text(account.kindName).font(PanelType.detail).foregroundStyle(look.inkSecondary).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      // How it stands, beside `⋯` (the founder's reference: "● Usage available ⋯").
      let tint = account.usable() ? look.settingsGreen : account.status == .signedOut ? look.danger : look.inkSecondary
      HStack(spacing: 6) {
        Circle().fill(tint).frame(width: 7, height: 7)
        Text(account.statusWords()).font(PanelType.row).foregroundStyle(tint).lineLimit(1)
      }
      .fixedSize()
      Menu {
        if let addAnother {
          Button("Add Another", action: addAnother)
        }
        if account.status == .signedOut {
          Button("Connect Again", action: connectAgain)
        }
        Button("Rename", action: rename)
        Divider()
        Button("Disconnect", role: .destructive, action: disconnect)
      } label: {
        Image(systemName: "ellipsis")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 28, height: 28)
          .contentShape(Rectangle())
      }
      .menuStyle(.button)
      .buttonStyle(.borderless)
      .menuIndicator(.hidden)
      .fixedSize()
      .handCursor()
      .accessibilityLabel(String(localized: "More"))
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, 10)
    .frame(minHeight: SettingsRowSize.minHeight)
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
  }
}

/**
 * Usage & Billing's "Subscriptions" (9 November 2026, the founder: "if one
 * is connected, have Simeon usage, and below a tab Subscriptions, with
 * claude or chat gpt usage and we can click on it and it takes us to the
 * page"): each connected account, its app's icon, its name over how much of
 * its plan is used ("5-hour limit 42% · Weekly limit 18%"; its plan before
 * its first use; "Signed out" in red), and `›` to its page. None while
 * nothing is connected, so Usage & Billing stays as it was.
 */
struct SubscriptionsGroup: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings

  var body: some View {
    let accounts = store.aiModels.accounts
    if !accounts.isEmpty {
      TimelineView(.periodic(from: .now, by: 30)) { context in
        SettingsGroup(title: String(localized: "Subscriptions"), look: look) {
          ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
            MacSubscriptionLine(account: account, now: context.date, divided: index > 0, look: look) {
              settings.openModelAccount(account.id)
            }
          }
        }
      }
    }
  }
}

/** One account under Subscriptions: as a link row, its whole width opens its page. */
private struct MacSubscriptionLine: View {
  let account: ModelAccount
  let now: Date
  let divided: Bool
  let look: Look
  let open: () -> Void
  @State private var hovering = false

  var body: some View {
    let signedOut = account.status == .signedOut
    Button(action: open) {
      HStack(spacing: 12) {
        MacProviderIcon(provider: account.provider, look: look, side: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text(account.shownName).font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
          Text(signedOut ? account.statusWords(now: now) : account.usageLine(now: now))
            .font(PanelType.detail)
            .foregroundStyle(signedOut ? look.danger : look.inkSecondary)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(look.inkTertiary)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, 10)
      .frame(minHeight: SettingsRowSize.minHeight)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
  }
}

/**
 * A connected AI account's page, from Usage & Billing's Subscriptions (9
 * November 2026, the founder: "it should look like usage and billing ...
 * then a way to go to their plan in claude or chat website"): "Usage", the
 * plan's 5-hour and weekly limits drawn as Usage & Billing's meters
 * (`UsageMeterLine`), each what is used, when it resets and its bar, with
 * when the provider last said it under; then "Plan", the plan and Manage
 * Plan ↗, the provider's own page (Codex's usage on chatgpt.com,
 * claude.ai's). Back goes to Usage & Billing; an account disconnected
 * meanwhile goes back there too.
 */
struct SettingsModelAccountPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings

  var body: some View {
    let model = store.aiModels
    let account = model.accounts.first { $0.id == settings.modelAccount }
    VStack(alignment: .leading, spacing: 22) {
      if let account {
        TimelineView(.periodic(from: .now, by: 30)) { context in
          usage(account, now: context.date)
        }
        plan(account)
      }
    }
    .task { await model.load() }
    .onChange(of: account == nil) { _, gone in
      if gone && model.loaded { settings.page = .usage }
    }
  }

  private func usage(_ account: ModelAccount, now: Date) -> some View {
    let lines = account.usage?.lines(now: now) ?? []
    return SettingsGroup(title: String(localized: "Usage"), footer: lines.isEmpty ? nil : account.usage?.updatedWords(now: now), look: look) {
      if lines.isEmpty {
        SettingsLine(label: String(localized: "Shown after your agents next use \(account.providerName)."), look: look) { EmptyView() }
      } else {
        ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
          UsageMeterLine(title: line.title, meter: line.meter, divided: index > 0, look: look)
        }
      }
    }
  }

  @ViewBuilder
  private func plan(_ account: ModelAccount) -> some View {
    let named = account.plan.map { AIModels.planName($0) }.flatMap { $0.isEmpty ? nil : $0 }
    if named != nil || account.planPage != nil {
      SettingsGroup(title: String(localized: "Plan"), look: look) {
        if let named {
          SettingsLine(label: String(localized: "Current plan: \(named)"), look: look) { EmptyView() }
        }
        if let page = account.planPage {
          SettingsLinkRow(label: String(localized: "Manage Plan"), divided: named != nil, external: true, look: look) { NSWorkspace.shared.open(page) }
        }
      }
    }
  }
}

/**
 * Connect ChatGPT (Reason's sheet: "Copy this code", "Enter it on … and
 * approve", "Waiting for you to approve…"): the code, big, with Copy; the
 * page to enter it on, with Open; the wait, and nothing more (9 November
 * 2026, the founder: "all the many explanation… needs gone"). Connected, it
 * says which model the agents now use. The code lasts 15 minutes; closing
 * the sheet stops the asking.
 */
struct MacChatGPTConnectSheet: View {
  let model: AIModelsModel
  /** ChatGPT, or Grok (10 November 2026: the same sheet, Grok's page and code). */
  var provider: String = AIModels.chatGPT
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var signIn: ChatGPTSignIn?
  @State private var outcome: ChatGPTPoll?
  @State private var copied = false
  @State private var attempt = 0

  var body: some View {
    let look = Look(scheme)
    VStack(alignment: .leading, spacing: 20) {
      HStack(spacing: 12) {
        MacProviderIcon(provider: provider, look: look, side: 36)
        Text("Connect \(AIModels.providerName(provider))")
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
          .keyboardShortcut(.cancelAction)
      }
      content(look)
    }
    .padding(28)
    .frame(width: 460)
    .background(look.groupedRow)
    .task(id: attempt) { await run() }
  }

  @ViewBuilder
  private func content(_ look: Look) -> some View {
    switch outcome {
    case .some(.connected):
      VStack(alignment: .leading, spacing: 10) {
        Label("Connected", systemImage: "checkmark.circle.fill")
          .font(PanelType.row)
          .foregroundStyle(look.settingsGreen)
        Text("You're now connected to \(AIModels.providerName(provider)).")
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      footer(look, title: String(localized: "Done"))
    case .some(.expired), .some(.failed):
      Text(outcome == .expired ? String(localized: "The code expired. Try again.") : provider == AIModels.grok ? String(localized: "Grok didn't connect. Try again.") : String(localized: "ChatGPT didn't connect. Try again."))
        .font(PanelType.row)
        .foregroundStyle(look.danger)
        .fixedSize(horizontal: false, vertical: true)
      tryAgain(look)
    case .some(.notAllowed):
      // Signed in, on a plan xAI doesn't let in here: why, and where to get one that is.
      Text(AIModels.startProblem(code: "not_allowed", provider: provider))
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .fixedSize(horizontal: false, vertical: true)
      if let plans = AIModels.plansPage(provider) {
        SheetWideButton(title: String(localized: "See Grok Plans")) { NSWorkspace.shared.open(plans) }
          .padding(.top, 4)
      }
      HStack {
        Spacer()
        SettingsPill(title: String(localized: "Try Again"), look: look) { attempt += 1 }
        Spacer()
      }
    default:
      if let signIn {
        steps(signIn, look: look)
      } else if let problem = model.problem {
        Text(problem)
          .font(PanelType.row)
          .foregroundStyle(look.danger)
          .fixedSize(horizontal: false, vertical: true)
        tryAgain(look)
      } else {
        HStack(spacing: 10) {
          ProgressView().controlSize(.small)
          Text("Getting a code…").font(PanelType.row).foregroundStyle(look.inkSecondary)
        }
      }
    }
  }

  private func steps(_ signIn: ChatGPTSignIn, look: Look) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      MacConnectStep(number: 1, title: String(localized: "Copy this code"), look: look) {
        HStack(spacing: 12) {
          Text(verbatim: signIn.userCode)
            .font(.system(size: 22, weight: .medium, design: .monospaced))
            .foregroundStyle(look.ink)
            .textSelection(.enabled)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(look.groupedGround))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
          SettingsPill(title: copied ? String(localized: "Copied") : String(localized: "Copy"), look: look) {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(signIn.userCode, forType: .string)
            copied = true
          }
        }
      }
      MacConnectStep(number: 2, title: String(localized: "Enter it on \(signIn.shownAddress) and approve"), look: look) {
        SettingsPill(title: String(localized: "Open"), look: look) { NSWorkspace.shared.open(signIn.verificationURL) }
      }
      HStack(spacing: 10) {
        ProgressView().controlSize(.small)
        Text("Waiting for you to approve…").font(PanelType.row).foregroundStyle(look.inkSecondary)
      }
    }
  }

  private func tryAgain(_ look: Look) -> some View {
    SheetWideButton(title: String(localized: "Try Again")) { attempt += 1 }
      .padding(.top, 4)
  }

  private func footer(_ look: Look, title: String) -> some View {
    SheetWideButton(title: title) { dismiss() }
      .padding(.top, 4)
  }

  /** A code, then the wait for the person's approval; a new attempt starts afresh. Closing the sheet cancels it. */
  private func run() async {
    signIn = nil
    outcome = nil
    copied = false
    model.problem = nil
    guard let started = await model.startCodeSignIn(provider) else { return }
    signIn = started
    let answer = await model.waitForApproval(started)
    guard !Task.isCancelled, answer != .waiting else { return }
    outcome = answer
  }
}

/**
 * Connect Claude (9 November 2026; the founder's screenshot of Reason's:
 * Claude Code's own sign-in): a spinner while the computer starts it; 1,
 * Claude's page, with Open (the default browser); 2, the code Claude shows,
 * pasted and sent to the computer; nothing more (the founder, the same day:
 * "the absolute awful wording of starting claude code on your computer
 * needs gone"). Connected, it says which model the agents now use. Closed
 * before the code, the computer's sign-in ends.
 */
struct MacClaudeConnectSheet: View {
  let model: AIModelsModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var signIn: ClaudeSignIn?
  @State private var code = ""
  @State private var finishing = false
  @State private var outcome: ClaudeConnect?
  @State private var attempt = 0
  @FocusState private var codeFocused: Bool

  var body: some View {
    let look = Look(scheme)
    VStack(alignment: .leading, spacing: 20) {
      HStack(spacing: 12) {
        MacProviderIcon(provider: AIModels.claude, look: look, side: 36)
        Text("Connect Claude")
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { close() }
          .keyboardShortcut(.cancelAction)
      }
      content(look)
    }
    .padding(28)
    .frame(width: 460)
    .background(look.groupedRow)
    .task(id: attempt) { await start() }
  }

  @ViewBuilder
  private func content(_ look: Look) -> some View {
    switch outcome {
    case .some(.connected):
      VStack(alignment: .leading, spacing: 10) {
        Label("Connected", systemImage: "checkmark.circle.fill")
          .font(PanelType.row)
          .foregroundStyle(look.settingsGreen)
        Text("You're now connected to \(AIModels.providerName(AIModels.claude)).")
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      SheetWideButton(title: String(localized: "Done")) { dismiss() }
        .padding(.top, 4)
    case .some(.refused), .some(.failed):
      Text(outcome == .refused ? String(localized: "That code didn't work. Try again.") : (model.problem ?? String(localized: "That code didn't work. Try again.")))
        .font(PanelType.row)
        .foregroundStyle(look.danger)
        .fixedSize(horizontal: false, vertical: true)
      tryAgain(look)
    default:
      if let signIn {
        steps(signIn, look: look)
      } else if let problem = model.problem {
        Text(problem)
          .font(PanelType.row)
          .foregroundStyle(look.danger)
          .fixedSize(horizontal: false, vertical: true)
        tryAgain(look)
      } else {
        ProgressView().controlSize(.small)
      }
    }
  }

  private func steps(_ signIn: ClaudeSignIn, look: Look) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      MacConnectStep(number: 1, title: String(localized: "Open Claude's page and approve"), look: look) {
        SettingsPill(title: String(localized: "Open"), look: look) { NSWorkspace.shared.open(signIn.url) }
      }
      MacConnectStep(number: 2, title: String(localized: "Paste the code Claude shows"), look: look) {
        // The rows' box (the Credentials Store's), its ground darker than the sheet's in dark mode, so where to paste is plain.
        TextField(String(localized: "Code"), text: $code, prompt: Text("Code").foregroundStyle(look.inkTertiary))
          .textFieldStyle(.plain)
          .labelsHidden()
          .font(.system(size: 13, design: .monospaced))
          .foregroundStyle(look.ink)
          .focused($codeFocused)
          .disabled(finishing)
          .onSubmit { Task { await finish() } }
          .storeBox(width: nil, focused: codeFocused, look: look)
      }
      SheetWideButton(title: String(localized: "Connect"), busy: finishing, enabled: finishing || !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
        Task { await finish() }
      }
      .padding(.top, 4)
    }
    // Back from Claude's page with its code copied, ⌘V pastes it at once.
    .onAppear { codeFocused = true }
  }

  private func tryAgain(_ look: Look) -> some View {
    SheetWideButton(title: String(localized: "Try Again")) { attempt += 1 }
      .padding(.top, 4)
  }

  /** Claude Code's sign-in started afresh on the computer. */
  private func start() async {
    signIn = nil
    outcome = nil
    code = ""
    finishing = false
    model.problem = nil
    signIn = await model.startClaude()
  }

  /** The code sent to Claude Code on the computer; the field emptied either way. */
  private func finish() async {
    let typed = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !typed.isEmpty, !finishing else { return }
    finishing = true
    let answer = await model.finishClaude(code: typed)
    code = ""
    finishing = false
    outcome = answer
  }

  /** Closed: a sign-in still waiting for its code ends on the computer. */
  private func close() {
    if signIn != nil, outcome == nil { Task { await model.cancelClaude() } }
    dismiss()
  }
}

/**
 * Connect a provider's API key (10 November 2026): 1, the provider's own
 * page to make a key on, with Open (the default browser); 2, the key pasted,
 * hidden as a password is, and the details the provider needs (Azure's
 * endpoint and deployments, Cloudflare's account, Bedrock's region), each
 * named; Connect. The server tries the key at the provider before keeping
 * it, so a refused key is said here, in the provider's name, and the sheet
 * stays to try again. Connected, the key's best model is chosen when the
 * person had none.
 */
struct MacKeyConnectSheet: View {
  let model: AIModelsModel
  let provider: KeyProvider
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var key = ""
  @State private var fields: [String: String] = [:]
  @State private var checking = false
  @State private var outcome: KeyConnect?
  @FocusState private var focused: String?

  var body: some View {
    let look = Look(scheme)
    VStack(alignment: .leading, spacing: 20) {
      HStack(spacing: 12) {
        MacProviderIcon(provider: provider.provider, look: look, side: 36)
        Text("Connect \(provider.name)")
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
          .keyboardShortcut(.cancelAction)
      }
      if case .connected = outcome {
        VStack(alignment: .leading, spacing: 10) {
          Label("Connected", systemImage: "checkmark.circle.fill")
            .font(PanelType.row)
            .foregroundStyle(look.settingsGreen)
          Text("You're now connected to \(provider.name).")
            .font(PanelType.row)
            .foregroundStyle(look.ink)
            .fixedSize(horizontal: false, vertical: true)
        }
        SheetWideButton(title: String(localized: "Done")) { dismiss() }
          .padding(.top, 4)
      } else {
        steps(look)
      }
    }
    .padding(28)
    .frame(width: 460)
    .background(look.groupedRow)
    .onAppear {
      fields = Dictionary(uniqueKeysWithValues: provider.fields.map { ($0.key, $0.defaultValue ?? "") })
      focused = "key"
    }
  }

  private var ready: Bool {
    !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && provider.fields.allSatisfy { !(fields[$0.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  private func steps(_ look: Look) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      if let page = provider.keyPage {
        MacConnectStep(number: 1, title: String(localized: "Make a key on \(provider.name)'s page"), look: look) {
          SettingsPill(title: String(localized: "Open"), look: look) { NSWorkspace.shared.open(page) }
        }
      }
      MacConnectStep(number: provider.keyPage == nil ? 1 : 2, title: String(localized: "Paste your API key"), look: look) {
        VStack(alignment: .leading, spacing: 12) {
          // Hidden as a password is; the keys in it at once, so ⌘V pastes.
          SecureField(String(localized: "API key"), text: $key, prompt: Text("API key").foregroundStyle(look.inkTertiary))
            .textFieldStyle(.plain)
            .labelsHidden()
            .font(.system(size: 13, design: .monospaced))
            .foregroundStyle(look.ink)
            .focused($focused, equals: "key")
            .disabled(checking)
            .onSubmit { Task { await connect() } }
            .onChange(of: key) { if case .refused = outcome { outcome = nil } }
            .storeBox(width: nil, focused: focused == "key", look: look)
          ForEach(provider.fields) { one in
            VStack(alignment: .leading, spacing: 5) {
              Text(one.name)
                .font(PanelType.detail)
                .foregroundStyle(look.inkSecondary)
              TextField(one.name, text: Binding(get: { fields[one.key] ?? "" }, set: { fields[one.key] = $0 }), prompt: Text(verbatim: one.placeholder).foregroundStyle(look.inkTertiary))
                .textFieldStyle(.plain)
                .labelsHidden()
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(look.ink)
                .autocorrectionDisabled()
                .focused($focused, equals: one.key)
                .disabled(checking)
                .onSubmit { Task { await connect() } }
                .storeBox(width: nil, focused: focused == one.key, look: look)
              if let note = one.note {
                Text(note)
                  .font(.system(size: 11))
                  .foregroundStyle(look.inkTertiary)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
        }
      }
      if case .refused(let problem) = outcome {
        Text(problem)
          .font(PanelType.row)
          .foregroundStyle(look.danger)
          .fixedSize(horizontal: false, vertical: true)
      }
      SheetWideButton(
        title: checking ? String(localized: "Checking with \(provider.name)…") : String(localized: "Connect"),
        busy: checking,
        enabled: checking || ready
      ) {
        Task { await connect() }
      }
      .padding(.top, 4)
    }
  }

  /** The key tried at the provider through the server; refused, it is cleared, never kept here. */
  private func connect() async {
    guard ready, !checking else { return }
    checking = true
    let answer = await model.connectKey(provider.provider, key: key, fields: fields)
    checking = false
    outcome = answer
    if case .refused = answer { key = ""; focused = "key" }
  }
}

/** One step of the sheet: its number in a grey disc, its words, and what goes with it under them. */
private struct MacConnectStep<Content: View>: View {
  let number: Int
  let title: String
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Text(verbatim: "\(number)")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(look.ink)
        .frame(width: 22, height: 22)
        .background(Circle().fill(look.groupedGround))
      VStack(alignment: .leading, spacing: 10) {
        Text(title)
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
        content()
      }
    }
  }
}

// MARK: - The model on the composer

/**
 * The model the agents use, on the composer (9 November 2026; the founder:
 * "the model chosen is on the composer. not on the setting app. ours will
 * have the logo though", from Reason's): at the field's right before the
 * microphone, the chosen model's mark and its name in the field's grey, at
 * the field's size, centred on the microphone (the founder, the same day:
 * "look at how unpropotionate it is"); then, on the person's own plan, how
 * hard it thinks ("High ⌄", Reason's), its menu Light, Medium, High, Extra
 * High, Max. Simeon's mark and "Simeon" while the agents use Simeon's
 * models. Each opens Apple's menu upward from itself (its foot 4 over the
 * button's top): Simeon, then each connected provider with its models in a
 * submenu, the chosen one ticked, then Add More…, which opens Settings › AI
 * Models. The choice is the account's (`models/own`), for every agent.
 */
struct ComposerModelMenu: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(SettingsState.self) private var settings
  @State private var modelSpot = WindowSpot()
  @State private var effortSpot = WindowSpot()

  var body: some View {
    let model = store.aiModels
    HStack(spacing: 2) {
      Button {
        ComposerModelMenus.showModels(over: modelSpot.frame, model: model) { settings.open(.models) }
      } label: {
        HStack(spacing: 5) {
          ProviderMark(provider: model.chosenChoice?.provider, ink: look.inkSecondary, side: 13)
          Text(verbatim: model.composerName)
            .font(PanelType.row)
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
          if model.effortName == nil {
            Image(systemName: "chevron.down")
              .font(.system(size: 8, weight: .semibold))
              .foregroundStyle(look.inkTertiary)
          }
        }
        .padding(.horizontal, 6)
        .frame(height: 28)
        .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .background(WindowSpotReader(spot: modelSpot))
      .accessibilityLabel(String(localized: "Model"))
      .accessibilityValue(model.composerName)
      if let effortName = model.effortName {
        Button {
          ComposerModelMenus.showEfforts(over: effortSpot.frame, model: model)
        } label: {
          HStack(spacing: 4) {
            Text(verbatim: effortName)
              .font(PanelType.row)
              .foregroundStyle(look.ink)
              .lineLimit(1)
            Image(systemName: "chevron.down")
              .font(.system(size: 8, weight: .semibold))
              .foregroundStyle(look.inkSecondary)
          }
          .padding(.horizontal, 9)
          .frame(height: 24)
          .background(look.wash, in: Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.hand)
        .background(WindowSpotReader(spot: effortSpot))
        .accessibilityLabel(String(localized: "Thinking effort"))
        .accessibilityValue(effortName)
      }
    }
    .frame(height: 36)
    .fixedSize()
    .disabled(model.choosing)
    .task { if !model.loaded { await model.load() } }
  }
}

/** The composer's two menus, Apple's, opening upward from their buttons, their foot 4 over the button's top. */
@MainActor
enum ComposerModelMenus {
  static func showModels(over button: CGRect, model: AIModelsModel, addMore: @escaping () -> Void) {
    let handler = Handler()
    let menu = NSMenu()
    menu.autoenablesItems = false
    menu.addItem(handler.item(AIModels.simeon, image: mark(nil), on: model.chosen == nil) { Task { await model.choose(nil) } })
    for choice in model.choices {
      let item = NSMenuItem(title: AIModels.providerName(choice.provider), action: nil, keyEquivalent: "")
      item.image = mark(choice.provider)
      // Ticked while one of its models is in use.
      item.state = model.chosenChoice?.provider == choice.provider ? .on : .off
      let models = NSMenu()
      for option in choice.models {
        models.addItem(handler.item(option.name, on: model.chosen == option.id) { Task { await model.choose(option.id) } })
      }
      item.submenu = models
      menu.addItem(item)
    }
    menu.addItem(.separator())
    menu.addItem(handler.item(String(localized: "Add More…"), action: addMore))
    pop(menu, handler: handler, over: button)
  }

  static func showEfforts(over button: CGRect, model: AIModelsModel) {
    let handler = Handler()
    let menu = NSMenu()
    menu.autoenablesItems = false
    for level in model.efforts {
      menu.addItem(handler.item(AIModels.effortName(level), on: model.effort == level) { Task { await model.chooseEffort(level) } })
    }
    pop(menu, handler: handler, over: button)
  }

  /** A provider's mark at the menu's size (Simeon's for none): the template ones in the menu's ink, Claude's in its orange. */
  private static func mark(_ provider: String?) -> NSImage? {
    guard let image = NSImage(named: provider.map { "Providers/\($0)-mark" } ?? "Providers/simeon-mark")?.copy() as? NSImage else { return nil }
    image.size = NSSize(width: 16, height: 16)
    image.isTemplate = provider != AIModels.claude
    return image
  }

  private static func pop(_ menu: NSMenu, handler: Handler, over button: CGRect) {
    // The handler lives as long as the menu.
    objc_setAssociatedObject(menu, &Handler.key, handler, .OBJC_ASSOCIATION_RETAIN)
    guard let window = NSApp.keyWindow ?? MacServices.shared.mainWindow, let view = window.contentView else { return }
    // Its foot 4 over the button's top, at the button's left: the composer is at the window's foot.
    let point = button == .zero ? window.mouseLocationOutsideOfEventStream : NSPoint(x: button.minX, y: button.maxY + 4 + menu.size.height)
    menu.popUp(positioning: nil, at: view.convert(point, from: nil), in: view)
  }

  final class Handler: NSObject {
    nonisolated(unsafe) static var key = 0
    private var actions: [() -> Void] = []

    func item(_ title: String, image: NSImage? = nil, on: Bool = false, action: @escaping () -> Void) -> NSMenuItem {
      let item = NSMenuItem(title: title, action: #selector(run(_:)), keyEquivalent: "")
      item.target = self
      item.tag = actions.count
      item.image = image
      item.state = on ? .on : .off
      actions.append(action)
      return item
    }

    @MainActor @objc func run(_ sender: NSMenuItem) {
      guard actions.indices.contains(sender.tag) else { return }
      actions[sender.tag]()
    }
  }
}

/** A provider's mark, bare, as the composer shows it (the founder's "✳ Claude Opus 5.5", "⌘ Simeon"): ChatGPT's and Simeon's in the ink, Claude's in its orange; no provider is Simeon's. */
struct ProviderMark: View {
  let provider: String?
  let ink: Color
  var side: CGFloat = 14

  var body: some View {
    Image(provider.map { "Providers/\($0)-mark" } ?? "Providers/simeon-mark")
      .renderingMode(provider == AIModels.claude ? .original : .template)
      .resizable()
      .interpolation(.high)
      .aspectRatio(contentMode: .fit)
      .foregroundStyle(ink)
      .frame(width: side, height: side)
      .accessibilityHidden(true)
  }
}
