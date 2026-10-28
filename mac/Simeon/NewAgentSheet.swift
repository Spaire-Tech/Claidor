import AppKit
import SwiftUI
import SimeonCore

/**
 * New Agent on a sheet, the iPhone's New Agent in the Mac's parts (the
 * founder, 28 October 2026: "create a new agent in mac is behaving
 * completely different from iphone… the same components as the iphone, with
 * being able to choose the avatar"): the glass disc that closes it and the
 * title at its top; the face it will wear at 120 with Edit under it, both
 * opening the avatar editor in a popover (another face, a picture generated
 * or uploaded, its voice; kept in an AgentDraft and sent with the agent at
 * Create); Name and Title in one group, the keys in Name; Create, the
 * sheet's one wide button in the blue. The face is given once and stays
 * while the name is typed, changing only for a name of the other gender
 * (`AgentDraft.settleFace`). The agent keeps that face, is asked to
 * introduce itself, and its chat opens.
 */
struct MacNewAgentSheet: View {
  let created: (String) -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var name = ""
  @State private var title = ""
  @State private var editor = AvatarEditorModel(draft: AgentDraft())
  @State private var editingAvatar = false
  @State private var busy = false
  @State private var failed = false
  @FocusState private var field: Field?

  private enum Field { case name, title }

  private var look: Look { Look(scheme) }

  private var trimmed: String { name.split(whereSeparator: \.isWhitespace).joined(separator: " ") }

  private var draft: AgentDraft { editor.draft ?? AgentDraft() }

  /** The picture drawn or uploaded, else the face picked, else the one the name gets. */
  private var picture: NSImage? {
    if let png = draft.picture, let image = NSImage(data: png) { return image }
    return draft.shownFace(agents: store.agents).flatMap { AvatarPictures.image($0) }
  }

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text("New Agent")
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        HStack {
          GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
            .keyboardShortcut(.cancelAction)
            .disabled(busy)
          Spacer(minLength: 0)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 16)
      .padding(.bottom, 8)
      VStack(spacing: 24) {
        face
        SettingsGroup(footer: failed ? String(localized: "Couldn’t create the agent. Try again.") : nil, footerTint: look.danger, look: look) {
          line("Name", text: $name, field: .name, divided: false)
            .onSubmit { field = .title }
          line("Title", text: $title, field: .title, divided: true)
            .onSubmit(create)
        }
      }
      .padding(.horizontal, 32)
      .padding(.top, 8)
      // White on the blue; with no name yet, grey words on the grey (the iPhone's): white on the light grey could not be read (the founder, 28 October 2026).
      Button(action: create) {
        HStack(spacing: 8) {
          if busy { ProgressView().controlSize(.small).tint(.white) }
          Text("Create")
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(trimmed.isEmpty ? look.inkSecondary : Color.white)
        .frame(maxWidth: .infinity)
        .frame(height: 36)
      }
      .prominentGlassButton()
      .controlSize(.large)
      .tint(look.yours)
      .keyboardShortcut(.defaultAction)
      .handCursor()
      // Not greyed while it makes the agent: the blue stays under the spinner (`create` ignores a second press).
      .disabled(trimmed.isEmpty)
      .padding(.horizontal, 32)
      .padding(.top, 28)
      .padding(.bottom, 24)
    }
    .frame(width: 440)
    .background(look.groupedGround)
    .onChange(of: name) { _, value in
      if value.count > 60 { name = String(value.prefix(60)) }
      editor.draft?.name = trimmed
      editor.draft?.settleFace(agents: store.agents)
    }
    // Its job, not just a name (the founder, 19 October 2026): the tag under its name and its role in its own prompt; may stay empty.
    .onChange(of: title) { _, value in
      if value.count > 60 { title = String(value.prefix(60)) }
      editor.draft?.title = title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
    .task {
      editor.draft?.settleFace(agents: store.agents)
      field = .name
    }
    .interactiveDismissDisabled(busy)
    .closesOnClickOutside { if !busy && !editingAvatar { dismiss() } }
  }

  /** The face at 120 and Edit, each opening the editor under it. */
  private var face: some View {
    VStack(spacing: 12) {
      Button(action: editAvatar) {
        AgentPicture(image: picture, size: 120)
      }
      .buttonStyle(.hand)
      .accessibilityLabel("Edit agent avatar")
      .popover(isPresented: $editingAvatar, arrowEdge: .bottom) {
        AvatarEditorPopover(agent: editor.shown(nil, store: store), model: editor, width: 294, look: look, chrome: false) {
          editingAvatar = false
        }
        .padding(4)
        .onDisappear { editor.closeNow() }
      }
      Button(action: editAvatar) {
        Text("Edit")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.ink)
          .padding(.horizontal, 14)
          .frame(height: 28)
          .background(Capsule().fill(look.groupedRow))
          .contentShape(Capsule())
      }
      .buttonStyle(.hand)
    }
    .frame(maxWidth: .infinity)
  }

  /** A field in the group: its words as its placeholder, as the iPhone's. */
  private func line(_ label: LocalizedStringKey, text: Binding<String>, field which: Field, divided: Bool) -> some View {
    TextField(label, text: text, prompt: Text(label).foregroundStyle(look.inkTertiary))
      .textFieldStyle(.plain)
      .labelsHidden()
      .font(PanelType.row)
      .foregroundStyle(look.ink)
      .focused($field, equals: which)
      .padding(.horizontal, SettingsRowSize.inset)
      .frame(maxWidth: .infinity, minHeight: SettingsRowSize.minHeight, alignment: .leading)
      .contentShape(Rectangle())
      .onTapGesture { field = which }
      .overlay(alignment: .top) {
        if divided { SettingsDivider(look: look) }
      }
  }

  private func editAvatar() {
    field = nil
    editor.reopen()
    editingAvatar = true
  }

  private func create() {
    let name = trimmed
    guard !name.isEmpty, !busy else { return }
    busy = true
    failed = false
    let draft = draft
    Task {
      let id = await store.createAgent(name: name, draft: draft)
      busy = false
      if let id {
        dismiss()
        created(id)
      } else {
        NSSound.beep()
        failed = true
      }
    }
  }
}
