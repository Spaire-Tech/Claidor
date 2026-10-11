import SwiftUI
import SimeonCore

/**
 * The agent's page (the Mac's right pane, mac/Simeon/AgentPane.swift, as a
 * sheet on the phone): the avatar in its disc with the pencil, the name and,
 * for an agent, its title; then three tabs: Profile (Name, Title,
 * Description, each saved on leaving it, and Notifications), Routines (the
 * list, a routine's editor, New Routine), Computer (the agent's own screen,
 * live). A group's page is the same as on the Mac: its own picture, its
 * Name and Description, its Routines, and its Members where an agent has its
 * computer (a room shared with the person has no third tab).
 */
struct AgentPageSheet: View {
  let agentId: String
  /** A routine to open at once (a routine found in search), on the Routines tab. */
  var routineId: String? = nil
  @Environment(AppStore.self) private var store
  @State private var tab: Int
  @State private var editingAvatar = false

  init(agentId: String, routineId: String? = nil) {
    self.agentId = agentId
    self.routineId = routineId
    _tab = State(initialValue: routineId == nil ? 0 : 1)
  }

  var body: some View {
    NavigationStack {
      Group {
        if let agent = store.agent(agentId) {
          ScrollView {
            VStack(spacing: 0) {
              ZStack(alignment: .bottomTrailing) {
                PageAvatar(agent: agent)
                Button { editingAvatar = true } label: {
                  Image(systemName: "pencil").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
                    .frame(width: 32, height: 32)
                    .background(Ink.bubbleTheirs, in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(.circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit agent avatar")
                .offset(x: 2, y: 2)
              }
              .padding(.top, 8)
              Text(agent.name).font(.system(size: 22, weight: .semibold)).foregroundStyle(Ink.primary).padding(.top, 14)
              if !agent.isGroup, !agent.title.isEmpty { Text(agent.title).font(.system(size: 15)).foregroundStyle(Ink.secondary).padding(.top, 2) }
              Picker("Page", selection: $tab) {
                Image(systemName: "person").tag(0).accessibilityLabel("Profile")
                Image(systemName: "clock").tag(1).accessibilityLabel("Routines")
                if !agent.isGroup {
                  Image(systemName: "display").tag(2).accessibilityLabel("Computer")
                } else if agent.showsMembers {
                  // A group has no computer: the Mac's Computer tab lists its members (7d).
                  Image(systemName: "person.2").tag(2).accessibilityLabel("Members")
                }
              }
              .pickerStyle(.segmented)
              .padding(.top, 26)
              Group {
                switch tab {
                case 0: ProfileTab(agent: agent)
                case 1: RoutinesTab(agent: agent, opening: routineId)
                default:
                  if !agent.isGroup {
                    ComputerTabPreview(agent: agent)
                  } else if agent.showsMembers {
                    GroupMembers(group: agent)
                  }
                }
              }
              .padding(.top, 20)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
          }
          .scrollDismissesKeyboard(.interactively)
        } else {
          Text("This agent is gone.").foregroundStyle(Ink.secondary)
        }
      }
      .background(Ink.ground)
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
      .sheet(isPresented: $editingAvatar) {
        AvatarEditor(agentId: agentId, isGroup: store.agent(agentId)?.isGroup ?? false).problemAlert()
      }
    }
  }
}

/**
 * The page's avatar in its 96-point disc (the Mac's `AvatarTrigger`): the
 * agent's or the group's own picture filling it, else the butterfly at 66,
 * or a group's members.
 */
private struct PageAvatar: View {
  let agent: Agent
  @Environment(AppStore.self) private var store

  var body: some View {
    Group {
      if let picture = AgentAvatar.image(agent.avatarDataURL) {
        Image(uiImage: picture).resizable().scaledToFill().frame(width: 96, height: 96).clipShape(Circle())
      } else {
        AgentAvatar(agent: agent, members: store.members(of: agent))
          .frame(width: agent.isGroup ? 90 : 66, height: agent.isGroup ? 60 : 66)
          .frame(width: 96, height: 96)
      }
    }
    .background(Ink.tile, in: Circle())
    .overlay(Circle().stroke(Ink.tileEdge, lineWidth: 1))
  }
}

/**
 * Profile (the Mac's `ProfileBody`): Name, Title (not for a group) and
 * Description, each a grey label over its words. A field is saved when it
 * lets go of the keys (`saveProfileField`: the name and description always,
 * the title only when it is the field saved); unchanged, nothing is sent; an
 * empty name goes back. The Chief of Staff's title and description are read
 * only. Then, for an agent, Notifications.
 */
struct ProfileTab: View {
  let agent: Agent
  @Environment(AppStore.self) private var store

  var body: some View {
    let locked = Agent.chiefOfStaff(in: store.agents)?.id == agent.id
    VStack(alignment: .leading, spacing: 0) {
      ProfileField(label: "Name", placeholder: "Bob", stored: agent.name, readOnly: false, required: true) { save(name: $0) }
      line
      if !agent.isGroup {
        ProfileField(label: "Title", placeholder: "Describe what your agent does", stored: agent.title, readOnly: locked, required: false) { save(title: $0) }
        line
      }
      ProfileField(label: "Description", placeholder: "What this agent is for", stored: agent.description, readOnly: locked && !agent.isGroup, required: false, multiline: true) { save(description: $0) }
      line
      if !agent.isGroup {
        HStack(spacing: 14) {
          Image(systemName: "bell").font(.system(size: 17)).foregroundStyle(Ink.primary)
            .frame(width: 40, height: 40)
            .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
          VStack(alignment: .leading, spacing: 2) {
            Text("Notifications").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
            Text("Get notified when this agent finishes or needs input").font(.system(size: 13)).foregroundStyle(Ink.secondary)
          }
          Spacer(minLength: 8)
          Toggle("Notifications", isOn: Binding(get: { agent.notifyOnUpdates }, set: { on in Task { await store.setNotify(agent.id, on) } }))
            .labelsHidden()
            .tint(Ink.blue)
        }
        .padding(.top, 22)
      }
      // Discord and Slack (the Mac's Channels page), only while this chat's computer offers one.
      ChannelsLink(agentId: agent.id)
    }
  }

  private var line: some View { Rectangle().fill(Ink.hairline).frame(height: 1) }

  /** `updateAgent`: the name and description always, the title only when it is the field saved. */
  private func save(name: String? = nil, description: String? = nil, title: String? = nil) {
    let id = agent.id
    let current = store.agent(id) ?? agent
    Haptics.tap()
    Task { await store.saveProfileField(id, name: name ?? current.name, description: description ?? current.description, title: title) }
  }
}

/**
 * One of Profile's fields (the Mac's `PaneLineField` and description): its
 * grey label over its words; the whole row takes the tap. Saved when it lets
 * go of the keys (Done does that), trimmed; unchanged, nothing; an empty
 * required one goes back to what it was. A field not being typed in follows
 * the stored words.
 */
private struct ProfileField: View {
  let label: String
  let placeholder: String
  let stored: String
  let readOnly: Bool
  /** The name: empty, it goes back to what it was. */
  let required: Bool
  var multiline = false
  let commit: (String) -> Void
  @State private var draft = ""
  @FocusState private var focused: Bool
  /** `focused` kept past the field's going, which lets go of the keys without saying so. */
  @State private var editing = false
  /** What was last sent, until the stored words change: going and letting go of the keys both end in `done`, which sends once. */
  @State private var sent: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.system(size: 13)).foregroundStyle(Ink.secondary).allowsHitTesting(false)
      if readOnly {
        Text(stored.isEmpty ? placeholder : stored)
          .font(.system(size: 15))
          .foregroundStyle(stored.isEmpty ? Ink.tertiary : Ink.primary)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        TextField("", text: $draft, prompt: Text(placeholder).foregroundStyle(Ink.tertiary), axis: multiline ? .vertical : .horizontal)
          .font(.system(size: 15))
          .foregroundStyle(Ink.primary)
          .lineLimit(multiline ? 1...8 : 1...1)
          .focused($focused)
          .submitLabel(.done)
          .onSubmit { focused = false }
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel("Agent \(label.lowercased())")
      }
    }
    .padding(.vertical, 12)
    // The whole row takes the tap: the label above the field and the row's padding passed it to nothing.
    .background { Color.clear.contentShape(.rect).onTapGesture { if !readOnly { focused = true } } }
    .onAppear { draft = stored }
    .onChange(of: stored) { _, value in
      sent = nil
      if !focused { draft = value }
    }
    .onChange(of: focused) { _, now in
      editing = now
      if !now { done() }
    }
    // The tab changed or the page closed while it held the keys: saved as letting go would.
    .onDisappear { if editing && !readOnly { editing = false; done() } }
  }

  private func done() {
    guard !readOnly else { return }
    let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard value != stored else { draft = stored; return }
    if required && value.isEmpty { draft = stored; return }
    draft = value
    guard value != sent else { return }
    sent = value
    commit(value)
  }
}

/**
 * The agent's or the group's routines (the Mac's `RoutinesBody`): New
 * Routine at the right, then each routine, active ones first, with its sign
 * (the clock, a spinner while its run goes, the pause sign) over when it runs
 * or "Paused"; with none, the empty state and Create Routine. A tap opens its
 * editor; a routine found in search opens once the list has it.
 */
struct RoutinesTab: View {
  let agent: Agent
  /** A routine to open as soon as the list is in (search). */
  var opening: String? = nil
  @Environment(AppStore.self) private var store
  @State private var editing: Editing? = nil
  /** The first read is over (answered or not): with no list, nothing is drawn, as on the Mac. */
  @State private var loaded = false
  @State private var opened = false
  /** Test run's waits, for every routine of the page. */
  @State private var runs = RoutineTestRuns()

  struct Editing: Identifiable {
    let id = UUID()
    let model: RoutineEditing
  }

  var body: some View {
    let list = store.routinesByAgent[agent.id]
    VStack(spacing: 0) {
      if let list {
        if list.isEmpty {
          VStack(spacing: 16) {
            Image(systemName: "clock").font(.system(size: 22)).foregroundStyle(Ink.primary)
              .frame(width: 56, height: 56)
              .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            Text(RoutineDraft.empty)
              .font(.system(size: 15)).foregroundStyle(Ink.secondary).multilineTextAlignment(.center)
            Button { open(nil) } label: {
              // The pill is the label, so all of it takes the tap, not just the words.
              Text("Create Routine")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Ink.ground)
                .padding(.horizontal, 22).frame(height: 40)
                .background(Ink.primary, in: Capsule())
                .contentShape(.capsule)
            }
            .buttonStyle(.plain)
          }
          .padding(.top, 20)
        } else {
          HStack {
            Spacer()
            Button { open(nil) } label: {
              Label("New Routine", systemImage: "plus")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Ink.primary)
                .frame(minHeight: 44)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
          }
          ForEach(Routine.listed(list)) { routine in
            Button { open(routine) } label: {
              HStack(spacing: 12) {
                RoutineSign(routine: routine)
                VStack(alignment: .leading, spacing: 2) {
                  Text(routine.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
                  Text(routine.rowDetail).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.tertiary)
              }
              .padding(.vertical, 12)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(routine.name), \(routine.rowDetail)")
            Rectangle().fill(Ink.hairline).frame(height: 1)
          }
        }
      } else if !loaded {
        ProgressView().padding(.top, 30)
      }
    }
    .task(id: agent.id) {
      await store.loadRoutines(agent.id)
      loaded = true
      takeRequest()
    }
    .onChange(of: list) { _, _ in takeRequest() }
    .sheet(item: $editing) { item in
      RoutineEditor(model: item.model, runs: runs).problemAlert()
    }
  }

  /** New Routine (nil) or a routine's row: its editor, afresh. */
  private func open(_ routine: Routine?) {
    editing = Editing(model: RoutineEditing(agentId: agent.id, routine: routine))
  }

  /** A routine found in search: its editor once the list has it (`W2n`). */
  private func takeRequest() {
    guard !opened, let opening, let routine = store.routinesByAgent[agent.id]?.first(where: { $0.id == opening }) else { return }
    opened = true
    open(routine)
  }
}

/** A routine's sign in the list (the Mac's `RoutineIcon`): the pause sign when paused, a spinner while its run goes, else the clock in green. */
private struct RoutineSign: View {
  let routine: Routine

  var body: some View {
    Group {
      if !routine.isEnabled {
        Image(systemName: "pause.circle").font(.system(size: 17)).foregroundStyle(Ink.tertiary)
      } else if routine.isRunning {
        ProgressView().controlSize(.small).tint(Ink.link)
      } else {
        Image(systemName: "clock").font(.system(size: 17)).foregroundStyle(Ink.routineGreen)
      }
    }
    .frame(width: 22, height: 22)
  }
}

/** A group's members, and Edit to choose them (`setGroupMembers`). */
struct GroupMembers: View {
  let group: Agent
  @Environment(AppStore.self) private var store
  @State private var editing = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("Members").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        Spacer()
        Button("Edit") { editing = true }.font(.system(size: 15)).foregroundStyle(Ink.blue)
      }
      .padding(.bottom, 6)
      ForEach(store.members(of: group)) { member in
        HStack(spacing: 12) {
          AgentAvatar(agent: member).frame(width: 40, height: 40)
          VStack(alignment: .leading, spacing: 2) {
            Text(member.name).font(.system(size: 16)).foregroundStyle(Ink.primary)
            if !member.title.isEmpty { Text(member.title).font(.system(size: 13)).foregroundStyle(Ink.secondary) }
          }
          Spacer()
        }
        .padding(.vertical, 8)
        Rectangle().fill(Ink.hairline).frame(height: 1)
      }
    }
    .sheet(isPresented: $editing) { MembersEditor(group: group).problemAlert().macSheetSize(width: 420, height: 520) }
  }
}

struct MembersEditor: View {
  let group: Agent
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var picked: Set<String> = []
  @State private var saving = false

  var body: some View {
    NavigationStack {
      // Hidden agents stay out of the picker, unless already in the group (saving must not drop them).
      List(store.agents.filter { !$0.isGroup && (!$0.isHidden || picked.contains($0.id)) }) { agent in
        Button {
          if picked.contains(agent.id) { picked.remove(agent.id) } else { picked.insert(agent.id) }
        } label: {
          HStack(spacing: 12) {
            AgentAvatar(agent: agent).frame(width: 40, height: 40)
            Text(agent.name).foregroundStyle(Ink.primary)
            Spacer()
            Image(systemName: picked.contains(agent.id) ? "checkmark.circle.fill" : "circle")
              .font(.system(size: 22)).foregroundStyle(picked.contains(agent.id) ? Ink.blue : Ink.tertiary)
          }
        }
      }
      .navigationTitle("Members")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) { CloseButton() }
        ToolbarItem(placement: .trailingBar) {
          Button("Save") {
            let ids = store.agents.filter { picked.contains($0.id) }.map(\.id)
            saving = true
            Task { await store.setMembers(group.id, ids); dismiss() }
          }
          .disabled(saving || picked.count < 2)
        }
      }
      .onAppear { picked = Set(group.memberIds) }
    }
  }
}
