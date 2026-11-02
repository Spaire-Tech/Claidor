// Step 5c: the computer's states (mac/Simeon/ComputerStates.swift;
// SimeonCore's ComputerRebuild.swift, RebuildDriver.swift,
// StoreRebuild.swift, MigrationWatch.swift): the computer's dialogs (the
// rebuild, "Couldn't Reach Simeon's Computer", recovery, a failed rebuild,
// Update), the pills at the window's top, low disk under the chat's head,
// the sidebar's update pill, and the access notice over the message field.
// The window places them (App.tsx, ChatPane.tsx, Sidebar.tsx, Composer.tsx).
// The access cover of the same Swift file is AccessCover.tsx (step 2g).

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { accessNotice, macCover, macRoute, pausesSending } from '../core/access'
import {
  type RebuildKind,
  type RebuildStep,
  RebuildWords,
} from '../core/computerRebuild'
import type { RebuildDriver } from '../core/rebuildDriver'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { openBlankTab } from './blankTab'
import { classes } from './classes'
import './ComputerStates.css'
import { listOrder } from './Sidebar'
import { useWatched } from './useStore'
import {
  type ComputerAsk,
  type WindowModel,
  useWindowModel,
} from './windowModel'

// MARK: The computer's dialogs

/**
 * The computer's one dialog at a time (`ComputerDialog`; decision 2: the
 * window lets them stack and lock each other): the rebuild in front,
 * "Couldn't Reach Simeon's Computer" and its recovery question, a failed
 * rebuild, or the question the person asked.
 */
export type ComputerDialog =
  | { kind: 'rebuild'; rebuild: RebuildKind; longer: boolean }
  | { kind: 'unreachable' }
  | { kind: 'recoverConfirm'; fromSidebar: boolean }
  | { kind: 'failed'; rebuild: RebuildKind; episode: number }
  | { kind: 'update' }

/** The dialog that shows now (`ComputerDialog.current`). */
export function currentDialog(
  driver: RebuildDriver,
  ask: ComputerAsk | undefined,
): ComputerDialog | undefined {
  const kind = driver.lock.kind
  if (kind !== undefined) {
    if (kind === 'reconnecting') {
      // Two minutes without the stream (`B$n`); a failed rebuild waits until it is back.
      if (driver.escalation === 'unreachable')
        return ask?.kind === 'recover' && !ask.fromSidebar
          ? { kind: 'recoverConfirm', fromSidebar: false }
          : { kind: 'unreachable' }
    } else if (driver.surface.surface !== 'background') {
      return {
        kind: 'rebuild',
        rebuild: kind,
        longer: driver.escalation === 'taking-longer',
      }
    } else {
      // In the background its pill shows; nothing else may start meanwhile.
      return undefined
    }
  } else if (driver.failure) {
    return {
      kind: 'failed',
      rebuild: driver.failure.request.kind,
      episode: driver.failure.episodeId,
    }
  }
  if (ask?.kind === 'update') return { kind: 'update' }
  if (ask?.kind === 'recover')
    return { kind: 'recoverConfirm', fromSidebar: ask.fromSidebar }
  return undefined
}

/**
 * What a lock beginning or settling does to the dialog (the Mac animates
 * `lock.kind == nil`): the one drawn before fades out when none follows it,
 * one appearing (or another in its place) fades in, and one that stays as it
 * was is left alone. `before` is what the previous render drew.
 */
export function lockFade(
  before: ComputerDialog | undefined,
  now: ComputerDialog | undefined,
): 'in' | 'out' | undefined {
  if (before && !now) return 'out'
  if (now && JSON.stringify(before) !== JSON.stringify(now)) return 'in'
  return undefined
}

/** What a rebuild's dialog draws: its title, its steps and how far, which only goes forward for this rebuild. */
interface RebuildView {
  kind: RebuildKind
  title: string
  steps: RebuildStep[]
  progress: number
}

/**
 * The agent the window shows, told to the store (`windowSelection`, set
 * by MainWindow.swift's `open`): the one asked for while the roster has it,
 * else the first in the sidebar's order, as the window opens it. A chat
 * closing just before the next opens does not read as nothing selected.
 */
function useComputerSelection(store: AppStore, model: WindowModel): void {
  const asked = model.selected
  const known =
    asked != null && store.agents.some((agent) => agent.id === asked)
  const shown = known ? asked : listOrder(store)[0]
  useEffect(() => store.setWindowSelection(shown), [store, shown])
}

/**
 * Whether this account may use Simeon, read as the Mac reads it: once the
 * window opens (`attach`), and each time it comes forward, not while the
 * computer is rebuilt (MainWindow.swift's `cameForward`). The plan with it
 * while sending waits, for the notice's words (`MacUpgrade.cover`).
 */
function useWindowAccess(store: AppStore): void {
  useEffect(() => {
    let live = true
    const read = () => {
      if (store.rebuildingNow()) return
      void (async () => {
        await store.refreshAccess()
        // The plan only for an account that can't send: the notice's words depend on it.
        if (live && pausesSending(store.access)) await store.refreshPlan()
      })()
    }
    read()
    window.addEventListener('focus', read)
    return () => {
      live = false
      window.removeEventListener('focus', read)
    }
  }, [store])
}

/** The open dialog's keys (`ViewerKeys(aboveLocks:)`): set while a dialog shows, read by the layer's listener. */
let dialogKeys: ((event: KeyboardEvent) => boolean) | undefined

/** What the layer draws: the dialog, and a rebuild's view. */
interface Shown {
  dialog: ComputerDialog
  rebuild?: RebuildView
}

/**
 * The dialogs over the window (`ComputerDialogLayer`; `u8n`, `U5e`,
 * `K1t`/`FAe`): the scrim (the ink at 50%, 70% on dark) and a centred card,
 * 14 round with a hairline. They open at once; the rebuild's fades
 * (0.16 s) as its lock begins and as it settles, and goes at once to the
 * background. Each holds the keys while it shows: Return presses the button
 * the window focuses first, Escape what it does there, the rest nothing; ⌘
 * keys (Control elsewhere) go on to the window, which waits under it.
 */
export function ComputerDialogLayer({ store }: { store: AppStore }): ReactNode {
  useWatched(store)
  const model = useWindowModel()
  useWatched(model)
  useComputerSelection(store, model)
  useWindowAccess(store)
  const driver = store.rebuild
  const dialog = currentDialog(driver, model.computerAsk)
  const locked = driver.lock.kind !== undefined

  // A rebuild beginning lets go of any question asked before it (it would come back out of place once the rebuild ends).
  const lockKind = driver.lock.kind
  useEffect(() => {
    if (lockKind !== undefined && lockKind !== 'reconnecting')
      if (model.computerAsk) model.askComputer(undefined)
  }, [lockKind, model])

  // The rebuild's steps, the bar only going forward for this rebuild (`furthest`).
  const [furthest, setFurthest] = useState<{ key: string; progress: number }>()
  let rebuild: RebuildView | undefined
  if (dialog?.kind === 'rebuild') {
    const projected = store.rebuildSteps(dialog.rebuild)
    const key = `${dialog.rebuild}:${driver.lock.operationId ?? ''}`
    const before = furthest?.key === key ? furthest.progress : 0
    const progress = Math.max(before, projected.progress)
    if (progress !== before || furthest?.key !== key)
      setFurthest({ key, progress })
    rebuild = {
      kind: dialog.rebuild,
      title: RebuildWords.title(dialog.rebuild),
      steps: projected.steps,
      progress,
    }
  }

  // Only the lock beginning or settling fades it (0.16 s), and only a dialog that appears or goes with it (`ComputerStates.swift`'s animation on `lock.kind == nil`); the one drawn last stays while it fades out.
  const present = dialog !== undefined
  const shownNow: Shown | undefined = dialog ? { dialog, rebuild } : undefined
  const [previous, setPrevious] = useState<Shown>()
  const [wasLocked, setWasLocked] = useState(locked)
  const [leaving, setLeaving] = useState<Shown>()
  const [fading, setFading] = useState(false)
  if (wasLocked !== locked) {
    setWasLocked(locked)
    const fade = lockFade(previous?.dialog, dialog)
    if (fade === 'out') setLeaving(previous)
    else if (fade === 'in') setFading(true)
  }
  if (JSON.stringify(shownNow) !== JSON.stringify(previous))
    setPrevious(shownNow)
  if (present && leaving) setLeaving(undefined)
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(undefined), 160)
    return () => clearTimeout(timer)
  }, [leaving])
  useEffect(() => {
    if (!fading) return
    const timer = setTimeout(() => setFading(false), 160)
    return () => clearTimeout(timer)
  }, [fading])

  // Nothing behind keeps the keys while a dialog shows (the message field would take the letters); they go back after.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!present) return
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    before?.blur()
    box.current?.focus({ preventScroll: true })
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [present])

  // The keys, before anything under it: installed with the window, so it comes before what opens later.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (dialogKeys?.(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', down, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      dialogKeys = undefined
    }
  }, [])

  const showing = dialog ?? leaving?.dialog
  if (!showing) return null
  const className = classes(
    'computer-dialogs',
    !dialog ? 'fading-out' : fading && 'fading-in',
  )
  return (
    <div className={className}>
      <div
        className="computer-scrim"
        onClick={(event) => {
          if (event.target !== event.currentTarget || !dialog) return
          // A click outside closes what can be closed (21 October 2026): a confirmation's scrim is its Cancel (from the unreachable dialog, back to it), a failure's its Dismiss; a rebuild under way and the unreachable dialog take the click and do nothing.
          switch (dialog.kind) {
            case 'update':
            case 'recoverConfirm':
              model.askComputer(undefined)
              break
            case 'failed':
              driver.dismissFailure()
              break
            default:
              break
          }
        }}
      >
        <ComputerDialogCard
          key={showing.kind}
          dialog={showing}
          rebuild={dialog ? rebuild : leaving?.rebuild}
          store={store}
          model={model}
          takesKeys={dialog !== undefined}
          box={box}
        />
      </div>
    </div>
  )
}

/** The card for each dialog, its words from the shared code (`RebuildWords`), and its keys (`ComputerDialogCard`). */
function ComputerDialogCard({
  dialog,
  rebuild,
  store,
  model,
  takesKeys,
  box,
}: {
  dialog: ComputerDialog
  rebuild?: RebuildView
  store: AppStore
  model: WindowModel
  /** Its keys are the window's; not while it fades out. */
  takesKeys: boolean
  box: RefObject<HTMLDivElement | null>
}) {
  const driver = store.rebuild
  const pending = driver.pendingKind !== undefined
  const [refusal, setRefusal] = useState<string>()

  /** A confirmed update: refused in red and kept open (`zAe`), else started (or queued) and closed at once. */
  const confirmUpdate = (action: () => void) => {
    const refused = RebuildWords.refusal({
      update: true,
      isBlocked: driver.isBlocked,
      pending: driver.pendingKind,
      canReset: driver.canReset,
      canUpdate: driver.canUpdate,
    })
    if (refused !== undefined) {
      setRefusal(refused)
      return
    }
    action()
    model.askComputer(undefined)
  }
  const busy = store.computerUpdateOffer === 'busy-override'
  const confirmUpdateNow = () =>
    confirmUpdate(() =>
      busy ? driver.queueUpdateWhenIdle() : driver.update(false),
    )

  /**
   * Every key is the dialog's: Return (and Space) the focused button,
   * Escape as the window has it, the rest nothing (`Qpt`). ⌘ keys (Control
   * elsewhere) and the function keys go on.
   */
  const key = (event: KeyboardEvent): boolean => {
    if (event.metaKey || event.ctrlKey) return false
    if (/^F\d+$/.test(event.key)) return false
    const plain = !event.shiftKey && !event.altKey
    const escape = event.key === 'Escape' && plain
    const enter = (event.key === 'Enter' || event.key === ' ') && plain
    if (event.repeat && (escape || enter)) return true
    switch (dialog.kind) {
      case 'rebuild':
        if (dialog.longer) {
          if (escape || enter) driver.keepWaiting()
        } else if (enter) {
          driver.continueInBackground()
        }
        break
      case 'unreachable':
        // Escape does nothing; Return is the focused Recover.
        if (
          enter &&
          !driver.isBlocked &&
          driver.pendingKind === undefined &&
          driver.canRecover
        )
          model.askComputer({ kind: 'recover', fromSidebar: false })
        break
      case 'recoverConfirm':
        if (escape || enter) model.askComputer(undefined)
        break
      case 'failed':
        if (escape || enter) driver.dismissFailure()
        break
      case 'update':
        if (escape) model.askComputer(undefined)
        else if (enter) confirmUpdateNow()
        break
    }
    return true
  }
  // The latest keys while it shows; gone with it.
  useEffect(() => {
    if (!takesKeys) return
    dialogKeys = key
    return () => {
      if (dialogKeys === key) dialogKeys = undefined
    }
  })

  switch (dialog.kind) {
    case 'rebuild': {
      const kind = dialog.rebuild
      return (
        <>
          {rebuild && <RebuildCard view={rebuild} driver={driver} box={box} />}
          {dialog.longer && (
            // "Taking longer than expected" over it, with its own scrim, as the window stacks them (decision 9).
            <div className="computer-scrim stacked">
              <SimpleDialog
                title={RebuildWords.longerTitle()}
                message={RebuildWords.longerBody(kind)}
                width={440}
              >
                <DialogButton
                  title={RebuildWords.keepWaiting()}
                  style="neutral"
                  focused
                  action={() => driver.keepWaiting()}
                />
                <DialogButton
                  title={RebuildWords.continueInBackground()}
                  style="primary"
                  action={() => {
                    driver.keepWaiting()
                    driver.continueInBackground()
                  }}
                />
              </SimpleDialog>
            </div>
          )}
        </>
      )
    }
    case 'unreachable':
      return (
        <SimpleDialog
          title={RebuildWords.unreachableTitle()}
          message={RebuildWords.unreachableBody()}
          width={440}
          box={box}
        >
          <DialogButton
            title={RebuildWords.recoverButton()}
            style="neutral"
            focused
            disabled={driver.isBlocked || pending || !driver.canRecover}
            action={() =>
              model.askComputer({ kind: 'recover', fromSidebar: false })
            }
          />
          {/* Retry only waits two minutes more; the stream comes back by itself (`B$n` `retry`). */}
          <DialogButton
            title={t('Retry')}
            style="primary"
            action={() => driver.keepWaiting()}
          />
        </SimpleDialog>
      )
    case 'recoverConfirm': {
      const can = dialog.fromSidebar ? driver.canReset : driver.canRecover
      return (
        <SimpleDialog
          title={RebuildWords.recoverTitle()}
          message={RebuildWords.recoverBody()}
          width={440}
          box={box}
        >
          <DialogButton
            title={t('Cancel')}
            style="neutral"
            focused
            action={() => model.askComputer(undefined)}
          />
          <DialogButton
            title={RebuildWords.recoverButton()}
            style="primary"
            disabled={driver.isBlocked || pending || !can}
            action={() => {
              model.askComputer(undefined)
              // The sidebar's recovery is the window's reset (`forceRecreateComputer`, "Resetting Simeon's Computer").
              if (dialog.fromSidebar) driver.resetComputer()
              else driver.recoverComputer()
            }}
          />
        </SimpleDialog>
      )
    }
    case 'failed': {
      const kind = dialog.rebuild
      const can =
        kind === 'update'
          ? driver.canUpdate
          : kind === 'reset'
            ? driver.canReset
            : driver.canRecover
      return (
        <SimpleDialog
          title={RebuildWords.failedTitle(kind)}
          message={RebuildWords.failedBody(kind)}
          width={440}
          box={box}
        >
          <DialogButton
            title={t('Dismiss')}
            style="neutral"
            focused
            action={() => driver.dismissFailure()}
          />
          <DialogButton
            title={RebuildWords.retry(kind)}
            style={kind === 'reset' ? 'destructive' : 'primary'}
            disabled={driver.isBlocked || pending || !can}
            action={() => {
              if (kind === 'update') driver.update()
              else if (kind === 'reset') driver.resetComputer()
              else driver.recoverComputer()
            }}
          />
        </SimpleDialog>
      )
    }
    case 'update': {
      const words = busy
        ? RebuildWords.updateBusy(store.workingAgentNames)
        : RebuildWords.updateIdle()
      return (
        <SimpleDialog
          title={words.title}
          message={words.description}
          refusal={refusal}
          width={500}
          box={box}
        >
          <DialogButton
            title={words.cancel}
            style="neutral"
            action={() => model.askComputer(undefined)}
          />
          {words.secondary !== undefined && (
            <DialogButton
              title={words.secondary}
              style="red-secondary"
              action={() => confirmUpdate(() => driver.update(true))}
            />
          )}
          <DialogButton
            title={words.confirm}
            style="primary"
            focused
            action={confirmUpdateNow}
          />
        </SimpleDialog>
      )
    }
  }
}

/**
 * A simple dialog (`SimpleDialog`, `U5e`: 440; the confirmations 500): the
 * title (14/22, 600) over what it says (14/22, at 40%), padded 12 16; a
 * refusal in red; the buttons at the right of a 56-point bar.
 */
function SimpleDialog({
  title,
  message,
  refusal,
  width,
  box,
  children,
}: {
  title: string
  message: string
  refusal?: string
  width: number
  box?: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  return (
    <div
      ref={box}
      className="computer-card"
      style={{ width }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="computer-card-words">
        <div className="computer-card-title">{title}</div>
        <div className="computer-card-message">{message}</div>
        {refusal !== undefined && (
          <div className="computer-card-refusal" role="alert">
            {refusal}
          </div>
        )}
      </div>
      <div className="computer-card-buttons">{children}</div>
    </div>
  )
}

type ButtonStyle = 'neutral' | 'primary' | 'red-secondary' | 'destructive'

/** A dialog's button (`DialogButton`: 32 high, 8 round, 14/20, a half-point ring at 15%): grey, the primary's black (white on dark), red words, or red; the one the window focuses first has its ring. */
function DialogButton({
  title,
  style,
  focused = false,
  disabled = false,
  action,
}: {
  title: string
  style: ButtonStyle
  focused?: boolean
  disabled?: boolean
  action: () => void
}) {
  return (
    <button
      type="button"
      className={classes('computer-button', style, focused && 'focused')}
      disabled={disabled}
      // The keys stay with the dialog: a click does not move them to the button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {title}
    </button>
  )
}

/**
 * The rebuild in front (`RebuildDialog`, `d8n`, 520 wide, at most 480
 * high): its title over a hairline; the steps (done ✓ at 40%, under way
 * turning, still to come ○ at 60%; 13/18), the bar and its percent, which
 * only goes forward for this rebuild; Continue in Background on a bar under
 * a hairline. It cannot be closed.
 */
function RebuildCard({
  view,
  driver,
  box,
}: {
  view: RebuildView
  driver: RebuildDriver
  box: RefObject<HTMLDivElement | null>
}) {
  const progress = Math.min(Math.max(view.progress, 0), 1)
  const percent = Math.round(progress * 100)
  return (
    <div
      ref={box}
      className="computer-card rebuild"
      role="dialog"
      aria-modal="true"
      aria-label={view.title}
      tabIndex={-1}
    >
      <div className="rebuild-title" role="heading" aria-level={2}>
        {view.title}
      </div>
      <div className="computer-hairline" />
      <div className="rebuild-body">
        <div className="rebuild-steps">
          {view.steps.map((step, i) => (
            <div
              key={i}
              className={classes('rebuild-step', step.state)}
              aria-label={
                step.label +
                (step.state === 'done'
                  ? ', completed'
                  : step.state === 'active'
                    ? t(', in progress')
                    : t(', not started'))
              }
            >
              <span className="rebuild-step-mark" aria-hidden="true">
                {step.state === 'done' ? (
                  <CheckCircle />
                ) : step.state === 'active' ? (
                  <StateSpinner size={13} period={1} />
                ) : (
                  <OpenCircle />
                )}
              </span>
              <span className="rebuild-step-label" aria-hidden="true">
                {step.label}
              </span>
            </div>
          ))}
        </div>
        <div
          className="rebuild-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="rebuild-bar">
            <div
              className="rebuild-bar-fill"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="rebuild-percent">{percent}%</span>
        </div>
      </div>
      <div className="computer-hairline" />
      <div className="computer-card-buttons">
        <DialogButton
          title={RebuildWords.continueInBackground()}
          style="neutral"
          focused
          action={() => driver.continueInBackground()}
        />
      </div>
    </div>
  )
}

// MARK: The pills at the window's top

/**
 * The pills at the top of the window, 12 down and centred on it
 * (`ComputerPills`; `k8n`, `h8n`): "Reconnecting" while the stream is away
 * and a message waits on the computer (its spinner; "Checking connection"
 * once it is back, "Simeon's computer restarting" while the computer comes
 * up), and a rebuild sent to the background ("Updating Simeon's Computer",
 * its ring and the step under way), which brings its dialog back when
 * clicked. Over the computer's dialogs, as the Mac's window lays them.
 */
export function ComputerPills({ store }: { store: AppStore }): ReactNode {
  useWatched(store)
  const driver = store.rebuild
  const kind = driver.lock.kind
  if (kind === undefined) return null
  if (kind === 'reconnecting') {
    // Only while a message waits on the computer (26 October 2026): the list and the chats read from what was kept.
    if (!store.waitingToSend) return null
    const words = RebuildWords.reconnecting(driver.lock.stage, store.isLive)
    return (
      <div className="computer-pills">
        <div
          className="progress-pill quiet"
          role="status"
          aria-label={words.title}
        >
          <ProgressPill title={words.title} subtitle={words.subtitle} />
        </div>
      </div>
    )
  }
  if (
    driver.surface.surface !== 'background' ||
    driver.lock.stage === undefined
  )
    return null
  const steps = store.rebuildSteps(kind)
  return (
    <div className="computer-pills">
      <button
        type="button"
        className="progress-pill"
        aria-label={RebuildWords.bannerLabel()}
        onClick={() => driver.restoreForeground()}
      >
        <ProgressPill
          title={RebuildWords.title(kind)}
          subtitle={steps.steps[steps.activeIndex]?.label}
          progress={steps.progress}
        />
      </button>
    </div>
  )
}

/** A pill's inside (`ProgressPill`, `sand-progress-banner`): a ring with how far, or a spinner; the title (13/18, 500) and the line under it. */
function ProgressPill({
  title,
  subtitle,
  progress,
}: {
  title: string
  subtitle?: string
  progress?: number
}) {
  return (
    <>
      {progress !== undefined ? (
        <ProgressRing progress={progress} />
      ) : (
        <StateSpinner size={26} />
      )}
      <span className="progress-pill-words">
        <span className="progress-pill-title">{title}</span>
        {subtitle !== undefined && subtitle !== '' && (
          <span className="progress-pill-subtitle">{subtitle}</span>
        )}
      </span>
    </>
  )
}

/** The ring (16.5 across in a 22 frame, 2.75 wide): the ink at 10%, how far in the primary's black from the top. */
function ProgressRing({ progress }: { progress: number }) {
  const share = Math.max(0, Math.min(1, progress))
  const radius = 8.25
  const around = 2 * Math.PI * radius
  return (
    <svg
      className="progress-ring"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      role="img"
      aria-label={t('Progress')}
      aria-valuetext={`${Math.round(share * 100)}%`}
    >
      <circle className="track" cx="11" cy="11" r={radius} />
      {share > 0 && (
        <circle
          className="done"
          cx="11"
          cy="11"
          r={radius}
          strokeDasharray={`${around * share} ${around}`}
          transform="rotate(-90 11 11)"
        />
      )}
    </svg>
  )
}

/**
 * The computer's spinner (ComputerPreview.swift's `ScreenSpinner`): a ring
 * at 30% with a quarter at 60%, 2 wide, inset 1, turning once a `period`
 * (0.7 s); still with less motion.
 */
export function StateSpinner({
  size,
  period = 0.7,
}: {
  size: number
  period?: number
}) {
  const radius = size / 2 - 1
  const around = 2 * Math.PI * radius
  return (
    <svg
      className="state-spinner"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ animationDuration: `${period}s` }}
      aria-label={t('Loading')}
      role="img"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="rest"
        strokeDasharray={`${around * 0.75} ${around}`}
        strokeDashoffset={-around * 0.25}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="head"
        strokeDasharray={`${around * 0.25} ${around}`}
      />
    </svg>
  )
}

function CheckCircle() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="7" />
        <path d="M5 8.3l2 2 4-4.4" />
      </g>
    </svg>
  )
}

function OpenCircle() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  )
}

// MARK: Low disk

/**
 * Low disk (`DiskBanner`, `D8n`), under the chat's head, 16 in from each
 * side and in the page's flow (the messages start under it, told by
 * `onHeight`): "Computer is low on disk space" (or critically) in orange,
 * what Disk Saver is doing, and Go to Disk Saver ("Opening Disk Saver…"
 * while it opens). On the orange wash, 10 round, a half-point edge.
 */
export function DiskBanner({
  store,
  top,
  onHeight,
}: {
  store: AppStore
  top: number
  /** Its height and the 8 under it, or 0 when it is not shown (`bannerHeight`). */
  onHeight?: (height: number) => void
}): ReactNode {
  useWatched(store)
  const model = useWindowModel()
  const level = store.diskLevel
  const [launching, setLaunching] = useState(false)
  const banner = useRef<HTMLDivElement>(null)
  const shown = level !== undefined
  useLayoutEffect(() => {
    const element = banner.current
    if (!element || !shown) {
      onHeight?.(0)
      return
    }
    const observer = new ResizeObserver(() =>
      onHeight?.(element.offsetHeight + 8),
    )
    observer.observe(element)
    onHeight?.(element.offsetHeight + 8)
    return () => observer.disconnect()
  }, [shown, onHeight])
  if (!shown) return null
  return (
    <div
      ref={banner}
      className="disk-banner"
      style={{ top }}
      role="group"
      aria-label={t('Low disk space')}
    >
      <div className="disk-banner-words">
        <div className="disk-banner-title">
          {RebuildWords.diskTitle(level === 'hard')}
        </div>
        <div className="disk-banner-body">{RebuildWords.diskBody()}</div>
      </div>
      <button
        type="button"
        className="disk-banner-button"
        disabled={launching}
        onClick={() => {
          setLaunching(true)
          void (async () => {
            const id = await store.launchDiskSaver()
            if (id) model.choose(id)
            setLaunching(false)
          })()
        }}
      >
        {launching ? RebuildWords.diskOpening() : RebuildWords.diskButton()}
      </button>
    </div>
  )
}

// MARK: The access notice

/**
 * The line 8 over the message field and as wide (`AccessNotice`): why this
 * account can't send (no plan, a failed payment), the Mac's words for it
 * (`MacUpgrade.cover`). The title (13, 500) over what to do (12, at 60%)
 * on the soft grey, no edge, 14 round; the button in the app's ink, a
 * capsule, its words the ground's. Sending waits under it. Its button opens
 * the page as the access cover's does (the plans page, Apple's or Simeon
 * Labs' page in a new tab; Stripe's card page asked for first). The
 * credits' line (Usage & Billing) comes with Settings in step 6.
 */
export function AccessNotice({ store }: { store: AppStore }): ReactNode {
  useWatched(store)
  if (accessNotice(store.access) === undefined) return null
  const words = macCover(store.access, store.plan)

  const act = async () => {
    const route = macRoute(store.access, store.plan)
    if (route.kind === 'web') {
      window.open(route.url, '_blank', 'noopener')
      return
    }
    // Opened at once, before the answer, so the browser lets it open; sent to the page once it is known. It keeps no handle on the app.
    const page = openBlankTab()
    const answer = await store.billingPortal(route.flow)
    if (answer.url) {
      if (page) page.location.href = answer.url
      else window.open(answer.url, '_blank', 'noopener')
    } else {
      page?.close()
      // As on the Mac: the store keeps the failure (`store.problem`).
      store.keepProblem(answer.message)
    }
  }

  return (
    <div className="access-notice" role="status" aria-label={words.title}>
      <div className="access-notice-words">
        <div className="access-notice-title">{words.title}</div>
        <div className="access-notice-body">{words.body}</div>
      </div>
      {words.action !== undefined && (
        <button
          type="button"
          className="access-notice-button"
          onClick={() => void act()}
        >
          {words.action}
        </button>
      )}
    </div>
  )
}

// MARK: The sidebar

/**
 * The sidebar's Update (`ComputerUpdatePill`, `nTn`): a newer computer is
 * out for the open agent (the cloud, "A new version of Simeon's computer is
 * available"), or an update waits for the agents (the clock, "Update queued
 * — click to cancel"). A 24-point disc at the foot's right.
 */
export function ComputerUpdatePill({ store }: { store: AppStore }): ReactNode {
  useWatched(store)
  const model = useWindowModel()
  const driver = store.rebuild
  const queued =
    driver.isUpdateQueued &&
    driver.canUpdate &&
    driver.pendingKind === undefined &&
    !driver.isBlocked
  const offered =
    !queued &&
    store.computerUpdateAvailable &&
    store.computerUpdateOffer !== undefined
  if (!queued && !offered) return null
  const label = queued
    ? t('Update queued — click to cancel')
    : t("A new version of Simeon's computer is available")
  return (
    <button
      type="button"
      className="computer-update-pill"
      title={label}
      aria-label={label}
      onClick={() => {
        if (queued) driver.cancelQueuedUpdate()
        else model.askComputer({ kind: 'update' })
      }}
    >
      {queued ? <ClockGlyph /> : <CloudDownGlyph />}
    </button>
  )
}

/** `clock`, 12 medium. */
function ClockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="6.6" />
        <path d="M8 4.4V8l2.4 1.6" />
      </g>
    </svg>
  )
}

/** `icloud.and.arrow.down`, 12 medium. */
function CloudDownGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.6 12.4H4.2A3 3 0 0 1 3.9 6.4 4.3 4.3 0 0 1 12.2 5.6 3.4 3.4 0 0 1 12 12.4h-.6" />
        <path d="M8 7.6v6.2M5.9 11.8 8 13.9l2.1-2.1" />
      </g>
    </svg>
  )
}
