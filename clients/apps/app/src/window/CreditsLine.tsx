// The credits' line over the message field (mac/Simeon/Composer.swift's
// `creditsLine` and its reads; the core's Upgrade.swift `PhoneUpgrade.banner`,
// `approaching`, `ApproachingClosed`): as the iPhone's, not red. Spent, the
// week's or the trial's credits used, or the server's 402 on one of the open
// agent's notices; else near the limit (80%, then 95%), which the person can
// close until the next step, kept closed in the browser under the Mac's
// name. Its button opens Usage & Billing. It takes the access notice's place
// (step 5c's, ComputerStates.tsx) and its look; one of the two at a time, the
// notice first, as on the Mac.

import { useEffect, useRef, useState } from 'react'
import type { AppStore } from '../core/store'
import {
  approaching,
  approachingClosedAdding,
  approachingClosedHas,
  approachingClosedKey,
  creditsBanner,
} from '../core/upgrade'
import { shownSummary } from '../core/usage'
import { t } from '../l10n'
import './CreditsLine.css'
import { useWindowModel } from './windowModel'

/**
 * What the composer reads for the line (Composer.swift 156-160): the usage
 * as a chat opens and as each of its answers ends (at most every 30 s), so
 * the line shows in time; the computer's notices as a chat opens and when
 * the stream comes back (the Mac reads them as it connects and reconnects),
 * without waking a resting computer.
 */
export function useCreditsReads(store: AppStore, agentId: string): void {
  useEffect(() => {
    void store.loadUsage()
  }, [store, agentId])
  const running = store.agent(agentId)?.isRunningTurn ?? false
  const wasRunning = useRef(running)
  useEffect(() => {
    if (wasRunning.current && !running) void store.loadUsage()
    wasRunning.current = running
  }, [store, running])
  const live = store.isLive
  useEffect(() => {
    if (live) void store.loadTrays()
  }, [store, live, agentId])
}

/** The lines near the limit the person closed, as kept in the browser; none when it keeps nothing. */
function keptClosed(): string {
  try {
    return localStorage.getItem(approachingClosedKey) ?? ''
  } catch {
    return ''
  }
}

function keepClosed(kept: string): void {
  try {
    localStorage.setItem(approachingClosedKey, kept)
  } catch {
    // Not kept: it comes back with the next page.
  }
}

/**
 * The line: the title (13, 500) over what to do (12, at 60%) on the soft
 * grey, 14 round; the button in the app's ink; near the limit, × at its
 * end (10, semibold, the grey, 22 square), which fades it out in 0.15 s.
 */
export function CreditsLine({
  store,
  agentId,
}: {
  store: AppStore
  agentId: string
}) {
  const model = useWindowModel()
  const [closed, setClosed] = useState(keptClosed)
  const [fading, setFading] = useState<string>()
  const summary = shownSummary(store.usage)
  const banner = creditsBanner(store.access, summary, {
    outOfCredits: store.outOfCredits(agentId),
  })
  const near = banner ? undefined : approaching(store.access, summary)
  const shownNear =
    near && !approachingClosedHas(near.key, closed) ? near : undefined
  const words = banner ?? shownNear?.words
  if (!words) return null
  const key = shownNear?.key
  return (
    <div
      className={
        key !== undefined && fading === key
          ? 'access-notice credits-line fading'
          : 'access-notice credits-line'
      }
      role="status"
      aria-label={words.title}
    >
      <div className="access-notice-words">
        <div className="access-notice-title">{words.title}</div>
        <div className="access-notice-body">{words.body}</div>
      </div>
      {words.action !== undefined && (
        <button
          type="button"
          className="access-notice-button"
          onClick={() => model.openSettings('usage')}
        >
          {words.action}
        </button>
      )}
      {key !== undefined && (
        <button
          type="button"
          className="credits-close"
          title={t('Close')}
          aria-label={t('Close')}
          onClick={() => {
            setFading(key)
            setTimeout(() => {
              const next = approachingClosedAdding(key, keptClosed())
              keepClosed(next)
              setClosed(next)
            }, 150)
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9M12.5 3.5l-9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
