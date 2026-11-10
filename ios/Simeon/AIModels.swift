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
 *
 * API keys (10 November 2026, the founder: "Below subscription something
 * called api keys"): under Subscriptions, every provider the server lists in
 * the founder's order, each its tile, its name (and, for those with a plan
 * of their own, where to connect the plan instead) and Connect, or "Soon";
 * Connect asks as an app's does, then the key sheet (`KeyConnectSheet`). A
 * key connected is under Connected, "API key …a1b2".
 */
struct AIModelsPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  /** The provider whose code sheet is open (ChatGPT's, Grok's). */
  @State private var connectingByCode: String?
  @State private var connectingClaude = false
  @State private var renaming: ModelAccount?
  @State private var newName = ""
  @State private var disconnecting: ModelAccount?
  /** The consent an app's Connect shows, before a provider's first sign-in; Connect on it marks `confirmed`. */
  @State private var asking: ConnectConsent?
  @State private var pending: String?
  /** The key provider whose consent is up, then whose key sheet is open. */
  @State private var pendingKey: KeyProvider?
  @State private var keying: KeyProvider?
  @State private var confirmed = false

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
                rename: { newName = account.shownName; renaming = account },
                addAnother: account.kind == "api_key"
                  ? { keying = model.keyProvider(account.provider) }
                  : AIModels.signedInByCode.contains(account.provider) ? { connectingByCode = account.provider } : nil,
                connectAgain: {
                  if account.kind == "api_key" { keying = model.keyProvider(account.provider) } else { connect(account.provider) }
                },
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
                Button(String(localized: "Connect")) { ask(provider) }
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
        let keys = model.unconnectedKeys
        if !keys.isEmpty {
          Section {
            ForEach(keys) { one in
              HStack(spacing: 14) {
                ProviderIcon(provider: one.provider, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                  Text(verbatim: one.name).font(.system(size: 17)).foregroundStyle(Ink.primary)
                  if let hint = one.hint {
                    Text(hint).font(.system(size: 13)).foregroundStyle(Ink.secondary)
                  }
                }
                Spacer(minLength: 8)
                if one.available {
                  Button(String(localized: "Connect")) { askKey(one) }
                    .foregroundStyle(Ink.link)
                    .buttonStyle(.borderless)
                } else {
                  Text("Soon").font(.system(size: 15)).foregroundStyle(Ink.tertiary)
                }
              }
              .padding(.vertical, 2)
            }
          } header: {
            Text("API keys")
          } footer: {
            Text("Each provider bills the calls on your key.")
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
    // The sign-in opens once the consent has gone, as an app's Connect does.
    .sheet(item: $asking, onDismiss: {
      guard confirmed else { pending = nil; pendingKey = nil; return }
      confirmed = false
      if let key = pendingKey {
        pendingKey = nil
        keying = key
      } else if let provider = pending {
        pending = nil
        connect(provider)
      }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
    .sheet(isPresented: Binding(get: { connectingByCode != nil }, set: { if !$0 { connectingByCode = nil } })) {
      NavigationStack { ChatGPTConnectSheet(model: model, provider: connectingByCode ?? AIModels.chatGPT) }
    }
    .sheet(isPresented: $connectingClaude) {
      NavigationStack { ClaudeConnectSheet(model: model) }
    }
    .sheet(item: $keying) { provider in
      NavigationStack { KeyConnectSheet(model: model, provider: provider) }
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
      disconnecting.map { String(localized: "Disconnect \($0.shownName)?") } ?? "",
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

  /**
   * A provider's first Connect: the consent an app's Connect shows (9
   * November 2026, the founder: "have it like when you connect an app"),
   * then its sign-in.
   */
  private func ask(_ provider: String) {
    confirmed = false
    pending = provider
    asking = ConnectConsent(modelProvider: provider)
  }

  /** A key provider's Connect: the consent in a key's words, then the key sheet. */
  private func askKey(_ provider: KeyProvider) {
    confirmed = false
    pending = nil
    pendingKey = provider
    asking = ConnectConsent(keyProvider: provider.provider, name: provider.name)
  }

  /** A provider's sign-in: ChatGPT's code sheet, or Claude's. */
  private func connect(_ provider: String) {
    if provider == AIModels.claude { connectingClaude = true } else { connectingByCode = provider }
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

/** A provider's mark, bare, as the composer shows it (the founder's "✳ Claude Opus 5.5", "⌘ Simeon"): ChatGPT's and Simeon's in the ink; Claude's, Amazon Bedrock's and GitHub Copilot's in their own colours (10 November 2026, the founder's logos); no provider is Simeon's. */
struct ProviderMark: View {
  let provider: String?
  var side: CGFloat = 16

  /** The marks drawn in their own colours, not the ink. */
  static let coloured: Set<String> = [AIModels.claude, "bedrock", "copilot"]

  var body: some View {
    Image(provider.map { "Providers/\($0)-mark" } ?? "Providers/simeon-mark")
      .renderingMode(provider.map(ProviderMark.coloured.contains) == true ? .original : .template)
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
      // How hard it thinks, on the person's own plan (Light … Max; the Mac's and the web's "High ⌄").
      if !model.efforts.isEmpty {
        Divider()
        Menu {
          ForEach(model.efforts, id: \.self) { level in
            Toggle(AIModels.effortName(level), isOn: Binding(get: { model.effort == level }, set: { if $0 { Task { await model.chooseEffort(level) } } }))
          }
        } label: {
          Text("Thinking effort")
          if let effortName = model.effortName { Text(verbatim: effortName) }
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

/** One account: its app's icon, its name ("ChatGPT", never the e-mail) over "Subscription", how it stands beside `⋯` (a dot and its words: "Usage available" in green, "Signed out" in red), and `⋯`. */
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
        Text(account.shownName).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
        Text(account.kindName).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
      }
      Spacer(minLength: 8)
      // How it stands, beside `⋯` (the founder's reference: "● Usage available ⋯").
      let tint = account.usable() ? Ink.success : account.status == .signedOut ? Ink.danger : Ink.secondary
      HStack(spacing: 6) {
        Circle().fill(tint).frame(width: 7, height: 7)
        Text(account.statusWords()).font(.system(size: 15)).foregroundStyle(tint).lineLimit(1)
      }
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
 * Copy; "Enter it on … and approve" with Open (Safari); "Waiting for you
 * to approve…", nothing more, while the server is asked every few
 * seconds (on coming back from Safari too). Connected, it says which model
 * the agents use. Closing the sheet stops the asking.
 */
struct ChatGPTConnectSheet: View {
  let model: AIModelsModel
  /** ChatGPT, or Grok (10 November 2026: the same sheet, Grok's page and code). */
  var provider: String = AIModels.chatGPT
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
          Text("You're now connected to \(AIModels.providerName(provider)).").foregroundStyle(Ink.primary)
        }
        .listRowBackground(Ink.groupedRow)
      case .some(.expired), .some(.failed):
        Section {
          Text(outcome == .expired ? String(localized: "The code expired. Try again.") : provider == AIModels.grok ? String(localized: "Grok didn't connect. Try again.") : String(localized: "ChatGPT didn't connect. Try again."))
            .foregroundStyle(Ink.danger)
          Button("Try Again") { attempt += 1 }
        }
        .listRowBackground(Ink.groupedRow)
      case .some(.notAllowed):
        // Signed in, on a plan xAI doesn't let in here: why, and where to get one that is.
        Section {
          Text(AIModels.startProblem(code: "not_allowed", provider: provider)).foregroundStyle(Ink.primary)
          if let plans = AIModels.plansPage(provider) {
            Button("See Grok Plans") { openURL(plans) }
          }
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
    .navigationTitle("Connect \(AIModels.providerName(provider))")
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
    guard let started = await model.startCodeSignIn(provider) else { return }
    signIn = started
    let answer = await model.waitForApproval(started)
    guard !Task.isCancelled, answer != .waiting else { return }
    outcome = answer
  }
}

/**
 * Connect Claude (9 November 2026), as the Mac's sheet: the computer starts
 * Claude Code's sign-in; "1. Open Claude's page and approve" (Safari); "2.
 * Paste the code Claude shows", sent to the computer; nothing more (the
 * founder: "all the many explanation… needs gone"). Connected, it says which model the
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
          Text("You're now connected to \(AIModels.providerName(AIModels.claude)).").foregroundStyle(Ink.primary)
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
            HStack { Spacer(); ProgressView(); Spacer() }
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

/**
 * Connect a provider's API key (10 November 2026), as the Mac's sheet: "1.
 * Make a key on its page" (Safari); "2. Paste your API key", hidden as a
 * password is, and the details the provider needs (Azure's endpoint and
 * deployments, Cloudflare's account, Bedrock's region), each named; Connect.
 * The server tries the key at the provider before keeping it, so a refused
 * key is said here, in the provider's name. Connected, the key's best model
 * is chosen when the person had none.
 */
struct KeyConnectSheet: View {
  let model: AIModelsModel
  let provider: KeyProvider
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var key = ""
  @State private var fields: [String: String] = [:]
  @State private var checking = false
  @State private var outcome: KeyConnect?
  @FocusState private var keyFocused: Bool

  var body: some View {
    Form {
      if case .connected = outcome {
        Section {
          Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(Ink.success)
          Text("You're now connected to \(provider.name).").foregroundStyle(Ink.primary)
        }
        .listRowBackground(Ink.groupedRow)
      } else {
        if let page = provider.keyPage {
          Section {
            Button {
              openURL(page)
            } label: {
              HStack {
                Text(verbatim: page.host ?? page.absoluteString).foregroundStyle(Ink.link)
                Spacer()
                Image(systemName: "arrow.up.right").foregroundStyle(Ink.secondary)
              }
            }
          } header: {
            Text("1. Make a key on \(provider.name)'s page")
          }
          .listRowBackground(Ink.groupedRow)
        }
        Section {
          SecureField(String(localized: "API key"), text: $key)
            .font(.system(size: 17, design: .monospaced))
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($keyFocused)
            .disabled(checking)
            .onSubmit { Task { await connect() } }
          ForEach(provider.fields) { one in
            VStack(alignment: .leading, spacing: 4) {
              Text(one.name).font(.system(size: 13)).foregroundStyle(Ink.secondary)
              TextField(one.placeholder, text: Binding(get: { fields[one.key] ?? "" }, set: { fields[one.key] = $0 }))
                .font(.system(size: 17, design: .monospaced))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .disabled(checking)
              if let note = one.note {
                Text(note).font(.system(size: 12)).foregroundStyle(Ink.tertiary)
              }
            }
          }
        } header: {
          Text(provider.keyPage == nil ? String(localized: "Paste your API key") : String(localized: "2. Paste your API key"))
        }
        .listRowBackground(Ink.groupedRow)
        if case .refused(let problem) = outcome {
          Section { Text(problem).foregroundStyle(Ink.danger) }
            .listRowBackground(Ink.groupedRow)
        }
      }
    }
    .groupedGround()
    .navigationTitle(String(localized: "Connect \(provider.name)"))
    .inlineBarTitle()
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        if case .connected = outcome {
          EmptyView()
        } else {
          Button("Cancel") { dismiss() }
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        if case .connected = outcome {
          Button("Done") { dismiss() }
        } else if checking {
          ProgressView()
        } else {
          Button("Connect") { Task { await connect() } }
            .disabled(!ready)
        }
      }
    }
    .onAppear {
      fields = Dictionary(uniqueKeysWithValues: provider.fields.map { ($0.key, $0.defaultValue ?? "") })
      keyFocused = true
    }
  }

  private var ready: Bool {
    !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && provider.fields.allSatisfy { !(fields[$0.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  /** The key tried at the provider through the server; refused, it is cleared, never kept here. */
  private func connect() async {
    guard ready, !checking else { return }
    checking = true
    let answer = await model.connectKey(provider.provider, key: key, fields: fields)
    checking = false
    outcome = answer
    if case .refused = answer { key = ""; keyFocused = true }
  }
}
