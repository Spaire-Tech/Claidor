import SwiftUI
import SimeonCore

/**
 * The 1Password fill card (28 October 2026, SimeonCore's
 * `CredentialRequestCard`): the login's name, the site and the agent's
 * reason; Fill with 1Password, confirmed with Face ID, lets the agent's
 * computer type it into the page; Not now is a decline. Once answered, a
 * pill and what went in.
 */
struct CredentialCardView: View {
  let entryId: String
  let agentId: String
  let card: CredentialRequestCard
  @Environment(AppStore.self) private var store
  @State private var busy = false
  @State private var refusal: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: "key.fill").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        VStack(alignment: .leading, spacing: 1) {
          Text(card.title).font(.system(size: 17, weight: .medium)).foregroundStyle(card.state == .declined ? Ink.secondary : Ink.primary)
          Text(card.site).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
        if let status = card.statusLine { StatusPill(text: status, dot: dot) }
      }
      switch card.state {
      case .open:
        if !card.purpose.isEmpty {
          Text(card.purpose).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        }
        // The cards' pills (10 November 2026): Not now grey, Fill the main one, last.
        CardPills {
          Button("Not now") { run { refusal = await store.answerCredentialRequest(entryId, allow: false, in: agentId) } }
            .buttonStyle(Tactile(look: CardPillStyle()))
          Button("Fill with 1Password") { fill() }
            .buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
        }
        .disabled(busy)
        Text("From your vault shared with Simeon. Your agent never sees it.").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        if let refusal { Text(refusal).font(.system(size: 13)).foregroundStyle(Ink.danger) }
      case .filled:
        if let line = card.outcomeLine { Text(line).font(.system(size: 15)).foregroundStyle(Ink.secondary) }
      case .failed:
        if let note = card.note { Text(note).font(.system(size: 15)).foregroundStyle(Ink.secondary) }
      case .filling, .declined:
        EmptyView()
      }
    }
    .card()
  }

  private var dot: Color {
    switch card.state {
    case .filled: Ink.live
    case .failed: Ink.danger
    case .filling: Ink.blue
    case .open, .declined: Ink.tertiary
    }
  }

  /** Face ID first: no fill without it (the passcode when Face ID can't). */
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
 * `OnePasswordConnectCard`). 1Password is connected from Simeon on a Mac,
 * where the 1Password app makes the shared vault and its key; here the card
 * says so, and Not now is a decline.
 */
struct OnePasswordConnectCardView: View {
  let entryId: String
  let agentId: String
  let card: OnePasswordConnectCard
  @Environment(AppStore.self) private var store
  @State private var busy = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: "key.fill").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        Text("Connect 1Password").font(.system(size: 17, weight: .medium)).foregroundStyle(card.state == .dismissed ? Ink.secondary : Ink.primary)
        Spacer(minLength: 0)
        if card.state != .open, let status = card.statusLine {
          StatusPill(text: status, dot: card.state == .connected ? Ink.live : Ink.tertiary)
        }
      }
      if card.state == .open {
        if let reason = card.reason { Text(reason).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true) }
        Text("Open Simeon on your Mac to connect it: your 1Password app makes a vault shared with Simeon, and your agent fills sign-ins from it with your OK.")
          .font(.system(size: 15)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        // Not now declines it, as the X did (10 November 2026).
        CardPills {
          Button("Not now") {
            guard !busy else { return }
            busy = true
            Task { await store.dismissOnePasswordConnect(entryId, in: agentId); busy = false }
          }
          .buttonStyle(Tactile(look: CardPillStyle()))
          .disabled(busy)
        }
      } else if card.state == .connected, let account = card.account {
        Text(account).font(.system(size: 15)).foregroundStyle(Ink.secondary)
      }
    }
    .card()
  }
}

/**
 * The Credentials Store's card (9 November 2026, SimeonCore's
 * `StoreEntryCard`), drawn as the connector card (`ConnectorCard`; 10
 * November 2026, the founder: "Can you respect our design"): the site's
 * icon (a card's mark, a person for contact info) on its 40 tile, its name
 * over one line, and at its right Save (a login) or Add in the grey
 * capsule, which opens the store's own editor over the chat already
 * filled; once saved, "Saved" in green with its tick, as "Connected".
 */
struct StoreEntryCardView: View {
  let entryId: String
  let agentId: String
  let card: StoreEntryCard
  @Environment(AppStore.self) private var store
  @State private var model: CredentialsStoreModel?
  @State private var editing = false

  var body: some View {
    HStack(spacing: 12) {
      if card.kind == .card {
        PaymentMark(brand: nil)
      } else {
        SiteIconTile(site: card.iconSite, title: card.title, contact: card.kind == .contact, size: 40)
      }
      VStack(alignment: .leading, spacing: 0) {
        Text(card.title).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        if let line = card.line { Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1) }
      }
      Spacer(minLength: 0)
      if card.isSaved {
        Label("Saved", systemImage: "checkmark").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.success).labelStyle(.titleAndIcon)
      } else if card.asks {
        Button(card.kind == .login ? String(localized: "Save") : String(localized: "Add")) { open() }
          .buttonStyle(Tactile(look: GreyButtonStyle(capsule: true)))
      }
    }
    .card()
    .sheet(isPresented: $editing) {
      if let model {
        NavigationStack {
          CredentialEditor(model: model, filled: card.draft) { _ in
            Task { await store.answerStoreEntry(entryId, in: agentId, saved: true) }
          }
        }
      }
    }
  }

  /** The store's editor, filled; the saved contacts read for a card's billing address. */
  private func open() {
    let made = model ?? CredentialsStoreModel(store: store)
    model = made
    editing = true
    if card.kind == .card { Task { await made.load() } }
  }
}
