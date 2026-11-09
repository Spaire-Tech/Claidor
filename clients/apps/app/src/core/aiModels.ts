// AI Models (the core's AIModels.swift, 8 November 2026; the founder: "allow
// people to bring their own subscriptions and charge only for the
// computer", then "use codex sign in"). The person connects their own
// ChatGPT account and chooses one of its models; their agents then think,
// search and draw on it, not on Simeon's credits (voice calls, dictation and
// video stay on Simeon's). Simeon Labs' server keeps the sign-in, sealed,
// and makes the calls (server/simeon/desktop/model_accounts.py,
// own_models.py); the app only shows the accounts, runs the sign-in and
// says which model is chosen.
//
// The sign-in is OpenAI's device code, under Codex's own sign-in until
// OpenAI approves Simeon's: the app shows a code, the person enters it on
// OpenAI's page (which names Codex) and approves, and the app asks the
// server every few seconds until it says connected.
//
// Claude (9 November 2026; docs/your-own-models.md, section 6) is signed in
// to in Claude Code on the person's own computer, never on Simeon's server:
// the computer starts Claude Code's sign-in and gives its link, the person
// approves on claude.ai and pastes the code Claude shows, which goes straight
// to Claude Code (the computer's `claudeCodeSignIn…` commands); the server
// then keeps only that Claude is connected, its e-mail and plan. Shared with
// Settings' page (src/window/SettingsModels.tsx).

import { SimeonAPIError } from './api'
import { GatewayError } from './gatewayConnection'
import { type JSONValue, arr, field, int, num, str, text } from './json'
import { t } from './l10n'
import { displayLocale } from './listTime'

export const chatGPT = 'chatgpt'
export const claude = 'claude'
/** Where Claude Code's sign-in link may point (claude.ai's own pages). */
const claudeHosts = new Set([
  'claude.com',
  'claude.ai',
  'platform.claude.com',
  'console.anthropic.com',
])

export type ModelAccountStatus = 'available' | 'limited' | 'signed_out'

/** One account as the server lists it (`ModelAccount`). */
export interface ModelAccount {
  id: string
  /** `chatgpt` for now. */
  provider: string
  /** `subscription` (a sign-in) or, later, `api_key`. */
  kind: string
  /** The account's e-mail, or the person's own name for it. */
  label: string
  /** The provider's plan as it names it (`plus`, `pro`), when it does. */
  plan?: string
  status: ModelAccountStatus
  /** When the plan's limit ends, in milliseconds. */
  limitedUntil?: number
}

export function modelAccount(
  json: JSONValue | undefined,
): ModelAccount | undefined {
  const id = text(field(json, 'id'))
  const provider = text(field(json, 'provider'))
  if (id === undefined || provider === undefined) return undefined
  const status = str(field(json, 'status'))
  return {
    id,
    provider,
    kind: text(field(json, 'kind')) ?? 'subscription',
    label: text(field(json, 'label')) ?? providerName(provider),
    plan: text(field(json, 'plan')),
    status:
      status === 'limited' || status === 'signed_out' ? status : 'available',
    limitedUntil: num(field(json, 'limitedUntil')),
  }
}

/** A provider's name as people know it. */
export function providerName(provider: string): string {
  if (provider === chatGPT) return 'ChatGPT'
  if (provider === claude) return 'Claude'
  return provider.slice(0, 1).toUpperCase() + provider.slice(1)
}

/** ChatGPT's plan as people know it: "plus" is Plus, "prolite" is Pro Lite. */
export function planName(plan: string): string {
  switch (plan.toLowerCase()) {
    case 'prolite':
      return 'Pro Lite'
    case 'promax':
      return 'Pro Max'
    case 'edu':
      return 'Edu'
    default:
      return plan
        .split('_')
        .filter((part) => part !== '')
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(' ')
  }
}

/** The line under its name: "Subscription · Plus". */
export function accountDetail(account: ModelAccount): string {
  const kind = account.kind === 'api_key' ? t('API key') : t('Subscription')
  return account.plan ? `${kind} · ${planName(account.plan)}` : kind
}

/** "4:00 PM" today, else "Thu 4:00 PM", in the app's language (`AIModels.time`). */
export function limitTime(
  ms: number,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): string {
  const now = options.now ?? new Date()
  const locale = options.locale ?? displayLocale()
  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: options.timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(date)
  const date = new Date(ms)
  return new Intl.DateTimeFormat(locale, {
    timeZone: options.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(day(date) === day(now) ? {} : { weekday: 'short' }),
  }).format(date)
}

/** How it stands, in a few words: "Usage available", "Limit reached until 4:00 PM", "Signed out. Connect again." */
export function statusWords(
  account: ModelAccount,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): string {
  const now = options.now ?? new Date()
  switch (account.status) {
    case 'available':
      return t('Usage available')
    case 'signed_out':
      return t('Signed out. Connect again.')
    case 'limited':
      if (account.limitedUntil === undefined || account.limitedUntil <= +now)
        return t('Usage available')
      return t`Limit reached until ${limitTime(account.limitedUntil, { ...options, now })}`
  }
}

/** The status in green: usage there to use. */
export function usable(account: ModelAccount, now: Date = new Date()): boolean {
  switch (account.status) {
    case 'available':
      return true
    case 'signed_out':
      return false
    case 'limited':
      return account.limitedUntil !== undefined && account.limitedUntil <= +now
  }
}

/** One of the person's accounts' models, as `GET models/own` lists them (`OwnModelChoice`). */
export interface OwnModelChoice {
  /** `own:chatgpt:gpt-6.1-sol`, what the server and the engine name it. */
  id: string
  name: string
  provider: string
}

function ownModelChoice(json: JSONValue): OwnModelChoice | undefined {
  const id = text(field(json, 'modelId'))
  if (id === undefined) return undefined
  return {
    id,
    name: text(field(json, 'modelName')) ?? id,
    provider: text(field(json, 'provider')) ?? '',
  }
}

/** A ChatGPT sign-in waiting for the person: the code, where to enter it, how often to ask (`ChatGPTSignIn`). */
export interface ChatGPTSignIn {
  connectId: string
  userCode: string
  verificationURL: string
  /** Seconds between two questions to the server. */
  interval: number
  /** Seconds the code lasts (OpenAI's 15 minutes). */
  expiresIn: number
}

export function chatGPTSignIn(
  json: JSONValue | undefined,
): ChatGPTSignIn | undefined {
  const connectId = text(field(json, 'connectId'))
  const userCode = text(field(json, 'userCode'))
  const url = text(field(json, 'verificationUrl'))
  if (connectId === undefined || userCode === undefined || url === undefined)
    return undefined
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  // Only OpenAI's own page over https is ever opened.
  if (parsed.protocol !== 'https:') return undefined
  return {
    connectId,
    userCode,
    verificationURL: parsed.href,
    interval: Math.max(1, int(field(json, 'interval')) ?? 5),
    expiresIn: Math.max(60, int(field(json, 'expiresIn')) ?? 900),
  }
}

/** The page's address without its scheme, as the sheet writes it: "auth.openai.com/codex/device". */
export function shownAddress(signIn: ChatGPTSignIn): string {
  const url = new URL(signIn.verificationURL)
  return url.pathname === '' || url.pathname === '/'
    ? url.host
    : url.host + url.pathname
}

/** One answer of the server while the person approves (`ChatGPTPoll`). */
export type ChatGPTPoll =
  | { kind: 'waiting' }
  | { kind: 'connected'; account: ModelAccount }
  /** The code ran out, or was used already: the person starts again. */
  | { kind: 'expired' }
  /** OpenAI refused the sign-in. */
  | { kind: 'failed' }

/** What the server's refusal of a sign-in means, in the person's words (`error.code` of `models/accounts/chatgpt/start`). */
export function startProblem(code: string | undefined): string {
  return code === 'device_code_off'
    ? t(
        "ChatGPT didn't allow signing in with a code. Check your ChatGPT security settings, then try again.",
      )
    : t("Couldn't reach ChatGPT. Try again in a moment.")
}

/** Claude's sign-in started in Claude Code on the computer: Anthropic's page to approve on (`ClaudeSignIn`). */
export interface ClaudeSignIn {
  url: string
}

export function claudeSignIn(
  json: JSONValue | undefined,
): ClaudeSignIn | undefined {
  const url = text(field(json, 'url'))
  if (url === undefined) return undefined
  try {
    const parsed = new URL(url)
    // Only Anthropic's own page over https is ever opened.
    if (parsed.protocol !== 'https:' || !claudeHosts.has(parsed.hostname))
      return undefined
    return { url: parsed.href }
  } catch {
    return undefined
  }
}

/** How the code the person pasted went (`ClaudeConnect`). */
export type ClaudeConnect =
  | { kind: 'connected'; account: ModelAccount }
  /** Claude didn't take the code: the person starts again. */
  | { kind: 'refused' }
  /** Claude Code couldn't finish (`problem` says why). */
  | { kind: 'failed' }

/** Why Claude Code's sign-in didn't start: a computer whose engine predates it answers 404. */
export function claudeStartProblem(status: number | undefined): string {
  return status === 404
    ? t('Your computer needs an update before it can run Claude Code.')
    : t("Couldn't start Claude Code on your computer. Try again in a moment.")
}

/** The menu's first choice: the agents on Simeon's own models. */
export function simeonsModels(): string {
  return t("Simeon's models")
}

// MARK: The page's model (`AIModelsModel`)

/** One call to Simeon Labs' server: the path under `/desktop/api/`, its method and body. */
export type AIModelsCall = (
  path: string,
  method?: string,
  body?: JSONValue,
) => Promise<JSONValue>

/** One command to the person's computer (Claude Code's sign-in there), waking it if it rests. */
export type AIModelsCommand = (
  method: string,
  args?: JSONValue,
) => Promise<JSONValue>

const noComputer: AIModelsCommand = () =>
  Promise.reject(new SimeonAPIError(t('Sign in to Simeon first.'), 401))

/** Waits `seconds`, or ends early (rejects) when `signal` aborts. */
export type Sleep = (seconds: number, signal?: AbortSignal) => Promise<void>

const realSleep: Sleep = (seconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop)
      resolve()
    }, seconds * 1000)
    const stop = () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    signal?.addEventListener('abort', stop, { once: true })
  })

/** What was refused, in the server's words (`localizedDescription`). */
function said(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AIModelsModel {
  accounts: ModelAccount[] = []
  /** The models the person may choose (their accounts' signed-in providers'). */
  models: OwnModelChoice[] = []
  /** The model their agents use; none for Simeon's. */
  chosen?: string
  loaded = false
  loading = false
  /** A change to the choice on its way. */
  choosing = false
  /** What went wrong, in the person's words; the page shows it. */
  problem?: string
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(
    private readonly call: AIModelsCall,
    private readonly sleep: Sleep = realSleep,
    private readonly command: AIModelsCommand = noComputer,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /** The chosen model's name, "Simeon's models" when none is. */
  get chosenName(): string {
    if (this.chosen === undefined) return simeonsModels()
    return (
      this.models.find((one) => one.id === this.chosen)?.name ?? simeonsModels()
    )
  }

  /** Whether an account of this provider is connected and signed in. */
  connected(provider: string): boolean {
    return this.accounts.some(
      (one) => one.provider === provider && one.status !== 'signed_out',
    )
  }

  /** The problem shown on the page cleared (a new sign-in starts). */
  clearProblem(): void {
    if (this.problem === undefined) return
    this.problem = undefined
    this.changed()
  }

  async load(): Promise<void> {
    if (this.loading) return
    this.loading = true
    this.changed()
    try {
      const listed = await this.call('models/accounts')
      const own = await this.call('models/own')
      this.accounts = (arr(field(listed, 'accounts')) ?? [])
        .map(modelAccount)
        .filter((one): one is ModelAccount => one !== undefined)
      this.read(own)
      this.loaded = true
      this.problem = undefined
    } catch (error) {
      this.problem = said(error)
    } finally {
      this.loading = false
      this.changed()
    }
  }

  private read(own: JSONValue): void {
    this.models = (arr(field(own, 'models')) ?? [])
      .map(ownModelChoice)
      .filter((one): one is OwnModelChoice => one !== undefined)
    this.chosen = text(field(own, 'model'))
  }

  /** A ChatGPT sign-in started: the code to show; none (and `problem`) when none could be had. */
  async startChatGPT(): Promise<ChatGPTSignIn | undefined> {
    try {
      const answer = await this.call(
        'models/accounts/chatgpt/start',
        'POST',
        {},
      )
      const signIn = chatGPTSignIn(answer)
      this.problem = signIn ? undefined : startProblem(undefined)
      return signIn
    } catch (error) {
      this.problem = startProblem(
        error instanceof SimeonAPIError ? error.code : undefined,
      )
      return undefined
    } finally {
      this.changed()
    }
  }

  /** One question to the server: has the person approved? */
  async poll(signIn: ChatGPTSignIn): Promise<ChatGPTPoll> {
    let answer: JSONValue
    try {
      answer = await this.call('models/accounts/chatgpt/poll', 'POST', {
        connectId: signIn.connectId,
      })
    } catch {
      // The server not reached this time: asked again at the next turn.
      return { kind: 'waiting' }
    }
    switch (str(field(answer, 'status'))) {
      case 'connected': {
        const account = modelAccount(field(answer, 'account'))
        return account ? { kind: 'connected', account } : { kind: 'failed' }
      }
      case 'expired':
        return { kind: 'expired' }
      case 'failed':
        return { kind: 'failed' }
      default:
        return { kind: 'waiting' }
    }
  }

  /**
   * Asks every `interval` seconds until the person has approved, the code
   * ran out, or `signal` ends the wait (the sheet closed: waiting).
   * Connected, the page is read again, and the account's best model chosen
   * when the person had none, so connecting is using.
   */
  async waitForApproval(
    signIn: ChatGPTSignIn,
    signal?: AbortSignal,
  ): Promise<ChatGPTPoll> {
    let waited = 0
    while (waited < signIn.expiresIn) {
      try {
        await this.sleep(signIn.interval, signal)
      } catch {
        return { kind: 'waiting' }
      }
      if (signal?.aborted) return { kind: 'waiting' }
      waited += signIn.interval
      const answer = await this.poll(signIn)
      if (signal?.aborted) return { kind: 'waiting' }
      if (answer.kind === 'waiting') continue
      if (answer.kind === 'connected') {
        await this.load()
        const best = this.models.find((one) => one.provider === chatGPT)
        if (this.chosen === undefined && best) await this.choose(best.id)
      }
      return answer
    }
    return { kind: 'expired' }
  }

  // MARK: Claude, in Claude Code on the computer

  /** Claude Code's sign-in started on the computer: its link; none (and `problem`) when it couldn't start. */
  async startClaude(): Promise<ClaudeSignIn | undefined> {
    try {
      const signIn = claudeSignIn(
        await this.command('claudeCodeSignInStart', {}),
      )
      this.problem = signIn ? undefined : claudeStartProblem(undefined)
      return signIn
    } catch (error) {
      // The computer answers through the gateway (`GatewayError`); a stand-in may answer as the server does.
      this.problem = claudeStartProblem(
        error instanceof GatewayError || error instanceof SimeonAPIError
          ? error.status
          : undefined,
      )
      return undefined
    } finally {
      this.changed()
    }
  }

  /**
   * The code the person pasted, typed at Claude Code's prompt on the
   * computer. Signed in, the server is told (the e-mail and plan Claude Code
   * named, never the sign-in), the page read again and Claude's best model
   * chosen when the person had none.
   */
  async finishClaude(code: string): Promise<ClaudeConnect> {
    const typed = code.trim()
    if (typed === '') return { kind: 'refused' }
    let answer: JSONValue
    try {
      answer = await this.command('claudeCodeSignInFinish', { code: typed })
    } catch {
      this.problem = t("Claude Code didn't finish signing in. Try again.")
      this.changed()
      return { kind: 'failed' }
    }
    if (str(field(answer, 'status')) !== 'connected') {
      const reason = str(field(answer, 'reason'))
      if (reason === 'bad_code' || reason === 'refused')
        return { kind: 'refused' }
      this.problem =
        reason === 'not_installed'
          ? claudeStartProblem(404)
          : t("Claude Code didn't finish signing in. Try again.")
      this.changed()
      return { kind: 'failed' }
    }
    const claudeAccount = field(answer, 'account')
    try {
      const kept = await this.call('models/accounts/claude', 'POST', {
        label: text(field(claudeAccount, 'email')) ?? null,
        plan: text(field(claudeAccount, 'plan')) ?? null,
      })
      const account = modelAccount(field(kept, 'account'))
      if (!account) throw new Error(t("That didn't work."))
      await this.load()
      const best = this.models.find((one) => one.provider === claude)
      if (this.chosen === undefined && best) await this.choose(best.id)
      this.problem = undefined
      return { kind: 'connected', account }
    } catch (error) {
      this.problem = t`Couldn't change the model: ${said(error)}`
      return { kind: 'failed' }
    } finally {
      this.changed()
    }
  }

  /** The sheet closed before the code: Claude Code's sign-in on the computer ends. */
  async cancelClaude(): Promise<void> {
    try {
      await this.command('claudeCodeSignInCancel', {})
    } catch {
      // The computer forgets an unfinished sign-in on its own.
    }
  }

  /** The person's own name for an account; an empty one is not sent. */
  async rename(account: ModelAccount, name: string): Promise<void> {
    const next = name.trim().split(/\s+/).join(' ')
    if (next === '' || next === account.label) return
    try {
      const answer = await this.call(`models/accounts/${account.id}`, 'PATCH', {
        label: next,
      })
      const renamed = modelAccount(field(answer, 'account'))
      if (renamed)
        this.accounts = this.accounts.map((one) =>
          one.id === renamed.id ? renamed : one,
        )
      this.problem = undefined
    } catch (error) {
      this.problem = t`Couldn't rename the account: ${said(error)}`
    } finally {
      this.changed()
    }
  }

  /** Signed out at the provider and forgotten; the choice falls back to Simeon's when it was this provider's last account. */
  async disconnect(account: ModelAccount): Promise<boolean> {
    if (account.provider === claude) {
      // Claude Code signs itself out on the computer; the server forgets the row either way.
      try {
        await this.command('claudeCodeSignOut', {})
      } catch {
        // Signed out at the next sign-in, or with the computer made afresh.
      }
    }
    try {
      await this.call(`models/accounts/${account.id}`, 'DELETE')
      this.accounts = this.accounts.filter((one) => one.id !== account.id)
      try {
        this.read(await this.call('models/own'))
      } catch {
        // The choice is read again when the page next opens.
      }
      this.problem = undefined
      return true
    } catch (error) {
      this.problem = t`Couldn't disconnect the account: ${said(error)}`
      return false
    } finally {
      this.changed()
    }
  }

  /** The model the agents use: one of `models`, or none for Simeon's. The agents follow within five minutes. */
  async choose(model: string | undefined): Promise<void> {
    if (model === this.chosen) return
    this.choosing = true
    this.changed()
    try {
      this.read(await this.call('models/own', 'PUT', { model: model ?? null }))
      this.problem = undefined
    } catch (error) {
      this.problem = t`Couldn't change the model: ${said(error)}`
    } finally {
      this.choosing = false
      this.changed()
    }
  }
}
