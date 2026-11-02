// A group's members, the whole of its Computer tab (`z2n`,
// mac/Simeon/PaneMembersFlight.swift's `GroupMembersBody`): "Members",
// then a row for each (its picture at 28 and its name; Remove at the right
// under the pointer), Add Member while there is room and someone to add,
// and a line under the list at six members or when no one is left. A row
// opens that agent's chat (the pane stays, on its Profile). The rules are
// groupMembers.ts'; the change is the store's (`setGroupMembers`). Drawn by
// AgentPane.tsx.

import { useRef, useState } from 'react'
import {
  adding,
  canRemove,
  candidates,
  membersFooter,
  removeFailed,
  removeTitle,
  removingWord,
  showsAdd,
  without,
} from '../core/groupMembers'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import './ChannelsMembers.css'
import { classes } from './classes'
import { Alert } from './Dialogs'
import { PaneMenu } from './PaneMenu'
import { useWindowModel } from './windowModel'

/** A click on the button whose menu it just closed opens nothing (the Mac's menu takes that click). */
export const reopenGap = 300

/** A group's members (`GroupMembersBody`). */
export function GroupMembersBody({
  store,
  group,
}: {
  store: AppStore
  group: Agent
}) {
  const model = useWindowModel()
  /** A change of the list on its way: Remove and Add Member wait (`isPending`). */
  const [pending, setPending] = useState(false)
  const [menuUnder, setMenuUnder] = useState<HTMLElement>()
  const menuClosed = useRef(0)
  /** Remove's question: for whom, while the change goes, and whether it was refused. */
  const [asking, setAsking] = useState<{
    member: Agent
    busy: boolean
    failed: boolean
  }>()
  const members = store.members(group)
  const offered = candidates(group, store.agents)
  const count = group.memberIds.length
  const footer = membersFooter(count, offered.length)
  const removable = canRemove(count, pending)

  /** Add Member's pick: added at the end; a refusal says nothing. */
  const add = (candidate: Agent) => {
    const current = store.agent(group.id)?.memberIds
    const next = current ? adding(candidate.id, current) : undefined
    if (!next) return
    setPending(true)
    store
      .setGroupMembers(group.id, next)
      .catch(() => {})
      .finally(() => setPending(false))
  }

  /** Remove in the question: the members as they are then; "Removing..." while it goes; a refusal keeps the question open with the window's words. */
  const remove = (member: Agent) => {
    const next = without(member.id, store.agent(group.id)?.memberIds ?? [])
    if (!next) {
      setAsking(undefined)
      return
    }
    setAsking({ member, busy: true, failed: false })
    setPending(true)
    store.setGroupMembers(group.id, next).then(
      () => {
        setPending(false)
        setAsking(undefined)
      },
      () => {
        setPending(false)
        setAsking({ member, busy: false, failed: true })
      },
    )
  }

  return (
    <div className="members-body" role="group" aria-label={t('Members')}>
      <div className="members-title">{t('Members')}</div>
      <div className="members-list">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            agents={store.agents}
            removable={removable}
            open={() => model.choose(member.id)}
            remove={() => setAsking({ member, busy: false, failed: false })}
          />
        ))}
        {showsAdd(count, offered.length) && (
          <button
            type="button"
            className="member-row member-add"
            disabled={pending}
            aria-label={t('Add Member')}
            aria-haspopup="menu"
            aria-expanded={menuUnder !== undefined}
            onClick={(event) => {
              if (Date.now() - menuClosed.current < reopenGap) return
              setMenuUnder(event.currentTarget)
            }}
          >
            <span className="member-add-plus">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <path
                  d="M6 1.5v9M1.5 6h9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="member-name">{t('Add Member')}</span>
          </button>
        )}
      </div>
      {footer !== undefined && <div className="members-footer">{footer}</div>}
      {menuUnder && (
        <PaneMenu
          under={menuUnder}
          label={t('Add Member')}
          close={() => {
            menuClosed.current = Date.now()
            setMenuUnder(undefined)
          }}
          items={offered.map((candidate) => ({
            label: candidate.name,
            icon: (
              <AgentMark agent={candidate} agents={store.agents} size={28} />
            ),
            tall: true,
            action: () => add(candidate),
          }))}
        />
      )}
      {asking && (
        <Alert
          title={removeTitle(asking.member.name)}
          message={asking.failed ? removeFailed() : ''}
          action={asking.busy ? removingWord() : t('Remove')}
          destructive
          busy={asking.busy}
          onAction={() => remove(asking.member)}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </div>
  )
}

/**
 * A member's row (`MemberRow`, `sand-group-member-row`): 40 high, padded 6
 * and 8, round 8, the grey under the pointer; its picture (28) and name
 * (12) open its chat; Remove (12, red on a red wash, 24 high, 6 round) is
 * always laid out, so the name's room never changes, and seen and pressable
 * only under the pointer. It is faint and can't be pressed with one member
 * left or a change on its way.
 */
function MemberRow({
  member,
  agents,
  removable,
  open,
  remove,
}: {
  member: Agent
  agents: readonly Agent[]
  removable: boolean
  open: () => void
  remove: () => void
}) {
  return (
    <div className="member-row">
      <button
        type="button"
        className="member-open"
        aria-label={t`Open ${member.name}'s chat`}
        onClick={open}
      >
        <AgentMark agent={member} agents={agents} size={28} />
        <span className="member-name">{member.name}</span>
      </button>
      <button
        type="button"
        className={classes('member-remove', !removable && 'off')}
        disabled={!removable}
        aria-label={t`Remove ${member.name}`}
        onClick={remove}
      >
        {t('Remove')}
      </button>
    </div>
  )
}
