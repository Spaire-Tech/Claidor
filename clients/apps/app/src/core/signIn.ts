// Signing in through the browser (ios/SimeonCore/Sources/SimeonCore/SignIn.swift):
// the Mac app's own sign-in, byte for byte, as the server serves it
// (server/simeon/desktop/app_sign_in.py). The Windows app signs in this way
// (the Mac's `MacSession.signIn`); the web trades the website's cookie.
//
// 1. A verifier only the app holds: 32 random bytes, base64url, unpadded.
//    The challenge is base64url(sha256(verifier)), the hash over the
//    verifier's ASCII text. The uuid is a v4 uuid.
// 2. The default browser opens
//    `{api}/loginDeepControl?challenge=…&uuid=…&mode=login&redirectTarget=simeon`.
// 3. Meanwhile the app posts `{uuid, verifier}` to `/auth/poll`: 404 is
//    "not yet", 200 carries `{accessToken, refreshToken}`. The Mac's
//    backoff: 1 s growing by 1.2 to 10 s, three errors in a row give up,
//    150 tries at most.

import { clientVersionHeader, languageHeader } from './api'
import { type HTTPClient, answerJSON, isOk, postJSON } from './http'
import { field, text } from './json'
import { currentLanguage } from './language'
import { type TokenPair, base64URL } from './tokens'

/** Where Simeon is, and how the apps name themselves (`SimeonConfig`). */
export const simeonConfig = {
  defaultAPI: 'https://api.simeonlabs.com',
  /** The iPhone's own scheme: a confirm page meant for one app would otherwise wake the other. */
  urlScheme: 'simeon-ios',
  /** The desktop apps' scheme, the Mac's and the Windows app's: `simeon`. */
  macURLScheme: 'simeon',
} as const

/** The headers of a request to the server before sign-in: the app's version and its language (`SimeonConfig.serverHeaders`). */
export function serverHeaders(
  clientVersion: string,
  language: string = currentLanguage(),
): Record<string, string> {
  return { [clientVersionHeader]: clientVersion, [languageHeader]: language }
}

export const loginPath = '/loginDeepControl'
export const pollPath = '/auth/poll'
export const maxPollAttempts = 150

/** The sign-in screen's ways in on the iPhone; the Mac and Windows name none. */
export type Provider = 'apple' | 'google'

export interface Metadata {
  uuid: string
  verifier: string
  challenge: string
}

/** sha256 over bytes (`PlainSHA256.hash`), by the system's own (`crypto.subtle`). */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return new Uint8Array(digest)
}

/** base64url(sha256(verifier)), the hash over the verifier's ASCII text. */
export async function challenge(verifier: string): Promise<string> {
  return base64URL(await sha256(new TextEncoder().encode(verifier)))
}

export async function metadata(
  randomBytes: Uint8Array,
  uuid: string = crypto.randomUUID(),
): Promise<Metadata> {
  const verifier = base64URL(randomBytes)
  return {
    uuid: uuid.toLowerCase(),
    verifier,
    challenge: await challenge(verifier),
  }
}

export function freshMetadata(): Promise<Metadata> {
  return metadata(crypto.getRandomValues(new Uint8Array(32)))
}

/** The address with no slash at its end. */
function trimmed(base: string): string {
  return base.replace(/\/+$/, '')
}

/**
 * The page the browser opens, in the Mac's parameter order, then the way
 * in. Every value is base64url, a uuid or a fixed word, so nothing needs
 * escaping. Sign up (the Mac's second button): the web app's sign-up page
 * instead of its sign-in.
 */
export function loginURL(
  api: string,
  metadata: Metadata,
  options: {
    provider?: Provider
    signUp?: boolean
    redirectTarget?: string
  } = {},
): string {
  const way = options.provider ? `&provider=${options.provider}` : ''
  const mode = options.signUp ? 'signup' : 'login'
  const target = options.redirectTarget ?? simeonConfig.urlScheme
  return `${trimmed(api)}${loginPath}?challenge=${metadata.challenge}&uuid=${metadata.uuid}&mode=${mode}&redirectTarget=${target}${way}`
}

/** The wait before the next poll, in seconds, as the Mac's `pollAuthenticationStatus` has it. */
export function pollDelay(attempt: number): number {
  return Math.min(1.2 ** attempt, 10)
}

export type Outcome =
  | { kind: 'tokens'; pair: TokenPair }
  /** Three errors in a row, 150 tries, or a 200 that carried no pair. */
  | { kind: 'gaveUp' }
  /** The person stopped it (Cancel). */
  | { kind: 'stopped' }
  /** The server's sign-in policy refused this account (403 `sign_in_policy_violation`). */
  | { kind: 'refused' }

/** The pair a 200 carries (`TokenPair(json)`): both tokens, neither empty. */
export function tokenPairFrom(json: unknown): TokenPair | undefined {
  const accessToken = text(field(json, 'accessToken'))
  const refreshToken = text(field(json, 'refreshToken'))
  return accessToken && refreshToken ? { accessToken, refreshToken } : undefined
}

function sleep(seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal?.aborted) return done()
    const timer = setTimeout(done, seconds * 1000)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        done()
      },
      { once: true },
    )
  })
}

/**
 * Polls until the person confirms. The verifier goes in the body, never
 * the query string, so it is not written to an access log. `signal` is
 * the person's Cancel: the poll stops at once, its request too.
 */
export async function poll(
  api: string,
  meta: Metadata,
  clientVersion: string,
  http: HTTPClient,
  options: {
    signal?: AbortSignal
    wait?: (seconds: number) => Promise<void>
    maxAttempts?: number
    language?: string
  } = {},
): Promise<Outcome> {
  const { signal } = options
  const wait = options.wait ?? ((seconds) => sleep(seconds, signal))
  const maxAttempts = options.maxAttempts ?? maxPollAttempts
  const url = trimmed(api) + pollPath
  let consecutiveErrors = 0
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) return { kind: 'stopped' }
    try {
      const request = postJSON(
        url,
        { uuid: meta.uuid, verifier: meta.verifier },
        serverHeaders(clientVersion, options.language),
      )
      const answer = await http.send(request, signal)
      if (signal?.aborted) return { kind: 'stopped' }
      if (answer.status === 404) {
        consecutiveErrors = 0
      } else if (answer.status === 403) {
        if (
          text(field(answerJSON(answer), 'error')) ===
          'sign_in_policy_violation'
        )
          return { kind: 'refused' }
        consecutiveErrors += 1
        if (consecutiveErrors >= 3) return { kind: 'gaveUp' }
      } else if (!isOk(answer)) {
        consecutiveErrors += 1
        if (consecutiveErrors >= 3) return { kind: 'gaveUp' }
      } else {
        const pair = tokenPairFrom(answerJSON(answer))
        return pair ? { kind: 'tokens', pair } : { kind: 'gaveUp' }
      }
    } catch {
      if (signal?.aborted) return { kind: 'stopped' }
      consecutiveErrors += 1
      if (consecutiveErrors >= 3) return { kind: 'gaveUp' }
    }
    await wait(pollDelay(attempt))
  }
  return { kind: 'gaveUp' }
}
