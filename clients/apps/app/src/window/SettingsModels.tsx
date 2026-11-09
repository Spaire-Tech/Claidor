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
// the composer (`ComposerModelMenu`), not here. One model for the window
// (`store.aiModels`).
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
  type AIModelsModel as Model,
  type ModelAccount,
  chatGPT,
  claude,
  kindName,
  providerName,
  shownAddress,
  statusWords,
  usable,
} from '../core/aiModels'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { copyText } from './clipboard'
import { AppLogoTile } from './ConnectCards'
import './ConnectCards.css'
import { ContextMenu, type MenuLine } from './ContextMenu'
import { Alert, Sheet } from './Dialogs'
import './SettingsModels.css'
import {
  PanelDisc,
  SettingsGroup,
  SettingsLine,
  SettingsPill,
} from './SettingsParts'
import { useWatched } from './useStore'

export function SettingsModelsPage({ store }: { store: AppStore }) {
  const model = store.aiModels
  useWatched(model)
  const [connectingChatGPT, setConnectingChatGPT] = useState(false)
  const [connectingClaude, setConnectingClaude] = useState(false)
  const [renaming, setRenaming] = useState<ModelAccount>()
  const [disconnecting, setDisconnecting] = useState<ModelAccount>()
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
                    account.provider === chatGPT
                      ? () => setConnectingChatGPT(true)
                      : undefined
                  }
                  connectAgain={() =>
                    account.provider === claude
                      ? setConnectingClaude(true)
                      : setConnectingChatGPT(true)
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
                    onClick={() =>
                      provider === claude
                        ? setConnectingClaude(true)
                        : setConnectingChatGPT(true)
                    }
                  />
                </ProviderLine>
              ))}
            </SettingsGroup>
          )}
          {model.problem !== undefined && (
            <p className="models-problem" role="alert">
              {model.problem}
            </p>
          )}
        </>
      )}
      {connectingChatGPT && (
        <ChatGPTConnectSheet
          model={model}
          close={() => setConnectingChatGPT(false)}
        />
      )}
      {connectingClaude && (
        <ClaudeConnectSheet
          model={model}
          close={() => setConnectingClaude(false)}
        />
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
          title={t`Disconnect ${disconnecting.label}?`}
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

/** The line under the groups: what still uses Simeon's credits. */
function voiceFooter(): string {
  return t('Voice calls, dictation and video still use your Simeon credits.')
}

/** One account (`MacModelAccountLine`): its app's icon, its name over "Subscription" (and how it stands, only when it can't be used), and `⋯`. */
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
        <span className="models-title">{account.label}</span>
        <span className="models-subtitle">
          {kindName(account)}
          {!usable(account) && (
            <>
              {' · '}
              <span
                className={
                  account.status === 'signed_out'
                    ? 'models-status signed-out'
                    : 'models-status'
                }
              >
                {statusWords(account)}
              </span>
            </>
          )}
        </span>
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
          label={account.label}
        />
      )}
    </div>
  )
}

/** The providers' app icons, from the App Store, as the Mac's `Providers/<provider>`. */
const providerIcons: Record<string, string> = {
  [chatGPT]: new URL('../assets/providers/chatgpt.png', import.meta.url).href,
  [claude]: new URL('../assets/providers/claude.png', import.meta.url).href,
}

/**
 * A provider's app icon, whole, as Wallet draws Link's and Shop's
 * (`MacProviderIcon`, the `.app-icon` of the connect cards; the founder, 9
 * November 2026: "how link and shop have their full logo, not inside a
 * box").
 */
export function ProviderIcon({
  provider,
  side,
}: {
  provider: string
  side: number
}) {
  const icon = providerIcons[provider]
  if (icon === undefined)
    return <AppLogoTile name={providerName(provider)} side={side} />
  return (
    <span
      className="app-icon"
      style={{ width: side, height: side, borderRadius: side * 0.2237 }}
      aria-hidden="true"
    >
      <img src={icon} alt="" />
    </span>
  )
}

/** A provider not yet connected, under Subscriptions (`MacProviderLine`): its app's icon, its name, and Connect. */
function ProviderLine({
  provider,
  divided,
  children,
}: {
  provider: string
  divided?: boolean
  children?: ReactNode
}) {
  return (
    <div className={divided ? 'models-line divided' : 'models-line'}>
      <ProviderIcon provider={provider} side={28} />
      <span className="models-words">
        <span className="models-title">{providerName(provider)}</span>
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
  const [name, setName] = useState(account.label)
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
 * code, big, with Copy; the page to enter it on, with Open; a line saying
 * OpenAI's page names Codex (the sign-in Simeon uses for ChatGPT until
 * OpenAI approves its own); the wait. Connected, it says which model the
 * agents now use. The code lasts 15 minutes; closing the sheet stops the
 * asking.
 */
function ChatGPTConnectSheet({
  model,
  close,
}: {
  model: Model
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
      const started = await model.startChatGPT()
      if (ending.signal.aborted || !started) return
      setSignIn(started)
      const answer = await model.waitForApproval(started, ending.signal)
      if (ending.signal.aborted || answer.kind === 'waiting') return
      setOutcome(answer)
    })()
    return () => ending.abort()
  }, [model, attempt])

  const again = () => {
    setSignIn(undefined)
    setOutcome(undefined)
    setCopied(false)
    setAttempt((now) => now + 1)
  }

  const tryAgain = (
    <div className="models-sheet-end">
      <SettingsPill title={t('Try Again')} onClick={again} />
    </div>
  )

  const body = () => {
    if (outcome?.kind === 'connected')
      return <ConnectedEnd model={model} close={close} />
    if (outcome?.kind === 'expired' || outcome?.kind === 'failed')
      return (
        <>
          <p className="models-sheet-problem" role="alert">
            {outcome.kind === 'expired'
              ? t('The code expired. Try again.')
              : t("ChatGPT didn't connect. Try again.")}
          </p>
          {tryAgain}
        </>
      )
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
    <Sheet label={t('Connect ChatGPT')} close={close} className="models-sheet">
      <div className="models-sheet-head">
        <ProviderIcon provider={chatGPT} side={36} />
        <h2 className="models-sheet-title">{t('Connect ChatGPT')}</h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
      </div>
      {body()}
    </Sheet>
  )
}

/**
 * Connect Claude (`MacClaudeConnectSheet`; the founder's screenshot of
 * Reason's: Claude Code's own sign-in): the computer starts Claude Code's
 * sign-in; 1, Claude's page, with Open; 2, the code Claude shows, pasted and
 * sent to Claude Code on the computer; a line saying the sign-in stays there.
 * Connected, it says which model the agents now use. Closed before the code,
 * the computer's sign-in ends.
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
      <SettingsPill title={t('Try Again')} onClick={again} />
    </div>
  )

  const body = () => {
    if (outcome?.kind === 'connected')
      return <ConnectedEnd model={model} close={close} />
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
            <span className="models-code-row">
              <input
                className="models-code-field"
                value={code}
                placeholder={t('Code')}
                aria-label={t('Code')}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={finishing}
                onChange={(event) => setCode(event.target.value)}
              />
              {finishing ? (
                <span className="settings-spinner" role="progressbar" />
              ) : (
                <SettingsPill
                  title={t('Connect')}
                  disabled={code.trim() === ''}
                  onClick={() => void finish()}
                />
              )}
            </span>
          </ConnectStep>
          <p className="models-note">
            {t(
              'Claude Code runs on your computer and keeps this sign-in there. Simeon never sees it.',
            )}
          </p>
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
        <span className="settings-spinner" aria-hidden="true" />
        {t('Starting Claude Code on your computer…')}
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

/** Connected (both sheets): the green tick and "Connected", which model the agents now use, and Done. */
function ConnectedEnd({ model, close }: { model: Model; close: () => void }) {
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
          {t`Your agents now use ${model.chosenName}.`}
        </span>
      </div>
      <div className="models-sheet-end">
        <button type="button" className="models-done" onClick={close}>
          {t('Done')}
        </button>
      </div>
    </>
  )
}

/** The steps (`steps`): 1, the code with Copy; 2, the page with Open; the line about Codex; the wait. */
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
      <p className="models-note">
        {t(
          "OpenAI's page names Codex: it's the sign-in Simeon uses for ChatGPT.",
        )}
      </p>
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
