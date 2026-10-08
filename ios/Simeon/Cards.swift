import SwiftUI
import UIKit
import QuickLook
import SimeonCore

/** How wide the chat is, so a bubble or card can cap itself at the window's `min(88%, 640px, 100% - 82px)`. */
struct ChatWidthKey: EnvironmentKey { static let defaultValue: CGFloat = 361 }

extension EnvironmentValues {
  var chatWidth: CGFloat {
    get { self[ChatWidthKey.self] }
    set { self[ChatWidthKey.self] = newValue }
  }
}

enum ChatMetrics {
  static func bubbleMax(_ width: CGFloat) -> CGFloat { min(width * 0.88, 640, width - 82) }
}

/** The chat's blue button (`button[data-variant="primary"]`): 32 pt, 8 pt corners, white 14 pt. */
struct BlueButtonStyle: ButtonStyle {
  var height: CGFloat = 32
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 14))
      .foregroundStyle(.white)
      .padding(.horizontal, 10)
      .frame(height: height)
      .background(Ink.bubbleMine.opacity(enabled ? (configuration.isPressed ? 0.8 : 1) : 0.45), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

/** The quiet grey button beside it: the faint fill and a hairline edge. */
struct GreyButtonStyle: ButtonStyle {
  var height: CGFloat = 32
  var capsule = false

  func makeBody(configuration: Configuration) -> some View {
    GreyButton(configuration: configuration, height: height, capsule: capsule)
  }

  /** Pressed it dims at once, disabled it fades, so a tap always shows (it was the same in all three states). */
  private struct GreyButton: View {
    let configuration: ButtonStyleConfiguration
    let height: CGFloat
    let capsule: Bool
    @Environment(\.isEnabled) private var enabled

    var body: some View {
      let shape = RoundedRectangle(cornerRadius: capsule ? height / 2 : 8, style: .continuous)
      configuration.label
        .font(.system(size: capsule ? 13 : 14))
        .foregroundStyle(Ink.primary)
        .padding(.horizontal, capsule ? 12 : 10)
        .frame(height: height)
        .background(Ink.pill, in: shape)
        .overlay(shape.stroke(Ink.edge, lineWidth: 1))
        .contentShape(shape)
        .opacity(!enabled ? 0.4 : configuration.isPressed ? 0.55 : 1)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
  }
}

/** The round glass close at a sheet's top left, as the phone design puts it. */
struct CloseDisc: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
        .frame(width: 40, height: 40)
        .contentShape(.circle)
    }
    .buttonStyle(.plain)
    .glassEffect(.regular.interactive(), in: .circle)
    .accessibilityLabel("Close")
  }
}

/** A grey pill with a dot: "Dismissed", "Ready to send", "Sent". */
struct StatusPill: View {
  let text: String
  var dot: Color = Ink.tertiary
  var size: CGFloat = 13

  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(dot).frame(width: 6, height: 6)
      Text(text).font(.system(size: size, weight: .medium)).foregroundStyle(Ink.secondary).lineLimit(1)
    }
    .padding(.horizontal, 8).padding(.vertical, 2)
    .background(Ink.pill, in: Capsule())
  }
}

// MARK: - Question

/** A question card (`widget`): live, answered, or dismissed, the window's three looks. */
struct QuestionCardView: View {
  let entryId: String
  let agentId: String
  let card: QuestionCard
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var own = ""
  @FocusState private var typingOwn: Bool

  var body: some View {
    let _ = Trace.tally("QuestionCardView drawn")
    let pending = store.pendingAnswers[entryId]
    let answer = card.answer ?? ((pending?.isEmpty ?? true) ? nil : pending)
    Group {
      if card.isDismissed || pending == "" {
        dismissed
      } else if let answer {
        answered(answer)
      } else if card.isSkipped {
        dismissed
      } else {
        live
      }
    }
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
  }

  private var live: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 0) {
          Text(card.prompt).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
            .lineSpacing(MessageType.spacing()).fixedSize(horizontal: false, vertical: true)
          if let help = card.help {
            Text(help).font(.system(size: 14)).foregroundStyle(Ink.secondary)
              .lineSpacing(MessageType.spacing()).fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 0)
        Button { Task { await store.dismissQuestion(entryId, in: agentId) } } label: {
          Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.secondary)
            .frame(width: 32, height: 32).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dismiss")
      }
      VStack(spacing: 0) {
        ForEach(Array(card.options.enumerated()), id: \.offset) { index, option in
          if index > 0 { Rectangle().fill(Ink.hairline).frame(height: 1) }
          Button { give(option.label) } label: {
            HStack(spacing: 8) {
              Circle().stroke(Ink.primary.opacity(0.3), lineWidth: 1).frame(width: 18, height: 18)
              VStack(alignment: .leading, spacing: 0) {
                Text(option.label).font(.system(size: 14)).foregroundStyle(Ink.primary).multilineTextAlignment(.leading)
                if let description = option.description {
                  Text(description).font(.system(size: 14)).foregroundStyle(Ink.secondary).multilineTextAlignment(.leading)
                }
              }
              Spacer(minLength: 0)
            }
            .padding(8)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      if card.allowsOwnAnswer {
        HStack(alignment: .bottom, spacing: 8) {
          TextField("Type your own answer", text: $own, axis: .vertical)
            .font(.system(size: 14))
            .lineLimit(1...5)
            .focused($typingOwn)
            .padding(.horizontal, 10).padding(.vertical, 6)
            // The whole box takes the tap, not only the line of text inside its padding.
            .background { RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Ink.field).onTapGesture { typingOwn = true } }
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Ink.edge, lineWidth: 1).allowsHitTesting(false))
            .submitLabel(.send)
            .onSubmit { give(own) }
          if !own.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Button("Submit") { give(own) }.buttonStyle(BlueButtonStyle())
          }
        }
      }
    }
    .card()
  }

  private func answered(_ answer: String) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(card.prompt).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.blue).frame(width: 18)
        Text(answer).font(.system(size: 14)).foregroundStyle(Ink.primary).fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 0)
      }
      .padding(8)
    }
    .card()
  }

  private var dismissed: some View {
    HStack(alignment: .center, spacing: 8) {
      Text(card.prompt).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.secondary).lineLimit(2)
      Spacer(minLength: 0)
      StatusPill(text: card.isSkipped && !card.isDismissed ? "Skipped" : "Dismissed")
    }
    .card()
  }

  private func give(_ value: String) {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    own = ""
    Task { await store.answer(trimmed, card: entryId, in: agentId) }
  }
}

// MARK: - Connected apps

/** An app's tile: its mark on white, 40 pt with 11 pt corners (`.sand-tool-icon`). */
struct ConnectorTile: View {
  let name: String
  var size: CGFloat = 40

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: size * 11 / 40, style: .continuous).fill(Color.white)
      if let logo = MentionArt.connector(name) {
        Image(uiImage: logo).resizable().scaledToFit().frame(width: size * 0.6, height: size * 0.6)
      } else {
        Text(String(name.prefix(1)).uppercased()).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(Color(white: 0.35))
      }
    }
    .frame(width: size, height: size)
    .overlay(RoundedRectangle(cornerRadius: size * 11 / 40, style: .continuous).stroke(Color.black.opacity(0.08), lineWidth: 0.5))
  }
}

/** The connect cards (`connector`, `connectors`): one card per app, its tile, its name, why, and Add (or ✓ Added). */
struct ConnectorsCardView: View {
  let names: [String]
  let connected: Bool
  let reason: String?
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(names, id: \.self) { name in
        ConnectorCard(name: name, reason: names.count == 1 ? reason : nil, markedConnected: connected)
      }
    }
    .task { await store.loadApps() }
  }
}

struct ConnectorCard: View {
  let name: String
  let reason: String?
  var markedConnected = false
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    let app = store.catalogApp(named: name)
    let isConnected = markedConnected || store.isConnected(name)
    let waiting = connector.connecting == name
    HStack(spacing: 12) {
      ConnectorTile(name: app?.title ?? name)
      VStack(alignment: .leading, spacing: 0) {
        Text(app?.title ?? name).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        Text(waiting ? "Waiting for \(name) authorization…" : (reason ?? app?.summary ?? ""))
          .font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
      }
      Spacer(minLength: 0)
      if isConnected {
        Label("Added", systemImage: "checkmark").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.secondary).labelStyle(.titleAndIcon)
      } else if waiting {
        ProgressView().controlSize(.small)
      } else {
        Button("Add") { Task { await connector.connect(name, store: store) } }
          .buttonStyle(GreyButtonStyle(capsule: true))
          .disabled(connector.connecting != nil)
      }
    }
    .card()
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
  }
}

/**
 * "Connect Slack" (`sand-listener-connect-card`, view-3mdFcnEj.js): the
 * app's logo, "Connect Slack" with why ("Connect Slack so this routine can
 * fire.", or the window's own line), and Connect; once linked, "Slack
 * connected" and a green check. Connect opens the linking page outside the
 * app, as the Mac does, and the card asks every five seconds until linked.
 */
struct ListenerConnectCard: View {
  let platform: String
  let reason: String?
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @Environment(\.chatWidth) private var width
  @State private var connected: Bool?
  @State private var opening = false

  private var name: String { platform == "slack" ? "Slack" : "GitHub" }
  private var line: String {
    if let reason, !reason.isEmpty { return "Connect \(name) \(reason)." }
    return platform == "slack" ? "Link Slack so your agent can wake on messages, mentions, and reactions." : "Link GitHub so your agent can wake on PRs, comments, issues, and CI."
  }

  var body: some View {
    HStack(spacing: 12) {
      ConnectorTile(name: name, size: 32)
      VStack(alignment: .leading, spacing: 2) {
        Text(connected == true ? "\(name) connected" : "Connect \(name)").font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.primary)
        if connected != true {
          Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
      if connected == true {
        Label("Connected", systemImage: "checkmark.circle.fill").font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.primary).labelStyle(ConnectedLabel())
      } else if connected == nil || opening {
        ProgressView().controlSize(.small).accessibilityLabel("Checking connection status")
      } else {
        Button("Connect") {
          opening = true
          Task {
            if let url = await store.listenerConnectURL(platform) { openURL(url) }
            opening = false
          }
        }
        .buttonStyle(BlueButtonStyle())
      }
    }
    .card()
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
    .task {
      while !Task.isCancelled && connected != true {
        connected = await store.listenerConnected(platform) ?? connected ?? false
        try? await Task.sleep(nanoseconds: 5_000_000_000)
      }
    }
  }
}

/** The green check beside "Connected". */
private struct ConnectedLabel: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) {
      configuration.icon.foregroundStyle(Ink.live)
      configuration.title
    }
  }
}

// MARK: - Flights

/** Flight results (patch FLIGHTS_SOURCE): the route over the date and terms, then a row per offer; a row opens the flight. */
struct FlightsCardView: View {
  let card: FlightsCard
  @Environment(\.chatWidth) private var width
  @State private var open: OpenFlight?

  struct OpenFlight: Identifiable { let id: Int; let offer: FlightOffer }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !card.title.isEmpty || !card.subtitle.isEmpty {
        VStack(alignment: .leading, spacing: 1) {
          if !card.title.isEmpty { Text(card.title).font(.system(size: 15, weight: .medium)).tracking(-0.15).foregroundStyle(Ink.theirsText) }
          if !card.subtitle.isEmpty { Text(card.subtitle).font(.system(size: 13)).foregroundStyle(Ink.fineGrey) }
        }
        .padding(.top, 2).padding(.bottom, 8)
      }
      VStack(spacing: 0) {
        ForEach(Array(card.offers.enumerated()), id: \.offset) { index, offer in
          if index > 0 { Rectangle().fill(Ink.hairline).frame(height: 0.5).padding(.leading, 58).padding(.trailing, 10) }
          Button { open = OpenFlight(id: index, offer: offer) } label: { FlightRow(offer: offer) }
            .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, -10)
    }
    .padding(.horizontal, 12).padding(.vertical, 8)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .modifier(CardEdge(radius: 18))
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
    .sheet(item: $open) { flight in FlightDetails(offer: flight.offer).presentationDetents([.large]) }
  }
}

struct FlightRow: View {
  let offer: FlightOffer

  var body: some View {
    HStack(spacing: 12) {
      AirlineMark(name: offer.airline, logo: offer.logo, size: 36)
      VStack(alignment: .leading, spacing: 1) {
        Text([offer.depart, offer.arrive].filter { !$0.isEmpty }.joined(separator: " – "))
          .font(.system(size: 15)).tracking(-0.15).foregroundStyle(Ink.theirsText).lineLimit(1)
        Text([offer.airline, offer.duration, offer.stops.components(separatedBy: " · ").first ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
          .font(.system(size: 13)).foregroundStyle(Ink.fineGrey).lineLimit(1)
        if let range = offer.stops.range(of: " · ") {
          Text("\(offer.stops[range.upperBound...]) layover").font(.system(size: 13)).foregroundStyle(Ink.fineGrey).lineLimit(1)
        }
        if !offer.returnTimes.isEmpty { Text(offer.returnTimes).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).lineLimit(1) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Text(offer.price).font(.system(size: 15)).tracking(-0.15).monospacedDigit().foregroundStyle(Ink.theirsText).lineLimit(1).fixedSize()
      Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.chevron)
    }
    .padding(10)
    .contentShape(Rectangle())
  }
}

/** The airline's logo on a white disc, or its initials (`__simeonAirlineMark`). */
struct AirlineMark: View {
  let name: String
  let logo: String
  var size: CGFloat = 36
  @State private var image: UIImage?

  var body: some View {
    ZStack {
      Circle().fill(Color.white)
      // The airline's own logo (an SVG from the offer, drawn by RemoteLogos), else its initials, as the Mac's card falls back.
      if let image {
        Image(uiImage: image).resizable().scaledToFit().frame(width: size * 0.61, height: size * 0.61)
      } else {
        initials
      }
    }
    .frame(width: size, height: size)
    .overlay(Circle().stroke(Color.black.opacity(0.12), lineWidth: 0.5))
    .task(id: logo) {
      guard let url = URL(string: logo), !logo.isEmpty else { return }
      image = await RemoteLogos.shared.image(for: url)
    }
  }

  private var initials: some View {
    Text(FlightsCard.initials(name)).font(.system(size: size / 3, weight: .medium)).foregroundStyle(Color(red: 0.43, green: 0.43, blue: 0.45))
  }
}

/** One offer, drawn as the agent's page draws a profile: the mark, the route, then Price, each leg and the fare's terms. */
struct FlightDetails: View {
  let offer: FlightOffer
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    let from = offer.from.isEmpty ? (offer.legs.first?.from ?? "") : offer.from
    let to = offer.to.isEmpty ? (offer.legs.last?.to ?? "") : offer.to
    ScrollView {
      VStack(spacing: 0) {
        VStack(spacing: 0) {
          AirlineMark(name: offer.airline, logo: offer.logo, size: 72)
          Text("\(from) → \(to)").font(.system(size: 22, weight: .semibold)).foregroundStyle(Ink.primary).padding(.top, 14)
          Text([offer.date, offer.duration, offer.stops.components(separatedBy: " · ").first ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
            .font(.system(size: 15)).foregroundStyle(Ink.secondary).padding(.top, 2)
        }
        .padding(.top, 12)
        VStack(alignment: .leading, spacing: 22) {
          if !offer.price.isEmpty { section("Price") { row("Total", offer.price, note: offer.priceNote) } }
          ForEach(Array(offer.legs.enumerated()), id: \.offset) { index, leg in
            section([leg.heading, "\(leg.from) → \(leg.to)"].filter { !$0.isEmpty }.joined(separator: " · ")) {
              row("Departs", [leg.departDay, leg.depart].filter { !$0.isEmpty }.joined(separator: " · "))
              row("Arrives", [leg.arriveDay, leg.arrive].filter { !$0.isEmpty }.joined(separator: " · "))
              row("Flight", [leg.flight, leg.carrier != offer.airline ? leg.carrier : ""].filter { !$0.isEmpty }.joined(separator: " · "))
              row("Cabin", leg.cabin)
              row("Time in the air", leg.duration)
              if !leg.layover.isEmpty && index < offer.legs.count - 1 {
                Text(leg.layover.replacingOccurrences(of: " in ", with: " layover in ")).font(.system(size: 13)).foregroundStyle(Ink.secondary).padding(.top, 10)
              }
            }
          }
          if !(offer.refundable + offer.changeable + offer.bags).isEmpty {
            section("Fare") {
              row("Cancellation", offer.refundable)
              row("Changes", offer.changeable)
              row("Bags", offer.bags)
            }
          }
        }
        .padding(.top, 30)
      }
      .padding(.horizontal, 20).padding(.bottom, 30)
    }
    .background(Ink.ground)
    .overlay(alignment: .topLeading) { CloseDisc { dismiss() }.padding(14) }
  }

  private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title).font(.system(size: 13)).foregroundStyle(Ink.secondary).padding(.bottom, 2)
      content()
    }
  }

  @ViewBuilder
  private func row(_ label: String, _ value: String, note: String = "") -> some View {
    if !value.isEmpty {
      HStack(alignment: .firstTextBaseline, spacing: 16) {
        Text(label).font(.system(size: 15)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        VStack(alignment: .trailing, spacing: 0) {
          Text(value).font(.system(size: 15)).foregroundStyle(Ink.secondary).multilineTextAlignment(.trailing)
          if !note.isEmpty { Text(note).font(.system(size: 13)).foregroundStyle(Ink.secondary) }
        }
      }
      .padding(.vertical, 11)
      .overlay(alignment: .bottom) { Rectangle().fill(Ink.hairline).frame(height: 0.5) }
    }
  }
}

// MARK: - Drafts

/** An email or a Slack message the agent drafted (`email-draft`, `slack-draft`): edit it, Send, or Discard. */
struct DraftCardView: View {
  let entryId: String
  let agentId: String
  let card: DraftCard
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var to = ""
  @State private var subject = ""
  @State private var bodyText = ""
  @State private var loaded = false
  @State private var expanded = false
  @FocusState private var focused: Int?
  /** Send or Discard on its way: both wait, so a second tap does not send twice. */
  @State private var busy = false

  private var editable: Bool { card.state == "editable" && !card.isDismissed }
  private var isEmail: Bool { card.kind == .email }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        if !isEmail, let slack = UIImage(named: "Brands/slack") {
          Image(uiImage: slack).resizable().scaledToFit().frame(width: 16, height: 16)
        }
        Text(isEmail ? "New email" : "Slack message").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        StatusPill(text: card.status, dot: card.state == "sent" ? Ink.live : card.state == "sending" ? Ink.blue : Ink.tertiary, size: 12)
      }
      if card.state == "sent" {
        Text(isEmail ? "Sent to \(card.to.joined(separator: ", ")) — “\(card.subject)”" : "Sent to \(card.target)")
          .font(.system(size: 14)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      } else {
        VStack(spacing: 0) {
          if isEmail {
            if !card.from.isEmpty { field("From") { Text(card.from).font(.system(size: 14)).foregroundStyle(Ink.secondary).lineLimit(1) }; line }
            field("To", focus: { focused = 0 }) { TextField("name@company.com", text: $to).font(.system(size: 14)).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(!editable).focused($focused, equals: 0) }
            line
            field("Subject", focus: { focused = 1 }) { TextField("Subject", text: $subject).font(.system(size: 14)).disabled(!editable).focused($focused, equals: 1) }
          } else {
            if !card.workspace.isEmpty { field("Workspace") { Text(card.workspace).font(.system(size: 14)).foregroundStyle(Ink.secondary) }; line }
            field("To") { Text(card.target).font(.system(size: 14)).foregroundStyle(Ink.secondary) }
            line
            field("Thread") { Text(card.thread.isEmpty ? "New message" : card.thread).font(.system(size: 14)).foregroundStyle(Ink.secondary) }
          }
          line
          TextField("Message", text: $bodyText, axis: .vertical)
            .font(.system(size: 14))
            .lineSpacing(MessageType.spacing(size: 14, lineHeight: 22))
            .lineLimit(expanded || !editable ? 3...40 : 3...10)
            .disabled(!editable)
            .focused($focused, equals: 2)
            .padding(10)
            .background { Color.clear.contentShape(.rect).onTapGesture { if editable { focused = 2 } } }
          if bodyText.count > 500 && !expanded {
            Button("Show more") { expanded = true }.font(.system(size: 13)).foregroundStyle(Ink.link).padding(.horizontal, 10).padding(.bottom, 8)
          }
        }
        .background(Ink.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        if editable {
          HStack(spacing: 8) {
            Button(isEmail ? "Send email" : "Send message") { send() }
              .buttonStyle(BlueButtonStyle())
              .disabled(isEmail && !validAddresses)
            Button("Discard") {
              busy = true
              Task { await store.discardDraft(entryId, in: agentId); busy = false }
            }
            .buttonStyle(GreyButtonStyle())
            if busy { ProgressView().controlSize(.small) }
          }
          .disabled(busy)
        }
      }
    }
    .card()
    .opacity(card.isDismissed ? 0.6 : 1)
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
    .onAppear {
      guard !loaded else { return }
      loaded = true
      to = card.to.joined(separator: ", "); subject = card.subject; bodyText = card.body
    }
  }

  private var validAddresses: Bool {
    let list = addresses
    return !list.isEmpty && list.allSatisfy { $0.contains("@") && $0.contains(".") && !$0.contains(" ") }
  }

  private var addresses: [String] {
    to.split(whereSeparator: { $0 == "," || $0 == ";" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
  }

  private var line: some View { Rectangle().fill(Ink.hairline).frame(height: 1) }

  /** A row of the draft: its label, its field. The whole row takes the tap (the label and the padding passed it to nothing). */
  private func field<Content: View>(_ label: String, focus: (() -> Void)? = nil, @ViewBuilder content: () -> Content) -> some View {
    HStack(spacing: 8) {
      Text(label).font(.system(size: 12)).foregroundStyle(Ink.tertiary).allowsHitTesting(false)
      content()
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 10).padding(.vertical, 7)
    .frame(minHeight: 37)
    .background { Color.clear.contentShape(.rect).onTapGesture { if editable { focus?() } } }
  }

  private func send() {
    let draft: JSON = isEmail
      ? ["to": JSON(addresses), "subject": .string(subject), "body": .string(bodyText)]
      : ["body": .string(bodyText)]
    busy = true
    Task { await store.sendDraft(entryId, in: agentId, draft: draft); busy = false }
  }
}

// MARK: - Files

enum FileKind {
  static let images: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"]

  /** The Mac's own artwork for Word, Excel, PowerPoint and PDF (`desktop/brand/file-icons`), else a symbol on a tile. */
  static func artwork(_ name: String) -> String? {
    switch (name as NSString).pathExtension.lowercased() {
    case "doc", "docx", "rtf", "pages": return "FileIcons/word"
    case "xls", "xlsx", "csv", "numbers": return "FileIcons/excel"
    case "ppt", "pptx", "key": return "FileIcons/powerpoint"
    case "pdf": return "FileIcons/pdf"
    default: return nil
    }
  }

  static func symbol(_ name: String) -> String {
    let ext = (name as NSString).pathExtension.lowercased()
    if images.contains(ext) { return "photo" }
    if ["mp4", "mov", "m4v", "webm"].contains(ext) { return "film" }
    if ["mp3", "m4a", "wav", "aac", "ogg"].contains(ext) { return "waveform" }
    if ["zip", "gz", "tar", "rar", "7z"].contains(ext) { return "archivebox" }
    if ["md", "txt", "json", "html", "js", "ts", "py", "swift"].contains(ext) { return "doc.text" }
    return "doc"
  }
}

/** A file an agent made or the person sent (`attachment`, `user-attachment`): the kind's artwork, the name, save; a tap opens it. Images show inline. */
struct FileCardView: View {
  let name: String
  let url: String
  let agentId: String
  let fromPerson: Bool
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var image: UIImage?
  @State private var preview: PreviewFile?
  @State private var loading = false

  private var isImage: Bool { FileKind.images.contains((name as NSString).pathExtension.lowercased()) }

  var body: some View {
    let _ = Trace.tally("FileCardView drawn")
    Group {
      if isImage, let image {
        Image(uiImage: image).resizable().scaledToFit()
          .frame(maxWidth: min(ChatMetrics.bubbleMax(width), 280), maxHeight: 360)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .onTapGesture { open() }
      } else {
        card
      }
    }
    .frame(maxWidth: .infinity, alignment: fromPerson ? .trailing : .leading)
    // Decoded at the size it is shown, off the main thread: a full-size photo decoded on it froze scrolling.
    .task {
      guard isImage, image == nil, let data = await store.readFile(url, agentId: agentId, limit: 12 << 20), let full = UIImage(data: data) else { return }
      // Its own shape, at most 900 pt on its long side (the thumbnail is drawn at exactly the size asked).
      let scale = min(1, 900 / max(full.size.width, full.size.height, 1))
      image = await full.byPreparingThumbnail(ofSize: CGSize(width: full.size.width * scale, height: full.size.height * scale)) ?? full
    }
    .sheet(item: $preview) { file in QuickLookSheet(file: file).ignoresSafeArea() }
  }

  private var card: some View {
    let ext = (name as NSString).pathExtension
    let base = ext.isEmpty ? name : String(name.dropLast(ext.count + 1))
    return HStack(spacing: 8) {
      Group {
        if let art = FileKind.artwork(name), let artwork = UIImage(named: art) {
          Image(uiImage: artwork).resizable().scaledToFit()
        } else {
          Image(systemName: FileKind.symbol(name)).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.blue)
            .frame(width: 36, height: 36).background(Ink.field, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
      }
      .frame(width: 36, height: 36)
      Text("\(base)\(ext.isEmpty ? "" : ".\(ext)")").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary)
        .lineLimit(1).truncationMode(.middle)
      Spacer(minLength: 4)
      Group {
        if loading { ProgressView().controlSize(.small) } else { Image(systemName: "icloud.and.arrow.down").font(.system(size: 14)).foregroundStyle(Ink.secondary) }
      }
      .frame(width: 24, height: 24)
    }
    .padding(8)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .modifier(CardEdge(radius: 12))
    .frame(maxWidth: min(340, ChatMetrics.bubbleMax(width)), alignment: .leading)
    .fixedSize(horizontal: true, vertical: false)
    .contentShape(Rectangle())
    .onTapGesture { open() }
  }

  private func open() {
    guard !loading else { return }
    loading = true
    Task {
      defer { loading = false }
      guard let data = await store.readFile(url, agentId: agentId) else {
        store.problem = "Couldn't open \(name): the computer didn't hand it over."
        return
      }
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("simeon-files", isDirectory: true).appendingPathComponent(name)
      // Written off the main thread: a file can be tens of megabytes.
      let written = await Task.detached(priority: .userInitiated) { () -> Bool in
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        return (try? data.write(to: file, options: .atomic)) != nil
      }.value
      if written { preview = PreviewFile(url: file) } else { store.problem = "Couldn't open \(name)." }
    }
  }
}

struct PreviewFile: Identifiable { let url: URL; var id: URL { url } }

/** The system's preview (Quick Look): images, PDFs, text, and Word, Excel and PowerPoint files, with Share to save. */
struct QuickLookSheet: UIViewControllerRepresentable {
  let file: PreviewFile

  func makeUIViewController(context: Context) -> UINavigationController {
    let controller = QLPreviewController()
    controller.dataSource = context.coordinator
    return UINavigationController(rootViewController: controller)
  }

  func updateUIViewController(_ controller: UINavigationController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(file.url) }

  final class Coordinator: NSObject, QLPreviewControllerDataSource {
    let url: URL
    init(_ url: URL) { self.url = url }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
  }
}

// MARK: - Requests: approvals, secrets, the computer

struct RequestCardView: View {
  let entryId: String
  let agentId: String
  let card: RequestCard
  var openComputer: () -> Void = {}
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var secret = ""
  /** An answer on its way: the buttons wait, so one tap is one answer. */
  @State private var busy = false

  var body: some View {
    Group {
      switch card {
      case .approval(let requestId, let summary, let reason, let command, let status):
        approval(requestId: requestId, summary: summary, reason: reason, command: command, status: status)
      case .secret(let label, let description, let provided):
        secretCard(label: label, description: description, provided: provided)
      case .computer(_, let instruction, let resolution):
        computer(instruction: instruction, resolution: resolution)
      }
    }
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
  }

  private func approval(requestId: String, summary: String, reason: String, command: String, status: String) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Text("Approval needed").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        StatusPill(text: status == "pending" ? "Waiting for you" : status == "denied" ? "Denied" : status == "expired" ? "Expired" : "Allowed",
                   dot: status == "pending" ? Ink.blue : status == "denied" ? Ink.danger : Ink.tertiary, size: 12)
      }
      Text(summary).font(.system(size: 14)).foregroundStyle(Ink.primary).fixedSize(horizontal: false, vertical: true)
      if !reason.isEmpty { Text(reason).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true) }
      if !command.isEmpty {
        Text(command).font(.system(size: 12, design: .monospaced)).foregroundStyle(Ink.primary)
          .padding(8).frame(maxWidth: .infinity, alignment: .leading)
          .background(Ink.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      }
      if status == "pending" {
        HStack(spacing: 8) {
          Button("Allow once") { resolve(requestId, "approved") }.buttonStyle(BlueButtonStyle())
          Button("Always allow") { resolve(requestId, "always") }.buttonStyle(GreyButtonStyle())
          Button("Deny") { resolve(requestId, "denied") }.buttonStyle(GreyButtonStyle())
          if busy { ProgressView().controlSize(.small) }
        }
        .disabled(busy)
      }
    }
    .card()
  }

  private func resolve(_ requestId: String, _ resolution: String) {
    run { await store.resolveApproval(requestId, resolution: resolution, entryId: entryId, in: agentId) }
  }

  private func run(_ work: @escaping () async -> Void) {
    guard !busy else { return }
    busy = true
    Task { await work(); busy = false }
  }

  private func secretCard(label: String, description: String, provided: Bool) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: "key.fill").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        Text(label).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        if provided { StatusPill(text: "Saved", dot: Ink.live, size: 12) }
      }
      if !description.isEmpty { Text(description).font(.system(size: 14)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true) }
      if !provided {
        SecureField("Paste it here", text: $secret)
          .font(.system(size: 14))
          .textInputAutocapitalization(.never).autocorrectionDisabled()
          .padding(.horizontal, 10).frame(height: 34)
          .background(Ink.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Ink.edge, lineWidth: 1))
        Button("Save securely") {
          let value = secret
          secret = ""
          run { await store.submitSecret(value, entryId: entryId, in: agentId) }
        }
        .buttonStyle(BlueButtonStyle())
        .disabled(busy || secret.trimmingCharacters(in: .whitespaces).isEmpty)
      }
    }
    .card()
  }

  /** "Your turn on the computer" (patch HANDOFF_CARD_SOURCE): a white computer tile, the status, the instruction, Take over / I'm done / Skip. */
  private func computer(instruction: String, resolution: String?) -> some View {
    let waiting = resolution == nil
    let done = ["handed_back": "Done", "replied": "Answered", "dismissed": "Skipped"][resolution ?? ""] ?? "Done"
    return VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Image(systemName: "display").font(.system(size: 19)).foregroundStyle(Ink.primary)
          .frame(width: 44, height: 44)
          .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          Text(waiting ? "Your turn on the computer" : "Computer").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
          HStack(spacing: 6) {
            PulsingDot(active: waiting)
            Text(waiting ? "Waiting for you" : done).font(.system(size: 13)).foregroundStyle(Ink.secondary)
          }
        }
        Spacer(minLength: 0)
      }
      if !instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        Text(instruction).font(.system(size: 15)).foregroundStyle(Ink.primary).fixedSize(horizontal: false, vertical: true)
      }
      if waiting {
        VStack(spacing: 6) {
          HStack(spacing: 8) {
            Button("Take over", action: openComputer).buttonStyle(PillButtonStyle(primary: true))
            Button("I’m done") { run { await store.handBackComputer(agentId) } }.buttonStyle(PillButtonStyle(primary: false))
              .disabled(busy)
          }
          Button { run { await store.handBackComputer(agentId, skip: true) } } label: {
            Text("Skip").font(.system(size: 13)).foregroundStyle(Ink.secondary)
              .frame(maxWidth: .infinity, minHeight: 32)
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .disabled(busy)
        }
      } else {
        Button("Open computer", action: openComputer).buttonStyle(PillButtonStyle(primary: false))
      }
    }
    .card(radius: 18, padding: 14)
  }
}

/** The hand-off card's 36 pt pills: the blue one, and the grey beside it. */
struct PillButtonStyle: ButtonStyle {
  let primary: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 15, weight: .medium))
      .foregroundStyle(primary ? Color.white : Ink.primary)
      .padding(.horizontal, 16)
      .frame(height: 36)
      .frame(maxWidth: .infinity)
      .background(primary ? Ink.bubbleMine : Ink.control, in: Capsule())
      .opacity(configuration.isPressed ? 0.8 : 1)
  }
}

/** A blue dot that breathes while something waits on the person. */
struct PulsingDot: View {
  let active: Bool
  @State private var on = false

  var body: some View {
    Circle().fill(active ? Ink.blue : Ink.tertiary).frame(width: 7, height: 7)
      .opacity(active && on ? 0.35 : 1)
      .animation(active ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true) : .default, value: on)
      .onAppear { Trace.tally("PulsingDot appeared"); if !on { on = true } }
  }
}

// MARK: - The lines in the middle: exchanges, calls, routines, notices

/** The small grey type of a line in the middle of the chat (`.sand-system-event`, 12 / 16). */
struct EventLine<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    HStack(spacing: 2) { content }
      .font(.system(size: 12))
      .foregroundStyle(Ink.secondary)
      .lineLimit(1)
      .frame(maxWidth: .infinity)
  }
}

/** A small stack of agents' butterflies, 16 pt, each over the last (the event chip's avatar stack). */
struct PeerStack: View {
  let peers: [Party]
  var size: CGFloat = 16
  @Environment(AppStore.self) private var store

  var body: some View {
    let _ = Trace.tally("PeerStack drawn")
    HStack(spacing: -size * 0.375) {
      ForEach(Array(peers.prefix(3).enumerated()), id: \.offset) { _, peer in
        ButterflyView(palette: .named(store.mentionNames.first { $0.id == peer.id }?.colour ?? AgentPalette.defaultColour(forAgentId: peer.id)), style: .still)
          .frame(width: size, height: size)
      }
    }
  }
}

/** "Messaged Scout", "Message from Iris", "4 messages with 🦋🦋 2 agents": a tap shows what they said. */
struct TeammatesLine: View {
  let exchange: Exchange
  let entries: [Entry]
  let agentId: String
  @State private var open = false

  var body: some View {
    let _ = Trace.tally("TeammatesLine drawn")
    EventLine {
      Text(exchange.label)
      Button { open = true } label: {
        HStack(spacing: 4) {
          PeerStack(peers: exchange.peers)
          Text(exchange.peers.count == 1 ? exchange.peers[0].name : "\(exchange.peers.count) agents")
        }
        .padding(.vertical, 4).padding(.leading, 4).padding(.trailing, 6)
        .contentShape(Capsule())
      }
      .buttonStyle(.plain)
    }
    .sheet(isPresented: $open) { ExchangeSheet(agentId: agentId, peers: exchange.peers, entries: entries) }
  }
}

/** Two agents' exchange, read-only (the window's overlay): this agent's words on the right, the teammate's on the left. */
struct ExchangeSheet: View {
  let agentId: String
  let peers: [Party]
  let entries: [Entry]
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let agent = store.agent(agentId)
    let mentioning = Mentioning(names: store.mentionNames, personName: store.account?.name, dark: scheme == .dark)
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        CloseDisc { dismiss() }
        Spacer()
        if let agent { AgentAvatar(agent: agent).frame(width: 30, height: 30) }
        Image(systemName: "arrow.left.arrow.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.tertiary)
        PeerStack(peers: peers, size: 30)
        Spacer()
        Color.clear.frame(width: 40, height: 40)
      }
      .padding(14)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 8) {
          ForEach(entries) { entry in
            let mine = entry.toAgent != nil
            VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
              Text(mine ? "\(agent?.name ?? "") to \(entry.toAgent?.name ?? "")" : "\(entry.fromAgent?.name ?? "")")
                .font(.system(size: 12)).foregroundStyle(Ink.secondary).padding(.horizontal, 12)
              // Cut as the chat's bubbles are: a message of megabytes laid out whole holds the screen still.
              MarkdownView(blocks: Markdown.cachedBlocks(Chat.clipped(entry.content ?? "", limit: 20_000).text), mentioning: mentioning)
                .foregroundStyle(Ink.theirsText)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .frame(maxWidth: 300, alignment: mine ? .trailing : .leading)
            }
            .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
          }
        }
        .padding(.horizontal, 16).padding(.bottom, 24)
      }
    }
    .background(Ink.ground)
    .presentationDetents([.medium, .large])
  }
}

/** A call, as one line: "Voice chat · 01:11"; a tap shows what was said, as bubbles. */
struct VoiceCallLine: View {
  let seconds: Int
  let lines: [CallLine]
  @State private var open = false

  var body: some View {
    Button { if !lines.isEmpty { open = true } } label: {
      EventLine {
        Image(systemName: "waveform").font(.system(size: 11, weight: .semibold)).padding(.trailing, 3)
        Text("Voice chat · \(Chat.callLength(seconds))")
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .sheet(isPresented: $open) { CallRecordSheet(seconds: seconds, lines: lines) }
  }
}

struct CallRecordSheet: View {
  let seconds: Int
  let lines: [CallLine]
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text("Voice chat · \(Chat.callLength(seconds))").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
        HStack { CloseDisc { dismiss() }; Spacer() }
      }
      .padding(14)
      ScrollView {
        LazyVStack(spacing: 6) {
          ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
            Text(line.text)
              .font(.system(size: MessageType.size))
              .lineSpacing(MessageType.spacing())
              .foregroundStyle(line.fromPerson ? Ink.mineText : Ink.theirsText)
              .padding(.horizontal, line.fromPerson ? 15 : 12).padding(.vertical, line.fromPerson ? 10 : 8)
              .background(line.fromPerson ? Ink.bubbleMine : Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
              .frame(maxWidth: 280, alignment: line.fromPerson ? .trailing : .leading)
              .frame(maxWidth: .infinity, alignment: line.fromPerson ? .trailing : .leading)
          }
        }
        .padding(.horizontal, 16).padding(.bottom, 24)
      }
    }
    .background(Ink.ground)
    .presentationDetents([.medium, .large])
  }
}

/** "Created routine ⏱ Monday launch check", "Created routines A and B", "Created ⏱ 3 routines ▾" (`XPn`). */
struct RoutinesLine: View {
  let action: String
  let routines: [RoutineRef]
  var openRoutine: (String) -> Void = { _ in }

  var body: some View {
    let verb = Chat.routineVerb(action)
    EventLine {
      if routines.count >= 3 {
        Text(verb)
        Menu {
          ForEach(routines, id: \.id) { routine in Button(routine.name) { openRoutine(routine.id) } }
        } label: {
          chip(Text("\(routines.count) routines"), trailing: true)
        }
      } else {
        Text("\(verb) \(routines.count == 1 ? "routine" : "routines")")
        ForEach(Array(routines.enumerated()), id: \.offset) { index, routine in
          if index > 0 { Text("and") }
          Button { openRoutine(routine.id) } label: { chip(Text(routine.name), trailing: false) }.buttonStyle(.plain)
        }
      }
    }
  }

  private func chip(_ label: Text, trailing: Bool) -> some View {
    HStack(spacing: 2) {
      Image(systemName: "clock").font(.system(size: 11))
        .frame(width: 16, height: 16)
      label
      if trailing { Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold)) }
    }
    .padding(.vertical, 4).padding(.leading, 4).padding(.trailing, 6)
    .contentShape(Capsule())
  }
}

/** The "New" line: blue rules either side of the word, before the first unread message. */
struct UnreadDivider: View {
  var body: some View {
    HStack(spacing: 12) {
      Rectangle().fill(Ink.newLine).frame(height: 1)
      Text("NEW").font(.system(size: 11, weight: .medium)).tracking(0.3).foregroundStyle(Ink.newLine)
      Rectangle().fill(Ink.newLine).frame(height: 1)
    }
    .padding(.vertical, 10)
    .accessibilityLabel("New messages")
  }
}
