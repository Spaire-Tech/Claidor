import AppKit
import SwiftUI
import SimeonCore

/**
 * The cards an agent sends into the chat, copied from the Electron
 * window's (measured from its Gallery chat, mac/STEPS.md step 2c). Every
 * card is as wide as a message may be (88% of the chat, 640, or the chat
 * less 82), grey like an agent's bubble, 16 round, padded 12, its parts 10
 * apart.
 */
struct CardShell<Content: View>: View {
  let look: Look
  var spacing: CGFloat = 10
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      content()
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(look.theirs, in: RoundedRectangle(cornerRadius: 16))
    .overlay { RoundedRectangle(cornerRadius: 16).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
    .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
  }
}

/** A card's state in a small grey pill with a dot (`role="status"`): "Ready to send", "Sent", "Dismissed". */
struct StatusPill: View {
  let text: String
  let look: Look
  var dot: Color?

  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(dot ?? look.inkTertiary).frame(width: 6, height: 6)
      Text(text)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(look.inkSecondary)
        .lineLimit(1)
    }
    .padding(.vertical, 2)
    .padding(.horizontal, 8)
    .frame(height: 20)
    .background(look.wash, in: Capsule())
    .fixedSize()
  }
}

/** The window's two button kinds on a card: the blue one and the plain one (14 on 22, 32 high, 8 round). */
struct CardButton: View {
  let title: String
  var prominent = false
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14))
        .foregroundStyle(prominent ? Color.white : look.ink)
        .lineLimit(1)
        .padding(.horizontal, 12)
        .frame(height: 32)
        .background(prominent ? look.yours : look.wash, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
          if !prominent { RoundedRectangle(cornerRadius: 8).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
        }
        .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .fixedSize()
  }
}

// MARK: Questions

/**
 * A question (`sand-widget--choices`): the question (14 on 20, 500) and its
 * help under it (60%), the X that dismisses it at the right; the choices in
 * one box, each with its letter in a ring (A, B…), its label and its line
 * under it, a hairline between; then "Type your own answer" when the agent
 * allows one, with Submit once something is written. Answered, the card
 * keeps the question and the answer with a tick; dismissed, the question at
 * 60% and a "Dismissed" pill.
 */
struct QuestionCardView: View {
  let entryId: String
  let agentId: String
  let card: QuestionCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var own = ""

  var body: some View {
    let pending = store.pendingAnswers[entryId]
    if card.isDismissed || card.isSkipped || pending == "" {
      CardShell(look: look) {
        Text(card.prompt)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(look.inkSecondary)
          .cssLineHeight(20, size: 14, weight: .medium)
        StatusPill(text: "Dismissed", look: look)
      }
    } else if let answer = card.answer ?? pending {
      CardShell(look: look) {
        Text(card.prompt)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(look.ink)
          .cssLineHeight(20, size: 14, weight: .medium)
        HStack(spacing: 8) {
          Image(systemName: "checkmark")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
            .frame(width: 18, height: 18)
          Text(answer)
            .font(.system(size: 14))
            .foregroundStyle(look.ink)
            .cssLineHeight(20, size: 14)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Your answer: \(answer)")
      }
    } else {
      open
    }
  }

  private var open: some View {
    CardShell(look: look) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 0) {
          Text(card.prompt)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(look.ink)
            .cssLineHeight(20, size: 14, weight: .medium)
          if let help = card.help, !help.isEmpty {
            Text(help)
              .font(.system(size: 14))
              .foregroundStyle(look.inkSecondary)
              .cssLineHeight(20, size: 14)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Button {
          Task { await store.dismissQuestion(entryId, in: agentId) }
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(look.inkSecondary)
            .frame(width: 20, height: 20)
            .contentShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .help("Dismiss without answering")
        .accessibilityLabel("Dismiss question")
      }
      if !card.options.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(card.options.enumerated()), id: \.offset) { index, option in
            if index > 0 { Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1) }
            OptionRow(letter: String(Character(UnicodeScalar(UInt8(65 + index % 26)))), option: option, look: look) {
              Task { await store.answer(option.label, card: entryId, in: agentId) }
            }
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      if card.allowsOwnAnswer {
        HStack(alignment: .top, spacing: 8) {
          TextField("", text: $own, prompt: Text("Type your own answer").foregroundStyle(look.placeholder), axis: .vertical)
            .textFieldStyle(.plain)
            .font(.system(size: 14))
            .lineLimit(1...6)
            .padding(.vertical, 5)
            .padding(.horizontal, 10)
            .frame(minHeight: 30)
            .background(look.ground, in: RoundedRectangle(cornerRadius: 8))
            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
            .onSubmit(submit)
            .accessibilityLabel("Custom answer")
          if !own.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            CardButton(title: "Submit", look: look, action: submit)
          }
        }
      }
    }
  }

  private func submit() {
    let words = own.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !words.isEmpty else { return }
    own = ""
    Task { await store.answer(words, card: entryId, in: agentId) }
  }
}

/** One choice (`sand-widget-option`): padded 8, its letter in an 18-point ring at 40%, its label (14 on 20) and line under it (60%). */
private struct OptionRow: View {
  let letter: String
  let option: QuestionOption
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Text(letter)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(look.inkTertiary)
          .frame(minWidth: 18, minHeight: 18)
          .overlay { Capsule().strokeBorder(look.ink.opacity(0.3), lineWidth: 1) }
        VStack(alignment: .leading, spacing: 0) {
          Text(option.label)
            .font(.system(size: 14))
            .foregroundStyle(look.ink)
            .cssLineHeight(20, size: 14)
          if let line = option.description, !line.isEmpty {
            Text(line)
              .font(.system(size: 14))
              .foregroundStyle(look.inkSecondary)
              .cssLineHeight(20, size: 14)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(8)
      .background(hovering ? look.rowHover : Color.clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

// MARK: Drafts

/**
 * An email or a Slack message the agent drafted (`sand-email-composer`,
 * `sand-slack-composer`): "New email" or Slack's logo and "Slack message"
 * (14 on 22, 500) with its state in a pill; the fields on the ground, 10
 * round, one per line with a hairline under it (their names 12 at 40%,
 * their values 14 on 22 at 60%); the To and Subject of an email and the
 * words of either can be changed before sending. Send email or Send message
 * in the blue, Discard plain.
 */
struct DraftCardView: View {
  let entryId: String
  let agentId: String
  let card: DraftCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var to = ""
  @State private var subject = ""
  @State private var words = ""
  @State private var started = false

  private var editable: Bool { card.state == "editable" && !card.isDismissed }

  var body: some View {
    CardShell(look: look) {
      HStack(spacing: 8) {
        HStack(spacing: 4) {
          if card.kind == .slack, let logo = NSImage(named: "Connectors/slack") ?? NSImage(named: "Brands/slack") {
            Image(nsImage: logo).resizable().interpolation(.high).frame(width: 20, height: 20)
          }
          Text(card.kind == .email ? "New email" : "Slack message")
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(look.ink)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        StatusPill(text: card.status, look: look, dot: card.state == "sent" ? look.working : nil)
      }
      .frame(height: 22)
      VStack(spacing: 0) {
        if card.kind == .email {
          field("From") { value(card.from) }
          field("To") { input($to, placeholder: "name@example.com") }
          field("Subject") { input($subject, placeholder: "Subject") }
        } else {
          field("Workspace") { value(card.workspace) }
          field("To") { value(card.target) }
          field("Thread") { value(card.thread.isEmpty ? "New message" : card.thread) }
        }
        TextField("", text: $words, prompt: Text("Write a message").foregroundStyle(look.placeholder), axis: .vertical)
          .textFieldStyle(.plain)
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .lineSpacing(LineBox.extra(size: 14, lineHeight: 22))
          .lineLimit(3...12)
          .disabled(!editable)
          .padding(10)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel("Message")
      }
      .background(look.ground, in: RoundedRectangle(cornerRadius: 10))
      .clipShape(RoundedRectangle(cornerRadius: 10))
      if editable {
        HStack(spacing: 8) {
          CardButton(title: card.kind == .email ? "Send email" : "Send message", prominent: true, look: look, action: send)
          CardButton(title: "Discard", look: look) {
            Task { await store.discardDraft(entryId, in: agentId) }
          }
        }
      }
    }
    .onAppear {
      guard !started else { return }
      started = true
      to = card.to.joined(separator: ", ")
      subject = card.subject
      words = card.body
    }
  }

  private func field<Value: View>(_ name: String, @ViewBuilder value: () -> Value) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Text(name)
          .font(.system(size: 12))
          .foregroundStyle(look.inkTertiary)
          .fixedSize()
        value()
      }
      .padding(.vertical, 7)
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
      Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1)
    }
  }

  private func value(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 14))
      .tracking(-0.15)
      .foregroundStyle(look.inkSecondary)
      .lineLimit(1)
      .truncationMode(.tail)
  }

  private func input(_ text: Binding<String>, placeholder: String) -> some View {
    TextField("", text: text, prompt: Text(placeholder).foregroundStyle(look.placeholder))
      .textFieldStyle(.plain)
      .font(.system(size: 14))
      .tracking(-0.15)
      .foregroundStyle(look.inkSecondary)
      .disabled(!editable)
  }

  /** Send, with what was changed (`sendDraft`). */
  private func send() {
    var draft: [String: JSON] = ["body": .string(words)]
    if card.kind == .email {
      let people = to.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      draft["from"] = .string(card.from)
      draft["to"] = .array(people.map { .string($0) })
      draft["cc"] = .array(card.cc.map { .string($0) })
      draft["subject"] = .string(subject)
    } else {
      draft["workspace"] = .string(card.workspace)
      draft["target"] = .string(card.target)
      if !card.thread.isEmpty { draft["thread"] = .string(card.thread) }
    }
    Task { await store.sendDraft(entryId, in: agentId, draft: .object(draft)) }
  }
}

// MARK: Apps to connect

/**
 * Apps the agent needs (`sand-connector-card`), one card each, 8 apart:
 * the app's logo on a grey tile (40, 11 round), its name (13 on 18, 500),
 * the agent's reason or else what the app does (60%), how many tools it
 * brings once added (12, 40%); at the right "Added" in green, or Add, which
 * starts the app's sign-in in the browser.
 */
struct ConnectorCards: View {
  let names: [String]
  let reason: String?
  let look: Look

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(names, id: \.self) { name in
        ConnectorCard(name: name, reason: reason, look: look)
      }
    }
  }
}

private struct ConnectorCard: View {
  let name: String
  let reason: String?
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var adding = false

  var body: some View {
    let catalog = store.catalogApp(named: name)
    let connected = store.isConnected(name)
    let tools = store.apps.first { $0.name.lowercased() == name.lowercased() && $0.status == "connected" }?.toolCount ?? 0
    let line = reason ?? catalog?.summary ?? ""
    CardShell(look: look) {
      HStack(spacing: 12) {
        AppLogoTile(name: catalog?.title ?? name, look: look)
        VStack(alignment: .leading, spacing: 0) {
          Text(catalog?.title ?? name)
            .font(.system(size: 13, weight: .medium))
            .tracking(-0.08)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .frame(height: 18)
          if !line.isEmpty {
            Text(line)
              .font(.system(size: 13))
              .tracking(-0.08)
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
              .truncationMode(.tail)
              .frame(height: 18)
              .help(line)
          }
          if connected && tools > 0 {
            Text(tools == 1 ? "1 tool" : "\(tools) tools")
              .font(.system(size: 12))
              .foregroundStyle(look.inkTertiary)
              .frame(height: 16)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if connected {
          Text("Added")
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(look.added)
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .background(look.addedWash, in: Capsule())
        } else {
          Button {
            adding = true
            Task {
              if let url = await store.connectApp(named: name) { NSWorkspace.shared.open(url) }
              adding = false
            }
          } label: {
            Group {
              if adding { ProgressView().controlSize(.small) } else { Text("Add") }
            }
            .font(.system(size: 13))
            .foregroundStyle(look.ink)
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(look.wash, in: Capsule())
            .overlay { Capsule().strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
            .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .disabled(adding)
          .accessibilityLabel("Add \(name)")
        }
      }
    }
  }
}

/** An app's logo on its grey tile (`sand-tool-icon--logo`, 40, 11 round), or its first letter. */
struct AppLogoTile: View {
  let name: String
  let look: Look
  var side: CGFloat = 40

  var body: some View {
    Group {
      if let image = AppLogoTile.logo(name) {
        Image(nsImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fit)
      } else {
        Text(String(name.prefix(1)).uppercased())
          .font(.system(size: side * 0.42, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
      }
    }
    .frame(width: side, height: side)
    .background(look.logoTile)
    .clipShape(RoundedRectangle(cornerRadius: side * 11 / 40))
  }

  /** The app's mark (`Connectors/<slug>`), or the brand's. */
  static func logo(_ name: String) -> NSImage? {
    if let image = NSImage(named: "Connectors/\(CatalogApp.slug(name))") { return image }
    if let brand = Brands.mentions.first(where: { $0.name.lowercased() == name.lowercased() }) { return NSImage(named: "Brands/\(brand.key)") }
    return nil
  }
}

// MARK: Approvals

/**
 * An auto-review approval (`Auto-review approval`, at most 520 wide):
 * padded 12, its parts 12 apart. What the agent wants to do (14 on 22, 500)
 * with "Approval needed" in blue beside it, or once answered its outcome
 * with a dot (green, red, or grey); where it runs (12, 500, 60%); what it
 * does (13); while it waits, why it was paused (13, 60%); "Show the command"
 * or "Show the details", which unfolds it (cut at 340 characters). Allow
 * once in the blue, Always allow (which adds the proposed rule to
 * Auto-review) and Deny plain.
 */
struct ApprovalCardView: View {
  let entryId: String
  let agentId: String
  let requestId: String
  let summary: String
  let reason: String
  let command: String?
  let status: String
  let surface: String?
  let proposedRule: String?
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var unfolded = false
  @State private var answering = false

  var body: some View {
    let settled = store.answeredApprovals[entryId] ?? status
    let heading = AutoReviewCard.title(surface: surface)
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .top, spacing: 8) {
          Text(heading.title)
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(look.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 22)
          badge(settled)
        }
        if let place = AutoReviewCard.location(surface: surface) {
          Text(place)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(look.inkSecondary)
        }
        if let line = command == nil ? summary : AutoReviewCard.summaryLine(summary: summary, command: command), !line.isEmpty {
          Text(line)
            .font(.system(size: 13))
            .foregroundStyle(look.ink)
        }
        if settled == "pending" && !reason.isEmpty {
          Text(reason)
            .font(.system(size: 13))
            .tracking(-0.08)
            .foregroundStyle(look.inkSecondary)
        }
        if let folded = command ?? (summary.isEmpty ? nil : summary), heading.subject == .command || command != nil {
          Button { unfolded.toggle() } label: {
            HStack(spacing: 6) {
              Image(systemName: unfolded ? "chevron.down" : "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .frame(width: 14, height: 14)
              Text(unfolded ? (heading.subject == .command ? "Hide the command" : "Hide the details") : (heading.subject == .command ? "Show the command" : "Show the details"))
                .font(.system(size: 13))
            }
            .foregroundStyle(look.inkSecondary)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          if unfolded {
            CodeBlock(language: nil, text: AutoReviewCard.clip(folded), look: look)
          }
        }
        if let note = AutoReviewCard.settledNote(status: settled, rule: AutoReviewCard.rule(proposed: proposedRule)) {
          Text(note)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
        }
      }
      if settled == "pending" {
        HStack(spacing: 8) {
          CardButton(title: "Allow once", prominent: true, look: look) { resolve("approved") }
          CardButton(title: "Always allow", look: look) { resolve("always") }
          CardButton(title: "Deny", look: look) { resolve("denied") }
        }
        .disabled(answering)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(look.theirs, in: RoundedRectangle(cornerRadius: 16))
    .overlay { RoundedRectangle(cornerRadius: 16).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
    .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Auto-review approval")
  }

  @ViewBuilder
  private func badge(_ status: String) -> some View {
    if status == "pending" {
      HStack(spacing: 4) {
        Image(systemName: "hand.raised.fill")
          .font(.system(size: 10))
          .frame(width: 14, height: 14)
        Text("Approval needed")
          .font(.system(size: 13, weight: .medium))
          .tracking(-0.08)
      }
      .foregroundStyle(look.blue)
      .padding(EdgeInsets(top: 2, leading: 4, bottom: 2, trailing: 8))
      .background(look.yours.opacity(0.12), in: Capsule())
      .fixedSize()
    } else if let shown = AutoReviewCard.badge(status: status) {
      let colours = badgeColours(shown.kind)
      HStack(spacing: 6) {
        Circle().fill(colours.dot).frame(width: 6, height: 6)
        Text(shown.label)
          .font(.system(size: 13, weight: .medium))
          .tracking(-0.08)
          .foregroundStyle(colours.ink)
      }
      .padding(.vertical, 2)
      .padding(.horizontal, 8)
      .background(colours.wash, in: Capsule())
      .fixedSize()
    }
  }

  private func badgeColours(_ kind: AutoReviewCard.BadgeKind) -> (dot: Color, ink: Color, wash: Color) {
    switch kind {
    case .success: return (look.working, look.added, look.addedWash)
    case .danger: return (Color(hex: 0xff263c), look.dark ? Color(hex: 0xff5667) : Color(hex: 0xc21d2e), Color(hex: 0xff263c).opacity(look.dark ? 0.16 : 0.09))
    case .muted: return (look.inkTertiary, look.inkSecondary, look.wash)
    }
  }

  private func resolve(_ resolution: String) {
    answering = true
    Task {
      await store.resolveApproval(requestId, resolution: resolution, proposedRule: proposedRule, entryId: entryId, in: agentId)
      answering = false
    }
  }
}

// MARK: Routines that wake on Slack or GitHub

/**
 * "Connect Slack" (`sand-listener-connect-card`, at most 420 wide, 14
 * round): the platform's logo on a faint tile (30, 8 round), its title (12
 * on 16, 600) and the reason under it (60%); at the right "Connected" with
 * a green tick, Connect, or a spinner while the computer is asked.
 */
struct ListenerConnectCardView: View {
  let platform: String
  let reason: String?
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var connected: Bool?
  @State private var opening = false

  var body: some View {
    let name = platform == "slack" ? "Slack" : "GitHub"
    let words = reason.map { "Connect \(name) \($0)." } ?? "Connect \(name) so this routine can fire."
    HStack(alignment: .top, spacing: 10) {
      Group {
        if let logo = NSImage(named: "Connectors/\(platform)") ?? NSImage(named: "Brands/\(platform)") {
          Image(nsImage: logo).resizable().interpolation(.high).aspectRatio(contentMode: .fit).frame(width: 18, height: 18)
        }
      }
      .frame(width: 30, height: 30)
      .background(look.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
      VStack(alignment: .leading, spacing: 3) {
        Text("Connect \(name)")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(look.ink)
        Text(words)
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Group {
        if connected == true {
          HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(look.working)
            Text("Connected").font(.system(size: 12, weight: .medium)).foregroundStyle(look.ink)
          }
        } else if connected == false {
          Button {
            opening = true
            Task {
              if let url = await store.listenerConnectURL(platform) { NSWorkspace.shared.open(url) }
              opening = false
            }
          } label: {
            Text("Connect")
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(look.dark ? Color.black : Color.white)
              .padding(.horizontal, 10)
              .frame(height: 24)
              .background(look.ink, in: RoundedRectangle(cornerRadius: 6))
          }
          .buttonStyle(.plain)
          .disabled(opening)
        } else {
          ProgressView().controlSize(.small)
            .accessibilityLabel("Checking connection status")
        }
      }
      .fixedSize()
    }
    .padding(12)
    .frame(maxWidth: 420, alignment: .leading)
    .background(look.theirs, in: RoundedRectangle(cornerRadius: 14))
    .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
    .task(id: platform) {
      connected = await store.listenerConnected(platform) ?? false
    }
  }
}

// MARK: Secrets

/**
 * A secret the agent asks for (`sand-secret-request`): its name (14 on 22,
 * 500) and why (60%); a field ("Paste your <name>", on the ground with a
 * 15% edge, 32 high) and Save securely in the blue; under them a lock and
 * "Stored securely, never shown to your agent." (13, 40%). Once saved:
 * "Saved securely and kept private." and a "Saved" pill.
 */
struct SecretCardView: View {
  let entryId: String
  let agentId: String
  let label: String
  let description: String
  let provided: Bool
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var value = ""
  @State private var saving = false
  @State private var saved = false

  var body: some View {
    CardShell(look: look) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 0) {
          Text(label)
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(look.ink)
            .cssLineHeight(22, size: 14, weight: .medium)
          let line = provided || saved ? "Saved securely and kept private." : description
          if !line.isEmpty {
            Text(line)
              .font(.system(size: 14))
              .tracking(-0.15)
              .foregroundStyle(look.inkSecondary)
              .cssLineHeight(22, size: 14)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if provided || saved {
          StatusPill(text: "Saved", look: look, dot: look.working)
        }
      }
      if !(provided || saved) {
        HStack(alignment: .top, spacing: 8) {
          SecureField("", text: $value, prompt: Text("Paste your \(label)").foregroundStyle(look.placeholder))
            .textFieldStyle(.plain)
            .font(.system(size: 14))
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(look.ground, in: RoundedRectangle(cornerRadius: 8))
            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
            .onSubmit(save)
          CardButton(title: "Save securely", prominent: true, look: look, action: save)
            .disabled(saving || value.isEmpty)
        }
        HStack(alignment: .top, spacing: 4) {
          Image(systemName: "lock.fill")
            .font(.system(size: 9))
            .frame(width: 12, height: 12)
            .padding(.top, 3)
          Text("Stored securely, never shown to your agent.")
            .font(.system(size: 13))
            .tracking(-0.08)
        }
        .foregroundStyle(look.inkTertiary)
      }
    }
  }

  private func save() {
    let secret = value
    guard !secret.isEmpty, !saving else { return }
    saving = true
    Task {
      await store.submitSecret(secret, entryId: entryId, in: agentId)
      value = ""
      saving = false
      saved = true
    }
  }
}

// MARK: Pictures

/**
 * An agent's pictures under its words (`sand-message-attachments__strip`,
 * 8 below them): one row, 6 apart, each 12 round and 192 high at its own
 * width, the row at most 86% of the chat, 560, or the chat less 82 (smaller
 * together when wider). Grey until drawn. Opening one full screen comes with
 * the file preview.
 */
struct PictureStrip: View {
  let images: [ChatImage]
  let agentId: String
  let limit: CGFloat
  let look: Look

  var body: some View {
    let ratios = images.map { image -> CGFloat in
      guard let w = image.width, let h = image.height, w > 0, h > 0 else { return 1 }
      return CGFloat(w / h)
    }
    let gaps = CGFloat(max(0, images.count - 1)) * 6
    let natural = ratios.reduce(0, +) * 192
    let height = natural + gaps > limit && natural > 0 ? max(48, (limit - gaps) / ratios.reduce(0, +)) : 192
    HStack(spacing: 6) {
      ForEach(Array(images.enumerated()), id: \.offset) { index, image in
        ChatPicture(image: image, agentId: agentId, look: look)
          .frame(width: (height * ratios[index]).rounded(), height: height.rounded())
          .clipShape(RoundedRectangle(cornerRadius: 12))
      }
    }
  }
}

/** One picture: read from the agent's computer (or the web), grey until it is. */
struct ChatPicture: View {
  let image: ChatImage
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var picture: NSImage?

  var body: some View {
    ZStack {
      look.codeWash
      if let picture {
        Image(nsImage: picture).resizable().interpolation(.high).aspectRatio(contentMode: .fill)
      }
    }
    .accessibilityLabel(image.alt.isEmpty ? "Picture" : image.alt)
    .task(id: image.url) {
      if image.url.hasPrefix("https://"), let url = URL(string: image.url) {
        if let (data, _) = try? await URLSession.shared.data(from: url) { picture = NSImage(data: data) }
      } else if let data = await store.readFile(image.url, agentId: agentId) {
        picture = NSImage(data: data)
      }
    }
  }
}

// MARK: Links

/**
 * A message that is one link, drawn as a card (`sand-link-card-wrap`, at
 * most 76% of the chat, 420, or the chat less 82): the ground, a 10% edge,
 * 18 round; the page's icon (or a globe) in a 60-point square, its title
 * or address (13 on 18, 600) and the address under it (12, 60%). It opens
 * in the browser.
 */
struct LinkCardView: View {
  let url: URL
  let look: Look
  @State private var meta: LinkMetadata?

  var body: some View {
    Button {
      NSWorkspace.shared.open(url)
    } label: {
      HStack(spacing: 0) {
        Group {
          if let data = meta?.favicon, let icon = NSImage(data: data) {
            Image(nsImage: icon).resizable().interpolation(.high).frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 4))
          } else {
            Image(systemName: "globe").font(.system(size: 14)).foregroundStyle(look.inkSecondary)
          }
        }
        .frame(width: 60, height: 60)
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 13, weight: .semibold))
            .tracking(-0.08)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .truncationMode(.tail)
          Text(url.absoluteString)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 12))
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .frame(maxWidth: .infinity)
      .background(look.ground, in: RoundedRectangle(cornerRadius: 18))
      .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(look.ink.opacity(0.1), lineWidth: 1) }
      .contentShape(RoundedRectangle(cornerRadius: 18))
    }
    .buttonStyle(.plain)
    .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
    .help(url.absoluteString)
    .task(id: url) { meta = await LinkMetadataReader.shared.metadata(for: url.absoluteString) }
  }

  private var title: String {
    if let page = meta?.title.trimmingCharacters(in: .whitespacesAndNewlines), !page.isEmpty { return page }
    return url.host() ?? url.absoluteString
  }
}

// MARK: Around a message

/** The line a reply answers, over its message (`sand-reply-quote`): an arrow and the line, 13, at 40%. Jumping to it is step 2d. */
struct ReplyQuote: View {
  let text: String
  let look: Look

  var body: some View {
    Button {} label: {
      HStack(spacing: 4) {
        Image(systemName: "arrowshape.turn.up.left")
          .font(.system(size: 10))
          .frame(width: 14, height: 14)
        Text(text)
          .font(.system(size: 13))
          .lineLimit(1)
          .truncationMode(.tail)
      }
      .foregroundStyle(look.inkTertiary)
      .padding(EdgeInsets(top: 4, leading: 8, bottom: 0, trailing: 8))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Jump to replied message")
  }
}

/** Where a message came from or went (`sand-channel-tag`): an arrow and the platform (11, 500) in a faint pill of the bubble's own ink, 6 under its words. */
struct ChannelTagView: View {
  let tag: ChannelTag
  let ink: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: tag.inbound ? "arrow.down.left" : "arrow.up.right")
        .font(.system(size: 8, weight: .semibold))
      Text(tag.platform)
        .font(.system(size: 11, weight: .medium))
        .tracking(0.07)
    }
    .foregroundStyle(ink.opacity(0.65))
    .padding(EdgeInsets(top: 2, leading: 6, bottom: 2, trailing: 7))
    .background(ink.opacity(0.078), in: Capsule())
    .padding(.top, 6)
    .help(tag.title)
    .accessibilityLabel(tag.title)
  }
}

/**
 * A call's record in the chat (`simeon-call-record`, 340 wide at most): a
 * phone in a faint circle (30), "Voice call" (600) and its length (13, 60%),
 * a chevron that opens the recap under a hairline, 40 in.
 */
struct CallRecordView: View {
  let duration: String
  let recap: String?
  let look: Look
  @State private var open = false

  /** "Voice call · 2:48", then the recap (`__simeonCallRecordParse`). */
  static func parse(_ text: String) -> (duration: String, recap: String?)? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.hasPrefix("Voice call · "), let pattern = CallRecordView.pattern else { return nil }
    let ns = trimmed as NSString
    guard let match = pattern.firstMatch(in: trimmed, range: NSRange(location: 0, length: ns.length)) else { return nil }
    let duration = ns.substring(with: match.range(at: 1))
    let recapRange = match.range(at: 2)
    let recap = recapRange.location == NSNotFound ? nil : ns.substring(with: recapRange).trimmingCharacters(in: .whitespacesAndNewlines)
    return (duration, recap?.isEmpty == true ? nil : recap)
  }

  private static let pattern = try? NSRegularExpression(pattern: #"^Voice call · (\d{1,2}:\d{2}(?::\d{2})?)(?:\n\n([\s\S]+))?$"#)

  var body: some View {
    let has = recap != nil
    VStack(alignment: .leading, spacing: 0) {
      Button { if has { withAnimation(.easeInOut(duration: 0.22)) { open.toggle() } } } label: {
        HStack(spacing: 10) {
          Image(systemName: "phone.fill")
            .font(.system(size: 12))
            .foregroundStyle(look.ink)
            .frame(width: 30, height: 30)
            .background(look.dark ? Color.white.opacity(0.10) : Color.black.opacity(0.06), in: Circle())
          VStack(alignment: .leading, spacing: 1) {
            Text("Voice call").fontWeight(.semibold)
            Text(duration)
              .font(.system(size: 13))
              .monospacedDigit()
              .foregroundStyle(look.inkSecondary)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          if has {
            Image(systemName: "chevron.right")
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(look.inkSecondary)
              .rotationEffect(.degrees(open ? 90 : 0))
              .frame(width: 14, height: 14)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(!has)
      if open, let recap {
        VStack(alignment: .leading, spacing: 0) {
          Rectangle().fill(look.dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08)).frame(height: 1)
          Text(recap)
            .padding(.top, 8)
            .padding(.leading, 40)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 8)
      }
    }
    .frame(maxWidth: 340, alignment: .leading)
  }
}

// MARK: Flights

/**
 * Flight results (`simeon-flights`, in the agent's bubble, at most 420
 * wide): the route (15 on 20, 500) and the trip under it (13, grey); then
 * one row per offer, padded 10 and 12 round, reaching 10 past the words on
 * both sides: the airline's mark in a white circle (36, its logo or its
 * initials), the times (15) over the airline, time in the air and stops
 * (13, grey), the price (15) and a chevron; half-point hairlines between
 * rows from the times' edge. Apple's own greys, as the window sets them.
 * Opening an offer shows it in the agent pane (step 7).
 */
struct FlightsCardView: View {
  let card: FlightsCard
  let look: Look

  private var grey: Color { look.dark ? Color(hex: 0x98989d) : Color(hex: 0x86868b) }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !card.title.isEmpty || !card.subtitle.isEmpty {
        VStack(alignment: .leading, spacing: 1) {
          if !card.title.isEmpty {
            Text(card.title)
              .font(.system(size: 15, weight: .medium))
              .tracking(-0.15)
              .foregroundStyle(look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f))
          }
          if !card.subtitle.isEmpty {
            Text(card.subtitle)
              .font(.system(size: 13))
              .foregroundStyle(grey)
          }
        }
        .padding(.top, 2)
        .padding(.bottom, 8)
      }
      VStack(spacing: 0) {
        ForEach(Array(card.offers.enumerated()), id: \.offset) { index, offer in
          if index > 0 {
            Rectangle()
              .fill(look.dark ? Color(red: 84 / 255, green: 84 / 255, blue: 88 / 255).opacity(0.5) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.14))
              .frame(height: 0.5)
              .padding(.leading, 58)
              .padding(.trailing, 10)
          }
          FlightRow(offer: offer, grey: grey, look: look)
        }
      }
      .padding(.horizontal, -10)
    }
    .monospacedDigit()
    .fixedSize(horizontal: true, vertical: false)
    .frame(maxWidth: 420, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(card.title.isEmpty ? "Flights" : card.title)
  }
}

private struct FlightRow: View {
  let offer: FlightOffer
  let grey: Color
  let look: Look
  @State private var hovering = false

  var body: some View {
    let ink = look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f)
    let stops = offer.stops.components(separatedBy: " · ")
    Button {} label: {
      HStack(spacing: 12) {
        AirlineMark(name: offer.airline, logo: offer.logo)
        VStack(alignment: .leading, spacing: 1) {
          Text([offer.depart, offer.arrive].filter { !$0.isEmpty }.joined(separator: " – "))
            .font(.system(size: 15))
            .tracking(-0.15)
            .foregroundStyle(ink)
            .lineLimit(1)
          Text([offer.airline, offer.duration, stops.first ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
            .font(.system(size: 13))
            .foregroundStyle(grey)
            .lineLimit(1)
            .truncationMode(.tail)
          if stops.count > 1 {
            Text(stops.dropFirst().joined(separator: " · "))
              .font(.system(size: 13))
              .foregroundStyle(grey)
              .lineLimit(1)
              .truncationMode(.tail)
          }
        }
        Spacer(minLength: 0)
        Text(offer.price)
          .font(.system(size: 15))
          .tracking(-0.15)
          .foregroundStyle(ink)
          .lineLimit(1)
        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(look.dark ? Color(hex: 0x48484a) : Color(hex: 0xc7c7cc))
          .frame(width: 12, height: 12)
      }
      .padding(10)
      .background(hovering ? Color(red: 120 / 255, green: 120 / 255, blue: 128 / 255).opacity(look.dark ? 0.24 : 0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
      .contentShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

/** An airline's mark (`simeon-flight-mark--row`): its logo (22) or its initials (12, 500, grey) in a white circle with a faint ring. */
struct AirlineMark: View {
  let name: String
  let logo: String
  var side: CGFloat = 36
  @State private var picture: NSImage?

  var body: some View {
    ZStack {
      Circle().fill(Color.white)
      if let picture {
        Image(nsImage: picture).resizable().interpolation(.high).aspectRatio(contentMode: .fit).frame(width: side * 22 / 36, height: side * 22 / 36)
      } else {
        Text(FlightsCard.initials(name))
          .font(.system(size: side / 3, weight: .medium))
          .foregroundStyle(Color(hex: 0x6e6e73))
      }
    }
    .overlay { Circle().strokeBorder(Color.black.opacity(0.12), lineWidth: 0.5) }
    .frame(width: side, height: side)
    .task(id: logo) {
      guard logo.hasPrefix("https://"), let url = URL(string: logo), let (data, _) = try? await URLSession.shared.data(from: url) else { return }
      picture = NSImage(data: data)
    }
  }
}
