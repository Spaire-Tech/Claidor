// Step 4c: an agent's routines in its pane (mac/Simeon/RoutinesPage.swift,
// the window's `K2n`, `_2n`, `P2n`): the list with New Routine, or the
// empty state; a routine's editor, which takes the whole pane (Back to
// Routines, Active, Delete, Test run, Name, Instruction, When to run
// (RoutineTriggerCard.tsx), Run history). Nothing is sent while typing: a
// field is saved when it lets go of the keys, a trigger when it is picked
// or its popover closes, and a new routine is made only once it has a
// name, an instruction and a trigger that is right
// (src/core/routineEditing.ts). Drawn by AgentPane.tsx.

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { Agent } from '../core/models'
import { RoutineEditing } from '../core/routineEditing'
import {
  type Routine,
  type RoutineRun,
  listedRoutines,
  routineIsRunning,
  routineRowDetail,
  routineSaveError,
  routinesEmpty,
  runSummary,
} from '../core/routines'
import { runStatus, runWhen } from '../core/routineTriggers'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import {
  PaneGlyph,
  PaneIconButton,
  PaneSwitch,
  PaneTextArea,
} from './AgentPane'
import { classes } from './classes'
import './Routines.css'
import { ClockGlyph, Plus, TriggerCard, XMark } from './RoutineTriggerCard'
import { useWatched } from './useStore'
import { type RoutineEditing as Opened, useWindowModel } from './windowModel'

// MARK: The list

/**
 * Routines (`RoutinesBody`, `K2n`, a column 6 apart): New Routine at the
 * right when there are routines, then their rows; the empty state when
 * there are none; nothing while the first read is on its way or failed.
 * The list is read again each time it shows; a routine's chip in the chat
 * opens its editor once the list has it (`W2n`).
 */
export function RoutinesBody({
  store,
  agent,
}: {
  store: AppStore
  agent: Agent
}) {
  const model = useWindowModel()
  useWatched(store)
  useWatched(model)
  const list = store.routinesByAgent[agent.id]
  const request = model.routineRequest

  // A routine's chip asked for its editor: opened once the list has it, else the list stays.
  const takeRequest = useRef(() => {})
  useLayoutEffect(() => {
    takeRequest.current = () => {
      const id = model.routineRequest
      const known = store.routinesByAgent[agent.id]
      if (id === undefined || !known) return
      model.routineRequestDone()
      if (known.some((routine) => routine.id === id))
        model.openRoutine(id, agent.id)
    }
  })
  useEffect(() => {
    let live = true
    void store.loadRoutines(agent.id).then(() => {
      if (live) takeRequest.current()
    })
    return () => {
      live = false
    }
  }, [store, agent.id])
  useEffect(() => takeRequest.current(), [list, request])

  if (!list) return <div className="routines-none" />
  const create = () => model.openRoutine(undefined, agent.id)
  if (list.length === 0) return <RoutinesEmpty create={create} />
  return (
    <div className="routines-body">
      <div className="routines-head">
        <button type="button" className="new-routine" onClick={create}>
          <Plus size={11} frame={12} />
          <span>{t('New Routine')}</span>
        </button>
      </div>
      <div className="routine-rows">
        {listedRoutines(list).map((routine) => (
          <RoutineRow
            key={routine.id}
            routine={routine}
            open={() => model.openRoutine(routine.id, agent.id)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * A routine's row (`H2n`, roomy): 48 high, round 10, 8 into the pane's
 * padding on both sides; the clock (green), the spinner (blue, turning)
 * while its run goes, or the pause sign (grey); its name over the host's
 * words for when it runs, or "Paused".
 */
function RoutineRow({ routine, open }: { routine: Routine; open: () => void }) {
  const detail = routineRowDetail(routine)
  return (
    <button
      type="button"
      className="routine-row"
      aria-label={`${routine.name}, ${detail}`}
      onClick={open}
    >
      <RoutineIcon routine={routine} />
      <span className="routine-lines">
        <span className="routine-line name">{routine.name}</span>
        <span className="routine-line detail">{detail}</span>
      </span>
    </button>
  )
}

/** The row's icon, 14 in an 18 box. */
function RoutineIcon({ routine }: { routine: Routine }) {
  let icon: ReactNode
  if (!routine.isEnabled)
    icon = (
      <svg
        className="routine-paused"
        width="13"
        height="13"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M6.4 5.3v5.4M9.6 5.3v5.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    )
  else if (routineIsRunning(routine)) icon = <RoutineSpinner size={14} />
  else
    icon = (
      <span className="routine-clock">
        <ClockGlyph size={14} />
      </span>
    )
  return <span className="routine-icon">{icon}</span>
}

/** The window's `loading` glyph: eight spokes fading round, turning once each 1.2 s (still with Reduce Motion). */
function RoutineSpinner({ size }: { size: number }) {
  return (
    <svg
      className="routine-spinner"
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      role="img"
      aria-label={t('Running')}
    >
      {Array.from({ length: 8 }, (_, index) => (
        <rect
          key={index}
          x={-1.44}
          y={-11.28}
          width={2.88}
          height={6.72}
          rx={1.44}
          fill="currentColor"
          opacity={0.25 + (0.75 * index) / 7}
          transform={`rotate(${index * 45})`}
        />
      ))}
    </svg>
  )
}

/**
 * No routines (`K2n`'s empty state, a column 18 apart, padded 12 above):
 * the 56-point tile (round 15) with the clock, the words (15/21, at most
 * 256 wide) and Create Routine (a 32-point capsule in the pane's ink).
 */
function RoutinesEmpty({ create }: { create: () => void }) {
  return (
    <div className="routines-empty">
      <span className="routines-empty-tile">
        <ClockGlyph size={26} />
      </span>
      <p className="routines-empty-words">{routinesEmpty()}</p>
      <button type="button" className="create-routine" onClick={create}>
        {t('Create Routine')}
      </button>
    </div>
  )
}

// MARK: The editor

/** Each editor opened (`PaneState.routineEditor`), afresh each time it is opened: by the window's record of it, with the number its page is drawn under. */
const editors = new WeakMap<Opened, { editing: RoutineEditing; key: number }>()
let opening = 0

function editorFor(
  store: AppStore,
  opened: Opened,
): { editing: RoutineEditing; key: number } {
  let found = editors.get(opened)
  if (!found) {
    const routine =
      opened.routineId === undefined
        ? undefined
        : store.routinesByAgent[opened.agentId]?.find(
            (one) => one.id === opened.routineId,
          )
    opening += 1
    found = {
      editing: new RoutineEditing(opened.agentId, routine),
      key: opening,
    }
    editors.set(opened, found)
  }
  return found
}

/**
 * A routine's editor (`RoutineEditorPage`, `_2n`): it takes the whole
 * pane. The top bar (44: Back to Routines, "Routine" in the middle,
 * Close), the control bar (44, fixed: Active, Delete, Test run; its
 * hairline shows as the body scrolls its first 16 points), then the body
 * scrolling under it. The routine gone (deleted elsewhere): back to the
 * list.
 */
export function RoutineEditorPage({
  store,
  agent,
  width,
}: {
  store: AppStore
  agent: Agent
  width: number
}) {
  const model = useWindowModel()
  useWatched(store)
  useWatched(model)
  const opened = model.routineEditor
  if (!opened) return null
  const { editing, key } = editorFor(store, opened)
  return (
    <EditorPage
      key={key}
      store={store}
      agent={agent}
      editing={editing}
      asked={opened.routineId}
      width={width}
    />
  )
}

function EditorPage({
  store,
  agent,
  editing,
  asked,
  width,
}: {
  store: AppStore
  agent: Agent
  editing: RoutineEditing
  /** The routine asked for, when the editor was opened on one. */
  asked?: string
  width: number
}) {
  const model = useWindowModel()
  useWatched(editing)
  const list = store.routinesByAgent[agent.id]
  const [scrolled, setScrolled] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const history = useRef<HTMLDivElement>(null)

  // The stored record changed: the fields follow it; gone, back to the list.
  useEffect(() => {
    const id = editing.routineId ?? asked
    if (id === undefined || !list) return
    const routine = list.find((one) => one.id === id)
    if (routine) editing.follow(routine)
    else model.backToRoutines()
  }, [list, editing, asked, model])

  // Test run: Run history comes into view, the least scroll that shows it (0.25 s).
  const requests = editing.historyRequests
  const seenRequests = useRef(requests)
  useEffect(() => {
    if (requests === seenRequests.current) return
    seenRequests.current = requests
    const box = scroller.current
    const item = history.current
    if (!box || !item) return
    const top =
      item.getBoundingClientRect().top -
      box.getBoundingClientRect().top +
      box.scrollTop
    const bottom = top + item.offsetHeight
    let next = box.scrollTop
    if (bottom > next + box.clientHeight) next = bottom - box.clientHeight
    if (top < next) next = top
    box.scrollTo({ top: next, behavior: 'smooth' })
  }, [requests])

  const running = editing.isRunning(store, store.routineRuns)
  return (
    <div className="pane-column routine-editor">
      <div className="pane-top-bar routine-top-bar">
        <PaneIconButton
          label={t('Back to Routines')}
          help={t('Back to Routines')}
          onClick={() => model.backToRoutines()}
        >
          <PaneGlyph name="chevronLeft" />
        </PaneIconButton>
        <span className="routine-top-title">{t('Routine')}</span>
        <span className="pane-top-space" />
        <PaneIconButton
          label={t('Close details')}
          help={t('Close')}
          onClick={() => model.closePane()}
        >
          <PaneGlyph name="xmark" />
        </PaneIconButton>
      </div>
      <div className="routine-control-bar">
        <span className="routine-active">
          <PaneSwitch
            on={editing.isActive(store)}
            disabled={editing.toggling}
            label={t('Active')}
            change={(on) => editing.toggleActive(on, store)}
          />
          <span>{t('Active')}</span>
        </span>
        <span className="pane-top-space" />
        <span className="routine-actions">
          <button
            type="button"
            className="routine-button"
            onClick={() => {
              // No question; a routine being made is deleted when its create comes back.
              editing.delete(store)
              model.backToRoutines()
            }}
          >
            {t('Delete')}
          </button>
          <button
            type="button"
            className="routine-button primary"
            disabled={editing.routineId === undefined || running}
            onClick={() => editing.testRun(store, store.routineRuns)}
          >
            {running ? t('Running…') : t('Test run')}
          </button>
        </span>
        <span
          className="routine-control-line"
          style={{ opacity: Math.min(1, Math.max(0, scrolled / 16)) }}
        />
      </div>
      <div
        ref={scroller}
        className="routine-editor-scroll"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop)}
      >
        <EditorBody
          store={store}
          editing={editing}
          width={Math.max(0, width - 24)}
          history={history}
        />
      </div>
    </div>
  )
}

/**
 * The editor's body (12 apart): the save error, Name (30 high, round 10),
 * Instruction (80 to 160 high, then it scrolls), When to run, Run
 * history. Escape in Name or Instruction closes the pane (the field is
 * saved as it goes); leaving the page while a field holds the keys saves
 * it as letting go would.
 */
function EditorBody({
  store,
  editing,
  width,
  history,
}: {
  store: AppStore
  editing: RoutineEditing
  width: number
  history: RefObject<HTMLDivElement | null>
}) {
  const model = useWindowModel()
  const name = useRef<HTMLInputElement>(null)
  const [nameFocused, setNameFocused] = useState(false)
  const [promptFocused, setPromptFocused] = useState(false)
  const [overhang, setOverhang] = useState(0)
  const [historyHeight, setHistoryHeight] = useState(0)

  // Only a new routine's name takes the keys.
  useEffect(() => {
    if (editing.isNew && editing.routineId === undefined) name.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back, ×, or another agent while a field held the keys: saved as letting go would.
  const latest = useRef({ nameFocused, promptFocused })
  useLayoutEffect(() => {
    latest.current = { nameFocused, promptFocused }
  })
  useEffect(
    () => () => {
      if (latest.current.nameFocused) editing.nameDone(store)
      if (latest.current.promptFocused) editing.promptDone(store)
    },
    [editing, store],
  )

  useLayoutEffect(() => {
    const item = history.current
    if (!item) return
    const measure = () => setHistoryHeight(item.offsetHeight)
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(item)
    return () => watcher.disconnect()
  }, [history])

  return (
    <div
      className="routine-editor-body"
      style={{
        width,
        // A trigger's popover covers Run history; the page grows only by what it hangs past the end, so it can be scrolled to.
        paddingBottom: 16 + Math.max(0, overhang - historyHeight - 12),
      }}
    >
      {editing.saveFailed && (
        <div className="routine-save-error" role="alert">
          {routineSaveError()}
        </div>
      )}
      <RoutineSection title={t('Name')}>
        <input
          ref={name}
          className="routine-name"
          value={editing.name}
          placeholder={t('Name this routine')}
          aria-label={t('Name')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => editing.setName(event.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => {
            setNameFocused(false)
            editing.nameDone(store)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
            // Escape is the window's: the pane closes (the field is saved as it goes).
            event.preventDefault()
            event.currentTarget.blur()
            model.closePane()
          }}
        />
      </RoutineSection>
      <RoutineSection title={t('Instruction')}>
        <div className="routine-field-box">
          <PaneTextArea
            value={editing.prompt}
            readOnly={false}
            focused={promptFocused}
            placeholder={t('What should this routine do each time it runs?')}
            accessibility={t('Instruction')}
            className="routine-instruction"
            change={(prompt) => editing.setPrompt(prompt)}
            focus={(now) => {
              setPromptFocused(now)
              if (!now) editing.promptDone(store)
            }}
            cancel={() => model.closePane()}
          />
        </div>
      </RoutineSection>
      <RoutineSection title={t('When to run')} raised>
        <TriggerCard
          editing={editing}
          store={store}
          width={width}
          overhang={setOverhang}
        />
      </RoutineSection>
      <div ref={history}>
        <RoutineSection title={t('Run history')}>
          <RunHistory runs={editing.stored(store)?.runs ?? []} />
        </RoutineSection>
      </div>
    </div>
  )
}

/** A section: its head (12/16, grey, padded 8 8 6) over its control. */
function RoutineSection({
  title,
  raised,
  children,
}: {
  title: string
  raised?: boolean
  children: ReactNode
}) {
  return (
    <section className={classes('routine-section', raised && 'raised')}>
      <h3 className="routine-section-title">{title}</h3>
      {children}
    </section>
  )
}

/** The time now, again every `every` milliseconds (`TimelineView(.periodic)`). */
function useNow(every: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(tick)
  }, [every])
  return now
}

/**
 * Run history (`J2n`): every run the record carries, newest first, each
 * 30 high: when it began ("Just now", "4 min ago", "Yesterday at 5:08 PM",
 * again every 30 seconds) and its sign (✓ green, × red, the spinner); its
 * detail or event under the pointer. "No runs yet" when there are none.
 */
function RunHistory({ runs }: { runs: RoutineRun[] }) {
  const now = useNow(30_000)
  if (runs.length === 0)
    return <div className="run-history-none">{t('No runs yet')}</div>
  return (
    <div className="run-history">
      {runs.map((run) => {
        const summary = runSummary(run)
        return (
          <div
            key={run.id}
            className="run-row"
            title={summary === '' ? undefined : summary}
          >
            <span className="run-when">
              {run.at !== undefined ? runWhen(run.at, now) : ''}
            </span>
            <RunStatusIcon status={run.status} />
          </div>
        )
      })}
    </div>
  )
}

/** A run's sign, 14 in an 18 box. */
function RunStatusIcon({ status }: { status: string }) {
  const label = runStatus(status)
  if (status === 'running')
    return (
      <span className="run-status">
        <RoutineSpinner size={14} />
      </span>
    )
  return (
    <span
      className={classes('run-status', status === 'ok' ? 'ok' : 'failed')}
      role="img"
      aria-label={label}
    >
      {status === 'ok' ? (
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2.6 8.6 6.3 12.3 13.6 3.9"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <XMark size={11} />
      )}
    </span>
  )
}
