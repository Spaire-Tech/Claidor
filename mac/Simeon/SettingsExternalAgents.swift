import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings › External Agents (11 November 2026, the founder, with another
 * app's Bots and Channels pages as the references: "i want the bots to have
 * their own setting called External Agents"; "use the design layout of
 * screenshot 4. With simeon in the middle, and muse bots dots around it. the
 * background is our website background grey. you're here will become Learn
 * more"; "there is a setting and a last used… the setting is just
 * disconnect"). SimeonCore's `ExternalAgents` holds what it shows; the
 * server says what is connected (`server/simeon/desktop/external_agents.py`).
 *
 * A card that says in a line what the page is, with Learn more (the docs)
 * and its picture; then the bots in one group, no title over it: a connected
 * one with "Last used …" and the gear whose one item is Disconnect, one not
 * connected yet with its line and +; then Add, for any other bot.
 */
struct SettingsExternalAgentsPage: View {
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model: ExternalAgentsModel?
  /** The bot whose sheet is open (its kind), or `ExternalAgentsPage.any` for Add. */
  @State private var adding: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      ExternalAgentsHero(look: look)
      SettingsGroup(look: look) {
        ForEach(Array((model?.rows ?? ExternalAgents.rows([])).enumerated()), id: \.element.id) { index, row in
          MacExternalAgentLine(row: row, divided: index > 0, look: look) {
            adding = row.id
          } disconnect: {
            askToDisconnect(row)
          }
        }
        MacAddAnyBotLine(look: look) { adding = ExternalAgentsPage.any }
      }
      if let problem = model?.problem {
        Text(problem)
          .font(PanelType.detail)
          .foregroundStyle(look.danger)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 8)
      }
    }
    .sheet(isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } })) {
      MacAddBotSheet(bot: adding ?? ExternalAgentsPage.any)
    }
    .onChange(of: adding) { _, now in
      // A bot let in while its sheet was open shows as connected once it closes.
      if now == nil, let model { Task { await model.load() } }
    }
    .task {
      let model = model ?? ExternalAgentsModel(store: store)
      self.model = model
      await model.load()
    }
  }

  private func askToDisconnect(_ row: ExternalAgents.Row) {
    guard let model else { return }
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = ExternalAgents.disconnectTitle(row.name)
    alert.informativeText = ExternalAgents.disconnectLine
    alert.addButton(withTitle: String(localized: "Disconnect")).hasDestructiveAction = true
    alert.addButton(withTitle: String(localized: "Cancel")).keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      Task { await model.disconnect(row.id) }
    }
  }
}

enum ExternalAgentsPage {
  /** Add, for any other bot: the sheet shows Simeon's mark and "Add a bot". */
  static let any = "any"
}

/**
 * The page's card, laid out as the reference's (Channels' "Reason for
 * Mac"): the groups' own grey, round 16 (11 November 2026, the founder: "the
 * box is white. and below is grey. it shouldnt be white. make it grey like
 * below"), its words on the left (a line at 15, what it does at 13 in grey,
 * Learn more in a grey capsule at its foot), the picture on the right, on
 * the same grey.
 */
private struct ExternalAgentsHero: View {
  let look: Look
  @Environment(\.openURL) private var openURL
  @State private var hovering = false

  var body: some View {
    HStack(alignment: .top, spacing: 24) {
      VStack(alignment: .leading, spacing: 8) {
        Text(ExternalAgents.headline)
          .font(.system(size: 15))
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
        Text(ExternalAgents.explanation)
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
          .lineSpacing(2)
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 14)
        Button { openURL(ExternalAgents.learnMore) } label: {
          Text("Learn more")
            .font(.system(size: 13))
            .foregroundStyle(look.ink)
            .padding(.horizontal, 14)
            .frame(height: 30)
            .background(look.ink.opacity(hovering ? 0.1 : 0.06), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.hand)
        .onHover { hovering = $0 }
      }
      .padding(.vertical, 8)
      .padding(.leading, 4)
      .frame(maxWidth: .infinity, alignment: .leading)
      ExternalAgentsPicture(look: look)
        .frame(width: ExternalAgents.Picture.width, height: ExternalAgents.Picture.height)
    }
    .padding(14)
    .background(RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).fill(look.groupedRow))
  }
}

/**
 * The card's picture (SimeonCore's `ExternalAgents.Picture`): Simeon's own
 * face in the middle, Grok Bot, Muse and Dots the same size around him,
 * each joined to him by a line, on the card's grey.
 */
struct ExternalAgentsPicture: View {
  let look: Look
  typealias P = ExternalAgents.Picture

  var body: some View {
    ZStack {
      ZStack {
        Path { path in
          path.addEllipse(in: CGRect(x: P.centerX - P.radius, y: P.centerY - P.radius, width: P.radius * 2, height: P.radius * 2))
          for bot in P.bots {
            path.move(to: CGPoint(x: P.centerX, y: P.centerY))
            path.addLine(to: CGPoint(x: bot.x, y: bot.y))
          }
        }
        .stroke(look.ink.opacity(0.1), lineWidth: 1)
        ForEach(P.bots, id: \.icon) { bot in
          MacProviderIcon(provider: bot.icon, look: look, side: P.bot)
            .shadow(color: .black.opacity(0.12), radius: 3, x: 0, y: 2)
            .position(x: bot.x, y: bot.y)
        }
        simeon
          .position(x: P.centerX, y: P.centerY)
      }
      .frame(width: P.width, height: P.height)
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .accessibilityElement()
    .accessibilityLabel("Simeon with Grok Bot, Muse and Dots")
  }

  /** His face, round, on his own backdrop, a white ring of 3 and a soft shadow. */
  private var simeon: some View {
    let face = AgentFaces.simeon
    return ZStack {
      Circle().fill(face?.backdrop.map { Color(red: $0.r, green: $0.g, blue: $0.b) } ?? Color(hex: 0x89acbc))
      if let face, let image = AvatarPictures.image(face) {
        Image(nsImage: image)
          .resizable()
          .scaledToFill()
          .scaleEffect(P.simeonZoom)
          .offset(y: P.simeonLower * P.simeon)
      }
    }
    .frame(width: P.simeon, height: P.simeon)
    .clipShape(Circle())
    .overlay { Circle().strokeBorder(Color.white, lineWidth: 3).padding(-3) }
    .shadow(color: .black.opacity(0.16), radius: 9, x: 0, y: 6)
  }
}

/**
 * A bot's row (the reference's): its mascot, its name over "Last used Nov
 * 10, 2026" once connected (the gear at its end, whose one item is
 * Disconnect), else over its line, with + at its end.
 */
private struct MacExternalAgentLine: View {
  let row: ExternalAgents.Row
  let divided: Bool
  let look: Look
  let add: () -> Void
  let disconnect: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      if let icon = row.icon {
        MacProviderIcon(provider: icon, look: look, side: 28)
      } else {
        AppLogoTile(name: row.name, look: look, side: 28)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: row.name).font(PanelType.row).foregroundStyle(look.ink).lineLimit(1)
        if let words = row.connected?.lastUsedWords() ?? row.line {
          Text(words).font(PanelType.detail).foregroundStyle(look.inkSecondary).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if row.connected != nil {
        Menu {
          Button("Disconnect", role: .destructive, action: disconnect)
        } label: {
          Image(systemName: "gearshape")
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(look.dark ? Color.white.opacity(0.86) : Color.black.opacity(0.78))
            .frame(width: 32, height: 32)
            .contentShape(Circle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .liquidGlass(in: .circle)
        .handCursor()
        .help(String(localized: "Settings"))
        .accessibilityLabel(String(localized: "Settings"))
      } else {
        GlassDiscButton(symbol: "plus", help: row.name, size: 32, action: add)
      }
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, 10)
    .frame(minHeight: SettingsRowSize.minHeight)
    .overlay(alignment: .top) { if divided { SettingsDivider(look: look) } }
  }
}

/** The group's last row (the reference's): a + and "Add" in grey, for any other bot. */
private struct MacAddAnyBotLine: View {
  let look: Look
  let add: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: add) {
      HStack(spacing: 12) {
        Image(systemName: "plus")
          .font(.system(size: 14))
          .frame(width: 28, height: 28)
        Spacer(minLength: 0)
        Text("Add").font(PanelType.row)
      }
      .foregroundStyle(hovered ? look.ink : look.inkSecondary)
      .padding(.horizontal, SettingsRowSize.inset)
      .frame(minHeight: SettingsRowSize.minHeight)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .overlay(alignment: .top) { SettingsDivider(look: look) }
  }
}

/**
 * The account menu's rows with something at their right (11 November 2026,
 * the founder: "look at where the usage is and where the icons are? make
 * it proportionate and can the icons look better than this? like connect
 * apps icons. with a dark mode as well"; "that whole menu should be bigger
 * and taller. not crazily tho"). The menu's words at 16 (Apple's own are
 * 14), and each row's right-hand part at one right tab, so Weekly usage's
 * figure and External Agents' mascots end on the same line. The figure is
 * a grey capsule as Apple's badge is; the mascots are Connect apps' tiles
 * (the sidebar's `LogoTile`): white, or #2c2c2e on dark, a hairline and a
 * soft shadow, the first turned 7° left, the last 7° right, each over the
 * last by 4. Titles with a right tab, so each row keeps the menu's own
 * highlight.
 */
enum AccountMenuRows {
  /** The menu's words. */
  static let font = NSFont.menuFont(ofSize: 16)
  /** Where each row's right-hand part ends, from where its words start. */
  static let end: CGFloat = 236

  /** A row's words, and `part` at its right, ending at `end`. */
  static func title(_ words: String, part: NSImage?) -> NSAttributedString {
    let style = NSMutableParagraphStyle()
    style.tabStops = [NSTextTab(textAlignment: .right, location: end)]
    let title = NSMutableAttributedString(string: words, attributes: [.font: font, .paragraphStyle: style])
    if let part {
      title.append(NSAttributedString(string: "\t", attributes: [.font: font, .paragraphStyle: style]))
      let attachment = NSTextAttachment()
      attachment.image = part
      attachment.bounds = CGRect(x: 0, y: (font.capHeight - part.size.height) / 2, width: part.size.width, height: part.size.height)
      title.append(NSAttributedString(attachment: attachment))
      title.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: title.length))
    }
    return title
  }

  /** Weekly usage's figure ("55%"): 13, in a grey capsule 20 high, 8 in, as Apple's badge. */
  static func figure(_ text: String) -> NSImage {
    let words = NSAttributedString(string: text, attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .medium)])
    let size = NSSize(width: ceil(words.size().width) + 16, height: 20)
    return NSImage(size: size, flipped: false) { rect in
      let dark = NSAppearance.currentDrawing().bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
      (dark ? NSColor.white.withAlphaComponent(0.14) : NSColor.black.withAlphaComponent(0.07)).setFill()
      NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()
      let ink = dark ? NSColor.white.withAlphaComponent(0.85) : NSColor.black.withAlphaComponent(0.72)
      let shown = NSAttributedString(string: text, attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .medium), .foregroundColor: ink])
      let spot = shown.size()
      shown.draw(at: NSPoint(x: (rect.width - spot.width) / 2, y: (rect.height - spot.height) / 2))
      return true
    }
  }

  /** The bots' mascots on Connect apps' tiles: 17 each (the row's words' height, so the row is no taller than the others), round 4.5, the mascot cut out on its tile. */
  static func mascots() -> NSImage? {
    let images = ExternalAgents.menuIcons.compactMap { NSImage(named: "Mascots/\($0)") }
    guard images.count == ExternalAgents.menuIcons.count else { return nil }
    let side: CGFloat = 17
    let step: CGFloat = side - 4
    let turns: [CGFloat] = [-7, 0, 7]
    // Room for the turned corners and the shadow on every side.
    let margin: CGFloat = 1.5
    let size = NSSize(width: step * CGFloat(images.count - 1) + side + margin * 2, height: side + margin * 2)
    return NSImage(size: size, flipped: false) { _ in
      let dark = NSAppearance.currentDrawing().bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
      for (index, image) in images.enumerated() {
        let tile = NSRect(x: margin + step * CGFloat(index), y: margin, width: side, height: side)
        NSGraphicsContext.saveGraphicsState()
        let turn = NSAffineTransform()
        turn.translateX(by: tile.midX, yBy: tile.midY)
        turn.rotate(byDegrees: -turns[index % turns.count])
        turn.translateX(by: -tile.midX, yBy: -tile.midY)
        turn.concat()
        let shape = NSBezierPath(roundedRect: tile, xRadius: 4.5, yRadius: 4.5)
        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = dark ? NSColor.black.withAlphaComponent(0.45) : NSColor.black.withAlphaComponent(0.10)
        shadow.shadowOffset = NSSize(width: 0, height: -1)
        shadow.shadowBlurRadius = 1.5
        shadow.set()
        (dark ? NSColor(red: 0x2c / 255, green: 0x2c / 255, blue: 0x2e / 255, alpha: 1) : NSColor.white).setFill()
        shape.fill()
        NSGraphicsContext.restoreGraphicsState()
        NSGraphicsContext.saveGraphicsState()
        shape.addClip()
        image.draw(in: tile)
        NSGraphicsContext.restoreGraphicsState()
        (dark ? NSColor.white.withAlphaComponent(0.10) : NSColor.black.withAlphaComponent(0.08)).setStroke()
        let edge = NSBezierPath(roundedRect: tile.insetBy(dx: -0.25, dy: -0.25), xRadius: 4.75, yRadius: 4.75)
        edge.lineWidth = 0.5
        edge.stroke()
        NSGraphicsContext.restoreGraphicsState()
      }
      return true
    }
  }
}
