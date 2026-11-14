import SwiftUI
import QuickLook
#if os(iOS)
import UIKit
#endif
import SimeonCore

/**
 * How wide the chat is, so a bubble or card can cap itself: on the iPhone
 * 36 pt short of the chat's width (334 pt of a 402 pt screen), as wide as
 * the founder's reference app's bubbles (asked for 11 October 2026; it
 * was 288 pt, the window's rule); on the Mac the window's
 * `min(88%, 640px, 100% - 82px)`.
 */
struct ChatWidthKey: EnvironmentKey { static let defaultValue: CGFloat = 361 }

extension EnvironmentValues {
  var chatWidth: CGFloat {
    get { self[ChatWidthKey.self] }
    set { self[ChatWidthKey.self] = newValue }
  }
}

enum ChatMetrics {
  static func bubbleMax(_ width: CGFloat) -> CGFloat {
    #if os(iOS)
    min(width - 36, 640)
    #else
    min(width * 0.88, 640, width - 82)
    #endif
  }
}

/** The quiet grey button outside the cards (Show Hidden Agents, a row's Connect): the faint fill and a hairline edge. */
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

/**
 * A card's button, one style on every card (10 November 2026, the question
 * card's; the founder: "go for your suggestions"): a capsule 38 high, 15
 * medium. The main action (`main`) in our blue (the founder: "make them our
 * blue"); the others grey; a refusal (`danger`) in red words; `money` (buy,
 * book, pay) the same blue. A card sets them in `CardPills`, at its right,
 * the main one last.
 */
struct CardPillStyle: ButtonStyle {
  enum Tone { case plain, main, danger, money }
  var tone: Tone = .plain
  /** 38 under a card; 32 in a card's own row, beside its name (Connect). */
  var height: CGFloat = 38

  func makeBody(configuration: Configuration) -> some View {
    CardPill(configuration: configuration, tone: tone, height: height)
  }

  private struct CardPill: View {
    let configuration: ButtonStyleConfiguration
    let tone: Tone
    let height: CGFloat
    @Environment(\.isEnabled) private var enabled
    @Environment(\.cardPillsStacked) private var stacked

    var body: some View {
      let small = height < 36
      configuration.label
        .font(.system(size: small ? 13 : 15, weight: .medium))
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.horizontal, small ? 14 : 18)
        .frame(maxWidth: stacked ? .infinity : nil)
        .frame(height: height)
        .background(fill, in: Capsule())
        .contentShape(Capsule())
        .opacity(!enabled ? 0.4 : configuration.isPressed ? 0.7 : 1)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var ink: Color {
      switch tone {
      case .main, .money: Ink.mineText
      case .danger: Ink.danger
      case .plain: Ink.primary
      }
    }

    private var fill: Color {
      switch tone {
      case .main, .money: Ink.bubbleMine
      case .plain, .danger: Ink.primary.opacity(0.08)
      }
    }
  }
}

private struct CardPillsStackedKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
  /** Set by `CardPills` when its buttons sit one under the other, each across the card. */
  var cardPillsStacked: Bool {
    get { self[CardPillsStackedKey.self] }
    set { self[CardPillsStackedKey.self] = newValue }
  }
}

/**
 * A card's buttons: in a row at its right, the main one last, with
 * `leading` (Skip, a note) at its left. When they don't fit across (three
 * on a small iPhone, or a longer translation), one under the other, each as
 * wide as the card, `leading` last, rather than cut short.
 */
struct CardPills<Leading: View, Content: View>: View {
  private let leading: Leading
  private let content: Content

  init(@ViewBuilder content: () -> Content) where Leading == EmptyView {
    self.leading = EmptyView()
    self.content = content()
  }

  init(@ViewBuilder leading: () -> Leading, @ViewBuilder content: () -> Content) {
    self.leading = leading()
    self.content = content()
  }

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) {
        leading
        Spacer(minLength: 0)
        content
      }
      VStack(spacing: 8) {
        content
        leading
      }
      .environment(\.cardPillsStacked, true)
    }
  }
}

/**
 * A card's kind at its top, as the founder's references put it (10
 * November 2026): a 32 tile (9 round, the ink at 6%, a hairline) with the
 * kind's symbol, its name (16), and what happened in a pill at the right.
 */
struct CardKindHead<End: View>: View {
  let symbol: String
  let name: String
  @ViewBuilder var end: () -> End

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: symbol)
        .font(.system(size: 15, weight: .regular))
        .foregroundStyle(Ink.secondary)
        .frame(width: 32, height: 32)
        .background(Ink.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(Ink.primary.opacity(0.14), lineWidth: 0.5))
        .accessibilityHidden(true)
      Text(name).font(.system(size: 16)).foregroundStyle(Ink.primary)
        .frame(maxWidth: .infinity, alignment: .leading)
      end()
    }
  }
}

extension CardKindHead where End == EmptyView {
  init(symbol: String, name: String) {
    self.init(symbol: symbol, name: name) { EmptyView() }
  }
}

/** `checkmark.shield` and its line (13), in grey: kept safe, never shown to the agent. */
struct CardShieldLine: View {
  let words: String

  var body: some View {
    HStack(alignment: .top, spacing: 5) {
      Image(systemName: "checkmark.shield").font(.system(size: 13)).padding(.top, 1)
      Text(words).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
    }
    .foregroundStyle(Ink.secondary)
  }
}

extension View {
  /**
   * A field on a card or a secure form: 17, 44 high, padded 14 at the
   * sides, 14 round with its edge (the founder, 10 November 2026: "all
   * writing boxes should be rounded too").
   */
  func cardField(height: CGFloat? = 44) -> some View {
    self
      .font(.system(size: 17))
      .padding(.horizontal, 14)
      .padding(.vertical, height == nil ? 11 : 0)
      .frame(height: height)
      .background(Ink.field, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.edge, lineWidth: 1))
  }
}

/** The round glass close at a sheet's top left, as the phone design puts it. */
struct CloseDisc: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
        .frame(width: 40, height: 40)
    }
    .buttonStyle(Tactile(look: GlassDisc()))
    .accessibilityLabel("Close")
  }
}

/**
 * A round glass button (the phone design's discs: close, +, the call's
 * controls, the computer's keyboard). The style draws the glass and takes
 * the tap on the whole circle; pressed, it dips. The glass is not made
 * "interactive": interactive glass handles the touch itself for its own
 * bloom, around a button that handles it too, and a first tap could go
 * nowhere (the founder, 9 October 2026: "i have to double click most of
 * them").
 */
struct GlassDisc: ButtonStyle {
  var tint: Color? = nil
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .contentShape(.circle)
      .glassEffect(tint.map { Glass.regular.tint($0) } ?? .regular, in: .circle)
      .scaleEffect(configuration.isPressed ? 0.92 : 1)
      .opacity(!enabled ? 0.4 : configuration.isPressed ? 0.75 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

/** A grey pill with a dot: "Dismissed", "Ready to send", "Sent"; or in a colour of its own (the computer card's Done, Skipped, Canceled). */
struct StatusPill: View {
  let text: String
  var dot: Color = Ink.tertiary
  var ink: Color = Ink.secondary
  var wash: Color = Ink.pill
  var size: CGFloat = 13

  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(dot).frame(width: 6, height: 6)
      Text(text).font(.system(size: size, weight: .medium)).foregroundStyle(ink).lineLimit(1)
    }
    .padding(.horizontal, 8).padding(.vertical, 2)
    .background(wash, in: Capsule())
  }
}

// MARK: - Question

/**
 * A question card (10 November 2026, the founder's reference: "change our
 * card style to this. but keep the round check and our blue color"): the
 * question in bold, each choice with its letter on a small tile (A, B, C…)
 * that becomes our blue round check once picked, "Something else" last when
 * the agent allows the person's own words. A card may ask several questions
 * ("have the thing swipe when there's many questions"): one at a time,
 * swiped or carried by Back, Skip and Next (Send on the last), dots at the
 * foot; the answers go together, a line each (`QuestionCard.reply`). A pick
 * moves on by itself, and on the last question sends. Skip on a card of one
 * question declines it. Answered: each question in grey with its answer
 * after a thin blue tick (as before the new style, the founder); dismissed: the question and a pill.
 */
struct QuestionCardView: View {
  let entryId: String
  let agentId: String
  let card: QuestionCard
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width

  var body: some View {
    let pending = store.pendingAnswers[entryId]
    let answer = card.answer ?? ((pending?.isEmpty ?? true) ? nil : pending)
    Group {
      if card.isDismissed || pending == "" {
        dismissed
      } else if let answer {
        AnsweredQuestionsView(card: card, answer: answer)
      } else if card.isSkipped {
        dismissed
      } else {
        AskingQuestionsView(entryId: entryId, agentId: agentId, card: card)
      }
    }
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
  }

  private var dismissed: some View {
    HStack(alignment: .center, spacing: 8) {
      Text(card.prompt).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.secondary).lineLimit(2)
      Spacer(minLength: 0)
      StatusPill(text: card.isSkipped && !card.isDismissed ? String(localized: "Skipped") : String(localized: "Dismissed"))
    }
    .card(radius: 22, padding: 16)
  }
}

/** The questions being asked, one at a time. */
private struct AskingQuestionsView: View {
  let entryId: String
  let agentId: String
  let card: QuestionCard
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var index = 0
  @State private var forward = true
  @State private var picks: [Int: Set<Int>] = [:]
  @State private var own: [Int: String] = [:]
  @State private var writing: Int?
  @State private var sending = false
  @FocusState private var typing: Int?

  private var questions: [QuestionCard.Question] { card.questions }
  private var isLast: Bool { index >= questions.count - 1 }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
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
      .contentShape(Rectangle())
      .simultaneousGesture(swipe)
      footer
    }
    .padding(.horizontal, 8)
    .padding(.top, 16)
    .padding(.bottom, 14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .modifier(CardEdge(radius: 22))
  }

  private var slide: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                       removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity))
  }

  /** A swipe sideways: left to the next question once this one is answered, right back to the one before. */
  private var swipe: some Gesture {
    DragGesture(minimumDistance: 24)
      .onEnded { drag in
        let across = drag.translation.width
        guard questions.count > 1, abs(across) > abs(drag.translation.height) * 1.5, abs(across) > 44 else { return }
        if across < 0 { if !isLast, answer(index) != nil { move(to: index + 1) } } else { move(to: index - 1) }
      }
  }

  private func page(_ at: Int, live: Bool) -> some View {
    let question = questions[at]
    return VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(question.prompt).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
          .fixedSize(horizontal: false, vertical: true)
        if let help = question.help, !help.isEmpty {
          Text(help).font(.system(size: 15)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.horizontal, 8)
      VStack(spacing: 2) {
        ForEach(Array(question.options.enumerated()), id: \.offset) { place, option in
          Button { choose(place, in: at) } label: {
            QuestionRow(picked: picks[at, default: []].contains(place)) {
              QuestionTile(letter: Self.letter(place), picked: picks[at, default: []].contains(place))
              VStack(alignment: .leading, spacing: 1) {
                Text(option.label).font(.system(size: 17, weight: option.style == .primary ? .medium : .regular))
                  .foregroundStyle(option.style == .danger ? Ink.danger : option.style == .primary ? Ink.blue : Ink.primary)
                  .multilineTextAlignment(.leading)
                if let line = option.description, !line.isEmpty {
                  Text(line).font(.system(size: 15)).foregroundStyle(Ink.secondary).multilineTextAlignment(.leading)
                }
              }
            }
          }
          .buttonStyle(.tactile)
          .accessibilityAddTraits(picks[at, default: []].contains(place) ? .isSelected : [])
        }
        if question.allowsOwnAnswer { ownRow(at, live: live) }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /** "Something else": its letter and grey words, a field in the row once tapped. */
  private func ownRow(_ at: Int, live: Bool) -> some View {
    let words = own[at, default: ""]
    let open = writing == at || !words.isEmpty
    let given = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    return QuestionRow(picked: given) {
      QuestionTile(letter: Self.letter(questions[at].options.count), picked: given)
      if open {
        TextField("Something else", text: Binding(get: { own[at, default: ""] }, set: { typed in
          own[at] = typed
          if !questions[at].multiSelect && !typed.isEmpty { picks[at] = [] }
        }), axis: .vertical)
          .font(.system(size: 17))
          .lineLimit(1...4)
          .focused($typing, equals: live ? at : -1 - at)
          .submitLabel(isLast ? .send : .next)
          .onSubmit(next)
          .accessibilityLabel("Your own answer")
      } else {
        Text("Something else").font(.system(size: 17)).foregroundStyle(Ink.tertiary)
      }
    }
    .contentShape(Rectangle())
    .onTapGesture {
      writing = at
      // The field appears with this change; it takes the typing on the next beat, once it is there.
      Task { typing = at }
    }
  }

  private var footer: some View {
    HStack(spacing: 8) {
      if questions.count > 1 { QuestionDots(count: questions.count, at: index) }
      Spacer(minLength: 0)
      if index > 0 {
        QuestionPill(title: String(localized: "Back")) { move(to: index - 1) }
      }
      QuestionPill(title: String(localized: "Skip"), action: skip)
      QuestionPill(title: isLast ? String(localized: "Send") : String(localized: "Next"), prominent: true, action: next)
        .disabled(answer(index) == nil || sending)
    }
    .padding(.horizontal, 8)
  }

  static func letter(_ place: Int) -> String {
    let letters = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    return String(letters[max(0, min(place, letters.count - 1))])
  }

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
    Haptics.tap()
    if questions[at].multiSelect {
      var now = picks[at, default: []]
      if now.contains(place) { now.remove(place) } else { now.insert(place) }
      picks[at] = now
      return
    }
    picks[at] = [place]
    own[at] = ""
    writing = nil
    typing = nil
    // A pick moves on by itself once its check has shown: to the next question, or, on the last, sends.
    Task {
      try? await Task.sleep(for: .milliseconds(240))
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

  private func skip() {
    guard !sending else { return }
    picks[index] = []
    own[index] = ""
    if isLast { send() } else { move(to: index + 1) }
  }

  private func send() {
    sending = true
    typing = nil
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
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var index = 0
  @State private var forward = true

  var body: some View {
    let answers = card.answers(answer)
    VStack(alignment: .leading, spacing: 14) {
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
          QuestionDots(count: card.questions.count, at: index)
          Spacer(minLength: 0)
          QuestionPill(title: String(localized: "Back")) { move(to: index - 1) }
            .disabled(index == 0)
          QuestionPill(title: String(localized: "Next")) { move(to: index + 1) }
            .disabled(index >= card.questions.count - 1)
        }
        .padding(.horizontal, 8)
      }
    }
    .padding(.horizontal, 8)
    .padding(.top, 16)
    .padding(.bottom, 14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .modifier(CardEdge(radius: 22))
  }

  private var slide: AnyTransition {
    if reduceMotion { return .opacity }
    return .asymmetric(insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                       removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity))
  }

  private func page(_ at: Int, _ answers: [String?]) -> some View {
    let given = at < answers.count ? answers[at] : nil
    return VStack(alignment: .leading, spacing: 12) {
      Text(card.questions[at].prompt).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.secondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        if let given {
          // A thin blue tick, as before the cards' new style (the founder); the round check stays on the option picked.
          Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.blue).frame(width: 18)
          Text(given).font(.system(size: 17)).foregroundStyle(Ink.primary).fixedSize(horizontal: false, vertical: true)
        } else {
          Text("Skipped").font(.system(size: 17)).foregroundStyle(Ink.tertiary)
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

/** A choice's row: 14 round, a lighter grey once picked. */
private struct QuestionRow<Content: View>: View {
  let picked: Bool
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      content()
      Spacer(minLength: 0)
    }
    .padding(.vertical, 9)
    .padding(.horizontal, 8)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(picked ? Ink.primary.opacity(0.07) : Color.clear))
    .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

/** A choice's letter on a small tile, or our blue round check once picked. */
private struct QuestionTile: View {
  let letter: String
  let picked: Bool

  var body: some View {
    ZStack {
      if picked {
        Image(systemName: "checkmark.circle.fill").font(.system(size: 24)).foregroundStyle(Ink.blue)
          .transition(.scale(scale: 0.6).combined(with: .opacity))
      } else {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(Ink.primary.opacity(0.05))
          .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Ink.hairline, lineWidth: 1) }
          .overlay { Text(letter).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.secondary) }
          .transition(.opacity)
      }
    }
    .frame(width: 28, height: 28)
    .animation(.spring(response: 0.25, dampingFraction: 0.8), value: picked)
    .accessibilityHidden(true)
  }
}

/** Where the person is among a card's questions. */
private struct QuestionDots: View {
  let count: Int
  let at: Int

  var body: some View {
    HStack(spacing: 6) {
      ForEach(0..<count, id: \.self) { place in
        Circle().fill(Ink.primary.opacity(place == at ? 0.5 : 0.14)).frame(width: 7, height: 7)
      }
    }
    .animation(.easeOut(duration: 0.2), value: at)
    .accessibilityElement()
    .accessibilityLabel(Text("Question \(at + 1) of \(count)"))
  }
}

/** The card's buttons, every card's pills: grey, Next and Send the main one. */
private struct QuestionPill: View {
  let title: String
  var prominent = false
  let action: () -> Void

  var body: some View {
    Button(title, action: action)
      .buttonStyle(Tactile(look: CardPillStyle(tone: prominent ? .main : .plain)))
      .fixedSize()
  }
}

// MARK: - Connected apps

/**
 * An app's tile. A connector's is its own app icon, whole (AppIcons, from
 * ios/scripts/app_icons.py; 14 October 2026). Any other app's is its logo on
 * a tile, white in light and dark in dark mode, with the logo's dark version
 * where the app has one (GitHub's and Intercom's from Composio's dark theme,
 * Mercury's from its own file; the others' marks read on a dark tile as they
 * are). make-assets.mjs writes those pairs.
 */
struct ConnectorTile: View {
  let name: String
  var size: CGFloat = 40
  /** How much of the tile the logo takes: 0.6 in a chat's card, more on Connectors, where it reads as the app's icon (the founder, 13 October 2026: "bigger the logos ... they're too small"). */
  var logo: CGFloat = 0.6
  /** The catalogue's id, when the caller has it; the name finds it otherwise. */
  var id: String? = nil
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    // A connector's own app icon, the logo filling the tile with an app icon's corners (14 October 2026, the founder's
    // reference: "full logo"); the hairline keeps a black icon on the dark ground in view.
    if let icon = MentionArt.appIcon(id: id, name: name) {
      let shape = RoundedRectangle(cornerRadius: size * ConnectorLogo.iconCorner, style: .continuous)
      Image(uiImage: icon)
        .resizable()
        .interpolation(.high)
        .scaledToFill()
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(shape.stroke(Ink.tileEdge, lineWidth: 0.5))
        .accessibilityHidden(true)
    } else {
      markTile
    }
  }

  /** An app with no icon of its own (a plugin from a marketplace): its mark on the tile, or its first letter. */
  private var markTile: some View {
    let shape = RoundedRectangle(cornerRadius: size * 11 / 40, style: .continuous)
    return ZStack {
      shape.fill(Ink.tile)
      if let art = MentionArt.connector(name) {
        Image(uiImage: art.resolved(scheme)).resizable().scaledToFit().frame(width: size * logo, height: size * logo)
      } else {
        Text(String(name.prefix(1)).uppercased()).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(Ink.tileInitial)
      }
    }
    .frame(width: size, height: size)
    .overlay(shape.stroke(Ink.tileEdge, lineWidth: 0.5))
  }
}

#if os(iOS)
extension UIImage {
  /** The asset's own picture for light or dark: SwiftUI draws a UIImage as it was first resolved, not as the appearance changes. (The Mac's: mac/Simeon/UIKitOnMac.swift.) */
  func resolved(_ scheme: ColorScheme) -> UIImage {
    imageAsset?.image(with: UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light)) ?? self
  }
}
#endif

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

/** One app's card: its tile, its name, why, how many tools it brings once connected ("12 tools", as the Mac's), and Connect or ✓ Connected (`Connecting`). */
struct ConnectorCard: View {
  let name: String
  let reason: String?
  var markedConnected = false
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  /** What the person reads before the sign-in page opens; Connect there starts the same connecting as before. */
  @State private var asking: ConnectConsent?
  @State private var confirmed = false
  private var connector: AppConnector { AppConnector.shared }

  var body: some View {
    let app = store.catalogApp(named: name)
    let isConnected = markedConnected || store.isConnected(name)
    let waiting = connector.connecting == name
    // How many tools it brings once added, as the Mac's card says it (mac/Simeon/Cards.swift `ConnectorCard`).
    let tools = store.apps.first { $0.name.lowercased() == name.lowercased() && $0.status == "connected" }?.toolCount ?? 0
    HStack(spacing: 12) {
      ConnectorTile(name: app?.title ?? name)
      VStack(alignment: .leading, spacing: 0) {
        Text(app?.title ?? name).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        Text(waiting ? String(localized: "Waiting for \(name) authorization…") : (reason ?? app?.summary ?? ""))
          .font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(1)
        if store.isConnected(name) && tools > 0 {
          Text(tools == 1 ? "1 tool" : "\(tools) tools").font(.system(size: 12)).foregroundStyle(Ink.tertiary).lineLimit(1)
        }
      }
      Spacer(minLength: 0)
      if isConnected {
        ConnectedMark()
      } else if store.isComingSoon(name) {
        // Not one an agent can be given yet (`AppsComingSoon`).
        PluginPill(title: AppsComingSoon.label, fill: Ink.pillButton, ink: Ink.tertiary)
          .accessibilityLabel("\(app?.title ?? name) is coming soon")
      } else if waiting {
        ProgressView().controlSize(.small)
      } else {
        Button(Connecting.connect) { asking = ConnectConsent(app: app, name: name) }
          .buttonStyle(Tactile(look: GreyButtonStyle(capsule: true)))
          .disabled(connector.connecting != nil)
          .accessibilityLabel("Connect \(app?.title ?? name)")
      }
    }
    .card()
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
    // The sign-in page opens once the sheet has gone: iOS opens it over the app, not over a sheet on its way out.
    .sheet(item: $asking, onDismiss: {
      guard confirmed else { return }
      confirmed = false
      Task { await connector.connect(name, store: store) }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
        .macSheetSize(width: 440, height: 560)
    }
  }
}

/**
 * Before an app's sign-in page opens, every time (the founder, 9 October
 * 2026): the app's logo, name and what it does; three points (what the
 * agents reach in it, that the person stays in charge, that agents can get
 * things wrong); the small print (who handles the sign-in, Composio for the
 * apps it serves; where the information goes; the app's own terms) and,
 * for some apps, one more thing about that app. Connect, or Cancel.
 * ConnectConsent (SimeonCore) writes it for each app.
 */
struct ConnectConsentSheet: View {
  let consent: ConnectConsent
  let connect: () -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(spacing: 0) {
          logo
            .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
            .padding(.top, 30)
            .accessibilityHidden(true)
          Text(consent.title)
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(Ink.primary)
            .padding(.top, 14)
            .accessibilityAddTraits(.isHeader)
          if !consent.summary.isEmpty {
            Text(consent.summary)
              .font(.system(size: 15))
              .foregroundStyle(Ink.secondary)
              .multilineTextAlignment(.center)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.top, 6)
              .padding(.horizontal, 28)
          }
          VStack(alignment: .leading, spacing: 22) {
            ForEach(Array(consent.points.enumerated()), id: \.offset) { _, point in
              HStack(alignment: .top, spacing: 14) {
                Image(systemName: point.symbol)
                  .font(.system(size: 20, weight: .regular))
                  .foregroundStyle(Ink.blue)
                  .frame(width: 28)
                  .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                  Text(point.title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
                  Text(point.body).font(.system(size: 15)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
                }
              }
              .accessibilityElement(children: .combine)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 24)
          .padding(.top, 28)
          Rectangle().fill(Ink.hairline).frame(height: 0.5).padding(.top, 26)
          VStack(alignment: .leading, spacing: 12) {
            ForEach(consent.smallPrint + (consent.note.map { [$0] } ?? []), id: \.self) { line in
              Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 24)
          .padding(.vertical, 18)
        }
      }
      VStack(spacing: 4) {
        Button {
          connect()
          dismiss()
        } label: {
          Text("Connect").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 50)
        }
        .buttonStyle(.glassProminent)
        // Our blue: the list's tint (the primary ink, white in dark) made it a white button with white words.
        .tint(Ink.blue)
        Button { dismiss() } label: {
          Text("Cancel").font(.system(size: 17)).foregroundStyle(Ink.primary).frame(maxWidth: .infinity).frame(height: 44).contentShape(.rect)
        }
        .buttonStyle(.tactile)
      }
      .padding(.horizontal, 24)
      .padding(.top, 10)
      .padding(.bottom, 8)
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }

  /** A program by its own logo, bare (`ProgramLogo`: Codex's or Claude Code's, from the chat's card); a plan's or a key's provider by its own logo (`Providers/<provider>`, so Amazon Bedrock and Z.AI are never a letter), with an app icon's corners; an app by its tile. */
  @ViewBuilder private var logo: some View {
    if let program = consent.programLogo {
      ProgramLogo(name: program, size: 56)
    } else if let provider = consent.provider, let icon = UIImage(named: "Providers/\(provider)") {
      let shape = RoundedRectangle(cornerRadius: 56 * ConnectorLogo.iconCorner, style: .continuous)
      Image(uiImage: icon)
        .resizable()
        .interpolation(.high)
        .scaledToFill()
        .frame(width: 56, height: 56)
        .clipShape(shape)
        .overlay(shape.stroke(Ink.tileEdge, lineWidth: 0.5))
    } else {
      ConnectorTile(name: consent.title, size: 56)
    }
  }
}

/** "✓ Connected" in green, word and tick (the founder, 16 October 2026): how an app's card, a routine's Connect card and the Connect GitHub card say it is connected. */
struct ConnectedMark: View {
  var body: some View {
    Label(Connecting.connected, systemImage: "checkmark").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.success).labelStyle(.titleAndIcon)
  }
}

/**
 * The row an app's card is made of (`ConnectorCard`), for the two cards
 * that connect one app (a routine's Slack or GitHub, GitHub on the
 * computer): the app's tile, its title (13, 500) and a line under it, then
 * what the card says or offers at the right.
 */
struct ConnectAppRow<End: View>: View {
  let app: String
  let title: String
  let line: String
  /** A program's own logo in place of the app's tile (`ProgramLogo`): Claude Code's or Codex's. */
  var logo: String? = nil
  @ViewBuilder var end: () -> End

  var body: some View {
    HStack(spacing: 12) {
      if let logo { ProgramLogo(name: logo) } else { ConnectorTile(name: app) }
      VStack(alignment: .leading, spacing: 0) {
        Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        if !line.isEmpty {
          Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
      end()
    }
  }
}

/**
 * "Connect Slack" (`sand-listener-connect-card`, view-3mdFcnEj.js), drawn
 * as an app to connect is (13 November 2026, the founder of the green tick
 * in a circle: "this is nowhere near our design"): the app's tile, "Connect
 * Slack" with why ("Connect Slack so this routine can fire.", or the
 * window's own line), and Connect; once linked, the app's name and
 * "✓ Connected" as a connected app's card. Connect opens the linking page
 * outside the app, as the Mac does, and the card asks every five seconds
 * until linked.
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
    if let reason, !reason.isEmpty { return String(localized: "Connect \(name) \(reason).") }
    return platform == "slack" ? String(localized: "Link Slack so your agent can wake on messages, mentions, and reactions.") : String(localized: "Link GitHub so your agent can wake on PRs, comments, issues, and CI.")
  }

  var body: some View {
    ConnectAppRow(app: name, title: connected == true ? name : String(localized: "Connect \(name)"), line: connected == true ? "" : line) {
      if connected == true {
        ConnectedMark()
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
        .buttonStyle(Tactile(look: CardPillStyle(tone: .main, height: 32)))
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

/**
 * "Connect GitHub" with a one-time code (`github-sign-in`, 11 November 2026;
 * SimeonCore's `GitHubSignInCard`), drawn as an app to connect is (13
 * November 2026): GitHub's tile and the title with a line under it, then the
 * code large in monospaced figures and the card's buttons, Copy code and
 * Open GitHub (our blue, last). The person opens GitHub's page on this
 * iPhone, signs in to GitHub there as usual and types the code; the card
 * asks the computer every three seconds. Once GitHub is connected the code
 * and its line go, and the card reads as a connected app's: "GitHub", the
 * account under it, "✓ Connected". A code that ran out says it expired. The
 * agent goes on by itself once GitHub is connected.
 */
struct GitHubSignInCardView: View {
  let card: GitHubSignInCard
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @Environment(\.chatWidth) private var width
  @State private var state: GitHubSignInCard.State?
  @State private var copied = false

  private var waiting: Bool { state == nil || state == .waiting }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      ConnectAppRow(app: "GitHub", title: GitHubSignInCard.title(state), line: GitHubSignInCard.line(state)) {
        if case .connected(let login) = state {
          ConnectedMark().accessibilityLabel(GitHubSignInCard.connectedLabel(login))
        }
      }
      if waiting {
        Text(card.code)
          .font(.system(size: 24, weight: .semibold, design: .monospaced))
          .tracking(1)
          .foregroundStyle(Ink.primary)
          .textSelection(.enabled)
        CardPills {
          Button(copied ? GitHubSignInCard.copiedLabel : GitHubSignInCard.copyLabel) {
            UIPasteboard.general.string = card.code
            copied = true
          }
          .buttonStyle(Tactile(look: CardPillStyle()))
          Button(GitHubSignInCard.openLabel) { openURL(card.url) }
            .buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
        }
      }
    }
    .card()
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
    .task(id: card.code) {
      while !Task.isCancelled {
        let read = card.state(await store.gitHubSignIn(), nowMs: Date().timeIntervalSince1970 * 1000)
        if let read { state = read }
        guard let wait = GitHubSignInCard.nextPoll(read ?? state) else { return }
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
      }
    }
  }
}

/**
 * Claude Code's or Codex's own logo, whole and bare (13 November 2026, the
 * founder: "its full logo no white or dark background"): no tile, no ground
 * and no hairline behind it, in the place an app's 40 tile takes. The
 * cut-outs (`Mascots/`) keep a clear margin around the picture, so it is
 * drawn a fifth larger than its place and the picture itself fills the 40.
 */
struct ProgramLogo: View {
  let name: String
  var size: CGFloat = 40

  var body: some View {
    Image("Mascots/\(name)")
      .resizable()
      .interpolation(.high)
      .scaledToFit()
      .frame(width: size * 1.2, height: size * 1.2)
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

/**
 * "Connect Claude Code" and "Connect Codex" in one card (`model-connect`, 13
 * November 2026, the founder: "when neither of them is connected, the user
 * is given a choice of both cards to connect"): what a cloud agent's coding
 * runs in. Each row is a program, by its own name and its own logo bare
 * (the founder, the same day: "its connect codex or connect claude code ...
 * for the card specifically its that. but settings is claude and chat
 * gpt"), over whose plan it runs on. Connect shows the consent AI Models
 * shows for that plan, then its own sign-in sheet (`ChatGPTConnectSheet`,
 * `ClaudeConnectSheet`). A connected program reads as a connected app
 * does. What is connected is the app's own accounts (`store.aiModels`),
 * read again while both rows wait. The agent goes on by itself once one is
 * connected.
 */
struct ModelConnectCardView: View {
  let card: ModelConnectCard
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  /** The consent an app's Connect shows, before the provider's sign-in; Connect on it marks `confirmed`. */
  @State private var asking: ConnectConsent?
  @State private var pending: String?
  @State private var confirmed = false
  /** The provider whose code sheet is open (ChatGPT's). */
  @State private var connectingByCode: String?
  @State private var connectingClaude = false
  /** Cursor's own sheet (it is signed in on the cloud computer, on Cursor's page; 13 November 2026). */
  @State private var connectingCursor = false
  /** What the computer last said of Cursor's sign-in (its row reads the cloud computer, not AI Models); `cursorAsked` once it has answered or couldn't be asked. */
  @State private var cursorSignIn: CursorSignIn?
  @State private var cursorAsked = false

  private func isConnected(_ provider: String) -> Bool {
    ModelConnectCard.onComputer(provider) ? cursorSignIn?.connected == true : store.aiModels.connected(provider)
  }

  var body: some View {
    let model = store.aiModels
    VStack(alignment: .leading, spacing: 14) {
      ForEach(card.providers, id: \.self) { provider in
        let connected = isConnected(provider)
        // Still being read: the accounts for a plan's row, the computer for Cursor's.
        let reading = ModelConnectCard.onComputer(provider) ? !cursorAsked : !model.loaded && model.problem == nil
        ConnectAppRow(app: ModelConnectCard.program(provider), title: ModelConnectCard.title(provider, connected: connected), line: ModelConnectCard.line(provider, connected: connected), logo: ModelConnectCard.logo(provider)) {
          if connected {
            ConnectedMark()
          } else if reading {
            ProgressView().controlSize(.small).accessibilityLabel("Checking connection status")
          } else {
            Button(ModelConnectCard.connectLabel) {
              confirmed = false
              pending = provider
              asking = ConnectConsent(codingProvider: provider)
            }
            .buttonStyle(Tactile(look: CardPillStyle(tone: .main, height: 32)))
          }
        }
      }
    }
    .card()
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
    // The sign-in opens once the consent has gone, as an app's Connect does.
    .sheet(item: $asking, onDismiss: {
      guard confirmed, let provider = pending else { pending = nil; return }
      confirmed = false
      pending = nil
      if provider == ModelConnectCard.cursor { connectingCursor = true } else if provider == AIModels.claude { connectingClaude = true } else { connectingByCode = provider }
    }) { consent in
      ConnectConsentSheet(consent: consent) { confirmed = true }
    }
    .sheet(isPresented: Binding(get: { connectingByCode != nil }, set: { if !$0 { connectingByCode = nil } })) {
      NavigationStack { ChatGPTConnectSheet(model: model, provider: connectingByCode ?? AIModels.chatGPT, coding: true) }
    }
    .sheet(isPresented: $connectingClaude) {
      NavigationStack { ClaudeConnectSheet(model: model, coding: true) }
    }
    .sheet(isPresented: $connectingCursor, onDismiss: {
      // The row follows what the sheet left on the computer.
      Task { cursorSignIn = await store.cursorSignIn() }
    }) {
      NavigationStack { CursorConnectSheet() }
    }
    .task(id: card.providers) {
      // For ten minutes at most: a card left on screen with nothing connected stops asking.
      for _ in 0..<150 {
        if Task.isCancelled { return }
        await model.load()
        if card.providers.contains(ModelConnectCard.cursor) {
          cursorSignIn = await store.cursorSignIn()
          cursorAsked = true
        }
        guard let wait = ModelConnectCard.nextPoll(anyConnected: card.providers.contains(where: isConnected)) else { return }
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
      }
    }
  }
}

// MARK: - Flights

/**
 * Flight results, laid out as Muse lays out its own (the founder, 9 October
 * 2026: "i found an absolute better design from muse and i want that for
 * all flights suggestions. everything should fit"): the route and its date
 * as one heading, then a row per offer, the airline's round logo beside
 * "Delta Air Lines · $233.40" and the times on a dashed line with the time
 * in the air between them (a round trip's way back on a second line). A row
 * opens the flight. The card runs nearly the chat's width, wider than a
 * bubble, so the lines fit; a line still too long for it puts the time in
 * the air under the times instead of cutting anything. Its words are
 * FlightText's (SimeonCore, tested).
 */
struct FlightsCardView: View {
  let card: FlightsCard
  /** The card's entry and its agent: what "Book with Simeon" books from. */
  var entryId = ""
  var agentId = ""
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var open: OpenFlight?

  struct OpenFlight: Identifiable { let id: Int; let offer: FlightOffer }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !card.heading.isEmpty || !card.aside.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          if !card.heading.isEmpty {
            Text(card.heading).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.theirsText).fixedSize(horizontal: false, vertical: true)
          }
          if !card.aside.isEmpty {
            Text(card.aside).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
          }
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 4)
      }
      VStack(spacing: 0) {
        ForEach(Array(card.offers.enumerated()), id: \.offset) { index, offer in
          Button { open = OpenFlight(id: index, offer: offer) } label: { FlightRow(offer: offer) }
            .buttonStyle(Tactile(look: FlightRowStyle()))
        }
      }
      .padding(.horizontal, 6).padding(.vertical, 6)
    }
    .frame(width: Self.cardWidth(width), alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .modifier(CardEdge(radius: 22))
    .sheet(item: $open) { flight in
      FlightDetails(offer: flight.offer, test: card.isTest, book: bookAction(flight.id, flight.offer))
        .macSheetSize(width: 440, height: 600)
    }
  }

  /** "Book with Simeon" for one flight; none for a card from before booking. */
  private func bookAction(_ index: Int, _ offer: FlightOffer) -> (() async -> FlightBookingAnswer)? {
    guard !offer.offerId.isEmpty, !entryId.isEmpty else { return nil }
    let store = store, entryId = entryId, agentId = agentId
    return { await store.startFlightBooking(entryId: entryId, offerIndex: index, in: agentId) }
  }

  /** Nearly the chat's width, as Muse's card runs: a bubble's limit would leave the times no room. */
  static func cardWidth(_ width: CGFloat) -> CGFloat { min(max(width - 16, 260), 480) }
}

/** A row pressed: the grey of a pressed list row behind it. */
struct FlightRowStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(Color(.systemFill).opacity(configuration.isPressed ? 1 : 0), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

struct FlightRow: View {
  let offer: FlightOffer

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      AirlineMark(name: offer.airline, logo: offer.logo, size: 40)
      VStack(alignment: .leading, spacing: 4) {
        // The airline, and at the far right its price in Apple's lighter blue (the founder, 24 October 2026).
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(offer.airline)
            .foregroundStyle(Ink.theirsText)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
          Text(offer.price)
            .foregroundStyle(Ink.appleBlue)
            .fixedSize()
        }
        .font(.system(size: 17))
        FlightTimesLine(times: offer.outbound)
        if let back = offer.inbound { FlightTimesLine(times: back) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 10).padding(.vertical, 9)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }
}

/** "2:30pm ----- 2h40m ----- 5:10pm"; too long for the row, the time in the air goes under the times. */
struct FlightTimesLine: View {
  let times: FlightTimes

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 6) {
        Text(times.depart).fixedSize()
        FlightDashes()
        if !times.label.isEmpty {
          Text(times.label).font(.system(size: 12)).fixedSize()
          FlightDashes()
        }
        Text(times.arrive).fixedSize()
      }
      VStack(alignment: .leading, spacing: 1) {
        Text([times.depart, times.arrive].filter { !$0.isEmpty }.joined(separator: " – ")).fixedSize(horizontal: false, vertical: true)
        if !times.label.isEmpty { Text(times.label).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true) }
      }
    }
    .font(.system(size: 15))
    .foregroundStyle(Ink.fineGrey)
  }
}

/** The dashed rule between a row's times; it takes what the line leaves, at least 12 pt. */
struct FlightDashes: View {
  var body: some View {
    FlightDashLine()
      .stroke(Ink.fineGrey.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
      .frame(minWidth: 12, maxWidth: .infinity)
      .frame(height: 1)
      .accessibilityHidden(true)
  }
}

struct FlightDashLine: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
    return path
  }
}

/**
 * The airline's logo on a white disc, or its initials (`__simeonAirlineMark`).
 * The logo is sized by its own shape (`AirlineLogo.box`): a square symbol
 * fills about two thirds of the disc, a wordmark runs nearly across it.
 */
struct AirlineMark: View {
  let name: String
  let logo: String
  var size: CGFloat = 40
  @Environment(\.colorScheme) private var scheme
  @State private var image: UIImage?

  var body: some View {
    ZStack {
      // White in light; in dark the dark disc, with the logo's too-dark parts lightened (RemoteLogos.forDarkDisc).
      Circle().fill(Ink.tile)
      // The airline's own logo (an SVG from the offer, drawn by RemoteLogos), else its initials, as the Mac's card falls back.
      if let image {
        let box = AirlineLogo.box(width: Double(image.size.width), height: Double(image.size.height), diameter: Double(size))
        Image(uiImage: image).resizable().interpolation(.high).frame(width: CGFloat(box.width), height: CGFloat(box.height))
      } else {
        initials
      }
    }
    .frame(width: size, height: size)
    .overlay(Circle().strokeBorder(Ink.tileEdge, lineWidth: 0.5))
    .accessibilityHidden(true)
    .task(id: "\(logo)|\(scheme == .dark)") {
      guard let url = URL(string: logo), !logo.isEmpty else { return }
      image = await RemoteLogos.shared.image(for: url, dark: scheme == .dark)
    }
  }

  private var initials: some View {
    Text(FlightsCard.initials(name)).font(.system(size: size / 3, weight: .medium)).foregroundStyle(Ink.tileInitial)
  }
}

/**
 * One flight, opened as Muse opens one: the route over its stops and time,
 * the close button at the right; the total in green; a card per flight
 * (from and to with the airline's logo, departing and arriving, then the
 * flight, the cabin and the time in the air), the layover between two, a
 * round trip's two ways under their own titles; then the fare's terms. The
 * sheet is as tall as what it holds. At its foot "Book with Simeon" (13
 * October 2026): the traveller form goes into the chat and the sheet
 * closes; a flight from a search before booking has none.
 */
struct FlightDetails: View {
  let offer: FlightOffer
  var test = false
  /** "Book with Simeon": the traveller form in the chat, or why not. */
  var book: (() async -> FlightBookingAnswer)? = nil
  @Environment(\.dismiss) private var dismiss
  @State private var headHeight: CGFloat = 80
  @State private var bodyHeight: CGFloat = 440
  @State private var footHeight: CGFloat = 0
  @State private var booking = false
  @State private var refused: String?

  var body: some View {
    let from = offer.from.isEmpty ? (offer.legs.first?.from ?? "") : offer.from
    let to = offer.to.isEmpty ? (offer.legs.last?.to ?? "") : offer.to
    VStack(spacing: 0) {
      ZStack {
        VStack(spacing: 2) {
          Text([from, to].filter { !$0.isEmpty }.joined(separator: " to "))
            .font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
            .accessibilityAddTraits(.isHeader)
          if !offer.shape.isEmpty { Text(offer.shape).font(.system(size: 15)).foregroundStyle(Ink.secondary) }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 52)
        HStack {
          Spacer(minLength: 0)
          CloseDisc { dismiss() }
        }
      }
      .padding(.horizontal, 16).padding(.top, 20).padding(.bottom, 8)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headHeight = $0 }
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if !offer.price.isEmpty { total }
          ForEach(Array(offer.ways.enumerated()), id: \.offset) { _, way in
            VStack(alignment: .leading, spacing: 10) {
              if !way.title.isEmpty {
                Text(way.title).font(.system(size: 13)).foregroundStyle(Ink.secondary).padding(.horizontal, 4)
              }
              ForEach(Array(way.legs.enumerated()), id: \.offset) { index, leg in
                FlightLegCard(leg: leg, logo: leg.logo.isEmpty ? offer.logo : leg.logo)
                if index < way.legs.count - 1, !leg.layoverLine.isEmpty {
                  Label(leg.layoverLine, systemImage: "clock")
                    .font(.system(size: 15)).foregroundStyle(Ink.secondary)
                    .padding(.horizontal, 6)
                }
              }
            }
          }
          if !offer.terms.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
              ForEach(offer.terms, id: \.self) { line in Text(line).fixedSize(horizontal: false, vertical: true) }
            }
            .font(.system(size: 15)).foregroundStyle(Ink.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
          }
        }
        .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 24)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bodyHeight = $0 }
      }
      .scrollBounceBehavior(.basedOnSize)
      if let book {
        VStack(alignment: .leading, spacing: 8) {
          if let refused {
            Text(refused).font(.system(size: 13)).foregroundStyle(Ink.danger).fixedSize(horizontal: false, vertical: true)
          }
          Button {
            Haptics.press()
            booking = true
            refused = nil
            Task {
              let answer = await book()
              booking = false
              if answer.ok { dismiss() } else { refused = answer.message }
            }
          } label: {
            if booking { ProgressView().tint(.white) } else { Text("Book with Simeon") }
          }
          .buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
          .disabled(booking)
          .accessibilityHint("Shows the traveller form in the chat")
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 16)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { footHeight = $0 }
      }
    }
    .background(Ink.ground)
    .presentationDetents([.height(headHeight + bodyHeight + footHeight)])
    .presentationDragIndicator(.visible)
  }

  /** "Total Price" and the price in green, what it covers under it. */
  private var total: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Text("Total Price").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        Text(offer.price).font(.system(size: 20, weight: .semibold)).foregroundStyle(Ink.fare)
      }
      ForEach([offer.priceNote, test ? String(localized: "Test results, not real fares") : ""].filter { !$0.isEmpty }, id: \.self) { line in
        Text(line).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.horizontal, 4)
  }
}

/** One flight in the sheet: from and to with the airline's logo, departing and arriving, then the flight, the cabin and the time in the air. */
struct FlightLegCard: View {
  let leg: FlightLeg
  let logo: String

  var body: some View {
    let details = (leg.flightLines + [leg.cabin, leg.duration.isEmpty ? "" : String(localized: "\(leg.duration) in the air")]).filter { !$0.isEmpty }
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: 12) {
        Text([leg.from, leg.to].filter { !$0.isEmpty }.joined(separator: " to "))
          .font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        AirlineMark(name: leg.carrier, logo: logo, size: 30)
      }
      VStack(alignment: .leading, spacing: 10) {
        moment("arrow.up.right", String(localized: "Departing"), leg.departing)
        moment("arrow.down.left", String(localized: "Arriving"), leg.arriving)
      }
      .padding(.top, 12)
      if !details.isEmpty {
        Rectangle().fill(Ink.hairline).frame(height: 0.5).padding(.vertical, 14)
        VStack(alignment: .leading, spacing: 3) {
          ForEach(details, id: \.self) { line in Text(line).fixedSize(horizontal: false, vertical: true) }
        }
        .font(.system(size: 15)).foregroundStyle(Ink.secondary)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  @ViewBuilder
  private func moment(_ symbol: String, _ label: String, _ value: String) -> some View {
    if !value.isEmpty {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Image(systemName: symbol).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.secondary).frame(width: 18)
        Text(label).font(.system(size: 17)).foregroundStyle(Ink.primary).frame(width: 86, alignment: .leading)
        Text(value).font(.system(size: 17)).foregroundStyle(Ink.primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .fixedSize(horizontal: false, vertical: true)
      }
      .accessibilityElement(children: .combine)
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
  @State private var cc = ""
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
        Text(isEmail ? (card.isReply ? "Reply" : "New email") : "Slack message").font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
        Spacer(minLength: 0)
        StatusPill(text: card.status, dot: card.state == "sent" ? Ink.live : card.state == "sending" ? Ink.blue : Ink.tertiary, size: 12)
      }
      if card.state == "sent" {
        Text(isEmail ? "Sent to \(card.to.joined(separator: ", ")) — “\(card.subject)”" : "Sent to \(card.target)")
          .font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      } else {
        VStack(spacing: 0) {
          if isEmail {
            if !card.from.isEmpty { field(String(localized: "From")) { Text(card.from).font(.system(size: 17)).foregroundStyle(Ink.secondary).lineLimit(1) }; line }
            field(String(localized: "To"), focus: { focused = 0 }) { TextField("name@company.com", text: $to).font(.system(size: 17)).emailField().autocorrectionDisabled().disabled(!editable).focused($focused, equals: 0) }
            line
            // Cc, always there to add to (28 October 2026: a reply's Cc was on the card and nobody could see it).
            field(String(localized: "Cc"), focus: { focused = 3 }) { TextField(text: $cc) { EmptyView() }.font(.system(size: 17)).emailField().autocorrectionDisabled().disabled(!editable).focused($focused, equals: 3) }
            line
            field(String(localized: "Subject"), focus: { focused = 1 }) { TextField("Subject", text: $subject).font(.system(size: 17)).disabled(!editable).focused($focused, equals: 1) }
          } else {
            if !card.workspace.isEmpty { field(String(localized: "Workspace")) { Text(card.workspace).font(.system(size: 17)).foregroundStyle(Ink.secondary) }; line }
            field(String(localized: "To")) { Text(card.target).font(.system(size: 17)).foregroundStyle(Ink.secondary) }
            line
            field(String(localized: "Thread")) { Text(card.thread.isEmpty ? String(localized: "New message") : card.thread).font(.system(size: 17)).foregroundStyle(Ink.secondary) }
          }
          line
          TextField("Message", text: $bodyText, axis: .vertical)
            .font(.system(size: 17))
            .lineSpacing(MessageType.spacing(size: 17, lineHeight: 25))
            .lineLimit(expanded || !editable ? 3...40 : 3...10)
            .disabled(!editable)
            .focused($focused, equals: 2)
            .padding(10)
            .background { Color.clear.contentShape(.rect).onTapGesture { if editable { focused = 2 } } }
          if bodyText.count > 500 && !expanded {
            Button("Show more") { expanded = true }.font(.system(size: 13)).foregroundStyle(Ink.link).padding(.horizontal, 10).padding(.bottom, 8)
          }
          // The files that go with it, by name.
          ForEach(Array(card.attachmentNames.enumerated()), id: \.offset) { _, name in
            line
            HStack(spacing: 8) {
              Image(systemName: "paperclip").font(.system(size: 14)).foregroundStyle(Ink.tertiary)
              Text(verbatim: name).font(.system(size: 15)).foregroundStyle(Ink.secondary).lineLimit(1).truncationMode(.middle)
              Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 9)
          }
        }
        // Rounded as every writing box (10 November 2026).
        .background(Ink.field, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        if editable {
          // The cards' pills (10 November 2026): Discard grey, Send the main one, last.
          CardPills {
            if busy { ProgressView().controlSize(.small) }
            Button("Discard") {
              busy = true
              Task { await store.discardDraft(entryId, in: agentId); busy = false }
            }
            .buttonStyle(Tactile(look: CardPillStyle()))
            Button(isEmail ? "Send email" : "Send message") { send() }
              .buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
              .disabled(isEmail && !validAddresses)
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
      to = card.to.joined(separator: ", "); cc = card.cc.joined(separator: ", "); subject = card.subject; bodyText = card.body
    }
  }

  private var validAddresses: Bool {
    let list = addresses(to)
    return !list.isEmpty && (list + addresses(cc)).allSatisfy { $0.contains("@") && $0.contains(".") && !$0.contains(" ") }
  }

  private func addresses(_ text: String) -> [String] {
    text.split(whereSeparator: { $0 == "," || $0 == ";" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
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
      ? ["to": JSON(addresses(to)), "cc": JSON(addresses(cc)), "subject": .string(subject), "body": .string(bodyText)]
      : ["body": .string(bodyText)]
    busy = true
    Task { await store.sendDraft(entryId, in: agentId, draft: draft); busy = false }
  }
}

// MARK: - Files

enum FileKind {
  static let images: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"]

  /** The Mac's own artwork for Word, Excel, PowerPoint and PDF (`desktop/brand/file-icons`), and the founder's for Markdown (29 October 2026); else a symbol on a tile. */
  static func artwork(_ name: String) -> String? {
    switch (name as NSString).pathExtension.lowercased() {
    case "doc", "docx", "rtf", "pages": return "FileIcons/word"
    case "xls", "xlsx", "csv", "numbers": return "FileIcons/excel"
    case "ppt", "pptx", "key": return "FileIcons/powerpoint"
    case "pdf": return "FileIcons/pdf"
    case "md", "markdown", "mdx": return "FileIcons/markdown"
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

/**
 * The chat's pictures, decoded at the size they are shown, by every address
 * a file has (`AppStore.sentFile`): kept while the app runs, so a row drawn
 * again, scrolled back or opened again shows its picture at once instead of
 * reading it from the computer again.
 */
enum ChatImages {
  private static let cache: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.totalCostLimit = 120 << 20
    return cache
  }()

  static func image(for keys: [String]) -> UIImage? {
    for key in keys { if let image = cache.object(forKey: key as NSString) { return image } }
    return nil
  }

  static func keep(_ image: UIImage, under keys: [String]) {
    let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
    for key in keys where !key.isEmpty { cache.setObject(image, forKey: key as NSString, cost: cost) }
  }
}

/**
 * A file an agent made or the person sent (`attachment`, `user-attachment`):
 * the kind's artwork, the name, save; a tap opens it. Images show inline:
 * one the person sent from this phone at once, from the phone's own copy;
 * any other in an empty frame of its place while it comes from the
 * computer, never as a file card first (the founder, 9 October 2026: "for 1
 * second, we see the pic … as an attachment, then the pic come").
 */
struct FileCardView: View {
  /** The line it is in: a card has the message's actions. */
  var entryId: String = ""
  let name: String
  let url: String
  let agentId: String
  let fromPerson: Bool
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var image: UIImage?
  @State private var preview: PreviewFile?
  /** A Markdown file, opened as a page (Quick Look shows it as raw text). */
  @State private var document: MarkdownDocument?
  @State private var loading = false

  /** The picture could not be read: the file card, so it can still be opened. */
  @State private var unreadable = false
  /** The line under its name: the size, or "Couldn't read file" (`readAttachmentText`). */
  @State private var line = ""

  private var isImage: Bool { FileKind.images.contains((name as NSString).pathExtension.lowercased()) }

  /** Every address this file is shown under (a sent file's waiting line and the computer's path). */
  private var keys: [String] { store.sentFile(url)?.keys ?? [url] }

  var body: some View {
    let shown = image ?? (isImage ? ChatImages.image(for: keys) : nil)
    Group {
      if isImage, let shown {
        Image(uiImage: shown).resizable().scaledToFit()
          .frame(maxWidth: min(ChatMetrics.bubbleMax(width), 280), maxHeight: 360)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .onTapGesture { open() }
          #if os(macOS)
          // Electron's picture menu (`avatar-images.ts`), then the message's; its Copy copies the picture.
          .contextMenu {
            ImageMenuItems(image: shown, bytes: { await store.readFile(url, agentId: agentId) })
            Divider()
            MessageContextMenu(bubble: asMessage, agentId: agentId, copy: { MacFiles.copy(shown) })
          }
          #endif
      } else if isImage && !unreadable {
        // Its place while it comes: the picture's frame, empty.
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(Ink.bubbleTheirs)
          .frame(width: min(ChatMetrics.bubbleMax(width), 220), height: 165)
      } else {
        card
      }
    }
    .frame(maxWidth: .infinity, alignment: fromPerson ? .trailing : .leading)
    // Decoded at the size it is shown, off the main thread: a full-size photo decoded on it froze scrolling.
    .task(id: url) {
      guard isImage else { return }
      let keys = keys
      if let kept = ChatImages.image(for: keys), max(kept.size.width, kept.size.height) <= 900 {
        image = kept
        return
      }
      // The phone's own copy of a picture sent from here (`readFile` answers from it), else the computer's.
      // A computer that rests is waited for, not woken (step 4).
      guard let data = await store.readFile(url, agentId: agentId, limit: 12 << 20, wakes: false), let full = UIImage(data: data) else {
        if ChatImages.image(for: keys) == nil { unreadable = true }
        return
      }
      // Its own shape, at most 900 pt on its long side (the thumbnail is drawn at exactly the size asked).
      let scale = min(1, 900 / max(full.size.width, full.size.height, 1))
      let thumbnail = await full.byPreparingThumbnail(ofSize: CGSize(width: full.size.width * scale, height: full.size.height * scale)) ?? full
      ChatImages.keep(thumbnail, under: keys)
      image = thumbnail
    }
    #if os(iOS)
    .sheet(item: $preview) { file in QuickLookSheet(file: file).ignoresSafeArea() }
    #else
    // The Mac's Quick Look panel, as Finder opens it.
    .quickLookPreview(Binding(get: { preview?.url }, set: { preview = $0.map(PreviewFile.init(url:)) }))
    #endif
    .sheet(item: $document) { document in MarkdownFileSheet(document: document) }
  }

  private var card: some View {
    HStack(spacing: 8) {
      Group {
        if let art = FileKind.artwork(name), let artwork = UIImage(named: art) {
          Image(uiImage: artwork).resizable().scaledToFit()
        } else {
          Image(systemName: FileKind.symbol(name)).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.blue)
            .frame(width: 36, height: 36).background(Ink.field, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
      }
      .frame(width: 36, height: 36)
      VStack(alignment: .leading, spacing: 1) {
        // Its name as a title ("Dakar trip budget"): the icon says the kind; saving keeps the real name.
        Text(fileTitle(name)).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary)
          .lineLimit(1).truncationMode(.tail)
        // Hidden while empty (patch 1670).
        if !line.isEmpty { Text(line).font(.system(size: 12)).foregroundStyle(Ink.secondary).lineLimit(1) }
      }
      Spacer(minLength: 4)
      Group {
        if loading {
          ProgressView().controlSize(.small)
        } else {
          #if os(macOS)
          // The window's save button, on an agent's file only (yours has none): the file from the computer into a folder of
          // this Mac. An icon with no tooltip, "Save <name>" to VoiceOver.
          if !fromPerson {
            Button { save() } label: { Image(systemName: "arrow.down.circle").font(.system(size: 15)).foregroundStyle(Ink.secondary) }
              .buttonStyle(.tactile)
              .accessibilityLabel("Save \(name)")
          }
          #else
          Image(systemName: "icloud.and.arrow.down").font(.system(size: 14)).foregroundStyle(Ink.secondary)
          #endif
        }
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
    #if os(macOS)
    .contextMenu { MessageContextMenu(bubble: asMessage, agentId: agentId) }
    #endif
    // Read for every file card, as the window reads it (`skn`); a computer that rests is waited for, not woken (step 4).
    .task(id: url) { line = await store.fileLine(url, wakes: false) }
  }

  /** This line as the message menu takes it. */
  private var asMessage: Bubble {
    Bubble(id: entryId, text: "", fromPerson: fromPerson, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: false)
  }

  #if os(macOS)
  /** Save…: the Mac's save panel, then the file streamed from the computer ("Couldn't save this file" when it can't be). */
  private func save() {
    guard !loading else { return }
    loading = true
    Task {
      defer { loading = false }
      guard let data = await store.readFile(url, agentId: agentId) else {
        store.problem = String(localized: "Couldn't save this file: the computer didn't hand it over.")
        return
      }
      if !(await MacFiles.save(data, suggestedName: name)) { store.problem = String(localized: "Couldn't save this file.") }
    }
  }
  #endif

  private func open() {
    guard !loading else { return }
    loading = true
    Task {
      defer { loading = false }
      guard let data = await store.readFile(url, agentId: agentId) else {
        store.problem = String(localized: "Couldn't open \(name): the computer didn't hand it over.")
        return
      }
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("simeon-files", isDirectory: true).appendingPathComponent(name)
      // Written off the main thread: a file can be tens of megabytes.
      let written = await Task.detached(priority: .userInitiated) { () -> Bool in
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        return (try? data.write(to: file, options: .atomic)) != nil
      }.value
      guard written else {
        store.problem = String(localized: "Couldn't open \(name).")
        return
      }
      // Markdown as a page: Quick Look shows it as raw text.
      if FilePreview.kind(name) == .markdown {
        document = MarkdownDocument(title: fileTitle(name), text: String(decoding: data, as: UTF8.self), file: file)
      } else {
        preview = PreviewFile(url: file)
      }
    }
  }
}

struct PreviewFile: Identifiable { let url: URL; var id: URL { url } }

/** A Markdown file to show as a page: its title, its words, and its copy on the phone (what Share sends). */
struct MarkdownDocument: Identifiable {
  let title: String
  let text: String
  let file: URL
  var id: URL { file }
}

/**
 * A Markdown file, opened (the founder, 24 October 2026: on the iPhone it was
 * "just a list of raw text", where the Mac draws it): its title over the
 * page, Share at the left and Close at the right in the sheet's glass discs,
 * then the document drawn as the chat draws an agent's message (headings,
 * lists, quotes, code, tables), its words selectable.
 */
struct MarkdownFileSheet: View {
  let document: MarkdownDocument
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text(document.title)
          .font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
          .lineLimit(1)
          .padding(.horizontal, 56)
          .accessibilityAddTraits(.isHeader)
        HStack {
          ShareLink(item: document.file) {
            Image(systemName: "square.and.arrow.up").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
              .frame(width: 40, height: 40)
          }
          .buttonStyle(GlassDisc())
          .accessibilityLabel("Share")
          Spacer(minLength: 0)
          CloseDisc { dismiss() }
        }
      }
      .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 8)
      ScrollView {
        MarkdownView(blocks: Markdown.blocks(document.text), mentioning: nil)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 32)
      }
    }
    .presentationDragIndicator(.visible)
  }
}

#if os(iOS)
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
#endif

// MARK: - Requests: approvals, secrets, the computer

/**
 * "Show the command" or "Show the details" (`RAn`): folded at first, open it
 * is the text cut at 340 characters with a copy button for all of it. Open
 * or not is kept apart while the card waits and once answered, so an
 * answered card folds again.
 */
struct ApprovalDisclosure: View {
  let subject: AutoReviewCard.Subject
  let text: String
  let pending: Bool
  @State private var openWaiting = false
  @State private var openAnswered = false

  var body: some View {
    let open = pending ? openWaiting : openAnswered
    VStack(alignment: .leading, spacing: 6) {
      Button {
        if pending { openWaiting.toggle() } else { openAnswered.toggle() }
      } label: {
        HStack(spacing: 4) {
          Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 10, weight: .semibold)).frame(width: 14, height: 14)
          Text(open ? (subject == .command ? "Hide the command" : "Hide the details") : (subject == .command ? "Show the command" : "Show the details")).font(.system(size: 13))
        }
        .foregroundStyle(Ink.secondary)
        .contentShape(.rect)
      }
      .buttonStyle(.tactile)
      if open {
        ApprovalCode(shown: AutoReviewCard.clip(text), full: text)
      }
    }
  }
}

/** The folded text open: monospaced, scrolling sideways, Copy taking the whole of it ("Copy code", then "Copied"). */
struct ApprovalCode: View {
  let shown: String
  let full: String
  @State private var copied = false

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Text(shown).font(.system(size: 13, design: .monospaced)).foregroundStyle(Ink.secondary).lineSpacing(4)
        .fixedSize(horizontal: true, vertical: true)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .textSelection(.enabled)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.field, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay(alignment: .topTrailing) {
      Button {
        UIPasteboard.general.string = full
        copied = true
        Task { @MainActor in
          try? await Task.sleep(nanoseconds: 2_000_000_000)
          copied = false
        }
      } label: {
        Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 11, weight: .medium)).foregroundStyle(Ink.secondary)
          .frame(width: 24, height: 24).tapRoom(10)
      }
      .buttonStyle(.tactile)
      .padding(4)
      .accessibilityLabel(copied ? "Copied" : "Copy code")
      #if os(macOS)
      .help(copied ? "Copied" : "Copy code")
      #endif
    }
  }
}

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
      case .approval(let requestId, let summary, let reason, let command, let status, let surface, let proposedRule):
        approval(requestId: requestId, summary: summary, reason: reason, command: command, status: status, surface: surface, proposedRule: proposedRule)
      case .secret(let label, let description, let variable, let provided, let dismissed):
        secretCard(label: label, description: description, variable: variable, provided: provided, dismissed: dismissed)
      case .computer(let requestId, let instruction, let resolution):
        computer(requestId: requestId, instruction: instruction, resolution: resolution)
      case .form(let form):
        UserFormCardView(entryId: entryId, agentId: agentId, card: form)
      case .credential(let credential):
        CredentialCardView(entryId: entryId, agentId: agentId, card: credential)
      case .onePasswordConnect(let connect):
        OnePasswordConnectCardView(entryId: entryId, agentId: agentId, card: connect)
      case .storeEntry(let entry):
        StoreEntryCardView(entryId: entryId, agentId: agentId, card: entry)
      }
    }
    .frame(maxWidth: ChatMetrics.bubbleMax(width), alignment: .leading)
  }

  /**
   * The auto-review card as the window draws it (the chunk's `me`): the
   * title by what the agent wants to do, the badge (waiting, or how it was
   * answered), where it runs, the summary when it says more than the
   * command, the reason while it waits, the note under Always allowed, the
   * command or details folded with Copy, and Allow once, Always allow, Deny.
   * An answer shows at once; a failed one comes back without a word.
   */
  private func approval(requestId: String, summary: String, reason: String, command: String?, status: String, surface: String?, proposedRule: String?) -> some View {
    let shown = status == "pending" ? (store.answeredApprovals[entryId] ?? status) : status
    let pending = shown == "pending"
    let heading = AutoReviewCard.title(surface: surface)
    return VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(heading.title).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
          approvalBadge(shown)
        }
        if let location = AutoReviewCard.location(surface: surface) {
          Text(location).font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.secondary)
        }
        if let line = AutoReviewCard.summaryLine(summary: summary, command: command) {
          Text(line).font(.system(size: 14)).foregroundStyle(Ink.primary).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
        }
        if pending, !reason.isEmpty {
          Text(reason).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        }
        if let note = AutoReviewCard.settledNote(status: shown, rule: AutoReviewCard.rule(proposed: proposedRule)) {
          Text(note).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        }
        ApprovalDisclosure(subject: heading.subject, text: command ?? summary, pending: pending)
      }
      if pending {
        // Deny in red words, Always allow grey, Allow once the main one, last (10 November 2026).
        CardPills {
          Button("Deny") { resolve(requestId, "denied", rule: proposedRule) }.buttonStyle(Tactile(look: CardPillStyle(tone: .danger)))
          Button("Always allow") { resolve(requestId, "always", rule: proposedRule) }.buttonStyle(Tactile(look: CardPillStyle()))
          Button("Allow once") { resolve(requestId, "approved", rule: proposedRule) }.buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
        }
        .disabled(busy)
      }
    }
    .card()
  }

  /** Waiting: the turning wheel and "Approval needed", in blue; answered: a dot and how. */
  @ViewBuilder private func approvalBadge(_ status: String) -> some View {
    if let badge = AutoReviewCard.badge(status: status) {
      StatusPill(text: badge.label, dot: badge.kind == .success ? Ink.live : badge.kind == .danger ? Ink.danger : Ink.tertiary, size: 13)
    } else {
      HStack(spacing: 4) {
        ProgressView().controlSize(.mini).tint(Ink.blue)
        Text("Approval needed").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.blue).lineLimit(1)
      }
      .padding(.leading, 4).padding(.trailing, 8).padding(.vertical, 2)
      .background(Ink.blue.opacity(0.12), in: Capsule())
    }
  }

  private func resolve(_ requestId: String, _ resolution: String, rule: String?) {
    run { await store.resolveApproval(requestId, resolution: resolution, proposedRule: rule, entryId: entryId, in: agentId) }
  }

  private func run(_ work: @escaping () async -> Void) {
    guard !busy else { return }
    busy = true
    Task { await work(); busy = false }
  }

  /**
   * A secret the agent asks for, as the founder's reference draws it (10
   * November 2026): "Secrets" at the top with a key; the secret's name and
   * why; the variable it is kept under over its field when the agent named
   * one ("AWS_ACCESS_KEY_ID"); the field, rounded; then a shield and
   * "Stored securely, never shown to your agent." with Not now and Save
   * securely at the right.
   */
  private func secretCard(label: String, description: String, variable: String?, provided: Bool, dismissed: Bool) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      CardKindHead(symbol: "key.horizontal", name: String(localized: "Secrets")) {
        if provided { StatusPill(text: String(localized: "Saved"), dot: Ink.live, size: 12) }
        else if dismissed { StatusPill(text: String(localized: "Dismissed")) }
      }
      VStack(alignment: .leading, spacing: 3) {
        Text(label).font(.system(size: 18, weight: .semibold)).foregroundStyle(dismissed ? Ink.secondary : Ink.primary)
          .fixedSize(horizontal: false, vertical: true)
        let line = provided ? String(localized: "Saved securely and kept private.") : dismissed ? "" : description
        if !line.isEmpty { Text(line).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true) }
      }
      if !provided && !dismissed {
        VStack(alignment: .leading, spacing: 6) {
          if let variable {
            Text(verbatim: variable).font(.system(size: 13)).tracking(0.2).foregroundStyle(Ink.secondary).textSelection(.enabled)
          }
          SecureField("Paste your \(label)", text: $secret)
            .typedAsIs().autocorrectionDisabled()
            .cardField()
        }
        CardPills {
          CardShieldLine(words: String(localized: "Stored securely, never shown to your agent."))
        } content: {
          // Not giving it is an answer too: the agent is told it was declined (Not now replaced the X, 10 November 2026).
          Button("Not now") { run { await store.dismissQuestion(entryId, in: agentId) } }
            .buttonStyle(Tactile(look: CardPillStyle()))
          Button("Save securely") {
            let value = secret
            secret = ""
            run { await store.submitSecret(value, entryId: entryId, in: agentId) }
          }
          .buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
          .disabled(secret.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .disabled(busy)
      }
    }
    .card()
  }

  /**
   * The agent hands the person its computer, as the founder's reference
   * draws it (10 November 2026): "Computer" at the top with a laptop;
   * "Action needed" over the agent's instruction in grey; while it waits,
   * the screen as it was when the agent asked, across the whole card; then
   * Skip, I'm done and Take over (our blue). Settled: what happened in a
   * pill at the top, the instruction, and Open computer. It waits while the
   * computer says this request is pending (`Obn`); before its status is
   * read, while the line has no answer yet.
   */
  private func computer(requestId: String, instruction: String, resolution: String?) -> some View {
    let pending = store.computer.status(agentId)?.handoff
    let known = store.computer.readState(agentId) == .known
    let waiting = known ? pending?.requestId == requestId : resolution == nil
    let shownInstruction = (waiting ? (pending?.instruction ?? instruction) : instruction).trimmingCharacters(in: .whitespacesAndNewlines)
    let ending = HandoffOutcome(resolution: resolution)
    let snapshot = waiting ? pending?.snapshotDataUrl.flatMap(Self.picture) : nil
    return VStack(alignment: .leading, spacing: 14) {
      CardKindHead(symbol: "laptopcomputer", name: String(localized: "Computer")) {
        if !waiting {
          // Settled: what happened in a pill, as the email card has its state (16 October 2026):
          // Done and Answered in green, Skipped in blue, Canceled in red.
          let tint = Self.tint(ending)
          StatusPill(text: ending.label, dot: tint, ink: tint, wash: tint.opacity(0.12)).fixedSize()
        }
      }
      if waiting || !shownInstruction.isEmpty {
        VStack(alignment: .leading, spacing: 3) {
          if waiting { Text("Action needed").font(.system(size: 20, weight: .semibold)).foregroundStyle(Ink.primary) }
          if !shownInstruction.isEmpty {
            Text(shownInstruction).font(.system(size: 17)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      if let snapshot {
        // The screen when the agent asked, across the whole card; a tap takes over.
        Button(action: openComputer) {
          Image(uiImage: snapshot).resizable().aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fill)
            .frame(maxWidth: .infinity)
            .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
            .clipped()
            .overlay(alignment: .top) { Rectangle().fill(Ink.hairline).frame(height: 0.5) }
            .overlay(alignment: .bottom) { Rectangle().fill(Ink.hairline).frame(height: 0.5) }
        }
        .buttonStyle(.tactile)
        .padding(.horizontal, -16)
        .accessibilityLabel("Take over the computer")
      }
      CardPills {
        if waiting {
          Button("Skip") { run { await store.handBackComputer(agentId, skip: true) } }
            .buttonStyle(Tactile(look: CardPillStyle()))
            .disabled(busy)
            .help("Cancel this request without doing the step; the agent continues without it")
          Button("I’m done") { run { await store.handBackComputer(agentId) } }
            .buttonStyle(Tactile(look: CardPillStyle()))
            .disabled(busy)
          Button("Take over", action: openComputer)
            .buttonStyle(Tactile(look: CardPillStyle(tone: .main)))
        } else {
          Button("Open computer", action: openComputer).buttonStyle(Tactile(look: CardPillStyle()))
        }
      }
    }
    .card()
  }

  /** What happened, in its colour: Done and Answered green, Skipped blue, Canceled red. */
  static func tint(_ ending: HandoffOutcome) -> Color {
    switch ending {
    case .done, .answered: return Ink.success
    case .skipped: return Ink.link
    case .canceled: return Ink.danger
    }
  }

  /** The screen the agent saw when it asked (`data:image/webp;base64,…`), decoded once. */
  static func picture(_ dataURL: String) -> UIImage? {
    let key = NSString(string: String(dataURL.suffix(64)) + "\(dataURL.count)")
    if let kept = snapshots.object(forKey: key) { return kept }
    guard let comma = dataURL.firstIndex(of: ","), let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
          let image = UIImage(data: data) else { return nil }
    snapshots.setObject(image, forKey: key)
    return image
  }

  private static let snapshots = NSCache<NSString, UIImage>()
}

/** The 36 pt pills across a sheet or the checkout card: the blue one (money: Allow, Book with Simeon), and the grey beside it. */
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
      .onAppear { if !on { on = true } }
  }
}

// MARK: - The lines in the middle: exchanges, calls, routines, notices

/**
 * The small grey type of a line in the middle of the chat (`.sand-system-event`,
 * 12 / 16), in a band at least 24 high, its words in the middle of it: the
 * height a routine's chip gives its line, so every line in the middle has the
 * same room above and below (11 November 2026, the founder: "there has to be
 * space between changed from x model to x and the top chat bubble and bottom.
 * enabled routine does have that"), as the Mac's and the web's do.
 */
struct EventLine<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    HStack(spacing: 2) { content }
      .font(.system(size: 12))
      .foregroundStyle(Ink.secondary)
      .lineLimit(1)
      // A routine's chip: 16, and 4 above and below.
      .frame(maxWidth: .infinity, minHeight: 24)
  }
}

/** A small stack of agents' pictures, 16 pt, each over the last (the event chip's avatar stack). */
struct PeerStack: View {
  let peers: [Party]
  var size: CGFloat = 16
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: -size * 0.375) {
      ForEach(Array(peers.prefix(3).enumerated()), id: \.offset) { _, peer in
        PartyAvatar(party: peer, size: size)
      }
    }
  }
}

/**
 * "Messaged 🦋🦋🦋 3 agents", "Message from Iris", "4 messages with 🦋 Sid":
 * each agent it names has a page of its own with this one (the founder, 9
 * October 2026: "when an agent message many at the same time, its not all
 * in one chat. its each by each"). One agent: the line opens its page. More:
 * a menu of them, by name, and the one picked opens. A cloud agent's report
 * is a "Message from" line too (13 November 2026), under its own name with
 * Claude Code's or Codex's mascot for its picture, and it opens the cloud
 * agent's conversation.
 */
struct TeammatesLine: View {
  let exchange: Exchange
  let entries: [Entry]
  let agentId: String
  @Environment(ChatActions.self) private var actions: ChatActions?
  /** Where no chat can push the page (a chat's preview): a sheet. */
  @State private var shown: ExchangeRoute?

  var body: some View {
    let peers = Chat.menuOrder(exchange.peers)
    EventLine {
      Text(exchange.label)
      if peers.count > 1 {
        Menu {
          ForEach(peers, id: \.id) { peer in Button(peer.shownName) { open(peer) } }
        } label: {
          chip
        }
      } else {
        Button { if let peer = peers.first { open(peer) } } label: { chip }
          .buttonStyle(.tactile)
      }
    }
    .sheet(item: $shown) { route in
      NavigationStack {
        ExchangePage(route: route, fallback: entries)
          #if os(macOS)
          .toolbar { ToolbarItem(placement: .cancellationAction) { CloseButton() } }
          #endif
      }
      .macSheetSize(width: 520, height: 640)
    }
  }

  private var chip: some View {
    HStack(spacing: 4) {
      PeerStack(peers: exchange.peers)
      Text(exchange.peers.count == 1 ? exchange.peers[0].shownName : String(localized: "\(exchange.peers.count) agents"))
    }
    .padding(.vertical, 4).padding(.leading, 4).padding(.trailing, 6)
    .tapRoom(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
  }

  private func open(_ peer: Party) {
    let route = ExchangeRoute(agentId: agentId, peer: peer)
    if let actions { actions.openExchange(route) } else { shown = route }
  }
}

/** The page of one agent's messages with another, pushed from its chat. */
struct ExchangeRoute: Hashable, Identifiable {
  let agentId: String
  let peer: Party
  var id: String { "\(agentId)|\(peer.id)" }
}

/**
 * Two agents' messages to each other, read-only, as the reference draws the page (the
 * founder's screenshot, 9 October 2026), with the two of them at the top
 * centre as our chat has its agent ("leave us on center top"): the time over
 * each stretch, the sender's name over their run of grey bubbles, their
 * picture beside its last, the page held to its newest line, and
 * "Read-only" at the foot. Its lines are everything the two said to each
 * other in this agent's chat (`Chat.exchangeRows`, tested), newest at the
 * bottom.
 *
 * A cloud agent's conversation is the same page (13 November 2026; the
 * founder: the agent "talks to the cloud agent the same way it talks to
 * another agent"): opened from its card (Open) or its "Message from" line,
 * its lines are what the agent asked it, what it said along the way and its
 * answers (`Chat.cloudAgentRows`, tested), read from the computer and again
 * every five seconds while it works, as its card asks.
 */
struct ExchangePage: View {
  let route: ExchangeRoute
  /** The line's own messages, for a chat whose lines the app doesn't hold (a preview). */
  var fallback: [Entry] = []
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @State private var width: CGFloat = 361
  /** A cloud agent's conversation, as last read from the computer. */
  @State private var cloudLines: [CloudAgentLine] = []

  var body: some View {
    // Read so the page follows the chat as it grows; the lines themselves are the chat's kept entries.
    let _ = store.rows(for: route.agentId)
    let me = Party(id: route.agentId, name: store.agent(route.agentId)?.name ?? "")
    let rows = route.peer.cloudAgent
      ? Chat.cloudAgentRows(cloudLines, agent: me, cloudAgent: route.peer)
      : Chat.exchangeRows(store.transcripts[route.agentId] ?? fallback, agent: me, peerId: route.peer.id)
    let mentioning = Mentioning(names: store.mentionNames, personName: store.account?.name, dark: scheme == .dark)
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        ForEach(rows) { row in
          switch row {
          case .stamp(_, let date):
            Text(Chat.stampText(date)).font(.system(size: 12)).foregroundStyle(Ink.secondary)
              .frame(maxWidth: .infinity)
              .padding(.top, 18).padding(.bottom, 4)
          case .message(_, let sender, let text, let first, let last):
            HStack(alignment: .bottom, spacing: 8) {
              ZStack {
                if last { PartyAvatar(party: sender, size: 28) }
              }
              .frame(width: 28)
              VStack(alignment: .leading, spacing: 3) {
                if first {
                  Text(sender.shownName).font(.system(size: 13)).foregroundStyle(Ink.secondary).padding(.leading, 12)
                }
                // Cut as the chat's bubbles are: a message of megabytes laid out whole holds the screen still.
                MarkdownView(blocks: Markdown.cachedBlocks(Chat.clipped(text, limit: 20_000).text), mentioning: mentioning.spoken(by: sender.id))
                  .foregroundStyle(Ink.theirsText)
                  .padding(.horizontal, 12).padding(.vertical, 8)
                  .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                  .frame(maxWidth: ChatMetrics.bubbleMax(width - 36), alignment: .leading)
              }
              Spacer(minLength: 0)
            }
            .padding(.top, first ? 10 : 3)
          }
        }
      }
      .padding(.horizontal, 16).padding(.bottom, 16)
    }
    .defaultScrollAnchor(.bottom)
    .onGeometryChange(for: CGFloat.self) { ($0.size.width - 32).rounded(.down) } action: { measured in
      if abs(measured - width) >= 1 { width = measured }
    }
    .safeAreaBar(edge: .top, spacing: 0) { ExchangeHeadline(me: me, peer: route.peer) }
    .safeAreaBar(edge: .bottom, spacing: 0) {
      Label("Read-only", systemImage: "lock")
        .font(.system(size: 15)).foregroundStyle(Ink.secondary)
        .padding(.horizontal, 18).frame(height: 40)
        .glassEffect(.regular, in: .capsule)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
    }
    .background(Ink.ground)
    .inlineBarTitle()
    .task(id: route.id) {
      guard route.peer.cloudAgent else { return }
      cloudLines = []
      var known: CloudAgentInfo?
      while !Task.isCancelled {
        // Its state first: once that says it is done, the lines read after it are all of them.
        let read = await store.cloudAgent(route.peer.id)
        if case .info(let info) = read { known = info }
        if let lines = await store.cloudAgentConversation(route.peer.id) { cloudLines = lines }
        guard let wait = CloudAgentInfo.nextPoll(after: read, known: known) else { return }
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
      }
    }
  }
}

/** The two agents at the top centre, the way a chat shows its agent: their pictures, one over the other, and their names. */
struct ExchangeHeadline: View {
  let me: Party
  let peer: Party

  var body: some View {
    VStack(spacing: 4) {
      HStack(spacing: -12) {
        PartyAvatar(party: me, size: 44)
        PartyAvatar(party: peer, size: 44)
      }
      .frame(height: 52)
      Text("\(me.name) and \(peer.shownName)").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
        .padding(.horizontal, 12).padding(.vertical, 4)
        .glassEffect(.regular, in: .capsule)
    }
    .padding(.horizontal, 70)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(me.name) and \(peer.shownName)")
    .allowsHitTesting(false)
    // Up into the bar's row, beside its back button, as the chat's.
    #if os(iOS)
    .padding(.top, -34)
    #endif
    .padding(.bottom, 6)
    .frame(maxWidth: .infinity)
  }
}

/** An agent named on a line: its picture when the app knows it, else a face its id picks. */
struct PartyAvatar: View {
  let party: Party
  var size: CGFloat = 28
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    if party.marked {
      // A cloud agent's picture is the mascot of the program that coded, Claude Code's or Codex's (13 November 2026,
      // the founder: "it should be whatever agent is used"). An agent outside Simeon (14 November 2026) is drawn the
      // same way: the mascot of what it is. The mascot is the whole picture, with nothing behind it (that day, the
      // founder: "for it not to be behind a background white or dark"); a dark one has a thin light edge on a dark
      // ground. One with no mascot has its name's first letter on Connect apps' tile.
      Group {
        if let mascot = party.mascot {
          Image("Mascots/\(mascot)")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .shadow(color: Color.white.opacity(scheme == .dark && ExternalAgents.darkMascots.contains(mascot) ? 0.6 : 0), radius: 0.75)
            .frame(width: size, height: size)
        } else {
          Text(party.initial)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(width: size, height: size)
            .background(Ink.appsTile)
            .clipShape(Circle())
            .overlay { Circle().inset(by: -0.5).stroke(Ink.appsTileEdge, lineWidth: 1) }
        }
      }
      .accessibilityHidden(true)
    } else {
      AgentIdAvatar(id: party.id).frame(width: size, height: size)
    }
  }
}

/** A call, as one line: "Voice chat · 01:11"; a tap shows what was said, as bubbles. */
struct VoiceCallLine: View {
  let seconds: Int
  let lines: [CallLine]
  /** The call is still on: "Voice chat · now", and nothing to open yet. */
  var live = false
  @State private var open = false

  var body: some View {
    Button { if !live && !lines.isEmpty { open = true } } label: {
      EventLine {
        Image(systemName: "waveform").font(.system(size: 11, weight: .semibold)).padding(.trailing, 3)
        Text(Chat.voiceChatLabel(seconds: seconds, live: live))
      }
      .contentShape(.rect)
    }
    .buttonStyle(.tactile)
    .sheet(isPresented: $open) { CallRecordSheet(seconds: seconds, lines: lines).macSheetSize(width: 420, height: 560) }
  }
}

/**
 * A call an older host wrote into the chat as the agent's message ("Voice
 * call · 2:48", then its recap; `__simeonCallRecord`): in the agent's
 * bubble, the phone in a 30 pt circle, "Voice call" and its length, a
 * chevron; a click opens the recap under a hairline, set in 40 pt. 340 pt
 * wide at most.
 */
struct CallRecordRow: View {
  let record: CallRecord
  @State private var open = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private static let disc = Color.dynamic(light: "#0000000f", dark: "#ffffff1a")
  private static let rule = Color.dynamic(light: "#00000014", dark: "#ffffff1a")

  var body: some View {
    let recap = record.recap
    VStack(alignment: .leading, spacing: 0) {
      Button { if recap != nil { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) { open.toggle() } } } label: {
        HStack(spacing: 10) {
          Image(systemName: "phone.fill").font(.system(size: 14)).foregroundStyle(Ink.primary)
            .frame(width: 30, height: 30)
            .background(Self.disc, in: Circle())
          VStack(alignment: .leading, spacing: 1) {
            Text("Voice call").font(.system(size: MessageType.size, weight: .semibold)).foregroundStyle(Ink.theirsText)
            Text(record.duration).font(.system(size: 13)).monospacedDigit().foregroundStyle(Ink.secondary)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          if recap != nil {
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.secondary)
              .rotationEffect(.degrees(open ? 90 : 0))
          }
        }
        .contentShape(.rect)
      }
      .buttonStyle(.tactile)
      .accessibilityValue(recap == nil ? "" : open ? String(localized: "expanded") : String(localized: "collapsed"))
      if open, let recap {
        Text(recap)
          .font(.system(size: MessageType.size))
          .lineSpacing(MessageType.spacing())
          .foregroundStyle(Ink.theirsText)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.leading, 40).padding(.top, 8)
          .overlay(alignment: .top) { Self.rule.frame(height: 1) }
          .padding(.top, 8)
          .transition(.opacity)
      }
    }
    .frame(maxWidth: 340, alignment: .leading)
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
    EventLine {
      if routines.count >= 3 {
        Text(Chat.routineVerb(action))
        Menu {
          ForEach(routines, id: \.id) { routine in Button(routine.name) { openRoutine(routine.id) } }
        } label: {
          chip(Text("\(routines.count) routines"), trailing: true)
        }
      } else {
        Text(Chat.routineLabel(action, count: routines.count))
        ForEach(Array(routines.enumerated()), id: \.offset) { index, routine in
          if index > 0 { Text("and") }
          Button { openRoutine(routine.id) } label: { chip(Text(routine.name), trailing: false) }.buttonStyle(.tactile)
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
    .tapRoom(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
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

// MARK: - Checkout

/**
 * The checkout card (13 October 2026; SimeonCore's `PurchaseCard`): one for
 * each purchase an agent wants to make. The shop, the checkout as the agent
 * left it with Review order over it (wearing the shop's icon; it opens the
 * agent's computer on that checkout, where the cart is, 14 October 2026:
 * the shop's page on this phone had an empty cart), the Link card that pays
 * with "Link by Stripe" under it (another of the person's cards can be
 * picked there), the total, then Deny and Allow. Once allowed it follows the
 * purchase: asking Link, then the Link app (Get the Link app, or Open Link
 * for a passkey) while Link waits for the person's approval, then the
 * order. In the flight card's frame (nearly the chat's width, 22 pt
 * corners) with the hand-off card's pills.
 */
struct PurchaseCardView: View {
  let entryId: String
  let agentId: String
  let card: PurchaseCard
  /** The agent's computer, full screen: Review order, and a flight's bank check. */
  var openComputer: (() -> Void)? = nil
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @Environment(\.openURL) private var openURL
  @State private var choosing = false

  /** Review order: the agent's computer on the checkout; the shop's page where there is no computer to open, or for a Shop checkout (14 October 2026: Shop holds it, nothing is open on the computer). */
  private func reviewOrder(_ shown: PurchaseCard) -> (() -> Void)? {
    if shown.isShopCheckout, let url = shown.url { return { openURL(url) } }
    if let openComputer { return openComputer }
    guard let url = shown.url else { return nil }
    return { openURL(url) }
  }

  var body: some View {
    let shown = card.shown(answered: store.answeredPurchases[entryId], picked: store.pickedPurchaseCards[entryId])
    VStack(alignment: .leading, spacing: 14) {
      header(shown)
      if shown.waitsOnPerson {
        Text(shown.flight == nil ? PurchaseCard.check : PurchaseCard.flightCheck).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
      }
      if let flight = shown.flight {
        FlightCheckoutBlock(flight: flight)
      } else if let preview = shown.preview {
        CheckoutPicture(image: preview, icon: shown.icon, agentId: agentId, review: reviewOrder(shown))
      } else if !shown.itemsLine.isEmpty {
        itemsRow(shown)
      }
      VStack(spacing: 0) {
        payment(shown).padding(.vertical, 10)
        if let note = shown.reviewNote {
          Text(note).font(.system(size: 13)).foregroundStyle(Ink.danger).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 8)
        }
        Rectangle().fill(Ink.hairline).frame(height: 1)
        total(shown).padding(.vertical, 10)
      }
      footer(shown)
    }
    .padding(16)
    .frame(width: FlightsCardView.cardWidth(width), alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .modifier(CardEdge(radius: 22))
    .sheet(isPresented: $choosing) {
      CardChooserSheet(cards: shown.cards, selected: shown.cardId, wallet: shown.wallet, footer: shown.cardsFooter) { choice in
        store.pickPurchaseCard(entryId, cardId: choice.id)
        choosing = false
      }
      .presentationDetents([.medium, .large])
      .presentationDragIndicator(.visible)
    }
    // A card with Link: the computer keeps watching Link for it (after a restart nothing would); a flight it was paying, it closes.
    .task(id: card.state) {
      if card.state == .approving || (card.flight != nil && card.state == .approved) { await store.keepWatchingPurchase(entryId, in: agentId, state: card.state) }
    }
  }

  private func header(_ shown: PurchaseCard) -> some View {
    HStack(alignment: .center, spacing: 12) {
      Image(systemName: shown.flight == nil ? "cart.fill" : "airplane").font(.system(size: 18)).foregroundStyle(Ink.primary)
        .frame(width: 44, height: 44)
        .background(Ink.tile, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Ink.tileEdge, lineWidth: 0.5))
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 6) {
          Text(shown.heading).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.theirsText)
          if shown.isTest { StatusPill(text: String(localized: "Test"), size: 12) }
        }
        Text(shown.flight == nil ? PurchaseCard.headline(agent: store.agent(agentId)?.name ?? "", domain: shown.domain) : PurchaseCard.flightHeadline(agent: store.agent(agentId)?.name ?? "", airline: shown.flight?.airline ?? shown.merchant))
          .font(.system(size: 13)).foregroundStyle(Ink.fineGrey)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 0)
    }
  }

  /** No picture of the checkout: what is bought, and Review order (the agent's computer on the checkout). */
  private func itemsRow(_ shown: PurchaseCard) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(shown.itemsLine).font(.system(size: 15)).foregroundStyle(Ink.theirsText).fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
      if let review = reviewOrder(shown) {
        Button(action: review) {
          Label(PurchaseCard.reviewOrder, systemImage: "arrow.up.left.and.arrow.down.right").font(.system(size: 13, weight: .medium)).labelStyle(TrailingIconLabel())
        }
        .buttonStyle(Tactile(look: GreyButtonStyle(height: 28, capsule: true)))
      }
    }
  }

  /** The card that pays, as its wallet names it, with "Link by Stripe" (or "Shop") under it; with several cards, a tap picks another. */
  @ViewBuilder private func payment(_ shown: PurchaseCard) -> some View {
    let row = HStack(spacing: 12) {
      PaymentMark(brand: shown.needsCard ? nil : shown.cardBrand)
      VStack(alignment: .leading, spacing: 2) {
        Text(shown.cardLine ?? (shown.needsCard ? PurchaseCard.chooseCard : shown.wallet == .shop ? String(localized: "Your Shop card") : shown.wallet == .card ? String(localized: "Your card") : String(localized: "Your Link card")))
          .font(.system(size: 15, weight: .medium)).foregroundStyle(shown.needsCard ? Ink.blue : Ink.theirsText)
          .lineLimit(1).truncationMode(.middle)
        LinkByStripe(wallet: shown.wallet)
      }
      Spacer(minLength: 0)
      if shown.canChooseCard {
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.tertiary)
      }
    }
    if shown.canChooseCard {
      Button { Haptics.tap(); choosing = true } label: { row.contentShape(Rectangle()) }
        .buttonStyle(.tactile)
        .accessibilityLabel(shown.cardLine.map { String(localized: "Pays with \($0). Choose another card") } ?? PurchaseCard.chooseCard)
    } else {
      row.accessibilityElement(children: .combine)
    }
  }

  private func total(_ shown: PurchaseCard) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(PurchaseCard.totalLabel).font(.system(size: 15)).foregroundStyle(Ink.fineGrey)
      Spacer(minLength: 8)
      Text(shown.total).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.theirsText).monospacedDigit()
    }
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private func footer(_ shown: PurchaseCard) -> some View {
    if shown.waitsOnPerson {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 8) {
          Button(PurchaseCard.deny) {
            Haptics.tap()
            Task { await store.answerPurchase(entryId, allow: false, in: agentId) }
          }
          .buttonStyle(Tactile(look: PillButtonStyle(primary: false)))
          Button(PurchaseCard.allow) {
            Haptics.press()
            // Face ID first (14 October 2026): this Allow is the approval Link is handed, as Muse's is; cancelled, nothing is allowed.
            let reason = PurchaseApproval.reason(for: shown)
            Task {
              guard let confirmed = await PurchaseApproval.confirm(reason: reason) else { return }
              await store.answerPurchase(entryId, allow: true, confirmed: confirmed, in: agentId)
            }
          }
          .buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
          .disabled(shown.needsCard)
          .opacity(shown.needsCard ? 0.45 : 1)
        }
        if shown.isTest {
          Text(shown.flight == nil ? PurchaseCard.testNote : PurchaseCard.flightTestNote).font(.system(size: 12)).foregroundStyle(Ink.fineGrey)
        }
      }
    } else if let status = shown.status {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top, spacing: 10) {
          PurchaseStatusMark(kind: status.kind).padding(.top, 2)
          VStack(alignment: .leading, spacing: 2) {
            Text(status.label).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.theirsText)
            if let detail = shown.detail {
              Text(detail).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
            }
          }
          Spacer(minLength: 0)
        }
        if shown.state == .approving {
          HStack(spacing: 8) {
            if let app = shown.walletApp {
              Button(app.label) { openURL(app.url) }.buttonStyle(Tactile(look: PillButtonStyle(primary: shown.actionURL == nil)))
            }
            if let url = shown.actionURL {
              Button(shown.openWalletLabel) { openURL(url) }.buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
            }
          }
        }
        if shown.waitsOnBank, let openComputer {
          Button(PurchaseCard.openComputer) { openComputer() }.buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
        }
      }
    }
  }
}

/** Where a purchase stands, as a mark: the breathing dot while it moves, a check, a cross, or a dash. */
struct PurchaseStatusMark: View {
  let kind: PurchaseCard.StatusKind

  var body: some View {
    switch kind {
    case .working: PulsingDot(active: true).frame(width: 16, height: 16)
    case .success: Image(systemName: "checkmark.circle.fill").font(.system(size: 16)).foregroundStyle(Ink.live)
    case .danger: Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(Ink.danger)
    case .neutral: Image(systemName: "minus.circle.fill").font(.system(size: 16)).foregroundStyle(Ink.tertiary)
    }
  }
}

/** The card's network on a small white card: Visa's word, Mastercard's circles, Amex's blue, else a card. */
struct PaymentMark: View {
  let brand: String?

  var body: some View {
    let name = (brand ?? "").lowercased()
    ZStack {
      RoundedRectangle(cornerRadius: 6, style: .continuous).fill(name == "amex" ? Color(red: 0.0, green: 0.44, blue: 0.80) : Color.white)
      switch name {
      case "visa":
        Text("VISA").font(.system(size: 12, weight: .heavy)).italic().foregroundStyle(Color(red: 0.10, green: 0.12, blue: 0.44))
      case "mastercard":
        HStack(spacing: -6) {
          Circle().fill(Color(red: 0.92, green: 0.0, blue: 0.11)).frame(width: 14, height: 14)
          Circle().fill(Color(red: 0.97, green: 0.62, blue: 0.11).opacity(0.9)).frame(width: 14, height: 14)
        }
      case "amex":
        Text("AMEX").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
      case "discover":
        HStack(spacing: 1) {
          Text("DISC").font(.system(size: 8, weight: .heavy)).foregroundStyle(Color(white: 0.15))
          Circle().fill(Color(red: 0.95, green: 0.45, blue: 0.10)).frame(width: 7, height: 7)
        }
      default:
        Image(systemName: "creditcard.fill").font(.system(size: 14)).foregroundStyle(Color(white: 0.45))
      }
    }
    .frame(width: 44, height: 30)
    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Ink.tileEdge, lineWidth: 0.5))
    .accessibilityHidden(true)
  }
}

/** A label with its icon after the words ("Review order ↗"). */
struct TrailingIconLabel: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) { configuration.title; configuration.icon.imageScale(.small) }
  }
}

/**
 * The checkout as the agent left it, read from the computer: its top, 16:10,
 * with Review order in glass over its corner, wearing the shop's icon. It
 * opens the agent's computer on that checkout (14 October 2026: the shop's
 * page on this phone had an empty cart, the cart being in the computer's
 * browser), as Muse's does. Tapping the picture opens it too.
 */
struct CheckoutPicture: View {
  let image: ChatImage
  var icon: ChatImage? = nil
  let agentId: String
  let review: (() -> Void)?
  @Environment(AppStore.self) private var store
  @State private var loaded: UIImage?
  @State private var missing = false
  @State private var iconImage: UIImage?

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Ink.field)
        .aspectRatio(16 / 10, contentMode: .fit)
        .overlay(alignment: .top) {
          if let loaded {
            Image(uiImage: loaded).resizable().scaledToFill()
              .frame(maxWidth: .infinity, alignment: .top)
              .transition(.opacity)
          } else if missing {
            Image(systemName: "photo").font(.system(size: 20)).foregroundStyle(Ink.tertiary)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.hairline, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { review?() }
      if let review {
        Button(action: review) {
          HStack(spacing: 7) {
            ShopIcon(image: iconImage, size: 22)
            Text(PurchaseCard.reviewOrder).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
            Image(systemName: "arrow.up.left.and.arrow.down.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.secondary)
          }
          .padding(.leading, 5).padding(.trailing, 12).frame(height: 34)
          .contentShape(Capsule())
        }
        .buttonStyle(.tactile)
        .glassEffect(.regular, in: .capsule)
        .padding(10)
        .accessibilityLabel("Review order on the computer")
      }
    }
    .animation(.easeOut(duration: 0.2), value: loaded == nil)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("The checkout page")
    .task(id: image.url) {
      if let kept = ChatImages.image(for: [image.url]) { loaded = kept; return }
      guard let data = await GalleryTile.bytes(image, agentId: agentId, store: store), let full = UIImage(data: data) else { missing = true; return }
      let scale = min(1, 1100 / max(full.size.width, 1))
      let thumbnail = await full.byPreparingThumbnail(ofSize: CGSize(width: full.size.width * scale, height: full.size.height * scale)) ?? full
      ChatImages.keep(thumbnail, under: [image.url])
      loaded = thumbnail
    }
    .task(id: icon?.url) {
      guard let icon else { return }
      if let kept = ChatImages.image(for: [icon.url]) { iconImage = kept; return }
      guard let data = await GalleryTile.bytes(icon, agentId: agentId, store: store), let read = UIImage(data: data) else { return }
      ChatImages.keep(read, under: [icon.url])
      iconImage = read
    }
  }
}

/** The shop's icon in a small white circle (Review order wears it); a globe when the shop gave none. */
struct ShopIcon: View {
  let image: UIImage?
  var size: CGFloat = 22

  var body: some View {
    ZStack {
      Circle().fill(Color.white)
      if let image {
        Image(uiImage: image).resizable().interpolation(.high).scaledToFit().padding(size * 0.14).clipShape(Circle())
      } else {
        Image(systemName: "globe").font(.system(size: size * 0.55)).foregroundStyle(Color(white: 0.45))
      }
    }
    .frame(width: size, height: size)
    .overlay(Circle().stroke(Color.black.opacity(0.08), lineWidth: 0.5))
    .accessibilityHidden(true)
  }
}

/** "Link by Stripe" with Link's own mark, under the card that pays (as Link writes it in Muse's card); "Shop" with Shop's for a card Shop pays (14 October 2026). */
struct LinkByStripe: View {
  var wallet: PurchaseCard.Wallet = .link

  var body: some View {
    HStack(spacing: 5) {
      if wallet != .card, let mark = UIImage(named: wallet == .shop ? "Connectors/shop" : "Brands/link") {
        Image(uiImage: mark).resizable().scaledToFit().frame(width: 14, height: 14).clipShape(RoundedRectangle(cornerRadius: 3.5, style: .continuous))
      }
      Text(wallet == .shop ? PurchaseCard.payWithShop : wallet == .card ? PurchaseCard.payWithSaved : PurchaseCard.payWithLink).font(.system(size: 13)).foregroundStyle(Ink.fineGrey)
    }
    .accessibilityElement(children: .combine)
  }
}

/**
 * The person's Link cards, to pick the one that pays (14 October 2026): each
 * with its network's mark, its name in Link and its last four, the one that
 * pays now ticked. As Link lists them; Link gives no picture of each card's
 * art, so the network's mark stands for it.
 */
struct CardChooserSheet: View {
  let cards: [PurchaseCard.Choice]
  let selected: String?
  var wallet: PurchaseCard.Wallet = .link
  var footer: String = PurchaseCard.cardsFooter
  let pick: (PurchaseCard.Choice) -> Void

  var body: some View {
    NavigationStack {
      List {
        Section {
          ForEach(cards) { card in
            Button { Haptics.tap(); pick(card) } label: {
              HStack(spacing: 14) {
                PaymentMark(brand: card.brand)
                VStack(alignment: .leading, spacing: 2) {
                  Text(card.name ?? card.brand).font(.system(size: 16, weight: .medium)).foregroundStyle(Ink.primary).lineLimit(1)
                  Text(card.last4.isEmpty ? card.brand : "\(card.brand) •••• \(card.last4)").font(.system(size: 13)).foregroundStyle(Ink.secondary)
                }
                Spacer(minLength: 0)
                if card.id == selected {
                  Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.blue)
                }
              }
              .padding(.vertical, 4)
              .contentShape(Rectangle())
            }
            .buttonStyle(.tactile)
            .accessibilityAddTraits(card.id == selected ? .isSelected : [])
          }
        } footer: {
          Text(footer)
        }
      }
      .navigationTitle(PurchaseCard.cardsTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarTrailing) { LinkByStripe(wallet: wallet) } }
    }
  }
}


// MARK: - Products

/**
 * The products card (14 October 2026; SimeonCore's `ProductsCard`), as a
 * shop's own cards (10 November 2026, after the founder's reference, the
 * iPhone's in its own sizes): each product a card of its own, 170 wide and
 * 20 round, side by side in one row that scrolls sideways. On each, the
 * picture on white (170 by 204, fitted, padded 14) with the badge at its top
 * left, then on the card's grey the name (15, semibold, one line), "price ·
 * take" in grey (two lines at most) and the store's icon and name at the
 * bottom, Buying in blue or Bought in green at their right. Under the row,
 * the agent's replies as chips (36 high, the card's grey) until the person
 * sends anything after the card; one tapped is sent as their own message. A
 * tap opens the product full screen (`ProductPages`), where a swipe, or ‹
 * and ›, goes to the card's others.
 */
struct ProductsCardView: View {
  let entryId: String
  let agentId: String
  let card: ProductsCard
  @Environment(AppStore.self) private var store
  @State private var open: ProductsCard.Product?

  var body: some View {
    let shown = card.shown(pressed: store.pressedProducts[entryId])
    VStack(alignment: .leading, spacing: 12) {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 10) {
          ForEach(shown.products) { product in
            Button { Haptics.tap(); open = product } label: {
              ProductCard(product: product, agentId: agentId, status: shown.status(of: product))
            }
            .buttonStyle(.tactile)
          }
        }
      }
      // The cards go on past the chat's margin as they scroll.
      .scrollClipDisabled()
      if !shown.shownReplies.isEmpty {
        ProductReplies(replies: shown.shownReplies, paused: store.isSendingPaused) { reply in
          Haptics.tap()
          Task { await store.send(reply, to: agentId) }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .fullScreenCover(item: $open) { product in
      ProductPages(entryId: entryId, agentId: agentId, card: card, start: product.index) { chosen in
        Haptics.press()
        open = nil
        Task { await store.buyProduct(entryId, index: chosen.index, in: agentId) }
      }
    }
  }

  /** Buying in blue, Bought in green: the computer card's Skipped and Done. */
  static func tint(_ status: ProductsCard.Status) -> Color {
    switch status {
    case .buying: return Ink.link
    case .bought: return Ink.success
    }
  }
}

/** One product in the row: the picture on white with its badge, its name, "price · take" and its store. */
private struct ProductCard: View {
  let product: ProductsCard.Product
  let agentId: String
  let status: ProductsCard.Status?
  static let width: CGFloat = 170

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ProductPicture(url: product.imageURL, agentId: agentId)
        .padding(14)
        .frame(width: Self.width, height: 204)
        .background(Color.white)
        .overlay(alignment: .topLeading) {
          if let badge = product.badge { ProductBadge(text: badge).padding(8) }
        }
      VStack(alignment: .leading, spacing: 0) {
        Text(product.title)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(Ink.theirsText)
          .lineLimit(1)
        // Two lines kept, so every card's store sits at its bottom.
        Text(product.priceLine ?? "")
          .font(.system(size: 13))
          .foregroundStyle(Ink.fineGrey)
          .lineLimit(2, reservesSpace: true)
          .multilineTextAlignment(.leading)
          .padding(.top, 2)
        ProductStoreLine(product: product, status: status)
          .padding(.top, 10)
      }
      .padding(EdgeInsets(top: 10, leading: 12, bottom: 12, trailing: 12))
      .frame(width: Self.width, alignment: .leading)
    }
    .background(Ink.bubbleTheirs)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .modifier(CardEdge(radius: 20))
    .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .accessibilityElement(children: .combine)
  }
}

/** The badge: a small grey pill, see-through, white words (12, medium). */
private struct ProductBadge: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(Color.white)
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(Color(.sRGB, red: 60 / 255, green: 60 / 255, blue: 67 / 255, opacity: 0.55), in: Capsule())
  }
}

/** The store: its site's icon (as a saved login's, the letter until it comes) and its name in grey, 8 apart; Buying or Bought at the right. */
private struct ProductStoreLine: View {
  let product: ProductsCard.Product
  var status: ProductsCard.Status? = nil
  var side: CGFloat = 16
  var size: CGFloat = 13

  var body: some View {
    HStack(spacing: 8) {
      SiteIconTile(site: LinkIcons.site(of: product.url), title: product.storeName, size: side)
      Text(product.storeName)
        .font(.system(size: size))
        .foregroundStyle(Ink.fineGrey)
        .lineLimit(1)
        .truncationMode(.tail)
      Spacer(minLength: 0)
      if let status {
        let tint = ProductsCardView.tint(status)
        StatusPill(text: status.label, dot: tint, ink: tint, wash: tint.opacity(0.12)).fixedSize()
      }
    }
  }
}

/** The replies under the row: chips 36 high on the card's grey (15), 8 apart, scrolling sideways when they don't fit. */
private struct ProductReplies: View {
  let replies: [String]
  let paused: Bool
  let send: (String) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(replies, id: \.self) { reply in
          Button { send(reply) } label: {
            Text(reply)
              .font(.system(size: 15))
              .foregroundStyle(Ink.theirsText)
              .lineLimit(1)
              .padding(.horizontal, 16)
              .frame(height: 36)
              .background(Ink.bubbleTheirs, in: Capsule())
              .contentShape(Capsule())
          }
          .buttonStyle(.tactile)
          .disabled(paused)
          .opacity(paused ? 0.5 : 1)
        }
      }
    }
    .scrollClipDisabled()
  }
}

/** A product's own picture from its shop, fitted on white; a bag while it loads or when the shop gave none. */
private struct ProductPicture: View {
  let url: URL?
  let agentId: String
  @Environment(AppStore.self) private var store
  @State private var loaded: UIImage?

  var body: some View {
    ZStack {
      Color.white
      if let loaded {
        Image(uiImage: loaded).resizable().scaledToFit()
      } else {
        Image(systemName: "bag").font(.system(size: 22)).foregroundStyle(Color(.sRGB, red: 142 / 255, green: 142 / 255, blue: 147 / 255, opacity: 1))
      }
    }
    .accessibilityHidden(true)
    .task(id: url) {
      guard let url else { return }
      if let kept = ChatImages.image(for: [url.absoluteString]) { loaded = kept; return }
      guard let data = await GalleryTile.bytes(ChatImage(url: url.absoluteString), agentId: agentId, store: store), let full = UIImage(data: data) else { return }
      let scale = min(1, 1200 / max(full.size.width, 1))
      let picture = await full.byPreparingThumbnail(ofSize: CGSize(width: full.size.width * scale, height: full.size.height * scale)) ?? full
      ChatImages.keep(picture, under: [url.absoluteString])
      loaded = picture
    }
  }
}

/**
 * The products opened, full screen (10 November 2026, after the founder's
 * reference, in the iPhone's one column): a page for each product of the
 * card, side by side, swiped between, with the X at the top left and ‹ and
 * › at the top right (our glass discs). The card is read afresh from the
 * chat, so Buying and Bought show as they come.
 */
private struct ProductPages: View {
  let entryId: String
  let agentId: String
  /** The card as it was opened: the one shown if the chat no longer has it. */
  let card: ProductsCard
  let buy: (ProductsCard.Product) -> Void
  @State private var selection: Int
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss

  init(entryId: String, agentId: String, card: ProductsCard, start: Int, buy: @escaping (ProductsCard.Product) -> Void) {
    self.entryId = entryId; self.agentId = agentId; self.card = card; self.buy = buy
    _selection = State(initialValue: start)
  }

  var body: some View {
    let shown = fresh.shown(pressed: store.pressedProducts[entryId])
    let current = shown.products.first { $0.index == selection }
    TabView(selection: $selection) {
      ForEach(shown.products) { product in
        ProductPage(product: product, agentId: agentId, status: shown.status(of: product), agentName: store.agent(agentId)?.name ?? "") { buy(product) }
          .tag(product.index)
      }
    }
    .tabViewStyle(.page(indexDisplayMode: .never))
    .background(Ink.groupedGround.ignoresSafeArea())
    .overlay(alignment: .top) {
      HStack(spacing: 10) {
        disc("xmark", label: "Close") { dismiss() }
        Spacer(minLength: 0)
        let previous = current.flatMap { shown.neighbour(of: $0, by: -1) }
        let next = current.flatMap { shown.neighbour(of: $0, by: 1) }
        disc("chevron.left", label: "Previous product") { if let previous { step(to: previous) } }
          .disabled(previous == nil)
          .opacity(previous == nil ? 0.4 : 1)
        disc("chevron.right", label: "Next product") { if let next { step(to: next) } }
          .disabled(next == nil)
          .opacity(next == nil ? 0.4 : 1)
      }
      .padding(.horizontal, 14)
      .padding(.top, 6)
    }
  }

  /** The chat's own copy of the card, else the one it was opened with. */
  private var fresh: ProductsCard {
    for row in store.rows(for: agentId) {
      if case .products(let id, let card) = row, id == entryId { return card }
    }
    return card
  }

  private func step(to product: ProductsCard.Product) {
    Haptics.tap()
    withAnimation(.snappy) { selection = product.index }
  }

  private func disc(_ symbol: String, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.primary)
        .frame(width: 36, height: 36).contentShape(Circle())
    }
    .buttonStyle(.tactile)
    .glassEffect(.regular, in: .circle)
    .accessibilityLabel(label)
  }
}

/**
 * One product, opened, in one column: the picture on a white square (16
 * round), the store's icon and name (15, grey), the title (26, semibold),
 * the price (20) and "★ 5.0 (12)" (15, grey), the take (15, grey), "Buy
 * with <agent>" in our blue capsule (48 high), "View at <store>", a
 * hairline, "Sold by" with the seller at its right, then "Why it fits" (19,
 * semibold) with each reason after a round green check.
 */
private struct ProductPage: View {
  let product: ProductsCard.Product
  let agentId: String
  let status: ProductsCard.Status?
  let agentName: String
  let buy: () -> Void
  @Environment(\.openURL) private var openURL

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        Color.white
          .aspectRatio(1, contentMode: .fit)
          .overlay { ProductPicture(url: product.imageURL, agentId: agentId).padding(24) }
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          .modifier(CardEdge(radius: 16))
        ProductStoreLine(product: product, side: 18, size: 15)
          .padding(.top, 18)
        Text(product.title)
          .font(.system(size: 26, weight: .semibold))
          .foregroundStyle(Ink.primary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 6)
        if product.price != nil || product.ratingLine != nil {
          HStack(alignment: .firstTextBaseline, spacing: 10) {
            if let price = product.price { ProductPrice(price: price, listPrice: product.listPrice, size: 20) }
            if let rating = product.ratingLine {
              Text(rating)
                .font(.system(size: 15))
                .foregroundStyle(Ink.fineGrey)
                .monospacedDigit()
                .accessibilityLabel([product.ratingText.map { String(localized: "\($0) out of 5 stars") }, product.reviewCount.map { String(localized: "\($0) reviews") }].compactMap { $0 }.joined(separator: ", "))
            }
          }
          .padding(.top, 8)
        }
        if let take = product.shownTake {
          Text(take)
            .font(.system(size: 15))
            .foregroundStyle(Ink.fineGrey)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 10)
        }
        ProductBuyButton(label: status?.label ?? ProductsCard.buyLabel(agent: agentName), status: status, action: buy)
          .padding(.top, 20)
        Button { openURL(product.url) } label: {
          Text(product.viewAt).font(.system(size: 17)).foregroundStyle(Ink.primary)
            .frame(maxWidth: .infinity).frame(height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.tactile)
        .padding(.top, 4)
        Rectangle().fill(Ink.hairline).frame(height: 1).padding(.top, 10)
        HStack(alignment: .firstTextBaseline, spacing: 16) {
          Text(ProductsCard.soldBy).foregroundStyle(Ink.fineGrey)
          Spacer(minLength: 0)
          Text(product.byline).foregroundStyle(Ink.primary).lineLimit(1).truncationMode(.tail)
        }
        .font(.system(size: 16))
        .padding(.top, 14)
        if !product.reasons.isEmpty {
          Text(ProductsCard.whyItFits)
            .font(.system(size: 19, weight: .semibold))
            .foregroundStyle(Ink.primary)
            .padding(.top, 30)
          VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(product.reasons.enumerated()), id: \.offset) { _, reason in
              HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "checkmark.circle")
                  .font(.system(size: 16))
                  .foregroundStyle(Ink.success)
                Text(reason)
                  .font(.system(size: 16))
                  .foregroundStyle(Ink.primary)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
          .padding(.top, 12)
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 60)
      .padding(.bottom, 32)
    }
  }
}

/** Buy with <agent> in the chat's blue with white words (19 October 2026, the founder: "make that button our blue"); Buying faded while it is under way, Bought in green once ordered. */
private struct ProductBuyButton: View {
  let label: String
  let status: ProductsCard.Status?
  let action: () -> Void

  var body: some View {
    let bought = status == .bought
    let wash: Color = bought ? Ink.success.opacity(0.16) : Ink.blue.opacity(status == nil ? 1 : 0.55)
    Button(action: action) {
      Text(label)
        .font(.system(size: 18, weight: .medium))
        .foregroundStyle(bought ? Ink.success : Ink.mineText)
        .frame(maxWidth: .infinity).frame(height: 48)
        .background(wash, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.tactile)
    .disabled(status != nil)
  }
}

/** A price, and the price before the sale struck through after it in grey: "$99.99 ~~$119.99~~". */
private struct ProductPrice: View {
  let price: String
  let listPrice: String?
  var size: CGFloat = 15

  var body: some View {
    HStack(spacing: 6) {
      Text(price).foregroundStyle(Ink.primary)
      if let listPrice { Text(listPrice).strikethrough().foregroundStyle(Ink.fineGrey) }
    }
    .font(.system(size: size))
    .monospacedDigit()
    .lineLimit(1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(listPrice.map { String(localized: "\(price), was \($0)") } ?? price)
  }
}

/**
 * "Iris just joined your team" (the founder, 30 October 2026, after his
 * reference): the agent another one hired, its face standing on its own on
 * the card's bottom edge at the left (`AgentFaces.standing`; a picture of
 * its own sits round in that place), the title, what it does in two lines
 * at most, and Go to Chat and View Profile side by side at the bottom. One
 * height for every card, enough for two lines of title, two of words and
 * the buttons, so the buttons sit on the bottom whatever the words. The
 * agent gone (deleted since), the words stay and the face and buttons go.
 */
struct JoinedCardView: View {
  let card: JoinedCard
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var showsProfile = false

  /** 18 + the title (two lines, 44) + 4 + two lines (40) + 12 at least + the buttons (36) + 18 is 172. */
  static let height: CGFloat = 176
  static let faceColumn: CGFloat = 112

  var body: some View {
    let agent = card.agent(in: store.agents)
    // The face's own background colour (design B, 30 October 2026); the chat's grey for a picture of its own or an agent gone.
    let colours = card.colours(in: store.agents)
    HStack(alignment: .top, spacing: 0) {
      if let agent { face(agent) }
      VStack(alignment: .leading, spacing: 0) {
        Text(verbatim: card.title(in: store.agents))
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(colours.map { Color($0.ink) } ?? Ink.theirsText)
          .lineLimit(2)
          .minimumScaleFactor(0.9)
        if !card.line.isEmpty {
          Text(verbatim: card.line)
            .font(.system(size: 15))
            .foregroundStyle(colours.map { Color($0.secondaryInk) } ?? Ink.secondary)
            .lineLimit(2)
            .truncationMode(.tail)
            .padding(.top, 4)
        }
        if agent != nil {
          Spacer(minLength: 12)
          HStack(spacing: 6) {
            // `.tactile` gives each its light tap.
            JoinedButton(title: JoinedCard.goToChat, prominent: true, colours: colours) {
              Notifications.shared.openAgent = card.agentId
            }
            JoinedButton(title: JoinedCard.viewProfile, prominent: false, colours: colours) {
              showsProfile = true
            }
          }
        }
      }
      .padding(.vertical, 18)
      .padding(.leading, agent == nil ? 18 : 4)
      .padding(.trailing, 14)
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .frame(height: agent == nil ? nil : Self.height)
    .frame(width: min(ChatMetrics.bubbleMax(width), 400), alignment: .leading)
    .background { ground(colours) }
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .modifier(CardEdge(radius: 22))
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .sheet(isPresented: $showsProfile) { AgentPageSheet(agentId: card.agentId).problemAlert() }
  }

  /** The colour, lighter at the top leading corner and darker at the bottom trailing one, a soft light behind the face; else the chat's grey. */
  @ViewBuilder
  private func ground(_ colours: JoinedCard.Colours?) -> some View {
    if let colours {
      ZStack(alignment: .leading) {
        LinearGradient(colors: [Color(colours.top), Color(colours.bottom)], startPoint: .topLeading, endPoint: .bottomTrailing)
        RadialGradient(colors: [Color(JoinedCard.Colours.glow), .clear], center: UnitPoint(x: 0.5, y: 0.7), startRadius: 0, endRadius: 104)
          .frame(width: 208, height: Self.height)
          .offset(x: Self.faceColumn / 2 - 104)
      }
    } else {
      Ink.bubbleTheirs
    }
  }

  /** The face standing on the card's bottom edge, 18 points under its top; a picture of its own, round, in the middle of the same place. */
  @ViewBuilder
  private func face(_ agent: Agent) -> some View {
    if let face = AgentFaces.standing(agent), let image = AgentPictures.standing(face) {
      Image(uiImage: image)
        .resizable()
        .interpolation(.high)
        .scaledToFit()
        .frame(width: Self.faceColumn, height: Self.height - 18, alignment: .bottom)
        .frame(width: Self.faceColumn, height: Self.height, alignment: .bottom)
        .accessibilityHidden(true)
    } else {
      PictureCircle(image: AgentPictures.image(of: agent))
        .frame(width: 72, height: 72)
        .frame(width: Self.faceColumn, height: Self.height)
    }
  }
}

/**
 * The joined card's buttons: round ends, as wide as each other. On the face's
 * colour, Go to Chat white with its words in the colour's deep shade, View
 * Profile a pane of the words' colour; on the chat's grey, Go to Chat in the
 * chat's blue (the Mac's, `#8cb8e8` on dark).
 */
private struct JoinedButton: View {
  let title: String
  let prominent: Bool
  let colours: JoinedCard.Colours?
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(verbatim: title)
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(ink)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
        .frame(height: 36)
        .background(fill, in: Capsule())
        .overlay { Capsule().strokeBorder(edge, lineWidth: colours == nil ? 1 : 0.5) }
        .contentShape(Capsule())
    }
    .buttonStyle(.tactile)
  }

  private var ink: Color {
    if let colours { return prominent ? Color(colours.deep) : Color(colours.ink) }
    return prominent ? Color.dynamic(light: "#fcfcfc", dark: "#0b1828") : Ink.primary
  }

  private var fill: Color {
    if let colours { return prominent ? .white : Color(colours.pane) }
    return prominent ? Color.dynamic(light: "#255a93", dark: "#8cb8e8") : Ink.pill
  }

  private var edge: Color {
    if prominent { return .clear }
    if let colours { return Color(colours.paneEdge) }
    return Ink.primary.opacity(0.15)
  }
}
