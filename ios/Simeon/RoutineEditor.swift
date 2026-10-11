import SwiftUI
import UIKit
import SimeonCore

/**
 * A routine's editor (the Mac's, mac/Simeon/RoutinesPage.swift `_2n`), as a
 * sheet: Active; Name; Instruction; When to run, the routine's triggers (up
 * to eight, each its sign and sentence; a tap opens its fields, a swipe
 * removes it) and Add trigger / Add another; Run history; Delete. Test run
 * sits at the top right and reads "Running…" while its run is on its way
 * or going. Nothing is sent while typing: a field is saved when it lets go
 * of the keys, a trigger when it is picked or its page closes, and a new
 * routine is made once it has a name, an instruction and a trigger that is
 * right (`RoutineEditing`, the Mac's rules, in SimeonCore).
 */
struct RoutineEditor: View {
  @Bindable var model: RoutineEditing
  /** Test run's waits, kept by the Routines tab for every routine. */
  let runs: RoutineTestRuns
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @FocusState private var focus: Field?
  /** The field that held the keys, kept past the sheet's going (the keys are let go without a word then). */
  @State private var holding: Field? = nil
  @State private var adding = false
  /** What Add trigger picked: added once its sheet has gone, so a page can open for it. */
  @State private var picked: AddPick? = nil
  /** Delete was pressed: a field letting go of the keys as the sheet goes must not make or save the routine again. */
  @State private var deleting = false

  enum Field: Hashable { case name, prompt }

  var body: some View {
    let running = model.isRunning(store, runs: runs)
    NavigationStack {
      ScrollViewReader { proxy in
        Form {
          if model.saveFailed {
            Section {
              Text(RoutineDraft.saveError).font(.system(size: 15)).foregroundStyle(Ink.danger)
            }
            .listRowBackground(Ink.groupedRow)
          }
          Section {
            Toggle("Active", isOn: Binding(get: { model.isActive(store) }, set: { on in model.toggleActive(on, store: store) }))
              .tint(Ink.blue)
              .disabled(model.toggling)
          }
          .listRowBackground(Ink.groupedRow)
          Section("Name") {
            TextField("", text: $model.name, prompt: Text("Name this routine").foregroundStyle(Ink.tertiary))
              .font(.system(size: 17))
              .focused($focus, equals: .name)
              .submitLabel(.done)
              .onSubmit { focus = nil }
              .accessibilityLabel("Name")
          }
          .listRowBackground(Ink.groupedRow)
          Section("Instruction") {
            TextField("", text: $model.prompt, prompt: Text("What should this routine do each time it runs?").foregroundStyle(Ink.tertiary), axis: .vertical)
              .font(.system(size: 17))
              .lineLimit(3...12)
              .focused($focus, equals: .prompt)
              .accessibilityLabel("Instruction")
          }
          .listRowBackground(Ink.groupedRow)
          Section("When to run") {
            ForEach(Array(model.rows.enumerated()), id: \.offset) { index, row in
              Button { open(index) } label: {
                HStack(spacing: 8) {
                  TriggerRowLabel(row: row)
                  Spacer(minLength: 4)
                  Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.chevron)
                }
                .contentShape(.rect)
              }
              .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) { remove(index) } label: { Label("Remove", systemImage: "trash") }
              }
              .accessibilityAction(named: "Remove trigger") { remove(index) }
            }
            if model.rows.count < TriggerRow.limit {
              Button { focus = nil; adding = true } label: {
                Label(RoutineWords.addLabel(rows: model.rows.count), systemImage: "plus")
                  .font(.system(size: 17))
                  .foregroundStyle(Ink.blue)
              }
            }
          }
          .listRowBackground(Ink.groupedRow)
          Section("Run history") {
            RunHistory(runs: model.stored(store)?.runs ?? [])
          }
          .listRowBackground(Ink.groupedRow)
          Section {
            Button(role: .destructive) {
              Haptics.tap()
              deleting = true
              holding = nil
              model.delete(store: store)
              dismiss()
            } label: {
              Text("Delete").frame(maxWidth: .infinity)
            }
          }
          .listRowBackground(Ink.groupedRow)
        }
        .groupedGround()
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: model.historyRequests) { _, _ in
          // Test run: Run history comes into view, at its newest run.
          withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(model.stored(store)?.runs.first?.id ?? emptyHistoryId, anchor: .center) }
        }
      }
      .navigationTitle("Routine")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) { CloseButton() }
        ToolbarItem(placement: .trailingBar) {
          Button(running ? "Running\u{2026}" : "Test run") {
            Haptics.tap()
            model.testRun(store: store, runs: runs)
          }
          .disabled(model.routineId == nil || running)
        }
      }
      // A row's fields, pushed: going back keeps the row if it is right and puts it back if not.
      .navigationDestination(item: Binding(get: { model.openRow }, set: { next in
        if next == nil { model.closeRow(store: store) } else { model.openRow = next }
      })) { index in
        TriggerPage(model: model, index: index)
      }
      .sheet(isPresented: $adding, onDismiss: addClosed) {
        AddTriggerSheet(title: RoutineWords.addLabel(rows: model.rows.count)) { picked = $0 }
          .presentationDetents([.medium, .large])
          .presentationBackground(Ink.groupedGround)
      }
    }
    .presentationBackground(Ink.groupedGround)
    .onChange(of: focus) { old, new in
      guard !deleting else { return }
      holding = new
      if old == .name && new != .name { model.nameDone(store: store) }
      if old == .prompt && new != .prompt { model.promptDone(store: store) }
    }
    .task {
      model.follow(model.stored(store))
      // Only a new routine's name takes the keys.
      guard model.isNew && model.routineId == nil else { return }
      try? await Task.sleep(for: .milliseconds(450))
      focus = .name
    }
    .onChange(of: store.routinesByAgent[model.agentId]) { _, list in
      guard let id = model.routineId, let list else { return }
      // The routine is gone (deleted elsewhere): back to the list.
      if let routine = list.first(where: { $0.id == id }) { model.follow(routine) } else { dismiss() }
    }
    .onChange(of: model.addMenuRequests) { _, _ in
      // The only row removed: the Add sheet opens by itself, once a page it was removed from has gone.
      Task {
        try? await Task.sleep(for: .milliseconds(450))
        if !adding { adding = true }
      }
    }
    .onChange(of: model.routineId) { old, new in if old == nil && new != nil { Haptics.success() } }
    .onChange(of: model.saveFailed) { _, failed in if failed { Haptics.warning() } }
    .onDisappear {
      // Closed while a field held the keys: saved as letting go would.
      if holding == .name { model.nameDone(store: store) }
      if holding == .prompt { model.promptDone(store: store) }
      holding = nil
    }
  }

  private func open(_ index: Int) {
    focus = nil
    model.openRow = index
  }

  private func remove(_ index: Int) {
    Haptics.tap()
    model.remove(index, store: store)
  }

  /** The Add sheet went: its pick added (its page opening for those that open one), or with none the rows kept or put back. */
  private func addClosed() {
    guard let pick = picked else {
      model.addMenuClosed(picked: false, store: store)
      return
    }
    picked = nil
    switch pick {
    case .schedule(let line, let opens): model.addSchedule(line, opens: opens, store: store)
    case .source(let platform): model.addSource(platform, store: store)
    }
    model.addMenuClosed(picked: true, store: store)
    Haptics.tap()
  }
}

// MARK: - Rows and signs

/** A trigger's row (the Mac's `TriggerRowView`): its sign, and its sentence, the first word in the text's colour and the rest grey. */
private struct TriggerRowLabel: View {
  let row: TriggerRow

  var body: some View {
    let words = row.words
    HStack(spacing: 10) {
      TriggerSign(platform: row.platform, size: 20)
      Text("\(Text(words.lead).foregroundStyle(Ink.primary)) \(Text(words.rest).foregroundStyle(Ink.secondary))")
        .font(.system(size: 16))
        .lineLimit(2)
        .multilineTextAlignment(.leading)
    }
    .accessibilityElement(children: .combine)
  }
}

/** A trigger's sign (the Mac's `TriggerGlyph`): the clock for a schedule, PagerDuty's mark in its green, else the source's logo. */
private struct TriggerSign: View {
  let platform: String
  let size: CGFloat

  var body: some View {
    switch platform {
    case "schedule":
      ClockGlyph()
        .stroke(Ink.primary, style: StrokeStyle(lineWidth: 1.6 * size * 0.8 / 24, lineCap: .round, lineJoin: .round))
        .frame(width: size * 0.8, height: size * 0.8)
        .frame(width: size, height: size)
    case "pagerduty":
      PagerDutyMark()
        .fill(Color(RGB(hex: "#06ac38")))
        .frame(width: size, height: size)
    default:
      let asset = platform == "microsoftTeams" ? "microsoft-teams" : platform
      if UIImage(named: "Connectors/\(asset)") != nil {
        ConnectLogo(app: asset).frame(width: size, height: size)
      } else {
        Image(systemName: "bolt").font(.system(size: size * 0.8)).foregroundStyle(Ink.secondary).frame(width: size, height: size)
      }
    }
  }
}

/** The clock (`<circle r=8.2>`, `M12 7.4V12l3.1 2`) on a 24-point view. */
private struct ClockGlyph: Shape {
  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 24
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    var path = Path()
    path.addEllipse(in: CGRect(x: rect.minX + 3.8 * k, y: rect.minY + 3.8 * k, width: 16.4 * k, height: 16.4 * k))
    path.move(to: p(12, 7.4))
    path.addLine(to: p(12, 12))
    path.addLine(to: p(15.1, 14))
    return path
  }
}

/** PagerDuty's mark (the window's `xZe`, moved 2.23 left) on a 24-point view. */
private struct PagerDutyMark: Shape {
  func path(in rect: CGRect) -> Path {
    let k = min(rect.width, rect.height) / 24
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
    var path = Path()
    path.move(to: p(13.36, 0))
    path.addLine(to: p(3.42, 0))
    path.addLine(to: p(3.42, 16.08))
    path.addLine(to: p(6.98, 16.08))
    path.addLine(to: p(6.98, 3.39))
    path.addLine(to: p(13.10, 3.39))
    path.addCurve(to: p(17.33, 7.25), control1: p(15.47, 3.39), control2: p(17.33, 4.67))
    path.addCurve(to: p(13.10, 11.22), control1: p(17.33, 9.72), control2: p(15.66, 11.22))
    path.addLine(to: p(9.87, 11.22))
    path.addLine(to: p(9.87, 14.43))
    path.addLine(to: p(13.43, 14.43))
    path.addCurve(to: p(20.58, 7.33), control1: p(17.92, 14.43), control2: p(20.58, 11.5))
    path.addCurve(to: p(13.36, 0), control1: p(20.58, 2.97), control2: p(18.05, 0))
    path.closeSubpath()
    path.addRect(CGRect(x: rect.minX + 3.42 * k, y: rect.minY + 20.4 * k, width: 3.56 * k, height: 3.6 * k))
    return path
  }
}

extension Ink {
  /** A routine at rest and a run that went well (the Mac's `--sand-text-success`). */
  static let routineGreen = Color.dynamic(light: "#009957", dark: "#38d591")
}

// MARK: - Run history

/** "No runs yet"'s place, for Test run to bring it into view. */
private let emptyHistoryId = "routine-history"

/**
 * Run history (the Mac's `J2n`): every run the record carries, newest first:
 * when it began ("Just now", "4 min ago", "Yesterday at 5:08 PM", again
 * every 30 seconds), its detail or event under it, and its sign (✓ green,
 * × red, a spinner while it runs). "No runs yet" when there are none.
 */
private struct RunHistory: View {
  let runs: [RoutineRun]

  var body: some View {
    if runs.isEmpty {
      Text("No runs yet").font(.system(size: 15)).foregroundStyle(Ink.tertiary).id(emptyHistoryId)
    } else {
      ForEach(runs) { run in
        HStack(spacing: 10) {
          VStack(alignment: .leading, spacing: 2) {
            TimelineView(.periodic(from: .now, by: 30)) { context in
              Text(run.startedAt.map { RoutineSchedule.when($0, now: context.date.timeIntervalSince1970 * 1000, zone: .current) } ?? "")
                .font(.system(size: 15))
                .foregroundStyle(Ink.primary)
                .lineLimit(1)
            }
            if !run.summary.isEmpty {
              Text(run.summary).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(3)
            }
          }
          Spacer(minLength: 8)
          RunSign(status: run.status)
        }
        .accessibilityElement(children: .combine)
      }
    }
  }
}

/** A run's sign: the spinner while it runs, ✓ when it went well, × when it failed. */
private struct RunSign: View {
  let status: String

  var body: some View {
    Group {
      switch status {
      case "running":
        ProgressView().controlSize(.small).tint(Ink.link)
      case "ok":
        Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.routineGreen)
      default:
        Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Ink.danger)
      }
    }
    .frame(width: 22, height: 22)
    .accessibilityLabel(RoutineWords.runStatus(status))
  }
}

// MARK: - Add trigger

/** What the Add sheet picked. */
private enum AddPick: Equatable {
  case schedule(line: String, opens: Bool)
  case source(String)
}

/**
 * Add trigger / Add another (the Mac's "Trigger source" menu,
 * `RoutineMenus.add`), as a sheet: On a schedule › its cadences (Every day
 * and Weekdays › the 96 quarter hours), then Slack message, Git event,
 * Teams message, Linear issue, Sentry alert and PagerDuty incident with
 * their logos. A pick adds the row; closing with none keeps the rows that
 * are right and puts back the rest.
 */
private struct AddTriggerSheet: View {
  let title: String
  let pick: (AddPick) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section {
          NavigationLink { cadences } label: { source("schedule", TriggerRow.sourceLabel("schedule")) }
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          ForEach(TriggerRow.sources, id: \.platform) { source in
            Button { choose(.source(source.platform)) } label: { self.source(source.platform, source.label) }
          }
        }
        .listRowBackground(Ink.groupedRow)
      }
      .groupedGround()
      .navigationTitle(title)
      .inlineBarTitle()
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
    }
  }

  private func source(_ platform: String, _ label: String) -> some View {
    HStack(spacing: 12) {
      TriggerSign(platform: platform, size: 22)
      Text(label).font(.system(size: 17)).foregroundStyle(Ink.primary)
    }
  }

  /** Cadence: Every hour, Every day ›, Weekdays ›, Every week, Every month, Interval, Advanced…. */
  private var cadences: some View {
    List {
      ForEach(TriggerRow.cadences, id: \.label) { cadence in
        if let days = cadence.days {
          NavigationLink { times(cadence.label, days: days) } label: {
            Text(cadence.label).font(.system(size: 17)).foregroundStyle(Ink.primary)
          }
        } else if let line = cadence.line {
          Button { choose(.schedule(line: line, opens: cadence.opens)) } label: {
            Text(cadence.label).font(.system(size: 17)).foregroundStyle(Ink.primary)
          }
        }
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle(TriggerRow.sourceLabel("schedule"))
    .inlineBarTitle()
  }

  /** Time: the 96 quarter hours, "12:00 AM" to "11:45 PM". */
  private func times(_ title: String, days: String) -> some View {
    List(RoutineSchedule.quarterHours, id: \.self) { time in
      Button { choose(.schedule(line: TriggerRow.timeLine(time, days: days), opens: false)) } label: {
        Text(RoutineSchedule.clock(time.hour, time.minute)).font(.system(size: 17)).foregroundStyle(Ink.primary)
      }
      .listRowBackground(Ink.groupedRow)
    }
    .groupedGround()
    .navigationTitle(title)
    .inlineBarTitle()
  }

  private func choose(_ next: AddPick) {
    pick(next)
    dismiss()
  }
}

// MARK: - A trigger's page

/** The page's row, changed (typing: shown, not saved), picked (saved now) or committed as it is (a field letting go of the keys). */
@MainActor
private struct RowEdit {
  let model: RoutineEditing
  let index: Int
  let store: AppStore

  var current: TriggerRow? { model.rows.indices.contains(index) ? model.rows[index] : nil }
  func change(_ row: TriggerRow) { model.set(index, row, commits: false, store: store) }
  func pick(_ row: TriggerRow) {
    Haptics.select()
    model.set(index, row, commits: true, store: store)
  }
  func commit() { model.commit(model.rows, store: store) }
}

/**
 * A trigger's fields (the Mac's popover, `TriggerPopover`), as a page pushed
 * from its row: the row's sentence as it reads now, then its fields, each
 * line a sentence of words and pills; then Remove trigger. A pick saves at
 * once; a field saves when it lets go of the keys (Done does that); going
 * back keeps the row if it is right and puts it back if it is not.
 */
private struct TriggerPage: View {
  let model: RoutineEditing
  let index: Int
  @Environment(AppStore.self) private var store

  var body: some View {
    let row = model.rows.indices.contains(index) ? model.rows[index] : nil
    let edit = RowEdit(model: model, index: index, store: store)
    Form {
      if let row {
        Section {
          TriggerRowLabel(row: row)
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          VStack(alignment: .leading, spacing: 14) {
            fields(row, edit: edit)
          }
          .padding(.vertical, 6)
        }
        .listRowBackground(Ink.groupedRow)
        Section {
          Button(role: .destructive) {
            Haptics.tap()
            model.remove(index, store: store)
          } label: {
            Text("Remove trigger").frame(maxWidth: .infinity)
          }
        }
        .listRowBackground(Ink.groupedRow)
      }
    }
    .groupedGround()
    .scrollDismissesKeyboard(.interactively)
    .navigationTitle(row.map { TriggerRow.sourceLabel($0.platform) } ?? "")
    .inlineBarTitle()
    // Each row's fields start afresh.
    .id(index)
  }

  @ViewBuilder
  private func fields(_ row: TriggerRow, edit: RowEdit) -> some View {
    switch row {
    case .schedule(let text):
      ScheduleFields(text: text, edit: edit)
    case .slack(let channel, let match, let keyword, let emoji, let bySelf):
      SlackFields(channel: channel, match: match, keyword: keyword, emoji: emoji, bySelf: bySelf, edit: edit)
    case .github(let repo, let events, let allowlist, let branch):
      GitFields(repo: repo, events: events, allowlist: allowlist, branch: branch, edit: edit)
    case .teams(let tenant, let teams, let channels, let contains, let isRegex, let linkedOnly):
      TeamsFields(tenant: tenant, teams: teams, channels: channels, contains: contains, isRegex: isRegex, linkedOnly: linkedOnly, edit: edit)
    case .linear(let event, let statuses, let cycles, let projects, let teams):
      LinearFields(event: event, statuses: statuses, cycles: cycles, projects: projects, teams: teams, edit: edit)
    case .sentry(let event, let projects):
      TriggerFlow {
        TriggerChoice(label: "Sentry event", options: RoutineWords.sentryEvents, value: event) { edit.pick(.sentry(event: $0, projectIds: projects)) }
      }
      TriggerFlow {
        TriggerWord("in")
        TriggerField(label: "Project IDs", placeholder: "All projects", value: projects) { edit.change(.sentry(event: event, projectIds: $0)) } commit: { edit.commit() }
      }
    case .pagerduty(let event, let services):
      TriggerFlow {
        TriggerChoice(label: "PagerDuty event", options: RoutineWords.pagerdutyEvents, value: event) { edit.pick(.pagerduty(event: $0, serviceIds: services)) }
      }
      TriggerFlow {
        TriggerWord("on")
        TriggerField(label: "Service IDs", placeholder: "All services", value: services) { edit.change(.pagerduty(event: event, serviceIds: $0)) } commit: { edit.commit() }
      }
    }
  }
}

// MARK: Schedule (`Ugn`, `$gn`)

/**
 * A schedule's fields: Frequency and the controls that follow it on its
 * line; Advanced's grid under it; Custom's line field. Each control saves at
 * once. Custom only shows the field; Advanced shows the grid of the current
 * schedule and saves when a part of it changes; another frequency saves its
 * start (keeping the time, and the day where it has one), unless the
 * schedule had no shape, when its controls show and wait for a change.
 */
private struct ScheduleFields: View {
  let text: String
  let edit: RowEdit
  /** Custom or Advanced chosen (`d`), and a shape shown but not saved yet (`f`). */
  @State private var chosen: String?
  @State private var pending: RoutineSchedule.Shape? = nil

  init(text: String, edit: RowEdit) {
    self.text = text
    self.edit = edit
    _chosen = State(initialValue: RoutineSchedule.shape(text) == nil ? "custom" : nil)
  }

  var body: some View {
    let shape = pending ?? RoutineSchedule.shape(text)
    let mode = Self.mode(chosen: chosen, pending: pending, shape: shape)
    TriggerFlow {
      TriggerChoice(label: "Frequency", options: RoutineSchedule.frequencies, value: mode) { next in
        pick(next, mode: mode, shape: shape)
      }
      if let shape, shape.mode == mode {
        inline(shape)
      }
    }
    if mode == "advanced", let shape {
      AdvancedGrid(shape: RoutineSchedule.advanced(from: shape)) { save($0) }
    }
    if mode == "custom" {
      CustomScheduleField(text: text) { typed in
        edit.change(.schedule(typed))
      } done: { typed in
        if RoutineSchedule.isValid(typed) { edit.pick(.schedule(RoutineSchedule.normalized(typed))) }
      }
    }
  }

  /** The Frequency shown (`k`). */
  private static func mode(chosen: String?, pending: RoutineSchedule.Shape?, shape: RoutineSchedule.Shape?) -> String {
    if let pending { return pending.mode }
    guard chosen != "custom", let shape else { return "custom" }
    return chosen == "advanced" ? "advanced" : shape.mode
  }

  /** A shape saved (`b`). */
  private func save(_ shape: RoutineSchedule.Shape) {
    pending = nil
    edit.pick(.schedule(RoutineSchedule.line(shape)))
  }

  /** Frequency picked (`N`). */
  private func pick(_ next: String, mode: String, shape: RoutineSchedule.Shape?) {
    guard next != mode else { return }
    switch next {
    case "custom":
      pending = nil
      chosen = "custom"
    case "advanced":
      chosen = "advanced"
      if shape == nil || pending != nil { pending = RoutineSchedule.advanced(from: pending) }
    default:
      chosen = nil
      if shape == nil || pending != nil {
        pending = RoutineSchedule.start(next, from: pending)
      } else {
        save(RoutineSchedule.start(next, from: shape))
      }
    }
  }

  @ViewBuilder
  private func inline(_ shape: RoutineSchedule.Shape) -> some View {
    switch shape {
    case .hourly(let minute):
      TriggerWord("at")
      TriggerChoice(label: "Minute", options: RoutineSchedule.minuteChoices(minute).map { (value: $0, label: ":" + String(format: "%02d", $0)) }, value: minute) {
        save(.hourly(minute: $0))
      }
    case .daily(let time):
      TriggerWord("at")
      TimeChoice(time: time) { save(.daily($0)) }
    case .weekdays(let time):
      TriggerWord("at")
      TimeChoice(time: time) { save(.weekdays($0)) }
    case .weekly(let day, let time):
      TriggerWord("on")
      TriggerChoice(label: "Day of week", options: RoutineWords.weekOrder.map { (value: $0, label: RoutineSchedule.weekdays[$0]) }, value: day) {
        save(.weekly(dayOfWeek: $0, time))
      }
      TriggerWord("at")
      TimeChoice(time: time) { save(.weekly(dayOfWeek: day, $0)) }
    case .monthly(let day, let time):
      TriggerWord("on the")
      TriggerChoice(label: "Day of month", options: (1...31).map { (value: $0, label: RoutineSchedule.ordinal($0)) }, value: day) {
        save(.monthly(dayOfMonth: $0, time))
      }
      TriggerWord("at")
      TimeChoice(time: time) { save(.monthly(dayOfMonth: day, $0)) }
    case .interval(let amount, let unit):
      TriggerWord("every")
      TriggerChoice(label: "Interval amount", options: RoutineSchedule.intervalChoices(unit, current: amount).map { (value: $0, label: String($0)) }, value: amount) {
        save(.interval(amount: $0, unit: unit))
      }
      TriggerChoice(label: "Interval unit", options: RoutineWords.units.map { (value: $0, label: $0) }, value: unit) { next in
        save(.interval(amount: Self.amount(amount, for: next), unit: next))
      }
    case .advanced:
      EmptyView()
    }
  }

  /** An interval's amount when its unit changes: kept if the new unit offers it, else that unit's own (`vmt`). */
  static func amount(_ amount: Int, for unit: String) -> Int {
    RoutineSchedule.intervalChoices(unit, current: -1).contains(amount) ? amount : (RoutineSchedule.intervalFallback[unit] ?? 1)
  }
}

/**
 * Advanced (`$gn`): three lines, each a grey label and its controls: Months
 * (Any month, or the months ticked); Days (every day, days of the week, days
 * of the month, with their ticks); Time (at times, up to eight, or every so
 * many minutes or hours between two hours).
 */
private struct AdvancedGrid: View {
  let shape: RoutineSchedule.Shape
  let save: (RoutineSchedule.Shape) -> Void

  var body: some View {
    if case .advanced(let months, let days, let time) = shape {
      VStack(alignment: .leading, spacing: 12) {
        GridLine(label: "Months") {
          TickPill(text: RoutineWords.monthsLabel(months), label: "Months") {
            TickSheet(title: "Months", none: "Any month", sections: [TickSection(title: nil, items: RoutineSchedule.months.enumerated().map { (value: $0.offset + 1, label: $0.element) })], ticked: months ?? []) { tapped, current in
              guard let tapped else {
                save(.advanced(months: nil, days: days, time: time))
                return []
              }
              let next = RoutineWords.toggled(current, tapped)
              save(.advanced(months: next.isEmpty ? nil : next, days: days, time: time))
              return next
            } enabled: { _, _ in true }
          }
        }
        GridLine(label: "Days") {
          TriggerChoice(label: "Days", options: RoutineWords.dayKinds, value: Self.kind(days)) { kind in
            guard kind != Self.kind(days) else { return }
            let next: RoutineSchedule.Days = kind == "every-day" ? .everyDay : kind == "days-of-week" ? .daysOfWeek([1]) : .daysOfMonth([1])
            save(.advanced(months: months, days: next, time: time))
          }
          if case .daysOfWeek(let list) = days {
            TickPill(text: RoutineWords.weekdaysLabel(list), label: "Days of the week") {
              dayTicks("Days of the week", RoutineWords.weekOrder.map { (value: $0, label: RoutineSchedule.weekdays[$0]) }, picked: list) {
                save(.advanced(months: months, days: .daysOfWeek($0), time: time))
              }
            }
          }
          if case .daysOfMonth(let list) = days {
            TickPill(text: RoutineWords.monthDaysLabel(list), label: "Days of the month") {
              dayTicks("Days of the month", (1...31).map { (value: $0, label: RoutineSchedule.ordinal($0)) }, picked: list) {
                save(.advanced(months: months, days: .daysOfMonth($0), time: time))
              }
            }
          }
        }
        GridLine(label: "Time") {
          TriggerChoice(label: "Time mode", options: RoutineWords.timeKinds, value: Self.kind(time)) { kind in
            guard kind != Self.kind(time) else { return }
            let next: RoutineSchedule.TimeOfDay = kind == "at-times" ? .atTimes(minute: 0, hours: [8]) : .interval(unit: "minutes", amount: 30, fromHour: 0, toHour: 23)
            save(.advanced(months: months, days: days, time: next))
          }
          timeControls(time) { save(.advanced(months: months, days: days, time: $0)) }
        }
      }
    }
  }

  /** Days of the week or of the month (`MUe`): each tick saves; the last one ticked cannot be unticked. */
  private func dayTicks(_ title: String, _ entries: [(value: Int, label: String)], picked: [Int], change: @escaping ([Int]) -> Void) -> TickSheet<Int> {
    TickSheet(title: title, sections: [TickSection(title: nil, items: entries)], ticked: picked) { tapped, current in
      guard let tapped else { return nil }
      let next = RoutineWords.toggled(current, tapped)
      guard !next.isEmpty else { return nil }
      change(next)
      return next
    } enabled: { value, current in
      !(current.count == 1 && current.contains(value))
    }
  }

  private static func kind(_ days: RoutineSchedule.Days) -> String {
    switch days {
    case .everyDay: return "every-day"
    case .daysOfWeek: return "days-of-week"
    case .daysOfMonth: return "days-of-month"
    }
  }

  private static func kind(_ time: RoutineSchedule.TimeOfDay) -> String {
    if case .atTimes = time { return "at-times" }
    return "interval"
  }

  @ViewBuilder
  private func timeControls(_ time: RoutineSchedule.TimeOfDay, change: @escaping (RoutineSchedule.TimeOfDay) -> Void) -> some View {
    switch time {
    case .atTimes(let minute, let hours):
      // `Fgn`: the first time, then each other hour at the same minute with its ×, then Add time (fewer than eight).
      let first = hours.first ?? 0
      let rest = Array(hours.dropFirst())
      TimeChoice(time: RoutineSchedule.Time(hour: first, minute: minute)) { picked in
        change(.atTimes(minute: picked.minute, hours: [picked.hour] + rest.filter { $0 != picked.hour }))
      }
      ForEach(Array(rest.enumerated()), id: \.element) { offset, hour in
        HStack(spacing: 2) {
          TriggerChoice(label: "Time \(offset + 2)", options: (0..<24).map { (value: $0, label: RoutineSchedule.clock($0, minute)) }, disabled: Set(hours.filter { $0 != hour }), value: hour) { next in
            var list = hours
            list[offset + 1] = next
            change(.atTimes(minute: minute, hours: list))
          }
          Button {
            change(.atTimes(minute: minute, hours: hours.filter { $0 != hour }))
          } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Ink.secondary)
              .frame(width: 28, height: 32)
              .contentShape(.rect)
          }
          .buttonStyle(.borderless)
          .accessibilityLabel("Remove \(RoutineSchedule.clock(hour, minute))")
        }
      }
      if hours.count < 8 {
        Button {
          if let next = RoutineWords.nextHour(after: first, taken: hours) { change(.atTimes(minute: minute, hours: hours + [next])) }
        } label: {
          Label("Add time", systemImage: "plus").font(.system(size: 15)).foregroundStyle(Ink.blue)
            .frame(height: 32)
        }
        .buttonStyle(.borderless)
      }
    case .interval(let unit, let amount, let from, let to):
      // `zgn`: so many minutes or hours, between two hours.
      TriggerChoice(label: "Interval amount", options: RoutineSchedule.intervalChoices(unit, current: amount).map { (value: $0, label: String($0)) }, value: amount) {
        change(.interval(unit: unit, amount: $0, fromHour: from, toHour: to))
      }
      TriggerChoice(label: "Interval unit", options: RoutineWords.windowUnits.map { (value: $0, label: $0) }, value: unit) { next in
        change(.interval(unit: next, amount: ScheduleFields.amount(amount, for: next), fromHour: from, toHour: to))
      }
      TriggerWord("between")
      TriggerChoice(label: "From hour", options: (0..<24).map { (value: $0, label: RoutineSchedule.clock($0, 0)) }, value: from) {
        change(.interval(unit: unit, amount: amount, fromHour: $0, toHour: max(to, $0)))
      }
      TriggerWord("and")
      TriggerChoice(label: "To hour", options: (from..<24).map { (value: $0, label: RoutineSchedule.clock($0, 0)) }, value: to) {
        change(.interval(unit: unit, amount: amount, fromHour: from, toHour: $0))
      }
    }
  }
}

/** One of Advanced's lines: its label and its controls wrapping beside it. */
private struct GridLine<Content: View>: View {
  let label: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Text(label)
        .font(.system(size: 15))
        .foregroundStyle(Ink.secondary)
        .frame(width: 62, alignment: .leading)
        .frame(minHeight: 32)
      TriggerFlow { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/**
 * Custom's line (`Schedule`): the raw line ("@every 30m", a cron line, an
 * alias, `CRON_TZ=…`), full width. Typing shows it in the row; letting go of
 * the keys saves it when the host can run it, else it stays a draft (going
 * back then puts the last good one back).
 */
private struct CustomScheduleField: View {
  let text: String
  let change: (String) -> Void
  let done: (String) -> Void
  @FocusState private var focused: Bool

  var body: some View {
    TextField("", text: Binding(get: { text }, set: { change($0) }))
      .font(.system(size: 15, design: .monospaced))
      .foregroundStyle(Ink.primary)
      .focused($focused)
      .autocorrectionDisabled()
      .typedAsIs()
      .submitLabel(.done)
      .onSubmit { focused = false }
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: 40)
      .background(Ink.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Ink.edge, lineWidth: 1).allowsHitTesting(false))
      .onChange(of: focused) { _, now in if !now { done(text) } }
      .accessibilityLabel("Schedule")
  }
}

// MARK: Events (`r2n`, `o2n`, `c2n`, `u2n`)

/** Slack: the event, "in", #channel; "containing" Any text (a word makes it a keyword match), or "with emoji" and "from". Right once it has a channel. */
private struct SlackFields: View {
  let channel: String
  let match: String
  let keyword: String
  let emoji: String
  let bySelf: Bool
  let edit: RowEdit

  var body: some View {
    // A keyword match is still "New messages" in the menu (`n2n`).
    let event = match == "keyword" ? "message" : match
    TriggerFlow {
      TriggerChoice(label: "Slack event", options: RoutineWords.slackEvents, value: event, text: RoutineWords.slackButton[event] ?? "New messages") { picked in
        guard picked != event, case .slack(let c, _, let k, let e, let b)? = edit.current else { return }
        edit.pick(.slack(channel: c, match: Self.match(picked, keyword: k), keyword: k, emoji: e, bySelf: b))
      }
      TriggerWord("in")
      TriggerField(label: "Slack channel", placeholder: "#channel", value: channel, autofocus: channel.trimmingCharacters(in: .whitespaces).isEmpty) {
        edit.change(.slack(channel: $0, match: match, keyword: keyword, emoji: emoji, bySelf: bySelf))
      } commit: { edit.commit() }
    }
    if event == "message" {
      TriggerFlow {
        TriggerWord("containing")
        TriggerField(label: "Message contains", placeholder: "Any text", value: keyword) {
          edit.change(.slack(channel: channel, match: Self.match("message", keyword: $0), keyword: $0, emoji: emoji, bySelf: bySelf))
        } commit: { edit.commit() }
      }
    }
    if event == "reaction" {
      TriggerFlow {
        TriggerWord("with emoji")
        TriggerField(label: "Reaction emoji", placeholder: "Any emoji", value: emoji) {
          edit.change(.slack(channel: channel, match: match, keyword: keyword, emoji: $0, bySelf: bySelf))
        } commit: { edit.commit() }
      }
      TriggerFlow {
        TriggerWord("from")
        TriggerChoice(label: "Reactor", options: RoutineWords.reactors, value: bySelf) {
          edit.pick(.slack(channel: channel, match: match, keyword: keyword, emoji: emoji, bySelf: $0))
        }
      }
    }
  }

  /** New messages with a word typed is a keyword match (`JUe`). */
  static func match(_ event: String, keyword: String) -> String {
    guard event == "message" else { return event }
    return keyword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "message" : "keyword"
  }
}

/** Git: the events (ticks under their headings; each tick saves), "in", owner/repo; "from" for review and PR events, "on branch" for CI. */
private struct GitFields: View {
  let repo: String
  let events: [String]
  let allowlist: String
  let branch: String
  let edit: RowEdit

  var body: some View {
    let ci = events.contains { $0 == "ci-passed" || $0 == "ci-failed" }
    let other = events.contains { $0 != "ci-passed" && $0 != "ci-failed" }
    TriggerFlow {
      TickPill(text: RoutineWords.gitButton(events), label: "Git events") {
        TickSheet(title: "Git events", sections: TriggerRow.gitSections.map { TickSection(title: $0.title, items: $0.events.map { (value: $0.kind, label: $0.label) }) }, ticked: events) { tapped, current in
          guard let tapped, case .github(let r, let list, let a, let b)? = edit.current else { return nil }
          edit.pick(.github(repo: r, events: TriggerRow.toggled(list, tapped), userAllowlist: a, ciBranch: b))
          return TriggerRow.toggled(current, tapped)
        } enabled: { _, _ in true }
      }
      TriggerWord("in")
      TriggerField(label: "Repository", placeholder: "owner/repo", value: repo, autofocus: repo.trimmingCharacters(in: .whitespaces).isEmpty) {
        edit.change(.github(repo: $0, events: events, userAllowlist: allowlist, ciBranch: branch))
      } commit: { edit.commit() }
    }
    if other {
      TriggerFlow {
        TriggerWord("from")
        TriggerField(label: "User allowlist", placeholder: "Anyone", value: allowlist) {
          edit.change(.github(repo: repo, events: events, userAllowlist: $0, ciBranch: branch))
        } commit: { edit.commit() }
      }
    }
    if ci {
      TriggerFlow {
        TriggerWord("on branch")
        TriggerField(label: "CI branch", placeholder: "main", value: branch) {
          edit.change(.github(repo: repo, events: events, userAllowlist: allowlist, ciBranch: $0))
        } commit: { edit.commit() }
      }
    }
  }
}

/** Teams: "New messages" "in" Team IDs; tenant; channels; containing, Text or Regex; from Anyone or Only linked users. Right with a tenant and a team. */
private struct TeamsFields: View {
  let tenant: String
  let teams: String
  let channels: String
  let contains: String
  let isRegex: Bool
  let linkedOnly: Bool
  let edit: RowEdit

  var body: some View {
    TriggerFlow {
      TriggerChoice(label: "Teams event", options: [(value: "message", label: "New message in channel")], value: "message", text: "New messages") { _ in }
      TriggerWord("in")
      TriggerField(label: "Team IDs", placeholder: "Team IDs", value: teams, autofocus: teams.trimmingCharacters(in: .whitespaces).isEmpty) {
        edit.change(row(teams: $0))
      } commit: { edit.commit() }
    }
    TriggerFlow {
      TriggerWord("tenant")
      TriggerField(label: "Tenant ID", placeholder: "Tenant ID", value: tenant) { edit.change(row(tenant: $0)) } commit: { edit.commit() }
    }
    TriggerFlow {
      TriggerWord("channels")
      TriggerField(label: "Channel IDs", placeholder: "Every channel", value: channels) { edit.change(row(channels: $0)) } commit: { edit.commit() }
    }
    TriggerFlow {
      TriggerWord("containing")
      TriggerField(label: "Message contains", placeholder: "Any message", value: contains) { edit.change(row(contains: $0)) } commit: { edit.commit() }
      TriggerChoice(label: "Message match", options: RoutineWords.teamsMatch, value: isRegex) { edit.pick(row(isRegex: $0)) }
    }
    TriggerFlow {
      TriggerWord("from")
      TriggerChoice(label: "Teams audience", options: RoutineWords.teamsAudience, value: linkedOnly) { edit.pick(row(linkedOnly: $0)) }
    }
  }

  private func row(tenant: String? = nil, teams: String? = nil, channels: String? = nil, contains: String? = nil, isRegex: Bool? = nil, linkedOnly: Bool? = nil) -> TriggerRow {
    .teams(tenantId: tenant ?? self.tenant, teamIds: teams ?? self.teams, channelIds: channels ?? self.channels,
           messageContains: contains ?? self.contains, isRegex: isRegex ?? self.isRegex, linkedOnly: linkedOnly ?? self.linkedOnly)
  }
}

/** Linear: the event alone on its line; "with status" or "cycles" for those events; "in" projects; "for" teams. Always right. */
private struct LinearFields: View {
  let event: String
  let statuses: String
  let cycles: String
  let projects: String
  let teams: String
  let edit: RowEdit

  var body: some View {
    TriggerFlow {
      TriggerChoice(label: "Linear event", options: RoutineWords.linearEvents, value: event) { edit.pick(row(event: $0)) }
    }
    if event == "statusChanged" {
      TriggerFlow {
        TriggerWord("with status")
        TriggerField(label: "Status IDs", placeholder: "Any status", value: statuses) { edit.change(row(statuses: $0)) } commit: { edit.commit() }
      }
    }
    if event == "endOfCycle" {
      TriggerFlow {
        TriggerWord("cycles")
        TriggerField(label: "Cycle IDs", placeholder: "Any cycle", value: cycles) { edit.change(row(cycles: $0)) } commit: { edit.commit() }
      }
    }
    TriggerFlow {
      TriggerWord("in")
      TriggerField(label: "Project IDs", placeholder: "All projects", value: projects) { edit.change(row(projects: $0)) } commit: { edit.commit() }
    }
    TriggerFlow {
      TriggerWord("for")
      TriggerField(label: "Team IDs", placeholder: "All teams", value: teams) { edit.change(row(teams: $0)) } commit: { edit.commit() }
    }
  }

  private func row(event: String? = nil, statuses: String? = nil, cycles: String? = nil, projects: String? = nil, teams: String? = nil) -> TriggerRow {
    .linear(event: event ?? self.event, statusIds: statuses ?? self.statuses, cycleIds: cycles ?? self.cycles, projectIds: projects ?? self.projects, teamIds: teams ?? self.teams)
  }
}

// MARK: - The fields' parts

/** A connecting word ("in", "at", "every"), grey. */
private struct TriggerWord: View {
  let text: String

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text)
      .font(.system(size: 15))
      .foregroundStyle(Ink.secondary)
      .fixedSize()
  }
}

/** A pill's look: its words and a small chevron on the quiet fill, 32 high, round 8. */
private struct PillLabel: View {
  let text: String

  var body: some View {
    HStack(spacing: 4) {
      Text(text)
        .font(.system(size: 15))
        .foregroundStyle(Ink.primary)
        .lineLimit(1)
      Image(systemName: "chevron.up.chevron.down")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(Ink.secondary)
    }
    .padding(.horizontal, 10)
    .frame(height: 32)
    .background(Ink.pillButton, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .contentShape(.rect)
  }
}

/** A choice (the Mac's Select, `ChoicePill`): a tap opens the choices as Apple's menu, the chosen one ticked, in their order. A pick saves. */
private struct TriggerChoice<Value: Hashable>: View {
  let label: String
  let options: [(value: Value, label: String)]
  var disabled: Set<Value> = []
  let value: Value
  /** The pill's own words, when they are not the chosen choice's (Slack's and Teams' events). */
  var text: String? = nil
  let pick: (Value) -> Void

  var body: some View {
    let shown = text ?? options.first { $0.value == value }?.label ?? ""
    Menu {
      ForEach(Array(options.enumerated()), id: \.offset) { _, option in
        Button {
          if option.value != value { pick(option.value) }
        } label: {
          if option.value == value { Label(option.label, systemImage: "checkmark") } else { Text(option.label) }
        }
        .disabled(disabled.contains(option.value))
      }
    } label: {
      PillLabel(text: shown)
    }
    .menuOrder(.fixed)
    .accessibilityLabel(label)
    .accessibilityValue(shown)
  }
}

/** A time of day (`cpe`): the 96 quarter hours and the current time, "9:00 AM". */
private struct TimeChoice: View {
  let time: RoutineSchedule.Time
  let change: (RoutineSchedule.Time) -> Void

  var body: some View {
    let minutes = time.hour * 60 + time.minute
    TriggerChoice(label: "Time", options: RoutineSchedule.timeChoices(minutes).map { (value: $0, label: RoutineSchedule.clock($0 / 60, $0 % 60)) }, value: minutes) {
      change(RoutineSchedule.Time(hour: $0 / 60, minute: $0 % 60))
    }
  }
}

/** A pill that opens a list of ticks (Months, the days, the Git events: the Mac's menus that stay open while ticking). */
private struct TickPill<Sheet: View>: View {
  let text: String
  let label: String
  @ViewBuilder let sheet: () -> Sheet
  @State private var showing = false

  var body: some View {
    Button { showing = true } label: { PillLabel(text: text) }
      .buttonStyle(.borderless)
      .accessibilityLabel(label)
      .accessibilityValue(text)
      .sheet(isPresented: $showing) {
        sheet()
          .presentationDetents([.medium, .large])
          .presentationBackground(Ink.groupedGround)
      }
  }
}

/** A heading's ticks in a `TickSheet`. */
private struct TickSection<Value: Hashable> {
  let title: String?
  let items: [(value: Value, label: String)]
}

/**
 * Ticks in a sheet (the Mac's menus of ticks, which stay open while ticked):
 * each tick saves at once; Done closes it. `none` is the row above the rest
 * that stands for none ticked ("Any month"). The sheet keeps what is ticked
 * while it is open, as the Mac's menu does.
 */
private struct TickSheet<Value: Hashable>: View {
  let title: String
  var none: String? = nil
  let sections: [TickSection<Value>]
  @State private var ticked: [Value]
  /** A tap (nil for `none`): what is ticked after it, or nil when it changes nothing. It saves. */
  let tap: (Value?, [Value]) -> [Value]?
  /** Whether a row can be tapped now (the last day ticked cannot). */
  let enabled: (Value, [Value]) -> Bool
  @Environment(\.dismiss) private var dismiss

  init(title: String, none: String? = nil, sections: [TickSection<Value>], ticked: [Value], tap: @escaping (Value?, [Value]) -> [Value]?, enabled: @escaping (Value, [Value]) -> Bool) {
    self.title = title
    self.none = none
    self.sections = sections
    _ticked = State(initialValue: ticked)
    self.tap = tap
    self.enabled = enabled
  }

  var body: some View {
    NavigationStack {
      List {
        if let none {
          Section {
            row(none, on: ticked.isEmpty) { tapped(nil) }
              .disabled(ticked.isEmpty)
          }
          .listRowBackground(Ink.groupedRow)
        }
        ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
          Section {
            ForEach(Array(section.items.enumerated()), id: \.offset) { _, item in
              row(item.label, on: ticked.contains(item.value)) { tapped(item.value) }
                .disabled(!enabled(item.value, ticked))
            }
          } header: {
            if let heading = section.title { Text(heading) }
          }
          .listRowBackground(Ink.groupedRow)
        }
      }
      .groupedGround()
      .navigationTitle(title)
      .inlineBarTitle()
      .toolbar { ToolbarItem(placement: .trailingBar) { Button("Done") { dismiss() } } }
    }
  }

  private func row(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        Text(label).font(.system(size: 17)).foregroundStyle(Ink.primary)
        Spacer()
        if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Ink.blue) }
      }
      .contentShape(.rect)
    }
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  private func tapped(_ value: Value?) {
    guard let next = tap(value, ticked) else { return }
    Haptics.select()
    ticked = next
  }
}

/**
 * A field in a pill (`ql`): at least 72 wide and growing with its words up
 * to the line. Typing shows in the row's sentence at once; letting go of the
 * keys saves, and Done lets go.
 */
private struct TriggerField: View {
  let label: String
  let placeholder: String
  let value: String
  var autofocus = false
  let change: (String) -> Void
  let commit: () -> Void
  @FocusState private var focused: Bool

  var body: some View {
    let shown = value.isEmpty ? placeholder : value
    let words = ceil((shown as NSString).size(withAttributes: [.font: UIFont.systemFont(ofSize: 15)]).width)
    TextField("", text: Binding(get: { value }, set: { change($0) }), prompt: Text(placeholder).foregroundStyle(Ink.tertiary))
      .font(.system(size: 15))
      .foregroundStyle(Ink.primary)
      .focused($focused)
      .autocorrectionDisabled()
      .typedAsIs()
      .submitLabel(.done)
      .onSubmit { focused = false }
      .padding(.horizontal, 10)
      .frame(minWidth: 72, maxWidth: max(72, words + 22))
      .frame(height: 32)
      .background(Ink.pillButton, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .onChange(of: focused) { _, now in if !now { commit() } }
      .task {
        guard autofocus else { return }
        // Once the page has slid in.
        try? await Task.sleep(for: .milliseconds(500))
        focused = true
      }
      .accessibilityLabel(label)
  }
}

/** A line of a trigger's fields: its parts 6 apart, wrapping 8 under when the line is full, each line's parts centred on it. */
private struct TriggerFlow: Layout {
  var spacing: CGFloat = 6
  var lineSpacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    let lines = arrange(width: width, subviews: subviews)
    let height = lines.reduce(0) { $0 + $1.height } + CGFloat(max(0, lines.count - 1)) * lineSpacing
    let used = lines.map(\.width).max() ?? 0
    return CGSize(width: proposal.width ?? used, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for line in arrange(width: bounds.width, subviews: subviews) {
      var x = bounds.minX
      for item in line.items {
        subviews[item.index].place(at: CGPoint(x: x, y: y + (line.height - item.size.height) / 2), proposal: ProposedViewSize(item.size))
        x += item.size.width + spacing
      }
      y += line.height + lineSpacing
    }
  }

  private struct Line {
    var items: [(index: Int, size: CGSize)] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(width: CGFloat, subviews: Subviews) -> [Line] {
    var lines: [Line] = []
    var current = Line()
    for index in subviews.indices {
      var size = subviews[index].sizeThatFits(ProposedViewSize(width: width.isFinite ? width : nil, height: nil))
      if width.isFinite { size.width = min(size.width, width) }
      let next = current.items.isEmpty ? size.width : current.width + spacing + size.width
      if !current.items.isEmpty && next > width {
        lines.append(current)
        current = Line()
      }
      current.width = current.items.isEmpty ? size.width : current.width + spacing + size.width
      current.height = max(current.height, size.height)
      current.items.append((index, size))
    }
    if !current.items.isEmpty { lines.append(current) }
    return lines
  }
}
