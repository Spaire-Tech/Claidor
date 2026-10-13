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
 * New Agent (round 3, `__simeonNewAgentSheet`): the face it will wear at
 * 150, changing with the name as it is typed (a woman's name gets a woman's
 * face; AgentFaces.preview), "Name your agent" in a 52 pt field, Create. The
 * agent keeps that face, is asked to introduce itself, and its chat opens.
 * No colours to pick (the founder, 12 October 2026). The pencil on the face
 * opens the avatar editor for the agent to be (the founder, 13 October
 * 2026): another face, a picture generated or uploaded, its voice; kept here
 * (AgentDraft) and sent with the agent at Create.
 */
struct NewAgentSheet: View {
  let created: (String) -> Void
  @Environment(AppStore.self) private var store
  @State private var name = ""
  @State private var draft = AgentDraft()
  @State private var editingAvatar = false
  @State private var busy = false
  @State private var failed = false
  @FocusState private var naming: Bool

  private var trimmed: String { name.split(whereSeparator: \.isWhitespace).joined(separator: " ") }

  /** The picture drawn or uploaded, else the face picked, else the one the name gets. */
  private var picture: UIImage? {
    if let png = draft.picture, let image = UIImage(data: png) { return image }
    return draft.shownFace(agents: store.agents).flatMap { AgentPictures.image($0) }
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        ZStack(alignment: .bottomTrailing) {
          PictureCircle(image: picture)
            .frame(width: 150, height: 150)
          // The agent page's pencil, at the sheet's larger face.
          Button { naming = false; editingAvatar = true } label: {
            Image(systemName: "pencil").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
              .frame(width: 36, height: 36)
              .background(Ink.bubbleTheirs, in: Circle())
              .frame(width: 44, height: 44)
              .contentShape(.circle)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Edit agent avatar")
          .offset(x: 2, y: 2)
        }
        .frame(maxWidth: .infinity, minHeight: 170, maxHeight: .infinity)
        TextField("Name your agent", text: $name)
          .font(.system(size: 17))
          .multilineTextAlignment(.center)
          .focused($naming)
          .submitLabel(.done)
          .onSubmit(create)
          .onChange(of: name) { _, value in
            if value.count > 60 { name = String(value.prefix(60)) }
            draft.name = trimmed
          }
          .padding(.horizontal, 16)
          .frame(height: 52)
          .background(Ink.ground, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Ink.edge, lineWidth: 1))
          .padding(.horizontal, 16)
          .padding(.bottom, 22)
        if failed {
          Text("Couldn’t create the agent. Try again.").font(.system(size: 14)).foregroundStyle(Ink.danger).multilineTextAlignment(.center).padding(.horizontal, 16).padding(.bottom, 8)
        }
        Button(busy ? "Creating…" : "Create", action: create)
          .buttonStyle(PhonePrimaryStyle())
          .disabled(trimmed.isEmpty || busy)
          .padding(.horizontal, 16).padding(.bottom, 16)
      }
      .background(Ink.ground)
      .navigationTitle("New Agent")
      .inlineBarTitle()
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
      .sheet(isPresented: $editingAvatar) {
        AvatarEditor(draft: $draft).problemAlert()
      }
    }
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
              .buttonStyle(.plain)
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
            .buttonStyle(PhonePrimaryStyle(small: true))
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
