// The org chart ("Agent network", `AgentNetwork` in
// ios/SimeonCore/Sources/SimeonCore/AgentNetwork.swift; the window's
// `org-chart/workspace/view.tsx`, gate `sand_agent_network`, on in Simeon):
// every agent, solid links between agents that have messaged each other,
// dashed links from a group to its members, a link lit while both ends are
// mid-turn, laid out by a fixed force simulation. Drawn by
// src/window/OrgChart.tsx.

import type { Entry } from './entry'
import { t } from './l10n'
import type { Agent } from './models'

export type EdgeKind = 'message' | 'membership'

export interface NetworkEdge {
  key: string
  sourceId: string
  targetId: string
  kind: EdgeKind
}

/** Group to member (not itself, in the list), then each agent's partners, the pair in string order, once each (`se`). */
export function networkEdges(agents: readonly Agent[]): NetworkEdge[] {
  const ids = new Set(agents.map((agent) => agent.id))
  const seen = new Set<string>()
  const out: NetworkEdge[] = []
  for (const agent of agents) {
    if (agent.isGroup) {
      for (const member of agent.memberIds) {
        if (member === agent.id || !ids.has(member)) continue
        const key = `member::${agent.id}::${member}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          key,
          sourceId: agent.id,
          targetId: member,
          kind: 'membership',
        })
      }
      continue
    }
    for (const partner of agent.conversationPartnerIds) {
      if (partner === agent.id || !ids.has(partner)) continue
      // JavaScript's `<` on strings: by UTF-16 units, as the core's `jsLess`.
      const [low, high] =
        agent.id < partner ? [agent.id, partner] : [partner, agent.id]
      const key = `msg::${low}::${high}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, sourceId: low, targetId: high, kind: 'message' })
    }
  }
  return out
}

export type Activity = 'talking' | 'recent' | 'idle'

/** A link's light (`ne`): both ends running (and not waiting) talk; either changed in the last two minutes is recent. */
export function edgeActivity(
  edge: NetworkEdge,
  byId: ReadonlyMap<string, Agent>,
  nowMs: number,
): Activity {
  const source = byId.get(edge.sourceId)
  const target = byId.get(edge.targetId)
  if (!source || !target) return 'idle'
  const busy = (agent: Agent) => !agent.awaitingUserResponse && agent.isRunning
  if (busy(source) && busy(target)) return 'talking'
  const oldest = Math.min(source.updatedAt ?? 0, target.updatedAt ?? 0)
  return nowMs - oldest <= 120_000 ? 'recent' : 'idle'
}

export type NetworkState = 'waiting' | 'typing' | 'working' | 'idle'

/** Waiting on the person, typing, working, or idle (`os`). */
export function networkState(agent: Agent): NetworkState {
  if (agent.awaitingUserResponse) return 'waiting'
  if (agent.isComposing) return 'typing'
  if (agent.isRunning) return 'working'
  return 'idle'
}

/** Words and whether they are green (the card's word, a node's line). */
export interface LiveWords {
  text: string
  live: boolean
}

/** The card's word and whether it is green (`ae`). */
export function cardWord(agent: Agent): LiveWords {
  switch (networkState(agent)) {
    case 'typing':
      return { text: t('Typing…'), live: true }
    case 'working':
      return { text: t('Working…'), live: true }
    case 'waiting':
      return { text: t('Waiting for you'), live: false }
    case 'idle':
      return { text: t('Idle'), live: false }
  }
}

/** The line under a node (`ke`): none for an idle agent; a group's member count. */
export function nodeCaption(agent: Agent): LiveWords {
  const state = networkState(agent)
  if (state !== 'idle') return cardWord(agent)
  if (!agent.isGroup) return { text: '', live: false }
  return { text: memberCount(agent.memberIds.length), live: false }
}

export function memberCount(count: number): string {
  return count === 1 ? t('1 member') : t`${count} members`
}

/** "4 agents · 1 group · 2 message links". */
export function networkSubtitle(
  agents: readonly Agent[],
  edges: readonly NetworkEdge[],
): string {
  const groups = agents.filter((agent) => agent.isGroup).length
  const solo = agents.length - groups
  const links = edges.filter((edge) => edge.kind === 'message').length
  const agentsPart = solo === 1 ? t('1 agent') : t`${solo} agents`
  const groupsPart = groups === 1 ? t('1 group') : t`${groups} groups`
  const linksPart =
    links === 1 ? t('1 message link') : t`${links} message links`
  return `${agentsPart} · ${groupsPart} · ${linksPart}`
}

/** US English's order of two strings, as the core's `compare(_:locale: en_US)`. */
const usOrder = new Intl.Collator('en-US')

/** The nodes' order for the layout: oldest first, then by id (`Ce`). */
export function nodeOrder(agents: readonly Agent[]): string[] {
  return agents
    .map((agent, offset) => ({ agent, offset }))
    .sort((a, b) => {
      const left = a.agent.createdAt ?? 0
      const right = b.agent.createdAt ?? 0
      if (left !== right) return left < right ? -1 : 1
      const compared = usOrder.compare(a.agent.id, b.agent.id)
      return compared !== 0 ? compared : a.offset - b.offset
    })
    .map(({ agent }) => agent.id)
}

export interface NetworkPoint {
  x: number
  y: number
}

function nudge(i: number, j: number): number {
  return ((i * 7919 + j * 104_729) % 628) / 100
}

/**
 * Where each node goes (`pe`): seeded on a golden-angle spiral, then 300
 * rounds of springs (160 apart), repulsion (within 480), a pull to the
 * middle shaped by the window, and two passes keeping nodes 112 apart,
 * cooling as it goes; then fitted, never enlarged, with 64 to spare.
 */
export function networkLayout(
  nodeIds: readonly string[],
  edges: readonly Pick<NetworkEdge, 'sourceId' | 'targetId'>[],
  width: number,
  height: number,
  iterations = 300,
): Map<string, NetworkPoint> {
  const count = nodeIds.length
  const cx = width / 2
  const cy = height / 2
  const out = new Map<string, NetworkPoint>()
  if (count === 0) return out
  if (count === 1) {
    out.set(nodeIds[0]!, { x: cx, y: cy })
    return out
  }
  const px = new Array<number>(count).fill(0)
  const py = new Array<number>(count).fill(0)
  const vx = new Array<number>(count).fill(0)
  const vy = new Array<number>(count).fill(0)
  const index = new Map<string, number>()
  const golden = Math.PI * (3 - Math.sqrt(5))
  nodeIds.forEach((id, i) => {
    index.set(id, i)
    const radius = 56 * Math.sqrt(0.5 + i)
    const angle = i * golden
    px[i] = radius * Math.cos(angle)
    py[i] = radius * Math.sin(angle)
  })
  const sources: number[] = []
  const targets: number[] = []
  const degree = new Array<number>(count).fill(0)
  for (const edge of edges) {
    const s = index.get(edge.sourceId)
    const tt = index.get(edge.targetId)
    if (s === undefined || tt === undefined || s === tt) continue
    sources.push(s)
    targets.push(tt)
    degree[s]! += 1
    degree[tt]! += 1
  }
  const springs = sources.length
  const strength = new Array<number>(springs).fill(0)
  const bias = new Array<number>(springs).fill(0)
  for (let k = 0; k < springs; k += 1) {
    const ds = degree[sources[k]!]!
    const dt = degree[targets[k]!]!
    strength[k] = 1 / Math.min(ds, dt)
    bias[k] = ds / (ds + dt)
  }
  const aspect = Math.min(2.5, Math.max(1 / 2.5, width / height))
  const gx = 0.06 / aspect
  const gy = 0.06 * aspect
  const cooling = 1 - Math.pow(0.001, 1 / iterations)
  let heat = 1
  for (let round = 0; round < iterations; round += 1) {
    heat += (0 - heat) * cooling
    for (let k = 0; k < springs; k += 1) {
      const s = sources[k]!
      const tt = targets[k]!
      let dx = px[tt]! + vx[tt]! - px[s]! - vx[s]!
      let dy = py[tt]! + vy[tt]! - py[s]! - vy[s]!
      if (dx === 0 && dy === 0) {
        const a = nudge(s, tt)
        dx = Math.cos(a) * 1e-6
        dy = Math.sin(a) * 1e-6
      }
      const distance = Math.hypot(dx, dy)
      const pull = ((distance - 160) / distance) * heat * strength[k]!
      const mx = dx * pull
      const my = dy * pull
      const b = bias[k]!
      vx[tt]! -= mx * b
      vy[tt]! -= my * b
      vx[s]! += mx * (1 - b)
      vy[s]! += my * (1 - b)
    }
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let dx = px[j]! - px[i]!
        let dy = py[j]! - py[i]!
        if (dx === 0 && dy === 0) {
          const a = nudge(i, j)
          dx = Math.cos(a) * 1e-6
          dy = Math.sin(a) * 1e-6
        }
        const d2 = Math.max(1, dx * dx + dy * dy)
        if (d2 >= 480 * 480) continue
        const push = (-900 * heat) / d2
        vx[i]! += dx * push
        vy[i]! += dy * push
        vx[j]! -= dx * push
        vy[j]! -= dy * push
      }
    }
    for (let i = 0; i < count; i += 1) {
      vx[i]! -= px[i]! * gx * heat
      vy[i]! -= py[i]! * gy * heat
    }
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < count; i += 1) {
        for (let j = i + 1; j < count; j += 1) {
          let dx = px[i]! + vx[i]! - px[j]! - vx[j]!
          let dy = py[i]! + vy[i]! - py[j]! - vy[j]!
          const gap = 56 * 2
          let d2 = dx * dx + dy * dy
          if (d2 >= gap * gap) continue
          if (d2 === 0) {
            const a = nudge(i, j)
            dx = Math.cos(a) * 1e-6
            dy = Math.sin(a) * 1e-6
            d2 = dx * dx + dy * dy
          }
          const d = Math.sqrt(d2)
          const spread = (gap - d) / d
          const ox = dx * spread * 0.5
          const oy = dy * spread * 0.5
          vx[i]! += ox
          vy[i]! += oy
          vx[j]! -= ox
          vy[j]! -= oy
        }
      }
    }
    for (let i = 0; i < count; i += 1) {
      vx[i]! *= 0.6
      vy[i]! *= 0.6
      px[i]! += vx[i]!
      py[i]! += vy[i]!
    }
  }
  const minX = Math.min(...px)
  const maxX = Math.max(...px)
  const minY = Math.min(...py)
  const maxY = Math.max(...py)
  const roomX = Math.max(1, width - 128)
  const roomY = Math.max(1, height - 128)
  const fit = Math.min(
    1,
    roomX / Math.max(1, maxX - minX),
    roomY / Math.max(1, maxY - minY),
  )
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  nodeIds.forEach((id, i) => {
    out.set(id, {
      x: cx + (px[i]! - midX) * fit,
      y: cy + (py[i]! - midY) * fit,
    })
  })
  return out
}

// MARK: Words (step 12's spec, §§2–3)

export const networkTitle = () => t('Org chart')
export const networkFooter = () =>
  t(
    'Solid links are real agent-to-agent message history; dashed links are group membership. A link lights up while both agents are mid-turn. Scroll to zoom, drag to pan, double-click to reset.',
  )
export const noAgentsLine = () =>
  t('No agents yet. Create a few teammates and the network draws itself.')
export const readOnlyLine = () =>
  t('Read-only — a conversation between two agents')
export const noMessagesLine = () => t('No messages between these two yet.')
export const loadingLine = () => t('Loading conversation…')
export const couldNotLoadLine = () => t("Couldn't load this conversation.")
/** A talking link's description for a screen reader. */
export const talkingNowLine = () => t('Agents are talking now')
/** A group's card shows this many members, then "+N". */
export const memberCap = 12

/** A link's tooltip and label: "Conversation between Scout and Simeon", "Simeon is a member of Launch squad". */
export function edgeLabel(
  kind: EdgeKind,
  source: string,
  target: string,
): string {
  return kind === 'message'
    ? t`Conversation between ${source} and ${target}`
    : t`${target} is a member of ${source}`
}

/** "Scout ⇄ Simeon" (`Rs`). */
export function pairWords(first: string, second: string): string {
  return `${first} ⇄ ${second}`
}

/** The line under a message link's pair: green while they talk. */
export function exchangeCaption(activity: Activity): LiveWords {
  switch (activity) {
    case 'talking':
      return { text: t('Talking now'), live: true }
    case 'recent':
      return { text: t('Active recently'), live: false }
    case 'idle':
      return { text: t('Agent-to-agent conversation'), live: false }
  }
}

/** "+3" past the twelve members a card shows; none up to twelve. */
export function moreMembers(count: number): string | undefined {
  return count > memberCap ? `+${count - memberCap}` : undefined
}

// MARK: Zoom and pan

export interface NetworkView {
  scale: number
  x: number
  y: number
}

export const identityView: NetworkView = { scale: 1, x: 0, y: 0 }

function clampValue(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** Scale 1 to 3; the picture may be dragged `margin` of the window past its edges (`is`). */
export function clampView(
  view: NetworkView,
  width: number,
  height: number,
  margin = 0,
): NetworkView {
  const scale = clampValue(view.scale, 1, 3)
  const mx = width * margin
  const my = height * margin
  return {
    scale,
    x: clampValue(view.x, width * (1 - scale) - mx, mx),
    y: clampValue(view.y, height * (1 - scale) - my, my),
  }
}

/** Dragged by `dx`, `dy` (`we`). */
export function panView(
  view: NetworkView,
  dx: number,
  dy: number,
  width: number,
  height: number,
  margin = 0,
): NetworkView {
  return clampView(
    { scale: view.scale, x: view.x + dx, y: view.y + dy },
    width,
    height,
    margin,
  )
}

/** Zoomed by `factor` about the pointer (`ve`). */
export function zoomView(
  view: NetworkView,
  factor: number,
  ax: number,
  ay: number,
  width: number,
  height: number,
): NetworkView {
  const scale = clampValue(view.scale * factor, 1, 3)
  const ratio = scale / view.scale
  return clampView(
    {
      scale,
      x: ax - (ax - view.x) * ratio,
      y: ay - (ay - view.y) * ratio,
    },
    width,
    height,
  )
}

/** A scroll's zoom (`Se`): lines are 16, pages 100; a pinch zooms five times as fast. */
export function wheelFactor(
  deltaY: number,
  deltaMode: number,
  isPinch: boolean,
): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1
  return Math.exp(-deltaY * unit * (isPinch ? 0.01 : 0.002))
}

/** A press becomes a drag past 4 points (`je`). */
export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > 4
}

// MARK: The conversation between two agents

export interface ExchangeLine {
  id: string
  text: string
  authorId?: string
  authorName?: string
  timestampMs?: number
}

/**
 * What two agents said to each other, from the first one's chat (`Uan`):
 * its messages to the other, and the other's to it; the last 30.
 */
export function exchangeLines(
  entries: readonly Entry[],
  source: { id: string; name: string },
  targetId: string,
): ExchangeLine[] {
  const out: ExchangeLine[] = []
  for (const entry of entries) {
    if (entry.kind !== 'message') continue
    const toTarget = entry.toAgent?.id === targetId
    const fromTarget = entry.fromAgent?.id === targetId
    if (!toTarget && !fromTarget) continue
    out.push({
      id: entry.id,
      text: entry.content ?? '',
      authorId: toTarget ? source.id : entry.fromAgent?.id,
      authorName: toTarget ? source.name : entry.fromAgent?.name,
      timestampMs: entry.timestampMs,
    })
  }
  return out.slice(-30)
}
