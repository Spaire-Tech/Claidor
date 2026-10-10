import AppKit
import SwiftUI
import SimeonCore

/**
 * The agent pane's Routines (7c), as the window has them (`K2n`, `_2n`,
 * `P2n`): the list with New Routine, or the empty state; a routine's editor,
 * which takes the whole pane (Back to Routines, Active, Delete, Test run,
 * Name, Instruction, When to run, Run history). Nothing is sent while typing:
 * a field is saved when it lets go of the keys, a trigger when it is picked
 * or its popover closes, and a new routine is made only once it has a name,
 * an instruction and a trigger that is right.
 */
@MainActor
@Observable
final class RoutineEditorModel {
  let agentId: String
  /** Nil for a new routine until its create comes back; then the same editor goes on with the record (`onCreated`). */
  private(set) var routineId: String?
  /** Opened from New Routine: the name field takes the keys. */
  let isNew: Bool

  /** The fields as typed. */
  var name: String
  var prompt: String
  /** The stored name, instruction and trigger as last seen (`W`, `G`, `te`): a field still showing them follows a change. */
  @ObservationIgnored private var seenName: String
  @ObservationIgnored private var seenPrompt: String
  @ObservationIgnored private var seenTrigger: JSON

  /** When to run, as edited (`draft.rows`), and the card's last rows that were right (`N`). */
  var rows: [TriggerRow]
  @ObservationIgnored private var lastValid: [TriggerRow]
  /** The only row was removed: the Add menu opened by itself, and closing it leaves the card empty (`k`). */
  @ObservationIgnored private var removedLast = false

  /** A new routine's Active switch, on at first (`h`, `k`). */
  var activeDraft = true
  /** The Active switch's call is on its way: the switch waits (`I.isPending`). */
  private(set) var toggling = false
  /** The create is on its way (`A.isPending`); what was changed meanwhile (`Q`) and whether Delete was pressed (`ae`). */
  private(set) var creating = false
  @ObservationIgnored private var queued: (name: String?, prompt: String?, trigger: JSON?)?
  @ObservationIgnored private var deleteAfterCreate = false
  /** Test run's call is on its way (`J.isPending`). */
  private(set) var testing = false
  /** "Couldn't save this routine.", until the next save is tried (`v`). */
  var saveFailed = false

  /** The row whose popover is open, one at a time. */
  var popover: Int?
  /** Bumped to open the Add menu by itself (the only row removed). */
  var addMenuRequests = 0
  /** Bumped by Test run: Run history comes into view. */
  var historyRequests = 0

  init(agentId: String, routine: Routine?) {
    self.agentId = agentId
    routineId = routine?.id
    isNew = routine == nil
    name = routine?.name ?? ""
    prompt = routine?.prompt ?? ""
    seenName = routine?.name ?? ""
    seenPrompt = routine?.prompt ?? ""
    seenTrigger = routine?.trigger ?? .null
    let rows = TriggerRow.rows(routine?.trigger)
    self.rows = rows
    lastValid = rows
  }

  func stored(_ store: AppStore) -> Routine? {
    guard let routineId else { return nil }
    return store.routinesByAgent[agentId]?.first { $0.id == routineId }
  }

  // MARK: The stored record changed

  /** A field still showing the stored words follows them; the rows follow the stored trigger while they equal the one before (`W`, `G`, `te`). */
  func follow(_ routine: Routine?) {
    guard let routine else { return }
    if routine.name != seenName {
      if name == seenName { name = routine.name }
      seenName = routine.name
    }
    if routine.prompt != seenPrompt {
      if prompt == seenPrompt { prompt = routine.prompt }
      seenPrompt = routine.prompt
    }
    let trigger = routine.trigger ?? .null
    if trigger != seenTrigger {
      if let current = TriggerRow.trigger(rows), current == seenTrigger { rows = TriggerRow.rows(routine.trigger) }
      seenTrigger = trigger
    }
  }

  // MARK: Saving (`X`, `xe`, `fe`)

  /** What a save sends: for a stored routine an empty field keeps what is stored and the switch's pending value goes (`X`). */
  private func spec(_ trigger: JSON, store: AppStore) -> JSON? {
    if let stored = stored(store) {
      return RoutineDraft.updateSpec(stored, name: name, prompt: prompt, trigger: trigger, isEnabled: stored.isEnabled)
    }
    return RoutineDraft.newSpec(name: name, prompt: prompt, trigger: trigger, isEnabled: activeDraft)
  }

  /** The current trigger: the rows when they are right, else the stored one (`be`). */
  private func currentTrigger(_ store: AppStore) -> JSON? {
    TriggerRow.trigger(rows) ?? stored(store)?.trigger
  }

  /** A new routine made once it is whole (`xe`); edits while it is made go after it as one update, if they change anything. */
  private func create(_ trigger: JSON?, store: AppStore) {
    guard routineId == nil, !creating, let trigger, let spec = spec(trigger, store: store) else { return }
    creating = true
    let agentId = agentId
    Task {
      let made = await store.createRoutine(agentId, spec: spec)
      creating = false
      guard let made else {
        queued = nil
        deleteAfterCreate = false
        saveFailed = true
        return
      }
      if deleteAfterCreate {
        deleteAfterCreate = false
        queued = nil
        await store.removeRoutine(agentId, made.id)
        return
      }
      if made.isEnabled != activeDraft { setEnabled(made.id, activeDraft, store: store) }
      let pending = queued
      queued = nil
      routineId = made.id
      if let pending {
        let next: JSON = ["name": .string(pending.name ?? made.name), "prompt": .string(pending.prompt ?? made.prompt),
                          "trigger": pending.trigger ?? made.trigger ?? .null, "isEnabled": .bool(activeDraft)]
        if !RoutineDraft.unchanged(made, spec: next), !(await store.updateRoutine(agentId, made.id, spec: next)) { saveFailed = true }
      }
    }
  }

  /** A stored routine changed (`fe`). */
  private func update(_ trigger: JSON?, store: AppStore) {
    guard let routineId, let trigger, let spec = spec(trigger, store: store) else { return }
    let agentId = agentId
    Task {
      if !(await store.updateRoutine(agentId, routineId, spec: spec)) { saveFailed = true }
    }
  }

  /** Name let go of the keys (`Ae`): empty or unchanged puts the stored name back; else it is saved. */
  func nameDone(store: AppStore) {
    saveFailed = false
    let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if let stored = stored(store) {
      if value.isEmpty || value == stored.name { name = stored.name; return }
      update(currentTrigger(store) ?? stored.trigger, store: store)
      return
    }
    if creating {
      if !value.isEmpty { queued = (value, queued?.prompt, queued?.trigger) }
      return
    }
    create(currentTrigger(store), store: store)
  }

  /** Instruction let go of the keys (`ve`), as Name. */
  func promptDone(store: AppStore) {
    saveFailed = false
    let value = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    if let stored = stored(store) {
      if value.isEmpty || value == stored.prompt { prompt = stored.prompt; return }
      update(currentTrigger(store) ?? stored.trigger, store: store)
      return
    }
    if creating {
      if !value.isEmpty { queued = (queued?.name, value, queued?.trigger) }
      return
    }
    create(currentTrigger(store), store: store)
  }

  /** The rows committed (`ye`): saved when right and not what is stored. */
  private func save(rows next: [TriggerRow], store: AppStore) {
    saveFailed = false
    rows = next
    guard let trigger = TriggerRow.trigger(next) else { return }
    if let stored = stored(store) {
      if trigger == (stored.trigger ?? .null) { return }
      update(trigger, store: store)
      return
    }
    if creating {
      queued = (queued?.name, queued?.prompt, trigger)
      return
    }
    create(trigger, store: store)
  }

  // MARK: The card's rows (`P2n`: `J`, `O`, `L`, `V`, `W`, `B`)

  /** A commit: the rows, if right, become the last right ones; then saved (`J`). */
  func commit(_ next: [TriggerRow], store: AppStore) {
    if TriggerRow.trigger(next) != nil { lastValid = next }
    save(rows: next, store: store)
  }

  /** A popover or the Add menu closed with no pick (`O`, `de`): rows that are right are saved; else they go back (the stored trigger, or a new routine's last right rows). */
  func commitOrRevert(store: AppStore) {
    if TriggerRow.trigger(rows) != nil {
      lastValid = rows
      save(rows: rows, store: store)
    } else if let stored = stored(store) {
      rows = TriggerRow.rows(stored.trigger)
    } else {
      rows = lastValid
    }
  }

  /** A row typed into or chosen, saved now when `commits` (a pick, a field letting go of the keys). */
  func set(_ index: Int, _ row: TriggerRow, commits: Bool, store: AppStore) {
    guard rows.indices.contains(index) else { return }
    var next = rows
    next[index] = row
    if commits { commit(next, store: store) } else { rows = next }
  }

  /** A row added from the Add menu (`L`): committed now when it is right alone. Its index. */
  @discardableResult
  private func add(_ row: TriggerRow, store: AppStore) -> Int {
    removedLast = false
    let next = rows + [row]
    if TriggerRow.trigger([row]) != nil { commit(next, store: store) } else { rows = next }
    return next.count - 1
  }

  /** A schedule from the Add menu (`D`): saved at once; its popover opens for Every week, Every month, Interval and Advanced. */
  func addSchedule(_ line: String, opens: Bool, store: AppStore) {
    let index = add(.schedule(line), store: store)
    popover = opens ? index : nil
  }

  /** An event source from the Add menu (`F`): its row, and its popover open. */
  func addSource(_ platform: String, store: AppStore) {
    popover = add(TriggerRow.new(platform), store: store)
  }

  /** × on a row (`V`): with others left it goes and the rest is saved; the only row empties the card (nothing is saved) and the Add menu opens. */
  func remove(_ index: Int, store: AppStore) {
    popover = nil
    if rows.count <= 1 {
      lastValid = []
      rows = []
      removedLast = true
      addMenuRequests += 1
      return
    }
    var next = rows
    next.remove(at: index)
    commit(next, store: store)
  }

  /** The Add menu closed (`W`): with no pick the rows are kept or go back, unless the only row was just removed. */
  func addMenuClosed(picked: Bool, store: AppStore) {
    guard !picked, !removedLast else { return }
    commitOrRevert(store: store)
  }

  /** The popover closed (`B`): ×, Escape or a click outside it. */
  func closePopover(store: AppStore) {
    guard popover != nil else { return }
    popover = nil
    commitOrRevert(store: store)
  }

  // MARK: The control bar

  /** The switch's value: a new routine's own, else the stored one (changed at once while its call is on its way). */
  func isActive(_ store: AppStore) -> Bool { stored(store)?.isEnabled ?? activeDraft }

  /** The Active switch (`Je`): a new routine keeps it for its create; a stored one is changed now, and goes back if refused. */
  func toggleActive(_ on: Bool, store: AppStore) {
    guard let routineId else {
      activeDraft = on
      return
    }
    setEnabled(routineId, on, store: store)
  }

  private func setEnabled(_ id: String, _ on: Bool, store: AppStore) {
    toggling = true
    let agentId = agentId
    Task {
      _ = await store.enableRoutine(agentId, id, on)
      toggling = false
    }
  }

  /** Delete (`Ie`): no question; a routine being made is deleted when its create comes back. The pane goes back to the list at once. */
  func delete(store: AppStore) {
    if let routineId {
      let agentId = agentId
      Task { await store.removeRoutine(agentId, routineId) }
    } else if creating {
      deleteAfterCreate = true
    }
  }

  /** Test run (`we`): the run asked for, the list read again, Run history brought into view. */
  func testRun(store: AppStore, blocks: RoutineRunBlocks) {
    guard let routineId else { return }
    historyRequests += 1
    testing = true
    let agentId = agentId
    Task {
      await blocks.run(agentId, routineId, store: store)
      testing = false
    }
  }

  /** "Running…" and not pressable: its call on its way, the wait after it (`rJt`), or its newest run still going (`Le`). */
  func isRunning(_ store: AppStore, blocks: RoutineRunBlocks) -> Bool {
    guard let routineId else { return false }
    return testing || blocks.isBlocked(agentId, routineId) || stored(store)?.isRunning == true
  }
}

/**
 * Test run's waits, for every routine (`runNowBlockedFor`): set on the click,
 * held while the run it started is awaited and while it runs, lifted 3
 * seconds after it ends, or at once when the routine goes or the run is refused.
 */
@MainActor
@Observable
final class RoutineRunBlocks {
  private(set) var blocked: Set<String> = []
  @ObservationIgnored private var flights: [String: RoutineRunFlight] = [:]
  @ObservationIgnored private var expiries: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var watching: Set<String> = []

  private static func key(_ agentId: String, _ routineId: String) -> String { agentId + "\u{1f}" + routineId }

  func isBlocked(_ agentId: String, _ routineId: String) -> Bool { blocked.contains(Self.key(agentId, routineId)) }

  /** Test run (`runNow`): once at a time per routine. */
  func run(_ agentId: String, _ routineId: String, store: AppStore) async {
    let key = Self.key(agentId, routineId)
    guard flights[key] == nil else { return }
    flights[key] = RoutineRunFlight(before: store.routinesByAgent[agentId]?.first { $0.id == routineId })
    blocked.insert(key)
    watch(agentId, store: store)
    guard await store.testRoutine(agentId, routineId) else {
      if flights[key]?.phase != .cooldown { end(key) }
      return
    }
    take(agentId, store: store)
    if var flight = flights[key] {
      flight.afterRead()
      place(key, flight)
    }
  }

  /** The agent's list changed: each of its waits moves on. */
  private func take(_ agentId: String, store: AppStore) {
    let prefix = agentId + "\u{1f}"
    for (key, var flight) in flights where key.hasPrefix(prefix) {
      let routineId = String(key.dropFirst(prefix.count))
      if flight.take(store.routinesByAgent[agentId]?.first { $0.id == routineId }) { place(key, flight) } else { end(key) }
    }
  }

  private func place(_ key: String, _ flight: RoutineRunFlight) {
    flights[key] = flight
    guard flight.phase == .cooldown, expiries[key] == nil else { return }
    expiries[key] = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(RoutineRunFlight.cooldownSeconds * 1_000_000_000))
      guard !Task.isCancelled else { return }
      self?.end(key)
    }
  }

  private func end(_ key: String) {
    flights[key] = nil
    expiries[key]?.cancel()
    expiries[key] = nil
    blocked.remove(key)
  }

  /** Watches the agent's list while one of its routines waits. */
  private func watch(_ agentId: String, store: AppStore) {
    guard !watching.contains(agentId) else { return }
    watching.insert(agentId)
    observe(agentId, store: store)
  }

  private func observe(_ agentId: String, store: AppStore) {
    withObservationTracking {
      _ = store.routinesByAgent[agentId]
    } onChange: { [weak self] in
      Task { @MainActor [weak self] in
        guard let self else { return }
        self.take(agentId, store: store)
        if self.flights.keys.contains(where: { $0.hasPrefix(agentId + "\u{1f}") }) {
          self.observe(agentId, store: store)
        } else {
          self.watching.remove(agentId)
        }
      }
    }
  }
}

// MARK: - The list

/**
 * The Routines tab's body (`K2n`, a column 6 apart): New Routine at the
 * right when there are routines, then their rows; the empty state when
 * there are none; nothing while the first read is on its way or failed.
 */
struct RoutinesBody: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(PaneState.self) private var pane

  var body: some View {
    let list = store.routinesByAgent[agent.id]
    Group {
      if let list {
        if list.isEmpty {
          RoutinesEmpty(look: look) { pane.openRoutine(nil, agentId: agent.id) }
        } else {
          VStack(spacing: 6) {
            HStack(spacing: 0) {
              Spacer(minLength: 0)
              NewRoutineButton(look: look) { pane.openRoutine(nil, agentId: agent.id) }
            }
            .frame(height: 24)
            VStack(spacing: 2) {
              ForEach(Routine.listed(list)) { routine in
                RoutineRow(routine: routine, look: look) { pane.openRoutine(routine, agentId: agent.id) }
              }
            }
          }
        }
      } else {
        // `loading` with nothing before, `failed` with nothing before, `unavailable`: nothing is drawn.
        Color.clear.frame(height: 0)
      }
    }
    .task(id: agent.id) {
      await store.loadRoutines(agent.id)
      takeRequest()
    }
    .onChange(of: list) { _, _ in takeRequest() }
    .onChange(of: pane.routineRequest) { _, _ in takeRequest() }
    .onAppear { takeRequest() }
  }

  /** A routine's chip asked for its editor: opened once the list has it, else the list stays (`W2n`). */
  private func takeRequest() {
    guard let id = pane.routineRequest, let list = store.routinesByAgent[agent.id] else { return }
    pane.routineRequest = nil
    if let routine = list.first(where: { $0.id == id }) { pane.openRoutine(routine, agentId: agent.id) }
  }
}

/** New Routine (`plus` 12, 14/20 medium, 5 apart): plain, at 65% under the pointer. */
private struct NewRoutineButton: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: "plus")
          .font(.system(size: 11, weight: .medium))
          .frame(width: 12, height: 12)
        Text("New Routine")
          .font(.system(size: 14, weight: .medium))
      }
      .foregroundStyle(look.paneInk)
      .padding(.vertical, 2)
      .opacity(hovering ? 0.65 : 1)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

/**
 * A routine's row (`H2n`, roomy): 48 high, round 10, 8 into the pane's
 * padding on both sides; the clock (green), the spinner (blue, turning)
 * while its run goes, or the pause sign (grey); its name over the host's
 * words for when it runs, or "Paused".
 */
private struct RoutineRow: View {
  let routine: Routine
  let look: Look
  let open: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: open) {
      HStack(spacing: 8) {
        RoutineIcon(routine: routine, look: look)
        VStack(alignment: .leading, spacing: 0) {
          RoutineLine(text: routine.name, color: look.ink)
          RoutineLine(text: routine.rowDetail, color: look.inkSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 8))
      .frame(height: 48)
      .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(hovering ? look.fillHover : .clear))
      .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
    .padding(.horizontal, -8)
    .onHover { inside in withAnimation(.easeInOut(duration: 0.12)) { hovering = inside } }
    .accessibilityLabel("\(routine.name), \(routine.rowDetail)")
  }
}

/** One of a row's lines: 13/18, -0.08, one line, cut at its end. */
private struct RoutineLine: View {
  let text: String
  let color: Color

  var body: some View {
    Text(text)
      .font(.system(size: 13))
      .tracking(-0.08)
      .foregroundStyle(color)
      .lineLimit(1)
      .truncationMode(.tail)
      .frame(height: 18)
  }
}

/** The row's icon, 14 in an 18 box. */
private struct RoutineIcon: View {
  let routine: Routine
  let look: Look

  var body: some View {
    Group {
      if !routine.isEnabled {
        Image(systemName: "pause.circle")
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
      } else if routine.isRunning {
        RoutineSpinner(color: look.accent, size: 14)
      } else {
        ClockGlyph()
          .stroke(look.success, style: StrokeStyle(lineWidth: 1.6 * 14 / 24, lineCap: .round, lineJoin: .round))
          .frame(width: 14, height: 14)
      }
    }
    .frame(width: 18, height: 18)
  }
}

/** The window's `loading` glyph: eight spokes fading round, turning once each 1.2 s (still with Reduce Motion). */
struct RoutineSpinner: View {
  let color: Color
  let size: CGFloat
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(paused: reduceMotion)) { context in
      let turn = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.2) / 1.2
      ZStack {
        ForEach(0..<8, id: \.self) { index in
          Capsule()
            .fill(color.opacity(0.25 + 0.75 * Double(index) / 7))
            .frame(width: size * 0.12, height: size * 0.28)
            .offset(y: -size * 0.33)
            .rotationEffect(.degrees(Double(index) * 45))
        }
      }
      .frame(width: size, height: size)
      .rotationEffect(.degrees(turn * 360))
    }
    .accessibilityLabel("Running")
  }
}

/** The clock (`<circle r=8.2>`, `M12 7.4V12l3.1 2`) on a 24-point view. */
struct ClockGlyph: Shape {
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

/**
 * No routines (`K2n`'s empty state, a column 18 apart, padded 12 above): the
 * 56-point tile (round 15) with the clock, the words (15/21, at most 256
 * wide) and Create Routine (a 32-point capsule in the pane's ink).
 */
private struct RoutinesEmpty: View {
  let look: Look
  let create: () -> Void

  var body: some View {
    VStack(spacing: 18) {
      ClockGlyph()
        .stroke(look.paneInk, style: StrokeStyle(lineWidth: 1.6 * 26 / 24, lineCap: .round, lineJoin: .round))
        .frame(width: 26, height: 26)
        .frame(width: 56, height: 56)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(look.paneFill))
      Text(RoutineDraft.empty)
        .font(.system(size: 15))
        .lineSpacing(LineBox.extra(size: 15, lineHeight: 21))
        .foregroundStyle(look.paneInk2)
        .multilineTextAlignment(.center)
        .frame(maxWidth: 256)
        .fixedSize(horizontal: false, vertical: true)
      Button(action: create) {
        Text("Create Routine")
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(look.paneGround)
          .padding(.horizontal, 16)
          .frame(height: 32)
          .background(Capsule().fill(look.paneInk))
          .contentShape(Capsule())
      }
      .buttonStyle(.plain)
    }
    .padding(EdgeInsets(top: 12, leading: 8, bottom: 0, trailing: 8))
    .frame(maxWidth: .infinity)
  }
}

// MARK: - The editor

/**
 * A routine's editor (`_2n`): it takes the whole pane. The top bar (44:
 * Back to Routines, "Routine" in the middle, Close), the control bar (44,
 * fixed: Active, Delete, Test run; its hairline shows as the body scrolls
 * its first 16 points), then the body scrolling under it.
 */
struct RoutineEditorPage: View {
  let agent: Agent
  @Bindable var model: RoutineEditorModel
  let width: CGFloat
  @Environment(AppStore.self) private var store
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout
  @Environment(\.colorScheme) private var scheme
  @State private var scrolled: CGFloat = 0

  var body: some View {
    let look = Look(scheme)
    VStack(spacing: 0) {
      RoutineTopBar(look: look, back: { pane.backToRoutines() }, close: { pane.close(layout: layout) })
      RoutineControlBar(model: model, look: look) {
        model.delete(store: store)
        pane.backToRoutines()
      }
      .overlay(alignment: .bottom) {
        Rectangle().fill(look.ink.opacity(0.10)).frame(height: 0.5).opacity(min(1, max(0, scrolled / 16)))
      }
      .zIndex(1)
      ScrollViewReader { proxy in
        ScrollView {
          RoutineEditorBody(model: model, look: look, width: max(0, width - 24))
            .padding(EdgeInsets(top: 4, leading: 12, bottom: 16, trailing: 12))
            .frame(width: width, alignment: .top)
        }
        .scrollIndicators(.automatic)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
          geometry.contentOffset.y + geometry.contentInsets.top
        } action: { _, offset in
          scrolled = offset
        }
        .onChange(of: model.historyRequests) { _, _ in
          withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(RoutineEditorBody.historyId) }
        }
      }
    }
    .onAppear { model.follow(model.stored(store)) }
    .onChange(of: store.routinesByAgent[agent.id]) { _, list in
      guard let id = model.routineId, let list else { return }
      // The routine is gone (deleted elsewhere): back to the list.
      if let routine = list.first(where: { $0.id == id }) { model.follow(routine) } else { pane.backToRoutines() }
    }
  }
}

/** The editor's top bar (`Nmt`): Back (28 × 28, round 6), "Routine" in the middle (13/18 medium), Close; the rest moves the window. */
private struct RoutineTopBar: View {
  let look: Look
  let back: () -> Void
  let close: () -> Void

  var body: some View {
    ZStack {
      WindowDragArea()
      Text("Routine")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.ink)
        .allowsHitTesting(false)
      HStack(spacing: 8) {
        PaneIconButton(systemImage: "chevron.left", label: "Back to Routines", help: "Back to Routines", look: look, action: back)
        Spacer(minLength: 0)
        PaneIconButton(systemImage: "xmark", label: "Close details", help: "Close", look: look, action: close)
      }
      .padding(.horizontal, 12)
    }
    .frame(height: 44)
  }
}

/**
 * The control bar (16 left, 12 right): the Mac's switch and "Active"
 * (6 apart); Delete (secondary) and Test run (primary), 8 apart, each 32
 * high, round 8. Test run waits for a new routine to be saved, and reads
 * "Running…" while its run is on its way or going.
 */
private struct RoutineControlBar: View {
  @Bindable var model: RoutineEditorModel
  let look: Look
  let delete: () -> Void
  @Environment(AppStore.self) private var store
  @Environment(PaneState.self) private var pane

  var body: some View {
    let running = model.isRunning(store, blocks: pane.runBlocks)
    HStack(spacing: 8) {
      HStack(spacing: 6) {
        Toggle("", isOn: Binding(get: { model.isActive(store) }, set: { @MainActor on in model.toggleActive(on, store: store) }))
          .toggleStyle(.switch)
          .labelsHidden()
          .controlSize(.small)
          .tint(look.paneSwitchOn)
          .disabled(model.toggling)
          .accessibilityLabel("Active")
        Text("Active")
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
      }
      Spacer(minLength: 0)
      HStack(spacing: 8) {
        RoutineButton(title: "Delete", primary: false, disabled: false, look: look, action: delete)
        RoutineButton(title: running ? "Running\u{2026}" : "Test run", primary: true, disabled: model.routineId == nil || running, look: look) {
          model.testRun(store: store, blocks: pane.runBlocks)
        }
      }
    }
    .padding(.leading, 16)
    .padding(.trailing, 12)
    .frame(height: 44)
  }
}

/** Delete (the grey fill, darker under the pointer) and Test run (the ink fill; pale and not pressable while disabled): 32 high, padded 10, round 8, 14/20. */
private struct RoutineButton: View {
  let title: String
  let primary: Bool
  let disabled: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14))
        .foregroundStyle(primary ? (disabled ? look.ink.opacity(0.3) : look.onPrimary) : look.ink)
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(fill))
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .onHover { hovering = $0 }
  }

  private var fill: Color {
    if primary {
      if disabled { return look.ink.opacity(0.15) }
      return hovering ? look.primaryFillHover : look.primaryFill
    }
    return hovering ? look.fillHover : look.rowHover
  }
}

/**
 * The editor's body (12 apart): the save error, Name (30 high, round 10),
 * Instruction (80 to 160 high, then it scrolls), When to run, Run history.
 */
private struct RoutineEditorBody: View {
  static let historyId = "routine-history"
  @Bindable var model: RoutineEditorModel
  let look: Look
  let width: CGFloat
  @Environment(AppStore.self) private var store
  @Environment(PaneState.self) private var pane
  @Environment(SidebarLayout.self) private var layout
  @FocusState private var nameFocused: Bool
  /** `nameFocused` kept past the field's going (see `PaneLineField.editing`). */
  @State private var nameEditing = false
  @State private var promptFocused = false
  @State private var promptHeight: CGFloat = 20

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      if model.saveFailed {
        Text(RoutineDraft.saveError)
          .font(.system(size: 13))
          .foregroundStyle(look.danger)
          .frame(height: 18)
          .padding(.horizontal, 8)
      }
      RoutineSection(title: "Name", look: look) {
        TextField("", text: $model.name, prompt: Text("Name this routine").foregroundStyle(look.inkTertiary))
          .textFieldStyle(.plain)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .focused($nameFocused)
          .focusEffectDisabled()
          .autocorrectionDisabled()
          // Escape is the window's: the pane closes (the field is saved as it goes).
          .onExitCommand { pane.close(layout: layout) }
          .padding(.horizontal, 10)
          .frame(height: 30)
          .background(RoutineFieldBox(look: look))
          .accessibilityLabel("Name")
      }
      RoutineSection(title: "Instruction", look: look) {
        PaneTextArea(text: $model.prompt, focused: $promptFocused, height: $promptHeight, ink: NSColor(look.ink), editable: true, fontSize: 14, lineHeight: 20) {
          pane.close(layout: layout)
        }
        .frame(height: min(160 - 16, max(80 - 16, promptHeight)))
        .overlay(alignment: .topLeading) {
          if model.prompt.isEmpty {
            Text("What should this routine do each time it runs?")
              .font(.system(size: 14))
              .foregroundStyle(look.inkTertiary)
              .allowsHitTesting(false)
          }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(RoutineFieldBox(look: look))
        .accessibilityLabel("Instruction")
      }
      RoutineSection(title: "When to run", look: look) {
        TriggerCard(model: model, look: look, width: width)
      }
      .zIndex(1)
      RoutineSection(title: "Run history", look: look) {
        RunHistory(runs: model.stored(store)?.runs ?? [], look: look)
      }
      .id(Self.historyId)
    }
    .frame(width: width, alignment: .topLeading)
    .onChange(of: nameFocused) { _, now in
      nameEditing = now
      if !now { model.nameDone(store: store) }
    }
    .onChange(of: promptFocused) { _, now in if !now { model.promptDone(store: store) } }
    .onAppear {
      // Only a new routine's name takes the keys.
      if model.isNew && model.routineId == nil {
        DispatchQueue.main.async { nameFocused = true }
      }
    }
    .onDisappear {
      // Back, ×, or another agent while a field held the keys: saved as letting go would.
      if nameEditing { nameEditing = false; model.nameDone(store: store) }
      if promptFocused { model.promptDone(store: store) }
    }
  }
}

/** A field's box: a 1-point line at 15%, round 10, on the window's ground. */
private struct RoutineFieldBox: View {
  let look: Look

  var body: some View {
    RoundedRectangle(cornerRadius: 10, style: .continuous)
      .fill(look.ground)
      .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
  }
}

/** A section: its head (12/16, grey, padded 8 8 6) over its control. */
private struct RoutineSection<Content: View>: View {
  let title: String
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .frame(height: 16)
        .padding(EdgeInsets(top: 8, leading: 8, bottom: 6, trailing: 8))
      content()
    }
  }
}

/**
 * Run history (`J2n`): every run the record carries, newest first, each 30
 * high: when it began ("Just now", "4 min ago", "Yesterday at 5:08 PM",
 * again every 30 seconds) and its sign (✓ green, × red, the spinner); its
 * detail or event under the pointer. "No runs yet" when there are none.
 */
private struct RunHistory: View {
  let runs: [RoutineRun]
  let look: Look

  var body: some View {
    if runs.isEmpty {
      Text("No runs yet")
        .font(.system(size: 13))
        .foregroundStyle(look.inkTertiary)
        .frame(height: 18)
        .padding(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 8))
    } else {
      TimelineView(.periodic(from: .now, by: 30)) { context in
        let now = context.date.timeIntervalSince1970 * 1000
        VStack(spacing: 2) {
          ForEach(runs) { run in
            HStack(spacing: 8) {
              Text(run.startedAt.map { RoutineSchedule.when($0, now: now, zone: .current) } ?? "")
                .font(.system(size: 13))
                .foregroundStyle(look.ink)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
              RunStatusIcon(status: run.status, look: look)
            }
            .padding(.horizontal, 8)
            .frame(height: 30)
            .contentShape(Rectangle())
            .help(run.summary)
          }
        }
      }
    }
  }
}

/** A run's sign, 14 in an 18 box. */
private struct RunStatusIcon: View {
  let status: String
  let look: Look

  var body: some View {
    Group {
      switch status {
      case "running":
        RoutineSpinner(color: look.accent, size: 14)
      case "ok":
        Image(systemName: "checkmark")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(look.success)
      default:
        Image(systemName: "xmark")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(look.danger)
      }
    }
    .frame(width: 18, height: 18)
    .accessibilityLabel(RoutineWords.runStatus(status))
  }
}

// MARK: - Colours

extension Look {
  /** Green words and signs (`--sand-text-success`): an active routine's clock, a run that went well. */
  var success: Color { dark ? Color(hex: 0x38d591) : Color(hex: 0x009957) }
  /** The blue of a running routine's spinner (`--sand-text-accent`). */
  var accent: Color { link }
  /** The grey fill under the pointer (`--sand-fill-secondary-hover`). */
  var fillHover: Color { Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(dark ? 0.32 : 0.17) }
  /** A primary button (`--sand-fill-primary`, its hover) and its words. */
  var primaryFill: Color { dark ? Color(hex: 0xfafafa) : Color(hex: 0x070707) }
  var primaryFillHover: Color { dark ? Color(hex: 0xd5d5d5) : Color(hex: 0x2f2f2f) }
  var onPrimary: Color { dark ? Color(hex: 0x141414) : Color(hex: 0xfcfcfc) }
}
