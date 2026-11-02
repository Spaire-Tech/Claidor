// The access cover (mac/Simeon/ComputerStates.swift, `AccessCover`): the
// whole window when this account was refused before its computer was ever
// reached. The mark and "Simeon", the tagline, then what this account
// needs and its button: with no plan, the web's plans page, where a new
// account starts its trial; a card that failed, Stripe's card page. Under
// it, the account signed in and Sign Out, asked first. Since 14 October
// 2026 the server lets an account with no plan reach its computer, so this
// shows only when that is switched off (`DESKTOP_COMPUTER_WITHOUT_PLAN`).
// The access, the plan and the agents are read again when the window comes
// back to the front (the plan bought in another tab shows here).

import { useEffect, useState } from 'react'
import { macCover, macRoute, tagline } from '../core/access'
import { t as coreT } from '../core/l10n'
import { t } from '../l10n'
import type { WebSession } from '../session'
import { Alert } from './Dialogs'
import { markStyle } from './FirstRun'
import { useWatched } from './useStore'

export function AccessCover({ session }: { session: WebSession }) {
  const store = session.store
  useWatched(store)
  const [askingSignOut, setAskingSignOut] = useState(false)
  const [failure, setFailure] = useState<string>()
  const words = macCover(store.access, store.plan)

  useEffect(() => {
    const readAgain = () => {
      void (async () => {
        await store.refreshAccess()
        await store.refreshPlan()
        await store.reloadRoster()
      })()
    }
    readAgain()
    const back = () => {
      if (document.visibilityState === 'visible') readAgain()
    }
    window.addEventListener('focus', readAgain)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.removeEventListener('focus', readAgain)
      document.removeEventListener('visibilitychange', back)
    }
  }, [store])

  /** The button: the plans page, Apple's or Simeon Labs' page in a new tab; Stripe's card page asked for first. */
  const act = async () => {
    setFailure(undefined)
    const route = macRoute(store.access, store.plan)
    if (route.kind === 'web') {
      window.open(route.url, '_blank', 'noopener')
      return
    }
    // Opened at once, before the answer, so the browser lets it open; sent to the page once it is known. It keeps no handle on the app.
    const page = window.open('', '_blank')
    if (page) page.opener = null
    const answer = await store.billingPortal(route.flow)
    if (answer.url) {
      if (page) page.location.href = answer.url
      else window.open(answer.url, '_blank', 'noopener')
    } else {
      page?.close()
      setFailure(answer.message)
    }
  }

  const email = store.account?.email ?? ''
  return (
    <main className="access-cover">
      <div className="access-body">
        <div className="access-brand">
          <span className="access-mark" style={markStyle} aria-hidden="true" />
          <span className="access-wordmark">Simeon</span>
        </div>
        <p className="access-tagline">{tagline()}</p>
        <div className="access-words">
          <div className="access-title">{words.title}</div>
          <div className="access-line">{words.body}</div>
        </div>
        {words.action && (
          <button
            type="button"
            className="access-button"
            onClick={() => void act()}
          >
            {words.action}
          </button>
        )}
        {failure && (
          <div className="access-failure" role="alert">
            {failure}
          </div>
        )}
        <div className="access-account">
          {email !== '' && (
            <div className="access-email">{t`Signed in as ${email}`}</div>
          )}
          <button
            type="button"
            className="access-sign-out"
            onClick={() => setAskingSignOut(true)}
          >
            {t('Sign Out')}
          </button>
        </div>
      </div>
      {askingSignOut && (
        <Alert
          title={coreT('Sign out?')}
          message={coreT('You’ll need to sign in again to use Simeon.')}
          action={coreT('Sign out')}
          cancel={coreT('Cancel')}
          destructive
          onAction={() => {
            setAskingSignOut(false)
            void session.signOut()
          }}
          onCancel={() => setAskingSignOut(false)}
        />
      )}
    </main>
  )
}
