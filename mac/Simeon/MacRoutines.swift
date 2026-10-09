import AppKit
import SwiftUI
import SimeonCore

/**
 * The pane's Routines tab (`K2n`): active routines first, each with when it
 * runs or "Paused" and a clock (a spinner while its newest run goes, a
 * pause sign while paused); New Routine above them; with none, the line
 * "Routines are recurring tasks this agent runs on a schedule." and Create
 * Routine. Nothing shows until the list is known.
 */
struct MacRoutineList: View {
  let agentId: String
  let open: (MacNavigation.RoutineTarget) -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    Group {
      if let list = store.routinesByAgent[agentId].map(Routine.listed) {
        if list.isEmpty { empty } else { rows(list) }
      }
    }
    .task(id: agentId) { await store.loadRoutines(agentId) }
  }

  private var empty: some View {
    VStack(spacing: 14) {
      Image(systemName: "clock").font(.system(size: 26))
        .frame(width: 56, height: 56)
        .background(Ink.pill, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
      Text(RoutineDraft.empty)
        .font(.system(size: 15)).foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      Button { open(.draft(UUID())) } label: {
        Text("Create Routine").font(.system(size: 14, weight: .medium))
          .padding(.horizontal, 16).frame(height: 32)
          .foregroundStyle(Ink.ground)
          .background(Ink.primary, in: Capsule())
      }
      .buttonStyle(.plain)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 20)
  }

  private func rows(_ list: [Routine]) -> some View {
    VStack(alignment: .trailing, spacing: 8) {
      Button { open(.draft(UUID())) } label: {
        Label("New Routine", systemImage: "plus").font(.system(size: 14, weight: .medium))
      }
      .buttonStyle(.borderless)
      VStack(spacing: 0) {
        ForEach(list) { routine in
          Button { open(.existing(routine.id)) } label: {
            HStack(spacing: 10) {
              Group {
                if routine.isEnabled && routine.isRunning {
                  ProgressView().controlSize(.small)
                } else {
                  Image(systemName: routine.isEnabled ? "clock" : "pause.circle")
                    .foregroundStyle(routine.isEnabled ? Ink.primary : Ink.secondary)
                }
              }
              .frame(width: 20)
              VStack(alignment: .leading, spacing: 2) {
                Text(routine.name).font(.system(size: 14)).lineLimit(1)
                Text(routine.rowDetail).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
              }
              Spacer(minLength: 0)
            }
            .padding(.vertical, 9)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          if routine.id != list.last?.id { Divider() }
        }
      }
    }
  }
}

/**
 * A routine's editor (`_2n`), in the pane under "Routine" and its back
 * arrow: Active, Delete (no question) and Test run along the top; then
 * Name, Instruction, When to run (its triggers) and Run history. Nothing to
 * save: a field saves as it is left, a trigger as it is set; a new routine
 * is made the moment it has a name, an instruction and a trigger. Only a
 * save that fails says so: "Couldn't save this routine."
 */
struct MacRoutineEditor: View {
  let agentId: String
  let target: MacNavigation.RoutineTarget
  let back: () -> Void
  @Environment(AppStore.self) private var store
  @State private var name = ""
  @State private var prompt = ""
  @State private var rows: [TriggerRow] = []
  /** A new routine's last whole trigger, what it is made with. */
  @State private var lastValid: JSON?
  @State private var draftEnabled = true
  @State private var createdId: String?
  @State private var saveError = false
  @State private var creating = false
  @State private var queued = false
  @State private var deleteWhenMade = false
  @State private var deleting = false
  @State private var enabling = false
  @State private var testing = false
  @State private var held = false
  @State private var panel: Int?
  @State private var hovered: Int?
  @State private var filled = false
  @State private var scrollToHistory = 0
  @FocusState private var focus: Field?

  enum Field { case name, prompt }

  private var routineId: String? {
    if case .existing(let id) = target { return id }
    return createdId
  }

  private var stored: Routine? { routineId.flatMap { id in store.routinesByAgent[agentId]?.first { $0.id == id } } }
  private var isNew: Bool { routineId == nil }
  private var running: Bool { testing || held || stored?.isRunning == true }

  var body: some View {
    VStack(spacing: 0) {
      topBar
      Divider()
      ScrollViewReader { scroller in
        ScrollView {
          VStack(alignment: .leading, spacing: 22) {
            if saveError {
              Text(RoutineDraft.saveError).font(.system(size: 13)).foregroundStyle(Ink.danger)
            }
            section("Name") {
              TextField("Name this routine", text: $name)
                .textFieldStyle(.roundedBorder)
                .focused($focus, equals: .name)
                .accessibilityLabel("Name")
                .onSubmit { focus = nil }
            }
            section("Instruction") {
              TextField("What should this routine do each time it runs?", text: $prompt, axis: .vertical)
                .lineLimit(3...10)
                .textFieldStyle(.roundedBorder)
                .focused($focus, equals: .prompt)
                .accessibilityLabel("Instruction")
            }
            section("When to run") { triggerCard }
            section("Run history") { history }
              .id("history")
          }
          .padding(20)
        }
        .onChange(of: scrollToHistory) { _, _ in withAnimation { scroller.scrollTo("history", anchor: .bottom) } }
      }
    }
    .task {
      if !isNew && stored == nil { await store.loadRoutines(agentId) }
      fill()
      if isNew { focus = .name }
    }
    .onChange(of: focus) { old, _ in
      if old == .name { nameLeft() }
      if old == .prompt { promptLeft() }
    }
  }

  // MARK: The top bar

  private var topBar: some View {
    HStack(spacing: 8) {
      Toggle("Active", isOn: Binding(get: { stored?.isEnabled ?? draftEnabled }, set: { on in setActive(on) }))
        .toggleStyle(.switch)
        .labelsHidden()
        .disabled(enabling)
        .accessibilityLabel("Active")
      Text("Active").font(.system(size: 13))
      Spacer()
      Button("Delete") { delete() }
        .disabled(deleting)
      Button(running ? "Running\u{2026}" : "Test run") { test() }
        .buttonStyle(.borderedProminent)
        .disabled(isNew || running)
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 10)
  }

  private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
      content()
    }
  }

  // MARK: Saving

  private func fill() {
    guard !filled else { return }
    if let stored {
      name = stored.name
      prompt = stored.prompt
      rows = TriggerRow.rows(stored.trigger)
      filled = true
    } else if isNew {
      filled = true
    }
  }

  private func nameLeft() {
    saveError = false
    if let stored {
      let typed = name.trimmingCharacters(in: .whitespacesAndNewlines)
      if typed.isEmpty || typed == stored.name { name = stored.name; return }
      update()
    } else {
      make()
    }
  }

  private func promptLeft() {
    saveError = false
    if let stored {
      let typed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
      if typed.isEmpty || typed == stored.prompt { prompt = stored.prompt; return }
      update()
    } else {
      make()
    }
  }

  /** A trigger set: saved when it is whole and different; a new routine keeps it to be made with. */
  private func commitTrigger() {
    saveError = false
    guard let trigger = TriggerRow.trigger(rows) else { return }
    if let stored {
      if trigger == stored.trigger { return }
      update()
    } else {
      lastValid = trigger
      make()
    }
  }

  private func update() {
    guard let stored else { return }
    let spec = RoutineDraft.updateSpec(stored, name: name, prompt: prompt, trigger: TriggerRow.trigger(rows))
    let agentId = agentId
    Task { if await !store.updateRoutine(agentId, stored.id, spec: spec) { saveError = true } }
  }

  /** A new routine, once it is whole; edits made while it is being made follow it as one change. */
  private func make() {
    guard routineId == nil else { update(); return }
    guard let spec = RoutineDraft.newSpec(name: name, prompt: prompt, trigger: lastValid, isEnabled: draftEnabled) else { return }
    if creating { queued = true; return }
    creating = true
    Task {
      let made = await store.createRoutine(agentId, spec: spec)
      creating = false
      guard let made else { saveError = true; return }
      createdId = made.id
      if deleteWhenMade { await store.removeRoutine(agentId, made.id); return }
      if queued { queued = false; update() }
    }
  }

  private func setActive(_ on: Bool) {
    guard let id = routineId else { draftEnabled = on; return }
    enabling = true
    Task {
      _ = await store.enableRoutine(agentId, id, on)
      enabling = false
    }
  }

  /** Delete: gone at once, back to the list, nothing asked and nothing said if it fails. */
  private func delete() {
    if let id = routineId {
      deleting = true
      Task { await store.removeRoutine(agentId, id) }
    } else if creating {
      deleteWhenMade = true
    }
    back()
  }

  /** Test run: "Running…" until the run is done and 3 s after it, Run history in view. */
  private func test() {
    guard let id = routineId, !running else { return }
    testing = true
    scrollToHistory += 1
    Task {
      await store.testRoutine(agentId, id)
      testing = false
      held = true
      try? await Task.sleep(nanoseconds: 3_000_000_000)
      held = false
    }
  }

  // MARK: When to run

  private var triggerCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      if !rows.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
            triggerRow(row, index: index)
            if index < rows.count - 1 { Divider() }
          }
        }
        .padding(.horizontal, 10)
        .background(Ink.control, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Ink.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Triggers")
      }
      if rows.count < TriggerRow.limit { addMenu }
    }
  }

  private func triggerRow(_ row: TriggerRow, index: Int) -> some View {
    let words = row.words
    return HStack(spacing: 8) {
      Button { panel = index } label: {
        HStack(spacing: 8) {
          Image(systemName: Self.glyph(row.platform)).frame(width: 18).foregroundStyle(.secondary)
          (Text(words.lead) + Text(" " + words.rest).foregroundStyle(.secondary))
            .font(.system(size: 13)).lineLimit(2)
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      Button { remove(index) } label: { Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)) }
        .buttonStyle(.borderless)
        .opacity(hovered == index ? 1 : 0)
        .accessibilityLabel("Remove trigger: \(words.lead) \(words.rest)")
    }
    .frame(minHeight: 32)
    .onHover { inside in hovered = inside ? index : (hovered == index ? nil : hovered) }
    .popover(isPresented: Binding(get: { panel == index }, set: { shown in if !shown && panel == index { panel = nil; panelClosed() } }), arrowEdge: .bottom) {
      MacTriggerFields(row: Binding(get: { rows.indices.contains(index) ? rows[index] : row }, set: { if rows.indices.contains(index) { rows[index] = $0 } }), commit: commitTrigger)
        .padding(16)
        .frame(width: 320)
        .accessibilityLabel("Trigger fields")
    }
  }

  /** The source's glyph in the row. */
  static func glyph(_ platform: String) -> String {
    switch platform {
    case "schedule": return "clock"
    case "slack": return "number"
    case "github": return "arrow.triangle.branch"
    case "microsoftTeams": return "person.2"
    case "linear": return "circle.lefthalf.filled"
    case "sentry": return "exclamationmark.triangle"
    default: return "bell"
    }
  }

  /** The panel closed: a trigger that is whole is kept, else it goes back (the stored one, or the last whole one). */
  private func panelClosed() {
    if TriggerRow.trigger(rows) != nil { commitTrigger(); return }
    rows = stored.map { TriggerRow.rows($0.trigger) } ?? TriggerRow.rows(lastValid)
  }

  /** ✕ on a row: saved at once; the last one only empties the list, the stored trigger kept until a new one is whole. */
  private func remove(_ index: Int) {
    panel = nil
    guard rows.indices.contains(index) else { return }
    if rows.count <= 1 { rows = []; return }
    rows.remove(at: index)
    commitTrigger()
  }

  private var addMenu: some View {
    Menu {
      Menu {
        Button("Every hour") { addSchedule("0 * * * *", panel: false) }
        Menu("Every day") {
          ForEach(RoutineSchedule.quarterHours, id: \.self) { t in
            Button(RoutineSchedule.clock(t.hour, t.minute)) { addSchedule("\(t.minute) \(t.hour) * * *", panel: false) }
          }
        }
        Menu("Weekdays") {
          ForEach(RoutineSchedule.quarterHours, id: \.self) { t in
            Button(RoutineSchedule.clock(t.hour, t.minute)) { addSchedule("\(t.minute) \(t.hour) * * 1-5", panel: false) }
          }
        }
        Button("Every week") { addSchedule(RoutineSchedule.line(RoutineSchedule.start("weekly", from: nil)), panel: true) }
        Button("Every month") { addSchedule(RoutineSchedule.line(RoutineSchedule.start("monthly", from: nil)), panel: true) }
        Button("Interval") { addSchedule(RoutineSchedule.line(RoutineSchedule.start("interval", from: nil)), panel: true) }
        Button("Advanced\u{2026}") { addSchedule(RoutineSchedule.line(RoutineSchedule.advanced(from: nil)), panel: true) }
      } label: {
        Label("On a schedule", systemImage: "clock")
      }
      ForEach(TriggerRow.sources, id: \.platform) { source in
        Button { addSource(source.platform) } label: { Label(source.label, systemImage: Self.glyph(source.platform)) }
      }
    } label: {
      Label(RoutineWords.addLabel(rows: rows.count), systemImage: "plus")
    }
    .menuStyle(.borderlessButton)
    .fixedSize()
    .accessibilityLabel(RoutineWords.addLabel(rows: rows.count))
  }

  private func addSchedule(_ line: String, panel open: Bool) {
    rows.append(.schedule(line))
    commitTrigger()
    if open { panel = rows.count - 1 }
  }

  /** An event source: saved only when its first fields are already whole (Linear, Sentry, PagerDuty); its fields open. */
  private func addSource(_ platform: String) {
    let row = TriggerRow.new(platform)
    rows.append(row)
    if TriggerRow.trigger([row]) != nil { commitTrigger() }
    panel = rows.count - 1
  }

  // MARK: Run history

  private var history: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      let runs = stored?.runs ?? []
      if runs.isEmpty {
        Text("No runs yet").font(.system(size: 13)).foregroundStyle(.tertiary)
      } else {
        VStack(spacing: 0) {
          ForEach(runs) { run in
            HStack {
              Text(RoutineSchedule.when(run.at ?? 0, now: context.date.timeIntervalSince1970 * 1000, zone: .current))
                .font(.system(size: 13))
              Spacer()
              statusIcon(run.status)
            }
            .padding(.vertical, 6)
            .help(run.detail ?? run.event ?? "")
          }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Run history")
      }
    }
  }

  @ViewBuilder
  private func statusIcon(_ status: String) -> some View {
    switch status {
    case "running": ProgressView().controlSize(.small).accessibilityLabel(RoutineWords.runStatus(status))
    case "ok": Image(systemName: "checkmark").foregroundStyle(Ink.fare).accessibilityLabel(RoutineWords.runStatus(status))
    default: Image(systemName: "xmark").foregroundStyle(Ink.danger).accessibilityLabel(RoutineWords.runStatus(status))
    }
  }
}

/**
 * The fields of one trigger (the window's "Trigger fields" panel): a
 * schedule's Frequency and what it needs, or an event's source fields. A
 * choice saves as it is made; a field as it is left (Return leaves it).
 */
struct MacTriggerFields: View {
  @Binding var row: TriggerRow
  let commit: () -> Void

  var body: some View {
    switch row {
    case .schedule(let line):
      MacScheduleFields(line: Binding(get: { line }, set: { row = .schedule($0) }), commit: commit)
    case .slack(let channel, let match, let keyword, let emoji, let bySelf):
      slack(channel, match, keyword, emoji, bySelf)
    case .github(let repo, let events, let allowlist, let branch):
      github(repo, events, allowlist, branch)
    case .teams(let tenant, let teams, let channels, let contains, let isRegex, let linkedOnly):
      teamsFields(tenant, teams, channels, contains, isRegex, linkedOnly)
    case .linear(let event, let statuses, let cycles, let projects, let teams):
      linear(event, statuses, cycles, projects, teams)
    case .sentry(let event, let projects):
      VStack(alignment: .leading, spacing: 8) {
        picker("Sentry event", RoutineWords.sentryEvents, event) { row = .sentry(event: $0, projectIds: projects); commit() }
        line("in") { field("Project IDs", "All projects", projects) { row = .sentry(event: event, projectIds: $0) } }
      }
    case .pagerduty(let event, let services):
      VStack(alignment: .leading, spacing: 8) {
        picker("PagerDuty event", RoutineWords.pagerdutyEvents, event) { row = .pagerduty(event: $0, serviceIds: services); commit() }
        line("on") { field("Service IDs", "All services", services) { row = .pagerduty(event: event, serviceIds: $0) } }
      }
    }
  }

  private func slack(_ channel: String, _ match: String, _ keyword: String, _ emoji: String, _ bySelf: Bool) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Menu(RoutineWords.slackButton[match == "keyword" ? "message" : match] ?? "New messages") {
          ForEach(RoutineWords.slackEvents, id: \.value) { option in
            Button(option.label) { row = .slack(channel: channel, match: option.value, keyword: "", emoji: "", bySelf: false); commit() }
          }
        }
        .fixedSize()
        .accessibilityLabel("Slack event")
        Text("in").foregroundStyle(.secondary)
        field("Slack channel", "#channel", channel, focusWhenEmpty: true) { row = .slack(channel: $0, match: match, keyword: keyword, emoji: emoji, bySelf: bySelf) }
      }
      if match == "message" || match == "keyword" {
        line("containing") {
          field("Message contains", "Any text", keyword) { text in
            let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
            row = .slack(channel: channel, match: words.isEmpty ? "message" : "keyword", keyword: text, emoji: emoji, bySelf: bySelf)
          }
        }
      }
      if match == "reaction" {
        line("with emoji") { field("Reaction emoji", "Any emoji", emoji) { row = .slack(channel: channel, match: match, keyword: keyword, emoji: $0, bySelf: bySelf) } }
        line("from") {
          Picker("Reactor", selection: Binding(get: { bySelf }, set: { row = .slack(channel: channel, match: match, keyword: keyword, emoji: emoji, bySelf: $0); commit() })) {
            ForEach(RoutineWords.reactors, id: \.value) { Text($0.label).tag($0.value) }
          }
          .labelsHidden().fixedSize()
        }
      }
    }
  }

  private func github(_ repo: String, _ events: [String], _ allowlist: String, _ branch: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Menu(RoutineWords.gitButton(events)) {
          ForEach(TriggerRow.gitSections, id: \.title) { section in
            Section(section.title) {
              ForEach(section.events, id: \.kind) { event in
                Toggle(event.label, isOn: Binding(get: { events.contains(event.kind) }, set: { on in
                  let picked = on ? events + [event.kind] : events.filter { $0 != event.kind }
                  row = .github(repo: repo, events: TriggerRow.gitOrder.filter(picked.contains), userAllowlist: allowlist, ciBranch: branch)
                  commit()
                }))
              }
            }
          }
        }
        .fixedSize()
        .accessibilityLabel("Git events")
        Text("in").foregroundStyle(.secondary)
        field("Repository", "owner/repo", repo) { row = .github(repo: $0, events: events, userAllowlist: allowlist, ciBranch: branch) }
      }
      if events.contains(where: { $0 != "ci-passed" && $0 != "ci-failed" }) {
        line("from") { field("User allowlist", "Anyone", allowlist) { row = .github(repo: repo, events: events, userAllowlist: $0, ciBranch: branch) } }
      }
      if events.contains("ci-passed") || events.contains("ci-failed") {
        line("on branch") { field("CI branch", "main", branch) { row = .github(repo: repo, events: events, userAllowlist: allowlist, ciBranch: $0) } }
      }
    }
  }

  private func teamsFields(_ tenant: String, _ teams: String, _ channels: String, _ contains: String, _ isRegex: Bool, _ linkedOnly: Bool) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Menu("New messages") { Button("New message in channel") {} }
          .fixedSize()
          .accessibilityLabel("Teams event")
        Text("in").foregroundStyle(.secondary)
        field("Team IDs", "Team IDs", teams) { row = .teams(tenantId: tenant, teamIds: $0, channelIds: channels, messageContains: contains, isRegex: isRegex, linkedOnly: linkedOnly) }
      }
      line("tenant") { field("Tenant ID", "Tenant ID", tenant) { row = .teams(tenantId: $0, teamIds: teams, channelIds: channels, messageContains: contains, isRegex: isRegex, linkedOnly: linkedOnly) } }
      line("channels") { field("Channel IDs", "Every channel", channels) { row = .teams(tenantId: tenant, teamIds: teams, channelIds: $0, messageContains: contains, isRegex: isRegex, linkedOnly: linkedOnly) } }
      line("containing") {
        field("Message contains", "Any message", contains) { row = .teams(tenantId: tenant, teamIds: teams, channelIds: channels, messageContains: $0, isRegex: isRegex, linkedOnly: linkedOnly) }
        Picker("Message match", selection: Binding(get: { isRegex }, set: { row = .teams(tenantId: tenant, teamIds: teams, channelIds: channels, messageContains: contains, isRegex: $0, linkedOnly: linkedOnly); commit() })) {
          ForEach(RoutineWords.teamsMatch, id: \.value) { Text($0.label).tag($0.value) }
        }
        .labelsHidden().fixedSize()
      }
      line("from") {
        Picker("Teams audience", selection: Binding(get: { linkedOnly }, set: { row = .teams(tenantId: tenant, teamIds: teams, channelIds: channels, messageContains: contains, isRegex: isRegex, linkedOnly: $0); commit() })) {
          ForEach(RoutineWords.teamsAudience, id: \.value) { Text($0.label).tag($0.value) }
        }
        .labelsHidden().fixedSize()
      }
    }
  }

  private func linear(_ event: String, _ statuses: String, _ cycles: String, _ projects: String, _ teams: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      picker("Linear event", RoutineWords.linearEvents, event) { row = .linear(event: $0, statusIds: statuses, cycleIds: cycles, projectIds: projects, teamIds: teams); commit() }
      if event == "statusChanged" {
        line("with status") { field("Status IDs", "Any status", statuses) { row = .linear(event: event, statusIds: $0, cycleIds: cycles, projectIds: projects, teamIds: teams) } }
      }
      if event == "endOfCycle" {
        line("cycles") { field("Cycle IDs", "Any cycle", cycles) { row = .linear(event: event, statusIds: statuses, cycleIds: $0, projectIds: projects, teamIds: teams) } }
      }
      line("in") { field("Project IDs", "All projects", projects) { row = .linear(event: event, statusIds: statuses, cycleIds: cycles, projectIds: $0, teamIds: teams) } }
      line("for") { field("Team IDs", "All teams", teams) { row = .linear(event: event, statusIds: statuses, cycleIds: cycles, projectIds: projects, teamIds: $0) } }
    }
  }

  // MARK: Pieces

  private func line<Content: View>(_ word: String, @ViewBuilder _ content: () -> Content) -> some View {
    HStack(spacing: 6) {
      Text(word).foregroundStyle(.secondary)
      content()
    }
    .font(.system(size: 13))
  }

  private func picker(_ label: String, _ options: [(value: String, label: String)], _ value: String, _ set: @escaping (String) -> Void) -> some View {
    Picker(label, selection: Binding(get: { value }, set: set)) {
      ForEach(options, id: \.value) { Text($0.label).tag($0.value) }
    }
    .labelsHidden()
    .fixedSize()
    .accessibilityLabel(label)
  }

  /** A text field that saves as it is left, or with Return. */
  private func field(_ label: String, _ placeholder: String, _ value: String, focusWhenEmpty: Bool = false, _ set: @escaping (String) -> Void) -> some View {
    TriggerTextField(label: label, placeholder: placeholder, value: value, focusWhenEmpty: focusWhenEmpty, set: set, commit: commit)
  }
}

/** One of a trigger's text fields (`ql`): typed into the row as it changes, saved as it is left or with Return. */
struct TriggerTextField: View {
  let label: String
  let placeholder: String
  let value: String
  var focusWhenEmpty = false
  let set: (String) -> Void
  let commit: () -> Void
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    TextField(placeholder, text: $text)
      .textFieldStyle(.roundedBorder)
      .focused($focused)
      .accessibilityLabel(label)
      .onAppear {
        text = value
        if focusWhenEmpty && value.isEmpty { focused = true }
      }
      .onChange(of: text) { _, now in if now != value { set(now) } }
      // A change from outside (another choice cleared this field) shows here, unless it is being typed in.
      .onChange(of: value) { _, now in if !focused && now != text { text = now } }
      .onSubmit { focused = false }
      .onChange(of: focused) { _, now in if !now { commit() } }
  }
}

/**
 * A schedule's fields (`Ugn`): Frequency, then what it needs ("at" a minute
 * or a time, "on" a day, "on the" a day of the month, "every" an amount and
 * a unit, the Advanced grid, or the cron line itself under Custom). A pick
 * saves at once, except a first move from a custom line or into Advanced,
 * which waits for a change inside (closing the panel takes it back).
 */
struct MacScheduleFields: View {
  @Binding var line: String
  let commit: () -> Void
  /** The Frequency shown when it is not the line's own: Custom for a line the picker can't show. */
  @State private var mode: String?
  /** A move not saved yet (out of a custom line, or into Advanced): drawn here only, the routine's line untouched until a change inside. */
  @State private var staged: String?
  @State private var custom = ""
  @State private var invalid = false

  /** The line as drawn: the staged one, else the routine's. */
  private var shown: String { staged ?? line }
  private var shape: RoutineSchedule.Shape? { RoutineSchedule.shape(shown) }
  private var current: String { mode ?? shape?.mode ?? "custom" }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Picker("Frequency", selection: Binding(get: { current }, set: { pickFrequency($0) })) {
        ForEach(RoutineSchedule.frequencies, id: \.value) { Text($0.label).tag($0.value) }
      }
      .labelsHidden()
      .fixedSize()
      .accessibilityLabel("Frequency")
      if current == "custom" {
        TextField("", text: $custom)
          .textFieldStyle(.roundedBorder)
          .accessibilityLabel("Schedule")
          .overlay(RoundedRectangle(cornerRadius: 5).stroke(invalid ? Ink.danger : .clear, lineWidth: 1))
          .onSubmit { customLeft() }
          .onDisappear { customLeft() }
      } else if let shape {
        controls(shape)
      }
    }
    .font(.system(size: 13))
    .onAppear {
      custom = line
      if shape == nil { mode = "custom" }
    }
  }

  /** Closing the panel drops a staged move: it was only ever drawn here. */
  private func pickFrequency(_ next: String) {
    if next == "custom" { mode = "custom"; custom = shown; staged = nil; return }
    if current == "custom" && shape == nil {
      staged = RoutineSchedule.line(RoutineSchedule.start(next, from: nil))
      mode = nil
      return
    }
    if next == "advanced" {
      staged = RoutineSchedule.line(RoutineSchedule.advanced(from: shape))
      mode = nil
      return
    }
    set(RoutineSchedule.start(next, from: shape))
  }

  /** A change inside: the line set and saved. */
  private func set(_ next: RoutineSchedule.Shape) {
    staged = nil
    mode = nil
    line = RoutineSchedule.line(next)
    commit()
  }

  /** Custom: saved when it is a schedule; else marked, and nothing saved. */
  private func customLeft() {
    let typed = custom.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !typed.isEmpty, RoutineSchedule.isValid(typed) else {
      invalid = !typed.isEmpty
      line = custom
      return
    }
    invalid = false
    staged = nil
    line = typed
    commit()
  }

  @ViewBuilder
  private func controls(_ shape: RoutineSchedule.Shape) -> some View {
    switch shape {
    case .hourly(let minute):
      row("at") {
        Picker("Minute", selection: Binding(get: { minute }, set: { set(.hourly(minute: $0)) })) {
          ForEach(RoutineSchedule.minuteChoices(minute), id: \.self) { Text(String(format: ":%02d", $0)).tag($0) }
        }.labelsHidden().fixedSize()
      }
    case .daily(let t):
      row("at") { timePicker(t) { set(.daily($0)) } }
    case .weekdays(let t):
      row("at") { timePicker(t) { set(.weekdays($0)) } }
    case .weekly(let day, let t):
      row("on") {
        Picker("Day of week", selection: Binding(get: { day }, set: { set(.weekly(dayOfWeek: $0, t)) })) {
          ForEach(RoutineWords.weekOrder, id: \.self) { Text(RoutineSchedule.weekdays[$0]).tag($0) }
        }.labelsHidden().fixedSize()
        Text("at").foregroundStyle(.secondary)
        timePicker(t) { set(.weekly(dayOfWeek: day, $0)) }
      }
    case .monthly(let day, let t):
      row("on the") {
        Picker("Day of month", selection: Binding(get: { day }, set: { set(.monthly(dayOfMonth: $0, t)) })) {
          ForEach(1...31, id: \.self) { Text(RoutineSchedule.ordinal($0)).tag($0) }
        }.labelsHidden().fixedSize()
        Text("at").foregroundStyle(.secondary)
        timePicker(t) { set(.monthly(dayOfMonth: day, $0)) }
      }
    case .interval(let amount, let unit):
      row("every") {
        Picker("Interval amount", selection: Binding(get: { amount }, set: { set(.interval(amount: $0, unit: unit)) })) {
          ForEach(RoutineSchedule.intervalChoices(unit, current: amount), id: \.self) { Text("\($0)").tag($0) }
        }.labelsHidden().fixedSize()
        Picker("Interval unit", selection: Binding(get: { unit }, set: { next in
          let fits = RoutineSchedule.intervalChoices(next, current: -1).contains(amount)
          set(.interval(amount: fits ? amount : RoutineSchedule.intervalFallback[next] ?? 1, unit: next))
        })) {
          ForEach(RoutineWords.units, id: \.self) { Text($0).tag($0) }
        }.labelsHidden().fixedSize()
      }
    case .advanced(let months, let days, let time):
      MacAdvancedGrid(months: months, days: days, time: time) { set($0) }
    }
  }

  private func row<Content: View>(_ word: String, @ViewBuilder _ content: () -> Content) -> some View {
    HStack(spacing: 6) {
      Text(word).foregroundStyle(.secondary)
      content()
    }
  }

  /** A time, 15 minutes apart, and the one set. */
  private func timePicker(_ t: RoutineSchedule.Time, _ set: @escaping (RoutineSchedule.Time) -> Void) -> some View {
    Picker("Time", selection: Binding(get: { t.hour * 60 + t.minute }, set: { set(RoutineSchedule.Time(hour: $0 / 60, minute: $0 % 60)) })) {
      ForEach(RoutineSchedule.timeChoices(t.hour * 60 + t.minute), id: \.self) { Text(RoutineSchedule.clock($0 / 60, $0 % 60)).tag($0) }
    }
    .labelsHidden()
    .fixedSize()
  }
}

/**
 * The Advanced grid (`$gn`): Months (Any month, or some), Days (every day,
 * days of the week, days of the month, the last one kept), and Time (at
 * times, eight at most sharing one minute, or every so many minutes or hours
 * between two hours).
 */
struct MacAdvancedGrid: View {
  let months: [Int]?
  let days: RoutineSchedule.Days
  let time: RoutineSchedule.TimeOfDay
  let set: (RoutineSchedule.Shape) -> Void

  var body: some View {
    Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 8) {
      GridRow {
        Text("Months").foregroundStyle(.secondary)
        Menu(RoutineWords.monthsLabel(months)) {
          Button("Any month") { set(.advanced(months: nil, days: days, time: time)) }
          ForEach(1...12, id: \.self) { month in
            Toggle(RoutineSchedule.months[month - 1], isOn: Binding(get: { months?.contains(month) == true }, set: { on in
              let picked = on ? (months ?? []) + [month] : (months ?? []).filter { $0 != month }
              set(.advanced(months: picked.isEmpty ? nil : Array(Set(picked)).sorted(), days: days, time: time))
            }))
          }
        }
        .fixedSize()
      }
      GridRow {
        Text("Days").foregroundStyle(.secondary)
        HStack(spacing: 6) {
          Picker("Days", selection: Binding(get: { kind }, set: { next in
            switch next {
            case "days-of-week": set(.advanced(months: months, days: .daysOfWeek([1]), time: time))
            case "days-of-month": set(.advanced(months: months, days: .daysOfMonth([1]), time: time))
            default: set(.advanced(months: months, days: .everyDay, time: time))
            }
          })) {
            ForEach(RoutineWords.dayKinds, id: \.value) { Text($0.label).tag($0.value) }
          }
          .labelsHidden().fixedSize()
          dayMenu
        }
      }
      GridRow {
        Text("Time").foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 6) {
          Picker("Time mode", selection: Binding(get: { timeKind }, set: { next in
            set(.advanced(months: months, days: days, time: next == "interval" ? .interval(unit: "minutes", amount: 30, fromHour: 0, toHour: 23) : .atTimes(minute: 0, hours: [8])))
          })) {
            ForEach(RoutineWords.timeKinds, id: \.value) { Text($0.label).tag($0.value) }
          }
          .labelsHidden().fixedSize()
          timeControls
        }
      }
    }
  }

  private var kind: String {
    switch days {
    case .everyDay: return "every-day"
    case .daysOfWeek: return "days-of-week"
    case .daysOfMonth: return "days-of-month"
    }
  }

  private var timeKind: String {
    if case .interval = time { return "interval" }
    return "at-times"
  }

  @ViewBuilder
  private var dayMenu: some View {
    switch days {
    case .everyDay: EmptyView()
    case .daysOfWeek(let list):
      Menu(RoutineWords.weekdaysLabel(list)) {
        ForEach(RoutineWords.weekOrder, id: \.self) { day in
          Toggle(RoutineSchedule.weekdays[day], isOn: Binding(get: { list.contains(day) }, set: { on in
            let next = on ? list + [day] : list.filter { $0 != day }
            if !next.isEmpty { set(.advanced(months: months, days: .daysOfWeek(Array(Set(next)).sorted()), time: time)) }
          }))
        }
      }
      .fixedSize()
    case .daysOfMonth(let list):
      Menu(RoutineWords.monthDaysLabel(list)) {
        ForEach(1...31, id: \.self) { day in
          Toggle(RoutineSchedule.ordinal(day), isOn: Binding(get: { list.contains(day) }, set: { on in
            let next = on ? list + [day] : list.filter { $0 != day }
            if !next.isEmpty { set(.advanced(months: months, days: .daysOfMonth(Array(Set(next)).sorted()), time: time)) }
          }))
        }
      }
      .fixedSize()
    }
  }

  @ViewBuilder
  private var timeControls: some View {
    switch time {
    case .atTimes(let minute, let hours):
      let first = hours.first ?? 0
      let rest = Array(hours.dropFirst())
      Picker("Time", selection: Binding(get: { first * 60 + minute }, set: { value in
        let hour = value / 60
        set(.advanced(months: months, days: days, time: .atTimes(minute: value % 60, hours: [hour] + rest.filter { $0 != hour })))
      })) {
        ForEach(RoutineSchedule.timeChoices(first * 60 + minute), id: \.self) { Text(RoutineSchedule.clock($0 / 60, $0 % 60)).tag($0) }
      }
      .labelsHidden().fixedSize()
      ForEach(Array(rest.enumerated()), id: \.element) { index, hour in
        HStack(spacing: 4) {
          Picker("Time \(index + 2)", selection: Binding(get: { hour }, set: { next in
            var all = hours
            all[index + 1] = next
            set(.advanced(months: months, days: days, time: .atTimes(minute: minute, hours: all)))
          })) {
            ForEach((0..<24).filter { $0 == hour || !hours.contains($0) }, id: \.self) { Text(RoutineSchedule.clock($0, minute)).tag($0) }
          }
          .labelsHidden().fixedSize()
          Button { set(.advanced(months: months, days: days, time: .atTimes(minute: minute, hours: hours.filter { $0 != hour }))) } label: {
            Image(systemName: "xmark").font(.system(size: 9, weight: .semibold))
          }
          .buttonStyle(.borderless)
          .accessibilityLabel("Remove \(RoutineSchedule.clock(hour, minute))")
        }
      }
      if hours.count < 8 {
        Button {
          if let next = (0..<24).map({ (first + $0 + 1) % 24 }).first(where: { !hours.contains($0) }) {
            set(.advanced(months: months, days: days, time: .atTimes(minute: minute, hours: hours + [next])))
          }
        } label: { Label("Add time", systemImage: "plus") }
        .buttonStyle(.borderless)
      }
    case .interval(let unit, let amount, let from, let to):
      HStack(spacing: 6) {
        Picker("Interval amount", selection: Binding(get: { amount }, set: { set(.advanced(months: months, days: days, time: .interval(unit: unit, amount: $0, fromHour: from, toHour: to))) })) {
          ForEach(RoutineSchedule.intervalChoices(unit, current: amount), id: \.self) { Text("\($0)").tag($0) }
        }.labelsHidden().fixedSize()
        Picker("Interval unit", selection: Binding(get: { unit }, set: { next in
          let fits = RoutineSchedule.intervalChoices(next, current: -1).contains(amount)
          set(.advanced(months: months, days: days, time: .interval(unit: next, amount: fits ? amount : RoutineSchedule.intervalFallback[next] ?? 1, fromHour: from, toHour: to)))
        })) {
          ForEach(RoutineWords.windowUnits, id: \.self) { Text($0).tag($0) }
        }.labelsHidden().fixedSize()
      }
      HStack(spacing: 6) {
        Text("between").foregroundStyle(.secondary)
        Picker("From hour", selection: Binding(get: { from }, set: { set(.advanced(months: months, days: days, time: .interval(unit: unit, amount: amount, fromHour: $0, toHour: max(to, $0)))) })) {
          ForEach(0..<24, id: \.self) { Text(RoutineSchedule.clock($0, 0)).tag($0) }
        }.labelsHidden().fixedSize()
        Text("and").foregroundStyle(.secondary)
        Picker("To hour", selection: Binding(get: { to }, set: { set(.advanced(months: months, days: days, time: .interval(unit: unit, amount: amount, fromHour: from, toHour: $0))) })) {
          ForEach(from..<24, id: \.self) { Text(RoutineSchedule.clock($0, 0)).tag($0) }
        }.labelsHidden().fixedSize()
      }
    }
  }
}
