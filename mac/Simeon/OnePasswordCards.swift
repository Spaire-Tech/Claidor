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
          Spacer(minLength: 0)
          CardButton(title: String(localized: "Not now"), look: look) { run { refusal = await store.answerCredentialRequest(entryId, allow: false, in: agentId) } }
          CardButton(title: String(localized: "Fill with 1Password"), prominent: true, look: look, action: fill)
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
        if card.state != .open, let status = card.statusLine {
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
        // Not now declines it, as the X did; Connect the main one at the right (10 November 2026).
        HStack(spacing: 8) {
          Spacer(minLength: 0)
          if failure?.needsSetup == true {
            CardButton(title: String(localized: "How to set it up"), look: look) { NSWorkspace.shared.open(MacOnePassword.setupURL) }
          }
          CardButton(title: String(localized: "Not now"), look: look) {
            run { await store.dismissOnePasswordConnect(entryId, in: agentId) }
          }
          .disabled(busy)
          .help("Dismiss without connecting")
          CardButton(title: busy ? String(localized: "Connecting…") : String(localized: "Connect"), prominent: true, look: look, action: connect)
            .disabled(busy)
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

/**
 * The Credentials Store's card (SimeonCore's `StoreEntryCard`), drawn as
 * the connector card: the site's icon (a card's mark, a person for contact
 * info) on its 40 tile, its name over one line, and its button at the
 * right; once saved, "Saved" in green as "Connected". A login asked for
 * reads as the founder's reference (10 November 2026): "Sign in to
 * Amazon", "Opens a secure form" and Open, which opens the secure form in
 * a sheet (`MacSecureFormSheet`): the email or username and the password,
 * saved in the store. A card or contact info has Add, which opens the
 * store's own sheet, filled.
 */
struct StoreEntryCardView: View {
  let entryId: String
  let agentId: String
  let card: StoreEntryCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model: CredentialsStoreModel?
  @State private var editing: MacCredentialEdit?
  @State private var signingIn = false

  private var signIn: Bool { card.kind == .login && card.asks }

  var body: some View {
    CardShell(look: look) {
      HStack(spacing: 12) {
        if card.kind == .card {
          MacPaymentMark(brand: nil, edge: look.ink.opacity(look.dark ? 0.16 : 0.12))
        } else {
          MacSiteIconTile(site: card.iconSite, title: card.title, contact: card.kind == .contact, side: 40, look: look)
        }
        VStack(alignment: .leading, spacing: 0) {
          Text(signIn ? String(localized: "Sign in to \(card.title)") : card.title)
            .font(.system(size: 13, weight: .medium))
            .tracking(-0.08)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .frame(height: 18)
          if let line = signIn ? String(localized: "Opens a secure form") : card.line {
            Text(line)
              .font(.system(size: 13))
              .tracking(-0.08)
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
              .truncationMode(.tail)
              .frame(height: 18)
              .help(line)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if card.isSaved {
          Text("Saved")
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(look.added)
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .background(look.addedWash, in: Capsule())
        } else if card.asks {
          CardButton(title: signIn ? String(localized: "Open") : String(localized: "Add"), look: look, action: open)
        }
      }
    }
    .sheet(item: $editing) { edit in
      if let model {
        MacCredentialSheet(model: model, edit: edit) { _ in
          Task { await store.answerStoreEntry(entryId, in: agentId, saved: true) }
        }
      }
    }
    .sheet(isPresented: $signingIn) {
      MacSecureFormSheet(
        title: String(localized: "Sign in to \(card.title)"),
        line: card.reason,
        fields: [
          UserFormCard.Field(id: "username", label: String(localized: "Email or username"), kind: .text, required: false),
          UserFormCard.Field(id: "password", label: String(localized: "Password"), kind: .password, secret: true),
        ],
        site: card.website,
        submitTitle: String(localized: "Save"),
        decline: { await store.answerStoreEntry(entryId, in: agentId, saved: false) },
        submit: saveLogin
      )
    }
  }

  /** A login asked for: the secure form; anything else: the store's sheet, filled (the saved contacts read for a card's billing address). */
  private func open() {
    let made = model ?? CredentialsStoreModel(store: store)
    model = made
    if signIn {
      signingIn = true
      return
    }
    editing = .filled(card.draft)
    if card.kind == .card { Task { await made.load() } }
  }

  /** The login saved in the store; the agent is told once it's there. */
  private func saveLogin(_ typed: [String: String], _ keep: Bool) async -> String? {
    let made = model ?? CredentialsStoreModel(store: store)
    model = made
    var draft = card.draft
    draft.username = typed["username"] ?? ""
    draft.password = typed["password"] ?? ""
    guard await made.save(draft) != nil else { return made.problem ?? String(localized: "That didn't work.") }
    await store.answerStoreEntry(entryId, in: agentId, saved: true)
    return nil
  }
}
