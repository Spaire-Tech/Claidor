import SimeonCore
import SwiftUI
import UIKit

/**
 * Settings › Network on the iPhone (10 November 2026, the founder, with
 * Reason Network as the reference: "do the reason network"), the Mac's page
 * (mac/Simeon/SettingsNetwork.swift) in the phone's grouped list: the
 * network by its name with its invite line (Copy) and New Link; the people
 * on it, each with their Simeon agents (always on) and their agents' live
 * sessions; Join a Network (whose network a pasted line is for, asked
 * first); the line for a computer's coding agents and the MCP address, each
 * with Copy; Rename, Leave (asked first) and How the Simeon Network works.
 * The model is SimeonCore's `NetworkModel`.
 */
struct NetworkPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
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
    Form {
      Section {
        Text("Your agents and the agents of the people on your network ask each other for work.")
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
      }
      .listRowBackground(Color.clear)
      if let model {
        if let snapshot = model.snapshot {
          loaded(snapshot)
        } else if let problem = model.problem {
          Section {
            Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger)
            Button("Try Again") { Task { await model.load() } }
          }
          .listRowBackground(Ink.groupedRow)
        } else {
          Section { HStack { Spacer(); ProgressView(); Spacer() } }
            .listRowBackground(Color.clear)
        }
      }
    }
    .groupedGround()
    .navigationTitle("Network")
    .inlineBarTitle()
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
  private func loaded(_ snapshot: NetworkSnapshot) -> some View {
    Section {
      VStack(alignment: .leading, spacing: 4) {
        Text("Invite line").font(.system(size: 15)).foregroundStyle(Ink.primary)
        Text(verbatim: snapshot.invite).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2).truncationMode(.middle)
      }
      copyButton(snapshot.invite, key: "invite")
      Button("New Link") { act { try await $0.newLink() } }.disabled(busy)
    } header: {
      Text(verbatim: snapshot.name)
    } footer: {
      Text("Anyone with this line can join. New Link stops the old one.")
    }
    .listRowBackground(Ink.groupedRow)

    Section {
      ForEach(snapshot.people) { person in
        PhoneNetworkPersonRows(person: person)
      }
    } header: {
      Text("People")
    }
    .listRowBackground(Ink.groupedRow)

    Section {
      TextField("Paste an invite line", text: $pasted)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .onSubmit { preview() }
      Button("Join") { preview() }
        .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
    } header: {
      Text("Join a Network")
    } footer: {
      if let joinRefused { Text(verbatim: joinRefused).foregroundStyle(Ink.danger) }
    }
    .listRowBackground(Ink.groupedRow)

    Section {
      VStack(alignment: .leading, spacing: 4) {
        Text("On your computer").font(.system(size: 15)).foregroundStyle(Ink.primary)
        Text(verbatim: NetworkInvite.install).font(.system(size: 13, design: .monospaced)).foregroundStyle(Ink.secondary)
      }
      copyButton(NetworkInvite.install, key: "install")
      VStack(alignment: .leading, spacing: 4) {
        Text("Any other agent").font(.system(size: 15)).foregroundStyle(Ink.primary)
        Text(verbatim: NetworkInvite.mcp).font(.system(size: 13, design: .monospaced)).foregroundStyle(Ink.secondary)
      }
      copyButton(NetworkInvite.mcp, key: "mcp")
    } header: {
      Text("Your coding agents")
    }
    .listRowBackground(Ink.groupedRow)

    Section {
      Button("Rename Network") {
        newName = snapshot.name
        renaming = true
      }
      if snapshot.shared {
        Button("Leave Network", role: .destructive) { leaving = true }
      }
      Link(destination: NetworkInvite.docs) {
        Text("How the Simeon Network works")
      }
    }
    .listRowBackground(Ink.groupedRow)
  }

  private func copyButton(_ text: String, key: String) -> some View {
    Button(copied == key ? String(localized: "Copied") : String(localized: "Copy")) {
      UIPasteboard.general.string = text
      copied = key
      Task {
        try? await Task.sleep(for: .seconds(1.6))
        if copied == key { copied = nil }
      }
    }
  }

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

  private func act(_ change: @escaping @MainActor (NetworkModel) async throws -> Void) {
    guard let model, !busy else { return }
    busy = true
    Task {
      defer { busy = false }
      do { try await change(model) } catch { refused = error.localizedDescription }
    }
  }
}

/** One person on the network, then their Simeon agents and their agents' sessions, as on the Mac. */
private struct PhoneNetworkPersonRows: View {
  let person: NetworkPerson

  var body: some View {
    HStack(spacing: 12) {
      Text(verbatim: person.initial)
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(Ink.primary)
        .frame(width: 32, height: 32)
        .background(Circle().fill(Ink.pill))
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: person.name).font(.system(size: 16)).foregroundStyle(Ink.primary)
        Text(verbatim: person.handle).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      Spacer(minLength: 8)
      if person.you { Text("You").font(.system(size: 13)).foregroundStyle(Ink.secondary) }
    }
    ForEach(person.agents) { agent in
      PhoneNetworkAgentRow(symbol: "person.crop.circle", name: agent.name, detail: agent.role,
                           status: String(localized: "Always on"), dot: .green)
    }
    ForEach(person.sessions) { session in
      PhoneNetworkAgentRow(
        symbol: ["dots", "muse", "grok-bot", "claude"].contains(session.kind) ? "bubble.left" : "terminal",
        name: session.name,
        detail: [session.whereabouts, session.doing].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " — "),
        status: {
          switch session.status {
          case .busy: String(localized: "Busy")
          case .idle: String(localized: "Idle")
          case .away: String(localized: "Away")
          }
        }(),
        dot: session.status == .busy ? .orange : session.status == .idle ? .green : Ink.tertiary
      )
    }
  }
}

private struct PhoneNetworkAgentRow: View {
  let symbol: String
  let name: String
  let detail: String?
  let status: String
  let dot: Color

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: symbol).font(.system(size: 14)).foregroundStyle(Ink.secondary).frame(width: 32)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: name).font(.system(size: 15)).foregroundStyle(Ink.primary).lineLimit(1)
        if let detail, !detail.isEmpty {
          Text(verbatim: detail).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1).truncationMode(.middle)
        }
      }
      Spacer(minLength: 8)
      HStack(spacing: 5) {
        Circle().fill(dot).frame(width: 7, height: 7)
        Text(status).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
    }
    .padding(.leading, 16)
  }
}
