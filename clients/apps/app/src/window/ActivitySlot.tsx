// The agent at work under the messages (`ActivitySlot`, `ActivityRow` and
// `ActivityWords` in mac/Simeon/ChatMotion.swift): its picture and what it is
// doing, under the window's sweep of light.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { ActivityHold, type ActivityLine } from '../core/activity'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import { classes } from './classes'

/** The activity the hold keeps, while working (typing clears it). */
const working = (line: ActivityLine | undefined) =>
  line && line.verb !== 'typing' ? line : undefined

const seconds = () => performance.now() / 1000

/**
 * What the slot shows over time (`ActivitySlot`'s state): the agent shown
 * (kept while it goes out), the activity held for its 0.8 s, the time once a
 * minute has passed, and how many times it has come in. Its own timers move
 * it on, and the slot redraws when it changes.
 */
class ActivityShown {
  hold = new ActivityHold(undefined, 0)
  agent: Agent | undefined
  exiting = false
  /** Bumped when it comes in again, so its entrance plays again. */
  entrance = 0
  /** The time on the words, once past a minute. */
  elapsed: string | undefined
  private latest: ActivityLine | undefined
  private version = 0
  private listeners = new Set<() => void>()
  private dueTimer: ReturnType<typeof setTimeout> | undefined
  private minuteTimer: ReturnType<typeof setTimeout> | undefined
  private exitTimer: ReturnType<typeof setTimeout> | undefined

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = () => this.version

  private changed() {
    this.elapsed = this.hold.elapsed(seconds())
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  /** The agent's line now (`update`): it comes in, swaps its words after their 0.8 s, or goes out over 0.14 s. */
  update(line: ActivityLine | undefined, agent: Agent | undefined) {
    const now = seconds()
    this.latest = line
    if (!line || !agent) {
      if (this.agent && !this.exiting) {
        this.exiting = true
        clearTimeout(this.dueTimer)
        this.exitTimer = setTimeout(() => {
          if (!this.exiting) return
          this.exiting = false
          this.agent = undefined
          this.changed()
        }, 140)
        this.changed()
      }
      return
    }
    if (!this.agent || this.exiting) {
      // Coming in (again): a fresh hold, the entrance from the start.
      this.hold = new ActivityHold(working(line), now)
      if (this.exiting) this.entrance += 1
      this.exiting = false
      clearTimeout(this.exitTimer)
    } else if (line.verb === 'typing') {
      this.hold = new ActivityHold(undefined, now)
    } else {
      this.hold.want(line, now)
    }
    this.agent = agent
    this.schedule()
    this.changed()
  }

  /** A newer activity waits for the shown one's 0.8 s; the time joins the words after a minute and moves on each minute. */
  private schedule() {
    const now = seconds()
    clearTimeout(this.dueTimer)
    const due = this.hold.due
    if (due != null && !this.exiting)
      this.dueTimer = setTimeout(
        () => {
          this.hold.want(working(this.latest), seconds())
          this.schedule()
          this.changed()
        },
        Math.max(0, (due - now) * 1000),
      )
    clearTimeout(this.minuteTimer)
    const next = this.hold.nextMinute(now)
    if (next != null)
      this.minuteTimer = setTimeout(
        () => {
          this.schedule()
          this.changed()
        },
        Math.max(50, (next - now) * 1000),
      )
  }

  dispose() {
    clearTimeout(this.dueTimer)
    clearTimeout(this.minuteTimer)
    clearTimeout(this.exitTimer)
    this.listeners.clear()
  }
}

/**
 * The working line's place under the messages (`sand-activity-slot`), 40
 * high whether or not the agent works, so the messages do not move when it
 * starts. It comes in when the agent starts writing or working, holds each
 * activity's words for at least 0.8 s, and goes out over 0.14 s when it
 * stops.
 */
export function ActivitySlot({
  store,
  agent,
  line,
}: {
  store: AppStore
  agent: Agent | undefined
  line: ActivityLine | undefined
}) {
  const [shown] = useState(() => new ActivityShown())
  useSyncExternalStore(shown.subscribe, shown.snapshot)
  useEffect(() => shown.update(line, agent), [shown, line, agent])
  useEffect(() => () => shown.dispose(), [shown])
  const showing = agent ?? shown.agent
  if (!shown.agent || !showing) return <div className="activity-slot" />
  const typing =
    line?.verb === 'typing' || (line == null && shown.hold.shown == null)
  const words = typing
    ? t('Typing…')
    : (shown.hold.shown?.text ?? t('Working…'))
  const wordsKey = typing ? 'typing' : (shown.hold.shown?.key ?? 'working')
  const elapsed = typing ? undefined : shown.elapsed
  const spoken = typing
    ? t`${showing.name} is typing`
    : `${showing.name}: ${words}`
  return (
    <div className="activity-slot">
      <div
        key={shown.entrance}
        className={classes('activity-row', shown.exiting && 'exiting')}
        role="status"
        aria-label={spoken}
      >
        <WorkingPicture store={store} agent={showing} />
        <span key={wordsKey} className="activity-words" aria-hidden="true">
          <span className="shimmer">{words}</span>
          {elapsed && <span className="activity-time">· {elapsed}</span>}
        </span>
      </div>
    </div>
  )
}

/** The agent's picture at 28; in a group, the member at work (else the first) at 22, as the iPhone's `GroupActivityLine`. */
function WorkingPicture({ store, agent }: { store: AppStore; agent: Agent }) {
  if (!agent.isGroup)
    return <AgentMark agent={agent} agents={store.agents} size={28} />
  const members = agent.memberIds
    .map((id) => store.agent(id))
    .filter((member): member is Agent => member != null)
  const member =
    members.find(
      (one) => one.isRunningTurn || one.isComposing || one.isRunning,
    ) ?? members[0]
  return <AgentMark agent={member ?? agent} agents={store.agents} size={22} />
}
