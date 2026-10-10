import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * The Deep Links page (`uLn`, `sand-deep-link-info`): what a
 * `…/v1/info?topic=deep-links` link opens, signed in or not. "Deep Links",
 * "Simeon deep links are working", the route and where the link came from,
 * and Done. The words are the shipped window's, its "sand://" included: the
 * window prints its own canonical form, not the link that was opened.
 */
struct MacDeepLinkInfo: View {
  let source: DeepLink.Source
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Deep Links").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
        Text("Simeon deep links are working").font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      block("Route", "sand://app/v1/info?topic=deep-links")
      block("Source", source == .https ? "HTTPS link" : "Custom protocol (sand://)")
      HStack {
        Spacer()
        Button("Done") { dismiss() }
          .buttonStyle(.borderedProminent)
          .keyboardShortcut(.defaultAction)
      }
    }
    .padding(20)
    .frame(width: 400)
  }

  private func block(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).font(.system(size: 12)).foregroundStyle(Ink.secondary)
      Text(value)
        .font(.system(size: 12, design: .monospaced))
        .foregroundStyle(Ink.primary)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Ink.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
  }
}
