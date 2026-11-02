// The sign-in in the Windows app (mac/Simeon/SignInScreen.swift; the founder,
// 29 October 2026, after a reference: "simple"): the SimeonLabs logo
// lighting up (`LogoShimmer`), "Sign in to Simeon", and two buttons,
// Continue to sign in (with the logo) and Sign up, each opening the default
// browser (Sign up at the web app's sign-up page). The logo 32, the title
// 24 and 20 under it, the buttons 300 wide and 40 high, 28 under the title
// and 10 apart, in a block of 140 so nothing moves between states. While
// the browser is open: "Continue in your browser", Reopen link · Cancel.
// Then "Setting up Simeon's computer". Return is Continue to sign in
// (Enter on a button the keys are on presses that one), Escape is Cancel.
// Only in the Windows app (App.tsx); the web signs in on the website.

import { useEffect, useRef } from 'react'
import { logoInk, logoLightUpDuration, logoPlaces } from '../core/logoLightUp'
import { t } from '../l10n'
import type { WebSession } from '../session'
import { markStyle } from './FirstRun'
import './SignInScreen.css'

export function SignInScreen({ session }: { session: WebSession }) {
  const landing =
    session.phase === 'signedOut' || session.phase === 'waitingForBrowser'
  return (
    <main className="sign-in-screen">
      {/* The window is moved by its top, as the Mac's title bar over the sign-in (window/desktop.css). */}
      <div className="window-drag" aria-hidden="true" />
      {landing ? <Landing session={session} /> : <SettingUp />}
    </main>
  )
}

/** The logo, the title, and the two buttons or their wait. */
function Landing({ session }: { session: WebSession }) {
  const waiting = session.phase === 'waitingForBrowser'
  const message = session.signedOutMessage
  // Return is Continue to sign in (`.defaultAction`), whatever has the keys; Escape is Cancel while it waits (`.cancelAction`).
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      // A button the keys are on (Tab to Sign up) is pressed by Enter, Windows' way; else Return is the default button's.
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement)
        return
      if (event.key === 'Enter' && !waiting && !event.shiftKey) {
        event.preventDefault()
        session.signInWithBrowser()
      } else if (event.key === 'Escape' && waiting) {
        event.preventDefault()
        session.cancelSignIn()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [session, waiting])
  return (
    <div className="sign-in-column">
      <LogoShimmer />
      <h1 className="sign-in-title">{t('Sign in to Simeon')}</h1>
      {/* The same height in every state, so the logo and the title stay put. */}
      <div className="sign-in-buttons">
        {waiting ? (
          <Waiting session={session} />
        ) : (
          <>
            <button
              type="button"
              className="sign-in-pill filled"
              onClick={() => session.signInWithBrowser()}
            >
              <span
                className="sign-in-pill-mark"
                style={markStyle}
                aria-hidden="true"
              />
              {t('Continue to sign in')}
            </button>
            <button
              type="button"
              className="sign-in-pill"
              onClick={() => session.signInWithBrowser(true)}
            >
              {t('Sign up')}
            </button>
            {message != null && (
              <p className="sign-in-message" role="status">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** "Continue in your browser", with Reopen link · Cancel. */
function Waiting({ session }: { session: WebSession }) {
  return (
    <div className="sign-in-waiting">
      <div className="sign-in-wait-line" role="status">
        <Spinner />
        <span>{t('Continue in your browser')}</span>
      </div>
      <div className="sign-in-wait-actions">
        <button
          type="button"
          className="sign-in-reopen"
          onClick={() => session.reopenLink()}
        >
          {t('Reopen link')}
        </button>
        <span className="sign-in-dot" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="sign-in-cancel"
          onClick={() => session.cancelSignIn()}
        >
          {t('Cancel')}
        </button>
      </div>
    </div>
  )
}

/** The Mac's small spinner (`ProgressView().controlSize(.small)`): eight spokes, the lit one going round clockwise, the others fading behind it. */
function Spinner() {
  return (
    <svg
      className="sign-in-spinner"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="7.1"
          y="1"
          width="1.8"
          height="4.4"
          rx="0.9"
          transform={`rotate(${i * 45} 8 8)`}
          opacity={1 - (((8 - i) % 8) * 0.75) / 8}
        />
      ))}
    </svg>
  )
}

/**
 * "Setting up Simeon's computer" (`SettingUp`, `sand-loading`): 17, medium,
 * the words at 40% with the window's light sweeping across them every 2.2 s
 * (index.css's `.shimmer`).
 */
function SettingUp() {
  return (
    <span className="shimmer sign-in-setting-up">
      {t("Setting up Simeon's computer")}
    </span>
  )
}

/** The ink along the diagonal at `seconds`, from the top left corner to the bottom right. */
function logoGradient(seconds: number): string {
  const stops = logoPlaces.map(
    (place) =>
      `color-mix(in srgb, var(--ink) ${(logoInk(place, seconds) * 100).toFixed(1)}%, transparent) ${place * 100}%`,
  )
  return `linear-gradient(to bottom right, ${stops.join(', ')})`
}

/**
 * The SimeonLabs logo lighting up (`LogoShimmer`, the core's `LogoLightUp`):
 * it fades in to 40% of the ink, a band of the full ink crosses it on the
 * diagonal twice, then it comes to its true colour by 2.85 s and stays.
 * With Reduce Motion, the logo at once.
 */
function LogoShimmer() {
  const mark = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = mark.current
    if (!element) return
    // With Reduce Motion, and in Windows' contrast themes (the logo in their own text colour), the logo at once.
    if (
      window.matchMedia?.(
        '(prefers-reduced-motion: reduce), (forced-colors: active)',
      ).matches
    )
      return
    const start = performance.now()
    let frame = 0
    const draw = (now: number) => {
      const seconds = (now - start) / 1000
      if (seconds >= logoLightUpDuration) {
        element.style.background = ''
        return
      }
      element.style.background = logoGradient(seconds)
      frame = requestAnimationFrame(draw)
    }
    element.style.background = logoGradient(0)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      element.style.background = ''
    }
  }, [])
  return (
    <span
      ref={mark}
      className="sign-in-logo"
      style={markStyle}
      aria-hidden="true"
    />
  )
}
