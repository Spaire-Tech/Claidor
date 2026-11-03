// When to run (mac/Simeon/RoutineTriggerCard.swift, the window's `P2n`): a
// card (padded 6, a half-point line at 15%, round 12) of the routine's
// triggers, 30 high and 2 apart, each its sign and sentence with × at its
// right under the pointer; then Add trigger, or Add another (none at
// eight). A row opens its popover just under it, over the rows below (one
// at a time); a click outside it only closes it, as does Escape, and
// closing keeps rows that are right and puts back rows that are not. The
// popover's fields (a schedule's Frequency and Advanced grid, Slack, Git,
// Teams, Linear, Sentry, PagerDuty), its pills, and the Mac's menus
// (`RoutineMenus`: the Add menu, a Select's choices, the ticks that stay
// open), drawn as the window's own menus.

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  type RoutineEditing,
  type RoutineStore,
  cadences,
  timeLine,
} from '../core/routineEditing'
import {
  type ClockTime,
  type Shape,
  type TimeOfDay,
  type TriggerRow,
  addLabel,
  advancedShape,
  clock,
  dayKinds,
  frequencies,
  gitButton,
  gitSections,
  intervalChoices,
  intervalFallback,
  linearEvents,
  minuteChoices,
  monthDaysLabel,
  months,
  monthsLabel,
  nextHour,
  normalized,
  ordinal,
  pagerdutyEvents,
  quarterHours,
  reactors,
  scheduleIsValid,
  scheduleLine,
  scheduleShape,
  sentryEvents,
  slackButton,
  slackEvents,
  startShape,
  teamsAudience,
  teamsMatch,
  timeChoices,
  timeKinds,
  toggledGitEvents,
  toggledList,
  triggerLimit,
  triggerPlatform,
  triggerSources,
  triggerWords,
  unitLabel,
  units,
  weekOrder,
  weekdays,
  weekdaysLabel,
  windowUnits,
} from '../core/routineTriggers'
import { t, tk } from '../l10n'
import { windowLetGo } from './AgentPane'
import { classes } from './classes'
import { Glyph } from './ContextMenu'
import { somethingOver } from './Dialogs'
import './Routines.css'
import { useDarkScheme } from './theme'

// MARK: The card

/** Opens one of the Mac's menus (`RoutineMenus`) from a control of the card. */
const MenuOpener = createContext<(menu: OpenMenu) => void>(() => {})

/**
 * When to run (`TriggerCard`): the rows, Add trigger, the popover of the
 * open row hanging just under it, the menus. `overhang` is told how far
 * an open popover hangs below the card, so the page can grow by it.
 */
export function TriggerCard({
  editing,
  store,
  width,
  overhang,
}: {
  editing: RoutineEditing
  store: RoutineStore
  width: number
  overhang: (value: number) => void
}) {
  const inner = Math.max(0, width - 12)
  const card = useRef<HTMLDivElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<OpenMenu>()
  const menuOpen = useRef(false)
  useLayoutEffect(() => {
    menuOpen.current = menu !== undefined
  }, [menu])
  const index = editing.openRow
  const row = index === undefined ? undefined : editing.rows[index]
  const popoverTop = index === undefined ? 0 : 6 + (index + 1) * 32

  // The popover hangs below the card, over Run history (the editor's body grows by what passes its end).
  const told = useRef(overhang)
  useLayoutEffect(() => {
    told.current = overhang
  })
  useLayoutEffect(() => {
    const measure = () => {
      const cardHeight = card.current?.offsetHeight ?? 0
      const height = popover.current?.offsetHeight ?? 0
      told.current(
        row === undefined ? 0 : Math.max(0, popoverTop + height - cardHeight),
      )
    }
    measure()
    const watcher = new ResizeObserver(measure)
    if (card.current) watcher.observe(card.current)
    if (popover.current) watcher.observe(popover.current)
    return () => watcher.disconnect()
  }, [row, popoverTop])

  // The window's full-window layer behind the popover: a click anywhere else only closes it; Escape closes it from its fields too, the pane stays.
  const close = useRef(() => editing.closeRow(store))
  useLayoutEffect(() => {
    close.current = () => editing.closeRow(store)
  })
  const open = index !== undefined
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) =>
      !menuOpen.current &&
      !popover.current?.contains(event.target as Node) &&
      !somethingOver()
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      if (!outside(event)) return
      event.preventDefault()
      event.stopPropagation()
      // The click the press makes reaches nothing (the Mac's catcher swallows it), even once this popover is gone.
      swallowClick()
      close.current()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (menuOpen.current || somethingOver()) return
      event.preventDefault()
      event.stopPropagation()
      // The field holding the keys lets go first (and saves), then the popover closes.
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur()
      close.current()
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [open])

  // A menu notes what has the keys as it opens (the pill clicked, or the field), to give them back.
  const openMenu = (next: OpenMenu) =>
    setMenu({
      ...next,
      returnTo:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    })
  // The Add menu ("Trigger source", at least 240 wide) under Add trigger; closing it with no pick keeps or puts back the rows.
  const showAddMenu = () => {
    if (editing.openRow !== undefined) return
    const button = addButton.current
    if (!button) return
    openMenu({
      anchor: button.getBoundingClientRect(),
      label: t('Trigger source'),
      minWidth: 240,
      rows: () => addMenuRows(editing, store),
      closed: (picked) => editing.addMenuClosed(picked, store),
    })
  }
  // The only row removed: the Add menu opens by itself once the card has drawn its button where it now is.
  const addMenu = useRef(showAddMenu)
  useLayoutEffect(() => {
    addMenu.current = showAddMenu
  })
  const requests = editing.addMenuRequests
  const seenRequests = useRef(requests)
  useEffect(() => {
    if (requests === seenRequests.current) return
    seenRequests.current = requests
    const later = window.setTimeout(() => addMenu.current(), 50)
    return () => window.clearTimeout(later)
  }, [requests])

  return (
    <MenuOpener.Provider value={openMenu}>
      <div
        ref={card}
        className="trigger-card"
        style={{ width }}
        role="group"
        aria-label={t('Triggers')}
      >
        {editing.rows.map((one, at) => (
          <TriggerRowView
            key={at}
            row={one}
            open={() => editing.openRowAt(at)}
            remove={() => editing.remove(at, store)}
          />
        ))}
        {editing.rows.length < triggerLimit && (
          <div className="add-trigger-holder">
            <button
              ref={addButton}
              type="button"
              className="add-trigger"
              aria-haspopup="menu"
              onClick={showAddMenu}
            >
              <Plus size={10} frame={16} />
              <span>{addLabel(editing.rows.length)}</span>
            </button>
          </div>
        )}
        {index !== undefined && row !== undefined && (
          <div
            ref={popover}
            key={index}
            className="trigger-popover"
            style={{ top: popoverTop, width: inner }}
            role="group"
            aria-label={t('Trigger fields')}
          >
            <TriggerPopover
              row={row}
              edit={rowEdit(editing, index, store)}
              line={Math.max(0, inner - 16)}
            />
          </div>
        )}
      </div>
      {menu && (
        <RoutineMenu
          menu={menu}
          close={(picked) => {
            setMenu(undefined)
            menu.closed?.(picked)
          }}
        />
      )}
    </MenuOpener.Provider>
  )
}

/** The Add menu's rows: On a schedule › Cadence › Time, then the six sources. */
function addMenuRows(editing: RoutineEditing, store: RoutineStore): MenuRow[] {
  const schedule = (label: string, line: string, opens: boolean): MenuRow => ({
    label,
    action: () => editing.addSchedule(line, opens, store),
  })
  const times = (label: string, days: string): MenuRow => ({
    label,
    submenu: {
      label: t('Time'),
      minWidth: 120,
      rows: quarterHours.map((time) =>
        schedule(clock(time.hour, time.minute), timeLine(time, days), false),
      ),
    },
  })
  const cadence = cadences().map((one) =>
    one.line !== undefined
      ? schedule(one.label, one.line, one.opens)
      : times(one.label, one.days ?? '*'),
  )
  return [
    {
      label: t('On a schedule'),
      image: <TriggerGlyph platform="schedule" size={18} />,
      submenu: { label: t('Cadence'), minWidth: 160, rows: cadence },
    },
    ...triggerSources().map(
      (source): MenuRow => ({
        label: source.label,
        image: <TriggerGlyph platform={source.platform} size={18} />,
        action: () => editing.addSource(source.platform, store),
      }),
    ),
  ]
}

/** A trigger's row: its sign (the clock 14 in 18, a logo 16) and its sentence, first word in the text's colour and the rest grey; × (20, round 6) at its right while the pointer is on the row. */
function TriggerRowView({
  row,
  open,
  remove,
}: {
  row: TriggerRow
  open: () => void
  remove: () => void
}) {
  const words = triggerWords(row)
  return (
    <div className="trigger-row">
      <button type="button" className="trigger-open" onClick={open}>
        <TriggerGlyph platform={triggerPlatform(row)} size={16} />
        <span className="trigger-words">
          <span className="lead">{words.lead}</span>
          {` ${words.rest}`}
        </span>
      </button>
      <button
        type="button"
        className="trigger-remove"
        aria-label={t`Remove trigger: ${words.lead} ${words.rest}`}
        onClick={remove}
      >
        <XMark size={9} />
      </button>
    </div>
  )
}

// MARK: The popover

/** The popover's row, changed (typing: shown, not saved), picked (saved now) or committed as it is (a field letting go of the keys). */
interface RowEdit {
  current: () => TriggerRow | undefined
  change: (row: TriggerRow) => void
  pick: (row: TriggerRow) => void
  commit: () => void
}

function rowEdit(
  editing: RoutineEditing,
  index: number,
  store: RoutineStore,
): RowEdit {
  return {
    current: () => editing.rows[index],
    change: (row) => editing.set(index, row, false, store),
    pick: (row) => editing.set(index, row, true, store),
    commit: () => editing.commit(editing.rows, store),
  }
}

/** A trigger's popover's lines, 8 apart, each line's parts 6 apart and wrapping. */
export function TriggerPopover({
  row,
  edit,
  line,
}: {
  row: TriggerRow
  edit: RowEdit
  line: number
}) {
  switch (row.kind) {
    case 'schedule':
      return <ScheduleFields text={row.text} edit={edit} line={line} />
    case 'slack':
      return <SlackFields row={row} edit={edit} line={line} />
    case 'github':
      return <GitFields row={row} edit={edit} line={line} />
    case 'teams':
      return <TeamsFields row={row} edit={edit} line={line} />
    case 'linear':
      return <LinearFields row={row} edit={edit} line={line} />
    case 'sentry':
      return (
        <>
          <FlowLine>
            <ChoicePill
              label={t('Sentry event')}
              options={sentryEvents()}
              value={row.event}
              pick={(event) => edit.pick({ ...row, event })}
            />
          </FlowLine>
          <FlowLine>
            <Word text={t('in')} />
            <PillField
              label={t('Project IDs')}
              placeholder={t('All projects')}
              value={row.projectIds}
              line={line}
              change={(projectIds) => edit.change({ ...row, projectIds })}
              commit={edit.commit}
            />
          </FlowLine>
        </>
      )
    case 'pagerduty':
      return (
        <>
          <FlowLine>
            <ChoicePill
              label={t('PagerDuty event')}
              options={pagerdutyEvents()}
              value={row.event}
              pick={(event) => edit.pick({ ...row, event })}
            />
          </FlowLine>
          <FlowLine>
            <Word text={t('on')} />
            <PillField
              label={t('Service IDs')}
              placeholder={t('All services')}
              value={row.serviceIds}
              line={line}
              change={(serviceIds) => edit.change({ ...row, serviceIds })}
              commit={edit.commit}
            />
          </FlowLine>
        </>
      )
  }
}

// MARK: Schedule (`Ugn`, `$gn`)

/** The Frequency shown (`k`). */
function frequencyMode(
  chosen: string | undefined,
  pending: Shape | undefined,
  shape: Shape | undefined,
): string {
  if (pending) return pending.mode
  if (chosen === 'custom' || !shape) return 'custom'
  return chosen === 'advanced' ? 'advanced' : shape.mode
}

/**
 * A schedule's popover: Frequency and the controls that follow it on its
 * line; Advanced's grid under it; Custom's line field. Each control saves
 * at once. Custom only shows the field; Advanced shows the grid of the
 * current schedule and saves when a part of it changes; another frequency
 * saves its start (keeping the time, and the day where it has one), unless
 * the schedule had no shape, when its controls show and wait for a change.
 */
function ScheduleFields({
  text,
  edit,
  line,
}: {
  text: string
  edit: RowEdit
  line: number
}) {
  // Custom or Advanced chosen (`d`), and a shape shown but not saved yet (`f`).
  const [chosen, setChosen] = useState<string | undefined>(() =>
    scheduleShape(text) === undefined ? 'custom' : undefined,
  )
  const [pending, setPending] = useState<Shape>()
  const shape = pending ?? scheduleShape(text)
  const mode = frequencyMode(chosen, pending, shape)
  const save = (next: Shape) => {
    setPending(undefined)
    edit.pick({ kind: 'schedule', text: scheduleLine(next) })
  }
  const pick = (next: string) => {
    if (next === mode) return
    switch (next) {
      case 'custom':
        setPending(undefined)
        setChosen('custom')
        break
      case 'advanced':
        setChosen('advanced')
        if (!shape || pending) setPending(advancedShape(pending))
        break
      default:
        setChosen(undefined)
        if (!shape || pending) setPending(startShape(next, pending))
        else save(startShape(next, shape))
    }
  }
  return (
    <>
      <FlowLine>
        <ChoicePill
          label={t('Frequency')}
          options={frequencies()}
          value={mode}
          pick={pick}
        />
        {shape && shape.mode === mode && (
          <ScheduleInline shape={shape} save={save} />
        )}
      </FlowLine>
      {mode === 'advanced' && shape && (
        <AdvancedGrid shape={advancedShape(shape)} save={save} />
      )}
      {mode === 'custom' && (
        <CustomScheduleField
          text={text}
          width={line}
          change={(typed) => edit.change({ kind: 'schedule', text: typed })}
          done={(typed) => {
            if (scheduleIsValid(typed))
              edit.pick({ kind: 'schedule', text: normalized(typed) })
          }}
        />
      )}
    </>
  )
}

/** The controls that follow Frequency on its line. */
function ScheduleInline({
  shape,
  save,
}: {
  shape: Shape
  save: (shape: Shape) => void
}) {
  switch (shape.mode) {
    case 'hourly':
      return (
        <>
          <Word text={tk('hourly.at')} />
          <ChoicePill
            label={t('Minute')}
            options={minuteChoices(shape.minute).map((minute) => ({
              value: minute,
              label: `:${String(minute).padStart(2, '0')}`,
            }))}
            value={shape.minute}
            pick={(minute) => save({ mode: 'hourly', minute })}
          />
        </>
      )
    case 'daily':
    case 'weekdays':
      return (
        <>
          <Word text={t('at')} />
          <TimePill
            time={shape.time}
            change={(time) => save({ mode: shape.mode, time })}
          />
        </>
      )
    case 'weekly':
      return (
        <>
          <Word text={tk('weekly.on')} />
          <ChoicePill
            label={t('Day of week')}
            options={weekOrder.map((day) => ({
              value: day,
              label: weekdays()[day]!,
            }))}
            value={shape.dayOfWeek}
            pick={(dayOfWeek) => save({ ...shape, dayOfWeek })}
          />
          <Word text={t('at')} />
          <TimePill
            time={shape.time}
            change={(time) => save({ ...shape, time })}
          />
        </>
      )
    case 'monthly':
      return (
        <>
          <Word text={t('on the')} />
          <ChoicePill
            label={t('Day of month')}
            options={Array.from({ length: 31 }, (_, i) => ({
              value: i + 1,
              label: ordinal(i + 1),
            }))}
            value={shape.dayOfMonth}
            pick={(dayOfMonth) => save({ ...shape, dayOfMonth })}
          />
          <Word text={t('at')} />
          <TimePill
            time={shape.time}
            change={(time) => save({ ...shape, time })}
          />
        </>
      )
    case 'interval':
      return (
        <>
          <Word text={t('every')} />
          <ChoicePill
            label={t('Interval amount')}
            options={intervalChoices(shape.unit, shape.amount).map(
              (amount) => ({ value: amount, label: String(amount) }),
            )}
            value={shape.amount}
            pick={(amount) => save({ ...shape, amount })}
          />
          <ChoicePill
            label={t('Interval unit')}
            options={units.map((unit) => ({
              value: unit,
              label: unitLabel(unit),
            }))}
            value={shape.unit}
            pick={(unit) =>
              save({
                mode: 'interval',
                amount: unitAmount(shape.amount, unit),
                unit,
              })
            }
          />
        </>
      )
    case 'advanced':
      return null
  }
}

/** An interval's amount when its unit changes: kept if the new unit offers it, else that unit's own (`vmt`). */
function unitAmount(amount: number, unit: string): number {
  return intervalChoices(unit, -1).includes(amount)
    ? amount
    : (intervalFallback[unit] ?? 1)
}

/**
 * Advanced (`$gn`): three lines 8 apart, each a 44-point grey label (12/16)
 * and its controls: Months (Any month, or the months ticked); Days (every
 * day, days of the week, days of the month, with their ticks); Time (at
 * times, up to eight, or every so many minutes or hours between two hours).
 */
function AdvancedGrid({
  shape,
  save,
}: {
  shape: Shape
  save: (shape: Shape) => void
}) {
  const openMenu = useContext(MenuOpener)
  if (shape.mode !== 'advanced') return null
  const { months: picked, days, time } = shape
  const dayKind = days.kind
  const timeKind = time.kind
  return (
    <div className="advanced-grid">
      <GridLine label={t('Months')}>
        <MenuPill
          text={monthsLabel(picked)}
          label={t('Months')}
          open={(anchor) => {
            // Ticks that stay open: Any month (ticked when none are), then January to December; unticking the last is Any month.
            let current = picked ?? []
            const change = (next: number[]) => {
              current = next
              save({ ...shape, months: next.length === 0 ? null : next })
            }
            openMenu({
              anchor,
              label: t('Months'),
              // At least 160, its ticks' views 180 wide.
              minWidth: 180,
              rows: () => [
                {
                  label: t('Any month'),
                  tick: current.length === 0,
                  disabled: current.length === 0,
                  action: () => change([]),
                },
                ...months().map(
                  (name, at): MenuRow => ({
                    label: name,
                    tick: current.includes(at + 1),
                    action: () => change(toggledList(current, at + 1)),
                  }),
                ),
              ],
            })
          }}
        />
      </GridLine>
      <GridLine label={t('Days')}>
        <ChoicePill
          label={t('Days')}
          options={dayKinds()}
          value={dayKind}
          pick={(kind) =>
            save({
              ...shape,
              days:
                kind === 'every-day'
                  ? { kind: 'every-day' }
                  : kind === 'days-of-week'
                    ? { kind: 'days-of-week', daysOfWeek: [1] }
                    : { kind: 'days-of-month', daysOfMonth: [1] },
            })
          }
        />
        {days.kind === 'days-of-week' && (
          <MenuPill
            text={weekdaysLabel(days.daysOfWeek)}
            label={t('Days of the week')}
            open={(anchor) =>
              openMenu(
                ticks(
                  anchor,
                  weekOrder.map((day) => ({
                    value: day,
                    label: weekdays()[day]!,
                  })),
                  days.daysOfWeek,
                  (daysOfWeek) =>
                    save({
                      ...shape,
                      days: { kind: 'days-of-week', daysOfWeek },
                    }),
                ),
              )
            }
          />
        )}
        {days.kind === 'days-of-month' && (
          <MenuPill
            text={monthDaysLabel(days.daysOfMonth)}
            label={t('Days of the month')}
            open={(anchor) =>
              openMenu(
                ticks(
                  anchor,
                  Array.from({ length: 31 }, (_, i) => ({
                    value: i + 1,
                    label: ordinal(i + 1),
                  })),
                  days.daysOfMonth,
                  (daysOfMonth) =>
                    save({
                      ...shape,
                      days: { kind: 'days-of-month', daysOfMonth },
                    }),
                ),
              )
            }
          />
        )}
      </GridLine>
      <GridLine label={t('Time')}>
        <ChoicePill
          label={t('Time mode')}
          options={timeKinds()}
          value={timeKind}
          pick={(kind) =>
            save({
              ...shape,
              time:
                kind === 'at-times'
                  ? { kind: 'at-times', minute: 0, hours: [8] }
                  : {
                      kind: 'interval',
                      unit: 'minutes',
                      amount: 30,
                      fromHour: 0,
                      toHour: 23,
                    },
            })
          }
        />
        <TimeControls
          time={time}
          change={(next) => save({ ...shape, time: next })}
        />
      </GridLine>
    </div>
  )
}

/** Days of the week or of the month (`MUe`): ticks that stay open; the last one ticked cannot be unticked. */
function ticks(
  anchor: DOMRect,
  entries: { value: number; label: string }[],
  picked: readonly number[],
  change: (list: number[]) => void,
): OpenMenu {
  let current = [...picked]
  return {
    anchor,
    // At least 160, its ticks' views 180 wide.
    minWidth: 180,
    rows: () =>
      entries.map((entry) => ({
        label: entry.label,
        tick: current.includes(entry.value),
        disabled: current.length === 1 && current.includes(entry.value),
        action: () => {
          const next = toggledList(current, entry.value)
          if (next.length === 0) return
          current = next
          change(next)
        },
      })),
  }
}

/** Advanced's Time: at times (the first, each other hour at the same minute with its ×, Add time under eight), or so many minutes or hours between two hours. */
function TimeControls({
  time,
  change,
}: {
  time: TimeOfDay
  change: (time: TimeOfDay) => void
}) {
  if (time.kind === 'at-times') {
    // `Fgn`: the first time, then each other hour at the same minute with its ×, then Add time (fewer than eight).
    const { minute, hours } = time
    const first = hours[0] ?? 0
    const rest = hours.slice(1)
    return (
      <>
        <TimePill
          time={{ hour: first, minute }}
          change={(picked) =>
            change({
              kind: 'at-times',
              minute: picked.minute,
              hours: [picked.hour, ...rest.filter((h) => h !== picked.hour)],
            })
          }
        />
        {rest.map((hour, offset) => (
          <span key={hour} className="time-entry">
            <ChoicePill
              label={t`Time ${offset + 2}`}
              options={Array.from({ length: 24 }, (_, h) => ({
                value: h,
                label: clock(h, minute),
              }))}
              disabled={hours.filter((h) => h !== hour)}
              value={hour}
              pick={(next) => {
                const list = [...hours]
                list[offset + 1] = next
                change({ kind: 'at-times', minute, hours: list })
              }}
            />
            <SmallIconButton
              label={t`Remove ${clock(hour, minute)}`}
              onClick={() =>
                change({
                  kind: 'at-times',
                  minute,
                  hours: hours.filter((h) => h !== hour),
                })
              }
            />
          </span>
        ))}
        {hours.length < 8 && (
          <SmallTextButton
            title={t('Add time')}
            onClick={() => {
              const next = nextHour(first, hours)
              if (next !== undefined)
                change({ kind: 'at-times', minute, hours: [...hours, next] })
            }}
          />
        )}
      </>
    )
  }
  // `zgn`: so many minutes or hours, between two hours.
  const { unit, amount, fromHour, toHour } = time
  return (
    <>
      <ChoicePill
        label={t('Interval amount')}
        options={intervalChoices(unit, amount).map((n) => ({
          value: n,
          label: String(n),
        }))}
        value={amount}
        pick={(next) => change({ ...time, amount: next })}
      />
      <ChoicePill
        label={t('Interval unit')}
        options={windowUnits.map((one) => ({
          value: one,
          label: unitLabel(one),
        }))}
        value={unit}
        pick={(next) =>
          change({ ...time, unit: next, amount: unitAmount(amount, next) })
        }
      />
      <Word text={t('between')} />
      <ChoicePill
        label={t('From hour')}
        options={Array.from({ length: 24 }, (_, h) => ({
          value: h,
          label: clock(h, 0),
        }))}
        value={fromHour}
        pick={(next) =>
          change({ ...time, fromHour: next, toHour: Math.max(toHour, next) })
        }
      />
      <Word text={t('and')} />
      <ChoicePill
        label={t('To hour')}
        options={Array.from({ length: 24 - fromHour }, (_, i) => ({
          value: fromHour + i,
          label: clock(fromHour + i, 0),
        }))}
        value={toHour}
        pick={(next) => change({ ...time, toHour: next })}
      />
    </>
  )
}

/** One of Advanced's lines: its label (44 wide, at least 26 high) and its controls wrapping beside it. */
function GridLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid-line">
      <span className="grid-label">{label}</span>
      <FlowLine>{children}</FlowLine>
    </div>
  )
}

/**
 * Custom's line (`Schedule`): the raw line ("@every 30m", a cron line, an
 * alias, `CRON_TZ=…`), full width, 32 high, round 10. Typing shows it in
 * the row; letting go of the keys saves it when the host can run it, else
 * it stays a draft (closing the popover then puts the last good one back).
 * Return lets go.
 */
function CustomScheduleField({
  text,
  width,
  change,
  done,
}: {
  text: string
  width: number
  change: (text: string) => void
  done: (text: string) => void
}) {
  return (
    <input
      className="custom-schedule"
      style={{ width }}
      value={text}
      aria-label={t('Schedule')}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(event) => change(event.target.value)}
      onBlur={(event) => {
        if (!windowLetGo()) done(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

// MARK: Events (`r2n`, `o2n`, `c2n`, `u2n`)

type RowOf<K extends TriggerRow['kind']> = Extract<TriggerRow, { kind: K }>

/** New messages with a word typed is a keyword match (`JUe`). */
function slackMatch(event: string, keyword: string): string {
  if (event !== 'message') return event
  return keyword.trim() === '' ? 'message' : 'keyword'
}

/** Slack: the event menu, "in", #channel; "containing" Any text (a word makes it a keyword match), or "with emoji" and "from". Right once it has a channel. */
function SlackFields({
  row,
  edit,
  line,
}: {
  row: RowOf<'slack'>
  edit: RowEdit
  line: number
}) {
  const openMenu = useContext(MenuOpener)
  // A keyword match is still "New messages" in the menu (`n2n`).
  const event = row.match === 'keyword' ? 'message' : row.match
  return (
    <>
      <FlowLine>
        <MenuPill
          text={slackButton()[event] ?? t('New messages')}
          label={t('Slack event')}
          open={(anchor) =>
            openMenu(
              chooseMenu(anchor, slackEvents(), event, 200, false, (picked) => {
                const current = edit.current()
                if (picked === event || current?.kind !== 'slack') return
                edit.pick({
                  ...current,
                  match: slackMatch(picked, current.keyword),
                })
              }),
            )
          }
        />
        <Word text={t('in')} />
        <PillField
          label={t('Slack channel')}
          placeholder="#channel"
          value={row.channel}
          autoFocus={row.channel.trim() === ''}
          line={line}
          change={(channel) => edit.change({ ...row, channel })}
          commit={edit.commit}
        />
      </FlowLine>
      {event === 'message' && (
        <FlowLine>
          <Word text={t('containing')} />
          <PillField
            label={t('Message contains')}
            placeholder={t('Any text')}
            value={row.keyword}
            line={line}
            change={(keyword) =>
              edit.change({
                ...row,
                match: slackMatch('message', keyword),
                keyword,
              })
            }
            commit={edit.commit}
          />
        </FlowLine>
      )}
      {event === 'reaction' && (
        <>
          <FlowLine>
            <Word text={t('with emoji')} />
            <PillField
              label={t('Reaction emoji')}
              placeholder={t('Any emoji')}
              value={row.emoji}
              line={line}
              change={(emoji) => edit.change({ ...row, emoji })}
              commit={edit.commit}
            />
          </FlowLine>
          <FlowLine>
            <Word text={t('from')} />
            <ChoicePill
              label={t('Reactor')}
              options={reactors()}
              value={row.bySelf}
              pick={(bySelf) => edit.pick({ ...row, bySelf })}
            />
          </FlowLine>
        </>
      )}
    </>
  )
}

/** Git: the events menu (ticks under their headings; each tick saves), "in", owner/repo; "from" for review and PR events, "on branch" for CI. */
function GitFields({
  row,
  edit,
  line,
}: {
  row: RowOf<'github'>
  edit: RowEdit
  line: number
}) {
  const openMenu = useContext(MenuOpener)
  const isCI = (event: string) => event === 'ci-passed' || event === 'ci-failed'
  const ci = row.events.some(isCI)
  const other = row.events.some((event) => !isCI(event))
  return (
    <>
      <FlowLine>
        <MenuPill
          text={gitButton(row.events)}
          label={t('Git events')}
          open={(anchor) =>
            openMenu({
              anchor,
              label: t('Git events'),
              // At least 160, its ticks' views 200 wide.
              minWidth: 200,
              rows: () => {
                const current = edit.current()
                const events = current?.kind === 'github' ? current.events : []
                return gitSections().flatMap((section, at): MenuRow[] => [
                  ...(at > 0 ? [{ separator: true }] : []),
                  { header: section.title },
                  ...section.events.map(
                    (event): MenuRow => ({
                      label: event.label,
                      tick: events.includes(event.kind),
                      action: () => {
                        const now = edit.current()
                        if (now?.kind !== 'github') return
                        edit.pick({
                          ...now,
                          events: toggledGitEvents(now.events, event.kind),
                        })
                      },
                    }),
                  ),
                ])
              },
            })
          }
        />
        <Word text={t('in')} />
        <PillField
          label={t('Repository')}
          placeholder="owner/repo"
          value={row.repo}
          autoFocus={row.repo.trim() === ''}
          line={line}
          change={(repo) => edit.change({ ...row, repo })}
          commit={edit.commit}
        />
      </FlowLine>
      {other && (
        <FlowLine>
          <Word text={t('from')} />
          <PillField
            label={t('User allowlist')}
            placeholder={t('Anyone')}
            value={row.userAllowlist}
            line={line}
            change={(userAllowlist) => edit.change({ ...row, userAllowlist })}
            commit={edit.commit}
          />
        </FlowLine>
      )}
      {ci && (
        <FlowLine>
          <Word text={t('on branch')} />
          <PillField
            label={t('CI branch')}
            placeholder="main"
            value={row.ciBranch}
            line={line}
            change={(ciBranch) => edit.change({ ...row, ciBranch })}
            commit={edit.commit}
          />
        </FlowLine>
      )}
    </>
  )
}

/** Teams: "New messages" "in" Team IDs; tenant; channels; containing, Text or Regex; from Anyone or Only linked users. Right with a tenant and a team. */
function TeamsFields({
  row,
  edit,
  line,
}: {
  row: RowOf<'teams'>
  edit: RowEdit
  line: number
}) {
  const openMenu = useContext(MenuOpener)
  return (
    <>
      <FlowLine>
        <MenuPill
          text={t('New messages')}
          label={t('Teams event')}
          open={(anchor) =>
            openMenu(
              chooseMenu(
                anchor,
                [{ value: 'message', label: t('New message in channel') }],
                'message',
                200,
                false,
                () => {},
              ),
            )
          }
        />
        <Word text={t('in')} />
        <PillField
          label={t('Team IDs')}
          placeholder={t('Team IDs')}
          value={row.teamIds}
          autoFocus={row.teamIds.trim() === ''}
          line={line}
          change={(teamIds) => edit.change({ ...row, teamIds })}
          commit={edit.commit}
        />
      </FlowLine>
      <FlowLine>
        <Word text={t('tenant')} />
        <PillField
          label={t('Tenant ID')}
          placeholder={t('Tenant ID')}
          value={row.tenantId}
          line={line}
          change={(tenantId) => edit.change({ ...row, tenantId })}
          commit={edit.commit}
        />
      </FlowLine>
      <FlowLine>
        <Word text={t('channels')} />
        <PillField
          label={t('Channel IDs')}
          placeholder={t('Every channel')}
          value={row.channelIds}
          line={line}
          change={(channelIds) => edit.change({ ...row, channelIds })}
          commit={edit.commit}
        />
      </FlowLine>
      <FlowLine>
        <Word text={t('containing')} />
        <PillField
          label={t('Message contains')}
          placeholder={t('Any message')}
          value={row.messageContains}
          line={line}
          change={(messageContains) => edit.change({ ...row, messageContains })}
          commit={edit.commit}
        />
        <ChoicePill
          label={t('Message match')}
          options={teamsMatch()}
          value={row.isRegex}
          pick={(isRegex) => edit.pick({ ...row, isRegex })}
        />
      </FlowLine>
      <FlowLine>
        <Word text={t('from')} />
        <ChoicePill
          label={t('Teams audience')}
          options={teamsAudience()}
          value={row.linkedOnly}
          pick={(linkedOnly) => edit.pick({ ...row, linkedOnly })}
        />
      </FlowLine>
    </>
  )
}

/** Linear: the event alone on its line; "with status" or "cycles" for those events; "in" projects; "for" teams. Always right. */
function LinearFields({
  row,
  edit,
  line,
}: {
  row: RowOf<'linear'>
  edit: RowEdit
  line: number
}) {
  return (
    <>
      <FlowLine>
        <ChoicePill
          label={t('Linear event')}
          options={linearEvents()}
          value={row.event}
          pick={(event) => edit.pick({ ...row, event })}
        />
      </FlowLine>
      {row.event === 'statusChanged' && (
        <FlowLine>
          <Word text={t('with status')} />
          <PillField
            label={t('Status IDs')}
            placeholder={t('Any status')}
            value={row.statusIds}
            line={line}
            change={(statusIds) => edit.change({ ...row, statusIds })}
            commit={edit.commit}
          />
        </FlowLine>
      )}
      {row.event === 'endOfCycle' && (
        <FlowLine>
          <Word text={t('cycles')} />
          <PillField
            label={t('Cycle IDs')}
            placeholder={t('Any cycle')}
            value={row.cycleIds}
            line={line}
            change={(cycleIds) => edit.change({ ...row, cycleIds })}
            commit={edit.commit}
          />
        </FlowLine>
      )}
      <FlowLine>
        <Word text={t('in')} />
        <PillField
          label={t('Project IDs')}
          placeholder={t('All projects')}
          value={row.projectIds}
          line={line}
          change={(projectIds) => edit.change({ ...row, projectIds })}
          commit={edit.commit}
        />
      </FlowLine>
      <FlowLine>
        <Word text={t('for')} />
        <PillField
          label={t('Team IDs')}
          placeholder={t('All teams')}
          value={row.teamIds}
          line={line}
          change={(teamIds) => edit.change({ ...row, teamIds })}
          commit={edit.commit}
        />
      </FlowLine>
    </>
  )
}

// MARK: The popover's controls

/** A line of the popover: its parts 6 apart, wrapping 6 under when the line is full, each line's parts centred on it. */
function FlowLine({ children }: { children: ReactNode }) {
  return <div className="flow-line">{children}</div>
}

/**
 * A connecting word (13/18, grey), given in the app's language where it is
 * written, as the Mac's (`Word`, each `String(localized:)`): "at", "in",
 * "from"… are the catalogue's; one English word read two ways has its own
 * key ("at" a minute past the hour is `hourly.at`, "on" a day of the week
 * `weekly.on`).
 */
function Word({ text }: { text: string }) {
  return <span className="flow-word">{text}</span>
}

/** The pill the popover's choices sit in (`$in` filled, md): 26 high, padded 6, round 6, the grey fill (darker under the pointer), its words and a small chevron; a Select's line is the text at 5%, a menu button's at 10%. */
function PillButton({
  text,
  label,
  menu,
  open,
}: {
  text: string
  label: string
  menu: boolean
  open: (anchor: DOMRect) => void
}) {
  return (
    <button
      type="button"
      className={classes('routine-pill', menu && 'menu')}
      aria-label={label}
      aria-haspopup="menu"
      onClick={(event) => open(event.currentTarget.getBoundingClientRect())}
    >
      <span className="pill-text">{text}</span>
      <ChevronDown />
    </button>
  )
}

/** A Select: its choices in the Mac's menu, the chosen one ticked and over the pill, as the Mac's pop-up buttons open. A pick saves. */
function ChoicePill<V extends string | number | boolean>({
  label,
  options,
  disabled = [],
  value,
  pick,
}: {
  label: string
  options: { value: V; label: string }[]
  disabled?: readonly V[]
  value: V
  pick: (value: V) => void
}) {
  const openMenu = useContext(MenuOpener)
  return (
    <PillButton
      text={options.find((option) => option.value === value)?.label ?? ''}
      label={label}
      menu={false}
      open={(anchor) =>
        openMenu(
          chooseMenu(
            anchor,
            options,
            value,
            200,
            true,
            (picked) => {
              if (picked !== value) pick(picked)
            },
            disabled,
          ),
        )
      }
    />
  )
}

/** A Select's choices (at least `minWidth` wide), the current one ticked; over the pill as the Mac's pop-up buttons open, or under it. */
function chooseMenu<V>(
  anchor: DOMRect,
  options: { value: V; label: string }[],
  current: V,
  minWidth: number,
  overSelected: boolean,
  pick: (value: V) => void,
  disabled: readonly V[] = [],
): OpenMenu {
  const chosen = options.findIndex((option) => option.value === current)
  return {
    anchor,
    minWidth,
    over: overSelected && chosen >= 0 ? chosen : undefined,
    rows: () =>
      options.map((option) => ({
        label: option.label,
        checked: option.value === current,
        disabled: disabled.includes(option.value),
        action: () => pick(option.value),
      })),
  }
}

/** A menu button (Months, the days, the Git events, Slack's and Teams' events): a pill with a 10% line opening its menu under it. */
function MenuPill({
  text,
  label,
  open,
}: {
  text: string
  label: string
  open: (anchor: DOMRect) => void
}) {
  return <PillButton text={text} label={label} menu open={open} />
}

/** A time of day (`cpe`): the 96 quarter hours and the current time, "9:00 AM". */
function TimePill({
  time,
  change,
}: {
  time: ClockTime
  change: (time: ClockTime) => void
}) {
  const minutes = time.hour * 60 + time.minute
  return (
    <ChoicePill
      label={t('Time')}
      options={timeChoices(minutes).map((value) => ({
        value,
        label: clock(Math.floor(value / 60), value % 60),
      }))}
      value={minutes}
      pick={(value) =>
        change({ hour: Math.floor(value / 60), minute: value % 60 })
      }
    />
  )
}

/** Measures words at 13 points in the window's face, as the Mac measures a pill field's (`NSString.size`). */
let measurer: CanvasRenderingContext2D | null | undefined
function wordsWidth(words: string): number {
  if (measurer === undefined) {
    measurer = document.createElement('canvas').getContext('2d')
    if (measurer)
      measurer.font = `13px ${getComputedStyle(document.body).fontFamily}`
  }
  return Math.ceil(measurer?.measureText(words).width ?? words.length * 7)
}

/**
 * A pill field (`ql`): 26 high, at least 72 wide and growing with its
 * words up to the line, padded 6, round 6, the grey fill with a 10% line.
 * Typing shows in the row's sentence at once; letting go of the keys
 * saves, and Return lets go.
 */
function PillField({
  label,
  placeholder,
  value,
  autoFocus = false,
  line,
  change,
  commit,
}: {
  label: string
  placeholder: string
  value: string
  autoFocus?: boolean
  line: number
  change: (value: string) => void
  commit: () => void
}) {
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) box.current?.focus()
    // Only as the field appears, as the Mac's `onAppear`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const shown = value === '' ? placeholder : value
  return (
    <input
      ref={box}
      className="pill-field"
      style={{ width: Math.min(line, Math.max(72, wordsWidth(shown) + 16)) }}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(event) => change(event.target.value)}
      onBlur={() => {
        if (!windowLetGo()) commit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/** A small icon button (`fr`, sm): 24, round 6, grey, the grey fill under the pointer. */
function SmallIconButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="small-icon-button"
      aria-label={label}
      onClick={onClick}
    >
      <XMark size={10} />
    </button>
  )
}

/** "+ Add time" (tertiary, small): 24 high, 12/16 in the text's colour. */
function SmallTextButton({
  title,
  onClick,
}: {
  title: string
  onClick: () => void
}) {
  return (
    <button type="button" className="small-text-button" onClick={onClick}>
      <Plus size={10} frame={16} />
      <span>{title}</span>
    </button>
  )
}

// MARK: Signs

/** The clock (`<circle r=8.2>`, `M12 7.4V12l3.1 2`) on a 24-point view, its line 1.6 of the 24. */
export function ClockGlyph({ size }: { size: number }) {
  return (
    <svg
      className="clock-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8.2" />
        <path d="M12 7.4V12l3.1 2" />
      </g>
    </svg>
  )
}

/** SF Symbols' `plus` at `size` (medium), centred in a `frame` box. */
export function Plus({ size, frame }: { size: number; frame: number }) {
  const side = size * 0.86
  return (
    <span className="glyph-frame" style={{ width: frame, height: frame }}>
      <svg width={side} height={side} viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1.6v12.8M1.6 8h12.8"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

/** SF Symbols' `xmark` at `size` (semibold). */
export function XMark({ size }: { size: number }) {
  const side = size * 0.78
  return (
    <svg width={side} height={side} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.4 2.4l11.2 11.2M13.6 2.4 2.4 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.3}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** SF Symbols' `chevron.down` at 8 (semibold) in a 10 box. */
function ChevronDown() {
  return (
    <span className="glyph-frame pill-chevron" aria-hidden="true">
      <svg width="8" height="8" viewBox="0 0 16 16">
        <path
          d="M2.5 5.5 8 11l5.5-5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** The Mac's own logos of the sources (its asset catalogue's `Connectors`), GitHub's lighter on dark. */
const sourceLogos: Record<string, { light: string; dark?: string }> = {
  slack: {
    light: new URL(
      '../../../../../mac/Simeon/Assets.xcassets/Connectors/slack.imageset/slack.png',
      import.meta.url,
    ).href,
  },
  github: {
    light: new URL(
      '../../../../../mac/Simeon/Assets.xcassets/Connectors/github.imageset/github.png',
      import.meta.url,
    ).href,
    dark: new URL(
      '../../../../../mac/Simeon/Assets.xcassets/Connectors/github.imageset/github-dark.png',
      import.meta.url,
    ).href,
  },
  microsoftTeams: {
    light: new URL(
      '../../../../../mac/Simeon/Assets.xcassets/Connectors/microsoft-teams.imageset/microsoft-teams.png',
      import.meta.url,
    ).href,
  },
  linear: {
    light: new URL(
      '../../../../../mac/Simeon/Assets.xcassets/Connectors/linear.imageset/linear.png',
      import.meta.url,
    ).href,
  },
  sentry: {
    light: new URL(
      '../../../../../mac/Simeon/Assets.xcassets/Connectors/sentry.imageset/sentry.png',
      import.meta.url,
    ).href,
  },
}

/** A trigger's sign: the clock for a schedule (14 in 18), PagerDuty's mark, else the source's logo (16 in the row, 18 in the menu), or a bolt. */
export function TriggerGlyph({
  platform,
  size,
}: {
  platform: string
  size: number
}) {
  const dark = useDarkScheme()
  if (platform === 'schedule')
    return (
      <span className="glyph-frame trigger-clock" aria-hidden="true">
        <ClockGlyph size={14} />
      </span>
    )
  if (platform === 'pagerduty')
    return (
      <svg
        className="trigger-logo"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {/* PagerDuty's mark (the window's `xZe`, moved 2.23 left). */}
        <path
          fill="#06ac38"
          d="M13.36 0H3.42v16.08h3.56V3.39h6.12c2.37 0 4.23 1.28 4.23 3.86 0 2.47-1.67 3.97-4.23 3.97H9.87v3.21h3.56c4.49 0 7.15-2.93 7.15-7.1C20.58 2.97 18.05 0 13.36 0ZM3.42 20.4h3.56V24H3.42Z"
        />
      </svg>
    )
  const logo = sourceLogos[platform]
  if (!logo)
    return (
      <span
        className="glyph-frame trigger-bolt"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 16 16">
          <path
            d="M9.2 1.5 3.5 9h4l-.9 5.5L12.5 7h-4z"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  return (
    <img
      className="trigger-logo"
      aria-hidden="true"
      src={dark && logo.dark ? logo.dark : logo.light}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  )
}

// MARK: Menus

/**
 * One row of the Mac's menus: an item (its picture, a tick before it when
 * it is the current choice, a submenu beside it), a tick that stays open
 * (`tick`, the Mac's checkbox in the item's own view), a heading, or a
 * line between groups.
 */
export interface MenuRow {
  label?: string
  image?: ReactNode
  /** The current choice, ticked (`state = .on`). */
  checked?: boolean
  /** A checkbox that stays open while it is ticked: on or off. */
  tick?: boolean
  disabled?: boolean
  action?: () => void
  submenu?: { label?: string; minWidth: number; rows: MenuRow[] }
  header?: string
  separator?: boolean
}

/** A menu open over the window: its rows (read again as the editor changes, so ticks follow), where it opens, and what closing it says. */
export interface OpenMenu {
  anchor: DOMRect
  rows: () => MenuRow[]
  minWidth: number
  label?: string
  /** The row placed over the anchor (a Select's chosen one), else the menu opens 4 under it. */
  over?: number
  closed?: (picked: boolean) => void
  /** What had the keys when it opened: they go back to it when it closes. */
  returnTo?: HTMLElement | null
}

/**
 * The Mac's menus (`RoutineMenus`), drawn as the window's own menus
 * (glass, 10 round, items 13 on 24): over the window, kept inside it and
 * scrolling when taller. A click outside, Escape or the window going to
 * the back closes it, and that click does nothing else, as with the Mac's
 * menus. ↑ and ↓ choose, → opens a submenu, ← goes back, Return or Space
 * picks; a tick stays open.
 */
function RoutineMenu({
  menu,
  close,
}: {
  menu: OpenMenu
  close: (picked: boolean) => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })
  // The keys go back to what had them when it opened, once it closes.
  const returnTo = menu.returnTo
  useEffect(
    () => () => {
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true })
    },
    [returnTo],
  )
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (holder.current?.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
      // As an AppKit menu, it takes the click outside it: nothing under it gets it, even once the menu is gone.
      swallowClick()
      latest.current(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      latest.current(false)
    }
    const wheel = (event: WheelEvent) => {
      if (!holder.current?.contains(event.target as Node)) latest.current(false)
    }
    const blur = () => latest.current(false)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    document.addEventListener('wheel', wheel, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('wheel', wheel, true)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return createPortal(
    <div ref={holder} className="routine-menus">
      <MenuPanel
        rows={menu.rows()}
        anchor={menu.anchor}
        over={menu.over}
        minWidth={menu.minWidth}
        label={menu.label}
        pick={(row) => {
          if (row.tick !== undefined) {
            row.action?.()
            return
          }
          latest.current(true)
          row.action?.()
        }}
        focusOnOpen
      />
    </div>,
    document.body,
  )
}

function MenuPanel({
  rows,
  anchor,
  over,
  side,
  minWidth,
  label,
  pick,
  back,
  focusOnOpen,
}: {
  rows: MenuRow[]
  anchor: DOMRect
  over?: number
  /** A submenu: the item it opens from, to open beside it (to its left when there is no room at its right). */
  side?: DOMRect
  minWidth: number
  label?: string
  pick: (row: MenuRow) => void
  back?: () => void
  focusOnOpen?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<{ index: number; rect: DOMRect }>()
  // Measured, then placed inside the window, before it is painted.
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const room = window.innerHeight - 16
    element.style.maxHeight = `${room}px`
    const width = element.offsetWidth
    const height = element.offsetHeight
    let left: number
    let top: number
    let scroll = 0
    if (side) {
      left = side.right - 4
      if (left + width > window.innerWidth - 8) left = side.left - width + 4
      top = side.top - 5
    } else if (over !== undefined) {
      // The chosen row over the pill, as the Mac's pop-up buttons open; a long list scrolls to keep it there.
      const chosen = element.querySelector<HTMLElement>(
        `[data-index="${over}"]`,
      )
      const offset = chosen ? chosen.offsetTop : 0
      left = anchor.left - 5
      top =
        anchor.top + (anchor.height - (chosen?.offsetHeight ?? 24)) / 2 - offset
      if (top < 8) {
        scroll = 8 - top
        top = 8
      }
    } else {
      left = anchor.left
      top = anchor.bottom + 4
    }
    if (left + width > window.innerWidth - 8)
      left = window.innerWidth - 8 - width
    const shown = Math.min(height, room)
    if (top + shown > window.innerHeight - 8)
      top = Math.max(8, window.innerHeight - 8 - shown)
    element.style.left = `${Math.max(8, left)}px`
    element.style.top = `${top}px`
    element.scrollTop = scroll
    element.style.visibility = 'visible'
    if (focusOnOpen || side) element.focus({ preventScroll: true })
  }, [anchor, over, side, focusOnOpen])
  const buttons = () => [
    ...(box.current?.querySelectorAll<HTMLButtonElement>(
      ':scope > .menu-item:not(:disabled)',
    ) ?? []),
  ]
  const openSub = (index: number, button: HTMLElement) =>
    setOpen({ index, rect: button.getBoundingClientRect() })
  // The column for the current choice's tick, in a menu of choices only.
  const states = rows.some((row) => row.checked !== undefined)
  return (
    <>
      <div
        ref={box}
        className="pop-menu routine-menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={{ minWidth, left: 0, top: 0, visibility: 'hidden' }}
        onKeyDown={(event) => {
          const list = buttons()
          const index = list.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          if (event.key === 'ArrowDown')
            list[(index + 1) % list.length]?.focus()
          else if (event.key === 'ArrowUp')
            list[
              index < 0
                ? list.length - 1
                : (index - 1 + list.length) % list.length
            ]?.focus()
          else if (event.key === 'ArrowRight') {
            const button = list[index]
            const at = Number(button?.dataset.index)
            if (button && rows[at]?.submenu) openSub(at, button)
            else return
          } else if (event.key === 'ArrowLeft' && back) back()
          else return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {rows.map((row, index) => {
          if (row.separator)
            return (
              <div
                key={`line-${index}`}
                className="menu-separator"
                role="separator"
              />
            )
          if (row.header !== undefined)
            return (
              <div key={`head-${index}`} className="menu-heading">
                {row.header}
              </div>
            )
          if (row.tick !== undefined)
            return (
              <button
                key={`${index}-${row.label}`}
                type="button"
                role="menuitemcheckbox"
                aria-checked={row.tick}
                data-index={index}
                disabled={row.disabled}
                className="menu-item menu-tick"
                onMouseEnter={() => setOpen(undefined)}
                onClick={() => pick(row)}
              >
                <span
                  className={classes('tick-box', row.tick && 'on')}
                  aria-hidden="true"
                >
                  {row.tick && (
                    <svg width="10" height="10" viewBox="0 0 16 16">
                      <path
                        d="M3 8.6 6.4 12 13 4.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="menu-label">{row.label}</span>
              </button>
            )
          return (
            <button
              key={`${index}-${row.label}`}
              type="button"
              role={row.checked ? 'menuitemradio' : 'menuitem'}
              aria-checked={row.checked ? true : undefined}
              aria-haspopup={row.submenu ? 'menu' : undefined}
              aria-expanded={row.submenu ? open?.index === index : undefined}
              data-index={index}
              disabled={row.disabled}
              className={classes(
                'menu-item',
                open?.index === index && 'expanded',
                row.image !== undefined && 'with-image',
              )}
              onMouseEnter={(event) => {
                if (row.submenu) openSub(index, event.currentTarget)
                else setOpen(undefined)
              }}
              onClick={(event) => {
                if (row.submenu) {
                  openSub(index, event.currentTarget)
                  return
                }
                pick(row)
              }}
            >
              {states && (
                <span className="menu-glyph">
                  {row.checked ? <Glyph name="check" /> : null}
                </span>
              )}
              {row.image !== undefined && (
                <span className="menu-image">{row.image}</span>
              )}
              <span className="menu-label">{row.label}</span>
              {row.submenu && <Glyph name="chevron" />}
            </button>
          )
        })}
      </div>
      {open &&
        (() => {
          const row = rows[open.index]
          if (!row?.submenu) return null
          return (
            <MenuPanel
              rows={row.submenu.rows}
              anchor={anchor}
              side={open.rect}
              minWidth={row.submenu.minWidth}
              label={row.submenu.label}
              pick={pick}
              back={() => {
                const index = open.index
                setOpen(undefined)
                box.current
                  ?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)
                  ?.focus()
              }}
            />
          )
        })()}
    </>
  )
}

/**
 * The click a press outside a popover or a menu makes reaches nothing (the
 * Mac's swallowed mouse-down): watched at the window, apart from the
 * popover's own listeners, which go with it as it closes before the click
 * comes; let go once that click (or a right click's menu) has come, or the
 * press ended without one.
 */
function swallowClick() {
  const stop = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const end = (event: Event) => {
    stop(event)
    done()
  }
  const later = () => setTimeout(done, 0)
  function done() {
    window.removeEventListener('mousedown', stop, true)
    window.removeEventListener('mouseup', stop, true)
    window.removeEventListener('click', end, true)
    window.removeEventListener('contextmenu', end, true)
    window.removeEventListener('pointerup', later, true)
    window.removeEventListener('pointercancel', later, true)
  }
  window.addEventListener('mousedown', stop, true)
  window.addEventListener('mouseup', stop, true)
  window.addEventListener('click', end, true)
  window.addEventListener('contextmenu', end, true)
  window.addEventListener('pointerup', later, true)
  window.addEventListener('pointercancel', later, true)
}
