import SwiftUI
import SimeonCore

/**
 * The computer's notices about the open agent, over its composer (the
 * window's tray stack, `pzn`, `yzn`): "Agent failed to respond", "Message
 * not delivered", "Routines paused while you were away". Each in its red
 * edged card: the warning triangle, the title and "×3" when it repeated,
 * the detail, its link buttons, Copy request ID and the X. "Clear all" over
 * them when there are two or more (every notice on the computer goes, as in
 * the window). Nothing when there are none.
 *
 * A "dashboard-action" button is not drawn: only an account error from the
 * upstream server carries one, and Simeon Labs' server sends none.
 */
struct TrayStack: View {
  let agentId: String
  @Environment(AppStore.self) private var store

  var body: some View {
    let trays = store.trayList.shown(for: agentId)
    if !trays.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        if trays.count > 1 {
          HStack {
            Spacer()
            Button("Clear all") { Task { await store.clearTrays() } }
              .buttonStyle(.plain)
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(Ink.secondary)
          }
        }
        ForEach(trays) { tray in
          TrayCard(tray: tray)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Notifications")
      .animation(.easeOut(duration: 0.18), value: trays.map(\.id))
    }
  }
}

private struct TrayCard: View {
  let tray: Tray
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var copied = false

  private static let red = Color(RGB(hex: "#ff5f57"))

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.triangle")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(Self.red)
        .frame(width: 20, height: 20)
        .padding(.top, 1)
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(tray.title).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary)
          if let count = tray.countLabel {
            Text(count).font(.system(size: 13, weight: .medium)).monospacedDigit().foregroundStyle(Ink.tertiary)
              .accessibilityLabel("Occurred \(tray.count ?? 0) times")
          }
        }
        if !tray.detail.isEmpty {
          Text(tray.detail).font(.system(size: 13)).foregroundStyle(Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        }
        let links = tray.actions.compactMap { action -> (String, URL)? in
          if case .openURL(let label, let url) = action, let address = URL(string: url) { return (label, address) }
          return nil
        }
        if !links.isEmpty {
          HStack(spacing: 6) {
            ForEach(links.indices, id: \.self) { index in
              Button(links[index].0) { openURL(links[index].1) }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
          }
          .padding(.top, 8)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 2) {
        if let requestId = tray.copyableRequestId {
          Button {
            UIPasteboard.general.string = requestId
            copied = true
            Task { try? await Task.sleep(nanoseconds: 1_200_000_000); copied = false }
          } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 12, weight: .medium)).frame(width: 24, height: 24).contentShape(Circle())
          }
          .buttonStyle(.plain)
          .foregroundStyle(Ink.secondary)
          .accessibilityLabel("Copy request ID")
          .help("Copy request ID")
        }
        Button { Task { await store.dismissTray(tray.id) } } label: {
          Image(systemName: "xmark").font(.system(size: 12, weight: .medium)).frame(width: 24, height: 24).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Ink.secondary)
        .accessibilityLabel("Dismiss notification")
        .help("Dismiss notification")
      }
      .padding(.top, -2).padding(.trailing, -4)
    }
    .padding(.vertical, 10).padding(.horizontal, 12)
    .background(Self.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .background(Ink.ground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Self.red.opacity(0.35), lineWidth: 1))
    // `0 6px 24px -16px`: a faint shadow under its lower edge only.
    .shadow(color: .black.opacity(0.1), radius: 4, y: 4)
    .accessibilityElement(children: .contain)
  }
}
