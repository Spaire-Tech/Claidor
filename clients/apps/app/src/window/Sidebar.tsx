// The sidebar (mac/Simeon/Sidebar.swift, SidebarList.swift, and the roster's
// card and line in ComputerStates.swift): the head, "Can't reach your
// computer" when the list can't be read, and the agents' rows.
//
// Still to come, each with its screen (docs/web-app/PROGRESS.md): search and
// new chat in the head, the account and Connect apps in the foot, pins and
// folders, picking several rows, renaming in place, the right-click menu,
// dragging, the rail, the width dragged, Recover computer.

import { useEffect } from 'react'
import { listTime } from '../core/listTime'
import { type Agent, previewLine, shownTitle } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import { useWatched } from './useStore'

/** A row (`AgentRow`): the picture, the name, the title's tag, the time or the unread dot, the last line. */
export function AgentRow({
  agent,
  agents,
  open,
  onOpen,
}: {
  agent: Agent
  agents: readonly Agent[]
  open: boolean
  onOpen: () => void
}) {
  const titled = !agent.isGroup && agent.title !== ''
  const time = agent.hasUnread ? undefined : listTime(agent.lastActivityAt)
  const line = previewLine(agent)
  const side = 46
  return (
    <button
      type="button"
      className={open ? 'agent-row open' : 'agent-row'}
      onClick={onOpen}
      aria-label={
        agent.hasUnread ? t`${agent.name}, Unread activity` : agent.name
      }
      aria-current={open ? 'true' : undefined}
    >
      <span className={agent.isRunning ? 'agent-mark holed' : 'agent-mark'}>
        <AgentMark agent={agent} agents={agents} size={side} />
        {agent.isRunning && (
          <span
            className="working-dot"
            style={{ left: side - 10, top: side - 10 }}
          />
        )}
      </span>
      <span className={agent.hasUnread ? 'details unread' : 'details'}>
        <span className={titled ? 'first-line titled' : 'first-line'}>
          <span className="name">{agent.name}</span>
          {titled && <span className="title">{shownTitle(agent)}</span>}
          {time && <span className="time">{time}</span>}
        </span>
        {line !== '' && (
          <span className="preview" title={line} style={{ display: 'block' }}>
            {line}
          </span>
        )}
        {agent.hasUnread && <span className="unread-dot" />}
      </span>
    </button>
  )
}

/** "Can't reach your computer" over no list (`RosterCard`), with Retry; "Your computer isn't set up" for an account without access. */
function RosterCard({ store }: { store: AppStore }) {
  const blocked = store.accessBlocked
  return (
    <div className="roster-card" role="status">
      <div className="heading">
        {blocked
          ? t('Your computer isn’t set up')
          : t('Can’t reach your computer')}
      </div>
      <div>
        {blocked
          ? t(
              'Simeon can’t set up a computer for this account yet. Setup starts automatically once this account has access.',
            )
          : t('Your agents are safe — they just can’t be loaded right now.')}
      </div>
      {store.rosterRetrying ? (
        <div>{t('Retrying…')}</div>
      ) : (
        <button
          type="button"
          className="pill-button"
          onClick={() => void store.retryRoster()}
        >
          {t('Retry')}
        </button>
      )}
    </div>
  )
}

/** "Reconnecting to your computer…" over a list already shown (`RosterLine`), and a quiet Retry. */
function RosterLine({ store }: { store: AppStore }) {
  return (
    <div className="roster-line" role="status">
      <span>{t('Reconnecting to your computer…')}</span>
      <button
        type="button"
        className="quiet-button"
        disabled={store.rosterRetrying}
        onClick={() => void store.retryRoster()}
      >
        {store.rosterRetrying ? t('Retrying…') : t('Retry')}
      </button>
    </div>
  )
}

export function Sidebar({
  store,
  open,
  onOpen,
}: {
  store: AppStore
  open?: string
  onOpen: (id: string) => void
}) {
  useWatched(store)
  // Read again every 4 seconds while the list can't be read.
  const failed = store.rosterFailed
  useEffect(() => {
    if (!failed) return
    const timer = setInterval(() => {
      if (store.rosterFailed && !store.rosterRetrying) void store.reloadRoster()
    }, 4_000)
    return () => clearInterval(timer)
  }, [failed, store])
  const visible = store.agents.filter((agent) => !agent.isHidden)
  return (
    <nav className="sidebar">
      <div className="sidebar-head" />
      {store.rosterFailed &&
        (store.agents.length === 0 ? (
          <RosterCard store={store} />
        ) : (
          <RosterLine store={store} />
        ))}
      <div className="agent-list">
        {visible.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            agents={store.agents}
            open={open === agent.id}
            onOpen={() => onOpen(agent.id)}
          />
        ))}
      </div>
    </nav>
  )
}
