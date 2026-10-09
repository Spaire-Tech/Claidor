import AppKit
import SwiftUI
import SimeonCore

/**
 * The agent's pane beside the chat (the shipped window's info pane, one
 * page since the patch's `agent-pane-one-page`), as a Mac inspector: the
 * avatar in its white disc with the pencil (the avatar editor opens under
 * it), the name and title, then Profile · Routines · Computer as icons.
 * Profile: Name, Title, Description and Notifications. Routines: the list
 * and a routine's editor. Computer: the agent's screen, or a group's
 * Members. ✕ closes it ("Close details"); so do Esc, the header's agent
 * button, ⌘⇧, ⌘⇧I and ⌘⌥B.
 */
struct MacAgentPane: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var tab: MacNavigation.PaneTab = .profile
  @State private var routine: MacNavigation.RoutineTarget?
  @State private var editingAvatar = false

  var body: some View {
    VStack(spacing: 0) {
      header
      if let agent = store.agent(agentId) {
        if let routine {
          MacRoutineEditor(agentId: agentId, target: routine, back: { self.routine = nil })
            .id(routine)
        } else {
          page(agent)
        }
      } else {
        Text("No agent selected.").font(.system(size: 13)).foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .background(Color.dynamic(light: "#fbfbfd", dark: "#1c1c1e"))
    .onAppear { take(navigation.paneRequest) }
    .onChange(of: navigation.paneRequest) { _, request in take(request) }
  }

  /** The pane's own bar: in a routine's editor, back ("Back to Routines") and "Routine"; always ✕. */
  private var header: some View {
    HStack(spacing: 6) {
      if routine != nil {
        Button { routine = nil } label: { Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold)) }
          .buttonStyle(.borderless)
          .accessibilityLabel("Back to Routines")
          .help("Back to Routines")
        Text("Routine").font(.system(size: 13, weight: .semibold))
      }
      Spacer()
      Button { navigation.closePane() } label: { Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)) }
        .buttonStyle(.borderless)
        .accessibilityLabel("Close details")
        .help("Close")
    }
    .padding(.horizontal, 14)
    .frame(height: 36)
  }

  /** A request for this pane (a tab, a routine): taken once. */
  private func take(_ request: MacNavigation.PaneRequest?) {
    guard let request else { return }
    navigation.paneRequest = nil
    tab = request.tab
    routine = request.routine.map { .existing($0) }
  }

  private func page(_ agent: Agent) -> some View {
    ScrollView {
      VStack(spacing: 0) {
        avatar(agent)
        Text(agent.name)
          .font(.system(size: 22, weight: .medium))
          .lineLimit(1).truncationMode(.tail)
          .padding(.top, 14)
        if !agent.isGroup, !agent.title.trimmingCharacters(in: .whitespaces).isEmpty {
          Text(agent.title).font(.system(size: 15)).foregroundStyle(.secondary).padding(.top, 1)
        }
        Picker("Agent", selection: $tab) {
          Image(systemName: "person").help("Profile").accessibilityLabel("Profile").tag(MacNavigation.PaneTab.profile)
          Image(systemName: "clock").help("Routines").accessibilityLabel("Routines").tag(MacNavigation.PaneTab.routines)
          Image(systemName: "display").help("Computer").accessibilityLabel("Computer").tag(MacNavigation.PaneTab.computer)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .controlSize(.large)
        .padding(.top, 32)
        .padding(.bottom, 26)
        Group {
          switch tab {
          case .profile: MacProfileFields(agent: agent)
          case .routines: MacRoutineList(agentId: agent.id) { routine = $0 }
          case .computer:
            if agent.isGroup {
              if !agent.isRemoteRoom { MacMembers(group: agent) }
            } else {
              ComputerTab(agent: agent)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, 20)
      .padding(.top, 6)
      .padding(.bottom, 40)
    }
  }

  /** The avatar in its disc, the pencil at its corner: "Edit Avatar" opens the editor under it. */
  private func avatar(_ agent: Agent) -> some View {
    Button { editingAvatar.toggle() } label: {
      ZStack(alignment: .bottomTrailing) {
        AgentAvatar(agent: agent, members: store.members(of: agent))
          .frame(width: agent.isGroup ? 80 : 64, height: agent.isGroup ? 54 : 64)
          .frame(width: 96, height: 96)
          .background(Ink.tile, in: Circle())
          .overlay(Circle().stroke(Ink.tileEdge, lineWidth: 1))
          .clipShape(Circle())
        Image(systemName: "pencil")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Ink.primary)
          .frame(width: 32, height: 32)
          .background(Ink.bubbleTheirs, in: Circle())
          .overlay(Circle().stroke(Color.dynamic(light: "#fbfbfd", dark: "#1c1c1e"), lineWidth: 3))
          .offset(x: 3, y: 3)
      }
      .contentShape(.circle)
    }
    .buttonStyle(.plain)
    .help("Edit Avatar")
    .accessibilityLabel("Edit agent avatar")
    .accessibilityValue(editingAvatar ? "expanded" : "collapsed")
    .popover(isPresented: $editingAvatar, arrowEdge: .bottom) {
      MacAvatarEditor(agentId: agentId) { editingAvatar = false }
        .environment(store)
    }
  }
}

/**
 * Profile (`h3n`): Name, Title and Description, each saved on leaving it or
 * with Return (not in Description); Esc puts back what was there; an empty
 * name goes back to the old one. The Chief of Staff's title and description
 * are his own (read only). A group has no title and no Notifications.
 */
struct MacProfileFields: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @State private var notifying = false

  private var isChief: Bool { Agent.chiefOfStaff(in: store.agents)?.id == agent.id }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      MacPaneField(label: "Name", accessibility: "Agent name", placeholder: "Bob", value: agent.name, required: true) { name in
        Task { await store.saveProfileField(agent.id, name: name, description: agent.description) }
      }
      if !agent.isGroup {
        MacPaneField(label: "Title", accessibility: "Agent title", placeholder: "Describe what your agent does", value: agent.title, readOnly: isChief) { title in
          Task { await store.saveProfileField(agent.id, name: agent.name, description: agent.description, title: title) }
        }
      }
      MacPaneField(label: "Description", accessibility: "Agent description", placeholder: "What this agent is for", value: agent.description, multiline: true, readOnly: isChief) { description in
        Task { await store.saveProfileField(agent.id, name: agent.name, description: description) }
      }
      if !agent.isGroup {
        HStack(spacing: 12) {
          Image(systemName: "bell").font(.system(size: 16)).foregroundStyle(Ink.primary)
            .frame(width: 40, height: 40)
            .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
          VStack(alignment: .leading, spacing: 2) {
            Text("Notifications").font(.system(size: 15, weight: .medium))
            Text("Get notified when this agent finishes or needs input").font(.system(size: 13)).foregroundStyle(.secondary)
          }
          Spacer(minLength: 8)
          Toggle("Notifications", isOn: Binding(get: { agent.notifyOnUpdates }, set: { on in
            notifying = true
            Task { await store.setNotify(agent.id, on); notifying = false }
          }))
          .toggleStyle(.switch)
          .labelsHidden()
          .disabled(notifying)
        }
        .padding(.top, 4)
      }
    }
  }
}

/**
 * One of the pane's fields (`Uwe`): its heading, then the text with a hairline
 * under it. Saved trimmed on leaving it (Return leaves a one-line field);
 * Esc puts back the value and leaves without saving; an empty required
 * field goes back quietly. While not being edited it follows the agent.
 */
struct MacPaneField: View {
  let label: String
  let accessibility: String
  let placeholder: String
  let value: String
  var multiline = false
  var required = false
  var readOnly = false
  let commit: (String) -> Void
  @State private var draft = ""
  @State private var cancelled = false
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.system(size: 13)).foregroundStyle(.secondary)
      Group {
        if readOnly {
          Text(value.isEmpty ? " " : value)
            .font(.system(size: 15))
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          TextField(placeholder, text: $draft, axis: multiline ? .vertical : .horizontal)
            .textFieldStyle(.plain)
            .font(.system(size: 15))
            .lineLimit(multiline ? 2...12 : 1...1)
            .focused($focused)
            .onSubmit { if !multiline { focused = false } }
            .onExitCommand {
              cancelled = true
              draft = value
              focused = false
            }
        }
      }
      .padding(.top, 4)
      .padding(.bottom, 12)
      .overlay(alignment: .bottom) {
        Rectangle().fill(focused ? Ink.primary : Ink.hairline).frame(height: focused ? 1 : 0.5)
      }
      .accessibilityLabel(accessibility)
    }
    .onAppear { draft = value }
    .onChange(of: value) { _, now in if !focused { draft = now } }
    .onChange(of: focused) { _, now in
      guard !now else { cancelled = false; return }
      defer { cancelled = false }
      guard !cancelled, !readOnly else { draft = value; return }
      let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed == value { return }
      if trimmed.isEmpty && required { draft = value; return }
      commit(trimmed)
    }
  }
}

/**
 * A group's members (`z2n`, on the Computer tab): each opens its chat; its
 * Remove shows on hover and asks first; Add Member lists every agent that is
 * not a group and not in it yet, six at most.
 */
struct MacMembers: View {
  let group: Agent
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var hovered: String?
  @State private var busy = false

  var body: some View {
    let members = store.members(of: group)
    let candidates = store.agents.filter { !$0.isGroup && $0.id != group.id && !group.memberIds.contains($0.id) }
    let full = group.memberIds.count >= NewChat.maxRecipients
    VStack(alignment: .leading, spacing: 6) {
      Text("Members").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
      ForEach(members) { member in
        HStack(spacing: 10) {
          Button { navigation.selected = member.id } label: {
            HStack(spacing: 10) {
              AgentAvatar(agent: member).frame(width: 28, height: 28)
              Text(member.name).font(.system(size: 13)).lineLimit(1)
              Spacer(minLength: 0)
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Open \(member.name)'s chat")
          Button("Remove") { askToRemove(member) }
            .controlSize(.small)
            .foregroundStyle(Ink.danger)
            .opacity(hovered == member.id ? 1 : 0)
            .disabled(members.count <= 1 || busy)
            .accessibilityLabel("Remove \(member.name)")
        }
        .padding(.vertical, 3)
        .onHover { inside in hovered = inside ? member.id : (hovered == member.id ? nil : hovered) }
        .animation(.easeOut(duration: 0.12), value: hovered)
      }
      if !full && !candidates.isEmpty {
        Menu {
          ForEach(candidates) { candidate in
            Button { add(candidate) } label: {
              Label { Text(candidate.name) } icon: { AgentAvatar(agent: candidate).frame(width: 20, height: 20) }
            }
          }
        } label: {
          Label("Add Member", systemImage: "plus.circle.fill").font(.system(size: 13))
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .disabled(busy)
        .accessibilityLabel("Add Member")
        .padding(.top, 4)
      }
      if full {
        Text("Groups can have up to \(NewChat.maxRecipients) members.").font(.system(size: 11)).foregroundStyle(.tertiary)
      } else if candidates.isEmpty {
        Text("Create more Agents to add them here.").font(.system(size: 11)).foregroundStyle(.tertiary)
      }
    }
  }

  /** Picking one adds it at once (`setGroupMembers`); nothing is said if it fails. */
  private func add(_ agent: Agent) {
    busy = true
    let ids = group.memberIds + [agent.id]
    Task {
      try? await store.setGroupMembers(group.id, ids)
      busy = false
    }
  }

  /** Remove asks first (`F2n`); the latest members are read again when it is confirmed. */
  private func askToRemove(_ member: Agent) {
    navigation.confirm = MacConfirmation(title: "Remove \(member.name) from this conversation?", message: "", action: "Remove", pending: "Removing...", failure: "Removing failed. Check your connection and try again.") {
      guard let latest = store.agent(group.id), latest.memberIds.count > 1, latest.memberIds.contains(member.id) else { return true }
      do {
        try await store.setGroupMembers(group.id, latest.memberIds.filter { $0 != member.id })
        return true
      } catch {
        return false
      }
    }
  }
}

/**
 * The question sheet the window's alert is (380 wide): the title, the words,
 * Cancel and the action in red with the focus; while it runs the action
 * reads its pending word and both are held; a failure shows in red under
 * the words and the sheet stays.
 */
struct MacConfirmSheet: View {
  let confirmation: MacConfirmation
  @Environment(MacNavigation.self) private var navigation
  @State private var running = false
  @State private var failed = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(confirmation.title).font(.system(size: 13, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
      if !confirmation.message.isEmpty {
        Text(confirmation.message).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      if failed, let failure = confirmation.failure {
        Text(failure).font(.system(size: 12)).foregroundStyle(Ink.danger)
          .accessibilityAddTraits(.isStaticText)
      }
      HStack {
        Spacer()
        Button("Cancel", role: .cancel) { navigation.confirm = nil }
          .keyboardShortcut(.cancelAction)
          .disabled(running)
        Button(running ? (confirmation.pending ?? confirmation.action) : confirmation.action, role: .destructive) { run() }
          .keyboardShortcut(.defaultAction)
          .tint(.red)
          .disabled(running)
      }
      .padding(.top, 6)
    }
    .padding(20)
    .frame(width: 380)
  }

  private func run() {
    running = true
    failed = false
    Task {
      let done = await confirmation.perform()
      running = false
      if done { navigation.confirm = nil } else { failed = true }
    }
  }
}
