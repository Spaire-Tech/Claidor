// Simeon Labs' server, as the Mac app speaks to it
// (ios/SimeonCore/Sources/SimeonCore/SimeonAPI.swift): a bearer on
// `/desktop/api/…` and on the box broker (`/simeon.v1.ComputerService/…`,
// Connect JSON), refreshed at `/oauth/token` with five minutes left. The app
// is the only party that refreshes, so the vault always holds the live pair.
//
// On the web the person is signed in on the website with its cookie, and the
// page trades the cookie for the pair once (`POST /auth/web-session`), as the
// old web app does (desktop/web/api.ts).

import {
  FetchClient,
  type HTTPAnswer,
  type HTTPClient,
  type HTTPRequest,
  answerJSON,
  headerOf,
  isOk,
  postJSON,
} from './http'
import { type JSONValue, bool, field, int, isObject, str, text } from './json'
import { t } from './l10n'
import { currentLanguage, isEnglish, languageCode } from './language'
import { note } from './recentActivity'
import {
  type SessionTokens,
  type TokenPair,
  needsRefresh,
  readRefreshAnswer,
  refreshPath,
  sessionFrom,
  subjectOfAccessToken,
} from './tokens'

export const defaultAPI = 'https://api.simeonlabs.com'
/** What the server stores on the session row (`client_version_of`). */
export const clientVersionHeader = 'x-simeon-client-version'
/** The app's language, on every request: the server answers in it. */
export const languageHeader = 'accept-language'
export const webSessionPath = '/auth/web-session'

/** Where the pair lives between loads: the tab's storage on the web, memory in the tests. */
export interface TokenVault {
  read(): SessionTokens | null
  write(tokens: SessionTokens | null): void
}

export class MemoryVault implements TokenVault {
  constructor(private tokens: SessionTokens | null = null) {}
  read() {
    return this.tokens
  }
  write(tokens: SessionTokens | null) {
    this.tokens = tokens
  }
}

/** The key the old web app keeps the pair under, so a tab moving between the two stays signed in. */
export const tokensKey = 'simeon.web.tokens'

/**
 * The tab's storage (sessionStorage): gone when the tab closes, never shared
 * across tabs, never written to disk by the app.
 */
export function sessionVault(storage: Storage = sessionStorage): TokenVault {
  return {
    read() {
      try {
        const raw = storage.getItem(tokensKey)
        if (raw == null) return null
        const parsed: unknown = JSON.parse(raw)
        const accessToken = text(field(parsed, 'accessToken'))
        const refreshToken = text(field(parsed, 'refreshToken'))
        const expiresAtMs = field(parsed, 'expiresAtMs')
        if (!accessToken || !refreshToken || typeof expiresAtMs !== 'number')
          return null
        return { accessToken, refreshToken, expiresAtMs }
      } catch {
        return null
      }
    },
    write(tokens) {
      try {
        if (tokens == null) storage.removeItem(tokensKey)
        else storage.setItem(tokensKey, JSON.stringify(tokens))
      } catch {
        // A private window, blocked storage: the session lasts the page.
      }
    },
  }
}

export class SimeonAPIError extends Error {
  /** The refusal's own code when the answer names one (`error.code`, e.g. OpenAI's `moderation_blocked`). */
  readonly code?: string
  /** The answer's headers (a Connect refusal's hint, `x-automation-failure-hint`, and its `retry-after`). */
  readonly headers: Record<string, string>

  constructor(
    message: string,
    readonly status: number,
    options: { code?: string; headers?: Record<string, string> } = {},
  ) {
    super(message)
    this.name = 'SimeonAPIError'
    this.code = options.code
    this.headers = options.headers ?? {}
  }

  /** One header of the answer, whatever case it came in. */
  header(name: string): string | undefined {
    return headerOf(this.headers, name)
  }
}

/**
 * Where the API is, from where the page is (desktop/web/api.ts):
 * app.simeonlabs.com talks to api.simeonlabs.com; a page served from
 * loopback to the API a developer runs on 8000; `?api=` overrides both.
 */
export function resolveApiBase(location: {
  readonly hostname: string
  readonly search: string
  readonly protocol: string
}): string {
  const asked = new URLSearchParams(location.search).get('api')
  if (asked != null && /^https?:\/\//.test(asked))
    return asked.replace(/\/+$/, '')
  const host = location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return 'http://127.0.0.1:8000'
  }
  if (host.startsWith('app.'))
    return `${location.protocol}//api.${host.slice(4)}`
  return `${location.protocol}//api.${host}`
}

/** The path without its query, for the recent activity. */
function bare(path: string): string {
  return path.split('?')[0] ?? path
}

export interface SimeonAPIOptions {
  base?: string
  clientVersion: string
  vault: TokenVault
  http?: HTTPClient
  language?: string
  now?: () => number
}

export class SimeonAPI {
  static readonly desktopPrefix = '/desktop/api/'
  static readonly connectService = 'simeon.v1.ComputerService'
  /** How long the account's delete is waited for, in seconds. */
  static readonly deleteTimeout = 300
  /** How many times the server is asked whether the account went, after a delete whose answer never came. */
  static readonly deleteChecks = 6
  /** Statuses that leave the delete's outcome unknown: none, the session refused, a gateway that stopped waiting. */
  static readonly deleteUnsettled = new Set([0, 401, 502, 504])

  readonly base: string
  readonly clientVersion: string
  readonly language: string
  private readonly vault: TokenVault
  private readonly http: HTTPClient
  private readonly now: () => number
  private refreshing: Promise<SessionTokens | null> | null = null
  private onEnded?: () => void
  /** The account is being deleted (`deleteAccount`). */
  private deleting = false

  constructor(options: SimeonAPIOptions) {
    this.base = (options.base ?? defaultAPI).replace(/\/+$/, '')
    this.clientVersion = options.clientVersion
    this.vault = options.vault
    this.http = options.http ?? new FetchClient()
    this.language = options.language ?? currentLanguage()
    this.now = options.now ?? (() => Date.now())
  }

  /** Called when the server ends the session (a spent refresh token, a refused refresh). */
  onSessionEnded(handler: () => void): void {
    this.onEnded = handler
  }

  get isSignedIn(): boolean {
    return this.vault.read() != null
  }

  /** The signed-in account (its token's `sub`), null when signed out: what a kept computer address belongs to. */
  get accountScope(): string | null {
    const tokens = this.vault.read()
    return tokens ? (subjectOfAccessToken(tokens.accessToken) ?? null) : null
  }

  signedIn(pair: TokenPair): void {
    this.vault.write(sessionFrom(pair, this.now()))
  }

  /** The headers the Mac app sends the broker (`sand-client-metadata.ts`), and the app's language. */
  get clientHeaders(): Record<string, string> {
    return {
      'x-simeon-client-type': 'sand',
      [clientVersionHeader]: this.clientVersion,
      'x-sand-box-namespace': 'prod',
      [languageHeader]: this.language,
    }
  }

  private url(path: string): string {
    return this.base + path
  }

  private sessionEnded(): void {
    this.vault.write(null)
    // While the account is being deleted, a call refused because its sessions just went is the delete, not a sign-out.
    if (!this.deleting) this.onEnded?.()
  }

  /** A live access token, refreshed first when the hour is nearly up. Null when signed out. */
  async accessToken(): Promise<string | null> {
    const current = this.vault.read()
    if (!current) return null
    if (!needsRefresh(current, this.now())) return current.accessToken
    const refreshed = await this.refreshOnce(current)
    return refreshed?.accessToken ?? null
  }

  private refreshOnce(current: SessionTokens): Promise<SessionTokens | null> {
    this.refreshing ??= this.refresh(current).finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  /**
   * A call answered 401. Only the server refusing the sign-in itself ends
   * it, so one refresh asks first (28 October 2026: "I keep getting logged
   * out after a while"). A refused refresh signs out; a new pair, or no
   * answer, keeps the person in.
   */
  private async refused(): Promise<void> {
    const current = this.vault.read()
    if (!current) return
    await this.refreshOnce(current)
  }

  private async refresh(current: SessionTokens): Promise<SessionTokens | null> {
    const request = postJSON(
      this.url(refreshPath),
      { grant_type: 'refresh_token', refresh_token: current.refreshToken },
      { [languageHeader]: this.language },
    )
    let answer: HTTPAnswer | undefined
    try {
      answer = await this.http.send(request)
    } catch {
      answer = undefined
    }
    const outcome = readRefreshAnswer(
      answer?.status,
      answer ? answerJSON(answer) : undefined,
      this.now(),
    )
    switch (outcome.kind) {
      case 'refreshed':
        this.vault.write(outcome.tokens)
        return outcome.tokens
      case 'kept':
        return current
      case 'ended':
        this.sessionEnded()
        return null
    }
  }

  private async authorized(request: HTTPRequest): Promise<HTTPRequest> {
    const token = await this.accessToken()
    if (token == null)
      throw new SimeonAPIError(t('Sign in to Simeon first.'), 401)
    return {
      ...request,
      headers: {
        ...request.headers,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...this.clientHeaders,
      },
    }
  }

  /**
   * `request` sent, and noted in the recent activity a report can carry when
   * it fails, is refused or takes over three seconds.
   */
  private async sent(request: HTTPRequest, path: string): Promise<HTTPAnswer> {
    const name = `${request.method} ${bare(path)}`
    const started = this.now()
    try {
      const answer = await this.http.send(request)
      const ms = Math.round(this.now() - started)
      if (!isOk(answer) || ms > 3_000)
        note(`api ${name} ${answer.status} in ${ms} ms`)
      return answer
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      note(
        `api ${name} failed after ${Math.round(this.now() - started)} ms: ${why}`,
      )
      throw error
    }
  }

  /** One `/desktop/api/…` call, in the app's envelope (`{code, data}`). */
  async data(
    path: string,
    options: {
      method?: string
      json?: JSONValue
      timeoutSeconds?: number
    } = {},
  ): Promise<JSONValue> {
    const base: HTTPRequest = {
      url: this.url(SimeonAPI.desktopPrefix + path),
      method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
      headers: {},
      timeoutSeconds: options.timeoutSeconds,
    }
    if (options.json !== undefined) {
      base.body = JSON.stringify(options.json)
      base.headers['content-type'] = 'application/json'
    }
    const answer = await this.sent(await this.authorized(base), path)
    if (answer.status === 401) await this.refused()
    const parsed = answerJSON(answer)
    if (!isOk(answer)) {
      // The refusal's own sentence and code when it has them (`{"error": {"message", "code"}}`,
      // server/simeon/desktop/proxy_common.py), else the app's envelope (`{"code", "message"}`).
      const said = field(parsed, 'error')
      const message =
        text(field(said, 'message')) ?? text(field(parsed, 'message'))
      throw new SimeonAPIError(
        message ??
          `Simeon Labs' server answered ${path} with ${answer.status}.`,
        answer.status,
        { code: text(field(said, 'code')) },
      )
    }
    if (parsed === undefined) {
      throw new SimeonAPIError(
        `Simeon Labs' server answered ${path} with something that is not JSON.`,
        answer.status,
      )
    }
    if (isObject(parsed) && 'code' in parsed) {
      if (int(parsed.code) !== 0) {
        note(`api ${bare(path)} refused with code ${int(parsed.code) ?? 0}`)
        throw new SimeonAPIError(
          text(parsed.message) ?? `Simeon Labs' server refused ${path}.`,
          answer.status,
        )
      }
      return parsed.data ?? null
    }
    return parsed
  }

  /**
   * Dictation (`audio_transcriptions` in server/simeon/desktop/capabilities.py):
   * the recording as OpenAI's multipart `file`, at
   * `/desktop/api/proxy/v1/audio/transcriptions`; what was said comes back as
   * `{text, seconds}`. With the app's language when it is not English.
   */
  async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    const mime = mimeType.split(';')[0]?.trim() || 'audio/webm'
    const boundary = `simeon-${crypto.randomUUID().toLowerCase()}`
    const request = await this.authorized({
      url: this.url(SimeonAPI.desktopPrefix + 'proxy/v1/audio/transcriptions'),
      method: 'POST',
      headers: {},
      body: SimeonAPI.multipartFile(audio, {
        filename: SimeonAPI.audioFilename(mime),
        mimeType: mime,
        boundary,
        language: SimeonAPI.dictationLanguage(this.language),
      }),
    })
    request.headers['content-type'] =
      `multipart/form-data; boundary=${boundary}`
    const answer = await this.http.send(request)
    if (answer.status === 401) await this.refused()
    const parsed = answerJSON(answer)
    if (!isOk(answer)) {
      throw new SimeonAPIError(
        text(field(field(parsed, 'error'), 'message')) ??
          `Simeon Labs' server answered dictation with ${answer.status}.`,
        answer.status,
      )
    }
    return text(field(parsed, 'text')) ?? ''
  }

  /** "audio.webm", "audio.mp4": the type's second part. */
  static audioFilename(mimeType: string): string {
    const subtype = mimeType.split('/')[1] ?? 'webm'
    return `audio.${subtype.split('+')[0] || 'webm'}`
  }

  /** The language dictation is heard in: the two letters OpenAI takes ("fr"), or undefined for English. */
  static dictationLanguage(language: string): string | undefined {
    return isEnglish(language) ? undefined : languageCode(language)
  }

  /** One file as `multipart/form-data`, the field named `file`, after the `language` field when there is one. */
  static multipartFile(
    data: Uint8Array,
    options: {
      filename: string
      mimeType: string
      boundary: string
      language?: string
    },
  ): Uint8Array {
    const encoder = new TextEncoder()
    const head =
      (options.language
        ? `--${options.boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${options.language}\r\n`
        : '') +
      `--${options.boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename}"\r\nContent-Type: ${options.mimeType}\r\n\r\n`
    const parts = [
      encoder.encode(head),
      data,
      encoder.encode(`\r\n--${options.boundary}--\r\n`),
    ]
    const body = new Uint8Array(
      parts.reduce((sum, part) => sum + part.length, 0),
    )
    let at = 0
    for (const part of parts) {
      body.set(part, at)
      at += part.length
    }
    return body
  }

  /** One unary call on the box broker, Connect JSON (`server/simeon/sand/connect.py`). */
  async connect(
    method: string,
    message: JSONValue = {},
    service: string = SimeonAPI.connectService,
  ): Promise<JSONValue> {
    const request = await this.authorized(
      postJSON(this.url(`/${service}/${method}`), message, {
        'connect-protocol-version': '1',
      }),
    )
    const answer = await this.sent(request, method)
    if (answer.status === 401) await this.refused()
    const parsed = answerJSON(answer)
    if (!isOk(answer)) {
      throw new SimeonAPIError(
        text(field(parsed, 'message')) ??
          `Simeon's cloud computer answered ${method} with ${answer.status}.`,
        answer.status,
        { headers: answer.headers },
      )
    }
    return parsed ?? {}
  }

  /** The account: `user_payload()` in server/simeon/desktop/service.py. */
  profile(): Promise<JSONValue> {
    return this.data('user/profile')
  }

  /**
   * Deletes the account and what Simeon keeps for it
   * (`server/simeon/desktop/account_deletion.py`), then forgets the pair.
   * Throws the server's own sentence when a step could not be done. True when
   * a plan bought in the iPhone app runs on (only the person can cancel it,
   * with Apple). The delete can take minutes, so it waits five; if no answer
   * comes, the server is asked whether the account is gone.
   */
  async deleteAccount(
    options: { checkEveryMs?: number } = {},
  ): Promise<boolean> {
    if (this.vault.read() == null)
      throw new SimeonAPIError(t('Sign in to Simeon first.'), 401)
    this.deleting = true
    try {
      try {
        const answer = await this.data('account', {
          method: 'DELETE',
          timeoutSeconds: SimeonAPI.deleteTimeout,
        })
        this.vault.write(null)
        return bool(field(answer, 'appleSubscription')) === true
      } catch (error) {
        // The server answered (a 503 is its own "couldn't be deleted right now"): the account is still there.
        if (
          error instanceof SimeonAPIError &&
          !SimeonAPI.deleteUnsettled.has(error.status)
        ) {
          throw error
        }
        // No answer, a gateway's timeout, or the session already refused: ask.
        if (
          !(await this.accountGone(
            SimeonAPI.deleteChecks,
            options.checkEveryMs ?? 5_000,
          ))
        ) {
          throw error
        }
        this.vault.write(null)
        return false
      }
    } finally {
      this.deleting = false
    }
  }

  /** Whether this sign-in's account is gone: its session refused (401), or its refresh refused. */
  private async accountGone(tries: number, everyMs: number): Promise<boolean> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (attempt > 0)
        await new Promise((resolve) => setTimeout(resolve, everyMs))
      const token = await this.accessToken()
      if (token == null) return true
      try {
        const answer = await this.http.send({
          url: this.url(SimeonAPI.desktopPrefix + 'user/profile'),
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...this.clientHeaders,
          },
        })
        if (answer.status === 401) return true
      } catch {
        // No answer: ask again.
      }
    }
    return false
  }

  /** Signs this session out on the server and forgets the pair. */
  async signOut(): Promise<void> {
    const token = this.vault.read()?.accessToken
    this.vault.write(null)
    if (!token) return
    try {
      await this.http.send({
        url: this.url(SimeonAPI.desktopPrefix + 'auth/logout'),
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          [languageHeader]: this.language,
        },
      })
    } catch {
      // Signed out here either way.
    }
  }

  /**
   * The web's sign-in: trades the website's cookie for the pair
   * (`POST /auth/web-session`, server/simeon/desktop/app_sign_in.py). False
   * when the person is not signed in on the website; the window then sends
   * them to its sign-in page.
   */
  async signInFromCookie(): Promise<boolean> {
    const answer = await this.http.send({
      url: this.url(webSessionPath),
      method: 'POST',
      headers: { accept: 'application/json', [languageHeader]: this.language },
      credentials: 'include',
    })
    if (answer.status === 401) return false
    if (!isOk(answer)) {
      throw new SimeonAPIError(
        `Signing in to Simeon on the web failed (${answer.status}).`,
        answer.status,
      )
    }
    const parsed = answerJSON(answer)
    const accessToken = str(field(parsed, 'accessToken'))
    const refreshToken = str(field(parsed, 'refreshToken'))
    if (!accessToken || !refreshToken) {
      throw new SimeonAPIError(
        'The sign-in answer carried no tokens.',
        answer.status,
      )
    }
    this.signedIn({ accessToken, refreshToken })
    return true
  }
}
