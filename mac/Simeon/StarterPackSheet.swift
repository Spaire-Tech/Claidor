import AppKit
import SwiftUI
import SimeonCore

/**
 * A starter pack the website's Add to Simeon opened
 * (`simeon://app/v1/pack/add?id=<id>`, 22 October 2026): read from Simeon
 * Labs' server, shown, and added on Add (`AppStore.addPack`).
 */
struct PackAsk: Equatable {
  let id: String
  var pack: StarterPack?
  var failure: String?
  var adding = false
}

extension MacServices {
  /** The sheet for a pack, its pack read from the server. */
  func askPack(_ id: String) {
    guard let store = currentStore else { return }
    packAsk = PackAsk(id: id)
    Task {
      do {
        let pack = try await store.starterPack(id)
        if packAsk?.id == id { packAsk?.pack = pack }
      } catch {
        if packAsk?.id == id { packAsk?.failure = error.localizedDescription }
      }
    }
  }

  /** Add: the five agents in their folder, the first one's chat opened; a team already added only opens. */
  func addAskedPack() {
    guard let ask = packAsk, let pack = ask.pack, !ask.adding, let store = currentStore else { return }
    if let first = store.packAgents(pack).first {
      packAsk = nil
      open(agent: first)
      return
    }
    packAsk?.adding = true
    Task {
      let made = await store.addPack(pack)
      guard packAsk?.id == pack.id else { return }
      if let first = made.first {
        packAsk = nil
        open(agent: first)
      } else {
        packAsk?.adding = false
        packAsk?.pack = nil
        packAsk?.failure = store.problemShown ?? String(localized: "Couldn't add the team. Try again.")
      }
    }
  }
}

/** The pack's sheet over the window, signed in. */
struct StarterPackLayer: View {
  @Environment(\.colorScheme) private var scheme
  @Environment(AppStore.self) private var store

  var body: some View {
    let services = MacServices.shared
    ZStack {
      if let ask = services.packAsk {
        let look = Look(scheme)
        Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5)
          .contentShape(Rectangle())
          .onTapGesture { if !ask.adding { services.packAsk = nil } }
          .transition(.opacity)
        StarterPackDialog(ask: ask, added: ask.pack.map { !store.packAgents($0).isEmpty } ?? false, look: look,
                          add: { services.addAskedPack() }, close: { if !ask.adding { services.packAsk = nil } })
          .id(ask.id)
          .transition(.scale(scale: 0.96).combined(with: .opacity))
      }
    }
    .animation(.easeOut(duration: 0.18), value: services.packAsk?.id)
    .ignoresSafeArea()
  }
}

/**
 * The pack, as the connect consent beside it (600 wide, ×
 * at the top left): the five faces side by side, the pack's name and what
 * it is for; each agent with its face, name and job, what it does and the
 * apps it asks for; where they go and how they start; Add to Simeon across
 * the foot in the blue (Open "Coffee Shop Team" once added). Return adds;
 * Escape, × or a click beside it closes.
 */
private struct StarterPackDialog: View {
  let ask: PackAsk
  let added: Bool
  let look: Look
  let add: () -> Void
  let close: () -> Void

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
    Group {
      if let pack = ask.pack {
        ViewThatFits(in: .vertical) {
          VStack(spacing: 0) {
            content(pack)
            button(pack)
          }
          VStack(spacing: 0) {
            ScrollView { content(pack) }
            button(pack)
          }
        }
      } else if let failure = ask.failure {
        VStack(spacing: 12) {
          Text("Couldn't open this team")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(look.ink)
          Text(failure)
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 64)
        .frame(maxWidth: .infinity, minHeight: 220)
      } else {
        ProgressView()
          .controlSize(.small)
          .frame(maxWidth: .infinity, minHeight: 220)
      }
    }
    .frame(width: 600)
    .overlay(alignment: .topLeading) {
      GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32, action: close)
        .padding(16)
        .disabled(ask.adding)
    }
    .background(look.elevated, in: shape)
    .clipShape(shape)
    .overlay(shape.strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
    .shadow(color: .black.opacity(look.dark ? 0.5 : 0.22), radius: 30, x: 0, y: 12)
    .padding(.vertical, 32)
    .background(ViewerKeys(aboveLocks: true) { event in
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      guard mods.isEmpty else { return false }
      switch event.keyCode {
      case 53: close()
      case 36, 76: if ask.pack != nil { add() }
      default: return false
      }
      return true
    })
    // What is typed waits: the field under it lets go of the keys.
    .onAppear { MacServices.shared.mainWindow?.makeFirstResponder(nil) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(ask.pack?.title ?? String(localized: "Starter team"))
    .accessibilityAddTraits(.isModal)
  }

  private func content(_ pack: StarterPack) -> some View {
    VStack(spacing: 0) {
      // The five faces, each a little over the one before, ringed in the sheet's ground.
      HStack(spacing: -14) {
        ForEach(pack.members) { member in
          face(member, side: 56)
            .overlay(Circle().strokeBorder(look.elevated, lineWidth: 3))
        }
      }
      .padding(.top, 40)
      .accessibilityHidden(true)
      Text(pack.title)
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(look.ink)
        .padding(.top, 16)
        .accessibilityAddTraits(.isHeader)
      if !pack.summary.isEmpty {
        Text(pack.summary)
          .font(.system(size: 14))
          .foregroundStyle(look.inkSecondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 6)
          .padding(.horizontal, 64)
      }
      VStack(alignment: .leading, spacing: 18) {
        ForEach(pack.members) { member in
          HStack(alignment: .top, spacing: 14) {
            face(member, side: 40)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
              HStack(spacing: 6) {
                Text(member.name)
                  .font(.system(size: 14, weight: .medium))
                  .foregroundStyle(look.ink)
                if !member.title.isEmpty {
                  Text(member.title)
                    .font(.system(size: 14))
                    .foregroundStyle(look.inkSecondary)
                }
              }
              Text(member.summary)
                .font(.system(size: 13))
                .foregroundStyle(look.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
              HStack(spacing: 6) {
                ForEach(member.apps, id: \.id) { app in
                  AppLogoTile(name: app.name, look: look, side: 20, id: app.id)
                    .help(app.name)
                }
              }
              .padding(.top, 5)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(ListFormatter.localizedString(byJoining: member.apps.map(\.name)))
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 48)
      .padding(.top, 26)
      Rectangle()
        .fill(look.ink.opacity(0.1))
        .frame(height: 0.5)
        .padding(.horizontal, 48)
        .padding(.top, 22)
      Text("They go in a “\(pack.folder)” folder in your sidebar. Each one says hello in its own chat and asks to connect its apps; the ones you already use are just named. You can change anything later.")
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 48)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }
  }

  private func button(_ pack: StarterPack) -> some View {
    Button(action: add) {
      HStack(spacing: 8) {
        if ask.adding {
          ProgressView().controlSize(.small).tint(.white)
          Text("Adding…")
        } else if added {
          Text("Open “\(pack.folder)”")
        } else {
          Text("Add to Simeon")
        }
      }
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(Color.white)
      .frame(maxWidth: .infinity)
      .frame(height: 36)
    }
    .prominentGlassButton()
    .controlSize(.large)
    .tint(look.yours)
    .handCursor()
    .disabled(ask.adding)
    .padding(.horizontal, 48)
    .padding(.top, 16)
    .padding(.bottom, 28)
  }

  @ViewBuilder
  private func face(_ member: StarterPack.Member, side: CGFloat) -> some View {
    if let face = AgentFaces.face(id: member.face), let image = AvatarPictures.image(face) {
      Image(nsImage: image)
        .resizable()
        .interpolation(.high)
        .scaledToFill()
        .frame(width: side, height: side)
        .clipShape(Circle())
    } else {
      Text(String(member.name.prefix(1)))
        .font(.system(size: side * 0.42, weight: .medium))
        .foregroundStyle(look.inkSecondary)
        .frame(width: side, height: side)
        .background(look.wash, in: Circle())
    }
  }
}
