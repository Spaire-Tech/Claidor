// The sign-in's token pair (ios/SimeonCore/Sources/SimeonCore/Tokens.swift).
// The refresh token rotates: each `/oauth/token` answer spends the one it was
// given, so exactly one party refreshes, and here that is the app itself
// (`SimeonAPI`).

import { bool, field, str, text } from './json'

/** What a sign-in hands over (`/auth/poll`, `/auth/web-session`). */
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/** The pair as the app keeps it. */
export interface SessionTokens extends TokenPair {
  /** Milliseconds since the epoch; the envelope's `exp`, else an hour from issue. */
  expiresAtMs: number
}

export const refreshPath = '/oauth/token'
/** Refresh with five minutes left, as the Mac does. */
export const refreshAheadMs = 5 * 60_000

/** Bytes from base64url (padding optional). */
export function bytesFromBase64URL(value: string): Uint8Array | undefined {
  const plain = value.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(plain)) return undefined
  try {
    const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4))
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

/** base64url, unpadded. */
export function base64URL(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The claims inside the envelope the server wraps the access token in (`envelope_access_token`). */
function claimsOf(token: string): unknown {
  const parts = token.replace(/^[a-z_]+_da_/, '').split('.')
  if (parts.length < 2) return undefined
  const bytes = bytesFromBase64URL(parts[1] ?? '')
  if (!bytes) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

/** The access token's `exp` in milliseconds; an hour from now when it carries none. */
export function expiryOfAccessToken(token: string, nowMs: number): number {
  const exp = field(claimsOf(token), 'exp')
  if (typeof exp === 'number' && Number.isFinite(exp)) return exp * 1000
  return nowMs + 60 * 60_000
}

/** The account the access token is for: its envelope's `sub`, undefined for a token that is not one. */
export function subjectOfAccessToken(token: string): string | undefined {
  return text(field(claimsOf(token), 'sub'))
}

export function sessionFrom(pair: TokenPair, nowMs: number): SessionTokens {
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    expiresAtMs: expiryOfAccessToken(pair.accessToken, nowMs),
  }
}

export function needsRefresh(session: SessionTokens, nowMs: number): boolean {
  return nowMs >= session.expiresAtMs - refreshAheadMs
}

export type RefreshOutcome =
  | { kind: 'refreshed'; tokens: SessionTokens }
  /** The server ended the session: sign in again. */
  | { kind: 'ended' }
  /** Offline, a deploy, a 429: keep the pair and try again later. */
  | { kind: 'kept' }

/**
 * The server's answer, read the way the Mac reads it: 200 with `shouldLogout`
 * for a spent token, a non-2xx only for a malformed request, 5xx and 429 for
 * "not now".
 */
export function readRefreshAnswer(
  status: number | undefined,
  body: unknown,
  nowMs: number,
): RefreshOutcome {
  if (status == null || status >= 500 || status === 429) return { kind: 'kept' }
  if (status < 200 || status >= 300) return { kind: 'ended' }
  const access = str(field(body, 'access_token'))
  const refresh = str(field(body, 'refresh_token'))
  if (
    bool(field(body, 'shouldLogout')) === true ||
    access == null ||
    refresh == null
  ) {
    return { kind: 'ended' }
  }
  return {
    kind: 'refreshed',
    tokens: sessionFrom({ accessToken: access, refreshToken: refresh }, nowMs),
  }
}
