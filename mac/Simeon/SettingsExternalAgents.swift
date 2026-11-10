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
 * Mac"): white, round 16 with a line at 8%, its words on the left (a line
 * at 15, what it does at 13 in grey, Learn more in a grey capsule at its
 * foot), the picture on the right.
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
    .background(RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).fill(look.groupedGround))
    .overlay {
      RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).strokeBorder(look.ink.opacity(0.08), lineWidth: 1)
    }
  }
}

/**
 * The card's picture (SimeonCore's `ExternalAgents.Picture`): Simeon's own
 * face in the middle, Grok Bot, Muse and Dots the same size around him,
 * each joined to him by a line, on the website's grey (`--soft`, #f5f5f7;
 * #1c1c1e on dark).
 */
struct ExternalAgentsPicture: View {
  let look: Look
  typealias P = ExternalAgents.Picture

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(look.dark ? Color(hex: 0x1c1c1e) : Color(hex: 0xf5f5f7))
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
          .scaleEffect(1.6, anchor: UnitPoint(x: 0.5, y: 0.32))
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
 * The account menu's row (the reference's "Reason with" and its icons):
 * "External Agents", the bots' mascots at its right, overlapping a little.
 * A title with a right tab, so the row keeps the menu's own highlight.
 */
enum ExternalAgentsMenuRow {
  static func title(width: CGFloat) -> NSAttributedString {
    let style = NSMutableParagraphStyle()
    style.tabStops = [NSTextTab(textAlignment: .right, location: width)]
    let font = NSFont.menuFont(ofSize: 0)
    let title = NSMutableAttributedString(
      string: String(localized: "External Agents") + "\t",
      attributes: [.font: font, .paragraphStyle: style]
    )
    if let icons = icons() {
      let attachment = NSTextAttachment()
      attachment.image = icons
      attachment.bounds = CGRect(x: 0, y: (font.capHeight - icons.size.height) / 2, width: icons.size.width, height: icons.size.height)
      title.append(NSAttributedString(attachment: attachment))
      title.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: title.length))
    }
    return title
  }

  /** The mascots side by side, 16 each, each over the last by 3, each round 4. */
  private static func icons() -> NSImage? {
    let images = ExternalAgents.menuIcons.compactMap { NSImage(named: "Providers/\($0)") }
    guard !images.isEmpty else { return nil }
    let side: CGFloat = 16
    let step: CGFloat = side - 3
    let size = NSSize(width: step * CGFloat(images.count - 1) + side, height: side)
    return NSImage(size: size, flipped: false) { _ in
      for (index, image) in images.enumerated() {
        let rect = NSRect(x: step * CGFloat(index), y: 0, width: side, height: side)
        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(roundedRect: rect, xRadius: 4, yRadius: 4).addClip()
        image.draw(in: rect)
        NSGraphicsContext.restoreGraphicsState()
      }
      return true
    }
  }
}
