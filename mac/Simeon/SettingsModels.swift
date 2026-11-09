import AppKit
import SwiftUI
import SimeonCore

// MARK: - AI Models

/**
 * AI Models (8 November 2026; the founder: "allow people to bring their own
 * subscriptions and charge only for the computer", "do it exactly like
 * Reason", then "use codex sign in"): what it is for in a line (9 November:
 * "Connect providers and choose the models your agents use"); the model
 * the agents use (Simeon's, or one of the person's own); the accounts
 * connected, each its name, its kind and plan, how it stands and a `⋯`
 * (Rename, Connect Again, Disconnect); then Subscriptions, each provider
 * with its own logo and nothing under its name: ChatGPT's Connect, which
 * opens the code sheet, and Claude's (9 November 2026), which signs in to
 * Claude Code on the person's computer. The model
 * (`AIModelsModel`) is the shared core's, as the iPhone's page and the web
 * app's are.
 */
struct SettingsModelsPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model: AIModelsModel?
  @State private var connectingChatGPT = false
  @State private var connectingClaude = false
  @State private var renaming: ModelAccount?
  @State private var newName = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Connect providers and choose the models your agents use.")
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .fixedSize(horizontal: false, vertical: true)
      if let model {
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
          if !model.models.isEmpty {
            SettingsGroup(title: String(localized: "Your agents use"), footer: String(localized: "When your plan's limit is reached, your agents use Simeon's models until it resets."), look: look) {
              SettingsMenu(
                label: String(localized: "Model"),
                options: [(value: String?.none, label: AIModels.simeonsModels)] + model.models.map { (value: Optional($0.id), label: $0.name) },
                value: model.chosen,
                pending: model.choosing,
                look: look
              ) { picked in Task { await model.choose(picked) } }
            }
          }
          if !model.accounts.isEmpty {
            SettingsGroup(title: String(localized: "Connected"), look: look) {
              ForEach(Array(model.accounts.enumerated()), id: \.element.id) { index, account in
                MacModelAccountLine(
                  account: account,
                  divided: index > 0,
                  look: look,
                  rename: { newName = account.label; renaming = account },
                  connectAgain: {
                    if account.provider == AIModels.claude { connectingClaude = true } else { connectingChatGPT = true }
                  },
                  disconnect: { askToDisconnect(account, model: model) }
                )
              }
            }
          }
          SettingsGroup(title: String(localized: "Subscriptions"), footer: String(localized: "Voice calls, dictation and video still use your Simeon credits."), look: look) {
            MacProviderLine(provider: AIModels.chatGPT, look: look) {
              SettingsPill(title: model.connected(AIModels.chatGPT) ? String(localized: "Add Another") : String(localized: "Connect"), look: look) { connectingChatGPT = true }
            }
            // Claude: Claude Code on the person's computer, one sign-in there (docs/your-own-models.md, section 6).
            MacProviderLine(provider: AIModels.claude, divided: true, look: look) {
              if !model.connected(AIModels.claude) {
                SettingsPill(title: String(localized: "Connect"), look: look) { connectingClaude = true }
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
    }
    .sheet(isPresented: $connectingChatGPT) {
      if let model { MacChatGPTConnectSheet(model: model) }
    }
    .sheet(isPresented: $connectingClaude) {
      if let model { MacClaudeConnectSheet(model: model) }
    }
    .alert("Rename account", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField(String(localized: "Account name"), text: $newName)
      Button("Rename") {
        if let account = renaming, let model { Task { await model.rename(account, to: newName) } }
        renaming = nil
      }
      Button("Cancel", role: .cancel) { renaming = nil }
    }
    .task {
      if model == nil { model = AIModelsModel(store: store) }
      await model?.load()
    }
  }

  private func askToDisconnect(_ account: ModelAccount, model: AIModelsModel) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = String(localized: "Disconnect \(account.label)?")
    alert.informativeText = String(localized: "Your agents stop using this account. You can connect it again anytime.")
    alert.addButton(withTitle: String(localized: "Disconnect"))
    alert.addButton(withTitle: String(localized: "Cancel")).keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      Task { await model.disconnect(account) }
    }
  }
}

/** A provider's row under Subscriptions: its logo, its name, and its Connect; a line above it when it follows another. */
private struct MacProviderLine<Trailing: View>: View {
  let provider: String
  var divided = false
  let look: Look
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 12) {
      MacProviderTile(provider: provider, look: look, side: 28)
      Text(verbatim: AIModels.providerName(provider))
        .font(PanelType.row)
        .foregroundStyle(look.ink)
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
 * A provider's logo on the grey tile (`Providers/<provider>`, the founder's
 * files, 9 November 2026): ChatGPT's knot in the ink, so white in dark mode;
 * Claude's mark in its own orange.
 */
struct MacProviderTile: View {
  let provider: String
  let look: Look
  var side: CGFloat = 36

  var body: some View {
    Image("Providers/\(provider)")
      .renderingMode(provider == AIModels.chatGPT ? .template : .original)
      .resizable()
      .interpolation(.high)
      .aspectRatio(contentMode: .fit)
      .foregroundStyle(look.ink)
      .frame(width: side * 0.6, height: side * 0.6)
      .frame(width: side, height: side)
      .background(look.logoTile)
      .clipShape(RoundedRectangle(cornerRadius: side * 11 / 40))
      .accessibilityHidden(true)
  }
}

/** One account: the provider's tile, its name over its kind and plan and how it stands (green while usable), and `⋯`. */
private struct MacModelAccountLine: View {
  let account: ModelAccount
  let divided: Bool
  let look: Look
  let rename: () -> Void
  let connectAgain: () -> Void
  let disconnect: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      MacProviderTile(provider: account.provider, look: look, side: 28)
      VStack(alignment: .leading, spacing: 2) {
        Text(account.label).font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
        HStack(spacing: 0) {
          Text(verbatim: "\(account.detail) · ").foregroundStyle(look.inkSecondary)
          Text(account.statusWords()).foregroundStyle(account.usable() ? look.settingsGreen : account.status == .signedOut ? look.danger : look.inkSecondary)
        }
        .font(PanelType.detail)
        .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Menu {
        Button("Rename", action: rename)
        if account.status == .signedOut {
          Button("Connect Again", action: connectAgain)
        }
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
 * Connect ChatGPT (Reason's sheet: "Copy this code", "Enter it on … and
 * approve", "Waiting for you to approve…"): the code, big, with Copy; the
 * page to enter it on, with Open; a line saying OpenAI's page names Codex
 * (the sign-in Simeon uses for ChatGPT until OpenAI approves its own); the
 * wait. Connected, it says which model the agents now use. The code lasts
 * 15 minutes; closing the sheet stops the asking.
 */
struct MacChatGPTConnectSheet: View {
  let model: AIModelsModel
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
        MacProviderTile(provider: AIModels.chatGPT, look: look, side: 36)
        Text("Connect ChatGPT")
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
    .background(look.groupedGround)
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
        Text("Your agents now use \(model.chosenName).")
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      footer(look, title: String(localized: "Done"))
    case .some(.expired), .some(.failed):
      Text(outcome == .expired ? String(localized: "The code expired. Try again.") : String(localized: "ChatGPT didn't connect. Try again."))
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
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(look.groupedRow))
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
      Text("OpenAI's page names Codex: it's the sign-in Simeon uses for ChatGPT.")
        .font(PanelType.detail)
        .foregroundStyle(look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 10) {
        ProgressView().controlSize(.small)
        Text("Waiting for you to approve…").font(PanelType.row).foregroundStyle(look.inkSecondary)
      }
    }
  }

  private func tryAgain(_ look: Look) -> some View {
    HStack {
      Spacer()
      SettingsPill(title: String(localized: "Try Again"), look: look) { attempt += 1 }
    }
  }

  private func footer(_ look: Look, title: String) -> some View {
    HStack {
      Spacer()
      Button { dismiss() } label: {
        Text(title)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.white)
          .frame(minWidth: 96)
          .frame(height: 32)
      }
      .prominentGlassButton()
      .tint(look.yours)
      .keyboardShortcut(.defaultAction)
      .handCursor()
    }
  }

  /** A code, then the wait for the person's approval; a new attempt starts afresh. Closing the sheet cancels it. */
  private func run() async {
    signIn = nil
    outcome = nil
    copied = false
    model.problem = nil
    guard let started = await model.startChatGPT() else { return }
    signIn = started
    let answer = await model.waitForApproval(started)
    guard !Task.isCancelled, answer != .waiting else { return }
    outcome = answer
  }
}

/**
 * Connect Claude (9 November 2026; the founder's screenshot of Reason's:
 * Claude Code's own sign-in): the computer starts Claude Code's sign-in; 1,
 * Claude's page, with Open (the default browser); 2, the code Claude shows,
 * pasted and sent to Claude Code on the computer; a line saying the sign-in
 * stays there. Connected, it says which model the agents now use. Closed
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

  var body: some View {
    let look = Look(scheme)
    VStack(alignment: .leading, spacing: 20) {
      HStack(spacing: 12) {
        MacProviderTile(provider: AIModels.claude, look: look, side: 36)
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
    .background(look.groupedGround)
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
        Text("Your agents now use \(model.chosenName).")
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      HStack {
        Spacer()
        Button { dismiss() } label: {
          Text("Done")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(minWidth: 96)
            .frame(height: 32)
        }
        .prominentGlassButton()
        .tint(look.yours)
        .keyboardShortcut(.defaultAction)
        .handCursor()
      }
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
        HStack(spacing: 10) {
          ProgressView().controlSize(.small)
          Text("Starting Claude Code on your computer…").font(PanelType.row).foregroundStyle(look.inkSecondary)
        }
      }
    }
  }

  private func steps(_ signIn: ClaudeSignIn, look: Look) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      MacConnectStep(number: 1, title: String(localized: "Open Claude's page and approve"), look: look) {
        SettingsPill(title: String(localized: "Open"), look: look) { NSWorkspace.shared.open(signIn.url) }
      }
      MacConnectStep(number: 2, title: String(localized: "Paste the code Claude shows"), look: look) {
        HStack(spacing: 12) {
          TextField(String(localized: "Code"), text: $code)
            .textFieldStyle(.roundedBorder)
            .font(.system(size: 13, design: .monospaced))
            .frame(width: 240)
            .disabled(finishing)
            .onSubmit { Task { await finish() } }
          if finishing {
            ProgressView().controlSize(.small)
          } else {
            SettingsPill(title: String(localized: "Connect"), disabled: code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, look: look) {
              Task { await finish() }
            }
          }
        }
      }
      Text("Claude Code runs on your computer and keeps this sign-in there. Simeon never sees it.")
        .font(PanelType.detail)
        .foregroundStyle(look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func tryAgain(_ look: Look) -> some View {
    HStack {
      Spacer()
      SettingsPill(title: String(localized: "Try Again"), look: look) { attempt += 1 }
    }
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
        .background(Circle().fill(look.groupedRow))
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
