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
 * bots on the website's grey, then the line, what it does and Learn more.
 * Then the bots: a connected one with "Last used …" and a gear whose one
 * item is Disconnect, one not connected yet with its line and +; then Add,
 * for any other bot.
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
            .frame(height: 176)
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
      if let icon = row.icon {
        ProviderIcon(provider: icon, size: 30)
      } else {
        Text(verbatim: String(row.name.prefix(1)).uppercased())
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(Ink.secondary)
          .frame(width: 30, height: 30)
          .background(Ink.pillButton, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
      }
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
 * The card's picture: Simeon's tile in the middle, Grok Bot, Muse and Dots
 * around it on a faint orbit, on the website's grey (`--soft`, #f5f5f7;
 * #1c1c1e on dark). Simeon's tile stays white, as an app's icon does.
 */
private struct ExternalAgentsPicture: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    GeometryReader { geometry in
      let width = geometry.size.width
      let height = geometry.size.height
      let center = CGPoint(x: width / 2, y: height / 2)
      let radiusX = min(width * 0.31, 110.0)
      let radiusY = min(height * 0.34, 60.0)
      ZStack {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(scheme == .dark ? Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255) : Color(red: 245 / 255, green: 245 / 255, blue: 247 / 255))
        Ellipse()
          .stroke(Ink.primary.opacity(0.12), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
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
          .foregroundStyle(Color(red: 13 / 255, green: 13 / 255, blue: 13 / 255))
          .frame(width: 72, height: 72)
          .background(Color.white, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
          .overlay { RoundedRectangle(cornerRadius: 17, style: .continuous).strokeBorder(Color.black.opacity(0.08), lineWidth: 0.5) }
          .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 6)
          .position(center)
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Text("Simeon with Grok Bot, Muse and Dots"))
  }

  /** A mascot on the orbit, at `angle` degrees (0 at the right, 90 at the top). */
  private func mascot(_ icon: String, angle: Double, center: CGPoint, radiusX: CGFloat, radiusY: CGFloat, tilt: Double) -> some View {
    let radians = angle * .pi / 180
    let point = CGPoint(x: center.x + radiusX * CGFloat(cos(radians)), y: center.y - radiusY * CGFloat(sin(radians)))
    return ProviderIcon(provider: icon, size: 44)
      .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 3)
      .rotationEffect(.degrees(tilt))
      .position(point)
  }
}

/** The bots' mascots at the end of Settings' External Agents row (the reference's "Reason with" and its icons): 20 each, each over the last by 4. */
struct ExternalAgentsMascots: View {
  var body: some View {
    HStack(spacing: -4) {
      ForEach(ExternalAgents.menuIcons, id: \.self) { icon in
        ProviderIcon(provider: icon, size: 20)
      }
    }
    .accessibilityHidden(true)
  }
}
