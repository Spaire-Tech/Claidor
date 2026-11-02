// Search (⌘K) over the window (mac/Simeon/SearchPanel.swift, the window's
// `sand-command-palette`, D01–D07), drawn as a Mac panel of this year (the
// founder, 22 October 2026: "too tight, not really using apple style"): the
// window dimmed, and in its middle the panel: the field, the tabs, the
// results. Its state is searchState.ts; what each tab lists is jump.ts.
// Drawn by App.tsx while the window's model has search open.
//
// Rows that lead to screens not built yet are left out until their step,
// in one place (`offeredActions`, the window's `windowActionIds`):
// Settings: General and Usage & Billing, Connectors and the themes (step
// 6). Update Simeon's Computer opens its question (step 5c).

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  type Row,
  empty,
  matchRuns,
  rowDate,
  rowId,
  rowKind,
  rowTitle,
  shortcut,
  subtitle,
} from '../core/jump'
import { siteOf } from '../core/linkIcons'
import { listTime } from '../core/listTime'
import { type Agent, shownTitle } from '../core/models'
import { type SearchTab, rowIdFor, tabTitle } from '../core/search'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import { classes } from './classes'
import { somethingOver } from './Dialogs'
import { apple } from './keys'
import { useSiteIcon } from './MessageText'
import './SearchPanel.css'
import { type Listing, SearchState } from './searchState'
import { listOrder } from './Sidebar'
import { useWatched } from './useStore'
import { type Reveal, type WindowModel, useWindowModel } from './windowModel'

/** The agent whose chat the window shows (App.tsx's `shown`): the one asked for while the roster has it, else the first in the sidebar's order. */
function shownAgentId(store: AppStore, model: WindowModel): string | undefined {
  const asked = model.selected
  if (asked != null && store.agents.some((agent) => agent.id === asked))
    return asked
  return listOrder(store)[0]
}

/** The window's size, as it is resized. */
function useWindowSize(): { width: number; height: number } {
  const width = useSyncExternalStore(
    (changed) => {
      window.addEventListener('resize', changed)
      return () => window.removeEventListener('resize', changed)
    },
    () => window.innerWidth,
  )
  const height = useSyncExternalStore(
    (changed) => {
      window.addEventListener('resize', changed)
      return () => window.removeEventListener('resize', changed)
    },
    () => window.innerHeight,
  )
  return { width, height }
}

/** The message field of the chat on screen, which takes the keys back when search closes (`WindowState.composerFocus`). */
function messageField(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    '.chat-area .composer textarea.field',
  )
}

/** How long search fades in and out (`.easeOut(duration: 0.12)`). */
const fade = 120

/**
 * Search's layer over the window (`SearchLayer`): the window dimmed (the
 * text colour at 50%, 70% on dark), and in its middle the panel, 640 wide
 * (32 less than a narrower window), its list 420 high (less in a short
 * window, 240 at least). A click outside closes it. It fades in and out
 * over 0.12 s, the panel growing from 98%. Closed, the message field takes
 * the keys back, unless a sheet or an alert is over the window.
 */
export function SearchLayer({ store }: { store: AppStore }) {
  const model = useWindowModel()
  const [state] = useState(
    () => new SearchState(store, model, () => shownAgentId(store, model)),
  )
  useEffect(() => state.follow(), [state])
  useWatched(state)
  const open = state.isOpen
  // Drawn while it fades out.
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)
  useEffect(() => {
    if (open || !present) return
    const done = window.setTimeout(() => setPresent(false), fade)
    return () => window.clearTimeout(done)
  }, [open, present])
  useSearchKeys(state, open)
  // Closed: the message field takes the keys back (not under a sheet or an alert, whose Escape would go to the field).
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open) {
      const frame = window.requestAnimationFrame(() => {
        if (!somethingOver()) messageField()?.focus()
      })
      wasOpen.current = open
      return () => window.cancelAnimationFrame(frame)
    }
    wasOpen.current = open
  }, [open])
  const size = useWindowSize()
  if (!present) return null
  return (
    <div className={classes('search-layer', !open && 'leaving')} inert={!open}>
      <div
        className="search-dim"
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault()
          model.closeSearch()
        }}
      />
      <SearchPanel
        state={state}
        store={store}
        open={open}
        width={Math.min(640, Math.max(0, size.width - 32))}
        listHeight={Math.min(420, Math.max(240, size.height - 180))}
      />
    </div>
  )
}

/**
 * Search's keys while it is open (`key`), before the field's own: the
 * rest go to the field. ⌘ or Control held shows the rows' shortcuts; the
 * window going to the back lets go of it.
 */
function useSearchKeys(state: SearchState, open: boolean) {
  useEffect(() => {
    if (!open) return
    const down = (event: KeyboardEvent) => {
      state.hold(event.metaKey || event.ctrlKey)
      if (state.key(event)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const up = (event: KeyboardEvent) =>
      state.hold(event.metaKey || event.ctrlKey)
    const blur = () => state.hold(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [state, open])
}

/**
 * The panel (`SearchPanel`): 24 round, the raised ground with a hairline
 * (10%) and a soft shadow (neither on dark); the field (17, 56 high, a
 * hairline under it), the tabs, the results.
 */
function SearchPanel({
  state,
  store,
  open,
  width,
  listHeight,
}: {
  state: SearchState
  store: AppStore
  open: boolean
  width: number
  listHeight: number
}) {
  useWatched(store)
  // The rows are read again when search or the store changes.
  const version = state.getVersion()
  const storeVersion = store.getVersion()
  const listing = useMemo(
    () => state.listing(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, version, storeVersion],
  )
  const unavailable = listing.settled === 'unavailable'
  const field = useRef<HTMLInputElement>(null)
  // The field takes the keys as the panel appears, and again when search is opened over itself.
  useEffect(() => {
    field.current?.focus()
  }, [state.focus])
  const lit =
    listing.rows.length === 0
      ? undefined
      : Math.min(Math.max(state.highlight, 0), listing.rows.length - 1)
  return (
    <div
      className="search-panel"
      style={{ width }}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-label={t('Search')}
      // A click on the panel but the field keeps the keys in the field, as the Mac's panel does.
      onMouseDown={(event) => {
        if (event.target !== field.current) event.preventDefault()
      }}
    >
      <div className="search-field-row">
        <span className="search-field-glass">
          <SearchGlyph name="magnifyingglass" size={17} />
        </span>
        <input
          ref={field}
          className="search-field"
          value={state.query}
          placeholder={t('Search')}
          aria-label={t('Search')}
          aria-controls="search-results"
          aria-activedescendant={
            lit !== undefined ? `search-row-${lit}` : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => state.type(event.target.value)}
        />
        {unavailable && listing.rows.length > 0 && (
          <span className="search-unavailable">{t('Search unavailable')}</span>
        )}
      </div>
      <TabRow
        tabs={listing.tabs}
        current={listing.tab}
        choose={(tab) => {
          state.choose(tab)
          field.current?.focus()
        }}
      />
      <div className="search-results-box" style={{ height: listHeight }}>
        <Results
          state={state}
          listing={listing}
          lit={lit}
          width={width}
          unavailable={unavailable}
        />
      </div>
    </div>
  )
}

/**
 * The tabs (`TabRow`, "Filter results", 12 under the field, 6 apart): All,
 * Messages, Agents, Groups, Files, Links, Routines, Actions (the
 * computer's four only while its search is on), each 13 in a capsule 30
 * high, padded 12; the chosen one in the text colour on grey, the rest at
 * 60%, grey under the pointer. Wider than the panel (a longer language),
 * they scroll sideways.
 */
function TabRow({
  tabs,
  current,
  choose,
}: {
  tabs: readonly SearchTab[]
  current: SearchTab
  choose: (tab: SearchTab) => void
}) {
  return (
    <div
      className="search-tabs"
      role="tablist"
      aria-label={t('Filter results')}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          tabIndex={-1}
          className={classes('search-tab', tab === current && 'chosen')}
          aria-selected={tab === current}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(tab)}
        >
          {tabTitle(tab)}
        </button>
      ))}
    </div>
  )
}

/**
 * The results: five grey rows while the first answer is on its way, the
 * rows, or what an empty tab says. The keys bring the lit row into view;
 * the pointer moving over a row lights it.
 */
function Results({
  state,
  listing,
  lit,
  width,
  unavailable,
}: {
  state: SearchState
  listing: Listing
  lit: number | undefined
  width: number
  unavailable: boolean
}) {
  const list = useRef<HTMLDivElement>(null)
  // The keys moved the light: that row into view (as little as it takes).
  useLayoutEffect(() => {
    if (lit === undefined) return
    list.current
      ?.querySelector(`#search-row-${lit}`)
      ?.scrollIntoView({ block: 'nearest' })
    // Only when the keys move it, not the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.keyMoves])
  if (listing.rows.length === 0 && listing.settled === 'pending')
    return <Skeleton width={width} />
  if (listing.rows.length === 0)
    return (
      <Empty listing={listing} tab={listing.tab} unavailable={unavailable} />
    )
  const now = new Date()
  const agents = [...listing.agentsById.values()]
  return (
    <div
      ref={list}
      id="search-results"
      className="search-results"
      role="listbox"
      aria-label={t('Results')}
    >
      {listing.rows.map((row, index) => (
        <ResultRow
          key={rowId(row)}
          row={row}
          index={index}
          lit={index === lit}
          agents={agents}
          agentsById={listing.agentsById}
          query={state.query}
          tab={listing.tab}
          shortcuts={state.modifierHeld}
          now={now}
          choose={() => state.activate(row)}
          hover={() => state.hover(index)}
        />
      ))}
    </div>
  )
}

/**
 * One result (`ResultRow`, `MFn`), 60 high, padded 12, 14 round, lit grey
 * under the pointer or the arrows: its picture (36), then its words (14,
 * the query's letters in semibold; an agent's title in blue beside them)
 * over a line (13 at 60%); a hidden agent's "Hidden" tag; the theme in use
 * ticked; at the right, with ⌘ held, ⌘1–⌘9, else on All what it is
 * ("Agent", "Action", …) and on a routine's tab its date, at 40%.
 */
function ResultRow({
  row,
  index,
  lit,
  agents,
  agentsById,
  query,
  tab,
  shortcuts,
  now,
  choose,
  hover,
}: {
  row: Row
  index: number
  lit: boolean
  agents: readonly Agent[]
  agentsById: ReadonlyMap<string, Agent>
  query: string
  tab: SearchTab
  shortcuts: boolean
  now: Date
  choose: () => void
  hover: () => void
}) {
  const line = subtitle(row, agentsById, now)
  const agentTitle =
    row.kind === 'agent' && !row.agent.isGroup && row.agent.title.trim() !== ''
      ? shownTitle(row.agent)
      : undefined
  return (
    <div
      id={`search-row-${index}`}
      className={classes('search-row', lit && 'lit')}
      role="option"
      aria-selected={lit}
      onMouseMove={hover}
      onMouseDown={(event) => event.preventDefault()}
      onClick={choose}
    >
      <span className="search-leading">
        <Leading row={row} agents={agents} agentsById={agentsById} />
      </span>
      <span className="search-words">
        <span className="search-title-line">
          <span className="search-title">
            {matchRuns(rowTitle(row), query).map((run, at) =>
              run.isMatch ? (
                <b key={at}>{run.text}</b>
              ) : (
                <span key={at}>{run.text}</span>
              ),
            )}
          </span>
          {agentTitle !== undefined && (
            <span className="search-agent-title">{agentTitle}</span>
          )}
        </span>
        {line !== '' && <span className="search-subtitle">{line}</span>}
      </span>
      {row.kind === 'agent' && row.hidden && (
        <span className="search-hidden">{t('Hidden')}</span>
      )}
      {row.kind === 'command' && row.command.isActive && (
        <span className="search-current" aria-label={t('Current')}>
          <SearchGlyph name="checkmark" size={12} weight={1.8} />
        </span>
      )}
      <Trailing row={row} index={index} tab={tab} shortcuts={shortcuts} />
    </div>
  )
}

function Trailing({
  row,
  index,
  tab,
  shortcuts,
}: {
  row: Row
  index: number
  tab: SearchTab
  shortcuts: boolean
}) {
  const number = shortcut(index)
  if (shortcuts && number !== undefined)
    return (
      <span className="search-keys">
        <Keycap text={apple ? '⌘' : 'Ctrl'} />
        <Keycap text={String(number)} />
      </span>
    )
  if (tab === 'all')
    return <span className="search-trailing">{rowKind(row)}</span>
  const date = listTime(rowDate(row))
  if (date !== undefined) return <span className="search-trailing">{date}</span>
  return null
}

/** A key of a shortcut (`Keycap`): 20 square, 5 round, 12 at 60% on grey; padded 4 for a longer word. */
function Keycap({ text }: { text: string }) {
  return (
    <span className={classes('search-keycap', text.length > 1 && 'wide')}>
      {text}
    </span>
  )
}

/** A row's picture (`Leading`): an agent's picture or group, an action's icon on grey, a file's kind in its colour, a link's site icon, a routine's clock on violet. */
function Leading({
  row,
  agents,
  agentsById,
}: {
  row: Row
  agents: readonly Agent[]
  agentsById: ReadonlyMap<string, Agent>
}) {
  switch (row.kind) {
    case 'agent':
      return <AgentMark agent={row.agent} agents={agents} size={36} />
    case 'message': {
      const agent = agentsById.get(row.hit.agentId)
      return agent ? (
        <AgentMark agent={agent} agents={agents} size={36} />
      ) : (
        <span className="search-tile">
          <SearchGlyph name="bubble.left" size={17} />
        </span>
      )
    }
    case 'command':
      return (
        <span className="search-tile">
          <SearchGlyph name={commandSymbol(row.command.icon)} size={17} />
        </span>
      )
    case 'file':
      return <FileKindTile kind={row.hit.kind} />
    case 'link':
      return <LinkTile url={row.url} />
    case 'routine':
      return (
        <span className="search-tile routine">
          <SearchGlyph name="clock" size={17} />
        </span>
      )
  }
}

/**
 * A file's kind (`FileKindTile`, `OCe`, 36): its icon in its colour on
 * that colour at 9% (17% on dark), 10 round, a half-point edge in the
 * colour at 17% (the ink at 15% for a kind without one).
 */
function FileKindTile({ kind }: { kind: string }) {
  const [symbol, tint] = fileSymbol(kind)
  return (
    <span
      className={classes('search-tile', 'file-kind', !tint && 'plain')}
      style={{ '--kind': tint ?? '#777777' } as React.CSSProperties}
    >
      <SearchGlyph name={symbol} size={17} />
    </span>
  )
}

/** A link's site icon (18) once it has come, else the link icon, on the raised ground with a half-point edge, 10 round (`LinkTile`). The site's own icon, as the chat's links have it. */
function LinkTile({ url }: { url: string }) {
  const site = siteOf(url)
  return (
    <span className="search-tile link">
      {site ? <SiteIcon site={site} /> : <SearchGlyph name="link" size={17} />}
    </span>
  )
}

function SiteIcon({ site }: { site: string }) {
  const [state, settle] = useSiteIcon(site)
  return (
    <>
      {state !== 'shown' && <SearchGlyph name="link" size={17} />}
      {state !== 'none' && (
        <img
          className={state === 'shown' ? 'search-site' : 'search-site coming'}
          src={`https://${site}/favicon.ico`}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onLoad={(event) => settle(event.currentTarget.naturalWidth > 0)}
          onError={() => settle(false)}
        />
      )}
    </>
  )
}

/** The grey bars' widths, row by row: the title's and the line's share of the room (`Skeleton.widths`). */
const skeletonWidths: readonly [number, number][] = [
  [0.58, 0.34],
  [0.41, 0.26],
  [0.67, 0.39],
  [0.48, 0.3],
  [0.36, 0.22],
]

/** While the first rows are on their way (after 150 ms): five rows of grey bars that shimmer (`Skeleton`, `YFn`). */
function Skeleton({ width }: { width: number }) {
  const room = Math.max(0, width - 92)
  return (
    <div className="search-skeleton" aria-hidden="true">
      {skeletonWidths.map(([title, line], index) => (
        <div key={index} className="search-skeleton-row">
          <span className="search-skeleton-tile" />
          <span className="search-skeleton-words">
            <span
              className="search-skeleton-bar"
              style={{ width: room * title, height: 10 }}
            />
            <span
              className="search-skeleton-bar"
              style={{ width: room * line, height: 8 }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Nothing to list (`Empty`): "No results" (13, 60%) for words that find
 * nothing; otherwise the tab's own words under its icon (26 at 30%: the
 * glass for Messages, people for the rest), 13 at 500, and a line under
 * them (12, 40%), in the middle.
 */
function Empty({
  listing,
  tab,
  unavailable,
}: {
  listing: Listing
  tab: SearchTab
  unavailable: boolean
}) {
  if (listing.filtered && !unavailable)
    return (
      <div className="search-empty">
        <span className="search-empty-words">{t('No results')}</span>
      </div>
    )
  const words = empty(tab, unavailable)
  return (
    <div className="search-empty">
      <span className="search-empty-icon">
        <SearchGlyph
          name={words.glass ? 'magnifyingglass' : 'person.2'}
          size={28}
        />
      </span>
      <span className="search-empty-label">{words.label}</span>
      {words.hint && <span className="search-empty-hint">{words.hint}</span>}
    </div>
  )
}

// MARK: A line search found

/**
 * A message or file found by search, in this chat (ChatPane.swift's
 * `pendingReveal` task): its older lines read until it is there, then it is
 * brought to the middle and lit. A thread open over the chat closes, unless
 * the line is in it.
 */
export function useSearchReveal(
  store: AppStore,
  agentId: string,
  jumpRef: RefObject<((rowId: string) => void) | undefined>,
) {
  const model = useWindowModel()
  useEffect(() => {
    let ended = false
    let taking: Reveal | undefined
    /** Waits for the row to be drawn (the lines read in, the chat back from its thread), then goes to it. */
    const jumpWhenDrawn = async (target: string) => {
      const until = Date.now() + 2_000
      while (!ended && Date.now() < until) {
        const drawn = document.querySelector(
          `.chat-pane [data-row-id="${CSS.escape(target)}"]`,
        )
        if (drawn && jumpRef.current) {
          jumpRef.current(target)
          return
        }
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
      }
    }
    const take = async (reveal: Reveal) => {
      await store.loadUntil(reveal.entryId, agentId)
      if (ended || model.pendingReveal !== reveal) return
      model.revealTaken(reveal)
      const rows = store.rows(agentId)
      const target = rowIdFor(reveal.entryId, rows) ?? reveal.entryId
      if (store.openThreads[agentId] != null) {
        const inThread = rowIdFor(
          reveal.entryId,
          store.threadRows[agentId] ?? [],
        )
        if (inThread) {
          await jumpWhenDrawn(inThread)
          return
        }
        store.closeThread(agentId)
      }
      await jumpWhenDrawn(target)
    }
    const check = () => {
      const reveal = model.pendingReveal
      if (!reveal || reveal.agentId !== agentId || reveal === taking) return
      taking = reveal
      void take(reveal)
    }
    check()
    const stop = model.subscribe(check)
    return () => {
      ended = true
      stop()
    }
  }, [model, store, agentId, jumpRef])
}

// MARK: The symbols

/** The window's icon names as the symbols drawn here (`SearchIcons.symbol`). */
function commandSymbol(name: string): GlyphName {
  switch (name) {
    case 'organization-filled':
      return 'person.3'
    case 'eye-slash':
      return 'eye.slash'
    case 'people':
      return 'person.2'
    case 'chat-bubbles':
      return 'bubble.left.and.bubble.right'
    case 'settings-gear':
      return 'gearshape'
    case 'chart-bars':
      return 'chart.bar'
    case 'plug':
      return 'powerplug'
    case 'display':
      return 'display'
    case 'sun':
      return 'sun.max'
    case 'moon':
      return 'moon'
    case 'device-desktop':
      return 'desktopcomputer'
    default:
      return 'circle'
  }
}

/** A file's kind (`SearchIcons.file`, `tin`): its icon and colour (none: the neutral grey). */
function fileSymbol(kind: string): [GlyphName, string | undefined] {
  switch (kind) {
    case 'document':
    case 'text':
    case 'markdown':
      return ['doc.text', '#1084fe']
    case 'pdf':
      return ['doc.richtext', '#ff263c']
    case 'table':
      return ['tablecells', '#00c972']
    case 'shell':
      return ['terminal', '#00c972']
    case 'json':
      return ['curlybraces', '#ff9800']
    case 'audio':
      return ['music.note', '#ff309b']
    case 'image':
      return ['photo', '#ff6700']
    case 'video':
      return ['video', '#ff6700']
    case 'archive':
      return ['archivebox', undefined]
    default:
      return ['doc', undefined]
  }
}

type GlyphName =
  | 'magnifyingglass'
  | 'person.2'
  | 'person.3'
  | 'eye.slash'
  | 'bubble.left'
  | 'bubble.left.and.bubble.right'
  | 'gearshape'
  | 'chart.bar'
  | 'powerplug'
  | 'display'
  | 'sun.max'
  | 'moon'
  | 'desktopcomputer'
  | 'circle'
  | 'checkmark'
  | 'clock'
  | 'link'
  | 'doc'
  | 'doc.text'
  | 'doc.richtext'
  | 'tablecells'
  | 'terminal'
  | 'curlybraces'
  | 'music.note'
  | 'photo'
  | 'video'
  | 'archivebox'

/** A gear's outline: eight teeth round a ring, as `gearshape` draws it. */
const gear = (() => {
  const points: string[] = []
  const teeth = 8
  for (let n = 0; n < teeth * 4; n += 1) {
    const angle = ((n - 0.5) / (teeth * 4)) * Math.PI * 2
    const radius = n % 4 < 2 ? 6.6 : 5.1
    points.push(
      `${(8 + radius * Math.cos(angle)).toFixed(2)} ${(8 + radius * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return `M${points.join('L')}Z M8 10.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z`
})()

const page =
  'M4 1.8h5.2l3.3 3.3v8.6a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2.3a.5.5 0 0 1 .5-.5ZM9 1.8v3.5h3.5'
const box =
  'M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5Z'
const screen =
  'M1.5 3.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1ZM5.8 14h4.4M8 11.5V14'

/** The symbols (SF Symbols' shapes, drawn by eye) in a 16 box. */
const glyphPaths: Record<GlyphName, string> = {
  magnifyingglass:
    'M6.9 11.6a4.7 4.7 0 1 0 0-9.4 4.7 4.7 0 0 0 0 9.4ZM10.3 10.3l3.9 3.9',
  'person.2':
    'M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM1.5 12.5c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6M10.5 7.2a1.7 1.7 0 1 0 0-3.4M11.2 9.1c1.9.2 3.3 1.5 3.3 3.4',
  'person.3':
    'M8 7.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.6 12.8c0-2 1.5-3.4 3.4-3.4s3.4 1.4 3.4 3.4M3.7 7.4a1.5 1.5 0 1 1 0-3M12.3 7.4a1.5 1.5 0 1 0 0-3M1 12c0-1.5 1-2.6 2.3-2.9M15 12c0-1.5-1-2.6-2.3-2.9',
  'eye.slash':
    'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.5 2.5l11 11',
  'bubble.left':
    'M3.5 2.5h9A1.5 1.5 0 0 1 14 4v6a1.5 1.5 0 0 1-1.5 1.5H6.5L3.5 14v-2.5A1.5 1.5 0 0 1 2 10V4a1.5 1.5 0 0 1 1.5-1.5Z',
  'bubble.left.and.bubble.right':
    'M5 9.5H3.6L1.8 11V3.8a1.3 1.3 0 0 1 1.3-1.3h6.1a1.3 1.3 0 0 1 1.3 1.3V5M7.3 5h5.6a1.3 1.3 0 0 1 1.3 1.3V14l-1.8-1.5H7.3A1.3 1.3 0 0 1 6 11.2V6.3A1.3 1.3 0 0 1 7.3 5Z',
  gearshape: gear,
  'chart.bar': 'M3 13.5v-4M8 13.5v-11M13 13.5v-7',
  powerplug: 'M5.5 1.5v3M10.5 1.5v3M3.5 4.5h9V7a4.5 4.5 0 0 1-9 0ZM8 11.5v3',
  display: screen,
  'sun.max':
    'M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3',
  moon: 'M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z',
  desktopcomputer: screen,
  circle: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z',
  checkmark: 'M3 8.5 6.5 12l6.5-8',
  clock: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13ZM8 4.5V8l2.5 1.5',
  link: 'M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7L8 4.3M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.2 9.1a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1',
  doc: page,
  'doc.text': `${page}M5.8 8.2h4.4M5.8 10.3h4.4M5.8 12.4h2.6`,
  'doc.richtext': `${page}M5.3 12.6l1.8-2.1 1.3 1.3 1-1.1 1.5 1.9M6.9 8.4a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z`,
  tablecells: `${box}M2 6.5h12M2 10h12M6.5 6.5V14`,
  terminal: `${box}M4.6 6.2 6.8 8l-2.2 1.8M8.2 10.4h3`,
  curlybraces:
    'M6 2.5c-1.5 0-2 .6-2 1.8v1.9c0 .9-.5 1.5-1.5 1.8 1 .3 1.5.9 1.5 1.8v1.9c0 1.2.5 1.8 2 1.8M10 2.5c1.5 0 2 .6 2 1.8v1.9c0 .9.5 1.5 1.5 1.8-1 .3-1.5.9-1.5 1.8v1.9c0 1.2-.5 1.8-2 1.8',
  'music.note':
    'M7 12.3a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 12.3V2.2l5.5 1.6v2.6L7 4.8',
  photo: `${box}M2.5 11.8l3.2-3.2 2.8 2.8 1.8-1.8 3.2 3.2M10.6 6.6a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z`,
  video:
    'M1.5 4.5A1.5 1.5 0 0 1 3 3h6.5A1.5 1.5 0 0 1 11 4.5v7A1.5 1.5 0 0 1 9.5 13H3a1.5 1.5 0 0 1-1.5-1.5ZM11 7l3.5-2v6L11 9',
  archivebox:
    'M1.5 2.5h13v3h-13ZM2.5 5.5V13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V5.5M6.5 8.5h3',
}

function SearchGlyph({
  name,
  size,
  weight = 1.3,
}: {
  name: GlyphName
  size: number
  weight?: number
}): ReactNode {
  return (
    <svg
      className="search-glyph"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d={glyphPaths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
