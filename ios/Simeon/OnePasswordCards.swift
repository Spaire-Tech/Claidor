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
        HStack(spacing: 8) {
          Button("Fill with 1Password") { fill() }
            .buttonStyle(Tactile(look: BlueButtonStyle()))
          Button("Not now") { run { refusal = await store.answerCredentialRequest(entryId, allow: false, in: agentId) } }
            .buttonStyle(Tactile(look: GreyButtonStyle()))
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
 * says so, and the X is a decline.
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
        if card.state == .open {
          Button {
            guard !busy else { return }
            busy = true
            Task { await store.dismissOnePasswordConnect(entryId, in: agentId); busy = false }
          } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.secondary)
              .frame(width: 32, height: 32).contentShape(Rectangle())
          }
          .buttonStyle(.tactile)
          .accessibilityLabel("Dismiss")
        } else if let status = card.statusLine {
          StatusPill(text: status, dot: card.state == .connected ? Ink.live : Ink.tertiary)
        }
      }
      if card.state == .open {
        if let reason = card.reason { Text(reason).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true) }
        Text("Open Simeon on your Mac to connect it: your 1Password app makes a vault shared with Simeon, and your agent fills sign-ins from it with your OK.")
          .font(.system(size: 15)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      } else if card.state == .connected, let account = card.account {
        Text(account).font(.system(size: 15)).foregroundStyle(Ink.secondary)
      }
    }
    .card()
  }
}
