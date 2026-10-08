import SwiftUI
import SimeonCore

/** A sheet's X at the top left (rounds 3 and 4: every sheet closes there). */
struct CloseButton: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    Button { dismiss() } label: { Image(systemName: "xmark") }
      .accessibilityLabel("Close")
  }
}

/**
 * New Agent (round 3): the butterfly large in the colour picked, its name,
 * the twelve palettes as butterflies, Create.
 */
struct NewAgentSheet: View {
  let created: (String) -> Void
  @Environment(AppStore.self) private var store
  @State private var name = ""
  @State private var palette = AgentPalette.named("blue")
  @State private var busy = false
  @FocusState private var naming: Bool

  var body: some View {
    NavigationStack {
      VStack(spacing: 20) {
        Spacer(minLength: 0)
        ButterflyView(palette: palette, motion: .idle)
          .frame(width: 190, height: 190)
          .animation(.snappy, value: palette.id)
        Spacer(minLength: 0)
        TextField("Name your agent", text: $name)
          .font(.system(size: 17))
          .multilineTextAlignment(.center)
          .focused($naming)
          .submitLabel(.done)
          .padding(.vertical, 13)
          .background(Ink.bubbleTheirs.opacity(0.6), in: Capsule())
          .overlay(Capsule().stroke(Ink.hairline, lineWidth: 0.5))
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 10) {
          ForEach(AgentPalette.all) { choice in
            Button { palette = choice } label: {
              ButterflyView(palette: choice)
                .frame(width: 44, height: 44)
                .padding(3)
                .overlay(Circle().stroke(choice.id == palette.id ? Ink.title : .clear, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(choice.label)
            .accessibilityAddTraits(choice.id == palette.id ? .isSelected : [])
          }
        }
        Button(action: create) {
          Group {
            if busy { ProgressView().tint(.white) } else { Text("Create").font(.headline) }
          }
          .frame(maxWidth: .infinity).frame(height: 40)
        }
        .buttonStyle(.glassProminent)
        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || busy)
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 12)
      .navigationTitle("New Agent")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton() } }
      .onAppear {
        // A colour no agent has yet, when there is one.
        let used = Set(store.agents.compactMap(\.colour))
        palette = AgentPalette.all.first { !used.contains($0.id) } ?? AgentPalette.all.randomElement()!
      }
    }
  }

  private func create() {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return }
    busy = true
    Task {
      let id = await store.createAgent(name: trimmed, colour: palette.id)
      busy = false
      if let id { created(id) }
    }
  }
}

/**
 * New Group Chat (round 3): "To:" with the agents picked, search, the
 * agents with a check each; Next once two are picked.
 */
struct NewGroupSheet: View {
  let created: (String) -> Void
  @Environment(AppStore.self) private var store
  @State private var picked: [String] = []
  @State private var query = ""
  @State private var busy = false

  private var candidates: [Agent] {
    store.agents.filter { !$0.isGroup && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        HStack(spacing: 6) {
          Text("To:").foregroundStyle(Ink.secondary)
          ForEach(picked, id: \.self) { id in
            Text(store.agent(id)?.name ?? id)
              .font(.system(size: 15))
              .padding(.horizontal, 10).padding(.vertical, 4)
              .background(Ink.bubbleTheirs, in: Capsule())
          }
          TextField(picked.isEmpty ? "Search agents" : "", text: $query)
        }
        .font(.system(size: 16))
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(Ink.bubbleTheirs.opacity(0.5), in: Capsule())
        .padding(.horizontal, 16).padding(.vertical, 8)
        List(candidates) { agent in
          Button { toggle(agent.id) } label: {
            HStack(spacing: 14) {
              AgentAvatar(agent: agent).frame(width: 40, height: 40)
              Text(agent.name).font(.system(size: 17)).foregroundStyle(Ink.primary)
              Spacer()
              Image(systemName: picked.contains(agent.id) ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 22))
                .foregroundStyle(picked.contains(agent.id) ? Ink.title : Ink.tertiary)
            }
          }
          .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
      }
      .navigationTitle("New Group Chat")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) { CloseButton() }
        ToolbarItem(placement: .topBarTrailing) {
          Button("Next", action: create)
            .buttonStyle(.glassProminent)
            .disabled(picked.count < 2 || busy)
        }
      }
    }
  }

  private func toggle(_ id: String) {
    if let index = picked.firstIndex(of: id) { picked.remove(at: index) } else { picked.append(id) }
    query = ""
  }

  private func create() {
    busy = true
    Task {
      let id = await store.createGroup(memberIds: picked)
      busy = false
      if let id { created(id) }
    }
  }
}

/**
 * Search (round 4): All, Agents, Groups, Actions; an agent or a group
 * opens its chat, an action does what it says.
 */
struct SearchSheet: View {
  let onOpen: (String) -> Void
  let onSheet: (HomeSheet) -> Void
  @Environment(AppStore.self) private var store
  @AppStorage("simeon.theme") private var theme = "system"
  @State private var query = ""
  @State private var scope = Scope.all

  enum Scope: String, CaseIterable, Identifiable {
    case all = "All", agents = "Agents", groups = "Groups", actions = "Actions"
    var id: String { rawValue }
  }

  struct Action: Identifiable {
    let id: String
    let title: String
    let detail: String
    let symbol: String
    let run: () -> Void
  }

  private var actions: [Action] {
    [
      Action(id: "new-agent", title: "New Agent", detail: "Create", symbol: "person.crop.circle.badge.plus") { onSheet(.newAgent) },
      Action(id: "new-group", title: "New Group Chat", detail: "Create", symbol: "person.2") { onSheet(.newGroup) },
      Action(id: "settings", title: "Settings", detail: "Account and appearance", symbol: "gearshape") { onSheet(.settings) },
      Action(id: "theme-system", title: "Theme: System", detail: "Settings · Appearance", symbol: "circle.lefthalf.filled") { theme = "system" },
      Action(id: "theme-light", title: "Theme: Light", detail: "Settings · Appearance", symbol: "sun.max") { theme = "light" },
      Action(id: "theme-dark", title: "Theme: Dark", detail: "Settings · Appearance", symbol: "moon") { theme = "dark" },
    ].filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }
  }

  private var agents: [Agent] {
    store.agents.filter { agent in
      (scope == .all || (scope == .agents && !agent.isGroup) || (scope == .groups && agent.isGroup))
        && (query.isEmpty || agent.name.localizedCaseInsensitiveContains(query) || agent.title.localizedCaseInsensitiveContains(query) || agent.description.localizedCaseInsensitiveContains(query))
    }
  }

  var body: some View {
    NavigationStack {
      List {
        if scope != .actions {
          ForEach(agents) { agent in
            Button { onOpen(agent.id) } label: {
              HStack(spacing: 12) {
                AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 2) {
                  HStack(spacing: 6) {
                    Text(agent.name).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
                    if !agent.title.isEmpty { Text(agent.title).font(.system(size: 14)).foregroundStyle(Ink.title) }
                  }
                  Text(agent.isGroup ? store.members(of: agent).map(\.name).joined(separator: ", ") : agent.description)
                    .font(.system(size: 14)).foregroundStyle(Ink.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(agent.isGroup ? "Group" : "Agent").font(.system(size: 13)).foregroundStyle(Ink.tertiary)
              }
            }
          }
        }
        if scope == .all || scope == .actions {
          ForEach(actions) { action in
            Button(action: action.run) {
              HStack(spacing: 12) {
                Image(systemName: action.symbol).font(.system(size: 17)).foregroundStyle(Ink.primary)
                  .frame(width: 40, height: 40)
                  .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                  Text(action.title).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
                  Text(action.detail).font(.system(size: 14)).foregroundStyle(Ink.secondary)
                }
                Spacer(minLength: 4)
                if action.id == "theme-\(theme)" { Image(systemName: "checkmark").foregroundStyle(Ink.title) }
                Text("Action").font(.system(size: 13)).foregroundStyle(Ink.tertiary)
              }
            }
          }
        }
      }
      .listStyle(.plain)
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
      .searchScopes($scope, activation: .onSearchPresentation) {
        ForEach(Scope.allCases) { Text($0.rawValue).tag($0) }
      }
      .navigationTitle("Search")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton() } }
    }
  }
}
