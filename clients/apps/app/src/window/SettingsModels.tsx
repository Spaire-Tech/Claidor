// Settings' AI Models (mac/Simeon/SettingsModels.swift, the core's
// AIModels.swift; 8 November 2026, the founder: "allow people to bring
// their own subscriptions and charge only for the computer", "do it exactly
// like Reason", then "use codex sign in"): what it is for in a line; the
// model the agents use (Simeon's, or one of the person's own); the accounts
// connected, each its name, its kind and plan, how it stands and a `⋯`
// (Rename, Connect Again, Disconnect); then Subscriptions, ChatGPT's
// Connect, which opens the code sheet.
//
// The web's own ways: the code is copied with the window's clipboard
// (clipboard.ts: the browser's, or the Windows app's); OpenAI's page opens
// in a new tab (in the Windows app, the default browser); the sheet asks
// the server every few seconds while it is open, and closing it stops the
// asking.

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  AIModelsModel,
  type ChatGPTPoll,
  type ChatGPTSignIn,
  type AIModelsModel as Model,
  type ModelAccount,
  accountDetail,
  chatGPT,
  providerName,
  shownAddress,
  simeonsModels,
  statusWords,
  usable,
} from '../core/aiModels'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { copyText } from './clipboard'
import { AppLogoTile } from './ConnectCards'
import { ContextMenu, type MenuLine } from './ContextMenu'
import { Alert, Sheet } from './Dialogs'
import './SettingsModels.css'
import {
  PanelDisc,
  SettingsGroup,
  SettingsLine,
  SettingsMenu,
  SettingsPill,
} from './SettingsParts'
import { useWatched } from './useStore'

export function SettingsModelsPage({ store }: { store: AppStore }) {
  const [model] = useState(() => new AIModelsModel(store.modelsCall))
  useWatched(model)
  const [connecting, setConnecting] = useState(false)
  const [renaming, setRenaming] = useState<ModelAccount>()
  const [disconnecting, setDisconnecting] = useState<ModelAccount>()
  useEffect(() => {
    void model.load()
  }, [model])
  return (
    <div className="models-page">
      <p className="models-lead">
        {t(
          'Connect your own AI subscription. Your agents then think, search and draw on it, not on your Simeon credits.',
        )}
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
          {model.models.length > 0 && (
            <SettingsGroup
              title={t('Your agents use')}
              footer={t(
                "When your ChatGPT limit is reached, your agents use Simeon's models until it resets.",
              )}
            >
              <SettingsMenu<string | undefined>
                label={t('Model')}
                options={[
                  { value: undefined, label: simeonsModels() },
                  ...model.models.map((one) => ({
                    value: one.id,
                    label: one.name,
                  })),
                ]}
                value={model.chosen}
                pending={model.choosing}
                pick={(picked) => void model.choose(picked)}
              />
            </SettingsGroup>
          )}
          {model.accounts.length > 0 && (
            <SettingsGroup title={t('Connected')}>
              {model.accounts.map((account, index) => (
                <ModelAccountLine
                  key={account.id}
                  account={account}
                  divided={index > 0}
                  rename={() => setRenaming(account)}
                  connectAgain={() => setConnecting(true)}
                  disconnect={() => setDisconnecting(account)}
                />
              ))}
            </SettingsGroup>
          )}
          <SettingsGroup
            title={t('Subscriptions')}
            footer={t(
              'Voice calls, dictation and video still use your Simeon credits.',
            )}
          >
            <SettingsLine
              label={providerName(chatGPT)}
              detail={t('Use your ChatGPT plan')}
            >
              <SettingsPill
                title={
                  model.connected(chatGPT) ? t('Add Another') : t('Connect')
                }
                onClick={() => setConnecting(true)}
              />
            </SettingsLine>
          </SettingsGroup>
          {model.problem !== undefined && (
            <p className="models-problem" role="alert">
              {model.problem}
            </p>
          )}
        </>
      )}
      {connecting && (
        <ChatGPTConnectSheet model={model} close={() => setConnecting(false)} />
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

/** One account (`MacModelAccountLine`): the provider's tile, its name over its kind and plan and how it stands (green while usable), and `⋯`. */
function ModelAccountLine({
  account,
  divided,
  rename,
  connectAgain,
  disconnect,
}: {
  account: ModelAccount
  divided: boolean
  rename: () => void
  connectAgain: () => void
  disconnect: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const items: MenuLine[] = [
    { label: t('Rename'), bare: true, action: rename },
    ...(account.status === 'signed_out'
      ? [{ label: t('Connect Again'), bare: true, action: connectAgain }]
      : []),
    'separator',
    {
      label: t('Disconnect'),
      bare: true,
      destructive: true,
      action: disconnect,
    },
  ]
  const tint = usable(account)
    ? 'usable'
    : account.status === 'signed_out'
      ? 'signed-out'
      : undefined
  return (
    <div className={divided ? 'models-line divided' : 'models-line'}>
      <AppLogoTile name={providerName(account.provider)} side={28} />
      <span className="models-words">
        <span className="models-title">{account.label}</span>
        <span className="models-subtitle">
          {`${accountDetail(account)} · `}
          <span className={tint ? `models-status ${tint}` : 'models-status'}>
            {statusWords(account)}
          </span>
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
      return (
        <>
          <div className="models-connected">
            <span className="models-connected-title">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
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
        <AppLogoTile name={providerName(chatGPT)} side={36} />
        <h2 className="models-sheet-title">{t('Connect ChatGPT')}</h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
      </div>
      {body()}
    </Sheet>
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
