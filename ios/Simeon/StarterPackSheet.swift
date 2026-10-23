import SwiftUI
import SimeonCore

#if os(iOS)
/** A starter pack's link, as a sheet's item. */
struct PackLink: Identifiable, Equatable {
  let id: String
}

/**
 * A starter pack the website's Add to Simeon opened
 * (`simeon-ios://app/v1/pack/add?id=<id>`, 22 October 2026), as a
 * sheet: the five faces side by side, the pack's name and what it is
 * for; each agent with its face, name and job, what it does and the apps it
 * asks for; Add to Simeon at the foot in the blue (Open "Coffee Shop Team" once added). Add makes the five agents
 * in their folder (`AppStore.addPack`) and opens the first one's chat.
 */
struct StarterPackSheet: View {
  let packId: String
  /** The chat to open once the team is made (or found). */
  let open: (String) -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var pack: StarterPack?
  @State private var failure: String?
  @State private var adding = false

  var body: some View {
    NavigationStack {
      Group {
        if let pack {
          ScrollView { content(pack) }
        } else if let failure {
          VStack(spacing: 10) {
            Text("Couldn't open this team")
              .font(.system(size: 20, weight: .semibold))
              .foregroundStyle(Ink.primary)
            Text(failure)
              .font(.system(size: 15))
              .foregroundStyle(Ink.secondary)
              .multilineTextAlignment(.center)
          }
          .padding(.horizontal, 32)
        } else {
          ProgressView()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Ink.ground)
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
      .safeAreaInset(edge: .bottom) {
        if let pack { button(pack) }
      }
    }
    .interactiveDismissDisabled(adding)
    .task(id: packId) { await load() }
  }

  private func load() async {
    failure = nil
    do { pack = try await store.starterPack(packId) } catch { failure = error.localizedDescription }
  }

  private func content(_ pack: StarterPack) -> some View {
    VStack(spacing: 0) {
      // The five faces, each a little over the one before, ringed in the sheet's ground.
      HStack(spacing: -14) {
        ForEach(pack.members) { member in
          face(member)
            .frame(width: 60, height: 60)
            .overlay(Circle().strokeBorder(Ink.ground, lineWidth: 3))
        }
      }
      .padding(.top, 8)
      .accessibilityHidden(true)
      Text(pack.title)
        .font(.system(size: 24, weight: .semibold))
        .foregroundStyle(Ink.primary)
        .multilineTextAlignment(.center)
        .padding(.top, 16)
        .accessibilityAddTraits(.isHeader)
      if !pack.summary.isEmpty {
        Text(pack.summary)
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
          .multilineTextAlignment(.center)
          .padding(.top, 6)
          .padding(.horizontal, 12)
      }
      VStack(alignment: .leading, spacing: 20) {
        ForEach(pack.members) { member in
          HStack(alignment: .top, spacing: 14) {
            face(member)
              .frame(width: 44, height: 44)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
              HStack(spacing: 6) {
                Text(member.name)
                  .font(.system(size: 16, weight: .medium))
                  .foregroundStyle(Ink.primary)
                if !member.title.isEmpty {
                  Text(member.title)
                    .font(.system(size: 16))
                    .foregroundStyle(Ink.secondary)
                }
              }
              Text(member.summary)
                .font(.system(size: 14))
                .foregroundStyle(Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
              HStack(spacing: 6) {
                ForEach(member.apps, id: \.id) { app in
                  ConnectorTile(name: app.name, size: 24, logo: 0.66, id: app.id)
                }
              }
              .padding(.top, 6)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(ListFormatter.localizedString(byJoining: member.apps.map(\.name)))
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 28)
      .padding(.bottom, 20)
    }
    .padding(.horizontal, 24)
  }

  private func button(_ pack: StarterPack) -> some View {
    let added = store.packAgents(pack)
    return Button { add(pack, added: added) } label: {
      Group {
        if adding {
          HStack(spacing: 8) {
            ProgressView().tint(.white)
            Text("Adding…")
          }
        } else if added.isEmpty {
          Text("Add to Simeon")
        } else {
          Text("Open “\(pack.folder)”")
        }
      }
      .font(.system(size: 17, weight: .semibold))
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity)
      .frame(height: 50)
    }
    .buttonStyle(.glassProminent)
    // Our blue, as the consent's Connect has it.
    .tint(Ink.blue)
    .disabled(adding)
    .padding(.horizontal, 24)
    .padding(.top, 10)
    .padding(.bottom, 8)
  }

  private func add(_ pack: StarterPack, added: [String]) {
    if let first = added.first {
      dismiss()
      open(first)
      return
    }
    adding = true
    Task {
      let made = await store.addPack(pack)
      adding = false
      if let first = made.first {
        dismiss()
        open(first)
      } else {
        failure = store.problemShown ?? String(localized: "Couldn't add the team. Try again.")
        self.pack = nil
      }
    }
  }

  private func face(_ member: StarterPack.Member) -> some View {
    PictureCircle(image: AgentFaces.face(id: member.face).flatMap { AgentPictures.image(.face($0)) })
  }
}
#endif
