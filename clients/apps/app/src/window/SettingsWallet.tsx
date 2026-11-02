// Settings' Wallet (mac/Simeon/SettingsPages.swift's `SettingsWalletPage`;
// the founder: "wallet is just another connectors page basically. but link
// and shop"): what it is for in a line, then "Payment methods", Link by
// Stripe and Shop Pay, each its app's icon (28) and its name, as the
// purchase card names them. A row opens the app's page in Connectors, where
// it is added and signed in as every app is; connected, the row says so in
// green, else Add in the link blue. The connected apps and, once a sign-in,
// the catalogue are read as it shows (the core's `loadApps`, the web's
// `loadAppCards`).

import { useEffect } from 'react'
import { t as coreT } from '../core/l10n'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AppLogoTile } from './ConnectCards'
import { SettingsGroup, SettingsSymbol } from './SettingsParts'
import './SettingsWallet.css'
import { classes } from './classes'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The two wallets: the catalogue's id, and the name the page gives it. */
const wallets = [
  { id: 'link', name: 'Link by Stripe' },
  { id: 'shop', name: 'Shop Pay' },
] as const

export function SettingsWalletPage({ store }: { store: AppStore }) {
  useWatched(store)
  const model = useWindowModel()
  useEffect(() => {
    void store.loadAppCards()
  }, [store])
  return (
    <div className="wallet-page">
      <p className="wallet-lead">
        {t(
          'Add a way to pay so your agents can make secure purchases for you. Each purchase waits for your approval.',
        )}
      </p>
      <SettingsGroup title={t('Payment methods')}>
        {wallets.map((wallet, index) => (
          <WalletLine
            key={wallet.id}
            store={store}
            id={wallet.id}
            name={wallet.name}
            divided={index > 0}
            open={() => model.openConnectors({ kind: 'plugin', id: wallet.id })}
          />
        ))}
      </SettingsGroup>
    </div>
  )
}

/** A wallet's row (`WalletLine`): 18 in, 10 above and below, at least 56; its icon, its name, then "✓ Connected" and the chevron, or Add. */
function WalletLine({
  store,
  id,
  name,
  divided,
  open,
}: {
  store: AppStore
  id: string
  name: string
  divided: boolean
  open: () => void
}) {
  // The name Connect knows the app by (the catalogue's title, "Link"), not the one the row shows.
  const title = store.catalog.find((app) => app.id === id)?.title ?? name
  const connected = store.isConnected(title)
  return (
    <button
      type="button"
      className={classes('wallet-line', divided && 'divided')}
      // The Mac's names for it ("Link by Stripe, connected", "Add Shop Pay"): its "Add %@" is the core's catalogue's; "%@, connected" is in neither, so the row's name with the word Connected.
      aria-label={connected ? `${name}, ${t('Connected')}` : coreT`Add ${name}`}
      onClick={open}
    >
      <AppLogoTile name={title} side={28} id={id} />
      <span className="wallet-name">{name}</span>
      <span className="wallet-spacer" />
      {connected ? (
        <>
          <span className="wallet-connected">
            <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 8.5 6.5 12l6.5-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('Connected')}
          </span>
          <span className="wallet-chevron">
            <SettingsSymbol name="chevronRight" size={10} weight={1.7} />
          </span>
        </>
      ) : (
        <span className="wallet-add">{t('Add')}</span>
      )}
    </button>
  )
}
