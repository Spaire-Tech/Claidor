// The message field's lists (mac/Simeon/ComposerPicks.swift, step 2e): "@"
// agents, groups, routines and apps (`Mention`), "/" skills and the app's
// actions (`Reference a skill`), "#" the pull requests the chat named, ":"
// emoji. Which is open, the row chosen, an Escape that keeps one shut where
// it was put away, and what was picked lately (the window's local storage,
// under the Mac's own names: `simeon.mentionRecents`, `simeon.emojiRecents`).
//
// "/" offers the agent's skills; the app's actions join it with the screens
// they open (the org chart, the agent's pane, Settings, Connectors: steps 4
// to 6, docs/web-app/PROGRESS.md).

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type ComposerChip, textStart } from '../core/composerDocument'
import {
  type MentionRow,
  type SlashItem,
  appActions,
  filterMentions,
  filterPulls,
  mentionConnectors,
  mentionEmptyText,
  mentionMembers,
  mentionRows,
  pullCandidates,
  rememberingMention,
  slashEmptyText,
  slashId,
  slashItems,
  slashLabel,
  slashSubtitle,
  slashTag,
  triggerIn,
} from '../core/composerLists'
import { type PullRequest, type Skill, skillsFrom } from '../core/composerMenus'
import {
  type Emoji,
  type EmojiCatalog,
  emojiQuery,
  loadEmojiCatalog,
  remembering,
} from '../core/emoji'
import { brandLogos, brandMentions } from '../core/generatedBrands'
import { type Agent, showsMembers } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import { windowActionIds } from './windowModel'

export type PickKind = 'mention' | 'slash' | 'pull' | 'emoji'

/** The list a trigger before the caret opens: which, what was typed after it, and where it is in the words (what a pick replaces). */
export interface PickRequest {
  kind: PickKind
  query: string
  /** The trigger's place in the words. */
  start: number
  /** The caret's. */
  end: number
}

/** A key the field passes to an open list. */
export type ListKey = 'up' | 'down' | 'choose' | 'close'

/** One row of an open list. */
export type PickRow =
  | { kind: 'mention'; row: MentionRow }
  | { kind: 'slash'; item: SlashItem }
  | { kind: 'pull'; pull: PullRequest }
  | { kind: 'emoji'; emoji: Emoji }

function rowId(row: PickRow): string {
  switch (row.kind) {
    case 'mention':
      return `m:${row.row.key}`
    case 'slash':
      return `s:${slashId(row.item)}`
    case 'pull':
      return `p:${row.pull.number}`
    case 'emoji':
      return `e:${row.emoji.id}`
  }
}

/**
 * The list the words before the caret open (`cAe`): "@", "/" or "#" at the
 * start, after a space or "(", in the words after the last pick; else ":"
 * and two letters for emoji. None while words are chosen.
 */
export function pickRequest(
  words: string,
  caret: { start: number; end: number } | undefined,
  chips: readonly ComposerChip[],
): PickRequest | undefined {
  if (!caret || caret.start !== caret.end) return undefined
  const before = words.slice(0, caret.end)
  const after = textStart(chips, before)
  const triggers = [
    ['@', 'mention'],
    ['/', 'slash'],
    ['#', 'pull'],
  ] as const
  for (const [character, kind] of triggers) {
    const found = triggerIn(character, before, after)
    if (found)
      return { kind, query: found.query, start: found.at, end: caret.end }
  }
  const query = emojiQuery(before.slice(after))
  if (query == null) return undefined
  return {
    kind: 'emoji',
    query,
    start: before.lastIndexOf(':'),
    end: caret.end,
  }
}

function readKept(key: string): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(kept)
      ? kept.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

function keep(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A browser that keeps nothing: picked lately for this tab only.
  }
}

/** Whether "/" offers Org Chart (the agent network on, `isAgentNetworkEnabled`) and Channels (`getAgentChannels`) in this chat. */
interface Gates {
  agentId: string
  orgChart: boolean
  channels: boolean
}

async function readGates(
  store: AppStore,
  agentId: string,
  wakes: boolean,
  signal: AbortSignal,
): Promise<Gates> {
  const [orgChart, channels] = await Promise.all([
    store.agentNetworkEnabled(wakes, signal),
    store.channelsAvailable(agentId, wakes, signal),
  ])
  return { agentId, orgChart, channels }
}

/**
 * The field's open list: its request (Escape's dismissal applied), its rows
 * as the window filters them, what it says with nothing to offer ("@" and
 * "/" say so, "#" and ":" close), the row chosen, and Escape and a pick's
 * memory. The agent's skills and routines are read as the chat opens, and
 * the connected apps; a computer that rests is waited for, not woken.
 */
export function useComposerPicks({
  store,
  agentId,
  words,
  caret,
  chips,
}: {
  store: AppStore
  agentId: string
  words: string
  caret: { start: number; end: number } | undefined
  chips: readonly ComposerChip[]
}) {
  const asked = pickRequest(words, caret, chips)
  // Where Escape put a list away (`dismissedAt`): it stays shut until that trigger is gone or another opens.
  const [dismissedAt, setDismissedAt] = useState<number>()
  if (dismissedAt != null && asked?.start !== dismissedAt)
    setDismissedAt(undefined)
  const request = asked && asked.start !== dismissedAt ? asked : undefined

  // Whether "/" offers Org Chart and Channels: read as the chat opens (a resting computer waited for), and again each time "/" opens.
  const [gates, setGates] = useState<Gates>()
  // The agent's skills ("/") and routines ("@"), and the connected apps ("@"), read as the chat opens.
  const [lists, setLists] = useState<{
    agentId: string
    skills: Skill[]
    routines: Skill[]
  }>()
  useEffect(() => {
    const ending = new AbortController()
    void store.workflows(agentId, false, ending.signal).then((answer) => {
      if (ending.signal.aborted) return
      setLists({
        agentId,
        skills: skillsFrom(answer),
        routines: skillsFrom(answer, true),
      })
    })
    void store.loadApps(false)
    void readGates(store, agentId, false, ending.signal).then((read) => {
      if (!ending.signal.aborted) setGates(read)
    })
    return () => ending.abort()
  }, [store, agentId])
  // Read again each time "/" opens, waking a resting computer.
  const wantsSlash = request?.kind === 'slash'
  useEffect(() => {
    if (!wantsSlash) return
    const ending = new AbortController()
    void readGates(store, agentId, true, ending.signal).then((read) => {
      if (!ending.signal.aborted) setGates(read)
    })
    return () => ending.abort()
  }, [wantsSlash, store, agentId])
  const skills = useMemo(
    () => (lists?.agentId === agentId ? lists.skills : []),
    [lists, agentId],
  )
  const routines = useMemo(
    () => (lists?.agentId === agentId ? lists.routines : []),
    [lists, agentId],
  )

  // The emoji, read when ":" first asks.
  const [catalog, setCatalog] = useState<EmojiCatalog>()
  const wantsEmoji = request?.kind === 'emoji'
  useEffect(() => {
    if (!wantsEmoji || catalog) return
    let live = true
    void loadEmojiCatalog().then((read) => {
      if (live) setCatalog(read)
    })
    return () => {
      live = false
    }
  }, [wantsEmoji, catalog])

  const [emojiRecents, setEmojiRecents] = useState(() =>
    readKept('simeon.emojiRecents'),
  )
  const [mentionRecents, setMentionRecents] = useState(() =>
    readKept('simeon.mentionRecents'),
  )

  const kind = request?.kind
  const query = request?.query ?? ''
  const agent = store.agent(agentId)
  const roster = store.agents
  const apps = store.apps
  const transcript = store.transcripts[agentId]
  const hasHidden = roster.some((one) => one.isHidden)
  const gatesHere = gates?.agentId === agentId ? gates : undefined
  // The app's actions whose screens the window has, Update Simeon's Computer while it is offered (step 5c); Settings, Connectors and the themes come with step 6.
  const computerUpdate = store.computerUpdateOffer !== undefined
  const actions = useMemo(
    () =>
      appActions({
        isGroup: agent != null && showsMembers(agent),
        hasHiddenAgents: hasHidden,
        hasChannels: gatesHere?.channels ?? false,
        showsOrgChart: (gatesHere?.orgChart ?? false) && roster.length > 0,
        showsUsage: false,
        computerUpdate,
      }).filter((action) => windowActionIds.has(action.id)),
    [agent, hasHidden, gatesHere, roster.length, computerUpdate],
  )
  const rows = useMemo((): PickRow[] => {
    switch (kind) {
      case 'mention': {
        const all = mentionRows(
          mentionMembers(agent, roster),
          agent?.isGroup ?? false,
          routines,
          mentionConnectors(apps),
        )
        return filterMentions(all, query, mentionRecents).map((row) => ({
          kind: 'mention',
          row,
        }))
      }
      case 'slash':
        return slashItems(skills, actions, query).map((item) => ({
          kind: 'slash',
          item,
        }))
      case 'pull':
        return filterPulls(pullCandidates(transcript ?? []), query).map(
          (pull) => ({ kind: 'pull', pull }),
        )
      case 'emoji':
        return (catalog?.suggestions(query, emojiRecents) ?? []).map(
          (emoji) => ({ kind: 'emoji', emoji }),
        )
      default:
        return []
    }
  }, [
    kind,
    query,
    agent,
    roster,
    apps,
    routines,
    skills,
    actions,
    transcript,
    catalog,
    emojiRecents,
    mentionRecents,
  ])
  const empty =
    kind === 'mention'
      ? mentionEmptyText(query)
      : kind === 'slash'
        ? slashEmptyText(query, skills.length > 0)
        : undefined
  const open = request != null && (rows.length > 0 || empty != null)

  // The first row is chosen again whenever the list asks for something new.
  const key = request ? `${request.kind}:${request.start}:${request.query}` : ''
  const [chosen, setChosen] = useState({ key: '', index: 0 })
  const selected =
    chosen.key === key
      ? Math.min(chosen.index, Math.max(0, rows.length - 1))
      : 0

  return {
    request,
    rows,
    empty,
    open,
    selected,
    /** The pointer over a row chooses it. */
    choose: (index: number) => setChosen({ key, index }),
    /** ↑ and ↓ choose, round. */
    step: (by: number) =>
      setChosen({
        key,
        index: (((selected + by) % rows.length) + rows.length) % rows.length,
      }),
    dismiss: () => {
      if (request) setDismissedAt(request.start)
    },
    /** A pick remembered, so it comes first next time among equals. */
    remember: (row: PickRow) => {
      if (row.kind === 'emoji') {
        const next = remembering(row.emoji.id, emojiRecents)
        setEmojiRecents(next)
        keep('simeon.emojiRecents', next)
      } else if (row.kind === 'mention') {
        const next = rememberingMention(row.row.key, mentionRecents)
        setMentionRecents(next)
        keep('simeon.mentionRecents', next)
      }
    },
  }
}

/**
 * Where a place in the words is drawn in the field (the trigger's line, for
 * the list to hang from), measured on a copy of the field laid out the same.
 */
export function placeInField(
  field: HTMLTextAreaElement,
  index: number,
): { left: number; top: number } {
  const style = getComputedStyle(field)
  const copy = document.createElement('div')
  for (const name of [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'wordSpacing',
    'tabSize',
  ] as const)
    copy.style[name] = style[name]
  copy.style.position = 'absolute'
  copy.style.visibility = 'hidden'
  copy.style.top = '0'
  copy.style.left = '-9999px'
  copy.style.whiteSpace = 'pre-wrap'
  copy.style.overflowWrap = 'break-word'
  copy.textContent = field.value.slice(0, index)
  const mark = document.createElement('span')
  mark.textContent = field.value.slice(index, index + 1) || '.'
  copy.append(mark)
  document.body.append(copy)
  const place = {
    left: mark.offsetLeft - field.scrollLeft,
    top: mark.offsetTop - field.scrollTop,
  }
  copy.remove()
  return place
}

/** The list's width: emoji 320, the others 360. */
export function listWidth(kind: PickKind): number {
  return kind === 'emoji' ? 320 : 360
}

const listNames: Record<PickKind, () => string> = {
  mention: () => t('Mention'),
  slash: () => t('Reference a skill'),
  pull: () => t('Pull requests'),
  emoji: () => t('Emoji'),
}

/**
 * A list over the field (`sand-reference-menu`): 4 over the trigger's line
 * and from its left, 360 wide on the chat's ground with a hairline (15%)
 * and, on light, a soft shadow, 12 round; its rows 2 apart, padded 6, up to
 * 320 high, then it scrolls. A row (28, padded 6 8, 6 round, grey when
 * chosen): its picture (16), its name (13), what it is beside it at 40%,
 * and its kind at the right ("Agent", "Group", "Routine", "Plugin", "Skill",
 * "Action"). Emoji (`sand-emoji-menu`): 320 wide, 14 round, rows 1 apart,
 * padded 4, up to 260 high; the emoji, ":shortcode:" (13) and its name (11,
 * at 40%), 8 apart, 10 round. Nothing found: "No matches for “…”" (13) over
 * "Press Esc to close" (11, at 40%), padded 8 12. The pointer chooses a
 * row; a click picks it, the field keeping the keys.
 */
export function PickList({
  kind,
  rows,
  empty,
  selected,
  agents,
  hover,
  pick,
  style,
}: {
  kind: PickKind
  rows: PickRow[]
  empty?: string
  selected: number
  /** The roster, for the agents' pictures. */
  agents: readonly Agent[]
  hover: (index: number) => void
  pick: (row: PickRow) => void
  style: CSSProperties
}) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    box.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  const emoji = kind === 'emoji'
  return (
    <div
      ref={box}
      className={emoji ? 'pick-list emoji' : 'pick-list'}
      role="listbox"
      aria-label={listNames[kind]()}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      {rows.length === 0 && empty != null ? (
        <div className="pick-empty">
          <span className="pick-empty-words">{empty}</span>
          <span className="pick-empty-hint">{t('Press Esc to close')}</span>
        </div>
      ) : (
        rows.map((row, index) => (
          <div
            key={rowId(row)}
            data-index={index}
            role="option"
            aria-selected={index === selected}
            className={
              (emoji ? 'emoji-row' : 'pick-row') +
              (index === selected ? ' chosen' : '')
            }
            onMouseEnter={() => hover(index)}
            onClick={() => pick(row)}
          >
            <PickLine row={row} agents={agents} />
          </div>
        ))
      )}
    </div>
  )
}

function PickLine({ row, agents }: { row: PickRow; agents: readonly Agent[] }) {
  switch (row.kind) {
    case 'emoji':
      return (
        <>
          <span className="emoji-glyph">{row.emoji.character}</span>
          <span className="emoji-code">{`:${row.emoji.shortcodes[0] ?? row.emoji.id}:`}</span>
          <span className="emoji-name">{row.emoji.name}</span>
        </>
      )
    case 'mention':
      return (
        <Line
          icon={<MentionPicture row={row.row} agents={agents} />}
          title={row.row.label}
          subtitle={row.row.subtitle}
          tag={row.row.tag}
        />
      )
    case 'slash':
      return (
        <Line
          icon={
            <Glyph name={row.item.kind === 'skill' ? 'sparkles' : 'command'} />
          }
          title={slashLabel(row.item)}
          subtitle={slashSubtitle(row.item)}
          tag={slashTag(row.item)}
        />
      )
    case 'pull':
      // "Pull request" is not translated on the Mac either (its tag is written in English there).
      return (
        <Line
          icon={<Glyph name="pull" />}
          title={`#${row.pull.number}`}
          subtitle={row.pull.title}
          tag="Pull request"
        />
      )
  }
}

/** A row of "@", "/" or "#" (`sand-mention-menu-item`): the picture, the name and what it is, the kind at the right. */
function Line({
  icon,
  title,
  subtitle,
  tag,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  tag: string
}) {
  return (
    <>
      <span className="pick-icon">{icon}</span>
      <span className="pick-words">
        <span className="pick-title">{title}</span>
        {subtitle != null && subtitle !== '' && (
          <span className="pick-subtitle">{subtitle}</span>
        )}
      </span>
      <span className="pick-tag">{tag}</span>
    </>
  )
}

/** An "@" row's picture: the agent's picture, a group's or everyone's people, a routine's clock, an app's logo on its tile. */
function MentionPicture({
  row,
  agents,
}: {
  row: MentionRow
  agents: readonly Agent[]
}) {
  const icon = row.icon
  switch (icon.kind) {
    case 'agent': {
      const agent = agents.find((one) => one.id === icon.id)
      return agent ? (
        <AgentMark agent={agent} agents={agents} size={16} />
      ) : (
        <Glyph name="people" />
      )
    }
    case 'everyone':
    case 'group':
      return <Glyph name="people" />
    case 'routine':
      return <Glyph name="clock" />
    case 'connector':
      return <LogoTile name={icon.name} side={16} />
  }
}

/**
 * An app's logo on its tile (`AppLogoTile`): the brand's logo when the app
 * is one the chat names in colour, else its first letter at 60% on the grey
 * tile (17%, 32% on dark), its corners 11/40 of its side. The apps' own
 * icons come with the Connectors page (step 6).
 */
function LogoTile({ name, side }: { name: string; side: number }) {
  const brand = brandMentions.find(
    (one) => one.name.toLowerCase() === name.toLowerCase(),
  )
  const logo = brand ? brandLogos[brand.key] : undefined
  return (
    <span
      className={logo ? 'logo-tile drawn' : 'logo-tile'}
      style={{
        width: side,
        height: side,
        borderRadius: (side * 11) / 40,
        fontSize: side * 0.42,
      }}
    >
      {logo ? <img src={logo} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** The rows' symbols: people (`person.2`), a clock, sparkles (a skill), ⌘ (an action), a pull request. */
function Glyph({
  name,
}: {
  name: 'people' | 'clock' | 'sparkles' | 'command' | 'pull'
}) {
  const paths: Record<typeof name, string> = {
    people:
      'M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM1.5 12.5c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6M10.5 7.2a1.7 1.7 0 1 0 0-3.4M11.2 9.1c1.9.2 3.3 1.5 3.3 3.4',
    clock: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13ZM8 4.5V8l2.5 1.5',
    sparkles:
      'M6.5 2.5 7.6 5.4l2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1ZM12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z',
    command:
      'M5 5h6v6H5ZM5 5V3.5A1.5 1.5 0 1 0 3.5 5H5M11 5V3.5A1.5 1.5 0 1 1 12.5 5H11M5 11v1.5A1.5 1.5 0 1 1 3.5 11H5M11 11v1.5a1.5 1.5 0 1 0 1.5-1.5H11',
    pull: 'M4 4.5v7M4 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4 14.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 11.5V6a2 2 0 0 0-2-2H7.5M9 2.5 7.5 4 9 5.5M12 14.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  }
  return (
    <svg
      className={`pick-glyph ${name}`}
      width="12"
      height="12"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
