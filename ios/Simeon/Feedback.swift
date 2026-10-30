import PhotosUI
import SwiftUI
import SimeonCore

/**
 * Send Feedback and Report an Issue, Settings' help rows (the founder, 30
 * October 2026, with two other apps' for reference: "follow our style").
 * Each is a page pushed from Settings, in the phone's grouped rows with the
 * blue button at its foot; what is sent is e-mailed to Simeon Labs
 * (`FeedbackReport`, server/simeon/desktop/feedback.py).
 */
enum FeedbackFacts {
  /** This phone and this build: "1.0 (29)". */
  static var current: DeviceFacts {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return DeviceFacts.current(platform: "iPhone", appVersion: "\(version) (\(build))")
  }
}

/**
 * Send Feedback, as the reference's: the words in a tall field, the agent it was about
 * (None unless one is picked), and Send Feedback at the foot, grey until
 * something is written.
 */
struct SendFeedbackPage: View {
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var report = FeedbackReport(kind: .feedback)
  @State private var sending = false
  @State private var failure: String?
  @State private var sent = false
  @FocusState private var writing: Bool

  var body: some View {
    let agents = FeedbackAgent.choices(from: store.agents)
    Form {
      Section {
        TextField("What’s on your mind?", text: $report.message, axis: .vertical)
          .lineLimit(7, reservesSpace: true)
          .focused($writing)
          .onChange(of: report.message) { _, value in
            if value.count > FeedbackReport.messageLimit { report.message = String(value.prefix(FeedbackReport.messageLimit)) }
          }
      } footer: {
        Text("Ideas, questions, things you’d change. We read every one.")
      }
      .listRowBackground(Ink.groupedRow)
      if !agents.isEmpty {
        Section {
          Picker("Agent", selection: $report.agent) {
            Text(verbatim: String(localized: "feedback.agent.none", defaultValue: "None")).tag(FeedbackAgent?.none)
            ForEach(agents) { agent in Text(verbatim: agent.label).tag(Optional(agent)) }
          }
          .pickerStyle(.menu)
          .tint(Ink.secondary)
        } header: {
          Text("Was it about one of your agents?")
        } footer: {
          if let failure { Text(verbatim: failure).foregroundStyle(Ink.danger) }
        }
        .listRowBackground(Ink.groupedRow)
      } else if let failure {
        Section {} footer: { Text(verbatim: failure).foregroundStyle(Ink.danger) }
      }
    }
    .groupedGround()
    .navigationTitle("Send Feedback")
    .inlineBarTitle()
    .safeAreaInset(edge: .bottom) {
      FeedbackSendButton(title: "Send Feedback", sending: sending, enabled: report.canSend, action: send)
    }
    .alert("Feedback sent", isPresented: $sent) {
      Button("OK") { dismiss() }
    } message: {
      Text("Thank you. We read every one.")
    }
    .task { writing = true }
  }

  private func send() {
    guard report.canSend, !sending else { return }
    writing = false
    sending = true
    failure = nil
    let report = report
    Task {
      do {
        try await store.sendFeedback(report, facts: FeedbackFacts.current, diagnostics: nil)
        Haptics.success()
        sent = true
      } catch {
        Haptics.warning()
        failure = FeedbackFailure.line(error)
      }
      sending = false
    }
  }
}

/**
 * Report an Issue, as Muse's: first whether the app's logs and diagnostics go
 * with it, then what went wrong, screenshots and what it is about, and
 * Submit. Back from the second step returns to Settings.
 */
struct ReportIssuePage: View {
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var asked = false
  @State private var report = FeedbackReport(kind: .issue)
  @State private var picked: [PhotosPickerItem] = []
  @State private var sending = false
  @State private var failure: String?
  @State private var sent = false

  var body: some View {
    Group {
      if asked { form } else { question }
    }
    .navigationTitle("Report an Issue")
    .inlineBarTitle()
    .alert("Report sent", isPresented: $sent) {
      Button("OK") { dismiss() }
    } message: {
      Text("Thank you. We’ll look into it.")
    }
  }

  /** Whether the logs go with it: what is always sent, what can be added, and the two ways on. */
  private var question: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Include logs and diagnostics?")
          .font(.system(size: 28, weight: .semibold))
          .foregroundStyle(Ink.primary)
          .fixedSize(horizontal: false, vertical: true)
        Group {
          Text("Your device, the app’s version and your account always come with a report, so we can find the problem.")
          Text("You can also include the app’s recent activity: what it asked our server and when, and how the connections to your computer went. Never your messages.")
          Text("Next, you’ll say what went wrong and can add screenshots. What you send goes to Simeon Labs and is only used to fix the problem.")
        }
        .font(.system(size: 17))
        .foregroundStyle(Ink.primary)
        .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.horizontal, 20)
      .padding(.top, 12)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Ink.groupedGround)
    .safeAreaInset(edge: .bottom) {
      VStack(spacing: 14) {
        Button("Include and Continue") { go(including: true) }
          .buttonStyle(PhonePrimaryStyle())
        Button("Don’t Include and Continue") { go(including: false) }
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(Ink.blue)
          .buttonStyle(.tactile)
          .frame(height: 44)
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 8)
      .background(Ink.groupedGround)
    }
  }

  private func go(including: Bool) {
    Haptics.tap()
    report.includesDiagnostics = including
    withAnimation(.easeOut(duration: 0.2)) { asked = true }
  }

  private var form: some View {
    Form {
      Section {
        TextField("What happened, and what did you expect?", text: $report.message, axis: .vertical)
          .lineLimit(6, reservesSpace: true)
          .onChange(of: report.message) { _, value in
            if value.count > FeedbackReport.messageLimit { report.message = String(value.prefix(FeedbackReport.messageLimit)) }
          }
      } header: {
        Text("What went wrong?")
      }
      .listRowBackground(Ink.groupedRow)
      Section {
        ScrollView(.horizontal) {
          HStack(spacing: 10) {
            ForEach(Array(report.screenshots.enumerated()), id: \.offset) { index, data in
              FeedbackShot(data: data) { report.screenshots.remove(at: index) }
            }
            if report.roomForScreenshots > 0 {
              PhotosPicker(selection: $picked, maxSelectionCount: report.roomForScreenshots, matching: .images) {
                FeedbackAddTile()
              }
              .buttonStyle(.tactile)
            }
          }
          .padding(.vertical, 2)
        }
        .scrollIndicators(.never)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        .listRowBackground(Color.clear)
      } header: {
        Text("Screenshots")
      }
      Section {
        FeedbackFlow(spacing: 8) {
          ForEach(FeedbackTopic.all) { topic in
            FeedbackChip(topic: topic, on: report.topics.contains(topic.id)) {
              Haptics.select()
              report.toggle(topic)
            }
          }
        }
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
        .listRowBackground(Color.clear)
      } header: {
        Text("What’s it about?")
      } footer: {
        VStack(alignment: .leading, spacing: 8) {
          if let failure { Text(verbatim: failure).foregroundStyle(Ink.danger) }
          Text("What you send goes to Simeon Labs and is only used to fix the problem.")
        }
        .padding(.top, 8)
      }
    }
    .groupedGround()
    .safeAreaInset(edge: .bottom) {
      FeedbackSendButton(title: "Submit", sending: sending, enabled: report.canSend, action: send)
    }
    .onChange(of: picked) { _, items in
      guard !items.isEmpty else { return }
      picked = []
      Task {
        for item in items {
          guard report.roomForScreenshots > 0, let data = try? await item.loadTransferable(type: Data.self) else { continue }
          if let shrunk = await Task.detached(priority: .userInitiated, operation: { FeedbackPictures.shrink(data) }).value {
            report.screenshots.append(shrunk)
          }
        }
      }
    }
  }

  private func send() {
    guard report.canSend, !sending else { return }
    sending = true
    failure = nil
    let report = report
    let facts = FeedbackFacts.current
    let diagnostics = report.includesDiagnostics
      ? Diagnostics.text(facts: facts, state: store.diagnosticsState, files: HangWatch.savedReport().map { [(name: "Last freeze", text: $0)] } ?? [])
      : nil
    Task {
      do {
        try await store.sendFeedback(report, facts: facts, diagnostics: diagnostics)
        Haptics.success()
        sent = true
      } catch {
        Haptics.warning()
        failure = FeedbackFailure.line(error)
      }
      sending = false
    }
  }
}

/** The line under a page that could not send: the server's sentence when it gave one. */
enum FeedbackFailure {
  static func line(_ error: Error) -> String {
    if let refused = error as? SimeonAPIError, refused.status == 400 { return refused.message }
    return String(localized: "Couldn’t send it. Check your connection and try again.")
  }
}

/** The page's blue button at its foot, grey until it can send; a spinner while it does. */
private struct FeedbackSendButton: View {
  let title: LocalizedStringKey
  let sending: Bool
  let enabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      if sending { ProgressView().tint(.white) } else { Text(title) }
    }
    .buttonStyle(PhonePrimaryStyle())
    .disabled(!enabled)
    .padding(.horizontal, 20)
    .padding(.bottom, 8)
  }
}

/** A screenshot added: 84 × 150, round 14, with an × to take it out. */
private struct FeedbackShot: View {
  let data: Data
  let remove: () -> Void

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Group {
        if let image = UIImage(data: data) {
          Image(uiImage: image).resizable().scaledToFill()
        } else {
          Ink.groupedRow
        }
      }
      .frame(width: 84, height: 150)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.hairline, lineWidth: 1))
      Button(action: remove) {
        Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Ink.primary)
          .frame(width: 24, height: 24)
      }
      .buttonStyle(Tactile(look: GlassDisc()))
      .padding(5)
      .accessibilityLabel("Remove screenshot")
    }
  }
}

/** Add, as Muse's: a dashed tile the size of a screenshot, the blue + over the word. */
private struct FeedbackAddTile: View {
  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "plus.circle.fill").font(.system(size: 28)).foregroundStyle(Ink.blue)
      Text("Add").font(.system(size: 15)).foregroundStyle(Ink.blue)
    }
    .frame(width: 84, height: 150)
    .background(Ink.groupedRow, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Ink.edge, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
    .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

/** A topic, as Muse's chips: its symbol and its name in a grey pill; picked, in the blue. */
private struct FeedbackChip: View {
  let topic: FeedbackTopic
  let on: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Image(systemName: topic.symbol).font(.system(size: 14))
        Text(verbatim: topic.title).font(.system(size: 15))
      }
      .foregroundStyle(on ? Ink.mineText : Ink.primary)
      .padding(.horizontal, 14)
      .frame(height: 38)
      .background(on ? Ink.bubbleMine : Ink.groupedRow, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.tactile)
    .accessibilityAddTraits(on ? .isSelected : [])
  }
}

/** The chips one after another, onto the next line when a line is full. */
struct FeedbackFlow: Layout {
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
