// The Windows app's notifications (SimeonMacCore's AgentNotifications.swift:
// `AgentNotifications`, `NotificationDecider`, `NotificationFeed`, from the
// Electron app's `os-notification.ts` and its manager): "Iris needs you"
// when an agent starts waiting on the person, with a sound; the agent's name
// and its new message when a turn ends with one, silent. Never for what was
// there at launch, a hidden agent, an agent whose notifications are off,
// while the main window is focused, or twice for one agent and kind within
// 5 s. The page decides; the Windows app shows them (src/desktop/surfaces.ts).

import { t } from './l10n'
import type { Agent } from './models'

/**
 * What the computer says of the agents, as it says it, before the list's own
 * handling (Store.swift's `RosterNews`): the notifications and the taskbar's
 * number hear it (`AppStore.rosterNews`).
 */
export type RosterNews =
  /** The agents read at a connect (`listAgents`). */
  | { kind: 'seed'; agents: Agent[] }
  | { kind: 'roster'; agents: Agent[] }
  | { kind: 'update'; agent: Agent }

/** The same agent and kind are told at most once in this long (`throttleMs`). */
export const notificationThrottleMs = 5_000
/** A notification's body is at most this long, in UTF-16 units (`maxBodyLength`). */
export const notificationBodyLength = 140

export type NotificationKind = 'agent-needs-input' | 'agent-done'

/** What one roster row says, for this (`Snapshot`, `toNotificationSnapshot`). */
export interface NotificationSnapshot {
  id: string
  name: string
  isRunning: boolean
  awaitingReason?: string
  notifyEnabled: boolean
  isHidden: boolean
  lastMessageId?: string
  lastMessagePreview?: string
}

/** A roster row as the notifications read it (`Snapshot(agent)`). */
export function notificationSnapshot(agent: Agent): NotificationSnapshot {
  return {
    id: agent.id,
    name: agent.name,
    isRunning: agent.isRunning,
    awaitingReason: agent.waitingReason,
    notifyEnabled: agent.notifyOnUpdates,
    isHidden: agent.isHidden,
    lastMessageId: agent.lastMessageId,
    lastMessagePreview: agent.lastMessagePreview,
  }
}

/** An agent that started waiting, or finished a turn (`Transition`). */
export interface NotificationTransition {
  agentId: string
  agentName: string
  kind: NotificationKind
  reason?: string
  notifyEnabled: boolean
  isHidden: boolean
  lastMessageId?: string
  lastMessagePreview?: string
}

/**
 * Each agent seen before that started waiting (a reason where there was
 * none) or stopped running without waiting (`transitions`,
 * `diffAgentNotificationTransitions`). Waiting wins when both happen.
 */
export function notificationTransitions(
  previous: ReadonlyMap<string, NotificationSnapshot>,
  next: readonly NotificationSnapshot[],
): NotificationTransition[] {
  const out: NotificationTransition[] = []
  for (const agent of next) {
    const before = previous.get(agent.id)
    if (!before) continue
    const becameAwaiting =
      agent.awaitingReason != null && before.awaitingReason == null
    const finishedTurn =
      before.isRunning && !agent.isRunning && agent.awaitingReason == null
    if (!becameAwaiting && !finishedTurn) continue
    out.push({
      agentId: agent.id,
      agentName: agent.name,
      kind: becameAwaiting ? 'agent-needs-input' : 'agent-done',
      reason: becameAwaiting ? agent.awaitingReason : undefined,
      notifyEnabled: agent.notifyEnabled,
      isHidden: agent.isHidden,
      lastMessageId: agent.lastMessageId,
      lastMessagePreview: agent.lastMessagePreview,
    })
  }
  return out
}

/** Whether a change is told (`shouldNotify`). */
export function shouldNotify(input: {
  isHidden: boolean
  notifyEnabled: boolean
  isWindowFocused: boolean
  lastNotifiedAtMs?: number
  nowMs: number
  throttleWindowMs?: number
}): boolean {
  const throttle = input.throttleWindowMs ?? notificationThrottleMs
  return (
    !input.isHidden &&
    input.notifyEnabled &&
    !input.isWindowFocused &&
    (input.lastNotifiedAtMs == null ||
      input.nowMs - input.lastNotifiedAtMs >= throttle)
  )
}

/** The notification's words (`content`, `buildNotificationContent`). */
export function notificationContent(transition: NotificationTransition): {
  title: string
  body: string
} {
  const trimmed = transition.agentName.trim()
  const name = trimmed === '' ? t('Your agent') : trimmed
  if (transition.kind === 'agent-needs-input') {
    const reason = (transition.reason ?? '').trim()
    return {
      title: t`${name} needs you`,
      body:
        reason === ''
          ? t('Waiting for your input.')
          : truncateNotificationBody(reason),
    }
  }
  const summary = (transition.lastMessagePreview ?? '').trim()
  return {
    title: name,
    body:
      summary === ''
        ? t('Open Simeon to see what it did.')
        : truncateNotificationBody(summary),
  }
}

/** A lead surrogate: the first half of a character outside the Basic Multilingual Plane. */
function isLeadSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff
}

/**
 * Runs of spaces as one, then at most 140 UTF-16 units (`truncate`): 139,
 * trailing spaces dropped, and "…". A cut through an emoji drops its first
 * half, as the Mac does (JavaScript's own slice keeps it alone).
 */
export function truncateNotificationBody(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= notificationBodyLength) return collapsed
  let cut = collapsed.slice(0, notificationBodyLength - 1).trimEnd()
  if (cut.length > 0 && isLeadSurrogate(cut.charCodeAt(cut.length - 1)))
    cut = cut.slice(0, -1)
  return `${cut}…`
}

/**
 * Which transitions become notifications (`NotificationDecider`,
 * `SandOsNotificationDecider`): each agent's last row, the message each
 * agent's news was last counted for, and when each agent and kind last
 * notified. A finished turn notifies only for a message not counted yet;
 * counting happens before the other checks, so a turn that ends while the
 * window is focused is never told later.
 */
export class NotificationDecider {
  private previous = new Map<string, NotificationSnapshot>()
  private lastNotifiedAtMs = new Map<string, number>()
  /** Present once an agent was seen; its value may be undefined (no message yet). */
  private accountedMessageId = new Map<string, string | undefined>()

  constructor(readonly throttleWindowMs: number = notificationThrottleMs) {}

  private account(agent: NotificationSnapshot): void {
    if (!this.accountedMessageId.has(agent.id))
      this.accountedMessageId.set(agent.id, agent.lastMessageId)
  }

  /** A whole roster: what changed since the last one, which then becomes the last one (agents not in it forgotten). */
  decide(
    agents: readonly NotificationSnapshot[],
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    const out = this.gate(
      notificationTransitions(this.previous, agents),
      isWindowFocused,
      nowMs,
    )
    const next = new Map<string, NotificationSnapshot>()
    for (const agent of agents) {
      this.account(agent)
      next.set(agent.id, agent)
    }
    this.previous = next
    return out
  }

  /** The roster read at a connect: agents not known yet become known, nothing notifies, nothing known is replaced. */
  seedBaseline(agents: readonly NotificationSnapshot[]): void {
    for (const agent of agents) {
      if (!this.previous.has(agent.id)) this.previous.set(agent.id, agent)
      this.account(agent)
    }
  }

  /** One agent's new row. */
  decideAgent(
    agent: NotificationSnapshot,
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    const out = this.gate(
      notificationTransitions(this.previous, [agent]),
      isWindowFocused,
      nowMs,
    )
    this.account(agent)
    this.previous.set(agent.id, agent)
    return out
  }

  /** Kept without deciding. */
  observeAgent(agent: NotificationSnapshot): void {
    this.account(agent)
    this.previous.set(agent.id, agent)
  }

  forget(agentId: string): void {
    this.previous.delete(agentId)
    this.accountedMessageId.delete(agentId)
    this.lastNotifiedAtMs.delete(key(agentId, 'agent-done'))
    this.lastNotifiedAtMs.delete(key(agentId, 'agent-needs-input'))
  }

  private gate(
    transitions: readonly NotificationTransition[],
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    const out: NotificationTransition[] = []
    for (const transition of transitions) {
      const accounted = this.accountedMessageId.get(transition.agentId)
      if (
        transition.kind === 'agent-done' &&
        (transition.lastMessageId == null ||
          transition.lastMessageId === accounted)
      )
        continue
      this.accountedMessageId.set(transition.agentId, transition.lastMessageId)
      const kept = key(transition.agentId, transition.kind)
      if (
        shouldNotify({
          isHidden: transition.isHidden,
          notifyEnabled: transition.notifyEnabled,
          isWindowFocused,
          lastNotifiedAtMs: this.lastNotifiedAtMs.get(kept),
          nowMs,
          throttleWindowMs: this.throttleWindowMs,
        })
      ) {
        this.lastNotifiedAtMs.set(kept, nowMs)
        out.push(transition)
      }
    }
    return out
  }
}

function key(agentId: string, kind: NotificationKind): string {
  return `${agentId}:${kind}`
}

/**
 * The notifications' order of events (`NotificationFeed`,
 * `SandOsNotificationManager`): an agent's update that arrives before the
 * first roster waits for it; the first roster, or the roster read at
 * connecting, is the starting point. The app shows what this returns.
 */
export class NotificationFeed {
  private decider = new NotificationDecider()
  private seeded = false
  private waiting: Agent[] = []

  /** A whole roster from the computer (`agents`). */
  roster(
    agents: readonly Agent[],
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    const shown = this.decider.decide(
      agents.map(notificationSnapshot),
      isWindowFocused,
      nowMs,
    )
    return [...shown, ...this.flush(isWindowFocused, nowMs)]
  }

  /** One agent's update (`agent-upserted`); held until the first roster. */
  update(
    agent: Agent,
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    if (!this.seeded) {
      this.waiting.push(agent)
      return []
    }
    return this.decider.decideAgent(
      notificationSnapshot(agent),
      isWindowFocused,
      nowMs,
    )
  }

  /** The roster read at each connect (`listAgents`): the starting point, then what waited. */
  seed(
    agents: readonly Agent[],
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    this.decider.seedBaseline(agents.map(notificationSnapshot))
    return this.flush(isWindowFocused, nowMs)
  }

  /** Another account, or none: everything forgotten. */
  reset(): void {
    this.decider = new NotificationDecider()
    this.seeded = false
    this.waiting = []
  }

  private flush(
    isWindowFocused: boolean,
    nowMs: number,
  ): NotificationTransition[] {
    if (this.seeded) return []
    this.seeded = true
    const held = this.waiting
    this.waiting = []
    return held.flatMap((agent) =>
      this.decider.decideAgent(
        notificationSnapshot(agent),
        isWindowFocused,
        nowMs,
      ),
    )
  }
}
