import SimeonCore
import SwiftUI

/**
 * Settings › External Agents (11 November 2026, the founder, with another
 * app's Bots and Channels pages as the references: "i want the bots to have
 * their own setting called External Agents"; "use the design layout of
 * screenshot 4. With simeon in the middle, and muse bots dots around it. the
 * background is our website background grey. you're here will become Learn
 * more"; "there is a setting and a last used… the setting is just
 * disconnect"). The Mac's page (mac/Simeon/SettingsExternalAgents.swift)
 * and the web app's say the same; SimeonCore's `ExternalAgents` holds what
 * it shows, the server says what is connected.
 *
 * On a phone the card stands its picture over its words: Simeon among the
 * bots on the website's grey, then the line, what it does and Learn more
 * at the right.
 * Then the bots: a connected one with "Last used …" and a gear whose one
 * item is Disconnect, one not connected yet with its line and +; then Add,
 * for any other bot. Each bot's mascot on Connect apps' tile (`BotIcon`),
 * white or #2c2c2e on dark (11 November 2026, the founder: "the tab in dark
 * mode should not have these white background"); Claude Code and Codex
 * with the founder's mascots, their sheets showing the ways to connect them.
 */
struct ExternalAgentsPage: View {
  @Environment(SimeonCore.AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var model: ExternalAgentsModel?
  /** The bot whose sheet is open (its kind), or `ExternalAgentsPage.any` for Add. */
  @State private var adding: String?
  @State private var disconnecting: ExternalAgents.Row?

  /** Add, for any other bot: the sheet shows Simeon's mark and "Add a bot". */
  static let any = "any"

  var body: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: 10) {
          ExternalAgentsPicture()
            .padding(.bottom, 6)
          Text(ExternalAgents.headline)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Ink.primary)
            .fixedSize(horizontal: false, vertical: true)
          Text(ExternalAgents.explanation)
            .font(.system(size: 15))
            .foregroundStyle(Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
          Button { openURL(ExternalAgents.learnMore) } label: {
            Text("Learn more")
              .font(.system(size: 15))
              .foregroundStyle(Ink.primary)
              .padding(.horizontal, 16)
              .frame(height: 34)
              .background(Ink.pillButton, in: Capsule())
          }
          .buttonStyle(.borderless)
          // On the right, under the words (11 November 2026, the founder: "learn more in iphone should be on the right").
          .frame(maxWidth: .infinity, alignment: .trailing)
          .padding(.top, 4)
        }
        .padding(.vertical, 8)
      }
      .listRowBackground(Ink.groupedRow)
      Section {
        ForEach(model?.rows ?? ExternalAgents.rows([])) { row in
          ExternalAgentLine(row: row) {
            adding = row.id
          } disconnect: {
            disconnecting = row
          }
        }
        Button { adding = Self.any } label: {
          HStack {
            Image(systemName: "plus").font(.system(size: 17)).frame(width: 30)
            Spacer()
            Text("Add").font(.system(size: 17))
          }
          .foregroundStyle(Ink.secondary)
        }
      }
      .listRowBackground(Ink.groupedRow)
      if let problem = model?.problem {
        Section { Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger) }
          .listRowBackground(Ink.groupedRow)
      }
    }
    .groupedGround()
    .navigationTitle("External Agents")
    .inlineBarTitle()
    .sheet(isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } }), onDismiss: {
      // A bot let in while its sheet was open shows as connected once it closes.
      if let model { Task { await model.load() } }
    }) {
      PhoneAddBotSheet(bot: adding ?? Self.any)
    }
    .alert(
      disconnecting.map { ExternalAgents.disconnectTitle($0.name) } ?? "",
      isPresented: Binding(get: { disconnecting != nil }, set: { if !$0 { disconnecting = nil } })
    ) {
      Button("Disconnect", role: .destructive) {
        if let row = disconnecting, let model { Task { await model.disconnect(row.id) } }
        disconnecting = nil
      }
      Button("Cancel", role: .cancel) { disconnecting = nil }
    } message: {
      Text(ExternalAgents.disconnectLine)
    }
    .task {
      let model = model ?? ExternalAgentsModel(store: store)
      self.model = model
      await model.load()
    }
  }
}

/**
 * A bot's row (the reference's): its mascot, its name over "Last used Nov
 * 10, 2026" once connected (the gear at its end, whose one item is
 * Disconnect), else over its line, with + at its end.
 */
private struct ExternalAgentLine: View {
  let row: ExternalAgents.Row
  let add: () -> Void
  let disconnect: () -> Void

  var body: some View {
    HStack(spacing: 14) {
      BotIcon(icon: row.icon, name: row.name, size: 30)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: row.name).font(.system(size: 17)).foregroundStyle(Ink.primary).lineLimit(1)
        if let words = row.connected?.lastUsedWords() ?? row.line {
          Text(words).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      if row.connected != nil {
        Menu {
          Button("Disconnect", role: .destructive, action: disconnect)
        } label: {
          disc("gearshape")
        }
        .accessibilityLabel(Text("Settings"))
      } else {
        Button(action: add) { disc("plus") }
          .buttonStyle(.borderless)
          .accessibilityLabel(Text(verbatim: row.name))
      }
    }
    .padding(.vertical, 2)
  }

  private func disc(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(Ink.primary)
      .frame(width: 34, height: 34)
      .background(Ink.pillButton, in: Circle())
  }
}

/**
 * The card's picture (SimeonCore's `ExternalAgents.Picture`): Simeon's own
 * face in the middle, Grok Bot, Muse and Dots the same size around him,
 * each joined to him by a line, on the website's grey (`--soft`, #f5f5f7;
 * #1c1c1e on dark), as wide as the card, what it shows in its middle.
 */
private struct ExternalAgentsPicture: View {
  @Environment(\.colorScheme) private var scheme
  typealias P = ExternalAgents.Picture

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(scheme == .dark ? Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255) : Color(red: 245 / 255, green: 245 / 255, blue: 247 / 255))
      ZStack {
        Path { path in
          path.addEllipse(in: CGRect(x: P.centerX - P.radius, y: P.centerY - P.radius, width: P.radius * 2, height: P.radius * 2))
          for bot in P.bots {
            path.move(to: CGPoint(x: P.centerX, y: P.centerY))
            path.addLine(to: CGPoint(x: bot.x, y: bot.y))
          }
        }
        .stroke(Ink.primary.opacity(0.1), lineWidth: 1)
        ForEach(P.bots, id: \.icon) { bot in
          BotIcon(icon: bot.icon, name: bot.icon, size: P.bot)
            .shadow(color: .black.opacity(0.12), radius: 3, x: 0, y: 2)
            .position(x: bot.x, y: bot.y)
        }
        simeon
          .position(x: P.centerX, y: P.centerY)
      }
      .frame(width: P.width, height: P.height)
    }
    .frame(height: P.height)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .accessibilityElement()
    .accessibilityLabel(Text("Simeon with Grok Bot, Muse and Dots"))
  }

  /** His face, round, on his own backdrop, a white ring of 3 and a soft shadow. */
  private var simeon: some View {
    let face = AgentFaces.simeon
    return ZStack {
      Circle().fill(face?.backdrop.map { Color(red: $0.r, green: $0.g, blue: $0.b) } ?? Color(red: 137 / 255, green: 172 / 255, blue: 188 / 255))
      if let face, let image = AgentPictures.image(.face(face)) {
        Image(uiImage: image)
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
 * A bot's icon: its mascot cut out on Connect apps' tile (white, #2c2c2e on
 * dark, a hairline and a soft shadow), round as an app's icon; else its
 * maker's icon; else the first letter of its name.
 */
struct BotIcon: View {
  let icon: String?
  let name: String
  var size: CGFloat = 30

  var body: some View {
    if let icon, ExternalAgents.mascots.contains(icon), UIImage(named: "Mascots/\(icon)") != nil {
      let shape = RoundedRectangle(cornerRadius: size * ConnectorLogo.iconCorner, style: .continuous)
      Image("Mascots/\(icon)")
        .resizable()
        .interpolation(.high)
        .scaledToFill()
        .frame(width: size, height: size)
        .background(Ink.appsTile)
        .clipShape(shape)
        .overlay { shape.inset(by: -0.5).stroke(Ink.appsTileEdge, lineWidth: 1) }
        .shadow(color: Ink.appsTileShadow, radius: 1, x: 0, y: 1)
        .accessibilityHidden(true)
    } else if let icon {
      ProviderIcon(provider: icon, size: size)
    } else {
      Text(verbatim: String(name.prefix(1)).uppercased())
        .font(.system(size: size / 2, weight: .semibold))
        .foregroundStyle(Ink.secondary)
        .frame(width: size, height: size)
        .background(Ink.pillButton, in: RoundedRectangle(cornerRadius: size * 0.23, style: .continuous))
    }
  }
}

/**
 * Settings' External Agents row, drawn as Connect apps is (`ConnectAppsRow`;
 * 11 November 2026, the founder: "iphone design it literally like connect
 * apps. meaning blue text and the icons next to it"): the words in the
 * window's blue, medium, then Grok Bot, Muse and Dots on Connect apps'
 * tiles (white, #2c2c2e on dark, a hairline and a soft shadow), the first
 * turned 7° left, the last 7° right, each over the last by 4.5. The
 * mascots are cut out of their cream ground (`Mascots/`), so a dark tile
 * stays dark.
 */
struct ExternalAgentsRow: View {
  private static let turns: [Double] = [-7, 0, 7]

  var body: some View {
    HStack(spacing: 12) {
      Text("External Agents")
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(Ink.appsBlue)
        .fixedSize()
      HStack(spacing: -4.5) {
        ForEach(Array(ExternalAgents.menuIcons.enumerated()), id: \.element) { index, icon in
          MascotTile(icon: icon, turn: Self.turns[index % Self.turns.count])
        }
      }
      .accessibilityHidden(true)
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .contentShape(.rect)
  }

  /** One mascot on its tile: 30, round 8, the mascot over the whole tile. */
  private struct MascotTile: View {
    let icon: String
    let turn: Double

    var body: some View {
      Image("Mascots/\(icon)")
        .resizable()
        .interpolation(.high)
        .aspectRatio(contentMode: .fill)
        .frame(width: 30, height: 30)
        .background(Ink.appsTile)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).inset(by: -0.5).stroke(Ink.appsTileEdge, lineWidth: 1) }
        .shadow(color: Ink.appsTileShadow, radius: 1, x: 0, y: 1)
        .rotationEffect(.degrees(turn))
    }
  }
}
