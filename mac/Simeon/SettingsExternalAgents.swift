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
        .frame(width: 320, height: 180)
    }
    .padding(14)
    .background(RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).fill(look.groupedGround))
    .overlay {
      RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).strokeBorder(look.ink.opacity(0.08), lineWidth: 1)
    }
  }
}

/**
 * The card's picture: Simeon's tile in the middle, Muse, Grok Bot and Dots
 * around it on a faint orbit, on the website's grey (`--soft`, #f5f5f7;
 * #1c1c1e on dark). Simeon's tile stays white, as an app's icon does.
 */
struct ExternalAgentsPicture: View {
  let look: Look

  var body: some View {
    GeometryReader { geometry in
      let width = geometry.size.width
      let height = geometry.size.height
      let center = CGPoint(x: width / 2, y: height / 2)
      let radiusX = min(width * 0.31, 100.0)
      let radiusY = min(height * 0.34, 60.0)
      ZStack {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(look.dark ? Color(hex: 0x1c1c1e) : Color(hex: 0xf5f5f7))
        Ellipse()
          .stroke(look.ink.opacity(0.12), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
          .frame(width: radiusX * 2, height: radiusY * 2)
          .position(center)
        mascot("grokbot", angle: 90, center: center, radiusX: radiusX, radiusY: radiusY, tilt: 6)
        mascot("muse", angle: 210, center: center, radiusX: radiusX, radiusY: radiusY, tilt: -8)
        mascot("dots", angle: 330, center: center, radiusX: radiusX, radiusY: radiusY, tilt: 8)
        Image("Providers/simeon-mark")
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: 34, height: 34)
          .foregroundStyle(Color(hex: 0x0d0d0d))
          .frame(width: 72, height: 72)
          .background(Color.white, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
          .overlay { RoundedRectangle(cornerRadius: 17, style: .continuous).strokeBorder(Color.black.opacity(0.08), lineWidth: 0.5) }
          .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 6)
          .position(center)
      }
    }
    .accessibilityElement()
    .accessibilityLabel("Simeon with Grok Bot, Muse and Dots")
  }

  /** A mascot on the orbit, at `angle` degrees (0 at the right, 90 at the top). */
  private func mascot(_ icon: String, angle: Double, center: CGPoint, radiusX: CGFloat, radiusY: CGFloat, tilt: Double) -> some View {
    let radians = angle * .pi / 180
    let point = CGPoint(x: center.x + radiusX * CGFloat(cos(radians)), y: center.y - radiusY * CGFloat(sin(radians)))
    return MacProviderIcon(provider: icon, look: look, side: 44)
      .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 3)
      .rotationEffect(.degrees(tilt))
      .position(point)
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
