// The account (mac/Simeon/Account.swift, the core's AccountMenu.swift): the
// disc at the sidebar's foot and in its rail (`AccountDisc`), the account
// menu above it (Weekly usage ›, Settings, About, Report an issue, Log
// out), and About over everything. The frame (step 6a) draws the disc; the
// menu and About are step 6f's.

import { useState } from 'react'
import { accountInitials } from '../core/accountInitials'
import { t as coreT } from '../core/l10n'
import type { AppStore } from '../core/store'
import type { WebSession } from '../session'
import './Settings.css'
import { useWatched } from './useStore'

/**
 * The account menu, its foot 4 above the disc and its left at the disc's
 * left (`AccountActions.openMenu`): step 6f. `at` is the disc's box.
 */
function AccountMenu({
  store,
  session,
  at,
  close,
}: {
  store: AppStore
  session: WebSession
  at: DOMRect
  close: () => void
}) {
  void store
  void session
  void at
  void close
  return null
}

/**
 * The account's letters, or its picture (`AccountDisc`, "Open account
 * menu"): 32, in the glass, a touch larger under the pointer; the account
 * menu above it. The picture is read once and kept by the browser, so
 * folding the sidebar to its rail and back doesn't show the letters first.
 */
export function AccountDisc({
  store,
  session,
}: {
  store: AppStore
  session: WebSession
}) {
  useWatched(store)
  const [menu, setMenu] = useState<DOMRect>()
  const [failed, setFailed] = useState<string>()
  const account = store.account
  const picture =
    account?.pictureURL && account.pictureURL !== failed
      ? account.pictureURL
      : undefined
  return (
    <>
      <button
        type="button"
        className="account-disc glass-disc"
        aria-label={coreT('Open account menu')}
        aria-haspopup="menu"
        aria-expanded={menu !== undefined}
        onClick={(event) =>
          setMenu(event.currentTarget.getBoundingClientRect())
        }
      >
        {account ? accountInitials(account.name || account.email) : ''}
        {picture && (
          <img
            src={picture}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(picture)}
          />
        )}
      </button>
      {menu && (
        <AccountMenu
          store={store}
          session={session}
          at={menu}
          close={() => setMenu(undefined)}
        />
      )}
    </>
  )
}

/** About over everything (`AboutLayer`, `model.about`): step 6f. */
export function AboutLayer() {
  return null
}
