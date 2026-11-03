// The Windows app's notifications and taskbar number against what the
// Electron app's own code answered (the core's NotificationTests.swift):
// `Fixtures/notify.json` was made by running `shared/os-notification.ts`,
// main's `dock-badge.ts` and `dock-badge-manager.ts` as shipped, in Node, on
// scripted rosters. Read in place.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  NotificationDecider,
  NotificationFeed,
  type NotificationKind,
  type NotificationSnapshot,
  type NotificationTransition,
  notificationContent,
  notificationSnapshot,
  notificationTransitions,
  shouldNotify,
} from './agentNotifications'
import { DockBadge } from './dockBadge'
import { type Agent, agentFrom } from './models'

type Row = Record<string, unknown>
interface Case {
  name: string
  input: unknown
  output: unknown
}

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonMacCoreTests/Fixtures/notify.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { cases: Record<string, Case[]> }

function cases(group: string): Case[] {
  return fixture.cases[group] ?? []
}

function agent(row: unknown): Agent {
  const made = agentFrom(row ?? {})
  if (!made) throw new Error(`No agent in ${JSON.stringify(row)}`)
  return made
}

function snapshot(row: unknown): NotificationSnapshot {
  return notificationSnapshot(agent(row))
}

describe('the notifications (NotificationTests)', () => {
  it('says what the Electron app said (testTheWords)', () => {
    const rows = cases('buildNotificationContent')
    expect(rows.length).toBe(17)
    for (const row of rows) {
      const input = row.input as Row
      const transition: NotificationTransition = {
        agentId: 'a1',
        agentName: (input.agentName as string | null) ?? '',
        kind: input.kind as NotificationKind,
        reason: (input.reason as string | null) ?? undefined,
        notifyEnabled: true,
        isHidden: false,
        lastMessageId: 'm1',
        lastMessagePreview:
          (input.lastMessagePreview as string | null) ?? undefined,
      }
      const content = notificationContent(transition)
      const output = row.output as { title: string; body: string }
      expect(content.title, row.name).toBe(output.title)
      // A cut through an emoji: JavaScript keeps its first half alone before "…", the Mac (and this) drops it (the fixture's `note`).
      expect(content.body, row.name).toBe(output.body)
    }
  })

  it('notifies when the Electron app did (testWhenToNotify)', () => {
    const rows = cases('shouldNotify')
    expect(rows.length).toBe(25)
    for (const row of rows) {
      const input = row.input as Row
      expect(
        shouldNotify({
          isHidden: (input.isHidden as boolean | undefined) ?? false,
          notifyEnabled: (input.notifyEnabled as boolean | undefined) ?? false,
          isWindowFocused:
            (input.isWindowFocused as boolean | undefined) ?? false,
          lastNotifiedAtMs:
            (input.lastNotifiedAtMs as number | null) ?? undefined,
          nowMs: (input.nowMs as number | undefined) ?? 0,
          throttleWindowMs: (input.throttleWindowMs as number | undefined) ?? 0,
        }),
        row.name,
      ).toBe(row.output)
    }
  })

  it('reads a roster row as the Electron app did (testWhatARowSays)', () => {
    const rows = cases('toNotificationSnapshot')
    expect(rows.length).toBe(3)
    for (const row of rows) {
      const found = snapshot(row.input)
      const out = row.output as Row
      expect(found.id, row.name).toBe(out.id)
      expect(found.isRunning, row.name).toBe(out.isRunning)
      expect(found.awaitingReason ?? null, row.name).toBe(
        out.awaitingReason ?? null,
      )
      expect(found.notifyEnabled, row.name).toBe(out.notifyEnabled)
      expect(found.isHidden, row.name).toBe(out.isHiddenFromSidebar)
      expect(found.lastMessageId ?? null, row.name).toBe(
        out.lastMessageId ?? null,
      )
      expect(found.lastMessagePreview ?? null, row.name).toBe(
        out.lastMessagePreview ?? null,
      )
    }
  })

  it('finds the same changes (testTheChanges)', () => {
    for (const row of cases('diffAgentNotificationTransitions')) {
      // An empty reason is no reason here (the roster's text): the host never sends one.
      if (row.name.includes('empty string')) continue
      const input = row.input as { before: Row[]; after: Row[] }
      const before = new Map<string, NotificationSnapshot>()
      for (const item of input.before) {
        const found = snapshot(item)
        before.set(found.id, found)
      }
      const after = input.after.map(snapshot)
      const found = notificationTransitions(before, after)
      const shipped = row.output as Row[]
      expect(
        found.map((t) => t.agentId),
        row.name,
      ).toEqual(shipped.map((s) => s.agentId))
      expect(
        found.map((t) => t.kind),
        row.name,
      ).toEqual(shipped.map((s) => s.kind))
      expect(
        found.map((t) => t.reason ?? null),
        row.name,
      ).toEqual(shipped.map((s) => s.reason ?? null))
    }
  })

  it('decides as the Electron app did, step by step (testTheDecider)', () => {
    const scenarios = cases('SandOsNotificationDecider')
    expect(scenarios.length).toBe(11)
    for (const scenario of scenarios) {
      const decider = new NotificationDecider()
      const steps = scenario.output as { step: Row; shown: Row[] | null }[]
      steps.forEach((entry, index) => {
        const step = entry.step
        const focused = (step.focused as boolean | undefined) ?? false
        const now = (step.now as number | undefined) ?? 0
        let shown: NotificationTransition[] = []
        switch (step.op) {
          case 'seed':
            decider.seedBaseline((step.agents as Row[]).map(snapshot))
            break
          case 'upsert':
            shown = decider.decideAgent(snapshot(step.agent), focused, now)
            break
          case 'roster':
            shown = decider.decide(
              (step.agents as Row[]).map(snapshot),
              focused,
              now,
            )
            break
          default:
            throw new Error(`${scenario.name}: ${String(step.op)}`)
        }
        const expected = entry.shown ?? []
        const label = `${scenario.name}, step ${index}`
        expect(
          shown.map((t) => t.agentId),
          label,
        ).toEqual(expected.map((e) => e.agentId))
        expect(
          shown.map((t) => t.kind),
          label,
        ).toEqual(expected.map((e) => e.kind))
        expect(
          shown.map((t) => notificationContent(t).title),
          label,
        ).toEqual(expected.map((e) => e.title))
        expect(
          shown.map((t) => notificationContent(t).body),
          label,
        ).toEqual(expected.map((e) => e.body))
      })
    }
  })

  /** The manager's walk-through: an update before the first roster waits for it, then the turn's end and the question each notify once. */
  it('waits for its starting point (testTheFeedWaitsForItsStartingPoint)', () => {
    const feed = new NotificationFeed()
    const base = {
      id: 'a1',
      name: 'Iris',
      notifyOnUpdatesEnabled: true,
    }
    const idle = agent({
      ...base,
      isRunning: false,
      lastMessageId: 'm0',
      lastMessagePreview: 'old',
    })
    const running = agent({
      ...base,
      isRunning: true,
      lastMessageId: 'm0',
      lastMessagePreview: 'old',
    })
    const done = agent({
      ...base,
      isRunning: false,
      lastMessageId: 'm1',
      lastMessagePreview: 'All set.',
    })
    const asking = agent({
      ...base,
      isRunning: false,
      lastMessageId: 'm1',
      lastMessagePreview: 'All set.',
      awaitingUserResponse: { reason: 'Approval needed: wire $40' },
    })
    expect(feed.update(running, false, 0)).toEqual([])
    expect(feed.seed([idle], false, 0)).toEqual([])
    const first = feed.update(done, false, 1000)
    expect(first.map((t) => notificationContent(t).body)).toEqual(['All set.'])
    const second = feed.update(asking, false, 2000)
    expect(second.map((t) => notificationContent(t).title)).toEqual([
      'Iris needs you',
    ])
    expect(second.map((t) => notificationContent(t).body)).toEqual([
      'Approval needed: wire $40',
    ])
    feed.reset()
    expect(feed.update(done, false, 9000)).toEqual([])
  })
})

describe('the taskbar’s number (NotificationTests’ Dock)', () => {
  it('counts as the Electron app did (testTheDockNumber)', () => {
    const rows = cases('computeDockBadgeTotal')
    expect(rows.length).toBe(8)
    for (const row of rows)
      expect(DockBadge.total((row.input as Row[]).map(agent)), row.name).toBe(
        row.output,
      )
    expect(DockBadge.label(0)).toBeUndefined()
    expect(DockBadge.label(120)).toBe('120')
  })

  /** The manager's sequence, step for step (`notify-fixtures.mjs`'s `row` and its calls). */
  it('follows the newest rows (testTheDockFollowsTheNewestRows)', () => {
    const row = (
      id: string,
      unread: number | undefined,
      seq: number,
      epoch = 'E1',
    ): Agent =>
      agent({
        id,
        name: id,
        hasUnread: unread != null,
        unreadCount: unread ?? 0,
        isHiddenFromSidebar: false,
        snapshotEpoch: epoch,
        snapshotSeq: seq,
      })
    const badge = new DockBadge()
    const steps: [string, () => number | undefined][] = [
      ['seed', () => badge.roster([row('a', 2, 5), row('b', undefined, 5)])],
      [
        'same total',
        () => badge.roster([row('a', 2, 6), row('b', undefined, 6)]),
      ],
      ['b unread', () => badge.update(row('b', 1, 7))],
      ['stale b', () => badge.update(row('b', undefined, 6))],
      ['new c', () => badge.update(row('c', 4, 9))],
      [
        'roster at 8',
        () => badge.roster([row('a', 2, 8), row('b', undefined, 8)]),
      ],
      ['empty roster', () => badge.roster([])],
      ['new epoch', () => badge.roster([row('z', 1, 1, 'E2')])],
      ['reset', () => badge.reset()],
    ]
    const shipped = (
      (cases('SandDockBadgeManager')[0]?.output ?? []) as {
        setBadgeCountCalls: number[]
      }[]
    ).map((step) => step.setBadgeCountCalls)
    expect(shipped.length).toBe(steps.length)
    steps.forEach(([name, run], index) => {
      const set = run()
      expect(set == null ? [] : [set], name).toEqual(shipped[index])
    })
  })
})
