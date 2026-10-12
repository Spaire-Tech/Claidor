import AppKit
import SwiftUI
import SimeonCore

/**
 * Agents' pictures (the founder, 12 October 2026: faces, no more
 * butterflies). Every agent shows a picture: a face from the catalogue,
 * drawn from the app's own copy (SimeonCore's Faces), or a picture of its
 * own, read once from the roster. Drawn in a circle, the picture whole: it
 * fills the circle and is zoomed no further. Pictures stay still.
 */
@MainActor
enum AvatarPictures {
  private static var cache: [String: NSImage?] = [:]

  /** The picture, read once (a face by its id, an agent's own by its short key). One that cannot be read is remembered too. */
  static func image(_ source: AgentPictureSource?) -> NSImage? {
    guard let source else { return nil }
    if let known = cache[source.key] { return known }
    let image: NSImage?
    switch source {
    case .face(let face):
      image = AgentFaces.data(face).flatMap(NSImage.init(data:))
    case .own(let dataURL, _):
      image = dataURL.firstIndex(of: ",").flatMap { comma in Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) }.flatMap(NSImage.init(data:))
    }
    if cache.count > 200 { cache.removeAll() }
    cache[source.key] = .some(image)
    return image
  }

  /** A face from the catalogue: the editor's grid, the first run's seats. */
  static func image(_ face: AgentFace) -> NSImage? { image(.face(face)) }

  /** An agent's picture (`Agent.picture`); a group's only when it has one of its own. */
  static func image(for agent: Agent) -> NSImage? {
    if agent.isGroup {
      guard let url = agent.avatarDataURL, url.hasPrefix("data:image") else { return nil }
      return image(.own(dataURL: url, key: agent.avatarVersion ?? "g|\(agent.id)|\(url.utf8.count)"))
    }
    return image(agent.picture)
  }

  /** An agent known only by its id (a member of someone else's room): a face its id picks. */
  static func image(forId id: String) -> NSImage? {
    image(AgentFaces.stand(forId: id).map(AgentPictureSource.face))
  }
}

/**
 * A group's avatar (`sand-group-avatar`): its first members in the square,
 * three as a pyramid at 5/9 of it, each later one cutting a circle and a
 * small gap into the ones behind (SimeonCore's `GroupLayout`). Past four
 * members, three and "+N" (`OOt`).
 */
struct GroupMark: View {
  let members: [MarkMember]
  var size: CGFloat = 36
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Canvas { context, canvas in
      let frame = Double(min(canvas.width, canvas.height))
      let shown = members.count > 4 ? Array(members.prefix(3)) + [.more(members.count - 3)] : members
      let slots = GroupLayout.slots(count: shown.count, frame: frame)
      let gap = GroupLayout.gap(frame: frame)
      for (index, member) in shown.enumerated() where index < slots.count {
        let slot = slots[index]
        let rect = CGRect(x: slot.x, y: slot.y, width: slot.size, height: slot.size)
        // The later member's circle, widened by the gap, cleared out of those already drawn.
        if index > 0 { MarkDrawing.cut(&context, in: rect, gap: gap) }
        MarkDrawing.draw(&context, member, in: rect, dark: scheme == .dark, moreFont: rect.width * 0.34)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/**
 * A group's avatar of 20 points or less with two members or more, the chat
 * head's group (drawn at 20 and zoomed by the window, so 52 here), and the
 * exchange chip's agents (`fnt`): the members in a row at `unit` each, each
 * overlapping the next by 6/16 of it, each later one cutting its circle and
 * a 2/16 gap out of the one before. Counted, past four it is three and
 * "+N"; elided (the chip), the first three.
 */
struct MarkRow: View {
  let members: [MarkMember]
  var unit: CGFloat = 16
  var counted = true
  @Environment(\.colorScheme) private var scheme

  static func shown(_ members: [MarkMember], counted: Bool) -> [MarkMember] {
    guard counted else { return Array(members.prefix(3)) }
    return members.count <= 4 ? members : Array(members.prefix(3)) + [.more(members.count - 3)]
  }

  var body: some View {
    let shown = MarkRow.shown(members, counted: counted)
    let step = unit * 10 / 16
    Canvas { context, _ in
      for (index, member) in shown.enumerated() {
        let rect = CGRect(x: CGFloat(index) * step, y: 0, width: unit, height: unit)
        if index > 0 { MarkDrawing.cut(&context, in: rect, gap: unit * 2 / 16) }
        MarkDrawing.draw(&context, member, in: rect, dark: scheme == .dark, moreFont: unit * 14 / 36)
      }
    }
    .frame(width: shown.isEmpty ? 0 : unit + CGFloat(shown.count - 1) * step, height: unit)
    .accessibilityHidden(true)
  }
}

/** One place in a group's avatar: a member's picture, or "+N" for the rest (`MOt`). */
@MainActor
enum MarkMember {
  case picture(NSImage)
  case blank
  case more(Int)

  static func of(_ agent: Agent) -> MarkMember {
    AvatarPictures.image(for: agent).map(MarkMember.picture) ?? .blank
  }

  /** An agent known only by its id: a face its id picks. */
  static func of(id: String) -> MarkMember {
    AvatarPictures.image(forId: id).map(MarkMember.picture) ?? .blank
  }

  /** A group's members as its avatar shows them, in the group's order. */
  static func members(of group: Agent, in agents: [Agent]) -> [MarkMember] {
    group.memberIds.compactMap { id in agents.first { $0.id == id } }.map { of($0) }
  }
}

/** How a member is drawn in a group's avatar, and what it cuts from those behind it. */
enum MarkDrawing {
  /** A picture's edge (`--sand-border-weak`): 10 % of the ink, so it darkens the rim in light and lightens it in dark. */
  static func edge(dark: Bool) -> Color { (dark ? Color(hex: 0xfcfcfc) : Color(hex: 0x141414)).opacity(0.1) }

  static func draw(_ context: inout GraphicsContext, _ member: MarkMember, in rect: CGRect, dark: Bool, moreFont: CGFloat) {
    switch member {
    case .picture(let image):
      // `object-fit: cover` in the circle, then the half-point edge inside it.
      var clipped = context
      clipped.clip(to: Path(ellipseIn: rect))
      clipped.draw(Image(nsImage: image), in: cover(image.size, in: rect))
      context.stroke(Path(ellipseIn: rect.insetBy(dx: 0.25, dy: 0.25)), with: .color(edge(dark: dark)), lineWidth: 0.5)
    case .blank:
      context.fill(Path(ellipseIn: rect), with: .color(Color(hex: 0x777777).opacity(dark ? 0.173 : 0.09)))
    case .more(let count):
      // The faint disc (`--sand-fill-neutral-subtle`) with the count in the neutral text, no edge.
      context.fill(Path(ellipseIn: rect), with: .color(Color(hex: 0x777777).opacity(dark ? 0.173 : 0.09)))
      let words = Text("+\(count)").font(.system(size: moreFont, weight: .medium)).foregroundColor(dark ? Color(hex: 0xc2c2c2) : Color(hex: 0x3d3d3d))
      context.draw(words, at: CGPoint(x: rect.midX, y: rect.midY))
    }
  }

  /** A later member's circle widened by the gap, cleared from those already drawn. */
  static func cut(_ context: inout GraphicsContext, in rect: CGRect, gap: CGFloat) {
    var eraser = context
    eraser.blendMode = .clear
    eraser.fill(Path(ellipseIn: rect.insetBy(dx: -gap, dy: -gap)), with: .color(.black))
  }

  /** The rectangle a picture of this size fills `rect` with, cropped to its middle. */
  static func cover(_ size: CGSize, in rect: CGRect) -> CGRect {
    guard size.width > 0, size.height > 0 else { return rect }
    let scale = max(rect.width / size.width, rect.height / size.height)
    let width = size.width * scale, height = size.height * scale
    return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
  }
}

/**
 * A picture (`au` with its picture): round, filling the circle, a
 * half-point edge at 10 % of the ink over it, nothing behind it. It never
 * moves, and shows the same in every place; a quiet disc while none is to
 * hand.
 */
struct AgentPicture: View {
  let image: NSImage?
  var size: CGFloat = 36
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Group {
      if let image {
        Image(nsImage: image)
          .resizable()
          .interpolation(.high)
          .scaledToFill()
      } else {
        Color(hex: 0x777777).opacity(scheme == .dark ? 0.173 : 0.09)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().strokeBorder(MarkDrawing.edge(dark: scheme == .dark), lineWidth: 0.5))
    .accessibilityHidden(true)
  }
}

/**
 * An agent's avatar: its picture (a group's own too: `gct` looks at the
 * picture first), else a group's members (a row at 20 or less, or where
 * asked: the chat's head).
 */
struct AgentMark: View {
  let agent: Agent
  let agents: [Agent]
  var size: CGFloat = 36
  /** A group as its row of members at `size` each, whatever the size (the chat's head). */
  var groupRow = false

  var body: some View {
    if agent.isGroup, AvatarPictures.image(for: agent) == nil {
      let members = MarkMember.members(of: agent, in: agents)
      if members.count > 1 && (groupRow || size <= 20) {
        MarkRow(members: members, unit: size)
      } else {
        GroupMark(members: members, size: size)
      }
    } else {
      AgentPicture(image: AvatarPictures.image(for: agent), size: size)
    }
  }
}

/** An agent this app may know only by its id: its avatar when the roster has it, else a face its id picks. */
struct AgentIdMark: View {
  let id: String
  let agents: [Agent]
  var size: CGFloat = 36

  var body: some View {
    if let agent = agents.first(where: { $0.id == id }) {
      AgentMark(agent: agent, agents: agents, size: size)
    } else {
      AgentPicture(image: AvatarPictures.image(forId: id), size: size)
    }
  }
}
