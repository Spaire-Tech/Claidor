import AppKit
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

/**
 * The cards an agent sends into the chat, copied from the Electron
 * window's (measured from its Gallery chat, mac/STEPS.md step 2c). Every
 * card is as wide as a message may be (88% of the chat, 640, or the chat
 * less 82), grey like an agent's bubble, its parts 10 apart; 20 round and
 * padded 14 by 16 since 10 November 2026, as the question card.
 */
struct CardShell<Content: View>: View {
  let look: Look
  var spacing: CGFloat = 10
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      content()
    }
    .padding(.vertical, 14)
    .padding(.horizontal, 16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background { RoundedRectangle(cornerRadius: 20, style: .continuous).fill(look.theirs).shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1) }
    .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
  }
}

/** A card's state in a small grey pill with a dot (`role="status"`): "Ready to send", "Sent", "Dismissed". */
struct StatusPill: View {
  let text: String
  let look: Look
  var dot: Color?
  var ink: Color?
  var wash: Color?
  /** The approval and cloud agent pills: 13 on 18, 22 high. */
  var large = false

  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(dot ?? look.inkTertiary).frame(width: 6, height: 6)
      Text(text)
        .font(.system(size: large ? 13 : 12, weight: .medium))
        .tracking(large ? -0.08 : 0)
        .foregroundStyle(ink ?? look.inkSecondary)
        .lineLimit(1)
    }
    .padding(.vertical, 2)
    .padding(.horizontal, 8)
    .frame(height: large ? 22 : 20)
    .background(wash ?? look.wash, in: Capsule())
    .fixedSize()
  }
}

/**
 * A card's buttons (10 November 2026, the question card's; the founder: "go for your suggestions"): pills 32 high, the
 * main one (`prominent`) in our blue (the founder: "make them our blue"), the others grey, `danger` in red words;
 * `money` is the same blue, for paying. A card puts them at its right, the main one last.
 */
struct CardButton: View {
  enum Tone { case plain, danger, money }
  let title: String
  var prominent = false
  var tone: Tone = .plain
  let look: Look
  let action: () -> Void
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13.5, weight: .medium))
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.horizontal, 16)
        .frame(height: 32)
        .background(fill, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .opacity(enabled ? 1 : 0.4)
    .onHover { hovering = $0 }
    .fixedSize()
  }

  private var ink: Color {
    if prominent || tone == .money { return .white }
    return tone == .danger ? look.danger : look.ink
  }

  private var fill: Color {
    if prominent || tone == .money { return look.yours.opacity(hovering && enabled ? 0.88 : 1) }
    return look.ink.opacity(hovering && enabled ? (look.dark ? 0.12 : 0.10) : (look.dark ? 0.08 : 0.06))
  }
}

// MARK: Questions

/**
 * A question card (10 November 2026, the founder's reference: "change our
 * card style to this. but keep the round check and our blue color"): the
 * question in bold, its help under it; each choice in a row with its letter
 * on a small tile (A, B, C…) that becomes our blue round check once picked;
 * "Something else" last when the agent allows an answer of the person's own,
 * which opens a field in its row. A card may ask several questions ("have
 * the thing swipe when there's many questions"): one shows at a time and
 * slides to the next, dots at the foot say where the person is, and Back,
 * Skip and Next (Send on the last) carry them through; the answers go
 * together, a line each (`QuestionCard.reply`). A pick moves on by itself,
 * and on the last question sends. Skip on a card of one question declines
 * it, as the X did. Answered, the card keeps each question in grey with its
 * answer after a thin blue tick (as before the new style, the founder, 11
 * November 2026), Back and Next to look through several.
 */
struct QuestionCardView: View {
  let entryId: String
  let agentId: String
  let card: QuestionCard
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let pending = store.pendingAnswers[entryId]
    if card.isDismissed || card.isSkipped || pending == "" {
      VStack(alignment: .leading, spacing: 10) {
        Text(card.prompt)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
        StatusPill(text: String(localized: "Dismissed"), look: look)
      }
      .padding(.horizontal, 8)
      .questionCard(look)
    } else if let answer = card.answer ?? pending {
      AnsweredQuestionsView(card: card, answer: answer, look: look)
    } else {
      AskingQuestionsView(entryId: entryId, agentId: agentId, card: card, look: look)
    }
  }
}

/** The questions being asked, one at a time. */
private struct AskingQuestionsView: View {
  let entryId: String
  let agentId: String
  let card: QuestionCard
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var index = 0
  @State private var forward = true
  /** The options picked, by question. */
  @State private var picks: [Int: Set<Int>] = [:]
  /** The words typed under "Something else", by question. */
  @State private var own: [Int: String] = [:]
  /** The question whose "Something else" field is open. */
  @State private var writing: Int?
  @State private var sending = false
  @FocusState private var typing: Int?

  private var questions: [QuestionCard.Question] { card.questions }
  private var isLast: Bool { index >= questions.count - 1 }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      ZStack(alignment: .topLeading) {
        // Every question, unseen, holds the card at the tallest one's height, so it never jumps as it slides.
        ForEach(questions.indices, id: \.self) { at in
          page(at, live: false).hidden().accessibilityHidden(true)
        }
        page(index, live: true)
          .id(index)
          .transition(slide)
      }
      .clipped()
      footer
    }
    .questionCard(look)
  }

  private var slide: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                       removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity))
  }

  private func page(_ at: Int, live: Bool) -> some View {
    let question = questions[at]
    return VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(question.prompt)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
        if let help = question.help, !help.isEmpty {
          Text(help)
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.horizontal, 8)
      VStack(spacing: 2) {
        ForEach(Array(question.options.enumerated()), id: \.offset) { place, option in
          LetteredOptionRow(letter: Self.letter(place), option: option, picked: picks[at, default: []].contains(place), look: look) {
            choose(place, in: at)
          }
        }
        if question.allowsOwnAnswer { ownRow(at, live: live) }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /** "Something else": its letter and grey words, a field in the row once clicked. */
  private func ownRow(_ at: Int, live: Bool) -> some View {
    let words = own[at, default: ""]
    let open = writing == at || !words.isEmpty
    let given = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    return QuestionRowFrame(picked: given, look: look) {
      QuestionTile(letter: Self.letter(questions[at].options.count), picked: given, look: look)
      if open {
        TextField("", text: Binding(get: { own[at, default: ""] }, set: { typed in
          own[at] = typed
          // One answer to a question of one: the words replace a pick.
          if !questions[at].multiSelect && !typed.isEmpty { picks[at] = [] }
        }), prompt: Text("Something else").foregroundStyle(look.placeholder), axis: .vertical)
          .textFieldStyle(.plain)
          .font(.system(size: 14.5))
          .foregroundStyle(look.ink)
          .lineLimit(1...4)
          .focused($typing, equals: live ? at : -1 - at)
          .onSubmit(next)
          .accessibilityLabel("Your own answer")
      } else {
        Text("Something else")
          .font(.system(size: 14.5))
          .foregroundStyle(look.placeholder)
      }
    } action: {
      writing = at
      // The field appears with this change; it takes the typing on the next beat, once it is there.
      Task { typing = at }
    }
  }

  private var footer: some View {
    HStack(spacing: 8) {
      if questions.count > 1 { QuestionDots(count: questions.count, at: index, look: look) }
      Spacer(minLength: 0)
      if index > 0 {
        QuestionPill(title: String(localized: "Back"), look: look) { move(to: index - 1) }
      }
      QuestionPill(title: String(localized: "Skip"), look: look, action: skip)
        .help(questions.count > 1 ? String(localized: "Skip this question") : String(localized: "Dismiss without answering"))
      QuestionPill(title: isLast ? String(localized: "Send") : String(localized: "Next"), prominent: true, look: look, action: next)
        .disabled(answer(index) == nil || sending)
    }
    .padding(.horizontal, 8)
  }

  static func letter(_ place: Int) -> String {
    let letters = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    return String(letters[max(0, min(place, letters.count - 1))])
  }

  /** The answer given to one question: the options picked (one per line), else, or with them for several, the words typed. */
  private func answer(_ at: Int) -> String? {
    guard questions.indices.contains(at) else { return nil }
    let question = questions[at]
    let words = own[at, default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
    // Each pick sends the option's own reply (`value`), never its label.
    let chosen = picks[at, default: []].sorted().compactMap { place in question.options.indices.contains(place) ? question.options[place] : nil }.map { option in option.value }
    let all = question.multiSelect ? chosen + (words.isEmpty ? [] : [words]) : (words.isEmpty ? chosen : [words])
    return all.isEmpty ? nil : all.joined(separator: "\n")
  }

  private func choose(_ place: Int, in at: Int) {
    guard !sending else { return }
    if questions[at].multiSelect {
      var now = picks[at, default: []]
      if now.contains(place) { now.remove(place) } else { now.insert(place) }
      picks[at] = now
      return
    }
    picks[at] = [place]
    own[at] = ""
    writing = nil
    // A pick moves on by itself once its check has shown: to the next question, or, on the last, sends.
    Task {
      try? await Task.sleep(for: .milliseconds(220))
      if index == at, picks[at, default: []] == Set([place]) { next() }
    }
  }

  private func move(to target: Int) {
    guard questions.indices.contains(target), target != index else { return }
    forward = target > index
    writing = nil
    typing = nil
    withAnimation(reduceMotion ? .easeInOut(duration: 0.15) : .smooth(duration: 0.34)) { index = target }
  }

  private func next() {
    guard !sending, answer(index) != nil else { return }
    if isLast { send() } else { move(to: index + 1) }
  }

  /** Skip: this question goes unanswered; on a card of one, the card is declined. */
  private func skip() {
    guard !sending else { return }
    picks[index] = []
    own[index] = ""
    if isLast { send() } else { move(to: index + 1) }
  }

  private func send() {
    sending = true
    let reply = card.reply(questions.indices.map(answer))
    Task {
      if let reply { await store.answer(reply, card: entryId, in: agentId) } else { await store.dismissQuestion(entryId, in: agentId) }
      sending = false
    }
  }
}

/** The answers given: each question in grey with its answer after a thin blue tick, one at a time for several. */
private struct AnsweredQuestionsView: View {
  let card: QuestionCard
  let answer: String
  let look: Look
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var index = 0
  @State private var forward = true

  var body: some View {
    let answers = card.answers(answer)
    VStack(alignment: .leading, spacing: 12) {
      ZStack(alignment: .topLeading) {
        ForEach(card.questions.indices, id: \.self) { at in
          page(at, answers).hidden().accessibilityHidden(true)
        }
        page(index, answers)
          .id(index)
          .transition(slide)
      }
      .clipped()
      if card.asksSeveral {
        HStack(spacing: 8) {
          QuestionDots(count: card.questions.count, at: index, look: look)
          Spacer(minLength: 0)
          QuestionPill(title: String(localized: "Back"), look: look) { move(to: index - 1) }
            .disabled(index == 0)
          QuestionPill(title: String(localized: "Next"), look: look) { move(to: index + 1) }
            .disabled(index >= card.questions.count - 1)
        }
        .padding(.horizontal, 8)
      }
    }
    .questionCard(look)
  }

  private var slide: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                       removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity))
  }

  private func page(_ at: Int, _ answers: [String?]) -> some View {
    let given = at < answers.count ? answers[at] : nil
    return VStack(alignment: .leading, spacing: 10) {
      Text(card.questions[at].prompt)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        if let given {
          // A thin blue tick, as before the cards' new style (11 November 2026, the founder: "bring
          // back how it was before"); the round check stays on the option picked.
          Image(systemName: "checkmark")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(look.blue)
            .frame(width: 18, height: 18)
          Text(given)
            .font(.system(size: 14.5))
            .foregroundStyle(look.ink)
            .fixedSize(horizontal: false, vertical: true)
        } else {
          Text("Skipped")
            .font(.system(size: 14.5))
            .foregroundStyle(look.inkTertiary)
        }
        Spacer(minLength: 0)
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel(given.map { String(localized: "Your answer: \($0)") } ?? String(localized: "Skipped"))
    }
    .padding(.horizontal, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func move(to target: Int) {
    guard card.questions.indices.contains(target), target != index else { return }
    forward = target > index
    withAnimation(reduceMotion ? .easeInOut(duration: 0.15) : .smooth(duration: 0.34)) { index = target }
  }
}

/** One choice: its letter on a tile (our blue round check once picked), its label (blue for the recommended path, red for a destructive one) and its line under it. */
private struct LetteredOptionRow: View {
  let letter: String
  let option: QuestionOption
  let picked: Bool
  let look: Look
  let action: () -> Void

  var body: some View {
    QuestionRowFrame(picked: picked, look: look) {
      QuestionTile(letter: letter, picked: picked, look: look)
      VStack(alignment: .leading, spacing: 1) {
        Text(option.label)
          .font(.system(size: 14.5, weight: option.style == .primary ? .medium : .regular))
          .foregroundStyle(option.style == .danger ? look.danger : option.style == .primary ? look.blue : look.ink)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
        if let line = option.description, !line.isEmpty {
          Text(line)
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    } action: {
      action()
    }
    .accessibilityAddTraits(picked ? .isSelected : [])
  }
}

/** A choice's row: 12 round, the hover's grey, a lighter grey once picked. */
private struct QuestionRowFrame<Content: View>: View {
  let picked: Bool
  let look: Look
  @ViewBuilder let content: () -> Content
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(alignment: .center, spacing: 12) {
        content()
        Spacer(minLength: 0)
      }
      .padding(.vertical, 7)
      .padding(.horizontal, 8)
      .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(picked ? look.ink.opacity(look.dark ? 0.08 : 0.06) : hovering ? look.rowHover : Color.clear))
      .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** A choice's letter on a small tile, or our blue round check once picked. */
private struct QuestionTile: View {
  let letter: String
  let picked: Bool
  let look: Look

  var body: some View {
    ZStack {
      if picked {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 22))
          .foregroundStyle(look.blue)
          .transition(.scale(scale: 0.6).combined(with: .opacity))
      } else {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
          .fill(look.ink.opacity(look.dark ? 0.06 : 0.04))
          .overlay { RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1) }
          .overlay {
            Text(letter)
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(look.inkSecondary)
          }
          .transition(.opacity)
      }
    }
    .frame(width: 24, height: 24)
    .animation(.spring(response: 0.25, dampingFraction: 0.8), value: picked)
    .accessibilityHidden(true)
  }
}

/** Where the person is among a card's questions. */
private struct QuestionDots: View {
  let count: Int
  let at: Int
  let look: Look

  var body: some View {
    HStack(spacing: 6) {
      ForEach(0..<count, id: \.self) { place in
        Circle()
          .fill(look.ink.opacity(place == at ? 0.5 : 0.14))
          .frame(width: 7, height: 7)
      }
    }
    .animation(.easeOut(duration: 0.2), value: at)
    .accessibilityElement()
    .accessibilityLabel(Text("Question \(at + 1) of \(count)"))
  }
}

/** The card's buttons: grey capsules, Next and Send in our blue. */
private struct QuestionPill: View {
  let title: String
  var prominent = false
  let look: Look
  let action: () -> Void
  @Environment(\.isEnabled) private var enabled

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13.5, weight: .medium))
        .foregroundStyle(prominent ? Color.white : look.ink)
        .lineLimit(1)
        .padding(.horizontal, 16)
        .frame(height: 32)
        .background(prominent ? look.yours : look.ink.opacity(look.dark ? 0.08 : 0.06), in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .opacity(enabled ? 1 : 0.4)
    .fixedSize()
  }
}

private extension View {
  /** A question card's ground: the agent's grey, 20 round. */
  func questionCard(_ look: Look) -> some View {
    self
      .padding(.horizontal, 10)
      .padding(.top, 14)
      .padding(.bottom, 12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background { RoundedRectangle(cornerRadius: 20, style: .continuous).fill(look.theirs).shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1) }
      .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
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
  @State private var cc = ""
  @State private var subject = ""
  @State private var words = ""
  @State private var started = false
  @State private var wordsFocused = false
  /** The words' height, as the text view measures it. */
  @State private var wordsHeight: CGFloat = 0

  private var editable: Bool { card.state == "editable" && !card.isDismissed }
  /** The words' box: 3 lines of 22 at least, 12 at most (then it scrolls), and its 10 above and below. */
  private var wordsBox: CGFloat { min(12 * 22, max(3 * 22, wordsHeight)) + 20 }

  var body: some View {
    CardShell(look: look) {
      HStack(spacing: 8) {
        HStack(spacing: 4) {
          if card.kind == .slack, let logo = NSImage(named: "Connectors/slack") ?? NSImage(named: "Brands/slack") {
            Image(nsImage: logo).resizable().interpolation(.high).frame(width: 20, height: 20)
          }
          Text(card.kind == .email ? (card.isReply ? "Reply" : "New email") : "Slack message")
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
          field(String(localized: "From")) { value(card.from) }
          field(String(localized: "To")) { input($to, placeholder: String(localized: "name@example.com")) }
          // Cc, always there to add to (28 October 2026: a reply's Cc was on the card and nobody could see it).
          field(String(localized: "Cc")) { input($cc, placeholder: "") }
          field(String(localized: "Subject")) { input($subject, placeholder: String(localized: "Subject")) }
        } else {
          field(String(localized: "Workspace")) { value(card.workspace) }
          field(String(localized: "To")) { value(card.target) }
          field(String(localized: "Thread")) { value(card.thread.isEmpty ? String(localized: "New message") : card.thread) }
        }
        // The Mac's own text view (`PaneTextArea`): Return is a new line, and a long draft scrolls in its box. A text
        // field that grew had neither: Return ended it and the keys went on to the next field, its words all chosen,
        // and past 12 lines it would not scroll (the founder, 28 October 2026).
        PaneTextArea(text: $words, focused: $wordsFocused, height: $wordsHeight, ink: NSColor(look.ink), editable: editable,
                     fontSize: 14, lineHeight: 22, inset: CGSize(width: 10, height: 10)) {}
          .frame(maxWidth: .infinity)
          .frame(height: wordsBox)
          .overlay(alignment: .topLeading) {
            if words.isEmpty {
              Text("Write a message")
                .font(.system(size: 14))
                .foregroundStyle(look.placeholder)
                .cssLineHeight(22, size: 14)
                .padding(.horizontal, 10)
                .padding(.top, 10)
                .allowsHitTesting(false)
            }
          }
          .accessibilityLabel("Message")
        // The files that go with it, by name.
        ForEach(Array(card.attachmentNames.enumerated()), id: \.offset) { _, name in
          Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1)
          HStack(spacing: 8) {
            Image(systemName: "paperclip").font(.system(size: 12)).foregroundStyle(look.inkTertiary)
            Text(verbatim: name)
              .font(.system(size: 13))
              .tracking(-0.15)
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
              .truncationMode(.middle)
          }
          .padding(.vertical, 8)
          .padding(.horizontal, 10)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      // Rounded as every writing box (the founder, 10 November 2026).
      .background(look.ground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      if editable {
        HStack(spacing: 8) {
          Spacer(minLength: 0)
          CardButton(title: String(localized: "Discard"), look: look) {
            Task { await store.discardDraft(entryId, in: agentId) }
          }
          CardButton(title: card.kind == .email ? String(localized: "Send email") : String(localized: "Send message"), prominent: true, look: look, action: send)
        }
      }
    }
    .onAppear {
      guard !started else { return }
      started = true
      to = card.to.joined(separator: ", ")
      cc = card.cc.joined(separator: ", ")
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
      let people: (String) -> [String] = { text in text.split(whereSeparator: { $0 == "," || $0 == ";" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
      draft["from"] = .string(card.from)
      draft["to"] = .array(people(to).map { .string($0) })
      draft["cc"] = .array(people(cc).map { .string($0) })
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
 * brings once connected (12, 40%); at the right "Connected" in green, or
 * Connect ("Added" and Add until 13 October 2026, `Connecting`): since the
 * Apple design pass the iPhone's consent, then the app added and its
 * sign-in inside the app in one go (`MacConnector`; the Electron app opened
 * the browser). A Connect the computer refused turns the button to Retry,
 * with no reason, as the window's connector card does (3 November 2026:
 * the card had said nothing).
 */
struct ConnectorCards: View {
  let names: [String]
  /** The card says the apps are connected already (the agent wrote it after they were). */
  var connected = false
  let reason: String?
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(names, id: \.self) { name in
        ConnectorCard(name: name, reason: reason, markedConnected: connected, look: look)
      }
    }
    // The person's connected apps read as the card shows, as the iPhone's card does (the founder, 28 October 2026:
    // Stripe and Mercury, connected and in Connectors' own list, read Connect here, as the Mac had read them only when
    // Settings' Connectors opened).
    .task { await store.loadApps() }
  }
}

private struct ConnectorCard: View {
  let name: String
  let reason: String?
  var markedConnected = false
  let look: Look
  @Environment(AppStore.self) private var store
  /** Its last Connect was refused (`ConnectOutcome.refused`): the button reads Retry, as the window's card's does, until the next one begins. */
  @State private var refused = false

  var body: some View {
    let catalog = store.catalogApp(named: name)
    let connected = markedConnected || store.isConnected(name)
    // Its sign-in open in the window, or its page being asked for.
    let adding = MacConnector.shared.connecting == name
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
          Text(Connecting.connected)
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .foregroundStyle(look.added)
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .background(look.addedWash, in: Capsule())
        } else if store.isComingSoon(name) {
          // Not one an agent can be given yet (`AppsComingSoon`): no Connect.
          Text(AppsComingSoon.label)
            .font(.system(size: 13))
            .foregroundStyle(look.inkTertiary)
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(look.wash, in: Capsule())
            .fixedSize()
            .accessibilityLabel("\(catalog?.title ?? name) is coming soon")
        } else {
          // The consent first, then the app's sign-in in the window (the Apple design pass, `MacConnector`).
          Button { MacConnector.shared.connect(name, store: store) { refused = $0 } } label: {
            Group {
              if adding { ProgressView().controlSize(.small) } else { Text(refused ? Connecting.retry : Connecting.connect) }
            }
            .font(.system(size: 13))
            .foregroundStyle(look.ink)
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(look.wash, in: Capsule())
            .overlay { Capsule().strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
            .contentShape(Capsule())
          }
          .buttonStyle(.hand)
          .disabled(MacConnector.shared.connecting != nil)
          // Its name says what it shows: Retry after a refusal (the window's button is named by its word).
          .accessibilityLabel(refused ? Connecting.retry : String(localized: "Connect \(name)"))
        }
      }
    }
  }
}

/**
 * An app's icon: its own app icon, whole (`AppIcons`, shared with the
 * iPhone; 21 October 2026, the founder: "the icons"); else its logo on its
 * grey tile (`sand-tool-icon--logo`, 40, 11 round), or its first letter.
 */
struct AppLogoTile: View {
  let name: String
  let look: Look
  var side: CGFloat = 40
  /** The catalogue's id, when the caller has it; the name finds the icon otherwise. */
  var id: String? = nil

  var body: some View {
    if let icon = AppLogoTile.appIcon(id: id, name: name) {
      AppIconImage(icon: icon, side: side, look: look)
    } else {
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
  }

  /** The app's own icon (`AppIcons/<id>`, from ios/scripts/app_icons.py), by the catalogue's id or any of the app's names (`ConnectorIcons`); ChatGPT's and Claude's from `Providers/`. */
  static func appIcon(id: String? = nil, name: String) -> NSImage? {
    guard let key = id.flatMap(ConnectorIcons.id(for:)) ?? ConnectorIcons.id(for: name) else {
      return NSImage(named: "Providers/\(CatalogApp.slug(name))")
    }
    return NSImage(named: "AppIcons/\(key)")
  }

  /** The app's mark (`Connectors/<slug>`, else by the connector's id: "monday.com" is `monday`, 14 October 2026), or the brand's. */
  static func logo(_ name: String) -> NSImage? {
    if let image = NSImage(named: "Connectors/\(CatalogApp.slug(name))") { return image }
    if let id = ConnectorIcons.id(for: name), let image = NSImage(named: "Connectors/\(id)") { return image }
    if let brand = Brands.mentions.first(where: { $0.name.lowercased() == name.lowercased() }) { return NSImage(named: "Brands/\(brand.key)") }
    return nil
  }
}

/** An app's own icon, whole, with an app icon's corners (22.37% of its side, the iPhone's `ConnectorLogo.iconCorner`) and a hairline that keeps a black icon in view on the dark ground. */
struct AppIconImage: View {
  let icon: NSImage
  let side: CGFloat
  let look: Look

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: side * 0.2237, style: .continuous)
    Image(nsImage: icon)
      .resizable()
      .interpolation(.high)
      .scaledToFill()
      .frame(width: side, height: side)
      .clipShape(shape)
      .overlay(shape.strokeBorder(look.ink.opacity(look.dark ? 0.16 : 0.08), lineWidth: 0.5))
      .accessibilityHidden(true)
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
              Text(unfolded ? (heading.subject == .command ? String(localized: "Hide the command") : String(localized: "Hide the details")) : (heading.subject == .command ? String(localized: "Show the command") : String(localized: "Show the details")))
                .font(.system(size: 13))
            }
            .foregroundStyle(look.inkSecondary)
            .contentShape(Rectangle())
          }
          .buttonStyle(.hand)
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
          Spacer(minLength: 0)
          CardButton(title: String(localized: "Deny"), tone: .danger, look: look) { resolve("denied") }
          CardButton(title: String(localized: "Always allow"), look: look) { resolve("always") }
          CardButton(title: String(localized: "Allow once"), prominent: true, look: look) { resolve("approved") }
        }
        .disabled(answering)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background { RoundedRectangle(cornerRadius: 16).fill(look.theirs).shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1) }
    .overlay { RoundedRectangle(cornerRadius: 16).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Auto-review approval")
  }

  @ViewBuilder
  private func badge(_ status: String) -> some View {
    if status == "pending" {
      ApprovalNeededBadge(look: look)
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

/** "Approval needed" in the blue, with a raised hand: an approval card waiting (this one, and the ask to use this Mac). */
struct ApprovalNeededBadge: View {
  let look: Look

  var body: some View {
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
  }
}

// MARK: Routines that wake on Slack or GitHub

/**
 * "Connect Slack" (`sand-listener-connect-card`, at most 520 wide on a
 * Mac, 14 round): the platform's logo on a faint tile (30, 8 round), its title (12
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
    let words = reason.map { String(localized: "Connect \(name) \($0).") } ?? String(localized: "Connect \(name) so this routine can fire.")
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
          // The cards' main pill, in our blue (10 November 2026).
          CardButton(title: String(localized: "Connect"), prominent: true, look: look) {
            opening = true
            Task {
              if let url = await store.listenerConnectURL(platform) { NSWorkspace.shared.open(url) }
              opening = false
            }
          }
          .disabled(opening)
        } else {
          ProgressView().controlSize(.small)
            .accessibilityLabel("Checking connection status")
        }
      }
      .fixedSize()
    }
    .padding(12)
    .frame(maxWidth: 520, alignment: .leading)
    .background { RoundedRectangle(cornerRadius: 14).fill(look.theirs).shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1) }
    .task(id: platform) {
      connected = await store.listenerConnected(platform) ?? false
    }
  }
}

/**
 * "Connect GitHub" with a one-time code (`github-sign-in`, 11 November 2026;
 * SimeonCore's `GitHubSignInCard`): laid out as the Connect Slack card above
 * (GitHub's logo on a faint tile, the title, a line under it), then the code
 * large in monospaced figures with Copy code and Open GitHub (our blue) at
 * its right. The person opens GitHub's page on this Mac, already signed in to
 * GitHub there, and types the code; the card asks the computer every three
 * seconds and turns to "Connected as octo" with a green tick, or says the code
 * expired. The agent goes on by itself once GitHub is connected.
 */
struct GitHubSignInCardView: View {
  let card: GitHubSignInCard
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var state: GitHubSignInCard.State?
  @State private var copied = false

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 10) {
        Group {
          if let logo = NSImage(named: "Connectors/github") ?? NSImage(named: "Brands/github") {
            Image(nsImage: logo).resizable().interpolation(.high).aspectRatio(contentMode: .fit).frame(width: 18, height: 18)
          }
        }
        .frame(width: 30, height: 30)
        .background(look.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
        VStack(alignment: .leading, spacing: 3) {
          Text(GitHubSignInCard.title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(look.ink)
          Text(line)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if case .connected(let login) = state {
          HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(look.working)
            Text(GitHubSignInCard.connectedLabel(login)).font(.system(size: 12, weight: .medium)).foregroundStyle(look.ink)
          }
          .fixedSize()
        }
      }
      if waiting {
        HStack(spacing: 8) {
          Text(card.code)
            .font(.system(size: 20, weight: .semibold, design: .monospaced))
            .tracking(1)
            .foregroundStyle(look.ink)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
          CardButton(title: copied ? GitHubSignInCard.copiedLabel : GitHubSignInCard.copyLabel, look: look) {
            NSPasteboard.general.clearContents()
            copied = NSPasteboard.general.setString(card.code, forType: .string)
          }
          CardButton(title: GitHubSignInCard.openLabel, prominent: true, look: look) {
            NSWorkspace.shared.open(card.url)
          }
        }
      }
    }
    .padding(12)
    .frame(maxWidth: 520, alignment: .leading)
    .background { RoundedRectangle(cornerRadius: 14).fill(look.theirs).shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1) }
    .task(id: card.code) {
      while !Task.isCancelled {
        let read = card.state(await store.gitHubSignIn(), nowMs: Date().timeIntervalSince1970 * 1000)
        if let read { state = read }
        guard let wait = GitHubSignInCard.nextPoll(read ?? state) else { return }
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
      }
    }
  }

  /** Waiting, or not yet heard from the computer: the code is shown. */
  private var waiting: Bool { state == nil || state == .waiting }

  private var line: String {
    switch state {
    case .expired: return GitHubSignInCard.expiredLabel
    case .failed: return GitHubSignInCard.failedLabel
    default: return GitHubSignInCard.prompt
    }
  }
}

// MARK: The parts the asking cards share

/**
 * A card's kind at its top, as the founder's references put it (10 November
 * 2026): a 28 tile (8 round, the ink at 6%, a hairline) with the kind's
 * symbol, its name (14), and what happened in a pill at the right.
 */
struct CardKindHead<End: View>: View {
  let symbol: String
  let name: String
  let look: Look
  @ViewBuilder var end: () -> End

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: symbol)
        .font(.system(size: 13, weight: .regular))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 28, height: 28)
        .background(look.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.14), lineWidth: 0.5) }
        .accessibilityHidden(true)
      Text(name)
        .font(.system(size: 14))
        .tracking(-0.15)
        .foregroundStyle(look.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
      end()
    }
    .frame(minHeight: 28)
  }
}

extension CardKindHead where End == EmptyView {
  init(symbol: String, name: String, look: Look) {
    self.init(symbol: symbol, name: name, look: look) { EmptyView() }
  }
}

/** `checkmark.shield` and its line (13), at 40%: kept safe, never shown to the agent. */
struct CardShieldLine: View {
  let words: String
  let look: Look

  var body: some View {
    HStack(alignment: .top, spacing: 5) {
      Image(systemName: "checkmark.shield")
        .font(.system(size: 12))
        .padding(.top, 1)
      Text(words)
        .font(.system(size: 13))
        .tracking(-0.08)
        .fixedSize(horizontal: false, vertical: true)
    }
    .foregroundStyle(look.inkTertiary)
  }
}

extension View {
  /**
   * A field on a card or a secure form: 14, 36 high, padded 12 at the
   * sides, on the ground, 12 round with a line at 15% (the founder, 10
   * November 2026: "all writing boxes should be rounded too").
   */
  func cardField(_ look: Look, height: CGFloat? = 36) -> some View {
    self
      .textFieldStyle(.plain)
      .font(.system(size: 14))
      .padding(.horizontal, 12)
      .padding(.vertical, height == nil ? 9 : 0)
      .frame(height: height)
      .background(look.ground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
  }
}

// MARK: Secrets

/**
 * A secret the agent asks for (`sand-secret-request`), as the founder's
 * reference draws it (10 November 2026): "Secrets" at the top with a key;
 * the secret's name (15, 600) and why; the variable it is kept under over
 * its field when the agent named one ("AWS_ACCESS_KEY_ID"); the field, 36
 * high and 12 round; then a shield and "Stored securely, never shown to
 * your agent." with Not now and Save securely at the right. Once the
 * computer says it has it (the entry's `secretProvided`): "Saved securely
 * and kept private." and a "Saved" pill. A save on its way only greys Save
 * securely; one the computer didn't keep leaves the field there.
 */
struct SecretCardView: View {
  let entryId: String
  let agentId: String
  let label: String
  let description: String
  /** The variable it is kept under on the computer, when the agent named one. */
  var variable: String? = nil
  let provided: Bool
  /** Dismissed with Not now: a decline the agent is told (`dismissWidget`). */
  var dismissed = false
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var value = ""
  @State private var saving = false

  var body: some View {
    CardShell(look: look, spacing: 12) {
      CardKindHead(symbol: "key.horizontal", name: String(localized: "Secrets"), look: look) {
        if provided {
          StatusPill(text: String(localized: "Saved"), look: look, dot: look.working)
        } else if dismissed {
          StatusPill(text: String(localized: "Dismissed"), look: look)
        }
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.system(size: 15, weight: .semibold))
          .tracking(-0.2)
          .foregroundStyle(dismissed ? look.inkSecondary : look.ink)
          .fixedSize(horizontal: false, vertical: true)
        let line = provided ? String(localized: "Saved securely and kept private.") : dismissed ? "" : description
        if !line.isEmpty {
          Text(line)
            .font(.system(size: 14))
            .tracking(-0.15)
            .foregroundStyle(look.inkSecondary)
            .cssLineHeight(20, size: 14)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      if !(provided || dismissed) {
        VStack(alignment: .leading, spacing: 6) {
          if let variable {
            Text(verbatim: variable)
              .font(.system(size: 13))
              .tracking(0.2)
              .foregroundStyle(look.inkSecondary)
              .textSelection(.enabled)
          }
          SecureField("", text: $value, prompt: Text("Paste your \(label)").foregroundStyle(look.placeholder))
            .cardField(look)
            .onSubmit(save)
        }
        HStack(alignment: .center, spacing: 8) {
          CardShieldLine(words: String(localized: "Stored securely, never shown to your agent."), look: look)
          Spacer(minLength: 8)
          // Not now declines it, as the X did (10 November 2026).
          CardButton(title: String(localized: "Not now"), look: look) {
            Task { await store.dismissQuestion(entryId, in: agentId) }
          }
          .disabled(saving)
          .help("Dismiss without giving it")
          CardButton(title: String(localized: "Save securely"), prominent: true, look: look, action: save)
            .disabled(saving || value.isEmpty)
        }
      }
    }
  }

  private func save() {
    let secret = value
    guard !secret.isEmpty, !saving else { return }
    saving = true
    Task {
      // Saved only once the computer's entry says so (`provided`), never because the call returned: it returns on a failure too.
      await store.submitSecret(secret, entryId: entryId, in: agentId)
      value = ""
      saving = false
    }
  }
}

// MARK: Pictures

/**
 * Pictures in a message (`sand-message-attachments__strip`, 8 under its
 * words): one row, 6 apart, each 12 round and 192 high at its own width,
 * the row at most 86% of the chat, 560, or the chat less 82 (smaller
 * together when wider). One picture alone, as a file sent (`Dj`, `y7n`):
 * its own width up to 320 (or the row's limit), at most 200 high; 320 by
 * 200 when its size is not known. Grey until drawn. A picture opens full
 * screen ("Open image full screen"), the others beside it.
 */
struct PictureStrip: View {
  let images: [ChatImage]
  let agentId: String
  let limit: CGFloat
  /** Pictures with no words (a file sent, or an agent's pictures alone): one is drawn at its own size. */
  var alone = false
  let look: Look
  @Environment(Viewers.self) private var viewers

  var body: some View {
    if alone && images.count == 1 {
      let size = PictureStrip.single(images[0], limit: limit)
      tile(0, width: size.width, height: size.height)
    } else {
      let ratios = images.map { image -> CGFloat in
        guard let w = image.width, let h = image.height, w > 0, h > 0 else { return 1 }
        return CGFloat(w / h)
      }
      let gaps = CGFloat(max(0, images.count - 1)) * 6
      let natural = ratios.reduce(0, +) * 192
      let height = natural + gaps > limit && natural > 0 ? max(48, (limit - gaps) / ratios.reduce(0, +)) : 192
      HStack(spacing: 6) {
        ForEach(Array(images.enumerated()), id: \.offset) { index, _ in
          tile(index, width: (height * ratios[index]).rounded(), height: height.rounded())
        }
      }
    }
  }

  private func tile(_ index: Int, width: CGFloat, height: CGFloat) -> some View {
    let image = images[index]
    return Button {
      let items = images.map { MediaItem(url: $0.url, agentId: agentId, caption: $0.alt.isEmpty ? nil : $0.alt, name: $0.name) }
      viewers.shown = .media(items, start: index)
    } label: {
      ChatPicture(image: image, agentId: agentId, look: look)
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.hand)
    .accessibilityLabel(FilePreview.kind(image.url) == .video ? "Open video full screen" : "Open image full screen")
  }

  /** One picture's size (`y7n`): its width up to 320, at most 200 high, its shape kept; 320 by 200 when not known. */
  static func single(_ image: ChatImage, limit: CGFloat) -> CGSize {
    let widest = max(0, min(320, limit))
    guard let w = image.width, let h = image.height, w > 0, h > 0 else { return CGSize(width: widest, height: min(200, widest)) }
    let ratio = CGFloat(w / h)
    var width = min(CGFloat(w), widest)
    var height = width / ratio
    if height > 200 {
      height = 200
      width = height * ratio
    }
    return CGSize(width: width.rounded(), height: height.rounded())
  }
}

/**
 * One picture: read from the agent's computer (or the web), grey until it
 * is. Its right-click menu is the Electron app's (step 14): Copy image,
 * Save image… ("image.<kind>"), and Copy image address for a picture from
 * the web (not a computer file's data address, megabytes of text).
 */
struct ChatPicture: View {
  let image: ChatImage
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control: ChatControl?
  @State private var picture: NSImage?
  @State private var bytes: Data?

  var body: some View {
    ZStack {
      look.codeWash
      if let picture {
        Image(nsImage: picture).resizable().interpolation(.high).aspectRatio(contentMode: .fill)
      }
    }
    .accessibilityLabel(image.alt.isEmpty ? String(localized: "Picture") : image.alt)
    .onHover { inside in control?.pictureHovered = inside }
    .onDisappear { control?.pictureHovered = false }
    .contextMenu {
      if let picture {
        Button("Copy image") {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.writeObjects([picture])
        }
        Button("Save image\u{2026}") { save() }
      }
      if image.url.hasPrefix("https://") || image.url.hasPrefix("http://") {
        Button("Copy image address") {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(image.url, forType: .string)
        }
      }
    }
    // A computer that rests is waited for, not woken (step 4).
    .task(id: image.url) {
      if image.url.hasPrefix("https://"), let url = URL(string: image.url) {
        if let (data, _) = try? await URLSession.shared.data(from: url) { bytes = data; picture = NSImage(data: data) }
      } else if let data = await store.readFile(image.url, agentId: agentId, wakes: false) {
        bytes = data
        picture = NSImage(data: data)
      }
    }
  }

  /** Save image…: the Mac's save panel, "image.<kind>" from the picture's own kind (png when unknown), pictures only. */
  private func save() {
    guard let bytes else { return }
    let kinds = ["png", "jpg", "gif", "webp", "svg", "bmp", "avif"]
    let own = (image.url as NSString).pathExtension.lowercased()
    let kind = own == "jpeg" ? "jpg" : kinds.contains(own) ? own : "png"
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "image.\(kind)"
    panel.allowedContentTypes = (kinds + ["jpeg"]).compactMap { UTType(filenameExtension: $0) }
    let write: (NSApplication.ModalResponse) -> Void = { response in
      guard response == .OK, let target = panel.url else { return }
      try? bytes.write(to: target)
    }
    if let window = MacServices.shared.mainWindow { panel.beginSheetModal(for: window, completionHandler: write) } else { write(panel.runModal()) }
  }
}

// MARK: Links

/**
 * A message that is one link, drawn as a card (`sand-link-card-wrap`, at
 * most 88% of the chat, 480 on a Mac, or the chat less 82): the ground, a 10% edge,
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
    .buttonStyle(.hand)
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
  /** "Jump to replied message", or "Open reply thread" when the line is a reply in a thread. */
  var label = String(localized: "Jump to replied message")
  var action: () -> Void = {}

  var body: some View {
    Button(action: action) {
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
    .buttonStyle(.hand)
    .help(label)
    .accessibilityLabel(label)
  }
}

/** Where a message came from or went (`sand-channel-tag`): an arrow and the platform (11, 500) in a faint pill of the bubble's own ink, 6 under its words. */
struct ChannelTagView: View {
  let tag: ChannelTag
  let ink: Color

  var body: some View {
    HStack(spacing: 4) {
      // Straight down from a platform, straight up to it, in a 10-point box, as the window's.
      Image(systemName: tag.inbound ? "arrow.down" : "arrow.up")
        .font(.system(size: 8, weight: .semibold))
        .frame(width: 10, height: 10)
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
      .buttonStyle(.hand)
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
 * Flight results, Muse's layout as the iPhone draws it (ios/Simeon/Cards.swift
 * `FlightsCardView`), at a Mac's width (the founder, 21 October 2026: the
 * cards "match an iphone, and not a mac"): its own card, as wide as a card
 * may be (680 at most), the route and its date as one heading (16, 500)
 * with what else the trip is under it (12, grey); then a row per offer. On
 * a wide chat a row reads across: the airline's mark (40), the airline over
 * its stops, the times on a dashed line with the time in the air between
 * them (a round trip's way back under them), the price and a chevron. On a
 * narrow one it is the iPhone's row: "Airline · price" over the times.
 * Opening an offer shows it in the agent pane (7d); again closes it.
 */
struct FlightsCardView: View {
  let card: FlightsCard
  /** The card's row in the chat and its agent: an offer's key, and whose pane it shows in. */
  let rowId: String
  let agentId: String
  let look: Look
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout

  private var grey: Color { look.dark ? Color(hex: 0x98989d) : Color(hex: 0x86868b) }
  private var ink: Color { look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f) }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !card.heading.isEmpty || !card.aside.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          if !card.heading.isEmpty {
            Text(card.heading)
              .font(.system(size: 16, weight: .medium))
              .tracking(-0.2)
              .foregroundStyle(ink)
              .fixedSize(horizontal: false, vertical: true)
          }
          if !card.aside.isEmpty {
            Text(card.aside)
              .font(.system(size: 12))
              .foregroundStyle(grey)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 6)
      }
      VStack(spacing: 0) {
        ForEach(Array(card.offers.enumerated()), id: \.offset) { index, offer in
          if index > 0 {
            Rectangle()
              .fill(look.dark ? Color(red: 84 / 255, green: 84 / 255, blue: 88 / 255).opacity(0.5) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.14))
              .frame(height: 0.5)
              .padding(.leading, 64)
              .padding(.trailing, 10)
          }
          let key = FlightPane.key(row: rowId, index: index)
          FlightRow(offer: offer, ink: ink, grey: grey, pressed: pane.isOpen && pane.flight?.key == key, look: look) {
            pane.toggleFlight(key: key, offer: offer, agentId: agentId, layout: layout)
          }
        }
      }
      .padding(.horizontal, 6)
      .padding(.bottom, 6)
      .padding(.top, card.heading.isEmpty && card.aside.isEmpty ? 6 : 0)
    }
    .monospacedDigit()
    .frame(maxWidth: .infinity, alignment: .leading)
    .background { RoundedRectangle(cornerRadius: 18, style: .continuous).fill(look.theirs).shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1) }
    .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).inset(by: -0.25).stroke(look.theirsHairline, lineWidth: 0.5) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(card.heading.isEmpty ? String(localized: "Flights") : card.heading)
  }
}

private struct FlightRow: View {
  let offer: FlightOffer
  let ink: Color
  let grey: Color
  /** Its details are open in the pane (`aria-pressed`): the hover's fill stays. */
  let pressed: Bool
  let look: Look
  let open: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: open) {
      ViewThatFits(in: .horizontal) {
        across
        stacked
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 10)
      .background(hovering || pressed ? Color(red: 120 / 255, green: 120 / 255, blue: 128 / 255).opacity(look.dark ? 0.24 : 0.1) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
      .contentShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(pressed ? [.isSelected] : [])
  }

  /** A wide chat's row: the mark, the airline over its stops, the times, the price, the chevron. */
  private var across: some View {
    HStack(spacing: 14) {
      AirlineMark(name: offer.airline, logo: offer.logo, side: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(offer.airline)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(ink)
          .lineLimit(1)
        Text(FlightText.stops(offer.stops))
          .font(.system(size: 12))
          .foregroundStyle(grey)
          .lineLimit(1)
      }
      .frame(width: 150, alignment: .leading)
      VStack(alignment: .leading, spacing: 6) {
        FlightTimesAcross(times: offer.outbound, ink: ink, grey: grey)
        if let back = offer.inbound { FlightTimesAcross(times: back, ink: ink, grey: grey) }
      }
      .frame(minWidth: 220, maxWidth: .infinity)
      // The price in Apple's lighter blue, as on the iPhone's card (the founder, 24 October 2026).
      Text(offer.price)
        .font(.system(size: 15, weight: .medium))
        .tracking(-0.15)
        .foregroundStyle(look.appleBlue)
        .fixedSize()
      chevron
    }
  }

  /** A narrow chat's row (the iPhone's): the mark, the airline with its price at the far right over the times, the chevron. */
  private var stacked: some View {
    HStack(spacing: 12) {
      AirlineMark(name: offer.airline, logo: offer.logo, side: 40)
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(offer.airline)
            .foregroundStyle(ink)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
          Text(offer.price)
            .foregroundStyle(look.appleBlue)
            .fixedSize()
        }
        .font(.system(size: 15))
        .tracking(-0.15)
        FlightTimesStacked(times: offer.outbound, grey: grey)
        if let back = offer.inbound { FlightTimesStacked(times: back, grey: grey) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      chevron
    }
  }

  private var chevron: some View {
    Image(systemName: "chevron.right")
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(look.dark ? Color(hex: 0x48484a) : Color(hex: 0xc7c7cc))
      .frame(width: 12, height: 12)
  }
}

/** "2:30pm ----- 2h40m ----- 5:10pm" across a wide row: the times in ink, the time in the air (and the stops) in grey between dashes. */
private struct FlightTimesAcross: View {
  let times: FlightTimes
  let ink: Color
  let grey: Color

  var body: some View {
    HStack(spacing: 8) {
      Text(times.depart).font(.system(size: 14)).foregroundStyle(ink).fixedSize()
      FlightDashes(grey: grey)
      if !times.label.isEmpty {
        Text(times.label).font(.system(size: 11)).foregroundStyle(grey).fixedSize()
        FlightDashes(grey: grey)
      }
      Text(times.arrive).font(.system(size: 14)).foregroundStyle(ink).fixedSize()
    }
  }
}

/** The iPhone's line: the times on a dashed line, or, too long for the row, the time in the air under the times. */
private struct FlightTimesStacked: View {
  let times: FlightTimes
  let grey: Color

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 6) {
        Text(times.depart).fixedSize()
        FlightDashes(grey: grey)
        if !times.label.isEmpty {
          Text(times.label).font(.system(size: 12)).fixedSize()
          FlightDashes(grey: grey)
        }
        Text(times.arrive).fixedSize()
      }
      VStack(alignment: .leading, spacing: 1) {
        Text([times.depart, times.arrive].filter { !$0.isEmpty }.joined(separator: " – ")).fixedSize(horizontal: false, vertical: true)
        if !times.label.isEmpty { Text(times.label).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true) }
      }
    }
    .font(.system(size: 14))
    .foregroundStyle(grey)
  }
}

/** The dashed rule between a row's times; it takes what the line leaves, at least 12. */
private struct FlightDashes: View {
  let grey: Color

  var body: some View {
    FlightDashLine()
      .stroke(grey.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
      .frame(minWidth: 12, maxWidth: .infinity)
      .frame(height: 1)
      .accessibilityHidden(true)
  }
}

private struct FlightDashLine: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
    return path
  }
}

/**
 * An airline's mark (`simeon-flight-mark--row`), as the iPhone's: its logo,
 * sized by its own shape in the circle (`AirlineLogo.box`), or its initials
 * (12, 500, grey). White in light; in dark the iPhone's dark disc, the
 * logo's too-dark parts lightened (24 October 2026, the founder: the Mac
 * showed the airlines' initials and had no dark logos). The logos are SVG
 * files, which `NSImage` can't read: the iPhone's `RemoteLogos` draws them
 * (ios/Simeon/Logos.swift, built into the Mac too).
 */
struct AirlineMark: View {
  let name: String
  let logo: String
  var side: CGFloat = 36
  /** The pane's mark (`--hero`, 72): its logo at 42, its initials at 20, a hairline ring. */
  var logoSide: CGFloat? = nil
  var initialsSize: CGFloat? = nil
  /** The ring; by default a faint one, black in light and white in dark. */
  var ring: Color? = nil
  var ringWidth: CGFloat = 0.5
  @Environment(\.colorScheme) private var scheme
  @State private var picture: NSImage?

  var body: some View {
    let dark = scheme == .dark
    // The circle a logo is fitted to: the mark, or a smaller one for the pane's (its logo at 42 of 72).
    let diameter = logoSide.map { $0 / 0.65 } ?? side
    ZStack {
      Circle().fill(dark ? Color(hex: 0x232325) : Color.white)
      if let picture {
        let box = AirlineLogo.box(width: Double(picture.size.width), height: Double(picture.size.height), diameter: Double(diameter))
        Image(nsImage: picture).resizable().interpolation(.high).frame(width: CGFloat(box.width), height: CGFloat(box.height))
      } else {
        Text(FlightsCard.initials(name))
          .font(.system(size: initialsSize ?? side / 3, weight: .medium))
          .foregroundStyle(dark ? Color(hex: 0xb4b4b8) : Color(hex: 0x6e6e73))
      }
    }
    .clipShape(Circle())
    .overlay { Circle().strokeBorder(ring ?? (dark ? Color.white.opacity(0.12) : Color.black.opacity(0.12)), lineWidth: ringWidth) }
    .frame(width: side, height: side)
    .task(id: "\(logo)|\(dark)") {
      // Another flight in the same place: its own logo or its initials, never the last one's.
      picture = nil
      // An https logo, or one written into the card (`data:`); else, or when it fails, the initials.
      guard logo.hasPrefix("https://") || logo.hasPrefix("data:image/"), let url = URL(string: logo) else { return }
      picture = await RemoteLogos.shared.image(for: url, dark: dark)
    }
  }
}

// MARK: The computer handed over

/**
 * The agent hands the person its computer (`simeon-handoff`, at most 520
 * wide on a Mac, 20 round, padded 16, its parts 14 apart), as the
 * founder's reference draws it (10 November 2026): "Computer" at the top
 * with a laptop; "Action needed" (16, 600) over the agent's instruction in
 * grey; while it waits, the screen's snapshot (when the computer sent one)
 * across the whole card; then Skip, I'm done and Take over (our blue) at
 * the right. Once settled: what happened in a pill at the top (Done and
 * Answered in green, Skipped in blue, Canceled in red; the founder, 16
 * October 2026), the instruction, and Open computer. The snapshot, Take
 * over and Open computer open the computer over the window (step 13). It
 * waits while the computer carries this request or while the request has
 * no answer yet (decision 3, `HandoffCardState`).
 */
struct ComputerHandoffCard: View {
  let agentId: String
  let requestId: String
  let instruction: String
  let resolution: String?
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var snapshotHover = false

  private var ink: Color { look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f) }
  private var grey: Color { look.dark ? Color(hex: 0x98989d) : Color(hex: 0x6e6e73) }
  private var fill: Color { look.dark ? Color(hex: 0x3a3a3c) : Color.white }

  var body: some View {
    let state = HandoffCardState.of(requestId: requestId, instruction: instruction, resolution: resolution, status: store.computer.status(agentId))
    let waiting = state.waiting
    let words = state.instruction.trimmingCharacters(in: .whitespacesAndNewlines)
    VStack(alignment: .leading, spacing: 14) {
      CardKindHead(symbol: "laptopcomputer", name: String(localized: "Computer"), look: look) {
        if !waiting {
          let tint = Self.tint(state.ending, look: look)
          StatusPill(text: state.outcome, look: look, dot: tint, ink: tint, wash: tint.opacity(look.dark ? 0.2 : 0.1), large: true)
        }
      }
      if waiting || !words.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          if waiting {
            Text("Action needed")
              .font(.system(size: 16, weight: .semibold))
              .tracking(-0.2)
              .foregroundStyle(ink)
          }
          if !words.isEmpty {
            Text(words)
              .font(.system(size: 15))
              .foregroundStyle(grey)
              .cssLineHeight(21, size: 15)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      if waiting, let snapshot = state.snapshotDataUrl.flatMap(Self.picture) {
        // The screen when the agent asked (16:10), across the whole card, a hairline over and under; a click takes over.
        Button { takeOver() } label: {
          Image(nsImage: snapshot)
            .resizable()
            .aspectRatio(contentMode: .fill)
            .scaleEffect(snapshotHover ? 1.02 : 1)
            .animation(.easeOut(duration: 0.3), value: snapshotHover)
            .frame(maxWidth: .infinity)
            .aspectRatio(16 / 10, contentMode: .fit)
            .background(fill)
            .clipped()
            .overlay(alignment: .top) { Rectangle().fill(look.dark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(look.dark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .onHover { snapshotHover = $0 }
        .padding(.horizontal, -16)
        .accessibilityLabel("Take over the computer")
      }
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        if waiting {
          // The cards' pills, as the founder's reference has them: Skip and I'm done grey, Take over the main one, last.
          CardButton(title: String(localized: "Skip"), look: look) {
            Task { await store.handBackComputer(agentId, skip: true) }
          }
          .help("Cancel this request without doing the step; the agent continues without it")
          CardButton(title: String(localized: "I’m done"), look: look) {
            Task { await store.handBackComputer(agentId) }
          }
          CardButton(title: String(localized: "Take over"), prominent: true, look: look) { takeOver() }
        } else {
          CardButton(title: String(localized: "Open computer"), look: look) { takeOver() }
        }
      }
    }
    .tracking(-0.15)
    .padding(16)
    .frame(maxWidth: 520, alignment: .leading)
    .background(look.dark ? Color(hex: 0x2c2c2e) : look.theirs, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(waiting ? "Your turn on the computer" : "Computer, \(state.outcome)")
  }

  /** What happened, in its colour: Done and Answered green, Skipped blue, Canceled red. */
  static func tint(_ ending: HandoffOutcome, look: Look) -> Color {
    switch ending {
    case .done, .answered: return look.added
    case .skipped: return look.link
    case .canceled: return look.danger
    }
  }

  /** Take over, the snapshot and Open computer: the computer over the window (trigger `handoff`), which starts it. */
  private func takeOver() {
    window.openComputer(agentId, helper: nil, store: store)
  }

  /** A `data:image/…;base64,…` picture. */
  private static func picture(_ dataURL: String) -> NSImage? {
    guard let comma = dataURL.firstIndex(of: ","), dataURL.hasPrefix("data:"),
          let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]), options: .ignoreUnknownCharacters) else { return nil }
    return NSImage(data: data)
  }
}

// MARK: Checkout

/**
 * The checkout card (13 October 2026; SimeonCore's `PurchaseCard`), the
 * iPhone's in the Mac's own card: the cart in a 44-point tile, "Checkout"
 * and who wants to order where; the check-the-details line; the checkout as
 * the agent left it (16:10, 12 round) with Review order in glass over its
 * corner, wearing the shop's icon and opening the agent's computer on that
 * checkout (14 October 2026: the cart is in the computer's browser, not on
 * the shop's page here); the Link card that pays with "Link by Stripe" (with
 * several cards, a click picks another); the total; Deny and Allow at the
 * right, as a Mac's dialog has them (at most 520 wide, 21 October 2026).
 * Allowed, it follows the purchase through Link (Get the Link app, Open
 * Link, while Link waits on the person) to the order.
 */
struct PurchaseCardView: View {
  let entryId: String
  let agentId: String
  let card: PurchaseCard
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.openURL) private var openURL
  @State private var picture: NSImage?
  @State private var pictureMissing = false
  @State private var pictureHover = false
  @State private var shopIcon: NSImage?
  @State private var choosing = false

  private var ink: Color { look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f) }
  private var grey: Color { look.dark ? Color(hex: 0x98989d) : Color(hex: 0x6e6e73) }
  private var fill: Color { look.dark ? Color(hex: 0x3a3a3c) : Color.white }
  private var blue: Color { look.dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93) }
  private var hairline: Color { look.dark ? Color.white.opacity(0.08) : Color.black.opacity(0.08) }

  /** Review order: the agent's computer, on the checkout; for a Shop checkout (14 October 2026), the product's page, since Shop holds the checkout and nothing is open on the computer. */
  private func reviewOrder() {
    if card.isShopCheckout, let url = card.url { openURL(url); return }
    window.openComputer(agentId, helper: nil, store: store)
  }

  var body: some View {
    let shown = card.shown(answered: store.answeredPurchases[entryId], picked: store.pickedPurchaseCards[entryId])
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 12) {
        Image(systemName: shown.flight == nil ? "cart.fill" : "airplane")
          .font(.system(size: 18))
          .foregroundStyle(ink)
          .frame(width: 44, height: 44)
          .background(fill, in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 6) {
            Text(shown.heading).font(.system(size: 15, weight: .semibold)).foregroundStyle(ink)
            if shown.isTest { StatusPill(text: String(localized: "Test"), look: look) }
          }
          Text(shown.flight == nil ? PurchaseCard.headline(agent: store.agent(agentId)?.name ?? "", domain: shown.domain) : PurchaseCard.flightHeadline(agent: store.agent(agentId)?.name ?? "", airline: shown.flight?.airline ?? shown.merchant))
            .font(.system(size: 13))
            .foregroundStyle(grey)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      if shown.waitsOnPerson {
        Text(shown.flight == nil ? PurchaseCard.check : PurchaseCard.flightCheck)
          .font(.system(size: 13))
          .foregroundStyle(grey)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let flight = shown.flight {
        MacFlightCheckoutBlock(flight: flight, look: look)
      } else if shown.preview != nil {
        checkoutPicture(shown)
      } else if !shown.itemsLine.isEmpty {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(shown.itemsLine).font(.system(size: 14)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
          reviewOrderPill
        }
      }
      VStack(spacing: 0) {
        payment(shown)
        if let note = shown.reviewNote {
          Text(note).font(.system(size: 12)).foregroundStyle(look.dark ? Color(hex: 0xff5667) : Color(hex: 0xc21d2e)).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 8)
        }
        Rectangle().fill(hairline).frame(height: 1)
        HStack(alignment: .firstTextBaseline) {
          Text(PurchaseCard.totalLabel).font(.system(size: 14)).foregroundStyle(grey)
          Spacer(minLength: 8)
          Text(shown.total).font(.system(size: 15, weight: .semibold)).foregroundStyle(ink).monospacedDigit()
        }
        .padding(.vertical, 9)
      }
      footer(shown)
    }
    .tracking(-0.15)
    .padding(16)
    .frame(maxWidth: 520, alignment: .leading)
    .background(look.dark ? Color(hex: 0x2c2c2e) : look.theirs, in: RoundedRectangle(cornerRadius: 20))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("\(PurchaseCard.title) at \(shown.domain), \(shown.total)")
    // A card with Link: the computer keeps watching Link for it (after a restart nothing would); a flight it was paying, it closes.
    .task(id: card.state) {
      if card.state == .approving || (card.flight != nil && card.state == .approved) { await store.keepWatchingPurchase(entryId, in: agentId, state: card.state) }
    }
    .task(id: card.preview?.url) {
      guard let image = card.preview else { return }
      // A computer that rests is waited for, not woken (step 4).
      if let data = await store.readFile(image.url, agentId: agentId, limit: 24 << 20, wakes: false), let read = NSImage(data: data) { picture = read } else { pictureMissing = true }
    }
    .task(id: card.icon?.url) {
      guard let icon = card.icon else { return }
      if let data = await store.readFile(icon.url, agentId: agentId, limit: 1 << 20, wakes: false), let read = NSImage(data: data) { shopIcon = read }
    }
  }

  /** The card that pays, as its wallet names it, with "Link by Stripe" (or "Shop") under it; with several cards, a click picks another. */
  @ViewBuilder private func payment(_ shown: PurchaseCard) -> some View {
    let row = HStack(spacing: 12) {
      MacPaymentMark(brand: shown.needsCard ? nil : shown.cardBrand, edge: hairline)
      VStack(alignment: .leading, spacing: 2) {
        Text(shown.cardLine ?? (shown.needsCard ? PurchaseCard.chooseCard : shown.wallet == .shop ? String(localized: "Your Shop card") : shown.wallet == .card ? String(localized: "Your card") : String(localized: "Your Link card")))
          .font(.system(size: 14, weight: .medium)).foregroundStyle(shown.needsCard ? blue : ink)
          .lineLimit(1).truncationMode(.middle)
        MacLinkByStripe(grey: grey, wallet: shown.wallet)
      }
      Spacer(minLength: 0)
      if shown.canChooseCard {
        Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(grey)
      }
    }
    .padding(.vertical, 9)
    if shown.canChooseCard {
      Button { choosing = true } label: { row.contentShape(Rectangle()) }
        .buttonStyle(.hand)
        .help(PurchaseCard.chooseCard)
        .popover(isPresented: $choosing, arrowEdge: .bottom) {
          MacCardChooser(cards: shown.cards, selected: shown.cardId, look: look, footer: shown.cardsFooter) { choice in
            store.pickPurchaseCard(entryId, cardId: choice.id)
            choosing = false
          }
        }
    } else {
      row.accessibilityElement(children: .combine)
    }
  }

  @ViewBuilder private func checkoutPicture(_ shown: PurchaseCard) -> some View {
    ZStack(alignment: .bottomTrailing) {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(fill)
        .aspectRatio(16 / 10, contentMode: .fit)
        .overlay(alignment: .top) {
          if let picture {
            Image(nsImage: picture).resizable().interpolation(.high).scaledToFill()
              .frame(maxWidth: .infinity, alignment: .top)
              .scaleEffect(pictureHover ? 1.02 : 1, anchor: .top)
              .animation(.easeOut(duration: 0.3), value: pictureHover)
          } else if pictureMissing {
            Image(systemName: "photo").font(.system(size: 18)).foregroundStyle(grey)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(hairline, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onHover { pictureHover = $0 }
        .onTapGesture { reviewOrder() }
        .handCursor()
      reviewOrderPill.padding(10)
    }
    .accessibilityLabel("The checkout page")
  }

  /** Review order in glass, wearing the shop's icon: the agent's computer, on the checkout (where the cart is). */
  private var reviewOrderPill: some View {
    Button { reviewOrder() } label: {
      HStack(spacing: 6) {
        ZStack {
          Circle().fill(Color.white)
          if let shopIcon {
            Image(nsImage: shopIcon).resizable().interpolation(.high).scaledToFit().padding(3).clipShape(Circle())
          } else {
            Image(systemName: "globe").font(.system(size: 10)).foregroundStyle(Color(white: 0.45))
          }
        }
        .frame(width: 18, height: 18)
        Text(PurchaseCard.reviewOrder)
        Image(systemName: "arrow.up.left.and.arrow.down.right").imageScale(.small)
      }
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(ink)
      .padding(.leading, 4).padding(.trailing, 10)
      .frame(height: 28)
      .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .liquidGlass(in: Capsule())
    .help("Open the computer on the checkout")
  }

  @ViewBuilder private func footer(_ shown: PurchaseCard) -> some View {
    if shown.waitsOnPerson {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 8) {
          Spacer(minLength: 0)
          pill(PurchaseCard.deny, ground: fill, ink: ink) { Task { await store.answerPurchase(entryId, allow: false, in: agentId) } }
          // Touch ID (or the Mac's password) first, 14 October 2026: this Allow is the approval Link is handed; cancelled, nothing is allowed.
          pill(PurchaseCard.allow, ground: blue, ink: .white) {
            let reason = PurchaseApproval.reason(for: shown)
            Task {
              guard let confirmed = await PurchaseApproval.confirm(reason: reason) else { return }
              await store.answerPurchase(entryId, allow: true, confirmed: confirmed, in: agentId)
            }
          }
            .disabled(shown.needsCard)
            .opacity(shown.needsCard ? 0.45 : 1)
        }
        if shown.isTest {
          Text(shown.flight == nil ? PurchaseCard.testNote : PurchaseCard.flightTestNote).font(.system(size: 12)).foregroundStyle(grey)
        }
      }
    } else if let status = shown.status {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top, spacing: 10) {
          mark(status.kind).padding(.top, 1)
          VStack(alignment: .leading, spacing: 2) {
            Text(status.label).font(.system(size: 14, weight: .medium)).foregroundStyle(ink)
            if let detail = shown.detail {
              Text(detail).font(.system(size: 12)).foregroundStyle(grey).fixedSize(horizontal: false, vertical: true)
            }
          }
          Spacer(minLength: 0)
        }
        if shown.state == .approving {
          HStack(spacing: 8) {
            Spacer(minLength: 0)
            if let app = shown.walletApp {
              pill(app.label, ground: shown.actionURL == nil ? blue : fill, ink: shown.actionURL == nil ? .white : ink) { openURL(app.url) }
            }
            if let url = shown.actionURL {
              pill(shown.openWalletLabel, ground: blue, ink: .white) { openURL(url) }
            }
          }
        }
        if shown.waitsOnBank {
          HStack {
            Spacer(minLength: 0)
            pill(PurchaseCard.openComputer, ground: blue, ink: .white) { window.openComputer(agentId, helper: nil, store: store) }
          }
        }
      }
    }
  }

  @ViewBuilder private func mark(_ kind: PurchaseCard.StatusKind) -> some View {
    switch kind {
    case .working: Circle().fill(blue).frame(width: 8, height: 8).frame(width: 15, height: 15)
    case .success: Image(systemName: "checkmark.circle.fill").font(.system(size: 15)).foregroundStyle(Color(hex: 0x00c972))
    case .danger: Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(look.dark ? Color(hex: 0xff5667) : Color(hex: 0xc21d2e))
    case .neutral: Image(systemName: "minus.circle.fill").font(.system(size: 15)).foregroundStyle(grey)
    }
  }

  /** A Mac's pill (21 October 2026): as wide as its words (at least 88), 32 high. */
  private func pill(_ title: String, ground: Color, ink: Color, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.horizontal, 16)
        .frame(minWidth: 88)
        .frame(height: 32)
        .background(ground, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .fixedSize()
  }
}

/** The card's network on a small white card: Visa's word, Mastercard's circles, Amex's blue, else a card. */
struct MacPaymentMark: View {
  let brand: String?
  let edge: Color

  var body: some View {
    let name = (brand ?? "").lowercased()
    ZStack {
      RoundedRectangle(cornerRadius: 6, style: .continuous).fill(name == "amex" ? Color(red: 0.0, green: 0.44, blue: 0.80) : Color.white)
      switch name {
      case "visa":
        Text("VISA").font(.system(size: 11, weight: .heavy)).italic().foregroundStyle(Color(red: 0.10, green: 0.12, blue: 0.44))
      case "mastercard":
        HStack(spacing: -5) {
          Circle().fill(Color(red: 0.92, green: 0.0, blue: 0.11)).frame(width: 12, height: 12)
          Circle().fill(Color(red: 0.97, green: 0.62, blue: 0.11).opacity(0.9)).frame(width: 12, height: 12)
        }
      case "amex":
        Text("AMEX").font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
      case "discover":
        HStack(spacing: 1) {
          Text("DISC").font(.system(size: 7, weight: .heavy)).foregroundStyle(Color(white: 0.15))
          Circle().fill(Color(red: 0.95, green: 0.45, blue: 0.10)).frame(width: 6, height: 6)
        }
      default:
        Image(systemName: "creditcard.fill").font(.system(size: 12)).foregroundStyle(Color(white: 0.45))
      }
    }
    .frame(width: 40, height: 27)
    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(edge, lineWidth: 0.5))
    .accessibilityHidden(true)
  }
}

/** "Link by Stripe" with Link's own mark, under the card that pays; "Credentials Store", with no mark, for a saved card. */
private struct MacLinkByStripe: View {
  let grey: Color
  /** Shop's name and mark for a card Shop pays (14 October 2026). */
  var wallet: PurchaseCard.Wallet = .link

  var body: some View {
    HStack(spacing: 4) {
      if wallet != .card, let mark = NSImage(named: wallet == .shop ? "Connectors/shop" : "Brands/link") {
        Image(nsImage: mark).resizable().scaledToFit().frame(width: 12, height: 12).clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
      }
      Text(wallet == .shop ? PurchaseCard.payWithShop : wallet == .card ? PurchaseCard.payWithSaved : PurchaseCard.payWithLink).font(.system(size: 12)).foregroundStyle(grey)
    }
    .accessibilityElement(children: .combine)
  }
}

/**
 * The person's Link cards, to pick the one that pays (14 October 2026), in a
 * popover: each with its network's mark, its name in Link and its last
 * four, the one that pays now ticked.
 */
private struct MacCardChooser: View {
  let cards: [PurchaseCard.Choice]
  let selected: String?
  let look: Look
  var footer: String = PurchaseCard.cardsFooter
  let pick: (PurchaseCard.Choice) -> Void
  @State private var hovered: String?

  var body: some View {
    let ink = look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f)
    let grey = look.dark ? Color(hex: 0x98989d) : Color(hex: 0x6e6e73)
    let edge = look.dark ? Color.white.opacity(0.08) : Color.black.opacity(0.08)
    VStack(alignment: .leading, spacing: 2) {
      Text(PurchaseCard.cardsTitle).font(.system(size: 12, weight: .semibold)).foregroundStyle(grey).padding(.horizontal, 10).padding(.top, 4).padding(.bottom, 4)
      ForEach(cards) { card in
        Button { pick(card) } label: {
          HStack(spacing: 10) {
            MacPaymentMark(brand: card.brand, edge: edge)
            VStack(alignment: .leading, spacing: 1) {
              Text(card.name ?? card.brand).font(.system(size: 13, weight: .medium)).foregroundStyle(ink).lineLimit(1)
              Text(card.last4.isEmpty ? card.brand : "\(card.brand) •••• \(card.last4)").font(.system(size: 11)).foregroundStyle(grey)
            }
            Spacer(minLength: 12)
            // Ticked in our blue, as on the iPhone (the founder, 24 October 2026).
            if card.id == selected { Image(systemName: "checkmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(look.settingsBlue) }
          }
          .padding(.horizontal, 10).padding(.vertical, 6)
          .background(hovered == card.id ? edge : Color.clear, in: RoundedRectangle(cornerRadius: 8))
          .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .onHover { hovered = $0 ? card.id : (hovered == card.id ? nil : hovered) }
      }
      Text(footer).font(.system(size: 11)).foregroundStyle(grey).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 10).padding(.top, 6)
    }
    .padding(8)
    .frame(width: 300)
  }
}

// MARK: Cloud agents

/**
 * A cloud agent the agent started (`sand-cloud-agent-card`): its name (14
 * on 22, 500, opening the pull request) with its state in a pill (Done in
 * green, Error in red, the rest grey); what it was asked; its branch and
 * "PR #412"; how many files changed with the lines added in green and taken
 * out in red; View PR in the blue. Asked again every five seconds while it
 * works (SimeonCore's `CloudAgentInfo.nextPoll`). Open shows its
 * conversation over the chat (13 November 2026, `ExchangeView`): what the
 * agent asked it, what it said along the way and its answers.
 */
struct CloudAgentCardView: View {
  let bcId: String
  let look: Look
  @Environment(AppStore.self) private var store
  /** The chat this card is in, where there is one: Open shows the conversation over it. */
  @Environment(ChatControl.self) private var control: ChatControl?
  @State private var info: CloudAgentInfo?

  var body: some View {
    let shown = info ?? CloudAgentInfo.unavailable
    let pull = URL(string: shown.pullRequestURL)
    CardShell(look: look, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 8) {
          Button { if let pull { NSWorkspace.shared.open(pull) } } label: {
            Text(shown.name.isEmpty ? String(localized: "Cloud agent") : shown.name)
              .font(.system(size: 14, weight: .medium))
              .tracking(-0.15)
              .foregroundStyle(look.ink)
              .lineLimit(1)
              .truncationMode(.tail)
          }
          .buttonStyle(.hand)
          .disabled(pull == nil)
          .help("Open the pull request")
          .frame(maxWidth: .infinity, alignment: .leading)
          statusPill(shown)
        }
        .frame(minHeight: 22)
        if !shown.prompt.isEmpty {
          Text(shown.prompt)
            .font(.system(size: 14))
            .tracking(-0.15)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        if !shown.branch.isEmpty || shown.pullRequestNumber != nil {
          HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.branch")
              .font(.system(size: 10))
              .foregroundStyle(look.inkSecondary)
              .frame(width: 12, height: 12)
            if !shown.branch.isEmpty {
              Text(shown.branch)
                .font(.system(size: 14))
                .tracking(-0.15)
                .foregroundStyle(look.inkSecondary)
                .lineLimit(1)
                .truncationMode(.middle)
            }
            if let number = shown.pullRequestNumber {
              Button { if let pull { NSWorkspace.shared.open(pull) } } label: {
                Text("PR #\(number)")
                  .font(.system(size: 14))
                  .tracking(-0.15)
                  .foregroundStyle(look.inkTertiary)
              }
              .buttonStyle(.hand)
              .help("Open the pull request")
            }
          }
        }
        if let changed = shown.changedLabel {
          HStack(spacing: 8) {
            HStack(spacing: 4) {
              Image(systemName: "doc")
                .font(.system(size: 10))
                .frame(width: 12, height: 12)
              Text(changed)
            }
            .foregroundStyle(look.inkSecondary)
            HStack(spacing: 4) {
              Text("+\(shown.linesAdded)").foregroundStyle(look.added)
              Text("-\(shown.linesRemoved)").foregroundStyle(look.dark ? Color(hex: 0xff5667) : Color(hex: 0xc21d2e))
            }
          }
          .font(.system(size: 14))
          .tracking(-0.15)
        }
      }
      if pull != nil || control != nil {
        HStack(spacing: 8) {
          if let control {
            CardButton(title: String(localized: "Open"), look: look) {
              control.openExchange(shown.party(bcId))
            }
          }
          if let pull {
            CardButton(title: String(localized: "View PR"), prominent: true, look: look) { NSWorkspace.shared.open(pull) }
              .help("Open the pull request")
          }
        }
      }
    }
    .task(id: bcId) {
      while !Task.isCancelled {
        let read = await store.cloudAgent(bcId)
        if case .info(let fresh) = read { info = fresh }
        guard let wait = CloudAgentInfo.nextPoll(after: read, known: info) else { return }
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
      }
    }
  }

  @ViewBuilder
  private func statusPill(_ shown: CloudAgentInfo) -> some View {
    switch shown.status {
    case .finished:
      StatusPill(text: shown.statusLabel, look: look, dot: look.working, ink: look.added, wash: look.addedWash, large: true)
    case .error:
      StatusPill(text: shown.statusLabel, look: look, dot: Color(hex: 0xff263c), ink: look.dark ? Color(hex: 0xff5667) : Color(hex: 0xc21d2e), wash: Color(hex: 0xff263c).opacity(look.dark ? 0.16 : 0.09), large: true)
    default:
      StatusPill(text: shown.statusLabel, look: look, large: true)
    }
  }
}

// MARK: Products

/**
 * The products card (14 October 2026; SimeonCore's `ProductsCard`), as a
 * shop's own cards (10 November 2026, after the founder's reference): no
 * frame round them, each product a card of its own, 200 wide and 20 round,
 * side by side in one row that scrolls sideways when they don't fit (six at
 * most). On each, the picture on white (200 by 240, fitted, padded 16) with
 * the badge at its top left, then on the card's colour the name (15,
 * semibold, one line), "price · take" in grey (two lines at most) and the
 * store's icon (16, rounded) and name in grey at the bottom, Buying in blue
 * or Bought in green at their right (18 October 2026, the founder: "make it
 * blue, and on the right"). Under the row, the agent's replies as chips (36
 * high, the card's colour) until the person sends anything after the card
 * (`ProductsCard.repliesOpen`); one pressed is sent as their own message. A
 * click opens the product over the chat (`MacProductPage`).
 */
struct ProductsCardView: View {
  let entryId: String
  let agentId: String
  let card: ProductsCard
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control

  var body: some View {
    let shown = card.shown(pressed: store.pressedProducts[entryId])
    VStack(alignment: .leading, spacing: 12) {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 10) {
          ForEach(shown.products) { product in
            MacProductCard(product: product, status: shown.status(of: product), look: look) {
              control.openProduct(ProductOpen(entryId: entryId, index: product.index))
            }
          }
        }
      }
      if !shown.shownReplies.isEmpty {
        MacProductReplies(replies: shown.shownReplies, paused: store.isSendingPaused, look: look) { reply in
          Task { await store.send(reply, to: agentId) }
        }
      }
    }
    .tracking(-0.15)
  }

  /** Buying in blue, Bought in green: the computer card's Skipped and Done. */
  static func tint(_ status: ProductsCard.Status, look: Look) -> Color {
    switch status {
    case .buying: return look.link
    case .bought: return look.added
    }
  }

  /** The words' ink, their grey, and the card's colour (the agent's grey; #2c2c2e in dark), as the iPhone's. */
  static func ink(_ look: Look) -> Color { look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f) }
  static func grey(_ look: Look) -> Color { look.dark ? Color(hex: 0x98989d) : Color(hex: 0x6e6e73) }
  static func ground(_ look: Look) -> Color { look.dark ? Color(hex: 0x2c2c2e) : look.theirs }
}

/** One product in the row: the picture on white with its badge, its name, "price · take" and its store. */
private struct MacProductCard: View {
  let product: ProductsCard.Product
  let status: ProductsCard.Status?
  let look: Look
  let open: () -> Void
  @State private var hovering = false
  static let width: CGFloat = 200

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
    Button(action: open) {
      VStack(alignment: .leading, spacing: 0) {
        MacProductPicture(url: product.imageURL, look: look)
          .padding(16)
          .frame(width: Self.width, height: 240)
          .background(Color.white)
          .overlay(alignment: .topLeading) {
            if let badge = product.badge { MacProductBadge(text: badge).padding(8) }
          }
        VStack(alignment: .leading, spacing: 0) {
          Text(product.title)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(ProductsCardView.ink(look))
            .lineLimit(1)
          // Two lines kept, so every card's store sits at its bottom.
          Text(product.priceLine ?? "")
            .font(.system(size: 14))
            .foregroundStyle(ProductsCardView.grey(look))
            .lineLimit(2, reservesSpace: true)
            .multilineTextAlignment(.leading)
            .padding(.top, 2)
          MacStoreLine(product: product, status: status, look: look)
            .padding(.top, 12)
        }
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 14, trailing: 14))
        .frame(width: Self.width, alignment: .leading)
      }
      .background(ProductsCardView.ground(look))
      .clipShape(shape)
      // In light, a hairline round it: its white would melt into the ground (`theirsHairline`).
      .overlay { shape.strokeBorder(look.theirsHairline, lineWidth: 1) }
      .brightness(hovering ? (look.dark ? 0.04 : -0.02) : 0)
      .contentShape(shape)
    }
    .buttonStyle(.hand)
    .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
    .accessibilityElement(children: .combine)
  }
}

/** The badge: a small grey pill, see-through, white words (12, medium), 8 in from the picture's top left. */
private struct MacProductBadge: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(Color.white)
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.55), in: Capsule())
  }
}

/** The store: its site's icon (as a saved login's, the letter until it comes) and its name in grey, 8 apart; Buying or Bought at the right. */
private struct MacStoreLine: View {
  let product: ProductsCard.Product
  var status: ProductsCard.Status? = nil
  var side: CGFloat = 16
  var size: CGFloat = 14
  let look: Look

  var body: some View {
    HStack(spacing: 8) {
      MacSiteIconTile(site: LinkIcons.site(of: product.url), title: product.storeName, side: side, look: look)
      Text(product.storeName)
        .font(.system(size: size))
        .foregroundStyle(ProductsCardView.grey(look))
        .lineLimit(1)
        .truncationMode(.tail)
      Spacer(minLength: 0)
      if let status {
        let tint = ProductsCardView.tint(status, look: look)
        StatusPill(text: status.label, look: look, dot: tint, ink: tint, wash: tint.opacity(look.dark ? 0.2 : 0.1))
          .fixedSize()
      }
    }
  }
}

/** The replies under the row: chips 36 high on the card's colour (15), 8 apart; under each other when the chat is too narrow for them side by side. */
private struct MacProductReplies: View {
  let replies: [String]
  let paused: Bool
  let look: Look
  let send: (String) -> Void

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) { chips }
      VStack(alignment: .leading, spacing: 8) { chips }
    }
  }

  @ViewBuilder private var chips: some View {
    ForEach(replies, id: \.self) { reply in
      MacReplyChip(text: reply, look: look) { send(reply) }
        .disabled(paused)
        .opacity(paused ? 0.5 : 1)
    }
  }
}

private struct MacReplyChip: View {
  let text: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(text)
        .font(.system(size: 15))
        .foregroundStyle(ProductsCardView.ink(look))
        .lineLimit(1)
        .padding(.horizontal, 16)
        .frame(height: 36)
        .background(ProductsCardView.ground(look), in: Capsule())
        .brightness(hovering ? (look.dark ? 0.05 : -0.03) : 0)
        .contentShape(Capsule())
        .fixedSize()
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** A product's own picture from its shop, fitted on white; a bag while it loads or when the shop gave none. */
private struct MacProductPicture: View {
  let url: URL?
  let look: Look
  @State private var loaded: NSImage?

  var body: some View {
    ZStack {
      Color.white
      if let loaded {
        Image(nsImage: loaded).resizable().interpolation(.high).scaledToFit()
      } else {
        Image(systemName: "bag").font(.system(size: 18)).foregroundStyle(Color(hex: 0x8e8e93))
      }
    }
    .accessibilityHidden(true)
    .task(id: url) {
      guard let url else { return }
      guard let (data, response) = try? await URLSession.shared.data(from: url), ((response as? HTTPURLResponse)?.statusCode ?? 200) < 400, let read = NSImage(data: data) else { return }
      loaded = read
    }
  }
}

/**
 * One product opened, over the whole chat and its field (not a sheet: the
 * sidebar stays; 10 November 2026, after the founder's reference), as an
 * exchange or a call's lines open (`ChatControl.productOpen`): the X (our
 * glass disc) at the top left, ‹ and › at the top right for the card's
 * other products. Two columns, 32 apart, at most 880 wide, 64 from the top:
 * at the left the picture on a white square (16 round), and under it "Why
 * it fits" (17, semibold) with each reason after a round green check; at
 * the right the store's icon and name (15, grey), the title (28, semibold),
 * the price (20) and "★ 5.0 (12)" (15, grey), the take (15, grey), "Buy
 * with <agent>" in our blue capsule, full width, "View at <store>" as plain
 * words, a hairline, and "Sold by" with the seller at its right. One column
 * in a narrow chat, the reasons last. Escape or the X closes it; ← and →
 * step as ‹ and ›; Return buys, unless a field has the keys.
 */
struct MacProductPage: View {
  let agentId: String
  let open: ProductOpen
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @Environment(Viewers.self) private var viewers
  @Environment(\.openURL) private var openURL

  private var ink: Color { ProductsCardView.ink(look) }
  private var grey: Color { ProductsCardView.grey(look) }
  private var hairline: Color { look.dark ? Color.white.opacity(0.1) : Color.black.opacity(0.08) }

  /** The card read afresh from the chat (or the thread open over it): Buying and Bought as they come. */
  private var card: ProductsCard? {
    for row in store.rows(for: agentId) + (store.threadRows[agentId] ?? []) {
      if case .products(let id, let card) = row, id == open.entryId { return card.shown(pressed: store.pressedProducts[open.entryId]) }
    }
    return nil
  }

  var body: some View {
    let card = self.card
    let product = card?.products.first { $0.index == open.index }
    ZStack(alignment: .top) {
      look.ground
        .contentShape(Rectangle())
      if let card, let product {
        page(card, product)
      }
    }
    .tracking(-0.15)
    .overlay(alignment: .topLeading) {
      GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { control.closeProduct() }
        .padding(12)
    }
    .overlay(alignment: .topTrailing) {
      if let card, let product {
        let previous = card.neighbour(of: product, by: -1)
        let next = card.neighbour(of: product, by: 1)
        HStack(spacing: 8) {
          GlassDiscButton(symbol: "chevron.left", help: String(localized: "Previous product"), size: 32) { step(card, product, -1) }
            .disabled(previous == nil)
            .opacity(previous == nil ? 0.4 : 1)
          GlassDiscButton(symbol: "chevron.right", help: String(localized: "Next product"), size: 32) { step(card, product, 1) }
            .disabled(next == nil)
            .opacity(next == nil ? 0.4 : 1)
        }
        .padding(12)
      }
    }
    .background(ViewerKeys { event in
      // Not a picture or diagram opened over it; while a field (find's) has the keys, they are the field's.
      guard viewers.shown == nil, !(NSApp.keyWindow?.firstResponder is NSText) else { return false }
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      guard mods.isEmpty else { return false }
      switch event.keyCode {
      case 53:
        control.closeProduct()
        return true
      case 123, 124:
        if let card, let product { step(card, product, event.keyCode == 123 ? -1 : 1) }
        return true
      case 36, 76:
        if let card, let product, card.status(of: product) == nil { buy(product) }
        return true
      default:
        return false
      }
    })
    // The card gone (the chat cleared, another chat), the page goes with it.
    .onChange(of: product == nil, initial: true) { _, gone in
      if gone { control.closeProduct() }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(product?.title ?? "")
    .accessibilityAddTraits(.isModal)
  }

  private func page(_ card: ProductsCard, _ product: ProductsCard.Product) -> some View {
    GeometryReader { box in
      let wide = box.size.width >= 744
      ScrollViewReader { reader in
        ScrollView {
          Group {
            if wide {
              HStack(alignment: .top, spacing: 32) {
                VStack(alignment: .leading, spacing: 0) {
                  picture(product)
                  why(product)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                facts(card, product)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .padding(.top, 4)
              }
            } else {
              VStack(alignment: .leading, spacing: 0) {
                picture(product)
                facts(card, product).padding(.top, 20)
                why(product)
              }
            }
          }
          .frame(maxWidth: wide ? 880 : 480)
          .padding(.horizontal, 32)
          .padding(.top, 64)
          .padding(.bottom, 48)
          .frame(maxWidth: .infinity)
          .id("top")
        }
        .onChange(of: open.index) { reader.scrollTo("top", anchor: .top) }
      }
    }
  }

  /** The picture on a white square, 16 round, fitted, padded 24. */
  private func picture(_ product: ProductsCard.Product) -> some View {
    let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
    return Color.white
      .aspectRatio(1, contentMode: .fit)
      .overlay { MacProductPicture(url: product.imageURL, look: look).padding(24) }
      .clipShape(shape)
      .overlay { shape.strokeBorder(look.theirsHairline, lineWidth: 1) }
      .frame(maxWidth: .infinity)
  }

  @ViewBuilder
  private func why(_ product: ProductsCard.Product) -> some View {
    if !product.reasons.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        Text(ProductsCard.whyItFits)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(ink)
          .padding(.bottom, 2)
        ForEach(Array(product.reasons.enumerated()), id: \.offset) { _, reason in
          HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "checkmark.circle")
              .font(.system(size: 15))
              .foregroundStyle(look.added)
            Text(reason)
              .font(.system(size: 15))
              .foregroundStyle(ink)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 32)
    }
  }

  private func facts(_ card: ProductsCard, _ product: ProductsCard.Product) -> some View {
    let status = card.status(of: product)
    return VStack(alignment: .leading, spacing: 0) {
      MacStoreLine(product: product, side: 18, size: 15, look: look)
      Text(product.title)
        .font(.system(size: 28, weight: .semibold))
        .foregroundStyle(ink)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 6)
      if product.price != nil || product.ratingLine != nil {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          if let price = product.price { MacProductPrice(price: price, listPrice: product.listPrice, ink: ink, grey: grey, size: 20) }
          if let rating = product.ratingLine { Text(rating).font(.system(size: 15)).foregroundStyle(grey).monospacedDigit() }
        }
        .padding(.top, 8)
      }
      if let take = product.shownTake {
        Text(take)
          .font(.system(size: 15))
          .foregroundStyle(grey)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 10)
      }
      MacProductBuyButton(label: status?.label ?? ProductsCard.buyLabel(agent: store.agent(agentId)?.name ?? ""), status: status, look: look) { buy(product) }
        .padding(.top, 20)
      Button { openURL(product.url) } label: {
        Text(product.viewAt).font(.system(size: 15)).foregroundStyle(ink)
          .frame(maxWidth: .infinity).frame(height: 38).contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .padding(.top, 4)
      Rectangle().fill(hairline).frame(height: 1).padding(.top, 14)
      HStack(alignment: .firstTextBaseline, spacing: 16) {
        Text(ProductsCard.soldBy).foregroundStyle(grey)
        Spacer(minLength: 0)
        Text(product.byline).foregroundStyle(ink).lineLimit(1).truncationMode(.tail)
      }
      .font(.system(size: 15))
      .padding(.top, 14)
    }
  }

  private func step(_ card: ProductsCard, _ product: ProductsCard.Product, _ by: Int) {
    guard let other = card.neighbour(of: product, by: by) else { return }
    control.productOpen = ProductOpen(entryId: open.entryId, index: other.index)
  }

  /** Buy: the page closes on the chat, where the agent sets up the checkout, and the card says Buying at once. */
  private func buy(_ product: ProductsCard.Product) {
    control.closeProduct()
    Task { await store.buyProduct(open.entryId, index: product.index, in: agentId) }
  }
}

/** Buy with <agent> in the chat's blue with white words, as the iPhone's; Buying faded while it is under way, Bought in green once ordered. */
private struct MacProductBuyButton: View {
  let label: String
  let status: ProductsCard.Status?
  let look: Look
  let action: () -> Void

  var body: some View {
    let bought = status == .bought
    let blue: Color = look.dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93)
    let wash: Color = bought ? look.addedWash : blue.opacity(status == nil ? 1 : 0.55)
    Button(action: action) {
      Text(label)
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(bought ? look.added : Color(hex: 0xfcfcfc))
        .frame(maxWidth: .infinity).frame(height: 38)
        .background(wash, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .disabled(status != nil)
  }
}

/** A price, and the price before the sale struck through after it in grey. */
private struct MacProductPrice: View {
  let price: String
  let listPrice: String?
  let ink: Color
  let grey: Color
  var size: CGFloat = 13

  var body: some View {
    HStack(spacing: 6) {
      Text(price).foregroundStyle(ink)
      if let listPrice { Text(listPrice).strikethrough().foregroundStyle(grey) }
    }
    .font(.system(size: size))
    .monospacedDigit()
    .lineLimit(1)
  }
}

/**
 * "Iris just joined your team" (the founder, 30 October 2026, after his
 * reference): the agent another one hired, its face standing on its own on
 * the card's bottom edge at the left (`AgentFaces.standing`; a picture of
 * its own sits round in that place), the title, what it does in two lines
 * at most, and Go to Chat and View Profile side by side at the bottom. One
 * height for every card, enough for the title, two lines and the buttons,
 * so the buttons sit on the bottom whatever the words. The agent gone
 * (deleted since), the words stay and the face and buttons go.
 */
struct JoinedCardView: View {
  let card: JoinedCard
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout

  /** 18 + the title (22) + 4 + two lines (38) + 14 at least + the buttons (32) + 18 is 146: room to spare. */
  static let height: CGFloat = 168
  static let faceColumn: CGFloat = 140
  static let radius: CGFloat = 20

  var body: some View {
    let agent = card.agent(in: store.agents)
    // The face's own background colour (design B, 30 October 2026); the chat's grey for a picture of its own or an agent gone.
    let colours = card.colours(in: store.agents)
    HStack(alignment: .top, spacing: 0) {
      if let agent { face(agent) }
      VStack(alignment: .leading, spacing: 0) {
        Text(verbatim: card.title(in: store.agents))
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(colours.map { Color($0.ink) } ?? look.ink)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        if !card.line.isEmpty {
          Text(verbatim: card.line)
            .font(.system(size: 14))
            .foregroundStyle(colours.map { Color($0.secondaryInk) } ?? look.inkSecondary)
            .lineLimit(2)
            .truncationMode(.tail)
            .padding(.top, 4)
        }
        if agent != nil {
          Spacer(minLength: 14)
          HStack(spacing: 8) {
            JoinedButton(title: JoinedCard.goToChat, prominent: true, look: look, colours: colours) {
              window.choose(card.agentId, store: store)
            }
            JoinedButton(title: JoinedCard.viewProfile, prominent: false, look: look, colours: colours) {
              pane.open(.profile, for: card.agentId, window: window, store: store, layout: layout)
            }
          }
        }
      }
      .padding(.vertical, 18)
      .padding(.leading, agent == nil ? 18 : 4)
      .padding(.trailing, 18)
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .frame(height: agent == nil ? nil : Self.height)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background { ground(colours) }
    .clipShape(RoundedRectangle(cornerRadius: Self.radius))
    .overlay { RoundedRectangle(cornerRadius: Self.radius).inset(by: -0.25).stroke(colours == nil ? look.theirsHairline : .clear, lineWidth: 0.5) }
    .shadow(color: look.theirsShadow, radius: 1, x: 0, y: 1)
    .accessibilityElement(children: .contain)
  }

  /** The colour, lighter at the top leading corner and darker at the bottom trailing one, a soft light behind the face; else the chat's grey. */
  @ViewBuilder
  private func ground(_ colours: JoinedCard.Colours?) -> some View {
    if let colours {
      ZStack(alignment: .leading) {
        LinearGradient(colors: [Color(colours.top), Color(colours.bottom)], startPoint: .topLeading, endPoint: .bottomTrailing)
        RadialGradient(colors: [Color(JoinedCard.Colours.glow), .clear], center: UnitPoint(x: 0.5, y: 0.7), startRadius: 0, endRadius: 110)
          .frame(width: 220, height: Self.height)
          .offset(x: Self.faceColumn / 2 - 110)
      }
    } else {
      look.theirs
    }
  }

  /** The face standing on the card's bottom edge, 10 points under its top; a picture of its own, round, in the middle of the same place. */
  @ViewBuilder
  private func face(_ agent: Agent) -> some View {
    if let face = AgentFaces.standing(agent), let image = AvatarPictures.standing(face) {
      Image(nsImage: image)
        .resizable()
        .interpolation(.high)
        .scaledToFit()
        .frame(width: Self.faceColumn, height: Self.height - 10, alignment: .bottom)
        .frame(width: Self.faceColumn, height: Self.height, alignment: .bottom)
        .accessibilityHidden(true)
    } else {
      AgentPicture(image: AvatarPictures.image(for: agent), size: 72)
        .frame(width: Self.faceColumn, height: Self.height)
    }
  }
}

/**
 * The joined card's buttons: round ends, as wide as each other. On the face's
 * colour, Go to Chat white with its words in the colour's deep shade, View
 * Profile a pane of the words' colour; on the chat's grey, Go to Chat in the
 * window's blue.
 */
private struct JoinedButton: View {
  let title: String
  let prominent: Bool
  let look: Look
  let colours: JoinedCard.Colours?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(verbatim: title)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(ink)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .frame(height: 32)
        .background(fill, in: Capsule())
        .overlay { Capsule().strokeBorder(edge, lineWidth: colours == nil ? 1 : 0.5) }
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
  }

  private var ink: Color {
    if let colours { return prominent ? Color(colours.deep) : Color(colours.ink) }
    return prominent ? (look.dark ? Color(hex: 0x0b1828) : look.yoursText) : look.ink
  }

  private var fill: Color {
    if let colours { return prominent ? .white : Color(colours.pane) }
    return prominent ? look.blue : look.wash
  }

  private var edge: Color {
    if prominent { return .clear }
    if let colours { return Color(colours.paneEdge) }
    return look.ink.opacity(0.15)
  }
}
