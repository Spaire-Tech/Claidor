// The Deep Links dialog (mac/Simeon/MacServices.swift's `DeepLinksLayer`
// and `DeepLinksDialog`), shown by `simeon://app/v1/info?topic=deep-links`
// in the Windows app (src/desktop/links.ts), over whatever the window
// shows, the sign-in too: drawn in a root of its own, beside the window's.

import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { DeepLinkSource } from '../core/deepLink'
import { appScheme } from '../core/deepLink'
import type { DesktopLinks } from '../desktop/links'
import { t } from '../l10n'
import './DeepLinks.css'
import { useWatched } from './useStore'

/** Draws the dialog for the app's links, in its own place over the window (main.tsx, the Windows app only). */
export function mountDeepLinks(links: DesktopLinks): void {
  const place = document.createElement('div')
  place.className = 'deep-links-root'
  document.body.append(place)
  createRoot(place).render(<DeepLinksLayer links={links} />)
}

/** The dialog over the dimmed window while a link asked for it (`DeepLinksLayer`). */
export function DeepLinksLayer({ links }: { links: DesktopLinks }) {
  useWatched(links)
  const source = links.info
  if (source === undefined) return null
  return <DeepLinksShown source={source} close={() => links.closeInfo()} />
}

/**
 * Deep Links (`uLn`, 420 wide, 14 round, a one-point edge): "Deep Links"
 * over "Simeon deep links are working", × at the top right; the route in a
 * code chip and where the link came from; Done at the right of the foot.
 * Done, ×, Escape, Return and a click outside close it. The route and
 * source name this app's own scheme.
 */
function DeepLinksShown({
  source,
  close,
}: {
  source: DeepLinkSource
  close: () => void
}) {
  const card = useRef<HTMLDivElement>(null)
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  // Its keys before anything under it (`ViewerKeys(aboveLocks: true)`): Escape, Return and the keypad's Enter, without modifiers.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    card.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (event.key !== 'Escape' && event.key !== 'Enter') return
      if (event.isComposing) return
      event.preventDefault()
      event.stopImmediatePropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      if (before?.isConnected) before.focus()
    }
  }, [])
  return (
    <div
      className="deep-links-dim"
      onMouseDown={(event) => {
        // A click outside closes it, as Done does.
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={card}
        className="deep-links-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('Deep Links')}
        tabIndex={-1}
      >
        <div className="deep-links-head">
          <div className="deep-links-titles">
            <div className="deep-links-title">{t('Deep Links')}</div>
            <div className="deep-links-subtitle">
              {t('Simeon deep links are working')}
            </div>
          </div>
          <button
            type="button"
            className="deep-links-close"
            title={t('Close')}
            aria-label={t('Close')}
            onClick={close}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path
                d="M1 1l6 6M7 1 1 7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="deep-links-fields">
          <Field
            label={t('Route')}
            value={`${appScheme}://app/v1/info?topic=deep-links`}
          />
          <Field
            label={t('Source')}
            value={
              source === 'https'
                ? t('HTTPS link')
                : t`Custom protocol (${appScheme}://)`
            }
          />
        </div>
        <div className="deep-links-foot">
          <button type="button" className="deep-links-done" onClick={close}>
            {t('Done')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A label (12, grey) over its value in a code chip (12, monospaced, selectable, on the ground, 7 round). */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="deep-links-field">
      <div className="deep-links-label">{label}</div>
      <div className="deep-links-value">{value}</div>
    </div>
  )
}
