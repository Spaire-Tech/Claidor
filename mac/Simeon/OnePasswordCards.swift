import AppKit
import SwiftUI
import SimeonCore

/**
 * The 1Password fill card (28 October 2026, SimeonCore's
 * `CredentialRequestCard`), as the Mac's secret card draws its request: the
 * login's name and the site, the agent's reason, Fill with 1Password
 * (confirmed with Touch ID) and Not now. Once answered, a pill and what went in.
 */
struct CredentialCardView: View {
  let entryId: String
  let agentId: String
  let card: CredentialRequestCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var busy = false
  @State private var refusal: String?

  var body: some View {
    CardShell(look: look) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 0) {
          Text(card.title)
            .font(.system(size: 14, weight: .medium)).tracking(-0.15)
            .foregroundStyle(card.state == .declined ? look.inkSecondary : look.ink)
            .cssLineHeight(22, size: 14, weight: .medium)
          Text(card.site).font(.system(size: 13)).tracking(-0.08).foregroundStyle(look.inkSecondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if let status = card.statusLine { StatusPill(text: status, look: look, dot: dot) }
      }
      switch card.state {
      case .open:
        if !card.purpose.isEmpty {
          Text(card.purpose).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary).cssLineHeight(22, size: 14).fixedSize(horizontal: false, vertical: true)
        }
        HStack(spacing: 8) {
          CardButton(title: String(localized: "Fill with 1Password"), prominent: true, look: look, action: fill)
          CardButton(title: String(localized: "Not now"), look: look) { run { refusal = await store.answerCredentialRequest(entryId, allow: false, in: agentId) } }
        }
        .disabled(busy)
        if let refusal { Text(refusal).font(.system(size: 13)).foregroundStyle(look.danger) }
        HStack(alignment: .top, spacing: 4) {
          Image(systemName: "lock.fill").font(.system(size: 9)).frame(width: 12, height: 12).padding(.top, 3)
          Text("From your vault shared with Simeon. Your agent never sees it.").font(.system(size: 13)).tracking(-0.08)
        }
        .foregroundStyle(look.inkTertiary)
      case .filled:
        if let line = card.outcomeLine { Text(line).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary) }
      case .failed:
        if let note = card.note { Text(note).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary) }
      case .filling, .declined:
        EmptyView()
      }
    }
  }

  private var dot: Color? {
    switch card.state {
    case .filled: look.working
    case .failed: look.danger
    case .filling: look.blue
    case .open, .declined: nil
    }
  }

  /** Touch ID first: no fill without it (the Mac's password when Touch ID can't). */
  private func fill() {
    run {
      guard await PurchaseApproval.confirm(reason: card.confirmReason) != nil else { return }
      refusal = await store.answerCredentialRequest(entryId, allow: true, in: agentId)
    }
  }

  private func run(_ work: @escaping () async -> Void) {
    guard !busy else { return }
    busy = true
    Task { await work(); busy = false }
  }
}

/**
 * The 1Password connect card (28 October 2026, SimeonCore's
 * `OnePasswordConnectCard`). Connect asks the person's 1Password app for the
 * shared vault and its read-only key (`MacOnePassword`), with Touch ID, and
 * sends the key to the agent's computer; with several 1Password accounts it
 * first asks which. The X is a decline.
 */
struct OnePasswordConnectCardView: View {
  let entryId: String
  let agentId: String
  let card: OnePasswordConnectCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var busy = false
  @State private var accounts: [MacOnePassword.Account] = []
  @State private var chosen: MacOnePassword.Account?
  @State private var failure: MacOnePassword.Failure?
  @State private var refusal: String?

  var body: some View {
    CardShell(look: look) {
      HStack(alignment: .top, spacing: 8) {
        Text("Connect 1Password")
          .font(.system(size: 14, weight: .medium)).tracking(-0.15)
          .foregroundStyle(card.state == .dismissed ? look.inkSecondary : look.ink)
          .cssLineHeight(22, size: 14, weight: .medium)
          .frame(maxWidth: .infinity, alignment: .leading)
        if card.state == .open {
          Button {
            run { await store.dismissOnePasswordConnect(entryId, in: agentId) }
          } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .medium)).foregroundStyle(look.inkSecondary)
              .frame(width: 20, height: 20).contentShape(RoundedRectangle(cornerRadius: 6))
          }
          .buttonStyle(.hand)
          .help("Dismiss without connecting")
          .accessibilityLabel("Dismiss")
        } else if let status = card.statusLine {
          StatusPill(text: status, look: look, dot: card.state == .connected ? look.working : nil)
        }
      }
      if card.state == .open {
        if let reason = card.reason {
          Text(reason).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary).cssLineHeight(22, size: 14).fixedSize(horizontal: false, vertical: true)
        }
        Text("Your 1Password app makes a vault named “Shared with Simeon” and a key that can only read it. Put in it the logins your agents may use; they fill them with your OK and never see them.")
          .font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary).cssLineHeight(22, size: 14).fixedSize(horizontal: false, vertical: true)
        if accounts.count > 1 {
          Picker("", selection: $chosen) {
            ForEach(accounts) { account in Text(account.label).tag(Optional(account)) }
          }
          .labelsHidden().pickerStyle(.menu).frame(maxWidth: 360, alignment: .leading)
        }
        HStack(spacing: 8) {
          CardButton(title: busy ? String(localized: "Connecting…") : String(localized: "Connect"), prominent: true, look: look, action: connect)
            .disabled(busy)
          if failure?.needsSetup == true {
            CardButton(title: String(localized: "How to set it up"), look: look) { NSWorkspace.shared.open(MacOnePassword.setupURL) }
          }
        }
        if let message = failure?.message ?? refusal {
          Text(message).font(.system(size: 13)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
        }
      } else if card.state == .connected, let account = card.account {
        Text(account).font(.system(size: 14)).tracking(-0.15).foregroundStyle(look.inkSecondary)
      }
    }
  }

  /** The accounts first (the picker when there are several), then the vault and its key, then the key to the computer. */
  private func connect() {
    run {
      failure = nil
      refusal = nil
      do {
        if accounts.isEmpty {
          accounts = try await MacOnePassword.accounts()
          chosen = accounts.first
          // With several accounts the person picks one, then presses Connect again.
          if accounts.count > 1 { return }
        }
        guard let account = chosen ?? accounts.first else { return }
        let made = try await MacOnePassword.connect(account)
        refusal = await store.connectOnePassword(token: made.token, vaultId: made.vaultId, vaultName: made.vaultName, accountEmail: made.accountEmail, entryId: entryId, in: agentId)
      } catch let error as MacOnePassword.Failure {
        failure = error
      } catch {
        refusal = error.localizedDescription
      }
    }
  }

  private func run(_ work: @escaping () async -> Void) {
    guard !busy else { return }
    busy = true
    Task { await work(); busy = false }
  }
}
