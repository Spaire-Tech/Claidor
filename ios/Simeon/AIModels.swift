import SimeonCore
import SwiftUI
import UIKit

/**
 * AI Models (8 November 2026; the founder: "allow people to bring their own
 * subscriptions and charge only for the computer", "do it exactly like
 * Reason", then "use codex sign in"), as plain as Wallet: what it is for;
 * the accounts connected, each its app's icon, its name and "Subscription"
 * (how it stands only when it can't be used), with `⋯` (Add Another for
 * ChatGPT, Connect Again, Rename, Disconnect); Subscriptions, the providers
 * not yet connected, each its app's icon, its name and Connect. 9 November,
 * the founder: "do not duplicate the subscription", "just have subscription
 * there", the icons whole as Wallet's Link and Shop, and the model chosen on
 * the composer (`ComposerModelMenu`), not here. The Mac's page
 * (mac/Simeon/SettingsModels.swift) and the web app's say the same; the
 * model is the shared core's, one for the app (`store.aiModels`).
 */
struct AIModelsPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @State private var connectingChatGPT = false
  @State private var connectingClaude = false
  @State private var renaming: ModelAccount?
  @State private var newName = ""
  @State private var disconnecting: ModelAccount?

  var body: some View {
    let model = store.aiModels
    Form {
      Section {
        Text("Connect providers and choose the models your agents use.")
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
      }
      .listRowBackground(Color.clear)
      if let problem = model.problem, !model.loaded {
        Section {
          Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger)
          Button("Try Again") { Task { await model.load() } }
        }
        .listRowBackground(Ink.groupedRow)
      } else if !model.loaded {
        Section { HStack { Spacer(); ProgressView(); Spacer() } }
          .listRowBackground(Color.clear)
      } else {
        let open = model.unconnected
        if !model.accounts.isEmpty {
          Section {
            ForEach(model.accounts) { account in
              ModelAccountRow(
                account: account,
                rename: { newName = account.label; renaming = account },
                addAnother: account.provider == AIModels.chatGPT ? { connectingChatGPT = true } : nil,
                connectAgain: { connect(account.provider) },
                disconnect: { disconnecting = account }
              )
            }
          } header: {
            Text("Connected")
          } footer: {
            if open.isEmpty { Text("Voice calls, dictation and video still use your Simeon credits.") }
          }
          .listRowBackground(Ink.groupedRow)
        }
        if !open.isEmpty {
          Section {
            ForEach(open, id: \.self) { provider in
              HStack(spacing: 14) {
                ProviderIcon(provider: provider, size: 30)
                Text(verbatim: AIModels.providerName(provider)).font(.system(size: 17)).foregroundStyle(Ink.primary)
                Spacer(minLength: 8)
                Button(String(localized: "Connect")) { connect(provider) }
                  .foregroundStyle(Ink.link)
                  .buttonStyle(.borderless)
              }
              .padding(.vertical, 2)
            }
          } header: {
            Text("Subscriptions")
          } footer: {
            Text("Voice calls, dictation and video still use your Simeon credits.")
          }
          .listRowBackground(Ink.groupedRow)
        }
        if let problem = model.problem {
          Section { Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger) }
            .listRowBackground(Ink.groupedRow)
        }
      }
    }
    .groupedGround()
    .navigationTitle("AI Models")
    .inlineBarTitle()
    .sheet(isPresented: $connectingChatGPT) {
      NavigationStack { ChatGPTConnectSheet(model: model) }
    }
    .sheet(isPresented: $connectingClaude) {
      NavigationStack { ClaudeConnectSheet(model: model) }
    }
    .alert("Rename account", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField(String(localized: "Account name"), text: $newName)
      Button("Rename") {
        if let account = renaming { Task { await model.rename(account, to: newName) } }
        renaming = nil
      }
      Button("Cancel", role: .cancel) { renaming = nil }
    }
    .alert(
      disconnecting.map { String(localized: "Disconnect \($0.label)?") } ?? "",
      isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } })
    ) {
      Button("Disconnect", role: .destructive) {
        if let account = disconnecting { Task { await model.disconnect(account) } }
        disconnecting = nil
      }
      Button("Cancel", role: .cancel) { disconnecting = nil }
    } message: {
      Text("Your agents stop using this account. You can connect it again anytime.")
    }
    .task { await model.load() }
  }

  /** A provider's sign-in: ChatGPT's code sheet, or Claude's (Claude Code on the computer). */
  private func connect(_ provider: String) {
    if provider == AIModels.claude { connectingClaude = true } else { connectingChatGPT = true }
  }
}

/**
 * A provider's app icon, whole, as Wallet and Connectors draw an app's
 * (`ConnectorTile`'s icon; the founder, 9 November 2026: "how link and shop
 * have their full logo, not inside a box"): ChatGPT's and Claude's own, from
 * the App Store (`Providers/<provider>`).
 */
struct ProviderIcon: View {
  let provider: String
  var size: CGFloat = 30

  var body: some View {
    if let icon = UIImage(named: "Providers/\(provider)") {
      let shape = RoundedRectangle(cornerRadius: size * ConnectorLogo.iconCorner, style: .continuous)
      Image(uiImage: icon)
        .resizable()
        .interpolation(.high)
        .scaledToFill()
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(shape.stroke(Ink.tileEdge, lineWidth: 0.5))
        .accessibilityHidden(true)
    } else {
      ConnectorTile(name: AIModels.providerName(provider), size: size)
    }
  }
}

/** A provider's mark, bare, as the composer shows it (the founder's "✳ Claude Opus 5.5", "⌘ Simeon"): ChatGPT's and Simeon's in the ink, Claude's in its orange; no provider is Simeon's. */
struct ProviderMark: View {
  let provider: String?
  var side: CGFloat = 16

  var body: some View {
    Image(provider.map { "Providers/\($0)-mark" } ?? "Providers/simeon-mark")
      .renderingMode(provider == AIModels.claude ? .original : .template)
      .resizable()
      .interpolation(.high)
      .scaledToFit()
      .foregroundStyle(Ink.primary)
      .frame(width: side, height: side)
      .accessibilityHidden(true)
  }
}

/**
 * The model the agents use, on the composer (9 November 2026; the founder:
 * "the model chosen is on the composer. not on the setting app. ours will
 * have the logo though"): inside the field before the microphone, the
 * chosen model's mark and a chevron (the phone's field has no room for the
 * name; the menu says it); Simeon's mark while the agents use Simeon's
 * models. The menu: Simeon, then each connected provider with its models,
 * the chosen one ticked, then Add More…, which opens Settings › AI Models.
 * The choice is the account's (`models/own`), for every agent.
 */
struct ComposerModelMenu: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @State private var addingMore = false

  var body: some View {
    let model = store.aiModels
    Menu {
      Toggle(isOn: Binding(get: { model.chosen == nil }, set: { if $0 { Task { await model.choose(nil) } } })) {
        Label { Text(verbatim: AIModels.simeon) } icon: { Image("Providers/simeon-mark") }
      }
      ForEach(model.choices) { choice in
        Menu {
          ForEach(choice.models) { option in
            Toggle(option.name, isOn: Binding(get: { model.chosen == option.id }, set: { if $0 { Task { await model.choose(option.id) } } }))
          }
        } label: {
          Label { Text(verbatim: AIModels.providerName(choice.provider)) } icon: { Image("Providers/\(choice.provider)-mark") }
        }
      }
      Divider()
      Button(String(localized: "Add More…")) { addingMore = true }
    } label: {
      HStack(spacing: 3) {
        ProviderMark(provider: model.chosenChoice?.provider, side: 17)
        Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ink.secondary)
      }
      .frame(height: 36)
      .padding(.horizontal, 4)
      .contentShape(.rect)
    }
    .disabled(model.choosing)
    .accessibilityLabel(String(localized: "Model"))
    .accessibilityValue(model.composerName)
    .task { if !model.loaded { await model.load() } }
    .sheet(isPresented: $addingMore) {
      NavigationStack {
        AIModelsPage()
          .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { addingMore = false } } }
      }
    }
  }
}

/** One account: its app's icon, its name over "Subscription" (and how it stands, only when it can't be used), and `⋯`. */
private struct ModelAccountRow: View {
  let account: ModelAccount
  let rename: () -> Void
  /** ChatGPT's: another ChatGPT account, from here rather than a second row under Subscriptions. */
  let addAnother: (() -> Void)?
  let connectAgain: () -> Void
  let disconnect: () -> Void

  var body: some View {
    HStack(spacing: 14) {
      ProviderIcon(provider: account.provider, size: 30)
      VStack(alignment: .leading, spacing: 2) {
        Text(account.label).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
        Text(account.kindName).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
        if !account.usable() {
          Text(account.statusWords())
            .font(.system(size: 15))
            .foregroundStyle(account.status == .signedOut ? Ink.danger : Ink.secondary)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      Menu {
        if let addAnother {
          Button("Add Another", action: addAnother)
        }
        if account.status == .signedOut {
          Button("Connect Again", action: connectAgain)
        }
        Button("Rename", action: rename)
        Button("Disconnect", role: .destructive, action: disconnect)
      } label: {
        Image(systemName: "ellipsis.circle")
          .font(.system(size: 20))
          .foregroundStyle(Ink.secondary)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .accessibilityLabel(String(localized: "More"))
    }
    .padding(.vertical, 2)
  }
}

/**
 * Connect ChatGPT, as the Mac's sheet: "Copy this code", the code with
 * Copy; "Enter it on … and approve" with Open (Safari); OpenAI's page names
 * Codex; "Waiting for you to approve…" while the server is asked every few
 * seconds (on coming back from Safari too). Connected, it says which model
 * the agents use. Closing the sheet stops the asking.
 */
struct ChatGPTConnectSheet: View {
  let model: AIModelsModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var signIn: ChatGPTSignIn?
  @State private var outcome: ChatGPTPoll?
  @State private var copied = false
  @State private var attempt = 0

  var body: some View {
    Form {
      switch outcome {
      case .some(.connected):
        Section {
          Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(Ink.success)
          Text("Your agents now use \(model.chosenName).").foregroundStyle(Ink.primary)
        }
        .listRowBackground(Ink.groupedRow)
      case .some(.expired), .some(.failed):
        Section {
          Text(outcome == .expired ? String(localized: "The code expired. Try again.") : String(localized: "ChatGPT didn't connect. Try again."))
            .foregroundStyle(Ink.danger)
          Button("Try Again") { attempt += 1 }
        }
        .listRowBackground(Ink.groupedRow)
      default:
        if let signIn {
          Section {
            HStack(spacing: 12) {
              Text(verbatim: signIn.userCode)
                .font(.system(size: 26, weight: .medium, design: .monospaced))
                .foregroundStyle(Ink.primary)
                .textSelection(.enabled)
              Spacer(minLength: 8)
              Button(copied ? String(localized: "Copied") : String(localized: "Copy")) {
                UIPasteboard.general.string = signIn.userCode
                copied = true
              }
              .buttonStyle(.borderless)
              .foregroundStyle(Ink.link)
            }
          } header: {
            Text("1. Copy this code")
          }
          .listRowBackground(Ink.groupedRow)
          Section {
            Button {
              openURL(signIn.verificationURL)
            } label: {
              HStack {
                Text(verbatim: signIn.shownAddress).foregroundStyle(Ink.link)
                Spacer()
                Image(systemName: "arrow.up.right").foregroundStyle(Ink.secondary)
              }
            }
          } header: {
            Text("2. Enter it on \(signIn.shownAddress) and approve")
          } footer: {
            Text("OpenAI's page names Codex: it's the sign-in Simeon uses for ChatGPT.")
          }
          .listRowBackground(Ink.groupedRow)
          Section {
            HStack(spacing: 10) {
              ProgressView()
              Text("Waiting for you to approve…").foregroundStyle(Ink.secondary)
            }
          }
          .listRowBackground(Color.clear)
        } else if let problem = model.problem {
          Section {
            Text(problem).foregroundStyle(Ink.danger)
            Button("Try Again") { attempt += 1 }
          }
          .listRowBackground(Ink.groupedRow)
        } else {
          Section {
            HStack(spacing: 10) {
              ProgressView()
              Text("Getting a code…").foregroundStyle(Ink.secondary)
            }
          }
          .listRowBackground(Color.clear)
        }
      }
    }
    .groupedGround()
    .navigationTitle("Connect ChatGPT")
    .inlineBarTitle()
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        if case .some(.connected) = outcome {
          EmptyView()
        } else {
          Button("Cancel") { dismiss() }
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        if case .some(.connected) = outcome {
          Button("Done") { dismiss() }
        }
      }
    }
    .task(id: attempt) { await run() }
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
 * Connect Claude (9 November 2026), as the Mac's sheet: the computer starts
 * Claude Code's sign-in; "1. Open Claude's page and approve" (Safari); "2.
 * Paste the code Claude shows", sent to Claude Code on the computer; the
 * line that the sign-in stays there. Connected, it says which model the
 * agents use. Cancelled before the code, the computer's sign-in ends.
 */
struct ClaudeConnectSheet: View {
  let model: AIModelsModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var signIn: ClaudeSignIn?
  @State private var code = ""
  @State private var finishing = false
  @State private var outcome: ClaudeConnect?
  @State private var attempt = 0

  var body: some View {
    Form {
      switch outcome {
      case .some(.connected):
        Section {
          Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(Ink.success)
          Text("Your agents now use \(model.chosenName).").foregroundStyle(Ink.primary)
        }
        .listRowBackground(Ink.groupedRow)
      case .some(.refused), .some(.failed):
        Section {
          Text(outcome == .refused ? String(localized: "That code didn't work. Try again.") : (model.problem ?? String(localized: "That code didn't work. Try again.")))
            .foregroundStyle(Ink.danger)
          Button("Try Again") { attempt += 1 }
        }
        .listRowBackground(Ink.groupedRow)
      default:
        if let signIn {
          Section {
            Button {
              openURL(signIn.url)
            } label: {
              HStack {
                Text(verbatim: signIn.shownAddress).foregroundStyle(Ink.link)
                Spacer()
                Image(systemName: "arrow.up.right").foregroundStyle(Ink.secondary)
              }
            }
          } header: {
            Text("1. Open Claude's page and approve")
          }
          .listRowBackground(Ink.groupedRow)
          Section {
            HStack(spacing: 12) {
              TextField(String(localized: "Code"), text: $code)
                .font(.system(size: 17, design: .monospaced))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .disabled(finishing)
                .onSubmit { Task { await finish() } }
              if finishing {
                ProgressView()
              } else {
                Button(String(localized: "Connect")) { Task { await finish() } }
                  .buttonStyle(.borderless)
                  .foregroundStyle(Ink.link)
                  .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
              }
            }
          } header: {
            Text("2. Paste the code Claude shows")
          } footer: {
            Text("Claude Code runs on your computer and keeps this sign-in there. Simeon never sees it.")
          }
          .listRowBackground(Ink.groupedRow)
        } else if let problem = model.problem {
          Section {
            Text(problem).foregroundStyle(Ink.danger)
            Button("Try Again") { attempt += 1 }
          }
          .listRowBackground(Ink.groupedRow)
        } else {
          Section {
            HStack(spacing: 10) {
              ProgressView()
              Text("Starting Claude Code on your computer…").foregroundStyle(Ink.secondary)
            }
          }
          .listRowBackground(Color.clear)
        }
      }
    }
    .groupedGround()
    // Gone before the code (Cancel, or swiped down): the computer's sign-in ends.
    .onDisappear {
      if signIn != nil, outcome == nil { Task { await model.cancelClaude() } }
    }
    .navigationTitle("Connect Claude")
    .inlineBarTitle()
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        if case .some(.connected) = outcome {
          EmptyView()
        } else {
          Button("Cancel") { dismiss() }
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        if case .some(.connected) = outcome {
          Button("Done") { dismiss() }
        }
      }
    }
    .task(id: attempt) {
      signIn = nil
      outcome = nil
      code = ""
      finishing = false
      model.problem = nil
      signIn = await model.startClaude()
    }
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
}
