// What the person reads before an app's sign-in page opens
// (mac/Simeon/MacConnector.swift's `ConnectConsentLayer` and
// `ConnectConsentDialog`; the core's ConnectConsent.swift, in
// src/core/connectConsent.ts): over everything, the window dimmed; Connect
// goes on, ×, Escape or a click on the dim cancels. Step 6b.

import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'
import type { ConnectConsent, ConsentSymbol } from '../core/connectConsent'
import { t } from '../l10n'
import { AppLogoTile } from './ConnectCards'
import './ConnectConsent.css'
import { type Connector, useConnectorWatched } from './connector'
import { Alert, Sheet } from './Dialogs'
import { PanelDisc } from './SettingsParts'

/** The consent over the whole window, the chat dimmed behind it, as About and a starter pack sit (`ConnectConsentLayer`); and the window's alert when a sign-in's page couldn't open. */
export function ConsentLayer({ connector }: { connector: Connector }) {
  useConnectorWatched(connector)
  const ask = connector.asking
  return (
    <>
      {ask && (
        <ConsentDialog
          key={ask.consent.id}
          consent={ask.consent}
          connect={() => connector.confirm()}
          cancel={() => connector.cancel()}
        />
      )}
      {connector.told != null && (
        // The browser refused the sign-in's tab (the web's alone: the Mac's sheet always opens, or its browser does).
        <Alert
          title={connector.told}
          message=""
          action={t('Done')}
          onAction={() => connector.dismissTold()}
        />
      )}
    </>
  )
}

/** A key pressed over the consent, as the Mac's `ViewerKeys(aboveLocks:)` takes it. */
export interface ConsentKeyPress {
  key: string
  isComposing?: boolean
  keyCode?: number
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
}

/**
 * What a key does over the consent: Return (keypad Enter too) connects,
 * Escape cancels, wherever the keys are in the window; with a modifier
 * held, neither (`ignore`: the Mac lets it go, and the window's own keys
 * wait under the consent). A button of the dialog that has the keys does
 * its own on Return (× cancels); letters being composed keep their keys.
 * Nothing (`undefined`) for every other key.
 */
export function consentKey(
  press: ConsentKeyPress,
  onDialogButton: boolean,
): 'connect' | 'cancel' | 'ignore' | undefined {
  if (press.key !== 'Enter' && press.key !== 'Escape') return undefined
  // Letters still being composed (Japanese, Chinese…) take the key first; Safari sends that key as 229.
  if (press.isComposing || press.keyCode === 229) return undefined
  if (press.shiftKey || press.altKey || press.metaKey || press.ctrlKey)
    return 'ignore'
  if (press.key === 'Escape') return 'cancel'
  return onDialogButton ? undefined : 'connect'
}

/**
 * The consent's keys (`consentKey`), before anything else in the window
 * hears them: in the capture, set up before the sheet's own Escape.
 */
function useConsentKeys(connect: () => void, cancel: () => void) {
  const latest = useRef({ connect, cancel })
  useEffect(() => {
    latest.current = { connect, cancel }
  })
  useLayoutEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const action = consentKey(
        event,
        target?.closest('.consent-sheet button') != null,
      )
      if (action === undefined) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (action === 'connect') latest.current.connect()
      else if (action === 'cancel') latest.current.cancel()
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
  useConsentKeys(connect, cancel)
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
