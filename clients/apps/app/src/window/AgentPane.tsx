// The agent's pane on the window's right (mac/Simeon/AgentPane.swift): one
// pane for the window, open or closed and its width kept from one visit to
// the next (windowModel.ts). It widens from the window's right over 0.24 s
// while its page, laid out at its full width, fades in; its left edge drags
// its width. The page: the top bar (Close), then the agent's head (the
// avatar's button, the name, the title), the three tabs and the tab's
// page: Profile (here), Routines (RoutinesPage.tsx), a group's members
// (GroupMembers.tsx), Channels (ChannelsPage.tsx); a flight's details
// (FlightCards.tsx) in place of its agent's page, a routine's editor over
// the whole page, the avatar editor (AvatarEditor.tsx) under the avatar.

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { pictureURL } from '../core/faces'
import {
  type Agent,
  chiefOfStaff,
  shownDescription,
  shownTitle,
  showsMembers,
} from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import './AgentPane.css'
import { AvatarEditorPopover } from './AvatarEditor'
import { ChannelsBody } from './ChannelsPage'
import { classes } from './classes'
import { ComputerPreview } from './ComputerView'
import { BookFlightButton, FlightPage } from './FlightCards'
import { GroupMembersBody } from './GroupMembers'
import { RoutineEditorPage, RoutinesBody } from './RoutinesPage'
import { chatMinimum } from './sidebarLayout'
import { useWatched } from './useStore'
import {
  type PaneSection,
  type WindowModel,
  paneLinger,
  paneNarrowest,
  useWindowModel,
} from './windowModel'

/**
 * The width the pane is drawn at: 0 while closed, else its width, given
 * what the window leaves beside the sidebar as it stands and the chat's
 * 424. A browser can't grow its window as the Mac's does, so the pane takes
 * what is left down to its narrowest (280), and is kept open but not drawn
 * below that.
 */
export function paneShownWidth(
  model: WindowModel,
  standing: number,
  windowWidth: number,
): number {
  if (!model.paneOpen) return 0
  const width = model.dragWidth ?? model.paneWidth
  const room = windowWidth - standing - chatMinimum
  return room < paneNarrowest ? 0 : Math.min(width, room)
}

/**
 * The pane itself (`AgentPaneColumn`): its ground, its page laid out at
 * its width and fading in, the edge that drags it. It slides only as it
 * opens and shuts, not as the window is made wider or narrower. Escape
 * closes it when nothing else takes the key.
 */
export function AgentPaneColumn({
  store,
  agentId,
  shownWidth,
  sidebarWidth,
}: {
  store: AppStore
  agentId?: string
  shownWidth: number
  sidebarWidth: number
}) {
  const model = useWindowModel()
  useWatched(model)
  const shown = shownWidth > 0
  // Its page keeps the width it was shown at while it slides shut.
  const [kept, setKept] = useState(shownWidth)
  if (shown && kept !== shownWidth) setKept(shownWidth)
  const pageWidth = shown ? shownWidth : kept
  const [lastShown, setLastShown] = useState(shown)
  const [moving, setMoving] = useState(false)
  if (lastShown !== shown) {
    setLastShown(shown)
    setMoving(true)
  }
  useEffect(() => {
    if (!moving) return
    const done = window.setTimeout(() => setMoving(false), paneLinger)
    return () => window.clearTimeout(done)
  }, [moving, shown])
  usePaneEscape(model, shown)
  return (
    <aside
      className={classes('agent-pane', shown && 'shown', moving && 'moving')}
      style={{ width: shownWidth }}
      aria-label={t('Conversation details')}
      aria-hidden={!shown}
      inert={!shown}
    >
      {model.contentAlive && (
        <div className="pane-page" style={{ width: pageWidth }}>
          <PanePage store={store} agentId={agentId} width={pageWidth} />
        </div>
      )}
      {shown && <PaneEdge model={model} sidebarWidth={sidebarWidth} />}
    </aside>
  )
}

/**
 * Escape (`CDn`): the pane closes while it shows, nothing is over the
 * window (a sheet, an alert, a viewer), the org chart isn't up (its Escape
 * is its own) and no field has the keys but the message field, whose own
 * Escape (dictation, a reply) comes first.
 */
function usePaneEscape(model: WindowModel, shown: boolean) {
  useEffect(() => {
    if (!shown) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (document.querySelector('[aria-modal="true"]')) return
      if (model.orgChart || model.avatarEditorFor !== undefined) return
      const focused = document.activeElement
      const field =
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLSelectElement ||
        (focused instanceof HTMLElement && focused.isContentEditable)
      if (field && !focused.closest('.composer')) return
      event.preventDefault()
      model.closePane()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [model, shown])
}

/** The left edge (`PaneEdge`): 10 wide, the half-point line at its left, darker under the pointer; dragged, the pane's width (left is wider). */
function PaneEdge({
  model,
  sidebarWidth,
}: {
  model: WindowModel
  sidebarWidth: number
}) {
  const start = useRef<number>(undefined)
  return (
    <div
      className={classes(
        'pane-edge',
        model.dragWidth !== undefined && 'dragging',
      )}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize details')}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = event.clientX
      }}
      onPointerMove={(event) => {
        if (start.current === undefined) return
        model.drag(
          event.clientX - start.current,
          window.innerWidth,
          sidebarWidth,
        )
      }}
      onPointerUp={() => {
        if (start.current === undefined) return
        start.current = undefined
        model.endDrag()
      }}
      onPointerCancel={() => {
        if (start.current === undefined) return
        start.current = undefined
        model.endDrag()
      }}
    />
  )
}

/**
 * The page (`PanePage`): a flight's details for the agent whose chat holds
 * it; a routine's editor, which takes the whole page; else the top bar and
 * the agent's page scrolling under it, drawn afresh for each agent.
 */
function PanePage({
  store,
  agentId,
  width,
}: {
  store: AppStore
  agentId?: string
  width: number
}) {
  const model = useWindowModel()
  useWatched(store)
  const agent = agentId ? store.agent(agentId) : undefined
  const flight = model.flight
  if (agentId && flight && flight.agentId === agentId)
    return (
      <div className="pane-column">
        <PaneTopBar close={() => model.closePane()} />
        <div className="pane-scroll">
          <div className="flight-pane-body" style={{ width }}>
            <FlightPage offer={flight.offer} />
            <BookFlightButton
              key={flight.key}
              store={store}
              flight={flight}
              done={() => model.closeFlight(flight.key)}
            />
          </div>
        </div>
      </div>
    )
  if (
    agent &&
    model.section === 'routines' &&
    model.routineEditor?.agentId === agent.id
  )
    return <RoutineEditorPage store={store} agent={agent} width={width} />
  return (
    <div className="pane-column">
      <PaneTopBar close={() => model.closePane()} />
      {agent ? (
        <div className="pane-scroll" key={agent.id}>
          <div className="pane-body" style={{ width }}>
            <AgentPage
              store={store}
              agent={agent}
              contentWidth={Math.max(0, width - 40)}
            />
          </div>
        </div>
      ) : (
        <div className="pane-empty">{t('No agent selected.')}</div>
      )}
    </div>
  )
}

/** The pane's top bar (`PaneTopBar`): 44 high, padded 12 a side, Close at its right. */
export function PaneTopBar({
  close,
  children,
}: {
  close: () => void
  children?: ReactNode
}) {
  return (
    <div className="pane-top-bar">
      {children}
      <span className="pane-top-space" />
      <PaneIconButton
        label={t('Close details')}
        help={t('Close')}
        onClick={close}
      >
        <PaneGlyph name="xmark" />
      </PaneIconButton>
    </div>
  )
}

/** A ghost icon button of the pane's bars (`PaneIconButton`): 28 square, round 6; the icon at 60% of the text, full and on the hover grey under the pointer. */
export function PaneIconButton({
  label,
  help,
  onClick,
  children,
}: {
  label: string
  help: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="pane-icon-button"
      title={help}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** The pane's small glyphs (SF Symbols at 13): the close mark, the back chevron. */
export function PaneGlyph({ name }: { name: 'xmark' | 'chevronLeft' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={
          name === 'xmark'
            ? 'M3.5 3.5l9 9M12.5 3.5l-9 9'
            : 'M10 3.2 5.2 8l4.8 4.8'
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// MARK: The agent's page

/** `.simeon-pane`: the head, the tabs (32 above, 26 below), the tab's page; the avatar editor under the avatar. */
function AgentPage({
  store,
  agent,
  contentWidth,
}: {
  store: AppStore
  agent: Agent
  contentWidth: number
}) {
  const model = useWindowModel()
  const tabs: { section: PaneSection; name: string; glyph: TabGlyphName }[] = [
    { section: 'profile', name: t('Profile'), glyph: 'profile' },
    { section: 'routines', name: t('Routines'), glyph: 'routines' },
    { section: 'computer', name: t('Computer'), glyph: 'computer' },
  ]
  let body: ReactNode = null
  switch (model.section) {
    case 'profile':
      body = <ProfileBody store={store} agent={agent} />
      break
    case 'routines':
      body = <RoutinesBody store={store} agent={agent} />
      break
    case 'channels':
      body = <ChannelsBody store={store} agent={agent} />
      break
    case 'computer':
      // A group's Computer tab is its members; a shared room's is empty; an agent's is its computer (step 5b), as on the Mac.
      body = showsMembers(agent) ? (
        <GroupMembersBody store={store} group={agent} />
      ) : agent.isGroup ? null : (
        <ComputerPreview store={store} agent={agent} />
      )
      break
  }
  return (
    <div className="agent-page" style={{ width: contentWidth }}>
      <PaneHead store={store} agent={agent} contentWidth={contentWidth} />
      <PaneTabs
        tabs={tabs}
        section={model.section}
        width={contentWidth}
        choose={(section) => model.setSection(section)}
      />
      <div className="pane-tab-page">{body}</div>
      {model.avatarEditorFor === agent.id && (
        <AvatarEditorPopover
          store={store}
          agent={agent}
          width={Math.min(294, contentWidth)}
          close={() => model.closeAvatarEditor()}
        />
      )}
    </div>
  )
}

/** The head (`PaneHead`): the avatar's button (96), the name 14 under it (22/28, 500), the title 1 under that (15/20, grey). */
function PaneHead({
  store,
  agent,
  contentWidth,
}: {
  store: AppStore
  agent: Agent
  contentWidth: number
}) {
  const title = agent.title.trim()
  return (
    <div className="pane-head">
      <AvatarTrigger store={store} agent={agent} />
      <div className="pane-name" style={{ maxWidth: contentWidth }}>
        {agent.name}
      </div>
      {!agent.isGroup && title !== '' && (
        <div className="pane-title" style={{ maxWidth: contentWidth }}>
          {shownTitle(agent)}
        </div>
      )}
    </div>
  )
}

/**
 * The avatar's button (`AvatarTrigger`): a 96 disc (white, #2c2c2e on dark,
 * a hairline inside) with the agent's picture filling it, or a group's
 * members at 64; at its lower right the 32 pencil disc ringed 3 in the
 * pane's colour. It opens and closes the avatar editor (step 4b).
 */
function AvatarTrigger({ store, agent }: { store: AppStore; agent: Agent }) {
  const model = useWindowModel()
  const picture = pictureURL(agent)
  return (
    <button
      type="button"
      className="avatar-trigger"
      title={t('Edit Avatar')}
      aria-label={t('Edit agent avatar')}
      aria-expanded={model.avatarEditorFor === agent.id}
      onClick={() => model.toggleAvatarEditor(agent.id)}
    >
      <span className="avatar-disc">
        {picture ? (
          <img src={picture} alt="" draggable={false} />
        ) : (
          <AgentMark agent={agent} agents={store.agents} size={64} />
        )}
      </span>
      <span className="avatar-pencil">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15.6 4.6a2.1 2.1 0 0 1 3 3L8.4 17.8l-4 1 1-4z M13.9 6.3l3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}

// MARK: The tabs

type TabGlyphName = 'profile' | 'routines' | 'computer'

const tabGlyphs: Record<TabGlyphName, ReactNode> = {
  profile: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 19.6c1.3-3.4 4-5.2 7.2-5.2s5.9 1.8 7.2 5.2" />
    </>
  ),
  routines: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3.1 2" />
    </>
  ),
  computer: (
    <>
      <rect x="3.2" y="4.4" width="17.6" height="12" rx="2.2" />
      <path d="M8.8 19.8h6.4M12 16.4v3.4" />
    </>
  ),
}

/**
 * The tabs (`PaneTabs`): a 36 pill track (padded 3, the pane's fill), each
 * tab an icon (19, stroke 1.6), the chosen one's white pill sliding under
 * it over 0.34 s; a short line between two tabs unless one beside it is
 * chosen. On Channels (no tab of its own) the pill sits under Profile and
 * no tab is chosen.
 */
function PaneTabs({
  tabs,
  section,
  width,
  choose,
}: {
  tabs: { section: PaneSection; name: string; glyph: TabGlyphName }[]
  section: PaneSection
  width: number
  choose: (section: PaneSection) => void
}) {
  const item = Math.max(0, (width - 6) / tabs.length)
  const index = tabs.findIndex((tab) => tab.section === section)
  const chosen = index < 0 ? undefined : index
  return (
    <div
      className="pane-tabs"
      style={{ width }}
      role="tablist"
      aria-label={t('Agent')}
    >
      <span
        className="pane-tab-thumb"
        style={{
          width: item,
          transform: `translateX(${item * (chosen ?? 0)}px)`,
        }}
      />
      {tabs.slice(1).map((_, gap) => (
        <span
          key={gap}
          className={classes(
            'pane-tab-line',
            (chosen === gap || chosen === gap + 1) && 'hidden',
          )}
          style={{ left: 3 + item * (gap + 1) - 0.5 }}
        />
      ))}
      {tabs.map((tab, at) => (
        <button
          key={tab.section}
          type="button"
          role="tab"
          className={classes('pane-tab', chosen === at && 'chosen')}
          style={{ width: item }}
          title={tab.name}
          aria-label={tab.name}
          aria-selected={chosen === at}
          onClick={() => choose(tab.section)}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {tabGlyphs[tab.glyph]}
            </g>
          </svg>
        </button>
      ))}
    </div>
  )
}

// MARK: Profile

/**
 * Profile (`ProfileBody`): Name, Title (not for a group) and Description,
 * each a grey label (13/16) over its words (15/20) on a hairline that turns
 * to the words' colour while the field has the keys. A field is saved when
 * it lets go of the keys (Return does that for one line; in the description
 * Return is a new line); Escape puts the stored words back. An empty name
 * is not saved. The Chief of Staff's title and description are read only.
 * Then, for an agent, Notifications, 22 below.
 */
function ProfileBody({ store, agent }: { store: AppStore; agent: Agent }) {
  const locked = chiefOfStaff(store.agents)?.id === agent.id
  const save = (fields: {
    name?: string
    description?: string
    title?: string
  }) => {
    const current = store.agent(agent.id) ?? agent
    void store.saveProfileField(
      agent.id,
      fields.name ?? current.name,
      fields.description ?? current.description,
      fields.title,
    )
  }
  return (
    <div className="profile-body">
      <div className="profile-fields">
        <PaneLineField
          label={t('Name')}
          placeholder={t('Bob')}
          stored={agent.name}
          first
          readOnly={false}
          required
          accessibility={t`Agent ${t('Name').toLowerCase()}`}
          commit={(name) => save({ name })}
        />
        {!agent.isGroup && (
          <PaneLineField
            label={t('Title')}
            placeholder={t('Describe what your agent does')}
            stored={locked ? shownTitle(agent) : agent.title}
            first={false}
            readOnly={locked}
            required={false}
            accessibility={t`Agent ${t('Title').toLowerCase()}`}
            commit={(title) => save({ title })}
          />
        )}
        <PaneDescriptionField
          stored={
            locked && !agent.isGroup
              ? shownDescription(agent)
              : agent.description
          }
          readOnly={locked && !agent.isGroup}
          commit={(description) => save({ description })}
        />
      </div>
      {!agent.isGroup && <NotificationsCard store={store} agent={agent} />}
    </div>
  )
}

/** A field's grey label (`PaneLabel`): 13/16, 14 above (none for the first) and 2 below. */
function PaneLabel({
  text,
  first,
  htmlFor,
}: {
  text: string
  first: boolean
  htmlFor?: string
}) {
  return (
    <label
      className={classes('pane-label', first && 'first')}
      htmlFor={htmlFor}
    >
      {text}
    </label>
  )
}

/**
 * Words kept by a field until it lets go of the keys (`PaneLineField`'s
 * `draft` and `sent`): the stored words again whenever they change and the
 * field doesn't have the keys; what was last sent, so letting go twice
 * sends once.
 */
function useDraft(stored: string) {
  const [draft, setDraft] = useState(stored)
  const [focused, setFocused] = useState(false)
  const [seen, setSeen] = useState(stored)
  const [sent, setSent] = useState<string>()
  if (seen !== stored) {
    setSeen(stored)
    setSent(undefined)
    if (!focused) setDraft(stored)
  }
  // Escape gives the stored words back: the letting go that follows saves nothing.
  const cancelledRef = useRef(false)
  return { draft, setDraft, focused, setFocused, sent, setSent, cancelledRef }
}

/** A one-line field (`PaneLineField`): 4 above and 12 below its words, its hairline under them. */
function PaneLineField({
  label,
  placeholder,
  stored,
  first,
  readOnly,
  required,
  accessibility,
  commit,
}: {
  label: string
  placeholder: string
  stored: string
  first: boolean
  readOnly: boolean
  /** The name: empty, it goes back to what it was. */
  required: boolean
  accessibility: string
  commit: (value: string) => void
}) {
  const { draft, setDraft, focused, setFocused, sent, setSent, cancelledRef } =
    useDraft(stored)
  const box = useRef<HTMLInputElement>(null)
  // Let go of the keys: trimmed; unchanged, nothing; an empty name goes back.
  const done = (words: string) => {
    const value = words.trim()
    if (value === stored || (required && value === '')) {
      setDraft(stored)
      return
    }
    setDraft(value)
    if (value === sent) return
    setSent(value)
    commit(value)
  }
  // Closed or another agent opened while it held the keys: saved as letting go would.
  const latest = useRef({ focused, draft, done })
  useLayoutEffect(() => {
    latest.current = { focused, draft, done }
  })
  useEffect(
    () => () => {
      if (latest.current.focused && !readOnly)
        latest.current.done(latest.current.draft)
    },
    [readOnly],
  )
  return (
    <div className="pane-field">
      <PaneLabel text={label} first={first} />
      {readOnly ? (
        <div
          className={classes(
            'pane-line',
            'read-only',
            stored === '' && 'empty',
          )}
        >
          {stored === '' ? placeholder : stored}
        </div>
      ) : (
        <input
          ref={box}
          className={classes('pane-line', focused && 'focused')}
          value={draft}
          placeholder={placeholder}
          aria-label={accessibility}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (windowLetGo()) return
            setFocused(false)
            if (cancelledRef.current) {
              cancelledRef.current = false
              return
            }
            done(draft)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') {
              event.preventDefault()
              box.current?.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(stored)
              cancelledRef.current = true
              box.current?.blur()
            }
          }}
        />
      )}
    </div>
  )
}

/**
 * The description (`PaneDescriptionField`): it grows with its words, then
 * scrolls; Return is a new line; it is saved when it lets go of the keys,
 * and Escape puts the stored words back.
 */
function PaneDescriptionField({
  stored,
  readOnly,
  commit,
}: {
  stored: string
  readOnly: boolean
  commit: (value: string) => void
}) {
  const { draft, setDraft, focused, setFocused, sent, setSent, cancelledRef } =
    useDraft(stored)
  const done = (words: string) => {
    if (readOnly) return
    const value = words.trim()
    if (value === stored) {
      setDraft(stored)
      return
    }
    setDraft(value)
    if (value === sent) return
    setSent(value)
    commit(value)
  }
  const latest = useRef({ focused, draft, done })
  useLayoutEffect(() => {
    latest.current = { focused, draft, done }
  })
  useEffect(
    () => () => {
      if (latest.current.focused) latest.current.done(latest.current.draft)
    },
    [],
  )
  return (
    <div className="pane-field">
      <PaneLabel text={t('Description')} first={false} />
      <PaneTextArea
        value={draft}
        readOnly={readOnly}
        focused={focused}
        placeholder={t('What this agent is for')}
        accessibility={t('Agent description')}
        change={setDraft}
        focus={(now) => {
          setFocused(now)
          if (now) return
          if (cancelledRef.current) {
            cancelledRef.current = false
            return
          }
          done(draft)
        }}
        cancel={() => {
          setDraft(stored)
          cancelledRef.current = true
        }}
      />
    </div>
  )
}

/**
 * The description's words (and a routine's instruction): a text area with
 * no box, growing with its words from one line (27) to 143, then
 * scrolling; Escape gives the stored words back and lets go of the keys;
 * ⌘Return (Control-Return elsewhere) when asked for.
 */
export function PaneTextArea({
  value,
  readOnly,
  focused,
  placeholder,
  accessibility,
  change,
  focus,
  cancel,
  commandReturn,
  className,
  autoFocus,
}: {
  value: string
  readOnly: boolean
  focused: boolean
  placeholder: string
  accessibility: string
  change: (value: string) => void
  focus: (focused: boolean) => void
  cancel: () => void
  commandReturn?: () => void
  className?: string
  autoFocus?: boolean
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  // Its height follows its words: measured at no height, then set.
  useEffect(() => {
    const element = box.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [value])
  useEffect(() => {
    if (!autoFocus) return
    const element = box.current
    if (!element) return
    element.focus()
    element.setSelectionRange(element.value.length, element.value.length)
  }, [autoFocus])
  return (
    <textarea
      ref={box}
      className={classes('pane-text', focused && 'focused', className)}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={accessibility}
      rows={1}
      spellCheck={false}
      onChange={(event) => change(event.target.value)}
      onFocus={() => focus(true)}
      onBlur={() => {
        if (!windowLetGo()) focus(false)
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
          box.current?.blur()
          return
        }
        const command = /Mac|iPhone|iPad/.test(navigator.platform)
          ? event.metaKey
          : event.ctrlKey
        if (commandReturn && event.key === 'Enter' && command) {
          event.preventDefault()
          commandReturn()
        }
      }}
    />
  )
}

/**
 * Notifications (`NotificationsCard`): a 40 tile (round 11, the pane's
 * fill) with the bell, "Notifications" over "Get notified when this agent
 * finishes or needs input", and the switch at the right; 14 apart.
 */
function NotificationsCard({
  store,
  agent,
}: {
  store: AppStore
  agent: Agent
}) {
  const [saving, setSaving] = useState(false)
  return (
    <div className="notifications-card">
      <span className="notifications-tile">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.5 1.6H4.7z M10 20.2a2.1 2.1 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="notifications-words">
        <span className="notifications-title">{t('Notifications')}</span>
        <span className="notifications-line">
          {t('Get notified when this agent finishes or needs input')}
        </span>
      </span>
      <PaneSwitch
        on={agent.notifyOnUpdates}
        disabled={saving}
        label={t('Notifications')}
        change={(on) => {
          setSaving(true)
          void store.setNotify(agent.id, on).finally(() => setSaving(false))
        }}
      />
    </div>
  )
}

/** The Mac's small switch, the window's blue when on. */
export function PaneSwitch({
  on,
  disabled,
  label,
  change,
}: {
  on: boolean
  disabled?: boolean
  label: string
  change: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      className={classes('pane-switch', on && 'on')}
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => change(!on)}
    >
      <span className="pane-switch-thumb" />
    </button>
  )
}

/**
 * Whether a field's blur is the window's, not the field's: another app or
 * tab came forward. The field keeps its words and the keys, as a Mac field
 * keeps its focus while its app is in the background; it is saved when it
 * really lets go.
 */
export function windowLetGo(): boolean {
  return !document.hasFocus()
}
