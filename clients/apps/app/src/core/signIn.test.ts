// The shared core's `SignInTests` (ios/SimeonCore/Tests/SimeonCoreTests/CoreTests.swift),
// with the same inputs and answers, and `LanguageTests`' check of the headers
// sent before sign-in; then what the Windows app adds: Cancel stops the poll.

import { describe, expect, it } from 'vitest'
import {
  challenge,
  freshMetadata,
  loginURL,
  maxPollAttempts,
  metadata,
  poll,
  pollDelay,
  serverHeaders,
  sha256,
} from './signIn'
import { ScriptedHTTP, answer } from './testing'
import { base64URL, bytesFromBase64URL } from './tokens'

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const meta = { uuid: 'u', verifier: 'v', challenge: 'c' }
const noWait = async () => {}

describe('SignIn', () => {
  it('hashes as Node does', async () => {
    // node -e 'crypto.createHash("sha256").update("abc").digest("hex")'
    expect(hex(await sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(hex(await sha256(new TextEncoder().encode('a'.repeat(1000))))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    )
  })

  it('makes the Mac’s challenge', async () => {
    // The server's challenge_for, and Node's createHash("sha256").update(verifier, "ascii").digest("base64url").
    expect(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
    expect(base64URL(new Uint8Array([0, 1, 2, 250, 251, 252, 253]))).toBe(
      'AAEC-vv8_Q',
    )
    expect([...(bytesFromBase64URL('AAEC-vv8_Q') ?? [])]).toEqual([
      0, 1, 2, 250, 251, 252, 253,
    ])
  })

  it('makes a verifier of 32 bytes, its challenge and a lower-case uuid', async () => {
    const made = await metadata(
      new Uint8Array(32).map((_, i) => i),
      'A1B2C3D4-0000-4000-8000-00000000000F',
    )
    expect(made.verifier).toBe(base64URL(new Uint8Array(32).map((_, i) => i)))
    expect(made.verifier).toHaveLength(43)
    expect(made.challenge).toBe(await challenge(made.verifier))
    expect(made.uuid).toBe('a1b2c3d4-0000-4000-8000-00000000000f')
    const fresh = await freshMetadata()
    expect(fresh.uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(fresh.verifier).not.toBe((await freshMetadata()).verifier)
  })

  it('opens the login page in the Mac’s order', () => {
    const metadata = { uuid: 'u-1', verifier: 'v', challenge: 'c' }
    expect(loginURL('https://api.simeonlabs.com/', metadata)).toBe(
      'https://api.simeonlabs.com/loginDeepControl?challenge=c&uuid=u-1&mode=login&redirectTarget=simeon-ios',
    )
    // The sign-in screen's buttons name their way in; the server sends the sheet straight to it.
    expect(
      loginURL('https://api.simeonlabs.com', metadata, { provider: 'apple' }),
    ).toBe(
      'https://api.simeonlabs.com/loginDeepControl?challenge=c&uuid=u-1&mode=login&redirectTarget=simeon-ios&provider=apple',
    )
    expect(
      new URL(
        loginURL('https://api.simeonlabs.com', metadata, {
          provider: 'google',
        }),
      ).search.endsWith('&provider=google'),
    ).toBe(true)
    // The Mac's Sign up: the same link in sign-up mode.
    expect(
      loginURL('https://api.simeonlabs.com', metadata, {
        signUp: true,
        redirectTarget: 'simeon',
      }),
    ).toBe(
      'https://api.simeonlabs.com/loginDeepControl?challenge=c&uuid=u-1&mode=signup&redirectTarget=simeon',
    )
  })

  it('polls, waits, then takes the pair', async () => {
    const http = new ScriptedHTTP([
      () => answer(404),
      () => answer(404),
      () => answer(200, '{"accessToken":"a","refreshToken":"r"}'),
    ])
    const outcome = await poll('https://api.example.com', meta, 'ios-1', http, {
      wait: noWait,
      language: 'en',
    })
    expect(outcome).toEqual({
      kind: 'tokens',
      pair: { accessToken: 'a', refreshToken: 'r' },
    })
    expect(http.sent).toHaveLength(3)
    const first = http.sent[0]!
    expect(first.url).toBe('https://api.example.com/auth/poll')
    expect(first.method).toBe('POST')
    // The verifier goes in the body, never the query string.
    expect(new URL(first.url).search).toBe('')
    expect(JSON.parse(String(first.body))).toEqual({ uuid: 'u', verifier: 'v' })
    expect(first.headers['x-simeon-client-version']).toBe('ios-1')
  })

  it('gives up after three errors in a row, and hears a refusal', async () => {
    const errors = new ScriptedHTTP([
      () => answer(500),
      () => answer(502),
      () => answer(503),
    ])
    expect(
      await poll('https://x', meta, '1', errors, { wait: noWait }),
    ).toEqual({ kind: 'gaveUp' })
    const refused = new ScriptedHTTP([
      () => answer(403, '{"error":"sign_in_policy_violation"}'),
    ])
    expect(
      await poll('https://x', meta, '1', refused, { wait: noWait }),
    ).toEqual({ kind: 'refused' })
    // A 404 between errors starts the count again; a 200 without a pair gives up.
    const mixed = new ScriptedHTTP([
      () => answer(500),
      () => answer(500),
      () => answer(404),
      () => answer(500),
      () => answer(200, '{"accessToken":"a"}'),
    ])
    expect(await poll('https://x', meta, '1', mixed, { wait: noWait })).toEqual(
      {
        kind: 'gaveUp',
      },
    )
    expect(mixed.sent).toHaveLength(5)
  })

  it('waits as the Mac does', () => {
    expect(pollDelay(0)).toBe(1)
    expect(pollDelay(1)).toBeCloseTo(1.2, 9)
    expect(pollDelay(40)).toBe(10)
    expect(maxPollAttempts).toBe(150)
    // About 24 minutes in all: 13 growing waits, then 10 s each.
    let seconds = 0
    for (let attempt = 0; attempt < maxPollAttempts; attempt++)
      seconds += pollDelay(attempt)
    expect(Math.round(seconds / 60)).toBe(24)
  })

  it('gives up after 150 tries', async () => {
    const http = new ScriptedHTTP(
      Array.from({ length: 200 }, () => () => answer(404)),
    )
    expect(await poll('https://x', meta, '1', http, { wait: noWait })).toEqual({
      kind: 'gaveUp',
    })
    expect(http.sent).toHaveLength(150)
  })

  it('stops at once on Cancel', async () => {
    const stop = new AbortController()
    const waits: number[] = []
    const http = new ScriptedHTTP(
      Array.from({ length: 10 }, () => () => answer(404)),
    )
    const outcome = await poll('https://x', meta, '1', http, {
      signal: stop.signal,
      wait: async (seconds) => {
        waits.push(seconds)
        if (waits.length === 2) stop.abort()
      },
    })
    expect(outcome).toEqual({ kind: 'stopped' })
    expect(http.sent).toHaveLength(2)
  })

  it('names the app and its language before sign-in', () => {
    expect(serverHeaders('2', 'en')).toEqual({
      'x-simeon-client-version': '2',
      'accept-language': 'en',
    })
  })
})
