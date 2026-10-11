import SwiftUI
import SimeonCore

/**
 * Find in chat, the Mac's find bar (mac/Simeon/Find.swift, ⌘F) on the
 * phone: the magnifier in the chat's bar opens a field over the chat
 * ("Find in Chat"), the count ("3 of 12"), up and down through the matches
 * (round at either end), Done. Matching is the Mac's own (`ChatFind`, the
 * window's rules: every time the words appear in what a line says); the
 * newest match is the first one shown, and each match is brought into view
 * and glows, as a line search found does (`store.revealing`).
 */
struct ChatFindBar: View {
  let agentId: String
  let close: () -> Void
  @Environment(AppStore.self) private var store
  @State private var query = ""
  @State private var current: ChatFind.Match?
  @FocusState private var focused: Bool

  var body: some View {
    let matches = ChatFind.matches(query, in: store.findableEntries(agentId))
    HStack(spacing: 8) {
      HStack(spacing: 6) {
        Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .medium)).foregroundStyle(Ink.secondary)
        TextField("Find in Chat", text: $query)
          .font(.system(size: 17))
          .focused($focused)
          .submitLabel(.search)
          .autocorrectionDisabled()
          .textInputAutocapitalization(.never)
          .onSubmit { step(1, in: matches) }
        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Text(matches.isEmpty ? "No results" : "\(ChatFind.ordinal(matches, current)) of \(matches.count)")
            .font(.system(size: 14))
            .monospacedDigit()
            .foregroundStyle(matches.isEmpty ? Ink.danger : Ink.secondary)
            .fixedSize()
        }
      }
      .padding(.horizontal, 12)
      .frame(height: 40)
      .glassEffect(.regular, in: .capsule)
      Button { step(-1, in: matches) } label: {
        Image(systemName: "chevron.up").font(.system(size: 16, weight: .semibold)).frame(width: 40, height: 40)
      }
      .disabled(matches.isEmpty)
      .accessibilityLabel("Previous match")
      Button { step(1, in: matches) } label: {
        Image(systemName: "chevron.down").font(.system(size: 16, weight: .semibold)).frame(width: 40, height: 40)
      }
      .disabled(matches.isEmpty)
      .accessibilityLabel("Next match")
      Button("Done", action: close).font(.system(size: 17, weight: .semibold))
    }
    .buttonStyle(.plain)
    .foregroundStyle(Ink.primary)
    .padding(.horizontal, 16)
    .padding(.vertical, 6)
    .onAppear { focused = true }
    // New words: the newest match, brought into view.
    .onChange(of: query) { _, words in
      current = ChatFind.first(ChatFind.matches(words, in: store.findableEntries(agentId)))
      reveal(current)
    }
  }

  private func step(_ step: Int, in matches: [ChatFind.Match]) {
    guard !matches.isEmpty else { return }
    current = ChatFind.next(matches, from: current, step: step)
    reveal(current)
    Haptics.select()
  }

  /** The match's line into view, glowing, as a line search found (older pages read until it is in). */
  private func reveal(_ match: ChatFind.Match?) {
    guard let match else { return }
    store.revealing[agentId] = match.rowId
  }
}
