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
// Each bot's mascot on Connect apps' tile, white or #2c2c2e on dark (the
// founder, 11 November 2026: "the tab in dark mode should not have these
// white background"). Claude Code's and Codex's sheets show the ways to
// connect them (the same day: "we need to show the many ways to do it for
// both"). The model is the core's (`core/externalAgents.ts`).
//
// The web's own ways: Learn more opens in a new tab (in the Windows app, the
// default browser); the address is copied with the window's clipboard.

import { useEffect, useRef, useState } from 'react'
import {
  type BotWay,
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
  mascotIcons,
} from '../core/externalAgents'
import { faceById, faceURL, simeonFaceId } from '../core/faces'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { copyText } from './clipboard'
import { AppLogoTile } from './ConnectCards'
import './ConnectCards.css'
import { ContextMenu } from './ContextMenu'
import { Alert, Sheet } from './Dialogs'
import { mascotURL } from './mascots'
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
 * The card's picture (11 November 2026, the founder: "use simeon avatar if
 * anything and by all means make it proportionate"): Simeon's own face in
 * the middle, Grok Bot, Muse and Dots the same size around him, evenly
 * spaced on a circle, each joined to him by a thin line, on the website's
 * grey (`--soft`, #f5f5f7; #1c1c1e on dark).
 */
function ExternalAgentsPicture() {
  const simeon = faceById(simeonFaceId)
  const face = simeon ? faceURL(simeon) : undefined
  return (
    <div
      className="agents-picture"
      role="img"
      aria-label={t('Simeon with Grok Bot, Muse and Dots')}
    >
      <span className="agents-scene">
        <svg className="agents-lines" viewBox="0 0 320 200" aria-hidden="true">
          <circle cx="160" cy="118" r="70" />
          {agentsAround.map(({ x, y }) => (
            <line key={`${x}-${y}`} x1="160" y1="118" x2={x} y2={y} />
          ))}
        </svg>
        {agentsAround.map(({ icon, x, y }) => (
          <span
            key={icon}
            className="agents-mascot"
            style={{ left: x, top: y }}
          >
            <BotIcon icon={icon} name={icon} side={40} />
          </span>
        ))}
        <span
          className="agents-simeon"
          style={simeon?.backdrop ? { background: simeon.backdrop } : undefined}
        >
          {face && <img src={face} alt="" />}
        </span>
      </span>
    </div>
  )
}

/** Where the bots sit around Simeon (at 118 down the 320 by 200 picture, so the three and him sit in its middle): on a circle of 70, at the top and below either side, 120° apart. */
const agentsAround = [
  { icon: 'grokbot', angle: 90 },
  { icon: 'muse', angle: 210 },
  { icon: 'dots', angle: 330 },
].map(({ icon, angle }) => ({
  icon,
  x: Math.round((160 + 70 * Math.cos((angle * Math.PI) / 180)) * 10) / 10,
  y: Math.round((118 - 70 * Math.sin((angle * Math.PI) / 180)) * 10) / 10,
}))

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
      <BotIcon icon={row.icon} name={row.name} side={28} />
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
 * A bot's icon: its mascot cut out on Connect apps' tile (`.bot-tile`:
 * white, #2c2c2e on dark, a hairline and a soft shadow), round as an app's
 * icon; else its maker's icon; else the first letter of its name.
 */
function BotIcon({
  icon,
  name,
  side,
}: {
  icon?: string
  name: string
  side: number
}) {
  const mascot =
    icon !== undefined && mascotIcons.has(icon) ? mascotURL(icon) : undefined
  if (mascot)
    return (
      <span
        className="bot-tile"
        style={{ width: side, height: side, borderRadius: side * 0.2237 }}
        aria-hidden="true"
      >
        <img src={mascot} alt="" />
      </span>
    )
  if (icon !== undefined) return <ProviderIcon provider={icon} side={side} />
  return <AppLogoTile name={name} side={side} />
}

/**
 * A bot's sheet (the reference): its mascot and its name, or Simeon's mark
 * and "Add a bot" for any other; the glass disc that closes it. A bot in its
 * maker's cloud: who to give the address to, in that bot's words ("Give
 * this to your Muse."), the address in its field with Copy inside it. A
 * coding agent (Claude Code, Codex): "Pick one…" and its ways, each a title,
 * a line and what to copy. Then MCP details, which open what the bot can do
 * once it is in.
 */
function AddBotSheet({ bot, close }: { bot: string; close: () => void }) {
  const [details, setDetails] = useState(false)
  const known = knownBots.find((one) => one.kind === bot)
  const title = known?.name ?? t('Add a bot')
  const ways = known?.ways?.()
  return (
    <Sheet
      label={title}
      close={close}
      className={
        ways
          ? 'models-sheet bots-sheet bots-sheet-ways'
          : 'models-sheet bots-sheet'
      }
    >
      <div className="models-sheet-head">
        {known ? (
          <BotIcon icon={known.icon} name={known.name} side={44} />
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
      {ways ? (
        <ul className="bots-ways">
          {ways.map((way) => (
            <WayLine key={way.title} way={way} />
          ))}
        </ul>
      ) : (
        <CopyField text={botAddress(known?.kind)} />
      )}
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

/** One way to connect a coding agent: its title (15, medium), its line (13, grey), and what to copy in its field. */
function WayLine({ way }: { way: BotWay }) {
  return (
    <li className="bots-way">
      <span className="bots-way-title">{way.title}</span>
      <span className="bots-way-line">{way.line}</span>
      <CopyField text={way.text} code />
    </li>
  )
}

/**
 * What to copy in its field (14 round, 1 grey line), Copy a grey capsule
 * inside it at its end, "Copied" once it is. An address stays on one line;
 * a command or the words for the agent wrap at their spaces, so all of it
 * shows and no address is cut.
 */
function CopyField({ text, code }: { text: string; code?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={code ? 'bots-address bots-code' : 'bots-address'}>
      <span className="bots-address-text">{text}</span>
      <button
        type="button"
        className="bots-copy"
        onClick={() => {
          void copyText(text).then(() => setCopied(true))
        }}
      >
        {copied ? t('Copied') : t('Copy')}
      </button>
    </div>
  )
}
