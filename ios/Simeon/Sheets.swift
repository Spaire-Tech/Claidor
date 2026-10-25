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

/** The phone sheets' blue button (`.simeon-phone-primary`): 52 high, 17 semibold; grey and faint when it can't be pressed. */
struct PhonePrimaryStyle: ButtonStyle {
  var small = false
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: small ? 16 : 17, weight: .semibold))
      .foregroundStyle(enabled ? Color.white : Ink.tertiary)
      .padding(.horizontal, small ? 18 : 0)
      .frame(maxWidth: small ? nil : .infinity)
      .frame(height: small ? 40 : 52)
      .background(enabled ? Ink.bubbleMine : Ink.pill, in: Capsule())
      .opacity(configuration.isPressed ? 0.85 : 1)
  }
}

/**
 * New Agent, as Apple's New Contact (the founder, 25 October 2026: "design
 * creating an agent better"): the X at the top left and Create in our blue
 * at the right; the face it will wear at 120 with Edit under it, both
 * opening the avatar editor (another face, a picture generated or uploaded,
 * its voice; kept here in AgentDraft and sent with the agent at Create);
 * then Name and Title in one group, the keyboard up on Name. The face is
 * given once and stays while the name is typed, changing only for a name of
 * the other gender (`AgentDraft.settleFace`; it changed at every letter
 * until then). The agent keeps that face, is asked to introduce itself, and
 * its chat opens.
 */
struct NewAgentSheet: View {
  let created: (String) -> Void
  @Environment(AppStore.self) private var store
  @State private var name = ""
  @State private var title = ""
  @State private var draft = AgentDraft()
  @State private var editingAvatar = false
  @State private var busy = false
  @State private var failed = false
  @FocusState private var field: Field?

  private enum Field { case name, title }

  private var trimmed: String { name.split(whereSeparator: \.isWhitespace).joined(separator: " ") }

  /** The picture drawn or uploaded, else the face picked, else the one the name gets. */
  private var picture: UIImage? {
    if let png = draft.picture, let image = UIImage(data: png) { return image }
    return draft.shownFace(agents: store.agents).flatMap { AgentPictures.image($0) }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          VStack(spacing: 12) {
            Button(action: editAvatar) {
              PictureCircle(image: picture).frame(width: 120, height: 120)
            }
            .buttonStyle(.tactile)
            .accessibilityLabel("Edit agent avatar")
            Button(action: editAvatar) {
              Text("Edit")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Ink.primary)
                .padding(.horizontal, 16)
                .frame(height: 32)
                .background(Ink.groupedRow, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(.tactile)
          }
          .frame(maxWidth: .infinity)
          .listRowBackground(Color.clear)
        }
        Section {
          TextField("Name", text: $name)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .focused($field, equals: .name)
            .submitLabel(.next)
            .onSubmit { field = .title }
            .onChange(of: name) { _, value in
              if value.count > 60 { name = String(value.prefix(60)) }
              draft.name = trimmed
              draft.settleFace(agents: store.agents)
            }
          // Its job, not just a name (the founder, 19 October 2026): the tag under its name and its role in its own prompt; may stay empty.
          TextField("Title", text: $title)
            .textInputAutocapitalization(.words)
            .focused($field, equals: .title)
            .submitLabel(.done)
            .onSubmit(create)
            .onChange(of: title) { _, value in
              if value.count > 60 { title = String(value.prefix(60)) }
              draft.title = title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            }
        } footer: {
          if failed {
            Text("Couldn’t create the agent. Try again.").foregroundStyle(Ink.danger)
          }
        }
        .listRowBackground(Ink.groupedRow)
      }
      .groupedGround()
      .navigationTitle("New Agent")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) { CloseButton() }
        ToolbarItem(placement: .confirmationAction) {
          if busy { ProgressView() } else {
            Button("Create", action: create).tint(Ink.blue).disabled(trimmed.isEmpty)
          }
        }
      }
      .sheet(isPresented: $editingAvatar) {
        AvatarEditor(draft: $draft).problemAlert()
      }
      .task {
        draft.settleFace(agents: store.agents)
        field = .name
      }
    }
  }

  private func editAvatar() {
    field = nil
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
      if let id { Haptics.success(); created(id) } else { Haptics.warning(); failed = true }
    }
  }
}

/**
 * New Group Chat (round 3, `__simeonNewGroupSheet`): Next at the top
 * right once two are picked; "To:" with the picked agents as grey chips and
 * "Search agents"; the agents in 64 pt rows (the picture at 40, the name,
 * a 26 pt check that fills blue). The group is named for its members.
 */
struct NewGroupSheet: View {
  let created: (String) -> Void
  @Environment(AppStore.self) private var store
  @State private var picked: [String] = []
  @State private var query = ""
  @State private var busy = false
  @State private var failed = false
  @FocusState private var searching: Bool

  private var candidates: [Agent] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    return store.agents.filter { !$0.isGroup && !$0.isHidden && (q.isEmpty || $0.name.lowercased().contains(q)) }
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        HStack(spacing: 6) {
          Text("To:").foregroundStyle(Ink.secondary).allowsHitTesting(false)
          ForEach(picked, id: \.self) { id in
            Text(store.agent(id)?.name ?? id)
              .font(.system(size: 15, weight: .medium))
              .padding(.horizontal, 12).padding(.vertical, 4)
              .background(Ink.bubbleTheirs, in: Capsule())
          }
          TextField(picked.isEmpty ? "Search agents" : "", text: $query)
            .focused($searching)
            .frame(minWidth: 80)
            .frame(height: 34)
            .accessibilityLabel("Search agents")
        }
        .font(.system(size: 17))
        .padding(.horizontal, 16).padding(.vertical, 6)
        .frame(minHeight: 48)
        // The whole capsule takes the tap, not only the field inside its padding.
        .background { Color.clear.contentShape(.rect).onTapGesture { searching = true } }
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Ink.edge, lineWidth: 1).allowsHitTesting(false))
        .padding(.horizontal, 16)
        if failed {
          Text("Couldn’t create the group. Try again.").font(.system(size: 14)).foregroundStyle(Ink.danger).padding(.top, 8)
        }
        ScrollView {
          LazyVStack(spacing: 0) {
            ForEach(candidates) { agent in
              let on = picked.contains(agent.id)
              Button { toggle(agent.id) } label: {
                HStack(spacing: 14) {
                  AgentAvatar(agent: agent, members: store.members(of: agent)).frame(width: 40, height: 40).frame(width: 44, height: 44)
                  Text(agent.name).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
                  Spacer(minLength: 0)
                  ZStack {
                    Circle().strokeBorder(Ink.tertiary, lineWidth: on ? 0 : 1.5)
                    if on {
                      Circle().fill(Ink.bubbleMine)
                      Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                    }
                  }
                  .frame(width: 26, height: 26)
                }
                .padding(.horizontal, 12)
                .frame(height: 64)
                .contentShape(Rectangle())
              }
              .buttonStyle(.tactile)
              .accessibilityAddTraits(on ? .isSelected : [])
            }
          }
          .padding(.horizontal, 8).padding(.top, 10).padding(.bottom, 16)
        }
      }
      .background(Ink.ground)
      .navigationTitle("New Group Chat")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) { CloseButton() }
        ToolbarItem(placement: .trailingBar) {
          Button(busy ? "Creating…" : "Next", action: create)
            .buttonStyle(Tactile(look: PhonePrimaryStyle(small: true)))
            .disabled(picked.count < 2 || busy)
        }
      }
    }
  }

  private func toggle(_ id: String) {
    if let index = picked.firstIndex(of: id) { picked.remove(at: index) } else { picked.append(id) }
  }

  private func create() {
    guard picked.count >= 2, !busy else { return }
    busy = true
    failed = false
    Task {
      let id = await store.createGroup(memberIds: picked)
      busy = false
      if let id { Haptics.success(); created(id) } else { Haptics.warning(); failed = true }
    }
  }
}
