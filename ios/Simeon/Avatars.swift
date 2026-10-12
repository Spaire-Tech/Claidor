import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

/**
 * Agents' pictures (the founder, 12 October 2026: faces, no more
 * butterflies). Every agent shows a picture: a face from the catalogue,
 * drawn from the app's own copy (SimeonCore's Faces), or a picture of its
 * own, decoded once from the roster. Drawn in a circle, the picture whole:
 * it fills the circle and is zoomed no further. Pictures stay still.
 */
enum AgentPictures {
  /** The picture, decoded once: a row asks again on every redraw, and an agent's own picture is tens of kilobytes of text. One that cannot be decoded is remembered too. */
  @MainActor static func image(_ source: AgentPictureSource?) -> UIImage? {
    guard let source else { return nil }
    if let known = decoded[source.key] { return known }
    let image: UIImage?
    switch source {
    case .face(let face):
      image = AgentFaces.data(face).flatMap(UIImage.init(data:))
    case .own(let dataURL, _):
      image = dataURL.firstIndex(of: ",").flatMap { comma in Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) }.flatMap(UIImage.init(data:))
    }
    if decoded.count > 200 { decoded.removeAll() }
    decoded[source.key] = .some(image)
    return image
  }

  @MainActor private static var decoded: [String: UIImage?] = [:]

  /** An agent's picture (`Agent.picture`); a group's only when it has one of its own. */
  @MainActor static func image(of agent: Agent) -> UIImage? {
    if agent.isGroup {
      guard let url = agent.avatarDataURL, url.hasPrefix("data:image") else { return nil }
      return image(.own(dataURL: url, key: agent.avatarVersion ?? "g|\(agent.id)|\(url.utf8.count)"))
    }
    return image(agent.picture)
  }

  /** A face from the catalogue, for the editor's grid and the first run's seats. */
  @MainActor static func image(_ face: AgentFace) -> UIImage? { image(.face(face)) }

  /**
   * A group's members as one image, drawn once per members, size and theme:
   * in a list row the Mac's cluster (GroupLayout), in the chat's header side
   * by side at steps of 12.5/20; each later member drawn on top, the one
   * behind cut away around it with a small gap.
   */
  @MainActor static func groupImage(_ members: [Agent], frame: CGFloat, inRow: Bool) -> UIImage {
    let overflow = !inRow && members.count > 4
    let shown = inRow || overflow ? Array(members.prefix(3)) : members
    let key = "g|\(inRow)|\(Int(frame))|" + shown.map { $0.picture?.key ?? $0.id }.joined(separator: ",") + "|\(overflow)"
    if let made = groups[key] { return made }
    guard frame >= 1 else { return UIImage() }
    let step = frame * 12.5 / 20
    let slots: [CGRect] = inRow
      ? shown.indices.map { CGRect(x: step * CGFloat($0), y: 0, width: frame, height: frame) }
      : GroupLayout.slots(count: shown.count + (overflow ? 1 : 0), frame: frame).map { CGRect(x: $0.x, y: $0.y, width: $0.size, height: $0.size) }
    let gap: CGFloat = inRow ? frame * 2.5 / 20 : CGFloat(GroupLayout.gap(frame: frame))
    let size = inRow ? CGSize(width: frame + step * CGFloat(max(shown.count - 1, 0)), height: frame) : CGSize(width: frame, height: frame)
    let image = UIGraphicsImageRenderer(size: size, format: .preferred()).image { context in
      let cg = context.cgContext
      for (index, member) in shown.enumerated() {
        let rect = slots[index]
        if index > 0 {
          // What is drawn behind is cleared under this member and a gap around it.
          cg.saveGState()
          cg.setBlendMode(.clear)
          cg.fillEllipse(in: rect.insetBy(dx: -gap, dy: -gap))
          cg.restoreGState()
        }
        cg.saveGState()
        cg.addEllipse(in: rect)
        cg.clip()
        if let picture = image(of: member) {
          picture.draw(in: rect)
        } else {
          cg.setFillColor(UIColor.secondarySystemFill.cgColor)
          cg.fill(rect)
        }
        cg.restoreGState()
      }
    }
    if groups.count > 300 { groups.removeAll() }
    groups[key] = image
    return image
  }

  @MainActor private static var groups: [String: UIImage] = [:]
}

/** A picture in a circle; a quiet disc while none is to hand. */
struct PictureCircle: View {
  let image: UIImage?

  var body: some View {
    if let image {
      Image(uiImage: image).resizable().interpolation(.high).scaledToFill().clipShape(Circle())
        .accessibilityHidden(true)
    } else {
      Circle().fill(Ink.pillButton)
    }
  }
}

/** An agent's picture: its face or its own picture; a group is its own picture, else its members' together. */
struct AgentAvatar: View {
  let agent: Agent
  var members: [Agent] = []
  /** In the chat's header the members stand side by side; in a list row they cluster. */
  var groupInARow = false

  var body: some View {
    if agent.isGroup, AgentPictures.image(of: agent) == nil {
      let shown = members.isEmpty ? [agent] : members
      if groupInARow { GroupStack(members: shown) } else { GroupCluster(members: shown) }
    } else {
      PictureCircle(image: AgentPictures.image(of: agent))
    }
  }
}

/** An agent this app knows only by its id (a member of someone else's room, a card's party): its picture when the roster has it, else a face its id picks. */
struct AgentIdAvatar: View {
  let id: String
  @Environment(AppStore.self) private var store

  var body: some View {
    if let agent = store.agent(id) {
      AgentAvatar(agent: agent, members: store.members(of: agent))
    } else {
      PictureCircle(image: AgentPictures.image(AgentFaces.stand(forId: id).map(AgentPictureSource.face)))
    }
  }
}

/**
 * A group in a list row (`OOt`, `mnt`): two members at 2/3 of the square,
 * three at 5/9 (one above two), four in a grid, more as three and "+N";
 * each later member drawn on top, the ones behind cut out around it.
 */
struct GroupCluster: View {
  let members: [Agent]

  var body: some View {
    GeometryReader { geometry in
      let frame = min(geometry.size.width, geometry.size.height)
      let overflow = members.count > 4
      ZStack(alignment: .topLeading) {
        Image(uiImage: AgentPictures.groupImage(members, frame: frame, inRow: false))
          .resizable().frame(width: frame, height: frame)
        if overflow, let slot = GroupLayout.slots(count: 4, frame: frame).last {
          Text("+\(members.count - 3)")
            .font(.system(size: slot.size * 0.34, weight: .semibold))
            .foregroundStyle(Ink.secondary)
            .frame(width: slot.size, height: slot.size)
            .background(Ink.bubbleTheirs, in: Circle())
            .offset(x: slot.x, y: slot.y)
        }
      }
      .frame(width: frame, height: frame)
    }
  }
}

/**
 * A group in the chat's header (`fnt`): the members side by side at 20 px
 * steps of 12.5, each cut by its right neighbour and a 2.5 px gap, the
 * stack zoomed x2.6 (52 pt members).
 */
struct GroupStack: View {
  let members: [Agent]
  var memberSize: Double = 52

  var body: some View {
    let image = AgentPictures.groupImage(members, frame: memberSize, inRow: true)
    Image(uiImage: image).resizable().frame(width: image.size.width, height: image.size.height)
  }
}

/**
 * An agent at work, still (the founder, 12 October 2026: no animation): its
 * picture with three dots beside it, as the Mac's working badge.
 */
struct WorkingDots: View {
  var size: CGFloat = 5
  var body: some View {
    HStack(spacing: size * 0.8) {
      ForEach(0..<3, id: \.self) { _ in Circle().fill(Ink.secondary).frame(width: size, height: size) }
    }
    .padding(.horizontal, size * 1.6).padding(.vertical, size * 1.4)
    .background(Ink.bubbleTheirs, in: Capsule())
    .accessibilityHidden(true)
  }
}

/** The account button's letters in a disc ("BF"). */
struct Initials: View {
  let letters: String
  var size: Double = 36

  var body: some View {
    Text(letters.isEmpty ? "?" : letters)
      .font(.system(size: size * 0.4, weight: .semibold))
      .foregroundStyle(Ink.primary)
      .frame(width: size, height: size)
  }
}
