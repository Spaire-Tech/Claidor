// An agent's channels in its pane (mac/Simeon/ChannelsPage.swift, O01,
// `_0n`): Discord and Slack, a bot the person owns, run from the agent's
// computer; "Channels" in ⌘K and "/", no tab of its own. In Settings' parts
// (the founder, 28 October 2026: "this isn't our Apple design… too many
// words"): one card, a row per platform, as the Connectors list draws an
// app. Connecting is the bot's token, pasted here and kept by the computer;
// nothing opens elsewhere. What the rows say is channels.ts'; the calls are
// the store's. Drawn by AgentPane.tsx.

import { useEffect, useRef, useState } from 'react'
import {
  type ChannelManifest,
  type ChannelsView,
  type RowState,
  channelPlaceholder,
  channelSubtitle,
  noChannels,
  rowState,
} from '../core/channels'
import { comingSoonWord, connectedWord } from '../core/connectCards'
import { t as coreT } from '../core/l10n'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import './ChannelsMembers.css'
import { classes } from './classes'
import { AppLogoTile } from './ConnectCards'
import { reopenGap } from './GroupMembers'
import { PaneMenu } from './PaneMenu'
import { useWatched } from './useStore'

/**
 * An agent's channels as its computer last answered (`ChannelsModel`, the
 * window's channels store `I$n`): read when the page shows, every 4 s while
 * it does and when the window comes forward, 15 s at most, a failed read
 * keeping the last answer; Connect, Disconnect and Refresh put their answer
 * in place, then read again.
 */
class ChannelsModel {
  private listeners = new Set<() => void>()
  private version = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  view?: ChannelsView
  /** Calls under way per platform: its row's buttons and menu wait while any is. */
  private busy = new Map<string, number>()
  /** Each read and call numbered as it starts: an answer older than the one shown is dropped (the 4 s reads, the window coming forward and a call's own answer overlap). */
  private issued = 0
  private shown = 0

  constructor(
    private readonly store: AppStore,
    readonly agentId: string,
  ) {}

  async load(): Promise<void> {
    this.issued += 1
    const number = this.issued
    this.apply(await this.store.channels(this.agentId), number)
  }

  private apply(next: ChannelsView | undefined, number: number): void {
    if (!next || number <= this.shown) return
    this.shown = number
    this.view = next
    this.changed()
  }

  isBusy(platform: string): boolean {
    return (this.busy.get(platform) ?? 0) > 0
  }

  /** A call for one platform, then a read; its row waits meanwhile. */
  async run(
    platform: string,
    call: () => Promise<ChannelsView | undefined>,
  ): Promise<void> {
    this.busy.set(platform, (this.busy.get(platform) ?? 0) + 1)
    this.changed()
    this.issued += 1
    const number = this.issued
    this.apply(await call(), number)
    this.busy.set(platform, (this.busy.get(platform) ?? 1) - 1)
    this.changed()
    await this.load()
  }
}

/** Channels (`ChannelsBody`): the card of platforms, "No connectors available." when the computer offers none, nothing until it has answered. */
export function ChannelsBody({
  store,
  agent,
}: {
  store: AppStore
  agent: Agent
}) {
  const [model] = useState(() => new ChannelsModel(store, agent.id))
  useWatched(model)
  // Read now and every 4 s after each answer while the page shows, and when the window comes forward.
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const loop = async () => {
      await model.load()
      if (live) timer = setTimeout(() => void loop(), 4_000)
    }
    void loop()
    const forward = () => void model.load()
    window.addEventListener('focus', forward)
    return () => {
      live = false
      clearTimeout(timer)
      window.removeEventListener('focus', forward)
    }
  }, [model])
  const view = model.view
  return (
    <div className="channels-body">
      {view &&
        (view.manifests.length === 0 ? (
          <div className="channels-none">{noChannels()}</div>
        ) : (
          <div className="channels-card">
            {view.manifests.map((manifest, index) => (
              <ChannelRow
                key={manifest.platform}
                store={store}
                agentId={agent.id}
                manifest={manifest}
                view={view}
                model={model}
                divided={index > 0}
              />
            ))}
          </div>
        ))}
    </div>
  )
}

/**
 * A field a token is pasted in (the Mac's `SecureField`): masked, and never
 * offered the person's saved logins by the browser or a password manager
 * (the token goes to the agent's computer). Left to the browser, not
 * React's state, so what is pasted is never copied into the page's HTML;
 * read once, when it is sent, and emptied then (the secret card's way,
 * step 3b).
 */
const tokenField = {
  type: 'password',
  autoComplete: 'new-password',
  autoCapitalize: 'none',
  spellCheck: false,
  defaultValue: '',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const

/**
 * A platform, as a Connectors row (`ChannelRow`): its app icon (36), its
 * name over a few words in grey (red when it went wrong), and its mark: +
 * to connect, the green tick, the spinner while it connects, Coming soon
 * said quietly, Reconnect when it went wrong. A connection's "…" (Refresh,
 * Disconnect) shows under the pointer. + opens the token's field in the
 * card, with Cancel and Save.
 */
function ChannelRow({
  store,
  agentId,
  manifest,
  view,
  model,
  divided,
}: {
  store: AppStore
  agentId: string
  manifest: ChannelManifest
  view: ChannelsView
  model: ChannelsModel
  divided: boolean
}) {
  const state = rowState(view, manifest)
  const busy = model.isBusy(manifest.platform)
  const [formOpen, setFormOpen] = useState(false)
  /** Only whether the field holds more than spaces, for Save; never what. */
  const [blank, setBlank] = useState(true)
  const field = useRef<HTMLInputElement>(null)
  const [menuUnder, setMenuUnder] = useState<HTMLElement>()
  const menuClosed = useRef(0)
  const platform = manifest.platform
  const hasMenu =
    state.kind === 'connected' ||
    state.kind === 'connecting' ||
    state.kind === 'error'

  /** + and Reconnect open the field, which takes the keys as it appears. */
  const openForm = () => {
    setBlank(true)
    setFormOpen(true)
  }
  useEffect(() => {
    if (formOpen) field.current?.focus()
  }, [formOpen])

  /** The token goes once, the field emptied and shut; the row changes with the computer's answer. */
  const save = () => {
    const box = field.current
    const value = box?.value ?? ''
    if (value.trim() === '' || model.isBusy(platform)) return
    if (box) box.value = ''
    setBlank(true)
    setFormOpen(false)
    void model.run(platform, () =>
      store.connectChannel(agentId, platform, value),
    )
  }

  const menuItems = () => {
    const items = []
    if (state.kind === 'connected' || state.kind === 'connecting')
      items.push({
        label: t('Refresh'),
        icon: <RowGlyph name="refresh" />,
        disabled: busy,
        action: () =>
          void model.run(platform, () =>
            store.refreshChannel(agentId, platform),
          ),
      })
    items.push({
      label: t('Disconnect'),
      icon: <RowGlyph name="plug" danger />,
      disabled: busy,
      action: () =>
        void model.run(platform, () =>
          store.disconnectChannel(agentId, platform),
        ),
    })
    return items
  }

  return (
    <div className={classes('channel-row', divided && 'divided')}>
      <div className="channel-line">
        <AppLogoTile name={manifest.displayName} side={36} id={platform} />
        <div
          className={classes(
            'channel-words',
            state.kind === 'comingSoon' && 'soon',
          )}
        >
          <span className="channel-name">{manifest.displayName}</span>
          <span
            className={classes(
              'channel-detail',
              state.kind === 'error' && 'error',
            )}
          >
            {channelSubtitle(view, manifest)}
          </span>
        </div>
        {hasMenu && (
          <button
            type="button"
            className={classes('channel-more', menuUnder && 'open')}
            aria-label={t('Connection actions')}
            aria-haspopup="menu"
            aria-expanded={menuUnder !== undefined}
            onClick={(event) => {
              if (Date.now() - menuClosed.current < reopenGap) return
              setMenuUnder(event.currentTarget)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3.2 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM8 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM12.8 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        <Mark
          state={state}
          busy={busy}
          name={manifest.displayName}
          formOpen={formOpen}
          openForm={openForm}
        />
      </div>
      {formOpen && state.kind !== 'comingSoon' && (
        <div className="channel-form">
          <input
            ref={field}
            {...tokenField}
            className="channel-token"
            placeholder={channelPlaceholder(manifest)}
            aria-label={channelPlaceholder(manifest)}
            onChange={(event) => setBlank(event.target.value.trim() === '')}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              save()
            }}
          />
          <SettingsPill
            title={t('Cancel')}
            onClick={() => {
              if (field.current) field.current.value = ''
              setBlank(true)
              setFormOpen(false)
            }}
          />
          <SettingsPill
            title={t('Save')}
            disabled={blank || busy}
            onClick={save}
          />
        </div>
      )}
      {menuUnder && (
        <PaneMenu
          under={menuUnder}
          label={t('Connection actions')}
          close={() => {
            menuClosed.current = Date.now()
            setMenuUnder(undefined)
          }}
          items={menuItems()}
        />
      )}
    </div>
  )
}

/** The row's end (`mark`): +, the tick, the spinner, Coming soon, or Reconnect. */
function Mark({
  state,
  busy,
  name,
  formOpen,
  openForm,
}: {
  state: RowState
  busy: boolean
  name: string
  formOpen: boolean
  openForm: () => void
}) {
  switch (state.kind) {
    case 'available':
      return busy ? (
        <AddingSpinner name={name} />
      ) : (
        <button
          type="button"
          className="channel-plus"
          disabled={formOpen}
          title={coreT('Connect')}
          aria-label={t`Connect ${name}`}
          onClick={openForm}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 2v12M2 8h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )
    case 'connected':
      return (
        <span
          className="channel-added"
          title={connectedWord()}
          role="img"
          aria-label={connectedWord()}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3 8.5 6.5 12l6.5-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )
    case 'connecting':
      return <AddingSpinner name={name} />
    case 'error':
      return (
        <SettingsPill
          title={t('Reconnect')}
          disabled={busy || formOpen}
          onClick={openForm}
        />
      )
    case 'comingSoon':
      return <span className="channel-soon">{comingSoonWord()}</span>
  }
}

/** While it connects (`AddingSpinner`, in the marks' 28 square): a 15 ring turning every 0.7 s, its bottom quarter fainter. */
function AddingSpinner({ name }: { name: string }) {
  return (
    <span
      className="channel-spinner"
      role="img"
      aria-label={t`Connecting ${name}`}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
        <circle className="channel-spinner-track" cx="7.5" cy="7.5" r="6.5" />
        <circle
          className="channel-spinner-arc"
          cx="7.5"
          cy="7.5"
          r="6.5"
          strokeDasharray={`${(Math.PI * 13 * 0.75).toFixed(2)} 100`}
          transform="rotate(135 7.5 7.5)"
        />
      </svg>
    </span>
  )
}

/** An action at a row's end, in words (`SettingsPill`, the reference's "Add"): 13 in the link blue, 80% under the pointer, greyed while it can't be pressed. */
function SettingsPill({
  title,
  disabled,
  onClick,
}: {
  title: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="channel-pill"
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  )
}

/** The menu's symbols: Refresh (`arrow.clockwise`), Disconnect (`powerplug`, red). */
function RowGlyph({
  name,
  danger,
}: {
  name: 'refresh' | 'plug'
  danger?: boolean
}) {
  return (
    <svg
      className={classes('channel-menu-glyph', danger && 'danger')}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d={
          name === 'refresh'
            ? 'M13.2 8.6A5.3 5.3 0 1 1 11.6 4M12.2 1.6v3.1H9.1'
            : 'M5.5 1.5v3M10.5 1.5v3M3.5 4.5h9V7a4.5 4.5 0 0 1-9 0ZM8 11.5v3'
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
