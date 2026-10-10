import AppKit
import SwiftUI
import SimeonCore

/**
 * A group's members, the whole of its Computer tab (`z2n`): "Members", then
 * a row for each (its butterfly at 28 and its name; Remove at the right
 * under the pointer), Add Member while there is room and someone to add, and
 * a line under the list at six members or when no one is left. A row opens
 * that agent's chat (the pane stays, on its Profile).
 */
struct GroupMembersBody: View {
  let group: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  /** A change of the list on its way: Remove and Add Member wait (`isPending`). */
  @State private var pending = false

  var body: some View {
    let members = store.members(of: group)
    let candidates = GroupMembers.candidates(for: group, in: store.agents)
    VStack(alignment: .leading, spacing: 6) {
      Text("Members")
        .font(.system(size: 13, weight: .medium))
        .tracking(-0.16)
        .foregroundStyle(look.inkSecondary)
        .frame(height: 18)
        .padding(.leading, 2)
      VStack(spacing: 2) {
        ForEach(members) { member in
          MemberRow(member: member, agents: store.agents, canRemove: GroupMembers.canRemove(count: group.memberIds.count, pending: pending), look: look) {
            window.choose(member.id, store: store)
          } remove: {
            MemberRemoval.confirm(member, from: group.id, store: store) { pending = $0 }
          }
        }
        if GroupMembers.showsAdd(count: group.memberIds.count, candidates: candidates.count) {
          AddMemberRow(look: look, disabled: pending) { frame in
            addMenu(candidates, under: frame)
          }
        }
      }
      if let footer = GroupMembers.footer(count: group.memberIds.count, candidates: candidates.count) {
        Text(footer)
          .font(.system(size: 11))
          .tracking(0.07)
          .foregroundStyle(look.inkTertiary)
          .padding(.leading, 8)
          .frame(height: 32, alignment: .leading)
          .padding(.top, 10)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Members")
  }

  /** Add Member's menu (at least 200 wide): each agent's butterfly at 28 and its name; a pick adds it at the end, and a refusal says nothing. */
  private func addMenu(_ candidates: [Agent], under frame: CGRect) {
    let menu = NSMenu(title: "Add Member")
    menu.autoenablesItems = false
    menu.minimumWidth = 200
    let groupId = group.id
    for candidate in candidates {
      let item = BlockMenuItem(candidate.name) {
        guard let current = store.agent(groupId)?.memberIds, let next = GroupMembers.adding(candidate.id, to: current) else { return }
        pending = true
        Task {
          try? await store.setGroupMembers(groupId, next)
          pending = false
        }
      }
      item.image = MemberMarks.image(candidate, agents: store.agents, dark: look.dark)
      menu.addItem(item)
    }
    RoutineMenus.popUp(menu, under: frame)
  }
}

/** A member's row (`sand-group-member-row`): 40 high, padded 6 and 8, round 8, the grey under the pointer; Remove shows only then. */
private struct MemberRow: View {
  let member: Agent
  let agents: [Agent]
  let canRemove: Bool
  let look: Look
  let open: () -> Void
  let remove: () -> Void
  @State private var hovering = false
  @State private var removeHovering = false

  var body: some View {
    HStack(spacing: 10) {
      Button(action: open) {
        HStack(spacing: 10) {
          AgentMark(agent: member, agents: agents, size: 28)
            .frame(width: 28, height: 28)
          Text(member.name)
            .font(.system(size: 12))
            .foregroundStyle(look.paneInk)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 28)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open \(member.name)'s chat")
      // Always laid out, so the name's room never changes; seen and pressable only under the pointer.
      Button(action: remove) {
        Text("Remove")
          .font(.system(size: 12))
          .foregroundStyle(canRemove ? look.danger : look.danger.opacity(0.3))
          .padding(.horizontal, 6)
          .frame(height: 24)
          .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(removeFill))
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(!canRemove)
      .onHover { removeHovering = $0 }
      .opacity(hovering ? 1 : 0)
      .allowsHitTesting(hovering)
      .animation(.easeOut(duration: 0.12), value: hovering)
      .accessibilityLabel("Remove \(member.name)")
    }
    .padding(.vertical, 6)
    .padding(.horizontal, 8)
    .frame(height: 40)
    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hovering ? look.rowHover : .clear))
    .onHover { inside in withAnimation(.easeInOut(duration: 0.12)) { hovering = inside } }
  }

  private var removeFill: Color {
    if !canRemove { return look.dangerFill(0.063, dark: 0.14) }
    return removeHovering ? look.dangerFill(0.17, dark: 0.32) : look.dangerFill(0.09, dark: 0.173)
  }
}

/** Add Member (`sand-group-member-add-row`): the same 40-high row, `plus` in a 28 slot and the words, grey; the text's colour and the grey fill under the pointer. Its menu opens 4 under it. */
private struct AddMemberRow: View {
  let look: Look
  let disabled: Bool
  let open: (CGRect) -> Void
  @State private var spot = WindowSpot()
  @State private var hovering = false

  var body: some View {
    Button { open(spot.frame) } label: {
      HStack(spacing: 10) {
        Image(systemName: "plus")
          .font(.system(size: 11, weight: .semibold))
          .frame(width: 28, height: 28)
        Text("Add Member")
          .font(.system(size: 12))
      }
      .foregroundStyle(hovering ? look.ink : look.inkSecondary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .frame(height: 28)
      .padding(.vertical, 6)
      .padding(.horizontal, 8)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hovering ? look.rowHover : .clear))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .onHover { inside in withAnimation(.easeInOut(duration: 0.12)) { hovering = inside } }
    .background(WindowSpotReader(spot: spot))
    .accessibilityLabel("Add Member")
  }
}

/** An agent's butterfly as a menu item's picture, 28 points. */
@MainActor
enum MemberMarks {
  static func image(_ agent: Agent, agents: [Agent], dark: Bool) -> NSImage? {
    let renderer = ImageRenderer(content: AgentMark(agent: agent, agents: agents, size: 28).frame(width: 28, height: 28).environment(\.colorScheme, dark ? .dark : .light))
    renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
    return renderer.nsImage
  }
}

/**
 * Remove's question (`F2n`), the Mac's alert: "Remove {name} from this
 * conversation?", Remove and Cancel. Remove reads the group's members as
 * they are then; while the change goes it reads "Removing..." and neither
 * button can be pressed; a refusal keeps the alert open with the window's
 * words, and Remove can be pressed again.
 */
@MainActor
enum MemberRemoval {
  static func confirm(_ member: Agent, from groupId: String, store: AppStore, pending: @escaping (Bool) -> Void) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = GroupMembers.removeTitle(member.name)
    alert.informativeText = ""
    let remove = alert.addButton(withTitle: "Remove")
    remove.hasDestructiveAction = true
    let cancel = alert.addButton(withTitle: "Cancel")
    cancel.keyEquivalent = "\u{1b}"
    let handler = Handler(alert: alert, memberId: member.id, groupId: groupId, store: store, pending: pending)
    remove.target = handler
    remove.action = #selector(Handler.confirm)
    objc_setAssociatedObject(alert, &Handler.key, handler, .OBJC_ASSOCIATION_RETAIN)
    SidebarActions.present(alert) { _ in }
  }

  final class Handler: NSObject {
    nonisolated(unsafe) static var key = 0
    weak var alert: NSAlert?
    let memberId: String
    let groupId: String
    let store: AppStore
    let pending: (Bool) -> Void

    init(alert: NSAlert, memberId: String, groupId: String, store: AppStore, pending: @escaping (Bool) -> Void) {
      self.alert = alert
      self.memberId = memberId
      self.groupId = groupId
      self.store = store
      self.pending = pending
    }

    @MainActor @objc func confirm() {
      guard let alert, alert.buttons.count == 2 else { return }
      guard let next = GroupMembers.without(memberId, current: store.agent(groupId)?.memberIds ?? []) else {
        end(alert)
        return
      }
      let remove = alert.buttons[0], cancel = alert.buttons[1]
      remove.title = GroupMembers.removing
      remove.isEnabled = false
      cancel.isEnabled = false
      pending(true)
      Task { @MainActor in
        do {
          try await store.setGroupMembers(groupId, next)
          pending(false)
          end(alert)
        } catch {
          pending(false)
          remove.title = "Remove"
          remove.isEnabled = true
          cancel.isEnabled = true
          alert.informativeText = GroupMembers.removeFailed
          alert.layout()
        }
      }
    }

    @MainActor private func end(_ alert: NSAlert) {
      if let parent = alert.window.sheetParent {
        parent.endSheet(alert.window, returnCode: .alertFirstButtonReturn)
      } else {
        NSApp.stopModal(withCode: .alertFirstButtonReturn)
      }
    }
  }
}

// MARK: - A flight's details

/**
 * A flight in the pane (`__simeonFlightDetails`), in place of the agent's
 * page: the airline's mark (72, white in both themes, its logo at 42 or its
 * initials), "FROM → TO" (22/28, medium), date · time · stops (15/20, grey);
 * 30 under it the sections 22 apart: Price, each leg, Fare, their rows a
 * label and the server's words (a hairline under each), a layover after a
 * leg that is not the last. Nothing to press: × is the pane's.
 */
struct FlightPage: View {
  let offer: FlightOffer
  let look: Look

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 0) {
        AirlineMark(name: offer.airline, logo: offer.logo, side: 72, logoSide: 42, initialsSize: 20, ring: look.paneHairline, ringWidth: 1)
        Text(FlightPane.name(offer))
          .font(.system(size: 22, weight: .medium))
          .tracking(-0.484)
          .foregroundStyle(look.paneInk)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(height: 28)
          .padding(.top, 14)
        let title = FlightPane.title(offer)
        if !title.isEmpty {
          Text(title)
            .font(.system(size: 15))
            .tracking(-0.16)
            .foregroundStyle(look.paneInk2)
            .multilineTextAlignment(.center)
            .frame(minHeight: 20)
            .padding(.top, 1)
        }
      }
      .padding(.top, 12)
      .frame(maxWidth: .infinity)
      VStack(alignment: .leading, spacing: 22) {
        ForEach(FlightPane.sections(offer), id: \.self) { section in
          VStack(alignment: .leading, spacing: 0) {
            Text(section.heading)
              .font(.system(size: 13))
              .foregroundStyle(look.paneInk2)
              .frame(minHeight: 16, alignment: .leading)
              .padding(.bottom, 2)
            ForEach(section.rows, id: \.self) { row in
              FlightDetailRow(row: row, look: look)
            }
            if let note = section.note {
              Text(note)
                .font(.system(size: 13))
                .lineSpacing(LineBox.extra(size: 13, lineHeight: 18))
                .foregroundStyle(look.paneInk2)
                .padding(.top, 10)
            }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 30)
    }
    .textSelection(.enabled)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(FlightPane.name(offer))
  }
}

/** A row (`__simeonFlightRow`): the label (15/20) and, at the right, its words in grey (wrapping, never cut) with a smaller line under them; padded 11, a hairline under it. */
private struct FlightDetailRow: View {
  let row: FlightPane.Row
  let look: Look

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 16) {
      Text(row.label)
        .font(.system(size: 15))
        .tracking(-0.16)
        .foregroundStyle(look.paneInk)
        .fixedSize()
      Spacer(minLength: 0)
      VStack(alignment: .trailing, spacing: 0) {
        Text(row.value)
          .font(.system(size: 15))
          .tracking(-0.16)
          .lineSpacing(LineBox.extra(size: 15, lineHeight: 20))
          .foregroundStyle(look.paneInk2)
          .multilineTextAlignment(.trailing)
          .fixedSize(horizontal: false, vertical: true)
        if let sub = row.sub {
          Text(sub)
            .font(.system(size: 13))
            .foregroundStyle(look.paneInk2)
            .multilineTextAlignment(.trailing)
            .frame(minHeight: 18)
        }
      }
    }
    .padding(.vertical, 11)
    .overlay(alignment: .bottom) {
      Rectangle().fill(look.paneHairline).frame(height: 0.5)
    }
  }
}

// MARK: - Colours

extension Look {
  /** The danger red's fills (`--sand-fill-danger` and its hover and disabled), 255 38 60 at the given strengths. */
  func dangerFill(_ light: Double, dark darkOpacity: Double) -> Color {
    Color(red: 1, green: 38 / 255, blue: 60 / 255).opacity(dark ? darkOpacity : light)
  }
}
