// Settings › External Agents (mac/Simeon/SettingsExternalAgents.swift, the
// core's ExternalAgents.swift; 11 November 2026, the founder, with another
// app's Bots and Channels pages as the references: "i want the bots to have
// their own setting called External Agents"; "use the design layout of
// screenshot 4. With simeon in the middle, and muse bots dots around it. the
// background is our website background grey. you're here will become Learn
// more"; "there is a setting and a last used… the setting is just
// disconnect").
//
// A card that says in a line what the page is, with Learn more (the docs)
// and its picture; then the bots in one group, no title over it: a
// connected one with "Last used …" and a gear whose one item is Disconnect,
// one not connected yet with its line and +; then Add, for any other bot.
// The model is the core's (`core/externalAgents.ts`).
//
// The web's own ways: Learn more opens in a new tab (in the Windows app, the
// default browser); the address is copied with the window's clipboard.

import { useEffect, useRef, useState } from 'react'
import {
  type ExternalAgentRow,
  ExternalAgentsModel,
  botAddress,
  disconnectLine,
  disconnectTitle,
  externalAgentsExplanation,
  externalAgentsHeadline,
  knownBots,
  lastUsedWords,
  learnMore,
} from '../core/externalAgents'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { copyText } from './clipboard'
import { AppLogoTile } from './ConnectCards'
import './ConnectCards.css'
import { ContextMenu } from './ContextMenu'
import { Alert, Sheet } from './Dialogs'
import './SettingsExternalAgents.css'
import { ProviderIcon } from './SettingsModels'
import './SettingsModels.css'
import { PanelDisc, SettingsGroup, SettingsSymbol } from './SettingsParts'
import { useWatched } from './useStore'

/** Add, for any other bot: the sheet shows Simeon's mark and "Add a bot". */
const anyBot = 'any'

export function SettingsExternalAgentsPage({ store }: { store: AppStore }) {
  const [model] = useState(() => new ExternalAgentsModel(store.credentialsCall))
  useWatched(model)
  /** The bot whose sheet is open (its kind), or `any` for Add. */
  const [adding, setAdding] = useState<string>()
  const [disconnecting, setDisconnecting] = useState<ExternalAgentRow>()
  useEffect(() => {
    void model.load()
  }, [model])
  const rows = model.rows
  return (
    <div className="agents-page">
      <ExternalAgentsHero />
      <SettingsGroup>
        {rows.map((row, index) => (
          <ExternalAgentLine
            key={row.id}
            row={row}
            divided={index > 0}
            add={() => setAdding(row.id)}
            disconnect={() => setDisconnecting(row)}
          />
        ))}
        <button
          type="button"
          className="models-line divided bots-any"
          onClick={() => setAdding(anyBot)}
        >
          <span className="bots-any-plus">
            <SettingsSymbol name="plus" size={14} weight={1.3} />
          </span>
          <span className="bots-any-words">{t('Add')}</span>
        </button>
      </SettingsGroup>
      {model.problem !== undefined && (
        <p className="models-problem" role="alert">
          {model.problem}
        </p>
      )}
      {adding !== undefined && (
        <AddBotSheet
          bot={adding}
          close={() => {
            setAdding(undefined)
            // A bot let in while its sheet was open shows as connected once it closes.
            void model.load()
          }}
        />
      )}
      {disconnecting && (
        <Alert
          title={disconnectTitle(disconnecting.name)}
          message={disconnectLine()}
          action={t('Disconnect')}
          destructive
          cancel={t('Cancel')}
          onAction={() => {
            setDisconnecting(undefined)
            void model.disconnect(disconnecting.id)
          }}
          onCancel={() => setDisconnecting(undefined)}
        />
      )}
    </div>
  )
}

/**
 * The page's card, laid out as the reference's (Channels' "Reason for
 * Mac"): on the page's ground, round 16 with a line at 8%, its words on the
 * left (a line at 15, what it does at 13 in grey, Learn more in a grey
 * capsule at its foot), the picture on the right.
 */
function ExternalAgentsHero() {
  return (
    <section className="agents-hero">
      <div className="agents-hero-words">
        <h3 className="agents-hero-title">{externalAgentsHeadline()}</h3>
        <p className="agents-hero-line">{externalAgentsExplanation()}</p>
        <button
          type="button"
          className="agents-learn"
          onClick={() =>
            window.open(learnMore, '_blank', 'noopener,noreferrer')
          }
        >
          {t('Learn more')}
        </button>
      </div>
      <ExternalAgentsPicture />
    </section>
  )
}

/**
 * The card's picture: Simeon's tile in the middle, Grok Bot, Muse and Dots
 * around it on a faint orbit, on the website's grey (`--soft`, #f5f5f7;
 * #1c1c1e on dark). Simeon's tile stays white, as an app's icon does.
 */
function ExternalAgentsPicture() {
  return (
    <div
      className="agents-picture"
      role="img"
      aria-label={t('Simeon with Grok Bot, Muse and Dots')}
    >
      <span className="agents-scene">
        <svg className="agents-orbit" viewBox="0 0 320 180" aria-hidden="true">
          <ellipse cx="160" cy="90" rx="99.2" ry="60" />
        </svg>
        <span className="agents-mascot agents-mascot-top">
          <ProviderIcon provider="grokbot" side={44} />
        </span>
        <span className="agents-mascot agents-mascot-left">
          <ProviderIcon provider="muse" side={44} />
        </span>
        <span className="agents-mascot agents-mascot-right">
          <ProviderIcon provider="dots" side={44} />
        </span>
        <span className="agents-simeon">
          <span className="agents-simeon-mark" />
        </span>
      </span>
    </div>
  )
}

/**
 * A bot's row (the reference's): its mascot, its name over "Last used Nov
 * 10, 2026" once connected (the gear at its end, whose one item is
 * Disconnect), else over its line, with + at its end.
 */
function ExternalAgentLine({
  row,
  divided,
  add,
  disconnect,
}: {
  row: ExternalAgentRow
  divided: boolean
  add: () => void
  disconnect: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const gear = useRef<HTMLButtonElement>(null)
  const line = row.connected ? lastUsedWords(row.connected) : row.line
  return (
    <div className={divided ? 'models-line divided' : 'models-line'}>
      {row.icon ? (
        <ProviderIcon provider={row.icon} side={28} />
      ) : (
        <AppLogoTile name={row.name} side={28} />
      )}
      <span className="models-words">
        <span className="models-title">{row.name}</span>
        {line !== undefined && <span className="models-subtitle">{line}</span>}
      </span>
      {row.connected ? (
        <button
          ref={gear}
          type="button"
          className="panel-disc glass-disc agents-gear"
          title={t('Settings')}
          aria-label={t('Settings')}
          aria-haspopup="menu"
          aria-expanded={menu !== undefined}
          onClick={() => {
            const box = gear.current?.getBoundingClientRect()
            if (box) setMenu({ x: box.left, y: box.bottom + 4 })
          }}
        >
          <SettingsSymbol name="gearshape" size={15} weight={1.2} />
        </button>
      ) : (
        <PanelDisc symbol="plus" label={row.name} onClick={add} />
      )}
      {menu && (
        <ContextMenu
          items={[
            {
              label: t('Disconnect'),
              bare: true,
              destructive: true,
              action: disconnect,
            },
          ]}
          at={menu}
          close={() => setMenu(undefined)}
          label={row.name}
        />
      )}
    </div>
  )
}

/**
 * A bot's sheet (the reference): its mascot and its name, or Simeon's mark
 * and "Add a bot" for any other; the glass disc that closes it; who to give
 * the address to, in that bot's words ("Give this to your Muse."); the
 * address in its field with Copy inside it; MCP details, which open what the
 * bot can do once it is in.
 */
function AddBotSheet({ bot, close }: { bot: string; close: () => void }) {
  const [copied, setCopied] = useState(false)
  const [details, setDetails] = useState(false)
  const known = knownBots.find((one) => one.kind === bot)
  const title = known?.name ?? t('Add a bot')
  const address = botAddress(known?.kind)
  const copy = async () => {
    await copyText(address)
    setCopied(true)
  }
  return (
    <Sheet label={title} close={close} className="models-sheet bots-sheet">
      <div className="models-sheet-head">
        {known ? (
          <ProviderIcon provider={known.icon} side={44} />
        ) : (
          <span className="bots-simeon-tile" aria-hidden="true">
            <span className="bots-simeon-mark" />
          </span>
        )}
        <h2 className="models-sheet-title bots-title">{title}</h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
      </div>
      <p className="bots-words">
        {known
          ? known.give()
          : t('Give this to any bot that can add an MCP server.')}
      </p>
      <div className="bots-address">
        <span className="bots-address-text">{address}</span>
        <button type="button" className="bots-copy" onClick={() => void copy()}>
          {copied ? t('Copied') : t('Copy')}
        </button>
      </div>
      <button
        type="button"
        className="bots-details-link"
        aria-expanded={details}
        onClick={() => setDetails(!details)}
      >
        {t('MCP details')}
      </button>
      {details && (
        <p className="bots-details">
          {t(
            'It signs in to Simeon once, with your permission. Then it can message your agents, follow their work and run their routines. Purchases and passwords stay with you, in the app.',
          )}
        </p>
      )}
    </Sheet>
  )
}
