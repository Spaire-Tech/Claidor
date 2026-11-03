// The card that asks to use this PC (mac/Simeon/MacLocalPermission.swift's
// `LocalAskDock`; the window's `LLn`), 8 over the message field and as wide
// (`BLn`), drawn as the chat's approval card (the founder, 22 October 2026:
// "not using our design"): "Allow Simeon and all agents to run commands on
// your local computer?" (one title for every ask) with "Approval needed" in
// blue, its × (Deny once, also Escape), the line under it, then Always allow
// in the blue, Allow once and Never. An answer greys the buttons until the
// computer's own copy settles the ask; one that fails says so in red and can
// be tried again. Always allow waits for the team's policy and is off below
// "Always allow". In the Windows app only (the store's `localAsk`).

import { useEffect, useRef, useState } from 'react'
import {
  alwaysBlocked,
  LocalToolAsk,
  type LocalAsk,
  type LocalAskResolution,
} from '../core/localAsk'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { ApprovalNeededBadge, CardButton } from './Cards'
import { somethingOver } from './Dialogs'
import './LocalAskDock.css'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The message field of the chat on screen, which takes the keys back after an answer (`WindowState.composerFocus`). */
function messageField(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    '.chat-area .composer textarea.field',
  )
}

/** A field has the keys (the Mac's `firstResponder is NSText`): Escape is its own then. */
function fieldHasKeys(): boolean {
  const focused = document.activeElement
  return (
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement ||
    focused instanceof HTMLSelectElement ||
    (focused instanceof HTMLElement && focused.isContentEditable)
  )
}

/** The dock over the composer: the agent's first waiting ask, one card for it (a new ask, a new card). */
export function LocalAskDock({
  store,
  agentId,
}: {
  store: AppStore
  agentId: string
}) {
  useWatched(store)
  const ask = store.localAsk(agentId)
  if (!ask) return null
  return (
    <LocalAskCard key={ask.entryId} store={store} ask={ask} agentId={agentId} />
  )
}

function LocalAskCard({
  store,
  ask,
  agentId,
}: {
  store: AppStore
  ask: LocalAsk
  agentId: string
}) {
  const model = useWindowModel()
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)
  const enabled = !submitting && store.localAskAnswerable
  const blocked = alwaysBlocked(store.localCeilingKnown, store.localCeiling)
  const always = enabled && blocked === undefined

  const answer = (resolution: LocalAskResolution) => {
    if (submitting) return
    setSubmitting(true)
    setFailed(false)
    void store.answerLocalAsk(ask, agentId, resolution).then((sent) => {
      if (sent) {
        // The message field takes the keys back (the window leaves them nowhere); the computer's copy settles the ask.
        messageField()?.focus()
        return
      }
      setSubmitting(false)
      setFailed(true)
    })
  }
  const latest = useRef(answer)
  const enabledNow = useRef(enabled)
  useEffect(() => {
    latest.current = answer
    enabledNow.current = enabled
  })

  // Escape denies once: not repeated, no modifier, and not while a field has the keys (its own Escape: a reply let go)
  // or anything stands over the chat (a sheet, a picture or file, the org chart, an avatar being made). The pane's own
  // Escape waits while the card shows (AgentPane.tsx), as the Mac's window does.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat
      )
        return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (
        somethingOver() ||
        model.orgChart ||
        model.avatarEditorFor !== undefined
      )
        return
      if (fieldHasKeys() || !enabledNow.current) return
      event.preventDefault()
      latest.current('deny')
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [model])

  return (
    <div
      className="card-shell approval-card local-ask"
      role="group"
      aria-label={t('Local tool permission')}
    >
      <div className="approval-words">
        <div className="approval-head">
          <span className="approval-title">{LocalToolAsk.title()}</span>
          <ApprovalNeededBadge />
          <button
            type="button"
            className="card-close local-ask-close"
            aria-label={LocalToolAsk.denyOnce()}
            title={LocalToolAsk.denyOnceTooltip()}
            disabled={!enabled}
            onClick={() => answer('deny')}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="local-ask-description">
          {LocalToolAsk.description()}
        </div>
        {failed && (
          <div className="local-ask-failure" role="alert">
            {LocalToolAsk.failure()}
          </div>
        )}
      </div>
      <div className="card-buttons">
        {/* The disabled button's words still show on hover, as the window wraps it. */}
        <span className="local-ask-always" title={blocked ?? undefined}>
          <CardButton
            title={t('Always allow')}
            prominent
            disabled={!always}
            onClick={() => answer('always')}
          />
        </span>
        <CardButton
          title={t('Allow once')}
          disabled={!enabled}
          onClick={() => answer('allow-once')}
        />
        <CardButton
          title={t('Never')}
          disabled={!enabled}
          onClick={() => answer('never')}
        />
      </div>
    </div>
  )
}
