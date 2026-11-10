import AppKit
import SwiftUI
import SimeonCore

// MARK: - Network

/**
 * Settings › Network (10 November 2026, the founder, with Reason Network as
 * the reference: "do the reason network"): the person's Simeon Network,
 * where their agents and the agents of the people on it ask each other for
 * work (docs/services-agents.md section 18, simeonlabs.com/docs/network).
 *
 * - The network by its name, its invite line with Copy, and New Link (the
 *   old line stops working).
 * - People: each person on it, then their Simeon agents (always on) and the
 *   agents of theirs that reached the network over MCP in the last day
 *   (Claude Code, Codex, Dots…), with where they work and whether they are
 *   busy, idle or away.
 * - Join a Network: an invite line pasted, whose network it is asked first,
 *   then Join (the person leaves the one they are on).
 * - Your coding agents: the line that adds Simeon to the coding agents on a
 *   computer, and the MCP address for any other, each with Copy.
 * - Rename Network, Leave Network (when others are on it, asked first) and
 *   How the Simeon Network works.
 *
 * The model is SimeonCore's (`NetworkModel`), shared with the iPhone.
 */
struct SettingsNetworkPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model: NetworkModel?
  @State private var copied: String?
  @State private var pasted = ""
  @State private var invite: NetworkInvitePreview?
  @State private var joinRefused: String?
  @State private var renaming = false
  @State private var newName = ""
  @State private var leaving = false
  @State private var busy = false
  /** What a change's refusal said, shown over the page. */
  @State private var refused: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Your agents and the agents of the people on your network ask each other for work.")
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .fixedSize(horizontal: false, vertical: true)
      if let model {
        if let snapshot = model.snapshot {
          loaded(snapshot, model: model)
        } else if let problem = model.problem {
          SettingsGroup(look: look) {
            SettingsLine(label: problem, labelTint: look.danger, look: look) {
              SettingsPill(title: String(localized: "Try Again"), look: look) { Task { await model.load() } }
            }
          }
        } else {
          ProgressView().controlSize(.small).frame(maxWidth: .infinity)
        }
      }
    }
    .task {
      if model == nil { model = NetworkModel(store: store) }
      await model?.load()
    }
    .alert(
      Text("Join “\(invite?.name ?? "")”?"),
      isPresented: Binding(get: { invite != nil }, set: { if !$0 { invite = nil } })
    ) {
      Button("Join") { join() }
      Button("Cancel", role: .cancel) { invite = nil }
    } message: {
      Text("Your agents and theirs will see each other and ask each other for work. You’ll leave the network you’re on.")
    }
    .alert(Text("Rename Network"), isPresented: $renaming) {
      TextField("Network name", text: $newName)
      Button("Save") { rename() }
      Button("Cancel", role: .cancel) {}
    }
    .alert(Text("Leave this network?"), isPresented: $leaving) {
      Button("Leave", role: .destructive) { act { try await $0.leave() } }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("Your agents leave it, and you get a network of your own.")
    }
    .alert(
      Text(verbatim: refused ?? ""),
      isPresented: Binding(get: { refused != nil }, set: { if !$0 { refused = nil } })
    ) {}
  }

  @ViewBuilder
  private func loaded(_ snapshot: NetworkSnapshot, model: NetworkModel) -> some View {
    SettingsGroup(title: snapshot.name, footer: String(localized: "Anyone with this line can join. New Link stops the old one."), look: look) {
      SettingsLine(label: String(localized: "Invite line"), detail: snapshot.invite, look: look) {
        copyPill(snapshot.invite, key: "invite")
      }
      SettingsActionRow(title: String(localized: "New Link"), divided: true, busy: busy, look: look) {
        act { try await $0.newLink() }
      }
    }
    SettingsGroup(title: String(localized: "People"), look: look) {
      ForEach(Array(snapshot.people.enumerated()), id: \.element.id) { index, person in
        MacNetworkPersonRows(person: person, divided: index > 0, look: look)
      }
    }
    SettingsGroup(title: String(localized: "Join a Network"), footer: joinRefused, footerTint: look.danger, look: look) {
      HStack(spacing: 12) {
        TextField("", text: $pasted, prompt: Text("Paste an invite line").foregroundStyle(look.inkTertiary))
          .textFieldStyle(.plain)
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .onSubmit { preview() }
        SettingsPill(title: String(localized: "Join"), disabled: pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy, look: look) { preview() }
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, SettingsRowSize.vertical)
      .frame(minHeight: SettingsRowSize.minHeight)
    }
    SettingsGroup(title: String(localized: "Your coding agents"), look: look) {
      SettingsLine(label: String(localized: "On your computer"), detail: NetworkInvite.install, look: look) {
        copyPill(NetworkInvite.install, key: "install")
      }
      SettingsLine(label: String(localized: "Any other agent"), detail: NetworkInvite.mcp, divided: true, look: look) {
        copyPill(NetworkInvite.mcp, key: "mcp")
      }
    }
    SettingsGroup(look: look) {
      SettingsActionRow(title: String(localized: "Rename Network"), look: look) {
        newName = snapshot.name
        renaming = true
      }
      if snapshot.shared {
        SettingsActionRow(title: String(localized: "Leave Network"), destructive: true, divided: true, look: look) { leaving = true }
      }
      SettingsLinkRow(label: String(localized: "How the Simeon Network works"), divided: true, external: true, look: look) {
        NSWorkspace.shared.open(NetworkInvite.docs)
      }
    }
  }

  private func copyPill(_ text: String, key: String) -> some View {
    SettingsPill(title: copied == key ? String(localized: "Copied") : String(localized: "Copy"), look: look) {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(text, forType: .string)
      copied = key
      Task {
        try? await Task.sleep(for: .seconds(1.6))
        if copied == key { copied = nil }
      }
    }
  }

  /** Whose network the pasted line is for, asked before joining it. */
  private func preview() {
    guard let model, !busy else { return }
    joinRefused = nil
    busy = true
    Task {
      defer { busy = false }
      do { invite = try await model.preview(pasted) } catch { joinRefused = error.localizedDescription }
    }
  }

  private func join() {
    let line = pasted
    invite = nil
    act {
      try await $0.join(line)
      pasted = ""
    }
  }

  private func rename() {
    let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return }
    act { try await $0.rename(name) }
  }

  /** A change said to the server; the page shows the network as it answers, or what went wrong. */
  private func act(_ change: @escaping @MainActor (NetworkModel) async throws -> Void) {
    guard let model, !busy else { return }
    busy = true
    Task {
      defer { busy = false }
      do { try await change(model) } catch { refused = error.localizedDescription }
    }
  }
}

/**
 * One person on the network: their initial (or picture) and name, "You" for
 * the person themselves; then each Simeon agent of theirs, always on, and
 * each session seen in the last day, with where it works and a dot: green
 * idle, orange busy, grey away.
 */
private struct MacNetworkPersonRows: View {
  let person: NetworkPerson
  let divided: Bool
  let look: Look

  var body: some View {
    HStack(spacing: 12) {
      Text(verbatim: person.initial)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.ink)
        .frame(width: 28, height: 28)
        .background(Circle().fill(look.ink.opacity(0.08)))
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: person.name).font(PanelType.row).foregroundStyle(look.ink)
        Text(verbatim: person.handle).font(PanelType.detail).foregroundStyle(look.inkSecondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if person.you {
        Text("You").font(PanelType.detail).foregroundStyle(look.inkSecondary)
      }
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, 12)
    .frame(minHeight: SettingsRowSize.minHeight)
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
    ForEach(person.agents) { agent in
      MacNetworkAgentRow(
        symbol: "person.crop.circle", name: agent.name, detail: agent.role,
        status: String(localized: "Always on"), dot: look.settingsGreen, look: look
      )
    }
    ForEach(person.sessions) { session in
      MacNetworkAgentRow(
        symbol: Self.symbol(session.kind), name: session.name,
        detail: [session.whereabouts, session.doing].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " — "),
        status: Self.status(session.status), dot: Self.dot(session.status, look: look), look: look
      )
    }
  }

  static func symbol(_ kind: String) -> String {
    switch kind {
    case "dots", "muse", "grok-bot", "claude": "bubble.left"
    case "agent": "circle.hexagongrid"
    default: "terminal"
    }
  }

  static func status(_ status: NetworkSession.Status) -> String {
    switch status {
    case .busy: String(localized: "Busy")
    case .idle: String(localized: "Idle")
    case .away: String(localized: "Away")
    }
  }

  static func dot(_ status: NetworkSession.Status, look: Look) -> Color {
    switch status {
    case .busy: .orange
    case .idle: look.settingsGreen
    case .away: look.inkTertiary
    }
  }
}

/** An agent under its person: its symbol, its name over what it does or where it works, its state at the end. */
private struct MacNetworkAgentRow: View {
  let symbol: String
  let name: String
  let detail: String?
  let status: String
  let dot: Color
  let look: Look

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .font(.system(size: 13))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 28)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: name).font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
        if let detail, !detail.isEmpty {
          Text(verbatim: detail).font(PanelType.detail).foregroundStyle(look.inkSecondary).lineLimit(1).truncationMode(.middle)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 6) {
        Circle().fill(dot).frame(width: 7, height: 7)
        Text(status).font(PanelType.detail).foregroundStyle(look.inkSecondary)
      }
    }
    .padding(.leading, SettingsRowSize.inset + 16)
    .padding(.trailing, SettingsRowSize.inset)
    .padding(.vertical, 8)
  }
}
