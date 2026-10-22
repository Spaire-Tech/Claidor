import SwiftUI
import SimeonCore

/**
 * The Mac sidebar's sections on the phone (the founder, 11 October 2026:
 * "section is not present in the mobile app. please bring it"): the host's
 * `sidebarSections`, the same ones the Mac shows and edits. Each is a
 * header over its chats; a tap folds or opens it (its count shows while
 * folded), a long press has Rename, Move Up, Move Down and Delete. A
 * chat's own menu has Move to (its section ticked) and New Section; with no
 * section yet, Move to New Section. "Unassigned" holds the rest, last, with
 * no menu. Folded sections are kept between launches. Sizes are the Mac's
 * times the phone's 1.2 (`PHONE_ROW_ZOOM`).
 */
@MainActor
@Observable
final class ListSections {
  var folded: Set<String> = Set(UserDefaults.standard.stringArray(forKey: ListSections.foldedKey) ?? []) {
    didSet { UserDefaults.standard.set(folded.sorted(), forKey: Self.foldedKey) }
  }
  /** The section whose name is being typed: a new one, or Rename. */
  var renaming: SidebarSection?
  var isNew = false
  var name = ""
  /** The section Delete asks about. */
  var deleting: SidebarSection?

  /** The Mac's key: what is folded on the Mac stays the Mac's, on its own machine. */
  static let foldedKey = "simeon.sidebar.foldedSections"

  func fold(_ id: String) {
    withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { folded.formSymmetricDifference([id]) }
  }

  /** Into a section ("Unassigned" takes them out of every section). */
  func move(_ ids: [String], to sectionId: String, store: AppStore) {
    store.editSections { SidebarSections.assign($0, agentIds: ids, to: sectionId) }
    folded.remove(sectionId)
    Haptics.tap()
  }

  /** A new section at the top holding these agents, its name asked for at once. */
  func newSection(with ids: [String], store: AppStore) {
    guard let id = store.createSection(with: ids) else { return }
    folded.remove(id)
    isNew = true
    name = ""
    renaming = SidebarSection(id: id, name: SidebarSections.newName, agentIds: ids)
  }

  func beginRename(_ section: SidebarSections.Shown) {
    isNew = false
    name = section.name
    renaming = SidebarSection(id: section.id, name: section.name, agentIds: [])
  }

  /** The typed name kept; left empty, a new section keeps "New section" and a renamed one its old name. */
  func finishRename(store: AppStore) {
    guard let section = renaming else { return }
    renaming = nil
    let kept = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !kept.isEmpty else { return }
    store.editSections { SidebarSections.rename($0, id: section.id, to: kept) }
  }

  /** The person's sections in order, "Unassigned" left out: what Move Up and Move Down step through. */
  private func own(_ store: AppStore) -> [SidebarSection] { (store.sidebarSections ?? []).filter { !$0.isUnassigned } }

  func canMove(_ id: String, up: Bool, store: AppStore) -> Bool {
    let own = own(store)
    guard let index = own.firstIndex(where: { $0.id == id }) else { return false }
    return up ? index > 0 : index < own.count - 1
  }

  func moveSection(_ id: String, up: Bool, store: AppStore) {
    let own = own(store)
    guard let index = own.firstIndex(where: { $0.id == id }), own.indices.contains(up ? index - 1 : index + 1) else { return }
    store.editSections { SidebarSections.move($0, id: id, to: own[up ? index - 1 : index + 1].id, before: up) }
  }

  func delete(store: AppStore) {
    guard let section = deleting else { return }
    deleting = nil
    store.editSections { SidebarSections.remove($0, id: section.id) }
  }
}

/** A section's header in the list: its name (the Mac's 12 at 60%, here 14.4), the count while folded, the chevron turning as it opens. */
struct SectionHeaderRow: View {
  let section: SidebarSections.Shown
  let fold: () -> Void

  var body: some View {
    Button(action: fold) {
      HStack(spacing: 8) {
        Text(section.name)
          .font(.system(size: 14.4))
          .foregroundStyle(Ink.secondary)
          .lineLimit(1)
          .truncationMode(.tail)
        Spacer(minLength: 8)
        if section.isCollapsed {
          Text("\(section.agents.count)")
            .font(.system(size: 14.4))
            .monospacedDigit()
            .foregroundStyle(Ink.secondary)
        }
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(Ink.tertiary)
          .rotationEffect(.degrees(section.isCollapsed ? 0 : 90))
      }
      .frame(minHeight: 30)
      .contentShape(.rect)
    }
    .buttonStyle(.tactile)
    .accessibilityLabel(section.name)
    .accessibilityValue(section.isCollapsed ? String(localized: "Folded, \(section.agents.count) agents") : String(localized: "section.open", defaultValue: "Open"))
    .accessibilityHint(section.isCollapsed ? "Opens the section" : "Folds the section")
  }
}

/** A long press on a section's header: Rename, Move Up and Move Down (greyed at the ends), Delete in red. */
struct SectionHeaderMenu: View {
  let section: SidebarSections.Shown
  let sections: ListSections
  @Environment(AppStore.self) private var store

  var body: some View {
    Button { sections.beginRename(section) } label: { Label("Rename", systemImage: "pencil") }
    Button { sections.moveSection(section.id, up: true, store: store) } label: { Label("Move Up", systemImage: "arrow.up") }
      .disabled(!sections.canMove(section.id, up: true, store: store))
    Button { sections.moveSection(section.id, up: false, store: store) } label: { Label("Move Down", systemImage: "arrow.down") }
      .disabled(!sections.canMove(section.id, up: false, store: store))
    Button(role: .destructive) {
      sections.deleting = SidebarSection(id: section.id, name: section.name, agentIds: [])
    } label: { Label("Delete", systemImage: "trash") }
  }
}

/** Move to in a chat's menu: the sections, its own ticked, then New Section; with none yet, Move to New Section. A pinned chat is not moved. */
struct MoveToSectionMenu: View {
  let agentId: String
  let sections: ListSections
  @Environment(AppStore.self) private var store

  var body: some View {
    if let list = store.sidebarSections {
      if list.isEmpty {
        Button { sections.newSection(with: [agentId], store: store) } label: {
          Label("Move to New Section", systemImage: "folder.badge.plus")
        }
      } else {
        let own = SidebarSections.sectionId(of: agentId, in: list)
        Menu {
          ForEach(list, id: \.id) { section in
            Button { sections.move([agentId], to: section.id, store: store) } label: {
              Label(section.name, systemImage: section.id == own ? "checkmark" : "folder")
            }
          }
          Divider()
          Button { sections.newSection(with: [agentId], store: store) } label: {
            Label("New Section", systemImage: "folder.badge.plus")
          }
        } label: {
          Label("Move to", systemImage: "folder")
        }
      }
    }
  }
}

/** The dialogs a section asks with: its name (new, or Rename), and Delete's confirmation, in the Mac's words. */
struct SectionDialogs: ViewModifier {
  @Bindable var sections: ListSections
  @Environment(AppStore.self) private var store

  func body(content: Content) -> some View {
    content
      .alert(sections.isNew ? "New Section" : "Rename Section", isPresented: Binding(get: { sections.renaming != nil }, set: { if !$0 { sections.renaming = nil } })) {
        TextField(SidebarSections.newName, text: $sections.name)
        Button("Cancel", role: .cancel) { sections.renaming = nil }
        Button("Save") { sections.finishRename(store: store) }
      } message: {
        Text(sections.isNew ? String(localized: "Name the section. Its chats stay in it on your Mac too.") : "")
      }
      .alert(sections.deleting.map { SidebarSections.deleteTitle(name: $0.name) } ?? "", isPresented: Binding(get: { sections.deleting != nil }, set: { if !$0 { sections.deleting = nil } })) {
        Button("Cancel", role: .cancel) { sections.deleting = nil }
        Button("Delete", role: .destructive) { sections.delete(store: store) }
      } message: {
        Text(SidebarSections.deleteMessage)
      }
  }
}

/**
 * Several chats at once, the Mac's picked rows (`SelectionBar`, C11) as the
 * phone has them: Select Chats in the list's menu puts a circle on each
 * row, a tap picks it; at the bottom Move (the sections and New Section)
 * and Delete act on all of them ("Delete 2 agents"), and Done at the top
 * ends it. Pinned chats stay with the pins and are not picked.
 */
struct SelectionBar: View {
  let picked: Set<String>
  let sections: ListSections
  let delete: () -> Void
  let done: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    let ids = Array(picked)
    HStack(spacing: 10) {
      if let list = store.sidebarSections {
        Menu {
          if list.isEmpty {
            Button { sections.newSection(with: ids, store: store); done() } label: {
              Label(ids.count > 1 ? "Move \(ids.count) Agents to New Section" : "Move to New Section", systemImage: "folder.badge.plus")
            }
          } else {
            ForEach(list, id: \.id) { section in
              Button { sections.move(ids, to: section.id, store: store); done() } label: { Label(section.name, systemImage: "folder") }
            }
            Divider()
            Button { sections.newSection(with: ids, store: store); done() } label: { Label("New Section", systemImage: "folder.badge.plus") }
          }
        } label: {
          Image(systemName: "folder").font(.system(size: 19, weight: .medium)).foregroundStyle(Ink.primary)
            .frame(width: 48, height: 48)
            .contentShape(.circle)
            .glassEffect(.regular, in: .circle)
        }
        .disabled(ids.isEmpty)
        .accessibilityLabel(SidebarSections.moveLabel(count: ids.count))
      }
      Text(ids.isEmpty ? "Select Chats" : "\(ids.count) Selected")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Ink.primary)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .glassEffect(.regular, in: .capsule)
      Button(action: delete) {
        Image(systemName: "trash").font(.system(size: 19, weight: .medium)).foregroundStyle(ids.isEmpty ? Ink.tertiary : Ink.danger)
          .frame(width: 48, height: 48)
          .contentShape(.circle)
          .glassEffect(.regular, in: .circle)
      }
      .buttonStyle(.tactile)
      .disabled(ids.isEmpty)
      .accessibilityLabel(AgentDeletion.menuLabel(count: ids.count))
    }
    .padding(.horizontal, 16)
    .padding(.top, 6)
    .padding(.bottom, 4)
  }
}
