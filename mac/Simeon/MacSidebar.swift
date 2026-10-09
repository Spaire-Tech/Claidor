import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * The agents (the shipped window's sidebar, `u0n`), in the Mac's sidebar:
 * the pinned ones as tiles, then the list, or the person's sections (each
 * folding; "Unassigned" last, only when it holds someone), Hidden Agents at
 * the end and the account at the foot. A click opens an agent; ⌘-click
 * and ⇧-click pick several, which the toolbar then moves, deletes or lets
 * go (Esc lets go, Delete asks to delete them). A double-click renames a
 * row. Rows and tiles drag into sections and onto the pins. While the
 * agent's pane is open the sidebar is its rail: butterflies only, a card
 * on hover.
 */
struct MacSidebar: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var query = ""

  private var visible: [Agent] { store.agents.filter { !$0.isHidden } }
  private var rail: Bool { navigation.railShown }

  /** Every listed agent, or those the search finds (hidden ones too) by name, title, description or last line. */
  private var found: [Agent] {
    let words = query.trimmingCharacters(in: .whitespaces)
    return store.agents.filter { agent in
      agent.name.localizedCaseInsensitiveContains(words) || agent.title.localizedCaseInsensitiveContains(words)
        || agent.description.localizedCaseInsensitiveContains(words) || agent.previewLine.localizedCaseInsensitiveContains(words)
    }
  }

  var body: some View {
    let sections = SidebarSections.shown(agents: visible, pinnedIds: store.pinnedIds, sections: store.sidebarSections ?? [], collapsed: navigation.foldedSections)
    let pins = store.pinned
    let unpinned = store.listed
    List {
      if !query.trimmingCharacters(in: .whitespaces).isEmpty {
        ForEach(found) { agent in row(agent) }
      } else {
        if !pins.isEmpty {
          if rail {
            ForEach(pins) { agent in railRow(agent, pinned: true) }
            Divider()
          } else {
            MacPinGrid(pins: pins).listRowSeparator(.hidden)
          }
        }
        newChatRows
        if sections.isEmpty {
          ForEach(unpinned) { agent in
            if rail {
              railRow(agent, pinned: false)
            } else {
              // A tile dropped on the plain list is unpinned.
              row(agent).dropDestination(for: String.self) { items, _ in unpinDropped(items) } isTargeted: { _ in }
            }
          }
        } else if rail {
          ForEach(sections.filter { !$0.isCollapsed }) { section in
            ForEach(section.agents) { agent in railRow(agent, pinned: false) }
            Divider()
          }
        } else {
          ForEach(sections) { section in sectionView(section) }
        }
        if !store.hiddenAgents.isEmpty && !rail {
          Button { navigation.sheet = .hiddenAgents } label: {
            HStack {
              Text("Hidden Agents")
              Spacer()
              Text("\(store.hiddenAgents.count)").monospacedDigit()
            }
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(.isButton)
        }
      }
    }
    .listStyle(.sidebar)
    .accessibilityLabel("Simeon agents")
    .modifier(SidebarSearch(query: $query, enabled: !rail))
    .overlay { emptyState(unpinned: unpinned, pins: pins) }
    // The list's own menu, on its empty space (`Qhn`).
    .contextMenu {
      if !store.hiddenAgents.isEmpty {
        Button { navigation.sheet = .hiddenAgents } label: { Label("Hidden Agents (\(store.hiddenAgents.count))", systemImage: "eye.slash") }
      }
    }
    // With rows picked: Esc lets go, Delete or Backspace asks to delete them.
    .onKeyPress(.escape) {
      guard !navigation.selection.isEmpty else { return .ignored }
      navigation.selection.clear()
      return .handled
    }
    .onKeyPress(keys: [.delete, .deleteForward]) { _ in
      guard !navigation.selection.isEmpty else { return .ignored }
      navigation.askToDelete(Array(navigation.selection.ids), store: store)
      return .handled
    }
    .onChange(of: store.agents.map(\.id)) { _, ids in navigation.selection.keep(Set(ids)) }
    .animation(.spring(response: 0.38, dampingFraction: 0.86), value: unpinned.map(\.id))
    .animation(.spring(response: 0.38, dampingFraction: 0.86), value: store.pinnedIds)
    // A list already shown that could not be read again: "Reconnecting to your computer…" over it (`npn`).
    .safeAreaInset(edge: .top, spacing: 0) { if store.rosterFailed && !store.agents.isEmpty && !rail { MacSidebarReconnecting() } }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !rail {
        VStack(alignment: .leading, spacing: 6) {
          MacUpdatePill().controlSize(.small).padding(.horizontal, 12)
          MacAccountBar()
        }
      }
    }
    .toolbar { toolbar }
  }

  // MARK: The toolbar: New chat, or what to do with the rows picked

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    ToolbarItemGroup {
      if navigation.selection.isEmpty {
        Button { navigation.openNewChat() } label: { Label("New chat", systemImage: "square.and.pencil") }
          .help("New chat")
      } else {
        let picked = Array(navigation.selection.ids)
        let movable = picked.filter { !store.pinnedIds.contains($0) }
        if store.sidebarSections != nil && !movable.isEmpty {
          Menu {
            MacMoveItems(ids: movable, current: nil, list: true)
          } label: {
            Label("Move", systemImage: "folder")
          }
          .accessibilityLabel(movable.count == 1 ? "Move selected agent to section" : "Move \(movable.count) selected agents to section")
        }
        Button { navigation.askToDelete(picked, store: store) } label: { Label("Delete", systemImage: "trash") }
          .accessibilityLabel(picked.count == 1 ? "Delete selected agent" : "Delete \(picked.count) selected agents")
          .help(rail ? "Delete selected" : "")
        Button { navigation.selection.clear() } label: { Label("Clear selection", systemImage: "xmark") }
          .accessibilityLabel("Clear selection")
          .help(rail ? "Clear selection" : "")
      }
    }
  }

  // MARK: Rows

  /** A row of the list: a click opens it, ⌘ and ⇧ pick, a double-click renames; dragged into a section or onto the pins. */
  private func row(_ agent: Agent) -> some View {
    let picked = navigation.selection.contains(agent.id)
    let open = navigation.selected == agent.id && !navigation.newChat.isOpen
    return Group {
      if navigation.renaming == agent.id {
        MacRenameField(initial: agent.name, label: "Rename agent") { name in
          navigation.renaming = nil
          if let name { Task { await store.renameAgent(agent.id, to: name) } }
        }
        .padding(.vertical, 6)
      } else {
        MacAgentRow(agent: agent, members: store.members(of: agent), draft: open ? nil : store.drafts[agent.id], call: store.call?.agentId == agent.id ? store.call : nil, picked: picked)
          .equatable()
          .help(agent.previewLine.count > 140 ? String(agent.previewLine.prefix(140)) + "\u{2026}" : agent.previewLine)
      }
    }
    .contentShape(.rect)
    .onTapGesture { click(agent.id, canRename: true) }
    .listRowBackground(rowBackground(open: open, picked: picked))
    .contextMenu { MacAgentMenu(agent: agent) }
    .draggable("agent:\(agent.id)") {
      AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 34, height: 34)
    }
    .accessibilityAddTraits(picked || open ? .isSelected : [])
  }

  /** A butterfly in the rail: picked and opened as a row is, its card on hover. */
  private func railRow(_ agent: Agent, pinned: Bool) -> some View {
    let picked = navigation.selection.contains(agent.id)
    let open = navigation.selected == agent.id && !navigation.newChat.isOpen
    return AgentAvatar(agent: agent, members: store.members(of: agent), moves: true)
      .frame(width: 34, height: 34)
      .overlay(alignment: .bottomTrailing) {
        if let dot = RowStatus(agent: agent).cornerOnPin { StatusDot(colour: dot, size: 8).offset(x: 2, y: 2) }
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 4)
      .contentShape(.rect)
      .onTapGesture { click(agent.id, canRename: false) }
      .listRowBackground(rowBackground(open: open, picked: picked))
      .contextMenu { MacAgentMenu(agent: agent) }
      .modifier(MacHoverCard(agent: agent, pinned: pinned))
      .accessibilityLabel(agent.name)
  }

  private func rowBackground(open: Bool, picked: Bool) -> some View {
    RoundedRectangle(cornerRadius: 6, style: .continuous)
      .fill(picked ? Color.accentColor.opacity(0.28) : open ? Color.primary.opacity(0.09) : .clear)
      .padding(.horizontal, 8)
  }

  /** The window's click (`de`): ⌘ toggles a row in the pick, ⇧ picks the range, a plain click lets go and opens; a second click renames. */
  private func click(_ id: String, canRename: Bool) {
    guard navigation.renaming == nil else { return }
    let event = NSApp.currentEvent
    if (event?.clickCount ?? 1) > 1 {
      if canRename { navigation.renaming = id }
      return
    }
    let flags = event?.modifierFlags ?? []
    if flags.contains(.command) { navigation.selection.toggle(id); return }
    if flags.contains(.shift) { navigation.selection.extend(to: id, order: navigation.order(store)); return }
    navigation.selection.plain(id)
    if navigation.newChat.isOpen { navigation.newChat.close() }
    navigation.selected = id
  }

  // MARK: The new chat's rows

  @ViewBuilder
  private var newChatRows: some View {
    let state = navigation.newChat
    if state.isOpen && state.previewId(navigation) == nil {
      // The window's draft row (`aUe`): who the new chat is for.
      HStack(spacing: 10) {
        Image(systemName: "square.and.pencil").frame(width: 34, height: 34).background(Ink.pill, in: Circle())
        if !rail { Text(NewChat.draftRowLabel(recipients: state.recipients)).font(.system(size: 13, weight: .semibold)).lineLimit(1) }
      }
      .padding(.vertical, 4)
      .listRowBackground(rowBackground(open: true, picked: false))
      .accessibilityLabel("New chat draft: \(NewChat.draftRowLabel(recipients: state.recipients))")
    }
    if let creating = state.creating, creating.agentId.flatMap({ store.agent($0) }) == nil {
      // The window's creating row (`qwe`).
      HStack(spacing: 10) {
        ProgressView().controlSize(.small).frame(width: 34, height: 34)
        if !rail {
          VStack(alignment: .leading, spacing: 2) {
            Text(creating.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Text("Creating\u{2026}").font(.system(size: 12)).foregroundStyle(.secondary)
          }
        }
      }
      .padding(.vertical, 4)
      .accessibilityLabel("Creating \(creating.name)")
    }
  }

  // MARK: Sections

  private func sectionView(_ section: SidebarSections.Shown) -> some View {
    Section(isExpanded: Binding(get: { !section.isCollapsed }, set: { open in
      if open { navigation.foldedSections.remove(section.id) } else { navigation.foldedSections.insert(section.id) }
    })) {
      if section.agents.isEmpty {
        Text(SidebarSections.emptySection)
          .font(.system(size: 12)).foregroundStyle(.tertiary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .dropDestination(for: String.self) { items, _ in dropInto(section.id, items) } isTargeted: { _ in }
      } else {
        ForEach(section.agents) { agent in
          row(agent).dropDestination(for: String.self) { items, _ in dropInto(section.id, items) } isTargeted: { _ in }
        }
      }
    } header: {
      MacSectionHeader(section: section, dropInto: { dropInto(section.id, $0) })
    }
  }

  /** A row or a tile dropped on a section: into it (a tile is unpinned first); only the one dragged moves. */
  private func dropInto(_ sectionId: String, _ items: [String]) -> Bool {
    guard let item = items.first else { return false }
    if let id = item.removingPrefix("agent:") {
      store.editSections { SidebarSections.assign($0, agentIds: [id], to: sectionId) }
      return true
    }
    if let id = item.removingPrefix("pin:") {
      Task { await store.setPinned(id, false) }
      store.editSections { SidebarSections.assign($0, agentIds: [id], to: sectionId) }
      return true
    }
    return false
  }

  /** A tile dropped on the plain list: unpinned. */
  private func unpinDropped(_ items: [String]) -> Bool {
    guard let id = items.first?.removingPrefix("pin:") else { return false }
    Task { await store.setPinned(id, false) }
    return true
  }

  @ViewBuilder
  private func emptyState(unpinned: [Agent], pins: [Agent]) -> some View {
    if !query.trimmingCharacters(in: .whitespaces).isEmpty {
      if found.isEmpty { Text("No results").font(.system(size: 13)).foregroundStyle(.secondary) }
    } else if store.agents.isEmpty && store.rosterFailed && !rail {
      MacSidebarConnection()
    } else if store.agents.isEmpty && navigation.newChat.creating == nil && !store.isLoading && !rail {
      Text("No saved agents yet.").font(.system(size: 13)).foregroundStyle(.secondary)
    } else if !store.agents.isEmpty && visible.isEmpty && !rail {
      VStack(spacing: 10) {
        Text("All bots are hidden").font(.system(size: 13)).foregroundStyle(.secondary)
        Button("Show Hidden Agents") { navigation.sheet = .hiddenAgents }
      }
    }
  }
}

/** The search field at the sidebar's top, gone while the sidebar is its rail. */
private struct SidebarSearch: ViewModifier {
  @Binding var query: String
  let enabled: Bool

  func body(content: Content) -> some View {
    if enabled { content.searchable(text: $query, placement: .sidebar, prompt: "Search") } else { content }
  }
}

extension String {
  /** What follows a prefix, or nil without it. */
  func removingPrefix(_ prefix: String) -> String? { hasPrefix(prefix) ? String(dropFirst(prefix.count)) : nil }
}

/**
 * A section's header (`Zbe`): its name, its count while folded, and (not
 * for "Unassigned") a right-click menu: Rename, Move up, Move down, Delete,
 * which asks first. It is dragged to move the section; agents dropped on it
 * go in.
 */
struct MacSectionHeader: View {
  let section: SidebarSections.Shown
  let dropInto: ([String]) -> Bool
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let all = store.sidebarSections ?? []
    let mine = all.filter { !$0.isUnassigned }
    let index = mine.firstIndex { $0.id == section.id }
    Group {
      if navigation.renamingSection == section.id {
        MacRenameField(initial: section.name, label: "Rename section") { name in
          navigation.renamingSection = nil
          if let name { store.editSections { SidebarSections.rename($0, id: section.id, to: name) } }
        }
      } else {
        HStack {
          Text(section.isUnassigned ? SidebarSections.unassignedName : section.name).lineLimit(1)
          Spacer()
          if section.isCollapsed { Text("\(section.agents.count)").monospacedDigit().foregroundStyle(.tertiary) }
        }
      }
    }
    .contentShape(.rect)
    .contextMenu {
      if !section.isUnassigned, let index {
        Button { navigation.renamingSection = section.id } label: { Label("Rename", systemImage: "pencil") }
        Button { store.editSections { SidebarSections.move($0, id: section.id, to: mine[index - 1].id, before: true) } } label: { Label("Move up", systemImage: "arrow.up") }
          .disabled(index == 0)
        Button { store.editSections { SidebarSections.move($0, id: section.id, to: mine[index + 1].id, before: false) } } label: { Label("Move down", systemImage: "arrow.down") }
          .disabled(index >= mine.count - 1)
        Divider()
        Button(role: .destructive) { askToDelete() } label: { Label("Delete", systemImage: "trash") }
      }
    }
    .modifier(SectionDrag(section: section, enabled: !section.isUnassigned && navigation.renamingSection != section.id))
    .dropDestination(for: String.self) { items, location in
      guard let item = items.first else { return false }
      if let moved = item.removingPrefix("section:") {
        guard !section.isUnassigned, moved != section.id, moved != SidebarSections.unassignedId else { return false }
        // Above the header's middle goes before it, below goes after.
        store.editSections { SidebarSections.move($0, id: moved, to: section.id, before: location.y < 11) }
        return true
      }
      return dropInto(items)
    }
  }

  /** Delete asks first (`A3n`); the section's agents go to Unassigned. */
  private func askToDelete() {
    let id = section.id
    let store = store
    navigation.confirm = MacConfirmation(title: SidebarSections.deleteTitle(name: section.name), message: SidebarSections.deleteMessage, action: "Delete") {
      store.editSections { SidebarSections.remove($0, id: id) }
      return true
    }
  }
}

private struct SectionDrag: ViewModifier {
  let section: SidebarSections.Shown
  let enabled: Bool

  func body(content: Content) -> some View {
    if enabled {
      content.draggable("section:\(section.id)") { Text(section.name).padding(6).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6)) }
    } else {
      content
    }
  }
}

/**
 * A name changed in place (`yut`): selected as it opens; Return keeps it,
 * Esc lets it go; leaving it keeps it. An empty name, or the same one, is
 * not saved.
 */
struct MacRenameField: View {
  let initial: String
  let label: String
  /** The new name, or nil to keep the old one. */
  let done: (String?) -> Void
  @State private var text = ""
  @State private var finished = false
  @State private var cancelled = false
  @FocusState private var focused: Bool

  var body: some View {
    TextField("", text: $text)
      .textFieldStyle(.roundedBorder)
      .focused($focused)
      .accessibilityLabel(label)
      .autocorrectionDisabled()
      .onAppear {
        text = initial
        focused = true
        DispatchQueue.main.async { _ = NSApp.keyWindow?.firstResponder?.tryToPerform(#selector(NSText.selectAll(_:)), with: nil) }
      }
      .onSubmit { focused = false }
      .onExitCommand { cancelled = true; focused = false }
      .onChange(of: focused) { _, now in if !now { finish() } }
      .onDisappear { finish() }
  }

  private func finish() {
    guard !finished else { return }
    finished = true
    let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
    done(!cancelled && !name.isEmpty && name != initial ? name : nil)
  }
}

/**
 * One agent or group in the sidebar (`sidebar-agent-status.ts`): its
 * butterfly (moving while it works, the green dot at its corner while the
 * work has no name), the name, the title, the time; under them the last line
 * (what it is doing while it works, your unsent draft, else its last
 * message) and the dot of an unread chat, orange when it waits on you.
 */
struct MacAgentRow: View, Equatable {
  let agent: Agent
  let members: [Agent]
  let draft: String?
  let call: CallState?
  var picked = false

  static func == (a: MacAgentRow, b: MacAgentRow) -> Bool {
    a.agent == b.agent && a.members == b.members && a.draft == b.draft && a.call?.agentId == b.call?.agentId && a.call?.phase == b.call?.phase && a.picked == b.picked
  }

  var body: some View {
    let status = RowStatus(agent: agent)
    HStack(alignment: .center, spacing: 10) {
      AgentAvatar(agent: agent, members: members, moves: true)
        .frame(width: 34, height: 34)
        .overlay(alignment: .bottomTrailing) {
          if let dot = status.cornerOnRow { StatusDot(colour: dot, size: 8).offset(x: 2, y: 2) }
        }
        .overlay {
          if picked { Circle().fill(Color.accentColor.opacity(0.35)).overlay(Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)) }
        }
      VStack(alignment: .leading, spacing: 2) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(agent.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
          if !agent.title.isEmpty {
            Text(agent.title).font(.system(size: 11)).foregroundStyle(Ink.title).lineLimit(1)
          }
          Spacer(minLength: 4)
          if let call {
            CallChip(call: call)
          } else if let at = agent.lastActivityAt, at > 0 {
            Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000))).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize()
          }
        }
        HStack(alignment: .top, spacing: 6) {
          Text(line).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
          Spacer(minLength: 0)
          if let marker = status.marker {
            Circle().fill(marker).frame(width: 8, height: 8).padding(.top, 4)
              .accessibilityLabel(status.label ?? "")
          }
        }
      }
    }
    .padding(.vertical, 4)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }

  /** The Electron sidebar's order: what it is doing while it works, else your unsent draft, else the last line. */
  private var line: String {
    if agent.isBusy, let activity = agent.activityLabel { return activity }
    if agent.isComposing { return "Typing…" }
    if let draft { return "Draft: " + draft.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
    return agent.previewLine
  }
}

/**
 * The pinned agents above the rows (the window's pin grid: tiles, the
 * butterfly, the name, the title in blue). A click opens, ⌘ and ⇧ pick; a
 * right click is the row's menu; a tile dragged onto another moves there,
 * a row dragged onto the grid is pinned, a tile dragged onto a section goes
 * into it. The card shows on hover.
 */
struct MacPinGrid: View {
  let pins: [Agent]
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var target: String?

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 74, maximum: 96), spacing: 6)], spacing: 10) {
      ForEach(pins) { agent in
        let open = navigation.selected == agent.id && !navigation.newChat.isOpen
        let picked = navigation.selection.contains(agent.id)
        VStack(spacing: 4) {
          AgentAvatar(agent: agent, members: store.members(of: agent), moves: true)
            .frame(width: 48, height: 48)
            .overlay(alignment: .bottomTrailing) {
              if let dot = RowStatus(agent: agent).cornerOnPin { StatusDot(colour: dot, size: 9).offset(x: 1, y: 1) }
            }
          Text(agent.name).font(.system(size: 11, weight: open ? .semibold : .regular)).lineLimit(1)
          if !agent.title.isEmpty { Text(agent.title).font(.system(size: 10)).foregroundStyle(Ink.title).lineLimit(1) }
        }
        .padding(.vertical, 6).padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
        .background(picked ? AnyShapeStyle(Color.accentColor.opacity(0.28)) : open ? AnyShapeStyle(.selection.opacity(0.25)) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .contentShape(.rect(cornerRadius: 10))
        .onTapGesture { click(agent.id) }
        .contextMenu { MacAgentMenu(agent: agent) }
        .modifier(MacHoverCard(agent: agent, pinned: true))
        .draggable("pin:\(agent.id)") {
          AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 48, height: 48)
        }
        .dropDestination(for: String.self) { items, _ in
          guard let item = items.first, let index = store.pinnedIds.firstIndex(of: agent.id) else { return false }
          if let moved = item.removingPrefix("pin:"), moved != agent.id {
            Task { await store.movePin(moved, to: index) }
            return true
          }
          if let row = item.removingPrefix("agent:") {
            // A row onto a tile: pinned, in that tile's place; its section unchanged.
            Task {
              await store.setPinned(row, true)
              await store.movePin(row, to: index)
            }
            return true
          }
          return false
        } isTargeted: { over in
          let next = over ? agent.id : (target == agent.id ? nil : target)
          if next != target { target = next }
        }
        .opacity(target == agent.id ? 0.55 : 1)
        .accessibilityLabel(RowStatus(agent: agent).label.map { "\(agent.name), \($0)" } ?? agent.name)
        .accessibilityAddTraits(.isButton)
      }
    }
    .padding(.vertical, 4)
    // A row dropped on the grid's space: pinned, last.
    .dropDestination(for: String.self) { items, _ in
      guard let row = items.first?.removingPrefix("agent:") else { return false }
      Task { await store.setPinned(row, true) }
      return true
    }
  }

  private func click(_ id: String) {
    let flags = NSApp.currentEvent?.modifierFlags ?? []
    if flags.contains(.command) { navigation.selection.toggle(id); return }
    if flags.contains(.shift) { navigation.selection.extend(to: id, order: navigation.order(store)); return }
    navigation.selection.plain(id)
    if navigation.newChat.isOpen { navigation.newChat.close() }
    navigation.selected = id
  }
}

/**
 * The card a pinned tile or a rail butterfly shows on hover (`ndn`): after
 * 0.3 s, gone 0.1 s after the pointer leaves; the butterfly and its dot,
 * the name, the title, a pin when pinned, the time, and one line: what it
 * waits on you for, your draft, its last message, or "No messages yet".
 */
struct MacHoverCard: ViewModifier {
  let agent: Agent
  let pinned: Bool
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @State private var shown = false
  @State private var hovering = false

  func body(content: Content) -> some View {
    content
      .onHover { inside in
        hovering = inside
        Task {
          try? await Task.sleep(nanoseconds: inside ? 300_000_000 : 100_000_000)
          if hovering == inside { shown = inside }
        }
      }
      .popover(isPresented: $shown, arrowEdge: .trailing) { card.frame(width: 260).frame(maxHeight: 300) }
  }

  private var card: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 20, height: 20)
          .overlay(alignment: .bottomTrailing) {
            if let dot = RowStatus(agent: agent).marker { StatusDot(colour: dot, size: 6).offset(x: 1, y: 1) }
          }
        Text(agent.name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
        if !agent.isGroup, !agent.title.trimmingCharacters(in: .whitespaces).isEmpty {
          Text(agent.title.trimmingCharacters(in: .whitespaces)).font(.system(size: 11)).foregroundStyle(Ink.title).lineLimit(1)
        }
        Spacer(minLength: 4)
        if pinned { Image(systemName: "pin.fill").font(.system(size: 10)).foregroundStyle(.secondary).accessibilityLabel("Pinned") }
        if let at = agent.lastActivityAt, at > 0 {
          Text(Chat.listTime(Date(timeIntervalSince1970: at / 1000))).font(.system(size: 11)).foregroundStyle(.secondary)
        }
      }
      preview.font(.system(size: 12)).lineLimit(2)
    }
    .padding(10)
    .accessibilityLabel("\(agent.name) chat preview")
  }

  @ViewBuilder
  private var preview: some View {
    let isOpen = navigation.selected == agent.id
    if agent.awaitingUserResponse, let reason = agent.waitingReason, !reason.isEmpty {
      Text("Waiting for you: \(reason)").foregroundStyle(Ink.attention)
    } else if !isOpen, let draft = store.drafts[agent.id], !draft.isEmpty {
      (Text("Draft: ").fontWeight(.semibold) + Text(draft)).foregroundStyle(.secondary)
    } else if agent.lastEntry != nil || agent.lastMessagePreview != nil {
      Text(agent.previewLine).foregroundStyle(.secondary)
    } else {
      Text("No messages yet").foregroundStyle(.tertiary)
    }
  }
}

/**
 * A row's right-click menu (`fcn`), in the shipped window's groups: Pin or
 * Unpin, Move to (not for a pinned one), Mark as Read or Unread | Edit
 * Profile, Duplicate (an agent's own) | Copy conversation ID | Hide from
 * sidebar, Delete. On a row picked with others, Move and Delete take them
 * all ("Move 3 agents to", "Delete 3 agents").
 */
struct MacAgentMenu: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let isPinned = store.pinnedIds.contains(agent.id)
    let targets = navigation.selection.targets(for: agent.id)
    let batch = targets.count
    let movable = batch > 1 ? targets.filter { !store.pinnedIds.contains($0) } : [agent.id]
    Button { Task { await store.setPinned(agent.id, !isPinned) } } label: {
      Label(isPinned ? "Unpin" : "Pin", systemImage: isPinned ? "pin.slash" : "pin")
    }
    if !isPinned && store.sidebarSections != nil {
      MacMoveItems(ids: movable, current: SidebarSections.sectionId(of: agent.id, in: store.sidebarSections ?? []), list: false)
    }
    Button { Task { await store.setUnread(agent.id, !agent.hasUnread) } } label: {
      Label(agent.hasUnread ? "Mark as Read" : "Mark as Unread", systemImage: agent.hasUnread ? "bell" : "bell.badge")
    }
    Divider()
    Button { navigation.openPane(.profile, agent: agent.id) } label: { Label("Edit Profile", systemImage: "pencil") }
    if !agent.isGroup && !agent.isRemoteRoom {
      Button { Task { if let copy = await store.duplicate(agent.id) { navigation.selected = copy } } } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
    }
    Divider()
    Button { UIPasteboard.general.string = agent.id } label: { Label("Copy conversation ID", systemImage: "doc.on.doc") }
    Divider()
    Button { Task { await store.setHidden(agent.id, true) } } label: { Label("Hide from sidebar", systemImage: "eye.slash") }
    Button(role: .destructive) { navigation.askToDelete(targets, store: store) } label: { Label(AgentDeletion.menuLabel(count: batch), systemImage: "trash") }
  }
}

/**
 * Move to (`rcn`, `zct`): with no sections yet, one item that makes the
 * first ("Move to new section"); else a submenu of the sections, the one it
 * is in checked and "Unassigned" last, then New section. The selection
 * header's Move menu lists the same, none checked.
 */
struct MacMoveItems: View {
  let ids: [String]
  let current: String?
  /** The header's menu (its items at the top level) rather than the row's submenu. */
  let list: Bool
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    let sections = store.sidebarSections ?? []
    if sections.isEmpty {
      Button { newSection() } label: { Label(SidebarSections.newSectionLabel(inList: false, count: ids.count), systemImage: "folder.badge.plus") }
    } else if list {
      items(sections)
    } else {
      Menu {
        items(sections)
      } label: {
        Label(SidebarSections.moveLabel(count: ids.count), systemImage: "folder")
      }
    }
  }

  @ViewBuilder
  private func items(_ sections: [SidebarSection]) -> some View {
    ForEach(sections, id: \.id) { section in
      Button { store.editSections { SidebarSections.assign($0, agentIds: ids, to: section.id) } } label: {
        Label(section.isUnassigned ? SidebarSections.unassignedName : section.name, systemImage: current == section.id ? "checkmark" : "folder")
      }
    }
    Divider()
    Button { newSection() } label: { Label(SidebarSections.newSectionLabel(inList: true, count: ids.count), systemImage: "folder.badge.plus") }
  }

  /** A new section at the top with these agents in it, its name open to change at once. */
  private func newSection() {
    if let id = store.createSection(with: ids) { navigation.renamingSection = id }
  }
}

/**
 * The sidebar's foot (`Rct`, and the patch's look): the account as a 32 pt
 * disc, its picture or letters, which opens the account menu (`Xln`):
 * "Weekly usage" with its share and, inside, when it resets and "Change
 * limit"; Settings; About; "Log out", which asks "Sign out?" first. Beside
 * it, "Connect apps" with three tilted app tiles (the patch's
 * `connect-apps-button`).
 */
struct MacAccountBar: View {
  @Environment(AppStore.self) private var store
  @Environment(SessionController.self) private var session
  @Environment(\.openSettings) private var openSettings
  @Environment(\.openWindow) private var openWindow
  @Environment(\.openURL) private var openURL
  @State private var asksSignOut = false

  /** "Change limit" (`Yln`, patched to the web app). */
  static let changeLimit = URL(string: "https://app.simeonlabs.com/app")!

  var body: some View {
    HStack(spacing: 10) {
      Menu {
        if let summary = store.usage.summary, let percent = summary.usagePercent {
          let share = UsageMeters.percent(percent)
          Menu {
            Section {
              Button {} label: {
                Text("Weekly usage  \(share)")
                if let reset = resets(summary) { Text(reset) }
              }
              .disabled(true)
            }
            if let spend = summary.onDemand {
              Section {
                Button {} label: {
                  Text("On-demand  \(UsageMeters.compactMoney(spend.usedCents))/\(UsageMeters.compactMoney(spend.limitCents ?? 0))")
                  Text("Spend this cycle")
                }
                .disabled(true)
              }
            }
            Section {
              Button("Change limit") { openURL(Self.changeLimit) }
            }
          } label: {
            Label("Weekly usage  \(share)", systemImage: "gauge.with.dots.needle.33percent")
          }
        }
        Button { openSettings() } label: { Label("Settings", systemImage: "gearshape") }
        Button { openWindow(id: "about") } label: { Label("About", systemImage: "info.circle") }
        Divider()
        Button { asksSignOut = true } label: { Label("Log out", systemImage: "rectangle.portrait.and.arrow.right") }
      } label: {
        MacAccountDisc(size: 32)
      }
      .menuStyle(.button)
      .buttonStyle(.plain)
      .menuIndicator(.hidden)
      .fixedSize()
      .accessibilityLabel("Open account menu")
      // The week's reading, as the menu opens on it (read again only after 30 s).
      .task { await store.loadUsage() }
      .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in Task { await store.loadUsage() } }
      MacConnectAppsButton()
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .alert("Sign out?", isPresented: $asksSignOut) {
      Button("Cancel", role: .cancel) {}
      Button("Sign out", role: .destructive) { Task { await session.signOut() } }
    } message: {
      Text("You’ll need to sign in again to use Simeon.")
    }
  }

  /** "Resets in 3 days" (`Dct`): from when it was read; "Resets in 7 days" for a plan with no end given. */
  private func resets(_ summary: UsageSummary) -> String? {
    let read = (store.usageReadAt ?? Date()).timeIntervalSince1970 * 1000
    return UsageMeters.countdown(summary.resetMs, now: read, verb: "Resets") ?? (summary.hasNonZeroIncludedLimit ? "Resets in 7 days" : nil)
  }
}

/** The account's disc: its picture, else its letters on the glass, else a person. */
struct MacAccountDisc: View {
  let size: CGFloat
  @Environment(AppStore.self) private var store

  var body: some View {
    ZStack {
      Circle().fill(.regularMaterial)
      Circle().strokeBorder(.separator, lineWidth: 0.5)
      if let picture = store.account?.pictureURL {
        AsyncImage(url: picture) { image in image.resizable().scaledToFill() } placeholder: { letters }
          .clipShape(Circle())
      } else {
        letters
      }
    }
    .frame(width: size, height: size)
    .contentShape(Circle())
  }

  @ViewBuilder
  private var letters: some View {
    if let account = store.account {
      Text(account.initials).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
    } else {
      Image(systemName: "person.fill").font(.system(size: 13)).foregroundStyle(.secondary)
    }
  }
}

/** "Connect apps" (the patch's sidebar button): Gmail, Calendar and Drive tilted, then the words, in the blue of the person's bubbles. */
struct MacConnectAppsButton: View {
  @Environment(\.openWindow) private var openWindow
  @Environment(\.colorScheme) private var scheme
  @State private var hovering = false

  var body: some View {
    Button { openWindow(id: "connect-apps") } label: {
      HStack(spacing: 10) {
        Text("Connect apps").font(.system(size: 15, weight: .medium)).lineLimit(1)
        HStack(spacing: -4) {
          tile("Gmail").rotationEffect(.degrees(-7))
          tile("Google Calendar")
          tile("Google Drive").rotationEffect(.degrees(7))
        }
        .accessibilityHidden(true)
      }
      .foregroundStyle(hovering ? Color.dynamic(light: "#1b4a7d", dark: "#a9ccf0") : Color.dynamic(light: "#255a93", dark: "#8cb8e8"))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .help("Connect apps")
  }

  private func tile(_ name: String) -> some View {
    ConnectorTile(name: name, size: 26)
      .shadow(color: .black.opacity(scheme == .dark ? 0.45 : 0.1), radius: 1, y: 1)
  }
}

/**
 * About (`PVn`): the icon, "Simeon", its version, the copyright, and "Copy
 * version info" ("Copied"), which copies the version, the release track
 * and the system.
 */
struct MacAbout: View {
  @State private var copied = false

  var body: some View {
    VStack(spacing: 14) {
      Image(nsImage: NSApplication.shared.applicationIconImage).resizable().frame(width: 64, height: 64)
      VStack(spacing: 4) {
        Text("Simeon").font(.system(size: 20, weight: .semibold))
        Text("Version \(SessionController.clientVersion)").font(.system(size: 13)).foregroundStyle(.secondary)
      }
      Text("Copyright © 2026 SimeonLabs, Inc.").font(.system(size: 11)).foregroundStyle(.tertiary)
      Button(copied ? "Copied" : "Copy version info") {
        UIPasteboard.general.string = ["Version: \(SessionController.clientVersion)", "Release Track: stable", "OS: darwin"].joined(separator: "\n")
        copied = true
        Task { try? await Task.sleep(nanoseconds: 2_000_000_000); copied = false }
      }
    }
    .padding(24)
    .frame(width: 360)
  }
}

/**
 * Hidden Agents (the window's dialog, 520 wide): they stay active and keep
 * their history; each opens from here or comes back with Unhide. "No hidden
 * bots" once none are left.
 */
struct MacHiddenAgents: View {
  let open: (String) -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text("Hidden Agents").font(.system(size: 15, weight: .semibold))
        Spacer()
        Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)) }
          .buttonStyle(.borderless)
          .keyboardShortcut(.cancelAction)
          .accessibilityLabel("Close")
      }
      Text("Hidden Agents stay active and keep their history, they just don't show in the sidebar.")
        .font(.system(size: 13)).foregroundStyle(.secondary)
      if store.hiddenAgents.isEmpty {
        VStack(spacing: 8) {
          Image(systemName: "eye.slash").font(.system(size: 28)).foregroundStyle(.tertiary)
          Text("No hidden bots").font(.system(size: 13)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
      } else {
        List(store.hiddenAgents) { agent in
          HStack(spacing: 10) {
            Button { open(agent.id) } label: {
              HStack(spacing: 10) {
                AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 24, height: 24)
                Text(agent.name).font(.system(size: 13)).lineLimit(1)
                Spacer(minLength: 0)
              }
              .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Button("Unhide") { Task { await store.setHidden(agent.id, false) } }
              .controlSize(.small)
          }
        }
        .listStyle(.inset)
        .frame(minHeight: 200)
      }
    }
    .padding(20)
    .frame(width: 520)
  }
}
