import SimeonCore
import SwiftUI
import UIKit

/**
 * AI Models (8 November 2026; the founder: "allow people to bring their own
 * subscriptions and charge only for the computer", "do it exactly like
 * Reason", then "use codex sign in"), as plain as Wallet: what it is for;
 * the model the agents use (Simeon's, or one of the person's own); the
 * accounts connected, each its name, its kind and plan and how it stands,
 * with `⋯` (Rename, Connect Again, Disconnect); Subscriptions, ChatGPT's
 * Connect opening the code sheet. The Mac's page (mac/Simeon/SettingsModels.swift)
 * and the web app's say the same; the model is the shared core's.
 */
struct AIModelsPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @State private var model: AIModelsModel?
  @State private var connecting = false
  @State private var renaming: ModelAccount?
  @State private var newName = ""
  @State private var disconnecting: ModelAccount?

  var body: some View {
    Form {
      Section {
        Text("Connect your own AI subscription. Your agents then think, search and draw on it, not on your Simeon credits.")
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
      }
      .listRowBackground(Color.clear)
      if let model {
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
          if !model.models.isEmpty {
            Section {
              Picker("Model", selection: Binding(get: { model.chosen }, set: { picked in Task { await model.choose(picked) } })) {
                Text(AIModels.simeonsModels).tag(String?.none)
                ForEach(model.models) { choice in
                  Text(choice.name).tag(Optional(choice.id))
                }
              }
              .disabled(model.choosing)
            } header: {
              Text("Your agents use")
            } footer: {
              Text("When your ChatGPT limit is reached, your agents use Simeon's models until it resets.")
            }
            .listRowBackground(Ink.groupedRow)
          }
          if !model.accounts.isEmpty {
            Section {
              ForEach(model.accounts) { account in
                ModelAccountRow(
                  account: account,
                  rename: { newName = account.label; renaming = account },
                  connectAgain: { connecting = true },
                  disconnect: { disconnecting = account }
                )
              }
            } header: {
              Text("Connected")
            }
            .listRowBackground(Ink.groupedRow)
          }
          Section {
            HStack(spacing: 14) {
              ConnectorTile(name: AIModels.providerName(AIModels.chatGPT), size: 30)
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: AIModels.providerName(AIModels.chatGPT)).font(.system(size: 17)).foregroundStyle(Ink.primary)
                Text("Use your ChatGPT plan").font(.system(size: 15)).foregroundStyle(Ink.secondary)
              }
              Spacer(minLength: 8)
              Button(model.connected(AIModels.chatGPT) ? String(localized: "Add Another") : String(localized: "Connect")) { connecting = true }
                .foregroundStyle(Ink.link)
                .buttonStyle(.borderless)
            }
            .padding(.vertical, 2)
          } header: {
            Text("Subscriptions")
          } footer: {
            Text("Voice calls, dictation and video still use your Simeon credits.")
          }
          .listRowBackground(Ink.groupedRow)
          if let problem = model.problem {
            Section { Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger) }
              .listRowBackground(Ink.groupedRow)
          }
        }
      }
    }
    .groupedGround()
    .navigationTitle("AI Models")
    .inlineBarTitle()
    .sheet(isPresented: $connecting) {
      if let model {
        NavigationStack { ChatGPTConnectSheet(model: model) }
      }
    }
    .alert("Rename account", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField(String(localized: "Account name"), text: $newName)
      Button("Rename") {
        if let account = renaming, let model { Task { await model.rename(account, to: newName) } }
        renaming = nil
      }
      Button("Cancel", role: .cancel) { renaming = nil }
    }
    .alert(
      disconnecting.map { String(localized: "Disconnect \($0.label)?") } ?? "",
      isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } })
    ) {
      Button("Disconnect", role: .destructive) {
        if let account = disconnecting, let model { Task { await model.disconnect(account) } }
        disconnecting = nil
      }
      Button("Cancel", role: .cancel) { disconnecting = nil }
    } message: {
      Text("Your agents stop using this account. You can connect it again anytime.")
    }
    .task {
      if model == nil { model = AIModelsModel(store: store) }
      await model?.load()
    }
  }
}

/** One account: the provider's tile, its name over its kind, plan and how it stands (green while usable), and `⋯`. */
private struct ModelAccountRow: View {
  let account: ModelAccount
  let rename: () -> Void
  let connectAgain: () -> Void
  let disconnect: () -> Void

  var body: some View {
    HStack(spacing: 14) {
      ConnectorTile(name: account.providerName, size: 30)
      VStack(alignment: .leading, spacing: 2) {
        Text(account.label).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
        Text(account.detail).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1)
        Text(account.statusWords())
          .font(.system(size: 15))
          .foregroundStyle(account.usable() ? Ink.success : account.status == .signedOut ? Ink.danger : Ink.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Menu {
        Button("Rename", action: rename)
        if account.status == .signedOut {
          Button("Connect Again", action: connectAgain)
        }
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
