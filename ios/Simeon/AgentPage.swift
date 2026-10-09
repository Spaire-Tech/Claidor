import AVFoundation
import PhotosUI
import SwiftUI
import SimeonCore

/**
 * The agent's page (the Mac's right pane, as a sheet on the phone): the
 * butterfly in a white disc with the pencil, the name and title, then three
 * tabs: Profile (Name, Title, Description saved on leaving the field, and
 * Notifications), Routines (the list, a routine's editor, Create Routine),
 * Computer (the agent's own screen, live). A group's page lists its members
 * and changes them.
 */
struct AgentPageSheet: View {
  let agentId: String
  /** A routine to open at once (a routine found in search), on the Routines tab. */
  var routineId: String? = nil
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var tab: Int
  @State private var editingAvatar = false

  init(agentId: String, routineId: String? = nil) {
    self.agentId = agentId
    self.routineId = routineId
    _tab = State(initialValue: routineId == nil ? 0 : 1)
  }

  var body: some View {
    NavigationStack {
      Group {
        if let agent = store.agent(agentId) {
          ScrollView {
            VStack(spacing: 0) {
              ZStack(alignment: .bottomTrailing) {
                AgentAvatar(agent: agent, members: store.members(of: agent))
                  .frame(width: agent.isGroup ? 90 : 66, height: agent.isGroup ? 60 : 66)
                  .frame(width: 96, height: 96)
                  .background(Ink.tile, in: Circle())
                  .overlay(Circle().stroke(Ink.tileEdge, lineWidth: 1))
                if !agent.isGroup {
                  Button { editingAvatar = true } label: {
                    Image(systemName: "pencil").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
                      .frame(width: 32, height: 32)
                      .background(Ink.bubbleTheirs, in: Circle())
                      .frame(width: 44, height: 44)
                      .contentShape(.circle)
                  }
                  .buttonStyle(.plain)
                  .accessibilityLabel("Edit agent avatar")
                  .offset(x: 2, y: 2)
                }
              }
              .padding(.top, 8)
              Text(agent.name).font(.system(size: 22, weight: .semibold)).foregroundStyle(Ink.primary).padding(.top, 14)
              if !agent.title.isEmpty { Text(agent.title).font(.system(size: 15)).foregroundStyle(Ink.secondary).padding(.top, 2) }
              if agent.isGroup {
                GroupMembers(group: agent).padding(.top, 24)
              } else {
                Picker("Page", selection: $tab) {
                  Image(systemName: "person").tag(0).accessibilityLabel("Profile")
                  Image(systemName: "clock").tag(1).accessibilityLabel("Routines")
                  Image(systemName: "display").tag(2).accessibilityLabel("Computer")
                }
                .pickerStyle(.segmented)
                .padding(.top, 26)
                Group {
                  switch tab {
                  case 0: ProfileTab(agent: agent)
                  case 1: RoutinesTab(agent: agent, opening: routineId)
                  default: ComputerTab(agent: agent)
                  }
                }
                .padding(.top, 20)
              }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
          }
        } else {
          Text("This agent is gone.").foregroundStyle(Ink.secondary)
        }
      }
      .background(Ink.ground)
      .toolbar { ToolbarItem(placement: .leadingBar) { CloseButton() } }
      .sheet(isPresented: $editingAvatar) { AvatarEditor(agentId: agentId).problemAlert() }
    }
  }
}

/** Name, Title, Description, each saved on leaving it (the Chief of Staff's title and description are his own), and Notifications. */
struct ProfileTab: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @State private var name = ""
  @State private var title = ""
  @State private var about = ""
  @State private var loaded = false
  @FocusState private var field: Int?

  private var isChief: Bool { agent.title == "Chief of Staff" }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      row("Name", $name, tag: 0)
      line
      if isChief { fixed("Title", agent.title) } else { row("Title", $title, tag: 1) }
      line
      if isChief { fixed("Description", agent.description) } else { row("Description", $about, tag: 2, axis: .vertical) }
      line
      HStack(spacing: 14) {
        Image(systemName: "bell").font(.system(size: 17)).foregroundStyle(Ink.primary)
          .frame(width: 40, height: 40)
          .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          Text("Notifications").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
          Text("Get notified when this agent finishes or needs input").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
        Spacer(minLength: 8)
        Toggle("Notifications", isOn: Binding(get: { agent.notifyOnUpdates }, set: { on in Task { await store.setNotify(agent.id, on) } }))
          .labelsHidden()
          .tint(Ink.blue)
      }
      .padding(.top, 22)
    }
    .onAppear {
      guard !loaded else { return }
      loaded = true
      name = agent.name; title = agent.title; about = agent.description
    }
    .onChange(of: field) { old, _ in if old != nil { save() } }
    .onDisappear { save() }
  }

  private var line: some View { Rectangle().fill(Ink.hairline).frame(height: 1) }

  private func row(_ label: String, _ value: Binding<String>, tag: Int, axis: Axis = .horizontal) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.system(size: 13)).foregroundStyle(Ink.secondary).allowsHitTesting(false)
      TextField(label, text: value, axis: axis)
        .font(.system(size: 15)).foregroundStyle(Ink.primary)
        .lineLimit(1...8)
        .focused($field, equals: tag)
        .submitLabel(.done)
        .onSubmit { field = nil }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.vertical, 12)
    // The whole row takes the tap: the label above the field and the row's padding passed it to nothing.
    .background { Color.clear.contentShape(.rect).onTapGesture { field = tag } }
  }

  private func fixed(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      Text(value).font(.system(size: 15)).foregroundStyle(Ink.primary).fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func save() {
    guard loaded else { return }
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let t = isChief ? agent.title : title.trimmingCharacters(in: .whitespacesAndNewlines)
    let d = isChief ? agent.description : about.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (!n.isEmpty && n != agent.name) || t != agent.title || d != agent.description else { return }
    Task { await store.saveProfile(agent.id, name: n, title: t, description: d) }
  }
}

/** The agent's routines: each with when it runs (or Paused); a tap opens its editor; Create Routine. */
struct RoutinesTab: View {
  let agent: Agent
  /** A routine to open as soon as the list is in (search). */
  var opening: String? = nil
  @Environment(AppStore.self) private var store
  @State private var routines: [Routine] = []
  @State private var loading = true
  @State private var editing: EditingRoutine?
  @State private var opened = false

  struct EditingRoutine: Identifiable { let id: String; let routine: Routine; let isNew: Bool }

  var body: some View {
    VStack(spacing: 0) {
      if loading {
        ProgressView().padding(.top, 30)
      } else if routines.isEmpty {
        VStack(spacing: 16) {
          Image(systemName: "clock").font(.system(size: 22)).foregroundStyle(Ink.primary)
            .frame(width: 56, height: 56)
            .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
          Text("Routines are recurring tasks this agent runs on a schedule.")
            .font(.system(size: 15)).foregroundStyle(Ink.secondary).multilineTextAlignment(.center)
          createButton
        }
        .padding(.top, 20)
      } else {
        ForEach(routines) { routine in
          Button { editing = EditingRoutine(id: routine.id, routine: routine, isNew: false) } label: {
            HStack(spacing: 12) {
              Image(systemName: routine.isEnabled ? "clock" : "pause.circle").font(.system(size: 17)).foregroundStyle(routine.isEnabled ? Ink.blue : Ink.tertiary)
              VStack(alignment: .leading, spacing: 2) {
                Text(routine.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
                Text(routine.isEnabled ? routine.summary : "Paused").font(.system(size: 13)).foregroundStyle(Ink.secondary)
              }
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.tertiary)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          Rectangle().fill(Ink.hairline).frame(height: 1)
        }
        createButton.padding(.top, 20)
      }
    }
    .task { await reload() }
    .sheet(item: $editing, onDismiss: { Task { await reload() } }) { item in
      RoutineEditor(agentId: agent.id, routine: item.routine, isNew: item.isNew).problemAlert()
    }
  }

  private var createButton: some View {
    Button {
      editing = EditingRoutine(id: UUID().uuidString, routine: Routine(id: "", name: "", prompt: "", schedule: Schedule.daily(hour: 9, minute: 0).cron), isNew: true)
    } label: {
      // The pill is the label, so all of it takes the tap, not just the words.
      Text("Create Routine")
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(Ink.ground)
        .padding(.horizontal, 22).frame(height: 40)
        .background(Ink.primary, in: Capsule())
        .contentShape(.capsule)
    }
    .buttonStyle(.plain)
  }

  private func reload() async {
    routines = await store.routineList(agent.id)
    loading = false
    if !opened, let opening, let routine = routines.first(where: { $0.id == opening }) {
      opened = true
      editing = EditingRoutine(id: routine.id, routine: routine, isNew: false)
    }
  }
}

/**
 * A routine's editor (the Mac's): Active, Name, Instruction, When to run
 * (the schedule picker), Run now, Delete, and its runs. A routine already
 * there saves itself as it changes; a new one is created with Create.
 */
struct RoutineEditor: View {
  let agentId: String
  @State var routine: Routine
  let isNew: Bool
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var original: Routine?
  /** Create, Test run now or Delete on its way: one tap is one run (a double tap ran it twice). */
  @State private var busy = false

  var body: some View {
    NavigationStack {
      Form {
        if !isNew {
          Section {
            Toggle("Active", isOn: Binding(get: { routine.isEnabled }, set: { on in
              routine.isEnabled = on
              Task { await store.setRoutineEnabled(routine.id, agentId: agentId, on) }
            }))
            .tint(Ink.blue)
          }
        }
        Section("Name") {
          TextField("Monday launch check", text: $routine.name)
        }
        Section("Instruction") {
          TextField("What should this routine do each time it runs?", text: $routine.prompt, axis: .vertical).lineLimit(3...12)
        }
        Section("When to run") {
          SchedulePicker(cron: $routine.schedule)
        }
        if !isNew {
          Section {
            Button {
              busy = true
              Task { await store.runRoutineNow(routine.id, agentId: agentId); busy = false }
            } label: { Label("Test run now", systemImage: "play") }
            .disabled(busy)
            Button(role: .destructive) {
              busy = true
              Task { await store.deleteRoutine(routine.id, agentId: agentId); dismiss() }
            } label: { Label("Delete routine", systemImage: "trash") }
            .disabled(busy)
          }
          if !routine.runs.isEmpty {
            Section("Runs") {
              ForEach(Array(routine.runs.prefix(20).enumerated()), id: \.offset) { _, run in
                HStack {
                  Text(run.at.map { Date(timeIntervalSince1970: $0 / 1000).formatted(date: .abbreviated, time: .shortened) } ?? "Run")
                  Spacer()
                  Text(run.status.capitalized).foregroundStyle(run.status == "failed" ? Ink.danger : Ink.secondary)
                }
                .font(.system(size: 14))
              }
            }
          }
        }
      }
      .navigationTitle(isNew ? "New Routine" : routine.name)
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) { CloseButton() }
        if isNew {
          ToolbarItem(placement: .trailingBar) {
            Button("Create") {
              busy = true
              Task { await store.saveRoutine(routine, agentId: agentId, isNew: true); dismiss() }
            }
            .disabled(busy || routine.name.trimmingCharacters(in: .whitespaces).isEmpty || routine.prompt.trimmingCharacters(in: .whitespaces).isEmpty)
          }
        }
      }
      .onAppear { if original == nil { original = routine } }
      .onDisappear {
        guard !isNew, let original, original != routine, !routine.name.isEmpty else { return }
        let saved = routine
        Task { await store.saveRoutine(saved, agentId: agentId, isNew: false) }
      }
    }
  }
}

/** The Mac's "When to run": every hour, every day, weekdays, every week, every month, an interval, or a cron line. */
struct SchedulePicker: View {
  @Binding var cron: String

  private enum Kind: String, CaseIterable, Identifiable {
    case hourly = "Every hour", daily = "Every day", weekdays = "Weekdays", weekly = "Every week", monthly = "Every month", interval = "Interval", custom = "Custom"
    var id: String { rawValue }
  }

  var body: some View {
    let schedule = Schedule(cron: cron)
    Picker("Repeat", selection: Binding(get: { kind(schedule) }, set: { cron = start($0, from: schedule).cron })) {
      ForEach(Kind.allCases) { Text($0.rawValue).tag($0) }
    }
    switch schedule {
    case .daily(let h, let m), .weekdays(let h, let m):
      DatePicker("At", selection: time(h, m) { hour, minute in cron = (kind(schedule) == .daily ? Schedule.daily(hour: hour, minute: minute) : .weekdays(hour: hour, minute: minute)).cron }, displayedComponents: .hourAndMinute)
    case .weekly(let d, let h, let m):
      Picker("On", selection: Binding(get: { d }, set: { cron = Schedule.weekly(weekday: $0, hour: h, minute: m).cron })) {
        ForEach(0..<7, id: \.self) { Text(Schedule.weekdayNames[$0]).tag($0) }
      }
      DatePicker("At", selection: time(h, m) { hour, minute in cron = Schedule.weekly(weekday: d, hour: hour, minute: minute).cron }, displayedComponents: .hourAndMinute)
    case .monthly(let day, let h, let m):
      Stepper("On day \(day)", value: Binding(get: { day }, set: { cron = Schedule.monthly(day: $0, hour: h, minute: m).cron }), in: 1...28)
      DatePicker("At", selection: time(h, m) { hour, minute in cron = Schedule.monthly(day: day, hour: hour, minute: minute).cron }, displayedComponents: .hourAndMinute)
    case .hourly(let m):
      Stepper(String(format: "At :%02d", m), value: Binding(get: { m }, set: { cron = Schedule.hourly(minute: $0).cron }), in: 0...59, step: 5)
    case .everyMinutes(let n):
      Stepper("Every \(n) minutes", value: Binding(get: { n }, set: { cron = Schedule.everyMinutes($0).cron }), in: 5...55, step: 5)
    case .everyHours(let n):
      Stepper("Every \(n) hours", value: Binding(get: { n }, set: { cron = Schedule.everyHours($0).cron }), in: 1...12)
    case .custom:
      TextField("Cron, e.g. 0 9 * * 1", text: $cron).font(.system(size: 15, design: .monospaced)).typedAsIs().autocorrectionDisabled()
    }
    Text(schedule.summary).font(.system(size: 13)).foregroundStyle(Ink.secondary)
  }

  private func kind(_ schedule: Schedule) -> Kind {
    switch schedule {
    case .hourly: return .hourly
    case .daily: return .daily
    case .weekdays: return .weekdays
    case .weekly: return .weekly
    case .monthly: return .monthly
    case .everyMinutes, .everyHours: return .interval
    case .custom: return .custom
    }
  }

  private func start(_ kind: Kind, from current: Schedule) -> Schedule {
    var (h, m) = (9, 0)
    switch current {
    case .daily(let a, let b), .weekdays(let a, let b), .weekly(_, let a, let b), .monthly(_, let a, let b): (h, m) = (a, b)
    default: break
    }
    switch kind {
    case .hourly: return .hourly(minute: 0)
    case .daily: return .daily(hour: h, minute: m)
    case .weekdays: return .weekdays(hour: h, minute: m)
    case .weekly: return .weekly(weekday: 1, hour: h, minute: m)
    case .monthly: return .monthly(day: 1, hour: h, minute: m)
    case .interval: return .everyHours(2)
    case .custom: return .custom(current.cron)
    }
  }

  private func time(_ hour: Int, _ minute: Int, set: @escaping (Int, Int) -> Void) -> Binding<Date> {
    Binding(
      get: { Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date() },
      set: { date in
        let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
        set(parts.hour ?? hour, parts.minute ?? minute)
      }
    )
  }
}

/** The agent's screen, small and live; a tap opens it full (`ComputerSheet`). */
struct ComputerTab: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @State private var screen: ScreenState?
  @State private var phase = "starting"
  @State private var open = false
  #if os(macOS)
  /** On the Mac the computer opens in a window of its own (mac/Simeon/MacComputer.swift). */
  @Environment(\.openWindow) private var openWindow
  #endif

  var body: some View {
    VStack(spacing: 10) {
      Button {
        #if os(macOS)
        openWindow(id: "computer", value: agent.id)
        #else
        open = true
        #endif
      } label: {
        ZStack {
          RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(RGB(hex: "#1f3b73")))
          if let socket = screen?.socket {
            LiveScreen(socket: socket, viewOnly: true, phase: $phase)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
              .allowsHitTesting(false)
          }
          if screen?.socket == nil || phase != "connected" {
            VStack(spacing: 8) {
              ProgressView().tint(.white)
              Text(screen?.state == "demo" ? "The demo has no computer" : "Starting the computer…").font(.system(size: 13)).foregroundStyle(.white.opacity(0.75))
            }
          }
        }
        .aspectRatio(1280.0 / 800.0, contentMode: .fit)
      }
      .buttonStyle(.plain)
      Text("\(agent.name)'s screen").font(.system(size: 13)).foregroundStyle(Ink.secondary)
    }
    .task {
      for _ in 0..<40 {
        guard let next = try? await store.screen(agent.id) else { return }
        screen = next
        if next.socket != nil || next.state == "demo" { return }
        try? await Task.sleep(nanoseconds: 3_000_000_000)
      }
    }
    #if os(iOS)
    .sheet(isPresented: $open) { ComputerSheet(agentId: agent.id) }
    #endif
  }
}

/** A group's members, and Edit to choose them (`setGroupMembers`). */
struct GroupMembers: View {
  let group: Agent
  @Environment(AppStore.self) private var store
  @State private var editing = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("Members").font(.system(size: 13)).foregroundStyle(Ink.secondary)
        Spacer()
        Button("Edit") { editing = true }.font(.system(size: 15)).foregroundStyle(Ink.blue)
      }
      .padding(.bottom, 6)
      ForEach(store.members(of: group)) { member in
        HStack(spacing: 12) {
          AgentAvatar(agent: member).frame(width: 40, height: 40)
          VStack(alignment: .leading, spacing: 2) {
            Text(member.name).font(.system(size: 16)).foregroundStyle(Ink.primary)
            if !member.title.isEmpty { Text(member.title).font(.system(size: 13)).foregroundStyle(Ink.secondary) }
          }
          Spacer()
        }
        .padding(.vertical, 8)
        Rectangle().fill(Ink.hairline).frame(height: 1)
      }
    }
    .sheet(isPresented: $editing) { MembersEditor(group: group).problemAlert() }
  }
}

struct MembersEditor: View {
  let group: Agent
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var picked: Set<String> = []
  @State private var saving = false

  var body: some View {
    NavigationStack {
      // Hidden agents stay out of the picker, unless already in the group (saving must not drop them).
      List(store.agents.filter { !$0.isGroup && (!$0.isHidden || picked.contains($0.id)) }) { agent in
        Button {
          if picked.contains(agent.id) { picked.remove(agent.id) } else { picked.insert(agent.id) }
        } label: {
          HStack(spacing: 12) {
            AgentAvatar(agent: agent).frame(width: 40, height: 40)
            Text(agent.name).foregroundStyle(Ink.primary)
            Spacer()
            Image(systemName: picked.contains(agent.id) ? "checkmark.circle.fill" : "circle")
              .font(.system(size: 22)).foregroundStyle(picked.contains(agent.id) ? Ink.blue : Ink.tertiary)
          }
        }
      }
      .navigationTitle("Members")
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .leadingBar) { CloseButton() }
        ToolbarItem(placement: .trailingBar) {
          Button("Save") {
            let ids = store.agents.filter { picked.contains($0.id) }.map(\.id)
            saving = true
            Task { await store.setMembers(group.id, ids); dismiss() }
          }
          .disabled(saving || picked.count < 2)
        }
      }
      .onAppear { picked = Set(group.memberIds) }
    }
  }
}

/**
 * The pencil (the Mac's avatar editor, `c3n`): three tabs, as the Mac has
 * them. Agent: the twelve colours as butterflies and, when calls are on,
 * the Voice dropdown with a play button for the chosen voice's sample
 * (`__simeonVoicePicker`, names only). Generate: "Describe your avatar…",
 * Generate, then the picture to use or draw again. Upload: a photo, its
 * middle square kept. A group starts on Upload and has no Agent tab.
 */
struct AvatarEditor: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var tab = Tab.agent
  @State private var photo: PhotosPickerItem?
  @State private var description = ""
  @FocusState private var describing: Bool
  @State private var drawing = false
  @State private var drawn: UIImage?
  @State private var voices: [AppStore.VoiceChoice] = []
  @State private var sample: AVPlayer?
  @State private var playing: String?

  enum Tab: String, CaseIterable, Identifiable {
    case agent = "Agent", generate = "Generate", upload = "Upload"
    var id: String { rawValue }
  }

  var body: some View {
    NavigationStack {
      if let agent = store.agent(agentId) {
        ScrollView {
          VStack(spacing: 20) {
            Group {
              if let drawn { Image(uiImage: drawn).resizable().scaledToFill().clipShape(Circle()) } else { AgentAvatar(agent: agent, members: store.members(of: agent)) }
            }
            .frame(width: 110, height: 110)
            Picker("Avatar source", selection: $tab) {
              ForEach(agent.isGroup ? [Tab.generate, .upload] : Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            switch tab {
            case .agent: character(agent)
            case .generate: generate(agent)
            case .upload: upload(agent)
            }
          }
          .padding(20)
        }
        .navigationTitle("Avatar")
        .inlineBarTitle()
        .toolbar { ToolbarItem(placement: .trailingBar) { Button("Done") { dismiss() } } }
        .onAppear { if agent.isGroup && tab == .agent { tab = .upload } }
        // The picker shows once the agent's voice is settled: its own while listed, else one given by its name now (AgentVoices).
        .task {
          guard !agent.isGroup else { return }
          let list = await store.voices()
          _ = await store.ensureVoice(agent.id)
          voices = list
        }
        .onDisappear { sample?.pause(); sample = nil; playing = nil }
        .onChange(of: photo) { _, item in
          guard let item else { return }
          Task {
            guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
            await store.setAvatar(agent.id, png: Self.square(image, side: 512).pngData())
            photo = nil
          }
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  /** The Agent tab: the colours, then the voice. */
  @ViewBuilder
  private func character(_ agent: Agent) -> some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 14) {
      ForEach(AgentPalette.all, id: \.id) { palette in
        Button {
          Task { await store.saveProfile(agent.id, name: agent.name, title: agent.title, description: agent.description, colour: palette.id) }
        } label: {
          ButterflyView(palette: palette, style: .still)
            .frame(width: 40, height: 40)
            .padding(4)
            .overlay(Circle().stroke(agent.palette.id == palette.id && agent.avatarDataURL == nil ? Ink.blue : .clear, lineWidth: 2))
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(palette.label)
      }
    }
    if !voices.isEmpty {
      let current = AgentVoices.kept(agent.voiceId, listed: voices) ?? AppStore.defaultVoiceId
      let chosen = voices.first { $0.id == current } ?? voices.first
      VStack(alignment: .leading, spacing: 6) {
        Text("Voice").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.secondary).padding(.horizontal, 2)
        HStack(spacing: 8) {
          Picker("Voice", selection: Binding(get: { chosen?.id ?? current }, set: { id in Task { await store.setVoice(agent.id, id) } })) {
            ForEach(voices) { Text($0.name).tag($0.id) }
          }
          .pickerStyle(.menu)
          .tint(Ink.primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 4)
          .frame(height: 30)
          .background(Ink.control, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          Button { play(chosen) } label: {
            Image(systemName: playing != nil && playing == chosen?.id ? "pause.fill" : "play.fill")
              .font(.system(size: 12))
              .foregroundStyle(Ink.primary)
              .frame(width: 30, height: 30)
              .background(Color(.sRGB, red: 120 / 255, green: 120 / 255, blue: 128 / 255, opacity: 0.12), in: Circle())
              .contentShape(.circle)
          }
          .buttonStyle(.plain)
          .disabled(chosen?.sample == nil)
          .opacity(chosen?.sample == nil ? 0.4 : 1)
          .accessibilityLabel(playing == chosen?.id ? "Stop \(chosen?.name ?? "")" : "Play \(chosen?.name ?? "")")
        }
      }
    }
  }

  /** The chosen voice's sample, or stop it. */
  private func play(_ voice: AppStore.VoiceChoice?) {
    sample?.pause()
    guard let voice, let url = voice.sample, playing != voice.id else { sample = nil; playing = nil; return }
    #if os(iOS)
    try? AVAudioSession.sharedInstance().setCategory(.playback)
    #endif
    let player = AVPlayer(url: url)
    sample = player
    playing = voice.id
    player.play()
  }

  /** The Generate tab: a description, Generate, then the picture to use. */
  @ViewBuilder
  private func generate(_ agent: Agent) -> some View {
    if drawing {
      VStack(spacing: 12) {
        Text(description.replacingOccurrences(of: "\n", with: " ")).font(.system(size: 15)).foregroundStyle(Ink.secondary).frame(maxWidth: .infinity, alignment: .leading)
        ProgressView().accessibilityLabel("Generating avatar")
      }
    } else {
      TextField("Describe your avatar…", text: $description, axis: .vertical)
        .lineLimit(3...6)
        .font(.system(size: 15))
        .focused($describing)
        .padding(12)
        // The whole box takes the tap, not only the lines of text inside its padding.
        .background { RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.control).onTapGesture { describing = true } }
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Ink.edge, lineWidth: 1).allowsHitTesting(false))
      if let drawn {
        HStack(spacing: 10) {
          Button("Use this picture") {
            Task { await store.setAvatar(agent.id, png: Self.square(drawn, side: 512).pngData()); self.drawn = nil; dismiss() }
          }
          .buttonStyle(PillButtonStyle(primary: true))
          Button("Draw again") { draw() }.buttonStyle(PillButtonStyle(primary: false))
        }
      } else {
        Button("Generate") { draw() }
          .buttonStyle(PillButtonStyle(primary: true))
          .disabled(description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
  }

  private func draw() {
    drawing = true
    Task {
      let bytes = await store.drawPicture(description)
      drawn = bytes.flatMap(UIImage.init(data:)) ?? drawn
      drawing = false
    }
  }

  /** The Upload tab: a photo, or back to the butterfly. */
  @ViewBuilder
  private func upload(_ agent: Agent) -> some View {
    PhotosPicker(selection: $photo, matching: .images) {
      Label("Choose a photo", systemImage: "photo").frame(maxWidth: .infinity)
    }
    .buttonStyle(PillButtonStyle(primary: false))
    if agent.avatarDataURL != nil {
      Button("Use the butterfly") { Task { await store.setAvatar(agent.id, png: nil) } }
        .buttonStyle(PillButtonStyle(primary: false))
    }
  }

  /** The middle square of a photo, at `side` points: the avatar's own shape. */
  static func square(_ image: UIImage, side: CGFloat) -> UIImage {
    let shortest = min(image.size.width, image.size.height)
    let scale = side / shortest
    let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
      image.draw(in: CGRect(x: (side - drawn.width) / 2, y: (side - drawn.height) / 2, width: drawn.width, height: drawn.height))
    }
  }
}
