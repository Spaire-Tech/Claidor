// The org chart against the shipped chunk's own functions (SimeonCore's
// `NetworkTests`): fixtures/network.json, copied from the core's test, was
// made by running the window's `se`, `ne`, `os`/`ae`/`ke`, `Ce`, `pe`, the
// view's maths and the main bundle's `Uan` in Node, unchanged.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type NetworkView,
  cardWord,
  clampView,
  edgeActivity,
  edgeLabel,
  exchangeCaption,
  exchangeLines,
  isDrag,
  moreMembers,
  networkEdges,
  networkLayout,
  networkState,
  networkSubtitle,
  nodeCaption,
  nodeOrder,
  pairWords,
  panView,
  wheelFactor,
  zoomView,
} from './agentNetwork'
import { Entry } from './entry'
import { type Agent, agentFrom } from './models'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixture: any = JSON.parse(
  readFileSync(new URL('./fixtures/network.json', import.meta.url), 'utf8'),
)

const agents = (rows: unknown[] | undefined): Agent[] =>
  (rows ?? []).map(agentFrom).filter((agent): agent is Agent => agent != null)

describe('the org chart (`NetworkTests`)', () => {
  it('draws the links', () => {
    const roster = agents(fixture.edges.input)
    const found = networkEdges(roster)
    const shipped = fixture.edges.output as {
      key: string
      kind: string
      sourceId: string
    }[]
    expect(found.map((edge) => edge.key)).toEqual(shipped.map((e) => e.key))
    expect(found.map((edge) => edge.kind)).toEqual(shipped.map((e) => e.kind))
    expect(found.map((edge) => edge.sourceId)).toEqual(
      shipped.map((e) => e.sourceId),
    )
    expect(networkSubtitle(roster, found)).toBe(
      '4 agents · 1 group · 2 message links',
    )
    expect(networkSubtitle([], [])).toBe(
      '0 agents · 0 groups · 0 message links',
    )
  })

  it('orders the nodes and lights the links', () => {
    expect(nodeOrder(agents(fixture.nodeOrder.input))).toEqual(
      fixture.nodeOrder.output,
    )
    for (const row of fixture.activity) {
      const source = agentFrom(row.source)
      const target = agentFrom(row.target)
      if (!source || !target) {
        // An end that is gone: no light.
        const edge = { key: 'k', sourceId: 's', targetId: 't' } as const
        expect(
          edgeActivity({ ...edge, kind: 'message' }, new Map(), row.now ?? 0),
          row.name,
        ).toBe(row.activity)
        continue
      }
      const byId = new Map([
        [source.id, source],
        [target.id, target],
      ])
      const edge = {
        key: 'k',
        sourceId: source.id,
        targetId: target.id,
        kind: 'message' as const,
      }
      expect(edgeActivity(edge, byId, row.now), row.name).toBe(row.activity)
    }
  })

  it('says each agent’s state', () => {
    for (const row of fixture.states) {
      const agent = agentFrom(row.input)!
      expect(networkState(agent), row.name).toBe(row.state)
      expect(cardWord(agent).text, row.name).toBe(row.inspectorStatus.text)
      expect(cardWord(agent).live, row.name).toBe(
        row.inspectorStatus.color === 'green',
      )
      expect(nodeCaption(agent).text, row.name).toBe(row.nodeCaption.text)
      expect(nodeCaption(agent).live, row.name).toBe(row.nodeCaption.isLive)
    }
  })

  it('has the chart’s other words', () => {
    expect(edgeLabel('message', 'Scout', 'Simeon')).toBe(
      'Conversation between Scout and Simeon',
    )
    expect(edgeLabel('membership', 'Launch squad', 'Simeon')).toBe(
      'Simeon is a member of Launch squad',
    )
    expect(pairWords('Launch squad', 'Simeon')).toBe('Launch squad ⇄ Simeon')
    expect(exchangeCaption('talking')).toEqual({
      text: 'Talking now',
      live: true,
    })
    expect(exchangeCaption('recent').text).toBe('Active recently')
    expect(exchangeCaption('idle')).toEqual({
      text: 'Agent-to-agent conversation',
      live: false,
    })
    expect(moreMembers(12)).toBeUndefined()
    expect(moreMembers(15)).toBe('+3')
    // The iPhone's foot (`touchFooter`) is the iPhone's alone: the web says the Mac's.
  })

  /** The force layout, point for point, within a hundredth. */
  it('lays the nodes out as the window does', () => {
    const cases = fixture.layout as {
      name: string
      nodeIds: string[]
      edges: { sourceId: string; targetId: string }[]
      width: number
      height: number
      iterations?: number
      points: Record<string, { x: number; y: number }>
    }[]
    expect(cases).toHaveLength(11)
    for (const row of cases) {
      const points = networkLayout(
        row.nodeIds,
        row.edges,
        row.width,
        row.height,
        row.iterations ?? 300,
      )
      expect([...points.keys()].sort(), row.name).toEqual(
        Object.keys(row.points).sort(),
      )
      for (const [id, point] of Object.entries(row.points)) {
        expect(points.get(id)!.x, `${row.name} ${id}.x`).toBeCloseTo(point.x, 2)
        expect(points.get(id)!.y, `${row.name} ${id}.y`).toBeCloseTo(point.y, 2)
      }
    }
  })

  it('zooms and pans as the window does', () => {
    const view = (json: any): NetworkView => ({
      scale: json?.scale ?? 0,
      x: json?.x ?? 0,
      y: json?.y ?? 0,
    })
    for (const row of fixture.view.clamp) {
      expect(
        clampView(
          view(row.view),
          row.size.width,
          row.size.height,
          row.margin ?? 0,
        ),
      ).toEqual(view(row.out))
    }
    for (const row of fixture.view.pan) {
      expect(
        panView(
          view(row.view),
          row.delta.x,
          row.delta.y,
          row.size.width,
          row.size.height,
          row.margin ?? 0,
        ),
      ).toEqual(view(row.out))
    }
    for (const row of fixture.view.zoom) {
      const out = zoomView(
        view(row.view),
        row.factor ?? 1,
        row.point.x,
        row.point.y,
        row.size.width,
        row.size.height,
      )
      expect(out.scale).toBeCloseTo(row.out.scale, 9)
      expect(out.x).toBeCloseTo(row.out.x, 9)
      expect(out.y).toBeCloseTo(row.out.y, 9)
    }
    expect(wheelFactor(100, 0, false)).toBeCloseTo(0.81873, 5)
    expect(wheelFactor(10, 0, true)).toBeCloseTo(0.90484, 5)
    expect(wheelFactor(3, 1, false)).toBeCloseTo(Math.exp(-3 * 16 * 0.002), 9)
    expect(isDrag(3, 2)).toBe(false)
    expect(isDrag(4, 1)).toBe(true)
  })

  it('reads the conversation between two agents', () => {
    const entries = Entry.list(fixture.exchange.transcript)
    const rows = exchangeLines(
      entries,
      { id: 'a1', name: 'Ada' },
      fixture.exchange.targetId,
    )
    const shipped = fixture.exchange.rows as {
      id: string
      author?: { name?: string }
      timestampMs?: number
    }[]
    expect(rows.map((row) => row.id)).toEqual(shipped.map((row) => row.id))
    expect(rows.map((row) => row.authorName)).toEqual(
      shipped.map((row) => row.author?.name),
    )
    expect(rows.map((row) => row.timestampMs)).toEqual(
      shipped.map((row) => row.timestampMs),
    )
    // Only the last 30.
    const many = Entry.list(
      Array.from({ length: 35 }, (_, i) => ({
        id: `m${i}`,
        kind: 'message',
        content: 'x',
        toAgent: { id: 'b2' },
      })),
    )
    expect(
      exchangeLines(many, { id: 'a1', name: 'Ada' }, 'b2').map((row) => row.id),
    ).toEqual(fixture.exchangeLast30Ids)
  })
})
