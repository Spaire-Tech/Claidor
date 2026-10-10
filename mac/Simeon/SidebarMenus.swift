import AppKit
import SwiftUI
import SimeonCore

// MARK: A row's menu

/**
 * A row's right-click menu (`Agent actions`, reference C02), as a Mac menu:
 * Pin or Unpin; Move to (the sections, the agent's own ticked, then New
 * section), or Move to new section while there are no sections; Mark as
 * Unread or Mark as Read. Then Edit Profile and Duplicate;
 * Copy conversation ID; Hide from sidebar and Delete, in red. With several
 * rows picked and this one among them (C11), Move and Delete act on them
 * all ("Move 2 agents to new section", "Delete 2 agents"); the rest act on
 * this row. A pin is not moved into sections. A group, or a chat shared
 * from another account, has no Duplicate (C05).
 */
struct RowMenu: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(SidebarState.self) private var sidebar
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout

  var body: some View {
    let targets = sidebar.selection.targets(for: agent.id)
    let pins = Set(store.pinnedIds)
    let pinned = pins.contains(agent.id)
    // Pinned rows stay where they are: only the rest move into sections.
    let movable = targets.filter { !pins.contains($0) }
    Section {
      Button(pinned ? "Unpin" : "Pin", systemImage: pinned ? "pin.slash" : "pin") {
        SidebarActions.pin(agent.id, !pinned, store: store)
      }
      if !pinned, let sections = store.sidebarSections {
        if sections.isEmpty {
          Button(SidebarSections.newSectionLabel(inList: false, count: movable.count), systemImage: "folder.badge.plus") {
            SidebarActions.newSection(with: movable, store: store, sidebar: sidebar)
          }
        } else {
          let own = SidebarSections.sectionId(of: agent.id, in: sections)
          Menu {
            ForEach(sections, id: \.id) { section in
              Button(section.name, systemImage: movable.count == 1 && section.id == own ? "checkmark" : "folder") {
                SidebarActions.move(movable, to: section.id, store: store, sidebar: sidebar)
              }
            }
            Divider()
            Button(SidebarSections.newSectionLabel(inList: true, count: movable.count), systemImage: "folder.badge.plus") {
              SidebarActions.newSection(with: movable, store: store, sidebar: sidebar)
            }
          } label: {
            Label(SidebarSections.moveLabel(count: movable.count), systemImage: "folder")
          }
        }
      }
      Button(agent.hasUnread ? "Mark as Read" : "Mark as Unread", systemImage: agent.hasUnread ? "bell" : "bell.badge") {
        SidebarActions.unread(agent.id, !agent.hasUnread, store: store)
      }
    }
    Section {
      // The agent's pane on its Profile (`openProfile`), that agent opening if it is not the open one.
      Button("Edit Profile", systemImage: "pencil") {
        pane.open(.profile, for: agent.id, window: window, store: store, layout: layout)
      }
      if !agent.isGroup && !agent.isRemoteRoom {
        Button("Duplicate", systemImage: "plus.square.on.square") {
          SidebarActions.duplicate(agent.id, store: store, window: window)
        }
      }
    }
    Section {
      Button("Copy conversation ID", systemImage: "doc.on.doc") {
        SidebarActions.copyId(agent.id)
      }
    }
    Section {
      Button("Hide from sidebar", systemImage: "eye.slash") {
        SidebarActions.hide(agent.id, store: store, sidebar: sidebar)
      }
      Button(AgentDeletion.menuLabel(count: targets.count), systemImage: "trash", role: .destructive) {
        SidebarActions.confirmDelete(targets, store: store, sidebar: sidebar)
      }
    }
  }
}

// MARK: A section's menu

/** A section's right-click menu (`Section actions`, C08): Rename, Move up, Move down (greyed at the ends), then Delete in red. */
struct SectionMenu: View {
  let id: String
  let name: String
  @Environment(AppStore.self) private var store
  @Environment(SidebarState.self) private var sidebar

  var body: some View {
    Section {
      Button("Rename", systemImage: "pencil") { sidebar.renamingSection = id }
      Button("Move up", systemImage: "arrow.up") { SidebarActions.moveSection(id, up: true, store: store) }
        .disabled(!SidebarActions.canMove(id, up: true, store: store))
      Button("Move down", systemImage: "arrow.down") { SidebarActions.moveSection(id, up: false, store: store) }
        .disabled(!SidebarActions.canMove(id, up: false, store: store))
    }
    Section {
      Button("Delete", systemImage: "trash", role: .destructive) {
        SidebarActions.confirmDeleteSection(id, name: name, store: store)
      }
    }
  }
}

// MARK: Picked rows

/**
 * The head while rows are picked (`sidebar__selection-actions`, C11): 44
 * high, at its right three 24-point buttons 2 apart (the icon 14 at 60%,
 * 6 round): Move to a section (a menu of the sections and New section,
 * when any picked row can move), Delete and Clear selection. On the rail,
 * Delete and Clear stand under the head.
 */
struct SelectionBar: View {
  let rail: Bool
  @Environment(AppStore.self) private var store
  @Environment(SidebarState.self) private var sidebar

  var body: some View {
    let picked = Array(sidebar.selection.ids)
    let pins = Set(store.pinnedIds)
    let movable = picked.filter { !pins.contains($0) }
    let count = picked.count
    let layout = rail ? AnyLayout(VStackLayout(spacing: 2)) : AnyLayout(HStackLayout(spacing: 2))
    layout {
      if !rail, let sections = store.sidebarSections, !movable.isEmpty {
        Menu {
          ForEach(sections, id: \.id) { section in
            Button(section.name, systemImage: "folder") {
              SidebarActions.move(movable, to: section.id, store: store, sidebar: sidebar)
            }
          }
          if !sections.isEmpty { Divider() }
          Button(SidebarSections.newSectionLabel(inList: !sections.isEmpty, count: movable.count), systemImage: "folder.badge.plus") {
            SidebarActions.newSection(with: movable, store: store, sidebar: sidebar)
          }
        } label: {
          BarIcon(symbol: "folder")
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Move \(movable.count) selected agents to section")
        .accessibilityLabel("Move \(movable.count) selected agents to section")
      }
      PickedButton(symbol: "trash", label: "Delete \(count) selected agents") {
        SidebarActions.confirmDelete(picked, store: store, sidebar: sidebar)
      }
      PickedButton(symbol: "xmark", label: "Clear selection") {
        sidebar.selection.clear()
      }
    }
  }
}

/** One of the picked rows' buttons: 24 square, 6 round, grey under the pointer. */
private struct PickedButton: View {
  let symbol: String
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) { BarIcon(symbol: symbol) }
      .buttonStyle(.plain)
      .help(label)
      .accessibilityLabel(label)
  }
}

private struct BarIcon: View {
  let symbol: String
  @State private var hovering = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    Image(systemName: symbol)
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(look.inkSecondary)
      .frame(width: 24, height: 24)
      .background(hovering ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
      .contentShape(RoundedRectangle(cornerRadius: 6))
      .onHover { hovering = $0 }
  }
}

// MARK: Hidden Agents

/**
 * Hidden Agents (`chats-dialog`, C14): 520 by 440, its title (14 on 20,
 * 500) and the line under it (14 on 20, 60%) padded 12 10 12 16, Close at
 * the right; then each hidden agent in a 36-high row (its butterfly 24,
 * its name 13 on 18, Unhide at the right in 13 at 60%), grey under the
 * pointer, 2 apart. A row opens its agent; Unhide puts it back in the
 * sidebar. With none: "No hidden bots".
 */
struct HiddenAgentsSheet: View {
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    let hidden = store.hiddenAgents
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Hidden Agents")
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(look.ink)
            .frame(height: 20)
          Text("Hidden Agents stay active and keep their history, they just don't show in the sidebar.")
            .font(.system(size: 14))
            .lineSpacing(3)
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Button { dismiss() } label: {
          Image(systemName: "xmark")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(look.inkTertiary)
            .frame(width: 32, height: 32)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(.cancelAction)
        .help("Close")
        .accessibilityLabel("Close")
      }
      .padding(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 10))
      if hidden.isEmpty {
        VStack(spacing: 8) {
          Image(systemName: "eye.slash")
            .font(.system(size: 20))
            .foregroundStyle(look.inkTertiary)
          Text("No hidden bots")
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        ScrollView {
          LazyVStack(spacing: 2) {
            ForEach(hidden) { agent in
              HiddenRow(agent: agent, agents: store.agents, look: look) {
                dismiss()
                window.choose(agent.id, store: store)
              } unhide: {
                SidebarActions.unhide(agent.id, store: store)
              }
            }
          }
          .padding(.top, 16)
        }
        .padding(.horizontal, 16)
      }
    }
    .frame(width: 520, height: 440)
    .background(look.elevated)
  }
}

private struct HiddenRow: View {
  let agent: Agent
  let agents: [Agent]
  let look: Look
  let open: () -> Void
  let unhide: () -> Void
  @State private var hovering = false
  @State private var unhideHover = false

  var body: some View {
    HStack(spacing: 8) {
      Button(action: open) {
        HStack(spacing: 8) {
          AgentMark(agent: agent, agents: agents, size: 24)
          Text(agent.name)
            .font(.system(size: 13))
            .tracking(-0.08)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 0))
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Button(action: unhide) {
        Text("Unhide")
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
          .padding(.vertical, 4)
          .padding(.horizontal, 6)
          .background(unhideHover ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
          .contentShape(RoundedRectangle(cornerRadius: 6))
      }
      .buttonStyle(.plain)
      .onHover { unhideHover = $0 }
      .padding(.trailing, 8)
    }
    .frame(height: 36)
    .background(hovering ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 8))
    .onHover { hovering = $0 }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(agent.name)
  }
}
