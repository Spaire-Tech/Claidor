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
        ButterflyView(palette: palette, margin: 6)
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
              ButterflyView(palette: choice, margin: 3)
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

/**
 * Settings (round 4 and its fix): the account (name and email, which fits),
 * the theme, the time zone, then Sign Out on its own row at the end and
 * the butterfly with "Simeon".
 */
struct SettingsSheet: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @AppStorage("simeon.theme") private var theme = "system"

  var body: some View {
    NavigationStack {
      Form {
        Section("Account") {
          HStack(spacing: 12) {
            Initials(letters: store.account?.initials ?? "", size: 44)
              .background(Ink.bubbleTheirs, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
              Text(store.account?.name ?? "").font(.system(size: 17, weight: .medium))
              Text(store.account?.email ?? "").font(.system(size: 15)).foregroundStyle(Ink.secondary)
                .lineLimit(1).minimumScaleFactor(0.8)
                .textSelection(.enabled)
            }
          }
          .padding(.vertical, 2)
        }
        Section("Appearance") {
          Picker("Theme", selection: $theme) {
            Text("Follow System").tag("system")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
        }
        Section("Agent") {
          LabeledContent("Timezone", value: "Auto-detect (\(TimeZone.current.abbreviation() ?? TimeZone.current.identifier))")
        }
        Section {
          Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
        }
        Section {
          VStack(spacing: 6) {
            ButterflyView(palette: .named("blue"), margin: 4).frame(width: 48, height: 48)
            Text("Simeon").font(.system(size: 17, weight: .semibold))
            Text(SessionController.clientVersion).font(.system(size: 12)).foregroundStyle(Ink.tertiary)
          }
          .frame(maxWidth: .infinity)
          .listRowBackground(Color.clear)
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton() } }
    }
  }
}

/**
 * The agent's page (round 4: "like mac but fit for mobile, with routines,
 * computer"): the butterfly, the name and title, three tabs: the profile
 * (name, title, description), its routines, its computer. A group's page
 * lists its members.
 */
struct AgentPageSheet: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var tab = 0
  @State private var name = ""
  @State private var title = ""
  @State private var about = ""
  @State private var routines: [JSON] = []

  var body: some View {
    NavigationStack {
      if let agent = store.agent(agentId) {
        ScrollView {
          VStack(spacing: 18) {
            AgentAvatar(agent: agent, members: store.members(of: agent))
              .frame(width: 96, height: 96)
              .padding(10)
              .background(Ink.bubbleTheirs.opacity(0.5), in: Circle())
            VStack(spacing: 2) {
              Text(agent.name).font(.system(size: 24, weight: .semibold))
              if !agent.title.isEmpty { Text(agent.title).font(.system(size: 16)).foregroundStyle(Ink.secondary) }
            }
            if agent.isGroup {
              members(agent)
            } else {
              Picker("Page", selection: $tab) {
                Image(systemName: "person").tag(0).accessibilityLabel("Profile")
                Image(systemName: "clock").tag(1).accessibilityLabel("Routines")
                Image(systemName: "desktopcomputer").tag(2).accessibilityLabel("Computer")
              }
              .pickerStyle(.segmented)
              switch tab {
              case 0: profile(agent)
              case 1: routinesTab
              default: computer(agent)
              }
            }
          }
          .padding(.horizontal, 20)
          .padding(.vertical, 8)
        }
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) { CloseButton() }
        }
        .task {
          name = agent.name; title = agent.title; about = agent.description
          routines = await store.routines(agentId)
        }
      }
    }
  }

  private func profile(_ agent: Agent) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      field("Name", $name)
      Divider()
      field("Title", $title)
      Divider()
      field("Description", $about, axis: .vertical)
      Divider()
      if name != agent.name || title != agent.title || about != agent.description {
        Button("Save") { Task { await store.updateProfile(agentId, name: name, title: title, description: about) } }
          .buttonStyle(.glassProminent)
          .frame(maxWidth: .infinity)
          .padding(.top, 16)
      }
    }
  }

  private func field(_ label: String, _ value: Binding<String>, axis: Axis = .horizontal) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      TextField(label, text: value, axis: axis).font(.system(size: 17)).lineLimit(1...6)
    }
    .padding(.vertical, 12)
  }

  private var routinesTab: some View {
    Group {
      if routines.isEmpty {
        VStack(spacing: 12) {
          Image(systemName: "clock").font(.system(size: 22)).foregroundStyle(Ink.primary)
            .frame(width: 56, height: 56)
            .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
          Text("Routines are recurring tasks this agent runs on a schedule.")
            .font(.system(size: 15)).foregroundStyle(Ink.secondary).multilineTextAlignment(.center)
        }
        .padding(.top, 24)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(routines.enumerated()), id: \.offset) { _, routine in
            HStack(spacing: 12) {
              Image(systemName: "clock").foregroundStyle(Ink.title)
              VStack(alignment: .leading, spacing: 2) {
                Text(routine["name"]?.text ?? "Routine").font(.system(size: 17))
                if let schedule = routine["schedule"]?.text ?? routine["cron"]?.text { Text(schedule).font(.system(size: 14)).foregroundStyle(Ink.secondary) }
              }
              Spacer()
            }
            .padding(.vertical, 12)
            Divider()
          }
        }
      }
    }
  }

  private func computer(_ agent: Agent) -> some View {
    VStack(spacing: 8) {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(Color(RGB(hex: "#1f3b73")))
        .aspectRatio(16 / 10, contentMode: .fit)
        .overlay(Image(systemName: "desktopcomputer").font(.system(size: 30)).foregroundStyle(.white.opacity(0.6)))
      Text("\(agent.name)'s screen").font(.system(size: 13)).foregroundStyle(Ink.secondary)
    }
  }

  private func members(_ group: Agent) -> some View {
    VStack(spacing: 0) {
      ForEach(store.members(of: group)) { member in
        HStack(spacing: 12) {
          AgentAvatar(agent: member).frame(width: 40, height: 40)
          VStack(alignment: .leading, spacing: 2) {
            Text(member.name).font(.system(size: 17))
            if !member.title.isEmpty { Text(member.title).font(.system(size: 14)).foregroundStyle(Ink.title) }
          }
          Spacer()
        }
        .padding(.vertical, 8)
        Divider()
      }
    }
  }
}
