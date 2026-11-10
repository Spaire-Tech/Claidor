// Settings' AI Models (mac/Simeon/SettingsModels.swift, the core's
// AIModels.swift; 8 November 2026, the founder: "allow people to bring
// their own subscriptions and charge only for the computer", "do it exactly
// like Reason", then "use codex sign in"): what it is for in a line; the
// accounts connected, each its app's icon, its name and "Subscription" (how
// it stands only when it can't be used) and a `⋯` (Add Another for ChatGPT,
// Connect Again, Rename, Disconnect); then Subscriptions, the providers not
// yet connected, each its app's icon, its name and Connect. 9 November, the
// founder: "do not duplicate the subscription", "just have subscription
// there", the icons whole as Wallet's Link and Shop, and the model chosen on
// the composer (`ComposerModelMenu`), not here; each account by its
// provider's name, never the e-mail, how it stands beside its `⋯` (a dot and
// its words). One model for the window (`store.aiModels`).
//
// API keys (10 November 2026, the founder: "Below subscription something
// called api keys"): under Subscriptions, every provider the server lists
// in the founder's order, each its tile, its name (and, for those with a
// plan of their own, where to connect the plan instead) and Connect, or
// "Soon"; Connect asks as an app's does (`keyConsent`), then the key sheet:
// 1, the provider's page to make a key on; 2, the key pasted (with the
// details a provider needs); the server tries it before keeping it. A key
// connected is under Connected, "API key …a1b2".
//
// The web's own ways: the code is copied with the window's clipboard
// (clipboard.ts: the browser's, or the Windows app's); OpenAI's page opens
// in a new tab (in the Windows app, the default browser); the sheet asks
// the server every few seconds while it is open, and closing it stops the
// asking. Claude's sheet sends the pasted code to the computer's Claude
// Code; closing it before the code ends the sign-in there.

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  type ChatGPTPoll,
  type ChatGPTSignIn,
  type ClaudeConnect,
  type ClaudeSignIn,
  type KeyConnect,
  type KeyProvider,
  type AIModelsModel as Model,
  type ModelAccount,
  claude,
  grok,
  keyFieldName,
  keyFieldNote,
  keyHint,
  kindName,
  planName,
  planPage,
  planUsageLines,
  planUsageUpdated,
  plansPage,
  providerName,
  shownAddress,
  shownName,
  signedInByCode,
  startProblem,
  statusWords,
  usable,
  usageLine,
} from '../core/aiModels'
import { providerIconURL } from '../core/connectCards'
import { keyConsent, modelConsent } from '../core/connectConsent'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { classes } from './classes'
import { copyText } from './clipboard'
import { AppLogoTile } from './ConnectCards'
import './ConnectCards.css'
import { useConnector } from './connector'
import { ContextMenu, type MenuLine } from './ContextMenu'
import { Alert, Sheet } from './Dialogs'
import './SettingsModels.css'
import {
  PanelDisc,
  SettingsGroup,
  SettingsLine,
  SettingsLinkRow,
  SettingsPill,
  SettingsSymbol,
} from './SettingsParts'
import { UsageMeterLine } from './SettingsUsage'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

export function SettingsModelsPage({ store }: { store: AppStore }) {
  const model = store.aiModels
  useWatched(model)
  const connector = useConnector()
  /** The provider whose code sheet is open (ChatGPT's, Grok's). */
  const [connectingByCode, setConnectingByCode] = useState<string>()
  const [connectingClaude, setConnectingClaude] = useState(false)
  /** The key provider whose key sheet is open. */
  const [keying, setKeying] = useState<KeyProvider>()
  const [renaming, setRenaming] = useState<ModelAccount>()
  const [disconnecting, setDisconnecting] = useState<ModelAccount>()
  /** The bot whose "Add a bot" sheet is open (`any`: Add, for any other). */
  const [addingBot, setAddingBot] = useState<string>()
  useEffect(() => {
    void model.load()
  }, [model])
  return (
    <div className="models-page">
      <p className="models-lead">
        {t('Connect providers and choose the models your agents use.')}
      </p>
      {!model.loaded ? (
        model.problem !== undefined ? (
          <SettingsGroup>
            <SettingsLine label={model.problem} labelTint="var(--danger)">
              <SettingsPill
                title={t('Try Again')}
                onClick={() => void model.load()}
              />
            </SettingsLine>
          </SettingsGroup>
        ) : (
          <div className="models-loading">
            <span className="settings-spinner" role="progressbar" />
          </div>
        )
      ) : (
        <>
          {model.accounts.length > 0 && (
            <SettingsGroup
              title={t('Connected')}
              footer={
                model.unconnected.length === 0 ? voiceFooter() : undefined
              }
            >
              {model.accounts.map((account, index) => (
                <ModelAccountLine
                  key={account.id}
                  account={account}
                  divided={index > 0}
                  rename={() => setRenaming(account)}
                  addAnother={
                    account.kind === 'api_key'
                      ? () => setKeying(model.keyProvider(account.provider))
                      : signedInByCode.has(account.provider)
                        ? () => setConnectingByCode(account.provider)
                        : undefined
                  }
                  connectAgain={() =>
                    account.kind === 'api_key'
                      ? setKeying(model.keyProvider(account.provider))
                      : account.provider === claude
                        ? setConnectingClaude(true)
                        : setConnectingByCode(account.provider)
                  }
                  disconnect={() => setDisconnecting(account)}
                />
              ))}
            </SettingsGroup>
          )}
          {model.unconnected.length > 0 && (
            <SettingsGroup title={t('Subscriptions')} footer={voiceFooter()}>
              {model.unconnected.map((provider, index) => (
                <ProviderLine
                  key={provider}
                  provider={provider}
                  divided={index > 0}
                >
                  <SettingsPill
                    title={t('Connect')}
                    onClick={() => {
                      const open = async () =>
                        provider === claude
                          ? setConnectingClaude(true)
                          : setConnectingByCode(provider)
                      // The consent an app's Connect shows, then the sign-in (9 November 2026, the founder: "have it like when you connect an app").
                      if (connector)
                        connector.ask(providerName(provider), open, {
                          signIn: false,
                          consent: modelConsent(provider),
                        })
                      else void open()
                    }}
                  />
                </ProviderLine>
              ))}
            </SettingsGroup>
          )}
          {model.unconnectedKeys.length > 0 && (
            <SettingsGroup
              title={t('API keys')}
              footer={t('Each provider bills the calls on your key.')}
            >
              {model.unconnectedKeys.map((one, index) => (
                <ProviderLine
                  key={one.provider}
                  provider={one.provider}
                  name={one.name}
                  hint={keyHint(one.provider)}
                  divided={index > 0}
                >
                  {one.available ? (
                    <SettingsPill
                      title={t('Connect')}
                      onClick={() => {
                        const open = async () => setKeying(one)
                        // The consent an app's Connect shows, in a key's words, then the key sheet.
                        if (connector)
                          connector.ask(one.name, open, {
                            signIn: false,
                            consent: keyConsent(one.provider, one.name),
                          })
                        else void open()
                      }}
                    />
                  ) : (
                    <span className="models-soon">{t('Soon')}</span>
                  )}
                </ProviderLine>
              ))}
            </SettingsGroup>
          )}
          <BotsGroup add={setAddingBot} />
          {model.problem !== undefined && (
            <p className="models-problem" role="alert">
              {model.problem}
            </p>
          )}
        </>
      )}
      {connectingByCode !== undefined && (
        <ChatGPTConnectSheet
          model={model}
          provider={connectingByCode}
          close={() => setConnectingByCode(undefined)}
        />
      )}
      {keying && (
        <KeyConnectSheet
          model={model}
          provider={keying}
          close={() => setKeying(undefined)}
        />
      )}
      {connectingClaude && (
        <ClaudeConnectSheet
          model={model}
          close={() => setConnectingClaude(false)}
        />
      )}
      {addingBot !== undefined && (
        <AddBotSheet bot={addingBot} close={() => setAddingBot(undefined)} />
      )}
      {renaming && (
        <RenameAccountAlert
          account={renaming}
          rename={(name) => {
            setRenaming(undefined)
            void model.rename(renaming, name)
          }}
          cancel={() => setRenaming(undefined)}
        />
      )}
      {disconnecting && (
        <Alert
          title={t`Disconnect ${shownName(disconnecting)}?`}
          message={t(
            'Your agents stop using this account. You can connect it again anytime.',
          )}
          action={t('Disconnect')}
          destructive
          cancel={t('Cancel')}
          onAction={() => {
            setDisconnecting(undefined)
            void model.disconnect(disconnecting)
          }}
          onCancel={() => setDisconnecting(undefined)}
        />
      )}
    </div>
  )
}

// MARK: Bots

/** Where a bot reaches the person's agents (the server's MCP endpoint, `simeon/desktop/mcp.py`). */
export const botsAddress = 'https://api.simeonlabs.com/mcp'

/**
 * The bots the person can give Simeon to (10 November 2026, the founder,
 * with another app's Bots as the reference: "i want it to talk to other
 * agents like dots, muse etc"), each with its own mascot (the founder's
 * pictures, `assets/providers/<id>.png`) and its own words in its sheet
 * ("Give this to your Muse."). Their names are theirs, never translated:
 * Grok Bot is xAI's assistant (x.ai/bot), named as it is (the founder: "call
 * it what it is").
 */
const bots: readonly {
  id: string
  name: string
  line: () => string
  give: () => string
}[] = [
  {
    id: 'dots',
    name: 'Dots',
    line: () => t('Connect Simeon to ChatGPT Dots.'),
    give: () => t('Give this to your Dot.'),
  },
  {
    id: 'muse',
    name: 'Muse',
    line: () => t('Connect Simeon to Meta Muse.'),
    give: () => t('Give this to your Muse.'),
  },
  {
    id: 'grokbot',
    name: 'Grok Bot',
    line: () => t('Connect Simeon to Grok.'),
    give: () => t('Give this to your Bot.'),
  },
]

/** Under API keys: each bot with a + at its end, then Add for any other (the reference's last row: a + and "Add" in grey). */
function BotsGroup({ add }: { add: (bot: string) => void }) {
  return (
    <SettingsGroup title={t('Bots')}>
      {bots.map((bot, index) => (
        <div
          key={bot.id}
          className={index > 0 ? 'models-line divided' : 'models-line'}
        >
          <ProviderIcon provider={bot.id} side={28} />
          <span className="models-words">
            <span className="models-title">{bot.name}</span>
            <span className="models-subtitle">{bot.line()}</span>
          </span>
          <PanelDisc
            symbol="plus"
            label={bot.name}
            onClick={() => add(bot.id)}
          />
        </div>
      ))}
      <button
        type="button"
        className="models-line divided bots-any"
        onClick={() => add('any')}
      >
        <span className="bots-any-plus">
          <SettingsSymbol name="plus" size={14} weight={1.3} />
        </span>
        <span className="bots-any-words">{t('Add')}</span>
      </button>
    </SettingsGroup>
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
  const known = bots.find((one) => one.id === bot)
  const title = known?.name ?? t('Add a bot')
  const copy = async () => {
    await copyText(botsAddress)
    setCopied(true)
  }
  return (
    <Sheet label={title} close={close} className="models-sheet bots-sheet">
      <div className="models-sheet-head">
        {known ? (
          <ProviderIcon provider={known.id} side={44} />
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
        <span className="bots-address-text">{botsAddress}</span>
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
            'It signs in to Simeon once, with your permission. Then it can list your agents, message them and read their answers, and nothing else of your account.',
          )}
        </p>
      )}
    </Sheet>
  )
}

/** The line under the groups: what still uses Simeon's credits. */
function voiceFooter(): string {
  return t('Voice calls, dictation and video still use your Simeon credits.')
}

/** One account (`MacModelAccountLine`): its app's icon, its name over "Subscription", how it stands, and `⋯`. Its plan's usage is in Usage & Billing (`SubscriptionsGroup`). */
function ModelAccountLine({
  account,
  divided,
  rename,
  addAnother,
  connectAgain,
  disconnect,
}: {
  account: ModelAccount
  divided: boolean
  rename: () => void
  /** ChatGPT's: another ChatGPT account, from here rather than a second row under Subscriptions. */
  addAnother?: () => void
  connectAgain: () => void
  disconnect: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const items: MenuLine[] = [
    ...(addAnother
      ? [{ label: t('Add Another'), bare: true, action: addAnother }]
      : []),
    ...(account.status === 'signed_out'
      ? [{ label: t('Connect Again'), bare: true, action: connectAgain }]
      : []),
    { label: t('Rename'), bare: true, action: rename },
    'separator',
    {
      label: t('Disconnect'),
      bare: true,
      destructive: true,
      action: disconnect,
    },
  ]
  return (
    <div className={divided ? 'models-line divided' : 'models-line'}>
      <ProviderIcon provider={account.provider} side={28} />
      <span className="models-words">
        <span className="models-title">{shownName(account)}</span>
        <span className="models-subtitle">{kindName(account)}</span>
      </span>
      {/* How it stands, beside `⋯` (the founder's reference: "● Usage available ⋯"). */}
      <span
        className={
          usable(account)
            ? 'models-status usable'
            : account.status === 'signed_out'
              ? 'models-status signed-out'
              : 'models-status'
        }
      >
        <span className="models-status-dot" aria-hidden="true" />
        {statusWords(account)}
      </span>
      <button
        ref={button}
        type="button"
        className="models-more"
        title={t('More')}
        aria-label={t('More')}
        aria-haspopup="menu"
        aria-expanded={menu !== undefined}
        onClick={() => {
          const box = button.current?.getBoundingClientRect()
          if (box) setMenu({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="13" cy="8" r="1.3" fill="currentColor" />
        </svg>
      </button>
      {menu && (
        <ContextMenu
          items={items}
          at={menu}
          close={() => setMenu(undefined)}
          label={shownName(account)}
        />
      )}
    </div>
  )
}

/**
 * Usage & Billing's "Subscriptions" (`SubscriptionsGroup`; 9 November 2026,
 * the founder: "if one is connected, have Simeon usage, and below a tab
 * Subscriptions, with claude or chat gpt usage and we can click on it and
 * it takes us to the page"): each connected account, its app's icon, its
 * name over how much of its plan is used ("5-hour limit 42% · Weekly limit
 * 18%"; its plan before its first use; "Signed out" in red), and `›` to its
 * page. None while nothing is connected, so Usage & Billing stays as it was.
 */
export function SubscriptionsGroup({ store }: { store: AppStore }) {
  const model = store.aiModels
  const windowModel = useWindowModel()
  useWatched(model)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    void model.load()
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [model])
  if (model.accounts.length === 0) return null
  return (
    <SettingsGroup title={t('Subscriptions')}>
      {model.accounts.map((account, index) => {
        const signedOut = account.status === 'signed_out'
        return (
          <button
            key={account.id}
            type="button"
            className={classes('subscription-line', index > 0 && 'divided')}
            onClick={() => windowModel.showModelAccount(account.id)}
          >
            <ProviderIcon provider={account.provider} side={28} />
            <span className="models-words">
              <span className="models-title">{shownName(account)}</span>
              <span
                className={classes(
                  'models-subtitle',
                  signedOut && 'signed-out',
                )}
              >
                {signedOut
                  ? statusWords(account, { now })
                  : usageLine(account, { now })}
              </span>
            </span>
            <span className="settings-link-chevron">
              <SettingsSymbol name="chevronRight" size={10} weight={1.7} />
            </span>
          </button>
        )
      })}
    </SettingsGroup>
  )
}

/**
 * A connected AI account's page (`SettingsModelAccountPage`), from Usage &
 * Billing's Subscriptions (9 November 2026, the founder: "it should look
 * like usage and billing ... then a way to go to their plan in claude or
 * chat website"): "Usage", the plan's 5-hour and weekly limits drawn as
 * Usage & Billing's meters (`UsageMeterLine`), with when the provider last
 * said it under; then "Plan", the plan and Manage Plan ↗, the provider's own
 * page (Codex's usage on chatgpt.com, claude.ai's), in a new tab (in the
 * Windows app, the default browser). Back goes to Usage & Billing; an
 * account disconnected meanwhile goes back there too.
 */
export function SettingsModelAccountPage({ store }: { store: AppStore }) {
  const model = store.aiModels
  const windowModel = useWindowModel()
  useWatched(model)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    void model.load()
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [model])
  const overlay = windowModel.overlay
  const id = overlay?.kind === 'settings' ? overlay.modelAccount : undefined
  const account = model.accounts.find((one) => one.id === id)
  const gone = model.loaded && account === undefined
  useEffect(() => {
    if (gone) windowModel.showSettingsPage('usage')
  }, [gone, windowModel])
  if (!account) return null
  const lines = account.usage ? planUsageLines(account.usage, { now }) : []
  const named = account.plan ? planName(account.plan) : ''
  const page = planPage(account)
  return (
    <div className="models-page">
      <SettingsGroup
        title={t('Usage')}
        footer={
          lines.length > 0 && account.usage
            ? planUsageUpdated(account.usage, { now })
            : undefined
        }
      >
        {lines.length === 0 ? (
          <SettingsLine
            label={t`Shown after your agents next use ${providerName(account.provider)}.`}
          />
        ) : (
          lines.map((line, index) => (
            <UsageMeterLine
              key={line.title}
              title={line.title}
              meter={line.meter}
              divided={index > 0}
            />
          ))
        )}
      </SettingsGroup>
      {(named !== '' || page !== undefined) && (
        <SettingsGroup title={t('Plan')}>
          {named !== '' && <SettingsLine label={t`Current plan: ${named}`} />}
          {page !== undefined && (
            <SettingsLinkRow
              label={t('Manage Plan')}
              divided={named !== ''}
              external
              onClick={() => openPage(page)}
            />
          )}
        </SettingsGroup>
      )}
    </div>
  )
}

/**
 * A provider's app icon, whole, as Wallet draws Link's and Shop's
 * (`MacProviderIcon`, the `.app-icon` of the connect cards; the founder, 9
 * November 2026: "how link and shop have their full logo, not inside a
 * box"): ChatGPT's and Claude's own, from the App Store (`appLogo`).
 */
export function ProviderIcon({
  provider,
  side,
}: {
  provider: string
  side: number
}) {
  // The provider's own tile (the API key providers' too, by their slug), else the connect cards' logo or letter.
  const url = providerIconURL(provider)
  if (url !== undefined)
    return (
      <span
        className="app-icon"
        style={{ width: side, height: side, borderRadius: side * 0.2237 }}
        aria-hidden="true"
      >
        <img src={url} alt="" />
      </span>
    )
  return <AppLogoTile name={providerName(provider)} side={side} />
}

/** A provider not yet connected, under Subscriptions or API keys (`MacProviderLine`): its app's icon, its name (and a line under it, where it has one), and Connect. */
function ProviderLine({
  provider,
  name,
  hint,
  divided,
  children,
}: {
  provider: string
  /** The server's name for a key provider; a plan's own otherwise. */
  name?: string
  hint?: string
  divided?: boolean
  children?: ReactNode
}) {
  return (
    <div className={divided ? 'models-line divided' : 'models-line'}>
      <ProviderIcon provider={provider} side={28} />
      <span className="models-words">
        <span className="models-title">{name ?? providerName(provider)}</span>
        {hint !== undefined && (
          <span className="models-subtitle models-hint">{hint}</span>
        )}
      </span>
      {children != null && (
        <span className="models-provider-end">{children}</span>
      )}
    </div>
  )
}

/**
 * The account's own name (the Mac's alert with a field, "Rename account"):
 * the window's alert, the field holding its name, Cancel and Rename.
 * Return renames, Escape cancels.
 */
function RenameAccountAlert({
  account,
  rename,
  cancel,
}: {
  account: ModelAccount
  rename: (name: string) => void
  cancel: () => void
}) {
  const [name, setName] = useState(shownName(account))
  const field = useRef<HTMLInputElement>(null)
  const latest = useRef(cancel)
  useEffect(() => {
    latest.current = cancel
  })
  // The field takes the keys as the alert opens, and gives them back to what had them when it closes.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    field.current?.focus()
    field.current?.select()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [])
  // Escape over the window, before anything under it (Settings' own).
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const title = t('Rename account')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    rename(name)
  }
  return (
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <form
        className="alert"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={submit}
      >
        <img
          className="alert-mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          aria-hidden="true"
        />
        <div className="alert-title">{title}</div>
        <input
          ref={field}
          className="models-alert-field"
          value={name}
          placeholder={t('Account name')}
          aria-label={t('Account name')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="alert-buttons">
          <button type="button" className="alert-button" onClick={cancel}>
            {t('Cancel')}
          </button>
          <button type="submit" className="alert-button default">
            {t('Rename')}
          </button>
        </div>
      </form>
    </div>
  )
}

/** A page of the web opened in a new tab, without `opener` or the referrer (in the Windows app, the default browser). */
function openPage(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Connect ChatGPT (`MacChatGPTConnectSheet`; Reason's sheet: "Copy this
 * code", "Enter it on … and approve", "Waiting for you to approve…"): the
 * code, big, with Copy; the page to enter it on, with Open; the wait, and
 * nothing more (9 November 2026, the founder: "all the many explanation…
 * needs gone"). Connected, it says which model the agents now use. The code
 * lasts 15 minutes; closing the sheet stops the asking.
 */
function ChatGPTConnectSheet({
  model,
  provider,
  close,
}: {
  model: Model
  /** ChatGPT, or Grok (10 November 2026: the same sheet, Grok's page and code). */
  provider: string
  close: () => void
}) {
  const [signIn, setSignIn] = useState<ChatGPTSignIn>()
  const [outcome, setOutcome] = useState<ChatGPTPoll>()
  const [copied, setCopied] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // A code, then the wait for the person's approval; a new attempt starts afresh. Closing the sheet ends the wait.
  useEffect(() => {
    const ending = new AbortController()
    model.clearProblem()
    void (async () => {
      const started = await model.startCodeSignIn(provider)
      if (ending.signal.aborted || !started) return
      setSignIn(started)
      const answer = await model.waitForApproval(started, ending.signal)
      if (ending.signal.aborted || answer.kind === 'waiting') return
      setOutcome(answer)
    })()
    return () => ending.abort()
  }, [model, attempt, provider])

  const again = () => {
    setSignIn(undefined)
    setOutcome(undefined)
    setCopied(false)
    setAttempt((now) => now + 1)
  }

  const tryAgain = (
    <div className="models-sheet-end">
      <button type="button" className="models-wide" onClick={again}>
        {t('Try Again')}
      </button>
    </div>
  )

  const body = () => {
    if (outcome?.kind === 'connected')
      return <ConnectedEnd provider={provider} close={close} />
    if (outcome?.kind === 'expired' || outcome?.kind === 'failed')
      return (
        <>
          <p className="models-sheet-problem" role="alert">
            {outcome.kind === 'expired'
              ? t('The code expired. Try again.')
              : provider === grok
                ? t("Grok didn't connect. Try again.")
                : t("ChatGPT didn't connect. Try again.")}
          </p>
          {tryAgain}
        </>
      )
    if (outcome?.kind === 'notAllowed') {
      // Signed in, on a plan xAI doesn't let in here: why, and where to get one that is.
      const plans = plansPage(provider)
      return (
        <>
          <p className="models-sheet-words" role="alert">
            {startProblem('not_allowed', provider)}
          </p>
          {plans !== undefined && (
            <div className="models-sheet-end">
              <button
                type="button"
                className="models-wide"
                onClick={() => openPage(plans)}
              >
                {t('See Grok Plans')}
              </button>
            </div>
          )}
          <div className="models-sheet-again">
            <SettingsPill title={t('Try Again')} onClick={again} />
          </div>
        </>
      )
    }
    if (signIn)
      return (
        <ConnectSteps
          signIn={signIn}
          copied={copied}
          copy={() => {
            copyText(signIn.userCode).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        />
      )
    if (model.problem !== undefined)
      return (
        <>
          <p className="models-sheet-problem" role="alert">
            {model.problem}
          </p>
          {tryAgain}
        </>
      )
    return (
      <div className="models-waiting">
        <span className="settings-spinner" aria-hidden="true" />
        {t('Getting a code…')}
      </div>
    )
  }

  return (
    <Sheet
      label={t`Connect ${providerName(provider)}`}
      close={close}
      className="models-sheet"
    >
      <div className="models-sheet-head">
        <ProviderIcon provider={provider} side={36} />
        <h2 className="models-sheet-title">
          {t`Connect ${providerName(provider)}`}
        </h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
      </div>
      {body()}
    </Sheet>
  )
}

/**
 * Connect Claude (`MacClaudeConnectSheet`; the founder's screenshot of
 * Reason's: Claude Code's own sign-in): a spinner while the computer starts
 * it; 1, Claude's page, with Open; 2, the code Claude shows, pasted and sent
 * to the computer; nothing more. Connected, it says which model the agents
 * now use. Closed before the code, the computer's sign-in ends.
 */
function ClaudeConnectSheet({
  model,
  close,
}: {
  model: Model
  close: () => void
}) {
  const [signIn, setSignIn] = useState<ClaudeSignIn>()
  const [code, setCode] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [outcome, setOutcome] = useState<ClaudeConnect>()
  const [attempt, setAttempt] = useState(0)

  // Claude Code's sign-in started afresh on the computer; a new attempt starts again.
  useEffect(() => {
    let ended = false
    model.clearProblem()
    void (async () => {
      const started = await model.startClaude()
      if (!ended) setSignIn(started)
    })()
    return () => {
      ended = true
    }
  }, [model, attempt])

  const again = () => {
    setSignIn(undefined)
    setOutcome(undefined)
    setCode('')
    setFinishing(false)
    setAttempt((now) => now + 1)
  }

  const finish = async (event?: FormEvent) => {
    event?.preventDefault()
    const typed = code.trim()
    if (typed === '' || finishing) return
    setFinishing(true)
    const answer = await model.finishClaude(typed)
    setCode('')
    setFinishing(false)
    setOutcome(answer)
  }

  // Closed while Claude Code waits for its code: the sign-in ends on the computer.
  const shut = () => {
    if (signIn !== undefined && outcome === undefined) void model.cancelClaude()
    close()
  }

  const tryAgain = (
    <div className="models-sheet-end">
      <button type="button" className="models-wide" onClick={again}>
        {t('Try Again')}
      </button>
    </div>
  )

  const body = () => {
    if (outcome?.kind === 'connected')
      return <ConnectedEnd provider={claude} close={close} />
    if (outcome)
      return (
        <>
          <p className="models-sheet-problem" role="alert">
            {outcome.kind === 'refused'
              ? t("That code didn't work. Try again.")
              : (model.problem ?? t("That code didn't work. Try again."))}
          </p>
          {tryAgain}
        </>
      )
    if (signIn)
      return (
        <form className="models-steps" onSubmit={(event) => void finish(event)}>
          <ConnectStep number={1} title={t("Open Claude's page and approve")}>
            <SettingsPill
              title={t('Open')}
              onClick={() => openPage(signIn.url)}
            />
          </ConnectStep>
          <ConnectStep number={2} title={t('Paste the code Claude shows')}>
            {/* The rows' box (the Credentials Store's), its ground darker than the sheet's in dark mode, so where to paste is plain; the keys in it at once, so ⌘V or Ctrl+V pastes the code. */}
            <input
              className="models-code-field"
              value={code}
              placeholder={t('Code')}
              aria-label={t('Code')}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              disabled={finishing}
              onChange={(event) => setCode(event.target.value)}
            />
          </ConnectStep>
          <div className="models-sheet-end">
            <button
              type="submit"
              className="models-wide"
              disabled={!finishing && code.trim() === ''}
            >
              {finishing && (
                <span className="models-wheel" aria-hidden="true" />
              )}
              {t('Connect')}
            </button>
          </div>
        </form>
      )
    if (model.problem !== undefined)
      return (
        <>
          <p className="models-sheet-problem" role="alert">
            {model.problem}
          </p>
          {tryAgain}
        </>
      )
    return (
      <div className="models-waiting">
        <span className="settings-spinner" role="progressbar" />
      </div>
    )
  }

  return (
    <Sheet label={t('Connect Claude')} close={shut} className="models-sheet">
      <div className="models-sheet-head">
        <ProviderIcon provider={claude} side={36} />
        <h2 className="models-sheet-title">{t('Connect Claude')}</h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={shut} />
      </div>
      {body()}
    </Sheet>
  )
}

/**
 * Connect a provider's API key (`MacKeyConnectSheet`; 10 November 2026):
 * 1, the provider's own page to make a key on, with Open; 2, the key
 * pasted, hidden as a password is, and the details the provider needs
 * (Azure's endpoint and deployments, Cloudflare's account, Bedrock's
 * region), each named; Connect. The server tries the key at the provider
 * before keeping it, so a refused key is said here, in the provider's name,
 * and the sheet stays to try again. Connected, the key's best model is
 * chosen when the person had none.
 */
function KeyConnectSheet({
  model,
  provider,
  close,
}: {
  model: Model
  provider: KeyProvider
  close: () => void
}) {
  const [key, setKey] = useState('')
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      provider.fields.map((one) => [one.key, one.default ?? '']),
    ),
  )
  const [checking, setChecking] = useState(false)
  const [outcome, setOutcome] = useState<KeyConnect>()
  const keyField = useRef<HTMLInputElement>(null)
  const ready =
    key.trim() !== '' &&
    provider.fields.every((one) => (fields[one.key] ?? '').trim() !== '')

  // The keys in the field once the sheet is up (the sheet takes them first), so ⌘V or Ctrl+V pastes at once, as on the Mac.
  useEffect(() => {
    const frame = requestAnimationFrame(() => keyField.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  // Refused, the field is enabled again, empty: the keys go back to it.
  useEffect(() => {
    if (!checking && outcome?.kind === 'refused') keyField.current?.focus()
  }, [checking, outcome])

  const connect = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready || checking) return
    setChecking(true)
    const answer = await model.connectKey(provider.provider, key, fields)
    setChecking(false)
    setOutcome(answer)
    // Refused, the key is cleared: it is pasted again, never kept here.
    if (answer.kind === 'refused') setKey('')
  }

  const title = t`Connect ${provider.name}`
  return (
    <Sheet label={title} close={close} className="models-sheet">
      <div className="models-sheet-head">
        <ProviderIcon provider={provider.provider} side={36} />
        <h2 className="models-sheet-title">{title}</h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
      </div>
      {outcome?.kind === 'connected' ? (
        <ConnectedEnd provider={provider.provider} close={close} />
      ) : (
        <form
          className="models-steps"
          onSubmit={(event) => void connect(event)}
        >
          {provider.keyPage !== undefined && (
            <ConnectStep
              number={1}
              title={t`Make a key on ${provider.name}'s page`}
            >
              <SettingsPill
                title={t('Open')}
                onClick={() => openPage(provider.keyPage ?? '')}
              />
            </ConnectStep>
          )}
          <ConnectStep
            number={provider.keyPage !== undefined ? 2 : 1}
            title={t('Paste your API key')}
          >
            {/* Hidden as a password is, never filled in by the browser. */}
            <input
              ref={keyField}
              className="models-code-field"
              type="password"
              value={key}
              placeholder={t('API key')}
              aria-label={t('API key')}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={checking}
              onChange={(event) => {
                setKey(event.target.value)
                if (outcome?.kind === 'refused') setOutcome(undefined)
              }}
            />
            {provider.fields.map((one) => (
              <label key={one.key} className="models-key-detail">
                <span className="models-key-detail-name">
                  {keyFieldName(one.key)}
                </span>
                <input
                  className="models-code-field"
                  value={fields[one.key] ?? ''}
                  placeholder={one.placeholder}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={checking}
                  onChange={(event) => {
                    const value = event.target.value
                    setFields((now) => ({ ...now, [one.key]: value }))
                  }}
                />
                {keyFieldNote(one.key) !== undefined && (
                  <span className="models-key-detail-note">
                    {keyFieldNote(one.key)}
                  </span>
                )}
              </label>
            ))}
          </ConnectStep>
          {outcome?.kind === 'refused' && (
            <p className="models-sheet-problem" role="alert">
              {outcome.problem}
            </p>
          )}
          <div className="models-sheet-end">
            <button
              type="submit"
              className="models-wide"
              disabled={!checking && !ready}
            >
              {checking && <span className="models-wheel" aria-hidden="true" />}
              {checking ? t`Checking with ${provider.name}…` : t('Connect')}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

/** Connected (both sheets): the green tick and "Connected", "You're now connected to Claude." (the founder: "just say you're now connected to claude"), and Done. */
function ConnectedEnd({
  provider,
  close,
}: {
  provider: string
  close: () => void
}) {
  return (
    <>
      <div className="models-connected">
        <span className="models-connected-title">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="8" fill="currentColor" />
            <path
              d="M4.6 8.3l2.2 2.2 4.6-4.8"
              fill="none"
              stroke="var(--grouped-ground)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t('Connected')}
        </span>
        <span className="models-sheet-words">
          {t`You're now connected to ${providerName(provider)}.`}
        </span>
      </div>
      <div className="models-sheet-end">
        <button type="button" className="models-wide" onClick={close}>
          {t('Done')}
        </button>
      </div>
    </>
  )
}

/** The steps (`steps`): 1, the code with Copy; 2, the page with Open; the wait. */
function ConnectSteps({
  signIn,
  copied,
  copy,
}: {
  signIn: ChatGPTSignIn
  copied: boolean
  copy: () => void
}) {
  return (
    <div className="models-steps">
      <ConnectStep number={1} title={t('Copy this code')}>
        <span className="models-code-row">
          <span className="models-code">{signIn.userCode}</span>
          <SettingsPill
            title={copied ? t('Copied') : t('Copy')}
            onClick={copy}
          />
        </span>
      </ConnectStep>
      <ConnectStep
        number={2}
        title={t`Enter it on ${shownAddress(signIn)} and approve`}
      >
        <SettingsPill
          title={t('Open')}
          onClick={() => openPage(signIn.verificationURL)}
        />
      </ConnectStep>
      <div className="models-waiting">
        <span className="settings-spinner" aria-hidden="true" />
        {t('Waiting for you to approve…')}
      </div>
    </div>
  )
}

/** One step (`MacConnectStep`): its number in a grey disc, its words, and what goes with it under them. */
function ConnectStep({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <div className="models-step">
      <span className="models-step-number" aria-hidden="true">
        {number}
      </span>
      <span className="models-step-words">
        <span className="models-sheet-words">{title}</span>
        {children}
      </span>
    </div>
  )
}
