import AppKit
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

/**
 * What the sidebar holds besides the agents (step 3): the rows picked with
 * ⌘ and ⇧, the row or section being renamed, the folded sections (kept
 * between launches), the Hidden Agents dialog, Control-Tab's walk and what
 * is being dragged.
 */
@MainActor
@Observable
final class SidebarState {
  var selection = SidebarSelection()
  var renamingAgent: String?
  var renamingSection: String?
  var folded: Set<String> = Set(UserDefaults.standard.stringArray(forKey: SidebarState.foldedKey) ?? []) {
    didSet { UserDefaults.standard.set(folded.sorted(), forKey: Self.foldedKey) }
  }
  var showsHidden = false
  /** Control-Tab: the row it would open on letting go of Control, and the order it walks, as it was at the first press (`h0n`). */
  var cycle: Cycle?
  /** A row, a pin or a section on its way somewhere; nil once the mouse is let go. */
  var dragging: Dragged?

  struct Cycle: Equatable {
    let next: String
    let order: [String]
  }

  enum Dragged: Equatable {
    case agent(String)
    case pin(String)
    case section(String)
  }

  private static let foldedKey = "simeon.sidebar.foldedSections"
  /** A section folding and opening: 0.2 s on the window's curve. */
  static let foldMotion = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.2)

  func fold(_ id: String) {
    withAnimation(Self.foldMotion) {
      if folded.contains(id) { folded.remove(id) } else { folded.insert(id) }
    }
  }

  /** The sidebar's order (⇧-click, Control-Tab): the pins, then the list or the open sections' agents (`Ict`). */
  func order(_ store: AppStore) -> [String] {
    SidebarSections.order(agents: store.agents.filter { !$0.isHidden }, pinnedIds: store.pinnedIds, sections: store.sidebarSections ?? [], collapsed: folded)
  }

  /**
   * One press of Control-Tab (1) or Control-Shift-Tab (-1): the next row
   * after the open one, or after the row it is on, wrapping round; with
   * nothing open, the first (or the last). Nothing with fewer than two rows.
   */
  func step(_ direction: Int, order: [String], current: String?) {
    let walk = cycle?.order ?? order
    guard walk.count > 1 else {
      cycle = nil
      return
    }
    let from = cycle?.next ?? current
    let index = from.flatMap { walk.firstIndex(of: $0) }
    let next = index.map { ($0 + direction + walk.count) % walk.count } ?? (direction == 1 ? 0 : walk.count - 1)
    cycle = Cycle(next: walk[next], order: walk)
  }

  /**
   * A row clicked: with ⌘ it is picked or let go, with ⇧ every row from the
   * last one clicked is picked; a plain click lets the picked rows go and
   * opens the agent. Picking takes the keys from the message field, as the
   * Electron window's row takes the focus, so Delete and Escape reach the
   * sidebar.
   */
  func click(_ id: String, store: AppStore, window: WindowState) {
    let mods = NSEvent.modifierFlags.intersection([.command, .shift])
    if mods.contains(.command) {
      selection.toggle(id)
      NSApp.keyWindow?.makeFirstResponder(nil)
    } else if mods.contains(.shift) {
      selection.extend(to: id, order: order(store))
      NSApp.keyWindow?.makeFirstResponder(nil)
    } else {
      selection.plain(id)
      window.open(id, store: store)
    }
  }

  /** A drag begins; it is over when no mouse button is held (a drag let go anywhere, or called off). */
  func begin(_ drag: Dragged) {
    dragging = drag
    Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(150))
      while NSEvent.pressedMouseButtons != 0 {
        try? await Task.sleep(for: .milliseconds(100))
      }
      if self?.dragging == drag { self?.dragging = nil }
    }
  }
}

/** The kind a sidebar drag carries: the app's own, so a drop on the message field never types it. */
extension UTType {
  static let sidebarItem = UTType(exportedAs: "com.simeonlabs.simeon.mac.sidebar-item", conformingTo: .data)
}

extension NSItemProvider {
  /** A sidebar drag's item: the dragged id, in the sidebar's own kind. */
  static func sidebarItem(_ id: String) -> NSItemProvider {
    let provider = NSItemProvider()
    provider.registerDataRepresentation(forTypeIdentifier: UTType.sidebarItem.identifier, visibility: .ownProcess) { done in
      done(Data(id.utf8), nil)
      return nil
    }
    return provider
  }
}

// MARK: What the menus do

/**
 * The sidebar's actions (`sidebar.tsx`), each shown at once and written to
 * the person's computer: pin, read and unread, hide, move to a section,
 * duplicate, copy the id, delete with its confirmation, and the sections'
 * own (rename, move up and down, delete).
 */
@MainActor
enum SidebarActions {
  static func pin(_ id: String, _ pinned: Bool, store: AppStore) {
    Task { await store.setPinned(id, pinned) }
  }

  static func unread(_ id: String, _ unread: Bool, store: AppStore) {
    Task { await store.setUnread(id, unread) }
  }

  static func hide(_ id: String, store: AppStore, sidebar: SidebarState) {
    sidebar.selection.clear()
    Task { await store.setHidden(id, true) }
  }

  static func unhide(_ id: String, store: AppStore) {
    Task { await store.setHidden(id, false) }
  }

  /** Into a section ("Unassigned" takes them out of every section); the picked rows let go. */
  static func move(_ ids: [String], to sectionId: String, store: AppStore, sidebar: SidebarState) {
    store.editSections { SidebarSections.assign($0, agentIds: ids, to: sectionId) }
    sidebar.selection.clear()
  }

  /** A new section at the top holding these agents, its name ready to type over. */
  static func newSection(with ids: [String], store: AppStore, sidebar: SidebarState) {
    guard let id = store.createSection(with: ids) else { return }
    sidebar.selection.clear()
    sidebar.folded.remove(id)
    sidebar.renamingSection = id
  }

  /** A copy of the agent, opened. */
  static func duplicate(_ id: String, store: AppStore, window: WindowState) {
    Task {
      if let copy = await store.duplicate(id) { window.open(copy, store: store) }
    }
  }

  static func copyId(_ id: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(id, forType: .string)
  }

  /**
   * Delete, after the window's confirmation (`I3n`): its title and words,
   * Delete in red and Cancel. A refusal says so in the window's words.
   */
  static func confirmDelete(_ ids: [String], store: AppStore, sidebar: SidebarState) {
    let agents = ids.compactMap { store.agent($0) }
    guard !agents.isEmpty else { return }
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = AgentDeletion.title(agents)
    alert.informativeText = AgentDeletion.message(agents)
    alert.addButton(withTitle: "Delete").hasDestructiveAction = true
    alert.addButton(withTitle: "Cancel").keyEquivalent = "\u{1b}"
    present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      Task {
        if await store.delete(agents.map(\.id)) {
          sidebar.selection.keep(Set(store.agents.map(\.id)))
        } else {
          let failed = NSAlert()
          failed.alertStyle = .warning
          failed.messageText = AgentDeletion.title(agents)
          failed.informativeText = AgentDeletion.failure
          failed.addButton(withTitle: "OK")
          present(failed) { _ in }
        }
      }
    }
  }

  /** A section's Delete, confirmed: its agents go to Unassigned. */
  static func confirmDeleteSection(_ id: String, name: String, store: AppStore) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = SidebarSections.deleteTitle(name: name)
    alert.informativeText = SidebarSections.deleteMessage
    alert.addButton(withTitle: "Delete").hasDestructiveAction = true
    alert.addButton(withTitle: "Cancel").keyEquivalent = "\u{1b}"
    present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      store.editSections { SidebarSections.remove($0, id: id) }
    }
  }

  static func renameSection(_ id: String, to name: String, store: AppStore) {
    let kept = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !kept.isEmpty else { return }
    store.editSections { SidebarSections.rename($0, id: id, to: kept) }
  }

  /** The person's sections in order, "Unassigned" (always last) left out: what Move up and Move down step through. */
  static func ownSections(_ store: AppStore) -> [SidebarSection] {
    (store.sidebarSections ?? []).filter { !$0.isUnassigned }
  }

  static func canMove(_ id: String, up: Bool, store: AppStore) -> Bool {
    let own = ownSections(store)
    guard let index = own.firstIndex(where: { $0.id == id }) else { return false }
    return up ? index > 0 : index < own.count - 1
  }

  static func moveSection(_ id: String, up: Bool, store: AppStore) {
    let own = ownSections(store)
    guard let index = own.firstIndex(where: { $0.id == id }) else { return }
    let target = up ? index - 1 : index + 1
    guard own.indices.contains(target) else { return }
    store.editSections { SidebarSections.move($0, id: id, to: own[target].id, before: up) }
  }

  /** An alert over the window, as a sheet; on its own when no window is in front. */
  static func present(_ alert: NSAlert, then done: @escaping @MainActor (NSApplication.ModalResponse) -> Void) {
    if let window = NSApp.keyWindow ?? NSApp.mainWindow {
      alert.beginSheetModal(for: window) { response in
        MainActor.assumeIsolated { done(response) }
      }
    } else {
      done(alert.runModal())
    }
  }
}
