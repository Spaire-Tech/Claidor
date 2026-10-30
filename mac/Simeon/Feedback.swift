import AppKit
import SwiftUI
import SimeonCore
import UniformTypeIdentifiers

/**
 * Send Feedback and Report an Issue on the Mac (the founder, 30 October 2026,
 * with two other apps' for reference: "we already have a report issue
 * button in mac. just make it work"): Settings › Help & support's two rows
 * and the account menu's Report an issue open them, on a sheet over the
 * window in the Mac's parts (New Agent's: the title and its glass discs at the
 * top, the groups, the one wide blue button). What is sent is e-mailed to
 * Simeon Labs (`FeedbackReport`, server/simeon/desktop/feedback.py).
 */
@MainActor
@Observable
final class FeedbackSheets {
  static let shared = FeedbackSheets()
  /** The sheet the window shows (MainWindow), nil when none. */
  var showing: FeedbackSheetKind?
}

enum FeedbackSheetKind: String, Identifiable {
  case feedback, issue
  var id: String { rawValue }
}

enum MacFeedback {
  /** This Mac and this build: "0.2.10 (41)". */
  static var facts: DeviceFacts {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return DeviceFacts.current(platform: "Mac", appVersion: "\(version) (\(build))")
  }

  /** The logs the Mac keeps in its folder (`computer-stream.log`, `voice-call.log`), their last 256 KB each; the report keeps their last lines, scrubbed. */
  static func logFiles() -> [(name: String, text: String)] {
    guard let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
      .appendingPathComponent("Simeon", isDirectory: true) else { return [] }
    return ["computer-stream.log", "voice-call.log"].compactMap { name in
      guard let data = try? Data(contentsOf: folder.appendingPathComponent(name)), !data.isEmpty else { return nil }
      return (name, String(decoding: data.suffix(256 * 1024), as: UTF8.self))
    }
  }
}

/**
 * The sheet. Feedback, as the reference's: the words, the agent it was about, Send
 * Feedback. An issue, as Muse's: first whether the logs and diagnostics go
 * with it, then what went wrong, screenshots, what it is about, and Submit.
 * Once sent, it says so and Done closes it.
 */
struct MacFeedbackSheet: View {
  let kind: FeedbackSheetKind
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var report: FeedbackReport
  /** The logs question answered (an issue's first step); feedback has none. */
  @State private var asked: Bool
  @State private var sending = false
  @State private var failure: String?
  @State private var sent = false

  init(kind: FeedbackSheetKind) {
    self.kind = kind
    _report = State(initialValue: FeedbackReport(kind: kind == .feedback ? .feedback : .issue))
    _asked = State(initialValue: kind == .feedback)
  }

  private var look: Look { Look(scheme) }
  private var stepBack: Bool { kind == .issue && asked && !sent }

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text(kind == .feedback ? LocalizedStringKey("Send Feedback") : LocalizedStringKey("Report an Issue"))
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        HStack {
          if stepBack {
            GlassDiscButton(symbol: "chevron.left", help: String(localized: "Back"), size: 32) { asked = false }
              .disabled(sending)
          } else {
            GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
              .keyboardShortcut(.cancelAction)
              .disabled(sending)
          }
          Spacer(minLength: 0)
          if stepBack {
            GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: 32) { dismiss() }
              .keyboardShortcut(.cancelAction)
              .disabled(sending)
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 16)
      .padding(.bottom, 8)
      if sent {
        done
      } else if !asked {
        question
      } else if kind == .feedback {
        feedbackForm
      } else {
        issueForm
      }
    }
    .frame(width: 480)
    .background(look.groupedGround)
    .interactiveDismissDisabled(sending)
    .closesOnClickOutside { if !sending { dismiss() } }
  }

  // MARK: Feedback

  private var feedbackForm: some View {
    let agents = FeedbackAgent.choices(from: store.agents)
    return VStack(spacing: 0) {
      VStack(spacing: 22) {
        SettingsGroup(footer: String(localized: "Ideas, questions, things you’d change. We read every one."), look: look) {
          MacFeedbackEditor(text: $report.message, placeholder: String(localized: "What’s on your mind?"), look: look)
        }
        if !agents.isEmpty {
          SettingsGroup(title: String(localized: "Was it about one of your agents?"), look: look) {
            SettingsLine(label: String(localized: "Agent"), look: look) {
              Picker("Agent", selection: $report.agent) {
                Text(verbatim: String(localized: "feedback.agent.none", defaultValue: "None")).tag(FeedbackAgent?.none)
                ForEach(agents) { agent in Text(verbatim: agent.label).tag(Optional(agent)) }
              }
              .labelsHidden()
              .pickerStyle(.menu)
              .fixedSize()
            }
          }
        }
        failureLine
      }
      .padding(.horizontal, 32)
      .padding(.top, 8)
      wideButton(String(localized: "Send Feedback"), enabled: report.canSend, underText: true, action: send)
    }
  }

  // MARK: Issue

  /** Whether the logs go with it: what always does, what can be added, and the two ways on. */
  private var question: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 12) {
        Text("Include logs and diagnostics?")
          .font(.system(size: 20, weight: .medium))
          .foregroundStyle(look.ink)
        Group {
          Text("Your device, the app’s version and your account always come with a report, so we can find the problem.")
          Text("You can also include the app’s recent activity: what it asked our server and when, and how the connections to your computer went. Never your messages.")
          Text("Next, you’ll say what went wrong and can add screenshots. What you send goes to Simeon Labs and is only used to fix the problem.")
        }
        .font(.system(size: 13))
        .foregroundStyle(look.inkSecondary)
        .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 32)
      .padding(.top, 8)
      wideButton(String(localized: "Include and Continue"), enabled: true) { go(including: true) }
      Button { go(including: false) } label: {
        Text("Don’t Include and Continue")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(look.settingsBlue)
          .frame(maxWidth: .infinity)
          .frame(height: 28)
          .contentShape(.rect)
      }
      .buttonStyle(.hand)
      .padding(.top, -12)
      .padding(.bottom, 20)
    }
  }

  private func go(including: Bool) {
    report.includesDiagnostics = including
    withAnimation(.easeOut(duration: 0.18)) { asked = true }
  }

  private var issueForm: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 22) {
        SettingsGroup(title: String(localized: "What went wrong?"), look: look) {
          MacFeedbackEditor(text: $report.message, placeholder: String(localized: "What happened, and what did you expect?"), look: look)
        }
        VStack(alignment: .leading, spacing: 8) {
          sectionTitle(String(localized: "Screenshots"))
          HStack(spacing: 10) {
            ForEach(Array(report.screenshots.enumerated()), id: \.offset) { index, data in
              MacFeedbackShot(data: data, look: look) { report.screenshots.remove(at: index) }
            }
            if report.roomForScreenshots > 0 {
              Button(action: chooseScreenshots) { MacFeedbackAddTile(look: look) }
                .buttonStyle(.hand)
                .help(String(localized: "Add screenshots"))
            }
            Spacer(minLength: 0)
          }
          .dropDestination(for: URL.self) { urls, _ in
            add(urls)
            return !urls.isEmpty
          }
        }
        VStack(alignment: .leading, spacing: 8) {
          sectionTitle(String(localized: "What’s it about?"))
          MacFeedbackFlow(spacing: 8) {
            ForEach(FeedbackTopic.all) { topic in
              MacFeedbackChip(topic: topic, on: report.topics.contains(topic.id), look: look) { report.toggle(topic) }
            }
          }
        }
        VStack(alignment: .leading, spacing: 6) {
          failureLine
          Text("What you send goes to Simeon Labs and is only used to fix the problem.")
            .font(PanelType.detail)
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.horizontal, 32)
      .padding(.top, 8)
      wideButton(String(localized: "Submit"), enabled: report.canSend, underText: true, action: send)
    }
  }

  private func sectionTitle(_ text: String) -> some View {
    Text(text)
      .font(PanelType.section)
      .foregroundStyle(look.inkSecondary)
      .accessibilityAddTraits(.isHeader)
  }

  /** Screenshots from the Finder: pictures only, as many as there is room for. */
  private func chooseScreenshots() {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.image]
    panel.allowsMultipleSelection = true
    panel.canChooseDirectories = false
    panel.message = String(localized: "Choose screenshots to add")
    panel.begin { response in
      guard response == .OK else { return }
      let urls = panel.urls
      Task { @MainActor in add(urls) }
    }
  }

  private func add(_ urls: [URL]) {
    let room = report.roomForScreenshots
    let chosen = Array(urls.prefix(room))
    guard !chosen.isEmpty else { return }
    Task {
      let shrunk = await Task.detached(priority: .userInitiated) {
        chosen.compactMap { url in (try? Data(contentsOf: url)).flatMap(FeedbackPictures.shrink) }
      }.value
      report.screenshots.append(contentsOf: shrunk.prefix(report.roomForScreenshots))
    }
  }

  // MARK: Both

  @ViewBuilder
  private var failureLine: some View {
    if let failure {
      Text(verbatim: failure)
        .font(PanelType.detail)
        .foregroundStyle(look.danger)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var done: some View {
    VStack(spacing: 0) {
      VStack(spacing: 10) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 40))
          .foregroundStyle(look.settingsBlue)
        Text(kind == .feedback ? LocalizedStringKey("Feedback sent") : LocalizedStringKey("Report sent"))
          .font(PanelType.title)
          .foregroundStyle(look.ink)
        Text(kind == .feedback ? LocalizedStringKey("Thank you. We read every one.") : LocalizedStringKey("Thank you. We’ll look into it."))
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
      }
      .padding(.top, 20)
      wideButton(String(localized: "Done"), enabled: true) { dismiss() }
    }
  }

  /**
   * The sheet's one wide button in the blue (New Agent's Create); grey words on
   * the grey until it can be pressed. Under a text box it answers ⌘Return, so
   * Return makes a new line.
   */
  private func wideButton(_ title: String, enabled: Bool, underText: Bool = false, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if sending { ProgressView().controlSize(.small).tint(.white) }
        Text(title)
      }
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(enabled ? Color.white : look.inkSecondary)
      .frame(maxWidth: .infinity)
      .frame(height: 36)
    }
    .prominentGlassButton()
    .controlSize(.large)
    .tint(look.yours)
    .keyboardShortcut(underText ? KeyboardShortcut(.return, modifiers: .command) : .defaultAction)
    .handCursor()
    .disabled(!enabled)
    .padding(.horizontal, 32)
    .padding(.top, 28)
    .padding(.bottom, 24)
  }

  private func send() {
    guard report.canSend, !sending else { return }
    sending = true
    failure = nil
    let report = report
    let facts = MacFeedback.facts
    let diagnostics = report.includesDiagnostics
      ? Diagnostics.text(facts: facts, state: store.diagnosticsState, files: MacFeedback.logFiles())
      : nil
    Task {
      do {
        try await store.sendFeedback(report, facts: facts, diagnostics: diagnostics)
        withAnimation(.easeOut(duration: 0.18)) { sent = true }
      } catch {
        if let refused = error as? SimeonAPIError, refused.status == 400 {
          failure = refused.message
        } else {
          failure = String(localized: "Couldn’t send it. Check your connection and try again.")
        }
      }
      sending = false
    }
  }
}

/** The words, in the group's grey: 13, with the placeholder until something is written. */
private struct MacFeedbackEditor: View {
  @Binding var text: String
  let placeholder: String
  let look: Look

  var body: some View {
    ZStack(alignment: .topLeading) {
      TextEditor(text: $text)
        .font(.system(size: 13))
        .scrollContentBackground(.hidden)
        .padding(.horizontal, 13)
        .padding(.vertical, 12)
      if text.isEmpty {
        Text(placeholder)
          .font(.system(size: 13))
          .foregroundStyle(look.placeholder)
          .padding(.leading, 18)
          .padding(.top, 12)
          .allowsHitTesting(false)
      }
    }
    .frame(height: 140)
    .onChange(of: text) { _, value in
      if value.count > FeedbackReport.messageLimit { text = String(value.prefix(FeedbackReport.messageLimit)) }
    }
  }
}

/** A screenshot added: 96 × 64, round 10, with an × to take it out. */
private struct MacFeedbackShot: View {
  let data: Data
  let look: Look
  let remove: () -> Void

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Group {
        if let image = NSImage(data: data) {
          Image(nsImage: image).resizable().scaledToFill()
        } else {
          look.groupedRow
        }
      }
      .frame(width: 96, height: 64)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.inkTertiary.opacity(0.4), lineWidth: 0.5))
      GlassDiscButton(symbol: "xmark", help: String(localized: "Remove screenshot"), size: 20, action: remove)
        .padding(4)
    }
  }
}

/** Add, as Muse's: a dashed tile the size of a screenshot, the blue + over the word. */
private struct MacFeedbackAddTile: View {
  let look: Look

  var body: some View {
    VStack(spacing: 4) {
      Image(systemName: "plus.circle.fill").font(.system(size: 18)).foregroundStyle(look.settingsBlue)
      Text("Add").font(PanelType.detail).foregroundStyle(look.settingsBlue)
    }
    .frame(width: 96, height: 64)
    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(look.groupedRow))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.inkTertiary, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

/** A topic, as Muse's chips: its symbol and its name in a grey pill; picked, in the blue. */
private struct MacFeedbackChip: View {
  let topic: FeedbackTopic
  let on: Bool
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: topic.symbol).font(.system(size: 12))
        Text(verbatim: topic.title).font(PanelType.row)
      }
      .foregroundStyle(on ? Color.white : look.ink)
      .padding(.horizontal, 12)
      .frame(height: 28)
      .background(Capsule().fill(on ? look.settingsBlue : look.groupedRow))
      .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .accessibilityAddTraits(on ? .isSelected : [])
  }
}

/** The chips one after another, onto the next line when a line is full. */
private struct MacFeedbackFlow: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    let rows = lines(subviews, width: width)
    let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(0, rows.count - 1))
    return CGSize(width: proposal.width ?? rows.map { $0.width }.max() ?? 0, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in lines(subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private func lines(_ subviews: Subviews, width: CGFloat) -> [(indices: [Int], width: CGFloat, height: CGFloat)] {
    var rows: [(indices: [Int], width: CGFloat, height: CGFloat)] = []
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      if let last = rows.indices.last, rows[last].width + spacing + size.width <= width {
        rows[last].indices.append(index)
        rows[last].width += spacing + size.width
        rows[last].height = max(rows[last].height, size.height)
      } else {
        rows.append((indices: [index], width: size.width, height: size.height))
      }
    }
    return rows
  }
}
