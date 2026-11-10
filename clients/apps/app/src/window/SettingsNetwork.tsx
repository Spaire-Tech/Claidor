// Settings › Network (mac/Simeon/SettingsNetwork.swift, 10 November 2026,
// the founder, with Reason Network as the reference: "do the reason
// network"): the person's Simeon Network, where their agents and the agents
// of the people on it ask each other for work (simeonlabs.com/docs/network).
//
// - The network by its name, its invite line with Copy, and New Link (the
//   old line stops working).
// - People: each person on it, then their Simeon agents (always on) and the
//   agents of theirs that reached the network over MCP in the last day, with
//   where they work and whether they are busy, idle or away.
// - Join a Network: an invite line pasted, whose network it is asked first,
//   then Join (the person leaves the one they are on). The website's join
//   page hands its invite over (`#network-join=`, `keepAskedJoin`): the page
//   opens on it, pasted and asked.
// - Your coding agents: the line that adds Simeon to the coding agents on a
//   computer, and the MCP address for any other, each with Copy.
// - Rename Network, Leave Network (when others are on it, asked first) and
//   How the Simeon Network works.
//
// The model is the core's (`core/network.ts`, SimeonCore's `NetworkModel`).

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type NetworkInvitePreview,
  NetworkModel,
  type NetworkPerson,
  type NetworkSession,
  type NetworkSnapshot,
  initial,
  networkDocs,
  networkInstall,
  networkMcp,
  takeAskedJoin,
  whereabouts,
} from '../core/network'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { copyText } from './clipboard'
import { Alert } from './Dialogs'
import './SettingsNetwork.css'
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsLine,
  SettingsLinkRow,
  SettingsPill,
  SettingsSymbol,
  type SettingsSymbolName,
} from './SettingsParts'
import { useWatched } from './useStore'

/** What went wrong, in the person's words. */
function words(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function SettingsNetworkPage({ store }: { store: AppStore }) {
  const [model] = useState(() => new NetworkModel(store.credentialsCall))
  useWatched(model)
  const [copied, setCopied] = useState<string>()
  const [pasted, setPasted] = useState('')
  const [invite, setInvite] = useState<NetworkInvitePreview>()
  const [joinRefused, setJoinRefused] = useState<string>()
  const [renaming, setRenaming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [refused, setRefused] = useState<string>()
  const [busy, setBusy] = useState(false)
  // One change at a time, whatever React has drawn yet.
  const going = useRef(false)

  /** Whose network the line is for, asked before joining it. */
  const preview = (line: string) => {
    if (going.current) return
    going.current = true
    setJoinRefused(undefined)
    setBusy(true)
    model
      .preview(line)
      .then(setInvite, (error: unknown) => setJoinRefused(words(error)))
      .finally(() => {
        going.current = false
        setBusy(false)
      })
  }

  /** A change said to the server; the page shows the network as it answers, or what went wrong. */
  const act = (change: () => Promise<void>) => {
    if (going.current) return
    going.current = true
    setBusy(true)
    change()
      .catch((error: unknown) => setRefused(words(error)))
      .finally(() => {
        going.current = false
        setBusy(false)
      })
  }

  useEffect(() => {
    void model.load()
    // The website's join page's invite: pasted, and whose network it is asked.
    const asked = takeAskedJoin()
    if (asked) {
      setPasted(asked)
      preview(asked)
    }
    // Once, as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const copy = (text: string, key: string) => {
    void copyText(text).then(() => {
      setCopied(key)
      window.setTimeout(
        () => setCopied((now) => (now === key ? undefined : now)),
        1600,
      )
    })
  }
  const copyPill = (text: string, key: string) => (
    <SettingsPill
      title={copied === key ? t('Copied') : t('Copy')}
      onClick={() => copy(text, key)}
    />
  )

  const snapshot = model.snapshot
  return (
    <div className="network-page">
      <p className="network-lead">
        {t(
          'Your agents and the agents of the people on your network ask each other for work.',
        )}
      </p>
      {snapshot ? (
        <Loaded
          snapshot={snapshot}
          busy={busy}
          copyPill={copyPill}
          newLink={() => act(() => model.newLink())}
          rename={() => setRenaming(true)}
          leave={() => setLeaving(true)}
          join={
            <SettingsGroup
              title={t('Join a Network')}
              footer={joinRefused}
              footerTint="var(--danger)"
            >
              <form
                className="network-join"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault()
                  if (pasted.trim() !== '') preview(pasted)
                }}
              >
                <input
                  className="network-join-field"
                  value={pasted}
                  placeholder={t('Paste an invite line')}
                  aria-label={t('Paste an invite line')}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setPasted(event.target.value)}
                />
                <button
                  type="submit"
                  className="settings-pill"
                  disabled={pasted.trim() === '' || busy}
                >
                  {t('Join')}
                </button>
              </form>
            </SettingsGroup>
          }
        />
      ) : model.problem ? (
        <SettingsGroup>
          <SettingsLine label={model.problem} labelTint="var(--danger)">
            <SettingsPill
              title={t('Try Again')}
              onClick={() => void model.load()}
            />
          </SettingsLine>
        </SettingsGroup>
      ) : (
        <div className="network-loading">
          <span className="settings-spinner" role="progressbar" />
        </div>
      )}
      {invite && (
        <Alert
          title={t`Join “${invite.name}”?`}
          message={t(
            'Your agents and theirs will see each other and ask each other for work. You’ll leave the network you’re on.',
          )}
          action={t('Join')}
          cancel={t('Cancel')}
          onAction={() => {
            const line = pasted
            setInvite(undefined)
            act(async () => {
              await model.join(line)
              setPasted('')
            })
          }}
          onCancel={() => setInvite(undefined)}
        />
      )}
      {renaming && snapshot && (
        <RenameAlert
          name={snapshot.name}
          rename={(name) => {
            setRenaming(false)
            const trimmed = name.trim()
            if (trimmed !== '') act(() => model.rename(trimmed))
          }}
          cancel={() => setRenaming(false)}
        />
      )}
      {leaving && (
        <Alert
          title={t('Leave this network?')}
          message={t(
            'Your agents leave it, and you get a network of your own.',
          )}
          action={t('Leave')}
          destructive
          cancel={t('Cancel')}
          onAction={() => {
            setLeaving(false)
            act(() => model.leave())
          }}
          onCancel={() => setLeaving(false)}
        />
      )}
      {refused && (
        <Alert
          title={refused}
          message=""
          action={t('Done')}
          onAction={() => setRefused(undefined)}
        />
      )}
    </div>
  )
}

/** The network read: its groups, in the Mac's order. */
function Loaded({
  snapshot,
  busy,
  copyPill,
  newLink,
  rename,
  leave,
  join,
}: {
  snapshot: NetworkSnapshot
  busy: boolean
  copyPill: (text: string, key: string) => ReactNode
  newLink: () => void
  rename: () => void
  leave: () => void
  join: ReactNode
}) {
  return (
    <>
      <SettingsGroup
        title={snapshot.name}
        footer={t(
          'Anyone with this line can join. New Link stops the old one.',
        )}
      >
        <SettingsLine label={t('Invite line')} detail={snapshot.invite}>
          {copyPill(snapshot.invite, 'invite')}
        </SettingsLine>
        <SettingsActionRow
          title={t('New Link')}
          divided
          busy={busy}
          onClick={newLink}
        />
      </SettingsGroup>
      <SettingsGroup title={t('People')}>
        {snapshot.people.map((person, index) => (
          <PersonRows key={person.handle} person={person} divided={index > 0} />
        ))}
      </SettingsGroup>
      {join}
      <SettingsGroup title={t('Your coding agents')}>
        <SettingsLine label={t('On your computer')} detail={networkInstall}>
          {copyPill(networkInstall, 'install')}
        </SettingsLine>
        <SettingsLine label={t('Any other agent')} detail={networkMcp} divided>
          {copyPill(networkMcp, 'mcp')}
        </SettingsLine>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsActionRow title={t('Rename Network')} onClick={rename} />
        {snapshot.people.length > 1 && (
          <SettingsActionRow
            title={t('Leave Network')}
            destructive
            divided
            onClick={leave}
          />
        )}
        <SettingsLinkRow
          label={t('How the Simeon Network works')}
          divided
          external
          onClick={() =>
            window.open(networkDocs, '_blank', 'noopener,noreferrer')
          }
        />
      </SettingsGroup>
    </>
  )
}

/** The symbol of a session's kind: a chat for the hosted assistants, a terminal for the coding agents. */
function symbolOf(kind: string): SettingsSymbolName {
  if (['dots', 'muse', 'grok-bot', 'claude'].includes(kind)) return 'bubbleLeft'
  if (kind === 'agent') return 'hexagonGrid'
  return 'terminal'
}

function statusOf(status: NetworkSession['status']): string {
  if (status === 'busy') return t('Busy')
  if (status === 'idle') return t('Idle')
  return t('Away')
}

/**
 * One person on the network: their initial and name over their handle,
 * "You" for the person themselves; then each Simeon agent of theirs, always
 * on, and each session seen in the last day, with where it works and a dot:
 * green idle, orange busy, grey away.
 */
function PersonRows({
  person,
  divided,
}: {
  person: NetworkPerson
  divided: boolean
}) {
  return (
    <div className={divided ? 'network-person divided' : 'network-person'}>
      <div className="network-person-line">
        <span className="network-initial" aria-hidden="true">
          {initial(person)}
        </span>
        <span className="network-words">
          <span className="network-name">{person.name}</span>
          <span className="network-detail">{person.handle}</span>
        </span>
        {person.you && <span className="network-you">{t('You')}</span>}
      </div>
      {person.agents.map((agent) => (
        <AgentRow
          key={agent.id}
          symbol="personCropCircle"
          name={agent.name}
          detail={agent.role}
          status={t('Always on')}
          dot="idle"
        />
      ))}
      {person.sessions.map((session) => (
        <AgentRow
          key={session.id}
          symbol={symbolOf(session.kind)}
          name={session.name}
          detail={[whereabouts(session), session.doing]
            .filter((one) => one)
            .join(' — ')}
          status={statusOf(session.status)}
          dot={session.status}
        />
      ))}
    </div>
  )
}

/** An agent under its person: its symbol, its name over what it does or where it works, its state at the end. */
function AgentRow({
  symbol,
  name,
  detail,
  status,
  dot,
}: {
  symbol: SettingsSymbolName
  name: string
  detail?: string
  status: string
  dot: NetworkSession['status']
}) {
  return (
    <div className="network-agent">
      <span className="network-agent-symbol">
        <SettingsSymbol name={symbol} size={14} />
      </span>
      <span className="network-words">
        <span className="network-name">{name}</span>
        {detail && <span className="network-detail">{detail}</span>}
      </span>
      <span className="network-status">
        <span className={`network-dot ${dot}`} aria-hidden="true" />
        {status}
      </span>
    </div>
  )
}

/** Rename Network: the window's alert with its name in a field, Save (Return) and Cancel (Escape). */
function RenameAlert({
  name: was,
  rename,
  cancel,
}: {
  name: string
  rename: (name: string) => void
  cancel: () => void
}) {
  const [name, setName] = useState(was)
  const field = useRef<HTMLInputElement>(null)
  const latest = useRef(cancel)
  useEffect(() => {
    latest.current = cancel
  })
  // The field takes the keys, its words picked; they go back to what had them.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    field.current?.focus()
    field.current?.select()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [])
  // Escape over the window, before anything under it (Settings' own).
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const title = t('Rename Network')
  return (
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <form
        className="alert"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault()
          rename(name)
        }}
      >
        <img
          className="alert-mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          aria-hidden="true"
        />
        <div className="alert-title">{title}</div>
        <input
          ref={field}
          className="network-alert-field"
          value={name}
          placeholder={t('Network name')}
          aria-label={t('Network name')}
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="alert-buttons">
          <button type="button" className="alert-button" onClick={cancel}>
            {t('Cancel')}
          </button>
          <button type="submit" className="alert-button default">
            {t('Save')}
          </button>
        </div>
      </form>
    </div>
  )
}
