// The org chart in the chat's place (mac/Simeon/OrgChart.swift: step 12,
// the window's `view:org-chart`), from "/" and ⌘K while the agent network is
// on: every agent a node, a solid line between agents that have messaged
// each other, a dashed one from a group to its members, green with a
// moving spark while both ends work. Scroll to zoom (1 to 3 times), drag to
// pan, double-click to reset; a node or a line clicked shows its card on
// the right. × or any agent opened closes it; Escape closes the card, then
// the chart. Drawn by App.tsx while `WindowModel.orgChart`.

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type Activity,
  type ExchangeLine,
  type NetworkEdge,
  type NetworkPoint,
  type NetworkView,
  cardWord,
  clampView,
  couldNotLoadLine,
  edgeActivity,
  edgeLabel,
  exchangeCaption,
  identityView,
  isDrag,
  loadingLine,
  memberCap,
  memberCount,
  moreMembers,
  networkEdges,
  networkFooter,
  networkLayout,
  networkState,
  networkSubtitle,
  networkTitle,
  noAgentsLine,
  noMessagesLine,
  nodeCaption,
  nodeOrder,
  pairWords,
  panView,
  readOnlyLine,
  talkingNowLine,
  wheelFactor,
  zoomView,
} from '../core/agentNetwork'
import { listTime } from '../core/listTime'
import { type Agent, previewOfEntry, shownDescription } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import { somethingOver } from './Dialogs'
import './OrgChart.css'
import { classes } from './classes'
import { useWindowModel } from './windowModel'

/** What a card shows: an agent or a line; the same again closes it (`NetworkPick`). */
type NetworkPick =
  | { kind: 'agent'; id: string }
  | { kind: 'edge'; edge: NetworkEdge }

function pickKey(pick: NetworkPick | undefined): string | undefined {
  if (!pick) return undefined
  return pick.kind === 'agent' ? `agent:${pick.id}` : `edge:${pick.edge.key}`
}

/** The card shown, and whether it came in from the right (none showed before it). */
interface Shown {
  pick: NetworkPick
  enters: boolean
}

/** The window's curve (0.22, 1, 0.36, 1), as CSS's `cubic-bezier` reads it. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const x = (s: number) => ((ax * s + bx) * s + cx) * s
  const y = (s: number) => ((ay * s + by) * s + cy) * s
  const slope = (s: number) => (3 * ax * s + 2 * bx) * s + cx
  return (time: number): number => {
    if (time <= 0) return 0
    if (time >= 1) return 1
    let s = time
    for (let i = 0; i < 8; i += 1) {
      const error = x(s) - time
      if (Math.abs(error) < 1e-6) return y(s)
      const d = slope(s)
      if (Math.abs(d) < 1e-6) break
      s -= error / d
    }
    let low = 0
    let high = 1
    s = time
    while (high - low > 1e-6) {
      if (x(s) < time) low = s
      else high = s
      s = (low + high) / 2
    }
    return y(s)
  }
}

const windowCurve = bezier(0.22, 1, 0.36, 1)

/** Whether the person asked for less motion (`accessibilityReduceMotion`). */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const changed = () => setReduce(query.matches)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  return reduce
}

/** The time, read again every 15 s for the lines' light (`Ee`). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(every)
  }, [])
  return now
}

/** A group's members, in its order, those still listed (`AppStore.members(of:)`). */
function membersOf(group: Agent, agents: readonly Agent[]): Agent[] {
  return group.memberIds
    .map((id) => agents.find((agent) => agent.id === id))
    .filter((agent): agent is Agent => agent != null)
}

/** A field holds the keys: Escape is its own. */
function fieldHasKeys(): boolean {
  const element = document.activeElement
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

/** The close mark (`xmark`, 10, medium). */
function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 3.5l9 9M12.5 3.5l-9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The org chart (`OrgChartView`): the head, the canvas and its card, the foot. */
export function OrgChartView({ store }: { store: AppStore }) {
  const model = useWindowModel()
  const [shown, setShown] = useState<Shown>()
  const agents = store.agents
  const edges = useMemo(() => networkEdges(agents), [agents])
  // Escape: the card first, then the chart (the window does nothing else with it; before the sidebar's picked rows).
  const picked = shown != null
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.isComposing || event.metaKey || event.ctrlKey) return
      if (event.altKey || event.shiftKey) return
      if (somethingOver() || fieldHasKeys()) return
      event.preventDefault()
      if (picked) setShown(undefined)
      else model.closeOrgChart()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [model, picked])
  return (
    <section className="org-chart" aria-label={networkTitle()}>
      <div className="org-chart-head">
        <div className="org-chart-titles">
          <div className="org-chart-title" role="heading" aria-level={2}>
            {networkTitle()}
          </div>
          <div className="org-chart-subtitle">
            {networkSubtitle(agents, edges)}
          </div>
        </div>
        <button
          type="button"
          className="chart-close"
          title={t('Close org chart')}
          aria-label={t('Close org chart')}
          onClick={() => model.closeOrgChart()}
        >
          <CloseGlyph />
        </button>
      </div>
      <NetworkStage
        store={store}
        agents={agents}
        edges={edges}
        shown={shown}
        setShown={setShown}
      />
      <p className="org-chart-foot">{networkFooter()}</p>
    </section>
  )
}

interface Layout {
  key: string
  points: Map<string, NetworkPoint>
}

const noPoints = new Map<string, NetworkPoint>()

/** The points worked out again only when the agents, the lines or the canvas's size change (`LayoutMemo`); none before the canvas has a size. */
function useLayout(
  agents: readonly Agent[],
  edges: readonly NetworkEdge[],
  width: number,
  height: number,
): Layout {
  const ids = nodeOrder(agents)
  const w = Math.round(width)
  const h = Math.round(height)
  const key = `${ids.join(',')}|${edges.map((edge) => edge.key).join(',')}|${w}x${h}`
  const [memo, setMemo] = useState<Layout>({ key: '', points: noPoints })
  if (memo.key === key) return memo
  const next = {
    key,
    points: w > 0 && h > 0 ? networkLayout(ids, edges, w, h) : noPoints,
  }
  setMemo(next)
  return next
}

/** Where the nodes are while they glide: from where they were towards their places, `progress` of the way. */
interface Glide {
  from: Map<string, NetworkPoint>
  to: Map<string, NetworkPoint>
  progress: number
}

function glidePoints(glide: Glide): Map<string, NetworkPoint> {
  if (glide.progress >= 1 || glide.from === glide.to) return glide.to
  const eased = windowCurve(glide.progress)
  const out = new Map<string, NetworkPoint>()
  for (const [id, to] of glide.to) {
    const was = glide.from.get(id)
    out.set(
      id,
      was
        ? {
            x: was.x + (to.x - was.x) * eased,
            y: was.y + (to.y - was.y) * eased,
          }
        : to,
    )
  }
  return out
}

/** A new agent or another size: the nodes glide to their places (0.48 s, the window's curve); a new one is where it goes; the first drawing is where it is. */
function useGlide(
  target: Map<string, NetworkPoint>,
  reduce: boolean,
): Map<string, NetworkPoint> {
  const [glide, setGlide] = useState<Glide>({
    from: target,
    to: target,
    progress: 1,
  })
  let shown = glide
  if (glide.to !== target) {
    const now = glidePoints(glide)
    const still = reduce || now.size === 0
    shown = { from: still ? target : now, to: target, progress: still ? 1 : 0 }
    setGlide(shown)
  }
  const { from, to } = glide
  useEffect(() => {
    if (from === to) return
    const start = performance.now()
    let frame = 0
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / 480)
      setGlide((was) => (was.to === to ? { ...was, progress } : was))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [from, to])
  return glidePoints(shown)
}

/** The canvas (`sand-org-chart-network`, "Agent network") and the card over its right (`NetworkStage`). */
function NetworkStage({
  store,
  agents,
  edges,
  shown,
  setShown,
}: {
  store: AppStore
  agents: readonly Agent[]
  edges: readonly NetworkEdge[]
  shown: Shown | undefined
  setShown: (shown: Shown | undefined) => void
}) {
  const reduce = useReducedMotion()
  const nowMs = useNow()
  const canvas = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    const measure = () =>
      setSize((was) => {
        const width = element.clientWidth
        const height = element.clientHeight
        return was.width === width && was.height === height
          ? was
          : { width, height }
      })
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [])
  const [view, setView] = useState<NetworkView>(identityView)
  const [resetting, setResetting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hoveredLine, setHoveredLine] = useState<string>()
  const layout = useLayout(agents, edges, size.width, size.height)
  const points = useGlide(layout.points, reduce)
  const byId = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  )
  // What the wheel and the pointer's line read as they come: kept out of the drawing.
  const live = useRef({ view, size, layout, edges, shown, agents })
  useLayoutEffect(() => {
    live.current = { view, size, layout, edges, shown, agents }
  })
  const pointer = useRef<{ x: number; y: number }>(undefined)
  const press = useRef<{
    id: number
    x: number
    y: number
    view: NetworkView
    moved: boolean
  }>(undefined)
  const swallowClick = useRef(false)

  /** The same node or line again closes its card; a second click of a double click changes nothing. */
  const toggle = (next: NetworkPick, clicks: number) => {
    if (clicks >= 2) return
    const same = pickKey(shown?.pick) === pickKey(next)
    setShown(
      same ? undefined : { pick: next, enters: shown == null && !reduce },
    )
  }

  /** The line within 8 points of the pointer (the drawing's points, the zoom and pan undone), as the window's 16-point band. */
  const lineUnder = (at: { x: number; y: number } | undefined) => {
    const { view: now, layout: drawn, edges: lines } = live.current
    if (!at || now.scale <= 0) return undefined
    const x = (at.x - now.x) / now.scale
    const y = (at.y - now.y) / now.scale
    let best: { key: string; distance: number } | undefined
    for (const edge of lines) {
      const a = drawn.points.get(edge.sourceId)
      const b = drawn.points.get(edge.targetId)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = dx * dx + dy * dy
      const along =
        length === 0
          ? 0
          : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length))
      const distance = Math.hypot(
        x - (a.x + along * dx),
        y - (a.y + along * dy),
      )
      if (distance <= 8 && distance < (best?.distance ?? Infinity))
        best = { key: edge.key, distance }
    }
    return best?.key
  }

  const local = (event: { clientX: number; clientY: number }) => {
    const box = canvas.current!.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  // The wheel over the canvas zooms about the pointer (`Se`, `ve`; a pinch, which the browser sends with Control, five times as fast); over the card it scrolls the card.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      const {
        view: now,
        size: room,
        shown: card,
        agents: listed,
      } = live.current
      if (room.width <= 0 || listed.length === 0 || somethingOver()) return
      const at = local(event)
      if (card && at.x > room.width - 324) return
      const factor = wheelFactor(event.deltaY, event.deltaMode, event.ctrlKey)
      if (factor === 1) return
      event.preventDefault()
      setResetting(false)
      setView(
        zoomView(
          clampView(now, room.width, room.height),
          factor,
          at.x,
          at.y,
          room.width,
          room.height,
        ),
      )
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || agents.length === 0) return
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      view,
      moved: false,
    }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    // A press let go outside the canvas, before it became a drag, is over.
    if (press.current && (event.buttons & 1) === 0 && !press.current.moved)
      press.current = undefined
    const held = press.current
    if (held && held.id === event.pointerId) {
      const dx = event.clientX - held.x
      const dy = event.clientY - held.y
      // A drag past 4 points pans, half the canvas past its edges at most (`we`, margin 0.5); one that starts on a node too.
      if (!held.moved && !isDrag(dx, dy)) return
      if (!held.moved) {
        held.moved = true
        canvas.current?.setPointerCapture(event.pointerId)
        setDragging(true)
        setResetting(false)
      }
      setView(panView(held.view, dx, dy, size.width, size.height, 0.5))
      return
    }
    pointer.current = local(event)
    const next = lineUnder(pointer.current)
    if (next !== hoveredLine) setHoveredLine(next)
  }
  const endPress = (event: React.PointerEvent) => {
    const held = press.current
    if (!held || held.id !== event.pointerId) return
    press.current = undefined
    if (held.moved) {
      // The click that ends a drag opens nothing (`je`).
      swallowClick.current = true
      setDragging(false)
      setTimeout(() => {
        swallowClick.current = false
      }, 0)
    }
  }

  /** Double-click on the ground: the zoom put back (0.24 s). */
  const reset = () => {
    if (view.scale === 1 && view.x === 0 && view.y === 0) return
    setResetting(!reduce)
    setView(identityView)
  }

  const card = shown ? cardFor(shown.pick, store, nowMs) : null
  return (
    <div className="network-stage">
      <div
        ref={canvas}
        className={classes(
          'network-canvas',
          view.scale > 1 && 'zoomed',
          dragging && 'dragging',
        )}
        role="group"
        aria-label={t('Agent network')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={() => {
          pointer.current = undefined
          if (hoveredLine !== undefined) setHoveredLine(undefined)
        }}
        onClickCapture={(event) => {
          if (!swallowClick.current) return
          event.stopPropagation()
          event.preventDefault()
        }}
      >
        {agents.length === 0 ? (
          <div className="network-empty">{noAgentsLine()}</div>
        ) : (
          size.width > 0 &&
          size.height > 0 && (
            <div
              className={classes('network-layer', resetting && 'resetting')}
              style={{
                width: size.width,
                height: size.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
              onTransitionEnd={() => setResetting(false)}
            >
              {/* The ground: a click closes the card, a double-click puts the zoom back. */}
              <div
                className="network-ground"
                onClick={() => setShown(undefined)}
                onDoubleClick={reset}
              />
              <svg
                className="network-lines"
                width={size.width}
                height={size.height}
              >
                {edges.map((edge) => {
                  const a = points.get(edge.sourceId)
                  const b = points.get(edge.targetId)
                  if (!a || !b) return null
                  return (
                    <NetworkLine
                      key={edge.key}
                      edge={edge}
                      from={a}
                      to={b}
                      activity={edgeActivity(edge, byId, nowMs)}
                      selected={pickKey(shown?.pick) === `edge:${edge.key}`}
                      hovering={hoveredLine === edge.key}
                      label={edgeLabel(
                        edge.kind,
                        byId.get(edge.sourceId)?.name ?? '',
                        byId.get(edge.targetId)?.name ?? '',
                      )}
                      reduce={reduce}
                      tap={(clicks) => toggle({ kind: 'edge', edge }, clicks)}
                    />
                  )
                })}
              </svg>
              {agents.map((agent) => {
                const point = points.get(agent.id)
                if (!point) return null
                return (
                  <NetworkNode
                    key={agent.id}
                    agent={agent}
                    agents={agents}
                    at={point}
                    selected={pickKey(shown?.pick) === `agent:${agent.id}`}
                    tap={(clicks) =>
                      toggle({ kind: 'agent', id: agent.id }, clicks)
                    }
                  />
                )
              })}
            </div>
          )
        )}
      </div>
      {card && shown && (
        <NetworkCard
          key={pickKey(shown.pick)}
          enters={shown.enters}
          scrolls={
            !(shown.pick.kind === 'edge' && shown.pick.edge.kind === 'message')
          }
          close={() => setShown(undefined)}
        >
          {card}
        </NetworkCard>
      )}
    </div>
  )
}

/** What the card holds for a pick, or nothing when its agents are gone. */
function cardFor(pick: NetworkPick, store: AppStore, nowMs: number): ReactNode {
  if (pick.kind === 'agent') {
    const agent = store.agent(pick.id)
    return agent ? <AgentCard agent={agent} store={store} /> : null
  }
  const source = store.agent(pick.edge.sourceId)
  const target = store.agent(pick.edge.targetId)
  if (!source || !target) return null
  if (pick.edge.kind === 'membership')
    return <MembershipCard group={source} member={target} store={store} />
  const activity = edgeActivity(
    pick.edge,
    new Map([
      [source.id, source],
      [target.id, target],
    ]),
    nowMs,
  )
  return (
    <ExchangeCard
      source={source}
      target={target}
      activity={activity}
      store={store}
    />
  )
}

/**
 * A node (`be`): 120 wide, its point at the middle of the whole node; the
 * picture (36) with its dot, the name (11, the second ink, 104 at most)
 * and the line under it (green while it works); a ring round the picture
 * and the name in the full ink while its card shows. A touch larger on a
 * faint wash under the pointer.
 */
function NetworkNode({
  agent,
  agents,
  at,
  selected,
  tap,
}: {
  agent: Agent
  agents: readonly Agent[]
  at: NetworkPoint
  selected: boolean
  tap: (clicks: number) => void
}) {
  const caption = nodeCaption(agent)
  return (
    <button
      type="button"
      className={classes('network-node', selected && 'selected')}
      style={{ left: at.x, top: at.y }}
      aria-label={t`${agent.name} details`}
      aria-description={caption.text || undefined}
      aria-pressed={selected}
      onClick={(event) => tap(event.detail)}
    >
      <span className="node-body">
        <NodeMark agent={agent} agents={agents} size={36}>
          <span className="node-ring" />
        </NodeMark>
        <span className="node-name">{agent.name}</span>
        {caption.text !== '' && (
          <span className={classes('node-caption', caption.live && 'live')}>
            {caption.text}
          </span>
        )}
      </span>
    </button>
  )
}

/** An agent's picture (or a group's) with the sidebar's dot at its lower right: unread blue, working green, both as blue round green. */
function NodeMark({
  agent,
  agents,
  size,
  ring,
  children,
}: {
  agent: Agent
  agents: readonly Agent[]
  size: number
  /** The ground the dot is ringed in: the canvas's, or the card's. */
  ring?: string
  /** What is drawn over the picture (a node's ring). */
  children?: ReactNode
}) {
  const state = networkState(agent)
  const busy = state === 'working' || state === 'typing'
  const dot = size >= 72 ? 13 : 8
  const shows = agent.hasUnread || busy
  const style: CSSProperties & { '--node-ring'?: string } = {
    width: size,
    height: size,
  }
  if (ring) style['--node-ring'] = ring
  return (
    <span className="node-mark" style={style}>
      <AgentMark agent={agent} agents={agents} size={size} />
      {children}
      {shows && (
        <span
          className={classes(
            'node-dot',
            !agent.hasUnread && 'working',
            agent.hasUnread && busy && 'both',
          )}
          style={{
            left: size * 0.75 - 2.5,
            top: size * 0.75 - 2.5,
            width: dot,
            height: dot,
          }}
        />
      )}
    </span>
  )
}

/** The moving light on a talking line: 6 across, eased along it every 1.5 s, fading at both ends; drawn each frame without redrawing the chart. */
function Spark({
  from,
  to,
  colour,
}: {
  from: NetworkPoint
  to: NetworkPoint
  /** The line's own colour: green, or the blue while its card shows. */
  colour: string
}) {
  const dot = useRef<SVGCircleElement>(null)
  const ends = useRef({ from, to })
  useLayoutEffect(() => {
    ends.current = { from, to }
  })
  useEffect(() => {
    let frame = 0
    const step = () => {
      const circle = dot.current
      if (circle) {
        const time = ((Date.now() / 1000) % 1.5) / 1.5
        const eased =
          time < 0.5 ? 2 * time * time : 1 - Math.pow(-2 * time + 2, 2) / 2
        const along = 0.04 + 0.92 * eased
        const fade =
          time < 0.12 ? time / 0.12 : time > 0.88 ? (1 - time) / 0.12 : 1
        const { from: a, to: b } = ends.current
        circle.setAttribute('cx', String(a.x + (b.x - a.x) * along))
        circle.setAttribute('cy', String(a.y + (b.y - a.y) * along))
        circle.setAttribute('opacity', String(fade))
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <circle
      ref={dot}
      r={3}
      cx={from.x}
      cy={from.y}
      opacity={0}
      fill={colour}
      style={{ filter: `drop-shadow(0 0 4px ${colour})` }}
    />
  )
}

/**
 * A line (`xe`): 1 point, solid for messages and dashed for membership, in
 * the faint ink, darker for a pair active in the last two minutes and under
 * the pointer; green with a spark running along it while both ends work;
 * the blue while its card shows. A 16-point band takes the click.
 */
function NetworkLine({
  edge,
  from,
  to,
  activity,
  selected,
  hovering,
  label,
  reduce,
  tap,
}: {
  edge: NetworkEdge
  from: NetworkPoint
  to: NetworkPoint
  activity: Activity
  selected: boolean
  hovering: boolean
  label: string
  reduce: boolean
  tap: (clicks: number) => void
}) {
  const message = edge.kind === 'message'
  const ink = (share: number) =>
    `color-mix(in srgb, var(--ink) ${share}%, transparent)`
  const colour = selected
    ? 'var(--link)'
    : activity === 'talking'
      ? 'var(--chart-added)'
      : hovering
        ? message || activity === 'recent'
          ? 'var(--ink-secondary)'
          : 'var(--ink-tertiary)'
        : activity === 'recent'
          ? 'var(--ink-tertiary)'
          : ink(message ? 30 : 20)
  const opacity = selected
    ? 0.9
    : activity === 'talking'
      ? 0.95
      : message
        ? 0.8
        : 0.6
  // Only the pointer's coming and going is eased (0.48 s); the rest changes at once.
  const [hoverSeen, setHoverSeen] = useState(hovering)
  const [easing, setEasing] = useState(false)
  if (hoverSeen !== hovering) {
    setHoverSeen(hovering)
    setEasing(true)
  }
  useEffect(() => {
    if (!easing) return
    const done = setTimeout(() => setEasing(false), 480)
    return () => clearTimeout(done)
  }, [easing, hovering])
  const transition = easing
    ? 'stroke 0.48s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.48s cubic-bezier(0.22, 1, 0.36, 1)'
    : 'none'
  return (
    <g>
      <line
        className="network-line"
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={colour}
        strokeDasharray={message ? undefined : '3.5 1.5'}
        style={{ opacity, transition }}
      />
      {activity === 'talking' && !reduce && (
        <Spark from={from} to={to} colour={colour} />
      )}
      <line
        className="network-hit"
        data-key={edge.key}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        role="button"
        aria-label={label}
        aria-description={activity === 'talking' ? talkingNowLine() : undefined}
        aria-pressed={selected}
        onClick={(event) => tap(event.detail)}
      />
    </g>
  )
}

/** The card (`me`, "Org chart details"): 312 wide, 8 from the top and bottom and 12 from the right, round 14, the raised ground with a hairline and a soft shadow; × at its corner. */
function NetworkCard({
  enters,
  scrolls,
  close,
  children,
}: {
  enters: boolean
  scrolls: boolean
  close: () => void
  children: ReactNode
}) {
  return (
    <div
      className={classes('network-card', enters && 'entering')}
      role="group"
      aria-label={t('Org chart details')}
    >
      <div className={classes('network-card-body', !scrolls && 'fixed')}>
        {children}
      </div>
      <button
        type="button"
        className="network-card-close"
        aria-label={t('Close details')}
        onClick={close}
      >
        <CloseGlyph />
      </button>
    </div>
  )
}

/** A section's heading (`ys`): 11, 500, upper case, spaced, the faintest ink. */
function SectionHeading({ children }: { children: string }) {
  return <div className="card-heading">{children.toUpperCase()}</div>
}

/** Open chat / Open room (secondary, small): 20 high, round 4, the grey. */
function ChartButton({ title, action }: { title: string; action: () => void }) {
  return (
    <button type="button" className="chart-button" onClick={action}>
      {title}
    </button>
  )
}

/** An agent or a group (`te`): its picture (72) and state, About, its members, its last activity, Open chat or Open room. */
function AgentCard({ agent, store }: { agent: Agent; store: AppStore }) {
  const model = useWindowModel()
  const word = cardWord(agent)
  const about = shownDescription(agent).trim()
  const line =
    agent.lastEntry != null ? previewOfEntry(agent.lastEntry) : undefined
  const at = agent.lastActivityAt ?? agent.updatedAt
  const time = at != null && at > 0 ? listTime(at) : undefined
  return (
    <>
      <div className="card-identity">
        <NodeMark
          agent={agent}
          agents={store.agents}
          size={72}
          ring="var(--elevated)"
        />
        <div className="card-name" role="heading" aria-level={3}>
          {agent.name}
        </div>
        <div className={classes('card-word', word.live && 'live')}>
          {word.text}
        </div>
      </div>
      {about !== '' && (
        <div className="card-section">
          <SectionHeading>{t('About')}</SectionHeading>
          <div className="card-text clamped">{about}</div>
        </div>
      )}
      {agent.isGroup && (
        <div className="card-section">
          <SectionHeading>{memberCount(agent.memberIds.length)}</SectionHeading>
          <MemberMarks members={membersOf(agent, store.agents)} store={store} />
        </div>
      )}
      {line != null && line !== '' && (
        <div className="card-section">
          <SectionHeading>{t('Last activity')}</SectionHeading>
          <div className="card-text">{line}</div>
          {time && <div className="card-time">{time}</div>}
        </div>
      )}
      <ChartButton
        title={agent.isGroup ? t('Open room') : t('Open chat')}
        action={() => model.openChat(agent.id)}
      />
    </>
  )
}

/** A group's members at 28, 6 apart, wrapping: the first twelve, then "+N" (12, the third ink). */
function MemberMarks({
  members,
  store,
}: {
  members: readonly Agent[]
  store: AppStore
}) {
  const more = moreMembers(members.length)
  return (
    <div className="member-marks">
      {members.slice(0, memberCap).map((member) => (
        <span key={member.id} className="member-mark" title={member.name}>
          <AgentMark agent={member} agents={store.agents} size={28} />
        </span>
      ))}
      {more && <span className="member-more">{more}</span>}
    </div>
  )
}

/** Two pictures overlapping (36, the second 10 over the first), "A ⇄ B" and a line under it (`Rs`). */
function PairHead({
  first,
  second,
  caption,
  live,
  store,
}: {
  first: Agent
  second: Agent
  caption: string
  live: boolean
  store: AppStore
}) {
  return (
    <div className="pair-head">
      <div className="pair-marks">
        {[first, second].map((agent) => (
          <span key={agent.id} className="pair-mark">
            <AgentMark agent={agent} agents={store.agents} size={36} />
          </span>
        ))}
      </div>
      <div className="card-name" role="heading" aria-level={3}>
        {pairWords(first.name, second.name)}
      </div>
      <div className={classes('pair-caption', live && 'live')}>{caption}</div>
    </div>
  )
}

/** A group and one of its members (`re`): the group's members, and Open room (the group's). */
function MembershipCard({
  group,
  member,
  store,
}: {
  group: Agent
  member: Agent
  store: AppStore
}) {
  const model = useWindowModel()
  return (
    <>
      <PairHead
        first={group}
        second={member}
        caption={edgeLabel('membership', group.name, member.name)}
        live={false}
        store={store}
      />
      <div className="card-section">
        <SectionHeading>{memberCount(group.memberIds.length)}</SectionHeading>
        <MemberMarks members={membersOf(group, store.agents)} store={store} />
      </div>
      <ChartButton
        title={t('Open room')}
        action={() => model.openChat(group.id)}
      />
    </>
  )
}

/** The person's mark for a line whose author isn't listed (`person.crop.circle.fill`). */
function PersonMark() {
  return (
    <svg className="exchange-mark" viewBox="0 0 22 22" aria-hidden="true">
      <mask id="org-chart-person">
        <rect width="22" height="22" fill="white" />
        <circle cx="11" cy="8.6" r="3.9" fill="black" />
        <path
          d="M4.6 18.2c1.3-2.8 3.8-4.3 6.4-4.3s5.1 1.5 6.4 4.3"
          fill="black"
        />
      </mask>
      <circle
        cx="11"
        cy="11"
        r="11"
        fill="currentColor"
        mask="url(#org-chart-person)"
      />
    </svg>
  )
}

/**
 * Two agents' conversation (`ce`), read from the first one's chat (its last
 * 200 lines), again when it changes: their last 30 messages to each other,
 * kept at the newest; loading, failed with Retry, or none yet. Read only.
 */
function ExchangeCard({
  source,
  target,
  activity,
  store,
}: {
  source: Agent
  target: Agent
  activity: Activity
  store: AppStore
}) {
  const caption = exchangeCaption(activity)
  const [lines, setLines] = useState<ExchangeLine[]>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const kept = useRef<ExchangeLine[]>(undefined)
  useEffect(() => {
    kept.current = lines
  })
  // Read again when the first one's chat changes (`task(id:)`: its last change), or on Retry.
  const changedAt = source.updatedAt ?? 0
  useEffect(() => {
    let live = true
    store.networkExchange({ id: source.id, name: source.name }, target.id).then(
      (read) => {
        if (!live) return
        setLines(read)
        setFailed(false)
      },
      () => {
        // A failure keeps what was read; with nothing read, it says so with Retry.
        if (live && (kept.current?.length ?? 0) === 0) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [store, source.id, source.name, target.id, changedAt, attempt])
  // Kept at the newest.
  const scroller = useRef<HTMLDivElement>(null)
  const count = lines?.length ?? 0
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && count > 0) element.scrollTop = element.scrollHeight
  }, [count])
  let body: ReactNode
  if (lines && lines.length > 0) {
    body = lines.map((line) => (
      <ExchangeRow key={line.id} line={line} store={store} />
    ))
  } else if (lines == null && !failed) {
    body = <div className="exchange-note">{loadingLine()}</div>
  } else if (failed) {
    body = (
      <>
        <div className="exchange-note">{couldNotLoadLine()}</div>
        <ChartButton
          title={t('Retry')}
          action={() => setAttempt((n) => n + 1)}
        />
      </>
    )
  } else {
    body = <div className="exchange-note">{noMessagesLine()}</div>
  }
  return (
    <>
      <PairHead
        first={source}
        second={target}
        caption={caption.text}
        live={caption.live}
        store={store}
      />
      <div ref={scroller} className="exchange-scroll">
        <div className="exchange-lines">{body}</div>
      </div>
      <div className="exchange-foot">{readOnlyLine()}</div>
    </>
  )
}

function ExchangeRow({ line, store }: { line: ExchangeLine; store: AppStore }) {
  const author = line.authorId != null ? store.agent(line.authorId) : undefined
  const time = listTime(line.timestampMs)
  return (
    <div className="exchange-row">
      {author ? (
        <span className="exchange-mark">
          <AgentMark agent={author} agents={store.agents} size={22} />
        </span>
      ) : (
        <PersonMark />
      )}
      <div className="exchange-words">
        <div className="exchange-who">
          <span className="exchange-author">
            {author?.name ?? line.authorName ?? t('Unknown')}
          </span>
          {time && <span className="exchange-time">{time}</span>}
        </div>
        <div className="exchange-text">{line.text}</div>
      </div>
    </div>
  )
}
