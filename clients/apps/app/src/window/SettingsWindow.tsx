// Settings (mac/Simeon/SettingsWindow.swift, `overlay:settings`): over the
// whole window, not a window of its own, the window dimmed under it. A
// panel of at most 960 × 720 (the window less 48 and 64; Connectors' size),
// laid out as a Mac app's Settings, in the app's own type: its pages listed
// on its left, each with its symbol, the current one on a grey ground, Log
// out at the foot; the page's name at the top of the rest, its groups
// under it. General, Usage & Billing once the account's usage is in hand,
// AI Models (the person's own ChatGPT, 8 November 2026), Network (the
// Simeon Network, 10 November 2026), Wallet, Credentials Store, Permissions, Computer, Help & support and
// Legal; the account is General's first row, its page under General with
// Back. Updates in the Windows app only (step 7e): a web page is always the
// latest. Each opening starts afresh on the page asked for, at its top.
// ⌘, (Control-, off a Mac) opens it on General; ⌘K and "/" the page picked;
// Escape, × or a click on the dim close it.
//
// The pages are each part's own: General, Account, Permissions, Computer,
// Help & support and Legal (6e); Usage & Billing, Wallet and the
// Credentials Store (6f); AI Models (SettingsModels.tsx); Network
// (SettingsNetwork.tsx).

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { shownName } from '../core/aiModels'
import { t as coreT } from '../core/l10n'
import { askedJoin } from '../core/network'
import type { AppStore } from '../core/store'
import { desktop } from '../desktop/desktop'
import { desktopUpdates } from '../desktop/updates'
import { t } from '../l10n'
import type { WebSession } from '../session'
import { Alert } from './Dialogs'
import { SettingsComputerPage } from './SettingsComputer'
import { SettingsCredentialsPage } from './SettingsCredentials'
import {
  SettingsAccountPage,
  SettingsGeneralPage,
  SettingsHelpPage,
  SettingsLegalPage,
  SettingsPermissionsPage,
} from './SettingsGeneral'
import { SettingsModelAccountPage, SettingsModelsPage } from './SettingsModels'
import { SettingsNetworkPage } from './SettingsNetwork'
import {
  PanelDisc,
  SettingsSymbol,
  type SettingsSymbolName,
} from './SettingsParts'
import { SettingsUpdatesPage, useCheckForUpdates } from './SettingsUpdates'
import { SettingsUsagePage } from './SettingsUsage'
import { SettingsWalletPage } from './SettingsWallet'
import { classes } from './classes'
import { useWatched } from './useStore'
import { type SettingsPage, useWindowModel } from './windowModel'

/** Each page's name and symbol (`SettingsState.Page.title`, `.symbol`). */
const pages: Record<
  SettingsPage,
  { title: () => string; symbol: SettingsSymbolName }
> = {
  general: { title: () => t('General'), symbol: 'gearshape' },
  usage: { title: () => t('Usage & Billing'), symbol: 'chartBar' },
  models: { title: () => t('AI Models'), symbol: 'brain' },
  network: { title: () => t('Network'), symbol: 'network' },
  wallet: { title: () => t('Wallet'), symbol: 'wallet' },
  credentials: { title: () => t('Credentials Store'), symbol: 'key' },
  permissions: { title: () => t('Permissions'), symbol: 'handRaised' },
  computer: { title: () => t('Computer'), symbol: 'desktopcomputer' },
  updates: { title: () => t('Updates'), symbol: 'arrowDownCircle' },
  help: { title: () => t('Help & support'), symbol: 'questionmarkCircle' },
  legal: { title: () => t('Legal'), symbol: 'checkmarkShield' },
  account: { title: () => t('Account'), symbol: 'personCropCircle' },
  modelAccount: { title: () => t('Usage & Billing'), symbol: 'chartBar' },
}

/** The page it sits under, with Back to it: the account under General (its first row), an AI account under Usage & Billing (its Subscriptions). */
function parentOf(page: SettingsPage): SettingsPage | undefined {
  if (page === 'account') return 'general'
  if (page === 'modelAccount') return 'usage'
  return undefined
}

/** The pages listed, in the Mac's order: Usage & Billing as the iPhone lists it, not for an enterprise team (`store.usageListed`); Updates in the Windows app only (a web page is always the latest). */
export function listed(store: AppStore): SettingsPage[] {
  const order: SettingsPage[] = [
    'general',
    'usage',
    'models',
    'network',
    'wallet',
    'credentials',
    'permissions',
    'computer',
    'updates',
    'help',
    'legal',
  ]
  return order.filter(
    (page) =>
      (page !== 'usage' || store.usageListed) &&
      // Updates: the Windows app's own, not a Store install's (the Store updates it).
      (page !== 'updates' ||
        (desktop() !== undefined && desktop()?.facts.store !== true)),
  )
}

/** The page drawn for each name. */
function PageBody({ page, store }: { page: SettingsPage; store: AppStore }) {
  switch (page) {
    case 'general':
      return <SettingsGeneralPage store={store} />
    case 'usage':
      return <SettingsUsagePage store={store} />
    case 'models':
      return <SettingsModelsPage store={store} />
    case 'network':
      return <SettingsNetworkPage store={store} />
    case 'wallet':
      return <SettingsWalletPage store={store} />
    case 'credentials':
      return <SettingsCredentialsPage store={store} />
    case 'permissions':
      return <SettingsPermissionsPage store={store} />
    case 'computer':
      return <SettingsComputerPage store={store} />
    case 'updates':
      return <SettingsUpdatesPage store={store} />
    case 'help':
      return <SettingsHelpPage store={store} />
    case 'legal':
      return <SettingsLegalPage store={store} />
    case 'account':
      return <SettingsAccountPage store={store} />
    case 'modelAccount':
      return <SettingsModelAccountPage store={store} />
  }
}

/**
 * The sign-out question (Account.swift's `askToSignOut`, `qon`): Settings'
 * Log out and the account menu's ask the same, "Sign out?", Cancel (Escape)
 * and Sign out (Return). Signing out closes Settings with the window.
 */
export function SignOutQuestion({
  session,
  close,
}: {
  session: WebSession
  close: () => void
}) {
  return (
    <Alert
      title={coreT('Sign out?')}
      message={coreT('You’ll need to sign in again to use Simeon.')}
      action={coreT('Sign out')}
      cancel={coreT('Cancel')}
      onAction={() => {
        close()
        void session.signOut()
      }}
      onCancel={close}
    />
  )
}

/** Nothing to watch on the web (no updater). */
const quiet = { subscribe: () => () => {}, getVersion: () => 0 }

/**
 * The pages ("Settings sections"), 210 wide: each its symbol (14) and its
 * name (13), 32 high, the current one (or the one it sits under) on a grey
 * ground, 8 round; the dot (7, the unread blue) beside Updates while a
 * release waits; Log out at the foot, asked first.
 */
function SettingsNav({
  store,
  session,
  current,
}: {
  store: AppStore
  session: WebSession
  current: SettingsPage
}) {
  const model = useWindowModel()
  const [asking, setAsking] = useState(false)
  const shown = parentOf(current) ?? current
  // A release found by the Windows app's updater (step 7e): a dot beside Updates while it waits.
  const updates = desktopUpdates()
  useWatched(updates ?? quiet)
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {listed(store).map((page) => (
        <button
          key={page}
          type="button"
          className={classes('settings-nav-entry', shown === page && 'current')}
          aria-current={shown === page ? 'page' : undefined}
          onClick={() => model.showSettingsPage(page)}
        >
          <span className="settings-nav-symbol">
            <SettingsSymbol name={pages[page].symbol} size={14} />
          </span>
          <span className="settings-nav-name">{pages[page].title()}</span>
          {page === 'updates' && updates?.found != null && (
            <span
              className="settings-nav-dot"
              role="img"
              aria-label={t('Update available')}
            />
          )}
        </button>
      ))}
      <span className="settings-nav-spacer" />
      <button
        type="button"
        className="settings-nav-entry"
        onClick={() => setAsking(true)}
      >
        <span className="settings-nav-symbol">
          <SettingsSymbol name="logOut" size={14} />
        </span>
        <span className="settings-nav-name">{coreT('Log out')}</span>
      </button>
      {asking && (
        <SignOutQuestion session={session} close={() => setAsking(false)} />
      )}
    </nav>
  )
}

/** The panel: the grouped ground, round 14; the list of pages, then the page's name and its groups across the rest. */
function SettingsPanel({
  store,
  session,
  page,
}: {
  store: AppStore
  session: WebSession
  page: SettingsPage
}) {
  const model = useWindowModel()
  const panel = useRef<HTMLDivElement>(null)
  const parent = parentOf(page)
  useWatched(store.aiModels)
  // An AI account's page is named after the account ("ChatGPT", "Claude").
  const shown =
    page === 'modelAccount'
      ? store.aiModels.accounts.find(
          (one) =>
            model.overlay?.kind === 'settings' &&
            one.id === model.overlay.modelAccount,
        )
      : undefined
  const title = shown ? shownName(shown) : pages[page].title()
  // The panel takes the keys as it opens, so nothing behind keeps them (the message field would take Escape and the letters).
  useEffect(() => {
    panel.current?.focus()
  }, [])
  return (
    <div
      ref={panel}
      className="overlay-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Simeon settings"
      data-window-slot=""
      tabIndex={-1}
    >
      <SettingsNav store={store} session={session} current={page} />
      <div className="settings-main">
        <div className="panel-head">
          {parent && (
            <PanelDisc
              symbol="chevronLeft"
              label={t('Back')}
              onClick={() => model.showSettingsPage(parent)}
            />
          )}
          <h2 className="panel-title">{title}</h2>
          <PanelDisc
            symbol="xmark"
            label={t('Close')}
            onClick={() => model.closeSettings()}
          />
        </div>
        {/* A page is drawn afresh, at its top, each time it is shown. */}
        <div key={page} className="settings-body">
          <PageBody page={page} store={store} />
        </div>
      </div>
    </div>
  )
}

/** Escape closes Settings, unless one of its fields has the keys (a rule's own Escape) or something stands over it (search, an alert, a menu). */
function useSettingsEscape(close: () => void) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.isComposing || event.keyCode === 229) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement)
      )
        return
      if (overSlot()) return
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
}

/** Something over the window's overlay slot: search, an alert, a sheet, a menu (each takes its own Escape first). */
export function overSlot(): boolean {
  return (
    document.querySelector(
      '[aria-modal="true"]:not([data-window-slot]), .context-menus',
    ) != null
  )
}

/** The dim and the panel, over the window (under search). */
export function SettingsLayer({
  store,
  session,
}: {
  store: AppStore
  session: WebSession
}) {
  const model = useWindowModel()
  useWatched(store)
  // Check for Updates… in the Windows app opens Settings on Updates (step 7e).
  useCheckForUpdates(model)
  const overlay = model.overlay
  const open = overlay?.kind === 'settings'
  const page = open ? overlay.page : undefined
  // The website's join page handed an invite over (`#network-join=`): Settings opens on Network, which asks whose network it is for.
  useEffect(() => {
    if (askedJoin()) model.openSettings('network')
  }, [model])
  // Usage & Billing gone from the list while it is shown (an enterprise team, the summary gone): back to General.
  const usageGone = page === 'usage' && !store.usageListed
  useEffect(() => {
    if (usageGone) model.showSettingsPage('general')
  }, [model, usageGone])
  if (!open || page === undefined) return null
  return (
    <SettingsShell close={() => model.closeSettings()}>
      <SettingsPanel
        key={overlay.opening}
        store={store}
        session={session}
        page={page}
      />
    </SettingsShell>
  )
}

/** The dim behind a panel: black at 50%; a click on it closes the panel; Escape too. */
function SettingsShell({
  close,
  children,
}: {
  close: () => void
  children: ReactNode
}) {
  useSettingsEscape(close)
  return (
    <div
      className="overlay-dim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !event.defaultPrevented)
          close()
      }}
    >
      {children}
    </div>
  )
}
