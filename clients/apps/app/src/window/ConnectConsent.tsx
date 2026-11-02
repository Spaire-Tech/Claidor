// What the person reads before an app's sign-in page opens
// (mac/Simeon/MacConnector.swift's `ConnectConsentLayer` and
// `ConnectConsentDialog`; the core's ConnectConsent.swift, in
// src/core/connectConsent.ts): over everything, the window dimmed; Connect
// goes on, ×, Escape or a click on the dim cancels. Step 6b.

import { type ReactNode, useEffect, useRef } from 'react'
import type { ConnectConsent, ConsentSymbol } from '../core/connectConsent'
import { t } from '../l10n'
import { AppLogoTile } from './ConnectCards'
import './ConnectConsent.css'
import { type Connector, useConnectorWatched } from './connector'
import { Sheet } from './Dialogs'
import { PanelDisc } from './SettingsParts'

/** The consent over the whole window, the chat dimmed behind it, as About and a starter pack sit (`ConnectConsentLayer`). */
export function ConsentLayer({ connector }: { connector: Connector }) {
  useConnectorWatched(connector)
  const ask = connector.asking
  if (!ask) return null
  return (
    <ConsentDialog
      key={ask.consent.id}
      consent={ask.consent}
      connect={() => connector.confirm()}
      cancel={() => connector.cancel()}
    />
  )
}

/**
 * Return connects (keypad Enter too), wherever the keys are in the window
 * (the Mac's `ViewerKeys` above everything); a button of the dialog that has
 * the keys does its own (× cancels).
 */
function useReturnConnects(connect: () => void) {
  const latest = useRef(connect)
  useEffect(() => {
    latest.current = connect
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
        return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.consent-sheet button')) return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
}

/**
 * The consent on the Mac, as Muse's (the founder, 13 October 2026: "its
 * wider than ours"): 600 wide, so it all shows at once; × at the top left;
 * the app's logo (64) and name (22, semibold), what it does; three points
 * with their symbols in the person's blue (what the agents reach in it,
 * that the person stays in charge, that agents can get things wrong); a
 * hairline; the small print (who handles the sign-in, where the
 * information goes, the app's own terms, and for some apps one more thing);
 * Connect across the foot in the blue. It scrolls only in a window too
 * short for it. Return connects; Escape, × or a click beside it cancels.
 */
function ConsentDialog({
  consent,
  connect,
  cancel,
}: {
  consent: ConnectConsent
  connect: () => void
  cancel: () => void
}) {
  useReturnConnects(connect)
  const lines =
    consent.note != null
      ? [...consent.smallPrint, consent.note]
      : consent.smallPrint
  return (
    <Sheet
      label={t`Connect ${consent.title}`}
      close={cancel}
      className="consent-sheet"
    >
      <div className="consent-content">
        <span className="consent-logo" aria-hidden="true">
          <AppLogoTile name={consent.title} side={64} />
        </span>
        <div className="consent-title" role="heading" aria-level={2}>
          {consent.title}
        </div>
        {consent.summary !== '' && (
          <div className="consent-summary">{consent.summary}</div>
        )}
        <div className="consent-points">
          {consent.points.map((point) => (
            <div key={point.symbol} className="consent-point">
              <span className="consent-symbol" aria-hidden="true">
                <PointSymbol name={point.symbol} />
              </span>
              <div className="consent-point-words">
                <div className="consent-point-title">{point.title}</div>
                <div className="consent-point-body">{point.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="consent-rule" />
        <div className="consent-print">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <div className="consent-foot">
        <button type="button" className="consent-connect" onClick={connect}>
          {t('Connect')}
        </button>
      </div>
      <div className="consent-close">
        <PanelDisc symbol="xmark" label={t('Cancel')} onClick={cancel} />
      </div>
    </Sheet>
  )
}

/** The points' SF Symbols, regular, outlined on a 16 grid. */
const symbols: Record<ConsentSymbol, ReactNode> = {
  'square.stack.3d.up': (
    <path d="M8 1.9 14.2 5.1 8 8.3 1.8 5.1ZM1.8 8 8 11.2 14.2 8M1.8 10.9 8 14.1 14.2 10.9" />
  ),
  'hand.raised': (
    <path d="M5.5 8.2V3.6a1 1 0 0 1 2 0V7.4M7.5 7.2V2.6a1 1 0 0 1 2 0V7.4M9.5 7.4V3.8a1 1 0 0 1 2 0V9M5.5 8.6V6.6a1 1 0 0 0-2 0v3.3c0 2.6 2 4.6 4.6 4.6h.4c2.4 0 4-1.9 4-4.3V7a1 1 0 0 0-2 0" />
  ),
  'checkmark.circle': (
    <>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M5.3 8.2 7.1 10l3.6-4" />
    </>
  ),
}

/** One point's symbol (19, regular): 22 square, in the blue. */
function PointSymbol({ name }: { name: ConsentSymbol }) {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {symbols[name]}
      </g>
    </svg>
  )
}
