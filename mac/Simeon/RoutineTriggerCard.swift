import AppKit
import SwiftUI
import SimeonCore

/**
 * When to run (`P2n`): a card (padded 6, a half-point line at 15%, round
 * 12) of the routine's triggers, 30 high and 2 apart, each its sign and
 * sentence with × at its right under the pointer; then Add trigger, or Add
 * another (none at eight). A row opens its popover just under it, over the
 * rows below (one at a time); a click outside it, or Escape, closes it, and
 * closing keeps rows that are right and puts back rows that are not.
 */
struct TriggerCard: View {
  @Bindable var model: RoutineEditorModel
  let look: Look
  let width: CGFloat
  @Environment(AppStore.self) private var store
  @State private var addFrame: CGRect = .zero
  @State private var cardHeight: CGFloat = 0
  @State private var popoverHeight: CGFloat = 0

  var body: some View {
    let inner = max(0, width - 12)
    let popoverTop = model.popover.map { 6 + CGFloat($0 + 1) * 32 } ?? 0
    // The popover hangs below the card; the page grows by what it hangs over, so it can be scrolled to (the window's absolute popover does).
    let overhang = model.popover == nil ? 0 : max(0, popoverTop + popoverHeight - cardHeight)
    VStack(alignment: .leading, spacing: 2) {
      ForEach(Array(model.rows.enumerated()), id: \.offset) { index, row in
        TriggerRowView(row: row, look: look) {
          model.popover = index
        } remove: {
          model.remove(index, store: store)
        }
      }
      if model.rows.count < TriggerRow.limit {
        AddTriggerButton(label: RoutineWords.addLabel(rows: model.rows.count), look: look) { showAddMenu() }
          .background(WindowFrameReader { addFrame = $0 })
          .padding(EdgeInsets(top: 4, leading: 2, bottom: 4, trailing: 2))
      }
    }
    .padding(6)
    .frame(width: width, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(look.ground)
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 0.5))
    )
    .background(GeometryReader { proxy in
      Color.clear
        .onAppear { cardHeight = proxy.size.height }
        .onChange(of: proxy.size.height) { _, height in cardHeight = height }
    })
    .overlay(alignment: .topLeading) {
      if let index = model.popover, model.rows.indices.contains(index) {
        TriggerPopover(model: model, index: index, look: look, width: inner)
          .background(GeometryReader { proxy in
            Color.clear
              .onAppear { popoverHeight = proxy.size.height }
              .onChange(of: proxy.size.height) { _, height in popoverHeight = height }
          })
          // The window's full-window layer behind it: a click anywhere else only closes it.
          .background(OutsideClickCatcher(excluded: { .zero }, swallows: true) { model.closePopover(store: store) })
          .offset(x: 6, y: popoverTop)
      }
    }
    .padding(.bottom, overhang)
    .onChange(of: model.addMenuRequests) { _, _ in
      // The only row removed: the Add menu opens by itself once the card has drawn its button where it now is.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { showAddMenu() }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Triggers")
  }

  private func showAddMenu() {
    guard model.popover == nil else { return }
    RoutineMenus.add(model: model, store: store, dark: look.dark, under: addFrame)
  }
}

/** A trigger's row: its sign (the clock 14 in 18, a logo 16) and its sentence, first word in the text's colour and the rest grey; × (20, round 6) at its right while the pointer is on the row. */
private struct TriggerRowView: View {
  let row: TriggerRow
  let look: Look
  let open: () -> Void
  let remove: () -> Void
  @State private var hovering = false
  @State private var removeHovering = false

  var body: some View {
    let words = row.words
    ZStack(alignment: .trailing) {
      Button(action: open) {
        HStack(spacing: 4) {
          TriggerGlyph(platform: row.platform, look: look, size: 16)
          (Text(words.lead).foregroundStyle(look.ink) + Text(" " + words.rest).foregroundStyle(look.inkSecondary))
            .font(.system(size: 13))
            .lineLimit(1)
            .truncationMode(.tail)
        }
        .padding(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 6))
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 30)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Button(action: remove) {
        Image(systemName: "xmark")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 20, height: 20)
          .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(removeHovering ? look.rowHover : .clear))
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .onHover { removeHovering = $0 }
      .padding(.trailing, 6)
      .opacity(hovering ? 1 : 0)
      .accessibilityLabel("Remove trigger: \(words.lead) \(words.rest)")
    }
    .frame(height: 30)
    .onHover { hovering = $0 }
  }
}

/** Add trigger / Add another (tertiary, small): 24 high, padded 6, round 6, `plus` and 12/16 words in grey; the grey fill under the pointer. */
private struct AddTriggerButton: View {
  let label: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 4) {
        Image(systemName: "plus")
          .font(.system(size: 10, weight: .medium))
          .frame(width: 16, height: 16)
        Text(label)
          .font(.system(size: 12))
      }
      .foregroundStyle(look.inkSecondary)
      .padding(.horizontal, 6)
      .frame(height: 24)
      .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.rowHover : .clear))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

// MARK: - The popover

/**
 * A trigger's popover ("Trigger fields"): as wide as the card's rows,
 * padded 8, round 12, raised, its lines 8 apart, each line's parts 6 apart
 * and wrapping. A pick saves at once; a field saves when it lets go of the
 * keys (Return does that).
 */
private struct TriggerPopover: View {
  @Bindable var model: RoutineEditorModel
  let index: Int
  let look: Look
  let width: CGFloat
  @Environment(AppStore.self) private var store

  var body: some View {
    let edit = RowEdit(model: model, index: index, store: store)
    let line = max(0, width - 16)
    VStack(alignment: .leading, spacing: 8) {
      // The rows can change under it (the stored trigger followed): it draws nothing for a row that is gone.
      switch model.rows.indices.contains(index) ? model.rows[index] : nil {
      case nil:
        EmptyView()
      case .schedule(let text)?:
        ScheduleFields(text: text, edit: edit, line: line, look: look)
      case .slack(let channel, let match, let keyword, let emoji, let bySelf)?:
        SlackFields(channel: channel, match: match, keyword: keyword, emoji: emoji, bySelf: bySelf, edit: edit, line: line, look: look)
      case .github(let repo, let events, let allowlist, let branch)?:
        GitFields(repo: repo, events: events, allowlist: allowlist, branch: branch, edit: edit, line: line, look: look)
      case .teams(let tenant, let teams, let channels, let contains, let isRegex, let linkedOnly)?:
        TeamsFields(tenant: tenant, teams: teams, channels: channels, contains: contains, isRegex: isRegex, linkedOnly: linkedOnly, edit: edit, line: line, look: look)
      case .linear(let event, let statuses, let cycles, let projects, let teams)?:
        LinearFields(event: event, statuses: statuses, cycles: cycles, projects: projects, teams: teams, edit: edit, line: line, look: look)
      case .sentry(let event, let projects)?:
        FlowLine {
          ChoicePill(label: "Sentry event", options: RoutineWords.sentryEvents, value: event, look: look) { edit.pick(.sentry(event: $0, projectIds: projects)) }
        }
        FlowLine {
          Word("in", look: look)
          PillField(label: "Project IDs", placeholder: "All projects", value: projects, line: line, look: look) { edit.change(.sentry(event: event, projectIds: $0)) } commit: { edit.commit() }
        }
      case .pagerduty(let event, let services)?:
        FlowLine {
          ChoicePill(label: "PagerDuty event", options: RoutineWords.pagerdutyEvents, value: event, look: look) { edit.pick(.pagerduty(event: $0, serviceIds: services)) }
        }
        FlowLine {
          Word("on", look: look)
          PillField(label: "Service IDs", placeholder: "All services", value: services, line: line, look: look) { edit.change(.pagerduty(event: event, serviceIds: $0)) } commit: { edit.commit() }
        }
      }
    }
    .padding(8)
    .frame(width: width, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(look.elevated))
    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 0.5))
    .shadow(color: .black.opacity(look.dark ? 0 : 0.10), radius: 8, x: 0, y: 10)
    .shadow(color: .black.opacity(look.dark ? 0 : 0.10), radius: 2, x: 0, y: 4)
    // Each row's fields start afresh.
    .id(index)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Trigger fields")
  }
}

/** The popover's row, changed (typing: shown, not saved), picked (saved now) or committed as it is (a field letting go of the keys). */
@MainActor
private struct RowEdit {
  let model: RoutineEditorModel
  let index: Int
  let store: AppStore

  var current: TriggerRow? { model.rows.indices.contains(index) ? model.rows[index] : nil }
  func change(_ row: TriggerRow) { model.set(index, row, commits: false, store: store) }
  func pick(_ row: TriggerRow) { model.set(index, row, commits: true, store: store) }
  func commit() { model.commit(model.rows, store: store) }
}

// MARK: Schedule (`Ugn`, `$gn`)

/**
 * A schedule's popover: Frequency and the controls that follow it on its
 * line; Advanced's grid under it; Custom's line field. Each control saves at
 * once. Custom only shows the field; Advanced shows the grid of the current
 * schedule and saves when a part of it changes; another frequency saves its
 * start (keeping the time, and the day where it has one), unless the
 * schedule had no shape, when its controls show and wait for a change.
 */
private struct ScheduleFields: View {
  let text: String
  let edit: RowEdit
  let line: CGFloat
  let look: Look
  /** Custom or Advanced chosen (`d`), and a shape shown but not saved yet (`f`). */
  @State private var chosen: String?
  @State private var pending: RoutineSchedule.Shape?

  init(text: String, edit: RowEdit, line: CGFloat, look: Look) {
    self.text = text
    self.edit = edit
    self.line = line
    self.look = look
    _chosen = State(initialValue: RoutineSchedule.shape(text) == nil ? "custom" : nil)
  }

  var body: some View {
    let shape = pending ?? RoutineSchedule.shape(text)
    let mode = Self.mode(chosen: chosen, pending: pending, shape: shape)
    VStack(alignment: .leading, spacing: 8) {
      FlowLine {
        ChoicePill(label: "Frequency", options: RoutineSchedule.frequencies, value: mode, look: look) { next in
          pick(next, mode: mode, shape: shape)
        }
        if let shape, shape.mode == mode {
          inline(shape)
        }
      }
      if mode == "advanced", let shape {
        AdvancedGrid(shape: RoutineSchedule.advanced(from: shape), look: look) { save($0) }
      }
      if mode == "custom" {
        CustomScheduleField(text: text, width: line, look: look) { typed in
          edit.change(.schedule(typed))
        } done: { typed in
          if RoutineSchedule.isValid(typed) { edit.pick(.schedule(RoutineSchedule.normalized(typed))) }
        }
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
      Word("at", look: look)
      ChoicePill(label: "Minute", options: RoutineSchedule.minuteChoices(minute).map { (value: $0, label: ":" + String(format: "%02d", $0)) }, value: minute, look: look) {
        save(.hourly(minute: $0))
      }
    case .daily(let time):
      Word("at", look: look)
      TimePill(time: time, look: look) { save(.daily($0)) }
    case .weekdays(let time):
      Word("at", look: look)
      TimePill(time: time, look: look) { save(.weekdays($0)) }
    case .weekly(let day, let time):
      Word("on", look: look)
      ChoicePill(label: "Day of week", options: RoutineWords.weekOrder.map { (value: $0, label: RoutineSchedule.weekdays[$0]) }, value: day, look: look) {
        save(.weekly(dayOfWeek: $0, time))
      }
      Word("at", look: look)
      TimePill(time: time, look: look) { save(.weekly(dayOfWeek: day, $0)) }
    case .monthly(let day, let time):
      Word("on the", look: look)
      ChoicePill(label: "Day of month", options: (1...31).map { (value: $0, label: RoutineSchedule.ordinal($0)) }, value: day, look: look) {
        save(.monthly(dayOfMonth: $0, time))
      }
      Word("at", look: look)
      TimePill(time: time, look: look) { save(.monthly(dayOfMonth: day, $0)) }
    case .interval(let amount, let unit):
      Word("every", look: look)
      ChoicePill(label: "Interval amount", options: RoutineSchedule.intervalChoices(unit, current: amount).map { (value: $0, label: String($0)) }, value: amount, look: look) {
        save(.interval(amount: $0, unit: unit))
      }
      ChoicePill(label: "Interval unit", options: RoutineWords.units.map { (value: $0, label: $0) }, value: unit, look: look) { next in
        save(.interval(amount: IntervalUnits.amount(amount, for: next), unit: next))
      }
    case .advanced:
      EmptyView()
    }
  }
}

/** An interval's amount when its unit changes: kept if the new unit offers it, else that unit's own (`vmt`). */
enum IntervalUnits {
  static func amount(_ amount: Int, for unit: String) -> Int {
    RoutineSchedule.intervalChoices(unit, current: -1).contains(amount) ? amount : (RoutineSchedule.intervalFallback[unit] ?? 1)
  }
}

/**
 * Advanced (`$gn`): three lines 8 apart, each a 44-point grey label (12/16)
 * and its controls: Months (Any month, or the months ticked); Days (every
 * day, days of the week, days of the month, with their ticks); Time (at
 * times, up to eight, or every so many minutes or hours between two hours).
 */
private struct AdvancedGrid: View {
  let shape: RoutineSchedule.Shape
  let look: Look
  let save: (RoutineSchedule.Shape) -> Void

  var body: some View {
    if case .advanced(let months, let days, let time) = shape {
      VStack(alignment: .leading, spacing: 8) {
        GridLine(label: "Months", look: look) {
          MenuPill(text: RoutineWords.monthsLabel(months), label: "Months", look: look) { frame in
            RoutineMenus.months(months, under: frame) { save(.advanced(months: $0, days: days, time: time)) }
          }
        }
        GridLine(label: "Days", look: look) {
          ChoicePill(label: "Days", options: RoutineWords.dayKinds, value: Self.kind(days), look: look) { kind in
            guard kind != Self.kind(days) else { return }
            let next: RoutineSchedule.Days = kind == "every-day" ? .everyDay : kind == "days-of-week" ? .daysOfWeek([1]) : .daysOfMonth([1])
            save(.advanced(months: months, days: next, time: time))
          }
          if case .daysOfWeek(let list) = days {
            MenuPill(text: RoutineWords.weekdaysLabel(list), label: "Days of the week", look: look) { frame in
              RoutineMenus.ticks(RoutineWords.weekOrder.map { (value: $0, label: RoutineSchedule.weekdays[$0]) }, picked: list, under: frame) {
                save(.advanced(months: months, days: .daysOfWeek($0), time: time))
              }
            }
          }
          if case .daysOfMonth(let list) = days {
            MenuPill(text: RoutineWords.monthDaysLabel(list), label: "Days of the month", look: look) { frame in
              RoutineMenus.ticks((1...31).map { (value: $0, label: RoutineSchedule.ordinal($0)) }, picked: list, under: frame) {
                save(.advanced(months: months, days: .daysOfMonth($0), time: time))
              }
            }
          }
        }
        GridLine(label: "Time", look: look) {
          ChoicePill(label: "Time mode", options: RoutineWords.timeKinds, value: Self.kind(time), look: look) { kind in
            guard kind != Self.kind(time) else { return }
            let next: RoutineSchedule.TimeOfDay = kind == "at-times" ? .atTimes(minute: 0, hours: [8]) : .interval(unit: "minutes", amount: 30, fromHour: 0, toHour: 23)
            save(.advanced(months: months, days: days, time: next))
          }
          timeControls(time) { save(.advanced(months: months, days: days, time: $0)) }
        }
      }
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
      TimePill(time: RoutineSchedule.Time(hour: first, minute: minute), look: look) { picked in
        change(.atTimes(minute: picked.minute, hours: [picked.hour] + rest.filter { $0 != picked.hour }))
      }
      ForEach(Array(rest.enumerated()), id: \.element) { offset, hour in
        HStack(spacing: 2) {
          ChoicePill(label: "Time \(offset + 2)", options: (0..<24).map { (value: $0, label: RoutineSchedule.clock($0, minute)) }, disabled: Set(hours.filter { $0 != hour }), value: hour, look: look) { next in
            var list = hours
            list[offset + 1] = next
            change(.atTimes(minute: minute, hours: list))
          }
          SmallIconButton(systemImage: "xmark", label: "Remove \(RoutineSchedule.clock(hour, minute))", look: look) {
            change(.atTimes(minute: minute, hours: hours.filter { $0 != hour }))
          }
        }
      }
      if hours.count < 8 {
        SmallTextButton(title: "Add time", look: look) {
          if let next = RoutineWords.nextHour(after: first, taken: hours) { change(.atTimes(minute: minute, hours: hours + [next])) }
        }
      }
    case .interval(let unit, let amount, let from, let to):
      // `zgn`: so many minutes or hours, between two hours.
      ChoicePill(label: "Interval amount", options: RoutineSchedule.intervalChoices(unit, current: amount).map { (value: $0, label: String($0)) }, value: amount, look: look) {
        change(.interval(unit: unit, amount: $0, fromHour: from, toHour: to))
      }
      ChoicePill(label: "Interval unit", options: RoutineWords.windowUnits.map { (value: $0, label: $0) }, value: unit, look: look) { next in
        change(.interval(unit: next, amount: IntervalUnits.amount(amount, for: next), fromHour: from, toHour: to))
      }
      Word("between", look: look)
      ChoicePill(label: "From hour", options: (0..<24).map { (value: $0, label: RoutineSchedule.clock($0, 0)) }, value: from, look: look) {
        change(.interval(unit: unit, amount: amount, fromHour: $0, toHour: max(to, $0)))
      }
      Word("and", look: look)
      ChoicePill(label: "To hour", options: (from..<24).map { (value: $0, label: RoutineSchedule.clock($0, 0)) }, value: to, look: look) {
        change(.interval(unit: unit, amount: amount, fromHour: from, toHour: $0))
      }
    }
  }
}

/** One of Advanced's lines: its label (44 wide, at least 26 high) and its controls wrapping beside it. */
private struct GridLine<Content: View>: View {
  let label: String
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      Text(label)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 44, alignment: .leading)
        .frame(minHeight: 26)
      FlowLine { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/**
 * Custom's line (`Schedule`): the raw line ("@every 30m", a cron line, an
 * alias, `CRON_TZ=…`), full width, 32 high, round 10. Typing shows it in the
 * row; letting go of the keys saves it when the host can run it, else it
 * stays a draft (closing the popover then puts the last good one back).
 */
private struct CustomScheduleField: View {
  let text: String
  let width: CGFloat
  let look: Look
  let change: (String) -> Void
  let done: (String) -> Void
  @FocusState private var focused: Bool

  var body: some View {
    TextField("", text: Binding(get: { text }, set: { @MainActor value in change(value) }))
      .textFieldStyle(.plain)
      .font(.system(size: 14))
      .foregroundStyle(look.ink)
      .focused($focused)
      .focusEffectDisabled()
      .autocorrectionDisabled()
      .onSubmit { focused = false }
      .padding(.horizontal, 10)
      .frame(width: width, height: 32)
      .background(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(look.ground)
          .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
      )
      .onChange(of: focused) { _, now in if !now { done(text) } }
      .accessibilityLabel("Schedule")
  }
}

// MARK: Events (`r2n`, `o2n`, `c2n`, `u2n`)

/** Slack: the event menu, "in", #channel; "containing" Any text (a word makes it a keyword match), or "with emoji" and "from". Right once it has a channel. */
private struct SlackFields: View {
  let channel: String
  let match: String
  let keyword: String
  let emoji: String
  let bySelf: Bool
  let edit: RowEdit
  let line: CGFloat
  let look: Look

  var body: some View {
    // A keyword match is still "New messages" in the menu (`n2n`).
    let event = match == "keyword" ? "message" : match
    FlowLine {
      MenuPill(text: RoutineWords.slackButton[event] ?? "New messages", label: "Slack event", look: look) { frame in
        RoutineMenus.choose(RoutineWords.slackEvents, current: event, under: frame, minWidth: 200, overSelected: false) { picked in
          guard picked != event, case .slack(let c, _, let k, let e, let b)? = edit.current else { return }
          edit.pick(.slack(channel: c, match: Self.match(picked, keyword: k), keyword: k, emoji: e, bySelf: b))
        }
      }
      Word("in", look: look)
      PillField(label: "Slack channel", placeholder: "#channel", value: channel, autofocus: channel.trimmingCharacters(in: .whitespaces).isEmpty, line: line, look: look) {
        edit.change(.slack(channel: $0, match: match, keyword: keyword, emoji: emoji, bySelf: bySelf))
      } commit: { edit.commit() }
    }
    if event == "message" {
      FlowLine {
        Word("containing", look: look)
        PillField(label: "Message contains", placeholder: "Any text", value: keyword, line: line, look: look) {
          edit.change(.slack(channel: channel, match: Self.match("message", keyword: $0), keyword: $0, emoji: emoji, bySelf: bySelf))
        } commit: { edit.commit() }
      }
    }
    if event == "reaction" {
      FlowLine {
        Word("with emoji", look: look)
        PillField(label: "Reaction emoji", placeholder: "Any emoji", value: emoji, line: line, look: look) {
          edit.change(.slack(channel: channel, match: match, keyword: keyword, emoji: $0, bySelf: bySelf))
        } commit: { edit.commit() }
      }
      FlowLine {
        Word("from", look: look)
        ChoicePill(label: "Reactor", options: RoutineWords.reactors, value: bySelf, look: look) {
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

/** Git: the events menu (ticks under their headings; each tick saves), "in", owner/repo; "from" for review and PR events, "on branch" for CI. */
private struct GitFields: View {
  let repo: String
  let events: [String]
  let allowlist: String
  let branch: String
  let edit: RowEdit
  let line: CGFloat
  let look: Look

  var body: some View {
    let ci = events.contains { $0 == "ci-passed" || $0 == "ci-failed" }
    let other = events.contains { $0 != "ci-passed" && $0 != "ci-failed" }
    FlowLine {
      MenuPill(text: RoutineWords.gitButton(events), label: "Git events", look: look) { frame in
        RoutineMenus.gitEvents(under: frame, current: {
          if case .github(_, let list, _, _)? = edit.current { return list }
          return []
        }) { kind in
          guard case .github(let r, let list, let a, let b)? = edit.current else { return }
          edit.pick(.github(repo: r, events: TriggerRow.toggled(list, kind), userAllowlist: a, ciBranch: b))
        }
      }
      Word("in", look: look)
      PillField(label: "Repository", placeholder: "owner/repo", value: repo, autofocus: repo.trimmingCharacters(in: .whitespaces).isEmpty, line: line, look: look) {
        edit.change(.github(repo: $0, events: events, userAllowlist: allowlist, ciBranch: branch))
      } commit: { edit.commit() }
    }
    if other {
      FlowLine {
        Word("from", look: look)
        PillField(label: "User allowlist", placeholder: "Anyone", value: allowlist, line: line, look: look) {
          edit.change(.github(repo: repo, events: events, userAllowlist: $0, ciBranch: branch))
        } commit: { edit.commit() }
      }
    }
    if ci {
      FlowLine {
        Word("on branch", look: look)
        PillField(label: "CI branch", placeholder: "main", value: branch, line: line, look: look) {
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
  let line: CGFloat
  let look: Look

  var body: some View {
    FlowLine {
      MenuPill(text: "New messages", label: "Teams event", look: look) { frame in
        RoutineMenus.choose([(value: "message", label: "New message in channel")], current: "message", under: frame, minWidth: 200, overSelected: false) { _ in }
      }
      Word("in", look: look)
      PillField(label: "Team IDs", placeholder: "Team IDs", value: teams, autofocus: teams.trimmingCharacters(in: .whitespaces).isEmpty, line: line, look: look) {
        edit.change(row(teams: $0))
      } commit: { edit.commit() }
    }
    FlowLine {
      Word("tenant", look: look)
      PillField(label: "Tenant ID", placeholder: "Tenant ID", value: tenant, line: line, look: look) { edit.change(row(tenant: $0)) } commit: { edit.commit() }
    }
    FlowLine {
      Word("channels", look: look)
      PillField(label: "Channel IDs", placeholder: "Every channel", value: channels, line: line, look: look) { edit.change(row(channels: $0)) } commit: { edit.commit() }
    }
    FlowLine {
      Word("containing", look: look)
      PillField(label: "Message contains", placeholder: "Any message", value: contains, line: line, look: look) { edit.change(row(contains: $0)) } commit: { edit.commit() }
      ChoicePill(label: "Message match", options: RoutineWords.teamsMatch, value: isRegex, look: look) { edit.pick(row(isRegex: $0)) }
    }
    FlowLine {
      Word("from", look: look)
      ChoicePill(label: "Teams audience", options: RoutineWords.teamsAudience, value: linkedOnly, look: look) { edit.pick(row(linkedOnly: $0)) }
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
  let line: CGFloat
  let look: Look

  var body: some View {
    FlowLine {
      ChoicePill(label: "Linear event", options: RoutineWords.linearEvents, value: event, look: look) { edit.pick(row(event: $0)) }
    }
    if event == "statusChanged" {
      FlowLine {
        Word("with status", look: look)
        PillField(label: "Status IDs", placeholder: "Any status", value: statuses, line: line, look: look) { edit.change(row(statuses: $0)) } commit: { edit.commit() }
      }
    }
    if event == "endOfCycle" {
      FlowLine {
        Word("cycles", look: look)
        PillField(label: "Cycle IDs", placeholder: "Any cycle", value: cycles, line: line, look: look) { edit.change(row(cycles: $0)) } commit: { edit.commit() }
      }
    }
    FlowLine {
      Word("in", look: look)
      PillField(label: "Project IDs", placeholder: "All projects", value: projects, line: line, look: look) { edit.change(row(projects: $0)) } commit: { edit.commit() }
    }
    FlowLine {
      Word("for", look: look)
      PillField(label: "Team IDs", placeholder: "All teams", value: teams, line: line, look: look) { edit.change(row(teams: $0)) } commit: { edit.commit() }
    }
  }

  private func row(event: String? = nil, statuses: String? = nil, cycles: String? = nil, projects: String? = nil, teams: String? = nil) -> TriggerRow {
    .linear(event: event ?? self.event, statusIds: statuses ?? self.statuses, cycleIds: cycles ?? self.cycles, projectIds: projects ?? self.projects, teamIds: teams ?? self.teams)
  }
}

// MARK: - The popover's controls

/** A connecting word (13/18, grey). */
private struct Word: View {
  let text: String
  let look: Look

  init(_ text: String, look: Look) {
    self.text = text
    self.look = look
  }

  var body: some View {
    Text(text)
      .font(.system(size: 13))
      .foregroundStyle(look.inkSecondary)
      .fixedSize()
  }
}

/** The pill the popover's choices sit in (`$in` filled, md): 26 high, padded 6, round 6, the grey fill (darker under the pointer), its words and a small chevron. */
private struct PillButton: View {
  let text: String
  let label: String
  /** A Select's line is the text at 5%; a menu button's at 10%. */
  let border: Double
  let look: Look
  let open: (CGRect) -> Void
  @State private var frame: CGRect = .zero
  @State private var hovering = false

  var body: some View {
    Button { open(frame) } label: {
      HStack(spacing: 4) {
        Text(text)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .lineLimit(1)
        Image(systemName: "chevron.down")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 10, height: 10)
      }
      .padding(.horizontal, 6)
      .frame(height: 26)
      .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.fillHover : look.rowHover))
      .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(look.ink.opacity(border), lineWidth: 0.5))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .fixedSize()
    .onHover { hovering = $0 }
    .background(WindowFrameReader { frame = $0 })
    .accessibilityLabel(label)
    .accessibilityValue(text)
  }
}

/** A Select: its choices in the Mac's menu, the chosen one ticked and over the pill, as the Mac's pop-up buttons open. A pick saves. */
private struct ChoicePill<Value: Hashable>: View {
  let label: String
  let options: [(value: Value, label: String)]
  var disabled: Set<Value> = []
  let value: Value
  let look: Look
  let pick: (Value) -> Void

  var body: some View {
    PillButton(text: options.first { $0.value == value }?.label ?? "", label: label, border: 0.05, look: look) { frame in
      RoutineMenus.choose(options, disabled: disabled, current: value, under: frame, minWidth: 200, overSelected: true) { picked in
        if picked != value { pick(picked) }
      }
    }
  }
}

/** A menu button (Months, the days, the Git events, Slack's and Teams' events): a pill with a 10% line opening its menu under it. */
private struct MenuPill: View {
  let text: String
  let label: String
  let look: Look
  let open: (CGRect) -> Void

  var body: some View {
    PillButton(text: text, label: label, border: 0.10, look: look, open: open)
  }
}

/** A time of day (`cpe`): the 96 quarter hours and the current time, "9:00 AM". */
private struct TimePill: View {
  let time: RoutineSchedule.Time
  let look: Look
  let change: (RoutineSchedule.Time) -> Void

  var body: some View {
    let minutes = time.hour * 60 + time.minute
    ChoicePill(label: "Time", options: RoutineSchedule.timeChoices(minutes).map { (value: $0, label: RoutineSchedule.clock($0 / 60, $0 % 60)) }, value: minutes, look: look) {
      change(RoutineSchedule.Time(hour: $0 / 60, minute: $0 % 60))
    }
  }
}

/**
 * A pill field (`ql`): 26 high, at least 72 wide and growing with its words
 * up to the line, padded 6, round 6, the grey fill with a 10% line. Typing
 * shows in the row's sentence at once; letting go of the keys saves, and
 * Return lets go.
 */
private struct PillField: View {
  let label: String
  let placeholder: String
  let value: String
  var autofocus = false
  let line: CGFloat
  let look: Look
  let change: (String) -> Void
  let commit: () -> Void
  @FocusState private var focused: Bool
  @State private var hovering = false

  var body: some View {
    let shown = value.isEmpty ? placeholder : value
    let words = ceil((shown as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 13)]).width)
    TextField("", text: Binding(get: { value }, set: { @MainActor typed in change(typed) }), prompt: Text(placeholder).foregroundStyle(look.inkTertiary))
      .textFieldStyle(.plain)
      .font(.system(size: 13))
      .foregroundStyle(look.ink)
      .focused($focused)
      .focusEffectDisabled()
      .autocorrectionDisabled()
      .onSubmit { focused = false }
      .padding(.horizontal, 6)
      .frame(width: min(line, max(72, words + 16)), height: 26)
      .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.fillHover : look.rowHover))
      .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(look.ink.opacity(0.10), lineWidth: 0.5))
      .onHover { hovering = $0 }
      .onChange(of: focused) { _, now in if !now { commit() } }
      .onAppear { if autofocus { DispatchQueue.main.async { focused = true } } }
      .accessibilityLabel(label)
  }
}

/** A small icon button (`fr`, sm): 24, round 6, grey, the grey fill under the pointer. */
private struct SmallIconButton: View {
  let systemImage: String
  let label: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 24, height: 24)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel(label)
  }
}

/** "+ Add time" (tertiary, small): 24 high, 12/16 in the text's colour. */
private struct SmallTextButton: View {
  let title: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 4) {
        Image(systemName: "plus")
          .font(.system(size: 10, weight: .medium))
          .frame(width: 16, height: 16)
        Text(title)
          .font(.system(size: 12))
      }
      .foregroundStyle(look.ink)
      .padding(.horizontal, 6)
      .frame(height: 24)
      .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(hovering ? look.rowHover : .clear))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

/** A line of the popover: its parts 6 apart, wrapping 6 under when the line is full, each line's parts centred on it. */
struct FlowLine: Layout {
  var spacing: CGFloat = 6
  var lineSpacing: CGFloat = 6

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

// MARK: - Signs

/** A trigger's sign: the clock for a schedule (14 in 18), else the source's logo (16 in the row, 18 in the menu). */
struct TriggerGlyph: View {
  let platform: String
  let look: Look
  let size: CGFloat

  var body: some View {
    switch platform {
    case "schedule":
      ClockGlyph()
        .stroke(look.ink, style: StrokeStyle(lineWidth: 1.6 * 14 / 24, lineCap: .round, lineJoin: .round))
        .frame(width: 14, height: 14)
        .frame(width: 18, height: 18)
    case "pagerduty":
      PagerDutyMark()
        .fill(Color(hex: 0x06ac38))
        .frame(width: size, height: size)
    default:
      if let logo = NSImage(named: "Connectors/\(Self.asset(platform))") {
        Image(nsImage: logo)
          .resizable()
          .interpolation(.high)
          .aspectRatio(contentMode: .fit)
          .frame(width: size, height: size)
      } else {
        Image(systemName: "bolt")
          .font(.system(size: size * 0.8))
          .foregroundStyle(look.inkSecondary)
          .frame(width: size, height: size)
      }
    }
  }

  static func asset(_ platform: String) -> String { platform == "microsoftTeams" ? "microsoft-teams" : platform }

  /** The sign as a menu item's picture. */
  @MainActor
  static func image(_ platform: String, side: CGFloat, dark: Bool) -> NSImage? {
    if platform != "schedule" && platform != "pagerduty", let logo = NSImage(named: "Connectors/\(asset(platform))"), let copy = logo.copy() as? NSImage {
      copy.size = NSSize(width: side, height: side)
      return copy
    }
    let renderer = ImageRenderer(content: TriggerGlyph(platform: platform, look: Look(dark ? .dark : .light), size: side).frame(width: side, height: side))
    renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
    return renderer.nsImage
  }
}

/** PagerDuty's mark (the window's `xZe`, moved 2.23 left) on a 24-point view. */
struct PagerDutyMark: Shape {
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

// MARK: - Menus

/**
 * The routine editor's menus, the Mac's own: the Add menu (On a schedule ›
 * Cadence › Time, then the six sources), a Select's choices, and the
 * menus of ticks (months, days, Git events), which stay open while ticking.
 */
@MainActor
enum RoutineMenus {
  /** The Add menu ("Trigger source", at least 240 wide) under Add trigger; closing it with no pick keeps or puts back the rows. */
  static func add(model: RoutineEditorModel, store: AppStore, dark: Bool, under frame: CGRect) {
    let menu = NSMenu(title: "Trigger source")
    menu.autoenablesItems = false
    menu.minimumWidth = 240
    let picked = Picked()

    let cadence = NSMenu(title: "Cadence")
    cadence.autoenablesItems = false
    cadence.minimumWidth = 160
    func schedule(_ title: String, _ line: String, opens: Bool) -> NSMenuItem {
      BlockMenuItem(title) {
        picked.value = true
        model.addSchedule(line, opens: opens, store: store)
      }
    }
    func times(_ title: String, days: String) -> NSMenuItem {
      let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      let list = NSMenu(title: "Time")
      list.autoenablesItems = false
      list.minimumWidth = 120
      for time in RoutineSchedule.quarterHours {
        list.addItem(schedule(RoutineSchedule.clock(time.hour, time.minute), "\(time.minute) \(time.hour) * * \(days)", opens: false))
      }
      item.submenu = list
      return item
    }
    cadence.addItem(schedule("Every hour", "0 * * * *", opens: false))
    cadence.addItem(times("Every day", days: "*"))
    cadence.addItem(times("Weekdays", days: "1-5"))
    cadence.addItem(schedule("Every week", RoutineSchedule.line(RoutineSchedule.start("weekly", from: nil)), opens: true))
    cadence.addItem(schedule("Every month", RoutineSchedule.line(RoutineSchedule.start("monthly", from: nil)), opens: true))
    cadence.addItem(schedule("Interval", RoutineSchedule.line(RoutineSchedule.start("interval", from: nil)), opens: true))
    // Advanced… saves "0 8 * * *" and its popover shows Every day (the window's own quirk).
    cadence.addItem(schedule("Advanced\u{2026}", RoutineSchedule.line(RoutineSchedule.start("advanced", from: nil)), opens: true))

    let onSchedule = NSMenuItem(title: "On a schedule", action: nil, keyEquivalent: "")
    onSchedule.image = TriggerGlyph.image("schedule", side: 18, dark: dark)
    onSchedule.submenu = cadence
    menu.addItem(onSchedule)
    for source in TriggerRow.sources {
      let item = BlockMenuItem(source.label) {
        picked.value = true
        model.addSource(source.platform, store: store)
      }
      item.image = TriggerGlyph.image(source.platform, side: 18, dark: dark)
      menu.addItem(item)
    }
    let chose = popUp(menu, under: frame)
    model.addMenuClosed(picked: chose || picked.value, store: store)
  }

  /** A Select's choices (at least 200 wide), the current one ticked; over the pill as the Mac's pop-up buttons open, or under it. */
  static func choose<Value: Hashable>(_ options: [(value: Value, label: String)], disabled: Set<Value> = [], current: Value, under frame: CGRect, minWidth: CGFloat, overSelected: Bool, pick: @escaping (Value) -> Void) {
    let menu = NSMenu()
    menu.autoenablesItems = false
    menu.minimumWidth = minWidth
    var selected: NSMenuItem?
    for option in options {
      let item = BlockMenuItem(option.label) { pick(option.value) }
      item.state = option.value == current ? .on : .off
      item.isEnabled = !disabled.contains(option.value)
      if option.value == current { selected = item }
      menu.addItem(item)
    }
    _ = popUp(menu, under: frame, over: overSelected ? selected : nil)
  }

  /** Months (`jgn`): Any month (ticked when none are), then January to December; unticking the last is Any month. */
  static func months(_ months: [Int]?, under frame: CGRect, change: @escaping ([Int]?) -> Void) {
    let menu = NSMenu(title: "Months")
    menu.autoenablesItems = false
    menu.minimumWidth = 160
    var current = months ?? []
    var rows: [CheckMenuRow] = []
    let any = CheckMenuRow(title: "Any month", on: current.isEmpty, width: 180) { _ in }
    func refresh() {
      any.isOn = current.isEmpty
      any.isEnabled = !current.isEmpty
      for (offset, row) in rows.enumerated() { row.isOn = current.contains(offset + 1) }
    }
    any.onToggle = { _ in
      current = []
      change(nil)
      refresh()
    }
    menu.addItem(CheckMenuRow.item(any))
    for (offset, name) in RoutineSchedule.months.enumerated() {
      let row = CheckMenuRow(title: name, on: current.contains(offset + 1), width: 180) { _ in
        current = RoutineWords.toggled(current, offset + 1)
        change(current.isEmpty ? nil : current)
        refresh()
      }
      rows.append(row)
      menu.addItem(CheckMenuRow.item(row))
    }
    refresh()
    _ = popUp(menu, under: frame)
  }

  /** Days of the week or of the month (`MUe`): ticks that stay open; the last one ticked cannot be unticked. */
  static func ticks(_ entries: [(value: Int, label: String)], picked: [Int], under frame: CGRect, change: @escaping ([Int]) -> Void) {
    let menu = NSMenu()
    menu.autoenablesItems = false
    menu.minimumWidth = 160
    var current = picked
    var rows: [(value: Int, row: CheckMenuRow)] = []
    func refresh() {
      for entry in rows {
        entry.row.isOn = current.contains(entry.value)
        entry.row.isEnabled = !(current.count == 1 && current.contains(entry.value))
      }
    }
    for entry in entries {
      let row = CheckMenuRow(title: entry.label, on: current.contains(entry.value), width: 180) { _ in
        let next = RoutineWords.toggled(current, entry.value)
        guard !next.isEmpty else { return refresh() }
        current = next
        change(next)
        refresh()
      }
      rows.append((entry.value, row))
      menu.addItem(CheckMenuRow.item(row))
    }
    refresh()
    _ = popUp(menu, under: frame)
  }

  /** The Git events (`o2n`): ticks under Pull request, Review, Comment, Checks and Issue; each tick saves. */
  static func gitEvents(under frame: CGRect, current: @escaping () -> [String], toggle: @escaping (String) -> Void) {
    let menu = NSMenu(title: "Git events")
    menu.autoenablesItems = false
    menu.minimumWidth = 160
    var rows: [(kind: String, row: CheckMenuRow)] = []
    func refresh() {
      let events = current()
      for entry in rows { entry.row.isOn = events.contains(entry.kind) }
    }
    for (offset, section) in TriggerRow.gitSections.enumerated() {
      if offset > 0 { menu.addItem(.separator()) }
      menu.addItem(.sectionHeader(title: section.title))
      for event in section.events {
        let row = CheckMenuRow(title: event.label, on: current().contains(event.kind), width: 200) { _ in
          toggle(event.kind)
          refresh()
        }
        rows.append((event.kind, row))
        menu.addItem(CheckMenuRow.item(row))
      }
    }
    _ = popUp(menu, under: frame)
  }

  /** Opens `menu` under `frame` (window coordinates), or with `over` placed on the pill; true when an item was picked. */
  @discardableResult
  static func popUp(_ menu: NSMenu, under frame: CGRect, over item: NSMenuItem? = nil) -> Bool {
    guard let window = NSApp.keyWindow ?? NSApp.mainWindow, let view = window.contentView else { return false }
    if let item {
      return menu.popUp(positioning: item, at: view.convert(NSPoint(x: frame.minX, y: frame.maxY), from: nil), in: view)
    }
    return menu.popUp(positioning: nil, at: view.convert(NSPoint(x: frame.minX, y: frame.minY - 4), from: nil), in: view)
  }

  /** Whether a block item was picked (an item's action can come after the menu says how it closed). */
  private final class Picked {
    var value = false
  }
}

/** A menu item that runs a block. */
final class BlockMenuItem: NSMenuItem {
  private let run: () -> Void

  init(_ title: String, run: @escaping () -> Void) {
    self.run = run
    super.init(title: title, action: #selector(fire), keyEquivalent: "")
    target = self
  }

  required init(coder: NSCoder) {
    run = {}
    super.init(coder: coder)
  }

  @objc private func fire() { run() }
}

/** A tick in a menu that stays open while it is ticked (the Mac's checkbox, in the item's own view). */
final class CheckMenuRow: NSView {
  private let box: NSButton
  var onToggle: (Bool) -> Void

  init(title: String, on: Bool, width: CGFloat, toggle: @escaping (Bool) -> Void) {
    onToggle = toggle
    box = NSButton(checkboxWithTitle: title, target: nil, action: nil)
    super.init(frame: NSRect(x: 0, y: 0, width: width, height: 24))
    box.state = on ? .on : .off
    box.font = NSFont.menuFont(ofSize: 0)
    box.target = self
    box.action = #selector(flip)
    box.frame = NSRect(x: 14, y: 2, width: width - 22, height: 20)
    addSubview(box)
  }

  required init?(coder: NSCoder) { nil }

  var isOn: Bool {
    get { box.state == .on }
    set { box.state = newValue ? .on : .off }
  }

  var isEnabled: Bool {
    get { box.isEnabled }
    set { box.isEnabled = newValue }
  }

  @objc private func flip() { onToggle(box.state == .on) }

  static func item(_ row: CheckMenuRow) -> NSMenuItem {
    let item = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    item.view = row
    return item
  }
}
