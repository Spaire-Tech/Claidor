import SwiftUI
import SimeonCore

/**
 * The list when the agents can't be read, the Mac's (mac/Simeon/ComputerStates.swift
 * `RosterCard`, `RosterLine`) on the phone. With nothing to show: "Can’t reach
 * your computer" over why, then Retry ("Retrying…" while it runs) and Recover
 * computer, which asks first; "Your computer isn’t set up" with Retry alone
 * while this account has no Simeon. Before this the list said "No saved
 * agents yet." With a list already shown: "Reconnecting to your computer…"
 * over it, with a quiet Retry.
 */
struct RosterCard: View {
  /** Recover computer's question (the computer's states); none, and the button is not shown. */
  let recover: (() -> Void)?
  @Environment(AppStore.self) private var store

  var body: some View {
    let blocked = store.accessBlocked
    let driver = store.rebuild
    let canRecover = recover != nil && !blocked && driver.canReset && !driver.isBlocked
    let recovering = driver.pendingKind == .reset || driver.lock.kind == .reset
    VStack(spacing: 10) {
      Image(systemName: "display")
        .font(.system(size: 30, weight: .regular))
        .foregroundStyle(Ink.tertiary)
        .padding(.bottom, 2)
      Text(blocked ? "Your computer isn\u{2019}t set up" : "Can\u{2019}t reach your computer")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Ink.primary)
      Text(blocked
           ? String(localized: "Simeon can\u{2019}t set up a computer for this account yet. Setup starts automatically once this account has access.")
           : String(localized: "Your agents are safe \u{2014} they just can\u{2019}t be loaded right now.") + (canRecover ? String(localized: " If it doesn\u{2019}t come back on its own, recover it \u{2014} your files and logins are kept.") : ""))
        .font(.system(size: 15))
        .foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 10) {
        if store.rosterRetrying {
          HStack(spacing: 8) {
            ProgressView()
            Text("Retrying\u{2026}").font(.system(size: 15)).foregroundStyle(Ink.secondary)
          }
          .frame(height: 36)
        } else {
          Button("Retry") { Task { await store.retryRoster() } }
            .buttonStyle(Tactile(look: GreyButtonStyle(height: 36, capsule: true)))
        }
        if canRecover, let recover {
          Button(recovering ? "Recovering\u{2026}" : "Recover computer") { recover() }
            .buttonStyle(Tactile(look: GreyButtonStyle(height: 36, capsule: true)))
            .disabled(recovering)
        }
      }
      .padding(.top, 4)
    }
    .padding(.horizontal, 32)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .contain)
  }
}

/** "Reconnecting to your computer…" over a list already shown when reading it again fails, with a quiet Retry ("Retrying…" while it runs). */
struct RosterLine: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 8) {
      ProgressView().controlSize(.small)
      Text("Reconnecting to your computer\u{2026}")
        .font(.system(size: 14))
        .foregroundStyle(Ink.secondary)
        .lineLimit(1)
        .truncationMode(.tail)
      Spacer(minLength: 0)
      Button(store.rosterRetrying ? "Retrying\u{2026}" : "Retry") { Task { await store.retryRoster() } }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(Ink.link)
        .buttonStyle(.borderless)
        .disabled(store.rosterRetrying)
    }
    .frame(minHeight: 32)
  }
}
