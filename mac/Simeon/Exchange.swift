import AppKit
import SwiftUI
import SimeonCore

/**
 * Two agents' messages to each other, over the chat (`sand-thread-overlay`,
 * "Agent exchange", the window's `JMn`), read only: the chat's ground over
 * everything, the message field too. Its head (44, the ground) holds the
 * two agents in the middle, each a butterfly (20) and its name in a pill
 * (13, 500, padded 3 12), 4 apart, with ⇄ (12, at 30%) between them, 8
 * apart. The messages run 44 down to 64 up, 16 in, 24 before the first and
 * 52 after the last, opening at the newest; each agent's run as in a group
 * (the name over the first, 12 at 60%; the butterfly, 22, beside the last),
 * fading under the head (32) and over the foot (40) once there is more to
 * see. At the foot, 12 up and 40 high: a lock and "This chat is view-only"
 * (12 on 16, at 40%, 6 apart), then Close Chat (12 on 16, padded 4 8, a
 * pill on the grey wash), 10 apart. A message's actions are More alone
 * with Copy; its author's name does not open their chat. Escape closes.
 */
struct ExchangeView: View {
  let agentId: String
  let peer: Party
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @State private var showsTopFade = false
  @State private var showsBottomFade = false

  var body: some View {
    let agent = store.agent(agentId)
    let rows = Chat.exchangeRows(store.transcripts[agentId] ?? [], agent: Party(id: agentId, name: agent?.name ?? ""), peerId: peer.id)
    ZStack(alignment: .top) {
      look.ground
        .contentShape(Rectangle())
      GeometryReader { box in
        let width = max(0, box.size.width - 32)
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(rows) { row in
              switch row {
              case .stamp(_, let date):
                Stamp(date: date, look: look)
                  .frame(maxWidth: .infinity)
                  .padding(.vertical, 2)
              case .message(let id, let sender, let text, let first, let last):
                ExchangeMessage(id: id, sender: sender, text: text, first: first, last: last, width: width, look: look)
              }
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 24)
          .padding(.bottom, 52)
        }
        .defaultScrollAnchor(.bottom, for: .initialOffset)
        .onScrollGeometryChange(for: [Bool].self) { geometry in
          [geometry.contentOffset.y > 1, geometry.contentOffset.y + geometry.containerSize.height < geometry.contentSize.height - 1]
        } action: { _, fades in
          showsTopFade = fades[0]
          showsBottomFade = fades[1]
        }
      }
      .padding(.top, 44)
      .padding(.bottom, 64)
      VStack(spacing: 0) {
        LinearGradient(colors: [look.ground, look.ground.opacity(0)], startPoint: .top, endPoint: .bottom)
          .frame(height: 32)
          .opacity(showsTopFade ? 1 : 0)
        Spacer(minLength: 0)
        LinearGradient(colors: [look.ground.opacity(0), look.ground], startPoint: .top, endPoint: .bottom)
          .frame(height: 40)
          .opacity(showsBottomFade ? 1 : 0)
      }
      .padding(.top, 44)
      .padding(.bottom, 64)
      .allowsHitTesting(false)
      ExchangeHeader(agentId: agentId, agentName: agent?.name ?? "", peer: peer, look: look)
    }
    .overlay(alignment: .bottom) {
      ReadOnlyNotice(look: look) { control.closeExchange() }
        .padding(.bottom, 12)
    }
    .background(ViewerKeys { event in
      // Escape closes the exchange; while find has the keys, Escape is find's.
      guard event.keyCode == 53, !(control.findOpen && NSApp.keyWindow?.firstResponder is NSText) else { return false }
      control.closeExchange()
      return true
    })
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Agent exchange")
    .accessibilityAddTraits(.isModal)
  }
}

/** The exchange's head (`sand-chat-header__exchange`): the two agents, ⇄ between them, in the middle; the rest moves the window. */
private struct ExchangeHeader: View {
  let agentId: String
  let agentName: String
  let peer: Party
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    ZStack {
      look.ground
      WindowDragArea()
      HStack(spacing: 8) {
        participant(id: agentId, name: agentName)
        Image(systemName: "arrow.left.arrow.right")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(look.ink.opacity(0.3))
          .frame(width: 12, height: 12)
          .accessibilityHidden(true)
        participant(id: peer.id, name: peer.name)
      }
      .padding(.leading, 6)
    }
    .frame(height: 44)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Agent exchange between \(agentName) and \(peer.name)")
  }

  private func participant(id: String, name: String) -> some View {
    HStack(spacing: 4) {
      Group {
        if let agent = store.agent(id) {
          AgentMark(agent: agent, agents: store.agents, size: 20)
        } else {
          ButterflyMark(palette: AgentPalette.named(nil), size: 20)
        }
      }
      .frame(width: 20, height: 20)
      Text(name)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.ink)
        .lineLimit(1)
        .truncationMode(.tail)
        .padding(.horizontal, 12)
        .frame(height: 26)
        .glassEffect(.regular, in: .capsule)
        .help(name)
    }
  }
}

/**
 * One message in an exchange (`sand-thread-overlay__row`, an author run):
 * the butterfly's place (22) 8 from the bubble, the name over the first of
 * a run (12 on 16, at 60%, 12 above, 4 below, 12 in), the bubble as an
 * agent's in the chat, at most 88% of the column, 640, or the column less
 * 82; its upper left corner 6 round when it runs on from the one before,
 * its lower left always (it runs on, or sits by the butterfly). Under the
 * pointer, More (24) 6 beside it, with Copy.
 */
private struct ExchangeMessage: View {
  let id: String
  let sender: Party
  let text: String
  let first: Bool
  let last: Bool
  let width: CGFloat
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @State private var hovered = false
  @State private var barHovered = false

  var body: some View {
    let column = width - 30
    let limit = max(0, min(column * 0.88, 640, column - 82))
    HStack(alignment: .bottom, spacing: 8) {
      Group {
        if last {
          if let agent = store.agent(sender.id) {
            AgentMark(agent: agent, agents: store.agents, size: 22)
          } else {
            ButterflyMark(palette: AgentPalette.named(nil), size: 22)
          }
        } else {
          Color.clear
        }
      }
      .frame(width: 22, height: 22)
      VStack(alignment: .leading, spacing: 0) {
        if first {
          Text(sender.name)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
            .frame(height: 16)
            .padding(EdgeInsets(top: 12, leading: 12, bottom: 4, trailing: 0))
        }
        bubble
          .overlay(alignment: .trailing) { bar }
          .onHover { hover($0) }
          .frame(maxWidth: limit, alignment: .leading)
      }
    }
    .padding(.vertical, 2)
    .onDisappear {
      if control.exchangeHovered?.id == id { control.exchangeHovered = nil }
    }
    .accessibilityElement(children: .contain)
  }

  private var bubble: some View {
    let shape = UnevenRoundedRectangle(topLeadingRadius: first ? 18 : 6, bottomLeadingRadius: 6, bottomTrailingRadius: 18, topTrailingRadius: 18)
    return MessageBlocks(blocks: Markdown.cachedBlocks(text), line: MessageLine(size: 14, lineHeight: 20, colour: look.theirsText, look: look, agents: store.mentionNames, personName: store.account?.name))
      .font(.system(size: 14))
      .tracking(-0.042)
      .foregroundStyle(look.theirsText)
      .tint(look.link)
      .textSelection(.enabled)
      .padding(.vertical, 8)
      .padding(.horizontal, 12)
      .background(look.theirs, in: shape)
      .overlay { shape.inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
      .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
      .accessibilityLabel("Agent message")
  }

  /** More, 6 beside the bubble and level with its middle, while the pointer is on it or its menu is open. */
  @ViewBuilder
  private var bar: some View {
    if hovered || barHovered || control.menuFor == id {
      BarButton(symbol: "ellipsis", label: "More message actions", look: look) {
        MessageMenu.showCopy(text, id: id, control: control)
      }
      .padding(.leading, 6)
      .contentShape(Rectangle())
      .onHover { barHovered = $0 }
      .alignmentGuide(.trailing) { $0[.leading] }
      .accessibilityLabel("Message actions for \(sender.name) message")
    }
  }

  private func hover(_ inside: Bool) {
    hovered = inside
    if inside {
      control.exchangeHovered = (id, text)
    } else if control.exchangeHovered?.id == id {
      control.exchangeHovered = nil
    }
  }
}

/** The exchange's foot (`sand-exchange-readonly-notice`): it cannot be written in, and Close Chat. */
private struct ReadOnlyNotice: View {
  let look: Look
  let close: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      HStack(spacing: 6) {
        Image(systemName: "lock")
          .font(.system(size: 10))
          .frame(width: 12, height: 12)
        Text("This chat is view-only")
          .font(.system(size: 12))
          .cssLineHeight(16, size: 12)
      }
      .foregroundStyle(look.inkTertiary)
      Button(action: close) {
        Text("Close Chat")
          .font(.system(size: 12))
          .foregroundStyle(look.ink)
          .cssLineHeight(16, size: 12)
          .padding(.vertical, 4)
          .padding(.horizontal, 8)
          .background(look.rowHover, in: Capsule())
          .contentShape(Capsule())
      }
      .buttonStyle(.plain)
    }
    .padding(.vertical, 6)
    .padding(.horizontal, 14)
    .frame(maxWidth: .infinity)
    .frame(height: 40)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Read-only agent conversation")
  }
}

/**
 * The agents of an exchange with several (`ui-menu`, "Agents in this
 * exchange"): each one's butterfly (18) and name, by name; choosing one
 * opens its messages with this agent. A Mac menu, as the window's is a
 * menu.
 */
@MainActor
enum ExchangeMenu {
  static func show(peers: [Party], store: AppStore, control: ChatControl, dark: Bool) {
    let menu = NSMenu(title: "Agents in this exchange")
    menu.autoenablesItems = false
    var handlers: [PeerHandler] = []
    for peer in Chat.menuOrder(peers) {
      let handler = PeerHandler(peer: peer, control: control)
      let item = NSMenuItem(title: peer.name, action: #selector(PeerHandler.open), keyEquivalent: "")
      item.target = handler
      item.image = mark(for: peer, store: store, dark: dark)
      menu.addItem(item)
      handlers.append(handler)
    }
    // The handlers live as long as the menu.
    objc_setAssociatedObject(menu, &MessageMenu.Handler.key, handlers, .OBJC_ASSOCIATION_RETAIN)
    if let event = NSApp.currentEvent, let view = event.window?.contentView ?? NSApp.keyWindow?.contentView {
      NSMenu.popUpContextMenu(menu, with: event, for: view)
    }
  }

  /** An agent's butterfly as a menu's picture, 18 points. */
  private static func mark(for peer: Party, store: AppStore, dark: Bool) -> NSImage? {
    let renderer = ImageRenderer(content: PeerMark(agent: store.agent(peer.id), agents: store.agents).environment(\.colorScheme, dark ? .dark : .light))
    renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
    return renderer.nsImage
  }

  private struct PeerMark: View {
    let agent: Agent?
    let agents: [Agent]

    var body: some View {
      Group {
        if let agent {
          AgentMark(agent: agent, agents: agents, size: 18)
        } else {
          ButterflyMark(palette: AgentPalette.named(nil), size: 18)
        }
      }
      .frame(width: 18, height: 18)
    }
  }

  final class PeerHandler: NSObject {
    let peer: Party
    let control: ChatControl

    init(peer: Party, control: ChatControl) {
      self.peer = peer
      self.control = control
    }

    @MainActor @objc func open() {
      control.openExchange(peer)
    }
  }
}
